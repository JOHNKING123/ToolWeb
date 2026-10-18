/* 单位换算器 - 纯前端，四分类（长度/重量/温度/数据存储），零后端、零 CDN */
(function () {
    'use strict';

    // ---- 单位定义：factor 为换算到基准单位的倍率；温度单独走公式 ----
    var CATS = {
        length: {
            name: '长度', base: 'm',
            units: [
                { id: 'mm', label: '毫米 mm', factor: 0.001 },
                { id: 'cm', label: '厘米 cm', factor: 0.01 },
                { id: 'm',  label: '米 m', factor: 1 },
                { id: 'km', label: '千米 km', factor: 1000 },
                { id: 'um', label: '微米 μm', factor: 1e-6 },
                { id: 'in', label: '英寸 in', factor: 0.0254 },
                { id: 'ft', label: '英尺 ft', factor: 0.3048 },
                { id: 'yd', label: '码 yd', factor: 0.9144 },
                { id: 'mi', label: '英里 mi', factor: 1609.344 }
            ],
            defFrom: 'km', defTo: 'mi',
            examples: [['1', 'mi', 'km'], ['1', 'in', 'cm'], ['100', 'm', 'ft']]
        },
        weight: {
            name: '重量', base: 'g',
            units: [
                { id: 'mg', label: '毫克 mg', factor: 0.001 },
                { id: 'g',  label: '克 g', factor: 1 },
                { id: 'kg', label: '千克 kg', factor: 1000 },
                { id: 't',  label: '吨 t', factor: 1e6 },
                { id: 'oz', label: '盎司 oz', factor: 28.349523125 },
                { id: 'lb', label: '磅 lb', factor: 453.59237 },
                { id: 'jin', label: '斤（市斤=500g）', factor: 500 }
            ],
            defFrom: 'lb', defTo: 'kg',
            examples: [['1', 'lb', 'kg'], ['2', 'jin', 'g'], ['500', 'g', 'oz']]
        },
        temperature: {
            name: '温度', base: 'K', formula: true,
            units: [
                { id: 'c', label: '摄氏度 ℃' },
                { id: 'f', label: '华氏度 ℉' },
                { id: 'k', label: '开尔文 K' }
            ],
            defFrom: 'c', defTo: 'f',
            examples: [['37', 'c', 'f'], ['-40', 'c', 'f'], ['0', 'k', 'c']]
        },
        data: {
            name: '数据存储', base: 'bit',
            modes: {
                dec: { label: '十进制', units: [
                    { id: 'bit', label: '比特 bit', factor: 1 },
                    { id: 'B',   label: '字节 B', factor: 8 },
                    { id: 'KB',  label: '千字节 KB', factor: 8e3 },
                    { id: 'MB',  label: '兆字节 MB', factor: 8e6 },
                    { id: 'GB',  label: '吉字节 GB', factor: 8e9 },
                    { id: 'TB',  label: '太字节 TB', factor: 8e12 }
                ], defFrom: 'GB', defTo: 'MB',
                examples: [['1', 'GB', 'MB'], ['1024', 'MB', 'GB'], ['500', 'KB', 'B']] },
                bin: { label: '二进制', units: [
                    { id: 'bit', label: '比特 bit', factor: 1 },
                    { id: 'B',   label: '字节 B', factor: 8 },
                    { id: 'KiB', label: 'Kibibyte KiB', factor: 8 * 1024 },
                    { id: 'MiB', label: 'Mebibyte MiB', factor: 8 * 1048576 },
                    { id: 'GiB', label: 'Gibibyte GiB', factor: 8 * 1073741824 },
                    { id: 'TiB', label: 'Tebibyte TiB', factor: 8 * 1099511627776 }
                ], defFrom: 'GiB', defTo: 'MiB',
                examples: [['1', 'GiB', 'MiB'], ['1024', 'MiB', 'GiB'], ['8', 'bit', 'B']] }
            }
        }
    };

    var catInputs, inputEl, fromEl, toEl, swapBtn, resultEl, copyBtn, errorEl, stdEl, allEl, examplesEl, dataModeRow, modeInputs;

    function currentCat() {
        for (var i = 0; i < catInputs.length; i++) {
            if (catInputs[i].checked) return catInputs[i].value;
        }
        return 'length';
    }

    function dataMode() {
        for (var i = 0; i < modeInputs.length; i++) {
            if (modeInputs[i].checked) return modeInputs[i].value;
        }
        return 'dec';
    }

    function unitsOf(cat) {
        if (cat === 'data') return CATS.data.modes[dataMode()].units;
        return CATS[cat].units;
    }

    function unitLabel(cat, id) {
        var us = unitsOf(cat);
        for (var i = 0; i < us.length; i++) {
            if (us[i].id === id) return us[i].label;
        }
        return id;
    }

    // ---- 格式化：最多 10 位有效数字，去尾零；极大/极小用指数记法 ----
    function formatNum(v) {
        if (!isFinite(v)) return String(v);
        if (v === 0) return '0';
        var s = v.toPrecision(10);
        if (s.indexOf('e') !== -1 || s.indexOf('E') !== -1) {
            // 指数记法：整理尾数尾零
            var parts = s.split(/[eE]/);
            var m = parts[0];
            if (m.indexOf('.') !== -1) m = m.replace(/0+$/, '').replace(/\.$/, '');
            return m + 'e' + parts[1];
        }
        if (s.indexOf('.') !== -1) s = s.replace(/0+$/, '').replace(/\.$/, '');
        return s;
    }

    // ---- 换算核心：value(from) -> value(to) ----
    function convert(cat, value, fromId, toId) {
        if (cat === 'temperature') return convertTemp(value, fromId, toId);
        var us = unitsOf(cat);
        var ff = 1, tf = 1;
        for (var i = 0; i < us.length; i++) {
            if (us[i].id === fromId) ff = us[i].factor;
            if (us[i].id === toId) tf = us[i].factor;
        }
        return value * ff / tf;
    }

    // 温度：先转开尔文（校验绝对零度），再转出
    function toKelvin(v, from) {
        if (from === 'c') return v + 273.15;
        if (from === 'f') return (v - 32) * 5 / 9 + 273.15;
        return v; // k
    }
    function fromKelvin(k, to) {
        if (to === 'c') return k - 273.15;
        if (to === 'f') return (k - 273.15) * 9 / 5 + 32;
        return k;
    }
    function convertTemp(value, fromId, toId) {
        var k = toKelvin(value, fromId);
        if (k < 0) return { error: '温度不能低于绝对零度（-273.15 ℃ / -459.67 ℉ / 0 K）。' };
        return { value: fromKelvin(k, toId) };
    }

    function showError(msg) {
        if (msg) {
            errorEl.textContent = msg;
            errorEl.style.display = 'block';
            inputEl.classList.add('uc-invalid');
        } else {
            errorEl.textContent = '';
            errorEl.style.display = 'none';
            inputEl.classList.remove('uc-invalid');
        }
    }

    function copyText(text, btn) {
        function done() {
            var old = btn.textContent;
            btn.textContent = '已复制 ✓';
            setTimeout(function () { btn.textContent = old; }, 1500);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, function () { fallback(); });
        } else {
            fallback();
        }
        function fallback() {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); done(); } catch (e) { /* 忽略 */ }
            document.body.removeChild(ta);
        }
    }

    // ---- 主换算 ----
    function update() {
        var cat = currentCat();
        var raw = inputEl.value.trim();
        copyBtn.disabled = true;
        copyBtn.removeAttribute('data-copy');
        stdEl.style.display = 'none';

        if (raw === '') {
            showError('');
            resultEl.innerHTML = '—';
            renderAll(cat, null);
            return;
        }
        var v = Number(raw);
        if (!isFinite(v)) {
            showError('请输入有效的数字，例如 1.5。');
            resultEl.innerHTML = '—';
            renderAll(cat, null);
            return;
        }
        showError('');

        var fromId = fromEl.value, toId = toEl.value;
        var res, errMsg = null;
        if (cat === 'temperature') {
            res = convertTemp(v, fromId, toId);
            if (res.error) {
                errMsg = res.error;
            } else {
                res = res.value;
            }
        } else {
            res = convert(cat, v, fromId, toId);
        }
        if (errMsg) {
            showError(errMsg);
            resultEl.innerHTML = '—';
            renderAll(cat, null);
            return;
        }

        var fs = formatNum(res);
        resultEl.innerHTML = '';
        resultEl.appendChild(document.createTextNode(fs));
        var u = document.createElement('span');
        u.className = 'uc-unit';
        u.textContent = unitLabel(cat, toId);
        resultEl.appendChild(u);

        copyBtn.disabled = false;
        copyBtn.setAttribute('data-copy', fs + ' ' + unitLabel(cat, toId));

        if (cat === 'data') {
            stdEl.textContent = '当前口径：' + (dataMode() === 'dec' ? '十进制（1 KB = 1000 B）' : '二进制（1 KiB = 1024 B）') + '。切换上方口径会自动重算。';
            stdEl.style.display = 'block';
        }

        renderAll(cat, v);
    }

    // ---- 全部单位一览 ----
    function renderAll(cat, v) {
        allEl.innerHTML = '';
        var fromId = fromEl.value;
        var us = unitsOf(cat);
        for (var i = 0; i < us.length; i++) {
            var item = document.createElement('div');
            item.className = 'uc-item';
            var u = document.createElement('span');
            u.className = 'uc-u';
            u.textContent = us[i].label + (us[i].id === fromId ? ' ◀' : '');
            var val = document.createElement('span');
            val.className = 'uc-v';
            if (v === null || v === undefined || !isFinite(v)) {
                val.textContent = '—';
            } else {
                var r;
                if (cat === 'temperature') {
                    r = convertTemp(v, fromId, us[i].id);
                    val.textContent = r.error ? '—' : formatNum(r.value);
                } else {
                    val.textContent = formatNum(convert(cat, v, fromId, us[i].id));
                }
            }
            item.appendChild(u);
            item.appendChild(val);
            allEl.appendChild(item);
        }
    }

    // ---- 下拉与示例 ----
    function fillSelects(cat) {
        var us = unitsOf(cat);
        var prevFrom = fromEl.value, prevTo = toEl.value;
        fromEl.innerHTML = '';
        toEl.innerHTML = '';
        for (var i = 0; i < us.length; i++) {
            var o1 = document.createElement('option');
            o1.value = us[i].id;
            o1.textContent = us[i].label;
            fromEl.appendChild(o1);
            var o2 = document.createElement('option');
            o2.value = us[i].id;
            o2.textContent = us[i].label;
            toEl.appendChild(o2);
        }
        var defs = cat === 'data' ? CATS.data.modes[dataMode()] : CATS[cat];
        var valid = {};
        for (var j = 0; j < us.length; j++) valid[us[j].id] = true;
        fromEl.value = valid[prevFrom] ? prevFrom : defs.defFrom;
        toEl.value = valid[prevTo] ? prevTo : defs.defTo;
    }

    function fillExamples(cat) {
        examplesEl.innerHTML = '';
        var exs = cat === 'data' ? CATS.data.modes[dataMode()].examples : CATS[cat].examples;
        for (var i = 0; i < exs.length; i++) {
            (function (ex) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'uc-example';
                b.textContent = '试试：' + ex[0] + ' ' + ex[1] + ' → ' + ex[2];
                b.addEventListener('click', function () {
                    fromEl.value = ex[1];
                    toEl.value = ex[2];
                    inputEl.value = ex[0];
                    update();
                    inputEl.focus();
                });
                examplesEl.appendChild(b);
            })(exs[i]);
        }
    }

    function refreshCategory(keepValue) {
        var cat = currentCat();
        dataModeRow.style.display = (cat === 'data') ? 'flex' : 'none';
        fillSelects(cat);
        fillExamples(cat);
        if (!keepValue) inputEl.value = '';
        update();
    }

    function bind() {
        catInputs = document.querySelectorAll('input[name="uc-cat"]');
        modeInputs = document.querySelectorAll('input[name="uc-mode"]');
        inputEl = document.getElementById('uc-input');
        fromEl = document.getElementById('uc-from');
        toEl = document.getElementById('uc-to');
        swapBtn = document.getElementById('uc-swap');
        resultEl = document.getElementById('uc-result');
        copyBtn = document.getElementById('uc-copy');
        errorEl = document.getElementById('uc-error');
        stdEl = document.getElementById('uc-std');
        allEl = document.getElementById('uc-all');
        examplesEl = document.getElementById('uc-examples');
        dataModeRow = document.getElementById('uc-data-mode');

        for (var i = 0; i < catInputs.length; i++) {
            catInputs[i].addEventListener('change', function () { refreshCategory(false); });
        }
        for (var j = 0; j < modeInputs.length; j++) {
            modeInputs[j].addEventListener('change', function () { refreshCategory(true); });
        }
        inputEl.addEventListener('input', update);
        fromEl.addEventListener('change', update);
        toEl.addEventListener('change', update);
        swapBtn.addEventListener('click', function () {
            var t = fromEl.value;
            fromEl.value = toEl.value;
            toEl.value = t;
            update();
        });
        copyBtn.addEventListener('click', function () {
            var t = copyBtn.getAttribute('data-copy');
            if (t) copyText(t, copyBtn);
        });

        refreshCategory(false);
    }

    document.addEventListener('DOMContentLoaded', bind);
})();
