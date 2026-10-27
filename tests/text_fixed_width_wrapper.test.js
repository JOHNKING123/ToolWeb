/* 文本定宽换行器（text_fixed_width_wrapper）纯逻辑单元测试（零依赖）：
 * node tests/text_fixed_width_wrapper.test.js
 * 覆盖：列宽向量（半角／全角／混合／码点）、空格优先装行、超长词硬切、
 * 强制硬断边界空格、中文与混合向量、多原行隔离、空行保留／丢弃、
 * 预处理（制表符／连续空白／行首行尾空白）、列宽钳制、空输入、
 * 输出行列宽上限与无行首行尾空格、注册（195→196 Path）与零网络请求静态检查、
 * 模板真限制文案与互链（文本工具集，不含未交付工具）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var W = require("../static/js/text_fixed_width_wrapper.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "text_fixed_width_wrapper.js"), "utf8");
var TPL = fs.readFileSync(path.join(__dirname, "..", "templates", "text_fixed_width_wrapper.html"), "utf8");
var GO = fs.readFileSync(path.join(__dirname, "..", "tools", "categories.go"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name); }
function linesOut(text, opts) {
    var res = W.processInput(text, opts);
    return res.ok ? res.lines : null;
}
function checkBounds(lines, width, name) {
    var good = true;
    for (var i = 0; i < lines.length; i++) {
        if (W.colWidth(lines[i]) > width) good = false;
        if (lines[i] !== lines[i].replace(/^ +| +$/g, "")) good = false;
    }
    ok(good, name);
}

/* ---------- 1. 列宽向量 ---------- */
eq(W.colWidth("Hello"), 5, "列宽：Hello 计 5");
eq(W.colWidth("世界"), 4, "列宽：世界计 4");
eq(W.colWidth("Hello世界"), 9, "列宽：Hello世界计 9");
eq(W.colWidth("你好世界"), 8, "列宽：你好世界计 8");
eq(W.colWidth("Ａ"), 2, "列宽：全角Ａ（U+FF21）计 2");
eq(W.colWidth("ｱ"), 1, "列宽：半角片假名 U+FF71 在 FF00–FF60 范围外，计 1");
eq(W.colWidth("😀"), 1, "列宽：表情符号按码点计 1（不按 UTF-16 码元计 2）");
eq(W.colWidth(""), 0, "列宽：空串计 0");

/* ---------- 2. 空格优先装行与超长词硬切（列宽 10） ---------- */
eq(linesOut("aaaa bbbb cccc", { width: 10 }).join("|"), "aaaa bbbb|cccc", "空格优先：aaaa bbbb cccc → 两行");
eq(linesOut("abcdefghijklm", { width: 10 }).join("|"), "abcdefghij|klm", "空格优先：超长词硬切为 10＋3");
eq(linesOut("abcdefghijklm x", { width: 10 }).join("|"), "abcdefghij|klm x", "空格优先：超长词余部继续贪心装行");
eq(linesOut("aaaa bbbb cccc", { width: 10, mode: "space" }).length, 2, "空格优先：行数为 2");

/* ---------- 3. 强制硬断与边界空格（列宽 10） ---------- */
eq(linesOut("abcdefghij klmnopqrst", { width: 10, mode: "hard" }).join("|"), "abcdefghij|klmnopqrst", "强制硬断：边界空格丢弃，不产生空行头");
eq(linesOut("aaa bbb ccc", { width: 10, mode: "hard" }).join("|"), "aaa bbb cc|c", "强制硬断：纯按列宽切分");
eq(linesOut("  aaa  bbb  ", { width: 10, mode: "hard" }).join("|"), "aaa bbb", "强制硬断：预处理后无行首行尾空格");

/* ---------- 4. 中文与混合向量（列宽 10） ---------- */
eq(linesOut("这是一个很长的中文句子用于测试换行", { width: 10 }).join("|"),
    "这是一个很|长的中文句|子用于测试|换行", "中文：列宽 10 每行 5 字，四行");
eq(linesOut("Hello世界你好", { width: 10 }).join("|"), "Hello世界|你好", "混合：Hello世界／你好 两行");
eq(linesOut("Hello世界你好", { width: 10, mode: "hard" }).join("|"), "Hello世界|你好", "混合硬断：同向量");

/* ---------- 5. 多原行隔离与空行 ---------- */
eq(linesOut("第一行很长需要换行内容\n第二行短", { width: 10 }).join("|"),
    "第一行很长|需要换行内|容|第二行短", "多原行：不跨行合并，上一原行余部不接下一原行");
eq(linesOut("甲行\n\n乙行", { width: 10, keepBlank: true }).join("|"), "甲行||乙行", "空行保留：开关开时原样保留");
eq(linesOut("甲行\n\n乙行", { width: 10, keepBlank: false }).join("|"), "甲行|乙行", "空行丢弃：开关关时丢弃");
eq(linesOut("甲行\n\n乙行", { width: 10 }).join("|"), "甲行||乙行", "空行默认：保留开关默认开");

