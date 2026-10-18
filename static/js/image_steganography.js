/* 图片隐写工具 - 纯前端 LSB 隐写（图片藏文字 / 提取）
 *
 * 载体图 RGB 通道最低有效位嵌入 UTF-8 文本，导出 PNG（无损保位）。
 * 数据包格式（大端序）：
 *   字节 0-3  : 魔数 "STEG"
 *   字节 4    : 版本 0x01
 *   字节 5    : 加密标志 0x00 / 0x01
 *   字节 6-9  : 载荷长度（字节）
 *   字节 10-11: 载荷明文 CRC16-CCITT（口令错误/数据损坏时校验失败）
 *   字节 12+  : 载荷（UTF-8；设口令时为密钥流异或后的密文）
 * 口令加密为轻量混淆（FNV-1a 种子 + xorshift32 密钥流异或），防顺手查看，
 * 非军用级加密，页面内已如实说明。
 *
 * 图片和文字只在浏览器本地处理：无后端调用、无第三方依赖、无 CDN。
 */
(function () {
'use strict';

var MAGIC = [0x53, 0x54, 0x45, 0x47]; // "STEG"
var VERSION = 0x01;
var HEADER_LEN = 12;
var ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];

/* ---------- 纯函数：可在 node 下单元测试 ---------- */

function crc16(data) {
    var crc = 0xFFFF, i, b;
    for (i = 0; i < data.length; i++) {
        crc ^= (data[i] << 8);
        for (b = 0; b < 8; b++) {
            crc = (crc & 0x8000) ? (((crc << 1) ^ 0x1021) & 0xFFFF) : ((crc << 1) & 0xFFFF);
        }
    }
    return crc & 0xFFFF;
}

function fnv1a(str) {
    var h = 0x811c9dc5, i;
    for (i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

function keystream(seed, len) {
    var out = new Uint8Array(len), i;
    var x = seed >>> 0;
    if (x === 0) x = 0x9e3779b9;
    for (i = 0; i < len; i++) {
        x ^= (x << 13) >>> 0; x >>>= 0;
        x ^= x >>> 17;
        x ^= (x << 5) >>> 0; x >>>= 0;
        out[i] = (x >>> 24) & 0xFF;
    }
    return out;
}

function xorCrypt(data, password) {
    if (!password) return data;
    var ks = keystream(fnv1a(password), data.length);
    var out = new Uint8Array(data.length), i;
    for (i = 0; i < data.length; i++) out[i] = data[i] ^ ks[i];
    return out;
}

function buildPacket(text, password) {
    var plain = new TextEncoder().encode(text);
    var enc = !!password;
    var body = enc ? xorCrypt(plain, password) : plain;
    var pkt = new Uint8Array(HEADER_LEN + body.length);
    pkt[0] = 0x53; pkt[1] = 0x54; pkt[2] = 0x45; pkt[3] = 0x47;
    pkt[4] = VERSION;
    pkt[5] = enc ? 1 : 0;
    pkt[6] = (body.length >>> 24) & 0xFF;
    pkt[7] = (body.length >>> 16) & 0xFF;
    pkt[8] = (body.length >>> 8) & 0xFF;
    pkt[9] = body.length & 0xFF;
    var crc = crc16(plain);
    pkt[10] = (crc >>> 8) & 0xFF;
    pkt[11] = crc & 0xFF;
    pkt.set(body, HEADER_LEN);
    return pkt;
}

/* 容量（字节）= 每像素 3 比特（RGB 各 1 比特）- 12 字节包头 */
function capacityBytes(w, h) {
    return Math.floor(w * h * 3 / 8) - HEADER_LEN;
}

/* pixels: Uint8ClampedArray(RGBA)；跳过 alpha 通道写 RGB 最低位。
 * 返回 false 表示容量不足。 */
function embedBits(pixels, pkt) {
    var p = 0, i, j, bit;
    for (i = 0; i < pkt.length; i++) {
        for (j = 7; j >= 0; j--) {
            while ((p % 4) === 3) p++;
            if (p >= pixels.length) return false;
            bit = (pkt[i] >>> j) & 1;
            pixels[p] = (pixels[p] & 0xFE) | bit;
            p++;
        }
    }
    return true;
}

/* 按 RGB 最低位顺序读出全部可嵌入字节（含包头+载荷+尾部噪声） */
function extractBits(pixels) {
    var bytes = [], cur = 0, nbits = 0, p;
    for (p = 0; p < pixels.length; p++) {
        if ((p % 4) === 3) continue;
        cur = (cur << 1) | (pixels[p] & 1);
        if (++nbits === 8) { bytes.push(cur); cur = 0; nbits = 0; }
    }
    return new Uint8Array(bytes);
}

/* 解析数据包。返回 {ok, text?, bytes?, encrypted?, error?, needPassword?} */
function parsePacket(bytes, password) {
    var i;
    if (bytes.length < HEADER_LEN) {
        return { ok: false, error: '图片太小，无法容纳隐写数据（至少需要 ' + HEADER_LEN + ' 字节嵌入空间）' };
    }
    for (i = 0; i < 4; i++) {
        if (bytes[i] !== MAGIC[i]) {
            return { ok: false, error: '这张图片里没有找到隐写数据（魔数不匹配）。请确认上传的是本工具导出的 PNG 隐写图；JPG/WebP 转码会破坏像素最低位，无法提取。' };
        }
    }
    if (bytes[4] !== VERSION) {
        return { ok: false, error: '隐写数据版本不受支持（v' + bytes[4] + '），请用最新版工具提取。' };
    }
    var enc = bytes[5] === 1;
    var len = bytes[6] * 16777216 + (bytes[7] << 16) + (bytes[8] << 8) + bytes[9];
    if (len < 0 || len > bytes.length - HEADER_LEN) {
        return { ok: false, error: '数据长度字段异常（' + len + ' 字节），图片可能已损坏或并非隐写图。' };
    }
    if (enc && !password) {
        return { ok: false, needPassword: true, error: '这张隐写图设置了口令。请输入正确的口令后再提取（无口令无法解开）。' };
    }
    var body = bytes.slice(HEADER_LEN, HEADER_LEN + len);
    var crc = (bytes[10] << 8) | bytes[11];
    var plain = enc ? xorCrypt(body, password || '') : body;
    if (crc16(plain) !== crc) {
        if (enc) return { ok: false, error: '口令错误或图片已损坏（校验失败）。请检查口令是否正确，注意区分大小写。' };
        return { ok: false, error: '校验失败：隐写数据已损坏。常见原因是图片被压缩/转码/缩放过（会破坏像素最低位），请使用原始导出的 PNG 文件。' };
    }
    try {
        var text = new TextDecoder('utf-8', { fatal: true }).decode(plain);
        return { ok: true, text: text, bytes: len, encrypted: enc };
    } catch (e) {
        return { ok: false, error: '解码失败：载荷不是有效的 UTF-8 文本，图片可能已损坏。' };
    }
}

/* ---------- 浏览器 UI ---------- */

function $(id) { return document.getElementById(id); }

function toast(m) {
    var el = document.createElement('div');
    el.textContent = m;
    el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:86vw;text-align:center;';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2400);
}

function fmtNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

function loadBitmap(file) {
    if (typeof createImageBitmap === 'function') {
        return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return createImageBitmap(file); });
    }
    return new Promise(function (res, rej) {
        var url = URL.createObjectURL(file), img = new Image();
        img.onload = function () { URL.revokeObjectURL(url); res(img); };
        img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('decode')); };
        img.src = url;
    });
}

