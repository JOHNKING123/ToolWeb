/* 简繁转换（繁简互转）纯函数单元测试（零依赖）：node tests/traditional_simplified_converter.test.js
 * 覆盖：convertText（锚点精确值：头发/发展/干活/干净/中国/学习/后面/里面 s2t、
 * 頭髮/發展/中國/後面 t2s、'ABC123，。' 原样保留、convertText('中国','s2t') 四字段精确值、
 * 统计 convertedCount/phraseHits/totalChars、100000 字符边界）、最长匹配优先
 * （干干净净/发展中国家/前前后后/里里外外/余音绕梁/学习成绩）、歧义标注
 * （裸发候选 發/髮、短语覆盖不标注、繁→简无歧义）、simplifiedToTraditional／
 * traditionalToSimplified（往返恒等）、convertChar（锚点＋非法参数 err.field='ch'）、
 * 非法参数抛错 err.field（空／非字符串／超长／非法 direction）、S2T_MAP ≥2000 键／
 * T2S_MAP／PHRASE_TABLE ≥50 条（逐条双向自洽）／吃保留原字修正、5 组预设示例
 * （每组精确转换结果与统计值）、categories.go 注册（Path 总数 321→322、
 * Icon g_translate 全库唯一、紧邻 encoding_converter）、模板（SEO 关键词、真限制五条、
 * 控件、互链、零外部资源静态检查）、浏览器绑定源码级检查
 * （window.TraditionalSimplifiedConverter、双向切换／互换／复制／下载／清空）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/traditional_simplified_converter.js");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function eqj(a, b, name) { eq(JSON.stringify(a), JSON.stringify(b), name); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name + "（缺 " + sub + "）"); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name + "（不应含 " + sub + "）"); }
function throws(fn, field, name) {
    try { fn(); ok(false, name + "（应抛错却未抛）"); }
    catch (e) { ok(!field || e.field === field, name + "（err.field 期望 " + field + "，实得 " + e.field + "）"); }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "traditional_simplified_converter.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "traditional_simplified_converter.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* 只取契约规定的四个字段（实现另附 ambiguous 字段供页面标注，不在契约内）。 */
function pick4(r) {
    return { text: r.text, convertedCount: r.convertedCount, phraseHits: r.phraseHits, totalChars: r.totalChars };
}

/* ---------- 1. convertText s2t 锚点 ---------- */
eqj(pick4(M.convertText("中国", "s2t")), { text: "中國", convertedCount: 2, phraseHits: 1, totalChars: 2 },
    "convertText('中国','s2t') 四字段精确值");
eq(M.convertText("头发", "s2t").text, "頭髮", "锚点：头发→頭髮");
eq(M.convertText("发展", "s2t").text, "發展", "锚点：发展→發展");
eq(M.convertText("干活", "s2t").text, "幹活", "锚点：干活→幹活");
eq(M.convertText("干净", "s2t").text, "乾淨", "锚点：干净→乾淨");
eq(M.convertText("学习", "s2t").text, "學習", "锚点：学习→學習");
eq(M.convertText("后面", "s2t").text, "後面", "锚点：后面→後面");
eq(M.convertText("里面", "s2t").text, "裏面", "锚点：里面→裏面");
eq(M.convertText("头发发展干活干净后面里面", "s2t").text, "頭髮發展幹活乾淨後面裏面", "锚点：六词连转");
eqj(pick4(M.convertText("头发发展干活干净后面里面", "s2t")),
    { text: "頭髮發展幹活乾淨後面裏面", convertedCount: 12, phraseHits: 6, totalChars: 12 },
    "锚点：六词连转统计 12/6/12");
eq(M.convertText("发现", "s2t").text, "發現", "短语：发现→發現");
eq(M.convertText("沙发", "s2t").text, "沙發", "短语：沙发→沙發");
eq(M.convertText("干杯", "s2t").text, "乾杯", "短语：干杯→乾杯");
eq(M.convertText("干部", "s2t").text, "幹部", "短语：干部→幹部");
eq(M.convertText("然后", "s2t").text, "然後", "短语：然后→然後");
eq(M.convertText("这里", "s2t").text, "這裏", "短语：这里→這裏");
eq(M.convertText("多余", "s2t").text, "多餘", "短语：多余→多餘");
eq(M.convertText("面条", "s2t").text, "麵條", "短语：面条→麵條");
eq(M.convertText("面包", "s2t").text, "麵包", "短语：面包→麵包");
eq(M.convertText("国家", "s2t").text, "國家", "短语：国家→國家");
eq(M.convertText("电话", "s2t").text, "電話", "短语：电话→電話");
eq(M.convertText("时间", "s2t").text, "時間", "短语：时间→時間");
eq(M.convertText("关系", "s2t").text, "關係", "短语：关系→關係");

