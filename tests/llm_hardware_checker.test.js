/* 本地 LLM 硬件检测器（llm_hardware_checker）纯逻辑单元测试（零依赖）：
 * node tests/llm_hardware_checker.test.js
 * 覆盖：显卡数据完整性与关键显存数据抽查、模型数据完整性、三档判定边界、
 * Apple 统一内存折算、推荐引擎典型用例（8GB→7B Q4_K_M 绿灯 / 70B Q4 红灯 /
 * 128GB 统一内存→70B Q8 可跑）、反向查询、WebGL renderer 解析、
 * JS 零 fetch/XHR、模板静态检查。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var L = require("../static/js/llm_hardware_checker.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "llm_hardware_checker.js"), "utf8");
var TPL = fs.readFileSync(path.join(__dirname, "..", "templates", "llm_hardware_checker.html"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

var GPUS = L.GPUS, MODELS = L.MODELS;

/* ---------- 1. 显卡数据完整性 ---------- */
ok(GPUS.length >= 50, "显卡总数 ≥50（实得 " + GPUS.length + "）");
var ids = GPUS.map(function (g) { return g.id; });
eq(new Set(ids).size, ids.length, "显卡 id 唯一无重复");
var GFIELDS = ["id", "brand", "name", "vram", "kw"];
var bad = [];
GPUS.forEach(function (g) {
    GFIELDS.forEach(function (f) {
        if (g[f] === null || g[f] === undefined) bad.push(g.id + "." + f);
    });
    if (!Array.isArray(g.vram) || g.vram.length === 0) bad.push(g.id + ".vram空");
    if (!Array.isArray(g.kw) || g.kw.length === 0) bad.push(g.id + ".kw空");
});
ok(bad.length === 0, "显卡逐条字段齐全（id/brand/name/vram/kw）" + (bad.length ? "（缺失：" + bad.slice(0, 5).join(",") + "）" : ""));
ok(GPUS.every(function (g) { return L.BRAND_ORDER.indexOf(g.brand) !== -1; }), "显卡品牌枚举合法");
function brandCount(b) { return GPUS.filter(function (g) { return g.brand === b; }).length; }
ok(brandCount("nvidia") >= 20, "NVIDIA ≥20 款");
ok(brandCount("amd") >= 10, "AMD ≥10 款");
ok(brandCount("intel") >= 3, "Intel Arc ≥3 款");
ok(brandCount("apple") >= 10, "Apple Silicon ≥10 款");
ok(brandCount("igpu") >= 2, "核显 ≥2 款");

/* ---------- 2. 关键显卡显存数据抽查 ---------- */
function gpu(id) { return L.getGpu(id); }
eq(gpu("rtx4090").vram[0], 24, "RTX 4090 = 24GB");
ok(gpu("rtx4060ti").vram.indexOf(8) !== -1 && gpu("rtx4060ti").vram.indexOf(16) !== -1, "RTX 4060 Ti = 8/16GB 双版本");
eq(gpu("rx7900xtx").vram[0], 24, "RX 7900 XTX = 24GB");
eq(gpu("rx7900xt").vram[0], 20, "RX 7900 XT = 20GB");
ok(gpu("arca770").vram.indexOf(16) !== -1 && gpu("arca770").vram.indexOf(8) !== -1, "Arc A770 = 16/8GB 双版本");
eq(gpu("arca380").vram[0], 6, "Arc A380 = 6GB");
ok(gpu("applem4max").vram.indexOf(36) !== -1 && gpu("applem4max").vram.indexOf(128) !== -1, "Apple M4 Max = 36/128GB 统一内存");
ok(gpu("applem1").vram.indexOf(8) !== -1 && gpu("applem1").vram.indexOf(16) !== -1, "Apple M1 = 8/16GB 统一内存");
ok(gpu("applem2ultra").vram.indexOf(64) !== -1 && gpu("applem2ultra").vram.indexOf(128) !== -1, "Apple M2 Ultra = 64/128GB");
ok(GPUS.filter(function (g) { return g.unified; }).every(function (g) { return g.brand === "apple"; }), "unified 标记只出现在 Apple Silicon");
ok(GPUS.filter(function (g) { return g.brand === "apple"; }).every(function (g) { return g.unified === true; }), "Apple Silicon 全部带 unified 标记");
eq(gpu("no-such-gpu"), null, "getGpu(不存在) 返回 null");
ok(gpu("rtx3060").vram.indexOf(12) !== -1, "RTX 3060 含 12GB 版本");
eq(gpu("rtx5090").vram[0], 32, "RTX 5090 = 32GB");

