/* 汉字笔顺查询纯函数单元测试（零依赖）：node tests/hanzi_stroke_order.test.js
 * 覆盖：笔画数锚点精确值（21 字，见下注：规格锚点「日→2」与《现代汉语通用字
 * 笔顺规范》及 hanzi-writer-data 均冲突——「日」按规范为 4 画：竖、横折、横、
 * 横，数据亦为 4 画，开发轮以规范与数据为准取 4，规格锚点待 PM 修正为 4）、
 * getStrokes 结构（index 0–4 连续、d 非空且为合法 SVG 路径）、isSupported／
 * 未收录抛错 err.field='char'（message 含「暂未收录」）、searchByStrokeCount、
 * lookupText（含未收录逐字状态）、clampStep、batchStats、strokeDescription、
 * 收录数下限（实际 957 字 ≥500）、数据文件 ≤1.5MB 目标与 ≤2MB 硬上限、
 * categories.go 注册（Path 总数 325→326、Icon edit 全库唯一、紧邻
 * pinyin_converter）、模板（SEO 关键词、真限制五条、控件、互链、零外部资源
 * 静态检查）、浏览器绑定源码级检查（window.HanziStrokeOrder、描红动画控制、
 * 变速、笔画分解点击定位、批量查询、复制／清空）。
 * Icon 说明：规格首选 stylus 经核查不存在于经典 Material Icons——官方
 * codepoints 全库 2235 条无 stylus；实时下发的 Material Icons v145 woff2
 * cmap 共 2226 字形，无 U+F604（stylus 只存在于 Material Symbols f604，
 * 本站用经典 Material Icons 无法渲染）。改用已验真的 edit（e3c9，v145
 * woff2 cmap 内有此字形，全库唯一）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/hanzi_stroke_order.js");

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
function throwsMsg(fn, field, sub, name) {
    try { fn(); ok(false, name + "（应抛错却未抛）"); }
    catch (e) {
        ok((!field || e.field === field) && String(e.message).indexOf(sub) !== -1,
            name + "（err.field 期望 " + field + "、message 应含 " + sub +
            "，实得 field=" + e.field + " message=" + e.message + "）");
    }
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "hanzi_stroke_order.js"), "utf8");
var DATA_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "hanzi_stroke_data.js"), "utf8");
var DATA_PATH = path.join(ROOT, "static", "js", "hanzi_stroke_data.js");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "hanzi_stroke_order.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. 笔画数锚点精确值 ---------- */
eq(M.getStrokeCount("一"), 1, "笔画数 一→1");
eq(M.getStrokeCount("二"), 2, "笔画数 二→2");
eq(M.getStrokeCount("三"), 3, "笔画数 三→3");
eq(M.getStrokeCount("十"), 2, "笔画数 十→2");
eq(M.getStrokeCount("人"), 2, "笔画数 人→2");
eq(M.getStrokeCount("大"), 3, "笔画数 大→3");
eq(M.getStrokeCount("天"), 4, "笔画数 天→4");
eq(M.getStrokeCount("木"), 4, "笔画数 木→4");
eq(M.getStrokeCount("山"), 3, "笔画数 山→3");
eq(M.getStrokeCount("水"), 4, "笔画数 水→4");
eq(M.getStrokeCount("火"), 4, "笔画数 火→4");
eq(M.getStrokeCount("日"), 4, "笔画数 日→4（规格锚点「日→2」与笔顺规范及数据冲突：日按规范 4 画，开发轮以规范为准，规格待修正）");
eq(M.getStrokeCount("月"), 4, "笔画数 月→4");
eq(M.getStrokeCount("王"), 4, "笔画数 王→4");
eq(M.getStrokeCount("永"), 5, "笔画数 永→5");
eq(M.getStrokeCount("汉"), 5, "笔画数 汉→5");
eq(M.getStrokeCount("字"), 6, "笔画数 字→6");
eq(M.getStrokeCount("学"), 8, "笔画数 学→8");
eq(M.getStrokeCount("国"), 8, "笔画数 国→8");
eq(M.getStrokeCount("书"), 4, "笔画数 书→4");
eq(M.getStrokeCount("爱"), 10, "笔画数 爱→10");
eq(M.getStrokeCount("文"), 4, "笔画数 文→4（常用字速查）");

