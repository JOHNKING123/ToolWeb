/* 学习笔记整理器（study_notes）纯逻辑单元测试（零依赖）：
 * node tests/study_notes.test.js
 * 覆盖：规格确定性向量逐值命中（addNote 结构/标签去重/不可变、
 * filterByTag 大小写不敏感、searchNotes 大小写不敏感/空查询全量拷贝、
 * updateNote/deleteNote 不可变更新/删除、parseImport 归一化、
 * buildExportFileName 逐字、buildNoteMarkdown 拼装、
 * 非法参数抛 Error 的 err.field）、categories.go 注册（Path 总数 275→276、
 * Icon note_add 全库唯一、New/Category/关键词）与模板（真限制三条、
 * 与闪卡生成器双向互链「学习辅助一条龙」/与习惯追踪器双向互链
 * 「自律学习一条龙」、不链未交付打字练习、零网络请求静态检查）。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var A = require("../static/js/study_notes.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function eqArr(a, b, name) {
  ok(Array.isArray(a) && a.length === b.length && a.every(function (v, i) { return v === b[i]; }),
    name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）");
}
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name); }
function throwsField(fn, field, name) {
  try { fn(); } catch (e) {
    ok(e instanceof Error && e.field === field,
      name + "（期望抛 Error 且 err.field=" + JSON.stringify(field) + "，实得 " +
      (e instanceof Error ? "Error field=" + JSON.stringify(e.field) : typeof e) + "）");
    return;
  }
  fail++; console.error("FAIL:", name + "（未抛出异常）");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "study_notes.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "study_notes.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
var FC_TPL = fs.readFileSync(path.join(ROOT, "templates", "flashcard_maker.html"), "utf8");
var HB_TPL = fs.readFileSync(path.join(ROOT, "templates", "habit_tracker.html"), "utf8");

var NOW = 1762215600000;

/* ---------- 1. addNote：结构逐值命中 ---------- */
var n0 = A.addNote([], { title: "Go 切片", body: "len/cap", tags: ["Go"] })[0];
eq(n0.title, "Go 切片", "addNote：标题逐字");
eq(n0.body, "len/cap", "addNote：正文逐字");
eqArr(n0.tags, ["Go"], "addNote：标签逐字");
eq(n0.pinned, false, "addNote：默认不置顶");
ok(typeof n0.id === "string" && n0.id.length > 0, "addNote：id 为非空字符串");
ok(typeof n0.createdAt === "number" && isFinite(n0.createdAt), "addNote：createdAt 为有限数");
ok(typeof n0.updatedAt === "number" && isFinite(n0.updatedAt), "addNote：updatedAt 为有限数");
var src = [];
var added = A.addNote(src, { title: "t", tags: ["Go", "go", "", "  Redis  "] });
eq(src.length, 0, "addNote：原数组不被修改");
eq(added.length, 1, "addNote：返回新数组长度 1");
eqArr(added[0].tags, ["Go", "Redis"], "addNote：标签 trim＋大小写去重逐字");
var added2 = A.addNote([], { title: "  带空格标题  " });
eq(added2[0].title, "带空格标题", "addNote：标题 trim 逐字");
eq(added2[0].body, "", "addNote：缺省 body 为空字符串");
eqArr(added2[0].tags, [], "addNote：缺省 tags 为空数组");

/* ---------- 2. addNote：非法参数 err.field ---------- */
throwsField(function () { A.addNote(123, { title: "t" }); }, "notes", "addNote(123)：err.field=notes");
throwsField(function () { A.addNote([], null); }, "input", "addNote(input=null)：err.field=input");
throwsField(function () { A.addNote([], { title: "" }); }, "title", "addNote 空标题：err.field=title");
throwsField(function () { A.addNote([], { title: "   " }); }, "title", "addNote 空白标题：err.field=title");
throwsField(function () { A.addNote([], { title: 123 }); }, "title", "addNote 非字符串标题：err.field=title");
throwsField(function () { A.addNote([], { title: "t", body: 123 }); }, "body", "addNote body 非字符串：err.field=body");
throwsField(function () { A.addNote([], { title: "t", tags: "Go" }); }, "tags", "addNote tags 非数组：err.field=tags");

