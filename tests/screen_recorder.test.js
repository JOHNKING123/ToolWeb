/* 在线录屏工具（screen_recorder）纯逻辑单元测试（零依赖）：
 * node tests/screen_recorder.test.js
 * 覆盖：formatDuration 确定性向量逐值命中（0→00:00:00、65000→00:01:05、
 * 3661000→01:01:01）与非法参数抛 Error（err.field="ms"）、pickMimeType 首选
 * 可用 mime／无可用抛 Error（err.field="mimeType"）／candidates/isSupported 非法
 * 参数、buildDownloadName 确定性向量（new Date(2026,9,31,15,0,0)→
 * screen-record-20261031-150000.webm）与 ext/date 非法、extensionFor webm/mp4
 * 映射与未知 mime、formatFileSize 向量、recorderTransition 状态机转移表
 * （空闲→录制→暂停→结束→空闲）与非法转移、BITRATE_LEVELS/MIME_CANDIDATES
 * 常量、categories.go 注册（Path 总数 244→245、Icon screen_record、图片处理、
 * New、中英文 Description）、模板 SEO 面板／真限制四条／互链
 * （GIF 压缩优化器双向、视频帧提取器单向链入）／不链未交付工具、
 * 零网络请求静态检查。
 */
"use strict";
var fs = require("fs");
var path = require("path");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function throwsField(fn, field, name) {
  try { fn(); } catch (e) {
    ok(e instanceof Error && e.field === field,
      name + "（期望抛 Error 且 err.field=" + JSON.stringify(field) + "，实得 " +
      (e instanceof Error ? "Error field=" + JSON.stringify(e.field) : typeof e) + "）");
    return;
  }
  fail++; console.error("FAIL:", name + "（未抛出异常）");
}
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name); }

var M = require("../static/js/screen_recorder.js");
var ROOT = path.join(__dirname, "..");

/* ---------- 1. formatDuration 确定性向量 ---------- */
eq(M.formatDuration(0), "00:00:00", "向量：formatDuration(0)→'00:00:00'");
eq(M.formatDuration(65000), "00:01:05", "向量：formatDuration(65000)→'00:01:05'");
eq(M.formatDuration(3661000), "01:01:01", "向量：formatDuration(3661000)→'01:01:01'");
eq(M.formatDuration(59999), "00:00:59", "向量：formatDuration(59999)→'00:00:59'（向下取整）");
eq(M.formatDuration(3600000), "01:00:00", "向量：formatDuration(3600000)→'01:00:00'");
eq(M.formatDuration(90061000), "25:01:01", "向量：formatDuration(90061000)→'25:01:01'（小时不截断）");
throwsField(function () { M.formatDuration(-1); }, "ms", "非法：formatDuration(-1) 抛 Error（err.field=ms）");
throwsField(function () { M.formatDuration(NaN); }, "ms", "非法：formatDuration(NaN) 抛 Error（err.field=ms）");
throwsField(function () { M.formatDuration(Infinity); }, "ms", "非法：formatDuration(Infinity) 抛 Error（err.field=ms）");
throwsField(function () { M.formatDuration("60000"); }, "ms", "非法：formatDuration('60000') 抛 Error（err.field=ms）");
throwsField(function () { M.formatDuration(undefined); }, "ms", "非法：formatDuration(undefined) 抛 Error（err.field=ms）");

/* ---------- 2. pickMimeType ---------- */
eq(M.pickMimeType(["video/webm;codecs=vp9", "video/webm"], function (c) { return c.indexOf("vp9") !== -1; }),
  "video/webm;codecs=vp9", "向量：pickMimeType 首选可用 mime");
eq(M.pickMimeType(["a", "b"], function (c) { return c === "b"; }), "b",
  "向量：pickMimeType 跳过不可用取首个可用");
throwsField(function () { M.pickMimeType(["a"], function () { return false; }); }, "mimeType",
  "非法：pickMimeType 无可用 mime 抛 Error（err.field=mimeType）");
throwsField(function () { M.pickMimeType([], function () { return true; }); }, "mimeType",
  "非法：pickMimeType 空数组抛 Error（err.field=mimeType）");
throwsField(function () { M.pickMimeType("x", function () { return true; }); }, "candidates",
  "非法：pickMimeType('x',…) 抛 Error（err.field=candidates）");
throwsField(function () { M.pickMimeType(["a"], "not-fn"); }, "isSupported",
  "非法：pickMimeType isSupported 非函数抛 Error（err.field=isSupported）");

