/* PDF 可填写表单制作器 - 纯前端本地处理（pdf.js 预览 + pdf-lib 回写 AcroForm）
 * 流程：上传 PDF -> pdf.js 逐页渲染 -> 覆盖层放置/拖拽/缩放表单域 -> 属性面板编辑
 *      -> 导出时 pdf-lib 按 AcroForm 标准结构写入文本框/复选框/单选组/下拉框。
 * 中文表单域：文本框与下拉框外观流内嵌 Noto Sans SC 子集中文字体
 * （static/fonts/noto-sans-sc-subset.ttf，OFL 开源，本站同源加载并经 Cache API 缓存；
 *  fontkit 为 @pdf-lib/fontkit 1.1.1 UMD 本地 vendor 版，供 pdf-lib 解析自定义字体）。
 * 注意：pdf-lib 1.17.1 的 subset:true 运行时子集化对该字体会产生损坏字形（已实测），
 * 故采用 subset:false 完整嵌入本站预子集化字体（约 2.5MB -> 压缩后约 1.6MB），渲染已真机验证。
 * 字体加载失败时降级为标准英文字体并明确提示用户。
 * pdf.js 与 pdf-lib 经 CDN 懒加载；文件只在浏览器本地以 ArrayBuffer 处理，不上传服务器。 */
(function () {
'use strict';
var PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
var PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
var PDFLIB_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
var FONTKIT_URL = '/tools/static/js/vendor/fontkit-1.1.1.umd.min.js';
var FONT_URL = '/tools/static/fonts/noto-sans-sc-subset.ttf';
var FONT_CACHE = 'toolweb-fonts-v1';
var BIG_FILE = 50 * 1024 * 1024;
var CSS_SCALE = 1.25;   // 预览渲染倍率（CSS 像素 / PDF 磅值）
var RADIO_ROW_H = 26;   // 单选组每行高度（磅值）
var RADIO_CIRCLE = 16;  // 单选圆圈直径（磅值）
var CHECK_SIZE = 18;    // 复选框边长（磅值）

function $(id) { return document.getElementById(id); }
function toast(m) {
    var el = document.createElement('div');
    el.textContent = m;
    el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:86vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) document.body.removeChild(el); }, 3200);
}
function setStatus(m) { $('fm-status').textContent = m || ''; }
function showError(m) { $('fm-error').textContent = m || ''; }
function showWarn(m) { $('fm-warn').textContent = m || ''; }
function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
}
function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
function baseName(name) { return name.replace(/\.pdf$/i, ''); }
function showProgress(text, frac) {
    $('fm-progress').style.display = 'block';
    $('fm-progress-bar').style.width = Math.round(frac * 100) + '%';
    $('fm-progress-txt').textContent = text;
}
function hideProgress() {
    $('fm-progress').style.display = 'none';
    $('fm-progress-bar').style.width = '0';
    $('fm-progress-txt').textContent = '';
}
function nextFrame() {
    return new Promise(function (resolve) {
        if (window.requestAnimationFrame) requestAnimationFrame(function () { setTimeout(resolve, 0); });
        else setTimeout(resolve, 30);
    });
}
function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ============ CDN / 本地库懒加载 ============ */
function ensureLib(src, globalName) {
    return new Promise(function (resolve, reject) {
        if (window[globalName]) { resolve(); return; }
        var s = document.createElement('script');
        var done = false;
        var timer = setTimeout(function () {
            if (!done) { done = true; s.remove(); reject(new Error('timeout')); }
        }, 25000);
        s.onload = function () {
            if (!done) { done = true; clearTimeout(timer); window[globalName] ? resolve() : reject(new Error('bad lib')); }
        };
        s.onerror = function () {
            if (!done) { done = true; clearTimeout(timer); reject(new Error('load failed')); }
        };
        s.src = src;
        document.head.appendChild(s);
    });
}
function ensurePdfJs() {
    return ensureLib(PDFJS_CDN, 'pdfjsLib').then(function () {
        if (window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
        }
    });
}
function ensurePdfLib() { return ensureLib(PDFLIB_CDN, 'PDFLib'); }
function ensureFontkit() { return ensureLib(FONTKIT_URL, 'fontkit'); }
function showLibError(what) {
    var el = $('fm-lib-error');
    el.style.display = 'block';
    el.textContent = what + '加载失败，请检查网络后重试（页面本身不受影响）。';
}
function hideLibError() { $('fm-lib-error').style.display = 'none'; $('fm-lib-error').textContent = ''; }

