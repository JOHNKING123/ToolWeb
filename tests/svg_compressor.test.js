/* SVG 压缩优化器纯逻辑单元测试（零依赖）：node tests/svg_compressor.test.js
 * 覆盖：
 *  1. 字节数计算（ASCII / 中文 / emoji）与体积展示
 *  2. 压缩率计算（正常/非法输入/体积变大）
 *  3. 数值精度压缩（四舍五入/去尾零/前导零/整数不动/越界钳制）
 *  4. 内置降级清理（注释/metadata/编辑器命名空间/空属性/默认属性/空白折叠/viewBox 保留/toggles 关闭）
 *  5. SVGO 配置构建（三档预设插件集、无损不移除 viewBox/激进含 removeViewBox＋multipass/toggles 覆盖/未知预设）
 *  6. 输出文件名与去重、输入校验、压缩率 chip
 */
"use strict";
var S = require("../static/js/svg_compressor.js");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(arr, v, name) { ok(arr.indexOf(v) !== -1, name + "（应包含 " + v + "）"); }
function hasNo(arr, v, name) { ok(arr.indexOf(v) === -1, name + "（不应包含 " + v + "）"); }
function pluginNames(cfg) { return cfg.plugins.map(function (p) { return p.name; }); }

/* ---------- 1. 字节数与体积展示 ---------- */
eq(S.scByteSize("abc"), 3, "ASCII 字节数");
eq(S.scByteSize("中文"), 6, "中文 3 字节/字");
eq(S.scByteSize("😀"), 4, "emoji 4 字节");
eq(S.scByteSize(""), 0, "空串 0");
eq(S.scByteSize(null), 0, "null 0");
eq(S.scFmtSize(0), "0 B", "0 B");
eq(S.scFmtSize(512), "512 B", "512 B");
eq(S.scFmtSize(2048), "2.0 KB", "2.0 KB");
eq(S.scFmtSize(5 * 1024 * 1024), "5.00 MB", "5.00 MB");
eq(S.scFmtSize(-1), "-", "负数 -");
eq(S.scFmtSize(NaN), "-", "NaN -");

/* ---------- 2. 压缩率 ---------- */
eq(S.scRatio(1000, 700), 30, "1000→700 = 30%");
eq(S.scRatio(1000, 1000), 0, "无变化 0%");
eq(S.scRatio(1000, 1100), -10, "变大 -10%");
eq(S.scRatio(3, 2), 33.3, "保留 1 位小数");
eq(S.scRatio(0, 100), null, "原体积 0 → null");
eq(S.scRatio(-5, 100), null, "负数 → null");
eq(S.scRatio(NaN, 100), null, "NaN → null");

/* ---------- 3. 数值精度压缩 ---------- */
eq(S.scRoundNumbers("M 10.123456 20.987654", 2), "M 10.12 20.99", "6 位小数→2 位四舍五入");
eq(S.scRoundNumbers("x=\"100.0\" y=\"1.500000\"", 3), "x=\"100\" y=\"1.5\"", "去尾零");
eq(S.scRoundNumbers("v=\"0.5\"", 3), "v=\".5\"", "前导零省略");
eq(S.scRoundNumbers("v=\"-0.5\"", 3), "v=\"-.5\"", "负数前导零省略");
eq(S.scRoundNumbers("w=\"100\" h=\"200\"", 2), "w=\"100\" h=\"200\"", "整数不动");
eq(S.scRoundNumbers("c=\"#FF5733\"", 2), "c=\"#FF5733\"", "hex 颜色不动");
eq(S.scRoundNumbers("d=\"M10.5.6\"", 1), "d=\"M10.5.6\"", "精度 1 位");
eq(S.scRoundNumbers("a=\"1.23456\"", 99), "a=\"1.23456\"", "精度越界钳制到 6");
eq(S.scRoundNumbers("a=\"1.23456\"", -2), "a=\"1\"", "精度负数钳制到 0");
eq(S.scRoundNumbers("a=\"1.25\" b=\"-1.25\"", 0), "a=\"1\" b=\"-1\"", "精度 0 四舍五入");
eq(S.scRoundNumbers("font=\"Arial\"", 2), "font=\"Arial\"", "无数字文本不动");

/* ---------- 4. 内置降级清理 ---------- */
var bloated = [
    '<!-- Generator: Adobe Illustrator -->',
    '<!-- 版权注释 -->',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"',
    '     width="100" height="100" viewBox="0 0 100.000000 100.000000" inkscape:version="1.3" data-empty="">',
    '<metadata><rdf:RDF>xxx</rdf:RDF></metadata>',
    '<rect x="10.123456" y="20.654321" width="30" height="30" fill="#000000" stroke="none" opacity="1" fill-opacity="1.0"/>',
    '<g   opacity="1">',
    '  <circle cx="50.111111" cy="50.222222" r="10" fill="#000"/>',
    '</g>',
    '</svg>'
].join("\n");

