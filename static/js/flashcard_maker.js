/* 闪卡卡片生成器 - 抽认卡卡组管理 + 翻转练习 + 简化 SM-2 间隔重复（纯前端）
 *
 * 功能：
 *   卡组管理（创建/重命名/删除/多卡组切换；正面/反面录入、批量「正面<TAB>反面」行导入、
 *   示例卡组一键填充）→ 翻转练习（点击翻转 + 空格键）+ 认识/不认识二元判定
 *   → 掌握进度统计（总卡数/新卡/学习中/已掌握/今日待复习）→ localStorage 本地持久化
 *   → 导入/导出 JSON 备份迁移。
 *   卡组内容只在浏览器本地流转，不上传服务器；脚本内零 fetch/XHR/WebSocket。
 *
 * 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 *   shuffleDeck(cards, rand)
 *       -> Fisher-Yates 洗牌后的新数组（不改原数组）；rand 为注入随机函数
 *         （默认 Math.random），j = floor(rand()*(i+1))；
 *         cards 非数组抛 Error，err.field='cards'。
 *   gradeCard(card, result, now)
 *       -> 简化 SM-2 调度后的新卡片对象（不可变返回，不改原 card）；
 *         'know'：interval = (interval===0 ? 1 : ceil(interval*ease))，ease += 0.1；
 *         'unknown'：interval = 1，ease = max(1.3, ease-0.2)；
 *         reviews + 1；due = now + interval*86400000；ease 保留 2 位小数。
 *         card 非对象抛 Error，err.field='card'；
 *         result 非 'know'/'unknown' 抛 Error，err.field='result'；
 *         now 非有限数抛 Error，err.field='now'。
 *   computeDeckStats(cards)
 *       -> {total, new, learning, mastered}；
 *         new: reviews===0；learning: reviews>0 且 interval<7；mastered: interval>=7；
 *         cards 非数组抛 Error，err.field='cards'。
 *   nextDueCards(cards, now)
 *       -> due<=now 的卡片按 due 升序返回（新数组）；cards 非数组抛 Error，
 *         err.field='cards'；now 非有限数抛 Error，err.field='now'。
 *   parseImport(text)
 *       -> JSON.parse 后校验 {name: string, cards: [{front, back}]}，返回归一化卡组
 *         （每张卡补齐 reviews:0, interval:0, ease:2.5, due:0）；
 *         JSON 非法抛 Error，err.field='text'；结构不合法抛 Error，err.field='deck'。
 *   buildExportFileName(date)
 *       -> 'flashcards_YYYYMMDD_HHmmss.json'；
 *         date 非有效 Date 对象抛 Error，err.field='now'。
 *
 * 卡片结构：{front, back, reviews, interval, ease, due}
 * ease 初始 2.5（SuperMemo 惯例）；interval 单位天；due 为毫秒时间戳。
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

function pad2(n) {
    return (n < 10 ? '0' : '') + n;
}

/* Fisher-Yates 洗牌：返回新数组 */
function shuffleDeck(cards, rand) {
    if (!isArr(cards)) {
        throw err('cards', 'shuffleDeck: cards 必须为数组');
    }
    var r = rand || Math.random;
    var a = cards.slice();
    var i, j, t;
    for (i = a.length - 1; i > 0; i--) {
        j = Math.floor(r() * (i + 1));
        t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
}

/* 简化 SM-2：认识/不认识二元判定 → 新卡片（不可变） */
function gradeCard(card, result, now) {
    if (card === null || typeof card !== 'object') {
        throw err('card', 'gradeCard: card 必须为对象');
    }
    if (result !== 'know' && result !== 'unknown') {
        throw err('result', 'gradeCard: result 必须为 know 或 unknown');
    }
    if (typeof now !== 'number' || !isFinite(now)) {
        throw err('now', 'gradeCard: now 必须为有限数');
    }
    var interval = card.interval | 0;
    var ease = typeof card.ease === 'number' ? card.ease : 2.5;
    if (result === 'know') {
        interval = (interval === 0) ? 1 : Math.ceil(interval * ease);
        ease = ease + 0.1;
    } else {
        interval = 1;
        ease = Math.max(1.3, ease - 0.2);
    }
    ease = Math.round(ease * 100) / 100;
    return {
        front: card.front,
        back: card.back,
        reviews: (card.reviews | 0) + 1,
        interval: interval,
        ease: ease,
        due: now + interval * 86400000
    };
}

/* 卡组统计：总卡数 / 新卡 / 学习中 / 已掌握 */
function computeDeckStats(cards) {
    if (!isArr(cards)) {
        throw err('cards', 'computeDeckStats: cards 必须为数组');
    }
    var st = { total: cards.length, 'new': 0, learning: 0, mastered: 0 };
    var i, c;
    for (i = 0; i < cards.length; i++) {
        c = cards[i] || {};
        var reviews = c.reviews | 0;
        var interval = c.interval | 0;
        if (interval >= 7) { st.mastered++; }
        else if (reviews === 0) { st['new']++; }
        else { st.learning++; }
    }
    return st;
}

/* 复习队列：due<=now 的卡片按 due 升序 */
function nextDueCards(cards, now) {
    if (!isArr(cards)) {
        throw err('cards', 'nextDueCards: cards 必须为数组');
    }
    if (typeof now !== 'number' || !isFinite(now)) {
        throw err('now', 'nextDueCards: now 必须为有限数');
    }
    var q = [];
    var i;
    for (i = 0; i < cards.length; i++) {
        var c = cards[i] || {};
        var due = typeof c.due === 'number' ? c.due : 0;
        if (due <= now) { q.push(cards[i]); }
    }
    q.sort(function (a, b) { return (a.due || 0) - (b.due || 0); });
    return q;
}

/* 导入 JSON：校验 {name, cards:[{front,back}]} 并归一化默认调度字段 */
function parseImport(text) {
    if (typeof text !== 'string') {
        throw err('text', 'parseImport: text 必须为字符串');
    }
    var data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw err('text', 'parseImport: 不是合法 JSON');
    }
    if (data === null || typeof data !== 'object' ||
            typeof data.name !== 'string' || !isArr(data.cards)) {
        throw err('deck', 'parseImport: 卡组结构须为 {name: string, cards: [...]}');
    }
    var cards = [];
    var i, c;
    for (i = 0; i < data.cards.length; i++) {
        c = data.cards[i];
        if (c === null || typeof c !== 'object' ||
                typeof c.front !== 'string' || typeof c.back !== 'string') {
            throw err('deck', 'parseImport: 第 ' + (i + 1) + ' 张卡须为 {front, back} 字符串');
        }
        cards.push({
            front: c.front,
            back: c.back,
            reviews: 0,
            interval: 0,
            ease: 2.5,
            due: 0
        });
    }
    return { name: data.name, cards: cards };
}

