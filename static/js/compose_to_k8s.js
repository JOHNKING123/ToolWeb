/* Docker Compose → K8s YAML 转换器：纯前端、零依赖、零后端、零上传
 * 引擎：手写 YAML 解析子集（缩进块、标量、单/双引号、列表、内联映射首对、# 注释）＋
 *   compose 服务字段映射子集（image/ports/volumes/environment/depends_on）＋
 *   Deployment（apps/v1）/ Service（v1）YAML 生成（2 空格缩进，键顺序锁定）。
 * 字段映射子集：
 *   image（必填）／ports（"8080:80" → Deployment containerPort 80，
 *     Service NodePort port/targetPort=80、nodePort=8080；无 published 端口 → ClusterIP）／
 *   volumes（"./data:/app/data" → volumeMounts ＋ volumes hostPath 原样，
 *     附 warnings 提示生产改用 PVC）／environment（KEY=VAL → env 列表，值一律加引号）／
 *   depends_on（仅记 warnings，不建 initContainer）。
 * 超出子集的字段（networks/build/secrets/configs/healthcheck/deploy 等）一律进
 *   warnings 诊断列表，不静默丢弃。
 * 纯逻辑部分（CK8S）在 node 下可单元测试：node tests/compose_to_k8s.test.js
 */
(function () {
"use strict";

/* ================= 1. 基础辅助 ================= */

/* 抛字段错误：err.field 命名违规字段 */
function fieldError(field, message) {
    var e = new Error(message);
    e.field = field;
    return e;
}

/* K8s 资源名清洗：小写、非法字符转 -、首尾 - 去掉 */
function k8sName(raw) {
    var s = String(raw || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return s || "app";
}

/* YAML 双引号标量：转义 \ 与 "，控制字符转 \n 等 */
function yamlDQ(s) {
    var out = "";
    s = String(s);
    for (var i = 0; i < s.length; i++) {
        var ch = s[i], code = s.charCodeAt(i);
        if (ch === "\\") out += "\\\\";
        else if (ch === '"') out += '\\"';
        else if (ch === "\n") out += "\\n";
        else if (ch === "\r") out += "\\r";
        else if (ch === "\t") out += "\\t";
        else if (code < 32 || code === 127) out += "\\x" + ("0" + code.toString(16)).slice(-2);
        else out += ch;
    }
    return '"' + out + '"';
}

/* YAML 普通标量：安全时不加引号，否则双引号 */
function yamlScalar(s) {
    s = String(s);
    if (/^[A-Za-z0-9][A-Za-z0-9._\/:@-]*$/.test(s) && s.indexOf(": ") === -1 && s.charAt(s.length - 1) !== ":") {
        return s;
    }
    return yamlDQ(s);
}

function asArray(v) {
    if (v === null || v === undefined) return [];
    return Array.isArray(v) ? v : [v];
}

function portNum(s) {
    if (/^\d+$/.test(String(s))) return parseInt(s, 10);
    return String(s);
}

/* ================= 2. YAML 解析子集 =================
 * 支持：缩进块（map/array 嵌套）、- 列表项、内联映射首对（- target: 80）、
 *   单/双引号标量、行内 # 注释（引号内 # 保留）、空行跳过。
 * 不支持：锚点/别名(&/*)、多行字面量(|/>)、flow 风格({}/[])、制表符缩进——
 *   遇到时记 warnings，不猜测语义。
 */

function stripComment(line) {
    var inS = false, inD = false;
    for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (ch === "'" && !inD) { inS = !inS; }
        else if (ch === '"' && !inS) {
            var bs = 0, j = i - 1;
            while (j >= 0 && line[j] === "\\") { bs++; j--; }
            if (bs % 2 === 0) inD = !inD;
        }
        else if (ch === "#" && !inS && !inD && (i === 0 || line[i - 1] === " " || line[i - 1] === "\t")) {
            return line.slice(0, i);
        }
    }
    return line;
}

function unquoteScalar(s) {
    s = String(s).trim();
    if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
        return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\")
            .replace(/\\n/g, "\n").replace(/\\t/g, "\t");
    }
    if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") {
        return s.slice(1, -1).replace(/''/g, "'");
    }
    return s;
}

