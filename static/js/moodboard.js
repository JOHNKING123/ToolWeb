/* 灵感板 / 拼贴板（Moodboard）- 自由画布灵感收集
 *
 * 自由画布（800×600 逻辑画布，卡片绝对定位）→ 四类卡片（图片/便签/链接/色板）
 * → 拖拽移动＋右下角缩放手柄＋删除/复制/置顶/置底 → 5 套模板一键套用
 * → canvas 合成 PNG 导出 → localStorage 自动保存＋JSON 导出/导入备份
 * → 撤销栈 20 步。纯本地零上传。
 *
 * 纯函数契约（家族惯例：非法参数抛 Error，err.field 给字段名，不静默钳制）：
 * validateBoardCard / clampCardPosition / normalizeHex / clampZoom /
 * applyTemplate / moveCardToFront / moveCardToBack / buildExportFileName /
 * validateBoardState
 */
(function () {
'use strict';

/* ================= 常量 ================= */

var BOARD_WIDTH = 800;           // 逻辑画布宽（px）
var BOARD_HEIGHT = 600;          // 逻辑画布高（px）
var MAX_CARDS = 20;              // 看板卡片总数上限
var MAX_IMAGES = 20;             // 图片卡片总数上限
var MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;  // 单张图片 ≤2MB
var ZOOM_MIN = 0.5;              // 画布缩放下限 50%
var ZOOM_MAX = 1.5;              // 画布缩放上限 150%
var UNDO_LIMIT = 20;             // 撤销栈步数
var STORAGE_KEY = 'moodboard-v1';
var CARD_TYPES = ['image', 'note', 'link', 'swatch'];
var NOTE_COLORS = ['#fef9c3', '#dbeafe', '#dcfce7', '#fce7f3', '#ffedd5', '#e9d5ff'];
var TEMPLATE_IDS = ['blank', 'design', 'decor', 'wedding', 'fashion'];
var TEMPLATE_LABELS = {
    blank: '空白自由', design: '设计参考', decor: '装修配色',
    wedding: '婚礼策划', fashion: '穿搭灵感'
};

/* ================= 纯函数 ================= */

function mbError(field, message) {
    var e = new Error(message);
    e.field = field;
    return e;
}

function isNum(v) {
    return typeof v === 'number' && isFinite(v);
}

/* HEX 归一化：接受 "#FFF" / "FFF" / "#ff0000" / "ff0000"，统一小写 6 位 "#rrggbb"；
   非法抛 Error（err.field='hex'） */
function normalizeHex(hex) {
    if (typeof hex !== 'string') {
        throw mbError('hex', 'hex 必须是字符串');
    }
    var h = hex.replace(/^\s+|\s+$/g, '');
    if (h.charAt(0) === '#') h = h.slice(1);
    if (h.length === 3) {
        if (!/^[0-9a-fA-F]{3}$/.test(h)) {
            throw mbError('hex', 'hex 非法：' + hex);
        }
        h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    }
    if (!/^[0-9a-fA-F]{6}$/.test(h)) {
        throw mbError('hex', 'hex 非法：' + hex);
    }
    return '#' + h.toLowerCase();
}

/* 校验单张卡片：合法返回 card 本身；非法抛 Error（err.field 给字段名） */
function validateBoardCard(card) {
    if (!card || typeof card !== 'object') {
        throw mbError('card', '卡片缺失：须为对象');
    }
    if (CARD_TYPES.indexOf(card.type) === -1) {
        throw mbError('type', 'type 非法：' + String(card.type) + '，可选 ' + CARD_TYPES.join(' / '));
    }
    if (!isNum(card.x) || !isNum(card.y) || card.x < 0 || card.y < 0) {
        throw mbError('position', 'x/y 须为 ≥0 的有限数');
    }
    if (!isNum(card.w) || !isNum(card.h) || card.w <= 0 || card.h <= 0) {
        throw mbError('size', 'w/h 须为正有限数');
    }
    if (card.type === 'image') {
        if (typeof card.dataUrl !== 'string' || card.dataUrl.length === 0) {
            throw mbError('dataUrl', 'image 卡片须有非空 dataUrl');
        }
    }
    if (card.type === 'link') {
        if (typeof card.url !== 'string' || card.url.replace(/^\s+|\s+$/g, '').length === 0) {
            throw mbError('url', 'link 卡片须有非空 url');
        }
    }
    if (card.type === 'swatch') {
        try {
            normalizeHex(card.color);
        } catch (e) {
            throw mbError('color', 'swatch 卡片 hex 非法：' + String(card.color));
        }
    }
    return card;
}

/* 卡片位置钳制到画布内：x∈[0, boardW−cardW]，y∈[0, boardH−cardH]；
   画布/卡片尺寸须为正有限数，否则 err.field='board' */
function clampCardPosition(x, y, boardW, boardH, cardW, cardH) {
    if (!isNum(boardW) || !isNum(boardH) || !isNum(cardW) || !isNum(cardH) ||
        boardW <= 0 || boardH <= 0 || cardW <= 0 || cardH <= 0) {
        throw mbError('board', 'boardW/boardH/cardW/cardH 须为正有限数');
    }
    if (!isNum(x) || !isNum(y)) {
        throw mbError('position', 'x/y 须为有限数');
    }
    return {
        x: Math.max(0, Math.min(x, boardW - cardW)),
        y: Math.max(0, Math.min(y, boardH - cardH))
    };
}

/* 画布缩放钳制到 [0.5, 1.5]；非有限数抛错 err.field='zoom' */
function clampZoom(zoom) {
    if (!isNum(zoom)) {
        throw mbError('zoom', 'zoom 须为有限数');
    }
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/* 模板占位图：内联 SVG dataURL（零外部资源），模板图片卡片用 */
function svgPlaceholder(label, bg, fg) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="440" height="300">' +
        '<rect width="440" height="300" fill="' + bg + '"/>' +
        '<circle cx="220" cy="130" r="52" fill="none" stroke="' + fg + '" stroke-width="6"/>' +
        '<path d="M168 212 L205 165 L235 200 L262 168 L292 212 Z" fill="' + fg + '"/>' +
        '<text x="220" y="262" font-size="26" text-anchor="middle" fill="' + fg +
        '" font-family="sans-serif">' + label + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/* 模板定义：每套返回全新卡片数组（固定模板 id，浏览器层套用时重编 id） */
function templateCards(templateId) {
    var img = function (id, x, y, w, h, label, bg, fg) {
        return { id: id, type: 'image', x: x, y: y, w: w, h: h,
            dataUrl: svgPlaceholder(label, bg, fg) };
    };
    var note = function (id, x, y, w, h, text, color) {
        return { id: id, type: 'note', x: x, y: y, w: w, h: h, text: text, color: color };
    };
    var link = function (id, x, y, w, h, title, url) {
        return { id: id, type: 'link', x: x, y: y, w: w, h: h, title: title, url: url };
    };
    var swatch = function (id, x, y, w, h, color) {
        return { id: id, type: 'swatch', x: x, y: y, w: w, h: h, color: color };
    };
    switch (templateId) {
    case 'blank':
        return [];
    case 'design':
        return [
            note('tpl-design-1', 40, 40, 280, 150, '设计参考\n把喜欢的排版、配色、字体都钉在这里。', '#fef9c3'),
            img('tpl-design-2', 350, 40, 220, 150, '参考图', '#dbeafe', '#2563eb'),
            swatch('tpl-design-3', 600, 40, 160, 110, '#2563eb'),
            swatch('tpl-design-4', 600, 170, 160, 110, '#f59e0b'),
            link('tpl-design-5', 40, 220, 300, 110, 'Behance 设计灵感', 'https://www.behance.net'),
            note('tpl-design-6', 370, 220, 390, 110, '主色 #2563eb ＋ 点缀 #f59e0b', '#dbeafe')
        ];
    case 'decor':
        return [
            note('tpl-decor-1', 40, 40, 300, 140, '装修配色\n客厅主调：暖白墙 ＋ 原木 ＋ 莫兰迪绿。', '#ffedd5'),
            swatch('tpl-decor-2', 370, 40, 120, 110, '#e8e0d0'),
            swatch('tpl-decor-3', 510, 40, 120, 110, '#8a9a7b'),
            swatch('tpl-decor-4', 650, 40, 110, 110, '#c9a227'),
            img('tpl-decor-5', 40, 210, 340, 200, '户型参考', '#dcfce7', '#15803d'),
            link('tpl-decor-6', 410, 210, 350, 110, '装修灵感收藏', 'https://www.pinterest.com'),
            note('tpl-decor-7', 410, 350, 350, 110, '待定：沙发面料、窗帘色卡、灯具清单', '#fef9c3')
        ];
    case 'wedding':
        return [
            note('tpl-wedding-1', 40, 40, 300, 150, '婚礼策划\n主题：春日花园\n宾客约 120 人，预算待定。', '#fce7f3'),
            img('tpl-wedding-2', 370, 40, 240, 150, '婚礼参考', '#fce7f3', '#be185d'),
            swatch('tpl-wedding-3', 640, 40, 120, 110, '#f7e8e8'),
            swatch('tpl-wedding-4', 640, 170, 120, 110, '#b76e79'),
            link('tpl-wedding-5', 40, 220, 320, 110, '婚礼灵感合集', 'https://www.pinterest.com'),
            note('tpl-wedding-6', 390, 220, 370, 110, '待办：场地、摄影、婚纱、花艺、伴手礼', '#fef9c3')
        ];
    case 'fashion':
        return [
            img('tpl-fashion-1', 40, 40, 220, 260, '穿搭参考', '#e9d5ff', '#7e22ce'),
            img('tpl-fashion-2', 290, 40, 220, 260, '单品图', '#dbeafe', '#1d4ed8'),
            note('tpl-fashion-3', 540, 40, 220, 130, '穿搭灵感\n本季关键词：复古、廓形、撞色。', '#fef9c3'),
            swatch('tpl-fashion-4', 540, 190, 100, 110, '#7e22ce'),
            swatch('tpl-fashion-5', 660, 190, 100, 110, '#f59e0b'),
            link('tpl-fashion-6', 40, 330, 320, 110, '穿搭博主收藏', 'https://www.example.com/fashion')
        ];
    default:
        throw mbError('templateId', 'templateId 非法：' + String(templateId) +
            '，可选 ' + TEMPLATE_IDS.join(' / '));
    }
}

/* 套用模板：templateId 须为 blank/design/decor/wedding/fashion 之一，
   否则抛错 err.field='templateId'；blank → [] */
function applyTemplate(templateId) {
    if (typeof templateId !== 'string' || TEMPLATE_IDS.indexOf(templateId) === -1) {
        throw mbError('templateId', 'templateId 非法：' + String(templateId) +
            '，可选 ' + TEMPLATE_IDS.join(' / '));
    }
    var cards = templateCards(templateId);
    cards.forEach(function (c) { validateBoardCard(c); });
    return cards;
}

/* 置顶：把指定卡片移到数组末尾（最上层）；原数组不动，返回新数组；
   cards 须为非空数组（err.field='cards'），cardId 不存在（err.field='cardId'） */
function moveCardToFront(cards, cardId) {
    if (!Array.isArray(cards) || cards.length === 0) {
        throw mbError('cards', 'cards 必须是非空数组');
    }
    var idx = -1;
    cards.forEach(function (c, i) { if (c && c.id === cardId) idx = i; });
    if (idx === -1) {
        throw mbError('cardId', 'cardId 不存在：' + String(cardId));
    }
    var next = cards.slice();
    var card = next.splice(idx, 1)[0];
    next.push(card);
    return next;
}

/* 置底：把指定卡片移到数组开头（最下层）；原数组不动，返回新数组 */
function moveCardToBack(cards, cardId) {
    if (!Array.isArray(cards) || cards.length === 0) {
        throw mbError('cards', 'cards 必须是非空数组');
    }
    var idx = -1;
    cards.forEach(function (c, i) { if (c && c.id === cardId) idx = i; });
    if (idx === -1) {
        throw mbError('cardId', 'cardId 不存在：' + String(cardId));
    }
    var next = cards.slice();
    var card = next.splice(idx, 1)[0];
    next.unshift(card);
    return next;
}

/* 导出文件名：去扩展名＋"-moodboard.png"；空/空白回退 "moodboard.png"；
   非字符串抛错 err.field='fileName' */
function buildExportFileName(baseName) {
    if (typeof baseName !== 'string') {
        throw mbError('fileName', 'baseName 必须是字符串');
    }
    var name = baseName.replace(/^\s+|\s+$/g, '');
    if (name.length === 0) return 'moodboard.png';
    var dot = name.lastIndexOf('.');
    if (dot > 0) name = name.slice(0, dot);
    if (name.length === 0) return 'moodboard.png';
    return name + '-moodboard.png';
}

/* 校验整板状态：cards 须为数组（err.field='cards'），每张过 validateBoardCard，
   卡片数 ≤20（err.field='cards'）；合法返回 state 本身 */
function validateBoardState(state) {
    if (!state || typeof state !== 'object' || !Array.isArray(state.cards)) {
        throw mbError('cards', 'state.cards 必须是非空数组');
    }
    if (state.cards.length > MAX_CARDS) {
        throw mbError('cards', '卡片数超过上限 ' + MAX_CARDS + '：' + state.cards.length);
    }
    state.cards.forEach(function (c) { validateBoardCard(c); });
    return state;
}

var api = {
    BOARD_WIDTH: BOARD_WIDTH, BOARD_HEIGHT: BOARD_HEIGHT,
    MAX_CARDS: MAX_CARDS, MAX_IMAGES: MAX_IMAGES,
    MAX_IMAGE_SIZE_BYTES: MAX_IMAGE_SIZE_BYTES,
    ZOOM_MIN: ZOOM_MIN, ZOOM_MAX: ZOOM_MAX, UNDO_LIMIT: UNDO_LIMIT,
    STORAGE_KEY: STORAGE_KEY, CARD_TYPES: CARD_TYPES,
    NOTE_COLORS: NOTE_COLORS, TEMPLATE_IDS: TEMPLATE_IDS,
    TEMPLATE_LABELS: TEMPLATE_LABELS,
    validateBoardCard: validateBoardCard,
    clampCardPosition: clampCardPosition,
    normalizeHex: normalizeHex,
    clampZoom: clampZoom,
    applyTemplate: applyTemplate,
    moveCardToFront: moveCardToFront,
    moveCardToBack: moveCardToBack,
    buildExportFileName: buildExportFileName,
    validateBoardState: validateBoardState
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
}
if (typeof window !== 'undefined') window.Moodboard = api;

/* ================= 浏览器 DOM 逻辑 ================= */

function $(id) { return document.getElementById(id); }

var toastTimer = null;
function toast(msg) {
    var el = $('mb-toast');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.display = 'none'; }, 3200);
}

function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
        if (canvas.toBlob) {
            canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('canvas 导出失败')); }, 'image/png');
        } else {
            reject(new Error('当前浏览器不支持 canvas 导出'));
        }
    });
}