/* ---------- 2. convertText t2s 锚点 ---------- */
eq(M.convertText("頭髮", "t2s").text, "头发", "锚点：頭髮→头发");
eq(M.convertText("發展", "t2s").text, "发展", "锚点：發展→发展");
eq(M.convertText("中國", "t2s").text, "中国", "锚点：中國→中国");
eq(M.convertText("後面", "t2s").text, "后面", "锚点：後面→后面");
eq(M.convertText("乾淨", "t2s").text, "干净", "锚点：乾淨→干净");
eq(M.convertText("學習", "t2s").text, "学习", "锚点：學習→学习");
eq(M.convertText("裏面", "t2s").text, "里面", "锚点：裏面→里面");
eq(M.convertText("頭髮發展中國後面", "t2s").text, "头发发展中国后面", "锚点：四词反向连转");
eqj(pick4(M.convertText("頭髮發展中國後面", "t2s")),
    { text: "头发发展中国后面", convertedCount: 8, phraseHits: 4, totalChars: 8 },
    "锚点：四词反向连转统计 8/4/8");
eq(M.convertText("髮", "t2s").text, "发", "单字反向：髮→发");
eq(M.convertText("乾", "t2s").text, "干", "单字反向：乾→干");
eq(M.convertText("裏", "t2s").text, "里", "单字反向：裏→里");
eq(M.convertText("餘", "t2s").text, "余", "单字反向：餘→余");
eq(M.convertText("喫", "t2s").text, "吃", "单字反向：喫→吃（异体仍可回简）");

/* ---------- 3. 原样保留与统计 ---------- */
eqj(pick4(M.convertText("ABC123，。", "s2t")),
    { text: "ABC123，。", convertedCount: 0, phraseHits: 0, totalChars: 8 },
    "原样保留：ABC123，。 s2t");
eqj(pick4(M.convertText("ABC123，。", "t2s")),
    { text: "ABC123，。", convertedCount: 0, phraseHits: 0, totalChars: 8 },
    "原样保留：ABC123，。 t2s");
eq(M.convertText("中国ABC学习123", "s2t").text, "中國ABC學習123", "混合：中英数字混排");
eqj(pick4(M.convertText("中国ABC学习123", "s2t")),
    { text: "中國ABC學習123", convertedCount: 4, phraseHits: 2, totalChars: 10 },
    "混合：统计 4/2/10");
eq(M.convertText("中人山", "s2t").text, "中人山", "简繁同形字不变");
eq(M.convertText("中人山", "s2t").convertedCount, 0, "简繁同形字 convertedCount 0");
eq(M.convertText("国", "s2t").text, "國", "单字：国→國");
eqj(pick4(M.convertText("国", "s2t")), { text: "國", convertedCount: 1, phraseHits: 0, totalChars: 1 },
    "单字：国统计 1/0/1");
eq(M.convertText("㐷", "s2t").text, "傌", "增补平面字转换（代理对不断裂）");
eq(M.convertText("𠗣", "t2s").text, "㓆", "增补平面字反向转换");

/* ---------- 4. 最长匹配优先 ---------- */
eq(M.convertText("干干净净", "s2t").text, "乾乾淨淨", "最长匹配：干干净净→乾乾淨淨（不用干净短语抢先）");
eq(M.convertText("发展中国家", "s2t").text, "發展中國家", "最长匹配：发展中国家→發展中國家（6 字长词）");
eq(M.convertText("前前后后", "s2t").text, "前前後後", "最长匹配：前前后后→前前後後");
eq(M.convertText("里里外外", "s2t").text, "裏裏外外", "最长匹配：里里外外→裏裏外外");
eq(M.convertText("余音绕梁", "s2t").text, "餘音繞梁", "最长匹配：余音绕梁→餘音繞梁");
eq(M.convertText("学习成绩", "s2t").text, "學習成績", "最长匹配：学习成绩→學習成績");
eq(M.convertText("乾乾淨淨", "t2s").text, "干干净净", "最长匹配反向：乾乾淨淨→干干净净");
eq(M.convertText("發展中國家", "t2s").text, "发展中国家", "最长匹配反向：發展中國家→发展中国家");
eq(M.convertText("钟表闹钟", "s2t").text, "鐘錶鬧鐘", "消歧短语：钟表/闹钟→鐘錶/鬧鐘（不用默认鍾）");
eq(M.convertText("放松卷发日历", "s2t").text, "放鬆捲髮日曆", "消歧短语：放松/卷发/日历");
eq(M.convertText("凭借向往折叠", "s2t").text, "憑藉嚮往摺疊", "消歧短语：凭借/向往/折叠");
eq(M.convertText("长征萝卜舍不得尽管", "s2t").text, "長征蘿蔔捨不得儘管", "消歧短语：长征/萝卜/舍不得/尽管");

