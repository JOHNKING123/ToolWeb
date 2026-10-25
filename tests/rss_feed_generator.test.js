/* RSS／Atom 订阅源生成器纯逻辑单元测试（零依赖）：node tests/rss_feed_generator.test.js
 * 覆盖：XML 转义表、CDATA 分段、RFC 822／RFC 3339 换算、RSS 串联、
 * Atom 串联、guid 判定、enclosure 校验、必填与链接校验、格式切换、
 * 2 组示例、注册（180→181 Path）与零网络请求、模板真限制文案与互链。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/rss_feed_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（应包含 " + JSON.stringify(sub) + "）"); }
function notHas(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "rss_feed_generator.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "rss_feed_generator.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

var CH = { title: "示例博客", link: "https://example.com", description: "频道描述",
  language: "zh-CN", copyright: "", email: "", imageUrl: "" };
function item(over) {
  var base = { title: "第一篇", link: "https://example.com/posts/1",
    description: "正文", author: "作者甲", category: "专栏",
    pubDate: "2026-10-26T07:37", guid: "",
    enclosure: { url: "", length: "", type: "" } };
  Object.keys(over || {}).forEach(function (k) { base[k] = over[k]; });
  return base;
}

/* ---------- 1. XML 转义表 ---------- */
eq(M.escapeXmlText("A&B <C> \"D\" 'E'"), "A&amp;B &lt;C&gt; &quot;D&quot; &apos;E&apos;", "转义：五字符全表");
eq(M.escapeXmlAttr("https://example.com/?a=1&b=2"), "https://example.com/?a=1&amp;b=2", "转义：属性值含 &");
eq(M.escapeXmlText(""), "", "转义：空串");

/* ---------- 2. CDATA 分段 ---------- */
eq(M.cdataWrap("普通文本"), "<![CDATA[普通文本]]>", "CDATA：普通文本");
var cdataSplit = M.cdataWrap("前]]>后");
eq(cdataSplit, "<![CDATA[前]]]]><![CDATA[>后]]>", "CDATA：含 ]]> 分段续写");
/* 分段可还原：先把续写标记换回 ]]>，再剥掉首尾 CDATA 包裹，应得原文（不截断）。 */
var restored = cdataSplit.split("]]]]><![CDATA[>").join("]]>")
  .replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
eq(restored, "前]]>后", "CDATA：分段内容可还原、无截断");
var cdataMulti = M.cdataWrap("a]]>b]]>c");
ok(cdataMulti.split("]]]]><![CDATA[>").length === 3, "CDATA：多处 ]]> 均分段");

/* ---------- 3. 日期换算（本地时区） ---------- */
var D = new Date(2026, 9, 26, 7, 37, 0); /* 本地 2026-10-26 07:37:00 */
var offMin = -D.getTimezoneOffset();
var sign = offMin >= 0 ? "+" : "-";
var abs = Math.abs(offMin);
var off822 = sign + (Math.floor(abs / 60) < 10 ? "0" : "") + Math.floor(abs / 60) +
  (abs % 60 < 10 ? "0" : "") + (abs % 60);
var off3339 = off822.slice(0, 3) + ":" + off822.slice(3);
eq(M.formatRfc822(D), "Mon, 26 Oct 2026 07:37:00 " + off822, "RFC 822：星期／月份／时区偏移");
eq(M.formatRfc3339(D), "2026-10-26T07:37:00" + off3339, "RFC 3339：本地时间＋冒号时区");
ok(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} [+-]\d{4}$/.test(M.formatRfc822(D)), "RFC 822：正则形态");
ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(M.formatRfc3339(D)), "RFC 3339：正则形态");
ok(M.parseLocalDatetime("2026-10-26T07:37") instanceof Date, "解析：datetime-local 合法");
eq(M.parseLocalDatetime("2026-13-01T07:37"), null, "解析：非法月份");
eq(M.parseLocalDatetime("2026-02-30T07:37"), null, "解析：非法日期（2 月 30 日）");
eq(M.parseLocalDatetime("not-a-date"), null, "解析：垃圾串");
eq(M.parseLocalDatetime("2026-10-26T25:00"), null, "解析：非法小时");

