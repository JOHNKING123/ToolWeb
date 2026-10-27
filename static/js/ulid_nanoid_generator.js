/* ULID／NanoID 生成器（ulid_nanoid_generator）纯前端核心逻辑
 * 纯函数经 module.exports 暴露，node tests/ulid_nanoid_generator.test.js 自测；
 * 浏览器端：window.UlidNanoidGenerator 全局 + DOM 装配（本文件末尾）。
 *
 * 生成规则（确定性纯函数，供 node 断言）：
 * - ULID：26 位 Crockford Base32 大写，字符集 0123456789ABCDEFGHJKMNPQRSTVWXYZ
 *   （不含 I／L／O／U）；前 10 位为 48 位毫秒时间戳，后 16 位为 80 位随机。
 *   encodeULID(timestampMs, randomBytes)：timestampMs 为 48 位非负整数
 *   （0～281474976710655），超范围抛中文错误并拒绝生成；randomBytes 至少
 *   10 字节，实际只取前 10 字节（80 位），多余字节忽略。
 * - decodeULID(ulid)：26 位且字符全部属于 Crockford 字符集时返回毫秒时间戳，
 *   否则（长度非 26、含 I／L／O／U、小写或其它非法字符）返回 null。
 * - NanoID：generateNanoID(length, alphabet, randomBytes) 逐字节取模映射到
 *   字母表，长度精确等于输入，字符逐项属于所选字母表；预设字母表：
 *   urlsafe（_-0-9A-Za-z，64 字符）、digits（0-9）、lower（a-z）。
 * - 钳制：NanoID 长度 8–64、批量数量 1–100，超范围钳制到边界并返回中文提示。
 * - 批量：generateBatch(format, opts, randFn) 返回字符串数组，行数精确等于
 *   钳制后数量；randFn(n) 返回 n 字节随机数组（浏览器用 crypto.getRandomValues）。
 *
 * 真限制：只生成随机／时间排序标识、不做分布式 ID 唯一性保证；
 * ULID 时间戳取自本机时钟，自定义时间只是编码入参、不校验时钟准确性；
 * 不存、不查、不上传任何已生成 ID；不做 ID 碰撞检测与后端存查。
 * 零网络请求：纯本地处理，不发起任何网络请求。
 */
