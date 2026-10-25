/* .htaccess 生成器纯逻辑单元测试（零依赖）：node tests/htaccess_generator.test.js
 * 覆盖：分组开关、www 互斥、输出顺序、多行重定向、错误页、防盗链白名单、
 * 敏感文件保护、预设载入、重置、注册与零网络请求静态检查。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/htaccess_generator.js");
var GO_SRC = fs.readFileSync(path.join(__dirname, "../tools/categories.go"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(__dirname, "../templates/htaccess_generator.html"), "utf8");
var JS_SRC = fs.readFileSync(path.join(__dirname, "../static/js/htaccess_generator.js"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

/* ---------- 1. 默认状态：全关 = 空输出 ---------- */
var d = M.defaultState();
eq(M.buildHtaccess(d), "", "默认：全关输出为空");
eq(M.buildHtaccess(d).indexOf("#"), -1, "默认：无残留注释占位");
eq(M.countRules(""), 0, "统计：空文本规则数为 0");

/* ---------- 2. 仅 HTTPS：只出 HTTPS 规则 ---------- */
var s = M.defaultState(); s.https = true;
var t = M.buildHtaccess(s);
ok(t.indexOf("RewriteCond %{HTTPS} off") !== -1, "HTTPS：含 RewriteCond %{HTTPS} off");
ok(t.indexOf("[L,R=301]") !== -1, "HTTPS：含 301 跳转");
ok(t.indexOf("RewriteEngine On") !== -1, "HTTPS：含 RewriteEngine On");
ok(t.indexOf("www") === -1, "HTTPS：不含 www 规则");
ok(t.indexOf("ErrorDocument") === -1, "HTTPS：不含错误页规则");
ok(t.indexOf("X-Content-Type-Options") === -1, "HTTPS：不含安全头");

/* ---------- 3. www 互斥 ---------- */
s = M.defaultState(); s.www = "www";
t = M.buildHtaccess(s);
ok(t.indexOf("!^www\\.") !== -1, "www：统一 www 输出 !^www 条件");
ok(t.indexOf("https://www.%{HTTP_HOST}") !== -1, "www：统一 www 跳转到 www 域名");
ok(t.indexOf("^www\\.(.*)$") === -1, "www：统一 www 时不出去 www 规则");
s = M.defaultState(); s.www = "nonwww";
t = M.buildHtaccess(s);
ok(t.indexOf("^www\\.(.*)$") !== -1, "去 www：输出 ^www 条件");
ok(t.indexOf("https://%1%{REQUEST_URI}") !== -1, "去 www：跳转到去 www 域名");
ok(t.indexOf("!^www\\.") === -1, "去 www：不输出统一 www 规则");

/* ---------- 4. 全开顺序：HTTPS → www → 301 → 错误页 → 缓存 → 安全头 → 防盗链 → 敏感 ---------- */
s = M.defaultState();
s.https = true; s.www = "www";
s.redirects = [{ from: "/a.html", to: "https://example.com/b.html" }];
s.errors = { e404: true, path404: "/404.html", e403: false, path403: "", e500: false, path500: "" };
s.cache = true; s.compress = true;
s.headers = { nosniff: true, frame: true, referrer: true };
s.hotlink = { enabled: true, allowEmpty: true, whitelist: ["example.com"] };
s.sensitive = true;
t = M.buildHtaccess(s);
var iHttps = t.indexOf("RewriteCond %{HTTPS} off");
var iWww = t.indexOf("!^www\\.");
var iRedir = t.indexOf("Redirect 301 /a.html");
var iErr = t.indexOf("ErrorDocument 404");
var iCache = t.indexOf("ExpiresActive On");
var iHead = t.indexOf("X-Content-Type-Options");
var iHot = t.indexOf("防盗链");
var iSens = t.indexOf("敏感文件保护");
ok(iHttps !== -1 && iWww !== -1 && iRedir !== -1 && iErr !== -1 && iCache !== -1 &&
    iHead !== -1 && iHot !== -1 && iSens !== -1, "全开：8 组全部输出");
ok(iHttps < iWww && iWww < iRedir && iRedir < iErr && iErr < iCache &&
    iCache < iHead && iHead < iHot && iHot < iSens, "全开：顺序 HTTPS→www→301→错误页→缓存→安全头→防盗链→敏感");
ok(M.countRules(t) > 10, "全开：规则数 > 10（实得 " + M.countRules(t) + "）");

/* ---------- 5. 空分组不输出空段 ---------- */
s = M.defaultState(); s.https = true;
t = M.buildHtaccess(s);
ok(t.indexOf("自定义错误页") === -1, "空分组：错误页段不输出");
ok(t.indexOf("安全头") === -1, "空分组：安全头段不输出");
ok(t.indexOf("防盗链") === -1, "空分组：防盗链段不输出");
ok(t.indexOf("敏感文件保护") === -1, "空分组：敏感保护段不输出");
ok(t.indexOf("\n\n\n") === -1, "空分组：无连续空行堆积");