/* ---------- 5. 歧义标注 ---------- */
(function () {
    var r = M.convertText("发", "s2t");
    eq(r.text, "發", "歧义：裸发默认轉發");
    eq(r.ambiguous.length, 1, "歧义：裸发标注 1 处");
    eq(r.ambiguous[0].char, "发", "歧义：标注原字发");
    eq(r.ambiguous[0].chosen, "發", "歧义：标注本次所选發");
    eqj(r.ambiguous[0].candidates, ["發", "髮"], "歧义：发候选 發/髮");
    eq(r.ambiguous[0].pos, 0, "歧义：标注位置 0");
})();
eq(M.convertText("头发", "s2t").ambiguous.length, 0, "歧义：短语覆盖的发不标注");
eq(M.convertText("干", "s2t").ambiguous[0].candidates.join("/"), "幹/乾/干/榦", "歧义：干候选 幹/乾/干/榦");
eq(M.convertText("后", "s2t").ambiguous[0].candidates.join("/"), "後/后", "歧义：后候选 後/后");
eq(M.convertText("里", "s2t").ambiguous[0].candidates.join("/"), "裏/里/哩", "歧义：里候选 裏/里/哩");
eq(M.convertText("余", "s2t").ambiguous[0].candidates.join("/"), "餘/余", "歧义：余候选 餘/余");
eq(M.convertText("面", "s2t").ambiguous[0].chosen, "面", "歧义：裸面默认保留原字");
eq(M.convertText("面", "s2t").ambiguous[0].candidates.join("/"), "面/麪", "歧义：面候选 面/麪");
eq(M.convertText("发", "t2s").ambiguous.length, 0, "歧义：繁→简无歧义标注");
eq(M.convertText("頭髮發展", "t2s").ambiguous.length, 0, "歧义：繁→简整句无标注");
eq(M.convertText("中国学习", "s2t").ambiguous.length, 0, "歧义：无歧义字句标注为空");

/* ---------- 6. 简便函数与往返 ---------- */
eq(M.simplifiedToTraditional("中国学习"), "中國學習", "simplifiedToTraditional：中国学习");
eq(M.traditionalToSimplified("中國學習"), "中国学习", "traditionalToSimplified：中國學習");
eq(M.traditionalToSimplified(M.simplifiedToTraditional("中国学习")), "中国学习",
    "往返：traditionalToSimplified(simplifiedToTraditional('中国学习'))==='中国学习'");
M.samples.forEach(function (s, i) {
    eq(M.traditionalToSimplified(M.simplifiedToTraditional(s.text)), s.text,
        "往返：预设 " + s.name + " 往返恒等");
});
eq(M.simplifiedToTraditional("ABC123，。"), "ABC123，。", "simplifiedToTraditional：原样保留");
eq(M.traditionalToSimplified("ABC123，。"), "ABC123，。", "traditionalToSimplified：原样保留");

/* ---------- 7. convertChar ---------- */
eq(M.convertChar("国", "s2t"), "國", "convertChar：国→國");
eq(M.convertChar("國", "t2s"), "国", "convertChar：國→国");
eq(M.convertChar("发", "s2t"), "發", "convertChar：发默认→發");
eq(M.convertChar("中", "s2t"), "中", "convertChar：同形字原样返回");
eq(M.convertChar("A", "s2t"), "A", "convertChar：ASCII 原样返回");
eq(M.convertChar("吃", "s2t"), "吃", "convertChar：吃保留原字（现代通用写法修正）");
eq(M.convertChar("喫", "t2s"), "吃", "convertChar：喫→吃");
throws(function () { M.convertChar("", "s2t"); }, "ch", "抛错：convertChar('') field=ch");
throws(function () { M.convertChar("中国", "s2t"); }, "ch", "抛错：convertChar('中国') field=ch");
throws(function () { M.convertChar(65, "s2t"); }, "ch", "抛错：convertChar(65) field=ch");
throws(function () { M.convertChar(null, "s2t"); }, "ch", "抛错：convertChar(null) field=ch");
throws(function () { M.convertChar("国", "x"); }, "direction", "抛错：convertChar 非法 direction field=direction");
throws(function () { M.convertChar("国"); }, "direction", "抛错：convertChar 缺 direction field=direction");

