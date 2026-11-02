/* RAG 文本分块预览器 - 长文本 RAG 切块策略预览（纯前端）
 * 数据只在浏览器里处理：零第三方依赖、无任何后端调用、无网络请求（脚本内零 fetch/XHR）。
 * 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名）：
 *   chunkByChars(text, chunkSize, overlap)
 *       -> Array<{index, text, start, end, chars, tokens}>，index 从 1 起；
 *         start/end 为字符偏移（按 Unicode 码点计，BMP 文本与 JS 下标一致）；
 *         chars 为块内码点数，tokens 为 estimateChunkTokens(块文本)。
 *         text 非字符串抛 Error，err.field='text'；
 *         chunkSize 非正整数抛 Error，err.field='chunkSize'；
 *         overlap 非整数 / <0 / >=chunkSize 抛 Error，err.field='overlap'。
 *         步长 = chunkSize - overlap，从 0 起滚动切分；每块必含新字符，
 *         尾块不足 chunkSize 时保留残余（不丢字符、不造空块）。
 *   chunkByParagraph(text) -> 同上结构数组
 *         按空行分隔段落（连续非空行为一段，保留原文起止偏移）；
 *         text 非字符串抛 Error，err.field='text'。
 *   chunkBySentence(text)  -> 同上结构数组
 *         按句末标点（。！？；…．.?!;）启发式分句，标点归入本句；
 *         text 非字符串抛 Error，err.field='text'。
 *   estimateChunkTokens(text) -> 整数
 *         与 AI Token 计数器（ai_token_counter）完全相同的轻量 BPE 风格分段计数口径；
 *         text 非字符串抛 Error，err.field='text'。
 *   summarizeChunks(chunks) -> {count, totalChars, totalTokens, avgTokens, maxTokens, minTokens}
 *         chunks 非数组抛 Error，err.field='chunks'。
 *   buildExport(strategy, params, chunks, summary) -> 导出 JSON 对象
 *         strategy 须为 'chars'/'paragraph'/'sentence'，否则 err.field='strategy'；
 *         chunks 非数组抛 Error，err.field='chunks'。
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

function isPosInt(v) {
    return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 1;
}

/* ---- token 口径：与 static/js/ai-token-counter.js 的 countOpenAI 逐字一致 ---- */
function estimateChunkTokens(text) {
    if (typeof text !== 'string') {
        throw err('text', 'estimateChunkTokens: text 必须为字符串');
    }
    if (!text) return 0;
    var re = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]|[A-Za-z]+(?:'[A-Za-z]+)?|\d+(?:[.,]\d+)*|[^\sA-Za-z\d\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
    var m, tokens = 0;
    while ((m = re.exec(text)) !== null) {
        var seg = m[0];
        if (/^[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]$/.test(seg)) {
            tokens += 1; // 中文约 1 字 ≈ 1 token 量级
        } else if (/^[A-Za-z]/.test(seg)) {
            tokens += Math.max(1, Math.ceil(seg.length / 4)); // 英文子词分段
        } else if (/^\d/.test(seg)) {
            tokens += Math.max(1, Math.ceil(seg.replace(/[.,]/g, '').length / 3)); // 数字按约 3 位一段
        } else {
            tokens += 1; // 标点/符号
        }
    }
    return tokens;
}

function makeChunk(cps, index, start, end) {
    var s = cps.slice(start, end).join('');
    return {
        index: index,
        text: s,
        start: start,
        end: end,
        chars: end - start,
        tokens: estimateChunkTokens(s)
    };
}

/* ============ chunkByChars ============ */
function chunkByChars(text, chunkSize, overlap) {
    if (typeof text !== 'string') {
        throw err('text', 'chunkByChars: text 必须为字符串');
    }
    if (!isPosInt(chunkSize)) {
        throw err('chunkSize', 'chunkByChars: chunkSize 必须为正整数');
    }
    if (typeof overlap !== 'number' || !isFinite(overlap) || Math.floor(overlap) !== overlap ||
            overlap < 0 || overlap >= chunkSize) {
        throw err('overlap', 'chunkByChars: overlap 必须为整数且满足 0 <= overlap < chunkSize');
    }
    var cps = Array.from(text);
    var n = cps.length;
    var step = chunkSize - overlap;
    var chunks = [];
    var start = 0;
    var index = 1;
    while (start < n) {
        var end = Math.min(start + chunkSize, n);
        chunks.push(makeChunk(cps, index, start, end));
        index++;
        if (end >= n) break;
        start += step;
    }
    return chunks;
}

