/* 打字练习 - 三类练习文本 + 实时键盘监听 + WPM/准确率统计（纯前端）
 *
 * 功能：
 *   练习文本三类（英文名言 / 代码片段 / 中文美文，内置文本库）
 *   → 实时键盘监听（逐字符对错着色 + 当前字符高亮）
 *   → 实时统计（WPM 标准 5 字符=1 词 / 准确率 / 用时 / 进度）
 *   → 错键 Top 统计（每键错误次数降序排行）
 *   → localStorage 历史最佳（各文本类目最优 WPM/准确率）
 *   → 重新开始 / 换文一键操作
 *   → 真限制页面明示（本地时钟计时差异 / localStorage 配额丢失 / 不上传服务器）
 *   纯本地处理，数据不出浏览器；脚本内无网络请求。
 *
 * 纯函数契约（浏览器/Node 通用；非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 *   buildTargets(text)
 *       -> string[]：逐字符数组；
 *         text 非字符串抛 Error，err.field='text'；
 *         空文本抛 Error，err.field='text'。
 *   initSession(text, mode)
 *       -> {text, mode, targets, typed: [], errors: 0, keyErrors: {}, startedAt: 0}；
 *         mode 非 'en'/'code'/'zh' 之一抛 Error，err.field='mode'；
 *         text 非法由 buildTargets 抛 Error，err.field='text'。
 *   applyKeystroke(session, key)
 *       -> session（原地更新并返回同一引用）：命中 targets[typed.length]，
 *         正确则 typed 追加 {char, correct:true}，错误则追加 {char, correct:false}、
 *         errors+1 且 keyErrors[key]++；
 *         session 结构不合抛 Error，err.field='session'；
 *         key 非单字符抛 Error，err.field='key'；
 *         文本已打完仍输入抛 Error，err.field='key'（不静默钳制超长输入）。
 *   calcStats(session, elapsedMs)
 *       -> {wpm, accuracy, elapsedMs, progress, charsTyped, charsCorrect}；
 *         wpm=(correct/5)/(elapsedMs/60000)，保留 1 位小数；
 *         accuracy=correct/typed*100（百分比，保留 1 位小数；未输入为 0）；
 *         progress=typed/targets（保留 3 位小数）；
 *         session 非法抛 Error，err.field='session'；
 *         elapsedMs 非数字/非有限/为负抛 Error，err.field='elapsedMs'
 *         （elapsedMs=0 时 wpm 计 0，避免除零）。
 *   topErrors(keyErrors, n)
 *       -> [{key, count}]：按 count 降序，count 相同按 key 升序（确定性）；
 *         n 缺省 5；
 *         keyErrors 非对象抛 Error，err.field='keyErrors'；
 *         n 非正整数抛 Error，err.field='n'。
 *   updateBest(best, mode, stats)
 *       -> newBest（不可变返回，不改原 best）：仅当该 mode 无记录、
 *         或 stats.wpm 更高、或 wpm 相等且 stats.accuracy 更高时更新；
 *         best 非对象（null 视为无记录）抛 Error，err.field='best'；
 *         mode 非法抛 Error，err.field='mode'；
 *         stats 非 {wpm: 有限数, accuracy: 有限数} 抛 Error，err.field='stats'。
 *   sanitizeFileName(text)（沿用家族惯例）
 *       -> 清洗非法文件名字符（\/:*?"<>| 与控制字符），空白转 '-'，
 *         超 60 字符截断；空结果回退 'typing-practice'。
 *
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；
 * Node 自测：module.exports 暴露纯函数与文本库。
 */
