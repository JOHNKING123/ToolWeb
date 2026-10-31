/* CSP 安全头生成器（csp_builder）纯逻辑单元测试（零依赖）：
 * node tests/csp_builder.test.js
 * 覆盖：规格确定性向量逐字命中（6 条）、错误约定（err.field）、
 * 指令表与三组预设结构、categories.go 注册（Path 总数 246→246）与零网络请求静态检查、
 * 模板真限制三条、与 http_header_analyzer 双向互链（生成 vs 检测）、
 * Description 中英文双语、不链未交付工具。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var C = require("../static/js/csp_builder.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "csp_builder.js"), "utf8");
var TPL = fs.readFileSync(path.join(__dirname, "..", "templates", "csp_builder.html"), "utf8");
var HHA_TPL = fs.readFileSync(path.join(__dirname, "..", "templates", "http_header_analyzer.html"), "utf8");
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
eq(C.buildCspValue({ "default-src": ["'self'"], "script-src": ["'self'", "https://cdn.example.com"] }),
    "default-src 'self'; script-src 'self' https://cdn.example.com",
    "向量1：buildCspValue 双指令");
var hRO = C.buildCspHeader({ "default-src": ["'self'"] }, { reportOnly: true });
eq(hRO.name, "Content-Security-Policy-Report-Only", "向量2：buildCspHeader reportOnly 头名");
eq(hRO.value, "default-src 'self'", "向量2：buildCspHeader reportOnly 值");
eq(C.buildCspHeader({ "default-src": ["'self'"] }).name, "Content-Security-Policy",
    "buildCspHeader：默认头名 Content-Security-Policy");
eq(C.buildCspHeader({ "default-src": ["'self'"] }, { reportOnly: false }).name, "Content-Security-Policy",
    "buildCspHeader：reportOnly:false 头名");
eq(C.buildMetaTag("default-src 'self'"),
    '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">',
    "向量3：buildMetaTag");
eq(C.buildMetaTag('a"b'),
    '<meta http-equiv="Content-Security-Policy" content="a&quot;b">',
    "buildMetaTag：双引号转义为 &quot;");
eqArr(C.parseSourceList("'self' https://a.com,\nhttps://b.com"),
    ["'self'", "https://a.com", "https://b.com"],
    "向量4：parseSourceList");
eqArr(C.parseSourceList(""), [], "parseSourceList：空串 → []");
eq(C.buildCspValue({ "default-src": [] }), "", "向量5：空源数组的指令被忽略 → ''");
eq(C.buildCspValue({}), "", "buildCspValue：空对象 → ''");

/* ---------- 2. 错误约定（err.field） ---------- */
throwsField(function () { C.buildCspValue(null); }, "directives", "向量6：buildCspValue(null) 抛 Error field=directives");
throwsField(function () { C.buildCspValue("x"); }, "directives", "buildCspValue(字符串) field=directives");
throwsField(function () { C.buildCspValue(["a"]); }, "directives", "buildCspValue(数组) field=directives");
throwsField(function () { C.buildCspValue({ "default-src": "oops" }); }, "default-src",
    "buildCspValue：源非数组 field=指令名");
throwsField(function () { C.buildCspValue({ "script-src": [123] }); }, "script-src",
    "buildCspValue：源非字符串 field=指令名");
throwsField(function () { C.buildCspValue({ "img-src": ["  "] }); }, "img-src",
    "buildCspValue：源为空白串 field=指令名");
throwsField(function () { C.buildCspHeader(null); }, "directives", "buildCspHeader(null) field=directives");
throwsField(function () { C.buildCspHeader({ "default-src": ["'self'"] }, "x"); }, "options",
    "buildCspHeader：options 非对象 field=options");
throwsField(function () { C.buildMetaTag(null); }, "value", "buildMetaTag(null) field=value");
throwsField(function () { C.buildMetaTag(123); }, "value", "buildMetaTag(数字) field=value");
throwsField(function () { C.parseSourceList(null); }, "text", "parseSourceList(null) field=text");
throwsField(function () { C.parseSourceList(undefined); }, "text", "parseSourceList(undefined) field=text");

/* ---------- 3. 指令表与三组预设 ---------- */
eq(C.DIRECTIVES.length, 16, "指令表：16 条常用指令");
ok(C.DIRECTIVES.every(function (d) {
    return d && typeof d.name === "string" && typeof d.cn === "string" &&
        Array.isArray(d.keywords) && d.keywords.length > 0;
}), "指令表：每条含 name/cn/keywords");
var dirNames = C.DIRECTIVES.map(function (d) { return d.name; });
ok(dirNames.indexOf("default-src") === 0, "指令表：首条为 default-src");
["script-src", "style-src", "img-src", "connect-src", "frame-ancestors", "form-action"].forEach(function (n) {
    ok(dirNames.indexOf(n) !== -1, "指令表：含 " + n);
});
eq(C.PRESETS.length, 3, "预设：共 3 组");
eqArr(C.PRESETS.map(function (p) { return p.id; }), ["strict", "cdn", "report"], "预设：id 为 strict/cdn/report");
eq(C.PRESETS[2].reportOnly, true, "预设 report：reportOnly=true");
eq(C.PRESETS[0].reportOnly, false, "预设 strict：reportOnly=false");
eq(C.PRESETS[1].reportOnly, false, "预设 cdn：reportOnly=false");
eq(C.buildCspValue(C.PRESETS[0].directives),
    "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
    "预设 strict：拼装向量");
