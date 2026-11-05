/* 浏览器环境信息一键复制纯逻辑单元测试（零依赖）：node tests/browser_env_info.test.js
 * 覆盖：buildEntries 13 key 固定顺序精确值/缺字段回退'未知'/非法 raw 抛错（err.field='raw'）、
 * parseBrowser 品牌优先与 UA 回退向量、parseOs 系统解析向量、
 * formatAsMarkdown/formatAsPlainText 空 entries 抛错（err.field='entries'）、
 * encodeShareFragment/decodeShareFragment 往返一致/非法 fragment 抛错（err.field='fragment'）、
 * sanitizeFileName 清理与回退、注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/browser_env_info.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "browser_env_info.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "browser_env_info.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

var CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var RAW = {
  brands: [
    { brand: "Not/A)Brand", version: "99" },
    { brand: "Google Chrome", version: "120.0.0.0" }
  ],
  ua: CHROME_UA,
  platform: "Windows",
  screenW: 1920, screenH: 1080,
  viewportW: 1519, viewportH: 930,
  dpr: 1.25,
  timezone: "Asia/Shanghai（UTC+08:00）",
  language: "zh-CN（另有：en-US、en）",
  maxTouchPoints: 10,
  cookieEnabled: true,
  onLine: true,
  colorDepth: 24,
  hardwareConcurrency: 16
};
var EXPECTED_VALUES = [
  "Google Chrome 120.0.0.0",
  "Windows 10/11",
  CHROME_UA,
  "1920×1080",
  "1519×930 px",
  "1.25",
  "Asia/Shanghai（UTC+08:00）",
  "zh-CN（另有：en-US、en）",
  "支持（10 点触控）",
  "已开启",
  "在线",
  "24 位",
  "16（逻辑处理器）"
];

/* ---------- 1. buildEntries：13 key 固定顺序精确值 ---------- */
var entries = M.buildEntries(RAW);
eq(entries.length, 13, "buildEntries 13 条");
eq(entries.map(function (e) { return e.key; }).join(","),
  "browser,os,userAgent,screen,viewport,dpr,timezone,language,touch,cookies,online,colorDepth,hardwareConcurrency",
  "buildEntries key 固定顺序精确值");
eq(entries.map(function (e) { return e.label; }).join(","),
  "浏览器,操作系统,UA 原文,屏幕分辨率,视口尺寸,设备像素比,时区,语言,触屏支持,Cookie,在线状态,色深,硬件并发数",
  "buildEntries label 固定顺序精确值");
entries.forEach(function (e, i) {
  eq(e.value, EXPECTED_VALUES[i], "buildEntries[" + e.key + "] 精确值");
});
eq(M.ENTRY_DEFS.length, 13, "ENTRY_DEFS 13 项");

/* ---------- 2. buildEntries：缺字段回退'未知' ---------- */
var emptyEntries = M.buildEntries({});
eq(emptyEntries.length, 13, "buildEntries({}) 13 条");
ok(emptyEntries.every(function (e) { return e.value === "未知"; }),
  "buildEntries({}) 全回退'未知'");
var partial = M.buildEntries({ ua: CHROME_UA, screenW: 1920 });
eq(partial[0].value, "Chrome 120.0.0.0", "缺 brands 时 UA 回退解析浏览器");
eq(partial[3].value, "未知", "缺 screenH 时屏幕分辨率回退'未知'");
eq(M.buildEntries({ maxTouchPoints: 0 })[8].value, "不支持", "maxTouchPoints=0 → 不支持");
eq(M.buildEntries({ maxTouchPoints: -1 })[8].value, "未知", "maxTouchPoints 负数回退'未知'");
eq(M.buildEntries({ cookieEnabled: false })[9].value, "已禁用", "cookieEnabled=false → 已禁用");
eq(M.buildEntries({ onLine: false })[10].value, "离线", "onLine=false → 离线");
eq(M.buildEntries({ dpr: 0 })[5].value, "未知", "dpr=0 回退'未知'");
eq(M.buildEntries({ dpr: 2 })[5].value, "2", "dpr=2 → '2'");
eq(M.buildEntries({ screenW: 1920.5, screenH: 1080 })[3].value, "未知", "非整数分辨率回退'未知'");
eq(M.buildEntries({ timezone: "   " })[6].value, "未知", "纯空白时区回退'未知'");

