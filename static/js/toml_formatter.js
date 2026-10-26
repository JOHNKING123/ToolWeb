/* TOML 格式化器：手写 TOML 分词＋解析＋序列化（常用子集，零依赖、零网络请求）。
 * 支持：裸键／引号键／点分隔键；表 [a.b] 与表数组 [[a.b]]；基本／字面／单行／多行
 * 字符串；十／十六／八／二进制整数（下划线分隔）、浮点（含 inf／nan）、布尔、
 * 日期时间（原文本保留，不做时区换算）；数组（嵌套、尾逗号）；内联表；行注释与行尾注释。
 * 不排序、不删键、不丢注释（压缩模式除外）；格式化失败抛中文错并指明行列，
 * 调用方须保留上一次有效输出，绝不把半截结果当输出。
 * 双模式：浏览器用 window.TOMLFormatter 挂载，node 用 module.exports。
 * 浏览器运行入口在文件末尾（仅当 document 存在时初始化页面交互）。
 */
(function () {
"use strict";

var SAMPLE_TOML = [
  "# 示例配置：演示格式化前后对比（注意 host 一行故意写成无空格形式）",
  "title = \"示例配置\"",
  "",
  "[server]",
  "host=\"localhost\"",
  "port = 8080  # 服务端口",
  "",
  "[server.tls]",
  "enabled = true",
  "tags = [\"a\", \"b\"]",
  "",
  "[database]",
  "ports = [8000, 8001]",
  ""
].join("\n");

/* ---------------- 错误 ---------------- */

function TomlError(line, col, msg) {
  var e = new Error("第" + line + "行第" + col + "列：" + msg);
  e.line = line;
  e.col = col;
  return e;
}

/* ---------------- 解析器 ---------------- */

function Parser(text) {
  this.s = text;
  this.i = 0;
  this.line = 1;
  this.col = 1;
  this.entries = []; /* {type:blank|comment|header|keyval, ...} */
  this.keyCount = 0;
  this.tableCount = 0;
  this.scope = ""; /* 当前表路径（显示用点分隔，如 server.tls），根为空 */
  this.scopeId = ""; /* 作用域实例标识：普通表为路径本身，表数组元素为 路径#序号，避免多元素键冲突 */
  this.tables = {}; /* 已定义的表路径 -> true（表数组元素除外，见 arrayTables） */
  this.arrayTables = {}; /* 表数组路径 -> 已出现次数 */
  this.implicitTables = {}; /* 点分隔键隐式生成的表路径 -> true */
  this.scopeKeys = {}; /* 作用域路径 -> {完整键路径: 行} */
  this.scopeScalars = {}; /* 作用域路径 -> {完整键路径: 行}（已定义为标量值的键） */
  this.allScalars = {}; /* 全局完整键路径 -> true（跨作用域的表／值冲突检查） */
}

Parser.prototype.eof = function () { return this.i >= this.s.length; };
Parser.prototype.ch = function () { return this.s.charAt(this.i); };
Parser.prototype.peek = function (n) { return this.s.charAt(this.i + (n || 0)); };

Parser.prototype.advance = function () {
  var c = this.s.charAt(this.i);
  this.i++;
  if (c === "\n") { this.line++; this.col = 1; } else { this.col++; }
  return c;
};

Parser.prototype.errHere = function (msg) { throw TomlError(this.line, this.col, msg); };

/* 跳过行内空白（空格与 Tab，不含换行） */
Parser.prototype.skipInlineSpace = function () {
  while (!this.eof() && (this.ch() === " " || this.ch() === "\t")) this.advance();
};

/* 跳过空白、换行与注释（仅用于数组／内联表内部），收集到的注释返回 */
Parser.prototype.skipTrivia = function () {
  var comments = [];
  for (;;) {
    while (!this.eof() && " \t\r\n".indexOf(this.ch()) >= 0) this.advance();
    if (!this.eof() && this.ch() === "#") {
      var start = this.i;
      while (!this.eof() && this.ch() !== "\n") this.advance();
      comments.push(this.s.slice(start, this.i).replace(/[ \t\r]+$/, ""));
    } else break;
  }
  return comments;
};

/* 解析一个键段：返回 {raw, name}；raw 保留引号形式用于原样输出 */
Parser.prototype.parseKeySegment = function () {
  this.skipInlineSpace();
  var line = this.line, col = this.col, c = this.ch();
  if (c === '"' || c === "'") {
    var str = this.parseString();
    return { raw: str.raw, name: str.value, line: line, col: col };
  }
  var start = this.i;
  while (!this.eof() && /[A-Za-z0-9_-]/.test(this.ch())) this.advance();
  if (this.i === start) this.errHere("键名非法：裸键只能含字母、数字、下划线与连字符，含特殊字符的键请用引号");
  var raw = this.s.slice(start, this.i);
  return { raw: raw, name: raw, line: line, col: col };
};

/* 解析点分隔键：返回段数组 */
Parser.prototype.parseDottedKey = function () {
  var segs = [this.parseKeySegment()];
  for (;;) {
    this.skipInlineSpace();
    if (this.ch() !== ".") break;
    this.advance();
    segs.push(this.parseKeySegment());
  }
  return segs;
};

/* 解析字符串（含单行与多行）；返回 {kind, raw, value} */
Parser.prototype.parseString = function () {
  var quote = this.ch();
  var line = this.line, col = this.col;
  var multiline = this.s.substr(this.i, 3) === quote + quote + quote;
  var delim = multiline ? quote + quote + quote : quote;
  var start = this.i;
  var j = this.i + delim.length;
  if (multiline && this.s.charAt(j) === "\r" && this.s.charAt(j + 1) === "\n") j += 2;
  else if (multiline && this.s.charAt(j) === "\n") j += 1;
  while (j < this.s.length) {
    if (quote === '"' && this.s.charAt(j) === "\\") { j += 2; continue; }
    if (this.s.substr(j, delim.length) === delim) {
      /* 基本多行字符串中 \"\"\" 转义：已在反斜杠分支跳过；此处为真正结束 */
      var raw = this.s.slice(start, j + delim.length);
      var value = raw.slice(delim.length, raw.length - delim.length);
      while (this.i < j + delim.length) this.advance();
      return { kind: "string", raw: raw, value: value };
    }
    if (!multiline && this.s.charAt(j) === "\n") {
      throw TomlError(line, col, "字符串未闭合：单行字符串在换行前缺少闭合引号");
    }
    j++;
  }
  if (multiline) throw TomlError(line, col, "多行字符串未闭合：缺少闭合的 " + delim);
  throw TomlError(line, col, "字符串未闭合：缺少闭合引号");
};

/* 解析裸值：数字／布尔／日期时间；非法则报错 */
Parser.prototype.parseBareValue = function () {
  var line = this.line, col = this.col;
  var start = this.i;
  while (!this.eof() && ",]}#\n\r".indexOf(this.ch()) < 0) this.advance();
  var raw = this.s.slice(start, this.i).replace(/[ \t\r]+$/, "");
  /* 回退多走的尾随空白对应的列（仅影响后续注释定位，不影响本值报错位置） */
  if (raw === "") this.errHere("缺少值：等号后应为字符串、数字、布尔、日期时间、数组或内联表");
  var ok = /^(?:[+-]?(?:inf|nan)|[+-]?(?:0x[0-9A-Fa-f_]+|0o[0-7_]+|0b[01_]+|(?:\d[\d_]*)?(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?|\d[\d_]*))$/.test(raw) ||
    raw === "true" || raw === "false" ||
    /^\d{4}-\d{2}-\d{2}([Tt ]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})?)?$/.test(raw) ||
    /^\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw);
  if (!ok) throw TomlError(line, col, "无效的值「" + raw + "」：应为数字、布尔、日期时间、字符串、数组或内联表");
  return { kind: "scalar", raw: raw, value: raw };
};