/* ---------- 2. getStrokes 结构 ---------- */
var yong = M.getStrokes("永");
eq(yong.length, 5, "getStrokes('永') 长度 5");
eqj(yong.map(function (s) { return s.index; }), [0, 1, 2, 3, 4], "getStrokes('永') index 0–4 连续");
ok(yong.every(function (s) { return typeof s.d === "string" && s.d.length > 0; }), "getStrokes('永') 每画 d 非空");
ok(yong.every(function (s) { return /^[MLCQZ0-9 \-]+$/.test(s.d) && s.d.charAt(0) === "M"; }), "getStrokes('永') 每画 d 为合法 SVG 路径（M 开头，仅 M/Q/C/L/Z 与整数坐标）");
eq(M.getStrokes("一").length, 1, "getStrokes('一') 长度 1");
eq(M.getStrokes("爱").length, 10, "getStrokes('爱') 长度 10");
eq(M.getStrokes("学").length, 8, "getStrokes('学') 长度 8");
(function () {
    var chars = M.getSupportedChars();
    var bad = 0;
    for (var i = 0; i < chars.length; i++) {
        var ss = M.getStrokes(chars[i]);
        if (ss.length !== M.getStrokeCount(chars[i])) { bad++; continue; }
        for (var j = 0; j < ss.length; j++) {
            if (ss[j].index !== j || typeof ss[j].d !== "string" || !ss[j].d) { bad++; break; }
        }
    }
    eq(bad, 0, "全量自洽：全部收录字的 getStrokes 长度 = getStrokeCount 且 index 连续、d 非空");
})();

/* ---------- 3. isSupported ---------- */
eq(M.isSupported("永"), true, "isSupported('永')=true");
eq(M.isSupported("一"), true, "isSupported('一')=true");
eq(M.isSupported("爱"), true, "isSupported('爱')=true");
eq(M.isSupported("龘"), false, "isSupported('龘')=false（未收录生僻字）");
eq(M.isSupported("A"), false, "isSupported('A')=false（非汉字）");
eq(M.isSupported(""), false, "isSupported('')=false（空串）");
eq(M.isSupported(123), false, "isSupported(123)=false（非字符串）");
eq(M.isSupported(null), false, "isSupported(null)=false");
eq(M.isSupported(undefined), false, "isSupported(undefined)=false");
eq(M.isSupported("永学"), false, "isSupported('永学')=false（多字）");
eq(M.isSupported(" "), false, "isSupported(' ')=false（空格）");

/* ---------- 4. 未收录／非法参数抛错（err.field='char'） ---------- */
throwsMsg(function () { M.getStrokeCount("龘"); }, "char", "暂未收录", "getStrokeCount('龘') 抛错含「暂未收录」");
throwsMsg(function () { M.getStrokes("龘"); }, "char", "暂未收录", "getStrokes('龘') 抛错含「暂未收录」");
throwsMsg(function () { M.strokeDescription("龘"); }, "char", "暂未收录", "strokeDescription('龘') 抛错含「暂未收录」");
throws(function () { M.getStrokeCount(""); }, "char", "getStrokeCount('') 抛错 err.field=char");
throws(function () { M.getStrokeCount(123); }, "char", "getStrokeCount(123) 抛错 err.field=char");
throws(function () { M.getStrokeCount("永学"); }, "char", "getStrokeCount('永学') 抛错 err.field=char（多字）");
throws(function () { M.getStrokeCount(null); }, "char", "getStrokeCount(null) 抛错 err.field=char");
throws(function () { M.getStrokes(""); }, "char", "getStrokes('') 抛错 err.field=char");
throws(function () { M.getStrokes("A"); }, "char", "getStrokes('A') 抛错 err.field=char（未收录）");

