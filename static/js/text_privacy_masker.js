/* 文本隐私脱敏工具 - 纯前端敏感信息识别与遮盖引擎
 * 数据只在浏览器里处理：零第三方依赖、无任何后端调用、无网络请求。
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；
 * Node 自测：module.exports 暴露纯函数（detectAll / applyMask / maskValue / 校验函数）。
 */
(function () {
'use strict';

/* ============ 类型定义（prio 越小，冲突时优先级越高） ============ */
var PROV = '京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼';

var TYPES = [
    { key: 'idcard',   name: '身份证号', en: 'ID Card',      prio: 1, color: '#b45309', bg: '#fef3c7', bd: '#f59e0b', on: true },
    { key: 'bankcard', name: '银行卡号', en: 'Bank Card',    prio: 2, color: '#047857', bg: '#d1fae5', bd: '#10b981', on: true },
    { key: 'email',    name: '邮箱',     en: 'Email',        prio: 3, color: '#7c3aed', bg: '#ede9fe', bd: '#8b5cf6', on: true },
    { key: 'plate',    name: '车牌号',   en: 'Plate Number', prio: 4, color: '#be123c', bg: '#ffe4e6', bd: '#f43f5e', on: true },
    { key: 'ipv4',     name: 'IPv4 地址',en: 'IPv4',         prio: 5, color: '#0e7490', bg: '#cffafe', bd: '#06b6d4', on: true },
    { key: 'phone',    name: '手机号',   en: 'Phone',        prio: 6, color: '#2563eb', bg: '#dbeafe', bd: '#3b82f6', on: true }
];

var TYPE_MAP = {};
TYPES.forEach(function (t) { TYPE_MAP[t.key] = t; });

/* 各类型部分保留默认策略（保留前 head 位 / 后 tail 位，中间 * 补齐） */
var MASK_CFG = {
    idcard:   { head: 6, tail: 4 },
    bankcard: { head: 0, tail: 4 },
    phone:    { head: 3, tail: 4 },
    email:    { head: 1, tail: 0 },  /* 仅作用于 @ 前本地部分，域名整体保留 */
    ipv4:     { head: 1, tail: 0 },  /* 保留首段，其余段逐段打码 */
    plate:    { head: 2, tail: 1 }
};

/* ============ 基础工具 ============ */
function isDigit(ch) { return ch >= '0' && ch <= '9'; }

function repeat(ch, n) {
    var s = '';
    for (var i = 0; i < n; i++) s += ch;
    return s;
}

function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mk(type, value, start, end) {
    return { type: type, value: value, start: start, end: end,
             prio: TYPE_MAP[type].prio, ignored: false };
}

/* ============ 校验函数 ============ */
function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }

function validDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    var dim = [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return d <= dim[m - 1];
}

/* 18 位身份证：日期合法 + 校验码 */
function checkId18(s) {
    if (!/^\d{17}[\dXx]$/.test(s)) return false;
    var y = +s.slice(6, 10), m = +s.slice(10, 12), d = +s.slice(12, 14);
    if (y < 1900 || y > 2100 || !validDate(y, m, d)) return false;
    var w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    var map = '10X98765432', sum = 0, i;
    for (i = 0; i < 17; i++) sum += (+s[i]) * w[i];
    return map[sum % 11] === s[17].toUpperCase();
}

/* 15 位身份证：日期合法（按 19yy 校验闰年） */
function checkId15(s) {
    if (!/^[1-9]\d{14}$/.test(s)) return false;
    var yy = +s.slice(6, 8), m = +s.slice(8, 10), d = +s.slice(10, 12);
    return validDate(1900 + yy, m, d);
}

/* Luhn 校验（银行卡） */
function luhnValid(s) {
    if (!/^\d{15,19}$/.test(s)) return false;
    if (/^(\d)\1+$/.test(s)) return false; /* 全同数字串不算卡号，防误报 */
    var sum = 0, dbl = false, i, n;
    for (i = s.length - 1; i >= 0; i--) {
        n = +s[i];
        if (dbl) { n *= 2; if (n > 9) n -= 9; }
        sum += n;
        dbl = !dbl;
    }
    return sum % 10 === 0;
}

/* ============ 各类型扫描器 ============ */
function scanPhone(text) {
    var out = [], re = /1[3-9]\d{9}/g, m, s, e;
    while ((m = re.exec(text)) !== null) {
        s = m.index; e = s + 11;
        if (s > 0 && isDigit(text[s - 1])) continue;
        if (e < text.length && isDigit(text[e])) continue;
        out.push(mk('phone', m[0], s, e));
    }
    return out;
}

function scanIdcard(text) {
    var out = [], re, m, s, e;
    /* 18 位 */
    re = /\d{17}[\dXx]/g;
    while ((m = re.exec(text)) !== null) {
        s = m.index; e = s + 18;
        if (s > 0 && isDigit(text[s - 1])) continue;
        if (e < text.length && (isDigit(text[e]) || text[e] === 'X' || text[e] === 'x')) continue;
        if (checkId18(m[0])) out.push(mk('idcard', m[0], s, e));
    }
    /* 15 位 */
    re = /[1-9]\d{5}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}/g;
    while ((m = re.exec(text)) !== null) {
        s = m.index; e = s + 15;
        if (s > 0 && isDigit(text[s - 1])) continue;
        if (e < text.length && isDigit(text[e])) continue;
        if (checkId15(m[0])) out.push(mk('idcard', m[0], s, e));
    }
    return out;
}

