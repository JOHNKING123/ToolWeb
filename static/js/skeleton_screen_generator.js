/* 骨架屏加载占位生成器（skeleton_screen_generator）纯前端核心逻辑
 * 纯函数经 module.exports 暴露，node tests/skeleton_screen_generator.test.js 自测；
 * 浏览器端：window.SkeletonScreenGenerator 全局 + DOM 装配（本文件末尾）。
 *
 * 生成规则（确定性模板拼接）：
 * - 区块模型 4 种类型：avatar（头像圆形）、image（图片）、text（文本行）、rect（矩形）；
 *   每块字段 {type, width, height, radius}；头像 width 为像素直径、height 恒等于直径、
 *   radius 固定 50%（字段记为 null 表示固定，不受圆角输入影响）；
 *   其余类型 width 为百分比、height 为像素、radius 为像素；
 * - 宽度：百分比 10–100、头像直径 24–96；高度：文本行 12–24、图片／矩形 40–320；
 *   圆角：0–24px；块间距 gap：8–32px，默认 16；超范围输入钳制到边界并中文提示；
 * - 块数上限 12，第 13 块拒绝并中文提示；
 * - buildSkeleton(blocks, opts) 返回 {html, css, standalone}：
 *   HTML 首行为 <div class="skeleton">、末行为 </div>，中间每块一行内联样式 div；
 *   CSS 固定模板：.skeleton 设 flex 纵向 + gap，.skeleton-block 设底色；
 *   动效 none 时无 animation 与 @keyframes；pulse 追加 skeleton-pulse 动画与
 *   @keyframes（opacity 0.6↔1）；shimmer 时背景改为 linear-gradient 扫过渐变、
 *   background-size 200% 100% 与 skeleton-shimmer 动画及 @keyframes（background-position 平移）；
 *   standalone 为自包含 HTML 文档，与下载文件逐字一致；
 * - 空块表时 buildSkeleton 返回空 html／css／standalone，validateSkeleton 提示
 *   「请添加至少一个占位块」且不输出有效代码。
 *
 * 真限制：只生成静态占位 HTML／CSS、不接入真实数据加载、不提供组件库版本、
 * 动效仅 CSS、不收集不上传任何配置。
 * 零网络请求：纯本地处理，不发起任何网络请求。
 */
