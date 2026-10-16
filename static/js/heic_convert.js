/* HEIC 转 JPG - 纯前端本地处理（libheif-js 1.23.2 wasm）
 * 多文件上传 .heic/.heif（点击/拖拽）→ FileReader/ArrayBuffer 本地读取 → libheif-js
 *（jsdelivr CDN 懒加载，失败自动切换 static/js/vendor 本地兜底）逐文件解码 →
 * canvas → toBlob 输出 JPG（质量滑杆 1-100，默认 92）/ PNG（无损）→ 单文件直接下载，
 * 多文件经 JSZip（CDN 懒加载）打包 ZIP，JSZip 失败时降级逐个下载。全程不上传服务器。
 * 旋转/镜像/alpha 由 libheif 解析层自动应用（display 产出即最终朝向，含 alpha 通道）。
 */
(function () {
'use strict';
var LIBHEIF_CDN = 'https://cdn.jsdelivr.net/npm/libheif-js@1.23.2/libheif-wasm/libheif.js';
var ZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
var STATUS_TEXT = { pending: '待转换', converting: '转换中…', done: '完成', fail: '失败' };

var items = []; // {id,name,size,buf,status,thumbUrl,outBlob,outName,w,h,ms,err}
var seq = 0;
var libheifPromise = null; // 缓存 wasm 模块实例

function $(id) { return document.getElementById(id); }
function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
}
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}
function timestamp() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}
function setStatus(m) { $('hc-status').textContent = m || ''; }
function setError(m) {
    var el = $('hc-error');
    el.textContent = m || '';
    el.style.display = m ? 'block' : 'none';
}
function setLibError(m) {
    var el = $('hc-lib-error');
    el.textContent = m || '';
    el.style.display = m ? 'block' : 'none';
}
function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
function vendorLibheifUrl() {
    // 与页面同前缀（/tools 或 /tool-web 挂载），避免硬编码被改写
    return location.pathname.replace(/\/[^/]*$/, '') + '/static/js/vendor/libheif.js';
}

/* ============ 脚本懒加载（CDN → 本地 vendor 兜底） ============ */
function ensureScript(src, globalName) {
    return new Promise(function (resolve, reject) {
        if (globalName && window[globalName]) { resolve(); return; }
        var s = document.createElement('script');
        var done = false;
        var timer = setTimeout(function () {
            if (!done) { done = true; s.remove(); reject(new Error('timeout')); }
        }, 25000);
        s.onload = function () {
            if (done) return;
            done = true; clearTimeout(timer);
            (globalName && window[globalName]) ? resolve() : reject(new Error('bad lib'));
        };
        s.onerror = function () {
            if (done) return;
            done = true; clearTimeout(timer); s.remove();
            reject(new Error('load failed'));
        };
        s.src = src;
        document.head.appendChild(s);
    });
}
// libheif-js：先 jsdelivr CDN，失败切本地 vendor；脚本是 wasm 工厂函数，需调用一次得到模块实例
function ensureLibheif() {
    if (libheifPromise) return libheifPromise;
    libheifPromise = ensureScript(LIBHEIF_CDN, 'libheif')
        .catch(function () {
            try { window.libheif = undefined; } catch (e) {}
            return ensureScript(vendorLibheifUrl(), 'libheif');
        })
        .then(function () {
            var factory = window.libheif;
            if (typeof factory !== 'function') throw new Error('bad libheif factory');
            return factory(); // emscripten modularize 工厂 → Promise<module>
        })
        .then(function (mod) {
            if (!mod || typeof mod.HeifDecoder !== 'function') throw new Error('bad libheif module');
            return mod;
        })
        .catch(function (e) {
            libheifPromise = null; // 允许下次重试
            throw e;
        });
    return libheifPromise;
}
function ensureJSZip() { return ensureScript(ZIP_CDN, 'JSZip'); }

