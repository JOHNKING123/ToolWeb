/* 浏览器书签清理与分析器纯逻辑单元测试（零依赖）：node tests/bookmark_cleaner.test.js
 * 覆盖：解析向量（示例 3 文件夹/7 链接、属性抽取、实体解码、非法抛错 err.field=file）、
 * 归一化向量（大小写/斜杠/fragment/默认端口/query/非法 null）、去重向量
 * （重复 URL 组、重复标题组、空文件夹、域名统计）、导出向量（删除纯函数、导出标识、
 * 往返重解析、导出命名）、注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/bookmark_cleaner.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function deepEq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function throwsField(fn, field, name) {
  try { fn(); } catch (e) {
    ok(e instanceof Error && e.field === field,
      name + "（期望抛 Error 且 err.field=" + JSON.stringify(field) + "，实得 " +
      (e instanceof Error ? "Error field=" + JSON.stringify(e.field) : typeof e) + "）");
    return;
  }
  fail++; console.error("FAIL:", name + "（未抛出异常）");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "bookmark_cleaner.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "bookmark_cleaner.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. 解析向量 ---------- */
var ex = M.generateExample();
ok(typeof ex === "string" && ex.indexOf("NETSCAPE-Bookmark-file-1") >= 0, "generateExample 返回含标识的 HTML");
var P = M.parseBookmarksHtml(ex);
eq(P.folders.length, 3, "示例解析 folders=3");
eq(P.links.length, 7, "示例解析 links=7");
deepEq(P.folders.map(function (f) { return f.name; }), ["技术博客", "新闻资讯", "空文件夹"], "文件夹名与顺序");
eq(P.links[0].href, "https://Example.com/a/", "链接 HREF 原样保留大小写");
eq(P.links[0].addDate, 1700000001, "链接 ADD_DATE 解析");
eq(P.links[0].icon, "data:image/png;base64,iVBORw0KGgo=", "链接 ICON 解析");
eq(P.links[1].icon, "", "无 ICON 时为空字符串");
deepEq(P.links[0].folderPath, ["技术博客"], "链接所属文件夹路径");
deepEq(P.links[6].folderPath, [], "根目录链接 folderPath 为空数组");
eq(P.links[4].title, "每日新闻", "链接标题解析");
// 实体解码
var entHtml = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><A HREF="https://example.com/x">A &amp; B &#65;</A></DL><p>';
eq(M.parseBookmarksHtml(entHtml).links[0].title, "A & B A", "标题 HTML 实体解码");
// 非法输入抛错 err.field='file'
throwsField(function () { M.parseBookmarksHtml("<html>xxx</html>"); }, "file", "无标识 HTML 抛错");
throwsField(function () { M.parseBookmarksHtml(""); }, "file", "空字符串抛错");
throwsField(function () { M.parseBookmarksHtml("   "); }, "file", "空白字符串抛错");
throwsField(function () { M.parseBookmarksHtml(123); }, "file", "非字符串抛错");
throwsField(function () { M.parseBookmarksHtml(null); }, "file", "null 抛错");

/* ---------- 2. 归一化向量 ---------- */
eq(M.normalizeUrl("https://Example.com/a/"), "https://example.com/a", "host 小写+去末尾斜杠");
eq(M.normalizeUrl("https://example.com/a"), "https://example.com/a", "已规范 URL 不变");
eq(M.normalizeUrl("https://example.com/a#frag"), "https://example.com/a", "去 fragment");
eq(M.normalizeUrl("https://example.com:443/a"), "https://example.com/a", "去默认端口 443");
eq(M.normalizeUrl("http://example.com:80/a"), "http://example.com/a", "去默认端口 80");
eq(M.normalizeUrl("https://example.com:8443/a"), "https://example.com:8443/a", "非默认端口保留");
eq(M.normalizeUrl("https://example.com/a?x=1"), "https://example.com/a?x=1", "query 保留");
eq(M.normalizeUrl("https://example.com/"), "https://example.com/", "根路径斜杠保留");
eq(M.normalizeUrl("not a url"), null, "非法 URL 返回 null");
eq(M.normalizeUrl(""), null, "空字符串返回 null");
eq(M.normalizeUrl(null), null, "null 返回 null");

/* ---------- 3. 去重向量 ---------- */
var dupUrl = M.detectDuplicateUrls(P.links);
eq(dupUrl.length, 1, "重复 URL 组数为 1");
eq(dupUrl[0].links.length, 2, "重复 URL 组内 2 条");
eq(dupUrl[0].key, "https://example.com/a", "重复 URL 组归一化键");
eq(dupUrl[0].links[0].addDate, 1700000001, "组内按 ADD_DATE 升序（最早在前）");
var dupTitle = M.detectDuplicateTitles(P.links);
eq(dupTitle.length, 1, "重复标题组数为 1");
eq(dupTitle[0].key, "每日新闻", "重复标题组键");
eq(dupTitle[0].links.length, 2, "重复标题组内 2 条");
var emptyIds = M.findEmptyFolders(P.tree);
eq(emptyIds.length, 1, "空文件夹 1 个");
var emptyFolder = P.folders.filter(function (f) { return emptyIds.indexOf(f.id) >= 0; })[0];
eq(emptyFolder && emptyFolder.name, "空文件夹", "空文件夹即示例中的空文件夹");
var ds = M.domainStats(P.links, 20);
eq(ds[0].domain, "example.com", "域名统计 Top1 为 example.com");
eq(ds[0].count, 3, "example.com 计数为 3");
eq(ds.length, 5, "去重后 5 个不同域名");
deepEq(M.domainStats(P.links, 2).map(function (d) { return d.domain; }),
  ["example.com", "developer.mozilla.org"], "topN=2 截断且次位按字母序");

