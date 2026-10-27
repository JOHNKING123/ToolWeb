/* MP3 标签编辑器纯逻辑单元测试（零依赖）：node tests/mp3_tag_editor.test.js
 * 覆盖：
 * 1. v2.3 合成标签解析向量（TIT2/TPE1/TALB/TYER/TRCK/TCON/COMM/APIC + 未知帧 USLT）
 * 2. v2.4 标签解析（TDRC 年份、同步安全尺寸）与无标签文件（version null、audioOffset 0）
 * 3. 文本编码向量：中文标题 UTF-16 / UTF-8 一致；ASCII 标题四种编码一致；Latin1 字符
 * 4. 重写往返向量：改字段 / 删字段 / 删封面 / COMM 语言与短描述保留 / 音频段逐字节相等
 * 5. 未知帧保留向量：USLT 原字节在新标签中出现；ID3v1 尾标原样保留
 * 6. 音轨校验向量、导出命名向量、MP3 判定向量
 * 7. 注册与零网络请求静态检查（categories.go 204 Path、模板真限制文案、互链仅三件音频工具）
 */
"use strict";
var fs = require("fs");
var M = require("../static/js/mp3_tag_editor.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（应包含 " + JSON.stringify(sub) + "）"); }
function notHas(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }
function asciiBytes(s) {
  var out = new Uint8Array(s.length), i;
  for (i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xFF;
  return out;
}
function concat(parts) {
  var total = 0, i, j, out, pos;
  for (i = 0; i < parts.length; i++) total += parts[i].length;
  out = new Uint8Array(total); pos = 0;
  for (i = 0; i < parts.length; i++) {
    for (j = 0; j < parts[i].length; j++) out[pos++] = parts[i][j];
  }
  return out;
}
/* 测试用编码负载构造（与实现无关的手工编码，避免自证）： */
function latin1Payload(text) {
  var out = new Uint8Array(1 + text.length + 1), i;
  out[0] = 0;
  for (i = 0; i < text.length; i++) out[1 + i] = text.charCodeAt(i) & 0xFF;
  out[out.length - 1] = 0;
  return out;
}
function utf16bePayload(text) {
  var units = [], i, cp, out, j;
  for (i = 0; i < text.length;) {
    cp = text.codePointAt(i);
    if (cp > 0xFFFF) {
      units.push(0xD800 + ((cp - 0x10000) >> 10));
      units.push(0xDC00 + ((cp - 0x10000) & 0x3FF));
      i += 2;
    } else { units.push(cp); i += 1; }
  }
  out = new Uint8Array(1 + units.length * 2 + 2);
  out[0] = 2;
  for (j = 0; j < units.length; j++) {
    out[1 + j * 2] = (units[j] >> 8) & 0xFF;
    out[1 + j * 2 + 1] = units[j] & 0xFF;
  }
  return out;
}
function utf8Payload(text) {
  var enc = new TextEncoder().encode(text);
  var out = new Uint8Array(1 + enc.length + 1);
  out[0] = 3;
  out.set(enc, 1);
  return out;
}
function utf16leBomPayload(text) {
  return M.encodeTextPayload(text);
}

var FAKE_AUDIO = new Uint8Array(64);
FAKE_AUDIO[0] = 0xFF; FAKE_AUDIO[1] = 0xFB;
var FAKE_JPEG = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x11, 0x22, 0x33]);
var USLT_TEXT = "La la la";
var usltPayload = concat([
  new Uint8Array([3]), asciiBytes("eng"), new Uint8Array([0]),
  new TextEncoder().encode(USLT_TEXT)
]);
var usltFrame = M.encodeFrame("USLT", usltPayload, 3);