function scanBankcard(text) {
    var out = [], re = /\d{15,19}/g, m, s, e;
    while ((m = re.exec(text)) !== null) {
        s = m.index; e = s + m[0].length;
        if (s > 0 && isDigit(text[s - 1])) continue;
        if (e < text.length && isDigit(text[e])) continue;
        if (luhnValid(m[0])) out.push(mk('bankcard', m[0], s, e));
    }
    return out;
}

function scanEmail(text) {
    var out = [], re = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, m, s, e;
    var badPrev = /[A-Za-z0-9._%+-]/;
    while ((m = re.exec(text)) !== null) {
        s = m.index; e = s + m[0].length;
        if (s > 0 && badPrev.test(text[s - 1])) continue;
        out.push(mk('email', m[0], s, e));
    }
    return out;
}

function scanIpv4(text) {
    var oct = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
    var re = new RegExp(oct + '(?:\\.' + oct + '){3}', 'g');
    var out = [], m, s, e, bad = /[0-9.]/;
    while ((m = re.exec(text)) !== null) {
        s = m.index; e = s + m[0].length;
        if (s > 0 && bad.test(text[s - 1])) continue;
        if (e < text.length && bad.test(text[e])) continue;
        out.push(mk('ipv4', m[0], s, e));
    }
    return out;
}

function scanPlate(text) {
    var provCls = '[' + PROV + ']';
    /* 新能源 8 位（D/F 在首或尾）/ 普通 7 位；使领馆车牌 */
    var re = new RegExp(
        '(?:' + provCls + '[A-Z](?:[A-Z0-9]{5}[DF]|[DF][A-Z0-9]{5}|[A-Z0-9]{4}[A-Z0-9挂学警港澳])' +
        '|[使领][A-Z0-9]{6})', 'g');
    var out = [], m, s, e;
    var badNext = new RegExp('[A-Z0-9挂学警港澳台DF]');
    var badPrev = new RegExp('[A-Z0-9' + PROV + '使领]');
    while ((m = re.exec(text)) !== null) {
        s = m.index; e = s + m[0].length;
        if (s > 0 && badPrev.test(text[s - 1])) continue;
        if (e < text.length && badNext.test(text[e])) continue;
        out.push(mk('plate', m[0], s, e));
    }
    return out;
}

var SCANNERS = {
    phone: scanPhone, idcard: scanIdcard, bankcard: scanBankcard,
    email: scanEmail, ipv4: scanIpv4, plate: scanPlate
};

/* ============ 识别入口 + 冲突消解 ============ */
function detectAll(text, enabled) {
    var all = [], k;
    for (k in SCANNERS) {
        if (enabled && enabled[k] === false) continue;
        all = all.concat(SCANNERS[k](text));
    }
    /* 按起点排序；起点相同时优先级高者优先、同优先级取更长 */
    all.sort(function (a, b) {
        if (a.start !== b.start) return a.start - b.start;
        if (a.prio !== b.prio) return a.prio - b.prio;
        return (b.end - b.start) - (a.end - a.start);
    });
    /* 消解重叠：已保留区间内的候选直接丢弃 */
    var kept = [], i, j, m, hit;
    for (i = 0; i < all.length; i++) {
        m = all[i]; hit = false;
        for (j = 0; j < kept.length; j++) {
            if (m.start < kept[j].end && kept[j].start < m.end) { hit = true; break; }
        }
        if (!hit) kept.push(m);
    }
    kept.sort(function (a, b) { return a.start - b.start; });
    kept.forEach(function (m2, idx) { m2.idx = idx + 1; });
    return kept;
}