// 空 tree / 空 links 边界
deepEq(M.detectDuplicateUrls([]), [], "空 links 无重复 URL 组");
deepEq(M.detectDuplicateTitles([]), [], "空 links 无重复标题组");
deepEq(M.findEmptyFolders([]), [], "空 tree 无空文件夹");
deepEq(M.domainStats([], 20), [], "空 links 无域名统计");

/* ---------- 4. 导出向量 ---------- */
var beforeCount = M.flattenLinks(P.tree).length;
var t2 = M.removeLinks(P.tree, [P.links[0].id]);
eq(M.flattenLinks(t2).length, beforeCount - 1, "removeLinks 后链接数减 1");
eq(M.flattenLinks(P.tree).length, beforeCount, "removeLinks 不改原 tree");
var t2b = M.removeLinks(P.tree, ["l-not-exist"]);
eq(M.flattenLinks(t2b).length, beforeCount, "removeLinks 未知 id 不变");
var folderToRemove = P.folders[0].id; // 技术博客（含 4 条链接）
var t3 = M.removeFolders(P.tree, [folderToRemove]);
eq(M.flattenLinks(t3).length, beforeCount - 4, "removeFolders 删掉文件夹子树 4 条链接");
eq(M.flattenLinks(P.tree).length, beforeCount, "removeFolders 不改原 tree");
var exported = M.exportBookmarksHtml(t2);
ok(exported.indexOf("NETSCAPE-Bookmark-file-1") >= 0, "导出含 NETSCAPE-Bookmark-file-1 标识");
ok(exported.indexOf("https://Example.com/a/") < 0, "已删链接不再出现在导出中");
ok(exported.indexOf("https://example.com/a\"") >= 0 || exported.indexOf("https://example.com/a\" ") >= 0 ||
   exported.indexOf('HREF="https://example.com/a"') >= 0, "保留链接仍在导出中");
ok(exported.indexOf("空文件夹") >= 0, "空文件夹结构保留在导出中");
// 导出往返：重新解析通过
var re = M.parseBookmarksHtml(exported);
eq(re.links.length, beforeCount - 1, "导出往返重解析链接数一致");
eq(re.folders.length, 3, "导出往返重解析文件夹数一致");
throwsField(function () { M.exportBookmarksHtml("not-array"); }, "tree", "exportBookmarksHtml 非数组抛错");
eq(M.suggestExportName(), "bookmarks-cleaned.html", "suggestExportName");

/* ---------- 5. 注册与静态检查 ---------- */
ok(GO_SRC.indexOf('"bookmark_cleaner"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/bookmark-cleaner"') >= 0, "categories.go 注册 Path");
var idx = GO_SRC.indexOf('"bookmark_cleaner"');
ok(GO_SRC.slice(idx, idx + 1000).indexOf('Category:    "实用工具"') >= 0, "注册 Category 为实用工具");
ok(GO_SRC.slice(idx, idx + 1000).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(idx, idx + 1000).indexOf('Icon:        "bookmark"') >= 0, "注册 Icon 为 bookmark");
var pathCount = 0, m, re2 = /"\/tools\/[^"]+"/g, seen = {};
while ((m = re2.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 235, "注册 Path 总数 234→235");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零 fetch/XHR");
ok(!/<script[^>]+src="https?:\/\//.test(TPL_SRC), "模板无外部脚本引用（零 CDN）");
ok(!/rel="stylesheet"[^>]+href="https?:\/\//.test(TPL_SRC), "模板无外部样式引用（零 CDN）");
ok(TPL_SRC.indexOf('{{define "bookmark_cleaner"}}') >= 0, "模板 define 名与路由 bookmark-cleaner 对应");
ok(TPL_SRC.indexOf("只做本地导入→分析／去重／清理→导出") >= 0, "模板含真限制：只做本地导入导出");
ok(TPL_SRC.indexOf("首版不做死链检测") >= 0, "模板含真限制：首版不做死链检测");
ok(TPL_SRC.indexOf("不收集、不上传") >= 0, "模板含真限制：不收集、不上传");
ok(TPL_SRC.indexOf("/tools/url-tracker-cleaner") >= 0, "互链 URL 追踪参数清除器");
ok(TPL_SRC.indexOf("/tools/url-parser") >= 0, "互链 URL 解析器");
ok(TPL_SRC.indexOf("grex") < 0, "模板不含未交付工具（示例生成正则）硬凑互链");

console.log("bookmark_cleaner: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
