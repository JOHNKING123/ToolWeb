/* 工资条生成器：HR 工资表 Excel → 逐员工工资条卡片 → A4 打印 / .xlsx 导出
 * 纯前端：SheetJS 0.18.5 本地解析（CDN 懒加载 + 本地 vendor 兜底），数据不出浏览器。
 * 无任何后端调用。 */
(function () {
'use strict';

/* ---------- 基础工具 ---------- */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function trim(s) { return String(s == null ? '' : s).trim(); }

/* 数字解析：支持 "1,234.56" / " 8000 " / 数字本身；百分比与非数字返回 null */
function parseNum(v) {
    if (typeof v === 'number' && isFinite(v)) return v;
    var s = trim(v);
    if (!s) return null;
    if (/%$/.test(s)) return null;
    s = s.replace(/,/g, '').replace(/\s+/g, '');
    if (!/^[+-]?(\d+(\.\d+)?|\.\d+)$/.test(s)) return null;
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
}
/* 金额千分位：保留两位小数 */
function fmtMoney(v) {
    var n = parseNum(v);
    if (n === null) return esc(v);
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ---------- SheetJS 懒加载（CDN + 本地 vendor 兜底，与 markdown_to_excel.js 同款写法） ---------- */
var XLSX_CDNS = [
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
];
(function () {
    if (typeof document === 'undefined' || !document.currentScript) return;
    var me = document.currentScript.src;
    var fb = me ? me.replace(/payslip_generator\.js(\?.*)?$/, 'vendor/xlsx-0.18.5.umd.js') : '';
    if (fb && fb !== me) XLSX_CDNS.push(fb);
})();
var xlsxLoading = false, xlsxWaiters = [];
function loadScript(src, ok, fail) {
    var s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = ok; s.onerror = fail;
    document.head.appendChild(s);
}
function ensureXLSX(cb) {
    if (window.XLSX) { cb(true); return; }
    xlsxWaiters.push(cb);
    if (xlsxLoading) return;
    xlsxLoading = true;
    setStatus('正在加载 Excel 解析组件…');
    (function tryNext(i) {
        if (i >= XLSX_CDNS.length) {
            xlsxLoading = false;
            setError('Excel 解析组件加载失败：CDN 与本站本地副本均不可用，请检查网络后重试。');
            var ws = xlsxWaiters; xlsxWaiters = [];
            ws.forEach(function (f) { f(false); });
            return;
        }
        loadScript(XLSX_CDNS[i], function () {
            xlsxLoading = false;
            var ws = xlsxWaiters; xlsxWaiters = [];
            ws.forEach(function (f) { f(!!window.XLSX); });
        }, function () { tryNext(i + 1); });
    })(0);
}

/* ---------- 状态 ---------- */
var state = {
    headers: [],      // 表头数组
    rows: [],         // 数据行（数组的数组）
    nameCol: 0,
    colFrom: 0,
    colTo: 0,
    yfaCol: -1,       // 应发合计列
    sfaCol: -1,       // 实发合计列
    perPage: 3,
    rendered: []      // 渲染出的员工工资条数据
};

/* ---------- 示例工资表 ---------- */
var SAMPLE_HEADERS = ['姓名', '部门', '基本工资', '岗位津贴', '绩效奖金', '加班费', '交通补贴', '社保个人', '公积金个人', '个人所得税', '应发工资', '实发工资'];
function sampleRows() {
    var people = [
        ['张伟', '技术部', 12000, 2000, 3500, 800, 500],
        ['王芳', '财务部', 10000, 1500, 2800, 0, 500],
        ['李娜', '人事部', 9000, 1200, 2200, 300, 400],
        ['刘洋', '技术部', 13500, 2500, 4200, 1200, 600],
        ['陈静', '市场部', 8500, 1000, 3000, 0, 400],
        ['杨帆', '技术部', 11000, 1800, 3100, 600, 500],
        ['赵磊', '运营部', 9500, 1300, 2600, 400, 400],
        ['黄敏', '财务部', 10500, 1600, 2900, 200, 500]
    ];
    return people.map(function (p) {
        var yfa = p[2] + p[3] + p[4] + p[5] + p[6];
        var sb = Math.round(yfa * 0.08), gjj = Math.round(yfa * 0.12), tax = Math.max(0, Math.round((yfa - 5000 - sb - gjj) * 0.03));
        var sfa = yfa - sb - gjj - tax;
        return [p[0], p[1], p[2], p[3], p[4], p[5], p[6], sb, gjj, tax, yfa, sfa];
    });
}

/* ---------- 状态栏 ---------- */
function setStatus(t) { $('ps-status').textContent = t || ''; $('ps-error').style.display = 'none'; }
function setError(t) { var e = $('ps-error'); e.textContent = t; e.style.display = 'block'; }

/* ---------- 列自动识别 ---------- */
function autoDetect(headers, rows) {
    var n = headers.length, i, r;
    // 姓名列：首个含 姓名/员工/人员/人名的表头，否则第 0 列
    var nameCol = 0;
    for (i = 0; i < n; i++) {
        if (/姓名|员工|人员|人名/.test(headers[i])) { nameCol = i; break; }
    }
    // 数字列：非空单元格中数字占比 ≥ 50%
    var numericCols = [];
    for (i = 0; i < n; i++) {
        var tot = 0, num = 0;
        for (r = 0; r < rows.length; r++) {
            var v = rows[r][i];
            if (trim(v) === '') continue;
            tot++;
            if (parseNum(v) !== null) num++;
        }
        if (tot > 0 && num / tot >= 0.5) numericCols.push(i);
    }
    var colFrom = numericCols.length ? numericCols[0] : Math.min(nameCol + 1, n - 1);
    var colTo = numericCols.length ? numericCols[numericCols.length - 1] : n - 1;
    // 应发/实发列
    var yfaCol = -1, sfaCol = -1;
    for (i = 0; i < n; i++) {
        if (yfaCol < 0 && /应发/.test(headers[i])) yfaCol = i;
        if (sfaCol < 0 && /实发/.test(headers[i])) sfaCol = i;
    }
    return { nameCol: nameCol, colFrom: colFrom, colTo: colTo, yfaCol: yfaCol, sfaCol: sfaCol };
}

/* ---------- 配置区渲染 ---------- */
function headers_i(i) { return (i + 1) + ' · ' + state.headers[i]; }

function fillSelect(sel, selected) {
    sel.innerHTML = '';
    for (var i = 0; i < state.headers.length; i++) {
        var o = document.createElement('option');
        o.value = i; o.textContent = headers_i(i);
        if (i === selected) o.selected = true;
        sel.appendChild(o);
    }
}

function renderConfig() {
    var d = autoDetect(state.headers, state.rows);
    state.nameCol = d.nameCol; state.colFrom = d.colFrom; state.colTo = d.colTo;
    state.yfaCol = d.yfaCol; state.sfaCol = d.sfaCol;
    fillSelect($('ps-namecol'), state.nameCol);
    fillSelect($('ps-colfrom'), state.colFrom);
    fillSelect($('ps-colto'), state.colTo);
    $('ps-config').style.display = 'block';
    $('ps-clear').disabled = false;
    var empCount = state.rows.filter(function (r) { return trim(r[state.nameCol]) !== ''; }).length;
    $('ps-colinfo').innerHTML = '已识别 <b>' + state.headers.length + '</b> 个表头、<b>' + state.rows.length + '</b> 行数据（姓名非空 <b>' + empCount + '</b> 人）' +
        (state.yfaCol >= 0 ? '；检测到「' + esc(state.headers[state.yfaCol]) + '」列，将直接用作应发合计' : '；未检测到「应发」列，应发合计将按明细求和') +
        (state.sfaCol >= 0 ? '，检测到「' + esc(state.headers[state.sfaCol]) + '」列，将直接用作实发合计' : '，未检测到「实发」列，实发合计将按明细求和') + '。';
    setStatus('工资表已载入，请核对列映射后点「生成工资条预览」。');
    $('ps-paper-zone').innerHTML = '';
    $('ps-print').disabled = true;
    $('ps-export').disabled = true;
}

function readMapping() {
    var nc = parseInt($('ps-namecol').value, 10);
    var cf = parseInt($('ps-colfrom').value, 10);
    var ct = parseInt($('ps-colto').value, 10);
    if (isNaN(nc) || isNaN(cf) || isNaN(ct)) { setError('列映射选择无效，请重新选择。'); return null; }
    if (cf > ct) { var t = cf; cf = ct; ct = t; }
    return { nameCol: nc, colFrom: cf, colTo: ct };
}

/* ---------- 工资条数据构建 ---------- */
function buildSlips(map) {
    return buildSlipsCore(state.headers, state.rows, map, state.yfaCol, state.sfaCol);
}
function buildSlipsCore(headers, rows, map, yfaCol, sfaCol) {
    var detailCols = [];
    for (var i = map.colFrom; i <= map.colTo; i++) {
        if (i === map.nameCol || i === yfaCol || i === sfaCol) continue;
        detailCols.push(i);
    }
    var slips = [];
    for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var name = trim(row[map.nameCol]);
        if (!name) continue;
        var items = detailCols.map(function (ci) {
            return { label: headers[ci], raw: row[ci], num: parseNum(row[ci]) };
        });
        var sum = items.reduce(function (a, it) { return a + (it.num === null ? 0 : it.num); }, 0);
        var yfa = yfaCol >= 0 ? parseNum(row[yfaCol]) : null;
        var sfa = sfaCol >= 0 ? parseNum(row[sfaCol]) : null;
        slips.push({
            name: name,
            items: items,
            yfa: yfa === null ? sum : yfa,
            sfa: sfa === null ? sum : sfa,
            yfaFromCol: yfa !== null,
            sfaFromCol: sfa !== null
        });
    }
    return slips;
}

/* ---------- 工资条渲染 ---------- */
function monthText() {
    var m = $('ps-month').value; // YYYY-MM
    if (/^\d{4}-\d{2}$/.test(m)) return m.slice(0, 4) + '年' + String(parseInt(m.slice(5), 10)) + '月';
    return m || '';
}

function renderSlips() {
    var map = readMapping();
    if (!map) return;
    state.nameCol = map.nameCol;
    var company = trim($('ps-company').value) || '　';
    var month = monthText();
    var slips = buildSlips(map);
    if (!slips.length) { setError('没有可生成的工资条：姓名列所选列全部为空，请检查「姓名列」选择。'); return; }
    state.rendered = slips;

    var pages = [];
    for (var i = 0; i < slips.length; i += state.perPage) {
        pages.push(slips.slice(i, i + state.perPage));
    }
    var html = '';
    pages.forEach(function (page, pi) {
        html += '<div class="ps-page' + (state.perPage === 4 ? ' n4' : '') + '">';
        html += '<div class="ps-page-head no-print">第 ' + (pi + 1) + ' 页（A4，每页 ' + state.perPage + ' 条）</div>';
        page.forEach(function (s, si) {
            if (si > 0) html += '<div class="ps-cut"><span class="scissors">✂</span></div>';
            html += '<div class="ps-slip">';
            html += '<div class="ps-comp">' + esc(company) + '</div>';
            html += '<div class="ps-title">工 资 条</div>';
            html += '<div class="ps-meta"><span>姓名：<b>' + esc(s.name) + '</b></span><span>月份：<b>' + esc(month) + '</b></span></div>';
            html += '<div class="ps-items">';
            s.items.forEach(function (it) {
                html += '<div class="ps-row"><span class="k">' + esc(it.label) + '</span><span class="v">' + fmtMoney(it.raw) + '</span></div>';
            });
            html += '</div>';
            html += '<div class="ps-totals">';
            html += '<div class="ps-row hl-yf"><span class="k">应发合计（元）</span><span class="v">' + fmtMoney(s.yfa) + '</span></div>';
            html += '<div class="ps-row hl-sf"><span class="k">实发合计（元）</span><span class="v">' + fmtMoney(s.sfa) + '</span></div>';
            html += '</div>';
            html += '<div class="ps-sign"><span>员工签字：<span class="line">&nbsp;</span></span><span>日期：<span class="line">&nbsp;</span></span></div>';
            html += '</div>';
        });
        html += '</div>';
    });
    $('ps-paper-zone').innerHTML = html;
    $('ps-print').disabled = false;
    $('ps-export').disabled = false;
    setStatus('已生成 ' + slips.length + ' 张工资条（共 ' + pages.length + ' 页），请核对后打印或导出。');
}

/* ---------- .xlsx 导出（每员工一张明细 sheet；社区版只做数据结构） ---------- */
function sheetNameFor(name, used) {
    var n = String(name).replace(/[\/\\\?\*\[\]:]/g, '_').slice(0, 28) || '员工';
    var base = n, k = 2;
    while (used[n]) { n = (base + '_' + k).slice(0, 31); k++; }
    used[n] = true;
    return n;
}

function exportXLSX() {
    if (!state.rendered.length) { setError('请先生成工资条预览再导出。'); return; }
    ensureXLSX(function (ok) {
        if (!ok || !window.XLSX) return;
        var XLSX = window.XLSX;
        var company = trim($('ps-company').value);
        var month = monthText();
        var wb = XLSX.utils.book_new();
        var used = {};
        state.rendered.forEach(function (s) {
            var aoa = [];
            aoa.push([(company ? company + ' ' : '') + month + ' 工资条']);
            aoa.push(['姓名', s.name]);
            aoa.push(['项目', '金额（元）']);
            s.items.forEach(function (it) {
                aoa.push([it.label, it.num === null ? trim(it.raw) : it.num]);
            });
            aoa.push(['应发合计', s.yfa]);
            aoa.push(['实发合计', s.sfa]);
            aoa.push(['员工签字', '']);
            var ws = XLSX.utils.aoa_to_sheet(aoa);
            ws['!cols'] = [{ wch: 16 }, { wch: 20 }];
            XLSX.utils.book_append_sheet(wb, ws, sheetNameFor(s.name, used));
        });
        var d = new Date(), p = function (x) { return String(x).padStart(2, '0'); };
        var fname = '工资条-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.xlsx';
        XLSX.writeFile(wb, fname);
        setStatus('已导出 ' + fname + '（共 ' + state.rendered.length + ' 位员工，每人一张工作表）。');
    });
}

/* ---------- 文件解析 ---------- */
function handleWorkbook(wb) {
    var XLSX = window.XLSX;
    var ws = wb.Sheets[wb.SheetNames[0]];
    var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    if (!aoa.length) { setError('该工作表为空，请检查文件。'); return; }
    // 去掉尾部全空列
    var ncols = aoa[0].length;
    while (ncols > 0) {
        var allEmpty = true;
        for (var r = 0; r < aoa.length; r++) {
            if (trim(aoa[r][ncols - 1]) !== '') { allEmpty = false; break; }
        }
        if (!allEmpty) break;
        ncols--;
    }
    var headers = aoa[0].slice(0, ncols).map(function (h) { return trim(h); });
    if (headers.every(function (h) { return h === ''; })) { setError('首行表头全为空：请确认工资表的第一行是表头。'); return; }
    var rows = [];
    for (var i = 1; i < aoa.length; i++) {
        var row = aoa[i].slice(0, ncols);
        while (row.length < ncols) row.push('');
        if (row.every(function (c) { return trim(c) === ''; })) continue;
        rows.push(row);
    }
    if (!rows.length) { setError('除表头外没有数据行，请检查文件。'); return; }
    state.headers = headers;
    state.rows = rows;
    renderConfig();
}

function handleFile(file) {
    if (!/\.(xlsx|xls)$/i.test(file.name)) { setError('仅支持 .xlsx / .xls 文件。'); return; }
    ensureXLSX(function (ok) {
        if (!ok || !window.XLSX) return;
        setStatus('正在解析 ' + file.name + ' …');
        var reader = new FileReader();
        reader.onload = function (e) {
            try {
                var wb = window.XLSX.read(e.target.result, { type: 'array' });
                handleWorkbook(wb);
            } catch (err) {
                setError('解析失败：' + (err && err.message ? err.message : '文件可能已损坏'));
            }
        };
        reader.onerror = function () { setError('文件读取失败，请重试。'); };
        reader.readAsArrayBuffer(file);
    });
}

function loadSample() {
    state.headers = SAMPLE_HEADERS.slice();
    state.rows = sampleRows();
    renderConfig();
}

/* ---------- 事件绑定 ---------- */
function bind() {
    var up = $('ps-upload'), fi = $('ps-file');
    up.addEventListener('click', function () { fi.click(); });
    up.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
    ['dragover', 'dragenter'].forEach(function (ev) {
        up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
        up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.remove('dragover'); });
    });
    up.addEventListener('drop', function (e) {
        var f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) handleFile(f);
    });
    fi.addEventListener('change', function () {
        if (fi.files && fi.files[0]) handleFile(fi.files[0]);
        fi.value = '';
    });
    $('ps-sample').addEventListener('click', loadSample);
    $('ps-clear').addEventListener('click', function () {
        state.headers = []; state.rows = []; state.rendered = [];
        $('ps-config').style.display = 'none';
        $('ps-paper-zone').innerHTML = '';
        $('ps-clear').disabled = true;
        setStatus('');
    });
    $('ps-render').addEventListener('click', renderSlips);
    $('ps-print').addEventListener('click', function () { window.print(); });
    $('ps-export').addEventListener('click', exportXLSX);
    $('ps-perpage').addEventListener('click', function (e) {
        var b = e.target.closest('.ps-count');
        if (!b) return;
        var btns = $('ps-perpage').querySelectorAll('.ps-count');
        btns.forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        state.perPage = parseInt(b.getAttribute('data-n'), 10) || 3;
        if (state.rendered.length) renderSlips();
    });
    // 月份默认当月
    var d = new Date(), p = function (x) { return String(x).padStart(2, '0'); };
    $('ps-month').value = d.getFullYear() + '-' + p(d.getMonth() + 1);
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
}

/* Node 单测导出 */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseNum: parseNum, autoDetect: autoDetect, buildSlipsCore: buildSlipsCore, SAMPLE_HEADERS: SAMPLE_HEADERS, sampleRows: sampleRows };
}
})();
