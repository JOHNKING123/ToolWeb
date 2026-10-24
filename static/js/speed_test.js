/* 网速测试（speed_test）前端：延迟/下载/上传三步测速引擎
 * 纯函数经 module.exports 暴露，node tests/speed_test.test.js 自测；
 * 浏览器端：window.SpeedTest 全局 + DOM 装配（本文件末尾）。
 *
 * 测速链路：用户浏览器 → 本站服务器（/tools/api/speed-test/*），
 * 不依赖第三方 CDN，结果不代表访问其它网站的速度。
 * - 延迟：HEAD 请求 20 次采样（cache-bust），取中位数＋抖动，零流量
 * - 下载：1MB 预热 → 按预热速率自动选 10MB/25MB 正式档，ReadableStream
 *   逐块读数，250ms 采样瞬时速率画曲线
 * - 上传：4 并发 XHR POST 1MB 随机块，聚合上行速率
 */
(function () {
"use strict";

/* ================= 1. 纯函数：统计与换算 ================= */

var BYTES_MB = 1024 * 1024;

/* 中位数（不改变原数组） */
function median(arr) {
    if (!arr || arr.length === 0) return 0;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var mid = Math.floor(a.length / 2);
    if (a.length % 2 === 1) return a[mid];
    return (a[mid - 1] + a[mid]) / 2;
}

/* 算术均值 */
function mean(arr) {
    if (!arr || arr.length === 0) return 0;
    var s = 0, i;
    for (i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
}

/* 抖动：相邻两次采样差值绝对值的均值（ms） */
function jitterOf(samples) {
    if (!samples || samples.length < 2) return 0;
    var s = 0, i;
    for (i = 1; i < samples.length; i++) s += Math.abs(samples[i] - samples[i - 1]);
    return s / (samples.length - 1);
}

/* 字节/秒 → Mbps（网络速率按 1000 进制：1 Mbps = 10^6 bit/s） */
function mbpsOf(bytes, seconds) {
    if (!seconds || seconds <= 0) return 0;
    return (bytes * 8) / seconds / 1e6;
}

/* 字节/秒 → MB/s（文件大小按 1024 进制） */
function mbsOf(bytes, seconds) {
    if (!seconds || seconds <= 0) return 0;
    return bytes / seconds / BYTES_MB;
}

/* 保留 1 位小数 */
function fmt1(x) {
    return (Math.round(x * 10) / 10).toFixed(1);
}

/* 正式下载档选择：预热速率 ≥ 20Mbps 用 25MB，否则 10MB */
var PREHEAT_THRESHOLD_MBPS = 20;
function chooseFormalSizeMB(preheatMbps) {
    return preheatMbps >= PREHEAT_THRESHOLD_MBPS ? 25 : 10;
}

/* 速率档位评级：返回 {tier, label, advice} */
function rateTier(mbps) {
    if (mbps >= 100) {
        return { tier: "optical", label: "光纤档",
            advice: "网速很快，多设备 4K、云游戏、视频会议都轻松应对。" };
    }
    if (mbps >= 25) {
        return { tier: "4k", label: "4K 流畅档",
            advice: "4K 在线视频、高清视频会议流畅，云游戏基本可用。" };
    }
    if (mbps >= 10) {
        return { tier: "hd", label: "高清档",
            advice: "高清视频、日常办公够用，多人同时看 4K 或大型下载会吃力。" };
    }
    return { tier: "basic", label: "基础档",
        advice: "网页、聊天、标清视频可用；高清视频可能缓冲，建议检查线路或联系运营商。" };
}

/* ================= 2. 历史记录（localStorage） ================= */

var HISTORY_KEY = "speed_test_history";
var HISTORY_MAX = 10;

function readHistory() {
    try {
        var raw = (typeof localStorage !== "undefined") ? localStorage.getItem(HISTORY_KEY) : null;
        if (!raw) return [];
        var arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.slice(0, HISTORY_MAX) : [];
    } catch (e) { return []; }
}

function saveHistory(entry) {
    if (typeof localStorage === "undefined") return;
    try {
        var arr = readHistory();
        arr.unshift(entry);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, HISTORY_MAX)));
    } catch (e) { /* 存储满或被禁用则忽略 */ }
}

