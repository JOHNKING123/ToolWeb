/* Markdown 公众号一键排版 - 自研轻量 Markdown→HTML 渲染引擎 + 公众号主题引擎
 * 纯前端零依赖：不引任何 CDN、不走后端 API、不上传内容，全部在浏览器内完成。
 * 输出全部内联 style 属性、零 class、零 <style> 标签（公众号编辑器会剥离 class）。
 * 代码块 / 行内代码内的 HTML 统一转义，链接 URL 做协议白名单，防 XSS。
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；
 * Node 自测：module.exports 暴露纯函数（转义 / 行内渲染 / 块解析 / 主题渲染 / 纯文本提取）。
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
    if (/^[\s\u0000-\u001f]*data:/i.test(s) && !/^data:image\//i.test(s)) return '#';
    return s;
}

/* ================= 公众号主题（纯数据） ================= */

var THEMES = {
    cinnabar: { label: '朱砂红', accent: '#c0392b', quoteBg: '#fdf3f1', codeBg: '#f7f5f4', hr: '#e3a89e', thBg: '#fbeeea' },
    blue:     { label: '商务蓝', accent: '#1f6fb2', quoteBg: '#f0f6fc', codeBg: '#f5f7f9', hr: '#a9cbe8', thBg: '#e8f1fa' },
    bamboo:   { label: '竹青',   accent: '#2e7d4f', quoteBg: '#f1f8f3', codeBg: '#f5f7f5', hr: '#a9d4b8', thBg: '#e7f4ec' },
    orange:   { label: '暖阳橙', accent: '#d9731a', quoteBg: '#fdf6ec', codeBg: '#faf7f2', hr: '#eec088', thBg: '#fdf1e3' }
};
var MONO_FONT = 'ui-monospace,SFMono-Regular,Menlo,Consolas,"Courier New",monospace';
var BASE_FONT = '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif';

/* ================= 行内渲染（纯函数） ================= */

function renderInline(src, t) {
    /* 1) 先抽出行内代码，用占位符保护，避免内部 * _ [ ] 被误解析 */
    var codes = [];
    var s = String(src).replace(/`([^`\n]+)`/g, function (m, c) {
        codes.push(c);
        return '\u0000' + (codes.length - 1) + '\u0000';
    });
    /* 2) 全量转义：源码里的 <script> 等 HTML 在此失效，防 XSS */
    s = escapeHtml(s);
    /* 3) 图片 */
    s = s.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\s*\)/g, function (m, alt, url, title) {
        url = sanitizeUrl(url);
        var ti = title ? ' title="' + escapeHtml(title) + '"' : '';
        return '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(alt) + '"' + ti +
            ' style="max-width:100%;height:auto;border-radius:6px;vertical-align:middle;">';
    });
    /* 4) 链接 */
    s = s.replace(/\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\s*\)/g, function (m, text, url, title) {
        url = sanitizeUrl(url);
        var ti = title ? ' title="' + escapeHtml(title) + '"' : '';
        return '<a href="' + escapeHtml(url) + '"' + ti + ' target="_blank" style="color:' + t.accent +
            ';text-decoration:underline;word-break:break-all;">' + text + '</a>';
    });
    /* 5) 自动链接 <https://...>（此时 < > 已被转义为 &lt; &gt;） */
    s = s.replace(/&lt;((?:https?|ftp):[^<>\s]+)&gt;/g, function (m, url) {
        url = sanitizeUrl(url);
        return '<a href="' + escapeHtml(url) + '" target="_blank" style="color:' + t.accent +
            ';text-decoration:underline;word-break:break-all;">' + escapeHtml(url) + '</a>';
    });
    /* 6) 删除线 */
    s = s.replace(/~~([^~]+)~~/g, '<del style="text-decoration:line-through;color:#9ca3af;">$1</del>');
    /* 7) 加粗（先 ** 后 __，避免与斜体冲突） */
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong style="font-weight:700;color:#1f2329;">$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong style="font-weight:700;color:#1f2329;">$1</strong>');
    /* 8) 斜体（仅 * 形态；_ 形态在中文语境易误伤如下划线变量，略过） */
    s = s.replace(/\*([^*]+)\*/g, '<em style="font-style:italic;">$1</em>');
    /* 9) 还原行内代码：内容转义后包 <code> */
    s = s.replace(/\u0000(\d+)\u0000/g, function (m, i) {
        return '<code style="font-family:' + MONO_FONT + ';font-size:0.9em;background:#f1f2f4;color:#c7254e;' +
            'padding:0.15em 0.4em;border-radius:4px;word-break:break-all;">' + escapeHtml(codes[+i]) + '</code>';
    });
    return s;
}

/* ================= 块级解析（纯函数） ================= */

function blankLine(l) { return /^\s*$/.test(l); }

function startsBlock(l) {
    return /^(#{1,6})\s/.test(l) ||
        /^\s*([-*_])(\s*\1){2,}\s*$/.test(l) ||
        /^\s*(`{3,}|~{3,})/.test(l) ||
        /^\s*>/.test(l) ||
        /^\s*([-*+]|\d+[.)])\s+/.test(l);
}

