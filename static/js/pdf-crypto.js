/* PDF 标准加密/解密核心（V=1/2/4，对应 R=2/3/4；RC4 / AES-128 AESV2）
 * 无第三方依赖，Node 与浏览器通用。
 * 算法依据 PDF 32000-1 §7.6（算法 1~7），关键推导与 pdf.js 3.11.174 src/core/crypto.js 交叉核对。
 *  - encryptPdf(bytes, opts): 对 PDF 字节做标准密码加密，返回加密后字节
 *  - decryptPdf(bytes, password): 用密码解除标准加密，返回无密码 PDF 字节（V<=4）
 *  - getEncryptInfo(bytes): 快速读取加密字典信息（不需密码），未加密返回 null
 *  - PdfCryptoError: code ∈ WRONG_PASSWORD / NOT_ENCRYPTED / UNSUPPORTED / CORRUPT
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.PdfCrypto = factory();
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

function PdfCryptoError(code, message) {
  this.name = 'PdfCryptoError';
  this.code = code;
  this.message = message;
}
PdfCryptoError.prototype = Object.create(Error.prototype);
PdfCryptoError.prototype.constructor = PdfCryptoError;

/* ================= 字节/字符串工具 ================= */
function strToBytes(s) {
  var b = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}
function bytesToStr(b) {
  var s = '';
  var CHUNK = 8192;
  for (var i = 0; i < b.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, b.subarray(i, Math.min(i + CHUNK, b.length)));
  }
  return s;
}
function utf8Bytes(str) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
  var out = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return new Uint8Array(out);
}
function concatBytes(list) {
  var total = 0, i;
  for (i = 0; i < list.length; i++) total += list[i].length;
  var out = new Uint8Array(total), off = 0;
  for (i = 0; i < list.length; i++) { out.set(list[i], off); off += list[i].length; }
  return out;
}
var HEXD = '0123456789ABCDEF';
function bytesToHex(b) {
  var s = '';
  for (var i = 0; i < b.length; i++) s += HEXD[(b[i] >> 4) & 15] + HEXD[b[i] & 15];
  return s;
}
function hexToBytes(h) {
  h = h.replace(/\s+/g, '');
  if (h.length % 2 === 1) h += '0';
  var b = new Uint8Array(h.length / 2);
  for (var i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16);
  return b;
}
function randomBytes(n) {
  var b = new Uint8Array(n);
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) { crypto.getRandomValues(b); return b; }
  } catch (e) {}
  try {
    if (typeof require !== 'undefined') {
      var r = require('crypto').randomBytes(n);
      b.set(r); return b;
    }
  } catch (e2) {}
  for (var i = 0; i < n; i++) b[i] = (Math.random() * 256) | 0;
  return b;
}
function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/* ================= MD5 ================= */
function md5(msg) {
  function rl(n, c) { return (n << c) | (n >>> (32 - c)); }
  var origLen = msg.length;
  var withOne = new Uint8Array(origLen + 1); withOne.set(msg); withOne[origLen] = 0x80;
  var totalLen = withOne.length;
  var padLen = (56 - (totalLen % 64) + 64) % 64;
  var out = new Uint8Array(totalLen + padLen + 8);
  out.set(withOne);
  var bitLenHi = Math.floor(origLen / 0x20000000), bitLenLo = (origLen << 3) >>> 0;
  for (var i = 0; i < 4; i++) {
    out[totalLen + padLen + i] = (bitLenLo >>> (i * 8)) & 0xff;
    out[totalLen + padLen + 4 + i] = (bitLenHi >>> (i * 8)) & 0xff;
  }
  var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  var S = [7,12,17,22, 7,12,17,22, 7,12,17,22, 7,12,17,22,
           5,9,14,20, 5,9,14,20, 5,9,14,20, 5,9,14,20,
           4,11,16,23, 4,11,16,23, 4,11,16,23, 4,11,16,23,
           6,10,15,21, 6,10,15,21, 6,10,15,21, 6,10,15,21];
  var K = new Array(64);
  for (i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
  var M = new Array(16);
  for (var off = 0; off < out.length; off += 64) {
    for (i = 0; i < 16; i++) M[i] = (out[off + i*4] | (out[off + i*4+1] << 8) | (out[off + i*4+2] << 16) | (out[off + i*4+3] << 24)) | 0;
    var A = a0, B = b0, C = c0, D = d0, F, g, tmp;
    for (i = 0; i < 64; i++) {
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) | 0;
      A = D; D = C; C = B;
      B = (B + rl(F, S[i])) | 0;
      void tmp;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }
  var d = new Uint8Array(16);
  var ws = [a0, b0, c0, d0];
  for (i = 0; i < 4; i++) for (var j = 0; j < 4; j++) d[i*4+j] = (ws[i] >>> (j*8)) & 0xff;
  return d;
}

/* ================= RC4 ================= */
function rc4(key, data) {
  var s = new Uint8Array(256), j = 0, i, tmp;
  for (i = 0; i < 256; i++) s[i] = i;
  for (i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 0xff;
    tmp = s[i]; s[i] = s[j]; s[j] = tmp;
  }
  var out = new Uint8Array(data.length);
  var x = 0; j = 0;
  for (i = 0; i < data.length; i++) {
    x = (x + 1) & 0xff; j = (j + s[x]) & 0xff;
    tmp = s[x]; s[x] = s[j]; s[j] = tmp;
    out[i] = data[i] ^ s[(s[x] + s[j]) & 0xff];
  }
  return out;
}
function rc4_19(key, data) { // RC4 + 19 次 XOR 迭代（算法 3/4/5）
  var cur = rc4(key, data);
  var n = key.length;
  var dk = new Uint8Array(n);
  for (var j = 1; j <= 19; j++) {
    for (var k = 0; k < n; k++) dk[k] = key[k] ^ j;
    cur = rc4(dk, cur);
  }
  return cur;
}
/* ================= AES-128 (FIPS-197) ================= */
var AES_SBOX = [
0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16];
var AES_INV_SBOX = [
0x52,0x09,0x6a,0xd5,0x30,0x36,0xa5,0x38,0xbf,0x40,0xa3,0x9e,0x81,0xf3,0xd7,0xfb,
0x7c,0xe3,0x39,0x82,0x9b,0x2f,0xff,0x87,0x34,0x8e,0x43,0x44,0xc4,0xde,0xe9,0xcb,
0x54,0x7b,0x94,0x32,0xa6,0xc2,0x23,0x3d,0xee,0x4c,0x95,0x0b,0x42,0xfa,0xc3,0x4e,
0x08,0x2e,0xa1,0x66,0x28,0xd9,0x24,0xb2,0x76,0x5b,0xa2,0x49,0x6d,0x8b,0xd1,0x25,
0x72,0xf8,0xf6,0x64,0x86,0x68,0x98,0x16,0xd4,0xa4,0x5c,0xcc,0x5d,0x65,0xb6,0x92,
0x6c,0x70,0x48,0x50,0xfd,0xed,0xb9,0xda,0x5e,0x15,0x46,0x57,0xa7,0x8d,0x9d,0x84,
0x90,0xd8,0xab,0x00,0x8c,0xbc,0xd3,0x0a,0xf7,0xe4,0x58,0x05,0xb8,0xb3,0x45,0x06,
0xd0,0x2c,0x1e,0x8f,0xca,0x3f,0x0f,0x02,0xc1,0xaf,0xbd,0x03,0x01,0x13,0x8a,0x6b,
0x3a,0x91,0x11,0x41,0x4f,0x67,0xdc,0xea,0x97,0xf2,0xcf,0xce,0xf0,0xb4,0xe6,0x73,
0x96,0xac,0x74,0x22,0xe7,0xad,0x35,0x85,0xe2,0xf9,0x37,0xe8,0x1c,0x75,0xdf,0x6e,
0x47,0xf1,0x1a,0x71,0x1d,0x29,0xc5,0x89,0x6f,0xb7,0x62,0x0e,0xaa,0x18,0xbe,0x1b,
0xfc,0x56,0x3e,0x4b,0xc6,0xd2,0x79,0x20,0x9a,0xdb,0xc0,0xfe,0x78,0xcd,0x5a,0xf4,
0x1f,0xdd,0xa8,0x33,0x88,0x07,0xc7,0x31,0xb1,0x12,0x10,0x59,0x27,0x80,0xec,0x5f,
0x60,0x51,0x7f,0xa9,0x19,0xb5,0x4a,0x0d,0x2d,0xe5,0x7a,0x9f,0x93,0xc9,0x9c,0xef,
0xa0,0xe0,0x3b,0x4d,0xae,0x2a,0xf5,0xb0,0xc8,0xeb,0xbb,0x3c,0x83,0x53,0x99,0x61,
0x17,0x2b,0x04,0x7e,0xba,0x77,0xd6,0x26,0xe1,0x69,0x14,0x63,0x55,0x21,0x0c,0x7d];
var AES_RCON = [0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36];
function aesXtime(a) { return ((a << 1) ^ ((a & 0x80) ? 0x1b : 0)) & 0xff; }
function aesMul(a, b) {
  var p = 0;
  for (var i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    var hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}
function aesExpandKey(key) { // 16 -> 176 字节轮密钥
  var w = new Uint8Array(176);
  w.set(key);
  var tmp = new Uint8Array(4);
  for (var i = 16; i < 176; i += 4) {
    tmp[0] = w[i-4]; tmp[1] = w[i-3]; tmp[2] = w[i-2]; tmp[3] = w[i-1];
    if (i % 16 === 0) {
      var t = tmp[0]; tmp[0] = tmp[1]; tmp[1] = tmp[2]; tmp[2] = tmp[3]; tmp[3] = t;
      tmp[0] = AES_SBOX[tmp[0]]; tmp[1] = AES_SBOX[tmp[1]];
      tmp[2] = AES_SBOX[tmp[2]]; tmp[3] = AES_SBOX[tmp[3]];
      tmp[0] ^= AES_RCON[(i / 16) - 1];
    }
    w[i]   = w[i-16] ^ tmp[0];
    w[i+1] = w[i-15] ^ tmp[1];
    w[i+2] = w[i-14] ^ tmp[2];
    w[i+3] = w[i-13] ^ tmp[3];
  }
  return w;
}
function aesAddRoundKey(s, w, off) { for (var i = 0; i < 16; i++) s[i] ^= w[off + i]; }
function aesEncryptBlock(key, block) {
  var w = aesExpandKey(key);
  var s = new Uint8Array(16);
  for (var i = 0; i < 16; i++) s[i] = block[i];
  aesAddRoundKey(s, w, 0);
  var r, c;
  for (r = 1; r < 10; r++) {
    for (i = 0; i < 16; i++) s[i] = AES_SBOX[s[i]];
    // ShiftRows
    var t;
    t = s[1]; s[1] = s[5]; s[5] = s[9]; s[9] = s[13]; s[13] = t;
    t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t;
    t = s[3]; s[3] = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = t;
    if (r < 10) {
      for (c = 0; c < 4; c++) {
        var a0 = s[c*4], a1 = s[c*4+1], a2 = s[c*4+2], a3 = s[c*4+3];
        var x2_0 = aesXtime(a0), x2_1 = aesXtime(a1), x2_2 = aesXtime(a2), x2_3 = aesXtime(a3);
        s[c*4]   = x2_0 ^ (x2_1 ^ a1) ^ a2 ^ a3;
        s[c*4+1] = a0 ^ x2_1 ^ (x2_2 ^ a2) ^ a3;
        s[c*4+2] = a0 ^ a1 ^ x2_2 ^ (x2_3 ^ a3);
        s[c*4+3] = (x2_0 ^ a0) ^ a1 ^ a2 ^ x2_3;
      }
    }
    aesAddRoundKey(s, w, r * 16);
  }
  // 最后一轮（无 MixColumns）
  for (i = 0; i < 16; i++) s[i] = AES_SBOX[s[i]];
  t = s[1]; s[1] = s[5]; s[5] = s[9]; s[9] = s[13]; s[13] = t;
  t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t;
  t = s[3]; s[3] = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = t;
  aesAddRoundKey(s, w, 160);
  return s;
}
function aesDecryptBlock(key, block) {
  var w = aesExpandKey(key);
  var s = new Uint8Array(16);
  for (var i = 0; i < 16; i++) s[i] = block[i];
  var r, c;
  aesAddRoundKey(s, w, 160);
  for (r = 9; r >= 1; r--) {
    for (i = 0; i < 16; i++) s[i] = AES_INV_SBOX[s[i]];
    var t;
    t = s[1]; s[1] = s[13]; s[13] = s[9]; s[9] = s[5]; s[5] = t;
    t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t;
    t = s[3]; s[3] = s[7]; s[7] = s[11]; s[11] = s[15]; s[15] = t;
    aesAddRoundKey(s, w, r * 16);
    for (c = 0; c < 4; c++) {
      var a0 = s[c*4], a1 = s[c*4+1], a2 = s[c*4+2], a3 = s[c*4+3];
      s[c*4]   = aesMul(a0,0x0e) ^ aesMul(a1,0x0b) ^ aesMul(a2,0x0d) ^ aesMul(a3,0x09);
      s[c*4+1] = aesMul(a0,0x09) ^ aesMul(a1,0x0e) ^ aesMul(a2,0x0b) ^ aesMul(a3,0x0d);
      s[c*4+2] = aesMul(a0,0x0d) ^ aesMul(a1,0x09) ^ aesMul(a2,0x0e) ^ aesMul(a3,0x0b);
      s[c*4+3] = aesMul(a0,0x0b) ^ aesMul(a1,0x0d) ^ aesMul(a2,0x09) ^ aesMul(a3,0x0e);
    }
  }
  // 注意：最后一轮（r=0 的逆）= InvSubBytes + InvShiftRows + AddRoundKey(w0)
  for (i = 0; i < 16; i++) s[i] = AES_INV_SBOX[s[i]];
  t = s[1]; s[1] = s[13]; s[13] = s[9]; s[9] = s[5]; s[5] = t;
  t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t;
  t = s[3]; s[3] = s[7]; s[7] = s[11]; s[11] = s[15]; s[15] = t;
  aesAddRoundKey(s, w, 0);
  return s;
}
/* AES-128-CBC：加密返回 IV(16)+密文；解密校验 PKCS#7 填充 */
function aesCbcEncrypt(key, data) {
  var iv = randomBytes(16);
  var pad = 16 - (data.length % 16);
  var p = new Uint8Array(data.length + pad);
  p.set(data);
  for (var i = data.length; i < p.length; i++) p[i] = pad;
  var ct = new Uint8Array(p.length), prev = iv, blk = new Uint8Array(16), e;
  for (var off = 0; off < p.length; off += 16) {
    for (var j = 0; j < 16; j++) blk[j] = p[off + j] ^ prev[j];
    e = aesEncryptBlock(key, blk);
    ct.set(e, off); prev = e;
  }
  var out = new Uint8Array(16 + ct.length);
  out.set(iv); out.set(ct, 16);
  return out;
}
function aesCbcDecrypt(key, data) {
  if (data.length < 32 || (data.length % 16) !== 0) {
    throw new PdfCryptoError('CORRUPT', '数据长度异常，无法解密');
  }
  var iv = data.subarray(0, 16);
  var pt = new Uint8Array(data.length - 16);
  var prev = iv, blk = new Uint8Array(16), d;
  for (var off = 16; off < data.length; off += 16) {
    for (var j = 0; j < 16; j++) blk[j] = data[off + j];
    d = aesDecryptBlock(key, blk);
    for (j = 0; j < 16; j++) pt[off - 16 + j] = d[j] ^ prev[j];
    prev = blk.slice(); // 必须拷贝：blk 下一轮会被复写
  }
  var pad = pt[pt.length - 1];
  if (pad < 1 || pad > 16) throw new PdfCryptoError('WRONG_PASSWORD', '密码不正确');
  for (var k = pt.length - pad; k < pt.length; k++) {
    if (pt[k] !== pad) throw new PdfCryptoError('WRONG_PASSWORD', '密码不正确');
  }
  return pt.subarray(0, pt.length - pad);
}
/* ================= PDF 密码算法（算法 1/2/3/6/7） ================= */
// 标准填充串（取自 pdf.js，保证与主流阅读器一致）
var PDF_PADDING = new Uint8Array([
  0x28,0xbf,0x4e,0x5e,0x4e,0x75,0x8a,0x41,0x64,0x00,0x4e,0x56,
  0xff,0xfa,0x01,0x08,0x2e,0x2e,0x00,0xb6,0xd0,0x68,0x3e,0x80,
  0x2f,0x0c,0xa9,0xfe,0x64,0x53,0x69,0x7a
]);
function padPassword(pwBytes) { // 算法 1：截断/填充到 32 字节（R<=4 按 pdf.js 取 32）
  var t = pwBytes.length > 32 ? pwBytes.subarray(0, 32) : pwBytes;
  var out = new Uint8Array(32);
  out.set(t);
  out.set(PDF_PADDING.subarray(0, 32 - t.length), t.length);
  return out;
}
function passwordBytes(pw) { return utf8Bytes(String(pw === undefined || pw === null ? '' : pw)); }

/* 算法 2：由用户密码计算文件加密密钥 */
function computeFileKey(pwBytes32, O, P, id0, revision, keyLenBytes, encryptMetadata) {
  var parts = [padPassword(pwBytes32), O];
  var pb = new Uint8Array(4);
  var p = P | 0;
  pb[0] = p & 0xff; pb[1] = (p >> 8) & 0xff; pb[2] = (p >> 16) & 0xff; pb[3] = (p >>> 24) & 0xff;
  parts.push(pb, id0);
  if (revision >= 4 && encryptMetadata === false) {
    parts.push(new Uint8Array([0xff, 0xff, 0xff, 0xff]));
  }
  var h = md5(concatBytes(parts));
  if (revision >= 3) {
    for (var j = 0; j < 50; j++) h = md5(h.subarray(0, keyLenBytes));
  }
  return h.subarray(0, keyLenBytes);
}
/* 算法 3：计算 O（所有者密码项），加密方向 */
function computeO(userPw, ownerPw, revision, keyLenBytes) {
  var n = keyLenBytes;
  var paddedOwner = padPassword(passwordBytes(ownerPw));
  var key;
  if (revision >= 3) {
    var h = md5(paddedOwner);
    for (var j = 0; j < 50; j++) h = md5(h.subarray(0, n));
    key = h.subarray(0, n);
  } else {
    key = md5(paddedOwner).subarray(0, n);
  }
  var data = padPassword(passwordBytes(userPw));
  if (revision >= 3) return rc4_19(key, data);
  return rc4(key, data);
}
/* 算法 4/5/6：计算 U（用户密码项，加密方向）/ 校验（解密方向） */
function computeUForEncrypt(fileKey, id0, revision) {
  if (revision >= 3) {
    var checkData = md5(concatBytes([PDF_PADDING, id0]));
    var c = rc4_19(fileKey, checkData);
    var out = new Uint8Array(32);
    out.set(c); out.set(randomBytes(16), 16);
    return out;
  }
  return rc4(fileKey, PDF_PADDING); // R=2: 32 字节
}
function checkUMatches(fileKey, U, id0, revision) {
  if (revision >= 3) {
    if (U.length < 16) return false;
    var checkData = md5(concatBytes([PDF_PADDING, id0]));
    var c = rc4_19(fileKey, checkData);
    return bytesEqual(c, U.subarray(0, 16));
  }
  var expect = rc4(fileKey, PDF_PADDING);
  return U.length >= 32 && bytesEqual(expect, U.subarray(0, 32));
}
/* 算法 7：由所有者密码反解用户密码（解密方向），返回 32 字节填充后用户密码 */
function recoverUserPassword(ownerPw, O, revision, keyLenBytes) {
  var n = keyLenBytes;
  var h = md5(padPassword(passwordBytes(ownerPw)));
  if (revision >= 3) {
    for (var j = 0; j < 50; j++) h = md5(h.subarray(0, n));
    h = h.subarray(0, n);
    var data = O.subarray(0, 32);
    var dk = new Uint8Array(n);
    for (var j = 19; j >= 0; j--) {
      for (var k = 0; k < n; k++) dk[k] = h[k] ^ j;
      data = rc4(dk, data);
    }
    return data;
  }
  return rc4(h.subarray(0, n), O.subarray(0, 32));
}
/* 由密码推导文件密钥：先试用户密码（算法 2+6），再试所有者密码（算法 7+2+6） */
function deriveFileKey(pw, enc) {
  var pwB = passwordBytes(pw);
  var revision = enc.R, n = enc.keyLenBytes;
  var key = computeFileKey(pwB, enc.O, enc.P, enc.id0, revision, n, enc.encryptMetadata);
  if (checkUMatches(key, enc.U, enc.id0, revision)) return { key: key, viaOwner: false };
  if (pwB.length === 0) throw new PdfCryptoError('WRONG_PASSWORD', '密码不正确');
  var recovered = recoverUserPassword(pw, enc.O, revision, n);
  key = computeFileKey(recovered, enc.O, enc.P, enc.id0, revision, n, enc.encryptMetadata);
  if (checkUMatches(key, enc.U, enc.id0, revision)) return { key: key, viaOwner: true };
  throw new PdfCryptoError('WRONG_PASSWORD', '密码不正确');
}
/* 对象密钥（§7.6.2）：MD5(fileKey + objNum(3LE) + gen(2LE) [+ AES salt]) */
function objectKey(fileKey, num, gen, useAes) {
  var k = new Uint8Array(fileKey.length + (useAes ? 9 : 5));
  k.set(fileKey);
  var o = fileKey.length;
  k[o++] = num & 0xff; k[o++] = (num >> 8) & 0xff; k[o++] = (num >> 16) & 0xff;
  k[o++] = gen & 0xff; k[o++] = (gen >> 8) & 0xff;
  if (useAes) { k[o++] = 0x73; k[o++] = 0x41; k[o++] = 0x6c; k[o++] = 0x54; }
  var h = md5(k);
  return h.subarray(0, Math.min(fileKey.length + 5, 16));
}
/* ================= PDF 语法解析 ================= */
function isWs(c) { return c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f' || c === '\0'; }
function isDelim(c) { return '()<>[]{}/%'.indexOf(c) >= 0; }
function skipWs(s, pos) { while (pos < s.length && isWs(s[pos])) pos++; return pos; }
function skipWsComments(s, pos) {
  for (;;) {
    pos = skipWs(s, pos);
    if (s[pos] === '%') { var e = s.indexOf('\n', pos); pos = e < 0 ? s.length : e + 1; }
    else break;
  }
  return pos;
}
function parseName(s, pos) { // pos 在 '/'
  var i = pos + 1, name = '';
  while (i < s.length && !isWs(s[i]) && !isDelim(s[i])) {
    if (s[i] === '#' && i + 2 < s.length) { name += String.fromCharCode(parseInt(s.substr(i + 1, 2), 16)); i += 3; }
    else { name += s[i]; i++; }
  }
  return { name: name, end: i };
}
function parseLiteral(s, pos) { // pos 在 '('，返回字节与结束位置
  var i = pos + 1, depth = 1, out = [];
  while (i < s.length && depth > 0) {
    var c = s[i];
    if (c === '\\') {
      i++;
      var e = s[i];
      if (e === 'n') out.push(0x0a);
      else if (e === 'r') out.push(0x0d);
      else if (e === 't') out.push(0x09);
      else if (e === 'b') out.push(0x08);
      else if (e === 'f') out.push(0x0c);
      else if (e === '(') out.push(0x28);
      else if (e === ')') out.push(0x29);
      else if (e === '\\') out.push(0x5c);
      else if (e === '\r') { if (s[i+1] === '\n') i++; }
      else if (e === '\n') {}
      else if (e >= '0' && e <= '7') {
        var oct = e, k = 0;
        while (k < 2 && s[i+1] >= '0' && s[i+1] <= '7') { i++; oct += s[i]; k++; }
        out.push(parseInt(oct, 8) & 0xff);
      } else out.push(s.charCodeAt(i) & 0xff);
      i++;
    } else if (c === '(') { depth++; out.push(0x28); i++; }
    else if (c === ')') { depth--; if (depth > 0) out.push(0x29); i++; }
    else { out.push(s.charCodeAt(i) & 0xff); i++; }
  }
  if (depth !== 0) throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（字符串未闭合）');
  return { bytes: new Uint8Array(out), end: i };
}
function escapeLiteralBytes(b) {
  var s = '';
  for (var i = 0; i < b.length; i++) {
    var ch = b[i];
    if (ch === 0x5c) s += '\\\\';
    else if (ch === 0x28) s += '\\(';
    else if (ch === 0x29) s += '\\)';
    else if (ch === 0x0d) s += '\\r';
    else if (ch === 0x0a) s += '\\n';
    else if (ch < 32 || ch > 126) {
      s += '\\' + ('00' + ch.toString(8)).slice(-3);
    } else s += String.fromCharCode(ch);
  }
  return '(' + s + ')';
}
function parseValue(s, pos) {
  pos = skipWsComments(s, pos);
  var c = s[pos];
  if (c === '<') {
    if (s[pos + 1] === '<') {
      pos += 2;
      var entries = {};
      for (;;) {
        pos = skipWsComments(s, pos);
        if (s[pos] === '>' && s[pos + 1] === '>') { pos += 2; break; }
        if (pos >= s.length) throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（字典未闭合）');
        if (s[pos] !== '/') throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（字典键异常）');
        var kn = parseName(s, pos); pos = kn.end;
        var v = parseValue(s, pos); pos = v.end;
        entries[kn.name] = v;
      }
      return { type: 'dict', entries: entries, end: pos };
    }
    var ge = s.indexOf('>', pos);
    if (ge < 0) throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏');
    return { type: 'bytes', bytes: hexToBytes(s.slice(pos + 1, ge)), end: ge + 1 };
  }
  if (c === '(') { var lit = parseLiteral(s, pos); return { type: 'bytes', bytes: lit.bytes, end: lit.end }; }
  if (c === '[') {
    pos++; var arr = [];
    for (;;) {
      pos = skipWsComments(s, pos);
      if (s[pos] === ']') { pos++; break; }
      if (pos >= s.length) throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（数组未闭合）');
      var it = parseValue(s, pos); arr.push(it); pos = it.end;
    }
    return { type: 'array', items: arr, end: pos };
  }
  if (c === '/') { var nm = parseName(s, pos); return { type: 'name', name: nm.name, end: nm.end }; }
  var m = /^[+-]?(?:\d+\.?\d*|\.\d+)/.exec(s.slice(pos, pos + 32));
  if (m) {
    var numEnd = pos + m[0].length;
    var p2 = skipWs(s, numEnd);
    var m2 = /^[+-]?(?:\d+\.?\d*|\.\d+)/.exec(s.slice(p2, p2 + 32));
    if (m2) {
      var p3 = skipWs(s, p2 + m2[0].length);
      if (s[p3] === 'R' && (p3 + 1 >= s.length || isWs(s[p3+1]) || isDelim(s[p3+1]))) {
        return { type: 'ref', num: parseInt(m[0], 10), gen: parseInt(m2[0], 10), end: p3 + 1 };
      }
    }
    return { type: 'number', num: parseFloat(m[0]), end: numEnd };
  }
  if (s.substr(pos, 4) === 'true' && (isWs(s[pos+4]) || isDelim(s[pos+4]) || pos+4>=s.length))
    return { type: 'bool', value: true, end: pos + 4 };
  if (s.substr(pos, 5) === 'false' && (isWs(s[pos+5]) || isDelim(s[pos+5]) || pos+5>=s.length))
    return { type: 'bool', value: false, end: pos + 5 };
  if (s.substr(pos, 4) === 'null' && (isWs(s[pos+4]) || isDelim(s[pos+4]) || pos+4>=s.length))
    return { type: 'null', end: pos + 4 };
  throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（无法解析对象）');
}
/* 在字典原文中定位 /Length（直接数字或间接引用） */
function findLengthInDict(dictRaw) {
  var m = /\/Length\s*/.exec(dictRaw);
  if (!m) return null;
  try {
    var v = parseValue(dictRaw, m.index + m[0].length);
    if (v.type === 'number') return { direct: Math.floor(v.num) };
    if (v.type === 'ref') return { ref: { num: v.num, gen: v.gen } };
  } catch (e) {}
  return null;
}
/* 收集全部间接对象（顺序扫描；同号对象保留最后一次出现） */
function collectObjects(s) {
  var re = /(\d+)\s+(\d+)\s+obj(?=[\s])/g;
  var found = [], m;
  while ((m = re.exec(s)) !== null) {
    found.push({ num: parseInt(m[1], 10), gen: parseInt(m[2], 10), headEnd: m.index + m[0].length });
  }
  var objs = [];
  for (var fi = 0; fi < found.length; fi++) {
    (function (f) {
      try {
        var o = parseObjectAt(s, f);
        if (o) objs.push(o);
      } catch (e) {
        if (e instanceof PdfCryptoError) throw e;
        throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（对象解析失败）');
      }
    })(found[fi]);
  }
  // 间接 /Length 解析（第二遍）
  var byNum = {};
  objs.forEach(function (o) { byNum[o.num + ':' + o.gen] = o; byNum[o.num] = o; });
  objs.forEach(function (o) {
    if (o.stream && o.stream.lengthInfo && o.stream.lengthInfo.ref) {
      var t = byNum[o.stream.lengthInfo.ref.num + ':' + o.stream.lengthInfo.ref.gen] || byNum[o.stream.lengthInfo.ref.num];
      if (!t || t.stream) throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（/Length 引用异常）');
      var v = parseValue(t.dictRaw, 0);
      // 数字对象 body 即字典原文
      var mm = /^[+-]?\d+/.exec(t.dictRaw.trim());
      if (!mm) throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（/Length 引用异常）');
      o.stream.dataEnd = o.stream.dataStart + parseInt(mm[0], 10);
      o = finalizeStreamEnd(s, o);
    }
  });
  // 同号去重（保留最后出现）
  var dedup = {}, order = [];
  objs.forEach(function (o) {
    var k = o.num + ':' + o.gen;
    if (!(k in dedup)) order.push(k);
    else { var ix = order.indexOf(k); if (ix >= 0) order.splice(ix, 1); order.push(k); }
    dedup[k] = o;
  });
  return order.map(function (k) { return dedup[k]; });
}
function parseObjectAt(s, f) {
  var pos = skipWs(s, f.headEnd);
  if (s[pos] !== '<' || s[pos + 1] !== '<') {
    // 非字典对象（如纯数字对象 /Length 引用目标）：读到 endobj
    var e = scanForEndobj(s, pos);
    return { num: f.num, gen: f.gen, dictRaw: s.slice(pos, e).trim(), stream: null, bodyEnd: e + 6 };
  }
  var dictEnd = findDictEnd(s, pos);
  var dictRaw = s.slice(pos, dictEnd);
  pos = skipWs(s, dictEnd);
  var stream = null;
  if (s.substr(pos, 6) === 'stream' && (s[pos+6] === '\r' || s[pos+6] === '\n')) {
    var ds = pos + 6;
    if (s[ds] === '\r' && s[ds+1] === '\n') ds += 2; else ds += 1;
    var li = findLengthInDict(dictRaw);
    if (!li) throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（流缺少 /Length）');
    stream = { dataStart: ds, dataEnd: -1, lengthInfo: li };
    if (li.direct !== undefined) {
      stream.dataEnd = ds + li.direct;
      var o = { num: f.num, gen: f.gen, dictRaw: dictRaw, stream: stream };
      o = finalizeStreamEnd(s, o);
      return o;
    }
    // 间接 Length：先占位，第二遍回填
    return { num: f.num, gen: f.gen, dictRaw: dictRaw, stream: stream, bodyEnd: -1 };
  }
  var e2 = scanForEndobj(s, pos);
  return { num: f.num, gen: f.gen, dictRaw: dictRaw, stream: null, bodyEnd: e2 + 6 };
}
function finalizeStreamEnd(s, o) {
  var de = o.stream.dataEnd, p = de;
  if (s[p] === '\r' && s[p+1] === '\n') p += 2; else if (s[p] === '\r' || s[p] === '\n') p += 1;
  if (s.substr(p, 9) !== 'endstream') throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（流未正常结束）');
  p = skipWs(s, p + 9);
  if (s.substr(p, 6) !== 'endobj') throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（对象未正常结束）');
  o.bodyEnd = p + 6;
  return o;
}
function findDictEnd(s, pos) { // pos 在 '<<'
  var depth = 0, i = pos, n = s.length;
  while (i < n) {
    var c = s[i];
    if (c === '%') { var e = s.indexOf('\n', i); i = e < 0 ? n : e + 1; continue; }
    if (c === '(') { i = parseLiteral(s, i).end; continue; }
    if (c === '<') {
      if (s[i+1] === '<') { depth++; i += 2; continue; }
      var ge = s.indexOf('>', i); i = ge < 0 ? n : ge + 1; continue;
    }
    if (c === '>' && s[i+1] === '>') { depth--; i += 2; if (depth === 0) return i; continue; }
    i++;
  }
  throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（字典未闭合）');
}
function scanForEndobj(s, pos) { // 字符串感知地找 endobj
  var i = pos, n = s.length;
  while (i < n) {
    var c = s[i];
    if (c === '%') { var e = s.indexOf('\n', i); i = e < 0 ? n : e + 1; continue; }
    if (c === '(') { i = parseLiteral(s, i).end; continue; }
    if (c === '<' && s[i+1] !== '<') { var ge = s.indexOf('>', i); i = ge < 0 ? n : ge + 1; continue; }
    if ((c === 'e') && s.substr(i, 6) === 'endobj' &&
        (i === 0 || isWs(s[i-1]) || isDelim(s[i-1])) &&
        (i + 6 >= n || isWs(s[i+6]) || isDelim(s[i+6]))) return i;
    i++;
  }
  throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（对象未正常结束）');
}
/* 对对象体（非流部分）中的全部字符串做变换 */
function transformStrings(bodyText, fn, emitLiteral) {
  var out = [], i = 0, n = bodyText.length;
  while (i < n) {
    var c = bodyText[i];
    if (c === '%') {
      var e = bodyText.indexOf('\n', i); if (e < 0) e = n;
      out.push(bodyText.slice(i, e)); i = e; continue;
    }
    if (c === '(') {
      var lit = parseLiteral(bodyText, i);
      var nb = fn(lit.bytes);
      out.push(emitLiteral ? escapeLiteralBytes(nb) : '<' + bytesToHex(nb) + '>');
      i = lit.end; continue;
    }
    if (c === '<') {
      if (bodyText[i+1] === '<') { out.push('<<'); i += 2; continue; }
      var ge = bodyText.indexOf('>', i);
      if (ge < 0) throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏');
      var hb = fn(hexToBytes(bodyText.slice(i + 1, ge)));
      out.push(emitLiteral ? escapeLiteralBytes(hb) : '<' + bytesToHex(hb) + '>');
      i = ge + 1; continue;
    }
    out.push(c); i++;
  }
  return out.join('');
}
/* 解析 trailer（支持 xref 表与 xref 流两种） */
function parseTrailer(s) {
  var idx = s.lastIndexOf('startxref');
  if (idx < 0) throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（缺少 startxref）');
  var m = /startxref\s*(\d+)/.exec(s.slice(idx, idx + 60));
  if (!m) throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（startxref 异常）');
  var pos = skipWs(s, parseInt(m[1], 10));
  var dict;
  if (s.substr(pos, 4) === 'xref') {
    var t = s.indexOf('trailer', pos);
    if (t < 0) throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（缺少 trailer）');
    dict = parseValue(s, skipWs(s, t + 7));
  } else {
    var om = /(\d+)\s+(\d+)\s+obj/.exec(s.slice(pos, pos + 40));
    if (!om) throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（xref 异常）');
    dict = parseValue(s, skipWs(s, pos + om[0].length));
  }
  if (!dict || dict.type !== 'dict') throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（trailer 异常）');
  var E = dict.entries;
  function refVal(v) { return v && v.type === 'ref' ? { num: v.num, gen: v.gen } : null; }
  var id = null;
  if (E.ID && E.ID.type === 'array' && E.ID.items.length >= 1 && E.ID.items[0].type === 'bytes') {
    id = E.ID.items.map(function (it) { return it.type === 'bytes' ? it.bytes : new Uint8Array(0); });
  }
  return {
    root: refVal(E.Root), info: refVal(E.Info), encrypt: refVal(E.Encrypt), id: id,
    size: E.Size && E.Size.type === 'number' ? Math.floor(E.Size.num) : 0
  };
}
/* ================= 加密信息读取 ================= */
function getEncryptInfo(bytes) {
  var s = bytesToStr(bytes);
  if (s.slice(0, 5) !== '%PDF-') throw new PdfCryptoError('CORRUPT', '不是有效的 PDF 文件');
  var trailer = parseTrailer(s);
  if (!trailer.encrypt) return null;
  var objs = collectObjects(s);
  var encObj = null;
  objs.forEach(function (o) { if (o.num === trailer.encrypt.num && o.gen === trailer.encrypt.gen) encObj = o; });
  if (!encObj) throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（找不到加密字典）');
  var d = parseValue(encObj.dictRaw, 0);
  if (!d || d.type !== 'dict') throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（加密字典异常）');
  var E = d.entries;
  function numVal(v, def) { return v && v.type === 'number' ? v.num : def; }
  function bytesVal(v) { return v && v.type === 'bytes' ? v.bytes : null; }
  function nameVal(v) { return v && v.type === 'name' ? v.name : null; }
  var filter = nameVal(E.Filter);
  if (filter && filter !== 'Standard') throw new PdfCryptoError('UNSUPPORTED', '不支持的加密过滤器（' + filter + '），本站暂不支持解密');
  var V = Math.floor(numVal(E.V, 0)), R = Math.floor(numVal(E.R, 0));
  if (V === 5 || R >= 5) throw new PdfCryptoError('UNSUPPORTED_R6', '该 PDF 采用 AES-256 高强度加密，本站暂不支持直接解密');
  if (!((V >= 1 && V <= 4) && (R >= 2 && R <= 4))) throw new PdfCryptoError('UNSUPPORTED', '不支持的加密版本（V=' + V + ' R=' + R + '），本站暂不支持解密');
  var keyLenBytes = Math.floor(numVal(E.Length, 40) / 8);
  if (keyLenBytes < 5 || keyLenBytes > 16) throw new PdfCryptoError('UNSUPPORTED', '不支持的密钥长度');
  var O = bytesVal(E.O), U = bytesVal(E.U);
  if (!O || !U) throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（缺少 O/U 项）');
  var P = E.P && E.P.type === 'number' ? Math.floor(E.P.num) : -4;
  var id0 = (trailer.id && trailer.id[0] && trailer.id[0].length >= 8) ? trailer.id[0] : null;
  if (!id0) throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（缺少文件 ID）');
  var encryptMetadata = !(E.EncryptMetadata && E.EncryptMetadata.type === 'bool' && E.EncryptMetadata.value === false);
  // 解析 crypt filter
  function cfmOf(name) {
    if (!name || name === 'Identity') return null; // 不加密
    var cf = E.CF && E.CF.type === 'dict' ? E.CF.entries[name] : null;
    if (!cf || cf.type !== 'dict') {
      if (V === 4) throw new PdfCryptoError('UNSUPPORTED', '不支持的加密过滤器配置');
      return 'V2';
    }
    var cfm = cf.entries.CFM && cf.entries.CFM.type === 'name' ? cf.entries.CFM.name : 'None';
    if (cfm === 'None') return null;
    if (cfm === 'V2') return 'V2';
    if (cfm === 'AESV2') return 'AESV2';
    throw new PdfCryptoError('UNSUPPORTED', '不支持的加密算法（' + cfm + '）');
  }
  var stmF = V >= 4 ? cfmOf(nameVal(E.StmF)) : 'V2';
  var strF = V >= 4 ? cfmOf(nameVal(E.StrF)) : 'V2';
  return {
    V: V, R: R, keyLenBytes: keyLenBytes, O: O, U: U, P: P, id0: id0,
    encryptMetadata: encryptMetadata,
    streamCipher: stmF, stringCipher: strF,
    useAesStream: stmF === 'AESV2', useAesString: strF === 'AESV2',
    encryptObj: { num: encObj.num, gen: encObj.gen },
    objs: objs, trailer: trailer, text: s,
    headerLine: s.slice(0, s.indexOf('\n')).trim() || '%PDF-1.7'
  };
}
function hasObjStm(objs) {
  for (var i = 0; i < objs.length; i++) {
    if (/\/Type\s*\/ObjStm/.test(objs[i].dictRaw)) return true;
  }
  return false;
}

/* ================= 文件重写 ================= */
function writePdf(headerLine, objs, trailer) {
  // objs: [{num,gen,body}] body 为 latin1 文本；trailer: {size,root,info,idHex:[h1,h2],encrypt:{num,gen}|null}
  var parts = [headerLine + '\n%\xE2\xE3\xCF\xD3\n'];
  var offsets = [];
  var cur = parts[0].length;
  objs.forEach(function (o) {
    var chunk = o.num + ' ' + o.gen + ' obj\n' + o.body + '\nendobj\n';
    offsets.push({ num: o.num, off: cur });
    parts.push(chunk);
    cur += chunk.length;
  });
  var xrefPos = cur;
  var size = trailer.size;
  var xref = 'xref\n0 ' + size + '\n';
  var byNum = {};
  offsets.forEach(function (e) { byNum[e.num] = e.off; });
  for (var i = 0; i < size; i++) {
    if (i === 0) xref += '0000000000 65535 f \n';
    else if (byNum[i] !== undefined) {
      xref += ('0000000000' + byNum[i]).slice(-10) + ' 00000 n \n';
    } else xref += '0000000000 65535 f \n';
  }
  parts.push(xref);
  var tr = 'trailer\n<<\n/Size ' + size + '\n/Root ' + trailer.root.num + ' ' + trailer.root.gen + ' R\n';
  if (trailer.info) tr += '/Info ' + trailer.info.num + ' ' + trailer.info.gen + ' R\n';
  if (trailer.idHex) tr += '/ID [<' + trailer.idHex[0] + '><' + trailer.idHex[1] + '>]\n';
  if (trailer.encrypt) tr += '/Encrypt ' + trailer.encrypt.num + ' ' + trailer.encrypt.gen + ' R\n';
  tr += '>>\nstartxref\n' + xrefPos + '\n%%EOF';
  parts.push(tr);
  return strToBytes(parts.join(''));
}
function updateStreamLength(dictRaw, objsByKey, newLen) {
  var li = findLengthInDict(dictRaw);
  if (li && li.direct !== undefined) {
    return dictRaw.replace(/\/Length\s+\d+/, '/Length ' + newLen);
  }
  if (li && li.ref) {
    var t = objsByKey[li.ref.num + ':' + li.ref.gen] || objsByKey[li.ref.num];
    if (t && !t.stream) {
      t.dictRaw = t.dictRaw.replace(/^[+-]?\d+/, String(newLen));
      t._lenUpdated = true;
    }
  }
  return dictRaw;
}

/* ================= 加密 ================= */
function encryptPdf(bytes, opts) {
  opts = opts || {};
  var userPassword = String(opts.userPassword === undefined || opts.userPassword === null ? '' : opts.userPassword);
  if (!userPassword) throw new PdfCryptoError('BAD_ARGS', '打开密码不能为空');
  var ownerPassword = opts.ownerPassword ? String(opts.ownerPassword) : userPassword;
  var strength = opts.strength === 'rc4' ? 'rc4' : 'aes128';
  var P = opts.permissions === undefined || opts.permissions === null ? -196 : (opts.permissions | 0);
  var s = bytesToStr(bytes);
  if (s.slice(0, 5) !== '%PDF-') throw new PdfCryptoError('CORRUPT', '不是有效的 PDF 文件');
  var info = null;
  try { info = getEncryptInfo(bytes); } catch (e) { if (e instanceof PdfCryptoError && (e.code === 'UNSUPPORTED' || e.code === 'UNSUPPORTED_R6' || e.code === 'CORRUPT')) throw e; }
  if (info) throw new PdfCryptoError('ALREADY_ENCRYPTED', '该 PDF 已带密码保护，无需重复加密');
  var trailer = parseTrailer(s);
  if (!trailer.root) throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（缺少文档目录）');
  var objs = collectObjects(s);
  if (objs.length === 0) throw new PdfCryptoError('CORRUPT', 'PDF 结构损坏（未找到对象）');
  var revision = strength === 'aes128' ? 4 : 3;
  var V = strength === 'aes128' ? 4 : 2;
  var useAes = strength === 'aes128';
  var n = 16;
  var idB = randomBytes(32);
  var id0 = idB.subarray(0, 16);
  var O = computeO(userPassword, ownerPassword, revision, n);
  var fileKey = computeFileKey(passwordBytes(userPassword), O, P, id0, revision, n, true);
  var U = computeUForEncrypt(fileKey, id0, revision);
  if (!checkUMatches(fileKey, U, id0, revision)) throw new PdfCryptoError('CORRUPT', '内部校验失败，请重试');
  var maxNum = 0;
  objs.forEach(function (o) { if (o.num > maxNum) maxNum = o.num; });
  var encNum = maxNum + 1;
  var encDict = '<<\n/Filter /Standard\n/V ' + V + '\n/R ' + revision + '\n/Length 128\n' +
    '/O <' + bytesToHex(O) + '>\n/U <' + bytesToHex(U) + '>\n/P ' + P + '\n';
  if (useAes) {
    encDict += '/CF <</DefaultCrypt <</AuthEvent /DocOpen /CFM /AESV2 /Length 16>>>>\n' +
      '/StmF /DefaultCrypt\n/StrF /DefaultCrypt\n';
  }
  encDict += '>>';
  function encFn(ok, isStream) {
    if (useAes) return function (data) { return aesCbcEncrypt(ok, data); };
    return function (data) { return rc4(ok, data); };
  }
  var objsByKey = {};
  objs.forEach(function (o) { objsByKey[o.num + ':' + o.gen] = o; objsByKey[o.num] = o; });
  var outObjs = [];
  objs.forEach(function (o) {
    var ok = objectKey(fileKey, o.num, o.gen, useAes);
    var fn = encFn(ok);
    var newDictRaw = transformStrings(o.dictRaw, fn, false);
    var body;
    if (o.stream) {
      var raw = strToBytes(s.slice(o.stream.dataStart, o.stream.dataEnd));
      var enc = fn(raw);
      newDictRaw = updateStreamLength(newDictRaw, objsByKey, enc.length);
      body = newDictRaw + '\nstream\n' + bytesToStr(enc) + '\nendstream';
    } else {
      body = newDictRaw;
    }
    outObjs.push({ num: o.num, gen: o.gen, body: body, _src: o });
  });
  // 回填被修改的 /Length 间接对象
  outObjs.forEach(function (o) {
    if (o._src._lenUpdated) o.body = o._src.dictRaw;
  });
  outObjs.push({ num: encNum, gen: 0, body: encDict });
  outObjs.sort(function (a, b) { return a.num - b.num; });
  var size = encNum + 1;
  var idHex = [bytesToHex(idB.subarray(0, 16)), bytesToHex(idB.subarray(16, 32))];
  return {
    bytes: writePdf(s.slice(0, s.indexOf('\n')).trim() || '%PDF-1.7', outObjs, {
      size: size, root: trailer.root, info: trailer.info, idHex: idHex,
      encrypt: { num: encNum, gen: 0 }
    }),
    pages: 0
  };
}

/* ================= 解密 ================= */
function decryptPdf(bytes, password) {
  var info = getEncryptInfo(bytes);
  if (!info) throw new PdfCryptoError('NOT_ENCRYPTED', '该 PDF 未加密，无需解密');
  var derived = deriveFileKey(password, info); // 密码错误在此抛出 WRONG_PASSWORD
  var fileKey = derived.key;
  if (hasObjStm(info.objs)) {
    throw new PdfCryptoError('NEED_FALLBACK', '该 PDF 使用对象流压缩加密，本站将切换兼容模式处理');
  }
  function decFn(ok, useAes) {
    if (useAes) return function (data) { return aesCbcDecrypt(ok, data); };
    return function (data) { return rc4(ok, data); };
  }
  var s = info.text;
  var objsByKey = {};
  info.objs.forEach(function (o) { objsByKey[o.num + ':' + o.gen] = o; objsByKey[o.num] = o; });
  var outObjs = [];
  info.objs.forEach(function (o) {
    if (o.num === info.encryptObj.num && o.gen === info.encryptObj.gen) return; // 丢弃加密字典
    var strFn = info.stringCipher === null ? null : decFn(objectKey(fileKey, o.num, o.gen, info.useAesString), info.useAesString);
    var stmFn = info.streamCipher === null ? null : decFn(objectKey(fileKey, o.num, o.gen, info.useAesStream), info.useAesStream);
    var newDictRaw = strFn ? transformStrings(o.dictRaw, strFn, true) : o.dictRaw;
    var body;
    if (o.stream) {
      var raw = strToBytes(s.slice(o.stream.dataStart, o.stream.dataEnd));
      var dec = stmFn ? stmFn(raw) : raw;
      newDictRaw = updateStreamLength(newDictRaw, objsByKey, dec.length);
      body = newDictRaw + '\nstream\n' + bytesToStr(dec) + '\nendstream';
    } else {
      body = newDictRaw;
    }
    outObjs.push({ num: o.num, gen: o.gen, body: body, _src: o });
  });
  outObjs.forEach(function (o) {
    if (o._src._lenUpdated) o.body = o._src.dictRaw;
  });
  outObjs.sort(function (a, b) { return a.num - b.num; });
  var maxNum = 0;
  outObjs.forEach(function (o) { if (o.num > maxNum) maxNum = o.num; });
  var tr = info.trailer;
  var idHex = tr.id && tr.id[1] ?
    [bytesToHex(tr.id[0]), bytesToHex(tr.id[1])] :
    [bytesToHex(randomBytes(16)), bytesToHex(randomBytes(16))];
  return {
    bytes: writePdf(info.headerLine, outObjs, {
      size: maxNum + 1, root: tr.root, info: tr.info, idHex: idHex, encrypt: null
    }),
    viaOwner: derived.viaOwner
  };
}

/* ================= 导出 ================= */
return {
  PdfCryptoError: PdfCryptoError,
  encryptPdf: encryptPdf,
  decryptPdf: decryptPdf,
  getEncryptInfo: getEncryptInfo,
  _internals: {
    md5: md5, rc4: rc4, aesEncryptBlock: aesEncryptBlock, aesDecryptBlock: aesDecryptBlock,
    bytesToHex: bytesToHex, hexToBytes: hexToBytes, strToBytes: strToBytes, bytesToStr: bytesToStr,
    utf8Bytes: utf8Bytes
  }
};
});
