/* 网站无障碍检查器（accessibility_scanner）纯前端核心逻辑
 * 纯函数经 module.exports 暴露，node tests/accessibility_scanner.test.js 自测；
 * 浏览器端：window.AccessibilityScanner 全局 + DOM 装配（本文件末尾）。
 *
 * 设计说明：
 * - 引擎：DOMParser 本地解析粘贴的 HTML 源码 → extractModel 抽成纯数据模型 →
 *   gradePage 跑 12 条确定性规则 → 总分 0-100＋等级＋Markdown 报告。
 *   脚本零 fetch/XHR、零上传（页面文案明示「源码不出浏览器」）。
 * - 12 条规则（五组；规格见 BACKLOG 2026-10-24 01:45 排期条目）：
 *   图片与替代文本(1)：图片 alt；
 *   表单与交互控件(3)：表单 label、按钮可访问名、链接文本；
 *   标题与文档结构(3)：标题层级、html lang、document.title；
 *   键盘与 ARIA(3)：tabindex、重复 id、aria 引用；
 *   媒体与对比度(2)：媒体字幕/文字稿、文字对比度。
 * - 打分：通过=100 / 警告=50 / 失败=0，总分=12 项均值四舍五入；
 *   等级：优秀≥85 / 良好≥60 / 待改进<60（沿用 landing_page_grader 口径）。
 * - 误报控制（PM 真限制）：
 *   ① 空 alt（alt=""）用于装饰图是合法写法 → 通过＋提示文案，不判失败；
 *   ② 表单 label 支持「显式 for+id 关联」与「label 包裹控件」两种合法写法；
 *   ③ 对比度只做明确可判定项：内联样式中前景色＋背景色均为简单色值才打分，
 *       背景为图片/渐变/透明或无法判定 → 警告「手动核对」，不判失败。
 * - 能力边界（文案如实声明）：本工具是「无障碍自查工具」，不是 WCAG 合规认证；
 *   键盘焦点陷阱、JS 渲染后内容、动态 ARIA 状态、屏幕阅读器真实行为一律测不到。
 */
(function () {
"use strict";

/* ================= 0. 分组 / 状态 / 等级 ================= */

var GROUPS = [
    { id: "img",       name: "图片与替代文本" },
    { id: "form",      name: "表单与交互控件" },
    { id: "structure", name: "标题与文档结构" },
    { id: "keyboard",  name: "键盘与 ARIA" },
    { id: "media",     name: "媒体与对比度" }
];

function groupName(gid) {
    for (var i = 0; i < GROUPS.length; i++) {
        if (GROUPS[i].id === gid) return GROUPS[i].name;
    }
    return gid;
}

var ST_PASS = "pass", ST_WARN = "warn", ST_FAIL = "fail";
var SCORE = { pass: 100, warn: 50, fail: 0 };

function levelOf(score) {
    if (score >= 85) return "优秀";
    if (score >= 60) return "良好";
    return "待改进";
}

function statusLabel(st) {
    if (st === ST_PASS) return "通过";
    if (st === ST_WARN) return "警告";
    return "失败";
}

/* ================= 1. 纯辅助函数 ================= */

function trim(s) { return String(s == null ? "" : s).replace(/^\s+|\s+$/g, ""); }

/* 标题层级检查：levels 为数字数组；首个标题>h1 或出现跳级（h2→h4）即不通过 */
function checkHeadingOrder(levels) {
    var prev = 0;
    for (var i = 0; i < levels.length; i++) {
        var lv = levels[i];
        if (lv < 1 || lv > 6) continue;
        if (lv > prev + 1) {
            return { ok: false, at: i, from: prev, to: lv };
        }
        prev = lv;
    }
    return { ok: true };
}

/* 重复 id */
function findDuplicateIds(ids) {
    var seen = {}, dups = [];
    (ids || []).forEach(function (id) {
        id = trim(id);
        if (!id) return;
        if (seen[id]) {
            if (dups.indexOf(id) < 0) dups.push(id);
        } else {
            seen[id] = 1;
        }
    });
    return dups;
}

/* ---- 颜色解析与对比度（WCAG 相对亮度公式） ---- */

var NAMED_COLORS = {
    black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0],
    green: [0, 128, 0], blue: [0, 0, 255], yellow: [255, 255, 0],
    gray: [128, 128, 128], grey: [128, 128, 128], silver: [192, 192, 192],
    orange: [255, 165, 0], purple: [128, 0, 128], navy: [0, 0, 128],
    teal: [0, 128, 128], maroon: [128, 0, 0], olive: [128, 128, 0],
    lime: [0, 255, 0], aqua: [0, 255, 255], fuchsia: [255, 0, 255]
};

/* 解析 #rgb / #rrggbb / rgb() / rgba() / 常见英文色名；失败返回 null */
function parseColor(str) {
    var s = trim(str).toLowerCase();
    if (!s) return null;
    if (NAMED_COLORS[s]) {
        var c = NAMED_COLORS[s];
        return { r: c[0], g: c[1], b: c[2], a: 1 };
    }
    var m = /^#([0-9a-f]{3})$/.exec(s);
    if (m) {
        var h = m[1];
        return {
            r: parseInt(h.charAt(0) + h.charAt(0), 16),
            g: parseInt(h.charAt(1) + h.charAt(1), 16),
            b: parseInt(h.charAt(2) + h.charAt(2), 16), a: 1
        };
    }
    m = /^#([0-9a-f]{6})$/.exec(s);
    if (m) {
        var h2 = m[1];
        return {
            r: parseInt(h2.substr(0, 2), 16),
            g: parseInt(h2.substr(2, 2), 16),
            b: parseInt(h2.substr(4, 2), 16), a: 1
        };
    }
    m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)$/.exec(s);
    if (m) {
        return {
            r: Math.min(255, +m[1]), g: Math.min(255, +m[2]),
            b: Math.min(255, +m[3]), a: (m[4] == null ? 1 : parseFloat(m[4]))
        };
    }
    return null;
}

