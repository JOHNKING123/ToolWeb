/* Docker run → Compose 转换器：纯前端、零依赖、零后端、零上传
 * 引擎：自研 shell 词法切分（单/双引号、反斜杠转义、行尾续行）＋ docker run 旗标映射子集＋
 *   docker-compose.yml 生成（不含 version 字段，端口/挂载/环境变量值一律加引号，环境变量值含 $ 时转 $$）。
 * 承诺旗标子集：--name、-p/--publish、-v/--volume、-e/--env、--restart、--network/--net、
 *   -i/-t、--entrypoint、-w/--workdir、--user、--hostname、--expose、--label（单值）。
 * 超出子集的旗标一律进诊断列表，不静默丢弃；-d/--rm 记为已忽略（compose 无等价字段）。
 * 纯逻辑部分（DRC）在 node 下可单元测试：node tests/docker_run_to_compose.test.js
 */
(function () {
"use strict";

/* ================= 1. Shell 词法切分 =================
 * 输入原始命令文本 → { tokens, errors }。规则：
 * - 行尾反斜杠续行（\ + \r?\n）先折叠成单个空格；
 * - 单引号内除 ' 外全部原样；双引号内识别 \" \\ \$ \` 转义；
 * - 裸词中 \x 转义后一个字符（空格等）；
 * - 未闭合引号返回错误而非猜测补齐。
 */
function tokenize(src) {
    var errors = [];
    var s = String(src || "");
    s = s.replace(/\\\r?\n/g, " ");
    var tokens = [], cur = "", has = false, i = 0, n = s.length, state = "bare";

    function push() {
        if (has) { tokens.push(cur); }
        cur = ""; has = false;
    }

    while (i < n) {
        var ch = s[i];
        if (state === "single") {
            if (ch === "'") { state = "bare"; i++; }
            else { cur += ch; has = true; i++; }
        } else if (state === "double") {
            if (ch === '"') { state = "bare"; i++; }
            else if (ch === "\\" && i + 1 < n) {
                var nx = s[i + 1];
                if (nx === '"' || nx === "\\" || nx === "$" || nx === "`") { cur += nx; has = true; i += 2; }
                else if (nx === "n") { cur += "\n"; has = true; i += 2; }
                else if (nx === "t") { cur += "\t"; has = true; i += 2; }
                else if (nx === "r") { cur += "\r"; has = true; i += 2; }
                else { cur += ch; has = true; i++; }
            } else { cur += ch; has = true; i++; }
        } else { /* bare */
            if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") { push(); i++; }
            else if (ch === "'") { state = "single"; has = true; i++; }
            else if (ch === '"') { state = "double"; has = true; i++; }
            else if (ch === "\\" && i + 1 < n) { cur += s[i + 1]; has = true; i += 2; }
            else { cur += ch; has = true; i++; }
        }
    }
    if (state === "single") errors.push("引号未闭合：存在未配对的单引号，请补齐引号后再转换。");
    if (state === "double") errors.push("引号未闭合：存在未配对的双引号，请补齐引号后再转换。");
    push();
    return { tokens: tokens, errors: errors };
}

/* ================= 2. 旗标映射 ================= */

/* 取值型长旗标（→结构化字段） */
var VALUE_FLAGS = {
    "--name": "name", "--publish": "publish", "--volume": "volume", "--env": "env",
    "--restart": "restart", "--network": "network", "--net": "network",
    "--entrypoint": "entrypoint", "--workdir": "workdir", "--user": "user",
    "--hostname": "hostname", "--expose": "expose", "--label": "label"
};

/* 布尔型长旗标（子集内） */
var BOOL_FLAGS = {
    "--detach": "ignored-detach", "--interactive": "stdin", "--tty": "tty"
};

/* 已忽略：compose 无等价字段 */
var IGNORED_FLAGS = { "--detach": 1, "--rm": 1 };

/* 不支持旗标及其参数个数（超出子集，逐项进诊断，不静默丢弃） */
var UNSUPPORTED_ARITY = {
    "--privileged": 0, "--cap-add": 1, "--cap-drop": 1, "--device": 1,
    "--dns": 1, "--dns-search": 1, "--add-host": 1, "--link": 1,
    "--health-cmd": 1, "--health-interval": 1, "--health-timeout": 1,
    "--health-retries": 1, "--health-start-period": 1,
    "--security-opt": 1, "--tmpfs": 1, "--sysctl": 1, "--log-driver": 1,
    "--log-opt": 1, "--ulimit": 1, "--cgroup-parent": 1, "--cpu-shares": 1,
    "--cpus": 1, "--memory": 1, "--memory-swap": 1, "--pid": 1, "--ipc": 1,
    "--mac-address": 1, "--ip": 1, "--dns-opt": 1, "--entrypoint-shell": 0
};

/* 取值型短旗标 → 字段 */
var SHORT_VALUE = { p: "publish", v: "volume", e: "env", w: "workdir", u: "user" };
/* 布尔型短旗标 */
var SHORT_BOOL = { d: "ignored-detach", i: "stdin", t: "tty" };

var RESTART_VALUES = { "no": 1, "always": 1, "on-failure": 1, "unless-stopped": 1 };

function splitEq(tok) {
    var idx = tok.indexOf("=");
    if (tok.length > 2 && tok.slice(0, 2) === "--" && idx > 2) {
        return [tok.slice(0, idx), tok.slice(idx + 1)];
    }
    return [tok, null];
}

/* 服务名清洗：小写，非法字符转 -，首尾 - 去掉 */
function cleanServiceName(raw) {
    var s = String(raw || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return s || "app";
}

/* 镜像 basename：去仓库前缀、去 :tag、去 @digest */
function imageBasename(image) {
    var s = String(image || "");
    var slash = s.lastIndexOf("/");
    if (slash >= 0) s = s.slice(slash + 1);
    var at = s.indexOf("@");
    if (at >= 0) s = s.slice(0, at);
    var colon = s.indexOf(":");
    if (colon >= 0) s = s.slice(0, colon);
    return s || "app";
}

/* YAML 双引号标量：转义 \ 与 "，控制字符转 \n 等 */
function yamlDQ(s, escapeDollar) {
    var out = "";
    s = String(s);
    /* 注意：String.replace 的替换串中 $$ 表示单个 $，故写 $$$$ 才能真正产出 $$。 */
    if (escapeDollar) s = s.replace(/\$/g, "$$$$");
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
    return yamlDQ(s, false);
}

/* 启动命令 token 需要引号时用单引号还原（内含单引号时 '' 转义） */
function shellQuoteToken(tok) {
    if (/^[A-Za-z0-9_@%+=:,.\/-]+$/.test(tok)) return tok;
    return "'" + tok.replace(/'/g, "'\\''") + "'";
}

/* 解析 docker run 命令 → 结构化结果（含 yaml 与 diagnostics、errors） */
function parseRun(src) {
    var tk = tokenize(src);
    var tokens = tk.tokens;
    var errors = tk.errors.slice();
    var r = {
        service: "", image: "", containerName: null,
        ports: [], volumes: [], environment: [],
        restart: null, networks: [], networkMode: null,
        command: null, stdinOpen: false, tty: false,
        workingDir: null, user: null, hostname: null,
        entrypoint: null, labels: [], expose: [],
        diagnostics: [], errors: errors, yaml: ""
    };
    function diag(kind, flag, message) {
        r.diagnostics.push({ kind: kind, flag: flag, message: message });
    }

    if (!String(src || "").trim()) {
        errors.push("输入为空：请粘贴一条 docker run 命令。");
        r.errors = errors;
        return r;
    }
    if (errors.length) { r.errors = errors; return r; }

    var i = 0;
    if (tokens[i] === "sudo") i++;
    if (tokens[i] !== "docker" || tokens[i + 1] !== "run") {
        errors.push("输入不是 docker run 命令：请以 docker run 开头（可加 sudo 前缀），例如 docker run -d -p 8080:80 nginx。");
        r.errors = errors;
        return r;
    }
    i += 2;

    var rawName = null;
    var image = null;
    var commandTokens = [];
    var endOfFlags = false;

    function applyField(field, val, flagLabel) {
        if (field === "name") { rawName = val; }
        else if (field === "publish") { r.ports.push(val); }
        else if (field === "volume") { r.volumes.push(val); }
        else if (field === "env") {
            var eq = val.indexOf("=");
            if (eq < 0) {
                diag("warning", flagLabel, "环境变量 " + val + " 只有键没有值（裸 KEY），已保留为 " + val + "，未编造值；请在 compose 中按需补值。");
                r.environment.push(val);
            } else {
                if (val.indexOf("$") !== -1) {
                    diag("warning", flagLabel, "环境变量 " + val.slice(0, eq) + " 的值含 $，Compose 会将其当作变量插值，已转义为 $$，请确认这就是你想要的。");
                }
                r.environment.push(val);
            }
        }
        else if (field === "restart") {
            r.restart = val;
            if (!RESTART_VALUES[val] && val.indexOf("on-failure:") !== 0) {
                diag("warning", flagLabel, "重启策略 " + val + " 不在常用取值（no / always / on-failure[:N] / unless-stopped）中，已原样输出，请确认 Docker 支持该值。");
            }
        }
        else if (field === "network") {
            if (val === "host" || val === "none") {
                r.networkMode = val;
                diag("warning", flagLabel, "网络模式 " + val + " 语义特殊：compose 中用 network_mode 表达而非 networks 列表，请确认容器确实需要 " + val + " 模式。");
            } else if (val !== "bridge") {
                r.networks.push(val);
            }
            /* bridge 为默认网络，省略不输出，等价于默认行为。 */
        }
        else if (field === "entrypoint") { r.entrypoint = val; }
        else if (field === "workdir") { r.workingDir = val; }
        else if (field === "user") { r.user = val; }
        else if (field === "hostname") { r.hostname = val; }
        else if (field === "expose") { r.expose.push(val); }
        else if (field === "label") {
            if (val.indexOf("=") < 0) {
                diag("warning", flagLabel, "label " + val + " 不是 KEY=VAL 形式，已忽略该项；请改写为 --label KEY=VAL。");
            } else {
                r.labels.push(val);
            }
        }
    }

    function applyBool(kind, flagLabel) {
        if (kind === "stdin") r.stdinOpen = true;
        else if (kind === "tty") r.tty = true;
        else if (kind === "ignored-detach") diag("ignored", flagLabel, "已忽略：compose 默认即后台语义（docker compose up -d），无需 detach 字段。");
    }

    function takeNext(flagLabel) {
        if (i + 1 < tokens.length) { i++; return tokens[i]; }
        diag("warning", flagLabel, "选项 " + flagLabel + " 缺少参数值，已忽略。");
        return null;
    }

    for (; i < tokens.length; i++) {
        var tok = tokens[i];
        if (image !== null) { commandTokens.push(tok); continue; }
        if (endOfFlags) { image = tok; continue; }
        if (tok === "--") { endOfFlags = true; continue; }
        if (tok.charAt(0) !== "-" || tok === "-") { image = tok; continue; }

        /* 长旗标 */
        if (tok.slice(0, 2) === "--") {
            var parts = splitEq(tok);
            var opt = parts[0], eqVal = parts[1];
            if (VALUE_FLAGS[opt]) {
                var v = eqVal;
                if (v === null) v = takeNext(opt);
                if (v !== null) applyField(VALUE_FLAGS[opt], v, opt);
                continue;
            }
            if (opt === "--detach" || opt === "--rm") {
                diag("ignored", opt, opt === "--detach"
                    ? "已忽略：compose 默认即后台语义（docker compose up -d），无需 detach 字段。"
                    : "已忽略：compose 无 --rm 等价字段，容器随服务启停管理。");
                continue;
            }
            if (BOOL_FLAGS[opt]) { applyBool(BOOL_FLAGS[opt], opt); continue; }
            if (opt === "--interactive" || opt === "--tty") { applyBool(opt === "--interactive" ? "stdin" : "tty", opt); continue; }
            if (UNSUPPORTED_ARITY.hasOwnProperty(opt)) {
                var arity = UNSUPPORTED_ARITY[opt];
                var arg = null;
                if (arity === 1) {
                    arg = eqVal;
                    if (arg === null) arg = takeNext(opt);
                }
                diag("unsupported", opt, "不支持的旗标 " + opt + (arg !== null && arg !== undefined ? " " + arg : "") + "：不在本工具承诺的常用旗标子集内，未转换进 YAML，请在 compose 中手动对应处理。");
                continue;
            }
            if (opt.indexOf("--health-") === 0) {
                var harg = eqVal;
                if (harg === null) harg = takeNext(opt);
                diag("unsupported", opt, "不支持的旗标 " + opt + "：健康检查类旗标不在本工具承诺的子集内，未转换进 YAML，请在 compose 中用 healthcheck 段手动对应。");
                continue;
            }
            /* 完全未知的长旗标：保守消费一个参数并进诊断，不静默丢弃 */
            var uarg = eqVal;
            if (uarg === null && i + 1 < tokens.length && tokens[i + 1].charAt(0) !== "-") { uarg = takeNext(opt); }
            diag("unsupported", opt, "不支持的旗标 " + opt + (uarg !== null && uarg !== undefined ? " " + uarg : "") + "：不在本工具承诺的常用旗标子集内，未转换进 YAML，请手动处理。");
            continue;
        }

        /* 短旗标（含 = 与组合形态） */
        var body = tok.slice(1);
        var eqIdx = body.indexOf("=");
        var bundle = eqIdx >= 0 ? body.slice(0, eqIdx) : body;
        var attached = eqIdx >= 0 ? body.slice(eqIdx + 1) : null;
        var consumedAttached = false;
        var bundleOk = true;
        for (var bi = 0; bi < bundle.length; bi++) {
            var ch = bundle[bi];
            var so = "-" + ch;
            if (SHORT_BOOL[ch]) {
                if (ch === "d") diag("ignored", so, "已忽略：compose 默认即后台语义（docker compose up -d），无需 detach 字段。");
                else applyBool(SHORT_BOOL[ch], so);
                continue;
            }
            if (SHORT_VALUE[ch]) {
                var sv = null;
                if (attached !== null) { sv = attached; consumedAttached = true; }
                else if (bi + 1 < bundle.length) { sv = bundle.slice(bi + 1); }
                else { sv = takeNext(so); }
                if (sv !== null) applyField(SHORT_VALUE[ch], sv, so);
                bi = bundle.length; /* 取值后组合结束 */
                continue;
            }
            if (ch === "r") {
                /* -r 在 docker run 中无对应短旗标（--rm 为长旗标）；组合中出现时记为已忽略，避免误作镜像 */
                diag("ignored", so, "已忽略：组合短旗标中的 -r 按 --rm 理解，compose 无等价字段。");
                continue;
            }
            diag("unsupported", so, "不支持的短旗标 " + so + "：不在本工具承诺的常用旗标子集内，未转换进 YAML，请手动处理。");
            bundleOk = false;
        }
        void bundleOk; void consumedAttached;
    }

    if (image === null) {
        errors.push("未找到镜像：请在旗标后写出镜像名，例如 docker run nginx 或 docker run -p 8080:80 nginx:1.25。");
        r.errors = errors;
        return r;
    }

    r.image = image;
    if (commandTokens.length) r.command = commandTokens.map(shellQuoteToken).join(" ");
    r.containerName = rawName;
    r.service = rawName !== null ? cleanServiceName(rawName) : cleanServiceName(imageBasename(image));
    r.yaml = generateYaml(r);
    r.errors = errors;
    return r;
}

/* ================= 3. YAML 生成 ================= */

function generateYaml(r) {
    var L = [];
    L.push("services:");
    L.push("  " + r.service + ":");
    L.push("    image: " + yamlScalar(r.image));
    if (r.containerName !== null && r.containerName !== undefined) {
        L.push("    container_name: " + yamlScalar(r.containerName));
    }
    if (r.stdinOpen) L.push("    stdin_open: true");
    if (r.tty) L.push("    tty: true");
    if (r.restart) L.push("    restart: " + r.restart);
    if (r.networkMode) L.push("    network_mode: " + r.networkMode);
    if (r.hostname) L.push("    hostname: " + yamlScalar(r.hostname));
    if (r.user) L.push("    user: " + yamlScalar(r.user));
    if (r.workingDir) L.push("    working_dir: " + yamlScalar(r.workingDir));
    if (r.entrypoint) L.push("    entrypoint: " + yamlScalar(r.entrypoint));
    if (r.command) L.push("    command: " + yamlScalar(r.command));
    if (r.ports.length) {
        L.push("    ports:");
        r.ports.forEach(function (p) { L.push("      - " + yamlDQ(p, false)); });
    }
    if (r.expose.length) {
        L.push("    expose:");
        r.expose.forEach(function (e) { L.push("      - " + yamlDQ(e, false)); });
    }
    if (r.volumes.length) {
        L.push("    volumes:");
        r.volumes.forEach(function (v) { L.push("      - " + yamlDQ(v, false)); });
    }
    if (r.environment.length) {
        L.push("    environment:");
        r.environment.forEach(function (e) { L.push("      - " + yamlDQ(e, true)); });
    }
    if (r.labels.length) {
        L.push("    labels:");
        r.labels.forEach(function (l) { L.push("      - " + yamlDQ(l, false)); });
    }
    if (r.networks.length) {
        L.push("    networks:");
        r.networks.forEach(function (n) { L.push("      - " + yamlScalar(n)); });
    }
    return L.join("\n") + "\n";
}

/* 示例命令（载入后可再编辑，请按需改写） */
var SAMPLES = [
    {
        name: "nginx 简单端口映射",
        cmd: "docker run -d --name web -p 8080:80 nginx:1.25"
    },
    {
        name: "postgres 环境变量＋命名卷＋重启",
        cmd: "docker run -d --name db -e POSTGRES_PASSWORD=s3cret -e POSTGRES_DB=myapp \\\n  -v pgdata:/var/lib/postgresql/data -p 5432:5432 --restart unless-stopped postgres:16"
    },
    {
        name: "自定义镜像＋启动命令＋工作目录",
        cmd: "docker run -it --name worker -w /app -e NODE_ENV=production myapp:latest \\\n  node server.js --port 3000"
    },
    {
        name: "引号＋只读挂载＋不支持旗标",
        cmd: "docker run -d --name site -p 80:80 -v /srv/www:/usr/share/nginx/html:ro \\\n  -e \"WELCOME_MSG=Hello World\" --privileged --cap-add SYS_ADMIN nginx"
    }
];

var DRC = {
    tokenize: tokenize,
    parseRun: parseRun,
    generateYaml: generateYaml,
    cleanServiceName: cleanServiceName,
    imageBasename: imageBasename,
    yamlDQ: yamlDQ,
    yamlScalar: yamlScalar,
    samples: SAMPLES
};

/* ================= 4. 浏览器 UI ================= */

function $(id) { return document.getElementById(id); }

function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function kvRow(k, v) {
    return '<div class="drc-kv"><span class="drc-k">' + esc(k) + "</span><span>" + v + "</span></div>";
}

function chipList(arr) {
    if (!arr.length) return '<span class="drc-none">无</span>';
    var h = '<div class="drc-chips">';
    arr.forEach(function (x) { h += '<span class="drc-chip">' + esc(x) + "</span>"; });
    return h + "</div>";
}

function renderParsed(r) {
    var html = "";
    html += kvRow("服务名", "<b>" + esc(r.service) + "</b>" + (r.containerName ? ' <span class="drc-sub">（container_name 保留原值：' + esc(r.containerName) + "）</span>" : ""));
    html += kvRow("镜像", '<span class="drc-mono">' + esc(r.image) + "</span>");
    html += kvRow("容器名", r.containerName ? esc(r.containerName) : '<span class="drc-none">未指定（不输出 container_name）</span>');
    html += kvRow("端口", chipList(r.ports));
    html += kvRow("挂载", chipList(r.volumes));
    html += kvRow("环境变量", chipList(r.environment));
    html += kvRow("重启策略", r.restart ? esc(r.restart) : '<span class="drc-none">未指定</span>');
    html += kvRow("网络", r.networkMode ? "network_mode: " + esc(r.networkMode) : chipList(r.networks));
    html += kvRow("启动命令", r.command ? '<span class="drc-mono">' + esc(r.command) + "</span>" : '<span class="drc-none">无（不输出 command）</span>');
    var misc = [];
    if (r.stdinOpen) misc.push("stdin_open: true（-i）");
    if (r.tty) misc.push("tty: true（-t）");
    if (r.workingDir) misc.push("工作目录：" + esc(r.workingDir));
    if (r.user) misc.push("用户：" + esc(r.user));
    if (r.hostname) misc.push("主机名：" + esc(r.hostname));
    if (r.entrypoint) misc.push("入口：" + esc(r.entrypoint));
    if (r.labels.length) misc.push("labels：" + esc(r.labels.join("、")));
    if (r.expose.length) misc.push("expose：" + esc(r.expose.join("、")));
    html += kvRow("其他", misc.length ? misc.join("　") : '<span class="drc-none">无</span>');

    if (r.errors.length) {
        html += '<div class="drc-diag drc-err"><b>解析错误</b><ul>';
        r.errors.forEach(function (e) { html += "<li>" + esc(e) + "</li>"; });
        html += "</ul></div>";
    }
    var uns = r.diagnostics.filter(function (d) { return d.kind === "unsupported"; });
    var ign = r.diagnostics.filter(function (d) { return d.kind === "ignored"; });
    var war = r.diagnostics.filter(function (d) { return d.kind === "warning"; });
    if (uns.length) {
        html += '<div class="drc-diag drc-unhandled"><b>不支持的旗标（' + uns.length + "）——未转换进 YAML，未静默丢弃</b><ul>";
        uns.forEach(function (d) { html += "<li><code>" + esc(d.flag) + "</code>：" + esc(d.message) + "</li>"; });
        html += "</ul></div>";
    }
    if (ign.length) {
        html += '<div class="drc-diag drc-warnbox"><b>已忽略的旗标（' + ign.length + "）——compose 无等价字段</b><ul>";
        ign.forEach(function (d) { html += "<li><code>" + esc(d.flag) + "</code>：" + esc(d.message) + "</li>"; });
        html += "</ul></div>";
    }
    if (war.length) {
        html += '<div class="drc-diag drc-warnbox"><b>提示（' + war.length + "）</b><ul>";
        war.forEach(function (d) { html += "<li><code>" + esc(d.flag) + "</code>：" + esc(d.message) + "</li>"; });
        html += "</ul></div>";
    }
    return html;
}

var initialInput = "";
var toastTimer = null;

function toast(msg) {
    var el = $("drc-toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2400);
}

function convertNow() {
    var src = $("drc-input").value;
    var parsedBox = $("drc-parsed");
    var outBox = $("drc-code");
    if (!src.trim()) {
        parsedBox.innerHTML = '<div class="drc-empty">在上方粘贴 docker run 命令后，解析结果会显示在这里。</div>';
        outBox.textContent = "# 在上方粘贴 docker run 命令，生成的 docker-compose.yml 会显示在这里。";
        outBox.dataset.code = "";
        return;
    }
    var r = parseRun(src);
    parsedBox.innerHTML = renderParsed(r);
    if (r.errors.length) {
        outBox.textContent = "# 转换失败：请先修正上方解析错误，暂不输出 YAML，避免生成畸形配置。";
        outBox.dataset.code = "";
    } else {
        outBox.textContent = r.yaml;
        outBox.dataset.code = r.yaml;
    }
}

function downloadYaml() {
    var code = $("drc-code").dataset.code || "";
    if (!code.trim()) { toast("还没有可下载的 YAML，请先粘贴 docker run 命令并转换成功。"); return; }
    var blob = new Blob([code], { type: "text/yaml;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "docker-compose.yml";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast("已下载 docker-compose.yml");
}

function copyYaml() {
    var code = $("drc-code").dataset.code || "";
    if (!code.trim()) { toast("还没有可复制的 YAML，请先粘贴 docker run 命令并转换成功。"); return; }
    function done() { toast("YAML 已复制到剪贴板"); }
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
    var input = $("drc-input");
    initialInput = input.value;
    var timer = null;
    input.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(convertNow, 350);
    });
    $("drc-convert").addEventListener("click", convertNow);
    $("drc-reset").addEventListener("click", function () {
        input.value = initialInput;
        convertNow();
        input.focus();
    });
    $("drc-copy").addEventListener("click", copyYaml);
    $("drc-download").addEventListener("click", downloadYaml);
    document.querySelectorAll("[data-sample]").forEach(function (btn) {
        btn.addEventListener("click", function () {
            var idx = parseInt(btn.getAttribute("data-sample"), 10);
            input.value = SAMPLES[idx].cmd;
            initialInput = input.value;
            convertNow();
            input.focus();
        });
    });
    convertNow();
}

/* node 测试导出；浏览器内初始化 */
if (typeof module !== "undefined" && module.exports) {
    module.exports = DRC;
} else if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
}

})();
