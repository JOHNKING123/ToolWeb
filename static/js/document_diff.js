/* 文档对比（document_diff）- 上传两份 PDF/DOCX/TXT，本地提取文本＋行级 diff
 *
 * 流程：上传/拖拽两份文件（PDF/DOCX/TXT，单文件 ≤20MB）→ 本地提取文本
 *   （PDF 用本地 vendor pdf.js 3.11.174；DOCX 用本地 vendor mammoth.js 1.13.0
 *   的 extractRawText；TXT 用 FileReader 直接读）→ 行级 LCS diff（自研，
 *   不引入外部 diff 库）→ 并排/统一视图＋行内字符级标示 → 统计面板
 *   （新增/删除/未变行数＋相似度%）→ 导出差异报告 .txt（+/- 行前缀）与
 *   高亮 .html。忽略空白/忽略大小写两个开关在比对前归一化。
 * 分工：只比粘贴文本用文本比较（text_diff）；要比对上传的文件用本工具。
 * 纯函数（detectDocFormat / splitLines / normalizeLine / computeLineDiff /
 * summarizeDiff / diffSimilarity / buildPlainTextReport / buildHtmlReport /
 * validateDiffInput）在 node 下可单元测试；DOM 与文件读取/pdf.js/mammoth
 * 只做浏览器端。非法参数抛 Error，err.field 给出字段名。
 * 真限制：① 扫描版 PDF（图片型、无文本层）提不出文字，需先 OCR（站内
 *   ocr_image_text）；② 只比纯文本：复杂排版/表格/批注/修订标记可能丢失
 *   顺序或格式；③ DOCX 只提正文段落文本，不含页眉页脚/批注；④ 单文件
 *   ≤20MB，超大文件/超长行受浏览器内存限制；⑤ 全程浏览器本地计算，零上传。
 */
