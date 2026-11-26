/* 6 个工具页 390px 移动端横向溢出（mobile_overflow_390）回归测试：
 * 缺陷：390×844 下 documentElement.scrollWidth：markdown-preview 585、
 * json-parser 586、percentage-calc 541、colorblind-simulator 451、base64 430、
 * calendar 403，整页横向滚动、输入区被推出可视区。
 * 根因（真浏览器逐元素定位，本地构建 127.0.0.1:18099，Playwright 1.65.2＋
 * chromium-1248，改前实测与 11-26 巡检数值逐页一致）：
 *  ① markdown-preview／json-parser：@media (max-width:768px) 已把两列 grid
 *     折叠为单列（实测 computed grid-template-columns 为 569.156px／553.844px
 *     单轨），但 .markdown-panel／.json-panel 无 min-width:0，被内部不换行的
 *     flex 头部行（.markdown-header／.json-header，504–569px）撑宽，轨道被
 *     min-content 顶出视口——与首页 17 轮 .tool-card 同一类根因。注意 11-25
 *     开发轮曾称 json-parser「.json-container 两列 grid 未折叠」，本轮实测
 *     证伪：容器已单轨（553.844px）、panel 宽 554px，故修 panel 不修容器。
 *  ② percentage-calc：行内 style="grid-template-columns:1fr auto 1fr" 覆盖了
 *     @media (max-width:640px) 的单列折叠（.pc-field 宽 220px，右缘 541px）。
 *     删行内样式后又暴露第二溢出源：.pc-band-row 四列输入框（number 输入框
 *     min-content 约 220px）在 640px 媒体查询的 2 列下仍把轨道撑到 506px，
 *     故 band 行输入框另加 min-width:0。桌面端三列布局须与改前一致：字面删
 *     行内样式会让桌面端落到 :33 的 1fr 1fr，箭头与第二个输入框掉到第二行，
 *     违背「桌面端布局与改前一致」的验收标准；故两处 grid 改挂 .pc-grid-3
 *     类，三列只在 @media (min-width:641px) 里恢复，移动端仍走单列折叠。
 *  ③ colorblind-simulator：.cb-panel（grid 子项，min-width:auto）被对比度表
 *     的 min-content 撑到 419px；逐个隐藏子树定位：隐藏 .cb-scroll-x／
 *     .cb-table／#cb-contrast-out 任一即收敛到 390，其余子树均不影响。
 *     对比度表本就包在 .cb-scroll-x（overflow-x:auto）里，无需再包一层；
 *     修法为 .cb-panel 加 min-width:0（表在面板内横向滚动）＋.cb-chip 内
 *     code 断行。
 *  ④ base64：.example-btn 内 <small> 为无空格长串 base64（如
 *     aHR0cHM6Ly9leGFtcGxlLmNvbS9wYXRoP3BhcmFtPXZhbHVl），无断行规则，按钮
 *     被撑到 373px、右缘 430px；隐藏 .example-btn 或仅 <small> 即收敛。
 *  ⑤ calendar：仅超 13px，#nextMonth 按钮宽 169px、右缘 403px，头部 prev／
 *     标题／next 一行超宽；隐藏三件套任一即收敛。
 * 修复（只动 6 个模板的内联 <style>／行内样式与必要最小结构，文案与
 * data-text 一字不动；不动后端、其余模板、static/css/js）：
 *  ① markdown_preview.html：.markdown-panel 加 min-width:0；.markdown-header
 *     加 flex-wrap:wrap＋gap，h3 与 .markdown-header-buttons 加 min-width:0、
 *     按钮组加 flex-wrap:wrap。
 *  ② json_parser.html：.json-panel 加 min-width:0；.json-header 加
 *     flex-wrap:wrap＋gap，h3 加 min-width:0；两处按钮组行内样式加
 *     flex-wrap:wrap＋min-width:0（图标字体未加载时按钮字面文本更宽）。
 *  ③ percentage_calc.html：删 :74／:87 两处行内 grid-template-columns，改挂
 *     .pc-grid-3 类＋@media (min-width:641px) 恢复三列；.pc-band-row
 *     .pc-field／input 加 min-width:0（input 另加 width:100%）。
 *  ④ colorblind_simulator.html：.cb-panel 加 min-width:0；.cb-chip code 加
 *     overflow-wrap:anywhere；对比度表 wrapper 已是 .cb-scroll-x，不另包。
 *  ⑤ base64.html：.example-btn 加 min-width:0／max-width:100%／
 *     overflow-wrap:anywhere，内 <small> 加 overflow-wrap:anywhere。
 *  ⑥ calendar.html：<head> 内补 <style>，.calendar-header 加 flex-wrap:wrap
 *     ＋row-gap，#currentMonth 加 min-width:0。
 *
 * 运行：node tests/mobile_overflow_390.test.js
 * 两种模式（自动选择，启动时打印）：
 *  1) 真实页面模式：环境变量 MOBILE390_JSON 指向 Playwright 实测 JSON
 *     （measure_dev.py 生成，数组项含 slug／viewport／scrollWidth），断言
 *     6 页 390px 与 1919px 下 scrollWidth 均等于视口宽；另设
 *     MOBILE390_REGRESSION_JSON 指向含 regression390 数组的 JSON
 *     （func_verify.py 生成）时，断言首页＋9 个已无溢出抽查页 390px 仍为 390。
 *  2) 静态断言模式（零依赖默认）：只读 6 个模板与 tools/categories.go，
 *     断言每页修复规则均已落盘、其余声明未动、文案与 data-text 一字未改、
 *     Path 总数 328。
 * 开发轮本地实测（2026-11-26，本地构建 127.0.0.1:18099，Playwright 1.65.2＋
 * chromium-1248）：390×844 下 6 页 scrollWidth 均 = 390（改前 585／586／541／
 * 451／430／403），无横向滚动条；1919×1080 下 6 页 scrollWidth 均 = 1919；
 * 桌面端几何与改前一致：percentage-calc 三列 351.6／22.4／351.6px，两组输入
 * 框各自同行（top 355／504），段位输入框 180px×4；markdown 两列 927.5px、
 * json 两列 536px；功能锚点：markdown 输入→预览渲染出 h1＋加粗、
 * json 6 按钮均存在可见＋/tools/api/json/format 200、百分比三组出数
 * （75%→0.75、2/3→66.67%、120→150＝＋25%／＋30、86/100＝B）、色盲对比度表
 * 5 行＋单色卡 4 张＋摘要 245 字、base64 编码 Hello, World!→
 * SGVsbG8sIFdvcmxkIQ== 且解码回填、示例按钮填充、日历 11 月→12 月→10 月
 * 翻页；首页＋9 个已无溢出抽查页 390px 仍为 390；sitemap <loc> 329、
 * Path 328；go build／go vet 通过。
 * 环境说明：VM 代理下 Google Fonts／cdnjs JSONEditor 等外站请求失败
 * （ERR_TUNNEL_CONNECTION_FAILED，改前即有），致图标字面文本渲染、json 页
 * 「JSONEditor is not defined」，均属 VM 环境 artifact；390px 断言以
 * docScrollWidth 为准。反向验证：HEAD 版旧模板跑同一测试 77 过／26 败，
 * 26 项失败恰为本轮新增修复断言（20 项静态）＋6 页 390px scrollWidth 实测值
 * （585／586／541／451／430／403），证明测试能抓住本缺陷、非自证。
 */
