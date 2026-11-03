/* 三角形几何求解器 - 纯前端工具：
 * ① 输入：任意三个已知量（a/b/c 边、A/B/C 角），至少包含一条边
 * ② 组合自动识别：SSS（三边）/ SAS（两边夹角）/ ASA（两角夹边）/
 *    AAS（两角及一角对边）/ SSA（两边及其中一边对角）
 * ③ 正弦/余弦定理求解全部边角＋面积（海伦公式）＋周长＋SVG 真实比例示意图
 * ④ 角度制/弧度制切换；SSA 歧义情形输出两组解，无解时明确抛错
 * ⑤ 示例一键填充＋一键复制结果＋localStorage 本地保存，纯前端零上传
 *
 * 纯函数契约（浏览器/Node 通用；非法参数抛 Error，err.field 给出字段名，不静默钳制）：
 * solveTriangle({a,b,c,A,B,C}, unit)
 * -> {sides, angles, area, perimeter, solutions, ambiguous}。
 *   已知量不足/组合非法/无解抛 Error：单个边角非法时 err.field 为该字段名
 *   （'a'/'b'/'c'/'A'/'B'/'C'），unit 非法时 err.field='unit'，其余组合问题
 *   err.field='input'。unit='deg'（默认）或 'rad'：决定角度输入与输出的单位。
 *   solutions 为 1~2 个解 {sides:{a,b,c}, angles:{A,B,C}, area, perimeter}；
 *   ambiguous=true 当且仅当 SSA 输出两组解；顶层 sides/angles/area/perimeter
 *   取 solutions[0]（SSA 时为锐角解）。
 * solveSSS(knowns, unit) / solveSAS(knowns, unit) /
 * solveASA(knowns, unit) / solveSSA(knowns, unit)
 * -> {mode, sides, angles, area, perimeter, solutions, ambiguous}
 *   单模式求解器（solveASA 同时覆盖 ASA 与 AAS）。
 * toRadians(deg) / toDegrees(rad)：单位换算。
 * triangleSVG(solution, opts)：solution={sides:{a,b,c}, angles:{A,B,C}（角度制）}
 * -> SVG 字符串（真实比例示意图，含顶点/边长/角度弧标注），纯字符串拼接，Node 可用。
 *
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；挂 window.TriangleSolver。
 * Node 自测：module.exports 暴露纯函数。
 */
