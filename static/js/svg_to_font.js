/* SVG 转字体图标生成器（svg_to_font）纯前端核心逻辑
 * 纯函数经 module.exports 暴露，node tests/svg_to_font.test.js 自测；
 * 浏览器端：window.SvgFont 全局 + DOM 装配（本文件末尾）。
 *
 * 设计说明（实测结论）：
 * - opentype.js 2.0.0 的 toArrayBuffer() 只写 CFF 轮廓（OTTO 签名），不再提供
 *   TrueType glyf 写入。因此 OTF（次）走 vendor opentype.js 组装；TTF（主）由
 *   本文件内建的最小 TrueType 构建器生成（含 cubic→quadratic 转换、glyf/loca/
 *   cmap/name/post 等 10 张表），保证「.ttf」名副其实。两者都经 vendor opentype
 *   重新 parse 做 round-trip 自测。
 * - 轮廓统一归一化为三次贝塞尔子路径；TTF 写入时再转二次贝塞尔。
 * - 本文件零 fetch/XHR：字体组装、预览、下载全部本地完成。
 */
(function () {
"use strict";

/* ================= 1. 基础工具 ================= */
function trim(s) { return String(s == null ? "" : s).replace(/^\s+|\s+$/g, ""); }
function isFiniteNum(v) { return typeof v === "number" && isFinite(v); }
function round(v) { return Math.round(v); }
function clampInt(v, lo, hi) { v = round(v); return v < lo ? lo : (v > hi ? hi : v); }

var SVG_NS_ATTRS = /^(xlink|xml):/;

/* 2D 仿射矩阵 {a,b,c,d,e,f}：x' = a*x + c*y + e；y' = b*x + d*y + f */
var IDENT_MAT = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
function matMul(A, B) { /* 先应用 B，再应用 A */
    return {
        a: A.a * B.a + A.c * B.b,
        b: A.b * B.a + A.d * B.b,
        c: A.a * B.c + A.c * B.d,
        d: A.b * B.c + A.d * B.d,
        e: A.a * B.e + A.c * B.f + A.e,
        f: A.b * B.e + A.d * B.f + A.f
    };
}
function matApply(m, x, y) {
    return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}
function matIsIdentity(m) {
    return m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0;
}

/* 解析 transform 属性：仅支持 translate/scale（规格要求），其余返回 null */
function parseTransform(str) {
    str = trim(str);
    if (!str) return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    var m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    var re = /(translate|scale|rotate|skewX|skewY|matrix)\s*\(([^)]*)\)/g, t, any = false;
    while ((t = re.exec(str))) {
        any = true;
        var nums = t[2].split(/[\s,]+/).filter(function (s) { return s !== ""; }).map(Number);
        if (t[1] === "translate") {
            var tx = nums[0] || 0, ty = nums.length > 1 ? (nums[1] || 0) : 0;
            if (!isFiniteNum(tx) || !isFiniteNum(ty)) return null;
            m = matMul(m, { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });
        } else if (t[1] === "scale") {
            var sx = nums[0], sy = nums.length > 1 ? nums[1] : nums[0];
            if (!isFiniteNum(sx) || !isFiniteNum(sy) || sx === 0 || sy === 0) return null;
            m = matMul(m, { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
        } else {
            return null; /* rotate/skewX/skewY/matrix 不支持 */
        }
    }
    return any ? m : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

/* 解析标签属性串（双引号/单引号） */
function parseAttributes(s) {
    var attrs = {};
    var re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g, m;
    while ((m = re.exec(s))) {
        var name = m[1];
        if (SVG_NS_ATTRS.test(name)) continue;
        attrs[name] = (m[3] !== undefined ? m[3] : m[4]);
    }
    return attrs;
}

/* 长度值：去掉 px/pt 等单位 */
function parseLength(s, fallback) {
    if (s == null) return fallback;
    var v = parseFloat(trim(String(s)).replace(/[a-zA-Z%]+$/, ""));
    return isFiniteNum(v) ? v : fallback;
}

/* viewBox="minX minY w h" */
function parseViewBoxAttr(s) {
    var parts = trim(s).split(/[\s,]+/).filter(function (x) { return x !== ""; }).map(Number);
    if (parts.length !== 4 || parts.some(function (v) { return !isFiniteNum(v); }) || parts[2] <= 0 || parts[3] <= 0) return null;
    return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
}

/* ================= 2. SVG 文档解析 =================
 * 返回 {ok:true, viewBox, shapes, warnings} 或 {ok:false, error}
 * shapes 元素：{el, attrs, mat}，el ∈ path/rect/circle/ellipse/line/polyline/polygon
 */
var SHAPE_ELS = { path: 1, rect: 1, circle: 1, ellipse: 1, line: 1, polyline: 1, polygon: 1 };
var NON_OUTLINE_ELS = { lineargradient: 1, radialgradient: 1, filter: 1, pattern: 1, mask: 1, clippath: 1 };

function parseSvg(svgText) {
    var warnings = [];
    var text = String(svgText == null ? "" : svgText);
    if (!/<\s*svg[\s>]/i.test(text)) {
        return { ok: false, error: "不是有效的 SVG：未找到 <svg> 根元素" };
    }
    var shapes = [];
    var stack = []; /* 祖先 <g>/<svg> 的累计矩阵 */
    var curMat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    var rootSeen = false, viewBox = null, rootW = null, rootH = null;
    var nonOutlineWarned = false;
    var tagRe = /<(\/?)\s*([a-zA-Z][\w:.-]*)([^<>]*?)(\/?)>/g, m;
    while ((m = tagRe.exec(text))) {
        var closing = m[1] === "/", rawName = m[2], attrStr = m[3] || "", selfClose = m[4] === "/";
        var name = rawName.toLowerCase();
        if (name.charAt(0) === "?" || name.charAt(0) === "!") continue; /* <?xml / <!DOCTYPE / <!-- */
        if (closing) {
            if ((name === "g" || name === "svg") && stack.length) {
                curMat = stack.pop();
            }
            continue;
        }
        var attrs = parseAttributes(attrStr);
        if (name === "svg") {
            if (!rootSeen) {
                rootSeen = true;
                if (attrs.viewBox) viewBox = parseViewBoxAttr(attrs.viewBox);
                rootW = parseLength(attrs.width, null);
                rootH = parseLength(attrs.height, null);
            } else {
                stack.push(curMat); /* 嵌套 svg：罕见，按分组处理 */
            }
            continue;
        }
        if (name === "g" || name === "a") {
            var gm = parseTransform(attrs.transform || "");
            if (gm === null) {
                warnings.push("<" + name + "> 的 transform 含不支持的变换（仅支持 translate/scale），已忽略该变换");
                gm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
            }
            stack.push(curMat);
            curMat = matMul(curMat, gm);
            if (selfClose && stack.length) curMat = stack.pop();
            continue;
        }
        if (NON_OUTLINE_ELS[name]) {
            if (!nonOutlineWarned) {
                warnings.push("渐变/滤镜/遮罩等非轮廓元素已忽略（字体只保留矢量轮廓）");
                nonOutlineWarned = true;
            }
            continue;
        }
        if (SHAPE_ELS[name]) {
            var lm = parseTransform(attrs.transform || "");
            if (lm === null) {
                warnings.push("<" + name + "> 的 transform 含不支持的变换（仅支持 translate/scale），已忽略该变换");
                lm = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
            }
            shapes.push({ el: name, attrs: attrs, mat: matMul(curMat, lm) });
        }
        /* 其余元素（text/image/use/defs 等）直接忽略 */
    }
    if (!rootSeen) return { ok: false, error: "不是有效的 SVG：未找到 <svg> 根元素" };
    if (!viewBox) {
        if (rootW != null && rootH != null && rootW > 0 && rootH > 0) {
            viewBox = { x: 0, y: 0, w: rootW, h: rootH };
        } else {
            return { ok: false, error: "无法确定画布尺寸：缺少 viewBox 且 width/height 无效" };
        }
    }
    return { ok: true, viewBox: viewBox, shapes: shapes, warnings: warnings };
}

/* ================= 3. path d 属性解析 =================
 * 全命令支持：M L H V C S Q T A Z（含相对/隐式重复）。
 * 输出子路径数组：[{start:{x,y}, segs:[{t:'L',x,y}|{t:'C',c1x,c1y,c2x,c2y,x,y}], closed}]
 * 全部曲线归一化为三次贝塞尔；坐标已应用传入的仿射矩阵。
 */
function tokenizePathData(d) {
    /* 先排除未知字符：合法命令/数字/分隔符之外的残留即非法 */
    var stripped = d.replace(/([AaCcHhLlMmQqSsTtVvZz])|(-?\d*\.?\d+(?:[eE][+-]?\d+)?|\.)|[\s,]/g, "");
    if (/[^\s]/.test(stripped)) return null;
    var tokens = [];
    var re = /([AaCcHhLlMmQqSsTtVvZz])|(-?\d*\.?\d+(?:[eE][+-]?\d+)?|\.)/g, m;
    while ((m = re.exec(d))) {
        if (m[1] !== undefined) tokens.push({ t: "cmd", v: m[1] });
        else {
            var n = parseFloat(m[2]);
            if (!isFiniteNum(n)) return null;
            tokens.push({ t: "num", v: n });
        }
    }
    return tokens;
}

var CMD_PARAMS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/* 圆弧端点参数化 → 中心参数化，拆成 ≤90° 的段，每段转三次贝塞尔 */
function arcToCubics(x1, y1, rx, ry, phiDeg, largeArc, sweep, x2, y2) {
    var out = [];
    rx = Math.abs(rx); ry = Math.abs(ry);
    if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return out;
    var phi = phiDeg * Math.PI / 180;
    var cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);
    var dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    var x1p = cosPhi * dx + sinPhi * dy, y1p = -sinPhi * dx + cosPhi * dy;
    var lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) { var s = Math.sqrt(lam); rx *= s; ry *= s; }
    var num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    var den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    var co = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den));
    if (largeArc === sweep) co = -co;
    var cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    var cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
    var cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;
    function ang(ux, uy, vx, vy) {
        var dot = ux * vx + uy * vy;
        var len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
        var a = Math.acos(Math.max(-1, Math.min(1, len === 0 ? 0 : dot / len)));
        return (ux * vy - uy * vx < 0) ? -a : a;
    }
    var th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    var dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sweep && dth > 0) dth -= 2 * Math.PI;
    if (sweep && dth < 0) dth += 2 * Math.PI;
    var n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2)));
    for (var i = 0; i < n; i++) {
        var a1 = th1 + dth * i / n, a2 = th1 + dth * (i + 1) / n;
        var alpha = 4 / 3 * Math.tan((a2 - a1) / 4);
        function pt(a) {
            /* 旋转椭圆参数方程：x=cx+rx·cosφ·cos a−ry·sinφ·sin a，
               y=cy+rx·sinφ·cos a+ry·cosφ·sin a（rx/ry 必须交叉使用） */
            return {
                x: cx + rx * cosPhi * Math.cos(a) - ry * sinPhi * Math.sin(a),
                y: cy + rx * sinPhi * Math.cos(a) + ry * cosPhi * Math.sin(a)
            };
        }
        function dpt(a) {
            return {
                x: -rx * cosPhi * Math.sin(a) - ry * sinPhi * Math.cos(a),
                y: -rx * sinPhi * Math.sin(a) + ry * cosPhi * Math.cos(a)
            };
        }
        var p1 = pt(a1), p2 = pt(a2), d1 = dpt(a1), d2 = dpt(a2);
        out.push({
            c1x: p1.x + alpha * d1.x, c1y: p1.y + alpha * d1.y,
            c2x: p2.x - alpha * d2.x, c2y: p2.y - alpha * d2.y,
            x: p2.x, y: p2.y
        });
    }
    return out;
}

