/* 浏览器实时听写（realtime_dictation）纯前端核心逻辑
 * 纯函数经 module.exports 暴露，node tests/realtime_dictation.test.js 自测；
 * 浏览器端：window.RealtimeDictation 全局 + DOM 装配（本文件末尾）。
 *
 * 设计说明：
 * - 引擎：window.SpeechRecognition || window.webkitSpeechRecognition（Chrome/Edge
 *   桌面版内置）。注意：Chrome/Edge 的转写是云端服务（音频发往 Google），并非离线、
 *   语音会经过网络上传到云端——页面文案必须如实标注；本文件自身不发起任何网络请求
 *   （无 fetch 调用、无 XHR）。
 * - 两种输入模式：hold（按住说话/松开结束，push-to-talk）与 toggle（点击切换
 *   开始/停止）。continuous=false，靠手动启停；toggle 模式下 recognition.onend
 *   后自动重启以处理长语音自动断开。
 * - interimResults=true：中间结果实时字幕（灰色），最终结果（isFinal）入历史。
 * - 历史：[{id, text, ts}]，localStorage rd:history 持久化（上限 200 条），
 *   每条带时间戳、可复制、可删除；一键复制全文、一键清空（二次确认）。
 * - 语言偏好：zh-CN（默认）/ yue-HK / en-US / zh-TW，localStorage rd:prefs。
 * - 错误码映射：no-speech / network / audio-capture / not-allowed / aborted /
 *   service-not-allowed / language-not-supported → 中文提示。
 * - 不支持的浏览器（Firefox、iOS Safari 无该 API）：明确提示换桌面版 Chrome/Edge，
 *   页面不报错、不崩。
 */