(function () {
'use strict';

/* ================= 纯函数 ================= */

var MAX_FILE_BYTES = 20 * 1024 * 1024;

function ddErr(message, field) {
    var e = new Error(message);
    e.field = field;
    return e;
}

function isNonEmptyString(x) {
    return typeof x === 'string' && x.length > 0;
}

function getExt(fileName) {
    var idx = fileName.lastIndexOf('.');
    if (idx < 0 || idx === fileName.length - 1) return '';
    return fileName.slice(idx + 1).toLowerCase();
}

// 文件名 → 'pdf'|'docx'|'txt'（扩展名大小写不敏感）。
// 锚点：("合同V2.PDF")→"pdf"；("报告.docx")→"docx"；("a.txt")→"txt"；
// ("a.jpg") 抛错 err.field='format'；("") 抛错 err.field='fileName'。
function detectDocFormat(fileName) {
    if (!isNonEmptyString(fileName)) throw ddErr('fileName 须为非空字符串', 'fileName');
    var ext = getExt(fileName);
    if (ext === 'pdf' || ext === 'docx' || ext === 'txt') return ext;
    throw ddErr('不支持的文件格式：' + ext, 'format');
}

// 文本 → 行数组（统一 \r\n/\r 为 \n 后按 \n 切分）。
// 锚点：("a\r\nb\nc")→["a","b","c"]；("")→[""]；(123) 抛错 err.field='text'。
function splitLines(text) {
    if (typeof text !== 'string') throw ddErr('text 须为字符串', 'text');
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

// 单行归一化：ignoreWhitespace 去首尾空白并折叠连续空白为单空格；
// ignoreCase 转小写。options 如出现须为对象。
// 锚点：("  Hello   World  ", {ignoreWhitespace:true})→"Hello World"；
// ("AbC", {ignoreCase:true})→"abc"；
// ("  AbC  ", {ignoreWhitespace:true, ignoreCase:true})→"abc"。
function normalizeLine(line, options) {
    if (typeof line !== 'string') throw ddErr('line 须为字符串', 'line');
    if (options !== undefined && (options === null || typeof options !== 'object' || Array.isArray(options))) {
        throw ddErr('options 须为对象', 'options');
    }
    var out = line;
    if (options && options.ignoreWhitespace) out = out.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    if (options && options.ignoreCase) out = out.toLowerCase();
    return out;
}

// 行级 LCS diff（全量 DP，同一改动处先 del 后 add）。返回 [{type:'same'|'add'|'del', text}]。
// 锚点：(["a","b","c"], ["a","x","c"]) → 长度 4，依次 {same,"a"}、{del,"b"}、
// {add,"x"}、{same,"c"}；([], []) → []。
function computeLineDiff(oldLines, newLines) {
    if (!Array.isArray(oldLines)) throw ddErr('oldLines 须为字符串数组', 'oldLines');
    if (!Array.isArray(newLines)) throw ddErr('newLines 须为字符串数组', 'newLines');
    for (var k = 0; k < oldLines.length; k++) {
        if (typeof oldLines[k] !== 'string') throw ddErr('oldLines 须为字符串数组', 'oldLines');
    }
    for (var k2 = 0; k2 < newLines.length; k2++) {
        if (typeof newLines[k2] !== 'string') throw ddErr('newLines 须为字符串数组', 'newLines');
    }
    return lcsDiff(oldLines, newLines);
}

// 全量 LCS（DP 表，Uint32Array 扁平存储；平局时优先 del，保证同一改动处先 del 后 add）。
function lcsDiff(a, b) {
    var m = a.length, n = b.length;
    if (m === 0) return b.map(function (t) { return { type: 'add', text: t }; });
    if (n === 0) return a.map(function (t) { return { type: 'del', text: t }; });
    var w = n + 1;
    var dp = new Uint32Array((m + 1) * w);
    for (var i = m - 1; i >= 0; i--) {
        for (var j = n - 1; j >= 0; j--) {
            if (a[i] === b[j]) dp[i * w + j] = dp[(i + 1) * w + j + 1] + 1;
            else dp[i * w + j] = Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
        }
    }
    var ops = [], x = 0, y = 0;
    while (x < m || y < n) {
        if (x < m && y < n && a[x] === b[y]) {
            ops.push({ type: 'same', text: a[x] });
            x++;
            y++;
        } else if (x < m && (y === n || dp[(x + 1) * w + y] >= dp[x * w + y + 1])) {
            ops.push({ type: 'del', text: a[x] });
            x++;
        } else {
            ops.push({ type: 'add', text: b[y] });
            y++;
        }
    }
    return ops;
}

// ops → {added, removed, same, total}（total = added＋removed＋same）。
// 锚点：上例 ops → {added:1, removed:1, same:2, total:4}；[] → 全 0。
function summarizeDiff(ops) {
    if (!Array.isArray(ops)) throw ddErr('ops 须为数组', 'ops');
    var added = 0, removed = 0, same = 0;
    for (var i = 0; i < ops.length; i++) {
        var t = ops[i] && ops[i].type;
        if (t === 'add') added++;
        else if (t === 'del') removed++;
        else if (t === 'same') same++;
    }
    return { added: added, removed: removed, same: same, total: added + removed + same };
}

// 相似度 0–100：total 为 0 时返回 100；否则 Math.round(100*same/total)。
// 锚点：上例 ops → 50；[] → 100；全 same 三行 → 100。
function diffSimilarity(ops) {
    if (!Array.isArray(ops)) throw ddErr('ops 须为数组', 'ops');
    var s = summarizeDiff(ops);
    if (s.total === 0) return 100;
    return Math.round(100 * s.same / s.total);
}

// 纯文本差异报告：首行 "--- nameA"、次行 "+++ nameB"；same 行前缀两个空格、
// del 行前缀 "- "、add 行前缀 "+ "。
// 锚点：(上例 ops, "旧版.txt", "新版.txt") 首行 "--- 旧版.txt"、次行
// "+++ 新版.txt"，报告含 "- b" 与 "+ x" 行。
function buildPlainTextReport(ops, nameA, nameB) {
    if (!Array.isArray(ops)) throw ddErr('ops 须为数组', 'ops');
    if (!isNonEmptyString(nameA)) throw ddErr('nameA 须为非空字符串', 'oldName');
    if (!isNonEmptyString(nameB)) throw ddErr('nameB 须为非空字符串', 'newName');
    var lines = ['--- ' + nameA, '+++ ' + nameB];
    for (var i = 0; i < ops.length; i++) {
        var op = ops[i];
        if (op.type === 'add') lines.push('+ ' + op.text);
        else if (op.type === 'del') lines.push('- ' + op.text);
        else lines.push('  ' + op.text);
    }
    return lines.join('\n');
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// 高亮 HTML 差异报告（独立可打开的单文件，内联样式，内容已转义）。
function buildHtmlReport(ops, nameA, nameB) {
    if (!Array.isArray(ops)) throw ddErr('ops 须为数组', 'ops');
    if (!isNonEmptyString(nameA)) throw ddErr('nameA 须为非空字符串', 'oldName');
    if (!isNonEmptyString(nameB)) throw ddErr('nameB 须为非空字符串', 'newName');
    var sim = diffSimilarity(ops);
    var sum = summarizeDiff(ops);
    var rows = [];
    for (var i = 0; i < ops.length; i++) {
        var op = ops[i];
        var cls = op.type === 'add' ? 'dd-add' : (op.type === 'del' ? 'dd-del' : 'dd-same');
        var sign = op.type === 'add' ? '+' : (op.type === 'del' ? '-' : ' ');
        rows.push('<div class="' + cls + '">' + sign + ' ' + escapeHtml(op.text) + '</div>');
    }
    return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n' +
        '<title>文档对比报告：' + escapeHtml(nameA) + ' vs ' + escapeHtml(nameB) + '</title>\n' +
        '<style>body{font-family:monospace;line-height:1.6;padding:1rem;max-width:900px;margin:auto}' +
        '.dd-add{background:#dcfce7}.dd-del{background:#fee2e2}.dd-same{background:#fff}' +
        '.dd-add,.dd-del,.dd-same{white-space:pre-wrap;word-break:break-all;padding:2px 6px}</style>\n' +
        '</head>\n<body>\n<h1>文档对比报告</h1>\n' +
        '<p>旧版：' + escapeHtml(nameA) + '；新版：' + escapeHtml(nameB) +
        '；新增 ' + sum.added + ' 行，删除 ' + sum.removed + ' 行，未变 ' + sum.same +
        ' 行，相似度 ' + sim + '%</p>\n' +
        rows.join('\n') + '\n</body>\n</html>';
}

// 校验比对输入（通过则原样返回 input）：oldName/newName 非空字符串；两者
// 扩展名须为 pdf/docx/txt 之一，否则 err.field='format'；ignoreWhitespace/
// ignoreCase 如出现须为 boolean。
function validateDiffInput(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw ddErr('input 须为对象', 'input');
    if (!isNonEmptyString(input.oldName)) throw ddErr('oldName 须为非空字符串', 'oldName');
    if (!isNonEmptyString(input.newName)) throw ddErr('newName 须为非空字符串', 'newName');
    detectDocFormat(input.oldName);
    detectDocFormat(input.newName);
    if (input.ignoreWhitespace !== undefined && typeof input.ignoreWhitespace !== 'boolean') {
        throw ddErr('ignoreWhitespace 须为 boolean', 'ignoreWhitespace');
    }
    if (input.ignoreCase !== undefined && typeof input.ignoreCase !== 'boolean') {
        throw ddErr('ignoreCase 须为 boolean', 'ignoreCase');
    }
    return input;
}

// 字节 → "N B" / "N.N KB" / "N.N MB"（一位小数），供文件信息栏展示。
function formatFileSize(bytes) {
    if (typeof bytes !== 'number' || !isFinite(bytes) || bytes < 0) throw ddErr('bytes 须为 ≥0 的有限数字', 'bytes');
    if (bytes < 1024) return Math.floor(bytes) + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

// 字符级 LCS（供 del/add 相邻行对做行内标示）：返回左右两列的字符分段，
// type 为 'same' | 'del'（仅左列）| 'add'（仅右列）。
function computeCharDiff(a, b) {
    var m = a.length, n = b.length;
    var dp = [];
    for (var i = 0; i <= m; i++) {
        dp.push(new Array(n + 1).fill(0));
    }
    for (var x = m - 1; x >= 0; x--) {
        for (var y = n - 1; y >= 0; y--) {
            if (a[x] === b[y]) dp[x][y] = dp[x + 1][y + 1] + 1;
            else dp[x][y] = Math.max(dp[x + 1][y], dp[x][y + 1]);
        }
    }
    var left = [], right = [], p = 0, q = 0;
    while (p < m || q < n) {
        if (p < m && q < n && a[p] === b[q]) {
            left.push({ ch: a[p], type: 'same' });
            right.push({ ch: b[q], type: 'same' });
            p++;
            q++;
        } else if (p < m && (q === n || dp[p + 1][q] >= dp[p][q + 1])) {
            left.push({ ch: a[p], type: 'del' });
            p++;
        } else {
            right.push({ ch: b[q], type: 'add' });
            q++;
        }
    }
    return { left: left, right: right };
}

/* ================= 浏览器端 ================= */

var PDF_WORKER_SRC = '/tools/static/js/vendor/pdf.worker.min.js';

var state = {
    fileA: null, // {name, format, size, text, lines}
    fileB: null,
    view: 'side', // 'side' 并排 | 'unified' 统一
    ops: null     // 显示用 ops（text 为原文行）
};

var SAMPLE_A = '服务合同（旧版）\n\n第一条 服务内容\n乙方为甲方提供网站日常维护服务。\n服务期限为一年，自 2025 年 1 月 1 日起。\n\n第二条 服务费用\n服务费用为每年人民币 12000 元。\n甲方应在合同签订后 7 个工作日内付款。\n\n第三条 保密义务\n双方应对合作中知悉的商业秘密保密。';
var SAMPLE_B = '服务合同（新版）\n\n第一条 服务内容\n乙方为甲方提供网站日常维护与安全巡检服务。\n服务期限为两年，自 2025 年 1 月 1 日起。\n\n第二条 服务费用\n服务费用为每年人民币 15000 元。\n甲方应在合同签订后 15 个工作日内付款。\n新增：逾期付款按日加收万分之五违约金。\n\n第三条 保密义务\n双方应对合作中知悉的商业秘密保密。';

function $(id) { return document.getElementById(id); }

function setStatus(msg, isError) {
    var el = $('dd-status');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = isError ? '#b91c1c' : 'var(--primary-color)';
}

function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { reject(new Error('读取文件失败')); };
        reader.readAsText(file, 'UTF-8');
    });
}

function readFileAsBuffer(file) {
    return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { reject(new Error('读取文件失败')); };
        reader.readAsArrayBuffer(file);
    });
}

