/* 文本摘要/要点提取器（text_summarizer）- 纯前端 TextRank 提取式摘要：
 * 长文/论文/会议纪要粘贴或 txt 本地读取 → 中英文分句 → 停用词过滤 →
 * TF 余弦句子相似度矩阵 → TextRank/PageRank 迭代（阻尼 0.85、最多 100 轮、
 * 收敛阈值 1e-4）→ 按压缩比例（10%–50%，默认 30%）原序抽取摘要句 ＋
 * 文档内 TF 归一化关键词 Top 10 → 一键复制／导出 txt。零上传、无限次。
 *
 * 纯函数契约（浏览器/Node 通用；非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 *   splitSentences(text)
 *       -> string[]；text 非字符串/空/空白抛 Error，err.field='text'。
 *         中文按 。！？ 分句（保留标点），英文按 . ! ? 分句（标点后直接结尾、
 *         或后跟大写/中文、或后跟空白+数字时切分，保留标点；小数点与缩写不切分），
 *         换行总切分；省略号 …… 不切分。
 *   tokenize(sentence, stopwords)
 *       -> string[]；英文按字母数字序列切分并小写归一、中文按单字切分，
 *         再按 stopwords 过滤；stopwords 省略时用内置中英合并表；
 *         sentence 非字符串抛 Error，err.field='sentence'；
 *         stopwords 给出但非数组抛 Error，err.field='stopwords'。
 *   sentenceSimilarity(tokensA, tokensB)
 *       -> number（TF 余弦相似度，保留 4 位小数）；tokensA/tokensB 非数组抛 Error，
 *         err.field='tokensA'/'tokensB'；任一空向量相似度为 0。
 *   buildSimilarityMatrix(tokenized)
 *       -> number[][]；对角线为 0、对称；tokenized 非数组/空/元素非数组抛 Error，
 *         err.field='tokenized'。
 *   textRank(matrix, options)
 *       -> number[]（PageRank 得分，得分和≈1，容差 1e-6）；options 省略取默认值
 *         {damping:0.85, maxIter:100, epsilon:1e-4}；matrix 非方阵/非法抛 Error，
 *         err.field='matrix'；options 非对象 err.field='options'；
 *         damping 非 (0,1) err.field='options.damping'；
 *         maxIter 非正整数 err.field='options.maxIter'；
 *         epsilon 非正数 err.field='options.epsilon'。
 *         悬挂节点（出度为 0）按均匀分布处理。
 *   extractSummary(text, ratio, options)
 *       -> {sentences, indices, total, kept}；全流程：分句→分词→相似度矩阵→
 *         TextRank→按 ratio 取 Top 句再按原序输出；ratio 非 (0,1] 抛 Error，
 *         err.field='ratio'；text 非法（非字符串/空/空白）err.field='text'；
 *         kept>=1（单句文本 kept=1，不静默空摘要）；options 透传
 *         {stopwords, damping, maxIter, epsilon}。
 *   extractKeywords(text, topN, stopwords)
 *       -> [{word, score}]；文档内词频归一化 score=词频/总词数（保留 4 位小数），
 *         按 score 降序（并列按词升序）；单个英文/数字字符不成关键词；
 *         topN 省略默认 10，非正整数抛 Error，err.field='topN'；
 *         text 非法 err.field='text'；stopwords 规则同 tokenize。
 *   truncateText(text, maxChars)
 *       -> {text, truncated}；maxChars 省略默认 50000（5 万字上限兜底）；
 *         text 非字符串抛 Error，err.field='text'；
 *         maxChars 非正整数抛 Error，err.field='maxChars'。
 *   sanitizeFileName(name)
 *       -> 去除非法字符/首尾空白点/空白转连字符/截断 60；空回退 'text-summary'（家族惯例）。
 *
 * 真限制（页面明示）：① 提取式摘要（只抽取原文句子，不改写、不创造新句）；
 * ② 中文为单字级分词（无内置词典）；③ 全程浏览器本地计算，零上传；
 * ④ 输入上限 5 万字，超长仅处理前 5 万字。
 *
 * 零 fetch/XHR/WebSocket：纯本地计算，不发起任何网络请求。
 */