/* ============ 状态 ============ */
var pdfJsDoc = null;   // pdf.js 文档
var fileBuf = null;    // 原始 ArrayBuffer（供 pdf-lib 回写）
var fileInfo = null;   // {name,size,pages,base}
var pageSizes = [];    // [{wPt,hPt}]
var fields = {};       // 页号 -> [field]
var selected = null;   // {page, id}
var placeTool = null;  // text | textarea | check | radio | select
var idSeq = 0;
var busy = false;
var nameSeq = { text: 0, textarea: 0, check: 0, radio: 0, select: 0 };
var pageEls = {};      // 页号 -> {pageDiv, layers}

function fieldList(page) {
    if (!fields[page]) fields[page] = [];
    return fields[page];
}
function totalFields() {
    var n = 0;
    Object.keys(fields).forEach(function (k) { n += fields[k].length; });
    return n;
}
function findField(page, id) {
    var list = fieldList(page);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
}

/* ============ PDF 读取与错误分类 ============ */
function classifyPdfError(e) {
    var name = (e && e.name) || '';
    var msg = (e && e.message) || '';
    if (name === 'PasswordException' || /password|encrypt/i.test(msg)) {
        return '该 PDF 已加密（带打开密码），无法读取。请先用「PDF 加密/解密」工具解密后再制作表单。';
    }
    if (name === 'InvalidPDFException' || name === 'MissingPDFException') {
        return '文件损坏或不是有效的 PDF，请换一个文件试试';
    }
    return 'PDF 读取失败：文件可能已损坏或格式不受支持';
}
function isPdfFile(f) {
    return /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
}

/* ============ 文件上传与逐页渲染 ============ */
function resetAll() {
    pdfJsDoc = null; fileBuf = null; fileInfo = null;
    pageSizes = []; fields = {}; selected = null; placeTool = null; idSeq = 0;
    nameSeq = { text: 0, textarea: 0, check: 0, radio: 0, select: 0 };
    pageEls = {};
    $('fm-pages').innerHTML = '';
    $('fm-work').style.display = 'none';
    $('fm-fileinfo').style.display = 'none';
    hideProps();
    setStatus(''); showError(''); showWarn('');
    refreshButtons();
}
function renderFileInfo() {
    if (!fileInfo) return;
    $('fm-file-name').textContent = fileInfo.name;
    $('fm-file-sub').textContent = fmtSize(fileInfo.size) + ' · ' + fileInfo.pages + ' 页 · ' + totalFields() + ' 个表单域';
    $('fm-fileinfo').style.display = 'flex';
}
function loadFile(f) {
    if (!isPdfFile(f)) { showError('请选择 PDF 文件（.pdf）'); return; }
    resetAll();
    hideLibError(); showError(''); showWarn('');
    if (f.size > BIG_FILE) showWarn('文件超过 50MB，渲染与导出会比较慢，请耐心等待');
    setStatus('正在加载 PDF 组件…');
    var reader = new FileReader();
    reader.onload = function () {
        fileBuf = reader.result;
        ensurePdfJs().then(function () {
            setStatus('正在解析 PDF…');
            return window.pdfjsLib.getDocument({ data: fileBuf.slice(0) }).promise;
        }).then(function (doc) {
            pdfJsDoc = doc;
            fileInfo = { name: f.name, size: f.size, pages: doc.numPages, base: baseName(f.name) };
            setStatus('正在渲染 ' + doc.numPages + ' 页预览…');
            return renderAllPages();
        }).then(function () {
            setStatus('');
            $('fm-work').style.display = 'block';
            renderFileInfo();
            refreshButtons();
            toast('PDF 加载完成，共 ' + fileInfo.pages + ' 页，开始放置表单域吧');
        }).catch(function (e) {
            if (!window.pdfjsLib) { showLibError('PDF 预览库（pdf.js）'); }
            else { showError(classifyPdfError(e)); }
            setStatus('');
            fileBuf = null;
        });
    };
    reader.onerror = function () { showError('文件读取失败，请重试'); setStatus(''); };
    reader.readAsArrayBuffer(f);
}
function renderAllPages() {
    var container = $('fm-pages');
    container.innerHTML = '';
    var chain = Promise.resolve();
    for (var n = 1; n <= pdfJsDoc.numPages; n++) {
        (function (pageNum) {
            chain = chain.then(function () {
                showProgress('正在渲染第 ' + pageNum + ' / ' + pdfJsDoc.numPages + ' 页', pageNum / pdfJsDoc.numPages);
                return pdfJsDoc.getPage(pageNum).then(function (page) {
                    var vp = page.getViewport({ scale: 1 });
                    pageSizes[pageNum] = { wPt: vp.width, hPt: vp.height };
                    var vps = page.getViewport({ scale: CSS_SCALE });
                    var pageDiv = document.createElement('div');
                    pageDiv.className = 'fm-page';
                    pageDiv.style.width = Math.round(vps.width) + 'px';
                    pageDiv.dataset.page = pageNum;
                    var label = document.createElement('div');
                    label.className = 'fm-pagelabel';
                    label.textContent = '第 ' + pageNum + ' 页';
                    var canvas = document.createElement('canvas');
                    canvas.width = Math.round(vps.width);
                    canvas.height = Math.round(vps.height);
                    pageDiv.appendChild(canvas);
                    pageDiv.appendChild(label);
                    var layers = document.createElement('div');
                    layers.className = 'fm-layers';
                    pageDiv.appendChild(layers);
                    container.appendChild(pageDiv);
                    pageEls[pageNum] = { pageDiv: pageDiv, layers: layers };
                    layers.addEventListener('pointerdown', function (ev) { onLayersPointerDown(ev, pageNum); });
                    return page.render({ canvasContext: canvas.getContext('2d'), viewport: vps }).promise.then(nextFrame);
                });
            });
        })(n);
    }
    return chain.then(function () { hideProgress(); });
}