/* ============ 遮盖 ============ */
function maskValue(type, value, mode, cfg, customChar) {
    if (mode === 'full') return '***';
    if (mode === 'custom') return (customChar === undefined || customChar === '') ? '*' : customChar;
    /* partial */
    var head = cfg.head || 0, tail = cfg.tail || 0, n = value.length, i;
    if (type === 'email') {
        var at = value.indexOf('@');
        var local = value.slice(0, at), domain = value.slice(at);
        if (local.length <= head) return repeat('*', local.length) + domain;
        return local.slice(0, head) + repeat('*', local.length - head) + domain;
    }
    if (type === 'ipv4') {
        var parts = value.split('.');
        var keep = Math.min(Math.max(head, 0), parts.length);
        for (i = 0; i < parts.length; i++) {
            if (i >= keep) parts[i] = repeat('*', parts[i].length);
        }
        return parts.join('.');
    }
    if (head + tail >= n) return repeat('*', n);
    return value.slice(0, head) + repeat('*', n - head - tail) +
           (tail > 0 ? value.slice(n - tail) : '');
}

/* 用原始坐标拼接脱敏结果：不依赖偏移量计算，无误删无错位 */
function applyMask(text, items, mode, cfgMap, customChar) {
    var active = items.filter(function (it) { return !it.ignored; });
    active.sort(function (a, b) { return a.start - b.start; });
    var out = '', pos = 0, i, it;
    for (i = 0; i < active.length; i++) {
        it = active[i];
        out += text.slice(pos, it.start);
        out += maskValue(it.type, it.value, mode, cfgMap[it.type] || { head: 0, tail: 0 }, customChar);
        pos = it.end;
    }
    out += text.slice(pos);
    return out;
}

function countByType(items) {
    var c = {}, i;
    TYPES.forEach(function (t) { c[t.key] = 0; });
    for (i = 0; i < items.length; i++) c[items[i].type]++;
    return c;
}

/* ============ 浏览器 UI ============ */
var state = { text: '', items: [], masked: '', detected: false };

function $(id) { return document.getElementById(id); }

var SAMPLE = '张三，手机号 13812345678，身份证号 11010519491231002X，\n' +
    '银行卡 6228480402564890018，邮箱 zhang.san@example.com，\n' +
    '公司内网 IP 192.168.1.100，座驾车牌 京A12345，新能源车 沪AD12345。\n' +
    '（以上均为示例数据）';

function buildTypeToggles() {
    var box = $('tpm-types');
    box.innerHTML = '';
    TYPES.forEach(function (t) {
        var lab = document.createElement('label');
        lab.className = 'tpm-type';
        lab.innerHTML =
            '<input type="checkbox" data-type="' + t.key + '"' + (t.on ? ' checked' : '') + '>' +
            '<span class="tpm-dot" style="background:' + t.bd + '"></span>' +
            '<span>' + t.name + '</span>';
        box.appendChild(lab);
    });
}

function enabledMap() {
    var m = {};
    var inputs = document.querySelectorAll('#tpm-types input[type=checkbox]');
    for (var i = 0; i < inputs.length; i++) m[inputs[i].getAttribute('data-type')] = inputs[i].checked;
    return m;
}

function buildMaskCfgInputs() {
    var box = $('tpm-cfg');
    box.innerHTML = '';
    TYPES.forEach(function (t) {
        var cfg = MASK_CFG[t.key];
        var row = document.createElement('div');
        row.className = 'tpm-cfg-row';
        var tailLabel = t.key === 'email' ? '保留@前' : (t.key === 'ipv4' ? '保留首段' : '保留后');
        var headLabel = t.key === 'email' ? '保留首字' : '保留前';
        row.innerHTML =
            '<span class="tpm-dot" style="background:' + t.bd + '"></span>' +
            '<span class="tpm-cfg-name">' + t.name + '</span>' +
            '<label>' + headLabel + '<input type="number" min="0" max="18" value="' + cfg.head +
            '" data-type="' + t.key + '" data-pos="head"></label>' +
            '<label>' + tailLabel + '<input type="number" min="0" max="18" value="' + cfg.tail +
            '" data-type="' + t.key + '" data-pos="tail"></label>';
        box.appendChild(row);
    });
}

