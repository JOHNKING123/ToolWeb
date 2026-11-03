/* 摄像头/麦克风/扬声器检测纯逻辑单元测试（零依赖）：node tests/device_check.test.js
* 覆盖：calcVolumeLevel 确定性向量逐字（[1,-1,1,-1]→1、[0.5,-0.5,0.5,-0.5]→0.5、
* [0,0,0]→0、空数组 err.field='data'、钳制）、rmsToDb 确定性向量逐字
* （0.5→-6.0、1→0.0、0→-Infinity、'x' err.field='rms'）、shortenLabel 确定性向量
* 逐字（'USB Camera'/20 原样、'USB2.0 HD UVC WebCam'/12→'USB2.0 HD...'、
* 123 err.field='label'、非法 maxLen err.field='maxLen'）、window.DeviceCheck
* 与 module.exports 同步导出、注册（268→269 Path、ID/Path/Icon perm_camera_mic
* 全库唯一/Category 实用工具/New: true）、模板真限制五条文案与零网络请求、
* screen_recorder＋realtime_dictation 设备一条龙互链。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/device_check.js");

var pass = 0, fail = 0;
function ok(cond, name) {
if (cond) { pass++; }
else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（应包含 " + JSON.stringify(sub) + "）"); }
function notHas(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }
function throwsField(fn, field, name) {
try { fn(); }
catch (e) { eq(e && e.field, field, name); return; }
fail++; console.error("FAIL:", name + "（应抛错，未抛）");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "device_check.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "device_check.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. calcVolumeLevel 确定性向量 ---------- */
eq(M.calcVolumeLevel(new Float32Array([1, -1, 1, -1])), 1, "音量：[1,-1,1,-1]→1");
eq(M.calcVolumeLevel(new Float32Array([0.5, -0.5, 0.5, -0.5])), 0.5, "音量：[0.5,-0.5,0.5,-0.5]→0.5");
eq(M.calcVolumeLevel(new Float32Array([0, 0, 0])), 0, "音量：[0,0,0]→0");
throwsField(function () { M.calcVolumeLevel([]); }, "data", "契约：calcVolumeLevel 空数组 err.field=data");
throwsField(function () { M.calcVolumeLevel(null); }, "data", "契约：calcVolumeLevel null err.field=data");
throwsField(function () { M.calcVolumeLevel("x"); }, "data", "契约：calcVolumeLevel 字符串 err.field=data");
throwsField(function () { M.calcVolumeLevel(new Float32Array([1, NaN])); }, "data", "契约：calcVolumeLevel NaN 采样 err.field=data");
eq(M.calcVolumeLevel(new Float32Array([2, -2])), 1, "音量：超 1 钳制→1");
ok(M.calcVolumeLevel(new Float32Array([0.25, -0.25])) >= 0 && M.calcVolumeLevel(new Float32Array([0.25, -0.25])) <= 1, "音量：结果落在 0~1");

/* ---------- 2. rmsToDb 确定性向量 ---------- */
eq(M.rmsToDb(0.5), -6.0, "dB：rmsToDb(0.5)→-6.0");
eq(M.rmsToDb(1), 0.0, "dB：rmsToDb(1)→0.0");
eq(M.rmsToDb(0), -Infinity, "dB：rmsToDb(0)→-Infinity（静音）");
throwsField(function () { M.rmsToDb("x"); }, "rms", "契约：rmsToDb('x') err.field=rms");
throwsField(function () { M.rmsToDb(NaN); }, "rms", "契约：rmsToDb(NaN) err.field=rms");
throwsField(function () { M.rmsToDb(-1); }, "rms", "契约：rmsToDb(-1) err.field=rms");

/* ---------- 3. shortenLabel 确定性向量 ---------- */
eq(M.shortenLabel("USB Camera", 20), "USB Camera", "截断：不超长原样返回");
eq(M.shortenLabel("USB2.0 HD UVC WebCam", 12), "USB2.0 HD...", "截断：超长 slice(0,maxLen-3)+'...'");
throwsField(function () { M.shortenLabel(123, 10); }, "label", "契约：shortenLabel(123,10) err.field=label");
throwsField(function () { M.shortenLabel(null, 10); }, "label", "契约：shortenLabel null err.field=label");
throwsField(function () { M.shortenLabel("abc", 3); }, "maxLen", "契约：maxLen<4 err.field=maxLen");
throwsField(function () { M.shortenLabel("abc", "x"); }, "maxLen", "契约：maxLen 非数字 err.field=maxLen");
eq(M.shortenLabel("abcd", 4), "abcd", "截断：恰等于 maxLen 不截");
eq(M.shortenLabel("abcde", 4), "a...", "截断：maxLen=4 边界→'a...'");
eq(M.shortenLabel("USB2.0 HD UVC WebCam", 12).length, 12, "截断：结果长度恰为 maxLen");