function parsePathData(d, mat) {
    d = trim(d);
    if (!d) return { ok: false, error: "path 的 d 属性为空" };
    var tokens = tokenizePathData(d);
    if (!tokens) return { ok: false, error: "path 的 d 属性含非法字符或数字" };
    mat = mat || IDENT_MAT;
    var subpaths = [], cur = null;
    var cx = 0, cy = 0, sx = 0, sy = 0; /* 当前点 / 子路径起点 */
    var pc1x = 0, pc1y = 0, pqx = 0, pqy = 0; /* S/Q/T 反射用上一个控制点 */
    var prevCmd = "";
    function P(x, y) { return matApply(mat, x, y); }
    function newSub(x, y) {
        if (cur && (cur.segs.length || cur.closed)) subpaths.push(cur);
        var p = P(x, y);
        cur = { start: p, segs: [], closed: false };
        sx = x; sy = y; cx = x; cy = y;
    }
    function lineTo(x, y) {
        if (!cur) newSub(cx, cy);
        var p = P(x, y);
        cur.segs.push({ t: "L", x: p.x, y: p.y });
        cx = x; cy = y;
    }
    function curveTo(c1x, c1y, c2x, c2y, x, y) {
        if (!cur) newSub(cx, cy);
        var a = P(c1x, c1y), b = P(c2x, c2y), p = P(x, y);
        cur.segs.push({ t: "C", c1x: a.x, c1y: a.y, c2x: b.x, c2y: b.y, x: p.x, y: p.y });
        cx = x; cy = y;
    }
    var i = 0, cmd = "";
    while (i < tokens.length) {
        var tk = tokens[i];
        if (tk.t === "cmd") { cmd = tk.v; i++; }
        else if (!cmd) return { ok: false, error: "path 的 d 属性以数字开头，缺少命令" };
        var up = cmd.toUpperCase(), rel = cmd !== up;
        if (up === "Z") {
            if (cur) {
                cur.closed = true;
                cx = sx; cy = sy;
            }
            cmd = ""; prevCmd = "Z";
            continue;
        }
        var need = CMD_PARAMS[up];
        if (need === undefined) return { ok: false, error: "不支持的 path 命令：" + cmd };
        if (i + need > tokens.length) return { ok: false, error: "path 命令 " + cmd + " 参数不足" };
        for (var k = 0; k < need; k++) {
            if (tokens[i + k].t !== "num") return { ok: false, error: "path 命令 " + cmd + " 参数非法" };
        }
        var n = [];
        for (var j = 0; j < need; j++) n.push(tokens[i + j].v);
        i += need;
        (function () {
            switch (up) {
                case "M": {
                    var x = rel ? cx + n[0] : n[0], y = rel ? cy + n[1] : n[1];
                    newSub(x, y);
                    cmd = rel ? "l" : "L"; /* 后续坐标对隐式转为 lineto */
                    break;
                }
                case "L": lineTo(rel ? cx + n[0] : n[0], rel ? cy + n[1] : n[1]); break;
                case "H": lineTo(rel ? cx + n[0] : n[0], cy); break;
                case "V": lineTo(cx, rel ? cy + n[0] : n[0]); break;
                case "C": {
                    var c1x = rel ? cx + n[0] : n[0], c1y = rel ? cy + n[1] : n[1];
                    var c2x = rel ? cx + n[2] : n[2], c2y = rel ? cy + n[3] : n[3];
                    var x = rel ? cx + n[4] : n[4], y = rel ? cy + n[5] : n[5];
                    curveTo(c1x, c1y, c2x, c2y, x, y);
                    pc1x = c2x; pc1y = c2y;
                    break;
                }
                case "S": {
                    var r1x = (prevCmd === "C" || prevCmd === "S") ? 2 * cx - pc1x : cx;
                    var r1y = (prevCmd === "C" || prevCmd === "S") ? 2 * cy - pc1y : cy;
                    var s2x = rel ? cx + n[0] : n[0], s2y = rel ? cy + n[1] : n[1];
                    var sx2 = rel ? cx + n[2] : n[2], sy2 = rel ? cy + n[3] : n[3];
                    curveTo(r1x, r1y, s2x, s2y, sx2, sy2);
                    pc1x = s2x; pc1y = s2y;
                    break;
                }
                case "Q": {
                    var qx = rel ? cx + n[0] : n[0], qy = rel ? cy + n[1] : n[1];
                    var qex = rel ? cx + n[2] : n[2], qey = rel ? cy + n[3] : n[3];
                    /* 二次贝塞尔精确升阶为三次 */
                    curveTo(cx + 2 / 3 * (qx - cx), cy + 2 / 3 * (qy - cy),
                            qex + 2 / 3 * (qx - qex), qey + 2 / 3 * (qy - qey), qex, qey);
                    pqx = qx; pqy = qy;
                    break;
                }
                case "T": {
                    var tqx = (prevCmd === "Q" || prevCmd === "T") ? 2 * cx - pqx : cx;
                    var tqy = (prevCmd === "Q" || prevCmd === "T") ? 2 * cy - pqy : cy;
                    var tex = rel ? cx + n[0] : n[0], tey = rel ? cy + n[1] : n[1];
                    curveTo(cx + 2 / 3 * (tqx - cx), cy + 2 / 3 * (tqy - cy),
                            tex + 2 / 3 * (tqx - tex), tey + 2 / 3 * (tqy - tey), tex, tey);
                    pqx = tqx; pqy = tqy;
                    break;
                }
                case "A": {
                    /* 仿射变换作用于三次贝塞尔控制点即为精确变换（translate/scale 均为仿射） */
                    var ax2 = rel ? cx + n[5] : n[5], ay2 = rel ? cy + n[6] : n[6];
                    var beziers = arcToCubics(cx, cy, n[0], n[1], n[2], n[3], n[4], ax2, ay2);
                    if (!cur) newSub(cx, cy);
                    for (var b = 0; b < beziers.length; b++) {
                        var bz = beziers[b];
                        var q1 = P(bz.c1x, bz.c1y), q2 = P(bz.c2x, bz.c2y), qe = P(bz.x, bz.y);
                        cur.segs.push({ t: "C", c1x: q1.x, c1y: q1.y, c2x: q2.x, c2y: q2.y, x: qe.x, y: qe.y });
                    }
                    cx = ax2; cy = ay2;
                    break;
                }
            }
        })();
        prevCmd = up;
    }
    if (cur && (cur.segs.length || cur.closed)) subpaths.push(cur);
    if (!subpaths.length) return { ok: false, error: "path 的 d 属性未产生有效轮廓" };
    return { ok: true, subpaths: subpaths };
}

