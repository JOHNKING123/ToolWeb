/* OCR 图片文字识别 - 纯前端本地识别（tesseract.js v6 + tessdata_fast 语言包）
 * 流程：图片上传（点击/拖拽/Ctrl+V 粘贴）→ 预览 + canvas 框选区域 →
 * tesseract.js WASM 本地识别（语言包经 jsdelivr CDN 懒加载，IndexedDB 缓存）→
 * 可编辑文本结果 + 平均置信度 + 一键复制 + 导出 ocr_<时间戳>.txt。
 * 全程不上传服务器，无新增后端接口；CDN 失败时给出可读报错，页面不白屏。 */
(function () {
'use strict';
var TESS_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.min.js';
var LANG_PATH = 'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@main';
var BIG_IMG = 10 * 1024 * 1024;   // 超过 10MB 仅提示较慢，不拦截
var MIN_SEL = 8;                  // 选框最小边长（显示像素），小于则视为误触清除

var worker = null;        // tesseract worker
var workerLangs = '';     // 当前 worker 的语言组合
var imgURL = null;        // 预览图 objectURL
var imgNatural = null;    // {w,h} 原图像素尺寸
var busy = false;         // 识别/加载进行中
var cancelled = false;    // 用户取消标记
var seq = 0;              // 识别序号，防竞态
var sel = null;           // 选框 {x,y,w,h}（显示像素坐标，相对预览图左上角）
var dragMode = null;      // 'create' | 'move' | 'resize-tl|tr|bl|br'
var dragStart = null;     // {x,y} 拖拽起点（显示像素）
var selStart = null;      // 拖拽起始时的选框快照

function $(id) { return document.getElementById(id); }
function toast(m) {
    var el = document.createElement('div');
    el.textContent = m;
    el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:86vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) document.body.removeChild(el); }, 3000);
}
function setStatus(m) { $('ocr-status').textContent = m || ''; }
function showError(m) { $('ocr-error').textContent = m || ''; }
function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
}
function fmtTime(d) {
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}
function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
function checkedVal(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
}
function showProgress(text, frac) {
    $('ocr-progress').style.display = 'block';
    $('ocr-progress-bar').style.width = Math.round(frac * 100) + '%';
    $('ocr-progress-txt').textContent = text;
}
function hideProgress() {
    $('ocr-progress').style.display = 'none';
    $('ocr-progress-bar').style.width = '0';
    $('ocr-progress-txt').textContent = '';
}
function setBusy(b, label) {
    busy = b;
    $('ocr-run').disabled = b || !imgURL;
    $('ocr-run-sel').disabled = b || !imgURL || !sel;
    $('ocr-cancel').style.display = b ? '' : 'none';
    if (label !== undefined) showProgress(label, 0);
}

/* ============ CDN 脚本懒加载（失败给出可读报错） ============ */
function ensureLib(src, globalName) {
    return new Promise(function (resolve, reject) {
        if (window[globalName]) { resolve(); return; }
        var s = document.createElement('script');
        var done = false;
        var timer = setTimeout(function () {
            if (!done) { done = true; s.remove(); reject(new Error('timeout')); }
        }, 20000);
        s.onload = function () {
            if (!done) { done = true; clearTimeout(timer); window[globalName] ? resolve() : reject(new Error('bad lib')); }
        };
        s.onerror = function () {
            if (!done) { done = true; clearTimeout(timer); s.remove(); reject(new Error('network')); }
        };
        s.src = src;
        document.head.appendChild(s);
    });
}
function libLoadFail(what) {
    var el = $('ocr-lib-error');
    el.style.display = 'block';
    el.textContent = what + '库加载失败，请检查网络后重试（页面本身不受影响）。';
}