(function () {
'use strict';

/* ---------------- 基础工具 ---------------- */

var PI = Math.PI;
var EPS = 1e-12;

function mkErr(field, msg) {
  var e = new Error(msg);
  e.field = field;
  return e;
}

function clamp1(x) {
  return x < -1 ? -1 : (x > 1 ? 1 : x);
}

function checkUnit(unit) {
  if (unit === undefined || unit === null || unit === '') { return 'deg'; }
  if (unit !== 'deg' && unit !== 'rad') {
    throw mkErr('unit', "unit 必须为 'deg'（角度制）或 'rad'（弧度制）");
  }
  return unit;
}

/* 角度单位换算 */
function toRadians(deg) {
  if (typeof deg !== 'number' || !isFinite(deg)) {
    throw mkErr('angle', '角度必须为有限数字');
  }
  return deg * PI / 180;
}

function toDegrees(rad) {
  if (typeof rad !== 'number' || !isFinite(rad)) {
    throw mkErr('angle', '弧度必须为有限数字');
  }
  return rad * 180 / PI;
}

function checkSide(v, field) {
  if (typeof v !== 'number' || !isFinite(v)) {
    throw mkErr(field, '边长 ' + field + ' 必须为有限数字');
  }
  if (v <= 0) {
    throw mkErr(field, '边长 ' + field + ' 必须为正数');
  }
  return v;
}

/* 把输入单位制的角度转弧度并校验 (0, π) */
function normAngle(v, field, unit) {
  if (typeof v !== 'number' || !isFinite(v)) {
    throw mkErr(field, '角度 ' + field + ' 必须为有限数字');
  }
  var r = unit === 'deg' ? toRadians(v) : v;
  if (r <= 0 || r >= PI) {
    throw mkErr(field, '角度 ' + field + ' 必须在 (0, 180°) 区间内');
  }
  return r;
}

/* 解析已知量：undefined/null/'' 视为未知 */
function parseKnowns(raw, unit) {
  if (!raw || typeof raw !== 'object') {
    throw mkErr('input', '已知量必须为对象 {a,b,c,A,B,C}');
  }
  unit = checkUnit(unit);
  var sides = {}, angles = {}, sideKeys = [], angleKeys = [];
  ['a', 'b', 'c'].forEach(function (k) {
    var v = raw[k];
    if (v === undefined || v === null || v === '') { return; }
    sides[k] = checkSide(v, k);
    sideKeys.push(k);
  });
  ['A', 'B', 'C'].forEach(function (k) {
    var v = raw[k];
    if (v === undefined || v === null || v === '') { return; }
    angles[k] = normAngle(v, k, unit);
    angleKeys.push(k);
  });
  return { sides: sides, angles: angles, sideKeys: sideKeys, angleKeys: angleKeys, unit: unit };
}

/* 两边 key（排序后）-> 其夹角 key */
var INCLUDED_ANGLE = { 'a,b': 'C', 'a,c': 'B', 'b,c': 'A' };
/* 边 key -> 与之相邻的两角（即该边所夹的两角） */
var ADJACENT_ANGLES = { a: ['B', 'C'], b: ['A', 'C'], c: ['A', 'B'] };

function sortedJoin(arr) {
  return arr.slice().sort().join(',');
}

/* 组合识别：SSS / SAS / ASA / AAS / SSA */
function detectMode(p) {
  var n = p.sideKeys.length + p.angleKeys.length;
  if (n < 3) {
    throw mkErr('input', '至少需要输入 3 个已知量（当前仅 ' + n + ' 个），且至少包含一条边');
  }
  if (p.sideKeys.length === 0) {
    throw mkErr('input', '仅知三个角无法确定三角形大小：至少需要一条边');
  }
  if (p.sideKeys.length === 3) { return 'SSS'; }
  if (p.sideKeys.length === 2) {
    var pair = sortedJoin(p.sideKeys.slice(0, 2));
    var ak = p.angleKeys[0];
    return INCLUDED_ANGLE[pair] === ak ? 'SAS' : 'SSA';
  }
  /* 1 条边 + 2 个角（或更多已知量时取前两个角）：边若介于两角之间为 ASA，否则为 AAS */
  var s = p.sideKeys[0];
  var aks = p.angleKeys.slice(0, 2);
  return sortedJoin(ADJACENT_ANGLES[s]) === sortedJoin(aks) ? 'ASA' : 'AAS';
}

/* 海伦公式求面积 */
function areaHeron(a, b, c) {
  var s = (a + b + c) / 2;
  var t = s * (s - a) * (s - b) * (s - c);
  return Math.sqrt(Math.max(t, 0));
}

/* 组装单个解：内部一律用弧度，输出按 unit 换算角度 */
function finalize(a, b, c, Arad, Brad, Crad, unit) {
  var cv = unit === 'deg' ? toDegrees : function (x) { return x; };
  return {
    sides: { a: a, b: b, c: c },
    angles: { A: cv(Arad), B: cv(Brad), C: cv(Crad) },
    area: areaHeron(a, b, c),
    perimeter: a + b + c
  };
}

function envelope(mode, solutions, ambiguous) {
  var s0 = solutions[0];
  return {
    mode: mode,
    sides: s0.sides,
    angles: s0.angles,
    area: s0.area,
    perimeter: s0.perimeter,
    solutions: solutions,
    ambiguous: ambiguous
  };
}

/* ---------------- 单模式求解器 ---------------- */

/* SSS：三边 -> 余弦定理求三角 */
function solveSSS(knowns, unit) {
  var p = parseKnowns(knowns, unit);
  unit = p.unit;
  if (!(p.sides.a && p.sides.b && p.sides.c)) {
    throw mkErr('input', 'SSS 需要已知三条边 a、b、c');
  }
  var a = p.sides.a, b = p.sides.b, c = p.sides.c;
  if (!(a < b + c - EPS && b < a + c - EPS && c < a + b - EPS)) {
    throw mkErr('input', '三条边不满足三角形不等式：任意两边之和必须大于第三边');
  }
  var A = Math.acos(clamp1((b * b + c * c - a * a) / (2 * b * c)));
  var B = Math.acos(clamp1((a * a + c * c - b * b) / (2 * a * c)));
  var C = PI - A - B;
  return envelope('SSS', [finalize(a, b, c, A, B, C, unit)], false);
}

/* SAS：两边及夹角 -> 先余弦定理求对边，再余弦定理求一角、角和求末角 */
function solveSAS(knowns, unit) {
  var p = parseKnowns(knowns, unit);
  unit = p.unit;
  if (p.sideKeys.length < 2 || p.angleKeys.length < 1) {
    throw mkErr('input', 'SAS 需要已知两边及其夹角');
  }
  var sk = p.sideKeys.slice(0, 2).sort();
  var pair = sk.join(',');
  var ak = INCLUDED_ANGLE[pair];
  if (p.angleKeys.indexOf(ak) === -1) {
    throw mkErr('input', 'SAS 要求已知角为两边的夹角：边 ' + sk[0] + '、' + sk[1] +
      ' 的夹角是 ' + ak + '，请补填角 ' + ak + '（若已知的是对角，请按 SSA 求解）');
  }
  var s1 = p.sides[sk[0]], s2 = p.sides[sk[1]];
  var ang = p.angles[ak];
  var third = 'abc'.replace(sk[0], '').replace(sk[1], '');
  var s3 = Math.sqrt(Math.max(s1 * s1 + s2 * s2 - 2 * s1 * s2 * Math.cos(ang), 0));
  if (s3 <= EPS) {
    throw mkErr('input', 'SAS 退化：已知两边与夹角求得对边为 0');
  }
  /* 求两未知角：sk[0] 对角用余弦定理，sk[1] 对角用角和（夹角 ak 已知） */
  var angOpp1 = Math.acos(clamp1((s2 * s2 + s3 * s3 - s1 * s1) / (2 * s2 * s3)));
  var angOpp2 = PI - ang - angOpp1;
  var sides = {}, angs = {};
  sides[sk[0]] = s1; sides[sk[1]] = s2; sides[third] = s3;
  angs[ak] = ang;
  angs[sk[0].toUpperCase()] = angOpp1;
  angs[sk[1].toUpperCase()] = angOpp2;
  return envelope('SAS',
    [finalize(sides.a, sides.b, sides.c, angs.A, angs.B, angs.C, unit)], false);
}

/* ASA / AAS：一边两角 -> 角和求第三角，正弦定理求另两边 */
function solveASA(knowns, unit) {
  var p = parseKnowns(knowns, unit);
  unit = p.unit;
  if (p.sideKeys.length < 1 || p.angleKeys.length < 2) {
    throw mkErr('input', 'ASA/AAS 需要已知一边与两角');
  }
  var s = p.sideKeys[0];
  var aks = p.angleKeys.slice(0, 2);
  var X = aks[0], Y = aks[1];
  var Z = 'ABC'.replace(X, '').replace(Y, '');
  var Xr = p.angles[X], Yr = p.angles[Y];
  var Zr = PI - Xr - Yr;
  if (Zr <= EPS) {
    throw mkErr('input', 'ASA/AAS 无解：已知两角之和必须小于 180°');
  }
  var knownSide = p.sides[s];
  var angs = {};
  angs[X] = Xr; angs[Y] = Yr; angs[Z] = Zr;
  /* 已知边所对的角：可能是刚算出的第三角（如 ASA 中边 c 对角 C） */
  var knownAngR = angs[s.toUpperCase()];
  var d2r = knownSide / Math.sin(knownAngR); /* 2R：外接圆直径 */
  var sides = {};
  sides.a = d2r * Math.sin(angs.A);
  sides.b = d2r * Math.sin(angs.B);
  sides.c = d2r * Math.sin(angs.C);
  var mode = sortedJoin(ADJACENT_ANGLES[s]) === sortedJoin(aks) ? 'ASA' : 'AAS';
  return envelope(mode,
    [finalize(sides.a, sides.b, sides.c, angs.A, angs.B, angs.C, unit)], false);
}

/* SSA：两边及其中一边对角 -> 正弦定理，可能 0/1/2 个解 */
function solveSSA(knowns, unit) {
  var p = parseKnowns(knowns, unit);
  unit = p.unit;
  if (p.sideKeys.length < 2 || p.angleKeys.length < 1) {
    throw mkErr('input', 'SSA 需要已知两边及其中一边的对角');
  }
  var sk = p.sideKeys.slice(0, 2).sort();
  var ak = p.angleKeys[0];
  if (INCLUDED_ANGLE[sk.join(',')] === ak) {
    throw mkErr('input', '这是 SAS（夹角）情形而非 SSA：边 ' + sk[0] + '、' + sk[1] +
      ' 的夹角正是 ' + ak + '，请按 SAS 求解');
  }
  var opp = ak.toLowerCase(); /* 已知角的对边，必须已知 */
  if (sk.indexOf(opp) === -1) {
    throw mkErr('input', 'SSA 需要已知角所对的边：角 ' + ak + ' 的对边 ' + opp + ' 未知');
  }
  var adj = sk[0] === opp ? sk[1] : sk[0]; /* 另一条已知边 */
  var third = 'abc'.replace(opp, '').replace(adj, '');
  var a = p.sides[opp];
  var Ar = p.angles[ak];
  var cc = p.sides[adj];
  var sinA = Math.sin(Ar);
  /* 正弦定理：sin(角adj) = adj边 * sinA / a */
  var k = cc * sinA / a;
  if (k > 1 + 1e-9) {
    throw mkErr('input', 'SSA 无解：边 ' + opp + '（=' + a + '）太短，够不到边 ' +
      adj + '（=' + cc + '）的端点（需要 ' + opp + ' ≥ ' + adj + '·sin' + ak +
      ' ≈ ' + (Math.round(cc * sinA * 1e4) / 1e4) + '）');
  }
  var oppAng = adj.toUpperCase();   /* 待求的角：adj 边的对角 */
  var thirdAng = third.toUpperCase();
  var sols = [];
  function pushSol(Crad) {
    if (Ar + Crad >= PI - 1e-9) { return; } /* 钝角第二解若使角和 ≥180° 则舍去 */
    var Brad = PI - Ar - Crad;
    var b = a * Math.sin(Brad) / sinA;
    var sides = {}, angs = {};
    sides[opp] = a; sides[adj] = cc; sides[third] = b;
    angs[ak] = Ar; angs[oppAng] = Crad; angs[thirdAng] = Brad;
    sols.push(finalize(sides.a, sides.b, sides.c, angs.A, angs.B, angs.C, unit));
  }
  var cAcute = Math.asin(Math.min(k, 1));
  pushSol(cAcute);                       /* 锐角解 */
  if (k < 1 - 1e-9) { pushSol(PI - cAcute); } /* 钝角第二解（角和校验在 pushSol 内） */
  if (sols.length === 0) {
    throw mkErr('input', 'SSA 无解：已知量无法构成三角形');
  }
  return envelope('SSA', sols, sols.length === 2);
}

/* 总入口：自动识别组合并分发 */
function solveTriangle(knowns, unit) {
  unit = checkUnit(unit);
  var p = parseKnowns(knowns, unit);
  var mode = detectMode(p);
  var r = mode === 'SSS' ? solveSSS(knowns, unit)
    : mode === 'SAS' ? solveSAS(knowns, unit)
    : (mode === 'ASA' || mode === 'AAS') ? solveASA(knowns, unit)
    : solveSSA(knowns, unit);
  return {
    sides: r.sides,
    angles: r.angles,
    area: r.area,
    perimeter: r.perimeter,
    solutions: r.solutions,
    ambiguous: r.ambiguous
  };
}

/* ---------------- SVG 真实比例示意图 ---------------- */

/* 数字格式化：保留 4 位小数并去尾零 */
function fmtNum(x) {
  if (typeof x !== 'number' || !isFinite(x)) { return ''; }
  var r = Math.round(x * 10000) / 10000;
  var s = String(r);
  if (s.indexOf('.') !== -1) { s = s.replace(/0+$/, '').replace(/\.$/, ''); }
  return s;
}

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* solution={sides:{a,b,c}, angles:{A,B,C}（角度制）} -> SVG 字符串。
 * 布局：A=(0,0)，B=(c,0)，C=(b·cosA, b·sinA)，等比缩放到视口。 */
function triangleSVG(sol, opts) {
  opts = opts || {};
  if (!sol || !sol.sides || !sol.angles) {
    throw mkErr('input', 'triangleSVG 需要 {sides:{a,b,c}, angles:{A,B,C}}');
  }
  var a = sol.sides.a, b = sol.sides.b, c = sol.sides.c;
  [a, b, c].forEach(function (v, i) {
    if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
      throw mkErr('abc'[i], 'triangleSVG：边长必须为正数');
    }
  });
  var Ar = toRadians(sol.angles.A);
  var Br = toRadians(sol.angles.B);
  var Cr = toRadians(sol.angles.C);
  [Ar, Br, Cr].forEach(function (r) {
    if (!(r > 0 && r < PI)) { throw mkErr('input', 'triangleSVG：角度必须在 (0,180°) 内'); }
  });

  /* 顶点（数学坐标，y 向上） */
  var Ax = 0, Ay = 0;
  var Bx = c, By = 0;
  var Cx = b * Math.cos(Ar), Cy = b * Math.sin(Ar);

  var W = opts.width || 400, H = opts.height || 300, pad = 36;
  var minX = Math.min(Ax, Bx, Cx), maxX = Math.max(Ax, Bx, Cx);
  var minY = Math.min(Ay, By, Cy), maxY = Math.max(Ay, By, Cy);
  var spanX = Math.max(maxX - minX, EPS), spanY = Math.max(maxY - minY, EPS);
  var scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);

  function X(x) { return pad + (x - minX) * scale; }
  function Y(y) { return H - pad - (y - minY) * scale; } /* y 翻转 */

  var P = {
    A: [X(Ax), Y(Ay)],
    B: [X(Bx), Y(By)],
    C: [X(Cx), Y(Cy)]
  };
  var rad = { A: Ar, B: Br, C: Cr };
  var sideVal = { A: a, B: b, C: c };       /* 顶点对边边长 */
  var sideName = { A: 'a', B: 'b', C: 'c' }; /* 顶点对边边名 */

  /* 多边形 A->B->C 在 SVG 坐标下为顺时针：顶点处内角弧取顺时针方向 */
  function sub(u, v) { return [u[0] - v[0], u[1] - v[1]]; }
  function norm(v) {
    var l = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / l, v[1] / l];
  }
  function centroid() {
    return [(P.A[0] + P.B[0] + P.C[0]) / 3, (P.A[1] + P.B[1] + P.C[1]) / 3];
  }
  var G = centroid();
  var minSidePx = Math.min(a, b, c) * scale;
  var arcR = Math.max(14, Math.min(44, minSidePx * 0.22));

  var parts = [];
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H +
    '" width="100%" role="img" aria-label="三角形真实比例示意图">');

  /* 三角形主体 */
  parts.push('<polygon points="' + P.A.join(',') + ' ' + P.B.join(',') + ' ' + P.C.join(',') +
    '" fill="#dbeafe" stroke="#1d4ed8" stroke-width="2" stroke-linejoin="round"/>');

  /* 顶点圆点 + 顶点标签（A/B/C，偏向形心反方向） */
  ['A', 'B', 'C'].forEach(function (v) {
    var away = norm(sub(P[v], G));
    var lx = P[v][0] + away[0] * 16, ly = P[v][1] + away[1] * 16;
    parts.push('<circle cx="' + fmtNum(P[v][0]) + '" cy="' + fmtNum(P[v][1]) +
      '" r="3.5" fill="#1d4ed8"/>');
    parts.push('<text x="' + fmtNum(lx) + '" y="' + fmtNum(ly + 4) +
      '" text-anchor="middle" font-size="15" font-weight="700" fill="#111827">' + v + '</text>');
  });

  /* 内角弧 + 角度数值（沿内角平分线方向标注） */
  var order = ['A', 'B', 'C'];
  var nbr = { A: ['B', 'C'], B: ['A', 'C'], C: ['A', 'B'] };
  order.forEach(function (v) {
    var u = norm(sub(P[nbr[v][0]], P[v]));
    var w = norm(sub(P[nbr[v][1]], P[v]));
    var tu = Math.atan2(u[1], u[0]), tw = Math.atan2(w[1], w[0]);
    var delta = tw - tu;
    while (delta <= 0) { delta += 2 * PI; }
    while (delta > PI) { delta -= 2 * PI; }
    /* 若算出的 delta 与真实内角差太多（方向反了），取另一方向 */
    if (Math.abs(delta - rad[v]) > 0.02) { delta = delta > 0 ? delta - 2 * PI : delta + 2 * PI; }
    var ex = P[v][0] + arcR * Math.cos(tu + delta);
    var ey = P[v][1] + arcR * Math.sin(tu + delta);
    var sx = P[v][0] + arcR * Math.cos(tu);
    var sy = P[v][1] + arcR * Math.sin(tu);
    var sweep = delta > 0 ? 1 : 0;
    parts.push('<path d="M ' + fmtNum(sx) + ' ' + fmtNum(sy) + ' A ' + fmtNum(arcR) +
      ' ' + fmtNum(arcR) + ' 0 0 ' + sweep + ' ' + fmtNum(ex) + ' ' + fmtNum(ey) +
      '" fill="none" stroke="#7c3aed" stroke-width="1.6"/>');
    var bis = norm([u[0] + w[0], u[1] + w[1]]);
    var tx = P[v][0] + bis[0] * (arcR + 14);
    var ty = P[v][1] + bis[1] * (arcR + 14);
    parts.push('<text x="' + fmtNum(tx) + '" y="' + fmtNum(ty + 4) +
      '" text-anchor="middle" font-size="12.5" fill="#6d28d9">' +
      escXml(fmtNum(sol.angles[v])) + '°</text>');
  });

  /* 边标注：边中点 + 法向外偏移，文字如 a=4 */
  var edges = [['B', 'C', 'a', a], ['A', 'C', 'b', b], ['A', 'B', 'c', c]];
  edges.forEach(function (e) {
    var P1 = P[e[0]], P2 = P[e[1]];
    var mx = (P1[0] + P2[0]) / 2, my = (P1[1] + P2[1]) / 2;
    var away = norm(sub([mx, my], G));
    var lx = mx + away[0] * 14, ly = my + away[1] * 14;
    parts.push('<text x="' + fmtNum(lx) + '" y="' + fmtNum(ly + 4) +
      '" text-anchor="middle" font-size="12.5" fill="#1e40af">' +
      e[2] + '=' + escXml(fmtNum(e[3])) + '</text>');
  });

  parts.push('</svg>');
  return parts.join('');
}

