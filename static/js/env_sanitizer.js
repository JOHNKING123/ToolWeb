/* .env 脱敏生成器 - 纯前端 dotenv 逐行解析 + 敏感值脱敏，生成 .env.example
 * 数据只在浏览器里处理：零第三方依赖、无任何后端调用、无网络请求（脚本内零 fetch/XHR）。
 * 纯函数契约（浏览器/Node 通用，非法参数抛 Error，err.field 给出字段名）：
 *   parseEnvLine(line)        -> {kind:'pair'|'comment'|'blank'|'invalid', key, value, raw}
 *                                kind='invalid' 时 key=null；空输入（非字符串/空串）抛 Error，err.field='line'
 *   maskValue(value, mode, placeholder) -> string
 *                                mode 非法抛 Error，err.field='mode'；placeholder 非字符串抛 Error，err.field='placeholder'
 *   sanitizeEnv(text, opts)   -> string
 *                                opts={mode:'empty'|'placeholder', placeholder, keepComments:true}
 *                                text 非字符串抛 Error，err.field='text'；mode 非法抛 Error，err.field='mode'
 * 解析口径（与 env_parser 家族一致）：空行/# 注释保留（开关控制）、export 前缀剥离、
 * 键名校验 [A-Za-z_][A-Za-z0-9_]*、双引号解码/单引号原样/无引号值以空白加 # 截断行内注释；
 * 非法行（无 =、键名非法、引号未闭合、闭合后残留）原样保留并在行首标注 '# [跳过]'，不丢数据。
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；
 * Node 自测：module.exports 暴露纯函数。
 */
