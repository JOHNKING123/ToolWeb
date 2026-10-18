/* CSS 渐变生成器 - 纯前端渐变引擎 / 预设 / 随机和谐配色
 * 零第三方依赖，不向服务器发任何请求。 */
(function () {
'use strict';

/* ---------- 通用工具 ---------- */
function $(id) { return document.getElementById(id); }

function toast(msg) {
    var el = document.createElement('div');
    el.className = 'cg-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) document.body.removeChild(el); }, 1600);
}

function copyText(t, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(
            function () { toast(okMsg || '已复制'); },
            function () { fallbackCopy(t, okMsg); });
    } else {
        fallbackCopy(t, okMsg);
    }
}
function fallbackCopy(t, okMsg) {
    var ta = document.createElement('textarea');
    ta.value = t;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast(okMsg || '已复制'); }
    catch (e) { toast('复制失败，请手动复制'); }
    document.body.removeChild(ta);
}

/* ---------- 颜色换算 ---------- */
function hexToRgb(hex) {
    var h = String(hex).replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(h)) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex(r, g, b) {
    function p(n) { var s = Math.round(n).toString(16); return s.length === 1 ? '0' + s : s; }
    return '#' + p(r) + p(g) + p(b);
}
function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
    var c = (1 - Math.abs(2 * l - 1)) * s;
    var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    var m = l - c / 2, r, g, b;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
function rgbaStr(stop) {
    var rgb = hexToRgb(stop.color) || [0, 0, 0];
    var a = Math.round(stop.alpha) / 100;
    return 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + (Math.round(a * 100) / 100) + ')';
}

/* ---------- 状态 ---------- */
var RADIAL_POS = [
    { v: 'center', label: 'center 中央' },
    { v: 'top', label: 'top 顶部' },
    { v: 'bottom', label: 'bottom 底部' },
    { v: 'left', label: 'left 左侧' },
    { v: 'right', label: 'right 右侧' },
    { v: 'top left', label: 'top left 左上' },
    { v: 'top right', label: 'top right 右上' },
    { v: 'bottom left', label: 'bottom left 左下' },
    { v: 'bottom right', label: 'bottom right 右下' },
    { v: 'custom', label: '自定义…' }
];

var state = {
    type: 'linear',
    angle: 135,
    radialShape: 'ellipse',
    radialPos: 'center',
    radialX: 50,
    radialY: 50,
    conicFrom: 0,
    conicPos: 'center',
    stops: [
        { color: '#ff6b6b', alpha: 100, pos: 0 },
        { color: '#4ecdc4', alpha: 100, pos: 100 }
    ],
    selected: 0
};

/* ---------- CSS 构建 ---------- */
function sortedStops() {
    return state.stops.slice().sort(function (a, b) { return a.pos - b.pos; });
}
function stopsCss() {
    return sortedStops().map(function (s) { return rgbaStr(s) + ' ' + Math.round(s.pos) + '%'; }).join(', ');
}
function gradientFn(withPrefix) {
    var p = withPrefix ? '-webkit-' : '';
    var body = stopsCss();
    if (state.type === 'linear') return p + 'linear-gradient(' + Math.round(state.angle) + 'deg, ' + body + ')';
    if (state.type === 'radial') {
        var pos = state.radialPos === 'custom'
            ? Math.round(state.radialX) + '% ' + Math.round(state.radialY) + '%'
            : state.radialPos;
        return p + 'radial-gradient(' + state.radialShape + ' at ' + pos + ', ' + body + ')';
    }
    var cpos = state.conicPos === 'custom'
        ? Math.round(state.radialX) + '% ' + Math.round(state.radialY) + '%'
        : state.conicPos;
    return p + 'conic-gradient(from ' + Math.round(state.conicFrom) + 'deg at ' + cpos + ', ' + body + ')';
}
function buildCss(includeWebkit) {
    var lines = ['background: ' + gradientFn(false) + ';'];
    if (includeWebkit) lines.unshift('background: ' + gradientFn(true) + ';');
    return lines.join('\n');
}

/* ---------- 渲染 ---------- */
/* 棋盘格底纹：与模板 .cg-checker 同图案。渐变叠在棋盘格上层，色标透明时
 * 透明区域显示棋盘格而非纯白（background 简写会覆盖类背景，必须逐项设置）。 */