/* ================= 4. 基本形状 → 子路径 ================= */
function shapeToSubpaths(shape) {
    var a = shape.attrs, mat = shape.mat;
    function P(x, y) { return matApply(mat, x, y); }
    function cubic(c1x, c1y, c2x, c2y, x, y) {
        var q1 = P(c1x, c1y), q2 = P(c2x, c2y), qe = P(x, y);
        return { t: "C", c1x: q1.x, c1y: q1.y, c2x: q2.x, c2y: q2.y, x: qe.x, y: qe.y };
    }
    function line(x, y) { var q = P(x, y); return { t: "L", x: q.x, y: q.y }; }
    var el = shape.el, subpaths = [];
    if (el === "path") {
        var r = parsePathData(a.d || "", mat);
        return r.ok ? { ok: true, subpaths: r.subpaths } : { ok: false, error: r.error };
    }
    if (el === "rect") {
        var x = parseLength(a.x, 0), y = parseLength(a.y, 0);
        var w = parseLength(a.width, 0), h = parseLength(a.height, 0);
        if (!(w > 0 && h > 0)) return { ok: false, error: "<rect> 宽高无效" };
        var rx = parseLength(a.rx, 0), ry = parseLength(a.ry, 0);
        if (a.rx == null && a.ry != null) rx = ry;
        if (a.ry == null && a.rx != null) ry = rx;
        rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
        var sp = { start: P(x, y), segs: [], closed: true };
        if (rx <= 0 || ry <= 0) {
            sp.segs.push(line(x + w, y), line(x + w, y + h), line(x, y + h));
        } else {
            var k = 0.5522847498;
            sp.start = P(x + rx, y);
            sp.segs.push(
                line(x + w - rx, y),
                cubic(x + w - rx + rx * k, y, x + w, y + ry - ry * k, x + w, y + ry),
                line(x + w, y + h - ry),
                cubic(x + w, y + h - ry + ry * k, x + w - rx + rx * k, y + h, x + w - rx, y + h),
                line(x + rx, y + h),
                cubic(x + rx - rx * k, y + h, x, y + h - ry + ry * k, x, y + h - ry),
                line(x, y + ry),
                cubic(x, y + ry - ry * k, x + rx - rx * k, y, x + rx, y)
            );
        }
        subpaths.push(sp);
        return { ok: true, subpaths: subpaths };
    }
    if (el === "circle" || el === "ellipse") {
        var ecx = parseLength(a.cx, 0), ecy = parseLength(a.cy, 0);
        var erx = el === "circle" ? parseLength(a.r, 0) : parseLength(a.rx, 0);
        var ery = el === "circle" ? parseLength(a.r, 0) : parseLength(a.ry, 0);
        if (!(erx > 0 && ery > 0)) return { ok: false, error: "<" + el + "> 半径无效" };
        var kk = 0.5522847498, ex = erx * kk, ey = ery * kk;
        var csp = { start: P(ecx + erx, ecy), segs: [], closed: true };
        csp.segs.push(
            cubic(ecx + erx, ecy + ey, ecx + ex, ecy + ery, ecx, ecy + ery),
            cubic(ecx - ex, ecy + ery, ecx - erx, ecy + ey, ecx - erx, ecy),
            cubic(ecx - erx, ecy - ey, ecx - ex, ecy - ery, ecx, ecy - ery),
            cubic(ecx + ex, ecy - ery, ecx + erx, ecy - ey, ecx + erx, ecy)
        );
        subpaths.push(csp);
        return { ok: true, subpaths: subpaths };
    }
    if (el === "line") {
        var x1 = parseLength(a.x1, 0), y1 = parseLength(a.y1, 0);
        var x2 = parseLength(a.x2, 0), y2 = parseLength(a.y2, 0);
        var lsp = { start: P(x1, y1), segs: [line(x2, y2)], closed: false };
        subpaths.push(lsp);
        return { ok: true, subpaths: subpaths };
    }
    if (el === "polyline" || el === "polygon") {
        var pts = parsePoints(a.points || "");
        if (pts.length < 2) return { ok: false, error: "<" + el + "> 的 points 点数不足" };
        var psp = { start: P(pts[0].x, pts[0].y), segs: [], closed: el === "polygon" };
        for (var i = 1; i < pts.length; i++) psp.segs.push(line(pts[i].x, pts[i].y));
        subpaths.push(psp);
        return { ok: true, subpaths: subpaths };
    }
    return { ok: false, error: "不支持的元素：<" + el + ">" };
}

function parsePoints(s) {
    var nums = trim(s).split(/[\s,]+/).filter(function (x) { return x !== ""; }).map(Number);
    var pts = [];
    for (var i = 0; i + 1 < nums.length; i += 2) {
        if (isFiniteNum(nums[i]) && isFiniteNum(nums[i + 1])) pts.push({ x: nums[i], y: nums[i + 1] });
    }
    return pts;
}

/* ================= 5. 归一化：viewBox → 1024 em 方框 ＋ Y 轴翻转 =================
 * x' = (x - vb.x) * s；y' = (vb.y + vb.h - y) * s（SVG y-down → 字体 y-up）
 * s = 1024 / max(vb.w, vb.h)；advanceWidth = round(vb.w * s)
 */
var UNITS_PER_EM = 1024;
var ASCENDER = 880, DESCENDER = -144;

function normalizeSubpaths(subpaths, vb) {
    var s = UNITS_PER_EM / Math.max(vb.w, vb.h);
    function X(x) { return (x - vb.x) * s; }
    function Y(y) { return (vb.y + vb.h - y) * s; }
    var out = subpaths.map(function (sp) {
        var nsp = {
            start: { x: X(sp.start.x), y: Y(sp.start.y) },
            segs: sp.segs.map(function (sg) {
                if (sg.t === "L") return { t: "L", x: X(sg.x), y: Y(sg.y) };
                return {
                    t: "C",
                    c1x: X(sg.c1x), c1y: Y(sg.c1y),
                    c2x: X(sg.c2x), c2y: Y(sg.c2y),
                    x: X(sg.x), y: Y(sg.y)
                };
            }),
            closed: sp.closed
        };
        return nsp;
    });
    return { subpaths: out, advanceWidth: round(vb.w * s), scale: s };
}

/* ================= 6. 字形名清洗 ＋ 码点分配 ================= */
function sanitizeGlyphName(filename, used) {
    var base = String(filename == null ? "" : filename).replace(/^.*[\\/]/, "");
    base = base.replace(/\.[^.]*$/, ""); /* 去扩展名 */
    base = base.replace(/[^A-Za-z0-9_]/g, "_"); /* 非法字符转下划线 */
    base = base.replace(/_+/g, "_").replace(/^_|_$/g, "");
    if (!base) base = "icon";
    if (/^[0-9]/.test(base)) base = "icon_" + base; /* 数字开头加前缀 */
    if (base.length > 100) base = base.slice(0, 100); /* PostScript 名长度限制 */
    used = used || {};
    var name = base, i = 1;
    while (used[name]) { i++; name = base + "_" + i; } /* 重名自动加后缀 */
    used[name] = 1;
    return name;
}