/* ============ chunkByParagraph ============ */
function chunkByParagraph(text) {
    if (typeof text !== 'string') {
        throw err('text', 'chunkByParagraph: text 必须为字符串');
    }
    var chunks = [];
    var cps = Array.from(text);
    // 按行切分并记录每行起止（码点偏移），换行符本身归属分隔区
    var lines = [];
    var pos = 0;
    var i = 0;
    while (i <= cps.length) {
        if (i === cps.length || cps[i] === '\n') {
            lines.push({ start: pos, end: i });
            pos = i + 1;
        } else if (cps[i] === '\r') {
            lines.push({ start: pos, end: i });
            pos = (cps[i + 1] === '\n') ? i + 2 : i + 1;
            i = pos - 1;
        }
        i++;
    }
    function isBlank(ln) {
        for (var k = ln.start; k < ln.end; k++) {
            if (!/\s/.test(cps[k])) return false;
        }
        return true;
    }
    var curStart = -1, curEnd = -1;
    var index = 1;
    function flush() {
        if (curStart !== -1) {
            chunks.push(makeChunk(cps, index, curStart, curEnd));
            index++;
            curStart = -1; curEnd = -1;
        }
    }
    for (var l = 0; l < lines.length; l++) {
        var ln = lines[l];
        if (isBlank(ln)) { flush(); continue; }
        if (curStart === -1) { curStart = ln.start; }
        curEnd = ln.end;
    }
    flush();
    return chunks;
}

/* 句末标点集合（启发式）：中英文句号/感叹/问号/分号/省略号 */
var SENT_TERM = '。！？；…．.?!;';

/* ============ chunkBySentence ============ */
function chunkBySentence(text) {
    if (typeof text !== 'string') {
        throw err('text', 'chunkBySentence: text 必须为字符串');
    }
    var chunks = [];
    var cps = Array.from(text);
    var n = cps.length;
    var i = 0;
    var index = 1;
    function isTerm(ch) { return SENT_TERM.indexOf(ch) !== -1; }
    while (i < n) {
        var j = i;
        while (j < n && !isTerm(cps[j])) j++;
        if (j < n) {
            do { j++; } while (j < n && isTerm(cps[j]));
        } else {
            j = n;
        }
        var hasContent = false;
        for (var k = i; k < j; k++) {
            if (!/\s/.test(cps[k])) { hasContent = true; break; }
        }
        if (hasContent) {
            chunks.push(makeChunk(cps, index, i, j));
            index++;
        }
        i = j;
    }
    return chunks;
}

/* ============ summarizeChunks ============ */
function summarizeChunks(chunks) {
    if (!Array.isArray(chunks)) {
        throw err('chunks', 'summarizeChunks: chunks 必须为数组');
    }
    var count = chunks.length;
    var totalChars = 0, totalTokens = 0, maxTokens = 0, minTokens = 0;
    for (var i = 0; i < count; i++) {
        var c = chunks[i] || {};
        var t = typeof c.tokens === 'number' ? c.tokens : 0;
        var ch = typeof c.chars === 'number' ? c.chars : 0;
        totalTokens += t;
        totalChars += ch;
        if (i === 0 || t > maxTokens) maxTokens = t;
        if (i === 0 || t < minTokens) minTokens = t;
    }
    return {
        count: count,
        totalChars: totalChars,
        totalTokens: totalTokens,
        avgTokens: count ? Math.round(totalTokens / count * 10) / 10 : 0,
        maxTokens: maxTokens,
        minTokens: minTokens
    };
}

/* ============ buildExport ============ */
var STRATEGIES = ['chars', 'paragraph', 'sentence'];

function buildExport(strategy, params, chunks, summary) {
    if (STRATEGIES.indexOf(strategy) === -1) {
        throw err('strategy', 'buildExport: strategy 必须为 chars/paragraph/sentence 之一');
    }
    if (!Array.isArray(chunks)) {
        throw err('chunks', 'buildExport: chunks 必须为数组');
    }
    return {
        tool: 'rag_chunk_preview',
        version: 1,
        strategy: strategy,
        params: params || {},
        summary: summary || summarizeChunks(chunks),
        chunks: chunks.map(function (c) {
            return {
                index: c.index,
                start: c.start,
                end: c.end,
                chars: c.chars,
                tokens: c.tokens,
                text: c.text
            };
        }),
        exportedAt: new Date().toISOString()
    };
}

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* 高亮 HTML：按块边界切分原文为互不重叠片段，奇偶块交替染色；
 * 未被任何块覆盖的间隙（如段落间的空行）保持无底色。码点偏移。 */
