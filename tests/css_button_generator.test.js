/* CSS 按钮生成器纯逻辑单元测试（零依赖）：node tests/css_button_generator.test.js
 * 覆盖：validateState 校验向量（非法颜色/越界数值/非法枚举/非法布尔，err.field 正确）、
 * validateConfig（空 selector/非法选择器/非法态透传）、stateDiffers 真假、
 * buildDeclarations（9 行声明、属性名与已知值）、buildButtonCSS（四规则块、省略一致态）、
 * PRESETS（4 组、命名、可直接载入）、generateExample（四态差异）、
 * suggestExportName（两 kind 文件名、其它 kind 失败）、buildDemoPage（演示页）、
 * 注册与模板静态检查、零网络请求。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/css_button_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function throwsField(fn, field, name) {
  try { fn(); ok(false, name + "（应抛错但未抛）"); }
  catch (e) { eq(e.field, field, name + " err.field"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "css_button_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "css_button_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

function goodState() { return M.defaultState(); }

/* ---------- 1. validateState：合法通过 ---------- */
ok(M.validateState(goodState(), "default") === true, "合法 State 通过校验");
var s3 = goodState();
s3.background.color = "#abc";
ok(M.validateState(s3, "default") === true, "#RGB 三位颜色合法");

/* ---------- 2. validateState：非法颜色 ---------- */
var c1 = goodState(); c1.background.color = "red";
throwsField(function () { M.validateState(c1, "default"); }, "default.background.color", "非法颜色 red");
var c2 = goodState(); c2.border.color = "#12";
throwsField(function () { M.validateState(c2, "default"); }, "default.border.color", "非法颜色 #12");
var c3 = goodState(); c3.font.color = "#gggggg";
throwsField(function () { M.validateState(c3, "default"); }, "default.font.color", "非法颜色 #gggggg");
var c4 = goodState(); c4.boxShadow.color = "";
throwsField(function () { M.validateState(c4, "default"); }, "default.boxShadow.color", "空颜色非法");

/* ---------- 3. validateState：数值越界 ---------- */
var r1 = goodState(); r1.borderRadius = -1;
throwsField(function () { M.validateState(r1, "default"); }, "default.borderRadius", "圆角 -1 越界");
var r2 = goodState(); r2.borderRadius = 101;
throwsField(function () { M.validateState(r2, "default"); }, "default.borderRadius", "圆角 101 越界");
var r3 = goodState(); r3.border.width = 13;
throwsField(function () { M.validateState(r3, "default"); }, "default.border.width", "边框宽度 13 越界");
var r4 = goodState(); r4.font.size = 9;
throwsField(function () { M.validateState(r4, "default"); }, "default.font.size", "字号 9 越界");
var r5 = goodState(); r5.font.size = 33;
throwsField(function () { M.validateState(r5, "default"); }, "default.font.size", "字号 33 越界");
var r6 = goodState(); r6.background.opacity = 101;
throwsField(function () { M.validateState(r6, "default"); }, "default.background.opacity", "透明度 101 越界");
var r7 = goodState(); r7.padding.y = 41;
throwsField(function () { M.validateState(r7, "default"); }, "default.padding.y", "内边距上下 41 越界");
var r8 = goodState(); r8.boxShadow.blur = -1;
throwsField(function () { M.validateState(r8, "default"); }, "default.boxShadow.blur", "阴影模糊 -1 越界");
var r9 = goodState(); r9.font.letterSpacing = NaN;
throwsField(function () { M.validateState(r9, "default"); }, "default.font.letterSpacing", "NaN 非法");
var r10 = goodState(); r10.boxShadow.x = Infinity;
throwsField(function () { M.validateState(r10, "default"); }, "default.boxShadow.x", "Infinity 非法");

/* ---------- 4. validateState：枚举与布尔 ---------- */
var e1 = goodState(); e1.border.style = "groove";
throwsField(function () { M.validateState(e1, "default"); }, "default.border.style", "边框样式枚举外非法");
var e2 = goodState(); e2.font.weight = 800;
throwsField(function () { M.validateState(e2, "default"); }, "default.font.weight", "字重 800 非法");
var e3 = goodState(); e3.boxShadow.inset = 1;
throwsField(function () { M.validateState(e3, "default"); }, "default.boxShadow.inset", "inset 非布尔非法");
var e4 = goodState(); e4.font.weight = 700;
ok(M.validateState(e4, "default") === true, "字重 700 合法");