/* ---------- 4. RSS 2.0 串联 ---------- */
var rss = M.buildRss(CH, [item({})]);
has(rss, '<?xml version="1.0" encoding="UTF-8"?>', "RSS：XML 声明");
has(rss, '<rss version="2.0">', "RSS：rss 根元素");
has(rss, "<channel>", "RSS：channel");
has(rss, "<title>示例博客</title>", "RSS：频道标题");
has(rss, "<link>https://example.com</link>", "RSS：频道链接");
has(rss, "<description><![CDATA[频道描述]]></description>", "RSS：频道描述进 CDATA");
has(rss, "<language>zh-CN</language>", "RSS：语言默认 zh-CN");
has(rss, "<item>", "RSS：item");
has(rss, "<pubDate>Mon, 26 Oct 2026 07:37:00 " + off822 + "</pubDate>", "RSS：pubDate 用 RFC 822");
has(rss, '<guid isPermaLink="true">https://example.com/posts/1</guid>', "RSS：guid 默认取链接且 isPermaLink=true");
var rssCustom = M.buildRss(CH, [item({ guid: "custom-guid-1" })]);
has(rssCustom, '<guid isPermaLink="false">custom-guid-1</guid>', "RSS：自定义 guid 时 isPermaLink=false");
var rssEnc = M.buildRss(CH, [item({ enclosure: { url: "https://example.com/ep1.mp3", length: "12345678", type: "audio/mpeg" } })]);
has(rssEnc, '<enclosure url="https://example.com/ep1.mp3" length="12345678" type="audio/mpeg" />', "RSS：enclosure 三件套齐全");
var rssEsc = M.buildRss({ title: "A&B <C>", link: "https://example.com/?a=1&b=2", description: "d", language: "zh-CN" }, [item({ title: "T&U", link: "https://example.com/?x=1&y=2" })]);
has(rssEsc, "<title>A&amp;B &lt;C&gt;</title>", "RSS：频道标题 A&B <C> 正确转义");
has(rssEsc, "<link>https://example.com/?a=1&amp;b=2</link>", "RSS：频道链接属性外文本 & 转义不破串");
notHas(rssEnc, "<copyright>", "RSS：可选字段空则不输出");
var rssOpt = M.buildRss({ title: "T", link: "https://example.com", description: "d", language: "zh-CN", copyright: "© 2026", email: "a@example.com", imageUrl: "https://example.com/cover.jpg" }, []);
has(rssOpt, "<copyright>© 2026</copyright>", "RSS：版权可选输出");
has(rssOpt, "<managingEditor>a@example.com</managingEditor>", "RSS：管理邮箱可选输出");
has(rssOpt, "<image>", "RSS：频道图片 image 块");
has(rssOpt, "<url>https://example.com/cover.jpg</url>", "RSS：图片 URL");
var rssNoDate = M.buildRss(CH, [item({ pubDate: "" })]);
notHas(rssNoDate, "<pubDate>", "RSS：发布时间空则不输出日期元素");

/* ---------- 5. Atom 1.0 串联 ---------- */
var atom = M.buildAtom(CH, [item({})], new Date(2026, 9, 26, 8, 0, 0));
has(atom, '<feed xmlns="http://www.w3.org/2005/Atom">', "Atom：feed 命名空间");
has(atom, "<id>https://example.com</id>", "Atom：feed id 默认取频道链接");
has(atom, '<link href="https://example.com" />', "Atom：feed 级 link");
has(atom, "<updated>2026-10-26T07:37:00" + off3339 + "</updated>", "Atom：updated 取最新条目时间（RFC 3339）");
has(atom, "<entry>", "Atom：entry");
has(atom, '<link href="https://example.com/posts/1" />', "Atom：entry 级 link");
has(atom, "<summary><![CDATA[正文]]></summary>", "Atom：entry summary 进 CDATA");
has(atom, '<content type="html"><![CDATA[正文]]></content>', "Atom：entry content type=html");
has(atom, "<published>2026-10-26T07:37:00" + off3339 + "</published>", "Atom：published 用 RFC 3339");
var atomNoDate = M.buildAtom(CH, [item({ pubDate: "" })], new Date(2026, 9, 26, 8, 0, 0));
has(atomNoDate, "<updated>2026-10-26T08:00:00" + off3339 + "</updated>", "Atom：无条目时间时 updated 取当前时间");
notHas(atomNoDate, "<published>", "Atom：无条目时间时不输出 published");
var atomEnc = M.buildAtom(CH, [item({ enclosure: { url: "https://example.com/ep1.mp3", length: "12345678", type: "audio/mpeg" } })], new Date(2026, 9, 26, 8, 0, 0));
has(atomEnc, 'rel="enclosure"', "Atom：enclosure link");
has(atomEnc, 'href="https://example.com/ep1.mp3"', "Atom：enclosure href");
var atomEsc = M.buildAtom({ title: "A&B", link: "https://example.com/?a=1&b=2", description: "d", language: "zh-CN" }, []);
has(atomEsc, "<title>A&amp;B</title>", "Atom：标题转义");
has(atomEsc, '<link href="https://example.com/?a=1&amp;b=2" />', "Atom：属性值含 & 转义后引号不破串");