(function () {
'use strict';

/* ---------------- 常量 ---------------- */
var MAX_CHARS = 50000;      /* 输入上限：5 万字 */
var DAMPING = 0.85;         /* TextRank 阻尼系数 */
var MAX_ITER = 100;         /* 最大迭代轮数 */
var EPSILON = 1e-4;         /* 收敛阈值 */
var DEFAULT_RATIO = 0.3;    /* 默认压缩比例 30% */
var DEFAULT_TOPN = 10;      /* 默认关键词 Top 10 */
var CJK_TERMINATORS = '。！？';
var EN_TERMINATORS = '.!?';

/* 内置英文停用词表（与 wordcloud_generator 同源，70 词）。 */
var EN_STOPWORDS = [
    'the', 'and', 'of', 'to', 'a', 'in', 'is', 'it', 'you', 'that',
    'he', 'was', 'for', 'on', 'are', 'as', 'with', 'his', 'they', 'i',
    'at', 'be', 'this', 'have', 'from', 'or', 'one', 'had', 'by', 'but',
    'not', 'what', 'all', 'were', 'we', 'when', 'your', 'can', 'said', 'there',
    'use', 'an', 'each', 'which', 'she', 'do', 'how', 'their', 'will', 'up',
    'other', 'about', 'out', 'many', 'then', 'them', 'these', 'so', 'some', 'her',
    'would', 'make', 'like', 'him', 'into', 'time', 'has', 'look', 'two', 'more',
    'its', 'also', 'than', 'been', 'no', 'if', 'my', 'me', 'our', 'us'
];
/* 内置中文停用词表（单字级，48 字）。 */
var ZH_STOPWORDS = [
    '的', '了', '在', '是', '我', '有', '和', '就', '不', '人',
    '都', '一', '上', '也', '很', '到', '说', '要', '去', '你',
    '会', '着', '没', '看', '好', '自', '这', '那', '个', '与',
    '及', '或', '但', '而', '于', '从', '对', '等', '可', '以',
    '为', '之', '其', '将', '被', '把', '吗', '呢'
];
var DEFAULT_STOPWORDS = EN_STOPWORDS.concat(ZH_STOPWORDS);

function fldError(field, message) {
    var e = new Error(message);
    e.field = field;
    return e;
}

function isCjk(ch) {
    var code = ch.charCodeAt(0);
    return code >= 0x4E00 && code <= 0x9FFF;
}

function isPositiveInt(v) {
    return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v > 0;
}

function round4(x) {
    return Math.round(x * 10000) / 10000;
}

/* stopwords 参数归一：省略→内置默认表；给出但非数组→抛错。 */
function normStopwords(stopwords) {
    if (stopwords === undefined || stopwords === null) return DEFAULT_STOPWORDS;
    if (!Array.isArray(stopwords)) throw fldError('stopwords', '停用词表必须为数组');
    return stopwords;
}

function buildStopSet(stopwords) {
    var set = {};
    for (var i = 0; i < stopwords.length; i++) {
        if (typeof stopwords[i] === 'string') set[stopwords[i]] = true;
    }
    return set;
}

/* ---------------- 纯函数 ---------------- */

/* 中英文分句。 */
function splitSentences(text) {
    if (typeof text !== 'string') throw fldError('text', '文本必须为字符串');
    if (!text.trim()) throw fldError('text', '文本不能为空');
    var out = [];
    var buf = '';
    var n = text.length;
    function flush() {
        var s = buf.trim();
        buf = '';
        if (s) out.push(s);
    }
    var i = 0;
    while (i < n) {
        var ch = text.charAt(i);
        if (ch === '\n' || ch === '\r') { flush(); i++; continue; }
        buf += ch;
        if (CJK_TERMINATORS.indexOf(ch) !== -1) {
            while (i + 1 < n && CJK_TERMINATORS.indexOf(text.charAt(i + 1)) !== -1) {
                i++;
                buf += text.charAt(i);
            }
            flush();
            i++;
            continue;
        }
        if (EN_TERMINATORS.indexOf(ch) !== -1) {
            var j = i + 1, skipped = 0;
            while (j < n && (text.charAt(j) === ' ' || text.charAt(j) === '\t')) { j++; skipped++; }
            var nxt = j < n ? text.charAt(j) : '';
            var isEnd = (nxt === '' || nxt === '\n' || nxt === '\r');
            /* 英文句末：标点后直接结尾，或后跟大写/中文（可无空白），或后跟
             * 空白+数字时切分；小数点（后跟无空白数字）与小写缩写不切分。 */
            if (isEnd || /[A-Z\u4e00-\u9fff]/.test(nxt) || (skipped > 0 && /[0-9]/.test(nxt))) flush();
        }
        i++;
    }
    flush();
    return out;
}

/* 分词：英文按词（小写归一）、中文按单字，再按停用词表过滤。 */
function tokenize(sentence, stopwords) {
    if (typeof sentence !== 'string') throw fldError('sentence', '句子必须为字符串');
    var stopSet = buildStopSet(normStopwords(stopwords));
    var tokens = [];
    var i = 0, n = sentence.length;
    while (i < n) {
        var ch = sentence.charAt(i);
        if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')) {
            var j = i;
            while (j < n) {
                var c = sentence.charAt(j);
                if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9'))) break;
                j++;
            }
            var word = sentence.slice(i, j).toLowerCase();
            if (!stopSet[word]) tokens.push(word);
            i = j;
        } else if (isCjk(ch)) {
            if (!stopSet[ch]) tokens.push(ch);
            i++;
        } else {
            i++;
        }
    }
    return tokens;
}

/* TF 余弦相似度（保留 4 位小数）。 */
function sentenceSimilarity(tokensA, tokensB) {
    if (!Array.isArray(tokensA)) throw fldError('tokensA', 'tokensA 必须为 token 数组');
    if (!Array.isArray(tokensB)) throw fldError('tokensB', 'tokensB 必须为 token 数组');
    if (tokensA.length === 0 || tokensB.length === 0) return 0;
    var f1 = {}, f2 = {}, k;
    for (var i = 0; i < tokensA.length; i++) {
        k = tokensA[i];
        f1[k] = (f1[k] || 0) + 1;
    }
    for (var j = 0; j < tokensB.length; j++) {
        k = tokensB[j];
        f2[k] = (f2[k] || 0) + 1;
    }
    var dot = 0, n1 = 0, n2 = 0;
    for (k in f1) {
        if (Object.prototype.hasOwnProperty.call(f1, k)) {
            n1 += f1[k] * f1[k];
            if (f2[k]) dot += f1[k] * f2[k];
        }
    }
    for (k in f2) {
        if (Object.prototype.hasOwnProperty.call(f2, k)) n2 += f2[k] * f2[k];
    }
    if (n1 === 0 || n2 === 0) return 0;
    return round4(dot / (Math.sqrt(n1) * Math.sqrt(n2)));
}

/* 句子相似度矩阵：对角 0、对称。 */
function buildSimilarityMatrix(tokenized) {
    if (!Array.isArray(tokenized) || tokenized.length === 0) {
        throw fldError('tokenized', '分词结果必须为非空数组');
    }
    for (var t = 0; t < tokenized.length; t++) {
        if (!Array.isArray(tokenized[t])) throw fldError('tokenized', '第 ' + t + ' 个分词结果必须为数组');
    }
    var n = tokenized.length;
    var m = [];
    for (var i = 0; i < n; i++) {
        m.push([]);
        for (var j = 0; j < n; j++) {
            m[i].push(i === j ? 0 : sentenceSimilarity(tokenized[i], tokenized[j]));
        }
    }
    return m;
}

/* TextRank/PageRank 迭代：返回得分数组（和≈1）。 */
function textRank(matrix, options) {
    if (!Array.isArray(matrix) || matrix.length === 0) {
        throw fldError('matrix', '相似度矩阵必须为非空二维数组');
    }
    var n = matrix.length;
    for (var r = 0; r < n; r++) {
        if (!Array.isArray(matrix[r]) || matrix[r].length !== n) {
            throw fldError('matrix', '相似度矩阵必须为方阵');
        }
        for (var c = 0; c < n; c++) {
            if (typeof matrix[r][c] !== 'number' || !isFinite(matrix[r][c]) || matrix[r][c] < 0) {
                throw fldError('matrix', '矩阵元素必须为非负有限数字');
            }
        }
    }
    var damping = DAMPING, maxIter = MAX_ITER, epsilon = EPSILON;
    if (options === undefined) {
        /* 取默认值 */
    } else if (options === null || typeof options !== 'object' || Array.isArray(options)) {
        throw fldError('options', 'options 必须为对象');
    } else {
        if (options.damping !== undefined) damping = options.damping;
        if (options.maxIter !== undefined) maxIter = options.maxIter;
        if (options.epsilon !== undefined) epsilon = options.epsilon;
    }
    if (!(damping > 0 && damping < 1)) throw fldError('options.damping', '阻尼系数必须在 (0,1) 区间');
    if (!isPositiveInt(maxIter)) throw fldError('options.maxIter', '最大迭代轮数必须为正整数');
    if (!(epsilon > 0)) throw fldError('options.epsilon', '收敛阈值必须为正数');

    var outDeg = [];
    for (var i = 0; i < n; i++) {
        var s = 0;
        for (var j = 0; j < n; j++) s += matrix[i][j];
        outDeg.push(s);
    }
    var scores = [];
    for (var k = 0; k < n; k++) scores.push(1 / n);
    for (var it = 0; it < maxIter; it++) {
        var next = [], maxDiff = 0;
        for (var a = 0; a < n; a++) {
            var acc = 0;
            for (var b = 0; b < n; b++) {
                /* 悬挂节点（出度 0）按均匀分布转移。 */
                var w = outDeg[b] > 0 ? matrix[b][a] / outDeg[b] : 1 / n;
                acc += w * scores[b];
            }
            next.push((1 - damping) / n + damping * acc);
        }
        for (var d = 0; d < n; d++) {
            var diff = Math.abs(next[d] - scores[d]);
            if (diff > maxDiff) maxDiff = diff;
        }
        scores = next;
        if (maxDiff < epsilon) break;
    }
    return scores;
}

/* 全流程摘要：{sentences, indices, total, kept}，摘要句按原序。 */
function extractSummary(text, ratio, options) {
    if (typeof text !== 'string' || !text.trim()) throw fldError('text', '文本必须为非空字符串');
    if (ratio === undefined || ratio === null) ratio = DEFAULT_RATIO;
    if (typeof ratio !== 'number' || !isFinite(ratio) || ratio <= 0 || ratio > 1) {
        throw fldError('ratio', '压缩比例必须在 (0,1] 区间');
    }
    var opts = options === undefined ? {} : options;
    if (opts === null || typeof opts !== 'object' || Array.isArray(opts)) {
        throw fldError('options', 'options 必须为对象');
    }
    var stopwords = normStopwords(opts.stopwords);
    var sentences = splitSentences(text);
    var tokenized = [];
    for (var i = 0; i < sentences.length; i++) tokenized.push(tokenize(sentences[i], stopwords));
    var matrix = buildSimilarityMatrix(tokenized);
    var scores = textRank(matrix, {
        damping: opts.damping,
        maxIter: opts.maxIter,
        epsilon: opts.epsilon
    });
    var total = sentences.length;
    var kept = Math.max(1, Math.round(total * ratio));
    if (kept > total) kept = total;
    var order = [];
    for (var k = 0; k < total; k++) order.push(k);
    order.sort(function (a, b) { return scores[b] - scores[a]; });
    var picked = order.slice(0, kept).sort(function (a, b) { return a - b; });
    var outSentences = [], indices = [];
    for (var p = 0; p < picked.length; p++) {
        indices.push(picked[p]);
        outSentences.push(sentences[picked[p]]);
    }
    return { sentences: outSentences, indices: indices, total: total, kept: kept };
}

/* 文档内 TF 归一化关键词：[{word, score}] 按 score 降序。 */
function extractKeywords(text, topN, stopwords) {
    if (typeof text !== 'string' || !text.trim()) throw fldError('text', '文本必须为非空字符串');
    if (topN === undefined || topN === null) topN = DEFAULT_TOPN;
    if (!isPositiveInt(topN)) throw fldError('topN', 'topN 必须为正整数');
    var stopSet = buildStopSet(normStopwords(stopwords));
    var tokens = [];
    var i = 0, n = text.length;
    while (i < n) {
        var ch = text.charAt(i);
        if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')) {
            var j = i;
            while (j < n) {
                var c = text.charAt(j);
                if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9'))) break;
                j++;
            }
            var word = text.slice(i, j).toLowerCase();
            /* 单个英文/数字字符不成关键词；停用词过滤。 */
            if (word.length > 1 && !stopSet[word]) tokens.push(word);
            i = j;
        } else if (isCjk(ch)) {
            if (!stopSet[ch]) tokens.push(ch);
            i++;
        } else {
            i++;
        }
    }
    if (tokens.length === 0) return [];
    var freq = {};
    for (var t = 0; t < tokens.length; t++) {
        freq[tokens[t]] = (freq[tokens[t]] || 0) + 1;
    }
    var total = tokens.length;
    var arr = [];
    for (var w in freq) {
        if (Object.prototype.hasOwnProperty.call(freq, w)) {
            arr.push({ word: w, score: round4(freq[w] / total) });
        }
    }
    arr.sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return a.word < b.word ? -1 : (a.word > b.word ? 1 : 0);
    });
    return arr.slice(0, topN);
}

