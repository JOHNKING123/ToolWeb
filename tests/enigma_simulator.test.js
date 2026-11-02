/* 恩尼格玛密码机模拟器（Wehrmacht M3）纯逻辑单元测试（零依赖）：node tests/enigma_simulator.test.js
 * 覆盖：
 *  1. 静态数据（转子接线/notch/反射器/常量）
 *  2. buildEnigmaConfig 正常构建
 *  3. buildEnigmaConfig 非法参数 err.field 逐字（rotors/rings/starts/plugs/reflector）
 *  4. plugboardSwap（含非法字符）
 *  5. stepRotors（含 double-stepping 四种情形）
 *  6. encryptChar（含非法字符、步进后位置）
 *  7. enigmaEncrypt 确定性向量（AAAAA→BDZGO、HELLO→ILBDA 逐字）+ 自反解密 + 非 A-Z 保留不步进 + 配置影响
 *  8. 注册（ID/Path/Icon/Category/New）与注册总数 255
 *  9. 零网络请求静态检查（JS 无 fetch/XHR/WebSocket、无 CDN）
 * 10. 互链与真限制文案（模板含摩斯码互链、morse 模板含回链、三条真限制）
 */
"use strict";
var E = require("../static/js/enigma_simulator.js");
var fs = require("fs");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function contains(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（期望包含 " + JSON.stringify(sub) + "）"); }
function notContains(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }
function errField(fn, field, name) {
    try { fn(); }
    catch (e) { eq(e.field, field, name + " err.field"); return; }
    fail++; console.error("FAIL:", name + "（期望抛错，未抛错）");
}

function stdConfig() {
    return E.buildEnigmaConfig({ rotors: ['I', 'II', 'III'], rings: 'AAA', starts: 'AAA', plugs: [], reflector: 'B' });
}

/* ================= 1. 静态数据 ================= */
(function () {
    eq(E.ROTOR_NAMES.join(','), 'I,II,III,IV,V', "转子名 I~V");
    eq(E.ROTOR_DATA['I'].wiring, 'EKMFLGDQVZNTOWYHXUSPAIBRCJ', "转子 I 接线");
    eq(E.ROTOR_DATA['I'].notch, 'Q', "转子 I notch");
    eq(E.ROTOR_DATA['II'].wiring, 'AJDKSIRUXBLHWTMCQGZNPYFVOE', "转子 II 接线");
    eq(E.ROTOR_DATA['II'].notch, 'E', "转子 II notch");
    eq(E.ROTOR_DATA['III'].wiring, 'BDFHJLCPRTXVZNYEIWGAKMUSQO', "转子 III 接线");
    eq(E.ROTOR_DATA['III'].notch, 'V', "转子 III notch");
    eq(E.ROTOR_DATA['IV'].wiring, 'ESOVPZJAYQUIRHXLNFTGKDCMWB', "转子 IV 接线");
    eq(E.ROTOR_DATA['IV'].notch, 'J', "转子 IV notch");
    eq(E.ROTOR_DATA['V'].wiring, 'VZBRGITYUPSDNHLXAWMJQOFECK', "转子 V 接线");
    eq(E.ROTOR_DATA['V'].notch, 'Z', "转子 V notch");
    eq(E.REFLECTOR_DATA['B'], 'YRUHQSLDPXNGOKMIEBFZCWVJAT', "反射器 UKW-B");
    eq(E.REFLECTOR_DATA['C'], 'FVPJIAOYEDRZXWGCTKUQSBNMHL', "反射器 UKW-C");
    eq(E.MAX_PLUGS, 10, "接线板最多 10 对");
})();

/* ================= 2. buildEnigmaConfig 正常构建 ================= */
(function () {
    var c = stdConfig();
    eq(c.rotors[0].name, 'I', "左转子 I");
    eq(c.rotors[1].name, 'II', "中转子 II");
    eq(c.rotors[2].name, 'III', "右转子 III");
    eq(c.rings.join(','), '0,0,0', "环位 AAA");
    eq(c.starts.join(','), '0,0,0', "起始位 AAA");
    eq(c.reflectorName, 'B', "反射器 B");
    eq(Object.keys(c.plugMap).length, 0, "无接线板");
    var c2 = E.buildEnigmaConfig({ rotors: ['V', 'IV', 'III'], rings: 'BCD', starts: 'XYZ', plugs: ['AB', 'CD'], reflector: 'C' });
    eq(c2.rings.join(','), '1,2,3', "环位 BCD 解析");
    eq(c2.starts.join(','), '23,24,25', "起始位 XYZ 解析");
    eq(c2.plugMap['A'], 'B', "接线板 A↔B");
    eq(c2.plugMap['D'], 'C', "接线板 D↔C");
    eq(c2.reflectorName, 'C', "反射器 C");
    var c3 = E.buildEnigmaConfig({ rotors: ['I', 'II', 'III'], rings: 'AAA', starts: 'AAA', reflector: 'B' });
    eq(Object.keys(c3.plugMap).length, 0, "plugs 缺省为空");
})();

/* ================= 3. 非法参数 err.field 逐字 ================= */
(function () {
    errField(function () { E.buildEnigmaConfig({ rotors: ['I', 'II'], rings: 'AAA', starts: 'AAA', plugs: [], reflector: 'B' }); }, 'rotors', "转子不足 3 枚");
    errField(function () { E.buildEnigmaConfig({ rotors: ['I', 'II', 'III', 'IV'], rings: 'AAA', starts: 'AAA', plugs: [], reflector: 'B' }); }, 'rotors', "转子超过 3 枚");
    errField(function () { E.buildEnigmaConfig({ rotors: ['I', 'I', 'III'], rings: 'AAA', starts: 'AAA', plugs: [], reflector: 'B' }); }, 'rotors', "转子重复");
    errField(function () { E.buildEnigmaConfig({ rotors: ['I', 'II', 'VI'], rings: 'AAA', starts: 'AAA', plugs: [], reflector: 'B' }); }, 'rotors', "非法转子名");
    errField(function () { E.buildEnigmaConfig({ rings: 'AAA', starts: 'AAA', plugs: [], reflector: 'B' }); }, 'rotors', "转子缺失");
    errField(function () { E.buildEnigmaConfig({ rotors: ['I', 'II', 'III'], rings: 'AB', starts: 'AAA', plugs: [], reflector: 'B' }); }, 'rings', "环位不足 3 字母");
    errField(function () { E.buildEnigmaConfig({ rotors: ['I', 'II', 'III'], rings: 'AB1', starts: 'AAA', plugs: [], reflector: 'B' }); }, 'rings', "环位含非法字符");
    errField(function () { E.buildEnigmaConfig({ rotors: ['I', 'II', 'III'], rings: 'aaa', starts: 'AAA', plugs: [], reflector: 'B' }); }, 'rings', "环位小写非法");
    errField(function () { E.buildEnigmaConfig({ rotors: ['I', 'II', 'III'], rings: 'AAA', starts: 'A', plugs: [], reflector: 'B' }); }, 'starts', "起始位不足 3 字母");
    errField(function () { E.buildEnigmaConfig({ rotors: ['I', 'II', 'III'], rings: 'AAA', starts: 'A?C', plugs: [], reflector: 'B' }); }, 'starts', "起始位含非法字符");
    errField(function () { E.buildEnigmaConfig({ rotors: ['I', 'II', 'III'], rings: 'AAA', starts: 'AAA', plugs: ['AA'], reflector: 'B' }); }, 'plugs', "接线板自连");
    errField(function () { E.buildEnigmaConfig({ rotors: ['I', 'II', 'III'], rings: 'AAA', starts: 'AAA', plugs: ['AB', 'BC'], reflector: 'B' }); }, 'plugs', "接线板字母重复使用");
    errField(function () { E.buildEnigmaConfig({ rotors: ['I', 'II', 'III'], rings: 'AAA', starts: 'AAA', plugs: ['ABC'], reflector: 'B' }); }, 'plugs', "接线板非两字母");
    errField(function () { E.buildEnigmaConfig({ rotors: ['I', 'II', 'III'], rings: 'AAA', starts: 'AAA', plugs: ['AB','CD','EF','GH','IJ','KL','MN','OP','QR','ST','UV'], reflector: 'B' }); }, 'plugs', "接线板超过 10 对");
    errField(function () { E.buildEnigmaConfig({ rotors: ['I', 'II', 'III'], rings: 'AAA', starts: 'AAA', plugs: [], reflector: 'D' }); }, 'reflector', "非法反射器");
    errField(function () { E.buildEnigmaConfig({ rotors: ['I', 'II', 'III'], rings: 'AAA', starts: 'AAA', plugs: [] }); }, 'reflector', "反射器缺失");
})();

/* ================= 4. plugboardSwap ================= */
(function () {
    eq(E.plugboardSwap('A', { A: 'B', B: 'A' }), 'B', "接线板 A→B");
    eq(E.plugboardSwap('B', { A: 'B', B: 'A' }), 'A', "接线板 B→A");
    eq(E.plugboardSwap('C', { A: 'B', B: 'A' }), 'C', "无配线原样返回");
    eq(E.plugboardSwap('Z', {}), 'Z', "空接线板原样返回");
    errField(function () { E.plugboardSwap('1', {}); }, 'char', "plugboardSwap 非字母抛错");
    errField(function () { E.plugboardSwap('a', {}); }, 'char', "plugboardSwap 小写抛错");
})();

/* ================= 5. stepRotors（含 double-stepping） ================= */
(function () {
    var c = stdConfig();
    var s1 = E.stepRotors(c, [0, 0, 0]);
    eq(s1.positions.join(','), '0,0,1', "普通步进：仅右转子");
    eq(s1.stepped.L, false, "普通步进左未动");
    eq(s1.stepped.M, false, "普通步进中未动");
    eq(s1.stepped.R, true, "普通步进右动了");
    eq(s1.doubleStep, false, "普通步进非 double-stepping");
    /* 右转子在 notch（III 的 notch 为 V=21）：中转子步进 */
    var s2 = E.stepRotors(c, [0, 0, 21]);
    eq(s2.positions.join(','), '0,1,22', "右转子 notch：中+右步进");
    eq(s2.stepped.L, false, "右 notch 左未动");
    eq(s2.stepped.M, true, "右 notch 中动了");
    eq(s2.stepped.R, true, "右 notch 右动了");
    eq(s2.doubleStep, false, "右 notch 非 double-stepping");
    /* 中转子在 notch（II 的 notch 为 E=4）：中+左步进，即 double-stepping */
    var s3 = E.stepRotors(c, [0, 4, 0]);
    eq(s3.positions.join(','), '1,5,1', "中转子 notch：左+中+右步进");
    eq(s3.stepped.L, true, "中 notch 左动了");
    eq(s3.stepped.M, true, "中 notch 中动了");
    eq(s3.stepped.R, true, "中 notch 右动了");
    eq(s3.doubleStep, true, "中 notch 触发 double-stepping");
    /* 双 notch：中转子连走两格 */
    var s4 = E.stepRotors(c, [0, 4, 21]);
    eq(s4.positions.join(','), '1,6,22', "双 notch：中转子连走两格");
    eq(s4.doubleStep, true, "双 notch 仍标 double-stepping");
    /* 不修改入参 */
    var p = [0, 0, 0];
    E.stepRotors(c, p);
    eq(p.join(','), '0,0,0', "stepRotors 不修改入参");
    /* 位置回绕 */
    var s5 = E.stepRotors(c, [0, 0, 25]);
    eq(s5.positions.join(','), '0,0,0', "右转子 Z→A 回绕");
})();

/* ================= 6. encryptChar ================= */
(function () {
    var c = stdConfig();
    var r = E.encryptChar('A', c, [0, 0, 0]);
    eq(r.cipher, 'B', "AAAAA 首字 A→B（步进后）");
    eq(r.positions.join(','), '0,0,1', "encryptChar 步进后位置");
    eq(r.stepped.R, true, "encryptChar 右步进");
    eq(r.doubleStep, false, "encryptChar 首字非 double-stepping");
    var r2 = E.encryptChar('A', c, [0, 4, 0]);
    eq(r2.doubleStep, true, "encryptChar 中 notch 时标 double-stepping");
    errField(function () { E.encryptChar('1', c, [0, 0, 0]); }, 'char', "encryptChar 数字抛错");
    errField(function () { E.encryptChar('a', c, [0, 0, 0]); }, 'char', "encryptChar 小写抛错（严格契约）");
    errField(function () { E.encryptChar('', c, [0, 0, 0]); }, 'char', "encryptChar 空串抛错");
    errField(function () { E.encryptChar(' ', c, [0, 0, 0]); }, 'char', "encryptChar 空格抛错");
})();

/* ================= 7. enigmaEncrypt 确定性向量 ================= */
(function () {
    var c = stdConfig();
    eq(E.enigmaEncrypt('AAAAA', c), 'BDZGO', "确定性向量 AAAAA→BDZGO");
    eq(E.enigmaEncrypt('HELLO', c), 'ILBDA', "确定性向量 HELLO→ILBDA");
    /* 逐字明细与整体一致 */
    var trace = E.encryptTrace('HELLO', c);
    eq(trace.length, 5, "HELLO 逐字 5 行");
    eq(trace.map(function (r) { return r.output; }).join(''), 'ILBDA', "逐字输出拼接＝整体");
    eq(trace[0].input, 'H', "逐字首行明文 H");
    eq(trace[0].output, 'I', "逐字首行密文 I");
    eq(trace[4].output, 'A', "逐字末行密文 A");
    eq(trace[0].positions.join(','), '0,0,1', "逐字首行步进后位置");
    /* 自反：相同配置再加密一次还原 */
    eq(E.enigmaEncrypt('ILBDA', c), 'HELLO', "自反解密 ILBDA→HELLO");
    eq(E.enigmaEncrypt('BDZGO', c), 'AAAAA', "自反解密 BDZGO→AAAAA");
    /* 小写转大写 */
    eq(E.enigmaEncrypt('hello', c), 'ILBDA', "小写与大写加密一致");
    /* 非 A-Z 原样保留且不触发步进：'A A' 中空格前后两字应为 BDZGO 的第 1、2 字 */
    eq(E.enigmaEncrypt('A A', c), 'B D', "空格原样保留");
    eq(E.enigmaEncrypt('A!A', c), 'B!D', "标点原样保留且不步进");
    eq(E.enigmaEncrypt('', c), '', "空输入为空");
    /* 配置影响输出 */
    var cRing = E.buildEnigmaConfig({ rotors: ['I', 'II', 'III'], rings: 'BBB', starts: 'AAA', plugs: [], reflector: 'B' });
    ok(E.enigmaEncrypt('AAAAA', cRing) !== 'BDZGO', "环位改变输出");
    var cRef = E.buildEnigmaConfig({ rotors: ['I', 'II', 'III'], rings: 'AAA', starts: 'AAA', plugs: [], reflector: 'C' });
    ok(E.enigmaEncrypt('AAAAA', cRef) !== 'BDZGO', "反射器改变输出");
    var cPlug = E.buildEnigmaConfig({ rotors: ['I', 'II', 'III'], rings: 'AAA', starts: 'AAA', plugs: ['AB'], reflector: 'B' });
    ok(E.enigmaEncrypt('AAAAA', cPlug) !== 'BDZGO', "接线板改变输出");
    var cRotor = E.buildEnigmaConfig({ rotors: ['III', 'II', 'I'], rings: 'AAA', starts: 'AAA', plugs: [], reflector: 'B' });
    ok(E.enigmaEncrypt('AAAAA', cRotor) !== 'BDZGO', "转子排列改变输出");
    errField(function () { E.enigmaEncrypt(123, c); }, 'text', "enigmaEncrypt 非字符串抛错");
})();

/* ================= 8. 注册 ================= */
(function () {
    var go = fs.readFileSync(__dirname + "/../tools/categories.go", "utf8");
    contains(go, '"enigma_simulator"', "注册 ID");
    contains(go, '"/tools/enigma-simulator"', "注册 Path");
    var idx = go.indexOf('"enigma_simulator"');
    var block = go.slice(idx, idx + 900);
    contains(block, "编码转换", "注册品类为编码转换");
    contains(block, "rotate_right", "注册 Icon 为 rotate_right");
    contains(block, "New:", "注册 New 标记");
    ok(/New:\s*true/.test(block), "注册 New 为 true");
    var paths = go.match(/"\/tools\/[^"]+"/g) || [];
    eq(new Set(paths).size, 273, "注册总数 268→270 Path");
})();

/* ================= 9. 零网络请求静态检查 ================= */
(function () {
    var js = fs.readFileSync(__dirname + "/../static/js/enigma_simulator.js", "utf8");
    notContains(js, "fetch(", "JS 无 fetch");
    notContains(js, "XMLHttpRequest", "JS 无 XHR");
    notContains(js, "WebSocket", "JS 无 WebSocket");
    var html = fs.readFileSync(__dirname + "/../templates/enigma_simulator.html", "utf8");
    ok(!/src="https?:\/\/(?!fonts\.googleapis\.com)/.test(html), "模板无外部 CDN 脚本（字体除外）");
    notContains(js, "http://", "JS 无外部请求地址");
    notContains(js, "https://", "JS 无外部请求地址 https");
})();

/* ================= 10. 互链与真限制文案 ================= */
(function () {
    var html = fs.readFileSync(__dirname + "/../templates/enigma_simulator.html", "utf8");
    contains(html, "/tools/morse-code-translator", "互链含摩斯码翻译器");
    contains(html, "摩斯码翻译器", "互链文案含工具名");
    contains(html, "古典密码一条龙", "互链一条龙文案");
    contains(html, "只模拟 Wehrmacht M3 标准三转子", "真限制：仅 M3 标准三转子");
    contains(html, "无四转子 M4、无 Uhr 接线钟等变体", "真限制：无变体");
    contains(html, "非 A–Z 字符原样保留", "真限制：非 A-Z 原样保留");
    contains(html, "教学演示用途，不建议用于实际保密", "真限制：教学演示不保密");
    contains(html, "enigma_simulator.js", "模板引用本工具 JS");
    contains(html, "enigma-simulator", "模板含 Path 标识");
    contains(html, "double-stepping", "模板含 double-stepping 说明");
    contains(html, "BDZGO", "模板含经典向量");
    var morseHtml = fs.readFileSync(__dirname + "/../templates/morse_code_translator.html", "utf8");
    contains(morseHtml, "/tools/enigma-simulator", "morse 模板含恩尼格玛回链");
    contains(morseHtml, "恩尼格玛", "morse 回链文案含工具名");
})();

console.log("PASS: " + pass + " FAIL: " + fail);
process.exit(fail ? 1 : 0);
