/* robots.txt 校验与测试器纯逻辑单元测试（零依赖）：node tests/robots_txt_validator.test.js
 * 覆盖：分组解析与行号、注释/空行处理、Sitemap 单列、四类错误、警告分级、
 * 最长匹配、等长 Allow 优先、默认允许、专属组优先、AI 矩阵六格、示例载入、
 * 注册与零网络请求静态检查。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/robots_txt_validator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "robots_txt_validator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "robots_txt_validator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. 分组解析与行号（示例一） ---------- */
var p1 = M.parseRobots(M.EXAMPLES.typical);
eq(p1.groups.length, 1, "示例一：1 个组");
eq(p1.groups[0].userAgents.length, 1, "示例一：组内 1 个 User-agent");
eq(p1.groups[0].userAgents[0].value, "*", "示例一：User-agent 为 *");
eq(p1.groups[0].rules.length, 3, "示例一：3 条规则行");
eq(p1.groups[0].rules[0].kind, "allow", "示例一：规则 1 为 Allow");
eq(p1.groups[0].rules[1].value, "/admin/", "示例一：规则 2 路径 /admin/");
eq(p1.groups[0].rules[1].line, 4, "示例一：/admin/ 行号 4");
eq(p1.sitemaps.length, 1, "示例一：Sitemap 单列 1 条");
eq(p1.sitemaps[0].value, "https://example.com/sitemap.xml", "示例一：Sitemap 值正确");
eq(p1.sitemaps[0].line, 7, "示例一：Sitemap 行号 7");
ok(p1.lines.some(function (l) { return l.type === "comment"; }), "示例一：注释行保留定位");
ok(p1.lines.some(function (l) { return l.type === "blank"; }), "示例一：空行保留定位");

/* ---------- 2. 示例二分组 ---------- */
var p2 = M.parseRobots(M.EXAMPLES.aiBlock);
eq(p2.groups.length, 3, "示例二：3 个组（* / GPTBot / ClaudeBot）");
eq(p2.groups[1].userAgents[0].value, "GPTBot", "示例二：第 2 组为 GPTBot");
eq(p2.groups[2].rules[0].value, "/", "示例二：ClaudeBot 组 Disallow /");

/* ---------- 3. 校验：四类错误 ---------- */
var bad = M.parseRobots("Disallow: /secret/\nUser-agent: \nAllow: admin\nSitemap: not-a-url\n");
var chk = M.validateRobots(bad);
eq(chk.errors.length, 4, "校验：四类错误全部检出");
ok(chk.errors.some(function (e) { return e.line === 1 && e.message.indexOf("组之前") >= 0; }), "校验：组前规则错误带行号 1");
ok(chk.errors.some(function (e) { return e.line === 2 && e.message.indexOf("User-agent 为空") >= 0; }), "校验：空 User-agent 错误带行号 2");
ok(chk.errors.some(function (e) { return e.line === 3 && e.message.indexOf("缺少前导") >= 0; }), "校验：路径缺前导 / 错误带行号 3");
ok(chk.errors.some(function (e) { return e.line === 4 && e.message.indexOf("Sitemap") >= 0; }), "校验：Sitemap 非 URL 错误带行号 4");

