/* URL 即文档 · 文本分享链接生成器纯逻辑单元测试（零依赖）：node tests/url_note_share.test.js
* 覆盖：
* 1. base64url 编解码（空串/ASCII/中文/emoji/全字节/填充边界/非法字符）
* 2. DEFLATE 压缩解压往返（CompressionStream/DecompressionStream）
* 3. fragment 构建与解析（明文/加密标识、模式标识、非法格式）
* 4. 口令加密 AES-GCM 往返、错误口令报错、篡改报错、版本校验
* 5. encodeNote/decodeNote 端到端（文本/Markdown/加密/错误口令）
* 6. 长文本警告阈值（8191/8192/8193 边界、encodeNote warn 标记）
* 7. 轻量 Markdown 渲染（XSS 转义、标题/加粗/斜体/删除线/代码/链接协议过滤/图片/列表/引用/表格/围栏）
*/
"use strict";
var U = require("../static/js/url_note_share.js");

var pass = 0, fail = 0, total = 0;
function ok(cond, name) {
  total++;
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function contains(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（应包含 " + JSON.stringify(sub) + "）"); }
function notContains(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }
function bytesEq(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function throwsSync(fn, name) {
  total++;
  try { fn(); fail++; console.error("FAIL（应抛错）:", name); }
  catch (e) { pass++; }
}
async function throwsAsync(fn, name) {
  total++;
  try { await fn(); fail++; console.error("FAIL（应抛错）:", name); }
  catch (e) { pass++; }
}

async function main() {

/* ---------- 1. base64url ---------- */
eq(U.b64urlEncode(new Uint8Array(0)), "", "空字节数组编码为空串");
var ascii = U.utf8Encode("hello world");
eq(U.b64urlEncode(ascii), "aGVsbG8gd29ybGQ", "ASCII 编码");
ok(bytesEq(U.b64urlDecode("aGVsbG8gd29ybGQ"), ascii), "ASCII 解码往返");
var cjk = U.utf8Encode("中文测试");
var cjkEnc = U.b64urlEncode(cjk);
ok(cjkEnc.indexOf("+") === -1 && cjkEnc.indexOf("/") === -1 && cjkEnc.indexOf("=") === -1, "中文编码无 +/= 填充");
ok(bytesEq(U.b64urlDecode(cjkEnc), cjk), "中文解码往返");
var emoji = U.utf8Encode("🎉🚀");
ok(bytesEq(U.b64urlDecode(U.b64urlEncode(emoji)), emoji), "emoji 解码往返");
// 全 256 字节往返
var all = new Uint8Array(256);
for (var i = 0; i < 256; i++) all[i] = i;
ok(bytesEq(U.b64urlDecode(U.b64urlEncode(all)), all), "全 256 字节值往返");
// 填充边界：长度 %3 = 1 / 2 / 0
ok(bytesEq(U.b64urlDecode(U.b64urlEncode(new Uint8Array([1]))), new Uint8Array([1])), "1 字节（需 2 个填充位）往返");
ok(bytesEq(U.b64urlDecode(U.b64urlEncode(new Uint8Array([1, 2]))), new Uint8Array([1, 2])), "2 字节（需 1 个填充位）往返");
ok(bytesEq(U.b64urlDecode(U.b64urlEncode(new Uint8Array([1, 2, 3]))), new Uint8Array([1, 2, 3])), "3 字节（无填充）往返");
// 62/63 号字符映射为 -_
var tricky = new Uint8Array([251, 255, 190]);
var tenc = U.b64urlEncode(tricky);
ok(tenc.indexOf("+") === -1 && tenc.indexOf("/") === -1, "62/63 字符映射为 -_");
ok(bytesEq(U.b64urlDecode(tenc), tricky), "62/63 字符解码往返");
throwsSync(function () { U.b64urlDecode("ab$c"); }, "非法字符 $ 抛错");
throwsSync(function () { U.b64urlDecode("a b"); }, "空格非法抛错");
throwsSync(function () { U.b64urlDecode("abcde"); }, "长度 %4==1 非法抛错");
eq(U.b64urlDecode("").length, 0, "空串解码为空数组");

/* ---------- 2. DEFLATE 往返 ---------- */
var raw1 = U.utf8Encode("hello world ".repeat(100));
var c1 = await U.deflateRaw(raw1);
ok(c1.length < raw1.length, "可压缩文本压缩后更小");
ok(bytesEq(await U.inflateRaw(c1), raw1), "DEFLATE 往返（ASCII 长文）");
var raw2 = U.utf8Encode("中文长文本。".repeat(500) + "🎉");
ok(bytesEq(await U.inflateRaw(await U.deflateRaw(raw2)), raw2), "DEFLATE 往返（中文+emoji）");
ok(bytesEq(await U.inflateRaw(await U.deflateRaw(new Uint8Array(0))), new Uint8Array(0)), "DEFLATE 往返（空）");
var raw3 = new Uint8Array(1000);
for (var j = 0; j < 1000; j++) raw3[j] = (j * 37) % 256;
ok(bytesEq(await U.inflateRaw(await U.deflateRaw(raw3)), raw3), "DEFLATE 往返（伪随机字节）");
await throwsAsync(function () { return U.inflateRaw(new Uint8Array([1, 2, 3, 4])); }, "损坏数据解压抛错");

/* ---------- 3. fragment 解析 ---------- */
var p1 = U.parseFragment("#u1,t,aGVsbG8");
ok(p1.ok && p1.markdown === false && p1.encrypted === false, "明文纯文本 fragment 解析");
ok(bytesEq(p1.payload, U.b64urlDecode("aGVsbG8")), "解析出 payload 字节");
var p2 = U.parseFragment("u1,m,E,aGVsbG8");
ok(p2.ok && p2.markdown === true && p2.encrypted === true, "加密 Markdown fragment 解析（无 # 前缀）");
eq(U.parseFragment("").ok, false, "空 hash 解析失败");
eq(U.parseFragment("#").ok, false, "# 空 fragment 解析失败");
eq(U.parseFragment("#x1,t,abc").ok, false, "错误版本前缀解析失败");
eq(U.parseFragment("#u1").ok, false, "缺少段解析失败");
eq(U.parseFragment("#u1,t").ok, false, "缺少 payload 解析失败");
eq(U.parseFragment("#u1,x,abc").ok, false, "未知模式解析失败");
eq(U.parseFragment("#u1,t,,abc").ok, false, "多余空段解析失败");
eq(U.parseFragment("#u1,t,").ok, false, "空 payload 解析失败");
eq(U.parseFragment("#u1,t,ab$c").ok, false, "非法 base64 payload 解析失败");
eq(U.parseFragment("#u1,m,E,").ok, false, "加密模式空 payload 解析失败");

/* ---------- 4. AES-GCM 口令加密 ---------- */
var plain = U.utf8Encode("这是秘密内容 secret 123");
var blob = await U.encryptBlob(plain, "my-password-123");
ok(blob.length > 1 + 16 + 12 + 16, "加密包包含版本+盐+IV+密文+标签");
eq(blob[0], 1, "加密包版本字节为 1");
ok(bytesEq(await U.decryptBlob(blob, "my-password-123"), plain), "正确口令解密往返");
var blob2 = await U.encryptBlob(plain, "my-password-123");
ok(!bytesEq(blob, blob2), "两次加密盐/IV 随机，密文不同");
await throwsAsync(function () { return U.decryptBlob(blob, "wrong-password"); }, "错误口令解密抛错");
var tampered = new Uint8Array(blob);
tampered[tampered.length - 1] ^= 0xff;
await throwsAsync(function () { return U.decryptBlob(tampered, "my-password-123"); }, "篡改密文解密抛错（GCM 标签校验）");
var badver = new Uint8Array(blob); badver[0] = 9;
await throwsAsync(function () { return U.decryptBlob(badver, "my-password-123"); }, "错误版本字节抛错");
await throwsAsync(function () { return U.decryptBlob(new Uint8Array([1, 2, 3]), "pw"); }, "过短加密包抛错");
await throwsAsync(function () { return U.encryptBlob(plain, ""); }, "空口令加密抛错");
await throwsAsync(function () { return U.decryptBlob(blob, ""); }, "空口令解密抛错");

/* ---------- 5. encodeNote/decodeNote 端到端 ---------- */
var e1 = await U.encodeNote({ text: "Hello 分享测试", markdown: false });
ok(e1.fragment.indexOf("#u1,t,") === 0, "明文纯文本 fragment 前缀");
ok(!e1.warn, "短文本无警告");
var d1 = await U.decodeNote(U.parseFragment(e1.fragment));
eq(d1.text, "Hello 分享测试", "明文纯文本端到端往返");
var mdSrc = "# 标题\n\n**加粗** 与 `代码`\n\n- 列表1\n- 列表2";
var e2 = await U.encodeNote({ text: mdSrc, markdown: true });
ok(e2.fragment.indexOf("#u1,m,") === 0, "明文 Markdown fragment 前缀");
var d2 = await U.decodeNote(U.parseFragment(e2.fragment));
eq(d2.text, mdSrc, "明文 Markdown 端到端往返");
var e3 = await U.encodeNote({ text: "机密笔记内容", markdown: true, password: "s3cr3t!" });
ok(e3.fragment.indexOf("#u1,m,E,") === 0, "加密 fragment 前缀");
var d3 = await U.decodeNote(U.parseFragment(e3.fragment), "s3cr3t!");
eq(d3.text, "机密笔记内容", "加密端到端正确口令往返");
await throwsAsync(function () { return U.decodeNote(U.parseFragment(e3.fragment), "bad"); }, "加密端到端错误口令抛错");
await throwsAsync(function () { return U.decodeNote(U.parseFragment(e3.fragment)); }, "加密端到端缺口令抛错");
await throwsAsync(function () { return U.decodeNote({ ok: false, error: "x" }); }, "非法解析结果 decodeNote 抛错");
var eEmpty = await U.encodeNote({ text: "", markdown: false });
var dEmpty = await U.decodeNote(U.parseFragment(eEmpty.fragment));
eq(dEmpty.text, "", "空文本端到端往返");

/* ---------- 6. 长文本警告 ---------- */
ok(!U.isTooLong(8191), "8191 字节不警告");
ok(!U.isTooLong(8192), "8192 字节不警告（边界）");
ok(U.isTooLong(8193), "8193 字节警告");
var bigArr = [];
for (var bi = 0; bi < 3000; bi++) bigArr.push("第" + bi + "段：长文本警告测试内容，难以压缩的随机描述" + (bi * 7919 % 100000));
var bigText = bigArr.join("。"); // 原文约 90KB，压缩后仍 >8KB
var eBig = await U.encodeNote({ text: bigText, markdown: false });
ok(eBig.compressedBytes > 8192, "大文本压缩后仍超 8KB（前置条件）");
ok(eBig.warn, "大文本 encodeNote 标记 warn");
var dBig = await U.decodeNote(U.parseFragment(eBig.fragment));
eq(dBig.text, bigText, "大文本端到端往返");

/* ---------- 7. Markdown 渲染 ---------- */
var r1 = U.renderMarkdown("# 一级标题");
contains(r1, "<h1>一级标题</h1>", "h1 渲染");
var r2 = U.renderMarkdown("### 三级");
contains(r2, "<h3>三级</h3>", "h3 渲染");
var r3 = U.renderMarkdown("**加粗** 和 *斜体* 和 ~~删除~~ 和 `代码`");
contains(r3, "<strong>加粗</strong>", "加粗");
contains(r3, "<em>斜体</em>", "斜体");
contains(r3, "<del>删除</del>", "删除线");
contains(r3, "<code>代码</code>", "行内代码");
var r4 = U.renderMarkdown("<script>alert(1)</script>");
notContains(r4, "<script>", "script 标签被转义");
contains(r4, "&lt;script&gt;", "script 转义为实体");
var r5 = U.renderMarkdown("[百度](https://www.baidu.com)");
contains(r5, 'href="https://www.baidu.com"', "https 链接保留");
contains(r5, 'target="_blank"', "外链新窗口");
var r6 = U.renderMarkdown("[点我](javascript:alert(1))");
notContains(r6, "javascript:", "javascript: 协议被拦截");
contains(r6, 'href="#"', "危险链接降级为 #");
var r7 = U.renderMarkdown("[x](vbscript:msgbox(1))");
notContains(r7, "vbscript:", "vbscript: 协议被拦截");
var r8 = U.renderMarkdown("![图](https://example.com/a.png)");
contains(r8, "<img", "图片渲染");
contains(r8, 'src="https://example.com/a.png"', "图片 src 保留");
var r9 = U.renderMarkdown("![x](javascript:alert(1))");
notContains(r9, "javascript:", "图片 javascript: 被拦截");
var r10 = U.renderMarkdown("- 苹果\n- 香蕉\n- 橙子");
contains(r10, "<ul>", "无序列表");
eq((r10.match(/<li>/g) || []).length, 3, "无序列表 3 项");
var r11 = U.renderMarkdown("1. 第一\n2. 第二");
contains(r11, "<ol>", "有序列表");
eq((r11.match(/<li>/g) || []).length, 2, "有序列表 2 项");
var r12 = U.renderMarkdown("> 引用内容");
contains(r12, "<blockquote>", "引用块");
contains(r12, "引用内容", "引用文本");
var r13 = U.renderMarkdown("```js\nvar a = 1 < 2;\n```");
contains(r13, "<pre><code", "代码围栏");
contains(r13, 'class="language-js"', "代码语言类名");
notContains(r13, "1 < 2", "代码内 < 被转义");
contains(r13, "1 &lt; 2", "代码内转义实体");
var r14 = U.renderMarkdown("```\n未闭合代码");
contains(r14, "<pre><code", "未闭合围栏容错");
var r15 = U.renderMarkdown("| 姓名 | 年龄 |\n| --- | --- |\n| 张三 | 18 |");
contains(r15, "<table>", "表格渲染");
contains(r15, "<th>姓名</th>", "表头");
contains(r15, "<td>张三</td>", "单元格");
var r16 = U.renderMarkdown("第一段\n\n第二段");
eq((r16.match(/<p>/g) || []).length, 2, "空行分段为两个段落");
var r17 = U.renderMarkdown("---");
contains(r17, "<hr>", "分隔线");
var r18 = U.renderMarkdown("[a](https://a.com) 与 `**不是加粗**`");
contains(r18, "<code>**不是加粗**</code>", "代码 span 内标记不被二次渲染");
var r19 = U.renderMarkdown("**[链接](https://x.com)**");
contains(r19, "<strong>", "加粗包裹链接");
contains(r19, "<a href=", "链接在加粗内渲染");
var r20 = U.renderMarkdown("[t](JaVaScRiPt:alert(1))");
notContains(r20, "JaVaScRiPt", "大小写混淆 javascript: 被拦截");
eq(U.escapeHtml("&<>\"'"), "&amp;&lt;&gt;&quot;&#39;", "escapeHtml 全字符");
eq(U.sanitizeUrl("https://x.com"), "https://x.com", "sanitizeUrl 正常 URL");
eq(U.sanitizeUrl("/相对/路径"), "/相对/路径", "sanitizeUrl 相对路径保留");
eq(U.sanitizeUrl("data:text/html,hi", false), "#", "data: 非图片被拦截");
eq(U.sanitizeUrl("data:image/png;base64,aaa", true), "data:image/png;base64,aaa", "data:image 允许");
eq(U.FRAG_PREFIX, "u1", "导出版本前缀常量");
eq(U.WARN_COMPRESSED_BYTES, 8192, "导出警告阈值常量");

console.log("\nURL NOTE SHARE TESTS: pass=" + pass + " fail=" + fail + " total=" + total);
if (fail > 0 || total < 80) {
  console.error(fail > 0 ? "测试失败！" : "断言数不足 80（实得 " + total + "）！");
  process.exit(1);
}
console.log("全部通过（断言数 " + total + " ≥ 80）");
}

main().catch(function (e) { console.error("测试异常：", e); process.exit(1); });
