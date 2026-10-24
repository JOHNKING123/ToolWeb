/* 极简专注写作纯逻辑单元测试（零依赖）：node tests/focus_writer.test.js
 * 覆盖：
 * 1. 字数/字符统计（中英混排、空串、标点、换行）
 * 2. localStorage 键名与序列化往返（含非法 JSON 容错）
 * 3. 文件名清洗（非法字符、超长、空标题、首尾符号）
 * 4. 下载内容组装（.md/.txt、有标题/无标题）
 * 5. 模板静态检查（SEO 面板/控件 id/隐私文案/全屏与 Esc）
 * 6. 零网络请求（源码无 fetch/XHR）
 * 7. 注册检查（categories.go：ID/Path/Category/New，总数 163）
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/focus_writer.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function deepEq(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "focus_writer.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "focus_writer.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. 字数/字符统计 ---------- */
eq(M.countStats("").words, 0, "空串字数 0");
eq(M.countStats("").chars, 0, "空串字符 0");
deepEq(M.countStats("你好世界"), { words: 4, chars: 4 }, "纯中文 4 字 4 字符");
deepEq(M.countStats("hello world"), { words: 2, chars: 11 }, "纯英文 2 词 11 字符");
deepEq(M.countStats("你好 world 123"), { words: 4, chars: 12 }, "中英混排：你好(2)+world+123=4 词，12 字符");
deepEq(M.countStats("你好，世界！Hello, world."), { words: 6, chars: 19 }, "含标点混排：4 汉字+hello+world=6 词，19 字符");
deepEq(M.countStats("a  b\nc"), { words: 3, chars: 5 }, "多空格与换行：3 词，换行不计字符");
eq(M.countStats("2026年10月24日").words, 6, "数字串计 1 词：2026+年+10+月+24+日=6");
eq(M.countStats("   ").words, 0, "纯空白字数 0");
eq(M.countStats(null).words, 0, "null 容错字数 0");
eq(M.countStats(undefined).chars, 0, "undefined 容错字符 0");

/* ---------- 2. 键名与序列化往返 ---------- */
eq(M.STORAGE_KEY, "focus_writer_draft_v1", "存储键名固定");
var raw = M.serializeDraft("我的标题", "正文第一行\n第二行", "2026-10-24T19:00:00.000Z");
var back = M.parseDraft(raw);
eq(back.title, "我的标题", "往返：标题原样");
eq(back.body, "正文第一行\n第二行", "往返：正文含换行原样");
eq(back.savedAt, "2026-10-24T19:00:00.000Z", "往返：时间戳原样");
eq(M.parseDraft(""), null, "空串解析为 null");
eq(M.parseDraft("not-json{"), null, "非法 JSON 解析为 null");
eq(M.parseDraft(null), null, "null 解析为 null");
deepEq(M.parseDraft('{"title":123}'), { title: "", body: "", savedAt: "" }, "非字符串字段回落空串");
ok(/^\d{2}:\d{2}$/.test(M.formatSavedTime("2026-10-24T19:05:00.000Z")), "保存时间格式为 HH:MM（本地时区换算，不硬编码小时）");
eq(M.formatSavedTime("bad"), "", "非法时间返回空串");
eq(M.formatSavedTime(""), "", "空时间返回空串");

/* ---------- 3. 文件名清洗 ---------- */
eq(M.sanitizeTitleForFilename("我的文章"), "我的文章", "中文标题原样保留");
eq(M.sanitizeTitleForFilename("a/b\\c:d*e?f\"g<h>i|j"), "a-b-c-d-e-f-g-h-i-j", "全部非法字符换横线");
eq(M.sanitizeTitleForFilename(""), "untitled", "空标题回落 untitled");
eq(M.sanitizeTitleForFilename("///"), "untitled", "全非法标题回落 untitled");
eq(M.sanitizeTitleForFilename("  ...标题...  "), "标题", "首尾点与空白去掉");
eq(M.sanitizeTitleForFilename("a---b"), "a-b", "连续横线压成一个");
ok(M.sanitizeTitleForFilename(new Array(80).join("x")).length <= 50, "超长标题截断到 50 字以内");
eq(M.buildDownloadFilename("我的文章", "md", new Date(2026, 9, 24)), "focus-writer-我的文章-2026-10-24.md", "md 文件名：前缀+标题+日期");
eq(M.buildDownloadFilename("", "txt", new Date(2026, 9, 24)), "focus-writer-untitled-2026-10-24.txt", "txt 空标题文件名");
eq(M.buildDownloadFilename("a/b", "md", new Date(2026, 9, 24)), "focus-writer-a-b-2026-10-24.md", "文件名中非法字符已清洗");