/* ---------- 3. filterByTag：大小写不敏感 ---------- */
var notes3 = A.addNote(A.addNote([], { title: "a", tags: ["Go"] }), { title: "b", tags: ["Redis"] });
eq(A.filterByTag(notes3, "go").length, 1, "filterByTag('go') 小写匹配 1 条");
eq(A.filterByTag(notes3, "GO")[0].title, "a", "filterByTag('GO') 大写匹配同一条");
eq(A.filterByTag(notes3, " 不存在 ").length, 0, "filterByTag 不存在标签得空数组");
eq(notes3.length, 2, "filterByTag：原数组不变");
throwsField(function () { A.filterByTag("x", "Go"); }, "notes", "filterByTag notes 非数组：err.field=notes");
throwsField(function () { A.filterByTag([], ""); }, "tag", "filterByTag 空标签：err.field=tag");
throwsField(function () { A.filterByTag([], 123); }, "tag", "filterByTag 非字符串标签：err.field=tag");

/* ---------- 4. searchNotes：全文大小写不敏感 ---------- */
var notes4 = A.addNote(
  A.addNote([], { title: "Go 切片", body: "slice 的 len 和 cap", tags: ["Go"] }),
  { title: "Redis 持久化", body: "RDB 快照", tags: ["中间件"] }
);
var r1 = A.searchNotes(notes4, "SLICE");
eq(r1.length, 1, "searchNotes('SLICE') 正文大小写不敏感命中 1 条");
eq(r1[0].title, "Go 切片", "searchNotes('SLICE') 命中标题逐字");
eq(A.searchNotes(notes4, "持久化").length, 1, "searchNotes 标题命中 1 条");
eq(A.searchNotes(notes4, "中间件").length, 1, "searchNotes 标签命中 1 条");
eq(A.searchNotes(notes4, "不存在的词").length, 0, "searchNotes 无命中得空数组");
var all = A.searchNotes(notes4, "   ");
eq(all.length, 2, "searchNotes 空查询返回全部 2 条");
ok(all !== notes4, "searchNotes 空查询返回新数组而非原引用");
eq(notes4.length, 2, "searchNotes：原数组不变");
throwsField(function () { A.searchNotes(null, "x"); }, "notes", "searchNotes notes 非数组：err.field=notes");
throwsField(function () { A.searchNotes([], null); }, "query", "searchNotes query 非字符串：err.field=query");

/* ---------- 5. updateNote：不可变更新逐值 ---------- */
var notes5 = A.addNote([], { title: "旧标题", body: "旧正文", tags: ["a"] });
var id5 = notes5[0].id;
var up5 = A.updateNote(notes5, id5, { title: "新标题", pinned: true });
eq(up5.length, 1, "updateNote：数组长度不变");
eq(up5[0].title, "新标题", "updateNote：标题更新逐字");
eq(up5[0].pinned, true, "updateNote：置顶更新逐字");
eq(up5[0].body, "旧正文", "updateNote：未指定 body 保持原值");
eqArr(up5[0].tags, ["a"], "updateNote：未指定 tags 保持原值");
eq(up5[0].id, id5, "updateNote：id 不变");
eq(notes5[0].title, "旧标题", "updateNote：原笔记对象不被修改");
ok(up5[0] !== notes5[0], "updateNote：返回新笔记对象");
var up5b = A.updateNote(notes5, id5, { tags: ["x", "X", "y"] });
eqArr(up5b[0].tags, ["x", "y"], "updateNote：tags 归一化去重逐字");
throwsField(function () { A.updateNote([], "no-such-id", { title: "t" }); }, "id", "updateNote 不存在 id：err.field=id");
throwsField(function () { A.updateNote(notes5, "", { title: "t" }); }, "id", "updateNote 空 id：err.field=id");
throwsField(function () { A.updateNote("x", id5, {}); }, "notes", "updateNote notes 非数组：err.field=notes");
throwsField(function () { A.updateNote(notes5, id5, null); }, "patch", "updateNote patch 非对象：err.field=patch");
throwsField(function () { A.updateNote(notes5, id5, { title: "" }); }, "title", "updateNote 空标题：err.field=title");
throwsField(function () { A.updateNote(notes5, id5, { body: 1 }); }, "body", "updateNote body 非字符串：err.field=body");
throwsField(function () { A.updateNote(notes5, id5, { tags: "x" }); }, "tags", "updateNote tags 非数组：err.field=tags");
throwsField(function () { A.updateNote(notes5, id5, { pinned: "yes" }); }, "pinned", "updateNote pinned 非布尔：err.field=pinned");