/* ---------- 3. buildEntries：非法 raw 抛错（err.field='raw'） ---------- */
throws(function () { M.buildEntries(null); }, "raw", "buildEntries(null) 抛错");
throws(function () { M.buildEntries(undefined); }, "raw", "buildEntries(undefined) 抛错");
throws(function () { M.buildEntries("x"); }, "raw", "buildEntries(字符串) 抛错");
throws(function () { M.buildEntries(42); }, "raw", "buildEntries(数字) 抛错");
throws(function () { M.buildEntries([1, 2]); }, "raw", "buildEntries(数组) 抛错");

/* ---------- 4. parseBrowser：品牌优先与 UA 回退 ---------- */
eq(M.parseBrowser(CHROME_UA, RAW.brands), "Google Chrome 120.0.0.0",
  "parseBrowser brands 优先、跳过 GREASE 占位品牌");
eq(M.parseBrowser(CHROME_UA, [{ brand: "Not/A)Brand", version: "8" }]),
  "Chrome 120.0.0.0", "parseBrowser 仅 GREASE 品牌时回退 UA");
var EDGE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
eq(M.parseBrowser(EDGE_UA, []), "Microsoft Edge 120.0.0.0", "parseBrowser Edge UA 回退");
var FF_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0";
eq(M.parseBrowser(FF_UA, null), "Firefox 121.0", "parseBrowser Firefox UA 回退");
var SAFARI_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15";
eq(M.parseBrowser(SAFARI_UA, null), "Safari 17.2", "parseBrowser Safari UA 回退");
var OPERA_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0";
eq(M.parseBrowser(OPERA_UA, null), "Opera 106.0.0.0", "parseBrowser Opera UA 回退");
var IE_UA = "Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko";
eq(M.parseBrowser(IE_UA, null), "Internet Explorer 11.0", "parseBrowser IE11 UA 回退");
eq(M.parseBrowser("SomeUnknownBot/1.0", null), null, "parseBrowser 未知 UA 返回 null");
eq(M.parseBrowser(null, null), null, "parseBrowser 非法输入返回 null");
eq(M.parseBrowser("", []), null, "parseBrowser 空 UA 返回 null");

/* ---------- 5. parseOs：系统解析向量 ---------- */
eq(M.parseOs(CHROME_UA, "Windows"), "Windows 10/11", "parseOs Windows NT 10.0 → Windows 10/11");
eq(M.parseOs("Mozilla/5.0 (Windows NT 6.1; Win64; x64) Chrome/120.0.0.0", null), "Windows 7",
  "parseOs Windows NT 6.1 → Windows 7");
eq(M.parseOs("Mozilla/5.0 (Linux; Android 13; Pixel 7) Chrome/120.0.0.0", null), "Android 13",
  "parseOs Android 版本精确值");
eq(M.parseOs("Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) Version/17.2 Mobile/15E148", null),
  "iOS 17.2", "parseOs iOS 下划线转点");
eq(M.parseOs(SAFARI_UA, null), "macOS 14.2.1", "parseOs macOS 下划线转点");
eq(M.parseOs("Mozilla/5.0 (X11; Linux x86_64) Firefox/121.0", null), "Linux", "parseOs Linux");
eq(M.parseOs("Mozilla/5.0 (X11; CrOS x86_64 100) Chrome/120.0.0.0", null), "Chrome OS",
  "parseOs Chrome OS");
eq(M.parseOs("", "macOS"), "macOS", "parseOs platform 兜底 macOS");
eq(M.parseOs("", "BeOS"), null, "parseOs 未知 platform 返回 null");
eq(M.parseOs(null, null), null, "parseOs 非法输入返回 null");