/* ---------- 4. 下载内容组装 ---------- */
eq(M.buildMarkdownContent("标题", "正文"), "# 标题\n\n正文", "md：标题加 # 前缀+空行+正文");
eq(M.buildTextContent("标题", "正文"), "标题\n\n正文", "txt：标题原样+空行+正文");
eq(M.buildMarkdownContent("", "只有正文"), "只有正文", "md 无标题只有正文");
eq(M.buildTextContent("", "只有正文"), "只有正文", "txt 无标题只有正文");
eq(M.buildMarkdownContent("标题", "第一行\n第二行"), "# 标题\n\n第一行\n第二行", "md 正文换行原样保留");
eq(M.buildTextContent("标题", ""), "标题\n\n", "txt 空正文仍保留标题行");

/* ---------- 5. 模板静态检查 ---------- */
ok(TPL_SRC.indexOf("https://www.johnkingzcq123.xyz/tools/focus-writer") !== -1, "模板含 canonical/OG 链接");
ok(TPL_SRC.indexOf("application/ld+json") !== -1, "模板含 JSON-LD");
ok(TPL_SRC.indexOf("id=\"fw-title\"") !== -1, "模板含标题输入框");
ok(TPL_SRC.indexOf("id=\"fw-body\"") !== -1, "模板含写作面");
ok(TPL_SRC.indexOf("id=\"fw-fullscreen\"") !== -1, "模板含全屏专注按钮");
ok(TPL_SRC.indexOf("id=\"fw-exit-fullscreen\"") !== -1, "模板含退出全屏按钮");
ok(TPL_SRC.indexOf("Escape") !== -1, "模板或脚本含 Esc 退出说明");
ok(TPL_SRC.indexOf("id=\"fw-copy\"") !== -1, "模板含复制全文按钮");
ok(TPL_SRC.indexOf("id=\"fw-download-md\"") !== -1, "模板含下载 .md 按钮");
ok(TPL_SRC.indexOf("id=\"fw-download-txt\"") !== -1, "模板含下载 .txt 按钮");
ok(TPL_SRC.indexOf("id=\"fw-clear\"") !== -1, "模板含清空草稿按钮");
ok(TPL_SRC.indexOf("id=\"fw-stats-toggle\"") !== -1, "模板含字数统计开关");
ok(TPL_SRC.indexOf("id=\"fw-stats\"") !== -1 && TPL_SRC.indexOf("display:none") !== -1, "字数统计区默认隐藏");
ok(TPL_SRC.indexOf("只存在这台设备的浏览器里") !== -1, "隐私文案：仅本机保存可见");
ok(TPL_SRC.indexOf("换设备") !== -1 && TPL_SRC.indexOf("清缓存") !== -1, "隐私文案：换设备/清缓存即失");
ok(TPL_SRC.indexOf("仅统计正文，不含标题") !== -1, "字数统计口径文案：仅正文不含标题");
ok(TPL_SRC.indexOf("/tools/static/js/focus_writer.js") !== -1, "模板引用 focus_writer.js");
ok(TPL_SRC.indexOf("常见问题") !== -1 && TPL_SRC.indexOf("使用说明") !== -1 && TPL_SRC.indexOf("相关工具") !== -1, "SEO 面板：使用说明/FAQ/相关工具齐全");
ok(JS_SRC.indexOf("fw-fullscreen") !== -1 && JS_SRC.indexOf("Escape") !== -1, "脚本含全屏切换与 Esc 退出逻辑");
ok(JS_SRC.indexOf("confirm(") !== -1, "清空草稿有二次确认");
ok(JS_SRC.indexOf("execCommand") !== -1, "复制失败有 execCommand 降级");
ok(JS_SRC.indexOf("手动全选复制") !== -1, "复制失败有手动降级提示");

/* ---------- 6. 零网络请求 ---------- */
ok(!/\bfetch\s*\(/.test(JS_SRC), "脚本无 fetch 调用");
ok(!/XMLHttpRequest/.test(JS_SRC), "脚本无 XMLHttpRequest");
ok(!/axios|jQuery|\$\.ajax/.test(JS_SRC), "脚本无第三方请求库");

/* ---------- 7. 注册检查 ---------- */
ok(GO_SRC.indexOf('"focus_writer"') !== -1, "categories.go 含 ID focus_writer");
ok(GO_SRC.indexOf('"/tools/focus-writer"') !== -1, "categories.go 含 Path /tools/focus-writer");
ok(GO_SRC.indexOf('"极简专注写作"') !== -1, "categories.go 含名称极简专注写作");
var paths = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
var uniquePaths = paths.filter(function (v, i, a) { return a.indexOf(v) === i; });
eq(uniquePaths.length, 163, "注册总数 162→163 Path");
var fwBlock = GO_SRC.slice(GO_SRC.indexOf('"focus_writer"'), GO_SRC.indexOf('"focus_writer"') + 900);
ok(fwBlock.indexOf('Category:    "文本工具"') !== -1, "注册 Category 为文本工具");
ok(fwBlock.indexOf("New:         true") !== -1, "注册 New 为 true");
ok(fwBlock.indexOf('"edit_note"') !== -1, "注册 Icon 为 edit_note");

console.log("focus_writer: " + pass + " passed, " + fail + " failed");
if (fail > 0) process.exit(1);