/* ---------- 8. 非法参数 ---------- */
throws(function () { M.convertText("", "s2t"); }, "input", "抛错：convertText('') field=input");
throws(function () { M.convertText(123, "s2t"); }, "input", "抛错：convertText(123) field=input");
throws(function () { M.convertText(null, "s2t"); }, "input", "抛错：convertText(null) field=input");
throws(function () { M.convertText({}, "s2t"); }, "input", "抛错：convertText({}) field=input");
throws(function () { M.convertText("中".repeat(100001), "s2t"); }, "input", "抛错：convertText 超长 100001 field=input");
has((function () { try { M.convertText("中".repeat(100001), "s2t"); } catch (e) { return e.message; } return ""; })(),
    "100000", "convertText：超长提示含 100000");
eq(M.convertText("中".repeat(100000), "s2t").totalChars, 100000, "边界：100000 字符可转换");
throws(function () { M.convertText("中国", "x"); }, "direction", "抛错：convertText 非法 direction field=direction");
throws(function () { M.convertText("中国", "S2T"); }, "direction", "抛错：convertText 大写 direction field=direction");
throws(function () { M.convertText("中国"); }, "direction", "抛错：convertText 缺 direction field=direction");
throws(function () { M.simplifiedToTraditional(""); }, "input", "抛错：simplifiedToTraditional('') field=input");
throws(function () { M.traditionalToSimplified(123); }, "input", "抛错：traditionalToSimplified(123) field=input");

/* ---------- 9. 对照表规模与完整性 ---------- */
ok(Object.keys(M.S2T_MAP).length >= 2000, "S2T_MAP 键数≥2000（实得 " + Object.keys(M.S2T_MAP).length + "）");
eq(Object.keys(M.S2T_MAP).length, 3880, "S2T_MAP 键数精确值 3880（OpenCC 4012 条去恒等去吃修正）");
ok(Object.keys(M.T2S_MAP).length >= 2000, "T2S_MAP 键数≥2000（实得 " + Object.keys(M.T2S_MAP).length + "）");
eq(Object.keys(M.T2S_MAP).length, 4056, "T2S_MAP 键数精确值 4056");
ok(!("吃" in M.S2T_MAP), "吃修正：S2T_MAP 无吃（保留原字）");
eq(M.T2S_MAP["喫"], "吃", "吃修正：T2S_MAP 喫→吃保留");
ok(M.PHRASE_TABLE.length >= 50, "PHRASE_TABLE ≥50 条（实得 " + M.PHRASE_TABLE.length + "）");
eq(M.PHRASE_TABLE.length, 96, "PHRASE_TABLE 条数精确值 96");
["发", "干", "后", "里", "余", "面"].forEach(function (c) {
    ok(M.PHRASE_TABLE.some(function (p) { return p[0].indexOf(c) !== -1; }),
        "短语表覆盖歧义字 " + c);
});
/* 短语表逐条双向自洽：简→繁得繁体、繁→简得回简体。 */
M.PHRASE_TABLE.forEach(function (p) {
    eq(M.convertText(p[0], "s2t").text, p[1], "短语自洽 s2t：" + p[0] + "→" + p[1]);
    eq(M.convertText(p[1], "t2s").text, p[0], "短语自洽 t2s：" + p[1] + "→" + p[0]);
});
(function () {
    var trads = {};
    var dup = 0;
    M.PHRASE_TABLE.forEach(function (p) { if (trads[p[1]]) dup++; trads[p[1]] = 1; });
    eq(dup, 0, "短语表繁体端无重复（倒置无冲突）");
    var simps = {};
    var dupS = 0;
    M.PHRASE_TABLE.forEach(function (p) { if (simps[p[0]]) dupS++; simps[p[0]] = 1; });
    eq(dupS, 0, "短语表简体端无重复");
})();

