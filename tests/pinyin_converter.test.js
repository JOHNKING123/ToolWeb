/* 汉字转拼音纯函数单元测试（零依赖）：node tests/pinyin_converter.test.js
 * 覆盖：字表规模（8109 条 ≥3500；一级字 100 字抽查全命中，样本为一级字表
 * 每 35 字抽 1 字）、生僻字 8 字锚点精确值（龘 da2／饕 tao1／餮 tie4／
 * 燚 yi4／犇 ben1／麤 cu1／嘦 jiao4／嫑 biao2）、多音字候选精确值（行 xing2/hang2、
 * 重 zhong4/chong2、乐 le4/yue4、长 chang2/zhang3）与多音字组数 ≥40、
 * toneToDiacritic 标调规则锚点（ma1→mā、ma2→má、ma3→mǎ、ma4→mà、ma5→ma、
 * liu2→liú、hui4→huì、lv3→lǚ、nv3→nǚ、hao3→hǎo、gei3→gěi）、convertText／
 * renderPinyinLine／renderAnnotated／initialsOf／countStats 锚点精确值（你好→nǐ hǎo、
 * 中国→zhōng guó、你好世界首字母 nhsj）、非法参数抛错 err.field、
 * 5 组预设示例（每组精确统计值）、categories.go 注册（Path 总数 324→326、
 * Icon spellcheck 全库唯一、紧邻 traditional_simplified_converter）、模板（SEO 关键词、
 * 真限制五条、控件、互链、零外部资源静态检查）、浏览器绑定源码级检查
 * （window.PinyinConverter、三种声调样式／首字母模式／多音字点选／复制／下载／清空）、
 * 评审复核回归（对照表 &nbsp; 不经 escapeHtml 转义、声调／首字母切换不清空多音字点选、
 * 纯拼音文本 ASCII 标点前不留空格）。
 * 注意：countStats('你好，行') 的 poly 为 2 而非 1——「好」亦为多音字
 * （hǎo／hào，如 好学 hào xué），BACKLOG 锚点只计了「行」，此处以数据为准。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/pinyin_converter.js");

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
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "pinyin_converter.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "pinyin_converter.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

function displays(items) { return items.map(function (x) { return x.display; }); }
function pinyins(items) { return items.map(function (x) { return x.pinyin; }); }

/* ---------- 1. 延迟加载与字表规模 ---------- */
eq(M.pinyinLoaded(), false, "延迟加载：调用前 pinyinLoaded() 为 false");
var TABLE = M.loadPinyinTable();
eq(M.pinyinLoaded(), true, "延迟加载：调用后 pinyinLoaded() 为 true");
eq(Object.keys(TABLE).length, 8109, "字表条目数 8109（8105 通用规范汉字＋4 生僻增补）");
ok(Object.keys(TABLE).length >= 3500, "字表条目数 ≥3500");
eq(M.loadPinyinTable(), TABLE, "loadPinyinTable 幂等：两次返回同一对象");
var polyCount = 0;
Object.keys(TABLE).forEach(function (ch) {
    var found = M.lookupPinyin(ch);
    if (found.candidates.length > 1) polyCount++;
});
ok(polyCount >= 40, "多音字候选表 ≥40 组（实得 " + polyCount + " 组）");

/* ---------- 2. 一级字 100 字抽查全命中 ---------- */
/* 样本：通用规范汉字表一级字表（3500 字）每 35 字抽 1 字，共 100 字。 */
var SAMPLE100 = "一上叉互父引术只丛写刑厌吐乒众妄访驰赤芹辰串何肘辛快际武拉茅奋畅制迫胁氓波话迢封荆柿临勋毡侯饶类浑诲垒振莽贾唠赂倘胸疼浙宴祟捶萎硕跃甜舵痊渠寇绩博蒂确景锄傍痘游屡塌概暖锥腿滔缠榜舞端凳飘镇澎薄儒檀懦靡";
eq(Array.from(SAMPLE100).length, 100, "抽查样本为 100 字");
var miss100 = [];
Array.from(SAMPLE100).forEach(function (ch) {
    if (!Object.prototype.hasOwnProperty.call(TABLE, ch)) miss100.push(ch);
});
eq(miss100.length, 0, "一级字 100 字抽查全命中（缺失：" + miss100.join("") + "）");

