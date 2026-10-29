/* CSS 单位换算器 - 纯前端：14 个 CSS 长度单位互转，五组上下文（根字号/父级字号/视口宽/视口高/DPI），
 * 14 行全单位对照表 + 逐行复制 + 结果文本复制 + .txt/.json 下载，零后端、零 CDN、零网络请求。
 * 纯函数经 module.exports 暴露，node tests/css_unit_converter.test.js 自测；
 * 浏览器端经 window.CSSUnitConverter 挂载。
 */
(function () {
    'use strict';

    /* ============ 1. 单位与上下文定义 ============ */

    // 14 个 CSS 长度单位（顺序固定，convertAll 按此顺序输出）
    var SUPPORTED_UNITS = ['px', 'rem', 'em', 'vw', 'vh', 'vmin', 'vmax', '%', 'pt', 'pc', 'in', 'cm', 'mm', 'Q'];

    // 界面展示用中文标签（纯展示，不影响换算）
    var UNIT_LABELS = {
        px: '像素 px',
        rem: 'rem（根字号基准）',
        em: 'em（父级字号基准）',
        vw: 'vw（视口宽 1%）',
        vh: 'vh（视口高 1%）',
        vmin: 'vmin（视口较小边 1%）',
        vmax: 'vmax（视口较大边 1%）',
        '%': '%（父级字号百分比）',
        pt: '点 pt',
        pc: '派卡 pc',
        in: '英寸 in',
        cm: '厘米 cm',
        mm: '毫米 mm',
        Q: 'Q（1/4 毫米）'
    };

    // 基准说明小字（上下文编辑区 / 对照表第二列共用）
    var UNIT_BASIS = {
        px: '绝对基准：1px',
        rem: '基准 = 根字号',
        em: '基准 = 父级字号',
        vw: '基准 = 视口宽 ÷ 100',
        vh: '基准 = 视口高 ÷ 100',
        vmin: '基准 = 视口较小边 ÷ 100',
        vmax: '基准 = 视口较大边 ÷ 100',
        '%': '基准 = 父级字号 ÷ 100',
        pt: '1pt = 96/72 px（CSS 规范，96dpi）',
        pc: '1pc = 16px（CSS 规范，96dpi）',
        in: '1in = 96px（CSS 规范，96dpi）',
        cm: '1cm = 96/2.54 px（CSS 规范，96dpi）',
        mm: '1mm = 96/25.4 px（CSS 规范，96dpi）',
        Q: '1Q = 96/254 px（CSS 规范，96dpi）'
    };

    var CTX_FIELDS = ['rootFontSize', 'parentFontSize', 'viewportWidth', 'viewportHeight', 'dpi'];

    var DEFAULT_CTX = {
        rootFontSize: 16,
        parentFontSize: 16,
        viewportWidth: 1920,
        viewportHeight: 1080,
        dpi: 96
    };

    // 上下文字段 → 界面基准说明
    var CTX_HINTS = {
        rootFontSize: 'rem 的基准',
        parentFontSize: 'em 与 % 的基准',
        viewportWidth: 'vw 的基准（vmin/vmax 也用）',
        viewportHeight: 'vh 的基准（vmin/vmax 也用）',
        dpi: 'CSS 规范固定 96dpi，绝对单位（pt/pc/in/cm/mm/Q）以此换算'
    };

    /* ============ 2. 失败约定 ============ */
    // 非法参数一律抛 Error，err.field 给出字段名；不静默钳制、不静默取整、不静默截断。

    function fail(field, message) {
        var e = new Error(message);
        e.field = field;
        throw e;
    }

    function isPosFinite(n) {
        return typeof n === 'number' && isFinite(n) && n > 0;
    }

    /* ============ 3. 校验 ============ */

    // validateCtx(ctx)：缺省字段取默认值；已给字段非正有限数则抛错（err.field=字段名）。
    function validateCtx(ctx) {
        if (ctx === undefined || ctx === null) ctx = {};
        if (typeof ctx !== 'object' || Object.prototype.toString.call(ctx) === '[object Array]') {
            fail('ctx', '上下文参数须为对象。');
        }
        var out = {};
        for (var i = 0; i < CTX_FIELDS.length; i++) {
            var f = CTX_FIELDS[i];
            var v = ctx[f];
            if (v === undefined || v === null || v === '') {
                out[f] = DEFAULT_CTX[f];
                continue;
            }
            var n = (typeof v === 'number') ? v : Number(String(v).trim());
            if (!isPosFinite(n)) {
                fail(f, '上下文参数「' + f + '」须为正有限数。');
            }
            out[f] = n;
        }
        return out;
    }

    // validateValue(value)：接受数字或可解析为有限数的字符串（含首尾空白可 trim）；
    // "16px" 等带单位写法、空串、NaN、Infinity 抛错（err.field='value'），不猜测解析。
    function validateValue(value) {
        if (typeof value === 'number') {
            if (!isFinite(value)) fail('value', '数值须为有限数。');
            return value;
        }
        if (typeof value === 'string') {
            var t = value.trim();
            if (t === '') fail('value', '请输入有效的数字（例如 16；不要带单位写法如 16px）。');
            var n = Number(t);
            if (!isFinite(n)) fail('value', '请输入有效的数字（例如 16；不要带单位写法如 16px）。');
            return n;
        }
        fail('value', '数值须为数字或数字字符串。');
    }

    /* ============ 4. 换算核心 ============ */

    // 各单位 → px 的换算因子。绝对单位按 CSS 规范固定 96dpi（与设备实际 DPI 无关）。
    function factorOf(unit, ctx) {
        switch (unit) {
            case 'px': return 1;
            case 'rem': return ctx.rootFontSize;
            case 'em': return ctx.parentFontSize;
            case '%': return ctx.parentFontSize / 100;
            case 'vw': return ctx.viewportWidth / 100;
            case 'vh': return ctx.viewportHeight / 100;
            case 'vmin': return Math.min(ctx.viewportWidth, ctx.viewportHeight) / 100;
            case 'vmax': return Math.max(ctx.viewportWidth, ctx.viewportHeight) / 100;
            case 'pt': return 96 / 72;
            case 'pc': return 16;
            case 'in': return 96;
            case 'cm': return 96 / 2.54;
            case 'mm': return 96 / 25.4;
            case 'Q': return 96 / 254;
            default: fail('unit', '不支持的单位：' + String(unit) + '。');
        }
    }

    // toPx(value, unit, ctx)：某单位数值 → px 数值
    function toPx(value, unit, ctx) {
        var v = validateValue(value);
        var c = validateCtx(ctx);
        return v * factorOf(unit, c);
    }

    // fromPx(pxValue, unit, ctx)：px 数值 → 目标单位数值
    function fromPx(pxValue, unit, ctx) {
        var v = validateValue(pxValue);
        var c = validateCtx(ctx);
        return v / factorOf(unit, c);
    }

    // formatNumber(n, maxDecimals=4)：四舍五入到最多 maxDecimals 位小数，去尾零后返回数字（非字符串）。
    function formatNumber(n, maxDecimals) {
        if (maxDecimals === undefined || maxDecimals === null) maxDecimals = 4;
        if (typeof maxDecimals !== 'number' || !isFinite(maxDecimals) || maxDecimals < 0 || Math.floor(maxDecimals) !== maxDecimals) {
            fail('maxDecimals', '小数位数须为非负整数。');
        }
        if (typeof n !== 'number' || !isFinite(n)) {
            fail('n', '待格式化数值须为有限数。');
        }
        var f = Math.pow(10, maxDecimals);
        return Math.round(n * f) / f;
    }

    // convertAll(value, unit, ctx)：返回 14 项数组 [{unit, value}]，顺序与 SUPPORTED_UNITS 一致。
    function convertAll(value, unit, ctx) {
        var px = toPx(value, unit, ctx);
        var c = validateCtx(ctx);
        var out = [];
        for (var i = 0; i < SUPPORTED_UNITS.length; i++) {
            var u = SUPPORTED_UNITS[i];
            out.push({ unit: u, value: formatNumber(px / factorOf(u, c)) });
        }
        return out;
    }

    // formatUnitValue(value, unit)：→ 如 "1.5rem" 的字符串
    function formatUnitValue(value, unit) {
        var v = validateValue(value);
        if (SUPPORTED_UNITS.indexOf(unit) === -1) {
            fail('unit', '不支持的单位：' + String(unit) + '。');
        }
        return formatNumber(v) + unit;
    }

    // generateExample()：固定示例（em 与 rem 基准不同，直观呈现）
    function generateExample() {
        return {
            value: 16,
            unit: 'px',
            ctx: { rootFontSize: 16, parentFontSize: 20, viewportWidth: 1920, viewportHeight: 1080, dpi: 96 }
        };
    }

    // suggestExportName(kind)：txt → css-units.txt，json → css-units.json，其它 kind 抛错。
    function suggestExportName(kind) {
        if (kind === 'txt') return 'css-units.txt';
        if (kind === 'json') return 'css-units.json';
        fail('kind', '不支持的导出类型：' + String(kind) + '。');
    }

    // buildText(value, unit, rows, ctx)：导出 .txt / 复制结果文本共用的正文
    function buildText(value, unit, rows, ctx) {
        var c = validateCtx(ctx);
        var lines = [];
        lines.push('CSS 单位换算');
        lines.push('================');
        lines.push('输入：' + String(value) + ' ' + String(unit));
        lines.push('上下文：根字号=' + c.rootFontSize + 'px / 父级字号=' + c.parentFontSize +
            'px / 视口=' + c.viewportWidth + '×' + c.viewportHeight + ' / DPI=' + c.dpi +
            '（绝对单位按 CSS 规范 96dpi）');
        lines.push('----------------');
        for (var i = 0; i < rows.length; i++) {
            lines.push(rows[i].unit + ': ' + String(rows[i].value));
        }
        return lines.join('\n');
    }

    // buildJson(value, unit, rows, ctx)：导出 .json 共用的正文
    function buildJson(value, unit, rows, ctx) {
        var c = validateCtx(ctx);
        return JSON.stringify({
            tool: 'css_unit_converter',
            input: { value: value, unit: unit },
            ctx: c,
            results: rows
        }, null, 2);
    }

    /* ============ 5. 导出（node 测试 / 浏览器挂载） ============ */
    var API = {
        SUPPORTED_UNITS: SUPPORTED_UNITS,
        UNIT_LABELS: UNIT_LABELS,
        UNIT_BASIS: UNIT_BASIS,
        DEFAULT_CTX: DEFAULT_CTX,
        CTX_HINTS: CTX_HINTS,
        validateCtx: validateCtx,
        validateValue: validateValue,
        toPx: toPx,
        fromPx: fromPx,
        formatNumber: formatNumber,
        convertAll: convertAll,
        formatUnitValue: formatUnitValue,
        generateExample: generateExample,
        suggestExportName: suggestExportName,
        buildText: buildText,
        buildJson: buildJson
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = API;
    }
    if (typeof window !== 'undefined') {
        window.CSSUnitConverter = API;
    }

    /* ============ 6. 浏览器 UI ============ */
    if (typeof document === 'undefined') return;

    var valueEl, unitEl, ctxEls, errValueEl, errCtxEl, tableBodyEl, exampleBtn,
        copyTextBtn, dlTxtBtn, dlJsonBtn, exportNoteEl, currentRows = null, currentInput = null;

    function $(id) { return document.getElementById(id); }

    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function showErr(el, msg) {
        if (!el) return;
        if (msg) {
            el.textContent = msg;
            el.style.display = 'block';
        } else {
            el.textContent = '';
            el.style.display = 'none';
        }
    }

    function copyText(text, btn, okLabel) {
        function done() {
            var old = btn.textContent;
            btn.textContent = okLabel || '已复制 ✓';
            setTimeout(function () { btn.textContent = old; }, 1500);
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
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, fallback);
        } else {
            fallback();
        }
    }

    function downloadFile(name, text) {
        var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            URL.revokeObjectURL(a.href);
            document.body.removeChild(a);
        }, 500);
    }

    function readCtxRaw() {
        return {
            rootFontSize: ctxEls.root.value,
            parentFontSize: ctxEls.parent.value,
            viewportWidth: ctxEls.vw.value,
            viewportHeight: ctxEls.vh.value,
            dpi: ctxEls.dpi.value
        };
    }

    function renderTable(rows, unit) {
        tableBodyEl.innerHTML = '';
        for (var i = 0; i < rows.length; i++) {
            (function (row) {
                var tr = document.createElement('tr');
                var tdU = document.createElement('td');
                tdU.className = 'cuc-unit';
                tdU.textContent = row.unit + (row.unit === unit ? ' ◀' : '');
                var tdB = document.createElement('td');
                tdB.className = 'cuc-basis';
                tdB.textContent = UNIT_BASIS[row.unit] || '';
                var tdV = document.createElement('td');
                tdV.className = 'cuc-value';
                tdV.textContent = (rows === null || row.value === undefined) ? '—' : String(row.value);
                var tdC = document.createElement('td');
                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'cuc-copy-btn';
                btn.textContent = '复制';
                btn.disabled = (row.value === undefined);
                btn.addEventListener('click', function () {
                    copyText(formatUnitValue(row.value, row.unit), btn);
                });
                tdC.appendChild(btn);
                tr.appendChild(tdU);
                tr.appendChild(tdB);
                tr.appendChild(tdV);
                tr.appendChild(tdC);
                tableBodyEl.appendChild(tr);
            })(rows[i]);
        }
    }

    function update() {
        currentRows = null;
        currentInput = null;
        copyTextBtn.disabled = true;
        dlTxtBtn.disabled = true;
        dlJsonBtn.disabled = true;
        showErr(errValueEl, '');
        showErr(errCtxEl, '');
        valueEl.classList.remove('cuc-invalid');

        // ① 上下文先校验（非法时红字标出，不阻塞其它控件）
        var ctx, ctxOk = true;
        try {
            ctx = validateCtx(readCtxRaw());
        } catch (e) {
            ctxOk = false;
            showErr(errCtxEl, '上下文参数有误（' + (e.field || 'ctx') + '）：' + e.message + ' 请修正后再看换算结果。');
        }

        // ② 数值校验（非法时红字标出）
        var raw = valueEl.value;
        var v, vOk = true;
        if (raw.trim() === '') {
            vOk = false;
        } else {
            try {
                v = validateValue(raw);
            } catch (e) {
                vOk = false;
                valueEl.classList.add('cuc-invalid');
                showErr(errValueEl, e.message);
            }
        }

        if (!vOk || !ctxOk) {
            renderTableEmpty(unitEl.value);
            return;
        }

        var unit = unitEl.value;
        try {
            currentRows = convertAll(v, unit, ctx);
        } catch (e) {
            valueEl.classList.add('cuc-invalid');
            showErr(errValueEl, e.message);
            renderTableEmpty(unit);
            return;
        }
        currentInput = { value: v, unit: unit, ctx: ctx };

        renderTable(currentRows, unit);
        copyTextBtn.disabled = false;
        dlTxtBtn.disabled = false;
        dlJsonBtn.disabled = false;
    }

    function renderTableEmpty(unit) {
        var rows = [];
        for (var i = 0; i < SUPPORTED_UNITS.length; i++) {
            rows.push({ unit: SUPPORTED_UNITS[i], value: undefined });
        }
        renderTable(rows, unit);
    }

    function loadExample() {
        var ex = generateExample();
        valueEl.value = String(ex.value);
        unitEl.value = ex.unit;
        ctxEls.root.value = ex.ctx.rootFontSize;
        ctxEls.parent.value = ex.ctx.parentFontSize;
        ctxEls.vw.value = ex.ctx.viewportWidth;
        ctxEls.vh.value = ex.ctx.viewportHeight;
        ctxEls.dpi.value = ex.ctx.dpi;
        update();
        valueEl.focus();
    }

    function bind() {
        valueEl = $('cuc-value');
        unitEl = $('cuc-unit');
        ctxEls = { root: $('cuc-ctx-root'), parent: $('cuc-ctx-parent'), vw: $('cuc-ctx-vw'), vh: $('cuc-ctx-vh'), dpi: $('cuc-ctx-dpi') };
        errValueEl = $('cuc-err-value');
        errCtxEl = $('cuc-err-ctx');
        tableBodyEl = $('cuc-table-body');
        exampleBtn = $('cuc-example');
        copyTextBtn = $('cuc-copy-text');
        dlTxtBtn = $('cuc-dl-txt');
        dlJsonBtn = $('cuc-dl-json');
        exportNoteEl = $('cuc-export-note');

        // 源单位下拉：14 个
        for (var i = 0; i < SUPPORTED_UNITS.length; i++) {
            var u = SUPPORTED_UNITS[i];
            var o = document.createElement('option');
            o.value = u;
            o.textContent = UNIT_LABELS[u];
            unitEl.appendChild(o);
        }
        unitEl.value = 'px';

        valueEl.addEventListener('input', update);
        unitEl.addEventListener('change', update);
        for (var k in ctxEls) {
            if (ctxEls.hasOwnProperty(k)) ctxEls[k].addEventListener('input', update);
        }
        exampleBtn.addEventListener('click', loadExample);
        copyTextBtn.addEventListener('click', function () {
            if (!currentRows || !currentInput) return;
            copyText(buildText(currentInput.value, currentInput.unit, currentRows, currentInput.ctx), copyTextBtn, '结果文本已复制 ✓');
        });
        dlTxtBtn.addEventListener('click', function () {
            if (!currentRows || !currentInput) return;
            downloadFile(suggestExportName('txt'), buildText(currentInput.value, currentInput.unit, currentRows, currentInput.ctx));
        });
        dlJsonBtn.addEventListener('click', function () {
            if (!currentRows || !currentInput) return;
            downloadFile(suggestExportName('json'), buildJson(currentInput.value, currentInput.unit, currentRows, currentInput.ctx));
        });

        // 默认先演示示例（无需上传）
        loadExample();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }
})();
