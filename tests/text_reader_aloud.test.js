/* 文本朗读器纯逻辑单元测试（零依赖）：node tests/text_reader_aloud.test.js
 * 覆盖：
 * 1. 分句（中文段、英文段、中英混排、换行、连续标点、空句丢弃、空文本）
 * 2. 缩写与小数点不误切（Dr./Mr./v1.2，启发式定性）
 * 3. 语速/音调钳制（上下界、界内、非法值）
 * 4. 发音人回退链（指定名 → zh → 默认 → 首个 → 空列表）
 * 5. 队列推进（推进、读完、空队列、切片起读）
 * 6. 模板静态检查（SEO 面板/四按钮/滑杆/发音人/真限制文案/不支持提示）
 * 7. 零网络请求（源码无 fetch/XHR、无导出音频按钮）
 * 8. 注册检查（categories.go：ID/Path/Category/Icon/New，总数 164）
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/text_reader_aloud.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function deepEq(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "text_reader_aloud.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "text_reader_aloud.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. 分句 ---------- */
deepEq(M.splitSentences("你好世界。这是一个测试！真的吗？"), ["你好世界。", "这是一个测试！", "真的吗？"], "纯中文三句");
deepEq(M.splitSentences("Hello world. This is a test! Really?"), ["Hello world.", "This is a test!", "Really?"], "纯英文三句");
deepEq(M.splitSentences("校对长文时，眼睛最容易漏错。把文章听一遍，语病自己跳出来。This tool reads aloud locally. No audio file is exported."),
  ["校对长文时，眼睛最容易漏错。", "把文章听一遍，语病自己跳出来。", "This tool reads aloud locally.", "No audio file is exported."],
  "中英混排长文与手工分句一致");
deepEq(M.splitSentences("第一行。\n第二行！\n\n第三行？"), ["第一行。", "第二行！", "第三行？"], "换行切分且空行丢弃");
deepEq(M.splitSentences("真的吗？！太神奇了……"), ["真的吗？！", "太神奇了……"], "连续标点视为同一句句末");
deepEq(M.splitSentences("分号测试；下一句。"), ["分号测试；", "下一句。"], "中文分号切分");
deepEq(M.splitSentences("无标点的一整段话"), ["无标点的一整段话"], "无标点整段为一句");
deepEq(M.splitSentences(""), [], "空文本分句为空");
deepEq(M.splitSentences("   \n  "), [], "纯空白分句为空");
deepEq(M.splitSentences(null), [], "null 分句为空");
deepEq(M.splitSentences(undefined), [], "undefined 分句为空");
deepEq(M.splitSentences("第一句。。第二句。"), ["第一句。。", "第二句。"], "连续句号不产生空句");
deepEq(M.splitSentences("他说：“你好。”下一句。"), ["他说：“你好。”", "下一句。"], "句末后右引号并入该句");

/* ---------- 2. 缩写与小数点 ---------- */
deepEq(M.splitSentences("Dr. Smith came. He left."), ["Dr. Smith came.", "He left."], "Dr. 不误切");
deepEq(M.splitSentences("I met Mr. Wang yesterday. He was nice."), ["I met Mr. Wang yesterday.", "He was nice."], "Mr. 不误切");
deepEq(M.splitSentences("版本 v1.2 已发布。下一句。"), ["版本 v1.2 已发布。", "下一句。"], "小数点 v1.2 不误切");
deepEq(M.splitSentences("价格是 3.14 元。确实如此。"), ["价格是 3.14 元。", "确实如此。"], "小数 3.14 不误切");

/* ---------- 3. 语速/音调钳制 ---------- */
eq(M.clampRatePitch(1.0), 1.0, "界内 1.0 原样");
eq(M.clampRatePitch(0.5), 0.5, "下界 0.5 原样");
eq(M.clampRatePitch(2.0), 2.0, "上界 2.0 原样");
eq(M.clampRatePitch(0.1), 0.5, "低于下界钳制到 0.5");
eq(M.clampRatePitch(3.5), 2.0, "高于上界钳制到 2.0");
eq(M.clampRatePitch(0), 0.5, "0 钳制到 0.5");
eq(M.clampRatePitch(NaN), 1.0, "NaN 回落 1.0");
eq(M.clampRatePitch("1.5"), 1.5, "字符串数字 1.5 正常解析");
eq(M.clampRatePitch("abc"), 1.0, "非数字字符串回落 1.0");

/* ---------- 4. 发音人回退链 ---------- */
var voices = [
  { name: "English US", lang: "en-US", default: false },
  { name: "Xiaoxiao", lang: "zh-CN", default: false },
  { name: "Default Voice", lang: "en-GB", default: true }
];
eq(M.pickVoice(voices, "English US").name, "English US", "指定名称优先命中");
eq(M.pickVoice(voices, "不存在的名字").name, "Xiaoxiao", "指定名缺失回退到 zh 发音人");
eq(M.pickVoice(voices, "").name, "Xiaoxiao", "无指定名时首选 zh 发音人");
eq(M.pickVoice([{ name: "A", lang: "en-US", default: false }, { name: "B", lang: "en-GB", default: true }], "").name, "B", "无 zh 时回退默认发音人");
eq(M.pickVoice([{ name: "A", lang: "en-US", default: false }], "").name, "A", "无 zh 无默认时回退第一个");
ok(M.pickVoice([], "") === null, "空列表返回 null，不崩溃");
ok(M.pickVoice(null, "") === null, "null 列表返回 null");

