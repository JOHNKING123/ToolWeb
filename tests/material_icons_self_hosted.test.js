/* Material Icons 改为本地自托管（material_icons_self_hosted）回归测试：
 * 缺陷：全站 184 个模板经 fonts.googleapis.com 加载 Material Icons，
 * 每次打开工具页都要请求 Google Fonts（国内访问不稳定、失败时图标退
 * 化为字面文本）；另有 19 个模板用图标却无任何字体引用（含两个被引用
 * 片段 nav.html／image_preview_modal.html），图标长期显示为字面文本。
 * 修法（体验打磨第 21 轮，只改引用与新增静态资产，不动图标本身与功能）：
 *  1) static/fonts/material-icons.woff2（新增，128352 字节）：400 字重
 *     ligature 版，来源 jsDelivr @fontsource/material-icons@5.2.5
 *     （files/material-icons-latin-400-normal.woff2），与 Google Fonts
 *     css2 API 当日下发的 v145 文件字节一致（SHA-256 见下锚点；实测
 *     fontTools 解码 ligature 2234 条，站内 353 个字面图标名中 347 个
 *     在集内）；许可证见 static/fonts/LICENSE-material-icons.txt
 *     （Apache License 2.0 全文）。
 *  2) static/css/material-icons.css（新增）：全站唯一 @font-face（字
 *     体族 Material Icons、400、font-display:swap、本地 woff2）与标准
 *     .material-icons 类规则（含 font-feature-settings: 'liga'）。
 *  3) 184 个模板的 185 处 Google Fonts 引用：183 处原位换成本地样式表
 *     引用（/tools/static/css/material-icons.css，6 种行文变体全数处
 *     理：141 处 4 空格标准行、37 处 2 空格标准行、4 处 href 在前行、
 *     personal_clipboard.html 单行 one-liner、index.html 的 preload＋
 *     noscript 配对合并为 1 行）；login.html 无图标、无 nav、无 JS 注
 *     入，引用行直接删除（不换成本地引用）。
 *  4) 19 个有图标无引用的模板：nav.html 与 image_preview_modal.html
 *     为被引用片段（{{define "nav"}}／{{define "image_preview_modal"}}），
 *     不改本体，改其 17 个宿主模板（在 tools.css 行后插入本地引用）；
 *     另补 gcode_viewer.html：PM 按 <i> 计数时漏计，该页用 <span
 *     class="material-icons">lock</span>（自有可见图标），同样无引用，
 *     同规则补 1 行。改动模板共 202 个（≤ PM 上限 203）。
 *  5) 14 个有引用无 <i> 图标的模板：app_detail／base642img／
 *     my_test_app／ping／postman 用 <span class="material-icons">、
 *     其余 8 个（dns_lookup／domain_check／ip_lookup／my_ip／
 *     personal_clipboard／port_scan／quicksort／ssl_check）渲染 nav
 *     片段图标，引用均保留并换成本地；仅 login 删除（见 3）。
 * 未改（有意）：140 个含 nav 且无本地引用的模板——其中 56 个用
 * .navbar .material-icons{display:none} 主动隐藏导航图标（模板内注释
 * 「本页零 CDN：未加载 Material Icons 字体时隐藏导航图标文字」），其
 * 余 84 个不隐藏、导航图标目前显示为字面文本，属改前既存状态；本轮
 * 口径只做 PM 定稿的 203 模板，不擅自扩围，留待 PM 另议是否下轮补
 * 引用（84 页名单见本测试运行输出）。
 * 另：6 个字面图标名（database／folder_managed／gauge／regex／robot／
 * table）与 14 个 categories.go Icon 值不在字体 ligature 集内——与
 * Google Fonts 当日下发的 v145 文件逐条比对，两者缺失集合完全相同，
 * 属改前即坏（即使走 CDN 也显示字面文本），非本轮回归；本测试以
 * woff2 SHA-256 锚定文件字节，文件不变则覆盖不变。
 *
 * 运行：node tests/material_icons_self_hosted.test.js
 * 两种模式（自动选择，启动时打印）：
 *  1) 静态断言模式（零依赖默认）：只读模板与 static 文件，断言上列
 *     全部静态锚点（Google Fonts 引用 0、woff2 字节锚点、单源 @font-face、
 *     189／21 个图标模板引用覆盖、login／index 特例、Path 328）。
 *  2) 真实页面模式：环境变量 MATERIAL_ICONS_PROBE_JSON 指向 Playwright
 *     实测 JSON（workflow workdir 的 mi_verify.js 生成，本地构建跑
 *     127.0.0.1:18099，Playwright＋chromium-1248），含 woff2／CSS 的
 *     状态码与 Content-Type、每页 googleapis 请求数、抽查图标实测宽
 *     与 computed font-family、9 页 390px scrollWidth、sitemap <loc>。
 * 开发轮本地实测（2026-11-28，本地构建 127.0.0.1:18099，Playwright
 * 1.65.2＋chromium-1248）：GET /tools/static/fonts/material-icons.woff2
 * 200、font/woff2；GET /tools/static/css/material-icons.css 200；全量
 * 328 页网络日志 fonts.googleapis.com 请求 0 条；抽查图标页（img-resize
 * 与 19 个补引用页中的 dial_code_lookup／moodboard／photo_collage 等）
 * 图标实测宽约 24px、computed font-family 含 Material Icons、非字面
 * 文本（password-strength-checker 的 gauge 与 sql-formatter 的 database
 * 为字体内不存在的图标名，改前走 CDN 同样显示字面文本，不计入抽查）；
 * 390px 下 9 页中 8 页 scrollWidth = 390，sql-formatter 391（database
 * 字面文本 144px 所致，仅隐藏它即 390，见测试内注释）；桌面端 1919px
 * 抽查图标外观与改前一致；控制台无新增报错；sitemap <loc> 329、Path 328；
 * go build／go vet 通过。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

var ROOT = path.join(__dirname, "..");
var TPL_DIR = path.join(ROOT, "templates");
var LOCAL_HREF = "/tools/static/css/material-icons.css";
var WOFF2_SHA256 = "8265f64786397d6b832d1ca0aafdf149ad84e72759fffa9f7272e91a0fb015d1";

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name, extra !== undefined ? "(" + extra + ")" : ""); }
}
function eq(a, b, name) { ok(a === b, name, "期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a)); }
function count(h, pat) { var m = h.match(new RegExp(pat, "g")); return m ? m.length : 0; }
function readAll(dir) {
  var out = {};
  fs.readdirSync(dir).forEach(function (f) {
    if (/\.html$/.test(f)) { out[f] = fs.readFileSync(path.join(dir, f), "utf8"); }
  });
  return out;
}
var TPLS = readAll(TPL_DIR);
var NAMES = Object.keys(TPLS).sort();

/* ---------- 1. Google Fonts 引用清零 ---------- */
var googleHits = [];
NAMES.forEach(function (f) {
  if (TPLS[f].indexOf("fonts.googleapis.com") !== -1) { googleHits.push(f); }
});
eq(googleHits.length, 0, "templates/ 内 fonts.googleapis.com 出现 0 个文件（" + googleHits.join("、") + "）");
var staticHits = [];
(function walk(d) {
  fs.readdirSync(d).forEach(function (e) {
    var p = path.join(d, e);
    if (fs.statSync(p).isDirectory()) { walk(p); return; }
    if (/\.(css|js|html|json|txt|xml)$/.test(e) && fs.readFileSync(p, "utf8").indexOf("fonts.googleapis.com") !== -1) {
      staticHits.push(path.relative(ROOT, p));
    }
  });
})(path.join(ROOT, "static"));
eq(staticHits.length, 0, "static/ 内 fonts.googleapis.com 出现 0 个文件（" + staticHits.join("、") + "）");

