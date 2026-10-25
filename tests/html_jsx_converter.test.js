/* HTML/SVG→JSX 转换器纯逻辑单元测试（零依赖）：node tests/html_jsx_converter.test.js
 * 覆盖：属性映射闭环（class/for/SVG camelCase/常用映射≥10 项）、data-* 与
 * aria-* 原样保留、未知属性原样保留并列清单、void 自闭合、style 对象化、
 * 注释转换、布尔属性无值保留、片段/组件双模式与非法组件名报错、报告计数
 * 与实际改动逐项对齐、5 项规则开关关闭后输出与报告同步变化、3 组示例、
 * 注册（179→180 Path）与零网络请求、模板真限制文案与互链。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/html_jsx_converter.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（应包含 " + JSON.stringify(sub) + "，实得 " + JSON.stringify(s) + "）"); }
function notHas(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "html_jsx_converter.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "html_jsx_converter.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. 属性映射闭环 ---------- */
var R1 = M.convert('<div class="card"><label for="name">名</label></div>');
ok(R1.valid, "映射：合法");
has(R1.code, 'className="card"', "映射：class→className");
has(R1.code, 'htmlFor="name"', "映射：for→htmlFor");
notHas(R1.code, 'class="card"', "映射：原 class 不残留");
eq(R1.report.mappingCount, 2, "映射：报告计数 2");

var svg = '<svg><path stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 2" fill-rule="evenodd" clip-path="url(#c)" font-size="14" text-anchor="middle" /><a xlink:href="#x">t</a></svg>';
var R2 = M.convert(svg);
has(R2.code, 'strokeWidth="2"', "SVG：stroke-width→strokeWidth");
has(R2.code, 'strokeLinecap="round"', "SVG：stroke-linecap→strokeLinecap");
has(R2.code, 'strokeLinejoin="round"', "SVG：stroke-linejoin→strokeLinejoin");
has(R2.code, 'strokeDasharray="4 2"', "SVG：stroke-dasharray→strokeDasharray");
has(R2.code, 'fillRule="evenodd"', "SVG：fill-rule→fillRule");
has(R2.code, 'clipPath="url(#c)"', "SVG：clip-path→clipPath");
has(R2.code, 'fontSize="14"', "SVG：font-size→fontSize");
has(R2.code, 'textAnchor="middle"', "SVG：text-anchor→textAnchor");
has(R2.code, 'xlinkHref="#x"', "SVG：xlink:href→xlinkHref");

var R3 = M.convert('<table cellpadding="2" cellspacing="0"><tr><td colspan="2" rowspan="3" tabindex="1" readonly maxlength="10" accesskey="s" datetime="2026-10-26">x</td></tr></table>');
has(R3.code, 'cellPadding="2"', "常用映射：cellpadding→cellPadding");
has(R3.code, 'cellSpacing="0"', "常用映射：cellspacing→cellSpacing");
has(R3.code, 'colSpan="2"', "常用映射：colspan→colSpan");
has(R3.code, 'rowSpan="3"', "常用映射：rowspan→rowSpan");
has(R3.code, 'tabIndex="1"', "常用映射：tabindex→tabIndex");
has(R3.code, 'readOnly', "常用映射：readonly→readOnly（布尔无值）");
has(R3.code, 'maxLength="10"', "常用映射：maxlength→maxLength");
has(R3.code, 'accessKey="s"', "常用映射：accesskey→accessKey");
has(R3.code, 'dateTime="2026-10-26"', "常用映射：datetime→dateTime");

/* ---------- 2. 原样保留：data-*/ /* aria-* / 未知属性 ---------- */
var R4 = M.convert('<div data-id="a1" aria-label="关闭" custom-attr="keep" id="main">x</div>');
has(R4.code, 'data-id="a1"', "保留：data-* 原样");
has(R4.code, 'aria-label="关闭"', "保留：aria-* 原样");
has(R4.code, 'custom-attr="keep"', "保留：未知属性原样");
ok(R4.report.preservedCount === 3, "保留：报告计数 3（实得 " + R4.report.preservedCount + "）");
ok(R4.report.preserved.some(function (p) { return p.name === "custom-attr"; }), "保留：未知属性列入清单");
ok(!R4.report.preserved.some(function (p) { return p.name === "id"; }), "保留：常规属性 id 不进保留清单");