var cleaned = S.scFallbackOptimize(bloated, { precision: 2 });
ok(cleaned.indexOf("<!--") === -1, "降级：注释被移除");
ok(cleaned.indexOf("<metadata") === -1 && cleaned.indexOf("rdf:RDF") === -1, "降级：metadata 被移除");
ok(cleaned.indexOf("inkscape") === -1, "降级：编辑器命名空间声明与属性被移除");
ok(cleaned.indexOf('data-empty=""') === -1, "降级：空属性被移除");
ok(cleaned.indexOf('fill="#000000"') === -1, "降级：默认 fill #000000 被移除");
ok(cleaned.indexOf('fill="#000"') === -1, "降级：默认 fill #000 被移除");
ok(cleaned.indexOf('stroke="none"') === -1, "降级：默认 stroke=none 被移除");
ok(cleaned.indexOf('opacity="1"') === -1 && cleaned.indexOf('fill-opacity="1.0"') === -1, "降级：opacity=1 系列被移除");
ok(cleaned.indexOf("10.123456") === -1 && cleaned.indexOf("10.12") !== -1, "降级：数值精度压缩到 2 位");
ok(cleaned.indexOf(">\n<") === -1 && cleaned.indexOf("><") !== -1, "降级：标签间空白折叠");
ok(cleaned.indexOf("viewBox") !== -1, "降级：viewBox 保留");
ok(cleaned.indexOf("<svg") !== -1 && cleaned.indexOf("</svg>") !== -1, "降级：svg 结构完整");
ok(S.scByteSize(cleaned) < S.scByteSize(bloated), "降级：体积确实减小");
var cleanRatio = S.scRatio(S.scByteSize(bloated), S.scByteSize(cleaned));
ok(cleanRatio !== null && cleanRatio > 10, "降级：臃肿样本压缩率 >10%（实测 " + cleanRatio + "%）");

/* toggles 关闭时对应项保留 */
var keepComments = S.scFallbackOptimize("<!-- keep me --><svg><rect/></svg>", { comments: false });
ok(keepComments.indexOf("<!-- keep me -->") !== -1, "降级：comments=false 时注释保留");
var keepMeta = S.scFallbackOptimize("<svg><metadata>x</metadata><rect/></svg>", { metadata: false });
ok(keepMeta.indexOf("<metadata>") !== -1, "降级：metadata=false 时 metadata 保留");
var keepNs = S.scFallbackOptimize('<svg xmlns:inkscape="urn:x" inkscape:ver="1"><rect/></svg>', { editorNS: false });
ok(keepNs.indexOf("inkscape") !== -1, "降级：editorNS=false 时命名空间保留");
var keepEmpty = S.scFallbackOptimize('<svg><rect data-x=""/></svg>', { emptyAttrs: false });
ok(keepEmpty.indexOf('data-x=""') !== -1, "降级：emptyAttrs=false 时空属性保留");
var keepDef = S.scFallbackOptimize('<svg><rect fill="#000000"/></svg>', { defaultAttrs: false });
ok(keepDef.indexOf('fill="#000000"') !== -1, "降级：defaultAttrs=false 时默认属性保留");
var keepPrec = S.scFallbackOptimize('<svg><rect x="1.23456"/></svg>', { precision: 5 });
ok(keepPrec.indexOf("1.23456") !== -1, "降级：precision=5 保留 5 位小数");

/* ---------- 5. SVGO 配置构建 ---------- */
var lossless = S.scSvgoConfig("lossless", { precision: 3 });
ok(lossless !== null, "lossless 配置非空");
var lnames = pluginNames(lossless);
hasNo(lnames, "removeViewBox", "无损：不移除 viewBox");
hasNo(lnames, "removeMetadata", "无损基础集：不含 removeMetadata（靠 toggle 加入）");
has(lnames, "removeDoctype", "无损：含 removeDoctype");
has(lnames, "collapseGroups", "无损：含 collapseGroups");
eq(lossless.multipass, false, "无损：multipass=false");

var balanced = S.scSvgoConfig("balanced", { precision: 3 });
var bnames = pluginNames(balanced);
has(bnames, "removeMetadata", "轻度：含 removeMetadata");
has(bnames, "removeEditorsNSData", "轻度：含 removeEditorsNSData");
has(bnames, "removeEmptyAttrs", "轻度：含 removeEmptyAttrs");
has(bnames, "removeUnusedNS", "轻度：含 removeUnusedNS");
hasNo(bnames, "removeViewBox", "轻度：不移除 viewBox");
eq(balanced.multipass, false, "轻度：multipass=false");

