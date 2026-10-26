/* TOML 格式化器纯逻辑单元测试（零依赖）：node tests/toml_formatter.test.js
 * 覆盖：标准向量、表与表数组、点分隔键、字符串与多行字符串、整数多进制、
 * 浮点与日期时间原样保留、数组两种模式、内联表、注释保留、压缩模式、
 * 重复键、未闭合错误定位、注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/toml_formatter.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function throws(fn, needle, name) {
  try { fn(); ok(false, name + "（应抛错却未抛）"); }
  catch (e) { ok(e.message.indexOf(needle) >= 0, name + "（报错应含「" + needle + "」，实为 " + e.message + "）"); }
}
function has(str, needle, name) { ok(str.indexOf(needle) >= 0, name + "（应含「" + needle + "」）"); }
function notHas(str, needle, name) { ok(str.indexOf(needle) < 0, name + "（不应含「" + needle + "」）"); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "toml_formatter.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "toml_formatter.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

function fmt(input, opts) { return M.formatTOML(input, opts || {}).output; }

/* ---------- 1. 标准向量（规格示例数据） ---------- */
var sample = M.SAMPLE_TOML;
has(sample, 'host="localhost"', "示例内置一处无空格写法 host=\"localhost\" 供演示");
var r = M.formatTOML(sample, {});
eq(r.output.indexOf('host = "localhost"') >= 0, true, "标准向量：host=\"localhost\" 规范化为 host = \"localhost\"");
eq(r.keyCount, 6, "标准向量：共 6 个键");
eq(r.tableCount, 3, "标准向量：共 3 张表");
eq(r.output.indexOf("[server]") < r.output.indexOf("[server.tls]"), true, "标准向量：表顺序不变（server 在 server.tls 之前）");
eq(r.output.indexOf('title = "示例配置"') < r.output.indexOf("[server]"), true, "标准向量：键表顺序不变（title 在表头之前）");
has(r.output, "# 服务端口", "标准向量：行尾注释保留");
has(r.output, "# 示例配置", "标准向量：行注释保留");

/* ---------- 2. 表与表数组、点分隔键 ---------- */
eq(fmt("[[fruit]]\nname = \"apple\"\n[[fruit]]\nname = \"pear\"\n"),
  "[[fruit]]\nname = \"apple\"\n[[fruit]]\nname = \"pear\"\n", "表数组：两个元素键互不冲突、原样输出");
eq(fmt("[point]\nx.y = 1\nx.z = 2\n"), "[point]\nx.y = 1\nx.z = 2\n", "点分隔键：兄弟子键共存");
eq(fmt('[a."b c"]\nx = 1\n'), '[a."b c"]\nx = 1\n', "引号键：含空格的键原样保留");
eq(fmt("[  server  ]\nhost = \"x\"\n"), "[server]\nhost = \"x\"\n", "表头：多余空格去掉");
eq(fmt("[a]\n[ a.b ]\nx = 1\n"), "[a]\n[a.b]\nx = 1\n", "表头：点分隔表头空格去掉");

/* ---------- 3. 字符串与多行字符串 ---------- */
eq(fmt("a = 'literal\\path'\n"), "a = 'literal\\path'\n", "字面字符串：反斜杠原样保留");
eq(fmt('a = """multi\nline"""\n'), 'a = """multi\nline"""\n', "多行字符串：内容原样保留");
eq(fmt("a = \"tab\\tnl\\n\"\n"), "a = \"tab\\tnl\\n\"\n", "基本字符串：转义原样保留");

/* ---------- 4. 整数多进制、浮点、日期时间原样保留 ---------- */
eq(fmt("a = 0xFF\nb = 0o17\nc = 0b101\nd = 1_000\ne = inf\nf = -nan\ng = 1979-05-27T07:32:00Z\nh = 07:32:00\n"),
  "a = 0xFF\nb = 0o17\nc = 0b101\nd = 1_000\ne = inf\nf = -nan\ng = 1979-05-27T07:32:00Z\nh = 07:32:00\n",
  "数值与日期时间：多进制／下划线／inf／nan／日期时间原文本保留不换算");

/* ---------- 5. 数组两种模式与内联表 ---------- */
eq(fmt("[database]\nports = [8000, 8001]\n", { arrayMode: "multiline", indent: "4" }),
  "[database]\nports = [\n    8000,\n    8001,\n]\n", "数组多行展开：4 空格缩进、每项独立一行、尾逗号");
eq(fmt("[database]\nports = [8000, 8001]\n", { arrayMode: "multiline", indent: "2" }),
  "[database]\nports = [\n  8000,\n  8001,\n]\n", "数组多行展开：2 空格缩进");
eq(fmt("[database]\nports = [\n8000,\n8001,\n]\n", { arrayMode: "compact" }),
  "[database]\nports = [8000, 8001]\n", "数组紧凑模式：多行输入恢复单行");
eq(fmt("a = [[1, 2], [3]]\n", { arrayMode: "multiline", indent: "2" }),
  "a = [\n  [\n    1,\n    2,\n  ],\n  [\n    3,\n  ],\n]\n", "嵌套数组：多行模式下逐层递归展开、缩进递进");
eq(fmt("a = []\n"), "a = []\n", "空数组：输出 []");
eq(fmt("a = [1, 2,]\n"), "a = [1, 2]\n", "数组尾逗号：格式化后去掉尾逗号");
eq(fmt("p = {x = 1, y = 2}\n"), "p = {x = 1, y = 2}\n", "内联表：键值对规范空格");
eq(fmt("p = { x=1 }\n"), "p = {x = 1}\n", "内联表：无空格写法规范化");

