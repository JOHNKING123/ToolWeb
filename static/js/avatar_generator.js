/* 头像生成器：自研 SVG 图层头像引擎 + mulberry32 确定性渲染协议
 * 零第三方依赖、零网络请求（无 fetch/XHR、无上传），全部在浏览器本地完成。
 * 图层：背景/肤色/脸型/发型(+发色)/眼睛/眉毛/嘴巴/配饰，全部为手写 SVG 路径部件。
 * 确定性协议：种子 --mulberry32--> 短 JSON 描述 --buildSVG--> 渲染，双向可还原。
 * 纯逻辑部分（PRNG / 描述子 / 图层表 / SVG 构建 / 文件名）经由 module.exports 暴露，
 * 供 node tests/avatar_generator.test.js 做单元测试。
 * 用法（浏览器）：页面引入后自动初始化 #ag-* 控件：9 宫格批量预览＋大图精调＋PNG 导出。
 */
(function () {
"use strict";

/* ================= 常量 ================= */
var AVATAR_SIZE = 200;                 // SVG 画布边长（方形）
var EXPORT_SIZES = [64, 128, 256, 512]; // 导出四档
var DEFAULT_SEED = 20261024;

function hasDOM() {
  return typeof document !== "undefined" && typeof window !== "undefined";
}

/* ================= 确定性 PRNG ================= */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 字符串 -> uint32 种子（xfnv1a），种子输入框支持任意文本 */
function seedFromString(str) {
  var h = 2166136261 >>> 0;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function randInt(rng, n) {
  return Math.floor(rng() * n);
}

function clampIndex(i, len) {
  i = Math.floor(Number(i));
  if (isNaN(i) || i < 0) return 0;
  if (i >= len) return len - 1;
  return i;
}

/* ================= 图层表 =================
 * 每个变体：{id, name}；背景另有 type/color(s)；发色为独立色表。
 */
var BG_LIST = [
  { id: "sky",    name: "晴空蓝", type: "solid", color: "#cfe8ff" },
  { id: "cream",  name: "奶油黄", type: "solid", color: "#fdf0c8" },
  { id: "pink",   name: "樱花粉", type: "solid", color: "#ffd9e3" },
  { id: "mint",   name: "薄荷绿", type: "solid", color: "#c9f2d8" },
  { id: "lav",    name: "淡紫",   type: "solid", color: "#ddd6fe" },
  { id: "orange", name: "蜜橙",   type: "solid", color: "#ffe3c2" },
  { id: "grad1",  name: "蓝紫渐变", type: "gradient", from: "#a5b4fc", to: "#e0c3fc" },
  { id: "grad2",  name: "日落渐变", type: "gradient", from: "#fdba74", to: "#f9a8d4" }
];

var SKIN_LIST = [
  { id: "s1", name: "瓷白", color: "#ffe0bd" },
  { id: "s2", name: "象牙", color: "#ffcd94" },
  { id: "s3", name: "小麦", color: "#eac086" },
  { id: "s4", name: "古铜", color: "#c68642" },
  { id: "s5", name: "深棕", color: "#8d5524" },
  { id: "s6", name: "黝黑", color: "#5c3a21" }
];

var FACE_LIST = [
  { id: "round",  name: "圆脸" },
  { id: "oval",   name: "椭圆脸" },
  { id: "square", name: "方脸" },
  { id: "heart",  name: "心形脸" }
];

var HAIR_COLORS = [
  { id: "h1", name: "乌黑", color: "#232323" },
  { id: "h2", name: "深棕", color: "#4a3728" },
  { id: "h3", name: "栗色", color: "#8b5a2b" },
  { id: "h4", name: "金黄", color: "#d4a24e" },
  { id: "h5", name: "酒红", color: "#b34a2e" },
  { id: "h6", name: "银灰", color: "#8a8f98" }
];

var HAIR_LIST = [
  { id: "flat",     name: "利落平头" },
  { id: "middle",   name: "中分长发" },
  { id: "sidepart", name: "侧分短发" },
  { id: "curly",    name: "俏皮卷发" },
  { id: "ponytail", name: "高马尾" },
  { id: "buzz",     name: "清爽寸头" },
  { id: "bob",      name: "齐耳波波头" },
  { id: "slick",    name: "复古大背头" }
];

var EYE_LIST = [
  { id: "round",   name: "圆眼" },
  { id: "happy",   name: "笑眼" },
  { id: "slender", name: "细长眼" },
  { id: "big",     name: "大眼" },
  { id: "sleepy",  name: "困意眼" },
  { id: "upturned",name: "桃花眼" },
  { id: "dizzy",   name: "斗鸡眼" },
  { id: "starry",  name: "星星眼" }
];

var BROW_LIST = [
  { id: "thick",  name: "粗眉" },
  { id: "thin",   name: "细眉" },
  { id: "sword",  name: "剑眉" },
  { id: "moon",   name: "弯月眉" },
  { id: "sad",    name: "八字眉" },
  { id: "raised", name: "挑眉" }
];

var MOUTH_LIST = [
  { id: "smile", name: "微笑" },
  { id: "laugh", name: "开怀大笑" },
  { id: "flat",  name: "抿嘴" },
  { id: "pout",  name: "嘟嘴" },
  { id: "grin",  name: "露齿笑" },
  { id: "smirk", name: "坏笑" },
  { id: "wow",   name: "惊讶" },
  { id: "calm",  name: "淡定" }
];

var ACC_LIST = [
  { id: "none",      name: "无" },
  { id: "glasses",   name: "圆框眼镜" },
  { id: "sunglass",  name: "墨镜" },
  { id: "earrings",  name: "耳环" },
  { id: "beanie",    name: "针织帽" },
  { id: "bowtie",    name: "领结" }
];

/* ================= 描述子 =================
 * 短 JSON：{s:种子, bg, sk:肤色, fa:脸型, ha:发型, hc:发色, ey:眼睛, br:眉毛, mo:嘴巴, ac:配饰}
 * 全部为下标整数，紧凑可复制。
 */
function randomDescriptor(rng) {
  var seed = Math.floor(rng() * 4294967296) >>> 0;
  return descriptorFromSeed(seed);
}

function descriptorFromSeed(seed) {
  seed = (Number(seed) >>> 0);
  var rng = mulberry32(seed);
  return {
    s: seed,
    bg: randInt(rng, BG_LIST.length),
    sk: randInt(rng, SKIN_LIST.length),
    fa: randInt(rng, FACE_LIST.length),
    ha: randInt(rng, HAIR_LIST.length),
    hc: randInt(rng, HAIR_COLORS.length),
    ey: randInt(rng, EYE_LIST.length),
    br: randInt(rng, BROW_LIST.length),
    mo: randInt(rng, MOUTH_LIST.length),
    ac: randInt(rng, ACC_LIST.length)
  };
}

/* 字段合法性：下标整数且在范围内 */
function validDescriptor(d) {
  if (!d || typeof d !== "object") return false;
  var spec = [
    ["bg", BG_LIST.length], ["sk", SKIN_LIST.length], ["fa", FACE_LIST.length],
    ["ha", HAIR_LIST.length], ["hc", HAIR_COLORS.length], ["ey", EYE_LIST.length],
    ["br", BROW_LIST.length], ["mo", MOUTH_LIST.length], ["ac", ACC_LIST.length]
  ];
  for (var i = 0; i < spec.length; i++) {
    var v = d[spec[i][0]];
    if (typeof v !== "number" || Math.floor(v) !== v || v < 0 || v >= spec[i][1]) return false;
  }
  return true;
}

function normalizeDescriptor(d) {
  return {
    s: (Number(d.s) >>> 0) || 0,
    bg: clampIndex(d.bg, BG_LIST.length),
    sk: clampIndex(d.sk, SKIN_LIST.length),
    fa: clampIndex(d.fa, FACE_LIST.length),
    ha: clampIndex(d.ha, HAIR_LIST.length),
    hc: clampIndex(d.hc, HAIR_COLORS.length),
    ey: clampIndex(d.ey, EYE_LIST.length),
    br: clampIndex(d.br, BROW_LIST.length),
    mo: clampIndex(d.mo, MOUTH_LIST.length),
    ac: clampIndex(d.ac, ACC_LIST.length)
  };
}

function serializeDescriptor(d) {
  d = normalizeDescriptor(d);
  return JSON.stringify(d);
}

/* 解析用户输入：纯数字/纯文本种子，或 JSON 描述；返回 {ok, desc, seed, error} */
function parseDescriptor(text) {
  text = String(text == null ? "" : text).trim();
  if (!text) return { ok: false, desc: null, seed: 0, error: "输入为空" };
  if (/^-?\d+$/.test(text)) {
    var seed = (Number(text) >>> 0);
    return { ok: true, desc: descriptorFromSeed(seed), seed: seed, error: "" };
  }
  var obj = null;
  try { obj = JSON.parse(text); }
  catch (e) { /* 走种子文本路径 */ }
  if (obj && validDescriptor(obj)) {
    var d = normalizeDescriptor(obj);
    return { ok: true, desc: d, seed: d.s, error: "" };
  }
  if (obj) return { ok: false, desc: null, seed: 0, error: "JSON 缺少图层字段或下标越界" };
  /* 任意文本当种子字符串 */
  var s2 = seedFromString(text);
  return { ok: true, desc: descriptorFromSeed(s2), seed: s2, error: "" };
}

function buildExportFilename(seed, size) {
  return "avatar-" + (Number(seed) >>> 0) + "-" + size + "px.png";
}

function isHexColor(c) {
  return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);
}

/* ================= SVG 图层绘制 =================
 * 全部手写 SVG 形状，无 <text>、无外部引用，保证各浏览器光栅化一致。
 * 画布 200x200；绘制顺序：背景 -> 耳 -> 脸 -> 后发 -> 发 -> 眼睛 -> 眉毛 -> 鼻子/腮红 -> 嘴巴 -> 配饰。
 */
var INK = "#2b2b2b";      // 描边/瞳孔墨色
var LIP = "#c0392b";      // 唇色
var LIP_DARK = "#8e2f22"; // 口腔暗色

function bgSVG(desc, transparent) {
  if (transparent) return "";
  var b = BG_LIST[desc.bg];
  if (b.type === "gradient") {
    return '<defs><linearGradient id="agbg" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + b.from + '"/>' +
      '<stop offset="1" stop-color="' + b.to + '"/></linearGradient></defs>' +
      '<rect x="0" y="0" width="200" height="200" fill="url(#agbg)"/>';
  }
  return '<rect x="0" y="0" width="200" height="200" fill="' + b.color + '"/>';
}

function faceSVG(desc) {
  var skin = SKIN_LIST[desc.sk].color;
  var f = FACE_LIST[desc.fa].id;
  var ears = '<ellipse cx="37" cy="114" rx="9" ry="13" fill="' + skin + '"/>' +
             '<ellipse cx="163" cy="114" rx="9" ry="13" fill="' + skin + '"/>';
  var shape;
  if (f === "oval") {
    shape = '<ellipse cx="100" cy="106" rx="54" ry="70" fill="' + skin + '"/>';
  } else if (f === "square") {
    shape = '<rect x="42" y="42" width="116" height="132" rx="26" fill="' + skin + '"/>';
  } else if (f === "heart") {
    shape = '<path d="M40,72 C40,42 68,32 100,32 C132,32 160,42 160,72 ' +
            'C160,112 130,150 100,170 C70,150 40,112 40,72 Z" fill="' + skin + '"/>';
  } else { /* round */
    shape = '<ellipse cx="100" cy="108" rx="62" ry="66" fill="' + skin + '"/>';
  }
  /* 鼻子＋腮红（固定点缀，不占描述字段） */
  var nose = '<path d="M100,120 q5,7 -1,10" stroke="' + INK + '" stroke-width="2.5" ' +
             'fill="none" stroke-linecap="round" opacity="0.18"/>';
  var blush = '<ellipse cx="64" cy="134" rx="9" ry="5.5" fill="#f4a7a7" opacity="0.5"/>' +
              '<ellipse cx="136" cy="134" rx="9" ry="5.5" fill="#f4a7a7" opacity="0.5"/>';
  return ears + shape + nose + blush;
}

function hairSVG(desc) {
  var hc = HAIR_COLORS[desc.hc].color;
  var h = HAIR_LIST[desc.ha].id;
  var back = "", front = "";
  if (h === "flat") {
    front = '<path d="M42,100 C42,46 68,28 100,28 C132,28 158,46 158,100 ' +
            'C152,74 144,60 132,56 C120,52 80,52 68,56 C56,60 48,74 42,100 Z" fill="' + hc + '"/>';
  } else if (h === "middle") {
    back = '<path d="M40,80 C34,120 38,150 46,164 C52,150 50,110 52,84 Z" fill="' + hc + '"/>' +
           '<path d="M160,80 C166,120 162,150 154,164 C148,150 150,110 148,84 Z" fill="' + hc + '"/>';
    front = '<path d="M42,96 C42,44 70,26 100,26 C130,26 158,44 158,96 ' +
            'C150,62 140,48 118,44 C110,48 106,56 100,58 C94,56 90,48 82,44 ' +
            'C60,48 50,62 42,96 Z" fill="' + hc + '"/>';
  } else if (h === "sidepart") {
    front = '<path d="M42,98 C40,44 70,28 104,28 C136,28 158,48 156,96 ' +
            'C148,66 136,50 112,48 C88,46 60,58 52,98 Z" fill="' + hc + '"/>';
  } else if (h === "curly") {
    var circles = "";
    var i, a, cx, cy;
    for (i = 0; i < 9; i++) {
      a = Math.PI * (0.08 + 0.84 * i / 8);
      cx = Math.round(100 + 62 * Math.cos(a));
      cy = Math.round(78 - 52 * Math.sin(a));
      circles += '<circle cx="' + cx + '" cy="' + cy + '" r="13" fill="' + hc + '"/>';
    }
    back = circles;
    front = '<path d="M46,92 C46,44 72,30 100,30 C128,30 154,44 154,92 ' +
            'C144,62 122,52 100,52 C78,52 56,62 46,92 Z" fill="' + hc + '"/>';
  } else if (h === "ponytail") {
    back = '<path d="M150,60 C170,90 172,130 160,162 C152,142 152,100 146,72 Z" fill="' + hc + '"/>' +
           '<circle cx="149" cy="62" r="6" fill="' + hc + '" stroke="' + INK + '" stroke-width="2" opacity="0.85"/>';
    front = '<path d="M44,94 C44,44 72,28 100,28 C128,28 156,44 156,94 ' +
            'C148,64 138,52 100,52 C62,52 52,64 44,94 Z" fill="' + hc + '"/>';
  } else if (h === "buzz") {
    front = '<path d="M46,88 C50,44 74,32 100,32 C126,32 150,44 154,88 ' +
            'C140,60 120,52 100,52 C80,52 60,60 46,88 Z" fill="' + hc + '"/>';
  } else if (h === "bob") {
    back = '<path d="M36,100 C32,40 66,22 100,22 C134,22 168,40 164,100 ' +
           'C162,120 158,134 152,142 C148,120 146,90 140,70 L60,70 ' +
           'C54,90 52,120 48,142 C42,134 38,120 36,100 Z" fill="' + hc + '"/>';
    front = '<path d="M44,88 C46,46 72,32 100,32 C128,32 154,46 156,88 ' +
            'C140,66 120,60 100,60 C80,60 60,66 44,88 Z" fill="' + hc + '"/>';
  } else { /* slick */
    front = '<path d="M48,80 C52,38 76,26 100,26 C124,26 148,38 152,80 ' +
            'C136,52 118,44 100,44 C82,44 64,52 48,80 Z" fill="' + hc + '"/>' +
            '<path d="M70,44 C80,36 94,32 108,34" stroke="#ffffff" stroke-width="4" ' +
            'fill="none" stroke-linecap="round" opacity="0.25"/>';
  }
  return { back: back, front: front };
}

function eyeSVG(eyeIdx) {
  var e = EYE_LIST[eyeIdx].id;
  var LX = 78, RX = 122, Y = 106;
  function both(draw) { return draw(LX) + draw(RX); }
  if (e === "happy") {
    return both(function (x) {
      return '<path d="M' + (x - 8) + ',' + (Y + 1) + ' Q' + x + ',' + (Y - 7) +
             ' ' + (x + 8) + ',' + (Y + 1) + '" stroke="' + INK + '" stroke-width="3.5" ' +
             'fill="none" stroke-linecap="round"/>';
    });
  }
  if (e === "slender") {
    return both(function (x) {
      return '<path d="M' + (x - 9) + ',' + Y + ' Q' + x + ',' + (Y - 3) + ' ' +
             (x + 9) + ',' + (Y - 1) + '" stroke="' + INK + '" stroke-width="4" ' +
             'fill="none" stroke-linecap="round"/>';
    });
  }
  if (e === "sleepy") {
    return both(function (x) {
      return '<line x1="' + (x - 8) + '" y1="' + Y + '" x2="' + (x + 8) + '" y2="' + Y +
             '" stroke="' + INK + '" stroke-width="3.5" stroke-linecap="round"/>';
    });
  }
  if (e === "big") {
    return both(function (x) {
      return '<ellipse cx="' + x + '" cy="' + Y + '" rx="10" ry="12" fill="#fff" ' +
             'stroke="' + INK + '" stroke-width="2.5"/>' +
             '<circle cx="' + x + '" cy="' + (Y + 1) + '" r="5" fill="' + INK + '"/>' +
             '<circle cx="' + (x + 2.5) + '" cy="' + (Y - 2.5) + '" r="2" fill="#fff"/>';
    });
  }
  if (e === "upturned") {
    return both(function (x) {
      var dir = x < 100 ? 1 : -1;
      return '<path d="M' + (x - 9) + ',' + (Y - 1) + ' Q' + x + ',' + (Y - 6) + ' ' +
             (x + 9) + ',' + (Y - 2) + ' Q' + (x + 2) + ',' + (Y + 5) + ' ' +
             (x - 8) + ',' + (Y + 3) + ' Z" fill="#fff" stroke="' + INK + '" stroke-width="2.5"/>' +
             '<circle cx="' + (x + dir * 2) + '" cy="' + Y + '" r="3.2" fill="' + INK + '"/>';
    });
  }
  if (e === "dizzy") {
    return '<circle cx="' + LX + '" cy="' + Y + '" r="6.5" fill="#fff" stroke="' + INK +
           '" stroke-width="2.5"/><circle cx="' + RX + '" cy="' + Y + '" r="6.5" fill="#fff" stroke="' +
           INK + '" stroke-width="2.5"/>' +
           '<circle cx="' + (LX + 2.5) + '" cy="' + Y + '" r="3" fill="' + INK + '"/>' +
           '<circle cx="' + (RX - 2.5) + '" cy="' + Y + '" r="3" fill="' + INK + '"/>';
  }
  if (e === "starry") {
    return both(function (x) {
      return '<circle cx="' + x + '" cy="' + Y + '" r="7" fill="#fff" stroke="' + INK +
             '" stroke-width="2.5"/>' +
             '<circle cx="' + x + '" cy="' + Y + '" r="3.5" fill="' + INK + '"/>' +
             '<path d="M' + (x + 1) + ',' + (Y - 5) + ' l1.2,2.6 2.6,1.2 -2.6,1.2 -1.2,2.6 ' +
             '-1.2,-2.6 -2.6,-1.2 2.6,-1.2 Z" fill="#fff"/>';
    });
  }
  /* round（默认） */
  return both(function (x) {
    return '<circle cx="' + x + '" cy="' + Y + '" r="6.5" fill="#fff" stroke="' + INK +
           '" stroke-width="2.5"/>' +
           '<circle cx="' + x + '" cy="' + Y + '" r="3" fill="' + INK + '"/>' +
           '<circle cx="' + (x + 2) + '" cy="' + (Y - 2) + '" r="1.4" fill="#fff"/>';
  });
}

function browSVG(browIdx) {
  var b = BROW_LIST[browIdx].id;
  var L = [66, 90], R = [110, 134], Y = 82;
  function line(x1, y1, x2, y2, w) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
           '" stroke="' + INK + '" stroke-width="' + w + '" stroke-linecap="round"/>';
  }
  function curve(x1, y1, cx, cy, x2, y2, w) {
    return '<path d="M' + x1 + ',' + y1 + ' Q' + cx + ',' + cy + ' ' + x2 + ',' + y2 +
           '" stroke="' + INK + '" stroke-width="' + w + '" fill="none" stroke-linecap="round"/>';
  }
  if (b === "thin")   return curve(L[0], Y, 79, Y - 4, L[1], Y - 1, 2.5) + curve(R[0], Y - 1, 121, Y - 4, R[1], Y, 2.5);
  if (b === "sword")  return line(L[0], Y + 4, L[1], Y - 4, 4) + line(R[0], Y - 4, R[1], Y + 4, 4);
  if (b === "moon")   return curve(L[0], Y + 2, 78, Y - 6, L[1], Y, 3.5) + curve(R[0], Y, 122, Y - 6, R[1], Y + 2, 3.5);
  if (b === "sad")    return line(L[0], Y - 4, L[1], Y + 4, 4) + line(R[0], Y + 4, R[1], Y - 4, 4);
  if (b === "raised") return curve(L[0], Y - 2, 78, Y - 8, L[1], Y - 4, 3.5) + curve(R[0], Y - 8, 122, Y - 14, R[1], Y - 10, 3.5);
  return line(L[0], Y, L[1], Y, 6) + line(R[0], Y, R[1], Y, 6); /* thick */
}

function mouthSVG(mouthIdx) {
  var m = MOUTH_LIST[mouthIdx].id;
  var CX = 100, Y = 148;
  if (m === "laugh") {
    return '<path d="M78,144 Q100,142 122,144 Q118,166 100,166 Q82,166 78,144 Z" ' +
           'fill="' + LIP_DARK + '" stroke="' + INK + '" stroke-width="2.5"/>' +
           '<path d="M83,145 Q100,143 117,145 L115,152 Q100,150 85,152 Z" fill="#fff"/>';
  }
  if (m === "flat") {
    return '<line x1="88" y1="' + (Y + 2) + '" x2="112" y2="' + (Y + 2) +
           '" stroke="' + INK + '" stroke-width="3.5" stroke-linecap="round"/>';
  }
  if (m === "pout") {
    return '<ellipse cx="' + CX + '" cy="' + Y + '" rx="7" ry="9" fill="' + LIP +
           '" stroke="' + INK + '" stroke-width="2"/>';
  }
  if (m === "grin") {
    return '<rect x="82" y="140" width="36" height="17" rx="8" fill="#fff" ' +
           'stroke="' + INK + '" stroke-width="2.5"/>' +
           '<line x1="100" y1="140" x2="100" y2="157" stroke="' + INK + '" stroke-width="2"/>';
  }
  if (m === "smirk") {
    return '<path d="M84,' + Y + ' Q104,' + (Y + 10) + ' 118,' + (Y - 6) +
           '" stroke="' + INK + '" stroke-width="4" fill="none" stroke-linecap="round"/>';
  }
  if (m === "wow") {
    return '<ellipse cx="' + CX + '" cy="' + (Y + 4) + '" rx="8" ry="10" fill="' + LIP_DARK +
           '" stroke="' + INK + '" stroke-width="2.5"/>';
  }
  if (m === "calm") {
    return '<path d="M90,' + (Y + 2) + ' Q100,' + Y + ' 110,' + (Y + 2) +
           '" stroke="' + INK + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
  }
  /* smile（默认） */
  return '<path d="M82,' + (Y - 2) + ' Q100,' + (Y + 12) + ' 118,' + (Y - 2) +
         '" stroke="' + INK + '" stroke-width="4" fill="none" stroke-linecap="round"/>';
}

function accSVG(desc) {
  var a = ACC_LIST[desc.ac].id;
  var LX = 78, RX = 122, Y = 106;
  if (a === "glasses") {
    return '<circle cx="' + LX + '" cy="' + Y + '" r="16" fill="none" stroke="' + INK + '" stroke-width="3"/>' +
           '<circle cx="' + RX + '" cy="' + Y + '" r="16" fill="none" stroke="' + INK + '" stroke-width="3"/>' +
           '<path d="M94,' + (Y - 2) + ' Q100,' + (Y - 6) + ' 106,' + (Y - 2) +
           '" stroke="' + INK + '" stroke-width="3" fill="none"/>' +
           '<line x1="62" y1="' + (Y - 4) + '" x2="48" y2="' + (Y - 10) + '" stroke="' + INK + '" stroke-width="3"/>' +
           '<line x1="138" y1="' + (Y - 4) + '" x2="152" y2="' + (Y - 10) + '" stroke="' + INK + '" stroke-width="3"/>';
  }
  if (a === "sunglass") {
    return '<path d="M60,94 h36 v20 q0,7 -7,7 h-22 q-7,0 -7,-7 Z" fill="#1f2937"/>' +
           '<path d="M104,94 h36 v20 q0,7 -7,7 h-22 q-7,0 -7,-7 Z" fill="#1f2937"/>' +
           '<rect x="95" y="100" width="10" height="5" fill="#1f2937"/>' +
           '<path d="M68,100 l10,8 M124,100 l10,8" stroke="#9ca3af" stroke-width="2.5"/>';
  }
  if (a === "earrings") {
    return '<line x1="37" y1="124" x2="37" y2="132" stroke="#b45309" stroke-width="2.5"/>' +
           '<circle cx="37" cy="138" r="5.5" fill="#fbbf24" stroke="#b45309" stroke-width="2"/>' +
           '<line x1="163" y1="124" x2="163" y2="132" stroke="#b45309" stroke-width="2.5"/>' +
           '<circle cx="163" cy="138" r="5.5" fill="#fbbf24" stroke="#b45309" stroke-width="2"/>';
  }
  if (a === "beanie") {
    return '<path d="M44,86 C44,38 72,24 100,24 C128,24 156,38 156,86 L156,94 L44,94 Z" fill="#3b82f6"/>' +
           '<rect x="40" y="86" width="120" height="18" rx="9" fill="#1d4ed8"/>' +
           '<circle cx="100" cy="22" r="10" fill="#dbeafe" stroke="#1d4ed8" stroke-width="2"/>';
  }
  if (a === "bowtie") {
    return '<polygon points="100,180 78,170 78,190" fill="#dc2626"/>' +
           '<polygon points="100,180 122,170 122,190" fill="#dc2626"/>' +
           '<circle cx="100" cy="180" r="6.5" fill="#991b1b"/>';
  }
  return ""; /* none */
}

/* 组装完整 SVG；opts.transparent=true 时不画背景（透明 PNG） */
function buildSVG(desc, opts) {
  desc = normalizeDescriptor(desc);
  var transparent = !!(opts && opts.transparent);
  var hair = hairSVG(desc);
  var body =
    bgSVG(desc, transparent) +
    faceSVG(desc) +
    hair.back +
    hair.front +
    eyeSVG(desc.ey) +
    browSVG(desc.br) +
    mouthSVG(desc.mo) +
    accSVG(desc);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + AVATAR_SIZE +
         '" height="' + AVATAR_SIZE + '" viewBox="0 0 ' + AVATAR_SIZE + ' ' + AVATAR_SIZE + '">' +
         body + '</svg>';
}

/* ================= 浏览器：SVG -> canvas 二次绘制 =================
 * 预览与导出走同一渲染链路，保证所见即所得、跨浏览器像素一致。
 */
var svgCache = {}; /* svg 字符串 -> 已加载 Image（按透明/不透明两档缓存） */

function loadImage(svg) {
  return new Promise(function (resolve, reject) {
    var cached = svgCache[svg];
    if (cached) { resolve(cached); return; }
    var blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      svgCache[svg] = img;
      resolve(img);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error("SVG 光栅化失败"));
    };
    img.src = url;
  });
}

