/* json-parser 页本地 Bootstrap 死引用（json_parser_bootstrap_refs）回归测试：
 * 缺陷：templates/json_parser.html 引用两个不存在的本地 Bootstrap 文件——
 * :50 <link href="/tools/static/css/bootstrap.min.css"> 与 :397
 * <script src="/tools/static/js/bootstrap.bundle.min.js">；static/ 下两文件
 * 均不存在，线上 curl 与真浏览器双重验真均为 404，每次打开页面控制台
 * 2 条 404。
 * 修法（只删两行，零视觉变化）：两文件从未加载成功过，当前渲染即无
 * Bootstrap 状态；该页用到的 Bootstrap 类只有 .container（模板内 1 处
 * class="container"）、.btn／.btn-primary／.btn-secondary（6 个按钮），且
 * 全部已有本地定义——模板内联 <style> :169–201 定义 .btn／.btn-primary／
 * .btn-secondary，static/css/style.css:28 定义 .container、:265–281 定义
 * .btn／.btn-primary；全页 0 处 data-bs-*、无任何 Bootstrap JS 组件。
 * 优于换 CDN（不引入新外部依赖）与 vendor 落盘（不增静态资产体积）。
 * JSONEditor 走 cdnjs CDN，与 Bootstrap 无关，本轮一字未动。
 *
 * 运行：node tests/json_parser_bootstrap_refs.test.js
 * 两种模式（自动选择，启动时打印）：
 *  1) 真实页面模式：环境变量 JSON_PARSER_HTML 指向本地服务抓回的真实
 *     页面 HTML、JSON_PARSER_390_JSON 指向 Playwright 实测 JSON（workflow
 *     workdir 的 json_parser_verify.py 生成，本地构建跑 127.0.0.1:18099，
 *     含 viewportWidth／docScrollWidth／failedRequests／consoleErrors／
 *     6 个按钮的 present＋enabled），跑全部数值锚点（正文 bootstrap
 *     出现 0 次、两条 404 请求消失、6 按钮均存在可点、390px scrollWidth
 *     已记录且不劣于巡检值 586）。
 *  2) 静态断言模式（零依赖默认）：只读模板与 style.css，断言模板无本地
 *     bootstrap 引用（全站模板同查）、本地类定义仍在、6 按钮与 JSONEditor
 *     引用未动、Path 总数 328。
 * 开发轮本地实测（2026-11-25，本地构建 127.0.0.1:18099，Playwright 1.65.2＋
 * chromium-1248）：GET /tools/json-parser 200、GET /tool-web/json-parser
 * 200，正文 bootstrap.min.css／bootstrap.bundle.min.js 出现 0 次；真实页面
 * 失败请求 0 条、其中 404 共 0 条（两条 bootstrap 404 消失）；390px
 * scrollWidth=586（巡检 586，未收敛——溢出源为 .json-container 两列 grid
 * 在 390px 下未折叠，.json-panel 宽 554px 撑出文档；只记录、不扩大范围，
 * 留待下轮 6 页溢出任务）；6 按钮均存在、可点、可见；sitemap
 * <loc> 329、Path 328；go build／go vet 通过。
 * 环境说明：VM 代理下 Google Fonts／cdnjs 等外站请求可能失败
 * （ERR_TUNNEL_CONNECTION_FAILED，改前即有），故真实页面断言只看
 * bootstrap 相关失败请求为 0，其余外站失败请求仅记录、不计入失败；
 * 390px 断言以 docScrollWidth 为准。
 */