(function () {
"use strict";

/* ================= 1. 状态机与纯函数 ================= */

var ST = {
    IDLE: "idle",           // 待机
    LISTENING: "listening", // 听写中
    UNSUPPORTED: "unsupported" // 浏览器不支持
};

/* 事件：START, STOP, RECOG_END, ERROR_RECOVERABLE, ERROR_FATAL,
 *       UNSUPPORTED_DETECTED。RECOG_END 的语义取决于 mode：
 *       toggle 模式 → 自动重启继续听；hold 模式 → 回 idle。 */
function nextState(state, event, mode) {
    switch (state) {
        case ST.IDLE:
            if (event === "START") return ST.LISTENING;
            if (event === "UNSUPPORTED_DETECTED") return ST.UNSUPPORTED;
            return ST.IDLE;
        case ST.LISTENING:
            if (event === "STOP") return ST.IDLE;
            if (event === "ERROR_FATAL") return ST.IDLE;
            if (event === "ERROR_RECOVERABLE") return ST.LISTENING;
            if (event === "UNSUPPORTED_DETECTED") return ST.UNSUPPORTED;
            if (event === "RECOG_END") return mode === "toggle" ? ST.LISTENING : ST.IDLE;
            return ST.LISTENING;
        case ST.UNSUPPORTED:
            return ST.UNSUPPORTED;
        default:
            return ST.IDLE;
    }
}

function stateLabel(state) {
    switch (state) {
        case ST.LISTENING: return "正在听写…";
        case ST.UNSUPPORTED: return "当前浏览器不支持";
        default: return "待机（点麦克风开始）";
    }
}

/* 能力探测：传入 window（node 下传 mock）。返回构造函数或 null。 */
function detectSpeechCtor(w) {
    if (!w) return null;
    if (typeof w.SpeechRecognition === "function") return w.SpeechRecognition;
    if (typeof w.webkitSpeechRecognition === "function") return w.webkitSpeechRecognition;
    return null;
}

/* 错误码 → 中文提示。not-allowed 单独给麦克风权限引导。 */
var ERROR_TEXTS = {
    "no-speech": "没有检测到语音：请靠近麦克风再说一遍（若周围太安静也会触发）。",
    "network": "网络异常：语音识别需要联网（Chrome 云端转写），请检查网络后重试。",
    "audio-capture": "无法打开麦克风：请确认麦克风已正确连接且未被其他应用独占。",
    "not-allowed": "麦克风权限被拒绝：请点击地址栏左侧的锁形/摄像头图标，允许使用麦克风后重试。",
    "service-not-allowed": "识别服务被拒绝：当前浏览器/地区可能不支持云端语音服务，请换用桌面版 Chrome/Edge。",
    "language-not-supported": "不支持所选语言：请切换到其他语言（如普通话 zh-CN）再试。",
    "aborted": "识别已中止。"
};
function getErrorText(code) {
    return ERROR_TEXTS[code] || "识别出错（" + code + "），请重试。";
}

/* fatal 错误（不再自动重启）：network/audio-capture/not-allowed/
 * service-not-allowed/language-not-supported；其余（no-speech/aborted/
 * 空结果等）视为可恢复。 */
function isFatalError(code) {
    return code === "network" || code === "audio-capture" ||
        code === "not-allowed" || code === "service-not-allowed" ||
        code === "language-not-supported";
}

/* recognition.onend 后是否自动重启：toggle 模式且是用户主动听写中
 * （未主动停止、无 fatal 错误）→ 重启。 */
function shouldRestartAfterEnd(mode, stoppedByUser, fatalError) {
    return mode === "toggle" && !stoppedByUser && !fatalError;
}

/* ================= 2. 识别结果拼接 ================= */

/* 兼容浏览器 resultList 形态的输入：results 为类数组，
 * 每个 item 为 {isFinal, [0]: {transcript}}。
 * 返回 {finalText, interimText}。 */
function mergeResults(results, startIndex) {
    var finalText = "";
    var interimText = "";
    var i;
    startIndex = startIndex || 0;
    for (i = startIndex; i < results.length; i++) {
        var r = results[i];
        var t = (r && r[0] && r[0].transcript) ? String(r[0].transcript) : "";
        if (r && r.isFinal) finalText += t;
        else interimText += t;
    }
    return { finalText: finalText, interimText: interimText };
}

/* HTML 转义（历史列表渲染用 textContent 为主，拼接全文复制时用纯文本） */
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
}

/* ================= 3. 历史与偏好 ================= */

var HISTORY_KEY = "rd:history";
var PREFS_KEY = "rd:prefs";
var HISTORY_LIMIT = 200;

function makeEntry(text, ts) {
    return { id: "e" + ts + "_" + Math.floor(Math.random() * 1e6), text: String(text), ts: ts };
}

/* 插入一条最终结果：空文本忽略；超上限丢最老的。返回新数组（不 mutate）。 */
function addEntry(list, entry) {
    if (!entry || !entry.text || !String(entry.text).trim()) return list.slice();
    var next = list.concat([entry]);
    if (next.length > HISTORY_LIMIT) next = next.slice(next.length - HISTORY_LIMIT);
    return next;
}

function removeEntry(list, id) {
    return list.filter(function (e) { return e.id !== id; });
}

function clearHistory() { return []; }

function serializeHistory(list) {
    try { return JSON.stringify(list); } catch (e) { return "[]"; }
}

function parseHistory(json) {
    try {
        var arr = JSON.parse(json);
        if (!Array.isArray(arr)) return [];
        var out = [];
        for (var i = 0; i < arr.length; i++) {
            var e = arr[i];
            if (e && typeof e.text === "string" && typeof e.ts === "number" && e.text.trim()) {
                out.push({ id: typeof e.id === "string" ? e.id : ("e" + e.ts + "_" + i), text: e.text, ts: e.ts });
            }
        }
        if (out.length > HISTORY_LIMIT) out = out.slice(out.length - HISTORY_LIMIT);
        return out;
    } catch (e) { return []; }
}

/* 拼全文：每条一行 "HH:mm:ss 文本" */
function buildFullText(list) {
    return list.map(function (e) { return formatTs(e.ts) + " " + e.text; }).join("\n");
}

var LANGS = [
    { code: "zh-CN", label: "普通话（简体）" },
    { code: "yue-HK", label: "粤语" },
    { code: "zh-TW", label: "国语（繁体）" },
    { code: "en-US", label: "英语（美国）" },
    { code: "ja-JP", label: "日语" }
];
function isValidLang(code) {
    for (var i = 0; i < LANGS.length; i++) if (LANGS[i].code === code) return true;
    return false;
}
var MODES = ["hold", "toggle"];

function defaultPrefs() { return { mode: "hold", lang: "zh-CN" }; }

function serializePrefs(p) {
    try { return JSON.stringify(p); } catch (e) { return JSON.stringify(defaultPrefs()); }
}

function parsePrefs(json) {
    var d = defaultPrefs();
    try {
        var p = JSON.parse(json);
        if (!p || typeof p !== "object") return d;
        return {
            mode: MODES.indexOf(p.mode) >= 0 ? p.mode : d.mode,
            lang: isValidLang(p.lang) ? p.lang : d.lang
        };
    } catch (e) { return d; }
}

/* ================= 4. 时间格式化 ================= */

function pad2(n) { return (n < 10 ? "0" : "") + n; }

function formatTs(ts) {
    var d = new Date(ts);
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
}

/* 相对时间：<60s 刚刚，<60min N 分钟前，否则 HH:mm:ss */
function relativeTime(ts, now) {
    now = (typeof now === "number") ? now : Date.now();
    var diff = Math.max(0, now - ts);
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return Math.floor(diff / 60000) + " 分钟前";
    return formatTs(ts);
}

/* ================= 5. 识别控制器 ================= */

/* createCtor: 返回 SpeechRecognition 构造函数的工厂（node 测试注入 mock）。
 * hooks: {onChange(snapshot)} 用于驱动 UI。 */
function Dictation(options) {
    options = options || {};
    this.mode = options.mode || "hold";
    this.lang = options.lang || "zh-CN";
    this.state = ST.IDLE;
    this.history = options.history || [];
    this.interim = "";
    this.lastError = "";
    this.recog = null;
    this.stoppedByUser = true;
    this.createCtor = options.createCtor || null;
    this.onChange = options.onChange || function () {};
    this.nowFn = options.nowFn || Date.now;
}

Dictation.prototype.snapshot = function () {
    return {
        state: this.state,
        label: stateLabel(this.state),
        mode: this.mode,
        lang: this.lang,
        interim: this.interim,
        historyCount: this.history.length,
        lastError: this.lastError
    };
};

Dictation.prototype._emit = function () { this.onChange(this.snapshot()); };

Dictation.prototype._newRecognition = function () {
    if (!this.createCtor) return null;
    var Ctor = this.createCtor();
    if (!Ctor) return null;
    var r = new Ctor();
    r.lang = this.lang;
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    var self = this;
    r.onresult = function (ev) { self._onResult(ev); };
    r.onerror = function (ev) { self._onError(ev); };
    r.onend = function () { self._onEnd(); };
    return r;
};

/* 开始一次识别会话。返回 false 表示环境不支持。 */
Dictation.prototype.start = function () {
    if (this.state === ST.UNSUPPORTED) return false;
    if (this.state === ST.LISTENING) return true;
    var r = this._newRecognition();
    if (!r) {
        this.state = nextState(this.state, "UNSUPPORTED_DETECTED", this.mode);
        this._emit();
        return false;
    }
    this.recog = r;
    this.stoppedByUser = false;
    this.lastError = "";
    this.interim = "";
    try {
        r.start();
    } catch (e) {
        this.recog = null;
        this.state = nextState(this.state, "ERROR_FATAL", this.mode);
        this.lastError = getErrorText("audio-capture");
        this._emit();
        return false;
    }
    this.state = nextState(this.state, "START", this.mode);
    this._emit();
    return true;
};

/* 停止当前识别会话（用户主动）。 */
Dictation.prototype.stop = function () {
    this.stoppedByUser = true;
    this.interim = "";
    if (this.recog) {
        try { this.recog.stop(); } catch (e) {}
        this.recog = null;
    }
    this.state = nextState(this.state, "STOP", this.mode);
    this._emit();
};

Dictation.prototype._onResult = function (ev) {
    var merged = mergeResults(ev.results, ev.resultIndex || 0);
    this.interim = merged.interimText;
    if (merged.finalText.trim()) {
        this.history = addEntry(this.history, makeEntry(merged.finalText.trim(), this.nowFn()));
        this.interim = "";
    }
    this._emit();
};

Dictation.prototype._onError = function (ev) {
    var code = (ev && ev.error) ? String(ev.error) : "unknown";
    this.lastError = getErrorText(code);
    var fatal = isFatalError(code);
    /* fatal 错误：直接回 idle 并关闭会话；可恢复的留在 listening 等 onend 重启 */
    if (fatal) {
        this.stoppedByUser = true;
        this.recog = null;
        this.state = nextState(this.state, "ERROR_FATAL", this.mode);
    } else {
        this.state = nextState(this.state, "ERROR_RECOVERABLE", this.mode);
    }
    this._emit();
};

Dictation.prototype._onEnd = function () {
    /* toggle 模式自动续听：重建识别器继续 */
    if (shouldRestartAfterEnd(this.mode, this.stoppedByUser, this.lastError && this.state === ST.IDLE)) {
        var r = this._newRecognition();
        if (r) {
            this.recog = r;
            try { r.start(); } catch (e) { this.recog = null; }
        }
    }
    this.state = nextState(this.state, "RECOG_END", this.mode);
    this._emit();
};

Dictation.prototype.pushEntry = function (text, ts) {
    this.history = addEntry(this.history, makeEntry(text, ts || this.nowFn()));
    this._emit();
    return this.history;
};

Dictation.prototype.deleteEntry = function (id) {
    this.history = removeEntry(this.history, id);
    this._emit();
    return this.history;
};

Dictation.prototype.clear = function () {
    this.history = clearHistory();
    this._emit();
    return this.history;
};

Dictation.prototype.setMode = function (mode) {
    if (MODES.indexOf(mode) < 0) return false;
    if (this.mode !== mode) {
        this.stop();
        this.mode = mode;
        this._emit();
    }
    return true;
};

Dictation.prototype.setLang = function (lang) {
    if (!isValidLang(lang)) return false;
    if (this.lang !== lang) {
        var wasListening = this.state === ST.LISTENING;
        this.stop();
        this.lang = lang;
        if (wasListening && this.mode === "toggle") this.start();
        else this._emit();
    }
    return true;
};

/* ================= 6. 导出 ================= */

var api = {
    ST: ST,
    nextState: nextState,
    stateLabel: stateLabel,
    detectSpeechCtor: detectSpeechCtor,
    getErrorText: getErrorText,
    isFatalError: isFatalError,
    shouldRestartAfterEnd: shouldRestartAfterEnd,
    mergeResults: mergeResults,
    escapeHtml: escapeHtml,
    HISTORY_KEY: HISTORY_KEY,
    PREFS_KEY: PREFS_KEY,
    HISTORY_LIMIT: HISTORY_LIMIT,
    makeEntry: makeEntry,
    addEntry: addEntry,
    removeEntry: removeEntry,
    clearHistory: clearHistory,
    serializeHistory: serializeHistory,
    parseHistory: parseHistory,
    buildFullText: buildFullText,
    LANGS: LANGS,
    isValidLang: isValidLang,
    MODES: MODES,
    defaultPrefs: defaultPrefs,
    serializePrefs: serializePrefs,
    parsePrefs: parsePrefs,
    formatTs: formatTs,
    relativeTime: relativeTime,
    Dictation: Dictation
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
} else if (typeof window !== "undefined") {
    window.RealtimeDictation = api;
}

/* ================= 7. 浏览器 DOM 装配 ================= */
if (typeof document !== "undefined" && typeof window !== "undefined") {
(function () {
    var $ = function (id) { return document.getElementById(id); };

    function loadJSON(key, parseFn) {
        try {
            var raw = window.localStorage.getItem(key);
            return raw == null ? null : parseFn(raw);
        } catch (e) { return null; }
    }
    function saveJSON(key, value, serFn) {
        try { window.localStorage.setItem(key, serFn(value)); } catch (e) {}
    }

    var prefs = loadJSON(PREFS_KEY, parsePrefs) || defaultPrefs();
    var history = loadJSON(HISTORY_KEY, parseHistory) || [];

    var ctor = detectSpeechCtor(window);

    var d = new Dictation({
        mode: prefs.mode,
        lang: prefs.lang,
        history: history,
        createCtor: function () { return detectSpeechCtor(window); },
        onChange: render
    });
    if (!ctor) d.state = ST.UNSUPPORTED;

    /* ---- 元素引用 ---- */
    var elMic = $("rd-mic"), elMicLabel = $("rd-mic-label"),
        elCaption = $("rd-caption"), elCaptionInterim = $("rd-caption-interim"),
        elList = $("rd-list"), elEmpty = $("rd-empty"),
        elModeHold = $("rd-mode-hold"), elModeToggle = $("rd-mode-toggle"),
        elLang = $("rd-lang"), elCount = $("rd-count"),
        elCopyAll = $("rd-copy-all"), elClear = $("rd-clear"),
        elUnsupported = $("rd-unsupported"), elError = $("rd-error");

    /* ---- toast ---- */
    var toastTimer = null;
    function toast(msg) {
        var t = $("rd-toast");
        if (!t) return;
        t.textContent = msg;
        t.className = "rd-toast rd-show";
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.className = "rd-toast"; }, 2600);
    }

    function copyText(text, okMsg) {
        function done() { toast(okMsg); }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, function () { fallback(); });
        } else { fallback(); }
        function fallback() {
            var ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand("copy"); done(); }
            catch (e) { toast("复制失败，请手动长按选择复制"); }
            document.body.removeChild(ta);
        }
    }

    /* ---- 渲染 ---- */
    function render(snap) {
        saveJSON(HISTORY_KEY, d.history, serializeHistory);
        saveJSON(PREFS_KEY, { mode: d.mode, lang: d.lang }, serializePrefs);

        if (elUnsupported) elUnsupported.style.display = d.state === ST.UNSUPPORTED ? "flex" : "none";

        var listening = d.state === ST.LISTENING;
        if (elMic) {
            elMic.classList.toggle("rd-recording", listening);
            elMic.setAttribute("aria-pressed", listening ? "true" : "false");
        }
        if (elMicLabel) {
            elMicLabel.textContent = d.state === ST.UNSUPPORTED ? "浏览器不支持" :
                listening ? (d.mode === "hold" ? "松开结束" : "点击停止") :
                (d.mode === "hold" ? "按住说话" : "点击开始");
        }
        if (elCaptionInterim) {
            elCaptionInterim.textContent = d.interim || (listening ? "…" : "");
        }
        if (elCaption) elCaption.classList.toggle("rd-active", listening);

        if (elError) {
            if (d.lastError && d.state !== ST.UNSUPPORTED) {
                elError.style.display = "flex";
                var span = elError.querySelector("span");
                if (span) span.textContent = d.lastError;
            } else {
                elError.style.display = "none";
            }
        }

        /* 历史列表 */
        if (elList) {
            while (elList.firstChild) elList.removeChild(elList.firstChild);
            var items = d.history.slice().reverse();
            if (elEmpty) elEmpty.style.display = items.length ? "none" : "block";
            items.forEach(function (e) {
                var li = document.createElement("li");
                li.className = "rd-item";
                var head = document.createElement("div");
                head.className = "rd-item-head";
                var ts = document.createElement("span");
                ts.className = "rd-item-ts";
                ts.textContent = formatTs(e.ts) + " · " + relativeTime(e.ts);
                head.appendChild(ts);
                var btns = document.createElement("span");
                btns.className = "rd-item-btns";
                var bCopy = document.createElement("button");
                bCopy.className = "rd-mini-btn";
                bCopy.textContent = "复制";
                bCopy.onclick = function () { copyText(e.text, "已复制该条"); };
                var bDel = document.createElement("button");
                bDel.className = "rd-mini-btn rd-danger";
                bDel.textContent = "删除";
                bDel.onclick = function () { d.deleteEntry(e.id); };
                btns.appendChild(bCopy);
                btns.appendChild(bDel);
                head.appendChild(btns);
                var body = document.createElement("div");
                body.className = "rd-item-text";
                body.textContent = e.text;
                li.appendChild(head);
                li.appendChild(body);
                elList.appendChild(li);
            });
        }
        if (elCount) elCount.textContent = d.history.length + " 条";
    }

    /* ---- 模式切换 UI ---- */
    function syncModeButtons() {
        if (elModeHold) elModeHold.classList.toggle("rd-mode-active", d.mode === "hold");
        if (elModeToggle) elModeToggle.classList.toggle("rd-mode-active", d.mode === "toggle");
    }
    if (elModeHold) elModeHold.onclick = function () { d.setMode("hold"); syncModeButtons(); render(); };
    if (elModeToggle) elModeToggle.onclick = function () { d.setMode("toggle"); syncModeButtons(); render(); };

    /* ---- 语言选择 ---- */
    if (elLang) {
        elLang.value = d.lang;
        elLang.onchange = function () {
            if (d.setLang(elLang.value)) { toast("识别语言已切换"); render(); }
            else { elLang.value = d.lang; }
        };
    }

    /* ---- 麦克风按钮：hold 模式按住说话/松开结束；toggle 模式点击切换 ---- */
    if (elMic) {
        elMic.addEventListener("pointerdown", function (ev) {
            if (d.mode !== "hold" || d.state === ST.UNSUPPORTED) return;
            ev.preventDefault();
            try { elMic.setPointerCapture(ev.pointerId); } catch (e) {}
            if (d.start()) render();
        });
        var holdEnd = function () {
            if (d.mode !== "hold") return;
            if (d.state === ST.LISTENING) { d.stop(); render(); }
        };
        elMic.addEventListener("pointerup", holdEnd);
        elMic.addEventListener("pointercancel", holdEnd);
        elMic.addEventListener("click", function () {
            if (d.mode !== "toggle" || d.state === ST.UNSUPPORTED) return;
            if (d.state === ST.LISTENING) { d.stop(); }
            else { d.start(); }
            render();
        });
        /* 键盘可访问：空格/回车在 toggle 模式等同点击 */
        elMic.addEventListener("keydown", function (ev) {
            if (d.mode !== "toggle") return;
            if (ev.key === " " || ev.key === "Enter") {
                ev.preventDefault();
                if (d.state === ST.LISTENING) d.stop(); else d.start();
                render();
            }
        });
    }

    if (elCopyAll) elCopyAll.onclick = function () {
        if (!d.history.length) { toast("还没有转写内容"); return; }
        copyText(buildFullText(d.history), "全文已复制（" + d.history.length + " 条）");
    };
    if (elClear) elClear.onclick = function () {
        if (!d.history.length) { toast("历史已为空"); return; }
        if (window.confirm("确定清空全部 " + d.history.length + " 条转写历史吗？此操作不可恢复。")) {
            d.clear();
            toast("已清空历史");
        }
    };

    /* ---- 首次渲染 ---- */
    syncModeButtons();
    render();
})();
}
})();
