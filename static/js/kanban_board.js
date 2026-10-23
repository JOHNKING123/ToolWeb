/* 本地看板任务管理（kanban_board）纯前端核心逻辑
 * 纯函数经 module.exports 暴露，node tests/kanban_board.test.js 自测；
 * 浏览器端：window.KanbanBoard 全局 + DOM 装配（本文件末尾）。
 *
 * 设计说明（规格见 BACKLOG 2026-10-24 03:40 排期条目）：
 * - 数据模型：{version:1, columns:[{id,title,done?,cards:[{id,title,description,priority,due,tags:[],createdAt}]}]}
 *   localStorage key = tw_kanban_board_v1，版本化；损坏降级重建。
 *   默认「已完成」列带 done:true 标记（重命名/调序不影响），「一键清空已完成」只清该列。
 * - 列：默认 待办/进行中/已完成；重命名＋增删（上限 8 列），左右箭头调序。
 * - 卡片：标题（必填）＋描述＋优先级（高/中/低三色）＋截止日期（过期标红）＋标签。
 * - 拖拽：桌面端 HTML5 DnD 跨列移动＋列内指定位置插入（插入线指示）；
 *   移动端（触屏无 DnD）用卡片「移到某列」菜单降级（选目标列＋顶部/底部）。
 * - 筛选：优先级＋标签筛选、标题/描述全文搜索；一键清空已完成列（二次确认）。
 * - 导出/导入 JSON 本地备份；脚本零 fetch/XHR、零上传。
 */
(function () {
"use strict";

/* ================= 0. 常量 ================= */

var STORAGE_KEY = "tw_kanban_board_v1";
var STORE_VERSION = 1;
var MAX_COLUMNS = 8;
var PRIORITIES = ["high", "medium", "low"];
var PRIORITY_LABEL = { high: "高", medium: "中", low: "低" };

/* ================= 1. 工具函数 ================= */

var __uidCounter = 0;
function uid(prefix) {
    __uidCounter++;
    return (prefix || "id") + "_" + Date.now().toString(36) + "_" + (__uidCounter).toString(36) +
        Math.floor(Math.random() * 46656).toString(36);
}

function isNonEmptyString(v) {
    return typeof v === "string" && v.trim().length > 0;
}

function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
    });
}

/* 今天日期（yyyy-mm-dd 本地），用于过期判断 */
function todayStr(now) {
    var d = now instanceof Date ? now : new Date();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    return d.getFullYear() + "-" + (m.length < 2 ? "0" + m : m) + "-" + (day.length < 2 ? "0" + day : day);
}

/* 截止日期是否过期：空或非法格式不算过期 */
var DUE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isOverdue(due, now) {
    if (!isNonEmptyString(due)) return false;
    var t = due.trim();
    if (!DUE_RE.test(t)) return false;
    return t < todayStr(now);
}

/* 标签输入 → 去重数组 */
function parseTags(input) {
    if (Array.isArray(input)) {
        return input.filter(isNonEmptyString).map(function (t) { return t.trim(); })
            .filter(function (t, i, arr) { return arr.indexOf(t) === i; });
    }
    if (!isNonEmptyString(input)) return [];
    return input.split(/[,\uFF0C]/).map(function (t) { return t.trim(); })
        .filter(isNonEmptyString)
        .filter(function (t, i, arr) { return arr.indexOf(t) === i; });
}

/* ================= 2. 看板工厂与校验 ================= */

function makeColumn(title) {
    return { id: uid("col"), title: title, cards: [] };
}

function makeCard(fields) {
    fields = fields || {};
    var d = isNonEmptyString(fields.due) ? fields.due.trim() : "";
    return {
        id: uid("card"),
        title: String(fields.title || "").trim(),
        description: String(fields.description || ""),
        priority: PRIORITIES.indexOf(fields.priority) >= 0 ? fields.priority : "medium",
        due: (d === "" || DUE_RE.test(d)) ? d : "",
        tags: parseTags(fields.tags),
        createdAt: new Date().toISOString()
    };
}

function defaultBoard() {
    return {
        version: STORE_VERSION,
        columns: [
            { id: uid("col"), title: "待办", cards: [] },
            { id: uid("col"), title: "进行中", cards: [] },
            { id: uid("col"), title: "已完成", done: true, cards: [] }
        ]
    };
}

