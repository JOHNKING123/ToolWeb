/* JSON 转 Kotlin data class（json_to_kotlin）纯逻辑单元测试（零依赖）：
 * node tests/json_to_kotlin.test.js
 * 覆盖：toPascalCase / toCamelCase 确定性向量与非法参数抛 Error（err.field="s"）、
 * kotlinScalarFor 确定性向量与非法参数（err.field="node"）、generateKotlin 确定性
 * 向量逐字命中（两个规格向量）与非法参数抛 Error（err.field="json"/"rootName"）、
 * 选项开关（@SerializedName／可空推断）、嵌套类拆分与同名去重、空数组→List<Any>、
 * 大整数→Long、null→Any?、@SerializedName 条件输出、categories.go 注册
 * （Path 总数 247→248、ID json_to_kotlin、Icon android、格式转换、New、中英文
 * Description）、模板 SEO 面板／真限制四条／互链（JSON 转 TS/Go 双向、JSON 解析器
 * 单向链入）／不链未交付工具、零网络请求静态检查。
 */
"use strict";
var fs = require("fs");
var path = require("path");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function throwsField(fn, field, name) {
  try { fn(); } catch (e) {
    ok(e instanceof Error && e.field === field,
      name + "（期望抛 Error 且 err.field=" + JSON.stringify(field) + "，实得 " +
      (e instanceof Error ? "Error field=" + JSON.stringify(e.field) : typeof e) + "）");
    return;
  }
  fail++; console.error("FAIL:", name + "（未抛出异常）");
}
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name); }

var M = require("../static/js/json-to-kotlin.js");
var ROOT = path.join(__dirname, "..");

/* ---------- 1. toPascalCase 确定性向量 ---------- */
eq(M.toPascalCase("user_name"), "UserName", "向量：toPascalCase('user_name')→'UserName'");
eq(M.toPascalCase(""), "Field", "向量：toPascalCase('')→'Field'");
eq(M.toPascalCase("3d"), "N3d", "向量：toPascalCase('3d')→'N3d'（数字开头加 N 前缀）");
eq(M.toPascalCase("user-name"), "UserName", "向量：toPascalCase('user-name')→'UserName'（连字符分隔）");
eq(M.toPascalCase("order id"), "OrderId", "向量：toPascalCase('order id')→'OrderId'（空格分隔）");
eq(M.toPascalCase("User"), "User", "向量：toPascalCase('User')→'User'（已是 Pascal 不变）");
throwsField(function () { M.toPascalCase(123); }, "s", "非法：toPascalCase(123) 抛 Error（err.field=s）");
throwsField(function () { M.toPascalCase(null); }, "s", "非法：toPascalCase(null) 抛 Error（err.field=s）");
throwsField(function () { M.toPascalCase(undefined); }, "s", "非法：toPascalCase(undefined) 抛 Error（err.field=s）");

/* ---------- 2. toCamelCase 确定性向量 ---------- */
eq(M.toCamelCase("user_name"), "userName", "向量：toCamelCase('user_name')→'userName'");
eq(M.toCamelCase("UserName"), "userName", "向量：toCamelCase('UserName')→'userName'");
eq(M.toCamelCase("kebab-case"), "kebabCase", "向量：toCamelCase('kebab-case')→'kebabCase'");
eq(M.toCamelCase("age"), "age", "向量：toCamelCase('age')→'age'（已是 camel 不变）");
throwsField(function () { M.toCamelCase(42); }, "s", "非法：toCamelCase(42) 抛 Error（err.field=s）");
throwsField(function () { M.toCamelCase(null); }, "s", "非法：toCamelCase(null) 抛 Error（err.field=s）");

