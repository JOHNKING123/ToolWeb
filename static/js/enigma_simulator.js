/* 恩尼格玛密码机模拟器（Wehrmacht M3）- 纯前端
 * 口径：仅 M3 标准三转子（无四转子 / Uhr 等变体）；教学演示，不建议实际保密；
 * 非 A-Z 字符加密时原样保留且不触发转子步进。
 * 零第三方依赖、无任何后端调用、无网络请求（脚本内零 fetch/XHR）。
 *
 * 纯函数契约（非法参数抛 Error，err.field 命名）：
 *   buildEnigmaConfig({rotors, rings, starts, plugs, reflector}) -> config
 *     err.field: rotors | rings | starts | plugs | reflector
 *   stepRotors(config, positions) -> {positions, stepped, doubleStep}
 *   encryptChar(ch, config, positions) -> {cipher, positions, stepped, doubleStep}
 *     err.field: char
 *   plugboardSwap(ch, plugMap) -> ch
 *   enigmaEncrypt(text, config) -> cipherText
 *   encryptTrace(text, config) -> [ {input, output, positions, stepped, doubleStep} ] 逐字明细（UI 用）
 *
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；
 * Node 自测：module.exports 暴露纯函数与常量表。
 */
(function () {
'use strict';

/* ---- 静态数据：Wehrmacht M3 转子 / 反射器 ---- */
var ROTOR_DATA = {
    'I':   { wiring: 'EKMFLGDQVZNTOWYHXUSPAIBRCJ', notch: 'Q' },
    'II':  { wiring: 'AJDKSIRUXBLHWTMCQGZNPYFVOE', notch: 'E' },
    'III': { wiring: 'BDFHJLCPRTXVZNYEIWGAKMUSQO', notch: 'V' },
    'IV':  { wiring: 'ESOVPZJAYQUIRHXLNFTGKDCMWB', notch: 'J' },
    'V':   { wiring: 'VZBRGITYUPSDNHLXAWMJQOFECK', notch: 'Z' }
};
var ROTOR_NAMES = ['I', 'II', 'III', 'IV', 'V'];
var REFLECTOR_DATA = {
    'B': 'YRUHQSLDPXNGOKMIEBFZCWVJAT',
    'C': 'FVPJIAOYEDRZXWGCTKUQSBNMHL'
};
var REFLECTOR_NAMES = ['B', 'C'];
var MAX_PLUGS = 10;

function c2n(c) { return c.charCodeAt(0) - 65; }
function n2c(n) { return String.fromCharCode(((n % 26) + 26) % 26 + 65); }
function isAZLetter(ch) { return typeof ch === 'string' && ch.length === 1 && ch >= 'A' && ch <= 'Z'; }

function configError(field, message) {
    var e = new Error(message);
    e.field = field;
    return e;
}

/* 解析字母串：必须恰好 3 个 A-Z 字母 */
function parseLetter3(s, field) {
    if (typeof s !== 'string' || s.length !== 3) {
        throw configError(field, field + ' 必须恰好 3 个 A-Z 字母');
    }
    var out = [];
    for (var i = 0; i < 3; i++) {
        if (!isAZLetter(s[i])) throw configError(field, field + ' 必须恰好 3 个 A-Z 字母，非法字符：' + s[i]);
        out.push(c2n(s[i]));
    }
    return out;
}

/* 构建机器配置。plugs: ['AB','CD',...] 最多 10 对，每对两个不同字母、字母不重复。 */
function buildEnigmaConfig(opts) {
    opts = opts || {};
    var rotors = opts.rotors;
    if (!Array.isArray(rotors) || rotors.length !== 3) {
        throw configError('rotors', 'rotors 必须是恰好 3 枚转子的数组');
    }
    var seen = {};
    var rotorObjs = rotors.map(function (name, i) {
        if (typeof name !== 'string' || !ROTOR_DATA.hasOwnProperty(name)) {
            throw configError('rotors', 'rotors[' + i + '] 非法转子名：' + name + '（可选 I~V）');
        }
        if (seen[name]) throw configError('rotors', '转子不能重复：' + name);
        seen[name] = true;
        var d = ROTOR_DATA[name];
        return { name: name, wiring: d.wiring, notch: c2n(d.notch) };
    });
    var rings = parseLetter3(opts.rings, 'rings');
    var starts = parseLetter3(opts.starts, 'starts');
    var plugs = opts.plugs === undefined ? [] : opts.plugs;
    if (!Array.isArray(plugs) || plugs.length > MAX_PLUGS) {
        throw configError('plugs', 'plugs 必须是数组且最多 ' + MAX_PLUGS + ' 对');
    }
    var plugMap = {};
    plugs.forEach(function (pair, i) {
        if (typeof pair !== 'string' || pair.length !== 2 || !isAZLetter(pair[0]) || !isAZLetter(pair[1])) {
            throw configError('plugs', 'plugs[' + i + '] 必须为两个 A-Z 字母，如 "AB"');
        }
        if (pair[0] === pair[1]) throw configError('plugs', 'plugs[' + i + '] 不能自连：' + pair);
        if (plugMap[pair[0]] || plugMap[pair[1]]) {
            throw configError('plugs', 'plugs[' + i + '] 字母重复使用：' + pair);
        }
        plugMap[pair[0]] = pair[1];
        plugMap[pair[1]] = pair[0];
    });
    var reflector = opts.reflector;
    if (typeof reflector !== 'string' || !REFLECTOR_DATA.hasOwnProperty(reflector)) {
        throw configError('reflector', 'reflector 必须为 UKW-B 或 UKW-C（传入 "B"/"C"）');
    }
    return {
        rotors: rotorObjs,           /* [L, M, R] 左/中/右 */
        rings: rings,                /* [L, M, R] 数值 */
        starts: starts,              /* [L, M, R] 数值 */
        plugMap: plugMap,
        reflector: REFLECTOR_DATA[reflector],
        reflectorName: reflector
    };
}

/* 接线板交换：无配线返回原字符 */
function plugboardSwap(ch, plugMap) {
    if (!isAZLetter(ch)) throw configError('char', 'plugboardSwap 只处理 A-Z 字母');
    plugMap = plugMap || {};
    return plugMap[ch] || ch;
}

/* 转子步进（含 double-stepping）：按当前 window 位置判断 notch。
 * 返回 {positions:[L,M,R], stepped:{L,M,R}, doubleStep}，不修改入参。 */
function stepRotors(config, positions) {
    if (!config || !Array.isArray(positions) || positions.length !== 3) {
        throw configError('positions', 'positions 必须为 [L,M,R] 三个数值');
    }
    var notchM = config.rotors[1].notch;
    var notchR = config.rotors[2].notch;
    var atM = ((positions[1] % 26) + 26) % 26 === notchM;
    var atR = ((positions[2] % 26) + 26) % 26 === notchR;
    var p = [
        ((positions[0] % 26) + 26) % 26,
        ((positions[1] % 26) + 26) % 26,
        ((positions[2] % 26) + 26) % 26
    ];
    var stepped = { L: false, M: false, R: false };
    if (atM) { p[1] = (p[1] + 1) % 26; p[0] = (p[0] + 1) % 26; stepped.M = true; stepped.L = true; }
    if (atR) { p[1] = (p[1] + 1) % 26; stepped.M = true; }
    p[2] = (p[2] + 1) % 26; stepped.R = true;
    return { positions: p, stepped: stepped, doubleStep: atM };
}

/* 单转子正向（右→左） */
function rotorForward(rotor, ring, pos, c) {
    var idx = (((c + pos - ring) % 26) + 26) % 26;
    var w = c2n(rotor.wiring[idx]);
    return (((w - pos + ring) % 26) + 26) % 26;
}
/* 单转子反向（左→右） */
function rotorBackward(rotor, ring, pos, c) {
    var target = (((c + pos - ring) % 26) + 26) % 26;
    var idx = rotor.wiring.indexOf(n2c(target));
    return (((idx - pos + ring) % 26) + 26) % 26;
}

/* 单字符加密：先步进、再过电。返回 {cipher, positions, stepped, doubleStep}。 */
function encryptChar(ch, config, positions) {
    if (!isAZLetter(ch)) throw configError('char', 'encryptChar 只加密 A-Z 字母：' + ch);
    if (!config) throw configError('config', 'config 缺失');
    var step = stepRotors(config, positions);
    var p = step.positions;
    var c = c2n(ch);
    c = plugboardSwap(ch, config.plugMap);
    c = c2n(c);
    c = rotorForward(config.rotors[2], config.rings[2], p[2], c); /* 右 */
    c = rotorForward(config.rotors[1], config.rings[1], p[1], c); /* 中 */
    c = rotorForward(config.rotors[0], config.rings[0], p[0], c); /* 左 */
    c = c2n(config.reflector[c]);
    c = rotorBackward(config.rotors[0], config.rings[0], p[0], c);
    c = rotorBackward(config.rotors[1], config.rings[1], p[1], c);
    c = rotorBackward(config.rotors[2], config.rings[2], p[2], c);
    c = n2c(c);
    c = plugboardSwap(c, config.plugMap);
    return { cipher: c, positions: p, stepped: step.stepped, doubleStep: step.doubleStep };
}

/* 整段加密：非 A-Z 字符原样保留且不触发步进。 */
function enigmaEncrypt(text, config) {
    return encryptTrace(text, config).map(function (row) { return row.output; }).join('');
}

/* 逐字明细：[{input, output, positions, stepped, doubleStep}]，UI 可视化用 */
function encryptTrace(text, config) {
    if (typeof text !== 'string') throw configError('text', 'text 必须为字符串');
    if (!config) throw configError('config', 'config 缺失');
    var positions = config.starts.slice();
    var rows = [];
    var chars = text.toUpperCase().split('');
    chars.forEach(function (raw) {
        if (!isAZLetter(raw)) {
            rows.push({ input: raw, output: raw, positions: positions.slice(), stepped: { L: false, M: false, R: false }, doubleStep: false });
            return;
        }
        var r = encryptChar(raw, config, positions);
        rows.push({ input: raw, output: r.cipher, positions: r.positions, stepped: r.stepped, doubleStep: r.doubleStep });
        positions = r.positions;
    });
    return rows;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ROTOR_DATA: ROTOR_DATA, ROTOR_NAMES: ROTOR_NAMES,
        REFLECTOR_DATA: REFLECTOR_DATA, REFLECTOR_NAMES: REFLECTOR_NAMES, MAX_PLUGS: MAX_PLUGS,
        buildEnigmaConfig: buildEnigmaConfig, stepRotors: stepRotors,
        encryptChar: encryptChar, plugboardSwap: plugboardSwap,
        enigmaEncrypt: enigmaEncrypt, encryptTrace: encryptTrace
    };
    return;
}

/* ---------- 浏览器 UI ---------- */
function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function posLabel(p) { return n2c(p[0]) + ' ' + n2c(p[1]) + ' ' + n2c(p[2]); }

function init() {
    var $ = function (id) { return document.getElementById(id); };
    var selL = $('em-rotor-l'), selM = $('em-rotor-m'), selR = $('em-rotor-r');
    var selRef = $('em-reflector');
    var inRingL = $('em-ring-l'), inRingM = $('em-ring-m'), inRingR = $('em-ring-r');
    var inPosL = $('em-pos-l'), inPosM = $('em-pos-m'), inPosR = $('em-pos-r');
    var inPlugs = $('em-plugs');
    var inText = $('em-input'), outText = $('em-output');
    var cfgErr = $('em-cfg-error');
    var traceBody = $('em-trace-body'), traceEmpty = $('em-trace-empty');
    var winL = $('em-win-l'), winM = $('em-win-m'), winR = $('em-win-r');
    var stepNote = $('em-step-note');
    var tip = $('em-copy-tip');
    var demoTimer = null, demoRows = null, demoIdx = 0;

    [selL, selM, selR].forEach(function (sel) {
        ROTOR_NAMES.forEach(function (n) {
            var o = document.createElement('option');
            o.value = n; o.textContent = 'Walzen ' + n;
            sel.appendChild(o);
        });
    });
    selL.value = 'I'; selM.value = 'II'; selR.value = 'III';
    REFLECTOR_NAMES.forEach(function (n) {
        var o = document.createElement('option');
        o.value = n; o.textContent = 'UKW-' + n;
        selRef.appendChild(o);
    });
    selRef.value = 'B';

    function stopDemo() {
        if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
        demoRows = null; demoIdx = 0;
    }

    function normalizeLetterInput(el) {
        el.value = el.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);
    }
    [inRingL, inRingM, inRingR, inPosL, inPosM, inPosR].forEach(function (el) {
        el.addEventListener('input', function () { normalizeLetterInput(el); });
    });

    function parsePlugs() {
        var raw = inPlugs.value.toUpperCase().replace(/[^A-Z\s,;]/g, ' ');
        var tokens = raw.split(/[\s,;]+/).filter(function (t) { return t !== ''; });
        return tokens;
    }

    function readConfig() {
        return buildEnigmaConfig({
            rotors: [selL.value, selM.value, selR.value],
            rings: (inRingL.value || 'A') + (inRingM.value || 'A') + (inRingR.value || 'A'),
            starts: (inPosL.value || 'A') + (inPosM.value || 'A') + (inPosR.value || 'A'),
            plugs: parsePlugs(),
            reflector: selRef.value
        });
    }

    function showCfgError(field, message) {
        cfgErr.style.display = 'block';
        cfgErr.innerHTML = '配置无效（<b>' + esc(field) + '</b>）：' + esc(message);
    }
    function hideCfgError() { cfgErr.style.display = 'none'; cfgErr.innerHTML = ''; }

    function renderWindows(p, stepped) {
        winL.textContent = n2c(p[0]); winM.textContent = n2c(p[1]); winR.textContent = n2c(p[2]);
        [['em-win-l', stepped.L], ['em-win-m', stepped.M], ['em-win-r', stepped.R]].forEach(function (pair) {
            var el = $(pair[0]);
            el.classList.toggle('stepped', !!pair[1]);
        });
    }

    function rowHtml(row, idx) {
        var s = row.stepped;
        var tags = [];
        if (s.L) tags.push('<span class="em-tag">左步进</span>');
        if (s.M) tags.push('<span class="em-tag">中步进</span>');
        if (s.R) tags.push('<span class="em-tag">右步进</span>');
        if (row.doubleStep) tags.push('<span class="em-tag em-tag-ds">double-stepping</span>');
        if (!s.L && !s.M && !s.R) tags.push('<span class="em-tag em-tag-pass">原样保留·未步进</span>');
        return '<tr class="' + (row.doubleStep ? 'em-ds' : '') + '"><td class="em-n">' + (idx + 1) + '</td>' +
            '<td class="em-ch">' + esc(row.input) + '</td><td class="em-ch em-out">' + esc(row.output) + '</td>' +
            '<td class="em-pos">' + esc(posLabel(row.positions)) + '</td><td>' + tags.join(' ') + '</td></tr>';
    }

    function renderAll(rows) {
        stopDemo();
        traceEmpty.style.display = 'none';
        traceBody.innerHTML = rows.map(function (r, i) { return rowHtml(r, i); }).join('');
        var last = rows[rows.length - 1];
        renderWindows(last ? last.positions : readStartsOnly(), { L: false, M: false, R: false });
        var ds = rows.filter(function (r) { return r.doubleStep; }).length;
        stepNote.innerHTML = '共 <b>' + rows.length + '</b> 字符（含原样保留），其中 <b>' + ds + '</b> 次触发 double-stepping（中转子处于 notch 位时连带左转子步进）。';
    }

    function readStartsOnly() {
        try {
            var c = readConfig();
            return c.starts.slice();
        } catch (e) { return [0, 0, 0]; }
    }

    function runEncrypt() {
        var config;
        try {
            config = readConfig();
        } catch (e) {
            showCfgError(e.field || 'config', e.message);
            return;
        }
        hideCfgError();
        var rows = encryptTrace(inText.value, config);
        outText.value = rows.map(function (r) { return r.output; }).join('');
        renderAll(rows);
    }

    function runDemo() {
        var config;
        try {
            config = readConfig();
        } catch (e) {
            showCfgError(e.field || 'config', e.message);
            return;
        }
        hideCfgError();
        stopDemo();
        demoRows = encryptTrace(inText.value, config);
        if (demoRows.length === 0) {
            traceEmpty.style.display = 'block';
            traceEmpty.textContent = '明文为空，请输入 A-Z 明文后再演示。';
            return;
        }
        traceEmpty.style.display = 'none';
        traceBody.innerHTML = '';
        outText.value = '';
        demoIdx = 0;
        var ds = 0;
        demoTimer = setInterval(function () {
            if (demoIdx >= demoRows.length) {
                stopDemo();
                stepNote.innerHTML = '逐字演示完成：共 <b>' + demoRows.length + '</b> 字符，其中 <b>' + ds + '</b> 次 double-stepping。';
                return;
            }
            var row = demoRows[demoIdx];
            traceBody.insertAdjacentHTML('beforeend', rowHtml(row, demoIdx));
            renderWindows(row.positions, row.stepped);
            if (row.doubleStep) ds++;
            stepNote.innerHTML = '演示中：第 <b>' + (demoIdx + 1) + '</b> / ' + demoRows.length + ' 字符，double-stepping 累计 <b>' + ds + '</b> 次。';
            demoIdx++;
        }, 350);
    }

    function loadPreset() {
        selL.value = 'I'; selM.value = 'II'; selR.value = 'III';
        selRef.value = 'B';
        inRingL.value = 'A'; inRingM.value = 'A'; inRingR.value = 'A';
        inPosL.value = 'A'; inPosM.value = 'A'; inPosR.value = 'A';
        inPlugs.value = '';
        hideCfgError();
        renderWindows([0, 0, 0], { L: false, M: false, R: false });
    }

    function resetAll() {
        stopDemo();
        loadPreset();
        inText.value = '';
        outText.value = '';
        traceBody.innerHTML = '';
        traceEmpty.style.display = 'block';
        traceEmpty.textContent = '暂无加密记录：输入明文后点击「加密」或「逐字演示」。';
        stepNote.innerHTML = '';
    }

    function showTip(ok) {
        tip.style.display = 'block';
        tip.className = 'em-copy-tip ' + (ok ? 'em-copy-ok' : 'em-copy-fail');
        tip.textContent = ok ? '已复制到剪贴板，内容与密文输出区逐字一致。'
            : '复制失败，请手动选中密文输出区内容复制（浏览器未授予剪贴板权限时可用此方式）。';
    }
    function copyOutput() {
        var text = outText.value;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { showTip(true); }, function () { showTip(false); });
        } else {
            outText.focus();
            outText.select();
            try { showTip(document.execCommand('copy')); } catch (e) { showTip(false); }
        }
    }

    $('em-encrypt').addEventListener('click', runEncrypt);
    $('em-demo').addEventListener('click', runDemo);
    $('em-preset').addEventListener('click', loadPreset);
    $('em-reset').addEventListener('click', resetAll);
    $('em-copy').addEventListener('click', copyOutput);
    resetAll();
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}
})();