/* ============ 上传（点击 / 拖拽） ============ */
function isHeic(file) {
    var t = (file.type || '').toLowerCase();
    var n = (file.name || '').toLowerCase();
    return t === 'image/heic' || t === 'image/heif' ||
        /\.hei[cf]$/.test(n);
}
function addFiles(files) {
    setError('');
    var added = 0, skipped = [];
    for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (!f) continue;
        if (!isHeic(f)) { skipped.push(f.name || '未命名文件'); continue; }
        (function (file) {
            file.arrayBuffer().then(function (buf) {
                if (!buf || !buf.byteLength) throw new Error('empty');
                items.push({
                    id: ++seq, name: file.name || ('IMG_' + seq + '.heic'),
                    size: file.size, buf: buf, status: 'pending',
                    thumbUrl: '', outBlob: null, outName: '', w: 0, h: 0, ms: 0, err: ''
                });
                added++;
                setStatus('已加入 ' + items.length + ' 个文件');
                renderList();
            }).catch(function () {
                setError('文件「' + (file.name || '未命名') + '」读取失败，已跳过');
            });
        })(f);
    }
    if (skipped.length > 0) {
        setError('以下文件不是 HEIC/HEIF，已跳过：' + skipped.map(esc).join('、') +
            '。普通图片（PNG/JPG/WebP）请直接用「图片批量转 PDF」。');
    }
}
function bindUpload() {
    var zone = $('hc-upload'), input = $('hc-file');
    zone.addEventListener('click', function () { input.click(); });
    zone.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', function () {
        addFiles(input.files);
        input.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
        zone.addEventListener(ev, function (e) {
            e.preventDefault();
            zone.classList.add('dragover');
        });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
        zone.addEventListener(ev, function (e) {
            e.preventDefault();
            zone.classList.remove('dragover');
        });
    });
    zone.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });
}

/* ============ 列表渲染 ============ */
function findIdx(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return i;
    return -1;
}
function removeItem(id) {
    var i = findIdx(id);
    if (i < 0) return;
    if (items[i].thumbUrl) URL.revokeObjectURL(items[i].thumbUrl);
    items.splice(i, 1);
    setStatus(items.length ? '已加入 ' + items.length + ' 个文件' : '');
    renderList();
}
function clearAll() {
    items.forEach(function (it) { if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl); });
    items = [];
    setStatus('');
    setError('');
    setLibError('');
    $('hc-stats').style.display = 'none';
    $('hc-progress').style.display = 'none';
    renderList();
}
function outFileName(name, fmt) {
    var base = String(name || 'image').replace(/\.(hei[cf])$/i, '');
    base = base.replace(/[\\/:*?"<>|]/g, '_') || 'image';
    return base + (fmt === 'png' ? '.png' : '.jpg');
}
function fmtOf() {
    var r = document.querySelector('input[name="hc-format"]:checked');
    return r ? r.value : 'jpg';
}
function qualityOf() {
    var v = parseInt($('hc-quality').value, 10);
    if (isNaN(v)) v = 92;
    return Math.min(100, Math.max(1, v)) / 100;
}
function renderList() {
    var grid = $('hc-grid');
    grid.innerHTML = '';
    items.forEach(function (it, idx) {
        var card = document.createElement('div');
        card.className = 'hc-card hc-' + it.status;
        card.dataset.id = it.id;
        var thumb;
        if (it.thumbUrl) {
            thumb = '<img src="' + it.thumbUrl + '" alt="转换结果 ' + (idx + 1) + '">';
        } else {
            thumb = '<span class="material-icons hc-thumb-icon">photo</span>';
        }
        var sub = fmtSize(it.size);
        if (it.status === 'done' && it.w) sub += ' · ' + it.w + '×' + it.h + ' · ' + fmtSize(it.outBlob.size);
        var ops = '';
        if (it.status === 'done') {
            ops = '<button type="button" data-op="dl" title="下载此文件"><span class="material-icons">download</span></button>';
        }
        ops += '<button type="button" data-op="del" class="del" title="删除"><span class="material-icons">close</span></button>';
        card.innerHTML =
            '<div class="hc-badge">' + STATUS_TEXT[it.status] + '</div>' +
            '<div class="hc-thumb">' + thumb + '</div>' +
            '<div class="hc-meta">' +
            '<div class="hc-nm" title="' + esc(it.name) + '">' + esc(it.name) + '</div>' +
            '<div class="hc-sub">' + sub + '</div>' +
            (it.status === 'fail' && it.err ? '<div class="hc-failmsg">' + esc(it.err) + '</div>' : '') +
            '<div class="hc-ops">' + ops + '</div></div>';
        grid.appendChild(card);
    });
    grid.querySelectorAll('button[data-op]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var id = parseInt(btn.closest('.hc-card').dataset.id, 10);
            var i = findIdx(id);
            if (i < 0) return;
            if (btn.dataset.op === 'del') removeItem(id);
            else if (btn.dataset.op === 'dl' && items[i].outBlob) downloadBlob(items[i].outBlob, items[i].outName);
        });
    });
    var has = items.length > 0;
    var hasPending = items.some(function (it) { return it.status === 'pending'; });
    var hasDone = items.some(function (it) { return it.status === 'done'; });
    $('hc-convert').disabled = !hasPending;
    $('hc-download').disabled = !hasDone;
    $('hc-clear-all').disabled = !has;
    var cnt = $('hc-count');
    if (has) {
        cnt.style.display = 'block';
        cnt.textContent = '共 ' + items.length + ' 个文件，总计 ' + fmtSize(items.reduce(function (a, it) { return a + (it.size || 0); }, 0));
    } else {
        cnt.style.display = 'none';
    }
}

