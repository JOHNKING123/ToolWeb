/* 骨架屏加载占位生成器（skeleton_screen_generator）纯逻辑单元测试（零依赖）：
 * node tests/skeleton_screen_generator.test.js
 * 覆盖：预设精确向量（文章详情 6／列表项×3 共 9／个人资料卡片 4，默认文章详情）、
 * 模板向量精确字符串比对（none／shimmer／pulse 三档动效）、钳制与上限（宽度／头像直径／
 * 高度／圆角／间距／第 13 块拒绝）、空块表提示、默认值与选项归一化、移序、
 * 注册（197→198 Path）与零网络请求静态检查、模板真限制文案与互链。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var S = require("../static/js/skeleton_screen_generator.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "skeleton_screen_generator.js"), "utf8");
var TPL = fs.readFileSync(path.join(__dirname, "..", "templates", "skeleton_screen_generator.html"), "utf8");
var GO = fs.readFileSync(path.join(__dirname, "..", "tools", "categories.go"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name); }
function blockSig(b) { return b.type + "|" + b.width + "|" + b.height + "|" + b.radius; }

/* ---------- 1. 预设精确向量 ---------- */
var article = S.getPreset("article");
eq(article.length, 6, "预设：文章详情 6 块");
eq(article.map(blockSig).join(","), "avatar|48|48|null,text|60|16|6,text|100|16|6,image|100|180|6,text|100|16|6,text|80|16|6", "预设：文章详情类型／宽度／高度／圆角逐项一致");
var list = S.getPreset("list");
eq(list.length, 9, "预设：列表项×3 共 9 块");
eq(list.map(blockSig).join(","), "avatar|40|40|null,text|70|16|6,text|50|16|6,avatar|40|40|null,text|70|16|6,text|50|16|6,avatar|40|40|null,text|70|16|6,text|50|16|6", "预设：列表项×3 每组头像 40＋文本行 70%＋文本行 50%");
var profile = S.getPreset("profile");
eq(profile.length, 4, "预设：个人资料卡片 4 块");
eq(profile.map(blockSig).join(","), "avatar|64|64|null,text|40|16|6,text|70|16|6,rect|100|120|6", "预设：个人资料卡片类型／宽度／高度逐项一致");
var article2 = S.getPreset("article");
article2[0].width = 999;
eq(S.getPreset("article")[0].width, 48, "预设：取预设返回副本，改动不污染原表");
eq(S.getPreset("unknown")[0].type, "avatar", "预设：未知名回落文章详情");

/* ---------- 2. 模板向量精确比对（动效 none） ---------- */
var vectorBlocks = [
    { type: "avatar", width: 48, height: 48, radius: null },
    { type: "text", width: 80, height: 16, radius: 6 },
    { type: "text", width: 60, height: 16, radius: 6 }
];
var vectorOpts = { color: "#e5e7eb", animation: "none", gap: 16 };
var vector = S.buildSkeleton(vectorBlocks, vectorOpts);
var expectedHtml = "<div class=\"skeleton\">\n" +
    "<div class=\"skeleton-block skeleton-avatar\" style=\"width:48px;height:48px;border-radius:50%\"></div>\n" +
    "<div class=\"skeleton-block skeleton-text\" style=\"width:80%;height:16px;border-radius:6px\"></div>\n" +
    "<div class=\"skeleton-block skeleton-text\" style=\"width:60%;height:16px;border-radius:6px\"></div>\n" +
    "</div>";
eq(vector.html, expectedHtml, "模板向量：HTML 逐字一致（首行容器、每块一行内联样式、末行闭合）");
eq(vector.css, ".skeleton{display:flex;flex-direction:column;gap:16px}\n.skeleton-block{background:#e5e7eb}", "模板向量：CSS 逐字一致（gap 与底色、无 @keyframes）");
has(vector.html, "width:48px;height:48px;border-radius:50%", "模板向量：头像内联样式");
has(vector.html, "width:80%;height:16px;border-radius:6px", "模板向量：文本行 80% 内联样式");
has(vector.html, "width:60%;height:16px;border-radius:6px", "模板向量：文本行 60% 内联样式");
notHas(vector.css, "@keyframes", "模板向量：无动效时 CSS 不含任何 @keyframes");
notHas(vector.css, "animation:", "模板向量：无动效时 CSS 不含 animation");
has(vector.standalone, "<!DOCTYPE html>", "standalone：含文档类型声明");
has(vector.standalone, "<style>\n" + vector.css + "\n</style>", "standalone：内嵌 CSS 与 css 逐字一致");
has(vector.standalone, vector.html, "standalone：内嵌 HTML 与 html 逐字一致");