/* ---------- 3. kotlinScalarFor 确定性向量 ---------- */
eq(M.kotlinScalarFor({ kind: "int" }), "Int", "向量：kotlinScalarFor({kind:'int'})→'Int'");
eq(M.kotlinScalarFor({ kind: "long" }), "Long", "向量：kotlinScalarFor({kind:'long'})→'Long'");
eq(M.kotlinScalarFor({ kind: "float" }), "Double", "向量：kotlinScalarFor({kind:'float'})→'Double'");
eq(M.kotlinScalarFor({ kind: "bool" }), "Boolean", "向量：kotlinScalarFor({kind:'bool'})→'Boolean'");
eq(M.kotlinScalarFor({ kind: "null" }), "Any?", "向量：kotlinScalarFor({kind:'null'})→'Any?'");
eq(M.kotlinScalarFor({ kind: "string" }), "String", "向量：kotlinScalarFor({kind:'string'})→'String'");
eq(M.kotlinScalarFor({ kind: "unknown" }), "Any?", "向量：kotlinScalarFor({kind:'unknown'})→'Any?'");
eq(M.kotlinScalarFor({ kind: "array", elem: { kind: "string" } }), "List<String>",
  "向量：kotlinScalarFor({kind:'array',elem:{kind:'string'}})→'List<String>'");
eq(M.kotlinScalarFor({ kind: "array", elem: { kind: "array", elem: { kind: "int" } } }), "List<List<Int>>",
  "向量：嵌套数组→'List<List<Int>>'");
eq(M.kotlinScalarFor({ kind: "object", name: "Address" }), "Address",
  "向量：对象节点取 name→'Address'");
throwsField(function () { M.kotlinScalarFor(null); }, "node", "非法：kotlinScalarFor(null) 抛 Error（err.field=node）");
throwsField(function () { M.kotlinScalarFor("int"); }, "node", "非法：kotlinScalarFor('int') 抛 Error（err.field=node）");
throwsField(function () { M.kotlinScalarFor({ kind: "bogus" }); }, "node",
  "非法：kotlinScalarFor 未知 kind 抛 Error（err.field=node）");
throwsField(function () { M.kotlinScalarFor({}); }, "node", "非法：kotlinScalarFor 缺 kind 抛 Error（err.field=node）");

/* ---------- 4. inferKotlin 边界 ---------- */
eq(M.inferKotlin(2147483647).kind, "int", "推断：2147483647→int（Int 上界）");
eq(M.inferKotlin(2147483648).kind, "long", "推断：2147483648→long（超 Int 上界）");
eq(M.inferKotlin(-2147483649).kind, "long", "推断：-2147483649→long（超 Int 下界）");
eq(M.inferKotlin(3.5).kind, "float", "推断：3.5→float");
eq(M.inferKotlin(null).kind, "null", "推断：null→null");
eq(M.inferKotlin([]).elem.kind, "unknown", "推断：空数组 elem→unknown");

/* ---------- 5. generateKotlin 确定性向量（规格逐字） ---------- */
var V1_EXPECTED = 'import com.google.gson.annotations.SerializedName\n' +
  '\n' +
  'data class Root(\n' +
  '    @SerializedName("user_name")\n' +
  '    val userName: String,\n' +
  '    val age: Int\n' +
  ')';
eq(M.generateKotlin(JSON.parse('{"user_name":"zhang","age":28}'),
  { rootName: "Root", serializedName: true, nullable: true }),
  V1_EXPECTED, "规格向量①：generateKotlin 基本对象逐字命中");

var V2_EXPECTED = 'data class User(\n' +
  '    val profile: Profile,\n' +
  '    val tags: List<Any>,\n' +
  '    val score: Double,\n' +
  '    val big: Long,\n' +
  '    val nick: Any?\n' +
  ')\n' +
  '\n' +
  'data class Profile(\n' +
  '    val city: String\n' +
  ')';
eq(M.generateKotlin(JSON.parse('{"profile":{"city":"sz"},"tags":[],"score":3.5,"big":9223372036854775807,"nick":null}'),
  { rootName: "User", serializedName: true, nullable: true }),
  V2_EXPECTED, "规格向量②：嵌套拆分／空数组／大整数／null 逐字命中（无注解故无 import）");

throwsField(function () { M.generateKotlin("not json", {}); }, "json",
  "非法：generateKotlin('not json',{}) 抛 Error（err.field=json）");
throwsField(function () { M.generateKotlin(42, {}); }, "json",
  "非法：generateKotlin(42,…) 抛 Error（err.field=json）");
throwsField(function () { M.generateKotlin(null, {}); }, "json",
  "非法：generateKotlin(null,…) 抛 Error（err.field=json）");
