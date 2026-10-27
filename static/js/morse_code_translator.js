/* 摩斯码翻译器 - 纯前端标准国际摩斯码双向转换
 * 数据只在浏览器里处理：零第三方依赖、无任何后端调用、无网络请求（脚本内零 fetch/XHR）。
 * 口径：只做标准国际摩斯码编解码，不做音频发报与无线电实操；摩斯码不是加密（码表公开、可逆）。
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；
 * Node 自测：module.exports 暴露纯函数（encodeText / decodeMorse / MORSE_CODE）。
 */
(function () {
'use strict';

/* 标准国际摩斯码表：字母 26、数字 10、标点 18，合计 54 项 */
var MORSE_CODE = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.',
    'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..',
    'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.',
    'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
    'Y': '-.--', 'Z': '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
    '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
    '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--',
    '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...',
    ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-',
    '"': '.-..-.', '$': '...-..-', '@': '.--.-.'
};

var REVERSE_CODE = {};
Object.keys(MORSE_CODE).forEach(function (ch) { REVERSE_CODE[MORSE_CODE[ch]] = ch; });

var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
var DIGITS = '0123456789'.split('');
var PUNCTS = ['.', ',', '?', "'", '!', '/', '(', ')', '&', ':', ';', '=', '+', '-', '_', '"', '$', '@'];

function isWhitespace(ch) {
    return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v';
}

/* 编码：文本 -> 摩斯码。返回 {morse, issues}。
 * 小写先转大写；字母间单空格；连续空白（含换行）为词分隔，编码为 ' / '；
 * 行首/行尾空白忽略、不产生空词；码表外字符记 error（含字符与第 N 个字符位置，从 1 计）并跳过。
 * 位置按字符（码位）计数，emoji 计为 1 个字符。空输入返回空结果、不记 error。 */
function encodeText(text) {
    text = String(text == null ? '' : text);
    var chars = Array.from(text);
    var issues = [];
    var words = [];
    var current = [];
    function flush() {
        if (current.length > 0) { words.push(current.join(' ')); current = []; }
    }
    chars.forEach(function (raw, idx) {
        if (isWhitespace(raw)) { flush(); return; }
        var ch = raw.toUpperCase();
        var code = MORSE_CODE[ch];
        if (code === undefined) {
            issues.push({
                type: 'error', kind: 'illegal', char: raw, position: idx + 1,
                message: '第 ' + (idx + 1) + ' 个字符「' + raw + '」为非法字符，已跳过'
            });
        } else {
            current.push(code);
        }
    });
    flush();
    issues.sort(function (a, b) { return a.position - b.position; });
    return { morse: words.join(' / '), issues: issues };
}

/* 解码：摩斯码 -> 文本。返回 {text, issues}。
 * 按 '/' 切词（两侧空白容忍），词内按空白切码，空码跳过；
 * 含 '.' '-' '/' 空白以外字符的码元记非法字符 error，定位词序号 + 码序号；
 * 查表不到的点划串记无法识别 error，定位词序号 + 码序号 + 原串；
 * 非法项跳过，其余继续解码；输出大写、词间单空格。空输入返回空结果、不记 error。 */
function decodeMorse(morse) {
    morse = String(morse == null ? '' : morse);
    var issues = [];
    var outWords = [];
    var wordParts = morse.split('/');
    wordParts.forEach(function (part, wi) {
        var wordNo = wi + 1;
        var codes = part.split(/\s+/).filter(function (c) { return c !== ''; });
        var letters = [];
        codes.forEach(function (code, ci) {
            var codeNo = ci + 1;
            if (!/^[.\-]+$/.test(code)) {
                issues.push({
                    type: 'error', kind: 'illegal', code: code, word: wordNo, codeNo: codeNo,
                    message: '第 ' + wordNo + ' 词第 ' + codeNo + ' 个码元「' + code + '」含非法字符，已跳过'
                });
                return;
            }
            var ch = REVERSE_CODE[code];
            if (ch === undefined) {
                issues.push({
                    type: 'error', kind: 'unknown', code: code, word: wordNo, codeNo: codeNo,
                    message: '第 ' + wordNo + ' 词第 ' + codeNo + ' 个码元「' + code + '」无法识别，已跳过'
                });
                return;
            }
            letters.push(ch);
        });
        if (letters.length > 0) { outWords.push(letters.join('')); }
    });
    issues.sort(function (a, b) {
        if (a.word !== b.word) return a.word - b.word;
        return a.codeNo - b.codeNo;
    });
    return { text: outWords.join(' '), issues: issues };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MORSE_CODE: MORSE_CODE, REVERSE_CODE: REVERSE_CODE,
        LETTERS: LETTERS, DIGITS: DIGITS, PUNCTS: PUNCTS,
        encodeText: encodeText, decodeMorse: decodeMorse
    };
    return;
}