/* ---------- 3. 动效三档 ---------- */
var shimmer = S.buildSkeleton(vectorBlocks, { color: "#e5e7eb", animation: "shimmer", gap: 16 });
has(shimmer.css, "skeleton-shimmer", "动效：shimmer 含 skeleton-shimmer");
has(shimmer.css, "linear-gradient(90deg,#e5e7eb,#f3f4f6,#e5e7eb)", "动效：shimmer 含扫过渐变");
has(shimmer.css, "background-size:200% 100%", "动效：shimmer 含 background-size 200% 100%");
has(shimmer.css, "animation:skeleton-shimmer 1.5s linear infinite", "动效：shimmer 动画声明");
has(shimmer.css, "@keyframes skeleton-shimmer", "动效：shimmer 含 @keyframes");
has(shimmer.css, "background-position", "动效：shimmer 关键帧含 background-position 平移");
var pulse = S.buildSkeleton(vectorBlocks, { color: "#d1d5db", animation: "pulse", gap: 16 });
has(pulse.css, "skeleton-pulse", "动效：pulse 含 skeleton-pulse");
has(pulse.css, "animation:skeleton-pulse 1.5s ease-in-out infinite", "动效：pulse 动画声明");
has(pulse.css, "@keyframes skeleton-pulse", "动效：pulse 含 @keyframes");
has(pulse.css, "opacity:0.6", "动效：pulse 关键帧含 opacity 0.6");
has(pulse.css, "background:#d1d5db", "动效：pulse 底色跟随选项");
notHas(shimmer.css, "skeleton-pulse", "动效：shimmer 不含 pulse 关键帧");
notHas(pulse.css, "skeleton-shimmer", "动效：pulse 不含 shimmer 关键帧");

/* ---------- 4. 钳制与上限 ---------- */
eq(S.normalizeBlock({ type: "text", width: 5, height: 16, radius: 6 }).block.width, 10, "钳制：文本行宽度 5→10");
eq(S.normalizeBlock({ type: "text", width: 300, height: 16, radius: 6 }).block.width, 100, "钳制：文本行宽度 300→100");
eq(S.normalizeBlock({ type: "text", width: 5, height: 16, radius: 6 }).messages.join(""), "宽度已钳制到最小值 10%", "钳制：宽度下限中文提示");
eq(S.normalizeBlock({ type: "text", width: 300, height: 16, radius: 6 }).messages.join(""), "宽度已钳制到最大值 100%", "钳制：宽度上限中文提示");
eq(S.normalizeBlock({ type: "avatar", width: 10, height: 10, radius: 6 }).block.width, 24, "钳制：头像直径 10→24");
eq(S.normalizeBlock({ type: "avatar", width: 200, height: 200, radius: 6 }).block.width, 96, "钳制：头像直径 200→96");
eq(S.normalizeBlock({ type: "avatar", width: 200, height: 200, radius: 6 }).block.height, 96, "钳制：头像高度恒等于直径");
eq(S.normalizeBlock({ type: "avatar", width: 48, height: 48, radius: 6 }).block.radius, null, "头像：圆角固定为 null（渲染 50%，不受输入影响）");
eq(S.normalizeBlock({ type: "text", width: 100, height: 5, radius: 6 }).block.height, 12, "钳制：文本行高度下限 12");
eq(S.normalizeBlock({ type: "text", width: 100, height: 30, radius: 6 }).block.height, 24, "钳制：文本行高度上限 24");
eq(S.normalizeBlock({ type: "image", width: 100, height: 10, radius: 6 }).block.height, 40, "钳制：图片高度下限 40");
eq(S.normalizeBlock({ type: "rect", width: 100, height: 500, radius: 6 }).block.height, 320, "钳制：矩形高度上限 320");
eq(S.normalizeBlock({ type: "text", width: 100, height: 16, radius: 30 }).block.radius, 24, "钳制：圆角上限 24");
eq(S.normalizeBlock({ type: "text", width: 100, height: 16, radius: -5 }).block.radius, 0, "钳制：圆角下限 0");
eq(S.clampGap(2).value, 8, "钳制：块间距 2→8");
eq(S.clampGap(100).value, 32, "钳制：块间距 100→32");
eq(S.clampGap(2).message, "块间距已钳制到最小值 8px", "钳制：块间距下限中文提示");
eq(S.clampGap(100).message, "块间距已钳制到最大值 32px", "钳制：块间距上限中文提示");
eq(S.clampGap(16).value, 16, "钳制：块间距合法值不变");
var twelve = [];
for (var i = 0; i < 12; i++) twelve.push(S.defaultBlock("text"));
var over = S.addBlock(twelve, "text");
eq(over.ok, false, "上限：第 13 块被拒绝");
eq(over.blocks.length, 12, "上限：拒绝后块数仍为 12");
eq(over.message, "已达到 12 块上限，无法继续添加", "上限：第 13 块中文提示");
var added = S.addBlock([{ type: "text", width: 100, height: 16, radius: 6 }], "avatar");
eq(added.ok, true, "上限：12 块以内正常添加");
eq(added.blocks.length, 2, "上限：添加后块数为 2");
eq(added.blocks[1].type, "avatar", "添加：按类型默认值追加到末尾");
eq(S.MAX_BLOCKS, 12, "上限：MAX_BLOCKS 为 12");

