/* 汉字笔顺查询（hanzi_stroke_order）- 纯前端（零后端、零上传）
 *
 * 纯逻辑层（HS-CORE）：单字笔顺查询，浏览器本地完成。笔顺数据见
 * static/js/hanzi_stroke_data.js（hanzi-writer-data 2.0.1，源自
 * MakeMeAHanzi，ARPHIC Public License；坐标取整＋路径压缩，首批收录
 * 957 个最常用汉字），笔顺以《现代汉语通用字笔顺规范》为准。
 * 只做汉字笔顺查询，不做注音（请用汉字转拼音）、不做简繁互转（请用
 * 简繁转换）。不引第三方库、不走 CDN；模板零外部静态资源。
 * 动画说明：SVG 逐画描红——淡色全画底字＋当前画高亮，播放／暂停／
 * 上一步／下一步／重播，0.5×／1×／2×变速；笔画分解列表点击定位。
 */
(function () {
'use strict';

var QUICK_CHARS = ['永', '学', '书', '爱', '国', '汉', '字', '文'];
var MAX_BATCH_CHARS = 1000;
var BASE_MS_PER_STROKE = 600;
var SPEEDS = [0.5, 1, 2];
var VIEWBOX = '-120 -120 1264 1264';

/* Node 下直接 require 数据文件；浏览器下读 window.HANZI_STROKE_DATA
 *（模板先加载 hanzi_stroke_data.js，后加载本文件）。 */
var DATA = null;
try {
    if (typeof module !== 'undefined' && module.exports) {
        DATA = require('./hanzi_stroke_data.js');
    }
} catch (e) { DATA = null; }

function getData() {
    if (typeof window !== 'undefined' && window.HANZI_STROKE_DATA) {
        return window.HANZI_STROKE_DATA;
    }
    if (DATA) { return DATA; }
    throw makeError('data', '笔顺描红数据未加载：请确认已加载 static/js/hanzi_stroke_data.js');
}

function makeError(field, message) {
    var e = new Error(message);
    e.field = field;
    return e;
}

/* 取首个码位（兼容代理对字符，如生僻字） */
function firstCodePoint(s) {
    return s.charAt(0) + (s.length > 1 && s.charCodeAt(0) >= 0xD800 && s.charCodeAt(0) <= 0xDBFF ? s.charAt(1) : '');
}

function singleCharError() {
    return makeError('char', '请输入单个汉字：一次只查一个字');
}

function assertSingleChar(ch) {
    if (typeof ch !== 'string') {
        throw makeError('char', '请输入单个汉字：一次只查一个字');
    }
    /* Array.from 按码位计数：'龘' 为 1，'永学' 为 2，代理对生僻字为 1 */
    var cps = Array.from ? Array.from(ch) : ch.split('');
    if (cps.length !== 1) {
        throw singleCharError();
    }
    return cps[0];
}

function notSupportedMessage(ch, total) {
    return '暂未收录「' + ch + '」：本工具首批仅收录 ' + total +
        ' 个最常用汉字（小学低年级生字＋高频常用字），未收录字不猜测笔顺';
}

/* ---------- 核心查询 ---------- */
function isSupported(ch) {
    if (typeof ch !== 'string') { return false; }
    var cps = Array.from ? Array.from(ch) : ch.split('');
    if (cps.length !== 1) { return false; }
    try {
        var data = getData();
        return Object.prototype.hasOwnProperty.call(data, cps[0]);
    } catch (e) { return false; }
}

function getStrokeCount(ch) {
    var c = assertSingleChar(ch);
    var data = getData();
    if (!Object.prototype.hasOwnProperty.call(data, c)) {
        throw makeError('char', notSupportedMessage(c, Object.keys(data).length));
    }
    return data[c].length;
}

function getStrokes(ch) {
    var c = assertSingleChar(ch);
    var data = getData();
    if (!Object.prototype.hasOwnProperty.call(data, c)) {
        throw makeError('char', notSupportedMessage(c, Object.keys(data).length));
    }
    return data[c].map(function (d, i) {
        return { index: i, d: d };
    });
}

function getSupportedChars() {
    var data = getData();
    return Object.keys(data);
}

function searchByStrokeCount(count) {
    if (typeof count !== 'number' || !isFinite(count) || Math.floor(count) !== count || count < 1) {
        throw makeError('count', '笔画数须为 ≥1 的整数：请输入 1–30 的笔画数');
    }
    var data = getData();
    var out = [];
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) {
        if (data[keys[i]].length === count) { out.push(keys[i]); }
    }
    return out;
}

/* ---------- 文本批量查询：逐字出支持状态 ---------- */
/* 成功字：{char, supported:true, strokeCount:N, error:''}
 * 未收录：{char, supported:false, strokeCount:0, error:'暂未收录…'} */
function lookupText(text) {
    if (typeof text !== 'string') {
        throw makeError('text', '请输入要查询的文本');
    }
    if (text.length > MAX_BATCH_CHARS) {
        throw makeError('text', '批量查询最多 ' + MAX_BATCH_CHARS + ' 字：当前 ' + text.length + ' 字，请分批查询');
    }
    var data = getData();
    var total = Object.keys(data).length;
    var cps = Array.from ? Array.from(text) : text.split('');
    return cps.map(function (c) {
        if (Object.prototype.hasOwnProperty.call(data, c)) {
            return { char: c, supported: true, strokeCount: data[c].length, error: '' };
        }
        return { char: c, supported: false, strokeCount: 0, error: notSupportedMessage(c, total) };
    });
}

function batchStats(results) {
    if (!results || Object.prototype.toString.call(results) !== '[object Array]') {
        throw makeError('batch', '批量结果须为数组');
    }
    var st = { total: results.length, supported: 0, unsupported: 0 };
    for (var i = 0; i < results.length; i++) {
        if (results[i].supported) { st.supported++; } else { st.unsupported++; }
    }
    return st;
}

/* ---------- 动画步进夹取：step 为 0 起的笔画下标 ---------- */
/* total 须为正整数（笔画数），step 须为有限数字；返回 [0, total-1] 内整数 */
function clampStep(step, total) {
    if (typeof total !== 'number' || !isFinite(total) || Math.floor(total) !== total || total < 1) {
        throw makeError('total', '笔画总数须为 ≥1 的整数');
    }
    if (typeof step !== 'number' || !isFinite(step)) {
        throw makeError('step', '步进值须为数字');
    }
    var s = Math.floor(step);
    if (s < 0) { return 0; }
    if (s > total - 1) { return total - 1; }
    return s;
}

/* ---------- 笔顺说明文本（复制用） ---------- */
function strokeDescription(ch) {
    var c = assertSingleChar(ch);
    var data = getData();
    if (!Object.prototype.hasOwnProperty.call(data, c)) {
        throw makeError('char', notSupportedMessage(c, Object.keys(data).length));
    }
    var n = data[c].length;
    var seq = [];
    for (var i = 0; i < n; i++) { seq.push('第 ' + (i + 1) + ' 画'); }
    return '汉字「' + c + '」的笔顺：共 ' + n + ' 画。\n' +
        '笔顺：' + seq.join(' → ') + '。\n' +
        '说明：标准印刷体描红轨迹，笔顺以《现代汉语通用字笔顺规范》为准；' +
        '本工具只做笔顺查询，不做注音、不做简繁互转。';
}

var API = {
    QUICK_CHARS: QUICK_CHARS,
    MAX_BATCH_CHARS: MAX_BATCH_CHARS,
    BASE_MS_PER_STROKE: BASE_MS_PER_STROKE,
    SPEEDS: SPEEDS,
    VIEWBOX: VIEWBOX,
    isSupported: isSupported,
    getStrokeCount: getStrokeCount,
    getStrokes: getStrokes,
    getSupportedChars: getSupportedChars,
    searchByStrokeCount: searchByStrokeCount,
    lookupText: lookupText,
    batchStats: batchStats,
    clampStep: clampStep,
    strokeDescription: strokeDescription
};

if (typeof window !== 'undefined') window.HanziStrokeOrder = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;

/* ================= DOM 层（仅浏览器） ================= */

if (typeof document !== 'undefined') {
    (function () {
        var SVG_NS = 'http://www.w3.org/2000/svg';
        function $(id) { return document.getElementById(id); }
        function escapeHtml(s) {
            return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }
        function trim(s) { return s.replace(/^\s+|\s+$/g, ''); }

        var inputEl, statusEl, charEl, countEl, stageEl, svgEl,
            playBtn, pauseBtn, prevBtn, nextBtn, replayBtn, progressEl,
            strokeListEl, quickEl, browseSelectEl, browseGridEl, browseCountEl,
            batchEl, batchBtn, batchResultsEl, batchStatsEl,
            statsEl, descEl, tipEl;
        var currentChar = '';
        var currentStrokes = [];
        var shown = 0;          /* 已完整描出的画数（0..total） */
        var currentStep = 0;    /* 正在描的画下标（0..total-1），描完时 = total */
        var progress = 0;       /* 当前画描画进度 0..1 */
        var playing = false;
        var speed = 1;
        var rafId = null;
        var lastTs = 0;
        var lastBatch = [];

        /* ---------- SVG 描红渲染 ---------- */
        /* 每画一条 <path>：未描画为淡色底字（#e5e7eb），已描画为实色（#2563eb），
         * 正在描的一画用 pathLength=100 的 dashoffset 做逐画描红动画。 */
        function buildSvg() {
            if (!stageEl) { return; }
            stageEl.innerHTML = '';
            svgEl = document.createElementNS(SVG_NS, 'svg');
            svgEl.setAttribute('viewBox', VIEWBOX);
            svgEl.setAttribute('class', 'hs-svg');
            svgEl.setAttribute('role', 'img');
            svgEl.setAttribute('aria-label', currentChar ? ('「' + currentChar + '」笔顺描红') : '笔顺描红区');
            for (var i = 0; i < currentStrokes.length; i++) {
                var p = document.createElementNS(SVG_NS, 'path');
                p.setAttribute('d', currentStrokes[i].d);
                p.setAttribute('fill', 'none');
                p.setAttribute('stroke-linecap', 'round');
                p.setAttribute('stroke-linejoin', 'round');
                p.setAttribute('pathLength', '100');
                p.setAttribute('data-index', String(i));
                svgEl.appendChild(p);
            }
            stageEl.appendChild(svgEl);
            paintSvg();
        }

        function paintSvg() {
            if (!svgEl) { return; }
            var paths = svgEl.querySelectorAll('path');
            for (var i = 0; i < paths.length; i++) {
                var p = paths[i];
                if (i < shown) {
                    p.setAttribute('stroke', '#2563eb');
                    p.setAttribute('stroke-width', '16');
                    p.setAttribute('stroke-dasharray', '100');
                    p.setAttribute('stroke-dashoffset', '0');
                    p.setAttribute('opacity', '1');
                } else if (i === currentStep && playing) {
                    p.setAttribute('stroke', '#2563eb');
                    p.setAttribute('stroke-width', '18');
                    p.setAttribute('stroke-dasharray', '100');
                    p.setAttribute('stroke-dashoffset', String(100 * (1 - progress)));
                    p.setAttribute('opacity', '1');
                } else if (i === currentStep && shown < currentStrokes.length) {
                    /* 暂停在某画起点：该画以浅蓝实色整画高亮（与淡灰底字、深蓝已描画区分） */
                    p.setAttribute('stroke', '#93c5fd');
                    p.setAttribute('stroke-width', '18');
                    p.setAttribute('stroke-dasharray', 'none');
                    p.setAttribute('stroke-dashoffset', '0');
                    p.setAttribute('opacity', '1');
                } else {
                    p.setAttribute('stroke', '#9ca3af');
                    p.setAttribute('stroke-width', '14');
                    p.setAttribute('stroke-dasharray', 'none');
                    p.setAttribute('stroke-dashoffset', '0');
                    p.setAttribute('opacity', '0.35');
                }
            }
            if (progressEl) {
                if (!currentStrokes.length) {
                    progressEl.textContent = '未选择汉字';
                } else if (shown >= currentStrokes.length) {
                    progressEl.textContent = '已完成：' + currentStrokes.length + ' / ' + currentStrokes.length + ' 画';
                } else {
                    progressEl.textContent = '第 ' + (currentStep + 1) + ' / ' + currentStrokes.length + ' 画' +
                        (playing ? '（描画中 ' + Math.round(progress * 100) + '%）' : '（已暂停）');
                }
            }
            paintStrokeList();
        }

        function paintStrokeList() {
            if (!strokeListEl) { return; }
            var items = strokeListEl.querySelectorAll('.hs-stroke-item');
            for (var i = 0; i < items.length; i++) {
                var idx = parseInt(items[i].getAttribute('data-i'), 10);
                var cls = 'hs-stroke-item';
                if (idx < shown) { cls += ' hs-stroke-done'; }
                if (idx === currentStep && shown < currentStrokes.length) { cls += ' hs-stroke-current'; }
                items[i].className = cls;
            }
        }

        /* ---------- 动画控制 ---------- */
        function stopRaf() {
            if (rafId !== null) {
                if (typeof cancelAnimationFrame === 'function') { cancelAnimationFrame(rafId); }
                else { clearTimeout(rafId); }
                rafId = null;
            }
            playing = false;
        }

        function tick(ts) {
            if (!playing) { return; }
            if (!lastTs) { lastTs = ts; }
            var dt = ts - lastTs;
            lastTs = ts;
            progress += dt / (BASE_MS_PER_STROKE / speed);
            if (progress >= 1) {
                progress = 0;
                shown++;
                currentStep = shown;
                if (shown >= currentStrokes.length) {
                    stopRaf();
                    paintSvg();
                    renderStats();
                    return;
                }
            }
            paintSvg();
            function next(fn) {
                if (typeof requestAnimationFrame === 'function') { return requestAnimationFrame(fn); }
                return setTimeout(function () { fn(Date.now()); }, 16);
            }
            rafId = next(tick);
        }

        function startPlay() {
            if (!currentStrokes.length) { return; }
            if (shown >= currentStrokes.length) {
                shown = 0;
                currentStep = 0;
                progress = 0;
            }
            playing = true;
            lastTs = 0;
            if (typeof requestAnimationFrame === 'function') {
                rafId = requestAnimationFrame(tick);
            } else {
                rafId = setTimeout(function () { tick(Date.now()); }, 16);
            }
            paintSvg();
        }

        function pausePlay() {
            stopRaf();
            paintSvg();
        }

        function stepPrev() {
            if (!currentStrokes.length) { return; }
            stopRaf();
            shown = Math.max(0, shown - 1);
            currentStep = shown;
            progress = 0;
            paintSvg();
            renderStats();
        }

        function stepNext() {
            if (!currentStrokes.length) { return; }
            stopRaf();
            if (shown < currentStrokes.length) {
                shown++;
                currentStep = shown;
                progress = 0;
            }
            paintSvg();
            renderStats();
        }

        function replay() {
            if (!currentStrokes.length) { return; }
            stopRaf();
            shown = 0;
            currentStep = 0;
            progress = 0;
            paintSvg();
            startPlay();
        }

        function jumpToStep(i) {
            if (!currentStrokes.length) { return; }
            stopRaf();
            shown = clampStep(i, currentStrokes.length);
            currentStep = shown;
            progress = 0;
            paintSvg();
            renderStats();
        }

        function setSpeed(s) {
            speed = s;
            var btns = document.querySelectorAll('.hs-speed-btn');
            for (var i = 0; i < btns.length; i++) {
                var on = parseFloat(btns[i].getAttribute('data-speed')) === s;
                btns[i].className = 'hs-speed-btn' + (on ? ' hs-speed-on' : '');
            }
        }

        /* ---------- 单字查询 ---------- */
        function renderStrokeList() {
            if (!strokeListEl) { return; }
            if (!currentStrokes.length) {
                strokeListEl.innerHTML = '<span class="hs-muted">查询汉字后，这里按笔顺列出每一画，点击可定位高亮到该画。</span>';
                return;
            }
            strokeListEl.innerHTML = currentStrokes.map(function (s) {
                return '<button type="button" class="hs-stroke-item" data-i="' + s.index + '">第 ' +
                    (s.index + 1) + ' 画</button>';
            }).join('');
            var items = strokeListEl.querySelectorAll('.hs-stroke-item');
            for (var i = 0; i < items.length; i++) {
                items[i].addEventListener('click', function () {
                    jumpToStep(parseInt(this.getAttribute('data-i'), 10));
                });
            }
        }

        function showStatus(msg, isErr) {
            if (!statusEl) { return; }
            statusEl.textContent = msg;
            statusEl.style.display = msg ? 'block' : 'none';
            statusEl.className = 'hs-status' + (isErr ? ' hs-status-err' : '');
        }

        function loadChar(ch) {
            var c = firstCodePoint(trim(ch));
            if (!c) {
                currentChar = '';
                currentStrokes = [];
                shown = 0;
                currentStep = 0;
                progress = 0;
                stopRaf();
                if (charEl) { charEl.textContent = '—'; }
                if (countEl) { countEl.textContent = '—'; }
                showStatus('', false);
                buildSvg();
                renderStrokeList();
                renderStats();
                renderDesc();
                return;
            }
            if (!isSupported(c)) {
                currentChar = c;
                currentStrokes = [];
                shown = 0;
                currentStep = 0;
                progress = 0;
                stopRaf();
                if (charEl) { charEl.textContent = c; }
                if (countEl) { countEl.textContent = '—'; }
                try {
                    getStrokeCount(c);
                } catch (e) {
                    showStatus(e.message, true);
                }
                buildSvg();
                renderStrokeList();
                renderStats();
                renderDesc();
                return;
            }
            stopRaf();
            currentChar = c;
            currentStrokes = getStrokes(c);
            shown = 0;
            currentStep = 0;
            progress = 0;
            if (charEl) { charEl.textContent = c; }
            if (countEl) { countEl.textContent = currentStrokes.length + ' 画'; }
            showStatus('「' + c + '」共 ' + currentStrokes.length + ' 画，笔顺以《现代汉语通用字笔顺规范》为准。点「播放」看逐画描红，或点下面笔画列表定位到某一画。', false);
            buildSvg();
            renderStrokeList();
            renderStats();
            renderDesc();
        }

        function onInput() {
            var v = trim(inputEl.value);
            if (!v) { loadChar(''); return; }
            loadChar(firstCodePoint(v));
        }

        /* ---------- 常用字速查 ---------- */
        function renderQuick() {
            if (!quickEl) { return; }
            quickEl.innerHTML = QUICK_CHARS.map(function (c) {
                var n = 0;
                try { n = getStrokeCount(c); } catch (e) { n = 0; }
                return '<button type="button" class="hs-chip" data-c="' + c + '">' + escapeHtml(c) +
                    '（' + n + ' 画）</button>';
            }).join('');
            var chips = quickEl.querySelectorAll('.hs-chip');
            for (var i = 0; i < chips.length; i++) {
                chips[i].addEventListener('click', function () {
                    inputEl.value = this.getAttribute('data-c');
                    loadChar(this.getAttribute('data-c'));
                });
            }
        }

        /* ---------- 按笔画数浏览 ---------- */
        function renderBrowse() {
            if (!browseSelectEl || !browseGridEl) { return; }
            var count = parseInt(browseSelectEl.value, 10);
            var list = searchByStrokeCount(count);
            if (browseCountEl) {
                browseCountEl.textContent = count + ' 画共收录 ' + list.length + ' 字';
            }
            browseGridEl.innerHTML = list.map(function (c) {
                return '<button type="button" class="hs-browse-char' + (c === currentChar ? ' hs-browse-on' : '') +
                    '" data-c="' + c + '">' + escapeHtml(c) + '</button>';
            }).join('') || '<span class="hs-muted">该笔画数暂无收录字。</span>';
            var btns = browseGridEl.querySelectorAll('.hs-browse-char');
            for (var i = 0; i < btns.length; i++) {
                btns[i].addEventListener('click', function () {
                    inputEl.value = this.getAttribute('data-c');
                    loadChar(this.getAttribute('data-c'));
                    renderBrowse();
                });
            }
        }

        /* ---------- 批量查询 ---------- */
        function renderBatch() {
            if (!batchResultsEl) { return; }
            if (!lastBatch.length) {
                batchResultsEl.innerHTML = '<span class="hs-muted">批量查询后，每字结果会出现在这里（已收录字显示笔画数、可点开看动画；未收录字明示「暂未收录」）。</span>';
                return;
            }
            batchResultsEl.innerHTML = lastBatch.map(function (r, i) {
                if (r.supported) {
                    return '<div class="hs-batch-row hs-batch-ok"><span class="hs-batch-char">' + escapeHtml(r.char) +
                        '</span><span>共 ' + r.strokeCount + ' 画</span>' +
                        '<button type="button" class="hs-batch-open" data-i="' + i + '">查看动画</button></div>';
                }
                return '<div class="hs-batch-row hs-batch-err"><span class="hs-batch-char">' + escapeHtml(r.char) +
                    '</span><span>暂未收录</span><span class="hs-muted">本工具首批仅收录最常用汉字，不猜测笔顺</span></div>';
            }).join('');
            var btns = batchResultsEl.querySelectorAll('.hs-batch-open');
            for (var i = 0; i < btns.length; i++) {
                btns[i].addEventListener('click', function () {
                    var r = lastBatch[parseInt(this.getAttribute('data-i'), 10)];
                    inputEl.value = r.char;
                    loadChar(r.char);
                    if (stageEl && stageEl.scrollIntoView) { stageEl.scrollIntoView({ block: 'nearest' }); }
                });
            }
        }

        function doBatch() {
            var text = batchEl.value;
            if (trim(text) === '') {
                lastBatch = [];
                renderBatch();
                if (batchStatsEl) { batchStatsEl.textContent = ''; }
                renderStats();
                return;
            }
            try {
                lastBatch = lookupText(text.replace(/\s/g, ''));
                renderBatch();
                var bs = batchStats(lastBatch);
                if (batchStatsEl) {
                    batchStatsEl.textContent = '共 ' + bs.total + ' 字，已收录 ' + bs.supported +
                        ' 字，暂未收录 ' + bs.unsupported + ' 字。';
                }
                renderStats();
            } catch (e) {
                if (batchStatsEl) { batchStatsEl.textContent = e.message; }
            }
        }

        /* ---------- 统计面板与说明文本 ---------- */
        function renderStats() {
            if (!statsEl) { return; }
            var total = 0;
            try { total = getSupportedChars().length; } catch (e) { total = 0; }
            var bs = batchStats(lastBatch);
            var cells = [
                { v: total || '—', s: '首批收录字数' },
                { v: currentChar || '—', s: '当前汉字' },
                { v: currentStrokes.length ? currentStrokes.length + ' 画' : '—', s: '当前笔画数' },
                { v: shown + ' / ' + (currentStrokes.length || '—'), s: '已描画数' },
                { v: bs.total, s: '批量字数' },
                { v: bs.supported, s: '批量已收录' },
                { v: bs.unsupported, s: '批量暂未收录' }
            ];
            statsEl.innerHTML = cells.map(function (c) {
                return '<div class="hs-stat"><b>' + escapeHtml(String(c.v)) + '</b><span>' + c.s + '</span></div>';
            }).join('');
        }

        function renderDesc() {
            if (!descEl) { return; }
            if (!currentChar || !currentStrokes.length) {
                descEl.value = '';
                return;
            }
            try { descEl.value = strokeDescription(currentChar); } catch (e) { descEl.value = ''; }
        }

        function copyText(text, okMsg) {
            function done() {
                if (tipEl) { tipEl.textContent = okMsg; tipEl.style.display = 'block'; }
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
            } else {
                fallbackCopy(text);
                done();
            }
        }

        function fallbackCopy(text) {
            var ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
            document.body.removeChild(ta);
        }

        function clearAll() {
            stopRaf();
            inputEl.value = '';
            batchEl.value = '';
            lastBatch = [];
            loadChar('');
            renderBatch();
            if (batchStatsEl) { batchStatsEl.textContent = ''; }
            if (tipEl) { tipEl.style.display = 'none'; }
        }

        document.addEventListener('DOMContentLoaded', function () {
            inputEl = $('hs-input');
            statusEl = $('hs-status');
            charEl = $('hs-char');
            countEl = $('hs-count');
            stageEl = $('hs-stage');
            playBtn = $('hs-play');
            pauseBtn = $('hs-pause');
            prevBtn = $('hs-prev');
            nextBtn = $('hs-next');
            replayBtn = $('hs-replay');
            progressEl = $('hs-progress');
            strokeListEl = $('hs-stroke-list');
            quickEl = $('hs-quick');
            browseSelectEl = $('hs-browse-select');
            browseGridEl = $('hs-browse-grid');
            browseCountEl = $('hs-browse-count');
            batchEl = $('hs-batch-input');
            batchBtn = $('hs-batch-btn');
            batchResultsEl = $('hs-batch-results');
            batchStatsEl = $('hs-batch-stats');
            statsEl = $('hs-stats');
            descEl = $('hs-desc');
            tipEl = $('hs-tip');
            if (!inputEl || !stageEl) { return; }

            renderQuick();
            renderBrowse();
            renderBatch();
            renderStats();
            renderStrokeList();
            buildSvg();
            loadChar('永');
            inputEl.value = '永';

            inputEl.addEventListener('input', onInput);
            if (playBtn) { playBtn.addEventListener('click', startPlay); }
            if (pauseBtn) { pauseBtn.addEventListener('click', pausePlay); }
            if (prevBtn) { prevBtn.addEventListener('click', stepPrev); }
            if (nextBtn) { nextBtn.addEventListener('click', stepNext); }
            if (replayBtn) { replayBtn.addEventListener('click', replay); }
            var speedBtns = document.querySelectorAll('.hs-speed-btn');
            for (var i = 0; i < speedBtns.length; i++) {
                speedBtns[i].addEventListener('click', function () {
                    setSpeed(parseFloat(this.getAttribute('data-speed')));
                });
            }
            setSpeed(1);
            if (browseSelectEl) { browseSelectEl.addEventListener('change', renderBrowse); }
            if (batchBtn) { batchBtn.addEventListener('click', doBatch); }
            if (batchEl) { batchEl.addEventListener('input', doBatch); }
            var copyBtn = $('hs-copy-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', function () {
                    if (!currentChar || !currentStrokes.length) {
                        if (tipEl) { tipEl.textContent = '暂无可复制的笔顺说明：请先查询一个已收录的汉字。'; tipEl.style.display = 'block'; }
                        return;
                    }
                    copyText(descEl.value, '已复制「' + currentChar + '」的笔顺说明文本。');
                });
            }
            var clearBtn = $('hs-clear');
            if (clearBtn) { clearBtn.addEventListener('click', clearAll); }
        });
    })();
}

})();
