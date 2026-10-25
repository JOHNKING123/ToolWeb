/* 匿名抽签生成器纯逻辑单元测试（零依赖）：node tests/secret_santa_generator.test.js
 * 覆盖：名单解析去空去重、重名检测、排除对解析、错位排列、禁互抽、
 * 排除对生效、双射、不可行判定、单人结果文本、切人遮罩状态、
 * 生成按钮文案、注册与零网络／零持久化静态检查。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/secret_santa_generator.js");
var GO_SRC = fs.readFileSync(path.join(__dirname, "../tools/categories.go"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(__dirname, "../templates/secret_santa_generator.html"), "utf8");
var JS_SRC = fs.readFileSync(path.join(__dirname, "../static/js/secret_santa_generator.js"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

/* 确定性随机源（xorshift32）：测约束不变式，不测随机本身。
 * 注意不用 LCG：其乘数可被小 bound 整除时取模结果会恒定，洗牌失真。 */
function lcg(seed) {
    var s = seed >>> 0 || 1;
    return function () {
        s ^= (s << 13) >>> 0; s >>>= 0;
        s ^= s >>> 17;
        s ^= (s << 5) >>> 0; s >>>= 0;
        return s;
    };
}
function names(n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push({ name: "人" + i, note: null, display: "人" + i });
    return out;
}
function checkInvariants(entries, opts, label) {
    var res = M.generatePairing(entries, opts, lcg(12345));
    ok(res.ok, label + "：生成成功");
    if (!res.ok) return;
    var rep = M.verifyPairing(res.pairs, opts);
    eq(rep.selfCount, 0, label + "：无自抽");
    eq(rep.excludedHits, 0, label + "：排除对命中 0");
    ok(rep.bijective, label + "：双射（每人恰抽 1 人且恰被抽 1 次）");
    if (opts.noMutual) eq(rep.mutualCount, 0, label + "：禁互抽开时无互抽");
    ok(rep.valid, label + "：校验报告 valid");
}

/* ---------- 1. 名单解析：去空去重、姓名-备注 ---------- */
var p = M.parseNames("张三\n\n李四-技术部\n张三\n王五\n");
eq(p.entries.length, 3, "名单：去空去重后 3 人");
eq(p.removedEmpty, 2, "名单：空行 2 个（首尾空行各 1）");
eq(p.removedDup, 1, "名单：重复行 1 个");
eq(p.entries[1].name, "李四", "名单：姓名-备注拆出姓名");
eq(p.entries[1].note, "技术部", "名单：姓名-备注拆出备注");
eq(p.entries[1].display, "李四（技术部）", "名单：备注显示为全角括号");
eq(M.parseNames("").entries.length, 0, "名单：空输入 0 人");
eq(M.parseNames("  \n\t\n").entries.length, 0, "名单：纯空白行 0 人");
var pc = M.parseNames("A\nB");
eq(pc.removedEmpty, 0, "名单：无空行时 removedEmpty 为 0");

/* ---------- 2. 重名检测 ---------- */
eq(M.findDuplicateNames(M.parseNames("张三\n李四\n").entries).length, 0, "重名：无重名");
var dups = M.findDuplicateNames(M.parseNames("张三\n张三-销售部\n张三-技术部\n李四\n").entries);
eq(dups.length, 1, "重名：同名不同备注仍算重名（备注不区分身份）");
eq(dups[0].name, "张三", "重名：重名姓名为张三");
eq(dups[0].count, 3, "重名：张三出现 3 次");

/* ---------- 3. 排除对解析 ---------- */
var ents = M.parseNames("张三\n李四\n王五\n").entries;
var ex = M.parseExclusions("张三，李四\n", ents);
eq(ex.errors.length, 0, "排除对：合法输入无错");
eq(ex.pairs.length, 1, "排除对：解析出 1 对");
eq(M.parseExclusions("张三，赵六\n", ents).errors.length, 1, "排除对：不在名单内报错");
eq(M.parseExclusions("张三，张三\n", ents).errors.length, 1, "排除对：自指报错");
eq(M.parseExclusions("张三李四\n", ents).errors.length, 1, "排除对：无分隔符报错");
eq(M.parseExclusions("张三，李四\n李四，张三\n", ents).pairs.length, 1, "排除对：反向重复对去重");