/* ---------- 3. buildDownloadName 确定性向量 ---------- */
var D = new Date(2026, 9, 31, 15, 0, 0);
eq(M.buildDownloadName(D), "screen-record-20261031-150000.webm",
  "向量：buildDownloadName(new Date(2026,9,31,15,0,0))→'screen-record-20261031-150000.webm'");
eq(M.buildDownloadName(D, "mp4"), "screen-record-20261031-150000.mp4",
  "向量：buildDownloadName(d,'mp4')→'…150000.mp4'");
ok(/^screen-record-\d{8}-\d{6}\.webm$/.test(M.buildDownloadName()),
  "默认：buildDownloadName() 用当前时间且默认 webm 后缀");
throwsField(function () { M.buildDownloadName(D, "a/b"); }, "ext",
  "非法：buildDownloadName(d,'a/b') 抛 Error（err.field=ext）");
throwsField(function () { M.buildDownloadName(D, ""); }, "ext",
  "非法：buildDownloadName(d,'') 抛 Error（err.field=ext）");
throwsField(function () { M.buildDownloadName(D, "w ebm"); }, "ext",
  "非法：buildDownloadName(d,'w ebm') 抛 Error（err.field=ext）");
throwsField(function () { M.buildDownloadName("2026-10-31"); }, "date",
  "非法：buildDownloadName('2026-10-31') 抛 Error（err.field=date）");
throwsField(function () { M.buildDownloadName(new Date(NaN)); }, "date",
  "非法：buildDownloadName(非法 Date) 抛 Error（err.field=date）");

/* ---------- 4. extensionFor ---------- */
eq(M.extensionFor("video/webm;codecs=vp9"), "webm", "向量：extensionFor('video/webm;codecs=vp9')→'webm'");
eq(M.extensionFor("video/webm"), "webm", "向量：extensionFor('video/webm')→'webm'");
eq(M.extensionFor("video/mp4"), "mp4", "向量：extensionFor('video/mp4')→'mp4'");
eq(M.extensionFor("video/mp4;codecs=avc1"), "mp4", "向量：extensionFor('video/mp4;codecs=avc1')→'mp4'");
throwsField(function () { M.extensionFor("video/ogg"); }, "mime",
  "非法：extensionFor('video/ogg') 抛 Error（err.field=mime）");
throwsField(function () { M.extensionFor(123); }, "mime",
  "非法：extensionFor(123) 抛 Error（err.field=mime）");

/* ---------- 5. formatFileSize ---------- */
eq(M.formatFileSize(0), "0 B", "向量：formatFileSize(0)→'0 B'");
eq(M.formatFileSize(512), "512 B", "向量：formatFileSize(512)→'512 B'");
eq(M.formatFileSize(1024), "1.0 KB", "向量：formatFileSize(1024)→'1.0 KB'");
eq(M.formatFileSize(1536), "1.5 KB", "向量：formatFileSize(1536)→'1.5 KB'");
eq(M.formatFileSize(1048576), "1.0 MB", "向量：formatFileSize(1048576)→'1.0 MB'");
throwsField(function () { M.formatFileSize(-1); }, "bytes",
  "非法：formatFileSize(-1) 抛 Error（err.field=bytes）");

/* ---------- 6. recorderTransition 状态机 ---------- */
eq(M.recorderTransition("idle", "start"), "recording", "状态机：idle+start→recording");
eq(M.recorderTransition("recording", "pause"), "paused", "状态机：recording+pause→paused");
eq(M.recorderTransition("paused", "resume"), "recording", "状态机：paused+resume→recording");
eq(M.recorderTransition("recording", "stop"), "stopped", "状态机：recording+stop→stopped");
eq(M.recorderTransition("paused", "stop"), "stopped", "状态机：paused+stop→stopped");
eq(M.recorderTransition("stopped", "reset"), "idle", "状态机：stopped+reset→idle（重新录制）");
throwsField(function () { M.recorderTransition("idle", "pause"); }, "transition",
  "非法转移：idle+pause 抛 Error（err.field=transition）");
throwsField(function () { M.recorderTransition("recording", "start"); }, "transition",
  "非法转移：recording+start 抛 Error（err.field=transition）");
throwsField(function () { M.recorderTransition("stopped", "stop"); }, "transition",
  "非法转移：stopped+stop 抛 Error（err.field=transition）");
throwsField(function () { M.recorderTransition("bogus", "start"); }, "state",
  "非法状态：recorderTransition('bogus',…) 抛 Error（err.field=state）");