function buildV23File() {
  var frames = [
    M.encodeFrame("TIT2", utf16leBomPayload("夜曲"), 3),
    M.encodeFrame("TPE1", utf16leBomPayload("歌手甲"), 3),
    M.encodeFrame("TALB", utf16leBomPayload("专辑乙"), 3),
    M.encodeFrame("TYER", utf16leBomPayload("2024"), 3),
    M.encodeFrame("TRCK", utf16leBomPayload("3/12"), 3),
    M.encodeFrame("TCON", utf16leBomPayload("流行"), 3),
    M.encodeFrame("COMM", M.encodeCommPayload("好听的歌", "eng", "简介"), 3),
    M.encodeFrame("APIC", M.encodeApicPayload("image/jpeg", FAKE_JPEG), 3),
    usltFrame
  ];
  return concat([M.buildTag(frames, 3), FAKE_AUDIO]);
}

/* ---------- 1. v2.3 解析向量 ---------- */
var f23 = buildV23File();
var p23 = M.parseId3(f23);
eq(p23.error, undefined, "v2.3 解析无错误");
eq(p23.version, 3, "v2.3 版本号");
eq(p23.fields.title, "夜曲", "v2.3 标题");
eq(p23.fields.artist, "歌手甲", "v2.3 歌手");
eq(p23.fields.album, "专辑乙", "v2.3 专辑");
eq(p23.fields.year, "2024", "v2.3 年份 TYER");
eq(p23.fields.track, "3/12", "v2.3 音轨");
eq(p23.fields.genre, "流行", "v2.3 流派");
eq(p23.fields.comment, "好听的歌", "v2.3 注释正文");
eq(p23.commLang, "eng", "v2.3 注释语言码");
eq(p23.commDesc, "简介", "v2.3 注释短描述");
eq(p23.cover.mime, "image/jpeg", "v2.3 封面 MIME");
ok(M.bytesEqual(p23.cover.imageBytes, FAKE_JPEG), "v2.3 封面字节一致");
eq(p23.unknownFrames.length, 1, "v2.3 未知帧仅 USLT 一帧");
ok(M.bytesEqual(p23.unknownFrames[0], usltFrame), "v2.3 未知帧原字节一致");
ok(p23.audioOffset > 10 && p23.audioOffset < f23.length, "v2.3 audioOffset 在标签末尾");
ok(M.bytesEqual(f23.slice(p23.audioOffset), FAKE_AUDIO), "v2.3 音频段即占位音频");
eq(p23.hasId3v1, false, "v2.3 文件无 ID3v1 尾标");

/* ---------- 2. v2.4 解析与无标签文件 ---------- */
var frames24 = [
  M.encodeFrame("TIT2", utf16leBomPayload("晨光"), 4),
  M.encodeFrame("TDRC", utf16leBomPayload("2025"), 4)
];
var f24 = concat([M.buildTag(frames24, 4), FAKE_AUDIO]);
var p24 = M.parseId3(f24);
eq(p24.version, 4, "v2.4 版本号");
eq(p24.fields.title, "晨光", "v2.4 标题（同步安全尺寸）");
eq(p24.fields.year, "2025", "v2.4 年份 TDRC 归入年份字段");
var plain = concat([FAKE_AUDIO]);
var p0 = M.parseId3(plain);
eq(p0.version, null, "无标签文件 version 为 null");
eq(p0.audioOffset, 0, "无标签文件 audioOffset 为 0");
eq(p0.fields.title, "", "无标签文件标题为空");
eq(p0.cover, null, "无标签文件无封面");
var badVer = new Uint8Array(20);
badVer.set(asciiBytes("ID3"), 0); badVer[3] = 2;
var pBad = M.parseId3(badVer);
ok(!!pBad.error, "版本非 3/4 返回解析失败而非静默当无标签");

