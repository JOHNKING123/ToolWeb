/* SVG 压缩优化器 - 纯前端 SVG 压缩
 *
 * 纯逻辑层（SC-CORE）：字节数/压缩率计算、SVGO 配置构建（三档预设＋清理项 toggles）、
 *   内置降级清理（去注释/去 metadata/去编辑器命名空间/去空属性/去默认属性/数值精度压缩/空白折叠）、
 *   输出文件名规则 —— 无 DOM，可在 Node 下单测。
 * DOM 层：文件队列（拖拽/点击上传＋粘贴代码双入口）、SVGO 浏览器构建 CDN 懒加载
 *   （jsdelivr 首选 → npmmirror 兜底；全部失败时降级为内置轻量清理并明确标注）、
 *   DOMParser 解析校验（失败标红给原因、不中断队列）、原图/优化后并排预览＋缩放、
 *   复制代码＋下载 .svg。
 * SVG 内容只在浏览器本地处理，不上传任何服务器。
 */
(function () {
'use strict';

/*<SC-CORE-BEGIN>*/
/* ---------------- 纯逻辑：体积与比率 ---------------- */

/* UTF-8 字节数（字符串真实体积） */
function scByteSize(s) {
    s = String(s == null ? '' : s);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
    return unescape(encodeURIComponent(s)).length;
}

/* 体积展示：B / KB / MB */
function scFmtSize(n) {
    n = Number(n);
    if (!isFinite(n) || n < 0) return '-';
    if (n === 0) return '0 B';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
}

/**
 * 压缩率（节省百分比，保留 1 位小数）。
 * @returns {number|null} before<=0 或非法输入返回 null；负数表示体积变大
 */
function scRatio(before, after) {
    before = Number(before); after = Number(after);
    if (!isFinite(before) || !isFinite(after) || before <= 0 || after < 0) return null;
    return Math.round((1 - after / before) * 1000) / 10;
}

/* ---------------- 纯逻辑：数值精度压缩 ---------------- */

/**
 * 把字符串中所有十进制小数按指定精度四舍五入，并去掉无意义的 0。
 * 整数、科学计数法以外的数字不受影响（hex 颜色 #ffffff 无小数点，不受影响）。
 * @param {number} precision 0~6，越界钳制
 */
function scRoundNumbers(s, precision) {
    var p = Math.round(Number(precision));
    if (!isFinite(p)) p = 3;
    if (p < 0) p = 0;
    if (p > 6) p = 6;
    return String(s).replace(/-?\d+\.\d+(?:[eE][+-]?\d+)?/g, function (m) {
        var n = parseFloat(m);
        if (!isFinite(n)) return m;
        var r = Number(n.toFixed(p));
        if (r === 0) return '0';
        var t = String(r);
        if (t.indexOf('.') !== -1) {
            t = t.replace(/0+$/, '').replace(/\.$/, '');
            if (t.charAt(0) === '0' && t.charAt(1) === '.') t = t.slice(1);
            if (t.charAt(0) === '-' && t.charAt(1) === '0' && t.charAt(2) === '.') t = '-' + t.slice(2);
        }
        return t === '-0' ? '0' : t;
    });
}

/* ---------------- 纯逻辑：内置降级清理（CDN 不可用时） ---------------- */

/**
 * 内置轻量清理：无 SVGO 引擎时用，保证压缩仍可用。
 * opts: { precision, comments, metadata, editorNS, emptyAttrs, defaultAttrs }，默认全开
 */
function scFallbackOptimize(svg, opts) {
    opts = opts || {};
    var p = opts.precision == null ? 3 : opts.precision;
    var s = String(svg == null ? '' : svg);
    if (opts.comments !== false) s = s.replace(/<!--[\s\S]*?-->/g, '');
    if (opts.metadata !== false) s = s.replace(/<metadata[\s\S]*?<\/metadata\s*>/gi, '').replace(/<metadata\b[^>]*\/>/gi, '');
    if (opts.editorNS !== false) {
        /* 先删编辑器命名空间声明，再删其属性（顺序不能反） */
        s = s.replace(/\s+xmlns:(inkscape|sodipodi|rdfs?|cc|dc)="[^"]*"/gi, '');
        s = s.replace(/\s+(inkscape|sodipodi):[a-zA-Z][\w:.-]*="[^"]*"/gi, '');
    }
    if (opts.emptyAttrs !== false) s = s.replace(/\s+[\w:.-]+=""/g, '');
    if (opts.defaultAttrs !== false) {
        s = s.replace(/\s+fill="#000000"/gi, '')
             .replace(/\s+fill="#000"/gi, '')
             .replace(/\s+stroke="none"/gi, '')
             .replace(/\s+opacity="1(\.0+)?"/gi, '')
             .replace(/\s+fill-opacity="1(\.0+)?"/gi, '')
             .replace(/\s+stroke-opacity="1(\.0+)?"/gi, '');
    }
    s = scRoundNumbers(s, p);
    /* 标签间空白折叠；文本节点内部连续空白压成一个空格 */
    s = s.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim();
    return s;
}

/* ---------------- 纯逻辑：SVGO 配置构建 ---------------- */

/* 预设基础插件集（SVGO v3 插件名；不含数值精度插件，它由滑块单独注入） */
var SC_PRESET_PLUGINS = {
    /* 无损：只做不影响渲染的整理；默认保留 viewBox（保响应式缩放） */
    lossless: [
        'removeDoctype', 'removeXMLProcInst',
        'removeEmptyContainers', 'collapseGroups', 'minifyStyles'
    ],
    /* 轻度：无损 ＋ 去元数据/编辑器痕迹/冗余属性/未用命名空间 */
    balanced: [
        'removeDoctype', 'removeXMLProcInst',
        'removeMetadata', 'removeEditorsNSData', 'removeEmptyAttrs',
        'removeEmptyContainers', 'removeUnusedNS', 'removeUnknownsAndDefaults',
        'collapseGroups', 'minifyStyles', 'cleanupIds'
    ],
    /* 激进：轻度 ＋ 去 viewBox/title/desc/隐藏元素/无用 defs ＋ 多遍 */
    aggressive: [
        'removeDoctype', 'removeXMLProcInst',
        'removeMetadata', 'removeEditorsNSData', 'removeEmptyAttrs',
        'removeEmptyContainers', 'removeUnusedNS', 'removeUnknownsAndDefaults',
        'collapseGroups', 'minifyStyles', 'cleanupIds',
        'removeViewBox', 'removeTitle', 'removeDesc',
        'removeHiddenElems', 'removeUselessDefs'
    ]
};

/* 清理项 toggles 与 SVGO 插件的映射：toggle 关闭时从预设中移除，打开时强制加入 */
var SC_TOGGLE_PLUGINS = {
    comments: 'removeComments',
    metadata: 'removeMetadata',
    editorNS: 'removeEditorsNSData',
    emptyAttrs: 'removeEmptyAttrs',
    defaultAttrs: 'removeUnknownsAndDefaults'
};

/**
 * 构建 SVGO optimize() 配置。
 * @param {string} preset 'lossless'|'balanced'|'aggressive'
 * @param {object} opts { precision, comments, metadata, editorNS, emptyAttrs, defaultAttrs }
 * @returns {object|null} SVGO 配置；未知预设返回 null
 */
function scSvgoConfig(preset, opts) {
    if (!SC_PRESET_PLUGINS[preset]) return null;
    opts = opts || {};
    var set = {};
    SC_PRESET_PLUGINS[preset].forEach(function (n) { set[n] = true; });
    Object.keys(SC_TOGGLE_PLUGINS).forEach(function (k) {
        var pn = SC_TOGGLE_PLUGINS[k];
        if (opts[k] === false) delete set[pn];
        else if (opts[k] === true) set[pn] = true;
    });
    var p = Math.round(Number(opts.precision));
    if (!isFinite(p)) p = 3;
    if (p < 0) p = 0;
    if (p > 6) p = 6;
    var plugins = Object.keys(set).sort().map(function (n) { return { name: n }; });
    plugins.push({ name: 'cleanupNumericValues', params: { floatPrecision: p, defaultPx: true } });
    return {
        multipass: preset === 'aggressive',
        plugins: plugins,
        js2svg: { pretty: false },
        path: 'input.svg'
    };
}

/* ---------------- 纯逻辑：下载文件名 ---------------- */

/* 原名 base.min.svg；无扩展名时补 .svg */
function scOutName(fileName) {
    var base = String(fileName == null ? 'image' : fileName).replace(/\.(svg|min\.svg)$/i, '');
    if (!base) base = 'image';
    return base + '.min.svg';
}

/* 同名去重：队列内文件名冲突追加 -2/-3… */
function scUniqueName(name, used) {
    if (used.indexOf(name) === -1) return name;
    var dot = name.lastIndexOf('.');
    var stem = dot > 0 ? name.slice(0, dot) : name;
    var ext = dot > 0 ? name.slice(dot) : '';
    var i = 2, cand = stem + '-' + i + ext;
    while (used.indexOf(cand) !== -1) { i++; cand = stem + '-' + i + ext; }
    return cand;
}

/* 输入校验：svg 文件或 image/svg+xml */
function scAcceptableInput(name, type) {
    if (type === 'image/svg+xml') return true;
    return /\.svg$/i.test(String(name || ''));
}

/* 压缩率 chip 文案与配色等级 */
function scRatioChip(ratio) {
    if (ratio === null || ratio === undefined || !isFinite(ratio)) return { text: '-', cls: 'sc-chip-none' };
    var t = (ratio > 0 ? '-' : '+') + Math.abs(ratio).toFixed(1) + '%';
    if (ratio >= 30) return { text: t, cls: 'sc-chip-good' };
    if (ratio > 0) return { text: t, cls: 'sc-chip-mid' };
    return { text: t, cls: 'sc-chip-bad' };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        scByteSize: scByteSize,
        scFmtSize: scFmtSize,
        scRatio: scRatio,
        scRoundNumbers: scRoundNumbers,
        scFallbackOptimize: scFallbackOptimize,
        scSvgoConfig: scSvgoConfig,
        scOutName: scOutName,
        scUniqueName: scUniqueName,
        scAcceptableInput: scAcceptableInput,
        scRatioChip: scRatioChip,
        SC_PRESET_PLUGINS: SC_PRESET_PLUGINS,
        SC_TOGGLE_PLUGINS: SC_TOGGLE_PLUGINS
    };
}
/*<SC-CORE-END>*/

if (typeof window === 'undefined') return;

/* ---------------- SVGO 浏览器构建 CDN 懒加载（jsdelivr 首选 → npmmirror 兜底） ---------------- */
var SC_SVGO_CDNS = [
    'https://cdn.jsdelivr.net/npm/svgo@3.3.3/dist/svgo.browser.js',
    'https://registry.npmmirror.com/svgo/3.3.3/files/dist/svgo.browser.js'
];
var SC_SVGO_TIMEOUT = 25000;
var scSvgoMod = null;   /* { optimize, src } | null */
var scSvgoTried = false;

function scLoadSvgo() {
    if (scSvgoMod) return Promise.resolve(scSvgoMod);
    if (scSvgoTried) return Promise.reject(new Error('cdn failed'));
    scSvgoTried = true;
    var idx = 0;
    function tryNext() {
        if (idx >= SC_SVGO_CDNS.length) return Promise.reject(new Error('cdn failed'));
        var src = SC_SVGO_CDNS[idx++];
        var timer = null;
        var p = Promise.race([
            import(src).then(function (mod) {
                if (mod && typeof mod.optimize === 'function') {
                    scSvgoMod = { optimize: mod.optimize, src: src };
                    return scSvgoMod;
                }
                throw new Error('bad module');
            }),
            new Promise(function (_, rej) {
                timer = setTimeout(function () { rej(new Error('timeout')); }, SC_SVGO_TIMEOUT);
            })
        ]);
        return p.then(function (r) { clearTimeout(timer); return r; })
                .catch(function () { clearTimeout(timer); return tryNext(); });
    }
    return tryNext();
}

/* ---------------- 通用小工具 ---------------- */
function $(id) { return document.getElementById(id); }
function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function toast(msg) {
    var el = $('sc-toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2800);
}
function downloadText(text, name) {
    var blob = new Blob([text], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 800);
}
function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

/* ---------------- 状态 ---------------- */
var S = {
    items: [],     /* [{id,name,src,srcSize,status,err,result,resultSize,ratio,engine,origUrl,optUrl}] */
    seq: 0,
    busy: false,
    engine: 'pending',  /* pending | svgo | fallback */
    engineSrc: ''
};

function setBusy(b) {
    S.busy = b;
    $('sc-start-btn').disabled = b;
    $('sc-clear-btn').disabled = b;
}

function setEngineUI() {
    var el = $('sc-engine-status');
    if (S.engine === 'svgo') {
        el.innerHTML = '<span class="sc-eng-ok">SVGO 引擎已就绪</span>' +
            '<span class="sc-eng-sub">来源：' + escHtml(S.engineSrc.replace('https://', '')) + ' · 本地优化，内容不上传</span>';
    } else if (S.engine === 'fallback') {
        el.innerHTML = '<span class="sc-eng-warn">已降级：内置轻量清理</span>' +
            '<span class="sc-eng-sub">CDN 加载 SVGO 失败（离线/网络不可达），已自动切换内置清理：去注释 / 去多余空白 / 压缩数值精度，仍可正常压缩</span>';
    } else {
        el.innerHTML = '<span class="sc-eng-idle">引擎待加载</span>' +
            '<span class="sc-eng-sub">点击「开始压缩」时懒加载 SVGO（jsdelivr → npmmirror）；失败自动降级</span>';
    }
}

/* ---------------- 配置读取 ---------------- */
function readOptions() {
    var preset = 'balanced';
    var radios = document.getElementsByName('sc-preset');
    for (var i = 0; i < radios.length; i++) if (radios[i].checked) preset = radios[i].value;
    var precision = parseInt($('sc-precision').value, 10);
    function tg(id) { return $(id).checked; }
    return {
        preset: preset,
        precision: precision,
        comments: tg('sc-tg-comments'),
        metadata: tg('sc-tg-metadata'),
        editorNS: tg('sc-tg-editorns'),
        emptyAttrs: tg('sc-tg-emptyattrs'),
        defaultAttrs: tg('sc-tg-defaultattrs')
    };
}

/* ---------------- SVG 解析校验（DOMParser） ---------------- */
function parseSvg(src) {
    var doc;
    try {
        doc = new DOMParser().parseFromString(src, 'image/svg+xml');
    } catch (e) {
        return { ok: false, reason: '解析异常：' + (e && e.message || '未知错误') };
    }
    var err = doc.getElementsByTagName('parsererror');
    if (err && err.length) {
        var msg = (err[0].textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
        return { ok: false, reason: 'SVG 解析失败' + (msg ? '：' + msg : '') };
    }
    var root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== 'svg') {
        return { ok: false, reason: '根元素不是 <svg>，不是有效的 SVG 文档' };
    }
    return { ok: true };
}

/* ---------------- 压缩执行 ---------------- */
function optimizeOne(it, options) {
    var check = parseSvg(it.src);
    if (!check.ok) {
        it.status = 'error'; it.err = check.reason;
        return Promise.resolve();
    }
    var engineP;
    if (S.engine === 'svgo') {
        engineP = Promise.resolve(scSvgoMod);
    } else if (S.engine === 'fallback') {
        engineP = Promise.resolve(null);
    } else {
        setEngineUI();
        engineP = scLoadSvgo().then(function (mod) {
            S.engine = 'svgo'; S.engineSrc = mod.src;
            return mod;
        }).catch(function () {
            S.engine = 'fallback';
            return null;
        }).then(function (mod) { setEngineUI(); return mod; });
    }
    return engineP.then(function (mod) {
        var out;
        if (mod) {
            var cfg = scSvgoConfig(options.preset, options);
            var res = mod.optimize(it.src, cfg);
            if (!res || typeof res.data !== 'string') throw new Error('svgo 返回异常');
            out = res.data;
            it.engine = 'svgo';
        } else {
            out = scFallbackOptimize(it.src, options);
            it.engine = 'fallback';
        }
        var check2 = parseSvg(out);
        if (!check2.ok) throw new Error('优化后 SVG 解析失败：' + check2.reason);
        it.result = out;
        it.resultSize = scByteSize(out);
        it.ratio = scRatio(it.srcSize, it.resultSize);
        if (it.origUrl) URL.revokeObjectURL(it.origUrl);
        if (it.optUrl) URL.revokeObjectURL(it.optUrl);
        it.origUrl = URL.createObjectURL(new Blob([it.src], { type: 'image/svg+xml' }));
        it.optUrl = URL.createObjectURL(new Blob([out], { type: 'image/svg+xml' }));
        it.status = 'done';
    }).catch(function (e) {
        it.status = 'error';
        it.err = e && e.message ? e.message : '压缩失败';
    });
}

function runBatch() {
    if (S.busy) return;
    if (!S.items.length) { toast('请先添加 SVG（上传或粘贴代码）'); return; }
    var options = readOptions();
    if (!scSvgoConfig(options.preset, options)) { toast('预设无效'); return; }
    S.busy = true; setBusy(true);
    $('sc-engine-status').innerHTML = '<span class="sc-eng-idle">正在加载 SVGO 引擎…</span>' +
        '<span class="sc-eng-sub">首次压缩时从 CDN 懒加载（约 900KB，仅一次）</span>';
    var done = 0, total = S.items.length;
    refreshSummary(done, total);
    (function next(i) {
        if (i >= S.items.length) { setBusy(false); refreshSummary(done, total); return; }
        var it = S.items[i];
        it.status = 'run';
        renderList(); refreshSummary(done, total);
        optimizeOne(it, options).then(function () {
            done++;
            renderList(); refreshSummary(done, total);
            return tick();
        }).then(function () { next(i + 1); });
    })(0);
}

/* ---------------- 队列 ---------------- */
function pushItem(name, src, srcSize) {
    var used = S.items.map(function (it) { return it.dlName; });
    var dlName = scUniqueName(scOutName(name), used);
    S.items.push({
        id: ++S.seq, name: name, dlName: dlName,
        src: src, srcSize: srcSize,
        status: 'wait', err: '',
        result: '', resultSize: 0, ratio: null, engine: '',
        origUrl: null, optUrl: null
    });
}

function readFileText(file) {
    if (file.text) return file.text();
    return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { resolve(String(fr.result)); };
        fr.onerror = function () { reject(new Error('读取文件失败')); };
        fr.readAsText(file);
    });
}

