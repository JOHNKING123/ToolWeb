/* JSONPath 测试器纯逻辑单元测试（零依赖）：node tests/jsonpath_tester.test.js
 * 覆盖：标准向量、通配、递归、负下标、切片、并集、规范路径生成、
 * 缺失键跳过、无命中、非法 JSON、非法表达式、不支持表达式、
 * 复制/下载文本一致性、注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/jsonpath_tester.js");

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

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "jsonpath_tester.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "jsonpath_tester.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

var DATA = JSON.parse(M.SAMPLE_JSON);
function run(expr) { return M.evaluate(DATA, expr); }
function paths(expr) { return run(expr).map(function (r) { return r.path; }); }
function values(expr) { return run(expr).map(function (r) { return r.value; }); }

/* ---------- 1. 标准向量（内置书店示例数据） ---------- */
eq(JSON.stringify(values("$.store.book[*].author")),
  JSON.stringify(["Nigel Rees", "Evelyn Waugh", "Herman Melville", "J. R. R. Tolkien"]),
  "标准向量：$.store.book[*].author 命中 4 位作者");
eq(JSON.stringify(paths("$.store.book[*].author")),
  JSON.stringify(["$.store.book[0].author", "$.store.book[1].author", "$.store.book[2].author", "$.store.book[3].author"]),
  "标准向量：作者路径依次为 [0] 至 [3]");
eq(values("$.store.book[2].title")[0], "Moby Dick", "标准向量：$.store.book[2].title = Moby Dick");
eq(JSON.stringify(values("$..author")),
  JSON.stringify(["Nigel Rees", "Evelyn Waugh", "Herman Melville", "J. R. R. Tolkien"]),
  "标准向量：$..author 命中 4 位作者（文档顺序）");
eq(values("$.store.book[-1].title")[0], "The Lord of the Rings", "标准向量：负下标 [-1] = 最后一本");
eq(run("$.store.book[0:2]").length, 2, "标准向量：切片 [0:2] 命中前 2 本书");
eq(values("$.store.book[0:2]")[1].title, "Sword of Honour", "标准向量：切片第 2 条为 Sword of Honour");
eq(values("$.store.bicycle.color")[0], "red", "标准向量：$.store.bicycle.color = red");
eq(run("$.store.book[*].isbn").length, 2, "标准向量：isbn 仅 2 条（缺失键跳过不报错）");
eq(JSON.stringify(values("$.store.book[*].isbn")),
  JSON.stringify(["0-553-21311-3", "0-395-19395-8"]),
  "标准向量：isbn 两条值正确");

/* ---------- 2. 通配、递归、括号记法 ---------- */
eq(run("$.store.*").length, 2, "通配 .*: store 下 book 与 bicycle 两项");
eq(values("$.store.bicycle.*")[0], "red", "通配 .*: bicycle 首项为 red");
eq(run("$..price").length, 5, "递归 $..price：4 本书 + 自行车共 5 个 price");
eq(values("$.store['book'][0]['title']")[0], "Sayings of the Century", "括号记法 ['book'][0]['title'] 命中");
eq(values("$.store.book[0]['title','author']").length, 2, "并集 ['title','author'] 命中 2 条");
eq(values("$.store.book[0,2]").length, 2, "并集下标 [0,2] 命中 2 条");
eq(values("$.store.book[0,2]")[1].title, "Moby Dick", "并集下标第 2 条为 Moby Dick");

/* ---------- 3. 切片语义 ---------- */
eq(run("$.store.book[1:]").length, 3, "切片 [1:] 命中后 3 本");
eq(run("$.store.book[:2]").length, 2, "切片 [:2] 命中前 2 本");
eq(run("$.store.book[0:4:2]").length, 2, "切片 [0:4:2] 步长 2 命中 2 本");
eq(run("$.store.book[3:0:-1]").length, 3, "切片倒序 [3:0:-1] 命中 3 本");
eq(run("$.store.book[10:20]").length, 0, "切片越界截断不报错：空结果");
eq(run("$.store.book[-3:]").length, 3, "切片负起止 [-3:] 命中后 3 本");
throws(function () { M.parseExpression("$.store.book[0:2:0]"); }, "步长不能为 0", "切片步长 0 报错");

/* ---------- 4. 规范路径生成 ---------- */
eq(M.formatPath([]), "$", "规范路径：根为 $");
eq(M.formatPath([{ type: "key", key: "store" }, { type: "key", key: "book" }, { type: "index", index: 0 }, { type: "key", key: "author" }]),
  "$.store.book[0].author", "规范路径：点记法优先");
eq(M.formatPath([{ type: "key", key: "a b" }]), "$['a b']", "规范路径：含空格键用括号记法");
eq(M.formatPath([{ type: "key", key: "中文键" }]), "$['中文键']", "规范路径：中文键用括号记法");
eq(M.formatPath([{ type: "key", key: "a'b" }]), "$['a\\'b']", "规范路径：单引号键转义");

/* ---------- 5. 无命中与缺失键 ---------- */
eq(run("$.store.book[*].publisher").length, 0, "无命中：publisher 不存在时为空数组非报错");
eq(run("$.store.book[9]").length, 0, "无命中：下标越界为空数组非报错");
eq(run("$.store.car.color").length, 0, "无命中：中间键缺失为空数组非报错");