function isValidCard(c) {
    if (!c || typeof c !== "object") return false;
    if (!isNonEmptyString(c.id) || !isNonEmptyString(c.title)) return false;
    if (c.priority && PRIORITIES.indexOf(c.priority) < 0) return false;
    if (c.due && !DUE_RE.test(c.due)) return false;
    if (c.tags && !Array.isArray(c.tags)) return false;
    return true;
}

function isValidColumn(c) {
    if (!c || typeof c !== "object") return false;
    if (!isNonEmptyString(c.id) || !isNonEmptyString(c.title)) return false;
    if (!Array.isArray(c.cards)) return false;
    for (var i = 0; i < c.cards.length; i++) {
        if (!isValidCard(c.cards[i])) return false;
    }
    return true;
}

/* 严格校验：版本号、列数组、每列每卡结构都合法才算可用 */
function validateBoard(data) {
    if (!data || typeof data !== "object") return false;
    if (data.version !== STORE_VERSION) return false;
    if (!Array.isArray(data.columns) || data.columns.length > MAX_COLUMNS) return false;
    var ids = {};
    for (var i = 0; i < data.columns.length; i++) {
        var c = data.columns[i];
        if (!isValidColumn(c)) return false;
        if (ids[c.id]) return false;
        ids[c.id] = true;
        var cardIds = {};
        for (var j = 0; j < c.cards.length; j++) {
            if (cardIds[c.cards[j].id]) return false;
            cardIds[c.cards[j].id] = true;
        }
    }
    return true;
}

/* ================= 3. 持久化 ================= */

function loadBoard(store) {
    var raw = null;
    try {
        raw = store.getItem(STORAGE_KEY);
    } catch (e) {
        return { board: defaultBoard(), recovered: true, reason: "read-error" };
    }
    if (raw == null || raw === "") {
        return { board: defaultBoard(), recovered: false, reason: "empty" };
    }
    var data = null;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        return { board: defaultBoard(), recovered: true, reason: "parse-error" };
    }
    if (!validateBoard(data)) {
        return { board: defaultBoard(), recovered: true, reason: "invalid-structure" };
    }
    return { board: data, recovered: false, reason: "ok" };
}

function saveBoard(store, board) {
    try {
        store.setItem(STORAGE_KEY, JSON.stringify(board));
        return { ok: true };
    } catch (e) {
        var msg = (e && e.name === "QuotaExceededError") ? "quota" : "write-error";
        return { ok: false, error: msg };
    }
}

/* ================= 4. 列操作 ================= */

/* 找到「已完成」列：优先 done:true 标记（重命名/调序不影响）；
 * 无标记时退化按标题「已完成」匹配；都没有返回 null。 */
function findDoneColumn(board) {
    var i;
    for (i = 0; i < board.columns.length; i++) {
        if (board.columns[i].done === true) return { column: board.columns[i], index: i };
    }
    for (i = 0; i < board.columns.length; i++) {
        if (board.columns[i].title === "已完成") return { column: board.columns[i], index: i };
    }
    return null;
}

function findColumn(board, colId) {
    for (var i = 0; i < board.columns.length; i++) {
        if (board.columns[i].id === colId) return { column: board.columns[i], index: i };
    }
    return null;
}

function findCard(board, cardId) {
    for (var i = 0; i < board.columns.length; i++) {
        var cards = board.columns[i].cards;
        for (var j = 0; j < cards.length; j++) {
            if (cards[j].id === cardId) {
                return { card: cards[j], column: board.columns[i], colIndex: i, cardIndex: j };
            }
        }
    }
    return null;
}

/* 新增列；达到上限返回 false */
function addColumn(board, title) {
    if (board.columns.length >= MAX_COLUMNS) return false;
    var t = isNonEmptyString(title) ? title.trim() : "新列";
    board.columns.push(makeColumn(t));
    return true;
}

function renameColumn(board, colId, title) {
    var f = findColumn(board, colId);
    if (!f || !isNonEmptyString(title)) return false;
    f.column.title = title.trim();
    return true;
}

function removeColumn(board, colId) {
    var f = findColumn(board, colId);
    if (!f) return false;
    board.columns.splice(f.index, 1);
    return true;
}

/* 列调序：dir = -1 左移 / +1 右移；到边界返回 false */
function moveColumn(board, colId, dir) {
    var f = findColumn(board, colId);
    if (!f) return false;
    var to = f.index + dir;
    if (to < 0 || to >= board.columns.length) return false;
    var cols = board.columns;
    var tmp = cols[f.index];
    cols[f.index] = cols[to];
    cols[to] = tmp;
    return true;
}

