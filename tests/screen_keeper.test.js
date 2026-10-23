/* 屏幕常亮（screen_keeper）纯逻辑单元测试（零依赖）：
 * node tests/screen_keeper.test.js
 * 覆盖：状态机五态转换、状态灯颜色、状态文案、环境能力检测、
 * 模式决策、visibilitychange 重锁逻辑、时长格式化、偏好序列化/
 * 解析、WakeKeeper 轻量生命周期（node mock）、源码零 fetch/XHR。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var sk = require("../static/js/screen_keeper.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "screen_keeper.js"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

/* ---------- 1. 状态机 ---------- */
(function () {
    var ST = sk.ST;
    eq(sk.nextState(ST.IDLE, "START"), ST.LOCKING, "idle+START→locking");
    eq(sk.nextState(ST.IDLE, "STOP"), ST.IDLE, "idle+STOP 保持 idle");
    eq(sk.nextState(ST.LOCKING, "WAKE_GRANTED"), ST.LOCKED, "locking+WAKE_GRANTED→locked");
    eq(sk.nextState(ST.LOCKING, "WAKE_DENIED"), ST.DEGRADED, "locking+WAKE_DENIED→degraded（自动降级）");
    eq(sk.nextState(ST.LOCKING, "WAKE_UNAVAILABLE"), ST.DEGRADED, "locking+WAKE_UNAVAILABLE→degraded");
    eq(sk.nextState(ST.LOCKING, "STOP"), ST.IDLE, "locking+STOP→idle");
    eq(sk.nextState(ST.LOCKED, "LOCK_RELEASED"), ST.LOST, "locked+LOCK_RELEASED→lost");
    eq(sk.nextState(ST.LOCKED, "STOP"), ST.IDLE, "locked+STOP→idle");
    eq(sk.nextState(ST.LOCKED, "VISIBILITY_VISIBLE"), ST.LOCKED, "locked+VISIBILITY_VISIBLE 保持 locked");
    eq(sk.nextState(ST.DEGRADED, "VIDEO_FAILED"), ST.LOST, "degraded+VIDEO_FAILED→lost");
    eq(sk.nextState(ST.DEGRADED, "STOP"), ST.IDLE, "degraded+STOP→idle");
    eq(sk.nextState(ST.LOST, "REACQUIRE_OK"), ST.LOCKED, "lost+REACQUIRE_OK→locked（重锁成功）");
    eq(sk.nextState(ST.LOST, "REACQUIRE_FAIL"), ST.DEGRADED, "lost+REACQUIRE_FAIL→degraded（重锁失败降级）");
    eq(sk.nextState(ST.LOST, "START"), ST.LOCKING, "lost+START→locking（手动重启）");
    eq(sk.nextState(ST.LOST, "STOP"), ST.IDLE, "lost+STOP→idle");
    eq(sk.nextState("bogus", "START"), ST.IDLE, "非法状态回退 idle");
})();

/* ---------- 2. 状态灯与文案 ---------- */
(function () {
    eq(sk.stateLampColor(sk.ST.IDLE), "gray", "idle 灯灰色（未启动）");
    eq(sk.stateLampColor(sk.ST.LOCKED), "green", "locked 灯绿色");
    eq(sk.stateLampColor(sk.ST.DEGRADED), "green", "degraded 灯绿色（仍在生效）");
    eq(sk.stateLampColor(sk.ST.LOST), "red", "lost 灯红色（丢失醒目）");
    eq(sk.stateLampColor(sk.ST.LOCKING), "red", "locking 灯红色（请求中）");
    eq(sk.stateLabel(sk.ST.IDLE), "未启动", "idle 文案");
    eq(sk.stateLabel(sk.ST.LOCKED), "屏幕常亮生效中（Wake Lock）", "locked 文案");
    ok(sk.stateLabel(sk.ST.DEGRADED).indexOf("降级") >= 0, "degraded 文案含“降级”标注");
    ok(sk.stateLabel(sk.ST.LOST).indexOf("丢失") >= 0, "lost 文案含“丢失”");
})();

/* ---------- 3. 环境检测与模式决策 ---------- */
(function () {
    eq(sk.detectMode({ wakeLock: { request: function () {} } }), "wake", "有 wakeLock.request → wake");
    eq(sk.detectMode({}), "video", "无 wakeLock → video 降级");
    eq(sk.detectMode(null), "video", "navigator 为 null → video");
    eq(sk.decideMode("auto", "wake"), "wake", "auto+支持 → wake");
    eq(sk.decideMode("auto", "video"), "video", "auto+不支持 → video");
    eq(sk.decideMode("wake", "wake"), "wake", "wake 偏好+支持 → wake");
    eq(sk.decideMode("wake", "video"), "video", "wake 偏好但不支持 → 降级 video");
    eq(sk.decideMode("video", "wake"), "video", "video 偏好强制降级");
})();

/* ---------- 4. 重锁决策 ---------- */
(function () {
    eq(sk.shouldReacquire(sk.ST.LOST, true, true), "reacquire", "lost+可见+自动重锁 → 重锁");
    eq(sk.shouldReacquire(sk.ST.LOCKED, true, true), "reacquire", "locked+切回前台 → 确认重锁");
    eq(sk.shouldReacquire(sk.ST.LOST, false, true), "none", "不可见 → 不重锁");
    eq(sk.shouldReacquire(sk.ST.LOST, true, false), "none", "关闭自动重锁 → none");
    eq(sk.shouldReacquire(sk.ST.IDLE, true, true), "none", "idle → 不重锁");
    eq(sk.shouldReacquire(sk.ST.DEGRADED, true, true), "none", "degraded → 不重锁");
})();

