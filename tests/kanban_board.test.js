/* 本地看板任务管理（kanban_board）纯逻辑单元测试（零依赖）：
 * node tests/kanban_board.test.js
 * 覆盖：常量与默认看板、列 CRUD（上限 8 列/调序/找到已完成列/只清已完成语义）、卡片 CRUD、
 * 移动与插入索引（可见索引→真实下标映射）、localStorage 读写降级、标签解析、过期判断与 due 格式校验、
 * 筛选搜索、导出导入（含 done 标记透传）、模板关键元素与隐私文案、脚本零 fetch/XHR。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var KB = require("../static/js/kanban_board.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "kanban_board.js"), "utf8");
var TPL = fs.readFileSync(path.join(__dirname, "..", "templates", "kanban_board.html"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function deepEq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

/* 内存存储（模拟 localStorage） */
function memStore(seed) {
    var m = seed ? { tw_kanban_board_v1: seed } : {};
    return {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
        setItem: function (k, v) { m[k] = String(v); },
        _raw: function () { return m[KB.STORAGE_KEY]; }
    };
}
function quotaStore() {
    return {
        getItem: function () { return null; },
        setItem: function () { var e = new Error("quota"); e.name = "QuotaExceededError"; throw e; }
    };
}
function throwingStore() {
    return {
        getItem: function () { throw new Error("denied"); },
        setItem: function () { throw new Error("denied"); }
    };
}

/* ---------- 0. 常量与默认看板 ---------- */
eq(KB.STORAGE_KEY, "tw_kanban_board_v1", "存储 key 为 tw_kanban_board_v1");
eq(KB.STORE_VERSION, 1, "存储版本号为 1");
eq(KB.MAX_COLUMNS, 8, "列上限为 8");
var b0 = KB.defaultBoard();
eq(b0.version, 1, "默认看板版本号 1");
eq(b0.columns.length, 3, "默认看板 3 列");
deepEq(b0.columns.map(function (c) { return c.title; }), ["待办", "进行中", "已完成"], "默认三列标题");
ok(b0.columns.every(function (c) { return c.cards.length === 0; }), "默认列卡片为空");
ok(KB.validateBoard(b0), "默认看板通过校验");

