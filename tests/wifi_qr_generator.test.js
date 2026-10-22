/* WiFi 二维码生成器纯逻辑单元测试（零依赖）：node tests/wifi_qr_generator.test.js
 * 覆盖：协议串构建与转义、中文 SSID、WPA2 示例、nopass 省略 P 段、隐藏网络 H:true、
 * 校验（空 SSID/空密码/长度规则）禁用生成、二维码矩阵/SVG 与协议串一致、源码零 fetch/XHR。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var wqr = require("../static/js/wifi_qr_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

/* ---------- 协议串构建 ---------- */
eq(wqr.buildWifiPayload("Office-Guest", "wpa", "Welcome2026", false),
    "WIFI:T:WPA;S:Office-Guest;P:Welcome2026;;",
    "WPA2 示例协议串");

eq(wqr.buildWifiPayload("Office-Guest", "wpa", "Welcome2026", true),
    "WIFI:T:WPA;S:Office-Guest;P:Welcome2026;H:true;;",
    "隐藏网络追加 H:true");

eq(wqr.buildWifiPayload("GuestWiFi", "nopass", "", false),
    "WIFI:T:nopass;S:GuestWiFi;;",
    "无密码网络省略 P 段");

eq(wqr.buildWifiPayload("GuestWiFi", "nopass", "", true),
    "WIFI:T:nopass;S:GuestWiFi;H:true;;",
    "无密码+隐藏网络");

eq(wqr.buildWifiPayload("MyNet", "wep", "abcde", false),
    "WIFI:T:WEP;S:MyNet;P:abcde;;",
    "WEP 映射为 WEP");

/* ---------- 特殊字符转义 ---------- */
eq(wqr.escapeWifiField('a;b,c:d"e\\f'), "a\\;b\\,c\\:d\\\"e\\\\f", "转义 \\ ; , : \"");
eq(wqr.buildWifiPayload("A;B,C:D", "wpa", 'p"x\\y', false),
    "WIFI:T:WPA;S:A\\;B\\,C\\:D;P:p\\\"x\\\\y;;",
    "SSID/密码特殊字符正确转义");

/* ---------- 中文 SSID 明文 ---------- */
var cnPayload = wqr.buildWifiPayload("咖啡店WiFi", "wpa", "coffee2026", false);
eq(cnPayload, "WIFI:T:WPA;S:咖啡店WiFi;P:coffee2026;;", "中文 SSID 明文输出不转义");

/* ---------- 校验 ---------- */
var v1 = wqr.validateWifi({ ssid: "", auth: "wpa", password: "12345678" });
ok(!v1.valid && v1.errors.some(function (e) { return e.key === "ssid"; }), "空 SSID → 不通过且定位 ssid");

var v2 = wqr.validateWifi({ ssid: "Home", auth: "wpa", password: "" });
ok(!v2.valid && v2.errors.some(function (e) { return e.key === "password"; }), "WPA 空密码 → 不通过且定位 password");

var v3 = wqr.validateWifi({ ssid: "Home", auth: "wpa", password: "1234567" });
ok(!v3.valid, "WPA 密码 7 位 → 不通过");
var v4 = wqr.validateWifi({ ssid: "Home", auth: "wpa", password: "12345678" });
ok(v4.valid, "WPA 密码 8 位 → 通过");
var v5 = wqr.validateWifi({ ssid: "Home", auth: "wpa", password: "g".repeat(64) });
ok(!v5.valid, "WPA 密码 64 位非十六进制 → 不通过");
var v6 = wqr.validateWifi({ ssid: "Home", auth: "wpa", password: "a1".repeat(32) });
ok(v6.valid, "WPA 密码 64 位十六进制 → 通过");

var v7 = wqr.validateWifi({ ssid: "Open", auth: "nopass", password: "" });
ok(v7.valid, "无密码网络空密码 → 通过");

var v8 = wqr.validateWifi({ ssid: "Old", auth: "wep", password: "abcde" });
ok(v8.valid, "WEP 5 位 ASCII → 通过");
var v9 = wqr.validateWifi({ ssid: "Old", auth: "wep", password: "abcd" });
ok(!v9.valid, "WEP 4 位 → 不通过");

var longSsid = "中".repeat(11); /* 11×3=33 字节 */
var v10 = wqr.validateWifi({ ssid: longSsid, auth: "nopass", password: "" });
ok(!v10.valid, "SSID 超 32 字节 → 不通过");

/* ---------- 二维码矩阵 / SVG ---------- */
ok(typeof wqr.getQrEngine() === "function", "二维码引擎（vendored）在 Node 可加载");
var payload = "WIFI:T:WPA;S:Office-Guest;P:Welcome2026;;";
var m1 = wqr.makeQrMatrix(payload, "M");
var m2 = wqr.makeQrMatrix(payload, "Q");
ok(m1.count > 0 && m2.count > 0, "M/Q 容错均可生成矩阵");
ok(m2.count >= m1.count, "Q 容错版本不小于 M");
/* 定位图案一致性：左上 7×7 定位符 */
ok(m1.isDark(0, 0) && !m1.isDark(1, 1) && m1.isDark(3, 3), "定位符基本形态（外框深/内圈浅/中心深）");
var svg = wqr.matrixToSvg(m1, { size: 512, fg: "#111111", bg: "#ffffff" });
ok(svg.indexOf("<svg") === 0 && svg.indexOf('xmlns="http://www.w3.org/2000/svg"') !== -1,
    "SVG 有 xmlns 可直接渲染");
ok(svg.indexOf('fill="#111111"') !== -1 && svg.indexOf('fill="#ffffff"') !== -1,
    "SVG 前景/背景色生效");
ok(svg.indexOf("</svg>") !== -1, "SVG 闭合完整");
/* SVG 只与协议串有关：同一载荷两次生成一致 */
var svg2 = wqr.matrixToSvg(wqr.makeQrMatrix(payload, "M"), { size: 512, fg: "#111111", bg: "#ffffff" });
eq(svg, svg2, "同一协议串 SVG 输出稳定一致");

/* 中文载荷也能生成有效矩阵 */
var mcn = wqr.makeQrMatrix(cnPayload, "Q");
ok(mcn.count >= 21, "中文 SSID 载荷生成有效矩阵");

/* ---------- 源码零 fetch/XHR ---------- */
var src = fs.readFileSync(path.join(__dirname, "..", "static", "js", "wifi_qr_generator.js"), "utf8");
ok(!/fetch\s*\(/.test(src), "源码无 fetch(");
ok(!/XMLHttpRequest/.test(src), "源码无 XMLHttpRequest");
ok(/qrcode-generator-1\.4\.4\.min\.js/.test(src) || /getQrEngine/.test(src), "二维码走本地引擎");

console.log("\n通过 " + pass + " / " + (pass + fail) + "，失败 " + fail);
process.exit(fail ? 1 : 0);
