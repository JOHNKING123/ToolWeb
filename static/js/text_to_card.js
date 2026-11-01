/* 文字转图片卡片 - 纯前端文字排版分享卡片生成器（主文本/署名/模板/配色/字号/对齐/尺寸可调）
 * 数据只在浏览器里处理：零第三方依赖、无任何后端调用、无网络请求（脚本内零 fetch/XHR）。
 * 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 *   wrapLines(text, maxChars) -> string[]（先按 \n 分段，再按字符数 maxChars 切段；
 *                             text 非字符串抛 Error，err.field='text'；
 *                             maxChars 非正整数抛 Error，err.field='maxChars'）
 *   pickTemplate(key)         -> 模板对象（含 id；4 套：minimal/gradient/ink/paper，每套 ≥3 配色；
 *                             key 未知抛 Error，err.field='template'）
 *   cardSizeOf(ratio)         -> {w,h}（'1:1'→{1080,1080}，'4:5'→{1080,1350}；
 *                             非法抛 Error，err.field='ratio'）
 *   buildCardName(date)       -> 'card-20261101-094500.png'（Date 对象，本地时间；
 *                             非法抛 Error，err.field='date'）
 * 渲染管线（canvas）：按 cardSizeOf 建 canvas → 背景/渐变（模板+配色）→ 纯函数 wrapLines 分行 →
 *   文字绘制（measureText 超宽自动缩小；左/中/右对齐；可选署名）→ 预览＋导出 PNG。
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

/* 分行：先按 \n 分段（含空行），再把每段按字符数切为 maxChars 一块；中文/英文一律按字符计数 */
function wrapLines(text, maxChars) {
    if (typeof text !== 'string') {
        throw err('text', 'wrapLines: text 必须为字符串');
    }
    if (typeof maxChars !== 'number' || !isFinite(maxChars) ||
            Math.floor(maxChars) !== maxChars || maxChars < 1) {
        throw err('maxChars', 'wrapLines: maxChars 必须为正整数');
    }
    var paras = text.split('\n');
    var lines = [];
    var i, j;
    for (i = 0; i < paras.length; i++) {
        var p = paras[i];
        if (p.length === 0) { lines.push(''); continue; }
        for (j = 0; j < p.length; j += maxChars) {
            lines.push(p.slice(j, j + maxChars));
        }
    }
    return lines;
}

/* 4 套模板：minimal 极简白 / gradient 渐变流彩 / ink 墨夜 / paper 纸信；每套 ≥3 配色 */
var TEMPLATES = {
    minimal: {
        id: 'minimal', name: '极简白', style: 'solid',
        palettes: [
            { name: '米白',   bg: '#f8f7f2', bg2: '#f8f7f2', fg: '#1f2937', accent: '#1f2937' },
            { name: '素黑',   bg: '#111827', bg2: '#111827', fg: '#f9fafb', accent: '#60a5fa' },
            { name: '薄荷',   bg: '#e6f4ef', bg2: '#e6f4ef', fg: '#064e3b', accent: '#10b981' },
            { name: '樱粉',   bg: '#fdf2f4', bg2: '#fdf2f4', fg: '#831843', accent: '#ec4899' }
        ]
    },
    gradient: {
        id: 'gradient', name: '渐变流彩', style: 'gradient',
        palettes: [
            { name: '晨曦',   bg: '#ff9a9e', bg2: '#a18cd1', fg: '#ffffff', accent: '#ffffff' },
            { name: '深海',   bg: '#0f2027', bg2: '#2c5364', fg: '#f0f9ff', accent: '#38bdf8' },
            { name: '暮紫',   bg: '#667eea', bg2: '#764ba2', fg: '#ffffff', accent: '#fef3c7' },
            { name: '青橘',   bg: '#11998e', bg2: '#f2994a', fg: '#ffffff', accent: '#fff7ed' }
        ]
    },
    ink: {
        id: 'ink', name: '墨夜', style: 'frame',
        palettes: [
            { name: '墨黑',   bg: '#0b0b0d', bg2: '#0b0b0d', fg: '#f5f5f4', accent: '#d6d3d1' },
            { name: '藏青',   bg: '#101828', bg2: '#101828', fg: '#e0eaff', accent: '#60a5fa' },
            { name: '绛紫',   bg: '#1b1035', bg2: '#1b1035', fg: '#f5e6ff', accent: '#c084fc' },
            { name: '竹绿',   bg: '#0c1f16', bg2: '#0c1f16', fg: '#d9fbe8', accent: '#34d399' }
        ]
    },
    paper: {
        id: 'paper', name: '纸信', style: 'sidebar',
        palettes: [
            { name: '宣纸',   bg: '#fbf8f1', bg2: '#fbf8f1', fg: '#3f3f3f', accent: '#b45309' },
            { name: '青瓷',   bg: '#eef6f5', bg2: '#eef6f5', fg: '#164e4a', accent: '#0d9488' },
            { name: '黛蓝',   bg: '#eef2f7', bg2: '#eef2f7', fg: '#1e3a5f', accent: '#1d4ed8' },
            { name: '赭石',   bg: '#faf5f0', bg2: '#faf5f0', fg: '#78350f', accent: '#c2410c' }
        ]
    }
};