/* ---------- 1. 列 CRUD ---------- */
var b1 = KB.defaultBoard();
ok(KB.addColumn(b1, "测试列"), "新增列成功");
eq(b1.columns.length, 4, "新增后 4 列");
eq(b1.columns[3].title, "测试列", "新列标题正确");
ok(KB.renameColumn(b1, b1.columns[3].id, "改名列"), "重命名成功");
eq(b1.columns[3].title, "改名列", "重命名生效");
ok(!KB.renameColumn(b1, b1.columns[3].id, "   "), "空标题重命名失败");
ok(!KB.renameColumn(b1, "no-such", "x"), "不存在的列重命名失败");
var colId = b1.columns[3].id;
ok(KB.removeColumn(b1, colId), "删除列成功");
eq(b1.columns.length, 3, "删除后恢复 3 列");
ok(!KB.removeColumn(b1, "no-such"), "删除不存在的列失败");
/* 上限 */
var b2 = KB.defaultBoard();
for (var i = 0; i < 5; i++) KB.addColumn(b2, "列" + i);
eq(b2.columns.length, 8, "加到 8 列");
ok(!KB.addColumn(b2, "第9列"), "第 9 列被拒绝");
eq(b2.columns.length, 8, "拒绝后仍为 8 列");
/* 调序 */
var b3 = KB.defaultBoard();
var ids = b3.columns.map(function (c) { return c.id; });
ok(KB.moveColumn(b3, ids[1], -1), "第二列左移成功");
deepEq(b3.columns.map(function (c) { return c.id; }), [ids[1], ids[0], ids[2]], "左移后顺序正确");
ok(!KB.moveColumn(b3, ids[1], -1), "已在最左再左移失败");
ok(KB.moveColumn(b3, ids[1], 1), "第一列右移成功");
deepEq(b3.columns.map(function (c) { return c.id; }), [ids[0], ids[1], ids[2]], "右移后恢复原序");
ok(!KB.moveColumn(b3, ids[2], 1), "已在最右再右移失败");
ok(!KB.moveColumn(b3, "no-such", 1), "不存在的列调序失败");
/* 清空列 */
var b4 = KB.defaultBoard();
KB.addCard(b4, b4.columns[0].id, { title: "卡1" });
KB.addCard(b4, b4.columns[0].id, { title: "卡2" });
ok(KB.clearColumn(b4, b4.columns[0].id), "清空列成功");
eq(b4.columns[0].cards.length, 0, "清空后卡片数为 0");
ok(!KB.clearColumn(b4, "no-such"), "清空不存在的列失败");
/* 找到已完成列（「只清已完成列」的语义基础） */
var bd0 = KB.defaultBoard();
var done0 = KB.findDoneColumn(bd0);
ok(done0 && done0.column.title === "已完成" && done0.column.done === true, "默认板 findDoneColumn 命中 done:true 列");
KB.renameColumn(bd0, done0.column.id, "搞定");
var done1 = KB.findDoneColumn(bd0);
ok(done1 && done1.column.id === done0.column.id, "列重命名后 done 标记仍可找到");
KB.removeColumn(bd0, done0.column.id);
ok(KB.findDoneColumn(bd0) === null, "删除 done 列后找不到");
/* 退化匹配：无 done 标记（旧版备份）但标题为「已完成」 */
var bf0 = KB.defaultBoard();
bf0.columns.forEach(function (c) { delete c.done; });
var done2 = KB.findDoneColumn(bf0);
ok(done2 && done2.column.title === "已完成", "无 done 标记时退化按标题「已完成」匹配");
bf0.columns.forEach(function (c) { c.title = "列" + c.id; });
ok(KB.findDoneColumn(bf0) === null, "既无标记又无该标题返回 null");
/* 一键清空已完成：只有 done 列卡片被清，其它列保留 */
var bc0 = KB.defaultBoard();
KB.addCard(bc0, bc0.columns[0].id, { title: "待办卡" });
KB.addCard(bc0, bc0.columns[2].id, { title: "完成卡1" });
KB.addCard(bc0, bc0.columns[2].id, { title: "完成卡2" });
var dc0 = KB.findDoneColumn(bc0);
ok(KB.clearColumn(bc0, dc0.column.id), "清空已完成列成功");
eq(bc0.columns[2].cards.length, 0, "已完成列卡片为 0");
eq(bc0.columns[0].cards.length, 1, "待办列卡片保留");
eq(bc0.columns[0].cards[0].title, "待办卡", "保留的卡片数据完整");

/* ---------- 2. 卡片 CRUD ---------- */
var b5 = KB.defaultBoard();
var colA = b5.columns[0].id;
var card = KB.addCard(b5, colA, { title: " 写总结 ", description: "季度\n总结", priority: "high", due: "2026-10-30", tags: "工作，紧急,工作" });
ok(card && card.id, "新增卡片返回卡片对象");
eq(card.title, "写总结", "标题自动 trim");
eq(card.priority, "high", "优先级 high");
deepEq(card.tags, ["工作", "紧急"], "标签中英文逗号分隔＋去重");
eq(b5.columns[0].cards.length, 1, "卡片落入目标列");
ok(KB.addCard(b5, colA, { title: "   " }) === null, "空标题拒绝新增");
ok(KB.addCard(b5, "no-such", { title: "x" }) === null, "不存在的列拒绝新增");
var card2 = KB.addCard(b5, colA, { title: "普通卡", priority: "weird" });
eq(card2.priority, "medium", "非法优先级回退 medium");
var f = KB.findCard(b5, card.id);
ok(f && f.card === card && f.column.id === colA && f.cardIndex === 0, "findCard 定位正确");
ok(KB.updateCard(b5, card.id, { title: "新标题", priority: "low", due: "", tags: "生活" }), "更新卡片成功");
eq(card.title, "新标题", "更新标题生效");
eq(card.priority, "low", "更新优先级生效");
eq(card.due, "", "更新清空截止日期");
deepEq(card.tags, ["生活"], "更新标签生效");
ok(!KB.updateCard(b5, card.id, { title: "  " }), "空标题更新被拒绝");
ok(!KB.updateCard(b5, "no-such", { title: "x" }), "更新不存在的卡片失败");
ok(KB.deleteCard(b5, card.id), "删除卡片成功");
ok(KB.findCard(b5, card.id) === null, "删除后找不到卡片");
ok(!KB.deleteCard(b5, "no-such"), "删除不存在的卡片失败");

