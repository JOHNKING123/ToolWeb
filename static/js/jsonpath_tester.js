/* JSONPath 测试器：手写表达式分词＋求值器（常用子集，零依赖、零网络请求）。
 * 支持：起点 $、子节点 .name 与 ['name']、数组下标 [n]（负数倒数）、
 * 切片 [start:end:step]、并集 ['a','b']/[0,2]、通配 .* 与 [*]、
 * 递归 ..name 与 ..[*]。
 * 不支持：过滤 [?(...)]、脚本 [(...)]、函数式扩展；遇见时抛中文错并指明位置。
 * 双模式：浏览器用 window.JSONPathTester 挂载，node 用 module.exports。
 * 浏览器运行入口在文件末尾（仅当 document 存在时初始化页面交互）。
 */
(function () {
"use strict";

var IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function isObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isArray(v) { return Array.isArray(v); }

function fail(pos, msg) {
  var e = new Error(msg + "（位置：第 " + (pos + 1) + " 位）");
  e.position = pos;
  throw e;
}

/* ---------------- 表达式解析 ---------------- */

function parseExpression(expr) {
  if (typeof expr !== "string" || expr.trim() === "") {
    throw new Error("请输入以 $ 开头的表达式");
  }
  var s = expr;
  var i = 0;
  var steps = [];
  if (s.charAt(0) !== "$") {
    throw new Error("表达式须以 $ 开头（第 1 位应为 $，实为「" + s.charAt(0) + "」）");
  }
  i = 1;
  if (i >= s.length) return steps; /* 只有 $：命中根节点本身 */

  while (i < s.length) {
    var ch = s.charAt(i);
    if (ch === ".") {
      if (s.charAt(i + 1) === ".") {
        /* 递归 ..name / ..* / ..['name'] */
        i += 2;
        if (i >= s.length) fail(i, "表达式非法：递归符号 .. 后缺少键名或通配符");
        if (s.charAt(i) === "*") {
          steps.push({ kind: "recursive", key: null });
          i++;
        } else if (s.charAt(i) === "[") {
          var b = parseBracket(s, i);
          if (b.kind === "child") steps.push({ kind: "recursive", key: b.key });
          else if (b.kind === "wildcard") steps.push({ kind: "recursive", key: null });
          else fail(i, "表达式非法：递归符号 .. 后仅支持键名或通配符，不支持并集与切片");
          i = b.next;
        } else {
          var name = readIdent(s, i);
          if (!name) fail(i, "表达式非法：递归符号 .. 后应为键名");
          if (s.charAt(i + name.length) === "(") {
            fail(i, "不支持函数式扩展：本工具只支持常用子集，不支持 .name() 这类函数调用");
          }
          steps.push({ kind: "recursive", key: name });
          i += name.length;
        }
      } else {
        i++;
        if (i >= s.length) fail(i, "表达式非法：点号 . 后缺少键名");
        if (s.charAt(i) === "*") {
          steps.push({ kind: "wildcard" });
          i++;
        } else {
          var nm = readIdent(s, i);
          if (!nm) fail(i, "表达式非法：点号 . 后应为键名（仅含字母、数字、下划线、$；含中文或特殊字符的键请用括号记法 ['键名']）");
          if (s.charAt(i + nm.length) === "(") {
            fail(i, "不支持函数式扩展：本工具只支持常用子集，不支持 .name() 这类函数调用");
          }
          steps.push({ kind: "child", key: nm });
          i += nm.length;
        }
      }
    } else if (ch === "[") {
      var br = parseBracket(s, i);
      steps.push(br.step);
      i = br.next;
    } else if (ch === " " || ch === "\t") {
      i++;
    } else {
      fail(i, "表达式非法：意外的字符「" + ch + "」，此处应为 . 或 [");
    }
  }
  return steps;
}

function readIdent(s, i) {
  var m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(s.slice(i));
  return m ? m[0] : null;
}

function skipSpaces(s, i) {
  while (i < s.length && (s.charAt(i) === " " || s.charAt(i) === "\t")) i++;
  return i;
}

/* 解析切片的 :end[:step] 部分：调用时 s[i] === ':'，startValue 为已读的起止（可为 null 表示缺省）。
 * 返回 {kind:'slice', start, end, step, next}。 */
function parseSliceRest(s, i, startValue, bracketStart) {
  i = skipSpaces(s, i + 1);
  var end = null;
  if (s.charAt(i) !== ":" && s.charAt(i) !== "]") {
    var e = readInt(s, i);
    end = e.value;
    i = skipSpaces(s, e.next);
  }
  var stepVal = null;
  if (s.charAt(i) === ":") {
    i = skipSpaces(s, i + 1);
    if (s.charAt(i) !== "]") {
      var st = readInt(s, i);
      stepVal = st.value;
      i = skipSpaces(s, st.next);
    }
  }
  if (s.charAt(i) !== "]") fail(i, "表达式非法：切片后应为 ]");
  if (stepVal === 0) fail(bracketStart, "表达式非法：切片步长不能为 0");
  return { kind: "slice", start: startValue, end: end, step: stepVal, next: i + 1 };
}

/* 解析一段 [...]，返回 {step, next}；child/wildcard/union/index/slice 之一。
 * 递归 ..[...] 复用时只取 kind 字段（child/wildcard）。 */
function parseBracket(s, start) {
  var i = skipSpaces(s, start + 1);
  if (i >= s.length) fail(start, "表达式非法：括号 [ 未闭合");
  var c = s.charAt(i);
  if (c === "?") {
    fail(start, "不支持过滤表达式：本工具只支持常用子集，不支持 [?(...)] 过滤写法");
  }
  if (c === "(") {
    fail(start, "不支持脚本表达式：本工具只支持常用子集，不支持 [(...)] 脚本写法");
  }
  if (c === "*") {
    var j = skipSpaces(s, i + 1);
    if (s.charAt(j) !== "]") fail(j, "表达式非法：通配符 * 后应为 ]");
    return { step: { kind: "wildcard" }, kind: "wildcard", next: j + 1 };
  }
  if (c === "'" || c === '"') {
    /* 键名或键名并集 */
    var parts = [];
    while (true) {
      var str = readQuoted(s, i);
      parts.push({ kind: "key", key: str.value });
      i = skipSpaces(s, str.next);
      if (i >= s.length) fail(start, "表达式非法：括号 [ 未闭合");
      if (s.charAt(i) === ",") { i = skipSpaces(s, i + 1); continue; }
      if (s.charAt(i) === "]") {
        var step = parts.length === 1
          ? { kind: "child", key: parts[0].key }
          : { kind: "union", parts: parts };
        return { step: step, kind: parts.length === 1 ? "child" : "union", key: parts[0].key, next: i + 1 };
      }
      fail(i, "表达式非法：括号内字符串后应为 , 或 ]");
    }
  }
  if (c === ":") {
    /* 切片起止缺省：[:end] 或 [:end:step] 或 [:] */
    var sl = parseSliceRest(s, i, null, start);
    return { step: sl, kind: "slice", next: sl.next };
  }
  if (c === "-" || (c >= "0" && c <= "9")) {
    /* 下标 / 下标并集 / 切片 */
    var first = readInt(s, i);
    i = skipSpaces(s, first.next);
    if (s.charAt(i) === ":") {
      var sl2 = parseSliceRest(s, i, first.value, start);
      return { step: sl2, kind: "slice", next: sl2.next };
    }
    var items = [{ kind: "index", value: first.value }];
    while (s.charAt(i) === ",") {
      i = skipSpaces(s, i + 1);
      if (s.charAt(i) === "'" || s.charAt(i) === '"') {
        var qs = readQuoted(s, i);
        items.push({ kind: "key", key: qs.value });
        i = skipSpaces(s, qs.next);
      } else {
        var n = readInt(s, i);
        items.push({ kind: "index", value: n.value });
        i = skipSpaces(s, n.next);
      }
    }
    if (i >= s.length) fail(start, "表达式非法：括号 [ 未闭合");
    if (s.charAt(i) !== "]") fail(i, "表达式非法：括号内数字后应为 , 或 ]");
    var stp = items.length === 1
      ? { kind: "index", value: items[0].value }
      : { kind: "union", parts: items };
    return { step: stp, kind: items.length === 1 ? "index" : "union", next: i + 1 };
  }
  if (c === "]") fail(i, "表达式非法：空括号 [] 无意义，请填入键名、下标、通配符或切片");
  fail(i, "表达式非法：括号 [ 后出现不支持的字符「" + c + "」");
  return null; /* 不可达 */
}

function readInt(s, i) {
  var m = /^-?\d+/.exec(s.slice(i));
  if (!m) fail(i, "表达式非法：此处应为整数");
  return { value: parseInt(m[0], 10), next: i + m[0].length };
}

function readQuoted(s, i) {
  var q = s.charAt(i);
  var out = "";
  var j = i + 1;
  while (j < s.length) {
    var ch = s.charAt(j);
    if (ch === "\\" && j + 1 < s.length) {
      var esc = s.charAt(j + 1);
      if (esc === "n") out += "\n";
      else if (esc === "t") out += "\t";
      else if (esc === "r") out += "\r";
      else out += esc;
      j += 2;
      continue;
    }
    if (ch === q) return { value: out, next: j + 1 };
    out += ch;
    j++;
  }
  fail(i, "表达式非法：引号字符串未闭合");
  return null; /* 不可达 */
}

/* ---------------- 规范路径 ---------------- */

function formatPath(segs) {
  var out = "$";
  for (var k = 0; k < segs.length; k++) {
    var sg = segs[k];
    if (sg.type === "index") {
      out += "[" + sg.index + "]";
    } else if (IDENT_RE.test(sg.key)) {
      out += "." + sg.key;
    } else {
      out += "['" + sg.key.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "']";
    }
  }
  return out;
}

/* ---------------- 求值 ---------------- */

function resolveIndex(len, idx) {
  var n = idx < 0 ? len + idx : idx;
  return (n >= 0 && n < len) ? n : -1;
}

function sliceIndices(len, start, end, step) {
  var st = step === null || step === undefined ? 1 : step;
  var out = [];
  var s, e, k;
  if (st > 0) {
    s = start === null || start === undefined ? 0 : (start < 0 ? start + len : start);
    e = end === null || end === undefined ? len : (end < 0 ? end + len : end);
    if (s < 0) s = 0; if (s > len) s = len;
    if (e < 0) e = 0; if (e > len) e = len;
    for (k = s; k < e; k += st) out.push(k);
  } else {
    s = start === null || start === undefined ? len - 1 : (start < 0 ? start + len : start);
    e = end === null || end === undefined ? -1 : (end < 0 ? end + len : end);
    if (s < -1) s = -1; if (s > len - 1) s = len - 1;
    if (e < -1) e = -1; if (e > len - 1) e = len - 1;
    for (k = s; k > e; k += st) out.push(k);
  }
  return out;
}

function collectRecursive(node, key, acc) {
  /* 文档顺序深度优先：先本层匹配，再逐子节点递归 */
  if (isObject(node.value)) {
    var keys = Object.keys(node.value);
    var t;
    if (key !== null) {
      for (t = 0; t < keys.length; t++) {
        if (keys[t] === key) {
          acc.push({ value: node.value[keys[t]], segs: node.segs.concat([{ type: "key", key: keys[t] }]) });
        }
      }
    }
    for (t = 0; t < keys.length; t++) {
      var child = { value: node.value[keys[t]], segs: node.segs.concat([{ type: "key", key: keys[t] }]) };
      if (key === null) acc.push(child);
      collectRecursive(child, key, acc);
    }
  } else if (isArray(node.value)) {
    var a;
    for (a = 0; a < node.value.length; a++) {
      var el = { value: node.value[a], segs: node.segs.concat([{ type: "index", index: a }]) };
      if (key === null) acc.push(el);
      collectRecursive(el, key, acc);
    }
  }
}

function applyStep(nodes, step) {
  var out = [];
  var n, k;
  for (n = 0; n < nodes.length; n++) {
    var node = nodes[n];
    var v = node.value;
    if (step.kind === "child") {
      if (isObject(v) && Object.prototype.hasOwnProperty.call(v, step.key)) {
        out.push({ value: v[step.key], segs: node.segs.concat([{ type: "key", key: step.key }]) });
      }
    } else if (step.kind === "wildcard") {
      if (isObject(v)) {
        var keys = Object.keys(v);
        for (k = 0; k < keys.length; k++) {
          out.push({ value: v[keys[k]], segs: node.segs.concat([{ type: "key", key: keys[k] }]) });
        }
      } else if (isArray(v)) {
        for (k = 0; k < v.length; k++) {
          out.push({ value: v[k], segs: node.segs.concat([{ type: "index", index: k }]) });
        }
      }
    } else if (step.kind === "index") {
      if (isArray(v)) {
        var idx = resolveIndex(v.length, step.value);
        if (idx >= 0) out.push({ value: v[idx], segs: node.segs.concat([{ type: "index", index: idx }]) });
      }
    } else if (step.kind === "union") {
      for (k = 0; k < step.parts.length; k++) {
        var p = step.parts[k];
        if (p.kind === "key") {
          if (isObject(v) && Object.prototype.hasOwnProperty.call(v, p.key)) {
            out.push({ value: v[p.key], segs: node.segs.concat([{ type: "key", key: p.key }]) });
          }
        } else if (isArray(v)) {
          var ix = resolveIndex(v.length, p.value);
          if (ix >= 0) out.push({ value: v[ix], segs: node.segs.concat([{ type: "index", index: ix }]) });
        }
      }
    } else if (step.kind === "slice") {
      if (isArray(v)) {
        var inds = sliceIndices(v.length, step.start, step.end, step.step);
        for (k = 0; k < inds.length; k++) {
          out.push({ value: v[inds[k]], segs: node.segs.concat([{ type: "index", index: inds[k] }]) });
        }
      }
    } else if (step.kind === "recursive") {
      collectRecursive(node, step.key, out);
    }
  }
  return out;
}

function evaluate(data, expr) {
  var steps = parseExpression(expr);
  var nodes = applyStep ? [{ value: data, segs: [] }] : [];
  var s;
  for (s = 0; s < steps.length; s++) nodes = applyStep(nodes, steps[s]);
  return nodes.map(function (nd) {
    return { path: formatPath(nd.segs), value: nd.value, segments: nd.segs };
  });
}

/* ---------------- 校验入口与展示工具 ---------------- */

function parseJsonInput(text) {
  if (typeof text !== "string" || text.trim() === "") {
    return { ok: false, error: "请输入 JSON" };
  }
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: "JSON 解析失败：" + e.message };
  }
}

