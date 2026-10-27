/* 摩斯码翻译器纯逻辑单元测试（零依赖）：node tests/morse_code_translator.test.js
 * 覆盖：
 *  1. 编码向量（SOS / HELLO WORLD / 123 / .? / 小写一致）
 *  2. 空白口径（连续空白、换行、多行、行首行尾空白）
 *  3. 非法字符定位（中文、emoji、字符与第 N 个位置、跳过不进入输出、按位置排序）
 *  4. 解码向量（反向还原、词间单空格、大写）
 *  5. 解码非法与无法识别（定位词序号＋码序号、其余照常解码）
 *  6. 往返一致（encode -> decode、小写转大写、空白归一、多行换行）
 *  7. 对照表完整（字母 26、数字 10、标点 18（规格枚举表实为 18 项）、与编码表逐项一致）
 *  8. 注册（ID / Path / 品类）与注册总数 201
 *  9. 零网络请求静态检查（JS 无 fetch/XHR/WebSocket、无 CDN）
 * 10. 互链与真限制文案（模板含 Base64 互链与限制文案，不含未交付工具）
 */
"use strict";
var M = require("../static/js/morse_code_translator.js");
var fs = require("fs");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function contains(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（期望包含 " + JSON.stringify(sub) + "）"); }
function notContains(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }

/* ================= 1. 编码向量 ================= */
(function () {
    eq(M.encodeText("SOS").morse, "... --- ...", "SOS 编码");
    eq(M.encodeText("HELLO WORLD").morse, ".... . .-.. .-.. --- / .-- --- .-. .-.. -..", "HELLO WORLD 编码");
    eq(M.encodeText("123").morse, ".---- ..--- ...--", "123 编码");
    eq(M.encodeText(".?").morse, ".-.-.- ..--..", ".? 编码");
    eq(M.encodeText("sos").morse, M.encodeText("SOS").morse, "小写与大写编码一致");
    eq(M.encodeText("Sos").morse, "... --- ...", "混合大小写编码");
    eq(M.encodeText("").morse, "", "空输入编码为空");
    eq(M.encodeText("").issues.length, 0, "空输入不记 error");
    eq(M.encodeText("A/B").morse, ".- -..-. -...", "斜杠标点编码为码元而非词分隔");
    eq(M.encodeText("HI!").morse, ".... .. -.-.--", "感叹号编码");
    eq(M.encodeText("@").morse, ".--.-.", "@ 编码");
})();

/* ================= 2. 空白口径 ================= */
(function () {
    eq(M.encodeText("HELLO   WORLD").morse, ".... . .-.. .-.. --- / .-- --- .-. .-.. -..", "连续空格归一为词分隔");
    eq(M.encodeText("HELLO\nWORLD").morse, ".... . .-.. .-.. --- / .-- --- .-. .-.. -..", "换行编码为词分隔");
    eq(M.encodeText("HELLO\n\nWORLD").morse, ".... . .-.. .-.. --- / .-- --- .-. .-.. -..", "多行换行归一为词分隔");
    eq(M.encodeText("  HELLO WORLD  ").morse, ".... . .-.. .-.. --- / .-- --- .-. .-.. -..", "行首行尾空白忽略不产生空词");
    eq(M.encodeText("HELLO\tWORLD").morse, ".... . .-.. .-.. --- / .-- --- .-. .-.. -..", "制表符为词分隔");
    eq(M.encodeText("   ").morse, "", "纯空白编码为空");
    eq(M.encodeText("   ").issues.length, 0, "纯空白不记 error");
})();

/* ================= 3. 非法字符定位 ================= */
(function () {
    var r = M.encodeText("A你B");
    eq(r.morse, ".- -...", "中文非法字符跳过其余正常编码");
    eq(r.issues.length, 1, "中文非法字符 1 条");
    eq(r.issues[0].char, "你", "非法字符为中文字符本身");
    eq(r.issues[0].position, 2, "中文非法字符位置为第 2 个");
    eq(r.issues[0].type, "error", "非法字符 issue 类型为 error");

    var r2 = M.encodeText("HI😀");
    eq(r2.morse, ".... ..", "emoji 非法字符跳过");
    eq(r2.issues.length, 1, "emoji 非法字符 1 条");
    eq(r2.issues[0].char, "😀", "非法字符为 emoji 本身");
    eq(r2.issues[0].position, 3, "emoji 按字符计为第 3 个而非代理对计 2 个位置");
    ok(r2.issues[0].message.indexOf("😀") !== -1 && r2.issues[0].message.indexOf("3") !== -1, "emoji 问题含字符与位置");

    var r3 = M.encodeText("A€B¥C");
    eq(r3.issues.length, 2, "两个非法字符 2 条");
    eq(r3.issues[0].position, 2, "非法字符按位置排序第一条为 2");
    eq(r3.issues[1].position, 4, "非法字符按位置排序第二条为 4");
    eq(r3.morse, ".- -... -.-.", "多个非法字符均跳过");
})();

/* ================= 4. 解码向量 ================= */
(function () {
    eq(M.decodeMorse("... --- ...").text, "SOS", "SOS 解码");
    eq(M.decodeMorse(".... . .-.. .-.. --- / .-- --- .-. .-.. -..").text, "HELLO WORLD", "HELLO WORLD 解码词间单空格");
    eq(M.decodeMorse(".---- ..--- ...--").text, "123", "123 解码");
    eq(M.decodeMorse(".-.-.- ..--..").text, ".?", ".? 解码");
    eq(M.decodeMorse("").text, "", "空输入解码为空");
    eq(M.decodeMorse("").issues.length, 0, "空输入解码不记 error");
    eq(M.decodeMorse(".... . .-.. .-.. ---/ .-- --- .-. .-.. -..").text, "HELLO WORLD", "词分隔符两侧空白容忍");
    eq(M.decodeMorse("....  .   .-..").text, "HEL", "词内多空白容忍");
    eq(M.decodeMorse("... --- ... ").text, "SOS", "尾空白解码忽略");
})();

/* ================= 5. 解码非法与无法识别 ================= */
(function () {
    var r = M.decodeMorse(".... ...... ..");
    eq(r.text, "HI", "无法识别码元跳过其余照常解码");
    eq(r.issues.length, 1, "无法识别 1 条");
    eq(r.issues[0].word, 1, "无法识别定位词序号 1");
    eq(r.issues[0].codeNo, 2, "无法识别定位码序号 2");
    eq(r.issues[0].code, "......", "无法识别含原串");
    eq(r.issues[0].type, "error", "无法识别 issue 类型为 error");

    var r2 = M.decodeMorse(".... x .. / .- *");
    eq(r2.text, "HI A", "非法码元跳过其余照常解码");
    eq(r2.issues.length, 2, "非法码元 2 条");
    eq(r2.issues[0].word, 1, "非法码元第一条词序号 1");
    eq(r2.issues[0].codeNo, 2, "非法码元第一条码序号 2");
    eq(r2.issues[1].word, 2, "非法码元第二条词序号 2");
    eq(r2.issues[1].codeNo, 2, "非法码元第二条码序号 2");

    var r3 = M.decodeMorse(".... # ..");
    eq(r3.issues.length, 1, "含 # 码元判非法字符");
    eq(r3.text, "HI", "含 # 码元跳过其余解码");
})();

/* ================= 6. 往返一致 ================= */
(function () {
    function roundtrip(s) { return M.decodeMorse(M.encodeText(s).morse).text; }
    eq(roundtrip("HELLO WORLD"), "HELLO WORLD", "往返 HELLO WORLD");
    eq(roundtrip("hello world"), "HELLO WORLD", "往返小写转大写");
    eq(roundtrip("HELLO   WORLD"), "HELLO WORLD", "往返连续空白归一");
    eq(roundtrip("HELLO\nWORLD"), "HELLO WORLD", "往返换行归一为词分隔");
    eq(roundtrip("SOS 123 .?"), "SOS 123 .?", "往返字母数字标点混合");
    eq(M.encodeText("HELLO\nWORLD").morse.indexOf(" / ") !== -1, true, "多行换行编码为 / 词分隔");
    eq(roundtrip("A,B:C;D=E+F-G_H\"I$J@K"), "A,B:C;D=E+F-G_H\"I$J@K", "往返全部 18 个标点");
})();

/* ================= 7. 对照表完整 ================= */
(function () {
    eq(M.LETTERS.length, 26, "对照表字母 26 个");
    eq(M.DIGITS.length, 10, "对照表数字 10 个");
    eq(M.PUNCTS.length, 18, "对照表标点 18 个（规格枚举表实为 18 项）");
    eq(Object.keys(M.MORSE_CODE).length, 54, "码表合计 54 项（26+10+18）");
    eq(M.MORSE_CODE["A"], ".-", "A 码表");
    eq(M.MORSE_CODE["Z"], "--..", "Z 码表");
    eq(M.MORSE_CODE["0"], "-----", "0 码表");
    eq(M.MORSE_CODE["5"], ".....", "5 码表");
    eq(M.MORSE_CODE["."], ".-.-.-", "句点码表");
    eq(M.MORSE_CODE["@"], ".--.-.", "@ 码表");
    eq(M.MORSE_CODE["\""], ".-..-.", "双引号码表");
    eq(M.MORSE_CODE["'"], ".----.", "单引号码表");
    var allConsistent = M.LETTERS.concat(M.DIGITS, M.PUNCTS).every(function (ch) {
        return M.REVERSE_CODE[M.MORSE_CODE[ch]] === ch;
    });
    ok(allConsistent, "对照表与反向表逐项一致");
    var codes = Object.keys(M.MORSE_CODE).map(function (k) { return M.MORSE_CODE[k]; });
    eq(new Set(codes).size, codes.length, "码表无重复码");
})();

/* ================= 8. 注册 ================= */
(function () {
    var go = fs.readFileSync(__dirname + "/../tools/categories.go", "utf8");
    contains(go, '"morse_code_translator"', "注册 ID");
    contains(go, '"/tools/morse-code-translator"', "注册 Path");
    var idx = go.indexOf('"morse_code_translator"');
    var block = go.slice(idx, idx + 800);
    contains(block, "编码转换", "注册品类为编码转换");
    contains(block, "graphic_eq", "注册 Icon 为 graphic_eq");
    contains(block, "New:", "注册 New 标记");
    var paths = go.match(/"\/tools\/[^"]+"/g) || [];
    eq(new Set(paths).size, 201, "注册总数 200 -> 201 Path");
})();

/* ================= 9. 零网络请求静态检查 ================= */
(function () {
    var js = fs.readFileSync(__dirname + "/../static/js/morse_code_translator.js", "utf8");
    notContains(js, "fetch(", "JS 无 fetch");
    notContains(js, "XMLHttpRequest", "JS 无 XHR");
    notContains(js, "WebSocket", "JS 无 WebSocket");
    var html = fs.readFileSync(__dirname + "/../templates/morse_code_translator.html", "utf8");
    ok(!/src="https?:\/\/(?!fonts\.googleapis\.com)/.test(html), "模板无外部 CDN 脚本（字体除外）");
    notContains(js, "http://", "JS 无外部请求地址");
    notContains(js, "https://", "JS 无外部请求地址 https");
})();

/* ================= 10. 互链与真限制文案 ================= */
(function () {
    var html = fs.readFileSync(__dirname + "/../templates/morse_code_translator.html", "utf8");
    contains(html, "/tools/base64", "互链含 Base64 编码/解码");
    contains(html, "摩斯码翻译器", "模板含工具名");
    contains(html, "只做标准国际摩斯码编解码、不做音频发报与无线电实操", "真限制：不做音频发报");
    contains(html, "摩斯码不是加密", "真限制：摩斯码不是加密");
    contains(html, "只在浏览器本地转换、不上传", "真限制：本地转换零上传");
    contains(html, "只认标准国际摩斯码表", "真限制：只认标准表");
    notContains(html, "滚动字幕生成器", "不含未交付滚动字幕生成器互链");
    notContains(html, "色盲模拟检查器", "不含未交付色盲模拟检查器互链");
    contains(html, "morse-code-translator", "模板含 Path 标识");
    contains(html, "morse_code_translator.js", "模板引用本工具 JS");
})();

console.log("PASS: " + pass + " FAIL: " + fail);
process.exit(fail ? 1 : 0);
