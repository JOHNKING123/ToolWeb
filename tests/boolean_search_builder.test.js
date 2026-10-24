/* 布尔搜索语句生成器纯逻辑单元测试（零依赖）：node tests/boolean_search_builder.test.js
 * 覆盖：单组 AND/OR、组间 AND/OR/NOT、一层嵌套、字段限定、引号短语、
 * 排除词、空组空术语丢弃、括号平衡、三组模板静态检查、注册与零网络请求。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/boolean_search_builder.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "boolean_search_builder.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "boolean_search_builder.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

function G(op, terms, children, exclude) {
  return { op: op, terms: terms || [], children: children || [], exclude: !!exclude };
}
function T(text, field, exclude) {
  return { text: text, field: field || "", exclude: !!exclude };
}

/* ---------- 1. 引号短语 ---------- */
eq(M.quoteTerm("software engineer"), '"software engineer"', "含空格术语自动加引号");
eq(M.quoteTerm("Python"), "Python", "无空格术语不加引号");
eq(M.quoteTerm('"software engineer"'), '"software engineer"', "已含引号不重复加");
eq(M.quoteTerm(""), "", "空术语为空");
eq(M.quoteTerm("  "), "", "纯空白术语为空");
eq(M.quoteTerm("前端工程师"), "前端工程师", "中文无空格不加引号");

/* ---------- 2. 字段限定 ---------- */
eq(M.formatTerm(T("linkedin.com", "site:")), "site:linkedin.com", "site: 限定");
eq(M.formatTerm(T("招聘", "intitle:")), "intitle:招聘", "intitle: 限定");
eq(M.formatTerm(T("docs", "inurl:")), "inurl:docs", "inurl: 限定");
eq(M.formatTerm(T("pdf", "filetype:")), "filetype:pdf", "filetype: 限定");
eq(M.formatTerm(T("zhangsan", "author:")), "author:zhangsan", "author: 限定");
eq(M.formatTerm(T("", "site:")), "", "字段值为空不输出限定符");
eq(M.formatTerm(T("software engineer", "intitle:")), 'intitle:"software engineer"', "字段＋含空格术语：限定符紧贴引号短语");
eq(M.formatTerm(T("Python", "")), "Python", "不限字段原样输出");

/* ---------- 3. 排除词 ---------- */
eq(M.formatTerm(T("tutorial", "", true)), "-tutorial", "排除术语前缀 -");
eq(M.formatTerm(T("software engineer", "", true)), '-"software engineer"', "排除短语前缀在引号外");
eq(M.formatTerm(T("pdf", "filetype:", true)), "-filetype:pdf", "排除字段限定前缀在限定符外");

/* ---------- 4. 单组 AND/OR ---------- */
eq(M.serializeGroup(G("AND", [T("Python"), T("Go")])), "Python AND Go", "单组 AND");
eq(M.serializeGroup(G("OR", [T("Python"), T("Go")])), "Python OR Go", "单组 OR");
eq(M.serializeGroup(G("AND", [T("Python")])), "Python", "单术语组不加多余括号");
eq(M.serializeGroup(G("AND", [T("Python"), T(""), T("Go")])), "Python AND Go", "空术语丢弃");

/* ---------- 5. 组间 AND/OR/NOT ---------- */
eq(M.buildQuery([G("AND", [T("Python")]), G("AND", [T("Go")])], "AND"), "Python AND Go", "组间 AND");
eq(M.buildQuery([G("AND", [T("Python")]), G("AND", [T("Go")])], "OR"), "Python OR Go", "组间 OR");
eq(M.buildQuery([G("AND", [T("Python")]), G("AND", [T("Go")])], "NOT"), "Python NOT (Go)", "组间 NOT 后续组渲染为 NOT (...)");
eq(M.buildQuery([G("AND", [T("Python")]), G("OR", [T("Go"), T("Rust")])], "NOT"), "Python NOT (Go OR Rust)", "组间 NOT 多术语组");
eq(M.buildQuery([G("AND", [T("Python")]), G("AND", [T("Go")])]), "Python AND Go", "组间默认 AND");

/* ---------- 6. 一层嵌套与排除组 ---------- */
eq(M.serializeGroup(G("AND", [T("software engineer")], [G("OR", [T("Python"), T("Go")])])),
  '"software engineer" AND (Python OR Go)', "一层嵌套子组加括号");
eq(M.serializeGroup(G("AND", [T("Python")], [G("AND", [T("Go")])])),
  "Python AND (Go)", "单术语子组仍加括号");
eq(M.serializeGroup(G("AND", [T("Python"), T("Go")], [], true)),
  "NOT (Python AND Go)", "排除组渲染为 NOT (...)");
eq(M.serializeGroup(G("OR", [T("Python")], [], true)),
  "NOT (Python)", "单术语排除组仍渲染为 NOT (...)");