function clearHistory() {
    if (typeof localStorage === "undefined") return;
    try { localStorage.removeItem(HISTORY_KEY); } catch (e) { /* 忽略 */ }
}

/* ================= 3. 测速引擎（浏览器） ================= */

var API_DL = "/tools/api/speed-test/download";
var API_UL = "/tools/api/speed-test/upload";
var LAT_SAMPLES = 20;
var UL_CONCURRENCY = 4;
var UL_BLOCK_MB = 1;

/* 生成 n 字节随机块（上传用，防压缩/缓存） */
function randomBlock(n) {
    var buf = new Uint8Array(n);
    var C = (typeof crypto !== "undefined" && crypto.getRandomValues) ? crypto : null;
    if (C) {
        var CHUNK = 65536, off;
        for (off = 0; off < n; off += CHUNK) {
            C.getRandomValues(buf.subarray(off, Math.min(off + CHUNK, n)));
        }
    } else {
        var i;
        for (i = 0; i < n; i++) buf[i] = (Math.random() * 256) | 0;
    }
    return buf;
}

var api = {
    median: median,
    mean: mean,
    jitterOf: jitterOf,
    mbpsOf: mbpsOf,
    mbsOf: mbsOf,
    fmt1: fmt1,
    chooseFormalSizeMB: chooseFormalSizeMB,
    rateTier: rateTier,
    readHistory: readHistory,
    saveHistory: saveHistory,
    clearHistory: clearHistory,
    HISTORY_MAX: HISTORY_MAX,
    PREHEAT_THRESHOLD_MBPS: PREHEAT_THRESHOLD_MBPS,
    LAT_SAMPLES: LAT_SAMPLES
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
} else if (typeof window !== "undefined") {
    window.SpeedTestCore = api;
}

/* ------- 以下仅浏览器环境 ------- */
if (typeof document === "undefined" || typeof window === "undefined") {
    return;
}

var L = (typeof window.SpeedTestCore !== "undefined") ? window.SpeedTestCore : api;

function $(id) { return document.getElementById(id); }