/* ---------- 状态 ---------- */

var state = {
    name: '我的灵感板',
    cards: [],
    selectedId: null,
    zoom: 1,
    showGrid: true
};
var undoStack = [];
var idSeq = 0;
var editUndoPushed = false;

/* 文本编辑类操作：聚焦时（改动前）推一次撤销快照，同一轮编辑只推一次 */
function pushUndoOnce() {
    if (editUndoPushed) return;
    editUndoPushed = true;
    pushUndo();
}

function nextId() {
    idSeq += 1;
    return 'card-' + Date.now().toString(36) + '-' + idSeq;
}

function snapshot() { return JSON.stringify(state.cards); }

function pushUndo() {
    undoStack.push(snapshot());
    if (undoStack.length > UNDO_LIMIT) undoStack.splice(0, undoStack.length - UNDO_LIMIT);
    refreshUndoBtn();
}

function doUndo() {
    if (!undoStack.length) { toast('没有可撤销的操作'); return; }
    state.cards = JSON.parse(undoStack.pop());
    state.selectedId = null;
    refreshUndoBtn();
    renderBoard();
    saveBoard(true);
    toast('已撤销');
}

function refreshUndoBtn() {
    var b = $('mb-undo');
    if (b) b.disabled = undoStack.length === 0;
}