/* 输入上限兜底（默认 5 万字）。 */
function truncateText(text, maxChars) {
    if (typeof text !== 'string') throw fldError('text', '文本必须为字符串');
    if (maxChars === undefined || maxChars === null) maxChars = MAX_CHARS;
    if (!isPositiveInt(maxChars)) throw fldError('maxChars', 'maxChars 必须为正整数');
    if (text.length <= maxChars) return { text: text, truncated: false };
    return { text: text.slice(0, maxChars), truncated: true };
}

/* 文件名清洗（家族惯例），空回退 'text-summary'。 */
function sanitizeFileName(name) {
    var s = (name == null) ? '' : String(name);
    s = s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '');
    s = s.replace(/^[\s.]+|[\s.]+$/g, '').replace(/\s+/g, '-');
    if (s.length > 60) s = s.slice(0, 60).replace(/-+$/, '');
    if (s.length === 0) return 'text-summary';
    return s;
}

var API = {
    splitSentences: splitSentences,
    tokenize: tokenize,
    sentenceSimilarity: sentenceSimilarity,
    buildSimilarityMatrix: buildSimilarityMatrix,
    textRank: textRank,
    extractSummary: extractSummary,
    extractKeywords: extractKeywords,
    truncateText: truncateText,
    sanitizeFileName: sanitizeFileName,
    MAX_CHARS: MAX_CHARS,
    DAMPING: DAMPING,
    MAX_ITER: MAX_ITER,
    EPSILON: EPSILON,
    DEFAULT_RATIO: DEFAULT_RATIO,
    DEFAULT_TOPN: DEFAULT_TOPN,
    EN_STOPWORDS: EN_STOPWORDS,
    ZH_STOPWORDS: ZH_STOPWORDS,
    DEFAULT_STOPWORDS: DEFAULT_STOPWORDS
};