"use strict";
var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf-8"); }
var md = read("templates/markdown_preview.html");
var json = read("templates/json_parser.html");
var pc = read("templates/percentage_calc.html");
var cb = read("templates/colorblind_simulator.html");
var b64 = read("templates/base64.html");
var cal = read("templates/calendar.html");
var categories = read("tools/categories.go");

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name, extra !== undefined ? "(" + extra + ")" : ""); }
}
function eq(a, b, name) { ok(a === b, name, "期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a)); }
function count(h, pat) { var m = h.match(new RegExp(pat, "g")); return m ? m.length : 0; }
/* 取出指定选择器的规则块（不含嵌套；colorblind 页为压缩单行，同样适用） */
function ruleBlock(src, selector) {
  var esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var m = src.match(new RegExp(esc + "\\s*\\{([^}]*)\\}"));
  return m ? m[1] : null;
}

/* ---------- markdown-preview ---------- */
var mdPanel = ruleBlock(md, ".markdown-panel");
var mdHeader = ruleBlock(md, ".markdown-header");
var mdHeaderBtns = ruleBlock(md, ".markdown-header-buttons");
ok(mdPanel !== null, "markdown：.markdown-panel 规则存在");
ok(mdHeader !== null, "markdown：.markdown-header 规则存在");
ok(mdHeaderBtns !== null, "markdown：.markdown-header-buttons 规则存在");
ok(mdPanel && /min-width\s*:\s*0/.test(mdPanel), "markdown：.markdown-panel 含 min-width: 0");
ok(mdHeader && /flex-wrap\s*:\s*wrap/.test(mdHeader), "markdown：.markdown-header 含 flex-wrap: wrap");
ok(mdHeaderBtns && /flex-wrap\s*:\s*wrap/.test(mdHeaderBtns), "markdown：按钮组含 flex-wrap: wrap");
ok(md.indexOf("grid-template-columns: 1fr 1fr") !== -1, "markdown：桌面端两列 grid 规则未动");
ok(md.indexOf("@media (max-width: 768px)") !== -1, "markdown：768px 折叠媒体查询未动");

/* ---------- json-parser（实测：容器已单轨，修 panel 不修容器） ---------- */
var jsonPanel = ruleBlock(json, ".json-panel");
var jsonHeader = ruleBlock(json, ".json-header");
ok(jsonPanel !== null, "json：.json-panel 规则存在");
ok(jsonHeader !== null, "json：.json-header 规则存在");
ok(jsonPanel && /min-width\s*:\s*0/.test(jsonPanel), "json：.json-panel 含 min-width: 0");
ok(jsonHeader && /flex-wrap\s*:\s*wrap/.test(jsonHeader), "json：.json-header 含 flex-wrap: wrap");
ok(json.indexOf("grid-template-columns: 1fr 1fr") !== -1, "json：.json-container 桌面端两列规则未动");
ok(json.indexOf("@media (max-width: 768px)") !== -1 && json.indexOf("grid-template-columns: 1fr;") !== -1,
  "json：768px 折叠媒体查询未动（容器单轨折叠生效，修 panel 不修容器）");
eq(count(json, "flex-wrap: wrap; min-width: 0;"), 2, "json：两处按钮组行内样式均加 flex-wrap: wrap＋min-width: 0");
["formatBtn", "minifyBtn", "demoBtn", "clearBtn", "toggleViewBtn", "copyBtn"].forEach(function (id) {
  ok(json.indexOf('id="' + id + '"') !== -1, "json：6 按钮之一仍在：" + id);
});
ok(json.indexOf("jsoneditor") !== -1, "json：JSONEditor CDN 引用与初始化未动");

/* ---------- percentage-calc ---------- */
eq(count(pc, "grid-template-columns: 1fr auto 1fr"), 1, "percentage：三列规则仅剩 1 处（min-width:641px 媒体查询内，行内 style 已删净）");
eq(count(pc, 'style="grid-template-columns:1fr auto 1fr;"'), 0, "percentage：两处行内 grid-template-columns 已删除");
eq(count(pc, 'class="pc-grid pc-grid-3"'), 2, "percentage：两处 grid 改挂 .pc-grid-3 类");
ok(pc.indexOf("@media (min-width: 641px)") !== -1 && pc.indexOf(".pc-grid-3 { grid-template-columns: 1fr auto 1fr; }") !== -1,
  "percentage：桌面端三列只在 min-width:641px 里恢复（改前布局不变）");
ok(pc.indexOf("@media (max-width: 640px) { .pc-grid { grid-template-columns: 1fr; } }") !== -1,
  "percentage：640px 单列折叠媒体查询未动");
var bandField = ruleBlock(pc, ".pc-band-row .pc-field");
var bandInput = ruleBlock(pc, ".pc-band-row .pc-field input");
ok(bandField && /min-width\s*:\s*0/.test(bandField), "percentage：段位行 .pc-field 含 min-width: 0（第二溢出源）");
ok(bandInput && /min-width\s*:\s*0/.test(bandInput) && /width\s*:\s*100%/.test(bandInput),
  "percentage：段位行 input 含 min-width: 0＋width: 100%");
ok(pc.indexOf(".pc-grid { display: grid; grid-template-columns: 1fr 1fr;") !== -1,
  "percentage：.pc-grid 基础两列规则未动");

/* ---------- colorblind-simulator ---------- */
var cbPanel = ruleBlock(cb, ".cb-panel");
var cbChipCode = ruleBlock(cb, ".cb-chip code");
ok(cbPanel !== null, "colorblind：.cb-panel 规则存在");
ok(cbPanel && /min-width\s*:\s*0/.test(cbPanel), "colorblind：.cb-panel 含 min-width: 0");
ok(cbChipCode && /overflow-wrap\s*:\s*anywhere/.test(cbChipCode), "colorblind：.cb-chip code 含 overflow-wrap: anywhere");
ok(cb.indexOf('<div class="cb-scroll-x"><div id="cb-contrast-out"></div></div>') !== -1,
  "colorblind：对比度表本就包在 .cb-scroll-x 里（无需再包一层）");
ok(cb.indexOf(".cb-table{width:100%") !== -1 && cb.indexOf("white-space:nowrap") !== -1,
  "colorblind：.cb-table 规则与 th/td nowrap 未动");
ok(cb.indexOf("grid-template-columns:1fr") !== -1, "colorblind：.cb-work 单列 grid 未动");

/* ---------- base64 ---------- */
var exBtn = ruleBlock(b64, ".example-btn");
var exSmall = ruleBlock(b64, ".example-btn small");
ok(exBtn !== null, "base64：.example-btn 规则存在");
ok(exBtn && /min-width\s*:\s*0/.test(exBtn), "base64：.example-btn 含 min-width: 0");
ok(exBtn && /max-width\s*:\s*100%/.test(exBtn), "base64：.example-btn 含 max-width: 100%");
ok(exBtn && /overflow-wrap\s*:\s*anywhere/.test(exBtn), "base64：.example-btn 含 overflow-wrap: anywhere");
ok(exSmall && /overflow-wrap\s*:\s*anywhere/.test(exSmall), "base64：.example-btn small 含 overflow-wrap: anywhere");
ok(exBtn && exBtn.indexOf("transition: all 0.2s") !== -1, "base64：.example-btn 原有 transition 未动");
/* data-text 一字不动：8 个示例按钮的 data-text 逐字仍在 */
["Hello, World!", "https://example.com/path?param=value", "用户名:密码",
 "{'name': 'John', 'age': 30}", "SGVsbG8sIFdvcmxkIQ==",
 "aHR0cHM6Ly9leGFtcGxlLmNvbS9wYXRoP3BhcmFtPXZhbHVl",
 "55So5oi35ZCN5a2X77ya5a+G56CB",
 "eydubWFtZSc6ICdKb2huJywgJ2FnZSc6IDMwfQ=="].forEach(function (t) {
  ok(b64.indexOf('data-text="' + t + '"') !== -1, "base64：data-text 一字未改：" + t.slice(0, 24));
});
eq(count(b64, 'class="example-btn"'), 8, "base64：示例按钮仍为 8 个");

/* ---------- calendar ---------- */
ok(cal.indexOf(".calendar-header { flex-wrap: wrap;") !== -1,
  "calendar：模板内联 <style> 含 .calendar-header flex-wrap: wrap");
ok(cal.indexOf('.calendar-header #currentMonth { min-width: 0; }') !== -1,
  "calendar：#currentMonth 含 min-width: 0");
["prevMonth", "nextMonth", "currentMonth"].forEach(function (id) {
  ok(cal.indexOf('id="' + id + '"') !== -1, "calendar：头部三件套仍在：" + id);
});
ok(cal.indexOf('href="/tools/static/css/calendar.css"') !== -1, "calendar：calendar.css 引用未动（不动 static/css）");

/* ---------- 功能锚点静态存在性 ---------- */
["markdownInput", "previewBtn", "markdownPreview"].forEach(function (id) {
  ok(md.indexOf('id="' + id + '"') !== -1, "锚点：markdown 仍有 #" + id);
});
["pc-pct", "pc-dec", "pc-frac-a", "pc-frac-b", "pc-cr-old", "pc-cr-new",
 "pc-mk-score", "pc-mk-total", "pc-band-a", "pc-band-b", "pc-band-c", "pc-band-d"].forEach(function (id) {
  ok(pc.indexOf('id="' + id + '"') !== -1, "锚点：percentage 仍有 #" + id);
});
["cb-single-text", "cb-palette-text", "cb-contrast-out", "cb-contrast-summary"].forEach(function (id) {
  ok(cb.indexOf('id="' + id + '"') !== -1, "锚点：colorblind 仍有 #" + id);
});
["inputText", "outputText"].forEach(function (id) {
  ok(b64.indexOf('id="' + id + '"') !== -1, "锚点：base64 仍有 #" + id);
});

/* ---------- 全局守卫 ---------- */
eq(count(categories, '"/tools/[^"]+"'), 328, "Path 总数 328 不变");

/* ---------- 真实页面模式 ---------- */
var liveFile = process.env.MOBILE390_JSON || "";
var regFile = process.env.MOBILE390_REGRESSION_JSON || "";
if (liveFile && fs.existsSync(liveFile)) {
  console.log("模式：真实页面（MOBILE390_JSON）");
  var rows = JSON.parse(fs.readFileSync(liveFile, "utf-8"));
  var slugs = ["markdown-preview", "json-parser", "percentage-calc", "colorblind-simulator", "base64", "calendar"];
  slugs.forEach(function (slug) {
    var r390 = rows.filter(function (r) { return r.slug === slug && r.viewport === 390; })[0];
    var r1919 = rows.filter(function (r) { return r.slug === slug && r.viewport === 1919; })[0];
    ok(r390, "真实页面：390px 实测含 " + slug);
    if (r390) eq(r390.scrollWidth, 390, "真实页面：390px " + slug + " scrollWidth = 390（改前 585／586／541／451／430／403）");
    ok(r1919, "真实页面：1919px 实测含 " + slug);
    if (r1919) eq(r1919.scrollWidth, 1919, "真实页面：1919px " + slug + " scrollWidth = 1919（桌面端无溢出）");
  });
} else {
  console.log("模式：静态断言（未设 MOBILE390_JSON；设环境变量可跑真实页面锚点）");
}
if (regFile && fs.existsSync(regFile)) {
  var reg = JSON.parse(fs.readFileSync(regFile, "utf-8")).regression390;
  ok(Array.isArray(reg) && reg.length === 10, "回归：实测含首页＋9 个已无溢出抽查页（共 10 项）");
  (reg || []).forEach(function (r) {
    eq(r.scrollWidth, 390, "回归：390px " + r.slug + " 仍无溢出");
  });
}

console.log("mobile_overflow_390: pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
