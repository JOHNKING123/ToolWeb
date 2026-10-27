/* .env 解析与校验器 - 纯前端逐行解析校验 + 规整输出
 * 数据只在浏览器里处理：零第三方依赖、无任何后端调用、无网络请求（脚本内零 fetch/XHR）。
 * 单行解析口径：双引号值不做多行展开，未闭合引号判非法行；不读取真实运行环境变量，
 * 不验证密钥有效性。浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；
 * Node 自测：module.exports 暴露纯函数（parseEnv / formatEnv）。
 */
(function () {
'use strict';

var KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/* 双引号值解码：仅解码 \" \\ \n \r \t，其余反斜杠序列原样保留 */
function decodeDoubleQuoted(raw) {
    var out = '';
    for (var i = 0; i < raw.length; i++) {
        var ch = raw.charAt(i);
        if (ch === '\\' && i + 1 < raw.length) {
            var nxt = raw.charAt(i + 1);
            if (nxt === 'n') { out += '\n'; i++; }
            else if (nxt === 'r') { out += '\r'; i++; }
            else if (nxt === 't') { out += '\t'; i++; }
            else if (nxt === '"' || nxt === '\\') { out += nxt; i++; }
            else { out += ch; }
        } else {
            out += ch;
        }
    }
    return out;
}

/* 找双引号闭合位置：跳过反斜杠转义的下一个字符 */
function findClosingDoubleQuote(s, from) {
    for (var i = from; i < s.length; i++) {
        if (s.charAt(i) === '\\') { i++; continue; }
        if (s.charAt(i) === '"') return i;
    }
    return -1;
}

/* 无引号值：' #' 截断 inline 注释（# 前须有空白），值内无空白的 # 保留 */
function stripInlineComment(value) {
    for (var i = 0; i < value.length; i++) {
        if (value.charAt(i) === '#' && i > 0) {
            var prev = value.charAt(i - 1);
            if (prev === ' ' || prev === '\t') {
                return value.slice(0, i).replace(/[ \t]+$/, '');
            }
        }
    }
    return value;
}

/* 解析一行已剥离 export 前缀的内容，返回 {key, value} 或 {error} */
function parseValuePart(rawValue) {
    var s = rawValue.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
    if (s.charAt(0) === '"') {
        var end = findClosingDoubleQuote(s, 1);
        if (end === -1) return { error: '双引号值未闭合' };
        var rest = s.slice(end + 1).replace(/^[ \t]+/, '');
        if (rest !== '' && rest.charAt(0) !== '#') {
            return { error: '双引号闭合后有残留字符' };
        }
        return { value: decodeDoubleQuoted(s.slice(1, end)) };
    }
    if (s.charAt(0) === "'") {
        var endQ = s.indexOf("'", 1);
        if (endQ === -1) return { error: '单引号值未闭合' };
        var restQ = s.slice(endQ + 1).replace(/^[ \t]+/, '');
        if (restQ !== '' && restQ.charAt(0) !== '#') {
            return { error: '单引号闭合后有残留字符' };
        }
        return { value: s.slice(1, endQ) };
    }
    return { value: stripInlineComment(s) };
}

function parseEnv(text) {
    text = String(text == null ? '' : text);
    /* 尾换行不另算一行："A=1\n" 为 1 行而非 2 行；空文本为 0 行 */
    var lines = text === '' ? [] : text.split('\n');
    if (text !== '' && text.charAt(text.length - 1) === '\n') lines.pop();
    var issues = [];
    var order = [];
    var byKey = {};
    var skipped = 0;
    var invalid = 0;

    lines.forEach(function (rawLine, idx) {
        var lineNo = idx + 1;
        var line = rawLine.replace(/\r$/, '');
        var trimmed = line.replace(/^[ \t]+/, '');
        if (trimmed === '' || trimmed.charAt(0) === '#') {
            skipped++;
            return;
        }
        var body = trimmed;
        if (/^export[ \t]+/.test(body)) {
            body = body.replace(/^export[ \t]+/, '');
            if (body === '' || body.charAt(0) === '#') {
                invalid++;
                issues.push({ line: lineNo, type: 'error', kind: '非法行',
                    message: 'export 后缺少合法的 KEY=VALUE' });
                return;
            }
        }
        var eq = body.indexOf('=');
        if (eq === -1) {
            invalid++;
            issues.push({ line: lineNo, type: 'error', kind: '非法行',
                message: '缺少 = 分隔符，不是合法的 KEY=VALUE 行' });
            return;
        }
        var key = body.slice(0, eq).replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
        if (!KEY_RE.test(key)) {
            invalid++;
            issues.push({ line: lineNo, type: 'error', kind: '非法行',
                message: '键名非法，应为字母或下划线开头、仅含字母数字下划线' });
            return;
        }
        var parsed = parseValuePart(body.slice(eq + 1));
        if (parsed.error) {
            invalid++;
            issues.push({ line: lineNo, type: 'error', kind: '非法行', message: parsed.error });
            return;
        }
        var value = parsed.value;
        var existing = byKey[key];
        if (existing) {
            existing.value = value;
            existing.lastLine = lineNo;
            existing.duplicate = true;
            issues.push({ line: lineNo, type: 'warning', kind: '重复键',
                message: '键 ' + key + ' 重复出现（首次在第 ' + existing.firstLine +
                    ' 行，本行第 ' + lineNo + ' 行），规整表以最后一次为准' });
        } else {
            var entry = { key: key, value: value, firstLine: lineNo, lastLine: lineNo, duplicate: false };
            byKey[key] = entry;
            order.push(entry);
        }
        if (value === '') {
            issues.push({ line: lineNo, type: 'warning', kind: '空值',
                message: '键 ' + key + ' 的值为空，仍计入有效键' });
        }
    });

    var warnings = issues.filter(function (x) { return x.type === 'warning'; }).length;
    issues.sort(function (a, b) { return a.line - b.line; });
    return {
        entries: order,
        issues: issues,
        stats: {
            totalLines: lines.length,
            skippedLines: skipped,
            validKeys: order.length,
            invalidLines: invalid,
            warnings: warnings
        }
    };
}

/* 规整输出：值含空白、双引号或为空时双引号包裹并转义 */
function quoteValue(value) {
    if (value === '' || /[ \t\r\n"]/.test(value)) {
        var esc = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
            .replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
        return '"' + esc + '"';
    }
    return value;
}

function formatEnv(entries) {
    return (entries || []).map(function (e) {
        return e.key + '=' + quoteValue(e.value);
    }).join('\n');
}

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

var SAMPLE = [
    '# 示例 .env',
    'APP_NAME=MyApp',
    'PORT=3000',
    'export API_URL="https://example.com?a=1&b=2" # 注释',
    "SECRET='a$b#c'",
    'GREETING=hello world',
    'EMPTY=',
    'APP_NAME=MyApp2'
].join('\n');

/* ============ 浏览器 UI ============ */
function init() {
    function $(id) { return document.getElementById(id); }
    var input = $('ep-input'), output = $('ep-output');
    var statsEl = $('ep-stats'), issuesEl = $('ep-issues'), tableEl = $('ep-table');
    var copyTip = $('ep-copy-tip');

    function toast(msg) {
        var el = $('ep-toast');
        el.textContent = msg;
        el.className = 'show';
        setTimeout(function () { el.className = ''; }, 2200);
    }

    function render() {
        var result = parseEnv(input.value);
        var text = formatEnv(result.entries);
        output.value = text;
        var st = result.stats;
        statsEl.innerHTML = '总行 <b>' + st.totalLines + '</b> · 跳过 <b>' + st.skippedLines +
            '</b> · 有效键 <b>' + st.validKeys + '</b> · 非法行 <b>' + st.invalidLines +
            '</b> · 警告 <b>' + st.warnings + '</b>';
        if (!result.issues.length) {
            issuesEl.innerHTML = '<div class="ep-empty">✅ 未发现问题（在当前解析口径下）。</div>';
        } else {
            issuesEl.innerHTML = result.issues.map(function (iss) {
                var cls = iss.type === 'error' ? 'ep-err' : 'ep-warn';
                var label = iss.type === 'error' ? '非法行' : iss.kind;
                return '<div class="ep-issue ' + cls + '"><span class="ep-line">第 ' + iss.line +
                    ' 行</span><span class="ep-kind">' + escapeHtml(label) + '</span>' +
                    escapeHtml(iss.message) + '</div>';
            }).join('');
        }
        if (!result.entries.length) {
            tableEl.innerHTML = '<div class="ep-empty">暂无有效键：粘贴 .env 文本后规整表将出现在这里。</div>';
        } else {
            var rows = result.entries.map(function (e) {
                var status = e.duplicate ? '重复键，以最后一次为准' : (e.value === '' ? '空值' : '正常');
                return '<tr><td class="ep-key">' + escapeHtml(e.key) + '</td><td>' +
                    escapeHtml(e.value) + '</td><td>' + e.firstLine + '</td><td>' +
                    escapeHtml(status) + '</td></tr>';
            }).join('');
            tableEl.innerHTML = '<table class="ep-table"><thead><tr><th>键</th><th>值</th>' +
                '<th>首次行号</th><th>状态</th></tr></thead><tbody>' + rows + '</tbody></table>';
        }
    }

    function copyFallback() {
        output.focus();
        output.select();
        try {
            var ok = document.execCommand('copy');
            copyTip.innerHTML = ok
                ? '<span class="ep-copy-ok">✅ 已复制到剪贴板</span>'
                : '<span class="ep-copy-fail">❌ 自动复制失败，请在规整结果框内手动全选后按 Ctrl+C 复制</span>';
        } catch (e) {
            copyTip.innerHTML = '<span class="ep-copy-fail">❌ 自动复制失败，请在规整结果框内手动全选后按 Ctrl+C 复制</span>';
        }
        copyTip.style.display = 'block';
    }

    input.addEventListener('input', render);
    $('ep-sample').addEventListener('click', function () { input.value = SAMPLE; render(); });
    $('ep-clear').addEventListener('click', function () {
        input.value = ''; render(); toast('已清空');
    });
    $('ep-copy').addEventListener('click', function () {
        var text = output.value;
        if (!text && !parseEnv(input.value).entries.length) { toast('没有可复制的规整结果'); return; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                copyTip.innerHTML = '<span class="ep-copy-ok">✅ 已复制到剪贴板</span>';
                copyTip.style.display = 'block';
            }, copyFallback);
        } else { copyFallback(); }
    });
    $('ep-download').addEventListener('click', function () {
        var text = output.value;
        if (!text && !parseEnv(input.value).entries.length) { toast('没有可下载的规整结果'); return; }
        var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = '.env';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
        toast('已下载 .env（内容与规整文本逐字一致）');
    });
    render();
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else { init(); }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        parseEnv: parseEnv, formatEnv: formatEnv, escapeHtml: escapeHtml,
        decodeDoubleQuoted: decodeDoubleQuoted, stripInlineComment: stripInlineComment,
        SAMPLE: SAMPLE
    };
}

})();
