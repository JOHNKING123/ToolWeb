/* .env 解析与校验器纯逻辑单元测试（零依赖）：node tests/env_parser.test.js
 * 覆盖：
 *  1. 基础解析向量（有效键/跳过/非法/警告统计）
 *  2. CRLF 兼容与 export 前缀
 *  3. 双引号解码（\" \\ \n \r \t）与单引号原样
 *  4. 无引号 inline 注释（# 前须有空白）与值内无空白 # 保留
 *  5. 非法行（无 =、键名非法、引号未闭合、闭合后残留）与行号
 *  6. 空值警告仍有效、重复键警告与规整表首次顺序/最后值
 *  7. 规整输出（空白加引号、# 原样、空值、往返一致）
 *  8. 注册（ID/Path/品类）与注册总数 200
 *  9. 零网络请求静态检查（JS 无 fetch/XHR/WebSocket）
 * 10. 互链与真限制文案（模板含提示词脱敏器链接与限制文案，不含未交付工具）
 */
"use strict";
var E = require("../static/js/env_parser.js");
var fs = require("fs");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function contains(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（期望包含 " + JSON.stringify(sub) + "）"); }
function notContains(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }
function entry(r, key) {
    for (var i = 0; i < r.entries.length; i++) {
        if (r.entries[i].key === key) return r.entries[i];
    }
    return null;
}

/* ================= 1. 基础解析向量 ================= */
(function () {
    var r = E.parseEnv("APP_NAME=MyApp\n# 注释\n\nPORT=3000\n");
    eq(r.entries.length, 2, "基础向量有效键 2");
    eq(entry(r, "APP_NAME").value, "MyApp", "APP_NAME 值");
    eq(entry(r, "PORT").value, "3000", "PORT 值");
    eq(r.stats.skippedLines, 2, "基础向量跳过 2 行（注释+空行）");
    eq(r.stats.invalidLines, 0, "基础向量非法 0");
    eq(r.stats.warnings, 0, "基础向量警告 0");
    eq(r.stats.validKeys, 2, "基础向量统计有效键 2");
    eq(r.issues.length, 0, "基础向量问题清单为空");

    var r2 = E.parseEnv("  # 前导空白注释\n\t\nA=1");
    eq(r2.stats.skippedLines, 2, "前导空白注释与空白行均跳过");
    eq(r2.stats.validKeys, 1, "前导空白后仍解析 1 键");
})();

/* ================= 2. CRLF 与 export ================= */
(function () {
    var r = E.parseEnv("A=1\r\n# c\r\n\r\nB=2\r\n");
    eq(r.stats.skippedLines, 2, "CRLF 跳过 2 行");
    eq(r.stats.validKeys, 2, "CRLF 有效键 2");
    eq(entry(r, "A").value, "1", "CRLF 下 A 值无残留 \\r");

    var r2 = E.parseEnv('export API_URL="https://example.com?a=1&b=2" # 注释');
    eq(r2.stats.validKeys, 1, "export 行有效");
    eq(entry(r2, "API_URL").value, "https://example.com?a=1&b=2", "export 双引号 URL 精确解码");
    eq(r2.stats.invalidLines, 0, "export 行无非法");

    var r3 = E.parseEnv("export");
    eq(r3.stats.invalidLines, 1, "裸 export 判非法");
    eq(r3.issues[0].line, 1, "裸 export 行号 1");

    var r4 = E.parseEnv("  export   SPACED=yes");
    eq(entry(r4, "SPACED").value, "yes", "前导空白+多空白 export 剥离");
})();

/* ================= 3. 引号解码 ================= */
(function () {
    var r = E.parseEnv("SECRET='a$b#c'");
    eq(entry(r, "SECRET").value, "a$b#c", "单引号值原样（含 $ 与 #）");

    var r2 = E.parseEnv('MSG="a\\"b\\\\c\\nd\\re\\tf"');
    eq(entry(r2, "MSG").value, 'a"b\\c\nd\re\tf', "双引号转义解码完整");

    var r3 = E.parseEnv("Q='a\\nb'");
    eq(entry(r3, "Q").value, "a\\nb", "单引号内反斜杠不解码");

    var r4 = E.parseEnv('U="plain" # 尾注释');
    eq(entry(r4, "U").value, "plain", "双引号后 # 注释允许");
    eq(r4.stats.invalidLines, 0, "双引号后注释不判非法");
})();

/* ================= 4. 无引号 inline 注释 ================= */
(function () {
    var r = E.parseEnv("KEY=hello # comment");
    eq(entry(r, "KEY").value, "hello", "无引号 inline 注释截断");

    var r2 = E.parseEnv("KEY=a#b");
    eq(entry(r2, "KEY").value, "a#b", "值内无空白 # 保留");

    var r3 = E.parseEnv("KEY=a\t# comment");
    eq(entry(r3, "KEY").value, "a", "制表符前 # 也算注释");

    var r4 = E.parseEnv("KEY=hello#world");
    eq(entry(r4, "KEY").value, "hello#world", "无空白 # 不截断");
})();

/* ================= 5. 非法行 ================= */
(function () {
    function illegal(text, lineNo, name) {
        var r = E.parseEnv(text);
        eq(r.stats.invalidLines, 1, name + "（非法 1）");
        eq(r.stats.validKeys, 0, name + "（不入有效键）");
        eq(r.issues.length, 1, name + "（问题 1 条）");
        eq(r.issues[0].line, lineNo, name + "（行号）");
        eq(r.issues[0].type, "error", name + "（类型 error）");
        eq(r.entries.length, 0, name + "（不入规整表）");
    }
    illegal("NO_EQUALS_LINE", 1, "无 = 行");
    illegal("1BAD=x", 1, "数字开头键名");
    illegal("BAD-KEY=x", 1, "含连字符键名");
    illegal("=value", 1, "空键名");
    illegal('KEY="abc', 1, "双引号未闭合");
    illegal("KEY='abc", 1, "单引号未闭合");
    illegal('KEY="abc"xyz', 1, "双引号闭合后残留");
    illegal("KEY='abc'xyz", 1, "单引号闭合后残留");

    var r = E.parseEnv("OK=1\nBADLINE\nOK2=2");
    eq(r.issues[0].line, 2, "多行中非法行行号正确");
    eq(r.stats.validKeys, 2, "非法行不影响前后有效键");
    eq(entry(r, "OK2").value, "2", "非法行后有效键仍解析");
})();

/* ================= 6. 空值与重复 ================= */
(function () {
    var r = E.parseEnv("EMPTY=");
    eq(r.stats.validKeys, 1, "空值仍计入有效键");
    eq(entry(r, "EMPTY").value, "", "空值为空串");
    eq(r.stats.warnings, 1, "空值警告 1");
    eq(r.issues[0].kind, "空值", "空值问题类型");

    var r2 = E.parseEnv("A=1\nA=2");
    eq(r2.stats.validKeys, 1, "重复键规整表仅 1 行");
    eq(entry(r2, "A").value, "2", "重复键值取最后一次");
    eq(r2.stats.warnings, 1, "重复警告 1");
    contains(r2.issues[0].message, "第 1 行", "重复警告含首次行号");
    contains(r2.issues[0].message, "第 2 行", "重复警告含当前行号");

    var r3 = E.parseEnv("B=1\nA=1\nB=2");
    eq(r3.entries.map(function (e) { return e.key; }).join(","), "B,A", "键顺序按首次出现");
    eq(entry(r3, "B").value, "2", "顺序例 B 取最后值");
    eq(entry(r3, "B").firstLine, 1, "B 首次行号 1");
    eq(entry(r3, "B").lastLine, 3, "B 最后行号 3");
})();

/* ================= 7. 规整输出 ================= */
(function () {
    eq(E.formatEnv([{ key: "K", value: "hello world" }]), 'K="hello world"', "含空白值加双引号");
    eq(E.formatEnv([{ key: "K", value: "a#b" }]), "K=a#b", "无空白 # 原样不加引号");
    eq(E.formatEnv([{ key: "K", value: "" }]), 'K=""', "空值双引号包裹");
    eq(E.formatEnv([{ key: "K", value: 'a"b' }]), 'K="a\\"b"', "含双引号值转义");
    eq(E.formatEnv([]), "", "空条目输出空串");

    var r = E.parseEnv("APP_NAME=MyApp\nPORT=3000");
    eq(E.formatEnv(r.entries), "APP_NAME=MyApp\nPORT=3000", "规整文本行数等于有效键数");
    eq(E.formatEnv(r.entries).split("\n").length, 2, "规整行数 2");

    /* 往返一致 */
    var cases = [
        "K=hello world",
        "K=a#b",
        "K=",
        'K="a\\"b"',
        "A=1\nB=hello world\nC=a#b"
    ];
    cases.forEach(function (text, i) {
        var first = E.parseEnv(text);
        var formatted = E.formatEnv(first.entries);
        var second = E.parseEnv(formatted);
        eq(E.formatEnv(second.entries), formatted, "往返一致 case " + i);
        eq(second.entries.length, first.entries.length, "往返键数一致 case " + i);
    });
})();

/* ================= 8. 注册 ================= */
(function () {
    var cats = fs.readFileSync(__dirname + "/../tools/categories.go", "utf8");
    contains(cats, '"env_parser"', "注册 ID env_parser");
    contains(cats, '"/tools/env-parser"', "注册 Path /tools/env-parser");
    contains(cats, '".env 解析与校验器"', "注册名称");
    var block = cats.slice(cats.indexOf('"env_parser"'), cats.indexOf('"env_parser"') + 1200);
    contains(block, "开发工具", "注册品类为开发工具");
    contains(block, "New:", "注册含 New 字段");
    var paths = cats.match(/"\/tools\/[^"]+"/g) || [];
    var uniq = {};
    paths.forEach(function (p) { uniq[p] = true; });
    eq(Object.keys(uniq).length, 200, "注册总数 199→200 Path");
})();

/* ================= 9. 零网络静态检查 ================= */
(function () {
    var src = fs.readFileSync(__dirname + "/../static/js/env_parser.js", "utf8");
    ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource("].forEach(function (kw) {
        notContains(src, kw, "JS 内无 " + kw);
    });
    var tpl = fs.readFileSync(__dirname + "/../templates/env_parser.html", "utf8");
    notContains(tpl, "fetch(", "模板内无 fetch");
    notContains(tpl, "<script src=\"http", "模板无外部 script CDN");
})();

/* ================= 10. 互链与真限制文案 ================= */
(function () {
    var tpl = fs.readFileSync(__dirname + "/../templates/env_parser.html", "utf8");
    contains(tpl, "/tools/prompt-sanitizer", "互链提示词脱敏器");
    contains(tpl, "只做格式解析与校验、不读取真实运行环境变量", "真限制：不读真实环境变量");
    contains(tpl, "不做密钥有效性验证", "真限制：不验证密钥有效性");
    contains(tpl, "只在浏览器本地解析、不上传", "真限制：本地解析不上传");
    contains(tpl, "格式校验与脱敏的区分", "区分格式校验与脱敏文案");
    notContains(tpl, "morse", "不链未交付摩斯码");
    notContains(tpl, "滚动字幕", "不链未交付滚动字幕");
    contains(tpl, "单行解析口径", "真限制：单行解析口径");
})();

console.log("\n断言通过: " + pass + ", 失败: " + fail + ", 共 " + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
