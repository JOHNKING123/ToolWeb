/* Prettier 配置生成器纯逻辑单元测试（零依赖）：node tests/prettier_config_generator.test.js
 * 覆盖：默认值、14 项逐项生成与键顺序、3 组预设、数值校验正反例、枚举取值、
 * JSON 合法性与 2 空格缩进、表单归一化、注册（183→184 Path）与零网络请求、
 * 模板真限制文案与互链（仅 JSON 解析器，不含未交付工具）。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/prettier_config_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（应包含 " + JSON.stringify(sub) + "）"); }
function notHas(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "prettier_config_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "prettier_config_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. 默认值 ---------- */
eq(M.DEFAULTS.printWidth, 80, "默认值：printWidth 80");
eq(M.DEFAULTS.tabWidth, 2, "默认值：tabWidth 2");
eq(M.DEFAULTS.useTabs, false, "默认值：useTabs 关");
eq(M.DEFAULTS.semi, true, "默认值：semi 开");
eq(M.DEFAULTS.singleQuote, false, "默认值：singleQuote 关");
eq(M.DEFAULTS.quoteProps, "as-needed", "默认值：quoteProps as-needed");
eq(M.DEFAULTS.jsxSingleQuote, false, "默认值：jsxSingleQuote 关");
eq(M.DEFAULTS.trailingComma, "all", "默认值：trailingComma all");
eq(M.DEFAULTS.bracketSpacing, true, "默认值：bracketSpacing 开");
eq(M.DEFAULTS.bracketSameLine, false, "默认值：bracketSameLine 关");
eq(M.DEFAULTS.arrowParens, "always", "默认值：arrowParens always");
eq(M.DEFAULTS.endOfLine, "lf", "默认值：endOfLine lf");
eq(M.DEFAULTS.proseWrap, "preserve", "默认值：proseWrap preserve");
eq(M.DEFAULTS.embeddedLanguageFormatting, "auto", "默认值：embeddedLanguageFormatting auto");
eq(M.OPTION_ORDER.length, 14, "选项总数 14 项");

/* ---------- 2. 默认输出：合法 JSON、键顺序、2 空格缩进 ---------- */
var defJson = M.toPrettierrcJson(M.cloneDefaults());
ok(defJson !== null, "默认输出非空");
var defObj = JSON.parse(defJson);
eq(JSON.stringify(Object.keys(defObj)), JSON.stringify(M.OPTION_ORDER), "默认输出键顺序与选项顺序一致");
eq(defObj.printWidth, 80, "默认输出 printWidth 80");
eq(defObj.trailingComma, "all", "默认输出 trailingComma all");
has(defJson, "\n  \"printWidth\": 80", "默认输出 2 空格缩进");

/* ---------- 3. 14 项逐项改动同步 ---------- */
function changed(key, value) {
    var o = M.cloneDefaults();
    o[key] = value;
    return JSON.parse(M.toPrettierrcJson(o))[key];
}
eq(changed("printWidth", 120), 120, "逐项：printWidth 120");
eq(changed("tabWidth", 4), 4, "逐项：tabWidth 4");
eq(changed("useTabs", true), true, "逐项：useTabs 开");
eq(changed("semi", false), false, "逐项：semi 关");
eq(changed("singleQuote", true), true, "逐项：singleQuote 开");
eq(changed("quoteProps", "consistent"), "consistent", "逐项：quoteProps consistent");
eq(changed("quoteProps", "preserve"), "preserve", "逐项：quoteProps preserve");
eq(changed("jsxSingleQuote", true), true, "逐项：jsxSingleQuote 开");
eq(changed("trailingComma", "es5"), "es5", "逐项：trailingComma es5");
eq(changed("trailingComma", "none"), "none", "逐项：trailingComma none");
eq(changed("bracketSpacing", false), false, "逐项：bracketSpacing 关");
eq(changed("bracketSameLine", true), true, "逐项：bracketSameLine 开");
eq(changed("arrowParens", "avoid"), "avoid", "逐项：arrowParens avoid");
eq(changed("endOfLine", "crlf"), "crlf", "逐项：endOfLine crlf");
eq(changed("endOfLine", "cr"), "cr", "逐项：endOfLine cr");
eq(changed("endOfLine", "auto"), "auto", "逐项：endOfLine auto");
eq(changed("proseWrap", "always"), "always", "逐项：proseWrap always");
eq(changed("proseWrap", "never"), "never", "逐项：proseWrap never");
eq(changed("embeddedLanguageFormatting", "off"), "off", "逐项：embeddedLanguageFormatting off");

