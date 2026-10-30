/* 结构化提示词构建器（prompt_builder）纯逻辑单元测试（零依赖）：
 * node tests/prompt_builder.test.js
 * 覆盖：规格确定性向量逐字命中（7 条）、错误约定（err.field）、
 * 三组一键预设结构、categories.go 注册（Path 总数 238→239）与零网络请求静态检查、
 * 模板真限制三条、与 AI 提示词脱敏器双向互链（脱敏再发问）＋相关工具栏、
 * Description 中英文双语、不链未交付工具。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var P = require("../static/js/prompt_builder.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "prompt_builder.js"), "utf8");
var TPL = fs.readFileSync(path.join(__dirname, "..", "templates", "prompt_builder.html"), "utf8");
var PS_TPL = fs.readFileSync(path.join(__dirname, "..", "templates", "prompt_sanitizer.html"), "utf8");
var GO = fs.readFileSync(path.join(__dirname, "..", "tools", "categories.go"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function eqArr(a, b, name) {
    ok(Array.isArray(a) && a.length === b.length && a.every(function (v, i) { return v === b[i]; }),
        name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）");
}
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name); }
function throwsField(fn, field, name) {
    try { fn(); } catch (e) {
        ok(e instanceof Error && e.field === field,
            name + "（期望抛 Error 且 err.field=" + JSON.stringify(field) + "，实得 " +
            (e instanceof Error ? "Error field=" + JSON.stringify(e.field) : typeof e) + "）");
        return;
    }
    fail++; console.error("FAIL:", name + "（未抛出异常）");
}

/* ---------- 1. 规格确定性向量逐字命中 ---------- */
eq(P.buildSystemPrompt({
    role: "你是一名资深代码评审专家",
    task: "评审以下 Go 代码",
    context: "项目是一个 HTTP 服务",
    constraints: ["输出不超过 500 字", "用中文回答"],
    format: "Markdown 列表",
    examples: ["输入：add(1,2)\n输出：3"],
    input: "package main"
}),
"<system-prompt>\n" +
"  <role>你是一名资深代码评审专家</role>\n" +
"  <task>评审以下 Go 代码</task>\n" +
"  <context>项目是一个 HTTP 服务</context>\n" +
"  <constraints>\n" +
"    <constraint>输出不超过 500 字</constraint>\n" +
"    <constraint>用中文回答</constraint>\n" +
"  </constraints>\n" +
"  <output-format>Markdown 列表</output-format>\n" +
"  <examples>\n" +
"    <example n=\"1\">输入：add(1,2)\n输出：3</example>\n" +
"  </examples>\n" +
"  <input>package main</input>\n" +
"</system-prompt>",
"向量1：完整七节逐字命中");
eq(P.buildSystemPrompt({ role: "R", task: "", context: "   ", constraints: [], format: "", examples: [""], input: "  " }),
    "<system-prompt>\n  <role>R</role>\n</system-prompt>",
    "向量2：空节自动省略（空串/空白/空数组/全空项）");
eq(P.escapeXml("a&b<c>d\"e'f"), "a&amp;b&lt;c&gt;d&quot;e&apos;f", "向量3：escapeXml 五字符转义");
eq(P.buildSystemPrompt({ input: "<tag>&\"'" }),
    "<system-prompt>\n  <input>&lt;tag&gt;&amp;&quot;&apos;</input>\n</system-prompt>",
    "向量4：特殊字符转义后进 XML 输出");
eq(P.buildDownloadName(new Date(2026, 9, 31, 1, 52)), "system-prompt-20261031-0152.xml",
    "向量5：buildDownloadName 固定日期向量");
eq(P.buildSystemPrompt({}), "<system-prompt>\n</system-prompt>", "向量6：全空输入 → 空根节点");
eq(P.buildSystemPrompt({ constraints: ["  A  ", "", "B", "   "] }),
    "<system-prompt>\n  <constraints>\n    <constraint>A</constraint>\n    <constraint>B</constraint>\n  </constraints>\n</system-prompt>",
    "向量7：约束多条渲染（去空＋去首尾空白）");