function drawToCanvas(canvas, bmp, w, h) {
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
}

/* ----- 嵌入模式状态 ----- */
var embBmp = null, embW = 0, embH = 0, embName = 'image', embCap = 0;
var stegoCanvas = null;

/* ----- 提取模式状态 ----- */
var extBmp = null, extW = 0, extH = 0;

function checkFile(file) {
    if (!file) return false;
    if (ACCEPT.indexOf(file.type) < 0 && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
        toast('仅支持 JPG / PNG / WebP 图片'); return false;
    }
    return true;
}

function updateCapacity() {
    var text = $('stg-text').value;
    var used = new TextEncoder().encode(text).length + HEADER_LEN;
    var cap = embCap;
    var remain = cap - used;
    var line = $('stg-capline'), btn = $('stg-embed-btn');
    if (embW === 0) {
        line.innerHTML = '请先上传载体图片';
        line.className = 'stg-capline';
        btn.disabled = true;
        return;
    }
    var over = remain < 0;
    line.innerHTML = '载体容量 <b>' + fmtNum(cap) + '</b> 字节 · 已用 <b>' + fmtNum(used) + '</b> 字节（文本 ' +
        fmtNum(used - HEADER_LEN) + ' + 包头 ' + HEADER_LEN + '）· 剩余 <b>' + fmtNum(remain) + '</b> 字节' +
        (over ? ' —— <b>超出容量 ' + fmtNum(-remain) + ' 字节</b>' : '');
    line.className = 'stg-capline' + (over ? ' stg-over' : '');
    var bar = $('stg-capbar-fill');
    bar.style.width = Math.min(100, Math.max(0, used / cap * 100)) + '%';
    bar.className = 'stg-capbar-fill' + (over ? ' stg-over' : '');
    btn.disabled = over || text.length === 0;
    if (over) {
        $('stg-cap-warn').style.display = 'block';
        $('stg-cap-warn').textContent = '⚠️ 文本超出载体容量 ' + fmtNum(-remain) + ' 字节，嵌入按钮已禁用。请缩短文本、去掉口令无关（口令不占容量），或换一张更大的图片。';
    } else {
        $('stg-cap-warn').style.display = 'none';
    }
}

