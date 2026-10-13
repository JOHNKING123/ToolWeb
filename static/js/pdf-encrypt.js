/* PDF 加密/解密 - 纯前端本地处理
 * 加密：pdf-crypto.js（自研 PDF 标准加密 V=2/V=4：RC4-128 / AES-128 AESV2），直接对原文件字节加密
 * 解密：优先 pdf-crypto.js 无损字节级解密（V<=4）；AES-256/对象流等暂不支持的版本走 pdf.js 渲染转图片型 PDF 兼容路径
 * 全程无上传、无新增后端接口。pdf-lib 仅用于读取页数展示（失败可降级），pdf.js 仅解密兼容路径需要。
 */
(function () {
'use strict';
var PDFLIB_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
var PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
var PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
var BIG_FILE = 50 * 1024 * 1024;
var RENDER_SCALE = 2;

var mode = 'encrypt';
var encFile = null;   // {name, size, buf, pages}
var decFile = null;   // {name, size, buf, encInfo}
var lastEncrypted = null; // {bytes, name}
var busy = false;

function $(id) { return document.getElementById(id); }
function toast(m) {
    var el = document.createElement('div');
    el.textContent = m;
    el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:86vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) document.body.removeChild(el); }, 2800);
}
function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
}
function baseName(name) { return String(name).replace(/\.pdf$/i, ''); }
function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
function isPdfFile(f) { return /\.pdf$/i.test(f.name) || f.type === 'application/pdf'; }

/* ============ CDN 懒加载（与 pdf-manage.js 同款） ============ */
function ensureLib(src, globalName) {
    return new Promise(function (resolve, reject) {
        if (window[globalName]) { resolve(); return; }
        var s = document.createElement('script');
        var done = false;
        var timer = setTimeout(function () { if (!done) { done = true; s.remove(); reject(new Error('timeout')); } }, 20000);
        s.onload = function () { if (!done) { done = true; clearTimeout(timer); window[globalName] ? resolve() : reject(new Error('bad lib')); } };
        s.onerror = function () { if (!done) { done = true; clearTimeout(timer); reject(new Error('load failed')); } };
        s.src = src;
        document.head.appendChild(s);
    });
}
function ensurePdfLib() { return ensureLib(PDFLIB_CDN, 'PDFLib'); }
function ensurePdfJs() {
    return ensureLib(PDFJS_CDN, 'pdfjsLib').then(function () {
        if (window.pdfjsLib.GlobalWorkerOptions && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
        }
    });
}

/* ============ 错误文案 ============ */
function cryptoErrMsg(e) {
    if (e && e.name === 'PdfCryptoError') {
        switch (e.code) {
            case 'WRONG_PASSWORD': return '密码不正确，请检查后重试';
            case 'NOT_ENCRYPTED': return '该 PDF 未加密，无需解密';
            case 'ALREADY_ENCRYPTED': return '该 PDF 已带密码保护，无需重复加密；如需更换密码，请先到「解除密码」解密后再重新加密';
            case 'BAD_ARGS': return '打开密码不能为空';
            case 'CORRUPT': return '文件损坏或不是有效的 PDF，请换一个文件试试';
            case 'UNSUPPORTED': return '该 PDF 的加密方式暂不支持，请用原软件处理';
            default: return e.message || '处理失败，请重试';
        }
    }
    var msg = (e && e.message) || '';
    if (/password/i.test(msg)) return '密码不正确，请检查后重试';
    return '处理失败（' + (msg || '未知错误') + '），请重试';
}
function classifyPdfError(e) {
    var name = (e && e.name) || '';
    var msg = (e && e.message) || '';
    if (name === 'PasswordException' || /incorrect password|no password/i.test(msg)) return '密码不正确，请检查后重试';
    if (name === 'InvalidPDFException' || name === 'MissingPDFException' || /invalid|missing|format/i.test(msg)) return '文件损坏或不是有效的 PDF，请换一个文件试试';
    return '无法读取该 PDF 文件，请换一个文件试试';
}