/* ---------- 3. 结构闭环：void 自闭合 / style 对象化 / 注释 / 布尔 ---------- */
var R5 = M.convert('<div><br><img src="a.png" alt="a"><input type="text"><hr></div>');
has(R5.code, '<br />', "结构：br 自闭合");
has(R5.code, '<img src="a.png" alt="a" />', "结构：img 自闭合");
has(R5.code, '<input type="text" />', "结构：input 自闭合");
has(R5.code, '<hr />', "结构：hr 自闭合");
eq(R5.report.selfClosedCount, 4, "结构：自闭合计数 4");

var R6 = M.convert('<p style="color: red; font-size: 14px; background-color: #fff;">hi</p>');
has(R6.code, "style={{color: 'red', fontSize: '14px', backgroundColor: '#fff'}}", "结构：style 对象化 + camelCase");
eq(R6.report.styleCount, 1, "结构：style 计数 1");
ok(R6.report.styleProps.indexOf("fontSize") !== -1, "结构：styleProps 含 fontSize");

var R7 = M.convert('<!-- 备注 --><p>x</p>');
has(R7.code, '{/* 备注 */}', "结构：HTML 注释→{/* */}");
eq(R7.report.commentCount, 1, "结构：注释计数 1");

var R8 = M.convert('<input type="checkbox" checked><button disabled>ok</button><option selected>1</option>');
has(R8.code, 'checked', "布尔：checked 无值保留");
notHas(R8.code, 'checked=', "布尔：checked 不带值");
has(R8.code, '<button disabled>', "布尔：disabled 无值保留");
has(R8.code, 'selected', "布尔：selected 无值保留");

/* 未闭合 SVG 形状自动自闭合（JSX 里必须闭合） */
var R9 = M.convert('<svg><path d="M0 0h10"></svg>');
has(R9.code, '<path d="M0 0h10" />', "结构：未闭合 path 自动自闭合");

/* ---------- 4. 模式闭环 ---------- */
var F = M.convert('<p class="a">hi</p>');
notHas(F.code, 'export default', "片段模式：无组件壳");
has(F.code, 'className="a"', "片段模式：仍做映射");
var C = M.convert('<p>hi</p>', { mode: "component", componentName: "MyCard" });
has(C.code, 'export default function MyCard()', "组件模式：包 export default function");
has(C.code, '<p>hi</p>', "组件模式：内含片段");
var Bad1 = M.convert('<p>x</p>', { mode: "component", componentName: "123abc" });
ok(!Bad1.valid && Bad1.error.indexOf("合法标识符") !== -1, "组件名：数字开头报错");
var Bad2 = M.convert('<p>x</p>', { mode: "component", componentName: "my-card" });
ok(!Bad2.valid, "组件名：含连字符报错");
var Bad3 = M.convert('<p>x</p>', { mode: "component", componentName: "myCard" });
ok(!Bad3.valid && Bad3.error.indexOf("大写") !== -1, "组件名：小写开头报错");
var Bad4 = M.convert('<p>x</p>', { mode: "component", componentName: "" });
ok(!Bad4.valid, "组件名：空名报错");
var Empty = M.convert('   ');
ok(!Empty.valid, "空输入报错");