function addFiles(fileList) {
    var okFiles = [], skipped = 0;
    for (var i = 0; i < fileList.length; i++) {
        var f = fileList[i];
        if (scAcceptableInput(f.name, f.type)) okFiles.push(f);
        else skipped++;
    }
    if (skipped > 0) toast('已跳过 ' + skipped + ' 个非 SVG 文件');
    (function next(i) {
        if (i >= okFiles.length) { renderList(); refreshSummary(); return; }
        var f = okFiles[i];
        readFileText(f).then(function (text) {
            if (!text || !text.trim()) { toast('「' + f.name + '」是空文件，已跳过'); }
            else pushItem(f.name, text, f.size || scByteSize(text));
            renderList(); refreshSummary();
            next(i + 1);
        }).catch(function () {
            toast('读取「' + f.name + '」失败，已跳过');
            next(i + 1);
        });
    })(0);
}

function addPasted() {
    var ta = $('sc-paste');
    var text = ta.value;
    if (!text || !text.trim()) { toast('请先粘贴 SVG 代码'); return; }
    S.seq++;
    pushItem('粘贴代码-' + S.seq + '.svg', text, scByteSize(text));
    ta.value = '';
    renderList(); refreshSummary();
    toast('已加入队列');
}

function removeItem(id) {
    for (var i = 0; i < S.items.length; i++) {
        if (S.items[i].id === id) {
            var it = S.items[i];
            if (it.origUrl) URL.revokeObjectURL(it.origUrl);
            if (it.optUrl) URL.revokeObjectURL(it.optUrl);
            S.items.splice(i, 1);
            break;
        }
    }
    renderList(); refreshSummary();
}

