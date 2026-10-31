/* 占位图生成器 - 纯前端 canvas 任意尺寸占位图生成（宽高/显示文字/底色/文字色可调）
 * 数据只在浏览器里处理：零第三方依赖、无任何后端调用、无网络请求（脚本内零 fetch/XHR）。
 * 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 *   parseSize(w, h)        -> {w, h}（各取整；范围 1~4096；
 *                             w 非法抛 Error，err.field='width'；
 *                             h 非法抛 Error，err.field='height'）
 *   normalizeHex(hex, field) -> '#rrggbb' 小写（接受 #rgb/#rrggbb，大小写不限；
 *                             非法抛 Error，err.field=传入的 field 名）
 *   displayTextOf(text, w, h) -> string（text 去首尾空格后非空返回原样；
 *                             空返回 `${w}×${h}`；
 *                             text 非字符串抛 Error，err.field='text'）
 *   buildPlaceholderName(w, h) -> 'placeholder-800x600.png'（固定格式文件名；
 *                             非法尺寸抛 Error，err.field='width'/'height'，走 parseSize）
 * 渲染管线（canvas）：按宽高建 canvas → 底色填充 → 文字居中绘制
 *   （字号 = clamp(floor(min(w,h)/6), 12, 200)，超宽时 measureText 循环缩小）→ 预览＋导出 PNG。
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；
 * Node 自测：module.exports 暴露纯函数。
 */