/* ---------- 6. formatAsMarkdown / formatAsPlainText ---------- */
var md = M.formatAsMarkdown(entries);
ok(md.indexOf("## 浏览器环境信息") === 0, "Markdown 首行为二级标题");
ok(md.indexOf("- **浏览器**：Google Chrome 120.0.0.0") !== -1, "Markdown 含浏览器行精确值");
ok(md.indexOf("- **色深**：24 位") !== -1, "Markdown 含色深行精确值");
eq(md.split("\n").length, 17, "Markdown 17 行（标题+空行+13行+空行+落款）");
ok(md.lastIndexOf("纯前端本地采集") !== -1, "Markdown 落款含纯前端本地采集");
var pt = M.formatAsPlainText(entries);
ok(pt.indexOf("浏览器环境信息\n") === 0, "纯文本首行为标题");
ok(pt.indexOf("操作系统：Windows 10/11") !== -1, "纯文本含操作系统行精确值");
ok(pt.indexOf("硬件并发数：16（逻辑处理器）") !== -1, "纯文本含硬件并发数行精确值");
eq(pt.split("\n").length, 14, "纯文本 14 行（标题+13行）");
throws(function () { M.formatAsMarkdown([]); }, "entries", "formatAsMarkdown 空数组抛错");
throws(function () { M.formatAsMarkdown(null); }, "entries", "formatAsMarkdown null 抛错");
throws(function () { M.formatAsPlainText([]); }, "entries", "formatAsPlainText 空数组抛错");
throws(function () { M.formatAsPlainText("x"); }, "entries", "formatAsPlainText 非数组抛错");

/* ---------- 7. encodeShareFragment / decodeShareFragment ---------- */
var frag = M.encodeShareFragment(entries);
eq(typeof frag, "string", "encode 返回字符串");
ok(frag.indexOf("bei1.") === 0, "fragment 前缀 bei1.");
var decoded = M.decodeShareFragment(frag);
eq(JSON.stringify(decoded), JSON.stringify(entries), "fragment 往返一致");
eq(decoded.length, 13, "decode 13 条");
eq(decoded[0].key, "browser", "decode 首条 key=browser");
throws(function () { M.decodeShareFragment(""); }, "fragment", "decode 空串抛错");
throws(function () { M.decodeShareFragment("nope"); }, "fragment", "decode 无前缀抛错");
throws(function () { M.decodeShareFragment("bei1."); }, "fragment", "decode 空载荷抛错");
throws(function () { M.decodeShareFragment("bei1.!!!"); }, "fragment", "decode 非法字符抛错");
throws(function () {
  M.decodeShareFragment("bei1." + Buffer.from("not json").toString("base64url"));
}, "fragment", "decode 非 JSON 载荷抛错");
throws(function () {
  M.decodeShareFragment("bei1." + Buffer.from("null").toString("base64url"));
}, "fragment", "decode 非数组载荷抛错");
throws(function () {
  M.decodeShareFragment("bei1." + Buffer.from(JSON.stringify([{ a: 1 }])).toString("base64url"));
}, "fragment", "decode 结构非法抛错");
throws(function () {
  var bad = JSON.parse(JSON.stringify(entries));
  bad[0].key = "bogus";
  M.decodeShareFragment("bei1." + Buffer.from(JSON.stringify(bad)).toString("base64url"));
}, "fragment", "decode key 错位抛错");
throws(function () {
  var short = entries.slice(0, 12);
  M.decodeShareFragment("bei1." + Buffer.from(JSON.stringify(short)).toString("base64url"));
}, "fragment", "decode 条目数不足抛错");
throws(function () { M.encodeShareFragment([]); }, "entries", "encode 空数组抛错");
throws(function () {
  M.encodeShareFragment([{ key: "a", label: "b", value: 1 }]);
}, "entries", "encode 元素结构非法抛错");

