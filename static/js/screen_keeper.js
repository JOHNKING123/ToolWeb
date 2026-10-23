/* 屏幕常亮（screen_keeper）纯前端核心逻辑
 * 纯函数经 module.exports 暴露，node tests/screen_keeper.test.js 自测；
 * 浏览器端：window.ScreenKeeper 全局 + DOM 装配（本文件末尾）。
 *
 * 设计说明：
 * - 主路径：navigator.wakeLock.request('screen') 请求屏幕锁（Wake Lock API，
 *   仅 HTTPS/受信任环境可用）；lock 的 release 事件触发重锁或醒目提示；
 *   document.visibilitychange 切回前台自动重锁。
 * - 降级路径：Wake Lock 不可用/被拒绝时自动降级「视频保亮模式」——1x1 隐藏
 *   <video> 循环播放 canvas.captureStream() 捕获流（零 fetch/XHR、零音频文件，
 *   data URI / 外部资源都不用），视频持续播放可阻止部分浏览器自动熄屏；
 *   UI 明确标注当前是降级模式并提示效果不如 Wake Lock。
 * - 状态机（纯函数 nextState，见下）：idle → locking → locked；拒绝/不可用 →
 *   degraded（视频降级）；锁定意外丢失 → lost（红色提示，可自动重锁）；stop
 *   → idle（累计时长清零）。
 * - 累计保亮时长：locked/degraded 期间每秒累加，mm:ss 显示，停止清零。
 * - 模式偏好 localStorage 持久化（sk:prefs）：{mode:'auto'|'wake'|'video',
 *   lastMode:'wake'|'video'}，页面载入自动恢复。
 * - URL 参数 ?mode=video 可强制进入降级模式（用于演示/测试）。
 */
