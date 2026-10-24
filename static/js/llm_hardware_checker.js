/* 本地 LLM 硬件检测器（llm_hardware_checker）纯前端核心逻辑
 * 纯函数经 module.exports 暴露，node tests/llm_hardware_checker.test.js 自测；
 * 浏览器端：window.LlmHwChecker 全局 + DOM 装配（本文件末尾）。
 *
 * 数据说明（规格见 BACKLOG 2026-10-24 09:42 PM 排期条目）：
 * - GPU 静态表（58 款）：NVIDIA RTX 30/40/50、AMD RX 6000/7000、Intel Arc A 系列、
 *   Apple Silicon M1–M4（统一内存，按 70% 折算为可用显存）、常见核显；
 *   每条含 id / brand / name / vram（显存档位数组，首位为默认预填）/
 *   kw（WebGL renderer 匹配关键词，小写数组）/ unified（Apple 统一内存标记）；
 *   显存数据为公开规格（RTX 4090=24GB、4060 Ti=8/16GB 双版本、RX 7900 XTX=24GB 等），
 *   不确定的档位写作多个版本由用户确认。
 * - 模型静态表（21 条）：主流开源模型 7B / 13–14B / 30–32B / 70B / MoE 各量化版本；
 *   vram 为估算显存需求（GB，含模型权重＋常规 2k–4k 上下文开销），tps 为
 *   tokens/s 区间参考（仅供横向比较，不构成性能承诺）。
 * - 三档判定：need/eff ≤ 0.85 绿（流畅）/ ≤ 1.0 黄（能跑偏慢，小上下文）/
 *   ≤ 1.75 黄（能跑但慢，需部分 offload 到内存）/ > 1.75 红（带不动）。
 * - 零 fetch/XHR：纯静态数据，页面不发起任何后端请求；WebGL 检测只读本地
 *   渲染器字符串，不上传。
 */
