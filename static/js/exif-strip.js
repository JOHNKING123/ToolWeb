/* EXIF 信息查看/清除 - 纯前端字节级解析与剥离
* JPEG: 解析 APP1 Exif(TIFF/IFD)；按段剥离元数据 APPn 段后原样拼接，不重编码。
* PNG: 检测/去掉 eXIf/tEXt/iTXt/zTXt 等文本元数据块并重算 CRC。
* WebP: 解析 RIFF 块，检测/去掉 EXIF 块并重写 VP8X feature 位与 RIFF 大小。
* 图片只在浏览器本地处理，不上传服务器。 */
(function () {
'use strict';
var ZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
var items = []; // {id,name,size,type,ext,buffer,dataUrl,info,cleanedBlob,cleanedName,reencoded}
var activeId = null;
var seq = 0;

function $(id) { return document.getElementById(id);}
function toast(m) {
var el = document.createElement('div');
el.textContent = m;
el.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:.6rem 1.2rem;border-radius:.5rem;z-index:9999;font-size:.9rem;max-width:86vw;text-align:center;';
document.body.appendChild(el);
setTimeout(function () { if (el.parentNode) document.body.removeChild(el);}, 2600);
}
function setStatus(m) { $('es-status').textContent = m || '';}
function fmtSize(n) {
if (n < 1024) return n + ' B';
if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
return (n / 1024 / 1024).toFixed(2) + ' MB';
}
function esc(s) {
return String(s == null? '': s).replace(/[&<>"']/g, function (c) {
return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
});
}

/* ============ 通用读取 ============ */
function u16be(b, o) { return (b[o] << 8) | b[o + 1];}
function u32be(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;}

/* ============ JPEG EXIF 解析 ============ */
var TAG_NAMES = {
0x010F: 'Make（厂商）', 0x0110: 'Model（机型）', 0x0112: 'Orientation（方向）',
0x011A: 'XResolution（水平分辨率）', 0x011B: 'YResolution（垂直分辨率）',
0x0128: 'ResolutionUnit（分辨率单位）', 0x0131: 'Software（软件）',
0x0132: 'DateTime（修改时间）', 0x013B: 'Artist（作者）', 0x02BC: 'XMP 数据包',
0x8298: 'Copyright（版权）', 0x8769: 'ExifIFD 偏移', 0x8825: 'GPSIFD 偏移',
0x9000: 'ExifVersion', 0x9003: 'DateTimeOriginal（拍摄时间）', 0x9004: 'DateTimeDigitized（数字化时间）',
0x9101: 'ComponentsConfiguration', 0x927C: 'MakerNote（厂商私有数据）',
0x9286: 'UserComment（用户注释）', 0xA002: 'PixelXDimension（宽度 px）', 0xA003: 'PixelYDimension（高度 px）',
0xA405: 'FocalLength（焦距）', 0x8822: 'ExposureProgram（曝光程序）', 0x8827: 'ISOSpeed（ISO）',
0x829A: 'ExposureTime（曝光时间）', 0x829D: 'FNumber（光圈）', 0xA434: 'LensModel（镜头型号）',
0xA435: 'LensSerialNumber（镜头序列号）', 0xA431: 'BodySerialNumber（机身序列号）',
0xA430: 'CameraOwnerName（机主姓名）', 0x010E: 'ImageDescription（图像描述）'
};
var GPS_TAGS = {
0: 'GPSVersionID', 1: 'GPSLatitudeRef（纬度方向）', 2: 'GPSLatitude（纬度）',
3: 'GPSLongitudeRef（经度方向）', 4: 'GPSLongitude（经度）', 5: 'GPSAltitudeRef', 6: 'GPSAltitude（海拔）',
7: 'GPSTimeStamp', 11: 'GPSDOP', 16: 'GPSImgDirectionRef', 17: 'GPSImgDirection', 29: 'GPSDateStamp'
};
var SERIAL_TAGS = { 0xA435: 1, 0xA431: 1};
var TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4};

function parseExifTiff(b, base) {
// base 为 TIFF 头在整个 buffer 中的偏移；返回 {rows:[{key,label,value,privacy:'gps'|'serial'|''}], count}
var rows = [];
if (base + 8 > b.length) return { rows: rows, count: 0};
var little;
if (b[base] === 0x49 && b[base + 1] === 0x49) little = true;
else if (b[base] === 0x4D && b[base + 1] === 0x4D) little = false;
else return { rows: rows, count: 0};
function u16(o) { return little? (b[o] | (b[o + 1] << 8)): ((b[o] << 8) | b[o + 1]);}
function u32(o) { return little? ((b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0): (((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);}
if (u16(base + 2)!== 42) return { rows: rows, count: 0};
function readValue(type, count, valOff) {
var ts = TYPE_SIZE[type] || 1;
var total = ts * count;
var off = total <= 4? valOff: base + u32(valOff);
if (off + Math.min(total, 4) > b.length && total > 4) return null;
try {
if (type === 2) {
var s = '';
for (var i = 0; i < count; i++) {
var ch = b[off + i];
if (ch === 0) break;
s += String.fromCharCode(ch);
}
return s;
}
if (type === 3 || type === 4 || type === 1 || type === 6 || type === 8 || type === 9) {
var nums = [];
for (var j = 0; j < count && j < 8; j++) {
if (type === 3 || type === 8) nums.push(u16(off + j * 2));
else if (type === 4 || type === 9) nums.push(u32(off + j * 4));
else nums.push(b[off + j]);
}
return nums.length === 1? String(nums[0]): nums.join(', ');
}
if (type === 5 || type === 10) {
var rats = [];
for (var k = 0; k < count && k < 4; k++) {
var n = u32(off + k * 8), d = u32(off + k * 8 + 4);
rats.push(d? (n / d): n);
}
return rats;
}
if (type === 7) return '（二进制数据 ' + count + ' 字节）';
} catch (e) { return null;}
return null;
}
var gpsRaw = {};
function readIFD(off, isExif, isGPS) {
if (!off || base + off + 2 > b.length) return;
var n = u16(base + off);
for (var i = 0; i < n; i++) {
var eo = base + off + 2 + i * 12;
if (eo + 12 > b.length) break;
var tag = u16(eo), type = u16(eo + 2), cnt = u32(eo + 4);
var v = readValue(type, cnt, eo + 8);
if (isGPS) {
gpsRaw[tag] = v;
if (tag === 2 || tag === 4) continue; // 纬度/经度单独合成展示
rows.push({ key: 'gps' + tag, label: GPS_TAGS[tag] || ('GPS 标签 0x' + tag.toString(16)), value: Array.isArray(v)? v.map(function (x) { return +x.toFixed(6);}).join(', '): v, privacy: 'gps'});
} else {
if ((tag === 0x8769 || tag === 0x8825) &&!isExif) {
var sub = (typeof v === 'string')? parseInt(v, 10): NaN;
if (!isNaN(sub)) readIFD(sub, tag === 0x8769, tag === 0x8825);
continue;
}
if (v === null || v === undefined || v === '') continue;
var label = TAG_NAMES[tag] || ('标签 0x' + tag.toString(16).toUpperCase());
rows.push({ key: 't' + tag, label: label, value: Array.isArray(v)? v.map(function (x) { return +x.toFixed(4);}).join(', '): v, privacy: SERIAL_TAGS[tag]? 'serial': ''});
}
}
}
readIFD(u32(base + 4), false, false);
// GPS 合成：DMS -> 十进制
function dmsToDec(v, ref) {
if (!Array.isArray(v) || v.length < 3) return null;
var dec = (+v[0]) + (+v[1]) / 60 + (+v[2]) / 3600;
if (ref === 'S' || ref === 'W') dec = -dec;
return +dec.toFixed(6);
}
var lat = dmsToDec(gpsRaw[2], gpsRaw[1]);
var lng = dmsToDec(gpsRaw[4], gpsRaw[3]);
if (lat!== null || lng!== null) {
var txt = [];
if (gpsRaw[2]) txt.push('纬度 ' + (Array.isArray(gpsRaw[2])? gpsRaw[2].join('°, ') + '°': gpsRaw[2]) + ' ' + (gpsRaw[1] || '') + (lat!== null? ' → ' + lat: ''));
if (gpsRaw[4]) txt.push('经度 ' + (Array.isArray(gpsRaw[4])? gpsRaw[4].join('°, ') + '°': gpsRaw[4]) + ' ' + (gpsRaw[3] || '') + (lng!== null? ' → ' + lng: ''));
rows.unshift({ key: 'gps-pos', label: 'GPS 定位（拍摄地点）', value: txt.join('；') + (lat!== null && lng!== null? '可定位拍摄地点': ''), privacy: 'gps'});
}
return { rows: rows, count: rows.length};
}

function parseJPEG(buf) {
var b = new Uint8Array(buf);
var info = { format: 'JPEG', hasExif: false, hasXMP: false, hasICC: false, fields: [], count: 0};
if (b.length < 4 || b[0]!== 0xFF || b[1]!== 0xD8) return info;
var off = 2;
while (off + 4 <= b.length) {
if (b[off]!== 0xFF) break;
var marker = b[off + 1];
if (marker === 0xDA || marker === 0xD9) break;
var len = u16be(b, off + 2);
if (len < 2) break;
var segStart = off + 4, segEnd = off + 2 + len;
if (marker === 0xE1) {
var head = '';
for (var i = 0; i < Math.min(29, segEnd - segStart); i++) head += String.fromCharCode(b[segStart + i]);
if (head.indexOf('Exif\0\0') === 0) {
info.hasExif = true;
var r = parseExifTiff(b, segStart + 6);
info.fields = info.fields.concat(r.rows);
} else if (head.indexOf('http://ns.adobe.com/xap/1.0/') === 0) {
info.hasXMP = true;
info.fields.push({ key: 'xmp', label: 'XMP 元数据', value: '已检测到 XMP 数据包（可能含编辑历史/评级等信息）', privacy: ''});
}
}
if (marker === 0xE2) {
var h2 = '';
for (var j = 0; j < Math.min(12, segEnd - segStart); j++) h2 += String.fromCharCode(b[segStart + j]);
if (h2.indexOf('ICC_PROFILE') === 0) info.hasICC = true;
}
off = segEnd;
}
info.count = info.fields.length;
return info;
}

/* JPEG 剥离：保留 SOI/SOF/SOS 等图像段，跳过 APP1 及元数据类 APPn 与 COM */
function stripJPEG(buf) {
var b = new Uint8Array(buf);
if (b.length < 4 || b[0]!== 0xFF || b[1]!== 0xD8) throw new Error('not jpeg');
var parts = [b.slice(0, 2)];
var off = 2;
while (off + 4 <= b.length) {
if (b[off]!== 0xFF) { parts.push(b.slice(off)); return concatParts(parts);}
var marker = b[off + 1];
if (marker === 0xDA) { parts.push(b.slice(off)); return concatParts(parts);}
if (marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7) || marker === 0x01) {
parts.push(b.slice(off, off + 2));
off += 2;
continue;
}
var len = u16be(b, off + 2);
if (len < 2 || off + 2 + len > b.length) { parts.push(b.slice(off)); return concatParts(parts);}
var drop = (marker >= 0xE1 && marker <= 0xEF) || marker === 0xFE; // APP1..APP15 + COM
if (!drop) parts.push(b.slice(off, off + 2 + len));
off += 2 + len;
}
parts.push(b.slice(off));
return concatParts(parts);
}
function concatParts(parts) {
var total = 0, i;
for (i = 0; i < parts.length; i++) total += parts[i].length;
var out = new Uint8Array(total), o = 0;
for (i = 0; i < parts.length; i++) { out.set(parts[i], o); o += parts[i].length;}
return out;
}

/* ============ PNG ============ */
var PNG_META_CHUNKS = { eXIf: 1, tEXt: 1, iTXt: 1, zTXt: 1, iCCP: 1, tIME: 1, caBX: 1};
var CRC_TABLE = null;
function crc32(bytes) {
if (!CRC_TABLE) {
CRC_TABLE = [];
for (var n = 0; n < 256; n++) {
var c = n;
for (var k = 0; k < 8; k++) c = (c & 1)? (0xEDB88320 ^ (c >>> 1)): (c >>> 1);
CRC_TABLE[n] = c >>> 0;
}
}
var crc = 0xFFFFFFFF;
for (var i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
return (crc ^ 0xFFFFFFFF) >>> 0;
}
function parsePNG(buf) {
var b = new Uint8Array(buf);
var info = { format: 'PNG', hasExif: false, hasXMP: false, hasICC: false, fields: [], count: 0};
if (b.length < 8) return info;
var off = 8;
while (off + 8 <= b.length) {
var len = u32be(b, off);
var type = String.fromCharCode(b[off + 4], b[off + 5], b[off + 6], b[off + 7]);
var dataStart = off + 8;
if (type === 'eXIf') {
info.hasExif = true;
info.fields.push({ key: 'png-exif', label: 'eXIf 元数据块', value: '检测到 eXIf 块（' + len + ' 字节，可能含 GPS/机型/拍摄时间）', privacy: 'gps'});
} else if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
var key = '';
for (var i = 0; i < Math.min(len, 80) && b[dataStart + i]!== 0; i++) key += String.fromCharCode(b[dataStart + i]);
if (/xml|description|comment/i.test(key)) info.hasXMP = true;
info.fields.push({ key: 'png-' + type + '-' + off, label: type + ' 文本元数据「' + (key || '未命名') + '」', value: '文本块（' + len + ' 字节，可能含作者/软件/注释等信息）', privacy: ''});
} else if (type === 'iCCP') {
info.hasICC = true;
info.fields.push({ key: 'png-iccp', label: 'iCCP 色彩配置', value: '内嵌 ICC 色彩配置文件', privacy: ''});
} else if (type === 'tIME') {
info.fields.push({ key: 'png-time', label: 'tIME 修改时间', value: 'PNG 记录的最后修改时间', privacy: ''});
}
off = dataStart + len + 4;
if (type === 'IEND') break;
}
info.count = info.fields.length;
return info;
}
function stripPNG(buf) {
var b = new Uint8Array(buf);
if (b.length < 8) throw new Error('not png');
var parts = [b.slice(0, 8)];
var off = 8;
while (off + 8 <= b.length) {
var len = u32be(b, off);
var type = String.fromCharCode(b[off + 4], b[off + 5], b[off + 6], b[off + 7]);
var total = 8 + len + 4;
if (off + total > b.length) { parts.push(b.slice(off)); break;}
if (!PNG_META_CHUNKS[type]) parts.push(b.slice(off, off + total));
off += total;
if (type === 'IEND') break;
}
return concatParts(parts);
}

/* ============ WebP ============ */
function fourcc(b, o) { return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);}
function parseWebP(buf) {
var b = new Uint8Array(buf);
var info = { format: 'WebP', hasExif: false, hasXMP: false, hasICC: false, fields: [], count: 0};
if (b.length < 12 || fourcc(b, 0)!== 'RIFF' || fourcc(b, 8)!== 'WEBP') return info;
var off = 12;
while (off + 8 <= b.length) {
var tag = fourcc(b, off);
var size = (b[off + 4] | (b[off + 5] << 8) | (b[off + 6] << 16) | (b[off + 7] << 24)) >>> 0;
if (tag === 'EXIF') {
info.hasExif = true;
info.fields.push({ key: 'webp-exif', label: 'EXIF 元数据块', value: '检测到 EXIF 块（' + size + ' 字节，可能含 GPS/机型/拍摄时间）', privacy: 'gps'});
} else if (tag === 'XMP ') {
info.hasXMP = true;
info.fields.push({ key: 'webp-xmp', label: 'XMP 元数据块', value: '检测到 XMP 数据块（' + size + ' 字节）', privacy: ''});
} else if (tag === 'ICCP') {
info.hasICC = true;
}
off += 8 + size + (size % 2);
}
info.count = info.fields.length;
return info;
}
function writeU32le(arr, off, v) {
arr[off] = v & 0xFF; arr[off + 1] = (v >>> 8) & 0xFF; arr[off + 2] = (v >>> 16) & 0xFF; arr[off + 3] = (v >>> 24) & 0xFF;
}
function stripWebP(buf) {
var b = new Uint8Array(buf);
if (b.length < 12 || fourcc(b, 0)!== 'RIFF') throw new Error('not webp');
var parts = [b.slice(0, 12)];
var off = 12;
while (off + 8 <= b.length) {
var tag = fourcc(b, off);
var size = (b[off + 4] | (b[off + 5] << 8) | (b[off + 6] << 16) | (b[off + 7] << 24)) >>> 0;
var total = 8 + size + (size % 2);
if (off + total > b.length) { parts.push(b.slice(off)); break;}
if (tag!== 'EXIF' && tag!== 'XMP ') parts.push(b.slice(off, off + total));
off += total;
}
var out = concatParts(parts);
// 重写 RIFF 大小
writeU32le(out, 4, out.length - 8);
// VP8X：清除 EXIF(0x08)/XMP(0x04) feature 位
var p = 12;
while (p + 8 <= out.length) {
if (fourcc(out, p) === 'VP8X' && p + 18 <= out.length) {
out[p + 8] = out[p + 8] & ~0x0C;
break;
}
var sz = (out[p + 4] | (out[p + 5] << 8) | (out[p + 6] << 16) | (out[p + 7] << 24)) >>> 0;
p += 8 + sz + (sz % 2);
}
return out;
}

/* ============ 分发 ============ */
function detectFormat(file, buf) {
var b = new Uint8Array(buf.slice(0, 16));
if (b.length >= 2 && b[0] === 0xFF && b[1] === 0xD8) return 'jpeg';
if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
if (b.length >= 12 && fourcc(b, 0) === 'RIFF' && fourcc(b, 8) === 'WEBP') return 'webp';
if (/png$/i.test(file.name)) return 'png';
if (/webp$/i.test(file.name)) return 'webp';
return 'jpeg';
}
function parseByFormat(fmt, buf) {
if (fmt === 'png') return parsePNG(buf);
if (fmt === 'webp') return parseWebP(buf);
return parseJPEG(buf);
}
function stripByFormat(fmt, buf) {
if (fmt === 'png') return stripPNG(buf);
if (fmt === 'webp') return stripWebP(buf);
return stripJPEG(buf);
}
var MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp'};
var EXT = { jpeg: 'jpg', png: 'png', webp: 'webp'};

function canvasFallback(item) {
return new Promise(function (resolve, reject) {
var url = URL.createObjectURL(new Blob([item.buffer], { type: MIME[item.fmt] || 'image/jpeg'}));
var img = new Image();
img.onload = function () {
try {
var c = document.createElement('canvas');
c.width = img.naturalWidth; c.height = img.naturalHeight;
c.getContext('2d').drawImage(img, 0, 0);
URL.revokeObjectURL(url);
c.toBlob(function (blob) {
if (blob) resolve(blob); else reject(new Error('重绘失败'));
}, MIME[item.fmt] || 'image/jpeg', 0.95);
} catch (e) { reject(e);}
};
img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片解码失败'));};
img.src = url;
});
}

function stripItem(item) {
if (item.cleanedBlob) return Promise.resolve(item);
var cleaned = null, reencoded = false;
try {
cleaned = stripByFormat(item.fmt, item.buffer);
} catch (e) { cleaned = null;}
if (!cleaned ||!cleaned.length) {
return canvasFallback(item).then(function (blob) {
item.cleanedBlob = blob;
item.reencoded = true;
return blob.arrayBuffer();
}).then(function (ab) {
item.afterInfo = parseByFormat(item.fmt, ab);
return item;
});
}
item.cleanedBlob = new Blob([cleaned], { type: MIME[item.fmt] || 'image/jpeg'});
item.reencoded = reencoded;
// 复检：重新解析清除后的字节
return item.cleanedBlob.arrayBuffer().then(function (ab) {
item.afterInfo = parseByFormat(item.fmt, ab);
if (item.afterInfo.count > 0 &&!item.reencoded) {
// 字节级剥离后仍残留时降级重绘
return canvasFallback(item).then(function (blob) {
item.cleanedBlob = blob;
item.reencoded = true;
return blob.arrayBuffer();
}).then(function (ab2) {
item.afterInfo = parseByFormat(item.fmt, ab2);
return item;
});
}
return item;
});
}

/* ============ UI ============ */
function getItem(id) {
for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
return null;
}
function renderQueue() {
var q = $('es-queue');
q.innerHTML = '';
items.forEach(function (it) {
var d = document.createElement('div');
d.className = 'es-item' + (it.id === activeId? ' active': '');
var badge = '';
if (it.cleanedBlob) badge = '<span class="badge ok">已清除</span>';
else if (it.info && it.info.count > 0) badge = '<span class="badge">' + it.info.count + ' 项元数据</span>';
else if (it.info) badge = '<span class="badge ok">无元数据</span>';
d.innerHTML = '<button type="button" class="del" title="移除">×</button><img alt="">' +
'<div class="nm">' + esc(it.name) + '</div><div class="sz">' + fmtSize(it.size) + '</div>' + badge;
d.querySelector('img').src = it.dataUrl;
d.querySelector('.del').addEventListener('click', function (e) {
e.stopPropagation();
removeItem(it.id);
});
d.addEventListener('click', function () { selectItem(it.id);});
q.appendChild(d);
});
$('es-queue-actions').style.display = items.length? 'flex': 'none';
}
function removeItem(id) {
items = items.filter(function (x) { return x.id!== id;});
if (activeId === id) {
activeId = items.length? items[0].id: null;
if (activeId) renderDetail(getItem(activeId)); else $('es-detail').style.display = 'none';
}
renderQueue();
}
function selectItem(id) {
activeId = id;
renderQueue();
var it = getItem(id);
if (it) renderDetail(it);
}
function loadDims(it) {
return new Promise(function (resolve) {
var img = new Image();
img.onload = function () { resolve({ w: img.naturalWidth, h: img.naturalHeight});};
img.onerror = function () { resolve({ w: 0, h: 0});};
img.src = it.dataUrl;
});
}
function renderDetail(it) {
$('es-detail').style.display = 'block';
loadDims(it).then(function (dim) {
var info = it.info;
$('es-basic').innerHTML = '文件：<b>' + esc(it.name) + '</b> · 格式：' + (info.format || EXT[it.fmt]) +
(dim.w? ' · 尺寸：' + dim.w + ' × ' + dim.h: '') +
' · 大小：' + fmtSize(it.size) +
' · EXIF：' + (info.hasExif? '有': '无') +
' · XMP：' + (info.hasXMP? '有': '无') +
' · ICC：' + (info.hasICC? '有': '无') +
(it.reencoded? ' · 本次清除方式：canvas 重绘（已重编码）': '');
var holder = $('es-table-holder');
if (!info.count) {
holder.innerHTML = '<div class="es-empty">未检测到 EXIF / 元数据，这张图片没有可清除的隐私元数据，可直接分享。</div>';
} else {
var html = '<div class="es-table-wrap"><table class="es-table"><thead><tr><th>字段</th><th>值</th></tr></thead><tbody>';
info.fields.forEach(function (f) {
var cls = f.privacy === 'gps'? 'es-warn': (f.privacy === 'serial'? 'es-serial': '');
var warn = f.privacy === 'gps'? ' ⚠ 可定位拍摄地点': (f.privacy === 'serial'? ' ⚠ 设备序列号': '');
html += '<tr class="' + cls + '"><td>' + esc(f.label) + '</td><td>' + esc(f.value) + warn + '</td></tr>';
});
html += '</tbody></table></div>';
holder.innerHTML = html;
}
renderResult(it);
});
}
function renderResult(it) {
var holder = $('es-result-holder');
var dl = $('es-download');
if (it.cleanedBlob && it.afterInfo) {
var before = it.info? it.info.count: 0;
holder.innerHTML = '<div class="es-result">清除完成：清除前 ' + before + ' 项 → 清除后 ' + it.afterInfo.count + ' 项；' +
'体积 ' + fmtSize(it.size) + ' → ' + fmtSize(it.cleanedBlob.size) +
(it.reencoded? '；字节级剥离失败，已降级 canvas 重绘（已重编码，画质可能有轻微变化）': '；字节级无损剥离，未重编码') + '</div>';
dl.style.display = 'inline-flex';
} else {
holder.innerHTML = '';
dl.style.display = 'none';
}
}

function addFiles(fileList) {
var files = Array.prototype.slice.call(fileList || []);
if (!files.length) return;
var ok = files.filter(function (f) {
return /image\/(jpeg|png|webp)/.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name);
});
if (!ok.length) { toast('仅支持 JPG / PNG / WebP 图片'); return;}
if (ok.length < files.length) toast('已忽略不支持的文件，仅处理 JPG / PNG / WebP');
setStatus('正在本地解析元数据…');
var firstNew = null;
var chain = Promise.resolve();
ok.forEach(function (f) {
chain = chain.then(function () {
return f.arrayBuffer().then(function (buf) {
var fmt = detectFormat(f, buf);
var info = parseByFormat(fmt, buf);
var it = {
id: ++seq, name: f.name, size: f.size, type: f.type, fmt: fmt,
buffer: buf, info: info, cleanedBlob: null, afterInfo: null, reencoded: false,
dataUrl: URL.createObjectURL(new Blob([buf], { type: MIME[fmt]}))
};
it.cleanedName = (f.name.replace(/\.[^.]+$/, '') || 'image') + '_clean.' + (f.name.match(/\.([a-z0-9]+)$/i)? f.name.match(/\.([a-z0-9]+)$/i)[1].toLowerCase(): EXT[fmt]);
items.push(it);
if (!firstNew) firstNew = it;
}).catch(function () { toast('有文件读取失败已跳过：' + f.name);});
});
});
chain.then(function () {
setStatus('');
renderQueue();
if (firstNew) selectItem(firstNew.id);
var total = items.reduce(function (s, x) { return s + (x.info? x.info.count: 0);}, 0);
toast('已加入 ' + ok.length + ' 张图片' + (total? '，共检测到 ' + total + ' 项元数据': '，未检测到元数据'));
});
}

function downloadBlob(blob, name) {
var a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = name;
document.body.appendChild(a);
a.click();
setTimeout(function () { URL.revokeObjectURL(a.href); a.remove();}, 400);
}

/* ============ 事件 ============ */
var upload = $('es-upload'), fileInput = $('es-file');
upload.addEventListener('click', function () { fileInput.click();});
upload.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click();}});
fileInput.addEventListener('change', function () { addFiles(fileInput.files); fileInput.value = '';});
['dragenter', 'dragover'].forEach(function (ev) {
upload.addEventListener(ev, function (e) { e.preventDefault(); upload.classList.add('dragover');});
});
['dragleave', 'drop'].forEach(function (ev) {
upload.addEventListener(ev, function (e) { e.preventDefault(); upload.classList.remove('dragover');});
});
upload.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files);});
document.addEventListener('dragover', function (e) { e.preventDefault();});
document.addEventListener('drop', function (e) { e.preventDefault();});