/* ---------- 6. 非法 JSON / 非法表达式 ---------- */
eq(M.parseJsonInput("").ok, false, "空 JSON 输入不通过");
eq(M.parseJsonInput("").error, "请输入 JSON", "空 JSON 提示文案");
eq(M.parseJsonInput("{oops").ok, false, "非法 JSON 不通过");
ok(M.parseJsonInput("{oops").error.indexOf("JSON 解析失败") === 0, "非法 JSON 中文提示");
eq(M.validateExpression("").error, "请输入以 $ 开头的表达式", "空表达式提示文案");
ok(M.validateExpression("store.book").error.indexOf("须以 $ 开头") >= 0, "非 $ 开头表达式提示");
throws(function () { M.parseExpression("$.store."); }, "缺少键名", "尾随点号非法");
throws(function () { M.parseExpression("$.store.book[]"); }, "空括号", "空括号非法");
throws(function () { M.parseExpression("$.store.book[1"); }, "未闭合", "括号未闭合非法");
throws(function () { M.parseExpression("$.."); }, "缺少键名或通配符", "递归后无键名非法");

/* ---------- 7. 不支持表达式（中文提示 + 位置） ---------- */
throws(function () { M.evaluate(DATA, "$.store.book[?(@.price>10)]"); }, "不支持过滤表达式", "过滤表达式提示不支持");
throws(function () { M.evaluate(DATA, "$.store.book[?(@.price>10)]"); }, "位置", "过滤表达式提示指明位置");
throws(function () { M.evaluate(DATA, "$.store.book[(1)]"); }, "不支持脚本表达式", "脚本表达式提示不支持");
throws(function () { M.evaluate(DATA, "$.store.length()"); }, "不支持函数式扩展", "函数式扩展提示不支持");

/* ---------- 8. 类型、复制与下载文本 ---------- */
eq(M.typeLabel("x"), "字符串", "类型徽标：字符串");
eq(M.typeLabel(3), "数字", "类型徽标：数字");
eq(M.typeLabel(true), "布尔", "类型徽标：布尔");
eq(M.typeLabel(null), "空值", "类型徽标：空值");
eq(M.typeLabel({}), "对象", "类型徽标：对象");
eq(M.typeLabel([]), "数组", "类型徽标：数组");
eq(M.copyOneText({ path: "$.a", value: "原文" }), "原文", "单条复制：字符串复制原文");
eq(M.copyOneText({ path: "$.a", value: 3 }), "3", "单条复制：数字复制 JSON 文本");
var all = M.buildAllText(run("$.store.book[*].author"));
eq(JSON.parse(all).length, 4, "复制全部：[{path,value}] 共 4 条");
eq(JSON.parse(all)[0].path, "$.store.book[0].author", "复制全部：首条 path 正确");
eq(JSON.parse(all)[0].value, "Nigel Rees", "复制全部：首条 value 正确");
eq(M.buildAllText(run("$.store.book[*].author")), all, "下载文本与复制全部文本一致（同一构造器）");

/* ---------- 9. 格式化视图行路径 ---------- */
var lines = M.prettyLines(DATA, 0, []);
ok(lines.length > 20, "格式化视图：行数充足");
eq(lines[0].path, "$", "格式化视图：首行路径为根");
ok(lines.some(function (l) { return l.path === "$.store.book[0].author" && l.text.indexOf("Nigel Rees") >= 0; }),
  "格式化视图：作者行路径与文本对应，可供点击高亮");

/* ---------- 10. 预设与注册、零网络静态检查 ---------- */
eq(M.PRESETS.length, 6, "预设表达式共 6 组");
ok(M.PRESETS.indexOf("$.store.book[*].author") >= 0, "预设含作者通配");
ok(GO_SRC.indexOf('"jsonpath_tester"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/jsonpath-tester"') >= 0, "categories.go 注册 Path");
var reg = GO_SRC.indexOf('"jsonpath_tester"');
ok(GO_SRC.slice(reg, reg + 900).indexOf('Category:    "格式化工具"') >= 0, "注册 Category 为格式化工具");
ok(GO_SRC.slice(reg, reg + 900).indexOf("New:         true") >= 0, "注册 New 为 true");
var pathRe = /"\/tools\/[^"]+"/g;
var seen = {}, pathCount = 0, mm;
while ((mm = pathRe.exec(GO_SRC)) !== null) {
  if (!seen[mm[0]]) { seen[mm[0]] = true; pathCount++; }
}
eq(pathCount, 190, "注册总数 189→190 Path");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零 fetch/XHR");
ok(TPL_SRC.indexOf("http://") < 0 || TPL_SRC.indexOf("http://") === TPL_SRC.indexOf("https://www.johnkingzcq123.xyz"), "模板无外部 http 链接（除 canonical 外）");
ok(TPL_SRC.indexOf("cdnjs") < 0 && TPL_SRC.indexOf("jsdelivr") < 0 && TPL_SRC.indexOf("googleapis") < 0, "模板零 CDN");
ok(TPL_SRC.indexOf("只做常用子集") >= 0, "页面可见真限制：只做常用子集");
ok(TPL_SRC.indexOf("不支持过滤") >= 0, "页面可见真限制：不支持过滤");
ok(TPL_SRC.indexOf("不做 Schema 校验") >= 0, "页面可见真限制：不做 Schema 校验");
ok(TPL_SRC.indexOf("原样展示") >= 0, "页面可见真限制：命中值原样展示");
ok(TPL_SRC.indexOf("/tools/json-parser") >= 0, "互链：JSON 解析器");
ok(TPL_SRC.indexOf("/tools/json-semantic-diff") >= 0, "互链：JSON 语义化对比器");
ok(TPL_SRC.indexOf("/tools/json-schema-validator") >= 0, "互链：JSON Schema 验证器");
ok(TPL_SRC.indexOf("toml") < 0 && TPL_SRC.indexOf("totp") < 0, "互链不含未交付 TOML/TOTP");

console.log("jsonpath_tester: " + pass + " 通过，" + fail + " 失败（共 " + (pass + fail) + " 断言）");
if (fail > 0) process.exit(1);