var TEMPLATE_ORDER = ['minimal', 'gradient', 'ink', 'paper'];

/* 取模板：未知 key 抛 Error（err.field='template'），不静默回退 */
function pickTemplate(key) {
    if (typeof key !== 'string' || !TEMPLATES[key]) {
        throw err('template', 'pickTemplate: 未知模板 "' + String(key) + '"（可选 minimal/gradient/ink/paper）');
    }
    return TEMPLATES[key];
}

/* 尺寸档：1:1→1080×1080、4:5→1080×1350；非法抛 Error（err.field='ratio'） */
var CARD_SIZES = {
    '1:1': { w: 1080, h: 1080 },
    '4:5': { w: 1080, h: 1350 }
};
function cardSizeOf(ratio) {
    if (typeof ratio !== 'string' || !CARD_SIZES[ratio]) {
        throw err('ratio', 'cardSizeOf: ratio 必须为 "1:1" 或 "4:5"');
    }
    var s = CARD_SIZES[ratio];
    return { w: s.w, h: s.h };
}

/* 下载文件名：card-YYYYMMDD-HHmmss.png（本地时间）；非 Date 抛 Error（err.field='date'） */
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function buildCardName(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) {
        throw err('date', 'buildCardName: date 必须为有效 Date 对象');
    }
    return 'card-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
        '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()) + '.png';
}

/* canvas 字体走系统字体栈 */
function fontOf(size) {
    return size + 'px -apple-system, BlinkMacSystemFont, "PingFang SC", ' +
        '"Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Source Han Sans SC", sans-serif';
}

/* ============ 浏览器 UI ============ */
var BASE_FONT = { small: 44, medium: 64, large: 88 };   /* 以 1080 宽为基准的字号三档 */
var MIN_FONT = 22;

