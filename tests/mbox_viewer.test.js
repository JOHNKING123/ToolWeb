/* MBOX 邮件存档查看器纯逻辑单元测试（零依赖）：node tests/mbox_viewer.test.js
 * 覆盖：From 切分、折叠行、encoded-word 解码、quoted-printable/base64 解码、
 * multipart 解析与附件抽取、整封解析、搜索过滤、源码零 fetch/XHR。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var mv = require("../static/js/mbox_viewer.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "mbox_viewer.js"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function contains(hay, needle, name) { ok(String(hay).indexOf(needle) !== -1, name + "（期望包含 " + JSON.stringify(needle) + "）"); }
function dec(bytes, cs) { return mv.decodeBytes(bytes, cs); }

/* ---------- 1. From 行切分 ---------- */
(function () {
    var raws = mv.splitMbox(mv.SAMPLE_MBOX);
    eq(raws.length, 3, "示例 MBOX 切出 3 个原始块（含 1 损坏块）");
    ok(raws[0].indexOf("From: Alice") !== -1, "第 1 块是 Alice 的邮件");
    ok(raws[1].indexOf("BOUNDARY_MIXED_001") !== -1, "第 2 块是 multipart 邮件");
    eq(mv.splitMbox("").length, 0, "空输入切出 0 块");
    eq(mv.splitMbox("From a@x.com Mon\n\nbody\nFrom b@x.com Tue\n\nbody2\n").length, 2, "两封简单邮件切分");
    eq(mv.splitMbox("垃圾头行\n\nFrom a@x.com Mon\n\nbody\n").length, 1, "首个 From 之前的垃圾行被丢弃");
    var esc = mv.splitMbox("From a@x.com Mon\n\n正文行\n>From 行首转义行\nFrom b@x.com Tue\n\nbody\n");
    eq(esc.length, 2, "正文内 >From 不触发切分");
    ok(esc[0].indexOf("\nFrom 行首转义行") !== -1, ">From 还原为 From");
    var empty = mv.splitMbox("From a@x.com Mon\nFrom b@x.com Tue\n\nbody\n");
    eq(empty.length, 2, "连续 From 行保留空块（后续判为损坏跳过）");
})();

/* ---------- 2. 头部解析与折叠行 ---------- */
(function () {
    var h = mv.parseHeaders("Subject: =?UTF-8?B?5rWL6K+V?=\n =?UTF-8?B?5oql5ZGK?=\nFrom: =?GBK?Q?=D5=C5=C8=FD?= <z@test>\nReceived: from a\nReceived: from b\nX-Bad-Line-Without-Colon\nDate: Tue, 21 Oct 2026 14:30:00 +0800");
    eq(mv.getHeader(h, "subject"), "=?UTF-8?B?5rWL6K+V?= =?UTF-8?B?5oql5ZGK?=", "折叠行展开（空格连接）");
    eq(mv.getHeader(h, "received"), "from b", "重复头取最后一个");
    eq(mv.getHeaderFirst(h, "received"), "from a", "重复头取第一个");
    eq(mv.getHeader(h, "SUBJECT"), mv.getHeader(h, "subject"), "头名大小写不敏感");
    eq(mv.getHeader(h, "no-such-header"), "", "缺失头返回空串");
    eq(h.order.length, 5, "无冒号损坏行被忽略（subject/from/received×2/date 共 5 条有效头记录）");
})();