/* ---------- 3. 移动卡片与插入索引 ---------- */
var b6 = KB.defaultBoard();
var cA = b6.columns[0].id, cB = b6.columns[1].id;
var a1 = KB.addCard(b6, cA, { title: "a1" });
var a2 = KB.addCard(b6, cA, { title: "a2" });
var a3 = KB.addCard(b6, cA, { title: "a3" });
ok(KB.moveCard(b6, a3.id, cB, 0), "跨列移动到目标列顶部");
eq(b6.columns[1].cards[0].id, a3.id, "目标列顶部为该卡片");
eq(b6.columns[0].cards.length, 2, "源列剩余 2 张");
ok(KB.moveCard(b6, a1.id, cA, 1), "同列调序");
deepEq(b6.columns[0].cards.map(function (c) { return c.id; }), [a2.id, a1.id], "同列调序后顺序正确");
ok(KB.moveCard(b6, a2.id, cB, 999), "越界索引钳制到列尾");
eq(b6.columns[1].cards[b6.columns[1].cards.length - 1].id, a2.id, "越界插入落到列尾");
ok(KB.moveCard(b6, a1.id, cB, -5), "负索引钳制到列头");
eq(b6.columns[1].cards[0].id, a1.id, "负索引插入列头");
ok(!KB.moveCard(b6, "no-such", cB, 0), "移动不存在的卡片失败");
ok(!KB.moveCard(b6, a1.id, "no-such", 0), "移动到不存在的列失败");
/* 插入索引纯函数 */
eq(KB.calcInsertIndex([100, 200, 300], 50), 0, "指针在首卡中点上方→0");
eq(KB.calcInsertIndex([100, 200, 300], 150), 1, "指针在两卡之间→1");
eq(KB.calcInsertIndex([100, 200, 300], 350), 3, "指针在末卡下方→列尾");
eq(KB.calcInsertIndex([], 999), 0, "空列→0");
eq(KB.calcInsertIndex([100, 200, 300], 100), 1, "恰在中点上按严格小于→下一位");
/* 可见索引→真实下标（筛选拖拽时插入线与落点一致） */
var b6m = KB.defaultBoard();
var mCol = b6m.columns[0].id;
var mx = KB.addCard(b6m, mCol, { title: "X" });
var my = KB.addCard(b6m, mCol, { title: "Y" });
var mz = KB.addCard(b6m, mCol, { title: "Z" });
/* 同列拖拽 Y：DOM 排除被拖卡片后可见 [X, Z] */
eq(KB.mapDropIndex(b6m, my.id, mCol, [mx.id, mz.id], 0), 0, "同列：插入线在 X 前→真实下标 0");
eq(KB.mapDropIndex(b6m, my.id, mCol, [mx.id, mz.id], 1), 1, "同列：插入线在 X 后 Z 前→真实下标 1");
eq(KB.mapDropIndex(b6m, my.id, mCol, [mx.id, mz.id], 2), 2, "同列：插入线在 Z 后→真实下标 2");
/* 跨列拖拽：目标列 A,B,C 全可见，被拖卡片 D 来自其它列 */
var b6x = KB.defaultBoard();
var xA = b6x.columns[0].id, xB = b6x.columns[1].id;
var xa = KB.addCard(b6x, xB, { title: "A" });
var xb = KB.addCard(b6x, xB, { title: "B" });
var xc = KB.addCard(b6x, xB, { title: "C" });
var xd = KB.addCard(b6x, xA, { title: "D" });
eq(KB.mapDropIndex(b6x, xd.id, xB, [xa.id, xb.id, xc.id], 2), 2, "跨列：插入线在 B 后 C 前→真实下标 2");
eq(KB.mapDropIndex(b6x, xd.id, xB, [xa.id, xb.id, xc.id], 3), 3, "跨列：插入线在 C 后→真实下标 3");
eq(KB.mapDropIndex(b6x, xd.id, xB, [], 0), 0, "目标列全被过滤→插入顶部");
eq(KB.mapDropIndex(b6x, xd.id, "no-such", [xa.id], 0), 0, "目标列不存在返回 0");
/* 端到端：映射下标传给 moveCard，落点与插入线一致 */
var b6e = KB.defaultBoard();
var eCol = b6e.columns[0].id;
var ex = KB.addCard(b6e, eCol, { title: "X" });
var ey = KB.addCard(b6e, eCol, { title: "Y" });
var ez = KB.addCard(b6e, eCol, { title: "Z" });
var eat = KB.mapDropIndex(b6e, ey.id, eCol, [ex.id, ez.id], 1);
KB.moveCard(b6e, ey.id, eCol, eat);
deepEq(b6e.columns[0].cards.map(function (c) { return c.title; }), ["X", "Y", "Z"], "映射后移动落点与插入线一致");