/* ---------- 3. 生僻字 8 字锚点精确值 ---------- */
eq(M.lookupPinyin("龘").pinyin, "da2", "生僻字锚点：龘 da2");
eq(M.lookupPinyin("饕").pinyin, "tao1", "生僻字锚点：饕 tao1");
eq(M.lookupPinyin("餮").pinyin, "tie4", "生僻字锚点：餮 tie4");
eq(M.lookupPinyin("燚").pinyin, "yi4", "生僻字锚点：燚 yi4");
eq(M.lookupPinyin("犇").pinyin, "ben1", "生僻字锚点：犇 ben1");
eq(M.lookupPinyin("麤").pinyin, "cu1", "生僻字锚点：麤 cu1");
eq(M.lookupPinyin("嘦").pinyin, "jiao4", "生僻字锚点：嘦 jiao4");
eq(M.lookupPinyin("嫑").pinyin, "biao2", "生僻字锚点：嫑 biao2");
eqj(M.lookupPinyin("嫑").candidates, ["biao2", "bao2"], "生僻字锚点：嫑候选 biao2/biao2");
eq(M.lookupPinyin("𐀀"), null, "表外字返回 null：𐀀");

/* ---------- 4. 多音字候选精确值 ---------- */
eq(M.lookupPinyin("行").pinyin, "xing2", "多音字默认：行 xing2");
ok(M.lookupPinyin("行").candidates.indexOf("xing2") !== -1, "多音字候选：行含 xing2");
ok(M.lookupPinyin("行").candidates.indexOf("hang2") !== -1, "多音字候选：行含 hang2");
eq(M.lookupPinyin("重").pinyin, "zhong4", "多音字默认：重 zhong4");
ok(M.lookupPinyin("重").candidates.indexOf("chong2") !== -1, "多音字候选：重含 chong2");
eq(M.lookupPinyin("乐").pinyin, "le4", "多音字默认：乐 le4");
ok(M.lookupPinyin("乐").candidates.indexOf("yue4") !== -1, "多音字候选：乐含 yue4");
eq(M.lookupPinyin("长").pinyin, "chang2", "多音字默认：长 chang2（人工校正，pinyin-data 首位为 zhang3）");
ok(M.lookupPinyin("长").candidates.indexOf("zhang3") !== -1, "多音字候选：长含 zhang3");
eq(M.lookupPinyin("单").pinyin, "dan1", "多音字默认：单 dan1");
ok(M.lookupPinyin("单").candidates.indexOf("shan4") !== -1, "多音字候选：单含 shan4（姓氏读法）");
ok(M.lookupPinyin("曾").candidates.indexOf("zeng1") !== -1, "多音字候选：曾含 zeng1");
ok(M.lookupPinyin("解").candidates.indexOf("xie4") !== -1, "多音字候选：解含 xie4");
eq(M.lookupPinyin("你").candidates.length, 1, "单音字 candidates 长度 1：你");
eq(M.lookupPinyin("国").candidates.length, 1, "单音字 candidates 长度 1：国");
throws(function () { M.lookupPinyin(""); }, "char", "lookupPinyin('') 抛错 err.field='char'");
throws(function () { M.lookupPinyin("你好"); }, "char", "lookupPinyin('你好') 抛错 err.field='char'");
throws(function () { M.lookupPinyin(123); }, "char", "lookupPinyin(123) 抛错 err.field='char'");