function readMaskCfg() {
    var cfg = {};
    var inputs = document.querySelectorAll('#tpm-cfg input[type=number]');
    for (var i = 0; i < inputs.length; i++) {
        var tp = inputs[i].getAttribute('data-type'), pos = inputs[i].getAttribute('data-pos');
        if (!cfg[tp]) cfg[tp] = { head: 0, tail: 0 };
        cfg[tp][pos] = Math.max(0, parseInt(inputs[i].value, 10) || 0);
    }
    return cfg;
}

function renderPreview() {
    var prev = $('tpm-preview'), text = state.text, items = state.items;
    if (!items.length) {
        prev.innerHTML = '<span class="tpm-empty">暂无识别结果，请先粘贴文本并点击「开始识别」。' +
            '识别出的敏感信息会在这里按类型着色高亮。</span>';
        return;
    }
    var html = '', pos = 0, i, it, t;
    var sorted = items.slice().sort(function (a, b) { return a.start - b.start; });
    for (i = 0; i < sorted.length; i++) {
        it = sorted[i]; t = TYPE_MAP[it.type];
        html += escapeHtml(text.slice(pos, it.start));
        html += '<mark class="tpm-mark' + (it.ignored ? ' tpm-ignored' : '') + '" data-idx="' + it.idx +
            '" style="background:' + t.bg + ';border-color:' + t.bd + ';color:' + t.color + '" title="' +
            t.name + ' #' + it.idx + (it.ignored ? '（已忽略，不参与遮盖）' : '') + '">' +
            escapeHtml(it.value) +
            '<span class="tpm-tag">' + t.name + '</span></mark>';
        pos = it.end;
    }
    html += escapeHtml(text.slice(pos));
    prev.innerHTML = html;
}

function renderList() {
    var list = $('tpm-list'), items = state.items;
    if (!items.length) {
        list.innerHTML = '<div class="tpm-empty">暂无条目。</div>';
        return;
    }
    var html = '';
    items.forEach(function (it) {
        var t = TYPE_MAP[it.type];
        html += '<div class="tpm-item' + (it.ignored ? ' is-ignored' : '') + '" data-idx="' + it.idx + '">' +
            '<span class="tpm-idx">' + it.idx + '</span>' +
            '<span class="tpm-badge" style="background:' + t.bg + ';color:' + t.color +
            ';border:1px solid ' + t.bd + '">' + t.name + '</span>' +
            '<span class="tpm-val">' + escapeHtml(it.value) + '</span>' +
            '<span class="tpm-pos">位置 ' + it.start + '</span>' +
            '<button class="tpm-btn tpm-btn-sm" data-act="toggle" data-idx="' + it.idx + '">' +
            (it.ignored ? '恢复' : '忽略') + '</button></div>';
    });
    list.innerHTML = html;
}

function renderStats() {
    var items = state.items;
    var c = countByType(items);
    var ignored = items.filter(function (it) { return it.ignored; }).length;
    var parts = [];
    TYPES.forEach(function (t) {
        if (c[t.key] > 0) parts.push(t.name + ' ' + c[t.key] + ' 条');
    });
    $('tpm-stats').innerHTML =
        '共识别 <b>' + items.length + '</b> 条' +
        (parts.length ? '（' + parts.join('、') + '）' : '') +
        '；已忽略 <b>' + ignored + '</b> 条；将遮盖 <b>' + (items.length - ignored) + '</b> 条。';
}

function currentMode() {
    var r = document.querySelector('input[name=tpm-mode]:checked');
    return r ? r.value : 'partial';
}

function doDetect() {
    state.text = $('tpm-input').value;
    $('tpm-count').textContent = '共 ' + state.text.length + ' 字符';
    if (!state.text.trim()) {
        state.items = []; state.detected = false;
        renderPreview(); renderList(); renderStats();
        $('tpm-result-sec').style.display = 'none';
        return;
    }
    state.items = detectAll(state.text, enabledMap());
    state.detected = true;
    renderPreview(); renderList(); renderStats();
    $('tpm-result-sec').style.display = 'none';
    $('tpm-mask-sec').style.display = '';
    $('tpm-cfg-sec').style.display = '';
    var tip = $('tpm-tip');
    if (state.items.length === 0) {
        tip.className = 'tpm-tip tpm-tip-ok';
        tip.textContent = '✓ 未发现敏感信息，文本看起来很干净。';
    } else {
        tip.className = 'tpm-tip tpm-tip-warn';
        tip.textContent = '⚠ 发现 ' + state.items.length + ' 处疑似敏感信息，已按类型着色标注；' +
            '误报可逐条「忽略」，确认无误后点击「一键全部遮盖」。';
    }
    tip.style.display = '';
}