/* ---------- 3. 模型数据完整性 ---------- */
ok(MODELS.length >= 18, "模型档位总数 ≥18（实得 " + MODELS.length + "）");
var MFIELDS = ["id", "size", "sizeLabel", "quant", "vram", "tps"];
var mbad = [];
MODELS.forEach(function (m) {
    MFIELDS.forEach(function (f) {
        if (m[f] === null || m[f] === undefined) mbad.push(m.id + "." + f);
    });
    if (!(m.vram > 0)) mbad.push(m.id + ".vram非法");
    if (!Array.isArray(m.tps) || m.tps.length !== 2 || !(m.tps[0] < m.tps[1])) mbad.push(m.id + ".tps非法");
});
ok(mbad.length === 0, "模型逐条字段齐全合法" + (mbad.length ? "（问题：" + mbad.slice(0, 5).join(",") + "）" : ""));
function sizeCount(s) { return MODELS.filter(function (m) { return m.size === s; }).length; }
ok(sizeCount("7B") >= 4, "7B ≥4 个量化版本");
ok(sizeCount("14B") >= 3, "14B ≥3 个量化版本");
ok(sizeCount("32B") >= 3, "32B ≥3 个量化版本");
ok(sizeCount("70B") >= 4, "70B ≥4 个量化版本");
ok(sizeCount("MoE") >= 1, "MoE ≥1 个档位");
var mids = MODELS.map(function (m) { return m.id; });
eq(new Set(mids).size, mids.length, "模型 id 唯一无重复");
/* 关键模型显存数据 */
eq(L.requiredFor("7B", "Q4_K_M"), 4.5, "7B Q4_K_M 需 4.5GB");
eq(L.requiredFor("70B", "Q4_K_M"), 41.0, "70B Q4_K_M 需 41GB");
eq(L.requiredFor("70B", "Q8_0"), 74.0, "70B Q8_0 需 74GB");
eq(L.requiredFor("32B", "Q4_K_M"), 19.5, "32B Q4_K_M 需 19.5GB");
eq(L.requiredFor("9B", "Q4_K_M"), null, "requiredFor(不存在规模) 返回 null");
eq(L.requiredFor("7B", "Q1"), null, "requiredFor(不存在量化) 返回 null");
/* 同一规模内量化越高显存需求越大 */
function quantsOf(size) {
    return MODELS.filter(function (m) { return m.size === size; })
        .sort(function (a, b) { return a.vram - b.vram; });
}
["7B", "14B", "32B", "70B"].forEach(function (s) {
    var qs = quantsOf(s).map(function (m) { return m.vram; });
    var asc = qs.every(function (v, i) { return i === 0 || v >= qs[i - 1]; });
    ok(asc, s + " 组内显存需求随量化版本单调");
});

/* ---------- 4. 三档判定边界 ---------- */
function code(need, eff) { return L.tierFor(need, eff).code; }
eq(code(8.5, 10), "green", "r=0.85 → 绿");
eq(code(8.6, 10), "yellow", "r=0.86 → 黄");
eq(code(10, 10), "yellow", "r=1.0 → 黄");
eq(code(10.1, 10), "yellow", "r=1.01 → 黄（offload 档）");
eq(code(17.5, 10), "yellow", "r=1.75 → 黄");
eq(code(17.6, 10), "red", "r=1.76 → 红");
eq(code(4.5, 8), "green", "验收：8GB + 7B Q4_K_M(4.5GB) → 绿");
eq(code(41.0, 8), "red", "验收：8GB + 70B Q4_K_M(41GB) → 红");
eq(code(74.0, 89.6), "green", "验收：128GB 统一内存(折算 89.6) + 70B Q8_0(74GB) → 绿");
eq(code(41.0, 24), "yellow", "24GB + 70B Q4_K_M(41GB, r=1.71) → 黄（部分 offload 可跑但慢）");
eq(L.tierFor(0, 8).code, "red", "need=0 兜底红");
eq(L.tierFor(4.5, 0).code, "red", "eff=0 兜底红");

