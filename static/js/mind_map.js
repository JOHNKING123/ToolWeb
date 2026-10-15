/* 思维导图 - 自绘 SVG 在线编辑器（零外部 JS 依赖）
 * 功能：中心主题节点、增删改节点、折叠/展开、拖拽移动、缩放平移、
 *       导出 PNG/SVG/Markdown、localStorage 自动保存、多脑图管理
 */
(function () {
'use strict';

/* ---------------- 基础工具 ---------------- */
var $ = function (id) { return document.getElementById(id); };
function uid() { return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function sanitizeName(name) {
    return String(name || '未命名脑图').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 40) || '未命名脑图';
}
function stamp() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
}
function fmtTime(ts) {
    var d = new Date(ts), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d.getMonth() + 1) + '-' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/* ---------------- 常量 ---------------- */
var LS_KEY = 'toolweb_mindmap_v1';
var H_GAP = 70;          // 层级水平间距
var V_GAP = 22;          // 兄弟节点垂直间距
var FONT_NODE = '14px -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
var FONT_ROOT = 'bold 17px -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
var FONT_CSS = "-apple-system, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', 'Segoe UI', sans-serif";
var MAX_TEXT_W = 300;    // 节点文本最大宽度（超出截断）
var PALETTE = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];
var ROOT_COLOR = '#1d4ed8';

var measureCtx = document.createElement('canvas').getContext('2d');

/* ---------------- 数据 ---------------- */
var store = { maps: {}, currentId: null, order: [] };
var selectedId = null;
var saveTimer = null;
var saveHintTimer = null;

function newNode(text) {
    return { id: uid(), text: text || '新节点', children: [], collapsed: false };
}
function sampleRoot() {
    var root = newNode('我的思维导图');
    var a = newNode('双击我编辑文本'); a.children.push(newNode('按 Tab 添加子节点'), newNode('拖拽我换个位置'));
    var b = newNode('折叠试试我'); b.children.push(newNode('子节点 A'), newNode('子节点 B'));
    var c = newNode('导出三件套'); c.children.push(newNode('导出 PNG 图片'), newNode('导出 SVG 矢量图'), newNode('导出 Markdown 大纲'));
    var d = newNode('自动保存'); d.children.push(newNode('每秒防抖写入'), newNode('刷新页面自动恢复'));
    root.children.push(a, b, c, d);
    return root;
}
function createMap(name, root) {
    var id = uid();
    store.maps[id] = { id: id, name: name || '未命名脑图', updatedAt: Date.now(), root: root || newNode('中心主题') };
    store.order.unshift(id);
    return id;
}
function currentMap() { return store.maps[store.currentId]; }

/* ---------------- 持久化 ---------------- */
function saveNow() {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(store));
        var h = $('mm-savehint');
        if (h) {
            h.textContent = '草稿已自动保存 ' + fmtTime(Date.now());
            h.classList.add('ok');
            clearTimeout(saveHintTimer);
            saveHintTimer = setTimeout(function () { h.classList.remove('ok'); }, 2500);
        }
    } catch (e) { /* 存储满或禁用则忽略 */ }
}
function scheduleSave() {
    var m = currentMap();
    if (m) m.updatedAt = Date.now();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 1000);
}
function loadStore() {
    try {
        var raw = localStorage.getItem(LS_KEY);
        if (raw) {
            var s = JSON.parse(raw);
            if (s && s.maps && Object.keys(s.maps).length && s.maps[s.currentId]) {
                store = s;
                if (!Array.isArray(store.order)) store.order = Object.keys(store.maps);
                return;
            }
        }
    } catch (e) { /* 损坏则重建 */ }
    var id = createMap('我的第一个脑图', sampleRoot());
    store.currentId = id;
}