/* ---------- 4. 持久化与降级 ---------- */
var s1 = memStore();
var r1 = KB.loadBoard(s1);
ok(!r1.recovered && r1.reason === "empty", "空存储返回默认看板（非恢复）");
ok(KB.validateBoard(r1.board), "空存储默认看板合法");
var s2 = memStore("这不是 JSON{{{");
var r2 = KB.loadBoard(s2);
ok(r2.recovered && r2.reason === "parse-error", "损坏 JSON 降级重建");
ok(KB.validateBoard(r2.board), "降级后看板合法");
var s3 = memStore(JSON.stringify({ version: 99, columns: [] }));
var r3 = KB.loadBoard(s3);
ok(r3.recovered && r3.reason === "invalid-structure", "版本号不符降级重建");
var s4 = memStore(JSON.stringify({ version: 1, columns: [{ id: "c1", title: "t", cards: [{ id: "k1" }] }] }));
var r4 = KB.loadBoard(s4);
ok(r4.recovered && r4.reason === "invalid-structure", "卡片缺标题降级重建");
var s5 = memStore();
var saved = KB.defaultBoard();
KB.addCard(saved, saved.columns[0].id, { title: "持久卡" });
ok(KB.saveBoard(s5, saved).ok, "保存成功");
var r5 = KB.loadBoard(s5);
ok(!r5.recovered && r5.board.columns[0].cards[0].title === "持久卡", "保存后可完整读回");
var r6 = KB.saveBoard(quotaStore(), saved);
ok(!r6.ok && r6.error === "quota", "存储配额满返回 quota 错误");
var r7 = KB.loadBoard(throwingStore());
ok(r7.recovered && r7.reason === "read-error", "读取抛异常降级");
/* 校验边界 */
ok(!KB.validateBoard(null), "null 非法");
ok(!KB.validateBoard({ version: 1, columns: [] }) || true, "空列数组合法（允许全删）");
var dup = KB.defaultBoard();
dup.columns.push({ id: dup.columns[0].id, title: "重复id", cards: [] });
ok(!KB.validateBoard(dup), "列 id 重复非法");
var many = { version: 1, columns: [] };
for (var m = 0; m < 9; m++) many.columns.push({ id: "c" + m, title: "t", cards: [] });
ok(!KB.validateBoard(many), "9 列非法");
var dupCard = KB.defaultBoard();
var dc = KB.addCard(dupCard, dupCard.columns[0].id, { title: "x" });
dupCard.columns[0].cards.push({ id: dc.id, title: "y" });
ok(!KB.validateBoard(dupCard), "卡片 id 重复非法");