function clearColumn(board, colId) {
    var f = findColumn(board, colId);
    if (!f) return false;
    f.column.cards = [];
    return true;
}

/* ================= 5. 卡片操作 ================= */

function addCard(board, colId, fields) {
    var f = findColumn(board, colId);
    if (!f) return null;
    fields = fields || {};
    if (!isNonEmptyString(fields.title)) return null;
    var card = makeCard(fields);
    f.column.cards.push(card);
    return card;
}

function updateCard(board, cardId, fields) {
    var f = findCard(board, cardId);
    if (!f) return false;
    fields = fields || {};
    if (fields.title !== undefined) {
        if (!isNonEmptyString(fields.title)) return false;
        f.card.title = fields.title.trim();
    }
    if (fields.description !== undefined) f.card.description = String(fields.description);
    if (fields.priority !== undefined && PRIORITIES.indexOf(fields.priority) >= 0) {
        f.card.priority = fields.priority;
    }
    if (fields.due !== undefined) {
        var dd = isNonEmptyString(fields.due) ? fields.due.trim() : "";
        f.card.due = (dd === "" || DUE_RE.test(dd)) ? dd : "";
    }
    if (fields.tags !== undefined) f.card.tags = parseTags(fields.tags);
    return true;
}

function deleteCard(board, cardId) {
    var f = findCard(board, cardId);
    if (!f) return false;
    f.column.cards.splice(f.cardIndex, 1);
    return true;
}

/* 移动卡片：同列调序或跨列移动；index 越界自动钳制到列尾 */
function moveCard(board, cardId, targetColId, index) {
    var src = findCard(board, cardId);
    var dst = findColumn(board, targetColId);
    if (!src || !dst) return false;
    var card = src.card;
    src.column.cards.splice(src.cardIndex, 1);
    var list = dst.column.cards;
    var at = (typeof index === "number" && isFinite(index)) ? Math.floor(index) : list.length;
    if (at < 0) at = 0;
    if (at > list.length) at = list.length;
    list.splice(at, 0, card);
    return true;
}

/* ================= 6. 拖拽插入索引（纯函数） ================= */

/* midpoints：目标列各卡片垂直中点（从上到下，排除被拖卡片）；y：指针纵坐标。
 * 返回插入位置：首个中点大于 y 的下标，否则列尾。 */
function calcInsertIndex(midpoints, y) {
    for (var i = 0; i < midpoints.length; i++) {
        if (y < midpoints[i]) return i;
    }
    return midpoints.length;
}

/* 可见索引 → 真实下标：筛选时 DOM 只渲染可见卡片，dragover 按可见卡片算出的
 * visIdx 相对完整数组会错位。本函数把「排除被拖卡片的可见卡片 id 列表
 * （DOM 顺序）＋相对插入位置」映射回 moveCard 可用的真实下标：
 * 插入点在 visibleIds[visIdx] 之前（或 visIdx 越界时插到最后一张可见卡之后）。 */
function mapDropIndex(board, cardId, targetColId, visibleIds, visIdx) {
    var f = findColumn(board, targetColId);
    if (!f) return 0;
    var remaining = [];
    f.column.cards.forEach(function (c) { if (c.id !== cardId) remaining.push(c); });
    function realOf(id) {
        for (var i = 0; i < remaining.length; i++) {
            if (remaining[i].id === id) return i;
        }
        return -1;
    }
    visibleIds = visibleIds || [];
    if (visIdx >= visibleIds.length) {
        if (visibleIds.length === 0) return 0;
        var last = realOf(visibleIds[visibleIds.length - 1]);
        return last < 0 ? remaining.length : last + 1;
    }
    var at = realOf(visibleIds[visIdx]);
    return at < 0 ? remaining.length : at;
}

/* ================= 7. 筛选与搜索 ================= */

function allTags(board) {
    var seen = {};
    var out = [];
    board.columns.forEach(function (col) {
        col.cards.forEach(function (card) {
            (card.tags || []).forEach(function (t) {
                if (!seen[t]) { seen[t] = true; out.push(t); }
            });
        });
    });
    return out.sort();
}

/* filters: {priority:"all"|"high"|..., tag:"all"|标签, query:""}；三者与关系 */
function visibleCards(cards, filters) {
    filters = filters || {};
    var q = isNonEmptyString(filters.query) ? filters.query.trim().toLowerCase() : "";
    var pri = filters.priority || "all";
    var tag = filters.tag || "all";
    return cards.filter(function (card) {
        if (pri !== "all" && card.priority !== pri) return false;
        if (tag !== "all" && (card.tags || []).indexOf(tag) < 0) return false;
        if (q) {
            var hay = (card.title + "\n" + (card.description || "")).toLowerCase();
            if (hay.indexOf(q) < 0) return false;
        }
        return true;
    });
}