/* ---------- 5. searchByStrokeCount ---------- */
ok(M.searchByStrokeCount(1).indexOf("一") !== -1, "searchByStrokeCount(1) 含 '一'");
ok(M.searchByStrokeCount(5).indexOf("永") !== -1, "searchByStrokeCount(5) 含 '永'");
ok(M.searchByStrokeCount(5).indexOf("汉") !== -1, "searchByStrokeCount(5) 含 '汉'");
ok(M.searchByStrokeCount(2).indexOf("二") !== -1, "searchByStrokeCount(2) 含 '二'");
ok(M.searchByStrokeCount(2).indexOf("十") !== -1, "searchByStrokeCount(2) 含 '十'");
ok(M.searchByStrokeCount(2).indexOf("人") !== -1, "searchByStrokeCount(2) 含 '人'");
ok(M.searchByStrokeCount(4).indexOf("日") !== -1, "searchByStrokeCount(4) 含 '日'");
ok(M.searchByStrokeCount(8).indexOf("学") !== -1, "searchByStrokeCount(8) 含 '学'");
ok(M.searchByStrokeCount(8).indexOf("国") !== -1, "searchByStrokeCount(8) 含 '国'");
eq(M.searchByStrokeCount(1).length, 1, "searchByStrokeCount(1) 仅 1 字（一）");
eqj(M.searchByStrokeCount(30), [], "searchByStrokeCount(30) 无收录字为空数组");
throws(function () { M.searchByStrokeCount(0); }, "count", "searchByStrokeCount(0) 抛错 err.field=count");
throws(function () { M.searchByStrokeCount(-1); }, "count", "searchByStrokeCount(-1) 抛错 err.field=count");
throws(function () { M.searchByStrokeCount(1.5); }, "count", "searchByStrokeCount(1.5) 抛错 err.field=count（须整数）");
throws(function () { M.searchByStrokeCount("5"); }, "count", "searchByStrokeCount('5') 抛错 err.field=count（须数字）");
throws(function () { M.searchByStrokeCount(NaN); }, "count", "searchByStrokeCount(NaN) 抛错 err.field=count");
throws(function () { M.searchByStrokeCount(null); }, "count", "searchByStrokeCount(null) 抛错 err.field=count");
(function () {
    var total = 0;
    for (var n = 1; n <= 30; n++) { total += M.searchByStrokeCount(n).length; }
    eq(total, M.getSupportedChars().length, "按笔画数浏览全量求和 = 收录总数（无遗漏无重复）");
})();

/* ---------- 6. lookupText 批量查询 ---------- */
eqj(M.lookupText("永学"), [
    { char: "永", supported: true, strokeCount: 5, error: "" },
    { char: "学", supported: true, strokeCount: 8, error: "" }
], "lookupText('永学') 两项 strokeCount 5/8");
(function () {
    var r = M.lookupText("永龘");
    eq(r.length, 2, "lookupText('永龘') 两项");
    eq(r[0].supported, true, "lookupText('永龘') 首字已收录");
    eq(r[0].strokeCount, 5, "lookupText('永龘') 首字 5 画");
    eq(r[1].supported, false, "lookupText('永龘') 次字未收录");
    eq(r[1].strokeCount, 0, "lookupText('永龘') 未收录字 strokeCount=0");
    ok(r[1].error.indexOf("暂未收录") !== -1, "lookupText('永龘') 未收录字 error 含「暂未收录」");
})();
eqj(M.lookupText(""), [], "lookupText('') 为空数组");
eq(M.lookupText("永")[0].char, "永", "lookupText('永') 单字");
throws(function () { M.lookupText(123); }, "text", "lookupText(123) 抛错 err.field=text");
throws(function () { M.lookupText(null); }, "text", "lookupText(null) 抛错 err.field=text");
(function () {
    var many = "";
    for (var i = 0; i < 1001; i++) { many += "永"; }
    throws(function () { M.lookupText(many); }, "text", "lookupText 超 1000 字抛错 err.field=text");
})();
eq(M.MAX_BATCH_CHARS, 1000, "MAX_BATCH_CHARS=1000");