/* ---------- 本地保存 ---------- */

function saveBoard(silent) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            name: state.name, cards: state.cards,
            zoom: state.zoom, showGrid: state.showGrid, savedAt: Date.now()
        }));
        var st = $('mb-save-status');
        if (st) st.textContent = '已自动保存到本浏览器 ' + new Date().toLocaleTimeString();
        var warn = $('mb-save-warn');
        if (warn) warn.style.display = 'none';
    } catch (e) {
        var w = $('mb-save-warn');
        if (w) w.style.display = 'block';
        if (!silent) toast('本地保存失败：浏览器存储约 5MB 上限，图片过多/过大时存不下，请导出 JSON 备份');
    }
    refreshStatus();
}

function loadBoard() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
    if (!raw) return;
    try {
        var data = JSON.parse(raw);
        validateBoardState(data);
        state.name = typeof data.name === 'string' && data.name ? data.name : state.name;
        state.cards = data.cards;
        state.zoom = typeof data.zoom === 'number' ? clampZoom(data.zoom) : 1;
        state.showGrid = data.showGrid !== false;
    } catch (e) {
        toast('本地看板恢复失败（' + (e.field || '') + '），已从空白看板开始，请导入 JSON 备份');
        state.cards = [];
    }
}

function refreshStatus() {
    var el = $('mb-status');
    if (!el) return;
    var imgs = state.cards.filter(function (c) { return c.type === 'image'; }).length;
    el.textContent = '卡片 ' + state.cards.length + ' / ' + MAX_CARDS +
        ' · 图片 ' + imgs + ' / ' + MAX_IMAGES +
        ' · 画布 ' + BOARD_WIDTH + '×' + BOARD_HEIGHT;
}