(function () {
'use strict';

function err(field, msg) {
    var e = new Error(msg);
    e.field = field;
    return e;
}

var MIN_DIM = 1, MAX_DIM = 4096;

/* 尺寸：取整，范围 1~4096，非法抛 Error（err.field='width'/'height'），不静默钳制 */
function parseSize(w, h) {
    function one(v, field) {
        if (typeof v === 'boolean' || v === null || v === undefined) {
            throw err(field, 'parseSize: ' + field + ' 必须为数字');
        }
        var n = (typeof v === 'string') ? Number(v.trim()) : Number(v);
        if (!isFinite(n)) {
            throw err(field, 'parseSize: ' + field + ' 必须为数字');
        }
        n = Math.floor(n);
        if (n < MIN_DIM || n > MAX_DIM) {
            throw err(field, 'parseSize: ' + field + ' 必须在 1~4096 之间');
        }
        return n;
    }
    return { w: one(w, 'width'), h: one(h, 'height') };
}

/* 颜色：接受 #rgb/#rrggbb（大小写不限）→ '#rrggbb' 小写；非法抛 Error（err.field=传入名） */
function normalizeHex(hex, field) {
    var f = (typeof field === 'string' && field) ? field : 'hex';
    if (typeof hex !== 'string') {
        throw err(f, 'normalizeHex: ' + f + ' 必须为字符串');
    }
    var m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
    if (!m) {
        throw err(f, 'normalizeHex: ' + f + ' 必须为 #rgb 或 #rrggbb 十六进制颜色');
    }
    var d = m[1].toLowerCase();
    if (d.length === 3) {
        d = d[0] + d[0] + d[1] + d[1] + d[2] + d[2];
    }
    return '#' + d;
}

/* 显示文字：去首尾空格后非空返回原样；空返回 '宽×高'；非字符串抛 Error（err.field='text'） */
function displayTextOf(text, w, h) {
    if (typeof text !== 'string') {
        throw err('text', 'displayTextOf: text 必须为字符串');
    }
    var t = text.replace(/^\s+|\s+$/g, '');
    if (t) return t;
    return w + '×' + h;
}

/* 下载文件名：placeholder-800x600.png；非法尺寸走 parseSize 抛 width/height */
function buildPlaceholderName(w, h) {
    var s = parseSize(w, h);
    return 'placeholder-' + s.w + 'x' + s.h + '.png';
}

/* 字号：clamp(floor(min(w,h)/6), 12, 200)；canvas 字体走系统字体栈 */
function baseFontSize(w, h) {
    var s = Math.floor(Math.min(w, h) / 6);
    if (s < 12) s = 12;
    if (s > 200) s = 200;
    return s;
}

function fontOf(size) {
    return 'bold ' + size + 'px -apple-system, BlinkMacSystemFont, "PingFang SC", ' +
        '"Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif';
}

/* ============ 浏览器 UI ============ */
var BIG_FILE_WARN = 2 * 1024 * 1024;   /* 超过 2MB 提示文件较大 */

function init() {
    function $(id) { return document.getElementById(id); }
    var widthEl = $('ph-width'), heightEl = $('ph-height');
    var textEl = $('ph-text');
    var bgEl = $('ph-bg'), fgEl = $('ph-fg');
    var bgVal = $('ph-bg-val'), fgVal = $('ph-fg-val');
    var sizeErr = $('ph-size-err');
    var canvas = $('ph-canvas'), empty = $('ph-empty');
    var infoEl = $('ph-info'), warnEl = $('ph-warn');
    var dlBtn = $('ph-download'), urlBtn = $('ph-copy-url'), mdBtn = $('ph-copy-md');

    var lastSize = { w: 800, h: 600 };   /* 最近一次合法尺寸（非法输入时保留上次渲染） */
    var lastText = '800×600', lastBg = '#cccccc', lastFg = '#969696';

    function toast(msg) {
        var el = $('ph-toast');
        el.textContent = msg;
        el.className = 'show';
        setTimeout(function () { el.className = ''; }, 2200);
    }

    /* 读取并校验全部参数；失败返回 {error}，成功返回 {size, text, bg, fg} */
    function readParams() {
        var size;
        try {
            size = parseSize(widthEl.value, heightEl.value);
        } catch (e) {
            return { error: e, field: e.field };
        }
        var bg, fg;
        try { bg = normalizeHex(bgEl.value, 'bgColor'); }
        catch (e) { return { error: e, field: 'bgColor' }; }
        try { fg = normalizeHex(fgEl.value, 'textColor'); }
        catch (e) { return { error: e, field: 'textColor' }; }
        var text;
        try { text = displayTextOf(textEl.value, size.w, size.h); }
        catch (e) { return { error: e, field: 'text' }; }
        return { size: size, text: text, bg: bg, fg: fg };
    }

    /* 核心渲染管线：按宽高建 canvas → 底色填充 → 文字居中绘制（超宽 measureText 缩小） */
    function render(p) {
        var w = p.size.w, h = p.size.h;
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = p.bg;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = p.fg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var size = baseFontSize(w, h);
        ctx.font = fontOf(size);
        while (size > 12 && ctx.measureText(p.text).width > w * 0.92) {
            size = Math.max(12, size - 2);
            ctx.font = fontOf(size);
        }
        ctx.fillText(p.text, w / 2, h / 2);

        lastSize = p.size; lastText = p.text; lastBg = p.bg; lastFg = p.fg;
        empty.style.display = 'none';
        canvas.style.display = 'block';
        dlBtn.disabled = false;
        urlBtn.disabled = false;
        mdBtn.disabled = false;

        var name = buildPlaceholderName(w, h);
        infoEl.innerHTML = '尺寸 <b>' + w + ' × ' + h + '</b> · 文件名 <b>' + name + '</b> · <span id="ph-bytes">计算大小中…</span>';
        warnEl.style.display = 'none';
        canvas.toBlob(function (blob) {
            var bEl = document.getElementById('ph-bytes');
            if (!blob || !bEl) return;
            var kb = blob.size / 1024;
            bEl.textContent = 'PNG 约 ' + (kb >= 1024 ? (kb / 1024).toFixed(2) + ' MB' : kb.toFixed(1) + ' KB');
            if (blob.size > BIG_FILE_WARN) {
                warnEl.textContent = '当前尺寸生成的 PNG 超过 2MB（' + (blob.size / 1048576).toFixed(1) + 'MB），位图按像素生成，下载前请确认。';
                warnEl.style.display = 'block';
            }
        }, 'image/png');
    }

    function refresh() {
        var p = readParams();
        if (p.error) {
            var msg = (p.field === 'width' || p.field === 'height')
                ? '宽高必须为 1~4096 的整数（当前输入无效，已保留上次预览）'
                : '参数无效：' + p.error.message + '（已保留上次预览）';
            sizeErr.textContent = msg;
            sizeErr.style.display = 'block';
            return;
        }
        sizeErr.style.display = 'none';
        render(p);
    }

    function updateColorLabels() {
        bgVal.textContent = bgEl.value.toLowerCase();
        fgVal.textContent = fgEl.value.toLowerCase();
    }

    function copyText(text, okMsg) {
        function fallback() {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            var done = false;
            try { done = document.execCommand('copy'); } catch (e) { done = false; }
            document.body.removeChild(ta);
            toast(done ? okMsg : '复制失败：浏览器未授权剪贴板，请手动复制');
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(
                function () { toast(okMsg); },
                function () { fallback(); }
            );
        } else {
            fallback();
        }
    }

    widthEl.addEventListener('input', refresh);
    heightEl.addEventListener('input', refresh);
    textEl.addEventListener('input', refresh);
    bgEl.addEventListener('input', function () { updateColorLabels(); refresh(); });
    fgEl.addEventListener('input', function () { updateColorLabels(); refresh(); });

    dlBtn.addEventListener('click', function () {
        canvas.toBlob(function (blob) {
            if (!blob) { toast('导出失败，请重试'); return; }
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = buildPlaceholderName(lastSize.w, lastSize.h);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
            toast('已下载 ' + a.download);
        }, 'image/png');
    });

    urlBtn.addEventListener('click', function () {
        var url = canvas.toDataURL('image/png');
        copyText(url, 'Data URL 已复制（' + (url.length / 1024).toFixed(1) + ' KB，可直接贴进 <img src>）');
    });

    mdBtn.addEventListener('click', function () {
        var name = buildPlaceholderName(lastSize.w, lastSize.h);
        copyText('![' + lastText + '](' + name + ')', 'Markdown 图片引用已复制（先下载 PNG 再粘贴）');
    });

    updateColorLabels();
    refresh();
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else { init(); }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        parseSize: parseSize, normalizeHex: normalizeHex,
        displayTextOf: displayTextOf, buildPlaceholderName: buildPlaceholderName,
        baseFontSize: baseFontSize, MIN_DIM: MIN_DIM, MAX_DIM: MAX_DIM
    };
}

})();