$('es-strip').addEventListener('click', function () {
var it = getItem(activeId);
if (!it) { toast('请先上传并选择一张图片'); return;}
setStatus('正在清除元数据…');
stripItem(it).then(function () {
setStatus('');
renderQueue();
renderDetail(it);
toast('清除完成：' + it.name);
}).catch(function () { setStatus(''); toast('清除失败，请换一张图片试试');});
});
$('es-download').addEventListener('click', function () {
var it = getItem(activeId);
if (it && it.cleanedBlob) downloadBlob(it.cleanedBlob, it.cleanedName);
});
$('es-clear-all').addEventListener('click', function () {
items.forEach(function (it) { try { URL.revokeObjectURL(it.dataUrl);} catch (e) {}});
items = []; activeId = null;
$('es-detail').style.display = 'none';
renderQueue();
toast('队列已清空');
});

function ensureJSZip() {
return new Promise(function (resolve, reject) {
if (window.JSZip) { resolve(); return;}
var s = document.createElement('script');
var done = false;
var timer = setTimeout(function () {
if (!done) { done = true; s.remove(); reject(new Error('timeout'));}
}, 15000);
s.onload = function () {
if (!done) { done = true; clearTimeout(timer); window.JSZip? resolve(): reject(new Error('bad lib'));}
};
s.onerror = function () {
if (!done) { done = true; clearTimeout(timer); reject(new Error('load failed'));}
};
s.src = ZIP_CDN;
document.head.appendChild(s);
});
}
function stripAll() {
return Promise.all(items.map(function (it) { return stripItem(it).catch(function () { return it;});}));
}
$('es-strip-all').addEventListener('click', function () {
if (!items.length) { toast('请先上传图片'); return;}
setStatus('正在批量清除并逐个下载…');
stripAll().then(function () {
setStatus('');
renderQueue();
var cur = getItem(activeId);
if (cur) renderDetail(cur);
items.forEach(function (it, i) {
if (it.cleanedBlob) setTimeout(function () { downloadBlob(it.cleanedBlob, it.cleanedName);}, i * 450);
});
toast('已开始逐张下载 ' + items.length + ' 张（请在浏览器中允许下载多个文件）');
});
});
$('es-zip-all').addEventListener('click', function () {
if (!items.length) { toast('请先上传图片'); return;}
var msg = $('es-zipmsg');
msg.textContent = '正在清除并打包…';
stripAll().then(function () {
renderQueue();
return ensureJSZip();
}).then(function () {
var zip = new window.JSZip();
items.forEach(function (it) { if (it.cleanedBlob) zip.file(it.cleanedName, it.cleanedBlob);});
return zip.generateAsync({ type: 'blob'});
}).then(function (blob) {
msg.textContent = '';
downloadBlob(blob, 'exif-cleaned.zip');
toast('打包下载完成：exif-cleaned.zip');
}).catch(function () {
msg.textContent = '打包组件（JSZip CDN）加载失败，已自动降级为逐张下载。';
toast('打包组件加载失败，已降级为逐张下载');
items.forEach(function (it, i) {
if (it.cleanedBlob) setTimeout(function () { downloadBlob(it.cleanedBlob, it.cleanedName);}, i * 450);
});
});
});
})();