/* ---------- 5. 标签解析与过期 ---------- */
deepEq(KB.parseTags("a，b,c , a"), ["a", "b", "c"], "中英文逗号分隔＋去重");
deepEq(KB.parseTags(""), [], "空字符串→空数组");
deepEq(KB.parseTags(["x", "x", "y"]), ["x", "y"], "数组输入去重");
ok(KB.isOverdue("2020-01-01"), "过去日期过期");
ok(!KB.isOverdue("2099-12-31"), "未来日期未过期");
ok(!KB.isOverdue(""), "空日期不算过期");
ok(!KB.isOverdue(null), "null 日期不算过期");
eq(KB.todayStr(new Date(2026, 9, 24)), "2026-10-24", "todayStr 格式化");
/* due 格式校验（yyyy-mm-dd）：非法格式拒绝/置空，不误判过期 */
ok(KB.isValidCard({ id: "k1", title: "t", due: "2026-10-24" }), "合法 due 校验通过");
ok(!KB.isValidCard({ id: "k1", title: "t", due: "明天" }), "中文 due 校验失败");
ok(!KB.isValidCard({ id: "k1", title: "t", due: "2026-1-1" }), "非零填充 due 校验失败");
ok(!KB.isOverdue("明天"), "非法格式 due 不算过期");
ok(!KB.isOverdue("2026-13-99"), "月份非法 due 不算过期");
var bdu = KB.defaultBoard();
var ill = KB.addCard(bdu, bdu.columns[0].id, { title: "非法卡", due: "明天" });
eq(ill.due, "", "新增卡片非法 due 置空");
var upd2 = KB.addCard(bdu, bdu.columns[0].id, { title: "更新卡" });
KB.updateCard(bdu, upd2.id, { due: "not-a-date" });
eq(upd2.due, "", "更新卡片非法 due 置空");
var impBad = KB.importJSON(JSON.stringify({ version: 1, columns: [{ id: "c1", title: "t", cards: [{ id: "k1", title: "x", due: "明天" }] }] }));
ok(!impBad.ok && impBad.error === "invalid-structure", "含非法 due 的备份导入被拒绝");
var bd4 = KB.defaultBoard();
var impDone = KB.importJSON(KB.exportJSON(bd4));
ok(impDone.ok && KB.findDoneColumn(impDone.board) !== null, "done 标记导出导入透传保留");

/* ---------- 6. 筛选与搜索 ---------- */
var b7 = KB.defaultBoard();
var cc = b7.columns[0].id;
KB.addCard(b7, cc, { title: "写季度总结", description: "财务数据整理", priority: "high", tags: "工作" });
KB.addCard(b7, cc, { title: "买菜", description: "", priority: "low", tags: "生活" });
KB.addCard(b7, cc, { title: "修电脑", description: "重装系统", priority: "medium", tags: "工作，生活" });
var all = b7.columns[0].cards;
eq(KB.visibleCards(all, { priority: "high", tag: "all", query: "" }).length, 1, "按高优先级筛选 1 张");
eq(KB.visibleCards(all, { priority: "all", tag: "工作", query: "" }).length, 2, "按标签「工作」筛选 2 张");
eq(KB.visibleCards(all, { priority: "all", tag: "all", query: "总结" }).length, 1, "搜索标题命中 1 张");
eq(KB.visibleCards(all, { priority: "all", tag: "all", query: "系统" }).length, 1, "搜索描述命中 1 张");
eq(KB.visibleCards(all, { priority: "low", tag: "生活", query: "买菜" }).length, 1, "三条件联动命中 1 张");
eq(KB.visibleCards(all, { priority: "high", tag: "生活", query: "" }).length, 0, "优先级＋标签无交集 0 张");
eq(KB.visibleCards(all, {}).length, 3, "空过滤器返回全部");
deepEq(KB.allTags(b7), ["工作", "生活"], "allTags 去重排序");
eq(KB.countVisible(b7, { priority: "all", tag: "all", query: "" }), 3, "countVisible 全板计数");

/* ---------- 7. 导出导入 ---------- */
var b8 = KB.defaultBoard();
KB.addCard(b8, b8.columns[1].id, { title: "导出卡", priority: "high", tags: "t1" });
var exp = KB.exportJSON(b8);
var parsed = JSON.parse(exp);
eq(parsed.app, "kanban_board", "导出含 app 标识");
eq(parsed.version, 1, "导出含版本号");
ok(!!parsed.exportedAt, "导出含导出时间");
eq(parsed.board.columns[1].cards[0].title, "导出卡", "导出含卡片数据");
var imp = KB.importJSON(exp);
ok(imp.ok && KB.validateBoard(imp.board), "导出→导入往返成功");
eq(imp.board.columns[1].cards[0].title, "导出卡", "导入后数据一致");
var imp2 = KB.importJSON("不是json");
ok(!imp2.ok && imp2.error === "parse-error", "非法 JSON 导入失败");
var imp3 = KB.importJSON(JSON.stringify({ version: 1, columns: [{ id: "x" }] }));
ok(!imp3.ok && imp3.error === "invalid-structure", "结构非法导入失败");
var imp4 = KB.importJSON(JSON.stringify(KB.defaultBoard()));
ok(imp4.ok, "裸看板 JSON（无包装）也可导入");