/* ---------- 5. toneToDiacritic 标调规则锚点 ---------- */
eq(M.toneToDiacritic("ma1"), "mā", "标调：ma1→mā");
eq(M.toneToDiacritic("ma2"), "má", "标调：ma2→má");
eq(M.toneToDiacritic("ma3"), "mǎ", "标调：ma3→mǎ");
eq(M.toneToDiacritic("ma4"), "mà", "标调：ma4→mà");
eq(M.toneToDiacritic("ma5"), "ma", "标调：ma5→ma（轻声无调号）");
eq(M.toneToDiacritic("ma"), "ma", "标调：ma（无尾数）→ma");
eq(M.toneToDiacritic("liu2"), "liú", "标调：liu2→liú（iu 标 u）");
eq(M.toneToDiacritic("hui4"), "huì", "标调：hui4→huì（ui 标 i）");
eq(M.toneToDiacritic("hao3"), "hǎo", "标调：hao3→hǎo");
eq(M.toneToDiacritic("gei3"), "gěi", "标调：gei3→gěi");
eq(M.toneToDiacritic("lv3"), "lǚ", "标调：lv3→lǚ（ü 保留）");
eq(M.toneToDiacritic("nv3"), "nǚ", "标调：nv3→nǚ（ü 保留）");
eq(M.toneToDiacritic("zhong1"), "zhōng", "标调：zhong1→zhōng");
eq(M.toneToDiacritic("guo2"), "guó", "标调：guo2→guó");
eq(M.toneToDiacritic("de5"), "de", "标调：de5→de");
throws(function () { M.toneToDiacritic("ma6"); }, "numbered", "toneToDiacritic('ma6') 抛错 err.field='numbered'");
throws(function () { M.toneToDiacritic(123); }, "numbered", "toneToDiacritic(123) 抛错 err.field='numbered'");
throws(function () { M.toneToDiacritic(""); }, "numbered", "toneToDiacritic('') 抛错 err.field='numbered'");
throws(function () { M.toneToDiacritic("ma-1"); }, "numbered", "toneToDiacritic('ma-1') 抛错 err.field='numbered'");

/* ---------- 6. convertText 锚点 ---------- */
eqj(displays(M.convertText("你好", { toneStyle: "mark" })), ["nǐ", "hǎo"], "convertText：你好 mark→nǐ hǎo");
eqj(displays(M.convertText("中国", { toneStyle: "mark" })), ["zhōng", "guó"], "convertText：中国 mark→zhōng guó");
eqj(pinyins(M.convertText("拼音", { toneStyle: "number" })), ["pin1", "yin1"], "convertText：拼音 number→pin1/yin1");
eqj(displays(M.convertText("你好", { toneStyle: "number" })), ["ni3", "hao3"], "convertText：你好 number→ni3 hao3");
eqj(displays(M.convertText("你好", { toneStyle: "none" })), ["ni", "hao"], "convertText：你好 none→ni hao");
eqj(displays(M.convertText("你好世界", { mode: "initials" })), ["n", "h", "s", "j"], "convertText：你好世界 initials→nhsj");
eqj(displays(M.convertText("你好", {})), ["nǐ", "hǎo"], "convertText：默认 opts 为 mark");
eqj(displays(M.convertText("你好")), ["nǐ", "hǎo"], "convertText：无 opts 默认为 mark");
var punct = M.convertText("你好，世界！", { toneStyle: "mark" });
eqj(displays(punct), ["nǐ", "hǎo", "，", "shì", "jiè", "！"], "convertText：标点原样保留");
eq(punct[2].known, false, "convertText：逗号 known 为 false");
eq(punct[2].pinyin, "", "convertText：逗号 pinyin 为 ''");
eq(punct[5].known, false, "convertText：感叹号 known 为 false");
var xingzhang = M.convertText("行长", { toneStyle: "mark" });
eq(xingzhang[0].poly, true, "convertText：行长「行」poly 为 true");
eq(xingzhang[1].poly, true, "convertText：行长「长」poly 为 true");
eqj(displays(xingzhang), ["xíng", "cháng"], "convertText：行长 mark→xíng cháng");
eqj(M.convertText(""), [], "convertText('') → []");
eqj(displays(M.convertText("ABC123", { toneStyle: "mark" })), ["A", "B", "C", "1", "2", "3"], "convertText：英文数字原样保留");
throws(function () { M.convertText(123); }, "text", "convertText(123) 抛错 err.field='text'");
throws(function () { M.convertText("你好", { toneStyle: "x" }); }, "toneStyle", "toneStyle 'x' 抛错 err.field='toneStyle'");
throws(function () { M.convertText("你好", { mode: "x" }); }, "mode", "mode 'x' 抛错 err.field='mode'");
throws(function () { M.convertText(new Array(20002).join("你")); }, "text", "超 20000 字抛错 err.field='text'");
eq(M.convertText(new Array(20001).join("a")).length, 20000, "20000 字边界可转换");