/* 在首个「: ＋空格」或行尾 : 处切分 key: value；否则返回 null */
function splitKeyVal(text) {
    var inS = false, inD = false;
    for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        if (ch === "'" && !inD) { inS = !inS; }
        else if (ch === '"' && !inS) { inD = !inD; }
        else if (ch === ":" && !inS && !inD) {
            if (i === text.length - 1 || text[i + 1] === " " || text[i + 1] === "\t") {
                return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
            }
        }
    }
    return null;
}

function isListItem(text) {
    return text === "-" || text.indexOf("- ") === 0;
}

function parseYamlSubset(text, warnings) {
    var lines = [];
    String(text).split(/\r?\n/).forEach(function (rl) {
        if (/\t/.test(rl) && rl.trim()) {
            warnings.push("YAML 第 " + (lines.length + 1) + " 行含制表符缩进：YAML 规范要求空格缩进，已按原样尝试解析，缩进错乱时请改为空格。");
        }
        var noComment = stripComment(rl);
        if (!noComment.trim()) return;
        var m = noComment.match(/^ */);
        lines.push({ indent: m ? m[0].length : 0, text: noComment.trim() });
    });
    var pos = 0;
    function peek() { return pos < lines.length ? lines[pos] : null; }

    function parseBlock(minIndent) {
        var first = peek();
        if (!first) return {};
        var node = isListItem(first.text) ? [] : {};
        while (true) {
            var ln = peek();
            if (!ln || ln.indent !== minIndent) break;
            pos++;
            var t = ln.text;
            if (isListItem(t)) {
                var item = t === "-" ? "" : t.slice(2).trim();
                var kv = splitKeyVal(item);
                if (kv && kv[0]) {
                    /* 内联映射首对：- target: 80（长语法端口/挂载用） */
                    var m = {};
                    m[kv[0]] = kv[1] === "" ? null : unquoteScalar(kv[1]);
                    var child = peek();
                    if (child && child.indent > minIndent) {
                        var sub = parseBlock(child.indent);
                        for (var k in sub) { if (sub.hasOwnProperty(k)) m[k] = sub[k]; }
                    }
                    node.push(m);
                } else if (/^[{[]/.test(item)) {
                    warnings.push("不支持 flow 风格（{}/[]）：第 " + (pos) + " 行「" + item.slice(0, 40) + "」未解析为结构，已按原字符串保留。");
                    node.push(unquoteScalar(item));
                } else {
                    node.push(unquoteScalar(item));
                }
            } else {
                var kv2 = splitKeyVal(t);
                if (!kv2 || !kv2[0]) {
                    warnings.push("无法解析的行已跳过：第 " + pos + " 行「" + t.slice(0, 60) + "」。");
                    continue;
                }
                var key = kv2[0], val = kv2[1];
                if (/^[&*]/.test(val) || /^[|>]/.test(val)) {
                    warnings.push("不支持 YAML 高级写法（锚点/别名/多行字面量）：键「" + key + "」的值未解析，已记为 null，请改写为普通键值。");
                    node[key] = null;
                    continue;
                }
                if (val === "") {
                    var child2 = peek();
                    if (child2 && child2.indent > minIndent) {
                        node[key] = parseBlock(child2.indent);
                    } else {
                        node[key] = null;
                    }
                } else {
                    node[key] = unquoteScalar(val);
                }
            }
        }
        return node;
    }

    if (!lines.length) return {};
    return parseBlock(lines[0].indent);
}

/* ================= 3. compose 结构提取 ================= */

var KNOWN_SERVICE_FIELDS = { image: 1, ports: 1, volumes: 1, environment: 1, depends_on: 1 };
var KNOWN_TOP_FIELDS = { services: 1 };

/* 端口短语法："8080:80" / "80" / "127.0.0.1:8080:80" / "53:53/udp" */
function parsePortString(s) {
    var proto = "TCP";
    var m = String(s).match(/^(.*?)\s*\/\s*(tcp|udp)\s*$/i);
    if (m) { s = m[1]; proto = m[2].toUpperCase(); }
    var parts = String(s).split(":");
    if (parts.length === 1) {
        return { published: null, target: parts[0], protocol: proto };
    }
    if (parts.length === 2) {
        return { published: parts[0] || null, target: parts[1], protocol: proto };
    }
    /* ip:published:target */
    return { published: parts[1] || null, target: parts[2], protocol: proto, ip: parts[0] };
}

/* 挂载短语法："./data:/app/data[:ro]"（兼容 Windows 盘符 C:\data:/app） */
function parseVolumeString(s) {
    var str = String(s);
    var head = "";
    var dm = str.match(/^([A-Za-z]:[\\/])/);
    if (dm) { head = dm[1]; str = str.slice(head.length); }
    var parts = str.split(":");
    return {
        raw: s,
        source: head + (parts[0] || ""),
        target: parts.length > 1 ? parts[1] : "",
        readOnly: parts.length > 2 && /^ro$/i.test(parts[2])
    };
}

/* 环境变量：KEY=VAL 字符串／{KEY: VAL} 映射／裸 KEY */
function parseEnvItem(item, svcName, warnings) {
    if (item !== null && typeof item === "object") {
        var out = [];
        Object.keys(item).forEach(function (k) {
            var v = item[k];
            out.push({ name: k, value: v === null || v === undefined ? "" : String(v) });
        });
        return out;
    }
    var str = String(item);
    var eq = str.indexOf("=");
    if (eq < 0) {
        warnings.push("服务 " + svcName + " 的环境变量「" + str + "」只有键没有值（裸 KEY），已保留为空字符串，未编造值。");
        return [{ name: str, value: "" }];
    }
    return [{ name: str.slice(0, eq), value: str.slice(eq + 1) }];
}

function extractService(name, raw, warnings, errors) {
    var svc = { name: name, image: null, ports: [], volumes: [], environment: {}, depends_on: [] };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        errors.push("服务 " + name + " 的定义不是映射：请写成「" + name + ":」下缩进字段的形式。");
        return svc;
    }
    Object.keys(raw).forEach(function (k) {
        if (!KNOWN_SERVICE_FIELDS[k]) {
            warnings.push("服务 " + name + " 的字段「" + k + "」不在映射子集内，未转换进 K8s YAML（如 build/networks/secrets/configs/healthcheck/deploy 等复杂特性不保证 1:1，请手动对应）。");
        }
    });
    if (raw.image !== null && raw.image !== undefined && String(raw.image).trim() !== "") {
        svc.image = String(raw.image).trim();
    } else {
        errors.push("服务 " + name + " 缺少必填字段 image：无法生成 Deployment，请补上镜像名。");
    }

    asArray(raw.ports).forEach(function (p) {
        if (p !== null && typeof p === "object") {
            /* 长语法：{target, published, protocol} */
            var pub = p.published !== undefined && p.published !== null ? String(p.published) : null;
            var tgt = p.target !== undefined && p.target !== null ? String(p.target) : null;
            if (!tgt) {
                warnings.push("服务 " + name + " 有一条长语法端口缺少 target，已跳过该条。");
                return;
            }
            svc.ports.push({ published: pub, target: tgt, protocol: String(p.protocol || "TCP").toUpperCase() });
        } else if (String(p).trim() !== "") {
            var pp = parsePortString(String(p).trim());
            if (pp.ip) {
                warnings.push("服务 " + name + " 的端口「" + p + "」含 IP 绑定（" + pp.ip + "）：K8s Service 无 IP 绑定语义，已忽略 IP 只取 published/target。");
            }
            delete pp.ip;
            svc.ports.push(pp);
        }
    });

    asArray(raw.volumes).forEach(function (v) {
        var vv;
        if (v !== null && typeof v === "object") {
            vv = { raw: JSON.stringify(v), source: v.source ? String(v.source) : "", target: v.target ? String(v.target) : "", readOnly: !!v.read_only };
        } else if (String(v).trim() !== "") {
            vv = parseVolumeString(String(v).trim());
        } else { return; }
        svc.volumes.push(vv);
        var namedVol = !/^[./\\]/.test(vv.source) && vv.source.indexOf("/") === -1 && vv.source.indexOf("\\") === -1;
        warnings.push("服务 " + name + " 的挂载「" + vv.raw + "」已按 hostPath 原样映射" +
            (namedVol ? "（命名卷在 K8s 中无 hostPath 等价语义）" : "") +
            "：hostPath 仅适合单机/测试，生产环境请改用 PVC（PersistentVolumeClaim）。");
    });

    var envObj = raw.environment;
    if (envObj !== null && envObj !== undefined) {
        if (Array.isArray(envObj)) {
            envObj.forEach(function (item) {
                parseEnvItem(item, name, warnings).forEach(function (e) { svc.environment[e.name] = e.value; });
            });
        } else if (typeof envObj === "object") {
            Object.keys(envObj).forEach(function (k) {
                var v = envObj[k];
                svc.environment[k] = (v === null || v === undefined) ? "" : String(v);
            });
        } else {
            warnings.push("服务 " + name + " 的 environment 不是列表/映射，已忽略。");
        }
    }

    var dep = raw.depends_on;
    if (dep !== null && dep !== undefined) {
        var depList = Array.isArray(dep) ? dep.map(String) : Object.keys(dep).map(String);
        if (depList.length) {
            svc.depends_on = depList;
            warnings.push("服务 " + name + " 的 depends_on（" + depList.join("、") + "）仅做记录：K8s 不保证 Pod 启动顺序，未生成 initContainer，如需顺序请手动编排。");
        }
    }
    return svc;
}

/* 解析 compose 文本 → {services, warnings, errors}
 * services 元素：{name, image, ports[], volumes[], environment{}, depends_on[]}。
 * 非字符串/空文本抛 Error（err.field='text'）；内容级问题进 errors 数组。 */
function parseCompose(text) {
    if (typeof text !== "string" || !text.trim()) {
        throw fieldError("text", "输入为空：请粘贴 docker-compose.yml 文本。");
    }
    var warnings = [], errors = [];
    var doc = parseYamlSubset(text, warnings);
    Object.keys(doc).forEach(function (k) {
        if (!KNOWN_TOP_FIELDS[k]) {
            warnings.push("顶层字段「" + k + "」不在映射子集内，未转换进 K8s YAML（version 等顶层段请手动处理）。");
        }
    });
    var services = [];
    var rawServices = doc.services;
    if (rawServices === null || rawServices === undefined) {
        errors.push("未找到顶层 services: 段：请粘贴含 services 的 docker-compose.yml 文本。");
    } else if (typeof rawServices !== "object" || Array.isArray(rawServices)) {
        errors.push("services: 段不是映射：请写成「services:」下每个服务名缩进一层的形式。");
    } else {
        Object.keys(rawServices).forEach(function (name) {
            services.push(extractService(name, rawServices[name], warnings, errors));
        });
        if (!services.length) {
            errors.push("services: 段下没有任何服务定义。");
        }
    }
    return { services: services, warnings: warnings, errors: errors };
}

/* ================= 4. Deployment 生成 =================
 * 键顺序锁定：apiVersion/kind/metadata/spec/replicas/selector/template；
 * 2 空格缩进；无 image 抛 Error（err.field='image'）。 */

function buildDeployment(service) {
    if (!service || typeof service !== "object") {
        throw fieldError("service", "service 参数非法：需要服务结构对象。");
    }
    var name = k8sName(service.name);
    var image = service.image;
    if (image === null || image === undefined || !String(image).trim()) {
        throw fieldError("image", "缺少 image：Deployment 必须指定容器镜像。");
    }
    var L = [];
    L.push("apiVersion: apps/v1");
    L.push("kind: Deployment");
    L.push("metadata:");
    L.push("  name: " + name);
    L.push("  labels:");
    L.push("    app: " + name);
    L.push("spec:");
    L.push("  replicas: 1");
    L.push("  selector:");
    L.push("    matchLabels:");
    L.push("      app: " + name);
    L.push("  template:");
    L.push("    metadata:");
    L.push("      labels:");
    L.push("        app: " + name);
    L.push("    spec:");
    L.push("      containers:");
    L.push("        - name: " + name);
    L.push("          image: " + yamlScalar(String(image).trim()));

    var ports = asArray(service.ports);
    if (ports.length) {
        L.push("          ports:");
        ports.forEach(function (p) {
            L.push("            - containerPort: " + portNum(p.target));
        });
    }
    var envKeys = Object.keys(service.environment || {});
    if (envKeys.length) {
        L.push("          env:");
        envKeys.forEach(function (k) {
            L.push("            - name: " + k);
            L.push("              value: " + yamlDQ(service.environment[k]));
        });
    }
    var vols = asArray(service.volumes);
    if (vols.length) {
        L.push("          volumeMounts:");
        vols.forEach(function (v, idx) {
            var vn = name + "-vol-" + idx;
            L.push("            - name: " + vn);
            L.push("              mountPath: " + (v.target || v.source));
            if (v.readOnly) L.push("              readOnly: true");
        });
    }
    if (vols.length) {
        L.push("      volumes:");
        vols.forEach(function (v, idx) {
            var vn = name + "-vol-" + idx;
            L.push("        - name: " + vn);
            L.push("          hostPath:");
            L.push("            path: " + (v.source || "."));
        });
    }
    return L.join("\n") + "\n";
}

/* ================= 5. Service 生成 =================
 * 有 published 端口 → NodePort；无 → ClusterIP。 */

function buildService(service) {
    if (!service || typeof service !== "object") {
        throw fieldError("service", "service 参数非法：需要服务结构对象。");
    }
    var name = k8sName(service.name);
    var ports = asArray(service.ports);
    var hasPublished = ports.some(function (p) { return p.published !== null && p.published !== undefined; });
    var L = [];
    L.push("apiVersion: v1");
    L.push("kind: Service");
    L.push("metadata:");
    L.push("  name: " + name);
    L.push("  labels:");
    L.push("    app: " + name);
    L.push("spec:");
    L.push("  type: " + (hasPublished ? "NodePort" : "ClusterIP"));
    L.push("  selector:");
    L.push("    app: " + name);
    L.push("  ports:");
    if (ports.length) {
        ports.forEach(function (p) {
            L.push("    - port: " + portNum(p.target));
            L.push("      targetPort: " + portNum(p.target));
            if (p.published !== null && p.published !== undefined) {
                L.push("      nodePort: " + portNum(p.published));
            }
            L.push("      protocol: " + (p.protocol || "TCP"));
        });
    } else {
        /* 无端口声明时给一个占位注释，避免生成空 ports 段 */
        L.push("    # compose 未声明 ports：请按需补 port/targetPort");
    }
    return L.join("\n") + "\n";
}

/* ================= 6. 组合与文件名 ================= */

/* composeToK8s(text) → {results:[{name, deployment, service}], warnings, errors} */
function composeToK8s(text) {
    var p = parseCompose(text);
    var results = [];
    p.services.forEach(function (s) {
        try {
            results.push({ name: s.name, deployment: buildDeployment(s), service: buildService(s) });
        } catch (e) {
            p.errors.push("服务 " + s.name + " 生成失败：" + e.message);
        }
    });
    return { results: results, warnings: p.warnings, errors: p.errors };
}

function pad2(n) { return (n < 10 ? "0" : "") + n; }

/* buildK8sDownloadName(serviceName[, when]) → k8s_<name>_YYYYMMDD_HHmmss.yaml */
function buildK8sDownloadName(serviceName, when) {
    var d = when instanceof Date ? when : new Date();
    return "k8s_" + k8sName(serviceName) + "_" +
        d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + "_" +
        pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()) + ".yaml";
}