/* ---------- 2. woff2 文件锚点 ---------- */
var woff2Path = path.join(ROOT, "static", "fonts", "material-icons.woff2");
ok(fs.existsSync(woff2Path), "static/fonts/material-icons.woff2 存在");
var woff2 = fs.readFileSync(woff2Path);
eq(woff2.length, 128352, "woff2 字节数 128352");
eq(woff2.slice(0, 4).toString("ascii"), "wOF2", "woff2 魔数 wOF2");
eq(crypto.createHash("sha256").update(woff2).digest("hex"), WOFF2_SHA256,
  "woff2 SHA-256 与 Google Fonts v145 文件一致（字节相同，ligature 覆盖随之锚定）");
ok(fs.existsSync(path.join(ROOT, "static", "fonts", "LICENSE-material-icons.txt")),
  "static/fonts/LICENSE-material-icons.txt 存在（Apache 2.0）");
var lic = fs.readFileSync(path.join(ROOT, "static", "fonts", "LICENSE-material-icons.txt"), "utf8");
ok(lic.indexOf("Apache License") !== -1 && lic.indexOf("Version 2.0") !== -1,
  "LICENSE 记 Apache License 2.0");
ok(lic.indexOf("8265f64786397d6b832d1ca0aafdf149ad84e72759fffa9f7272e91a0fb015d1") !== -1,
  "LICENSE 记 woff2 SHA-256 来源");