function clearAll() {
    S.items.forEach(function (it) {
        if (it.origUrl) URL.revokeObjectURL(it.origUrl);
        if (it.optUrl) URL.revokeObjectURL(it.optUrl);
    });
    S.items = [];
    setBusy(false);
    renderList(); refreshSummary();
}

function copyResult(id) {
    for (var i = 0; i < S.items.length; i++) {
        var it = S.items[i];
        if (it.id === id && it.result) {
            var done = function () { toast('已复制优化后的 SVG 代码'); };
            var fail = function () { toast('复制失败，请手动全选复制'); };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(it.result).then(done, fail);
            } else {
                var ta = document.createElement('textarea');
                ta.value = it.result;
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy') ? done() : fail(); }
                catch (e) { fail(); }
                ta.remove();
            }
            return;
        }
    }
}

function downloadOne(id) {
    for (var i = 0; i < S.items.length; i++) {
        var it = S.items[i];
        if (it.id === id && it.result) {
            downloadText(it.result, it.dlName);
            toast('已下载 ' + it.dlName);
            return;
        }
    }
}

/* ---------------- 渲染 ---------------- */
function statusText(it) {
    if (it.status === 'wait') return '待处理';
    if (it.status === 'run') return '压缩中…';
    if (it.status === 'done') return '压缩完成';
    if (it.status === 'error') return '失败：' + it.err;
    return '';
}