/* ---------------- 树操作 ---------------- */
function findNode(id, node, parent) {
    node = node || currentMap().root;
    if (node.id === id) return { node: node, parent: parent || null };
    for (var i = 0; i < node.children.length; i++) {
        var r = findNode(id, node.children[i], node);
        if (r) return r;
    }
    return null;
}
function isDescendant(anc, id) {
    if (anc.id === id) return true;
    for (var i = 0; i < anc.children.length; i++) {
        if (isDescendant(anc.children[i], id)) return true;
    }
    return false;
}
function removeNode(id) {
    var r = findNode(id);
    if (!r || !r.parent) return false; // 根节点不可删
    var idx = r.parent.children.indexOf(r.node);
    if (idx >= 0) r.parent.children.splice(idx, 1);
    return true;
}
function setCollapsedAll(node, v) {
    node.collapsed = v;
    node.children.forEach(function (c) { setCollapsedAll(c, v); });
}

/* ---------------- 布局 ---------------- */
function measureNode(node, depth) {
    var font = depth === 0 ? FONT_ROOT : FONT_NODE;
    measureCtx.font = font;
    var t = (node.text || '').trim() || '未命名';
    var w = measureCtx.measureText(t).width;
    if (w > MAX_TEXT_W) w = MAX_TEXT_W;
    node._tw = w;
    node._w = w + (depth === 0 ? 44 : 32);
    node._h = depth === 0 ? 44 : 32;
    node._font = font;
}
function layoutTree() {
    var root = currentMap().root;
    // 深度 & 着色
    (function mark(node, depth, colorIdx) {
        node.depth = depth;
        node._color = depth === 0 ? ROOT_COLOR : PALETTE[colorIdx % PALETTE.length];
        measureNode(node, depth);
        var vis = node.collapsed ? [] : node.children;
        if (depth === 0) {
            var half = Math.ceil(vis.length / 2);
            vis.forEach(function (c, i) { mark(c, 1, i < half ? i : i - half); });
        } else {
            vis.forEach(function (c) { mark(c, depth + 1, colorIdx); });
        }
    })(root, 0, 0);

    // 递归布局：node._x/_y 为中心坐标，side: 1 右 / -1 左
    function place(node, cx, cy, side) {
        node._x = cx; node._y = cy;
        var vis = node.collapsed ? [] : node.children;
        if (!vis.length) { node._subH = node._h; return; }
        var groups;
        if (node.depth === 0) {
            var half = Math.ceil(vis.length / 2);
            groups = [{ list: vis.slice(0, half), side: 1 }, { list: vis.slice(half), side: -1 }];
        } else {
            groups = [{ list: vis, side: side }];
        }
        groups.forEach(function (g) {
            g.list.forEach(function (c) { place(c, 0, 0, g.side); });
            var total = 0;
            g.list.forEach(function (c) { total += c._subH; });
            total += V_GAP * (g.list.length - 1);
            var cur = cy - total / 2;
            g.list.forEach(function (c) {
                var childCy = cur + c._subH / 2;
                moveSubtree(c, cx + g.side * (node._w / 2 + H_GAP + c._w / 2), childCy);
                cur += c._subH + V_GAP;
            });
        });
        var h = node._h;
        groups.forEach(function (g) {
            var total = 0;
            g.list.forEach(function (c) { total += c._subH; });
            total += V_GAP * (g.list.length - 1);
            if (total > h) h = total;
        });
        node._subH = h;
    }
    // 子树整体平移（place 递归先以 (0,0) 为中心排好，再整体搬到父节点旁）
    function moveSubtree(node, newX, newY) {
        var dx = newX - node._x, dy = newY - node._y;
        (function walk(n) {
            n._x += dx; n._y += dy;
            (n.collapsed ? [] : n.children).forEach(walk);
        })(node);
    }
    place(root, 0, 0, 1);
    return root;
}
function contentBBox(pad) {
    pad = pad == null ? 60 : pad;
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    (function walk(node) {
        minX = Math.min(minX, node._x - node._w / 2); maxX = Math.max(maxX, node._x + node._w / 2);
        minY = Math.min(minY, node._y - node._h / 2); maxY = Math.max(maxY, node._y + node._h / 2);
        (node.collapsed ? [] : node.children).forEach(walk);
    })(currentMap().root);
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

/* ---------------- 渲染 ---------------- */
var svg, wrap;
var vb = { x: 0, y: 0, w: 800, h: 560 }; // viewBox
var dragState = null;

function visibleNodes() {
    var arr = [];
    (function walk(node) {
        arr.push(node);
        (node.collapsed ? [] : node.children).forEach(walk);
    })(currentMap().root);
    return arr;
}

function renderMarkup(forExport) {
    var parts = [];
    var root = currentMap().root;
    // 连线
    (function edges(node) {
        var vis = node.collapsed ? [] : node.children;
        vis.forEach(function (c) {
            var side = c._x >= node._x ? 1 : -1;
            var x1 = node._x + side * node._w / 2, y1 = node._y;
            var x2 = c._x - side * c._w / 2, y2 = c._y;
            var mx = (x1 + x2) / 2;
            parts.push('<path d="M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2 +
                '" fill="none" stroke="' + c._color + '" stroke-width="' + (node.depth === 0 ? 3 : 2) +
                '" stroke-linecap="round" opacity="0.75"/>');
            edges(c);
        });
    })(root);
    // 节点
    visibleNodes().forEach(function (node) {
        var x = node._x - node._w / 2, y = node._y - node._h / 2;
        var sel = node.id === selectedId;
        var fill, stroke, textColor, sw;
        if (node.depth === 0) { fill = node._color; stroke = node._color; textColor = '#fff'; sw = 0; }
        else if (node.depth === 1) { fill = '#fff'; stroke = node._color; textColor = '#1f2937'; sw = 2.5; }
        else { fill = '#fff'; stroke = '#cbd5e1'; textColor = '#1f2937'; sw = 1.5; }
        if (sel) { stroke = '#f59e0b'; sw = Math.max(sw, 3); }
        var label = esc((node.text || '').trim() || '未命名');
        parts.push('<g class="mm-node" data-id="' + node.id + '" style="cursor:pointer">');
        parts.push('<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + node._w.toFixed(1) +
            '" height="' + node._h.toFixed(1) + '" rx="' + (node.depth === 0 ? 22 : 10) +
            '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>');
        if (node.depth === 1) {
            parts.push('<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="5" height="' + node._h.toFixed(1) +
                '" rx="2.5" fill="' + node._color + '"/>');
        }
        parts.push('<text x="' + node._x.toFixed(1) + '" y="' + node._y.toFixed(1) + '" dy="0.35em" text-anchor="middle"' +
            ' font-family="' + FONT_CSS + '" font-size="' + (node.depth === 0 ? 17 : 14) + '"' +
            (node.depth === 0 ? ' font-weight="bold"' : '') + ' fill="' + textColor + '">' + label + '</text>');
        // 折叠徽标
        if (node.children.length && !forExport) {
            var bx = node._x + (node.depth === 0 ? 0 : (node._x >= root._x ? node._w / 2 : -node._w / 2));
            var by = node._y + node._h / 2;
            parts.push('<g class="mm-badge" data-id="' + node.id + '" style="cursor:pointer">' +
                '<circle cx="' + bx.toFixed(1) + '" cy="' + by.toFixed(1) + '" r="10" fill="#fff" stroke="' + node._color + '" stroke-width="2"/>' +
                '<text x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" dy="0.35em" text-anchor="middle" font-size="14" font-weight="bold" fill="' + node._color + '" font-family="' + FONT_CSS + '">' +
                (node.collapsed ? '+' : '−') + '</text></g>');
        } else if (node.children.length && node.collapsed && forExport) {
            // 导出时折叠节点也给个小标记
            parts.push('<circle cx="' + (node._x + node._w / 2 - 6).toFixed(1) + '" cy="' + (node._y - node._h / 2 + 6).toFixed(1) + '" r="7" fill="' + node._color + '"/>' +
                '<text x="' + (node._x + node._w / 2 - 6).toFixed(1) + '" y="' + (node._y - node._h / 2 + 6).toFixed(1) + '" dy="0.35em" text-anchor="middle" font-size="10" font-weight="bold" fill="#fff" font-family="' + FONT_CSS + '">+</text>');
        }
        parts.push('</g>');
    });
    return parts.join('');
}

function applyViewBox() {
    svg.setAttribute('viewBox', vb.x + ' ' + vb.y + ' ' + vb.w + ' ' + vb.h);
}
function render() {
    layoutTree();
    svg.innerHTML = renderMarkup(false);
    applyViewBox();
    hideEditor();
}
function fitView() {
    var box = contentBBox(70);
    var r = wrap.getBoundingClientRect();
    var aspect = r.width / r.height;
    var w = box.w, h = box.h;
    if (w / h > aspect) h = w / aspect; else w = h * aspect;
    vb = { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w: w, h: h };
    applyViewBox();
}
function svgPoint(clientX, clientY) {
    var r = svg.getBoundingClientRect();
    return { x: vb.x + (clientX - r.left) / r.width * vb.w, y: vb.y + (clientY - r.top) / r.height * vb.h };
}
function nodeAtPoint(p, excludeId, excludeDescOf) {
    var nodes = visibleNodes();
    for (var i = nodes.length - 1; i >= 0; i--) {
        var n = nodes[i];
        if (n.id === excludeId) continue;
        if (excludeDescOf && isDescendant(excludeDescOf, n.id)) continue;
        if (Math.abs(p.x - n._x) <= n._w / 2 + 6 && Math.abs(p.y - n._y) <= n._h / 2 + 6) return n;
    }
    return null;
}

/* ---------------- 文本编辑 ---------------- */
var editor, editorInput, editingId = null;
function showEditor(node) {
    editingId = node.id;
    var r = svg.getBoundingClientRect();
    var sx = r.width / vb.w, sy = r.height / vb.h;
    editor.style.display = 'block';
    editor.style.left = ((node._x - node._w / 2 - vb.x) * sx - 8) + 'px';
    editor.style.top = ((node._y - node._h / 2 - vb.y) * sy - 6) + 'px';
    editorInput.style.width = (node._w * sx + 16) + 'px';
    editorInput.style.height = (node._h * sy + 12) + 'px';
    editorInput.style.fontSize = Math.max(12, 14 * sx) + 'px';
    editorInput.value = node.text || '';
    editorInput.focus();
    editorInput.select();
}
function hideEditor() {
    if (editor) editor.style.display = 'none';
    editingId = null;
}
function commitEditor() {
    if (!editingId) return;
    var r = findNode(editingId);
    var v = editorInput.value.trim();
    if (r && v) { r.node.text = v.slice(0, 120); scheduleSave(); }
    hideEditor();
    render();
}

/* ---------------- 交互 ---------------- */
function bindEvents() {
    svg.addEventListener('mousedown', function (e) {
        if (editingId) commitEditor();
        var badge = e.target.closest ? e.target.closest('.mm-badge') : null;
        if (badge) {
            var bn = findNode(badge.getAttribute('data-id'));
            if (bn) { bn.node.collapsed = !bn.node.collapsed; scheduleSave(); render(); }
            e.stopPropagation();
            return;
        }
        var g = e.target.closest ? e.target.closest('.mm-node') : null;
        if (g) {
            var id = g.getAttribute('data-id');
            var p = svgPoint(e.clientX, e.clientY);
            dragState = { mode: 'maybe-node', id: id, startX: e.clientX, startY: e.clientY, p0: p, target: null };
        } else {
            selectedId = null;
            dragState = { mode: 'pan', startX: e.clientX, startY: e.clientY, vb0: { x: vb.x, y: vb.y } };
        }
        e.preventDefault();
    });
    svg.addEventListener('mousemove', function (e) {
        if (!dragState) return;
        var dx = e.clientX - dragState.startX, dy = e.clientY - dragState.startY;
        if (dragState.mode === 'maybe-node') {
            if (Math.abs(dx) + Math.abs(dy) > 6) {
                dragState.mode = 'drag-node';
                var r0 = findNode(dragState.id);
                dragState.node = r0 ? r0.node : null;
            }
            return;
        }
        if (dragState.mode === 'drag-node' && dragState.node) {
            var p = svgPoint(e.clientX, e.clientY);
            var t = nodeAtPoint(p, dragState.id, dragState.node);
            if (dragState.target && (!t || t.id !== dragState.target.id)) {
                dragState.target = null; render(); selectedId = dragState.id; paintDragState();
            }
            if (t && (!dragState.target || t.id !== dragState.target.id)) {
                dragState.target = t; render(); paintDragState();
            }
            return;
        }
        if (dragState.mode === 'pan') {
            var r = svg.getBoundingClientRect();
            vb.x = dragState.vb0.x - dx / r.width * vb.w;
            vb.y = dragState.vb0.y - dy / r.height * vb.h;
            applyViewBox();
            hideEditor();
        }
    });
    document.addEventListener('mouseup', function () {
        if (!dragState) return;
        if (dragState.mode === 'drag-node' && dragState.node && dragState.target) {
            var moving = dragState.node, target = dragState.target;
            if (removeNode(moving.id)) {
                target.children.push(moving);
                target.collapsed = false;
                selectedId = moving.id;
                scheduleSave();
            }
        } else if (dragState.mode === 'maybe-node') {
            selectedId = dragState.id;
        }
        dragState = null;
        render();
    });
    svg.addEventListener('dblclick', function (e) {
        var g = e.target.closest ? e.target.closest('.mm-node') : null;
        if (g && !e.target.closest('.mm-badge')) {
            var r = findNode(g.getAttribute('data-id'));
            if (r) { selectedId = r.node.id; render(); showEditor(r.node); }
        }
    });
    svg.addEventListener('wheel', function (e) {
        e.preventDefault();
        var factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
        zoomAt(e.clientX, e.clientY, factor);
    }, { passive: false });

    editorInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); commitEditor(); }
        else if (e.key === 'Escape') { hideEditor(); render(); }
        e.stopPropagation();
    });
    editorInput.addEventListener('blur', commitEditor);

    document.addEventListener('keydown', function (e) {
        var tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
        if (e.key === 'Tab') { e.preventDefault(); addChild(); }
        else if (e.key === 'Enter') { e.preventDefault(); addSibling(); }
        else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) { e.preventDefault(); deleteSelected(); }
        else if (e.key === 'Escape') { selectedId = null; render(); }
        else if ((e.key === '+' || e.key === '=') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); zoomStep(1 / 1.2); }
        else if (e.key === '-' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); zoomStep(1.2); }
        else if (e.key === '0' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); fitView(); }
    });
    window.addEventListener('resize', function () { fitView(); });
}
function paintDragState() {
    if (!dragState || !dragState.target) return;
    var t = dragState.target;
    var x = t._x - t._w / 2, y = t._y - t._h / 2;
    var hl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    hl.setAttribute('x', x - 6); hl.setAttribute('y', y - 6);
    hl.setAttribute('width', t._w + 12); hl.setAttribute('height', t._h + 12);
    hl.setAttribute('rx', 14); hl.setAttribute('fill', 'none');
    hl.setAttribute('stroke', '#f59e0b'); hl.setAttribute('stroke-width', '3');
    hl.setAttribute('stroke-dasharray', '8 5');
    hl.setAttribute('pointer-events', 'none');
    svg.appendChild(hl);
}
function zoomAt(clientX, clientY, factor) {
    var p = svgPoint(clientX, clientY);
    var nw = vb.w * factor, nh = vb.h * factor;
    if (nw < 120 || nw > 20000) return;
    var rx = (p.x - vb.x) / vb.w, ry = (p.y - vb.y) / vb.h;
    vb.x = p.x - rx * nw; vb.y = p.y - ry * nh; vb.w = nw; vb.h = nh;
    applyViewBox();
    hideEditor();
}
function zoomStep(factor) {
    var r = svg.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
}