/* 表格单元格拆分：支持 \| 转义 */
function splitCells(row) {
    var t = String(row).trim();
    if (t.charAt(0) === '|') t = t.slice(1);
    if (t.charAt(t.length - 1) === '|') t = t.slice(0, -1);
    var cells = [], cur = '', esc = false, i, ch;
    for (i = 0; i < t.length; i++) {
        ch = t.charAt(i);
        if (esc) { cur += ch; esc = false; }
        else if (ch === '\\') esc = true;
        else if (ch === '|') { cells.push(cur); cur = ''; }
        else cur += ch;
    }
    cells.push(cur);
    return cells;
}

function isTableSep(line) {
    var cells = splitCells(line);
    if (!cells.length) return false;
    return cells.every(function (c) { return /^\s*:?-{1,}:?\s*$/.test(c); });
}

function isTableRow(line) {
    return splitCells(line).length >= 2;
}

function parseBlocks(lines) {
    var blocks = [], i = 0, n = lines.length, m;
    while (i < n) {
        var line = lines[i];
        if (blankLine(line)) { i++; continue; }
        /* 代码围栏 */
        m = line.match(/^\s*(`{3,}|~{3,})\s*([\w#+-]*)\s*$/);
        if (m) {
            var fenceCh = m[1].charAt(0), buf = [];
            i++;
            var closeRe = new RegExp('^\\s*' + (fenceCh === '`' ? '`{3,}' : '~{3,}') + '\\s*$');
            while (i < n && !closeRe.test(lines[i])) { buf.push(lines[i]); i++; }
            if (i < n) i++;
            blocks.push({ type: 'code', text: buf.join('\n') });
            continue;
        }
        /* 标题 H1-H6 */
        m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
        if (m && m[2]) { blocks.push({ type: 'heading', level: m[1].length, text: m[2] }); i++; continue; }
        /* 分割线 */
        if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { blocks.push({ type: 'hr' }); i++; continue; }
        /* 引用块 */
        if (/^\s*>/.test(line)) {
            var bq = [];
            while (i < n && /^\s*>/.test(lines[i])) { bq.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
            blocks.push({ type: 'blockquote', children: parseBlocks(bq) });
            continue;
        }
        /* 表格：表头行 + 分隔行前瞻 */
        if (isTableRow(line) && i + 1 < n && isTableSep(lines[i + 1])) {
            var head = splitCells(line);
            var aligns = splitCells(lines[i + 1]).map(function (c) {
                c = c.trim();
                var l = c.charAt(0) === ':', r = c.charAt(c.length - 1) === ':';
                return (l && r) ? 'center' : (r ? 'right' : 'left');
            });
            var rows = [];
            i += 2;
            while (i < n && isTableRow(lines[i]) && !isTableSep(lines[i])) { rows.push(splitCells(lines[i])); i++; }
            blocks.push({ type: 'table', head: head, aligns: aligns, rows: rows });
            continue;
        }
        /* 列表（含嵌套、任务列表） */
        m = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (m) {
            var r = parseList(lines, i);
            blocks.push(r.block);
            i = r.next;
            continue;
        }
        /* 段落：收到空行或块起始行则结束 */
        var para = [];
        while (i < n && !blankLine(lines[i]) && !startsBlock(lines[i])) {
            if (isTableRow(lines[i]) && i + 1 < n && isTableSep(lines[i + 1])) break;
            para.push(lines[i]);
            i++;
        }
        if (para.length) blocks.push({ type: 'paragraph', lines: para });
        else i++;
    }
    return blocks;
}

/* 列表解析：返回 {block, next}；条目缩进延续行递归进 parseBlocks，天然支持嵌套 */
function parseList(lines, start) {
    var items = [], i = start, n = lines.length;
    var first = lines[start].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
    var baseIndent = first[1].length;
    var ordered = /^\d/.test(first[2]);
    var startNum = ordered ? parseInt(first[2], 10) : 1;
    var markerLen = first[2].length;
    var contentIndent = baseIndent + markerLen + 1;
    while (i < n) {
        var m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (!m) break;
        var ind = m[1].length;
        if (ind !== baseIndent) break;
        var itemText = m[3], task = null;
        var tm = itemText.match(/^\[([ xX])\]\s+(.*)$/);
        if (tm && !ordered) { task = (tm[1].toLowerCase() === 'x'); itemText = tm[2]; }
        var cont = [];
        i++;
        while (i < n && !blankLine(lines[i])) {
            var raw = lines[i];
            var cm = raw.match(/^( *)(.*)$/);
            var cind = cm[1].length;
            var nm = raw.match(/^( *)([-*+]|\d+[.)])\s+/);
            if (nm && nm[1].length <= baseIndent) break;
            if (cind < baseIndent + 1) break;
            cont.push(cind >= contentIndent ? raw.slice(contentIndent) : raw.slice(cind));
            i++;
        }
        items.push({ task: task, children: parseBlocks([itemText].concat(cont)) });
    }
    return { block: { type: 'list', ordered: ordered, start: startNum, items: items }, next: i };
}

/* ================= 块级渲染：全部内联 style，零 class（纯函数） ================= */

function renderBlock(b, t) {
    var k, j;
    switch (b.type) {
        case 'heading': {
            var l = Math.min(b.level, 6), tag = 'h' + l, style;
            if (l === 1) style = 'margin:1.1em 0 0.9em;padding:0 0 0.4em;font-size:1.5em;font-weight:700;color:' + t.accent + ';text-align:center;border-bottom:2px solid ' + t.hr + ';';
            else if (l === 2) style = 'margin:1.4em 0 0.8em;padding:0 0 0 0.6em;font-size:1.3em;font-weight:700;color:#1f2329;border-left:4px solid ' + t.accent + ';';
            else if (l === 3) style = 'margin:1.2em 0 0.6em;font-size:1.15em;font-weight:700;color:' + t.accent + ';';
            else style = 'margin:1em 0 0.5em;font-size:1.05em;font-weight:700;color:#1f2329;';
            return '<' + tag + ' style="' + style + '">' + renderInline(b.text, t) + '</' + tag + '>';
        }
        case 'paragraph': {
            var ps = b.lines.map(function (x) { return renderInline(x, t); }).join('<br>');
            return '<p style="margin:0.8em 0;color:#333333;text-align:justify;">' + ps + '</p>';
        }
        case 'blockquote':
            return '<blockquote style="margin:1em 0;padding:0.1em 1em;border-left:4px solid ' + t.accent +
                ';background:' + t.quoteBg + ';color:#555555;border-radius:0 6px 6px 0;">' +
                renderBlocks(b.children, t) + '</blockquote>';
        case 'code':
            return '<pre style="margin:1em 0;padding:0.9em 1em;background:' + t.codeBg + ';border-radius:6px;overflow-x:auto;font-size:0.88em;line-height:1.6;">' +
                '<code style="font-family:' + MONO_FONT + ';color:#333333;background:transparent;padding:0;">' +
                escapeHtml(b.text) + '</code></pre>';
        case 'hr':
            return '<div style="margin:1.8em auto;width:28%;border-top:2px solid ' + t.hr + ';"></div>';
        case 'list': {
            var tag2 = b.ordered ? 'ol' : 'ul';
            var lis = b.items.map(function (it) {
                var inner = renderBlocks(it.children, t);
                if (it.task !== null) {
                    var box = it.task ? '☑' : '☐';
                    return '<li style="margin:0.4em 0;list-style:none;margin-left:-1.7em;"><span style="color:' +
                        t.accent + ';margin-right:0.4em;">' + box + '</span>' + inner + '</li>';
                }
                return '<li style="margin:0.4em 0;">' + inner + '</li>';
            }).join('');
            var startAttr = (b.ordered && b.start && b.start !== 1) ? ' start="' + b.start + '"' : '';
            return '<' + tag2 + startAttr + ' style="margin:0.8em 0;padding-left:1.7em;color:#333333;">' + lis + '</' + tag2 + '>';
        }
        case 'table': {
            var aligns = b.aligns;
            var ths = b.head.map(function (c, idx) {
                return '<th style="border:1px solid #dfe3e8;padding:0.5em 0.7em;text-align:' + (aligns[idx] || 'left') +
                    ';background:' + t.thBg + ';font-weight:700;color:#1f2329;">' + renderInline(c, t) + '</th>';
            }).join('');
            var trs = b.rows.map(function (r) {
                var tds = b.head.map(function (c, idx) {
                    return '<td style="border:1px solid #dfe3e8;padding:0.5em 0.7em;text-align:' + (aligns[idx] || 'left') +
                        ';color:#333333;">' + renderInline(r[idx] || '', t) + '</td>';
                }).join('');
                return '<tr>' + tds + '</tr>';
            }).join('');
            return '<div style="margin:1em 0;overflow-x:auto;"><table style="border-collapse:collapse;width:100%;font-size:0.92em;"><tr>' +
                ths + '</tr>' + trs + '</table></div>';
        }
        default:
            return '';
    }
}

function renderBlocks(blocks, t) {
    var out = '';
    for (var k = 0; k < blocks.length; k++) out += renderBlock(blocks[k], t);
    return out;
}

/* 顶层渲染：返回 {body, section}；section 为可直接复制/导出的自包含片段 */
function renderMarkdown(md, themeId, fontSize, lineHeight) {
    var t = THEMES[themeId] || THEMES.cinnabar;
    var fs = fontSize || 16, lh = lineHeight || 1.75;
    var lines = String(md == null ? '' : md).replace(/\r\n?/g, '\n').split('\n');
    lines = lines.map(function (l) { return l.replace(/\t/g, '    '); });
    var body = renderBlocks(parseBlocks(lines), t);
    var sectionStyle = 'font-family:' + BASE_FONT + ';font-size:' + fs + 'px;line-height:' + lh +
        ';color:#333333;word-wrap:break-word;';
    return { body: body, section: '<section style="' + sectionStyle + '">' + body + '</section>' };
}

/* 富 HTML → 纯文本（供剪贴板 text/plain 与字数统计） */
function htmlToText(html) {
    return String(html)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre|section|ul|ol)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'").replace(/&amp;/g, '&')
        .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ================= 浏览器交互 ================= */

var state = { theme: 'cinnabar', fontSize: 16, lineHeight: 1.75, width: 'full' };
var renderTimer = null;

function $(id) { return document.getElementById(id); }

function toast(msg, ok) {
    var el = $('mpf-toast');
    el.textContent = msg;
    el.style.display = 'block';
    el.style.background = ok === false ? '#fef2f2' : '#f0fdf4';
    el.style.borderColor = ok === false ? '#fecaca' : '#bbf7d0';
    el.style.color = ok === false ? '#b91c1c' : '#15803d';
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.style.display = 'none'; }, 2600);
}

function doRender() {
    var src = $('mpf-src').value;
    var r = renderMarkdown(src, state.theme, state.fontSize, state.lineHeight);
    $('mpf-preview').innerHTML = r.section;
    $('mpf-count').textContent = '源码 ' + src.length + ' 字 · 渲染 ' + htmlToText(r.body).length + ' 字';
    doRender._last = r;
}

function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(doRender, 250);
}

function setTheme(id, btn) {
    state.theme = id;
    var btns = document.querySelectorAll('[data-mpf-theme]');
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', btns[i] === btn ? 'true' : 'false');
    doRender();
}

function copyRichText() {
    var r = doRender._last || renderMarkdown($('mpf-src').value, state.theme, state.fontSize, state.lineHeight);
    if (!r.body.replace(/\s/g, '')) { toast('预览区是空的，先写点内容吧', false); return; }
    var text = htmlToText(r.body);
    function done(ok, msg) { toast(msg || (ok ? '✅ 富文本已复制，去公众号后台粘贴吧' : '❌ 复制失败，请手动框选预览区复制'), ok); }
    if (navigator.clipboard && window.ClipboardItem) {
        try {
            var item = new ClipboardItem({
                'text/html': new Blob([r.section], { type: 'text/html' }),
                'text/plain': new Blob([text], { type: 'text/plain' })
            });
            navigator.clipboard.write([item]).then(function () { done(true); }, function () { fallbackCopy(r.section, done); });
        } catch (e) { fallbackCopy(r.section, done); }
    } else {
        fallbackCopy(r.section, done);
    }
}

/* execCommand 降级：选中隐藏 div 内富文本后执行 copy（剪贴板同样得到 text/html） */
function fallbackCopy(html, done) {
    var div = document.createElement('div');
    div.innerHTML = html;
    div.setAttribute('style', 'position:fixed;left:-9999px;top:0;width:600px;');
    document.body.appendChild(div);
    var range = document.createRange();
    range.selectNodeContents(div);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    sel.removeAllRanges();
    document.body.removeChild(div);
    done(ok);
}

function downloadFile(name, content, mime) {
    var blob = new Blob([content], { type: mime + ';charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 500);
}

function exportHtml() {
    var r = doRender._last || renderMarkdown($('mpf-src').value, state.theme, state.fontSize, state.lineHeight);
    if (!r.body.replace(/\s/g, '')) { toast('预览区是空的，先写点内容吧', false); return; }
    var m = $('mpf-src').value.match(/^#{1,6}\s+(.+?)\s*$/m);
    var title = m ? htmlToText(renderInline(m[1], THEMES[state.theme])) : '公众号排版导出';
    var doc = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        '<title>' + escapeHtml(title) + '</title>\n</head>\n' +
        '<body style="margin:0;padding:24px;background:#ffffff;">\n' +
        '<div style="max-width:720px;margin:0 auto;">\n' + r.section + '\n</div>\n</body>\n</html>';
    var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    downloadFile('公众号排版-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
        p(d.getHours()) + p(d.getMinutes()) + '.html', doc, 'text/html');
    toast('✅ 已导出独立 .html（内联样式，离线可开）');
}

function exportMd() {
    var src = $('mpf-src').value;
    if (!src.replace(/\s/g, '')) { toast('源码是空的', false); return; }
    var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    downloadFile('公众号排版源码-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.md', src, 'text/markdown');
    toast('✅ 已导出 .md 源码');
}

function importMd(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
        $('mpf-src').value = String(reader.result || '');
        doRender();
        toast('✅ 已载入 ' + file.name + '（本地读取，未上传）');
    };
    reader.onerror = function () { toast('❌ 文件读取失败', false); };
    reader.readAsText(file, 'utf-8');
    $('mpf-import-file').value = '';
}

var SAMPLE_MD = [
    '# 公众号排版示例：从 Markdown 到精美推送',
    '',
    '> 一篇好文章值得好看的排版。粘贴 Markdown，选主题，一键复制到公众号后台。',
    '',
    '## 二级标题：加粗与斜体',
    '',
    '这是一段**加粗文字**、一段*斜体文字*、一段~~删除线文字~~，还有`行内代码`。支持[超链接](https://example.com)跳转，也支持自动链接 <https://example.com>。',
    '',
    '### 三级标题：列表示例',
    '',
    '- 无序列表第一项',
    '- 无序列表第二项',
    '  - 嵌套子项一',
    '  - 嵌套子项二',
    '- 无序列表第三项',
    '',
    '1. 有序列表第一项',
    '2. 有序列表第二项',
    '3. 有序列表第三项',
    '',
    '#### 四级标题：任务列表',
    '',
    '- [x] 已完成：写完初稿',
    '- [x] 已完成：选好配图',
    '- [ ] 待办：复制到公众号后台发布',
    '',
    '## 代码块示例',
    '',
    '```js',
    'function hello(name) {',
    '  // 下面的 <script> 会被转义，不会执行',
    '  return "Hello, " + name + "!";',
    '}',
    '```',
    '',
    '## 表格示例',
    '',
    '| 功能 | 说明 | 状态 |',
    '| :--- | :---: | ---: |',
    '| 主题切换 | 4 套公众号主题 | 已完成 |',
    '| 一键复制 | 富文本直达剪贴板 | 已完成 |',
    '| 导出 HTML | 独立文件离线可看 | 进行中 |',
    '',
    '---',
    '',
    '排版完成，一键复制，粘贴到公众号编辑器即可发布。'
].join('\n');

function init() {
    $('mpf-src').addEventListener('input', scheduleRender);
    var btns = document.querySelectorAll('[data-mpf-theme]');
    for (var i = 0; i < btns.length; i++) {
        (function (b) {
            b.addEventListener('click', function () { setTheme(b.getAttribute('data-mpf-theme'), b); });
        })(btns[i]);
    }
    $('mpf-fontsize').addEventListener('change', function () {
        state.fontSize = parseInt(this.value, 10) || 16;
        doRender();
    });
    $('mpf-lineheight').addEventListener('change', function () {
        state.lineHeight = parseFloat(this.value) || 1.75;
        doRender();
    });
    var wb = document.querySelectorAll('[data-mpf-width]');
    for (var j = 0; j < wb.length; j++) {
        (function (b) {
            b.addEventListener('click', function () {
                state.width = b.getAttribute('data-mpf-width');
                for (var k = 0; k < wb.length; k++) wb[k].setAttribute('aria-pressed', wb[k] === b ? 'true' : 'false');
                $('mpf-preview-box').style.maxWidth = state.width === 'phone' ? '375px' : 'none';
                $('mpf-preview-box').style.margin = state.width === 'phone' ? '0 auto' : '0';
            });
        })(wb[j]);
    }
    $('mpf-copy').addEventListener('click', copyRichText);
    $('mpf-export-html').addEventListener('click', exportHtml);
    $('mpf-export-md').addEventListener('click', exportMd);
    $('mpf-import').addEventListener('click', function () { $('mpf-import-file').click(); });
    $('mpf-import-file').addEventListener('change', function () { importMd(this.files[0]); });
    $('mpf-sample').addEventListener('click', function () {
        $('mpf-src').value = SAMPLE_MD;
        doRender();
        toast('✅ 示例文章已载入，覆盖全部分支语法');
    });
    $('mpf-clear').addEventListener('click', function () {
        if (!$('mpf-src').value || confirm('确定清空源码编辑区吗？')) {
            $('mpf-src').value = '';
            doRender();
        }
    });
    doRender();
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        escapeHtml: escapeHtml, sanitizeUrl: sanitizeUrl, renderInline: renderInline,
        parseBlocks: parseBlocks, renderMarkdown: renderMarkdown, htmlToText: htmlToText,
        THEMES: THEMES, SAMPLE_MD: SAMPLE_MD
    };
}

})();