/* ============ 表单域模型 ============ */
function defaultName(type) {
    var label = { text: '文本框', textarea: '多行文本', check: '复选框', radio: '单选组', select: '下拉框' }[type];
    nameSeq[type]++;
    return label + nameSeq[type];
}
function defaultSize(type) {
    switch (type) {
        case 'text': return { w: 180, h: 28 };
        case 'textarea': return { w: 200, h: 64 };
        case 'check': return { w: CHECK_SIZE, h: CHECK_SIZE };
        case 'radio': return { w: 150, h: RADIO_ROW_H * 3 };
        case 'select': return { w: 170, h: 28 };
    }
    return { w: 150, h: 28 };
}
function makeField(type, page, x, y) {
    var sz = defaultSize(type);
    var wPt = pageSizes[page].wPt, hPt = pageSizes[page].hPt;
    var w = Math.min(sz.w, wPt - 8), h = Math.min(sz.h, hPt - 8);
    x = Math.max(4, Math.min(x - w / 2, wPt - w - 4));
    y = Math.max(4, Math.min(y - h / 2, hPt - h - 4));
    var f = {
        id: 'f' + (++idSeq), type: type, page: page,
        x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
        name: defaultName(type)
    };
    if (type === 'text' || type === 'textarea') { f.defaultValue = ''; f.fontSize = 12; f.multiline = (type === 'textarea'); }
    if (type === 'check') { f.checked = false; }
    if (type === 'radio' || type === 'select') {
        f.options = ['选项1', '选项2', '选项3'];
        f.selectedIdx = 0;
        if (type === 'select') f.fontSize = 12;
    }
    return f;
}
function radioRows(f) {
    return Math.max(1, Math.round(f.h / RADIO_ROW_H));
}

