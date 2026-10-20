/* Markdown 聊天图文转换器纯逻辑单元测试（零依赖）：node tests/md_to_chat.test.js
* 覆盖：
* 1. 块拆分（文本/表格/代码/块级公式/mermaid 混合，围栏未闭合容错）
* 2. 表格解析（对齐方式、\| 转义、分隔行判定）
* 3. 行内渲染（XSS 转义、加粗/斜体/删除线、链接协议过滤、行内代码保护、行内公式简化）
* 4. 公式简化（\frac / \sqrt / 希腊字母 / 上下标 / 修饰命令剥离）
* 5. mermaid 子集解析（节点形状、边 label、不支持语法返回 null）
* 6. mermaid 布局（分层、坐标、画布尺寸）
* 7. 表格布局（列宽、行高、总尺寸）与折行
* 8. 四平台纯文本适配（标题/加粗/引用/列表符号差异、复杂块占位语）
* 9. 混合预览 HTML（复杂块 chip 占位、XSS 不穿透）
*/
"use strict";
var M = require("../static/js/md_to_chat.js");

var pass = 0, fail = 0;
function ok(cond, name) {
if (cond) { pass++;}
else { fail++; console.error("FAIL:", name);}
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）");}
function contains(s, sub, name) { ok(String(s).indexOf(sub)!== -1, name + "（应包含 " + JSON.stringify(sub) + "）");}
function notContains(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）");}
function kinds(blocks) { return blocks.map(function (b) { return b.kind;}).join(",");}

/* ---------- 1. 块拆分 ---------- */
var md1 = [
"# 标题",
"",
"段落 **加粗** 文字",
"",
"| 姓名 | 年龄 |",
"|:--- | ---: |",
"| 张三 | 18 |",
"| 李四 | 20 |",
"",
"```python",
"print('hi')",
"```",
"",
"$$E=mc^2$$",
"",
"```mermaid",
"graph TD",
"A-->B",
"```",
"",
"> 引用",
"",
"- 列表1",
"- 列表2"
].join("\n");
var b1 = M.parseBlocks(md1);
eq(kinds(b1), "text,table,code,formula,mermaid,text", "混合文档块拆分顺序（纯空行不产生空文字块）");
eq(b1[1].header.join("|"), "姓名|年龄", "表头解析");
eq(b1[1].aligns.join(","), "l,r", "对齐方式解析");
eq(b1[1].rows.length, 2, "表格行数");
eq(b1[2].lang, "python", "代码块语言");
eq(b1[2].code, "print('hi')", "代码块内容");
eq(b1[3].tex, "E=mc^2", "单行 $$ 公式");
eq(b1[4].code.replace(/\s+/g, " "), "graph TD A-->B", "mermaid 源码");

/* 围栏未闭合容错 */
var b2 = M.parseBlocks("```js\nvar a = 1;");
eq(b2.length, 1, "未闭合围栏仍成块");
eq(b2[0].kind, "code", "未闭合围栏 kind=code");
eq(b2[0].unclosed, true, "未闭合标记");

/* 多行 $$ 公式 */
var b3 = M.parseBlocks("$$\nx = 1\ny = 2\n$$");
eq(b3.length, 1, "多行公式一块");
eq(b3[0].kind, "formula", "多行公式 kind");
eq(b3[0].tex, "x = 1\ny = 2", "多行公式内容");

/* 空输入 */
eq(M.parseBlocks("").length, 0, "空输入零块");
eq(M.parseBlocks(null).length, 0, "null 输入零块");

/* ---------- 2. 表格细节 ---------- */
var bt = M.parseBlocks("| a \\| b | c |\n|---|---|\n| 1 | 2 |");
eq(bt[0].header.join("|"), "a | b|c", "\\| 转义不拆分单元格");
var bnt = M.parseBlocks("a | b\n普通文本");
eq(kinds(bnt), "text", "无分隔行不是表格");
eq(M.splitCells(" x | y ").join("|"), "x|y", "单元格 trim");

/* ---------- 3. 行内渲染 ---------- */
var ri = M.renderInline('**加粗** 与 *斜体* 与 `code*here*`');
contains(ri, "<strong", "加粗渲染");
contains(ri, "<em", "斜体渲染");
contains(ri, "<code", "行内代码渲染");
notContains(ri, "<em><code", "代码内星号不被误解析");
var xss = M.renderInline('<script>alert(1)</script>');
notContains(xss, "<script>", "XSS 标签转义");
contains(xss, "&lt;script&gt;", "转义后可见");
var badLink = M.renderInline('[点我](javascript:alert(1))');
notContains(badLink, "javascript:", "危险协议过滤");
contains(badLink, 'href="#"', "危险链接降级为 #");
var goodLink = M.renderInline('[官网](https://example.com)');
contains(goodLink, 'href="https://example.com"', "正常链接保留");
var inlineMath = M.renderInline('公式 $\\alpha + \\beta$ 结束');
contains(inlineMath, "α + β", "行内公式简化渲染");
var strike = M.renderInline('~~删除~~');
contains(strike, "<del", "删除线渲染");

/* ---------- 4. 公式简化 ---------- */
eq(M.prettifyMath("\\frac{a}{b}"), "(a)/(b)", "\\frac 简化");
eq(M.prettifyMath("\\sqrt{x}"), "√(x)", "\\sqrt 简化");
eq(M.prettifyMath("\\sqrt[3]{x}"), "3√(x)", "\\sqrt[n] 简化");
eq(M.prettifyMath("\\alpha + \\Omega"), "α + Ω", "希腊字母映射");
eq(M.prettifyMath("x_{i}^{2}"), "x_i^2", "上下标花括号剥离");
eq(M.prettifyMath("\\left( a \\right)"), "( a )", "\\left\\right 剥离");
eq(M.prettifyMath("\\text{hello}"), "hello", "\\text 取内容");
eq(M.prettifyMath("\\sum_{i=1}^{n}"), "∑_i=1^n", "\\sum 映射");
eq(M.prettifyMath(""), "", "空公式");

/* ---------- 5. mermaid 解析 ---------- */
var g1 = M.parseMermaidGraph("graph TD\nA[开始] --> B{判断}\nB -->|是| C((结束))\nD(圆角)");
ok(g1!== null, "基本流程图可解析");
eq(g1.dir, "TD", "方向 TD");
eq(g1.nodes.length, 4, "节点数 4");
eq(g1.nodes[1].shape, "diamond", "菱形节点");
eq(g1.nodes[2].shape, "circle", "圆形节点");
eq(g1.nodes[3].shape, "round", "圆角节点");
eq(g1.edges.length, 2, "边数 2（D 为独立节点行）");
eq(g1.edges[1].label, "是", "边 label");
eq(M.parseMermaidGraph("graph TD\nA --> B --> C"), null, "链式边超出子集返回 null");
eq(M.parseMermaidGraph("A-->B"), null, "无 graph 声明返回 null");
eq(M.parseMermaidGraph("graph TD"), null, "无节点返回 null");
var gLR = M.parseMermaidGraph("flowchart LR\nX1-->Y2");
eq(gLR.dir, "LR", "flowchart LR 方向");
var gRL = M.parseMermaidGraph("graph RL\nA-->B");
eq(gRL.dir, "RL", "graph RL 方向");
var layRL = M.mermaidLayout(gRL, 14);
ok(layRL.nodes[0].cx > layRL.nodes[1].cx, "RL 反向横向：前驱在右侧");

/* ---------- 6. mermaid 布局 ---------- */
var lay = M.mermaidLayout(g1, 14);
ok(lay.W > 0 && lay.H > 0, "布局尺寸为正");
eq(lay.nodes.length, 4, "布局节点数");
ok(lay.nodes.every(function (nd) { return typeof nd.cx === "number" && typeof nd.cy === "number";}), "节点均有坐标");
var lv = {};
lay.nodes.forEach(function (nd) { lv[nd.id] = nd.layer;});
ok(lv.B > lv.A && lv.C > lv.B, "TD 分层递增");

/* ---------- 7. 表格布局与折行 ---------- */
var tl = M.tableLayout(["姓名", "年龄"], [["张三", "18"], ["李四四", "20"]], 14, 12);
eq(tl.colW.length, 2, "列宽数");
ok(tl.colW[0] < tl.colW[1] || tl.colW[0] > 0, "列宽为正");
ok(tl.totalW === tl.colW[0] + tl.colW[1], "总宽=列宽之和");
eq(tl.rowH, Math.ceil(14 * 2.1), "行高=字号*2.1");
eq(tl.totalH, tl.rowH * 3, "总高=行高*行数");
var wl = M.wrapLines("abcdef", 100, function (s) { return s.length * 10;});
eq(wl.join("|"), "abcdefghij".slice(0, 0) + "abcdef", "短行不折行");
var wl2 = M.wrapLines("abcdefghij", 25, function (s) { return s.length * 10;});
eq(wl2.length, 5, "长行按宽度折行");
eq(M.textWidth("ab", 10), 11, "ASCII 宽度估算");
eq(M.textWidth("中", 10), 10, "CJK 宽度估算");

/* ---------- 8. 四平台适配 ---------- */
var bp = M.parseBlocks("# 大标题\n## 小标题\n**加粗** 与 *斜体* 与 `代码`\n\n> 引用行\n\n- 项一\n- 项二\n\n1. 首项\n2. 次项\n\n---\n\n[链接](https://example.com)\n\n| 表头 |\n|---|\n| 数据 |\n");
var wx = M.blocksToPlain(bp, "wechat");
contains(wx, "【大标题】", "微信 H1 保留标题文本");
contains(wx, "〖小标题〗", "微信 H2");
contains(wx, "加粗", "微信加粗保留文本");
notContains(wx, "**", "无 markdown 残留");
contains(wx, "「斜体」", "微信斜体");
contains(wx, "「代码」", "微信行内代码");
contains(wx, "｜引用行", "微信引用");
contains(wx, "• 项一", "微信列表符号");
contains(wx, "1. 首项", "微信有序列表");
contains(wx, "链接（https://example.com）", "微信链接展开");
contains(wx, "📊", "微信表格占位");
var dd = M.blocksToPlain(bp, "dingtalk");
contains(dd, "◆ 大标题", "钉钉 H1 保留标题文本");
contains(dd, "◆ 小标题", "钉钉 H2 差异");
contains(dd, "▪ 项一", "钉钉列表符号差异");
contains(dd, "> 引用行", "钉钉引用符号差异");
contains(dd, "`代码`", "钉钉行内代码保留反引号");
var fs = M.blocksToPlain(bp, "feishu");
contains(fs, "『大标题』", "飞书 H1 保留标题文本");
contains(fs, "『小标题』", "飞书 H2 差异");
contains(fs, "· 项一", "飞书列表符号差异");
contains(fs, "▍ 引用行", "飞书引用符号差异");
var wc = M.blocksToPlain(bp, "wecom");
contains(wc, "【大标题】", "企微 H1 保留标题文本");
contains(wc, "〖小标题〗", "企微 H2");
contains(wc, "- 项一", "企微列表符号差异");
notContains(wc, "**加粗**", "企微无 markdown 残留");
/* 未知平台降级微信 */
eq(M.blocksToPlain(bp, "unknown"), M.blocksToPlain(bp, "wechat"), "未知平台降级微信");
/* 复杂块全覆盖 */
var bcx = M.parseBlocks("```js\nx\n```\n$$a$$\n```mermaid\ngraph TD\nA-->B\n```");
var px = M.blocksToPlain(bcx, "wechat");
contains(px, "💻", "代码占位");
contains(px, "∑", "公式占位");
contains(px, "🔀", "流程图占位");

/* ---------- 9. 混合预览 HTML ---------- */
var html = M.blocksToHtml(bp);
contains(html, "table_chart", "表格 chip 图标");
contains(html, "已转为下方图片卡片", "chip 提示文案");
contains(html, "大标题", "文字块标题渲染");
var htmlXss = M.blocksToHtml(M.parseBlocks("# <img src=x onerror=alert(1)>"));
notContains(htmlXss, "<img src=x", "预览 HTML 不穿透 XSS");
var htmlEdit = M.blocksToEditableHtml(bp, "wechat");
contains(htmlEdit, "📊", "可编辑版含占位行");
eq(M.blocksToHtml([]), M.blocksToHtml([]), "空块占位稳定");
contains(M.blocksToHtml([]), "粘贴", "空块提示文案");

/* 平台注册表完整性 */
eq(M.PLATFORM_ORDER.join(","), "wechat,dingtalk,feishu,wecom", "四平台顺序");
M.PLATFORM_ORDER.forEach(function (pid) {
ok(M.PLATFORMS[pid] && M.PLATFORMS[pid].label, "平台 " + pid + " 已注册");
});

console.log("\n通过 " + pass + " / " + (pass + fail) + "，失败 " + fail);
process.exit(fail? 1: 0);