function handleEmbedFile(file) {
    if (!checkFile(file)) return;
    $('stg-embed-status').textContent = '处理中…正在载入图片';
    loadBitmap(file).then(function (bmp) {
        embBmp = bmp;
        embW = bmp.width || bmp.naturalWidth;
        embH = bmp.height || bmp.naturalHeight;
        embName = (file.name || 'image').replace(/\.[^.]+$/, '');
        embCap = capacityBytes(embW, embH);
        $('stg-embed-info').style.display = 'block';
        $('stg-embed-info').textContent = '已载入：' + file.name + '（' + embW + ' × ' + embH +
            '，' + (file.size / 1024).toFixed(1) + ' KB）';
        $('stg-cap-panel').style.display = 'block';
        $('stg-result').style.display = 'none';
        $('stg-embed-status').textContent = '';
        if (embCap <= 0) {
            $('stg-capline').innerHTML = '<b style="color:#dc2626">图片太小，无法嵌入任何文本（容量 ' + embCap + ' 字节）。请换一张更大的图片。</b>';
            $('stg-embed-btn').disabled = true;
            return;
        }
        updateCapacity();
    }).catch(function () {
        $('stg-embed-status').textContent = '';
        toast('图片读取失败，请换一张试试');
    });
}

function doEmbed() {
    var text = $('stg-text').value;
    if (!text) { toast('请先输入要隐藏的文字'); return; }
    if (!embBmp) { toast('请先上传载体图片'); return; }
    var pwd = $('stg-pwd').value;
    var pkt;
    try {
        pkt = buildPacket(text, pwd);
    } catch (e) {
        toast('文本编码失败：' + e.message); return;
    }
    if (pkt.length > embCap + HEADER_LEN) { // 含包头的总字节 vs 可用比特
        toast('文本超出载体容量，无法嵌入'); return;
    }
    // 原图分辨率画布：逐像素写最低位
    var src = document.createElement('canvas');
    drawToCanvas(src, embBmp, embW, embH);
    var ctx = src.getContext('2d');
    var imgData = ctx.getImageData(0, 0, embW, embH);
    if (!embedBits(imgData.data, pkt)) {
        toast('嵌入失败：容量不足（理论值与实际写入不一致）'); return;
    }
    ctx.putImageData(imgData, 0, 0);
    stegoCanvas = src;
    renderCompare();
    $('stg-result').style.display = 'block';
    $('stg-result-info').textContent = '嵌入成功：' + fmtNum(pkt.length - HEADER_LEN) + ' 字节文本（含包头 ' +
        fmtNum(pkt.length) + ' 字节）已写入 ' + embW + ' × ' + embH + ' 像素' +
        (pwd ? '（已设口令保护）' : '（未设口令）') + '。请导出 PNG 后再分享，JPG 转码会破坏隐写数据。';
    toast('嵌入成功，可导出 PNG');
}