var PUA_START = 0xE000;
function assignCodepoints(count) {
    var cps = [];
    for (var i = 0; i < count; i++) cps.push(PUA_START + i);
    return cps;
}
function codepointLabel(cp) { return "U+" + cp.toString(16).toUpperCase(); }
function cssUnicodeEscape(cp) {
    var h = cp.toString(16).toLowerCase();
    while (h.length < 4) h = "0" + h;
    return "\\" + h;
}

/* ================= 7. 单文件 → 字形 ================= */
function buildGlyphFromSvg(filename, svgText) {
    var parsed = parseSvg(svgText);
    if (!parsed.ok) return { ok: false, filename: filename, error: parsed.error };
    var subpaths = [], warnings = parsed.warnings.slice();
    for (var i = 0; i < parsed.shapes.length; i++) {
        var r = shapeToSubpaths(parsed.shapes[i]);
        if (r.ok) subpaths = subpaths.concat(r.subpaths);
        else warnings.push(r.error + "（已跳过该元素）");
    }
    if (!subpaths.length) {
        return { ok: false, filename: filename, error: "未找到可转换的矢量轮廓（需要 <path> 或 rect/circle/ellipse/line/polyline/polygon）" };
    }
    var norm = normalizeSubpaths(subpaths, parsed.viewBox);
    return {
        ok: true, filename: filename,
        subpaths: norm.subpaths, advanceWidth: norm.advanceWidth,
        warnings: warnings
    };
}

/* ================= 8. 三次贝塞尔 → 二次贝塞尔（TTF 用） =================
 * 中点公式二次逼近＋递归对半细分，tol 为 em 单位下的最大允许偏差。
 */
function cubicToQuadratics(p0, c1, c2, p3, tol) {
    /* 单段二次逼近：q = (3(c1+c2) - (p0+p3)) / 4（中点重合） */
    function approx(p0, c1, c2, p3) {
        return {
            x: (3 * (c1.x + c2.x) - (p0.x + p3.x)) / 4,
            y: (3 * (c1.y + c2.y) - (p0.y + p3.y)) / 4
        };
    }
    function flatEnough(p0, c1, c2, p3) {
        /* 控制点到弦的最大距离作为曲率度量 */
        var dx = p3.x - p0.x, dy = p3.y - p0.y;
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var d1 = Math.abs((c1.x - p0.x) * dy - (c1.y - p0.y) * dx) / len;
        var d2 = Math.abs((c2.x - p0.x) * dy - (c2.y - p0.y) * dx) / len;
        return Math.max(d1, d2) <= tol * 4;
    }
    function split(p0, c1, c2, p3) {
        var m1 = { x: (p0.x + c1.x) / 2, y: (p0.y + c1.y) / 2 };
        var m2 = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 };
        var m3 = { x: (c2.x + p3.x) / 2, y: (c2.y + p3.y) / 2 };
        var m12 = { x: (m1.x + m2.x) / 2, y: (m1.y + m2.y) / 2 };
        var m23 = { x: (m2.x + m3.x) / 2, y: (m2.y + m3.y) / 2 };
        var mid = { x: (m12.x + m23.x) / 2, y: (m12.y + m23.y) / 2 };
        return [
            [p0, m1, m12, mid],
            [mid, m23, m3, p3]
        ];
    }
    var out = [];
    (function rec(p0, c1, c2, p3, depth) {
        if (depth > 12 || flatEnough(p0, c1, c2, p3)) {
            var q = approx(p0, c1, c2, p3);
            out.push({ qx: q.x, qy: q.y, x: p3.x, y: p3.y });
            return;
        }
        var halves = split(p0, c1, c2, p3);
        rec(halves[0][0], halves[0][1], halves[0][2], halves[0][3], depth + 1);
        rec(halves[1][0], halves[1][1], halves[1][2], halves[1][3], depth + 1);
    })(p0, c1, c2, p3, 0);
    return out;
}

/* 子路径 → TrueType 轮廓点列（含隐含 on-curve 点处理与首点旋转） */
function subpathToContour(sp) {
    var pts = []; /* {x, y, on} */
    var cur = { x: sp.start.x, y: sp.start.y };
    pts.push({ x: cur.x, y: cur.y, on: true });
    for (var i = 0; i < sp.segs.length; i++) {
        var sg = sp.segs[i];
        if (sg.t === "L") {
            pts.push({ x: sg.x, y: sg.y, on: true });
        } else {
            var quads = cubicToQuadratics(cur, { x: sg.c1x, y: sg.c1y }, { x: sg.c2x, y: sg.c2y }, { x: sg.x, y: sg.y }, 1.0);
            for (var q = 0; q < quads.length; q++) {
                pts.push({ x: quads[q].qx, y: quads[q].qy, on: false });
                pts.push({ x: quads[q].x, y: quads[q].y, on: true });
            }
        }
        cur = { x: sg.x, y: sg.y };
    }
    /* 相邻 off-curve 点之间插入隐含 on-curve 中点（含首尾环绕） */
    var exp = [], n = pts.length;
    for (var k = 0; k < n; k++) {
        var p = pts[k], q2 = pts[(k + 1) % n];
        exp.push(p);
        if (!p.on && !q2.on) exp.push({ x: (p.x + q2.x) / 2, y: (p.y + q2.y) / 2, on: true });
    }
    /* 首点必须为 on-curve，否则旋转 */
    if (!exp.length) return null;
    if (!exp[0].on) {
        var idx = -1;
        for (var r2 = 0; r2 < exp.length; r2++) if (exp[r2].on) { idx = r2; break; }
        if (idx < 0) return null;
        exp = exp.slice(idx).concat(exp.slice(0, idx));
    }
    /* 坐标取整 */
    for (var s2 = 0; s2 < exp.length; s2++) { exp[s2].x = round(exp[s2].x); exp[s2].y = round(exp[s2].y); }
    if (exp.length < 2) return null;
    return exp;
}

function contourArea(pts) {
    var a = 0;
    for (var i = 0; i < pts.length; i++) {
        var p = pts[i], q = pts[(i + 1) % pts.length];
        a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
}

/* ================= 9. 最小 TrueType 构建器 =================
 * 生成真正的 TrueType（glyf 轮廓）字体：表 OS/2,cmap,glyf,head,hhea,hmtx,loca,maxp,name,post。
 * glyphs: [{name, codepoint, subpaths, advanceWidth}]；index 0 固定为 .notdef。
 */
function BW() { this.b = []; }
BW.prototype.u8 = function (v) { this.b.push(v & 0xff); };
BW.prototype.u16 = function (v) { v = v & 0xffff; this.b.push((v >>> 8) & 0xff, v & 0xff); };
BW.prototype.i16 = function (v) { this.u16(v < 0 ? 0x10000 + v : v); };
BW.prototype.u32 = function (v) { v = v >>> 0; this.b.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff); };
BW.prototype.i32 = function (v) { this.u32(v < 0 ? 0x100000000 + v : v); };
BW.prototype.fixed = function (v) { this.i32(round(v * 65536)); };
BW.prototype.tag = function (s) { for (var i = 0; i < 4; i++) this.u8(s.charCodeAt(i)); };
BW.prototype.raw = function (arr) { for (var i = 0; i < arr.length; i++) this.u8(arr[i]); };
BW.prototype.utf16be = function (s) { for (var i = 0; i < s.length; i++) this.u16(s.charCodeAt(i)); };
BW.prototype.pascal = function (s) { /* 仅 ASCII（post 表字形名已清洗） */
    var len = Math.min(s.length, 255);
    this.u8(len);
    for (var i = 0; i < len; i++) this.u8(s.charCodeAt(i) & 0x7f);
};
BW.prototype.pad4 = function () { while (this.b.length % 4) this.u8(0); };
BW.prototype.len = function () { return this.b.length; };
BW.prototype.result = function () { return new Uint8Array(this.b); };

function checksumOf(bytes, len) {
    var sum = 0;
    for (var i = 0; i < len; i += 4) {
        sum = (sum + ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3])) >>> 0;
    }
    return sum >>> 0;
}

