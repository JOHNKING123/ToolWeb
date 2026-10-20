/* 图片批量缩放器 - 纯前端批量图片缩放（canvas 引擎）
 *
 * 纯逻辑层（BIR-CORE）：四预设等比尺寸计算、输出文件名规则、格式/质量规则 —— 无 DOM，可在 Node 下单测。
 * DOM 层：文件队列（拖拽/选择）、canvas 批量缩放引擎、大图降采样保护、
 *   PNG 透明转 JPEG/WebP 垫白底、objectURL 用后 revoke、JSZip CDN 懒加载打包下载（加载失败降级逐个下载）。
 * 文件只在浏览器本地处理，不上传服务器。
 */
(function () {
'use strict';

/*<BIR-CORE-BEGIN>*/
/* ---------------- 纯逻辑：缩放尺寸计算 ---------------- */

/* 统一输入为有限正数，非法输入按 null 返回 */
function birToPosNum(v) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0) return null;
    return n;
}

/**
 * 按预设计算目标尺寸（等比）。
 * @param {number} ow 原图宽 (px, >0)
 * @param {number} oh 原图高 (px, >0)
 * @param {string} mode 'width'|'height'|'percent'|'max'
 * @param {number|string} value 数值（width/height: px；percent: 1~1000 之间的百分数；max: 最长边的 px 上限）
 * @param {number} [maxDim] 大图保护上限（默认 8192），输出宽高同时被钳制
 * @returns {{w:number,h:number}|null} 合法输入返回四舍五入后的目标尺寸；非法返回 null
 */
function birTargetSize(ow, oh, mode, value, maxDim) {
    ow = birToPosNum(ow);
    oh = birToPosNum(oh);
    if (ow === null || oh === null) return null;
    maxDim = maxDim == null ? 8192 : birToPosNum(maxDim);
    if (maxDim === null) maxDim = 8192;

    var ratio = ow / oh, w, h;
    if (mode === 'width') {
        var tw = birToPosNum(value);
        if (tw === null) return null;
        w = tw; h = tw / ratio;
    } else if (mode === 'height') {
        var th = birToPosNum(value);
        if (th === null) return null;
        h = th; w = th * ratio;
    } else if (mode === 'percent') {
        var p = Number(value);
        if (!isFinite(p) || p <= 0 || p > 1000) return null;
        w = ow * p / 100; h = oh * p / 100;
    } else if (mode === 'max') {
        var m = birToPosNum(value);
        if (m === null) return null;
        var s = m / Math.max(ow, oh);
        w = ow * s; h = oh * s;
    } else {
        return null;
    }
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    /* 大图保护：双轴钳制，保持比例 */
    var clamp = maxDim / Math.max(w, h);
    if (clamp < 1) {
        w = Math.max(1, Math.round(w * clamp));
        h = Math.max(1, Math.round(h * clamp));
    }
    return { w: w, h: h };
}

/* 大图保护钳制因子（纯逻辑，供单测复核）：输入任意尺寸，输出被钳制后的比例因子 */
function birClampFactor(ow, oh, maxDim) {
    var m = Math.max(ow, oh);
    if (!(m > 0) || !(maxDim > 0)) return null;
    return m > maxDim ? maxDim / m : 1;
}

/* ---------------- 纯逻辑：输出文件名 ---------------- */

/* 是否为透明通道源格式（需要垫白底的 JPEG 输出才生效） */
function birHasAlpha(fileType) {
    return fileType === 'image/png' || fileType === 'image/webp';
}

/* 根据输出格式求文件扩展名 */
function birOutExt(fmt) {
    if (fmt === 'jpeg') return '.jpg';
    if (fmt === 'webp') return '.webp';
    if (fmt === 'png') return '.png';
    return null;
}

/* PNG 透明转 JPEG 需要垫白底；其他组合不需要 */
function birNeedWhiteBg(srcType, outFmt) {
    return outFmt === 'jpeg' && birHasAlpha(srcType);
}

/**
 * 生成打包/下载文件名：原名（去扩展名）_宽x高.扩展名
 * 扩展名规则：保持原格式取原扩展名（缺省按 mime 推导）；jpeg/webp 输出用对应扩展名。
 */