function init() {
    function $(id) { return document.getElementById(id); }
    var textEl = $('tc-text'), countEl = $('tc-count'), authorEl = $('tc-author');
    var tplEl = $('tc-template'), palEl = $('tc-palette');
    var canvas = $('tc-canvas'), empty = $('tc-empty');
    var infoEl = $('tc-info'), errEl = $('tc-err');
    var dlBtn = $('tc-download'), urlBtn = $('tc-copy-url');

    function toast(msg) {
        var el = $('tc-toast');
        el.textContent = msg;
        el.className = 'show';
        setTimeout(function () { el.className = ''; }, 2200);
    }

    function radioVal(name) {
        var r = document.querySelector('input[name="' + name + '"]:checked');
        return r ? r.value : null;
    }

    /* 模板下拉联动：重建配色选项（每套 ≥3） */
    function rebuildPalettes() {
        var t;
        try { t = pickTemplate(tplEl.value); }
        catch (e) { t = pickTemplate('minimal'); tplEl.value = 'minimal'; }
        palEl.innerHTML = '';
        t.palettes.forEach(function (p, i) {
            var o = document.createElement('option');
            o.value = String(i);
            o.textContent = p.name;
            palEl.appendChild(o);
        });
        palEl.value = '0';
    }

    /* 读取并校验全部参数；失败返回 {error} */
    function readParams() {
        var text = String(textEl.value || '');
        if (!text.replace(/\s/g, '')) {
            return { error: new Error('请先输入主文本（纯文字排版卡片，无文字无法生成）') };
        }
        if (text.length > 500) {
            return { error: new Error('主文本超过 500 字上限（当前 ' + text.length + ' 字）') };
        }
        var tpl, size, palIdx, align, ratio;
        try { tpl = pickTemplate(tplEl.value); }
        catch (e) { return { error: e }; }
        palIdx = parseInt(palEl.value, 10);
        if (isNaN(palIdx) || palIdx < 0 || palIdx >= tpl.palettes.length) {
            return { error: new Error('配色选择无效，已重置为该模板第一套配色') };
        }
        var sizeKey = radioVal('tc-size') || 'medium';
        var base = BASE_FONT[sizeKey] || BASE_FONT.medium;
        align = radioVal('tc-align') || 'center';
        if (align !== 'left' && align !== 'center' && align !== 'right') {
            return { error: new Error('对齐方式无效') };
        }
        try { size = cardSizeOf(radioVal('tc-ratio') || '1:1'); }
        catch (e) { return { error: e }; }
        return {
            text: text, author: String(authorEl.value || '').replace(/^\s+|\s+$/g, ''),
            tpl: tpl, palette: tpl.palettes[palIdx],
            baseSize: base, align: align, size: size
        };
    }

    /* 核心渲染管线：背景/渐变 → 纯函数 wrapLines 分行 → 文字绘制（超宽自动缩小） */
    function render(p) {
        var w = p.size.w, h = p.size.h, pal = p.palette;
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');

        /* ① 背景/渐变（按模板 style） */
        if (p.tpl.style === 'gradient') {
            var g = ctx.createLinearGradient(0, 0, w, h);
            g.addColorStop(0, pal.bg);
            g.addColorStop(1, pal.bg2);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
        } else {
            ctx.fillStyle = pal.bg;
            ctx.fillRect(0, 0, w, h);
        }
        if (p.tpl.style === 'frame') {
            ctx.strokeStyle = pal.accent;
            ctx.lineWidth = 6;
            ctx.strokeRect(36, 36, w - 72, h - 72);
        } else if (p.tpl.style === 'sidebar') {
            ctx.fillStyle = pal.accent;
            ctx.fillRect(64, 96, 14, h - 192);
        } else if (p.tpl.style === 'solid') {
            ctx.fillStyle = pal.accent;
            ctx.fillRect(96, h - 120, 160, 10);
        }

        /* ② 分行：按估计字宽给出每行最多字符数 */
        var scale = w / 1080;
        var fontSize = Math.round(p.baseSize * scale);
        var padX = Math.round(110 * scale);
        var contentW = w - padX * 2;
        var maxChars = Math.max(6, Math.floor(contentW / fontSize));
        var lines = wrapLines(p.text, maxChars);

        /* ③ 文字绘制：超宽 measureText 循环缩小到适配 */
        ctx.fillStyle = pal.fg;
        ctx.textBaseline = 'top';
        ctx.textAlign = p.align;
        var x = (p.align === 'left') ? padX : (p.align === 'right' ? w - padX : w / 2);
        var fits = false;
        var fs = fontSize;
        while (!fits && fs > Math.round(MIN_FONT * scale)) {
            ctx.font = fontOf(fs);
            fits = true;
            for (var i = 0; i < lines.length; i++) {
                if (lines[i] && ctx.measureText(lines[i]).width > contentW) { fits = false; break; }
            }
            if (!fits) fs -= 2;
        }
        var lineH = Math.round(fs * 1.55);
        var hasAuthor = !!p.author;
        var authorH = hasAuthor ? Math.round(fs * 1.1) : 0;
        var totalH = lines.length * lineH + authorH;
        var y = Math.round((h - totalH) / 2);

        for (var k = 0; k < lines.length; k++) {
            ctx.fillText(lines[k], x, y + k * lineH);
        }
        /* ④ 署名/出处（可选）：右下小字 */
        if (hasAuthor) {
            var aSize = Math.round(fs * 0.55);
            ctx.font = fontOf(aSize);
            ctx.textAlign = 'right';
            ctx.fillText('—— ' + p.author, w - padX, y + lines.length * lineH + Math.round(fs * 0.35));
        }

        empty.style.display = 'none';
        canvas.style.display = 'block';
        dlBtn.disabled = false;
        urlBtn.disabled = false;
        infoEl.innerHTML = '尺寸 <b>' + w + ' × ' + h + '</b> · 模板 <b>' + p.tpl.name + '</b> · 配色 <b>' +
            pal.name + '</b> · ' + lines.length + ' 行';
        errEl.style.display = 'none';
    }

    function refresh() {
        var p = readParams();
        if (p.error) {
            errEl.textContent = p.error.message + '（已保留上次预览）';
            errEl.style.display = 'block';
            if (canvas.style.display === 'block') return;
            empty.style.display = 'block';
            canvas.style.display = 'none';
            dlBtn.disabled = true;
            urlBtn.disabled = true;
            infoEl.innerHTML = '';
            return;
        }
        errEl.style.display = 'none';
        try { render(p); }
        catch (e) {
            errEl.textContent = '渲染失败：' + e.message;
            errEl.style.display = 'block';
        }
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

    function updateCount() {
        var n = textEl.value.length;
        countEl.textContent = n + ' / 500';
        countEl.style.color = n > 500 ? '#b91c1c' : '#6b7280';
    }

    /* 模板选项 */
    TEMPLATE_ORDER.forEach(function (k) {
        var t = pickTemplate(k);
        var o = document.createElement('option');
        o.value = t.id;
        o.textContent = t.name;
        tplEl.appendChild(o);
    });
    tplEl.value = 'minimal';
    rebuildPalettes();

    textEl.addEventListener('input', function () { updateCount(); refresh(); });
    authorEl.addEventListener('input', refresh);
    tplEl.addEventListener('change', function () { rebuildPalettes(); refresh(); });
    palEl.addEventListener('change', refresh);
    document.querySelectorAll('input[name="tc-size"]').forEach(function (r) { r.addEventListener('change', refresh); });
    document.querySelectorAll('input[name="tc-align"]').forEach(function (r) { r.addEventListener('change', refresh); });
    document.querySelectorAll('input[name="tc-ratio"]').forEach(function (r) { r.addEventListener('change', refresh); });

    dlBtn.addEventListener('click', function () {
        canvas.toBlob(function (blob) {
            if (!blob) { toast('导出失败，请重试'); return; }
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = buildCardName(new Date());
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
            toast('已下载 ' + a.download);
        }, 'image/png');
    });

    urlBtn.addEventListener('click', function () {
        var url = canvas.toDataURL('image/png');
        copyText(url, 'PNG Data URL 已复制（' + (url.length / 1024).toFixed(1) + ' KB，可直接贴进 <img src>）');
    });

    updateCount();
    refresh();
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else { init(); }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        wrapLines: wrapLines, pickTemplate: pickTemplate,
        cardSizeOf: cardSizeOf, buildCardName: buildCardName,
        TEMPLATES: TEMPLATES, TEMPLATE_ORDER: TEMPLATE_ORDER, CARD_SIZES: CARD_SIZES
    };
}

})();