(function () {
"use strict";

/* ================= 1. 品牌与显存档位 ================= */

var BRAND_LABELS = {
    nvidia: "NVIDIA",
    amd: "AMD",
    intel: "Intel Arc",
    apple: "Apple Silicon",
    igpu: "核显（共享内存）"
};
var BRAND_ORDER = ["nvidia", "amd", "intel", "apple", "igpu"];

/* 手动显存档位（GB）："unknown" 为不确定 */
var VRAM_STEPS = [4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 32, 36, 48, 64, 96, 128];

/* Apple Silicon 统一内存折算系数：按 70% 折为可用显存 */
var APPLE_UNIFIED_FACTOR = 0.7;

/* ================= 2. 显卡静态表（58 款） ================= */
/* vram 首位为选型号后自动预填的默认值 */

var GPUS = [
/* ---- NVIDIA RTX 50 系 ---- */
{id:"rtx5090", brand:"nvidia", name:"GeForce RTX 5090", vram:[32], kw:["rtx 5090"]},
{id:"rtx5080", brand:"nvidia", name:"GeForce RTX 5080", vram:[16], kw:["rtx 5080"]},
{id:"rtx5070ti", brand:"nvidia", name:"GeForce RTX 5070 Ti", vram:[16], kw:["rtx 5070 ti"]},
{id:"rtx5070", brand:"nvidia", name:"GeForce RTX 5070", vram:[12], kw:["rtx 5070"]},
{id:"rtx5060ti", brand:"nvidia", name:"GeForce RTX 5060 Ti", vram:[16, 8], kw:["rtx 5060 ti"]},
{id:"rtx5060", brand:"nvidia", name:"GeForce RTX 5060", vram:[8], kw:["rtx 5060"]},
/* ---- NVIDIA RTX 40 系 ---- */
{id:"rtx4090", brand:"nvidia", name:"GeForce RTX 4090", vram:[24], kw:["rtx 4090"]},
{id:"rtx4080s", brand:"nvidia", name:"GeForce RTX 4080 SUPER", vram:[16], kw:["rtx 4080 super"]},
{id:"rtx4080", brand:"nvidia", name:"GeForce RTX 4080", vram:[16], kw:["rtx 4080"]},
{id:"rtx4070tis", brand:"nvidia", name:"GeForce RTX 4070 Ti SUPER", vram:[16], kw:["rtx 4070 ti super"]},
{id:"rtx4070ti", brand:"nvidia", name:"GeForce RTX 4070 Ti", vram:[12], kw:["rtx 4070 ti"]},
{id:"rtx4070s", brand:"nvidia", name:"GeForce RTX 4070 SUPER", vram:[12], kw:["rtx 4070 super"]},
{id:"rtx4070", brand:"nvidia", name:"GeForce RTX 4070", vram:[12], kw:["rtx 4070"]},
{id:"rtx4060ti", brand:"nvidia", name:"GeForce RTX 4060 Ti", vram:[16, 8], kw:["rtx 4060 ti"]},
{id:"rtx4060", brand:"nvidia", name:"GeForce RTX 4060", vram:[8], kw:["rtx 4060"]},
/* ---- NVIDIA RTX 30 系 ---- */
{id:"rtx3090ti", brand:"nvidia", name:"GeForce RTX 3090 Ti", vram:[24], kw:["rtx 3090 ti"]},
{id:"rtx3090", brand:"nvidia", name:"GeForce RTX 3090", vram:[24], kw:["rtx 3090"]},
{id:"rtx3080ti", brand:"nvidia", name:"GeForce RTX 3080 Ti", vram:[12], kw:["rtx 3080 ti"]},
{id:"rtx3080", brand:"nvidia", name:"GeForce RTX 3080", vram:[12, 10], kw:["rtx 3080"]},
{id:"rtx3070ti", brand:"nvidia", name:"GeForce RTX 3070 Ti", vram:[8], kw:["rtx 3070 ti"]},
{id:"rtx3070", brand:"nvidia", name:"GeForce RTX 3070", vram:[8], kw:["rtx 3070"]},
{id:"rtx3060ti", brand:"nvidia", name:"GeForce RTX 3060 Ti", vram:[8], kw:["rtx 3060 ti"]},
{id:"rtx3060", brand:"nvidia", name:"GeForce RTX 3060", vram:[12, 8], kw:["rtx 3060"]},
{id:"rtx3050", brand:"nvidia", name:"GeForce RTX 3050", vram:[8, 6], kw:["rtx 3050"]},
/* ---- AMD RX 7000 系 ---- */
{id:"rx7900xtx", brand:"amd", name:"Radeon RX 7900 XTX", vram:[24], kw:["rx 7900 xtx", "radeon rx 7900 xtx"]},
{id:"rx7900xt", brand:"amd", name:"Radeon RX 7900 XT", vram:[20], kw:["rx 7900 xt"]},
{id:"rx7800xt", brand:"amd", name:"Radeon RX 7800 XT", vram:[16], kw:["rx 7800 xt"]},
{id:"rx7700xt", brand:"amd", name:"Radeon RX 7700 XT", vram:[12], kw:["rx 7700 xt"]},
{id:"rx7600xt", brand:"amd", name:"Radeon RX 7600 XT", vram:[16], kw:["rx 7600 xt"]},
{id:"rx7600", brand:"amd", name:"Radeon RX 7600", vram:[8], kw:["rx 7600"]},
/* ---- AMD RX 6000 系 ---- */
{id:"rx6950xt", brand:"amd", name:"Radeon RX 6950 XT", vram:[16], kw:["rx 6950 xt"]},
{id:"rx6900xt", brand:"amd", name:"Radeon RX 6900 XT", vram:[16], kw:["rx 6900 xt"]},
{id:"rx6800xt", brand:"amd", name:"Radeon RX 6800 XT", vram:[16], kw:["rx 6800 xt"]},
{id:"rx6800", brand:"amd", name:"Radeon RX 6800", vram:[16], kw:["rx 6800"]},
{id:"rx6750xt", brand:"amd", name:"Radeon RX 6750 XT", vram:[12], kw:["rx 6750 xt"]},
{id:"rx6700xt", brand:"amd", name:"Radeon RX 6700 XT", vram:[12], kw:["rx 6700 xt"]},
{id:"rx6650xt", brand:"amd", name:"Radeon RX 6650 XT", vram:[8], kw:["rx 6650 xt"]},
{id:"rx6600xt", brand:"amd", name:"Radeon RX 6600 XT", vram:[8], kw:["rx 6600 xt"]},
{id:"rx6600", brand:"amd", name:"Radeon RX 6600", vram:[8], kw:["rx 6600"]},
/* ---- Intel Arc ---- */
{id:"arca770", brand:"intel", name:"Intel Arc A770", vram:[16, 8], kw:["arc a770"]},
{id:"arca750", brand:"intel", name:"Intel Arc A750", vram:[8], kw:["arc a750"]},
{id:"arca580", brand:"intel", name:"Intel Arc A580", vram:[8], kw:["arc a580"]},
{id:"arca380", brand:"intel", name:"Intel Arc A380", vram:[6], kw:["arc a380"]},
/* ---- Apple Silicon（统一内存，按 70% 折算） ---- */
{id:"applem1", brand:"apple", name:"Apple M1", vram:[8, 16], kw:["apple m1"], unified:true},
{id:"applem1pro", brand:"apple", name:"Apple M1 Pro", vram:[16, 32], kw:["apple m1 pro"], unified:true},
{id:"applem1max", brand:"apple", name:"Apple M1 Max", vram:[32, 64], kw:["apple m1 max"], unified:true},
{id:"applem2", brand:"apple", name:"Apple M2", vram:[8, 16, 24], kw:["apple m2"], unified:true},
{id:"applem2pro", brand:"apple", name:"Apple M2 Pro", vram:[16, 32], kw:["apple m2 pro"], unified:true},
{id:"applem2max", brand:"apple", name:"Apple M2 Max", vram:[32, 96], kw:["apple m2 max"], unified:true},
{id:"applem2ultra", brand:"apple", name:"Apple M2 Ultra", vram:[64, 128], kw:["apple m2 ultra"], unified:true},
{id:"applem3", brand:"apple", name:"Apple M3", vram:[8, 16, 24], kw:["apple m3"], unified:true},
{id:"applem3pro", brand:"apple", name:"Apple M3 Pro", vram:[18, 36], kw:["apple m3 pro"], unified:true},
{id:"applem3max", brand:"apple", name:"Apple M3 Max", vram:[36, 96, 128], kw:["apple m3 max"], unified:true},
{id:"applem4", brand:"apple", name:"Apple M4", vram:[16, 24, 32], kw:["apple m4"], unified:true},
{id:"applem4pro", brand:"apple", name:"Apple M4 Pro", vram:[24, 48], kw:["apple m4 pro"], unified:true},
{id:"applem4max", brand:"apple", name:"Apple M4 Max", vram:[36, 128], kw:["apple m4 max"], unified:true},
/* ---- 核显（共享系统内存，请保守估算） ---- */
{id:"igpu_intel", brand:"igpu", name:"Intel Iris Xe / UHD 核显（共享内存）", vram:[4, 8, 16], kw:["iris xe", "uhd graphics", "intel(r) uhd"]},
{id:"igpu_amd", brand:"igpu", name:"AMD Radeon 780M / 760M 核显（共享内存）", vram:[4, 8, 16], kw:["radeon 780m", "radeon 760m", "amd radeon(tm) 780m"]}
];

/* ================= 3. 模型静态表（21 条） ================= */
/* sizeLabel: 分组展示名；vram: 估算显存需求 GB（含权重＋常规 2k–4k 上下文开销）；
 * tps: tokens/s 区间参考 [下限, 上限]，仅供横向比较，不构成性能承诺 */

var MODELS = [
/* ---- 7B 级：Llama3-8B / Qwen2.5-7B / Mistral-7B / Phi ---- */
{id:"7b-q4_0", size:"7B", sizeLabel:"7B 级（Llama3-8B / Qwen2.5-7B / Mistral-7B）", quant:"Q4_0", vram:4.0, tps:[70, 160]},
{id:"7b-q4_k_m", size:"7B", sizeLabel:"7B 级（Llama3-8B / Qwen2.5-7B / Mistral-7B）", quant:"Q4_K_M", vram:4.5, tps:[65, 150]},
{id:"7b-q5_k_m", size:"7B", sizeLabel:"7B 级（Llama3-8B / Qwen2.5-7B / Mistral-7B）", quant:"Q5_K_M", vram:5.2, tps:[60, 140]},
{id:"7b-q6_k", size:"7B", sizeLabel:"7B 级（Llama3-8B / Qwen2.5-7B / Mistral-7B）", quant:"Q6_K", vram:6.1, tps:[55, 130]},
{id:"7b-q8_0", size:"7B", sizeLabel:"7B 级（Llama3-8B / Qwen2.5-7B / Mistral-7B）", quant:"Q8_0", vram:8.0, tps:[50, 120]},
/* ---- 13–14B 级：Qwen2.5-14B / Llama2-13B / Gemma2-9B 向上取整 ---- */
{id:"14b-q4_k_m", size:"14B", sizeLabel:"13–14B 级（Qwen2.5-14B / Llama2-13B）", quant:"Q4_K_M", vram:9.0, tps:[30, 80]},
{id:"14b-q5_k_m", size:"14B", sizeLabel:"13–14B 级（Qwen2.5-14B / Llama2-13B）", quant:"Q5_K_M", vram:10.0, tps:[28, 75]},
{id:"14b-q6_k", size:"14B", sizeLabel:"13–14B 级（Qwen2.5-14B / Llama2-13B）", quant:"Q6_K", vram:11.8, tps:[25, 68]},
{id:"14b-q8_0", size:"14B", sizeLabel:"13–14B 级（Qwen2.5-14B / Llama2-13B）", quant:"Q8_0", vram:15.0, tps:[22, 60]},
/* ---- 30–32B 级：Qwen2.5-32B / DeepSeek-R1-Distill-32B ---- */
{id:"32b-q3_k_m", size:"32B", sizeLabel:"30–32B 级（Qwen2.5-32B / DeepSeek-R1-Distill-32B）", quant:"Q3_K_M", vram:15.0, tps:[18, 50]},
{id:"32b-q4_k_m", size:"32B", sizeLabel:"30–32B 级（Qwen2.5-32B / DeepSeek-R1-Distill-32B）", quant:"Q4_K_M", vram:19.5, tps:[15, 45]},
{id:"32b-q5_k_m", size:"32B", sizeLabel:"30–32B 级（Qwen2.5-32B / DeepSeek-R1-Distill-32B）", quant:"Q5_K_M", vram:22.5, tps:[13, 40]},
{id:"32b-q8_0", size:"32B", sizeLabel:"30–32B 级（Qwen2.5-32B / DeepSeek-R1-Distill-32B）", quant:"Q8_0", vram:34.5, tps:[10, 30]},
/* ---- 70B 级：Llama3.1-70B / Qwen2.5-72B ---- */
{id:"70b-q2_k", size:"70B", sizeLabel:"70B 级（Llama3.1-70B / Qwen2.5-72B）", quant:"Q2_K", vram:27.5, tps:[12, 30]},
{id:"70b-q3_k_m", size:"70B", sizeLabel:"70B 级（Llama3.1-70B / Qwen2.5-72B）", quant:"Q3_K_M", vram:33.0, tps:[10, 28]},
{id:"70b-q4_k_m", size:"70B", sizeLabel:"70B 级（Llama3.1-70B / Qwen2.5-72B）", quant:"Q4_K_M", vram:41.0, tps:[8, 25]},
{id:"70b-q5_k_m", size:"70B", sizeLabel:"70B 级（Llama3.1-70B / Qwen2.5-72B）", quant:"Q5_K_M", vram:47.0, tps:[7, 22]},
{id:"70b-q6_k", size:"70B", sizeLabel:"70B 级（Llama3.1-70B / Qwen2.5-72B）", quant:"Q6_K", vram:55.0, tps:[6, 18]},
{id:"70b-q8_0", size:"70B", sizeLabel:"70B 级（Llama3.1-70B / Qwen2.5-72B）", quant:"Q8_0", vram:74.0, tps:[5, 15]},
/* ---- MoE：Mixtral 8x7B（总参数 46.7B，活跃约 13B） ---- */
{id:"mixtral-q4_k_m", size:"MoE", sizeLabel:"MoE（Mixtral 8x7B，活跃参数约 13B）", quant:"Q4_K_M", vram:27.0, tps:[12, 35]},
{id:"mixtral-q5_k_m", size:"MoE", sizeLabel:"MoE（Mixtral 8x7B，活跃参数约 13B）", quant:"Q5_K_M", vram:31.0, tps:[11, 32]}
];

var SIZE_ORDER = ["7B", "14B", "32B", "70B", "MoE"];

/* ================= 4. 纯逻辑：三档判定 ================= */

/* 三档判定：need 为模型估算显存，eff 为可用显存
 * green  绿：need/eff ≤ 0.85，全量进显存、上下文有余量——流畅运行
 * yellow 黄：≤ 1.0 刚好装下（建议小上下文/低并发）——能跑，偏慢；
 *            ≤ 1.75 只能部分层 offload 到内存——能跑但慢
 * red    红：> 1.75——带不动 */
function tierFor(need, eff) {
    if (!(eff > 0) || !(need > 0)) return {code:"red", name:"带不动", desc:"显存信息不足，无法评估"};
    var r = need / eff;
    if (r <= 0.85) return {code:"green", name:"流畅运行", desc:"权重＋常规上下文可全量进显存，还有余量"};
    if (r <= 1.0) return {code:"yellow", name:"能跑，偏慢", desc:"显存刚好装下，建议用较小上下文/低并发"};
    if (r <= 1.75) return {code:"yellow", name:"能跑但慢", desc:"需把部分层 offload 到内存，速度明显下降（约几 tokens/s）"};
    return {code:"red", name:"带不动", desc:"显存远不够，不建议尝试"};
}

/* 可用显存折算：Apple Silicon 统一内存按 70% 折算，其余按原值 */
function effectiveVram(gpu, vram) {
    var v = parseFloat(vram);
    if (isNaN(v) || v <= 0) return 0;
    if (gpu && gpu.unified) {
        return Math.round(v * APPLE_UNIFIED_FACTOR * 10) / 10;
    }
    return v;
}

/* 按 id 取显卡，未找到返回 null */
function getGpu(id) {
    for (var i = 0; i < GPUS.length; i++) {
        if (GPUS[i].id === id) return GPUS[i];
    }
    return null;
}

/* 推荐引擎：输入可用显存 eff（GB），输出全部模型＋三档 */
function recommendModels(eff) {
    var out = [];
    for (var i = 0; i < MODELS.length; i++) {
        var m = MODELS[i];
        out.push({model: m, tier: tierFor(m.vram, eff)});
    }
    return out;
}

/* 反向查询：给定规模＋量化版本，返回估算显存需求（GB），未找到返回 null */
function requiredFor(size, quant) {
    for (var i = 0; i < MODELS.length; i++) {
        if (MODELS[i].size === size && MODELS[i].quant === quant) return MODELS[i].vram;
    }
    return null;
}

/* 反向查询：给定显存需求 need，列出满足「流畅运行」的显卡＋档位
 * 返回 [{gpu, vram}]，按品牌顺序、显存降序 */
function suggestGpus(need) {
    var minEff = need / 0.85;
    var out = [];
    for (var i = 0; i < GPUS.length; i++) {
        var g = GPUS[i];
        for (var j = 0; j < g.vram.length; j++) {
            var eff = effectiveVram(g, g.vram[j]);
            if (eff + 1e-9 >= minEff) {
                out.push({gpu: g, vram: g.vram[j]});
            }
        }
    }
    var brandRank = {};
    for (var k = 0; k < BRAND_ORDER.length; k++) brandRank[BRAND_ORDER[k]] = k;
    out.sort(function (a, b) {
        var ra = brandRank[a.gpu.brand] || 0, rb = brandRank[b.gpu.brand] || 0;
        if (ra !== rb) return ra - rb;
        return b.vram - a.vram;
    });
    return out;
}

/* ================= 5. 纯逻辑：WebGL renderer 解析 ================= */

/* 解析 WebGL renderer 字符串，命中显卡返回 gpu 条目，否则 null。
 * 关键词按长度降序匹配，避免 "RTX 4060" 抢在 "RTX 4060 Ti" 前面命中。 */
function parseRendererString(renderer) {
    if (!renderer) return null;
    /* 归一化：真实渲染器串常写作 "Arc(TM) A770"、"Iris(R) Xe"，去掉商标括号再匹配 */
    var s = String(renderer).toLowerCase()
        .replace(/\(tm\)/g, " ")
        .replace(/\(r\)/g, " ")
        .replace(/\s+/g, " ");
    /* 先按关键词长度降序排好候选 */
    var cands = [];
    for (var i = 0; i < GPUS.length; i++) {
        var g = GPUS[i];
        for (var j = 0; j < g.kw.length; j++) {
            cands.push({gpu: g, kw: g.kw[j]});
        }
    }
    cands.sort(function (a, b) { return b.kw.length - a.kw.length; });
    for (var k = 0; k < cands.length; k++) {
        if (s.indexOf(cands[k].kw) !== -1) return cands[k].gpu;
    }
    return null;
}

/* ================= 6. 渲染辅助 ================= */

function escHtml(s) {
    return String(s === null || s === undefined ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function tierBadge(tier) {
    return '<span class="lhw-badge lhw-' + tier.code + '">' + escHtml(tier.name) + '</span>';
}

/* 单模型卡片 */
function renderModelCard(item) {
    var m = item.model, t = item.tier;
    var html = "";
    html += '<div class="lhw-card lhw-tier-' + t.code + '">';
    html += '<div class="lhw-card-head"><span class="lhw-quant">' + escHtml(m.quant) + '</span>' + tierBadge(t) + '</div>';
    html += '<div class="lhw-need">约需 <b>' + m.vram + ' GB</b> 显存</div>';
    html += '<div class="lhw-tps">约 ' + m.tps[0] + '–' + m.tps[1] + ' tokens/s</div>';
    html += '<div class="lhw-tier-desc">' + escHtml(t.desc) + '</div>';
    html += '</div>';
    return html;
}

var api = {
    GPUS: GPUS,
    MODELS: MODELS,
    BRAND_LABELS: BRAND_LABELS,
    BRAND_ORDER: BRAND_ORDER,
    VRAM_STEPS: VRAM_STEPS,
    SIZE_ORDER: SIZE_ORDER,
    APPLE_UNIFIED_FACTOR: APPLE_UNIFIED_FACTOR,
    tierFor: tierFor,
    effectiveVram: effectiveVram,
    getGpu: getGpu,
    recommendModels: recommendModels,
    requiredFor: requiredFor,
    suggestGpus: suggestGpus,
    parseRendererString: parseRendererString,
    escHtml: escHtml,
    tierBadge: tierBadge,
    renderModelCard: renderModelCard
};

if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
} else if (typeof window !== "undefined") {
    window.LlmHwChecker = api;
}

/* ================= 7. 浏览器 DOM 装配 ================= */

if (typeof document !== "undefined" && typeof window !== "undefined") {
(function () {
var L = (typeof window.LlmHwChecker !== "undefined") ? window.LlmHwChecker : api;

function $(id) { return document.getElementById(id); }

function optEl(value, text) {
    var o = document.createElement("option");
    o.value = value;
    o.textContent = text;
    return o;
}

/* ---- WebGL 检测（只读本地渲染器字符串，不上传） ---- */
function detectWebGL() {
    try {
        var canvas = document.createElement("canvas");
        var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        if (!gl) return {ok: false, reason: "no-context", renderer: ""};
        var dbg = null;
        try { dbg = gl.getExtension("WEBGL_debug_renderer_info"); } catch (e) { dbg = null; }
        if (!dbg) {
            var masked = "";
            try { masked = gl.getParameter(gl.RENDERER) || ""; } catch (e2) { masked = ""; }
            return {ok: true, masked: true, reason: "masked", renderer: String(masked)};
        }
        var renderer = "";
        try { renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || ""; } catch (e3) { renderer = ""; }
        return {ok: true, masked: false, reason: "ok", renderer: String(renderer)};
    } catch (e) {
        return {ok: false, reason: "error", renderer: ""};
    }
}

/* ---- 状态读取 ---- */
function currentGpu() {
    var brandSel = $("lhw-brand"), modelSel = $("lhw-model");
    if (!brandSel || !modelSel) return null;
    var mid = modelSel.value;
    if (!mid) return null;
    return L.getGpu(mid);
}

function currentVram() {
    var vramSel = $("lhw-vram");
    if (!vramSel) return 0;
    if (vramSel.value === "unknown" || vramSel.value === "") return 0;
    var v = parseFloat(vramSel.value);
    return isNaN(v) ? 0 : v;
}

function currentTierFilter() {
    var tab = document.querySelector(".lhw-tab.active");
    return tab ? tab.getAttribute("data-tier") : "all";
}

/* ---- 检测区 ---- */
function renderDetect() {
    var box = $("lhw-detect-status");
    if (!box) return;
    var r = detectWebGL();
    var html = "";
    if (!r.ok) {
        html = '<i class="material-icons">warning</i><div><b>未检测到 GPU 信息</b>（' +
            (r.reason === "no-context" ? "当前浏览器未提供 WebGL 上下文" : "检测过程出错") +
            "）。请在下方手动选择显卡型号与显存，评估不受影响。</div>";
        box.className = "lhw-detect lhw-detect-warn";
    } else if (r.masked || !r.renderer) {
        html = '<i class="material-icons">visibility_off</i><div><b>检测到 WebGL，但显卡型号被浏览器屏蔽</b>（隐私模式/企业策略常见）。' +
            '请在下方手动选择显卡型号与显存。</div>';
        box.className = "lhw-detect lhw-detect-warn";
    } else {
        var gpu = L.parseRendererString(r.renderer);
        if (gpu) {
            html = '<i class="material-icons">check_circle</i><div><b>检测到显卡：' + L.escHtml(gpu.name) + '</b>' +
                '<br><span class="lhw-renderer-raw">原始信息：' + L.escHtml(r.renderer) + '</span>' +
                '<br>已自动填入下方手选区（显存请按实际档位确认，WebGL 读不到显存容量）。</div>';
            box.className = "lhw-detect lhw-detect-ok";
            applyDetectedGpu(gpu);
        } else {
            html = '<i class="material-icons">help_outline</i><div><b>检测到渲染器，但未能识别具体型号</b>' +
                '<br><span class="lhw-renderer-raw">原始信息：' + L.escHtml(r.renderer) + '</span>' +
                '<br>请在下方手动选择最接近的型号，或直接按显存估算。</div>';
            box.className = "lhw-detect lhw-detect-warn";
        }
    }
    box.innerHTML = html;
}

function applyDetectedGpu(gpu) {
    var brandSel = $("lhw-brand"), modelSel = $("lhw-model");
    if (!brandSel || !modelSel || !gpu) return;
    brandSel.value = gpu.brand;
    fillModelSelect(gpu.brand, gpu.id);
    renderAll();
}

/* ---- 手选区 ---- */
function fillBrandSelect() {
    var brandSel = $("lhw-brand");
    if (!brandSel) return;
    brandSel.innerHTML = "";
    brandSel.appendChild(optEl("", "不选型号，直接按显存估算"));
    for (var i = 0; i < L.BRAND_ORDER.length; i++) {
        var b = L.BRAND_ORDER[i];
        brandSel.appendChild(optEl(b, L.BRAND_LABELS[b]));
    }
}

function fillModelSelect(brand, selectedId) {
    var modelSel = $("lhw-model");
    if (!modelSel) return;
    modelSel.innerHTML = "";
    if (!brand) {
        modelSel.appendChild(optEl("", "请先选择品牌（或直接按显存估算）"));
        modelSel.disabled = true;
        return;
    }
    modelSel.disabled = false;
    modelSel.appendChild(optEl("", "请选择显卡型号"));
    for (var i = 0; i < L.GPUS.length; i++) {
        var g = L.GPUS[i];
        if (g.brand !== brand) continue;
        modelSel.appendChild(optEl(g.id, g.name));
    }
    if (selectedId) modelSel.value = selectedId;
}

function fillVramSelect(gpu, keepValue) {
    var vramSel = $("lhw-vram");
    if (!vramSel) return;
    var prev = keepValue ? vramSel.value : "";
    vramSel.innerHTML = "";
    vramSel.appendChild(optEl("", "请选择显存"));
    var steps = (gpu && gpu.vram && gpu.vram.length) ? gpu.vram : L.VRAM_STEPS;
    for (var i = 0; i < steps.length; i++) {
        vramSel.appendChild(optEl(String(steps[i]), steps[i] + " GB" +
            (gpu && gpu.unified ? "（统一内存）" : "")));
    }
    vramSel.appendChild(optEl("unknown", "不确定 / 不清楚"));
    /* 选型号自动预填显存：默认首位档位 */
    if (gpu && gpu.vram && gpu.vram.length) {
        vramSel.value = String(gpu.vram[0]);
    } else if (prev) {
        vramSel.value = prev;
    }
}

function renderEffective() {
    var bar = $("lhw-effective");
    if (!bar) return;
    var gpu = currentGpu();
    var vram = currentVram();
    var vramSel = $("lhw-vram");
    if (!vramSel || vramSel.value === "" ) {
        bar.innerHTML = '<i class="material-icons">tune</i><div>选择显存后，这里会显示用于评估的<b>可用显存</b>，并输出推荐结果。</div>';
        bar.className = "lhw-effective";
        toggleNotes(null);
        return;
    }
    if (vramSel.value === "unknown") {
        bar.innerHTML = '<i class="material-icons">help_outline</i><div><b>显存不确定？</b>Windows 可在「任务管理器 → 性能 → GPU」查看「专用 GPU 内存」；' +
            'macOS 点击左上角  → 关于本机查看统一内存；Linux 跑 <code>nvidia-smi</code> 看显存。确认后再评估更准确。</div>';
        bar.className = "lhw-effective lhw-effective-warn";
        toggleNotes(null);
        return;
    }
    var eff = L.effectiveVram(gpu, vram);
    var html = '<i class="material-icons">memory</i><div>当前评估显存：<b>' + eff + ' GB</b>';
    if (gpu && gpu.unified) {
        html += '（' + L.escHtml(gpu.name) + ' 统一内存 ' + vram + ' GB × 70% 折算，系统与其它应用会占用一部分）';
    } else if (gpu) {
        html += '（' + L.escHtml(gpu.name) + '）';
    } else {
        html += '（手动指定）';
    }
    html += '</div>';
    bar.innerHTML = html;
    bar.className = "lhw-effective lhw-effective-ok";
    toggleNotes(gpu);
}

function toggleNotes(gpu) {
    var a = $("lhw-apple-note"), g = $("lhw-igpu-note");
    if (a) a.style.display = (gpu && gpu.unified) ? "flex" : "none";
    if (g) g.style.display = (gpu && gpu.brand === "igpu") ? "flex" : "none";
}

/* ---- 推荐结果 ---- */
function renderResults() {
    var grid = $("lhw-grid"), count = $("lhw-count");
    if (!grid) return;
    var gpu = currentGpu();
    var vram = currentVram();
    var vramSel = $("lhw-vram");
    if (!vramSel || vramSel.value === "" || vramSel.value === "unknown" || vram <= 0) {
        grid.innerHTML = '<div class="lhw-empty">先在上方选择显卡型号与显存（或直接选显存档位），这里会列出 7B / 14B / 32B / 70B / MoE 各量化版本的可跑情况。</div>';
        if (count) count.textContent = "";
        return;
    }
    var eff = L.effectiveVram(gpu, vram);
    var filter = currentTierFilter();
    var list = L.recommendModels(eff);
    var html = "", shown = 0, green = 0;
    var lastSize = "";
    for (var i = 0; i < list.length; i++) {
        var item = list[i];
        if (item.tier.code === "green") green++;
        if (filter !== "all" && item.tier.code !== filter) continue;
        if (item.model.size !== lastSize) {
            lastSize = item.model.size;
            html += '<div class="lhw-size-title">' + L.escHtml(item.model.sizeLabel) + '</div>';
        }
        html += L.renderModelCard(item);
        shown++;
    }
    if (shown === 0) {
        html = '<div class="lhw-empty">当前筛选下没有结果，换个档位看看。</div>';
    }
    grid.innerHTML = html;
    if (count) {
        count.textContent = "可用显存 " + eff + " GB：共 " + list.length + " 个模型档位，其中「流畅运行」" + green + " 个" +
            (filter !== "all" ? "（当前筛选：" + filterName(filter) + "，显示 " + shown + " 个）" : "");
    }
}

function filterName(f) {
    return f === "green" ? "流畅运行" : (f === "yellow" ? "能跑但慢" : "带不动");
}

/* ---- 反向查询 ---- */
function fillReverseSelect() {
    var sel = $("lhw-rev-model");
    if (!sel) return;
    sel.innerHTML = "";
    var lastSize = "";
    for (var i = 0; i < L.MODELS.length; i++) {
        var m = L.MODELS[i];
        if (m.size !== lastSize) {
            lastSize = m.size;
            var grp = document.createElement("optgroup");
            grp.label = m.sizeLabel;
            sel.appendChild(grp);
        }
        var o = optEl(m.id, m.size + " " + m.quant + "（约需 " + m.vram + " GB）");
        sel.appendChild(o);
    }
    sel.value = "70b-q4_k_m";
}

function renderReverse() {
    var box = $("lhw-rev-result"), sel = $("lhw-rev-model");
    if (!box || !sel) return;
    var mid = sel.value, m = null;
    for (var i = 0; i < L.MODELS.length; i++) {
        if (L.MODELS[i].id === mid) { m = L.MODELS[i]; break; }
    }
    if (!m) {
        box.innerHTML = '<div class="lhw-empty">请选择目标模型。</div>';
        return;
    }
    var need = m.vram;
    var minEff = Math.ceil(need / 0.85 * 10) / 10;
    var list = L.suggestGpus(need);
    var html = '<div class="lhw-rev-head"><i class="material-icons">shopping_cart</i><div>目标 <b>' +
        L.escHtml(m.size + " " + m.quant) + '</b>：估算需要约 <b>' + need + ' GB</b> 显存' +
        '（含常规上下文预留）；想要<b>流畅运行</b>，建议可用显存 ≥ <b>' + minEff + ' GB</b>。</div></div>';
    if (list.length === 0) {
        html += '<div class="lhw-empty">单卡/单机满足流畅运行的选项很少，可考虑多卡、工作站显卡或大统一内存 Mac。</div>';
    } else {
        html += '<div class="lhw-rev-list-title">满足流畅运行的显卡参考（' + list.length + ' 款档位）：</div>';
        html += '<div class="lhw-rev-list">';
        var shownBrands = {};
        for (var j = 0; j < list.length; j++) {
            var it = list[j];
            var label = it.vram + " GB" + (it.gpu.unified ? " 统一内存" : "");
            html += '<span class="lhw-rev-chip">' + L.escHtml(it.gpu.name) + ' · ' + L.escHtml(label) + '</span>';
            shownBrands[it.gpu.brand] = true;
        }
        html += '</div>';
        html += '<div class="lhw-rev-note">桌面级单卡最高 32GB（RTX 5090）；70B 高量化版本通常需要多卡、工作站显卡或 96GB+ 统一内存的 Mac。</div>';
    }
    box.innerHTML = html;
}

function renderAll() {
    renderEffective();
    renderResults();
}

function init() {
    fillBrandSelect();
    fillModelSelect("", "");
    fillVramSelect(null, false);
    fillReverseSelect();

    var brandSel = $("lhw-brand"), modelSel = $("lhw-model"), vramSel = $("lhw-vram");
    if (brandSel) {
        brandSel.addEventListener("change", function () {
            fillModelSelect(brandSel.value, "");
            fillVramSelect(null, false);
            renderAll();
        });
    }
    if (modelSel) {
        modelSel.addEventListener("change", function () {
            var gpu = currentGpu();
            fillVramSelect(gpu, false);
            renderAll();
        });
    }
    if (vramSel) {
        vramSel.addEventListener("change", renderAll);
    }

    var tabs = document.querySelectorAll(".lhw-tab");
    for (var i = 0; i < tabs.length; i++) {
        (function (tab) {
            tab.addEventListener("click", function () {
                for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove("active");
                tab.classList.add("active");
                renderResults();
            });
        })(tabs[i]);
    }

    var redetect = $("lhw-redetect");
    if (redetect) {
        redetect.addEventListener("click", renderDetect);
    }

    var revSel = $("lhw-rev-model");
    if (revSel) {
        revSel.addEventListener("change", renderReverse);
    }

    /* 页面加载即自动检测一次 */
    renderDetect();
    renderAll();
    renderReverse();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

})();
}

})();