/* ============ 覆盖层 DOM ============ */
function fieldInnerHTML(f) {
    if (f.type === 'text' || f.type === 'textarea') {
        return '<div class="fm-finner">' + (esc(f.defaultValue) || esc(f.name)) + '</div>';
    }
    if (f.type === 'check') {
        return '<div class="fm-finner">' + (f.checked ? '☑' : '☐') + '</div>';
    }
    if (f.type === 'radio') {
        var rows = radioRows(f), html = '';
        for (var i = 0; i < rows && i < f.options.length; i++) {
            html += '<div class="fm-ropt"><span class="fm-rc' + (i === f.selectedIdx ? ' on' : '') + '"></span><span>' + esc(f.options[i]) + '</span></div>';
        }
        return '<div class="fm-finner">' + html + '</div>';
    }
    if (f.type === 'select') {
        var label = f.options.length ? f.options[Math.min(f.selectedIdx, f.options.length - 1)] : '';
        return '<div class="fm-finner" style="display:flex;align-items:center;justify-content:space-between;"><span>' + esc(label) + '</span><span>▾</span></div>';
    }
    return '';
}
function renderFieldEl(f) {
    var els = pageEls[f.page];
    if (!els) return null;
    var old = els.layers.querySelector('[data-fid="' + f.id + '"]');
    if (old) old.remove();
    var div = document.createElement('div');
    div.className = 'fm-field fm-' + f.type + (selected && selected.page === f.page && selected.id === f.id ? ' sel' : '');
    div.dataset.fid = f.id;
    div.style.left = (f.x * CSS_SCALE) + 'px';
    div.style.top = (f.y * CSS_SCALE) + 'px';
    div.style.width = (f.w * CSS_SCALE) + 'px';
    div.style.height = (f.h * CSS_SCALE) + 'px';
    div.innerHTML = fieldInnerHTML(f) + '<div class="fm-handle" data-handle="se"></div>';
    div.addEventListener('pointerdown', function (ev) { onFieldPointerDown(ev, f); });
    els.layers.appendChild(div);
    return div;
}
function rerenderField(f) { renderFieldEl(f); }
function removeFieldEl(page, id) {
    var els = pageEls[page];
    if (!els) return;
    var el = els.layers.querySelector('[data-fid="' + id + '"]');
    if (el) el.remove();
}

