/* /tool-web/search 返回 404（search_route）回归测试：
 * 缺陷：handleSearch 只注册在根路由（main.go:632 GET／:633 HEAD），toolsGroup
 * 内无 /search；mount.go 入站改写把 /tool-web/search 变为 /tools/search，落到
 * /tools/:tool，handleToolPage 以 GetToolNameByPath("/tools/search") == ""
 * 判定未知 slug，返回 404「工具不存在」（线上实测 404、15 字节）。
 * 修复（体验打磨第 15 轮）：① toolsGroup 块内补 toolsGroup.GET("/search",
 * handleSearch) 与 toolsGroup.HEAD("/search", headNoBody(handleSearch))，与根
 * 路由同口径，复用同一 handleSearch，不复制搜索逻辑；② 空 q 跳转落点由 "/"
 * 改为 "/tools/index"——挂载层只改写 /tools/ 前缀的 Location，"/" 在
 * /tool-web 下会落到域名根（挂载外），/tools/index 会被改写回 /tool-web/index；
 * 根路由 /search 与 /tools/search 共用 handler，落点一致。
 * 未动：根路由 /search、handleToolPage 兜底逻辑、tools/categories.go、全部模板、
 * sitemap；Path 总数 328、sitemap <loc> 329 不变；无新依赖、无新模板。
 *
 * 关于「在 /tools/:tool 之前」：toolsGroup 块在 main.go :1603 附近，文本上在
 * /tools/:tool（:658）之后，故「之前」指 gin 路由匹配优先级而非行号顺序——
 * gin 路由树按静态段优先于参数段匹配，静态的 /tools/search 恒优先于参数的
 * /tools/:tool，与两处注册的文本顺序无关。本文件断言注册为静态段且落在
 * toolsGroup 块内；运行时优先级由本地构建实测覆盖（GET /tools/search?q=json
 * 200、未知 slug /tools/xxx 仍 404）。
 *
 * 运行：node tests/search_route.test.js（零依赖，纯静态断言）
 */