throwsField(function () { M.generateKotlin({}, { rootName: "" }); }, "rootName",
  "非法：generateKotlin({}, {rootName:''}) 抛 Error（err.field=rootName）");
throwsField(function () { M.generateKotlin({}, { rootName: "   " }); }, "rootName",
  "非法：rootName 纯空白抛 Error（err.field=rootName）");
throwsField(function () { M.generateKotlin({}, { rootName: 123 }); }, "rootName",
  "非法：rootName 非字符串抛 Error（err.field=rootName）");

/* ---------- 6. generateKotlin 选项与规则 ---------- */
var NO_ANNOT = M.generateKotlin(JSON.parse('{"user_name":"zhang"}'),
  { rootName: "Root", serializedName: false, nullable: true });
notHas(NO_ANNOT, "SerializedName", "选项：serializedName=false 时无注解");
notHas(NO_ANNOT, "import ", "选项：serializedName=false 时无 import");
has(NO_ANNOT, "val userName: String", "选项：serializedName=false 时属性名仍为 camelCase");

var NO_NULL = M.generateKotlin(JSON.parse('{"nick":null}'),
  { rootName: "Root", serializedName: true, nullable: false });
has(NO_NULL, "val nick: Any\n", "选项：nullable=false 时 null 样本→Any（非 Any?）");
notHas(NO_NULL, "Any?", "选项：nullable=false 时无 Any?");

var DEDUP = M.generateKotlin(JSON.parse('{"a":{"data":{"x":1}},"b":{"data":{"y":2}}}'),
  { rootName: "Root", serializedName: true, nullable: true });
has(DEDUP, "val data: Data\n", "同名冲突：首个 data→Data");
has(DEDUP, "val data: Data2\n", "同名冲突：第二个 data→Data2（追加 2）");
has(DEDUP, "data class Data(", "同名冲突：类 Data 存在");
has(DEDUP, "data class Data2(", "同名冲突：类 Data2 存在");

var ARR_OBJ = M.generateKotlin(JSON.parse('{"orders":[{"order_id":"A1"}]}'),
  { rootName: "Root", serializedName: true, nullable: true });
has(ARR_OBJ, "val orders: List<OrdersItem>\n", "数组对象→List<OrdersItem>");
has(ARR_OBJ, "data class OrdersItem(", "数组对象元素拆独立类 OrdersItem");
has(ARR_OBJ, '@SerializedName("order_id")', "数组元素字段 key≠属性名时输出注解");

var ROOT_ARR = M.generateKotlin(JSON.parse('[{"id":1}]'),
  { rootName: "Root", serializedName: true, nullable: true });
has(ROOT_ARR, "data class RootItem(", "根为数组：元素类名为 RootItem");
has(ROOT_ARR, "typealias Root = List<RootItem>", "根为数组：根别名 typealias");

var EMPTY_OBJ = M.generateKotlin(JSON.parse('{}'),
  { rootName: "Root", serializedName: true, nullable: true });
eq(EMPTY_OBJ, "data class Root(\n)", "空对象→空 data class（逐字）");

var KEBAB = M.generateKotlin(JSON.parse('{"user-name":"x"}'),
  { rootName: "Root", serializedName: true, nullable: true });
has(KEBAB, '@SerializedName("user-name")', "连字符 key→注解保留原始 key");
has(KEBAB, "val userName: String", "连字符 key→属性名 camelCase");

var KW = M.generateKotlin(JSON.parse('{"class":"x"}'),
  { rootName: "Root", serializedName: true, nullable: true });
has(KW, "val `class`: String", "Kotlin 关键字属性名用反引号转义");

/* ---------- 6b. 回归：去重后缀场景注解补齐（2026-10-31 评审反馈） ---------- */
var DEDUP_ANNOT = M.generateKotlin(JSON.parse('{"user_name":"x","userName":"y"}'),
  { rootName: "Root", serializedName: true, nullable: true });
has(DEDUP_ANNOT, '@SerializedName("user_name")', "回归：去重场景 user_name→注解");
has(DEDUP_ANNOT, '@SerializedName("userName")', "回归：去重场景 userName→注解（属性名 userName2≠key）");
has(DEDUP_ANNOT, "val userName2: String", "回归：去重场景属性名为 userName2");