/* ---------- 3. encoded-word 解码 ---------- */
(function () {
    eq(mv.decodeEncodedWords("=?UTF-8?B?TUJPWCDlrZjmoaPmtYvor5XkuLvpopg=?="), "MBOX 存档测试主题", "UTF-8/BASE64 中文主题");
    eq(mv.decodeEncodedWords("=?GBK?Q?=D5=C5=C8=FD?= <z@test>"), "张三 <z@test>", "GBK/Q 编码中文名");
    eq(mv.decodeEncodedWords("=?UTF-8?B?5rWL6K+V?= =?UTF-8?B?5oql5ZGK?="), "测试报告", "相邻 encoded-word 间空白被忽略");
    eq(mv.decodeEncodedWords("Re: plain ascii subject"), "Re: plain ascii subject", "纯 ASCII 不变");
    eq(mv.decodeEncodedWords("=?UTF-8?Q?=E4=B8=AD=E6=96=87?="), "中文", "UTF-8/Q 解码");
    eq(mv.decodeEncodedWords("prefix =?UTF-8?B?5Lit5paH?= suffix"), "prefix 中文 suffix", "混合文本前后保留");
    eq(mv.decodeEncodedWords("=?BAD-CHARSET?B?QUJD?="), "ABC", "未知 charset 回退 latin1/utf-8 不抛错");
    eq(mv.decodeEncodedWords("=?UTF-8?B?not-base64!!!?="), "=?UTF-8?B?not-base64!!!?=", "非法 base64 保留原文");
    ok(mv.decodeEncodedWords("=?UTF-8?B?5byg5LiJ?= <zhangsan@example.com>").indexOf("张三") === 0, "From 整串解码");
})();

/* ---------- 4. quoted-printable 解码 ---------- */
(function () {
    eq(dec(mv.decodeQuotedPrintable("Hello=20World"), "utf-8"), "Hello World", "=20 解码为空格");
    eq(dec(mv.decodeQuotedPrintable("line1=\nline2"), "utf-8"), "line1line2", "软换行 =LF 去除");
    eq(dec(mv.decodeQuotedPrintable("line1=\r\nline2"), "utf-8"), "line1line2", "软换行 =CRLF 去除");
    eq(dec(mv.decodeQuotedPrintable("=E4=B8=AD=E6=96=87"), "utf-8"), "中文", "UTF-8 中文 QP 解码");
    eq(dec(mv.decodeQuotedPrintable("a_b"), "utf-8"), "a_b", "QP 正文下划线保持原样（区别于 encoded-word Q）");
    eq(dec(mv.decodeQuotedPrintable("100=25"), "utf-8"), "100%", "=25 解码为百分号");
})();

/* ---------- 5. base64 解码 ---------- */
(function () {
    eq(dec(mv.b64ToBytes("SGVsbG8="), "utf-8"), "Hello", "ASCII base64");
    eq(dec(mv.b64ToBytes("5Lit5paH"), "utf-8"), "中文", "UTF-8 中文 base64");
    eq(dec(mv.b64ToBytes("SGVs\nbG8=\r\n"), "utf-8"), "Hello", "base64 内换行/空白被清理");
})();

/* ---------- 6. multipart 解析与附件抽取 ---------- */
(function () {
    var raws = mv.splitMbox(mv.SAMPLE_MBOX);
    var root = mv.parseMime(raws[1]);
    eq(root.contentType.full, "multipart/mixed", "顶层 multipart/mixed");
    eq(root.parts.length, 2, "mixed 下 2 个子 part");
    eq(root.parts[0].contentType.full, "multipart/alternative", "嵌套 alternative");
    eq(root.parts[0].parts.length, 2, "alternative 下 2 个版本");
    eq(root.parts[1].isAttachment, true, "base64 part 识别为附件");
    eq(root.parts[1].filename, "测试报告.txt", "附件文件名 encoded-word 解码");
    eq(dec(root.parts[1].bytes, "utf-8"), "Hello MBOX 附件内容\n第二行\n", "附件 bytes 与源一致");
    var alt = root.parts[0];
    ok(alt.parts[0].text.indexOf("这是第二封邮件的纯文本正文") === 0, "alternative text/plain QP 解码");
    ok(alt.parts[1].text.indexOf("HTML") !== -1, "alternative text/html 解析");
    var plain = mv.parseMime(raws[0]);
    eq(plain.contentType.full, "text/plain", "纯文本邮件 content-type");
    ok(plain.text.indexOf("这是第一封测试邮件") !== -1, "8bit 纯文本正文直接可用");
})();