function highlightHtml(text, chunks) {
    var cps = Array.from(String(text));
    var pts = [0, cps.length];
    chunks.forEach(function (c) {
        if (typeof c.start === 'number') pts.push(c.start);
        if (typeof c.end === 'number') pts.push(c.end);
    });
    pts = pts.filter(function (p) { return p >= 0 && p <= cps.length; });
    pts.sort(function (a, b) { return a - b; });
    var uniq = [];
    for (var i = 0; i < pts.length; i++) {
        if (i === 0 || pts[i] !== pts[i - 1]) uniq.push(pts[i]);
    }
    var html = '';
    for (var k = 0; k + 1 < uniq.length; k++) {
        var a = uniq[k], b = uniq[k + 1];
        if (b <= a) continue;
        var owner = null;
        for (var c = 0; c < chunks.length; c++) {
            if (chunks[c].start <= a && chunks[c].end >= b) { owner = chunks[c]; break; }
        }
        var seg = escapeHtml(cps.slice(a, b).join(''));
        if (owner) {
            var cls = 'rcp-hl-' + (owner.index % 2);
            html += '<span class="' + cls + '" title="块 #' + owner.index +
                '（' + owner.start + '–' + owner.end + '，' + owner.chars +
                ' 字符，约 ' + owner.tokens + ' tokens）">' + seg + '</span>';
        } else {
            html += seg;
        }
    }
    return html;
}

/* ================= 浏览器 UI ================= */
var MAX_FILE_SIZE = 2 * 1024 * 1024;

var SAMPLE = '检索增强生成（RAG）的第一步，是把长文本切成大小合适的块（chunk）。\n\n' +
'块太大，检索时带入太多无关上下文，浪费 token 还稀释答案精度；块太小，语义被切碎，单个块答不出完整问题。\n' +
'经验值：中文问答场景，块大小 300–800 字符、重叠 10%–20% 是常见的起点。\n\n' +
'三种切分策略各有取舍：固定字符数最简单但可能拦腰切断句子；按段落切分语义完整，但段落长短不一；' +
'按句子切分粒度最细，适合做精排前的粗召回。\n\n' +
'切完块之后，记得用与线上 embedding 模型配套的 tokenizer 估算 token 分布，' +
'避免出现「看着不大、一发就超窗」的块。RAG chunking preview helps you tune size and overlap before indexing. ' +
'Good chunks make good retrieval!';

function $(id) { return document.getElementById(id); }