var CHECKER_TILE = 'linear-gradient(45deg,#d1d5db 25%,transparent 25%,transparent 75%,#d1d5db 75%)';
function applyLayeredBg(el, css) {
    el.style.backgroundImage = css + ',' + CHECKER_TILE + ',' + CHECKER_TILE;
    el.style.backgroundSize = 'auto auto,16px 16px,16px 16px';
    el.style.backgroundPosition = '0 0,0 0,8px 8px';
    el.style.backgroundColor = '#fff';
}
function render() {
    var css = gradientFn(false);
    applyLayeredBg($('cg-bar'), css);
    applyLayeredBg($('cg-preview'), css);
    $('cg-sample-btn').style.background = css;
    $('cg-sample-hero').style.background = css;
    $('cg-code').textContent = buildCss($('cg-webkit').checked);
    renderStops();
    syncEditor();
}
function renderStops() {
    var bar = $('cg-bar');
    var olds = bar.querySelectorAll('.cg-stop');
    for (var i = 0; i < olds.length; i++) bar.removeChild(olds[i]);
    state.stops.forEach(function (s, i) {
        var h = document.createElement('div');
        h.className = 'cg-stop' + (i === state.selected ? ' selected' : '');
        h.style.left = s.pos + '%';
        h.style.background = s.color;
        h.title = s.color + ' ' + Math.round(s.pos) + '%';
        h.dataset.idx = i;
        bar.appendChild(h);
    });
}
function syncEditor() {
    var s = state.stops[state.selected];
    if (!s) return;
    $('cg-color').value = s.color;
    $('cg-hex').value = s.color.toUpperCase();
    $('cg-alpha').value = s.alpha;
    $('cg-alpha-val').textContent = Math.round(s.alpha) + '%';
    $('cg-pos').value = s.pos;
    $('cg-pos-val').textContent = Math.round(s.pos) + '%';
    $('cg-remove-stop').disabled = state.stops.length <= 2;
    $('cg-remove-stop').style.opacity = state.stops.length <= 2 ? '.45' : '1';
}

/* ---------- 渐变条交互 ---------- */
function barPosFromEvent(e, bar) {
    var rect = bar.getBoundingClientRect();
    var x = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
    var p = (x - rect.left) / rect.width * 100;
    return Math.max(0, Math.min(100, p));
}
/* 双击空白处会触发两次 pointerdown：300ms 内同位置重复点击只加一个色标 */
var lastAddTime = 0, lastAddPos = -1;
function addStopAt(pos) {
    var now = Date.now();
    if (now - lastAddTime < 300 && Math.abs(pos - lastAddPos) < 2) return;
    lastAddTime = now;
    lastAddPos = pos;    state.stops.push({ color: state.stops[state.selected].color, alpha: state.stops[state.selected].alpha, pos: pos });
    state.selected = state.stops.length - 1;
    render();
}
function bindBar() {
    var bar = $('cg-bar');
    var dragIdx = -1;

    bar.addEventListener('pointerdown', function (e) {
        var t = e.target;
        if (t.classList && t.classList.contains('cg-stop')) {
            dragIdx = parseInt(t.dataset.idx, 10);
            state.selected = dragIdx;
            /* 捕获设在常驻的 bar 上：render() 会重建 .cg-stop 元素，旧元素上的
             * 捕获会被隐式释放，导致条外松开鼠标后 dragIdx 卡死 */
            bar.setPointerCapture(e.pointerId);
            render();
        } else {
            addStopAt(barPosFromEvent(e, bar));
        }
    });
    bar.addEventListener('pointermove', function (e) {
        if (dragIdx < 0) return;
        state.stops[dragIdx].pos = barPosFromEvent(e, bar);
        render();
    });
    function endDrag() { dragIdx = -1; }
    bar.addEventListener('pointerup', endDrag);
    bar.addEventListener('pointercancel', endDrag);
    bar.addEventListener('dblclick', function (e) {
        var t = e.target;
        if (t.classList && t.classList.contains('cg-stop') && state.stops.length > 2) {
            var i = parseInt(t.dataset.idx, 10);
            state.stops.splice(i, 1);
            state.selected = Math.min(state.selected, state.stops.length - 1);
            render();
        }
    });
}