function validateExpression(text) {
  if (typeof text !== "string" || text.trim() === "") {
    return { ok: false, error: "请输入以 $ 开头的表达式" };
  }
  try {
    return { ok: true, steps: parseExpression(text) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function typeOf(v) {
  if (v === null) return "null";
  if (isArray(v)) return "array";
  return typeof v;
}

var TYPE_LABELS = {
  string: "字符串", number: "数字", boolean: "布尔",
  null: "空值", object: "对象", array: "数组"
};

function typeLabel(v) { return TYPE_LABELS[typeOf(v)] || "未知"; }

function previewValue(v) {
  var t = typeof v === "string" ? v : JSON.stringify(v);
  if (t === undefined) t = "undefined";
  return t.length > 500 ? t.slice(0, 500) + "…" : t;
}

function copyOneText(result) {
  return typeof result.value === "string" ? result.value : JSON.stringify(result.value);
}

function buildAllText(results) {
  return JSON.stringify(results.map(function (r) {
    return { path: r.path, value: r.value };
  }), null, 2);
}

/* 格式化 JSON 视图：每行带所属路径，供点击结果高亮 */
function prettyLines(value, depth, segs) {
  var pad = "";
  var d;
  for (d = 0; d < depth; d++) pad += "  ";
  var path = formatPath(segs);
  if (isArray(value)) {
    if (value.length === 0) return [{ text: "[]", path: path }];
    var lines = [{ text: "[", path: path }];
    for (var a = 0; a < value.length; a++) {
      var sub = prettyLines(value[a], depth + 1, segs.concat([{ type: "index", index: a }]));
      sub[0].text = pad + "  " + sub[0].text;
      if (a < value.length - 1) sub[sub.length - 1].text += ",";
      lines = lines.concat(sub);
    }
    lines.push({ text: pad + "]", path: path });
    return lines;
  }
  if (isObject(value)) {
    var keys = Object.keys(value);
    if (keys.length === 0) return [{ text: "{}", path: path }];
    var olines = [{ text: "{", path: path }];
    for (var o = 0; o < keys.length; o++) {
      var csub = prettyLines(value[keys[o]], depth + 1, segs.concat([{ type: "key", key: keys[o] }]));
      csub[0].text = pad + "  " + JSON.stringify(keys[o]) + ": " + csub[0].text;
      if (o < keys.length - 1) csub[csub.length - 1].text += ",";
      olines = olines.concat(csub);
    }
    olines.push({ text: pad + "}", path: path });
    return olines;
  }
  return [{ text: JSON.stringify(value), path: path }];
}

var SAMPLE_JSON = JSON.stringify({
  store: {
    book: [
      { category: "reference", author: "Nigel Rees", title: "Sayings of the Century", price: 8.95 },
      { category: "fiction", author: "Evelyn Waugh", title: "Sword of Honour", price: 12.99 },
      { category: "fiction", author: "Herman Melville", title: "Moby Dick", isbn: "0-553-21311-3", price: 8.99 },
      { category: "fiction", author: "J. R. R. Tolkien", title: "The Lord of the Rings", isbn: "0-395-19395-8", price: 22.99 }
    ],
    bicycle: { color: "red", price: 19.95 }
  }
}, null, 2);

var PRESETS = [
  "$.store.book[*].author",
  "$.store.book[2].title",
  "$..author",
  "$.store.book[-1].title",
  "$.store.book[0:2]",
  "$.store.bicycle.color"
];

var API = {
  parseExpression: parseExpression, evaluate: evaluate, formatPath: formatPath,
  sliceIndices: sliceIndices, parseJsonInput: parseJsonInput,
  validateExpression: validateExpression, typeOf: typeOf, typeLabel: typeLabel,
  previewValue: previewValue, copyOneText: copyOneText, buildAllText: buildAllText,
  prettyLines: prettyLines, SAMPLE_JSON: SAMPLE_JSON, PRESETS: PRESETS
};

if (typeof window !== "undefined") window.JSONPathTester = API;
if (typeof module !== "undefined" && module.exports) module.exports = API;

/* ---------------- 浏览器页面交互（仅浏览器） ---------------- */

if (typeof document !== "undefined") {
  var $ = function (id) { return document.getElementById(id); };
  var currentResults = [];
  var currentData = null;

  function toast(msg) {
    var t = $("jp-toast");
    if (!t) return;
    t.textContent = msg;
    t.style.display = "block";
    setTimeout(function () { t.style.display = "none"; }, 2200);
  }

  function copyText(text, okMsg) {
    function fallback() {
      toast("复制失败：请手动选择结果文本复制（浏览器未授予剪贴板权限）");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, fallback);
    } else {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        var done = document.execCommand("copy");
        document.body.removeChild(ta);
        if (done) toast(okMsg); else fallback();
      } catch (e) { fallback(); }
    }
  }

  function setMsg(text, isError) {
    var m = $("jp-msg");
    if (!m) return;
    m.textContent = text || "";
    m.style.color = isError ? "#dc2626" : "#374151";
  }

  function renderPretty() {
    var box = $("jp-pretty");
    if (!box) return;
    box.innerHTML = "";
    if (currentData === null || currentData === undefined) {
      box.textContent = "暂无可展示的 JSON：请先输入合法 JSON。";
      return;
    }
    var lines = prettyLines(currentData, 0, []);
    lines.forEach(function (ln) {
      var div = document.createElement("div");
      div.className = "jp-line";
      div.setAttribute("data-path", ln.path);
      div.textContent = ln.text;
      box.appendChild(div);
    });
  }

  function highlightPath(path) {
    var box = $("jp-pretty");
    if (!box) return;
    var nodes = box.querySelectorAll(".jp-line");
    var first = null;
    nodes.forEach(function (nd) {
      var on = nd.getAttribute("data-path") === path;
      nd.classList.toggle("jp-hl", on);
      if (on && !first) first = nd;
    });
    if (first) first.scrollIntoView({ block: "nearest" });
  }

  function renderResults() {
    var list = $("jp-results");
    var count = $("jp-count");
    if (!list) return;
    list.innerHTML = "";
    if (count) count.textContent = "共命中 " + currentResults.length + " 条";
    if (currentResults.length === 0) {
      var empty = document.createElement("div");
      empty.className = "jp-empty";
      empty.textContent = "无命中：表达式合法，但当前 JSON 中没有匹配项（缺失键会被跳过，不报错）。";
      list.appendChild(empty);
      return;
    }
    currentResults.forEach(function (r, idx) {
      var row = document.createElement("div");
      row.className = "jp-result-row";
      var head = document.createElement("div");
      head.className = "jp-row-head";
      var pathEl = document.createElement("button");
      pathEl.type = "button";
      pathEl.className = "jp-path";
      pathEl.textContent = r.path;
      pathEl.title = "点击在下方格式化 JSON 视图中高亮此路径";
      pathEl.addEventListener("click", function () { highlightPath(r.path); });
      var badge = document.createElement("span");
      badge.className = "jp-badge";
      badge.textContent = typeLabel(r.value);
      var copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "jp-btn";
      copyBtn.textContent = "复制此条";
      copyBtn.addEventListener("click", function () {
        copyText(copyOneText(r), "已复制第 " + (idx + 1) + " 条命中值");
      });
      head.appendChild(pathEl);
      head.appendChild(badge);
      head.appendChild(copyBtn);
      var val = document.createElement("div");
      val.className = "jp-value";
      if (isObject(r.value) || isArray(r.value)) {
        var det = document.createElement("details");
        var sum = document.createElement("summary");
        sum.textContent = previewValue(r.value);
        det.appendChild(sum);
        var pre = document.createElement("pre");
        pre.textContent = JSON.stringify(r.value, null, 2);
        det.appendChild(pre);
        val.appendChild(det);
      } else {
        val.textContent = previewValue(r.value);
      }
      row.appendChild(head);
      row.appendChild(val);
      list.appendChild(row);
    });
  }

  function recompute() {
    var jsonText = $("jp-json").value;
    var exprText = $("jp-expr").value;
    var parsed = parseJsonInput(jsonText);
    if (!parsed.ok) {
      currentData = null;
      currentResults = [];
      setMsg(parsed.error, true);
      renderResults();
      renderPretty();
      return;
    }
    currentData = parsed.data;
    var checked = validateExpression(exprText);
    if (!checked.ok) {
      currentResults = [];
      setMsg(checked.error, true);
      renderResults();
      renderPretty();
      return;
    }
    try {
      currentResults = evaluate(parsed.data, exprText);
      setMsg(currentResults.length === 0 ? "表达式合法，但当前 JSON 中没有匹配项。" : "", false);
    } catch (e) {
      currentResults = [];
      setMsg(e.message, true);
    }
    renderResults();
    renderPretty();
  }

  function init() {
    var jsonEl = $("jp-json");
    var exprEl = $("jp-expr");
    if (!jsonEl || !exprEl) return;
    jsonEl.addEventListener("input", recompute);
    exprEl.addEventListener("input", recompute);
    var sampleBtn = $("jp-sample");
    if (sampleBtn) sampleBtn.addEventListener("click", function () {
      jsonEl.value = SAMPLE_JSON;
      if (!exprEl.value) exprEl.value = PRESETS[0];
      recompute();
    });
    var clearBtn = $("jp-clear");
    if (clearBtn) clearBtn.addEventListener("click", function () {
      jsonEl.value = "";
      exprEl.value = "";
      recompute();
    });
    var presetBox = $("jp-presets");
    if (presetBox) {
      PRESETS.forEach(function (p) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "jp-preset";
        b.textContent = p;
        b.addEventListener("click", function () {
          exprEl.value = p;
          recompute();
        });
        presetBox.appendChild(b);
      });
    }
    var copyAll = $("jp-copy-all");
    if (copyAll) copyAll.addEventListener("click", function () {
      if (currentResults.length === 0) { toast("暂无可复制的命中结果"); return; }
      copyText(buildAllText(currentResults), "已复制全部 " + currentResults.length + " 条结果");
    });
    var dl = $("jp-download");
    if (dl) dl.addEventListener("click", function () {
      if (currentResults.length === 0) { toast("暂无可下载的命中结果"); return; }
      var blob = new Blob([buildAllText(currentResults) + "\n"], { type: "application/json;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "jsonpath-result.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
      toast("已下载 jsonpath-result.json");
    });
    if (!jsonEl.value) jsonEl.value = SAMPLE_JSON;
    if (!exprEl.value) exprEl.value = PRESETS[0];
    recompute();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
})();