var aggressive = S.scSvgoConfig("aggressive", { precision: 2 });
var anames = pluginNames(aggressive);
has(anames, "removeViewBox", "激进：含 removeViewBox");
has(anames, "removeTitle", "激进：含 removeTitle");
has(anames, "removeDesc", "激进：含 removeDesc");
has(anames, "removeHiddenElems", "激进：含 removeHiddenElems");
has(anames, "removeUselessDefs", "激进：含 removeUselessDefs");
eq(aggressive.multipass, true, "激进：multipass=true");

/* cleanupNumericValues 精度注入 */
function findPlugin(cfg, name) {
    for (var i = 0; i < cfg.plugins.length; i++) if (cfg.plugins[i].name === name) return cfg.plugins[i];
    return null;
}
eq(findPlugin(S.scSvgoConfig("balanced", { precision: 2 }), "cleanupNumericValues").params.floatPrecision, 2, "精度滑块 2 注入 cleanupNumericValues");
eq(findPlugin(S.scSvgoConfig("balanced", { precision: 9 }), "cleanupNumericValues").params.floatPrecision, 6, "精度越界钳制 6");
eq(findPlugin(S.scSvgoConfig("balanced", {}), "cleanupNumericValues").params.floatPrecision, 3, "精度缺省 3");
eq(S.scSvgoConfig("balanced", { precision: 3 }).js2svg.pretty, false, "js2svg.pretty=false（不美化输出）");

/* toggles 覆盖预设 */
var offMeta = S.scSvgoConfig("balanced", { metadata: false });
hasNo(pluginNames(offMeta), "removeMetadata", "toggle 关闭：从轻度预设移除 removeMetadata");
var onComments = S.scSvgoConfig("lossless", { comments: true });
has(pluginNames(onComments), "removeComments", "toggle 打开：无损预设加入 removeComments");
var offComments = S.scSvgoConfig("balanced", { comments: true, metadata: false, editorNS: false });
has(pluginNames(offComments), "removeComments", "toggle 打开：加入 removeComments");
hasNo(pluginNames(offComments), "removeEditorsNSData", "toggle 关闭：移除 removeEditorsNSData");
var defaultToggles = S.scSvgoConfig("lossless", { precision: 3, comments: true, metadata: true, editorNS: true, emptyAttrs: true, defaultAttrs: true });
has(pluginNames(defaultToggles), "removeComments", "默认全开：无损＋注释清理");
has(pluginNames(defaultToggles), "removeMetadata", "默认全开：无损＋metadata 清理");
has(pluginNames(defaultToggles), "removeEditorsNSData", "默认全开：无损＋编辑器命名空间清理");
has(pluginNames(defaultToggles), "removeEmptyAttrs", "默认全开：无损＋空属性清理");
has(pluginNames(defaultToggles), "removeUnknownsAndDefaults", "默认全开：无损＋默认属性清理");

eq(S.scSvgoConfig("bogus", {}), null, "未知预设 → null");

/* ---------- 6. 文件名 / 去重 / 输入校验 / chip ---------- */
eq(S.scOutName("icon.svg"), "icon.min.svg", "icon.svg → icon.min.svg");
eq(S.scOutName("icon.min.svg"), "icon.min.svg", "已是 .min.svg 不重复加");
eq(S.scOutName("noext"), "noext.min.svg", "无扩展名补 .svg");
eq(S.scOutName("a.b.svg"), "a.b.min.svg", "多点文件名");
eq(S.scUniqueName("a.min.svg", []), "a.min.svg", "无冲突原样");
eq(S.scUniqueName("a.min.svg", ["a.min.svg"]), "a.min-2.svg", "冲突追加 -2（扩展名前）");
eq(S.scUniqueName("a.min.svg", ["a.min.svg", "a.min-2.svg"]), "a.min-3.svg", "冲突追加 -3");
eq(S.scAcceptableInput("x.svg", ""), true, ".svg 后缀通过");
eq(S.scAcceptableInput("X.SVG", ""), true, "大写后缀通过");
eq(S.scAcceptableInput("x.svg", "image/svg+xml"), true, "mime 通过");
eq(S.scAcceptableInput("x.png", "image/png"), false, "png 不通过");
eq(S.scAcceptableInput("x.txt", ""), false, "txt 不通过");
var chip1 = S.scRatioChip(42.7);
eq(chip1.text, "-42.7%", "chip 文案 -42.7%");
eq(chip1.cls, "sc-chip-good", "≥30% 好评级");
eq(S.scRatioChip(12.3).cls, "sc-chip-mid", "0~30% 中评级");
eq(S.scRatioChip(-5).cls, "sc-chip-bad", "负数差评级");
eq(S.scRatioChip(null).text, "-", "null 显示 -");

console.log("\nSVG 压缩优化器测试：通过 " + pass + "，失败 " + fail);
process.exit(fail ? 1 : 0);