/* ============ 放置 / 选中 / 拖拽 / 缩放 ============ */
function setPlaceTool(t) {
    placeTool = (placeTool === t) ? null : t;
    selected = null; hideProps(); refreshFieldSel();
    var btns = $('fm-toolbar').querySelectorAll('.fm-tool');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].dataset.tool === placeTool);
    Object.keys(pageEls).forEach(function (p) { pageEls[p].layers.classList.toggle('placing', !!placeTool); });
    $('fm-hint').textContent = placeTool
        ? '已选择「' + toolLabel(placeTool) + '」：点击页面任意位置放置，再点一次工具按钮或按 Esc 取消。'
        : '① 在上方选择一种表单域 → ② 点击页面任意位置放置 → ③ 拖拽移动、拖右下角圆点缩放 → ④ 点击表单域选中，在下方属性面板里改字段名、默认值、选项。键盘 Delete 可删除选中的表单域。';
}
function toolLabel(t) {
    return { text: '单行文本框', textarea: '多行文本框', check: '复选框', radio: '单选按钮组', select: '下拉列表' }[t] || t;
}
function pagePoint(ev, page) {
    var r = pageEls[page].pageDiv.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / CSS_SCALE, y: (ev.clientY - r.top) / CSS_SCALE };
}
function onLayersPointerDown(ev, page) {
    if (!placeTool || (ev.pointerType === 'mouse' && ev.button !== 0)) {
        if (!placeTool) { selected = null; hideProps(); refreshFieldSel(); }
        return;
    }
    ev.preventDefault();
    var pt = pagePoint(ev, page);
    var f = makeField(placeTool, page, pt.x, pt.y);
    fieldList(page).push(f);
    renderFieldEl(f);
    selected = { page: page, id: f.id };
    refreshFieldSel(); showProps(f);
    renderFileInfo(); refreshButtons();
}
function refreshFieldSel() {
    Object.keys(pageEls).forEach(function (p) {
        var layers = pageEls[p].layers;
        var els = layers.querySelectorAll('.fm-field');
        for (var i = 0; i < els.length; i++) {
            var fid = els[i].dataset.fid;
            els[i].classList.toggle('sel', !!(selected && String(selected.page) === String(p) && selected.id === fid));
        }
    });
}
function onFieldPointerDown(ev, f) {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.preventDefault(); ev.stopPropagation();
    var isHandle = ev.target && ev.target.dataset && ev.target.dataset.handle === 'se';
    selected = { page: f.page, id: f.id };
    refreshFieldSel(); showProps(f);
    var startX = ev.clientX, startY = ev.clientY;
    var orig = { x: f.x, y: f.y, w: f.w, h: f.h };
    var moved = false;
    var el = pageEls[f.page].layers.querySelector('[data-fid="' + f.id + '"]');
    function onMove(e2) {
        var dx = (e2.clientX - startX) / CSS_SCALE, dy = (e2.clientY - startY) / CSS_SCALE;
        if (Math.abs(e2.clientX - startX) + Math.abs(e2.clientY - startY) > 3) moved = true;
        var wPt = pageSizes[f.page].wPt, hPt = pageSizes[f.page].hPt;
        if (isHandle) {
            f.w = Math.max(14, Math.min(orig.w + dx, wPt - orig.x - 4));
            f.h = Math.max(14, Math.min(orig.h + dy, hPt - orig.y - 4));
            if (f.type === 'check') { var s = Math.max(14, Math.min(f.w, f.h)); f.w = s; f.h = s; }
        } else {
            f.x = Math.max(0, Math.min(orig.x + dx, wPt - f.w));
            f.y = Math.max(0, Math.min(orig.y + dy, hPt - f.h));
        }
        f.x = Math.round(f.x); f.y = Math.round(f.y); f.w = Math.round(f.w); f.h = Math.round(f.h);
        if (el) {
            el.style.left = (f.x * CSS_SCALE) + 'px'; el.style.top = (f.y * CSS_SCALE) + 'px';
            el.style.width = (f.w * CSS_SCALE) + 'px'; el.style.height = (f.h * CSS_SCALE) + 'px';
        }
    }
    function onUp() {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        if (moved) rerenderField(f);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
}
function deleteSelected() {
    if (!selected) return;
    var list = fieldList(selected.page);
    for (var i = 0; i < list.length; i++) {
        if (list[i].id === selected.id) { list.splice(i, 1); break; }
    }
    removeFieldEl(selected.page, selected.id);
    selected = null; hideProps();
    renderFileInfo(); refreshButtons();
    toast('已删除该表单域');
}

/* ============ 属性面板 ============ */
function hideProps() {
    $('fm-props').style.display = 'none';
    $('fm-props').innerHTML = '';
}
function showProps(f) {
    var box = $('fm-props');
    var html = '<h4><i class="material-icons">tune</i>表单域属性 · ' + esc(toolLabel(f.type)) + '</h4>';
    html += '<div class="fm-prow"><label>字段名</label><input type="text" id="fm-p-name" value="' + esc(f.name) + '" maxlength="60"></div>';
    if (f.type === 'text' || f.type === 'textarea') {
        html += '<div class="fm-prow"><label>默认值</label>' +
            (f.type === 'textarea'
                ? '<textarea id="fm-p-defval" maxlength="2000">' + esc(f.defaultValue) + '</textarea>'
                : '<input type="text" id="fm-p-defval" value="' + esc(f.defaultValue) + '" maxlength="500">') + '</div>';
        html += '<div class="fm-prow"><label>字号</label><input type="number" id="fm-p-fs" min="8" max="36" value="' + f.fontSize + '"></div>';
    }
    if (f.type === 'check') {
        html += '<div class="fm-prow"><label>默认状态</label><label style="min-width:0;display:inline-flex;align-items:center;gap:.4rem;cursor:pointer;"><input type="checkbox" id="fm-p-checked"' + (f.checked ? ' checked' : '') + ' style="width:20px;height:20px;accent-color:var(--primary-color);"> 默认勾选</label></div>';
    }
    if (f.type === 'radio' || f.type === 'select') {
        html += '<div class="fm-prow"><label>选项</label><div class="fm-optlist" id="fm-p-opts"></div></div>';
        html += '<div class="fm-prow"><button type="button" class="fm-addopt" id="fm-p-addopt">＋ 添加选项</button></div>';
        if (f.type === 'select') {
            html += '<div class="fm-prow"><label>字号</label><input type="number" id="fm-p-fs" min="8" max="36" value="' + f.fontSize + '"></div>';
        }
    }
    html += '<div class="fm-prow"><button type="button" class="fm-del" id="fm-p-del"><i class="material-icons" style="font-size:1.05rem">delete</i>删除该表单域</button></div>';
    box.innerHTML = html;
    box.style.display = 'block';

    $('fm-p-name').addEventListener('input', function (e) { f.name = e.target.value.trim() || f.name; rerenderField(f); });
    var dv = $('fm-p-defval');
    if (dv) dv.addEventListener('input', function (e) { f.defaultValue = e.target.value; rerenderField(f); });
    var fs = $('fm-p-fs');
    if (fs) fs.addEventListener('change', function (e) {
        var v = parseInt(e.target.value, 10);
        if (v >= 8 && v <= 36) f.fontSize = v;
    });
    var ck = $('fm-p-checked');
    if (ck) ck.addEventListener('change', function (e) { f.checked = e.target.checked; rerenderField(f); });
    $('fm-p-del').addEventListener('click', deleteSelected);

    if (f.type === 'radio' || f.type === 'select') renderOptList(f);
}
function renderOptList(f) {
    var wrap = $('fm-p-opts');
    if (!wrap) return;
    wrap.innerHTML = '';
    f.options.forEach(function (label, i) {
        var row = document.createElement('div');
        row.className = 'fm-opt';
        var isDef = (i === f.selectedIdx);
        row.innerHTML = '<button type="button" class="def' + (isDef ? ' on' : '') + '" title="设为默认选中"><i class="material-icons" style="font-size:1rem">' +
            (f.type === 'radio' ? 'radio_button_checked' : 'arrow_drop_down_circle') + '</i></button>' +
            '<input type="text" value="' + esc(label) + '" maxlength="80" aria-label="选项' + (i + 1) + '">' +
            '<button type="button" class="rm" title="删除选项"><i class="material-icons" style="font-size:1rem">close</i></button>';
        var btns = row.querySelectorAll('button');
        btns[0].addEventListener('click', function () { f.selectedIdx = i; rerenderField(f); renderOptList(f); });
        btns[1].addEventListener('click', function () {
            if (f.options.length <= 1) { toast('至少保留一个选项'); return; }
            f.options.splice(i, 1);
            if (f.selectedIdx >= f.options.length) f.selectedIdx = f.options.length - 1;
            if (f.type === 'radio') f.h = Math.max(RADIO_ROW_H, RADIO_ROW_H * Math.min(6, f.options.length));
            rerenderField(f); renderOptList(f);
        });
        row.querySelector('input').addEventListener('input', function (e) { f.options[i] = e.target.value; rerenderField(f); });
        wrap.appendChild(row);
    });
    var add = $('fm-p-addopt');
    if (add) add.onclick = function () {
        if (f.options.length >= 12) { toast('选项最多 12 个'); return; }
        f.options.push('选项' + (f.options.length + 1));
        if (f.type === 'radio') f.h = RADIO_ROW_H * Math.min(8, f.options.length);
        rerenderField(f); renderOptList(f);
    };
}

/* ============ 按钮状态 ============ */
function refreshButtons() {
    var hasFile = !!fileBuf;
    var n = totalFields();
    $('fm-export').disabled = !(hasFile && n > 0) || busy;
    $('fm-clear-fields').disabled = !(hasFile && n > 0) || busy;
    $('fm-count').textContent = hasFile ? ('已放置 ' + n + ' 个表单域') : '';
}

/* ============ 中文字体加载（本站同源 + Cache API 缓存） ============ */
function fetchFontBytes() {
    function net() {
        return fetch(FONT_URL).then(function (resp) {
            if (!resp.ok) throw new Error('font http ' + resp.status);
            return resp.arrayBuffer();
        });
    }
    if ('caches' in window) {
        return caches.open(FONT_CACHE).then(function (cache) {
            return cache.match(FONT_URL).then(function (hit) {
                if (hit) return hit.arrayBuffer();
                return net().then(function (buf) {
                    cache.put(FONT_URL, new Response(buf.slice(0), { headers: { 'Content-Type': 'font/ttf' } }));
                    return buf;
                });
            });
        }).catch(net);
    }
    return net();
}

/* ============ 导出 AcroForm ============ */
function uniqueName(used, name) {
    name = String(name || '').trim() || '字段';
    if (!used[name]) { used[name] = true; return name; }
    var i = 2;
    while (used[name + '_' + i]) i++;
    used[name + '_' + i] = true;
    return name + '_' + i;
}
function doExport() {
    if (busy || !fileBuf || totalFields() === 0) return;
    hideLibError(); showError(''); showWarn('');
    busy = true; refreshButtons();
    showProgress('正在加载 PDF 处理组件…', 0);
    var cjkOk = true, cjkFont = null, pdfDoc = null;
    ensurePdfLib().then(function () {
        showProgress('正在加载中文字体组件…', 0.08);
        return ensureFontkit().then(function () { /* ok */ }, function () { cjkOk = false; });
    }).then(function () {
        showProgress('正在读取原 PDF…', 0.15);
        return window.PDFLib.PDFDocument.load(fileBuf.slice(0), { ignoreEncryption: false });
    }).then(function (doc) {
        pdfDoc = doc;
        if (!cjkOk) return null;
        return fetchFontBytesCached(doc).then(function (font) { return font; }, function (e) { cjkOk = false; return null; });
    }).then(function (font) {
        cjkFont = font;
        if (!cjkOk || !cjkFont) {
            showWarn('中文字体加载失败，已降级为英文字体导出：表单域中的中文可能显示为空白，建议改用英文填写。如需中文请检查网络后重试。');
        }
        var pages = pdfDoc.getPages();
        var form = pdfDoc.getForm();
        var used = {};
        var total = pages.length, done = 0;
        var chain = Promise.resolve();
        pages.forEach(function (page, idx) {
            chain = chain.then(function () {
                done++;
                showProgress('正在写入第 ' + (idx + 1) + ' / ' + total + ' 页表单域', 0.15 + 0.7 * (done / total));
                var list = fields[idx + 1] || [];
                if (!list.length) return null;
                var size = page.getSize(), hPt = size.height;
                var PL = window.PDFLib;
                list.forEach(function (f) {
                    var yUp = hPt - f.y - f.h;
                    if (f.type === 'text' || f.type === 'textarea') {
                        var tf = form.createTextField(uniqueName(used, f.name));
                        tf.addToPage(page, {
                            x: f.x, y: yUp, width: f.w, height: f.h,
                            textColor: PL.rgb(0, 0, 0), backgroundColor: PL.rgb(1, 1, 1),
                            borderColor: PL.rgb(0.55, 0.55, 0.55), borderWidth: 1
                        });
                        if (f.multiline) tf.enableMultiline();
                        tf.setFontSize(f.fontSize || 12);
                        if (f.defaultValue) tf.setText(f.defaultValue);
                    } else if (f.type === 'check') {
                        var cb = form.createCheckBox(uniqueName(used, f.name));
                        cb.addToPage(page, { x: f.x, y: yUp, width: f.w, height: f.h });
                        if (f.checked) cb.check(); else cb.uncheck();
                    } else if (f.type === 'radio') {
                        var rg = form.createRadioGroup(uniqueName(used, f.name));
                        var rows = Math.min(f.options.length, radioRows(f));
                        for (var i = 0; i < rows; i++) {
                            var label = String(f.options[i] == null ? '' : f.options[i]).trim() || ('选项' + (i + 1));
                            var oyUp = hPt - (f.y + i * RADIO_ROW_H) - RADIO_CIRCLE;
                            rg.addOptionToPage(label, page, { x: f.x, y: oyUp, width: RADIO_CIRCLE, height: RADIO_CIRCLE });
                        }
                        var selLabel = String(f.options[Math.min(f.selectedIdx, rows - 1)] || '').trim() || '选项1';
                        try { rg.select(selLabel); } catch (e) { /* 忽略 */ }
                    } else if (f.type === 'select') {
                        var dd = form.createDropdown(uniqueName(used, f.name));
                        dd.addToPage(page, {
                            x: f.x, y: yUp, width: f.w, height: f.h,
                            textColor: PL.rgb(0, 0, 0), backgroundColor: PL.rgb(1, 1, 1),
                            borderColor: PL.rgb(0.55, 0.55, 0.55), borderWidth: 1
                        });
                        var opts = f.options.map(function (o, i) { return String(o == null ? '' : o).trim() || ('选项' + (i + 1)); });
                        dd.addOptions(opts);
                        dd.setFontSize(f.fontSize || 12);
                        var sel = opts[Math.min(f.selectedIdx, opts.length - 1)];
                        if (sel) { try { dd.select(sel); } catch (e) { /* 忽略 */ } }
                    }
                });
                return nextFrame();
            });
        });
        return chain.then(function () {
            showProgress('正在生成可填写 PDF…', 0.92);
            if (cjkFont) form.updateFieldAppearances(cjkFont);
            else form.updateFieldAppearances();
            return pdfDoc.save();
        });
    }).then(function (bytes) {
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'fillable_' + fileInfo.base + '.pdf');
        var tip = cjkOk ? '（中文表单域已内嵌字体）' : '（英文降级模式）';
        toast('已导出可填写 PDF：fillable_' + fileInfo.base + '.pdf，共 ' + totalFields() + ' 个表单域' + tip);
        showProgress('导出完成', 1);
        setTimeout(hideProgress, 1200);
    }).catch(function (e) {
        if (!window.PDFLib) {
            showLibError('PDF 处理库（pdf-lib）');
        } else if (/fontkit|font/i.test((e && e.message) || '') && cjkOk) {
            showError('中文字体处理失败，请重试或检查网络');
        } else if (/encrypt/i.test((e && e.message) || '')) {
            showError('该 PDF 已加密，无法写入表单域，请先解密后再试');
        } else {
            showError('导出失败：' + ((e && e.message) || '未知错误') + '，请换一个文件重试');
        }
    }).then(function () {
        busy = false;
        hideProgress();
        refreshButtons();
        renderFileInfo();
    });
}
/* 字体嵌入（带一次重试）；子集化说明见文件头注释 */
var _fontBufCache = null;
function fetchFontBytesCached(doc) {
    function embed(buf) {
        doc.registerFontkit(window.fontkit);
        return doc.embedFont(buf, { subset: false });
    }
    if (_fontBufCache) return Promise.resolve().then(function () { return embed(_fontBufCache); });
    return fetchFontBytes().then(function (buf) {
        _fontBufCache = buf;
        return embed(buf);
    });
}