var TriangleSolver = {
  toRadians: toRadians,
  toDegrees: toDegrees,
  solveTriangle: solveTriangle,
  solveSSS: solveSSS,
  solveSAS: solveSAS,
  solveASA: solveASA,
  solveSSA: solveSSA,
  triangleSVG: triangleSVG,
  detectMode: detectMode
};

/* ---------------- 浏览器 UI ---------------- */

var LS_KEY = 'triangle_solver_v1';

function $(id) { return document.getElementById(id); }

function toast(msg) {
  var t = $('ts-toast');
  if (!t) { return; }
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.style.display = 'none'; }, 2200);
}

function currentUnit() {
  var el = document.querySelector('input[name="ts-unit"]:checked');
  return el ? el.value : 'deg';
}

function readInputs() {
  var raw = {};
  ['a', 'b', 'c', 'A', 'B', 'C'].forEach(function (k) {
    var v = $('ts-' + k).value.trim();
    raw[k] = v === '' ? undefined : Number(v);
  });
  return raw;
}

function unitLabel(unit) { return unit === 'deg' ? '°' : ' rad'; }

function fmtOut(x) {
  if (typeof x !== 'number' || !isFinite(x)) { return '—'; }
  var r = Math.round(x * 10000) / 10000;
  return String(r);
}