(function () {
'use strict';

/* ================= 纯函数 ================= */

function fail(field, message) {
    var e = new Error(message);
    e.field = field;
    throw e;
}

var MODES = ['en', 'code', 'zh'];

function buildTargets(text) {
    if (typeof text !== 'string') fail('text', 'text 须为字符串，实得：' + String(text));
    if (text.length === 0) fail('text', 'text 不能为空字符串');
    return text.split('');
}

function isSession(s) {
    return !!s && typeof s === 'object' && !Array.isArray(s) &&
        Array.isArray(s.targets) && Array.isArray(s.typed) &&
        typeof s.errors === 'number' && !!s.keyErrors && typeof s.keyErrors === 'object' &&
        !Array.isArray(s.keyErrors);
}

function initSession(text, mode) {
    if (MODES.indexOf(mode) === -1) fail('mode', "mode 须为 'en'/'code'/'zh' 之一，实得：" + String(mode));
    return {
        text: text,
        mode: mode,
        targets: buildTargets(text),
        typed: [],
        errors: 0,
        keyErrors: {},
        startedAt: 0
    };
}

function applyKeystroke(session, key) {
    if (!isSession(session)) fail('session', 'session 结构不合：须含 targets/typed/errors/keyErrors');
    if (typeof key !== 'string' || key.length !== 1) fail('key', 'key 须为单字符，实得：' + String(key));
    if (session.typed.length >= session.targets.length)
        fail('key', '文本已打完：超长输入不被静默钳制');
    var idx = session.typed.length;
    var correct = (key === session.targets[idx]);
    session.typed.push({ char: key, correct: correct });
    if (!correct) {
        session.errors += 1;
        session.keyErrors[key] = (session.keyErrors[key] || 0) + 1;
    }
    return session;
}

function round1(x) { return Math.round(x * 10) / 10; }

function calcStats(session, elapsedMs) {
    if (!isSession(session)) fail('session', 'session 非法');
    if (typeof elapsedMs !== 'number' || !isFinite(elapsedMs) || elapsedMs < 0)
        fail('elapsedMs', 'elapsedMs 须为非负有限数字，实得：' + String(elapsedMs));
    var correct = 0, i;
    for (i = 0; i < session.typed.length; i++) {
        if (session.typed[i] && session.typed[i].correct) correct++;
    }
    var typedCount = session.typed.length;
    var minutes = elapsedMs / 60000;
    var wpm = minutes > 0 ? (correct / 5) / minutes : 0;
    var accuracy = typedCount > 0 ? (correct / typedCount) * 100 : 0;
    return {
        wpm: round1(wpm),
        accuracy: round1(accuracy),
        elapsedMs: elapsedMs,
        progress: Math.round((typedCount / session.targets.length) * 1000) / 1000,
        charsTyped: typedCount,
        charsCorrect: correct
    };
}

function topErrors(keyErrors, n) {
    if (!keyErrors || typeof keyErrors !== 'object' || Array.isArray(keyErrors))
        fail('keyErrors', 'keyErrors 须为对象，实得：' + String(keyErrors));
    if (n === undefined) n = 5;
    if (typeof n !== 'number' || Math.floor(n) !== n || n <= 0)
        fail('n', 'n 须为正整数，实得：' + String(n));
    var arr = Object.keys(keyErrors).map(function (k) {
        return { key: k, count: keyErrors[k] };
    });
    arr.sort(function (a, b) {
        if (b.count !== a.count) return b.count - a.count;
        return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0);
    });
    return arr.slice(0, n);
}

function updateBest(best, mode, stats) {
    if (best !== null && (typeof best !== 'object' || Array.isArray(best)))
        fail('best', 'best 须为对象或 null，实得：' + String(best));
    if (MODES.indexOf(mode) === -1) fail('mode', "mode 须为 'en'/'code'/'zh' 之一，实得：" + String(mode));
    if (!stats || typeof stats !== 'object' ||
        typeof stats.wpm !== 'number' || !isFinite(stats.wpm) ||
        typeof stats.accuracy !== 'number' || !isFinite(stats.accuracy))
        fail('stats', 'stats 须为 {wpm: 有限数, accuracy: 有限数}');
    var out = {};
    if (best) {
        Object.keys(best).forEach(function (k) { out[k] = best[k]; });
    }
    var prev = out[mode];
    var better = !prev || typeof prev.wpm !== 'number' ||
        stats.wpm > prev.wpm ||
        (stats.wpm === prev.wpm && stats.accuracy > prev.accuracy);
    if (better) out[mode] = { wpm: stats.wpm, accuracy: stats.accuracy };
    return out;
}

/* 文件名清洗（家族惯例：与 mental_math_quiz 一致的清洗规则） */
function sanitizeFileName(text) {
    var s = text == null ? '' : String(text);
    s = s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '');
    s = s.replace(/^[\s.]+|[\s.]+$/g, '').replace(/\s+/g, '-');
    if (s.length > 60) s = s.slice(0, 60).replace(/-+$/, '');
    if (s.length === 0) return 'typing-practice';
    return s;
}

/* ================= 内置练习文本库 ================= */

var TEXTS = {
    en: [
        "The only way to do great work is to love what you do.",
        "Stay hungry, stay foolish.",
        "In the middle of difficulty lies opportunity.",
        "The best time to plant a tree was twenty years ago. The second best time is now.",
        "Success is not final, failure is not fatal: it is the courage to continue that counts."
    ],
    code: [
        "function greet(name) {\n  return \"Hello, \" + name + \"!\";\n}",
        "for i := 0; i < 10; i++ {\n    fmt.Println(i)\n}",
        "const sum = (a, b) => a + b;",
        "if (err != nil) {\n    log.Fatal(err)\n}",
        "SELECT id, name FROM users WHERE age > 18 ORDER BY name;"
    ],
    zh: [
        "山川异域，风月同天。寄诸佛子，共结来缘。",
        "落霞与孤鹜齐飞，秋水共长天一色。",
        "生活不止眼前的苟且，还有诗和远方的田野。",
        "面朝大海，春暖花开。",
        "路漫漫其修远兮，吾将上下而求索。"
    ]
};