/* 解析值；返回节点 */
Parser.prototype.parseValue = function () {
  this.skipInlineSpace();
  var c = this.ch();
  if (c === '"' || c === "'") return this.parseString();
  if (c === "[") return this.parseArray();
  if (c === "{") return this.parseInlineTable();
  if (this.eof() || c === "\n" || c === "#") this.errHere("缺少值：等号后应为字符串、数字、布尔、日期时间、数组或内联表");
  return this.parseBareValue();
};

/* 解析数组；返回 {kind:array, items, comments} */
Parser.prototype.parseArray = function () {
  var line = this.line, col = this.col;
  this.advance(); /* [ */
  var items = [], comments = [];
  for (;;) {
    comments = comments.concat(this.skipTrivia());
    if (this.eof()) throw TomlError(line, col, "数组未闭合：缺少闭合的 ]");
    if (this.ch() === "]") { this.advance(); break; }
    var item = this.parseValue();
    items.push(item);
    comments = comments.concat(this.skipTrivia());
    if (this.eof()) throw TomlError(line, col, "数组未闭合：缺少闭合的 ]");
    if (this.ch() === ",") { this.advance(); continue; }
    if (this.ch() === "]") { this.advance(); break; }
    this.errHere("数组元素后应为逗号或闭合的 ]");
  }
  return { kind: "array", items: items, comments: comments };
};

