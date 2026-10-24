/* 代码截图美化器纯逻辑单元测试（零依赖）：node tests/code_screenshot_beautifier.test.js
 * 覆盖：
 * 1. 语言表（11 种语言＋自动检测，关键词表覆盖）
 * 2. tokenizer 四类着色（关键字/字符串/注释/数字 ≥ 三色区分）
 * 3. 语言自动检测
 * 4. 主题表（4 档，四类颜色互异）
 * 5. 大代码截断保护
 * 6. 导出文件名（时间戳）与单位换算
 * 7. 版式尺寸计算
 * 8. 模板静态检查（SEO 面板/脚本引用/控件）
 * 9. 零上传：脚本内无网络关键字、无 foreignObject
 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/code_screenshot_beautifier.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function hasType(toks, t, substr, name) {
  var found = toks.some(function (tk) {
    return tk.t === t && (substr === undefined || tk.s.indexOf(substr) >= 0);
  });
  ok(found, name);
}

/* ---------- 1. 语言表 ---------- */
eq(M.LANG_ORDER.length, 11, "语言表共 11 种");
["javascript", "typescript", "python", "go", "java", "html", "css", "json", "sql", "shell", "markdown"]
  .forEach(function (id) {
    ok(M.LANG_ORDER.indexOf(id) >= 0, "语言表包含 " + id);
    ok(M.LANGS[id] && M.LANGS[id].name, "语言 " + id + " 有中文名");
  });
ok(M.LANGS.javascript.keywords.length >= 30, "JS 关键词 ≥30 个");
ok(M.LANGS.typescript.keywords.length > M.LANGS.javascript.keywords.length, "TS 关键词多于 JS（含类型关键字）");
ok(M.LANGS.python.keywords.indexOf("def") >= 0, "Python 关键词含 def");
ok(M.LANGS.go.keywords.indexOf("func") >= 0, "Go 关键词含 func");
ok(M.LANGS.java.keywords.indexOf("class") >= 0, "Java 关键词含 class");
ok(M.LANGS.sql.keywords.indexOf("select") >= 0, "SQL 关键词含 select");
ok(M.LANGS.shell.keywords.indexOf("echo") >= 0, "Shell 关键词含 echo");
ok(M.LANGS.css.keywords.indexOf("color") >= 0, "CSS 属性表含 color");
ok(M.LANGS.json.keywords.join(",") === "true,false,null", "JSON 关键词为 true/false/null");
eq(M.validLang("auto"), "auto", "validLang 保留 auto");
eq(M.validLang("nope"), "auto", "非法语言回退 auto");

/* ---------- 2. tokenizer 四类着色 ---------- */
function flat(lang, code) {
  var lines = M.tokenize(code, lang);
  var all = [];
  lines.forEach(function (l) { all = all.concat(l); });
  return all;
}
var jsToks = flat("javascript", "const s = \"hi\"; // 注释\nlet n = 42;");
hasType(jsToks, "kw", "const", "JS: const 着色为关键字");
hasType(jsToks, "str", "\"hi\"", "JS: 字符串着色");
hasType(jsToks, "com", "// 注释", "JS: 行注释着色");
hasType(jsToks, "num", "42", "JS: 数字着色");

var jsBlock = M.tokenize("/* 第一行\n第二行 */\nvar a = 1;", "javascript");
hasType(jsBlock[0], "com", "第一行", "JS: 块注释跨行首行");
hasType(jsBlock[1], "com", "第二行", "JS: 块注释跨行次行");
hasType(jsBlock[2], "kw", "var", "JS: 块注释结束后恢复关键字");

var escToks = flat("javascript", "var u = \"http://x\"; var e = \"a\\\"b\";");
hasType(escToks, "str", "http://x", "JS: 字符串内的 // 不被当注释");
ok(!escToks.some(function (tk) { return tk.t === "com"; }), "JS: 该行无注释 token");
hasType(escToks, "str", "a\\\"b", "JS: 转义引号不提前结束字符串");

var pyToks = flat("python", "def foo(): # 注释\n    return 3.14");
hasType(pyToks, "kw", "def", "Python: def 关键字");
hasType(pyToks, "com", "# 注释", "Python: # 注释");
hasType(pyToks, "num", "3.14", "Python: 浮点数");

