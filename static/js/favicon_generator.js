/* 网站图标生成器（Favicon Generator）
 * 纯前端：上传/拖拽 PNG/JPG/WebP/SVG → canvas 高质量多尺寸导出
 * → favicon.ico 本地手工编码（ICONDIR + PNG 数据，零依赖）
 * → JSZip 本地 vendor 打包下载（ico + 各尺寸 PNG + site.webmanifest 片段）
 * 无后端调用、无 CDN。图片只在浏览器本地处理。
 */
(function () {
    'use strict';

    // 六个目标尺寸：尺寸 / ZIP 内文件名 / 用途说明
    var SIZES = [
        { size: 16,  file: 'favicon-16x16.png',       use: '浏览器标签页 / 书签栏' },
        { size: 32,  file: 'favicon-32x32.png',       use: '地址栏 / Retina 标签页' },
        { size: 48,  file: 'favicon-48x48.png',       use: 'Windows 任务栏 / 快捷方式' },
        { size: 180, file: 'apple-touch-icon.png',    use: 'iOS 主屏幕图标' },
        { size: 192, file: 'android-chrome-192x192.png', use: 'PWA / 安卓主屏幕' },
        { size: 512, file: 'android-chrome-512x512.png', use: 'PWA 启动屏 / 高清源' }
    ];
    var ICO_SIZES = [16, 32, 48]; // 打进 favicon.ico 的三个尺寸

    var $ = function (id) { return document.getElementById(id); };
    var uploadEl = $('fg-upload'), fileEl = $('fg-file'), statusEl = $('fg-status'),
        srcInfoEl = $('fg-srcinfo'), workspaceEl = $('fg-workspace'),
        gridEl = $('fg-grid'), exportStatusEl = $('fg-export-status'),
        copyStatusEl = $('fg-copy-status');

    var masterImage = null;  // 加载成功的 HTMLImageElement
    var canvases = {};       // size -> canvas
    var sourceName = 'favicon';

    function setStatus(msg) { statusEl.textContent = msg || ''; }
    function setExportStatus(msg) { exportStatusEl.textContent = msg || ''; }
    function setCopyStatus(msg) { copyStatusEl.textContent = msg || ''; }

    /* ---------- 上传 ---------- */
    uploadEl.addEventListener('click', function () { fileEl.click(); });
    uploadEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileEl.click(); }
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
        uploadEl.addEventListener(ev, function (e) { e.preventDefault(); uploadEl.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
        uploadEl.addEventListener(ev, function (e) { e.preventDefault(); uploadEl.classList.remove('dragover'); });
    });
    uploadEl.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) handleFile(f);
    });
    fileEl.addEventListener('change', function () {
        if (fileEl.files && fileEl.files[0]) handleFile(fileEl.files[0]);
        fileEl.value = '';
    });
    $('fg-reupload').addEventListener('click', function () {
        workspaceEl.style.display = 'none';
        srcInfoEl.style.display = 'none';
        setStatus('');
        fileEl.click();
    });

    function handleFile(file) {
        if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type) &&
            !/\.(png|jpe?g|webp|svg)$/i.test(file.name)) {
            setStatus('❌ 暂不支持该格式，请上传 PNG / JPG / WebP / SVG 图片。');
            return;
        }
        sourceName = (file.name || 'favicon').replace(/\.[^.]+$/, '') || 'favicon';
        setStatus('⏳ 正在读取图片…');
        var isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
        if (isSvg) {
            // SVG：无宽高属性时浏览器会渲染为空，先注入默认宽高再光栅化
            var reader = new FileReader();
            reader.onload = function () {
                var text = String(reader.result || '');
                var fixed = ensureSvgSize(text);
                var blob = new Blob([fixed], { type: 'image/svg+xml;charset=utf-8' });
                loadImage(URL.createObjectURL(blob), file, true);
            };
            reader.onerror = function () { setStatus('❌ 图片读取失败，请换一张图片试试。'); };
            reader.readAsText(file);
        } else {
            loadImage(URL.createObjectURL(file), file, false);
        }
    }

    // 给没有 width/height 的 SVG 注入默认尺寸，保证光栅化不为空
    function ensureSvgSize(text) {
        var m = text.match(/<svg\b[^>]*>/i);
        if (!m) return text;
        var tag = m[0];
        var hasW = /\bwidth\s*=/i.test(tag), hasH = /\bheight\s*=/i.test(tag);
        if (hasW && hasH) return text;
        var vb = tag.match(/viewBox\s*=\s*["']\s*[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
        var w = 1024, h = 1024;
        if (vb) {
            var vw = parseFloat(vb[1]), vh = parseFloat(vb[2]);
            if (vw > 0 && vh > 0) {
                var s = 1024 / Math.max(vw, vh);
                w = Math.max(1, Math.round(vw * s));
                h = Math.max(1, Math.round(vh * s));
            }
        }
        var inject = '';
        if (!hasW) inject += ' width="' + w + '"';
        if (!hasH) inject += ' height="' + h + '"';
        return text.replace(/<svg\b/i, '<svg' + inject);
    }

    function loadImage(url, file, isSvg) {
        var img = new Image();
        img.onload = function () {
            if (!img.naturalWidth || !img.naturalHeight) {
                URL.revokeObjectURL(url);
                setStatus('❌ 图片解码失败（可能是无尺寸的 SVG），请换一张图片试试。');
                return;
            }
            masterImage = img;
            renderAll(file, isSvg);
            URL.revokeObjectURL(url);
        };
        img.onerror = function () {
            URL.revokeObjectURL(url);
            setStatus('❌ 图片加载失败，文件可能已损坏，请换一张试试。');
        };
        img.src = url;
    }

    /* ---------- 多尺寸渲染（contain 居中，透明保留） ---------- */
    function renderSize(size) {
        var c = document.createElement('canvas');
        c.width = size; c.height = size;
        var ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        var iw = masterImage.naturalWidth, ih = masterImage.naturalHeight;
        var scale = Math.min(size / iw, size / ih);
        var dw = Math.max(1, Math.round(iw * scale)), dh = Math.max(1, Math.round(ih * scale));
        var dx = Math.round((size - dw) / 2), dy = Math.round((size - dh) / 2);
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(masterImage, dx, dy, dw, dh);
        return c;
    }

    function renderAll(file, isSvg) {
        canvases = {};
        SIZES.forEach(function (s) { canvases[s.size] = renderSize(s.size); });

        // 来源信息
        var kb = (file.size / 1024).toFixed(1);
        srcInfoEl.style.display = '';
        srcInfoEl.innerHTML = '已加载：<code>' + escapeHtml(file.name || '未命名') + '</code>　原图 ' +
            masterImage.naturalWidth + '×' + masterImage.naturalHeight +
            '　' + kb + ' KB' + (isSvg ? '　（SVG 已光栅化）' : '');

        // 预览栅格
        gridEl.innerHTML = '';
        SIZES.forEach(function (s) {
            var cell = document.createElement('div');
            cell.className = 'fg-cell';
            var thumb = document.createElement('div');
            thumb.className = 'fg-thumb fg-checker';
            var img = document.createElement('img');
            img.src = canvases[s.size].toDataURL('image/png');
            img.alt = s.size + '×' + s.size + ' 预览';
            thumb.appendChild(img);
            var label = document.createElement('div');
            label.className = 'fg-label';
            label.textContent = s.size + '×' + s.size;
            var use = document.createElement('div');
            use.className = 'fg-use';
            use.textContent = s.use;
            var dl = document.createElement('button');
            dl.className = 'fg-dl';
            dl.textContent = '⬇ PNG';
            dl.addEventListener('click', function () { downloadPng(s.size, s.file); });
            cell.appendChild(thumb); cell.appendChild(label);
            cell.appendChild(use); cell.appendChild(dl);
            gridEl.appendChild(cell);
        });

        // 标签页模拟 + 深浅对比预览
        $('fg-tab-icon').src = canvases[16].toDataURL('image/png');
        $('fg-prev-light').src = canvases[48].toDataURL('image/png');
        $('fg-prev-dark').src = canvases[48].toDataURL('image/png');

        renderCodeSnippets();
        workspaceEl.style.display = '';
        setStatus('✅ 生成成功：六种尺寸已就绪，可单独下载 PNG，或一键打包下载。');
        setExportStatus('');
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /* ---------- 下载 ---------- */
    function saveBlob(blob, filename) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    }

    function downloadPng(size, filename) {
        canvases[size].toBlob(function (blob) {
            if (!blob) { setExportStatus('❌ PNG 导出失败，请重试。'); return; }
            saveBlob(blob, filename);
            setExportStatus('✅ 已下载 ' + filename);
        }, 'image/png');
    }

    /* ---------- favicon.ico 手工编码 ----------
     * ICO 文件结构：ICONDIR(6 字节) + ICONDIRENTRY(每项 16 字节) + 图像数据
     * 本工具内嵌 PNG 数据（现代浏览器/Windows 均可识别），零依赖。
     */
    function canvasToPngBytes(canvas) {
        return new Promise(function (resolve, reject) {
            canvas.toBlob(function (blob) {
                if (!blob) { reject(new Error('png encode failed')); return; }
                var r = new FileReader();
                r.onload = function () { resolve(new Uint8Array(r.result)); };
                r.onerror = function () { reject(new Error('read failed')); };
                r.readAsArrayBuffer(blob);
            }, 'image/png');
        });
    }

    function buildIco() {
        return Promise.all(ICO_SIZES.map(function (s) {
            return canvasToPngBytes(canvases[s]).then(function (bytes) {
                return { size: s, bytes: bytes };
            });
        })).then(function (items) {
            var count = items.length;
            var headerLen = 6 + 16 * count;
            var total = headerLen;
            items.forEach(function (it) { total += it.bytes.length; });
            var buf = new ArrayBuffer(total);
            var dv = new DataView(buf);
            var u8 = new Uint8Array(buf);
            dv.setUint16(0, 0, true);      // reserved
            dv.setUint16(2, 1, true);      // type: 1 = ICO
            dv.setUint16(4, count, true);  // 图像数量
            var offset = headerLen;
            items.forEach(function (it, i) {
                var p = 6 + 16 * i;
                u8[p] = it.size >= 256 ? 0 : it.size;     // 宽度（0 表示 256）
                u8[p + 1] = it.size >= 256 ? 0 : it.size; // 高度
                u8[p + 2] = 0;                            // 调色板色数（PNG 不用）
                u8[p + 3] = 0;                            // reserved
                dv.setUint16(p + 4, 1, true);             // planes
                dv.setUint16(p + 6, 32, true);            // bitCount
                dv.setUint32(p + 8, it.bytes.length, true);  // 数据长度
                dv.setUint32(p + 12, offset, true);       // 数据偏移
                u8.set(it.bytes, offset);
                offset += it.bytes.length;
            });
            return new Blob([buf], { type: 'image/x-icon' });
        });
    }

    $('fg-dl-ico').addEventListener('click', function () {
        setExportStatus('⏳ 正在手工编码 favicon.ico…');
        buildIco().then(function (blob) {
            saveBlob(blob, 'favicon.ico');
            setExportStatus('✅ favicon.ico 已下载（含 16/32/48 三个尺寸）。');
        }).catch(function () {
            setExportStatus('❌ ICO 编码失败，请重试。');
        });
    });

    /* ---------- ZIP 打包 ---------- */
    function buildManifest() {
        return JSON.stringify({
            name: '我的网站',
            short_name: '网站',
            icons: [
                { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }
            ],
            theme_color: '#ffffff',
            background_color: '#ffffff',
            display: 'standalone'
        }, null, 2) + '\n';
    }

    $('fg-dl-zip').addEventListener('click', function () {
        if (typeof JSZip === 'undefined') {
            setExportStatus('❌ 打包组件未加载（本地 vendor 文件缺失），请刷新页面重试。');
            return;
        }
        setExportStatus('⏳ 正在打包 ZIP…');
        buildIco().then(function (icoBlob) {
            var zip = new JSZip();
            zip.file('favicon.ico', icoBlob);
            var jobs = SIZES.map(function (s) {
                return canvasToPngBytes(canvases[s.size]).then(function (bytes) {
                    zip.file(s.file, bytes);
                });
            });
            return Promise.all(jobs).then(function () {
                zip.file('site.webmanifest', buildManifest());
                return zip.generateAsync({ type: 'blob' });
            });
        }).then(function (blob) {
            saveBlob(blob, sourceName + '-favicon.zip');
            setExportStatus('✅ 打包完成：favicon.ico + 6 张 PNG + site.webmanifest 已下载。');
        }).catch(function () {
            setExportStatus('❌ 打包失败，请重试。');
        });
    });

    /* ---------- HTML 引用代码 ---------- */
    function renderCodeSnippets() {
        $('fg-code-1').textContent =
            '<!-- 网站图标：浏览器标签页 / 书签栏显示 -->\n' +
            '<link rel="icon" type="image/x-icon" href="/favicon.ico">\n' +
            '<!-- 高清 PNG 图标：现代浏览器优先使用 -->\n' +
            '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">\n' +
            '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">';
        $('fg-code-2').textContent =
            '<!-- iOS 触控图标：用户「添加到主屏幕」时使用 -->\n' +
            '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">';
        $('fg-code-3').textContent =
            '<!-- PWA 应用清单：安卓安装 / 主题色配置 -->\n' +
            '<link rel="manifest" href="/site.webmanifest">';
    }

    document.querySelectorAll('.fg-copy').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var pre = $(btn.getAttribute('data-copy'));
            var text = pre.textContent;
            function done(ok) {
                setCopyStatus(ok ? '✅ 已复制到剪贴板，直接粘贴到页面 <head> 里即可。'
                                 : '❌ 复制失败，请手动选中代码复制。');
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
            } else {
                var ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                try { done(document.execCommand('copy')); }
                catch (e) { done(false); }
                ta.remove();
            }
        });
    });
})();