function chipHtml(it) {
    if (it.status !== 'done') return '';
    var chip = scRatioChip(it.ratio);
    return '<span class="sc-chip sc-chip-size">' + escHtml(scFmtSize(it.srcSize)) + ' → ' + escHtml(scFmtSize(it.resultSize)) + '</span>' +
        '<span class="sc-chip ' + chip.cls + '">压缩率 ' + escHtml(chip.text) + '</span>' +
        '<span class="sc-chip ' + (it.engine === 'svgo' ? 'sc-chip-svgo' : 'sc-chip-fb') + '">' +
        (it.engine === 'svgo' ? 'SVGO 引擎' : '降级清理') + '</span>';
}

function renderList() {
    var box = $('sc-list');
    if (!S.items.length) {
        box.innerHTML = '<div class="sc-empty">队列是空的 — 把 .svg 文件拖到上方，或粘贴 SVG 代码加入</div>';
        return;
    }
    var html = '';
    S.items.forEach(function (it) {
        var cls = it.status === 'done' ? ' sc-done' : it.status === 'error' ? ' sc-error' : '';
        html += '<div class="sc-row' + cls + '" data-id="' + it.id + '">' +
            '<div class="sc-row-head">' +
            '<div class="sc-name"><span>' + escHtml(it.name) + '</span></div>' +
            chipHtml(it) +
            '<button type="button" class="sc-icon-btn" data-del="' + it.id + '" title="移除"' +
            (S.busy ? ' disabled' : '') + '><i class="material-icons">close</i></button>' +
            '</div>';
        if (it.status === 'error') {
            html += '<div class="sc-errmsg"><i class="material-icons">error_outline</i>' + escHtml(it.err) + '</div>';
        }
        if (it.status === 'done') {
            html += '<div class="sc-pp">' +
                '<div class="sc-pp-item"><div class="sc-pp-label">原图 <span class="sc-pp-size">' + escHtml(scFmtSize(it.srcSize)) + '</span></div>' +
                '<div class="sc-pp-box"><img class="sc-pp-img" data-zoom="' + it.id + '" src="' + it.origUrl + '" alt="原图预览" loading="lazy"></div></div>' +
                '<div class="sc-pp-item"><div class="sc-pp-label">优化后 <span class="sc-pp-size">' + escHtml(scFmtSize(it.resultSize)) + '</span></div>' +
                '<div class="sc-pp-box"><img class="sc-pp-img" data-zoom="' + it.id + '" src="' + it.optUrl + '" alt="优化后预览" loading="lazy"></div></div>' +
                '</div>' +
                '<div class="sc-zoom-row"><span>预览缩放</span>' +
                '<input type="range" min="25" max="200" value="100" data-zoomctl="' + it.id + '">' +
                '<span class="sc-zoom-val" data-zoomval="' + it.id + '">100%</span></div>' +
                '<div class="sc-row-actions">' +
                '<button type="button" class="sc-mini" data-copy="' + it.id + '"><i class="material-icons">content_copy</i>复制代码</button>' +
                '<button type="button" class="sc-mini" data-dl="' + it.id + '"><i class="material-icons">download</i>下载 .svg</button>' +
                '<span class="sc-dlname">' + escHtml(it.dlName) + '</span>' +
                '</div>';
        } else if (it.status === 'run' || it.status === 'wait') {
            html += '<div class="sc-row-status">' + escHtml(statusText(it)) +
                '<span class="sc-pp-size" style="margin-left:.6rem">' + escHtml(scFmtSize(it.srcSize)) + '</span></div>';
        }
        html += '</div>';
    });
    box.innerHTML = html;

    function bindAll(sel, attr, fn) {
        var els = box.querySelectorAll(sel);
        for (var i = 0; i < els.length; i++) {
            (function (el) {
                el.addEventListener('click', function () { fn(parseInt(el.getAttribute(attr), 10), el); });
            })(els[i]);
        }
    }
    bindAll('[data-del]', 'data-del', function (id) { removeItem(id); });
    bindAll('[data-copy]', 'data-copy', function (id) { copyResult(id); });
    bindAll('[data-dl]', 'data-dl', function (id) { downloadOne(id); });

    var zcs = box.querySelectorAll('[data-zoomctl]');
    for (var z = 0; z < zcs.length; z++) {
        (function (ctl) {
            ctl.addEventListener('input', function () {
                var id = ctl.getAttribute('data-zoomctl');
                var val = ctl.value;
                var lbl = box.querySelector('[data-zoomval="' + id + '"]');
                if (lbl) lbl.textContent = val + '%';
                var imgs = box.querySelectorAll('img[data-zoom="' + id + '"]');
                for (var k = 0; k < imgs.length; k++) imgs[k].style.width = val + '%';
            });
        })(zcs[z]);
    }
}