throwsField(function () { M.recorderTransition("idle", "bogus"); }, "transition",
  "未知动作名：idle+'bogus' 抛 Error（err.field=transition）");
throwsField(function () { M.recorderTransition("idle", 42); }, "action",
  "非法动作类型：recorderTransition('idle',42) 抛 Error（err.field=action）");

/* ---------- 7. 常量 ---------- */
eq(M.MIME_CANDIDATES.length, 4, "常量：MIME_CANDIDATES 4 个候选");
ok(M.MIME_CANDIDATES.indexOf("video/webm;codecs=vp9") !== -1, "常量：MIME_CANDIDATES 含 vp9 首选");
eq(M.BITRATE_LEVELS.length, 3, "常量：BITRATE_LEVELS 三档比特率");
eq(M.BITRATE_LEVELS[1].bps, 2500000, "常量：中档比特率 2.5Mbps");
ok(M.BITRATE_LEVELS.every(function (l) { return l.id && l.label && l.bps > 0; }),
  "常量：三档均有 id/label/bps");

/* ---------- 8. categories.go 注册 ---------- */
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var srIdx = GO_SRC.indexOf('"screen_recorder"');
ok(srIdx >= 0, "注册：categories.go 含 ID screen_recorder");
ok(GO_SRC.indexOf('"/tools/screen-recorder"') >= 0, "注册 Path /tools/screen-recorder");
ok(GO_SRC.slice(srIdx, srIdx + 1200).indexOf('Icon:        "screen_record"') >= 0, "注册 Icon screen_record");
ok(GO_SRC.slice(srIdx, srIdx + 1200).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(srIdx, srIdx + 1200).indexOf('Category:    "图片处理"') >= 0, "注册 Category 为图片处理");
ok(GO_SRC.slice(srIdx, srIdx + 2000).indexOf("screen recorder") >= 0, "Description 中英文双语（含英文）");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 245, "注册 Path 总数 244→245");

/* ---------- 9. 模板：SEO／真限制／互链／零网络 ---------- */
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "screen_recorder.html"), "utf8");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "screen_recorder.js"), "utf8");
var GC_TPL = fs.readFileSync(path.join(ROOT, "templates", "gif_compress.html"), "utf8");
has(TPL_SRC, "{{define \"screen_recorder\"}}", "模板 define 名与路由 screen-recorder 对应");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/screen-recorder", "模板 canonical 含新 Path");
has(TPL_SRC, '"url":"https://www.johnkingzcq123.xyz/tools/screen-recorder"', "模板 JSON-LD 含新 Path");
has(TPL_SRC, "在线录屏", "模板 SEO keywords 含在线录屏");
has(TPL_SRC, "必须经浏览器弹窗授权屏幕共享", "真限制①：弹窗授权");
has(TPL_SRC, "输出容器/编码取决于浏览器", "真限制②：输出格式取决于浏览器＋能力检测明示");
has(TPL_SRC, "系统音频录制受限", "真限制③：系统音频受限");
has(TPL_SRC, "零上传", "真限制④：零上传＋隐私提醒");
has(TPL_SRC, "/tools/gif-compress", "互链：GIF 压缩优化器（去向）");
has(TPL_SRC, "/tools/video-frame-extractor", "互链：视频帧提取器（单向链入）");
has(GC_TPL, "/tools/screen-recorder", "双向互链：GIF 压缩优化器模板回链在线录屏工具");
notHas(TPL_SRC, "简繁", "不链未交付工具：无简繁互转");
notHas(TPL_SRC, "kotlin", "不链未交付工具：无 JSON→Kotlin");
has(TPL_SRC, "sr-start", "模板含开始按钮 sr-start");
has(TPL_SRC, "sr-preview", "模板含实时预览 sr-preview");
has(TPL_SRC, "sr-timer", "模板含计时器 sr-timer");
has(TPL_SRC, "sr-pause", "模板含暂停按钮 sr-pause");
has(TPL_SRC, "sr-stop", "模板含结束按钮 sr-stop");
has(TPL_SRC, "sr-playback", "模板含回放区 sr-playback");
has(TPL_SRC, "sr-download", "模板含下载按钮 sr-download");
has(TPL_SRC, "screen_recorder.js?v=1", "模板引用外部 JS");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL_SRC, "http://", "模板无 http 外链（零外部请求）");

console.log("PASS " + pass + " / FAIL " + fail);
if (fail > 0) process.exit(1);
