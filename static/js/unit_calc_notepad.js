/* 单位感知记事本计算器（unit_calc_notepad）：记事本式逐行算式＋单位感知计算
 *
 * 功能：
 *  1) 逐行输入算式，行内即时显示结果；非法行标红，不中断其余行
 *  2) 单位感知：长度（km/m/cm/mm/in/ft/mi）、重量（kg/g/t/lb/oz/斤）、
 *     体积（L/mL/m³/gal）、时间（h/min/s/d）、温度（℃↔℉↔K）、
 *     货币前缀（¥/$/€ 纯标签不参与换算）；加减自动归一化到最先出现的单位
 *  3) 行间变量：total = 5kg * 3，后续行可引用；sum(a1..a3) 范围汇总
 *  4) 百分比：5% of 200、200 + 5%、200 * 5%
 *  5) 单位转换：25C to F、10km -> m
 *  6) 底部汇总区：按维度分组的求和/平均/最大值/最小值/计数（仅统计非赋值行）
 * 自写词法＋递归下降解析，禁 eval；零 fetch/XHR。
 * 纯函数经 module.exports 暴露，node tests/unit_calc_notepad.test.js 自测；
 * 浏览器内 init 挂 DOMContentLoaded。
 */
(function () {
"use strict";

/* ================= 1. 单位表 =================
 * family 基准：length→m，mass→kg，volume→L，time→s，temp→℃（仿射，需特殊处理）
 * factor：1 单位 = factor 基准单位。温度单位带 toC/fromC。
 */
var UNITS = [
  { sym: "km", family: "length", factor: 1000,      aliases: ["千米", "公里"] },
  { sym: "m",  family: "length", factor: 1,         aliases: ["米"] },
  { sym: "cm", family: "length", factor: 0.01,      aliases: ["厘米", "公分"] },
  { sym: "mm", family: "length", factor: 0.001,     aliases: ["毫米"] },
  { sym: "in", family: "length", factor: 0.0254,    aliases: ["英寸"] },
  { sym: "ft", family: "length", factor: 0.3048,    aliases: ["英尺"] },
  { sym: "mi", family: "length", factor: 1609.344,  aliases: ["英里"] },
  { sym: "t",  family: "mass",   factor: 1000,      aliases: ["吨"] },
  { sym: "kg", family: "mass",   factor: 1,         aliases: ["千克", "公斤"] },
  { sym: "g",  family: "mass",   factor: 0.001,     aliases: ["克"] },
  { sym: "斤", family: "mass",   factor: 0.5,        aliases: [] },
  { sym: "lb", family: "mass",   factor: 0.45359237, aliases: ["磅"] },
  { sym: "oz", family: "mass",   factor: 0.028349523125, aliases: ["盎司"] },
  { sym: "m³", family: "volume", factor: 1000,      aliases: ["立方米"] },
  { sym: "L",  family: "volume", factor: 1,         aliases: ["升"] },
  { sym: "mL", family: "volume", factor: 0.001,    aliases: ["毫升"] },
  { sym: "gal",family: "volume", factor: 3.785411784, aliases: ["加仑"] },
  { sym: "d",  family: "time",   factor: 86400,     aliases: ["天"] },
  { sym: "h",  family: "time",   factor: 3600,      aliases: ["小时"] },
  { sym: "min",family: "time",   factor: 60,        aliases: ["分钟"] },
  { sym: "s",  family: "time",   factor: 1,         aliases: ["秒"] },
  { sym: "°C", family: "temp",   factor: 1,
    aliases: ["C", "℃", "摄氏度"],
    toC: function (v) { return v; },
    fromC: function (v) { return v; } },
  { sym: "°F", family: "temp",   factor: 1,
    aliases: ["F", "℉", "华氏度"],
    toC: function (v) { return (v - 32) * 5 / 9; },
    fromC: function (v) { return v * 9 / 5 + 32; } },
  { sym: "K",  family: "temp",   factor: 1,
    aliases: ["开尔文", "开氏度"],
    toC: function (v) { return v - 273.15; },
    fromC: function (v) { return v + 273.15; } }
];
/* 货币：纯标签，不参与换算（前缀 ¥100 或后缀 100¥ 均可） */
var MONEY_LABELS = { "¥": "¥", "￥": "¥", "$": "$", "€": "€" };
var FAMILY_CN = {
  length: "长度", mass: "重量", volume: "体积", time: "时间",
  temp: "温度", money: "金额", plain: "纯数字", mixed: "复合单位"
};
var RESERVED = { to: 1, of: 1 };

var UNIT_MAP = {};
var UNIT_NAMES = [];
(function buildUnitIndex() {
  var i, j, u, names;
  for (i = 0; i < UNITS.length; i++) {
    u = UNITS[i];
    names = [u.sym].concat(u.aliases);
    for (j = 0; j < names.length; j++) {
      if (!UNIT_MAP[names[j]]) { UNIT_MAP[names[j]] = u; UNIT_NAMES.push(names[j]); }
    }
  }
  /* 最长匹配优先：mL 在 m 之前、min 在 mi/m 之前、°C 在 C 之前 */
  UNIT_NAMES.sort(function (a, b) { return b.length - a.length; });
})();
function matchUnitAt(s) {
  var k, nm;
  for (k = 0; k < UNIT_NAMES.length; k++) {
    nm = UNIT_NAMES[k];
    if (s.indexOf(nm) === 0) return { unit: UNIT_MAP[nm], len: nm.length };
  }
  return null;
}

/* ================= 2. 词法 =================
 * token: num | unit | money | ident | op(+ - * / ( ) , % = ->) | range(..)
 * 单位只在数字之后绑定（可隔空格），其余位置的字母一律按标识符处理。
 */
var RE_NUM = /^(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/;
/* 标识符兼作单位目标：°/²/³/℃/℉ 可出现在标识符中，供 "to ℉" 这类转换目标使用 */
var RE_IDENT = /^[A-Za-z_°\u4e00-\u9fa5\u2103\u2109][A-Za-z0-9_°²³\u4e00-\u9fa5\u2103\u2109]*/;
var RE_KEYWORD_GUARD = /^(?:to|of)(?![A-Za-z0-9_\u4e00-\u9fa5])/;

function tokenize(src) {
  var tokens = [], i = 0, n = src.length, m, mu, ch, j;
  while (i < n) {
    ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\r") { i++; continue; }
    var two = src.substr(i, 2);
    if (two === "..") { tokens.push({ t: "range" }); i += 2; continue; }
    if (two === "->") { tokens.push({ t: "op", v: "->" }); i += 2; continue; }
    if ("+-*/(),%=".indexOf(ch) !== -1) { tokens.push({ t: "op", v: ch }); i++; continue; }
    if (MONEY_LABELS[ch]) { tokens.push({ t: "money", v: MONEY_LABELS[ch] }); i++; continue; }
    m = RE_NUM.exec(src.slice(i));
    if (m) {
      tokens.push({ t: "num", v: parseFloat(m[0]) });
      i += m[0].length;
      /* 数字后紧跟单位（允许空格，但 to/of 保留字优先，保证 "5 to kg" 不被切成 5t） */
      j = i;
      while (j < n && (src[j] === " " || src[j] === "\t")) j++;
      if (!RE_KEYWORD_GUARD.test(src.slice(j))) {
        mu = matchUnitAt(src.slice(j));
        if (mu) { tokens.push({ t: "unit", u: mu.unit }); i = j + mu.len; continue; }
        if (MONEY_LABELS[src[j]]) { tokens.push({ t: "money", v: MONEY_LABELS[src[j]] }); i = j + 1; continue; }
      }
      continue;
    }
    m = RE_IDENT.exec(src.slice(i));
    if (m) { tokens.push({ t: "ident", v: m[0] }); i += m[0].length; continue; }
    return { error: "无法识别的字符「" + ch + "」" };
  }
  return { tokens: tokens };
}

/* ================= 3. 数量模型 =================
 * Qty: { v: 基准值, parts: [{sym,f,fam,exp}] 显示单位, dimKey, label, temp, pct }
 * 基准：length→m，mass→kg，volume→L，time→s，temp→℃，money→标签原单位，plain→1
 */
function mkQty(v, parts, dimKey, label, temp) {
  return { v: v, parts: parts, dimKey: dimKey, label: label || null, temp: !!temp, pct: false };
}
function plainQty(v) { return mkQty(v, [], "", null, false); }
function dimKeyOf(famExp) {
  var ks = Object.keys(famExp).sort();
  if (!ks.length) return "";
  return ks.map(function (k) { return k + ":" + famExp[k]; }).join("|");
}
function partsDimKey(parts) {
  var fe = {}, i, p;
  for (i = 0; i < parts.length; i++) {
    p = parts[i];
    fe[p.fam] = (fe[p.fam] || 0) + p.exp;
    if (fe[p.fam] === 0) delete fe[p.fam];
  }
  return dimKeyOf(fe);
}
function mergeParts(pa, pb, sign) {
  var map = {}, i, p, key;
  function add(q, s) {
    var k = q.sym;
    if (!map[k]) map[k] = { sym: q.sym, f: q.f, fam: q.fam, exp: 0 };
    map[k].exp += s * q.exp;
  }
  for (i = 0; i < pa.length; i++) add(pa[i], 1);
  for (i = 0; i < pb.length; i++) add(pb[i], sign);
  var out = [];
  for (key in map) if (map[key].exp !== 0) out.push(map[key]);
  return out;
}
function withSameUnits(a, v) { return mkQty(v, a.parts, a.dimKey, a.label, a.temp); }
function dimNameOf(q) {
  if (q.label) return "金额(" + q.label + ")";
  if (q.dimKey === "") return "纯数字";
  var fams = q.dimKey.split("|").map(function (s) { return s.split(":")[0]; });
  if (fams.length === 1) return FAMILY_CN[fams[0]] || fams[0];
  return "复合单位";
}
function calcErr(msg) { throw new Error(msg); }

/* ================= 4. 递归下降解析 =================
 * line      := assignment | expr
 * assignment:= IDENT '=' expr
 * expr      := additive (('to' | '->') unitTarget)*
 * additive  := multiplicative (('+' | '-') multiplicative)*
 * multiplicative := unary (('*' | '/' | 'of') unary)*
 * unary     := '-' unary | '+' unary | postfix
 * postfix   := primary ('%')*
 * primary   := num [unit|money] | money num | IDENT | IDENT '(' args ')' | '(' expr ')'
 * args      := (range | expr) (',' (range | expr))*
 * range     := IDENT '..' IDENT
 */
function Parser(tokens) { this.toks = tokens; this.pos = 0; }
Parser.prototype.peek = function (n) { return this.toks[this.pos + (n || 0)] || null; };
Parser.prototype.next = function () { return this.toks[this.pos++] || null; };
Parser.prototype.parseLine = function () {
  if (!this.toks.length) return { kind: "empty" };
  var t0 = this.peek(), t1 = this.peek(1), t2 = this.peek(2);
  if (t0 && t0.t === "ident" && !RESERVED[t0.v] &&
      t1 && t1.t === "op" && t1.v === "=" &&
      !(t2 && t2.t === "op" && t2.v === "=")) {
    this.next(); this.next();
    var node = this.parseExpr();
    this.expectEnd();
    return { kind: "assign", name: t0.v, node: node };
  }
  var e = this.parseExpr();
  this.expectEnd();
  return { kind: "expr", node: e };
};
Parser.prototype.expectEnd = function () {
  var t = this.peek();
  if (t) {
    var what = t.t === "op" ? "「" + t.v + "」" : t.t === "ident" ? "「" + t.v + "」" : t.t;
    calcErr("多余的输入 " + what + "，算式写完后不能再跟内容");
  }
};
Parser.prototype.parseExpr = function () {
  var node = this.parseAdditive(), t;
  while ((t = this.peek()) &&
         ((t.t === "ident" && t.v === "to") || (t.t === "op" && t.v === "->"))) {
    this.next();
    node = { k: "conv", inner: node, target: this.parseUnitTarget() };
  }
  return node;
};
Parser.prototype.parseUnitTarget = function () {
  var t = this.next();
  if (t && t.t === "unit") return t.u;
  if (t && t.t === "ident" && UNIT_MAP[t.v]) return UNIT_MAP[t.v];
  calcErr("to 后面需要跟单位，如 to m、to kg");
  return null;
};
Parser.prototype.parseAdditive = function () {
  var left = this.parseMultiplicative(), t;
  while ((t = this.peek()) && t.t === "op" && (t.v === "+" || t.v === "-")) {
    this.next();
    left = { k: "bin", op: t.v, a: left, b: this.parseMultiplicative() };
  }
  return left;
};
Parser.prototype.parseMultiplicative = function () {
  var left = this.parseUnary(), t;
  for (;;) {
    t = this.peek();
    if (t && t.t === "op" && (t.v === "*" || t.v === "/")) {
      this.next();
      left = { k: "bin", op: t.v, a: left, b: this.parseUnary() };
    } else if (t && t.t === "ident" && t.v === "of") {
      this.next();
      left = { k: "bin", op: "of", a: left, b: this.parseUnary() };
    } else break;
  }
  return left;
};
Parser.prototype.parseUnary = function () {
  var t = this.peek();
  if (t && t.t === "op" && t.v === "-") { this.next(); return { k: "neg", inner: this.parseUnary() }; }
  if (t && t.t === "op" && t.v === "+") { this.next(); return this.parseUnary(); }
  return this.parsePostfix();
};
Parser.prototype.parsePostfix = function () {
  var node = this.parsePrimary(), t;
  while ((t = this.peek()) && t.t === "op" && t.v === "%") {
    this.next();
    node = { k: "pct", inner: node };
  }
  return node;
};
Parser.prototype.parsePrimary = function () {
  var t = this.next();
  if (!t) calcErr("算式不完整，此处需要数值、变量或括号");
  if (t.t === "money") {
    var tn = this.next();
    if (!tn || tn.t !== "num") calcErr("货币符号后需要跟数字，如 ¥100");
    if (this.peek() && this.peek().t === "unit") calcErr("货币不能再带其他单位");
    return { k: "money", label: t.v, v: tn.v };
  }
  if (t.t === "num") {
    var nt = this.peek();
    if (nt && nt.t === "unit") {
      this.next();
      return { k: "qty", num: t.v, unit: nt.u };
    }
    if (nt && nt.t === "money") {
      this.next();
      return { k: "money", label: nt.v, v: t.v };
    }
    return { k: "qty", num: t.v, unit: null };
  }
  if (t.t === "ident") {
    if (RESERVED[t.v]) calcErr("「" + t.v + "」是保留字，不能做变量名");
    var p = this.peek();
    if (p && p.t === "op" && p.v === "(") {
      this.next();
      return { k: "call", name: t.v, args: this.parseArgs() };
    }
    return { k: "var", name: t.v };
  }
  if (t.t === "op" && t.v === "(") {
    var e = this.parseExpr();
    var c = this.next();
    if (!c || c.t !== "op" || c.v !== ")") calcErr("括号未闭合，缺少 )");
    return e;
  }
  calcErr("此处需要数值、变量或括号，不能以「" + (t.v || t.t) + "」开头");
  return null;
};
Parser.prototype.parseArgs = function () {
  var args = [], t;
  t = this.peek();
  if (t && t.t === "op" && t.v === ")") { this.next(); return args; }
  for (;;) {
    var a = this.peek(), b = this.peek(1);
    if (a && a.t === "ident" && !RESERVED[a.v] && b && b.t === "range") {
      this.next(); this.next();
      var c = this.next();
      if (!c || c.t !== "ident") calcErr("a1..a3 范围写法中 .. 后面需要变量名");
      args.push({ k: "range", from: a.v, to: c.v });
    } else {
      args.push(this.parseExpr());
    }
    t = this.peek();
    if (t && t.t === "op" && t.v === ",") { this.next(); continue; }
    if (t && t.t === "op" && t.v === ")") { this.next(); break; }
    calcErr("函数参数之间请用逗号分隔，并以 ) 结尾");
  }
  return args;
};

/* ================= 5. 求值 ================= */
function evalQty(num, unit) {
  if (!unit) return plainQty(num);
  if (unit.family === "temp") {
    return mkQty(unit.toC(num),
      [{ sym: unit.sym, f: 1, fam: "temp", exp: 1 }], "temp:1", null, true);
  }
  return mkQty(num * unit.factor,
    [{ sym: unit.sym, f: unit.factor, fam: unit.family, exp: 1 }],
    unit.family + ":1", null, false);
}
function evalBin(op, a, b) {
  var s, v, parts, fe, label;
  if (op === "+" || op === "-") {
    s = op === "+" ? 1 : -1;
    /* 百分比：200 + 5% → 210（5% 取左操作数的百分之五） */
    if (b.pct && b.dimKey === "" && !b.label) return withSameUnits(a, a.v + s * a.v * b.v);
    if (a.pct || b.pct) { /* 一侧是裸百分数但另一侧带单位：按无量纲参与 */ }
    if (a.dimKey !== b.dimKey)
      calcErr("单位维度不一致：「" + dimNameOf(a) + "」与「" + dimNameOf(b) + "」不能相加减");
    if (a.label !== b.label) calcErr("货币符号不一致：「" + a.label + "」与「" + b.label + "」不能相加减");
    return withSameUnits(a, a.v + s * b.v);
  }
  if (op === "*" || op === "of") {
    if (a.temp || b.temp) {
      if (a.temp && b.temp) calcErr("温度不能相乘");
      var t = a.temp ? a : b, o = a.temp ? b : a;
      if (o.dimKey !== "" || o.label) calcErr("温度只能与纯数字相乘除");
      return withSameUnits(t, t.v * o.v);
    }
    if (a.label && b.label) calcErr("货币不能相乘");
    parts = mergeParts(a.parts, b.parts, 1);
    return mkQty(a.v * b.v, parts, partsDimKey(parts), a.label || b.label, false);
  }
  if (op === "/") {
    if (b.v === 0) calcErr("除数不能为零");
    if (a.temp || b.temp) {
      if (a.temp && b.temp) return plainQty(a.v / b.v);
      if (a.temp && b.dimKey === "" && !b.label) return withSameUnits(a, a.v / b.v);
      calcErr("温度不能做除数，两个温度相除得无量纲比值");
    }
    if (a.label && b.label) return plainQty(a.v / b.v);
    parts = mergeParts(a.parts, b.parts, -1);
    return mkQty(a.v / b.v, parts, partsDimKey(parts), a.label || b.label, false);
  }
  calcErr("未知运算符");
  return null;
}
function evalConv(inner, target) {
  var q = inner;
  if (q.label) calcErr("货币 " + q.label + " 仅为标签，不参与换算");
  if (q.temp) {
    if (target.family !== "temp") calcErr("温度只能转换为温度单位（℃/℉/K）");
    return mkQty(q.v, [{ sym: target.sym, f: 1, fam: "temp", exp: 1 }], "temp:1", null, true);
  }
  if (q.dimKey === "") {
    return mkQty(q.v * target.factor,
      [{ sym: target.sym, f: target.factor, fam: target.family, exp: 1 }],
      target.family + ":1", null, false);
  }
  var fams = q.dimKey.split("|");
  if (fams.length !== 1 || fams[0].split(":")[1] !== "1")
    calcErr("只有单一单位的量才能转换（如 10km to m）");
  var fam = fams[0].split(":")[0];
  if (target.family === "temp" || fam !== target.family)
    calcErr("无法将「" + (FAMILY_CN[fam] || fam) + "」转换为「" + (FAMILY_CN[target.family] || target.family) + "」");
  return mkQty(q.v,
    [{ sym: target.sym, f: target.factor, fam: target.family, exp: 1 }],
    target.family + ":1", null, false);
}
var FN_NAMES = { sum: 1, avg: 1, max: 1, min: 1, count: 1 };
function expandRange(r, env) {
  var m1 = /^(.*?)([0-9]+)$/.exec(r.from), m2 = /^(.*?)([0-9]+)$/.exec(r.to);
  if (!m1 || !m2 || m1[1] !== m2[1])
    calcErr("范围写法应为 同名前缀+连续编号，如 sum(a1..a3)");
  var prefix = m1[1], n1 = parseInt(m1[2], 10), n2 = parseInt(m2[2], 10), i, out = [];
  if (n1 > n2) calcErr("范围 " + r.from + ".." + r.to + " 起止颠倒");
  if (n2 - n1 > 1000) calcErr("范围过大（最多 1000 个）");
  for (i = n1; i <= n2; i++) {
    var nm = prefix + i;
    if (!Object.prototype.hasOwnProperty.call(env, nm)) calcErr("变量「" + nm + "」未定义");
    out.push(env[nm]);
  }
  return out;
}
function checkSameDimForFn(name, vals) {
  var i;
  for (i = 1; i < vals.length; i++) {
    if (vals[i].dimKey !== vals[0].dimKey || vals[i].label !== vals[0].label)
      calcErr(name + " 的参数单位维度不一致");
  }
}
function evalCall(name, args, env) {
  if (!FN_NAMES[name]) calcErr("未知函数「" + name + "」，可用：sum/avg/max/min/count");
  var vals = [], i, a;
  for (i = 0; i < args.length; i++) {
    a = args[i];
    if (a.k === "range") vals = vals.concat(expandRange(a, env));
    else vals.push(evalNode(a, env));
  }
  if (!vals.length) calcErr(name + " 至少需要 1 个参数");
  if (name === "count") return plainQty(vals.length);
  checkSameDimForFn(name, vals);
  var v0 = vals[0], r = v0.v;
  if (name === "sum") { for (i = 1; i < vals.length; i++) r += vals[i].v; }
  else if (name === "avg") { for (i = 1; i < vals.length; i++) r += vals[i].v; r /= vals.length; }
  else if (name === "max") { for (i = 1; i < vals.length; i++) if (vals[i].v > r) r = vals[i].v; }
  else if (name === "min") { for (i = 1; i < vals.length; i++) if (vals[i].v < r) r = vals[i].v; }
  return withSameUnits(v0, r);
}
function evalNode(node, env) {
  var q, i;
  switch (node.k) {
    case "qty": return evalQty(node.num, node.unit);
    case "money": return mkQty(node.v, [], "money:1", node.label, false);
    case "var":
      if (!Object.prototype.hasOwnProperty.call(env, node.name))
        calcErr("变量「" + node.name + "」未定义，请先用「" + node.name + " = …」赋值");
      return env[node.name];
    case "neg": q = evalNode(node.inner, env); return withSameUnits(q, -q.v);
    case "pct":
      q = evalNode(node.inner, env);
      if (q.dimKey !== "" || q.label) calcErr("百分号 % 只能用于无量纲数字");
      var pq = plainQty(q.v / 100); pq.pct = true; return pq;
    case "bin": return evalBin(node.op, evalNode(node.a, env), evalNode(node.b, env));
    case "conv": return evalConv(evalNode(node.inner, env), node.target);
    case "call": return evalCall(node.name, node.args, env);
    default: calcErr("内部错误：未知节点"); return null;
  }
}
function isValidName(name) { return RE_IDENT.test(name) && !RESERVED[name] && !UNIT_MAP[name]; }

/* 行注释：# 或 // 之后整行忽略 */
function stripComment(line) {
  var hi = line.indexOf("#"), si = line.indexOf("//"), ci = -1;
  if (hi !== -1 && si !== -1) ci = Math.min(hi, si);
  else ci = hi !== -1 ? hi : si;
  return ci === -1 ? line : line.slice(0, ci);
}
function evaluateLine(line, env) {
  var cut = stripComment(line);
  if (!cut.replace(/[\s\t\r]+/g, "")) return { type: "empty" };
  var tk = tokenize(cut);
  if (tk.error) return { type: "error", error: tk.error };
  try {
    var p = new Parser(tk.tokens);
    var parsed = p.parseLine();
    if (parsed.kind === "empty") return { type: "empty" };
    var q = evalNode(parsed.node, env);
    if (!isFinite(q.v)) return { type: "error", error: "计算结果溢出" };
    if (parsed.kind === "assign") {
      if (!isValidName(parsed.name)) return { type: "error", error: "「" + parsed.name + "」不能做变量名" };
      env[parsed.name] = q;
      return { type: "ok", qty: q, isAssign: true, varName: parsed.name };
    }
    return { type: "ok", qty: q, isAssign: false };
  } catch (e) {
    return { type: "error", error: String((e && e.message) || e) };
  }
}
var MAX_LINES = 2000;
function evaluateAll(lines) {
  var env = {}, out = [], i, n = Math.min(lines.length, MAX_LINES);
  for (i = 0; i < n; i++) out.push(evaluateLine(lines[i], env));
  return { results: out, truncated: lines.length > MAX_LINES, env: env };
}

/* ================= 6. 格式化 ================= */
function fmtNum(x) {
  if (!isFinite(x)) return "—";
  if (x === 0) return "0";
  var ax = Math.abs(x), s;
  if (ax >= 1e13 || ax < 1e-9) s = x.toExponential(6).replace(/(\.\d*?)0+e/, "$1e").replace(/\.e/, "e");
  else s = String(Number(x.toPrecision(10)));
  return s;
}
function supExp(e) {
  e = Math.abs(e);
  if (e === 1) return "";
  if (e === 2) return "²";
  if (e === 3) return "³";
  return "^" + e;
}
function fmtQty(q) {
  var i, p, dv, num = [], den = [];
  if (q.label) return q.label + fmtNum(q.v);
  if (q.temp) {
    var sym = q.parts.length ? q.parts[0].sym : "°C";
    if (sym === "°F") dv = q.v * 9 / 5 + 32;
    else if (sym === "K") { dv = q.v + 273.15; return fmtNum(dv) + " " + sym; }
    else dv = q.v;
    return fmtNum(dv) + sym;
  }
  if (q.dimKey === "") return fmtNum(q.v);
  dv = q.v;
  for (i = 0; i < q.parts.length; i++) {
    p = q.parts[i];
    dv /= Math.pow(p.f, p.exp);
    (p.exp > 0 ? num : den).push(p.sym + supExp(p.exp));
  }
  var symStr = num.join("·") + (den.length ? "/" + den.join("·") : "");
  return fmtNum(dv) + " " + symStr;
}

/* ================= 7. 汇总 =================
 * 仅统计非赋值的成功表达式行，按维度分组。
 */
function groupTitleOf(q) {
  if (q.label) return "金额";
  if (q.temp) return "温度";
  if (q.dimKey === "") return "纯数字";
  var fams = q.dimKey.split("|").map(function (s) { return s.split(":")[0]; });
  if (fams.length === 1) return FAMILY_CN[fams[0]] || fams[0];
  return "复合单位";
}
function summarize(results) {
  var groups = [], idx = {}, i, r, key, g;
  for (i = 0; i < results.length; i++) {
    r = results[i];
    if (r.type !== "ok" || r.isAssign) continue;
    key = (r.qty.label || "") + "|" + r.qty.dimKey;
    g = idx[key];
    if (!g) {
      g = {
        key: key, title: groupTitleOf(r.qty), count: 0,
        sumV: 0, maxQ: null, minQ: null, sample: r.qty
      };
      idx[key] = g; groups.push(g);
    }
    g.count++;
    g.sumV += r.qty.v;
    if (!g.maxQ || r.qty.v > g.maxQ.v) g.maxQ = r.qty;
    if (!g.minQ || r.qty.v < g.minQ.v) g.minQ = r.qty;
  }
  return groups.map(function (x) {
    return {
      title: x.title, count: x.count,
      sum: fmtQty(withSameUnits(x.sample, x.sumV)),
      avg: fmtQty(withSameUnits(x.sample, x.sumV / x.count)),
      max: fmtQty(withSameUnits(x.sample, x.maxQ.v)),
      min: fmtQty(withSameUnits(x.sample, x.minQ.v))
    };
  });
}

/* ================= 8. DOM 绑定 ================= */
var LS_KEY = "tw_unit_calc_notepad_input_v1";
function hasDOM() { return typeof document !== "undefined" && typeof window !== "undefined"; }
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
var EXAMPLE_PACK =
  "# 快递打包：3 个包裹称重\n" +
  "p1 = 2.5kg\n" +
  "p2 = 1800g\n" +
  "p3 = 3斤\n" +
  "total = p1 + p2 + p3\n" +
  "纸箱重 = 0.5kg\n" +
  "毛重 = total + 纸箱重\n" +
  "sum(p1..p3)";
var EXAMPLE_RENO =
  "# 装修量房：客厅\n" +
  "长 = 5.6m\n" +
  "宽 = 4.2m\n" +
  "面积 = 长 * 宽\n" +
  "周长 = (长 + 宽) * 2\n" +
  "踢脚线 = 周长 - 1.5m\n" +
  "地板 = 面积 * 1.08";
var EXAMPLE_DEFAULT =
  "# 单位感知记事本：每行写一个算式，右侧即时出结果\n" +
  "5kg * 3\n" +
  "10km + 500m\n" +
  "25C to F\n" +
  "total = 5kg * 3\n" +
  "total / 2";

function renderAll() {
  var input = $("uc-input"), resBox = $("uc-results"), sumBox = $("uc-summary");
  if (!input || !resBox) return;
  var text = input.value;
  if (text.length > 60000) text = text.slice(0, 60000);
  var lines = text.split("\n");
  var ev = evaluateAll(lines), i, r, html = "";
  for (i = 0; i < ev.results.length; i++) {
    r = ev.results[i];
    if (r.type === "empty") html += '<div class="uc-row">&nbsp;</div>';
    else if (r.type === "error")
      html += '<div class="uc-row uc-err"><span class="uc-errico">⚠</span><span>' + esc(r.error) + "</span></div>";
    else
      html += '<div class="uc-row uc-ok"><span class="uc-eq">=</span><span>' + esc(fmtQty(r.qty)) + "</span></div>";
  }
  if (ev.truncated) html += '<div class="uc-row uc-err"><span>…仅计算前 ' + MAX_LINES + " 行</span></div>";
  resBox.innerHTML = html;
  resBox.scrollTop = input.scrollTop;
  /* 汇总 */
  var groups = summarize(ev.results), gh = "";
  if (!groups.length) {
    gh = '<div class="uc-sumempty">在左侧输入算式后，这里会按单位维度分组显示求和 / 平均 / 最大值 / 最小值 / 计数（赋值行不计入汇总）。</div>';
  } else {
    for (i = 0; i < groups.length; i++) {
      var g = groups[i];
      gh += '<div class="uc-card"><div class="uc-cardt">' + esc(g.title) + '</div>' +
        '<div class="uc-stat"><span>计数</span><b>' + g.count + "</b></div>" +
        '<div class="uc-stat"><span>求和</span><b>' + esc(g.sum) + "</b></div>" +
        '<div class="uc-stat"><span>平均</span><b>' + esc(g.avg) + "</b></div>" +
        '<div class="uc-stat"><span>最大值</span><b>' + esc(g.max) + "</b></div>" +
        '<div class="uc-stat"><span>最小值</span><b>' + esc(g.min) + "</b></div></div>";
    }
  }
  if (sumBox) sumBox.innerHTML = gh;
  try { localStorage.setItem(LS_KEY, input.value); } catch (e) {}
}
function init() {
  var input = $("uc-input");
  if (!input) return;
  var saved = null;
  try { saved = localStorage.getItem(LS_KEY); } catch (e) {}
  input.value = saved != null ? saved : EXAMPLE_DEFAULT;
  var timer = null;
  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(renderAll, 120);
  }
  input.addEventListener("input", schedule);
  input.addEventListener("scroll", function () { var rb = $("uc-results"); if (rb) rb.scrollTop = input.scrollTop; });
  function fillExample(t) { input.value = t; renderAll(); input.focus(); }
  var b1 = $("uc-ex-pack"), b2 = $("uc-ex-reno"), b3 = $("uc-clear");
  if (b1) b1.addEventListener("click", function () { fillExample(EXAMPLE_PACK); });
  if (b2) b2.addEventListener("click", function () { fillExample(EXAMPLE_RENO); });
  if (b3) b3.addEventListener("click", function () { fillExample(""); });
  renderAll();
}
if (hasDOM()) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}

/* ================= 9. 导出（供 node 测试） ================= */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    UNITS: UNITS, UNIT_MAP: UNIT_MAP, MONEY_LABELS: MONEY_LABELS,
    tokenize: tokenize, Parser: Parser,
    evaluateLine: evaluateLine, evaluateAll: evaluateAll,
    summarize: summarize, fmtNum: fmtNum, fmtQty: fmtQty,
    esc: esc, MAX_LINES: MAX_LINES,
    EXAMPLE_PACK: EXAMPLE_PACK, EXAMPLE_RENO: EXAMPLE_RENO
  };
}
})();