function modeDesc(mode) {
  return {
    SSS: 'SSS（三边定理）',
    SAS: 'SAS（两边夹角）',
    ASA: 'ASA（两角夹边）',
    AAS: 'AAS（两角及对边）',
    SSA: 'SSA（两边及一对角）'
  }[mode] || mode;
}

var activeSolIdx = 0;
var lastResult = null;

function renderSolution(sol, unit) {
  var angUnit = unit === 'deg' ? '°' : ' rad';
  var rows = [
    ['边 a', fmtOut(sol.sides.a), '角 A', fmtOut(sol.angles.A) + angUnit],
    ['边 b', fmtOut(sol.sides.b), '角 B', fmtOut(sol.angles.B) + angUnit],
    ['边 c', fmtOut(sol.sides.c), '角 C', fmtOut(sol.angles.C) + angUnit],
    ['面积', fmtOut(sol.area), '周长', fmtOut(sol.perimeter)]
  ];
  var html = '<table class="ts-table"><tbody>' + rows.map(function (r) {
    return '<tr><td class="ts-k">' + r[0] + '</td><td>' + r[1] +
      '</td><td class="ts-k">' + r[2] + '</td><td>' + r[3] + '</td></tr>';
  }).join('') + '</tbody></table>';
  $('ts-table').innerHTML = html;
  /* SVG：角度统一转角度制标注 */
  var svgSol = {
    sides: sol.sides,
    angles: unit === 'deg' ? sol.angles : {
      A: toDegrees(sol.angles.A), B: toDegrees(sol.angles.B), C: toDegrees(sol.angles.C)
    }
  };
  $('ts-svg').innerHTML = triangleSVG(svgSol);
}