/* 把描述子渲染到指定 canvas（正方形边长 size），返回 Promise */
function renderToCanvas(canvas, desc, size, opts) {
  var svg = buildSVG(desc, opts);
  return loadImage(svg).then(function (img) {
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    return canvas;
  });
}

function canvasToBlob(canvas) {
  return new Promise(function (resolve) {
    if (canvas.toBlob) canvas.toBlob(function (b) { resolve(b); }, "image/png");
    else resolve(null);
  });
}

function downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 800);
}

/* ================= 浏览器：UI ================= */
function $(id) { return document.getElementById(id); }

function setStatus(msg, isErr) {
  var el = $("ag-status");
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = isErr ? "#dc2626" : "#047857";
}

var state = {
  desc: descriptorFromSeed(DEFAULT_SEED),
  selectedCell: -1,
  transparent: false,
  size: 256
};

var LAYER_SELECTS = [
  ["bg", "ag-bg", BG_LIST], ["sk", "ag-skin", SKIN_LIST], ["fa", "ag-face", FACE_LIST],
  ["ha", "ag-hair", HAIR_LIST], ["hc", "ag-hc", HAIR_COLORS], ["ey", "ag-eyes", EYE_LIST],
  ["br", "ag-brows", BROW_LIST], ["mo", "ag-mouth", MOUTH_LIST], ["ac", "ag-acc", ACC_LIST]
];

