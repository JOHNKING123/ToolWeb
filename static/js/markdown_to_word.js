/* Markdown 转 Word —— 自研 Markdown 解析 → HTML 实时预览 → 自研 OOXML docx 拼装
 * 零依赖、零后端、零上传：解析/预览/打包/下载全部在浏览器本地完成。*/
(function () {
'use strict';

/* ================= 基础工具 ================= */
function $(id) { return document.getElementById(id); }
function escXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function strToU8(s) { return new TextEncoder().encode(s); }
function stamp() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
        p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

/* ================= CRC32 ================= */
var CRC_TABLE = (function () {
    var t = new Uint32Array(256), n, k, c;
    for (n = 0; n < 256; n++) {
        c = n;
        for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();
function crc32(u8) {
    var c = 0xFFFFFFFF, i;
    for (i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

/* ================= 最小 zip 打包（stored，无压缩） ================= */
function zipStore(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0, i, f;
    function pushU32(v) { var b = new DataView(new ArrayBuffer(4)); b.setUint32(0, v, true); parts.push(new Uint8Array(b.buffer)); }
    function pushU16(v) { var b = new DataView(new ArrayBuffer(2)); b.setUint16(0, v, true); parts.push(new Uint8Array(b.buffer)); }
    for (i = 0; i < files.length; i++) {
        f = files[i];
        var nameU8 = enc.encode(f.name), data = f.data, crc = crc32(data);
        pushU32(0x04034b50); pushU16(20); pushU16(0x0800); pushU16(0); pushU16(0);
        pushU16(0); pushU32(crc); pushU32(data.length); pushU32(data.length);
        pushU16(nameU8.length); pushU16(0);
        parts.push(nameU8); parts.push(data);
        central.push({ nameU8: nameU8, crc: crc, size: data.length, offset: offset });
        offset += 30 + nameU8.length + data.length;
    }
    var cdStart = offset, cdSize = 0, c;
    for (i = 0; i < central.length; i++) {
        c = central[i];
        pushU32(0x02014b50); pushU16(20); pushU16(20); pushU16(0x0800);
        pushU16(0); pushU16(0); pushU16(0); pushU32(c.crc);
        pushU32(c.size); pushU32(c.size); pushU16(c.nameU8.length);
        pushU16(0); pushU16(0); pushU16(0); pushU16(0); pushU32(0);
        pushU32(c.offset);
        parts.push(c.nameU8);
        cdSize += 46 + c.nameU8.length;
    }
    pushU32(0x06054b50); pushU16(0); pushU16(0);
    pushU16(central.length); pushU16(central.length);
    pushU32(cdSize); pushU32(cdStart); pushU16(0);
    var total = 0, p;
    for (p = 0; p < parts.length; p++) total += parts[p].length;
    var out = new Uint8Array(total), pos = 0;
    for (p = 0; p < parts.length; p++) { out.set(parts[p], pos); pos += parts[p].length; }
    return out;
}

/* ================= 图片（data URL）解析 ================= */
function parseDataUrl(src) {
    var m = /^\s*data:image\/(png|jpe?g|gif);base64,([A-Za-z0-9+/=\r\n]+)\s*$/.exec(String(src));
    if (!m) return null;
    var ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
    try {
        var bin = Uint8Array.from(atob(m[2].replace(/\s+/g, '')), function (ch) { return ch.charCodeAt(0); });
        return { ext: ext, data: bin };
    } catch (e) { return null; }
}
function pngSize(u8) {
    if (u8.length < 24) return null;
    return { w: (u8[16] << 24) | (u8[17] << 16) | (u8[18] << 8) | u8[19],
             h: (u8[20] << 24) | (u8[21] << 16) | (u8[22] << 8) | u8[23] };
}
function gifSize(u8) {
    if (u8.length < 10) return null;
    return { w: u8[6] | (u8[7] << 8), h: u8[8] | (u8[9] << 8) };
}
function jpegSize(u8) {
    var i = 2;
    while (i + 8 < u8.length) {
        if (u8[i] !== 0xFF) { i++; continue; }
        var mk = u8[i + 1];
        if (mk === 0xC0 || mk === 0xC1 || mk === 0xC2) {
            return { h: (u8[i + 5] << 8) | u8[i + 6], w: (u8[i + 7] << 8) | u8[i + 8] };
        }
        if (mk === 0xD8 || mk === 0xD9 || (mk >= 0xD0 && mk <= 0xD7)) { i += 2; continue; }
        var len = (u8[i + 2] << 8) | u8[i + 3];
        if (len < 2) break;
        i += 2 + len;
    }
    return null;
}
function imageDisplaySize(p) {
    var s = null;
    if (p.ext === 'png') s = pngSize(p.data);
    else if (p.ext === 'gif') s = gifSize(p.data);
    else s = jpegSize(p.data);
    if (!s || !s.w || !s.h || s.w <= 0 || s.h <= 0) s = { w: 480, h: 360 };
    var sc = Math.min(1, 520 / s.w); // 最宽 520px，保持宽高比
    return { w: Math.round(s.w * sc), h: Math.round(s.h * sc) };
}

/* ================= 自研 Markdown 解析 =================
 * 块：标题/段落/列表（含嵌套）/引用/代码围栏/表格/分隔线/图片块
 * 行内：加粗/斜体/删除线/行内代码/链接/图片/硬换行                  */

/* ---- 行内 ---- */
var ESC_PUNCT = '\\\\`*_{}[]()#+\\-.!|~>';
function parseInline(s) {
    var tokens = [], buf = '', i = 0, m, rest;
    function flush() { if (buf) { tokens.push({ t: 'text', v: buf }); buf = ''; } }
    while (i < s.length) {
        rest = s.slice(i);
        if (s[i] === '\\' && i + 1 < s.length && ESC_PUNCT.indexOf(s[i + 1]) >= 0) {
            buf += s[i + 1]; i += 2; continue;
        }
        if ((m = rest.match(/^(`+)([\s\S]*?)\1/))) { flush(); tokens.push({ t: 'code', v: m[2] }); i += m[0].length; continue; }
        if ((m = rest.match(/^!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/))) {
            flush(); tokens.push({ t: 'img', alt: m[1], src: m[2] }); i += m[0].length; continue;
        }
        if ((m = rest.match(/^\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/))) {
            flush(); tokens.push({ t: 'link', text: parseInline(m[1]), href: m[2] }); i += m[0].length; continue;
        }
        if ((m = rest.match(/^<((?:https?|ftp|mailto):[^<>\s]+)>/))) {
            flush(); tokens.push({ t: 'link', text: [{ t: 'text', v: m[1] }], href: m[1] }); i += m[0].length; continue;
        }
        if ((m = rest.match(/^(\*\*|__)(.+?)\1/))) { flush(); tokens.push({ t: 'b', text: parseInline(m[2]) }); i += m[0].length; continue; }
        if ((m = rest.match(/^\*([^*]+?)\*/))) { flush(); tokens.push({ t: 'i', text: parseInline(m[1]) }); i += m[0].length; continue; }
        if ((m = rest.match(/^_([^_]+?)_/))) { flush(); tokens.push({ t: 'i', text: parseInline(m[1]) }); i += m[0].length; continue; }
        if ((m = rest.match(/^~~(.+?)~~/))) { flush(); tokens.push({ t: 'del', text: parseInline(m[1]) }); i += m[0].length; continue; }
        if ((m = rest.match(/^https?:\/\/[^\s<>\[\]()]+/))) {
            var u = m[0].replace(/[.,;:!?）】》"']+$/, '');
            flush(); tokens.push({ t: 'link', text: [{ t: 'text', v: u }], href: u }); i += u.length; continue;
        }
        buf += s[i]; i++;
    }
    flush();
    return tokens;
}

/* ---- 块 ---- */
function isTableDelim(line) {
    var cells = line.trim().replace(/^\||\|$/g, '').split('|');
    return cells.length > 0 && cells.every(function (c) { return /^:?-+:?$/.test(c.trim()); });
}
function splitRow(line) {
    var s = line.trim();
    if (s.charAt(0) === '|') s = s.slice(1);
    if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
    return s.split(/(?<!\\)\|/).map(function (c) { return c.replace(/\\\|/g, '|').trim(); });
}
function alignOf(cell) {
    cell = cell.trim();
    if (/^:-+:$/.test(cell)) return 'center';
    if (/^-+:$/.test(cell)) return 'right';
    return 'left';
}
var HR_RE = /^\s{0,3}((\*(\s*\*){2,})|(-(\s*-){2,})|(_(\s*_){2,}))\s*$/;
var LIST_RE = /^[ ]{0,3}([-+*]|\d{1,2}[.)])\s+\S/;
function isBlockStart(line, i, lines) {
    return /^\s*```/.test(line) || /^(#{1,6})\s/.test(line) || /^\s{0,3}>/.test(line) ||
        HR_RE.test(line) || LIST_RE.test(line) ||
        (line.indexOf('|') >= 0 && i + 1 < lines.length && isTableDelim(lines[i + 1]));
}
function makeParagraph(pl) {
    var tokens = [];
    pl.forEach(function (ln, idx) {
        tokens.push.apply(tokens, parseInline(ln));
        if (idx < pl.length - 1) tokens.push({ t: 'br', hard: / {2,}\s*$/.test(ln) || /\\\s*$/.test(ln) });
    });
    var core = tokens.filter(function (t) { return !(t.t === 'text' && /^\s*$/.test(t.v)); });
    if (core.length === 1 && core[0].t === 'img') {
        return { type: 'image', alt: core[0].alt, src: core[0].src };
    }
    return { type: 'paragraph', inline: tokens };
}
function parseList(lines, pos) {
    var first = lines[pos].match(/^([ ]*)([-+*]|\d{1,2}[.)])\s+(.*)$/);
    var indent = first[1].length;
    var ordered = /^\d/.test(first[2]);
    var list = { type: ordered ? 'ol' : 'ul', start: ordered ? parseInt(first[2], 10) : 1, items: [] };
    var i = pos, m, content, cb;
    while (i < lines.length) {
        m = lines[i].match(/^([ ]*)([-+*]|\d{1,2}[.)])\s+(.*)$/);
        if (!m) break;
        var ind = m[1].replace(/\t/g, '    ').length;
        if (ind < indent) break;
        if (ind > indent) {
            var sub = parseList(lines, i);
            var last = list.items[list.items.length - 1];
            if (last) last.children = sub.list;
            i = sub.next;
            continue;
        }
        content = m[3];
        cb = content.match(/^\[([ xX])\]\s+/);
        if (cb) content = (cb[1] === ' ' ? '☐ ' : '☑ ') + content.slice(cb[0].length);
        list.items.push({ inline: parseInline(content), children: null });
        i++;
    }
    return { list: list, next: i };
}
function parseMarkdown(src) {
    var lines = String(src).replace(/\r\n?/g, '\n').split('\n');
    var blocks = [], i = 0, n = lines.length, m, line;
    while (i < n) {
        line = lines[i];
        if (/^\s*$/.test(line)) { i++; continue; }
        if ((m = line.match(/^\s*```(\S*)\s*$/))) {           // 代码围栏
            var lang = m[1] || '', code = [];
            i++;
            while (i < n && !/^\s*```\s*$/.test(lines[i])) { code.push(lines[i]); i++; }
            i++;
            blocks.push({ type: 'code', lang: lang, text: code.join('\n') });
            continue;
        }
        if (/^ {4}\S/.test(line)) {                            // 缩进代码块
            var code2 = [];
            while (i < n && (/^ {4}/.test(lines[i]) || /^\s*$/.test(lines[i]))) { code2.push(lines[i].replace(/^ {4}/, '')); i++; }
            blocks.push({ type: 'code', lang: '', text: code2.join('\n').replace(/\n+$/, '') });
            continue;
        }
        if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {  // ATX 标题
            blocks.push({ type: 'heading', level: m[1].length, inline: parseInline(m[2]) });
            i++; continue;
        }
        if (/^\s{0,3}>/.test(line)) {                          // 引用
            var q = [];
            while (i < n && /^\s{0,3}>/.test(lines[i])) { q.push(lines[i].replace(/^\s{0,3}>\s?/, '')); i++; }
            blocks.push({ type: 'blockquote', blocks: parseMarkdown(q.join('\n')) });
            continue;
        }
        if (HR_RE.test(line)) { blocks.push({ type: 'hr' }); i++; continue; }  // 分隔线
        if (LIST_RE.test(line)) {                             // 列表
            var sub = parseList(lines, i);
            blocks.push(sub.list); i = sub.next; continue;
        }
        if (line.indexOf('|') >= 0 && i + 1 < n && isTableDelim(lines[i + 1])) {  // 表格
            var header = splitRow(line);
            var aligns = line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(alignOf);
            var rows = [];
            i += 2;
            while (i < n && lines[i].indexOf('|') >= 0 && !/^\s*$/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
            blocks.push({ type: 'table', header: header, aligns: aligns, rows: rows });
            continue;
        }
        var pl = [line];                                      // 段落（含 setext 一级标题）
        i++;
        if (i < n && /^=+\s*$/.test(lines[i])) {
            blocks.push({ type: 'heading', level: 1, inline: parseInline(pl.join(' ').trim()) });
            i++; continue;
        }
        while (i < n && !/^\s*$/.test(lines[i]) && !isBlockStart(lines[i], i, lines)) { pl.push(lines[i]); i++; }
        blocks.push(makeParagraph(pl));
    }
    return blocks;
}

/* ================= HTML 预览渲染 ================= */
function renderInlineHtml(tokens) {
    return tokens.map(function (tk) {
        switch (tk.t) {
            case 'text': return escXml(tk.v);
            case 'b': return '<strong>' + renderInlineHtml(tk.text) + '</strong>';
            case 'i': return '<em>' + renderInlineHtml(tk.text) + '</em>';
            case 'del': return '<del>' + renderInlineHtml(tk.text) + '</del>';
            case 'code': return '<code>' + escXml(tk.v) + '</code>';
            case 'br': return tk.hard ? '<br>' : ' ';
            case 'link': return '<a href="' + escXml(tk.href) + '" target="_blank" rel="noopener">' + renderInlineHtml(tk.text) + '</a>';
            case 'img': return '<img src="' + escXml(tk.src) + '" alt="' + escXml(tk.alt) + '" loading="lazy">';
            default: return '';
        }
    }).join('');
}
function listToHtml(l) {
    var h = '<' + l.type + (l.type === 'ol' && l.start !== 1 ? ' start="' + l.start + '"' : '') + '>';
    l.items.forEach(function (it) {
        h += '<li>' + renderInlineHtml(it.inline) + (it.children ? listToHtml(it.children) : '') + '</li>';
    });
    return h + '</' + l.type + '>';
}
function tableToHtml(t) {
    var h = '<div class="m2w-tblwrap"><table><thead><tr>';
    t.header.forEach(function (c, i) {
        h += '<th' + (t.aligns[i] && t.aligns[i] !== 'left' ? ' style="text-align:' + t.aligns[i] + '"' : '') + '>' + renderInlineHtml(parseInline(c)) + '</th>';
    });
    h += '</tr></thead><tbody>';
    t.rows.forEach(function (row) {
        h += '<tr>';
        for (var c = 0; c < t.header.length; c++) {
            var cell = row[c] || '';
            h += '<td' + (t.aligns[c] && t.aligns[c] !== 'left' ? ' style="text-align:' + t.aligns[c] + '"' : '') + '>' + renderInlineHtml(parseInline(cell)) + '</td>';
        }
        h += '</tr>';
    });
    return h + '</tbody></table></div>';
}
function blockToHtml(b) {
    switch (b.type) {
        case 'heading': return '<h' + b.level + '>' + renderInlineHtml(b.inline) + '</h' + b.level + '>';
        case 'paragraph': return '<p>' + renderInlineHtml(b.inline) + '</p>';
        case 'code': return '<pre><code>' + escXml(b.text) + '</code></pre>';
        case 'hr': return '<hr>';
        case 'blockquote': return '<blockquote>' + b.blocks.map(blockToHtml).join('') + '</blockquote>';
        case 'table': return tableToHtml(b);
        case 'ul': case 'ol': return listToHtml(b);
        case 'image': return '<p class="m2w-img"><img src="' + escXml(b.src) + '" alt="' + escXml(b.alt) + '" loading="lazy"></p>';
        default: return '';
    }
}
function renderPreviewHtml(blocks) {
    return blocks.map(blockToHtml).join('');
}

/* ================= OOXML docx 拼装 ================= */
var W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
var CONTENT_TYPES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.open-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="png" ContentType="image/png"/>' +
    '<Default Extension="jpg" ContentType="image/jpeg"/>' +
    '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
    '<Default Extension="gif" ContentType="image/gif"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
    '</Types>';
var PKG_RELS =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>';
var RFONTS = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="宋体" w:cs="Calibri"/>';
var STYLES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="' + W_NS + '">' +
    '<w:docDefaults><w:rPrDefault><w:rPr>' + RFONTS + '<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr>' + RFONTS + '<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
    '<w:pPr><w:keepNext/><w:spacing w:before="360" w:after="160"/></w:pPr><w:rPr><w:b/><w:color w:val="1F4E79"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
    '<w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="2E75B6"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
    '<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/></w:pPr><w:rPr><w:b/><w:color w:val="2E75B6"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
    '<w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="1F4E79"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading5"><w:name w:val="heading 5"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
    '<w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="404040"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading6"><w:name w:val="heading 6"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
    '<w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="595959"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
    '<w:pPr><w:ind w:left="360"/><w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="9D9D9D"/></w:pBdr></w:pPr>' +
    '<w:rPr><w:i/><w:color w:val="595959"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="CodeBlock"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' +
    '<w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:after="0"/><w:ind w:left="120" w:right="120"/></w:pPr>' +
    '<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="宋体" w:cs="Consolas"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/></w:style>' +
    '<w:style w:type="character" w:styleId="CodeChar"><w:name w:val="CodeChar"/><w:basedOn w:val="DefaultParagraphFont"/>' +
    '<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="宋体" w:cs="Consolas"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/></w:rPr></w:style>' +
    '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/>' +
    '<w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>' +
    '</w:styles>';

function buildNumbering(ctx) {
    var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="' + W_NS + '">';
    xml += '<w:abstractNum w:abstractNumId="0">';
    var fmts = ['decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter', 'lowerRoman'];
    var l, k, txt;
    for (l = 0; l < 9; l++) {
        txt = '%1.';
        for (k = 1; k <= l; k++) txt += '%' + (k + 1) + '.';
        xml += '<w:lvl w:ilvl="' + l + '"><w:start w:val="1"/><w:numFmt w:val="' + fmts[l] + '"/>' +
            '<w:lvlText w:val="' + txt + '"/><w:lvlJc w:val="left"/>' +
            '<w:pPr><w:ind w:left="' + (360 * (l + 1)) + '" w:hanging="360"/></w:pPr></w:lvl>';
    }
    xml += '</w:abstractNum><w:abstractNum w:abstractNumId="1">';
    for (l = 0; l < 9; l++) {
        xml += '<w:lvl w:ilvl="' + l + '"><w:start w:val="1"/><w:numFmt w:val="bullet"/>' +
            '<w:lvlText w:val="&#xF0B7;"/><w:lvlJc w:val="left"/>' +
            '<w:pPr><w:ind w:left="' + (360 * (l + 1)) + '" w:hanging="360"/>' +
            '<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr></w:pPr></w:lvl>';
    }
    xml += '</w:abstractNum>';
    ctx.numDefs.forEach(function (d) {
        xml += '<w:num w:numId="' + d.numId + '"><w:abstractNumId w:val="' + d.abs + '"/></w:num>';
    });
    return xml + '</w:numbering>';
}

function buildDocRels(ctx) {
    var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>';
    var n = 3;
    ctx.links.forEach(function (u) {
        xml += '<Relationship Id="rId' + (n++) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="' + escXml(u) + '" TargetMode="External"/>';
    });
    ctx.images.forEach(function (im, i) {
        xml += '<Relationship Id="rId' + (n++) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image' + (i + 1) + '.' + im.ext + '"/>';
    });
    return xml + '</Relationships>';
}

/* ---- 行内 token 展平为 docx run 叶子 ---- */
function flattenInline(tokens, props, link) {
    var out = [];
    tokens.forEach(function (tk) {
        if (tk.t === 'text' || tk.t === 'code') {
            out.push({ text: tk.v, props: props.slice(), code: tk.t === 'code', link: link || null });
        } else if (tk.t === 'br') {
            out.push({ br: true, hard: tk.hard });
        } else if (tk.t === 'img') {
            out.push({ img: tk });
        } else if (tk.t === 'link') {
            out.push.apply(out, flattenInline(tk.text, props, tk.href));
        } else if (tk.t === 'b' || tk.t === 'i' || tk.t === 'del') {
            out.push.apply(out, flattenInline(tk.text, props.concat([tk.t]), link));
        }
    });
    return out;
}
function leafRunXml(leaf, ctx) {
    if (leaf.br) return leaf.hard ? '<w:r><w:br/></w:r>' : '<w:r><w:t xml:space="preserve"> </w:t></w:r>';
    var rpr = '';
    leaf.props.forEach(function (p) {
        rpr += p === 'b' ? '<w:b/>' : (p === 'i' ? '<w:i/>' : '<w:strike/>');
    });
    if (leaf.code) rpr += '<w:rStyle w:val="CodeChar"/>';
    if (leaf.link) rpr += '<w:rStyle w:val="Hyperlink"/>';
    var r = '<w:r>' + (rpr ? '<w:rPr>' + rpr + '</w:rPr>' : '') +
        '<w:t xml:space="preserve">' + escXml(leaf.text) + '</w:t></w:r>';
    if (leaf.link) {
        var idx = ctx.linkMap.get(leaf.link);
        if (idx === undefined) { idx = ctx.links.length; ctx.linkMap.set(leaf.link, idx); ctx.links.push(leaf.link); }
        return '<w:hyperlink RIDL' + idx + '>' + r + '</w:hyperlink>';
    }
    return r;
}
function inlineRunsXml(tokens, ctx) {
    return flattenInline(tokens, [], null).map(function (leaf) { return leafRunXml(leaf, ctx); }).join('');
}
/* 段落按图片切分为段落/图片块（行内图片在 docx 里导出为独立居中图片段落） */
function segmentsFromInline(tokens) {
    var segs = [], cur = [];
    tokens.forEach(function (tk) {
        if (tk.t === 'img') {
            if (cur.length) { segs.push({ type: 'paragraph', inline: cur }); cur = []; }
            segs.push({ type: 'image', alt: tk.alt, src: tk.src });
        } else cur.push(tk);
    });
    if (cur.length) segs.push({ type: 'paragraph', inline: cur });
    return segs;
}
function paraXml(runsXml, opts) {
    opts = opts || {};
    var ppr = '';
    if (opts.style) ppr += '<w:pStyle w:val="' + opts.style + '"/>';
    if (opts.align) ppr += '<w:jc w:val="' + opts.align + '"/>';
    if (opts.num) ppr += '<w:numPr><w:ilvl w:val="' + Math.min(opts.num.ilvl, 8) + '"/><w:numId w:val="' + opts.num.numId + '"/></w:numPr>';
    if (opts.pBdr) ppr += opts.pBdr;
    return '<w:p>' + (ppr ? '<w:pPr>' + ppr + '</w:pPr>' : '') + runsXml + '</w:p>';
}
function imageBlockXml(img, ctx) {
    var p = parseDataUrl(img.src);
    if (!p) {
        ctx.skippedImages++;
        return paraXml('<w:r><w:rPr><w:i/><w:color w:val="9CA3AF"/></w:rPr>' +
            '<w:t xml:space="preserve">[图片未嵌入：仅支持 base64 本地图片' + (img.alt ? '（' + escXml(img.alt) + '）' : '') + ']</w:t></w:r>');
    }
    var idx = ctx.images.length;
    ctx.images.push(p);
    var size = imageDisplaySize(p), cx = size.w * 9525, cy = size.h * 9525, picId = idx + 1;
    return '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing>' +
        '<wp:inline distT="0" distB="0" distL="0" distR="0">' +
        '<wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
        '<wp:docPr id="' + picId + '" name="图片' + picId + '"/>' +
        '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
        '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
        '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
        '<pic:nvPicPr><pic:cNvPr id="' + picId + '" name="图片' + picId + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
        '<pic:blipFill><a:blip r:embed="RIDI' + idx + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
        '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}
function listBlockXml(list, ctx, ilvl, numId) {
    var xml = '';
    list.items.forEach(function (item) {
        segmentsFromInline(item.inline).forEach(function (seg) {
            if (seg.type === 'image') { xml += imageBlockXml(seg, ctx); return; }
            xml += paraXml(inlineRunsXml(seg.inline, ctx), { style: 'ListParagraph', num: { ilvl: ilvl, numId: numId } });
        });
        if (item.children) xml += listBlockXml(item.children, ctx, ilvl + 1, numId);
    });
    return xml;
}
function tableBlockXml(tbl, ctx) {
    var ncols = Math.max.apply(null, [tbl.header.length].concat(tbl.rows.map(function (r) { return r.length; })));
    if (ncols < 1) ncols = 1;
    var colW = Math.floor(8800 / ncols);
    var borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (b) {
        return '<w:' + b + ' w:val="single" w:sz="4" w:space="0" w:color="9CA3AF"/>';
    }).join('');
    var xml = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>' + borders +
        '</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>';
    for (var c = 0; c < ncols; c++) xml += '<w:gridCol w:w="' + colW + '"/>';
    xml += '</w:tblGrid>';
    function rowXml(cells, isHeader) {
        var r = '<w:tr>';
        for (var c2 = 0; c2 < ncols; c2++) {
            var cell = cells[c2] || '';
            var align = tbl.aligns[c2] || 'left';
            var jc = align === 'center' ? 'center' : (align === 'right' ? 'right' : 'left');
            var leaves = flattenInline(parseInline(cell), isHeader ? ['b'] : [], null);
            r += '<w:tc><w:tcPr><w:tcW w:w="' + colW + '" w:type="dxa"/>' +
                (isHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>' : '') +
                '</w:tcPr>' + paraXml(leaves.map(function (lf) { return leafRunXml(lf, ctx); }).join(''), { align: jc }) + '</w:tc>';
        }
        return r + '</w:tr>';
    }
    xml += rowXml(tbl.header, true);
    tbl.rows.forEach(function (row) { xml += rowXml(row, false); });
    return xml + '</w:tbl>';
}
function blockquoteBlockXml(bq, ctx) {
    return bq.blocks.map(function (x) {
        if (x.type === 'paragraph') {
            return segmentsFromInline(x.inline).map(function (seg) {
                return seg.type === 'image' ? imageBlockXml(seg, ctx) :
                    paraXml(inlineRunsXml(seg.inline, ctx), { style: 'Quote' });
            }).join('');
        }
        if (x.type === 'blockquote') return blockquoteBlockXml(x, ctx);
        return blockToDocxXml(x, ctx);
    }).join('');
}
function blockToDocxXml(b, ctx) {
    switch (b.type) {
        case 'heading':
            return paraXml(inlineRunsXml(b.inline, ctx), { style: 'Heading' + Math.min(b.level, 6) });
        case 'paragraph':
            return segmentsFromInline(b.inline).map(function (seg) {
                return seg.type === 'image' ? imageBlockXml(seg, ctx) : paraXml(inlineRunsXml(seg.inline, ctx));
            }).join('');
        case 'image': return imageBlockXml(b, ctx);
        case 'code':
            return b.text.split('\n').map(function (ln) {
                return paraXml('<w:r><w:t xml:space="preserve">' + escXml(ln) + '</w:t></w:r>', { style: 'CodeBlock' });
            }).join('');
        case 'hr':
            return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="9CA3AF"/></w:pBdr></w:pPr></w:p>';
        case 'blockquote': return blockquoteBlockXml(b, ctx);
        case 'table': return tableBlockXml(b, ctx);
        case 'ul': case 'ol': {
            var numId = ctx.nextNumId++;
            ctx.numDefs.push({ numId: numId, abs: b.type === 'ol' ? 0 : 1 });
            return listBlockXml(b, ctx, 0, numId);
        }
        default: return '';
    }
}

/* ---- docx 总装 ---- */
var DOC_HEAD =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="' + W_NS + '" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
    '<w:body>';
var DOC_TAIL =
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800"/></w:sectPr>' +
    '</w:body></w:document>';
function buildDocx(blocks) {
    var ctx = { links: [], linkMap: new Map(), images: [], numDefs: [], nextNumId: 3, skippedImages: 0 };
    var body = blocks.map(function (b) { return blockToDocxXml(b, ctx); }).join('');
    body = body.replace(/RIDL(\d+)/g, function (m, i) { return 'r:id="rId' + (3 + (+i)) + '"'; })
               .replace(/RIDI(\d+)/g, function (m, i) { return 'rId' + (3 + ctx.links.length + (+i)); });
    var files = [
        { name: '[Content_Types].xml', data: strToU8(CONTENT_TYPES) },
        { name: '_rels/.rels', data: strToU8(PKG_RELS) },
        { name: 'word/document.xml', data: strToU8(DOC_HEAD + body + DOC_TAIL) },
        { name: 'word/styles.xml', data: strToU8(STYLES) },
        { name: 'word/numbering.xml', data: strToU8(buildNumbering(ctx)) },
        { name: 'word/_rels/document.xml.rels', data: strToU8(buildDocRels(ctx)) }
    ];
    ctx.images.forEach(function (im, i) {
        files.push({ name: 'word/media/image' + (i + 1) + '.' + im.ext, data: im.data });
    });
    return {
        zip: zipStore(files),
        stats: { links: ctx.links.length, images: ctx.images.length, skippedImages: ctx.skippedImages }
    };
}
function downloadBlob(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

/* ================= 示例文档 ================= */
var SAMPLE_IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAA8CAIAAAAiz+n/AAAAsUlEQVR4nO3YsQ2AMBAEQTqhI/qhVFJaoAFSQkcWXo108eo14W/7cY7vup/xKX+3rXj0imXQoFtl0KBbZdCgW2XQoFtl0KBbZdCgW2XQs6B/cke+DBp0qwwadKsMGnSrDBp0qwwadKsMGnSrDBp0qwwadKsMGnSrDBp0q+wfPakMGnSrDBp0qwwadKsMGnSrDBp0qwwadKsMGnSrDBp0qwwadKv8AvetVC+gkqXlAAAAAElFTkSuQmCC';
var SAMPLE = [
'# 项目周报（示例）',
'',
'这是 **Markdown 转 Word** 工具的示例文档，右侧实时预览，点「导出 .docx」即可下载 Word 文件。',
'',
'## 本周进展',
'',
'- 完成了需求评审，输出了 *第一版* 原型',
'- 修复了 ~~3~~ 5 个线上 bug',
'  - 其中 2 个是 P0，`hotfix` 已上线',
'- [x] 周报已发送  - [ ] 下周计划待补充',
'',
'## 数据概览',
'',
'1. 注册用户增长 **12.5%**',
'2. 付费转化率提升 2 个百分点',
'3. 详见下表：',
'',
'| 渠道 | 新增用户 | 转化率 |',
'|:-----|---------:|:------:|',
'| 自然搜索 | 12,480 | 3.2% |',
'| 社交媒体 | 8,215 | 2.8% |',
'| 老带新 | 3,907 | 5.1% |',
'',
'## 关键代码',
'',
'```python',
'def hello(name: str) -> str:',
'    return f"Hello, {name}!"  # 行内注释',
'```',
'',
'## 风险提示',
'',
'> 上线前务必完成全量回归测试。',
'>',
'> —— 技术负责人',
'',
'## 附图',
'',
'![示例图片](' + SAMPLE_IMG + ')',
'',
'更多信息见 [项目文档](https://example.com/docs) 与 <https://example.com/status>。',
'',
'---',
'',
'###### 备注：六级标题样式'
].join('\n');

/* ================= 界面逻辑 ================= */
var input = $('m2w-input'), preview = $('m2w-preview'), statusEl = $('m2w-status'), errorEl = $('m2w-error');
var timer = null, lastBlocks = [];
function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
    setTimeout(function () { errorEl.style.display = 'none'; }, 6000);
}
function setStatus(msg) { statusEl.textContent = msg || ''; }
function updateCount() { $('m2w-count').textContent = input.value.length; }
function scheduleRender() { clearTimeout(timer); timer = setTimeout(render, 250); }
function render() {
    updateCount();
    var src = input.value;
    if (!src.trim()) {
        preview.innerHTML = '<div class="m2w-empty">在左侧输入或粘贴 Markdown，右侧实时预览<br>支持标题 / 列表 / 表格 / 代码块 / 引用 / 图片等</div>';
        lastBlocks = [];
        return;
    }
    try {
        lastBlocks = parseMarkdown(src);
        preview.innerHTML = renderPreviewHtml(lastBlocks);
        errorEl.style.display = 'none';
    } catch (e) {
        showError('解析失败：' + e.message);
    }
}
input.addEventListener('input', scheduleRender);

/* 导入 .md（FileReader 本地读取） */
$('m2w-upload').addEventListener('click', function () { $('m2w-file').click(); });
$('m2w-upload').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('m2w-file').click(); }
});
['dragover', 'dragenter'].forEach(function (ev) {
    $('m2w-upload').addEventListener(ev, function (e) { e.preventDefault(); $('m2w-upload').classList.add('dragover'); });
});
['dragleave', 'drop'].forEach(function (ev) {
    $('m2w-upload').addEventListener(ev, function (e) { e.preventDefault(); $('m2w-upload').classList.remove('dragover'); });
});
$('m2w-upload').addEventListener('drop', function (e) {
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) readFile(f);
});
$('m2w-file').addEventListener('change', function () {
    if (this.files && this.files[0]) readFile(this.files[0]);
    this.value = '';
});
function readFile(f) {
    var r = new FileReader();
    r.onload = function () {
        input.value = String(r.result || '');
        render();
        setStatus('已导入「' + f.name + '」，共 ' + input.value.length + ' 字符');
    };
    r.onerror = function () { showError('文件读取失败，请重试'); };
    r.readAsText(f);
}

/* 示例 / 清空 / 导出 .md */
$('m2w-sample').addEventListener('click', function () {
    input.value = SAMPLE; render(); setStatus('已载入示例文档，可直接导出 .docx 试试');
});
$('m2w-clear').addEventListener('click', function () {
    input.value = ''; render(); setStatus('');
});
$('m2w-export-md').addEventListener('click', function () {
    if (!input.value.trim()) { showError('编辑区是空的，没有可导出的内容'); return; }
    downloadBlob(new Blob([input.value], { type: 'text/markdown;charset=utf-8' }), 'markdown-' + stamp() + '.md');
    setStatus('已导出 .md 文件');
});

/* 导出 .docx */
$('m2w-export-docx').addEventListener('click', function () {
    if (!lastBlocks.length) { showError('先在左侧输入或粘贴 Markdown 内容'); return; }
    var btn = $('m2w-export-docx');
    btn.disabled = true;
    setStatus('正在生成 Word 文档…');
    setTimeout(function () {
        try {
            var t0 = performance.now();
            var ret = buildDocx(lastBlocks);
            var blob = new Blob([ret.zip], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            downloadBlob(blob, 'markdown转word-' + stamp() + '.docx');
            var st = ret.stats;
            setStatus('导出成功（' + Math.round(performance.now() - t0) + 'ms）：嵌入图片 ' + st.images + ' 张' +
                (st.skippedImages ? '、跳过非本地图片 ' + st.skippedImages + ' 张' : '') +
                '、超链接 ' + st.links + ' 个，文件已开始下载');
        } catch (e) {
            showError('生成失败：' + e.message);
        }
        btn.disabled = false;
    }, 30);
});

render();
})();