/* ---------- 4. 校验：警告只报警告 ---------- */
var warnParsed = M.parseRobots("User-agent: *\nDisallow: \nCrawl-delay: 10\nFooBar: 1\nDisallow: /a/\nDisallow: /a/\n");
var warnChk = M.validateRobots(warnParsed);
eq(warnChk.errors.length, 0, "警告样本：错误 0 个");
ok(warnChk.warnings.some(function (w) { return w.message.indexOf("空 Disallow") >= 0; }), "警告：空 Disallow");
ok(warnChk.warnings.some(function (w) { return w.message.indexOf("Crawl-delay") >= 0; }), "警告：Crawl-delay");
ok(warnChk.warnings.some(function (w) { return w.message.indexOf("未知指令") >= 0; }), "警告：未知指令");
ok(warnChk.warnings.some(function (w) { return w.message.indexOf("重复") >= 0; }), "警告：重复规则");
var caseChk = M.validateRobots(M.parseRobots("User-agent: *\naLLoW: /x\n"));
ok(caseChk.warnings.some(function (w) { return w.message.indexOf("大小写混写") >= 0; }), "警告：指令名大小写混写（aLLoW）");
var canonChk = M.validateRobots(M.parseRobots("User-agent: *\nAllow: /x\ndisallow: /y\n"));
eq(canonChk.warnings.length, 0, "规范写法（Allow/disallow 首字母或全小写）不报大小写警告");
var cleanChk = M.validateRobots(M.parseRobots(M.EXAMPLES.typical));
eq(cleanChk.errors.length, 0, "示例一：错误 0 个");
eq(cleanChk.warnings.length, 0, "示例一：警告 0 个");

/* ---------- 5. 规则匹配 ---------- */
ok(M.patternMatches("/private/*", "/private/page.html"), "匹配：* 通配");
ok(M.patternMatches("/private/*.html$", "/private/a.html"), "匹配：$ 结尾锚定命中");
ok(!M.patternMatches("/private/*.html$", "/private/a.html?x=1"), "匹配：$ 锚定拒绝带查询串");
ok(!M.patternMatches("/admin/", "/adm"), "匹配：前缀不命中");
ok(!M.patternMatches("", "/anything"), "匹配：空规则不命中");
eq(M.normalizeTestPath("https://example.com/a/b?x=1"), "/a/b?x=1", "归一化：完整 URL 取路径＋查询串");

var mParsed = M.parseRobots("User-agent: *\nDisallow: /private/\nAllow: /private/public/\n");
var r1 = M.testUrl(mParsed, "*", "/private/public/page.html");
eq(r1.allowed, true, "最长匹配获胜：/private/public/ 更长，允许");
eq(r1.matched.value, "/private/public/", "最长匹配：命中规则为 Allow /private/public/");
var r2 = M.testUrl(mParsed, "*", "/private/other.html");
eq(r2.allowed, false, "最长匹配：/private/ 命中，禁止");
var tie = M.parseRobots("User-agent: *\nDisallow: /same/\nAllow: /same/\n");
eq(M.testUrl(tie, "*", "/same/x").allowed, true, "等长冲突：Allow 优先");
var none = M.parseRobots("User-agent: *\nDisallow: /admin/\n");
var r3 = M.testUrl(none, "*", "/open/page");
eq(r3.allowed, true, "无匹配规则：默认允许");
eq(r3.matched, null, "无匹配规则：matched 为 null");
var r4 = M.testUrl(none, "Googlebot", "/open/page");
eq(r4.fallback, "wildcard", "无专属组：回落到 * 组");
var r5 = M.testUrl(M.parseRobots("User-agent: Bingbot\nDisallow: /\n"), "Googlebot", "/x");
eq(r5.fallback, "none", "既无专属组又无 * 组：fallback none");
eq(r5.allowed, true, "无匹配组：默认允许");

/* ---------- 6. 专属组优先 ---------- */
var spec = M.parseRobots("User-agent: *\nDisallow: /\nUser-agent: GPTBot\nAllow: /\n");
eq(M.testUrl(spec, "GPTBot", "/page").allowed, true, "专属组优先：GPTBot 专属 Allow 胜过 * 组 Disallow");
eq(M.selectGroup(spec, "GPTBot").fallback, "specific", "选组：GPTBot 命中专属组");

