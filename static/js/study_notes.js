/* 学习笔记整理器 - 浏览器本地学习/面试复习笔记（纯前端）
 *
 * 功能：
 *   笔记管理（新建/编辑/删除；标题＋正文，Markdown 精简子集渲染预览）
 *   → 标签系统（打标签/标签管理/按标签过滤）→ 全文搜索（标题/正文/标签，
 *     大小写不敏感）→ 置顶 → localStorage 本地持久化（无账号无登录）
 *   → 导入/导出 JSON 备份迁移＋单条 Markdown 导出。
 *   笔记内容只在浏览器本地流转，不上传服务器；脚本内无网络请求（无 fetch、无 XHR）。
 *
 * 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 *   addNote(notes, input)
 *       -> notes 尾部追加一条笔记后的新数组（不改原数组）；input 为
 *         {title, body?, tags?}；新笔记补齐 id/pinned/createdAt/updatedAt；
 *         notes 非数组抛 Error，err.field='notes'；
 *         input 非对象抛 Error，err.field='input'；
 *         title 非字符串或 trim 为空抛 Error，err.field='title'；
 *         body 存在但非字符串抛 Error，err.field='body'；
 *         tags 存在但非数组抛 Error，err.field='tags'。
 *   filterByTag(notes, tag)
 *       -> 含该标签的笔记新数组（标签匹配大小写不敏感）；
 *         notes 非数组抛 Error，err.field='notes'；
 *         tag 非字符串或 trim 为空抛 Error，err.field='tag'。
 *   searchNotes(notes, query)
 *       -> 全文搜索（标题/正文/任一标签，大小写不敏感）命中笔记的新数组；
 *         query 为空或纯空白时返回全部笔记的拷贝；
 *         notes 非数组抛 Error，err.field='notes'；
 *         query 非字符串抛 Error，err.field='query'。
 *   updateNote(notes, id, patch)
 *       -> 更新后笔记列表的新数组（不可变返回，不改原 notes 元素）；
 *         patch 为 {title?, body?, tags?, pinned?}，逐字段校验；
 *         notes 非数组抛 Error，err.field='notes'；
 *         id 非字符串/非数字或为空抛 Error，err.field='id'；
 *         id 不存在抛 Error，err.field='id'；
 *         patch 非对象抛 Error，err.field='patch'；
 *         title 非字符串或 trim 为空抛 Error，err.field='title'；
 *         body 非字符串抛 Error，err.field='body'；
 *         tags 非数组抛 Error，err.field='tags'；
 *         pinned 非布尔抛 Error，err.field='pinned'。
 *   deleteNote(notes, id)
 *       -> 删除该 id 笔记后的新数组；
 *         notes 非数组抛 Error，err.field='notes'；
 *         id 非字符串/非数字或为空抛 Error，err.field='id'；
 *         id 不存在抛 Error，err.field='id'。
 *   parseImport(text)
 *       -> JSON.parse 后归一化笔记数组（缺字段补默认值，非法条目整体判错）；
 *         text 非字符串或 JSON.parse 失败抛 Error，err.field='text'；
 *         解析结果非数组（且非 {notes:[...]}）抛 Error，err.field='notes'；
 *         任意条目 title 非字符串或 trim 为空抛 Error，err.field='notes'。
 *   buildExportFileName(date)
 *       -> 'studynotes_YYYYMMDD_HHmmss.json'；
 *         date 非有效 Date 对象抛 Error，err.field='now'。
 *
 * 笔记结构：{id, title, body, tags:[], pinned, createdAt, updatedAt}
 *
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；
 * Node 自测：module.exports 暴露纯函数。
 */