function refreshSummary(done, total) {
    var n = S.items.length;
    var doneN = S.items.filter(function (it) { return it.status === 'done'; }).length;
    var errN = S.items.filter(function (it) { return it.status === 'error'; }).length;
    var el = $('sc-summary');
    if (done !== undefined && total !== undefined) {
        el.textContent = '已完成 ' + done + ' / ' + total + '（成功 ' + doneN + '，失败 ' + errN + '）';
    } else {
        el.textContent = n ? '队列 ' + n + ' 个 · 成功 ' + doneN + ' 个' + (errN ? ' · 失败 ' + errN + ' 个' : '') : '';
    }
}

/* ---------------- 示例 SVG（Illustrator 风格臃肿导出） ---------------- */
var SC_SAMPLE = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- Generator: Adobe Illustrator 28.0.0, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->',
    '<!-- 这是一个示例注释：导出时自动生成的说明文字 -->',
    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">',
    '<svg version="1.1" id="图层_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"',
    '     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi.dtd"',
    '     x="0px" y="0px" width="512px" height="512px" viewBox="0 0 512.000000 512.000000"',
    '     enable-background="new 0 0 512.000000 512.000000" xml:space="preserve"',
    '     inkscape:version="1.3.2" sodipodi:docname="sample.svg">',
    '<metadata id="metadata1">',
    '  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '    <cc:Work xmlns:cc="http://creativecommons.org/ns#"><dc:format xmlns:dc="http://purl.org/dc/elements/1.1/">image/svg+xml</dc:format></cc:Work>',
    '  </rdf:RDF>',
    '</metadata>',
    '<defs>',
    '</defs>',
    '<g id="背景" opacity="1.000000">',
    '    <rect x="10.123456" y="10.123456" width="491.753086" height="491.753086" rx="24.691358" fill="#FF5733" stroke="none" stroke-width="1.000000"/>',
    '    <circle cx="256.123457" cy="256.123457" r="120.987654" fill="#000000" opacity="1"/>',
    '    <path fill="#FFFFFF" stroke="none" d="M 100.123456 200.123456 L 150.654321 200.123456 L 150.654321 250.654321 L 100.123456 250.654321 Z"/>',
    '    <path fill="none" stroke="#000000" stroke-width="2.500000" d="M 300.111111 300.222222 C 320.333333 310.444444 340.555555 320.666666 360.777777 330.888888"/>',
    '</g>',
    '<g id="文字层" font-family="Arial" font-size="24.000000" fill="#000">',
    '    <text x="200.123456" y="480.654321" fill-opacity="1">示例文字</text>',
    '</g>',
    '</svg>'
].join('\n');

