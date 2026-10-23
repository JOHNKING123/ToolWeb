/* 年会大屏抽奖纯逻辑单元测试（零依赖）：node tests/annual_lottery.test.js
 * 覆盖：名单解析/去重计数、姓名-工号格式、奖项校验、安全随机抽取不重复、
 * 候选池防重复、导出文本格式、缓动函数、localStorage 序列化、源码零 fetch/XHR。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var al = require("../static/js/annual_lottery.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "annual_lottery.js"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function contains(hay, needle, name) { ok(String(hay).indexOf(needle) !== -1, name + "（期望包含 " + JSON.stringify(needle) + "）"); }
/* 确定性随机：永远取首个 */
function first(n) { return 0; }
/* 确定性随机：取最后一个 */
function last(n) { return n - 1; }
function mkPeople(names) {
    return names.map(function (n) { return { name: n, extra: "", raw: n }; });
}

/* ---------- 1. 名单解析：基本 ---------- */
(function () {
    var r = al.parseNames("张三\n李四\n王五\n");
    eq(r.people.length, 3, "3 行解析出 3 人");
    eq(r.total, 3, "有效行计数 3");
    eq(r.dup, 0, "无重复时去重计数 0");
    eq(r.people[0].name, "张三", "首人姓名");
    eq(r.people[2].raw, "王五", "raw 保留原文");
})();

/* ---------- 2. 名单解析：空行/空白 ---------- */
(function () {
    var r = al.parseNames("\n  \n张三\n\n   李四  \n\t\n");
    eq(r.people.length, 2, "空行与空白行被跳过");
    eq(r.total, 2, "有效行只计 2");
    eq(r.people[1].name, "李四", "行首尾空白被 trim");
    eq(al.parseNames("").people.length, 0, "空输入 0 人");
    eq(al.parseNames("   \n\n ").total, 0, "纯空白输入 total 0");
})();

/* ---------- 3. 名单解析：去重计数 ---------- */
(function () {
    var r = al.parseNames("张三\n李四\n张三\n王五\n李四\n张三\n");
    eq(r.people.length, 3, "去重后 3 人");
    eq(r.total, 6, "有效行 6");
    eq(r.dup, 3, "去重计数 3");
    eq(r.people.map(function (p) { return p.name; }).join(","), "张三,李四,王五", "保留首次出现顺序");
    var r2 = al.parseNames("张三 \n张三\n");
    eq(r2.dup, 1, "首尾空白差异视为同一人去重");
})();

/* ---------- 4. 姓名-工号格式 ---------- */
(function () {
    var p = al.parseOneName("张三-001");
    eq(p.name, "张三", "姓名-工号：姓名部分");
    eq(p.extra, "001", "姓名-工号：工号部分");
    eq(p.raw, "张三-001", "raw 保留");
    var p2 = al.parseOneName("李四：A102");
    eq(p2.name, "李四", "中文冒号分隔");
    eq(p2.extra, "A102", "中文冒号后段");
    var p3 = al.parseOneName("王五");
    eq(p3.name, "王五", "无分隔符时 extra 为空");
    eq(p3.extra, "", "无分隔符 extra 空串");
    var r = al.parseNames("张三-001\n张三-002\n张三-001\n");
    eq(r.people.length, 2, "同名不同工号视为两人");
    eq(r.dup, 1, "整行完全相同才去重");
})();

/* ---------- 5. 奖项预设与校验 ---------- */
(function () {
    var ds = al.defaultAwards();
    eq(ds.length, 3, "默认 3 个奖项");
    eq(ds[0].name + "/" + ds[0].count, "一等奖/1", "一等奖默认 1 名");
    eq(ds[1].name + "/" + ds[1].count, "二等奖/2", "二等奖默认 2 名");
    eq(ds[2].name + "/" + ds[2].count, "三等奖/3", "三等奖默认 3 名");
    eq(al.validateAward("一等奖", 1), "", "合法奖项校验通过");
    ok(al.validateAward("", 1) !== "", "空奖项名不合法");
    ok(al.validateAward("特等奖", 0) !== "", "名额 0 不合法");
    ok(al.validateAward("特等奖", -2) !== "", "负名额不合法");
    ok(al.validateAward("特等奖", 1.5) !== "", "小数名额不合法");
    ok(al.validateAward("特等奖", "abc") !== "", "非数字名额不合法");
    var id1 = al.newAwardId(), id2 = al.newAwardId();
    ok(id1 !== id2, "新奖项 id 唯一");
})();