/* ---------- 5. 时长格式化 ---------- */
(function () {
    eq(sk.formatDuration(0), "00:00", "0 秒 → 00:00");
    eq(sk.formatDuration(5), "00:05", "5 秒 → 00:05");
    eq(sk.formatDuration(65), "01:05", "65 秒 → 01:05");
    eq(sk.formatDuration(600), "10:00", "600 秒 → 10:00");
    eq(sk.formatDuration(3661), "61:01", "3661 秒 → 61:01（分钟可超 59）");
    eq(sk.formatDuration(-3), "00:00", "负数钳制 00:00");
    eq(sk.formatDuration(59.9), "00:59", "小数向下取整");
})();

/* ---------- 6. 偏好序列化 ---------- */
(function () {
    var s = sk.serializePrefs({ mode: "video", lastMode: "video" });
    var p = sk.parsePrefs(s);
    eq(p.mode, "video", "序列化往返 mode=video");
    eq(p.lastMode, "video", "序列化往返 lastMode=video");
    eq(sk.parsePrefs("not-json").mode, "auto", "损坏 JSON 回退 auto");
    eq(sk.parsePrefs(null).mode, "auto", "null 回退 auto");
    eq(sk.parsePrefs('{"mode":"evil"}').mode, "auto", "非法 mode 回退 auto");
    eq(sk.parsePrefs('{"lastMode":"wake"}').lastMode, "wake", "lastMode=wake 保留");
    eq(sk.PREFS_KEY, "sk:prefs", "偏好存储键为 sk:prefs");
})();

/* ---------- 7. WakeKeeper 轻量生命周期（node mock） ---------- */
(function () {
    /* 构造：navigator 有 wakeLock，request 返回已兑现 promise */
    var fakeSentinel = { released: false, release: function () { this.released = true; }, addEventListener: function () {} };
    Object.defineProperty(global, "navigator", { value: { wakeLock: { request: function () { return Promise.resolve(fakeSentinel); } } }, configurable: true, writable: true });
    Object.defineProperty(global, "document", { value: { visibilityState: "visible", addEventListener: function () {}, removeEventListener: function () {} }, configurable: true, writable: true });
    var renders = [];
    var k = new sk.WakeKeeper({ render: function (s) { renders.push(s); } });
    eq(k.state, sk.ST.IDLE, "初始 idle");
    eq(k.snapshot().lamp, "gray", "初始灯灰");
    k.start();
    setTimeout(function () {
        eq(k.state, sk.ST.LOCKED, "Wake Lock 兑现后 → locked");
        eq(k.snapshot().lamp, "green", "locked 灯绿");
        k.stop();
        eq(k.state, sk.ST.IDLE, "stop → idle");
        eq(k.elapsed, 0, "stop 后计时清零");
        eq(renders[renders.length - 1].lamp, "gray", "最终渲染灯灰");

        /* 拒绝路径：request 返回 rejected promise → 降级（node 无 document.body，用 mock 触发 VIDEO_FAILED） */
        var k2 = new sk.WakeKeeper({});
        Object.defineProperty(global, "document", { value: undefined, configurable: true, writable: true });
        Object.defineProperty(global, "navigator", { value: { wakeLock: { request: function () { return Promise.reject(new Error("denied")); } } }, configurable: true, writable: true });
        k2.start();
        setTimeout(function () {
            eq(k2.state, sk.ST.LOST, "拒绝+无 DOM 降级失败 → lost（红色提示路径）");
            eq(sk.stateLampColor(k2.state), "red", "失败状态灯红");

            /* 完全无 wakeLock → 直接走降级 */
            var k3 = new sk.WakeKeeper({});
            Object.defineProperty(global, "navigator", { value: {}, configurable: true, writable: true });
            k3.start();
            eq(k3.state, sk.ST.LOST, "无 API 且无 DOM → 降级失败 → lost");

            Object.defineProperty(global, "navigator", { value: undefined, configurable: true, writable: true });
            finish();
        }, 30);
    }, 30);
})();

/* ---------- 8. 源码约束：零 fetch/XHR、关键 API 存在 ---------- */
function finish() {
    (function () {
        ok(!/\bfetch\s*\(/.test(SRC), "源码无 fetch 调用");
        ok(!/XMLHttpRequest/.test(SRC), "源码无 XMLHttpRequest");
        ok(SRC.indexOf("wakeLock.request('screen')") >= 0 || SRC.indexOf('wakeLock.request("screen")') >= 0, "源码含 wakeLock.request('screen')");
        ok(SRC.indexOf("visibilitychange") >= 0, "源码监听 visibilitychange");
        ok(SRC.indexOf('"release"') >= 0 || SRC.indexOf("'release'") >= 0, "源码监听 release 事件");
        ok(SRC.indexOf("captureStream") >= 0, "降级用 canvas.captureStream（零外部资源）");
        ok(SRC.indexOf("data:") < 0, "降级不用 data URI（纯 canvas 流）");
    })();
    console.log("断言通过 " + pass + "，失败 " + fail);
    process.exit(fail ? 1 : 0);
}
