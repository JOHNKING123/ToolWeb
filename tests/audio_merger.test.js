/* 音频合并器纯逻辑单元测试（零依赖）：node tests/audio_merger.test.js
 * 覆盖：
 * 1. fmtTime / clamp / fmtSize 基础工具
 * 2. floatTo16BitPCM / interleaveChannels PCM 转换
 * 3. encodeWavDataView WAV 头校验（RIFF/WAVE/fmt/data 魔数、采样率/声道/字节率/数据长度字段）
 * 4. resampleLinear 重采样（恒等、升/降采样长度、线性插值）
 * 5. normalizeChannels 声道归一（单声道→立体声复制、立体声→单声道平均、多声道截取）
 * 6. applyFade 淡入淡出（零淡化恒等、端点趋零、中间不受影响、淡化不超段长一半的钳制在 concat 中测）
 * 7. concatSegments 拼接（顺序/时长和/不同采样率归一化/声道统一/静音间隔/淡入淡出/空输入）
 * 8. estimateWavBytes / estimateMp3Bytes 体积预估（公式、比特率递增）
 * 9. moveItem 排序逻辑（上移/下移/越界）
 */
"use strict";
var M = require("../static/js/audio_merger.js");

var pass = 0, fail = 0, total = 0;
function ok(cond, name) {
  total++;
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function approx(a, b, tol, name) { ok(Math.abs(a - b) <= tol, name + "（期望≈" + b + "±" + tol + "，实得 " + a + "）"); }

/* ---------- 1. 基础工具 ---------- */
eq(M.fmtTime(0), "0:00.000", "fmtTime 0");
eq(M.fmtTime(61000), "1:01.000", "fmtTime 61s");
eq(M.fmtTime(1234.5), "0:01.235", "fmtTime 四舍五入");
eq(M.fmtTime(3599999), "59:59.999", "fmtTime 接近1小时");
eq(M.fmtTime(-5), "0:00.000", "fmtTime 负值钳制");
eq(M.clamp(5, 0, 10), 5, "clamp 区间内");
eq(M.clamp(-3, 0, 10), 0, "clamp 下界");
eq(M.clamp(99, 0, 10), 10, "clamp 上界");
eq(M.fmtSize(512), "512 B", "fmtSize B");
eq(M.fmtSize(2048), "2.0 KB", "fmtSize KB");
eq(M.fmtSize(3145728), "3.00 MB", "fmtSize MB");
eq(M.TARGET_RATE, 44100, "目标采样率 44100Hz");

/* ---------- 2. PCM 转换 ---------- */
(function () {
  var p = M.floatTo16BitPCM(new Float32Array([0, 1, -1, 0.5, -0.5, 2, -2]));
  eq(p[0], 0, "pcm 0");
  eq(p[1], 32767, "pcm +1 → 32767");
  eq(p[2], -32768, "pcm -1 → -32768");
  eq(p[3], 16384, "pcm 0.5 → 16384");
  eq(p[4], -16384, "pcm -0.5 → -16384");
  eq(p[5], 32767, "pcm 超上限钳制");
  eq(p[6], -32768, "pcm 超下限钳制");

  var i2 = M.interleaveChannels([new Int16Array([1, 2]), new Int16Array([3, 4])], 2);
  eq(i2.join(","), "1,3,2,4", "双声道交错");
  var i1 = M.interleaveChannels([new Int16Array([7, 8])], 2);
  eq(i1.join(","), "7,8", "单声道交错");
  var i3 = M.interleaveChannels([new Int16Array([1]), new Int16Array([2]), new Int16Array([3])], 1);
  eq(i3.join(","), "1,2", "三声道只取前两声道");
})();

/* ---------- 3. WAV 头 ---------- */
(function () {
  function hdr(sr, nch, frames) {
    var inter = new Int16Array(frames * nch);
    return { dv: M.encodeWavDataView(sr, nch, inter), frames: frames, nch: nch, sr: sr };
  }
  function str(dv, off, len) {
    var s = "";
    for (var i = 0; i < len; i++) s += String.fromCharCode(dv.getUint8(off + i));
    return s;
  }
  var t = hdr(44100, 2, 100);
  eq(str(t.dv, 0, 4), "RIFF", "WAV 魔数 RIFF");
  eq(t.dv.getUint32(4, true), 44 + 100 * 2 * 2 - 8, "RIFF chunk size");
  eq(str(t.dv, 8, 4), "WAVE", "WAVE 魔数");
  eq(str(t.dv, 12, 4), "fmt ", "fmt 魔数");
  eq(t.dv.getUint32(16, true), 16, "fmt chunk size 16");
  eq(t.dv.getUint16(20, true), 1, "PCM format=1");
  eq(t.dv.getUint16(22, true), 2, "声道数 2");
  eq(t.dv.getUint32(24, true), 44100, "采样率 44100");
  eq(t.dv.getUint32(28, true), 44100 * 2 * 2, "byte rate");
  eq(t.dv.getUint16(32, true), 4, "block align");
  eq(t.dv.getUint16(34, true), 16, "16-bit");
  eq(str(t.dv, 36, 4), "data", "data 魔数");
  eq(t.dv.getUint32(40, true), 100 * 2 * 2, "data 字节数");
  eq(t.dv.buffer.byteLength, 44 + 100 * 2 * 2, "总字节数");
  var m1 = hdr(22050, 1, 50);
  eq(m1.dv.getUint32(24, true), 22050, "单声道采样率字段");
  eq(m1.dv.getUint16(22, true), 1, "单声道声道数字段");
})();

/* ---------- 4. 重采样 ---------- */
(function () {
  var src = new Float32Array([0, 1, 2, 3]);
  ok(M.resampleLinear(src, 44100, 44100) === src, "同采样率返回原数组");
  var up = M.resampleLinear(new Float32Array([0, 2]), 1, 2); // 1Hz→2Hz，长度翻倍
  eq(up.length, 4, "升采样长度");
  approx(up[1], 1, 1e-6, "升采样线性插值中点");
  var dn = M.resampleLinear(new Float32Array([0, 1, 2, 3]), 4, 2);
  eq(dn.length, 2, "降采样长度");
  approx(dn[0], 0, 1e-6, "降采样起点");
  approx(dn[1], 2, 1e-6, "降采样终点");
  var empty = M.resampleLinear(new Float32Array([5]), 48000, 44100);
  ok(empty.length >= 1, "极短输入不崩溃");
})();

/* ---------- 5. 声道归一 ---------- */
(function () {
  var mono = [new Float32Array([0.5, -0.5])];
  var st = M.normalizeChannels(mono, 2);
  eq(st.length, 2, "单声道→立体声 声道数");
  eq(st[0][0], 0.5, "复制声道左");
  eq(st[1][1], -0.5, "复制声道右");
  ok(st[0] !== st[1], "复制后为独立数组");

  var stereo = [new Float32Array([1, 1]), new Float32Array([-1, -1])];
  var mo = M.normalizeChannels(stereo, 1);
  eq(mo.length, 1, "立体声→单声道 声道数");
  approx(mo[0][0], 0, 1e-6, "正负相消平均为0");

  var same = M.normalizeChannels(stereo, 2);
  ok(same === stereo, "声道数相同返回原数组");

  var quad = [new Float32Array([1]), new Float32Array([2]), new Float32Array([3]), new Float32Array([4])];
  var q2 = M.normalizeChannels(quad, 2);
  eq(q2.length, 2, "四声道→立体声");
  eq(q2[1][0], 2, "取前两声道");
  var q1 = M.normalizeChannels(quad, 1);
  approx(q1[0][0], 2.5, 1e-6, "四声道→单声道全平均");
})();

/* ---------- 6. 淡入淡出 ---------- */
(function () {
  var ch = new Float32Array([1, 1, 1, 1, 1, 1, 1, 1]);
  ok(M.applyFade(ch, 0, 0) === ch, "零淡化返回原数组");
  var f = M.applyFade(ch, 4, 4);
  approx(f[0], 0, 1e-6, "淡入起点≈0");
  approx(f[7], 0, 1e-6, "淡出终点≈0");
  ok(f[3] > 0.8 && f[4] > 0.8, "淡入淡出衔接处增益接近1");
  var long = new Float32Array(100).fill(1);
  var fl = M.applyFade(long, 10, 10);
  eq(fl[50], 1, "长段中部完全不受影响");
  ok(f[1] > f[0] && f[2] > f[1], "淡入单调递增");
  ok(f[6] < f[5] && f[5] < f[4], "淡出单调递减");
  var onlyIn = M.applyFade(ch, 4, 0);
  eq(onlyIn[7], 1, "只淡入时尾部不变");
  var clamped = M.applyFade(ch, 100, 100);
  approx(clamped[0], 0, 1e-6, "淡化采样数超长时钳制不崩溃");
})();

/* ---------- 7. 拼接 ---------- */
function seg(fill, seconds, sr, nch) {
  var len = Math.round(seconds * sr);
  var chs = [];
  for (var c = 0; c < nch; c++) {
    var a = new Float32Array(len);
    for (var i = 0; i < len; i++) a[i] = fill;
    chs.push(a);
  }
  return { channels: chs, sampleRate: sr };
}
(function () {
  // 3 段不同采样率：44100/48000/22050，各 1 秒，全单声道
  var s1 = seg(0.1, 1, 44100, 1);
  var s2 = seg(0.2, 1, 48000, 1);
  var s3 = seg(0.3, 1, 22050, 1);
  var m = M.concatSegments([s1, s2, s3], { targetRate: 44100, fadeMs: 0, gapSec: 0 });
  eq(m.sampleRate, 44100, "拼接目标采样率");
  eq(m.channels.length, 1, "全单声道→单声道");
  approx(m.duration, 3, 0.05, "时长≈各段之和");
  ok(m.channels[0][0] > 0.05 && m.channels[0][0] < 0.15, "第1段内容在前（值≈0.1）");
  ok(m.channels[0][44100] > 0.15 && m.channels[0][44100] < 0.25, "第2段内容在中（值≈0.2）");
  ok(m.channels[0][88200] > 0.25 && m.channels[0][88200] < 0.35, "第3段内容在后（值≈0.3）");

  // 声道统一：混入一段立体声 → 全部立体声，单声道段被复制
  var ms = M.concatSegments([seg(0.5, 0.5, 44100, 1), seg(0.6, 0.5, 44100, 2)], { fadeMs: 0, gapSec: 0 });
  eq(ms.channels.length, 2, "混入立体声→统一立体声");
  approx(ms.channels[0][0], 0.5, 1e-6, "单声道段左声道");
  approx(ms.channels[1][0], 0.5, 1e-6, "单声道段右声道为复制");

  // 静音间隔：1 秒段 + 0.5 秒间隔 + 1 秒段
  var mg = M.concatSegments([seg(1, 1, 44100, 1), seg(1, 1, 44100, 1)], { fadeMs: 0, gapSec: 0.5 });
  approx(mg.duration, 2.5, 0.01, "静音间隔计入总时长");
  var gapMid = mg.channels[0].subarray(44100 + 100, 44100 + 22050 - 100);
  var allZero = true;
  for (var i = 0; i < gapMid.length; i++) if (gapMid[i] !== 0) { allZero = false; break; }
  ok(allZero, "间隔段为纯静音（全零）");

  // 淡入淡出：100ms 淡化
  var mf = M.concatSegments([seg(1, 1, 44100, 1)], { fadeMs: 100, gapSec: 0 });
  approx(mf.channels[0][0], 0, 1e-6, "淡入起点≈0");
  approx(mf.channels[0][mf.channels[0].length - 1], 0, 1e-6, "淡出终点≈0");

  // 淡化钳制：极短段（10ms）配 100ms 淡化不崩溃，且总时长不变
  var tiny = M.concatSegments([seg(1, 0.01, 44100, 1)], { fadeMs: 100, gapSec: 0 });
  approx(tiny.duration, 0.01, 0.005, "极短段淡化钳制后时长不变");

  // 空输入
  var me = M.concatSegments([], { fadeMs: 0, gapSec: 0 });
  eq(me.duration, 0, "空段列表时长为0");
  eq(me.channels.length, 0, "空段列表无声道");

  // 顺序打乱后拼接内容对应新顺序
  var a = seg(0.11, 0.5, 44100, 1), b = seg(0.22, 0.5, 44100, 1);
  var mo2 = M.concatSegments([b, a], { fadeMs: 0, gapSec: 0 });
  ok(mo2.channels[0][0] > 0.2 && mo2.channels[0][22050] < 0.15, "顺序=b,a 时内容与顺序对应");
})();

/* ---------- 8. 体积预估 ---------- */
(function () {
  eq(M.estimateWavBytes(10, 44100, 2), 44 + 441000 * 2 * 2, "WAV 预估公式");
  eq(M.estimateWavBytes(10, 44100, 1), 44 + 441000 * 2, "WAV 单声道预估");
  var s64 = M.estimateMp3Bytes(60, 64);
  var s128 = M.estimateMp3Bytes(60, 128);
  var s192 = M.estimateMp3Bytes(60, 192);
  var s320 = M.estimateMp3Bytes(60, 320);
  ok(s64 < s128 && s128 < s192 && s192 < s320, "MP3 预估随比特率递增");
  approx(s128, 128 * 1000 / 8 * 60, 1, "MP3 预估公式");
  eq(M.estimateMp3Bytes(0, 128), 0, "零时长预估为0");
})();

/* ---------- 9. 排序 ---------- */
(function () {
  var l = ["a", "b", "c"];
  eq(M.moveItem(l, 1, -1).join(","), "b,a,c", "上移");
  eq(M.moveItem(l, 1, 1).join(","), "a,c,b", "下移");
  eq(M.moveItem(l, 0, -1), null, "首项上移越界");
  eq(M.moveItem(l, 2, 1), null, "末项下移越界");
  eq(M.moveItem(l, 5, 1), null, "非法下标");
  eq(M.moveItem(l, -1, 1), null, "负下标");
  eq(l.join(","), "a,b,c", "原数组不被修改");
  eq(M.moveItem([], 0, 1), null, "空列表");
})();

console.log("\n断言总数: " + total + "，通过: " + pass + "，失败: " + fail);
process.exit(fail === 0 ? 0 : 1);