// PDF：本地 vendor pdf.js 逐页提文本（hasEOL 换行，其余以空格连接）。
function extractPdfText(buf) {
    if (typeof window.pdfjsLib === 'undefined') {
        return Promise.reject(new Error('PDF 解析库未能加载（本地 vendor 文件缺失），请刷新重试'));
    }
    if (window.pdfjsLib.GlobalWorkerOptions) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
    }
    return window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise.then(function (pdf) {
        var pages = [];
        for (var p = 1; p <= pdf.numPages; p++) pages.push(p);
        var out = [];
        var chain = Promise.resolve();
        pages.forEach(function (pageNum) {
            chain = chain.then(function () {
                return pdf.getPage(pageNum).then(function (page) {
                    return page.getTextContent().then(function (content) {
                        var text = '';
                        content.items.forEach(function (item) {
                            text += item.str;
                            if (item.hasEOL) text += '\n';
                            else text += ' ';
                        });
                        out.push(text);
                    });
                });
            });
        });
        return chain.then(function () { return out.join('\n'); });
    });
}

// DOCX：本地 vendor mammoth.js 只提正文段落文本（extractRawText）。
function extractDocxText(buf) {
    if (typeof window.mammoth === 'undefined' || !window.mammoth.extractRawText) {
        return Promise.reject(new Error('DOCX 解析库未能加载（本地 vendor 文件缺失），请刷新重试'));
    }
    return window.mammoth.extractRawText({ arrayBuffer: buf }).then(function (result) {
        return result.value || '';
    });
}