/* ---------- 7. renderPinyinLine ---------- */
eq(M.renderPinyinLine(M.convertText("你好", { toneStyle: "mark" })), "nǐ hǎo", "renderPinyinLine：你好 mark→nǐ hǎo");
eq(M.renderPinyinLine(M.convertText("你好", { toneStyle: "mark" }), ""), "nǐhǎo", "renderPinyinLine：separator ''→nǐhǎo");
eq(M.renderPinyinLine(M.convertText("你好", { toneStyle: "number" }), "-"), "ni3-hao3", "renderPinyinLine：separator '-'");
eq(M.renderPinyinLine([]), "", "renderPinyinLine：空数组→''");
throws(function () { M.renderPinyinLine("你好"); }, "items", "renderPinyinLine 非数组抛错 err.field='items'");
throws(function () { M.renderPinyinLine([], 123); }, "separator", "renderPinyinLine separator 非字符串抛错");

/* ---------- 8. renderAnnotated ---------- */
eqj(M.renderAnnotated(M.convertText("你好", { toneStyle: "mark" })),
    [{ char: "你", pinyin: "nǐ" }, { char: "好", pinyin: "hǎo" }],
    "renderAnnotated：你好→[{你,nǐ},{好,hǎo}]");
eqj(M.renderAnnotated(M.convertText("你好，", { toneStyle: "mark" })),
    [{ char: "你", pinyin: "nǐ" }, { char: "好", pinyin: "hǎo" }, { char: "，", pinyin: "" }],
    "renderAnnotated：标点 pinyin 为 ''");
eqj(M.renderAnnotated([]), [], "renderAnnotated：空数组→[]");
throws(function () { M.renderAnnotated("你好"); }, "items", "renderAnnotated 非数组抛错 err.field='items'");

/* ---------- 9. initialsOf ---------- */
eq(M.initialsOf("你好世界"), "nhsj", "initialsOf：你好世界→nhsj");
eq(M.initialsOf(""), "", "initialsOf('') → ''");
eq(M.initialsOf("中国"), "zg", "initialsOf：中国→zg");
throws(function () { M.initialsOf(123); }, "text", "initialsOf(123) 抛错 err.field='text'");

/* ---------- 10. countStats ---------- */
eqj(M.countStats(M.convertText("你行")), { total: 2, hanzi: 2, converted: 2, poly: 1, unknown: [] },
    "countStats：你行→total 2/hanzi 2/converted 2/poly 1/unknown []");
eqj(M.countStats(M.convertText("你好，行")), { total: 4, hanzi: 3, converted: 3, poly: 2, unknown: [] },
    "countStats：你好，行→poly 2（好 hǎo/hào 亦为多音字，见文件头注释）");
eqj(M.countStats(M.convertText("你好𠀀行")), { total: 4, hanzi: 4, converted: 3, poly: 2, unknown: ["𠀀"] },
    "countStats：含表外字 𠀀→unknown ['𠀀']");
