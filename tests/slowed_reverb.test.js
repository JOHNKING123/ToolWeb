/* 音频变速混响生成器纯逻辑单元测试（零依赖）：node tests/slowed_reverb.test.js
 * 覆盖：
 * 1. fmtTime / clamp / fmtSize 基础工具
 * 2. clampSpeed 变速钳制（0.5x–1.5x，非法输入）
 * 3. SPEED_PRESETS 预设表（0.8x Slowed / 1.0x 正常 / 1.25x Nightcore）
 * 4. REVERB_PRESETS 预设表（4 预设键名/参数合法性）+ getReverbPreset
 * 5. hashStr / mulberry32 确定性随机
 * 6. synthesizeIR 脉冲响应合成（长度/归一化/衰减包络/立体声去相关/确定性/回声抽头）
 * 7. clampWet01 / wetDryGains 干湿增益（等功率、端点行为）
 * 8. renderedDuration / estimateWavBytes / estimateMp3Bytes
 * 9. makeExportName 文件名规则
 * 10. floatTo16BitPCM / interleaveChannels / encodeWavDataView WAV 编码
 * 11. resampleLinear 重采样
 */
"use strict";
var M = require("../static/js/slowed_reverb.js");

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
eq(M.fmtTime(-5), "0:00.000", "fmtTime 负值钳制");
eq(M.clamp(5, 0, 10), 5, "clamp 区间内");
eq(M.clamp(-3, 0, 10), 0, "clamp 下界");
eq(M.clamp(99, 0, 10), 10, "clamp 上界");
eq(M.fmtSize(512), "512 B", "fmtSize B");
eq(M.fmtSize(2048), "2.0 KB", "fmtSize KB");
eq(M.fmtSize(3145728), "3.00 MB", "fmtSize MB");

/* ---------- 2. 变速钳制 ---------- */
eq(M.SPEED_MIN, 0.5, "SPEED_MIN 0.5x");
eq(M.SPEED_MAX, 1.5, "SPEED_MAX 1.5x");
eq(M.clampSpeed(1.25), 1.25, "clampSpeed 区间内");
eq(M.clampSpeed(0.5), 0.5, "clampSpeed 下界");
eq(M.clampSpeed(1.5), 1.5, "clampSpeed 上界");
eq(M.clampSpeed(0.2), 0.5, "clampSpeed 过低钳制到 0.5");
eq(M.clampSpeed(2.0), 1.5, "clampSpeed 过高钳制到 1.5");
eq(M.clampSpeed(0), 0.5, "clampSpeed 0 钳制到 0.5");
eq(M.clampSpeed(-3), 0.5, "clampSpeed 负值钳制到 0.5");
eq(M.clampSpeed(NaN), 1, "clampSpeed NaN 回退 1.0");
eq(M.clampSpeed("abc"), 1, "clampSpeed 非数字字符串回退 1.0");
eq(M.clampSpeed("0.8"), 0.8, "clampSpeed 数字字符串可解析");

/* ---------- 3. 变速预设表 ---------- */
eq(M.SPEED_PRESETS.length, 3, "变速预设 3 个");
(function () {
  var keys = M.SPEED_PRESETS.map(function (p) { return p.key; });
  eq(keys.join(","), "slowed,normal,nightcore", "变速预设键名");
  var byKey = {};
  M.SPEED_PRESETS.forEach(function (p) { byKey[p.key] = p.speed; });
  eq(byKey.slowed, 0.8, "Slowed 预设 0.8x");
  eq(byKey.normal, 1.0, "正常预设 1.0x");
  eq(byKey.nightcore, 1.25, "Nightcore 预设 1.25x");
  ok(M.SPEED_PRESETS.every(function (p) { return p.speed >= M.SPEED_MIN && p.speed <= M.SPEED_MAX; }),
    "所有变速预设都在钳制区间内");
  ok(M.SPEED_PRESETS.every(function (p) { return typeof p.label === "string" && p.label.length > 0; }),
    "所有变速预设都有展示文案");
})();