/* ---------- 编辑器绑定 ---------- */
function bindEditor() {
    $('cg-color').addEventListener('input', function () {
        var s = state.stops[state.selected]; if (!s) return;
        s.color = $('cg-color').value.toLowerCase();
        render();
    });
    $('cg-hex').addEventListener('change', function () {
        var s = state.stops[state.selected]; if (!s) return;
        var v = $('cg-hex').value.trim();
        if (v && v[0] !== '#') v = '#' + v;
        var rgb = hexToRgb(v);
        if (rgb) { s.color = rgbToHex(rgb[0], rgb[1], rgb[2]); render(); }
        else { toast('HEX 格式无效，应为 #RRGGBB'); render(); }
    });
    $('cg-alpha').addEventListener('input', function () {
        var s = state.stops[state.selected]; if (!s) return;
        s.alpha = parseInt($('cg-alpha').value, 10);
        render();
    });
    $('cg-pos').addEventListener('input', function () {
        var s = state.stops[state.selected]; if (!s) return;
        s.pos = parseInt($('cg-pos').value, 10);
        render();
    });
    $('cg-remove-stop').addEventListener('click', function () {
        if (state.stops.length <= 2) { toast('至少保留 2 个色标'); return; }
        state.stops.splice(state.selected, 1);
        state.selected = Math.min(state.selected, state.stops.length - 1);
        render();
    });
}

/* ---------- 类型参数绑定 ---------- */
function bindTypes() {
    var tabs = document.querySelectorAll('#cg-type-tabs .cg-type-tab');
    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            tabs.forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');
            state.type = tab.dataset.type;
            $('cg-params-linear').style.display = state.type === 'linear' ? '' : 'none';
            $('cg-params-radial').style.display = state.type === 'radial' ? '' : 'none';
            $('cg-params-conic').style.display = state.type === 'conic' ? '' : 'none';
            render();
        });
    });
    $('cg-angle').addEventListener('input', function () {
        state.angle = parseInt(this.value, 10);
        $('cg-angle-val').textContent = state.angle + '°';
        render();
    });
    $('cg-radial-shape').addEventListener('change', function () {
        state.radialShape = this.value;
        render();
    });
    $('cg-radial-pos').addEventListener('change', function () {
        state.radialPos = this.value;
        $('cg-radial-xy').style.display = state.radialPos === 'custom' ? '' : 'none';
        render();
    });
    $('cg-radial-x').addEventListener('input', function () {
        state.radialX = parseInt(this.value, 10);
        $('cg-radial-x-val').textContent = state.radialX + '%';
        render();
    });
    $('cg-radial-y').addEventListener('input', function () {
        state.radialY = parseInt(this.value, 10);
        $('cg-radial-y-val').textContent = state.radialY + '%';
        render();
    });
    $('cg-conic-from').addEventListener('input', function () {
        state.conicFrom = parseInt(this.value, 10);
        $('cg-conic-from-val').textContent = state.conicFrom + '°';
        render();
    });
    $('cg-conic-pos').addEventListener('change', function () {
        state.conicPos = this.value;
        render();
    });
    $('cg-webkit').addEventListener('change', render);
}

function fillPosSelect(sel, includeCustom) {
    RADIAL_POS.forEach(function (o) {
        if (!includeCustom && o.v === 'custom') return;
        var opt = document.createElement('option');
        opt.value = o.v;
        opt.textContent = o.label;
        sel.appendChild(opt);
    });
}

/* ---------- 输出与随机配色 ---------- */
function bindActions() {
    $('cg-copy').addEventListener('click', function () {
        copyText(buildCss($('cg-webkit').checked), 'CSS 已复制，粘贴即用');
    });
    /* 样例按钮「点 击 复 制」：文案即功能，点击复制当前渐变的 CSS */
    $('cg-sample-btn').addEventListener('click', function () {
        copyText(buildCss($('cg-webkit').checked), 'CSS 已复制，粘贴即用');
    });
    $('cg-random').addEventListener('click', randomPalette);
}
function randomPalette() {
    var mode = Math.floor(Math.random() * 4); // 0 类似色 1 互补 2 三原色 3 单色
    var h = Math.floor(Math.random() * 360);
    var s = 60 + Math.floor(Math.random() * 30);
    var l = 45 + Math.floor(Math.random() * 20);
    var hues;
    if (mode === 0) hues = [h, h + 35, h + 70];
    else if (mode === 1) hues = [h, h + 180, h + 20];
    else if (mode === 2) hues = [h, h + 120, h + 240];
    else hues = [h, h, h];
    var names = ['类似色', '互补色', '三原色', '单色系'];
    var stops = hues.map(function (hh, i) {
        var ll = l + (i - 1) * 12;
        var rgb = hslToRgb(hh, s, Math.max(15, Math.min(85, ll)));
        return { color: rgbToHex(rgb[0], rgb[1], rgb[2]), alpha: 100, pos: i / (hues.length - 1) * 100 };
    });
    state.stops = stops;
    state.selected = 0;
    render();
    toast('已生成' + names[mode] + '随机配色');
}