function buildLayerSelects() {
  LAYER_SELECTS.forEach(function (cfg) {
    var sel = $(cfg[1]);
    if (!sel) return;
    cfg[2].forEach(function (v, idx) {
      var o = document.createElement("option");
      o.value = String(idx);
      o.textContent = v.name;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () {
      state.desc[cfg[0]] = clampIndex(parseInt(sel.value, 10), cfg[2].length);
      state.desc.s = (Date.now() % 4294967296) >>> 0; /* 手动精调后刷新种子标记 */
      syncSeedLabel();
      renderMain();
    });
  });
}

function syncLayerSelects() {
  LAYER_SELECTS.forEach(function (cfg) {
    var sel = $(cfg[1]);
    if (sel) sel.value = String(state.desc[cfg[0]]);
  });
}

function syncSeedLabel() {
  var el = $("ag-seed-label");
  if (el) el.textContent = "种子 " + state.desc.s;
}

function renderMain() {
  var c = $("ag-main-canvas");
  if (!c) return;
  renderToCanvas(c, state.desc, 256, { transparent: state.transparent }).then(null, function () {
    setStatus("预览渲染失败，请重试。", true);
  });
  syncLayerSelects();
  syncSeedLabel();
}

/* 9 宫格：每次换一组生成 9 个新种子头像 */
function renderGrid() {
  var grid = $("ag-grid");
  if (!grid) return;
  grid.innerHTML = "";
  state.selectedCell = -1;
  var base = (Date.now() % 1000000000) >>> 0;
  var jobs = [];
  for (var i = 0; i < 9; i++) {
    (function (idx) {
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "ag-cell";
      cell.setAttribute("aria-label", "候选头像 " + (idx + 1));
      var cv = document.createElement("canvas");
      cv.className = "ag-cell-cv";
      cell.appendChild(cv);
      var d = descriptorFromSeed((base + idx * 7919 + 13) >>> 0);
      cell.addEventListener("click", function () {
        var cells = grid.querySelectorAll(".ag-cell");
        for (var k = 0; k < cells.length; k++) cells[k].classList.remove("ag-cell-sel");
        cell.classList.add("ag-cell-sel");
        state.selectedCell = idx;
        state.desc = d;
        setStatus("已选中第 " + (idx + 1) + " 个，可在下方精调图层。");
        renderMain();
        cell.blur();
      });
      grid.appendChild(cell);
      jobs.push(renderToCanvas(cv, d, 128, { transparent: false }).then(function () {
        var tag = document.createElement("span");
        tag.className = "ag-cell-seed";
        tag.textContent = "#" + d.s.toString(36);
        cell.appendChild(tag);
      }));
    })(i);
  }
  Promise.all(jobs).then(null, function () {
    setStatus("批量预览渲染失败，请重试。", true);
  });
}

function applyRestore() {
  var r = parseDescriptor($("ag-seed-input").value);
  if (!r.ok) { setStatus("还原失败：" + r.error + "。", true); return; }
  state.desc = r.desc;
  setStatus("已还原（种子 " + r.seed + "）。");
  renderMain();
}

function exportCurrent(toClipboard) {
  var btn = toClipboard ? $("ag-copy") : $("ag-download");
  if (btn) btn.disabled = true;
  var off = document.createElement("canvas");
  renderToCanvas(off, state.desc, state.size, { transparent: state.transparent }).then(function () {
    return canvasToBlob(off);
  }).then(function (blob) {
    if (!blob) throw new Error("blob");
    var filename = buildExportFilename(state.desc.s, state.size);
    if (toClipboard) {
      if (!(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write)) {
        setStatus("当前浏览器不支持直接复制 PNG，请使用「下载 PNG」。", true);
      } else {
        navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(function () {
          setStatus("PNG（" + state.size + "px" + (state.transparent ? "·透明底" : "") + "）已复制到剪贴板，可直接粘贴。");
        }, function () {
          setStatus("复制被浏览器拒绝，请使用「下载 PNG」。", true);
        });
      }
    } else {
      downloadBlob(blob, filename);
      var kb = Math.round(blob.size / 1024);
      setStatus("已下载 " + filename + "（约 " + kb + " KB" + (state.transparent ? "·透明底" : "") + "）。");
    }
  }).catch(function () {
    setStatus("PNG 生成失败，请重试。", true);
  }).then(function () {
    if (btn) btn.disabled = false;
  });
}

function init() {
  buildLayerSelects();

  $("ag-random").addEventListener("click", function () {
    state.desc = descriptorFromSeed((Math.random() * 4294967296) >>> 0);
    setStatus("已随机生成，可继续精调或导出。");
    renderMain();
    this.blur();
  });
  $("ag-shuffle").addEventListener("click", function () {
    renderGrid();
    setStatus("已换一组，点击任意头像选中精调。");
    this.blur();
  });
  $("ag-restore").addEventListener("click", function () {
    applyRestore();
    this.blur();
  });
  $("ag-seed-input").addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") applyRestore();
  });
  $("ag-copy-json").addEventListener("click", function () {
    var json = serializeDescriptor(state.desc);
    var done = function (ok) {
      setStatus(ok ? "头像描述 JSON 已复制，粘贴到输入框可还原。" : "复制失败，请手动复制下方文本框内容。", !ok);
      var ta = $("ag-json-view");
      if (ta) { ta.value = json; ta.style.display = "block"; }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(function () { done(true); }, function () { done(false); });
    } else { done(false); }
    this.blur();
  });

  $("ag-transparent").addEventListener("change", function () {
    state.transparent = $("ag-transparent").checked;
    renderMain();
  });

  var sizeRadios = document.querySelectorAll('input[name="ag-size"]');
  for (var i = 0; i < sizeRadios.length; i++) {
    (function (r) {
      r.addEventListener("change", function () {
        if (r.checked) state.size = parseInt(r.value, 10);
      });
    })(sizeRadios[i]);
  }

  $("ag-download").addEventListener("click", function () {
    exportCurrent(false);
    this.blur();
  });
  $("ag-copy").addEventListener("click", function () {
    exportCurrent(true);
    this.blur();
  });

  renderGrid();
  renderMain();
}

