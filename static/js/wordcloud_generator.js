/* 词云生成器（wordcloud_generator）纯前端核心逻辑
 * 纯函数经 module.exports 暴露，node tests/wordcloud_generator.test.js 自测；
 * 浏览器端：window.WordcloudGenerator 全局 + DOM 装配（本文件末尾）。
 *
 * 分词规则：
 * - 英文／数字按字母数字序列切分并小写归一，命中内置停用词表则过滤；
 * - 中文：以连续中文字符为一段；空格／标点分隔出的 1–2 字中文词组按词组计，
 *   无空格的较长连续中文按单字计（例：「开发 工具」计 开发、工具；
 *   「开发工具很棒」计 开、发、工、具、很、棒）；中英文同表统计、按频次统一排序；
 * - 纯标点与空白不计入。
 *
 * 字号映射：频次在该批最大值与最小值之间线性映射到 16–96px；
 * 频次全相等时全部取中值 56px。
 *
 * 布局：词语按频次降序依次放置，中心起阿基米德式螺旋（黄金角）试探位置，
 * 矩形碰撞检测（宽高以调用方传入的测宽函数为准，浏览器下用 Canvas
 * measureText 实测）；试探上限内无空位时跳过该词并计入 skipped，不静默丢词。
 * 布局接受种子参数：同种子同布局（起始角由种子派生），不同种子可不同。
 *
 * 零 fetch/XHR：纯本地处理，不发起任何网络请求。
 */