(function () {
"use strict";

var CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
var CROCKFORD_SET = {};
for (var ci = 0; ci < CROCKFORD.length; ci++) { CROCKFORD_SET[CROCKFORD.charAt(ci)] = true; }
var MAX_TIMESTAMP = 281474976710655; /* 2^48 - 1 */
var ALPHABETS = {
    urlsafe: "_-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
    digits: "0123456789",
    lower: "abcdefghijklmnopqrstuvwxyz"
};
var MIN_NANOID_LENGTH = 8;
var MAX_NANOID_LENGTH = 64;
var DEFAULT_NANOID_LENGTH = 21;
var MIN_COUNT = 1;
var MAX_COUNT = 100;
var DEFAULT_COUNT = 10;

function pad2(n) { return (n < 10 ? "0" : "") + n; }

/* 毫秒时间戳格式化为本地时间 YYYY-MM-DD HH:mm:ss（精确到秒）。 */
function formatLocalTime(ms) {
    var d = new Date(ms);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + " " +
        pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
}

function checkTimestamp(ts) {
    if (typeof ts !== "number" || !isFinite(ts) || Math.floor(ts) !== ts || ts < 0 || ts > MAX_TIMESTAMP) {
        throw new Error("时间戳超出 48 位范围（0～281474976710655），已拒绝生成");
    }
}

/* 128 位（16 字节）→ Crockford Base32：首字符 3 位，其余 25 字符各 5 位。 */
function encodeULID(timestampMs, randomBytes) {
    checkTimestamp(timestampMs);
    if (!randomBytes || randomBytes.length < 10) {
        throw new Error("随机字节不足 10 字节，无法生成 ULID");
    }
    var bytes = [];
    var remaining = timestampMs;
    for (var bi = 5; bi >= 0; bi--) {
        bytes[bi] = remaining % 256;
        remaining = Math.floor(remaining / 256);
    }
    for (var ri = 0; ri < 10; ri++) { bytes[6 + ri] = randomBytes[ri] & 0xff; }
    var bits = [];
    for (var i = 0; i < 16; i++) {
        for (var b = 7; b >= 0; b--) { bits.push((bytes[i] >> b) & 1); }
    }
    var out = "";
    out += CROCKFORD.charAt(bits[0] * 4 + bits[1] * 2 + bits[2]);
    for (var k = 0; k < 25; k++) {
        var v = 0;
        for (var j = 0; j < 5; j++) { v = v * 2 + bits[3 + k * 5 + j]; }
        out += CROCKFORD.charAt(v);
    }
    return out;
}

function decodeULID(ulid) {
    if (typeof ulid !== "string" || ulid.length !== 26) { return null; }
    var values = [];
    for (var i = 0; i < 26; i++) {
        var ch = ulid.charAt(i);
        if (!CROCKFORD_SET[ch]) { return null; }
        values.push(CROCKFORD.indexOf(ch));
    }
    var bits = [];
    var first = values[0];
    bits.push((first >> 2) & 1, (first >> 1) & 1, first & 1);
    for (var k = 1; k < 26; k++) {
        var val = values[k];
        for (var b = 4; b >= 0; b--) { bits.push((val >> b) & 1); }
    }
    var bytes = [];
    for (var bi2 = 0; bi2 < 16; bi2++) {
        var byte = 0;
        for (var j2 = 0; j2 < 8; j2++) { byte = byte * 2 + bits[bi2 * 8 + j2]; }
        bytes.push(byte);
    }
    var ts = 0;
    for (var ti = 0; ti < 6; ti++) { ts = ts * 256 + bytes[ti]; }
    return ts;
}

function generateNanoID(length, alphabet, randomBytes) {
    if (typeof length !== "number" || Math.floor(length) !== length || length < 1) {
        throw new Error("NanoID 长度必须为正整数");
    }
    if (!alphabet || alphabet.length < 1) { throw new Error("字母表不能为空"); }
    if (!randomBytes || randomBytes.length < length) {
        throw new Error("随机字节不足，无法生成 NanoID");
    }
    var out = "";
    for (var i = 0; i < length; i++) {
        out += alphabet.charAt((randomBytes[i] & 0xff) % alphabet.length);
    }
    return out;
}

function clampNanoLength(n) {
    var v = parseInt(n, 10);
    if (isNaN(v)) { return { value: DEFAULT_NANOID_LENGTH, message: "长度输入无效，已恢复默认 21" }; }
    if (v < MIN_NANOID_LENGTH) { return { value: MIN_NANOID_LENGTH, message: "长度已钳制到最小值 8" }; }
    if (v > MAX_NANOID_LENGTH) { return { value: MAX_NANOID_LENGTH, message: "长度已钳制到最大值 64" }; }
    return { value: v, message: "" };
}

function clampCount(n) {
    var v = parseInt(n, 10);
    if (isNaN(v)) { return { value: DEFAULT_COUNT, message: "数量输入无效，已恢复默认 10" }; }
    if (v < MIN_COUNT) { return { value: MIN_COUNT, message: "数量已钳制到最小值 1" }; }
    if (v > MAX_COUNT) { return { value: MAX_COUNT, message: "数量已钳制到最大值 100" }; }
    return { value: v, message: "" };
}

function defaultRand(n) {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        var arr = new Uint8Array(n);
        crypto.getRandomValues(arr);
        return arr;
    }
    var fallback = [];
    for (var i = 0; i < n; i++) { fallback.push(Math.floor(Math.random() * 256)); }
    return fallback;
}

function generateBatch(format, opts, randFn) {
    opts = opts || {};
    var rand = randFn || defaultRand;
    var countRes = clampCount(opts.count === undefined ? DEFAULT_COUNT : opts.count);
    var count = countRes.value;
    var out = [];
    if (format === "nanoid") {
        var lenRes = clampNanoLength(opts.length === undefined ? DEFAULT_NANOID_LENGTH : opts.length);
        var alphabet = ALPHABETS[opts.alphabet] || ALPHABETS.urlsafe;
        for (var i = 0; i < count; i++) {
            out.push(generateNanoID(lenRes.value, alphabet, rand(lenRes.value)));
        }
        return out;
    }
    var ts = opts.timestampMs === undefined ? Date.now() : opts.timestampMs;
    checkTimestamp(ts);
    for (var j = 0; j < count; j++) {
        out.push(encodeULID(ts, rand(16)));
    }
    return out;
}

function buildIdsText(ids) { return (ids || []).join("\n"); }

var api = {
    CROCKFORD: CROCKFORD,
    ALPHABETS: ALPHABETS,
    MAX_TIMESTAMP: MAX_TIMESTAMP,
    MIN_NANOID_LENGTH: MIN_NANOID_LENGTH,
    MAX_NANOID_LENGTH: MAX_NANOID_LENGTH,
    DEFAULT_NANOID_LENGTH: DEFAULT_NANOID_LENGTH,
    MIN_COUNT: MIN_COUNT,
    MAX_COUNT: MAX_COUNT,
    DEFAULT_COUNT: DEFAULT_COUNT,
    formatLocalTime: formatLocalTime,
    encodeULID: encodeULID,
    decodeULID: decodeULID,
    generateNanoID: generateNanoID,
    clampNanoLength: clampNanoLength,
    clampCount: clampCount,
    generateBatch: generateBatch,
    buildIdsText: buildIdsText
};

if (typeof module !== "undefined" && module.exports) { module.exports = api; }
if (typeof window !== "undefined") { window.UlidNanoidGenerator = api; }

/* ---------- 浏览器 DOM 装配（node 下不执行） ---------- */
if (typeof document !== "undefined") {
    var lastIds = [];
    var lastFormat = "ulid";

    function $(id) { return document.getElementById(id); }
    function showMsg(text, isError) {
        var el = $("un-msg");
        if (!el) { return; }
        el.textContent = text;
        el.className = "un-msg" + (isError ? " un-msg-error" : " un-msg-ok");
    }
    function toast(msg) {
        var el = document.createElement("div");
        el.textContent = msg;
        el.style.cssText = "position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:90vw;text-align:center;";
        document.body.appendChild(el);
        setTimeout(function () { if (el.parentNode) { el.parentNode.removeChild(el); } }, 2200);
    }
    function copyText(text, okMsg) {
        function fallback() {
            var ta = document.createElement("textarea");
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand("copy");
                toast(okMsg || "已复制");
            } catch (e) {
                toast("复制失败：浏览器未授权剪贴板，请手动复制");
            }
            document.body.removeChild(ta);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { toast(okMsg || "已复制"); }, fallback);
        } else { fallback(); }
    }
    function escapeHtml(s) {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function getFormat() {
        var els = document.querySelectorAll('input[name="un-format"]');
        for (var i = 0; i < els.length; i++) { if (els[i].checked) { return els[i].value; } }
        return "ulid";
    }
    function getTimestampMode() {
        var els = document.querySelectorAll('input[name="un-ts-mode"]');
        for (var i = 0; i < els.length; i++) { if (els[i].checked) { return els[i].value; } }
        return "now";
    }
    function getAlphabet() {
        var els = document.querySelectorAll('input[name="un-alphabet"]');
        for (var i = 0; i < els.length; i++) { if (els[i].checked) { return els[i].value; } }
        return "urlsafe";
    }
    function syncPanels() {
        var format = getFormat();
        $("un-ulid-opts").style.display = format === "ulid" ? "" : "none";
        $("un-nanoid-opts").style.display = format === "nanoid" ? "" : "none";
    }
    function render() {
        var out = $("un-result");
        if (!out) { return; }
        if (!lastIds.length) { out.innerHTML = '<div class="un-empty">点「生成」开始生成 ID。</div>'; return; }
        var html = "";
        for (var i = 0; i < lastIds.length; i++) {
            var id = lastIds[i];
            var note = "";
            if (lastFormat === "ulid") {
                var ts = decodeULID(id);
                if (ts !== null) { note = '<span class="un-note">' + escapeHtml(formatLocalTime(ts)) + "</span>"; }
            }
            html += '<div class="un-row"><span class="un-id">' + escapeHtml(id) + "</span>" + note +
                '<button type="button" class="un-copy" data-idx="' + i + '">复制</button></div>';
        }
        out.innerHTML = html;
        var btns = out.querySelectorAll(".un-copy");
        for (var b = 0; b < btns.length; b++) {
            btns[b].addEventListener("click", function () {
                copyText(lastIds[parseInt(this.getAttribute("data-idx"), 10)], "已复制该行 ID");
            });
        }
    }
    function gen() {
        var format = getFormat();
        lastFormat = format;
        var countRes = clampCount($("un-count").value);
        $("un-count").value = countRes.value;
        var messages = [];
        if (countRes.message) { messages.push(countRes.message); }
        try {
            if (format === "ulid") {
                var ts;
                if (getTimestampMode() === "custom") {
                    var raw = $("un-custom-time").value;
                    var parsed = raw ? new Date(raw).getTime() : NaN;
                    if (isNaN(parsed)) {
                        messages.push("自定义时间为空或非法，已回落到当前时间");
                        ts = Date.now();
                    } else { ts = parsed; }
                } else { ts = Date.now(); }
                checkTimestamp(ts);
                lastIds = generateBatch("ulid", { count: countRes.value, timestampMs: ts });
            } else {
                var lenRes = clampNanoLength($("un-length").value);
                $("un-length").value = lenRes.value;
                if (lenRes.message) { messages.push(lenRes.message); }
                lastIds = generateBatch("nanoid", { count: countRes.value, length: lenRes.value, alphabet: getAlphabet() });
            }
        } catch (e) {
            showMsg(e && e.message ? e.message : "生成失败", true);
            return;
        }
        render();
        showMsg((messages.length ? messages.join("；") + "。" : "") + "已生成 " + lastIds.length + " 条 ID。", false);
    }
    function copyAll() {
        if (!lastIds.length) { toast("请先生成 ID"); return; }
        copyText(buildIdsText(lastIds), "已复制 " + lastIds.length + " 条 ID");
    }
    function download() {
        if (!lastIds.length) { toast("请先生成 ID"); return; }
        var blob = new Blob([buildIdsText(lastIds)], { type: "text/plain;charset=utf-8" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "ids.txt";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
        toast("已下载 ids.txt");
    }
    document.addEventListener("DOMContentLoaded", function () {
        var fmtEls = document.querySelectorAll('input[name="un-format"]');
        for (var i = 0; i < fmtEls.length; i++) { fmtEls[i].addEventListener("change", syncPanels); }
        syncPanels();
        $("un-generate").addEventListener("click", gen);
        $("un-copy-all").addEventListener("click", copyAll);
        $("un-download").addEventListener("click", download);
        gen();
    });
}
})();