/* ---------- 7. clampStep ---------- */
eq(M.clampStep(0, 5), 0, "clampStep(0,5)=0");
eq(M.clampStep(4, 5), 4, "clampStep(4,5)=4");
eq(M.clampStep(5, 5), 4, "clampStep(5,5)=4（上 clamp）");
eq(M.clampStep(99, 5), 4, "clampStep(99,5)=4（上 clamp）");
eq(M.clampStep(-1, 5), 0, "clampStep(-1,5)=0（下 clamp）");
eq(M.clampStep(2.7, 5), 2, "clampStep(2.7,5)=2（向下取整）");
eq(M.clampStep(0, 1), 0, "clampStep(0,1)=0");
eq(M.clampStep(3, 10), 3, "clampStep(3,10)=3");
throws(function () { M.clampStep("2", 5); }, "step", "clampStep('2',5) 抛错 err.field=step");
throws(function () { M.clampStep(NaN, 5); }, "step", "clampStep(NaN,5) 抛错 err.field=step");
throws(function () { M.clampStep(Infinity, 5); }, "step", "clampStep(Infinity,5) 抛错 err.field=step");
throws(function () { M.clampStep(0, 0); }, "total", "clampStep(0,0) 抛错 err.field=total");
throws(function () { M.clampStep(0, -3); }, "total", "clampStep(0,-3) 抛错 err.field=total");
throws(function () { M.clampStep(0, 1.5); }, "total", "clampStep(0,1.5) 抛错 err.field=total");
throws(function () { M.clampStep(0, "5"); }, "total", "clampStep(0,'5') 抛错 err.field=total");

/* ---------- 8. batchStats ---------- */
eqj(M.batchStats(M.lookupText("永学龘")), { total: 3, supported: 2, unsupported: 1 }, "batchStats 混合批量统计精确值");
eqj(M.batchStats([]), { total: 0, supported: 0, unsupported: 0 }, "batchStats 空数组");
throws(function () { M.batchStats(null); }, "batch", "batchStats 非数组抛错 err.field=batch");

/* ---------- 9. strokeDescription ---------- */
(function () {
    var d = M.strokeDescription("永");
    has(d, "「永」", "strokeDescription('永') 含字");
    has(d, "共 5 画", "strokeDescription('永') 含共 5 画");
    has(d, "第 1 画", "strokeDescription('永') 含第 1 画");
    has(d, "第 5 画", "strokeDescription('永') 含第 5 画");
    has(d, "《现代汉语通用字笔顺规范》", "strokeDescription('永') 含笔顺规范");
    has(d, "不做注音", "strokeDescription('永') 含分工不做注音");
})();
throws(function () { M.strokeDescription("龘"); }, "char", "strokeDescription('龘') 抛错 err.field=char");

/* ---------- 10. 收录数与常量 ---------- */
var supported = M.getSupportedChars();
eq(supported.length, 957, "getSupportedChars() 长度 957（实际收录数，首批约 1000）");
ok(supported.length >= 500, "收录数下限 ≥500");
eq(new Set(supported).size, supported.length, "收录字无重复");
ok(supported.every(function (c) { return typeof c === "string" && Array.from(c).length === 1; }), "收录字均为单个汉字");
["一", "二", "三", "十", "人", "大", "天", "木", "山", "水", "火", "日", "月", "王", "永", "汉", "字", "学", "国", "书", "爱"].forEach(function (c) {
    ok(supported.indexOf(c) !== -1, "收录含锚点字 '" + c + "'");
});
eqj(M.QUICK_CHARS, ["永", "学", "书", "爱", "国", "汉", "字", "文"], "常用字速查 永/学/书/爱/国/汉/字/文");
M.QUICK_CHARS.forEach(function (c) {
    ok(M.isSupported(c), "速查字 '" + c + "' 已收录");
});
eqj(M.SPEEDS, [0.5, 1, 2], "变速档 0.5×/1×/2×");
eq(M.BASE_MS_PER_STROKE, 600, "BASE_MS_PER_STROKE=600（每画 0.6 秒）");
eq(M.VIEWBOX, "-120 -120 1264 1264", "VIEWBOX 含 -100..1014 坐标极值留边");

