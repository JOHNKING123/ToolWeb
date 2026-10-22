/* MCP 服务器配置诊断器 —— 纯前端静态诊断引擎（零依赖、零网络请求）
* 导出给 node 单元测试的纯函数：
* parseJsonWithLocation / findServersKey / levenshtein / extractBlock /
* findDuplicateKeys / checkNpx / findEnvRefs / diagnose / renderReportText / escapeHtml
* 浏览器 DOM 初始化仅在 document 存在时执行。
*/
(function () {
"use strict";

/* ================= 工具函数 ================= */
function trim(s) { return String(s).replace(/^\s+|\s+$/g, "");}
function isObj(v) { return v!== null && typeof v === "object" &&!Array.isArray(v);}

/* 编辑距离：用于顶层键名近似拼写匹配 */
function levenshtein(a, b) {
a = String(a); b = String(b);
var m = a.length, n = b.length, i, j;
if (m === 0) return n;
if (n === 0) return m;
var d = [];
for (i = 0; i <= m; i++) d[i] = [i];
for (j = 0; j <= n; j++) d[0][j] = j;
for (i = 1; i <= m; i++) {
for (j = 1; j <= n; j++) {
var cost = a.charAt(i - 1) === b.charAt(j - 1)? 0: 1;
d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
}
}
return d[m][n];
}

/* 由字符偏移量换算行号/列号（1 起） */
function lineColOf(text, pos) {
var line = 1, col = 1, i;
pos = Math.max(0, Math.min(pos, text.length));
for (i = 0; i < pos; i++) {
if (text.charAt(i) === "\n") { line++; col = 1;}
else { col++;}
}
return { line: line, col: col};
}

/* JSON 解析并定位语法错误：返回 {ok, value} 或 {ok:false, line, col, message} */
function parseJsonWithLocation(text) {
try {
return { ok: true, value: JSON.parse(text)};
} catch (e) {
var msg = (e && e.message)? String(e.message): "JSON 解析失败";
var m = /at position (\d+)/.exec(msg);
var pos = -1;
if (m) { pos = parseInt(m[1], 10);}
else if (/Unexpected end of JSON input|end of (?:the)?input/i.test(msg)) { pos = text.length;}
var lc = pos >= 0? lineColOf(text, pos): { line: 1, col: 1};
/* 提取该行内容用于展示 */
var lines = text.split("\n");
var lineText = lines[lc.line - 1]!== undefined? lines[lc.line - 1]: "";
return { ok: false, line: lc.line, col: lc.col, position: pos,
message: msg, lineText: lineText};
}
}

/* 顶层 mcpServers 键查找：命中则返回 key；缺失时找近似拼写（#1 常见 bug） */
var CORRECT_KEY = "mcpServers";
var MISSPELL_HINTS = ["mcp_servers", "MCP_SERVERS", "mcpservers", "McpServers",
"mcpServer", "MCPservers", "mcp_Servers", "servers", "mcp_server", "Mcp_Servers"];
function findServersKey(obj) {
if (!isObj(obj)) return { key: null, kind: "not-object"};
if (Object.prototype.hasOwnProperty.call(obj, CORRECT_KEY)) {
return { key: CORRECT_KEY, kind: "ok"};
}
var keys = Object.keys(obj), i, k;
for (i = 0; i < MISSPELL_HINTS.length; i++) {
if (Object.prototype.hasOwnProperty.call(obj, MISSPELL_HINTS[i])) {
return { key: MISSPELL_HINTS[i], kind: "misspelled", found: MISSPELL_HINTS[i]};
}
}
/* 大小写不敏感的近似匹配 */
var lower = CORRECT_KEY.toLowerCase();
for (i = 0; i < keys.length; i++) {
if (keys[i].toLowerCase() === lower) {
return { key: keys[i], kind: "misspelled", found: keys[i]};
}
}
/* 编辑距离兜底：与 mcpServers 距离 <= 3 的键视为拼写错误 */
var best = null, bestDist = 99;
for (i = 0; i < keys.length; i++) {
var d = levenshtein(keys[i], CORRECT_KEY);
if (d < bestDist) { bestDist = d; best = keys[i];}
}
if (best!== null && bestDist <= 3) {
return { key: best, kind: "misspelled", found: best};
}
return { key: null, kind: "missing"};
}

/* 从原文中提取 "key": {...} 的对象块（含花括号），用于同名重复条目检测 */
function extractBlock(text, key) {
var re = new RegExp('"' + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"\\s*:\\s*\\{');
var m = re.exec(text);
if (!m) return null;
var start = m.index + m[0].length - 1; /* 指向开花括号 */
var depth = 0, inStr = false, esc = false, i, ch;
for (i = start; i < text.length; i++) {
ch = text.charAt(i);
if (inStr) {
if (esc) { esc = false;}
else if (ch === "\\") { esc = true;}
else if (ch === '"') { inStr = false;}
} else {
if (ch === '"') { inStr = true;}
else if (ch === "{") { depth++;}
else if (ch === "}") {
depth--;
if (depth === 0) return text.slice(start, i + 1);
}
}
}
return null;
}

/* 在对象块文本中找出顶层重复键名（JSON 解析会静默丢弃前者，需单独扫描原文） */
function findDuplicateKeys(blockText) {
var counts = {}, order = [], i, ch, depth = 0, inStr = false, esc = false;
var strVal = "";
function flushKey() {
if (depth === 1) {
if (!counts[strVal]) { counts[strVal] = 0; order.push(strVal);}
counts[strVal]++;
}
strVal = "";
}
for (i = 0; i < blockText.length; i++) {
ch = blockText.charAt(i);
if (inStr) {
if (esc) { strVal += ch; esc = false;}
else if (ch === "\\") { esc = true;}
else if (ch === '"') {
inStr = false;
/* 字符串紧跟冒号即为键 */
var j = i + 1;
while (j < blockText.length && /\s/.test(blockText.charAt(j))) j++;
if (blockText.charAt(j) === ":") flushKey();
strVal = "";
}
else { strVal += ch;}
} else {
if (ch === '"') { inStr = true; strVal = "";}
else if (ch === "{") { depth++;}
else if (ch === "}") { depth--;}
}
}
return order.filter(function (k) { return counts[k] > 1;})
.map(function (k) { return { name: k, count: counts[k]};});
}

/* npx 包名检查：command 为 npx 但 args 里没有包名（仅 -y 等标志）时告警 */
var NPX_BOOL_FLAGS = { "-y": 1, "--yes": 1, "-q": 1, "--quiet": 1};
function checkNpx(command, args) {
var base = String(command || "").split(/[\\/]/).pop().toLowerCase();
if (base!== "npx" && base!== "npx.cmd" && base!== "npx.exe") return { applies: false};
args = Array.isArray(args)? args: [];
var positional = [];
var i, a;
for (i = 0; i < args.length; i++) {
a = String(args[i]);
if (NPX_BOOL_FLAGS[a]) continue;
if (/^--?[^=\s]+=.+$/.test(a)) continue; /* --registry=xxx 这类带值标志 */
if (/^-/.test(a)) {
/* 可能是带值的短/长标志：跳过其下一个 token（如 -p pkg / --package pkg） */
if (/^(-p|--package|--cache|--userconfig)$/.test(a) && i + 1 < args.length) i++;
continue;
}
positional.push(a);
}
if (positional.length === 0) {
return { applies: true, missing: true,
detail: args.length === 0? "args 为空": "args 只有标志位（" + args.join(" ") + "），没有包名"};
}
return { applies: true, missing: false, package: positional[0]};
}

/* 提取字符串中的 ${VAR} 环境变量引用 */
function findEnvRefs(s) {
var refs = [], re = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, m;
while ((m = re.exec(String(s || "")))!== null) refs.push(m[1]);
return refs;
}

/* 已知字段白名单：未知字段给建议 */
var KNOWN_FIELDS = {
command: 1, args: 1, env: 1, url: 1, type: 1, headers: 1,
timeout: 1, disabled: 1, cwd: 1, description: 1
};
var KNOWN_TYPES = { stdio: 1, http: 1, sse: 1};

function pushIssue(issues, level, rule, title, detail, fix, location) {
issues.push({ level: level, rule: rule, title: title, detail: detail || "",
fix: fix || "", location: location || ""});
}

/* ================= 主诊断 ================= */
function diagnose(text) {
var issues = [];
text = String(text == null? "": text);
if (trim(text) === "") {
pushIssue(issues, "info", "empty", "等待输入",
"在左侧粘贴 MCP 客户端配置文件（Claude Desktop / Cursor / OpenCode 的 mcpServers 配置），这里会输出分级诊断报告。", "", "");
return { issues: issues, counts: countIssues(issues), servers: [], text: text};
}

var parsed = parseJsonWithLocation(text);
if (!parsed.ok) {
var loc = "第 " + parsed.line + " 行，第 " + parsed.col + " 列";
var hint = "检查该位置附近的括号/引号/逗号是否配对（如多余的尾逗号、未闭合的引号）。";
if (/Unexpected end of JSON input|end of (?:the)?input/i.test(parsed.message)) {
hint = "输入在末尾处意外结束：检查是否有未闭合的花括号、方括号或引号。";
}
pushIssue(issues, "error", "json-syntax", "JSON 语法错误",
"解析失败（" + parsed.message + "），位置：" + loc +
(parsed.lineText!== ""? "\n该行内容：" + parsed.lineText: ""),
hint, loc);
return { issues: issues, counts: countIssues(issues), servers: [], text: text,
parseError: { line: parsed.line, col: parsed.col}};
}

var root = parsed.value;
if (Array.isArray(root)) {
pushIssue(issues, "error", "root-type", "顶层应为对象",
"当前顶层是一个数组。MCP 客户端配置的顶层应为对象，形如 {\"mcpServers\": {\"server名\": {...}}}。",
"把最外层改为 { \"mcpServers\": {...}} 的对象形式。", "顶层");
return { issues: issues, counts: countIssues(issues), servers: [], text: text};
}
if (!isObj(root)) {
pushIssue(issues, "error", "root-type", "顶层应为对象",
"当前顶层不是对象。MCP 客户端配置的顶层应为对象，形如 {\"mcpServers\": {\"server名\": {...}}}。",
"把最外层改为对象形式。", "顶层");
return { issues: issues, counts: countIssues(issues), servers: [], text: text};
}

/* 规则①：顶层键名拼写（#1 常见 bug） */
var keyInfo = findServersKey(root);
var serversKey = null;
if (keyInfo.kind === "misspelled") {
pushIssue(issues, "error", "top-key", "顶层键名拼写错误（#1 常见 bug）",
"发现顶层键 \"" + keyInfo.found + "\"，疑似 \"mcpServers\" 的拼写错误。MCP 客户端只认大小写敏感的 mcpServers，拼错会导致整个配置被静默忽略、所有 server 不加载。",
"把 \"" + keyInfo.found + "\" 改为 \"mcpServers\"（注意大小写：m-c-p 大写 S）。", "顶层");
serversKey = keyInfo.key; /* 继续用该键做后续检查 */
} else if (keyInfo.kind === "missing") {
var ks = Object.keys(root);
pushIssue(issues, "error", "top-key", "未找到顶层 mcpServers 键",
ks.length? "顶层现有键：" + ks.map(function (k) { return "\"" + k + "\"";}).join("、") + "，均不是 mcpServers。"
: "顶层是一个空对象。",
"在顶层添加 \"mcpServers\": { \"server名\": {...}}。", "顶层");
return { issues: issues, counts: countIssues(issues), servers: [], text: text};
} else {
serversKey = CORRECT_KEY;
}

var servers = root[serversKey];
if (!isObj(servers)) {
pushIssue(issues, "error", "servers-type", "\"" + serversKey + "\" 应为对象",
"当前 \"" + serversKey + "\" 的类型是 " + (Array.isArray(servers)? "数组": typeof servers) +
"。它应为对象，每个键是一个 server 名。",
"改为 { \"server名\": { \"command\": \"...\", \"args\": [...]}} 的形式。", "顶层 › " + serversKey);
return { issues: issues, counts: countIssues(issues), servers: [], text: text};
}

var names = Object.keys(servers);
if (names.length === 0) {
pushIssue(issues, "warning", "servers-empty", "mcpServers 为空",
"没有定义任何 server，客户端将不会加载任何 MCP 服务器。",
"至少添加一个 server 条目。", "顶层 › " + serversKey);
}

/* 规则⑥：同名重复条目（JSON 解析会静默保留最后一个，需扫描原文） */
var block = extractBlock(text, serversKey);
if (block) {
var dups = findDuplicateKeys(block);
dups.forEach(function (d) {
pushIssue(issues, "warning", "duplicate", "同名重复条目：「" + d.name + "」出现 " + d.count + " 次",
"JSON 解析时同名键只会保留最后一个定义，前面的会被静默丢弃，容易造成「改了配置没生效」的困惑。",
"合并为一条 \"" + d.name + "\" 定义，删除重复项。", serversKey + " › " + d.name);
});
}

/* 逐 server 检查 */
names.forEach(function (name) {
var def = servers[name];
var loc = serversKey + " › " + name;
if (!isObj(def)) {
pushIssue(issues, "error", "server-type", "「" + name + "」的定义应为对象",
"当前类型是 " + (Array.isArray(def)? "数组": typeof def) + "。",
"改为 { \"command\": \"...\", \"args\": [...]} 或 { \"url\": \"https://...\"} 的对象形式。", loc);
return;
}
if (def.disabled === true) {
pushIssue(issues, "info", "disabled", "「" + name + "」已禁用",
"该 server 设置了 \"disabled\": true，客户端会跳过它。",
"确认这是有意为之；如需启用请删除该字段或改为 false。", loc);
}

var isHttp = def.url!== undefined && def.url!== null && def.url!== "";
var typeVal = def.type!== undefined? String(def.type): "";
if (typeVal &&!KNOWN_TYPES[typeVal]) {
pushIssue(issues, "warning", "type-value", "「" + name + "」的 type 取值可疑",
"type = \"" + typeVal + "\"，常见取值为 stdio / http / sse。",
"确认客户端是否支持该 type；否则改为 stdio、http 或 sse。", loc);
}
if ((typeVal === "http" || typeVal === "sse") &&!isHttp) {
pushIssue(issues, "error", "missing-url", "「" + name + "」缺 url",
"type 声明为 " + typeVal + "，但没有提供 url。",
"添加 \"url\": \"https://…\"（或 " + typeVal.toUpperCase() + " 端点地址）。", loc);
}

if (isHttp) {
/* 规则③：http/SSE 型 */
if (typeof def.url!== "string" || trim(def.url) === "") {
pushIssue(issues, "error", "url-type", "「" + name + "」的 url 无效",
"url 应为非空字符串。",
"填写完整的服务端地址，如 \"url\": \"https://example.com/mcp\"。", loc);
} else if (!/^https?:\/\//i.test(trim(def.url))) {
pushIssue(issues, "warning", "url-scheme", "「" + name + "」的 url 协议可疑",
"url = \"" + def.url + "\"，通常应以 http:// 或 https:// 开头。",
"确认地址无误；本地测试用 http://127.0.0.1:端口 是可以的。", loc);
}
if (!typeVal) {
pushIssue(issues, "info", "type-hint", "「" + name + "」建议显式声明 type",
"检测到 url，推断为远程型 server，但未声明 type。",
"按服务端协议加上 \"type\": \"http\" 或 \"type\": \"sse\"，避免客户端按默认 stdio 解析。", loc);
}
if (def.command!== undefined) {
pushIssue(issues, "info", "mixed", "「" + name + "」同时有 url 和 command",
"远程型 server 通常只需要 url；command 会被多数客户端忽略。",
"确认客户端文档；不需要时删除 command 字段。", loc);
}
} else if (!(typeVal === "http" || typeVal === "sse")) {
/* 规则③：stdio 型（默认；http/sse 型缺 url 已在上面报错，不再重复要求 command） */
if (def.command === undefined || def.command === null || trim(String(def.command)) === "") {
pushIssue(issues, "error", "missing-command", "「" + name + "」缺 command",
"stdio 型 server 必须提供 command（要执行的可执行文件，如 npx / node / python）。",
"添加 \"command\": \"npx\"（或 node、python 等可执行文件路径）。", loc);
} else if (typeof def.command!== "string") {
pushIssue(issues, "error", "command-type", "「" + name + "」的 command 类型错误",
"command 应为字符串，当前是 " + typeof def.command + "。",
"改为字符串，如 \"command\": \"npx\"。", loc);
}
}

/* 规则⑦：args 非数组等格式问题 */
if (def.args!== undefined &&!Array.isArray(def.args)) {
pushIssue(issues, "error", "args-type", "「" + name + "」的 args 应为数组",
"当前 args 类型是 " + typeof def.args + "。参数必须写成数组形式。",
"改为 \"args\": [\"-y\", \"@scope/pkg\"] 这样的数组。", loc);
}
if (def.env!== undefined &&!isObj(def.env)) {
pushIssue(issues, "error", "env-type", "「" + name + "」的 env 应为对象",
"当前 env 类型是 " + (Array.isArray(def.env)? "数组": typeof def.env) + "。",
"改为 \"env\": { \"KEY\": \"value\"} 的对象形式。", loc);
}

/* 规则④：npx 模式缺包名 */
var npx = checkNpx(def.command, def.args);
if (npx.applies && npx.missing) {
pushIssue(issues, "warning", "npx-package", "「" + name + "」npx 调用缺少包名",
"command 是 npx，但 " + npx.detail + "。npx 不知道要运行哪个包。",
"在 args 里加上包名，如 \"args\": [\"-y\", \"@modelcontextprotocol/server-filesystem\"]。", loc);
}

/* 规则⑤：${VAR} 引用的环境变量在 env 中未定义 */
var envObj = isObj(def.env)? def.env: {};
var refs = [];
if (typeof def.command === "string") refs = refs.concat(findEnvRefs(def.command));
if (Array.isArray(def.args)) {
def.args.forEach(function (a) { refs = refs.concat(findEnvRefs(a));});
}
var seen = {}, missing = [];
refs.forEach(function (v) {
if (seen[v]) return; seen[v] = 1;
if (!Object.prototype.hasOwnProperty.call(envObj, v)) missing.push(v);
});
missing.forEach(function (v) {
pushIssue(issues, "warning", "env-ref", "「" + name + "」引用了未定义的环境变量 ${" + v + "}",
"command/args 中出现了 ${" + v + "}，但 env 里没有定义它。运行时该变量可能为空，导致 server 启动失败。",
"在 env 中补充，如 \"env\": { \"" + v + "\": \"你的值\"}；或确认该变量在系统环境中已存在。", loc);
});
/* env 值内部的 ${VAR} 引用也检查 */
Object.keys(envObj).forEach(function (k) {
findEnvRefs(envObj[k]).forEach(function (v) {
if (!Object.prototype.hasOwnProperty.call(envObj, v)) {
pushIssue(issues, "info", "env-ref", "「" + name + "」的 env." + k + " 引用了未定义的 ${" + v + "}",
"env 值中出现 ${" + v + "}，但同级 env 里没有它。",
"确认该变量来自系统环境，或在 env 中一并定义。", loc);
}
});
});

/* 未知字段建议 */
Object.keys(def).forEach(function (f) {
if (!KNOWN_FIELDS[f]) {
pushIssue(issues, "info", "unknown-field", "「" + name + "」含未知字段 \"" + f + "\"",
"该字段不在常见 MCP 配置字段（command/args/env/url/type/headers/timeout/disabled/cwd/description）之中，可能被客户端忽略。",
"核对客户端文档确认拼写；无用则删除。", loc);
}
});
});

return { issues: issues, counts: countIssues(issues), servers: names, text: text};
}

function countIssues(issues) {
var c = { error: 0, warning: 0, info: 0};
issues.forEach(function (it) { if (c[it.level]!== undefined) c[it.level]++;});
return c;
}

/* 纯文本报告（供一键复制） */
function renderReportText(diag) {
var c = diag.counts;
var lines = [];
lines.push("MCP 服务器配置诊断报告");
lines.push("=".repeat(28));
lines.push("检查 server 数：" + diag.servers.length +
"　错误：" + c.error + "　警告：" + c.warning + "　建议：" + c.info);
lines.push("");
if (diag.issues.length === 0) {
lines.push("✅ 配置合法，全部通过。");
} else {
var order = { error: 0, warning: 1, info: 2};
var label = { error: "\u3010\u9519\u8bef\u3011", warning: "\u3010\u8b66\u544a\u3011", info: "\u3010\u5efa\u8bae\u3011"};
diag.issues.slice().sort(function (a, b) { return order[a.level] - order[b.level];})
.forEach(function (it, idx) {
lines.push((idx + 1) + ". " + label[it.level] + it.title);
if (it.location) lines.push(" 位置：" + it.location);
if (it.detail) lines.push(" 说明：" + it.detail.replace(/\n/g, "\n "));
if (it.fix) lines.push(" 修复：" + it.fix);
lines.push("");
});
}
lines.push("—— 由 MCP 服务器配置诊断器生成（纯本地诊断，未上传任何数据）");
return lines.join("\n");
}

/* ================= 示例配置 ================= */
var SAMPLE_OK = '{\n' +
' "mcpServers": {\n' +
' "filesystem": {\n' +
' "command": "npx",\n' +
' "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/demo/docs"],\n' +
' "env": { "DEBUG": "false"}\n' +
'},\n' +
' "web-search": {\n' +
' "command": "node",\n' +
' "args": ["./servers/web-search.js", "--api-key", "${SEARCH_API_KEY}"],\n' +
' "env": { "SEARCH_API_KEY": "sk-xxxx"}\n' +
'},\n' +
' "remote-docs": {\n' +
' "type": "http",\n' +
' "url": "https://docs.example.com/mcp"\n' +
'}\n' +
'}\n' +
'}';

var SAMPLE_BAD = '{\n' +
' "mcp_servers": {\n' +
' "filesystem": {\n' +
' "command": "npx",\n' +
' "args": ["-y"]\n' +
'},\n' +
' "broken": {\n' +
' "args": ["server.js"]\n' +
'},\n' +
' "remote": {\n' +
' "type": "sse"\n' +
'},\n' +
' "dupe": {\n' +
' "command": "node",\n' +
' "args": ["a.js", "${MISSING_TOKEN}"]\n' +
'},\n' +
' "dupe": {\n' +
' "command": "node",\n' +
' "args": "--port 8080"\n' +
'}\n' +
'}\n' +
'}';

function escapeHtml(s) {
return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
.replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ================= 浏览器 DOM 初始化 ================= */
function mdInit() {
function $(id) { return document.getElementById(id);}
var input = $("md-input"), out = $("md-out"), stats = $("md-stats"),
count = $("md-count"), tip = $("md-copy-tip");

function showToast(msg) {
var t = $("md-toast");
t.textContent = msg;
t.classList.add("show");
clearTimeout(t._h);
t._h = setTimeout(function () { t.classList.remove("show");}, 2200);
}
function copyText(text, okMsg) {
function done(ok) {
tip.style.display = "block";
tip.innerHTML = ok? '<span class="md-copy-ok">✓ ' + escapeHtml(okMsg) + "</span>"
: '<span class="md-copy-fail">✗ 复制失败，请手动全选复制</span>';
setTimeout(function () { tip.style.display = "none";}, 2500);
}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(function () { done(true);}, function () { done(false);});
} else {
var ta = document.createElement("textarea");
ta.value = text;
document.body.appendChild(ta);
ta.select();
try { done(document.execCommand("copy"));} catch (e) { done(false);}
document.body.removeChild(ta);
}
}

var LEVELS = {
error: { badge: "md-b-err", text: "错误"},
warning: { badge: "md-b-warn", text: "警告"},
info: { badge: "md-b-info", text: "建议"}
};

function render() {
var text = input.value;
count.textContent = "共 " + text.length + " 字符";
var diag = diagnose(text);
var c = diag.counts;
var verdict, vcls;
if (trim(text) === "") {
verdict = "等待输入"; vcls = "";
} else if (c.error > 0) {
verdict = "✗ 发现 " + c.error + " 个错误"; vcls = "md-bad";
} else if (c.warning > 0) {
verdict = "⚠ 通过但有 " + c.warning + " 个警告"; vcls = "md-warn";
} else {
verdict = "✓ 配置合法，全部通过"; vcls = "md-ok";
}
stats.innerHTML = '<b class="' + vcls + '">' + escapeHtml(verdict) + "</b>" +
"　·　server " + diag.servers.length + " 个　·　错误 " + c.error +
"　·　警告 " + c.warning + "　·　建议 " + c.info;
out.dataset.text = renderReportText(diag);

if (diag.issues.length === 0 && trim(text)!== "") {
out.innerHTML = '<div class="md-pass"><i class="material-icons">verified</i>' +
'<div><b>配置合法，全部通过</b><br>未发现拼写、字段、npx 包名、环境变量引用或重复条目问题。</div></div>';
return;
}
if (trim(text) === "") {
out.innerHTML = '<div class="md-empty">在左侧粘贴 MCP 客户端配置 JSON 后，这里会输出分级诊断报告。</div>';
return;
}
var order = { error: 0, warning: 1, info: 2};
var html = diag.issues.slice().sort(function (a, b) { return order[a.level] - order[b.level];})
.map(function (it) {
var L = LEVELS[it.level];
var h = '<div class="md-issue md-' + it.level + '">';
h += '<span class="md-badge ' + L.badge + '">' + L.text + "</span>";
h += '<div class="md-body"><div class="md-title">' + escapeHtml(it.title) + "</div>";
if (it.location) h += '<div class="md-loc">📍 ' + escapeHtml(it.location) + "</div>";
if (it.detail) h += '<div class="md-detail">' + escapeHtml(it.detail).replace(/\n/g, "<br>") + "</div>";
if (it.fix) h += '<div class="md-fix">💡 修复：' + escapeHtml(it.fix) + "</div>";
h += "</div></div>";
return h;
}).join("");
out.innerHTML = html;
}

input.addEventListener("input", render);
$("md-sample-ok").addEventListener("click", function () { input.value = SAMPLE_OK; render(); showToast("已载入正常示例配置");});
$("md-sample-bad").addEventListener("click", function () { input.value = SAMPLE_BAD; render(); showToast("已载入典型故障示例配置");});
$("md-clear").addEventListener("click", function () { input.value = ""; render();});
$("md-copy").addEventListener("click", function () {
var t = out.dataset.text || "";
if (!t || trim(input.value) === "") { showToast("暂无可复制的报告"); return;}
copyText(t, "诊断报告已复制");
});
var file = $("md-file");
$("md-drop").addEventListener("click", function () { file.click();});
file.addEventListener("change", function () {
if (!file.files ||!file.files[0]) return;
var r = new FileReader();
r.onload = function () { input.value = String(r.result || ""); render(); showToast("已载入文件：" + file.files[0].name);};
r.readAsText(file.files[0]);
file.value = "";
});
render();
}

if (typeof document!== "undefined" && typeof window!== "undefined") {
if (document.readyState === "loading") {
document.addEventListener("DOMContentLoaded", mdInit);
} else { mdInit();}
}

if (typeof module!== "undefined" && module.exports) {
module.exports = {
trim: trim, levenshtein: levenshtein, lineColOf: lineColOf,
parseJsonWithLocation: parseJsonWithLocation, findServersKey: findServersKey,
extractBlock: extractBlock, findDuplicateKeys: findDuplicateKeys,
checkNpx: checkNpx, findEnvRefs: findEnvRefs,
diagnose: diagnose, renderReportText: renderReportText,
escapeHtml: escapeHtml, SAMPLE_OK: SAMPLE_OK, SAMPLE_BAD: SAMPLE_BAD
};
}

})();