/* ---------- 3. material-icons.css 单源 ---------- */
var cssPath = path.join(ROOT, "static", "css", "material-icons.css");
ok(fs.existsSync(cssPath), "static/css/material-icons.css 存在");
var css = fs.readFileSync(cssPath, "utf8");
eq(count(css, "@font-face"), 1, "material-icons.css 内 @font-face 恰 1 处（单源）");
ok(/font-family:\s*'Material Icons'/.test(css), "CSS 字体族为 'Material Icons'");
ok(/font-weight:\s*400/.test(css), "CSS 字重 400");
ok(/font-display:\s*swap/.test(css), "CSS font-display: swap");
ok(css.indexOf("url(/tools/static/fonts/material-icons.woff2)") !== -1,
  "CSS @font-face 指向本地 woff2");
ok(/\.material-icons\s*\{/.test(css), "CSS 定义 .material-icons 类");
ok(/font-feature-settings:\s*'liga'/.test(css), "CSS 含 font-feature-settings: 'liga'");
ok(/font-size:\s*24px/.test(css), "CSS .material-icons 默认 24px");
ok(css.indexOf("fonts.googleapis.com") === -1, "CSS 内无 Google Fonts 域名");
/* 其余 CSS 不得另行定义 @font-face；模板内不得有 @font-face 规则体 */
var otherFontFace = [];
fs.readdirSync(path.join(ROOT, "static", "css")).forEach(function (f) {
  if (f !== "material-icons.css" && /\.css$/.test(f) &&
      fs.readFileSync(path.join(ROOT, "static", "css", f), "utf8").indexOf("@font-face") !== -1) {
    otherFontFace.push(f);
  }
});
eq(otherFontFace.length, 0, "其余 static/css 无 @font-face（" + otherFontFace.join("、") + "）");
var tplFontFace = NAMES.filter(function (f) { return TPLS[f].indexOf("@font-face {") !== -1; });
eq(tplFontFace.length, 0, "模板内无 @font-face 规则体（" + tplFontFace.join("、") + "）");

/* ---------- 4. 本地引用覆盖 ---------- */
function withLocal(f) { return TPLS[f].indexOf(LOCAL_HREF) !== -1; }
function localCount(f) { return count(TPLS[f], "/tools/static/css/material-icons\\.css"); }
var localFiles = NAMES.filter(withLocal);
eq(localFiles.length, 201, "含本地引用的模板 201 个（183 替换＋17 新增＋gcode_viewer 补 1）");
var doubled = localFiles.filter(function (f) { return localCount(f) !== 1; });
eq(doubled.length, 0, "本地引用每模板恰 1 处（重复：" + doubled.join("、") + "）");
var iconI = NAMES.filter(function (f) { return TPLS[f].indexOf('<i class="material-icons">') !== -1; });
eq(iconI.length, 189, "<i class=\"material-icons\"> 模板 189 个");
var iconIMissing = iconI.filter(function (f) { return !withLocal(f); });
eq(iconIMissing.join(","), "image_preview_modal.html,nav.html",
  "<i> 图标模板中仅 2 个被引用片段无直接引用（其宿主含本地引用）");
var iconSpan = NAMES.filter(function (f) { return TPLS[f].indexOf('<span class="material-icons">') !== -1; });
eq(iconSpan.length, 21, "<span class=\"material-icons\"> 模板 21 个");
var spanMissing = iconSpan.filter(function (f) { return !withLocal(f); });
eq(spanMissing.length, 0, "<span> 图标模板全部含本地引用（" + spanMissing.join("、") + "）");
/* image_preview_modal 的 6 个宿主全部含本地引用 */
["base642img.html", "base64toimg.html", "img2base64.html",
 "img_compress.html", "img_convert.html", "watermark.html"].forEach(function (f) {
  ok(withLocal(f), "image_preview_modal 宿主含本地引用：" + f);
});
/* 17 个补引用宿主全部含本地引用 */
["dial_code_lookup.html", "doc_bg_cleaner.html", "er_diagram_generator.html",
 "git_cheatsheet.html", "hanzi_stroke_order.html", "json_graph_viewer.html",
 "moodboard.html", "ofd_to_pdf.html", "password_breach_checker.html",
 "password_strength_checker.html", "photo_collage.html", "pinyin_converter.html",
 "printer_test_page.html", "roman_numeral_converter.html", "text_summarizer.html",
 "traditional_simplified_converter.html", "utm_link_builder.html",
 "gcode_viewer.html"].forEach(function (f) {
  ok(withLocal(f), "补引用模板含本地引用：" + f);
});

/* ---------- 5. login／index 特例 ---------- */
var login = TPLS["login.html"];
ok(login.indexOf("fonts.googleapis.com") === -1, "login 无 Google Fonts 引用");
eq(localCount("login.html"), 0, "login 无本地引用（无图标、无 nav，故删除而非替换）");
ok(login.indexOf("material-icons") === -1, "login 全文无 material-icons");
var index = TPLS["index.html"];
eq(localCount("index.html"), 1, "index 本地引用恰 1 处（preload＋noscript 合并）");
ok(index.indexOf("preload") === -1 || index.indexOf("fonts.googleapis") === -1,
  "index 无 Google Fonts preload");
ok(index.indexOf("<noscript><link") === -1, "index 无 noscript 字体回退行");

/* ---------- 6. 140 个含 nav 无引用模板（有意未改，留待 PM 另议） ---------- */
var navHosts = NAMES.filter(function (f) { return TPLS[f].indexOf('{{template "nav"') !== -1; });
var navNoRef = navHosts.filter(function (f) { return !withLocal(f); });
eq(navNoRef.length, 140, "含 nav 且无本地引用的模板 140 个（改前 141，gcode_viewer 已补）");
var hideRule = navNoRef.filter(function (f) { return /\.navbar \.material-icons/.test(TPLS[f]); });
eq(hideRule.length, 56, "其中主动隐藏导航图标 56 个");
eq(navNoRef.length - hideRule.length, 84, "其中不隐藏、导航图标现为字面文本 84 个");
console.log("记录：84 个不隐藏导航图标的无引用模板（留待 PM 另议）：" +
  navNoRef.filter(function (f) { return /\.navbar \.material-icons/.test(TPLS[f]) === false; }).join("、"));

/* ---------- 7. Path 总数 328 不变 ---------- */
var categories = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
eq(count(categories, '"/tools/[^"]+"'), 328, "Path 总数 328 不变");

/* ---------- 8. 真实页面模式（环境变量提供实测数据时） ---------- */
var probePath = process.env.MATERIAL_ICONS_PROBE_JSON;
if (probePath) {
  console.log("模式：真实页面（MATERIAL_ICONS_PROBE_JSON 已提供）");
  var probe = JSON.parse(fs.readFileSync(probePath, "utf8"));
  eq(probe.woff2.status, 200, "GET woff2 200");
  ok(/font\/woff2/.test(probe.woff2.contentType || ""), "woff2 Content-Type font/woff2（" + probe.woff2.contentType + "）");
  eq(probe.css.status, 200, "GET material-icons.css 200");
  eq(probe.googleRequestsTotal, 0, "全量 328 页网络日志 fonts.googleapis.com 请求 0 条");
  eq(probe.pagesTotal, 328, "扫查页数 328");
  (probe.iconSamples || []).forEach(function (s) {
    var fs = s.fontSize || 24;
    ok(Math.abs(s.width - fs) < 3, "图标实测宽约等于字号：" + s.page + "（宽 " + s.width + "px，字号 " + fs + "px）");
    ok((s.fontFamily || "").indexOf("Material Icons") !== -1,
      "图标 computed font-family 含 Material Icons：" + s.page + "（" + s.fontFamily + "）");
    ok(s.isGlyph === true, "图标为字形非字面文本：" + s.page + "（文本 " + JSON.stringify(s.text) + "）");
  });
  /* 跳过的破损图标名必须全在已知缺失集内（与 Google Fonts v145 相同） */
  var KNOWN_MISSING = ["database", "folder_managed", "gauge", "regex", "robot", "table"];
  (probe.skippedBrokenIcons || []).forEach(function (b) {
    ok(KNOWN_MISSING.indexOf(b.icon) !== -1,
      "跳过的破损图标在已知缺失集内：" + b.page + "／" + b.icon);
  });
  var skippedNames = (probe.skippedBrokenIcons || []).map(function (b) { return b.icon; });
  ok(skippedNames.indexOf("gauge") !== -1, "抽查中跳过 gauge（password-strength-checker，字体内无此名）");
  /* database 不在 20 个抽查页的采样集内（只在 sql-formatter 的 390px
   * 断言注释中记录：该图标字面文本 144px 是 sql-formatter 391 的根因；
   * 其缺失性由 woff2 SHA-256 锚定——文件与 Google Fonts v145 字节相同） */
  var overflow9 = ["xml-formatter", "compose-to-k8s", "jwt-parser", "sql-formatter",
    "bulk-image-resizer", "img-resize", "pdf-manage", "qr-scanner", "text-diff"];
  overflow9.forEach(function (slug) {
    var p = (probe.scroll390 || {})[slug];
    if (slug === "sql-formatter") {
      /* sql-formatter 391 非本轮回归：根因为图标名 database 不在字体
       * ligature 集内（与 Google Fonts v145 缺失集相同），渲染为 144px
       * 字面文本，仅隐藏它即收敛到 390（diag_sql2.js 实测）；改名须 PM
       * 定（规格禁动图标名），故此处如实锚定 391，不放宽断言。*/
      eq(p, 391, "390px scrollWidth=391（已知原因）：sql-formatter（实测 " + p + "）");
    } else {
      eq(p, 390, "390px scrollWidth=390：" + slug + "（实测 " + p + "）");
    }
  });
  eq((probe.consoleErrorsNew || []).length, 0,
    "控制台无新增报错（" + JSON.stringify(probe.consoleErrorsNew || []) + "）");
  if (probe.sitemapLocs !== undefined) {
    eq(probe.sitemapLocs, 329, "sitemap <loc> 329 不变");
  }
  if (probe.iconDesktop) {
    var dfs = probe.iconDesktop.fontSize || 24;
    ok(Math.abs(probe.iconDesktop.width - dfs) < 3,
      "1919px 图标宽约等于字号（" + probe.iconDesktop.width + "px，字号 " + dfs + "px，与改前一致）");
    ok((probe.iconDesktop.fontFamily || "").indexOf("Material Icons") !== -1,
      "1919px 图标 font-family 含 Material Icons");
  }
} else {
  console.log("模式：静态断言（未提供 MATERIAL_ICONS_PROBE_JSON，跳过真实页面断言）");
}

console.log("material_icons_self_hosted: " + pass + " 通过，" + fail + " 失败");
if (fail > 0) { process.exit(1); }