/* ---------- 11. 数据文件 ---------- */
var dataBytes = fs.statSync(DATA_PATH).size;
ok(dataBytes <= 2 * 1024 * 1024, "数据文件 ≤2MB 硬上限（实测 " + dataBytes + " 字节）");
ok(dataBytes <= 1572864, "数据文件 ≤1.5MB 目标（实测 " + dataBytes + " 字节）");
has(DATA_SRC, "hanzi-writer-data", "数据文件头注明来源 hanzi-writer-data");
has(DATA_SRC, "2.0.1", "数据文件头注明版本 2.0.1");
has(DATA_SRC, "ARPHIC", "数据文件头注明许可 ARPHIC Public License（非 MIT，以实测为准）");
has(DATA_SRC, "MakeMeAHanzi", "数据文件头注明上游 MakeMeAHanzi");
has(DATA_SRC, "957", "数据文件头注明收录 957 字");
has(DATA_SRC, "现代汉语通用字笔顺规范", "数据文件头注明笔顺规范");
notHas(DATA_SRC, "medians", "数据文件已剔除 medians 冗余字段");
(function () {
    var raw = require("../static/js/hanzi_stroke_data.js");
    var keys = Object.keys(raw);
    eq(keys.length, 957, "数据文件直读：957 字");
    var bad = 0;
    keys.forEach(function (c) {
        if (!Array.isArray(raw[c]) || raw[c].length === 0) { bad++; return; }
        raw[c].forEach(function (p) {
            if (typeof p !== "string" || !/^[MLCQZ0-9 \-]+$/.test(p) || p.charAt(0) !== "M") { bad++; }
        });
    });
    eq(bad, 0, "数据文件直读：全部笔画路径合法（M 开头，仅 M/Q/C/L/Z 与整数坐标）");
})();

/* ---------- 12. categories.go 注册 ---------- */
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
eq(pathCount, 326, "注册 Path 总数 325→326");
has(GO_SRC, "\"hanzi_stroke_order\"", "注册：ID hanzi_stroke_order");
has(GO_SRC, "\"/tools/hanzi-stroke-order\"", "注册：Path /tools/hanzi-stroke-order");
has(GO_SRC, "\"edit\"", "注册：Icon edit");
eq((GO_SRC.match(/Icon:\s*"edit"/g) || []).length, 1, "Icon edit 全库唯一（stylus 不在经典 Material Icons，改用已验真 edit e3c9）");
var entryBlock = GO_SRC.slice(GO_SRC.indexOf("\"hanzi_stroke_order\"") - 60,
    GO_SRC.indexOf("\"hanzi_stroke_order\"") + 1800);
ok(/New:\s+true/.test(entryBlock), "注册：New: true");
ok(/Category:\s+"编码转换"/.test(entryBlock), "注册：类目 编码转换");
has(entryBlock, "汉字笔顺查询", "注册：名称 汉字笔顺查询");
has(entryBlock, "957", "注册：描述注明收录 957 字");
ok(GO_SRC.indexOf("\"hanzi_stroke_order\"") > GO_SRC.indexOf("\"pinyin_converter\"") &&
    GO_SRC.indexOf("\"hanzi_stroke_order\"") < GO_SRC.indexOf("\"roman_numeral_converter\""),
    "注册：紧邻 pinyin_converter（在其后、roman_numeral_converter 之前）");