/* ---------- 4. 配对闭环：5 / 12 / 50 人 ---------- */
checkInvariants(names(5), { noMutual: true, exclusions: [] }, "配对 5 人");
checkInvariants(names(12), { noMutual: true, exclusions: [] }, "配对 12 人");
checkInvariants(names(50), { noMutual: true, exclusions: [] }, "配对 50 人");

/* ---------- 5. 排除对生效（双向） ---------- */
var e5 = names(5);
var exPairs = [[e5[0], e5[1]]];
var rEx = M.generatePairing(e5, { noMutual: true, exclusions: exPairs }, lcg(999));
ok(rEx.ok, "排除对：生成成功");
if (rEx.ok) {
    var hit = rEx.pairs.some(function (pr) {
        return (pr.giver.display === "人0" && pr.receiver.display === "人1") ||
            (pr.giver.display === "人1" && pr.receiver.display === "人0");
    });
    ok(!hit, "排除对：A 不抽 B 且 B 不抽 A");
}

/* ---------- 6. 禁互抽关闭：允许互抽但仍无自抽 ---------- */
var rOpen = M.generatePairing(names(12), { noMutual: false, exclusions: [] }, lcg(7));
ok(rOpen.ok, "禁互抽关：生成成功");
if (rOpen.ok) {
    var repOpen = M.verifyPairing(rOpen.pairs, { noMutual: false, exclusions: [] });
    eq(repOpen.selfCount, 0, "禁互抽关：仍无自抽");
    ok(repOpen.bijective, "禁互抽关：仍双射");
}

/* ---------- 7. 不可行闭环 ---------- */
var r2 = M.generatePairing(names(2), { noMutual: true, exclusions: [] }, lcg(1));
ok(!r2.ok, "不可行：禁互抽下 2 人无解");
ok(r2.error.indexOf("无解") !== -1, "不可行：2 人报错含无解");
ok(r2.suggestion && r2.suggestion.length > 0, "不可行：2 人给出松绑建议");
ok(!r2.pairs, "不可行：2 人不输出配对");
var rFew = M.generatePairing(names(2), { noMutual: false, exclusions: [] }, lcg(1));
ok(!rFew.ok, "不可行：人数下限 3 人，2 人直接报错");
var e3 = names(3);
var overEx = [[e3[0], e3[1]], [e3[0], e3[2]]]; /* 人0 排除了全部他人 */
var rOver = M.generatePairing(e3, { noMutual: true, exclusions: overEx }, lcg(1));
ok(!rOver.ok, "不可行：过度排除对无解");
ok(rOver.suggestion && rOver.suggestion.indexOf("排除") !== -1, "不可行：过度排除建议含删减排除对");
ok(!rOver.pairs, "不可行：过度排除不输出配对");

/* ---------- 8. 单人结果文本与切人遮罩 ---------- */
var pair = { giver: { display: "张三" }, receiver: { display: "李四（技术部）" } };
eq(M.singleResultText(pair), "张三，你的互赠对象是李四（技术部）", "单人文本：只含单人一条");
ok(M.singleResultText(pair).indexOf("王五") === -1, "单人文本：不含他人");
var sw = M.viewerSwitch("张三", "李四");
eq(sw.current, "李四", "遮罩：切人后当前为新选人");
ok(sw.clearedPrevious, "遮罩：切人标记上一条已清除");
var sw2 = M.viewerSwitch("张三", "张三");
ok(!sw2.clearedPrevious, "遮罩：同人重选不标记清除");
var sw3 = M.viewerSwitch("张三", null);
eq(sw3.current, null, "遮罩：清空后当前为空");
ok(sw3.clearedPrevious, "遮罩：清空标记上一条已清除");

/* ---------- 9. 生成按钮文案 ---------- */
eq(M.generateButtonLabel(12, { noMutual: true, exclusions: [] }),
    "为 12 人生成配对（禁自抽＋禁互抽）", "按钮文案：12 人禁互抽");