function render() {
  var unit = currentUnit();
  var errBox = $('ts-error'), resBox = $('ts-result');
  var raw;
  try {
    raw = readInputs();
    var n = ['a', 'b', 'c', 'A', 'B', 'C'].filter(function (k) {
      return raw[k] !== undefined;
    }).length;
    if (n === 0) { errBox.style.display = 'none'; resBox.style.display = 'none'; return; }
    var r = solveTriangle(raw, unit);
    var modeNow = detectMode(parseKnowns(raw, unit));
    lastResult = { result: r, unit: unit, mode: modeNow };
    errBox.style.display = 'none';
    resBox.style.display = 'block';
    $('ts-mode').textContent = '组合判定：' + modeDesc(modeNow);
    /* SSA 两组解切换 */
    var tabs = $('ts-sol-tabs');
    if (r.ambiguous) {
      if (activeSolIdx > 1) { activeSolIdx = 0; }
      tabs.style.display = 'flex';
      tabs.innerHTML =
        '<button class="btn btn-secondary ts-tab' + (activeSolIdx === 0 ? ' ts-tab-on' : '') +
        '" data-i="0">解 1（锐角）</button>' +
        '<button class="btn btn-secondary ts-tab' + (activeSolIdx === 1 ? ' ts-tab-on' : '') +
        '" data-i="1">解 2（钝角）</button>' +
        '<span class="ts-info">SSA 歧义：两组解均满足已知量</span>';
      var btns = tabs.querySelectorAll('.ts-tab');
      btns.forEach(function (b) {
        b.addEventListener('click', function () {
          activeSolIdx = Number(b.getAttribute('data-i'));
          render();
        });
      });
    } else {
      activeSolIdx = 0;
      tabs.style.display = 'none';
      tabs.innerHTML = '';
    }
    renderSolution(r.solutions[activeSolIdx], unit);
    saveLocal();
  } catch (e) {
    resBox.style.display = 'none';
    errBox.style.display = 'block';
    errBox.textContent = '求解失败：' + (e && e.message ? e.message : String(e));
    lastResult = null;
  }
}