/* ---------- 6. 安全随机抽取 ---------- */
(function () {
    var pool = mkPeople(["a", "b", "c", "d", "e"]);
    var w = al.drawWinners(pool, 2, first);
    eq(w.length, 2, "抽 2 个");
    eq(w[0].name + "," + w[1].name, "a,b", "确定性随机取前两个");
    var w2 = al.drawWinners(pool, 3, last);
    eq(w2.map(function (x) { return x.name; }).join(","), "e,d,c", "取末位序列");
    var seen = {};
    al.drawWinners(pool, 5, first).forEach(function (x) { seen[x.name] = 1; });
    eq(Object.keys(seen).length, 5, "抽 5 个不重复");
    eq(al.drawWinners(pool, 10, first).length, 5, "名额超池时全取不抛错");
    eq(al.drawWinners([], 3, first).length, 0, "空池抽 0 个");
    eq(al.drawWinners(pool, 0, first).length, 0, "名额 0 抽 0 个");
    eq(pool.length, 5, "原 pool 不被破坏");
    /* 无注入时走 crypto/Math.random：只断言范围与不重复 */
    var w3 = al.drawWinners(pool, 5);
    eq(w3.length, 5, "真实随机抽 5 个");
    var s3 = {};
    w3.forEach(function (x) { s3[x.name] = 1; });
    eq(Object.keys(s3).length, 5, "真实随机 5 个不重复");
})();

/* ---------- 7. 候选池防重复 ---------- */
(function () {
    var people = mkPeople(["张三", "李四", "王五"]);
    var winners = [{ name: "张三", raw: "张三" }];
    var p1 = al.buildPool(people, winners, true);
    eq(p1.length, 2, "防重复开：已中奖者移出候选池");
    eq(p1.map(function (x) { return x.name; }).join(","), "李四,王五", "候选池不含张三");
    var p2 = al.buildPool(people, winners, false);
    eq(p2.length, 3, "防重复关：候选池含全部");
    var p3 = al.buildPool(people, [], true);
    eq(p3.length, 3, "无中奖记录时池全量");
    /* 第二轮不重复：第一轮抽中的人第二轮抽不到 */
    var firstRound = al.drawWinners(al.buildPool(people, [], true), 1, first);
    eq(firstRound[0].name, "张三", "第一轮抽中张三");
    var wrec = [{ name: "张三", extra: "", raw: "张三", awardId: "a1", awardName: "一等奖", ts: 1 }];
    var second = al.drawWinners(al.buildPool(people, wrec, true), 2, first);
    ok(second.every(function (x) { return x.name !== "张三"; }), "第二轮不重复已中奖者");
})();

/* ---------- 8. 导出文本格式 ---------- */
(function () {
    var ws = [
        { awardId: "a1", awardName: "一等奖", name: "张三", extra: "001", raw: "张三-001", ts: 1 },
        { awardId: "a2", awardName: "二等奖", name: "李四", extra: "", raw: "李四", ts: 2 },
        { awardId: "a2", awardName: "二等奖", name: "王五", extra: "003", raw: "王五-003", ts: 3 }
    ];
    var txt = al.exportWinnersText(ws, new Date(2026, 9, 23, 21, 0, 0));
    contains(txt, "年会抽奖中奖名单", "含标题");
    contains(txt, "一等奖（1名）：", "一等奖分组标题");
    contains(txt, "二等奖（2名）：", "二等奖分组标题");
    contains(txt, "1. 张三（001）", "含奖项＋姓名＋工号");
    contains(txt, "1. 李四", "无工号时只列姓名");
    ok(txt.indexOf("一等奖") < txt.indexOf("二等奖"), "奖项按首次出现顺序分组");
    var empty = al.exportWinnersText([], new Date(2026, 9, 23));
    contains(empty, "暂无中奖记录", "空记录导出有提示");
})();