/* 合并下载内容：Deployment/Service 文档以 --- 分隔 */
function buildK8sMerged(results) {
    var docs = [];
    (results || []).forEach(function (r) {
        docs.push("# ===== " + r.name + " · Deployment =====\n" + r.deployment.trim());
        docs.push("# ===== " + r.name + " · Service =====\n" + r.service.trim());
    });
    return docs.join("\n---\n") + "\n";
}

/* 示例 compose（载入后可再编辑，请按需改写） */
var SAMPLES = [
    {
        name: "nginx 单服务：端口＋挂载＋环境变量",
        text: "services:\n" +
            "  web:\n" +
            "    image: nginx:alpine\n" +
            "    ports:\n" +
            "      - \"8080:80\"\n" +
            "    volumes:\n" +
            "      - ./html:/usr/share/nginx/html:ro\n" +
            "    environment:\n" +
            "      - NGINX_HOST=example.com\n" +
            "      - NGINX_PORT=80\n"
    },
    {
        name: "多服务：api＋db，depends_on 与超子集字段",
        text: "services:\n" +
            "  api:\n" +
            "    image: myorg/api:1.2.0\n" +
            "    ports:\n" +
            "      - \"3000\"\n" +
            "    environment:\n" +
            "      NODE_ENV: production\n" +
            "      DB_HOST: db\n" +
            "    depends_on:\n" +
            "      - db\n" +
            "    deploy:\n" +
            "      replicas: 3\n" +
            "  db:\n" +
            "    image: postgres:16\n" +
            "    environment:\n" +
            "      POSTGRES_PASSWORD: s3cret\n" +
            "    volumes:\n" +
            "      - pgdata:/var/lib/postgresql/data\n" +
            "    healthcheck:\n" +
            "      test: pg_isready\n"
    }
];