function fillSample() {
  /* 经典 3-4-5 直角三角形（SSS） */
  $('ts-a').value = '3';
  $('ts-b').value = '4';
  $('ts-c').value = '5';
  ['A', 'B', 'C'].forEach(function (k) { $('ts-' + k).value = ''; });
  setUnit('deg');
  activeSolIdx = 0;
  render();
  toast('已填入示例：a=3, b=4, c=5（SSS）');
}

function clearAll() {
  ['a', 'b', 'c', 'A', 'B', 'C'].forEach(function (k) { $('ts-' + k).value = ''; });
  activeSolIdx = 0;
  try { localStorage.removeItem(LS_KEY); } catch (e) {}
  render();
}

function copyResult() {
  if (!lastResult) { toast('还没有可复制的结果'); return; }
  var r = lastResult.result, unit = lastResult.unit, mode = lastResult.mode;
  var angUnit = unit === 'deg' ? '°' : 'rad';
  var lines = ['三角形求解结果（' + modeDesc(mode) + '，' +
    (unit === 'deg' ? '角度制' : '弧度制') + '）：'];
  r.solutions.forEach(function (s, i) {
    if (r.ambiguous) { lines.push('— 解 ' + (i + 1) + (i === 0 ? '（锐角）' : '（钝角）') + ' —'); }
    lines.push('边：a=' + fmtOut(s.sides.a) + '，b=' + fmtOut(s.sides.b) + '，c=' + fmtOut(s.sides.c));
    lines.push('角：A=' + fmtOut(s.angles.A) + angUnit + '，B=' + fmtOut(s.angles.B) +
      angUnit + '，C=' + fmtOut(s.angles.C) + angUnit);
    lines.push('面积=' + fmtOut(s.area) + '，周长=' + fmtOut(s.perimeter));
  });
  var text = lines.join('\n');
  function done() { toast('结果已复制到剪贴板'); }
  function fallback() {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); }
    catch (e) { toast('复制失败，请手动复制'); }
    document.body.removeChild(ta);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, fallback);
  } else {
    fallback();
  }
}