(function () {
"use strict";

var SAMPLE = "开发 工具 让 开发 更高效 development 工具 帮助 开发 团队 the 快速 构建 development 原型 and 开发 工具 支持 development 协作 开发 让 工具 更好用";

/* 内置英文常用停用词表（60+ 词，the／and／of 等均在内）。 */
var STOPWORDS = [
    "the", "and", "of", "to", "a", "in", "is", "it", "you", "that",
    "he", "was", "for", "on", "are", "as", "with", "his", "they", "i",
    "at", "be", "this", "have", "from", "or", "one", "had", "by", "but",
    "not", "what", "all", "were", "we", "when", "your", "can", "said", "there",
    "use", "an", "each", "which", "she", "do", "how", "their", "will", "up",
    "other", "about", "out", "many", "then", "them", "these", "so", "some", "her",
    "would", "make", "like", "him", "into", "time", "has", "look", "two", "more"
];
var STOP_SET = {};
for (var s = 0; s < STOPWORDS.length; s++) { STOP_SET[STOPWORDS[s]] = true; }

function isStopword(word) { return !!STOP_SET[word]; }

/* 是否为中文字符（CJK 统一表意文字常用区）。 */
function isCjk(ch) {
    var code = ch.charCodeAt(0);
    return code >= 0x4E00 && code <= 0x9FFF;
}
function isLatinDigit(ch) {
    return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9");
}

/* 分词：返回 token 数组（英文已小写归一、停用词已过滤）。 */
function tokenize(text) {
    var tokens = [];
    var i = 0;
    while (i < text.length) {
        var ch = text.charAt(i);
        if (isLatinDigit(ch)) {
            var j = i;
            while (j < text.length && isLatinDigit(text.charAt(j))) j++;
            var word = text.slice(i, j).toLowerCase();
            if (!isStopword(word)) tokens.push(word);
            i = j;
        } else if (isCjk(ch)) {
            var k = i;
            while (k < text.length && isCjk(text.charAt(k))) k++;
            var run = text.slice(i, k);
            if (run.length <= 2) {
                tokens.push(run);
            } else {
                for (var t = 0; t < run.length; t++) tokens.push(run.charAt(t));
            }
            i = k;
        } else {
            i++;
        }
    }
    return tokens;
}

/* 词频统计：按频次降序、同频按首次出现顺序排列。
 * 返回 [{word, count}]。 */
function countFreq(text) {
    var tokens = tokenize(text);
    var map = {};
    var order = [];
    for (var i = 0; i < tokens.length; i++) {
        var tok = tokens[i];
        if (map[tok] === undefined) { map[tok] = 0; order.push(tok); }
        map[tok]++;
    }
    var list = [];
    for (var o = 0; o < order.length; o++) {
        list.push({ word: order[o], count: map[order[o]], first: o });
    }
    list.sort(function (a, b) {
        if (b.count !== a.count) return b.count - a.count;
        return a.first - b.first;
    });
    for (var q = 0; q < list.length; q++) delete list[q].first;
    return list;
}

/* 钳制整数到 [min, max]；返回 {value, clamped}。非数值视为 min。 */
function clampInt(raw, min, max) {
    var n = parseInt(raw, 10);
    if (isNaN(n)) return { value: min, clamped: true };
    if (n < min) return { value: min, clamped: true };
    if (n > max) return { value: max, clamped: true };
    return { value: n, clamped: false };
}

/* 按最大词数与最小词频过滤词频表。 */
function filterWords(list, maxWords, minFreq) {
    var out = [];
    for (var i = 0; i < list.length && out.length < maxWords; i++) {
        if (list[i].count >= minFreq) out.push(list[i]);
    }
    return out;
}

/* 字号映射：16–96px 线性映射，全相等取中值 56px。 */
function mapFontSize(count, minCount, maxCount) {
    if (maxCount === minCount) return 56;
    var size = 16 + (count - minCount) * (96 - 16) / (maxCount - minCount);
    return Math.round(size);
}

/* 种子随机数（mulberry32）：同种子同序列。 */
function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* 螺旋占位布局。
 * items: [{word, count}]（调用方已排序）；measure(word, fontSize) -> {width, height}。
 * 返回 {placements: [{word, count, fontSize, x, y, w, h}], skipped: number}，
 * 其中 (x, y) 为矩形中心坐标。 */
function layoutWords(items, width, height, seed, measure) {
    var placements = [];
    var skipped = 0;
    if (items.length === 0) return { placements: placements, skipped: 0 };
    var maxCount = items[0].count;
    var minCount = items[items.length - 1].count;
    var rng = mulberry32(seed);
    var startAngle = rng() * Math.PI * 2;
    var cx = width / 2, cy = height / 2;
    var GOLDEN = 2.399963;
    for (var wi = 0; wi < items.length; wi++) {
        var item = items[wi];
        var fontSize = mapFontSize(item.count, minCount, maxCount);
        var m = measure(item.word, fontSize);
        var w = m.width, h = m.height;
        var placed = null;
        for (var attempt = 0; attempt < 6000; attempt++) {
            var angle = startAngle + attempt * GOLDEN;
            var radius = 12 * Math.sqrt(attempt);
            var x = cx + radius * Math.cos(angle);
            var y = cy + radius * Math.sin(angle);
            var left = x - w / 2, top = y - h / 2;
            if (left < 1 || top < 1 || left + w > width - 1 || top + h > height - 1) continue;
            var clash = false;
            for (var p = 0; p < placements.length; p++) {
                var q = placements[p];
                if (left < q.x + q.w / 2 && left + w > q.x - q.w / 2 &&
                    top < q.y + q.h / 2 && top + h > q.y - q.h / 2) { clash = true; break; }
            }
            if (!clash) { placed = { word: item.word, count: item.count, fontSize: fontSize, x: x, y: y, w: w, h: h }; break; }
        }
        if (placed) placements.push(placed);
        else skipped++;
    }
    return { placements: placements, skipped: skipped };
}

/* 三套配色：经典多彩／单色蓝／暖色。 */
var PALETTES = {
    classic: ["#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4", "#42d4f4", "#f032e6", "#bfef45", "#fabed4"],
    blue: ["#0b3d91", "#1565c0", "#1e88e5", "#42a5f5", "#64b5f6", "#90caf9", "#0d47a1", "#1976d2", "#2196f3", "#82b1ff"],
    warm: ["#b71c1c", "#e65100", "#f57f17", "#ff8f00", "#ffb300", "#ff6f00", "#d84315", "#ef6c00", "#ffa000", "#ffab91"]
};
function colorFor(index, paletteName) {
    var pal = PALETTES[paletteName] || PALETTES.classic;
    return pal[index % pal.length];
}

/* 词频表纯文本：每行「词：频次」。 */
function formatFreqTable(words) {
    var lines = [];
    for (var i = 0; i < words.length; i++) lines.push(words[i].word + "：" + words[i].count);
    return lines.join("\n");
}

/* 输入处理主入口（供 DOM 与测试共用）：
 * 空输入 -> ok:false + 「请粘贴或输入文本」；
 * 有效词为 0 -> ok:false + 「未找到有效词语，请检查输入或调低最小词频」；
 * 否则 ok:true + 过滤后词频表。 */
function processInput(text, opts) {
    opts = opts || {};
    if (!text || text.trim().length === 0) {
        return { ok: false, error: "请粘贴或输入文本", words: [] };
    }
    var maxWords = clampInt(opts.maxWords === undefined ? 50 : opts.maxWords, 10, 200);
    var minFreq = clampInt(opts.minFreq === undefined ? 2 : opts.minFreq, 1, 10);
    var all = countFreq(text);
    if (all.length === 0) {
        return { ok: false, error: "未找到有效词语，请检查输入或调低最小词频", words: [] };
    }
    var words = filterWords(all, maxWords.value, minFreq.value);
    if (words.length === 0) {
        return { ok: false, error: "未找到有效词语，请检查输入或调低最小词频", words: [] };
    }
    return { ok: true, error: "", words: words, maxWords: maxWords, minFreq: minFreq };
}

var api = {
    SAMPLE: SAMPLE,
    STOPWORDS: STOPWORDS,
    PALETTES: PALETTES,
    isStopword: isStopword,
    tokenize: tokenize,
    countFreq: countFreq,
    clampInt: clampInt,
    filterWords: filterWords,
    mapFontSize: mapFontSize,
    mulberry32: mulberry32,
    layoutWords: layoutWords,
    colorFor: colorFor,
    formatFreqTable: formatFreqTable,
    processInput: processInput
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
}
if (typeof window !== "undefined") {
    window.WordcloudGenerator = api;
}

/* ================= 浏览器 DOM 装配（仅浏览器分支执行） ================= */
if (typeof document !== "undefined" && typeof window !== "undefined") {
    function $(id) { return document.getElementById(id); }
    var seedValue = 42;
    var timer = null;

    function readControls() {
        var maxRaw = $("wc-max") ? $("wc-max").value : 50;
        var minRaw = $("wc-min") ? $("wc-min").value : 2;
        var maxWords = clampInt(maxRaw, 10, 200);
        var minFreq = clampInt(minRaw, 1, 10);
        if ($("wc-max") && String(maxWords.value) !== String(maxRaw)) $("wc-max").value = maxWords.value;
        if ($("wc-min") && String(minFreq.value) !== String(minRaw)) $("wc-min").value = minFreq.value;
        var palette = $("wc-palette") ? $("wc-palette").value : "classic";
        var sizeVal = $("wc-size") ? $("wc-size").value : "800x500";
        var parts = sizeVal.split("x");
        return {
            maxWords: maxWords, minFreq: minFreq, palette: palette,
            width: parseInt(parts[0], 10) || 800, height: parseInt(parts[1], 10) || 500,
            seed: $("wc-seed") ? (parseInt($("wc-seed").value, 10) || 0) : seedValue
        };
    }

    function render() {
        var input = $("wc-input"), canvas = $("wc-canvas");
        var msg = $("wc-msg"), table = $("wc-table"), skippedEl = $("wc-skipped"), clampEl = $("wc-clamp");
        if (!input || !canvas) return;
        var ctl = readControls();
        var notes = [];
        if (ctl.maxWords.clamped) notes.push("最大词数超出范围，已钳制到 10–200 内");
        if (ctl.minFreq.clamped) notes.push("最小词频超出范围，已钳制到 1–10 内");
        if (clampEl) clampEl.textContent = notes.join("；");
        var res = processInput(input.value, { maxWords: ctl.maxWords.value, minFreq: ctl.minFreq.value });
        canvas.width = ctl.width;
        canvas.height = ctl.height;
        var ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, ctl.width, ctl.height);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, ctl.width, ctl.height);
        if (table) { while (table.firstChild) table.removeChild(table.firstChild); }
        if (!res.ok) {
            if (msg) { msg.textContent = res.error; msg.className = "wc-msg wc-msg-error"; }
            if (skippedEl) skippedEl.textContent = "";
            canvas._wcWords = [];
            return;
        }
        function measure(word, fontSize) {
            ctx.font = fontSize + "px sans-serif";
            return { width: ctx.measureText(word).width, height: fontSize };
        }
        var laid = layoutWords(res.words, ctl.width, ctl.height, ctl.seed, measure);
        for (var i = 0; i < laid.placements.length; i++) {
            var pl = laid.placements[i];
            ctx.font = pl.fontSize + "px sans-serif";
            ctx.fillStyle = colorFor(i, ctl.palette);
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(pl.word, pl.x, pl.y);
        }
        if (msg) {
            msg.textContent = "词云已生成：共 " + res.words.length + " 个词，画布 " + ctl.width + "×" + ctl.height;
            msg.className = "wc-msg wc-msg-ok";
        }
        if (skippedEl) {
            skippedEl.textContent = laid.skipped > 0
                ? laid.skipped + " 个词因空间不足未显示" : "";
        }
        if (table) {
            for (var t = 0; t < res.words.length; t++) {
                var row = document.createElement("div");
                row.className = "wc-row";
                var wSpan = document.createElement("span");
                wSpan.className = "wc-word";
                wSpan.textContent = res.words[t].word;
                var cSpan = document.createElement("span");
                cSpan.className = "wc-count";
                cSpan.textContent = res.words[t].count;
                row.appendChild(wSpan);
                row.appendChild(cSpan);
                table.appendChild(row);
            }
        }
        canvas._wcWords = res.words;
    }

    function scheduleRender() {
        if (timer) clearTimeout(timer);
        timer = setTimeout(render, 300);
    }

    function downloadPng() {
        var canvas = $("wc-canvas");
        var msg = $("wc-msg");
        if (!canvas) return;
        try {
            var a = document.createElement("a");
            a.href = canvas.toDataURL("image/png");
            a.download = "wordcloud.png";
            a.click();
            if (msg) { msg.textContent = "词云 PNG 已下载（wordcloud.png）"; msg.className = "wc-msg wc-msg-ok"; }
        } catch (e) {
            if (msg) { msg.textContent = "下载失败：浏览器不支持 Canvas 导出，请换浏览器重试"; msg.className = "wc-msg wc-msg-error"; }
        }
    }

    function copyTable() {
        var canvas = $("wc-canvas");
        var msg = $("wc-msg");
        var words = (canvas && canvas._wcWords) || [];
        if (words.length === 0) {
            if (msg) { msg.textContent = "没有可复制的词频表：请先输入文本并生成词云"; msg.className = "wc-msg wc-msg-error"; }
            return;
        }
        var text = formatFreqTable(words);
        function fallback() {
            var ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            var ok = false;
            try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
            document.body.removeChild(ta);
            if (msg) {
                if (ok) { msg.textContent = "已复制词频表"; msg.className = "wc-msg wc-msg-ok"; }
                else { msg.textContent = "复制失败：浏览器未授权剪贴板，请手动全选词频表复制"; msg.className = "wc-msg wc-msg-error"; }
            }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                if (msg) { msg.textContent = "已复制词频表"; msg.className = "wc-msg wc-msg-ok"; }
            }, fallback);
        } else {
            fallback();
        }
    }

    function bind(id, evt, fn) {
        var el = $(id);
        if (el) el.addEventListener(evt, fn);
    }
    bind("wc-input", "input", scheduleRender);
    bind("wc-max", "change", render);
    bind("wc-min", "change", render);
    bind("wc-palette", "change", render);
    bind("wc-size", "change", render);
    bind("wc-seed", "change", render);
    bind("wc-download", "click", downloadPng);
    bind("wc-copy", "click", copyTable);
    bind("wc-sample", "click", function () {
        var input = $("wc-input");
        if (input) input.value = SAMPLE;
        render();
    });
    bind("wc-clear", "click", function () {
        var input = $("wc-input");
        if (input) input.value = "";
        render();
    });
    bind("wc-reshuffle", "click", function () {
        seedValue = Math.floor(Math.random() * 100000);
        var seedEl = $("wc-seed");
        if (seedEl) seedEl.value = seedValue;
        render();
    });
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", render);
    } else {
        render();
    }
}
})();
