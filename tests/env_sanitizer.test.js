/* .env 脱敏生成器纯逻辑单元测试（零依赖）：node tests/env_sanitizer.test.js
 * 覆盖：
 *  1. parseEnvLine 行分类（pair/comment/blank/invalid）与解析口径
 *  2. parseEnvLine 非法参数（空输入抛 Error，err.field='line'）
 *  3. maskValue 两种模式与非法参数（err.field='mode'/'placeholder'）
 *  4. sanitizeEnv 确定性向量（规格逐字命中）
 *  5. sanitizeEnv 非法参数（err.field='text'/'mode'/'placeholder'）与选项语义
 *  6. keepComments 开关与非法行 '# [跳过]' 标注
 *  7. categories.go 注册（ID/Path/Icon/Category/New）与 Path 总数 253
 *  8. 零网络请求静态检查（JS 无 fetch/XHR/WebSocket；上传走 FileReader）
 *  9. 模板：SEO 面板、真限制三条、互链（env_parser 双向、prompt_sanitizer 单向）
 */
"use strict";
var E = require("../static/js/env_sanitizer.js");
var fs = require("fs");
var path = require("path");
var ROOT = path.join(__dirname, "..");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function contains(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（期望包含 " + JSON.stringify(sub) + "）"); }
function notContains(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }
function throwsField(fn, field, name) {
    try { fn(); }
    catch (e) {
        ok(e instanceof Error && e.field === field, name + "（err.field=" + field + "）");
        return;
    }
    ok(false, name + "（期望抛出 Error）");
}

/* ================= 1. parseEnvLine 行分类 ================= */
(function () {
    var p = E.parseEnvLine("DB_PASS=secret123");
    eq(p.kind, "pair", "普通行 kind=pair");
    eq(p.key, "DB_PASS", "键名提取");
    eq(p.value, "secret123", "值提取");

    var c = E.parseEnvLine("  # 注释");
    eq(c.kind, "comment", "前导空白注释 kind=comment");
    eq(c.key, null, "注释 key=null");

    var b = E.parseEnvLine("   \t ");
    eq(b.kind, "blank", "空白行 kind=blank");

    var inv = E.parseEnvLine("坏行无等号");
    eq(inv.kind, "invalid", "无 = 行 kind=invalid");
    eq(inv.key, null, "非法行 key=null");

    var e1 = E.parseEnvLine('export API_KEY="sk-abc"');
    eq(e1.kind, "pair", "export 行 kind=pair");
    eq(e1.key, "API_KEY", "export 前缀剥离");
    eq(e1.value, "sk-abc", "export 双引号值解码");

    var e2 = E.parseEnvLine("1BAD=x");
    eq(e2.kind, "invalid", "数字开头键名 kind=invalid");

    var e3 = E.parseEnvLine("Q='a\\nb'");
    eq(e3.kind, "pair", "单引号行 kind=pair");
    eq(e3.value, "a\\nb", "单引号值原样（不解码）");

    var e4 = E.parseEnvLine("K=hello # comment");
    eq(e4.value, "hello", "无引号 inline 注释截断");

    var e5 = E.parseEnvLine("K=a#b");
    eq(e5.value, "a#b", "值内无空白 # 保留");

    var e6 = E.parseEnvLine('K="abc');
    eq(e6.kind, "invalid", "双引号未闭合 kind=invalid");

    var e7 = E.parseEnvLine("A=1\r");
    eq(e7.kind, "pair", "CRLF 行尾 \\r 被剥离");
    eq(e7.value, "1", "CRLF 值无残留 \\r");
})();

/* ================= 2. parseEnvLine 非法参数 ================= */
(function () {
    throwsField(function () { E.parseEnvLine(""); }, "line", "空串抛 Error（err.field=line）");
    throwsField(function () { E.parseEnvLine(null); }, "line", "null 抛 Error（err.field=line）");
    throwsField(function () { E.parseEnvLine(undefined); }, "line", "undefined 抛 Error（err.field=line）");
    throwsField(function () { E.parseEnvLine(123); }, "line", "非字符串抛 Error（err.field=line）");
})();

/* ================= 3. maskValue ================= */
(function () {
    eq(E.maskValue("secret123", "empty", "P"), "", "empty 模式清空值");
    eq(E.maskValue("secret123", "placeholder", "P"), "P", "placeholder 模式用给定占位符");
    eq(E.maskValue("secret123", "placeholder"), "YOUR_VALUE_HERE",
        "placeholder 省略时用默认 YOUR_VALUE_HERE");
    eq(E.DEFAULT_PLACEHOLDER, "YOUR_VALUE_HERE", "默认占位符常量");
    throwsField(function () { E.maskValue("x", "bogus", "P"); }, "mode",
        "非法 mode 抛 Error（err.field=mode）");
    throwsField(function () { E.maskValue("x", "", "P"); }, "mode",
        "空串 mode 抛 Error（err.field=mode）");
    throwsField(function () { E.maskValue("x", "placeholder", 123); }, "placeholder",
        "非字符串 placeholder 抛 Error（err.field=placeholder）");
})();

/* ================= 4. sanitizeEnv 确定性向量（规格逐字） ================= */
(function () {
    eq(E.sanitizeEnv("DB_PASS=secret123\n# 注释\nPORT=3000", { mode: "empty", keepComments: true }),
        "DB_PASS=\n# 注释\nPORT=",
        "规格向量①：empty 模式注释保留逐字");
    eq(E.sanitizeEnv("API_KEY=sk-abc\nDEBUG=true", { mode: "placeholder", placeholder: "YOUR_VALUE_HERE" }),
        "API_KEY=YOUR_VALUE_HERE\nDEBUG=YOUR_VALUE_HERE",
        "规格向量②：placeholder 模式逐字");
    eq(E.sanitizeEnv('export TOKEN="sk-abc"\n坏行无等号', { mode: "empty", keepComments: true }),
        "TOKEN=\n# [跳过] 坏行无等号",
        "规格向量③：export 剥离＋非法行 '# [跳过]' 标注逐字");
    eq(E.sanitizeEnv("", { mode: "empty" }), "", "空文本输出空串");
})();

/* ================= 5. sanitizeEnv 非法参数与选项语义 ================= */
(function () {
    throwsField(function () { E.sanitizeEnv(null, { mode: "empty" }); }, "text",
        "text 非字符串抛 Error（err.field=text）");
    throwsField(function () { E.sanitizeEnv("A=1", { mode: "bogus" }); }, "mode",
        "mode 非法抛 Error（err.field=mode）");
    throwsField(function () { E.sanitizeEnv("A=1", { mode: "placeholder", placeholder: 7 }); },
        "placeholder", "placeholder 非字符串抛 Error（err.field=placeholder）");

    eq(E.sanitizeEnv("A=1", {}), "A=", "缺省 mode 为 empty");
    eq(E.sanitizeEnv("A=1", { mode: "placeholder" }), "A=YOUR_VALUE_HERE",
        "缺省 placeholder 为 YOUR_VALUE_HERE");

    /* 尾换行不另算一行 */
    eq(E.sanitizeEnv("A=1\n", { mode: "empty" }), "A=", "尾换行不另算一行");
})();

/* ================= 6. keepComments 开关与非法行标注 ================= */
(function () {
    eq(E.sanitizeEnv("# c\n\nA=1", { mode: "empty", keepComments: false }), "A=",
        "keepComments=false 时注释与空行丢弃");
    eq(E.sanitizeEnv("# c\n\nA=1", { mode: "empty", keepComments: true }), "# c\n\nA=",
        "keepComments=true 时注释与空行保留");
    eq(E.sanitizeEnv("坏行", { mode: "empty", keepComments: false }), "# [跳过] 坏行",
        "keepComments=false 时非法行仍保留并标注");
    eq(E.sanitizeEnv("A=1\n坏行\nB=2", { mode: "placeholder", placeholder: "X" }),
        "A=X\n# [跳过] 坏行\nB=X",
        "非法行标注不影响前后有效行");
    eq(E.sanitizeEnv('K="a\\"b"', { mode: "empty" }), "K=",
        "双引号值行同样脱敏为 KEY=");
    eq(E.sanitizeEnv("K=1\nK=2", { mode: "empty" }), "K=\nK=",
        "重复键逐行脱敏（不合并）");

    var d = E.sanitizeEnvDetailed("A=1\n# c\n坏行", { mode: "empty" });
    eq(d.stats.totalLines, 3, "统计：总行 3");
    eq(d.stats.pairs, 1, "统计：已脱敏键 1");
    eq(d.stats.keptLines, 1, "统计：注释/空行保留 1");
    eq(d.stats.invalidLines, 1, "统计：非法行 1");
})();

/* ================= 7. categories.go 注册 ================= */
(function () {
    var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");
    var idx = GO_SRC.indexOf('"env_sanitizer"');
    ok(idx >= 0, "注册：categories.go 含 ID env_sanitizer");
    ok(GO_SRC.indexOf('"/tools/env-sanitizer"') >= 0, "注册 Path /tools/env-sanitizer");
    var block = GO_SRC.slice(idx, idx + 1400);
    contains(block, 'Icon:        "hide_source"', "注册 Icon hide_source");
    contains(block, "New:         true", "注册 New 为 true");
    contains(block, 'Category:    "开发工具"', "注册 Category 为开发工具");
    contains(block, '".env 脱敏生成器"', "注册名称 .env 脱敏生成器");
    contains(block.toLowerCase(), "env sanitizer", "Description 中英文双语（含英文）");
    var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
    while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
    eq(pathCount, 274, "注册 Path 总数 268→270");
})();

/* ================= 8. 零网络静态检查 ================= */
(function () {
    var src = fs.readFileSync(path.join(ROOT, "static", "js", "env_sanitizer.js"), "utf8");
    ["fetch(", "XMLHttpRequest", "WebSocket(", "EventSource("].forEach(function (kw) {
        notContains(src, kw, "JS 内无 " + kw);
    });
    contains(src, "FileReader", "上传走 FileReader 纯前端");
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "env_sanitizer.html"), "utf8");
    notContains(tpl, "fetch(", "模板内无 fetch");
    notContains(tpl, "<script src=\"http", "模板无外部 script CDN");
    var epTpl = fs.readFileSync(path.join(ROOT, "templates", "env_parser.html"), "utf8");
    contains(epTpl, "/tools/env-sanitizer", "env_parser 模板含回链");
})();