/* ---------- 5. validateConfig ---------- */
var cfg0 = M.defaultConfig();
var norm = M.validateConfig(cfg0);
eq(norm.selector, ".btn", "validateConfig 返回归一化 config");
var cfgS = M.defaultConfig(); cfgS.selector = "  .my-btn  ";
eq(M.validateConfig(cfgS).selector, ".my-btn", "selector 去首尾空格");
throwsField(function () { var c = M.defaultConfig(); c.selector = ""; M.validateConfig(c); },
  "selector", "空 selector 判失败");
throwsField(function () { var c = M.defaultConfig(); c.selector = "   "; M.validateConfig(c); },
  "selector", "空白 selector 判失败");
throwsField(function () { var c = M.defaultConfig(); c.selector = ".a{color:red}"; M.validateConfig(c); },
  "selector", "含 {} 的 selector 判失败");
throwsField(function () { var c = M.defaultConfig(); c.selector = "</style><script>"; M.validateConfig(c); },
  "selector", "含 < 的 selector 判失败（防演示页 style 突破）");
throwsField(function () { var c = M.defaultConfig(); c.hover.background.color = "red"; M.validateConfig(c); },
  "hover.background.color", "非法态 field 透传");

/* ---------- 6. stateDiffers ---------- */
var d1 = goodState(), d2 = goodState();
ok(M.stateDiffers(d1, d2) === false, "相同 State 不 differing");
var d3 = goodState(); d3.background.color = "#ff0000";
ok(M.stateDiffers(d1, d3) === true, "背景色不同 → differing");
var d4 = goodState(); d4.boxShadow.inset = true;
ok(M.stateDiffers(d1, d4) === true, "inset 不同 → differing");
var d5 = goodState(); d5.font.weight = 400;
ok(M.stateDiffers(d1, d5) === true, "字重不同 → differing");
var d6 = goodState(); d6.padding.x = 25;
ok(M.stateDiffers(d1, d6) === true, "内边距不同 → differing");

/* ---------- 7. buildDeclarations ---------- */
var decl = M.buildDeclarations(goodState());
var lines = decl.split("\n");
eq(lines.length, 9, "声明共 9 行");
var props = lines.map(function (l) { return l.trim().split(":")[0]; });
eq(props.join(","), "background-color,border,border-radius,padding,color,font-size,font-weight,letter-spacing,box-shadow",
  "9 个属性名正确且有序");
eq(lines[0], "  background-color: rgba(37, 99, 235, 1);", "背景声明已知值");
eq(lines[1], "  border: none;", "边框宽度 0 → border: none");
eq(lines[2], "  border-radius: 8px;", "圆角声明");
eq(lines[3], "  padding: 12px 24px;", "内边距声明（上下 左右）");
eq(lines[4], "  color: #ffffff;", "文字颜色声明");
eq(lines[5], "  font-size: 16px;", "字号声明");
eq(lines[6], "  font-weight: 600;", "字重声明");
eq(lines[7], "  letter-spacing: 0px;", "字间距声明");
eq(lines[8], "  box-shadow: 0px 4px 12px 0px rgba(0, 0, 0, 0.2);", "阴影声明完整四值");
var sb = goodState(); sb.border = { width: 2, style: "dashed", color: "#ff0000" };
ok(M.buildDeclarations(sb).indexOf("  border: 2px dashed #ff0000;") >= 0, "边框三值拼接");
var sn = goodState(); sn.border.style = "none"; sn.border.width = 2;
ok(M.buildDeclarations(sn).indexOf("  border: none;") >= 0, "样式 none → border: none");
var si = goodState(); si.boxShadow.inset = true;
ok(M.buildDeclarations(si).indexOf("  box-shadow: inset 0px 4px 12px 0px rgba(0, 0, 0, 0.2);") >= 0, "inset 在阴影最前");
var sz = goodState(); sz.boxShadow.opacity = 0;
ok(M.buildDeclarations(sz).indexOf("  box-shadow: none;") >= 0, "阴影透明度 0 → none");
var sa = goodState(); sa.background.color = "#abc"; sa.background.opacity = 50;
ok(M.buildDeclarations(sa).indexOf("  background-color: rgba(170, 187, 204, 0.5);") >= 0, "#RGB 转 rgba");
throwsField(function () { var x = goodState(); x.borderRadius = -1; M.buildDeclarations(x); },
  "state.borderRadius", "buildDeclarations 非法抛错");