/* ---------- 3. 文本编码向量 ---------- */
var cn16 = M.parseId3(concat([M.buildTag([M.encodeFrame("TIT2", utf16leBomPayload("夜曲"), 3)], 3), FAKE_AUDIO]));
var cn8 = M.parseId3(concat([M.buildTag([M.encodeFrame("TIT2", utf8Payload("夜曲"), 3)], 3), FAKE_AUDIO]));
eq(cn16.fields.title, cn8.fields.title, "中文标题 UTF-16 与 UTF-8 解析一致");
eq(cn8.fields.title, "夜曲", "中文标题 UTF-8 解析正确");
var tPayloads = [latin1Payload("ASCII 123"), utf16leBomPayload("ASCII 123"), utf16bePayload("ASCII 123"), utf8Payload("ASCII 123")];
var tParsed = tPayloads.map(function (pl, idx) {
  return M.parseId3(concat([M.buildTag([M.encodeFrame("TIT2", pl, 3)], 3), FAKE_AUDIO])).fields.title;
});
ok(tParsed.every(function (v) { return v === "ASCII 123"; }), "ASCII 标题四种编码解析一致");
var latin = M.parseId3(concat([M.buildTag([M.encodeFrame("TIT2", latin1Payload("café"), 3)], 3), FAKE_AUDIO]));
eq(latin.fields.title, "café", "Latin1 字符 café 解析正确");

/* ---------- 4. 重写往返向量 ---------- */
var changed = {
  title: "新标题", artist: p23.fields.artist, album: p23.fields.album,
  year: p23.fields.year, track: p23.fields.track, genre: p23.fields.genre,
  comment: p23.fields.comment
};
var rebuilt = M.rebuildMp3(f23, changed, p23.cover, p23.unknownFrames);
var pr = M.parseId3(rebuilt);
eq(pr.fields.title, "新标题", "改标题后重解析为新标题");
eq(pr.fields.artist, "歌手甲", "改标题后其余字段不变");
eq(pr.fields.comment, "好听的歌", "改标题后注释不变");
eq(pr.commLang, "eng", "重建保留 COMM 语言码");
eq(pr.commDesc, "简介", "重建保留 COMM 短描述");
ok(M.bytesEqual(pr.cover.imageBytes, FAKE_JPEG), "改标题后封面不变");
ok(M.bytesEqual(rebuilt.slice(pr.audioOffset), FAKE_AUDIO), "重建后音频段逐字节相等");
ok(M.bytesContain(rebuilt, usltFrame), "重建后未知帧 USLT 原字节出现");
eq(pr.version, 3, "重建统一输出 v2.3");
var noTitle = Object.assign({}, changed, { title: "" });
var rebuiltNoTitle = M.rebuildMp3(f23, noTitle, p23.cover, p23.unknownFrames);
var prNoTitle = M.parseId3(rebuiltNoTitle);
eq(prNoTitle.fields.title, "", "删除标题后重解析为空");
ok(!M.bytesContain(rebuiltNoTitle, asciiBytes("TIT2")), "删除标题后 TIT2 帧不再出现");
var rebuiltNoCover = M.rebuildMp3(f23, changed, null, p23.unknownFrames);
var prNoCover = M.parseId3(rebuiltNoCover);
eq(prNoCover.cover, null, "删除封面后重解析无封面");
ok(!M.bytesContain(rebuiltNoCover, asciiBytes("APIC")), "删除封面后 APIC 帧不再出现");
var rebuiltPlain = M.rebuildMp3(plain, { title: "从零写标签" }, null, []);
var prPlain = M.parseId3(rebuiltPlain);
eq(prPlain.fields.title, "从零写标签", "无标签文件重建后可解析");
ok(M.bytesEqual(rebuiltPlain.slice(prPlain.audioOffset), FAKE_AUDIO), "无标签文件重建后音频段不变");

/* ---------- 5. ID3v1 尾标保留 ---------- */
var tail = new Uint8Array(128);
tail.set(asciiBytes("TAG"), 0);
tail.set(asciiBytes("OldTitle"), 3);
var fV1 = concat([M.buildTag([M.encodeFrame("TIT2", utf16leBomPayload("旧"), 3)], 3), FAKE_AUDIO, tail]);
var pV1 = M.parseId3(fV1);
eq(pV1.hasId3v1, true, "含 TAG 尾标时 hasId3v1 为 true");
var rebuiltV1 = M.rebuildMp3(fV1, { title: "新" }, null, pV1.unknownFrames);
ok(M.bytesEqual(rebuiltV1.slice(rebuiltV1.length - 128), tail), "重建后 ID3v1 尾标 128 字节原样保留");