/* ---------- 4. 3 组预设 ---------- */
var pDef = M.applyPreset("default");
eq(JSON.stringify(pDef), JSON.stringify(M.cloneDefaults()), "预设：Prettier 默认等于默认值");
var pSingle = M.applyPreset("single-no-semi");
eq(pSingle.singleQuote, true, "预设：单引号＋无分号 singleQuote 开");
eq(pSingle.semi, false, "预设：单引号＋无分号 semi 关");
eq(pSingle.printWidth, 80, "预设：单引号＋无分号其余保持默认");
eq(pSingle.jsxSingleQuote, false, "预设：单引号＋无分号不改 jsxSingleQuote");
var pTabs = M.applyPreset("tabs");
eq(pTabs.useTabs, true, "预设：Tab 缩进 useTabs 开");
eq(pTabs.tabWidth, 2, "预设：Tab 缩进其余保持默认");
var pSingleAfterEdit = M.applyPreset("single-no-semi");
pSingleAfterEdit.printWidth = 100;
eq(JSON.parse(M.toPrettierrcJson(pSingleAfterEdit)).printWidth, 100, "预设后再改单项同步");
eq(M.applyPreset("no-such-preset").printWidth, 80, "预设：未知预设名回落默认值");

/* ---------- 5. 数值校验 ---------- */
function errsFor(key, value) {
    var o = M.cloneDefaults();
    o[key] = value;
    return M.validateOptions(o);
}
eq(errsFor("printWidth", 80).length, 0, "校验：printWidth 80 合法");
eq(errsFor("printWidth", 1).length, 0, "校验：printWidth 1 边界合法");
eq(errsFor("tabWidth", 1).length, 0, "校验：tabWidth 1 边界合法");
eq(errsFor("tabWidth", 8).length, 0, "校验：tabWidth 8 边界合法");
ok(errsFor("printWidth", 0).length > 0, "校验：printWidth 0 非法");
ok(errsFor("printWidth", -5).length > 0, "校验：printWidth 负数非法");
ok(errsFor("printWidth", 80.5).length > 0, "校验：printWidth 小数非法");
ok(errsFor("printWidth", NaN).length > 0, "校验：printWidth 空值非法");
ok(errsFor("tabWidth", 0).length > 0, "校验：tabWidth 0 非法");
ok(errsFor("tabWidth", 9).length > 0, "校验：tabWidth 9 超出 1–8 非法");
ok(errsFor("tabWidth", 2.5).length > 0, "校验：tabWidth 小数非法");
ok(errsFor("trailingComma", "sometimes").length > 0, "校验：枚举非法取值检出");
ok(errsFor("endOfLine", "lfcr").length > 0, "校验：endOfLine 非法取值检出");
ok(errsFor("useTabs", "yes").length > 0, "校验：开关非布尔检出");
has(errsFor("printWidth", 0).join(""), "printWidth", "校验：printWidth 报错含中文选项名");
has(errsFor("tabWidth", 9).join(""), "1–8", "校验：tabWidth 报错含 1–8 范围");
var bad = M.cloneDefaults();
bad.printWidth = 0;
eq(M.toPrettierrcJson(bad), null, "校验：非法时不输出误导性配置（null）");
eq(M.buildConfig(bad), null, "校验：非法时 buildConfig 返回 null");