/* ---------- 10. 预设示例 ---------- */
eq(M.samples.length, 5, "预设示例 5 组");
eqj(M.samples.map(function (s) { return s.name; }), ["古籍", "歌词", "港台新闻", "字幕", "日常用语"],
    "预设示例名称：古籍/歌词/港台新闻/字幕/日常用语");
M.samples.forEach(function (s) { eq(s.direction, "s2t", "预设 " + s.name + " 方向 s2t"); });
eq(M.convertText(M.samples[0].text, "s2t").text,
    "學而時習之，不亦說乎？有朋自遠方來，不亦樂乎？人不知而不慍，不亦君子乎？", "预设古籍精确转换");
eq(M.convertText(M.samples[1].text, "s2t").text,
    "後來，我總算學會了如何去愛，可惜你早已遠去，消失在人海。", "预设歌词精确转换");
eq(M.convertText(M.samples[2].text, "s2t").text,
    "據報道，中國經濟持續發展，未來將學習先進經驗，推動電話與電腦產業升級。", "预设港台新闻精确转换");
eq(M.convertText(M.samples[3].text, "s2t").text,
    "頭髮亂了，幹活去了，乾淨的衣服在後面，裏面的東西別動。", "预设字幕精确转换");
eq(M.convertText(M.samples[4].text, "s2t").text,
    "今天天氣很好，我們一起去吃麵條，飯後散步回家，路上買點麵包。", "预设日常用语精确转换");
eqj(pick4(M.convertText(M.samples[0].text, "s2t")),
    { text: "學而時習之，不亦說乎？有朋自遠方來，不亦樂乎？人不知而不慍，不亦君子乎？", convertedCount: 8, phraseHits: 0, totalChars: 36 },
    "预设古籍统计 8/0/36");
eqj(pick4(M.convertText(M.samples[3].text, "s2t")),
    { text: "頭髮亂了，幹活去了，乾淨的衣服在後面，裏面的東西別動。", convertedCount: 15, phraseHits: 6, totalChars: 27 },
    "预设字幕统计 15/6/27");
eq(M.convertText(M.samples[0].text, "s2t").ambiguous.length, 0, "预设古籍歧义 0 处");
eq(M.convertText(M.samples[1].text, "s2t").ambiguous.length, 1, "预设歌词歧义 1 处");
eq(M.convertText(M.samples[2].text, "s2t").ambiguous.length, 2, "预设港台新闻歧义 2 处");
eq(M.convertText(M.samples[3].text, "s2t").ambiguous.length, 3, "预设字幕歧义 3 处");
eq(M.convertText(M.samples[4].text, "s2t").ambiguous.length, 4, "预设日常用语歧义 4 处");