/* ============ 图片载入（点击/拖拽/粘贴） ============ */
function loadFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { showError('请选择图片文件（PNG/JPG/WebP 等）。'); return; }
    showError('');
    if (imgURL) URL.revokeObjectURL(imgURL);
    imgURL = URL.createObjectURL(file);
    var img = $('ocr-img');
    img.onload = function () {
        imgNatural = { w: img.naturalWidth, h: img.naturalHeight };
        $('ocr-preview').style.display = 'block';
        $('ocr-fileinfo').style.display = 'flex';
        $('ocr-file-name').textContent = file.name || '粘贴的图片';
        $('ocr-file-name').title = file.name || '粘贴的图片';
        var sub = fmtSize(file.size) + ' · ' + img.naturalWidth + '×' + img.naturalHeight + ' 像素';
        if (file.size > BIG_IMG) sub += ' · 图片较大，识别可能较慢';
        $('ocr-file-sub').textContent = sub;
        sel = null;
        drawOverlay();
        setStatus('图片已载入，点击「开始识别」进行整图识别，或在图上框选区域后识别选中部分。');
        setBusy(false);
        $('ocr-result-card').style.display = 'none';
    };
    img.onerror = function () { showError('图片读取失败，请换一张图片重试。'); };
    img.src = imgURL;
}
function clearFile() {
    if (imgURL) { URL.revokeObjectURL(imgURL); imgURL = null; }
    $('ocr-file').value = '';
    $('ocr-preview').style.display = 'none';
    $('ocr-fileinfo').style.display = 'none';
    $('ocr-result-card').style.display = 'none';
    sel = null;
    imgNatural = null;
    setStatus('');
    showError('');
    setBusy(false);
}