var goToks = flat("go", "package main\nfunc main() {\n\tfmt.Println(`hi`)\n}");
hasType(goToks, "kw", "package", "Go: package 关键字");
hasType(goToks, "kw", "func", "Go: func 关键字");
hasType(goToks, "str", "`hi`", "Go: 反引号原始字符串");

var sqlToks = flat("sql", "SELECT id FROM t WHERE n > 10; -- 查");
hasType(sqlToks, "kw", "SELECT", "SQL: 大小写不敏感关键字");
hasType(sqlToks, "num", "10", "SQL: 数字");
hasType(sqlToks, "com", "-- 查", "SQL: -- 注释");

var shToks = flat("shell", "echo $HOME # 打招呼\nif [ $n -gt 1 ]; then");
hasType(shToks, "kw", "echo", "Shell: echo 关键字");
hasType(shToks, "num", "$HOME", "Shell: $VAR 变量着色");
hasType(shToks, "com", "# 打招呼", "Shell: # 注释");

var htmlToks = flat("html", "<div class=\"a\">hi</div><!-- 注 -->");
hasType(htmlToks, "tag", "div", "HTML: 标签名着色");
hasType(htmlToks, "str", "\"a\"", "HTML: 属性值字符串着色");
hasType(htmlToks, "com", "<!-- 注 -->", "HTML: 注释着色");

var cssToks = flat("css", ".a { color: #fff; margin: 8px; } /* 注 */");
hasType(cssToks, "kw", "color", "CSS: 属性名关键字着色");
hasType(cssToks, "num", "#fff", "CSS: 十六进制颜色数字着色");
hasType(cssToks, "num", "8px", "CSS: 带单位数值着色");
hasType(cssToks, "com", "/* 注 */", "CSS: 注释着色");

var mdToks = flat("markdown", "# 标题\n- 项\n`code` **粗**");
hasType(mdToks, "kw", "#", "Markdown: 标题标记关键字着色");
hasType(mdToks, "str", "`code`", "Markdown: 行内代码字符串着色");

var jsonToks = flat("json", "{\"a\": true, \"n\": 12}");
hasType(jsonToks, "str", "\"a\"", "JSON: 键字符串着色");
hasType(jsonToks, "kw", "true", "JSON: true 关键字");
hasType(jsonToks, "num", "12", "JSON: 数字");

/* 四类颜色在默认主题下至少三色互异（JS/Python/SQL 各验） */
function distinctColors(lang, code, themeId) {
  var toks = flat(lang, code);
  var seen = {};
  ["kw", "str", "com", "num"].forEach(function (t) {
    if (toks.some(function (tk) { return tk.t === t; })) {
      var th = M.themeColors(themeId || "one-dark");
      seen[th.colors[t]] = true;
    }
  });
  return Object.keys(seen).length;
}
ok(distinctColors("javascript", "const s = \"hi\"; // c\nlet n = 1;") >= 3, "JS 四类 ≥3 色互异");
ok(distinctColors("python", "def f(): # c\n    return \"s\"\nx = 2") >= 3, "Python 四类 ≥3 色互异");
ok(distinctColors("sql", "SELECT a FROM t WHERE n > 10; -- c") >= 3, "SQL 三类 ≥3 色互异");
ok(M.isColored({ t: "kw", s: "if" }, "one-dark"), "isColored: 关键字可见着色");
ok(!M.isColored({ t: "txt", s: "x" }, "one-dark"), "isColored: 普通文本非着色");

/* 制表符展开与空行 */
var tabToks = M.tokenize("a\tb", "text");
ok(tabToks[0].every(function (tk) { return tk.s.indexOf("\t") < 0; }), "制表符被展开为空格");
eq(M.tokenize("", "text").length, 1, "空输入返回 1 空行");