/* ---------- 8. sanitizeFileName：清理与回退 ---------- */
eq(M.sanitizeFileName("Hello: 世界?"), "Hello-世界", "sanitizeFileName 冒号问号清理、空格折横线");
eq(M.sanitizeFileName("a/b\\c*d?e\"f<g>h|i"), "abcdefghi", "sanitizeFileName 非法字符全清");
eq(M.sanitizeFileName("   "), "browser-env-info", "sanitizeFileName 纯空白回退");
eq(M.sanitizeFileName(""), "browser-env-info", "sanitizeFileName 空串回退");
eq(M.sanitizeFileName(null), "browser-env-info", "sanitizeFileName null 回退");
eq(M.sanitizeFileName("  浏览器 环境  "), "浏览器-环境", "sanitizeFileName 首尾空白清、中间折横线");
eq(M.sanitizeFileName(new Array(101).join("a")).length, 60, "sanitizeFileName 超长截 60");
eq(M.sanitizeFileName("...dots..."), "dots", "sanitizeFileName 首尾点清掉");
eq(M.sanitizeFileName("Bei 1.0"), "Bei-1.0", "sanitizeFileName 大小写保留");

/* ---------- 9. 注册与零网络请求静态检查 ---------- */
ok(GO_SRC.indexOf('"browser_env_info"') !== -1, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/browser-env-info"') !== -1, "categories.go 注册 Path");
var regBlock = GO_SRC.split('"browser_env_info"')[1].split("},")[0];
ok(regBlock.indexOf('Category:    "开发工具"') !== -1, "categories.go 注册 Category 开发工具");
ok(regBlock.indexOf("New:         true") !== -1, "categories.go 注册 New true");
ok(regBlock.indexOf('Icon:        "info"') !== -1, "categories.go 注册 Icon info");
var iconHits = (GO_SRC.match(/Icon:\s+"info"/g) || []).length;
eq(iconHits, 1, "Icon info 精确值复测锁定：全库唯一 1 处");
var pathCount = {};
GO_SRC.replace(/"(\/tools\/[^"]+)"/g, function (_, p) { pathCount[p] = 1; return p; });
eq(Object.keys(pathCount).length, 307, "注册总数 292→295 Path");
ok(JS_SRC.indexOf("fetch(") === -1 && JS_SRC.indexOf("XMLHttpRequest") === -1,
  "JS 零 fetch/XHR");
ok(TPL_SRC.indexOf('src="http') === -1 && TPL_SRC.indexOf("cdn.") === -1,
  "模板零 CDN 外链");
ok(TPL_SRC.indexOf("/tools/static/js/browser_env_info.js") !== -1, "模板引入 browser_env_info.js");
ok(TPL_SRC.indexOf("userAgentData 仅 Chromium 系支持") !== -1, "模板真限制：userAgentData 仅 Chromium 系支持");
ok(TPL_SRC.indexOf("部分字段取不到属正常") !== -1, "模板真限制：部分字段取不到属正常");
ok(TPL_SRC.indexOf("分享链接把 13 项数据原样编进 URL hash") !== -1, "模板真限制：分享链接即数据本身");
ok(TPL_SRC.indexOf("/tools/user-agent-parser") !== -1, "模板互链 User-Agent 解析器");
ok(TPL_SRC.indexOf("/tools/bug-report-generator") !== -1, "模板互链 Bug 报告生成器");
ok(TPL_SRC.indexOf("https://www.johnkingzcq123.xyz/tools/browser-env-info") !== -1,
  "模板 canonical 指向 browser-env-info");
ok(typeof M.buildEntries === "function" && typeof M.formatAsMarkdown === "function" &&
  typeof M.formatAsPlainText === "function" && typeof M.encodeShareFragment === "function" &&
  typeof M.decodeShareFragment === "function" && typeof M.sanitizeFileName === "function",
  "window.BrowserEnvInfo 纯函数契约齐备");

console.log("PASS: " + pass + "  FAIL: " + fail);
process.exit(fail ? 1 : 0);
