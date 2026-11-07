/* 罗马数字转换（roman_numeral_converter）- 纯前端（零后端、零上传）
 *
 * 纯逻辑层（RN-CORE）：阿拉伯数字（1–3999）↔ 罗马数字双向换算，浏览器本地完成。
 * 标准记法：13 组符号值（M 1000、CM 900、D 500、CD 400、C 100、XC 90、L 50、
 * XL 40、X 10、IX 9、V 5、IV 4、I 1），减法组合仅 IV／IX／XL／XC／CD／CM 六组。
 * fromRoman 采用「贪心解析后重编码比对」校验规范形式：解析值再经 toRoman
 * 重编码，与归一化输入逐字比对，不一致即判为非法写法——IIII、VV、IL、VX、
 * IC、XM、IXI、MCMCM 等一律报错；罗马数字小写宽容接受，输出统一大写。
 * 只做阿拉伯数字↔罗马数字换算，不做进制换算（请用进制换算工具）、不做字符
 * 编码转换（请用中文编码转换器）。不引第三方库、不走 CDN；模板零外部静态资源。
 */
(function () {
'use strict';

var MIN = 1;
var MAX = 3999;
var MAX_BATCH_LINES = 1000;

/* 标准 13 组符号值对照表（自大到小） */
var ROMAN_TABLE = [
    { symbol: 'M',  value: 1000 },
    { symbol: 'CM', value: 900 },
    { symbol: 'D',  value: 500 },
    { symbol: 'CD', value: 400 },
    { symbol: 'C',  value: 100 },
    { symbol: 'XC', value: 90 },
    { symbol: 'L',  value: 50 },
    { symbol: 'XL', value: 40 },
    { symbol: 'X',  value: 10 },
    { symbol: 'IX', value: 9 },
    { symbol: 'V',  value: 5 },
    { symbol: 'IV', value: 4 },
    { symbol: 'I',  value: 1 }
];

var ROMAN_VALUES = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
/* 仅有的六组合法减法组合 */
var SUBTRACTIVE = ['IV', 'IX', 'XL', 'XC', 'CD', 'CM'];

/* 5 组预设示例：年份／章节／钟表／版权页／边界 */
var SAMPLES = [
    { label: '今年年份',   note: '2026 年',        arabic: 2026, roman: 'MMXXVI' },
    { label: '章节序号',   note: '第 12 章',       arabic: 12,   roman: 'XII' },
    { label: '钟表刻度',   note: '钟表 3 点',      arabic: 3,    roman: 'III' },
    { label: '版权页年份', note: '1984 年',        arabic: 1984, roman: 'MCMLXXXIV' },
    { label: '最大值边界', note: '3999（上限）',   arabic: 3999, roman: 'MMMCMXCIX' }
];

/* 常用速查：1–20、50／100／500／1000、常见年份 */
var QUICK_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 50, 100, 500, 1000];
var QUICK_YEARS = [1949, 1984, 1999, 2000, 2008, 2024, 2025, 2026];

function makeError(field, message) {
    var e = new Error(message);
    e.field = field;
    return e;
}

function trim(s) { return s.replace(/^\s+|\s+$/g, ''); }

/* ---------- 阿拉伯数字 → 罗马数字 ---------- */
function toRoman(num) {
    if (typeof num !== 'number' || !isFinite(num) || Math.floor(num) !== num) {
        throw makeError('arabic', '阿拉伯数字须为整数：请输入 1–3999 的整数');
    }
    if (num < MIN) {
        throw makeError('arabic', '罗马数字没有 0 与负数：请输入 1–3999 的整数');
    }
    if (num > MAX) {
        throw makeError('arabic', '超出范围：标准罗马数字只支持 1–3999，3999 以上需上划线记法，本工具不支持');
    }
    var out = '';
    var rest = num;
    for (var i = 0; i < ROMAN_TABLE.length; i++) {
        while (rest >= ROMAN_TABLE[i].value) {
            out += ROMAN_TABLE[i].symbol;
            rest -= ROMAN_TABLE[i].value;
        }
    }
    return out;
}

/* ---------- 罗马数字 → 阿拉伯数字（规范形式校验） ---------- */
function fromRoman(str) {
    if (typeof str !== 'string') {
        throw makeError('roman', '请输入罗马数字');
    }
    var s = trim(str).toUpperCase();
    if (!s) {
        throw makeError('roman', '罗马数字不能为空');
    }
    var i;
    for (i = 0; i < s.length; i++) {
        if (!ROMAN_VALUES[s.charAt(i)]) {
            throw makeError('roman', '非法罗马字符「' + s.charAt(i) + '」：只允许 I、V、X、L、C、D、M 七个字母');
        }
    }
    var total = 0;
    for (i = 0; i < s.length; i++) {
        var v = ROMAN_VALUES[s.charAt(i)];
        var next = i + 1 < s.length ? ROMAN_VALUES[s.charAt(i + 1)] : 0;
        if (v < next) { total -= v; } else { total += v; }
    }
    if (total < MIN || total > MAX) {
        throw makeError('roman', '解析结果超出 1–3999：标准罗马数字只支持 1–3999');
    }
    /* 重编码比对：非规范写法（IIII、VV、IL、VX、IC、XM 等）重编码后不一致 */
    if (toRoman(total) !== s) {
        throw makeError('roman', '不是规范罗马数字写法：减法组合仅 IV（4）、IX（9）、XL（40）、XC（90）、CD（400）、CM（900）六组；IIII、VV、IL、VX、IC、XM 等写法无效，请改写为 IV、V、XLIX、XV、XCIX、CMXL 等规范形式');
    }
    return total;
}

/* 不抛错的校验：非法输入一律返回 false */
function isValidRoman(str) {
    if (typeof str !== 'string') { return false; }
    try { fromRoman(str); return true; }
    catch (e) { return false; }
}

/* ---------- 逐位拆解 ---------- */
/* decompose(2026) = [{M,1000,2},{X,10,2},{V,5,1},{I,1,1}] */
function decompose(num) {
    if (typeof num !== 'number' || !isFinite(num) || Math.floor(num) !== num) {
        throw makeError('arabic', '阿拉伯数字须为整数：请输入 1–3999 的整数');
    }
    if (num < MIN || num > MAX) {
        throw makeError('arabic', '请输入 1–3999 的整数');
    }
    var out = [];
    var rest = num;
    for (var i = 0; i < ROMAN_TABLE.length; i++) {
        var count = 0;
        while (rest >= ROMAN_TABLE[i].value) {
            rest -= ROMAN_TABLE[i].value;
            count++;
        }
        if (count > 0) {
            out.push({ symbol: ROMAN_TABLE[i].symbol, value: ROMAN_TABLE[i].value, count: count });
        }
    }
    return out;
}

function decomposeRoman(str) {
    return decompose(fromRoman(str));
}

/* ---------- 单行换算（批量复用） ---------- */
/* 成功：{input, ok:true, kind:'arabic'|'roman', arabic, roman}
 * 失败：{input, ok:false, kind, error}；空行返回 null（批量时跳过） */
function convertLine(line) {
    if (typeof line !== 'string') {
        throw makeError('line', '请输入文本行');
    }
    var s = trim(line);
    if (!s) { return null; }
    if (/^[+-]?\d+(\.\d+)?$/.test(s)) {
        var n = parseFloat(s);
        try {
            return { input: line, ok: true, kind: 'arabic', arabic: n, roman: toRoman(n) };
        } catch (e) {
            return { input: line, ok: false, kind: 'arabic', error: e.message };
        }
    }
    if (/^[A-Za-z]+$/.test(s)) {
        try {
            var v = fromRoman(s);
            return { input: line, ok: true, kind: 'roman', arabic: v, roman: toRoman(v) };
        } catch (e) {
            return { input: line, ok: false, kind: 'roman', error: e.message };
        }
    }
    return { input: line, ok: false, kind: 'unknown', error: '无法识别：每行请输入 1–3999 的阿拉伯数字或罗马数字（如 2026 或 MMXXVI）' };
}

/* ---------- 批量换算：每行一个，逐行出结果（跳过空行） ---------- */
function convertBatch(text) {
    if (typeof text !== 'string') {
        throw makeError('batch', '请输入要批量换算的文本');
    }
    var lines = text.split(/\r\n|\r|\n/);
    if (lines.length > MAX_BATCH_LINES) {
        throw makeError('batch', '批量最多 ' + MAX_BATCH_LINES + ' 行：当前 ' + lines.length + ' 行，请分批换算');
    }
    var out = [];
    for (var i = 0; i < lines.length; i++) {
        var r = convertLine(lines[i]);
        if (r) { out.push(r); }
    }
    return out;
}

/* ---------- 批量统计 ---------- */
function batchStats(results) {
    if (!results || Object.prototype.toString.call(results) !== '[object Array]') {
        throw makeError('batch', '批量结果须为数组');
    }
    var st = { total: results.length, ok: 0, fail: 0, arabicToRoman: 0, romanToArabic: 0 };
    for (var i = 0; i < results.length; i++) {
        var r = results[i];
        if (r.ok) {
            st.ok++;
            if (r.kind === 'arabic') { st.arabicToRoman++; }
            else if (r.kind === 'roman') { st.romanToArabic++; }
        } else {
            st.fail++;
        }
    }
    return st;
}

var API = {
    MIN: MIN,
    MAX: MAX,
    MAX_BATCH_LINES: MAX_BATCH_LINES,
    table: ROMAN_TABLE,
    subtractive: SUBTRACTIVE,
    samples: SAMPLES,
    quickValues: QUICK_VALUES,
    quickYears: QUICK_YEARS,
    toRoman: toRoman,
    fromRoman: fromRoman,
    isValidRoman: isValidRoman,
    convertLine: convertLine,
    convertBatch: convertBatch,
    decompose: decompose,
    decomposeRoman: decomposeRoman,
    batchStats: batchStats
};

if (typeof window !== 'undefined') window.RomanNumeralConverter = API;
if (typeof module !== 'undefined' && module.exports) module.exports = API;

/* ================= DOM 层（仅浏览器） ================= */

if (typeof document !== 'undefined') {
    (function () {
        function $(id) { return document.getElementById(id); }
        function escapeHtml(s) {
            return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        var arabicEl, romanEl, errArabicEl, errRomanEl, decomposeEl, symbolTableEl,
            batchEl, batchResultsEl, batchStatsEl, quickEl, quickYearsEl, presetsEl,
            statsEl, outputEl, tipEl;
        var lastBatch = [];
        var lastSingle = null;

        function showErr(el, msg) {
            if (!el) { return; }
            if (msg) { el.textContent = msg; el.style.display = 'block'; }
            else { el.textContent = ''; el.style.display = 'none'; }
        }

        function renderDecompose(num) {
            if (!decomposeEl) { return; }
            var parts;
            try { parts = decompose(num); } catch (e) { decomposeEl.innerHTML = '<span class="rn-muted">换算成功后，这里按位拆解显示每一组符号的数值与个数。</span>'; return; }
            var rows = parts.map(function (p) {
                return '<tr><td>' + escapeHtml(p.symbol) + '</td><td>' + p.value +
                    '</td><td>× ' + p.count + '</td><td>' + (p.value * p.count) + '</td></tr>';
            }).join('');
            decomposeEl.innerHTML = '<table class="rn-decomp-table"><thead><tr><th>符号</th><th>单值</th><th>个数</th><th>小计</th></tr></thead><tbody>' +
                rows + '</tbody></table>' +
                '<p class="rn-decomp-sum">' + num + ' = ' +
                parts.map(function (p) { return p.value + '×' + p.count; }).join(' + ') +
                '，即 ' + escapeHtml(toRoman(num)) + '</p>';
        }

        function renderSymbolTable() {
            if (!symbolTableEl) { return; }
            var rows = ROMAN_TABLE.map(function (t) {
                return '<tr><td><b>' + escapeHtml(t.symbol) + '</b></td><td>' + t.value + '</td><td>' +
                    (t.symbol.length === 2 ? '减法组合：' + t.symbol.charAt(1) + ' − ' + t.symbol.charAt(0) + '（' + ROMAN_VALUES[t.symbol.charAt(1)] + ' − ' + ROMAN_VALUES[t.symbol.charAt(0)] + '）' : '基本符号') + '</td></tr>';
            }).join('');
            symbolTableEl.innerHTML = '<table class="rn-decomp-table"><thead><tr><th>符号</th><th>数值</th><th>说明</th></tr></thead><tbody>' + rows + '</tbody></table>';
        }

        function renderStats() {
            if (!statsEl) { return; }
            var bs = batchStats(lastBatch);
            var cells = [
                { v: lastSingle ? lastSingle.arabic : '—', s: '当前阿拉伯数字' },
                { v: lastSingle ? lastSingle.roman : '—', s: '当前罗马数字' },
                { v: bs.total, s: '批量行数' },
                { v: bs.ok, s: '批量成功' },
                { v: bs.fail, s: '批量失败' },
                { v: bs.arabicToRoman, s: '数字→罗马' },
                { v: bs.romanToArabic, s: '罗马→数字' }
            ];
            statsEl.innerHTML = cells.map(function (c) {
                return '<div class="rn-stat"><b>' + escapeHtml(String(c.v)) + '</b><span>' + c.s + '</span></div>';
            }).join('');
        }

        function renderOutput() {
            if (!outputEl) { return; }
            var lines = [];
            if (lastSingle) {
                lines.push(lastSingle.arabic + ' = ' + lastSingle.roman);
            }
            lastBatch.forEach(function (r) {
                if (r.ok) { lines.push(r.input + ' → ' + r.arabic + ' = ' + r.roman); }
                else { lines.push(r.input + ' → 错误：' + r.error); }
            });
            outputEl.value = lines.join('\n');
        }

        function refreshAll() { renderStats(); renderOutput(); }

        function setPair(arabic, roman) {
            lastSingle = { arabic: arabic, roman: roman };
            renderDecompose(arabic);
            refreshAll();
        }

        function onArabicInput() {
            var raw = arabicEl.value;
            if (trim(raw) === '') {
                showErr(errArabicEl, '');
                romanEl.value = '';
                lastSingle = null;
                decomposeEl.innerHTML = '<span class="rn-muted">换算成功后，这里按位拆解显示每一组符号的数值与个数。</span>';
                refreshAll();
                return;
            }
            try {
                var n = Number(trim(raw));
                if (trim(raw) === '' || isNaN(n)) { throw makeError('arabic', '请输入 1–3999 的整数'); }
                var r = toRoman(n);
                showErr(errArabicEl, '');
                romanEl.value = r;
                setPair(n, r);
            } catch (e) {
                showErr(errArabicEl, e.message);
                romanEl.value = '';
                lastSingle = null;
                decomposeEl.innerHTML = '<span class="rn-muted">换算成功后，这里按位拆解显示每一组符号的数值与个数。</span>';
                refreshAll();
            }
        }

        function onRomanInput() {
            var raw = romanEl.value;
            if (trim(raw) === '') {
                showErr(errRomanEl, '');
                arabicEl.value = '';
                lastSingle = null;
                decomposeEl.innerHTML = '<span class="rn-muted">换算成功后，这里按位拆解显示每一组符号的数值与个数。</span>';
                refreshAll();
                return;
            }
            try {
                var v = fromRoman(raw);
                showErr(errRomanEl, '');
                arabicEl.value = String(v);
                setPair(v, toRoman(v));
            } catch (e) {
                showErr(errRomanEl, e.message);
                arabicEl.value = '';
                lastSingle = null;
                decomposeEl.innerHTML = '<span class="rn-muted">换算成功后，这里按位拆解显示每一组符号的数值与个数。</span>';
                refreshAll();
            }
        }

        function fillPair(arabic) {
            arabicEl.value = String(arabic);
            romanEl.value = toRoman(arabic);
            showErr(errArabicEl, '');
            showErr(errRomanEl, '');
            setPair(arabic, toRoman(arabic));
        }

        function renderQuick() {
            if (quickEl) {
                quickEl.innerHTML = QUICK_VALUES.map(function (n) {
                    return '<button type="button" class="rn-chip" data-n="' + n + '">' + n + ' = ' + toRoman(n) + '</button>';
                }).join('');
            }
            if (quickYearsEl) {
                quickYearsEl.innerHTML = QUICK_YEARS.map(function (n) {
                    return '<button type="button" class="rn-chip" data-n="' + n + '">' + n + ' 年 = ' + toRoman(n) + '</button>';
                }).join('');
            }
            var chips = document.querySelectorAll('.rn-chip');
            for (var i = 0; i < chips.length; i++) {
                chips[i].addEventListener('click', function () {
                    fillPair(parseInt(this.getAttribute('data-n'), 10));
                });
            }
        }

        function renderPresets() {
            if (!presetsEl) { return; }
            presetsEl.innerHTML = SAMPLES.map(function (s, i) {
                return '<button type="button" class="rn-preset-btn" data-i="' + i + '">' +
                    escapeHtml(s.label) + '：' + s.arabic + ' = ' + escapeHtml(s.roman) +
                    '（' + escapeHtml(s.note) + '）</button>';
            }).join('');
            var btns = presetsEl.querySelectorAll('.rn-preset-btn');
            for (var i = 0; i < btns.length; i++) {
                btns[i].addEventListener('click', function () {
                    fillPair(SAMPLES[parseInt(this.getAttribute('data-i'), 10)].arabic);
                });
            }
        }

        function renderBatch() {
            if (!batchResultsEl) { return; }
            if (!lastBatch.length) {
                batchResultsEl.innerHTML = '<span class="rn-muted">批量换算后，每行结果会出现在这里（成功行显示双向对照，失败行逐条显示错误原因）。</span>';
                return;
            }
            batchResultsEl.innerHTML = lastBatch.map(function (r) {
                if (r.ok) {
                    return '<div class="rn-batch-row rn-batch-ok"><span class="rn-batch-in">' + escapeHtml(r.input) +
                        '</span><span class="rn-batch-arrow">→</span><span><b>' + r.arabic + '</b> = <b>' +
                        escapeHtml(r.roman) + '</b></span></div>';
                }
                return '<div class="rn-batch-row rn-batch-err"><span class="rn-batch-in">' + escapeHtml(r.input) +
                    '</span><span class="rn-batch-arrow">→</span><span>' + escapeHtml(r.error) + '</span></div>';
            }).join('');
        }

        function doBatch() {
            var text = batchEl.value;
            if (trim(text) === '') {
                lastBatch = [];
                renderBatch();
                if (batchStatsEl) { batchStatsEl.textContent = ''; }
                refreshAll();
                return;
            }
            try {
                lastBatch = convertBatch(text);
                renderBatch();
                var bs = batchStats(lastBatch);
                if (batchStatsEl) {
                    batchStatsEl.textContent = '共 ' + bs.total + ' 行，成功 ' + bs.ok + ' 行（数字→罗马 ' +
                        bs.arabicToRoman + '，罗马→数字 ' + bs.romanToArabic + '），失败 ' + bs.fail + ' 行。';
                }
                refreshAll();
            } catch (e) {
                if (batchStatsEl) { batchStatsEl.textContent = e.message; }
            }
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

        function downloadTxt() {
            var text = outputEl.value;
            if (!text) {
                if (tipEl) { tipEl.textContent = '暂无可下载的结果：请先换算或批量换算。'; tipEl.style.display = 'block'; }
                return;
            }
            var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = '罗马数字换算结果.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
            if (tipEl) { tipEl.textContent = '已下载「罗马数字换算结果.txt」。'; tipEl.style.display = 'block'; }
        }

        function clearAll() {
            arabicEl.value = '';
            romanEl.value = '';
            batchEl.value = '';
            showErr(errArabicEl, '');
            showErr(errRomanEl, '');
            lastSingle = null;
            lastBatch = [];
            decomposeEl.innerHTML = '<span class="rn-muted">换算成功后，这里按位拆解显示每一组符号的数值与个数。</span>';
            renderBatch();
            if (batchStatsEl) { batchStatsEl.textContent = ''; }
            if (tipEl) { tipEl.style.display = 'none'; }
            refreshAll();
        }

        document.addEventListener('DOMContentLoaded', function () {
            arabicEl = $('rn-arabic');
            romanEl = $('rn-roman');
            errArabicEl = $('rn-err-arabic');
            errRomanEl = $('rn-err-roman');
            decomposeEl = $('rn-decompose');
            symbolTableEl = $('rn-symbol-table');
            batchEl = $('rn-batch-input');
            batchResultsEl = $('rn-batch-results');
            batchStatsEl = $('rn-batch-stats');
            quickEl = $('rn-quick');
            quickYearsEl = $('rn-quick-years');
            presetsEl = $('rn-presets');
            statsEl = $('rn-stats');
            outputEl = $('rn-output');
            tipEl = $('rn-tip');
            if (!arabicEl || !romanEl) { return; }

            renderSymbolTable();
            renderQuick();
            renderPresets();
            renderBatch();
            renderStats();

            arabicEl.addEventListener('input', onArabicInput);
            romanEl.addEventListener('input', onRomanInput);
            var batchBtn = $('rn-batch-btn');
            if (batchBtn) { batchBtn.addEventListener('click', doBatch); }
            if (batchEl) { batchEl.addEventListener('input', doBatch); }
            var copyBtn = $('rn-copy-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', function () {
                    var text = outputEl.value;
                    if (!text) {
                        if (tipEl) { tipEl.textContent = '暂无可复制的结果：请先换算或批量换算。'; tipEl.style.display = 'block'; }
                        return;
                    }
                    copyText(text, '已复制换算结果。');
                });
            }
            var dlBtn = $('rn-download-btn');
            if (dlBtn) { dlBtn.addEventListener('click', downloadTxt); }
            var clearBtn = $('rn-clear');
            if (clearBtn) { clearBtn.addEventListener('click', clearAll); }
        });
    })();
}

})();
