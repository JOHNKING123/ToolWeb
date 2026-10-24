/* 网速测试（speed_test）纯逻辑单元测试（零依赖）：
 * node tests/speed_test.test.js
 * 覆盖：统计函数（中位数/均值/抖动）、单位换算（Mbps/MB-s）、
 * 档位选择边界、评级档位边界、历史记录常量、模板静态检查
 * （SEO 面板、必需 DOM id、四项文案齐全、JS 引用）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var S = require("../static/js/speed_test.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "speed_test.js"), "utf8");
var TPL = fs.readFileSync(path.join(__dirname, "..", "templates", "speed_test.html"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function approx(a, b, eps, name) { ok(Math.abs(a - b) <= eps, name + "（期望≈" + b + "，实得 " + a + "）"); }

/* ---------- 1. 中位数 ---------- */
eq(S.median([3, 1, 2]), 2, "中位数奇数");
eq(S.median([4, 1, 3, 2]), 2.5, "中位数偶数取均值");
eq(S.median([5]), 5, "中位数单元素");
eq(S.median([]), 0, "中位数空数组=0");
var o = [3, 1, 2]; S.median(o); eq(o.join(","), "3,1,2", "中位数不改变原数组");

/* ---------- 2. 均值 ---------- */
eq(S.mean([1, 2, 3, 4]), 2.5, "均值");
eq(S.mean([]), 0, "均值空数组=0");

/* ---------- 3. 抖动 ---------- */
approx(S.jitterOf([10, 12, 10, 14]), 8 / 3, 1e-9, "抖动=(2+2+4)/3");
eq(S.jitterOf([10, 10, 10]), 0, "抖动全等=0");
eq(S.jitterOf([10]), 0, "抖动单采样=0");
eq(S.jitterOf([]), 0, "抖动空=0");

/* ---------- 4. 速率换算 ---------- */
/* 100 Mbps 线路 1 秒应传 12.5×10^6 字节（网络口径按 1000 进制） */
approx(S.mbpsOf(12.5e6, 1), 100, 0.01, "mbpsOf：12.5e6字节/1s=100Mbps");
eq(S.mbpsOf(1000, 0), 0, "mbpsOf 秒数0=0");
eq(S.mbpsOf(1000, -1), 0, "mbpsOf 负秒=0");
approx(S.mbsOf(12.5 * 1024 * 1024, 1), 12.5, 0.001, "mbsOf：12.5MB/1s=12.5MB/s");
eq(S.mbsOf(1000, 0), 0, "mbsOf 秒数0=0");
var bytes = 25 * 1024 * 1024, secs = 20;
/* 自洽：Mbps = MB/s × 8 × 1.048576（MiB 与 10^6 bit 之差） */
approx(S.mbpsOf(bytes, secs), S.mbsOf(bytes, secs) * 8 * 1.048576, 0.0001, "Mbps 与 MB/s 自洽换算");
/* 100Mbps 时 MB/s 应为 11.92（100e6/8/2^20） */
approx(S.mbpsOf(11.92 * 1024 * 1024, 1), 100, 0.05, "11.92MB/s ≈ 100Mbps");

/* ---------- 5. fmt1 ---------- */
eq(S.fmt1(12.34), "12.3", "fmt1 保留1位");
eq(S.fmt1(100), "100.0", "fmt1 整数补0");

/* ---------- 6. 正式档选择边界 ---------- */
eq(S.PREHEAT_THRESHOLD_MBPS, 20, "预热阈值=20Mbps");
eq(S.chooseFormalSizeMB(20), 25, "预热恰20→25MB档");
eq(S.chooseFormalSizeMB(19.9), 10, "预热19.9→10MB档");
eq(S.chooseFormalSizeMB(200), 25, "预热200→25MB档");
eq(S.chooseFormalSizeMB(0.5), 10, "预热0.5→10MB档");