/* 导出文件名：flashcards_YYYYMMDD_HHmmss.json */
function buildExportFileName(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        throw err('now', 'buildExportFileName: now 必须为有效 Date 对象');
    }
    return 'flashcards_' + date.getFullYear() + pad2(date.getMonth() + 1) + pad2(date.getDate()) +
        '_' + pad2(date.getHours()) + pad2(date.getMinutes()) + pad2(date.getSeconds()) + '.json';
}

/* ================= 纯函数导出 ================= */

var API = {
    shuffleDeck: shuffleDeck,
    gradeCard: gradeCard,
    computeDeckStats: computeDeckStats,
    nextDueCards: nextDueCards,
    parseImport: parseImport,
    buildExportFileName: buildExportFileName
};

/* ================= 浏览器 UI ================= */

var STORE_KEY = 'flashcard_maker_decks_v1';
var SAMPLE_DECK = {
    name: '示例：劳动仲裁高频考点',
    cards: [
        { front: '劳动仲裁时效一般是多久？', back: '劳动争议申请仲裁的时效期间为一年，从当事人知道或应当知道权利被侵害之日起计算。' },
        { front: '申请劳动仲裁需要提交哪些材料？', back: '仲裁申请书、申请人身份证复印件、被申请人工商登记信息、劳动关系证明（劳动合同/工资条/考勤等）。' },
        { front: '经济补偿金 N 的计算基数是什么？', back: '按劳动者在劳动合同解除/终止前十二个月的平均工资计算。' },
        { front: '未签书面劳动合同的双倍工资最多主张几个月？', back: '最长 11 个月（自用工之日起满一个月的次日至满一年的前一日）。' },
        { front: '劳动仲裁是一裁终局吗？', back: '小额案件（不超过当地月最低工资标准十二个月金额）与工作时间/休息休假/社保类案件对用人单位一裁终局，劳动者仍可起诉。' }
    ]
};

