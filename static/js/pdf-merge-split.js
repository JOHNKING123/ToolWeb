/* PDF 合并/拆分 - 纯前端本地处理（pdf-lib）
 * 合并：多 PDF 按列表顺序合并为一个文件；拆分：按页码范围提取，支持合并导出或逐页导出（ZIP/降级逐个下载）。
 * pdf-lib 与 JSZip 均经 CDN 懒加载；文件只在浏览器本地以 ArrayBuffer 处理，不上传服务器。 */
(function () {
'use strict';
var PDFLIB_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
var ZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
var BIG_FILE = 50 * 1024 * 1024;

var mode = 'merge';
var mergeItems = []; // {id,name,size,buf,pages,err}
var splitItem = null; // {name,size,buf,pages,err}
var seq = 0;

function $(id) { return document.getElementById(id); }
function toast(m) {
    var el = document.createElement('div');
    el.textContent = m;
    el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:86vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) document.body.removeChild(el); }, 3000);
}
function setStatus(m) { $('pms-status').textContent = m || ''; }
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
function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
function baseName(name) { return name.replace(/\.pdf$/i, ''); }

/* ============ CDN 懒加载（参照 exif-strip 的 JSZip 先例） ============ */
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
            if (!done) { done = true; clearTimeout(timer); reject(new Error('load failed')); }
        };
        s.src = src;
        document.head.appendChild(s);
    });
}
function ensurePdfLib() { return ensureLib(PDFLIB_CDN, 'PDFLib'); }
function ensureJSZip() { return ensureLib(ZIP_CDN, 'JSZip'); }
function showLibError(what) {
    var el = $('pms-lib-error');
    el.style.display = 'block';
    el.textContent = what + '加载失败，无法处理 PDF。请检查网络连接后重试（页面本身不受影响）。';
}
function hideLibError() { $('pms-lib-error').style.display = 'none'; $('pms-lib-error').textContent = ''; }

/* ============ PDF 读取与错误分类 ============ */
function classifyError(e) {
    var msg = (e && e.message) || '';
    if (/encrypt/i.test(msg)) return '文件已加密，无法处理';
    return '文件损坏或不是有效的 PDF';
}
function loadDoc(buf) {
    return window.PDFLib.PDFDocument.load(buf.slice(0), { ignoreEncryption: false });
}
function readItem(file) {
    return file.arrayBuffer().then(function (buf) {
        var item = { id: ++seq, name: file.name, size: file.size, buf: buf, pages: 0, err: '' };
        return loadDoc(buf).then(function (doc) {
            item.pages = doc.getPageCount();
            return item;
        }).catch(function (e) {
            item.err = classifyError(e);
            return item;
        });
    }).catch(function () {
        return { id: ++seq, name: file.name, size: file.size, buf: null, pages: 0, err: '文件读取失败' };
    });
}
function isPdfFile(f) {
    return /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
}

/* ============ Tab 切换 ============ */
function setMode(m) {
    mode = m;
    $('pms-tab-merge').classList.toggle('active', m === 'merge');
    $('pms-tab-split').classList.toggle('active', m === 'split');
    $('pms-panel-merge').style.display = m === 'merge' ? '' : 'none';
    $('pms-panel-split').style.display = m === 'split' ? '' : 'none';
    $('pms-file').multiple = m === 'merge';
    $('pms-upload-title').textContent = m === 'merge' ? '点击选择 PDF 文件，或把 PDF 拖拽到这里' : '点击选择一个 PDF 文件，或把 PDF 拖拽到这里';
    $('pms-upload-sub').textContent = m === 'merge' ? '合并可多选、可分次追加；文件仅在浏览器本地处理，不上传' : '拆分一次处理一个 PDF；文件仅在浏览器本地处理，不上传';
    setStatus('');
}