eq(P.buildSystemPrompt({ examples: ["e1", "e2"] }),
    "<system-prompt>\n  <examples>\n    <example n=\"1\">e1</example>\n    <example n=\"2\">e2</example>\n  </examples>\n</system-prompt>",
    "向量8：示例多条渲染（n 从 1 递增）");

/* ---------- 2. 错误约定（err.field） ---------- */
throwsField(function () { P.buildSystemPrompt(null); }, "data", "buildSystemPrompt(null) field=data");
throwsField(function () { P.buildSystemPrompt("x"); }, "data", "buildSystemPrompt(字符串) field=data");
throwsField(function () { P.buildSystemPrompt([]); }, "data", "buildSystemPrompt(数组) field=data");
throwsField(function () { P.buildSystemPrompt({ role: 123 }); }, "role", "role 非字符串 field=role");
throwsField(function () { P.buildSystemPrompt({ task: {} }); }, "task", "task 非字符串 field=task");
throwsField(function () { P.buildSystemPrompt({ constraints: "x" }); }, "constraints", "constraints 非数组 field=constraints");
throwsField(function () { P.buildSystemPrompt({ constraints: [123] }); }, "constraints", "constraints 项非字符串 field=constraints");
throwsField(function () { P.buildSystemPrompt({ examples: [{ a: 1 }] }); }, "examples", "examples 项非字符串 field=examples");
throwsField(function () { P.buildSystemPrompt({ input: true }); }, "input", "input 非字符串 field=input");
throwsField(function () { P.escapeXml(null); }, "value", "escapeXml(null) field=value");
throwsField(function () { P.escapeXml(123); }, "value", "escapeXml(数字) field=value");
throwsField(function () { P.buildDownloadName("x"); }, "date", "buildDownloadName(字符串) field=date");
throwsField(function () { P.buildDownloadName(new Date(NaN)); }, "date", "buildDownloadName(非法日期) field=date");

/* ---------- 3. 三组一键预设 ---------- */
eq(P.PRESETS.length, 3, "预设：共 3 组");
eqArr(P.PRESETS.map(function (p) { return p.id; }), ["code-review", "en-translate", "xiaohongshu"],
    "预设：id 为 code-review/en-translate/xiaohongshu");
ok(P.PRESETS.every(function (p) {
    return p && typeof p.label === "string" && typeof p.desc === "string" && p.data &&
        typeof p.data.role === "string" && p.data.role !== "" &&
        typeof p.data.task === "string" && p.data.task !== "" &&
        Array.isArray(p.data.constraints) && p.data.constraints.length > 0;
}), "预设：每组含 label/desc/data，且 data.role/task 非空、constraints 非空");
var preXml = P.buildSystemPrompt(P.PRESETS[0].data);
ok(preXml.indexOf("<role>") !== -1 && preXml.indexOf("<task>") !== -1 &&
    preXml.indexOf("<constraints>") !== -1 && preXml.indexOf("<constraint>") !== -1 &&
    preXml.indexOf("<output-format>") !== -1,
    "预设 code-review：data 可生成含 role/task/constraints/output-format 的 XML");
ok(P.buildSystemPrompt(P.PRESETS[1].data).indexOf("翻译") !== -1 ||
    P.buildSystemPrompt(P.PRESETS[1].data).indexOf("英文") !== -1,
    "预设 en-translate：XML 内容与翻译主题一致");
ok(P.buildSystemPrompt(P.PRESETS[2].data).indexOf("小红书") !== -1,
    "预设 xiaohongshu：XML 内容含小红书");

/* ---------- 4. 双模式导出 ---------- */
has(SRC, "module.exports", "双模式：module.exports 暴露纯函数");
has(SRC, "window.PromptBuilder", "双模式：window.PromptBuilder 全局");