function encodeSimpleGlyph(contours) {
    /* contours: 点列数组（已取整、首点 on-curve、隐含点已展开） */
    var w = new BW();
    var n = contours.length;
    var xMin = 0, yMin = 0, xMax = 0, yMax = 0, first = true;
    var flat = [], endPts = [], count = 0;
    for (var c = 0; c < n; c++) {
        var pts = contours[c];
        for (var i = 0; i < pts.length; i++) {
            var p = pts[i];
            if (first) { xMin = xMax = p.x; yMin = yMax = p.y; first = false; }
            else {
                if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
                if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y;
            }
            flat.push(p);
        }
        count += pts.length;
        endPts.push(count - 1);
    }
    if (n === 0) {
        return { data: w.result(), xMin: 0, yMin: 0, xMax: 0, yMax: 0, nPoints: 0, nContours: 0 };
    }
    /* 两遍法：先算 flag（含坐标编码位），再写坐标 */
    var w2 = new BW();
    w2.i16(n);
    w2.i16(xMin); w2.i16(yMin); w2.i16(xMax); w2.i16(yMax);
    for (var e2 = 0; e2 < endPts.length; e2++) w2.u16(endPts[e2]);
    w2.u16(0);
    var fullFlags = [];
    var prevX = 0, prevY = 0;
    for (var g2 = 0; g2 < flat.length; g2++) {
        var pt = flat[g2];
        var fl = pt.on ? 1 : 0;
        var dx = pt.x - prevX, dy = pt.y - prevY;
        if (dx === 0) fl |= 0x10;
        else if (dx > -256 && dx < 256) { fl |= 0x02; if (dx > 0) fl |= 0x10; }
        if (dy === 0) fl |= 0x20;
        else if (dy > -256 && dy < 256) { fl |= 0x04; if (dy > 0) fl |= 0x20; }
        fullFlags.push(fl);
        prevX = pt.x; prevY = pt.y;
    }
    var gi = 0;
    while (gi < fullFlags.length) {
        var gj = gi + 1;
        while (gj < fullFlags.length && fullFlags[gj] === fullFlags[gi] && gj - gi < 256) gj++;
        var rp = gj - gi - 1;
        if (rp > 0) { w2.u8(fullFlags[gi] | 8); w2.u8(rp); }
        else w2.u8(fullFlags[gi]);
        gi = gj;
    }
    prevX = 0; prevY = 0;
    var xs = new BW(), ys = new BW();
    for (var h2 = 0; h2 < flat.length; h2++) {
        var p2 = flat[h2], fl2 = fullFlags[h2];
        var ddx = p2.x - prevX, ddy = p2.y - prevY;
        if (fl2 & 0x02) xs.u8(Math.abs(ddx)); else if (!(fl2 & 0x10)) xs.i16(ddx);
        if (fl2 & 0x04) ys.u8(Math.abs(ddy)); else if (!(fl2 & 0x20)) ys.i16(ddy);
        prevX = p2.x; prevY = p2.y;
    }
    w2.raw(xs.result()); w2.raw(ys.result());
    return { data: w2.result(), xMin: xMin, yMin: yMin, xMax: xMax, yMax: yMax, nPoints: flat.length, nContours: n };
}

/* 字形子路径 → TTF 轮廓（含方向规范化：y-up 下外轮廓顺时针/负面积，内洞逆时针） */
function glyphSubpathsToContours(subpaths) {
    var contours = [];
    for (var i = 0; i < subpaths.length; i++) {
        var c = subpathToContour(subpaths[i]);
        if (c) contours.push(c);
    }
    if (!contours.length) return contours;
    /* 按 |面积| 降序：最大者为外轮廓 */
    var withArea = contours.map(function (c) { return { c: c, a: contourArea(c) }; });
    withArea.sort(function (p, q) { return Math.abs(q.a) - Math.abs(p.a); });
    for (var k = 0; k < withArea.length; k++) {
        var item = withArea[k];
        if (k === 0) { if (item.a > 0) item.c.reverse(); }       /* 外轮廓 → 顺时针（负面积） */
        else { if (item.a < 0) item.c.reverse(); }                /* 其余 → 逆时针 */
    }
    return withArea.map(function (it) { return it.c; });
}

/* cmap format 4 */
function buildCmapFormat4(pairs) {
    /* pairs: [[codepoint, glyphIndex]] 已按码点排序 */
    var segs = [];
    var i = 0;
    while (i < pairs.length) {
        var s = pairs[i][0], e = s, g0 = pairs[i][1], j = i;
        while (j + 1 < pairs.length && pairs[j + 1][0] === pairs[j][0] + 1 && pairs[j + 1][1] === pairs[j][1] + 1) {
            j++; e = pairs[j][0];
        }
        segs.push({ start: s, end: e, delta: (g0 - s) & 0xffff });
        i = j + 1;
    }
    segs.push({ start: 0xffff, end: 0xffff, delta: 1 });
    var segCount = segs.length;
    var w = new BW();
    w.u16(4); w.u16(0); w.u16(0); /* format, length(回填), language */
    var maxPow = 1;
    while (maxPow * 2 <= segCount) maxPow *= 2;
    var searchRange = maxPow * 2, entrySelector = 0, tmp = maxPow;
    while (tmp > 1) { tmp /= 2; entrySelector++; }
    w.u16(segCount * 2); w.u16(searchRange); w.u16(entrySelector); w.u16(segCount * 2 - searchRange);
    for (var a = 0; a < segCount; a++) w.u16(segs[a].end);
    w.u16(0);
    for (var b = 0; b < segCount; b++) w.u16(segs[b].start);
    for (var c = 0; c < segCount; c++) w.i16(segs[c].delta > 0x7fff ? segs[c].delta - 0x10000 : segs[c].delta);
    for (var d = 0; d < segCount; d++) w.u16(0);
    var bytes = w.result();
    bytes[2] = (bytes.length >>> 8) & 0xff; bytes[3] = bytes.length & 0xff;
    return bytes;
}

/* name 表（Windows 平台，UTF-16BE） */
function buildNameTable(family, subfamily, psName) {
    var full = family + " " + subfamily;
    var recs = [
        [1, family], [2, subfamily], [3, family + "-" + subfamily + ":Version 1.0"],
        [4, full], [5, "Version 1.0"], [6, psName]
    ];
    var w = new BW();
    w.u16(0); w.u16(recs.length);
    var offset = 6 + recs.length * 12;
    var strBytes = [];
    for (var i = 0; i < recs.length; i++) {
        var sw = new BW();
        sw.utf16be(recs[i][1]);
        var sb = sw.result();
        w.u16(3); w.u16(1); w.u16(0x0409); w.u16(recs[i][0]);
        w.u16(sb.length); w.u16(offset);
        strBytes.push(sb);
        offset += sb.length;
    }
    for (var j = 0; j < strBytes.length; j++) w.raw(strBytes[j]);
    return w.result();
}

/* post format 2.0（含字形名） */
function buildPostTable(glyphNames) {
    var w = new BW();
    w.fixed(2.0);
    w.fixed(0); /* italicAngle */
    w.i16(-75); w.i16(50); /* underlinePosition / underlineThickness */
    w.u32(0); /* isFixedPitch */
    w.u32(0); w.u32(0); w.u32(0); w.u32(0); /* min/max mem */
    w.u16(glyphNames.length);
    var STD_NAMES = [".notdef"];
    var custom = [];
    for (var i = 0; i < glyphNames.length; i++) {
        var idx = STD_NAMES.indexOf(glyphNames[i]);
        if (idx >= 0) w.u16(idx);
        else { w.u16(258 + custom.length); custom.push(glyphNames[i]); }
    }
    for (var j = 0; j < custom.length; j++) w.pascal(custom[j]);
    return w.result();
}