/* ---------------- 节点操作 ---------------- */
function ensureSelected() {
    if (!selectedId) {
        toast('请先点击选中一个节点');
        return null;
    }
    var r = findNode(selectedId);
    if (!r) { selectedId = null; return null; }
    return r;
}
function addChild() {
    var r = ensureSelected() || { node: currentMap().root, parent: null };
    var n = newNode('新节点');
    r.node.children.push(n);
    r.node.collapsed = false;
    selectedId = n.id;
    scheduleSave(); render();
    var fr = findNode(n.id);
    if (fr) showEditor(fr.node);
}
function addSibling() {
    var r = ensureSelected();
    if (!r) return;
    if (!r.parent) { addChild(); return; } // 根节点：退化为添加子节点
    var n = newNode('新节点');
    var idx = r.parent.children.indexOf(r.node);
    r.parent.children.splice(idx + 1, 0, n);
    selectedId = n.id;
    scheduleSave(); render();
    var fr = findNode(n.id);
    if (fr) showEditor(fr.node);
}
function deleteSelected() {
    var r = ensureSelected();
    if (!r) return;
    if (!r.parent) { toast('根节点不能删除'); return; }
    if (!confirm('确定删除节点「' + (r.node.text || '未命名') + '」及其所有子节点吗？')) return;
    selectedId = r.parent.id;
    removeNode(r.node.id);
    scheduleSave(); render();
}
function toast(msg) {
    var t = $('mm-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._tm);
    t._tm = setTimeout(function () { t.classList.remove('show'); }, 1800);
}

/* ---------------- 导出 ---------------- */
function fileName(ext) {
    var m = currentMap();
    return 'mindmap-' + sanitizeName(m.name) + '-' + stamp() + '.' + ext;
}
function download(url, name) {
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); }, 100);
}
function standaloneSVG() {
    layoutTree();
    var box = contentBBox(50);
    var inner = renderMarkup(true);
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.round(box.w) + '" height="' + Math.round(box.h) +
        '" viewBox="' + box.x + ' ' + box.y + ' ' + box.w + ' ' + box.h + '">' +
        '<rect x="' + box.x + '" y="' + box.y + '" width="' + box.w + '" height="' + box.h + '" fill="#ffffff"/>' +
        inner + '</svg>';
}
function exportSVG() {
    var blob = new Blob([standaloneSVG()], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    download(url, fileName('svg'));
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    toast('SVG 已导出');
}
function exportPNG() {
    layoutTree();
    var box = contentBBox(50);
    var scale = 2;
    var svgText = standaloneSVG();
    var blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function () {
        try {
            var c = document.createElement('canvas');
            c.width = Math.round(box.w * scale); c.height = Math.round(box.h * scale);
            var ctx = c.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.drawImage(img, 0, 0, c.width, c.height);
            download(c.toDataURL('image/png'), fileName('png'));
            toast('PNG 已导出（含全部可见节点）');
        } catch (e) {
            toast('PNG 导出失败：' + e.message);
        }
        URL.revokeObjectURL(url);
    };
    img.onerror = function () {
        URL.revokeObjectURL(url);
        toast('PNG 导出失败：SVG 渲染异常');
    };
    img.src = url;
}
function toMarkdown() {
    var lines = [];
    (function walk(node, depth) {
        var t = (node.text || '').trim() || '未命名';
        lines.push(new Array(depth + 1).join('  ') + '- ' + t + (node.collapsed && node.children.length ? '（已折叠 ' + node.children.length + ' 个子节点）' : ''));
        node.children.forEach(function (c) { walk(c, depth + 1); });
    })(currentMap().root, 0);
    return '# ' + sanitizeName(currentMap().name) + '\n\n' + lines.join('\n') + '\n';
}
function exportMD() {
    var blob = new Blob([toMarkdown()], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    download(url, fileName('md'));
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    toast('Markdown 大纲已导出');
}

/* ---------------- 多脑图管理 ---------------- */
function renderMapList() {
    var ul = $('mm-list');
    ul.innerHTML = '';
    store.order.forEach(function (id) {
        var m = store.maps[id];
        if (!m) return;
        var li = document.createElement('li');
        li.className = 'mm-map-item' + (id === store.currentId ? ' active' : '');
        var left = document.createElement('button');
        left.type = 'button';
        left.className = 'mm-map-main';
        left.title = '切换到该脑图';
        var nm = document.createElement('span');
        nm.className = 'mm-map-name';
        nm.textContent = m.name;
        var tm = document.createElement('span');
        tm.className = 'mm-map-time';
        tm.textContent = fmtTime(m.updatedAt);
        left.appendChild(nm); left.appendChild(tm);
        left.addEventListener('click', function () { switchMap(id); });
        var ops = document.createElement('span');
        ops.className = 'mm-map-ops';
        var rn = document.createElement('button');
        rn.type = 'button'; rn.className = 'mm-icon-btn'; rn.title = '重命名';
        rn.innerHTML = '<i class="material-icons">edit</i>';
        rn.addEventListener('click', function (e) { e.stopPropagation(); renameMap(id); });
        var del = document.createElement('button');
        del.type = 'button'; del.className = 'mm-icon-btn danger'; del.title = '删除';
        del.innerHTML = '<i class="material-icons">delete</i>';
        del.addEventListener('click', function (e) { e.stopPropagation(); deleteMap(id); });
        ops.appendChild(rn); ops.appendChild(del);
        li.appendChild(left); li.appendChild(ops);
        ul.appendChild(li);
    });
}
function switchMap(id) {
    if (!store.maps[id] || id === store.currentId) return;
    if (editingId) commitEditor();
    store.currentId = id;
    selectedId = null;
    scheduleSave();
    renderMapList();
    render();
    fitView();
    updateTitle();
}
function newMap() {
    if (editingId) commitEditor();
    var name = prompt('新脑图名称：', '未命名脑图');
    if (name === null) return;
    var id = createMap(sanitizeName(name));
    store.currentId = id;
    selectedId = null;
    scheduleSave();
    renderMapList(); render(); fitView(); updateTitle();
}
function renameMap(id) {
    var m = store.maps[id];
    if (!m) return;
    var name = prompt('重命名脑图：', m.name);
    if (name === null) return;
    m.name = sanitizeName(name);
    scheduleSave(); renderMapList(); updateTitle();
}
function deleteMap(id) {
    if (store.order.length <= 1) { toast('至少保留一个脑图'); return; }
    var m = store.maps[id];
    if (!m) return;
    if (!confirm('确定删除脑图「' + m.name + '」吗？此操作不可恢复。')) return;
    delete store.maps[id];
    store.order = store.order.filter(function (x) { return x !== id; });
    if (store.currentId === id) {
        store.currentId = store.order[0];
        selectedId = null;
        render(); fitView(); updateTitle();
    }
    scheduleSave(); renderMapList();
}
function updateTitle() {
    var m = currentMap();
    var el = $('mm-current-name');
    if (el && m) el.textContent = m.name;
    var cap = $('mm-canvas-title');
    if (cap && m) cap.textContent = m.name;
}

/* ---------------- 启动 ---------------- */
document.addEventListener('DOMContentLoaded', function () {
    svg = $('mm-svg');
    wrap = $('mm-canvas-wrap');
    editor = $('mm-editor');
    editorInput = $('mm-input');

    loadStore();
    bindEvents();
    renderMapList();
    render();
    fitView();
    updateTitle();

    $('mm-add-child').addEventListener('click', addChild);
    $('mm-add-sibling').addEventListener('click', addSibling);
    $('mm-delete').addEventListener('click', deleteSelected);
    $('mm-collapse-all').addEventListener('click', function () { setCollapsedAll(currentMap().root, true); scheduleSave(); render(); });
    $('mm-expand-all').addEventListener('click', function () { setCollapsedAll(currentMap().root, false); scheduleSave(); render(); });
    $('mm-zoom-in').addEventListener('click', function () { zoomStep(1 / 1.25); });
    $('mm-zoom-out').addEventListener('click', function () { zoomStep(1.25); });
    $('mm-zoom-fit').addEventListener('click', fitView);
    $('mm-export-png').addEventListener('click', exportPNG);
    $('mm-export-svg').addEventListener('click', exportSVG);
    $('mm-export-md').addEventListener('click', exportMD);
    $('mm-new-map').addEventListener('click', newMap);
    var renameBtn = $('mm-rename-map');
    if (renameBtn) renameBtn.addEventListener('click', function () { renameMap(store.currentId); });
});
})();