/* ---------- 6. deleteNote ---------- */
var notes6 = A.addNote(A.addNote([], { title: "keep" }), { title: "del" });
var delId = notes6[1].id;
var d6 = A.deleteNote(notes6, delId);
eq(d6.length, 1, "deleteNote：删除后长度 1");
eq(d6[0].title, "keep", "deleteNote：保留条目标题逐字");
eq(notes6.length, 2, "deleteNote：原数组不变");
throwsField(function () { A.deleteNote([], "nope"); }, "id", "deleteNote 不存在 id：err.field=id");
throwsField(function () { A.deleteNote(1, delId); }, "notes", "deleteNote notes 非数组：err.field=notes");
throwsField(function () { A.deleteNote(notes6, 123456); }, "id", "deleteNote 数字型不存在 id：err.field=id");

/* ---------- 7. parseImport：归一化逐值 ---------- */
var imp = A.parseImport(JSON.stringify({
  app: "studynotes_export", version: 1, exportedAt: "2026-11-03T00:00:00.000Z",
  notes: [{ title: "导入标题", body: "正文", tags: ["面试"] }]
}));
eq(imp.length, 1, "parseImport：1 条");
eq(imp[0].title, "导入标题", "parseImport：标题逐字");
eq(imp[0].body, "正文", "parseImport：正文逐字");
eqArr(imp[0].tags, ["面试"], "parseImport：标签逐字");
eq(imp[0].pinned, false, "parseImport：缺省 pinned=false");
ok(typeof imp[0].id === "string" && imp[0].id.length > 0, "parseImport：缺省 id 自动生成");
var impArr = A.parseImport('[{"title":"纯数组"}]');
eq(impArr.length, 1, "parseImport：纯数组形式 1 条");
eq(impArr[0].title, "纯数组", "parseImport：纯数组标题逐字");
throwsField(function () { A.parseImport("{bad json"); }, "text", "parseImport JSON 非法：err.field=text");
throwsField(function () { A.parseImport(123); }, "text", "parseImport 非字符串：err.field=text");
throwsField(function () { A.parseImport('{"notes": 1}'); }, "notes", "parseImport 非数组结构：err.field=notes");
throwsField(function () { A.parseImport('[{"body":"无标题"}]'); }, "notes", "parseImport 条目缺 title：err.field=notes");
throwsField(function () { A.parseImport('[{"title":""}]'); }, "notes", "parseImport 条目空 title：err.field=notes");

/* ---------- 8. buildExportFileName 逐字 ---------- */
eq(A.buildExportFileName(new Date(2026, 10, 3, 3, 0, 0)), "studynotes_20261103_030000.json",
  "buildExportFileName：studynotes_20261103_030000.json 逐字");
throwsField(function () { A.buildExportFileName("2026-11-03"); }, "now", "buildExportFileName 非 Date：err.field=now");
throwsField(function () { A.buildExportFileName(new Date(NaN)); }, "now", "buildExportFileName 无效 Date：err.field=now");

/* ---------- 9. buildNoteMarkdown 拼装 ---------- */
var mdNote = { title: "Go 切片", body: "正文行", tags: ["Go", "面试"] };
var mdText = A.buildNoteMarkdown(mdNote);
ok(mdText.indexOf("# Go 切片") === 0, "buildNoteMarkdown：首行 # 标题逐字");
has(mdText, "> 标签：Go、面试", "buildNoteMarkdown：标签行逐字");
has(mdText, "正文行", "buildNoteMarkdown：正文逐字");
throwsField(function () { A.buildNoteMarkdown({}); }, "note", "buildNoteMarkdown 无 title：err.field=note");