/* ---------- 13. 模板：SEO/真限制/控件/互链/零外部资源 ---------- */
has(TPL_SRC, "{{define \"hanzi_stroke_order\"}}", "模板：define hanzi_stroke_order");
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/hanzi-stroke-order", "模板 canonical 含新 Path");
has(TPL_SRC, "汉字笔顺查询", "模板：标题含工具名");
has(TPL_SRC, "汉字笔顺", "模板：SEO 关键词 汉字笔顺");
has(TPL_SRC, "笔顺查询", "模板：SEO 关键词 笔顺查询");
has(TPL_SRC, "汉字笔画顺序", "模板：SEO 关键词 汉字笔画顺序");
has(TPL_SRC, "汉字笔顺动画", "模板：SEO 关键词 汉字笔顺动画");
has(TPL_SRC, "五条真限制", "模板：五条真限制标题");
has(TPL_SRC, "仅收录约 1000 常用字", "模板：真限制 1 仅约 1000 常用字");
has(TPL_SRC, "实际 957 字", "模板：真限制 1 明示实际收录数 957");
has(TPL_SRC, "笔顺以《现代汉语通用字笔顺规范》为准", "模板：真限制 2 笔顺规范为准");
has(TPL_SRC, "标准印刷体，非书法行草", "模板：真限制 3 标准印刷体非书法行草");
has(TPL_SRC, "只做笔顺，不做注音、不做简繁互转", "模板：真限制 4 只做笔顺");
has(TPL_SRC, "轨迹为内置描红路径", "模板：真限制 5 轨迹为内置描红路径");
has(TPL_SRC, "首批收录 957 个最常用汉字", "模板：页面明示实际收录数 957");
has(TPL_SRC, "id=\"hs-input\"", "模板：单字输入框 hs-input");
has(TPL_SRC, "id=\"hs-status\"", "模板：查询状态栏");
has(TPL_SRC, "id=\"hs-char\"", "模板：当前汉字大字位");
has(TPL_SRC, "id=\"hs-count\"", "模板：笔画数显示");
has(TPL_SRC, "id=\"hs-stage\"", "模板：描红动画舞台");
has(TPL_SRC, "id=\"hs-play\"", "模板：播放按钮");
has(TPL_SRC, "id=\"hs-pause\"", "模板：暂停按钮");
has(TPL_SRC, "id=\"hs-prev\"", "模板：上一步按钮");
has(TPL_SRC, "id=\"hs-next\"", "模板：下一步按钮");
has(TPL_SRC, "id=\"hs-replay\"", "模板：重播按钮");
has(TPL_SRC, "id=\"hs-progress\"", "模板：描画进度");
has(TPL_SRC, "data-speed=\"0.5\"", "模板：变速 0.5×");
has(TPL_SRC, "data-speed=\"1\"", "模板：变速 1×");
has(TPL_SRC, "data-speed=\"2\"", "模板：变速 2×");
has(TPL_SRC, "id=\"hs-stroke-list\"", "模板：笔画分解列表");
has(TPL_SRC, "id=\"hs-quick\"", "模板：常用字速查");
has(TPL_SRC, "id=\"hs-browse-select\"", "模板：按笔画数浏览选择框");
has(TPL_SRC, "id=\"hs-browse-grid\"", "模板：按笔画数浏览字表");
has(TPL_SRC, "id=\"hs-batch-input\"", "模板：批量查询输入框");
has(TPL_SRC, "id=\"hs-batch-btn\"", "模板：批量查询按钮");
has(TPL_SRC, "id=\"hs-batch-results\"", "模板：批量查询结果容器");
has(TPL_SRC, "id=\"hs-stats\"", "模板：统计面板容器");
has(TPL_SRC, "id=\"hs-desc\"", "模板：笔顺说明文本框");
has(TPL_SRC, "id=\"hs-copy-btn\"", "模板：复制笔顺说明按钮");
has(TPL_SRC, "id=\"hs-clear\"", "模板：清空按钮");
has(TPL_SRC, "edit", "模板：标题图标 edit");
has(TPL_SRC, "只做汉字笔顺查询", "模板：分工说明只做汉字笔顺查询");
has(TPL_SRC, "/tools/pinyin-converter", "模板：互链 pinyin_converter");
has(TPL_SRC, "汉字转拼音", "模板：互链 汉字转拼音");
has(TPL_SRC, "/tools/traditional-simplified-converter", "模板：互链 traditional_simplified_converter");
has(TPL_SRC, "简繁转换", "模板：互链 简繁转换");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN：无外部字体");
notHas(TPL_SRC, "cdnjs", "模板零 CDN：无 cdnjs");
notHas(TPL_SRC, "unpkg", "模板零 CDN：无 unpkg");
notHas(TPL_SRC, "jsdelivr", "模板零 CDN：无 jsdelivr");
ok((TPL_SRC.match(/<script[^>]*src="http/g) || []).length === 0, "模板零外部脚本：无 http script src");
var httpLinks = TPL_SRC.match(/<link[^>]*href="http[^"]*"/g) || [];
eq(httpLinks.length, 1, "模板 http link 仅 canonical 一条");
ok(httpLinks.length === 1 && httpLinks[0].indexOf("https://www.johnkingzcq123.xyz/tools/hanzi-stroke-order") !== -1, "模板 http link：仅自家 canonical");
has(TPL_SRC, "/tools/static/js/hanzi_stroke_data.js", "模板：先加载笔顺数据 JS");
has(TPL_SRC, "/tools/static/js/hanzi_stroke_order.js", "模板：加载本站 JS");
ok(TPL_SRC.indexOf("hanzi_stroke_data.js") < TPL_SRC.indexOf("hanzi_stroke_order.js"), "模板：数据 JS 在主 JS 之前加载");

/* ---------- 14. 浏览器绑定源码级检查 ---------- */
has(JS_SRC, "window.HanziStrokeOrder", "绑定：挂 window.HanziStrokeOrder");
has(JS_SRC, "module.exports", "绑定：module.exports 同步导出");
has(JS_SRC, "window.HANZI_STROKE_DATA", "绑定：浏览器读 window.HANZI_STROKE_DATA");
has(JS_SRC, "require('./hanzi_stroke_data.js')", "绑定：Node 下 require 数据文件");
has(JS_SRC, "BASE_MS_PER_STROKE", "绑定：每画描画时长常量");
has(JS_SRC, "hs-input", "绑定：单字输入框");
has(JS_SRC, "addEventListener('input', onInput)", "绑定：单字输入即查");
has(JS_SRC, "hs-play", "绑定：播放按钮");
has(JS_SRC, "hs-pause", "绑定：暂停按钮");
has(JS_SRC, "hs-prev", "绑定：上一步按钮");
has(JS_SRC, "hs-next", "绑定：下一步按钮");
has(JS_SRC, "hs-replay", "绑定：重播按钮");
has(JS_SRC, "hs-speed-btn", "绑定：变速按钮");
has(JS_SRC, "hs-stroke-list", "绑定：笔画分解列表");
has(JS_SRC, "jumpToStep", "绑定：笔画分解点击定位");
has(JS_SRC, "hs-quick", "绑定：常用字速查");
has(JS_SRC, "hs-browse-select", "绑定：按笔画数浏览");
has(JS_SRC, "hs-batch-input", "绑定：批量查询输入框");
has(JS_SRC, "hs-batch-btn", "绑定：批量查询按钮");
has(JS_SRC, "hs-stats", "绑定：统计面板");
has(JS_SRC, "hs-copy-btn", "绑定：复制笔顺说明");
has(JS_SRC, "hs-clear", "绑定：清空");
has(JS_SRC, "strokeDescription", "绑定：笔顺说明文本");
has(JS_SRC, "requestAnimationFrame", "绑定：描红动画用 requestAnimationFrame");
has(JS_SRC, "stroke-dashoffset", "绑定：逐画描红用 dashoffset");
has(JS_SRC, "createElementNS", "绑定：SVG 命名空间建 path");
notHas(JS_SRC, "cdnjs", "绑定：无 CDN 引用");
notHas(JS_SRC, "fonts.googleapis", "绑定：无外部字体引用");
notHas(JS_SRC, "XMLHttpRequest", "绑定：无后端请求");
notHas(JS_SRC, "fetch(", "绑定：无 fetch 请求");

console.log("PASS " + pass + " / FAIL " + fail + "（共 " + (pass + fail) + " 断言）");
process.exit(fail === 0 ? 0 : 1);
