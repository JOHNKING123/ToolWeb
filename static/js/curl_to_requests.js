/* cURL → Python Requests 转换器：纯前端、零依赖、零后端、零上传
 * 引擎：自研轻量 shell 词法切分（单/双引号、反斜杠转义、$'...' ANSI 引号、行尾续行 \）
 * 参数映射：-X/--request、--url/位置 URL、-H、-d/--data*（含 --data-raw/--data-binary/--data-ascii/--data-urlencode）、
 *   --compressed、-u、-b、-A、-k、-F/--form、--max-time；未知参数进入诊断列表，不静默丢弃。
 * 代码生成：JSON 自动用 json=、普通表单用 data=、文件上传用 files=、GET 带 data 提示改用 params=。
 * 纯逻辑部分（C2R）在 node 下可单元测试：node tests/curl_to_requests.test.js
 */
(function () {
"use strict";

/* ================= 1. Shell 词法切分 =================
 * 输入原始命令文本 → 字符串数组。规则：
 * - 行尾反斜杠续行（\ + \r?\n）先折叠成单个空格；
 * - 单引号内除 ' 外全部原样；双引号内识别 \" \\ \` \$ \! 以及 \n 等常用转义；
 * - $'...' 视为 ANSI-C 引号：\n \t \r \\ \' \" \0 被展开；
 * - 裸词中 \x 转义后一个字符（空格等）。
 */
function tokenize(src) {
    var errors = [];
    var s = String(src || "");
    // 续行折叠
    s = s.replace(/\\\r?\n/g, " ");
    var tokens = [], cur = "", i = 0, n = s.length, state = "bare";

    function push() {
        if (cur !== "" || state === "single" || state === "double" || state === "ansi") {
            tokens.push(cur);
        }
        cur = "";
    }

    while (i < n) {
        var ch = s[i];
        if (state === "single") {
            if (ch === "'") { state = "bare"; i++; }
            else { cur += ch; i++; }
        } else if (state === "double") {
            if (ch === '"') { state = "bare"; i++; }
            else if (ch === "\\" && i + 1 < n) {
                var nx = s[i + 1];
                if (nx === '"' || nx === "\\" || nx === "$" || nx === "`" || nx === "!") {
                    cur += nx; i += 2;
                } else if (nx === "n") { cur += "\n"; i += 2; }
                else if (nx === "t") { cur += "\t"; i += 2; }
                else if (nx === "r") { cur += "\r"; i += 2; }
                else { cur += ch; i++; }
            } else { cur += ch; i++; }
        } else if (state === "ansi") {
            if (ch === "'") { state = "bare"; i++; }
            else if (ch === "\\" && i + 1 < n) {
                var nx2 = s[i + 1];
                if (nx2 === "n") { cur += "\n"; i += 2; }
                else if (nx2 === "t") { cur += "\t"; i += 2; }
                else if (nx2 === "r") { cur += "\r"; i += 2; }
                else if (nx2 === "\\") { cur += "\\"; i += 2; }
                else if (nx2 === "'") { cur += "'"; i += 2; }
                else if (nx2 === '"') { cur += '"'; i += 2; }
                else if (nx2 === "0") { cur += "\0"; i += 2; }
                else { cur += nx2; i += 2; }
            } else { cur += ch; i++; }
        } else { /* bare */
            if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
                push(); state = "bare"; i++;
            } else if (ch === "'") { state = "single"; i++; }
            else if (ch === '"') { state = "double"; i++; }
            else if (ch === "$" && s[i + 1] === "'") { state = "ansi"; i += 2; }
            else if (ch === "\\" && i + 1 < n) { cur += s[i + 1]; i += 2; }
            else if (ch === ";" || ch === "&" || ch === "|") {
                // 命令分隔符：终止本次解析（常见于粘贴多条命令时）
                push(); tokens.__truncated = true;
                errors.push("检测到命令分隔符 '" + ch + "'，仅解析了第一条命令。");
                break;
            } else { cur += ch; i++; }
        }
    }
    if (state === "single") errors.push("引号未闭合：存在未配对的单引号。");
    if (state === "double") errors.push("引号未闭合：存在未配对的双引号。");
    if (state === "ansi") errors.push("引号未闭合：存在未配对的 $' 引号。");
    push();
    return { tokens: tokens, errors: errors };
}

/* ================= 2. 参数映射 ================= */

var DATA_OPTS = {
    "-d": 1, "--data": 1, "--data-raw": 1, "--data-ascii": 1,
    "--data-binary": 1, "--data-urlencode": 1
};

/* 需要一个参数的长/短选项（其余未知选项同样按「带一个参数」尝试消费，避免误判 URL） */
var NEEDS_ARG = {
    "-X": 1, "--request": 1, "--url": 1,
    "-H": 1, "--header": 1,
    "-d": 1, "--data": 1, "--data-raw": 1, "--data-ascii": 1, "--data-binary": 1, "--data-urlencode": 1,
    "-u": 1, "--user": 1, "-b": 1, "--cookie": 1,
    "-A": 1, "--user-agent": 1,
    "-F": 1, "--form": 1, "--form-string": 1,
    "--max-time": 1, "-m": 1, "--connect-timeout": 1,
    "-o": 1, "--output": 1, "-O": 0, "--remote-name": 0,
    "--cacert": 1, "--cert": 1, "--key": 1,
    "-e": 1, "--referer": 1, "--proxy": 1, "-x": 1,
    "--http1.1": 0, "--http2": 0, "--compressed": 0, "-k": 0, "--insecure": 0,
    "-s": 0, "--silent": 0, "-S": 0, "--show-error": 0,
    "-L": 0, "--location": 0, "-v": 0, "--verbose": 0,
    "-i": 0, "--include": 0, "-I": 0, "--head": 0,
    "-g": 0, "--globoff": 0, "-G": 0, "--get": 0,
    "--noproxy": 1, "-H@": 0
};

/* 布尔型选项（不带参数） */
var FLAG_OPTS = {
    "--compressed": 1, "-k": 1, "--insecure": 1,
    "-s": 1, "--silent": 1, "-S": 1, "--show-error": 1,
    "-L": 1, "--location": 1, "-v": 1, "--verbose": 1,
    "-i": 1, "--include": 1, "-I": 1, "--head": 1,
    "-g": 1, "--globoff": 1, "-G": 1, "--get": 1,
    "-O": 1, "--remote-name": 1,
    "--http1.1": 1, "--http2": 1
};

/* 拆分 --opt=value 形态 */
function splitEq(tok) {
    var idx = tok.indexOf("=");
    if (tok.length > 2 && tok.slice(0, 2) === "--" && idx > 2) {
        return [tok.slice(0, idx), tok.slice(idx + 1)];
    }
    return [tok, null];
}

function parseCookies(str) {
    var out = [];
    String(str || "").split(";").forEach(function (pair) {
        var idx = pair.indexOf("=");
        if (idx > 0) {
            out.push({ name: pair.slice(0, idx).trim(), value: pair.slice(idx + 1).trim() });
        }
    });
    return out;
}

/* 解析 token 数组 → 结构化请求 */
function parseCurl(src) {
    var tk = tokenize(src);
    var tokens = tk.tokens, errors = tk.errors.slice();
    var r = {
        method: null, methodExplicit: false, url: null,
        headers: [], data: [], formFields: [], formFiles: [],
        cookies: [], auth: null, insecure: false, timeout: null,
        compressed: false, followRedirects: false, ignored: [],
        unhandled: [], warnings: [], errors: errors
    };

    var i = 0;
    // 跳过前导的 curl 本体与 env 赋值
    if (tokens[0] === "env") i = 1;
    while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
    if (tokens[i] === "curl") i++;

    function takeValue(opt) {
        // 注意：for 循环尾部还有 i++，这里只把 i 停在 value 上（缺值时停在 option 本身）
        var val = null;
        if (i + 1 < tokens.length && !(tokens[i + 1].charAt(0) === "-" && tokens[i + 1].length > 1 && !/^-?\d/.test(tokens[i + 1]))) {
            val = tokens[i + 1]; i += 1;
        } else {
            r.warnings.push("选项 " + opt + " 缺少参数值，已忽略。");
        }
        return val;
    }

    for (; i < tokens.length; i++) {
        var tok = tokens[i];
        var parts = splitEq(tok);
        var opt = parts[0], eqVal = parts[1];
        var isOpt = opt.charAt(0) === "-" && opt.length > 1;

        if (!isOpt) {
            if (!r.url) r.url = tok;
            else r.warnings.push("多余的位置参数 '" + truncate(tok, 40) + "' 已忽略（只取第一个 URL）。");
            continue;
        }

        // 捆绑短选项如 -sk：逐字符展开（仅布尔型）
        if (/^-[a-zA-Z]{2,}$/.test(opt) && !(opt in NEEDS_ARG)) {
            var chars = opt.slice(1).split(""), handled = true;
            for (var ci = 0; ci < chars.length; ci++) {
                var so = "-" + chars[ci];
                if (so in FLAG_OPTS) { applyFlag(so); }
                else { handled = false; break; }
            }
            if (handled) continue;
            r.unhandled.push({ opt: opt, arg: null });
            continue;
        }

        var needsArg = NEEDS_ARG[opt];
        var val = eqVal;
        if (needsArg === undefined) {
            // 未知选项：保守消费一个参数（若其不像选项）
            var consumed = null;
            if (i + 1 < tokens.length && !(tokens[i + 1].charAt(0) === "-" && tokens[i + 1].length > 1)) {
                consumed = tokens[i + 1]; i++;
            }
            r.unhandled.push({ opt: opt, arg: consumed });
            continue;
        }
        if (eqVal === null && !FLAG_OPTS[opt]) {
            val = takeValue(opt);
            if (val === null) continue;
        } else if (FLAG_OPTS[opt]) {
            applyFlag(opt);
            continue;
        }

        applyOption(opt, val);
    }

    function applyFlag(opt) {
        if (opt === "-k" || opt === "--insecure") {
            r.insecure = true;
        } else if (opt === "--compressed") {
            r.compressed = true;
        } else if (opt === "-L" || opt === "--location") {
            r.followRedirects = true;
        } else if (opt === "-s" || opt === "--silent" || opt === "-S" || opt === "--show-error" ||
                   opt === "-v" || opt === "--verbose" || opt === "-i" || opt === "--include" ||
                   opt === "-g" || opt === "--globoff" || opt === "--http1.1" || opt === "--http2") {
            r.ignored.push(opt);
        } else if (opt === "-I" || opt === "--head") {
            r.method = "HEAD"; r.methodExplicit = true;
        } else if (opt === "-G" || opt === "--get") {
            r.method = "GET"; r.methodExplicit = true;
        } else if (opt === "-O" || opt === "--remote-name") {
            r.ignored.push(opt + "（下载到文件，requests 请用 response.content 自行保存）");
        }
    }

    function applyOption(opt, val) {
        if (opt === "-X" || opt === "--request") {
            r.method = String(val).toUpperCase(); r.methodExplicit = true;
        } else if (opt === "--url") {
            r.url = val;
        } else if (opt === "-H" || opt === "--header") {
            var idx = val.indexOf(":");
            if (idx > 0) {
                var name = val.slice(0, idx).trim(), hval = val.slice(idx + 1).trim();
                if (name.toLowerCase() === "cookie") {
                    r.cookies = r.cookies.concat(parseCookies(hval));
                } else {
                    r.headers.push({ name: name, value: hval });
                }
            } else {
                r.warnings.push("Header '" + truncate(val, 40) + "' 缺少冒号分隔，已忽略。");
            }
        } else if (DATA_OPTS[opt]) {
            if (opt === "--data-binary" && val.charAt(0) === "@") {
                r.warnings.push("--data-binary 引用了文件 @" + truncate(val.slice(1), 30) + "，无法转为内联数据，已忽略该文件引用。");
            } else if (val.charAt(0) === "@" && (opt === "-d" || opt === "--data" || opt === "--data-ascii")) {
                r.warnings.push("data 引用了文件 @" + truncate(val.slice(1), 30) + "，无法转为内联数据，已忽略该文件引用。");
            } else {
                r.data.push({ opt: opt, value: val });
            }
        } else if (opt === "-u" || opt === "--user") {
            var ci = val.indexOf(":");
            r.auth = ci >= 0
                ? { user: val.slice(0, ci), pass: val.slice(ci + 1) }
                : { user: val, pass: "" };
        } else if (opt === "-b" || opt === "--cookie") {
            if (val.indexOf("=") >= 0 && val.indexOf(";") < 0 && /^[A-Za-z0-9_.-]+$/.test(val.split("=")[0])) {
                r.cookies.push({ name: val.split("=")[0], value: val.slice(val.indexOf("=") + 1) });
            } else {
                r.cookies = r.cookies.concat(parseCookies(val));
            }
        } else if (opt === "-A" || opt === "--user-agent") {
            r.headers.push({ name: "User-Agent", value: val });
        } else if (opt === "-F" || opt === "--form" || opt === "--form-string") {
            var fi = val.indexOf("=");
            if (fi > 0) {
                var fname = val.slice(0, fi), fval = val.slice(fi + 1);
                if (opt !== "--form-string" && fval.charAt(0) === "@") {
                    r.formFiles.push({ name: fname, file: fval.slice(1) });
                } else {
                    r.formFields.push({ name: fname, value: fval });
                }
            } else {
                r.warnings.push("-F 参数 '" + truncate(val, 40) + "' 缺少 name=value 形态，已忽略。");
            }
        } else if (opt === "--max-time" || opt === "-m" || opt === "--connect-timeout") {
            var t = parseFloat(val);
            if (!isNaN(t)) r.timeout = t;
            else r.warnings.push("超时值 '" + truncate(val, 20) + "' 不是数字，已忽略。");
        } else if (opt === "-o" || opt === "--output") {
            r.ignored.push(opt + "（保存响应到文件，requests 请用 response.content 自行保存）");
        } else if (opt === "-e" || opt === "--referer") {
            r.headers.push({ name: "Referer", value: val });
        } else if (opt === "--cacert" || opt === "--cert" || opt === "--key" ||
                   opt === "--proxy" || opt === "-x") {
            r.unhandled.push({ opt: opt, arg: val });
        } else {
            r.ignored.push(opt);
        }
    }

    // --compressed → Accept-Encoding
    if (r.compressed) {
        var hasAE = r.headers.some(function (h) { return h.name.toLowerCase() === "accept-encoding"; });
        if (!hasAE) r.headers.push({ name: "Accept-Encoding", value: "gzip, deflate" });
        else r.warnings.push("--compressed 已指定，但已有 Accept-Encoding 请求头，以原请求头为准。");
    }

    // 方法推断
    if (!r.method) {
        if (r.data.length || r.formFields.length || r.formFiles.length) r.method = "POST";
        else r.method = "GET";
    }

    // GET 带 data → 提示改用 params
    if (r.method === "GET" && r.data.length) {
        r.warnings.push("GET 请求携带了 --data 数据：curl 会将其作为请求体发送，requests 同样支持 data=；但更推荐改用 params= 拼到 URL 查询串中。");
    }

    if (!r.url) errors.push("未找到 URL：请确认命令中包含 http(s):// 开头的地址。");

    return r;
}

function truncate(s, n) {
    s = String(s);
    return s.length > n ? s.slice(0, n) + "…" : s;
}

/* ================= 3. Python 代码生成 ================= */

/* Python 单引号字面量转义 */
function pyStr(s) {
    s = String(s);
    var out = "";
    for (var i = 0; i < s.length; i++) {
        var ch = s[i], code = s.charCodeAt(i);
        if (ch === "\\") out += "\\\\";
        else if (ch === "'") out += "\\'";
        else if (ch === "\n") out += "\\n";
        else if (ch === "\r") out += "\\r";
        else if (ch === "\t") out += "\\t";
        else if (code < 32 || code === 127) out += "\\x" + ("0" + code.toString(16)).slice(-2);
        else out += ch;
    }
    return "'" + out + "'";
}

/* JS 值 → Python 字面量（用于 json=） */
function pyRepr(v, indent) {
    indent = indent || 0;
    var pad = new Array(indent + 1).join("    ");
    if (v === null || v === undefined) return "None";
    if (v === true) return "True";
    if (v === false) return "False";
    if (typeof v === "number") return String(v);
    if (typeof v === "string") return pyStr(v);
    if (Array.isArray(v)) {
        if (!v.length) return "[]";
        var items = v.map(function (x) { return pad + "    " + pyRepr(x, indent + 1); });
        return "[\n" + items.join(",\n") + ",\n" + pad + "]";
    }
    if (typeof v === "object") {
        var keys = Object.keys(v);
        if (!keys.length) return "{}";
        var pairs = keys.map(function (k) {
            return pad + "    " + pyStr(k) + ": " + pyRepr(v[k], indent + 1);
        });
        return "{\n" + pairs.join(",\n") + ",\n" + pad + "}";
    }
    return pyStr(String(v));
}

function tryParseJSON(s) {
    try {
        var v = JSON.parse(s);
        if (v !== null && (typeof v === "object")) return { ok: true, value: v };
        return { ok: false };
    } catch (e) { return { ok: false }; }
}

/* 合并多次 -d：curl 用 & 连接 */
function combinedData(r) {
    return r.data.map(function (d) { return d.value; }).join("&");
}

/* 请求方法 → requests 函数名 */
var METHOD_FN = {
    GET: "get", POST: "post", PUT: "put", DELETE: "delete",
    HEAD: "head", PATCH: "patch", OPTIONS: "options"
};

function generateCode(r) {
    var L = [];
    var notes = []; // 生成的警告注释
    var i, h;

    L.push("import requests");
    L.push("");

    if (!r.url) {
        return {
            code: "# 无法生成代码：未解析到 URL，请检查命令。\n",
            notes: []
        };
    }

    L.push("url = " + pyStr(r.url));
    L.push("");

    // headers
    var headers = r.headers.filter(function (hh) { return hh.name !== ""; });
    if (headers.length) {
        L.push("headers = {");
        for (i = 0; i < headers.length; i++) {
            h = headers[i];
            L.push("    " + pyStr(h.name) + ": " + pyStr(h.value) + ",");
        }
        L.push("}");
        L.push("");
    }

    // cookies
    if (r.cookies.length) {
        L.push("cookies = {");
        for (i = 0; i < r.cookies.length; i++) {
            L.push("    " + pyStr(r.cookies[i].name) + ": " + pyStr(r.cookies[i].value) + ",");
        }
        L.push("}");
        L.push("");
    }

    // 数据体：-F 文件上传 / -F 普通字段 / --data
    var hasBody = false;
    if (r.formFiles.length || r.formFields.length) {
        if (r.formFields.length) {
            L.push("data = {");
            for (i = 0; i < r.formFields.length; i++) {
                L.push("    " + pyStr(r.formFields[i].name) + ": " + pyStr(r.formFields[i].value) + ",");
            }
            L.push("}");
            L.push("");
            hasBody = true;
        }
        if (r.formFiles.length) {
            for (i = 0; i < r.formFiles.length; i++) {
                var ff = r.formFiles[i];
                L.push(ff.name.replace(/[^A-Za-z0-9_]/g, "_") + "_file = open(" + pyStr(ff.file) + ", 'rb')  # 请确认文件路径");
            }
            L.push("files = {");
            for (i = 0; i < r.formFiles.length; i++) {
                var ff2 = r.formFiles[i];
                L.push("    " + pyStr(ff2.name) + ": " + ff2.name.replace(/[^A-Za-z0-9_]/g, "_") + "_file,");
            }
            L.push("}");
            L.push("");
            hasBody = true;
        }
        notes.push("-F/--form 已转为 data/files 形态（multipart/form-data）。");
    }

    if (r.data.length) {
        var raw = combinedData(r);
        var j = tryParseJSON(raw);
        if (j.ok) {
            L.push("# data 为合法 JSON，已使用 json= 参数（requests 会自动设置 Content-Type: application/json）");
            L.push("payload = " + pyRepr(j.value, 0));
            L.push("");
            hasBody = true;
            r._useJson = true;
        } else {
            L.push("data = " + pyStr(raw));
            L.push("");
            hasBody = true;
            r._useJson = false;
        }
    }

    // -k → verify=False
    if (r.insecure) {
        notes.push("-k/--insecure：已生成 verify=False（跳过证书校验，仅用于自签名/测试环境，生产环境请勿使用）。");
    }

    // 未处理参数诊断
    if (r.unhandled.length) {
        for (i = 0; i < r.unhandled.length; i++) {
            var u = r.unhandled[i];
            notes.push("未处理参数：" + u.opt + (u.arg !== null && u.arg !== undefined ? " " + u.arg : "") + " —— 请手动补到代码中。");
        }
    }

    // 调用
    var fn = METHOD_FN[r.method] || "request";
    var args = ["url"];
    if (headers.length) args.push("headers=headers");
    if (r._useJson) args.push("json=payload");
    else if (r.data.length && !r.formFiles.length && !r.formFields.length) args.push("data=data");
    if (r.formFields.length) args.push("data=data");
    if (r.formFiles.length) args.push("files=files");
    if (r.cookies.length) args.push("cookies=cookies");
    if (r.auth) args.push("auth=(" + pyStr(r.auth.user) + ", " + pyStr(r.auth.pass) + ")");
    if (r.timeout !== null && r.timeout !== undefined) args.push("timeout=" + r.timeout);
    if (r.insecure) args.push("verify=False");

    if (METHOD_FN[r.method]) {
        L.push("response = requests." + fn + "(" + args.join(", ") + ")");
    } else {
        L.push("response = requests.request(" + pyStr(r.method) + ", " + args.join(", ") + ")");
    }
    L.push("");
    L.push("print(response.status_code)");
    L.push("print(response.text)");

    var head = [];
    head.push("# 由 cURL 命令转换生成（cURL → Python Requests 转换器）");
    head.push("# 运行前请先安装：pip install requests");
    for (i = 0; i < notes.length; i++) head.push("# 注意：" + notes[i]);
    for (i = 0; i < r.warnings.length; i++) head.push("# 提示：" + r.warnings[i]);
    for (i = 0; i < r.errors.length; i++) head.push("# 错误：" + r.errors[i]);
    if (r.followRedirects) head.push("# 说明：原命令含 -L（跟随重定向）；requests 默认对 GET/HEAD 跟随重定向，如需对 POST 也跟随请自行处理。");
    if (r.ignored.length) head.push("# 忽略的纯展示/下载类选项：" + r.ignored.join("、"));

    return { code: head.join("\n") + "\n\n" + L.join("\n") + "\n", notes: notes };
}

/* ================= 4. 结构化展示数据 ================= */

function summarize(r) {
    var raw = combinedData(r);
    var j = raw ? tryParseJSON(raw) : { ok: false };
    return {
        method: r.method,
        methodNote: r.methodExplicit ? "命令显式指定" : "按有无请求体自动推断",
        url: r.url,
        headerCount: r.headers.length,
        headers: r.headers,
        cookieCount: r.cookies.length,
        cookies: r.cookies,
        bodyKind: r._useJson ? "JSON（json=）"
            : (r.formFiles.length ? "multipart（含文件上传）"
            : (r.formFields.length ? "multipart 表单字段"
            : (r.data.length ? (j.ok ? "JSON（json=）" : "表单/原始数据（data=）") : "无"))),
        bodyPreview: r.formFiles.length || r.formFields.length
            ? (r.formFields.length + " 个字段 / " + r.formFiles.length + " 个文件")
            : truncate(raw, 160),
        auth: r.auth ? r.auth.user + " / " + (r.auth.pass ? "******" : "(空密码)") : null,
        insecure: r.insecure,
        timeout: r.timeout,
        unhandledCount: r.unhandled.length,
        unhandled: r.unhandled,
        warningCount: r.warnings.length,
        warnings: r.warnings,
        errors: r.errors
    };
}

/* 示例命令 */
var SAMPLES = {
    get: "curl 'https://api.example.com/v1/users?page=2' \\\n  -H 'Accept: application/json' \\\n  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test' \\\n  -H 'X-Request-Id: abc-123' \\\n  --compressed",
    postJson: "curl -X POST 'https://api.example.com/v1/users' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test' \\\n  --data-raw '{\"name\": \"张三\", \"age\": 30, \"tags\": [\"vip\", \"new\"], \"active\": true}'",
    form: "curl -X POST https://api.example.com/upload \\\n  -u 'admin:s3cr3t' \\\n  -F 'title=测试图片' \\\n  -F 'file=@/tmp/photo.png' \\\n  --max-time 30",
    auth: "curl -k -u 'user:p@ss' 'https://self-signed.example.com/api/status' \\\n  -H 'Accept: application/json' \\\n  -b 'session=abc123; theme=dark'"
};

var C2R = {
    tokenize: tokenize,
    parseCurl: parseCurl,
    generateCode: generateCode,
    summarize: summarize,
    samples: SAMPLES,
    pyStr: pyStr,
    pyRepr: pyRepr
};

/* ================= 5. 浏览器 UI ================= */

function $(id) { return document.getElementById(id); }

function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderParsed(sum) {
    var html = "";
    html += '<div class="c2r-kv"><span class="c2r-k">方法</span><span class="c2r-method">' + esc(sum.method || "—") + '</span>' +
        '<span class="c2r-sub">' + esc(sum.methodNote) + "</span></div>";
    html += '<div class="c2r-kv"><span class="c2r-k">URL</span><span class="c2r-url">' + esc(sum.url || "（未解析到 URL）") + "</span></div>";

    if (sum.headers.length) {
        html += '<div class="c2r-kv"><span class="c2r-k">Headers</span><div class="c2r-chips">';
        sum.headers.forEach(function (h) {
            html += '<span class="c2r-chip"><b>' + esc(h.name) + "</b>: " + esc(h.value) + "</span>";
        });
        html += "</div></div>";
    } else {
        html += '<div class="c2r-kv"><span class="c2r-k">Headers</span><span class="c2r-none">无</span></div>';
    }

    if (sum.cookies.length) {
        html += '<div class="c2r-kv"><span class="c2r-k">Cookies</span><div class="c2r-chips">';
        sum.cookies.forEach(function (c) {
            html += '<span class="c2r-chip c2r-cookie"><b>' + esc(c.name) + "</b>=" + esc(c.value) + "</span>";
        });
        html += "</div></div>";
    } else {
        html += '<div class="c2r-kv"><span class="c2r-k">Cookies</span><span class="c2r-none">无</span></div>';
    }

    html += '<div class="c2r-kv"><span class="c2r-k">请求体</span><span>' + esc(sum.bodyKind) +
        (sum.bodyPreview ? ' <span class="c2r-sub">' + esc(sum.bodyPreview) + "</span>" : "") + "</span></div>";

    var extra = [];
    if (sum.auth) extra.push("Basic Auth：" + esc(sum.auth));
    if (sum.insecure) extra.push('<span class="c2r-warn">verify=False（-k）</span>');
    if (sum.timeout !== null && sum.timeout !== undefined) extra.push("timeout=" + sum.timeout);
    if (extra.length) html += '<div class="c2r-kv"><span class="c2r-k">其他</span><span>' + extra.join("　") + "</span></div>";

    if (sum.errors.length) {
        html += '<div class="c2r-diag c2r-err"><b>解析错误</b><ul>';
        sum.errors.forEach(function (e) { html += "<li>" + esc(e) + "</li>"; });
        html += "</ul></div>";
    }
    if (sum.unhandled.length) {
        html += '<div class="c2r-diag c2r-unhandled"><b>未处理参数（' + sum.unhandled.length + "）——未静默丢弃，请手动补入代码</b><ul>";
        sum.unhandled.forEach(function (u) {
            html += "<li><code>" + esc(u.opt) + "</code>" + (u.arg ? " <code>" + esc(u.arg) + "</code>" : "") + "</li>";
        });
        html += "</ul></div>";
    }
    if (sum.warnings.length) {
        html += '<div class="c2r-diag c2r-warnbox"><b>提示（' + sum.warnings.length + "）</b><ul>";
        sum.warnings.forEach(function (w) { html += "<li>" + esc(w) + "</li>"; });
        html += "</ul></div>";
    }
    return html;
}

function convertNow() {
    var src = $("c2r-input").value;
    var outBox = $("c2r-code");
    var parsedBox = $("c2r-parsed");
    if (!src.trim()) {
        parsedBox.innerHTML = '<div class="c2r-empty">在上方粘贴 cURL 命令后，解析结果会显示在这里。</div>';
        outBox.textContent = "# 在上方粘贴 cURL 命令，生成的 Python requests 代码会显示在这里。";
        outBox.dataset.code = "";
        return;
    }
    var r = parseCurl(src);
    var gen = generateCode(r);
    var sum = summarize(r);
    parsedBox.innerHTML = renderParsed(sum);
    outBox.textContent = gen.code;
    outBox.dataset.code = gen.code;
}

function downloadPy() {
    var code = $("c2r-code").dataset.code || "";
    if (!code.trim()) { toast("还没有可下载的代码，请先粘贴 cURL 命令。"); return; }
    var blob = new Blob([code], { type: "text/x-python;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "curl_to_requests.py";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast("已下载 curl_to_requests.py");
}

function copyCode() {
    var code = $("c2r-code").dataset.code || "";
    if (!code.trim()) { toast("还没有可复制的代码，请先粘贴 cURL 命令。"); return; }
    function done() { toast("代码已复制到剪贴板"); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done, function () { fallback(); });
    } else { fallback(); }
    function fallback() {
        var ta = document.createElement("textarea");
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); done(); }
        catch (e) { toast("复制失败，请手动选择复制"); }
        ta.remove();
    }
}

var toastTimer = null;
function toast(msg) {
    var el = $("c2r-toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2200);
}

function init() {
    var input = $("c2r-input");
    var timer = null;
    input.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(convertNow, 350);
    });
    $("c2r-convert").addEventListener("click", convertNow);
    $("c2r-clear").addEventListener("click", function () {
        input.value = "";
        convertNow();
        input.focus();
    });
    $("c2r-copy").addEventListener("click", copyCode);
    $("c2r-download").addEventListener("click", downloadPy);
    document.querySelectorAll("[data-sample]").forEach(function (btn) {
        btn.addEventListener("click", function () {
            input.value = SAMPLES[btn.getAttribute("data-sample")];
            convertNow();
            input.focus();
        });
    });
    convertNow();
}

/* node 测试导出；浏览器内初始化 */
if (typeof module !== "undefined" && module.exports) {
    module.exports = C2R;
} else if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
}

})();