function setUnit(u) {
  var radios = document.querySelectorAll('input[name="ts-unit"]');
  /* 切换单位时，已填角度按原单位换算到新单位（三角形本身不变） */
  var old = currentUnit();
  if (old !== u) {
    ['A', 'B', 'C'].forEach(function (k) {
      var el = $('ts-' + k);
      var v = el.value.trim();
      if (v === '' || isNaN(Number(v))) { return; }
      var num = Number(v);
      el.value = String(Math.round((old === 'deg' ? toRadians(num) : toDegrees(num)) * 10000) / 10000);
    });
  }
  radios.forEach(function (r) { r.checked = (r.value === u); });
  document.querySelectorAll('.ts-unit-label').forEach(function (lab) {
    lab.textContent = u === 'deg' ? '°' : 'rad';
  });
}

var SAVE_IDS = ['ts-a', 'ts-b', 'ts-c', 'ts-A', 'ts-B', 'ts-C'];

function saveLocal() {
  try {
    var data = { unit: currentUnit() };
    SAVE_IDS.forEach(function (id) { data[id] = $(id).value; });
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch (e) { /* 本地保存失败不打扰主流程 */ }
}

function loadLocal() {
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (!raw) { return; }
    var data = JSON.parse(raw);
    if (!data) { return; }
    if (data.unit === 'deg' || data.unit === 'rad') {
      document.querySelectorAll('input[name="ts-unit"]').forEach(function (r) {
        r.checked = (r.value === data.unit);
      });
      document.querySelectorAll('.ts-unit-label').forEach(function (lab) {
        lab.textContent = data.unit === 'deg' ? '°' : 'rad';
      });
    }
    SAVE_IDS.forEach(function (id) {
      if (typeof data[id] === 'string' && data[id] !== '') { $(id).value = data[id]; }
    });
  } catch (e) { /* 忽略 */ }
}

function init() {
  if (!$('triangle-app')) { return; }
  loadLocal();
  SAVE_IDS.forEach(function (id) {
    $(id).addEventListener('input', function () { activeSolIdx = 0; render(); });
  });
  document.querySelectorAll('input[name="ts-unit"]').forEach(function (r) {
    r.addEventListener('change', function () {
      setUnit(r.value);
      activeSolIdx = 0;
      render();
    });
  });
  $('ts-sample').addEventListener('click', fillSample);
  $('ts-copy').addEventListener('click', copyResult);
  $('ts-clear').addEventListener('click', clearAll);
  render();
}

if (typeof window !== 'undefined') {
  window.TriangleSolver = TriangleSolver;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TriangleSolver;
}

})();
