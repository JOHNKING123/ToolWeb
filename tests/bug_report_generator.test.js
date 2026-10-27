/* Bug 报告生成器（bug_report_generator）纯逻辑单元测试（零依赖）：
 * node tests/bug_report_generator.test.js
 * 覆盖：验收精确向量、空行跳过与重编号、缺省占位、标题去空白、
 * 四档严重度与默认档、空标题与空步骤提示、示例向量、
 * 全文无行首行尾空格与节间空一行、注册（196→197 Path）与零网络请求静态检查、
 * 模板真限制文案与互链（代码打包给 LLM，不含未交付工具）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var B = require("../static/js/bug_report_generator.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "bug_report_generator.js"), "utf8");
var TPL = fs.readFileSync(path.join(__dirname, "..", "templates", "bug_report_generator.html"), "utf8");
var GO = fs.readFileSync(path.join(__dirname, "..", "tools", "categories.go"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name); }
function checkClean(output, name) {
    var lines = output.split("\n");
    var good = true;
    for (var i = 0; i < lines.length; i++) {
        if (lines[i] !== lines[i].replace(/^\s+|\s+$/g, "")) good = false;
    }
    ok(good, name);
}

/* ---------- 1. 验收精确向量 ---------- */
var vector = {
    title: "登录失败", os: "", browser: "", version: "",
    steps: "打开登录页\n\n输入错误密码点登录",
    expected: "提示错误", actual: "无提示", severity: "严重", extra: ""
};
var expectedVector = "# [Bug] 登录失败\n\n" +
    "## 环境\n- 操作系统：未填写\n- 浏览器／客户端：未填写\n- 应用版本：未填写\n\n" +
    "## 复现步骤\n1. 打开登录页\n2. 输入错误密码点登录\n\n" +
    "## 预期结果\n提示错误\n\n## 实际结果\n无提示\n\n## 严重度\n严重\n\n## 补充信息\n无";
eq(B.buildBugReport(vector), expectedVector, "验收向量：精确字符串比对");
has(B.buildBugReport(vector), "1. 打开登录页\n2. 输入错误密码点登录", "验收向量：空行跳过、步骤重编号");
has(B.buildBugReport(vector), "- 操作系统：未填写", "验收向量：环境空项渲染未填写");
has(B.buildBugReport(vector), "## 补充信息\n无", "验收向量：补充信息空值渲染无");
checkClean(B.buildBugReport(vector), "验收向量：全文无行首行尾空格");
ok(B.buildBugReport(vector).indexOf("\n\n\n") === -1, "验收向量：节间空一行、无连续空行");

/* ---------- 2. 步骤解析 ---------- */
eq(B.parseSteps("甲\n\n乙\n  \n丙").join("|"), "甲|乙|丙", "步骤：空行与纯空白行均跳过");
eq(B.parseSteps("  打开页  \n 登录 ").join("|"), "打开页|登录", "步骤：每行去行首行尾空白");
eq(B.parseSteps("").length, 0, "步骤：空串解析为 0 步");
eq(B.parseSteps("\n\n  \n").length, 0, "步骤：全为空行解析为 0 步");
eq(B.parseSteps("一步\r\n二步").join("|"), "一步|二步", "步骤：CRLF 换行同样切分");

/* ---------- 3. 标题去空白与缺省占位 ---------- */
var trimmed = B.buildBugReport({ title: "  登录失败  ", steps: "一步", severity: "一般" });
has(trimmed, "# [Bug] 登录失败\n", "标题：行首行尾空格已去除");
var emptyFields = B.buildBugReport({ title: "标题", steps: "一步" });
has(emptyFields, "- 浏览器／客户端：未填写", "缺省：浏览器空项渲染未填写");
has(emptyFields, "## 预期结果\n未填写", "缺省：预期空值渲染未填写");
has(emptyFields, "## 实际结果\n未填写", "缺省：实际空值渲染未填写");
has(emptyFields, "## 补充信息\n无", "缺省：补充空值渲染无");
var extraKept = B.buildBugReport({ title: "标题", steps: "一步", extra: "仅 Chrome 复现" });
has(extraKept, "## 补充信息\n仅 Chrome 复现", "补充：非空原样输出");

/* ---------- 4. 严重度四档与默认 ---------- */
eq(B.DEFAULT_SEVERITY, "一般", "严重度：默认档为一般");
eq(B.SEVERITIES.join(","), "致命,严重,一般,轻微", "严重度：四档齐全");
var sev = ["致命", "严重", "一般", "轻微"];
for (var s = 0; s < sev.length; s++) {
    var out = B.buildBugReport({ title: "标题", steps: "一步", severity: sev[s] });
    has(out, "## 严重度\n" + sev[s], "严重度：切换 " + sev[s] + " 后同步");
}
var sevDefault = B.buildBugReport({ title: "标题", steps: "一步" });
has(sevDefault, "## 严重度\n一般", "严重度：未指定时默认一般");
eq(B.normalizeSeverity("未知档"), "一般", "严重度：非法档位回落一般");