/* ---------- 7. categories.go 注册 ---------- */
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var ktIdx = GO_SRC.indexOf('"json_to_kotlin"');
ok(ktIdx >= 0, "注册：categories.go 含 ID json_to_kotlin");
ok(GO_SRC.indexOf('"/tools/json-to-kotlin"') >= 0, "注册 Path /tools/json-to-kotlin");
ok(GO_SRC.slice(ktIdx, ktIdx + 1200).indexOf('Icon:        "android"') >= 0, "注册 Icon android");
ok(GO_SRC.slice(ktIdx, ktIdx + 1200).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(ktIdx, ktIdx + 1200).indexOf('Category:    "格式转换"') >= 0, "注册 Category 为格式转换");
ok(GO_SRC.slice(ktIdx, ktIdx + 2000).indexOf("data class generator") >= 0, "Description 中英文双语（含英文）");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 248, "注册 Path 总数 247→248");

/* ---------- 8. 模板：SEO／真限制／互链／零网络 ---------- */
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "json_to_kotlin.html"), "utf8");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "json-to-kotlin.js"), "utf8");
var TYPES_TPL = fs.readFileSync(path.join(ROOT, "templates", "json_to_types.html"), "utf8");
has(TPL_SRC, "{{define \"json_to_kotlin\"}}", "模板 define 名与路由 json-to-kotlin 对应");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/json-to-kotlin", "模板 canonical 含新 Path");
has(TPL_SRC, '"url":"https://www.johnkingzcq123.xyz/tools/json-to-kotlin"', "模板 JSON-LD 含新 Path");
has(TPL_SRC, "JSON转Kotlin", "模板 SEO keywords 含 JSON转Kotlin");
has(TPL_SRC, "kotlin data class generator", "模板 SEO keywords 含英文");
has(TPL_SRC, "样本中为 null 的字段只能退为", "真限制①：样本驱动推断需对照 API 文档校对");
has(TPL_SRC, "密封类", "真限制②：嵌套泛型／密封类／多态需人工调整");
has(TPL_SRC, "Moshi", "真限制③：@SerializedName 面向 Gson（Moshi／kotlinx 需替换）");
has(TPL_SRC, "零上传、全部本地", "真限制④：零上传、全部本地生成");
has(TPL_SRC, "/tools/json-to-types", "互链：JSON 转 TypeScript / Go 结构体（去向）");
has(TPL_SRC, "还需要 TS/Go 版本？用", "互链文案：还需要 TS/Go 版本？用 JSON 转 TypeScript / Go 结构体");
has(TPL_SRC, "/tools/json-parser", "互链：JSON 解析器（单向链入）");
has(TPL_SRC, "先用", "互链文案：JSON 格式有疑问？先用 JSON 解析器校验格式化");
has(TYPES_TPL, "/tools/json-to-kotlin", "双向互链：JSON 转 TS/Go 模板回链 JSON→Kotlin");
has(TYPES_TPL, "需要 Kotlin data class？用", "回链文案：需要 Kotlin data class？用 JSON 转 Kotlin data class");
notHas(TPL_SRC, "hashtag", "不链未交付工具：无社媒标签生成器");
notHas(TPL_SRC, "社媒标签", "不链未交付工具：无社媒标签生成器（中文）");
notHas(TPL_SRC, "域名创意", "不链未交付工具：无域名创意生成器");
has(TPL_SRC, "jk-input", "模板含输入框 jk-input");
has(TPL_SRC, "jk-output", "模板含输出区 jk-output");
has(TPL_SRC, "jk-copy", "模板含复制按钮 jk-copy");
has(TPL_SRC, "jk-download", "模板含下载按钮 jk-download");
has(TPL_SRC, "jk-annot", "模板含 @SerializedName 开关 jk-annot");
has(TPL_SRC, "jk-nullable", "模板含可空推断开关 jk-nullable");
has(TPL_SRC, "json-to-kotlin.js?v=1", "模板引用外部 JS");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "http://", "模板无 http 外链（零外部请求）");

console.log("PASS " + pass + " / FAIL " + fail);
if (fail > 0) process.exit(1);