/* ---------- 5. categories.go 注册 ---------- */
has(GO, '"prompt_builder"', "注册：categories.go 含 ID prompt_builder");
has(GO, '"/tools/prompt-builder"', "注册：categories.go 含 Path /tools/prompt-builder");
var idx = GO.indexOf('"prompt_builder"');
ok(GO.slice(idx, idx + 1200).indexOf('Category:    "开发工具"') !== -1, "注册：Category 为开发工具");
ok(GO.slice(idx, idx + 1200).indexOf("New:         true") !== -1, "注册：New 为 true");
ok(GO.slice(idx, idx + 1200).indexOf('Icon:        "chat_bubble"') !== -1, "注册：Icon 为 chat_bubble");
var descStart = GO.indexOf("Description:", idx);
var descEnd = GO.indexOf("Path:", idx);
var desc = GO.slice(descStart, descEnd);
ok(desc.indexOf("提示词") !== -1, "注册：Description 含中文说明");
ok(desc.indexOf("Structured prompt builder") !== -1, "注册：Description 含英文说明（中英双语）");
var pathCount = 0;
var m;
var re = /"\/tools\/[^"]+"/g;
var seen = {};
while ((m = re.exec(GO)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 239, "注册：去重 Path 总数 238→239");

/* ---------- 6. 零网络请求静态检查 ---------- */
notHas(SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL, "fetch(", "零网络：模板无 fetch 调用");
notHas(TPL, "XMLHttpRequest", "零网络：模板无 XHR");
var extScripts = (TPL.match(/<script[^>]+src="https?:\/\/[^"]+"/g) || []).length;
eq(extScripts, 0, "零外部脚本：模板无 https 外部 script");

/* ---------- 7. 模板：真限制三条页面明示 ---------- */
ok(TPL.indexOf("模板拼装") !== -1 && TPL.indexOf("AI 优化") !== -1, "真限制①：模板拼装、非 AI 优化");
ok(TPL.indexOf("因模型而异") !== -1, "真限制②：XML 遵循程度因模型而异");
ok(TPL.indexOf("全部本地生成") !== -1 && TPL.indexOf("不上传") !== -1, "真限制③：全部本地生成、不上传");

/* ---------- 8. 互链与相关工具栏 ---------- */
has(TPL, "/tools/prompt-sanitizer", "互链：模板链向 AI 提示词脱敏器");
has(TPL, "脱敏再发问", "互链：含「脱敏再发问」文案");
has(TPL, "/tools/llms-txt-generator", "相关工具栏：含 llms.txt 生成器");
has(TPL, "/tools/ai-token-counter", "相关工具栏：含 AI Token 计数器");
has(PS_TPL, "/tools/prompt-builder", "反向互链：prompt_sanitizer 模板链回结构化提示词构建器");
var linkRe = /href="(\/tools\/[^"]+)"/g, lm, linkCount = 0, allDelivered = true;
while ((lm = linkRe.exec(TPL)) !== null) {
    if (lm[1].indexOf("/tools/static/") === 0) continue; /* 静态资源非工具链接 */
    linkCount++;
    if (GO.indexOf('"' + lm[1] + '"') === -1) { allDelivered = false; console.error("未交付链接：", lm[1]); }
}
ok(linkCount > 0, "互链：模板含站内 /tools/ 链接");
ok(allDelivered, "互链：所有 /tools/ 链接均已在 categories.go 注册（不链未交付工具）");

/* ---------- 9. 模板 SEO 与关键 DOM ---------- */
has(TPL, "https://www.johnkingzcq123.xyz/tools/prompt-builder", "SEO：模板含 canonical 链接");
has(TPL, "pb-role", "模板：含角色输入");
has(TPL, "pb-task", "模板：含任务输入");
has(TPL, "pb-context", "模板：含上下文输入");
has(TPL, "pb-constraints", "模板：含约束增删行区");
has(TPL, "pb-format", "模板：含输出格式输入");
has(TPL, "pb-examples", "模板：含示例增删行区");
has(TPL, "pb-input", "模板：含待处理输入");
has(TPL, "pb-presets", "模板：含一键预设区");
has(TPL, "pb-copy", "模板：含复制按钮");
has(TPL, "pb-download", "模板：含下载按钮");
has(TPL, "pb-output", "模板：含输出区");

console.log("prompt_builder: pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);