/* ============ 事件绑定与初始化 ============ */
function init() {
    var upload = $('fm-upload'), fileInput = $('fm-file');
    upload.addEventListener('click', function () { fileInput.click(); });
    upload.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) loadFile(fileInput.files[0]);
        fileInput.value = '';
    });
    ['dragover', 'dragenter'].forEach(function (ev) {
        upload.addEventListener(ev, function (e) { e.preventDefault(); upload.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
        upload.addEventListener(ev, function (e) { e.preventDefault(); upload.classList.remove('dragover'); });
    });
    upload.addEventListener('drop', function (e) {
        var dt = e.dataTransfer;
        if (dt && dt.files && dt.files[0]) loadFile(dt.files[0]);
    });
    $('fm-clear-file').addEventListener('click', resetAll);

    var btns = $('fm-toolbar').querySelectorAll('.fm-tool');
    for (var i = 0; i < btns.length; i++) {
        (function (b) { b.addEventListener('click', function () { setPlaceTool(b.dataset.tool); }); })(btns[i]);
    }
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && placeTool) setPlaceTool(placeTool);
        var tag = (e.target && e.target.tagName || '').toLowerCase();
        if ((e.key === 'Delete' || e.key === 'Backspace') && selected && tag !== 'input' && tag !== 'textarea') {
            e.preventDefault(); deleteSelected();
        }
    });

    $('fm-export').addEventListener('click', doExport);
    $('fm-clear-fields').addEventListener('click', function () {
        if (busy || totalFields() === 0) return;
        Object.keys(fields).forEach(function (p) {
            (fields[p] || []).forEach(function (f) { removeFieldEl(Number(p), f.id); });
        });
        fields = {}; selected = null; hideProps();
        renderFileInfo(); refreshButtons();
        toast('已清空全部表单域');
    });
    refreshButtons();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