/* 解析内联表；返回 {kind:inline, pairs, comments} */
Parser.prototype.parseInlineTable = function () {
  var line = this.line, col = this.col;
  this.advance(); /* { */
  var pairs = [], comments = [];
  for (;;) {
    comments = comments.concat(this.skipTrivia());
    if (this.eof()) throw TomlError(line, col, "内联表未闭合：缺少闭合的 }");
    if (this.ch() === "}") { this.advance(); break; }
    var segs = this.parseDottedKey();
    this.skipInlineSpace();
    if (this.ch() !== "=") this.errHere("内联表键后缺少等号 =");
    this.advance();
    var val = this.parseValue();
    pairs.push({ segs: segs, value: val });
    comments = comments.concat(this.skipTrivia());
    if (this.eof()) throw TomlError(line, col, "内联表未闭合：缺少闭合的 }");
    if (this.ch() === ",") {
      this.advance();
      var after = this.skipTrivia();
      comments = comments.concat(after);
      if (!this.eof() && this.ch() === "}") throw TomlError(this.line, this.col, "内联表不允许尾逗号");
      continue;
    }
    if (this.ch() === "}") { this.advance(); break; }
    this.errHere("内联表键值对后应为逗号或闭合的 }");
  }
  return { kind: "inline", pairs: pairs, comments: comments };
};

/* 注册键值对：重复键与标量／表冲突均在此报错 */
Parser.prototype.registerKeyval = function (segs, line, col) {
  var names = segs.map(function (s) { return s.name; });
  var fullPath = this.scope ? this.scope + "." + names.join(".") : names.join(".");
  var scopeKey = this.scopeId;
  if (!this.scopeKeys[scopeKey]) this.scopeKeys[scopeKey] = {};
  if (!this.scopeScalars[scopeKey]) this.scopeScalars[scopeKey] = {};
  /* 前缀已是标量值（如 a = 1 后再写 a.b = 2） */
  for (var k = 1; k < names.length; k++) {
    var prefix = this.scope ? this.scope + "." + names.slice(0, k).join(".") : names.slice(0, k).join(".");
    if (this.scopeScalars[scopeKey][prefix]) {
      throw TomlError(line, col, "键「" + names.slice(0, k).join(".") + "」已定义为值，不能再作子键");
    }
  }
  if (this.scopeKeys[scopeKey][fullPath]) {
    throw TomlError(line, col, "重复的键「" + names.join(".") + "」：同一表中该键已出现过");
  }
  var implicitKey = (scopeKey ? scopeKey + "\n" : "") + fullPath;
  if (this.tables[fullPath] || this.implicitTables[implicitKey]) {
    /* 已有同名表（如 [a] 后再写 a = 1，或点分隔键已生成隐式表） */
    if (!this.implicitTables[fullPath] || names.length > 1) {
      /* 点分隔键最后一段与隐式表同名仍算冲突；单段键与隐式表同名亦冲突 */
    }
    if (this.tables[fullPath]) throw TomlError(line, col, "键「" + names.join(".") + "」与已定义的表重名");
    /* 隐式表：a.b = 1 之后再写 a = 2 应冲突（a 已是表） */
    throw TomlError(line, col, "键「" + names.join(".") + "」已定义为表，不能再定义为值");
  }
  this.scopeKeys[scopeKey][fullPath] = line;
  this.scopeScalars[scopeKey][fullPath] = line;
  this.allScalars[scopeKey ? scopeKey + "." + names.join(".") : names.join(".")] = true;
  /* 中间段记为隐式表，供后续冲突检查 */
  for (var m = 1; m < names.length; m++) {
    var ip = this.scope ? this.scope + "." + names.slice(0, m).join(".") : names.slice(0, m).join(".");
    this.implicitTables[(scopeKey ? scopeKey + "\n" : "") + ip] = true;
  }
  /* 同作用域内点分隔键的兄弟段共享隐式表：后续 a.c = 2 不应因 a 已隐式而报错，
   * 上述检查只拦“整条路径”与表重名，中间段本身不在 scopeKeys 中，故无误报。 */
};