/* ---------- 5. 报告与开关同步 ---------- */
var allOff = { map: false, voidSelfClose: false, styleObject: false, commentConvert: false, booleanBare: false };
var S = M.convert('<div class="a"><!-- c --><br><p style="color: red;">x</p><input checked></div>', { rules: allOff });
has(S.code, 'class="a"', "开关关：映射关闭后 class 原样");
has(S.code, '<!-- c -->', "开关关：注释关闭后原样");
has(S.code, '<br>', "开关关：void 关闭后不自闭合");
notHas(S.code, '<br />', "开关关：void 关闭后无自闭合");
has(S.code, 'style="color: red;"', "开关关：style 关闭后字符串原样");
has(S.code, 'checked="true"', "开关关：布尔关闭后显式值");
eq(S.report.mappingCount, 0, "开关关：映射计数归零");
eq(S.report.selfClosedCount, 0, "开关关：自闭合计数归零");
eq(S.report.styleCount, 0, "开关关：style 计数归零");
eq(S.report.commentCount, 0, "开关关：注释计数归零");
var S2 = M.convert('<div class="a"><br></div>', { rules: { map: true, voidSelfClose: true, styleObject: true, commentConvert: true, booleanBare: true } });
has(S2.code, 'className="a"', "开关开：映射恢复");
has(S2.code, '<br />', "开关开：自闭合恢复");

/* ---------- 6. 示例与注册、静态检查 ---------- */
eq(M.EXAMPLES.length, 3, "示例：共 3 组");
var E0 = M.convert(M.EXAMPLES[0].html);
ok(E0.valid && E0.code.indexOf("className") !== -1, "示例 1：卡片可转换且含映射");
var E1 = M.convert(M.EXAMPLES[1].html);
ok(E1.valid && E1.code.indexOf("strokeWidth") !== -1, "示例 2：SVG 可转换且含 SVG 映射");
var E2 = M.convert(M.EXAMPLES[2].html);
ok(E2.valid && E2.code.indexOf("htmlFor") !== -1 && E2.code.indexOf("checked") !== -1, "示例 3：表单可转换");
ok(/ID:\s+"html_jsx_converter"[\s\S]{0,1200}?Path:\s+"\/tools\/html-jsx-converter"/.test(GO_SRC), "注册：ID 与 Path");
ok(/ID:\s+"html_jsx_converter"[\s\S]{0,1200}?Category:\s+"开发工具"/.test(GO_SRC), "注册：Category 开发工具");
ok(/ID:\s+"html_jsx_converter"[\s\S]{0,1200}?New:\s+true/.test(GO_SRC), "注册：New: true");
eq((GO_SRC.match(/Path:\s+"/g) || []).length, 180, "注册总数 179→180 Path");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/html-jsx-converter", "模板 canonical");
has(TPL_SRC, "application/ld+json", "模板 JSON-LD");
has(TPL_SRC, "/tools/svg-compressor", "互链 SVG 压缩器");
has(TPL_SRC, "id=\"jx-output\"", "输出只读区 id");
has(TPL_SRC, "id=\"jx-copy\"", "复制按钮 id");
has(TPL_SRC, "id=\"jx-download\"", "下载按钮 id");
has(TPL_SRC, ".jsx", "下载文件 .jsx");
has(TPL_SRC, "只做词法级转换，不做语义校验", "真限制：词法级、不做语义校验");
has(TPL_SRC, "需在你的项目里编译验证", "真限制：需项目编译验证");
has(TPL_SRC, "未知属性原样保留", "真限制：原样保留");
has(TPL_SRC, "不读用户项目文件", "真限制：不读项目文件");
has(TPL_SRC, "style 只做字面转换，不补单位、不展开简写", "真限制：style 字面转换");
has(TPL_SRC, "不解析 JS 表达式", "真限制：不解析 JS 表达式");
has(TPL_SRC, "文本不出浏览器", "真限制：文本不出浏览器");
ok(JS_SRC.indexOf("fetch(") === -1 && JS_SRC.indexOf("XMLHttpRequest") === -1 && JS_SRC.indexOf("WebSocket") === -1, "JS 零 fetch/XHR/WebSocket");
ok(JS_SRC.indexOf("innerHTML") === -1, "JS 不用 innerHTML 做转换");
ok(TPL_SRC.indexOf("fonts.googleapis.com") === -1 && TPL_SRC.indexOf("cdn.") === -1, "模板零 CDN");

console.log("html_jsx_converter: " + pass + " passed, " + fail + " failed");
if (fail > 0) process.exit(1);