function doMask() {
    if (!state.detected || !state.items.length) return;
    var cfg = readMaskCfg();
    var customChar = $('tpm-custom-char').value;
    state.masked = applyMask(state.text, state.items, currentMode(), cfg, customChar);
    $('tpm-output').value = state.masked;
    var maskedCount = state.items.filter(function (it) { return !it.ignored; }).length;
    $('tpm-out-stats').innerHTML =
        '已遮盖 <b>' + maskedCount + '</b> 条；原文 ' + state.text.length +
        ' 字符 → 脱敏后 ' + state.masked.length + ' 字符。';
    $('tpm-result-sec').style.display = '';
    $('tpm-result-sec').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function copyText(s, okMsg) {
    function done(ok) {
        var tip = $('tpm-copy-tip');
        tip.style.display = '';
        tip.className = 'tpm-copy-tip ' + (ok ? 'tpm-copy-ok' : 'tpm-copy-fail');
        tip.textContent = ok ? okMsg : '复制失败，请手动选中文本复制（Ctrl+C）。';
        setTimeout(function () { tip.style.display = 'none'; }, 3000);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(s).then(function () { done(true); }, function () { fallback(); });
    } else { fallback(); }
    function fallback() {
        try {
            var ta = document.createElement('textarea');
            ta.value = s;
            ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            done(!!ok);
        } catch (e) { done(false); }
    }
}

function downloadTxt() {
    if (!state.masked && state.masked !== '') return;
    var blob = new Blob(['\ufeff' + state.masked], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    a.href = URL.createObjectURL(blob);
    a.download = '脱敏结果_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
        '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.txt';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function onModeChange() {
    var mode = currentMode();
    $('tpm-cfg-wrap').style.display = mode === 'partial' ? '' : 'none';
    $('tpm-custom-wrap').style.display = mode === 'custom' ? '' : 'none';
}

function init() {
    buildTypeToggles();
    buildMaskCfgInputs();
    onModeChange();

    $('tpm-input').addEventListener('input', function () {
        $('tpm-count').textContent = '共 ' + this.value.length + ' 字符';
    });
    $('tpm-detect').addEventListener('click', doDetect);
    $('tpm-clear').addEventListener('click', function () {
        $('tpm-input').value = '';
        $('tpm-count').textContent = '共 0 字符';
        state.text = ''; state.items = []; state.detected = false;
        renderPreview(); renderList(); renderStats();
        $('tpm-result-sec').style.display = 'none';
        $('tpm-mask-sec').style.display = 'none';
        $('tpm-cfg-sec').style.display = 'none';
        $('tpm-tip').style.display = 'none';
        $('tpm-input').focus();
    });
    $('tpm-sample').addEventListener('click', function () {
        $('tpm-input').value = SAMPLE;
        $('tpm-count').textContent = '共 ' + SAMPLE.length + ' 字符';
        doDetect();
    });

    var modes = document.querySelectorAll('input[name=tpm-mode]');
    for (var i = 0; i < modes.length; i++) modes[i].addEventListener('change', onModeChange);

    $('tpm-mask-all').addEventListener('click', doMask);
    $('tpm-copy').addEventListener('click', function () {
        if (state.masked || state.masked === '') copyText(state.masked, '✓ 脱敏结果已复制到剪贴板。');
    });
    $('tpm-download').addEventListener('click', downloadTxt);

    $('tpm-list').addEventListener('click', function (e) {
        var btn = e.target;
        if (btn.getAttribute('data-act') !== 'toggle') return;
        var idx = +btn.getAttribute('data-idx'), i;
        for (i = 0; i < state.items.length; i++) {
            if (state.items[i].idx === idx) {
                state.items[i].ignored = !state.items[i].ignored;
                break;
            }
        }
        renderPreview(); renderList(); renderStats();
    });

    renderPreview(); renderList(); renderStats();
}

/* 浏览器环境才初始化 DOM */
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else { init(); }
}

/* Node 自测导出 */
var API = {
    TYPES: TYPES, TYPE_MAP: TYPE_MAP, MASK_CFG: MASK_CFG,
    detectAll: detectAll, applyMask: applyMask, maskValue: maskValue,
    checkId18: checkId18, checkId15: checkId15, luhnValid: luhnValid,
    countByType: countByType
};
if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
} else if (typeof window !== 'undefined') {
    window.__tpm = API;
}

})();