/* 隐式表是否存在（键以 作用域实例\n显示路径 存储，比较显示路径部分） */
Parser.prototype.implicitHas = function (path) {
  var keys = Object.keys(this.implicitTables);
  for (var i = 0; i < keys.length; i++) {
    var parts = keys[i].split("\n");
    if (parts[parts.length - 1] === path) return true;
  }
  return false;
};

/* 注册表头 */
Parser.prototype.registerHeader = function (segs, isArrayTable, line, col) {
  var names = segs.map(function (s) { return s.name; });
  var path = names.join(".");
  if (isArrayTable) {
    this.arrayTables[path] = (this.arrayTables[path] || 0) + 1;
    this.scope = path;
    this.scopeId = path + "#" + this.arrayTables[path];
    this.tableCount++;
    return;
  }
  if (this.tables[path]) throw TomlError(line, col, "重复的表「" + path + "」：该表已定义过");
  if (this.implicitHas(path)) throw TomlError(line, col, "表「" + path + "」与已定义的键冲突：该键已作表或子键使用");
  /* 与标量键冲突（如 a = 1 后再写 [a]，或 a.b = 1 后再写 [a.b]） */
  if (this.allScalars[path]) throw TomlError(line, col, "表「" + path + "」与已定义的值重名");
  this.tables[path] = true;
  this.scope = path;
  this.scopeId = path;
  this.tableCount++;
};

/* 主循环：逐条解析文档 */
Parser.prototype.parse = function () {
  while (!this.eof()) {
    var c = this.ch();
    if (c === "\n") { this.advance(); this.entries.push({ type: "blank" }); continue; }
    if (c === "\r") { this.advance(); continue; }
    if (c === " " || c === "\t") { this.skipInlineSpace(); continue; }
    if (c === "#") {
      var cs = this.i;
      while (!this.eof() && this.ch() !== "\n") this.advance();
      this.entries.push({ type: "comment", text: this.s.slice(cs, this.i).replace(/[ \t\r]+$/, "") });
      continue;
    }
    if (c === "[") {
      var hLine = this.line, hCol = this.col;
      this.advance();
      var isArrayTable = false;
      if (this.ch() === "[") { isArrayTable = true; this.advance(); }
      var segs = this.parseDottedKey();
      this.skipInlineSpace();
      var close = isArrayTable ? "]]" : "]";
      if (isArrayTable) {
        if (this.ch() !== "]" || this.peek(1) !== "]") {
          if (this.eof() || this.ch() === "\n") throw TomlError(hLine, hCol, "表头未闭合：缺少闭合的 ]]");
          this.errHere("表头非法：表数组表头后应为 ]]");
        }
        this.advance(); this.advance();
      } else {
        if (this.ch() !== "]") {
          if (this.eof() || this.ch() === "\n") throw TomlError(hLine, hCol, "表头未闭合：缺少闭合的 ]");
          this.errHere("表头非法：表头后应为 ]");
        }
        this.advance();
      }
      this.registerHeader(segs, isArrayTable, hLine, hCol);
      var hComment = this.parseTrailingComment();
      this.entries.push({ type: "header", segs: segs, arrayTable: isArrayTable, comment: hComment });
      this.expectLineEnd();
      continue;
    }
    /* 键值对 */
    var kLine = this.line, kCol = this.col;
    var ksegs = this.parseDottedKey();
    this.skipInlineSpace();
    if (this.ch() !== "=") {
      if (this.eof() || this.ch() === "\n") this.errHere("键值对缺少等号 =");
      this.errHere("键后应为等号 =");
    }
    this.advance();
    this.registerKeyval(ksegs, kLine, kCol);
    var value = this.parseValue();
    var comment = this.parseTrailingComment();
    this.entries.push({ type: "keyval", segs: ksegs, value: value, comment: comment });
    this.keyCount++;
    this.expectLineEnd();
  }
  return this;
};