function toast(msg) {
    var t = $('rcp-toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2200);
}

function currentStrategy() {
    var radios = document.getElementsByName('rcp-strategy');
    for (var i = 0; i < radios.length; i++) {
        if (radios[i].checked) return radios[i].value;
    }
    return 'chars';
}

function readParams() {
    var size = parseInt($('rcp-size').value, 10);
    var overlap = parseInt($('rcp-overlap').value, 10);
    return { chunkSize: size, overlap: isNaN(overlap) ? 0 : overlap };
}

function fmtNum(n) {
    return Number(n).toLocaleString('en-US');
}

function render() {
    var text = $('rcp-input').value;
    var strategy = currentStrategy();
    var listEl = $('rcp-list');
    var hlEl = $('rcp-highlight');
    var sumEl = $('rcp-summary');
    var errEl = $('rcp-err');

    $('rcp-size-row').style.display = strategy === 'chars' ? '' : 'none';
    $('rcp-overlap-row').style.display = strategy === 'chars' ? '' : 'none';

    errEl.style.display = 'none';
    errEl.textContent = '';

    if (!text) {
        listEl.innerHTML = '<div class="rcp-dim">在上方粘贴文本、上传 .txt 或载入示例后，这里会列出分块明细。</div>';
        hlEl.innerHTML = '<div class="rcp-dim">等待输入…</div>';
        sumEl.innerHTML = '';
        $('rcp-export').disabled = true;
        return;
    }

    var chunks;
    try {
        if (strategy === 'chars') {
            var p = readParams();
            if (!isPosInt(p.chunkSize)) {
                throw err('chunkSize', '块大小必须为正整数');
            }
            chunks = chunkByChars(text, p.chunkSize, p.overlap);
        } else if (strategy === 'paragraph') {
            chunks = chunkByParagraph(text);
        } else {
            chunks = chunkBySentence(text);
        }
    } catch (e) {
        errEl.textContent = '参数错误：' + e.message;
        errEl.style.display = 'block';
        return;
    }

    var summary = summarizeChunks(chunks);

    /* 汇总 */
    sumEl.innerHTML =
        '<div class="rcp-sum"><div class="rcp-sum-n">' + fmtNum(summary.count) + '</div><div class="rcp-sum-l">总块数</div></div>' +
        '<div class="rcp-sum"><div class="rcp-sum-n">' + fmtNum(summary.totalTokens) + '</div><div class="rcp-sum-l">总预估 token</div></div>' +
        '<div class="rcp-sum"><div class="rcp-sum-n">' + summary.avgTokens + '</div><div class="rcp-sum-l">平均 token/块</div></div>' +
        '<div class="rcp-sum"><div class="rcp-sum-n">' + fmtNum(summary.maxTokens) + '</div><div class="rcp-sum-l">最大块 token</div></div>' +
        '<div class="rcp-sum"><div class="rcp-sum-n">' + fmtNum(summary.minTokens) + '</div><div class="rcp-sum-l">最小块 token</div></div>' +
        '<div class="rcp-sum"><div class="rcp-sum-n">' + fmtNum(summary.totalChars) + '</div><div class="rcp-sum-l">原文字符数</div></div>';

    /* 分块列表 */
    if (!chunks.length) {
        listEl.innerHTML = '<div class="rcp-dim">文本为空或全为空白，没有可分的块。</div>';
    } else {
        var rows = chunks.map(function (c) {
            var preview = c.text.length > 60 ? c.text.slice(0, 60) + '…' : c.text;
            return '<tr><td class="rcp-c">' + c.index + '</td>' +
                '<td class="rcp-c"><code>' + c.start + '–' + c.end + '</code></td>' +
                '<td class="rcp-c">' + fmtNum(c.chars) + '</td>' +
                '<td class="rcp-c">' + fmtNum(c.tokens) + '</td>' +
                '<td>' + escapeHtml(preview) + '</td></tr>';
        }).join('');
        listEl.innerHTML = '<table class="rcp-table"><thead><tr>' +
            '<th>序号</th><th>起止偏移</th><th>字符数</th><th>预估 token</th><th>块内容预览</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table>' +
            '<div class="rcp-dim" style="margin-top:.5rem">偏移为字符偏移（Unicode 码点）；token 为本地 BPE 风格估算口径。</div>';
    }

    /* 原文高亮 */
    hlEl.innerHTML = highlightHtml(text, chunks);
    $('rcp-export').disabled = false;

    /* 供导出使用 */
    render._last = { strategy: strategy, params: readParams(), chunks: chunks, summary: summary };
}

function exportJson() {
    var last = render._last;
    if (!last) return;
    var data = buildExport(last.strategy, last.params, last.chunks, last.summary);
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var d = new Date();
    function pad(x) { return (x < 10 ? '0' : '') + x; }
    var name = 'rag_chunk_preview_' + d.getFullYear() +
        pad(d.getMonth() + 1) + pad(d.getDate()) + '_' +
        pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.json';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
        URL.revokeObjectURL(a.href);
        document.body.removeChild(a);
    }, 500);
    toast('已导出 ' + last.chunks.length + ' 个分块（' + name + '）');
}

function init() {
    var input = $('rcp-input');
    var timer = null;
    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(render, 180);
    }
    input.addEventListener('input', schedule);
    var radios = document.getElementsByName('rcp-strategy');
    for (var i = 0; i < radios.length; i++) {
        radios[i].addEventListener('change', render);
    }
    $('rcp-size').addEventListener('input', schedule);
    $('rcp-overlap').addEventListener('input', schedule);

    $('rcp-sample').addEventListener('click', function () {
        input.value = SAMPLE;
        render();
        input.focus();
        toast('已载入示例文本');
    });
    $('rcp-clear').addEventListener('click', function () {
        input.value = '';
        render();
        input.focus();
    });
    $('rcp-export').addEventListener('click', exportJson);

    var fileInput = $('rcp-file');
    $('rcp-upload').addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
        var f = this.files[0];
        if (!f) return;
        if (!/\.txt$/i.test(f.name)) {
            toast('仅支持 .txt 文件');
            this.value = '';
            return;
        }
        if (f.size > MAX_FILE_SIZE) {
            toast('文件过大（上限 2 MB）');
            this.value = '';
            return;
        }
        var reader = new FileReader();
        reader.onload = function () {
            input.value = String(reader.result || '');
            render();
            toast('已读取文件：' + f.name + '（仅本地读取，不上传）');
        };
        reader.onerror = function () { toast('文件读取失败，请重试'); };
        reader.readAsText(f);
        this.value = '';
    });

    render();
}

var API = {
    chunkByChars: chunkByChars,
    chunkByParagraph: chunkByParagraph,
    chunkBySentence: chunkBySentence,
    estimateChunkTokens: estimateChunkTokens,
    summarizeChunks: summarizeChunks,
    buildExport: buildExport,
    escapeHtml: escapeHtml,
    highlightHtml: highlightHtml,
    SAMPLE: SAMPLE
};

if (typeof window !== 'undefined') {
    window.RagChunkPreview = API;
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else { init(); }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
}

})();