/* ---------- 7. 评级档位边界 ---------- */
eq(S.rateTier(100).tier, "optical", "100→光纤档");
eq(S.rateTier(99.9).tier, "4k", "99.9→4K档");
eq(S.rateTier(25).tier, "4k", "25→4K档");
eq(S.rateTier(24.9).tier, "hd", "24.9→高清档");
eq(S.rateTier(10).tier, "hd", "10→高清档");
eq(S.rateTier(9.9).tier, "basic", "9.9→基础档");
eq(S.rateTier(0).tier, "basic", "0→基础档");
ok(S.rateTier(100).advice.length > 0 && S.rateTier(9).advice.length > 0, "各档都有建议文案");
ok(["光纤档", "4K 流畅档", "高清档", "基础档"].indexOf(S.rateTier(150).label) !== -1, "150Mbps label=光纤档");

/* ---------- 8. 常量 ---------- */
eq(S.LAT_SAMPLES, 20, "延迟采样数=20");
eq(S.HISTORY_MAX, 10, "历史记录上限=10");

/* ---------- 9. JS 源码静态检查 ---------- */
ok(SRC.indexOf('"/tools/api/speed-test/download"') !== -1, "JS 引用下载端点");
ok(SRC.indexOf('"/tools/api/speed-test/upload"') !== -1, "JS 引用上传端点");
ok(SRC.indexOf("visibilitychange") !== -1, "JS 监听切后台");
ok(SRC.indexOf("localStorage") !== -1, "JS 用 localStorage 存历史");

/* ---------- 10. 模板静态检查：SEO 面板 ---------- */
ok(TPL.indexOf("<title>网速测试") === 0 || TPL.indexOf("<title>网速测试") !== -1, "模板含 title");
ok(TPL.indexOf('name="description"') !== -1, "模板含 meta description");
ok(TPL.indexOf('name="keywords"') !== -1, "模板含 meta keywords");
ok(TPL.indexOf('rel="canonical" href="https://www.johnkingzcq123.xyz/tools/speed-test"') !== -1, "canonical 正确");
ok(TPL.indexOf('og:title') !== -1 && TPL.indexOf('og:description') !== -1 && TPL.indexOf('og:url') !== -1, "OG 三件套");
ok(TPL.indexOf('application/ld+json') !== -1, "模板含 JSON-LD");
ok(TPL.indexOf("常见问题") !== -1, "模板含 FAQ");
ok(TPL.indexOf("相关工具") !== -1, "模板含相关工具");
ok(TPL.indexOf("使用说明") !== -1, "模板含使用说明");
ok(TPL.indexOf('<script src="/tools/static/js/speed_test.js') !== -1, "模板引用 speed_test.js");

/* ---------- 11. 模板静态检查：必需 DOM id ---------- */
["st-step1", "st-step2", "st-step3", "st-bar1", "st-bar2", "st-bar3",
 "st-label1", "st-label2", "st-label3", "st-big1", "st-big2", "st-big3",
 "st-msg1", "st-msg2", "st-msg3", "st-msg4", "st-curve-dl", "st-curve-ul",
 "st-start", "st-result", "st-r-dl", "st-r-dl-mbs", "st-r-ul", "st-r-ul-mbs",
 "st-r-lat", "st-r-jit", "st-r-tier", "st-r-advice",
 "st-history-list", "st-history-empty", "st-clear-history"
].forEach(function (id) {
    ok(TPL.indexOf('id="' + id + '"') !== -1, "模板含 id=" + id);
});

/* ---------- 12. 模板静态检查：四项文案齐全 ---------- */
ok(TPL.indexOf("流量消耗提示") !== -1 && TPL.indexOf("25MB") !== -1, "文案：流量消耗提示");
ok(TPL.indexOf("Mbps") !== -1 && TPL.indexOf("MB/s") !== -1 && TPL.indexOf("÷ 8") !== -1, "文案：Mbps/MB/s 双单位说明");
ok(TPL.indexOf("到本站服务器") !== -1 || TPL.indexOf("到本站") !== -1, "文案：免责声明（测到本站链路）");
ok(TPL.indexOf("代理/VPN") !== -1, "文案：代理/VPN 脚注");

console.log("\n通过 " + pass + " / " + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