/* ---------- 6. guid 判定 ---------- */
eq(M.resolveGuid({ link: "https://example.com/1", guid: "" }).isPermaLink, true, "guid：空 guid 默认链接、true");
eq(M.resolveGuid({ link: "https://example.com/1", guid: "x" }).isPermaLink, false, "guid：自定义 guid、false");
eq(M.resolveGuid({ link: "https://example.com/1", guid: "https://example.com/1" }).isPermaLink, true, "guid：显式填链接同 true");

/* ---------- 7. 校验闭环（中文定位提示、不输出误导结果） ---------- */
function badBuild(ch, items, fmt) {
  var r = M.buildFeed(ch, items, fmt || "rss");
  return r;
}
var r1 = badBuild({ title: "", link: "https://example.com", description: "d" }, []);
ok(!r1.valid && r1.xml === "" && /频道标题/.test(r1.errors.join("")), "校验：频道标题缺失中文提示且不输出");
var r2 = badBuild({ title: "T", link: "example.com", description: "d" }, []);
ok(!r2.valid && /频道链接格式/.test(r2.errors.join("")), "校验：频道链接缺协议中文提示");
var r3 = badBuild({ title: "T", link: "https://exa mple.com", description: "d" }, []);
ok(!r3.valid, "校验：频道链接含空格不通过");
var r4 = badBuild({ title: "T", link: "https://example.com", description: "" }, []);
ok(!r4.valid && /频道描述/.test(r4.errors.join("")), "校验：频道描述缺失中文提示");
var r5 = badBuild(CH, [item({ title: "" })]);
ok(!r5.valid && /第 1 条条目/.test(r5.errors.join("")) && /标题/.test(r5.errors.join("")), "校验：条目标题缺失定位到条目");
var r6 = badBuild(CH, [item({}), item({ link: "" })]);
ok(!r6.valid && /第 2 条条目/.test(r6.errors.join("")), "校验：第二条条目缺链接定位准确");
var r7 = badBuild(CH, [item({ enclosure: { url: "https://example.com/e.mp3", length: "", type: "" } })]);
ok(!r7.valid && /enclosure/.test(r7.errors.join("")) && /填齐/.test(r7.errors.join("")), "校验：enclosure 只填其一提示须填齐");
var r8 = badBuild(CH, [item({ enclosure: { url: "https://example.com/e.mp3", length: "abc", type: "audio/mpeg" } })]);
ok(!r8.valid && /enclosure/.test(r8.errors.join("")), "校验：enclosure 长度非整数不通过");
var r9 = badBuild(CH, [item({ pubDate: "2026-02-30T07:37" })]);
ok(!r9.valid && /发布时间/.test(r9.errors.join("")), "校验：非法日期中文提示且不输出");
var r10 = badBuild(CH, [item({})]);
ok(r10.valid && r10.xml.length > 0, "校验：合法输入通过且有输出");
var r11 = badBuild({ title: "T", link: "https://example.com", description: "d", email: "not-an-email" }, []);
ok(!r11.valid && /邮箱/.test(r11.errors.join("")), "校验：管理邮箱格式非法提示");