/* ---------- 6. 注释保留、空行收敛 ---------- */
eq(fmt("# head\n\na = 1\n\n\n\nb = 2  # tail\n"),
  "# head\n\na = 1\n\nb = 2 # tail\n", "注释与空行：行尾注释前一空格、连续空行至多一行");
eq(fmt("a=1\n"), "a = 1\n", "规范口径：= 两边各一空格");

/* ---------- 7. 压缩模式 ---------- */
var comp = fmt("# hi\n\ntitle = \"x\" # c\nports = [1, 2]\n", { compress: true });
eq(comp, "title = \"x\"\nports = [1, 2]\n", "压缩模式：去掉注释与空行、数组单行");
var compValid = M.validateTOML(comp, {});
eq(compValid.ok, true, "压缩模式：压缩后仍为合法 TOML");
eq(M.formatTOML("# hi\nports = [\n1,\n2,\n]\n", { compress: true }).output,
  "ports = [1, 2]\n", "压缩模式：多行数组强制单行");

/* ---------- 8. 错误定位 ---------- */
throws(function () { M.formatTOML("a = 1\na = 2\n"); }, "第2行第1列", "重复键：报错指明第二处行列");
throws(function () { M.formatTOML("a = 1\na = 2\n"); }, "重复的键", "重复键：中文原因含“重复的键”");
throws(function () { M.formatTOML('a = "abc\n'); }, "字符串未闭合", "未闭合字符串：中文报错");
throws(function () { M.formatTOML('a = "abc\n'); }, "第1行", "未闭合字符串：指明行列");
throws(function () { M.formatTOML("a = [1, 2\n"); }, "数组未闭合", "未闭合数组：中文报错并定位");
throws(function () { M.formatTOML("[abc\n"); }, "表头未闭合", "未闭合表头：中文报错并定位");
throws(function () { M.formatTOML("[[abc\n"); }, "表头未闭合", "未闭合表数组头：中文报错");
throws(function () { M.formatTOML("a = {x = 1\n"); }, "内联表未闭合", "未闭合内联表：中文报错");
throws(function () { M.formatTOML("[a]\nx = 1\n[a]\ny = 2\n"); }, "重复的表", "重复表：中文报错");
throws(function () { M.formatTOML("a = 1\n[a]\n"); }, "重名", "标量与表重名：中文报错");
throws(function () { M.formatTOML("a = hello\n"); }, "无效的值", "非法裸值：中文报错");
throws(function () { M.formatTOML("a\n"); }, "等号", "缺等号：中文报错");
throws(function () { M.formatTOML("a = \n"); }, "缺少值", "缺值：中文报错");
var bad = M.validateTOML("a = 1\na = 2\n", {});
eq(bad.ok, false, "校验入口：非法时 ok 为 false");
eq(bad.output, "", "错误时不输出半截结果：output 为空");
eq(bad.errors.length, 1, "校验入口：返回 1 条错误");
eq(bad.errors[0].line, 2, "校验入口：错误行号为 2");
eq(M.validateTOML("", {}).ok, true, "空输入解析本身不抛错（页面层提示“请输入 TOML”）");

/* ---------- 9. 注册与页面静态检查 ---------- */
has(GO_SRC, '"toml_formatter"', "注册：categories.go 含 ID toml_formatter");
has(GO_SRC, '"/tools/toml-formatter"', "注册：categories.go 含 Path /tools/toml-formatter");
has(GO_SRC, "TOML 格式化器", "注册：categories.go 含名称 TOML 格式化器");
var paths = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
var uniq = paths.filter(function (p, i) { return paths.indexOf(p) === i; });
eq(uniq.length, 191, "注册总数：190→191 Path");
has(TPL_SRC, "tf-input", "页面：含 TOML 输入框");
has(TPL_SRC, "tf-output", "页面：含格式化输出区");
has(TPL_SRC, "tf-copy", "页面：含复制按钮");
has(TPL_SRC, "formatted.toml", "页面：下载文件名为 formatted.toml");
has(TPL_SRC, "/tools/json-parser", "互链：含 JSON 解析器");
has(TPL_SRC, "/tools/json-yaml-converter", "互链：含 JSON/YAML 转换器");
notHas(TPL_SRC, "totp", "互链：不含未交付的 TOTP 工具");
notHas(TPL_SRC, "http-header", "互链：不含未交付的 HTTP 响应头分析器");
has(TPL_SRC, "只做格式化与语法校验、不做语义配置推荐", "真限制：只做格式化校验文案可见");
has(TPL_SRC, "不排序、不删键、不丢注释", "真限制：不排序不删键不丢注释文案可见");
has(TPL_SRC, "格式化失败不覆盖原文", "真限制：失败不覆盖原文文案可见");
has(TPL_SRC, "请输入 TOML", "页面：空输入提示文案");
notHas(JS_SRC, "fetch(", "零网络请求：JS 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络请求：JS 无 XHR");
notHas(TPL_SRC, "http://", "零 CDN：模板无 http 外链");
notHas(TPL_SRC, "https://cdn", "零 CDN：模板无 CDN 引用");
has(JS_SRC, "module.exports", "双模式导出：node 可 require");
has(TPL_SRC, "toml_formatter.js", "页面：引用 toml_formatter.js");
has(TPL_SRC, "tools/toml-formatter", "SEO：canonical 含 toml-formatter 路径");

console.log("toml_formatter: " + pass + " 通过, " + fail + " 失败");
if (fail > 0) process.exit(1);