function extractText(file, format) {
    if (format === 'txt') return readFileAsText(file);
    return readFileAsBuffer(file).then(function (buf) {
        if (format === 'pdf') return extractPdfText(buf);
        return extractDocxText(buf);
    });
}

function fileInfoHtml(f) {
    if (!f) return '尚未选择文件';
    return escapeHtml(f.name) + '（' + f.format.toUpperCase() + '，' + formatFileSize(f.size) +
        '，' + f.lines.length + ' 行）';
}

function handleFile(file, slot) {
    if (!file) return;
    var format;
    try {
        format = detectDocFormat(file.name);
    } catch (e) {
        setStatus('不支持的文件：' + file.name + '（仅支持 PDF / DOCX / TXT）', true);
        return;
    }
    if (file.size > MAX_FILE_BYTES) {
        setStatus('文件超过 20MB 上限：' + file.name + '（' + formatFileSize(file.size) + '）', true);
        return;
    }
    setStatus('正在提取 ' + file.name + ' 的文本…');
    extractText(file, format).then(function (text) {
        var lines = splitLines(text);
        var rec = { name: file.name, format: format, size: file.size, text: text, lines: lines };
        if (slot === 'A') state.fileA = rec;
        else state.fileB = rec;
        renderFileInfo();
        if (!text.trim()) {
            setStatus('已提取 ' + file.name + '，但未得到任何文本（扫描版 PDF 请先 OCR；空文件也会如此）。', true);
        } else {
            setStatus('已提取 ' + file.name + '（' + lines.length + ' 行）。');
        }
        if (state.fileA && state.fileB) runDiff();
    }).catch(function (err) {
        setStatus('提取失败：' + file.name + '（' + (err && err.message ? err.message : '未知错误') + '）', true);
    });
}