if (hasDOM()) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    AVATAR_SIZE: AVATAR_SIZE,
    EXPORT_SIZES: EXPORT_SIZES,
    DEFAULT_SEED: DEFAULT_SEED,
    INK: INK, LIP: LIP, LIP_DARK: LIP_DARK,
    mulberry32: mulberry32,
    seedFromString: seedFromString,
    randInt: randInt,
    clampIndex: clampIndex,
    BG_LIST: BG_LIST, SKIN_LIST: SKIN_LIST, FACE_LIST: FACE_LIST,
    HAIR_COLORS: HAIR_COLORS, HAIR_LIST: HAIR_LIST, EYE_LIST: EYE_LIST,
    BROW_LIST: BROW_LIST, MOUTH_LIST: MOUTH_LIST, ACC_LIST: ACC_LIST,
    randomDescriptor: randomDescriptor,
    descriptorFromSeed: descriptorFromSeed,
    validDescriptor: validDescriptor,
    normalizeDescriptor: normalizeDescriptor,
    serializeDescriptor: serializeDescriptor,
    parseDescriptor: parseDescriptor,
    buildExportFilename: buildExportFilename,
    isHexColor: isHexColor,
    bgSVG: bgSVG, faceSVG: faceSVG, hairSVG: hairSVG,
    eyeSVG: eyeSVG, browSVG: browSVG, mouthSVG: mouthSVG, accSVG: accSVG,
    buildSVG: buildSVG
  };
}
})();