/* ---------- 8. 格式切换实时重算 ---------- */
var feedRss = M.buildFeed(CH, [item({})], "rss");
var feedAtom = M.buildFeed(CH, [item({})], "atom");
ok(feedRss.valid && feedAtom.valid, "切换：同批输入双格式均合法");
has(feedRss.xml, "<rss", "切换：RSS 输出含 rss 根");
has(feedAtom.xml, "<feed", "切换：Atom 输出含 feed 根");
notHas(feedRss.xml, 'xmlns="http://www.w3.org/2005/Atom"', "切换：RSS 不含 Atom 命名空间");
notHas(feedAtom.xml, "<rss", "切换：Atom 不含 rss 根");

/* ---------- 9. 2 组示例 ---------- */
eq(M.EXAMPLES.length, 2, "示例：共 2 组");
eq(M.EXAMPLES[0].items.length, 3, "示例：博客频道 3 条");
eq(M.EXAMPLES[1].items.length, 2, "示例：播客频道 2 条");
ok(M.EXAMPLES[1].items.every(function (it) {
  return it.enclosure.url && it.enclosure.length && it.enclosure.type;
}), "示例：播客 2 条均带 enclosure 三件套");
var exRss = M.buildFeed(M.EXAMPLES[0].channel, M.EXAMPLES[0].items, "rss");
var exAtom = M.buildFeed(M.EXAMPLES[1].channel, M.EXAMPLES[1].items, "atom");
ok(exRss.valid && exAtom.valid, "示例：两组示例双格式均可生成");
has(exAtom.xml, 'rel="enclosure"', "示例：播客 Atom 含 enclosure");
eq(M.emptyItem().enclosure.url, "", "空条目：enclosure 默认为空");

/* ---------- 10. 注册（180→181 Path） ---------- */
has(GO_SRC, '"rss_feed_generator"', "注册：ID rss_feed_generator");
has(GO_SRC, '"/tools/rss-feed-generator"', "注册：Path /tools/rss-feed-generator");
has(GO_SRC, "RSS／Atom 订阅源生成器", "注册：中文名");
var paths = GO_SRC.match(/"\/tools\/[^"]+"/g) || [];
var uniq = paths.filter(function (v, i) { return paths.indexOf(v) === i; });
eq(uniq.length, 181, "注册：总数 180→181 Path");
ok(/ID:\s+"rss_feed_generator"[\s\S]{0,600}?Category:\s+"开发工具"/.test(GO_SRC), "注册：品类为开发工具");
ok(/ID:\s+"rss_feed_generator"[\s\S]{0,600}?New:\s+true/.test(GO_SRC), "注册：New 为 true");

/* ---------- 11. 零网络请求与模板 ---------- */
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch(");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(JS_SRC, "innerHTML", "实现：JS 不用 innerHTML 拼 XML");
has(TPL_SRC, "只生成静态 XML 文本，不发布、不托管", "模板：真限制不发布不托管可见");
has(TPL_SRC, "不验证订阅源可达性", "模板：真限制不验证可达性可见");
has(TPL_SRC, "日期按浏览器本地时区换算", "模板：真限制本地时区可见");
has(TPL_SRC, "内容不做 HTML 清洗", "模板：真限制不清洗可见");
has(TPL_SRC, "/tools/xml-formatter", "互链：XML 格式化器");
has(TPL_SRC, "/tools/robots-txt-generator", "互链：robots.txt 生成器");
has(TPL_SRC, "rss_feed_generator.js", "模板：引用本工具 JS");
has(TPL_SRC, 'href="https://www.johnkingzcq123.xyz/tools/rss-feed-generator"', "模板：canonical");
notHas(TPL_SRC, 'src="http', "模板：无外部 CDN 脚本");
ok(/<textarea[^>]*id="rf-output"[^>]*readonly/.test(TPL_SRC), "模板：输出框只读");
ok(/id="rf-format-rss"/.test(TPL_SRC) && /id="rf-format-atom"/.test(TPL_SRC), "模板：RSS／Atom 二选一控件齐全");

console.log("rss_feed_generator: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