function renderFileInfo() {
    $('dd-info-a').innerHTML = fileInfoHtml(state.fileA);
    $('dd-info-b').innerHTML = fileInfoHtml(state.fileB);
}

function getOptions() {
    return {
        ignoreWhitespace: $('dd-ignore-ws').checked,
        ignoreCase: $('dd-ignore-case').checked
    };
}

// 按归一化键算 ops，再映射回原文行（显示用原文，比较用归一化键）。
function runDiff() {
    if (!state.fileA || !state.fileB) return;
    var opts = getOptions();
    try {
        validateDiffInput({
            oldName: state.fileA.name,
            newName: state.fileB.name,
            ignoreWhitespace: opts.ignoreWhitespace,
            ignoreCase: opts.ignoreCase
        });
    } catch (e) {
        setStatus('校验失败：' + e.message, true);
        return;
    }
    var oldKeys = state.fileA.lines.map(function (l) { return normalizeLine(l, opts); });
    var newKeys = state.fileB.lines.map(function (l) { return normalizeLine(l, opts); });
    var keyOps = computeLineDiff(oldKeys, newKeys);
    var ops = [];
    var i = 0, j = 0;
    keyOps.forEach(function (op) {
        if (op.type === 'same') { ops.push({ type: 'same', text: state.fileA.lines[i], key: op.text }); i++; j++; }
        else if (op.type === 'del') { ops.push({ type: 'del', text: state.fileA.lines[i], key: op.text }); i++; }
        else { ops.push({ type: 'add', text: state.fileB.lines[j], key: op.text }); j++; }
    });
    state.ops = ops;
    renderStats();
    renderDiff();
    $('dd-export-txt').disabled = false;
    $('dd-export-html').disabled = false;
    setStatus('比对完成：' + state.fileA.name + ' vs ' + state.fileB.name + '。');
}

function renderStats() {
    var sum = summarizeDiff(state.ops);
    var sim = diffSimilarity(state.ops);
    $('dd-stat-added').textContent = sum.added;
    $('dd-stat-removed').textContent = sum.removed;
    $('dd-stat-same').textContent = sum.same;
    $('dd-stat-total').textContent = sum.total;
    $('dd-stat-sim').textContent = sim + '%';
}

// del 紧跟 add 视为同行改动：行内字符级标示（下划线/底色）。
function renderMarkedPair(delText, addText) {
    var cd = computeCharDiff(delText, addText);
    function renderSide(parts, cls) {
        return parts.map(function (p) {
            if (p.type === 'same') return escapeHtml(p.ch);
            return '<span class="' + cls + '">' + escapeHtml(p.ch) + '</span>';
        }).join('');
    }
    return {
        left: renderSide(cd.left, 'dd-char-del'),
        right: renderSide(cd.right, 'dd-char-add')
    };
}

