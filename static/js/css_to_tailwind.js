/* CSS 转 Tailwind 转换器 —— 纯前端映射引擎（零依赖、零网络请求）
 * 导出给 node 单元测试的纯函数：parseCss / mapDeclaration / convertCss / 工具函数
 * 浏览器 DOM 初始化仅在 document 存在时执行。
 */
(function () {
"use strict";

/* ================= Tailwind 色板（精确匹配用，全部小写 hex） ================= */
var SHADES = ["50","100","200","300","400","500","600","700","800","900","950"];
var PALETTE = {
    slate:   ["#f8fafc","#f1f5f9","#e2e8f0","#cbd5e1","#94a3b8","#64748b","#475569","#334155","#1e293b","#0f172a","#020617"],
    gray:    ["#f9fafb","#f3f4f6","#e5e7eb","#d1d5db","#9ca3af","#6b7280","#4b5563","#374151","#1f2937","#111827","#030712"],
    zinc:    ["#fafafa","#f4f4f5","#e4e4e7","#d4d4d8","#a1a1aa","#71717a","#52525b","#3f3f46","#27272a","#18181b","#09090b"],
    neutral: ["#fafafa","#f5f5f5","#e5e5e5","#d4d4d4","#a3a3a3","#737373","#525252","#404040","#262626","#171717","#0a0a0a"],
    stone:   ["#fafaf9","#f5f5f4","#e7e5e4","#d6d3d1","#a8a29e","#78716c","#57534e","#44403c","#292524","#1c1917","#0c0a09"],
    red:     ["#fef2f2","#fee2e2","#fecaca","#fca5a5","#f87171","#ef4444","#dc2626","#b91c1c","#991b1b","#7f1d1d","#450a0a"],
    orange:  ["#fff7ed","#ffedd5","#fed7aa","#fdba74","#fb923c","#f97316","#ea580c","#c2410c","#9a3412","#7c2d12","#431407"],
    amber:   ["#fffbeb","#fef3c7","#fde68a","#fcd34d","#fbbf24","#d97706","#b45309","#92400e","#78350f","#451a03","#451a03"],
    yellow:  ["#fefce8","#fef9c3","#fef08a","#fde047","#facc15","#eab308","#ca8a04","#a16207","#854d0e","#422006","#422006"],
    lime:    ["#f7fee7","#ecfccb","#d9f99d","#bef264","#a3e635","#84cc16","#65a30d","#4d7c0f","#3f6212","#1a2e05","#1a2e05"],
    green:   ["#f0fdf4","#dcfce7","#bbf7d0","#86efac","#4ade80","#22c55e","#16a34a","#15803d","#166534","#14532d","#052e16"],
    emerald: ["#ecfdf5","#d1fae5","#a7f3d0","#6ee7b7","#34d399","#10b981","#059669","#047857","#065f46","#064e3b","#022c22"],
    teal:    ["#f0fdfa","#ccfbf1","#99f6e4","#5eead4","#2dd4bf","#14b8a6","#0d9488","#0f766e","#115e59","#134e4a","#042f2e"],
    cyan:    ["#ecfeff","#cffafe","#a5f3fc","#67e8f9","#22d3ee","#06b6d4","#0e7490","#155e75","#164e63","#083344","#083344"],
    sky:     ["#f0f9ff","#e0f2fe","#bae6fd","#7dd3fc","#38bdf8","#0ea5e9","#0284c7","#0369a1","#0c4a6e","#082f49","#082f49"],
    blue:    ["#eff6ff","#dbeafe","#bfdbfe","#93c5fd","#60a5fa","#3b82f6","#2563eb","#1d4ed8","#1e40af","#1e3a8a","#172554"],
    indigo:  ["#eef2ff","#e0e7ff","#c7d2fe","#a5b4fc","#818cf8","#6366f1","#4f46e5","#4338ca","#3730a3","#312e81","#1e1b4e"],
    violet:  ["#f5f3ff","#ede9fe","#ddd6fe","#c4b5fd","#a78bfa","#8b5cf6","#7c3aed","#6d28d9","#5b21b6","#4c1d95","#2e1065"],
    purple:  ["#faf5ff","#f3e8ff","#e9d5ff","#d8b4fe","#c084fc","#a855f7","#9333ea","#7e22ce","#6b21a8","#581c87","#3b0764"],
    fuchsia: ["#fdf4ff","#fae8ff","#f5d0fe","#f0abfc","#e879f9","#d946ef","#c026d3","#a21caf","#86198f","#701a75","#4a044e"],
    pink:    ["#fdf2f8","#fce7f3","#fbcfe8","#f9a8d4","#f472b6","#ec4899","#db2777","#be185d","#9d174d","#831843","#500724"],
    rose:    ["#fff1f2","#ffe4e6","#fecdd3","#fda4af","#fb7185","#f43f5e","#e11d48","#be123c","#9f1239","#881337","#4c0519"]
};
var HEX2NAME = {};
Object.keys(PALETTE).forEach(function (c) {
    PALETTE[c].forEach(function (hex, i) { HEX2NAME[hex] = c + "-" + SHADES[i]; });
});
HEX2NAME["#ffffff"] = "white";
HEX2NAME["#000000"] = "black";
/* CSS 颜色关键字（常用）→ hex */
var NAMED_COLORS = {
    white: "#ffffff", black: "#000000", transparent: "transparent",
    red: "#ff0000", green: "#008000", blue: "#0000ff", yellow: "#ffff00",
    orange: "#ffa500", purple: "#800080", pink: "#ffc0cb", gray: "#808080",
    grey: "#808080", silver: "#c0c0c0", maroon: "#800000", olive: "#808000",
    lime: "#00ff00", aqua: "#00ffff", teal: "#008080", navy: "#000080",
    fuchsia: "#ff00ff"
};

/* ================= 间距 scale（px → 命名） ================= */
var SPACING = {
    0: "0", 1: "px", 2: "0.5", 4: "1", 6: "1.5", 8: "2", 10: "2.5",
    12: "3", 14: "3.5", 16: "4", 20: "5", 24: "6", 28: "7", 32: "8",
    36: "9", 40: "10", 44: "11", 48: "12", 56: "14", 64: "16", 80: "20",
    96: "24", 112: "28", 128: "32", 144: "36", 160: "40", 176: "44",
    192: "48", 208: "52", 224: "56", 240: "60", 256: "64", 288: "72",
    320: "80", 384: "96"
};

/* ================= 工具函数 ================= */
function trim(s) { return String(s).replace(/^\s+|\s+$/g, ""); }

/* 解析长度：返回 {num, unit}；失败返回 null。支持 px/rem/em/%/vw/vh 等 */
function parseLen(v) {
    var m = /^(-?\d*\.?\d+)(px|rem|em|%|vw|vh|vmin|vmax|ch|ex)?$/i.exec(trim(v));
    if (!m) return null;
    return { num: parseFloat(m[1]), unit: (m[2] || "px").toLowerCase() };
}
/* 长度换算为 px（rem/em 按 16px；% 等无法换算返回 null） */
function lenToPx(v) {
    var l = parseLen(v);
    if (!l) return null;
    if (l.unit === "px") return l.num;
    if (l.unit === "rem" || l.unit === "em") return l.num * 16;
    return null;
}
/* px → spacing 命名；version v4 支持动态 scale（任意 px 值合法）；失败返回 null */
function spacingName(px, version) {
    if (px === 0) return "0";
    var neg = px < 0;
    var a = Math.abs(px);
    var name = SPACING[a];
    if (!name && version === "v4") {
        name = String(Math.round(a / 4 * 100) / 100); /* v4 动态间距：如 15px→3.75、3px→0.75 */
    }
    if (!name) return null;
    return (neg ? "-" : "") + name;
}
/* 间距类名拼接：name 形如 "4" / "-4" / "[15px] / auto" */
function spCls(b, s, v) {
    if (v === "auto") return b + s + "-auto";
    if (v.charAt(0) === "-") return "-" + b + s + "-" + v.slice(1);
    return b + s + "-" + v;
}
/* 定位类名拼接（top/right/bottom/left/inset） */
function posCls(pre, name) {
    if (name.charAt(0) === "-") return "-" + pre + "-" + name.slice(1);
    return pre + "-" + name;
}
function arb(v) { return "[" + trim(v).replace(/\s+/g, "_") + "]"; }

/* 颜色归一化 → {hex} / {name:'transparent'}；失败返回 null */
function normalizeColor(v) {
    v = trim(v).toLowerCase();
    if (v === "transparent") return { key: "transparent" };
    if (NAMED_COLORS[v]) {
        var nv = NAMED_COLORS[v];
        return nv === "transparent" ? { key: "transparent" } : { hex: nv };
    }
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
    if (m) {
        var h = m[1].toLowerCase();
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        return { hex: "#" + h };
    }
    m = /^rgba?\(\s*([^)]+)\)$/i.exec(v);
    if (m) {
        var parts = m[1].split(/[\s,\/]+/).filter(function (p) { return p !== ""; });
        if (parts.length < 3) return null;
        var rgb = [];
        for (var i = 0; i < 3; i++) {
            var p = parts[i], n;
            if (/%$/.test(p)) n = Math.round(parseFloat(p) * 2.55);
            else n = parseInt(p, 10);
            if (isNaN(n) || n < 0 || n > 255) return null;
            rgb.push(n);
        }
        var alpha = parts.length >= 4 ? parseFloat(parts[3].replace("%", "")) : 1;
        if (parts.length >= 4 && /%$/.test(parts[3])) alpha = alpha / 100;
        var hex = "#" + rgb.map(function (n) {
            var s = n.toString(16); return s.length === 1 ? "0" + s : s;
        }).join("");
        if (alpha !== 1) return { arbitrary: true, hex: hex, alpha: alpha };
        return { hex: hex };
    }
    return null;
}
/* 颜色 → 工具类：精确色板命中命名类，否则任意值；prefix 如 text/bg/border */
function colorClass(prop, value, prefix) {
    var c = normalizeColor(value);
    if (!c) return null;
    if (c.key === "transparent") return prefix + "-transparent";
    if (c.arbitrary) return prefix + "-" + arb(value);
    var name = HEX2NAME[c.hex];
    if (name) return prefix + "-" + name;
    return prefix + "-" + arb(c.hex);
}

/* v3 → v4 类名重命名（仅影响官方改名的差异项；rounded-lg/shadow-md 等保持不变） */
function toV4(cls) {
    if (cls.charAt(0) === "[") return cls;
    var bi = cls.indexOf("[");
    var body = bi === -1 ? cls : cls.slice(0, bi);
    var suffix = bi === -1 ? "" : cls.slice(bi);
    if (suffix && /-$/.test(body)) return cls; /* rounded-[4px] 等任意值保持原样 */
    var exact = {
        "rounded-sm": "rounded-xs", "rounded": "rounded-sm",
        "shadow-sm": "shadow-xs", "shadow": "shadow-sm",
        "blur-sm": "blur-xs", "blur": "blur-sm",
        "flex-shrink": "shrink", "flex-grow": "grow",
        "outline-none": "outline-hidden"
    };
    if (exact[body]) return exact[body] + suffix;
    var rep = [
        [/^bg-gradient-/, "bg-linear-"],
        [/^flex-shrink-/, "shrink-"],
        [/^flex-grow-/, "grow-"],
        [/^(rounded-(?:tl|tr|bl|br|t|b|l|r|s|e|ss|se|es|ee))-sm$/, "$1-xs"],
        [/^(rounded-(?:tl|tr|bl|br|t|b|l|r|s|e|ss|se|es|ee))$/, "$1-sm"]
    ];
    for (var i = 0; i < rep.length; i++) {
        if (rep[i][0].test(body)) { body = body.replace(rep[i][0], rep[i][1]); break; }
    }
    return body + suffix;
}

/* ================= 声明 → 工具类 映射 =================
 * 返回 {decl, classes:[], kind:'named'|'arbitrary'|'unsupported', note}
 * kind 命名类：全部命中命名工具类；任意值：用了 [...] 兜底；不支持：输出原声明+注释
 */
function mapDeclaration(propRaw, valueRaw, version) {
    version = version === "v4" ? "v4" : "v3";
    var prop = trim(propRaw).toLowerCase();
    var value = trim(valueRaw);
    var decl = prop + ": " + value;
    var important = false;
    var im = /\s*!important\s*$/i.exec(value);
    if (im) { important = true; value = trim(value.slice(0, im.index)); decl = prop + ": " + value + " !important"; }

    function done(classes, kind, note) {
        classes = (classes || []).map(function (c) { return version === "v4" ? toV4(c) : c; });
        if (important) {
            classes = classes.map(function (c) {
                return version === "v4" ? c + "!" : "!" + c;
            });
        }
        return { decl: decl, classes: classes, kind: kind || "named", note: note || "" };
    }
    function unsupported(note) {
        return { decl: decl, classes: [], kind: "unsupported", note: note || "暂无对应工具类，需手写 CSS" };
    }
    function arbitraryProp() {
        /* 通用兜底：[prop:value] 任意属性语法 */
        if (!/^[a-z][a-z0-9-]*$/.test(prop)) return null;
        if (/[;{}]/.test(value) || value.length > 200) return null;
        return done(["[" + prop + ":" + value.replace(/\s+/g, "_") + "]"], "arbitrary", "命名类未命中，已用任意属性语法兜底");
    }

    /* ---- CSS 变量 ---- */
    if (prop.indexOf("--") === 0) return unsupported("CSS 变量需在 tailwind.config / v4 @theme 中定义后使用");

    /* ---- 间距：margin / padding（含简写展开） ---- */
    var mp = /^(margin|padding)(-(top|right|bottom|left))?$/.exec(prop);
    if (mp) {
        var base = mp[1] === "margin" ? "m" : "p";
        var sideMap = { top: "t", right: "r", bottom: "b", left: "l" };
        if (mp[2]) {
            var v = trim(value);
            if (v === "auto") return done([spCls(base, sideMap[mp[3]], "auto")], "named");
            var px = lenToPx(v);
            if (px === null) { var ap = arbitraryProp(); return ap || unsupported(); }
            if (px < 0 && base === "p") return unsupported("padding 不支持负值");
            var n = spacingName(px, version);
            if (n) return done([spCls(base, sideMap[mp[3]], n)]);
            return done([base + sideMap[mp[3]] + "-" + arb(v)], "arbitrary", "超出命名 scale，已用任意值");
        }
        var parts = splitValues(value);
        if (parts.length >= 1 && parts.length <= 4) {
            var vals = expandBox(parts);
            if (!vals) { var ap2 = arbitraryProp(); return ap2 || unsupported(); }
            var out = [], okAll = true, hasArb = false;
            var sides = [["top", "t"], ["right", "r"], ["bottom", "b"], ["left", "l"]];
            var comp = {};
            for (var si = 0; si < 4; si++) {
                var sv = trim(vals[si]);
                if (sv === "auto") { comp[sides[si][0]] = "auto"; continue; }
                var spx = lenToPx(sv);
                if (spx === null) { okAll = false; break; }
                if (spx < 0 && base === "p") return unsupported("padding 不支持负值");
                var sn = spacingName(spx, version);
                if (!sn) { hasArb = true; comp[sides[si][0]] = arb(sv); }
                else comp[sides[si][0]] = sn;
            }
            if (!okAll) { var ap3 = arbitraryProp(); return ap3 || unsupported(); }
            /* 合并：四边相同→m-；上下/左右各自相同→my-/mx-；否则逐边 */
            var T = comp.top, R = comp.right, B = comp.bottom, L = comp.left;
            if (T === R && R === B && B === L && T !== "auto") {
                out.push(spCls(base, "", T));
            } else if (T === B && L === R) {
                out.push(spCls(base, "y", T), spCls(base, "x", L));
            } else if (T === B) {
                out.push(spCls(base, "y", T), spCls(base, "l", L), spCls(base, "r", R));
            } else if (L === R) {
                out.push(spCls(base, "t", T), spCls(base, "x", L), spCls(base, "b", B));
            } else {
                out.push(spCls(base, "t", T), spCls(base, "r", R), spCls(base, "b", B), spCls(base, "l", L));
            }
            return done(out, hasArb ? "arbitrary" : "named", hasArb ? "部分值超出命名 scale，已用任意值" : "");
        }
        var ap4 = arbitraryProp(); return ap4 || unsupported();
    }

    /* ---- gap ---- */
    if (prop === "gap" || prop === "row-gap" || prop === "column-gap" || prop === "grid-gap") {
        var gbase = prop === "row-gap" ? "gap-y" : (prop === "column-gap" ? "gap-x" : "gap");
        var gp = splitValues(value);
        if (gp.length === 1) {
            var gpx = lenToPx(gp[0]);
            if (gpx !== null) {
                var gn = spacingName(gpx, version);
                if (gn) return done([gbase + "-" + gn]);
                return done([gbase + "-" + arb(gp[0])], "arbitrary", "超出命名 scale，已用任意值");
            }
        } else if (gp.length === 2 && gbase === "gap") {
            var ay = lenToPx(gp[0]), ax = lenToPx(gp[1]);
            if (ay !== null && ax !== null) {
                var ny = spacingName(ay, version), nx = spacingName(ax, version);
                if (ny && nx) return done(["gap-y-" + ny, "gap-x-" + nx]);
                return done(["gap-" + arb(gp[0] + " " + gp[1])], "arbitrary", "超出命名 scale，已用任意值");
            }
        }
        var apg = arbitraryProp(); return apg || unsupported();
    }

    /* ---- 宽高 ---- */
    var wh = /^(width|height|min-width|max-width|min-height|max-height)$/.exec(prop);
    if (wh) {
        var wmap = {
            width: "w", height: "h",
            "min-width": "min-w", "max-width": "max-w",
            "min-height": "min-h", "max-height": "max-h"
        };
        var pre = wmap[prop];
        var vv = trim(value).toLowerCase();
        var namedWH = {
            auto: "auto", "100%": prop === "max-width" || prop === "max-height" ? "full" : "full",
            "100vw": "screen", "100vh": "screen", "100dvw": "screen", "100dvh": "screen",
            "fit-content": "fit", "max-content": "max", "min-content": "min", "min-width": null
        };
        if (vv === "none" && prop === "max-width") return done(["max-w-none"]);
        if (namedWH[vv] !== undefined && namedWH[vv] !== null) {
            var cls = pre + "-" + namedWH[vv];
            if ((prop === "height" || prop === "min-height" || prop === "max-height") && vv === "100vh") cls = pre + "-screen";
            return done([cls]);
        }
        var frac = { "50%": "1/2", "33.333333%": "1/3", "33.3333%": "1/3", "66.666667%": "2/3", "66.6667%": "2/3", "25%": "1/4", "75%": "3/4", "20%": "1/5", "40%": "2/5", "60%": "3/5", "80%": "4/5", "16.666667%": "1/6", "16.6667%": "1/6", "83.333333%": "5/6", "83.3333%": "5/6", "8.333333%": "1/12", "8.3333%": "1/12", "41.666667%": "5/12", "58.333333%": "7/12" };
        if (frac[vv] && (prop === "width" || prop === "height")) return done([pre + "-" + frac[vv]]);
        var maxwScreen = { "640px": "screen-sm", "768px": "screen-md", "1024px": "screen-lg", "1280px": "screen-xl", "1536px": "screen-2xl" };
        if (prop === "max-width" && maxwScreen[vv]) return done(["max-w-" + maxwScreen[vv]]);
        var maxwRem = { "20rem": "xs", "24rem": "sm", "28rem": "md", "32rem": "lg", "36rem": "xl", "42rem": "2xl", "48rem": "3xl", "56rem": "4xl", "64rem": "5xl", "72rem": "6xl", "80rem": "7xl" };
        if (prop === "max-width" && maxwRem[vv]) return done(["max-w-" + maxwRem[vv]]);
        if (prop === "max-width") {
            var mwpx = lenToPx(value);
            if (mwpx !== null && maxwScreen[mwpx + "px"]) return done(["max-w-" + maxwScreen[mwpx + "px"]]);
        }
        var wpx = lenToPx(value);
        if (wpx !== null) {
            if (wpx === 1) return done([pre + "-px"]);
            var wn = spacingName(wpx, version);
            if (wn) return done([pre + "-" + wn]);
            return done([pre + "-" + arb(value)], "arbitrary", "超出命名 scale，已用任意值");
        }
        var apw = arbitraryProp(); return apw || unsupported();
    }

    /* ---- 字号 / 字重 / 行高 / 字距 ---- */
    if (prop === "font-size") {
        var fs = lenToPx(value);
        var fsMap = { 12: "text-xs", 14: "text-sm", 16: "text-base", 18: "text-lg", 20: "text-xl", 24: "text-2xl", 30: "text-3xl", 36: "text-4xl", 48: "text-5xl", 60: "text-6xl", 72: "text-7xl", 96: "text-8xl", 128: "text-9xl" };
        if (fs !== null && fsMap[fs]) return done([fsMap[fs]]);
        return done(["text-" + arb(value)], "arbitrary", "未命中字号命名类，已用任意值");
    }
    if (prop === "font-weight") {
        var fw = trim(value).toLowerCase();
        var fwMap = { 100: "font-thin", 200: "font-extralight", 300: "font-light", 400: "font-normal", 500: "font-medium", 600: "font-semibold", 700: "font-bold", 800: "font-extrabold", 900: "font-black", normal: "font-normal", bold: "font-bold" };
        if (fwMap[fw]) return done([fwMap[fw]]);
        var apf = arbitraryProp(); return apf || unsupported("font-weight 仅支持 100–900 / normal / bold");
    }
    if (prop === "line-height") {
        var lh = trim(value);
        var lhMap = { 1: "leading-none", "1.25": "leading-tight", "1.375": "leading-snug", "1.5": "leading-normal", "1.625": "leading-relaxed", 2: "leading-loose", normal: "leading-none" };
        if (lhMap[lh] !== undefined) return done([lhMap[lh]]);
        var lhp = lenToPx(lh);
        if (lhp !== null) return done(["leading-" + arb(value)], "arbitrary", "未命中行高命名类，已用任意值");
        var apl = arbitraryProp(); return apl || unsupported();
    }
    if (prop === "letter-spacing") {
        var ls = trim(value).toLowerCase();
        var lsMap = { "-0.05em": "tracking-tighter", "-0.025em": "tracking-tight", "0": "tracking-normal", "0em": "tracking-normal", "0px": "tracking-normal", "0.025em": "tracking-wide", "0.05em": "tracking-wider", "0.1em": "tracking-widest" };
        if (lsMap[ls]) return done([lsMap[ls]]);
        return done(["tracking-" + arb(value)], "arbitrary", "未命中字距命名类，已用任意值");
    }
    if (prop === "font-family") {
        var ff = trim(value).toLowerCase();
        if (/sans-serif/.test(ff)) return done(["font-sans"]);
        if (/serif/.test(ff)) return done(["font-serif"]);
        if (/monospace/.test(ff)) return done(["font-mono"]);
        return done(["font-" + arb(value)], "arbitrary", "未命中字体命名类，已用任意值");
    }
    if (prop === "font-style") {
        if (value === "italic") return done(["italic"]);
        if (value === "normal") return done(["not-italic"]);
        return unsupported();
    }

    /* ---- 文本 ---- */
    var textMap = {
        "text-align": { left: "text-left", center: "text-center", right: "text-right", justify: "text-justify", start: "text-start", end: "text-end" },
        "text-transform": { uppercase: "uppercase", lowercase: "lowercase", capitalize: "capitalize", none: "normal-case" },
        "text-decoration-line": { underline: "underline", "line-through": "line-through", none: "no-underline", overline: "overline" },
        "text-decoration": { underline: "underline", "line-through": "line-through", none: "no-underline", overline: "overline" },
        "text-decoration-style": { solid: "decoration-solid", double: "decoration-double", dotted: "decoration-dotted", dashed: "decoration-dashed", wavy: "decoration-wavy" },
        "white-space": { normal: "whitespace-normal", nowrap: "whitespace-nowrap", pre: "whitespace-pre", "pre-line": "whitespace-pre-line", "pre-wrap": "whitespace-pre-wrap", "break-spaces": "whitespace-break-spaces" },
        "word-break": { normal: "break-normal", "break-all": "break-all", "keep-all": "break-keep" },
        "overflow-wrap": { "break-word": "break-words", anywhere: "break-anywhere", normal: "break-normal" },
        "vertical-align": { baseline: "align-baseline", top: "align-top", middle: "align-middle", bottom: "align-bottom", "text-top": "align-text-top", "text-bottom": "align-text-bottom", sub: "align-sub", super: "align-super" }
    };
    if (textMap[prop]) {
        var tv = trim(value).toLowerCase();
        if (textMap[prop][tv]) return done([textMap[prop][tv]]);
        var apt = arbitraryProp(); return apt || unsupported();
    }
    if (prop === "text-decoration-thickness") {
        var tdt = trim(value).toLowerCase();
        var tdtMap = { auto: "decoration-auto", "from-font": "decoration-from-font", "1px": "decoration-1", "2px": "decoration-2", "4px": "decoration-4", "8px": "decoration-8" };
        if (tdtMap[tdt]) return done([tdtMap[tdt]]);
        return done(["decoration-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
    }
    if (prop === "text-decoration-color") {
        var tdc = colorClass(prop, value, "decoration");
        if (tdc) return done([tdc], /^decoration-(\[|#)/.test(tdc) ? "arbitrary" : "named", /^decoration-\[/.test(tdc) ? "色板未命中，已用任意值" : "");
        return unsupported();
    }
    if (prop === "text-overflow") {
        var tov = trim(value).toLowerCase();
        if (tov === "ellipsis") return done(["text-ellipsis"]);
        if (tov === "clip") return done(["text-clip"]);
        return unsupported();
    }

    /* ---- 颜色 ---- */
    var colorProps = { color: "text", "background-color": "bg", "border-color": "border", "outline-color": "outline", "caret-color": "caret", "accent-color": "accent", "fill": "fill", "stroke": "stroke", "column-rule-color": "column-rule" };
    if (colorProps[prop]) {
        var cc = colorClass(prop, value, colorProps[prop]);
        if (cc) {
            var isArb = /-\[/.test(cc);
            return done([cc], isArb ? "arbitrary" : "named", isArb ? "色板未精确命中，已用任意值" : "");
        }
        return unsupported("无法解析的颜色值");
    }
    if (prop === "opacity") {
        var op = parseFloat(trim(value));
        if (!isNaN(op) && op >= 0 && op <= 1) {
            var pct = Math.round(op * 100);
            if (pct % 5 === 0 || pct === 0 || pct === 100) return done(["opacity-" + pct]);
            return done(["opacity-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
        }
        return unsupported();
    }

    /* ---- 圆角 ---- */
    var radiusSide = /^(border-(top-left|top-right|bottom-left|bottom-right)-radius)$/.exec(prop);
    var radiusMap = { 0: "none", 2: "sm", 4: "", 6: "md", 8: "lg", 12: "xl", 16: "2xl", 24: "3xl" };
    function radiusName(v) {
        var r = trim(v).toLowerCase();
        if (r === "50%" || r === "9999px") return "full";
        var px = lenToPx(r);
        if (px === null || !(px in radiusMap)) return null;
        return radiusMap[px];
    }
    if (prop === "border-radius") {
        var rp = splitValues(value);
        if (rp.length === 1) {
            var rn = radiusName(rp[0]);
            if (rn !== null) return done(["rounded" + (rn ? "-" + rn : "")]);
            return done(["rounded-" + arb(rp[0])], "arbitrary", "未命中圆角命名类，已用任意值");
        }
        return done(["rounded-" + arb(value)], "arbitrary", "多值圆角无命名类，已用任意值");
    }
    if (radiusSide) {
        var cornerMap = { "top-left": "tl", "top-right": "tr", "bottom-left": "bl", "bottom-right": "br" };
        var rn2 = radiusName(value);
        if (rn2 !== null) return done(["rounded-" + cornerMap[radiusSide[2]] + (rn2 ? "-" + rn2 : "")]);
        return done(["rounded-" + cornerMap[radiusSide[2]] + "-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
    }

    /* ---- 边框 ---- */
    var bwSide = /^border-(top|right|bottom|left|inline-start|inline-end|block-start|block-end|x|y)?-?width$/.exec(prop);
    if (prop === "border-width" || bwSide) {
        var bwPre = "border";
        if (bwSide && bwSide[1]) bwPre = "border-" + ({ top: "t", right: "r", bottom: "b", left: "l", x: "x", y: "y" }[bwSide[1]] || bwSide[1]);
        var bw = trim(value).toLowerCase();
        var bwMap = { 0: "0", "0px": "0", thin: "0", medium: "", thick: "4", "1px": "", "2px": "2", "4px": "4", "8px": "8" };
        if (bwMap[bw] !== undefined) return done([bwPre + (bwMap[bw] ? "-" + bwMap[bw] : "")]);
        return done([bwPre + "-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
    }
    var borderShort = /^border(-(top|right|bottom|left|x|y))?$/.exec(prop);
    if (borderShort) {
        var bp = borderShort[2] ? "border-" + ({ top: "t", right: "r", bottom: "b", left: "l", x: "x", y: "y" }[borderShort[2]]) : "border";
        var bparts = splitValues(value);
        var bcls = [], bHasArb = false, bOk = true;
        bparts.forEach(function (p) {
            var pl = trim(p).toLowerCase();
            if (/^(solid|dashed|dotted|double|none|hidden|groove|ridge|inset|outset)$/.test(pl)) {
                bcls.push(pl === "none" ? bp + "-none" : bp + "-" + pl);
            } else if (parseLen(pl)) {
                var r2 = mapDeclaration(bp === "border" ? "border-width" : bp + "-width", pl, version);
                if (r2.kind === "unsupported") { bOk = false; } else { bcls = bcls.concat(r2.classes); if (r2.kind === "arbitrary") bHasArb = true; }
            } else {
                var cc2 = colorClass(prop, p, "border");
                if (cc2) { bcls.push(cc2); if (/-\[/.test(cc2)) bHasArb = true; }
                else bOk = false;
            }
        });
        if (bOk && bcls.length) return done(bcls, bHasArb ? "arbitrary" : "named", bHasArb ? "部分值用了任意值" : "");
        var apb = arbitraryProp(); return apb || unsupported("border 简写解析失败");
    }
    if (prop === "border-style") {
        var bs = trim(value).toLowerCase();
        if (/^(solid|dashed|dotted|double|none|hidden)$/.test(bs)) return done([bs === "none" ? "border-none" : "border-" + bs]);
        var apbs = arbitraryProp(); return apbs || unsupported();
    }
    if (prop === "border-collapse") {
        if (value === "collapse") return done(["border-collapse"]);
        if (value === "separate") return done(["border-separate"]);
        return unsupported();
    }
    if (prop === "outline") {
        if (trim(value).toLowerCase() === "none") return done([version === "v4" ? "outline-hidden" : "outline-none"]);
        var apol = arbitraryProp(); return apol || unsupported();
    }
    if (prop === "outline-width") {
        var owMap = { "0": "outline-0", "0px": "outline-0", "1px": "outline", "2px": "outline-2", "4px": "outline-4", "8px": "outline-8" };
        var owv = trim(value).toLowerCase();
        if (owMap[owv]) return done([version === "v4" && owMap[owv] === "outline-none" ? "outline-hidden" : owMap[owv]]);
        return done(["outline-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
    }
    if (prop === "outline-style") {
        var os = trim(value).toLowerCase();
        if (/^(solid|dashed|dotted|double|none|hidden)$/.test(os)) return done(["outline-" + os]);
        return unsupported();
    }
    if (prop === "outline-offset") {
        var oopx = lenToPx(value);
        if (oopx !== null) {
            var on = spacingName(oopx, version);
            if (on) return done(["outline-offset-" + on]);
            return done(["outline-offset-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
        }
        return unsupported();
    }
    if (prop === "box-shadow") {
        var sh = trim(value).replace(/\s+/g, " ").toLowerCase();
        var shMap = {
            "none": "shadow-none",
            "0 1px 2px 0 rgb(0 0 0 / 0.05)": "shadow-sm",
            "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)": "shadow",
            "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)": "shadow-md",
            "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)": "shadow-lg",
            "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)": "shadow-xl",
            "0 25px 50px -12px rgb(0 0 0 / 0.25)": "shadow-2xl",
            "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)": "shadow-inner"
        };
        /* 兼容 rgba(0,0,0,0.05) 写法 */
        var shAlt = sh.replace(/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*([\d.]+)\s*\)/g, "rgb(0 0 0 / $1)");
        if (shMap[sh]) return done([shMap[sh]]);
        if (shMap[shAlt]) return done([shMap[shAlt]]);
        return done(["shadow-" + arb(value)], "arbitrary", "未命中阴影命名类，已用任意值");
    }

    /* ---- display / position / 定位 ---- */
    if (prop === "display") {
        var dp = trim(value).toLowerCase();
        var dpMap = { block: "block", "inline-block": "inline-block", inline: "inline", flex: "flex", "inline-flex": "inline-flex", table: "table", "inline-table": "inline-table", "table-caption": "table-caption", "table-cell": "table-cell", "table-column": "table-column", "table-row": "table-row", "flow-root": "flow-root", grid: "grid", "inline-grid": "inline-grid", contents: "contents", "list-item": "list-item", none: "hidden" };
        if (dpMap[dp]) return done([dpMap[dp]]);
        var apd = arbitraryProp(); return apd || unsupported();
    }
    if (prop === "position") {
        var pv = trim(value).toLowerCase();
        if (/^(static|relative|absolute|fixed|sticky)$/.test(pv)) return done([pv]);
        var app = arbitraryProp(); return app || unsupported();
    }
    var insetSide = /^(top|right|bottom|left)$/.exec(prop);
    if (insetSide) {
        var ipre = { top: "top", right: "right", bottom: "bottom", left: "left" }[prop];
        var iv = trim(value).toLowerCase();
        if (iv === "auto") return done([ipre + "-auto"]);
        var ipct = { "50%": "1/2", "100%": "full" }[iv];
        if (ipct) return done([ipre + "-" + ipct]);
        var ipx = lenToPx(value);
        if (ipx !== null) {
            var inn = spacingName(ipx, version);
            if (inn) return done([posCls(ipre, inn)]);
            return done([ipre + "-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
        }
        var api = arbitraryProp(); return api || unsupported();
    }
    if (prop === "inset" || prop === "inset-x" || prop === "inset-y") {
        var iparts = splitValues(value);
        if (iparts.length === 1) {
            var r3 = mapDeclaration("top", iparts[0], version);
            if (r3.kind !== "unsupported") {
                var c3 = r3.classes[0].replace(/^(-?)(top|right|bottom|left)-/, "$1" + prop + "-");
                return done([c3], r3.kind, r3.note);
            }
        } else if (iparts.length === 2 && prop === "inset") {
            var ry = mapDeclaration("top", iparts[0], version), rx = mapDeclaration("left", iparts[1], version);
            if (ry.kind !== "unsupported" && rx.kind !== "unsupported") {
                return done([ry.classes[0].replace(/^(-?)top-/, "$1inset-y-"), rx.classes[0].replace(/^(-?)left-/, "$1inset-x-")],
                    (ry.kind === "arbitrary" || rx.kind === "arbitrary") ? "arbitrary" : "named", "");
            }
        }
        var apin = arbitraryProp(); return apin || unsupported();
    }
    if (prop === "z-index") {
        var zi = trim(value).toLowerCase();
        if (zi === "auto") return done(["z-auto"]);
        if (/^-?\d+$/.test(zi)) {
            var zMap = { 0: "z-0", 10: "z-10", 20: "z-20", 30: "z-30", 40: "z-40", 50: "z-50" };
            if (zMap[zi]) return done([zMap[zi]]);
            return done(["z-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
        }
        return unsupported();
    }
    if (prop === "float") {
        var fl = trim(value).toLowerCase();
        if (/^(left|right|none|start|end)$/.test(fl)) return done(["float-" + fl]);
        return unsupported();
    }
    if (prop === "clear") {
        var cl = trim(value).toLowerCase();
        if (/^(left|right|both|none|start|end)$/.test(cl)) return done(["clear-" + cl]);
        return unsupported();
    }
    var ovSide = /^overflow(-(x|y))?$/.exec(prop);
    if (ovSide) {
        var ov = trim(value).toLowerCase();
        if (/^(visible|hidden|clip|scroll|auto)$/.test(ov)) return done([prop + "-" + ov]);
        var apo = arbitraryProp(); return apo || unsupported();
    }
    if (prop === "visibility") {
        var vs = trim(value).toLowerCase();
        if (vs === "visible") return done(["visible"]);
        if (vs === "hidden") return done(["invisible"]);
        if (vs === "collapse") return done(["collapse"]);
        return unsupported();
    }

    /* ---- Flex ---- */
    if (prop === "flex-direction") {
        var fd = { row: "flex-row", "row-reverse": "flex-row-reverse", column: "flex-col", "column-reverse": "flex-col-reverse" }[trim(value).toLowerCase()];
        if (fd) return done([fd]);
        var apfd = arbitraryProp(); return apfd || unsupported();
    }
    if (prop === "flex-wrap") {
        var fw2 = { nowrap: "flex-nowrap", wrap: "flex-wrap", "wrap-reverse": "flex-wrap-reverse" }[trim(value).toLowerCase()];
        if (fw2) return done([fw2]);
        var apfw = arbitraryProp(); return apfw || unsupported();
    }
    var flexAlignMap = {
        "justify-content": { "flex-start": "justify-start", start: "justify-start", center: "justify-center", "flex-end": "justify-end", end: "justify-end", "space-between": "justify-between", "space-around": "justify-around", "space-evenly": "justify-evenly", stretch: "justify-stretch", normal: "justify-normal" },
        "align-items": { "flex-start": "items-start", start: "items-start", center: "items-center", "flex-end": "items-end", end: "items-end", baseline: "items-baseline", stretch: "items-stretch" },
        "align-content": { "flex-start": "content-start", start: "content-start", center: "content-center", "flex-end": "content-end", end: "content-end", "space-between": "content-between", "space-around": "content-around", "space-evenly": "content-evenly", stretch: "content-stretch", baseline: "content-baseline", normal: "content-normal" },
        "align-self": { auto: "self-auto", "flex-start": "self-start", start: "self-start", center: "self-center", "flex-end": "self-end", end: "self-end", stretch: "self-stretch", baseline: "self-baseline" },
        "justify-items": { start: "justify-items-start", end: "justify-items-end", center: "justify-items-center", stretch: "justify-items-stretch" },
        "justify-self": { auto: "justify-self-auto", start: "justify-self-start", end: "justify-self-end", center: "justify-self-center", stretch: "justify-self-stretch" },
        "place-content": { center: "place-content-center", start: "place-content-start", end: "place-content-end", "space-between": "place-content-between", "space-around": "place-content-around", "space-evenly": "place-content-evenly", stretch: "place-content-stretch", baseline: "place-content-baseline" },
        "place-items": { start: "place-items-start", end: "place-items-end", center: "place-items-center", stretch: "place-items-stretch", baseline: "place-items-baseline" },
        "place-self": { auto: "place-self-auto", start: "place-self-start", end: "place-self-end", center: "place-self-center", stretch: "place-self-stretch" }
    };
    if (flexAlignMap[prop]) {
        var fv = trim(value).toLowerCase();
        if (flexAlignMap[prop][fv]) return done([flexAlignMap[prop][fv]]);
        var apfa = arbitraryProp(); return apfa || unsupported();
    }
    if (prop === "flex") {
        var fx = trim(value).toLowerCase();
        var fxMap = { 1: "flex-1", "1 1 0%": "flex-1", "1 1 0px": "flex-1", auto: "flex-auto", "1 1 auto": "flex-auto", initial: "flex-initial", "0 1 auto": "flex-initial", none: "flex-none", "0 0 auto": "flex-none" };
        if (fxMap[fx]) return done([fxMap[fx]]);
        return done(["flex-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
    }
    if (prop === "flex-grow") {
        var fgv = trim(value);
        if (fgv === "0") return done(["grow-0"]);
        if (fgv === "1") return done(["grow"]);
        return done(["grow-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
    }
    if (prop === "flex-shrink") {
        var fsv = trim(value);
        if (fsv === "0") return done([version === "v4" ? "shrink-0" : "flex-shrink-0"]);
        if (fsv === "1") return done([version === "v4" ? "shrink" : "flex-shrink"]);
        var shCls = version === "v4" ? "shrink" : "flex-shrink";
        return done([shCls + "-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
    }
    if (prop === "flex-basis") {
        var fbv = trim(value).toLowerCase();
        if (fbv === "auto") return done(["basis-auto"]);
        if (fbv === "0" || fbv === "0px") return done(["basis-0"]);
        var fbpct = { "50%": "basis-1/2", "33.333333%": "basis-1/3", "66.666667%": "basis-2/3", "25%": "basis-1/4", "75%": "basis-3/4", "100%": "basis-full" }[fbv];
        if (fbpct) return done([fbpct]);
        var fbpx = lenToPx(value);
        if (fbpx !== null) {
            var fbn = spacingName(fbpx, version);
            if (fbn) return done(["basis-" + fbn]);
        }
        return done(["basis-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
    }
    if (prop === "order") {
        var od = trim(value);
        if (/^-?\d+$/.test(od)) {
            var odn = parseInt(od, 10);
            if (odn >= 1 && odn <= 12) return done(["order-" + odn]);
            if (odn === 0) return done(["order-none"]);
            if (odn === -9999) return done(["order-first"]);
            if (odn === 9999) return done(["order-last"]);
            return done(["order-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
        }
        if (od === "inherit") return unsupported("order: inherit 无对应工具类");
        return unsupported();
    }

    /* ---- Grid ---- */
    if (prop === "grid-template-columns" || prop === "grid-template-rows") {
        var gpre = prop === "grid-template-columns" ? "grid-cols" : "grid-rows";
        var gv = trim(value).toLowerCase().replace(/\s+/g, " ");
        if (gv === "none") return done([gpre + "-none"]);
        if (gv === "subgrid") return done([gpre + "-subgrid"]);
        var gm = /^repeat\(\s*(\d+)\s*,\s*(minmax\(0,\s*1fr\)|1fr)\s*\)$/.exec(gv);
        if (gm && parseInt(gm[1], 10) >= 1 && parseInt(gm[1], 10) <= 12) return done([gpre + "-" + gm[1]]);
        return done([gpre + "-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
    }
    var gridSpan = /^(grid-column|grid-row)$/.exec(prop);
    if (gridSpan) {
        var gsp = prop === "grid-column" ? "col" : "row";
        var gsv = trim(value).toLowerCase().replace(/\s+/g, " ");
        if (gsv === "auto") return done([gsp + "-auto"]);
        var gsm = /^span\s+(\d+)$/.exec(gsv);
        if (gsm && +gsm[1] >= 1 && +gsm[1] <= 12) return done([gsp + "-span-" + gsm[1]]);
        if (gsv === "1 / -1") return done([gsp + "-span-full"]);
        return done([gsp + "-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
    }
    if (prop === "grid-auto-flow") {
        var gaf = { row: "grid-flow-row", column: "grid-flow-col", dense: "grid-flow-dense", "row dense": "grid-flow-row-dense", "column dense": "grid-flow-col-dense" }[trim(value).toLowerCase()];
        if (gaf) return done([gaf]);
        return unsupported();
    }

    /* ---- 背景 ---- */
    if (prop === "background-image") {
        var biv = trim(value).toLowerCase();
        if (biv === "none") return done(["bg-none"]);
        var lg = /^linear-gradient\(\s*to\s+(top|right|bottom|left)(\s+(top|right|bottom|left))?,/.exec(biv);
        if (lg) {
            var dirAbbr = { top: "t", right: "r", bottom: "b", left: "l" };
            var dir = "to-" + dirAbbr[lg[1]] + (lg[3] ? "-" + dirAbbr[lg[3]] : "");
            return done([version === "v4" ? "bg-linear-" + dir : "bg-gradient-" + dir], "named", "仅映射渐变方向，色标请用 from-/via-/to- 补全");
        }
        return done(["bg-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
    }
    if (prop === "background-size") {
        var bsv = trim(value).toLowerCase();
        if (bsv === "cover") return done(["bg-cover"]);
        if (bsv === "contain") return done(["bg-contain"]);
        if (bsv === "auto") return done(["bg-auto"]);
        return done(["bg-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
    }
    if (prop === "background-position") {
        var bpv = trim(value).toLowerCase().replace(/\s+/g, "-");
        var bpMap = { center: "bg-center", top: "bg-top", right: "bg-right", bottom: "bg-bottom", left: "bg-left", "left-top": "bg-left-top", "left-bottom": "bg-left-bottom", "right-top": "bg-right-top", "right-bottom": "bg-right-bottom", "top-left": "bg-left-top", "bottom-left": "bg-left-bottom", "top-right": "bg-right-top", "bottom-right": "bg-right-bottom" };
        if (bpMap[bpv]) return done([bpMap[bpv]]);
        return done(["bg-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
    }
    if (prop === "background-repeat") {
        var brv = { "no-repeat": "bg-no-repeat", repeat: "bg-repeat", "repeat-x": "bg-repeat-x", "repeat-y": "bg-repeat-y", round: "bg-repeat-round", space: "bg-repeat-space" }[trim(value).toLowerCase()];
        if (brv) return done([brv]);
        return unsupported();
    }
    if (prop === "background") {
        var bgv = trim(value);
        if (/^url\(/i.test(bgv)) return done(["bg-" + arb(bgv)], "arbitrary", "背景图已用任意值");
        var cc3 = colorClass(prop, bgv, "bg");
        if (cc3) {
            var isA = /-\[/.test(cc3);
            return done([cc3], isA ? "arbitrary" : "named", isA ? "色板未精确命中，已用任意值" : "");
        }
        var apbg = arbitraryProp(); return apbg || unsupported("background 简写过复杂，建议拆分为 background-color / background-image 等");
    }
    if (prop === "background-clip") {
        var bcv = { border: "bg-clip-border", padding: "bg-clip-padding", content: "bg-clip-content", text: "bg-clip-text" }[trim(value).toLowerCase().replace("-box", "")];
        if (bcv) return done([bcv]);
        return unsupported();
    }

    /* ---- 其他常用 ---- */
    if (prop === "cursor") {
        var cuv = trim(value).toLowerCase();
        if (/^(auto|default|pointer|wait|text|move|help|not-allowed|none|context-menu|progress|cell|crosshair|vertical-text|alias|copy|no-drop|grab|grabbing|all-scroll|col-resize|row-resize|n-resize|e-resize|s-resize|w-resize|ne-resize|nw-resize|se-resize|sw-resize|ew-resize|ns-resize|nesw-resize|nwse-resize|zoom-in|zoom-out)$/.test(cuv)) return done(["cursor-" + cuv]);
        var apcu = arbitraryProp(); return apcu || unsupported();
    }
    if (prop === "pointer-events") {
        var pev = trim(value).toLowerCase();
        if (pev === "none") return done(["pointer-events-none"]);
        if (pev === "auto") return done(["pointer-events-auto"]);
        return unsupported();
    }
    if (prop === "user-select") {
        var usv = { none: "select-none", text: "select-text", all: "select-all", auto: "select-auto" }[trim(value).toLowerCase()];
        if (usv) return done([usv]);
        return unsupported();
    }
    if (prop === "resize") {
        var rev = { none: "resize-none", both: "resize", horizontal: "resize-x", vertical: "resize-y", block: "resize-y", inline: "resize-x" }[trim(value).toLowerCase()];
        if (rev) return done([rev]);
        return unsupported();
    }
    if (prop === "list-style-type") {
        var lsv = { none: "list-none", disc: "list-disc", decimal: "list-decimal" }[trim(value).toLowerCase()];
        if (lsv) return done([lsv]);
        return done(["list-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
    }
    if (prop === "list-style-position") {
        if (value === "inside") return done(["list-inside"]);
        if (value === "outside") return done(["list-outside"]);
        return unsupported();
    }
    if (prop === "content") {
        var ctv = trim(value).toLowerCase();
        if (ctv === "none") return done(["content-none"]);
        if (ctv === "normal") return done(["content-normal"]);
        var cmq = /^(['"])(.*)\1$/.exec(trim(value));
        if (cmq) return done(["content-['" + cmq[2] + "']"], "arbitrary", "已用任意值");
        return unsupported();
    }
    if (prop === "aspect-ratio") {
        var arv = trim(value).toLowerCase().replace(/\s+/g, "");
        if (arv === "auto") return done(["aspect-auto"]);
        if (arv === "1/1" || arv === "1") return done(["aspect-square"]);
        if (arv === "16/9") return done(["aspect-video"]);
        return done(["aspect-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
    }
    if (prop === "columns") {
        var cov = trim(value);
        if (/^\d+$/.test(cov) && +cov >= 1 && +cov <= 12) return done(["columns-" + cov]);
        if (cov === "auto") return done(["columns-auto"]);
        return done(["columns-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
    }
    if (prop === "break-inside" || prop === "break-before" || prop === "break-after") {
        var brkPre = { "break-inside": "break-inside", "break-before": "break-before", "break-after": "break-after" }[prop];
        var brkMap = { auto: "auto", avoid: "avoid", all: "all", "avoid-page": "avoid-page", page: "page", "avoid-column": "avoid-column", column: "column", "avoid-region": "avoid" };
        var brkv = brkMap[trim(value).toLowerCase()];
        if (brkv) return done([brkPre + "-" + brkv]);
        return unsupported();
    }
    if (prop === "transition-property" || prop === "transition") {
        var trv = trim(value).toLowerCase();
        if (prop === "transition-property") {
            var trMap = { none: "transition-none", all: "transition-all", colors: "transition-colors", opacity: "transition-opacity", "box-shadow": "transition-shadow", transform: "transition-transform" };
            if (trMap[trv]) return done([trMap[trv]]);
            return done(["transition-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
        }
        if (/^(none|all)$/.test(trv)) return done([trv === "none" ? "transition-none" : "transition-all"]);
        return done(["transition-" + arb(value)], "arbitrary", "transition 简写已用任意值，建议拆分为 transition-property/duration");
    }
    if (prop === "transition-duration" || prop === "transition-delay") {
        var tdPre = prop === "transition-duration" ? "duration" : "delay";
        var tdm = /^([\d.]+)(ms|s)$/.exec(trim(value).toLowerCase());
        if (tdm) {
            var ms = tdm[2] === "s" ? parseFloat(tdm[1]) * 1000 : parseFloat(tdm[1]);
            var tdMap = { 75: 75, 100: 100, 150: 150, 200: 200, 300: 300, 500: 500, 700: 700, 1000: 1000 };
            if (tdMap[ms] !== undefined) return done([tdPre + "-" + ms]);
            return done([tdPre + "-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
        }
        return unsupported();
    }
    if (prop === "transition-timing-function") {
        var ttMap = { ease: "ease", linear: "ease-linear", "ease-in": "ease-in", "ease-out": "ease-out", "ease-in-out": "ease-in-out" };
        var ttv = ttMap[trim(value).toLowerCase()];
        if (ttv) return done([ttv]);
        return done(["ease-" + arb(value)], "arbitrary", "未命中命名类，已用任意值");
    }
    if (prop === "transform") {
        if (trim(value).toLowerCase() === "none") return done(["transform-none"]);
        var aptf = arbitraryProp(); return aptf || unsupported();
    }
    if (prop === "filter") {
        var fiv = trim(value).toLowerCase();
        if (fiv === "none") return done(["filter-none"]);
        var blm = /^blur\(([\d.]+)px\)$/.exec(fiv);
        if (blm) {
            var blurMap = { 0: "blur-none", 4: "blur-sm", 8: "blur", 12: "blur-md", 16: "blur-lg", 24: "blur-xl", 40: "blur-2xl" };
            if (blurMap[blm[1]] !== undefined) return done([blurMap[blm[1]]]);
            return done(["blur-" + arb(blm[1] + "px")], "arbitrary", "未命中命名类，已用任意值");
        }
        if (/^grayscale\((1|100%)\)$/.test(fiv)) return done(["grayscale"]);
        if (/^sepia\((1|100%)\)$/.test(fiv)) return done(["sepia"]);
        if (/^invert\((1|100%)\)$/.test(fiv)) return done(["invert"]);
        var apfi = arbitraryProp(); return apfi || unsupported();
    }
    if (prop === "backdrop-filter") {
        var apbf = arbitraryProp(); return apbf || unsupported();
    }

    /* ---- 通用兜底：任意属性语法；再不行 → 不支持 ---- */
    var apFinal = arbitraryProp();
    if (apFinal) return apFinal;
    return unsupported();
}

/* 按空白切分值（尊重括号/引号） */
function splitValues(v) {
    var out = [], cur = "", depth = 0, q = null;
    for (var i = 0; i < v.length; i++) {
        var ch = v[i];
        if (q) { cur += ch; if (ch === q) q = null; continue; }
        if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
        if (ch === "(") depth++;
        if (ch === ")") depth--;
        if (/\s/.test(ch) && depth === 0) {
            if (cur) { out.push(cur); cur = ""; }
            continue;
        }
        cur += ch;
    }
    if (cur) out.push(cur);
    return out;
}
/* margin/padding 简写展开 → [top, right, bottom, left]；失败 null */
function expandBox(parts) {
    if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
    if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
    if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
    if (parts.length === 4) return parts.slice(0, 4);
    return null;
}

/* ================= CSS 解析 =================
 * 返回 [{selector, media, decls:[{prop, value}]}]
 * 支持：完整样式表、@media 块、裸声明（无 {} 容错）
 */
function parseCss(src) {
    var text = String(src).replace(/\/\*[\s\S]*?\*\//g, ""); /* 去注释 */
    var rules = [];
    var i = 0, n = text.length;

    function skipWs() { while (i < n && /\s/.test(text[i])) i++; }
    /* 读取配对花括号内的内容，i 停在 } 之后 */
    function readBlock() {
        var depth = 1, start = i, q = null;
        while (i < n && depth > 0) {
            var ch = text[i];
            if (q) { if (ch === q) q = null; }
            else if (ch === '"' || ch === "'") q = ch;
            else if (ch === "{") depth++;
            else if (ch === "}") depth--;
            i++;
        }
        return text.slice(start, i - 1);
    }
    function parseDecls(block) {
        var decls = [], cur = "", depth = 0, q = null;
        function flush() {
            var d = trim(cur); cur = "";
            if (!d) return;
            var ci = d.indexOf(":");
            if (ci === -1) return;
            decls.push({ prop: trim(d.slice(0, ci)), value: trim(d.slice(ci + 1)) });
        }
        for (var k = 0; k < block.length; k++) {
            var ch = block[k];
            if (q) { cur += ch; if (ch === q) q = null; continue; }
            if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
            if (ch === "(") depth++;
            if (ch === ")") depth--;
            if (ch === ";" && depth === 0) { flush(); continue; }
            cur += ch;
        }
        flush();
        return decls;
    }
    function mediaPrefix(cond) {
        var m = /min-width\s*:\s*([\d.]+)px/i.exec(cond);
        if (m) {
            var w = parseFloat(m[1]);
            if (w >= 1536) return "2xl";
            if (w >= 1280) return "xl";
            if (w >= 1024) return "lg";
            if (w >= 768) return "md";
            if (w >= 640) return "sm";
            return "min-[" + m[1] + "px]";
        }
        m = /max-width\s*:\s*([\d.]+)px/i.exec(cond);
        if (m) {
            var w2 = parseFloat(m[1]);
            if (w2 < 640) return "max-sm";
            if (w2 < 768) return "max-md";
            if (w2 < 1024) return "max-lg";
            if (w2 < 1280) return "max-xl";
            if (w2 < 1536) return "max-2xl";
            return "max-[" + m[1] + "px]";
        }
        return null; /* 无法识别的媒体条件 */
    }

    var hasBrace = text.indexOf("{") !== -1;
    if (!hasBrace) {
        var d = parseDecls(text);
        if (d.length) rules.push({ selector: "", media: "", decls: d });
        return rules;
    }
    while (i < n) {
        skipWs();
        if (i >= n) break;
        if (text.slice(i, i + 6).toLowerCase() === "@media") {
            i += 6; skipWs();
            var condStart = i;
            while (i < n && text[i] !== "{") i++;
            var cond = text.slice(condStart, i);
            i++; /* 跳过 { */
            var inner = readBlock();
            var prefix = mediaPrefix(cond);
            /* 递归解析内部规则 */
            var sub = parseCss(inner);
            sub.forEach(function (r) {
                r.media = trim(cond);
                r.prefix = prefix;
                rules.push(r);
            });
        } else if (text[i] === "@") {
            /* 其他 at-rule：跳过整块 */
            while (i < n && text[i] !== "{" && text[i] !== ";") i++;
            if (text[i] === "{") { i++; readBlock(); }
            else if (text[i] === ";") i++;
        } else {
            var selStart = i;
            while (i < n && text[i] !== "{") i++;
            var selector = trim(text.slice(selStart, i));
            if (i < n && text[i] === "{") {
                i++;
                var block = readBlock();
                var decls = parseDecls(block);
                if (selector && decls.length) rules.push({ selector: selector, media: "", decls: decls });
                else if (selector && !decls.length) rules.push({ selector: selector, media: "", decls: [] });
            } else break;
        }
    }
    return rules;
}

/* ================= 主转换 ================= */
function convertCss(src, version) {
    version = version === "v4" ? "v4" : "v3";
    var rules = parseCss(src);
    var out = [];
    var stats = { named: 0, arbitrary: 0, unsupported: 0, rules: 0, decls: 0 };
    rules.forEach(function (r) {
        if (!r.decls.length) return;
        var items = r.decls.map(function (d) {
            var m = mapDeclaration(d.prop, d.value, version);
            stats.decls++;
            if (m.kind === "named") stats.named++;
            else if (m.kind === "arbitrary") stats.arbitrary++;
            else stats.unsupported++;
            var classes = m.classes;
            if (r.prefix) {
                classes = classes.map(function (c) {
                    if (version === "v4" && c.slice(-1) === "!") return r.prefix + ":" + c.slice(0, -1) + "!";
                    if (version === "v3" && c.charAt(0) === "!") return r.prefix + ":" + c;
                    return r.prefix + ":" + c;
                });
            }
            return { decl: m.decl, classes: classes, kind: m.kind, note: m.note };
        });
        stats.rules++;
        out.push({ selector: r.selector, media: r.media, prefix: r.prefix || "", items: items });
    });
    return { rules: out, stats: stats, version: version };
}

/* 输出文本渲染 */
function renderText(conv) {
    var lines = [];
    conv.rules.forEach(function (r) {
        var head = r.selector || "（裸声明）";
        if (r.media) lines.push("/* @media " + r.media + " · " + head + " */");
        else lines.push("/* " + head + " */");
        r.items.forEach(function (it) {
            var right = it.classes.length ? it.classes.join(" ") : "/* " + it.note + " */";
            lines.push(it.decl + ";  /* → " + right + " */");
        });
        lines.push("");
    });
    return lines.join("\n").replace(/\n$/, "");
}

/* HTML 转义 */
function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ================= 浏览器 DOM  wiring（node 下不执行） ================= */
var SAMPLE_CSS = [
    ".card {",
    "  padding: 16px 24px;",
    "  margin: 0 auto;",
    "  max-width: 640px;",
    "  background-color: #3b82f6;",
    "  color: #ffffff;",
    "  font-size: 16px;",
    "  font-weight: 600;",
    "  border-radius: 8px;",
    "  display: flex;",
    "  align-items: center;",
    "  justify-content: space-between;",
    "  gap: 12px;",
    "  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);",
    "  width: 137px;",
    "  clip-path: circle(50%);",
    "}",
    "@media (min-width: 768px) {",
    "  .card {",
    "    padding: 32px;",
    "    flex-direction: row;",
    "  }",
    "}"
].join("\n");

function ctInit() {
    function $(id) { return document.getElementById(id); }
    var input = $("ct-input"), out = $("ct-out"), stats = $("ct-stats"),
        preview = $("ct-preview"), count = $("ct-count"),
        copyTip = $("ct-copy-tip"), toast = $("ct-toast");
    if (!input || !out) return;

    function curVersion() {
        var v4 = $("ct-v4");
        return (v4 && v4.checked) ? "v4" : "v3";
    }
    function showToast(msg) {
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add("show");
        setTimeout(function () { toast.classList.remove("show"); }, 2200);
    }
    function kindBadge(kind) {
        if (kind === "named") return '<span class="ct-badge ct-b-named">命名类</span>';
        if (kind === "arbitrary") return '<span class="ct-badge ct-b-arb">任意值</span>';
        return '<span class="ct-badge ct-b-unsup">需手写</span>';
    }
    function render() {
        var src = input.value;
        count.textContent = "共 " + src.length + " 字符";
        var conv = convertCss(src, curVersion());
        var s = conv.stats;
        stats.innerHTML = "解析 <b>" + s.rules + "</b> 条规则 / <b>" + s.decls + "</b> 条声明：" +
            "命名类 <b class='ct-ok'>" + s.named + "</b> · " +
            "任意值兜底 <b class='ct-warn'>" + s.arbitrary + "</b> · " +
            "需手写 <b class='ct-bad'>" + s.unsupported + "</b>" +
            "（当前版本 <b>" + (conv.version === "v4" ? "Tailwind v4" : "Tailwind v3") + "</b>）";
        /* 右栏：逐声明结果行 */
        var html = "";
        conv.rules.forEach(function (r) {
            var head = escapeHtml(r.selector || "（裸声明）");
            if (r.media) html += '<div class="ct-rule-head">@media ' + escapeHtml(r.media) + " · " + head + "</div>";
            else html += '<div class="ct-rule-head">' + head + "</div>";
            r.items.forEach(function (it) {
                var right = it.classes.length
                    ? '<code class="ct-cls">' + escapeHtml(it.classes.join(" ")) + "</code>"
                    : '<span class="ct-note">/* ' + escapeHtml(it.note) + " */</span>";
                var note = it.note && it.classes.length ? ' <span class="ct-note">(' + escapeHtml(it.note) + ")</span>" : "";
                html += '<div class="ct-line">' + kindBadge(it.kind) +
                    '<code class="ct-decl">' + escapeHtml(it.decl) + ";</code>" +
                    '<span class="ct-arrow">→</span>' + right + note + "</div>";
            });
        });
        out.innerHTML = html || '<div class="ct-empty">在左侧粘贴 CSS 后，这里会逐条显示对应的 Tailwind 工具类。</div>';
        out.dataset.text = renderText(conv);
        renderPreview(conv);
    }
    function renderPreview(conv) {
        var html = "";
        conv.rules.forEach(function (r) {
            if (r.prefix) return; /* 媒体查询规则不单独渲染，避免重复 */
            var style = r.items.map(function (it) {
                var d = it.decl.replace(/\s*!important\s*$/, "");
                return escapeHtml(d);
            }).join("; ");
            var chips = [];
            r.items.forEach(function (it) {
                it.classes.forEach(function (c) {
                    chips.push('<span class="ct-chip">' + escapeHtml(c) + "</span>");
                });
            });
            html += '<div class="ct-demo-card"><div class="ct-demo-label">' +
                escapeHtml(r.selector || "（裸声明）") + "</div>" +
                '<div class="ct-demo-box" style="' + style + '">预览</div>' +
                '<div class="ct-chips">' + chips.join("") + "</div></div>";
        });
        preview.innerHTML = html || '<div class="ct-empty">暂无可预览的规则。</div>';
    }

    var timer = null;
    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(render, 250);
    }
    input.addEventListener("input", schedule);
    var v3 = $("ct-v3"), v4 = $("ct-v4");
    if (v3) v3.addEventListener("change", render);
    if (v4) v4.addEventListener("change", render);

    $("ct-sample").addEventListener("click", function () { input.value = SAMPLE_CSS; render(); showToast("已填入示例 CSS"); });
    $("ct-clear").addEventListener("click", function () { input.value = ""; render(); });

    /* 文件上传：本地 FileReader，零上传 */
    var fileInput = $("ct-file"), drop = $("ct-drop");
    function readFile(f) {
        if (!f) return;
        if (!/\.css$/i.test(f.name)) { showToast("仅支持 .css 文件"); return; }
        var rd = new FileReader();
        rd.onload = function () { input.value = String(rd.result || ""); render(); showToast("已载入 " + f.name); };
        rd.readAsText(f);
    }
    if (drop && fileInput) {
        drop.addEventListener("click", function () { fileInput.click(); });
        fileInput.addEventListener("change", function () { readFile(fileInput.files[0]); fileInput.value = ""; });
        ["dragenter", "dragover"].forEach(function (e) {
            drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.add("drag"); });
        });
        ["dragleave", "drop"].forEach(function (e) {
            drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.remove("drag"); });
        });
        drop.addEventListener("drop", function (ev) {
            var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
            readFile(f);
        });
    }

    function copyText(t, okMsg) {
        function ok() {
            copyTip.textContent = okMsg || "已复制到剪贴板";
            copyTip.className = "ct-copy-tip ct-copy-ok";
            copyTip.style.display = "block";
            setTimeout(function () { copyTip.style.display = "none"; }, 2000);
        }
        function fail() {
            copyTip.textContent = "复制失败，请手动选择复制";
            copyTip.className = "ct-copy-tip ct-copy-fail";
            copyTip.style.display = "block";
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(t).then(ok, function () { fallback(); });
        } else fallback();
        function fallback() {
            var ta = document.createElement("textarea");
            ta.value = t;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand("copy") ? ok() : fail(); } catch (e) { fail(); }
            document.body.removeChild(ta);
        }
    }
    $("ct-copy").addEventListener("click", function () {
        var t = out.dataset.text || "";
        if (!t) { showToast("暂无可复制的内容"); return; }
        copyText(t, "转换结果已复制");
    });
    $("ct-download").addEventListener("click", function () {
        var t = out.dataset.text || "";
        if (!t) { showToast("暂无可下载的内容"); return; }
        var blob = new Blob([t], { type: "text/plain;charset=utf-8" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "tailwind-classes.txt";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        showToast("已下载 tailwind-classes.txt");
    });

    render();
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", ctInit);
    } else { ctInit(); }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        parseCss: parseCss, mapDeclaration: mapDeclaration, convertCss: convertCss,
        renderText: renderText, escapeHtml: escapeHtml,
        normalizeColor: normalizeColor, colorClass: colorClass,
        spacingName: spacingName, lenToPx: lenToPx, toV4: toV4,
        splitValues: splitValues, HEX2NAME: HEX2NAME, PALETTE: PALETTE
    };
}

})();