/* 行尾注释（若有）：返回注释文本或 null；不消费换行 */
Parser.prototype.parseTrailingComment = function () {
  this.skipInlineSpace();
  if (this.ch() === "#") {
    var cs = this.i;
    while (!this.eof() && this.ch() !== "\n") this.advance();
    return this.s.slice(cs, this.i).replace(/[ \t\r]+$/, "");
  }
  return null;
};

/* 行尾只允许空白／注释／换行／文件尾，否则报错 */
Parser.prototype.expectLineEnd = function () {
  this.skipInlineSpace();
  if (this.eof()) return;
  if (this.ch() === "\n") { this.advance(); return; }
  if (this.ch() === "\r") { this.advance(); if (this.ch() === "\n") this.advance(); return; }
  this.errHere("行尾有多余内容：值之后只允许注释");
};

/* ---------------- 序列化 ---------------- */

function dotted(segs) {
  return segs.map(function (s) { return s.raw; }).join(".");
}

function formatValue(node, opts, depth) {
  if (node.kind === "array") {
    if (node.items.length === 0) return "[]";
    var multiline = opts.arrayMode === "multiline" || (opts.arrayMode === "compact" && node.comments.length > 0);
    /* 含内部注释的数组强制多行展开，避免丢注释（压缩模式除外，见 formatDocument） */
    if (multiline) {
      var pad = new Array(depth + 1 + 1).join(opts.indent);
      var closePad = new Array(depth + 1).join(opts.indent);
      var parts = node.items.map(function (it) { return pad + formatValue(it, opts, depth + 1); });
      node.comments.forEach(function (cm) { parts.push(pad + cm); });
      return "[\n" + parts.join(",\n") + ",\n" + closePad + "]";
    }
    return "[" + node.items.map(function (it) { return formatValue(it, opts, depth); }).join(", ") + "]";
  }
  if (node.kind === "inline") {
    return "{" + node.pairs.map(function (p) {
      return dotted(p.segs) + " = " + formatValue(p.value, opts, depth);
    }).join(", ") + "}";
  }
  return node.raw;
}

function formatDocument(doc, opts) {
  var out = [];
  var prevBlank = false;
  doc.entries.forEach(function (e) {
    if (e.type === "blank") {
      if (opts.compress) return;
      if (prevBlank) return;
      out.push("");
      prevBlank = true;
      return;
    }
    prevBlank = false;
    if (e.type === "comment") {
      if (opts.compress) return;
      out.push(e.text);
      return;
    }
    if (e.type === "header") {
      var h = (e.arrayTable ? "[[" : "[") + dotted(e.segs) + (e.arrayTable ? "]]" : "]");
      if (e.comment && !opts.compress) h += " " + e.comment;
      out.push(h);
      return;
    }
    /* keyval */
    var line = dotted(e.segs) + " = " + formatValue(e.value, opts, 0);
    if (e.comment && !opts.compress) line += " " + e.comment;
    out.push(line);
    /* 内联表内部注释无法留在同一行：移为行后独立注释行（注释本身无语义，不丢内容） */
    if (!opts.compress && e.value.kind === "inline" && e.value.comments.length) {
      e.value.comments.forEach(function (cm) { out.push(cm); });
    }
  });
  /* 首尾空行收敛：去掉首行空行与尾部空行 */
  while (out.length && out[0] === "") out.shift();
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n") + (out.length ? "\n" : "");
}

/* 对外入口：成功返回 {output, keyCount, tableCount}；失败抛中文错 */
function formatTOML(text, opts) {
  opts = opts || {};
  var o = {
    indent: opts.indent === "4" ? "    " : "  ",
    arrayMode: opts.arrayMode === "multiline" ? "multiline" : "compact",
    compress: !!opts.compress
  };
  if (o.compress) o.arrayMode = "compact";
  var doc = new Parser(text).parse();
  return { output: formatDocument(doc, o), keyCount: doc.keyCount, tableCount: doc.tableCount };
}

/* 校验入口：不抛错，返回 {ok, output, keyCount, tableCount, errors} */
function validateTOML(text, opts) {
  try {
    var r = formatTOML(text, opts);
    return { ok: true, output: r.output, keyCount: r.keyCount, tableCount: r.tableCount, errors: [] };
  } catch (e) {
    return {
      ok: false, output: "", keyCount: 0, tableCount: 0,
      errors: [{ line: e.line || 1, col: e.col || 1, message: e.message }]
    };
  }
}