/* ---------- 4. 混响预设表 ---------- */
(function () {
  var keys = Object.keys(M.REVERB_PRESETS);
  eq(keys.length, 4, "混响预设 4 个");
  ["nostalgic", "ambient", "deep-room", "soft-echo"].forEach(function (k) {
    ok(keys.indexOf(k) >= 0, "混响预设有 " + k);
  });
  keys.forEach(function (k) {
    var p = M.REVERB_PRESETS[k];
    eq(p.key, k, k + " key 自洽");
    ok(typeof p.name === "string" && p.name.length > 0, k + " 有中文名");
    ok(p.irLen > 0 && p.irLen <= 5, k + " irLen 合法 (0,5]");
    ok(p.decay > 0, k + " decay > 0");
    ok(p.damping > 0 && p.damping < 1, k + " damping 在 (0,1)");
    if (p.echo) {
      ok(p.echo.delayMs > 0 && p.echo.delayMs < p.irLen * 1000, k + " echo 延迟小于 IR 总长");
      ok(p.echo.gain > 0 && p.echo.gain < 1, k + " echo 增益 (0,1)");
      ok(p.echo.taps >= 1 && p.echo.taps <= 8, k + " echo 抽头数 1..8");
    }
  });
  eq(M.REVERB_PRESETS["soft-echo"].echo.taps, 4, "soft-echo 4 个回声抽头");
  eq(M.REVERB_PRESETS.nostalgic.echo, null, "nostalgic 无回声抽头");
  ok(M.getReverbPreset("nostalgic") === M.REVERB_PRESETS.nostalgic, "getReverbPreset 命中返回同一对象");
  eq(M.getReverbPreset("不存在"), null, "getReverbPreset 非法键返回 null");
  eq(M.getReverbPreset(""), null, "getReverbPreset 空键返回 null");
  // 四预设 IR 时长各不相同（可区分）
  var lens = keys.map(function (k) { return M.REVERB_PRESETS[k].irLen; });
  ok(new Set(lens).size === 4, "四预设 IR 时长互不相同");
})();

/* ---------- 5. 确定性随机 ---------- */
(function () {
  eq(typeof M.hashStr("nostalgic"), "number", "hashStr 返回数字");
  eq(M.hashStr("nostalgic"), M.hashStr("nostalgic"), "hashStr 确定性");
  ok(M.hashStr("nostalgic") !== M.hashStr("ambient"), "hashStr 不同输入大概率不同");
  var r1 = M.mulberry32(12345), r2 = M.mulberry32(12345);
  var same = true;
  for (var i = 0; i < 50; i++) { if (r1() !== r2()) { same = false; break; } }
  ok(same, "mulberry32 同一种子序列完全一致");
  var r3 = M.mulberry32(54321);
  ok(r1() !== r3() || true, "mulberry32 可调用");
  var vals = [];
  for (var j = 0; j < 200; j++) vals.push(M.mulberry32(7)() >= 0 && M.mulberry32(7)() < 1);
  ok(vals.every(Boolean), "mulberry32 输出都在 [0,1)");
})();

/* ---------- 6. IR 合成 ---------- */
(function () {
  var SR = 44100;
  eq(M.synthesizeIR("不存在", SR, 2), null, "IR 非法预设返回 null");
  eq(M.synthesizeIR("nostalgic", 0, 2), null, "IR 采样率 0 返回 null");
  eq(M.synthesizeIR("nostalgic", -1, 2), null, "IR 负采样率返回 null");

  var ir = M.synthesizeIR("nostalgic", SR, 2);
  ok(Array.isArray(ir) && ir.length === 2, "IR 立体声返回 2 条");
  var expectLen = Math.floor(2.0 * SR);
  eq(ir[0].length, expectLen, "IR 长度 = irLen × 采样率");
  eq(ir[1].length, expectLen, "IR 右声道长度一致");

  function energy(ch) { var e = 0; for (var i = 0; i < ch.length; i++) e += ch[i] * ch[i]; return e; }
  approx(energy(ir[0]), 1.0, 1e-6, "IR 左声道能量归一化（Σh²≈1.0）");
  approx(energy(ir[1]), 1.0, 1e-6, "IR 右声道能量归一化（Σh²≈1.0）");

  // 衰减包络：前 10% 能量显著大于后 10%
  function meanAbs(ch, from, to) { var s = 0; for (var i = from; i < to; i++) s += Math.abs(ch[i]); return s / (to - from); }
  var head = meanAbs(ir[0], 0, Math.floor(expectLen * 0.1));
  var tail = meanAbs(ir[0], Math.floor(expectLen * 0.9), expectLen);
  ok(head > tail * 3, "IR 指数衰减：头部能量显著大于尾部");

  // 立体声去相关：左右声道不完全相同
  var identical = true;
  for (var i = 0; i < Math.min(5000, ir[0].length); i += 7) {
    if (ir[0][i] !== ir[1][i]) { identical = false; break; }
  }
  ok(!identical, "IR 立体声两声道去相关（种子不同）");

  // 确定性：两次合成完全一致
  var ir2 = M.synthesizeIR("nostalgic", SR, 2);
  var detSame = true;
  for (var k = 0; k < ir[0].length; k += 13) {
    if (ir[0][k] !== ir2[0][k]) { detSame = false; break; }
  }
  ok(detSame, "IR 合成确定性：同预设两次结果一致");

  // 单声道
  var mono = M.synthesizeIR("ambient", SR, 1);
  eq(mono.length, 1, "IR 单声道只返回 1 条");
  eq(mono[0].length, Math.floor(3.5 * SR), "ambient IR 长度 3.5s");

  // 低采样率也工作
  var lo = M.synthesizeIR("deep-room", 8000, 2);
  eq(lo[0].length, Math.floor(1.1 * 8000), "低采样率 IR 长度正确");

  // nCh 非法值回退立体声
  eq(M.synthesizeIR("nostalgic", SR, 5).length, 2, "nCh 非法回退为立体声");
})();