/* ---------- 渲染 ---------- */

function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cardLetter(title, url) {
    var t = (title || '').replace(/^\s+|\s+$/g, '');
    if (t) return t.charAt(0).toUpperCase();
    var u = (url || '').replace(/^https?:\/\//, '');
    return (u.charAt(0) || '?').toUpperCase();
}

function renderBoard() {
    var canvas = $('mb-canvas');
    if (!canvas) return;
    canvas.style.width = BOARD_WIDTH + 'px';
    canvas.style.height = BOARD_HEIGHT + 'px';
    canvas.style.transform = 'scale(' + state.zoom + ')';
    canvas.className = 'mb-canvas' + (state.showGrid ? ' mb-grid' : '');
    var wrap = $('mb-canvas-wrap');
    if (wrap) {
        wrap.style.width = Math.round(BOARD_WIDTH * state.zoom) + 'px';
        wrap.style.height = Math.round(BOARD_HEIGHT * state.zoom) + 'px';
    }
    canvas.innerHTML = '';
    state.cards.forEach(function (card) {
        var el = document.createElement('div');
        el.className = 'mb-card mb-card-' + card.type + (state.selectedId === card.id ? ' sel' : '');
        el.setAttribute('data-id', card.id);
        el.style.left = card.x + 'px';
        el.style.top = card.y + 'px';
        el.style.width = card.w + 'px';
        el.style.height = card.h + 'px';
        el.innerHTML = cardInnerHTML(card);
        canvas.appendChild(el);
        bindCardEvents(el, card);
    });
    var nameInput = $('mb-board-name');
    if (nameInput && nameInput.value !== state.name) nameInput.value = state.name;
    var zoomLabel = $('mb-zoom-val');
    if (zoomLabel) zoomLabel.textContent = Math.round(state.zoom * 100) + '%';
    var zoomSlider = $('mb-zoom');
    if (zoomSlider) zoomSlider.value = String(Math.round(state.zoom * 100));
    var gridToggle = $('mb-grid-toggle');
    if (gridToggle) gridToggle.checked = state.showGrid;
    var tools = $('mb-card-tools');
    if (tools) tools.style.display = state.selectedId ? 'flex' : 'none';
    refreshStatus();
}

function cardInnerHTML(card) {
    var tools = '<div class="mb-card-bar">' +
        '<button type="button" data-act="copy" title="复制卡片">复制</button>' +
        '<button type="button" data-act="front" title="置顶">置顶</button>' +
        '<button type="button" data-act="back" title="置底">置底</button>' +
        '<button type="button" data-act="del" title="删除卡片">删除</button></div>' +
        '<div class="mb-resize" title="拖动缩放"></div>';
    if (card.type === 'image') {
        return '<img class="mb-img" src="' + esc(card.dataUrl) + '" alt="图片卡片" draggable="false">' + tools;
    }
    if (card.type === 'note') {
        return '<textarea class="mb-note-text" rows="3" aria-label="便签内容">' +
            esc(card.text || '') + '</textarea>' +
            '<div class="mb-note-colors">' +
            NOTE_COLORS.map(function (c) {
                return '<button type="button" class="mb-note-color' +
                    (normalizeHex(card.color || '#fef9c3') === c ? ' active' : '') +
                    '" data-color="' + c + '" style="background:' + c +
                    '" aria-label="便签背景 ' + c + '"></button>';
            }).join('') + '</div>' + tools;
    }
    if (card.type === 'link') {
        return '<div class="mb-link-body"><div class="mb-link-letter">' +
            esc(cardLetter(card.title, card.url)) + '</div>' +
            '<input class="mb-link-title" type="text" value="' + esc(card.title || '') +
            '" placeholder="链接标题" aria-label="链接标题">' +
            '<input class="mb-link-url" type="text" value="' + esc(card.url || '') +
            '" placeholder="https://…" aria-label="链接地址"></div>' + tools;
    }
    /* swatch */
    var hex = normalizeHex(card.color || '#ffffff');
    return '<div class="mb-swatch-fill" style="background:' + hex + '"></div>' +
        '<div class="mb-swatch-foot"><span class="mb-swatch-hex">' + hex + '</span>' +
        '<button type="button" data-act="copyhex" title="复制色值">复制色值</button>' +
        '<input class="mb-swatch-input" type="color" value="' + hex +
        '" aria-label="修改色板颜色"></div>' + tools;
}

function bindCardEvents(el, card) {
    el.addEventListener('pointerdown', function (ev) {
        if (ev.target.closest('button, input, textarea, .mb-resize')) return;
        selectCard(card.id);
        startDrag(ev, card, el);
    });
    el.querySelectorAll('[data-act]').forEach(function (btn) {
        btn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            cardAction(card.id, btn.getAttribute('data-act'));
        });
    });
    var resize = el.querySelector('.mb-resize');
    if (resize) {
        resize.addEventListener('pointerdown', function (ev) {
            ev.stopPropagation();
            selectCard(card.id);
            startResize(ev, card, el);
        });
    }
    if (card.type === 'note') {
        var ta = el.querySelector('.mb-note-text');
        if (ta) {
            ta.addEventListener('input', function () {
                card.text = ta.value;
                saveBoard(true);
            });
            ta.addEventListener('focus', function () { pushUndoOnce(); });
            ta.addEventListener('blur', function () { editUndoPushed = false; });
            ta.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); selectCard(card.id); });
        }
        el.querySelectorAll('.mb-note-color').forEach(function (b) {
            b.addEventListener('click', function (ev) {
                ev.stopPropagation();
                pushUndo();
                card.color = b.getAttribute('data-color');
                renderBoard();
                saveBoard(true);
            });
        });
    }
    if (card.type === 'link') {
        var title = el.querySelector('.mb-link-title');
        var url = el.querySelector('.mb-link-url');
        if (title) {
            title.addEventListener('input', function () { card.title = title.value; saveBoard(true); });
            title.addEventListener('focus', function () { pushUndoOnce(); });
            title.addEventListener('blur', function () { editUndoPushed = false; renderBoard(); });
            title.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); selectCard(card.id); });
        }
        if (url) {
            url.addEventListener('input', function () { card.url = url.value; saveBoard(true); });
            url.addEventListener('focus', function () { pushUndoOnce(); });
            url.addEventListener('blur', function () { editUndoPushed = false; renderBoard(); });
            url.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); selectCard(card.id); });
        }
    }
    if (card.type === 'swatch') {
        var input = el.querySelector('.mb-swatch-input');
        if (input) {
            input.addEventListener('input', function () {
                card.color = normalizeHex(input.value);
                var fill = el.querySelector('.mb-swatch-fill');
                var hexEl = el.querySelector('.mb-swatch-hex');
                if (fill) fill.style.background = card.color;
                if (hexEl) hexEl.textContent = card.color;
                saveBoard(true);
            });
            input.addEventListener('change', function () { editUndoPushed = false; });
            input.addEventListener('focus', function () { pushUndoOnce(); });
            input.addEventListener('blur', function () { editUndoPushed = false; });
            input.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); selectCard(card.id); });
        }
    }
}