(function () {
"use strict";

/* ================= 1. 状态机与纯函数 ================= */

/* 状态：idle 未启动 / locking 请求中 / locked Wake Lock 生效 /
 *       degraded 视频降级生效 / lost 锁定丢失 */
var ST = {
    IDLE: "idle",
    LOCKING: "locking",
    LOCKED: "locked",
    DEGRADED: "degraded",
    LOST: "lost"
};

/* 事件：START, WAKE_GRANTED, WAKE_DENIED, WAKE_UNAVAILABLE,
 *       VIDEO_STARTED, VIDEO_FAILED, LOCK_RELEASED, VISIBILITY_VISIBLE,
 *       REACQUIRE_OK, REACQUIRE_FAIL, STOP */
function nextState(state, event) {
    switch (state) {
        case ST.IDLE:
            if (event === "START") return ST.LOCKING;
            return ST.IDLE;
        case ST.LOCKING:
            if (event === "WAKE_GRANTED") return ST.LOCKED;
            if (event === "WAKE_DENIED" || event === "WAKE_UNAVAILABLE") return ST.DEGRADED;
            if (event === "VIDEO_FAILED") return ST.LOST; /* 无 API 直接走降级但 DOM 不可用 */
            if (event === "STOP") return ST.IDLE;
            return ST.LOCKING;
        case ST.LOCKED:
            if (event === "LOCK_RELEASED") return ST.LOST;
            if (event === "STOP") return ST.IDLE;
            /* VISIBILITY_VISIBLE 在 locked 状态下保持 locked（由重锁逻辑决定） */
            return ST.LOCKED;
        case ST.DEGRADED:
            if (event === "VIDEO_FAILED") return ST.LOST;
            if (event === "STOP") return ST.IDLE;
            return ST.DEGRADED;
        case ST.LOST:
            if (event === "REACQUIRE_OK") return ST.LOCKED;
            if (event === "REACQUIRE_FAIL") return ST.DEGRADED;
            if (event === "START") return ST.LOCKING;
            if (event === "STOP") return ST.IDLE;
            return ST.LOST;
        default:
            return ST.IDLE;
    }
}

/* 状态灯颜色：灰 / 绿 / 红 */
function stateLampColor(state) {
    switch (state) {
        case ST.LOCKED:
        case ST.DEGRADED:
            return "green";
        case ST.LOST:
        case ST.LOCKING:
            return "red";
        default:
            return "gray";
    }
}

/* 状态中文文案 */
function stateLabel(state) {
    switch (state) {
        case ST.IDLE: return "未启动";
        case ST.LOCKING: return "正在请求屏幕锁…";
        case ST.LOCKED: return "屏幕常亮生效中（Wake Lock）";
        case ST.DEGRADED: return "降级模式：视频保亮生效中";
        case ST.LOST: return "屏幕锁已丢失，请重新开始";
        default: return "未知状态";
    }
}

/* 检测环境能力：nav 为 navigator（可 mock）→ 'wake' | 'video' */
function detectMode(nav) {
    if (nav && nav.wakeLock && typeof nav.wakeLock.request === "function") {
        return "wake";
    }
    return "video";
}

/* 按偏好决定实际使用模式：
 * prefMode: 'auto' | 'wake' | 'video'；返回 'wake' | 'video'
 * - 'wake' 偏好：环境支持则用 wake，否则降级 video（明确标注）
 * - 'video' 偏好：强制降级模式
 * - 'auto'：支持 wake 就用 wake，否则 video */
function decideMode(prefMode, envMode) {
    if (prefMode === "video") return "video";
    if (envMode === "wake") return "wake";
    return "video";
}

/* visibilitychange 重锁决策：当前状态 + 页面是否可见 + 是否自动重锁
 * 返回 'reacquire'（发起重锁）/ 'keep'（保持）/ 'none'（不适用） */
function shouldReacquire(state, visible, autoReacquire) {
    if (!visible) return "none";
    if (!autoReacquire) return "none";
    if (state === ST.LOST || state === ST.LOCKED) return "reacquire";
    return "none";
}

/* 时长格式化：总秒数 → mm:ss（分钟可超 59） */
function formatDuration(totalSeconds) {
    var s = Math.max(0, Math.floor(totalSeconds));
    var m = Math.floor(s / 60);
    var sec = s % 60;
    return (m < 10 ? "0" + m : "" + m) + ":" + (sec < 10 ? "0" + sec : "" + sec);
}

/* 偏好序列化 / 解析 */
var PREFS_KEY = "sk:prefs";
var DEFAULT_PREFS = { mode: "auto", lastMode: "wake" };
function serializePrefs(prefs) {
    var p = {
        mode: (prefs && (prefs.mode === "wake" || prefs.mode === "video")) ? prefs.mode : "auto",
        lastMode: (prefs && prefs.lastMode === "video") ? "video" : "wake"
    };
    return JSON.stringify(p);
}
function parsePrefs(json) {
    var out = { mode: DEFAULT_PREFS.mode, lastMode: DEFAULT_PREFS.lastMode };
    try {
        var p = JSON.parse(json);
        if (!p || typeof p !== "object") return out;
        if (p.mode === "wake" || p.mode === "video") out.mode = p.mode;
        if (p.lastMode === "video" || p.lastMode === "wake") out.lastMode = p.lastMode;
    } catch (e) { /* 损坏的 JSON 回退默认值 */ }
    return out;
}

/* ================= 2. 浏览器端：WakeKeeper ================= */

function WakeKeeper(ui, opts) {
    opts = opts || {};
    this.ui = ui || {};
    this.state = ST.IDLE;
    this.elapsed = 0;              /* 本次保亮累计秒数 */
    this.timerId = null;
    this.lock = null;              /* WakeLockSentinel */
    this.video = null;             /* 降级 video 元素 */
    this.stream = null;
    this.autoReacquire = true;
    this.forcedMode = opts.forcedMode || null; /* 'wake' | 'video' | null（URL ?mode= 注入） */
    this.prefs = parsePrefs(safeGetItem(PREFS_KEY));
    this.onEvent = typeof opts.onEvent === "function" ? opts.onEvent : null;
    this._onVisibility = this._onVisibility.bind(this);
    this._onLockRelease = this._onLockRelease.bind(this);
    if (typeof document !== "undefined" && document.addEventListener) {
        document.addEventListener("visibilitychange", this._onVisibility);
    }
}

function safeGetItem(k) {
    try { return (typeof localStorage !== "undefined") ? localStorage.getItem(k) : null; }
    catch (e) { return null; }
}
function safeSetItem(k, v) {
    try { if (typeof localStorage !== "undefined") localStorage.setItem(k, v); }
    catch (e) { /* 隐私模式写入失败则忽略 */ }
}

WakeKeeper.prototype._emit = function (event, extra) {
    this.state = nextState(this.state, event);
    if (this.onEvent) {
        try { this.onEvent(event, this.state, extra || {}); } catch (e) { /* 回调异常不影响主流程 */ }
    }
    if (this.ui.render) {
        try { this.ui.render(this.snapshot()); } catch (e) { /* 渲染异常不影响主流程 */ }
    }
};

WakeKeeper.prototype.snapshot = function () {
    return {
        state: this.state,
        lamp: stateLampColor(this.state),
        label: stateLabel(this.state),
        elapsedText: formatDuration(this.elapsed),
        degraded: this.state === ST.DEGRADED
    };
};

WakeKeeper.prototype._startTimer = function () {
    var self = this;
    this._stopTimer();
    this.timerId = setInterval(function () {
        self.elapsed += 1;
        if (self.ui.tick) { try { self.ui.tick(self.snapshot()); } catch (e) {} }
    }, 1000);
};
WakeKeeper.prototype._stopTimer = function () {
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
};

/* 入口：开始常亮 */
WakeKeeper.prototype.start = function () {
    if (this.state !== ST.IDLE && this.state !== ST.LOST) return;
    this._emit("START");
    var envMode = detectMode(typeof navigator !== "undefined" ? navigator : null);
    var want = this.forcedMode || decideMode(this.prefs.mode, envMode);
    this.prefs.lastMode = want;
    safeSetItem(PREFS_KEY, serializePrefs(this.prefs));
    if (want === "wake" && envMode === "wake") {
        this._acquireWakeLock();
    } else {
        this._startVideoFallback(envMode === "wake" ? "denied-or-forced" : "unavailable");
    }
};

/* Wake Lock 请求（必须在用户手势上下文中调用） */
WakeKeeper.prototype._acquireWakeLock = function (isReacquire) {
    var self = this;
    var nav = (typeof navigator !== "undefined") ? navigator : null;
    if (!nav || !nav.wakeLock || typeof nav.wakeLock.request !== "function") {
        this._emit("WAKE_UNAVAILABLE");
        this._startVideoFallback("unavailable");
        return;
    }
    var p;
    try {
        p = nav.wakeLock.request("screen");
    } catch (err) {
        /* 同步抛错（如 insecure context）→ 降级 */
        this._emit("WAKE_DENIED", { error: String(err && err.message || err) });
        this._startVideoFallback("denied");
        return;
    }
    p.then(function (sentinel) {
        self.lock = sentinel;
        try {
            sentinel.addEventListener("release", self._onLockRelease);
        } catch (e) { /* 旧实现无 addEventListener 忽略 */ }
        self._emit(isReacquire ? "REACQUIRE_OK" : "WAKE_GRANTED");
        self._startTimer();
    }, function (err) {
        /* 被拒绝（NotAllowedError 等）→ 降级视频模式 */
        self._emit(isReacquire ? "REACQUIRE_FAIL" : "WAKE_DENIED",
            { error: String(err && err.message || err) });
        self._startVideoFallback("denied");
    });
};

WakeKeeper.prototype._onLockRelease = function () {
    /* 系统释放了屏幕锁（如切后台/锁屏）：先标记丢失给红色提示，
     * 再视可见性自动重锁；重锁失败则降级。 */
    this.lock = null;
    this._stopTimer();
    this._emit("LOCK_RELEASED");
    var visible = (typeof document === "undefined") || document.visibilityState === "visible";
    var decision = shouldReacquire(this.state, visible, this.autoReacquire);
    if (decision === "reacquire") {
        this._emit("START"); /* lost -> locking */
        this._acquireWakeLock(true);
    }
};

WakeKeeper.prototype._onVisibility = function () {
    if (typeof document === "undefined") return;
    if (document.visibilityState !== "visible") return;
    var decision = shouldReacquire(this.state, document.visibilityState === "visible", this.autoReacquire);
    if (decision === "reacquire" && this.state === ST.LOST) {
        this._emit("START");
        this._acquireWakeLock(true);
    } else if (decision === "reacquire" && this.state === ST.LOCKED) {
        /* locked 状态下切回前台：系统可能已释放锁但 release 事件未到，
         * 主动重锁一次确保生效 */
        this._acquireWakeLock(true);
    }
};

/* 降级：隐藏 video 循环播放 canvas 捕获流 */
WakeKeeper.prototype._startVideoFallback = function (reason) {
    var self = this;
    if (typeof document === "undefined") {
        this._emit("VIDEO_FAILED", { reason: reason });
        return;
    }
    try {
        var canvas = document.createElement("canvas");
        canvas.width = 16; canvas.height = 16;
        var ctx = canvas.getContext("2d");
        /* 周期性重绘一像素，保证流持续活跃 */
        var frame = 0;
        var draw = function () {
            frame = (frame + 1) % 256;
            ctx.fillStyle = "rgb(" + frame + ",0,0)";
            ctx.fillRect(0, 0, 16, 16);
        };
        draw();
        this._drawTimer = setInterval(draw, 1000);
        var stream = canvas.captureStream(1);
        var video = document.createElement("video");
        video.setAttribute("playsinline", "");
        video.setAttribute("muted", "");
        video.muted = true;
        video.loop = true;
        video.style.cssText = "position:fixed;width:1px;height:1px;left:-10px;top:-10px;opacity:0;pointer-events:none;";
        video.setAttribute("aria-hidden", "true");
        this.stream = stream;
        this.video = video;
        document.body.appendChild(video);
        video.srcObject = stream;
        var playP = video.play();
        var done = function () {
            self._emit("VIDEO_STARTED", { reason: reason });
            self._startTimer();
        };
        if (playP && typeof playP.then === "function") {
            playP.then(done, function () { self._emit("VIDEO_FAILED", { reason: reason }); });
        } else {
            done();
        }
    } catch (err) {
        this._emit("VIDEO_FAILED", { reason: reason, error: String(err && err.message || err) });
    }
};

/* 停止：释放锁 / 停视频，计时清零 */
WakeKeeper.prototype.stop = function () {
    this._stopTimer();
    if (this.lock) {
        try { this.lock.release(); } catch (e) { /* 已释放则忽略 */ }
        this.lock = null;
    }
    if (this._drawTimer) { clearInterval(this._drawTimer); this._drawTimer = null; }
    if (this.video) {
        try { this.video.pause(); } catch (e) {}
        try { if (this.video.parentNode) this.video.parentNode.removeChild(this.video); } catch (e) {}
        this.video = null;
    }
    if (this.stream) {
        try {
            var tracks = this.stream.getTracks();
            for (var i = 0; i < tracks.length; i++) tracks[i].stop();
        } catch (e) {}
        this.stream = null;
    }
    this.elapsed = 0;
    this._emit("STOP");
};

/* 页面卸载前释放（beforeunload 兜底） */
WakeKeeper.prototype.dispose = function () {
    if (typeof document !== "undefined" && document.removeEventListener) {
        document.removeEventListener("visibilitychange", this._onVisibility);
    }
    this.stop();
};

/* ================= 3. 导出 ================= */
var api = {
    ST: ST,
    nextState: nextState,
    stateLampColor: stateLampColor,
    stateLabel: stateLabel,
    detectMode: detectMode,
    decideMode: decideMode,
    shouldReacquire: shouldReacquire,
    formatDuration: formatDuration,
    serializePrefs: serializePrefs,
    parsePrefs: parsePrefs,
    PREFS_KEY: PREFS_KEY,
    DEFAULT_PREFS: DEFAULT_PREFS,
    WakeKeeper: WakeKeeper
};
if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
}
if (typeof window !== "undefined") {
    window.ScreenKeeper = api;
}

/* ================= 4. 浏览器端 DOM 装配 ================= */
if (typeof window !== "undefined" && typeof document !== "undefined") {
    (function initPage() {
        if (!document.getElementById("sk-toggle")) return; /* 非本工具页不装配 */
        var toggleBtn = document.getElementById("sk-toggle");
        var toggleIcon = document.getElementById("sk-toggle-icon");
        var toggleText = document.getElementById("sk-toggle-text");
        var lamp = document.getElementById("sk-lamp");
        var stateText = document.getElementById("sk-state");
        var elapsedEl = document.getElementById("sk-elapsed");
        var modeBadge = document.getElementById("sk-mode-badge");
        var toastEl = document.getElementById("sk-toast");
        var prefSel = document.getElementById("sk-mode-pref");
        var lostBanner = document.getElementById("sk-lost-banner");
        var iosHint = document.getElementById("sk-ios-hint");
        var toastTimer = null;

        function toast(msg) {
            if (!toastEl) return;
            toastEl.textContent = msg;
            toastEl.classList.add("sk-show");
            if (toastTimer) clearTimeout(toastTimer);
            toastTimer = setTimeout(function () { toastEl.classList.remove("sk-show"); }, 3200);
        }

        /* iOS / 移动端提示：Safari 必须保持前台 */
        var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        var isMobile = isIOS || /Android/.test(navigator.userAgent);
        if (isMobile && iosHint) iosHint.style.display = "flex";

        /* URL ?mode=video 强制降级（演示/测试用） */
        var forcedMode = null;
        try {
            var q = new URLSearchParams(window.location.search);
            if (q.get("mode") === "video") forcedMode = "video";
        } catch (e) {}

        var active = false;
        var keeper = new WakeKeeper({
            render: function (snap) { renderSnap(snap); },
            tick: function (snap) { if (elapsedEl) elapsedEl.textContent = snap.elapsedText; }
        }, { forcedMode: forcedMode });

        /* 恢复偏好 */
        if (prefSel) {
            prefSel.value = keeper.prefs.mode;
            prefSel.addEventListener("change", function () {
                keeper.prefs.mode = prefSel.value;
                safeSetItem(PREFS_KEY, serializePrefs(keeper.prefs));
                toast("模式偏好已记住：" + prefSel.options[prefSel.selectedIndex].text);
            });
        }
        if (forcedMode === "video" && modeBadge) {
            modeBadge.style.display = "inline-flex";
        }

        function renderSnap(snap) {
            if (lamp) {
                lamp.className = "sk-lamp sk-lamp-" + snap.lamp;
            }
            if (stateText) stateText.textContent = snap.label;
            if (elapsedEl) elapsedEl.textContent = snap.elapsedText;
            if (modeBadge) {
                modeBadge.style.display = snap.degraded ? "inline-flex" : "none";
            }
            if (lostBanner) {
                lostBanner.style.display = (snap.state === ST.LOST) ? "flex" : "none";
            }
            if (toggleBtn) {
                active = (snap.state !== ST.IDLE);
                toggleBtn.classList.toggle("sk-active", active);
                if (toggleIcon) toggleIcon.textContent = active ? "stop" : "play_arrow";
                if (toggleText) toggleText.textContent = active ? "停止常亮" : "开始常亮";
            }
            if (snap.state === ST.LOCKED) {
                toast("屏幕锁已生效，屏幕将保持常亮");
            } else if (snap.state === ST.DEGRADED) {
                toast("已降级为视频保亮模式（效果弱于 Wake Lock，请尽量保持页面在前台）");
            } else if (snap.state === ST.LOST) {
                toast("屏幕锁意外丢失（可能切了后台/锁屏），正在尝试重锁…");
            }
        }

        toggleBtn.addEventListener("click", function () {
            if (active) {
                keeper.stop();
                toast("已停止，屏幕锁已释放");
            } else {
                keeper.start();
            }
        });

        window.addEventListener("beforeunload", function () {
            if (keeper.state !== ST.IDLE) {
                /* 释放资源；页面关闭后保亮即失效（浏览器限制） */
                keeper.dispose();
            }
        });

        /* 初始渲染 */
        renderSnap(keeper.snapshot());
    })();
}
})();
