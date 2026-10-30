/* llms.txt 生成器纯逻辑单元测试（零依赖）：node tests/llms_txt_generator.test.js
 * 覆盖：默认输入对象、确定性生成向量、校验规则、非法参数 err.field、
 * 注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/llms_txt_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function throws(fn, field, name) {
  try { fn(); ok(false, name + "（应抛错却未抛）"); }
  catch (e) { ok(!field || e.field === field, name + "（err.field 期望 " + field + "，实得 " + e.field + "）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "llms_txt_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "llms_txt_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. defaultLlmsInput：默认输入对象 ---------- */
var d = M.defaultLlmsInput();
ok(d !== null && typeof d === "object", "defaultLlmsInput 返回对象");
eq(d.title, "", "默认 title 空");
eq(d.summary, "", "默认 summary 空");
eq(d.detail, "", "默认 detail 空");
eq(d.rootUrl, "", "默认 rootUrl 空");
ok(Array.isArray(d.sections) && d.sections.length >= 1, "默认 sections 至少一个默认节");
ok(typeof d.sections[0].name === "string", "默认节含 name");
ok(Array.isArray(d.sections[0].links) && d.sections[0].links.length >= 1, "默认节含 links 数组");
ok(typeof d.sections[0].links[0].text === "string" && typeof d.sections[0].links[0].url === "string",
  "默认链接含 text/url");

/* ---------- 2. 确定性向量：buildLlmsTxt 逐字命中 ---------- */
var vec = M.buildLlmsTxt({
  title: "My Site", summary: "A site.", detail: "", rootUrl: "",
  sections: [{ name: "Docs", links: [{ text: "API", url: "https://x.com/api" }] }]
});
eq(vec, "# My Site\n\n> A site.\n\n## Docs\n\n- [API](https://x.com/api)\n",
  "确定性向量逐字命中");
ok(/[^\n]\n$/.test(vec) && !/\n\n$/.test(vec), "末尾单个换行");

var vec2 = M.buildLlmsTxt({
  title: "T", summary: "S", detail: "D1\nD2", rootUrl: "https://e.com",
  sections: [
    { name: "A", links: [{ text: "x", url: "https://e.com/x" }] },
    { name: "B", links: [] }
  ]
});
eq(vec2, "# T\n\n> S\n\nD1\nD2\n\n## A\n\n- [x](https://e.com/x)\n\n## B\n",
  "细节段＋多分节版式（节间空行分隔）");

/* ---------- 3. validateLlmsTxt：校验规则 ---------- */
eq(M.validateLlmsTxt(vec).length, 0, "生成结果校验 0 issues");
var emptyIssues = M.validateLlmsTxt("");
ok(emptyIssues.length > 0 && emptyIssues[0].field === "title", "空字符串校验首条 field=title");
ok(M.validateLlmsTxt("# T\n\n- [bad](not-a-url)\n").some(function (i) { return i.field === "link"; }),
  "非法 URL 链接行 field=link");
ok(M.validateLlmsTxt("# T\n- [broken(x\n").some(function (i) { return i.field === "link"; }),
  "链接行形状不符 field=link");
ok(M.validateLlmsTxt("no title here\n").some(function (i) { return i.field === "title"; }),
  "首行非「# 」开头 field=title");
eq(M.validateLlmsTxt("# T\n\n> S\n\n## A\n\n- [x](https://e.com/x)\n").length, 0,
  "合法多行文本 0 issues");

/* ---------- 4. 非法参数：err.field ---------- */
throws(function () { M.buildLlmsTxt({}); }, "input", "空对象抛错 field=input");
throws(function () { M.buildLlmsTxt(null); }, "input", "null 抛错 field=input");
throws(function () { M.buildLlmsTxt("str"); }, "input", "字符串输入抛错 field=input");
throws(function () { M.buildLlmsTxt({ title: "", summary: "s", sections: [{ name: "D", links: [] }] }); },
  "title", "空标题抛错 field=title");