/* ---------- 3. 语言自动检测 ---------- */
eq(M.detectLanguage("{\"a\": 1}"), "json", "检测 JSON");
eq(M.detectLanguage("<div><span>x</span></div>"), "html", "检测 HTML");
eq(M.detectLanguage("# 标题\n\n正文 `code`"), "markdown", "检测 Markdown");
eq(M.detectLanguage("SELECT id FROM users WHERE age > 18;"), "sql", "检测 SQL");
eq(M.detectLanguage("#!/bin/bash\necho hi"), "shell", "检测 Shell（shebang）");
eq(M.detectLanguage("package main\n\nfunc main() {}"), "go", "检测 Go");
eq(M.detectLanguage("public class Main {\n public static void main(String[] a) {} }"), "java", "检测 Java");
eq(M.detectLanguage("interface User {\n  name: string;\n}"), "typescript", "检测 TypeScript");
eq(M.detectLanguage("def foo():\n    return 1"), "python", "检测 Python");
eq(M.detectLanguage(".card {\n  color: red;\n}"), "css", "检测 CSS");
eq(M.detectLanguage("const a = 1;\nconsole.log(a);"), "javascript", "检测 JavaScript");
eq(M.detectLanguage("只是一些中文纯文本"), "text", "纯文本回退 text");
eq(M.detectLanguage("   "), "text", "空白输入回退 text");

/* ---------- 4. 主题表 ---------- */
eq(M.THEME_ORDER.length, 4, "主题共 4 档");
["one-dark", "dracula", "github-light", "solarized-light"].forEach(function (id) {
  var th = M.THEMES[id];
  ok(th && th.name, "主题 " + id + " 存在");
  var c = th.colors;
  ok(c.kw && c.str && c.com && c.num && c.txt, "主题 " + id + " 四类颜色齐全");
  var set = {};
  ["kw", "str", "com", "num", "txt"].forEach(function (k) { set[c[k]] = true; });
  ok(Object.keys(set).length >= 4, "主题 " + id + " 四类颜色基本互异");
  ok(th.window && th.titlebar && th.lineNo, "主题 " + id + " 窗口/标题栏/行号色齐全");
});
eq(M.validTheme("nope"), "one-dark", "非法主题回退 one-dark");
eq(M.THEMES["github-light"].window.toLowerCase(), "#ffffff", "GitHub Light 窗口为白色");
eq(M.backgroundDef("nope").id, "grad-purple", "非法背景回退渐变紫");
eq(M.BACKGROUNDS.length, 6, "背景共 6 种（含透明）");
ok(M.BACKGROUNDS.some(function (b) { return b.kind === "transparent"; }), "背景含透明");
ok(M.BACKGROUNDS.some(function (b) { return b.kind === "gradient"; }), "背景含渐变");
ok(M.BACKGROUNDS.some(function (b) { return b.kind === "solid"; }), "背景含纯色");

/* ---------- 5. 大代码截断保护 ---------- */
var big300 = new Array(302).join("x\n"); // 301 行
var r1 = M.truncateCode(big300);
ok(r1.truncated, "301 行触发截断");
eq(r1.code.split("\n").length, 300, "截断后保留 300 行");
ok(r1.note.indexOf("300") >= 0, "截断提示含行数");
var bigChar = new Array(50002).join("x");
var r2 = M.truncateCode(bigChar);
ok(r2.truncated, "超 5 万字符触发截断");
ok(r2.code.length <= M.MAX_RENDER_CHARS, "截断后字符 ≤ 上限");
var small = M.truncateCode("a\nb");
ok(!small.truncated && small.code === "a\nb", "小代码不截断");
eq(M.MAX_RENDER_LINES, 300, "行上限常量 300");
eq(M.MAX_RENDER_CHARS, 50000, "字符上限常量 50000");

/* ---------- 6. 导出文件名与单位换算 ---------- */
var fname = M.buildExportFilename(new Date(2026, 9, 24, 13, 41, 7));
eq(fname, "code-screenshot-20261024-134107.png", "文件名时间戳格式");
ok(/^code-screenshot-\d{8}-\d{6}\.png$/.test(M.buildExportFilename()), "文件名正则匹配");
eq(M.formatBytes(0), "0 B", "0 字节");
eq(M.formatBytes(512), "512 B", "512 字节");
eq(M.formatBytes(1024), "1.0 KB", "1024 字节 = 1.0 KB");
eq(M.formatBytes(1536), "1.5 KB", "1536 字节 = 1.5 KB");
eq(M.formatBytes(1048576), "1.0 MB", "1MB 换算");