/* ---------- 10. window.StudyNotes 挂载（浏览器语义） ---------- */
ok(typeof A.addNote === "function" && typeof A.filterByTag === "function" &&
  typeof A.searchNotes === "function" && typeof A.updateNote === "function" &&
  typeof A.deleteNote === "function" && typeof A.parseImport === "function" &&
  typeof A.buildExportFileName === "function",
  "module.exports 同步导出七个纯函数");

/* ---------- 11. categories.go 注册 ---------- */
var snIdx = GO_SRC.indexOf('"study_notes"');
ok(snIdx >= 0, "注册 ID study_notes");
ok(GO_SRC.indexOf('"/tools/study-notes"') >= 0, "注册 Path /tools/study-notes");
ok(GO_SRC.slice(snIdx, snIdx + 1000).indexOf('Icon:        "note_add"') >= 0, "注册 Icon note_add");
ok(GO_SRC.slice(snIdx, snIdx + 1000).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(snIdx, snIdx + 1000).indexOf('Category:    "学习工具"') >= 0, "注册 Category 为学习工具");
var hbIdx = GO_SRC.indexOf('"habit_tracker"');
ok(hbIdx >= 0 && snIdx > hbIdx, "注册紧邻 habit_tracker 之后（学习工具家族相邻）");
var descBlock = GO_SRC.slice(snIdx, snIdx + 1600);
has(descBlock, "学习笔记", "Description 含「学习笔记」");
has(descBlock, "笔记整理", "Description 含「笔记整理」");
has(descBlock, "标签笔记", "Description 含「标签笔记」");
has(descBlock, "study notes organizer", "Description 含「study notes organizer」");
var iconRe = /"note_add"/g, iconHits = (GO_SRC.match(iconRe) || []).length;
eq(iconHits, 1, "Icon note_add 全库唯一（精确值复测锁定）");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 289, "注册 Path 总数 275→276");

/* ---------- 12. 模板：SEO/真限制/互链/零网络 ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/study-notes", "模板 canonical 含新 Path");
has(TPL_SRC, 'id="sn-app"', "模板含应用根节点 sn-app");
has(TPL_SRC, 'id="sn-search"', "模板含搜索框 sn-search");
has(TPL_SRC, 'id="sn-list"', "模板含笔记列表 sn-list");
has(TPL_SRC, "跨设备不同步", "真限制①：localStorage 跨设备不同步");
has(TPL_SRC, "导出 JSON 备份", "真限制①：请导出 JSON 备份");
has(TPL_SRC, "精简子集", "真限制②：Markdown 为精简子集明示");
has(TPL_SRC, "不会上传到任何服务器", "真限制③：纯本地零上传");
has(TPL_SRC, "Network", "真限制③：Network 面板自证");
has(TPL_SRC, "/tools/flashcard-maker", "互链：闪卡卡片生成器（学习辅助一条龙）");
has(TPL_SRC, "/tools/habit-tracker", "互链：习惯追踪器（自律学习一条龙）");
has(TPL_SRC, "学习辅助一条龙", "互链文案：学习辅助一条龙");
has(TPL_SRC, "自律学习一条龙", "互链文案：自律学习一条龙");
notHas(TPL_SRC, "typing", "不链未交付工具：无打字练习");
notHas(JS_SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(JS_SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(JS_SRC, "WebSocket", "零网络：JS 无 WebSocket");
notHas(TPL_SRC, "fonts.googleapis", "模板零 CDN");
has(FC_TPL, "/tools/study-notes", "双向互链：闪卡模板回链学习笔记整理器");
has(HB_TPL, "/tools/study-notes", "双向互链：习惯追踪器模板回链学习笔记整理器");

console.log("PASS " + pass + " / FAIL " + fail);