/* ---------- 5. Apple 统一内存折算 ---------- */
eq(L.effectiveVram(gpu("applem4"), 16), 11.2, "Apple M4 16GB → 折算 11.2GB");
eq(L.effectiveVram(gpu("applem2ultra"), 128), 89.6, "Apple M2 Ultra 128GB → 折算 89.6GB");
eq(L.effectiveVram(gpu("rtx4090"), 24), 24, "RTX 4090 24GB 不折算");
eq(L.effectiveVram(gpu("igpu_intel"), 8), 8, "核显 8GB 不折算（手动保守值）");
eq(L.effectiveVram(null, 12), 12, "无型号时按原值");
eq(L.effectiveVram(gpu("rtx4060"), "unknown"), 0, "显存 unknown → 0");
eq(L.APPLE_UNIFIED_FACTOR, 0.7, "折算系数为 0.7");

/* ---------- 6. 推荐引擎 ---------- */
var rec8 = L.recommendModels(8);
eq(rec8.length, MODELS.length, "recommendModels 返回全部模型档位");
function tierOf(list, id) {
    for (var i = 0; i < list.length; i++) {
        if (list[i].model.id === id) return list[i].tier.code;
    }
    return null;
}
eq(tierOf(rec8, "7b-q4_k_m"), "green", "推荐引擎：8GB→7B Q4_K_M 绿灯");
eq(tierOf(rec8, "70b-q4_k_m"), "red", "推荐引擎：8GB→70B Q4_K_M 红灯");
eq(tierOf(rec8, "14b-q4_k_m"), "yellow", "推荐引擎：8GB→14B Q4_K_M(9GB) 黄灯");
var rec90 = L.recommendModels(89.6);
eq(tierOf(rec90, "70b-q8_0"), "green", "推荐引擎：89.6GB→70B Q8_0 绿灯");
eq(tierOf(rec90, "7b-q4_0"), "green", "推荐引擎：大显存下 7B 全绿");
ok(rec8.every(function (it) { return ["green", "yellow", "red"].indexOf(it.tier.code) !== -1; }), "三档 code 枚举合法");
ok(rec8.every(function (it) { return it.tier.name && it.tier.desc; }), "每档有名有 desc");

/* ---------- 7. 反向查询 ---------- */
var sug = L.suggestGpus(41.0);
ok(sug.length > 0, "反向查询 70B Q4(41GB) 有满足显卡");
ok(sug.every(function (it) {
    return L.effectiveVram(it.gpu, it.vram) + 1e-9 >= 41.0 / 0.85;
}), "反向查询结果全部满足流畅阈值（need/0.85）");
ok(sug.some(function (it) { return it.gpu.id === "applem2ultra" && it.vram === 128; }), "反向查询含 M2 Ultra 128GB");
var brands = sug.map(function (it) { return it.gpu.brand; });
ok(brands.indexOf("nvidia") === -1, "70B Q4 流畅档无 NVIDIA 单卡（最高 32GB 不够）");
eq(L.suggestGpus(4.5).length > 10, true, "7B Q4 反向查询结果丰富（>10）");
var sugSmall = L.suggestGpus(4.5);
ok(sugSmall.some(function (it) { return it.gpu.id === "rtx4060"; }), "7B Q4 反向查询含 RTX 4060");

/* ---------- 8. WebGL renderer 解析 ---------- */
function p(s) { var g = L.parseRendererString(s); return g ? g.id : null; }
eq(p("ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 (0x00002684) Direct3D11 vs_5_0 ps_5_0, D3D11)"), "rtx4090", "解析 RTX 4090（ANGLE/D3D11 串）");
eq(p("ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Ti, OpenGL 4.6)"), "rtx4060ti", "解析 RTX 4060 Ti（最长关键词优先，不误判 4060）");
eq(p("ANGLE (NVIDIA, NVIDIA GeForce RTX 4060, OpenGL 4.6)"), "rtx4060", "解析 RTX 4060");
eq(p("ANGLE (AMD, AMD Radeon RX 7900 XTX (0x0000744C) Direct3D11 vs_5_0 ps_5_0, D3D11)"), "rx7900xtx", "解析 RX 7900 XTX");
eq(p("ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics (0x000056A0) Direct3D11 vs_5_0 ps_5_0, D3D11)"), "arca770", "解析 Arc A770");
eq(p("Apple M2 Pro"), "applem2pro", "解析 Apple M2 Pro");
eq(p("Apple M4"), "applem4", "解析 Apple M4");
eq(p("ANGLE (Intel, Intel(R) Iris(R) Xe Graphics, OpenGL 4.6)"), "igpu_intel", "解析 Iris Xe 核显");
eq(p("WebKit WebGL"), null, "被屏蔽的渲染器返回 null");
eq(p(""), null, "空串返回 null");
eq(p(null), null, "null 返回 null");
eq(p("ANGLE (NVIDIA, NVIDIA GeForce MX450, OpenGL 4.6)"), null, "未收录型号返回 null");
eq(p("ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Ti, OpenGL 4.6)"), "rtx3080ti", "Ti 后缀不误判 3080");