/* ============ 模式页签 ============ */
function setMode(m) {
    mode = m;
    $('pec-tab-encrypt').classList.toggle('active', m === 'encrypt');
    $('pec-tab-decrypt').classList.toggle('active', m === 'decrypt');
    $('pec-panel-encrypt').style.display = m === 'encrypt' ? '' : 'none';
    $('pec-panel-decrypt').style.display = m === 'decrypt' ? '' : 'none';
}

/* ============ 上传区（双模式各一套） ============ */
function bindUpload(zoneId, inputId, onFile) {
    var zone = $(zoneId), input = $(inputId);
    zone.addEventListener('click', function () { input.click(); });
    zone.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
        zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
        zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('dragover'); });
    });
    zone.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) onFile(f);
    });
    input.addEventListener('change', function () {
        if (input.files && input.files[0]) onFile(input.files[0]);
        input.value = '';
    });
}
function bindPwdToggle(inputId, btnId) {
    $(btnId).addEventListener('click', function () {
        var inp = $(inputId);
        var show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        $(btnId).querySelector('.material-icons').textContent = show ? 'visibility_off' : 'visibility';
    });
}

/* ============ 加密模式 ============ */
function encSetStatus(m) { $('pec-enc-status').textContent = m || ''; }
function encShowError(m) { $('pec-enc-error').textContent = m || ''; }
function encShowProgress(text, frac) {
    $('pec-enc-progress').style.display = 'block';
    $('pec-enc-progress-bar').style.width = Math.round(frac * 100) + '%';
    $('pec-enc-progress-txt').textContent = text;
}
function encHideProgress() {
    $('pec-enc-progress').style.display = 'none';
    $('pec-enc-progress-bar').style.width = '0';
    $('pec-enc-progress-txt').textContent = '';
}
function renderEncFileInfo() {
    var box = $('pec-enc-fileinfo');
    if (!encFile) { box.style.display = 'none'; $('pec-enc-form').style.display = 'none'; return; }
    box.style.display = 'flex';
    $('pec-enc-file-name').textContent = encFile.name;
    $('pec-enc-file-name').title = encFile.name;
    $('pec-enc-file-sub').textContent = fmtSize(encFile.size) +
        (encFile.pages ? ' · 共 ' + encFile.pages + ' 页' : ' · 页数未知') +
        (encFile.size > BIG_FILE ? ' · 文件较大，处理可能较慢' : '');
    $('pec-enc-form').style.display = 'block';
    $('pec-enc-export').disabled = false;
}
function handleEncFile(f) {
    if (busy) return;
    if (!isPdfFile(f)) { encShowError('请选择 PDF 文件（.pdf）'); toast('请选择 PDF 文件'); return; }
    if (f.size > BIG_FILE) toast('文件较大，处理可能较慢，请耐心等待');
    encShowError(''); encHideProgress();
    encFile = null; lastEncrypted = null;
    $('pec-enc-verify').style.display = 'none';
    renderEncFileInfo();
    encSetStatus('正在读取文件…');
    f.arrayBuffer().then(function (buf) {
        // 已加密的文件拒绝（用本地加密探测，无需密码）
        var already = null;
        try { already = window.PdfCrypto.getEncryptInfo(new Uint8Array(buf)); } catch (e) { /* 解析失败交给 pdf-lib 报错 */ }
        if (already) {
            encSetStatus('');
            encShowError('该 PDF 已带密码保护，无需重复加密；如需更换密码，请先到「解除密码」解密后再重新加密');
            return;
        }
        encSetStatus('正在解析 PDF…');
        return ensurePdfLib().then(function () {
            return window.PDFLib.PDFDocument.load(new Uint8Array(buf));
        }).then(function (pdf) {
            encFile = { name: f.name, size: f.size, buf: buf, pages: pdf.getPageCount() };
            encSetStatus('');
            renderEncFileInfo();
            toast('已读取「' + f.name + '」');
        }, function (e) {
            // 失败时不再降级放行：页数未知就意味着无法确认文件有效性，直接报错阻止导出
            encSetStatus('');
            if (!window.PDFLib) {
                encShowError('PDF 解析组件（pdf-lib）加载失败，请检查网络连接后重试');
            } else {
                encShowError('该文件不是有效的 PDF 或已损坏，无法读取，请更换文件后重试');
            }
        });
    }).catch(function (e) {
        encSetStatus('');
        encShowError(classifyPdfError(e));
    });
}
function passwordStrength(pw) {
    if (!pw) return '';
    var score = 0;
    if (pw.length >= 6) score++;
    if (pw.length >= 10) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;
    if (score <= 2) return '弱';
    if (score <= 3) return '中';
    return '强';
}
function currentPermissions() {
    var P = -196; // 默认全部允许
    if (!$('pec-perm-print').checked) P &= ~(4 | 2048);
    if (!$('pec-perm-copy').checked) P &= ~(16 | 512);
    if (!$('pec-perm-modify').checked) P &= ~(8 | 32 | 256 | 1024);
    return P | 0;
}
function doEncrypt() {
    if (busy || !encFile) return;
    var pw = $('pec-userpw').value;
    var pw2 = $('pec-userpw2').value;
    var ownerPw = $('pec-ownerpw').value;
    encShowError('');
    if (!pw) { encShowError('请设置打开密码'); $('pec-userpw').focus(); return; }
    if (pw !== pw2) { encShowError('两次输入的打开密码不一致，请重新输入'); $('pec-userpw2').focus(); return; }
    var strength = document.querySelector('input[name="pec-strength"]:checked').value;
    busy = true;
    $('pec-enc-export').disabled = true;
    encShowProgress('正在加密…', 0.3);
    setTimeout(function () {
        try {
            var out = window.PdfCrypto.encryptPdf(new Uint8Array(encFile.buf), {
                userPassword: pw,
                ownerPassword: ownerPw || pw,
                strength: strength,
                permissions: currentPermissions()
            });
            encShowProgress('正在生成文件…', 0.9);
            var blob = new Blob([out.bytes], { type: 'application/pdf' });
            var outName = 'encrypted_' + baseName(encFile.name) + '.pdf';
            downloadBlob(blob, outName);
            lastEncrypted = { bytes: out.bytes, name: outName };
            encShowProgress('加密完成', 1);
            $('pec-enc-verify').style.display = '';
            toast('加密完成，已开始下载');
        } catch (e) {
            encShowError(cryptoErrMsg(e));
        } finally {
            busy = false;
            $('pec-enc-export').disabled = false;
            setTimeout(encHideProgress, 1200);
        }
    }, 60);
}
function doVerify() {
    if (busy || !lastEncrypted) return;
    var pw = $('pec-userpw').value;
    if (!pw) { encShowError('请先输入刚才设置的打开密码再验证'); return; }
    busy = true;
    encShowError('');
    encSetStatus('正在用密码验证打开…');
    setTimeout(function () {
        try {
            window.PdfCrypto.decryptPdf(lastEncrypted.bytes, pw);
            encSetStatus('');
            toast('验证通过：密码正确，文件可正常打开');
        } catch (e) {
            encSetStatus('');
            encShowError('验证失败：' + cryptoErrMsg(e));
        } finally {
            busy = false;
        }
    }, 60);
}