(function () {
'use strict';

/* ================= 纯函数 ================= */

function err(field, msg) {
    var e = new Error(msg);
    e.field = field;
    return e;
}

function isArr(v) {
    return Object.prototype.toString.call(v) === '[object Array]';
}

function isObj(v) {
    return v !== null && typeof v === 'object' && !isArr(v);
}

function pad2(n) {
    return (n < 10 ? '0' : '') + n;
}

function normId(v) {
    if (typeof v === 'string' && v.trim() !== '') { return v.trim(); }
    if (typeof v === 'number' && isFinite(v)) { return String(v); }
    return null;
}

function normTags(tags) {
    var out = [], seen = {};
    for (var i = 0; i < tags.length; i++) {
        var t = tags[i];
        if (typeof t !== 'string') { continue; }
        var s = t.trim();
        if (s === '' || seen[s.toLowerCase()]) { continue; }
        seen[s.toLowerCase()] = true;
        out.push(s);
    }
    return out;
}

function nowMs() {
    return Date.now();
}

var idSeq = 0;
function genId() {
    idSeq++;
    return 'n' + nowMs().toString(36) + '_' + idSeq;
}

function normNote(raw, fallbackMs) {
    var ms = fallbackMs || nowMs();
    if (!isObj(raw)) {
        throw err('notes', '笔记条目必须是对象');
    }
    if (typeof raw.title !== 'string' || raw.title.trim() === '') {
        throw err('notes', '笔记条目必须含非空标题（title）');
    }
    var tags = raw.tags === undefined ? [] : raw.tags;
    if (!isArr(tags)) { throw err('notes', '笔记条目标签（tags）必须是数组'); }
    return {
        id: raw.id === undefined || raw.id === null || raw.id === '' ? genId() : String(raw.id),
        title: raw.title.trim(),
        body: typeof raw.body === 'string' ? raw.body : '',
        tags: normTags(tags),
        pinned: raw.pinned === true,
        createdAt: typeof raw.createdAt === 'number' && isFinite(raw.createdAt) ? raw.createdAt : ms,
        updatedAt: typeof raw.updatedAt === 'number' && isFinite(raw.updatedAt) ? raw.updatedAt : ms
    };
}

/* addNote(notes, input) */
function addNote(notes, input) {
    if (!isArr(notes)) { throw err('notes', 'notes 必须是数组'); }
    if (!isObj(input)) { throw err('input', 'input 必须为对象'); }
    if (typeof input.title !== 'string' || input.title.trim() === '') {
        throw err('title', '标题（title）必须为非空字符串');
    }
    if (input.body !== undefined && typeof input.body !== 'string') {
        throw err('body', '正文（body）必须为字符串');
    }
    if (input.tags !== undefined && !isArr(input.tags)) {
        throw err('tags', '标签（tags）必须为数组');
    }
    var note = normNote(input, nowMs());
    return notes.concat([note]);
}

/* filterByTag(notes, tag)：标签匹配大小写不敏感 */
function filterByTag(notes, tag) {
    if (!isArr(notes)) { throw err('notes', 'notes 必须是数组'); }
    if (typeof tag !== 'string' || tag.trim() === '') {
        throw err('tag', 'tag 必须为非空字符串');
    }
    var needle = tag.trim().toLowerCase();
    return notes.filter(function (n) {
        return isObj(n) && isArr(n.tags) && n.tags.some(function (t) {
            return typeof t === 'string' && t.toLowerCase() === needle;
        });
    });
}

/* searchNotes(notes, query)：全文搜索，大小写不敏感；空查询返回全部拷贝 */
function searchNotes(notes, query) {
    if (!isArr(notes)) { throw err('notes', 'notes 必须是数组'); }
    if (typeof query !== 'string') { throw err('query', 'query 必须为字符串'); }
    var q = query.trim().toLowerCase();
    if (q === '') { return notes.slice(); }
    return notes.filter(function (n) {
        if (!isObj(n)) { return false; }
        var title = typeof n.title === 'string' ? n.title.toLowerCase() : '';
        var body = typeof n.body === 'string' ? n.body.toLowerCase() : '';
        if (title.indexOf(q) >= 0 || body.indexOf(q) >= 0) { return true; }
        if (isArr(n.tags)) {
            for (var i = 0; i < n.tags.length; i++) {
                if (typeof n.tags[i] === 'string' && n.tags[i].toLowerCase().indexOf(q) >= 0) {
                    return true;
                }
            }
        }
        return false;
    });
}

/* updateNote(notes, id, patch) */
function updateNote(notes, id, patch) {
    if (!isArr(notes)) { throw err('notes', 'notes 必须是数组'); }
    var nid = normId(id);
    if (nid === null) { throw err('id', 'id 必须为非空字符串或数字'); }
    if (!isObj(patch)) { throw err('patch', 'patch 必须为对象'); }
    if (patch.title !== undefined &&
        (typeof patch.title !== 'string' || patch.title.trim() === '')) {
        throw err('title', '标题（title）必须为非空字符串');
    }
    if (patch.body !== undefined && typeof patch.body !== 'string') {
        throw err('body', '正文（body）必须为字符串');
    }
    if (patch.tags !== undefined && !isArr(patch.tags)) {
        throw err('tags', '标签（tags）必须为数组');
    }
    if (patch.pinned !== undefined && typeof patch.pinned !== 'boolean') {
        throw err('pinned', '置顶（pinned）必须为布尔值');
    }
    var idx = -1;
    for (var i = 0; i < notes.length; i++) {
        if (isObj(notes[i]) && String(notes[i].id) === nid) { idx = i; break; }
    }
    if (idx === -1) { throw err('id', '不存在的笔记 id：' + nid); }
    var out = notes.slice();
    var next = {
        id: notes[idx].id,
        title: patch.title === undefined ? notes[idx].title : patch.title.trim(),
        body: patch.body === undefined ? (typeof notes[idx].body === 'string' ? notes[idx].body : '') : patch.body,
        tags: patch.tags === undefined
            ? (isArr(notes[idx].tags) ? notes[idx].tags.slice() : [])
            : normTags(patch.tags),
        pinned: patch.pinned === undefined ? notes[idx].pinned === true : patch.pinned,
        createdAt: typeof notes[idx].createdAt === 'number' ? notes[idx].createdAt : nowMs(),
        updatedAt: nowMs()
    };
    out[idx] = next;
    return out;
}

/* deleteNote(notes, id) */
function deleteNote(notes, id) {
    if (!isArr(notes)) { throw err('notes', 'notes 必须是数组'); }
    var nid = normId(id);
    if (nid === null) { throw err('id', 'id 必须为非空字符串或数字'); }
    var found = false;
    var out = notes.filter(function (n) {
        var hit = isObj(n) && String(n.id) === nid;
        if (hit) { found = true; }
        return !hit;
    });
    if (!found) { throw err('id', '不存在的笔记 id：' + nid); }
    return out;
}

/* parseImport(text) */
function parseImport(text) {
    if (typeof text !== 'string') { throw err('text', '导入文本必须为字符串'); }
    var parsed;
    try {
        parsed = JSON.parse(text);
    } catch (ex) {
        throw err('text', 'JSON 解析失败：' + ex.message);
    }
    var arr = parsed;
    if (isObj(parsed) && isArr(parsed.notes)) {
        arr = parsed.notes;
    }
    if (!isArr(arr)) { throw err('notes', '导入数据必须为笔记数组或 {notes:[...]} 对象'); }
    var ms = nowMs();
    return arr.map(function (item) { return normNote(item, ms); });
}

/* buildExportFileName(date) */
function buildExportFileName(date) {
    var ok = date instanceof Date && isFinite(date.getTime());
    if (!ok) { throw err('now', 'date 必须为有效 Date 对象'); }
    return 'studynotes_' + date.getFullYear() + pad2(date.getMonth() + 1) +
        pad2(date.getDate()) + '_' + pad2(date.getHours()) +
        pad2(date.getMinutes()) + pad2(date.getSeconds()) + '.json';
}

/* 单条笔记导出为 Markdown 文本（浏览器层使用，也导出供测试校验拼装） */
function buildNoteMarkdown(note) {
    if (!isObj(note) || typeof note.title !== 'string') {
        throw err('note', 'note 必须含 title 的对象');
    }
    var lines = [];
    lines.push('# ' + note.title);
    lines.push('');
    var tags = isArr(note.tags) && note.tags.length > 0 ? note.tags : null;
    if (tags) {
        lines.push('> 标签：' + tags.join('、'));
        lines.push('');
    }
    lines.push(typeof note.body === 'string' ? note.body : '');
    return lines.join('\n');
}

/* ================= Markdown 精简子集渲染（浏览器层） ================= */

function escHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function inlineMd(escaped) {
    var s = escaped;
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
}

function renderMarkdownLite(text) {
    var lines = String(text).split('\n');
    var html = [];
    var inCode = false, inList = null;
    function closeList() {
        if (inList) { html.push(inList === 'ul' ? '</ul>' : '</ol>'); inList = null; }
    }
    lines.forEach(function (raw) {
        var line = raw.replace(/\s+$/, '');
        if (/^```/.test(line)) {
            closeList();
            inCode = !inCode;
            html.push(inCode ? '<pre><code>' : '</code></pre>');
            return;
        }
        if (inCode) {
            html.push(escHtml(line));
            return;
        }
        if (/^\s*$/.test(line)) { closeList(); return; }
        var m;
        if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) {
            closeList();
            var level = m[1].length;
            html.push('<h' + (level + 3) + ' class="sn-md-h">' + inlineMd(escHtml(m[2])) + '</h' + (level + 3) + '>');
            return;
        }
        if ((m = /^\s*>\s?(.*)$/.exec(line))) {
            closeList();
            html.push('<blockquote class="sn-md-quote">' + inlineMd(escHtml(m[1])) + '</blockquote>');
            return;
        }
        if ((m = /^\s*[-*]\s+(.*)$/.exec(line))) {
            if (inList !== 'ul') { closeList(); html.push('<ul class="sn-md-ul">'); inList = 'ul'; }
            html.push('<li>' + inlineMd(escHtml(m[1])) + '</li>');
            return;
        }
        if ((m = /^\s*\d+\.\s+(.*)$/.exec(line))) {
            if (inList !== 'ol') { closeList(); html.push('<ol class="sn-md-ol">'); inList = 'ol'; }
            html.push('<li>' + inlineMd(escHtml(m[1])) + '</li>');
            return;
        }
        closeList();
        html.push('<p class="sn-md-p">' + inlineMd(escHtml(line)) + '</p>');
    });
    closeList();
    return html.join('\n');
}

/* ================= 浏览器 UI ================= */

var STORAGE_KEY = 'studynotes_v1';
var EXPORT_WRAP = 'studynotes_export';

var api = {
    addNote: addNote,
    filterByTag: filterByTag,
    searchNotes: searchNotes,
    updateNote: updateNote,
    deleteNote: deleteNote,
    parseImport: parseImport,
    buildExportFileName: buildExportFileName,
    buildNoteMarkdown: buildNoteMarkdown
};

if (typeof window !== 'undefined') { window.StudyNotes = api; }
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        addNote: addNote,
        filterByTag: filterByTag,
        searchNotes: searchNotes,
        updateNote: updateNote,
        deleteNote: deleteNote,
        parseImport: parseImport,
        buildExportFileName: buildExportFileName,
        buildNoteMarkdown: buildNoteMarkdown
    };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
        if (!document.getElementById('sn-app')) { return; }
        init();
    });
}

function init() {
    var state = {
        notes: [],
        activeTag: '',
        query: '',
        editingId: null
    };

    var els = {
        search: document.getElementById('sn-search'),
        tagBar: document.getElementById('sn-tagbar'),
        list: document.getElementById('sn-list'),
        count: document.getElementById('sn-count'),
        newBtn: document.getElementById('sn-new'),
        sampleBtn: document.getElementById('sn-sample'),
        exportBtn: document.getElementById('sn-export'),
        importLabel: document.getElementById('sn-import-label'),
        importFile: document.getElementById('sn-import-file'),
        tagMgrBtn: document.getElementById('sn-tagmgr'),
        tagMgr: document.getElementById('sn-tagmgr-panel'),
        tagMgrList: document.getElementById('sn-tagmgr-list'),
        tagMgrClose: document.getElementById('sn-tagmgr-close'),
        editor: document.getElementById('sn-editor'),
        eTitle: document.getElementById('sn-e-title'),
        eBody: document.getElementById('sn-e-body'),
        eTags: document.getElementById('sn-e-tags'),
        ePreview: document.getElementById('sn-e-preview'),
        ePreviewBtn: document.getElementById('sn-e-preview-btn'),
        eSave: document.getElementById('sn-e-save'),
        eCancel: document.getElementById('sn-e-cancel'),
        eTitleText: document.getElementById('sn-e-title-text'),
        toast: document.getElementById('sn-toast')
    };

    function toast(msg) {
        els.toast.textContent = msg;
        els.toast.style.display = 'block';
        clearTimeout(toast._t);
        toast._t = setTimeout(function () { els.toast.style.display = 'none'; }, 2200);
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state.notes));
        } catch (e) {
            toast('本地保存失败：浏览器存储空间不足或被禁用');
        }
    }

    function load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) { return; }
            var arr = JSON.parse(raw);
            if (!isArr(arr)) { return; }
            state.notes = parseImport(JSON.stringify(arr));
        } catch (e) {
            state.notes = [];
        }
    }

    function allTags() {
        var seen = {}, list = [];
        state.notes.forEach(function (n) {
            (n.tags || []).forEach(function (t) {
                var k = t.toLowerCase();
                if (!seen[k]) { seen[k] = t; list.push(t); }
            });
        });
        list.sort(function (a, b) { return a.toLowerCase().localeCompare(b.toLowerCase()); });
        return list;
    }

    function tagCount(tag) {
        var k = tag.toLowerCase(), c = 0;
        state.notes.forEach(function (n) {
            (n.tags || []).forEach(function (t) {
                if (t.toLowerCase() === k) { c++; }
            });
        });
        return c;
    }

    function filtered() {
        var notes = state.query ? searchNotes(state.notes, state.query) : state.notes.slice();
        if (state.activeTag) { notes = filterByTag(notes, state.activeTag); }
        notes.sort(function (a, b) {
            if ((a.pinned === true) !== (b.pinned === true)) { return a.pinned ? -1 : 1; }
            return b.updatedAt - a.updatedAt;
        });
        return notes;
    }

    function fmtTime(ms) {
        var d = new Date(ms);
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
            ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }

    function renderTagBar() {
        var tags = allTags();
        var html = '<button type="button" class="sn-chip' + (state.activeTag === '' ? ' active' : '') +
            '" data-tag="">全部（' + state.notes.length + '）</button>';
        tags.forEach(function (t) {
            html += '<button type="button" class="sn-chip' + (state.activeTag === t ? ' active' : '') +
                '" data-tag="' + escHtml(t) + '">' + escHtml(t) + '（' + tagCount(t) + '）</button>';
        });
        els.tagBar.innerHTML = html;
        var btns = els.tagBar.querySelectorAll('[data-tag]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', function () {
                state.activeTag = this.getAttribute('data-tag');
                renderTagBar();
                renderList();
            });
        }
    }

    function excerpt(body) {
        var s = String(body || '').replace(/\s+/g, ' ').trim();
        return s.length > 90 ? s.slice(0, 90) + '…' : s;
    }

    function renderList() {
        var notes = filtered();
        els.count.textContent = '共 ' + state.notes.length + ' 条笔记' +
            (state.query || state.activeTag ? '，当前筛选 ' + notes.length + ' 条' : '');
        if (notes.length === 0) {
            els.list.innerHTML = '<div class="sn-empty">暂无笔记。点「新建笔记」开始记录，或点「示例一键填充」试玩。</div>';
            return;
        }
        var html = notes.map(function (n) {
            var tags = (n.tags || []).map(function (t) {
                return '<span class="sn-tag">' + escHtml(t) + '</span>';
            }).join('');
            return '<div class="sn-card' + (n.pinned ? ' pinned' : '') + '" data-id="' + escHtml(n.id) + '">' +
                '<div class="sn-card-head">' +
                '<span class="sn-card-title">' + escHtml(n.title) + '</span>' +
                (n.pinned ? '<span class="sn-pin-badge">置顶</span>' : '') +
                '</div>' +
                '<div class="sn-card-excerpt">' + escHtml(excerpt(n.body)) + '</div>' +
                (tags ? '<div class="sn-card-tags">' + tags + '</div>' : '') +
                '<div class="sn-card-meta">更新于 ' + escHtml(fmtTime(n.updatedAt)) + '</div>' +
                '<div class="sn-card-ops">' +
                '<button type="button" class="sn-mini-btn" data-op="pin">' + (n.pinned ? '取消置顶' : '置顶') + '</button>' +
                '<button type="button" class="sn-mini-btn" data-op="edit">编辑</button>' +
                '<button type="button" class="sn-mini-btn" data-op="md">导出MD</button>' +
                '<button type="button" class="sn-mini-btn danger" data-op="del">删除</button>' +
                '</div></div>';
        }).join('');
        els.list.innerHTML = html;
        var cards = els.list.querySelectorAll('.sn-card');
        for (var i = 0; i < cards.length; i++) {
            (function (card) {
                var id = card.getAttribute('data-id');
                var ops = card.querySelectorAll('[data-op]');
                for (var j = 0; j < ops.length; j++) {
                    ops[j].addEventListener('click', function (ev) {
                        ev.stopPropagation();
                        onCardOp(id, this.getAttribute('data-op'));
                    });
                }
            })(cards[i]);
        }
    }

    function findNote(id) {
        for (var i = 0; i < state.notes.length; i++) {
            if (String(state.notes[i].id) === String(id)) { return state.notes[i]; }
        }
        return null;
    }

    function onCardOp(id, op) {
        if (op === 'del') {
            var n = findNote(id);
            if (!n) { return; }
            if (!window.confirm('确定删除笔记「' + n.title + '」吗？此操作不可撤销。')) { return; }
            try {
                state.notes = deleteNote(state.notes, id);
                save(); renderTagBar(); renderList();
                toast('已删除');
            } catch (e) { toast('删除失败：' + e.message); }
            return;
        }
        if (op === 'pin') {
            var cur = findNote(id);
            if (!cur) { return; }
            try {
                state.notes = updateNote(state.notes, id, { pinned: !cur.pinned });
                save(); renderList();
                toast(cur.pinned ? '已取消置顶' : '已置顶');
            } catch (e) { toast('操作失败：' + e.message); }
            return;
        }
        if (op === 'edit') { openEditor(id); return; }
        if (op === 'md') { exportNoteMd(id); return; }
    }

    function openEditor(id) {
        state.editingId = id || null;
        var n = id ? findNote(id) : null;
        els.eTitleText.textContent = n ? '编辑笔记' : '新建笔记';
        els.eTitle.value = n ? n.title : '';
        els.eBody.value = n ? n.body : '';
        els.eTags.value = n ? (n.tags || []).join('，') : '';
        els.ePreview.innerHTML = '';
        els.ePreview.style.display = 'none';
        els.ePreviewBtn.textContent = '预览';
        els.editor.style.display = 'block';
        els.eTitle.focus();
    }

    function closeEditor() {
        els.editor.style.display = 'none';
        state.editingId = null;
    }

    function saveEditor() {
        var title = els.eTitle.value.trim();
        if (!title) { toast('标题不能为空'); els.eTitle.focus(); return; }
        var rawTags = els.eTags.value.split(/[，,、\s]+/);
        var patch = {
            title: title,
            body: els.eBody.value,
            tags: rawTags.filter(function (t) { return t.trim() !== ''; })
        };
        try {
            if (state.editingId) {
                state.notes = updateNote(state.notes, state.editingId, patch);
                toast('已保存修改');
            } else {
                state.notes = addNote(state.notes, patch);
                toast('已创建笔记');
            }
            save();
            closeEditor();
            renderTagBar();
            renderList();
        } catch (e) {
            toast('保存失败：' + e.message);
        }
    }

    function togglePreview() {
        if (els.ePreview.style.display === 'none' || els.ePreview.style.display === '') {
            var title = els.eTitle.value.trim();
            var body = els.eBody.value;
            els.ePreview.innerHTML = '<div class="sn-pv-title">' + escHtml(title || '（未命名）') + '</div>' +
                renderMarkdownLite(body || '（正文为空）');
            els.ePreview.style.display = 'block';
            els.ePreviewBtn.textContent = '收起预览';
        } else {
            els.ePreview.style.display = 'none';
            els.ePreviewBtn.textContent = '预览';
        }
    }

    function download(name, text, mime) {
        var blob = new Blob([text], { type: mime || 'application/json;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }

    function exportJson() {
        if (state.notes.length === 0) { toast('暂无笔记可导出'); return; }
        var payload = {
            app: EXPORT_WRAP,
            version: 1,
            exportedAt: new Date().toISOString(),
            notes: state.notes
        };
        download(buildExportFileName(new Date()), JSON.stringify(payload, null, 2));
        toast('已导出 ' + state.notes.length + ' 条笔记');
    }

    function exportNoteMd(id) {
        var n = findNote(id);
        if (!n) { return; }
        var safe = n.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) || 'note';
        download(safe + '.md', buildNoteMarkdown(n), 'text/markdown;charset=utf-8');
        toast('已导出「' + n.title + '.md」');
    }

    function importJson(file) {
        var reader = new FileReader();
        reader.onload = function () {
            try {
                var imported = parseImport(String(reader.result));
                if (imported.length === 0) { toast('文件里没有可导入的笔记'); return; }
                state.notes = state.notes.concat(imported);
                save(); renderTagBar(); renderList();
                toast('已导入 ' + imported.length + ' 条笔记');
            } catch (e) {
                toast('导入失败：' + e.message);
            }
        };
        reader.onerror = function () { toast('文件读取失败'); };
        reader.readAsText(file, 'utf-8');
    }

    function renderTagMgr() {
        var tags = allTags();
        if (tags.length === 0) {
            els.tagMgrList.innerHTML = '<div class="sn-empty">暂无标签。</div>';
            return;
        }
        var html = tags.map(function (t) {
            return '<div class="sn-tmrow" data-tag="' + escHtml(t) + '">' +
                '<span class="sn-tag">' + escHtml(t) + '</span>' +
                '<span class="sn-tmcount">' + tagCount(t) + ' 条笔记</span>' +
                '<input type="text" class="sn-tm-input" placeholder="重命名为…">' +
                '<button type="button" class="sn-mini-btn" data-op="rename">重命名</button>' +
                '<button type="button" class="sn-mini-btn danger" data-op="del">删除标签</button>' +
                '</div>';
        }).join('');
        els.tagMgrList.innerHTML = html;
        var rows = els.tagMgrList.querySelectorAll('.sn-tmrow');
        for (var i = 0; i < rows.length; i++) {
            (function (row) {
                var oldTag = row.getAttribute('data-tag');
                var input = row.querySelector('.sn-tm-input');
                row.querySelector('[data-op="rename"]').addEventListener('click', function () {
                    renameTag(oldTag, input.value.trim());
                });
                row.querySelector('[data-op="del"]').addEventListener('click', function () {
                    deleteTag(oldTag);
                });
            })(rows[i]);
        }
    }

    function renameTag(oldTag, newTag) {
        if (!newTag) { toast('新标签名不能为空'); return; }
        if (newTag === oldTag) { return; }
        var oldLower = oldTag.toLowerCase();
        state.notes = state.notes.map(function (n) {
            var tags = (n.tags || []).map(function (t) {
                return t.toLowerCase() === oldLower ? newTag : t;
            });
            return updateNote([n], n.id, { tags: tags })[0];
        });
        save(); renderTagBar(); renderList(); renderTagMgr();
        toast('标签已重命名为「' + newTag + '」');
    }

    function deleteTag(tag) {
        if (!window.confirm('确定删除标签「' + tag + '」吗？该标签将从所有笔记中移除（笔记本身保留）。')) { return; }
        var k = tag.toLowerCase();
        state.notes = state.notes.map(function (n) {
            var tags = (n.tags || []).filter(function (t) { return t.toLowerCase() !== k; });
            return updateNote([n], n.id, { tags: tags })[0];
        });
        if (state.activeTag && state.activeTag.toLowerCase() === k) { state.activeTag = ''; }
        save(); renderTagBar(); renderList(); renderTagMgr();
        toast('已删除标签「' + tag + '」');
    }

    function fillSample() {
        var samples = [
            {
                title: 'Go 面试题：切片扩容',
                body: '## 切片扩容规则\n\n- `len < 1024` 时**容量翻倍**；\n- `len >= 1024` 时每次扩容约 **1.25 倍**（`nextslicecap`）；\n- `append` 返回新切片，**原切片长度不变**；\n- 面试陷阱：`append` 后旧切片元素可能被覆盖。',
                tags: ['Go', '面试', '切片'],
                pinned: true
            },
            {
                title: 'Redis 持久化：RDB vs AOF',
                body: '## 两种持久化\n\n1. **RDB**：全量快照，恢复快，*可能丢最近数据*；\n2. **AOF**：追加写命令，`everysec` 最多丢 1 秒；\n3. 生产建议：两者都开。\n\n> 复习重点：`save` 同步阻塞 vs `bgsave` fork 子进程。',
                tags: ['Redis', '面试', '中间件'],
                pinned: false
            }
        ];
        samples.forEach(function (s) {
            state.notes = addNote(state.notes, s);
        });
        save(); renderTagBar(); renderList();
        toast('已填充 2 条示例笔记');
    }

    /* 事件绑定 */
    els.search.addEventListener('input', function () {
        state.query = this.value;
        renderList();
    });
    els.newBtn.addEventListener('click', function () { openEditor(null); });
    els.sampleBtn.addEventListener('click', fillSample);
    els.exportBtn.addEventListener('click', exportJson);
    els.importFile.addEventListener('change', function () {
        if (this.files && this.files[0]) { importJson(this.files[0]); }
        this.value = '';
    });
    els.tagMgrBtn.addEventListener('click', function () {
        renderTagMgr();
        els.tagMgr.style.display = 'block';
    });
    els.tagMgrClose.addEventListener('click', function () {
        els.tagMgr.style.display = 'none';
    });
    els.eSave.addEventListener('click', saveEditor);
    els.eCancel.addEventListener('click', closeEditor);
    els.ePreviewBtn.addEventListener('click', togglePreview);

    load();
    renderTagBar();
    renderList();
}

})();