ok(M.generateButtonLabel(5, { noMutual: false, exclusions: [[1, 2]] }).indexOf("禁互抽") === -1,
    "按钮文案：禁互抽关闭时不含禁互抽");
ok(M.generateButtonLabel(5, { noMutual: true, exclusions: [[1, 2]] }).indexOf("排除对 1 对") !== -1,
    "按钮文案：含排除对计数");

/* ---------- 10. 常量与随机源 ---------- */
eq(M.MIN_PEOPLE, 3, "常量：下限 3 人");
eq(M.MAX_PEOPLE, 200, "常量：上限 200 人");
ok(M.MAX_ATTEMPTS > 0, "常量：尝试上限存在（防无限循环）");
ok(JS_SRC.indexOf("getRandomValues") !== -1, "随机：源码含 crypto.getRandomValues");
ok(JS_SRC.indexOf("Math.random") === -1, "随机：源码全文无 Math.random");

/* ---------- 11. 注册与零网络／零持久化静态检查 ---------- */
ok(GO_SRC.indexOf('"secret_santa_generator"') !== -1, "注册：categories.go 含 ID");
ok(GO_SRC.indexOf('"/tools/secret-santa-generator"') !== -1, "注册：categories.go 含 Path");
ok(GO_SRC.indexOf('"card_giftcard"') !== -1, "注册：Icon 为 card_giftcard");
ok(GO_SRC.indexOf('New:') !== -1, "注册：New 字段存在");
var pathCount = (GO_SRC.match(/"\/tools\/[^"]+"/g) || []).filter(function (v, i, a) {
    return a.indexOf(v) === i;
}).length;
ok(pathCount >= 179, "注册：Path 总数 ≥179（实得 " + pathCount + "）");
ok(TPL_SRC.indexOf('{{define "secret_santa_generator"}}') !== -1, "模板：define 名与路由映射一致");
ok(TPL_SRC.indexOf("/tools/annual-lottery") !== -1, "模板：互链年会大屏抽奖");
ok(TPL_SRC.indexOf("random-decision") === -1, "模板：不与随机决策器硬凑互链");
ok(TPL_SRC.indexOf("https://www.johnkingzcq123.xyz/tools/secret-santa-generator") !== -1, "SEO：canonical 正确");
ok(TPL_SRC.indexOf("仅限单设备单会话") !== -1, "真限制：页面含单设备单会话文案");
ok(TPL_SRC.indexOf("无私密链接") !== -1, "真限制：页面含无私密链接文案");
ok(TPL_SRC.indexOf("不上传") !== -1, "真限制：页面含不上传文案");
ok(TPL_SRC.indexOf("2 人无解") !== -1, "真限制：页面含 2 人无解文案");
ok(TPL_SRC.indexOf("重名需加区分标识") !== -1, "真限制：页面含重名区分标识文案");
ok(TPL_SRC.indexOf("刷新即失") !== -1, "真限制：页面含刷新即失文案");
ok(TPL_SRC.indexOf("不展示全量配对表") !== -1, "保密：页面明示不展示全量配对表");
ok(JS_SRC.indexOf("localStorage.") === -1 && JS_SRC.indexOf("sessionStorage.") === -1, "保密：JS 无持久化存储读写调用");
ok(JS_SRC.indexOf("setItem") === -1, "保密：JS 无 setItem 持久化写入");
ok(JS_SRC.indexOf("fetch(") === -1, "网络：JS 无 fetch");
ok(JS_SRC.indexOf("XMLHttpRequest") === -1, "网络：JS 无 XHR");
ok(TPL_SRC.indexOf("localStorage.") === -1, "保密：模板无持久化存储调用");
ok(!/src="https?:/.test(TPL_SRC), "网络：模板无外部脚本");
var tplNoCanonical = TPL_SRC.replace(/<link rel="canonical"[^>]*>/g, "");
ok(!/<link[^>]+href="https?:/.test(tplNoCanonical), "网络：模板除 canonical 外无外部样式链接");

console.log("secret_santa_generator: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
