/* 图片精确体积压缩器 - 纯前端：二分质量迭代 + 尺寸降级兜底，零后端、零 CDN */
(function () {
    'use strict';

    var KB = 1024;
    var Q_MIN = 0.05, Q_MAX = 0.95;      // 质量二分区间
    var Q_ITER = 10;                      // 质量二分迭代轮数（上限，硬终止）
    var FEAS_ROUNDS = 10;                 // 可行性降级（最低质量仍超标）最大轮数，硬终止
    var REFINE_ROUNDS = 8;                // 精度细化（偏差>5%时微缩尺寸重二分）最大轮数，硬终止
    var REFINE_SCALE = 0.93;              // 细化轮线性缩放
    var MIN_DIM = 24;                     // 最小边长（px）
    var DEV_TOL = 0.05;                   // 偏差容忍 ±5%

    var $ = function (id) { return document.getElementById(id); };
    var dropEl, fileEl, targetEl, formatEl, runBtn, clearBtn, statusEl, tipEl,
        resultEl, emptyEl, resultImg, statsEl, downloadEl, origEl, origImg, origInfoEl,
        progressEl, progressBar;

    var state = {
        bitmap: null,      // ImageBitmap
        fileName: '',
        fileSize: 0,
        fileType: '',
        width: 0,
        height: 0,
        resultURL: null
    };

    function fmtBytes(bytes) {
        if (bytes < KB) return bytes + ' B';
        if (bytes < KB * KB) return (bytes / KB).toFixed(2) + ' KB';
        return (bytes / (KB * KB)).toFixed(2) + ' MB';
    }

    function setStatus(text) { statusEl.textContent = text || ''; }
    function setProgress(p) {
        if (p == null) { progressEl.style.display = 'none'; return; }
        progressEl.style.display = 'block';
        progressBar.style.width = Math.max(0, Math.min(100, p)) + '%';
    }
    function showTip(kind, html) {
        tipEl.className = 'ikb-tip ' + (kind === 'err' ? 'ikb-show-err' : 'ikb-show-info');
        tipEl.innerHTML = html;
    }
    function hideTip() { tipEl.className = 'ikb-tip'; tipEl.innerHTML = ''; }

    function loadBitmap(file) {
        if (window.createImageBitmap) {
            return window.createImageBitmap(file).catch(function () { return loadViaImage(file); });
        }
        return loadViaImage(file);
    }
    function loadViaImage(file) {
        return new Promise(function (resolve, reject) {
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function () {
                URL.revokeObjectURL(url);
                if (window.createImageBitmap) {
                    window.createImageBitmap(img).then(resolve, reject);
                } else {
                    resolve(img);
                }
            };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
            img.src = url;
        });
    }

    function drawToCanvas(src, w, h) {
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w));
        canvas.height = Math.max(1, Math.round(h));
        var ctx = canvas.getContext('2d');
        ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
        return canvas;
    }

    // JPEG 输出：先铺白底再画图（处理透明 PNG 转 JPEG）
    function drawToCanvasOpaque(src, w, h) {
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w));
        canvas.height = Math.max(1, Math.round(h));
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
        return canvas;
    }

    function encodeBlob(canvas, mime, quality) {
        return new Promise(function (resolve, reject) {
            if (canvas.toBlob) {
                canvas.toBlob(function (blob) {
                    if (blob) resolve(blob);
                    else reject(new Error('encode'));
                }, mime, quality);
            } else {
                reject(new Error('no-toBlob'));
            }
        });
    }

    function resolveMime(autoType, chosen) {
        if (chosen && chosen !== 'auto') return chosen;
        if (autoType === 'image/webp') return 'image/webp';
        if (autoType === 'image/png') return 'image/jpeg'; // PNG 无质量可调，自动模式转 JPEG 才能命中目标
        return 'image/jpeg';
    }
    function mimeExt(mime) {
        return mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : 'jpg');
    }

    /**
     * 质量二分：找「体积 ≤ 目标」的最高质量；命中目标 ±0.5% 即提前收敛。
     * 返回 { blob, quality }；最低质量仍超标返回 null。
     */
    async function bisectQuality(canvas, mime, targetBytes) {
        var lo = Q_MIN, hi = Q_MAX, best = null;
        for (var i = 0; i < Q_ITER; i++) {
            var q = (lo + hi) / 2;
            var b = await encodeBlob(canvas, mime, q);
            if (b.size <= targetBytes) {
                best = { blob: b, quality: q };
                if ((targetBytes - b.size) / targetBytes <= 0.005) break; // 足够接近，提前收敛
                lo = q;
            } else {
                hi = q;
            }
        }
        return best;
    }

    // 按比例缩小尺寸并保持宽高比；已是最小尺寸则返回 null（调用方据此判定抵达下限）
    function shrinkDims(w, h, scale) {
        var nw = Math.floor(w * scale), nh = Math.floor(h * scale);
        if (nw < 1 || nh < 1) return null;
        if (nw === w && nh === h) return null;
        var k = Math.min(nw, nh) / MIN_DIM;
        if (k < 1) {
            nw = Math.round(nw / k); nh = Math.round(nh / k);
            if (nw === w && nh === h) return null;
        }
        return { w: nw, h: nh };
    }

    /**
     * 核心算法：二分质量迭代；最低质量仍超标则按比例降级尺寸重编；
     * 命中但偏差 >5% 则微缩尺寸重二分（质量步进更细，可落进 ±5% 带）。
     * 返回 { blob, width, height, quality, mime }；达不到目标则抛出带 code 的错误。
     */
    async function compressToTarget(src, srcW, srcH, targetBytes, mime) {
        var w = srcW, h = srcH;
        var lossless = (mime === 'image/png');
        var feas = 0, refined = 0, progress = 0;

        for (;;) {
            setProgress(Math.min(95, progress += 4));
            var canvas = (mime === 'image/jpeg') ? drawToCanvasOpaque(src, w, h) : drawToCanvas(src, w, h);

            if (lossless) {
                var blob = await encodeBlob(canvas, mime, undefined);
                if (blob.size <= targetBytes) {
                    return { blob: blob, width: canvas.width, height: canvas.height, quality: null, mime: mime };
                }
                // PNG 无损只能降尺寸：按面积比例估算下一轮
                if (feas++ >= FEAS_ROUNDS) throw { code: 'tooSmall', size: blob.size };
                var scale = Math.sqrt(targetBytes / blob.size) * 0.97;
                if (scale >= 1) scale = 0.9;
                var nd = shrinkDims(w, h, scale);
                if (!nd) throw { code: 'tooSmall', size: blob.size };
                w = nd.w; h = nd.h;
                continue;
            }

            var best = await bisectQuality(canvas, mime, targetBytes);
            if (!best) {
                // 最低质量仍超标 → 按比例降级尺寸（可行性轮）
                if (feas++ >= FEAS_ROUNDS) throw { code: 'tooSmall', size: -1 };
                var floorBlob = await encodeBlob(canvas, mime, Q_MIN);
                var s = Math.sqrt(targetBytes / floorBlob.size) * 0.97;
                if (s >= 1) s = 0.9;
                var nd2 = shrinkDims(w, h, s);
                if (!nd2) throw { code: 'tooSmall', size: floorBlob.size };
                w = nd2.w; h = nd2.h;
                continue;
            }

            var under = (targetBytes - best.blob.size) / targetBytes;
            if (under <= DEV_TOL) {
                // 已在 ±5% 带内：往上再探几步，让体积更接近目标（仍 ≤ 目标）
                var q2 = Math.min(Q_MAX, best.quality + 0.04);
                for (var t = 0; t < 6; t++) {
                    if (q2 > Q_MAX) break;
                    var b2 = await encodeBlob(canvas, mime, q2);
                    if (b2.size <= targetBytes && b2.size > best.blob.size) {
                        best = { blob: b2, quality: q2 };
                        q2 = Math.min(Q_MAX, q2 + 0.03);
                    } else break;
                }
                return { blob: best.blob, width: canvas.width, height: canvas.height, quality: best.quality, mime: mime };
            }

            // 偏差 >5%（体积偏小太多）：微缩尺寸重二分，质量步进更细
            if (refined++ >= REFINE_ROUNDS) {
                return { blob: best.blob, width: canvas.width, height: canvas.height, quality: best.quality, mime: mime };
            }
            var nd3 = shrinkDims(w, h, REFINE_SCALE);
            if (!nd3) {
                return { blob: best.blob, width: canvas.width, height: canvas.height, quality: best.quality, mime: mime };
            }
            w = nd3.w; h = nd3.h;
        }
    }

    function resetResult() {
        resultEl.style.display = 'none';
        emptyEl.style.display = '';
        statsEl.innerHTML = '';
        if (state.resultURL) { URL.revokeObjectURL(state.resultURL); state.resultURL = null; }
        downloadEl.removeAttribute('href');
    }

    function handleFile(file) {
        if (!file) return;
        var okTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (okTypes.indexOf(file.type) === -1) {
            showTip('err', '暂不支持该格式，请上传 JPG / PNG / WebP 图片。');
            return;
        }
        hideTip(); resetResult();
        setStatus('正在读取图片…');
        loadBitmap(file).then(function (bm) {
            state.bitmap = bm;
            state.fileName = file.name || 'image';
            state.fileSize = file.size;
            state.fileType = file.type;
            state.width = bm.width; state.height = bm.height;
            var url = URL.createObjectURL(file);
            origImg.src = url;
            origEl.style.display = 'flex';
            origInfoEl.innerHTML = '文件名：' + escapeHtml(state.fileName) + '<br>' +
                '尺寸：' + state.width + ' × ' + state.height + ' px<br>' +
                '体积：<b>' + fmtBytes(state.fileSize) + '</b>';
            setStatus('图片已就绪，设置目标体积后点击开始。');
        }).catch(function () {
            setStatus('');
            showTip('err', '图片读取失败，文件可能已损坏，请换一张图片重试。');
        });
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    async function run() {
        hideTip(); resetResult();
        if (!state.bitmap) { showTip('err', '请先上传一张图片。'); return; }
        var targetKB = parseFloat(targetEl.value);
        if (!isFinite(targetKB) || targetKB <= 0) {
            showTip('err', '请输入有效的目标体积（大于 0 的数字，单位 KB）。');
            return;
        }
        var targetBytes = Math.round(targetKB * KB);

        // 目标大于原图体积：不放大，直接提示
        if (targetBytes >= state.fileSize) {
            showTip('info', '目标体积（' + fmtBytes(targetBytes) + '）≥ 原图体积（' + fmtBytes(state.fileSize) + '），' +
                '无需压缩也不会把图片放大导出。如需更小体积，请把目标设得比 ' +
                Math.floor(state.fileSize / KB) + ' KB 更小。');
            setStatus('');
            return;
        }

        var mime = resolveMime(state.fileType, formatEl.value);
        runBtn.disabled = true;
        setStatus('正在压缩到 ' + fmtBytes(targetBytes) + '（' + mimeExt(mime).toUpperCase() + '）…');
        setProgress(5);
        try {
            var out = await compressToTarget(state.bitmap, state.width, state.height, targetBytes, mime);
            var actual = out.blob.size;
            var dev = (actual - targetBytes) / targetBytes; // 负数表示小于目标
            var url = URL.createObjectURL(out.blob);
            state.resultURL = url;
            resultImg.src = url;
            resultEl.style.display = 'block';
            emptyEl.style.display = 'none';

            var devText = (Math.abs(dev) * 100).toFixed(1) + '%';
            var hit = actual <= targetBytes && Math.abs(dev) <= DEV_TOL;
            var badge = hit
                ? '<span class="ikb-ok">✅ 已命中目标</span>'
                : '<span class="ikb-warn">⚠️ 体积小于目标较多（偏差 ' + devText + '），可尝试换 JPEG/WebP 格式重试</span>';
            statsEl.innerHTML =
                '<div>目标体积：<b>' + fmtBytes(targetBytes) + '</b></div>' +
                '<div>实际体积：<b>' + fmtBytes(actual) + '</b>（偏差 ' + devText + '） ' + badge + '</div>' +
                '<div>导出尺寸：' + out.width + ' × ' + out.height + ' px' +
                (out.quality != null ? '　质量：' + Math.round(out.quality * 100) : '　无损 PNG') + '</div>' +
                '<div>导出格式：' + mimeExt(out.mime).toUpperCase() + '</div>';
            var base = state.fileName.replace(/\.[^.]+$/, '') || 'image';
            var fname = base + '-' + Math.round(targetKB) + 'kb.' + mimeExt(out.mime);
            downloadEl.setAttribute('href', url);
            downloadEl.setAttribute('download', fname);
            setStatus('压缩完成。');
        } catch (e) {
            if (e && e.code === 'tooSmall') {
                var floorTxt = (e.size > 0) ? '（当前可达下限约 ' + fmtBytes(e.size) + '）' : '';
                showTip('err', '目标体积过小' + floorTxt + '：即使降到最低质量、最小尺寸也无法达到 ' +
                    fmtBytes(targetBytes) + '。建议把目标调大一些后重试。');
            } else {
                showTip('err', '压缩失败：浏览器不支持所需的图片编码，请换用 Chrome / Edge 最新版重试。');
            }
            setStatus('');
        } finally {
            setProgress(null);
            runBtn.disabled = false;
        }
    }

    function clearAll() {
        fileEl.value = '';
        state.bitmap = null; state.fileName = ''; state.fileSize = 0;
        origEl.style.display = 'none'; origImg.removeAttribute('src');
        hideTip(); resetResult(); setStatus(''); setProgress(null);
        var quickBtns = document.querySelectorAll('#ikb-quick button');
        for (var i = 0; i < quickBtns.length; i++) quickBtns[i].classList.remove('ikb-active');
    }

    function init() {
        dropEl = $('ikb-drop'); fileEl = $('ikb-file'); targetEl = $('ikb-target');
        formatEl = $('ikb-format'); runBtn = $('ikb-run'); clearBtn = $('ikb-clear');
        statusEl = $('ikb-status'); tipEl = $('ikb-tip');
        resultEl = $('ikb-result'); emptyEl = $('ikb-empty');
        resultImg = $('ikb-result-img'); statsEl = $('ikb-stats'); downloadEl = $('ikb-download');
        origEl = $('ikb-orig'); origImg = $('ikb-orig-img'); origInfoEl = $('ikb-orig-info');
        progressEl = $('ikb-progress'); progressBar = $('ikb-progress-bar');

        dropEl.addEventListener('click', function () { fileEl.click(); });
        fileEl.addEventListener('change', function () { handleFile(fileEl.files[0]); });
        ['dragenter', 'dragover'].forEach(function (ev) {
            dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.add('ikb-dragover'); });
        });
        ['dragleave', 'drop'].forEach(function (ev) {
            dropEl.addEventListener(ev, function (e) { e.preventDefault(); dropEl.classList.remove('ikb-dragover'); });
        });
        dropEl.addEventListener('drop', function (e) {
            var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) handleFile(f);
        });

        var quickBtns = document.querySelectorAll('#ikb-quick button');
        for (var i = 0; i < quickBtns.length; i++) {
            (function (btn) {
                btn.addEventListener('click', function () {
                    for (var j = 0; j < quickBtns.length; j++) quickBtns[j].classList.remove('ikb-active');
                    btn.classList.add('ikb-active');
                    targetEl.value = btn.getAttribute('data-kb');
                });
            })(quickBtns[i]);
        }
        targetEl.addEventListener('input', function () {
            for (var j = 0; j < quickBtns.length; j++) {
                quickBtns[j].classList.toggle('ikb-active', quickBtns[j].getAttribute('data-kb') === targetEl.value);
            }
        });

        runBtn.addEventListener('click', run);
        clearBtn.addEventListener('click', clearAll);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