/* ---------- 3.1 速率曲线 ---------- */
function Curve(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.samples = [];
    this.resize();
}
Curve.prototype.resize = function () {
    var dpr = window.devicePixelRatio || 1;
    var w = this.cv.clientWidth || this.cv.parentElement.clientWidth || 300;
    var h = 120;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.cv.style.height = h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
};
Curve.prototype.push = function (v) {
    this.samples.push(v);
    if (this.samples.length > 240) this.samples.shift();
    this.draw();
};
Curve.prototype.clear = function () {
    this.samples = [];
    this.draw();
};
Curve.prototype.draw = function () {
    var ctx = this.ctx, dpr = window.devicePixelRatio || 1;
    var w = this.cv.width / dpr, h = this.cv.height / dpr;
    ctx.clearRect(0, 0, w, h);
    /* 网格 */
    ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 1;
    var i, gy;
    for (i = 1; i < 4; i++) {
        gy = (h / 4) * i;
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }
    if (this.samples.length < 2) {
        ctx.fillStyle = "#9ca3af"; ctx.font = "12px sans-serif";
        ctx.fillText("测速时实时绘制速率曲线…", 10, h / 2);
        return;
    }
    var max = Math.max.apply(null, this.samples.concat([1]));
    var n = this.samples.length;
    ctx.beginPath();
    for (i = 0; i < n; i++) {
        var x = (i / (n - 1)) * (w - 8) + 4;
        var y = h - 8 - (this.samples[i] / max) * (h - 24);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#2563eb"; ctx.lineWidth = 2; ctx.stroke();
    /* 面积填充 */
    ctx.lineTo((w - 4), h); ctx.lineTo(4, h); ctx.closePath();
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(37,99,235,.25)"); g.addColorStop(1, "rgba(37,99,235,.02)");
    ctx.fillStyle = g; ctx.fill();
    /* 最大值标注 */
    ctx.fillStyle = "#6b7280"; ctx.font = "11px sans-serif";
    ctx.fillText("峰值 " + L.fmt1(max) + " Mbps", 6, 12);
};

/* ---------- 3.2 测试状态机 ---------- */
var S = {
    running: false,
    aborted: false,
    hiddenPaused: false,
    latSamples: [],
    dlCurve: null,
    ulCurve: null,
    xhrs: []
};

function now() { return (typeof performance !== "undefined") ? performance.now() : Date.now(); }

function checkHidden() {
    if (document.hidden) {
        S.hiddenPaused = true;
        abortAll();
        showStepMsg(1, "检测到页面切到后台，已暂停测试（后台计时不准）。请保持本页在前台，再点「重新测试」。");
        return true;
    }
    return false;
}

function abortAll() {
    S.aborted = true;
    S.xhrs.forEach(function (x) { try { x.abort(); } catch (e) {} });
    S.xhrs = [];
}

function setStep(id, status, text) {
    var el = $("st-step" + id);
    if (!el) return;
    el.classList.remove("st-todo", "st-doing", "st-done");
    el.classList.add(status === "doing" ? "st-doing" : (status === "done" ? "st-done" : "st-todo"));
    var badge = el.querySelector(".st-badge");
    if (badge) badge.textContent = text || (status === "doing" ? "测速中" : (status === "done" ? "完成" : "待测"));
}

function showStepMsg(id, msg) {
    var el = $("st-msg" + id);
    if (el) { el.style.display = "flex"; el.querySelector("span").textContent = msg; }
}

function setProgress(id, pct, label) {
    var bar = $("st-bar" + id), lab = $("st-label" + id);
    if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + "%";
    if (lab && label !== undefined) lab.textContent = label;
}

function setBig(id, v) { var el = $("st-big" + id); if (el) el.textContent = v; }

/* ---------- 3.3 步骤①：延迟 ---------- */
function testLatency() {
    setStep(1, "doing");
    S.latSamples = [];
    var i = 0;
    setProgress(1, 0, "采样 0/" + L.LAT_SAMPLES);

    function one() {
        if (S.aborted) return;
        if (checkHidden()) return;
        var t0 = now();
        fetch(API_DL + "?size_mb=1&_=" + Date.now() + Math.random(), { method: "HEAD", cache: "no-store" })
            .then(function () {
                if (S.aborted) return;
                S.latSamples.push(now() - t0);
                i++;
                setProgress(1, i / L.LAT_SAMPLES * 100, "采样 " + i + "/" + L.LAT_SAMPLES);
                setBig(1, L.fmt1(L.median(S.latSamples)) + " ms");
                if (i < L.LAT_SAMPLES) {
                    setTimeout(one, 60);
                } else {
                    finishLatency();
                }
            })
            .catch(function () {
                if (S.aborted) return;
                showStepMsg(1, "延迟测试请求失败，请检查网络后重试。");
                stopAll("延迟测试失败");
            });
    }
    one();
}

function finishLatency() {
    var med = L.median(S.latSamples), jit = L.jitterOf(S.latSamples);
    setStep(1, "done", "完成");
    setProgress(1, 100, "延迟 " + L.fmt1(med) + " ms · 抖动 " + L.fmt1(jit) + " ms");
    testDownload();
}

/* ---------- 3.4 步骤②：下载 ---------- */
function downloadOnce(sizeMB, onTick) {
    return new Promise(function (resolve, reject) {
        var t0 = now(), bytes = 0, lastTick = t0, lastBytes = 0;
        var ctrl = { cancel: false };
        S.xhrs.push({ abort: function () { ctrl.cancel = true; } });
        fetch(API_DL + "?size_mb=" + sizeMB + "&_=" + Date.now(), { cache: "no-store" })
            .then(function (resp) {
                if (!resp.ok) throw new Error("http " + resp.status);
                var reader = resp.body.getReader();
                function pump() {
                    if (ctrl.cancel || S.aborted) { reject(new Error("aborted")); return; }
                    reader.read().then(function (r) {
                        if (r.done) {
                            var secs = (now() - t0) / 1000;
                            resolve({ bytes: bytes, seconds: secs });
                            return;
                        }
                        bytes += r.value.byteLength;
                        var t = now();
                        if (t - lastTick >= 250) {
                            var inst = L.mbpsOf(bytes - lastBytes, (t - lastTick) / 1000);
                            onTick(bytes, inst, (t - t0) / 1000);
                            lastTick = t; lastBytes = bytes;
                        }
                        pump();
                    }, reject);
                }
                pump();
            })
            .catch(reject);
    });
}

function testDownload() {
    setStep(2, "doing");
    S.dlCurve.clear();
    /* 先 1MB 预热 */
    setProgress(2, 0, "预热中（1MB）…");
    downloadOnce(1, function () {})
        .then(function (pre) {
            if (S.aborted) return;
            if (checkHidden()) return;
            var preMbps = L.mbpsOf(pre.bytes, pre.seconds);
            var formalMB = L.chooseFormalSizeMB(preMbps);
            setProgress(2, 2, "预热 " + L.fmt1(preMbps) + " Mbps → 正式档 " + formalMB + "MB");
            var total = formalMB * BYTES_MB;
            return downloadOnce(formalMB, function (bytes, inst) {
                S.dlCurve.push(inst);
                var pct = bytes / total * 100;
                setProgress(2, pct, "已下载 " + L.fmt1(bytes / BYTES_MB) + " / " + formalMB + " MB · " + L.fmt1(inst) + " Mbps");
                setBig(2, L.fmt1(inst) + " Mbps");
            }).then(function (r) {
                var avg = L.mbpsOf(r.bytes, r.seconds);
                setStep(2, "done", "完成");
                setProgress(2, 100, "下载均值 " + L.fmt1(avg) + " Mbps（" + L.fmt1(L.mbsOf(r.bytes, r.seconds)) + " MB/s）");
                S.dlResult = { bytes: r.bytes, seconds: r.seconds, avgMbps: avg };
                testUpload();
            });
        })
        .catch(function (e) {
            if (S.aborted || e.message === "aborted") return;
            showStepMsg(2, "下载测试失败，请检查网络后重试。");
            stopAll("下载测试失败");
        });
}

/* ---------- 3.5 步骤③：上传 ---------- */
function testUpload() {
    setStep(3, "doing");
    S.ulCurve.clear();
    if (checkHidden()) return;
    var block = randomBlock(UL_BLOCK_MB * BYTES_MB);
    var total = block.byteLength * UL_CONCURRENCY;
    var loaded = new Array(UL_CONCURRENCY).fill(0);
    var t0 = now(), done = 0, failed = false, timer = null;

    setProgress(3, 0, "上传中（4 并发 × 1MB）…");

    timer = setInterval(function () {
        var sum = 0, i;
        for (i = 0; i < UL_CONCURRENCY; i++) sum += loaded[i];
        var secs = (now() - t0) / 1000;
        var inst = L.mbpsOf(sum, secs);
        S.ulCurve.push(inst);
        setProgress(3, sum / total * 100, "已上传 " + L.fmt1(sum / BYTES_MB) + " / " + L.fmt1(total / BYTES_MB) + " MB · " + L.fmt1(inst) + " Mbps");
        setBig(3, L.fmt1(inst) + " Mbps");
    }, 250);

    function finishOne() {
        done++;
        if (done === UL_CONCURRENCY && !failed) {
            clearInterval(timer);
            var secs = (now() - t0) / 1000;
            var avg = L.mbpsOf(total, secs);
            setStep(3, "done", "完成");
            setProgress(3, 100, "上传均值 " + L.fmt1(avg) + " Mbps（" + L.fmt1(L.mbsOf(total, secs)) + " MB/s）");
            showResult(secs, total, avg);
        }
    }

    var i;
    for (i = 0; i < UL_CONCURRENCY; i++) {
        (function (idx) {
            var xhr = new XMLHttpRequest();
            S.xhrs.push(xhr);
            xhr.open("POST", API_UL + "?_=" + Date.now(), true);
            xhr.upload.onprogress = function (e) {
                if (e.lengthComputable) loaded[idx] = e.loaded;
            };
            xhr.onload = function () {
                if (S.aborted) return;
                loaded[idx] = block.byteLength;
                try {
                    var j = JSON.parse(xhr.responseText);
                    if (!j.success) { failed = true; }
                } catch (e) { failed = true; }
                finishOne();
            };
            xhr.onerror = xhr.onabort = function () {
                if (!S.aborted && !failed) {
                    failed = true;
                    clearInterval(timer);
                    showStepMsg(3, "上传测试失败，请检查网络后重试。");
                    stopAll("上传测试失败");
                }
            };
            xhr.send(block);
        })(i);
    }
}

/* ---------- 3.6 结果与历史 ---------- */
function showResult(ulSecs, ulBytes, ulAvg) {
    var dl = S.dlResult;
    var latMed = L.median(S.latSamples), latJit = L.jitterOf(S.latSamples);
    var tier = L.rateTier(dl.avgMbps);

    $("st-result").style.display = "block";
    $("st-r-dl").textContent = L.fmt1(dl.avgMbps);
    $("st-r-dl-mbs").textContent = L.fmt1(L.mbsOf(dl.bytes, dl.seconds));
    $("st-r-ul").textContent = L.fmt1(ulAvg);
    $("st-r-ul-mbs").textContent = L.fmt1(L.mbsOf(ulBytes, ulSecs));
    $("st-r-lat").textContent = L.fmt1(latMed);
    $("st-r-jit").textContent = L.fmt1(latJit);
    $("st-r-tier").textContent = tier.label;
    $("st-r-advice").textContent = tier.advice;
    $("st-result").scrollIntoView({ behavior: "smooth", block: "nearest" });

    var entry = {
        t: Date.now(),
        dl: Math.round(dl.avgMbps * 10) / 10,
        ul: Math.round(ulAvg * 10) / 10,
        lat: Math.round(latMed * 10) / 10,
        jit: Math.round(latJit * 10) / 10
    };
    L.saveHistory(entry);
    renderHistory();
    stopAll(null, true);
}

function renderHistory() {
    var list = $("st-history-list"), empty = $("st-history-empty");
    var arr = L.readHistory();
    if (!list) return;
    list.innerHTML = "";
    if (arr.length === 0) { if (empty) empty.style.display = "block"; return; }
    if (empty) empty.style.display = "none";
    arr.forEach(function (e) {
        var d = new Date(e.t);
        var pad = function (x) { return (x < 10 ? "0" : "") + x; };
        var li = document.createElement("li");
        li.className = "st-hist-item";
        li.innerHTML = "<span class=\"st-hist-time\">" +
            d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " +
            pad(d.getHours()) + ":" + pad(d.getMinutes()) + "</span>" +
            "<span>↓ " + e.dl + " Mbps</span>" +
            "<span>↑ " + e.ul + " Mbps</span>" +
            "<span>延迟 " + e.lat + " ms</span>";
        list.appendChild(li);
    });
}

function stopAll(msg, ok) {
    S.running = false;
    S.aborted = false;
    S.xhrs.forEach(function (x) { try { x.abort(); } catch (e) {} });
    S.xhrs = [];
    var btn = $("st-start");
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="material-icons">refresh</i> 重新测试'; }
    if (msg) showStepMsg(4, msg);
}

function startAll() {
    if (S.running) return;
    S.running = true;
    S.aborted = false;
    S.hiddenPaused = false;
    [1, 2, 3].forEach(function (id) {
        setStep(id, "todo", "待测");
        setProgress(id, 0, "");
        setBig(id, "—");
        var m = $("st-msg" + id);
        if (m) m.style.display = "none";
    });
    $("st-result").style.display = "none";
    var btn = $("st-start");
    if (btn) btn.disabled = true;
    testLatency();
}

/* ---------- 3.7 初始化 ---------- */
function init() {
    S.dlCurve = new Curve($("st-curve-dl"));
    S.ulCurve = new Curve($("st-curve-ul"));
    window.addEventListener("resize", function () {
        S.dlCurve.resize(); S.ulCurve.resize();
    });
    $("st-start").addEventListener("click", startAll);
    $("st-clear-history").addEventListener("click", function () {
        L.clearHistory();
        renderHistory();
    });
    document.addEventListener("visibilitychange", function () {
        if (document.hidden && S.running) checkHidden();
    });
    renderHistory();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

})();