/* ---------- 6. 预处理 ---------- */
eq(linesOut("a\t\tb   c", { width: 10 }).join("|"), "a b c", "预处理：制表符转空格、连续空白合并");
eq(linesOut("   aaaa bbbb   ", { width: 10 }).join("|"), "aaaa bbbb", "预处理：行首行尾空白去掉");

/* ---------- 7. 钳制与空输入 ---------- */
eq(W.clampInt(5, 10, 200).value, 10, "钳制：列宽 5 → 10");
ok(W.clampInt(5, 10, 200).clamped, "钳制：列宽 5 标记 clamped");
eq(W.clampInt(300, 10, 200).value, 200, "钳制：列宽 300 → 200");
ok(W.clampInt(300, 10, 200).clamped, "钳制：列宽 300 标记 clamped");
eq(W.clampInt(40, 10, 200).value, 40, "钳制：列宽 40 不变");
ok(!W.clampInt(40, 10, 200).clamped, "钳制：列宽 40 不标记 clamped");
var emptyRes = W.processInput("", { width: 40 });
ok(!emptyRes.ok, "空输入：ok 为 false");
eq(emptyRes.error, "请粘贴或输入文本", "空输入：中文提示");
var blankRes = W.processInput("   \n  ", { width: 40 });
ok(!blankRes.ok, "纯空白输入：ok 为 false");

/* ---------- 8. 输出行列宽上限与统计 ---------- */
var mixed = W.processInput("Hello world 这是一个很长的中文句子用于测试换行 aaaa bbbb cccc", { width: 10 });
checkBounds(mixed.lines, 10, "上限：混合长文输出任一行列宽 ≤ 10 且无行首行尾空格");
ok(mixed.maxWidth <= 10, "统计：最长行列宽 ≤ 设定列宽");
ok(mixed.lineCount === mixed.lines.length, "统计：输出行数与行数组一致");
ok(mixed.output === mixed.lines.join("\n"), "统计：output 与行数组逐行一致");
var sample = W.processInput(W.SAMPLE, { width: 40 });
ok(sample.ok, "示例：默认列宽 40 下可生成");
checkBounds(sample.lines, 40, "示例：输出任一行列宽 ≤ 40");
ok(sample.lines.length > 2, "示例：输出多行（含空格断行与超长词硬断）");

/* ---------- 9. 注册 ---------- */
has(GO, '"text_fixed_width_wrapper"', "注册：ID text_fixed_width_wrapper");
has(GO, '"/tools/text-fixed-width-wrapper"', "注册：Path /tools/text-fixed-width-wrapper");
has(GO, 'Category:    "文本工具"', "注册：Category 文本工具（至少一处）");
var pathCount = (GO.match(/"\/tools\/[^"]+"/g) || []).filter(function (p, i, arr) { return arr.indexOf(p) === i; }).length;
eq(pathCount, 196, "注册：总数 195→196 Path");

/* ---------- 10. 零网络请求静态检查 ---------- */
notHas(SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(SRC, "http://", "零网络：JS 无 http 链接");
notHas(TPL, "fonts.googleapis", "零 CDN：模板无 Google Fonts 外链");
notHas(TPL, "cdn.", "零 CDN：模板无 CDN 域名");
notHas(TPL, "<script src=\"http", "零 CDN：模板无外链脚本");
has(TPL, "https://www.johnkingzcq123.xyz/tools/text-fixed-width-wrapper", "SEO：canonical 与页面链接一致");

/* ---------- 11. 模板真限制文案与互链 ---------- */
has(TPL, "只做按列宽机械换行", "真限制：只做机械换行文案");
has(TPL, "不做语义断句与中文分词优化", "真限制：不做语义断句与分词优化文案");
has(TPL, "半角计 1", "真限制：半角计 1 文案");
has(TPL, "全角／CJK 计 2", "真限制：全角／CJK 计 2 文案");
has(TPL, "不合并、不改写原文内容", "真限制：不合并不改写文案");
has(TPL, "/tools/text-tools", "互链：含文本工具集 /tools/text-tools");
has(TPL, "要数词数、做文本清洗去文本工具集", "互链：文案区分清洗与换行");
notHas(TPL, "bug-report-generator", "互链：不含未交付 Bug 报告生成器");
notHas(TPL, "skeleton", "互链：不含未交付骨架屏工具");
has(TPL, "wrapped.txt", "操作：下载文件名 wrapped.txt");
has(TPL, "请粘贴或输入文本", "模板：空输入中文提示占位");
has(SRC, "复制失败", "降级：JS 含复制失败降级文案");
has(SRC, "请手动全选结果区复制", "降级：复制失败手动复制指引");

console.log("PASS: " + pass + ", FAIL: " + fail);
process.exit(fail === 0 ? 0 : 1);
