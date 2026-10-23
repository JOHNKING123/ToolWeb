/* 白噪音发生器纯逻辑单元测试（零依赖）：node tests/white_noise_generator.test.js
 * 覆盖：白/粉/棕噪声算法特性、滤波器、循环交叉淡化、峰值归一化、六种声音
 * 合成、混音增益归一化防削波、定时器逻辑/倒计时、预设、localStorage 序列
 * 化、源码零 fetch/XHR/外部音频。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var wn = require("../static/js/white_noise_generator.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "white_noise_generator.js"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function near(a, b, eps, name) { ok(Math.abs(a - b) <= eps, name + "（期望≈" + b + "±" + eps + "，实得 " + a + "）"); }
/* 确定性随机：mulberry32 */
function seeded(seed) {
    var a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function stats(buf) {
    var n = buf.length, sum = 0, peak = 0, i;
    for (i = 0; i < n; i++) { sum += buf[i]; var a = Math.abs(buf[i]); if (a > peak) peak = a; }
    var mean = sum / n, varSum = 0;
    for (i = 0; i < n; i++) { var d = buf[i] - mean; varSum += d * d; }
    return { mean: mean, peak: peak, std: Math.sqrt(varSum / n) };
}

/* ---------- 1. 白噪声 ---------- */
(function () {
    var r = seeded(1);
    for (var i = 0; i < 5000; i++) {
        var s = wn.whiteSample(r);
        ok(s >= -1 && s < 1, "白噪声样本在 [-1,1) 内");
        if (!ok._reported && (s < -1 || s >= 1)) { ok._reported = true; }
    }
    var buf = wn.genWhite(44100, 1, seeded(7));
    eq(buf.length, 44100, "白噪声 1 秒缓冲长度 44100");
    var st = stats(buf);
    near(st.mean, 0, 0.02, "白噪声均值≈0");
    ok(st.std > 0.4 && st.std < 0.75, "白噪声标准差在均匀分布预期内（实得 " + st.std.toFixed(3) + "）");
})();

/* ---------- 2. 粉噪声 Voss-McCartney ---------- */
(function () {
    var r = seeded(2);
    var st8 = wn.newPinkState(r);
    eq(st8.rows.length, 8, "粉噪声状态 8 行随机数表");
    var prev = null, maxJump = 0, vals = [];
    for (var i = 0; i < 5000; i++) {
        var s = wn.pinkStep(st8, r);
        vals.push(s);
        if (prev !== null) { var j = Math.abs(s - prev); if (j > maxJump) maxJump = j; }
        prev = s;
    }
    var stt = stats(Float32Array.from(vals));
    ok(isFinite(stt.mean) && Math.abs(stt.mean) < 0.1, "粉噪声均值≈0");
    ok(stt.peak < 2.5, "粉噪声峰值有界（实得 " + stt.peak.toFixed(2) + "）");
    ok(stt.std < 0.9, "粉噪声能量低于白噪声（低频集中，实得 " + stt.std.toFixed(3) + "）");
    /* 两次同种子应完全一致（确定性） */
    var a = wn.pinkStep(wn.newPinkState(seeded(9)), seeded(9));
    var b = wn.pinkStep(wn.newPinkState(seeded(9)), seeded(9));
    eq(a, b, "同种子粉噪声确定性一致");
})();

/* ---------- 3. 棕噪声积分连续性 ---------- */
(function () {
    var r = seeded(3), st = wn.newBrownState();
    var prev = wn.brownStep(st, r), maxJump = 0;
    for (var i = 0; i < 20000; i++) {
        var s = wn.brownStep(st, r);
        var j = Math.abs(s - prev);
        if (j > maxJump) maxJump = j;
        prev = s;
    }
    ok(maxJump < 0.25, "棕噪声相邻样本跳变小（积分连续，最大 " + maxJump.toFixed(3) + "）");
    ok(Math.abs(prev) < 3, "棕噪声长期不漂移发散（末值 " + prev.toFixed(2) + "）");
})();

/* ---------- 4. 滤波器 ---------- */
(function () {
    var lp = wn.newFilterState();
    var out = 0;
    for (var i = 0; i < 1000; i++) out = wn.lowpassStep(lp, 1, 0.1);
    near(out, 1, 0.01, "低通收敛到直流 1");
    var hp = wn.newFilterState();
    var h = 0;
    for (var j = 0; j < 1000; j++) h = wn.highpassStep(hp, 1, 0.1);
    near(h, 0, 0.01, "高通滤除直流→0");
})();

/* ---------- 5. 循环交叉淡化 ---------- */
(function () {
    var buf = new Float32Array([0, 0, 0, 0, 10, 10, 10, 10]);
    var out = wn.crossfadeLoop(buf, 0.5);
    /* blend=4：j=3 时 t=0.75，out[7] = 10*0.25 + 0*0.75 = 2.5 */
    near(out[7], 2.5, 1e-6, "交叉淡化末端按比例混入首部");
    ok(Math.abs(out[7] - buf[0]) < Math.abs(buf[7] - buf[0]), "接缝处不连续度显著减小");
    eq(out[0], 0, "首部保持不变");
    eq(buf[7], 10, "原缓冲不被修改");
})();

/* ---------- 6. 峰值归一化 ---------- */
(function () {
    var buf = new Float32Array([0.2, -0.4, 0.1]);
    var r = wn.normalizePeak(buf, 0.9);
    near(r.peak, 0.9, 1e-6, "归一化后峰值 0.9");
    near(buf[1], -0.9, 1e-6, "原位缩放");
    var z = wn.normalizePeak(new Float32Array(4), 0.9);
    eq(z.peak, 0, "全零缓冲不除零");
})();

/* ---------- 7. 六种声音合成 ---------- */
(function () {
    var sr = 8000, sec = 2;
    wn.KINDS.forEach(function (k) {
        var buf = wn.genKind(k, sr, sec, seeded(42));
        ok(buf && buf.length === sr * sec, k + " 缓冲长度正确");
        var st = stats(buf);
        ok(isFinite(st.mean) && st.peak > 0.05, k + " 有有效信号（峰值 " + st.peak.toFixed(2) + "）");
        ok(st.peak < 5, k + " 峰值有界无爆音");
    });
    eq(wn.genKind("nope", sr, sec, seeded(1)), null, "未知类型返回 null");
    /* 雨声含雨滴爆发：峰值明显高于基底 */
    var rain = wn.genRain(sr, 8, seeded(5));
    var rs = stats(rain);
    ok(rs.peak > rs.std * 2.5, "雨声含雨滴瞬态（峰值 " + rs.peak.toFixed(2) + " > 2.5σ）");
    /* 雷声有轰隆包络：长缓冲能量起伏 */
    var th = wn.genThunder(sr, 30, seeded(6));
    var seg = 6, segE = [];
    for (var i = 0; i < seg; i++) {
        var e = 0;
        for (var j = Math.floor(i * th.length / seg); j < Math.floor((i + 1) * th.length / seg); j++) e += th[j] * th[j];
        segE.push(e);
    }
    var mx = Math.max.apply(null, segE), mn = Math.min.apply(null, segE);
    ok(mx > mn * 2, "雷声分段能量起伏（有轰隆包络）");
    /* 风声慢扫幅：分段能量起伏但不过激 */
    var wd = wn.genWind(sr, 20, seeded(8));
    var ws = stats(wd);
    ok(ws.peak < 2 && ws.std > 0.05, "风声幅度合理");
})();

/* ---------- 8. 混音增益归一化（防削波） ---------- */
(function () {
    var g1 = { white: 0.2, pink: 0.3, brown: 0, rain: 0, thunder: 0, wind: 0 };
    var n1 = wn.normalizeGains(g1);
    eq(n1.scale, 1, "求和 0.5 未超限不缩放");
    eq(n1.gains.white, 0.2, "未缩放时增益不变");
    var g2 = { white: 1, pink: 1, brown: 1, rain: 1, thunder: 1, wind: 1 };
    var n2 = wn.normalizeGains(g2);
    var sum = 0, kk;
    for (kk in n2.gains) sum += n2.gains[kk];
    near(sum, wn.MIX_HEADROOM, 1e-9, "六层全开求和钳到 0.85");
    ok(n2.scale < 1, "超限时 scale<1");
    near(n2.gains.white, n2.gains.pink, 1e-9, "等比缩放保持各层比例");
    var g3 = { white: -5, pink: NaN, brown: 2, rain: 0, thunder: 0, wind: 0 };
    var n3 = wn.normalizeGains(g3);
    eq(n3.gains.white, 0, "负增益钳 0");
    eq(n3.gains.pink, 0, "NaN 增益钳 0");
    ok(n3.gains.brown <= 1, "超 1 增益先钳 1");
})();

/* ---------- 9. 定时器逻辑 ---------- */
(function () {
    var s = wn.computeTimerState(900, 0);
    eq(s.done, false, "刚开始未结束");
    eq(s.fading, false, "剩余充足不淡出");
    near(s.remainingSec, 900, 1e-9, "剩余 900 秒");
    s = wn.computeTimerState(60, 55000);
    eq(s.fading, true, "剩余 5 秒进入淡出");
    eq(s.done, false, "淡出中未结束");
    s = wn.computeTimerState(60, 60000);
    eq(s.done, true, "到期结束");
    eq(s.remainingSec, 0, "到期剩余 0");
    s = wn.computeTimerState(60, 120000);
    eq(s.done, true, "超期仍结束");
    eq(wn.FADE_SECONDS, 10, "淡出时长 10 秒");
})();

/* ---------- 10. 倒计时格式化 ---------- */
(function () {
    eq(wn.formatHMS(0), "00:00", "0 秒");
    eq(wn.formatHMS(65), "01:05", "65 秒");
    eq(wn.formatHMS(600), "10:00", "600 秒");
    eq(wn.formatHMS(3661), "01:01:01", "3661 秒带小时");
    eq(wn.formatHMS(-5), "00:00", "负数钳 0");
})();

/* ---------- 11. 预设 ---------- */
(function () {
    var ids = Object.keys(wn.PRESETS);
    eq(ids.length, 4, "4 个预设");
    ["focus", "sleep", "rainy", "custom"].forEach(function (id) {
        ok(!!wn.PRESETS[id], "预设存在：" + id);
        wn.KINDS.forEach(function (k) {
            var v = wn.PRESETS[id].mix[k];
            ok(typeof v === "number" && v >= 0 && v <= 100, "预设 " + id + "·" + k + " 音量 0~100");
        });
    });
    ok(wn.PRESETS.focus.mix.pink >= 60, "专注工作预设粉噪为主");
    ok(wn.PRESETS.sleep.mix.brown >= 60, "深度睡眠预设棕噪为主");
    ok(wn.PRESETS.rainy.mix.rain >= 60, "雨夜预设雨声为主");
    var m = wn.applyPresetMix(wn.defaultMix(), "sleep");
    eq(m.brown, wn.PRESETS.sleep.mix.brown, "应用预设混音值一致");
    eq(wn.applyPresetMix(wn.defaultMix(), "nope").white, 0, "未知预设返回原混音");
    var d = wn.defaultMix();
    eq(Object.keys(d).length, 6, "默认混音 6 层");
    ok(Object.keys(d).every(function (k) { return d[k] === 0; }), "默认混音全 0");
})();

/* ---------- 12. 持久化序列化 ---------- */
(function () {
    eq(wn.STORAGE_KEY, "white_noise_generator:mix:v1", "存储键名");
    var cfg = { mix: { white: 30, pink: 70, brown: 0, rain: 0, thunder: 0, wind: 10 }, master: 80, preset: "focus", timerMin: 30 };
    var json = wn.serializeConfig(cfg);
    var back = wn.parseConfig(json);
    eq(back.mix.pink, 70, "往返：粉噪 70");
    eq(back.master, 80, "往返：主音量 80");
    eq(back.preset, "focus", "往返：预设 focus");
    eq(back.timerMin, 30, "往返：定时 30 分钟");
    eq(wn.parseConfig(""), null, "空字符串返回 null");
    eq(wn.parseConfig("{bad json"), null, "非法 JSON 返回 null");
    eq(wn.parseConfig(null), null, "null 返回 null");
    var dirty = wn.parseConfig(JSON.stringify({ mix: { white: 999, pink: -3, xxx: 50 }, master: "abc", preset: "nope", timerMin: 9999 }));
    eq(dirty.mix.white, 100, "音量 999 钳到 100");
    eq(dirty.mix.pink, 0, "音量 -3 钳到 0");
    eq(dirty.mix.brown, 0, "缺失层补 0");
    eq(dirty.master, 0, "非法主音量钳 0");
    eq(dirty.preset, "custom", "非法预设回退 custom");
    eq(dirty.timerMin, 0, "超限定时回退 0");
    eq(wn.sanitizeVolume(55.6), 56, "音量四舍五入");
})();

/* ---------- 13. 源码零 fetch/XHR/外部音频 ---------- */
(function () {
    function has(re) { return re.test(SRC); }
    ok(!has(/(^|[^a-zA-Z_$])fetch\s*\(/), "源码无 fetch(");
    ok(SRC.indexOf("XMLHttpRequest") === -1, "源码无 XMLHttpRequest");
    ok(!has(/\.(mp3|wav|ogg|flac|m4a|aac)\b/i), "源码无音频文件引用");
    ok(!has(/https?:\/\//), "源码无 http(s) URL");
    ok(!has(/\bAudio\s*\(/), "源码无 new Audio(");
})();

/* ---------- 汇总 ---------- */
console.log("\n白噪音发生器测试：通过 " + pass + "，失败 " + fail);
process.exit(fail ? 1 : 0);