function nowMs() { return Date.now(); }

function makeCard(front, back) {
    return { front: front, back: back, reviews: 0, interval: 0, ease: 2.5, due: 0 };
}

function loadStore() {
    var raw = null;
    try { raw = localStorage.getItem(STORE_KEY); } catch (e) { raw = null; }
    if (!raw) { return { decks: [], activeId: null }; }
    try {
        var st = JSON.parse(raw);
        if (!st || typeof st !== 'object' || !isArr(st.decks)) { return { decks: [], activeId: null }; }
        return { decks: st.decks, activeId: st.activeId || null };
    } catch (e) { return { decks: [], activeId: null }; }
}

function saveStore() {
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ decks: state.decks, activeId: state.activeId }));
    } catch (e) {
        toast('浏览器存储失败（可能空间不足），建议先导出 JSON 备份');
    }
}

var state = {
    decks: [],
    activeId: null,
    queue: [],       // 当前练习队列（卡片对象引用）
    queuePos: 0,     // 队列下标
    flipped: false,  // 当前卡是否已翻面
    newIdSeq: 1
};

function activeDeck() {
    var i;
    for (i = 0; i < state.decks.length; i++) {
        if (state.decks[i].id === state.activeId) { return state.decks[i]; }
    }
    return null;
}

function uid() {
    return 'd' + nowMs().toString(36) + (state.newIdSeq++);
}

function toast(msg) {
    var el = document.getElementById('fm-toast');
    if (!el) { return; }
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.display = 'none'; }, 2600);
}

function escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---- 卡组列表渲染 ---- */

function renderDeckList() {
    var box = document.getElementById('fm-deck-list');
    if (!box) { return; }
    if (state.decks.length === 0) {
        box.innerHTML = '<div class="fm-empty">还没有卡组。先创建卡组，或点「示例一键填充」试玩。</div>';
        return;
    }
    var html = '';
    var i, d;
    for (i = 0; i < state.decks.length; i++) {
        d = state.decks[i];
        var dueN = nextDueCards(d.cards, nowMs()).length;
        html += '<div class="fm-deck' + (d.id === state.activeId ? ' active' : '') + '" data-id="' + escHtml(d.id) + '">' +
            '<div class="fm-deck-name">' + escHtml(d.name) + '</div>' +
            '<div class="fm-deck-meta">' + d.cards.length + ' 张 · 待复习 ' + dueN + ' 张</div>' +
            '<div class="fm-deck-ops">' +
            '<button class="fm-mini-btn" data-op="rename">重命名</button>' +
            '<button class="fm-mini-btn" data-op="export">导出</button>' +
            '<button class="fm-mini-btn danger" data-op="delete">删除</button>' +
            '</div></div>';
    }
    box.innerHTML = html;
    var items = box.querySelectorAll('.fm-deck');
    var k;
    for (k = 0; k < items.length; k++) {
        (function (item) {
            item.addEventListener('click', function (ev) {
                var id = item.getAttribute('data-id');
                var opBtn = ev.target.closest ? ev.target.closest('[data-op]') : null;
                if (opBtn) {
                    handleDeckOp(id, opBtn.getAttribute('data-op'));
                    ev.stopPropagation();
                    return;
                }
                switchDeck(id);
            });
        })(items[k]);
    }
}