/* 组装完整 TTF（Uint8Array）。opts: {familyName, styleName} */
function buildTTF(glyphs, opts) {
    opts = opts || {};
    var family = trim(opts.familyName) || "IconFont";
    var psName = family.replace(/[^A-Za-z0-9]/g, "") || "IconFont";
    if (/^[0-9]/.test(psName)) psName = "IconFont" + psName;
    /* 字形 0 = .notdef */
    var all = [{ name: ".notdef", codepoint: 0, subpaths: [], advanceWidth: UNITS_PER_EM }].concat(glyphs);
    var enc = [], maxPoints = 0, maxContours = 0;
    var xMinF = 0, yMinF = 0, xMaxF = 0, yMaxF = 0, fFirst = true;
    var advMax = 0, minLSB = 0, minRSB = 0, xMaxExtent = 0, lsbFirst = true;
    var avgAdv = 0;
    for (var gi = 0; gi < all.length; gi++) {
        var g = all[gi];
        var contours = g.subpaths.length ? glyphSubpathsToContours(g.subpaths) : [];
        var e = encodeSimpleGlyph(contours);
        enc.push(e);
        if (e.nPoints > maxPoints) maxPoints = e.nPoints;
        if (e.nContours > maxContours) maxContours = e.nContours;
        if (!fFirst || e.nContours > 0) {
            if (fFirst && e.nContours > 0) { xMinF = e.xMin; yMinF = e.yMin; xMaxF = e.xMax; yMaxF = e.yMax; fFirst = false; }
            else if (e.nContours > 0) {
                if (e.xMin < xMinF) xMinF = e.xMin; if (e.yMin < yMinF) yMinF = e.yMin;
                if (e.xMax > xMaxF) xMaxF = e.xMax; if (e.yMax > yMaxF) yMaxF = e.yMax;
            }
        }
        var adv = clampInt(g.advanceWidth, 1, 0xffff);
        avgAdv += adv;
        if (adv > advMax) advMax = adv;
        var lsb = e.nContours > 0 ? e.xMin : 0;
        var rsb = e.nContours > 0 ? adv - e.xMax : adv;
        var extent = e.nContours > 0 ? lsb + (e.xMax - e.xMin) : 0;
        if (lsbFirst) { minLSB = lsb; minRSB = rsb; xMaxExtent = extent; lsbFirst = false; }
        else {
            if (lsb < minLSB) minLSB = lsb;
            if (rsb < minRSB) minRSB = rsb;
            if (extent > xMaxExtent) xMaxExtent = extent;
        }
    }
    avgAdv = round(avgAdv / all.length);
    var numGlyphs = all.length;

    /* glyf + loca */
    var glyfW = new BW(), loca = [], off = 0;
    for (var k = 0; k < enc.length; k++) {
        loca.push(off / 2);
        var d = enc[k].data;
        glyfW.raw(d);
        while (glyfW.len() % 4) glyfW.u8(0);
        off += Math.ceil(d.length / 4) * 4;
    }
    loca.push(off / 2);
    var glyfData = glyfW.result();
    var locaW = new BW();
    for (var li = 0; li < loca.length; li++) locaW.u16(loca[li]);
    var locaData = locaW.result();

    /* hmtx */
    var hmtxW = new BW();
    for (var hi = 0; hi < all.length; hi++) {
        var ga = clampInt(all[hi].advanceWidth, 1, 0xffff);
        var glsb = enc[hi].nContours > 0 ? enc[hi].xMin : 0;
        hmtxW.u16(ga); hmtxW.i16(glsb);
    }

    /* head */
    var now = Math.floor(Date.now() / 1000) + 2082844800; /* Mac epoch */
    var headW = new BW();
    headW.u32(0x00010000); headW.fixed(1.0); headW.u32(0); /* checkSumAdjustment 回填 */
    headW.u32(0x5F0F3CF5); headW.u16(0x000B); headW.u16(UNITS_PER_EM);
    headW.u32(Math.floor(now / 0x100000000)); headW.u32(now >>> 0);
    headW.u32(Math.floor(now / 0x100000000)); headW.u32(now >>> 0);
    headW.i16(xMinF); headW.i16(yMinF); headW.i16(xMaxF); headW.i16(yMaxF);
    headW.u16(0); headW.u16(8); headW.i16(2); headW.i16(0); headW.i16(0);
    var headData = headW.result();

    /* hhea */
    var hheaW = new BW();
    hheaW.u32(0x00010000);
    hheaW.i16(ASCENDER); hheaW.i16(DESCENDER); hheaW.i16(0);
    hheaW.u16(advMax); hheaW.i16(minLSB); hheaW.i16(minRSB); hheaW.i16(xMaxExtent);
    hheaW.i16(1); hheaW.i16(0); hheaW.i16(0);
    hheaW.i16(0); hheaW.i16(0); hheaW.i16(0); hheaW.i16(0);
    hheaW.i16(0); hheaW.u16(numGlyphs);

    /* maxp 1.0 */
    var maxpW = new BW();
    maxpW.fixed(1.0);
    maxpW.u16(numGlyphs);
    maxpW.u16(maxPoints); maxpW.u16(maxContours);
    maxpW.u16(0); maxpW.u16(0); maxpW.u16(1); maxpW.u16(0); maxpW.u16(0);
    maxpW.u16(0); maxpW.u16(0); maxpW.u16(0); maxpW.u16(0); maxpW.u16(0); maxpW.u16(0);

    /* OS/2 v1（86 字节，各字段严格按规范偏移） */
    var os2W = new BW();
    os2W.u16(1);
    os2W.i16(avgAdv);
    os2W.u16(400); os2W.u16(5); os2W.u16(0);
    os2W.i16(650); os2W.i16(700); os2W.i16(0); os2W.i16(140);
    os2W.i16(650); os2W.i16(700); os2W.i16(0); os2W.i16(479);
    os2W.i16(49); os2W.i16(258);
    os2W.i16(0);
    for (var p = 0; p < 10; p++) os2W.u8(0);
    os2W.u32(0); os2W.u32(0x10000000); os2W.u32(0); os2W.u32(0); /* ulUnicodeRange：bit60 = PUA plane 0 */
    os2W.u32(0); /* achVendID（规范为 4 字节） */
    os2W.u16(0); /* fsSelection */
    os2W.u16(PUA_START); /* usFirstCharIndex */
    os2W.u16(all[all.length - 1].codepoint); /* usLastCharIndex：all 末字形码点 */
    os2W.i16(ASCENDER); os2W.i16(DESCENDER); os2W.i16(0);
    os2W.u16(ASCENDER); os2W.u16(-DESCENDER);
    /* ulCodePageRange1/2；原末尾多余的 u16(0) 为 v2 字段 sxHeight 占位（其余 v2 字段未写），v1 下移除使表长恰为 86 */
    os2W.i16(0); os2W.i16(0); os2W.u16(0); os2W.u16(0x20);

    /* cmap */
    var pairs = [];
    for (var ci = 1; ci < all.length; ci++) pairs.push([all[ci].codepoint, ci]);
    pairs.sort(function (a, b) { return a[0] - b[0]; });
    var cmapSub = buildCmapFormat4(pairs);
    var cmapW = new BW();
    cmapW.u16(0); cmapW.u16(1);
    cmapW.u16(3); cmapW.u16(1); cmapW.u32(12);
    cmapW.raw(cmapSub);

    var nameData = buildNameTable(family, "Regular", psName);
    var postData = buildPostTable(all.map(function (g) { return g.name; }));

    var tables = [
        { tag: "OS/2", data: os2W.result() },
        { tag: "cmap", data: cmapW.result() },
        { tag: "glyf", data: glyfData },
        { tag: "head", data: headData },
        { tag: "hhea", data: hheaW.result() },
        { tag: "hmtx", data: hmtxW.result() },
        { tag: "loca", data: locaData },
        { tag: "maxp", data: maxpW.result() },
        { tag: "name", data: nameData },
        { tag: "post", data: postData }
    ];
    return buildSFNT(tables);
}

/* SFNT 目录组装＋checksum 调整 */
function buildSFNT(tables) {
    tables.sort(function (a, b) {
        for (var i = 0; i < 4; i++) {
            var d = a.tag.charCodeAt(i) - b.tag.charCodeAt(i);
            if (d) return d;
        }
        return 0;
    });
    var numTables = tables.length;
    var maxPow = 1;
    while (maxPow * 2 <= numTables) maxPow *= 2;
    var entrySelector = 0, t2 = maxPow;
    while (t2 > 1) { t2 /= 2; entrySelector++; }
    var padded = tables.map(function (tb) {
        var len = tb.data.length, pad = (4 - (len % 4)) % 4;
        var buf = new Uint8Array(len + pad);
        buf.set(tb.data, 0);
        return { tag: tb.tag, data: buf, length: len, checkSum: checksumOf(buf, buf.length) };
    });
    var w = new BW();
    w.u32(0x00010000);
    w.u16(numTables);
    w.u16(maxPow * 16); w.u16(entrySelector); w.u16(numTables * 16 - maxPow * 16);
    var offset = 12 + 16 * numTables;
    var entries = [];
    for (var i = 0; i < padded.length; i++) {
        entries.push({ tag: padded[i].tag, checkSum: padded[i].checkSum, offset: offset, length: padded[i].length });
        offset += padded[i].data.length;
    }
    for (var j = 0; j < entries.length; j++) {
        w.tag(entries[j].tag);
        w.u32(entries[j].checkSum); w.u32(entries[j].offset); w.u32(entries[j].length);
    }
    for (var k = 0; k < padded.length; k++) w.raw(padded[k].data);
    var font = w.result();
    /* checkSumAdjustment */
    var sum = checksumOf(font, font.length);
    var adj = (0xB1B0AFBA - sum) >>> 0;
    var headOff = null;
    for (var e2 = 0; e2 < entries.length; e2++) if (entries[e2].tag === "head") headOff = entries[e2].offset;
    font[headOff + 8] = (adj >>> 24) & 0xff; font[headOff + 9] = (adj >>> 16) & 0xff;
    font[headOff + 10] = (adj >>> 8) & 0xff; font[headOff + 11] = adj & 0xff;
    return font;
}