/* ---------- 4. 导出契约 ---------- */
eq(typeof M.calcVolumeLevel, "function", "导出：calcVolumeLevel 为函数");
eq(typeof M.rmsToDb, "function", "导出：rmsToDb 为函数");
eq(typeof M.shortenLabel, "function", "导出：shortenLabel 为函数");
eq(M.TONE_MS, 2000, "导出：测试音时长 TONE_MS=2000（各 2 秒）");
has(JS_SRC, "window.DeviceCheck", "挂载：window.DeviceCheck");

/* ---------- 5. 注册 ---------- */
has(GO_SRC, "\"device_check\"", "注册：ID device_check");
has(GO_SRC, "\"/tools/device-check\"", "注册：Path /tools/device-check");
var iconHits = (GO_SRC.match(/"perm_camera_mic"/g) || []).length;
eq(iconHits, 1, "注册：Icon perm_camera_mic 全库唯一（复测锁定）");
var regBlock = GO_SRC.split("\"device_check\"")[1].split("},")[0];
has(regBlock, "Category:    \"实用工具\"", "注册：Category 实用工具");
has(regBlock, "New:         true", "注册：New: true");
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 285, "注册：Path 总数 268→270");
notHas(GO_SRC.match(/"\/tools\/[^"]+"/g).join(" "), "/tools/device-check\", \"/tools/device-check", "注册：Path 无重复");

/* ---------- 6. 模板：真限制五条 ---------- */
has(TPL_SRC, "需浏览器授权", "真限制①：需浏览器授权文案");
has(TPL_SRC, "HTTPS", "真限制②：HTTPS 安全上下文文案");
has(TPL_SRC, "localhost", "真限制②：localhost 文案");
has(TPL_SRC, "同一时间只能被一个应用占用", "真限制③：设备独占文案");
has(TPL_SRC, "Safari", "真限制④：Safari 文案");
has(TPL_SRC, "iOS", "真限制④：iOS 文案");
has(TPL_SRC, "纯本地零上传", "真限制⑤：纯本地零上传文案");
has(TPL_SRC, "Network", "真限制⑤：Network 面板自证文案");
has(TPL_SRC, "device_check.js", "模板：JS 文件引用");
has(TPL_SRC, "device-check", "模板：canonical 与标识含 device-check");
has(TPL_SRC, "\"@type\":\"SoftwareApplication\"", "SEO：JSON-LD SoftwareApplication");
has(TPL_SRC, "<meta property=\"og:title\"", "SEO：OG 标签");

/* ---------- 7. 互链：设备一条龙 ---------- */
has(TPL_SRC, "/tools/screen-recorder", "互链：screen_recorder");
has(TPL_SRC, "/tools/realtime-dictation", "互链：realtime_dictation");
has(TPL_SRC, "设备一条龙", "互链：设备一条龙文案");

/* ---------- 8. 零网络请求 ---------- */
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(JS_SRC, "new WebSocket", "零网络：JS 无 WebSocket");
notHas(JS_SRC, "sendBeacon", "零网络：JS 无 Beacon");
notHas(TPL_SRC, "fetch(", "零网络：模板无 fetch");
notHas(TPL_SRC, "http://", "零 CDN：模板无 http 外链");
notHas(TPL_SRC, "https://fonts.googleapis", "零 CDN：模板无字体 CDN");
has(JS_SRC, "textContent", "渲染：用 textContent 防 HTML 执行");
has(JS_SRC, "getUserMedia", "功能：getUserMedia 摄像头/麦克风");
has(JS_SRC, "enumerateDevices", "功能：enumerateDevices 设备枚举");
has(JS_SRC, "AnalyserNode", "功能：AnalyserNode 音量分析");
has(JS_SRC, "StereoPanner", "功能：StereoPanner 左右声道");

console.log("device_check: pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);