/* ---------- 5. 队列推进 ---------- */
eq(M.nextSentenceIndex(0, 3), 1, "第 0 句推进到第 1 句");
eq(M.nextSentenceIndex(1, 3), 2, "第 1 句推进到第 2 句");
eq(M.nextSentenceIndex(2, 3), -1, "最后一句推进返回 -1（读完）");
eq(M.nextSentenceIndex(0, 1), -1, "单句读完返回 -1");
eq(M.nextSentenceIndex(0, 0), -1, "空队列返回 -1");
deepEq(M.sentencesFrom(["a", "b", "c"], 1), ["b", "c"], "从第 1 句起读切片");
deepEq(M.sentencesFrom(["a", "b", "c"], 0), ["a", "b", "c"], "从第 0 句起读全量");
deepEq(M.sentencesFrom(["a", "b"], -1), ["a", "b"], "非法起始下标回落 0");

/* ---------- 6. 模板静态检查 ---------- */
ok(TPL_SRC.indexOf('{{define "text_reader_aloud"}}') !== -1, "模板 define 名为 text_reader_aloud");
ok(TPL_SRC.indexOf('id="tra-speak"') !== -1, "模板有朗读按钮");
ok(TPL_SRC.indexOf('id="tra-pause"') !== -1, "模板有暂停按钮");
ok(TPL_SRC.indexOf('id="tra-resume"') !== -1, "模板有继续按钮");
ok(TPL_SRC.indexOf('id="tra-stop"') !== -1, "模板有停止按钮");
ok(TPL_SRC.indexOf('id="tra-rate"') !== -1, "模板有语速滑杆");
ok(TPL_SRC.indexOf('id="tra-pitch"') !== -1, "模板有音调滑杆");
ok(TPL_SRC.indexOf('id="tra-voice"') !== -1, "模板有发音人下拉框");
ok(TPL_SRC.indexOf('id="tra-text"') !== -1, "模板有文本输入区");
ok(TPL_SRC.indexOf('id="tra-sentences"') !== -1, "模板有逐句列表容器");
ok(TPL_SRC.indexOf("https://www.johnkingzcq123.xyz/tools/text-reader-aloud") !== -1, "SEO canonical 正确");
ok(TPL_SRC.indexOf("application/ld+json") !== -1, "模板有 JSON-LD");
ok(TPL_SRC.indexOf("只在线朗读") !== -1 && TPL_SRC.indexOf("无音频导出") !== -1, "真限制文案：只在线朗读、无音频导出可见");
ok(TPL_SRC.indexOf("文本不出浏览器") !== -1, "真限制文案：文本不出浏览器可见");
ok(TPL_SRC.indexOf("当前浏览器不支持本地朗读") !== -1, "不支持浏览器提示可见");
ok(TPL_SRC.indexOf("桌面版 Chrome/Edge") !== -1, "不支持提示给出换用浏览器指引");
ok(TPL_SRC.indexOf("朗读完成") !== -1, "模板/文案提及朗读完成");
ok(TPL_SRC.indexOf("voiceschanged") !== -1, "模板提及 voiceschanged 异步补填");

/* ---------- 7. 零网络请求 / 无导出按钮 ---------- */
ok(!/\bfetch\s*\(/.test(JS_SRC), "JS 无 fetch 调用");
ok(!/XMLHttpRequest/.test(JS_SRC), "JS 无 XHR");
ok(!/\bfetch\s*\(/.test(TPL_SRC), "模板无 fetch 调用");
ok(!/XMLHttpRequest/.test(TPL_SRC), "模板无 XHR");
ok(TPL_SRC.indexOf("导出 MP3") === -1 || TPL_SRC.indexOf("不能") !== -1, "无导出音频按钮（仅 FAQ 说明不能导出）");
ok(!/id="tra-(export|download|save-audio)/.test(TPL_SRC), "无导出音频类按钮 id");
ok(JS_SRC.indexOf("speechSynthesis") !== -1, "JS 使用 speechSynthesis");
ok(JS_SRC.indexOf("voiceschanged") !== -1, "JS 监听 voiceschanged");

/* ---------- 8. 注册检查 ---------- */
ok(GO_SRC.indexOf('"text_reader_aloud"') !== -1, "categories.go 注册 ID text_reader_aloud");
ok(GO_SRC.indexOf('"/tools/text-reader-aloud"') !== -1, "categories.go 注册 Path /tools/text-reader-aloud");
var regBlock = GO_SRC.slice(GO_SRC.indexOf('"text_reader_aloud"'), GO_SRC.indexOf('"text_reader_aloud"') + 1200);
ok(regBlock.indexOf('"文本工具"') !== -1, "注册 Category 为文本工具");
ok(regBlock.indexOf('"volume_up"') !== -1, "注册 Icon 为 volume_up");
ok(regBlock.indexOf("New:") !== -1 && regBlock.indexOf("true") !== -1, "注册 New 为 true");
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).length;
eq(pathCount, 164, "注册总数 163→164 Path");

console.log("text_reader_aloud: " + pass + " passed, " + fail + " failed");
if (fail > 0) process.exit(1);