/* ---------- 浏览器 UI ---------- */
function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderTable(elId, chars) {
    var el = document.getElementById(elId);
    if (!el) return;
    var html = '<table class="mc-table"><thead><tr><th>字符</th><th>摩斯码</th></tr></thead><tbody>';
    chars.forEach(function (ch) {
        html += '<tr><td class="mc-char">' + esc(ch) + '</td><td>' + esc(MORSE_CODE[ch]) + '</td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
}

function init() {
    var dirText = document.getElementById('mc-dir-text');
    var dirMorse = document.getElementById('mc-dir-morse');
    var input = document.getElementById('mc-input');
    var output = document.getElementById('mc-output');
    var stats = document.getElementById('mc-stats');
    var issuesEl = document.getElementById('mc-issues');
    var tip = document.getElementById('mc-copy-tip');
    var direction = 'encode';

    renderTable('mc-table-letters', LETTERS);
    renderTable('mc-table-digits', DIGITS);
    renderTable('mc-table-puncts', PUNCTS);

    function setDirection(d) {
        direction = d;
        var isEncode = d === 'encode';
        dirText.setAttribute('aria-pressed', isEncode ? 'true' : 'false');
        dirMorse.setAttribute('aria-pressed', isEncode ? 'false' : 'true');
        dirText.className = 'mc-btn ' + (isEncode ? 'mc-btn-primary' : 'mc-btn-secondary');
        dirMorse.className = 'mc-btn ' + (isEncode ? 'mc-btn-secondary' : 'mc-btn-primary');
        input.placeholder = isEncode
            ? '在此输入文本，例如：HELLO WORLD\n小写会自动转大写，空格与换行均为词分隔。'
            : '在此输入摩斯码，例如：.... . .-.. .-.. --- / .-- --- .-. .-.. -..\n词之间用 / 分隔，码之间用空格分隔。';
        document.getElementById('mc-input-label').textContent = isEncode ? '输入文本' : '输入摩斯码';
        document.getElementById('mc-output-label').textContent = isEncode ? '摩斯码输出' : '文本输出';
        convert();
    }

    function convert() {
        var value = input.value;
        if (direction === 'encode') {
            var r = encodeText(value);
            output.value = r.morse;
            var total = Array.from(value).length;
            var valid = 0;
            Array.from(value).forEach(function (ch) {
                if (!isWhitespace(ch) && MORSE_CODE[ch.toUpperCase()] !== undefined) valid++;
            });
            stats.innerHTML = '输入字符数：<b>' + total + '</b>　有效字符数：<b>' + valid +
                '</b>　非法字符数：<b>' + r.issues.length + '</b>';
            renderIssues(r.issues, value.trim() === '');
        } else {
            var d = decodeMorse(value);
            output.value = d.text;
            var tokens = value.split('/').reduce(function (n, part) {
                return n + part.split(/\s+/).filter(function (c) { return c !== ''; }).length;
            }, 0);
            var validCodes = tokens - d.issues.length;
            stats.innerHTML = '码元数：<b>' + tokens + '</b>　有效码元数：<b>' + validCodes +
                '</b>　非法／无法识别数：<b>' + d.issues.length + '</b>';
            renderIssues(d.issues, value.trim() === '');
        }
    }

    function renderIssues(issues, empty) {
        if (empty) {
            issuesEl.innerHTML = '<div class="mc-empty">输入为空，请输入内容后查看转换结果。</div>';
            return;
        }
        if (issues.length === 0) {
            issuesEl.innerHTML = '<div class="mc-empty">没有问题：全部内容均已成功转换。</div>';
            return;
        }
        var html = '';
        issues.forEach(function (it) {
            html += '<div class="mc-issue mc-err"><span class="mc-line">' +
                (it.position !== undefined ? '第 ' + it.position + ' 个字符' : '第 ' + it.word + ' 词第 ' + it.codeNo + ' 个码元') +
                '</span><span class="mc-kind">' + (it.kind === 'unknown' ? '无法识别' : '非法字符') + '</span><span>' + esc(it.message) + '</span></div>';
        });
        issuesEl.innerHTML = html;
    }

    function loadSample() {
        input.value = direction === 'encode' ? 'HELLO WORLD' : '.... . .-.. .-.. --- / .-- --- .-. .-.. -..';
        convert();
    }

    function showTip(ok) {
        tip.style.display = 'block';
        tip.className = 'mc-copy-tip ' + (ok ? 'mc-copy-ok' : 'mc-copy-fail');
        tip.textContent = ok ? '已复制到剪贴板，内容与输出区逐字一致。'
            : '复制失败，请手动选中输出区内容复制（浏览器未授予剪贴板权限时可用此方式）。';
    }

    function copyOutput() {
        var text = output.value;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { showTip(true); }, function () { showTip(false); });
        } else {
            output.focus();
            output.select();
            try { showTip(document.execCommand('copy')); } catch (e) { showTip(false); }
        }
    }

    dirText.addEventListener('click', function () { setDirection('encode'); });
    dirMorse.addEventListener('click', function () { setDirection('decode'); });
    input.addEventListener('input', convert);
    document.getElementById('mc-convert').addEventListener('click', convert);
    document.getElementById('mc-sample').addEventListener('click', loadSample);
    document.getElementById('mc-clear').addEventListener('click', function () { input.value = ''; convert(); });
    document.getElementById('mc-copy').addEventListener('click', copyOutput);
    setDirection('encode');
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}
})();