function countVisible(board, filters) {
    var n = 0;
    board.columns.forEach(function (col) {
        n += visibleCards(col.cards, filters).length;
    });
    return n;
}

/* ================= 8. 导出 / 导入 ================= */

function exportJSON(board) {
    return JSON.stringify({
        app: "kanban_board",
        version: STORE_VERSION,
        exportedAt: new Date().toISOString(),
        board: board
    }, null, 2);
}

/* 导入：解析＋校验；合法返回 {ok:true, board}，否则 {ok:false, error} */
function importJSON(text) {
    var data = null;
    try {
        data = JSON.parse(text);
    } catch (e) {
        return { ok: false, error: "parse-error" };
    }
    var board = data && data.board ? data.board : data;
    if (!validateBoard(board)) {
        return { ok: false, error: "invalid-structure" };
    }
    return { ok: true, board: board };
}

var api = {
    STORAGE_KEY: STORAGE_KEY, STORE_VERSION: STORE_VERSION, MAX_COLUMNS: MAX_COLUMNS,
    PRIORITIES: PRIORITIES, PRIORITY_LABEL: PRIORITY_LABEL,
    uid: uid, isNonEmptyString: isNonEmptyString, escHtml: escHtml,
    todayStr: todayStr, isOverdue: isOverdue, parseTags: parseTags,
    makeColumn: makeColumn, makeCard: makeCard, defaultBoard: defaultBoard,
    isValidCard: isValidCard, isValidColumn: isValidColumn, validateBoard: validateBoard,
    loadBoard: loadBoard, saveBoard: saveBoard,
    findColumn: findColumn, findCard: findCard, findDoneColumn: findDoneColumn,
    addColumn: addColumn, renameColumn: renameColumn, removeColumn: removeColumn,
    moveColumn: moveColumn, clearColumn: clearColumn,
    addCard: addCard, updateCard: updateCard, deleteCard: deleteCard, moveCard: moveCard,
    calcInsertIndex: calcInsertIndex, mapDropIndex: mapDropIndex,
    allTags: allTags, visibleCards: visibleCards, countVisible: countVisible,
    exportJSON: exportJSON, importJSON: importJSON
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
} else if (typeof window !== "undefined") {
    window.KanbanBoard = api;
}

/* ================= 9. 浏览器 DOM 装配 ================= */