function handleDeckOp(id, op) {
    var d = null, i;
    for (i = 0; i < state.decks.length; i++) {
        if (state.decks[i].id === id) { d = state.decks[i]; break; }
    }
    if (!d) { return; }
    if (op === 'rename') {
        var name = prompt('重命名卡组：', d.name);
        if (name === null) { return; }
        name = name.trim();
        if (!name) { toast('卡组名不能为空'); return; }
        d.name = name;
        saveStore(); renderDeckList(); renderEditor();
        toast('已重命名');
    } else if (op === 'delete') {
        if (!confirm('确定删除卡组「' + d.name + '」（' + d.cards.length + ' 张卡）？此操作不可撤销。')) { return; }
        state.decks = state.decks.filter(function (x) { return x.id !== id; });
        if (state.activeId === id) { state.activeId = state.decks.length ? state.decks[0].id : null; }
        saveStore(); renderAll();
        toast('已删除卡组');
    } else if (op === 'export') {
        exportDeck(d);
    }
}

function switchDeck(id) {
    state.activeId = id;
    resetPractice();
    saveStore(); renderDeckList(); renderEditor(); renderStats(); renderPractice();
}

function createDeck(name) {
    name = (name || '').trim();
    if (!name) { toast('请输入卡组名称'); return null; }
    var d = { id: uid(), name: name, cards: [] };
    state.decks.push(d);
    state.activeId = d.id;
    resetPractice();
    saveStore(); renderAll();
    toast('已创建卡组「' + name + '」');
    return d;
}

function fillSample() {
    var d = { id: uid(), name: SAMPLE_DECK.name, cards: [] };
    var i;
    for (i = 0; i < SAMPLE_DECK.cards.length; i++) {
        d.cards.push(makeCard(SAMPLE_DECK.cards[i].front, SAMPLE_DECK.cards[i].back));
    }
    state.decks.push(d);
    state.activeId = d.id;
    resetPractice();
    saveStore(); renderAll();
    toast('示例卡组已填充（' + d.cards.length + ' 张卡）');
}

/* ---- 卡片编辑器渲染 ---- */