/* ---------- 6. 301 多行：顺序与输入一致，非法行跳过 ---------- */
s = M.defaultState();
s.redirects = [
    { from: "/one", to: "https://example.com/1" },
    { from: "", to: "https://example.com/empty" },
    { from: "no-slash", to: "https://example.com/bad" },
    { from: "/two", to: "https://example.com/2" }
];
t = M.buildHtaccess(s);
ok(t.indexOf("Redirect 301 /one https://example.com/1") !== -1, "301：首行输出");
ok(t.indexOf("Redirect 301 /two https://example.com/2") !== -1, "301：末行输出");
ok(t.indexOf("/one") < t.indexOf("/two"), "301：顺序与输入一致");
ok(t.indexOf("no-slash") === -1, "301：缺 / 的源路径被跳过");
ok(t.indexOf("empty") === -1, "301：空源路径被跳过");

/* ---------- 7. 错误页：404/403 各一行，缺 / 路径跳过 ---------- */
s = M.defaultState();
s.errors = { e404: true, path404: "/404.html", e403: true, path403: "/403.html", e500: true, path500: "500.html" };
t = M.buildHtaccess(s);
ok(t.indexOf("ErrorDocument 404 /404.html") !== -1, "错误页：404 输出");
ok(t.indexOf("ErrorDocument 403 /403.html") !== -1, "错误页：403 输出");
ok(t.indexOf("ErrorDocument 500") === -1, "错误页：缺 / 的 500 路径被跳过");

/* ---------- 8. 防盗链：白名单、空 Referer、扩展名 ---------- */
s = M.defaultState();
s.hotlink = { enabled: true, allowEmpty: false, whitelist: ["example.com", "cdn.example.com"] };
t = M.buildHtaccess(s);
ok(t.indexOf("RewriteCond %{HTTP_REFERER} !^$") !== -1, "防盗链：不允许空 Referer 时输出 !^$ 条件");
ok(t.indexOf("example\\.com") !== -1, "防盗链：白名单域名输出（点号转义）");
ok(t.indexOf("cdn\\.example\\.com") !== -1, "防盗链：第二白名单域名输出");
ok(t.indexOf("jpg|jpeg|png|gif|webp|svg|mp4|mp3") !== -1, "防盗链：媒体扩展名齐全");
ok(t.indexOf("- [F]") !== -1, "防盗链：盗链返回 403");
s.hotlink.allowEmpty = true;
t = M.buildHtaccess(s);
ok(t.indexOf("RewriteCond %{HTTP_REFERER} !^$") === -1, "防盗链：允许空 Referer 时不输出 !^$ 条件");
eq(M.escapeDomain("a.b-c.com"), "a\\.b-c\\.com", "转义：域名点号转义、连字符不动");

/* ---------- 8b. 防盗链守卫（评审阻塞项修复）：空白名单绝不输出无条件 [F] ---------- */
s = M.defaultState();
s.hotlink = { enabled: true, allowEmpty: true, whitelist: [] };
t = M.buildHtaccess(s);
ok(t.indexOf("- [F]") === -1, "防盗链守卫：开启但 whitelist=[] 时不输出无条件媒体 [F] 行");
ok(t.indexOf("防盗链") === -1, "防盗链守卫：开启但 whitelist=[] 时整块跳过、无残留段");
s.hotlink = { enabled: true, allowEmpty: true, whitelist: ["", "  "] };
t = M.buildHtaccess(s);
ok(t.indexOf("- [F]") === -1, "防盗链守卫：仅空白字符串的白名单同样视为为空、不输出 [F]");
["security", "performance"].forEach(function (name) {
    var pt = M.buildHtaccess(M.applyPreset(name));
    ok(pt.indexOf("- [F]") === -1 || pt.indexOf("RewriteCond %{HTTP_REFERER}") !== -1,
        "防盗链守卫：预设 " + name + " 输出若含 [F] 则必含 RewriteCond（实测应无 [F]，因预设不再默认开启）");
    var hi = pt.indexOf("防盗链");
    ok(hi === -1 || pt.slice(hi).indexOf("RewriteCond %{HTTP_REFERER}") !== -1,
        "防盗链守卫：预设 " + name + " 的防盗链块若存在则必含至少一条 RewriteCond");
});
var secGuard = M.applyPreset("security");
ok(!secGuard.hotlink.enabled, "防盗链守卫：Security 预设不再默认开启防盗链");
var perfGuard = M.applyPreset("performance");
ok(!perfGuard.hotlink.enabled, "防盗链守卫：Performance 预设不再默认开启防盗链");
/* 守卫不误伤正常白名单：有白名单时仍输出带 RewriteCond 的 [F] 块 */
s = M.defaultState();
s.hotlink = { enabled: true, allowEmpty: true, whitelist: ["example.com"] };
t = M.buildHtaccess(s);
ok(t.indexOf("- [F]") !== -1 && t.indexOf("RewriteCond %{HTTP_REFERER}") !== -1, "防盗链守卫：有白名单时正常输出带 RewriteCond 的 [F] 块");

