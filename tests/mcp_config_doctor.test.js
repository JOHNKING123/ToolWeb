/* MCP 服务器配置诊断器纯逻辑单元测试（零依赖）：node tests/mcp_config_doctor.test.js
* 覆盖：
* 1. JSON 解析与语法错误行号/列号定位
* 2. 顶层 mcpServers 键名拼写规则（#1 bug）
* 3. stdio 缺 command、http/SSE 缺 url、字段类型校验
* 4. npx 包名缺失警告
* 5. ${VAR} 环境变量引用未定义警告
* 6. 同名重复条目警告
* 7. args 非数组等格式问题
* 8. 分级报告排序与纯文本渲染
* 9. 示例配置（正常全绿 / 故障命中规则）
* 10. 零上传：脚本内无 fetch/XHR/WebSocket/EventSource
*/
"use strict";
var T = require("../static/js/mcp_config_doctor.js");
var fs = require("fs");

var pass = 0, fail = 0;
function ok(cond, name) {
if (cond) { pass++;}
else { fail++; console.error("FAIL:", name);}
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）");}
function contains(s, sub, name) { ok(String(s).indexOf(sub)!== -1, name + "（期望包含 " + JSON.stringify(sub) + "）");}
function notContains(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）");}
function hasRule(diag, rule) {
return diag.issues.some(function (x) { return x.rule === rule;});
}
function hasLevelRule(diag, level, rule) {
return diag.issues.some(function (x) { return x.level === level && x.rule === rule;});
}

/* ================= 1. JSON 解析与错误定位 ================= */
(function () {
var r = T.parseJsonWithLocation('{"mcpServers": {}}');
eq(r.ok, true, "合法 JSON 解析成功");
eq(typeof r.value, "object", "解析出对象");

r = T.parseJsonWithLocation('{\n "mcpServers": {\n "a": {,\n}\n}');
eq(r.ok, false, "非法 JSON 解析失败");
eq(r.line, 3, "错误定位到第 3 行");
ok(r.col >= 1, "列号有效");
ok(r.message.length > 0, "错误信息保留引擎原文");
ok(r.lineText!== undefined, "返回错误行文本");

r = T.parseJsonWithLocation('{"mcpServers": {"a": {"command": "npx"');
eq(r.ok, false, "未闭合括号解析失败");
ok(r.line >= 1, "未闭合输入也给出位置");

var lc = T.lineColOf("ab\ncd\nef", 4);
eq(lc.line, 2, "lineColOf 行号");
eq(lc.col, 2, "lineColOf 列号");
})();

/* ================= 2. 顶层键名拼写（#1 bug） ================= */
(function () {
var d = T.diagnose('{"mcp_servers": {"a": {"command": "npx", "args": ["-y", "pkg"]}}}');
ok(hasLevelRule(d, "error", "top-key"), "mcp_servers 拼错→error 命中");
contains(d.issues.filter(function (x) { return x.rule === "top-key";})[0].title, "#1", "标题标注 #1 常见 bug");

d = T.diagnose('{"MCP_SERVERS": {"a": {"command": "x"}}}');
ok(hasLevelRule(d, "error", "top-key"), "MCP_SERVERS 全大写→error 命中");

d = T.diagnose('{"mcpServer": {"a": {"command": "x"}}}');
ok(hasLevelRule(d, "error", "top-key"), "mcpServer 单数→error 命中（编辑距离兜底）");

d = T.diagnose('{"mcpServers": {"a": {"command": "x"}}}');
ok(!hasRule(d, "top-key"), "正确拼写不触发");

d = T.diagnose('{"foo": 1}');
ok(hasLevelRule(d, "error", "top-key"), "完全无 mcpServers 键→error");
ok(!hasRule(d, "missing-command"), "缺顶层键时不继续逐 server 检查");

d = T.diagnose('[]');
ok(hasLevelRule(d, "error", "root-type"), "顶层数组→error");

d = T.diagnose('{"mcpServers": []}');
ok(hasLevelRule(d, "error", "servers-type"), "mcpServers 为数组→error");
})();

/* ================= 3. 必需字段与类型校验 ================= */
(function () {
var d = T.diagnose('{"mcpServers": {"s": {"args": ["a.js"]}}}');
ok(hasLevelRule(d, "error", "missing-command"), "stdio 缺 command→error");

d = T.diagnose('{"mcpServers": {"s": {"command": 123}}}');
ok(hasLevelRule(d, "error", "command-type"), "command 非字符串→error");

d = T.diagnose('{"mcpServers": {"s": {"type": "sse"}}}');
ok(hasLevelRule(d, "error", "missing-url"), "sse 型缺 url→error");
ok(!hasRule(d, "missing-command"), "sse 型缺 url 时不重复报缺 command");

d = T.diagnose('{"mcpServers": {"s": {"type": "http", "url": ""}}}');
ok(hasLevelRule(d, "error", "missing-url") || hasLevelRule(d, "error", "url-type"), "http 型 url 为空→error");

d = T.diagnose('{"mcpServers": {"s": {"url": "notaurl"}}}');
ok(hasLevelRule(d, "warning", "url-scheme"), "url 无协议→warning");

d = T.diagnose('{"mcpServers": {"s": {"url": "https://x.com/mcp"}}}');
ok(!hasRule(d, "url-scheme"), "合法 https url 不告警");
ok(hasLevelRule(d, "info", "type-hint"), "有 url 无 type→info 建议显式声明");

d = T.diagnose('{"mcpServers": {"s": {"type": "websocket", "command": "x"}}}');
ok(hasLevelRule(d, "warning", "type-value"), "未知 type 取值→warning");

d = T.diagnose('{"mcpServers": {"s": {"command": "x", "args": "not-array"}}}');
ok(hasLevelRule(d, "error", "args-type"), "args 非数组→error");

d = T.diagnose('{"mcpServers": {"s": {"command": "x", "env": ["A"]}}}');
ok(hasLevelRule(d, "error", "env-type"), "env 非对象→error");

d = T.diagnose('{"mcpServers": {"s": {"command": "x", "bogus_field": 1}}}');
ok(hasLevelRule(d, "info", "unknown-field"), "未知字段→info 建议");

d = T.diagnose('{"mcpServers": {"s": {"command": "x", "disabled": true}}}');
ok(hasLevelRule(d, "info", "disabled"), "disabled:true→info 提示");
})();

/* ================= 4. npx 包名 ================= */
(function () {
var r = T.checkNpx("npx", ["-y"]);
eq(r.applies, true, "npx 适用检查");
eq(r.missing, true, "仅 -y →缺包名");

r = T.checkNpx("npx", []);
eq(r.missing, true, "args 为空→缺包名");

r = T.checkNpx("npx", ["-y", "@scope/pkg"]);
eq(r.missing, false, "-y @scope/pkg→有包名");
eq(r.package, "@scope/pkg", "包名识别正确");

r = T.checkNpx("npx", ["-y", "some-tool", "--port", "8080"]);
eq(r.missing, false, "npx some-tool→有包名");

r = T.checkNpx("/usr/local/bin/npx", ["-y"]);
eq(r.missing, true, "全路径 npx 也识别");

r = T.checkNpx("node", ["-y"]);
eq(r.applies, false, "node 不适用 npx 检查");

var d = T.diagnose('{"mcpServers": {"s": {"command": "npx", "args": ["-y"]}}}');
ok(hasLevelRule(d, "warning", "npx-package"), "诊断：npx 缺包名→warning");

d = T.diagnose('{"mcpServers": {"s": {"command": "npx", "args": ["-y", "my-pkg"]}}}');
ok(!hasRule(d, "npx-package"), "诊断：npx 有包名不告警");
})();

/* ================= 5. ${VAR} 环境变量引用 ================= */
(function () {
eq(T.findEnvRefs("run --key ${API_KEY} x").join(","), "API_KEY", "提取 ${VAR}");
eq(T.findEnvRefs("no refs").length, 0, "无引用返回空");
eq(T.findEnvRefs("${A} and ${B}").join(","), "A,B", "多个引用");

var d = T.diagnose('{"mcpServers": {"s": {"command": "node", "args": ["a.js", "${MISSING_TOKEN}"]}}}');
ok(hasLevelRule(d, "warning", "env-ref"), "${MISSING_TOKEN} 未定义→warning");

d = T.diagnose('{"mcpServers": {"s": {"command": "run-${MODE}", "args": [], "env": {"MODE": "prod"}}}}');
ok(!hasRule(d, "env-ref"), "command 中引用已在 env 定义→不告警");

d = T.diagnose('{"mcpServers": {"s": {"command": "x", "env": {"A": "${B}"}}}}');
ok(hasLevelRule(d, "info", "env-ref"), "env 值引用未定义变量→info");
})();

/* ================= 6. 同名重复条目 ================= */
(function () {
var dups = T.findDuplicateKeys('{"dupe": {"a": 1}, "ok": {"b": 2}, "dupe": {"c": 3}}');
eq(dups.length, 1, "检出 1 组重复");
eq(dups[0].name, "dupe", "重复名正确");
eq(dups[0].count, 2, "重复次数正确");

dups = T.findDuplicateKeys('{"a": {"x": 1}, "b": {"y": 2}}');
eq(dups.length, 0, "无重复返回空");

/* 嵌套对象里的同名键不应误报 */
dups = T.findDuplicateKeys('{"a": {"env": {"K": "1"}}, "b": {"env": {"K": "2"}}}');
eq(dups.length, 0, "嵌套同名键不误报");

var d = T.diagnose(T.SAMPLE_BAD);
ok(hasLevelRule(d, "warning", "duplicate"), "故障示例→重复条目 warning");
/* 含转义字符的配置（Windows 路径 C:\\...）不应崩溃，且重复检测仍可用 */
(function () {
var cfg = '{"mcpServers": {"w": {"command": "C:\\\\tools\\\\npx.cmd", "args": ["-y"]}, "w": {"command": "x"}}}';
var d = T.diagnose(cfg);
ok(hasLevelRule(d, "warning", "duplicate"), "含转义路径的配置仍能检出重复条目");
})();
})();

/* ================= 7. 分级排序与文本报告 ================= */
(function () {
var d = T.diagnose(T.SAMPLE_BAD);
eq(d.counts.error > 0, true, "故障示例有错误");
eq(d.counts.warning > 0, true, "故障示例有警告");
var t = T.renderReportText(d);
contains(t, "MCP 服务器配置诊断报告", "报告含标题");
contains(t, "\u3010\u9519\u8bef\u3011", "报告含错误段");
contains(t, "\u3010\u8b66\u544a\u3011", "报告含警告段");
contains(t, "位置：", "报告含位置");
contains(t, "修复：", "报告含修复建议");

/* error 排在 warning 之前 */
var firstErr = t.indexOf("\u3010\u9519\u8bef\u3011"), firstWarn = t.indexOf("\u3010\u8b66\u544a\u3011");
ok(firstErr!== -1 && firstErr < firstWarn, "错误排在警告之前");

var okd = T.diagnose(T.SAMPLE_OK);
eq(okd.counts.error, 0, "正常示例零错误");
eq(okd.counts.warning, 0, "正常示例零警告");
eq(okd.counts.info, 0, "正常示例零建议");
contains(T.renderReportText(okd), "全部通过", "正常示例报告全绿");

var empty = T.diagnose(" ");
ok(empty.issues.length > 0 && empty.issues[0].level === "info", "空输入给出 info 提示");
})();

/* ================= 8. 故障示例命中全部核心规则 ================= */
(function () {
var d = T.diagnose(T.SAMPLE_BAD);
ok(hasLevelRule(d, "error", "top-key"), "故障示例：顶层拼写");
ok(hasLevelRule(d, "error", "missing-command"), "故障示例：缺 command");
ok(hasLevelRule(d, "error", "missing-url"), "故障示例：缺 url");
ok(hasLevelRule(d, "error", "args-type"), "故障示例：args 非数组");
ok(hasLevelRule(d, "warning", "npx-package"), "故障示例：npx 缺包名");
ok(hasLevelRule(d, "warning", "duplicate"), "故障示例：重复条目");
ok(!hasRule(d, "env-ref"), "故障示例：被覆盖的重复项不误报 env 引用");
})();

/* ================= 9. 零上传 ================= */
(function () {
var src = fs.readFileSync(__dirname + "/../static/js/mcp_config_doctor.js", "utf8");
["fetch(", "XMLHttpRequest", "WebSocket", "EventSource", "navigator.sendBeacon"].forEach(function (kw) {
ok(src.indexOf(kw) === -1, "脚本内无 " + kw);
});
})();

console.log("\n通过 " + pass + " / " + (pass + fail) + " 断言" + (fail? ("，失败 " + fail): ""));
process.exit(fail? 1: 0);