function birOutName(fileName, w, h, srcType, outFmt) {
    var base = String(fileName == null ? 'image' : fileName).replace(/\.[a-zA-Z0-9]{1,5}$/, '');
    if (!base) base = 'image';
    var ext;
    if (outFmt === 'keep') {
        ext = String(fileName || '').match(/\.[a-zA-Z0-9]{1,5}$/);
        ext = ext ? ext[0] : birOutExt(srcType === 'image/jpeg' ? 'jpeg' : srcType === 'image/webp' ? 'webp' : 'png');
    } else {
        ext = birOutExt(outFmt);
    }
    return base + '_' + w + 'x' + h + ext;
}

/* 同名去重：zip 包内文件名冲突时追加 -2/-3… */
function birUniqueName(name, used) {
    if (used.indexOf(name) === -1) return name;
    var dot = name.lastIndexOf('.');
    var stem = dot > 0 ? name.slice(0, dot) : name;
    var ext = dot > 0 ? name.slice(dot) : '';
    var i = 2, cand = stem + '-' + i + ext;
    while (used.indexOf(cand) !== -1) { i++; cand = stem + '-' + i + ext; }
    return cand;
}

/* mime 与扩展名互推（输入校验） */
function birAcceptableType(t) {
    return t === 'image/png' || t === 'image/jpeg' || t === 'image/webp';
}

/* JPEG/WebP 质量滑块：1~100 → toBlob 0.01~1 */
function birQualityToAlpha(q) {
    var n = Number(q);
    if (!isFinite(n)) return 0.92;
    n = Math.round(n);
    if (n < 1) n = 1;
    if (n > 100) n = 100;
    return n / 100;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        birTargetSize: birTargetSize,
        birClampFactor: birClampFactor,
        birHasAlpha: birHasAlpha,
        birOutExt: birOutExt,
        birNeedWhiteBg: birNeedWhiteBg,
        birOutName: birOutName,
        birUniqueName: birUniqueName,
        birAcceptableType: birAcceptableType,
        birQualityToAlpha: birQualityToAlpha,
        birToPosNum: birToPosNum
    };
}
/*<BIR-CORE-END>*/

if (typeof window === 'undefined') return;

/* ---------------- CDN 懒加载（JSZip，cdnjs → npmmirror 备） ---------------- */
var BIR_JSZIP_CDNS = [
    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    'https://cdn.npmmirror.com/packages/jszip/3.10.1/jszip.min.js'
];
function birEnsureJSZip() {
    return new Promise(function (resolve, reject) {
        if (window.JSZip) { resolve(); return; }
        var idx = 0;
        function tryNext() {
            if (idx >= BIR_JSZIP_CDNS.length) { reject(new Error('all failed')); return; }
            var src = BIR_JSZIP_CDNS[idx++];
            var s = document.createElement('script');
            var done = false;
            var timer = setTimeout(function () {
                if (!done) { done = true; s.remove(); tryNext(); }
            }, 25000);
            s.onload = function () {
                if (done) return;
                done = true; clearTimeout(timer);
                if (window.JSZip) resolve();
                else { s.remove(); tryNext(); }
            };
            s.onerror = function () {
                if (done) return;
                done = true; clearTimeout(timer); s.remove(); tryNext();
            };
            s.src = src;
            document.head.appendChild(s);
        }
        tryNext();
    });
}