/* ---------- 8. buildButtonCSS：四规则块 ---------- */
var ex = M.generateExample();
var css = M.buildButtonCSS(ex);
ok(css.indexOf(".btn {") >= 0, "含 {selector} 规则块字面");
ok(css.indexOf(".btn:hover {") >= 0, "含 :hover 规则块字面");
ok(css.indexOf(".btn:focus-visible {") >= 0, "含 :focus-visible 规则块字面");
ok(css.indexOf(".btn:active {") >= 0, "含 :active 规则块字面");
eq((css.match(/\.btn[ :{]/g) || []).length, 4, "共 4 个规则块");

/* ---------- 9. buildButtonCSS：一致态省略 ---------- */
var omit = M.defaultConfig();
omit.hover.background.color = "#1d4ed8";
var cssOmit = M.buildButtonCSS(omit);
ok(cssOmit.indexOf(":hover") >= 0, "差异态 hover 输出");
ok(cssOmit.indexOf(":focus-visible") < 0, "与默认一致的 focus 被省略");
ok(cssOmit.indexOf(":active") < 0, "与默认一致的 active 被省略");
var allSame = M.buildButtonCSS(M.defaultConfig());
ok(allSame.indexOf(":hover") < 0 && allSame.indexOf(":focus-visible") < 0 && allSame.indexOf(":active") < 0,
  "四态全一致时只输出默认规则块");
throwsField(function () { var c = M.defaultConfig(); c.selector = ""; M.buildButtonCSS(c); },
  "selector", "buildButtonCSS 非法 config 抛错");

/* ---------- 10. generateExample ---------- */
var gex = M.generateExample();
eq(gex.selector, ".btn", "示例 selector");
ok(M.stateDiffers(gex.default, gex.hover), "示例 hover 与默认不同");
ok(M.stateDiffers(gex.default, gex.focus), "示例 focus 与默认不同");
ok(M.stateDiffers(gex.default, gex.active), "示例 active 与默认不同");
ok((function () { try { M.validateConfig(gex); return true; } catch (e) { return false; } })(),
  "示例 config 通过校验");

/* ---------- 11. PRESETS ---------- */
eq(M.PRESETS.length, 4, "预设共 4 组");
eq(M.PRESETS[0].name, "实心圆角", "预设 1 实心圆角");
eq(M.PRESETS[1].name, "描边按钮", "预设 2 描边按钮");
eq(M.PRESETS[2].name, "胶囊按钮", "预设 3 胶囊按钮");
eq(M.PRESETS[3].name, "扁平深色", "预设 4 扁平深色");
M.PRESETS.forEach(function (p, i) {
  var good = true, f = "";
  try { M.validateConfig(p.config); } catch (e) { good = false; f = e.field + ":" + e.message; }
  ok(good, "预设 " + (i + 1) + " 可直接载入" + (good ? "" : "（" + f + "）"));
  ok(M.buildButtonCSS(p.config).length > 0, "预设 " + (i + 1) + " 生成 CSS 非空");
});

/* ---------- 12. suggestExportName ---------- */
eq(M.suggestExportName("css"), "button.css", "css → button.css");
eq(M.suggestExportName("html"), "button-demo.html", "html → button-demo.html");
throwsField(function () { M.suggestExportName("js"); }, "kind", "其它 kind 失败");
throwsField(function () { M.suggestExportName(""); }, "kind", "空 kind 失败");

/* ---------- 13. buildDemoPage ---------- */
var page = M.buildDemoPage(M.generateExample());
eq(page.fileName, "button-demo.html", "演示页文件名");
ok(page.html.indexOf("<!DOCTYPE html>") >= 0, "演示页为完整 HTML");
ok(page.html.indexOf(".btn:hover {") >= 0, "演示页内嵌三态 CSS");
ok(page.html.indexOf("<button") >= 0, "演示页含演示按钮");
ok(page.html.indexOf('class="btn"') >= 0, "演示按钮带选择器 class");
throwsField(function () { var c = M.defaultConfig(); c.selector = ""; M.buildDemoPage(c); },
  "selector", "演示页非法 config 抛错");

/* ---------- 14. 注册、模板与零网络 ---------- */
ok(GO_SRC.indexOf('"css_button_generator"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/css-button-generator"') >= 0, "categories.go 注册 Path");
ok(GO_SRC.indexOf('Icon:        "smart_button"') >= 0, "注册 Icon smart_button");
ok(GO_SRC.indexOf('Category:    "开发工具"') >= 0, "开发工具品类存在");
var paths = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
var uniq = {};
paths.forEach(function (p) { uniq[p] = true; });
eq(Object.keys(uniq).length, 245, "注册 Path 总数→245（历史遗留陈旧断言同步）");
ok(TPL_SRC.indexOf("css-button-generator") >= 0, "模板 canonical 含新 Path");
ok(TPL_SRC.indexOf("只做单个按钮的完整规则块，不做整套组件库") >= 0, "真限制：只做单个按钮规则块");
ok(TPL_SRC.indexOf("只做 hover／focus／active 三态，不做禁用态／加载态") >= 0, "真限制：只做三态");
ok(TPL_SRC.indexOf("不收集、不上传") >= 0, "真限制：不收集不上传");
ok(TPL_SRC.indexOf("/tools/css-shadow-radius-generator") >= 0, "互链：CSS 阴影与圆角生成器");
ok(TPL_SRC.indexOf("/tools/css-gradient-generator") >= 0, "互链：CSS 渐变生成器");
ok(TPL_SRC.indexOf("button.css") >= 0, "模板含下载文件名 button.css");
ok(TPL_SRC.indexOf("button-demo.html") >= 0, "模板含演示页文件名");
ok(TPL_SRC.indexOf("与默认一致") >= 0, "模板含「与默认一致」标注");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零 fetch/XHR");
ok(TPL_SRC.indexOf("http://") < 0, "模板无外部 http 资源引用");
ok(!/src="https?:\/\//.test(TPL_SRC) && !/href="https?:\/\//.test(TPL_SRC.replace(/https:\/\/www\.johnkingzcq123\.xyz/g, "")),
  "模板零 CDN（除 canonical/OG 自身域名外无外链）");

/* ---------- 15. 预览区作用域隔离（评审反馈回归：live 注入限定 #cbg-preview-scope） ---------- */
eq(M.scopeLiveSelector(".btn"), "#cbg-preview-scope .btn", "scopeLiveSelector 单选择器");
eq(M.scopeLiveSelector(".btn, #go"), "#cbg-preview-scope .btn, #cbg-preview-scope #go", "scopeLiveSelector 逗号分组逐个前缀");
eq(M.scopeLiveSelector(".btn:hover"), "#cbg-preview-scope .btn:hover", "scopeLiveSelector 保留伪类");
ok(TPL_SRC.indexOf('id="cbg-preview-scope"') >= 0, "模板预览区容器带 id=\"cbg-preview-scope\"");
ok(JS_SRC.indexOf("scopeLiveSelector(cfg.selector)") >= 0, "renderAll 的 live 注入走 scopeLiveSelector");
ok(JS_SRC.indexOf("$('cbg-code').textContent = cssText;") >= 0, "代码区保持原选择器输出");
var exCfg = JSON.parse(JSON.stringify(M.generateExample()));
var plainCss = M.buildButtonCSS(exCfg);
var liveCfgT = JSON.parse(JSON.stringify(exCfg));
liveCfgT.selector = M.scopeLiveSelector(exCfg.selector);
var scopedCss = M.buildButtonCSS(liveCfgT);
ok(plainCss.indexOf("#cbg-preview-scope") < 0, "代码区 CSS 不含作用域前缀");
var scopedHits = scopedCss.split("#cbg-preview-scope").length - 1;
ok(scopedHits >= 4, "作用域 CSS 覆盖全部规则块（示例四规则块，实得 " + scopedHits + " 处前缀）");
ok(scopedCss.indexOf("#cbg-preview-scope .btn:hover {") >= 0, "作用域 CSS 的 :hover 规则块被前缀");
ok(!/^\.btn(:hover|:focus-visible|:active)? \{/m.test(scopedCss), "作用域 CSS 无行首的未前缀原选择器规则");

console.log("PASS " + pass + " / FAIL " + fail);
if (fail > 0) process.exit(1);
