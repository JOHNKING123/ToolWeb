/* Markdown 聊天图文转换器（md2chat）- 纯前端引擎
* 功能：把 Markdown / AI 回答智能拆分为「文字块」与「复杂块」（表格/代码块/数学公式/mermaid 流程图）
* - 文字块：按 微信 / 钉钉 / 飞书 / 企微 四平台语法适配，输出纯文本与富文本，一键复制（clipboard API + execCommand 双路径兜底）
* - 复杂块：canvas 本地渲染为图片卡片（可复制图片 / 下载 PNG），分辨率与配色可选
* 纯前端、零依赖、零 CDN、零上传：内容不出浏览器。Network 面板可验证（除页面自身静态资源外无任何请求）。
* 纯函数全部经 module.exports 暴露，node tests/md_to_chat.test.js 自测；浏览器内 init 挂 DOMContentLoaded。
*/
(function () {
'use strict';

/* ================= 基础工具（纯函数） ================= */

function escapeHtml(s) {
return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
.replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* 链接 URL 协议过滤：拦截 javascript:/vbscript:/data:(非图片) 等危险协议 */
function sanitizeUrl(u) {
var s = String(u).trim();
if (/^[\s\u0000-\u001f]*javascript:/i.test(s)) return '#';
if (/^[\s\u0000-\u001f]*vbscript:/i.test(s)) return '#';
if (/^[\s\u0000-\u001f]*data:/i.test(s) &&!/^data:image\//i.test(s)) return '#';
return s;
}

function trim(s) { return String(s).replace(/^\s+|\s+$/g, '');}

/* ================= 块级解析（纯函数） =================
* parseBlocks 返回块数组，块形如：
* {kind:'text', nodes:[...]} 文字块
* {kind:'table', header:[], aligns:[], rows:[[]]} 表格
* {kind:'code', lang:'', code:''} 代码块（含 mermaid 之外的围栏代码）
* {kind:'formula', tex:'', display:true} 数学公式（$$ 块级）
* {kind:'mermaid', code:''} mermaid 流程图（```mermaid）
* 文字节点：{t:'h',level,text} {t:'p',text} {t:'ul',items:[{text,sub:[]}]} {t:'ol',items,start}
* {t:'q',lines:[]} {t:'hr'}
*/

function isFence(l) { return /^\s*(`{3,}|~{3,})/.test(l);}
function fenceInfo(l) {
var m = /^\s*(`{3,}|~{3,})\s*([^\s`~]*)/.exec(l);
return m? { mark: m[1][0], len: m[1].length, lang: (m[2] || '').toLowerCase()}: null;
}
function isTableSep(l) {
var t = trim(l);
if (t.indexOf('|') < 0) return false;
return /^\|?[\s:|\-]+\|?$/.test(t) && /-/.test(t);
}
function looksLikeTableRow(l) { return l.indexOf('|') >= 0;}

/* 表格单元格拆分：支持 \| 转义 */
function splitCells(row) {
var t = trim(String(row));
if (t.charAt(0) === '|') t = t.slice(1);
if (t.charAt(t.length - 1) === '|') t = t.slice(0, -1);
var cells = [], cur = '', esc = false;
for (var i = 0; i < t.length; i++) {
var ch = t[i];
if (esc) { cur += ch; esc = false;}
else if (ch === '\\') { esc = true;}
else if (ch === '|') { cells.push(trim(cur)); cur = '';}
else { cur += ch;}
}
cells.push(trim(cur));
return cells;
}

function parseBlocks(src) {
var lines = String(src == null? '': src).replace(/\r\n?/g, '\n').split('\n');
var blocks = [], i = 0, n = lines.length;
var textBuf = [];
function flushText() {
if (textBuf.some(function (l) { return !/^\s*$/.test(l); })) { blocks.push({ kind: 'text', nodes: parseTextNodes(textBuf)});}
textBuf = [];
}
while (i < n) {
var line = lines[i];
/* 1) 围栏代码块 */
var f = fenceInfo(line);
if (f) {
var buf = [], j = i + 1, closed = false;
var closeRe = new RegExp('^\\s*' + (f.mark === '`'? '`': '~') + '{' + f.len + ',}\\s*$');
while (j < n) {
if (closeRe.test(lines[j])) { closed = true; j++; break;}
buf.push(lines[j]); j++;
}
flushText();
var code = buf.join('\n');
if (f.lang === 'mermaid') blocks.push({ kind: 'mermaid', code: code});
else blocks.push({ kind: 'code', lang: f.lang, code: code, unclosed:!closed});
i = j; continue;
}
/* 2) $$ 独立行块级公式 */
if (/^\s*\$\$\s*$/.test(line)) {
var fb = [], k = i + 1, fclosed = false;
while (k < n) {
if (/^\s*\$\$\s*$/.test(lines[k])) { fclosed = true; k++; break;}
fb.push(lines[k]); k++;
}
flushText();
blocks.push({ kind: 'formula', tex: trim(fb.join('\n')), display: true, unclosed:!fclosed});
i = k; continue;
}
/* 3) 单行 $$...$$ 块级公式 */
var sm = /^\s*\$\$(.+)\$\$\s*$/.exec(line);
if (sm) { flushText(); blocks.push({ kind: 'formula', tex: trim(sm[1]), display: true}); i++; continue;}
/* 4) 表格：表头行 + 分隔行 + 数据行 */
if (looksLikeTableRow(line) && i + 1 < n && isTableSep(lines[i + 1])) {
var header = splitCells(line);
var seps = splitCells(lines[i + 1]);
var aligns = seps.map(function (c) {
var t = trim(c);
var l = t.charAt(0) === ':', r = t.charAt(t.length - 1) === ':';
return l && r? 'c': r? 'r': 'l';
});
var rows = [], p = i + 2;
while (p < n && looksLikeTableRow(lines[p]) && trim(lines[p])!== '') { rows.push(splitCells(lines[p])); p++;}
flushText();
blocks.push({ kind: 'table', header: header, aligns: aligns, rows: rows});
i = p; continue;
}
textBuf.push(line); i++;
}
flushText();
return blocks;
}

/* 文字块内部节点解析 */
function parseTextNodes(lines) {
var nodes = [], i = 0, n = lines.length;
function isBlank(l) { return /^\s*$/.test(l);}
while (i < n) {
var line = lines[i];
if (isBlank(line)) { i++; continue;}
var hm = /^(#{1,6})\s+(.*)$/.exec(line);
if (hm) { nodes.push({ t: 'h', level: hm[1].length, text: trim(hm[2]).replace(/\s+#+\s*$/, '')}); i++; continue;}
if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { nodes.push({ t: 'hr'}); i++; continue;}
/* 引用块 */
if (/^\s*>/.test(line)) {
var ql = [];
while (i < n && /^\s*>/.test(lines[i])) { ql.push(trim(lines[i].replace(/^\s*>\s?/, ''))); i++;}
nodes.push({ t: 'q', lines: ql}); continue;
}
/* 列表（支持一级缩进嵌套） */
var lm = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
if (lm) {
var items = [], start = null, ordered = /\d/.test(lm[2]);
if (ordered) start = parseInt(lm[2], 10) || 1;
var baseIndent = lm[1].length;
while (i < n) {
var m2 = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
if (!m2) break;
if (m2[1].length > baseIndent + 1) {
/* 嵌套子项：挂到上一项 */
if (items.length) {
var parent = items[items.length - 1];
parent.sub = parent.sub || [];
parent.sub.push({ text: trim(m2[3]), sub: []});
}
i++; continue;
}
if (m2[1].length < baseIndent) break;
items.push({ text: trim(m2[3]), sub: []}); i++;
}
nodes.push({ t: ordered? 'ol': 'ul', items: items, start: start}); continue;
}
/* 段落：连续非空非特殊行合并 */
var pl = [trim(line)]; i++;
while (i < n &&!isBlank(lines[i]) &&!/^(#{1,6})\s+/.test(lines[i]) &&
!/^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i]) &&!/^\s*>/.test(lines[i]) &&
!/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i])) { pl.push(trim(lines[i])); i++;}
nodes.push({ t: 'p', text: pl.join(' ')});
}
return nodes;
}

/* ================= 行内渲染（纯函数） ================= */

var MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,"Courier New",monospace';
var SANS = '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif';

function renderInline(src) {
/* 1) 抽出行内代码与行内公式，用占位符保护 */
var codes = [], maths = [];
var s = String(src).replace(/`([^`\n]+)`/g, function (mm, c) { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000';});
s = s.replace(/\$([^$\n]+)\$/g, function (mm, c) { maths.push(c); return '\u0001' + (maths.length - 1) + '\u0001';});
/* 2) 全量转义防 XSS */
s = escapeHtml(s);
/* 3) 图片 */
s = s.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\s*\)/g, function (mm, alt, url) {
return '<img src="' + escapeHtml(sanitizeUrl(url)) + '" alt="' + escapeHtml(alt) + '"' +
' style="max-width:100%;height:auto;border-radius:6px;vertical-align:middle;">';
});
/* 4) 链接 */
s = s.replace(/\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\s*\)/g, function (mm, text, url) {
url = sanitizeUrl(url);
return '<a href="' + escapeHtml(url) + '" target="_blank" style="color:#2563eb;text-decoration:underline;word-break:break-all;">' + text + '</a>';
});
/* 5) 自动链接 */
s = s.replace(/&lt;((?:https?|ftp):[^<>\s]+)&gt;/g, function (mm, url) {
url = sanitizeUrl(url);
return '<a href="' + escapeHtml(url) + '" target="_blank" style="color:#2563eb;text-decoration:underline;word-break:break-all;">' + escapeHtml(url) + '</a>';
});
/* 6) 删除线 */
s = s.replace(/~~([^~]+)~~/g, '<del style="color:#9ca3af;">$1</del>');
/* 7) 加粗 */
s = s.replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight:700;">$1</strong>');
s = s.replace(/__([^_]+)__/g, '<strong style="font-weight:700;">$1</strong>');
/* 8) 斜体（仅 * 形态） */
s = s.replace(/\*([^*]+)\*/g, '<em style="font-style:italic;">$1</em>');
/* 9) 还原行内公式：转义后包 span（简化渲染见 prettifyMath） */
s = s.replace(/\u0001(\d+)\u0001/g, function (mm, idx) {
return '<span style="font-family:' + MONO + ';background:#f3f4f6;padding:.1em.45em;border-radius:4px;">' +
escapeHtml(prettifyMath(maths[+idx])) + '</span>';
});
/* 10) 还原行内代码 */
s = s.replace(/\u0000(\d+)\u0000/g, function (mm, idx) {
return '<code style="font-family:' + MONO + ';font-size:.88em;background:#fef2f2;color:#c7254e;' +
'padding:.15em.4em;border-radius:4px;word-break:break-all;">' + escapeHtml(codes[+idx]) + '</code>';
});
return s;
}

/* ================= 数学公式简化渲染（纯函数） =================
* 把常见 LaTeX 命令映射为 Unicode 近似显示（聊天图片卡片可读性优先，非精确排版）。
*/
var MATH_MAP = {
alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ',
sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
times: '×', div: '÷', cdot: '·', pm: '±', mp: '∓', leq: '≤', geq: '≥', neq: '≠', approx: '≈',
equiv: '≡', infty: '∞', sum: '∑', prod: '∏', int: '∫', partial: '∂', sqrt: '√',
to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒',
in: '∈', notin: '∉', subset: '⊂', cup: '∪', cap: '∩', forall: '∀', exists: '∃',
ldots: '…', cdots: '⋯', mid: '|', vert: '|', langle: '⟨', rangle: '⟩'
};

function prettifyMath(tex) {
var s = String(tex == null? '': tex);
/* \frac{a}{b} → (a)/(b) */
s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)');
/* \sqrt{x} → √(x)，\sqrt[n]{x} → ⁿ√(x) */
s = s.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, '$1√($2)');
s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)');
/* \text{...} / \mathrm{...} 取内容 */
s = s.replace(/\\(?:text|mathrm|mathbf|mathit|boldsymbol)\s*\{([^{}]*)\}/g, '$1');
/* 上下标花括号去掉 */
s = s.replace(/([_^])\s*\{([^{}]*)\}/g, '$1$2');
/* 先剥离尺寸修饰（必须在命令映射前，否则 left 会被当命令名） */
s = s.replace(/\\(?:left|right|big|Big|bigg|Bigg)\s*/g, '');
/* 常见命令映射 */
s = s.replace(/\\([a-zA-Z]+)/g, function (mm, name) {
return Object.prototype.hasOwnProperty.call(MATH_MAP, name)? MATH_MAP[name]: name;
});
s = s.replace(/\\[,;:!]/g, '');
s = s.replace(/\\([{}%$&#_^])/g, '$1');
s = s.replace(/\s+/g, ' ');
return trim(s);
}

/* ================= mermaid 子集解析（纯函数） =================
* 支持 graph TD/TB/LR/BT + 节点 A[矩形] A{菱形} A(圆角) A((圆)) + 边 A-->B / A-->|文字|B / A---|文字|B
* 返回 null 表示超出子集（调用方降级为源码卡片）。
*/
function parseMermaidGraph(src) {
    var lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
    var dir = null, nodes = {}, order = [], edges = [];
    function ensureNode(id, shape, label) {
        if (!nodes[id]) { nodes[id] = { id: id, shape: shape || 'rect', label: label == null ? id : trim(String(label)) }; order.push(id); }
        else if (label != null && nodes[id].label === id) { nodes[id].label = trim(String(label)); }
        if (shape && nodes[id].shape === 'rect' && shape !== 'rect') nodes[id].shape = shape;
    }
    /* 解析 "ID[标签]" / "ID{标签}" / "ID(标签)" / "ID((标签))" / 纯ID，返回 {id, shape, label, rest} */
    function parseNodeRef(s) {
        var m = /^([A-Za-z_][\w]*)\s*(\(\(|\[\[|[\[{\(/])?/.exec(s);
        if (!m) return null;
        var id = m[1], open = m[2] || '', rest = s.slice(m[0].length), shape = 'rect', label = null;
        if (open) {
            var close = open === '[[' ? ']]' : open === '((' ? '))' :
                        open === '[' ? ']' : open === '{' ? '}' : open === '(' ? ')' : '/';
            var ci = rest.indexOf(close);
            if (ci < 0) return null;
            label = rest.slice(0, ci);
            rest = rest.slice(ci + close.length);
            shape = open === '{' ? 'diamond' : open === '((' ? 'circle' : open === '(' ? 'round' : 'rect';
        }
        return { id: id, shape: shape, label: label, rest: rest };
    }
    for (var li = 0; li < lines.length; li++) {
        var line = trim(lines[li]);
        if (!line || /^%%/.test(line)) continue;
        var dm = /^(graph|flowchart)\s+(TD|TB|LR|RL|BT)\b/i.exec(line);
        if (dm) { dir = dm[2].toUpperCase(); continue; }
        if (!dir) return null;
        /* 找边操作符 */
        var em = /(--+>|---|==>|--?\.-+->)/.exec(line);
        if (!em) {
            var nr = parseNodeRef(line);
            if (nr && trim(nr.rest) === '' && nr.label != null) { ensureNode(nr.id, nr.shape, nr.label); continue; }
            return null;
        }
        var left = parseNodeRef(trim(line.slice(0, em.index)));
        var rightPart = trim(line.slice(em.index + em[1].length));
        var edgeLabel = '';
        var lm = /^\|([^|]*)\|\s*/.exec(rightPart);
        if (lm) { edgeLabel = trim(lm[1]); rightPart = trim(rightPart.slice(lm[0].length)); }
        var right = parseNodeRef(rightPart);
        if (!left || !right || trim(right.rest) !== '') return null;
        ensureNode(left.id, left.shape, left.label);
        ensureNode(right.id, right.shape, right.label);
        edges.push({ from: left.id, to: right.id, label: edgeLabel });
    }
    if (!dir || order.length === 0) return null;
    return { dir: dir, nodes: order.map(function (id) { return nodes[id]; }), edges: edges };
}
function shapeOf(open) {
if (open === '{') return 'diamond';
if (open === '((') return 'circle';
if (open === '(') return 'round';
return 'rect';
}

/* ================= 平台适配（纯函数） =================
* 每个平台：标题/加粗/斜体/行内代码/引用/列表符号/链接/分隔线的纯文本映射，
* 以及复杂块的占位提示语。差异点如实文档化，见模板 FAQ。
*/
function basePlatform(over) {
var p = {
id: '', label: '',
h: function (lv, t) { return ['', '〖' + t + '〗', '「' + t + '」'][Math.min(lv, 3) - 1];},
bold: function (t) { return '';},
italic: function (t) { return '「' + t + '」';},
strike: function (t) { return '〔' + t + '〕';},
code: function (t) { return '「' + t + '」';},
quote: function (t) { return '｜' + t;},
bullet: '• ',
ol: function (n) { return n + '. ';},
hr: '──────────',
link: function (t, u) { return t + '（' + u + '）';},
        complex: { table: '📊【表格见下方图片】', code: '💻【代码见下方图片】', formula: '∑【公式见下方图片】', mermaid: '🔀【流程图见下方图片】' },
};
for (var k in over) p[k] = over[k];
return p;
}

var PLATFORMS = {
wechat: basePlatform({ id: 'wechat', label: '微信'}),
dingtalk: basePlatform({
id: 'dingtalk', label: '钉钉',
h: function (lv, t) { return ['', '◆ ' + t, '▪ ' + t][Math.min(lv, 3) - 1];},
quote: function (t) { return '> ' + t;},
bullet: '▪ ', hr: '----------',
code: function (t) { return '`' + t + '`';}
}),
feishu: basePlatform({
id: 'feishu', label: '飞书',
h: function (lv, t) { return ['', '『' + t + '』', '· ' + t][Math.min(lv, 3) - 1];},
quote: function (t) { return '▍ ' + t;},
bullet: '· ',
code: function (t) { return '`' + t + '`';}
}),
wecom: basePlatform({
id: 'wecom', label: '企微',
h: function (lv, t) { return ['', '〖' + t + '〗', '- ' + t][Math.min(lv, 3) - 1];},
quote: function (t) { return '> ' + t;},
bullet: '- ',
code: function (t) { return '`' + t + '`';}
})
};
var PLATFORM_ORDER = ['wechat', 'dingtalk', 'feishu', 'wecom'];

/* 纯文本提取：把行内 markdown 降为平台纯文本 */
function inlineToPlain(src, p) {
var codes = [], maths = [];
var s = String(src).replace(/`([^`\n]+)`/g, function (mm, c) { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000';});
s = s.replace(/\$([^$\n]+)\$/g, function (mm, c) { maths.push(prettifyMath(c)); return '\u0001' + (maths.length - 1) + '\u0001';});
s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
s = s.replace(/\[([^\]]+)\]\(\s*([^)\s]+)[^)]*\)/g, function (mm, t, u) { return p.link(t, sanitizeUrl(u));});
s = s.replace(/<((?:https?|ftp):[^<>\s]+)>/g, '$1');
s = s.replace(/~~([^~]+)~~/g, function (mm, t) { return p.strike(t);});
s = s.replace(/\*\*([^*]+)\*\*/g, function (mm, t) { return p.bold(t);});
s = s.replace(/__([^_]+)__/g, function (mm, t) { return p.bold(t);});
s = s.replace(/\*([^*]+)\*/g, function (mm, t) { return p.italic(t);});
s = s.replace(/\u0001(\d+)\u0001/g, function (mm, i) { return maths[+i];});
s = s.replace(/\u0000(\d+)\u0000/g, function (mm, i) { return p.code(codes[+i]);});
return s;
}

function textNodeToPlain(nd, p, out) {
var i, it;
if (nd.t === 'h') out.push(p.h(nd.level, inlineToPlain(nd.text, p)));
else if (nd.t === 'p') out.push(inlineToPlain(nd.text, p));
else if (nd.t === 'hr') out.push(p.hr);
else if (nd.t === 'q') { for (i = 0; i < nd.lines.length; i++) out.push(p.quote(inlineToPlain(nd.lines[i], p)));}
else if (nd.t === 'ul' || nd.t === 'ol') {
for (i = 0; i < nd.items.length; i++) {
it = nd.items[i];
out.push((nd.t === 'ul'? p.bullet: p.ol(nd.start + i)) + inlineToPlain(it.text, p));
if (it.sub) for (var j = 0; j < it.sub.length; j++) out.push(' ' + p.bullet + inlineToPlain(it.sub[j].text, p));
}
}
}

/* 整篇转平台纯文本：复杂块用占位提示语，提示用户配合图片卡片发送 */
function blocksToPlain(blocks, pid) {
var p = PLATFORMS[pid] || PLATFORMS.wechat;
var out = [];
blocks.forEach(function (b) {
if (b.kind === 'text') b.nodes.forEach(function (nd) { textNodeToPlain(nd, p, out);});
else if (b.kind === 'table') out.push(p.complex.table);
else if (b.kind === 'code') out.push(p.complex.code);
else if (b.kind === 'formula') out.push(p.complex.formula);
else if (b.kind === 'mermaid') out.push(p.complex.mermaid);
});
return out.join('\n');
}

/* ================= 文字版 HTML（纯函数，聊天消息样式） ================= */

var CHAT_FONT = SANS;
function listNodeHtml(nd, depth) {
var html = '', i, it;
var tag = nd.t === 'ul'? 'ul': 'ol';
var attrs = nd.t === 'ol' && nd.start && nd.start!== 1? ' start="' + nd.start + '"': '';
html += '<' + tag + attrs + ' style="margin:.3em 0.3em 1.2em;padding:0;">';
for (i = 0; i < nd.items.length; i++) {
it = nd.items[i];
html += '<li style="margin:.22em 0;line-height:1.75;">' + renderInline(it.text);
if (it.sub && it.sub.length) html += listNodeHtml({ t: 'ul', items: it.sub}, depth + 1);
html += '</li>';
}
html += '</' + tag + '>';
return html;
}

function textNodesHtml(nodes) {
var html = '';
nodes.forEach(function (nd) {
if (nd.t === 'h') {
var fs = [1.25, 1.15, 1.05, 1, 0.95, 0.9][Math.min(nd.level, 6) - 1];
html += '<div style="font-size:' + fs + 'em;font-weight:700;margin:.7em 0.35em;line-height:1.6;color:#111;">' +
renderInline(nd.text) + '</div>';
} else if (nd.t === 'p') {
html += '<div style="margin:.35em 0;line-height:1.8;color:#1f2937;">' + renderInline(nd.text) + '</div>';
} else if (nd.t === 'hr') {
html += '<div style="border-top:1px solid #e5e7eb;margin:.8em 0;"></div>';
} else if (nd.t === 'q') {
html += '<div style="border-left:3px solid #93c5fd;background:#f8fafc;border-radius:0 8px 8px 0;' +
'padding:.5em.9em;margin:.5em 0;color:#475569;line-height:1.8;">' +
nd.lines.map(function (l) { return renderInline(l);}).join('<br>') + '</div>';
} else if (nd.t === 'ul' || nd.t === 'ol') {
html += '<div style="color:#1f2937;">' + listNodeHtml(nd, 0) + '</div>';
}
});
return html;
}

var COMPLEX_CHIP = {
table: { icon: 'table_chart', label: '表格', color: '#2563eb', bg: '#eff6ff'},
code: { icon: 'code', label: '代码块', color: '#7c3aed', bg: '#f5f3ff'},
formula: { icon: 'functions', label: '数学公式', color: '#0d9488', bg: '#f0fdfa'},
mermaid: { icon: 'account_tree', label: '流程图', color: '#d97706', bg: '#fffbeb'}
};

/* 混合预览 HTML：文字块直接渲染，复杂块渲染为占位 chip（指向下方图片卡片） */
function blocksToHtml(blocks) {
var html = '';
blocks.forEach(function (b, idx) {
if (b.kind === 'text') {
html += '<div style="font-family:' + CHAT_FONT + ';font-size:15px;">' + textNodesHtml(b.nodes) + '</div>';
} else {
var c = COMPLEX_CHIP[b.kind];
var sub = b.kind === 'code'? (b.lang? ' · ' + escapeHtml(b.lang): ''):
b.kind === 'table'? ' · ' + b.rows.length + ' 行': '';
html += '<div data-mc-chip="' + idx + '" style="display:flex;align-items:center;gap:.6em;background:' + c.bg +
';border:1px dashed ' + c.color + ';border-radius:10px;padding:.65em.9em;margin:.6em 0;font-size:14px;color:' + c.color + ';">' +
'<i class="material-icons" style="font-size:1.25em;">' + c.icon + '</i>' +
'<span><b>' + c.label + '</b>' + sub + ' → 已转为下方图片卡片</span></div>';
}
});
return html || '<div style="color:#9ca3af;text-align:center;padding:2em 0;">在左侧粘贴 Markdown 或 AI 回答，右侧实时预览…</div>';
}

/* 纯文字版 HTML（可编辑区用：复杂块转为占位行，便于整体复制富文本） */
function blocksToEditableHtml(blocks, pid) {
var p = PLATFORMS[pid] || PLATFORMS.wechat;
var html = '';
blocks.forEach(function (b) {
if (b.kind === 'text') html += '<div style="font-family:' + CHAT_FONT + ';font-size:15px;">' + textNodesHtml(b.nodes) + '</div>';
else html += '<div style="font-family:' + CHAT_FONT + ';font-size:14px;color:#6b7280;margin:.5em 0;">' +
escapeHtml(p.complex[b.kind]) + '</div>';
});
return html || '<div style="color:#9ca3af;text-align:center;padding:2em 0;">在左侧粘贴 Markdown 或 AI 回答…</div>';
}

/* ================= 图片卡片：纯布局计算（纯函数，可 node 测试） ================= */

/* 表格布局：计算每列宽、行高、总尺寸（fontPx 为基准字号，pad 为内边距） */
function tableLayout(header, rows, fontPx, pad) {
var cols = header.length, cw = [];
var all = [header].concat(rows);
for (var c = 0; c < cols; c++) {
var maxLen = 0;
for (var r = 0; r < all.length; r++) {
var cell = String((all[r] || [])[c] == null? '': all[r][c]);
maxLen = Math.max(maxLen, textWidth(cell, fontPx));
}
cw.push(Math.ceil(maxLen) + pad * 2);
}
var rowH = Math.ceil(fontPx * 2.1);
var totalW = cw.reduce(function (a, b) { return a + b;}, 0);
var totalH = rowH * (rows.length + 1);
return { colW: cw, rowH: rowH, totalW: totalW, totalH: totalH};
}

/* 文本宽度估算（无 canvas 时的纯函数近似：CJK 按 1em，ASCII 按 0.55em） */
function textWidth(s, fontPx) {
var w = 0;
s = String(s);
for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) > 255? 1: 0.55;
return w * fontPx;
}

/* 按最大宽度折行（纯函数；measure 为 (text)=>width，node 测试可注入假函数） */
function wrapLines(text, maxW, measure) {
var out = [];
String(text).split('\n').forEach(function (raw) {
if (raw === '') { out.push(''); return;}
var line = '', i;
for (i = 0; i < raw.length; i++) {
var ch = raw[i], test = line + ch;
if (measure(test) > maxW && line!== '') { out.push(line); line = ch;}
else line = test;
}
out.push(line);
});
return out;
}

/* mermaid 布局：分层（TD 纵向 / LR 横向），返回节点坐标与边 */
function mermaidLayout(g, fontPx, measure) {
measure = measure || function (t) { return textWidth(t, fontPx);};
var nodes = g.nodes.map(function (nd) {
var w = Math.ceil(measure(nd.label)) + 44;
return { id: nd.id, label: nd.label, shape: nd.shape, w: Math.max(w, 84), h: 52};
});
var byId = {};
nodes.forEach(function (nd) { byId[nd.id] = nd;});
/* 分层：层级 = 前驱最大层级 + 1 */
var level = {}, indeg = {};
nodes.forEach(function (nd) { indeg[nd.id] = 0;});
g.edges.forEach(function (e) { if (byId[e.from] && byId[e.to]) indeg[e.to]++;});
var queue = nodes.filter(function (nd) { return indeg[nd.id] === 0;});
queue.forEach(function (nd) { level[nd.id] = 0;});
var guard = 0;
while (queue.length && guard++ < 1000) {
var cur = queue.shift();
g.edges.forEach(function (e) {
if (e.from!== cur.id ||!byId[e.to]) return;
var lv = (level[cur.id] || 0) + 1;
if (level[e.to] == null || lv > level[e.to]) level[e.to] = lv;
if (--indeg[e.to] === 0) queue.push(byId[e.to]);
});
}
nodes.forEach(function (nd) { if (level[nd.id] == null) level[nd.id] = 0;});
var layers = {};
nodes.forEach(function (nd) { var l = level[nd.id]; (layers[l] = layers[l] || []).push(nd);});
var vGap = 76, hGap = 40, vertical = /^(TD|TB|BT)$/.test(g.dir);
var W = 0, H = 0;
Object.keys(layers).forEach(function (l) {
var arr = layers[l], acc = 0;
arr.forEach(function (nd, idx) {
if (vertical) { nd.cx = acc + nd.w / 2; nd.cy = (+l) * (52 + vGap) + 26; acc += nd.w + hGap;}
else { nd.cx = (+l) * 220 + 110; nd.cy = acc + 26; acc += 52 + vGap;}
nd.layer = +l; nd.idx = idx;
});
var span = vertical? acc - hGap: acc - vGap;
if (vertical) W = Math.max(W, span); else H = Math.max(H, span);
});
if (vertical) H = (Object.keys(layers).length) * (52 + vGap) - vGap;
else W = (Object.keys(layers).length) * 220;
/* 同层居中 */
Object.keys(layers).forEach(function (l) {
var arr = layers[l], span = 0;
arr.forEach(function (nd) { span = Math.max(span, vertical? nd.cx + nd.w / 2: nd.cy + 26);});
var off = ((vertical? W: H) - span) / 2;
arr.forEach(function (nd) { if (vertical) nd.cx += off; else nd.cy += off;});
});
return { nodes: nodes, byId: byId, edges: g.edges, W: Math.ceil(W), H: Math.ceil(H), vertical: vertical};
}

/* ================= 浏览器：canvas 绘制 ================= */

function hasDOM() { return typeof document!== 'undefined' && typeof window!== 'undefined';}

function roundRectPath(ctx, x, y, w, h, r) {
r = Math.min(r, w / 2, h / 2);
ctx.beginPath();
ctx.moveTo(x + r, y);
ctx.arcTo(x + w, y, x + w, y + h, r);
ctx.arcTo(x + w, y + h, x, y + h, r);
ctx.arcTo(x, y + h, x, y, r);
ctx.arcTo(x, y, x + w, y, r);
ctx.closePath();
}

var CARD_THEMES = {
light: { bg: '#ffffff', border: '#e5e7eb', headBg: '#f8fafc', headText: '#374151',
cellText: '#1f2937', thBg: '#f1f5f9', thText: '#0f172a', grid: '#d1d5db',
codeBg: '#f8fafc', codeText: '#1f2937', codeNum: '#9ca3af', formulaText: '#111827'},
dark: { bg: '#1f2937', border: '#374151', headBg: '#111827', headText: '#e5e7eb',
cellText: '#f3f4f6', thBg: '#374151', thText: '#ffffff', grid: '#4b5563',
codeBg: '#111827', codeText: '#e5e7eb', codeNum: '#6b7280', formulaText: '#f9fafb'}
};

/* 创建卡片画布：返回 {canvas, ctx, W, H, contentY}，标题栏已绘制 */
function newCardCanvas(title, icon, contentW, contentH, theme, scale) {
var t = CARD_THEMES[theme] || CARD_THEMES.light;
var pad = 18, headH = 46;
var W = contentW + pad * 2, H = contentH + pad * 2 + headH;
var canvas = document.createElement('canvas');
canvas.width = W * scale; canvas.height = H * scale;
canvas.style.width = W + 'px'; canvas.style.maxWidth = '100%'; canvas.style.height = 'auto';
var ctx = canvas.getContext('2d');
ctx.scale(scale, scale);
roundRectPath(ctx, 1, 1, W - 2, H - 2, 14);
ctx.fillStyle = t.bg; ctx.fill();
ctx.strokeStyle = t.border; ctx.lineWidth = 1.5; ctx.stroke();
/* 标题栏 */
ctx.fillStyle = t.headBg;
ctx.save(); roundRectPath(ctx, 1, 1, W - 2, headH, 14); ctx.fill(); ctx.restore();
ctx.fillRect(1, headH - 14, W - 2, 14);
ctx.fillStyle = t.headText;
ctx.font = '600 15px ' + SANS;
ctx.textBaseline = 'middle';
ctx.fillText(title, pad, headH / 2 + 1);
ctx.strokeStyle = t.border; ctx.lineWidth = 1;
ctx.beginPath(); ctx.moveTo(1, headH); ctx.lineTo(W - 1, headH); ctx.stroke();
return { canvas: canvas, ctx: ctx, W: W, H: H, x0: pad, y0: headH + pad, theme: t};
}

function drawTableCard(block, theme, scale) {
var fontPx = 14, pad = 12;
var lo = tableLayout(block.header, block.rows, fontPx, pad);
var maxW = 900;
var k = lo.totalW > maxW? maxW / lo.totalW: 1;
var colW = lo.colW.map(function (w) { return w * k;});
var totalW = colW.reduce(function (a, b) { return a + b;}, 0);
var card = newCardCanvas('表格 · ' + block.rows.length + ' 行 × ' + block.header.length + ' 列', 'table_chart', Math.ceil(totalW), lo.totalH, theme, scale);
var ctx = card.ctx, t = card.theme, x = card.x0, y = card.y0;
var all = [block.header].concat(block.rows);
ctx.font = fontPx + 'px ' + SANS;
ctx.textBaseline = 'middle';
for (var r = 0; r < all.length; r++) {
var cx = x;
var isHead = r === 0;
ctx.font = (isHead? '700 ': '') + fontPx + 'px ' + SANS;
for (var c = 0; c < block.header.length; c++) {
var w = colW[c], cell = String((all[r][c] == null? '': all[r][c]));
if (isHead) { ctx.fillStyle = t.thBg; ctx.fillRect(cx, y + r * lo.rowH, w, lo.rowH);}
ctx.strokeStyle = t.grid; ctx.lineWidth = 1;
ctx.strokeRect(cx +.5, y + r * lo.rowH +.5, w - 1, lo.rowH - 1);
ctx.fillStyle = isHead? t.thText: t.cellText;
var align = (block.aligns || [])[c] || 'l';
var tx = align === 'c'? cx + w / 2: align === 'r'? cx + w - pad: cx + pad;
ctx.textAlign = align === 'c'? 'center': align === 'r'? 'right': 'left';
/* 超长单元格截断省略 */
var label = cell, maxTw = w - pad * 2;
while (label.length > 1 && ctx.measureText(label).width > maxTw) label = label.slice(0, -2);
if (label!== cell) label = label.slice(0, -1) + '…';
ctx.fillText(label, tx, y + r * lo.rowH + lo.rowH / 2 + 1);
cx += w;
}
}
ctx.textAlign = 'left';
return card.canvas;
}

function drawCodeCard(block, theme, scale) {
var fontPx = 13.5, lineH = Math.ceil(fontPx * 1.75), padX = 14;
var meas = document.createElement('canvas').getContext('2d');
meas.font = fontPx + 'px ' + MONO;
var rawLines = String(block.code).split('\n');
if (rawLines.length > 120) rawLines = rawLines.slice(0, 120).concat(['…（超长已截断，仅显示前 120 行）']);
var maxW = 860, wrapped = [];
rawLines.forEach(function (ln) {
var parts = wrapLines(ln, maxW, function (s) { return meas.measureText(s).width;});
if (!parts.length) parts = [''];
parts.forEach(function (p, i) { wrapped.push({ text: p, cont: i > 0});});
});
var numW = String(wrapped.length).length * fontPx * 0.62 + 18;
var contentW = 0;
wrapped.forEach(function (w) { contentW = Math.max(contentW, meas.measureText(w.text).width);});
contentW = Math.ceil(Math.min(contentW + numW + padX * 2, maxW + numW + padX * 2));
var card = newCardCanvas('代码' + (block.lang? ' · ' + block.lang: ''), 'code', contentW, wrapped.length * lineH + 8, theme, scale);
var ctx = card.ctx, t = card.theme;
ctx.fillStyle = t.codeBg;
roundRectPath(ctx, card.x0, card.y0, contentW, wrapped.length * lineH + 8, 8); ctx.fill();
ctx.font = fontPx + 'px ' + MONO;
ctx.textBaseline = 'middle';
wrapped.forEach(function (w, i) {
var y = card.y0 + 4 + i * lineH + lineH / 2;
if (!w.cont) {
ctx.fillStyle = t.codeNum; ctx.textAlign = 'right';
ctx.fillText(String(i + 1), card.x0 + numW - 8, y);
}
ctx.fillStyle = t.codeText; ctx.textAlign = 'left';
ctx.fillText(w.text, card.x0 + numW, y);
});
ctx.textAlign = 'left';
return card.canvas;
}

function drawFormulaCard(block, theme, scale) {
var pretty = prettifyMath(block.tex);
var fontPx = 22;
var meas = document.createElement('canvas').getContext('2d');
meas.font = '500 ' + fontPx + 'px ' + SANS;
var lines = wrapLines(pretty, 820, function (s) { return meas.measureText(s).width;});
var contentW = 0;
lines.forEach(function (l) { contentW = Math.max(contentW, meas.measureText(l).width);});
contentW = Math.ceil(contentW) + 40;
var lineH = Math.ceil(fontPx * 1.9);
var card = newCardCanvas('数学公式', 'functions', Math.max(contentW, 200), lines.length * lineH + 16, theme, scale);
var ctx = card.ctx, t = card.theme;
ctx.font = '500 ' + fontPx + 'px ' + SANS;
ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
ctx.fillStyle = t.formulaText;
lines.forEach(function (l, i) {
ctx.fillText(l, card.x0 + contentW / 2, card.y0 + 8 + i * lineH + lineH / 2);
});
/* 底部小字：原始 LaTeX */
ctx.font = '12px ' + MONO; ctx.fillStyle = t.codeNum || '#9ca3af';
var src = String(block.tex).split('\n')[0] || '';
if (src.length > 90) src = src.slice(0, 90) + '…';
ctx.fillText(src, card.x0 + contentW / 2, card.y0 + 8 + lines.length * lineH + 14);
ctx.textAlign = 'left';
return card.canvas;
}

function drawMermaidCard(block, theme, scale) {
var g = null;
try { g = parseMermaidGraph(block.code);} catch (e) { g = null;}
if (!g) {
/* 降级：按源码卡片渲染 */
return drawCodeCard({ lang: 'mermaid（暂不支持该语法，已按源码渲染）', code: block.code}, theme, scale);
}
var fontPx = 14;
var meas = document.createElement('canvas').getContext('2d');
meas.font = '500 ' + fontPx + 'px ' + SANS;
var lay = mermaidLayout(g, fontPx, function (s) { return meas.measureText(s).width;});
var pad = 30;
var card = newCardCanvas('流程图 · ' + g.dir, 'account_tree', lay.W + pad * 2, lay.H + pad * 2, theme, scale);
var ctx = card.ctx, t = card.theme;
var ox = card.x0 + pad, oy = card.y0 + pad;
function edgePoint(a, b) {
/* 从 a 中心指向 b 中心的射线与 a 矩形边框交点（菱形近似按矩形） */
var dx = b.cx - a.cx, dy = b.cy - a.cy;
var hw = a.w / 2, hh = a.h / 2;
if (dx === 0 && dy === 0) return { x: a.cx, y: a.cy};
var sx = dx!== 0? hw / Math.abs(dx): 1e9, sy = dy!== 0? hh / Math.abs(dy): 1e9;
var s = Math.min(sx, sy);
return { x: a.cx + dx * s, y: a.cy + dy * s};
}
/* 边 */
lay.edges.forEach(function (e) {
var a = lay.byId[e.from], b = lay.byId[e.to];
if (!a ||!b) return;
var p1 = edgePoint(a, b), p2 = edgePoint(b, a);
ctx.strokeStyle = t.codeNum || '#9ca3af'; ctx.lineWidth = 2;
ctx.beginPath(); ctx.moveTo(ox + p1.x, oy + p1.y); ctx.lineTo(ox + p2.x, oy + p2.y); ctx.stroke();
/* 箭头 */
var ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
ctx.fillStyle = t.codeNum || '#9ca3af';
ctx.beginPath();
ctx.moveTo(ox + p2.x, oy + p2.y);
ctx.lineTo(ox + p2.x - 10 * Math.cos(ang - 0.42), oy + p2.y - 10 * Math.sin(ang - 0.42));
ctx.lineTo(ox + p2.x - 10 * Math.cos(ang + 0.42), oy + p2.y - 10 * Math.sin(ang + 0.42));
ctx.closePath(); ctx.fill();
if (e.label) {
ctx.font = '12px ' + SANS; ctx.fillStyle = t.cellText; ctx.textAlign = 'center';
ctx.fillText(e.label, ox + (p1.x + p2.x) / 2, oy + (p1.y + p2.y) / 2 - 8);
ctx.textAlign = 'left';
}
});
/* 节点 */
lay.nodes.forEach(function (nd) {
var x = ox + nd.cx - nd.w / 2, y = oy + nd.cy - nd.h / 2;
ctx.font = '500 ' + fontPx + 'px ' + SANS;
ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
if (nd.shape === 'diamond') {
ctx.beginPath();
ctx.moveTo(ox + nd.cx, y); ctx.lineTo(x + nd.w, oy + nd.cy);
ctx.lineTo(ox + nd.cx, y + nd.h); ctx.lineTo(x, oy + nd.cy);
ctx.closePath();
ctx.fillStyle = t.thBg; ctx.fill();
ctx.strokeStyle = '#d97706'; ctx.lineWidth = 2; ctx.stroke();
} else if (nd.shape === 'circle') {
ctx.beginPath(); ctx.arc(ox + nd.cx, oy + nd.cy, Math.min(nd.w, nd.h) / 2, 0, Math.PI * 2);
ctx.fillStyle = t.thBg; ctx.fill();
ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2; ctx.stroke();
} else {
roundRectPath(ctx, x, y, nd.w, nd.h, nd.shape === 'round'? 18: 8);
ctx.fillStyle = t.thBg; ctx.fill();
ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2; ctx.stroke();
}
ctx.fillStyle = t.thText;
var label = nd.label;
while (label.length > 1 && meas.measureText(label).width > nd.w - 20) label = label.slice(0, -2);
if (label!== nd.label) label = label.slice(0, -1) + '…';
ctx.fillText(label, ox + nd.cx, oy + nd.cy + 1);
});
ctx.textAlign = 'left';
return card.canvas;
}

function drawCard(block, theme, scale) {
if (block.kind === 'table') return drawTableCard(block, theme, scale);
if (block.kind === 'code') return drawCodeCard(block, theme, scale);
if (block.kind === 'formula') return drawFormulaCard(block, theme, scale);
if (block.kind === 'mermaid') return drawMermaidCard(block, theme, scale);
return null;
}

/* ================= 复制（浏览器） ================= */

function toast(msg, ok) {
if (!hasDOM()) return;
var el = document.getElementById('mc-toast');
if (!el) return;
el.textContent = msg;
el.style.borderColor = ok === false? '#fca5a5': '#34d399';
el.classList.add('show');
clearTimeout(toast._t);
toast._t = setTimeout(function () { el.classList.remove('show');}, 2600);
}

/* 纯文本复制：clipboard API → execCommand 降级 */
function copyPlainText(text, done) {
done = done || function () {};
if (!text.replace(/\s/g, '')) { toast('没有可复制的内容', false); done(false); return;}
function fallback() {
var ta = document.createElement('textarea');
ta.value = text;
ta.setAttribute('style', 'position:fixed;left:-9999px;top:0;opacity:0;');
document.body.appendChild(ta);
ta.select();
try { ta.setSelectionRange(0, ta.value.length);} catch (e) {}
var ok = false;
try { ok = document.execCommand('copy');} catch (e) { ok = false;}
document.body.removeChild(ta);
done(ok);
}
if (navigator.clipboard && navigator.clipboard.writeText) {
navigator.clipboard.writeText(text).then(function () { done(true);}, function () { fallback();});
} else fallback();
}

/* 富文本复制：ClipboardItem(text/html + text/plain) → 选中隐藏 div + execCommand 降级 */
function copyRichHtml(html, plain, done) {
done = done || function () {};
if (!plain.replace(/\s/g, '')) { toast('没有可复制的内容', false); done(false); return;}
function fallback() {
var div = document.createElement('div');
div.innerHTML = html;
div.setAttribute('style', 'position:fixed;left:-9999px;top:0;width:640px;');
document.body.appendChild(div);
var range = document.createRange();
range.selectNodeContents(div);
var sel = window.getSelection();
sel.removeAllRanges(); sel.addRange(range);
var ok = false;
try { ok = document.execCommand('copy');} catch (e) { ok = false;}
sel.removeAllRanges();
document.body.removeChild(div);
done(ok);
}
if (navigator.clipboard && window.ClipboardItem) {
try {
var item = new ClipboardItem({
'text/html': new Blob([html], { type: 'text/html'}),
'text/plain': new Blob([plain], { type: 'text/plain'})
});
navigator.clipboard.write([item]).then(function () { done(true);}, function () { fallback();});
} catch (e) { fallback();}
} else fallback();
}

/* 图片复制：ClipboardItem(image/png)，不支持则提示下载 */
function copyImageCanvas(canvas, done) {
done = done || function () {};
function noSupport() { toast('当前浏览器不支持直接复制图片，请用「下载 PNG」', false); done(false);}
if (!(navigator.clipboard && window.ClipboardItem) ||!canvas.toBlob) { noSupport(); return;}
canvas.toBlob(function (blob) {
if (!blob) { noSupport(); return;}
try {
var item = new ClipboardItem({ 'image/png': blob});
navigator.clipboard.write([item]).then(function () { done(true);}, function () { noSupport();});
} catch (e) { noSupport();}
}, 'image/png');
}

function downloadCanvas(canvas, name) {
var url = canvas.toDataURL('image/png');
var a = document.createElement('a');
a.href = url; a.download = name;
document.body.appendChild(a); a.click();
setTimeout(function () { document.body.removeChild(a);}, 500);
}

/* ================= UI（浏览器） ================= */

var state = { platform: 'wechat', theme: 'light', scale: 2, tab: 'mix', blocks: [], cards: []};

function $(id) { return document.getElementById(id);}

function sampleMd() {
return [
'# AI 效率周报（示例）',
'',
'本周用 AI 提效的 3 个结论，粘贴到微信/钉钉/飞书/企微排版不炸：',
'',
'## 1. 模型选型对照',
'',
'| 场景 | 推荐模型 | 备注 |',
'|:--- |:---: | ---: |',
'| 日常问答 | DeepSeek V3 | 便宜量大 |',
'| 代码补全 | Qwen3-Coder | 上下文长 |',
'| 推理难题 | K2 \\| GLM-4.6 | 竖线已转义 |',
'',
'## 2. 快捷命令',
'',
'```bash',
'# 批量把 md 转纯文本预览',
'for f in *.md; do echo "== $f"; wc -m "$f"; done',
'```',
'',
'## 3. 成本公式',
'',
'单次调用成本可近似为：',
'',
'$$C = \\frac{(p_{in} + p_{out}) \\times n}{1000} \\times r$$',
'',
'其中 $r$ 为汇率系数，$\\alpha$ 为折扣因子。',
'',
'## 4. 上线流程',
'',
'```mermaid',
'graph TD',
' A[需求评审] --> B{排期通过?}',
' B -->|是| C[开发联调]',
' B -->|否| A',
' C --> D((上线))',
'```',
'',
'> 提示：表格 / 代码 / 公式 / 流程图会自动转为下方图片卡片，',
'> 文字版复制到聊天框排版不乱。'
].join('\n');
}

var CARD_TITLES = {
table: '表格', code: '代码', formula: '数学公式', mermaid: '流程图'
};

function doRender() {
var src = $('mc-src').value;
state.blocks = parseBlocks(src);
renderPreview();
renderCards();
var p = PLATFORMS[state.platform];
$('mc-count').textContent = '源码 ' + src.length + ' 字 · ' + state.blocks.length + ' 个内容块';
$('mc-plat-tip').textContent = p.label + '适配：' + platTip(state.platform);
$('mc-copy-plain').innerHTML = '<i class="material-icons">content_copy</i>复制文字版（' + p.label + '纯文本）';
$('mc-copy-rich').innerHTML = '<i class="material-icons">auto_awesome</i>复制富文本（' + p.label + '）';
}

function platTip(pid) {
return {
wechat: '标题用/〖〗强调，加粗→，引用→｜，列表用 •，复杂块转为图片卡片发送。',
dingtalk: '标题用/◆ 强调，加粗→，引用→>，列表用 ▪，复杂块转为图片卡片发送。',
feishu: '标题用/『』强调，加粗→，引用→▍，列表用 ·，复杂块转为图片卡片发送。',
wecom: '标题用/〖〗强调，加粗→，引用→>，列表用 -，复杂块转为图片卡片发送。'
}[pid];
}

function renderPreview() {
var box = $('mc-preview');
if (state.tab === 'text') {
box.innerHTML = blocksToEditableHtml(state.blocks, state.platform);
box.setAttribute('contenteditable', 'true');
} else {
box.innerHTML = blocksToHtml(state.blocks);
box.removeAttribute('contenteditable');
}
}

function renderCards() {
var wrap = $('mc-cards');
wrap.innerHTML = '';
state.cards = [];
state.blocks.forEach(function (b, idx) {
if (b.kind === 'text') return;
var canvas = drawCard(b, state.theme, state.scale);
var item = { block: b, canvas: canvas, idx: idx};
state.cards.push(item);
var c = COMPLEX_CHIP[b.kind];
var div = document.createElement('div');
div.className = 'mc-card';
var head = document.createElement('div');
head.className = 'mc-card-head';
head.innerHTML = '<i class="material-icons">' + c.icon + '</i><b>' + CARD_TITLES[b.kind] + '</b>' +
'<span class="mc-card-sub">第 ' + (idx + 1) + ' 块</span>';
var btnCopy = document.createElement('button');
btnCopy.type = 'button'; btnCopy.className = 'mc-mini';
btnCopy.innerHTML = '<i class="material-icons">content_copy</i>复制图片';
btnCopy.onclick = function () {
copyImageCanvas(item.canvas, function (ok) {
toast(ok? '✅ 图片已复制，去聊天框粘贴': '❌ 复制失败', ok);
});
};
var btnDl = document.createElement('button');
btnDl.type = 'button'; btnDl.className = 'mc-mini';
btnDl.innerHTML = '<i class="material-icons">download</i>下载 PNG';
btnDl.onclick = function () {
downloadCanvas(item.canvas, 'md2chat-' + CARD_TITLES[b.kind] + '-' + (idx + 1) + '.png');
toast('✅ 图片已下载');
};
head.appendChild(btnCopy); head.appendChild(btnDl);
div.appendChild(head);
var body = document.createElement('div');
body.className = 'mc-card-body';
body.appendChild(canvas);
div.appendChild(body);
wrap.appendChild(div);
});
$('mc-card-empty').style.display = state.cards.length? 'none': 'block';
$('mc-card-count').textContent = state.cards.length? ('共 ' + state.cards.length + ' 张图片卡片'): '';
}

function setPlatform(pid, btn) {
state.platform = pid;
var btns = document.querySelectorAll('[data-mc-plat]');
for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', btns[i] === btn? 'true': 'false');
doRender();
}

function setTab(tab, btn) {
state.tab = tab;
var btns = document.querySelectorAll('[data-mc-tab]');
for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', btns[i] === btn? 'true': 'false');
renderPreview();
var hint = $('mc-edit-hint'); if (hint) hint.style.display = tab === 'text' ? 'block' : 'none';
}

function copyForPlatform(kind) {
var p = PLATFORMS[state.platform];
var plain = blocksToPlain(state.blocks, state.platform);
function done(ok) {
toast(ok? '✅ 已复制（' + p.label + (kind === 'rich'? '富文本': '纯文本') + '），去聊天框粘贴吧'
: '❌ 复制失败，请手动框选右侧预览区复制', ok);
}
if (kind === 'rich') {
var html = '<div style="font-family:' + SANS + ';font-size:15px;color:#1f2937;">' +
blocksToEditableHtml(state.blocks, state.platform) + '</div>';
copyRichHtml(html, plain, done);
} else {
copyPlainText(plain, done);
}
}

function importMdFile(file) {
if (!file) return;
var rd = new FileReader();
rd.onload = function () {
$('mc-src').value = String(rd.result || '');
doRender();
toast('✅ 已导入 ' + file.name);
};
rd.onerror = function () { toast('❌ 文件读取失败', false);};
rd.readAsText(file);
}

function init() {
if (!hasDOM()) return;
$('mc-sample-btn').onclick = function () { $('mc-src').value = sampleMd(); doRender();};
$('mc-clear-btn').onclick = function () { $('mc-src').value = ''; doRender();};
$('mc-import-btn').onclick = function () { $('mc-file').click();};
$('mc-file').onchange = function (e) { importMdFile(e.target.files[0]); e.target.value = '';};
$('mc-theme').onchange = function (e) { state.theme = e.target.value; renderCards();};
$('mc-scale').onchange = function (e) { state.scale = parseInt(e.target.value, 10) || 2; renderCards();};
$('mc-copy-plain').onclick = function () { copyForPlatform('plain');};
$('mc-copy-rich').onclick = function () { copyForPlatform('rich');};
var timer = null;
$('mc-src').addEventListener('input', function () {
clearTimeout(timer);
timer = setTimeout(doRender, 280);
});
var pbtns = document.querySelectorAll('[data-mc-plat]');
for (var i = 0; i < pbtns.length; i++) {
(function (btn) {
btn.onclick = function () { setPlatform(btn.getAttribute('data-mc-plat'), btn);};
})(pbtns[i]);
}
var tbtns = document.querySelectorAll('[data-mc-tab]');
for (var j = 0; j < tbtns.length; j++) {
(function (btn) {
btn.onclick = function () { setTab(btn.getAttribute('data-mc-tab'), btn);};
})(tbtns[j]);
}
$('mc-src').value = sampleMd();
doRender();
}

if (hasDOM()) {
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
}

if (typeof module!== 'undefined' && module.exports) {
module.exports = {
escapeHtml: escapeHtml, sanitizeUrl: sanitizeUrl,
parseBlocks: parseBlocks, parseTextNodes: parseTextNodes, splitCells: splitCells,
renderInline: renderInline, prettifyMath: prettifyMath, parseMermaidGraph: parseMermaidGraph,
mermaidLayout: mermaidLayout, tableLayout: tableLayout, textWidth: textWidth, wrapLines: wrapLines,
PLATFORMS: PLATFORMS, PLATFORM_ORDER: PLATFORM_ORDER,
inlineToPlain: inlineToPlain, blocksToPlain: blocksToPlain,
blocksToHtml: blocksToHtml, blocksToEditableHtml: blocksToEditableHtml,
CARD_THEMES: CARD_THEMES
};
}
})();