/* ---------- 9. 渲染辅助 ---------- */
var evil = L.renderModelCard({model: {id: "x", size: "7B", sizeLabel: "s", quant: "<Q>", vram: 1, tps: [1, 2]}, tier: {code: "green", name: "流畅运行", desc: "d"}});
ok(evil.indexOf("&lt;Q&gt;") !== -1 && evil.indexOf("<Q>") === -1, "renderModelCard 转义量化名");
ok(evil.indexOf("lhw-tier-green") !== -1, "renderModelCard 带档位 class");
ok(L.tierBadge({code: "red", name: "带不动"}).indexOf("lhw-red") !== -1, "tierBadge 红色 class");
ok(L.escHtml('a&b<"c">').indexOf("&amp;") !== -1, "escHtml 转义 &");

/* ---------- 10. JS 源码约束：零 fetch/XHR ---------- */
ok(!/\bfetch\s*\(/.test(SRC), "JS 无 fetch 调用");
ok(SRC.indexOf("XMLHttpRequest") === -1, "JS 无 XMLHttpRequest");
ok(SRC.indexOf("WEBGL_debug_renderer_info") !== -1, "JS 使用 WEBGL_debug_renderer_info 检测");

/* ---------- 11. 模板静态检查 ---------- */
ok(TPL.indexOf('rel="canonical" href="https://www.johnkingzcq123.xyz/tools/llm-hardware-checker"') !== -1, "canonical 正确");
ok(TPL.indexOf("application/ld+json") !== -1, "JSON-LD 结构化数据");
ok(TPL.indexOf("/tools/static/js/llm_hardware_checker.js") !== -1, "引用 JS 文件");
ok(TPL.indexOf('{{define "llm_hardware_checker"}}') !== -1, "模板 define 名称正确");
ok(TPL.indexOf('id="lhw-detect-status"') !== -1, "检测区状态框存在");
ok(TPL.indexOf('id="lhw-brand"') !== -1, "品牌选择框存在");
ok(TPL.indexOf('id="lhw-model"') !== -1, "型号选择框存在");
ok(TPL.indexOf('id="lhw-vram"') !== -1, "显存选择框存在");
ok(TPL.indexOf('id="lhw-grid"') !== -1, "推荐结果网格存在");
ok(TPL.indexOf('id="lhw-rev-model"') !== -1, "反向查询选择框存在");
ok(TPL.indexOf('id="lhw-rev-result"') !== -1, "反向查询结果区存在");
ok(TPL.indexOf("统一内存") !== -1 && TPL.indexOf("70%") !== -1, "Apple 统一内存折算提示");
ok(TPL.indexOf("tokens/s") !== -1, "提及 tokens/s");
ok(TPL.indexOf("不构成性能承诺") !== -1 || TPL.indexOf("仅供") !== -1, "tokens/s 免责声明");
ok(TPL.indexOf("零上传") !== -1, "纯前端零上传声明");
ok(TPL.indexOf("@media (max-width:640px)") !== -1, "移动端媒体查询");
ok(TPL.indexOf("WEBGL_debug_renderer_info") !== -1, "模板提及 WebGL 检测原理");
ok(TPL.indexOf("70B") !== -1 && TPL.indexOf("Q4_K_M") !== -1, "模板提及 70B Q4_K_M");
ok(TPL.indexOf('name="keywords"') !== -1 && TPL.indexOf("llm hardware checker") !== -1, "SEO keywords 含英文词");

console.log("\n通过 " + pass + "，失败 " + fail + "，共 " + (pass + fail) + " 断言");
process.exit(fail === 0 ? 0 : 1);