throws(function () { M.buildLlmsTxt({ title: "   " }); }, "title", "空白标题抛错 field=title");
throws(function () { M.validateLlmsTxt(123); }, "input", "validate 非字符串抛错 field=input");
throws(function () { M.validateLlmsTxt(null); }, "input", "validate null 抛错 field=input");

/* ---------- 5. llmsFileName ---------- */
eq(M.llmsFileName(), "llms.txt", "llmsFileName 返回 llms.txt");

/* ---------- 6. 注册与零网络请求静态检查 ---------- */
ok(GO_SRC.indexOf('"llms_txt_generator"') !== -1, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/llms-txt-generator"') !== -1, "categories.go 注册 Path");
var regBlock = GO_SRC.split('"llms_txt_generator"')[1].split("},")[0];
ok(regBlock.indexOf('Category:    "开发工具"') !== -1, "categories.go 注册 Category 开发工具");
ok(regBlock.indexOf("New:         true") !== -1, "categories.go 注册 New true");
ok(regBlock.indexOf('Icon:        "article_notes"') !== -1, "categories.go 注册 Icon article_notes");
var pathCount = {};
GO_SRC.replace(/"(\/tools\/[^"]+)"/g, function (_, p) { pathCount[p] = 1; return p; });
eq(Object.keys(pathCount).length, 233, "注册 Path 总数 232→233");
ok(JS_SRC.indexOf("fetch(") === -1 && JS_SRC.indexOf("XMLHttpRequest") === -1,
  "JS 零 fetch/XHR");
ok(!/src="https?:\/\//.test(TPL_SRC), "模板无外部脚本引用");
ok(!/href="https?:\/\/(?!www\.johnkingzcq123\.xyz)/.test(TPL_SRC), "模板无外部超链接");
ok(TPL_SRC.indexOf("/tools/robots-txt-generator") !== -1, "模板互链 robots.txt 生成器");
ok(TPL_SRC.indexOf("/tools/robots-txt-validator") !== -1, "模板互链 robots.txt 校验器");
ok(TPL_SRC.indexOf("/tools/project-to-txt") !== -1, "模板互链代码打包给 LLM");
ok(TPL_SRC.indexOf("手写签名") === -1, "模板不链未交付工具（手写签名数字化仪）");
ok(TPL_SRC.indexOf("新兴标准") !== -1, "模板真限制①：社区新兴标准");
ok(TPL_SRC.indexOf("输入质量") !== -1, "模板真限制②：输入质量");
ok(TPL_SRC.indexOf("网站根目录") !== -1, "模板真限制③：手动放网站根目录");
ok(TPL_SRC.indexOf("本地生成") !== -1 && TPL_SRC.indexOf("不上传") !== -1, "模板真限制④＋隐私：本地生成不上传");
ok(TPL_SRC.indexOf('src="/tools/static/js/llms_txt_generator.js') !== -1, "模板引用本工具 JS");
ok(TPL_SRC.indexOf('id="llg-title"') !== -1 && TPL_SRC.indexOf('id="llg-preview"') !== -1 &&
  TPL_SRC.indexOf('id="llg-validate"') !== -1 && TPL_SRC.indexOf('id="llg-download"') !== -1,
  "模板含表单/预览/校验/下载关键元素");
/* 模板内所有 /tools/xxx 外链必须已在 categories.go 注册（不链未交付工具）。 */
var hrefRe = /href="(\/tools\/[a-z0-9\-\/]+)"/g;
var hm, bad = [];
while ((hm = hrefRe.exec(TPL_SRC)) !== null) {
  if (hm[1] === "/tools/static") continue;
  if (GO_SRC.indexOf('"' + hm[1] + '"') < 0) bad.push(hm[1]);
}
eq(bad.length, 0, "模板外链全部已注册（实得未注册：" + JSON.stringify(bad) + "）");

console.log("PASS: " + pass + "  FAIL: " + fail);
process.exit(fail ? 1 : 0);