function renderDiff() {
    var ops = state.ops || [];
    var sideHtml = [];
    var uniHtml = [];
    for (var k = 0; k < ops.length; k++) {
        var op = ops[k];
        var next = ops[k + 1];
        var marked = null;
        if (op.type === 'del' && next && next.type === 'add') {
            marked = renderMarkedPair(op.text, next.text);
        }
        var leftText = escapeHtml(op.text === '' ? ' ' : op.text);
        var rightText = leftText;
        if (marked) {
            leftText = marked.left || ' ';
            rightText = marked.right || ' ';
        }
        if (op.type === 'same') {
            sideHtml.push('<div class="dd-row dd-same"><div class="dd-cell">' + leftText + '</div><div class="dd-cell">' + rightText + '</div></div>');
            uniHtml.push('<div class="dd-row dd-same"><div class="dd-cell dd-uni"><span class="dd-sign"> </span>' + leftText + '</div></div>');
        } else if (op.type === 'del') {
            sideHtml.push('<div class="dd-row dd-del"><div class="dd-cell">' + leftText + '</div><div class="dd-cell dd-empty"></div></div>');
            uniHtml.push('<div class="dd-row dd-del"><div class="dd-cell dd-uni"><span class="dd-sign">−</span>' + leftText + '</div></div>');
        } else {
            sideHtml.push('<div class="dd-row dd-add"><div class="dd-cell dd-empty"></div><div class="dd-cell">' + (marked ? rightText : escapeHtml(op.text === '' ? ' ' : op.text)) + '</div></div>');
            uniHtml.push('<div class="dd-row dd-add"><div class="dd-cell dd-uni"><span class="dd-sign">＋</span>' + escapeHtml(op.text === '' ? ' ' : op.text) + '</div></div>');
        }
        if (marked) {
            // 下一行是配对的 add：并排视图右列已在 del 行标示，跳过 add 行的左列占位
            // （统一视图仍逐行显示，add 行用自己的字符标示）
            sideHtml.pop();
            sideHtml.push('<div class="dd-row dd-changed"><div class="dd-cell">' + marked.left + '</div><div class="dd-cell">' + marked.right + '</div></div>');
            uniHtml.pop();
            uniHtml.push('<div class="dd-row dd-del"><div class="dd-cell dd-uni"><span class="dd-sign">−</span>' + marked.left + '</div></div>');
            uniHtml.push('<div class="dd-row dd-add"><div class="dd-cell dd-uni"><span class="dd-sign">＋</span>' + marked.right + '</div></div>');
            k++; // 消费掉配对的 add
        }
    }
    $('dd-view-side').innerHTML = sideHtml.join('') || '<div class="dd-empty-note">暂无差异行</div>';
    $('dd-view-uni').innerHTML = uniHtml.join('') || '<div class="dd-empty-note">暂无差异行</div>';
    applyView();
}

function applyView() {
    var side = state.view === 'side';
    $('dd-view-side').style.display = side ? '' : 'none';
    $('dd-view-uni').style.display = side ? 'none' : '';
    $('dd-view-btn-side').classList.toggle('active', side);
    $('dd-view-btn-uni').classList.toggle('active', !side);
}

function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

function baseName(name) {
    var idx = name.lastIndexOf('.');
    return idx > 0 ? name.slice(0, idx) : name;
}

function exportTxt() {
    if (!state.ops) return;
    var report = buildPlainTextReport(state.ops, state.fileA.name, state.fileB.name);
    downloadBlob(new Blob([report], { type: 'text/plain;charset=utf-8' }),
        baseName(state.fileA.name) + '_vs_' + baseName(state.fileB.name) + '_diff.txt');
    setStatus('已导出差异报告 .txt。');
}

function exportHtml() {
    if (!state.ops) return;
    var report = buildHtmlReport(state.ops, state.fileA.name, state.fileB.name);
    downloadBlob(new Blob([report], { type: 'text/html;charset=utf-8' }),
        baseName(state.fileA.name) + '_vs_' + baseName(state.fileB.name) + '_diff.html');
    setStatus('已导出高亮差异报告 .html。');
}