/* ============ 转换 ============ */
function setProgress(n, m, note) {
    var wrap = $('hc-progress');
    wrap.style.display = 'block';
    $('hc-progress-bar').style.width = (m ? (n / m * 100) : 0) + '%';
    $('hc-progress-txt').textContent = note || ('正在转换… ' + n + '/' + m);
}
function convertOne(mod, it, fmt, q) {
    var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    return Promise.resolve().then(function () {
        var decoder = new mod.HeifDecoder();
        var data = decoder.decode(it.buf.slice(0)); // slice 避免 wasm 侧持有原 buffer
        return Promise.resolve(data);
    }).then(function (data) {
        if (!data || !data.length) throw new Error('文件中未找到可解码的图片');
        var image = data[0];
        var w = image.get_width(), h = image.get_height();
        if (!w || !h) throw new Error('图片尺寸无效');
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        var ctx = cv.getContext('2d');
        if (fmt === 'jpg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); } // alpha 铺白底
        var imageData = ctx.createImageData(w, h);
        return new Promise(function (resolve, reject) {
            // display 自动应用 HEIF 内的旋转/镜像；产出即最终朝向，含 alpha 通道
            image.display(imageData, function (displayData) {
                if (!displayData) { reject(new Error('HEIF 解码失败')); return; }
                resolve(displayData);
            });
        }).then(function (displayData) {
            ctx.putImageData(displayData, 0, 0);
            return new Promise(function (resolve, reject) {
                var mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
                cv.toBlob(function (b) {
                    b ? resolve(b) : reject(new Error('图片编码失败'));
                }, mime, fmt === 'png' ? undefined : q);
            });
        }).then(function (blob) {
            it.w = w; it.h = h;
            it.outBlob = blob;
            it.outName = outFileName(it.name, fmt);
            it.thumbUrl = URL.createObjectURL(blob);
            it.status = 'done';
            it.err = '';
            var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            it.ms = t1 - t0;
        });
    }).catch(function (e) {
        it.status = 'fail';
        it.err = (e && e.message) || '转换失败';
    });
}
function onConvert() {
    var pendings = items.filter(function (it) { return it.status === 'pending'; });
    if (!pendings.length) return;
    setError('');
    setLibError('');
    var btn = $('hc-convert');
    btn.disabled = true;
    var fmt = fmtOf(), q = qualityOf();
    var t0 = Date.now();
    var done = 0;
    setProgress(0, pendings.length, '正在加载解码组件…');
    ensureLibheif().then(function (mod) {
        var chain = Promise.resolve();
        pendings.forEach(function (it) {
            chain = chain.then(function () {
                it.status = 'converting';
                renderList();
                return convertOne(mod, it, fmt, q).then(function () {
                    done++;
                    setProgress(done, pendings.length);
                    renderList();
                });
            });
        });
        return chain;
    }).then(function () {
        var ok = 0, fail = 0, ms = 0;
        items.forEach(function (it) {
            if (it.status === 'done') { ok++; ms += it.ms; }
            else if (it.status === 'fail') fail++;
        });
        var secs = ((Date.now() - t0) / 1000).toFixed(1);
        var st = $('hc-stats');
        st.style.display = 'block';
        st.textContent = '转换完成：成功 ' + ok + ' 个，失败 ' + fail + ' 个，总耗时 ' + secs + ' 秒' +
            (fmt === 'jpg' ? '（JPG 质量 ' + Math.round(q * 100) + '）' : '（PNG 无损）');
        setProgress(pendings.length, pendings.length, '完成');
        renderList();
    }).catch(function (e) {
        setLibError('解码组件加载失败（CDN 与本地兜底均不可用）：' + ((e && e.message) || '未知错误') +
            '。请检查网络连接后重试，文件列表不受影响。');
        pendings.forEach(function (it) { if (it.status === 'converting') it.status = 'pending'; });
        $('hc-progress').style.display = 'none';
        renderList();
    }).then(function () {
        btn.disabled = items.every(function (it) { return it.status !== 'pending'; });
    });
}

/* ============ 下载 ============ */
function onDownload() {
    var dones = items.filter(function (it) { return it.status === 'done' && it.outBlob; });
    if (!dones.length) return;
    setError('');
    if (dones.length === 1) {
        downloadBlob(dones[0].outBlob, dones[0].outName);
        setStatus('已下载 ' + dones[0].outName);
        return;
    }
    var btn = $('hc-download');
    btn.disabled = true;
    setProgress(0, 1, '正在打包 ZIP…');
    ensureJSZip().then(function () {
        var zip = new window.JSZip();
        var used = {};
        dones.forEach(function (it) {
            var name = it.outName, k = 1;
            while (used[name]) { name = it.outName.replace(/(\.[^.]+)$/, '_' + (k++) + '$1'); }
            used[name] = true;
            zip.file(name, it.outBlob);
        });
        return zip.generateAsync({ type: 'blob' }, function (meta) {
            setProgress(0, 1, '正在打包 ZIP… ' + Math.round(meta.percent) + '%');
        });
    }).then(function (blob) {
        var name = 'heic_convert_' + timestamp() + '.zip';
        downloadBlob(blob, name);
        setStatus('已打包下载 ' + name + '（' + dones.length + ' 个文件）');
        $('hc-progress').style.display = 'none';
    }).catch(function () {
        /* 降级：逐个下载 */
        $('hc-progress').style.display = 'none';
        setError('ZIP 打包失败（JSZip CDN 加载异常），已自动降级为逐个下载，请在浏览器中允许下载多个文件。');
        var i = 0;
        (function next() {
            if (i >= dones.length) return;
            var it = dones[i++];
            downloadBlob(it.outBlob, it.outName);
            setTimeout(next, 600);
        })();
    }).then(function () {
        btn.disabled = false;
    });
}

function bindControls() {
    document.querySelectorAll('input[name="hc-format"]').forEach(function (r) {
        r.addEventListener('change', function () {
            $('hc-quality-group').style.display = fmtOf() === 'jpg' ? '' : 'none';
        });
    });
    var q = $('hc-quality');
    q.addEventListener('input', function () { $('hc-quality-val').textContent = q.value; });
    $('hc-quality-val').textContent = q.value;
    $('hc-convert').addEventListener('click', onConvert);
    $('hc-download').addEventListener('click', onDownload);
    $('hc-clear-all').addEventListener('click', clearAll);
}

/* ============ 初始化 ============ */
bindUpload();
bindControls();
renderList();
})();
