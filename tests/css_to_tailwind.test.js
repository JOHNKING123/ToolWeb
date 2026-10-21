/* CSS 转 Tailwind 转换器纯逻辑单元测试（零依赖）：node tests/css_to_tailwind.test.js
 * 覆盖：
 *  1. CSS 解析（规则/媒体查询/裸声明/注释/括号安全切分/多选择器）
 *  2. 间距映射（命名/负值/简写展开/auto/rem/v4 动态分数）
 *  3. 字号/字重/行高/字距
 *  4. 颜色（精确色板/rgb()/关键字/未命中任意值/transparent）
 *  5. 圆角（命名/方向/多值/整圆）
 *  6. Flex/Grid/定位/边框/背景/文本等高频声明
 *  7. 任意值兜底与无法映射项（原声明＋行内注释）
 *  8. v3/v4 差异（重命名/important/动态间距）
 *  9. 媒体查询前缀（min/max/非常规断点）
 * 10. renderText 输出格式
 * 11. 零上传：脚本内无 fetch/XHR/WebSocket/EventSource
 */
"use strict";
var T = require("../static/js/css_to_tailwind.js");
var fs = require("fs");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function contains(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（期望包含 " + JSON.stringify(sub) + "）"); }
function notContains(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }

/* 取单条声明的映射结果 */
function m(prop, value, ver) { return T.mapDeclaration(prop, value, ver || "v3"); }
function cls(prop, value, ver) { return m(prop, value, ver).classes.join(" "); }
function kind(prop, value, ver) { return m(prop, value, ver).kind; }

/* ================= 1. CSS 解析 ================= */
(function () {
    var r = T.parseCss(".a{padding:16px;color:red}.b{margin:0}");
    eq(r.length, 2, "两条规则");
    eq(r[0].selector, ".a", "选择器 .a");
    eq(r[0].decls.length, 2, ".a 有 2 条声明");
    eq(r[0].decls[0].prop, "padding", "声明 prop 解析");
    eq(r[0].decls[0].value, "16px", "声明 value 解析");

    r = T.parseCss("/* 注释 */ .a { padding: 16px; /* 行内注释 */ color: red; }");
    eq(r[0].decls.length, 2, "注释被剥离");

    r = T.parseCss(".a{background:rgba(0, 0, 0, 0.5);box-shadow:0 1px 2px rgba(0,0,0,.1), 0 2px 4px rgba(0,0,0,.1)}");
    eq(r[0].decls.length, 2, "括号内分号/逗号不切错");
    eq(r[0].decls[0].value, "rgba(0, 0, 0, 0.5)", "rgba 值完整");

    r = T.parseCss("padding: 16px; color: red");
    eq(r.length, 1, "裸声明解析为 1 条规则");
    eq(r[0].decls.length, 2, "裸声明 2 条");

    r = T.parseCss("@media (min-width: 768px){.a{display:flex}.b{padding:8px}}");
    eq(r.length, 2, "@media 内两条规则");
    eq(r[0].media, "(min-width: 768px)", "媒体条件保留");
    eq(r[0].prefix, "md", "768px → md 前缀");
    eq(r[0].decls[0].prop, "display", "@media 内声明解析");

    r = T.parseCss(".a, .b { padding: 4px; }");
    eq(r[0].selector, ".a, .b", "多选择器保留");

    r = T.parseCss("");
    eq(r.length, 0, "空输入 0 规则");

    r = T.parseCss("@media (min-width: 500px){.a{padding:4px}}");
    eq(r[0].prefix, "min-[500px]", "非常规断点 → min-[500px]");

    r = T.parseCss("@media (max-width: 767px){.a{padding:4px}}");
    eq(r[0].prefix, "max-md", "max-width 767px → max-md");
})();

/* ================= 2. 间距 ================= */
(function () {
    eq(cls("padding", "16px"), "p-4", "16px→p-4");
    eq(cls("margin", "16px"), "m-4", "margin 16px→m-4");
    eq(cls("padding-top", "8px"), "pt-2", "padding-top 8px→pt-2");
    eq(cls("margin-left", "4px"), "ml-1", "margin-left 4px→ml-1");
    eq(cls("margin", "-16px"), "-m-4", "负 margin→-m-4");
    eq(cls("margin-top", "-8px"), "-mt-2", "负 margin-top→-mt-2");
    eq(cls("padding", "1rem"), "p-4", "1rem→p-4");
    eq(cls("padding", "0"), "p-0", "0→p-0");
    eq(cls("padding", "1px"), "p-px", "1px→p-px");
    eq(cls("margin", "10px 20px"), "my-2.5 mx-5", "两值简写→my/mx");
    eq(cls("padding", "4px 8px 12px"), "pt-1 px-2 pb-3", "三值简写");
    eq(cls("margin", "1px 2px 3px 4px"), "mt-px mr-0.5 mb-[3px] ml-1", "四值简写（3px 无命名类→任意值）");
    eq(cls("margin", "0 auto"), "my-0 mx-auto", "margin: 0 auto→mx-auto");
    eq(cls("margin-left", "auto"), "ml-auto", "margin-left: auto→ml-auto");
    eq(cls("padding", "15px", "v4"), "p-3.75", "v4 动态间距 15px→p-3.75");
    eq(cls("padding", "18px", "v4"), "p-4.5", "v4 动态间距 18px→p-4.5");
    eq(kind("padding", "15px", "v3"), "arbitrary", "v3 非标间距→任意值");
    contains(cls("padding", "15px", "v3"), "p-[15px]", "v3 15px→p-[15px]");
    eq(cls("gap", "12px"), "gap-3", "gap 12px→gap-3");
    eq(cls("row-gap", "8px"), "gap-y-2", "row-gap→gap-y-2");
    eq(cls("column-gap", "16px"), "gap-x-4", "column-gap→gap-x-4");
    eq(cls("gap", "8px 16px"), "gap-y-2 gap-x-4", "gap 两值→gap-y/gap-x");
    eq(kind("padding", "-4px"), "unsupported", "负 padding 不支持");
})();

/* ================= 3. 字号/字重/行高/字距 ================= */
(function () {
    eq(cls("font-size", "12px"), "text-xs", "12px→text-xs");
    eq(cls("font-size", "14px"), "text-sm", "14px→text-sm");
    eq(cls("font-size", "16px"), "text-base", "16px→text-base");
    eq(cls("font-size", "18px"), "text-lg", "18px→text-lg");
    eq(cls("font-size", "20px"), "text-xl", "20px→text-xl");
    eq(cls("font-size", "24px"), "text-2xl", "24px→text-2xl");
    eq(cls("font-size", "30px"), "text-3xl", "30px→text-3xl");
    eq(cls("font-size", "13px"), "text-[13px]", "13px→text-[13px]");
    eq(kind("font-size", "13px"), "arbitrary", "非标准字号→任意值");
    eq(cls("font-weight", "700"), "font-bold", "700→font-bold");
    eq(cls("font-weight", "400"), "font-normal", "400→font-normal");
    eq(cls("font-weight", "bold"), "font-bold", "bold→font-bold");
    eq(cls("font-weight", "100"), "font-thin", "100→font-thin");
    eq(cls("line-height", "1.5"), "leading-normal", "1.5→leading-normal");
    eq(cls("line-height", "2"), "leading-loose", "2→leading-loose");
    eq(cls("line-height", "20px"), "leading-[20px]", "20px 行高→任意值");
    eq(cls("letter-spacing", "0.05em"), "tracking-wider", "0.05em→tracking-wider");
    eq(cls("letter-spacing", "-0.025em"), "tracking-tight", "负字距→tracking-tight");
})();

/* ================= 4. 颜色 ================= */
(function () {
    eq(cls("background-color", "#3b82f6"), "bg-blue-500", "#3b82f6→bg-blue-500");
    eq(cls("color", "#3b82f6"), "text-blue-500", "color 精确匹配");
    eq(cls("border-color", "#3b82f6"), "border-blue-500", "border-color 精确匹配");
    eq(cls("background-color", "#fff"), "bg-white", "#fff→bg-white");
    eq(cls("color", "#ffffff"), "text-white", "#ffffff→text-white");
    eq(cls("color", "#000"), "text-black", "#000→text-black");
    eq(cls("color", "rgb(59, 130, 246)"), "text-blue-500", "rgb()→text-blue-500");
    eq(cls("color", "rgba(59,130,246,1)"), "text-blue-500", "rgba alpha=1→命名类");
    eq(cls("background-color", "transparent"), "bg-transparent", "transparent");
    eq(cls("background-color", "#12ab34"), "bg-[#12ab34]", "色板未命中→bg-[#12ab34]");
    eq(kind("background-color", "#12ab34"), "arbitrary", "未命中色板→任意值");
    eq(cls("color", "red"), "text-[#ff0000]", "关键字 red 非色板色→任意值");
    eq(cls("background", "#3b82f6"), "bg-blue-500", "background 纯色→bg-blue-500");
    eq(cls("opacity", "0.5"), "opacity-50", "0.5→opacity-50");
    eq(cls("opacity", "1"), "opacity-100", "1→opacity-100");
    eq(cls("caret-color", "#3b82f6"), "caret-blue-500", "caret-color 映射");
})();

/* ================= 5. 圆角 ================= */
(function () {
    eq(cls("border-radius", "8px"), "rounded-lg", "8px→rounded-lg");
    eq(cls("border-radius", "4px"), "rounded", "4px→rounded");
    eq(cls("border-radius", "4px", "v4"), "rounded-sm", "v4 4px→rounded-sm");
    eq(cls("border-radius", "2px", "v4"), "rounded-xs", "v4 2px→rounded-xs");
    eq(cls("border-radius", "9999px"), "rounded-full", "9999px→rounded-full");
    eq(cls("border-radius", "50%"), "rounded-full", "50%→rounded-full");
    eq(cls("border-radius", "0"), "rounded-none", "0→rounded-none");
    eq(cls("border-top-left-radius", "8px"), "rounded-tl-lg", "左上圆角→rounded-tl-lg");
    eq(cls("border-radius", "4px 8px"), "rounded-[4px_8px]", "多值圆角→任意值");
    eq(kind("border-radius", "4px 8px"), "arbitrary", "多值圆角 kind");
})();

/* ================= 6. Flex/Grid/定位/文本 ================= */
(function () {
    eq(cls("display", "flex"), "flex", "display:flex→flex");
    eq(cls("display", "grid"), "grid", "display:grid→grid");
    eq(cls("display", "none"), "hidden", "display:none→hidden");
    eq(cls("display", "inline-flex"), "inline-flex", "inline-flex");
    eq(cls("flex-direction", "column"), "flex-col", "column→flex-col");
    eq(cls("flex-wrap", "wrap"), "flex-wrap", "wrap→flex-wrap");
    eq(cls("justify-content", "center"), "justify-center", "→justify-center");
    eq(cls("justify-content", "space-between"), "justify-between", "→justify-between");
    eq(cls("justify-content", "flex-start"), "justify-start", "flex-start→justify-start");
    eq(cls("align-items", "center"), "items-center", "→items-center");
    eq(cls("align-items", "flex-end"), "items-end", "flex-end→items-end");
    eq(cls("align-self", "stretch"), "self-stretch", "→self-stretch");
    eq(cls("flex", "1"), "flex-1", "flex:1→flex-1");
    eq(cls("flex", "none"), "flex-none", "flex:none→flex-none");
    eq(cls("flex", "2"), "flex-[2]", "flex:2→flex-[2]");
    eq(cls("flex-grow", "1"), "grow", "flex-grow:1→grow");
    eq(cls("flex-shrink", "0"), "flex-shrink-0", "v3 flex-shrink:0");
    eq(cls("flex-shrink", "0", "v4"), "shrink-0", "v4 flex-shrink:0→shrink-0");
    eq(cls("order", "2"), "order-2", "order:2→order-2");
    eq(cls("grid-template-columns", "repeat(3, 1fr)"), "grid-cols-3", "repeat(3,1fr)→grid-cols-3");
    eq(cls("grid-template-columns", "repeat(2, minmax(0, 1fr))"), "grid-cols-2", "minmax 写法→grid-cols-2");
    eq(cls("grid-column", "span 2"), "col-span-2", "span 2→col-span-2");
    eq(cls("position", "absolute"), "absolute", "absolute");
    eq(cls("position", "sticky"), "sticky", "sticky");
    eq(cls("top", "8px"), "top-2", "top 8px→top-2");
    eq(cls("top", "-8px"), "-top-2", "负 top→-top-2");
    eq(cls("left", "50%"), "left-1/2", "left 50%→left-1/2");
    eq(cls("inset", "0"), "inset-0", "inset:0→inset-0");
    eq(cls("z-index", "10"), "z-10", "z-10");
    eq(cls("z-index", "999"), "z-[999]", "z-999→任意值");
    eq(cls("overflow", "hidden"), "overflow-hidden", "overflow-hidden");
    eq(cls("overflow-x", "auto"), "overflow-x-auto", "overflow-x-auto");
    eq(cls("text-align", "center"), "text-center", "text-center");
    eq(cls("text-transform", "uppercase"), "uppercase", "uppercase");
    eq(cls("text-decoration", "underline"), "underline", "underline");
    eq(cls("text-decoration", "line-through"), "line-through", "line-through");
    eq(cls("white-space", "nowrap"), "whitespace-nowrap", "nowrap");
    eq(cls("vertical-align", "middle"), "align-middle", "align-middle");
    eq(cls("cursor", "pointer"), "cursor-pointer", "cursor-pointer");
    eq(cls("visibility", "hidden"), "invisible", "→invisible");
})();

/* ================= 7. 边框/背景/其他 ================= */
(function () {
    eq(cls("border-width", "1px"), "border", "1px→border");
    eq(cls("border-width", "2px"), "border-2", "2px→border-2");
    eq(cls("border-top-width", "2px"), "border-t-2", "border-t-2");
    eq(cls("border-style", "dashed"), "border-dashed", "dashed");
    eq(cls("border", "1px solid #e5e7eb"), "border border-solid border-gray-200", "border 简写三件套");
    eq(cls("box-shadow", "none"), "shadow-none", "shadow-none");
    eq(cls("box-shadow", "0 1px 2px 0 rgb(0 0 0 / 0.05)"), "shadow-sm", "v3 shadow-sm");
    eq(cls("box-shadow", "0 1px 2px 0 rgb(0 0 0 / 0.05)", "v4"), "shadow-xs", "v4 shadow-sm→shadow-xs");
    eq(cls("background-image", "none"), "bg-none", "bg-none");
    eq(cls("background-image", "linear-gradient(to right, #fff, #000)"), "bg-gradient-to-r", "v3 渐变方向");
    eq(cls("background-image", "linear-gradient(to right, #fff, #000)", "v4"), "bg-linear-to-r", "v4 渐变方向");
    eq(cls("background-size", "cover"), "bg-cover", "bg-cover");
    eq(cls("background-position", "center"), "bg-center", "bg-center");
    eq(cls("background-repeat", "no-repeat"), "bg-no-repeat", "bg-no-repeat");
    eq(cls("width", "137px"), "w-[137px]", "137px→w-[137px]");
    eq(cls("width", "100%"), "w-full", "100%→w-full");
    eq(cls("width", "50%"), "w-1/2", "50%→w-1/2");
    eq(cls("height", "100vh"), "h-screen", "100vh→h-screen");
    eq(cls("max-width", "640px"), "max-w-screen-sm", "640px→max-w-screen-sm");
    eq(cls("width", "16px"), "w-4", "width 16px→w-4");
    eq(cls("font-style", "italic"), "italic", "italic");
    eq(cls("aspect-ratio", "16/9"), "aspect-video", "aspect-video");
    eq(cls("user-select", "none"), "select-none", "select-none");
    eq(cls("pointer-events", "none"), "pointer-events-none", "pointer-events-none");
})();

/* ================= 8. 任意值兜底与不支持 ================= */
(function () {
    var r = m("clip-path", "circle(50%)");
    eq(r.kind, "arbitrary", "clip-path→任意值");
    eq(r.classes.join(" "), "[clip-path:circle(50%)]", "[clip-path:circle(50%)]");

    r = m("mask-type", "luminance");
    eq(r.kind, "arbitrary", "未知属性→任意属性兜底");
    eq(r.classes.join(" "), "[mask-type:luminance]", "任意属性语法");

    r = m("scroll-margin-top", "72px");
    eq(r.classes.join(" "), "[scroll-margin-top:72px]", "scroll-margin 兜底");

    r = m("--brand", "#3b82f6");
    eq(r.kind, "unsupported", "CSS 变量→不支持");
    contains(r.note, "tailwind.config", "CSS 变量注释提示");
    eq(r.classes.length, 0, "不支持项无类名");

    r = m("zoom", "1");
    eq(r.kind, "arbitrary", "zoom→[zoom:1] 兜底");
})();

/* ================= 9. v3/v4 差异 ================= */
(function () {
    eq(cls("border-radius", "8px", "v4"), "rounded-lg", "v4 rounded-lg 不变");
    var r = m("padding", "16px !important", "v3");
    eq(r.classes.join(" "), "!p-4", "v3 important 前缀");
    r = m("padding", "16px !important", "v4");
    eq(r.classes.join(" "), "p-4!", "v4 important 后缀");
    eq(cls("outline", "none", "v4"), "outline-hidden", "v4 outline-none→outline-hidden");
    eq(cls("outline", "none", "v3"), "outline-none", "v3 outline-none 保持");
})();

/* ================= 10. 媒体查询前缀 ================= */
(function () {
    var c = T.convertCss("@media (min-width: 1024px){.a{display:flex}}", "v3");
    eq(c.rules[0].items[0].classes.join(" "), "lg:flex", "1024px→lg: 前缀");
    c = T.convertCss("@media (min-width: 640px){.a{padding:4px}}", "v3");
    eq(c.rules[0].items[0].classes.join(" "), "sm:p-1", "640px→sm: 前缀");
    c = T.convertCss("@media (min-width: 1280px){.a{padding:4px}}", "v3");
    eq(c.rules[0].items[0].classes.join(" "), "xl:p-1", "1280px→xl: 前缀");
    c = T.convertCss("@media (max-width: 1023px){.a{display:none}}", "v3");
    eq(c.rules[0].items[0].classes.join(" "), "max-lg:hidden", "max-width→max-lg: 前缀");
})();

/* ================= 11. convertCss 统计与 renderText ================= */
(function () {
    var c = T.convertCss(".a{padding:16px;width:137px;*zoom:1}", "v3");
    eq(c.stats.decls, 3, "3 条声明");
    eq(c.stats.named, 1, "1 命名类");
    eq(c.stats.arbitrary, 1, "1 任意值");
    eq(c.stats.unsupported, 1, "1 不支持");
    var t = T.renderText(c);
    contains(t, "/* .a */", "renderText 选择器注释");
    contains(t, "padding: 16px;  /* → p-4 */", "renderText 逐声明行");
    contains(t, "*zoom: 1;  /* → /* 暂无对应工具类，需手写 CSS */ */", "renderText 不支持项原声明＋行内注释");

    var c4 = T.convertCss(".a{padding:16px}", "v4");
    eq(c4.version, "v4", "版本透传");
})();

/* ================= 12. 零上传 ================= */
(function () {
    var src = fs.readFileSync(__dirname + "/../static/js/css_to_tailwind.js", "utf8");
    notContains(src, "fetch(", "无 fetch");
    notContains(src, "XMLHttpRequest", "无 XHR");
    notContains(src, "WebSocket", "无 WebSocket");
    notContains(src, "EventSource", "无 EventSource");
    notContains(src, "navigator.sendBeacon", "无 sendBeacon");
})();

console.log("\n通过 " + pass + " / " + (pass + fail) + " 断言" + (fail ? "，失败 " + fail : ""));
process.exit(fail ? 1 : 0);