/* ---------------- 浏览器 UI 绑定（DOM 只做浏览器端） ---------------- */
function $(id) { return document.getElementById(id); }

function setStatus(msg) { var el = $('ts-status'); if (el) el.textContent = msg || ''; }
function setError(msg) {
    var el = $('ts-error');
    if (!el) return;
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
}
function showNote(msg) {
    var el = $('ts-note');
    if (!el) return;
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
}

function currentRatio() {
    var el = $('ts-ratio');
    var v = el ? parseInt(el.value, 10) : 30;
    if (!isFinite(v) || v < 10) v = 10;
    if (v > 50) v = 50;
    return v;
}

function renderResults(res, keywords, truncated) {
    var box = $('ts-result');
    if (!box) return;
    box.style.display = 'block';
    $('ts-stat').textContent = '共 ' + res.total + ' 句 · 按 ' +
        Math.round((res.kept / res.total) * 100) + '% 抽取 ' + res.kept + ' 句' +
        (truncated ? '（输入超 5 万字，已截断处理）' : '');
    var list = $('ts-sentences');
    list.innerHTML = '';
    for (var i = 0; i < res.sentences.length; i++) {
        var li = document.createElement('li');
        var idx = document.createElement('span');
        idx.className = 'ts-num';
        idx.textContent = (res.indices[i] + 1);
        li.appendChild(idx);
        li.appendChild(document.createTextNode(res.sentences[i]));
        list.appendChild(li);
    }
    var kw = $('ts-keywords');
    kw.innerHTML = '';
    for (var k = 0; k < keywords.length; k++) {
        var chip = document.createElement('span');
        chip.className = 'ts-chip';
        chip.textContent = keywords[k].word + ' ' + keywords[k].score.toFixed(4);
        chip.title = 'TF 归一化得分 ' + keywords[k].score.toFixed(4);
        kw.appendChild(chip);
    }
    if (keywords.length === 0) kw.textContent = '（无有效关键词）';
    $('ts-copy').disabled = false;
    $('ts-export').disabled = false;
}