"use strict";
var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var GO_SRC = fs.readFileSync(path.join(ROOT, "main.go"), "utf-8");
var MOUNT_SRC = fs.readFileSync(path.join(ROOT, "mount.go"), "utf-8");
var CAT_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf-8");

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name, extra !== undefined ? "(" + extra + ")" : ""); }
}
function eq(a, b, name) { ok(a === b, name, "期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a)); }

/* ---------- toolsGroup 块定位 ---------- */
var groupStart = GO_SRC.indexOf('toolsGroup := router.Group("/tools")');
ok(groupStart !== -1, "main.go 定义 toolsGroup（router.Group(\"/tools\")）");
var groupEnd = GO_SRC.indexOf("\n\t}\n", groupStart);
ok(groupEnd !== -1, "toolsGroup 块有闭合括号");
var groupBlock = groupStart !== -1 && groupEnd !== -1
  ? GO_SRC.slice(groupStart, groupEnd)
  : "";

/* ---------- 1. toolsGroup 内有 /search 注册（GET＋HEAD，与根路由同口径） ---------- */
ok(groupBlock.indexOf('toolsGroup.GET("/search", handleSearch)') !== -1,
  "toolsGroup 块内注册 GET /search（复用 handleSearch）");
ok(groupBlock.indexOf('toolsGroup.HEAD("/search", headNoBody(handleSearch))') !== -1,
  "toolsGroup 块内注册 HEAD /search（headNoBody(handleSearch)，与根路由同口径）");

/* ---------- 2. 注册为静态段，gin 匹配优先级高于 /tools/:tool ---------- */
ok(groupBlock.indexOf('"/search"') !== -1 &&
   groupBlock.indexOf('"/search/:') === -1 &&
   groupBlock.indexOf('"/:search"') === -1,
  "toolsGroup 的 /search 注册为静态段（无 :tool 之类参数段），gin 静态段优先于参数段匹配");
ok(GO_SRC.indexOf('router.GET("/tools/:tool", handleToolPage)') !== -1,
  "/tools/:tool 注册仍在（handleToolPage 兜底未被顶替）");
ok(GO_SRC.indexOf('router.HEAD("/tools/:tool", headNoBody(handleToolPage))') !== -1,
  "/tools/:tool HEAD 注册仍在");

/* ---------- 3. 根路由 /search 保留 ---------- */
ok(GO_SRC.indexOf('router.GET("/search", handleSearch)') !== -1,
  "根路由 GET /search 保留（复用同一 handleSearch）");
ok(GO_SRC.indexOf('router.HEAD("/search", headNoBody(handleSearch))') !== -1,
  "根路由 HEAD /search 保留");

/* ---------- 4. handleSearch 定义未动：渲染 index 模板，空 q 落点改为 /tools/index ---------- */
var searchStart = GO_SRC.indexOf("handleSearch := func(c *gin.Context) {");
ok(searchStart !== -1, "handleSearch 定义仍在（同一函数内定义，直接复用）");
var searchEnd = GO_SRC.indexOf('\n\trouter.GET("/search"', searchStart);
var searchBody = searchStart !== -1 && searchEnd !== -1
  ? GO_SRC.slice(searchStart, searchEnd)
  : "";
ok(searchBody.indexOf('c.HTML(http.StatusOK, "index"') !== -1,
  "handleSearch 仍渲染 index 模板（未加新页面／新模板）");
ok(searchBody.indexOf('"SearchQuery"') !== -1 &&
   searchBody.indexOf('"SearchResults"') !== -1,
  "handleSearch 仍传 SearchQuery／SearchResults（结果数可比对）");
ok(searchBody.indexOf('c.Redirect(http.StatusFound, "/tools/index")') !== -1,
  "handleSearch 空 q 跳转落点为 /tools/index（挂载层改写回 /tool-web/index）");
ok(searchBody.indexOf('c.Redirect(http.StatusFound, "/")') === -1,
  "handleSearch 空 q 不再 302 到 \"/\"（挂载下会落到域名根、挂载外）");

/* ---------- 5. handleToolPage 兜底逻辑仍在（未知 slug 仍 404「工具不存在」） ---------- */
ok(GO_SRC.indexOf('if tools.GetToolNameByPath("/tools/"+tool) == "" {') !== -1,
  "handleToolPage 仍以 GetToolNameByPath 判定未知 slug");
ok(GO_SRC.indexOf('c.String(http.StatusNotFound, "工具不存在")') !== -1,
  "handleToolPage 未知 slug 仍返回 404「工具不存在」");

/* ---------- 6. 挂载层机制：入站改写＋Location 改写覆盖本轮两条链路 ---------- */
ok(MOUNT_SRC.indexOf("toolWebInternalPrefix + strings.TrimPrefix(p, toolWebMountPrefix)") !== -1,
  "mount.go 入站改写 /tool-web/<x> → /tools/<x> 仍在（/tool-web/search 走 /tools/search）");
ok(MOUNT_SRC.indexOf('if strings.HasPrefix(loc, toolWebInternalPrefix+"/") {') !== -1,
  "mount.go Location 改写覆盖 /tools/ 前缀（/tools/index → /tool-web/index）");

/* ---------- 7. 不回归：Path 总数 328（categories.go 未动） ---------- */
var catPaths = CAT_SRC.match(/"\/tools\/[^"]+"/g) || [];
var uniquePaths = {};
catPaths.forEach(function (p) { uniquePaths[p] = true; });
eq(Object.keys(uniquePaths).length, 328, "tools/categories.go Path 总数仍为 328（未新增工具）");
ok(catPaths.indexOf('"/tools/search"') === -1,
  "categories.go 未把 /search 当工具注册（搜索不是工具，Path 总数不含它）");

console.log("search_route: pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