function renderEditor() {
    var d = activeDeck();
    var title = document.getElementById('fm-editor-title');
    var cardBox = document.getElementById('fm-card-list');
    var batchWrap = document.getElementById('fm-batch-wrap');
    if (!title || !cardBox) { return; }
    if (!d) {
        title.textContent = '卡片编辑';
        cardBox.innerHTML = '<div class="fm-empty">先在左侧创建或选择一个卡组。</div>';
        return;
    }
    title.textContent = '卡片编辑 · ' + d.name;
    if (d.cards.length === 0) {
        cardBox.innerHTML = '<div class="fm-empty">卡组是空的：在下方输入正面/反面逐张添加，或用批量导入粘贴多行。</div>';
        return;
    }
    var html = '', i, c;
    for (i = 0; i < d.cards.length; i++) {
        c = d.cards[i];
        var tag = c.interval >= 7 ? '<span class="fm-tag mastered">已掌握</span>'
            : (c.reviews > 0 ? '<span class="fm-tag learning">学习中</span>'
            : '<span class="fm-tag new">新卡</span>');
        html += '<div class="fm-card-row" data-idx="' + i + '">' +
            '<div class="fm-card-text"><div class="fm-card-front">' + escHtml(c.front) + '</div>' +
            '<div class="fm-card-back">' + escHtml(c.back) + '</div>' +
            '<div class="fm-card-stat">' + tag + ' 复习 ' + (c.reviews | 0) + ' 次 · 间隔 ' + (c.interval | 0) + ' 天</div></div>' +
            '<div class="fm-card-ops"><button class="fm-mini-btn" data-op="edit">编辑</button>' +
            '<button class="fm-mini-btn danger" data-op="del">删除</button></div></div>';
    }
    cardBox.innerHTML = html;
    var rows = cardBox.querySelectorAll('.fm-card-row');
    var k;
    for (k = 0; k < rows.length; k++) {
        (function (row) {
            row.addEventListener('click', function (ev) {
                var opBtn = ev.target.closest ? ev.target.closest('[data-op]') : null;
                if (!opBtn) { return; }
                var idx = parseInt(row.getAttribute('data-idx'), 10);
                var deck = activeDeck();
                if (!deck) { return; }
                if (opBtn.getAttribute('data-op') === 'del') {
                    if (!confirm('删除这张卡？')) { return; }
                    deck.cards.splice(idx, 1);
                    saveStore(); renderAll();
                } else {
                    var nf = prompt('正面：', deck.cards[idx].front);
                    if (nf === null) { return; }
                    var nb = prompt('反面：', deck.cards[idx].back);
                    if (nb === null) { return; }
                    nf = nf.trim(); nb = nb.trim();
                    if (!nf || !nb) { toast('正面/反面都不能为空'); return; }
                    deck.cards[idx].front = nf;
                    deck.cards[idx].back = nb;
                    saveStore(); renderAll();
                    toast('已更新卡片');
                }
            });
        })(rows[k]);
    }
}

function addCard(front, back) {
    var d = activeDeck();
    if (!d) { toast('先创建或选择一个卡组'); return; }
    front = (front || '').trim(); back = (back || '').trim();
    if (!front || !back) { toast('正面和反面都不能为空'); return; }
    d.cards.push(makeCard(front, back));
    saveStore(); renderEditor(); renderStats();
}

/* 批量导入：每行「正面<TAB>反面」（也兼容制表符不足时用 | 分隔） */
function batchImport(text) {
    var d = activeDeck();
    if (!d) { toast('先创建或选择一个卡组'); return; }
    var lines = String(text || '').split(/\r?\n/);
    var added = 0, i;
    for (i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line.trim()) { continue; }
        var parts = line.split('\t');
        var sep = '\t';
        if (parts.length < 2) { parts = line.split('|'); sep = '|'; }
        if (parts.length < 2) { continue; }
        var f = parts[0].trim(), b = parts.slice(1).join(sep).trim();
        if (!f || !b) { continue; }
        d.cards.push(makeCard(f, b));
        added++;
    }
    saveStore(); renderEditor(); renderStats();
    toast(added > 0 ? ('已批量导入 ' + added + ' 张卡') : '没有可导入的有效行（格式：正面<TAB>反面）');
}

/* ---- 统计渲染 ---- */

function renderStats() {
    var box = document.getElementById('fm-stats');
    if (!box) { return; }
    var d = activeDeck();
    if (!d) {
        box.innerHTML = '<div class="fm-empty">选择卡组后查看掌握进度。</div>';
        return;
    }
    var st = computeDeckStats(d.cards);
    var dueN = nextDueCards(d.cards, nowMs()).length;
    box.innerHTML =
        '<div class="fm-stat"><div class="fm-stat-num">' + st.total + '</div><div class="fm-stat-label">总卡数</div></div>' +
        '<div class="fm-stat"><div class="fm-stat-num fm-c-new">' + st['new'] + '</div><div class="fm-stat-label">新卡</div></div>' +
        '<div class="fm-stat"><div class="fm-stat-num fm-c-learning">' + st.learning + '</div><div class="fm-stat-label">学习中</div></div>' +
        '<div class="fm-stat"><div class="fm-stat-num fm-c-mastered">' + st.mastered + '</div><div class="fm-stat-label">已掌握</div></div>' +
        '<div class="fm-stat"><div class="fm-stat-num fm-c-due">' + dueN + '</div><div class="fm-stat-label">今日待复习</div></div>';
}