/* ================= 10. OTF 组装（经外部注入的 opentype.js 2.0.0） =================
 * opentype 参数由调用方传入：浏览器用 window.opentype，node 测试用 vendor 文件加载。
 * opentype.js 2.0.0 的 toArrayBuffer() 生成 CFF 轮廓（OTTO 签名），即标准 OTF。
 */
function buildOTF(opentype, glyphs, opts) {
    if (!opentype || !opentype.Font) throw new Error("opentype.js 未加载");
    opts = opts || {};
    var family = trim(opts.familyName) || "IconFont";
    function r(v) { return round(v * 100) / 100; }
    var otGlyphs = [new opentype.Glyph({ name: ".notdef", unicode: 0, advanceWidth: UNITS_PER_EM, path: new opentype.Path() })];
    for (var i = 0; i < glyphs.length; i++) {
        (function (g) {
            var p = new opentype.Path();
            for (var s = 0; s < g.subpaths.length; s++) {
                var sp = g.subpaths[s];
                p.moveTo(r(sp.start.x), r(sp.start.y));
                for (var k = 0; k < sp.segs.length; k++) {
                    var sg = sp.segs[k];
                    if (sg.t === "L") p.lineTo(r(sg.x), r(sg.y));
                    else p.curveTo(r(sg.c1x), r(sg.c1y), r(sg.c2x), r(sg.c2y), r(sg.x), r(sg.y));
                }
                if (sp.closed) p.closePath();
            }
            otGlyphs.push(new opentype.Glyph({
                name: g.name, unicode: g.codepoint,
                advanceWidth: clampInt(g.advanceWidth, 1, 0xffff), path: p
            }));
        })(glyphs[i]);
    }
    var font = new opentype.Font({
        familyName: family, styleName: "Regular",
        unitsPerEm: UNITS_PER_EM, ascender: ASCENDER, descender: DESCENDER,
        glyphs: otGlyphs
    });
    return font.toArrayBuffer();
}

/* ================= 11. CSS 使用代码生成 ================= */
function cssClassName(glyphName) {
    return "icon-" + glyphName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "icon-glyph";
}
function buildCSS(familyName, glyphs, fileName) {
    var family = trim(familyName) || "IconFont";
    var ttf = fileName || (family.replace(/\s+/g, "") + ".ttf");
    var lines = [];
    lines.push("@font-face {");
    lines.push("  font-family: '" + family + "';");
    lines.push("  src: url('" + ttf + "') format('truetype');");
    lines.push("  font-weight: normal;");
    lines.push("  font-style: normal;");
    lines.push("  font-display: block;");
    lines.push("}");
    lines.push("");
    lines.push(".icon {");
    lines.push("  font-family: '" + family + "' !important;");
    lines.push("  font-style: normal;");
    lines.push("  font-weight: normal;");
    lines.push("  font-variant: normal;");
    lines.push("  text-transform: none;");
    lines.push("  line-height: 1;");
    lines.push("  -webkit-font-smoothing: antialiased;");
    lines.push("  -moz-osx-font-smoothing: grayscale;");
    lines.push("}");
    lines.push("");
    for (var i = 0; i < glyphs.length; i++) {
        var g = glyphs[i];
        lines.push("." + cssClassName(g.name) + "::before {");
        lines.push("  content: \"" + cssUnicodeEscape(g.codepoint) + "\"; /* " + codepointLabel(g.codepoint) + " " + g.name + " */");
        lines.push("}");
        if (i < glyphs.length - 1) lines.push("");
    }
    return lines.join("\n");
}

/* ================= 12. 对外 API ================= */
var SvgFont = {
    UNITS_PER_EM: UNITS_PER_EM, ASCENDER: ASCENDER, DESCENDER: DESCENDER,
    PUA_START: PUA_START,
    trim: trim,
    parseTransform: parseTransform, matMul: matMul, matApply: matApply,
    parseSvg: parseSvg,
    parsePathData: parsePathData, arcToCubics: arcToCubics,
    shapeToSubpaths: shapeToSubpaths,
    normalizeSubpaths: normalizeSubpaths,
    sanitizeGlyphName: sanitizeGlyphName,
    assignCodepoints: assignCodepoints,
    codepointLabel: codepointLabel, cssUnicodeEscape: cssUnicodeEscape, cssClassName: cssClassName,
    buildGlyphFromSvg: buildGlyphFromSvg,
    cubicToQuadratics: cubicToQuadratics,
    subpathToContour: subpathToContour, glyphSubpathsToContours: glyphSubpathsToContours,
    encodeSimpleGlyph: encodeSimpleGlyph,
    buildCmapFormat4: buildCmapFormat4, buildNameTable: buildNameTable, buildPostTable: buildPostTable,
    buildSFNT: buildSFNT,
    buildTTF: buildTTF,
    buildOTF: buildOTF,
    buildCSS: buildCSS
};