/* ---------- 5. 默认值、选项归一化与移序 ---------- */
eq(blockSig(S.defaultBlock("avatar")), "avatar|48|48|null", "默认值：头像 48");
eq(blockSig(S.defaultBlock("image")), "image|100|180|6", "默认值：图片 100%×180px");
eq(blockSig(S.defaultBlock("text")), "text|100|16|6", "默认值：文本行 100%×16px");
eq(blockSig(S.defaultBlock("rect")), "rect|100|120|6", "默认值：矩形 100%×120px");
var normOpt = S.normalizeOptions({ color: "#ff0000", animation: "bogus", gap: undefined });
eq(normOpt.color, "#e5e7eb", "选项：非法底色回落默认浅灰");
eq(normOpt.animation, "shimmer", "选项：非法动效回落扫过");
eq(normOpt.gap, 16, "选项：间距缺省 16");
eq(S.normalizeOptions({ color: "#9ca3af", animation: "none", gap: 8 }).gap, 8, "选项：合法间距保留");
var moved = S.moveBlock([{ type: "text", width: 80, height: 16, radius: 6 }, { type: "image", width: 100, height: 180, radius: 6 }], 0, 1);
eq(moved.ok, true, "移序：下移成功");
eq(moved.blocks[0].type, "image", "移序：下移后顺序互换");
eq(S.moveBlock([{ type: "text", width: 80, height: 16, radius: 6 }], 0, -1).ok, false, "移序：首块上移越界拒绝");

/* ---------- 6. 空块表 ---------- */
var empty = S.validateSkeleton([], { color: "#e5e7eb", animation: "none", gap: 16 });
eq(empty.ok, false, "空块表：校验不通过");
eq(empty.error, "请添加至少一个占位块", "空块表：中文提示");
eq(empty.result, null, "空块表：不输出有效代码");
var emptyBuild = S.buildSkeleton([], {});
eq(emptyBuild.html, "", "空块表：buildSkeleton 不输出 HTML");
eq(emptyBuild.css, "", "空块表：buildSkeleton 不输出 CSS");
eq(emptyBuild.standalone, "", "空块表：buildSkeleton 不输出 standalone");

/* ---------- 7. 注册 ---------- */
has(GO, "\"skeleton_screen_generator\"", "注册：ID skeleton_screen_generator");
has(GO, "\"/tools/skeleton-screen-generator\"", "注册：Path /tools/skeleton-screen-generator");
has(GO, "骨架屏加载占位生成器", "注册：Name 骨架屏加载占位生成器");
var pathCount = (GO.match(/"\/tools\/[^"]+"/g) || []).filter(function (p, i, arr) { return arr.indexOf(p) === i; }).length;
eq(pathCount, 198, "注册：总数 197→198 Path");

/* ---------- 8. 零网络请求静态检查 ---------- */
notHas(SRC, "fetch(", "零网络：JS 无网络请求调用");
notHas(SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(SRC, "http://", "零网络：JS 无 http 链接");
notHas(TPL, "fonts.googleapis", "零 CDN：模板无 Google Fonts 外链");
notHas(TPL, "cdn.", "零 CDN：模板无 CDN 域名");
notHas(TPL, "<script src=\"http", "零 CDN：模板无外链脚本");

/* ---------- 9. 模板真限制文案与互链 ---------- */
has(TPL, "只生成静态占位 HTML/CSS、不接入真实数据加载", "真限制：只生成静态占位、不接入真实数据加载文案");
has(TPL, "不提供组件库版本", "真限制：不提供组件库版本文案");
has(TPL, "动效仅 CSS", "真限制：动效仅 CSS 文案");
has(TPL, "请添加至少一个占位块", "模板：空块表中文提示");
has(TPL, "/tools/css-shadow-radius-generator", "互链：含 CSS 阴影与圆角生成器");
has(TPL, "要调真实元素的阴影圆角去 CSS 阴影与圆角生成器，本工具只生成加载占位样式", "互链：文案区分调样式与生成占位");
has(TPL, "skeleton_screen_generator.js", "模板：引用本工具 JS");
has(TPL, "skeleton.html", "操作：下载文件名 skeleton.html");
has(SRC, "复制失败", "降级：JS 含复制失败降级文案");
has(SRC, "请手动全选代码区复制", "降级：复制失败手动复制指引");
has(SRC, "skeleton.html", "降级：JS 下载文件名 skeleton.html");
notHas(TPL, "ulid", "互链：不含未交付 ULID 工具");
notHas(TPL, "nanoid", "互链：不含未交付 NanoID 工具");
notHas(TPL, "env-parser", "互链：不含未交付 .env 工具");

console.log("PASS: " + pass + ", FAIL: " + fail);
process.exit(fail === 0 ? 0 : 1);