eqj(M.countStats(M.convertText("𠀀𠀀𠀀")), { total: 3, hanzi: 3, converted: 0, poly: 0, unknown: ["𠀀"] },
    "countStats：unknown 去重（𠀀×3 只列一次）");
eqj(M.countStats([]), { total: 0, hanzi: 0, converted: 0, poly: 0, unknown: [] },
    "countStats：空数组全 0");
throws(function () { M.countStats("你好"); }, "items", "countStats 非数组抛错 err.field='items'");

/* ---------- 11. 预设示例 ---------- */
eq(M.samples.length, 5, "预设示例 5 组");
eq(M.samples[0].name, "日常问候", "预设 1：日常问候");
eq(M.samples[1].name, "古诗", "预设 2：古诗");
eq(M.samples[2].name, "生僻字", "预设 3：生僻字");
eq(M.samples[3].name, "姓名", "预设 4：姓名");
eq(M.samples[4].name, "绕口令", "预设 5：绕口令");
eqj(M.countStats(M.convertText(M.samples[0].text)), { total: 28, hanzi: 24, converted: 24, poly: 12, unknown: [] }, "预设日常问候统计 28/24/24/12/[]");
eqj(M.countStats(M.convertText(M.samples[1].text)), { total: 24, hanzi: 20, converted: 20, poly: 13, unknown: [] }, "预设古诗统计 24/20/20/13/[]");
eqj(M.countStats(M.convertText(M.samples[2].text)), { total: 28, hanzi: 18, converted: 18, poly: 5, unknown: [] }, "预设生僻字统计 28/18/18/5/[]");
eqj(M.countStats(M.convertText(M.samples[3].text)), { total: 32, hanzi: 26, converted: 26, poly: 14, unknown: [] }, "预设姓名统计 32/26/26/14/[]");
eqj(M.countStats(M.convertText(M.samples[4].text)), { total: 19, hanzi: 17, converted: 17, poly: 11, unknown: [] }, "预设绕口令统计 19/17/17/11/[]");
eq(M.renderPinyinLine(M.convertText(M.samples[2].text, { toneStyle: "mark" })),
    "shēng pì zì xiǎo cè ： dá 、 tāo 、 tiè 、 yì 、 bēn 、 cū 、 jiào 、 biáo ， nǐ dōu huì dú ma ？",
    "预设生僻字拼音行精确值（8 锚点字在列）");
eq(M.renderPinyinLine(M.convertText(M.samples[1].text, { toneStyle: "mark" })),
    "chuáng qián míng yuè guāng ， yí shì dì shàng shuāng 。 jǔ tóu wàng míng yuè ， dī tóu sī gù xiāng 。",
    "预设古诗拼音行精确值");