/* ---------------- 通用小工具 ---------------- */
function $(id) { return document.getElementById(id); }
function fmtSize(n) {
    if (n !== 0 && !n) return '-';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
}
function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function toast(msg) {
    var el = $('bir-toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2600);
}
function downloadUrl(url, name) {
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
function downloadBlob(blob, name) {
    downloadUrl(URL.createObjectURL(blob), name);
}
function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

/* ---------------- 状态 ---------------- */
var BIG_WARN = 40 * 1024 * 1024; /* 单张超 40MB 仅提示，不硬拦截 */
var S = {
    items: [],     /* [{id,file,name,type,size,thumbUrl,status,prog,ow,oh,tw,th,blob,dlUrl,fmt,err}] */
    seq: 0,
    busy: false,
    cancel: false
};

function setBusy(b) {
    S.busy = b;
    $('bir-start-btn').disabled = b;
    $('bir-cancel-btn').style.display = b ? '' : 'none';
    $('bir-zip-btn').disabled = b;
}

/* ---------------- 文件队列 ---------------- */
function addFiles(fileList) {
    var added = 0, skipped = 0;
    for (var i = 0; i < fileList.length; i++) {
        var f = fileList[i];
        if (!birAcceptableType(f.type)) { skipped++; continue; }
        S.items.push({
            id: ++S.seq, file: f, name: f.name, type: f.type, size: f.size,
            thumbUrl: URL.createObjectURL(f), status: 'wait', prog: 0,
            ow: 0, oh: 0, tw: 0, th: 0, blob: null, dlUrl: null, fmt: null, err: ''
        });
        added++;
        if (f.size > BIG_WARN) toast('提示：「' + f.name + '」超 40MB，处理会慢一些');
    }
    if (skipped > 0) toast('已跳过 ' + skipped + ' 个非 PNG/JPG/WebP 文件');
    renderList();
    refreshSummary();
}
function removeItem(id) {
    for (var i = 0; i < S.items.length; i++) {
        if (S.items[i].id === id) {
            var it = S.items[i];
            if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl);
            if (it.dlUrl) URL.revokeObjectURL(it.dlUrl);
            S.items.splice(i, 1);
            break;
        }
    }
    renderList();
    refreshSummary();
}
function clearAll() {
    S.items.forEach(function (it) {
        if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl);
        if (it.dlUrl) URL.revokeObjectURL(it.dlUrl);
    });
    S.items = [];
    S.cancel = true;
    setBusy(false);
    renderList();
    refreshSummary();
}

/* ---------------- 配置读取 ---------------- */
function readPreset() {
    var mode = 'width';
    var radios = document.getElementsByName('bir-mode');
    for (var i = 0; i < radios.length; i++) if (radios[i].checked) mode = radios[i].value;
    var value = parseFloat($('bir-value').value);
    return { mode: mode, value: value };
}
function readFormat() {
    var f = 'keep';
    var radios = document.getElementsByName('bir-format');
    for (var i = 0; i < radios.length; i++) if (radios[i].checked) f = radios[i].value;
    return f;
}
function readQuality() { return birQualityToAlpha($('bir-quality').value); }

/* ---------------- canvas 批量缩放引擎 ---------------- */
function loadImage(url) {
    return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error('decode')); };
        img.src = url;
    });
}

function resizeOne(it, preset, outFmt, quality) {
    return loadImage(it.thumbUrl).then(function (img) {
        it.ow = img.naturalWidth || img.width;
        it.oh = img.naturalHeight || img.height;
        var target = birTargetSize(it.ow, it.oh, preset.mode, preset.value);
        if (!target) throw new Error('badpreset');
        it.tw = target.w; it.th = target.h;

        var canvas = document.createElement('canvas');
        canvas.width = it.tw; canvas.height = it.th;
        var ctx = canvas.getContext('2d');
        /* 大图多步降采样：超过 2 倍时逐级 halving，减少锯齿/锯齿失真并控制内存 */
        var sw = it.ow, sh = it.oh, srcCanvas = null, src = img;
        if (Math.max(it.ow / it.tw, it.oh / it.th) > 2) {
            while (sw / 2 >= it.tw && sh / 2 >= it.th) {
                var half = document.createElement('canvas');
                half.width = Math.max(1, Math.round(sw / 2));
                half.height = Math.max(1, Math.round(sh / 2));
                var hctx = half.getContext('2d');
                hctx.drawImage(src, 0, 0, half.width, half.height);
                src = half; srcCanvas = half;
                sw = half.width; sh = half.height;
            }
            srcCanvas = src;
        }
        if (birNeedWhiteBg(it.type, outFmt)) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, it.tw, it.th);
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(src, 0, 0, sw, sh, 0, 0, it.tw, it.th);

        var mime = outFmt === 'keep'
            ? (it.type === 'image/jpeg' ? 'image/jpeg' : it.type === 'image/webp' ? 'image/webp' : 'image/png')
            : (outFmt === 'jpeg' ? 'image/jpeg' : 'image/webp');
        var blobP = (mime === 'image/jpeg' || mime === 'image/webp')
            ? new Promise(function (res, rej) {
                canvas.toBlob(function (b) { b ? res(b) : rej(new Error('encode')); }, mime, quality);
            })
            : new Promise(function (res, rej) {
                canvas.toBlob(function (b) { b ? res(b) : rej(new Error('encode')); }, mime);
            });
        return blobP.then(function (blob) {
            if (it.dlUrl) URL.revokeObjectURL(it.dlUrl);
            it.blob = blob;
            it.dlUrl = URL.createObjectURL(blob);
            it.fmt = outFmt; /* 处理时刻的输出格式：下载命名用它，不用点击时刻的 readFormat() */
            it.status = 'done';
            it.prog = 1;
        });
    });
}