/* ---------- 6. 表单归一化 ---------- */
var norm = M.normalizeForm({
    printWidth: "120", tabWidth: "4", useTabs: true, semi: false, singleQuote: true,
    quoteProps: "preserve", jsxSingleQuote: true, trailingComma: "none",
    bracketSpacing: false, bracketSameLine: true, arrowParens: "avoid",
    endOfLine: "crlf", proseWrap: "never", embeddedLanguageFormatting: "off"
});
eq(norm.printWidth, 120, "归一化：printWidth 字符串转数字");
eq(norm.tabWidth, 4, "归一化：tabWidth 字符串转数字");
eq(norm.semi, false, "归一化：semi 布尔保留");
eq(M.validateOptions(norm).length, 0, "归一化：合法表单零错误");
ok(isNaN(M.normalizeForm({ printWidth: "", tabWidth: "2" }).printWidth), "归一化：printWidth 空串转 NaN 交校验");

/* ---------- 7. 注册：183→184 Path ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 185, "注册总数 183→185 Path（Prettier 轮 184＋CSV→Markdown 轮新增 1）");
has(GO_SRC, '"prettier_config_generator"', "注册：ID prettier_config_generator");
has(GO_SRC, '"/tools/prettier-config-generator"', "注册：Path /tools/prettier-config-generator");
has(GO_SRC, 'Name:        "Prettier 配置生成器"', "注册：中文名");
var devBlock = GO_SRC.split('ID:          "prettier_config_generator"')[1].split("},")[0];
has(devBlock, 'Category:    "开发工具"', "注册：开发工具品类");
has(devBlock, "New:         true", "注册：New true");

/* ---------- 8. 零网络与模板静态检查 ---------- */
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "fetch(", "零网络：模板无 fetch");
notHas(TPL_SRC, "XMLHttpRequest", "零网络：模板无 XHR");
notHas(TPL_SRC, "<script src=\"http", "零网络：模板无外部脚本");
notHas(TPL_SRC, "fonts.googleapis", "零网络：模板无外部字体");
notHas(TPL_SRC, "cdn.", "零网络：模板无 CDN 引用");
has(TPL_SRC, "prettier_config_generator.js", "模板：引用本站 JS");
["pcg-printWidth", "pcg-tabWidth", "pcg-useTabs", "pcg-semi", "pcg-singleQuote",
 "pcg-quoteProps", "pcg-jsxSingleQuote", "pcg-trailingComma", "pcg-bracketSpacing",
 "pcg-bracketSameLine", "pcg-arrowParens", "pcg-endOfLine", "pcg-proseWrap",
 "pcg-embeddedLanguageFormatting", "pcg-output", "pcg-copy", "pcg-download",
 "pcg-preset-default", "pcg-preset-single", "pcg-preset-tabs", "pcg-reset"].forEach(function (id) {
    has(TPL_SRC, 'id="' + id + '"', "模板：控件 " + id + " 存在");
});
has(TPL_SRC, "只覆盖 14 项常用核心选项子集", "真限制：仅核心选项子集文案");
has(TPL_SRC, "只生成配置、不格式化代码", "真限制：只生成不格式化文案");
has(TPL_SRC, "不读取、不解析现有配置", "真限制：不读取现有配置文案");
has(TPL_SRC, "Prettier 3 口径", "真限制：Prettier 3 口径文案");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/prettier-config-generator", "SEO：canonical");
has(TPL_SRC, "/tools/json-parser", "互链：含 JSON 解析器");
notHas(TPL_SRC, "/tools/npmrc", "互链：不含未交付 .npmrc 工具");
notHas(TPL_SRC, "/tools/gitattributes", "互链：不含未交付 .gitattributes 工具");
notHas(TPL_SRC, "/tools/editorconfig", "互链：不含未交付 EditorConfig 工具");

console.log("prettier_config_generator: " + pass + " passed, " + fail + " failed");
if (fail > 0) process.exit(1);