(function () {
'use strict';

var KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
var DEFAULT_PLACEHOLDER = 'YOUR_VALUE_HERE';

function err(field, msg) {
    var e = new Error(msg);
    e.field = field;
    return e;
}

/* 双引号值解码：仅解码 \" \\ \n \r \t，其余反斜杠序列原样保留（与 env_parser 同口径） */
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

/* 解析一行已剥离 export 前缀的内容，返回 {value} 或 {error} */
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

/* 逐行解析：一行的分类结果。空输入抛 Error（err.field='line'）。
 * 注意 sanitizeEnv 内部对文本内空行（''）不调用本函数而是直接按 blank 处理。 */
function parseEnvLine(line) {
    if (typeof line !== 'string' || line === '') {
        throw err('line', 'parseEnvLine: line 必须为非空字符串');
    }
    var raw = line.replace(/\r$/, '');
    var trimmed = raw.replace(/^[ \t]+/, '');
    if (trimmed === '') return { kind: 'blank', key: null, value: null, raw: raw };
    if (trimmed.charAt(0) === '#') return { kind: 'comment', key: null, value: null, raw: raw };
    var body = trimmed;
    if (/^export[ \t]+/.test(body)) {
        body = body.replace(/^export[ \t]+/, '');
        if (body === '' || body.charAt(0) === '#') {
            return { kind: 'invalid', key: null, value: null, raw: raw };
        }
    }
    var eq = body.indexOf('=');
    if (eq === -1) return { kind: 'invalid', key: null, value: null, raw: raw };
    var key = body.slice(0, eq).replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
    if (!KEY_RE.test(key)) return { kind: 'invalid', key: null, value: null, raw: raw };
    var parsed = parseValuePart(body.slice(eq + 1));
    if (parsed.error) return { kind: 'invalid', key: null, value: null, raw: raw };
    return { kind: 'pair', key: key, value: parsed.value, raw: raw };
}

/* 值脱敏：mode='empty' -> ''；mode='placeholder' -> placeholder（默认 YOUR_VALUE_HERE）。
 * mode 非法抛 Error（err.field='mode'）；placeholder 非字符串抛 Error（err.field='placeholder'）。 */
function maskValue(value, mode, placeholder) {
    if (mode !== 'empty' && mode !== 'placeholder') {
        throw err('mode', 'maskValue: mode 必须为 "empty" 或 "placeholder"');
    }
    if (mode === 'empty') return '';
    if (placeholder === undefined || placeholder === null) return DEFAULT_PLACEHOLDER;
    if (typeof placeholder !== 'string') {
        throw err('placeholder', 'maskValue: placeholder 必须为字符串');
    }
    return placeholder;
}

/* 脱敏全文（含统计）：内部实现，sanitizeEnv 取其 text。 */
function sanitizeEnvDetailed(text, opts) {
    if (typeof text !== 'string') {
        throw err('text', 'sanitizeEnv: text 必须为字符串');
    }
    opts = opts || {};
    var mode = opts.mode === undefined ? 'empty' : opts.mode;
    if (mode !== 'empty' && mode !== 'placeholder') {
        throw err('mode', 'sanitizeEnv: mode 必须为 "empty" 或 "placeholder"');
    }
    var placeholder = opts.placeholder === undefined ? DEFAULT_PLACEHOLDER : opts.placeholder;
    if (mode === 'placeholder' && typeof placeholder !== 'string') {
        throw err('placeholder', 'sanitizeEnv: placeholder 必须为字符串');
    }
    var keepComments = opts.keepComments === undefined ? true : !!opts.keepComments;

    /* 尾换行不另算一行："A=1\n" 为 1 行而非 2 行；空文本为 0 行 */
    var lines = text === '' ? [] : text.split('\n');
    if (text !== '' && text.charAt(text.length - 1) === '\n') lines.pop();

    var out = [];
    var stats = { totalLines: lines.length, pairs: 0, keptLines: 0, invalidLines: 0 };
    lines.forEach(function (line) {
        var parsed = line === ''
            ? { kind: 'blank', key: null, value: null, raw: '' }
            : parseEnvLine(line);
        if (parsed.kind === 'blank' || parsed.kind === 'comment') {
            if (keepComments) { out.push(parsed.raw); stats.keptLines++; }
            return;
        }
        if (parsed.kind === 'invalid') {
            out.push('# [跳过] ' + parsed.raw);
            stats.invalidLines++;
            return;
        }
        out.push(parsed.key + '=' + maskValue(parsed.value, mode, placeholder));
        stats.pairs++;
    });
    return { text: out.join('\n'), stats: stats };
}

/* 纯函数契约入口：脱敏全文，返回 .env.example 文本 */
function sanitizeEnv(text, opts) {
    return sanitizeEnvDetailed(text, opts).text;
}

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

var SAMPLE = [
    '# 示例 .env（演示用占位值，请勿粘贴真实生产密钥）',
    'APP_NAME=MyApp',
    'PORT=3000',
    'export API_KEY="sk-demo-123"',
    "DB_PASS='p@ss#word'",
    'DEBUG=true # 行内注释',
    'EMPTY=',
    '坏行无等号'
].join('\n');

/* ============ 浏览器 UI ============ */
function init() {
    function $(id) { return document.getElementById(id); }
    var input = $('es-input'), output = $('es-output');
    var statsEl = $('es-stats'), copyTip = $('es-copy-tip');
    var modeEmpty = $('es-mode-empty'), modePlaceholder = $('es-mode-placeholder');
    var placeholderInput = $('es-placeholder'), keepCommentsBox = $('es-keep-comments');
    var fileInput = $('es-file');

    function toast(msg) {
        var el = $('es-toast');
        el.textContent = msg;
        el.className = 'show';
        setTimeout(function () { el.className = ''; }, 2200);
    }

    function currentOpts() {
        return {
            mode: modePlaceholder.checked ? 'placeholder' : 'empty',
            placeholder: placeholderInput.value,
            keepComments: keepCommentsBox.checked
        };
    }

    function render() {
        var detail;
        try {
            detail = sanitizeEnvDetailed(input.value, currentOpts());
        } catch (e) {
            output.value = '';
            statsEl.textContent = '参数异常：' + e.message;
            return;
        }
        output.value = detail.text;
        var st = detail.stats;
        statsEl.innerHTML = '总行 <b>' + st.totalLines + '</b> · 已脱敏键 <b>' + st.pairs +
            '</b> · 注释/空行保留 <b>' + st.keptLines + '</b> · 非法行（已标注） <b>' + st.invalidLines + '</b>';
        placeholderInput.disabled = !modePlaceholder.checked;
    }

    function copyFallback() {
        output.focus();
        output.select();
        try {
            var ok = document.execCommand('copy');
            copyTip.innerHTML = ok
                ? '<span class="ep-copy-ok">✅ 已复制到剪贴板</span>'
                : '<span class="ep-copy-fail">❌ 自动复制失败，请在结果框内手动全选后按 Ctrl+C 复制</span>';
        } catch (e) {
            copyTip.innerHTML = '<span class="ep-copy-fail">❌ 自动复制失败，请在结果框内手动全选后按 Ctrl+C 复制</span>';
        }
        copyTip.style.display = 'block';
    }

    input.addEventListener('input', render);
    modeEmpty.addEventListener('change', render);
    modePlaceholder.addEventListener('change', render);
    placeholderInput.addEventListener('input', render);
    keepCommentsBox.addEventListener('change', render);

    $('es-upload').addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
            input.value = String(reader.result || '');
            render();
            toast('已载入文件：' + f.name + '（仅本地读取，不上传）');
        };
        reader.onerror = function () { toast('文件读取失败，请重试'); };
        reader.readAsText(f);
        fileInput.value = '';
    });

    $('es-sample').addEventListener('click', function () { input.value = SAMPLE; render(); });
    $('es-clear').addEventListener('click', function () {
        input.value = ''; render(); toast('已清空');
    });
    $('es-copy').addEventListener('click', function () {
        var text = output.value;
        if (!text && sanitizeEnvDetailed(input.value, currentOpts()).stats.pairs === 0) {
            toast('没有可复制的脱敏结果'); return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                copyTip.innerHTML = '<span class="ep-copy-ok">✅ 已复制到剪贴板</span>';
                copyTip.style.display = 'block';
            }, copyFallback);
        } else { copyFallback(); }
    });
    $('es-download').addEventListener('click', function () {
        var text = output.value;
        if (!text && sanitizeEnvDetailed(input.value, currentOpts()).stats.pairs === 0) {
            toast('没有可下载的脱敏结果'); return;
        }
        var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = '.env.example';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
        toast('已下载 .env.example（内容与预览逐字一致）');
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
        parseEnvLine: parseEnvLine, sanitizeEnv: sanitizeEnv, maskValue: maskValue,
        sanitizeEnvDetailed: sanitizeEnvDetailed, escapeHtml: escapeHtml,
        DEFAULT_PLACEHOLDER: DEFAULT_PLACEHOLDER, SAMPLE: SAMPLE
    };
}

})();
