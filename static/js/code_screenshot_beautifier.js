/* 代码截图美化器：自研轻量语法高亮 tokenizer + canvas 本地渲染导出 PNG
 * 零第三方依赖、零网络请求（无外部调用、无上传），全部在浏览器本地完成。
 * 纯逻辑部分（tokenizer / 语言检测 / 主题 / 尺寸计算）经由 module.exports 暴露，
 * 供 node tests/code_screenshot_beautifier.test.js 做单元测试。
 * 用法（浏览器）：页面引入后自动初始化 #csb-* 控件并实时渲染预览。
 */
(function () {
"use strict";

/* ================= 常量 ================= */
var MAX_RENDER_LINES = 300;      // 渲染行数上限
var MAX_RENDER_CHARS = 50000;    // 渲染字符上限
var MAX_LINE_CHARS = 400;        // 单行显示字符上限（防 canvas 超宽）
var FONT_STACK = 'Menlo,SFMono-Regular,"JetBrains Mono",Consolas,"Courier New",monospace';
var RENDER_SCALE = 2;            // 导出清晰度倍数（retina）

function hasDOM() {
  return typeof document !== "undefined" && typeof window !== "undefined";
}

/* ================= 语言定义 =================
 * token 类型：kw=关键字 tag=标签名(HTML)/at规则(CSS) str=字符串
 *             com=注释 num=数字 txt=普通文本
 */
var LANGS = {
  javascript: {
    name: "JavaScript", lineComment: ["//"], blockComment: [["/*", "*/"]],
    strings: ['"', "'", "`"], shellVars: false, caseInsensitive: false,
    keywords: ["break", "case", "catch", "class", "const", "continue", "debugger", "default",
      "delete", "do", "else", "export", "extends", "finally", "for", "function", "if",
      "import", "in", "instanceof", "new", "return", "super", "switch", "this", "throw",
      "try", "typeof", "var", "void", "while", "with", "yield", "let", "static", "await",
      "async", "of", "from", "as", "get", "set", "null", "true", "false", "undefined",
      "NaN", "Infinity", "constructor", "prototype"]
  },
  typescript: {
    name: "TypeScript", lineComment: ["//"], blockComment: [["/*", "*/"]],
    strings: ['"', "'", "`"], shellVars: false, caseInsensitive: false,
    keywords: ["break", "case", "catch", "class", "const", "continue", "debugger", "default",
      "delete", "do", "else", "export", "extends", "finally", "for", "function", "if",
      "import", "in", "instanceof", "new", "return", "super", "switch", "this", "throw",
      "try", "typeof", "var", "void", "while", "with", "yield", "let", "static", "await",
      "async", "of", "from", "as", "get", "set", "null", "true", "false", "undefined",
      "NaN", "Infinity", "interface", "type", "enum", "namespace", "declare", "abstract",
      "implements", "readonly", "private", "public", "protected", "satisfies", "keyof",
      "infer", "never", "unknown", "any", "string", "number", "boolean", "symbol",
      "bigint", "override", "is", "asserts", "constructor", "prototype"]
  },
  python: {
    name: "Python", lineComment: ["#"], blockComment: [],
    strings: ['"', "'"], shellVars: false, caseInsensitive: false,
    keywords: ["False", "None", "True", "and", "as", "assert", "async", "await", "break",
      "class", "continue", "def", "del", "elif", "else", "except", "finally", "for",
      "from", "global", "if", "import", "in", "is", "lambda", "nonlocal", "not", "or",
      "pass", "raise", "return", "try", "while", "with", "yield"]
  },
  go: {
    name: "Go", lineComment: ["//"], blockComment: [["/*", "*/"]],
    strings: ['"', "'", "`"], shellVars: false, caseInsensitive: false,
    keywords: ["break", "case", "chan", "const", "continue", "default", "defer", "else",
      "fallthrough", "for", "func", "go", "goto", "if", "import", "interface", "map",
      "package", "range", "return", "select", "struct", "switch", "type", "var", "nil",
      "true", "false", "iota"]
  },
  java: {
    name: "Java", lineComment: ["//"], blockComment: [["/*", "*/"]],
    strings: ['"', "'"], shellVars: false, caseInsensitive: false,
    keywords: ["abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
      "class", "const", "continue", "default", "do", "double", "else", "enum", "extends",
      "final", "finally", "float", "for", "goto", "if", "implements", "import",
      "instanceof", "int", "interface", "long", "native", "new", "package", "private",
      "protected", "public", "return", "short", "static", "strictfp", "super", "switch",
      "synchronized", "this", "throw", "throws", "transient", "try", "void", "volatile",
      "while", "true", "false", "null", "var", "record"]
  },
  html: {
    name: "HTML", lineComment: [], blockComment: [["<!--", "-->"]],
    strings: [], shellVars: false, caseInsensitive: false, isMarkup: true, keywords: []
  },
  css: {
    name: "CSS", lineComment: [], blockComment: [["/*", "*/"]],
    strings: [], shellVars: false, caseInsensitive: false, isCss: true,
    keywords: ["color", "background", "background-color", "background-image", "font-size",
      "font-family", "font-weight", "margin", "margin-top", "margin-right", "margin-bottom",
      "margin-left", "padding", "padding-top", "padding-right", "padding-bottom",
      "padding-left", "border", "border-radius", "border-color", "display", "position",
      "width", "height", "max-width", "min-width", "max-height", "min-height", "top",
      "left", "right", "bottom", "flex", "grid", "gap", "align-items", "justify-content",
      "text-align", "line-height", "opacity", "z-index", "overflow", "cursor",
      "transition", "transform", "box-shadow", "text-shadow", "content", "float", "clear",
      "box-sizing", "white-space", "vertical-align", "letter-spacing", "text-decoration",
      "outline", "visibility", "flex-direction", "flex-wrap"]
  },
  json: {
    name: "JSON", lineComment: [], blockComment: [],
    strings: ['"'], shellVars: false, caseInsensitive: false,
    keywords: ["true", "false", "null"]
  },
  sql: {
    name: "SQL", lineComment: ["--"], blockComment: [["/*", "*/"]],
    strings: ["'"], shellVars: false, caseInsensitive: true,
    keywords: ["select", "from", "where", "join", "left", "right", "inner", "outer", "on",
      "group", "by", "order", "having", "limit", "offset", "insert", "into", "values",
      "update", "set", "delete", "create", "table", "alter", "drop", "index", "view",
      "as", "and", "or", "not", "null", "in", "like", "between", "is", "distinct",
      "count", "sum", "avg", "max", "min", "case", "when", "then", "else", "end",
      "union", "all", "primary", "key", "foreign", "references", "default", "unique",
      "with", "desc", "asc"]
  },
  shell: {
    name: "Shell", lineComment: ["#"], blockComment: [],
    strings: ['"', "'"], shellVars: true, caseInsensitive: false,
    keywords: ["if", "then", "else", "elif", "fi", "for", "while", "do", "done", "case",
      "esac", "function", "return", "exit", "echo", "cd", "export", "local", "readonly",
      "declare", "source", "in", "until", "select", "break", "continue", "shift",
      "trap", "exec", "eval", "set", "unset", "alias", "true", "false", "test"]
  },
  markdown: {
    name: "Markdown", lineComment: [], blockComment: [],
    strings: [], shellVars: false, caseInsensitive: false, isMarkdown: true, keywords: []
  },
  text: {
    name: "纯文本", lineComment: [], blockComment: [],
    strings: [], shellVars: false, caseInsensitive: false, keywords: []
  }
};

var LANG_ORDER = ["javascript", "typescript", "python", "go", "java", "html", "css",
  "json", "sql", "shell", "markdown"];

/* ================= 背景 ================= */
var BACKGROUNDS = [
  { id: "grad-purple", name: "渐变紫", kind: "gradient", from: "#667eea", to: "#764ba2" },
  { id: "grad-blue", name: "渐变蓝", kind: "gradient", from: "#2193b0", to: "#6dd5ed" },
  { id: "grad-sunset", name: "渐变霞光", kind: "gradient", from: "#fa709a", to: "#fee140" },
  { id: "solid-dark", name: "纯色深灰", kind: "solid", color: "#1f2937" },
  { id: "solid-light", name: "纯色浅灰", kind: "solid", color: "#e5e7eb" },
  { id: "transparent", name: "透明", kind: "transparent" }
];

/* ================= 主题（4 档） =================
 * colors: kw=关键字/tag str=字符串 com=注释 num=数字 txt=正文
 */
var THEMES = {
  "one-dark": {
    name: "One Dark（深色）",
    window: "#282c34", titlebar: "#21252b", titleText: "#9da5b4", lineNo: "#636d83",
    colors: { kw: "#c678dd", tag: "#e06c75", str: "#98c379", com: "#5c6370", num: "#d19a66", txt: "#abb2bf" }
  },
  "dracula": {
    name: "Dracula（深色）",
    window: "#282a36", titlebar: "#1e1f29", titleText: "#8a8f98", lineNo: "#6272a4",
    colors: { kw: "#ff79c6", tag: "#ff79c6", str: "#f1fa8c", com: "#6272a4", num: "#bd93f9", txt: "#f8f8f2" }
  },
  "github-light": {
    name: "GitHub Light（浅色）",
    window: "#ffffff", titlebar: "#f6f8fa", titleText: "#586069", lineNo: "#959da5",
    colors: { kw: "#d73a49", tag: "#22863a", str: "#032f62", com: "#6a737d", num: "#005cc5", txt: "#24292e" }
  },
  "solarized-light": {
    name: "Solarized Light（浅色）",
    window: "#fdf6e3", titlebar: "#eee8d5", titleText: "#657b83", lineNo: "#93a1a1",
    colors: { kw: "#859900", tag: "#268bd2", str: "#2aa198", com: "#93a1a1", num: "#d33682", txt: "#657b83" }
  }
};

var THEME_ORDER = ["one-dark", "dracula", "github-light", "solarized-light"];

function validTheme(id) {
  return THEMES[id] ? id : "one-dark";
}
function themeColors(id) {
  return THEMES[validTheme(id)];
}
function validBackground(id) {
  for (var i = 0; i < BACKGROUNDS.length; i++) {
    if (BACKGROUNDS[i].id === id) return id;
  }
  return "grad-purple";
}
function backgroundDef(id) {
  var vid = validBackground(id);
  for (var i = 0; i < BACKGROUNDS.length; i++) {
    if (BACKGROUNDS[i].id === vid) return BACKGROUNDS[i];
  }
  return BACKGROUNDS[0];
}
function validLang(id) {
  if (id === "auto" || id === "text") return id;
  return LANGS[id] ? id : "auto";
}

/* ================= 自研轻量 tokenizer =================
 * 单遍扫描：注释（行/块，块注释跨行保持状态）→ 字符串（转义感知）
 * → Shell 变量 → 数字 → 标识符/关键字。相邻普通文本自动合并。
 * 输入规模上限 5 万字符，扫描为线性时间，无回溯，正则均无嵌套量词。
 */
function isDigit(ch) { return ch >= "0" && ch <= "9"; }
function isWordStart(ch) { return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || ch === "_" || ch === "$"; }
function isWordChar(ch) { return isWordStart(ch) || isDigit(ch); }

/* 把一行切成注释块与代码块；st = {end: 块注释结束符 | null} 跨行保持 */
function splitComments(line, cfg, st) {
  var chunks = [];
  var i = 0, n = line.length;
  /* 上一行遗留的块注释延续 */
  if (st.end) {
    var e0 = line.indexOf(st.end);
    if (e0 < 0) { chunks.push({ t: "com", s: line }); return chunks; }
    chunks.push({ t: "com", s: line.slice(0, e0 + st.end.length) });
    i = e0 + st.end.length;
    st.end = null;
  }
  var buf = "";
  function flushCode() { if (buf) { chunks.push({ t: "code", s: buf }); buf = ""; } }
  while (i < n) {
    var ch0 = line[i];
    /* 跳过字符串：字符串内的 // 与 /* *\/ 不得视为注释 */
    if (cfg.strings.indexOf(ch0) >= 0) {
      var sj = i + 1;
      while (sj < n) {
        if (line[sj] === "\\") { sj += 2; continue; }
        if (line[sj] === ch0) { sj++; break; }
        sj++;
      }
      buf += line.slice(i, sj);
      i = sj;
      continue;
    }
    var matched = null, mEnd = null, mLen = 0;
    var k;
    for (k = 0; k < cfg.lineComment.length; k++) {
      var lc = cfg.lineComment[k];
      if (lc && line.indexOf(lc, i) === i) { matched = "line"; mLen = lc.length; break; }
    }
    if (!matched) {
      for (k = 0; k < cfg.blockComment.length; k++) {
        var bc = cfg.blockComment[k];
        if (bc && bc[0] && line.indexOf(bc[0], i) === i) { matched = "block"; mEnd = bc[1]; mLen = bc[0].length; break; }
      }
    }
    if (matched === "line") {
      flushCode();
      chunks.push({ t: "com", s: line.slice(i) });
      i = n;
      break;
    }
    if (matched === "block") {
      flushCode();
      var e2 = line.indexOf(mEnd, i + mLen);
      if (e2 < 0) {
        chunks.push({ t: "com", s: line.slice(i) });
        st.end = mEnd;
        i = n;
        break;
      }
      chunks.push({ t: "com", s: line.slice(i, e2 + mEnd.length) });
      i = e2 + mEnd.length;
      continue;
    }
    buf += line[i];
    i++;
  }
  flushCode();
  return chunks;
}

/* 通用代码块扫描：字符串 / Shell 变量 / 数字 / 关键字 */
function tokenizeCodeChunk(s, cfg) {
  var toks = [], buf = "", i = 0, n = s.length;
  function flush() { if (buf) { toks.push({ t: "txt", s: buf }); buf = ""; } }
  function push(t, str) { flush(); toks.push({ t: t, s: str }); }
  while (i < n) {
    var ch = s[i];
    /* 字符串（转义感知；模板字符串 ${} 整体视为字符串） */
    if (cfg.strings.indexOf(ch) >= 0) {
      var j = i + 1;
      while (j < n) {
        if (s[j] === "\\") { j += 2; continue; }
        if (s[j] === ch) { j++; break; }
        j++;
      }
      push("str", s.slice(i, j));
      i = j;
      continue;
    }
    /* Shell 变量：$VAR / ${VAR} / $1 / $? */
    if (cfg.shellVars && ch === "$") {
      var mv = /^\$(\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*|[0-9#?@$!*])/.exec(s.slice(i));
      if (mv) { push("num", mv[0]); i += mv[0].length; continue; }
    }
    /* 数字（要求左侧非词字符，避免把标识符内的数字切开） */
    if (isDigit(ch) && (i === 0 || !isWordChar(s[i - 1]))) {
      var mn = /^\d+(\.\d+)?/.exec(s.slice(i));
      if (mn) { push("num", mn[0]); i += mn[0].length; continue; }
    }
    /* 标识符 / 关键字 */
    if (isWordStart(ch)) {
      var mw = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(s.slice(i));
      var word = mw[0];
      var key = cfg.caseInsensitive ? word.toLowerCase() : word;
      if (cfg.keywords.indexOf(key) >= 0) push("kw", word);
      else buf += word;
      i += word.length;
      continue;
    }
    buf += ch;
    i++;
  }
  flush();
  return toks;
}

function tokenizeGenericLine(line, cfg, st) {
  var chunks = splitComments(line, cfg, st);
  var toks = [];
  for (var i = 0; i < chunks.length; i++) {
    if (chunks[i].t === "com") toks.push({ t: "com", s: chunks[i].s });
    else toks = toks.concat(tokenizeCodeChunk(chunks[i].s, cfg));
  }
  return toks;
}

/* ---------- HTML：标签拆解（标签名着色，属性值按字符串着色） ---------- */
function tokenizeTagInner(inner) {
  var toks = [], i = 0, n = inner.length, buf = "";
  function flush() { if (buf) { toks.push({ t: "txt", s: buf }); buf = ""; } }
  /* '<' 与可选 '/' */
  if (inner[i] === "<") { toks.push({ t: "txt", s: "<" }); i++; }
  if (inner[i] === "/") { toks.push({ t: "txt", s: "/" }); i++; }
  var mn = /^[A-Za-z][A-Za-z0-9-]*/.exec(inner.slice(i));
  if (mn) { toks.push({ t: "tag", s: mn[0] }); i += mn[0].length; }
  while (i < n) {
    var ch = inner[i];
    if (ch === '"' || ch === "'") {
      flush();
      var j = i + 1;
      while (j < n && inner[j] !== ch) j++;
      j = Math.min(j + 1, n);
      toks.push({ t: "str", s: inner.slice(i, j) });
      i = j;
      continue;
    }
    if (isDigit(ch) && (i === 0 || !isWordChar(inner[i - 1]))) {
      var md = /^\d+(\.\d+)?/.exec(inner.slice(i));
      if (md) { flush(); toks.push({ t: "num", s: md[0] }); i += md[0].length; continue; }
    }
    buf += ch;
    i++;
  }
  flush();
  return toks;
}

function tokenizeHtmlLine(line, cfg, st) {
  var toks = [], i = 0, n = line.length, buf = "";
  function flush() { if (buf) { toks.push({ t: "txt", s: buf }); buf = ""; } }
  if (st.end === "-->") {
    var e0 = line.indexOf("-->");
    if (e0 < 0) return [{ t: "com", s: line }];
    toks.push({ t: "com", s: line.slice(0, e0 + 3) });
    i = e0 + 3;
    st.end = null;
  }
  while (i < n) {
    if (line.indexOf("<!--", i) === i) {
      flush();
      var e2 = line.indexOf("-->", i + 4);
      if (e2 < 0) { toks.push({ t: "com", s: line.slice(i) }); st.end = "-->"; break; }
      toks.push({ t: "com", s: line.slice(i, e2 + 3) });
      i = e2 + 3;
      continue;
    }
    if (line[i] === "<" && i + 1 < n && /[A-Za-z\/!]/.test(line[i + 1])) {
      flush();
      var j = i + 1, q = null;
      while (j < n) {
        var c = line[j];
        if (q) { if (c === q) q = null; }
        else if (c === '"' || c === "'") q = c;
        else if (c === ">") break;
        j++;
      }
      var inner = line.slice(i, Math.min(j + 1, n));
      toks = toks.concat(tokenizeTagInner(inner));
      i = Math.min(j + 1, n);
      continue;
    }
    buf += line[i];
    i++;
  }
  flush();
  return toks;
}

/* ---------- CSS：属性名/值着色 ---------- */
function tokenizeCssCode(s, cfg) {
  var toks = [], i = 0, n = s.length, buf = "";
  function flush() { if (buf) { toks.push({ t: "txt", s: buf }); buf = ""; } }
  while (i < n) {
    var ch = s[i];
    if (ch === '"' || ch === "'") {
      flush();
      var j = i + 1;
      while (j < n) {
        if (s[j] === "\\") { j += 2; continue; }
        if (s[j] === ch) { j++; break; }
        j++;
      }
      toks.push({ t: "str", s: s.slice(i, j) });
      i = j;
      continue;
    }
    if (ch === "#") {
      var mh = /^#[0-9a-fA-F]{3,8}\b/.exec(s.slice(i));
      if (mh) { flush(); toks.push({ t: "num", s: mh[0] }); i += mh[0].length; continue; }
    }
    if (ch === "@") {
      var ma = /^@[a-zA-Z-]+/.exec(s.slice(i));
      if (ma) { flush(); toks.push({ t: "kw", s: ma[0] }); i += ma[0].length; continue; }
    }
    if (isDigit(ch) && (i === 0 || !isWordChar(s[i - 1]))) {
      var mn = /^\d+(\.\d+)?(px|r?em|%|vh|vw|vmin|vmax|pt|pc|s|ms|deg)?\b/.exec(s.slice(i));
      if (mn) { flush(); toks.push({ t: "num", s: mn[0] }); i += mn[0].length; continue; }
    }
    if (/[a-zA-Z-]/.test(ch)) {
      var mw = /^[a-zA-Z-]+/.exec(s.slice(i));
      var word = mw[0];
      var isProp = /^\s*:/.test(s.slice(i + word.length));
      if (isProp && cfg.keywords.indexOf(word.toLowerCase()) >= 0) {
        flush();
        toks.push({ t: "kw", s: word });
      } else {
        buf += word;
      }
      i += word.length;
      continue;
    }
    buf += ch;
    i++;
  }
  flush();
  return toks;
}

function tokenizeCssLine(line, cfg, st) {
  var chunks = splitComments(line, cfg, st);
  var toks = [];
  for (var i = 0; i < chunks.length; i++) {
    if (chunks[i].t === "com") toks.push({ t: "com", s: chunks[i].s });
    else toks = toks.concat(tokenizeCssCode(chunks[i].s, cfg));
  }
  return toks;
}

/* ---------- Markdown：标题/引用/列表/行内标记 ---------- */
function tokenizeMarkdownLine(line) {
  var toks = [], rest = line;
  var mH = /^(#{1,6})(\s)/.exec(rest);
  var mQ = !mH && /^(\s*>\s?)/.exec(rest);
  var mL = !mH && !mQ && /^(\s*(?:[-*+]\s+|\d+\.\s+))/.exec(rest);
  if (mH) { toks.push({ t: "kw", s: mH[1] }); rest = rest.slice(mH[1].length); }
  else if (mQ) { toks.push({ t: "com", s: mQ[1] }); rest = rest.slice(mQ[1].length); }
  else if (mL) { toks.push({ t: /\d/.test(mL[1]) ? "num" : "com", s: mL[1] }); rest = rest.slice(mL[1].length); }
  var i = 0, buf = "";
  function flush() { if (buf) { toks.push({ t: "txt", s: buf }); buf = ""; } }
  while (i < rest.length) {
    var ch = rest[i];
    if (ch === "`") {
      var j = rest.indexOf("`", i + 1);
      flush();
      if (j < 0) { toks.push({ t: "str", s: rest.slice(i) }); break; }
      toks.push({ t: "str", s: rest.slice(i, j + 1) });
      i = j + 1;
      continue;
    }
    if ((ch === "*" || ch === "_") && rest[i + 1] === ch) {
      flush();
      toks.push({ t: "kw", s: ch + ch });
      i += 2;
      continue;
    }
    if (ch === "[") {
      var mLink = /^\[([^\]]*)\]\(([^)]*)\)/.exec(rest.slice(i));
      if (mLink) {
        flush();
        toks.push({ t: "txt", s: "[" });
        toks.push({ t: "kw", s: mLink[1] });
        toks.push({ t: "txt", s: "](" });
        toks.push({ t: "str", s: mLink[2] });
        toks.push({ t: "txt", s: ")" });
        i += mLink[0].length;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return toks;
}

/* 主入口：返回每行的 token 数组；超长单行截断防 canvas 超宽 */
function tokenize(code, langId) {
  var cfg = LANGS[langId] || LANGS.text;
  var rawLines = String(code).replace(/\t/g, "    ").split("\n");
  var st = { end: null };
  var out = [];
  for (var li = 0; li < rawLines.length; li++) {
    var line = rawLines[li];
    var cut = false;
    if (line.length > MAX_LINE_CHARS) { line = line.slice(0, MAX_LINE_CHARS); cut = true; }
    var toks;
    if (cfg.isMarkup) toks = tokenizeHtmlLine(line, cfg, st);
    else if (cfg.isCss) toks = tokenizeCssLine(line, cfg, st);
    else if (cfg.isMarkdown) toks = tokenizeMarkdownLine(line);
    else toks = tokenizeGenericLine(line, cfg, st);
    if (cut) toks.push({ t: "com", s: " …" });
    if (!toks.length) toks.push({ t: "txt", s: "" });
    out.push(toks);
  }
  return out;
}

/* token 在某主题下是否“可见着色”（非默认文本色） */
function isColored(token, themeId) {
  var th = themeColors(themeId);
  var c = th.colors[token.t] || th.colors.txt;
  return c !== th.colors.txt;
}

/* ================= 语言自动检测（启发式打分） ================= */
function detectLanguage(code) {
  var t = String(code).trim();
  if (!t) return "text";
  if (/^[\{\[]/.test(t)) {
    try { JSON.parse(t); return "json"; } catch (e) { /* 继续 */ }
  }
  if (/<!doctype html/i.test(t) || (/<[a-zA-Z][^<>]{0,120}>/.test(t) && /<\/[a-zA-Z]+>/.test(t))) return "html";
  if (/^#{1,6}\s/m.test(t) || /```/.test(t)) return "markdown";
  if (/^\s*(select|insert|update|delete|create|with|alter|drop)\b/im.test(t)) return "sql";
  if (/^#!\s*\/bin\/(ba)?sh/.test(t) || (/\bfi\b/.test(t) && /\b(then|done)\b/.test(t))) return "shell";
  if (/^\s*package\s+[a-zA-Z_]\w*\s*$/m.test(t)) return "go";
  if (/\bpublic\s+(class|interface)\b/.test(t) || /System\.out\.println/.test(t)) return "java";
  if (/\binterface\s+[A-Za-z_]\w*/.test(t) || /:\s*(string|number|boolean)\s*[=;,\)\]]/.test(t) ||
      /\btype\s+[A-Za-z_]\w*\s*=/.test(t)) return "typescript";
  if (/^\s*def\s+[a-zA-Z_]\w*\s*\(/m.test(t) || /^\s*(import|from)\s+[a-zA-Z_]\w*/m.test(t)) return "python";
  if (/^\s*[.#]?[a-zA-Z][\w\-\.\s:#>\[\]="']*\{\s*$/m.test(t)) return "css";
  if (/\b(function|const|let|=>|console\.)\b/.test(t) || /\brequire\(/.test(t)) return "javascript";
  return "text";
}

/* ================= 纯工具函数（可测试） ================= */
function pad2(n) { return (n < 10 ? "0" : "") + n; }

function buildExportFilename(d) {
  d = d || new Date();
  return "code-screenshot-" +
    d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + "-" +
    pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()) + ".png";
}

function formatBytes(n) {
  if (n < 1024) return n + " B";
  var units = ["KB", "MB", "GB"], i = -1, v = n;
  do { v /= 1024; i++; } while (v >= 1024 && i < units.length - 1);
  return v.toFixed(1) + " " + units[i];
}

/* 大代码保护：超 300 行或超 5 万字符则截断并给出提示文案 */
function truncateCode(code) {
  code = String(code);
  var lines = code.split("\n");
  var chars = code.length;
  if (lines.length > MAX_RENDER_LINES || chars > MAX_RENDER_CHARS) {
    var kept = lines.slice(0, MAX_RENDER_LINES).join("\n");
    if (kept.length > MAX_RENDER_CHARS) kept = kept.slice(0, MAX_RENDER_CHARS);
    var keptLines = kept.split("\n").length;
    return {
      code: kept,
      truncated: true,
      origLines: lines.length,
      origChars: chars,
      note: "代码较大（" + lines.length + " 行 / " + formatBytes(chars) +
        "），为保护渲染性能仅绘制前 " + keptLines + " 行，建议分段截图。"
    };
  }
  return { code: code, truncated: false, origLines: lines.length, origChars: chars, note: "" };
}

/* 版式计算（纯函数）：contentW=代码区像素宽(css px)，lineNoW=行号区宽 */
function computeLayout(contentW, lineCount, lineNoW, opts) {
  var scale = opts.scale || RENDER_SCALE;
  var padX = opts.padX != null ? opts.padX : 24;
  var padY = opts.padY != null ? opts.padY : 20;
  var outer = opts.outerPad != null ? opts.outerPad : 48;
  var lineH = opts.fontPx * (opts.lineHeight || 1.5);
  var barH = Math.max(38, Math.round(opts.fontPx * 2.6));
  var winW = Math.ceil(contentW + lineNoW + padX * 2);
  var winH = Math.ceil(barH + lineCount * lineH + padY * 2);
  return {
    scale: scale, lineH: lineH, barH: barH,
    winW: winW, winH: winH,
    canvasW: Math.ceil((winW + outer * 2) * scale),
    canvasH: Math.ceil((winH + outer * 2) * scale),
    outerPad: outer, padX: padX, padY: padY,
    contentW: contentW, lineNoW: lineNoW
  };
}

/* ================= canvas 本地渲染（浏览器） ================= */
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBackground(ctx, W, H, bgId) {
  var bg = backgroundDef(bgId);
  if (bg.kind === "transparent") {
    ctx.clearRect(0, 0, W, H);
    return;
  }
  if (bg.kind === "gradient") {
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, bg.from);
    g.addColorStop(1, bg.to);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = bg.color;
  }
  ctx.fillRect(0, 0, W, H);
}

/* 核心渲染：把代码画到给定 canvas；返回 {truncated, note, canvasW, canvasH, lang} */
function renderToCanvas(canvas, code, opts) {
  opts = opts || {};
  var fontPx = opts.fontPx || 14;
  var lineHeight = opts.lineHeight || 1.5;
  var padX = opts.padX != null ? opts.padX : 24;
  var padY = opts.padY != null ? opts.padY : 20;
  var showLineNo = opts.showLineNo !== false;
  var showTitle = !!opts.showTitle;
  var theme = themeColors(opts.theme);
  var scale = RENDER_SCALE;

  var t = truncateCode(code);
  var langId = opts.lang === "auto" || !opts.lang ? detectLanguage(t.code) : opts.lang;
  var tokenLines = tokenize(t.code, langId);
  if (t.truncated) {
    tokenLines.push([{ t: "com", s: "…（已截断，仅渲染前 " + tokenLines.length + " 行）" }]);
  }
  var lineCount = tokenLines.length;

  /* 度量：等宽字体下逐 token 实测 */
  var meas = document.createElement("canvas").getContext("2d");
  meas.font = fontPx + "px " + FONT_STACK;
  var contentW = 0, li, ti, w;
  for (li = 0; li < tokenLines.length; li++) {
    w = 0;
    for (ti = 0; ti < tokenLines[li].length; ti++) {
      w += meas.measureText(tokenLines[li][ti].s).width;
    }
    if (w > contentW) contentW = w;
  }
  if (!code.trim()) contentW = meas.measureText("请在上方输入区粘贴代码，下方实时预览…").width;
  var lineNoW = 0;
  if (showLineNo) {
    lineNoW = meas.measureText(new Array(String(lineCount).length + 1).join("8")).width + 18;
  }

  var L = computeLayout(Math.ceil(contentW), lineCount, Math.ceil(lineNoW), {
    scale: scale, fontPx: fontPx, lineHeight: lineHeight,
    padX: padX, padY: padY, outerPad: 48
  });

  canvas.width = L.canvasW;
  canvas.height = L.canvasH;
  var ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.textBaseline = "top";

  var cssW = L.canvasW / scale, cssH = L.canvasH / scale;
  drawBackground(ctx, cssW, cssH, opts.bg);

  var ox = L.outerPad, oy = L.outerPad;

  /* 窗口：圆角 + 阴影 */
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 14;
  rr(ctx, ox, oy, L.winW, L.winH, 12);
  ctx.fillStyle = theme.window;
  ctx.fill();
  ctx.restore();

  /* 内容裁剪进圆角窗口 */
  ctx.save();
  rr(ctx, ox, oy, L.winW, L.winH, 12);
  ctx.clip();

  /* 标题栏 + 红绿灯 */
  ctx.fillStyle = theme.titlebar;
  ctx.fillRect(ox, oy, L.winW, L.barH);
  var lights = ["#ff5f57", "#febc2e", "#28c840"];
  for (var k = 0; k < 3; k++) {
    var cx = ox + 24 + k * 22, cy = oy + L.barH / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = lights[k];
    ctx.fill();
  }
  if (showTitle) {
    var title = (opts.title || "").trim() || (LANGS[langId] ? LANGS[langId].name : "代码截图");
    ctx.fillStyle = theme.titleText;
    ctx.font = Math.round(fontPx * 0.95) + "px " + FONT_STACK;
    ctx.textAlign = "center";
    var tw = ctx.measureText(title).width;
    var maxTw = L.winW - 140;
    var dispTitle = title;
    while (tw > maxTw && dispTitle.length > 4) {
      dispTitle = dispTitle.slice(0, -2);
      tw = ctx.measureText(dispTitle + "…").width;
    }
    if (dispTitle !== title) dispTitle += "…";
    ctx.fillText(dispTitle, ox + L.winW / 2, oy + L.barH / 2 - Math.round(fontPx * 0.95) / 2 - 1);
    ctx.textAlign = "left";
  }

  /* 代码区 */
  ctx.fillStyle = theme.window;
  ctx.fillRect(ox, oy + L.barH, L.winW, L.winH - L.barH);
  ctx.font = fontPx + "px " + FONT_STACK;
  var codeX = ox + padX + lineNoW;
  var y0 = oy + L.barH + padY;

  if (!code.trim()) {
    ctx.fillStyle = theme.lineNo;
    ctx.fillText("请在上方输入区粘贴代码，下方实时预览…", codeX, y0);
  } else {
    for (li = 0; li < tokenLines.length; li++) {
      var y = y0 + li * L.lineH;
      if (showLineNo) {
        ctx.fillStyle = theme.lineNo;
        ctx.textAlign = "right";
        ctx.fillText(String(li + 1), ox + padX + lineNoW - 10, y);
        ctx.textAlign = "left";
      }
      var x = codeX;
      var toks = tokenLines[li];
      for (ti = 0; ti < toks.length; ti++) {
        var tk = toks[ti];
        ctx.fillStyle = theme.colors[tk.t] || theme.colors.txt;
        ctx.fillText(tk.s, x, y);
        x += ctx.measureText(tk.s).width;
      }
    }
  }
  ctx.restore();

  return {
    truncated: t.truncated, note: t.note,
    canvasW: L.canvasW, canvasH: L.canvasH,
    lang: langId, lines: lineCount
  };
}

function downloadBlob(blob, filename) {
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

/* ================= 页面逻辑 ================= */
var SAMPLE_CODE = [
  "// 代码截图美化器 · 示例（JavaScript）",
  "const greeting = \"你好，ToolWeb！\";",
  "",
  "function fib(n) {",
  "  if (n <= 1) return n; // 递归出口",
  "  return fib(n - 1) + fib(n - 2);",
  "}",
  "",
  "for (let i = 0; i < 10; i++) {",
  "  console.log(`fib(${i}) = ${fib(i)}`);",
  "}"
].join("\n");

function $(id) { return document.getElementById(id); }

function readOpts() {
  return {
    lang: validLang($("csb-lang").value),
    theme: validTheme($("csb-theme").value),
    bg: validBackground($("csb-bg").value),
    fontPx: parseInt($("csb-fontsize").value, 10) || 14,
    lineHeight: 1.55,
    padX: parseInt($("csb-pad").value, 10) || 24,
    padY: 20,
    showLineNo: $("csb-lineno").checked,
    showTitle: $("csb-showtitle").checked,
    title: $("csb-title").value
  };
}

function setStatus(msg, isErr) {
  var el = $("csb-status");
  el.textContent = msg;
  el.style.color = isErr ? "#b91c1c" : "#047857";
}

function refreshPreview() {
  var code = $("csb-input").value;
  var opts = readOpts();
  var canvas = $("csb-canvas");
  try {
    var r = renderToCanvas(canvas, code, opts);
    var warn = $("csb-warn");
    if (r.truncated) {
      warn.style.display = "flex";
      warn.querySelector("span").textContent = r.note;
    } else {
      warn.style.display = "none";
    }
    var langName = (LANGS[r.lang] || LANGS.text).name;
    $("csb-stats").textContent =
      "语言：" + langName + " · " + r.lines + " 行 · " +
      formatBytes(code.length) + " · 导出 " +
      Math.round(r.canvasW / RENDER_SCALE) + "×" + Math.round(r.canvasH / RENDER_SCALE) +
      " px（@" + RENDER_SCALE + "x 清晰度）";
    canvas._lastRender = r;
  } catch (e) {
    setStatus("渲染失败：" + (e && e.message ? e.message : e), true);
  }
}

function debounce(fn, ms) {
  var timer = null;
  return function () {
    if (timer) clearTimeout(timer);
    var args = arguments, self = this;
    timer = setTimeout(function () { fn.apply(self, args); }, ms);
  };
}

function exportCanvas(cb) {
  var code = $("csb-input").value;
  if (!code.trim()) { setStatus("请先粘贴代码再导出。", true); return; }
  var off = document.createElement("canvas");
  var r = renderToCanvas(off, code, readOpts());
  off.toBlob(function (blob) {
    if (!blob) { setStatus("PNG 生成失败，请重试。", true); return; }
    cb(blob, r);
  }, "image/png");
}

function init() {
  /* 语言下拉：自动检测 + 11 种 */
  var langSel = $("csb-lang");
  var optAuto = document.createElement("option");
  optAuto.value = "auto";
  optAuto.textContent = "自动检测";
  langSel.appendChild(optAuto);
  for (var i = 0; i < LANG_ORDER.length; i++) {
    var o = document.createElement("option");
    o.value = LANG_ORDER[i];
    o.textContent = LANGS[LANG_ORDER[i]].name;
    langSel.appendChild(o);
  }
  /* 主题下拉 */
  var themeSel = $("csb-theme");
  for (var t = 0; t < THEME_ORDER.length; t++) {
    var ot = document.createElement("option");
    ot.value = THEME_ORDER[t];
    ot.textContent = THEMES[THEME_ORDER[t]].name;
    themeSel.appendChild(ot);
  }
  /* 背景下拉 */
  var bgSel = $("csb-bg");
  for (var b = 0; b < BACKGROUNDS.length; b++) {
    var ob = document.createElement("option");
    ob.value = BACKGROUNDS[b].id;
    ob.textContent = BACKGROUNDS[b].name;
    bgSel.appendChild(ob);
  }

  var debounced = debounce(refreshPreview, 250);
  $("csb-input").addEventListener("input", debounced);
  var ctrls = ["csb-lang", "csb-theme", "csb-bg", "csb-fontsize", "csb-pad"];
  for (var c = 0; c < ctrls.length; c++) {
    $(ctrls[c]).addEventListener("change", refreshPreview);
  }
  $("csb-lineno").addEventListener("change", refreshPreview);
  $("csb-showtitle").addEventListener("change", function () {
    $("csb-title").disabled = !$("csb-showtitle").checked;
    refreshPreview();
  });
  $("csb-title").addEventListener("input", debounced);
  $("csb-pad-val").textContent = $("csb-pad").value + " px";
  $("csb-pad").addEventListener("input", function () {
    $("csb-pad-val").textContent = $("csb-pad").value + " px";
    debounced();
  });

  $("csb-sample").addEventListener("click", function () {
    $("csb-input").value = SAMPLE_CODE;
    $("csb-lang").value = "auto";
    setStatus("");
    refreshPreview();
    this.blur();
  });
  $("csb-clear").addEventListener("click", function () {
    $("csb-input").value = "";
    setStatus("");
    refreshPreview();
    this.blur();
  });

  $("csb-download").addEventListener("click", function () {
    var btn = this;
    if (!$("csb-input").value.trim()) { setStatus("请先粘贴代码再导出。", true); return; }
    btn.disabled = true;
    exportCanvas(function (blob) {
      var filename = buildExportFilename(new Date());
      downloadBlob(blob, filename);
      setStatus("已下载 " + filename + "（" + formatBytes(blob.size) + "）。");
      btn.disabled = false;
    });
    this.blur();
  });

  $("csb-copy").addEventListener("click", function () {
    var btn = this;
    if (!$("csb-input").value.trim()) { setStatus("请先粘贴代码再复制。", true); return; }
    btn.disabled = true;
    if (!(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write)) {
      setStatus("当前浏览器不支持直接复制 PNG，请使用「下载 PNG」。", true);
      btn.disabled = false;
      return;
    }
    exportCanvas(function (blob) {
      navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(function () {
        setStatus("PNG 已复制到剪贴板，可直接粘贴。");
        btn.disabled = false;
      }, function () {
        setStatus("复制被浏览器拒绝，请使用「下载 PNG」。", true);
        btn.disabled = false;
      });
    });
    this.blur();
  });

  refreshPreview();
}

if (hasDOM()) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    MAX_RENDER_LINES: MAX_RENDER_LINES,
    MAX_RENDER_CHARS: MAX_RENDER_CHARS,
    MAX_LINE_CHARS: MAX_LINE_CHARS,
    RENDER_SCALE: RENDER_SCALE,
    FONT_STACK: FONT_STACK,
    LANGS: LANGS,
    LANG_ORDER: LANG_ORDER,
    BACKGROUNDS: BACKGROUNDS,
    THEMES: THEMES,
    THEME_ORDER: THEME_ORDER,
    validTheme: validTheme,
    themeColors: themeColors,
    validBackground: validBackground,
    backgroundDef: backgroundDef,
    validLang: validLang,
    tokenize: tokenize,
    isColored: isColored,
    detectLanguage: detectLanguage,
    truncateCode: truncateCode,
    buildExportFilename: buildExportFilename,
    formatBytes: formatBytes,
    computeLayout: computeLayout,
    SAMPLE_CODE: SAMPLE_CODE
  };
}
})();