function selectCard(id) {
    state.selectedId = id;
    renderBoard();
}

function findCard(id) {
    for (var i = 0; i < state.cards.length; i++) {
        if (state.cards[i].id === id) return state.cards[i];
    }
    return null;
}

function cardAction(id, act) {
    var card = findCard(id);
    if (!card) return;
    if (act === 'del') {
        pushUndo();
        state.cards = state.cards.filter(function (c) { return c.id !== id; });
        state.selectedId = null;
        renderBoard(); saveBoard(true); toast('已删除卡片');
    } else if (act === 'copy') {
        if (state.cards.length >= MAX_CARDS) { toast('卡片已达上限 ' + MAX_CARDS + ' 张'); return; }
        pushUndo();
        var copy = JSON.parse(JSON.stringify(card));
        copy.id = nextId();
        var pos = clampCardPosition(card.x + 24, card.y + 24, BOARD_WIDTH, BOARD_HEIGHT, copy.w, copy.h);
        copy.x = pos.x; copy.y = pos.y;
        state.cards.push(copy);
        state.selectedId = copy.id;
        renderBoard(); saveBoard(true); toast('已复制卡片');
    } else if (act === 'front') {
        pushUndo();
        state.cards = moveCardToFront(state.cards, id);
        renderBoard(); saveBoard(true);
    } else if (act === 'back') {
        pushUndo();
        state.cards = moveCardToBack(state.cards, id);
        renderBoard(); saveBoard(true);
    } else if (act === 'copyhex') {
        copyText(normalizeHex(card.color || '#ffffff'));
    }
}