/* ---------------- 事件 ---------------- */
function bindEvents() {
    var dz = $('sc-dropzone'), fi = $('sc-file-input');
    dz.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        fi.click();
    });
    $('sc-pick-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        fi.click();
    });
    fi.addEventListener('change', function () {
        addFiles(fi.files);
        fi.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('sc-drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('sc-drag'); });
    });
    dz.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
    });

    $('sc-add-paste-btn').addEventListener('click', addPasted);
    $('sc-sample-btn').addEventListener('click', function () {
        $('sc-paste').value = SC_SAMPLE;
        toast('已填入示例 SVG（含注释/命名空间/6 位小数），点「加入队列」试试');
    });
    $('sc-start-btn').addEventListener('click', runBatch);
    $('sc-clear-btn').addEventListener('click', clearAll);

    var pr = $('sc-precision'), pv = $('sc-precision-val');
    pr.addEventListener('input', function () { pv.textContent = pr.value + ' 位'; });
    pv.textContent = pr.value + ' 位';

    /* 预设切换时联动清理项建议（不强制，可手动再调） */
    var radios = document.getElementsByName('sc-preset');
    function syncPresetDesc() {
        var p = 'balanced';
        for (var i = 0; i < radios.length; i++) if (radios[i].checked) p = radios[i].value;
        var d = $('sc-preset-desc');
        d.textContent = p === 'lossless'
            ? '无损：只做安全整理（去 doctype/空容器/合并分组），保留 viewBox，渲染 100% 一致'
            : p === 'aggressive'
            ? '激进：轻度 ＋ 去 viewBox/title/desc/隐藏元素/无用 defs，多遍优化，体积最小（注意：去 viewBox 后 SVG 不再随容器缩放）'
            : '轻度：无损 ＋ 去 metadata/编辑器命名空间/空属性/默认属性/未用命名空间，保留 viewBox';
    }
    for (var j = 0; j < radios.length; j++) radios[j].addEventListener('change', syncPresetDesc);
    syncPresetDesc();
}

document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    setEngineUI();
    renderList();
    refreshSummary();
});

})();