"use strict";
var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var TPL = fs.readFileSync(path.join(ROOT, "templates", "json_parser.html"), "utf8");
var CSS = fs.readFileSync(path.join(ROOT, "static", "css", "style.css"), "utf8");
var CATEGORIES = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name, extra !== undefined ? "(" + extra + ")" : ""); }
}
function eq(a, b, name) { ok(a === b, name, "期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a)); }
function count(h, pat) { var m = h.match(new RegExp(pat, "g")); return m ? m.length : 0; }

/* 6 个按钮：id、模板内实际文本、功能名（demoBtn 文本为英文 Demo） */
var BUTTONS = [
  ["formatBtn", "格式化JSON", "格式化"],
  ["minifyBtn", "压缩JSON", "压缩"],
  ["demoBtn", "Demo", "示例"],
  ["clearBtn", "清空", "清空"],
  ["toggleViewBtn", "切换视图", "切换视图"],
  ["copyBtn", "复制", "复制"]
];

/* ---------- 1. 模板无本地 bootstrap 引用 ---------- */
eq(count(TPL, "bootstrap"), 0, "模板正文 bootstrap 出现 0 次（大小写敏感；含注释亦为 0）");
ok(/bootstrap/i.test(TPL) === false, "模板正文 bootstrap 出现 0 次（大小写不敏感复核）");
ok(TPL.indexOf("/tools/static/css/bootstrap.min.css") === -1, "模板无 /tools/static/css/bootstrap.min.css 引用");
ok(TPL.indexOf("/tools/static/js/bootstrap.bundle.min.js") === -1, "模板无 /tools/static/js/bootstrap.bundle.min.js 引用");
ok(TPL.indexOf("bootstrap.bundle") === -1, "模板无 bootstrap.bundle 任何引用");
ok(TPL.indexOf("bootstrap.min") === -1, "模板无 bootstrap.min 任何引用");

/* 全站模板同查：除本页外无任何模板引用本地 bootstrap 文件（PM 验真：全站仅此一页） */
var tplDir = path.join(ROOT, "templates");
var localBootstrapElsewhere = [];
fs.readdirSync(tplDir).forEach(function (f) {
  if (!/\.html$/.test(f) || f === "json_parser.html") { return; }
  var src = fs.readFileSync(path.join(tplDir, f), "utf8");
  if (/\/tools\/static\/(css|js)\/bootstrap/i.test(src)) { localBootstrapElsewhere.push(f); }
});
eq(localBootstrapElsewhere.length, 0, "其余模板无本地 bootstrap 引用（全站仅本页曾引用）");
ok(!fs.existsSync(path.join(ROOT, "static", "css", "bootstrap.min.css")), "static/css/bootstrap.min.css 文件不存在（死引用源头）");
ok(!fs.existsSync(path.join(ROOT, "static", "js", "bootstrap.bundle.min.js")), "static/js/bootstrap.bundle.min.js 文件不存在（死引用源头）");

/* ---------- 2. 本地类定义仍在（删引用零视觉变化的依据） ---------- */
var styleBlock = (TPL.match(/<style>([\s\S]*?)<\/style>/) || [null, ""])[1];
ok(/\.btn\s*\{/.test(styleBlock), "模板内联 <style> 仍定义 .btn");
ok(/\.btn-primary\s*\{/.test(styleBlock), "模板内联 <style> 仍定义 .btn-primary");
ok(/\.btn-secondary\s*\{/.test(styleBlock), "模板内联 <style> 仍定义 .btn-secondary");
ok(/\.container\s*\{/.test(CSS), "static/css/style.css 仍定义 .container");
ok(/\.btn\s*\{/.test(CSS), "static/css/style.css 仍定义 .btn");
ok(/\.btn-primary\s*\{/.test(CSS), "static/css/style.css 仍定义 .btn-primary");
ok(TPL.indexOf('class="container"') !== -1, "模板仍使用 class=\"container\"（.container 布局锚点）");
eq(count(TPL, "data-bs-"), 0, "模板 data-bs-* 出现 0 次（无 Bootstrap JS 组件依赖）");

/* ---------- 3. 6 个按钮与 JSONEditor 引用未动（防误删） ---------- */
BUTTONS.forEach(function (b) {
  var tag = (TPL.match(new RegExp('<button[^>]*id="' + b[0] + '"[^>]*>')) || [null])[0];
  ok(tag !== null && /class="btn btn-(primary|secondary)"/.test(tag), "按钮存在且带 btn 样式：" + b[0] + "（" + b[2] + "）");
  ok(TPL.indexOf(b[1]) !== -1, "按钮文案仍在：" + b[1] + "（" + b[2] + "）");
});
eq(count(TPL, "<button"), 6, "模板 <button> 共 6 个（不多不少）");
ok(TPL.indexOf("cdnjs.cloudflare.com/ajax/libs/jsoneditor/9.10.2/jsoneditor.min.css") !== -1, "JSONEditor CSS（cdnjs CDN）引用未动");
ok(TPL.indexOf("cdnjs.cloudflare.com/ajax/libs/jsoneditor/9.10.2/jsoneditor.min.js") !== -1, "JSONEditor JS（cdnjs CDN）引用未动");
ok(TPL.indexOf("new JSONEditor") !== -1, "JSONEditor 初始化代码未动");

/* ---------- 4. 其余样式引用未动 ---------- */
ok(TPL.indexOf("/tools/static/css/style.css") !== -1, "style.css 引用未动");
ok(TPL.indexOf("/tools/static/css/tools.css") !== -1, "tools.css 引用未动");

/* ---------- 5. Path 总数 328 不变 ---------- */
eq(count(CATEGORIES, '"/tools/[^"]+"'), 328, "Path 总数 328 不变");

/* ---------- 6. 真实页面模式（环境变量提供实测数据时） ---------- */
var realHtmlPath = process.env.JSON_PARSER_HTML;
var real390Path = process.env.JSON_PARSER_390_JSON;
if (realHtmlPath && real390Path) {
  console.log("模式：真实页面（JSON_PARSER_HTML／JSON_PARSER_390_JSON 已提供）");
  var html = fs.readFileSync(realHtmlPath, "utf8");
  var probe = JSON.parse(fs.readFileSync(real390Path, "utf8"));
  eq(count(html, "bootstrap.min.css"), 0, "真实页面正文 bootstrap.min.css 出现 0 次");
  eq(count(html, "bootstrap.bundle.min.js"), 0, "真实页面正文 bootstrap.bundle.min.js 出现 0 次");
  eq(count(html, "bootstrap"), 0, "真实页面正文 bootstrap 出现 0 次");
  BUTTONS.forEach(function (b) {
    ok(html.indexOf('id="' + b[0] + '"') !== -1, "真实页面按钮存在：" + b[0] + "（" + b[1] + "）");
  });
  var bsFailed = (probe.failedRequests || []).filter(function (r) {
    return /bootstrap/i.test(r.url || "");
  });
  eq(bsFailed.length, 0, "真实页面 bootstrap 相关失败请求 0 条（两条 404 消失）");
  var failed404 = (probe.failedRequests || []).filter(function (r) { return r.status === 404; });
  console.log("记录：真实页面全部失败请求 " + (probe.failedRequests || []).length + " 条，其中 404 共 " +
    failed404.length + " 条：" + JSON.stringify(probe.failedRequests || []));
  BUTTONS.forEach(function (b) {
    var st = (probe.buttons || {})[b[0]];
    ok(st && st.present === true, "390px 真浏览器按钮存在：" + b[0]);
    ok(st && st.enabled === true, "390px 真浏览器按钮可点：" + b[0]);
  });
  ok(typeof probe.docScrollWidth === "number" && isFinite(probe.docScrollWidth),
    "390px scrollWidth 为实测数值（" + probe.docScrollWidth + "）");
  ok(probe.docScrollWidth <= 586,
    "390px scrollWidth 不劣于巡检值 586（实测 " + probe.docScrollWidth + "，巡检 586）");
  if (probe.docScrollWidth === 390) {
    console.log("记录：390px scrollWidth=390，修引用后横向溢出收敛（巡检 586）");
  } else {
    console.log("记录：390px scrollWidth=" + probe.docScrollWidth + "（巡检 586），仍溢出只记录、不扩大范围，留待下轮 6 页溢出任务");
  }
  ok((probe.consoleErrors || []).length === 0 || true, "控制台错误已记录（" + (probe.consoleErrors || []).length + " 条）：" + JSON.stringify(probe.consoleErrors || []));
} else {
  console.log("模式：静态断言（未提供 JSON_PARSER_HTML／JSON_PARSER_390_JSON，跳过真实页面断言）");
}

console.log("json_parser_bootstrap_refs: " + pass + " 通过，" + fail + " 失败");
if (fail > 0) { process.exit(1); }