/* ---------- 7. AI 矩阵 ---------- */
var matrix = M.aiMatrix(M.parseRobots(M.EXAMPLES.aiBlock));
eq(matrix.length, 6, "AI 矩阵：6 格");
eq(matrix[0].bot, "GPTBot", "AI 矩阵：第 1 格 GPTBot");
eq(matrix[0].status, "禁止", "AI 矩阵：示例二 GPTBot 禁止");
eq(matrix[1].status, "禁止", "AI 矩阵：示例二 ClaudeBot 禁止");
eq(matrix[2].status, "允许", "AI 矩阵：示例二 CCBot 回落 * 组允许");
ok(matrix[2].detail.indexOf("* 组") >= 0, "AI 矩阵：CCBot 格附 * 组简述");
var matrixNone = M.aiMatrix(M.parseRobots("User-agent: Bingbot\nDisallow: /\n"));
ok(matrixNone.every(function (r) { return r.status === "未明确"; }), "AI 矩阵：无 * 组时全部未明确");

/* ---------- 8. 示例载入与注册、零网络 ---------- */
ok(M.EXAMPLES.typical.indexOf("Sitemap: https://example.com/sitemap.xml") >= 0, "示例一含 Sitemap");
ok(M.EXAMPLES.aiBlock.indexOf("User-agent: GPTBot") >= 0 && M.EXAMPLES.aiBlock.indexOf("User-agent: ClaudeBot") >= 0, "示例二含 GPTBot 与 ClaudeBot 组");
ok(GO_SRC.indexOf('"robots_txt_validator"') >= 0, "categories.go 注册 ID");
ok(GO_SRC.indexOf('"/tools/robots-txt-validator"') >= 0, "categories.go 注册 Path");
ok(GO_SRC.indexOf('Icon:        "shield-check"') >= 0, "注册 Icon shield-check");
var genIdx = GO_SRC.indexOf('"robots_txt_generator"');
var valIdx = GO_SRC.indexOf('"robots_txt_validator"');
ok(genIdx >= 0 && valIdx > genIdx, "注册紧邻 robots_txt_generator 之后");
var paths = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
var uniq = {};
paths.forEach(function (p) { uniq[p] = true; });
eq(Object.keys(uniq).length, 248, "注册 Path 总数 248→248");
ok(TPL_SRC.indexOf("https://www.johnkingzcq123.xyz/tools/robots-txt-validator") >= 0, "模板 canonical 含新 Path");
ok(TPL_SRC.indexOf("君子协定") >= 0 && TPL_SRC.indexOf("不等于访问控制") >= 0, "真限制：君子协定非访问控制");
ok(TPL_SRC.indexOf("Google 规范近似实现") >= 0, "真限制：Google 规范近似实现");
ok(TPL_SRC.indexOf("粘贴模式为主") >= 0 && TPL_SRC.indexOf("不在线拉取") >= 0, "真限制：粘贴模式为主不在线拉取");
ok(TPL_SRC.indexOf("内容不出浏览器") >= 0, "真限制：内容不出浏览器");
ok(TPL_SRC.indexOf("Crawl-delay 效力因爬虫而异") >= 0, "真限制：Crawl-delay 效力因爬虫而异");
ok(TPL_SRC.indexOf("未发现问题") >= 0 || JS_SRC.indexOf("未发现问题") >= 0, "无问题时明示未发现问题");
ok(JS_SRC.indexOf("fetch(") < 0 && JS_SRC.indexOf("XMLHttpRequest") < 0, "JS 零 fetch/XHR");
ok(TPL_SRC.indexOf("fonts.googleapis") < 0 && TPL_SRC.indexOf("cdn.") < 0, "模板零 CDN");
ok(TPL_SRC.indexOf("rtv-input") >= 0 && TPL_SRC.indexOf("rtv-matrix") >= 0 && TPL_SRC.indexOf("rtv-test-result") >= 0, "模板含粘贴区/矩阵/测试结果区");
ok(TPL_SRC.indexOf("/tools/robots-txt-generator") >= 0 && TPL_SRC.indexOf("/tools/url-parser") >= 0, "互链：生成器与 URL 解析器");

console.log("PASS " + pass + " / FAIL " + fail);
if (fail > 0) process.exit(1);
