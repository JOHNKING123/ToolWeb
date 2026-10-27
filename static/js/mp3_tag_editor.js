/* MP3 标签编辑器（mp3_tag_editor）：只改 ID3v2 标签、不碰波形
 *
 * 功能：上传 MP3 → 手写解析 ID3v2.3 / v2.4 标签帧（TIT2 / TPE1 / TALB /
 *   TYER / TDRC / TRCK / TCON / COMM / APIC，文本编码 0 / 1 / 2 / 3）→
 *   七字段表单编辑 → 重写为统一的 ID3v2.3 UTF-16 标签导出。
 *   未知帧（含 USLT 歌词）字节原样带回；音频段与可能存在的 ID3v1
 *   尾标原样保留；不解码、不转码、不改音质与时长。
 * 纯前端零上传：文件只在浏览器本地解析与重写，无后端调用、无 CDN。
 * 纯函数全部经 module.exports 暴露，node tests/mp3_tag_editor.test.js 自测；
 * 浏览器内 init 挂 DOMContentLoaded；无 fetch / XHR。
 */
(function () {
"use strict";

/* ================= 字节工具 ================= */

function toBytes(buf) {
  if (buf instanceof Uint8Array) return buf;
  if (buf instanceof ArrayBuffer) return new Uint8Array(buf);
  return null;
}

function concatBytes(parts) {
  var total = 0, i, j, out, pos;
  for (i = 0; i < parts.length; i++) total += parts[i].length;
  out = new Uint8Array(total);
  pos = 0;
  for (i = 0; i < parts.length; i++) {
    for (j = 0; j < parts[i].length; j++) out[pos++] = parts[i][j];
  }
  return out;
}

function bytesEqual(a, b) {
  var i;
  if (!a || !b || a.length !== b.length) return false;
  for (i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function bytesContain(hay, needle) {
  var i, j, ok;
  if (needle.length === 0) return true;
  for (i = 0; i + needle.length <= hay.length; i++) {
    ok = true;
    for (j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

function ascii(bytes, start, len) {
  var s = "", i;
  for (i = 0; i < len; i++) s += String.fromCharCode(bytes[start + i]);
  return s;
}

function asciiBytes(s) {
  var out = new Uint8Array(s.length), i;
  for (i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xFF;
  return out;
}

function u32be(bytes, off) {
  return ((bytes[off] << 24) >>> 0) + (bytes[off + 1] << 16) +
    (bytes[off + 2] << 8) + bytes[off + 3];
}

function synchsafeDecode(bytes, off) {
  var i, v = 0;
  for (i = 0; i < 4; i++) {
    if (bytes[off + i] & 0x80) return -1;
    v = (v << 7) | (bytes[off + i] & 0x7F);
  }
  return v;
}

function synchsafeEncode(n) {
  return new Uint8Array([
    (n >> 21) & 0x7F, (n >> 14) & 0x7F, (n >> 7) & 0x7F, n & 0x7F
  ]);
}

function be32Bytes(n) {
  return new Uint8Array([
    (n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF
  ]);
}

/* ================= 文本编解码 ================= */

/* UTF-16LE（含 BOM）编码：返回 [FF FE + 单元 LE]，不含终止符。 */
function encodeUtf16Le(text) {
  var units = [], i, cp, out, j;
  for (i = 0; i < text.length;) {
    cp = text.codePointAt(i);
    if (cp > 0xFFFF) {
      units.push(0xD800 + ((cp - 0x10000) >> 10));
      units.push(0xDC00 + ((cp - 0x10000) & 0x3FF));
      i += 2;
    } else {
      units.push(cp);
      i += 1;
    }
  }
  out = new Uint8Array(2 + units.length * 2);
  out[0] = 0xFF; out[1] = 0xFE;
  for (j = 0; j < units.length; j++) {
    out[2 + j * 2] = units[j] & 0xFF;
    out[2 + j * 2 + 1] = (units[j] >> 8) & 0xFF;
  }
  return out;
}

function decodeUtf16(bytes, start, end, littleEndian) {
  var units = [], i, lo, hi;
  for (i = start; i + 1 < end; i += 2) {
    lo = bytes[i]; hi = bytes[i + 1];
    units.push(littleEndian ? (lo | (hi << 8)) : ((lo << 8) | hi));
  }
  /* fromCharCode 逐单元拼接，代理对自然成对保留。 */
  var s = "", k;
  for (k = 0; k < units.length; k++) s += String.fromCharCode(units[k]);
  return s;
}

function stripTrailingNul(s) {
  var e = s.length;
  while (e > 0 && s.charCodeAt(e - 1) === 0) e--;
  return s.slice(0, e);
}

/* 编码 0=ISO-8859-1、1=UTF-16（含 BOM，无 BOM 默认 LE）、2=UTF-16BE、3=UTF-8 */
function decodeTextPayload(payload) {
  var enc, body, le, start;
  if (!payload || payload.length === 0) return "";
  enc = payload[0];
  if (enc === 0) {
    body = "";
    var i;
    for (i = 1; i < payload.length; i++) body += String.fromCharCode(payload[i]);
    return stripTrailingNul(body);
  }
  if (enc === 1) {
    if (payload.length >= 3 && payload[1] === 0xFF && payload[2] === 0xFE) {
      return stripTrailingNul(decodeUtf16(payload, 3, payload.length, true));
    }
    if (payload.length >= 3 && payload[1] === 0xFE && payload[2] === 0xFF) {
      return stripTrailingNul(decodeUtf16(payload, 3, payload.length, false));
    }
    return stripTrailingNul(decodeUtf16(payload, 1, payload.length, true));
  }
  if (enc === 2) {
    return stripTrailingNul(decodeUtf16(payload, 1, payload.length, false));
  }
  if (enc === 3) {
    var dec = new TextDecoder("utf-8");
    return stripTrailingNul(dec.decode(payload.subarray(1)));
  }
  return "";
}

/* 在原始帧负载内找短描述终止位置：返回描述结束后的下标（-1 表示无终止符）。 */
function findDescEnd(payload, descStart) {
  var enc = payload[0], i;
  if (enc === 0 || enc === 3) {
    for (i = descStart; i < payload.length; i++) {
      if (payload[i] === 0) return i + 1;
    }
    return -1;
  }
  /* UTF-16：从 BOM 之后按 2 字节步进找 00 00。 */
  var content = descStart;
  if (enc === 1 && payload.length >= descStart + 2 &&
      ((payload[descStart] === 0xFF && payload[descStart + 1] === 0xFE) ||
       (payload[descStart] === 0xFE && payload[descStart + 1] === 0xFF))) {
    content = descStart + 2;
  }
  for (i = content; i + 1 < payload.length; i += 2) {
    if (payload[i] === 0 && payload[i + 1] === 0) return i + 2;
  }
  return -1;
}

function decodeDesc(payload, descStart, descEnd) {
  var enc = payload[0], slice;
  if (descEnd === -1) slice = payload.subarray(descStart);
  else slice = payload.subarray(descStart, descEnd);
  /* 复用 decodeTextPayload：拼一个带编码字节的假负载。 */
  var fake = new Uint8Array(slice.length + 1);
  fake[0] = enc;
  fake.set(slice, 1);
  return stripTrailingNul(decodeTextPayload(fake));
}

/* ================= 帧构造（供 buildId3 与测试构造 v2.3 / v2.4 标签） ================= */

/* 编码 1（UTF-16LE + BOM）的文本帧负载。 */
function encodeTextPayload(text) {
  var units = encodeUtf16Le(text);
  var out = new Uint8Array(1 + units.length + 2);
  out[0] = 0x01;
  out.set(units, 1);
  out[out.length - 2] = 0; out[out.length - 1] = 0;
  return out;
}

/* 通用帧：v2.3 尺寸大端，v2.4 尺寸同步安全。 */
function encodeFrame(id, payload, version) {
  var sizeBytes = (version === 4) ? synchsafeEncode(payload.length) : be32Bytes(payload.length);
  var out = new Uint8Array(10 + payload.length);
  out.set(asciiBytes(id), 0);
  out.set(sizeBytes, 4);
  out[8] = 0; out[9] = 0;
  out.set(payload, 10);
  return out;
}

/* COMM 负载：编码 1 + 语言码 + 短描述（BOM + 终止符）+ 正文。 */
function encodeCommPayload(comment, lang, desc) {
  lang = lang || "eng";
  desc = desc || "";
  var descUnits = encodeUtf16Le(desc);
  var textUnits = encodeUtf16Le(comment || "");
  var out = new Uint8Array(1 + 3 + descUnits.length + 2 + textUnits.length + 2);
  var p = 0;
  out[p++] = 0x01;
  out.set(asciiBytes(lang), p); p += 3;
  out.set(descUnits, p); p += descUnits.length;
  out[p++] = 0; out[p++] = 0;
  out.set(textUnits, p); p += textUnits.length;
  out[p++] = 0; out[p++] = 0;
  return out;
}

/* APIC 负载：编码 1 + MIME（0x00 终止）+ 类型 0x03 + 空描述 + 图片字节。 */
function encodeApicPayload(mime, imageBytes) {
  var desc = new Uint8Array([0xFF, 0xFE, 0x00, 0x00]);
  var mimeBytes = asciiBytes(mime || "image/jpeg");
  var out = new Uint8Array(1 + mimeBytes.length + 1 + 1 + desc.length + imageBytes.length);
  var p = 0;
  out[p++] = 0x01;
  out.set(mimeBytes, p); p += mimeBytes.length;
  out[p++] = 0;
  out[p++] = 0x03;
  out.set(desc, p); p += desc.length;
  out.set(imageBytes, p);
  return out;
}

/* 帧序列 + 版本拼成完整标签头（含 ID3 头）。 */
function buildTag(frames, version) {
  var bodyLen = 0, i;
  for (i = 0; i < frames.length; i++) bodyLen += frames[i].length;
  var head = new Uint8Array(10);
  head.set(asciiBytes("ID3"), 0);
  head[3] = version; head[4] = 0; head[5] = 0;
  head.set(synchsafeEncode(bodyLen), 6);
  return concatBytes([head].concat(frames));
}

function guessMime(imageBytes) {
  if (imageBytes && imageBytes.length >= 3 &&
      imageBytes[0] === 0xFF && imageBytes[1] === 0xD8 && imageBytes[2] === 0xFF) {
    return "image/jpeg";
  }
  if (imageBytes && imageBytes.length >= 4 &&
      imageBytes[0] === 0x89 && imageBytes[1] === 0x50 &&
      imageBytes[2] === 0x4E && imageBytes[3] === 0x47) {
    return "image/png";
  }
  return "";
}

/* ================= ID3v2 解析 ================= */

var TEXT_FRAMES = {
  TIT2: "title", TPE1: "artist", TALB: "album",
  TYER: "year", TDRC: "year", TRCK: "track", TCON: "genre"
};

function emptyFields() {
  return { title: "", artist: "", album: "", year: "", track: "", genre: "", comment: "" };
}

function emptyParse() {
  return {
    version: null, fields: emptyFields(), cover: null,
    unknownFrames: [], audioOffset: 0, hasId3v1: false,
    commLang: "eng", commDesc: ""
  };
}

function hasId3v1Tail(bytes) {
  if (bytes.length < 128) return false;
  return ascii(bytes, bytes.length - 128, 3) === "TAG";
}

/* 解析失败返回 { error: "..." }，不静默当成无标签处理。 */
function parseId3(input) {
  var bytes = toBytes(input);
  if (!bytes) return { error: "输入不是字节数据" };
  var result = emptyParse();
  result.hasId3v1 = hasId3v1Tail(bytes);
  if (bytes.length < 10 || ascii(bytes, 0, 3) !== "ID3") {
    return result;
  }
  var version = bytes[3];
  if (version !== 3 && version !== 4) {
    return { error: "不支持的 ID3 版本 v2." + version + "，只支持 v2.3 / v2.4" };
  }
  var flags = bytes[5];
  var tagSize = synchsafeDecode(bytes, 6);
  if (tagSize < 0) return { error: "ID3 标签尺寸不是合法的同步安全整数" };
  var tagEnd = 10 + tagSize;
  if (tagEnd > bytes.length) {
    return { error: "ID3 标签尺寸超出文件长度，文件可能不完整" };
  }
  result.version = version;
  result.audioOffset = tagEnd;
  var pos = 10;
  /* 扩展头：v2.3 / v2.4 均按头后尺寸字段跳过（罕见，超出则停止解析）。 */
  if (flags & 0x40) {
    var extSize = (version === 4) ? synchsafeDecode(bytes, 10) : u32be(bytes, 10);
    if (extSize < 0 || 10 + extSize > tagEnd) return result;
    pos = 10 + extSize;
  }
  while (pos + 10 <= tagEnd) {
    var id = ascii(bytes, pos, 4);
    if (id === "\0\0\0\0") break; /* 填充区：停止解析 */
    if (!/^[A-Z0-9]{4}$/.test(id)) break; /* 非法帧头：视为帧区结束 */
    var frameSize = (version === 4) ? synchsafeDecode(bytes, pos + 4) : u32be(bytes, pos + 4);
    if (frameSize < 0 || pos + 10 + frameSize > tagEnd) break;
    var frameFlags = bytes[pos + 9];
    var payload = bytes.subarray(pos + 10, pos + 10 + frameSize);
    var raw = bytes.slice(pos, pos + 10 + frameSize);
    /* 压缩 / 加密标志位置位：不解码，原样带回（不报错中断）。 */
    var protectedFrame = (frameFlags & 0x0C) !== 0;
    if (!protectedFrame && TEXT_FRAMES.hasOwnProperty(id)) {
      result.fields[TEXT_FRAMES[id]] = decodeTextPayload(payload);
    } else if (!protectedFrame && id === "COMM" && result.fields.comment === "") {
      var lang = ascii(payload, 1, 3);
      var descEnd = findDescEnd(payload, 4);
      result.commLang = lang;
      result.commDesc = decodeDesc(payload, 4, descEnd);
      var textStart = (descEnd === -1) ? payload.length : descEnd;
      var fake = new Uint8Array(payload.length - textStart + 1);
      fake[0] = payload[0];
      fake.set(payload.subarray(textStart), 1);
      result.fields.comment = decodeTextPayload(fake);
    } else if (!protectedFrame && id === "APIC" && result.cover === null) {
      var mimeEnd = -1, m;
      for (m = 1; m < payload.length; m++) {
        if (payload[m] === 0) { mimeEnd = m; break; }
      }
      if (mimeEnd !== -1 && mimeEnd + 1 < payload.length) {
        var mime = ascii(payload, 1, mimeEnd - 1);
        var picDescEnd = findDescEnd(payload, mimeEnd + 2);
        var imgStart = (picDescEnd === -1) ? payload.length : picDescEnd;
        var img = payload.slice(imgStart);
        result.cover = { mime: mime || guessMime(img), imageBytes: img };
      }
    } else {
      result.unknownFrames.push(raw);
    }
    pos += 10 + frameSize;
  }
  return result;
}

/* ================= 标签重建 ================= */

/* 统一输出 ID3v2.3：文本帧编码 1（UTF-16LE + BOM），空字段不写帧，
 * 年份写 TYER，APIC 类型 0x03；未知帧按原字节拼在已知帧之后。
 * opts 可传 { commLang, commDesc } 以保留原 COMM 语言码与短描述。
 * 标签尺寸超同步安全上限时返回 null。 */
function buildId3(fields, cover, unknownFrames, opts) {
  fields = fields || {};
  opts = opts || {};
  var frames = [];
  function textFrame(id, value) {
    if (value !== undefined && value !== null && value !== "") {
      frames.push(encodeFrame(id, encodeTextPayload(value), 3));
    }
  }
  textFrame("TIT2", fields.title);
  textFrame("TPE1", fields.artist);
  textFrame("TALB", fields.album);
  textFrame("TYER", fields.year);
  textFrame("TRCK", fields.track);
  textFrame("TCON", fields.genre);
  if (fields.comment !== undefined && fields.comment !== null && fields.comment !== "") {
    frames.push(encodeFrame("COMM",
      encodeCommPayload(fields.comment, opts.commLang || "eng", opts.commDesc || ""), 3));
  }
  if (cover && cover.imageBytes && cover.imageBytes.length > 0) {
    frames.push(encodeFrame("APIC",
      encodeApicPayload(cover.mime || guessMime(cover.imageBytes) || "image/jpeg",
        cover.imageBytes), 3));
  }
  var i;
  if (unknownFrames) {
    for (i = 0; i < unknownFrames.length; i++) frames.push(unknownFrames[i]);
  }
  var bodyLen = 0;
  for (i = 0; i < frames.length; i++) bodyLen += frames[i].length;
  if (bodyLen > 0x0FFFFFFF) return null;
  return buildTag(frames, 3);
}

/* 原文件从 audioOffset 起的全部字节（音频段 + 可能的 ID3v1 尾标）原样保留。 */
function rebuildMp3(input, fields, cover, unknownFrames) {
  var bytes = toBytes(input);
  if (!bytes) return null;
  var parsed = parseId3(bytes);
  if (parsed.error) return null;
  var tag = buildId3(fields, cover, unknownFrames,
    { commLang: parsed.commLang, commDesc: parsed.commDesc });
  if (!tag) return null;
  return concatBytes([tag, bytes.slice(parsed.audioOffset)]);
}

/* ================= 校验与命名 ================= */

function validateTrack(value) {
  var v = String(value == null ? "" : value).replace(/^\s+|\s+$/g, "");
  if (v === "") return true; /* 空值合法：表示删除该字段 */
  return /^\d+(\/\d+)?$/.test(v) &&
    parseInt(v.split("/")[0], 10) > 0 &&
    (v.indexOf("/") === -1 || parseInt(v.split("/")[1], 10) > 0);
}

function suggestExportName(originalName) {
  var name = String(originalName == null ? "" : originalName);
  var i = name.lastIndexOf(".");
  var base = (i > 0) ? name.slice(0, i) : name;
  if (base === "") base = "song";
  return base + "-tagged.mp3";
}

/* MP3 判定：文件名 .mp3 且内容以 ID3 头或 MPEG 帧同步（FF Ex）开头。 */
function isMp3FileName(name) {
  return /\.mp3$/i.test(String(name == null ? "" : name));
}

function isMp3Buffer(input) {
  var bytes = toBytes(input);
  if (!bytes || bytes.length < 2) return false;
  if (bytes.length >= 3 && ascii(bytes, 0, 3) === "ID3") return true;
  return bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0;
}

function isMp3File(name, input) {
  return isMp3FileName(name) && isMp3Buffer(input);
}

/* 1x1 透明 PNG（演示封面），atob 解码，浏览器与 node 均可用。 */
var DEMO_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=";

function base64ToBytes(b64) {
  var bin = "";
  if (typeof atob === "function") {
    bin = atob(b64);
  } else {
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    var i, v = 0, bits = 0;
    for (i = 0; i < b64.length; i++) {
      var c = b64.charAt(i);
      if (c === "=") break;
      v = (v << 6) | chars.indexOf(c);
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        bin += String.fromCharCode((v >> bits) & 0xFF);
      }
    }
  }
  var out = new Uint8Array(bin.length), k;
  for (k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
  return out;
}

/* 合成演示文件：中文标签 + 演示封面 + 占位音频段（仅演示解析，不可播放）。 */
function buildDemoBuffer() {
  var fields = {
    title: "示例歌曲", artist: "示例歌手", album: "示例专辑",
    year: "2026", track: "3/12", genre: "流行", comment: "这是一个合成演示标签"
  };
  var tag = buildId3(fields,
    { mime: "image/png", imageBytes: base64ToBytes(DEMO_PNG_BASE64) }, []);
  var audio = new Uint8Array(128);
  audio[0] = 0xFF; audio[1] = 0xFB;
  return concatBytes([tag, audio]);
}

var api = {
  parseId3: parseId3,
  buildId3: buildId3,
  rebuildMp3: rebuildMp3,
  validateTrack: validateTrack,
  suggestExportName: suggestExportName,
  isMp3FileName: isMp3FileName,
  isMp3Buffer: isMp3Buffer,
  isMp3File: isMp3File,
  buildDemoBuffer: buildDemoBuffer,
  encodeTextPayload: encodeTextPayload,
  encodeFrame: encodeFrame,
  encodeCommPayload: encodeCommPayload,
  encodeApicPayload: encodeApicPayload,
  buildTag: buildTag,
  concatBytes: concatBytes,
  bytesEqual: bytesEqual,
  bytesContain: bytesContain,
  guessMime: guessMime,
  decodeTextPayload: decodeTextPayload
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
} else if (typeof window !== "undefined") {
  window.Mp3TagEditor = api;
}

/* ---------------- 浏览器 UI ---------------- */
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", function () {
    function $(id) { return document.getElementById(id); }
    var dropZone = $("mp3-drop"), fileInput = $("mp3-file");
    var infoBox = $("mp3-info"), errorBox = $("mp3-error");
    var exportStatus = $("mp3-export-status");
    var coverImg = $("mp3-cover-img"), coverInfo = $("mp3-cover-info");
    var coverPlaceholder = $("mp3-cover-none"), coverFileInput = $("mp3-cover-file");
    var fieldIds = {
      title: "mp3-title", artist: "mp3-artist", album: "mp3-album",
      year: "mp3-year", track: "mp3-track", genre: "mp3-genre", comment: "mp3-comment"
    };
    var originalBytes = null, originalName = "", parsed = null;
    /* coverState: null=跟随解析值；"deleted"=已删除；对象=新封面。 */
    var coverState = null;
    var coverUrl = "";

    function setError(msg) { errorBox.textContent = msg || ""; }
    function setStatus(msg) { exportStatus.textContent = msg || ""; }
    function currentCover() {
      if (coverState === "deleted") return null;
      if (coverState) return coverState;
      return parsed ? parsed.cover : null;
    }
    function showCover() {
      var cover = currentCover();
      if (coverUrl) { URL.revokeObjectURL(coverUrl); coverUrl = ""; }
      if (cover && cover.imageBytes && cover.imageBytes.length > 0) {
        var blob = new Blob([cover.imageBytes], { type: cover.mime || "image/jpeg" });
        coverUrl = URL.createObjectURL(blob);
        coverImg.src = coverUrl;
        coverImg.style.display = "block";
        coverPlaceholder.style.display = "none";
        var kb = (cover.imageBytes.length / 1024).toFixed(1);
        coverInfo.textContent = "封面：" + (cover.mime || "未知类型") + "，" + kb + " KB";
      } else {
        coverImg.style.display = "none";
        coverPlaceholder.style.display = "block";
        coverInfo.textContent = "无封面";
      }
    }
    function readFields() {
      var out = {}, k;
      for (k in fieldIds) out[k] = $(fieldIds[k]).value;
      return out;
    }
    function checkTrack() {
      var hint = $("mp3-track-error");
      if (!validateTrack($(fieldIds.track).value)) {
        hint.textContent = "音轨格式非法：只接受数字或“数字/总数”，如 3 或 3/12。";
      } else {
        hint.textContent = "";
      }
    }
    function loadBytes(bytes, name) {
      if (!isMp3File(name, bytes)) {
        setError("非 MP3 文件，已拒绝：请上传 .mp3 文件（以 ID3 标签或 MPEG 音频帧开头）。");
        return;
      }
      var p = parseId3(bytes);
      if (p.error) {
        setError("解析失败：" + p.error);
        return;
      }
      originalBytes = bytes; originalName = name; parsed = p; coverState = null;
      var f = p.fields, k;
      for (k in fieldIds) $(fieldIds[k]).value = f[k] || "";
      checkTrack();
      var sizeKb = (bytes.length / 1024).toFixed(1);
      infoBox.textContent = "文件：" + name + "（" + sizeKb + " KB）｜" +
        (p.version ? ("含 ID3v2." + p.version + " 标签") : "无 ID3v2 标签") + "｜" +
        (p.hasId3v1 ? "含 ID3v1 尾标（导出时原样保留）" : "无 ID3v1 尾标");
      showCover();
      setError("");
      setStatus("已载入，修改字段或封面后点“导出改后 MP3”。");
    }
    function loadFile(file) {
      if (!file) return;
      if (typeof file.arrayBuffer === "function") {
        file.arrayBuffer().then(function (buf) {
          loadBytes(new Uint8Array(buf), file.name);
        }).catch(function () { setError("读取文件失败，请重试。"); });
      } else {
        var reader = new FileReader();
        reader.onload = function () { loadBytes(new Uint8Array(reader.result), file.name); };
        reader.onerror = function () { setError("读取文件失败，请重试。"); };
        reader.readAsArrayBuffer(file);
      }
    }
    function resetAll() {
      originalBytes = null; originalName = ""; parsed = null; coverState = null;
      var k;
      for (k in fieldIds) $(fieldIds[k]).value = "";
      infoBox.textContent = "尚未上传文件。";
      showCover();
      setError(""); setStatus("");
      $("mp3-track-error").textContent = "";
      fileInput.value = "";
    }
    if (dropZone) {
      dropZone.addEventListener("click", function () { fileInput.click(); });
      dropZone.addEventListener("dragover", function (e) { e.preventDefault(); });
      dropZone.addEventListener("drop", function (e) {
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files.length > 0) loadFile(e.dataTransfer.files[0]);
      });
    }
    if (fileInput) fileInput.addEventListener("change", function () {
      if (fileInput.files.length > 0) loadFile(fileInput.files[0]);
    });
    $(fieldIds.track).addEventListener("input", checkTrack);
    $("mp3-clear").addEventListener("click", function () {
      var k;
      for (k in fieldIds) $(fieldIds[k]).value = "";
      $("mp3-track-error").textContent = "";
      setStatus("字段已清空（封面不受影响），导出时空字段不写帧。");
    });
    $("mp3-cover-change").addEventListener("click", function () { coverFileInput.click(); });
    coverFileInput.addEventListener("change", function () {
      var file = coverFileInput.files[0];
      if (!file) return;
      if (!/^image\/(jpeg|png)$/i.test(file.type) &&
          !/\.(jpe?g|png)$/i.test(file.name)) {
        setError("封面只接受 JPG / PNG 图片。");
        return;
      }
      var done = function (buf) {
        var bytes = new Uint8Array(buf);
        var mime = /^image\//i.test(file.type) ? file.type.toLowerCase()
          : (guessMime(bytes) || "image/jpeg");
        coverState = { mime: mime, imageBytes: bytes };
        showCover();
        setError("");
        setStatus("封面已更换（尚未导出）。");
      };
      if (typeof file.arrayBuffer === "function") {
        file.arrayBuffer().then(done).catch(function () { setError("读取封面失败，请重试。"); });
      } else {
        var reader = new FileReader();
        reader.onload = function () { done(reader.result); };
        reader.readAsArrayBuffer(file);
      }
    });
    $("mp3-cover-delete").addEventListener("click", function () {
      coverState = "deleted";
      showCover();
      setStatus("封面已删除（尚未导出），导出后 APIC 帧不再出现。");
    });
    $("mp3-export").addEventListener("click", function () {
      if (!originalBytes) { setError("请先上传 MP3 文件或载入示例。"); return; }
      if (!validateTrack($(fieldIds.track).value)) {
        setError("音轨格式非法，导出前请先修正（只接受数字或“数字/总数”）。");
        return;
      }
      var out = rebuildMp3(originalBytes, readFields(), currentCover(),
        parsed ? parsed.unknownFrames : []);
      if (!out) { setError("导出失败：标签过大或原文件解析失败，请换一个文件重试。"); return; }
      var name = suggestExportName(originalName);
      var blob = new Blob([out], { type: "audio/mpeg" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      setError("");
      setStatus("已导出 " + name + "。请在常用播放器里核对一次。");
    });
    $("mp3-reupload").addEventListener("click", resetAll);
    $("mp3-demo").addEventListener("click", function () {
      loadBytes(buildDemoBuffer(), "示例歌曲.mp3");
      setStatus("已载入合成演示：中文标签 + 演示封面 + 占位音频段（仅演示解析，不可当真 MP3 播放）。");
    });
    showCover();
  });
}
})();