var CK8S = {
    parseCompose: parseCompose,
    buildDeployment: buildDeployment,
    buildService: buildService,
    composeToK8s: composeToK8s,
    buildK8sDownloadName: buildK8sDownloadName,
    buildK8sMerged: buildK8sMerged,
    parsePortString: parsePortString,
    parseVolumeString: parseVolumeString,
    k8sName: k8sName,
    yamlDQ: yamlDQ,
    yamlScalar: yamlScalar,
    samples: SAMPLES
};

/* ================= 7. 浏览器 UI ================= */

function $(id) { return document.getElementById(id); }

function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

var uiState = { results: [], active: 0, tab: "deployment" };
var initialInput = "";
var toastTimer = null;

function toast(msg) {
    var el = $("k8s-toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2400);
}

function activeResult() {
    return uiState.results[uiState.active] || null;
}

function activeYaml() {
    var r = activeResult();
    if (!r) return "";
    return uiState.tab === "service" ? r.service : r.deployment;
}

function renderDiag(warnings, errors) {
    var box = $("k8s-diag");
    var html = "";
    if (errors.length) {
        html += '<div class="k8s-diag k8s-err"><b>解析错误（' + errors.length + "）——暂不输出 YAML</b><ul>";
        errors.forEach(function (e) { html += "<li>" + esc(e) + "</li>"; });
        html += "</ul></div>";
    }
    if (warnings.length) {
        html += '<div class="k8s-diag k8s-warnbox"><b>诊断提示（' + warnings.length + "）——未静默丢弃任何字段</b><ul>";
        warnings.forEach(function (w) { html += "<li>" + esc(w) + "</li>"; });
        html += "</ul></div>";
    }
    if (!html) {
        html = '<div class="k8s-empty">解析顺利：全部字段均在映射子集内，无诊断信息。</div>';
    }
    box.innerHTML = html;
}

function renderServices() {
    var box = $("k8s-services");
    if (!uiState.results.length) {
        box.innerHTML = '<span class="k8s-empty">暂无服务。</span>';
        return;
    }
    var html = "";
    uiState.results.forEach(function (r, idx) {
        html += '<button type="button" class="k8s-chip' + (idx === uiState.active ? " k8s-chip-active" : "") +
            '" data-svc="' + idx + '">' + esc(r.name) + "</button>";
    });
    box.innerHTML = html;
    box.querySelectorAll("[data-svc]").forEach(function (btn) {
        btn.addEventListener("click", function () {
            uiState.active = parseInt(btn.getAttribute("data-svc"), 10);
            renderAll();
        });
    });
}

function renderTabs() {
    var depTab = $("k8s-tab-deployment"), svcTab = $("k8s-tab-service");
    var depPane = $("k8s-pane-deployment"), svcPane = $("k8s-pane-service");
    var r = activeResult();
    if (uiState.tab === "service") {
        svcTab.classList.add("k8s-tab-active"); depTab.classList.remove("k8s-tab-active");
        svcPane.style.display = ""; depPane.style.display = "none";
        $("k8s-service-code").textContent = r ? r.service : "# 暂无可预览的 Service YAML。";
    } else {
        depTab.classList.add("k8s-tab-active"); svcTab.classList.remove("k8s-tab-active");
        depPane.style.display = ""; svcPane.style.display = "none";
        $("k8s-deployment-code").textContent = r ? r.deployment : "# 暂无可预览的 Deployment YAML。";
    }
    var mergeBtn = $("k8s-download-merge");
    mergeBtn.disabled = !uiState.results.length;
}

function renderAll() {
    renderServices();
    renderTabs();
}

function convertNow() {
    var src = $("k8s-input").value;
    if (!src.trim()) {
        uiState.results = [];
        $("k8s-diag").innerHTML = '<div class="k8s-empty">在上方粘贴 docker-compose.yml 文本后，诊断信息会显示在这里。</div>';
        renderAll();
        return;
    }
    var out;
    try {
        out = composeToK8s(src);
    } catch (e) {
        uiState.results = [];
        renderDiag([], [e.message]);
        renderAll();
        return;
    }
    renderDiag(out.warnings, out.errors);
    uiState.results = out.results;
    if (uiState.active >= uiState.results.length) uiState.active = 0;
    renderAll();
}

function downloadText(filename, text) {
    var blob = new Blob([text], { type: "text/yaml;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function downloadActive() {
    var r = activeResult();
    if (!r) { toast("还没有可下载的 YAML，请先粘贴 compose 文本并解析成功。"); return; }
    var kind = uiState.tab === "service" ? "service" : "deployment";
    var fname = buildK8sDownloadName(r.name + "_" + kind);
    downloadText(fname, activeYaml());
    toast("已下载 " + fname);
}

function downloadMerged() {
    if (!uiState.results.length) { toast("还没有可下载的 YAML，请先粘贴 compose 文本并解析成功。"); return; }
    var fname = buildK8sDownloadName("all");
    downloadText(fname, buildK8sMerged(uiState.results));
    toast("已下载合并文件 " + fname + "（" + uiState.results.length + " 个服务，--- 分隔）");
}

function copyActive() {
    var code = activeYaml();
    if (!code.trim()) { toast("还没有可复制的 YAML，请先粘贴 compose 文本并解析成功。"); return; }
    function done() { toast((uiState.tab === "service" ? "Service" : "Deployment") + " YAML 已复制到剪贴板"); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done, function () { fallback(); });
    } else { fallback(); }
    function fallback() {
        var ta = document.createElement("textarea");
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); done(); }
        catch (e) { toast("复制失败，请手动选中 YAML 输出区内容复制"); }
        ta.remove();
    }
}

function init() {
    var input = $("k8s-input");
    initialInput = input.value;
    var timer = null;
    input.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(convertNow, 350);
    });
    $("k8s-convert").addEventListener("click", convertNow);
    $("k8s-reset").addEventListener("click", function () {
        input.value = initialInput;
        convertNow();
        input.focus();
    });
    $("k8s-tab-deployment").addEventListener("click", function () { uiState.tab = "deployment"; renderTabs(); });
    $("k8s-tab-service").addEventListener("click", function () { uiState.tab = "service"; renderTabs(); });
    $("k8s-copy").addEventListener("click", copyActive);
    $("k8s-download").addEventListener("click", downloadActive);
    $("k8s-download-merge").addEventListener("click", downloadMerged);
    document.querySelectorAll("[data-sample]").forEach(function (btn) {
        btn.addEventListener("click", function () {
            var idx = parseInt(btn.getAttribute("data-sample"), 10);
            input.value = SAMPLES[idx].text;
            initialInput = input.value;
            convertNow();
            input.focus();
        });
    });
    convertNow();
}

/* node 测试导出；浏览器内初始化 */
if (typeof module !== "undefined" && module.exports) {
    module.exports = CK8S;
} else if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
}

})();
