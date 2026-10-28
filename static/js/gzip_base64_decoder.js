/* Gzip Base64 解码器：粘贴 Base64 → 归一化 → 解码 → 校验 gzip 魔数 → DecompressionStream('gzip') 解压 → UTF-8 原文输出
* 零第三方依赖、零网络请求（无外部调用、无上传），全部在浏览器本地完成。
* 纯逻辑部分（归一化 / 解码 / 魔数判定 / 解压 / 反向压缩）经由 module.exports 暴露，
* 供 node tests/gzip_base64_decoder.test.js 做单元测试。
* 用法（浏览器）：页面引入后自动初始化 #gbd-* 控件。
* 失败 stage 取值：normalize（归一化）/ decode（Base64 解码）/ gzip（魔数、损坏、超限）/ utf8（非 UTF-8 文本）/ unsupported（浏览器不支持）。
*/
(function () {
"use strict";

/* ================= 常量 ================= */
var MAX_GZIP_BYTES = 10 * 1024 * 1024; // gzip 字节上限 10MB
var MAX_TEXT_BYTES = 10 * 1024 * 1024; // 解压后文本字节上限 10MB
var SAMPLE_GZIP_BASE64 = "H4sIAAAAAAAAA/NIzcnJ11EIyc/PCU9NUuQCAInvfO4QAAAA"; // 解出 "Hello, ToolWeb!\n"
var SAMPLE_TEXT = "Hello, ToolWeb!\n";
var EXPORT_FILENAME = "gzip-decoded.txt";

function hasDOM() {
return typeof document!== "undefined" && typeof window!== "undefined";
}

function stagedError(stage, message, position, ch) {
var err = new Error(message);
err.stage = stage;
if (position!== undefined) err.position = position;
if (ch!== undefined) err.char = ch;
return err;
}

/* ================= Base64 归一化 =================
* 去空白（含换行/空格）→ 剥 data:*;base64, 前缀 → url-safe -/_ 转回 +/ → 补 = 至 4 的倍数。
* 首个非法字符抛错并给出在清洗后字符串中的 1-based 位置（不静默丢弃）。
*/
function normalizeBase64(input) {
if (typeof input!== "string") throw stagedError("normalize", "输入不是文本");
var s = input.replace(/\s+/g, "");
var m = s.match(/^data:[^,]*;base64,/i);
if (m) s = s.slice(m[0].length);
if (!s) throw stagedError("normalize", "输入为空，请输入 gzip 压缩后的 Base64 文本");
s = s.replace(/-/g, "+").replace(/_/g, "/");
var i, ch;
for (i = 0; i < s.length; i++) {
ch = s.charAt(i);
if (!/[A-Za-z0-9+\/=]/.test(ch)) {
throw stagedError("normalize", "第 " + (i + 1) + " 个字符非法（'" + ch + "'）：Base64 只允许 A-Z、a-z、0-9、+、/ 与结尾的 =", i + 1, ch);
}
}
var firstPad = s.indexOf("=");
if (firstPad >= 0) {
var padPart = s.slice(firstPad);
if (!/^=+$/.test(padPart) || padPart.length > 2) {
throw stagedError("normalize", "第 " + (firstPad + 1) + " 个字符起的 = 填充位置非法：= 只允许出现在结尾且最多 2 个", firstPad + 1, "=");
}
s = s.slice(0, firstPad);
}
if (s.length % 4 === 1) throw stagedError("normalize", "Base64 长度无效（去掉填充后长度对 4 取余为 1，无法补齐）");
while (s.length % 4!== 0) s += "=";
return s;
}

/* ================= Base64 解码 ================= */
function bytesToBase64(bytes) {
var b = bytes instanceof Uint8Array? bytes: new Uint8Array(bytes);
if (typeof Buffer!== "undefined") return Buffer.from(b).toString("base64");
var binary = "", i;
for (i = 0; i < b.length; i++) binary += String.fromCharCode(b[i]);
return btoa(binary);
}

function decodeBase64(input) {
var clean = normalizeBase64(input);
try {
if (typeof Buffer!== "undefined") return new Uint8Array(Buffer.from(clean, "base64"));
var binary = atob(clean);
var out = new Uint8Array(binary.length), i;
for (i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
return out;
} catch (e) {
throw stagedError("decode", "Base64 解码失败：" + e.message);
}
}

/* ================= gzip 判定与解压 ================= */
function isGzip(bytes) {
return!!bytes && bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function streamThrough(bytes, StreamCtor, format) {
var stream = new Blob([bytes]).stream().pipeThrough(new StreamCtor(format));
return new Response(stream).arrayBuffer();
}

async function gunzipBytes(bytes) {
if (typeof DecompressionStream === "undefined") {
throw stagedError("unsupported", "当前浏览器不支持 DecompressionStream('gzip')，无法解压 gzip 数据，请使用新版 Chrome / Edge / Firefox / Safari");
}
if (!isGzip(bytes)) {
throw stagedError("gzip", "不是 gzip 数据：前两字节魔数不是 0x1F 0x8B，请确认输入是 gzip 压缩后再 Base64 编码的文本；裸 Base64 请先用 Base64 编码／解码工具确认");
}
if (bytes.length > MAX_GZIP_BYTES) {
throw stagedError("gzip", "gzip 数据超过 10MB 上限，已拒绝处理（不静默截断）");
}
var buf;
try {
buf = await streamThrough(bytes, DecompressionStream, "gzip");
} catch (e) {
throw stagedError("gzip", "gzip 数据损坏或不完整，解压失败");
}
var out = new Uint8Array(buf);
if (out.length > MAX_TEXT_BYTES) {
throw stagedError("gzip", "解压后文本超过 10MB 上限，已拒绝输出（不静默截断）");
}
return out;
}

function decodeUtf8Strict(bytes) {
try {
return new TextDecoder("utf-8", { fatal: true}).decode(bytes);
} catch (e) {
throw stagedError("utf8", "解压结果不是有效的 UTF-8 文本（共 " + bytes.length + " 字节），无法作为文本输出；二进制内容不在本工具范围内");
}
}

/* ================= 主入口：解码并解压 ================= */
async function decodeGzipBase64(input) {
try {
var clean = normalizeBase64(input);
var gzipBytes = decodeBase64(clean);
var plainBytes = await gunzipBytes(gzipBytes);
var text = decodeUtf8Strict(plainBytes);
return { ok: true, text: text, base64Length: clean.length, gzipByteLength: gzipBytes.length, textByteLength: plainBytes.length};
} catch (e) {
return { ok: false, stage: e.stage || "gzip", error: e.message || String(e)};
}
}

/* ================= 反向演示：文本 → gzip → Base64 ================= */
function utf8Encode(text) {
return new TextEncoder().encode(text);
}

async function gzipBase64Encode(text) {
if (typeof text!== "string" || text.length === 0) throw new Error("文本不能为空，请输入要压缩演示的文本");
if (typeof CompressionStream === "undefined") {
throw stagedError("unsupported", "当前浏览器不支持 CompressionStream('gzip')，无法做反向压缩演示，请使用新版 Chrome / Edge / Firefox / Safari");
}
var plain = utf8Encode(text);
if (plain.length > MAX_TEXT_BYTES) throw stagedError("gzip", "文本超过 10MB 上限，已拒绝处理（不静默截断）");
var buf = await streamThrough(plain, CompressionStream, "gzip");
return bytesToBase64(new Uint8Array(buf));
}

function suggestExportName() {
return EXPORT_FILENAME;
}

/* ================= 浏览器 UI ================= */
function hasStreamSupport() {
return { decompress: typeof DecompressionStream!== "undefined", compress: typeof CompressionStream!== "undefined"};
}

function initUI() {
if (!hasDOM()) return;
var $ = function (id) { return document.getElementById(id);};
var inputEl = $("gbd-input"), outputEl = $("gbd-output"), errorEl = $("gbd-error"),
statusEl = $("gbd-status"), statsEl = $("gbd-stats"),
reverseInput = $("gbd-reverse-input"), reverseOutput = $("gbd-reverse-output"),
reverseStatus = $("gbd-reverse-status");
if (!inputEl ||!outputEl) return;
var support = hasStreamSupport();

function showError(stage, message) {
if (!errorEl) return;
errorEl.style.display = "block";
errorEl.textContent = "" + message;
}
function clearError() { if (errorEl) { errorEl.style.display = "none"; errorEl.textContent = "";}}
function setStatus(text) { if (statusEl) statusEl.textContent = text;}

if (!support.decompress) {
showError("unsupported", "当前浏览器不支持 DecompressionStream('gzip')，无法解压 gzip 数据，请使用新版 Chrome / Edge / Firefox / Safari");
var decodeBtn = $("gbd-decode");
if (decodeBtn) decodeBtn.disabled = true;
}
if (!support.compress) {
var revBtn = $("gbd-reverse");
if (revBtn) revBtn.disabled = true;
if (reverseStatus) reverseStatus.textContent = "当前浏览器不支持 CompressionStream('gzip')，反向演示不可用。";
}

function bind(id, fn) { var el = $(id); if (el) el.addEventListener("click", fn);}

bind("gbd-decode", async function () {
clearError(); setStatus("解码中…");
var result = await decodeGzipBase64(inputEl.value);
if (!result.ok) { showError(result.stage, result.error); setStatus("解码失败"); outputEl.value = ""; if (statsEl) statsEl.textContent = ""; return;}
outputEl.value = result.text;
setStatus("解码成功");
if (statsEl) statsEl.textContent = "Base64 " + result.base64Length + " 字符 · gzip " + result.gzipByteLength + " 字节 · 原文 " + result.textByteLength + " 字节（" + result.text.length + " 字符）";
});

bind("gbd-sample", function () {
inputEl.value = SAMPLE_GZIP_BASE64; clearError(); setStatus("已载入示例向量，点「解码并解压」可得到 Hello, ToolWeb!");
});
bind("gbd-clear", function () {
inputEl.value = ""; outputEl.value = ""; clearError(); setStatus(""); if (statsEl) statsEl.textContent = "";
});
bind("gbd-paste", async function () {
try {
var t = await navigator.clipboard.readText();
inputEl.value = t; clearError(); setStatus("已从剪贴板粘贴");
} catch (e) { setStatus("读取剪贴板失败，请手动粘贴（浏览器未授权剪贴板读取）");}
});
bind("gbd-copy", async function () {
if (!outputEl.value) { setStatus("没有可复制的原文，请先解码"); return;}
try { await navigator.clipboard.writeText(outputEl.value); setStatus("原文已复制");}
catch (e) { outputEl.select(); setStatus("复制失败，请手动 Ctrl+C（已选中原文）");}
});
bind("gbd-download", function () {
if (!outputEl.value) { setStatus("没有可下载的原文，请先解码"); return;}
var blob = new Blob([outputEl.value], { type: "text/plain;charset=utf-8"});
var a = document.createElement("a");
a.href = URL.createObjectURL(blob);
a.download = suggestExportName();
a.click();
setTimeout(function () { URL.revokeObjectURL(a.href);}, 1000);
setStatus("已下载 " + suggestExportName());
});
bind("gbd-reverse", async function () {
if (reverseStatus) reverseStatus.textContent = "压缩中…";
try {
var b64 = await gzipBase64Encode(reverseInput.value);
reverseOutput.value = b64;
if (reverseStatus) reverseStatus.textContent = "已生成 gzip Base64（共 " + b64.length + " 字符），点「填入上方解码」可验证往返。";
} catch (e) {
if (reverseStatus) reverseStatus.textContent = "" + (e.message || String(e));
}
});
bind("gbd-reverse-fill", function () {
if (reverseOutput.value) { inputEl.value = reverseOutput.value; clearError(); setStatus("已把反向演示结果填入上方输入框，点「解码并解压」验证往返");}
});
bind("gbd-reverse-sample", function () {
reverseInput.value = '{"ok":true}'; if (reverseStatus) reverseStatus.textContent = "已载入示例短文本，点「生成 gzip Base64」演示压缩。";
});
}

if (hasDOM()) {
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initUI);
else initUI();
}

var api = {
MAX_GZIP_BYTES: MAX_GZIP_BYTES, MAX_TEXT_BYTES: MAX_TEXT_BYTES,
SAMPLE_GZIP_BASE64: SAMPLE_GZIP_BASE64, SAMPLE_TEXT: SAMPLE_TEXT,
normalizeBase64: normalizeBase64, decodeBase64: decodeBase64, bytesToBase64: bytesToBase64,
isGzip: isGzip, gunzipBytes: gunzipBytes, decodeUtf8Strict: decodeUtf8Strict,
decodeGzipBase64: decodeGzipBase64, gzipBase64Encode: gzipBase64Encode,
suggestExportName: suggestExportName, hasStreamSupport: hasStreamSupport
};
if (typeof module!== "undefined" && module.exports) module.exports = api;
else if (typeof window!== "undefined") window.GzipBase64Decoder = api;
})();