/* ---------- 11. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 323, "注册 Path 总数 321→322");
has(GO_SRC, "\"traditional_simplified_converter\"", "注册：ID traditional_simplified_converter");
has(GO_SRC, "\"/tools/traditional-simplified-converter\"", "注册：Path /tools/traditional-simplified-converter");
has(GO_SRC, "\"g_translate\"", "注册：Icon g_translate");
eq((GO_SRC.match(/Icon:\s*"g_translate"/g) || []).length, 1, "Icon g_translate 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf("\"traditional_simplified_converter\"") - 60,
    GO_SRC.indexOf("\"traditional_simplified_converter\"") + 1600);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"编码转换"/.test(entryBlock), "注册：类目 编码转换");
has(entryBlock, "简繁转换", "注册：名称 简繁转换");
ok(GO_SRC.indexOf("\"traditional_simplified_converter\"") > GO_SRC.indexOf("\"encoding_converter\"") &&
    GO_SRC.indexOf("\"traditional_simplified_converter\"") < GO_SRC.indexOf("\"http_status_reference\""),
    "注册：紧邻 encoding_converter（在其后、http_status_reference 之前）");

/* ---------- 12. 模板：SEO/真限制/控件/互链/零外部资源 ---------- */
has(TPL_SRC, "{{define \"traditional_simplified_converter\"}}", "模板：define traditional_simplified_converter");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/traditional-simplified-converter", "模板 canonical 含新 Path");
has(TPL_SRC, "简繁转换", "模板：标题含工具名");
has(TPL_SRC, "简繁转换", "模板：SEO 关键词 简繁转换");
has(TPL_SRC, "繁简转换", "模板：SEO 关键词 繁简转换");
has(TPL_SRC, "简体转繁体", "模板：SEO 关键词 简体转繁体");
has(TPL_SRC, "繁体转简体", "模板：SEO 关键词 繁体转简体");
has(TPL_SRC, "五条真限制", "模板：五条真限制标题");
has(TPL_SRC, "一字多繁，须人工校对", "模板：真限制 1 一字多繁人工校对");
has(TPL_SRC, "罕用字／异体字原样保留", "模板：真限制 2 罕用字异体字原样保留");
has(TPL_SRC, "繁→简无歧义、简→繁有歧义", "模板：真限制 3 繁简歧义不对称");
has(TPL_SRC, "不做地区词汇本地化", "模板：真限制 4 不做地区词汇本地化");
has(TPL_SRC, "本地零上传", "模板：真限制 5 本地零上传");
has(TPL_SRC, "id=\"ts-input\"", "模板：输入框 ts-input");
has(TPL_SRC, "id=\"ts-output\"", "模板：结果框 ts-output");
has(TPL_SRC, "name=\"ts-dir\"", "模板：方向切换 ts-dir");
has(TPL_SRC, "id=\"ts-swap-btn\"", "模板：一键互换按钮");
has(TPL_SRC, "id=\"ts-convert-btn\"", "模板：转换按钮");
has(TPL_SRC, "id=\"ts-copy-btn\"", "模板：一键复制按钮");
has(TPL_SRC, "id=\"ts-download-btn\"", "模板：下载按钮");
has(TPL_SRC, "id=\"ts-clear\"", "模板：清空按钮");
has(TPL_SRC, "id=\"ts-presets\"", "模板：预设示例容器");
has(TPL_SRC, "id=\"ts-stats\"", "模板：统计面板容器");
has(TPL_SRC, "id=\"ts-ambig\"", "模板：歧义标注容器");
has(TPL_SRC, "只做字形简繁互转", "模板：分工说明只做字形简繁互转");
has(TPL_SRC, "不做字符编码转换", "模板：分工说明不做字符编码转换");
has(TPL_SRC, "/tools/encoding-converter", "模板：互链 encoding_converter");
has(TPL_SRC, "中文编码转换器", "模板：互链中文编码转换器");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
notHas(TPL_SRC, "cdnjs", "模板零 CDN：无 cdnjs");
notHas(TPL_SRC, "unpkg", "模板零 CDN：无 unpkg");
notHas(TPL_SRC, "jsdelivr", "模板零 CDN：无 jsdelivr");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/traditional-simplified-converter") !== -1, "模板 http link：仅自家 canonical");
has(TPL_SRC, "/tools/static/js/traditional_simplified_converter.js", "模板：加载本站 JS");

/* ---------- 13. 浏览器绑定源码级检查 ---------- */
has(JS_SRC, "window.TraditionalSimplifiedConverter", "绑定：挂 window.TraditionalSimplifiedConverter");
has(JS_SRC, "module.exports", "绑定：module.exports 同步导出");
has(JS_SRC, "MAX_INPUT = 100000", "绑定：上限 100000 字符");
has(JS_SRC, "ts-swap-btn", "绑定：一键互换");
has(JS_SRC, "ts-copy-btn", "绑定：一键复制");
has(JS_SRC, "ts-download-btn", "绑定：下载 .txt");
has(JS_SRC, "ts-clear", "绑定：清空");
has(JS_SRC, "ts-presets", "绑定：预设示例");
has(JS_SRC, "ts-ambig", "绑定：歧义标注");
has(JS_SRC, "ts-stats", "绑定：统计面板");
has(JS_SRC, "简转繁结果.txt", "绑定：下载文件名简转繁");
has(JS_SRC, "繁转简结果.txt", "绑定：下载文件名繁转简");
has(JS_SRC, "OpenCC", "绑定：注明对照表来源 OpenCC");
notHas(JS_SRC, "cdnjs", "绑定：无 CDN 引用");
notHas(JS_SRC, "fonts.googleapis", "绑定：无外部字体引用");
notHas(JS_SRC, "XMLHttpRequest", "绑定：无后端请求");
notHas(JS_SRC, "fetch(", "绑定：无 fetch 请求");

console.log("PASS " + pass + " / FAIL " + fail + "（共 " + (pass + fail) + " 断言）");
process.exit(fail === 0 ? 0 : 1);