/* ---------- 12. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 326, "注册 Path 总数 324→326");
has(GO_SRC, "\"pinyin_converter\"", "注册：ID pinyin_converter");
has(GO_SRC, "\"/tools/pinyin-converter\"", "注册：Path /tools/pinyin-converter");
has(GO_SRC, "\"spellcheck\"", "注册：Icon spellcheck");
eq((GO_SRC.match(/Icon:\s*"spellcheck"/g) || []).length, 1, "Icon spellcheck 全库唯一");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf("\"pinyin_converter\"") - 60,
    GO_SRC.indexOf("\"pinyin_converter\"") + 1600);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"编码转换"/.test(entryBlock), "注册：类目 编码转换");
has(entryBlock, "汉字转拼音", "注册：名称 汉字转拼音");
ok(GO_SRC.indexOf("\"pinyin_converter\"") > GO_SRC.indexOf("\"traditional_simplified_converter\"") &&
    GO_SRC.indexOf("\"pinyin_converter\"") < GO_SRC.indexOf("\"http_status_reference\""),
    "注册：紧邻 traditional_simplified_converter（在其后、http_status_reference 之前）");

/* ---------- 13. 模板：SEO/真限制/控件/互链/零外部资源 ---------- */
has(TPL_SRC, "{{define \"pinyin_converter\"}}", "模板：define pinyin_converter");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/pinyin-converter", "模板 canonical 含新 Path");
has(TPL_SRC, "汉字转拼音", "模板：标题含工具名");
has(TPL_SRC, "汉字转拼音", "模板：SEO 关键词 汉字转拼音");
has(TPL_SRC, "拼音查询", "模板：SEO 关键词 拼音查询");
has(TPL_SRC, "中文拼音转换", "模板：SEO 关键词 中文拼音转换");
has(TPL_SRC, "汉字注音", "模板：SEO 关键词 汉字注音");
has(TPL_SRC, "五条真限制", "模板：五条真限制标题");
has(TPL_SRC, "多音字无语境消歧，须人工核对", "模板：真限制 1 多音字无语境消歧");
has(TPL_SRC, "表外字原样保留", "模板：真限制 2 表外字原样保留");
has(TPL_SRC, "轻声／儿化按单字注音，不做连读变调", "模板：真限制 3 轻声儿化不做连读变调");
has(TPL_SRC, "姓名读音以本人／户籍为准", "模板：真限制 4 姓名读音以本人户籍为准");
has(TPL_SRC, "繁体字仅表内收录者可转", "模板：真限制 5 繁体字仅表内收录者可转");
has(TPL_SRC, "id=\"py-input\"", "模板：输入框 py-input");
has(TPL_SRC, "id=\"py-output\"", "模板：结果框 py-output");
has(TPL_SRC, "name=\"py-tone\"", "模板：声调样式切换 py-tone");
has(TPL_SRC, "id=\"py-initials\"", "模板：首字母模式 py-initials");
has(TPL_SRC, "id=\"py-convert-btn\"", "模板：转换按钮");
has(TPL_SRC, "id=\"py-copy-btn\"", "模板：一键复制拼音按钮");
has(TPL_SRC, "id=\"py-copy-annotated-btn\"", "模板：复制对照文本按钮");
has(TPL_SRC, "id=\"py-download-btn\"", "模板：下载按钮");
has(TPL_SRC, "id=\"py-clear\"", "模板：清空按钮");
has(TPL_SRC, "id=\"py-presets\"", "模板：预设示例容器");
has(TPL_SRC, "id=\"py-stats\"", "模板：统计面板容器");
has(TPL_SRC, "id=\"py-annotated\"", "模板：逐字对照表容器");
has(TPL_SRC, "id=\"py-poly\"", "模板：多音字标注容器");
has(TPL_SRC, "id=\"py-unknown\"", "模板：未收录字清单容器");
has(TPL_SRC, "只做汉字注音", "模板：分工说明只做汉字注音");
has(TPL_SRC, "不做简繁互转", "模板：分工说明不做简繁互转");
has(TPL_SRC, "不做字符编码转换", "模板：分工说明不做字符编码转换");
has(TPL_SRC, "不做 URL 别名生成", "模板：分工说明不做 URL 别名生成");
has(TPL_SRC, "/tools/slug-generator", "模板：互链 slug_generator");
has(TPL_SRC, "Slug 生成器", "模板：互链 Slug 生成器");
has(TPL_SRC, "/tools/traditional-simplified-converter", "模板：互链 traditional_simplified_converter");
has(TPL_SRC, "简繁转换", "模板：互链简繁转换");
has(TPL_SRC, "/tools/encoding-converter", "模板：互链 encoding_converter");
has(TPL_SRC, "中文编码转换器", "模板：互链中文编码转换器");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
notHas(TPL_SRC, "cdnjs", "模板零 CDN：无 cdnjs");
notHas(TPL_SRC, "unpkg", "模板零 CDN：无 unpkg");
notHas(TPL_SRC, "jsdelivr", "模板零 CDN：无 jsdelivr");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/pinyin-converter") !== -1, "模板 http link：仅自家 canonical");
has(TPL_SRC, "/tools/static/js/pinyin_converter.js", "模板：加载本站 JS");