function fitSize(w, h, maxW) {
    var s = Math.min(1, maxW / w);
    return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

function renderCompare() {
    if (!embBmp || !stegoCanvas) return;
    var size = fitSize(embW, embH, 860);
    var cw = size[0], ch = size[1];
    var c1 = $('stg-cmp-carrier'), c2 = $('stg-cmp-stego');
    drawToCanvas(c1, embBmp, cw, ch);
    var tmp = document.createElement('canvas');
    drawToCanvas(tmp, stegoCanvas, cw, ch);
    var x2 = c2.getContext('2d');
    c2.width = cw; c2.height = ch;
    x2.drawImage(tmp, 0, 0);
    $('stg-compare').style.display = 'block';
    updateCompare($('stg-compare-range').value);
}

function updateCompare(v) {
    var pct = Math.max(0, Math.min(100, Number(v)));
    $('stg-compare-view').style.setProperty('--pos', pct + '%');
    $('stg-compare-val').textContent = pct + '%';
}

function downloadPNG() {
    if (!stegoCanvas) { toast('请先执行嵌入'); return; }
    stegoCanvas.toBlob(function (blob) {
        if (!blob) { toast('导出失败，请重试'); return; }
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = '隐写图_' + embName + '.png';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            URL.revokeObjectURL(a.href);
            if (a.parentNode) a.parentNode.removeChild(a);
        }, 4000);
        toast('PNG 已导出（无损，像素最低位完整保留）');
    }, 'image/png');
}

/* ----- 提取 ----- */

function handleExtractFile(file) {
    if (!checkFile(file)) return;
    $('stg-ext-status').textContent = '处理中…正在载入图片';
    loadBitmap(file).then(function (bmp) {
        extBmp = bmp;
        extW = bmp.width || bmp.naturalWidth;
        extH = bmp.height || bmp.naturalHeight;
        $('stg-ext-info').style.display = 'block';
        $('stg-ext-info').textContent = '已载入：' + file.name + '（' + extW + ' × ' + extH + '）';
        $('stg-ext-status').textContent = '';
        $('stg-ext-tip').style.display = 'none';
        $('stg-ext-out').style.display = 'none';
        doExtract(); // 上传后自动尝试提取（无口令）
    }).catch(function () {
        $('stg-ext-status').textContent = '';
        toast('图片读取失败，请换一张试试');
    });
}

function doExtract() {
    var tip = $('stg-ext-tip'), out = $('stg-ext-out');
    tip.style.display = 'none'; out.style.display = 'none';
    if (!extBmp) { toast('请先上传要提取的图片（PNG）'); return; }
    var pwd = $('stg-ext-pwd').value;
    var cv = document.createElement('canvas');
    drawToCanvas(cv, extBmp, extW, extH);
    var data;
    try {
        data = cv.getContext('2d').getImageData(0, 0, extW, extH).data;
    } catch (e) {
        tip.style.display = 'block';
        tip.className = 'stg-tip stg-tip-err';
        tip.textContent = '读取像素失败：' + e.message;
        return;
    }
    var r = parsePacket(extractBits(data), pwd);
    if (!r.ok) {
        tip.style.display = 'block';
        tip.className = 'stg-tip ' + (r.needPassword ? 'stg-tip-warn' : 'stg-tip-err');
        tip.textContent = (r.needPassword ? '🔑 ' : '❌ ') + r.error;
        return;
    }
    out.style.display = 'block';
    $('stg-ext-text').value = r.text;
    $('stg-ext-meta').textContent = '提取成功：' + fmtNum(r.bytes) + ' 字节' +
        (r.encrypted ? '（口令保护，已用口令解开）' : '（未加密）');
    toast('提取成功');
}