/* ---------- 6b. soft-echo 回声抽头 ---------- */
(function () {
  var SR = 44100;
  // 暂时关掉 echo，对比同一预设有无抽头的差异（种子相同，保证可比）
  var p = M.REVERB_PRESETS["soft-echo"];
  var savedEcho = p.echo;
  p.echo = null;
  var noEcho = M.synthesizeIR("soft-echo", SR, 1)[0];
  p.echo = savedEcho;
  var withEcho = M.synthesizeIR("soft-echo", SR, 1)[0];

  var d = Math.floor(savedEcho.delayMs / 1000 * SR);
  // 能量归一化后两版本的归一化系数不同，抽头前区域应成固定比例（常数倍）
  var ratios = [];
  for (var i = 0; i < d; i += 11) {
    if (Math.abs(noEcho[i]) > 1e-9) ratios.push(withEcho[i] / noEcho[i]);
  }
  ok(ratios.length > 0, "soft-echo 抽头前区域有足够采样点计算比例");
  var ratioConst = true;
  for (var r = 1; r < ratios.length; r++) {
    if (Math.abs(ratios[r] - ratios[0]) > 1e-6 * Math.abs(ratios[0])) { ratioConst = false; break; }
  }
  ok(ratioConst, "soft-echo 第一抽头前与无抽头版本成固定比例（能量归一化所致）");
  // 抽头位置叠加了能量：抽头处两者不同
  ok(noEcho[d + 10] !== withEcho[d + 10], "soft-echo 抽头位置叠加了回声");
  // 抽头窗口能量更大
  function sumAbs(ch, from, to) { var s = 0; for (var j = from; j < to && j < ch.length; j++) s += Math.abs(ch[j]); return s; }
  var win = 400;
  ok(sumAbs(withEcho, d, d + win) > sumAbs(noEcho, d, d + win), "soft-echo 抽头窗口能量大于无抽头版本");
})();

/* ---------- 7. 干湿增益 ---------- */
eq(M.clampWet01(0.5), 0.5, "clampWet01 区间内");
eq(M.clampWet01(2), 1, "clampWet01 上钳制");
eq(M.clampWet01(-1), 0, "clampWet01 下钳制");
eq(M.clampWet01(NaN), 0, "clampWet01 NaN 回退 0");
(function () {
  var g0 = M.wetDryGains(0);
  approx(g0.dry, 1, 1e-9, "wet=0 干声增益 1（纯变速）");
  approx(g0.wet, 0, 1e-9, "wet=0 湿声增益 0");
  var g1 = M.wetDryGains(1);
  approx(g1.dry, 0, 1e-9, "wet=1 干声增益 0");
  approx(g1.wet, 1, 1e-9, "wet=1 湿声增益 1");
  var g5 = M.wetDryGains(0.5);
  approx(g5.dry, Math.SQRT1_2, 1e-9, "wet=0.5 干声 √2/2");
  approx(g5.wet, Math.SQRT1_2, 1e-9, "wet=0.5 湿声 √2/2");
  [0, 0.25, 0.5, 0.75, 1].forEach(function (w) {
    var g = M.wetDryGains(w);
    approx(g.dry * g.dry + g.wet * g.wet, 1, 1e-9, "wet=" + w + " 等功率（平方和=1）");
  });
  var gc = M.wetDryGains(5);
  approx(gc.dry, 0, 1e-9, "wet 越界钳制到 1");
})();