/* ============ 解密模式 ============ */
function decSetStatus(m) { $('pec-dec-status').textContent = m || ''; }
function decShowError(m) { $('pec-dec-error').textContent = m || ''; }
function decShowNote(m) {
    var el = $('pec-dec-note');
    el.style.display = m ? '' : 'none';
    el.textContent = m || '';
}
function decShowProgress(text, frac) {
    $('pec-dec-progress').style.display = 'block';
    $('pec-dec-progress-bar').style.width = Math.round(frac * 100) + '%';
    $('pec-dec-progress-txt').textContent = text;
}
function decHideProgress() {
    $('pec-dec-progress').style.display = 'none';
    $('pec-dec-progress-bar').style.width = '0';
    $('pec-dec-progress-txt').textContent = '';
}
function renderDecFileInfo() {
    var box = $('pec-dec-fileinfo');
    if (!decFile) { box.style.display = 'none'; $('pec-dec-form').style.display = 'none'; return; }
    box.style.display = 'flex';
    $('pec-dec-file-name').textContent = decFile.name;
    $('pec-dec-file-name').title = decFile.name;
    var info = decFile.encInfo;
    var algo = !info ? '高强度加密（兼容模式）' : (info.V === 4 ? 'AES-128' : 'RC4');
    $('pec-dec-file-sub').textContent = fmtSize(decFile.size) + ' · 已加密（' + algo + '）' +
        (decFile.size > BIG_FILE ? ' · 文件较大，处理可能较慢' : '');
    $('pec-dec-form').style.display = 'block';
    $('pec-dec-export').disabled = false;
}
function handleDecFile(f) {
    if (busy) return;
    if (!isPdfFile(f)) { decShowError('请选择 PDF 文件（.pdf）'); toast('请选择 PDF 文件'); return; }
    if (f.size > BIG_FILE) toast('文件较大，处理可能较慢，请耐心等待');
    decShowError(''); decShowNote(''); decHideProgress();
    decFile = null;
    renderDecFileInfo();
    decSetStatus('正在读取文件…');
    f.arrayBuffer().then(function (buf) {
        var info = null, compat = false;
        try {
            info = window.PdfCrypto.getEncryptInfo(new Uint8Array(buf));
        } catch (e) {
            if (e && e.name === 'PdfCryptoError' &&
                (e.code === 'UNSUPPORTED_R6' || e.code === 'UNSUPPORTED')) {
                compat = true; // 高强度加密：上传时放行，导出时走兼容模式
            } else {
                decSetStatus('');
                decShowError(cryptoErrMsg(e));
                return;
            }
        }
        if (!info && !compat) {
            decSetStatus('');
            decShowError('该 PDF 未加密，无需解密');
            return;
        }
        decFile = { name: f.name, size: f.size, buf: buf, encInfo: info, compat: compat };
        decSetStatus('');
        renderDecFileInfo();
        if (compat) {
            decShowNote('该文件采用高强度加密，解密时将使用兼容模式导出（排版一致，文字不可选中）。');
        }
        toast('已读取加密 PDF，请输入密码解密');
    }).catch(function (e) {
        decSetStatus('');
        decShowError(classifyPdfError(e));
    });
}
function doDecrypt() {
    if (busy || !decFile) return;
    var pw = $('pec-decpw').value;
    decShowError(''); decShowNote('');
    busy = true;
    $('pec-dec-export').disabled = true;
    decShowProgress('正在解密…', 0.3);
    var raw = new Uint8Array(decFile.buf);
    setTimeout(function () {
        if (decFile.compat) { decryptViaPdfJs(raw, pw); return; }
        try {
            var out = window.PdfCrypto.decryptPdf(raw, pw);
            finishDecExport(out.bytes, false);
        } catch (e) {
            if (e && e.name === 'PdfCryptoError' &&
                (e.code === 'NEED_FALLBACK' || e.code === 'UNSUPPORTED_R6' || e.code === 'UNSUPPORTED')) {
                decryptViaPdfJs(raw, pw);
            } else {
                busy = false;
                $('pec-dec-export').disabled = false;
                decHideProgress();
                decShowError(cryptoErrMsg(e));
            }
        }
    }, 60);
}
function finishDecExport(bytes, rasterized) {
    decShowProgress('正在生成文件…', 0.9);
    var blob = new Blob([bytes], { type: 'application/pdf' });
    downloadBlob(blob, 'decrypted_' + baseName(decFile.name) + '.pdf');
    decShowProgress('解密完成', 1);
    if (rasterized) {
        decShowNote('该文件采用本站暂不支持直接还原的高强度加密，已通过兼容模式导出为图片型 PDF（排版与原文件一致，文字不可选中复制）。');
    }
    toast('解密完成，已开始下载');
    busy = false;
    $('pec-dec-export').disabled = false;
    setTimeout(decHideProgress, 1200);
}
/* 兼容路径：pdf.js 按密码渲染 → pdf-lib 按页拼图片型 PDF（用于 AES-256 / 对象流等） */
function decryptViaPdfJs(raw, pw) {
    decShowProgress('正在加载兼容组件…', 0.15);
    var pdfjsDoc = null;
    ensurePdfJs().then(function () {
        decShowProgress('正在用密码打开…', 0.25);
        return window.pdfjsLib.getDocument({ data: raw, password: pw }).promise;
    }).then(function (pdf) {
        pdfjsDoc = pdf;
        return ensurePdfLib();
    }).then(function () {
        return window.PDFLib.PDFDocument.create().then(function (outDoc) {
            var chain = Promise.resolve();
            var total = pdfjsDoc.numPages;
            for (var p = 1; p <= total; p++) {
                (function (pageNum) {
                    chain = chain.then(function () {
                        decShowProgress('正在转换第 ' + pageNum + ' / ' + total + ' 页…', 0.25 + 0.6 * (pageNum - 1) / total);
                        return pdfjsDoc.getPage(pageNum);
                    }).then(function (page) {
                        var viewport = page.getViewport({ scale: RENDER_SCALE });
                        var canvas = document.createElement('canvas');
                        canvas.width = Math.floor(viewport.width);
                        canvas.height = Math.floor(viewport.height);
                        var ctx = canvas.getContext('2d');
                        return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
                            return new Promise(function (resolve) {
                                canvas.toBlob(function (blob) { resolve(blob); }, 'image/jpeg', 0.92);
                            });
                        });
                    }).then(function (blob) {
                        return blob.arrayBuffer();
                    }).then(function (ab) {
                        return outDoc.embedJpg(new Uint8Array(ab));
                    }).then(function (img) {
                        var pg = outDoc.addPage([img.width / RENDER_SCALE, img.height / RENDER_SCALE]);
                        pg.drawImage(img, { x: 0, y: 0, width: img.width / RENDER_SCALE, height: img.height / RENDER_SCALE });
                    });
                })(p);
            }
            return chain.then(function () { return outDoc.save(); });
        });
    }).then(function (bytes) {
        if (pdfjsDoc) { pdfjsDoc.destroy(); pdfjsDoc = null; }
        finishDecExport(bytes, true);
    }).catch(function (e) {
        if (pdfjsDoc) { try { pdfjsDoc.destroy(); } catch (ie) {} pdfjsDoc = null; }
        busy = false;
        $('pec-dec-export').disabled = false;
        decHideProgress();
        if (!window.pdfjsLib) {
            decShowError('PDF 兼容组件（pdf.js）加载失败，请检查网络连接后重试');
        } else {
            decShowError(classifyPdfError(e));
        }
    });
}