if (typeof document !== "undefined" && typeof window !== "undefined") {
(function () {
var KB = (typeof window.KanbanBoard !== "undefined") ? window.KanbanBoard : api;
var $ = function (id) { return document.getElementById(id); };

var board = null;
var filters = { priority: "all", tag: "all", query: "" };
var editingCardId = null;
var dragCardId = null;
var insertLineEl = null;

function memStore() {
    var m = {};
    return {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
        setItem: function (k, v) { m[k] = String(v); }
    };
}

function storage() {
    try {
        if (typeof localStorage !== "undefined") return localStorage;
    } catch (e) {}
    return memStore();
}
var store = storage();

function persist() {
    var r = KB.saveBoard(store, board);
    if (!r.ok) {
        toast(r.error === "quota" ? "浏览器存储空间已满，本次修改未能保存，请导出备份后清理。" : "保存失败，本次修改未能写入本地存储。");
    }
}

var toastTimer = null;
function toast(msg) {
    var el = $("kb-toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "kb-toast kb-show";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = "kb-toast"; }, 3200);
}

function isTouchDevice() {
    return (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches) ||
        ("ontouchstart" in window);
}

/* ---------- 渲染 ---------- */

function priorityBadge(p) {
    return '<span class="kb-pri kb-pri-' + p + '">' + KB.PRIORITY_LABEL[p] + '</span>';
}

function cardHTML(card) {
    var overdue = KB.isOverdue(card.due);
    var dueHtml = card.due
        ? '<span class="kb-due' + (overdue ? ' kb-overdue' : '') + '"><i class="material-icons">event</i>' +
          KB.escHtml(card.due) + (overdue ? '（已过期）' : '') + '</span>'
        : '';
    var tagsHtml = (card.tags || []).map(function (t) {
        return '<span class="kb-tag">' + KB.escHtml(t) + '</span>';
    }).join('');
    var desc = card.description ? '<div class="kb-card-desc">' + KB.escHtml(card.description) + '</div>' : '';
    return '<article class="kb-card" draggable="true" data-card-id="' + card.id + '" tabindex="0">' +
        '<div class="kb-card-top"><h4 class="kb-card-title">' + KB.escHtml(card.title) + '</h4>' + priorityBadge(card.priority) + '</div>' +
        desc +
        '<div class="kb-card-meta">' + dueHtml + tagsHtml + '</div>' +
        '<div class="kb-card-actions">' +
            '<button type="button" class="kb-mini-btn" data-act="edit" title="编辑卡片"><i class="material-icons">edit</i>编辑</button>' +
            '<button type="button" class="kb-mini-btn" data-act="move" title="移到某列"><i class="material-icons">drive_file_move</i>移到</button>' +
            '<button type="button" class="kb-mini-btn kb-danger" data-act="del" title="删除卡片"><i class="material-icons">delete</i></button>' +
        '</div>' +
    '</article>';
}

function columnHTML(col) {
    var visible = KB.visibleCards(col.cards, filters);
    var cardsHtml = visible.map(cardHTML).join('');
    var emptyHint = visible.length === 0
        ? '<div class="kb-empty">暂无卡片，可拖入或点击下方添加</div>' : '';
    return '<section class="kb-column" data-col-id="' + col.id + '">' +
        '<header class="kb-col-head">' +
            '<h3 class="kb-col-title" title="双击重命名">' + KB.escHtml(col.title) + '</h3>' +
            '<span class="kb-col-count">' + col.cards.length + '</span>' +
            '<span class="kb-col-ops">' +
                '<button type="button" data-col-act="left" title="左移"><i class="material-icons">chevron_left</i></button>' +
                '<button type="button" data-col-act="right" title="右移"><i class="material-icons">chevron_right</i></button>' +
                '<button type="button" data-col-act="rename" title="重命名"><i class="material-icons">edit</i></button>' +
                '<button type="button" data-col-act="del" title="删除列"><i class="material-icons">delete</i></button>' +
            '</span>' +
        '</header>' +
        '<div class="kb-card-list" data-col-id="' + col.id + '">' + cardsHtml + emptyHint + '</div>' +
        '<button type="button" class="kb-add-card" data-add-card="' + col.id + '"><i class="material-icons">add</i> 添加卡片</button>' +
    '</section>';
}

function refreshTagFilter() {
    var sel = $("kb-filter-tag");
    if (!sel) return;
    var cur = sel.value || "all";
    var tags = KB.allTags(board);
    sel.innerHTML = '<option value="all">全部标签</option>' +
        tags.map(function (t) {
            return '<option value="' + KB.escHtml(t) + '"' + (t === cur ? ' selected' : '') + '>' + KB.escHtml(t) + '</option>';
        }).join('');
    if (tags.indexOf(cur) < 0) { filters.tag = "all"; sel.value = "all"; }
}

function render() {
    refreshTagFilter();
    var wrap = $("kb-board");
    if (!wrap) return;
    wrap.innerHTML = board.columns.map(columnHTML).join('') +
        (board.columns.length === 0 ? '<div class="kb-no-col">当前没有列，点击右上角「添加列」开始。</div>' : '');
    var total = 0;
    board.columns.forEach(function (c) { total += c.cards.length; });
    var stat = $("kb-stat");
    if (stat) stat.textContent = board.columns.length + " 列 · " + total + " 张卡片";
    wireBoardEvents();
    wireDnD();
}

/* ---------- 卡片编辑弹窗 ---------- */

function openCardModal(colId, cardId) {
    editingCardId = cardId || null;
    var m = $("kb-modal");
    var f = cardId ? KB.findCard(board, cardId) : null;
    $("kb-m-title").value = f ? f.card.title : "";
    $("kb-m-desc").value = f ? f.card.description : "";
    $("kb-m-priority").value = f ? f.card.priority : "medium";
    $("kb-m-due").value = f ? f.card.due : "";
    $("kb-m-tags").value = f ? (f.card.tags || []).join("，") : "";
    var colSel = $("kb-m-col");
    colSel.innerHTML = board.columns.map(function (c) {
        return '<option value="' + c.id + '">' + KB.escHtml(c.title) + '</option>';
    }).join('');
    colSel.value = colId || (f ? f.column.id : (board.columns[0] ? board.columns[0].id : ""));
    $("kb-modal-title").textContent = cardId ? "编辑卡片" : "新建卡片";
    m.style.display = "flex";
    setTimeout(function () { $("kb-m-title").focus(); }, 50);
}

function closeCardModal() {
    $("kb-modal").style.display = "none";
    editingCardId = null;
}

function saveCardModal() {
    var title = $("kb-m-title").value;
    if (!KB.isNonEmptyString(title)) {
        toast("标题不能为空");
        $("kb-m-title").focus();
        return;
    }
    var fields = {
        title: title,
        description: $("kb-m-desc").value,
        priority: $("kb-m-priority").value,
        due: $("kb-m-due").value,
        tags: $("kb-m-tags").value
    };
    if (editingCardId) {
        KB.updateCard(board, editingCardId, fields);
        toast("卡片已更新");
    } else {
        var colId = $("kb-m-col").value;
        var card = KB.addCard(board, colId, fields);
        if (!card) { toast("添加失败：目标列不存在"); return; }
        toast("卡片已添加");
    }
    persist();
    closeCardModal();
    render();
}

/* ---------- 移到某列（移动端降级） ---------- */

function openMoveMenu(cardId, anchorBtn) {
    closeMoveMenu();
    var f = KB.findCard(board, cardId);
    if (!f) return;
    var menu = document.createElement("div");
    menu.className = "kb-move-menu";
    menu.id = "kb-move-menu";
    var opts = board.columns.map(function (c) {
        var mark = c.id === f.column.id ? "（当前）" : "";
        return '<option value="' + c.id + '"' + (c.id === f.column.id ? " selected" : "") + '>' +
            KB.escHtml(c.title) + mark + '</option>';
    }).join('');
    menu.innerHTML =
        '<label>目标列：<select id="kb-move-col">' + opts + '</select></label>' +
        '<label>位置：<select id="kb-move-pos"><option value="top">顶部</option><option value="bottom" selected>底部</option></select></label>' +
        '<div class="kb-move-actions"><button type="button" id="kb-move-ok" class="kb-btn kb-btn-primary">确定</button>' +
        '<button type="button" id="kb-move-cancel" class="kb-btn">取消</button></div>';
    document.body.appendChild(menu);
    var r = anchorBtn.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.left = Math.max(8, Math.min(window.innerWidth - 240, r.left)) + "px";
    menu.style.top = Math.min(window.innerHeight - 200, r.bottom + 6) + "px";
    $("kb-move-ok").onclick = function () {
        var targetCol = $("kb-move-col").value;
        var pos = $("kb-move-pos").value;
        var dst = KB.findColumn(board, targetCol);
        if (!dst) { closeMoveMenu(); return; }
        var idx = pos === "top" ? 0 : dst.column.cards.length;
        KB.moveCard(board, cardId, targetCol, idx);
        persist();
        closeMoveMenu();
        render();
        toast("卡片已移动");
    };
    $("kb-move-cancel").onclick = closeMoveMenu;
    setTimeout(function () {
        document.addEventListener("click", moveMenuOutside, true);
    }, 0);
}

function moveMenuOutside(e) {
    var menu = $("kb-move-menu");
    if (menu && !menu.contains(e.target)) closeMoveMenu();
}

function closeMoveMenu() {
    var menu = $("kb-move-menu");
    if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
    document.removeEventListener("click", moveMenuOutside, true);
}

/* ---------- 事件装配 ---------- */

function wireBoardEvents() {
    var wrap = $("kb-board");
    if (!wrap) return;

    wrap.querySelectorAll(".kb-card").forEach(function (el) {
        var cardId = el.getAttribute("data-card-id");
        el.addEventListener("click", function (e) {
            var btn = e.target.closest("[data-act]");
            if (btn) {
                e.stopPropagation();
                var act = btn.getAttribute("data-act");
                if (act === "edit") {
                    var f = KB.findCard(board, cardId);
                    if (f) openCardModal(f.column.id, cardId);
                } else if (act === "del") {
                    if (confirm("确定删除这张卡片吗？")) {
                        KB.deleteCard(board, cardId);
                        persist();
                        render();
                        toast("卡片已删除");
                    }
                } else if (act === "move") {
                    openMoveMenu(cardId, btn);
                }
                return;
            }
            var ff = KB.findCard(board, cardId);
            if (ff) openCardModal(ff.column.id, cardId);
        });
        el.addEventListener("keydown", function (e) {
            if (e.key === "Enter" && !e.target.closest("[data-act]")) {
                var ff = KB.findCard(board, cardId);
                if (ff) openCardModal(ff.column.id, cardId);
            }
        });
    });

    wrap.querySelectorAll("[data-add-card]").forEach(function (btn) {
        btn.addEventListener("click", function () {
            openCardModal(btn.getAttribute("data-add-card"), null);
        });
    });

    wrap.querySelectorAll(".kb-column").forEach(function (colEl) {
        var colId = colEl.getAttribute("data-col-id");
        colEl.querySelectorAll("[data-col-act]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var act = btn.getAttribute("data-col-act");
                if (act === "left" || act === "right") {
                    if (KB.moveColumn(board, colId, act === "left" ? -1 : 1)) {
                        persist(); render();
                    } else {
                        toast(act === "left" ? "已经是最左边的列了" : "已经是最右边的列了");
                    }
                } else if (act === "rename") {
                    var f = KB.findColumn(board, colId);
                    var name = prompt("列重命名", f ? f.column.title : "");
                    if (name !== null && KB.renameColumn(board, colId, name)) {
                        persist(); render(); toast("列已重命名");
                    } else if (name !== null) {
                        toast("列名不能为空");
                    }
                } else if (act === "del") {
                    var ff = KB.findColumn(board, colId);
                    var n = ff ? ff.column.cards.length : 0;
                    if (confirm("确定删除列「" + (ff ? ff.column.title : "") + "」吗？" +
                        (n > 0 ? "该列有 " + n + " 张卡片，将一并删除。" : ""))) {
                        KB.removeColumn(board, colId);
                        persist(); render(); toast("列已删除");
                    }
                }
            });
        });
        var titleEl = colEl.querySelector(".kb-col-title");
        if (titleEl) {
            titleEl.addEventListener("dblclick", function () {
                var f = KB.findColumn(board, colId);
                var name = prompt("列重命名", f ? f.column.title : "");
                if (name !== null && KB.renameColumn(board, colId, name)) {
                    persist(); render(); toast("列已重命名");
                }
            });
        }
    });
}

/* ---------- HTML5 DnD（桌面端） ---------- */

function ensureInsertLine() {
    if (!insertLineEl) {
        insertLineEl = document.createElement("div");
        insertLineEl.className = "kb-insert-line";
    }
    return insertLineEl;
}

function clearInsertLine() {
    if (insertLineEl && insertLineEl.parentNode) {
        insertLineEl.parentNode.removeChild(insertLineEl);
    }
    document.querySelectorAll(".kb-card-list.kb-drop-target").forEach(function (el) {
        el.classList.remove("kb-drop-target");
    });
}

function wireDnD() {
    var wrap = $("kb-board");
    if (!wrap) return;

    wrap.querySelectorAll(".kb-card").forEach(function (el) {
        el.addEventListener("dragstart", function (e) {
            dragCardId = el.getAttribute("data-card-id");
            e.dataTransfer.effectAllowed = "move";
            try { e.dataTransfer.setData("text/plain", dragCardId); } catch (err) {}
            setTimeout(function () { el.classList.add("kb-dragging"); }, 0);
        });
        el.addEventListener("dragend", function () {
            el.classList.remove("kb-dragging");
            dragCardId = null;
            clearInsertLine();
        });
    });

    wrap.querySelectorAll(".kb-card-list").forEach(function (list) {
        var colId = list.getAttribute("data-col-id");

        list.addEventListener("dragover", function (e) {
            if (!dragCardId) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            list.classList.add("kb-drop-target");

            var mids = [];
            var others = [];
            list.querySelectorAll(".kb-card").forEach(function (c) {
                if (c.getAttribute("data-card-id") === dragCardId) return;
                var r = c.getBoundingClientRect();
                mids.push(r.top + r.height / 2);
                others.push(c);
            });
            var idx = KB.calcInsertIndex(mids, e.clientY);
            var line = ensureInsertLine();
            if (idx >= others.length) {
                list.appendChild(line);
            } else {
                list.insertBefore(line, others[idx]);
            }
            list.setAttribute("data-insert-idx", String(idx));
            list.setAttribute("data-vis-ids", JSON.stringify(others.map(function (c) {
                return c.getAttribute("data-card-id");
            })));
        });

        list.addEventListener("dragleave", function (e) {
            if (e.target === list) {
                list.classList.remove("kb-drop-target");
                clearInsertLine();
            }
        });

        list.addEventListener("drop", function (e) {
            e.preventDefault();
            var cardId = dragCardId;
            var idx = parseInt(list.getAttribute("data-insert-idx") || "-1", 10);
            var visIds = [];
            try { visIds = JSON.parse(list.getAttribute("data-vis-ids") || "[]"); } catch (err) {}
            clearInsertLine();
            if (!cardId) return;
            var dst = KB.findColumn(board, colId);
            if (!dst) { dragCardId = null; return; }
            /* 筛选时可见索引需映射回真实下标（否则插入线与落点错位） */
            var at = idx < 0 ? dst.column.cards.length : KB.mapDropIndex(board, cardId, colId, visIds, idx);
            if (KB.moveCard(board, cardId, colId, at)) {
                persist();
                render();
            }
            dragCardId = null;
        });
    });
}

/* ---------- 工具栏 ---------- */

function wireToolbar() {
    var q = $("kb-search");
    if (q) {
        var t = null;
        q.addEventListener("input", function () {
            clearTimeout(t);
            t = setTimeout(function () {
                filters.query = q.value;
                render();
            }, 200);
        });
    }
    var pri = $("kb-filter-priority");
    if (pri) {
        pri.addEventListener("change", function () {
            filters.priority = pri.value;
            render();
        });
    }
    var tag = $("kb-filter-tag");
    if (tag) {
        tag.addEventListener("change", function () {
            filters.tag = tag.value;
            render();
        });
    }
    var addCol = $("kb-add-column");
    if (addCol) {
        addCol.addEventListener("click", function () {
            if (!KB.addColumn(board, "")) {
                toast("列数量已达上限（" + KB.MAX_COLUMNS + " 列）");
                return;
            }
            persist();
            render();
            var cols = document.querySelectorAll(".kb-column");
            var last = cols[cols.length - 1];
            if (last) {
                var f = KB.findColumn(board, last.getAttribute("data-col-id"));
                var name = prompt("新列名称", f ? f.column.title : "新列");
                if (name !== null && KB.isNonEmptyString(name)) {
                    KB.renameColumn(board, last.getAttribute("data-col-id"), name);
                    persist();
                    render();
                }
            }
        });
    }
    var clearDone = $("kb-clear-done");
    if (clearDone) {
        clearDone.addEventListener("click", function () {
            var dc = KB.findDoneColumn(board);
            if (!dc) { toast("未找到「已完成」列"); return; }
            var n = dc.column.cards.length;
            if (n === 0) { toast("「已完成」列已经是空的"); return; }
            if (confirm("确定清空「已完成」列的 " + n + " 张卡片吗？此操作不可撤销。")) {
                dc.column.cards = [];
                persist();
                render();
                toast("已清空「已完成」列");
            }
        });
    }
    var expBtn = $("kb-export");
    if (expBtn) {
        expBtn.addEventListener("click", function () {
            var blob = new Blob([KB.exportJSON(board)], { type: "application/json" });
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "kanban-backup-" + KB.todayStr() + ".json";
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
                URL.revokeObjectURL(a.href);
                a.parentNode.removeChild(a);
            }, 500);
            toast("备份已导出");
        });
    }
    var impBtn = $("kb-import");
    var impFile = $("kb-import-file");
    if (impBtn && impFile) {
        impBtn.addEventListener("click", function () { impFile.click(); });
        impFile.addEventListener("change", function () {
            var file = impFile.files && impFile.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function () {
                var r = KB.importJSON(String(reader.result || ""));
                if (!r.ok) {
                    toast("导入失败：文件不是有效的看板备份");
                } else if (confirm("导入将覆盖当前看板内容，确定继续吗？")) {
                    board = r.board;
                    persist();
                    render();
                    toast("备份已恢复");
                }
                impFile.value = "";
            };
            reader.readAsText(file);
        });
    }
    var modal = $("kb-modal");
    if (modal) {
        $("kb-m-save").addEventListener("click", saveCardModal);
        $("kb-m-cancel").addEventListener("click", closeCardModal);
        modal.querySelector(".kb-modal-mask").addEventListener("click", closeCardModal);
    }
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            if ($("kb-move-menu")) closeMoveMenu();
            if (modal && modal.style.display === "flex") closeCardModal();
        }
    });
}

/* ---------- 启动 ---------- */

function init() {
    var r = KB.loadBoard(store);
    board = r.board;
    if (r.recovered) {
        try { KB.saveBoard(store, board); } catch (e) {}
        setTimeout(function () {
            toast("检测到本地看板数据损坏，已为你重建空白看板（坏数据已丢弃）。");
        }, 300);
    }
    if (isTouchDevice()) {
        document.body.classList.add("kb-touch");
    }
    wireToolbar();
    render();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

})();
}
})();