function loadSample() {
    state.fileA = { name: '服务合同（旧版）.txt', format: 'txt', size: SAMPLE_A.length, text: SAMPLE_A, lines: splitLines(SAMPLE_A) };
    state.fileB = { name: '服务合同（新版）.txt', format: 'txt', size: SAMPLE_B.length, text: SAMPLE_B, lines: splitLines(SAMPLE_B) };
    renderFileInfo();
    runDiff();
    setStatus('已加载示例合同两版，可直接看比对效果；也可替换为自己的文件。');
}

function clearAll() {
    state.fileA = null;
    state.fileB = null;
    state.ops = null;
    $('dd-file-a').value = '';
    $('dd-file-b').value = '';
    renderFileInfo();
    $('dd-view-side').innerHTML = '';
    $('dd-view-uni').innerHTML = '';
    $('dd-stat-added').textContent = '0';
    $('dd-stat-removed').textContent = '0';
    $('dd-stat-same').textContent = '0';
    $('dd-stat-total').textContent = '0';
    $('dd-stat-sim').textContent = '—';
    $('dd-export-txt').disabled = true;
    $('dd-export-html').disabled = true;
    setStatus('已清空，请重新选择两份文件。');
}

function swapFiles() {
    if (!state.fileA && !state.fileB) return;
    var tmp = state.fileA;
    state.fileA = state.fileB;
    state.fileB = tmp;
    renderFileInfo();
    if (state.fileA && state.fileB) runDiff();
    else setStatus('已交换旧版/新版位置。');
}

function bindDrop(zoneId, inputId, slot) {
    var zone = $(zoneId);
    var input = $(inputId);
    zone.addEventListener('click', function () { input.click(); });
    zone.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); input.click(); }
    });
    ['dragenter', 'dragover'].forEach(function (evt) {
        zone.addEventListener(evt, function (ev) { ev.preventDefault(); zone.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
        zone.addEventListener(evt, function (ev) { ev.preventDefault(); zone.classList.remove('dragover'); });
    });
    zone.addEventListener('drop', function (ev) {
        var files = ev.dataTransfer && ev.dataTransfer.files;
        if (files && files.length > 0) handleFile(files[0], slot);
    });
    input.addEventListener('change', function () {
        if (input.files && input.files.length > 0) handleFile(input.files[0], slot);
    });
}

function init() {
    bindDrop('dd-zone-a', 'dd-file-a', 'A');
    bindDrop('dd-zone-b', 'dd-file-b', 'B');
    $('dd-ignore-ws').addEventListener('change', function () { if (state.fileA && state.fileB) runDiff(); });
    $('dd-ignore-case').addEventListener('change', function () { if (state.fileA && state.fileB) runDiff(); });
    $('dd-view-btn-side').addEventListener('click', function () { state.view = 'side'; applyView(); });
    $('dd-view-btn-uni').addEventListener('click', function () { state.view = 'unified'; applyView(); });
    $('dd-export-txt').addEventListener('click', exportTxt);
    $('dd-export-html').addEventListener('click', exportHtml);
    $('dd-sample').addEventListener('click', loadSample);
    $('dd-clear').addEventListener('click', clearAll);
    $('dd-swap').addEventListener('click', swapFiles);
    renderFileInfo();
    applyView();
    if (typeof window.pdfjsLib === 'undefined') {
        setStatus('提示：PDF 解析库未能加载（本地 vendor 文件缺失），PDF 文件将无法提取；TXT/DOCX 不受影响。', true);
    }
    if (typeof window.mammoth === 'undefined') {
        setStatus('提示：DOCX 解析库未能加载（本地 vendor 文件缺失），DOCX 文件将无法提取；TXT/PDF 不受影响。', true);
    }
}

var api = {
    MAX_FILE_BYTES: MAX_FILE_BYTES,
    detectDocFormat: detectDocFormat,
    splitLines: splitLines,
    normalizeLine: normalizeLine,
    computeLineDiff: computeLineDiff,
    summarizeDiff: summarizeDiff,
    diffSimilarity: diffSimilarity,
    buildPlainTextReport: buildPlainTextReport,
    buildHtmlReport: buildHtmlReport,
    validateDiffInput: validateDiffInput,
    formatFileSize: formatFileSize
};

if (typeof window !== 'undefined') window.DocumentDiff = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
}

})();