/* ---------- 14. 浏览器绑定源码级检查 ---------- */
has(JS_SRC, "window.PinyinConverter", "绑定：挂 window.PinyinConverter");
has(JS_SRC, "module.exports", "绑定：module.exports 同步导出");
has(JS_SRC, "MAX_INPUT = 20000", "绑定：上限 20000 字");
has(JS_SRC, "py-tone", "绑定：声调样式切换");
has(JS_SRC, "py-initials", "绑定：首字母模式");
has(JS_SRC, "py-convert-btn", "绑定：转换按钮");
has(JS_SRC, "py-copy-btn", "绑定：一键复制拼音");
has(JS_SRC, "py-copy-annotated-btn", "绑定：复制对照文本");
has(JS_SRC, "py-download-btn", "绑定：下载 .txt");
has(JS_SRC, "py-clear", "绑定：清空");
has(JS_SRC, "py-presets", "绑定：预设示例");
has(JS_SRC, "py-annotated", "绑定：逐字对照表");
has(JS_SRC, "py-poly", "绑定：多音字标注");
has(JS_SRC, "py-unknown", "绑定：未收录字清单");
has(JS_SRC, "汉字转拼音结果.txt", "绑定：下载文件名汉字转拼音结果");
has(JS_SRC, "pinyin-data", "绑定：注明对照表来源 pinyin-data");
has(JS_SRC, "MIT", "绑定：注明许可 MIT");
notHas(JS_SRC, "cdnjs", "绑定：无 CDN 引用");
notHas(JS_SRC, "fonts.googleapis", "绑定：无外部字体引用");
notHas(JS_SRC, "XMLHttpRequest", "绑定：无后端请求");
notHas(JS_SRC, "fetch(", "绑定：无 fetch 请求");

/* ---------- 15. 评审复核回归（2026-11-07 第 2 轮） ---------- */
/* 修复 1：对照表 &nbsp; 不可再经 escapeHtml 转义（否则渲染出字面 "&nbsp;"）。 */
notHas(JS_SRC, "var py = r.pinyin || '&nbsp;';", "回归修复1：删除 py 中间变量，不再把 &nbsp; 当拼音转义");
notHas(JS_SRC, "escapeHtml(py)", "回归修复1：无 escapeHtml(py)，&nbsp; 不会被转义成 &amp;nbsp;");
has(JS_SRC, "(r.pinyin ? escapeHtml(r.pinyin) : '&nbsp;')", "回归修复1：空拼音直接写 &nbsp; 实体，真实拼音才转义");
/* 修复 2：切换声调样式／首字母模式不得清空多音字点选（overrides 只随文本变化清）。 */
has(JS_SRC, "tones[i].addEventListener('change', function () { doConvert(); });", "回归修复2：声调切换只重渲染，不清空 overrides");
has(JS_SRC, "initials.addEventListener('change', function () { doConvert(); });", "回归修复2：首字母模式切换只重渲染，不清空 overrides");
has(JS_SRC, "inputEl.addEventListener('input', function () { overrides = {}; doConvert(); });", "回归修复2：文本输入仍清空 overrides（下标随文本失效，清掉正确）");
/* 修复 3：纯拼音文本标点两侧不留空格（ASCII 与中文标点统一处理），连续空格并为一个。 */
has(JS_SRC, ",.;:?!%", "回归修复3：plainPinyinText 正则覆盖 ASCII 标点 , . ; : ? ! %");
has(JS_SRC, "]) +/g, '$1')", "回归修复3：标点后的空格一并去掉（不止标点前）");
has(JS_SRC, "/ {2,}/g, ' '", "回归修复3：连续空格并为一个（原样空格字符不再留多空格）");

console.log("PASS " + pass + " / FAIL " + fail + "（共 " + (pass + fail) + " 断言）");
process.exit(fail === 0 ? 0 : 1);