var MODE_NAMES = { en: '英文名言', code: '代码片段', zh: '中文美文' };

var API = {
    buildTargets: buildTargets,
    initSession: initSession,
    applyKeystroke: applyKeystroke,
    calcStats: calcStats,
    topErrors: topErrors,
    updateBest: updateBest,
    sanitizeFileName: sanitizeFileName,
    TEXTS: TEXTS,
    MODES: MODES,
    MODE_NAMES: MODE_NAMES
};

/* ================= 浏览器 UI ================= */

var BEST_KEY = 'typing_practice_best_v1';

function $(id) { return document.getElementById(id); }

function loadBest() {
    try {
        var raw = localStorage.getItem(BEST_KEY);
        if (!raw) return null;
        var b = JSON.parse(raw);
        return (b && typeof b === 'object' && !Array.isArray(b)) ? b : null;
    } catch (e) { return null; }
}

function saveBest(best) {
    try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch (e) { /* 配额不足等：静默跳过 */ }
}

function toast(msg) {
    var el = $('tp-toast');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(function () { el.style.display = 'none'; }, 2200);
}

function fmtTime(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    s = s % 60;
    return (m < 10 ? '0' + m : String(m)) + ':' + (s < 10 ? '0' + s : String(s));
}

function fmtStamp(d) {
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' +
        p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

var S = {
    session: null,
    timerId: null,
    textIndex: 0,
    finished: false
};

function typedString() {
    return S.session.typed.map(function (t) { return t.char; }).join('');
}

function newSession(mode, textIndex) {
    stopTimer();
    S.textIndex = textIndex;
    S.finished = false;
    S.session = initSession(TEXTS[mode][textIndex], mode);
    $('tp-input').value = '';
    $('tp-result').style.display = 'none';
    renderText();
    renderStats();
    renderTopErrors();
    renderBest();
}

function renderText() {
    var box = $('tp-text');
    var frag = document.createDocumentFragment();
    var targets = S.session.targets;
    var typed = S.session.typed;
    for (var i = 0; i < targets.length; i++) {
        var sp = document.createElement('span');
        sp.className = 'tp-char';
        sp.textContent = targets[i];
        if (i < typed.length) {
            sp.className += typed[i].correct ? ' tp-ok' : ' tp-bad';
        } else if (i === typed.length) {
            sp.className += ' tp-current';
        } else {
            sp.className += ' tp-pending';
        }
        frag.appendChild(sp);
    }
    box.innerHTML = '';
    box.appendChild(frag);
}

function elapsedMs() {
    if (!S.session.startedAt) return 0;
    return Date.now() - S.session.startedAt;
}

function renderStats() {
    var st = calcStats(S.session, elapsedMs());
    $('tp-wpm').textContent = st.wpm.toFixed(1);
    $('tp-acc').textContent = st.accuracy.toFixed(1) + '%';
    $('tp-time').textContent = fmtTime(st.elapsedMs);
    $('tp-prog').textContent = (st.progress * 100).toFixed(1) + '%';
    $('tp-progress-bar').style.width = (st.progress * 100).toFixed(1) + '%';
    return st;
}

function renderTopErrors() {
    var list = $('tp-errors');
    var top = topErrors(S.session.keyErrors, 5);
    if (!top.length) {
        list.innerHTML = '<span class="tp-empty">暂无错键，继续保持！</span>';
        return;
    }
    list.innerHTML = '';
    top.forEach(function (e, i) {
        var row = document.createElement('div');
        row.className = 'tp-erow';
        var k = document.createElement('kbd');
        k.className = 'tp-ekey';
        k.textContent = e.key === ' ' ? '空格' : e.key;
        var n = document.createElement('span');
        n.className = 'tp-ecount';
        n.textContent = '第 ' + (i + 1) + ' 名 · 错 ' + e.count + ' 次';
        row.appendChild(k);
        row.appendChild(n);
        list.appendChild(row);
    });
}

function renderBest() {
    var best = loadBest();
    var box = $('tp-best');
    box.innerHTML = '';
    MODES.forEach(function (m) {
        var b = best && best[m];
        var chip = document.createElement('span');
        chip.className = 'tp-chip';
        chip.textContent = MODE_NAMES[m] + '：' + (b ? b.wpm.toFixed(1) + ' WPM / ' + b.accuracy.toFixed(1) + '%' : '暂无记录');
        box.appendChild(chip);
    });
}

function startTimer() {
    stopTimer();
    S.timerId = setInterval(function () {
        if (!S.finished) renderStats();
    }, 250);
}

function stopTimer() {
    if (S.timerId) { clearInterval(S.timerId); S.timerId = null; }
}

function finish() {
    if (S.finished) return;
    S.finished = true;
    stopTimer();
    var st = calcStats(S.session, elapsedMs());
    var best = updateBest(loadBest(), S.session.mode, st);
    saveBest(best);
    renderBest();
    renderStats();
    var r = $('tp-result');
    r.style.display = 'block';
    $('tp-result-wpm').textContent = st.wpm.toFixed(1);
    $('tp-result-acc').textContent = st.accuracy.toFixed(1) + '%';
    $('tp-result-time').textContent = fmtTime(st.elapsedMs);
    var prev = loadBest() && loadBest()[S.session.mode];
    $('tp-result-best').textContent = prev ?
        ('历史最佳：' + prev.wpm.toFixed(1) + ' WPM / ' + prev.accuracy.toFixed(1) + '%') : '历史最佳：本次已记录';
    $('tp-announce').textContent = '练习完成！速度 ' + st.wpm.toFixed(1) + ' WPM，准确率 ' +
        st.accuracy.toFixed(1) + '%，用时 ' + fmtTime(st.elapsedMs) + '。';
    toast('练习完成！');
}

function onInput() {
    var input = $('tp-input');
    var val = input.value;
    var cur = typedString();
    if (val === cur || S.finished) { input.value = cur; return; }
    if (!S.session.startedAt && val.length > 0) {
        S.session.startedAt = Date.now();
        startTimer();
    }
    if (val.length === cur.length + 1 && val.indexOf(cur) === 0) {
        /* 追加一个字符 */
        try { applyKeystroke(S.session, val.charAt(val.length - 1)); }
        catch (e) { input.value = cur; return; }
    } else if (val.length + 1 === cur.length && cur.indexOf(val) === 0) {
        /* 退格：撤销上一字符（已计错误保留，符合"错误就是发生了"的口径） */
        S.session.typed.pop();
    } else if (val.length > cur.length && val.indexOf(cur) === 0) {
        /* 粘贴多字符：逐个应用，超长部分截断 */
        var extra = val.slice(cur.length), i;
        for (i = 0; i < extra.length; i++) {
            try { applyKeystroke(S.session, extra.charAt(i)); }
            catch (e) { break; }
        }
    } else {
        /* 中间插入 / 选中删除等非法编辑：回滚 */
        input.value = cur;
        return;
    }
    input.value = typedString();
    renderText();
    renderStats();
    renderTopErrors();
    if (S.session.typed.length >= S.session.targets.length) finish();
}

function exportResult() {
    var st = calcStats(S.session, elapsedMs());
    var data = {
        app: 'typing_practice_export',
        version: 1,
        exportedAt: new Date().toISOString(),
        mode: S.session.mode,
        modeName: MODE_NAMES[S.session.mode],
        text: S.session.text,
        stats: st,
        errors: S.session.errors,
        keyErrors: S.session.keyErrors,
        best: loadBest()
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = sanitizeFileName('typing-practice-result') + '_' + fmtStamp(new Date()) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
        URL.revokeObjectURL(a.href);
        a.remove();
    }, 500);
    toast('成绩已导出 JSON');
}