/* ---------- 7. 整封解析（示例 MBOX 端到端） ---------- */
(function () {
    var r = mv.parseMbox(mv.SAMPLE_MBOX);
    eq(r.messages.length, 2, "解析出 2 封有效邮件");
    eq(r.skipped, 1, "损坏块跳过计数 1");
    eq(r.skipReasons["缺失邮件头"], 1, "跳过原因为缺失邮件头");
    var m0 = r.messages[0], m1 = r.messages[1];
    eq(m0.from, "Alice <alice@example.com>", "第 1 封发件人");
    eq(m0.subject, "第一封纯文本邮件", "第 1 封主题无乱码");
    ok(m0.dateMs > 0, "第 1 封日期可解析");
    ok(m0.textBody.indexOf("这是第一封测试邮件") !== -1, "第 1 封正文可读");
    eq(m1.from, "张三 <zhangsan@example.com>", "第 2 封发件人 encoded-word 解码");
    eq(m1.subject, "MBOX 存档测试主题", "第 2 封主题无乱码");
    ok(m1.textBody.indexOf("quoted-printable 编码测试") !== -1, "第 2 封正文可读（alternative 取文本版）");
    eq(m1.attachments.length, 1, "第 2 封附件聚合 1 个");
    eq(m1.attachments[0].filename, "测试报告.txt", "附件文件名");
    eq(dec(m1.attachments[0].data, "utf-8"), "Hello MBOX 附件内容\n第二行\n", "附件下载内容与源一致");
    var bad = mv.parseMessage("From x@y.z Mon\n\nno colon headers here", 0);
    eq(bad.skipped, true, "无头部块标记跳过");
    var empty = mv.parseMessage("   \n  ", 0);
    eq(empty.skipped, true, "空块标记跳过");
})();

/* ---------- 8. 全文搜索 ---------- */
(function () {
    var r = mv.parseMbox(mv.SAMPLE_MBOX);
    var ms = r.messages;
    function idx(q) { return mv.searchMessages(ms, q).map(function (m) { return m.index; }).join(","); }
    eq(idx("MBOX 存档"), "1", "搜主题关键词定位第 2 封");
    eq(idx("测试报告"), "1", "搜附件名定位含附件邮件");
    eq(idx("alice"), "0,1", "搜发件人（第 2 封收件人含 alice）");
    eq(idx("ALICE"), "0,1", "搜索不区分大小写");
    eq(idx("quoted-printable"), "1", "搜正文内容");
    eq(idx(""), "0,1", "空查询返回全部");
    eq(idx("不存在的关键词xyz"), "", "无匹配返回空");
})();

/* ---------- 9. 渲染辅助 ---------- */
(function () {
    eq(mv.shortAddr('"张三" <zhangsan@example.com>'), "张三", "shortAddr 取名字");
    eq(mv.shortAddr("bob@example.com"), "bob@example.com", "shortAddr 无名字取地址");
    eq(mv.shortAddr(""), "(未知发件人)", "shortAddr 空值兜底");
    ok(mv.stripHtml("<p>hi<b>x</b></p>").indexOf("hi") !== -1, "stripHtml 去标签");
    ok(mv.stripHtml("<script>alert(1)</script><p>ok</p>").indexOf("alert") === -1, "stripHtml 去 script");
    eq(mv.fmtSize(500), "500 B", "fmtSize B");
    eq(mv.fmtSize(2048), "2.0 KB", "fmtSize KB");
})();

/* ---------- 10. 源码零 fetch/XHR ---------- */
(function () {
    ok(!/fetch\s*\(/.test(SRC), "源码无 fetch(");
    ok(!/XMLHttpRequest/.test(SRC), "源码无 XMLHttpRequest");
    ok(!/\beval\s*\(/.test(SRC), "源码无 eval(");
    ok(!/Function\s*\(/.test(SRC), "源码无 new Function");
})();

console.log("PASS " + pass + " / FAIL " + fail + "（共 " + (pass + fail) + " 断言）");
process.exit(fail ? 1 : 0);