(function () {
"use strict";

var MAX_BLOCKS = 12;
var TYPE_LABELS = { avatar: "头像", image: "图片", text: "文本行", rect: "矩形" };
var TYPE_LIST = ["avatar", "image", "text", "rect"];
var COLORS = [
    { value: "#e5e7eb", label: "浅灰" },
    { value: "#d1d5db", label: "中灰" },
    { value: "#9ca3af", label: "深灰" },
    { value: "#e7e5e4", label: "暖灰" }
];
var DEFAULT_COLOR = "#e5e7eb";
var ANIMATIONS = [
    { value: "shimmer", label: "扫过" },
    { value: "pulse", label: "呼吸" },
    { value: "none", label: "无" }
];
var DEFAULT_ANIMATION = "shimmer";
var DEFAULT_GAP = 16;

/* 各类型默认值：头像直径 48、图片 100%×180px、文本行 100%×16px、矩形 100%×120px，圆角默认 6px。 */
function defaultBlock(type) {
    if (type === "avatar") return { type: "avatar", width: 48, height: 48, radius: null };
    if (type === "image") return { type: "image", width: 100, height: 180, radius: 6 };
    if (type === "rect") return { type: "rect", width: 100, height: 120, radius: 6 };
    return { type: "text", width: 100, height: 16, radius: 6 };
}

/* 布局预设（块表内容精确，点预设即替换整张块表）。 */
var PRESETS = {
    article: [
        { type: "avatar", width: 48, height: 48, radius: null },
        { type: "text", width: 60, height: 16, radius: 6 },
        { type: "text", width: 100, height: 16, radius: 6 },
        { type: "image", width: 100, height: 180, radius: 6 },
        { type: "text", width: 100, height: 16, radius: 6 },
        { type: "text", width: 80, height: 16, radius: 6 }
    ],
    list: [
        { type: "avatar", width: 40, height: 40, radius: null },
        { type: "text", width: 70, height: 16, radius: 6 },
        { type: "text", width: 50, height: 16, radius: 6 },
        { type: "avatar", width: 40, height: 40, radius: null },
        { type: "text", width: 70, height: 16, radius: 6 },
        { type: "text", width: 50, height: 16, radius: 6 },
        { type: "avatar", width: 40, height: 40, radius: null },
        { type: "text", width: 70, height: 16, radius: 6 },
        { type: "text", width: 50, height: 16, radius: 6 }
    ],
    profile: [
        { type: "avatar", width: 64, height: 64, radius: null },
        { type: "text", width: 40, height: 16, radius: 6 },
        { type: "text", width: 70, height: 16, radius: 6 },
        { type: "rect", width: 100, height: 120, radius: 6 }
    ]
};

function cloneBlocks(blocks) {
    var out = [];
    for (var i = 0; i < blocks.length; i++) {
        out.push({ type: blocks[i].type, width: blocks[i].width, height: blocks[i].height, radius: blocks[i].radius });
    }
    return out;
}

/* 取预设副本（未知名回落文章详情）；返回新数组，调用方改动不影响预设原表。 */
function getPreset(name) {
    var src = PRESETS[name] || PRESETS.article;
    return cloneBlocks(src);
}

function toInt(v, fallback) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return fallback;
    return n;
}

/* 钳制到 [min, max]，返回 {value, clamped}。 */
function clampInt(v, min, max) {
    var n = toInt(v, min);
    if (n < min) return { value: min, clamped: true };
    if (n > max) return { value: max, clamped: true };
    return { value: n, clamped: false };
}

/* 单块归一化：钳制超范围字段，头像 height 恒等于直径、radius 固定为 null。 */
function normalizeBlock(raw) {
    var messages = [];
    var type = (raw && TYPE_LIST.indexOf(raw.type) !== -1) ? raw.type : "text";
    var block;
    if (type === "avatar") {
        var d = clampInt(raw ? raw.width : 48, 24, 96);
        if (d.clamped) {
            messages.push(d.value === 24 ? "头像直径已钳制到最小值 24px" : "头像直径已钳制到最大值 96px");
        }
        block = { type: "avatar", width: d.value, height: d.value, radius: null };
        return { block: block, messages: messages };
    }
    var w = clampInt(raw ? raw.width : 100, 10, 100);
    if (w.clamped) {
        messages.push(w.value === 10 ? "宽度已钳制到最小值 10%" : "宽度已钳制到最大值 100%");
    }
    var hMin = 12, hMax = 24, hLabel = "文本行高度";
    if (type === "image" || type === "rect") { hMin = 40; hMax = 320; hLabel = type === "image" ? "图片高度" : "矩形高度"; }
    var hFallback = type === "image" ? 180 : (type === "rect" ? 120 : 16);
    var h = clampInt(raw ? raw.height : hFallback, hMin, hMax);
    if (h.clamped) {
        messages.push(hLabel + (h.value === hMin ? "已钳制到最小值 " + hMin + "px" : "已钳制到最大值 " + hMax + "px"));
    }
    var r = clampInt(raw ? raw.radius : 6, 0, 24);
    if (r.clamped) {
        messages.push(r.value === 0 ? "圆角已钳制到最小值 0px" : "圆角已钳制到最大值 24px");
    }
    block = { type: type, width: w.value, height: h.value, radius: r.value };
    return { block: block, messages: messages };
}

/* 整表归一化，messages 为全部中文提示汇总。 */
function normalizeBlocks(blocks) {
    var out = [], messages = [];
    if (!blocks) return { blocks: out, messages: messages };
    for (var i = 0; i < blocks.length; i++) {
        var res = normalizeBlock(blocks[i]);
        out.push(res.block);
        for (var j = 0; j < res.messages.length; j++) messages.push(res.messages[j]);
    }
    return { blocks: out, messages: messages };
}

/* 块间距钳制 8–32px。 */
function clampGap(v) {
    var g = clampInt(v, 8, 32);
    return {
        value: g.value,
        clamped: g.clamped,
        message: g.clamped ? (g.value === 8 ? "块间距已钳制到最小值 8px" : "块间距已钳制到最大值 32px") : ""
    };
}

/* 添加区块：上限 12，第 13 块拒绝并中文提示，成功时按类型默认值追加到末尾。 */
function addBlock(blocks, type) {
    var base = blocks ? blocks.slice() : [];
    if (base.length >= MAX_BLOCKS) {
        return { blocks: base, ok: false, message: "已达到 12 块上限，无法继续添加" };
    }
    var t = TYPE_LIST.indexOf(type) !== -1 ? type : "text";
    base.push(defaultBlock(t));
    return { blocks: base, ok: true, message: "" };
}

/* 上移／下移：dir 为 -1 上移、1 下移，越界返回 ok:false 且原表不动。 */
function moveBlock(blocks, index, dir) {
    var base = blocks ? blocks.slice() : [];
    var target = index + dir;
    if (index < 0 || index >= base.length || target < 0 || target >= base.length) {
        return { blocks: base, ok: false };
    }
    var tmp = base[index];
    base[index] = base[target];
    base[target] = tmp;
    return { blocks: base, ok: true };
}

/* 选项归一化：底色非法回落默认浅灰，动效非法回落扫过，间距缺省 16。 */
function normalizeOptions(opts) {
    opts = opts || {};
    var bg = DEFAULT_COLOR;
    for (var i = 0; i < COLORS.length; i++) {
        if (COLORS[i].value === opts.color) bg = opts.color;
    }
    var anim = DEFAULT_ANIMATION;
    for (var j = 0; j < ANIMATIONS.length; j++) {
        if (ANIMATIONS[j].value === opts.animation) anim = opts.animation;
    }
    var gap = (opts.gap === undefined || opts.gap === null || opts.gap === "") ? DEFAULT_GAP : clampGap(opts.gap).value;
    return { color: bg, animation: anim, gap: gap };
}

/* 确定性生成：空块表返回空 html／css／standalone。 */
function buildSkeleton(blocks, opts) {
    if (!blocks || blocks.length === 0) {
        return { html: "", css: "", standalone: "" };
    }
    var norm = normalizeBlocks(blocks);
    var opt = normalizeOptions(opts);
    var htmlLines = ['<div class="skeleton">'];
    for (var i = 0; i < norm.blocks.length; i++) {
        var b = norm.blocks[i];
        var style;
        if (b.type === "avatar") {
            style = "width:" + b.width + "px;height:" + b.height + "px;border-radius:50%";
        } else {
            style = "width:" + b.width + "%;height:" + b.height + "px;border-radius:" + b.radius + "px";
        }
        htmlLines.push('<div class="skeleton-block skeleton-' + b.type + '" style="' + style + '"></div>');
    }
    htmlLines.push("</div>");
    var html = htmlLines.join("\n");
    var cssLines = [".skeleton{display:flex;flex-direction:column;gap:" + opt.gap + "px}"];
    if (opt.animation === "pulse") {
        cssLines.push(".skeleton-block{background:" + opt.color + ";animation:skeleton-pulse 1.5s ease-in-out infinite}");
        cssLines.push("@keyframes skeleton-pulse{0%{opacity:1}50%{opacity:0.6}100%{opacity:1}}");
    } else if (opt.animation === "shimmer") {
        cssLines.push(".skeleton-block{background:linear-gradient(90deg," + opt.color + ",#f3f4f6," + opt.color + ");background-size:200% 100%;animation:skeleton-shimmer 1.5s linear infinite}");
        cssLines.push("@keyframes skeleton-shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}");
    } else {
        cssLines.push(".skeleton-block{background:" + opt.color + "}");
    }
    var css = cssLines.join("\n");
    var standalone = "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"UTF-8\">\n<title>骨架屏加载占位</title>\n<style>\n" + css + "\n</style>\n</head>\n<body>\n" + html + "\n</body>\n</html>";
    return { html: html, css: css, standalone: standalone };
}

/* 有效性校验：空块表提示且不输出有效代码。 */
function validateSkeleton(blocks, opts) {
    if (!blocks || blocks.length === 0) {
        return { ok: false, error: "请添加至少一个占位块", result: null };
    }
    return { ok: true, error: "", result: buildSkeleton(blocks, opts) };
}

var api = {
    MAX_BLOCKS: MAX_BLOCKS,
    TYPE_LABELS: TYPE_LABELS,
    TYPE_LIST: TYPE_LIST,
    COLORS: COLORS,
    DEFAULT_COLOR: DEFAULT_COLOR,
    ANIMATIONS: ANIMATIONS,
    DEFAULT_ANIMATION: DEFAULT_ANIMATION,
    DEFAULT_GAP: DEFAULT_GAP,
    PRESETS: PRESETS,
    defaultBlock: defaultBlock,
    getPreset: getPreset,
    clampInt: clampInt,
    normalizeBlock: normalizeBlock,
    normalizeBlocks: normalizeBlocks,
    clampGap: clampGap,
    addBlock: addBlock,
    moveBlock: moveBlock,
    normalizeOptions: normalizeOptions,
    buildSkeleton: buildSkeleton,
    validateSkeleton: validateSkeleton
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
}
if (typeof window !== "undefined") {
    window.SkeletonScreenGenerator = api;
}

/* ================= 浏览器 DOM 装配（仅浏览器分支执行） ================= */
if (typeof document !== "undefined" && typeof window !== "undefined") {
    function $(id) { return document.getElementById(id); }
    var blocks = getPreset("article");
    var lastResult = null;

    function readOptions() {
        var color = DEFAULT_COLOR, anim = DEFAULT_ANIMATION;
        var colorRadios = document.querySelectorAll('input[name="sk-color"]');
        for (var i = 0; i < colorRadios.length; i++) {
            if (colorRadios[i].checked) color = colorRadios[i].value;
        }
        var animRadios = document.querySelectorAll('input[name="sk-animation"]');
        for (var j = 0; j < animRadios.length; j++) {
            if (animRadios[j].checked) anim = animRadios[j].value;
        }
        var gapInput = $("sk-gap");
        return { color: color, animation: anim, gap: gapInput ? gapInput.value : DEFAULT_GAP };
    }

    function setMsg(text, isError) {
        var msg = $("sk-msg");
        if (msg) {
            msg.textContent = text;
            msg.className = isError ? "sk-msg sk-msg-error" : "sk-msg sk-msg-ok";
        }
    }

    function renderBlocksEditor() {
        var wrap = $("sk-blocks");
        if (!wrap) return;
        wrap.innerHTML = "";
        for (var i = 0; i < blocks.length; i++) {
            (function (index) {
                var b = blocks[index];
                var row = document.createElement("div");
                row.className = "sk-row";
                var label = document.createElement("span");
                label.className = "sk-row-label";
                label.textContent = (index + 1) + " · " + TYPE_LABELS[b.type];
                row.appendChild(label);
                function numInput(value, title, disabled) {
                    var wrap2 = document.createElement("label");
                    wrap2.className = "sk-mini";
                    wrap2.textContent = title;
                    var input = document.createElement("input");
                    input.type = "number";
                    input.value = value;
                    if (disabled) input.disabled = true;
                    wrap2.appendChild(input);
                    return { wrap: wrap2, input: input };
                }
                var wField = numInput(b.width, b.type === "avatar" ? "直径(px)" : "宽度(%)", false);
                row.appendChild(wField.wrap);
                var hField = numInput(b.height, "高度(px)", b.type === "avatar");
                row.appendChild(hField.wrap);
                if (b.type === "avatar") {
                    var fixed = document.createElement("span");
                    fixed.className = "sk-mini sk-fixed";
                    fixed.textContent = "圆角：固定 50%";
                    row.appendChild(fixed);
                } else {
                    var rField = numInput(b.radius, "圆角(px)", false);
                    row.appendChild(rField.wrap);
                    rField.input.addEventListener("change", function () {
                        var nb = { type: b.type, width: b.width, height: b.height, radius: rField.input.value };
                        var res = normalizeBlock(nb);
                        blocks[index] = res.block;
                        renderAll(res.messages.join("；"));
                    });
                }
                wField.input.addEventListener("change", function () {
                    var nb = { type: b.type, width: wField.input.value, height: b.height, radius: b.radius };
                    var res = normalizeBlock(nb);
                    blocks[index] = res.block;
                    renderAll(res.messages.join("；"));
                });
                hField.input.addEventListener("change", function () {
                    var nb = { type: b.type, width: b.width, height: hField.input.value, radius: b.radius };
                    var res = normalizeBlock(nb);
                    blocks[index] = res.block;
                    renderAll(res.messages.join("；"));
                });
                function mkBtn(text, title, fn) {
                    var btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = "sk-mini-btn";
                    btn.textContent = text;
                    btn.title = title;
                    btn.addEventListener("click", fn);
                    return btn;
                }
                row.appendChild(mkBtn("↑", "上移", function () {
                    var res = moveBlock(blocks, index, -1);
                    if (res.ok) { blocks = res.blocks; renderAll(""); }
                }));
                row.appendChild(mkBtn("↓", "下移", function () {
                    var res = moveBlock(blocks, index, 1);
                    if (res.ok) { blocks = res.blocks; renderAll(""); }
                }));
                row.appendChild(mkBtn("删除", "删除该块", function () {
                    blocks.splice(index, 1);
                    renderAll("");
                }));
                wrap.appendChild(row);
            })(i);
        }
        var count = $("sk-count");
        if (count) count.textContent = "当前 " + blocks.length + " / 12 块";
    }

    function renderAll(notice) {
        renderBlocksEditor();
        var previewStyle = $("sk-preview-style");
        var previewBox = $("sk-preview-box");
        var htmlCode = $("sk-html-code");
        var cssCode = $("sk-css-code");
        var norm = normalizeBlocks(blocks);
        blocks = norm.blocks;
        var res = validateSkeleton(blocks, readOptions());
        if (!res.ok) {
            lastResult = null;
            if (previewStyle) previewStyle.textContent = "";
            if (previewBox) previewBox.innerHTML = "";
            if (htmlCode) htmlCode.textContent = "";
            if (cssCode) cssCode.textContent = "";
            setMsg(res.error, true);
            return;
        }
        lastResult = res.result;
        if (previewStyle) previewStyle.textContent = res.result.css;
        if (previewBox) previewBox.innerHTML = res.result.html;
        if (htmlCode) htmlCode.textContent = res.result.html;
        if (cssCode) cssCode.textContent = res.result.css;
        if (notice) {
            setMsg(notice, false);
        } else if (norm.messages.length > 0) {
            setMsg(norm.messages.join("；"), false);
        } else {
            setMsg("已生成骨架屏代码，可复制或下载 skeleton.html", false);
        }
    }

    function copyText(text, okText) {
        if (!text) {
            setMsg("请添加至少一个占位块", true);
            return;
        }
        function fallback() {
            var ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            var ok = false;
            try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
            document.body.removeChild(ta);
            if (ok) { setMsg(okText, false); }
            else { setMsg("复制失败：浏览器未授权剪贴板，请手动全选代码区复制", true); }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                setMsg(okText, false);
            }, fallback);
        } else {
            fallback();
        }
    }

    function bind(id, fn) {
        var el = $(id);
        if (el) el.addEventListener("click", fn);
    }
    bind("sk-preset-article", function () { blocks = getPreset("article"); renderAll("已载入预设：文章详情（6 块）"); });
    bind("sk-preset-list", function () { blocks = getPreset("list"); renderAll("已载入预设：列表项×3（9 块）"); });
    bind("sk-preset-profile", function () { blocks = getPreset("profile"); renderAll("已载入预设：个人资料卡片（4 块）"); });
    bind("sk-sample", function () { blocks = getPreset("article"); renderAll("已载入示例：文章详情预设"); });
    bind("sk-clear", function () { blocks = []; renderAll(""); });
    bind("sk-add", function () {
        var sel = $("sk-add-type");
        var res = addBlock(blocks, sel ? sel.value : "text");
        if (!res.ok) { setMsg(res.message, true); return; }
        blocks = res.blocks;
        renderAll("");
    });
    bind("sk-copy-html", function () { copyText(lastResult ? lastResult.html : "", "已复制 HTML"); });
    bind("sk-copy-css", function () { copyText(lastResult ? lastResult.css : "", "已复制 CSS"); });
    bind("sk-download", function () {
        if (!lastResult) { setMsg("请添加至少一个占位块", true); return; }
        try {
            var blob = new Blob([lastResult.standalone], { type: "text/html;charset=utf-8" });
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "skeleton.html";
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
            setMsg("已下载 skeleton.html", false);
        } catch (e) {
            setMsg("下载失败：浏览器不支持文件导出，请换浏览器重试", true);
        }
    });

    var gapInput = $("sk-gap");
    if (gapInput) {
        gapInput.addEventListener("change", function () {
            var g = clampGap(gapInput.value);
            gapInput.value = g.value;
            renderAll(g.message);
        });
    }
    var radios = document.querySelectorAll('input[name="sk-color"], input[name="sk-animation"]');
    for (var k = 0; k < radios.length; k++) {
        radios[k].addEventListener("change", function () { renderAll(""); });
    }

    renderAll("");
}
})();