/* ================= 13. 浏览器 UI 装配 ================= */
if (typeof document !== "undefined" && typeof window !== "undefined") {
    (function () {
        window.SvgFont = SvgFont;
        function $(id) { return document.getElementById(id); }
        function esc(s) {
            return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
                return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
            });
        }
        var toastTimer = null;
        function toast(msg) {
            var t = $("s2f-toast");
            t.textContent = msg;
            t.className = "show";
            if (toastTimer) clearTimeout(toastTimer);
            toastTimer = setTimeout(function () { t.className = ""; }, 2600);
        }

        var queue = []; /* {id, filename, svgText, status, glyphName, codepoint, glyph, error, warnings} */
        var seq = 0, pastedSeq = 0;
        var previewURL = null, previewFamily = "";
        var lastResult = null; /* {glyphs, family} 最近一次生成结果，供下载/CSS 用 */

        function addSvgText(filename, text) {
            var item = { id: ++seq, filename: filename, svgText: text, status: "pending", glyphName: "", codepoint: 0, glyph: null, error: "", warnings: [] };
            var r = SvgFont.buildGlyphFromSvg(filename, text);
            if (r.ok) {
                item.status = "ok";
                item.glyph = r;
                item.warnings = r.warnings || [];
            } else {
                item.status = "error";
                item.error = r.error;
            }
            queue.push(item);
            renderQueue();
            return item;
        }

        function readFiles(files) {
            var list = Array.prototype.slice.call(files || []);
            var svgFiles = list.filter(function (f) { return /\.svg$/i.test(f.name) || (f.type || "").indexOf("svg") !== -1; });
            if (!svgFiles.length) { toast("请选择 .svg 文件"); return; }
            svgFiles.forEach(function (f) {
                var rd = new FileReader();
                rd.onload = function () { addSvgText(f.name, String(rd.result || "")); };
                rd.onerror = function () {
                    queue.push({ id: ++seq, filename: f.name, svgText: "", status: "error", glyphName: "", codepoint: 0, glyph: null, error: "文件读取失败", warnings: [] });
                    renderQueue();
                };
                rd.readAsText(f);
            });
        }

        function renderQueue() {
            var box = $("s2f-list");
            if (!queue.length) {
                box.innerHTML = '<div class="s2f-empty">队列为空：拖入 .svg 文件，或粘贴 SVG 代码后点「加入队列」。非法文件会标红并给出原因，不影响其他文件。</div>';
            } else {
                var html = "";
                for (var i = 0; i < queue.length; i++) {
                    (function (it) {
                        var cls = it.status === "ok" ? "s2f-done" : (it.status === "error" ? "s2f-error" : "");
                        html += '<div class="s2f-row ' + cls + '">';
                        html += '<div class="s2f-row-head"><div class="s2f-name"><i class="material-icons">' +
                            (it.status === "error" ? "error_outline" : "shapes") + '</i><span title="' + esc(it.filename) + '">' + esc(it.filename) + "</span></div>";
                        if (it.status === "ok") {
                            html += '<span class="s2f-chip s2f-chip-ok">解析成功</span>';
                            html += '<span class="s2f-chip s2f-chip-cp">' + esc(SvgFont.codepointLabel(it.codepoint || 0xE000)) + "</span>";
                            if (it.warnings.length) html += '<span class="s2f-chip s2f-chip-warn" title="' + esc(it.warnings.join("\n")) + '">有 ' + it.warnings.length + " 条提示</span>";
                        } else if (it.status === "error") {
                            html += '<span class="s2f-chip s2f-chip-bad">解析失败</span>';
                        }
                        html += '<button type="button" class="s2f-icon-btn" data-del="' + it.id + '" title="移除"><i class="material-icons">close</i></button></div>';
                        if (it.status === "ok") {
                            html += '<div class="s2f-glyphname"><span>字形名</span><input type="text" data-gname="' + it.id + '" value="' + esc(it.glyphName || "") + '" placeholder="留空按文件名自动生成"></div>';
                        } else if (it.status === "error") {
                            html += '<div class="s2f-errmsg"><i class="material-icons">error_outline</i><div>' + esc(it.error) + "</div></div>";
                        }
                        html += "</div>";
                    })(queue[i]);
                }
                box.innerHTML = html;
                var dels = box.querySelectorAll("[data-del]");
                for (var d = 0; d < dels.length; d++) {
                    (function (btn) {
                        btn.onclick = function () {
                            var id = +btn.getAttribute("data-del");
                            queue = queue.filter(function (it) { return it.id !== id; });
                            renderQueue();
                        };
                    })(dels[d]);
                }
                var gnames = box.querySelectorAll("[data-gname]");
                for (var g = 0; g < gnames.length; g++) {
                    (function (inp) {
                        inp.oninput = function () {
                            var id = +inp.getAttribute("data-gname");
                            for (var k = 0; k < queue.length; k++) if (queue[k].id === id) queue[k].glyphName = inp.value;
                        };
                    })(gnames[g]);
                }
            }
            var okCount = queue.filter(function (it) { return it.status === "ok"; }).length;
            $("s2f-gen-btn").disabled = !okCount;
            $("s2f-summary").textContent = queue.length ? ("队列 " + queue.length + " 个文件，可生成 " + okCount + " 个字形") : "";
        }

        function collectGlyphs() {
            var used = {};
            var glyphs = [];
            var cps = SvgFont.assignCodepoints(queue.filter(function (it) { return it.status === "ok"; }).length);
            var ci = 0;
            for (var i = 0; i < queue.length; i++) {
                var it = queue[i];
                if (it.status !== "ok") continue;
                var name = trim(it.glyphName) ? SvgFont.sanitizeGlyphName(it.glyphName, used) : SvgFont.sanitizeGlyphName(it.filename, used);
                /* 用户手填名也做合法化（sanitize 内部去重） */
                glyphs.push({
                    name: name, codepoint: cps[ci],
                    subpaths: it.glyph.subpaths, advanceWidth: it.glyph.advanceWidth,
                    filename: it.filename
                });
                it.codepoint = cps[ci];
                ci++;
            }
            return glyphs;
        }

        function doGenerate() {
            var family = trim($("s2f-family").value) || "IconFont";
            var glyphs = collectGlyphs();
            if (!glyphs.length) { toast("没有可生成的字形"); return; }
            var ttfBytes;
            try {
                ttfBytes = SvgFont.buildTTF(glyphs, { familyName: family });
            } catch (e) {
                toast("字体组装失败：" + (e && e.message || e));
                return;
            }
            lastResult = { glyphs: glyphs, family: family, ttfBytes: ttfBytes };
            renderQueue();
            renderPreview();
            renderCSS();
            $("s2f-dl-ttf").disabled = false;
            $("s2f-dl-otf").disabled = false;
            $("s2f-copy-css").disabled = false;
            toast("已生成 " + glyphs.length + " 个字形（" + SvgFont.codepointLabel(glyphs[0].codepoint) + " 起）");
            document.getElementById("s2f-preview-panel").scrollIntoView({ behavior: "smooth", block: "start" });
        }

        function renderPreview() {
            if (previewURL) { URL.revokeObjectURL(previewURL); previewURL = null; }
            var res = lastResult;
            var grid = $("s2f-grid");
            if (!res) { grid.innerHTML = '<div class="s2f-empty">生成后此处显示字形网格预览。</div>'; return; }
            var blob = new Blob([res.ttfBytes], { type: "font/ttf" });
            previewURL = URL.createObjectURL(blob);
            previewFamily = "S2FPreview" + Date.now();
            var st = $("s2f-fontface-style");
            st.textContent = "@font-face{font-family:'" + previewFamily + "';src:url('" + previewURL + "') format('truetype');}";
            var html = "";
            for (var i = 0; i < res.glyphs.length; i++) {
                (function (g) {
                    html += '<div class="s2f-cell">';
                    html += '<div class="s2f-big" style="font-family:\'' + previewFamily + '\'">' + String.fromCodePoint(g.codepoint) + "</div>";
                    html += '<div class="s2f-code">' + esc(SvgFont.codepointLabel(g.codepoint)) + "</div>";
                    html += '<div class="s2f-gname">' + esc(g.name) + "</div>";
                    html += "</div>";
                })(res.glyphs[i]);
            }
            grid.innerHTML = html;
        }

        function renderCSS() {
            var res = lastResult;
            $("s2f-css").textContent = res ? SvgFont.buildCSS(res.family, res.glyphs) : "";
        }

        function downloadBlob(bytes, filename, mime) {
            var blob = new Blob([bytes], { type: mime });
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click();
            setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 800);
        }

        function bind() {
            var dz = $("s2f-dropzone"), fi = $("s2f-file-input");
            dz.addEventListener("click", function (e) {
                if (e.target.closest("button")) return;
                fi.click();
            });
            $("s2f-pick-btn").addEventListener("click", function () { fi.click(); });
            fi.addEventListener("change", function () { readFiles(fi.files); fi.value = ""; });
            ["dragenter", "dragover"].forEach(function (ev) {
                dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add("s2f-drag"); });
            });
            ["dragleave", "drop"].forEach(function (ev) {
                dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove("s2f-drag"); });
            });
            dz.addEventListener("drop", function (e) {
                var dt = e.dataTransfer;
                if (dt && dt.files && dt.files.length) readFiles(dt.files);
            });
            $("s2f-add-paste-btn").addEventListener("click", function () {
                var txt = $("s2f-paste").value;
                if (!trim(txt)) { toast("请先粘贴 SVG 代码"); return; }
                addSvgText("pasted-" + (++pastedSeq) + ".svg", txt);
                $("s2f-paste").value = "";
            });
            $("s2f-sample-btn").addEventListener("click", function () {
                $("s2f-paste").value = SAMPLE_SVG;
                toast("已填入示例 SVG，可点「加入队列」");
            });
            $("s2f-gen-btn").addEventListener("click", doGenerate);
            $("s2f-clear-btn").addEventListener("click", function () {
                queue = []; lastResult = null;
                $("s2f-dl-ttf").disabled = true; $("s2f-dl-otf").disabled = true; $("s2f-copy-css").disabled = true;
                renderQueue(); renderPreview(); renderCSS();
            });
            $("s2f-dl-ttf").addEventListener("click", function () {
                if (!lastResult) return;
                downloadBlob(lastResult.ttfBytes, lastResult.family.replace(/\s+/g, "") + ".ttf", "font/ttf");
                toast("TTF 已下载");
            });
            $("s2f-dl-otf").addEventListener("click", function () {
                if (!lastResult) return;
                var ot = window.opentype;
                if (!ot) { toast("opentype.js 未加载，无法生成 OTF"); return; }
                try {
                    var buf = SvgFont.buildOTF(ot, lastResult.glyphs, { familyName: lastResult.family });
                    downloadBlob(buf, lastResult.family.replace(/\s+/g, "") + ".otf", "font/otf");
                    toast("OTF 已下载");
                } catch (e) { toast("OTF 生成失败：" + (e && e.message || e)); }
            });
            $("s2f-copy-css").addEventListener("click", function () {
                if (!lastResult) return;
                var css = SvgFont.buildCSS(lastResult.family, lastResult.glyphs);
                function done() { toast("CSS 代码已复制"); }
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(css).then(done, function () { fallbackCopy(css); done(); });
                } else { fallbackCopy(css); done(); }
            });
            function fallbackCopy(text) {
                var ta = document.createElement("textarea");
                ta.value = text;
                document.body.appendChild(ta); ta.select();
                try { document.execCommand("copy"); } catch (e) {}
                document.body.removeChild(ta);
            }
        }

        var SAMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n' +
            '  <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/>\n' +
            "</svg>";

        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { bind(); renderQueue(); renderPreview(); });
        else { bind(); renderQueue(); renderPreview(); }
    })();
}

/* ================= 14. node 测试导出 ================= */
if (typeof module !== "undefined" && module.exports) {
    module.exports = SvgFont;
}
})();