/* ============ 上传区（合并/拆分共用） ============ */
function handleFiles(files) {
    var pdfs = Array.prototype.filter.call(files, isPdfFile);
    if (!pdfs.length) { toast('请选择 PDF 文件'); return; }
    if (pdfs.length < files.length) toast('已忽略非 PDF 文件，只处理 PDF');
    if (pdfs.some(function (f) { return f.size > BIG_FILE; })) {
        toast('检测到超过 50MB 的大文件，本地处理可能较慢，请耐心等待');
    }
    hideLibError();
    setStatus('正在加载 PDF 处理组件并读取文件…');
    ensurePdfLib().then(function () {
        setStatus('正在读取 PDF 页数…');
        if (mode === 'merge') {
            return Promise.all(pdfs.map(readItem)).then(function (items) {
                mergeItems = mergeItems.concat(items);
                setStatus('');
                var bad = items.filter(function (it) { return it.err; });
                if (bad.length) toast(bad.length + ' 个文件无法处理（' + bad[0].err + '），已跳过，其余文件可继续');
                renderMerge();
            });
        }
        var f = pdfs[0];
        if (pdfs.length > 1) toast('拆分模式一次只处理一个 PDF，已取第一个');
        return readItem(f).then(function (item) {
            splitItem = item;
            setStatus('');
            renderSplit();
            if (item.err) toast(item.name + '：' + item.err);
        });
    }).catch(function () {
        setStatus('');
        showLibError('PDF 处理组件（pdf-lib CDN）');
    });
}

/* ============ 合并面板 ============ */
function renderMerge() {
    var ul = $('pms-merge-list');
    ul.innerHTML = '';
    mergeItems.forEach(function (it, idx) {
        var li = document.createElement('li');
        li.className = 'pms-item';
        li.draggable = !it.err;
        li.dataset.id = it.id;
        var sub = fmtSize(it.size) + (it.err ? '' : ' · ' + it.pages + ' 页' + (it.size > BIG_FILE ? ' · 大文件处理较慢' : ''));
        li.innerHTML =
            '<span class="drag material-icons" title="拖拽排序">drag_indicator</span>' +
            '<div class="meta"><div class="nm">' + esc(it.name) +
            (it.err ? '<span class="badge err">' + esc(it.err) + '</span>' : '<span class="badge">' + it.pages + ' 页</span>') +
            '</div><div class="sub">' + esc(sub) + '</div></div>' +
            '<div class="ops">' +
            '<button type="button" data-act="up" title="上移"><span class="material-icons">arrow_upward</span></button>' +
            '<button type="button" data-act="down" title="下移"><span class="material-icons">arrow_downward</span></button>' +
            '<button type="button" data-act="del" class="del" title="删除"><span class="material-icons">close</span></button>' +
            '</div>';
        li.querySelector('[data-act="up"]').addEventListener('click', function () { moveItem(idx, idx - 1); });
        li.querySelector('[data-act="down"]').addEventListener('click', function () { moveItem(idx, idx + 1); });
        li.querySelector('[data-act="del"]').addEventListener('click', function () {
            mergeItems.splice(idx, 1);
            renderMerge();
        });
        li.addEventListener('dragstart', function (e) {
            li.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', String(it.id)); } catch (err) {}
        });
        li.addEventListener('dragend', function () {
            li.classList.remove('dragging');
            Array.prototype.forEach.call(ul.children, function (c) { c.classList.remove('dragging'); });
            persistOrderFromDom();
        });
        li.addEventListener('dragover', function (e) {
            e.preventDefault();
            var dragging = ul.querySelector('.dragging');
            if (!dragging || dragging === li) return;
            var rect = li.getBoundingClientRect();
            var after = (e.clientY - rect.top) > rect.height / 2;
            ul.insertBefore(dragging, after ? li.nextSibling : li);
        });
        ul.appendChild(li);
    });
    var valid = mergeItems.filter(function (it) { return !it.err; });
    var totalPages = valid.reduce(function (s, it) { return s + it.pages; }, 0);
    var bad = mergeItems.length - valid.length;
    $('pms-merge-summary').textContent = mergeItems.length === 0
        ? '尚未添加文件：添加 2 个以上 PDF 后可按列表顺序合并导出。'
        : '共 ' + mergeItems.length + ' 个文件，其中 ' + valid.length + ' 个可合并，合计 ' + totalPages + ' 页' + (bad ? '；' + bad + ' 个文件有问题将被跳过' : '') + '。导出后将得到一个 ' + totalPages + ' 页的 PDF。';
    $('pms-merge-btn').disabled = valid.length === 0;
}
function persistOrderFromDom() {
    var ids = Array.prototype.map.call($('pms-merge-list').children, function (li) { return Number(li.dataset.id); });
    mergeItems.sort(function (a, b) { return ids.indexOf(a.id) - ids.indexOf(b.id); });
    renderMerge();
}
function moveItem(from, to) {
    if (to < 0 || to >= mergeItems.length) return;
    var tmp = mergeItems[from];
    mergeItems[from] = mergeItems[to];
    mergeItems[to] = tmp;
    renderMerge();
}
$('pms-merge-clear').addEventListener('click', function () {
    mergeItems = [];
    renderMerge();
    toast('合并列表已清空');
});
$('pms-merge-btn').addEventListener('click', function () {
    var valid = mergeItems.filter(function (it) { return !it.err; });
    if (!valid.length) { toast('请先添加可用的 PDF 文件'); return; }
    var btn = $('pms-merge-btn');
    btn.disabled = true;
    setStatus('正在合并 ' + valid.length + ' 个 PDF，请稍候…');
    ensurePdfLib().then(function () {
        var out = null;
        var chain = window.PDFLib.PDFDocument.create().then(function (d) { out = d; });
        valid.forEach(function (it) {
            chain = chain.then(function () {
                return loadDoc(it.buf).then(function (src) {
                    return out.copyPages(src, src.getPageIndices());
                }).then(function (pages) {
                    pages.forEach(function (p) { out.addPage(p); });
                });
            });
        });
        return chain.then(function () { return out.save(); });
    }).then(function (bytes) {
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), 'merged_' + timestamp() + '.pdf');
        setStatus('');
        toast('合并完成，已下载 merged_' + timestamp() + '.pdf');
    }).catch(function () {
        setStatus('');
        showLibError('PDF 处理组件（pdf-lib CDN）');
    }).then(function () {
        btn.disabled = mergeItems.filter(function (it) { return !it.err; }).length === 0;
    });
});