function currentMode() {
    var active = document.querySelector('.tp-mode.active');
    return active ? active.getAttribute('data-mode') : 'en';
}

function bindUI() {
    var modes = document.querySelectorAll('.tp-mode');
    for (var i = 0; i < modes.length; i++) {
        (function (btn) {
            btn.addEventListener('click', function () {
                for (var j = 0; j < modes.length; j++) modes[j].classList.remove('active');
                btn.classList.add('active');
                newSession(btn.getAttribute('data-mode'), 0);
                $('tp-input').focus();
            });
        })(modes[i]);
    }
    $('tp-change').addEventListener('click', function () {
        var mode = currentMode();
        newSession(mode, (S.textIndex + 1) % TEXTS[mode].length);
        toast('已换一段（' + MODE_NAMES[mode] + ' ' + (S.textIndex + 1) + '/' + TEXTS[mode].length + '）');
        $('tp-input').focus();
    });
    $('tp-restart').addEventListener('click', function () {
        newSession(currentMode(), S.textIndex);
        toast('已重新开始');
        $('tp-input').focus();
    });
    $('tp-export').addEventListener('click', exportResult);
    $('tp-input').addEventListener('input', onInput);
    $('tp-text').addEventListener('click', function () { $('tp-input').focus(); });
}

function init() {
    bindUI();
    newSession('en', 0);
}

if (typeof window !== 'undefined') {
    window.TypingPractice = API;
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
