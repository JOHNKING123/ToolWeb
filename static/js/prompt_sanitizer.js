/* AI 提示词脱敏器 - 纯前端密钥/连接串识别 + 占位符脱敏 + 本地还原引擎
 * 数据只在浏览器里处理：零第三方依赖、无任何后端调用、无网络请求（脚本内零 fetch/XHR）。
 * 映射表只进 sessionStorage（关闭标签页即销毁）与内存，不落盘；刷新页面后不恢复。
 * 浏览器内运行：文件尾部把 init 挂到 DOMContentLoaded；
 * Node 自测：module.exports 暴露纯函数（detectSecrets / sanitizeText / restoreText / 存储函数）。
 */
(function () {
'use strict';

/* ============ 类型定义（prio 越小，冲突时优先级越高） ============ */
var TYPES = [
    { key: 'pem',     name: 'PEM 私钥块', en: 'PEM Private Key', prio: 1, prefix: '__PEM_KEY_',  color: '#b91c1c', bg: '#fee2e2', bd: '#f87171', on: true },
    { key: 'dbconn',  name: '数据库连接串', en: 'DB Connection',  prio: 2, prefix: '__DB_CONN_',  color: '#0e7490', bg: '#cffafe', bd: '#06b6d4', on: true },
    { key: 'jwt',     name: 'JWT 令牌',   en: 'JWT Token',       prio: 3, prefix: '__JWT_',      color: '#7c3aed', bg: '#ede9fe', bd: '#8b5cf6', on: true },
    { key: 'bearer',  name: 'Bearer Token',en: 'Bearer Token',    prio: 4, prefix: '__TOKEN_',    color: '#be123c', bg: '#ffe4e6', bd: '#f43f5e', on: true },
    { key: 'apikey',  name: 'API Key',     en: 'API Key',         prio: 5, prefix: '__API_KEY_',  color: '#b45309', bg: '#fef3c7', bd: '#f59e0b', on: true },
    { key: 'secretkv',name: '通用密钥对', en: 'Secret Key-Value',prio: 6, prefix: '__SECRET_',   color: '#047857', bg: '#d1fae5', bd: '#10b981', on: true }
];

var TYPE_MAP = {};
TYPES.forEach(function (t) { TYPE_MAP[t.key] = t; });

/* ============ 基础工具 ============ */
function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* 敏感值预览：只露头尾，中间打码（不暴露完整值） */
function maskedPreview(value, head, tail) {
    head = (head == null) ? 6 : head;
    tail = (tail == null) ? 4 : tail;
    var v = String(value);
    if (v.length <= head + tail + 6) {
        return v.slice(0, head) + '••••••' + v.slice(-tail);
    }
    return v.slice(0, head) + '••••••••••' + v.slice(-tail);
}

function isB64u(ch) { return /[A-Za-z0-9_\-]/.test(ch); }

/* ============ 各类型扫描器（返回 {value,start,end}，start/end 指向要替换的精确区间） ============ */

/* PEM 私钥块：非贪婪跨行匹配整块 */
function scanPem(text) {
    var re = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g;
    var out = [], m;
    while ((m = re.exec(text)) !== null) {
        out.push({ value: m[0], start: m.index, end: m.index + m[0].length });
    }
    return out;
}

/* 数据库连接串：scheme:// 直到空白或引号/括号；尾部标点剥离 */
function scanDbConn(text) {
    var re = /(?:postgres(?:ql)?|mongodb(?:\+srv)?|mysql|mariadb|redis(?:s)?|amqp(?:s)?):\/\/[^\s"'`<>()\[\]{}]+/gi;
    var out = [], m;
    while ((m = re.exec(text)) !== null) {
        var v = m[0], end = m.index + v.length;
        var stripped = v.replace(/[.,;:!?)\]}'"。，；：、]+$/, '');
        end -= (v.length - stripped.length);
        if (stripped.indexOf('://') !== -1 && stripped.length > stripped.indexOf('://') + 4) {
            out.push({ value: stripped, start: m.index, end: end });
        }
    }
    return out;
}

/* JWT：eyJ 开头三段 base64url（各段 ≥10 字符防误报） */
function scanJwt(text) {
    var re = /(^|[^A-Za-z0-9_.\-])(eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,})(?![A-Za-z0-9_\-.])/g;
    var out = [], m;
    while ((m = re.exec(text)) !== null) {
        var start = m.index + m[1].length;
        out.push({ value: m[2], start: start, end: start + m[2].length });
    }
    return out;
}

/* Bearer Token：只替换 token 部分，保留 "Bearer " 前缀 */
function scanBearer(text) {
    var re = /\b[Bb][Ee][Aa][Rr][Ee][Rr]\s+([A-Za-z0-9\-._~+\/=]{16,})(?![A-Za-z0-9\-._~+\/=])/g;
    var out = [], m;
    while ((m = re.exec(text)) !== null) {
        var start = m.index + m[0].length - m[1].length;
        out.push({ value: m[1], start: start, end: m.index + m[0].length });
    }
    return out;
}

/* API Key：各云厂商/平台前缀模式 */
var APIKEY_RE = /(?:^|[^A-Za-z0-9_])(sk-(?:(?:live|test|proj)-)?[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[bpars]-[A-Za-z0-9\-]{10,}|AIza[0-9A-Za-z_\-]{20,}|ya29\.[0-9A-Za-z_\-]{20,}|glpat-[0-9A-Za-z_\-]{16,}|dckr_pat_[0-9A-Za-z_\-]{16,}|npm_[A-Za-z0-9]{20,})(?![A-Za-z0-9_])/g;
function scanApiKey(text) {
    var out = [], m;
    APIKEY_RE.lastIndex = 0;
    while ((m = APIKEY_RE.exec(text)) !== null) {
        var v = m[1];
        var start = m.index + m[0].length - v.length;
        out.push({ value: v, start: start, end: start + v.length });
    }
    return out;
}

/* 通用密钥对：key 名含 api_key/secret/token/password 等，值 ≥12 字符高熵 */
function scanSecretKv(text) {
    var re = /(?:^|[^\w.\-])([A-Za-z0-9_.\-]*(?:api[_-]?key|secret|token|passwd|password)[A-Za-z0-9_.\-]*)\s*[:=]\s*['"`]?([A-Za-z0-9\-_+\/=.:@]{12,})['"`]?/gim;
    var out = [], m;
    while ((m = re.exec(text)) !== null) {
        var v = m[2];
        var start = m.index + m[0].lastIndexOf(v);
        out.push({ value: v, start: start, end: start + v.length });
    }
    return out;
}

var SCANNERS = {
    pem: scanPem, dbconn: scanDbConn, jwt: scanJwt,
    bearer: scanBearer, apikey: scanApiKey, secretkv: scanSecretKv
};

function mkHit(type, value, start, end) {
    return { type: type, name: TYPE_MAP[type].name, prefix: TYPE_MAP[type].prefix,
             value: value, start: start, end: end,
             prio: TYPE_MAP[type].prio, ignored: false };
}

/* ============ 主入口：检测（重叠区间按优先级去重） ============ */
function detectSecrets(text, enabledKeys) {
    text = String(text == null ? '' : text);
    var enabled = {};
    TYPES.forEach(function (t) { enabled[t.key] = t.on; });
    if (enabledKeys) {
        TYPES.forEach(function (t) { enabled[t.key] = enabledKeys.indexOf(t.key) !== -1; });
    }
    var raw = [];
    TYPES.forEach(function (t) {
        if (!enabled[t.key]) return;
        var hits = SCANNERS[t.key](text);
        hits.forEach(function (h) { raw.push(mkHit(t.key, h.value, h.start, h.end)); });
    });
    /* 起点升序 → 优先级高者优先 → 同起点长者优先；重叠的后者丢弃 */
    raw.sort(function (a, b) {
        if (a.start !== b.start) return a.start - b.start;
        if (a.prio !== b.prio) return a.prio - b.prio;
        return b.end - a.end;
    });
    var kept = [];
    raw.forEach(function (h) {
        for (var i = 0; i < kept.length; i++) {
            var k = kept[i];
            if (h.start < k.end && k.start < h.end) return; /* 重叠：已保留的更优先 */
        }
        kept.push(h);
    });
    kept.sort(function (a, b) { return a.start - b.start; });
    kept.forEach(function (h, i) { h.idx = i + 1; });
    return kept;
}

/* ============ 脱敏：逐条确认后占位符替换 ============ */
function sanitizeText(text, hits) {
    text = String(text == null ? '' : text);
    var confirmed = (hits || []).filter(function (h) { return !h.ignored; });
    confirmed.sort(function (a, b) { return a.start - b.start; });
    var counters = {}, mapping = {}, byType = {};
    var parts = [], pos = 0, count = 0;
    confirmed.forEach(function (h) {
        if (h.start < pos) return; /* 防御：理论上 detectSecrets 已去重 */
        counters[h.type] = (counters[h.type] || 0) + 1;
        var ph = h.prefix + counters[h.type] + '__';
        mapping[ph] = h.value;
        byType[h.type] = (byType[h.type] || 0) + 1;
        parts.push(text.slice(pos, h.start), ph);
        pos = h.end;
        count++;
    });
    parts.push(text.slice(pos));
    return { text: parts.join(''), mapping: mapping, count: count, byType: byType };
}

/* ============ 还原：占位符 → 原始值（长占位符先替，防 __API_KEY_1__ 被 __API_KEY_10__ 前缀干扰） ============ */
function restoreText(text, mapping) {
    text = String(text == null ? '' : text);
    mapping = mapping || {};
    var keys = Object.keys(mapping).sort(function (a, b) { return b.length - a.length; });
    var restored = 0;
    keys.forEach(function (ph) {
        if (text.indexOf(ph) === -1) return;
        var parts = text.split(ph);
        restored += parts.length - 1;
        text = parts.join(mapping[ph]);
    });
    return { text: text, restored: restored };
}

/* ============ 映射表存储：sessionStorage（无则内存兜底，仅供 Node 自测） ============ */
var STORE_KEY = 'prompt_sanitizer_mapping';
var memStore = (function () {
    var data = {};
    return {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
        setItem: function (k, v) { data[k] = String(v); },
        removeItem: function (k) { delete data[k]; }
    };
})();

function getStore() {
    try {
        if (typeof sessionStorage !== 'undefined' && sessionStorage) return sessionStorage;
    } catch (e) { /* 隐私模式等异常 → 内存兜底 */ }
    return memStore;
}

function saveMapping(mapping) {
    try { getStore().setItem(STORE_KEY, JSON.stringify(mapping || {})); } catch (e) { /* 忽略 */ }
}

function loadMapping() {
    try {
        var raw = getStore().getItem(STORE_KEY);
        if (!raw) return {};
        var obj = JSON.parse(raw);
        return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) { return {}; }
}

function clearMapping() {
    try { getStore().removeItem(STORE_KEY); } catch (e) { /* 忽略 */ }
}

/* ============ 浏览器 UI ============ */
function init() {
    function $(id) { return document.getElementById(id); }
    var input = $('ps-input'), fileInput = $('ps-file'), drop = $('ps-drop');
    var typeWrap = $('ps-types');
    var detectSec = $('ps-detect-sec'), listEl = $('ps-list'), statsEl = $('ps-stats');
    var outSec = $('ps-out-sec'), output = $('ps-output'), outStats = $('ps-out-stats');
    var ansInput = $('ps-answer'), ansOutput = $('ps-answer-out'), ansSec = $('ps-ansout-sec');
    var mapStatus = $('ps-map-status');
    var tipEl = $('ps-tip');
    var hits = [];

    /* 类型开关 */
    typeWrap.innerHTML = TYPES.map(function (t) {
        return '<label class="ps-type" style="--dot:' + t.color + '">' +
            '<input type="checkbox" data-type="' + t.key + '"' + (t.on ? ' checked' : '') + '>' +
            '<span class="ps-dot"></span>' + escapeHtml(t.name) + '</label>';
    }).join('');

    function enabledTypes() {
        var out = [];
        typeWrap.querySelectorAll('input[data-type]').forEach(function (cb) {
            if (cb.checked) out.push(cb.getAttribute('data-type'));
        });
        return out;
    }

    function toast(msg) {
        var el = $('ps-toast');
        el.textContent = msg;
        el.className = 'show';
        setTimeout(function () { el.className = ''; }, 2200);
    }

    function showTip(kind, html) {
        tipEl.className = 'ps-tip ' + (kind === 'ok' ? 'ps-tip-ok' : 'ps-tip-warn');
        tipEl.innerHTML = html;
        tipEl.style.display = 'block';
    }
    function hideTip() { tipEl.style.display = 'none'; }

    function updateCount() {
        $('ps-count').textContent = '共 ' + input.value.length + ' 字符';
    }

    /* 文件读取（本地 FileReader，零上传） */
    function readFile(file) {
        if (!file) return;
        var okExt = /\.(txt|log|env|md)$/i;
        if (!okExt.test(file.name)) {
            toast('仅支持 .txt / .log / .env / .md 文件');
            return;
        }
        if (file.size > 5 * 1024 * 1024) { toast('文件超过 5MB，已拒绝'); return; }
        var reader = new FileReader();
        reader.onload = function () {
            input.value = String(reader.result || '');
            updateCount();
            toast('已载入：' + file.name);
        };
        reader.onerror = function () { toast('文件读取失败'); };
        reader.readAsText(file);
    }
    drop.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) readFile(fileInput.files[0]);
        fileInput.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); });
    });
    drop.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) readFile(f);
    });

    input.addEventListener('input', updateCount);

    $('ps-sample').addEventListener('click', function () {
        input.value = [
            '# 示例：喂给 LLM 前的调试日志（已混入多处敏感信息）',
            'OPENAI_API_KEY=sk-proj-9f8K2mQvX7nR4tLwP3sA6dF1gH5jK8lZ0xCvBnM4qWeRtYuI',
            'export GITHUB_TOKEN=ghp_9f8K2mQvX7nR4tLwP3sA6dF1gH5jK8',
            'aws_access_key_id=AKIAIOSFODNN7EXAMPLE',
            'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
            'DATABASE_URL=postgres://admin:P%40ssw0rd!2026@db.internal:5432/appdb?sslmode=require',
            'MONGODB_URI=mongodb+srv://reader:Secret123%21@cluster0.ab12c.mongodb.net/logs',
            '-----BEGIN RSA PRIVATE KEY-----',
            'MIIEpAIBAAKCAQEA7b8cdefGhIjKlMnOpQrStUvWxYz0123456789abcd',
            'efghijklmnopqrstuvwxYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWX',
            '-----END RSA PRIVATE KEY-----',
            '',
            '注意：以上示例均为虚构值，仅用于演示识别效果。'
        ].join('\n');
        updateCount();
    });

    $('ps-clear').addEventListener('click', function () {
        input.value = '';
        updateCount();
        hits = [];
        detectSec.style.display = 'none';
        outSec.style.display = 'none';
        hideTip();
    });

    /* 检测 */
    $('ps-detect').addEventListener('click', function () {
        var text = input.value;
        if (!text.trim()) { toast('请先粘贴文本或上传文件'); return; }
        var enabled = enabledTypes();
        if (!enabled.length) { toast('请至少开启一种识别类型'); return; }
        hits = detectSecrets(text, enabled);
        renderHits(text);
    });

    function renderHits(text) {
        detectSec.style.display = 'block';
        outSec.style.display = 'none';
        hideTip();
        if (!hits.length) {
            showTip('ok', '✅ 未发现敏感信息（在已开启的类型范围内）。文本可以直接发给 LLM。');
            statsEl.textContent = '';
            listEl.innerHTML = '';
            return;
        }
        var byType = {};
        hits.forEach(function (h) { byType[h.type] = (byType[h.type] || 0) + 1; });
        statsEl.innerHTML = '共发现 <b>' + hits.length + '</b> 处敏感信息：' +
            Object.keys(byType).map(function (k) {
                return escapeHtml(TYPE_MAP[k].name) + ' ' + byType[k] + ' 处';
            }).join('、') +
            '。默认全部勾选参与脱敏，取消勾选则该条保留原文。';
        listEl.innerHTML = hits.map(function (h) {
            var t = TYPE_MAP[h.type];
            return '<label class="ps-item' + (h.ignored ? ' is-ignored' : '') + '">' +
                '<input type="checkbox" data-idx="' + h.idx + '"' + (h.ignored ? '' : ' checked') + '>' +
                '<span class="ps-idx">' + h.idx + '</span>' +
                '<span class="ps-badge" style="color:' + t.color + ';background:' + t.bg + ';border:1px solid ' + t.bd + '">' +
                escapeHtml(h.name) + '</span>' +
                '<span class="ps-val">' + escapeHtml(maskedPreview(h.value)) + '</span>' +
                '<span class="ps-pos">位置 ' + h.start + '–' + h.end + '</span>' +
                '</label>';
        }).join('');
        listEl.querySelectorAll('input[data-idx]').forEach(function (cb) {
            cb.addEventListener('change', function () {
                var idx = parseInt(cb.getAttribute('data-idx'), 10);
                var h = hits.filter(function (x) { return x.idx === idx; })[0];
                if (h) h.ignored = !cb.checked;
                cb.closest('.ps-item').classList.toggle('is-ignored', !cb.checked);
            });
        });
    }

    $('ps-all').addEventListener('click', function () {
        hits.forEach(function (h) { h.ignored = false; });
        renderHits(input.value);
    });
    $('ps-none').addEventListener('click', function () {
        hits.forEach(function (h) { h.ignored = true; });
        renderHits(input.value);
    });

    /* 脱敏 */
    $('ps-sanitize').addEventListener('click', function () {
        if (!hits.length) { toast('请先点「开始识别」'); return; }
        var confirmed = hits.filter(function (h) { return !h.ignored; });
        if (!confirmed.length) { toast('没有勾选任何条目，无法脱敏'); return; }
        var r = sanitizeText(input.value, hits);
        saveMapping(r.mapping);
        output.value = r.text;
        var byType = Object.keys(r.byType).map(function (k) {
            return escapeHtml(TYPE_MAP[k].name) + ' ×' + r.byType[k];
        }).join('、');
        outStats.innerHTML = '已将 <b>' + r.count + '</b> 处敏感信息替换为占位符（' + byType + '）。' +
            '映射表已存入本标签页内存（sessionStorage），<b>关闭标签页自动销毁</b>。';
        outSec.style.display = 'block';
        refreshMapStatus();
        outSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    function copyText(textarea, tipTarget) {
        var done = function (okMsg) {
            var el = $(tipTarget);
            el.innerHTML = '<span class="ps-copy-ok">' + escapeHtml(okMsg) + '</span>';
            el.style.display = 'block';
        };
        function fallback() {
            textarea.focus();
            textarea.select();
            try {
                var ok = document.execCommand('copy');
                done(ok ? '✅ 已复制到剪贴板' : '❌ 复制失败，请手动 Ctrl+C');
            } catch (e) {
                done('❌ 复制失败，请手动 Ctrl+C');
            }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textarea.value).then(function () {
                done('✅ 已复制到剪贴板，可以粘贴给 LLM 了');
            }, fallback);
        } else { fallback(); }
    }

    $('ps-copy').addEventListener('click', function () { copyText(output, 'ps-copy-tip'); });
    $('ps-copy-ans').addEventListener('click', function () { copyText(ansOutput, 'ps-ans-copy-tip'); });

    /* 还原 */
    $('ps-restore').addEventListener('click', function () {
        var mapping = loadMapping();
        var keys = Object.keys(mapping);
        if (!keys.length) {
            toast('当前标签页没有映射表（可能已刷新/关闭/销毁），无法还原');
            return;
        }
        var text = ansInput.value;
        if (!text.trim()) { toast('请先粘贴 LLM 返回的答案文本'); return; }
        var r = restoreText(text, mapping);
        ansOutput.value = r.text;
        ansSec.style.display = 'block';
        $('ps-ans-stats').innerHTML = '还原完成：替换回 <b>' + r.restored + '</b> 处占位符。' +
            (r.restored === 0 ? '（答案中未发现本页生成的占位符）' : '');
    });

    $('ps-destroy').addEventListener('click', function () {
        clearMapping();
        refreshMapStatus();
        toast('映射表已手动销毁');
    });

    function refreshMapStatus() {
        var n = Object.keys(loadMapping()).length;
        mapStatus.innerHTML = n > 0
            ? '当前映射表：<b>' + n + '</b> 条（仅存于本标签页内存，关闭即销毁；<b>刷新页面后不恢复</b>）'
            : '当前映射表：<b>空</b>（尚未脱敏，或已销毁/关闭标签页）';
    }
    clearMapping(); // 刷新页面时销毁陈旧映射（关闭标签页由浏览器自动销毁，语义一致）
    refreshMapStatus();

    updateCount();
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else { init(); }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TYPES: TYPES, TYPE_MAP: TYPE_MAP,
        detectSecrets: detectSecrets, sanitizeText: sanitizeText, restoreText: restoreText,
        maskedPreview: maskedPreview, escapeHtml: escapeHtml,
        saveMapping: saveMapping, loadMapping: loadMapping, clearMapping: clearMapping,
        scanPem: scanPem, scanDbConn: scanDbConn, scanJwt: scanJwt,
        scanBearer: scanBearer, scanApiKey: scanApiKey, scanSecretKv: scanSecretKv
    };
}

})();