/* ============ 拆分面板 ============ */
function renderSplit() {
    var info = $('pms-split-info');
    var ok = splitItem && !splitItem.err;
    info.textContent = !splitItem
        ? '尚未选择文件：选择一个 PDF 后这里会显示总页数。'
        : splitItem.err
            ? splitItem.name + '（' + fmtSize(splitItem.size) + '）：' + splitItem.err + '，请换一个文件。'
            : splitItem.name + '（' + fmtSize(splitItem.size) + '），共 ' + splitItem.pages + ' 页' + (splitItem.size > BIG_FILE ? '；文件较大，处理可能较慢' : '') + '。';
    $('pms-split-one').disabled = !ok;
    $('pms-split-each').disabled = !ok;
    $('pms-split-error').textContent = '';
}
$('pms-split-clear').addEventListener('click', function () {
    splitItem = null;
    $('pms-range').value = '';
    renderSplit();
});

/* 页码范围解析：返回 {pages:[1-based...]} 或 {error:'中文原因'} */
function parseRange(text, total) {
    if (!text || !String(text).trim()) return { error: '请先输入页码范围，例如 1-3,5' };
    var cleaned = String(text).replace(/，/g, ',').replace(/[－–—]/g, '-').replace(/\s+/g, '');
    if (!cleaned) return { error: '请先输入页码范围，例如 1-3,5' };
    var set = {};
    var tokens = cleaned.split(',');
    for (var i = 0; i < tokens.length; i++) {
        var tk = tokens[i];
        if (!tk) return { error: '页码范围里有空段（多余的逗号），请检查后重试' };
        var m = tk.match(/^(\d+)-(\d+)$/);
        if (m) {
            var a = Number(m[1]), b = Number(m[2]);
            if (a < 1 || a > total || b < 1 || b > total) return { error: '区间 ' + tk + ' 超出范围：该 PDF 共 ' + total + ' 页，页码须在 1-' + total + ' 之间' };
            if (a > b) return { error: '区间 ' + tk + ' 写反了：起始页不能大于结束页' };
            for (var p = a; p <= b; p++) set[p] = true;
        } else if (/^\d+$/.test(tk)) {
            var n = Number(tk);
            if (n < 1 || n > total) return { error: '页码 ' + n + ' 超出范围：该 PDF 共 ' + total + ' 页，页码须在 1-' + total + ' 之间' };
            set[n] = true;
        } else {
            return { error: '无法识别「' + tk + '」：请用数字与短横线，如 1-3,5,8-10' };
        }
    }
    var pages = Object.keys(set).map(Number).sort(function (x, y) { return x - y; });
    if (!pages.length) return { error: '没有选中任何页面，请检查页码范围' };
    return { pages: pages };
}
function splitParseOrShow() {
    if (!splitItem || splitItem.err) { toast('请先选择一个可用的 PDF'); return null; }
    var r = parseRange($('pms-range').value, splitItem.pages);
    if (r.error) {
        $('pms-split-error').textContent = r.error;
        return null;
    }
    $('pms-split-error').textContent = '';
    return r.pages;
}
$('pms-split-one').addEventListener('click', function () {
    var pages = splitParseOrShow();
    if (!pages) return;
    var btn = $('pms-split-one');
    btn.disabled = true;
    setStatus('正在提取所选 ' + pages.length + ' 页…');
    ensurePdfLib().then(function () {
        return loadDoc(splitItem.buf).then(function (src) {
            return window.PDFLib.PDFDocument.create().then(function (out) {
                return out.copyPages(src, pages.map(function (p) { return p - 1; })).then(function (copied) {
                    copied.forEach(function (pg) { out.addPage(pg); });
                    return out.save();
                });
            });
        });
    }).then(function (bytes) {
        downloadBlob(new Blob([bytes], { type: 'application/pdf' }), baseName(splitItem.name) + '_extract_' + timestamp() + '.pdf');
        setStatus('');
        toast('已导出所选 ' + pages.length + ' 页为一个 PDF');
    }).catch(function () {
        setStatus('');
        showLibError('PDF 处理组件（pdf-lib CDN）');
    }).then(function () {
        btn.disabled = !(splitItem && !splitItem.err);
    });
});
$('pms-split-each').addEventListener('click', function () {
    var pages = splitParseOrShow();
    if (!pages) return;
    var btn = $('pms-split-each');
    btn.disabled = true;
    setStatus('正在逐页导出所选 ' + pages.length + ' 页…');
    ensurePdfLib().then(function () {
        return loadDoc(splitItem.buf).then(function (src) {
            var jobs = pages.map(function (p) {
                return window.PDFLib.PDFDocument.create().then(function (out) {
                    return out.copyPages(src, [p - 1]).then(function (copied) {
                        out.addPage(copied[0]);
                        return out.save();
                    });
                }).then(function (bytes) {
                    return { name: baseName(splitItem.name) + '_p' + p + '.pdf', bytes: bytes };
                });
            });
            return Promise.all(jobs);
        });
    }).then(function (files) {
        if (files.length === 1) {
            downloadBlob(new Blob([files[0].bytes], { type: 'application/pdf' }), files[0].name);
            setStatus('');
            toast('已导出单页 PDF');
            return;
        }
        return ensureJSZip().then(function () {
            var zip = new window.JSZip();
            files.forEach(function (f) { zip.file(f.name, f.bytes); });
            return zip.generateAsync({ type: 'blob' }).then(function (blob) {
                downloadBlob(blob, baseName(splitItem.name) + '_pages_' + timestamp() + '.zip');
                setStatus('');
                toast('已打包下载 ' + files.length + ' 页：' + baseName(splitItem.name) + '_pages_' + timestamp() + '.zip');
            });
        }).catch(function () {
            setStatus('');
            $('pms-split-error').textContent = '打包组件（JSZip CDN）加载失败，已自动降级为逐个下载，请在浏览器中允许下载多个文件。';
            toast('打包组件加载失败，已降级为逐个下载');
            files.forEach(function (f, i) {
                setTimeout(function () { downloadBlob(new Blob([f.bytes], { type: 'application/pdf' }), f.name); }, i * 450);
            });
        });
    }).catch(function () {
        setStatus('');
        showLibError('PDF 处理组件（pdf-lib CDN）');
    }).then(function () {
        btn.disabled = !(splitItem && !splitItem.err);
    });
});
$('pms-range').addEventListener('input', function () { $('pms-split-error').textContent = ''; });

/* ============ 绑定上传区与 Tab ============ */
$('pms-tab-merge').addEventListener('click', function () { setMode('merge'); });
$('pms-tab-split').addEventListener('click', function () { setMode('split'); });
var zone = $('pms-upload'), input = $('pms-file');
zone.addEventListener('click', function () { input.click(); });
zone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
input.addEventListener('change', function () {
    if (input.files.length) handleFiles(input.files);
    input.value = '';
});
['dragenter', 'dragover'].forEach(function (ev) {
    zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('dragover'); });
});
['dragleave', 'drop'].forEach(function (ev) {
    zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('dragover'); });
});
zone.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
});
setMode('merge');
renderMerge();
renderSplit();
})();