/* ---------- 5. 校验提示 ---------- */
var noTitle = B.validateBugReport({ title: "", steps: "一步" });
ok(!noTitle.ok, "校验：空标题不通过");
eq(noTitle.error, "请填写缺陷标题", "校验：空标题提示文案");
eq(noTitle.output, "", "校验：空标题不输出有效报告");
var blankTitle = B.validateBugReport({ title: "   ", steps: "一步" });
ok(!blankTitle.ok, "校验：纯空白标题视为空标题");
var noSteps = B.validateBugReport({ title: "标题", steps: "" });
ok(!noSteps.ok, "校验：步骤为空不通过");
eq(noSteps.error, "请填写至少一步复现步骤", "校验：空步骤提示文案");
var blankSteps = B.validateBugReport({ title: "标题", steps: "\n\n  \n" });
ok(!blankSteps.ok, "校验：全为空行步骤视为空步骤");
eq(blankSteps.error, "请填写至少一步复现步骤", "校验：全为空行步骤提示文案");
var valid = B.validateBugReport(vector);
ok(valid.ok, "校验：验收向量通过校验");
eq(valid.output, expectedVector, "校验：通过时输出与精确向量一致");

/* ---------- 6. 示例向量 ---------- */
var sampleOut = B.buildBugReport(B.SAMPLE);
ok(B.validateBugReport(B.SAMPLE).ok, "示例：内置示例通过校验");
has(sampleOut, "# [Bug] 登录页密码错误时错误提示不消失", "示例：标题");
has(sampleOut, "- 操作系统：Windows 11", "示例：操作系统");
has(sampleOut, "- 浏览器／客户端：Chrome 130", "示例：浏览器");
has(sampleOut, "- 应用版本：v2.4.1", "示例：应用版本");
has(sampleOut, "1. 打开登录页\n2. 输入错误密码点登录\n3. 点击登录按钮\n4. 查看错误提示", "示例：4 步含空行干扰行，跳过重编号");
has(sampleOut, "## 补充信息\n仅在 Chrome 复现，Edge 未复现", "示例：补充信息");
checkClean(sampleOut, "示例：全文无行首行尾空格");

/* ---------- 7. 注册 ---------- */
has(GO, '"bug_report_generator"', "注册：ID bug_report_generator");
has(GO, '"/tools/bug-report-generator"', "注册：Path /tools/bug-report-generator");
has(GO, 'Category:    "开发工具"', "注册：Category 开发工具（至少一处）");
has(GO, '"bug_report"', "注册：Icon bug_report");
var pathCount = (GO.match(/"\/tools\/[^"]+"/g) || []).filter(function (p, i, arr) { return arr.indexOf(p) === i; }).length;
eq(pathCount, 197, "注册：总数 196→197 Path");

/* ---------- 8. 零网络请求静态检查 ---------- */
notHas(SRC, "fetch(", "零网络：JS 无网络请求调用");
notHas(SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(SRC, "http://", "零网络：JS 无 http 链接");
notHas(TPL, "fonts.googleapis", "零 CDN：模板无 Google Fonts 外链");
notHas(TPL, "cdn.", "零 CDN：模板无 CDN 域名");
notHas(TPL, "<script src=\"http", "零 CDN：模板无外链脚本");
has(TPL, "https://www.johnkingzcq123.xyz/tools/bug-report-generator", "SEO：canonical 与页面链接一致");

/* ---------- 9. 模板真限制文案与互链 ---------- */
has(TPL, "只生成报告文本、不提交到任何 issue 系统、不做缺陷跟踪", "真限制：只生成不提交不跟踪文案");
has(TPL, "不验证缺陷真实性", "真限制：不验证真实性文案");
has(TPL, "Markdown 仅为通用模板口径", "真限制：通用模板口径文案");
has(TPL, "请填写缺陷标题", "模板：空标题中文提示");
has(TPL, "请填写至少一步复现步骤", "模板：空步骤中文提示");
has(TPL, "/tools/project-to-txt", "互链：含代码打包给 LLM /tools/project-to-txt");
has(TPL, "要把现场代码打包发给协作者去代码打包给 LLM", "互链：文案区分打包与写报告");
notHas(TPL, "skeleton", "互链：不含未交付骨架屏工具");
notHas(TPL, "ulid", "互链：不含未交付 ULID 工具");
notHas(TPL, "nanoid", "互链：不含未交付 NanoID 工具");
has(TPL, "bug-report.md", "操作：下载文件名 bug-report.md");
has(SRC, "复制失败", "降级：JS 含复制失败降级文案");
has(SRC, "请手动全选结果区复制", "降级：复制失败手动复制指引");
has(SRC, "bug-report.md", "降级：JS 下载文件名 bug-report.md");

console.log("PASS: " + pass + ", FAIL: " + fail);
process.exit(fail === 0 ? 0 : 1);