/* ================= 9. 模板：SEO／真限制／互链 ================= */
(function () {
    var tpl = fs.readFileSync(path.join(ROOT, "templates", "env_sanitizer.html"), "utf8");
    /* SEO 面板 */
    contains(tpl, "<title>.env 脱敏生成器", "SEO：title");
    contains(tpl, 'name="description"', "SEO：description");
    contains(tpl, 'name="keywords"', "SEO：keywords");
    contains(tpl, 'rel="canonical"', "SEO：canonical");
    contains(tpl, 'property="og:title"', "SEO：OG title");
    contains(tpl, "application/ld+json", "SEO：JSON-LD");
    /* 真限制三条（页面明示） */
    contains(tpl, "无法判断密钥有效性", "真限制①：无法判断密钥有效性");
    contains(tpl, "KEY 命名仍暴露结构信息", "真限制②：KEY 命名仍暴露结构信息");
    contains(tpl, "多行值可能处理不全", "真限制③：多行值可能处理不全");
    /* 互链 */
    contains(tpl, "/tools/env-parser", "与 env_parser 互链");
    contains(tpl, "/tools/prompt-sanitizer", "单向链入 prompt_sanitizer");
    contains(tpl, ".env.example", "固定下载文件名 .env.example");
    contains(tpl, 'id="es-file"', "文件上传 input");
    notContains(tpl, ".env 解析与校验器（当前）", "不含 env_parser 的当前态标记");
})();

console.log("\n断言通过: " + pass + ", 失败: " + fail + ", 共 " + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