/* ---------- 9. 缓存压缩与安全头：子开关独立 ---------- */
s = M.defaultState(); s.cache = true;
t = M.buildHtaccess(s);
ok(t.indexOf("ExpiresActive On") !== -1 && t.indexOf("mod_deflate") === -1, "缓存：只开缓存不含压缩");
s = M.defaultState(); s.compress = true;
t = M.buildHtaccess(s);
ok(t.indexOf("mod_deflate") !== -1 && t.indexOf("ExpiresActive") === -1, "压缩：只开压缩不含缓存");
s = M.defaultState(); s.headers = { nosniff: true, frame: false, referrer: false };
t = M.buildHtaccess(s);
ok(t.indexOf("nosniff") !== -1 && t.indexOf("X-Frame-Options") === -1, "安全头：子开关独立");

/* ---------- 10. 敏感文件保护：Apache 2.4 语法 ---------- */
s = M.defaultState(); s.sensitive = true;
t = M.buildHtaccess(s);
ok(t.indexOf("Require all denied") !== -1, "敏感保护：Require all denied（Apache 2.4）");
ok(t.indexOf("\\.git/") !== -1 && t.indexOf("|env|") !== -1, "敏感保护：含 .git/.env（RedirectMatch 行 + FilesMatch 组）");
ok(t.indexOf("bak") !== -1, "敏感保护：含备份文件扩展名");

/* ---------- 11. 预设：4 组载入后开关与文本同步、可再改、重置回空 ---------- */
["minimal", "wordpress", "security", "performance"].forEach(function (name) {
    ok(!!M.HA_PRESETS[name], "预设存在: " + name);
    var ps = M.applyPreset(name);
    ok(M.buildHtaccess(ps) !== "", "预设输出非空: " + name);
});
var wp = M.applyPreset("wordpress");
ok(wp.https && wp.cache && wp.compress && wp.headers.nosniff && wp.sensitive, "预设 WordPress：开关同步");
ok(M.buildHtaccess(wp).indexOf("ExpiresActive On") !== -1, "预设 WordPress：文本同步含缓存");
wp.cache = false;
ok(M.buildHtaccess(wp).indexOf("ExpiresActive On") === -1, "预设：载入后可再改开关");
var sec = M.applyPreset("security");
ok(sec.headers.frame && !sec.hotlink.enabled && sec.www === "nonwww", "预设 Security：安全头/去 www 同步，防盗链不默认开启（空白名单）");
var perf = M.applyPreset("performance");
ok(perf.cache && perf.compress, "预设 Performance：缓存压缩同步");
eq(M.buildHtaccess(M.defaultState()), "", "重置：默认状态回空");
ok(M.applyPreset("no_such_preset").https === false, "预设：未知预设回默认空状态");

/* ---------- 12. 注册与零网络静态检查 ---------- */
ok(GO_SRC.indexOf('"htaccess_generator"') !== -1, "注册：categories.go 含 ID htaccess_generator");
ok(GO_SRC.indexOf('"/tools/htaccess-generator"') !== -1, "注册：categories.go 含 Path /tools/htaccess-generator");
ok(GO_SRC.indexOf('"settings"') !== -1, "注册：Icon settings");
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 177, "注册：Path 总数 176→177");
ok(TPL_SRC.indexOf("https://www.johnkingzcq123.xyz/tools/htaccess-generator") !== -1, "SEO：canonical 正确");
ok(TPL_SRC.indexOf("仅 Apache 2.4") !== -1, "真限制：仅 Apache 2.4 可见");
ok(TPL_SRC.indexOf("不适用 Nginx") !== -1, "真限制：不适用 Nginx 可见");
ok(TPL_SRC.indexOf("AllowOverride 未开启不生效") !== -1, "真限制：AllowOverride 可见");
ok(TPL_SRC.indexOf("生成前请备份原文件") !== -1, "真限制：备份原文件可见");
ok(TPL_SRC.indexOf("不直接写服务器文件") !== -1, "真限制：不直接写服务器文件可见");
ok(TPL_SRC.indexOf('data-ha-preset="minimal"') !== -1, "模板：Minimal 预设按钮存在");
ok(TPL_SRC.indexOf('data-ha-preset="wordpress"') !== -1, "模板：WordPress 预设按钮存在");
ok(TPL_SRC.indexOf('data-ha-preset="security"') !== -1, "模板：Security 预设按钮存在");
ok(TPL_SRC.indexOf('data-ha-preset="performance"') !== -1, "模板：Performance 预设按钮存在");
ok(TPL_SRC.indexOf("/tools/static/js/htaccess_generator.js") !== -1, "模板：引用本地 JS");
ok(!/fetch\s*\(|XMLHttpRequest/.test(JS_SRC), "零网络：JS 无 fetch/XHR");
ok(!/https?:\/\/(fonts|cdn|unpkg|cdnjs)/.test(TPL_SRC), "零 CDN：模板无外部 CDN（跟 User-Agent 解析器轮：不引 Google Fonts）");
ok(TPL_SRC.indexOf("复制失败") !== -1, "复制：失败降级提示文案存在");

console.log("htaccess_generator: pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