function runBatch() {
    if (S.busy) return;
    if (!S.items.length) { toast('请先添加图片'); return; }
    var preset = readPreset();
    var test = birTargetSize(800, 600, preset.mode, preset.value);
    if (!test) { toast('缩放数值无效，请检查输入'); return; }
    var outFmt = readFormat();
    var quality = readQuality();
    S.cancel = false;
    setBusy(true);
    var done = 0;
    (function next(i) {
        if (i >= S.items.length) { setBusy(false); refreshSummary(); return; }
        if (S.cancel) { setBusy(false); refreshSummary(); toast('已取消'); return; }
        var it = S.items[i];
        it.status = 'run'; it.prog = 0.2;
        renderList(); refreshSummary(done, S.items.length);
        resizeOne(it, preset, outFmt, quality).then(function () {
            done++;
            it.prog = 1;
            renderList(); refreshSummary(done, S.items.length);
            return tick();
        }).then(function () { next(i + 1); })
        .catch(function (e) {
            it.status = 'error';
            it.err = e && e.message === 'decode' ? '图片解码失败' :
                     e && e.message === 'encode' ? '导出编码失败' : '参数无效';
            done++;
            renderList(); refreshSummary(done, S.items.length);
            next(i + 1);
        });
    })(0);
}

/* ---------------- 下载 ---------------- */
function downloadOne(id) {
    for (var i = 0; i < S.items.length; i++) {
        var it = S.items[i];
        if (it.id === id && it.blob) {
            /* 每次下载都重建 URL：downloadUrl() 会在 800ms 后回收旧 URL，旧 URL 不可复用 */
            if (it.dlUrl) URL.revokeObjectURL(it.dlUrl);
            it.dlUrl = URL.createObjectURL(it.blob);
            var name = birOutName(it.name, it.tw, it.th, it.type, it.fmt || 'keep');
            downloadUrl(it.dlUrl, name);
            return;
        }
    }
}
function downloadZip() {
    var doneItems = S.items.filter(function (it) { return it.status === 'done' && it.blob; });
    if (!doneItems.length) { toast('还没有可打包的缩放结果'); return; }
    var used = [];
    birEnsureJSZip().then(function () {
        var zip = new JSZip();
        doneItems.forEach(function (it) {
            var name = birUniqueName(birOutName(it.name, it.tw, it.th, it.type, it.fmt || 'keep'), used);
            used.push(name);
            zip.file(name, it.blob);
        });
        return zip.generateAsync({ type: 'blob' }, function (meta) {
            $('bir-zip-prog').textContent = '打包中 ' + Math.round(meta.percent) + '%';
        });
    }).then(function (blob) {
        $('bir-zip-prog').textContent = '';
        downloadBlob(blob, 'resized-images.zip');
        toast('已打包下载 resized-images.zip');
    }).catch(function () {
        $('bir-zip-prog').textContent = '';
        /* 降级：JSZip 加载失败 → 逐个下载 */
        toast('打包组件加载失败（网络不可达），改为逐个下载');
        doneItems.forEach(function (it) { downloadOne(it.id); });
    });
}

