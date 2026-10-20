/* 文件校验和计算器 · 纯逻辑核心（零依赖）
 * - 纯 JS 增量 SHA-256 / SHA-512 / SHA-1 摘要器（update/digest，可分片喂数据）
 *   常量表由第一性原理生成（素数立方根/平方根小数部分），已用 node:crypto 交叉验证
 * - 官方哈希归一化 / 比对逻辑
 * - 被三处复用：浏览器主线程 <script>、Web Worker importScripts、node 单元测试
 *   node tests/file_checksum.test.js
 */
(function (root, factory) {
    var api = factory();
    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    } else {
        root.FCCore = api;
    }
})(typeof self !== "undefined" ? self : this, function () {
"use strict";

/* 分片大小：4MB（规格要求 4~8MB；4MB 在进度粒度与内存间取平衡） */
var CHUNK_SIZE = 4 * 1024 * 1024;

var ALGORITHMS = [
    { id: "sha256", name: "SHA-256", hexLen: 64 },
    { id: "sha512", name: "SHA-512", hexLen: 128 },
    { id: "sha1",   name: "SHA-1",   hexLen: 40 }
];

function algoById(id) {
    for (var i = 0; i < ALGORITHMS.length; i++) {
        if (ALGORITHMS[i].id === id) return ALGORITHMS[i];
    }
    return null;
}

function rotr32(x, n) { return (x >>> n) | (x << (32 - n)); }
function rotl32(x, n) { return (x << n) | (x >>> (32 - n)); }

function wordToHex(w) {
    var s = (w >>> 0).toString(16);
    while (s.length < 8) s = "0" + s;
    return s;
}

/* ================= SHA-256（FIPS 180-4） ================= */
var K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];
var H256_INIT = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
var W256 = new Array(64);

function sha256Compress(h, data, off) {
    var i, w = W256, t;
    for (i = 0; i < 16; i++) {
        w[i] = ((data[off + i * 4] << 24) | (data[off + i * 4 + 1] << 16) |
                (data[off + i * 4 + 2] << 8) | data[off + i * 4 + 3]) >>> 0;
    }
    for (i = 16; i < 64; i++) {
        var s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        var s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (i = 0; i < 64; i++) {
        var S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (hh + S1 + ch + K256[i] + w[i]) | 0;
        var S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
}

function Sha256Hasher() {
    this.h = H256_INIT.slice();
    this.buf = new Uint8Array(64);
    this.bufLen = 0;
    this.len = 0;
}
/* 通用分块喂数据：hasher 须有 h/buf/bufLen/len；compress(h, data, off) 按 blockSize 处理 */
function blockUpdate(hasher, data, compress, blockSize) {
    var n = data.length, off = 0;
    hasher.len += n;
    if (hasher.bufLen > 0) {
        var need = blockSize - hasher.bufLen;
        var take = n < need ? n : need;
        hasher.buf.set(data.subarray(0, take), hasher.bufLen);
        hasher.bufLen += take; off += take;
        if (hasher.bufLen === blockSize) { compress(hasher.h, hasher.buf, 0); hasher.bufLen = 0; }
    }
    while (off + blockSize <= n) { compress(hasher.h, data, off); off += blockSize; }
    if (off < n) { hasher.buf.set(data.subarray(off), 0); hasher.bufLen = n - off; }
    return hasher;
}
Sha256Hasher.prototype.update = function (data) {
    return blockUpdate(this, data, sha256Compress, 64);
};
Sha256Hasher.prototype.digest = function () {
    var bitHi = Math.floor(this.len / 0x20000000) >>> 0;
    var bitLo = ((this.len % 0x20000000) * 8) >>> 0;
    var padLen = (this.bufLen < 56) ? (56 - this.bufLen) : (120 - this.bufLen);
    var tail = new Uint8Array(padLen + 8);
    tail[0] = 0x80;
    tail[padLen]     = (bitHi >>> 24) & 0xff;
    tail[padLen + 1] = (bitHi >>> 16) & 0xff;
    tail[padLen + 2] = (bitHi >>> 8) & 0xff;
    tail[padLen + 3] = bitHi & 0xff;
    tail[padLen + 4] = (bitLo >>> 24) & 0xff;
    tail[padLen + 5] = (bitLo >>> 16) & 0xff;
    tail[padLen + 6] = (bitLo >>> 8) & 0xff;
    tail[padLen + 7] = bitLo & 0xff;
    var h = this.h.slice();
    var total = new Uint8Array(this.bufLen + tail.length);
    total.set(this.buf.subarray(0, this.bufLen), 0);
    total.set(tail, this.bufLen);
    for (var off = 0; off < total.length; off += 64) sha256Compress(h, total, off);
    var out = "";
    for (var i = 0; i < 8; i++) out += wordToHex(h[i]);
    return out;
};

/* ================= SHA-1（FIPS 180-4） ================= */
var H1_INIT = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
var W1 = new Array(80);

function sha1Compress(h, data, off) {
    var i, w = W1;
    for (i = 0; i < 16; i++) {
        w[i] = ((data[off + i * 4] << 24) | (data[off + i * 4 + 1] << 16) |
                (data[off + i * 4 + 2] << 8) | data[off + i * 4 + 3]) >>> 0;
    }
    for (i = 16; i < 80; i++) w[i] = rotl32(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f, k;
    for (i = 0; i < 80; i++) {
        if (i < 20)      { f = (b & c) | (~b & d); k = 0x5a827999; }
        else if (i < 40) { f = b ^ c ^ d;          k = 0x6ed9eba1; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
        else             { f = b ^ c ^ d;          k = 0xca62c1d6; }
        var t = (rotl32(a, 5) + f + e + k + w[i]) | 0;
        e = d; d = c; c = rotl32(b, 30); b = a; a = t;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0; h[4] = (h[4] + e) | 0;
}

function Sha1Hasher() {
    this.h = H1_INIT.slice();
    this.buf = new Uint8Array(64);
    this.bufLen = 0;
    this.len = 0;
}
Sha1Hasher.prototype.update = function (data) {
    return blockUpdate(this, data, sha1Compress, 64);
};
Sha1Hasher.prototype.digest = function () {
    var bitHi = Math.floor(this.len / 0x20000000) >>> 0;
    var bitLo = ((this.len % 0x20000000) * 8) >>> 0;
    var padLen = (this.bufLen < 56) ? (56 - this.bufLen) : (120 - this.bufLen);
    var tail = new Uint8Array(padLen + 8);
    tail[0] = 0x80;
    tail[padLen]     = (bitHi >>> 24) & 0xff;
    tail[padLen + 1] = (bitHi >>> 16) & 0xff;
    tail[padLen + 2] = (bitHi >>> 8) & 0xff;
    tail[padLen + 3] = bitHi & 0xff;
    tail[padLen + 4] = (bitLo >>> 24) & 0xff;
    tail[padLen + 5] = (bitLo >>> 16) & 0xff;
    tail[padLen + 6] = (bitLo >>> 8) & 0xff;
    tail[padLen + 7] = bitLo & 0xff;
    var h = this.h.slice();
    var total = new Uint8Array(this.bufLen + tail.length);
    total.set(this.buf.subarray(0, this.bufLen), 0);
    total.set(tail, this.bufLen);
    for (var off = 0; off < total.length; off += 64) sha1Compress(h, total, off);
    var out = "";
    for (var i = 0; i < 5; i++) out += wordToHex(h[i]);
    return out;
};

/* ================= SHA-512（FIPS 180-4） =================
 * JS 位运算只有 32 位，64 位字用 [hi, lo] 对表示（均为有符号 32 位整数槽位）。
 */
var K512 = [
    [0x428a2f98, 0xd728ae22], [0x71374491, 0x23ef65cd], [0xb5c0fbcf, 0xec4d3b2f], [0xe9b5dba5, 0x8189dbbc],
    [0x3956c25b, 0xf348b538], [0x59f111f1, 0xb605d019], [0x923f82a4, 0xaf194f9b], [0xab1c5ed5, 0xda6d8118],
    [0xd807aa98, 0xa3030242], [0x12835b01, 0x45706fbe], [0x243185be, 0x4ee4b28c], [0x550c7dc3, 0xd5ffb4e2],
    [0x72be5d74, 0xf27b896f], [0x80deb1fe, 0x3b1696b1], [0x9bdc06a7, 0x25c71235], [0xc19bf174, 0xcf692694],
    [0xe49b69c1, 0x9ef14ad2], [0xefbe4786, 0x384f25e3], [0x0fc19dc6, 0x8b8cd5b5], [0x240ca1cc, 0x77ac9c65],
    [0x2de92c6f, 0x592b0275], [0x4a7484aa, 0x6ea6e483], [0x5cb0a9dc, 0xbd41fbd4], [0x76f988da, 0x831153b5],
    [0x983e5152, 0xee66dfab], [0xa831c66d, 0x2db43210], [0xb00327c8, 0x98fb213f], [0xbf597fc7, 0xbeef0ee4],
    [0xc6e00bf3, 0x3da88fc2], [0xd5a79147, 0x930aa725], [0x06ca6351, 0xe003826f], [0x14292967, 0x0a0e6e70],
    [0x27b70a85, 0x46d22ffc], [0x2e1b2138, 0x5c26c926], [0x4d2c6dfc, 0x5ac42aed], [0x53380d13, 0x9d95b3df],
    [0x650a7354, 0x8baf63de], [0x766a0abb, 0x3c77b2a8], [0x81c2c92e, 0x47edaee6], [0x92722c85, 0x1482353b],
    [0xa2bfe8a1, 0x4cf10364], [0xa81a664b, 0xbc423001], [0xc24b8b70, 0xd0f89791], [0xc76c51a3, 0x0654be30],
    [0xd192e819, 0xd6ef5218], [0xd6990624, 0x5565a910], [0xf40e3585, 0x5771202a], [0x106aa070, 0x32bbd1b8],
    [0x19a4c116, 0xb8d2d0c8], [0x1e376c08, 0x5141ab53], [0x2748774c, 0xdf8eeb99], [0x34b0bcb5, 0xe19b48a8],
    [0x391c0cb3, 0xc5c95a63], [0x4ed8aa4a, 0xe3418acb], [0x5b9cca4f, 0x7763e373], [0x682e6ff3, 0xd6b2b8a3],
    [0x748f82ee, 0x5defb2fc], [0x78a5636f, 0x43172f60], [0x84c87814, 0xa1f0ab72], [0x8cc70208, 0x1a6439ec],
    [0x90befffa, 0x23631e28], [0xa4506ceb, 0xde82bde9], [0xbef9a3f7, 0xb2c67915], [0xc67178f2, 0xe372532b],
    [0xca273ece, 0xea26619c], [0xd186b8c7, 0x21c0c207], [0xeada7dd6, 0xcde0eb1e], [0xf57d4f7f, 0xee6ed178],
    [0x06f067aa, 0x72176fba], [0x0a637dc5, 0xa2c898a6], [0x113f9804, 0xbef90dae], [0x1b710b35, 0x131c471b],
    [0x28db77f5, 0x23047d84], [0x32caab7b, 0x40c72493], [0x3c9ebe0a, 0x15c9bebc], [0x431d67c4, 0x9c100d4c],
    [0x4cc5d4be, 0xcb3e42b6], [0x597f299c, 0xfc657e2a], [0x5fcb6fab, 0x3ad6faec], [0x6c44198c, 0x4a475817]
];
var H512_INIT = [
    [0x6a09e667, 0xf3bcc908], [0xbb67ae85, 0x84caa73b], [0x3c6ef372, 0xfe94f82b], [0xa54ff53a, 0x5f1d36f1],
    [0x510e527f, 0xade682d1], [0x9b05688c, 0x2b3e6c1f], [0x1f83d9ab, 0xfb41bd6b], [0x5be0cd19, 0x137e2179]
];
var W512 = [];
(function () { for (var i = 0; i < 80; i++) W512.push([0, 0]); })();

function xor64(a, b) { return [a[0] ^ b[0], a[1] ^ b[1]]; }
function and64(a, b) { return [a[0] & b[0], a[1] & b[1]]; }
function not64(a)    { return [~a[0], ~a[1]]; }
function rotr64(x, n) {
    n %= 64;
    if (n === 0) return [x[0], x[1]];
    if (n === 32) return [x[1], x[0]];
    if (n < 32) {
        return [((x[0] >>> n) | (x[1] << (32 - n))) | 0,
                ((x[1] >>> n) | (x[0] << (32 - n))) | 0];
    }
    n -= 32;
    return [((x[1] >>> n) | (x[0] << (32 - n))) | 0,
            ((x[0] >>> n) | (x[1] << (32 - n))) | 0];
}
function shr64(x, n) { /* 0 < n < 32 */
    return [(x[0] >>> n) | 0, (((x[1] >>> n) | (x[0] << (32 - n))) | 0)];
}
/* 多个 64 位数求和（mod 2^64）：用 double 精确累加，无符号语义 */
function sum64(terms) {
    var hi = 0, lo = 0, c, s;
    for (var i = 0; i < terms.length; i++) {
        s = lo + (terms[i][1] >>> 0);
        c = Math.floor(s / 0x100000000);
        lo = s - c * 0x100000000;
        s = hi + (terms[i][0] >>> 0) + c;
        c = Math.floor(s / 0x100000000);
        hi = s - c * 0x100000000;
    }
    return [hi | 0, lo | 0];
}
function ch64(x, y, z)  { return xor64(and64(x, y), and64(not64(x), z)); }
function maj64(x, y, z) { return xor64(xor64(and64(x, y), and64(x, z)), and64(y, z)); }

function sha512Compress(h, data, off) {
    var i, w = W512, t;
    for (i = 0; i < 16; i++) {
        var o = off + i * 8;
        w[i][0] = ((data[o] << 24) | (data[o + 1] << 16) | (data[o + 2] << 8) | data[o + 3]) | 0;
        w[i][1] = ((data[o + 4] << 24) | (data[o + 5] << 16) | (data[o + 6] << 8) | data[o + 7]) | 0;
    }
    for (i = 16; i < 80; i++) {
        var s0 = xor64(xor64(rotr64(w[i - 15], 1), rotr64(w[i - 15], 8)), shr64(w[i - 15], 7));
        var s1 = xor64(xor64(rotr64(w[i - 2], 19), rotr64(w[i - 2], 61)), shr64(w[i - 2], 6));
        var ww = sum64([w[i - 16], s0, w[i - 7], s1]);
        w[i][0] = ww[0]; w[i][1] = ww[1];
    }
    var a = [h[0][0], h[0][1]], b = [h[1][0], h[1][1]], c = [h[2][0], h[2][1]], d = [h[3][0], h[3][1]],
        e = [h[4][0], h[4][1]], f = [h[5][0], h[5][1]], g = [h[6][0], h[6][1]], hh = [h[7][0], h[7][1]];
    for (i = 0; i < 80; i++) {
        var S1 = xor64(xor64(rotr64(e, 14), rotr64(e, 18)), rotr64(e, 41));
        var t1 = sum64([hh, S1, ch64(e, f, g), K512[i], w[i]]);
        var S0 = xor64(xor64(rotr64(a, 28), rotr64(a, 34)), rotr64(a, 39));
        var t2 = sum64([S0, maj64(a, b, c)]);
        hh = g; g = f; f = e; e = sum64([d, t1]);
        d = c; c = b; b = a; a = sum64([t1, t2]);
    }
    for (i = 0; i < 8; i++) {
        var nh = sum64([h[i], [a, b, c, d, e, f, g, hh][i]]);
        h[i][0] = nh[0]; h[i][1] = nh[1];
    }
}

function Sha512Hasher() {
    this.h = [];
    for (var i = 0; i < 8; i++) this.h.push([H512_INIT[i][0], H512_INIT[i][1]]);
    this.buf = new Uint8Array(128);
    this.bufLen = 0;
    this.len = 0;
}
Sha512Hasher.prototype.update = function (data) {
    return blockUpdate(this, data, sha512Compress, 128);
};
Sha512Hasher.prototype.digest = function () {
    /* 128 位大端比特长度；len < 2^53，故高 64 位为 0 */
    var b2 = Math.floor(this.len / 0x20000000);      /* floor(8*len / 2^32) */
    var b1 = (this.len % 0x20000000) * 8;            /* 8*len mod 2^32 */
    var padLen = (this.bufLen < 112) ? (112 - this.bufLen) : (240 - this.bufLen);
    var tail = new Uint8Array(padLen + 16);
    tail[0] = 0x80;
    tail[padLen + 10] = (b2 >>> 8) & 0xff;
    tail[padLen + 11] = b2 & 0xff;
    tail[padLen + 12] = (b1 >>> 24) & 0xff;
    tail[padLen + 13] = (b1 >>> 16) & 0xff;
    tail[padLen + 14] = (b1 >>> 8) & 0xff;
    tail[padLen + 15] = b1 & 0xff;
    var h = [];
    for (var i = 0; i < 8; i++) h.push([this.h[i][0], this.h[i][1]]);
    var total = new Uint8Array(this.bufLen + tail.length);
    total.set(this.buf.subarray(0, this.bufLen), 0);
    total.set(tail, this.bufLen);
    for (var off = 0; off < total.length; off += 128) sha512Compress(h, total, off);
    var out = "";
    for (i = 0; i < 8; i++) out += wordToHex(h[i][0]) + wordToHex(h[i][1]);
    return out;
};

/* ================= 工厂 ================= */
function create(algoId) {
    if (algoId === "sha256") return new Sha256Hasher();
    if (algoId === "sha512") return new Sha512Hasher();
    if (algoId === "sha1")   return new Sha1Hasher();
    throw new Error("不支持的算法: " + algoId);
}

/* 一次性计算（小数据便捷函数） */
function hashBytes(algoId, data) {
    return create(algoId).update(data).digest();
}

/* ================= 官方哈希归一化 / 比对 =================
 * 归一化：去全部空白（空格/换行/制表）、转小写；
 * 兼容 sha256sum 常见输出形态 "哈希值  文件名"（取首个十六进制 token）。
 */
function normalizeHash(s) {
    if (s == null) return "";
    s = String(s);
    /* sha*sum 行只在首个 token 像完整摘要（≥32 个十六进制字符）时才截取，
     * 避免把带空格的短哈希误判为 "哈希 文件名" 形态 */
    var m = /^[ \t]*([0-9a-fA-F]{32,128})[ \t]+\*?[^\s]/m.exec(s);
    if (m) s = m[1];
    return s.replace(/\s+/g, "").toLowerCase();
}

/* 返回 {match:boolean, normA, normB}；任一为空视为不匹配 */
function compareHash(computed, expected) {
    var a = normalizeHash(computed), b = normalizeHash(expected);
    if (!a || !b) return { match: false, normA: a, normB: b };
    return { match: a === b, normA: a, normB: b };
}

/* 文件大小人性化 */
function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    var units = ["KB", "MB", "GB", "TB"], v = bytes / 1024, u = 0;
    while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
    return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + " " + units[u];
}

return {
    CHUNK_SIZE: CHUNK_SIZE,
    ALGORITHMS: ALGORITHMS,
    algoById: algoById,
    create: create,
    hashBytes: hashBytes,
    normalizeHash: normalizeHash,
    compareHash: compareHash,
    formatSize: formatSize
};
});