/* ---- 练习模式 ---- */

function resetPractice() {
    state.queue = [];
    state.queuePos = 0;
    state.flipped = false;
}

function startPractice(mode) {
    var d = activeDeck();
    if (!d || d.cards.length === 0) { toast('当前卡组没有卡片，先添加卡片'); return; }
    var list = (mode === 'due') ? nextDueCards(d.cards, nowMs()) : d.cards.slice();
    if (mode === 'due' && list.length === 0) { toast('今日没有待复习的卡片，先去「全部练习」或添加新卡'); return; }
    state.queue = shuffleDeck(list);
    state.queuePos = 0;
    state.flipped = false;
    renderPractice();
    var sc = document.getElementById('fm-practice-card');
    if (sc && sc.scrollIntoView) { sc.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
}

function renderPractice() {
    var d = activeDeck();
    var wrap = document.getElementById('fm-practice');
    if (!wrap) { return; }
    if (!d) {
        wrap.innerHTML = '<div class="fm-empty">选择卡组后开始练习。</div>';
        return;
    }
    if (state.queue.length === 0) {
        wrap.innerHTML = '<div class="fm-practice-idle">' +
            '<div class="fm-practice-hint">「' + escHtml(d.name) + '」共 ' + d.cards.length + ' 张卡，' +
            '今日待复习 ' + nextDueCards(d.cards, nowMs()).length + ' 张。</div>' +
            '<div class="fm-actions">' +
            '<button class="btn btn-primary" id="fm-start-all">全部练习（乱序）</button>' +
            '<button class="btn btn-secondary" id="fm-start-due">今日待复习</button>' +
            '</div></div>';
        document.getElementById('fm-start-all').addEventListener('click', function () { startPractice('all'); });
        document.getElementById('fm-start-due').addEventListener('click', function () { startPractice('due'); });
        return;
    }
    var card = state.queue[state.queuePos];
    var side = state.flipped ? 'back' : 'front';
    var text = state.flipped ? card.back : card.front;
    var tag = state.flipped
        ? '<div class="fm-flip-tag">反面 · 答案</div>'
        : '<div class="fm-flip-tag">正面 · 点击卡片或按空格键翻转</div>';
    wrap.innerHTML =
        '<div class="fm-progress">第 ' + (state.queuePos + 1) + ' / ' + state.queue.length + ' 张</div>' +
        '<div class="fm-flip-card ' + side + '" id="fm-practice-card" tabindex="0" role="button" aria-label="翻转卡片">' +
        tag +
        '<div class="fm-flip-text">' + escHtml(text) + '</div>' +
        '</div>' +
        (state.flipped
            ? '<div class="fm-actions">' +
              '<button class="btn btn-secondary" id="fm-grade-unknown">不认识</button>' +
              '<button class="btn btn-primary" id="fm-grade-know">认识 ✓</button>' +
              '</div>'
            : '<div class="fm-practice-hint">先自己回忆答案，再翻转核对。</div>');
    var el = document.getElementById('fm-practice-card');
    el.addEventListener('click', toggleFlip);
    if (state.flipped) {
        document.getElementById('fm-grade-know').addEventListener('click', function () { grade('know'); });
        document.getElementById('fm-grade-unknown').addEventListener('click', function () { grade('unknown'); });
    }
}

function toggleFlip() {
    if (state.queue.length === 0) { return; }
    state.flipped = !state.flipped;
    renderPractice();
}

function grade(result) {
    var d = activeDeck();
    if (!d || state.queue.length === 0) { return; }
    var card = state.queue[state.queuePos];
    var updated = gradeCard(card, result, nowMs());
    /* 卡片对象是原数组引用成员：就地替换字段，保持练习队列引用一致 */
    var i;
    for (i = 0; i < d.cards.length; i++) {
        if (d.cards[i] === card) {
            d.cards[i] = updated;
            break;
        }
    }
    state.queue[state.queuePos] = updated;
    state.flipped = false;
    state.queuePos++;
    if (state.queuePos >= state.queue.length) {
        toast('本轮练习完成！');
        resetPractice();
    }
    saveStore(); renderStats(); renderDeckList(); renderPractice();
}

/* ---- 导入/导出 JSON ---- */

function exportDeck(d) {
    d = d || activeDeck();
    if (!d) { toast('先创建或选择一个卡组'); return; }
    var payload = JSON.stringify({ name: d.name, cards: d.cards.map(function (c) {
        return { front: c.front, back: c.back };
    }) }, null, 2);
    var blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = buildExportFileName(new Date());
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('已导出「' + d.name + '」（' + d.cards.length + ' 张卡）');
}

function importJsonText(text) {
    try {
        var deck = parseImport(text);
        var d = { id: uid(), name: deck.name, cards: deck.cards };
        state.decks.push(d);
        state.activeId = d.id;
        resetPractice();
        saveStore(); renderAll();
        toast('已导入卡组「' + deck.name + '」（' + deck.cards.length + ' 张卡）');
    } catch (e) {
        toast('导入失败：' + (e && e.message ? e.message : '未知错误'));
    }
}

function renderAll() {
    renderDeckList();
    renderEditor();
    renderStats();
    renderPractice();
}

function bindUI() {
    var createBtn = document.getElementById('fm-create-deck');
    var nameInput = document.getElementById('fm-new-deck-name');
    if (createBtn) {
        var doCreate = function () { createDeck(nameInput.value); nameInput.value = ''; };
        createBtn.addEventListener('click', doCreate);
        nameInput.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { doCreate(); } });
    }
    var sampleBtn = document.getElementById('fm-sample');
    if (sampleBtn) { sampleBtn.addEventListener('click', fillSample); }

    var addBtn = document.getElementById('fm-add-card');
    if (addBtn) {
        addBtn.addEventListener('click', function () {
            var f = document.getElementById('fm-front');
            var b = document.getElementById('fm-back');
            addCard(f.value, b.value);
            f.value = ''; b.value = '';
            f.focus();
        });
    }

    var batchBtn = document.getElementById('fm-batch-import');
    if (batchBtn) {
        batchBtn.addEventListener('click', function () {
            var ta = document.getElementById('fm-batch-text');
            batchImport(ta.value);
        });
    }

    var exportBtn = document.getElementById('fm-export-current');
    if (exportBtn) { exportBtn.addEventListener('click', function () { exportDeck(); }); }

    var fileInput = document.getElementById('fm-import-file');
    if (fileInput) {
        fileInput.addEventListener('change', function () {
            var file = fileInput.files[0];
            if (!file) { return; }
            var reader = new FileReader();
            reader.onload = function () { importJsonText(reader.result); fileInput.value = ''; };
            reader.onerror = function () { toast('读取文件失败'); fileInput.value = ''; };
            reader.readAsText(file, 'utf-8');
        });
    }

    /* 空格键翻转：仅在练习区且焦点不在输入框/文本域/按钮上 */
    document.addEventListener('keydown', function (ev) {
        if (ev.code !== 'Space' && ev.key !== ' ') { return; }
        var t = ev.target;
        var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') { return; }
        if (state.queue.length === 0) { return; }
        ev.preventDefault();
        toggleFlip();
    });
}

function init() {
    var st = loadStore();
    state.decks = st.decks;
    state.activeId = st.activeId;
    if (state.activeId && !activeDeck()) { state.activeId = null; }
    bindUI();
    renderAll();
}

if (typeof window !== 'undefined') {
    window.FlashcardMaker = API;
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else { init(); }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
}

})();