/* ---------- 6. 校验 / 命名 / MP3 判定 ---------- */
ok(M.validateTrack("3"), "音轨 3 合法");
ok(M.validateTrack("3/12"), "音轨 3/12 合法");
ok(M.validateTrack(""), "音轨空值合法（表示删除）");
ok(!M.validateTrack("3/"), "音轨 3/ 非法");
ok(!M.validateTrack("abc"), "音轨 abc 非法");
ok(!M.validateTrack("3-12"), "音轨 3-12 非法");
ok(!M.validateTrack("/12"), "音轨 /12 非法");
ok(!M.validateTrack("3/12/4"), "音轨 3/12/4 非法");
eq(M.suggestExportName("song.mp3"), "song-tagged.mp3", "导出命名 song.mp3");
eq(M.suggestExportName("my.song.MP3"), "my.song-tagged.mp3", "导出命名仅去最后一个扩展名");
eq(M.suggestExportName("song"), "song-tagged.mp3", "导出命名无扩展名直接加后缀");
ok(M.isMp3File("a.mp3", f23), "MP3 文件判定通过（ID3 头）");
ok(M.isMp3File("a.mp3", FAKE_AUDIO), "MP3 文件判定通过（帧同步）");
ok(!M.isMp3File("a.wav", f23), "非 .mp3 文件名拒绝");
ok(!M.isMp3File("a.mp3", new Uint8Array([1, 2, 3, 4])), "非 MP3 内容拒绝");
var demo = M.buildDemoBuffer();
var pDemo = M.parseId3(demo);
eq(pDemo.fields.title, "示例歌曲", "合成演示标题");
eq(pDemo.fields.track, "3/12", "合成演示音轨");
eq(pDemo.cover.mime, "image/png", "合成演示封面 MIME");
ok(pDemo.cover.imageBytes.length > 0, "合成演示封面非空");

/* ---------- 7. 注册与静态检查 ---------- */
var cats = fs.readFileSync("tools/categories.go", "utf8");
has(cats, "\"mp3_tag_editor\"", "注册 ID mp3_tag_editor");
has(cats, "\"/tools/mp3-tag-editor\"", "注册 Path /tools/mp3-tag-editor");
has(cats, "MP3 标签编辑器", "注册名称 MP3 标签编辑器");
var pathMatches = cats.match(/"\/tools\/[^"]+"/g) || [];
var uniqPaths = pathMatches.filter(function (v, i, a) { return a.indexOf(v) === i; });
eq(uniqPaths.length, 204, "注册 Path 总数 203→204");
var html = fs.readFileSync("templates/mp3_tag_editor.html", "utf8");
has(html, "只改 ID3v2 元数据、不做音频转码与音质处理", "页面可见：只改标签不转码");
has(html, "只支持 MP3", "页面可见：只支持 MP3");
has(html, "ID3v1 尾标原样保留", "页面可见：ID3v1 原样保留");
has(html, "请在常用播放器里核对一次", "页面可见：导出后核对提示");
has(html, "/tools/audio-trimmer", "互链音频裁剪器");
has(html, "/tools/audio-merger", "互链音频合并器");
has(html, "/tools/slowed-reverb", "互链变速混响器");
notHas(html, "截图美化器（通用）", "不硬凑未交付截图美化器（通用）");
notHas(html, "在线电台收听器", "不硬凑未交付在线电台收听器");
var js = fs.readFileSync("static/js/mp3_tag_editor.js", "utf8");
notHas(js, "fetch(", "JS 零 fetch");
notHas(js, "XMLHttpRequest", "JS 零 XHR");
notHas(html, "https://cdn", "HTML 零 CDN");

console.log("PASS: " + pass + ", FAIL: " + fail);
process.exit(fail === 0 ? 0 : 1);