/* ---------------- 渲染 ---------------- */
function statusText(it) {
    if (it.status === 'wait') return '待处理';
    if (it.status === 'run') return '缩放中 ' + Math.round(it.prog * 100) + '%';
    if (it.status === 'done') return it.ow + '×' + it.oh + ' → ' + it.tw + '×' + it.th;
    if (it.status === 'error') return '失败：' + it.err;
    return '';
}
function renderList() {
    var box = $('bir-list');
    if (!S.items.length) {
        box.innerHTML = '<div class="bir-empty">还没有图片 — 把图片拖到上方，或点「选择图片」</div>';
        return;
    }
    var html = '';
    S.items.forEach(function (it) {
        var cls = it.status === 'done' ? ' bir-done' : it.status === 'error' ? ' bir-error' : '';
        html += '<div class="bir-row' + cls + '">' +
            '<img class="bir-thumb" src="' + it.thumbUrl + '" alt="' + escHtml(it.name) + '" loading="lazy">' +
            '<div class="bir-row-main">' +
            '<div class="bir-row-head">' +
            '<div class="bir-name"><span>' + escHtml(it.name) + '</span></div>' +
            '<span class="bir-size">' + fmtSize(it.size) + '</span>' +
            '<button type="button" class="bir-icon-btn" data-del="' + it.id + '" title="移除"' +
            (S.busy ? ' disabled' : '') + '><i class="material-icons">close</i></button>' +
            '</div>' +
            '<div class="bir-progress"><div class="bir-progress-fill" style="width:' +
            Math.round(it.prog * 100) + '%"></div></div>' +
            '<div class="bir-meta"><span>' + escHtml(statusText(it)) + '</span>' +
            (it.status === 'done'
                ? '<button type="button" class="bir-mini" data-dl="' + it.id + '">' +
                  '<i class="material-icons">download</i>下载</button>'
                : '<span></span>') +
            '</div></div></div>';
    });
    box.innerHTML = html;
    var dels = box.querySelectorAll('[data-del]');
    for (var i = 0; i < dels.length; i++) {
        (function (btn) {
            btn.addEventListener('click', function () { removeItem(parseInt(btn.getAttribute('data-del'), 10)); });
        })(dels[i]);
    }
    var dls = box.querySelectorAll('[data-dl]');
    for (var j = 0; j < dls.length; j++) {
        (function (btn) {
            btn.addEventListener('click', function () { downloadOne(parseInt(btn.getAttribute('data-dl'), 10)); });
        })(dls[j]);
    }
}
function refreshSummary(done, total) {
    var n = S.items.length;
    var doneN = S.items.filter(function (it) { return it.status === 'done'; }).length;
    var el = $('bir-summary');
    if (done !== undefined && total !== undefined) {
        el.textContent = '已完成 ' + done + ' / ' + total + '（成功 ' + doneN + '）';
    } else {
        el.textContent = n ? '队列 ' + n + ' 张 · 成功 ' + doneN + ' 张' : '';
    }
    var zip = $('bir-zip-btn');
    zip.disabled = S.busy || doneN === 0;
}

/* ---------------- 事件 ---------------- */
function bindEvents() {
    var dz = $('bir-dropzone'), fi = $('bir-file-input');
    dz.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        fi.click();
    });
    $('bir-pick-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        fi.click();
    });
    fi.addEventListener('change', function () {
        addFiles(fi.files);
        fi.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('bir-drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('bir-drag'); });
    });
    dz.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
    });
    $('bir-start-btn').addEventListener('click', runBatch);
    $('bir-cancel-btn').addEventListener('click', function () { S.cancel = true; });
    $('bir-clear-btn').addEventListener('click', clearAll);
    $('bir-zip-btn').addEventListener('click', downloadZip);

    /* JPEG 质量滑块数值显示 */
    var q = $('bir-quality');
    var qv = $('bir-quality-val');
    q.addEventListener('input', function () { qv.textContent = q.value; });
    qv.textContent = q.value;

    /* 预设数值框后缀提示 */
    var radios = document.getElementsByName('bir-mode');
    function syncHint() {
        var m = 'width';
        for (var i = 0; i < radios.length; i++) if (radios[i].checked) m = radios[i].value;
        $('bir-unit').textContent = m === 'percent' ? '%' : 'px';
        $('bir-value').placeholder = m === 'percent' ? '例如 50（即缩小到 50%）' :
            m === 'max' ? '例如 1200（最长边不超过）' :
            m === 'height' ? '例如 800（目标高度）' : '例如 1200（目标宽度）';
    }
    for (var i = 0; i < radios.length; i++) radios[i].addEventListener('change', syncHint);
    syncHint();
}

document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    renderList();
    refreshSummary();
});

})();