function doSummarize() {
    setError('');
    showNote('');
    var raw = $('ts-input').value || '';
    var cut = truncateText(raw, MAX_CHARS);
    if (cut.truncated) showNote('输入超过 5 万字上限，仅处理前 5 万字。');
    try {
        var res = extractSummary(cut.text, currentRatio() / 100);
        var kws = extractKeywords(cut.text, DEFAULT_TOPN);
        renderResults(res, kws, cut.truncated);
        setStatus('摘要生成完成');
        window.__tsLast = { res: res, kws: kws };
    } catch (e) {
        setError('生成失败：' + (e && e.message ? e.message : e));
        setStatus('');
    }
}

function doCopy() {
    var last = window.__tsLast;
    if (!last) return;
    var text = last.res.sentences.join('\n');
    function done() { setStatus('已复制到剪贴板'); }
    function fail() { setError('复制失败，请手动选择复制'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fail);
    } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy') ? done() : fail(); }
        catch (e) { fail(); }
        document.body.removeChild(ta);
    }
}

function doExport() {
    var last = window.__tsLast;
    if (!last) return;
    var lines = [];
    lines.push('【文本摘要】（TextRank 提取式，共 ' + last.res.total + ' 句，抽取 ' + last.res.kept + ' 句）');
    lines.push('');
    for (var i = 0; i < last.res.sentences.length; i++) {
        lines.push('[' + (last.res.indices[i] + 1) + '] ' + last.res.sentences[i]);
    }
    lines.push('');
    lines.push('【关键词 Top ' + last.kws.length + '】');
    for (var k = 0; k < last.kws.length; k++) {
        lines.push(last.kws[k].word + ' (' + last.kws[k].score.toFixed(4) + ')');
    }
    var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = sanitizeFileName('') + '.txt';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
        URL.revokeObjectURL(a.href);
        document.body.removeChild(a);
    }, 500);
    setStatus('已导出 txt');
}