function copyText(id) {
    var el = $(id);
    function done() { toast('已复制到剪贴板'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(el.value).then(done, function () { fallback(); });
    } else { fallback(); }
    function fallback() {
        el.focus(); el.select();
        try { document.execCommand('copy'); done(); }
        catch (e) { toast('复制失败，请手动选中复制'); }
    }
}

/* ----- 上传区通用 ----- */

function bindUpload(zoneId, inputId, handler) {
    var zone = $(zoneId), input = $(inputId);
    zone.addEventListener('click', function () { input.click(); });
    zone.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', function () {
        if (input.files && input.files[0]) handler(input.files[0]);
        input.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
        zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
        zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('dragover'); });
    });
    zone.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) handler(f);
    });
}

function bindTabs() {
    var tabs = document.querySelectorAll('.stg-tab');
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].addEventListener('click', function () {
            for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
            this.classList.add('active');
            var m = this.getAttribute('data-mode');
            $('stg-embed-panel').style.display = m === 'embed' ? 'block' : 'none';
            $('stg-extract-panel').style.display = m === 'extract' ? 'block' : 'none';
        });
    }
}

function init() {
    bindTabs();
    bindUpload('stg-embed-upload', 'stg-embed-file', handleEmbedFile);
    bindUpload('stg-ext-upload', 'stg-ext-file', handleExtractFile);

    $('stg-text').addEventListener('input', updateCapacity);
    $('stg-embed-btn').addEventListener('click', doEmbed);
    $('stg-download').addEventListener('click', downloadPNG);
    $('stg-sample').addEventListener('click', function () {
        $('stg-text').value = '这是图片隐写工具的示例文本。\n把这段话藏进图片像素的最低位里，肉眼几乎看不出差别，导出 PNG 后重新上传即可完整提取。\n中文 UTF-8 全程无损，试试加上口令再提取吧！🔒';
        updateCapacity();
    });
    $('stg-clear').addEventListener('click', function () {
        $('stg-text').value = ''; $('stg-pwd').value = '';
        $('stg-result').style.display = 'none';
        updateCapacity();
    });
    $('stg-compare-range').addEventListener('input', function () { updateCompare(this.value); });
    $('stg-reupload-embed').addEventListener('click', function () {
        embBmp = null; embW = 0; embH = 0; stegoCanvas = null;
        $('stg-embed-info').style.display = 'none';
        $('stg-cap-panel').style.display = 'none';
        $('stg-result').style.display = 'none';
        updateCapacity();
    });

    $('stg-ext-btn').addEventListener('click', doExtract);
    $('stg-ext-copy').addEventListener('click', function () { copyText('stg-ext-text'); });
    $('stg-reupload-ext').addEventListener('click', function () {
        extBmp = null;
        $('stg-ext-info').style.display = 'none';
        $('stg-ext-tip').style.display = 'none';
        $('stg-ext-out').style.display = 'none';
    });

    // 密码显隐
    var pwds = document.querySelectorAll('.stg-pwd-toggle');
    for (var i = 0; i < pwds.length; i++) {
        pwds[i].addEventListener('click', function () {
            var inp = this.parentNode.querySelector('input');
            var show = inp.type === 'password';
            inp.type = show ? 'text' : 'password';
            this.textContent = show ? '🙈' : '👁';
        });
    }
    updateCapacity();
}

if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', init);
}

/* node 单元测试导出（浏览器中无影响） */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        crc16: crc16, fnv1a: fnv1a, keystream: keystream, xorCrypt: xorCrypt,
        buildPacket: buildPacket, parsePacket: parsePacket,
        capacityBytes: capacityBytes, embedBits: embedBits, extractBits: extractBits,
        HEADER_LEN: HEADER_LEN
    };
}

})();
