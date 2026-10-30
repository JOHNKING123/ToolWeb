/* 文件十六进制查看器（hex_viewer）- 纯前端本地查看，零上传
 * 纯函数（双模式导出供 node 测试）：
 *   formatHexRow(bytes, offset) → {offset:'00000000', hex:['41','42','00','7F'], ascii:'AB..'}
 *   isPrintable(byte)           → 0x20–0x7E 为 true（Latin-1 可打印判定）
 *   byteInspector(byte, offset) → {offsetHex:'00000010', hex:'41', decimal:65, binary:'01000001', char:'A'}
 *   parseHexSearch(query)       → Uint8Array（如 '0x41, 42' → [0x41,0x42]）
 *   parseAsciiSearch(text)      → Uint8Array（ASCII 文本按 Latin-1 转字节）
 *   findBytes(haystack, needle) → [0, 2]（全部匹配偏移，可重叠）
 * 失败约定：非法参数抛 Error，err.field 给出字段名（bytes／offset／byte／query／haystack／needle），不静默钳制。
 * 零网络请求：本文件不发起任何 fetch / XHR。 */
(function () {
'use strict';

/* ---------- 失败构造 ---------- */
function fail(field, msg) {
  var e = new Error(msg);
  e.field = field;
  throw e;
}

/* ---------- 基础工具 ---------- */
function checkOffset(offset) {
  if (typeof offset !== 'number' || !isFinite(offset) || Math.floor(offset) !== offset || offset < 0) {
    fail('offset', '偏移必须为非负整数（实得 ' + offset + '）。');
  }
  return offset;
}

function checkByte(b, field) {
  if (typeof b !== 'number' || !isFinite(b) || Math.floor(b) !== b || b < 0 || b > 255) {
    fail(field || 'byte', '字节值必须为 0–255 的整数（实得 ' + b + '）。');
  }
  return b;
}

function toBytesArray(bytes, field) {
  field = field || 'bytes';
  var arr, i;
  if (bytes instanceof Uint8Array) { arr = bytes; }
  else if (Array.isArray(bytes)) { arr = bytes; }
  else { fail(field, '字节数据必须为 Uint8Array 或数组。'); }
  for (i = 0; i < arr.length; i++) {
    checkByte(arr[i], field);
  }
  return arr;
}

function byteHex(b) {
  var h = (b & 0xFF).toString(16).toUpperCase();
  return h.length < 2 ? '0' + h : h;
}

function offsetHex(offset) {
  checkOffset(offset);
  var h = offset.toString(16).toUpperCase();
  while (h.length < 8) h = '0' + h;
  return h;
}

/* ---------- formatHexRow ---------- */
function formatHexRow(bytes, offset) {
  var arr = toBytesArray(bytes, 'bytes');
  checkOffset(offset);
  var hex = [], ascii = '', i, b;
  for (i = 0; i < arr.length; i++) {
    b = arr[i];
    hex.push(byteHex(b));
    ascii += (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '.';
  }
  return { offset: offsetHex(offset), hex: hex, ascii: ascii };
}

/* ---------- isPrintable ---------- */
function isPrintable(byte) {
  checkByte(byte, 'byte');
  return byte >= 0x20 && byte <= 0x7E;
}

/* ---------- byteInspector ---------- */
function byteInspector(byte, offset) {
  checkByte(byte, 'byte');
  checkOffset(offset);
  var bin = byte.toString(2);
  while (bin.length < 8) bin = '0' + bin;
  return {
    offsetHex: offsetHex(offset),
    hex: byteHex(byte),
    decimal: byte,
    binary: bin,
    char: (byte >= 0x20 && byte <= 0x7E) ? String.fromCharCode(byte) : '.'
  };
}

/* ---------- parseHexSearch ---------- */
var HEX_TOKEN_RE = /^(?:0[xX])?[0-9a-fA-F]{2}$/;
function parseHexSearch(query) {
  if (typeof query !== 'string') fail('query', '搜索输入必须为字符串。');
  var parts = query.split(/[\s,;，、]+/);
  var vals = [], i, tok;
  for (i = 0; i < parts.length; i++) {
    tok = parts[i];
    if (tok === '') continue;
    if (!HEX_TOKEN_RE.test(tok)) {
      fail('query', '搜索词非法（"' + tok + '"）：HEX 搜索只允许每字节 2 位十六进制数字，可带 0x 前缀，字节间用空格/逗号分隔。');
    }
    vals.push(parseInt(tok.replace(/^0[xX]/, ''), 16));
  }
  if (vals.length === 0) fail('query', '搜索输入为空：请至少输入 1 个字节。');
  return new Uint8Array(vals);
}

/* ---------- parseAsciiSearch ---------- */
function parseAsciiSearch(text) {
  if (typeof text !== 'string') fail('query', '搜索输入必须为字符串。');
  if (text.length === 0) fail('query', '搜索输入为空：请输入要搜索的 ASCII 文本。');
  var vals = [], i;
  for (i = 0; i < text.length; i++) {
    vals.push(text.charCodeAt(i) & 0xFF);
  }
  return new Uint8Array(vals);
}

/* ---------- findBytes ---------- */
function findBytes(haystack, needle) {
  var h = toBytesArray(haystack, 'haystack');
  var n = toBytesArray(needle, 'needle');
  if (n.length === 0) fail('needle', '被搜索的字节序列不能为空。');
  var out = [], i, j, matched;
  if (n.length > h.length) return out;
  for (i = 0; i <= h.length - n.length; i++) {
    matched = true;
    for (j = 0; j < n.length; j++) {
      if (h[i + j] !== n[j]) { matched = false; break; }
    }
    if (matched) out.push(i);
  }
  return out;
}

/* ---------- 双模式导出 ---------- */
var api = {
  formatHexRow: formatHexRow,
  isPrintable: isPrintable,
  byteInspector: byteInspector,
  parseHexSearch: parseHexSearch,
  parseAsciiSearch: parseAsciiSearch,
  findBytes: findBytes
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  window.__hexViewer = api;
}

/* ---------- 浏览器 DOM ---------- */
if (typeof document !== 'undefined') {
  (function () {
    var ROW_BYTES = 16;
    var DEFAULT_RPP = 256; // 每页行数
    var MAX_FILE = 256 * 1024 * 1024; // 256MB 上限
    var CHUNK = 1 << 20; // 搜索分块 1MB
    var MAX_MATCHES = 2000;

    var file = null, fileSize = 0, fileName = '';
    var currentPage = 0, rowsPerPage = DEFAULT_RPP, totalPages = 0;
    var selectedOffset = -1;
    var matches = [], matchIdx = -1, lastNeedle = null;

    function $(id) { return document.getElementById(id); }

    function formatBytes(n) {
      if (n < 1024) return n + ' B';
      if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
      if (n < 1073741824) return (n / 1048576).toFixed(2) + ' MB';
      return (n / 1073741824).toFixed(2) + ' GB';
    }

    function toast(msg) {
      var t = $('hv-toast');
      t.textContent = msg;
      t.style.display = 'block';
      clearTimeout(t._timer);
      t._timer = setTimeout(function () { t.style.display = 'none'; }, 2600);
    }

    function setFile(f) {
      if (!f) return;
      if (f.size === 0) { toast('文件为空，无法查看。'); return; }
      if (f.size > MAX_FILE) {
        toast('文件 ' + formatBytes(f.size) + ' 超过 256MB 上限：本工具仅支持 ≤256MB 文件。');
        return;
      }
      file = f; fileName = f.name || '未命名文件'; fileSize = f.size;
      totalPages = Math.ceil(fileSize / (rowsPerPage * ROW_BYTES));
      currentPage = 0; selectedOffset = -1; matches = []; matchIdx = -1; lastNeedle = null;
      $('hv-drop-hint').style.display = 'none';
      $('hv-viewer').style.display = '';
      $('hv-tools-card').style.display = '';
      renderFileInfo();
      loadPage(0);
      toast('已载入：' + fileName + '（' + formatBytes(fileSize) + '）。');
    }

    function renderFileInfo() {
      $('hv-info').textContent = '文件：' + fileName + '　·　大小：' + formatBytes(fileSize) +
        '（' + fileSize + ' 字节）　·　每页 ' + (rowsPerPage * ROW_BYTES) + ' 字节，共 ' + totalPages + ' 页';
    }

    function loadPage(p) {
      if (!file) return;
      currentPage = Math.max(0, Math.min(p, totalPages - 1));
      var start = currentPage * rowsPerPage * ROW_BYTES;
      var end = Math.min(start + rowsPerPage * ROW_BYTES, fileSize);
      file.slice(start, end).arrayBuffer().then(function (buf) {
        renderRows(new Uint8Array(buf), start);
      }).catch(function () {
        toast('读取文件分片失败，请重试。');
      });
    }

    function renderRows(bytes, baseOffset) {
      var html = '', i, j, b, off, row, parts, asc;
      for (i = 0; i < bytes.length; i += ROW_BYTES) {
        row = formatHexRow(Array.prototype.slice.call(bytes, i, i + ROW_BYTES), baseOffset + i);
        parts = '';
        for (j = 0; j < row.hex.length; j++) {
          off = baseOffset + i + j;
          parts += '<span class="hv-b' + (j === 8 ? ' hv-gap' : '') +
            (off === selectedOffset ? ' hv-sel' : '') +
            '" data-off="' + off + '">' + row.hex[j] + '</span>';
        }
        asc = row.ascii.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        html += '<div class="hv-row"><span class="hv-off">' + row.offset + '</span>' +
          '<span class="hv-hex">' + parts + '</span>' +
          '<span class="hv-asc">' + asc + '</span></div>';
      }
      $('hv-rows').innerHTML = html;
      var from = baseOffset, to = baseOffset + bytes.length - 1;
      $('hv-pageinfo').textContent = '第 ' + (currentPage + 1) + ' / ' + totalPages + ' 页　·　偏移 0x' +
        from.toString(16).toUpperCase() + ' – 0x' + to.toString(16).toUpperCase();
      $('hv-prev').disabled = currentPage <= 0;
      $('hv-next').disabled = currentPage >= totalPages - 1;
    }

    function parseJumpInput(text) {
      text = (text || '').trim();
      if (!text) fail('query', '请输入要跳转的偏移。');
      var n;
      if (/^0[xX][0-9a-fA-F]+$/.test(text)) { n = parseInt(text, 16); }
      else if (/^[0-9a-fA-F]+[hH]$/.test(text)) { n = parseInt(text.slice(0, -1), 16); }
      else if (/^\d+$/.test(text)) { n = parseInt(text, 10); }
      else { fail('query', '偏移格式非法：支持十进制（如 1024）、0x 前缀十六进制（如 0x400）、h 后缀十六进制（如 400h）。'); }
      if (n >= fileSize) fail('query', '偏移 0x' + n.toString(16).toUpperCase() + ' 超出文件大小（' + fileSize + ' 字节）。');
      return n;
    }

    function inspectAt(offset) {
      selectedOffset = offset;
      var start = currentPage * rowsPerPage * ROW_BYTES;
      file.slice(offset, offset + 1).arrayBuffer().then(function (buf) {
        var b = new Uint8Array(buf)[0];
        var r = byteInspector(b, offset);
        $('hv-insp').innerHTML =
          '<span class="hv-kv"><b>偏移</b> 0x' + r.offsetHex + '（' + offset + '）</span>' +
          '<span class="hv-kv"><b>HEX</b> ' + r.hex + '</span>' +
          '<span class="hv-kv"><b>十进制</b> ' + r.decimal + '</span>' +
          '<span class="hv-kv"><b>二进制</b> ' + r.binary + '</span>' +
          '<span class="hv-kv"><b>字符</b> ' + (r.char === '<' ? '&lt;' : r.char) + '</span>';
        // 刷新选中态
        var spans = $('hv-rows').querySelectorAll('.hv-b');
        for (var i = 0; i < spans.length; i++) {
          spans[i].classList.toggle('hv-sel', parseInt(spans[i].getAttribute('data-off'), 10) === offset);
        }
        // 若不在当前页则跳转
        if (offset < start || offset >= start + rowsPerPage * ROW_BYTES) {
          loadPage(Math.floor(offset / (rowsPerPage * ROW_BYTES)));
        }
      });
    }

    function gotoMatch(idx) {
      if (!matches.length) return;
      matchIdx = (idx + matches.length) % matches.length;
      var off = matches[matchIdx];
      $('hv-search-info').textContent = '命中 ' + matches.length + ' 处，当前第 ' + (matchIdx + 1) + ' 处（偏移 0x' +
        off.toString(16).toUpperCase() + '）';
      inspectAt(off);
    }

    function doSearch() {
      if (!file) { toast('请先选择文件。'); return; }
      var mode = document.querySelector('input[name="hv-smode"]:checked').value;
      var raw = $('hv-search').value;
      var needle;
      try {
        needle = mode === 'hex' ? parseHexSearch(raw) : parseAsciiSearch(raw);
      } catch (e) {
        toast(e.message);
        return;
      }
      if (needle.length > 4096) { toast('搜索序列过长（最多 4096 字节）。'); return; }
      $('hv-search-info').textContent = '正在分片搜索…';
      matches = []; matchIdx = -1; lastNeedle = needle;
      var pos = 0, overlap = needle.length - 1;
      (function step() {
        if (pos >= fileSize || matches.length >= MAX_MATCHES) {
          done();
          return;
        }
        var end = Math.min(pos + CHUNK + overlap, fileSize);
        file.slice(pos, end).arrayBuffer().then(function (buf) {
          var local = findBytes(new Uint8Array(buf), needle);
          for (var i = 0; i < local.length; i++) {
            var abs = pos + local[i];
            if (matches.length === 0 || abs > matches[matches.length - 1]) {
              matches.push(abs);
            }
          }
          pos += CHUNK;
          step();
        }).catch(function () { toast('搜索读取失败。'); });
      })();
      function done() {
        if (!matches.length) {
          $('hv-search-info').textContent = '未找到匹配的字节序列。';
          toast('未找到匹配。');
          return;
        }
        if (matches.length >= MAX_MATCHES) {
          $('hv-search-info').textContent = '命中超过 ' + MAX_MATCHES + ' 处，仅显示前 ' + MAX_MATCHES + ' 处。';
        }
        toast('找到 ' + matches.length + ' 处匹配。');
        gotoMatch(0);
      }
    }

    function loadExample() {
      // 合成示例：类 PNG 头 + 文本 + 二进制混合，4096 字节
      var data = new Uint8Array(4096);
      var sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
      for (var i = 0; i < sig.length; i++) data[i] = sig[i];
      var txt = 'Hello, Hex Viewer! 这是示例文件。';
      for (i = 0; i < txt.length; i++) data[16 + i] = txt.charCodeAt(i) & 0xFF;
      var seed = 0x12345678;
      for (i = 64; i < data.length; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
        data[i] = (seed >>> 16) & 0xFF;
      }
      setFile(new Blob([data], { type: 'application/octet-stream' }));
      fileName = 'hex-viewer-example.bin';
      renderFileInfo();
    }

    document.addEventListener('DOMContentLoaded', function () {
      var drop = $('hv-drop'), fi = $('hv-file');
      $('hv-pick').addEventListener('click', function () { fi.click(); });
      fi.addEventListener('change', function () { setFile(fi.files[0]); fi.value = ''; });
      ['dragenter', 'dragover'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('hv-over'); });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('hv-over'); });
      });
      drop.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) setFile(f);
      });
      $('hv-example').addEventListener('click', loadExample);

      $('hv-rpp').addEventListener('change', function () {
        if (!file) return;
        rowsPerPage = parseInt($('hv-rpp').value, 10);
        totalPages = Math.ceil(fileSize / (rowsPerPage * ROW_BYTES));
        currentPage = 0; renderFileInfo(); loadPage(0);
      });
      $('hv-prev').addEventListener('click', function () { loadPage(currentPage - 1); });
      $('hv-next').addEventListener('click', function () { loadPage(currentPage + 1); });

      $('hv-rows').addEventListener('click', function (e) {
        var t = e.target;
        if (t && t.classList && t.classList.contains('hv-b')) {
          inspectAt(parseInt(t.getAttribute('data-off'), 10));
        }
      });

      $('hv-jump-btn').addEventListener('click', function () {
        if (!file) { toast('请先选择文件。'); return; }
        try { inspectAt(parseJumpInput($('hv-jump').value)); }
        catch (e) { toast(e.message); }
      });
      $('hv-jump').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') $('hv-jump-btn').click();
      });

      $('hv-search-btn').addEventListener('click', doSearch);
      $('hv-search').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') doSearch();
      });
      $('hv-match-prev').addEventListener('click', function () { gotoMatch(matchIdx - 1); });
      $('hv-match-next').addEventListener('click', function () { gotoMatch(matchIdx + 1); });
    });
  })();
}
})();