function onFileChosen(ev) {
    var f = ev.target.files && ev.target.files[0];
    if (!f) return;
    if (!/\.txt$/i.test(f.name) && f.type !== 'text/plain') {
        setError('仅支持 .txt 文本文件');
        ev.target.value = '';
        return;
    }
    var reader = new FileReader();
    reader.onload = function () {
        $('ts-input').value = String(reader.result || '');
        setStatus('已载入文件：' + f.name);
        setError('');
        ev.target.value = '';
    };
    reader.onerror = function () { setError('文件读取失败'); };
    reader.readAsText(f, 'UTF-8');
}

function bindUI() {
    var ratio = $('ts-ratio'), label = $('ts-ratio-label');
    function syncLabel() { if (label) label.textContent = currentRatio() + '%'; }
    if (ratio) { ratio.addEventListener('input', syncLabel); syncLabel(); }
    $('ts-run').addEventListener('click', doSummarize);
    $('ts-clear').addEventListener('click', function () {
        $('ts-input').value = '';
        $('ts-result').style.display = 'none';
        window.__tsLast = null;
        setStatus('');
        setError('');
        showNote('');
    });
    $('ts-copy').addEventListener('click', doCopy);
    $('ts-export').addEventListener('click', doExport);
    var file = $('ts-file');
    if (file) file.addEventListener('change', onFileChosen);
    var drop = $('ts-drop');
    if (drop) {
        drop.addEventListener('click', function () { file.click(); });
        drop.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); }
        });
        ['dragenter', 'dragover'].forEach(function (ev) {
            drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('dragover'); });
        });
        ['dragleave', 'drop'].forEach(function (ev) {
            drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('dragover'); });
        });
        drop.addEventListener('drop', function (e) {
            var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (!f) return;
            var dt = { target: { files: [f], value: '' } };
            onFileChosen(dt);
        });
    }
}

if (typeof window !== 'undefined') {
    window.TextSummarizer = API;
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bindUI);
        } else {
            bindUI();
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
}

})();