eq(M.buildQuery([G("AND", [T("Python")], [], true), G("AND", [T("Go")])], "AND"),
  "NOT (Python) AND Go", "排除组参与组间连接");

/* ---------- 7. 空组丢弃与括号平衡 ---------- */
eq(M.buildQuery([G("AND", []), G("AND", [T("Python")])], "AND"), "Python", "空组丢弃");
eq(M.buildQuery([G("AND", [T("")]), G("AND", [T("  ")])], "AND"), "", "全空组输出空串不畸形");
eq(M.buildQuery([], "AND"), "", "空分组列表输出空串");
eq(M.buildQuery(null, "AND"), "", "null 分组列表不崩溃");
ok(M.checkBalanced('"software engineer" AND (Python OR Go)'), "生成串括号平衡");
ok(M.checkBalanced("NOT (Python AND Go)"), "排除组串括号平衡");
ok(!M.checkBalanced("(Python AND Go"), "缺右括号判不平衡");
ok(!M.checkBalanced("Python) AND Go"), "多余右括号判不平衡");
ok(!M.checkBalanced('"Python'), "不成对引号判不平衡");
ok(M.checkBalanced(""), "空串平衡");

/* ---------- 8. 三组模板静态检查 ---------- */
["sourcing", "academic", "jobseek"].forEach(function (key) {
  var t = M.TEMPLATES[key];
  ok(!!t, "模板存在：" + key);
  var q = M.buildQuery(t.groups, t.between);
  ok(q.length > 0, "模板生成非空：" + key + " -> " + q);
  ok(M.checkBalanced(q), "模板串括号平衡：" + key);
});
eq(M.buildQuery(M.TEMPLATES.sourcing.groups, "AND"),
  '("software engineer" AND Python AND site:linkedin.com) AND (site:github.com OR site:stackoverflow.com)',
  "招聘模板：多组拼接时 OR 组加括号定优先级");
eq(M.buildQuery([G("AND", [T("Python"), T("Go")]), G("AND", [T("Rust")])], "AND"),
  "(Python AND Go) AND Rust", "多组拼接时多术语组加括号定优先级");
ok(M.buildQuery(M.TEMPLATES.academic.groups, "AND").indexOf("filetype:pdf") >= 0, "学术模板含 filetype:pdf");
ok(M.buildQuery(M.TEMPLATES.academic.groups, "AND").indexOf("-tutorial") >= 0, "学术模板含排除词 -tutorial");
ok(M.buildQuery(M.TEMPLATES.jobseek.groups, "AND").indexOf("intitle:招聘") >= 0, "求职模板含 intitle:招聘");
eq(M.googleSearchUrl('Python AND "software engineer"'),
  "https://www.google.com/search?q=Python%20AND%20%22software%20engineer%22", "Google 跳转 q 参数 URL 编码与预览串一致");

/* ---------- 9. 模板页面静态检查 ---------- */
ok(TPL_SRC.indexOf("各搜索引擎运算符支持不一，请以目标搜索引擎为准") >= 0, "页面含运算符差异真限制文案");
ok(TPL_SRC.indexOf("文本不出浏览器") >= 0, "页面含文本不出浏览器文案");
ok(TPL_SRC.indexOf("请按需改写") >= 0, "页面含请按需改写提示");
ok(TPL_SRC.indexOf("data-template=\"sourcing\"") >= 0, "页面有招聘寻访模板按钮");
ok(TPL_SRC.indexOf("data-template=\"academic\"") >= 0, "页面有学术检索模板按钮");
ok(TPL_SRC.indexOf("data-template=\"jobseek\"") >= 0, "页面有求职检索模板按钮");
ok(TPL_SRC.indexOf("https://www.johnkingzcq123.xyz/tools/boolean-search-builder") >= 0, "canonical 正确");
ok(TPL_SRC.indexOf("/tools/search-router") >= 0, "相关工具互链社区搜索聚合器");
ok(TPL_SRC.indexOf("精准找到") < 0, "无精准找到类承诺文案");
ok(TPL_SRC.indexOf("overflow-x:auto") >= 0, "长查询串小屏横向滚动样式");
ok(TPL_SRC.indexOf("id=\"bsb-copy\"") >= 0, "复制按钮存在");
ok(TPL_SRC.indexOf("id=\"bsb-google\"") >= 0, "Google 搜索按钮存在");

/* ---------- 10. 零网络请求与注册 ---------- */
ok(JS_SRC.indexOf("fetch(") < 0, "JS 无 fetch 调用");
ok(JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 无 XHR 调用");
ok(GO_SRC.indexOf('"boolean_search_builder"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/boolean-search-builder"') >= 0, "categories.go 注册 Path");
ok(GO_SRC.indexOf('布尔搜索语句生成器') >= 0, "categories.go 注册名称");
var paths = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
eq(paths.length, 165, "注册总数 164→165 Path");

console.log("boolean_search_builder: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