function relLuminance(c) {
    function f(v) {
        v = v / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

/* 对比度 1–21；#000/#fff → 21 */
function contrastRatio(fg, bg) {
    var l1 = relLuminance(fg), l2 = relLuminance(bg), t;
    if (l1 < l2) { t = l1; l1 = l2; l2 = t; }
    return (l1 + 0.05) / (l2 + 0.05);
}

/* 从内联 style 字符串解析字号（px）与是否加粗；解析失败返回 {px: null} */
function parseFontSize(styleStr) {
    var s = String(styleStr || ""), px = null, bold = false;
    var m = /(?:^|;)\s*font-size\s*:\s*([\d.]+)\s*(px|pt|rem|em|%)?/i.exec(s);
    if (m) {
        var v = parseFloat(m[1]), unit = (m[2] || "px").toLowerCase();
        if (unit === "pt") px = v * 1.333;
        else if (unit === "rem" || unit === "em") px = v * 16;
        else if (unit === "%") px = v / 100 * 16;
        else px = v;
    }
    var b = /(?:^|;)\s*font-weight\s*:\s*([a-z]+|\d+)/i.exec(s);
    if (b) {
        var w = trim(b[1]).toLowerCase();
        bold = (w === "bold" || w === "bolder" || (+w >= 700));
    }
    return { px: px, bold: bold };
}

/* 大字判定：≥24px，或 ≥18.66px 加粗（WCAG 大文本口径） */
function isLargeText(fontPx, bold) {
    if (fontPx == null) return false;
    return fontPx >= 24 || (bold && fontPx >= 18.66);
}

/* ================= 2. 12 条确定性规则 ================= */

function mkResult(id, group, title, wcag, status, detail, suggestion) {
    return {
        id: id, group: group, groupName: groupName(group), title: title,
        wcag: wcag || "", status: status, detail: detail,
        suggestion: suggestion || ""
    };
}

function esc(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sampleList(arr, n) {
    return arr.slice(0, n || 5).join("、") + (arr.length > (n || 5) ? " 等" : "");
}

var RULES = [
/* ---------- 图片与替代文本（1） ---------- */
{
    id: "img-alt", group: "img", title: "图片都有替代文本（alt）",
    wcag: "WCAG 2.2 · 1.1.1 非文本内容",
    run: function (m) {
        var imgs = m.images || [];
        if (!imgs.length) return mkResult(this.id, this.group, this.title, this.wcag, ST_PASS,
            "页面没有 <img> 图片，无需检查 alt。", "");
        var missing = [], linkBad = [], decor = 0;
        imgs.forEach(function (im) {
            if (im.decorative) { decor++; return; }
            if (im.alt == null) {
                missing.push("<img src=\"" + (im.src || "?").slice(0, 40) + "\">");
            } else if (im.alt === "" && im.inLink) {
                linkBad.push("<img src=\"" + (im.src || "?").slice(0, 40) + "\">");
            } else if (im.alt === "") {
                decor++;
            }
        });
        if (missing.length || linkBad.length) {
            var parts = [];
            if (missing.length) parts.push("有 " + missing.length + " 张图片完全缺少 alt 属性：" + sampleList(missing));
            if (linkBad.length) parts.push("有 " + linkBad.length + " 张「图片链接」（a 包裹 img）的 alt 为空，整个链接将失去可访问名：" + sampleList(linkBad));
            return mkResult(this.id, this.group, this.title, this.wcag, ST_FAIL,
                parts.join("；") + "。",
                "内容图片补上有意义的 alt（如 alt=\"刚出炉的法式长棍面包\"）；纯装饰图保留空 alt=\"\"（合法，不会误报）；图片链接的 alt 要能说明链接去向。" +
                "（" + this.wcag + "）");
        }
        return mkResult(this.id, this.group, this.title, this.wcag, ST_PASS,
            "全部 " + imgs.length + " 张图片都有 alt 属性" +
            (decor ? "（其中 " + decor + " 张空 alt 为合法装饰图，已正确识别、不误报）" : "") + "。", "");
    }
},
/* ---------- 表单与交互控件（3） ---------- */
{
    id: "form-label", group: "form", title: "表单控件都有标签（label）",
    wcag: "WCAG 2.2 · 3.3.2 标签或说明 / 4.1.2 名称、角色、值",
    run: function (m) {
        var fields = m.formFields || [];
        if (!fields.length) return mkResult(this.id, this.group, this.title, this.wcag, ST_PASS,
            "页面没有表单控件，无需检查 label。", "");
        var bad = [];
        fields.forEach(function (f) {
            if (!f.hasName) {
                bad.push("<" + f.tag + (f.type ? " type=\"" + f.type + "\"" : "") +
                    (f.id ? " id=\"" + f.id + "\"" : "") +
                    (f.nameAttr ? " name=\"" + f.nameAttr + "\"" : "") + ">");
            }
        });
        if (bad.length) return mkResult(this.id, this.group, this.title, this.wcag, ST_FAIL,
            "有 " + bad.length + " 个表单控件缺少可访问名（屏幕阅读器读不出用途）：" + sampleList(bad),
            "二选一修：① 显式关联 <label for=\"控件id\">姓名</label>；② 用 label 包裹控件 <label>姓名 <input …></label>；" +
            "③ 加 aria-label=\"姓名\"。注意 placeholder 不能替代 label。" +
            "（" + this.wcag + "）");
        var srcs = {};
        fields.forEach(function (f) { if (f.nameSource) srcs[f.nameSource] = 1; });
        return mkResult(this.id, this.group, this.title, this.wcag, ST_PASS,
            "全部 " + fields.length + " 个表单控件都有可访问名（" +
            Object.keys(srcs).join("、") + "）。", "");
    }
},
{
    id: "button-name", group: "form", title: "按钮都有可访问名",
    wcag: "WCAG 2.2 · 4.1.2 名称、角色、值",
    run: function (m) {
        var btns = m.buttons || [];
        if (!btns.length) return mkResult(this.id, this.group, this.title, this.wcag, ST_PASS,
            "页面没有按钮，无需检查。", "");
        var bad = 0;
        btns.forEach(function (b) { if (!b.hasName) bad++; });
        if (bad) return mkResult(this.id, this.group, this.title, this.wcag, ST_FAIL,
            "有 " + bad + " 个按钮既无可见文本、又无 aria-label/aria-labelledby，" +
            "屏幕阅读器只能读出「按钮」，用户不知道它是干什么的（图标按钮高危）。",
            "图标按钮加 aria-label，如 <button aria-label=\"关闭弹窗\">×</button>；" +
            "input 图片按钮用 alt 说明功能。可见文本按钮无需改动。" +
            "（" + this.wcag + "）");
        return mkResult(this.id, this.group, this.title, this.wcag, ST_PASS,
            "全部 " + btns.length + " 个按钮都有可访问名。", "");
    }
},
{
    id: "link-text", group: "form", title: "链接都有可辨识文本",
    wcag: "WCAG 2.2 · 2.4.4 链接目的（上下文中）",
    run: function (m) {
        var links = m.links || [];
        if (!links.length) return mkResult(this.id, this.group, this.title, this.wcag, ST_PASS,
            "页面没有链接，无需检查。", "");
        var bad = [];
        links.forEach(function (l) {
            if (!l.hasName) bad.push("<a href=\"" + (l.href || "?").slice(0, 40) + "\">");
        });
        if (bad.length) return mkResult(this.id, this.group, this.title, this.wcag, ST_FAIL,
            "有 " + bad.length + " 个链接没有可辨识文本（空链接/只有无意义图标）：" + sampleList(bad),
            "给链接加上能说明去向的文本，如 <a href=\"/menu\">查看完整菜单</a>；" +
            "图标链接加 aria-label；图片链接的图片 alt 要能说明链接目的。" +
            "（" + this.wcag + "）");
        return mkResult(this.id, this.group, this.title, this.wcag, ST_PASS,
            "全部 " + links.length + " 个链接都有可辨识文本。", "");
    }
},
/* ---------- 标题与文档结构（3） ---------- */
{
    id: "heading-order", group: "structure", title: "标题层级合理",
    wcag: "WCAG 2.2 · 1.3.1 信息与关系 / 2.4.6 标题和标签",
    run: function (m) {
        var hs = m.headings || [];
        if (!hs.length) return mkResult(this.id, this.group, this.title, this.wcag, ST_FAIL,
            "页面没有任何标题（h1–h6），屏幕阅读器用户无法通过标题导航。",
            "按内容层级加上标题：每页一个 h1（如文章标题/站点名），小节用 h2，子小节用 h3，依次递进。" +
            "（" + this.wcag + "）");
        var chk = checkHeadingOrder(hs.map(function (h) { return h.level; }));
        if (!chk.ok) {
            var fromName = chk.from === 0 ? "（页面开头）" : "h" + chk.from;
            return mkResult(this.id, this.group, this.title, this.wcag, ST_FAIL,
                "标题出现跳级：" + fromName + " 后面直接出现 h" + chk.to + "，层级断裂。",
                "标题层级逐级递进，不要跳级：h2 后面用 h3 而不是 h4；不要用标题标签只做字号效果。" +
                "（" + this.wcag + "）");
        }
        var h1n = hs.filter(function (h) { return h.level === 1; }).length;
        if (h1n === 0) return mkResult(this.id, this.group, this.title, this.wcag, ST_FAIL,
            "页面缺少 h1（一级标题），屏幕阅读器缺少页面主标题入口。",
            "给页面加上唯一的 h1，一般是文章标题或页面核心主题。" +
            "（" + this.wcag + "）");
        if (h1n > 1) return mkResult(this.id, this.group, this.title, this.wcag, ST_WARN,
            "h1 出现 " + h1n + " 次，建议每页只保留一个 h1，其余改为 h2。",
            "只留一个 h1（页面主标题）；次级标题降为 h2。" +
            "（" + this.wcag + "）");
        return mkResult(this.id, this.group, this.title, this.wcag, ST_PASS,
            "标题层级逐级递进，h1 唯一（共 " + hs.length + " 个标题）。", "");
    }
},
{
    id: "html-lang", group: "structure", title: "声明了页面语言（html lang）",
    wcag: "WCAG 2.2 · 3.1.1 页面语言",
    run: function (m) {
        var lang = trim(m.htmlLang);
        if (!lang) return mkResult(this.id, this.group, this.title, this.wcag, ST_FAIL,
            "<html> 标签缺少 lang 属性，屏幕阅读器无法选择正确的语音朗读。",
            "在 <html> 上声明语言，中文页用 <html lang=\"zh-CN\">，英文页用 lang=\"en\"。" +
            "（" + this.wcag + "）");
        return mkResult(this.id, this.group, this.title, this.wcag, ST_PASS,
            "已声明页面语言：lang=\"" + lang + "\"。", "");
    }
},
{
    id: "doc-title", group: "structure", title: "页面标题（document.title）不为空",
    wcag: "WCAG 2.2 · 2.4.2 页面标题",
    run: function (m) {
        var t = trim(m.title);
        if (!t) return mkResult(this.id, this.group, this.title, this.wcag, ST_FAIL,
            "缺少 <title> 或标题为空，浏览器标签页与屏幕阅读器都读不到页面名称。",
            "在 <head> 中添加有意义的 <title>，如「阳光烘焙坊 - 现烤面包每日配送」，能概括页面主题。" +
            "（" + this.wcag + "）");
        return mkResult(this.id, this.group, this.title, this.wcag, ST_PASS,
            "页面标题：「" + t.slice(0, 42) + (t.length > 42 ? "…" : "") + "」。", "");
    }
},
/* ---------- 键盘与 ARIA（3） ---------- */
{
    id: "tabindex", group: "keyboard", title: "焦点顺序自然（tabindex）",
    wcag: "WCAG 2.2 · 2.4.3 焦点顺序",
    run: function (m) {
        var tis = m.tabindices || [];
        var positive = tis.filter(function (t) { return t > 0; });
        if (positive.length) return mkResult(this.id, this.group, this.title, this.wcag, ST_FAIL,
            "有 " + positive.length + " 个 tabindex 为正值（" + sampleList(positive.map(String)) + "），" +
            "会打乱键盘 Tab 顺序，形成焦点陷阱。",
            "删除正值 tabindex，让焦点按 DOM 自然顺序走；需要跳过某元素才用 tabindex=\"-1\"；" +
            "确实要参与 Tab 顺序的用 tabindex=\"0」即可。" +
            "（" + this.wcag + "）");
        var zeros = tis.filter(function (t) { return t === 0; }).length;
        if (zeros > 10) return mkResult(this.id, this.group, this.title, this.wcag, ST_WARN,
            "tabindex=\"0\" 使用 " + zeros + " 次（>10），建议检查是否都是可交互元素；" +
            "原生可交互元素（a/button/input）本就可聚焦，无需再加。",
            "只给真正需要键盘聚焦的自定义控件加 tabindex=\"0\"，多余的一律删掉。" +
            "（" + this.wcag + "）");
        return mkResult(this.id, this.group, this.title, this.wcag, ST_PASS,
            "未发现正值 tabindex，焦点顺序自然" + (zeros ? "（" + zeros + " 处 tabindex=\"0\" 在合理范围内）" : "") + "。", "");
    }
},
{
    id: "duplicate-id", group: "keyboard", title: "id 全页唯一",
    wcag: "WCAG 2.1 · 4.1.1 解析（id 全页唯一是 HTML 规范要求）",
    run: function (m) {
        var dups = findDuplicateIds(m.ids);
        if (dups.length) return mkResult(this.id, this.group, this.title, this.wcag, ST_FAIL,
            "发现 " + dups.length + " 组重复 id：「" + sampleList(dups) + "」。" +
            "重复 id 会让 label for 关联、锚点跳转、aria 引用全部错乱。",
            "重复的 id 改用 class，或逐一重命名保证全页唯一。" +
            "（" + this.wcag + "）");
        return mkResult(this.id, this.group, this.title, this.wcag, ST_PASS,
            "未发现重复 id。", "");
    }
},
{
    id: "aria-refs", group: "keyboard", title: "ARIA 引用指向存在的 id",
    wcag: "WCAG 2.2 · 4.1.2 名称、角色、值",
    run: function (m) {
        var bad = m.ariaBadRefs || [];
        if (bad.length) return mkResult(this.id, this.group, this.title, this.wcag, ST_FAIL,
            "有 " + bad.length + " 处 ARIA 属性引用了不存在的 id：" + sampleList(bad) + "。" +
            "引用悬空后，控件的可访问名会丢失。",
            "检查拼写，确保 aria-labelledby / aria-describedby / aria-controls 引用的 id 在页面中真实存在。" +
            "（" + this.wcag + "）");
        return mkResult(this.id, this.group, this.title, this.wcag, ST_PASS,
            (m.ariaRefCount ? m.ariaRefCount + " 处 ARIA 引用全部指向存在的 id。" : "页面未使用 ARIA 引用属性。"), "");
    }
},
/* ---------- 媒体与对比度（2） ---------- */
{
    id: "media-captions", group: "media", title: "音视频有字幕/文字稿",
    wcag: "WCAG 2.2 · 1.2.2 预录字幕 / 1.2.1 纯音频和纯视频",
    run: function (m) {
        var videos = m.videos || [], audios = m.audioCount || 0;
        if (!videos.length && !audios) return mkResult(this.id, this.group, this.title, this.wcag, ST_PASS,
            "页面没有音频/视频媒体，无需检查字幕。", "");
        var parts = [], tips = [];
        var noCap = videos.filter(function (v) { return !v.hasCaptions; }).length;
        if (noCap) {
            parts.push(noCap + " 个 <video> 缺少字幕 track");
            tips.push("给 <video> 加字幕：<track kind=\"captions\" src=\"字幕.vtt\" srclang=\"zh\" label=\"中文字幕\">");
        }
        if (audios) {
            parts.push(audios + " 个 <audio> 未检测到配套文字稿");
            tips.push("在音频附近提供「文字稿」链接，或用 aria-describedby 指向文字稿段落");
        }
        if (!parts.length) return mkResult(this.id, this.group, this.title, this.wcag, ST_PASS,
            videos.length + " 个视频均配有字幕（captions），无音频内容。", "");
        return mkResult(this.id, this.group, this.title, this.wcag, ST_WARN,
            parts.join("；") + "，听障用户无法获取内容。",
            tips.join("；") + "。" + "（" + this.wcag + "）");
    }
},
{
    id: "contrast", group: "media", title: "文字对比度达标（可判定项）",
    wcag: "WCAG 2.2 · 1.4.3 对比度（最低）",
    run: function (m) {
        var items = (m.contrastItems || []).filter(function (it) { return it.fg; });
        if (!items.length) return mkResult(this.id, this.group, this.title, this.wcag, ST_PASS,
            "未发现内联样式声明的文字颜色，无可判定项。", "");
        var fails = [], manuals = [], okN = 0;
        items.forEach(function (it) {
            var alphaBad = (it.fg.a < 1) || (it.bg && it.bg.a < 1);
            if (!it.bg || alphaBad || /gradient|url\(/i.test(it.bgRaw || "")) {
                manuals.push(it);
                return;
            }
            var ratio = contrastRatio(it.fg, it.bg);
            var need = isLargeText(it.fontPx, it.bold) ? 3.0 : 4.5;
            it.ratio = ratio; it.need = need;
            if (ratio + 1e-9 < need) fails.push(it); else okN++;
        });
        function labelOf(it) {
            return "<" + it.tag + ">「" + (it.text || "文字").slice(0, 18) + "」对比度 " +
                it.ratio.toFixed(2) + ":1（要求 ≥" + it.need.toFixed(1) + ":1）";
        }
        if (fails.length) return mkResult(this.id, this.group, this.title, this.wcag, ST_FAIL,
            "有 " + fails.length + " 处文字对比度不达标：" + sampleList(fails.map(labelOf)) + "。" +
            "（仅对内联样式中前景色＋背景色都明确的项打分）",
            "加深文字颜色或调浅背景色，使对比度 ≥4.5:1（大字 ≥3:1）；" +
            "背景是图片/渐变时，给文字加纯色底或文字阴影。" +
            "（" + this.wcag + "）");
        if (manuals.length) return mkResult(this.id, this.group, this.title, this.wcag, ST_WARN,
            "有 " + manuals.length + " 处文字背景为图片/渐变/透明或无法解析，工具无法自动判定" +
            (okN ? "；其余 " + okN + " 处可判定项对比度均达标" : "") + "，请手动核对是否 ≥4.5:1。",
            "打开页面用取色器量一下实际前后景色，或用浏览器无障碍面板的对比度检查手动确认。" +
            "（" + this.wcag + "）");
        return mkResult(this.id, this.group, this.title, this.wcag, ST_PASS,
            okN + " 处可判定的文字对比度全部达标（≥4.5:1，大字 ≥3:1）。", "");
    }
}
];

/* ================= 3. 打分 / 报告 ================= */

function gradePage(model) {
var results = RULES.map(function (r) { return r.run(model);});
var total = 0, counts = { pass: 0, warn: 0, fail: 0};
results.forEach(function (x) {
total += SCORE[x.status] || 0;
counts[x.status]++;
});
var score = Math.round(total / results.length);
return {
score: score, level: levelOf(score), counts: counts,
total: results.length, results: results
};
}

function fmtTime(d) {
function p(n) { return (n < 10? "0": "") + n;}
return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
" " + p(d.getHours()) + ":" + p(d.getMinutes());
}

/* Markdown 报告 */
function buildMarkdown(rep, timeStr) {
var L = [];
L.push("# 网站无障碍检查报告");
L.push("");
L.push("- 检查时间：" + timeStr);
L.push("- 总分：**" + rep.score + " / 100**（" + rep.level + "）");
L.push("- 通过 " + rep.counts.pass + " / 警告 " + rep.counts.warn +
" / 失败 " + rep.counts.fail + "（共 " + rep.total + " 项）");
L.push("");
function section(st, icon, head) {
var items = rep.results.filter(function (r) { return r.status === st;});
if (!items.length) return;
L.push("## " + icon + " " + head + "（" + items.length + "）");
L.push("");
items.forEach(function (r, i) {
L.push("### " + (i + 1) + ". " + r.title + "");
if (r.wcag) L.push("- 条款：" + r.wcag);
L.push("- 现状：" + r.detail);
if (r.suggestion) L.push("- 建议：" + r.suggestion);
L.push("");
});
}
section(ST_FAIL, "❌", "失败");
section(ST_WARN, "⚠️", "警告");
var passed = rep.results.filter(function (r) { return r.status === ST_PASS;});
if (passed.length) {
L.push("## ✅ 通过（" + passed.length + "）");
L.push("");
passed.forEach(function (r) {
L.push("- " + r.title + "" + (r.detail? "：" + r.detail: ""));
});
L.push("");
}
L.push("> 说明：本报告由「网站无障碍检查器」在浏览器本地生成，HTML 源码未上传到任何服务器。");
L.push("> 本工具为无障碍自查工具，可发现常见静态问题，**不是 WCAG 合规认证**；" +
"键盘操作、焦点陷阱、动态内容、屏幕阅读器真实行为等需人工或专业工具复核。");
return L.join("\n");
}

/* ================= 4. 浏览器提取层（DOMParser） ================= */

function extractModel(html) {
if (typeof DOMParser === "undefined") return null;
var doc;
try {
doc = new DOMParser().parseFromString(String(html), "text/html");
} catch (e) {
return null;
}
if (!doc ||!doc.documentElement) return null;

function one(sel) { try { return doc.querySelector(sel);} catch (e) { return null;}}
function all(sel) {
try { return Array.prototype.slice.call(doc.querySelectorAll(sel));}
catch (e) { return [];}
}
/* 沿祖先链找标签（closest 的稳妥替代） */
function closestTag(el, tag) {
tag = tag.toUpperCase();
while (el && el.nodeType === 1) {
if (el.tagName === tag) return el;
el = el.parentNode;
}
return null;
}
function hasAriaName(el) {
return!!(trim(el.getAttribute("aria-label")) ||
trim(el.getAttribute("aria-labelledby")));
}

/* label[for=...] 显式关联表 */
var labelForSet = {};
all("label[for]").forEach(function (lb) {
var f = lb.getAttribute("for");
if (f) labelForSet[f] = true;
});

var images = all("img").map(function (el) {
return {
alt: el.hasAttribute("alt")? el.getAttribute("alt"): null,
src: el.getAttribute("src") || "",
inLink:!!closestTag(el, "A"),
decorative: el.getAttribute("aria-hidden") === "true" ||
el.getAttribute("role") === "presentation"
};
});

var formFields = [];
all("input,textarea,select").forEach(function (el) {
var tag = el.tagName.toLowerCase();
var type = (el.getAttribute("type") || "").toLowerCase();
if (tag === "input" && (type === "hidden" || type === "submit" ||
type === "button" || type === "image")) return;
var id = el.getAttribute("id") || "";
var source = "";
if (id && labelForSet[id]) source = "label for 显式关联";
else if (closestTag(el, "LABEL")) source = "label 包裹";
else if (trim(el.getAttribute("aria-label"))) source = "aria-label";
else if (trim(el.getAttribute("aria-labelledby"))) source = "aria-labelledby";
formFields.push({
tag: tag, type: type, id: id,
nameAttr: el.getAttribute("name") || "",
hasName:!!source, nameSource: source
});
});

var buttons = [];
all("button,input[type=submit],input[type=button],input[type=image]").forEach(function (el) {
var tag = el.tagName.toLowerCase();
var text = tag === "button"
? trim(el.textContent)
: trim(el.getAttribute("value") || el.getAttribute("alt") || "");
buttons.push({
kind: tag === "button"? (el.getAttribute("type") || "button"): ("input:" + (el.getAttribute("type") || "")),
text: text, hasName:!!(text || hasAriaName(el))
});
});

var headings = all("h1,h2,h3,h4,h5,h6").map(function (el) {
return {
level: parseInt(el.tagName.charAt(1), 10),
text: trim(el.textContent).slice(0, 120)
};
});

var tabindices = [];
all("[tabindex]").forEach(function (el) {
var t = parseInt(el.getAttribute("tabindex"), 10);
if (!isNaN(t)) tabindices.push(t);
});

var ids = all("[id]").map(function (el) { return el.getAttribute("id") || "";});

var links = all("a[href]").map(function (el) {
var text = trim(el.textContent);
if (!text) {
var imgs = el.getElementsByTagName("img");
for (var i = 0; i < imgs.length; i++) {
var a = trim(imgs[i].getAttribute("alt") || "");
if (a) { text = a; break;}
}
}
return {
href: el.getAttribute("href") || "",
text: text, hasName:!!(text || hasAriaName(el))
};
});

var videos = all("video").map(function (el) {
var tracks = el.getElementsByTagName("track"), cap = false;
for (var i = 0; i < tracks.length; i++) {
var k = (tracks[i].getAttribute("kind") || "subtitles").toLowerCase();
if (k === "captions" || k === "subtitles" || k === "descriptions") { cap = true; break;}
}
return { hasCaptions: cap};
});
var audioCount = all("audio").length;

/* aria 引用完整性 */
var idSet = {};
ids.forEach(function (id) { if (trim(id)) idSet[trim(id)] = true;});
var ariaBadRefs = [], ariaRefCount = 0;
["aria-labelledby", "aria-describedby", "aria-controls"].forEach(function (attr) {
all("[" + attr + "]").forEach(function (el) {
var refs = String(el.getAttribute(attr) || "").split(/\s+/);
refs.forEach(function (ref) {
ref = trim(ref);
if (!ref) return;
ariaRefCount++;
if (!idSet[ref]) ariaBadRefs.push(attr + "→#" + ref);
});
});
});

/* 内联样式文字对比度（仅明确可判定项） */
var contrastItems = [];
all("[style]").forEach(function (el) {
var st = el.getAttribute("style") || "";
var fm = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(st);
if (!fm) return;
var fg = parseColor(fm[1]);
if (!fg) return;
var bg = null, bgRaw = null;
var bm = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i.exec(st);
if (bm) { bgRaw = trim(bm[1]); bg = parseColor(bgRaw);}
var fs = parseFontSize(st);
contrastItems.push({
fg: fg, bg: bg, bgRaw: bgRaw,
fontPx: fs.px, bold: fs.bold,
tag: el.tagName.toLowerCase(),
text: trim(el.textContent).slice(0, 40)
});
});

return {
title: doc.title || "",
htmlLang: doc.documentElement.getAttribute("lang") || "",
images: images,
formFields: formFields,
buttons: buttons,
headings: headings,
tabindices: tabindices,
ids: ids,
links: links,
videos: videos,
audioCount: audioCount,
ariaBadRefs: ariaBadRefs,
ariaRefCount: ariaRefCount,
contrastItems: contrastItems
};
}

/* ================= 5. 示例 HTML（规范页，预期 优秀） ================= */

var SAMPLE_HTML = [
'<!DOCTYPE html>',
'<html lang="zh-CN">',
'<head>',
'<meta charset="UTF-8">',
'<meta name="viewport" content="width=device-width, initial-scale=1">',
'<title>阳光烘焙坊 - 现烤面包每日配送</title>',
'<meta name="description" content="阳光烘焙坊每日清晨现烤面包，支持在线下单、同城配送。">',
'</head>',
'<body>',
'<header>',
'<img src="logo.png" alt="阳光烘焙坊标志">',
'<h1>阳光烘焙坊</h1>',
'<nav aria-label="主导航">',
'<a href="/">首页</a>',
'<a href="/menu">菜单</a>',
'<a href="/story">品牌故事</a>',
'<a href="/contact">联系我们</a>',
'</nav>',
'</header>',
'<main>',
'<section>',
'<h2>今日推荐</h2>',
'<img src="baguette.jpg" alt="刚出炉的法式长棍面包，表皮金黄酥脆">',
'<img src="deco-divider.png" alt="">',
'<p>每日清晨五点现烤，<a href="/menu">查看完整菜单</a>，<a href="/order" aria-label="立即下单今日面包">立即下单</a>。</p>',
'<h3>招牌推荐</h3>',
'<ul>',
'<li><a href="/menu/sourdough">酸面包</a></li>',
'<li><a href="/menu/croissant"><img src="croissant.jpg" alt="牛角包"></a></li>',
'</ul>',
'</section>',
'<section>',
'<h2>在线下单</h2>',
'<form action="/order" method="post">',
'<p><label for="cust-name">姓名</label><input id="cust-name" name="name" type="text" autocomplete="name"></p>',
'<p><label>电话 <input name="phone" type="tel" aria-describedby="phone-hint"></label></p>',
'<p id="phone-hint">我们只会用此电话联系配送事宜。</p>',
'<p><label for="addr">配送地址</label><textarea id="addr" name="addr" rows="3"></textarea></p>',
'<p><label for="city">城市</label><select id="city" name="city"><option>深圳</option><option>广州</option><option>东莞</option></select></p>',
'<p><label><input type="checkbox" name="agree"> 我已阅读并同意配送说明</label></p>',
'<p><button type="submit">提交订单</button> <button type="button" aria-label="清空表单">×</button></p>',
'</form>',
'</section>',
'<section>',
'<h2>烘焙小课堂</h2>',
'<h3>第一课：认识面粉</h3>',
'<video controls width="480">',
'<source src="flour.mp4" type="video/mp4">',
'<track kind="captions" src="flour.zh.vtt" srclang="zh" label="中文字幕">',
'</video>',
'<p style="color:#1a1a1a;background-color:#ffffff">小提示：面粉要存放在阴凉干燥处，这段文字对比度约 17:1，阅读清晰。</p>',
'<p style="font-size:26px;font-weight:bold;color:#333333;background-color:#ffffff">大字标题同样达标（按 3:1 口径判定）。</p>',
'<h3>第二课：揉面手法</h3>',
'<p>双手按压、折叠、旋转，重复十分钟，面团就会变得光滑有弹性。</p>',
'</section>',
'<section>',
'<h2>门店信息</h2>',
'<p>地址：深圳市南山区阳光路 88 号</p>',
'<p>电话：<a href="tel:0755-88889999">0755-88889999</a></p>',
'<p>营业时间：每日 7:00–21:00</p>',
'</section>',
'</main>',
'<footer>',
'<nav aria-label="底部导航"><a href="/privacy">隐私政策</a> <a href="/terms">服务条款</a></nav>',
'<p>© 2026 阳光烘焙坊</p>',
'</footer>',
'</body>',
'</html>'
].join("\n");

/* ================= 6. 双模式导出 ================= */

var api = {
GROUPS: GROUPS, RULES: RULES, RULE_COUNT: RULES.length,
ST_PASS: ST_PASS, ST_WARN: ST_WARN, ST_FAIL: ST_FAIL,
levelOf: levelOf, statusLabel: statusLabel, groupName: groupName,
trim: trim,
checkHeadingOrder: checkHeadingOrder, findDuplicateIds: findDuplicateIds,
parseColor: parseColor, relLuminance: relLuminance,
contrastRatio: contrastRatio, parseFontSize: parseFontSize,
isLargeText: isLargeText,
fmtTime: fmtTime,
gradePage: gradePage, buildMarkdown: buildMarkdown,
extractModel: extractModel, SAMPLE_HTML: SAMPLE_HTML
};

if (typeof module!== "undefined" && module.exports) {
module.exports = api;
} else if (typeof window!== "undefined") {
window.AccessibilityScanner = api;
}

/* ================= 7. 浏览器 DOM 装配 ================= */

if (typeof document!== "undefined" && typeof window!== "undefined") {
(function () {
var ASC = (typeof window.AccessibilityScanner!== "undefined")
? window.AccessibilityScanner: api;
var $ = function (id) { return document.getElementById(id);};

var els = {
input: $("asc-input"), charcount: $("asc-charcount"),
grade: $("asc-grade"), sample: $("asc-sample"), clear: $("asc-clear"),
drop: $("asc-drop"),
result: $("asc-result"), ringFg: $("asc-ring-fg"),
scoreNum: $("asc-score-num"), scoreLevel: $("asc-score-level"),
cPass: $("asc-count-pass"), cWarn: $("asc-count-warn"), cFail: $("asc-count-fail"),
groups: $("asc-groups"), toggleAll: $("asc-toggle-all"),
report: $("asc-report"), copyReport: $("asc-copy-report"),
reportPanel: $("asc-report-panel"),
toast: $("asc-toast")
};
if (!els.input ||!els.grade) return; /* 非本工具页不装配 */

var currentRep = null, currentFilter = "all", toastTimer = null;
var RING_C = 2 * Math.PI * 58;

function toast(msg) {
els.toast.textContent = msg;
els.toast.classList.add("asc-show");
if (toastTimer) clearTimeout(toastTimer);
toastTimer = setTimeout(function () {
els.toast.classList.remove("asc-show");
}, 2200);
}

function escHtml(s) {
return String(s == null? "": s)
.replace(/&/g, "&amp;").replace(/</g, "&lt;")
.replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function updateCount() {
var n = els.input.value.length;
els.charcount.textContent = "已粘贴 " + n.toLocaleString() + " 字符" +
(n > 1048576? "（超过 1MB，大页面检查可能较慢）": "");
}

function levelColor(level) {
if (level === "优秀") return "#16a34a";
if (level === "良好") return "#d97706";
return "#dc2626";
}

function doGrade() {
var html = els.input.value;
if (!ASC.trim(html)) { toast("请先粘贴 HTML 源码，或点「载入示例」"); els.input.focus(); return;}
if (html.length > 2097152) {
html = html.slice(0, 2097152);
toast("源码超过 2MB，已截断前 2MB 检查");
}
var model = null;
try { model = ASC.extractModel(html);} catch (e) { model = null;}
if (!model) { toast("源码解析失败，请检查是否为有效 HTML"); return;}
currentRep = ASC.gradePage(model);
renderResult();
renderReport();
els.result.style.display = "";
els.reportPanel.style.display = "";
els.result.scrollIntoView({ behavior: "smooth", block: "start"});
}

function renderResult() {
var rep = currentRep;
if (!rep) return;
els.scoreNum.textContent = rep.score;
els.scoreLevel.textContent = rep.level;
els.scoreLevel.style.color = levelColor(rep.level);
els.ringFg.style.stroke = levelColor(rep.level);
els.ringFg.style.strokeDashoffset = String(RING_C * (1 - rep.score / 100));
els.cPass.textContent = rep.counts.pass;
els.cWarn.textContent = rep.counts.warn;
els.cFail.textContent = rep.counts.fail;
renderList();
}

function badgeClass(st) {
return st === "pass"? "asc-b-pass": (st === "warn"? "asc-b-warn": "asc-b-fail");
}
function tagClass(st) {
return st === "pass"? "asc-t-pass": (st === "warn"? "asc-t-warn": "asc-t-fail");
}
function badgeText(st) {
return st === "pass"? "✓": (st === "warn"? "!": "✕");
}

function renderList() {
var rep = currentRep;
if (!rep) return;
var html = "";
ASC.GROUPS.forEach(function (g) {
var items = rep.results.filter(function (r) {
if (r.group!== g.id) return false;
return currentFilter === "all" || r.status === currentFilter;
});
if (!items.length) return;
var gp = 0, gw = 0, gf = 0;
rep.results.forEach(function (r) {
if (r.group!== g.id) return;
if (r.status === "pass") gp++;
else if (r.status === "warn") gw++;
else gf++;
});
html += '<div class="asc-group"><h4 class="asc-group-title">' + escHtml(g.name) +
'<span class="asc-group-meta">通过 ' + gp + " · 警告 " + gw + " · 失败 " + gf + "</span></h4>";
items.forEach(function (r) {
html += '<div class="asc-item asc-st-' + r.status + '">' +
'<button type="button" class="asc-item-head">' +
'<span class="asc-badge ' + badgeClass(r.status) + '">' + badgeText(r.status) + "</span>" +
'<span class="asc-item-title">' + escHtml(r.title) + "</span>" +
'<span class="asc-tag ' + tagClass(r.status) + '">' + ASC.statusLabel(r.status) + "</span>" +
'<span class="asc-item-arrow">▼</span>' +
"</button>" +
'<div class="asc-item-body">' +
(r.wcag? "<p><b>条款：</b>" + escHtml(r.wcag) + "</p>": "") +
"<p><b>现状：</b>" + escHtml(r.detail) + "</p>" +
(r.suggestion? "<p><b>修复建议：</b>" + escHtml(r.suggestion) + "</p>": "") +
"</div></div>";
});
html += "</div>";
});
els.groups.innerHTML = html || '<div class="asc-empty">该筛选下暂无规则。</div>';
var heads = els.groups.querySelectorAll(".asc-item-head");
for (var i = 0; i < heads.length; i++) {
heads[i].addEventListener("click", function () {
this.parentNode.classList.toggle("asc-open");
});
}
}

function syncFilterButtons() {
var btns = document.querySelectorAll("#asc-filters button");
for (var i = 0; i < btns.length; i++) {
btns[i].classList.toggle("asc-f-active",
btns[i].getAttribute("data-filter") === currentFilter);
}
}

function renderReport() {
els.report.value = ASC.buildMarkdown(currentRep, ASC.fmtTime(new Date()));
}

function copyText(text, okMsg) {
function done() { toast(okMsg);}
function fallback() {
var ta = document.createElement("textarea");
ta.value = text;
ta.style.position = "fixed";
ta.style.opacity = "0";
document.body.appendChild(ta);
ta.select();
try { document.execCommand("copy"); done();}
catch (e) { toast("复制失败，请手动复制下方报告");}
document.body.removeChild(ta);
}
if (window.navigator && window.navigator.clipboard &&
window.navigator.clipboard.writeText) {
window.navigator.clipboard.writeText(text).then(done, fallback);
} else {
fallback();
}
}

/* ---- 事件装配 ---- */
els.grade.addEventListener("click", doGrade);
els.sample.addEventListener("click", function () {
els.input.value = ASC.SAMPLE_HTML;
updateCount();
toast("已载入示例页面，可直接点击「开始检查」");
});
els.clear.addEventListener("click", function () {
els.input.value = "";
updateCount();
els.input.focus();
});
els.input.addEventListener("input", updateCount);

var fbtns = document.querySelectorAll("#asc-filters button");
for (var i = 0; i < fbtns.length; i++) {
if (!fbtns[i].getAttribute("data-filter")) continue;
(function (b) {
b.addEventListener("click", function () {
currentFilter = b.getAttribute("data-filter");
syncFilterButtons();
renderList();
});
})(fbtns[i]);
}

if (els.toggleAll) els.toggleAll.addEventListener("click", function () {
var items = els.groups.querySelectorAll(".asc-item");
var anyClosed = false;
for (var i = 0; i < items.length; i++) {
if (!items[i].classList.contains("asc-open")) { anyClosed = true; break;}
}
for (var j = 0; j < items.length; j++) {
items[j].classList.toggle("asc-open", anyClosed);
}
els.toggleAll.textContent = anyClosed? "全部收起": "全部展开";
});

if (els.copyReport) els.copyReport.addEventListener("click", function () {
if (!currentRep) { toast("请先运行检查"); return;}
copyText(els.report.value, "Markdown 报告已复制");
});

/* 拖入.html 文件本地读取（零上传） */
if (els.drop) {
["dragenter", "dragover"].forEach(function (ev) {
els.drop.addEventListener(ev, function (e) {
e.preventDefault();
els.drop.classList.add("asc-dragover");
});
});
["dragleave", "drop"].forEach(function (ev) {
els.drop.addEventListener(ev, function (e) {
e.preventDefault();
els.drop.classList.remove("asc-dragover");
});
});
els.drop.addEventListener("drop", function (e) {
var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
if (!f) return;
if (!/\.html?$/i.test(f.name)) { toast("请拖入.html 文件"); return;}
var rd = new FileReader();
rd.onload = function () {
els.input.value = String(rd.result || "");
updateCount();
toast("已载入 " + f.name + "（本地读取，未上传）");
};
rd.onerror = function () { toast("文件读取失败");};
rd.readAsText(f);
});
}

/* ---- 首次渲染 ---- */
updateCount();
syncFilterButtons();
})();
}
})();