/* ============ 初始化 ============ */
function init() {
    $('pec-tab-encrypt').addEventListener('click', function () { setMode('encrypt'); });
    $('pec-tab-decrypt').addEventListener('click', function () { setMode('decrypt'); });
    bindUpload('pec-enc-upload', 'pec-enc-file', handleEncFile);
    bindUpload('pec-dec-upload', 'pec-dec-file', handleDecFile);
    $('pec-enc-clear').addEventListener('click', function () {
        if (busy) return;
        encFile = null; lastEncrypted = null;
        $('pec-enc-verify').style.display = 'none';
        encShowError(''); encSetStatus(''); encHideProgress();
        renderEncFileInfo();
    });
    $('pec-dec-clear').addEventListener('click', function () {
        if (busy) return;
        decFile = null;
        decShowError(''); decShowNote(''); decSetStatus(''); decHideProgress();
        renderDecFileInfo();
    });
    $('pec-enc-export').addEventListener('click', doEncrypt);
    $('pec-enc-verify').addEventListener('click', doVerify);
    $('pec-dec-export').addEventListener('click', doDecrypt);
    bindPwdToggle('pec-userpw', 'pec-userpw-toggle');
    bindPwdToggle('pec-userpw2', 'pec-userpw2-toggle');
    bindPwdToggle('pec-ownerpw', 'pec-ownerpw-toggle');
    bindPwdToggle('pec-decpw', 'pec-decpw-toggle');
    $('pec-userpw').addEventListener('input', function () {
        var v = passwordStrength($('pec-userpw').value);
        $('pec-pw-strength').textContent = v ? '密码强度：' + v : '';
    });
    // 支持 ?mode=decrypt 直达解密模式
    try {
        if (/(?:\?|&)mode=decrypt/.test(window.location.search)) setMode('decrypt');
    } catch (e) {}
    setMode('encrypt');
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
})();
