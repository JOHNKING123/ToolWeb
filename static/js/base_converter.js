/* 进制转换器 - 纯前端，大整数用 BigInt 精确换算，零后端、零 CDN */
(function () {
    'use strict';

    var RADICES = [2, 8, 10, 16, 32];
    var NAMES = { 2: '二进制', 8: '八进制', 10: '十进制', 16: '十六进制', 32: '三十二进制' };
    var PREFIX_HINT = { 2: 'BIN', 8: 'OCT', 10: 'DEC', 16: 'HEX', 32: 'BASE32' };

    var inputEl, radixInputs, errorEl, prefixSwitch, groupSwitch, groupSizeEl, cardsEl, prefixNoteEl;

    // 各进制合法字符（小写）
    function validChars(radix) {
        if (radix === 2) return '01';
        if (radix === 8) return '01234567';
        if (radix === 10) return '0123456789';
        if (radix === 16) return '0123456789abcdef';
        return '0123456789abcdefghijklmnopqrstuv'; // 32 进制: 0-9a-v
    }

    // 当前选择的输入进制
    function selectedRadix() {
        for (var i = 0; i < radixInputs.length; i++) {
            if (radixInputs[i].checked) return parseInt(radixInputs[i].value, 10);
        }
        return 10;
    }

    // 解析输入 -> { value: BigInt, radix: n } 或 { error: msg }
    function parseInput(raw) {
        var s = raw.replace(/[\s_]/g, ''); // 容忍空格与下划线分隔符
        if (s === '') return { empty: true };
        var negative = false;
        if (s[0] === '-') {
            negative = true;
            s = s.slice(1);
        }
        if (s === '') return { error: '输入为空，请输入数字。' };

        var radix = selectedRadix();
        var prefix = '';
        var lower = s.toLowerCase();
        if (lower.indexOf('0x') === 0) { radix = 16; prefix = '0x'; s = s.slice(2); }
        else if (lower.indexOf('0b') === 0) { radix = 2; prefix = '0b'; s = s.slice(2); }
        else if (lower.indexOf('0o') === 0) { radix = 8; prefix = '0o'; s = s.slice(2); }
        if (s === '') return { error: '前缀后没有数字，请输入有效数字。' };

        var chars = validChars(radix);
        var sl = s.toLowerCase();
        for (var i = 0; i < sl.length; i++) {
            if (chars.indexOf(sl[i]) === -1) {
                return {
                    error: '非法字符 "' + s[i] + '"：' + NAMES[radix] + '只允许 ' + displayCharset(radix) + '。'
                };
            }
        }

        // 手工按进制累加，精度无损（不经过 Number）
        var bigRadix = BigInt(radix);
        var v = 0n;
        for (var j = 0; j < sl.length; j++) {
            var d = chars.indexOf(sl[j]);
            v = v * bigRadix + BigInt(d);
        }
        if (negative) v = -v;
        return { value: v, radix: radix, prefix: prefix };
    }

    function displayCharset(radix) {
        if (radix === 2) return '0、1';
        if (radix === 8) return '0~7';
        if (radix === 10) return '0~9';
        if (radix === 16) return '0~9、A~F（不区分大小写）';
        return '0~9、A~V（不区分大小写）';
    }

    // 按分组插入空格（从右向左）
    function groupDigits(str, size) {
        var neg = str[0] === '-';
        if (neg) str = str.slice(1);
        var out = '';
        var count = 0;
        for (var i = str.length - 1; i >= 0; i--) {
            out = str[i] + out;
            count++;
            if (count % size === 0 && i !== 0) out = ' ' + out;
        }
        return neg ? '-' + out : out;
    }

    function render(parsed) {
        var useGrouping = groupSwitch.checked;
        var size = parseInt(groupSizeEl.value, 10);
        var hexPrefix = prefixSwitch.checked;

        RADICES.forEach(function (radix) {
            var card = document.getElementById('bc-card-' + radix);
            var valEl = card.querySelector('.bc-value');
            var copyBtn = card.querySelector('.bc-copy');
            var raw = parsed.value.toString(radix).toUpperCase();
            var display = raw;
            if (radix === 16 && hexPrefix && raw[0] !== '-') display = '0x' + raw;
            if (radix === 16 && hexPrefix && raw[0] === '-') display = '-0x' + raw.slice(1);
            if (useGrouping) {
                var body = display;
                var head = '';
                if (display.indexOf('0x') === 0) { head = '0x'; body = display.slice(2); }
                else if (display.indexOf('-0x') === 0) { head = '-0x'; body = display.slice(3); }
                display = head + groupDigits(body, size);
            }
            valEl.textContent = display;
            copyBtn.setAttribute('data-copy', raw);
            copyBtn.disabled = false;
            if (radix === parsed.radix) card.classList.add('bc-current'); else card.classList.remove('bc-current');
        });

        // 前缀识别提示
        if (parsed.prefix) {
            prefixNoteEl.style.display = 'block';
            prefixNoteEl.textContent = '已自动识别前缀 ' + parsed.prefix + '，按' + NAMES[parsed.radix] + '解析。';
        } else {
            prefixNoteEl.style.display = 'none';
        }
    }

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
        inputEl.classList.add('bc-invalid');
    }

    function clearError() {
        errorEl.style.display = 'none';
        errorEl.textContent = '';
        inputEl.classList.remove('bc-invalid');
    }

    function update() {
        var raw = inputEl.value;
        var parsed = parseInput(raw);
        if (parsed.empty) {
            clearError();
            prefixNoteEl.style.display = 'none';
            RADICES.forEach(function (radix) {
                var card = document.getElementById('bc-card-' + radix);
                card.querySelector('.bc-value').textContent = '—';
                card.querySelector('.bc-copy').disabled = true;
                card.classList.remove('bc-current');
            });
            return;
        }
        if (parsed.error) {
            showError(parsed.error);
            prefixNoteEl.style.display = 'none';
            return;
        }
        clearError();
        render(parsed);
    }

    function copyText(text, btn) {
        function done() {
            var old = btn.textContent;
            btn.textContent = '✓ 已复制';
            setTimeout(function () { btn.textContent = old; }, 1500);
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
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
    }

    function bind() {
        inputEl = document.getElementById('bc-input');
        radixInputs = document.getElementsByName('bc-radix');
        errorEl = document.getElementById('bc-error');
        prefixSwitch = document.getElementById('bc-prefix-switch');
        groupSwitch = document.getElementById('bc-group-switch');
        groupSizeEl = document.getElementById('bc-group-size');
        prefixNoteEl = document.getElementById('bc-prefix-note');
        cardsEl = document.getElementById('bc-cards');

        var timer = null;
        inputEl.addEventListener('input', function () {
            clearTimeout(timer);
            timer = setTimeout(update, 120);
        });

        for (var i = 0; i < radixInputs.length; i++) {
            radixInputs[i].addEventListener('change', update);
        }
        prefixSwitch.addEventListener('change', update);
        groupSwitch.addEventListener('change', update);
        groupSizeEl.addEventListener('change', update);

        document.getElementById('bc-clear').addEventListener('click', function () {
            inputEl.value = '';
            update();
            inputEl.focus();
        });

        cardsEl.addEventListener('click', function (e) {
            var btn = e.target.closest('.bc-copy');
            if (!btn || btn.disabled) return;
            copyText(btn.getAttribute('data-copy'), btn);
        });

        document.querySelectorAll('.bc-example').forEach(function (btn) {
            btn.addEventListener('click', function () {
                inputEl.value = btn.getAttribute('data-input');
                // 示例若带前缀：自动选中对应进制，保持体验一致
                var v = inputEl.value.toLowerCase();
                var r = 10;
                if (v.indexOf('-0x') === 0 || v.indexOf('0x') === 0) r = 16;
                else if (v.indexOf('-0b') === 0 || v.indexOf('0b') === 0) r = 2;
                else if (v.indexOf('-0o') === 0 || v.indexOf('0o') === 0) r = 8;
                for (var i = 0; i < radixInputs.length; i++) {
                    radixInputs[i].checked = (parseInt(radixInputs[i].value, 10) === r);
                }
                update();
                inputEl.focus();
            });
        });

        update();
    }

    document.addEventListener('DOMContentLoaded', bind);
})();
