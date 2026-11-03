/* 阅读时间估算器 - 中英混排文本阅读时长估算（纯前端）
 *
 * 功能：
 *   文本粘贴/键入（大文本友好，输入即实时统计）→ 中英混排字数统计
 *   （中文按字、英文按单词，分别展示）→ 默读/朗读两档语速估算
 *   （语速可调）→ 输出字数＋默读/朗读时长（分/秒）→ 一键复制结果。
 *   与文本工具集（/tools/text-tools）互链「写作一条龙」。
 *   脚本内无网络请求（无 fetch、无 XHR），文本只在浏览器本地计算。
 *
 * 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 *   countWords(text)
 *       -> {chinese, english, total}；
 *         chinese = CJK 字符数（[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u30ff\uac00-\ud7af] 按字计）；
 *         english = 英文单词数（[A-Za-z]+ 连续序列按词计）；
 *         total = chinese + english + 标点符号数
 *           （标点 = 非 CJK、非英文字母、非数字、非空白的剩余字符；标点不计入字数但计入 total）；
 *         text 非字符串抛 Error，err.field='text'。
 *   estimateReadingTime(text, mode, wpm)
 *       -> {seconds, minutes, display}；
 *         mode 仅 'silent'（默读）/'aloud'（朗读），其他值抛 Error，err.field='mode'；
 *         wpm 可选自定义 {chinese, english}（字/分、词/分），缺省按 mode 取默认值
 *           silent={chinese:400, english:200}、aloud={chinese:220, english:140}；
 *           wpm 非对象或任一语速非正有限数抛 Error，err.field='wpm'；
 *         seconds = ceil(chinese/wpm.chinese*60 + english/wpm.english*60)，最小 1 秒；
 *         minutes = floor(seconds/60)；display = formatDuration(seconds)；
 *         text 非字符串抛 Error，err.field='text'（由 countWords 抛出）。
 *   formatDuration(seconds)
 *       -> 秒数非整数/负数/非有限数抛 Error，err.field='seconds'；
 *         <60 秒返回 '约 X 秒'，≥60 秒返回 '约 N 分 M 秒'（M 为 0 时返回 '约 N 分'）。
 *   DEFAULT_WPM：两档默认语速 {silent:{chinese:400,english:200}, aloud:{chinese:220,english:140}}。
 *
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；
 * Node 自测：module.exports 暴露纯函数。挂 window.ReadingTime。
 */