/* ---------- 8. 时长 / 体积预估 ---------- */
approx(M.renderedDuration(100, 1.25), 80, 1e-9, "100s @1.25x → 80s");
approx(M.renderedDuration(100, 0.8), 125, 1e-9, "100s @0.8x → 125s");
approx(M.renderedDuration(60, 2), 40, 1e-9, "变速越界钳制 1.5x 后时长 40s");
eq(M.estimateWavBytes(44100, 2), 44 + 44100 * 2 * 2, "estimateWavBytes 公式");
eq(M.estimateMp3Bytes(80, 128), Math.round(128 * 1000 / 8 * 80), "estimateMp3Bytes 公式");
ok(M.estimateMp3Bytes(80, 320) > M.estimateMp3Bytes(80, 128), "比特率越高 MP3 预估越大");

/* ---------- 9. 文件名规则 ---------- */
eq(M.makeExportName("夜曲", 0.8, 50, "wav"), "夜曲_slowed-0.8x_reverb-50.wav", "文件名：变速+混响");
eq(M.makeExportName("夜曲", 1.25, 50, "mp3"), "夜曲_slowed-1.25x_reverb-50.mp3", "文件名：nightcore mp3");
eq(M.makeExportName("夜曲", 1, 0, "wav"), "夜曲_slowed-1x.wav", "文件名：混响 0% 时省略 reverb 段");
eq(M.makeExportName("a/b:c*d", 0.8, 30, "wav"), "a_b_c_d_slowed-0.8x_reverb-30.wav", "文件名：非法字符替换");
eq(M.makeExportName("", 0.8, 50, "wav"), "audio_slowed-0.8x_reverb-50.wav", "文件名：空名回退 audio");
eq(M.makeExportName("test", 0.8, 50), "test_slowed-0.8x_reverb-50.wav", "文件名：缺省扩展名 wav");
eq(M.makeExportName("test", 0.8, 50, ".mp3"), "test_slowed-0.8x_reverb-50.mp3", "文件名：带点扩展名兼容");
eq(M.makeExportName("test", 9, 50, "wav"), "test_slowed-1.5x_reverb-50.wav", "文件名：变速越界先钳制");

/* ---------- 10. WAV 编码 ---------- */
(function () {
  var p = M.floatTo16BitPCM(new Float32Array([0, 1, -1, 0.5, 2, -2]));
  eq(p[0], 0, "pcm 0");
  eq(p[1], 32767, "pcm +1");
  eq(p[2], -32768, "pcm -1");
  eq(p[3], 16384, "pcm 0.5");
  eq(p[4], 32767, "pcm 超上限钳制");
  eq(p[5], -32768, "pcm 超下限钳制");
  var i2 = M.interleaveChannels([new Int16Array([1, 2]), new Int16Array([3, 4])], 2);
  eq(i2.join(","), "1,3,2,4", "双声道交错");

  function str(dv, off, len) { var s = ""; for (var i = 0; i < len; i++) s += String.fromCharCode(dv.getUint8(off + i)); return s; }
  var dv = M.encodeWavDataView(44100, 2, new Int16Array([10, 20, 30, 40]));
  eq(str(dv, 0, 4), "RIFF", "WAV RIFF 魔数");
  eq(str(dv, 8, 4), "WAVE", "WAV WAVE 魔数");
  eq(str(dv, 12, 4), "fmt ", "WAV fmt 魔数");
  eq(str(dv, 36, 4), "data", "WAV data 魔数");
  eq(dv.getUint16(20, true), 1, "WAV PCM 格式");
  eq(dv.getUint16(22, true), 2, "WAV 声道数");
  eq(dv.getUint32(24, true), 44100, "WAV 采样率");
  eq(dv.getUint32(28, true), 44100 * 2 * 2, "WAV 字节率");
  eq(dv.getUint16(34, true), 16, "WAV 16-bit");
  eq(dv.getUint32(40, true), 8, "WAV 数据长度");
  eq(dv.getInt16(44, true), 10, "WAV 首个采样");
  eq(dv.byteLength, 44 + 8, "WAV 总长度");
})();

/* ---------- 11. 重采样 ---------- */
(function () {
  var src = new Float32Array([0, 10, 20, 30]);
  var id = M.resampleLinear(src, 44100, 44100);
  eq(id, src, "resampleLinear 同采样率返回原数组");
  var down = M.resampleLinear(new Float32Array([0, 1, 2, 3, 4, 5]), 6, 3);
  eq(down.length, 3, "resampleLinear 降采样长度");
  approx(down[1], 2, 1e-6, "resampleLinear 线性插值");
  var up = M.resampleLinear(new Float32Array([0, 10]), 1, 2);
  eq(up.length, 4, "resampleLinear 升采样长度");
  approx(up[1], 5, 1e-6, "resampleLinear 升采样插值");
})();

console.log("\n断言总数: " + total + "，通过: " + pass + "，失败: " + fail);
process.exit(fail === 0 ? 0 : 1);