/* ---------- 9. 缓动函数 ---------- */
(function () {
    eq(al.easeOutQuart(0), 0, "t=0 -> 0");
    eq(al.easeOutQuart(1), 1, "t=1 -> 1");
    ok(al.easeOutQuart(0.5) > 0.5, "easeOut 前快后慢（中点大于线性）");
    ok(al.easeOutQuart(0.25) < al.easeOutQuart(0.75), "单调递增");
    eq(al.easeOutQuart(-1), 0, "越界钳制 0");
    eq(al.easeOutQuart(2), 1, "越界钳制 1");
})();

/* ---------- 10. 持久化：存取往返 ---------- */
(function () {
    var store = al.createStore(al.memStorage());
    eq(store.load(), null, "空存储 load 得 null");
    var st = al.defaultState();
    st.people = al.parseNames("张三-001\n李四\n").people;
    st.winners = [{ awardId: "a1", awardName: "一等奖", name: "张三", extra: "001", raw: "张三-001", ts: 123 }];
    st.noRepeat = false;
    st.currentAwardId = "a2";
    store.save(st);
    var back = al.normalizeState(store.load());
    eq(back.people.length, 2, "名单恢复 2 人");
    eq(back.people[0].extra, "001", "工号恢复");
    eq(back.winners.length, 1, "中奖记录恢复");
    eq(back.winners[0].awardName, "一等奖", "奖项名恢复");
    eq(back.noRepeat, false, "防重复开关恢复（关）");
    eq(back.currentAwardId, "a2", "当前奖项恢复");
    eq(back.awards.length, 3, "奖项配置恢复");
    store.clear();
    eq(store.load(), null, "clear 后 load 得 null");
})();

/* ---------- 11. 持久化：脏数据容错 ---------- */
(function () {
    var store = al.createStore(al.memStorage());
    var bad = al.memStorage();
    bad.setItem(al.STORE_KEY, "{not json");
    eq(al.createStore(bad).load(), null, "损坏 JSON 返回 null");
    var st = al.normalizeState({ people: "xx", awards: [], winners: null });
    eq(st.people.length, 0, "非法名单字段回退空");
    eq(st.awards.length, 3, "空奖项回退默认预设");
    eq(st.noRepeat, true, "开关缺失默认开");
    var st2 = al.normalizeState({ people: [{ name: "  " }, { name: "张三", extra: "001" }], awards: al.defaultAwards(), winners: [] });
    eq(st2.people.length, 1, "空白姓名被过滤");
    eq(st2.people[0].raw, "张三", "缺 raw 时回退用姓名");
})();

/* ---------- 12. 示例名单 ---------- */
(function () {
    var ps = al.buildSamplePeople();
    eq(ps.length, 50, "示例名单 50 人");
    var seen = {};
    ps.forEach(function (p) { seen[p.raw] = 1; });
    eq(Object.keys(seen).length, 50, "示例名单无重复");
    ok(ps.every(function (p) { return p.extra !== ""; }), "示例名单带工号");
})();

/* ---------- 13. 源码零 fetch/XHR ---------- */
(function () {
    ok(!/fetch\s*\(/.test(SRC), "源码无 fetch(");
    ok(!/XMLHttpRequest/.test(SRC), "源码无 XMLHttpRequest");
    ok(!/\beval\s*\(/.test(SRC), "源码无 eval(");
    ok(!/new\s+Function\s*\(/.test(SRC), "源码无 new Function");
    ok(/getRandomValues/.test(SRC), "源码使用 crypto.getRandomValues");
    ok(/requestAnimationFrame/.test(SRC), "源码使用 requestAnimationFrame");
    ok(/localStorage/.test(SRC), "源码使用 localStorage 持久化");
})();

console.log("PASS " + pass + " / FAIL " + fail + "（共 " + (pass + fail) + " 断言）");
process.exit(fail ? 1 : 0);