/* ---------- 7. 版式尺寸计算 ---------- */
var L1 = M.computeLayout(100, 10, 30, { fontPx: 14, lineHeight: 1.5, padX: 24, padY: 20, outerPad: 48, scale: 2 });
eq(L1.winW, 178, "窗口宽 = 内容100+行号30+内边距48");
eq(L1.canvasW, 548, "画布宽 = (178+96)*2");
ok(L1.canvasH > 0 && L1.winH > 0, "画布高为正");
var L2 = M.computeLayout(100, 20, 30, { fontPx: 14, lineHeight: 1.5, padX: 24, padY: 20, outerPad: 48, scale: 2 });
ok(L2.winH > L1.winH, "行数增加 → 窗口变高");
var L3 = M.computeLayout(100, 10, 0, { fontPx: 14, lineHeight: 1.5, padX: 24, padY: 20, outerPad: 48, scale: 2 });
ok(L3.winW < L1.winW, "关闭行号 → 窗口变窄");
eq(M.RENDER_SCALE, 2, "渲染倍数 2x");
ok(M.FONT_STACK.indexOf("Menlo") >= 0, "字体栈含 Menlo");
ok(M.FONT_STACK.indexOf("JetBrains Mono") >= 0, "字体栈含 JetBrains Mono");

/* ---------- 8. 模板静态检查 ---------- */
var tplPath = path.join(__dirname, "../templates/code_screenshot_beautifier.html");
ok(fs.existsSync(tplPath), "模板文件存在");
var tpl = fs.readFileSync(tplPath, "utf8");
ok(tpl.indexOf('{{define "code_screenshot_beautifier"}}') >= 0, "模板 define 名正确");
ok(tpl.indexOf("https://www.johnkingzcq123.xyz/tools/code-screenshot-beautifier") >= 0, "canonical/OG 地址正确");
ok(tpl.indexOf('<link rel="canonical"') >= 0, "含 canonical 标签");
ok(tpl.indexOf('"@type":"SoftwareApplication"') >= 0, "含 JSON-LD SoftwareApplication");
ok(tpl.indexOf('property="og:title"') >= 0, "含 OG 标签");
ok(tpl.indexOf('<script src="/tools/static/js/code_screenshot_beautifier.js') >= 0, "引用对应 JS");
ok(tpl.indexOf('id="csb-input"') >= 0, "含代码输入框");
ok(tpl.indexOf('id="csb-lang"') >= 0, "含语言选择");
ok(tpl.indexOf('id="csb-theme"') >= 0, "含主题选择");
ok(tpl.indexOf('id="csb-bg"') >= 0, "含背景选择");
ok(tpl.indexOf('id="csb-canvas"') >= 0, "含预览 canvas");
ok(tpl.indexOf('id="csb-download"') >= 0, "含下载按钮");
ok(tpl.indexOf('id="csb-copy"') >= 0, "含复制按钮");
ok(tpl.indexOf('id="csb-lineno"') >= 0, "含行号开关");
ok(tpl.indexOf("常见问题") >= 0, "含 FAQ 面板");
ok(tpl.indexOf("相关工具") >= 0, "含相关工具面板");
ok(tpl.indexOf("/tools/code-minifier") >= 0, "相关工具链向代码压缩器");
ok(tpl.indexOf("csb-preview-scroll") >= 0, "预览区横向滚动容器");
ok(tpl.indexOf("@media (max-width:860px)") >= 0, "含移动端适配");

/* ---------- 9. 零上传 ---------- */
var src = fs.readFileSync(path.join(__dirname, "../static/js/code_screenshot_beautifier.js"), "utf8");
["fetch(", "XMLHttpRequest", "WebSocket", "EventSource", "navigator.sendBeacon", "$.ajax", "axios"].forEach(function (kw) {
  ok(src.indexOf(kw) < 0, "脚本内无网络关键字：" + kw);
});
ok(src.indexOf("foreignObject") < 0, "未使用 foreignObject 渲染");
ok(src.indexOf("highlight.js") < 0 && src.indexOf("prism") < 0, "未引入第三方高亮库");

/* ---------- 10. 导出形状 ---------- */
["tokenize", "detectLanguage", "truncateCode", "buildExportFilename", "formatBytes",
 "computeLayout", "themeColors", "validTheme", "LANGS", "THEMES", "BACKGROUNDS", "SAMPLE_CODE"]
  .forEach(function (k) { ok(M[k] !== undefined, "导出含 " + k); });
ok(M.SAMPLE_CODE.indexOf("fib") >= 0, "示例代码非空");

console.log("\n通过 " + pass + " / " + (pass + fail) + "，失败 " + fail);
process.exit(fail ? 1 : 0);