function copyText(text) {
    function done() { toast('已复制 ' + text); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
}

function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
    ta.remove();
}

/* ---------- 拖拽 / 缩放 ---------- */

function startDrag(ev, card, el) {
    ev.preventDefault();
    pushUndo();
    var startX = ev.clientX, startY = ev.clientY;
    var origX = card.x, origY = card.y;
    var moved = false;
    function onMove(e) {
        var dx = (e.clientX - startX) / state.zoom;
        var dy = (e.clientY - startY) / state.zoom;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        var pos = clampCardPosition(origX + dx, origY + dy, BOARD_WIDTH, BOARD_HEIGHT, card.w, card.h);
        card.x = Math.round(pos.x); card.y = Math.round(pos.y);
        el.style.left = card.x + 'px';
        el.style.top = card.y + 'px';
    }
    function onUp() {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        if (!moved) { undoStack.pop(); refreshUndoBtn(); }
        renderBoard(); saveBoard(true);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
}

function startResize(ev, card, el) {
    ev.preventDefault();
    pushUndo();
    var startX = ev.clientX, startY = ev.clientY;
    var origW = card.w, origH = card.h;
    function onMove(e) {
        var dw = (e.clientX - startX) / state.zoom;
        var dh = (e.clientY - startY) / state.zoom;
        card.w = Math.max(80, Math.min(BOARD_WIDTH - card.x, Math.round(origW + dw)));
        card.h = Math.max(60, Math.min(BOARD_HEIGHT - card.y, Math.round(origH + dh)));
        el.style.width = card.w + 'px';
        el.style.height = card.h + 'px';
    }
    function onUp() {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        renderBoard(); saveBoard(true);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
}

/* ---------- 添加卡片 ---------- */

function cascadePos(w, h) {
    var n = state.cards.length;
    var x = 40 + (n % 5) * 36, y = 40 + (n % 5) * 28;
    var pos = clampCardPosition(x, y, BOARD_WIDTH, BOARD_HEIGHT, w, h);
    return pos;
}

function addCard(card) {
    if (state.cards.length >= MAX_CARDS) {
        toast('卡片已达上限 ' + MAX_CARDS + ' 张，请先删除再添加');
        return null;
    }
    pushUndo();
    card.id = nextId();
    state.cards.push(card);
    state.selectedId = card.id;
    renderBoard(); saveBoard(true);
    return card;
}

function addImageFiles(files) {
    var imgs = state.cards.filter(function (c) { return c.type === 'image'; }).length;
    Array.prototype.forEach.call(files, function (file) {
        if (!file.type || file.type.indexOf('image/') !== 0) {
            toast('已跳过非图片文件：' + file.name); return;
        }
        if (file.size > MAX_IMAGE_SIZE_BYTES) {
            toast('已跳过超大图片（单张 ≤2MB）：' + file.name); return;
        }
        if (imgs >= MAX_IMAGES) {
            toast('图片已达上限 ' + MAX_IMAGES + ' 张'); return;
        }
        if (state.cards.length >= MAX_CARDS) {
            toast('卡片已达上限 ' + MAX_CARDS + ' 张'); return;
        }
        var reader = new FileReader();
        reader.onload = function () {
            var pos = cascadePos(220, 160);
            addCard({ type: 'image', x: pos.x, y: pos.y, w: 220, h: 160, dataUrl: reader.result });
            imgs += 1;
            toast('已添加图片');
        };
        reader.readAsDataURL(file);
    });
}

/* ---------- PNG 导出（canvas 合成） ---------- */

function wrapText(ctx, text, maxWidth) {
    var lines = [];
    String(text || '').split('\n').forEach(function (para) {
        var line = '';
        for (var i = 0; i < para.length; i++) {
            var test = line + para.charAt(i);
            if (ctx.measureText(test).width > maxWidth && line.length > 0) {
                lines.push(line); line = para.charAt(i);
            } else { line = test; }
        }
        lines.push(line);
    });
    return lines;
}

function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function exportPNG() {
    var canvas = document.createElement('canvas');
    canvas.width = BOARD_WIDTH;
    canvas.height = BOARD_HEIGHT;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    var images = [];
    state.cards.forEach(function (card) {
        if (card.type === 'image') {
            var img = new Image();
            img.src = card.dataUrl;
            images.push({ card: card, img: img });
        }
    });
    var pending = images.map(function (it) {
        return new Promise(function (resolve) {
            if (it.img.complete && it.img.naturalWidth) { resolve(); return; }
            it.img.onload = function () { resolve(); };
            it.img.onerror = function () { resolve(); };
        });
    });
    Promise.all(pending).then(function () {
        state.cards.forEach(function (card) { drawCardToCanvas(ctx, card, images); });
        canvasToBlob(canvas).then(function (blob) {
            var name = buildExportFileName(state.name);
            downloadBlob(blob, name);
            toast('已导出 ' + name + '（仅画布内卡片）');
        }).catch(function (err) { toast('导出失败：' + err.message); });
    });
}

function drawCardToCanvas(ctx, card, images) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    ctx.clip();
    if (card.type === 'image') {
        var it = null;
        images.forEach(function (o) { if (o.card === card) it = o; });
        if (it && it.img.naturalWidth) {
            var iw = it.img.naturalWidth, ih = it.img.naturalHeight;
            var s = Math.max(card.w / iw, card.h / ih);
            var dw = iw * s, dh = ih * s;
            ctx.drawImage(it.img, card.x + (card.w - dw) / 2, card.y + (card.h - dh) / 2, dw, dh);
        } else {
            ctx.fillStyle = '#e5e7eb';
            ctx.fillRect(card.x, card.y, card.w, card.h);
        }
    } else if (card.type === 'note') {
        var color = normalizeHex(card.color || '#fef9c3');
        roundRectPath(ctx, card.x, card.y, card.w, card.h, 8);
        ctx.fillStyle = color; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.stroke();
        ctx.fillStyle = '#1f2937';
        ctx.font = '15px sans-serif';
        var lines = wrapText(ctx, card.text || '', card.w - 24);
        lines.slice(0, Math.floor((card.h - 20) / 21)).forEach(function (ln, i) {
            ctx.fillText(ln, card.x + 12, card.y + 26 + i * 21);
        });
    } else if (card.type === 'link') {
        roundRectPath(ctx, card.x, card.y, card.w, card.h, 8);
        ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.strokeStyle = '#e5e7eb'; ctx.stroke();
        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        ctx.arc(card.x + 34, card.y + 34, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(cardLetter(card.title, card.url), card.x + 34, card.y + 41);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText(String(card.title || '链接').slice(0, 18), card.x + 62, card.y + 32);
        ctx.fillStyle = '#6b7280';
        ctx.font = '13px sans-serif';
        ctx.fillText(String(card.url || '').slice(0, 30), card.x + 62, card.y + 54);
    } else if (card.type === 'swatch') {
        var hex = normalizeHex(card.color || '#ffffff');
        ctx.fillStyle = hex;
        ctx.fillRect(card.x, card.y, card.w, card.h);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillRect(card.x, card.y + card.h - 30, card.w, 30);
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(hex, card.x + 10, card.y + card.h - 10);
    }
    ctx.restore();
}

/* ---------- JSON 备份 ---------- */

function exportJSON() {
    var data = { name: state.name, cards: state.cards, exportedAt: new Date().toISOString() };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var name = buildExportFileName(state.name).replace(/\.png$/, '.json');
    downloadBlob(blob, name);
    toast('已导出 JSON 备份 ' + name);
}

function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function () {
        try {
            var data = JSON.parse(reader.result);
            validateBoardState(data);
            pushUndo();
            state.name = typeof data.name === 'string' && data.name ? data.name : state.name;
            state.cards = data.cards.map(function (c) {
                var copy = JSON.parse(JSON.stringify(c));
                copy.id = nextId();
                return copy;
            });
            state.selectedId = null;
            renderBoard(); saveBoard(true);
            toast('已导入 ' + state.cards.length + ' 张卡片');
        } catch (e) {
            toast('导入失败：' + e.message + '（请确认是本工具导出的 JSON 备份）');
        }
    };
    reader.readAsText(file);
}

/* ---------- 模板 ---------- */

function applyTemplateUI(templateId) {
    var cards;
    try { cards = applyTemplate(templateId); } catch (e) { toast(e.message); return; }
    if (templateId !== 'blank' && state.cards.length > 0) {
        if (!window.confirm('套用「' + (TEMPLATE_LABELS[templateId] || templateId) +
            '」模板会清空当前看板，确定吗？建议先导出 JSON 备份。')) return;
    }
    pushUndo();
    state.cards = cards.map(function (c) {
        var copy = JSON.parse(JSON.stringify(c));
        copy.id = nextId();
        return copy;
    });
    state.selectedId = null;
    renderBoard(); saveBoard(true);
    toast(templateId === 'blank' ? '已切换到空白看板' : '已套用「' + TEMPLATE_LABELS[templateId] + '」模板');
}

/* ---------- 初始化 ---------- */

document.addEventListener('DOMContentLoaded', function () {
    loadBoard();

    /* 模板按钮 */
    document.querySelectorAll('[data-template]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            applyTemplateUI(btn.getAttribute('data-template'));
        });
    });

    /* 添加卡片 */
    $('mb-add-note').addEventListener('click', function () {
        var pos = cascadePos(240, 150);
        addCard({ type: 'note', x: pos.x, y: pos.y, w: 240, h: 150,
            text: '写下你的灵感…', color: NOTE_COLORS[0] });
    });
    $('mb-add-link').addEventListener('click', function () {
        var pos = cascadePos(300, 110);
        addCard({ type: 'link', x: pos.x, y: pos.y, w: 300, h: 110,
            title: '新链接', url: 'https://example.com' });
    });
    $('mb-add-swatch').addEventListener('click', function () {
        var pos = cascadePos(160, 110);
        addCard({ type: 'swatch', x: pos.x, y: pos.y, w: 160, h: 110, color: '#2563eb' });
    });
    $('mb-add-image').addEventListener('click', function () { $('mb-file').click(); });
    $('mb-file').addEventListener('change', function () {
        addImageFiles(this.files);
        this.value = '';
    });

    /* 看板名 */
    $('mb-board-name').addEventListener('change', function () {
        state.name = this.value.replace(/^\s+|\s+$/g, '') || '我的灵感板';
        this.value = state.name;
        saveBoard(true);
    });

    /* 缩放与网格 */
    $('mb-zoom').addEventListener('input', function () {
        state.zoom = clampZoom(parseInt(this.value, 10) / 100);
        renderBoard(); saveBoard(true);
    });
    $('mb-zoom-out').addEventListener('click', function () {
        state.zoom = clampZoom(state.zoom - 0.1);
        renderBoard(); saveBoard(true);
    });
    $('mb-zoom-in').addEventListener('click', function () {
        state.zoom = clampZoom(state.zoom + 0.1);
        renderBoard(); saveBoard(true);
    });
    $('mb-grid-toggle').addEventListener('change', function () {
        state.showGrid = this.checked;
        renderBoard(); saveBoard(true);
    });

    /* 撤销 / 清空 */
    $('mb-undo').addEventListener('click', doUndo);
    $('mb-clear').addEventListener('click', function () {
        if (!state.cards.length) { toast('看板已经是空的'); return; }
        if (!window.confirm('确定清空整块看板吗？建议先导出 JSON 备份。')) return;
        pushUndo();
        state.cards = [];
        state.selectedId = null;
        renderBoard(); saveBoard(true);
        toast('已清空看板');
    });

    /* 导出 / 备份 */
    $('mb-export-png').addEventListener('click', exportPNG);
    $('mb-export-json').addEventListener('click', exportJSON);
    $('mb-import-json').addEventListener('click', function () { $('mb-json-file').click(); });
    $('mb-json-file').addEventListener('change', function () {
        if (this.files.length) importJSON(this.files[0]);
        this.value = '';
    });

    /* 画布空白处点击取消选中 */
    $('mb-canvas').addEventListener('pointerdown', function (ev) {
        if (ev.target === this) selectCard(null);
    });

    /* 键盘：Ctrl+Z 撤销，Delete 删除选中卡片 */
    document.addEventListener('keydown', function (ev) {
        var tag = (ev.target && ev.target.tagName) || '';
        var editing = tag === 'INPUT' || tag === 'TEXTAREA';
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && !editing) {
            ev.preventDefault();
            doUndo();
        } else if ((ev.key === 'Delete' || ev.key === 'Backspace') && !editing && state.selectedId) {
            ev.preventDefault();
            cardAction(state.selectedId, 'del');
        }
    });

    renderBoard();
    saveBoard(true);
});
})();