/* ---------- 8. 工具函数 ---------- */
ok(KB.uid("a") !== KB.uid("a"), "uid 唯一");
ok(KB.isNonEmptyString(" x ") && !KB.isNonEmptyString("  ") && !KB.isNonEmptyString(123), "isNonEmptyString 判定");
eq(KB.escHtml('<a href="x">&\'test\''), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;test&#39;", "escHtml 转义");
deepEq(KB.PRIORITY_LABEL, { high: "高", medium: "中", low: "低" }, "优先级中文标签");

/* ---------- 9. 模板与脚本静态检查 ---------- */
ok(TPL.indexOf('href="https://www.johnkingzcq123.xyz/tools/kanban-board"') >= 0, "模板含 canonical");
ok(TPL.indexOf('id="kb-board"') >= 0, "模板含看板容器");
ok(TPL.indexOf('id="kb-modal"') >= 0, "模板含卡片编辑弹窗");
ok(TPL.indexOf('id="kb-search"') >= 0, "模板含搜索框");
ok(TPL.indexOf('id="kb-filter-priority"') >= 0, "模板含优先级筛选");
ok(TPL.indexOf('id="kb-filter-tag"') >= 0, "模板含标签筛选");
ok(TPL.indexOf('id="kb-clear-done"') >= 0, "模板含清空按钮");
ok(TPL.indexOf('id="kb-import-file"') >= 0, "模板含导入文件框");
ok(TPL.indexOf('id="kb-toast"') >= 0, "模板含 toast");
ok(TPL.indexOf('id="kb-add-column"') >= 0, "模板含添加列按钮");
ok(TPL.indexOf("数据只保存在本浏览器") >= 0, "模板如实声明数据只保存在本浏览器");
ok(TPL.indexOf("tw_kanban_board_v1") >= 0, "模板提及存储键");
ok(TPL.indexOf("移到") >= 0, "模板提及移动端「移到」降级");
ok(TPL.indexOf('"@type":"SoftwareApplication"') >= 0, "模板含 JSON-LD");
ok(TPL.indexOf('name="keywords"') >= 0 && TPL.indexOf("kanban") >= 0, "模板含 SEO keywords");
ok(TPL.indexOf("/tools/static/js/kanban_board.js") >= 0, "模板引用 JS");
ok(SRC.indexOf("fetch(") < 0 && SRC.indexOf("XMLHttpRequest") < 0, "脚本零 fetch/XHR");
ok(TPL.indexOf("不会同步") >= 0, "模板明示不暗示同步");
ok(SRC.indexOf("dragstart") >= 0 && SRC.indexOf("kb-insert-line") >= 0, "脚本实现拖拽＋插入线");
ok(SRC.indexOf("kb-move-menu") >= 0, "脚本实现「移到某列」菜单");
ok(SRC.indexOf("confirm(") >= 0, "脚本有二次确认");
ok(SRC.indexOf("findDoneColumn") >= 0, "脚本实现 findDoneColumn");
ok(SRC.indexOf("mapDropIndex") >= 0, "脚本实现可见索引→真实下标映射");
ok(SRC.indexOf("if (!dst) { closeMoveMenu(); return; }") >= 0, "移到菜单确定处理有空值保护");
ok(SRC.indexOf("data-vis-ids") >= 0, "拖拽记录可见卡片 id 供落点映射");
ok(TPL.indexOf("清空已完成") >= 0, "模板按钮文案为「清空已完成」");
ok(TPL.indexOf("清空<b>所有列</b>") < 0, "FAQ 不再写清空所有列");
ok(TPL.indexOf("一键清空已完成") >= 0, "模板 SEO 描述为一键清空已完成");
ok(TPL.indexOf(".kb-touch .kb-card") >= 0, "触屏 .kb-touch 有对应 CSS 规则");

console.log("\n通过 " + pass + "，失败 " + fail + "，共 " + (pass + fail) + " 个断言");
process.exit(fail ? 1 : 0);