/* ---------- 预设库 ---------- */
var PRESETS = [
    { name: '落日熔金', type: 'linear', angle: 135, stops: [['#ff9966', 0], ['#ff5e62', 100]] },
    { name: '深海空间', type: 'linear', angle: 135, stops: [['#0f2027', 0], ['#203a43', 50], ['#2c5364', 100]] },
    { name: '青草薄荷', type: 'linear', angle: 135, stops: [['#11998e', 0], ['#38ef7d', 100]] },
    { name: '樱花粉雾', type: 'radial', shape: 'circle', pos: 'center', stops: [['#ff9a9e', 0], ['#fecfef', 100]] },
    { name: '霓虹紫电', type: 'conic', from: 0, stops: [['#12c2e9', 0], ['#c471ed', 50], ['#f64f59', 100]] },
    { name: '蜜桃汽水', type: 'linear', angle: 120, stops: [['#ffecd2', 0], ['#fcb69f', 100]] },
    { name: '午夜都市', type: 'linear', angle: 180, stops: [['#232526', 0], ['#414345', 100]] },
    { name: '柠檬气泡', type: 'radial', shape: 'ellipse', pos: 'center', stops: [['#f9d423', 0], ['#ff4e50', 100]] },
    { name: '彩虹光谱', type: 'conic', from: 0, stops: [['#ff0000', 0], ['#ff9900', 17], ['#ffee00', 33], ['#33dd44', 50], ['#3388ff', 67], ['#8833ff', 83], ['#ff0000', 100]] },
    { name: '晨曦微光', type: 'linear', angle: 90, stops: [['#a1c4fd', 0], ['#c2e9fb', 100]] }
];
function presetCss(p) {
    var body = p.stops.map(function (s) {
        var rgb = hexToRgb(s[0]);
        return 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', 1) ' + s[1] + '%';
    }).join(', ');
    if (p.type === 'linear') return 'linear-gradient(' + p.angle + 'deg, ' + body + ')';
    if (p.type === 'radial') return 'radial-gradient(' + p.shape + ' at ' + p.pos + ', ' + body + ')';
    return 'conic-gradient(from ' + (p.from || 0) + 'deg at center, ' + body + ')';
}
function renderPresets() {
    var box = $('cg-presets');
    PRESETS.forEach(function (p) {
        var card = document.createElement('div');
        card.className = 'cg-preset';
        var sw = document.createElement('div');
        sw.className = 'cg-preset-swatch';
        sw.style.background = presetCss(p);
        var nm = document.createElement('div');
        nm.className = 'cg-preset-name';
        nm.textContent = p.name;
        card.appendChild(sw);
        card.appendChild(nm);
        card.addEventListener('click', function () { applyPreset(p); });
        box.appendChild(card);
    });
}
function applyPreset(p) {
    state.type = p.type;
    if (p.type === 'linear') {
        state.angle = p.angle || 135;
        $('cg-angle').value = state.angle;
        $('cg-angle-val').textContent = state.angle + '°';
    } else if (p.type === 'radial') {
        state.radialShape = p.shape || 'ellipse';
        state.radialPos = p.pos || 'center';
        $('cg-radial-shape').value = state.radialShape;
        $('cg-radial-pos').value = state.radialPos;
        $('cg-radial-xy').style.display = 'none';
    } else {
        state.conicFrom = p.from || 0;
        state.conicPos = 'center';
        $('cg-conic-from').value = state.conicFrom;
        $('cg-conic-from-val').textContent = state.conicFrom + '°';
        $('cg-conic-pos').value = 'center';
    }
    state.stops = p.stops.map(function (s) { return { color: s[0], alpha: 100, pos: s[1] }; });
    state.selected = 0;
    var tabs = document.querySelectorAll('#cg-type-tabs .cg-type-tab');
    tabs.forEach(function (t) { t.classList.toggle('active', t.dataset.type === state.type); });
    $('cg-params-linear').style.display = state.type === 'linear' ? '' : 'none';
    $('cg-params-radial').style.display = state.type === 'radial' ? '' : 'none';
    $('cg-params-conic').style.display = state.type === 'conic' ? '' : 'none';
    render();
    toast('已套用预设「' + p.name + '」');
}

/* ---------- 初始化 ---------- */
document.addEventListener('DOMContentLoaded', function () {
    fillPosSelect($('cg-radial-pos'), true);
    fillPosSelect($('cg-conic-pos'), false);
    $('cg-conic-pos').value = 'center';
    renderPresets();
    bindBar();
    bindEditor();
    bindTypes();
    bindActions();
    render();
});
})();