var api = { SAMPLE_TOML: SAMPLE_TOML, formatTOML: formatTOML, validateTOML: validateTOML };

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
} else if (typeof window !== "undefined") {
  window.TOMLFormatter = api;
}

/* ---------------- 浏览器交互（仅当 document 存在） ---------------- */
if (typeof document !== "undefined") {
  (function () {
    function $(id) { return document.getElementById(id); }
    function toast(msg) {
      var t = $("tf-toast");
      if (!t) return;
      t.textContent = msg;
      t.style.display = "block";
      setTimeout(function () { t.style.display = "none"; }, 2600);
    }
    function copyText(text, okMsg) {
      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try {
          if (document.execCommand("copy")) { toast(okMsg); }
          else { toast("复制失败：请手动全选输出区内容复制（浏览器未授予剪贴板权限）"); }
        } catch (e) {
          toast("复制失败：请手动全选输出区内容复制（浏览器未授予剪贴板权限）");
        }
        document.body.removeChild(ta);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
      } else fallback();
    }

    var lastGood = "";
    var lastErrorLine = 0;

    function currentOpts() {
      var indent = "2";
      var radios = document.getElementsByName("tf-indent");
      for (var i = 0; i < radios.length; i++) if (radios[i].checked) indent = radios[i].value;
      var am = "compact";
      var ars = document.getElementsByName("tf-array");
      for (var j = 0; j < ars.length; j++) if (ars[j].checked) am = ars[j].value;
      return { indent: indent, arrayMode: am, compress: !!($("tf-compress") && $("tf-compress").checked) };
    }

    function recompute() {
      var input = $("tf-input").value;
      var outEl = $("tf-output");
      var resEl = $("tf-result");
      if (!input.trim()) {
        resEl.textContent = "请输入 TOML";
        resEl.className = "tf-msg";
        /* 空输入不是错误：输出区保留上一次有效结果，不清空误导 */
        return;
      }
      var r = validateTOML(input, currentOpts());
      if (r.ok) {
        lastGood = r.output;
        lastErrorLine = 0;
        outEl.value = r.output;
        resEl.textContent = "校验通过，共 " + r.keyCount + " 个键、" + r.tableCount + " 张表";
        resEl.className = "tf-msg tf-ok";
      } else {
        var e = r.errors[0];
        lastErrorLine = e.line;
        /* 格式化失败不覆盖原文：输出区保留上一次有效结果 */
        outEl.value = lastGood;
        resEl.textContent = "校验不通过：" + e.message;
        resEl.className = "tf-msg tf-err";
        toast("第 " + e.line + " 行有错误，请看校验结果");
      }
    }

    function init() {
      var input = $("tf-input");
      if (!input) return;
      if (!input.value) input.value = SAMPLE_TOML;
      ["tf-input"].forEach(function (id) {
        $(id).addEventListener("input", recompute);
      });
      ["tf-indent", "tf-array"].forEach(function (name) {
        var rs = document.getElementsByName(name);
        for (var i = 0; i < rs.length; i++) rs[i].addEventListener("change", recompute);
      });
      if ($("tf-compress")) $("tf-compress").addEventListener("change", function () {
        if (this.checked) {
          if (!window.confirm("压缩模式会去掉全部注释与空行，确认开启吗？")) { this.checked = false; return; }
        }
        recompute();
      });
      if ($("tf-sample")) $("tf-sample").addEventListener("click", function () { input.value = SAMPLE_TOML; recompute(); });
      if ($("tf-clear")) $("tf-clear").addEventListener("click", function () { input.value = ""; $("tf-output").value = ""; lastGood = ""; recompute(); });
      if ($("tf-copy")) $("tf-copy").addEventListener("click", function () {
        var v = $("tf-output").value;
        if (!v) { toast("暂无可复制的格式化结果"); return; }
        copyText(v, "已复制格式化结果");
      });
      if ($("tf-download")) $("tf-download").addEventListener("click", function () {
        var v = $("tf-output").value;
        if (!v) { toast("暂无可下载的格式化结果"); return; }
        var blob = new Blob([v], { type: "text/plain;charset=utf-8" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "formatted.toml";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
        toast("已下载 formatted.toml");
      });
      recompute();
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  })();
}
})();