eq(C.buildCspValue(C.PRESETS[1].directives),
    "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; " +
    "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; " +
    "img-src 'self' data: https:; font-src 'self' data: https:; " +
    "connect-src 'self'; frame-ancestors 'none'",
    "预设 cdn：拼装向量");
var hReport = C.buildCspHeader(
    { "default-src": C.PRESETS[2].directives["default-src"], "report-uri": C.PRESETS[2].directives["report-uri"] },
    { reportOnly: C.PRESETS[2].reportOnly });
eq(hReport.name, "Content-Security-Policy-Report-Only", "预设 report：头名为 Report-Only");
eq(hReport.value, "default-src 'self'; report-uri /csp-violation-report-endpoint", "预设 report：拼装向量");

/* ---------- 4. 双模式导出 ---------- */
has(SRC, "module.exports", "双模式：module.exports 暴露纯函数");
has(SRC, "window.CspBuilder", "双模式：window.CspBuilder 全局");

/* ---------- 5. categories.go 注册 ---------- */
has(GO, '"csp_builder"', "注册：categories.go 含 ID csp_builder");
has(GO, '"/tools/csp-builder"', "注册：categories.go 含 Path /tools/csp-builder");
var idx = GO.indexOf('"csp_builder"');
ok(GO.slice(idx, idx + 1200).indexOf('Category:    "开发工具"') !== -1, "注册：Category 为开发工具");
ok(GO.slice(idx, idx + 1200).indexOf("New:         true") !== -1, "注册：New 为 true");
ok(GO.slice(idx, idx + 1200).indexOf('Icon:        "policy"') !== -1, "注册：Icon 为 policy");
var descStart = GO.indexOf("Description:", idx);
var descEnd = GO.indexOf('Path:', idx);
var desc = GO.slice(descStart, descEnd);
ok(desc.indexOf("Content-Security-Policy") !== -1, "注册：Description 含中文说明");
ok(desc.indexOf("CSP security header generator") !== -1, "注册：Description 含英文说明（中英双语）");
var pathCount = 0;
var m;
var re = /"\/tools\/[^"]+"/g;
var seen = {};
while ((m = re.exec(GO)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 246, "注册：去重 Path 总数 246→246");

/* ---------- 6. 零网络请求静态检查 ---------- */
notHas(SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL, "fetch(", "零网络：模板无 fetch 调用");
notHas(TPL, "XMLHttpRequest", "零网络：模板无 XHR");
var extScripts = (TPL.match(/<script[^>]+src="https?:\/\/[^"]+"/g) || []).length;
eq(extScripts, 0, "零外部脚本：模板无 https 外部 script");

/* ---------- 7. 模板：真限制三条页面明示 ---------- */
ok(TPL.indexOf("只产出配置文本") !== -1 && TPL.indexOf("不验证") !== -1, "真限制①：只产出配置文本、不验证生效");
ok(TPL.indexOf("frame-ancestors") !== -1 && TPL.indexOf("report-uri") !== -1 && TPL.indexOf("sandbox") !== -1,
    "真限制②：meta 不支持 frame-ancestors/report-uri/sandbox 等指令");
ok(TPL.indexOf("report-uri") !== -1 && TPL.indexOf("趋向废弃") !== -1, "真限制③：report-uri 趋向废弃");

/* ---------- 8. 互链（生成 vs 检测）与不链未交付 ---------- */
has(TPL, "/tools/http-header-analyzer", "互链：模板链向 HTTP 响应头分析器");
has(TPL, "生成 vs 检测", "互链：含「生成 vs 检测」文案");
has(HHA_TPL, "/tools/csp-builder", "反向互链：http_header_analyzer 模板链回 CSP 安全头生成器");
var linkRe = /href="(\/tools\/[^"]+)"/g, lm, linkCount = 0, allDelivered = true;
while ((lm = linkRe.exec(TPL)) !== null) {
    if (lm[1].indexOf("/tools/static/") === 0) continue; /* 静态资源非工具链接 */
    linkCount++;
    if (GO.indexOf('"' + lm[1] + '"') === -1) { allDelivered = false; console.error("未交付链接：", lm[1]); }
}
ok(linkCount > 0, "互链：模板含站内 /tools/ 链接");
ok(allDelivered, "互链：所有 /tools/ 链接均已在 categories.go 注册（不链未交付工具）");

/* ---------- 9. 模板 SEO 与关键 DOM ---------- */
has(TPL, "https://www.johnkingzcq123.xyz/tools/csp-builder", "SEO：模板含 canonical 链接");
has(TPL, "csb-dirs", "模板：含指令勾选区");
has(TPL, "csb-presets", "模板：含一键预设区");
has(TPL, "csb-report-only", "模板：含 Report-Only 切换");
has(TPL, "csb-report-uri", "模板：含 report-uri 输入");
has(TPL, "csb-report-to", "模板：含 report-to 输入");
has(TPL, "csb-copy-header", "模板：含复制响应头按钮");
has(TPL, "csb-copy-meta", "模板：含复制 meta 片段按钮");

console.log("csp_builder: pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);
