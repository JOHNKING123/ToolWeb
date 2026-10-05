(function () {
'use strict';

// 静态价格表：公开标价快照（USD / 1M tokens），仅供估算
var MODELS = [
{ id: 'gpt-4o', name: 'GPT-4o', vendor: 'OpenAI', family: 'openai', ctx: 128000, inPrice: 2.5, outPrice: 10},
{ id: 'gpt-4o-mini', name: 'GPT-4o mini', vendor: 'OpenAI', family: 'openai', ctx: 128000, inPrice: 0.15, outPrice: 0.6},
{ id: 'gpt-4.1', name: 'GPT-4.1', vendor: 'OpenAI', family: 'openai', ctx: 1047576, inPrice: 2.0, outPrice: 8.0},
{ id: 'gpt-4-turbo', name: 'GPT-4 Turbo', vendor: 'OpenAI', family: 'openai', ctx: 128000, inPrice: 10, outPrice: 30},
{ id: 'o3', name: 'o3', vendor: 'OpenAI', family: 'openai', ctx: 200000, inPrice: 2.0, outPrice: 8.0},
{ id: 'claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', vendor: 'Anthropic', family: 'claude', ctx: 200000, inPrice: 3, outPrice: 15},
{ id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', vendor: 'Anthropic', family: 'claude', ctx: 200000, inPrice: 3, outPrice: 15},
{ id: 'claude-3-opus', name: 'Claude 3 Opus', vendor: 'Anthropic', family: 'claude', ctx: 200000, inPrice: 15, outPrice: 75},
{ id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', vendor: 'Google', family: 'gemini', ctx: 1048576, inPrice: 1.25, outPrice: 10},
{ id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', vendor: 'Google', family: 'gemini', ctx: 1048576, inPrice: 0.1, outPrice: 0.4},
{ id: 'deepseek-v3', name: 'DeepSeek-V3', vendor: 'DeepSeek', family: 'deepseek', ctx: 128000, inPrice: 0.27, outPrice: 1.1},
{ id: 'deepseek-r1', name: 'DeepSeek-R1', vendor: 'DeepSeek', family: 'deepseek', ctx: 128000, inPrice: 0.55, outPrice: 2.19},
{ id: 'qwen2.5', name: '通义千问 Qwen2.5', vendor: '阿里云', family: 'qwen', ctx: 131072, inPrice: 0.4, outPrice: 1.2}
];
// 各家族相对 OpenAI 分词的字符比系数（估算用）
var FAMILY_FACTOR = { openai: 1, claude: 1.02, gemini: 0.95, deepseek: 1.05, qwen: 0.9};
var COMPARE_IDS = ['gpt-4o', 'claude-3.7-sonnet', 'gemini-2.5-pro', 'deepseek-v3'];
var MAX_FILE_SIZE = 2 * 1024 * 1024;
var ALLOWED_EXT = ['txt', 'md', 'json', 'log'];

var SAMPLE = '你是一名资深的产品助理，请帮我把下面这段需求整理成一份简洁的执行摘要。\n\n' +
'Background: Our team is building an online toolbox for developers. The new AI Token Counter should estimate prompt tokens, context window usage and API cost before sending a request.\n\n' +
'要求：1) 输出控制在 300 字以内；2) 用中文回答，关键术语保留英文；3) 最后给出一句风险提示。\n' +
'Please think step by step, then give the final summary. 记住：token 预算上限是 128K，费用越低越好。';

// ---- 轻量 BPE 风格分段计数（OpenAI 系近似） ----
function countOpenAI(text) {
if (!text) return 0;
var re = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]|[A-Za-z]+(?:'[A-Za-z]+)?|\d+(?:[.,]\d+)*|[^\sA-Za-z\d\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
var m, tokens = 0;
while ((m = re.exec(text))!== null) {
var seg = m[0];
if (/^[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]$/.test(seg)) {
tokens += 1; // 中文约 1 字 ≈ 1 token 量级
} else if (/^[A-Za-z]/.test(seg)) {
tokens += Math.max(1, Math.ceil(seg.length / 4)); // 英文子词分段
} else if (/^\d/.test(seg)) {
tokens += Math.max(1, Math.ceil(seg.replace(/[.,]/g, '').length / 3)); // 数字按约 3 位一段
} else {
tokens += 1; // 标点/符号
}
}
// 空白与换行在 BPE 中通常并入相邻 token，仅按行数微调
return tokens;
}

function countTokens(text, model) {
var base = countOpenAI(text);
var factor = FAMILY_FACTOR[model.family] || 1;
return Math.round(base * factor);
}

function fmt(n) { return n.toLocaleString('en-US');}
function fmtCost(v) {
if (v === 0) return '$0';
if (v < 0.0001) return '$' + v.toFixed(6);
if (v < 0.01) return '$' + v.toFixed(5);
return '$' + v.toFixed(4);
}
function fmtCtx(ctx) {
if (ctx >= 1000000) return (ctx / 1048576 >= 1 && ctx % 1048576 === 0)? '1M': Math.round(ctx / 1000) + 'K';
return Math.round(ctx / 1000) + 'K';
}

var els = {};
['atc-input', 'atc-model', 'atc-chars', 'atc-words', 'atc-lines', 'atc-tokens', 'atc-est-tag',
'atc-bar', 'atc-bar-text', 'atc-remain', 'atc-out-tokens', 'atc-in-cost', 'atc-out-cost',
'atc-total-cost', 'atc-model-info', 'atc-density', 'atc-msg', 'atc-file', 'atc-compare-body'
].forEach(function (id) { els[id] = document.getElementById(id);});

MODELS.forEach(function (m) {
var opt = document.createElement('option');
opt.value = m.id;
opt.textContent = m.vendor + ' · ' + m.name;
els['atc-model'].appendChild(opt);
});

function currentModel() {
for (var i = 0; i < MODELS.length; i++) if (MODELS[i].id === els['atc-model'].value) return MODELS[i];
return MODELS[0];
}

function showMsg(text, isError) {
els['atc-msg'].textContent = text || '';
els['atc-msg'].style.display = text? 'block': 'none';
els['atc-msg'].className = isError? 'atc-error': 'atc-ok';
}

var lastSummary = '';

function update() {
var text = els['atc-input'].value;
var model = currentModel();
var chars = text.length;
var words = 0;
if (text.trim()) {
var cjk = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
var enWords = (text.replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g, ' ').match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g) || []).length;
words = cjk + enWords;
}
var lines = text? text.split(/\r\n|\r|\n/).length: 0;
var tokens = countTokens(text, model);
var outTokens = parseInt(els['atc-out-tokens'].value, 10);
if (isNaN(outTokens) || outTokens < 0) outTokens = 0;

els['atc-chars'].textContent = fmt(chars);
els['atc-words'].textContent = fmt(words);
els['atc-lines'].textContent = fmt(lines);
els['atc-tokens'].textContent = fmt(tokens);

var isEstimate = model.family!== 'openai';
els['atc-est-tag'].style.display = isEstimate? 'inline-block': 'none';
els['atc-model-info'].textContent = model.vendor + ' ' + model.name + '：上下文窗 ' + fmtCtx(model.ctx) +
'（' + fmt(model.ctx) + ' tokens），输入 $' + model.inPrice + ' / 输出 $' + model.outPrice + '（每 1M tokens）' +
(isEstimate? '；该家族未公开 tokenizer，结果为字符比系数估算': '；BPE 风格分段计数，接近官方量级');

// 上下文窗占用条
var pct = model.ctx? (tokens / model.ctx) * 100: 0;
var barPct = Math.min(100, pct);
els['atc-bar'].style.width = barPct + '%';
var cls = 'ok', note = '';
if (pct > 100) { cls = 'over'; note = '已超出上下文窗！请删减输入或更换更大窗口的模型。';}
else if (pct >= 80) { cls = 'warn'; note = '接近上下文窗上限，注意预留输出空间。';}
els['atc-bar'].className = 'atc-bar-fill ' + cls;
els['atc-bar-text'].textContent = '占用 ' + pct.toFixed(2) + '%（' + fmt(tokens) + ' / ' + fmt(model.ctx) + '）' + (note? ' — ' + note: '');
var remain = model.ctx - tokens;
els['atc-remain'].textContent = remain > 0? '约可再输入 ' + fmt(remain) + ' tokens': '已超出 ' + fmt(-remain) + ' tokens';

// 费用
var inCost = tokens / 1e6 * model.inPrice;
var outCost = outTokens / 1e6 * model.outPrice;
els['atc-in-cost'].textContent = fmtCost(inCost);
els['atc-out-cost'].textContent = fmtCost(outCost);
els['atc-total-cost'].textContent = fmtCost(inCost + outCost);

// 中文 token 密度提示
var cjkCount = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
if (chars > 0 && cjkCount > 0) {
els['atc-density'].textContent = '中文字符 ' + fmt(cjkCount) + ' 个（占 ' + (cjkCount / chars * 100).toFixed(1) +
'%）：中文约 1 字 ≈ 1 token 量级，密度高于英文（约 4 字符/token），混排文本请以计数结果为准。';
els['atc-density'].style.display = 'block';
} else {
els['atc-density'].style.display = 'none';
}

// 多模型比价
var html = '';
COMPARE_IDS.forEach(function (id) {
var m = MODELS.filter(function (x) { return x.id === id;})[0];
var t = countTokens(text, m);
var total = t / 1e6 * m.inPrice + outTokens / 1e6 * m.outPrice;
html += '<tr' + (m.id === model.id? ' class="atc-cur"': '') + '><td>' + m.name + '</td><td>' + fmt(t) + '</td><td>' + fmtCost(total) + '</td></tr>';
});
els['atc-compare-body'].innerHTML = html;

lastSummary = '\n模型：' + model.vendor + ' ' + model.name + (isEstimate? '（估算）': '') +
'\nToken 数：' + fmt(tokens) + '\n字符数：' + fmt(chars) + '，单词/字数：' + fmt(words) + '，行数：' + fmt(lines) +
'\n上下文窗：' + fmt(model.ctx) + '，占用 ' + pct.toFixed(2) + '%' +
'\n输入成本：' + fmtCost(inCost) + '，预计输出 ' + fmt(outTokens) + ' tokens 成本：' + fmtCost(outCost) + '，总成本：' + fmtCost(inCost + outCost);
}

var timer = null;
function schedule() { clearTimeout(timer); timer = setTimeout(update, 150);}
els['atc-input'].addEventListener('input', schedule);
els['atc-model'].addEventListener('change', update);
els['atc-out-tokens'].addEventListener('input', schedule);

document.getElementById('atc-sample').addEventListener('click', function () {
els['atc-input'].value = SAMPLE; showMsg(''); update(); els['atc-input'].focus();
});
document.getElementById('atc-clear').addEventListener('click', function () {
els['atc-input'].value = ''; showMsg(''); update(); els['atc-input'].focus();
});
document.getElementById('atc-copy').addEventListener('click', function () {
if (!lastSummary) update();
function done() { showMsg('统计摘要已复制到剪贴板');}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(lastSummary).then(done, function () { fallback();});
} else fallback();
function fallback() {
var ta = document.createElement('textarea');
ta.value = lastSummary; document.body.appendChild(ta); ta.select();
try { document.execCommand('copy'); done();} catch (e) { showMsg('复制失败，请手动复制统计信息', true);}
document.body.removeChild(ta);
}
});

// ---- 文件读取（本地 FileReader，不上传） ----
function readFile(file) {
if (!file) return;
var ext = (file.name.split('.').pop() || '').toLowerCase();
if (ALLOWED_EXT.indexOf(ext) === -1) { showMsg('不支持的文件类型：仅支持.txt /.md /.json /.log 文件', true); return;}
if (file.size > MAX_FILE_SIZE) { showMsg('文件过大（' + (file.size / 1024 / 1024).toFixed(2) + ' MB），上限 2 MB，请删减后重试', true); return;}
var reader = new FileReader();
reader.onload = function () {
els['atc-input'].value = String(reader.result || '');
showMsg('已读取文件「' + file.name + '」（本地读取，未上传）');
update();
};
reader.onerror = function () { showMsg('文件读取失败，请重试', true);};
reader.readAsText(file);
}
els['atc-file'].addEventListener('change', function () { readFile(this.files[0]); this.value = '';});
var drop = document.getElementById('atc-drop');
['dragenter', 'dragover'].forEach(function (ev) {
drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('atc-dragover');});
});
['dragleave', 'drop'].forEach(function (ev) {
drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('atc-dragover');});
});
drop.addEventListener('drop', function (e) {
var files = e.dataTransfer && e.dataTransfer.files;
if (files && files.length) readFile(files[0]);
});

update();
})();