/* ============ 框选（鼠标 + 触摸，pointer 事件统一处理） ============ */
function stagePos(e) {
    var r = $('ocr-stage').getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function hitHandle(p) {
    if (!sel) return null;
    var hs = 14, hw = hs / 2;   // 触摸下把手放大，便于手指操作
    var corners = { tl: [sel.x, sel.y], tr: [sel.x + sel.w, sel.y], bl: [sel.x, sel.y + sel.h], br: [sel.x + sel.w, sel.y + sel.h] };
    for (var k in corners) {
        var c = corners[k];
        if (Math.abs(p.x - c[0]) <= hw && Math.abs(p.y - c[1]) <= hw) return 'resize-' + k;
    }
    return null;
}
function inSel(p) {
    return sel && p.x >= sel.x && p.x <= sel.x + sel.w && p.y >= sel.y && p.y <= sel.y + sel.h;
}
function drawOverlay() {
    var stage = $('ocr-stage'), img = $('ocr-img'), cv = $('ocr-overlay');
    var w = img.clientWidth, h = img.clientHeight;
    if (!w || !h) return;
    cv.width = w; cv.height = h;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (!sel) {
        $('ocr-sel-tip').textContent = '在图上拖拽可框选文字区域（触摸拖拽亦可），再点「识别选中区域」。';
        $('ocr-run-sel').disabled = busy || !imgURL;
        return;
    }
    ctx.fillStyle = 'rgba(17,24,39,.35)';
    ctx.fillRect(0, 0, w, h);
    ctx.clearRect(sel.x, sel.y, sel.w, sel.h);
    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2;
    ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
    ctx.fillStyle = '#2563eb';
    var corners = [[sel.x, sel.y], [sel.x + sel.w, sel.y], [sel.x, sel.y + sel.h], [sel.x + sel.w, sel.y + sel.h]];
    corners.forEach(function (c) { ctx.fillRect(c[0] - 5, c[1] - 5, 10, 10); });
    var scale = imgNatural.w / w;
    $('ocr-sel-tip').textContent = '已框选约 ' + Math.round(sel.w * scale) + '×' + Math.round(sel.h * scale) +
        ' 像素；拖拽选框可移动，拖角上小方块可调整大小。';
    $('ocr-run-sel').disabled = busy || !imgURL || !sel;
}
function bindSelection() {
    var cv = $('ocr-overlay');
    cv.addEventListener('pointerdown', function (e) {
        if (!imgURL || busy) return;
        e.preventDefault();
        cv.setPointerCapture(e.pointerId);
        var p = stagePos(e);
        dragStart = p;
        var h = hitHandle(p);
        if (h) { dragMode = h; selStart = { x: sel.x, y: sel.y, w: sel.w, h: sel.h }; }
        else if (inSel(p)) { dragMode = 'move'; selStart = { x: sel.x, y: sel.y, w: sel.w, h: sel.h }; }
        else { dragMode = 'create'; sel = { x: p.x, y: p.y, w: 0, h: 0 }; selStart = null; }
    });
    cv.addEventListener('pointermove', function (e) {
        if (!dragMode || !dragStart) return;
        e.preventDefault();
        var p = stagePos(e);
        var dx = p.x - dragStart.x, dy = p.y - dragStart.y;
        var W = $('ocr-img').clientWidth, H = $('ocr-img').clientHeight;
        function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
        if (dragMode === 'create') {
            sel.x = clamp(Math.min(dragStart.x, p.x), 0, W);
            sel.y = clamp(Math.min(dragStart.y, p.y), 0, H);
            sel.w = clamp(Math.abs(dx), 0, W - sel.x);
            sel.h = clamp(Math.abs(dy), 0, H - sel.y);
        } else if (dragMode === 'move') {
            sel.x = clamp(selStart.x + dx, 0, W - sel.w);
            sel.y = clamp(selStart.y + dy, 0, H - sel.h);
        } else if (dragMode.indexOf('resize-') === 0) {
            var which = dragMode.slice(7);
            var r = { x: selStart.x, y: selStart.y, w: selStart.w, h: selStart.h };
            if (which.indexOf('l') === 0) { var nx = clamp(selStart.x + dx, 0, selStart.x + selStart.w - MIN_SEL); r.w = selStart.w + (selStart.x - nx); r.x = nx; }
            else { r.w = clamp(selStart.w + dx, MIN_SEL, W - selStart.x); }
            if (which[1] === 't') { var ny = clamp(selStart.y + dy, 0, selStart.y + selStart.h - MIN_SEL); r.h = selStart.h + (selStart.y - ny); r.y = ny; }
            else { r.h = clamp(selStart.h + dy, MIN_SEL, H - selStart.y); }
            sel = r;
        }
        drawOverlay();
    });
    function endDrag(e) {
        if (!dragMode) return;
        if (dragMode === 'create' && sel && (sel.w < MIN_SEL || sel.h < MIN_SEL)) sel = null;
        dragMode = null; dragStart = null; selStart = null;
        drawOverlay();
    }
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    window.addEventListener('resize', drawOverlay);
}

/* ============ tesseract worker（懒创建、语言切换即重建） ============ */
function langCode() {
    return checkedVal('ocr-lang') === 'eng' ? 'eng' : 'chi_sim+eng';
}
function langLabel(code) {
    return code === 'eng' ? '英文' : '中文';
}
function statusText(status, code) {
    if (status === 'loading tesseract core') return '正在加载识别引擎…';
    if (status === 'initializing tesseract') return '正在初始化识别引擎…';
    if (status === 'loading language traineddata') return '正在加载' + langLabel(code) + '语言包…（约' + (code === 'eng' ? '4' : '7') + 'MB，首次稍慢，之后自动缓存）';
    if (status === 'recognizing text') return '正在识别…';
    return '准备中…';
}
async function ensureWorker(code, mySeq) {
    if (worker && workerLangs === code) return worker;
    if (worker) { try { await worker.terminate(); } catch (e) {} worker = null; }
    var T = window.Tesseract;
    var w = await T.createWorker(code, T.OEM.LSTM_ONLY, {
        langPath: LANG_PATH,
        gzip: false,                 // tessdata_fast 提供未压缩 .traineddata，直传
        cacheMethod: 'write',        // IndexedDB 缓存语言包，二次打开免下载
        logger: function (m) {
            if (mySeq !== seq || cancelled) return;
            if (m.status === 'recognizing text') showProgress('正在识别…' + Math.round(m.progress * 100) + '%', m.progress);
            else showProgress(statusText(m.status, code) + Math.round((m.progress || 0) * 100) + '%', (m.progress || 0) * 0.999);
        }
    });
    if (mySeq !== seq || cancelled) { try { await w.terminate(); } catch (e) {} throw new Error('cancelled'); }
    worker = w; workerLangs = code;
    return w;
}

/* ============ 识别执行 ============ */
function selToNatural() {
    if (!sel || !imgNatural) return null;
    var img = $('ocr-img');
    var sx = imgNatural.w / img.clientWidth, sy = imgNatural.h / img.clientHeight;
    return {
        left: Math.max(0, Math.round(sel.x * sx)),
        top: Math.max(0, Math.round(sel.y * sy)),
        width: Math.max(1, Math.round(sel.w * sx)),
        height: Math.max(1, Math.round(sel.h * sy))
    };
}
async function doRecognize(useSel) {
    if (!imgURL || busy) return;
    if (useSel && !sel) { toast('请先在图上框选要识别的区域'); return; }
    showError('');
    var mySeq = ++seq;
    cancelled = false;
    setBusy(true, '准备识别引擎…');
    $('ocr-result-card').style.display = 'none';
    var code = langCode();
    try {
        await ensureLib(TESS_CDN, 'Tesseract');
    } catch (e) {
        libLoadFail('识别引擎');
        setBusy(false); hideProgress();
        return;
    }
    try {
        var w = await ensureWorker(code, mySeq);
        if (mySeq !== seq || cancelled) return;
        var opts = {};
        if (useSel) {
            var rect = selToNatural();
            if (rect) opts.rectangle = rect;
        }
        showProgress(useSel ? '正在识别选中区域…0%' : '正在识别…0%', 0);
        var res = await w.recognize($('ocr-img'), opts);
        if (mySeq !== seq || cancelled) return;
        var text = (res.data.text || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        var conf = Math.round(res.data.confidence || 0);
        showResult(text, conf);
    } catch (e) {
        if (mySeq !== seq || String(e && e.message) === 'cancelled') return;
        showError('识别失败：' + (e && e.message ? e.message : '未知错误') + '。语言包加载失败时请检查网络后重试。');
    } finally {
        if (mySeq === seq && !cancelled) { setBusy(false); hideProgress(); }
    }
}
function showResult(text, conf) {
    $('ocr-result-card').style.display = 'block';
    if (!text) {
        $('ocr-result-empty').style.display = 'block';
        $('ocr-result-ok').style.display = 'none';
        setStatus('识别完成，但未识别到文字。');
        return;
    }
    $('ocr-result-empty').style.display = 'none';
    $('ocr-result-ok').style.display = 'block';
    $('ocr-text').value = text;
    $('ocr-conf').textContent = '平均置信度 ' + conf + '%';
    $('ocr-count').textContent = '共 ' + text.replace(/\s/g, '').length + ' 字（不计空白）';
    setStatus('识别完成，可在文本框内直接校对修改。');
    $('ocr-result-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
async function cancelWork() {
    cancelled = true; seq++;
    setBusy(false); hideProgress();
    setStatus('已取消。');
    if (worker) { try { await worker.terminate(); } catch (e) {} worker = null; workerLangs = ''; }
}

/* ============ 事件绑定 ============ */
document.addEventListener('DOMContentLoaded', function () {
    var up = $('ocr-upload'), fi = $('ocr-file');
    up.addEventListener('click', function () { fi.click(); });
    up.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fi.click(); } });
    fi.addEventListener('change', function () { if (fi.files && fi.files[0]) loadFile(fi.files[0]); });
    ['dragover', 'dragenter'].forEach(function (ev) {
        up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
        up.addEventListener(ev, function (e) { e.preventDefault(); up.classList.remove('dragover'); });
    });
    up.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) loadFile(f);
    });
    // Ctrl+V / 右键粘贴截图
    document.addEventListener('paste', function (e) {
        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (var i = 0; i < items.length; i++) {
            if (items[i].type && items[i].type.indexOf('image/') === 0) {
                var f = items[i].getAsFile();
                if (f) { e.preventDefault(); loadFile(f); setStatus('已从剪贴板读取截图。'); }
                return;
            }
        }
    });
    $('ocr-clear').addEventListener('click', clearFile);
    $('ocr-img').addEventListener('load', drawOverlay);
    bindSelection();
    $('ocr-run').addEventListener('click', function () { doRecognize(false); });
    $('ocr-run-sel').addEventListener('click', function () { doRecognize(true); });
    $('ocr-clear-sel').addEventListener('click', function () { sel = null; drawOverlay(); });
    $('ocr-cancel').addEventListener('click', cancelWork);
    // 语言切换：下次识别时重建 worker
    var radios = document.querySelectorAll('input[name="ocr-lang"]');
    radios.forEach(function (r) {
        r.addEventListener('change', function () {
            if (worker) { var w = worker; worker = null; workerLangs = ''; w.terminate().catch(function () {}); }
            setStatus('已切换为「' + (langCode() === 'eng' ? '仅英文' : '中英文混排') + '」，下次识别时加载对应语言包。');
        });
    });
    $('ocr-copy').addEventListener('click', function () {
        var t = $('ocr-text').value;
        if (!t) { toast('没有可复制的内容'); return; }
        function done() { toast('已复制到剪贴板'); }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(t).then(done, function () { fallbackCopy(t, done); });
        } else fallbackCopy(t, done);
    });
    function fallbackCopy(t, done) {
        $('ocr-text').select();
        try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动选择复制'); }
    }
    $('ocr-export').addEventListener('click', function () {
        var t = $('ocr-text').value;
        if (!t) { toast('没有可导出的内容'); return; }
        downloadBlob(new Blob([t], { type: 'text/plain;charset=utf-8' }), 'ocr_' + fmtTime(new Date()) + '.txt');
        toast('已导出 .txt 文件');
    });
});
})();