(function () {
'use strict';

/* ================= 纯函数 ================= */

function err(field, msg) {
    var e = new Error(msg);
    e.field = field;
    return e;
}

/* CJK：基本区＋扩展 A＋平假名/片假名＋谚文音节（与规格逐字一致） */
var CJK_RE = /[一-鿿㐀-䶿぀-ヿ가-힯]/g;
var EN_WORD_RE = /[A-Za-z]+/g;
var NON_PUNCT_RE = /[0-9\s]/g;

var DEFAULT_WPM = {
    silent: { chinese: 400, english: 200 },
    aloud: { chinese: 220, english: 140 }
};

function isFiniteNum(v) {
    return typeof v === 'number' && isFinite(v);
}

/**
 * 中英混排字数统计：中文按字、英文按单词。
 * @param {string} text
 * @returns {{chinese:number, english:number, total:number}}
 */
function countWords(text) {
    if (typeof text !== 'string') {
        throw err('text', 'countWords: text 必须为字符串');
    }
    var chinese = (text.match(CJK_RE) || []).length;
    var english = (text.match(EN_WORD_RE) || []).length;
    /* 标点：去掉 CJK、英文字母序列、数字、空白后剩余字符 */
    var rest = text.replace(CJK_RE, '').replace(EN_WORD_RE, '').replace(NON_PUNCT_RE, '');
    var punct = rest.length;
    return { chinese: chinese, english: english, total: chinese + english + punct };
}

/**
 * 阅读时长估算。
 * @param {string} text
 * @param {string} mode 'silent' | 'aloud'
 * @param {{chinese:number, english:number}} [wpm] 可选自定义语速
 * @returns {{seconds:number, minutes:number, display:string}}
 */
function estimateReadingTime(text, mode, wpm) {
    if (mode !== 'silent' && mode !== 'aloud') {
        throw err('mode', "estimateReadingTime: mode 仅支持 'silent'/'aloud'");
    }
    var w = DEFAULT_WPM[mode];
    if (wpm !== undefined && wpm !== null) {
        if (typeof wpm !== 'object' ||
            !isFiniteNum(wpm.chinese) || wpm.chinese <= 0 ||
            !isFiniteNum(wpm.english) || wpm.english <= 0) {
            throw err('wpm', 'estimateReadingTime: wpm 必须为 {chinese, english} 且均为正数');
        }
        w = { chinese: wpm.chinese, english: wpm.english };
    }
    var c = countWords(text);
    var seconds = Math.ceil(c.chinese / w.chinese * 60 + c.english / w.english * 60);
    if (seconds < 1) { seconds = 1; }
    return {
        seconds: seconds,
        minutes: Math.floor(seconds / 60),
        display: formatDuration(seconds)
    };
}

/**
 * 秒数格式化为中文时长。
 * @param {number} seconds 非负整数秒
 * @returns {string}
 */
function formatDuration(seconds) {
    if (!isFiniteNum(seconds) || Math.floor(seconds) !== seconds || seconds < 0) {
        throw err('seconds', 'formatDuration: seconds 必须为非负整数');
    }
    if (seconds < 60) {
        return '约 ' + seconds + ' 秒';
    }
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    if (s === 0) {
        return '约 ' + m + ' 分';
    }
    return '约 ' + m + ' 分 ' + s + ' 秒';
}

/* 无「约」前缀的时长，供复制文案拼装（形如 "1 分 30 秒"/"45 秒"/"2 分"） */
function durNoPrefix(seconds) {
    return formatDuration(seconds).replace(/^约 /, '');
}

var ReadingTime = {
    countWords: countWords,
    estimateReadingTime: estimateReadingTime,
    formatDuration: formatDuration,
    DEFAULT_WPM: DEFAULT_WPM
};

if (typeof window !== 'undefined') {
    window.ReadingTime = ReadingTime;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ReadingTime;
}

/* ================= 浏览器 UI ================= */

function $(id) { return document.getElementById(id); }

function readWpm(prefix, fallback) {
    var zh = parseFloat($('rt-wpm-' + prefix + '-zh').value);
    var en = parseFloat($('rt-wpm-' + prefix + '-en').value);
    return {
        chinese: (isFinite(zh) && zh > 0) ? zh : fallback.chinese,
        english: (isFinite(en) && en > 0) ? en : fallback.english
    };
}

function render() {
    var text = $('rt-input').value;
    var c;
    try {
        c = countWords(text);
    } catch (e) {
        return;
    }
    $('rt-chinese').textContent = c.chinese;
    $('rt-english').textContent = c.english;
    $('rt-total').textContent = c.total;

    var silent = estimateReadingTime(text, 'silent', readWpm('silent', DEFAULT_WPM.silent));
    var aloud = estimateReadingTime(text, 'aloud', readWpm('aloud', DEFAULT_WPM.aloud));
    $('rt-silent').textContent = silent.display;
    $('rt-aloud').textContent = aloud.display;
}

function copyResult() {
    var text = $('rt-input').value;
    var c = countWords(text);
    var words = c.chinese + c.english;
    var silent = estimateReadingTime(text, 'silent', readWpm('silent', DEFAULT_WPM.silent));
    var aloud = estimateReadingTime(text, 'aloud', readWpm('aloud', DEFAULT_WPM.aloud));
    var s = '约' + words + '字（中文' + c.chinese + '字、英文' + c.english + '词），' +
        '默读约' + durNoPrefix(silent.seconds) + '，朗读约' + durNoPrefix(aloud.seconds) + '。';
    var done = function () { toast('已复制：' + s); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(s).then(done, function () { fallbackCopy(s, done); });
    } else {
        fallbackCopy(s, done);
    }
}

function fallbackCopy(s, done) {
    var ta = document.createElement('textarea');
    ta.value = s;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    done();
}

var toastTimer = null;
function toast(msg) {
    var t = $('rt-toast');
    t.textContent = msg;
    t.style.display = 'block';
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () { t.style.display = 'none'; }, 2600);
}

function fillSample() {
    $('rt-input').value = '写作前先估字，写作后估时。\n' +
        'Reading time matters: readers decide in seconds whether to keep reading. ' +
        '一篇公众号文章如果太长，读者可能读到一半就划走；' +
        '提前估算默读与朗读时长，能帮你把篇幅控制在读者愿意读完的范围里。\n' +
        '把这段示例文字替换成你自己的文章，看看默读和朗读各需要多久。';
    render();
}

function init() {
    if (!document.getElementById('rt-app')) { return; }
    $('rt-wpm-silent-zh').value = DEFAULT_WPM.silent.chinese;
    $('rt-wpm-silent-en').value = DEFAULT_WPM.silent.english;
    $('rt-wpm-aloud-zh').value = DEFAULT_WPM.aloud.chinese;
    $('rt-wpm-aloud-en').value = DEFAULT_WPM.aloud.english;
    $('rt-input').addEventListener('input', render);
    var ids = ['rt-wpm-silent-zh', 'rt-wpm-silent-en', 'rt-wpm-aloud-zh', 'rt-wpm-aloud-en'];
    ids.forEach(function (id) { $(id).addEventListener('input', render); });
    $('rt-copy').addEventListener('click', copyResult);
    $('rt-clear').addEventListener('click', function () { $('rt-input').value = ''; render(); });
    $('rt-sample').addEventListener('click', fillSample);
    render();
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}

})();
