/* MBOX 邮件存档查看器（mbox_viewer）：纯前端本地解析 .mbox 邮件存档
 *
 * 功能：
 *  1) 本地选择 .mbox 文件（FileReader 读取，>200MB 给内存提示），零上传
 *  2) 自写解析：From 行切分邮件块 → RFC 5322 头部解析（折叠行展开）→
 *     encoded-word（=?charset?B/Q?...?=）解码 → quoted-printable / base64
 *     正文解码 → multipart 树解析（alternative 取文本版、mixed 抽取附件）
 *  3) 邮件列表（发件人/主题/日期，可排序）、点击看正文（HTML 转义安全渲染）
 *  4) 全文搜索（主题/正文/发件人/附件名，不区分大小写）
 *  5) 附件清单（按邮件聚合，单附件 Blob 下载 / 全部下载）
 *  6) 损坏邮件块跳过并计数提示，不中断其余解析
 * 不引第三方库；零 fetch/XHR；脚本内不做任何网络请求。
 * 纯函数经 module.exports 暴露，node tests/mbox_viewer.test.js 自测；
 * 浏览器内 init 挂 DOMContentLoaded。
 */
(function () {
"use strict";

function hasDOM() { return typeof document !== "undefined"; }

/* ================= 0. 常量与小工具 ================= */
var MAX_FILE_SIZE = 200 * 1024 * 1024; /* 200MB：超过则提示内存风险 */

function trim(s) { return String(s).replace(/^\s+|\s+$/g, ""); }
function isHex(ch) {
  return (ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f") || (ch >= "A" && ch <= "F");
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function fmtSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}
function fmtDate(dateMs, dateRaw) {
  if (dateMs) {
    try { return new Date(dateMs).toLocaleString("zh-CN", { hour12: false }); }
    catch (e) { /* fallthrough */ }
  }
  return dateRaw || "(未知日期)";
}

/* ================= 1. base64 → 字节 =================
 * 浏览器 atob / node 全局 atob 均可用；不依赖 Buffer。
 */
function b64ToBytes(s) {
  var clean = String(s).replace(/[^A-Za-z0-9+\/=]/g, "");
  while (clean.length % 4 !== 0) clean += "=";
  var bin = atob(clean);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
}

/* ================= 2. charset 归一化 + 字节解码 ================= */
function normCharset(cs) {
  if (!cs) return "utf-8";
  var c = String(cs).toLowerCase().replace(/_/g, "-").replace(/^["']|["']$/g, "").replace(/^\s+|\s+$/g, "");
  if (c === "utf8") return "utf-8";
  if (c === "gb2312") return "gbk"; /* gbk 为 gb2312 超集 */
  if (c === "ascii" || c === "us-ascii") return "utf-8";
  return c;
}
function decodeBytes(bytes, charset) {
  var cs = normCharset(charset);
  try { return new TextDecoder(cs).decode(bytes); }
  catch (e) {
    if (cs !== "utf-8") {
      try { return new TextDecoder("utf-8").decode(bytes); } catch (e2) { /* fallthrough */ }
    }
    return new TextDecoder("latin1").decode(bytes);
  }
}

/* ================= 3. encoded-word 解码（RFC 2047） =================
 * =?charset?B|Q?text?= ；相邻 encoded-word 之间的线性空白按规范忽略。
 */
function qpWordToBytes(t) { /* encoded-word 内部的 Q 编码：_ → 空格 */
  var out = [];
  for (var i = 0; i < t.length; i++) {
    var ch = t[i];
    if (ch === "_") { out.push(0x20); }
    else if (ch === "=" && i + 2 < t.length && isHex(t[i + 1]) && isHex(t[i + 2])) {
      out.push(parseInt(t.substr(i + 1, 2), 16)); i += 2;
    } else { out.push(ch.charCodeAt(0) & 0xff); }
  }
  return new Uint8Array(out);
}
var ENCODED_WORD_RE = /=\?([^?\s]+)\?([bBqQ])\?([^?]*)\?=/g;
function decodeEncodedWords(s) {
  if (!s || s.indexOf("=?") === -1) return s;
  var merged = String(s).replace(/(\?=)[ \t]+(=\?)/g, "$1$2");
  return merged.replace(ENCODED_WORD_RE, function (m, charset, enc, text) {
    try {
      var bytes = (enc.toUpperCase() === "B") ? b64ToBytes(text) : qpWordToBytes(text);
      return decodeBytes(bytes, charset);
    } catch (e) { return m; }
  });
}

/* ================= 4. quoted-printable 正文解码 =================
 * 先去软换行（=CRLF / =LF），=XX → 字节；其余字符按 latin1 取字节，
 * 调用方再按 charset 做 decodeBytes。
 */
function decodeQuotedPrintable(s) {
  var t = String(s).replace(/=\r?\n/g, "");
  var out = [];
  for (var i = 0; i < t.length; i++) {
    var ch = t[i];
    if (ch === "=" && i + 2 < t.length && isHex(t[i + 1]) && isHex(t[i + 2])) {
      out.push(parseInt(t.substr(i + 1, 2), 16)); i += 2;
    } else {
      out.push(ch.charCodeAt(0) & 0xff);
    }
  }
  return new Uint8Array(out);
}
function strToBytesLatin1(s) {
  s = String(s);
  var out = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/* ================= 5. From 行切分（mbox） =================
 * 每封邮件以行首 "From " 开头；mboxrd 转义的 ">From " 还原。
 */
function splitMbox(text) {
  var lines = String(text).split(/\r?\n/);
  var msgs = [];
  var cur = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.indexOf("From ") === 0) {
      if (cur !== null) msgs.push(cur.join("\n"));
      cur = [];
    } else if (cur !== null) {
      if (line.indexOf(">From ") === 0) line = line.slice(1);
      cur.push(line);
    }
  }
  if (cur !== null) msgs.push(cur.join("\n"));
  return msgs;
}

/* ================= 6. RFC 5322 头部解析（含折叠行展开） ================= */
function parseHeaders(rawHeaderText) {
  var map = {};   /* 小写名 -> [值,...] */
  var order = [];
  var lines = String(rawHeaderText).split(/\r?\n/);
  var curName = null, curVal = null;
  function flush() {
    if (curName !== null) {
      var n = curName.toLowerCase();
      if (!map[n]) map[n] = [];
      map[n].push(curVal);
      order.push(n);
    }
    curName = null; curVal = null;
  }
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line === "") continue;
    var first = line.charAt(0);
    if (first !== " " && first !== "\t") {
      var m = line.match(/^([^:]+):(.*)$/);
      if (m) {
        flush();
        curName = trim(m[1]); curVal = trim(m[2]);
      }
      /* 无冒号的损坏行：忽略，不中断 */
    } else if (curName !== null) {
      curVal += " " + trim(line); /* 折叠行展开 */
    }
  }
  flush();
  return { map: map, order: order };
}
function getHeader(h, name) { /* 取最后一个（如 Subject 正常只出现一次） */
  var v = h.map[String(name).toLowerCase()];
  return (v && v.length) ? v[v.length - 1] : "";
}
function getHeaderFirst(h, name) {
  var v = h.map[String(name).toLowerCase()];
  return (v && v.length) ? v[0] : "";
}

/* ================= 7. Content-Type / Content-Disposition 参数解析 ================= */
function parseParams(s) {
  var params = {};
  var parts = String(s || "").split(";");
  for (var i = 1; i < parts.length; i++) {
    var m = parts[i].match(/^\s*([^=\s]+)\s*=\s*(.*)$/);
    if (m) {
      var v = trim(m[2]);
      if (v.length >= 2 && ((v[0] === '"' && v[v.length - 1] === '"') ||
          (v[0] === "'" && v[v.length - 1] === "'"))) v = v.slice(1, -1);
      params[m[1].toLowerCase()] = v;
    }
  }
  return params;
}
function parseContentType(s) {
  var head = trim(String(s || "").split(";")[0]).toLowerCase() || "text/plain";
  var slash = head.indexOf("/");
  var params = parseParams(s);
  return {
    full: head,
    type: slash === -1 ? head : head.slice(0, slash),
    subtype: slash === -1 ? "" : head.slice(slash + 1),
    charset: params["charset"] || "",
    boundary: params["boundary"] || "",
    name: params["name"] || ""
  };
}
function parseDisposition(s) {
  var head = trim(String(s || "").split(";")[0]).toLowerCase();
  return { type: head, params: parseParams(s) };
}

/* ================= 8. MIME 树解析 ================= */
function splitHeaderBody(raw) {
  var m = String(raw).match(/\r?\n\r?\n/);
  if (!m) return { headerText: String(raw), bodyText: "" };
  return { headerText: raw.slice(0, m.index), bodyText: raw.slice(m.index + m[0].length) };
}
function decodeBodyBytes(bodyText, encoding) {
  if (encoding === "base64") {
    try { return b64ToBytes(bodyText); }
    catch (e) { return strToBytesLatin1(bodyText); }
  }
  if (encoding === "quoted-printable" || encoding === "quotedprintable") {
    return decodeQuotedPrintable(bodyText);
  }
  return strToBytesLatin1(bodyText); /* 7bit / 8bit / binary */
}
function splitMultipart(bodyText, boundary) {
  var delim = "--" + boundary;
  var close = delim + "--";
  var lines = String(bodyText).split(/\r?\n/);
  var parts = [], cur = null, inPart = false;
  for (var i = 0; i < lines.length; i++) {
    var edge = lines[i].replace(/[ \t]+$/, ""); /* 分隔行容错尾随空白 */
    if (edge === delim) {
      if (cur !== null) parts.push(cur.join("\n"));
      cur = []; inPart = true;
    } else if (edge === close) {
      if (cur !== null) parts.push(cur.join("\n"));
      cur = null; inPart = false; break;
    } else if (inPart && cur !== null) {
      cur.push(lines[i]);
    }
  }
  return parts;
}
function parseMime(raw) {
  var hb = splitHeaderBody(raw);
  var headers = parseHeaders(hb.headerText);
  var ct = parseContentType(getHeader(headers, "content-type"));
  var disp = parseDisposition(getHeader(headers, "content-disposition"));
  var node = {
    headers: headers, contentType: ct, disposition: disp,
    encoding: trim(getHeader(headers, "content-transfer-encoding")).toLowerCase(),
    bodyText: hb.bodyText, parts: [],
    filename: "", text: "", bytes: null, isAttachment: false
  };
  var fn = disp.params["filename"] || ct.name || "";
  node.filename = fn ? decodeEncodedWords(fn) : "";
  if (ct.type === "multipart" && ct.boundary) {
    var raws = splitMultipart(hb.bodyText, ct.boundary);
    node.parts = raws.map(function (r) { return parseMime(r); });
  } else if (node.encoding === "base64" || node.encoding === "quoted-printable" ||
             node.encoding === "quotedprintable") {
    var bytes = decodeBodyBytes(hb.bodyText, node.encoding);
    node.bytes = bytes;
    if (ct.type === "text") node.text = decodeBytes(bytes, ct.charset);
  } else {
    /* 7bit / 8bit / binary / 未声明：字符串已是解码后文本，直接使用；
     * 非文本类型尽力按 latin1 保留字节（FileReader 文本读取的固有限制，
     * Thunderbird/Gmail 导出的附件实务上均为 base64/quoted-printable）。 */
    if (ct.type === "text") node.text = hb.bodyText;
    else node.bytes = strToBytesLatin1(hb.bodyText);
  }
  node.isAttachment = !!node.filename || disp.type === "attachment";
  return node;
}

/* ================= 9. 整封邮件解析 ================= */
function addAttachment(part, msg) {
  var ct = part.contentType.full;
  msg.attachments.push({
    filename: part.filename || "未命名附件",
    mimeType: (ct === "text" || !ct) ? "text/plain" : ct,
    size: part.bytes ? part.bytes.length : 0,
    data: part.bytes
  });
}
function collectBody(node, msg) {
  if (node.parts && node.parts.length) {
    if (node.contentType.full === "multipart/alternative") {
      var plain = null, html = null, i, p;
      for (i = 0; i < node.parts.length; i++) {
        p = node.parts[i];
        if (!p.isAttachment && p.contentType.full === "text/plain" && plain === null) plain = p;
        if (!p.isAttachment && p.contentType.full === "text/html" && html === null) html = p;
      }
      var chosen = plain || html;
      if (chosen) {
        if (chosen.contentType.full === "text/plain") msg.textBody = chosen.text;
        else msg.htmlBody = chosen.text;
      }
      for (i = 0; i < node.parts.length; i++) {
        if (node.parts[i].isAttachment) addAttachment(node.parts[i], msg);
      }
      return;
    }
    for (var j = 0; j < node.parts.length; j++) collectBody(node.parts[j], msg);
    return;
  }
  if (node.isAttachment) { addAttachment(node, msg); return; }
  if (node.contentType.full === "text/plain" && !msg.textBody) msg.textBody = node.text;
  else if (node.contentType.full === "text/html" && !msg.htmlBody) msg.htmlBody = node.text;
}
function parseMessage(raw, index) {
  var msg = {
    index: (index == null ? 0 : index), skipped: false, skipReason: "",
    from: "", to: "", subject: "", date: "", dateMs: 0,
    textBody: "", htmlBody: "", attachments: []
  };
  var text = trim(String(raw == null ? "" : raw));
  if (!text) { msg.skipped = true; msg.skipReason = "空邮件块"; return msg; }
  var hb = splitHeaderBody(text);
  var headers = parseHeaders(hb.headerText);
  if (headers.order.length === 0) { msg.skipped = true; msg.skipReason = "缺失邮件头"; return msg; }
  var root = parseMime(text);
  msg.from = decodeEncodedWords(getHeader(headers, "from"));
  msg.to = decodeEncodedWords(getHeader(headers, "to"));
  msg.subject = decodeEncodedWords(getHeader(headers, "subject")) || "(无主题)";
  msg.date = getHeader(headers, "date");
  var dm = Date.parse(msg.date);
  msg.dateMs = isNaN(dm) ? 0 : dm;
  try { collectBody(root, msg); }
  catch (e) { msg.skipReason = "正文解析异常（已尽力提取头部）"; }
  return msg;
}
function parseMbox(text) {
  var raws = splitMbox(text);
  var messages = [], skipped = 0, reasons = {};
  for (var i = 0; i < raws.length; i++) {
    var m = parseMessage(raws[i], messages.length);
    if (m.skipped) {
      skipped++;
      reasons[m.skipReason] = (reasons[m.skipReason] || 0) + 1;
    } else {
      m.index = messages.length;
      messages.push(m);
    }
  }
  return { messages: messages, skipped: skipped, skipReasons: reasons, total: raws.length };
}

/* ================= 10. 全文搜索 =================
 * 范围：主题 / 发件人 / 收件人 / 正文 / 附件文件名；不区分大小写。
 */
function searchMessages(messages, query) {
  var q = trim(String(query == null ? "" : query)).toLowerCase();
  if (!q) return messages.slice();
  return messages.filter(function (m) {
    var names = m.attachments.map(function (a) { return a.filename; }).join("\n");
    var hay = (m.subject + "\n" + m.from + "\n" + m.to + "\n" + m.textBody + "\n" + names).toLowerCase();
    return hay.indexOf(q) !== -1;
  });
}

/* ================= 11. HTML 安全渲染辅助 ================= */
function stripHtml(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&amp;/gi, "&")
    .replace(/[ \t\xa0]+/g, " ")
    .replace(/\n[ \t]*\n[ \t]*\n+/g, "\n\n")
    .replace(/^\s+|\s+$/g, "");
}
function shortAddr(from) { /* 列表显示用：优先名字，否则邮箱地址 */
  var s = trim(String(from || ""));
  if (!s) return "(未知发件人)";
  var m = s.match(/<([^<>]+)>/);
  var name = trim(s.replace(/<[^<>]*>/, "")).replace(/^"|"$/g, "");
  if (name) return name;
  return m ? m[1] : s;
}

/* ================= 12. 内置 3 封测试邮件（供一键体验与自测） ================= */
var SAMPLE_MBOX = [
"From alice@example.com Mon Oct 20 09:00:00 2026",
"From: Alice <alice@example.com>",
"To: Bob <bob@example.com>",
"Subject: =?UTF-8?B?56ys5LiA5bCB57qv5paH5pys6YKu5Lu2?=",
"Date: Mon, 20 Oct 2026 09:00:00 +0800",
"Content-Type: text/plain; charset=UTF-8",
"Content-Transfer-Encoding: 8bit",
"",
"Hi Bob,",
"",
"这是第一封测试邮件：纯文本正文，直接 UTF-8 编码。",
"第二行正文内容。",
"",
"-- ",
"Alice"
].join("\n");

/* 第二封在 init 之后拼接（multipart/alternative + base64 附件），保持源码可读 */
var SAMPLE_MBOX_PART2 = [
"From bob@example.com Tue Oct 21 14:30:00 2026",
"From: =?UTF-8?B?5byg5LiJ?= <zhangsan@example.com>",
"To: Alice <alice@example.com>",
"Subject: =?UTF-8?B?TUJPWCDlrZjmoaPmtYvor5XkuLvpopg=?=",
"Date: Tue, 21 Oct 2026 14:30:00 +0800",
"MIME-Version: 1.0",
"Content-Type: multipart/mixed; boundary=\"BOUNDARY_MIXED_001\"",
"",
"--BOUNDARY_MIXED_001",
"Content-Type: multipart/alternative; boundary=\"BOUNDARY_ALT_002\"",
"",
"--BOUNDARY_ALT_002",
"Content-Type: text/plain; charset=UTF-8",
"Content-Transfer-Encoding: quoted-printable",
"",
"=E8=BF=99=E6=98=AF=E7=AC=AC=E4=BA=8C=E5=B0=81=E9=82=AE=E4=BB=B6=E7=9A=84=E7=BA=AF=",
"=E6=96=87=E6=9C=AC=E6=AD=A3=E6=96=87=E3=80=82",
"=E7=AC=AC=E4=BA=8C=E8=A1=8C=EF=BC=9A=E4=B8=AD=E6=96=87=20quoted-printable=20=E7=BC=96=",
"=E7=A0=81=E6=B5=8B=E8=AF=95=E3=80=82",
"",
"--BOUNDARY_ALT_002",
"Content-Type: text/html; charset=UTF-8",
"Content-Transfer-Encoding: quoted-printable",
"",
"<html><body><p>=E8=BF=99=E6=98=AFHTML=E7=89=88=E6=9C=AC=E6=AD=A3=E6=96=87=E3=80=82</p></body></html>",
"",
"--BOUNDARY_ALT_002--",
"",
"--BOUNDARY_MIXED_001",
"Content-Type: application/octet-stream; name=\"=?UTF-8?B?5rWL6K+V5oql5ZGKLnR4dA==?=\"",
"Content-Transfer-Encoding: base64",
"Content-Disposition: attachment; filename=\"=?UTF-8?B?5rWL6K+V5oql5ZGKLnR4dA==?=\"",
"",
"SGVsbG8gTUJPWCDpmYTku7blhoXlrrkK56ys5LqM6KGMCg==",
"",
"--BOUNDARY_MIXED_001--",
""
].join("\n");

var SAMPLE_MBOX_PART3 = [
"From broken@example.com Wed Oct 22 10:00:00 2026",
"This is not a valid message block,",
"no headers here at all, just random text lines",
"without any colon header field"
].join("\n");

SAMPLE_MBOX = SAMPLE_MBOX + "\n" + SAMPLE_MBOX_PART2 + "\n" + SAMPLE_MBOX_PART3 + "\n";

/* ================= 13. 浏览器 UI ================= */
function downloadBlob(bytes, filename, mime) {
  var blob = new Blob([bytes], { type: mime || "application/octet-stream" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename || "attachment.bin";
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

function init() {
  function $(id) { return document.getElementById(id); }
  var fileInput = $("mv-file"), drop = $("mv-drop"), statusEl = $("mv-status"),
      listEl = $("mv-list"), viewEl = $("mv-view"), attachEl = $("mv-attach"),
      searchEl = $("mv-search"), sortEl = $("mv-sort"), statEl = $("mv-stat");
  if (!fileInput || !listEl) return;

  var state = { messages: [], skipped: 0, skipReasons: {}, current: -1, query: "", sort: "date_desc" };

  function setStatus(msg, isErr) {
    statusEl.textContent = msg;
    statusEl.style.color = isErr ? "#dc2626" : "#6b7280";
  }

  function sortedMessages() {
    var arr = searchMessages(state.messages, state.query);
    var s = sortEl ? sortEl.value : state.sort;
    arr = arr.slice();
    if (s === "date_asc") arr.sort(function (a, b) { return a.dateMs - b.dateMs; });
    else if (s === "from") arr.sort(function (a, b) { return shortAddr(a.from).localeCompare(shortAddr(b.from), "zh"); });
    else if (s === "subject") arr.sort(function (a, b) { return a.subject.localeCompare(b.subject, "zh"); });
    else arr.sort(function (a, b) { return b.dateMs - a.dateMs; });
    return arr;
  }

  function renderStat() {
    var nAtt = 0, i;
    for (i = 0; i < state.messages.length; i++) nAtt += state.messages[i].attachments.length;
    var parts = ["共 " + state.messages.length + " 封邮件", "附件 " + nAtt + " 个"];
    if (state.skipped > 0) {
      var rs = [];
      for (var k in state.skipReasons) rs.push(k + "×" + state.skipReasons[k]);
      parts.push("跳过损坏块 " + state.skipped + " 个（" + rs.join("、") + "）");
    }
    statEl.textContent = parts.join(" · ");
  }

  function renderList() {
    var arr = sortedMessages();
    listEl.innerHTML = "";
    if (!arr.length) {
      listEl.innerHTML = "<div class=\"mv-empty\">" +
        (state.messages.length ? "没有匹配「" + esc(state.query) + "」的邮件" : "尚未载入邮件：选择 .mbox 文件或点击「载入内置测试邮件」") + "</div>";
      return;
    }
    arr.forEach(function (m) {
      var div = document.createElement("div");
      div.className = "mv-item" + (m.index === state.current ? " mv-active" : "");
      div.setAttribute("data-idx", String(m.index));
      var attBadge = m.attachments.length ? "<span class=\"mv-badge\">📎" + m.attachments.length + "</span>" : "";
      div.innerHTML = "<div class=\"mv-subj\">" + esc(m.subject) + attBadge + "</div>" +
        "<div class=\"mv-meta\"><span>" + esc(shortAddr(m.from)) + "</span><span>" + esc(fmtDate(m.dateMs, m.date)) + "</span></div>";
      div.addEventListener("click", function () { showMail(m.index); });
      listEl.appendChild(div);
    });
  }

  function renderBodyHtml(m) {
    var body = m.textBody;
    var note = "";
    if (!body && m.htmlBody) {
      body = stripHtml(m.htmlBody);
      note = "<div class=\"mv-note\">（该邮件仅有 HTML 版本，已转为纯文本安全显示）</div>";
    }
    if (!body) body = "(无正文内容)";
    return note + "<pre class=\"mv-body\">" + esc(body) + "</pre>";
  }

  function showMail(idx) {
    state.current = idx;
    var m = state.messages[idx];
    if (!m) return;
    renderList();
    var atts = m.attachments.map(function (a, k) {
      return "<div class=\"mv-attrow\"><span class=\"mv-attname\">📎 " + esc(a.filename) + "</span>" +
        "<span class=\"mv-attsize\">" + esc(fmtSize(a.size)) + " · " + esc(a.mimeType) + "</span>" +
        "<button class=\"mv-btn mv-btn-sm\" data-att=\"" + k + "\">下载</button></div>";
    }).join("");
    viewEl.innerHTML =
      "<h3 class=\"mv-viewsubj\">" + esc(m.subject) + "</h3>" +
      "<div class=\"mv-viewhead\">" +
      "<div><b>发件人：</b>" + esc(m.from || "(未知)") + "</div>" +
      "<div><b>收件人：</b>" + esc(m.to || "(未知)") + "</div>" +
      "<div><b>日期：</b>" + esc(m.date || "(未知)") + "</div></div>" +
      (atts ? "<div class=\"mv-viewatts\"><b>附件（" + m.attachments.length + "）：</b>" + atts + "</div>" : "") +
      renderBodyHtml(m);
    var btns = viewEl.querySelectorAll("[data-att]");
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener("click", function () {
          var a = m.attachments[parseInt(b.getAttribute("data-att"), 10)];
          if (a) downloadBlob(a.data, a.filename, a.mimeType);
        });
      })(btns[i]);
    }
    if (window.innerWidth < 860) viewEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderAttachPanel() {
    var rows = [], total = 0, i, j;
    for (i = 0; i < state.messages.length; i++) {
      (function (m) {
        for (j = 0; j < m.attachments.length; j++) {
          (function (a) {
            total++;
            rows.push("<div class=\"mv-attrow\"><span class=\"mv-attname\">📎 " + esc(a.filename) + "</span>" +
              "<span class=\"mv-attsize\">" + esc(fmtSize(a.size)) + "</span>" +
              "<span class=\"mv-attsrc\" title=\"" + esc(m.subject) + "\">← " + esc(m.subject.slice(0, 18)) + "</span>" +
              "<button class=\"mv-btn mv-btn-sm\" data-m=\"" + m.index + "\" data-a=\"" + j + "\">下载</button></div>");
          })(m.attachments[j]);
        }
      })(state.messages[i]);
    }
    attachEl.innerHTML = total
      ? "<div class=\"mv-atttotal\">共 " + total + " 个附件 " +
        "<button class=\"mv-btn mv-btn-sm\" id=\"mv-dlall\">全部下载</button></div>" + rows.join("")
      : "<div class=\"mv-empty\">暂无附件</div>";
    var btns = attachEl.querySelectorAll("[data-m]");
    for (i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener("click", function () {
          var m = state.messages[parseInt(b.getAttribute("data-m"), 10)];
          var a = m && m.attachments[parseInt(b.getAttribute("data-a"), 10)];
          if (a) downloadBlob(a.data, a.filename, a.mimeType);
        });
      })(btns[i]);
    }
    var dlAll = $("mv-dlall");
    if (dlAll) dlAll.addEventListener("click", function () {
      var queue = [];
      state.messages.forEach(function (m) { m.attachments.forEach(function (a) { queue.push(a); }); });
      queue.forEach(function (a, k) {
        setTimeout(function () { downloadBlob(a.data, a.filename, a.mimeType); }, k * 600);
      });
      setStatus("已开始逐个下载 " + queue.length + " 个附件（浏览器可能逐个确认）", false);
    });
  }

  function renderAll() {
    renderStat(); renderList(); renderAttachPanel();
    if (state.current >= 0 && state.messages[state.current]) showMail(state.current);
    else viewEl.innerHTML = "<div class=\"mv-empty\">点击左侧邮件查看正文</div>";
  }

  function loadText(text, fileName) {
    setStatus("正在解析" + (fileName ? "「" + fileName + "」" : "") + "…", false);
    setTimeout(function () { /* 让提示先渲染 */
      var t0 = Date.now();
      var r = parseMbox(text);
      state.messages = r.messages;
      state.skipped = r.skipped;
      state.skipReasons = r.skipReasons;
      state.current = -1;
      state.query = searchEl ? searchEl.value : "";
      renderAll();
      var msg = "解析完成： " + r.messages.length + " 封邮件（" + ((Date.now() - t0) / 1000).toFixed(1) + "s）";
      if (r.skipped > 0) msg += "，跳过损坏块 " + r.skipped + " 个";
      setStatus(msg, false);
      if (r.messages.length) showMail(sortedMessages()[0].index);
    }, 30);
  }

  function handleFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      if (!confirm("文件 " + fmtSize(file.size) + " 超过 200MB，浏览器解析可能占用大量内存甚至卡死。\n仍要继续吗？（文件只在本地解析，不上传）")) return;
    }
    var reader = new FileReader();
    reader.onload = function () { loadText(String(reader.result || ""), file.name); };
    reader.onerror = function () { setStatus("文件读取失败", true); };
    reader.readAsText(file, "UTF-8");
  }

  fileInput.addEventListener("change", function () {
    if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
    fileInput.value = "";
  });
  ["dragover", "dragenter"].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("mv-dragover"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("mv-dragover"); });
  });
  drop.addEventListener("drop", function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  drop.addEventListener("click", function () { fileInput.click(); });
  var sampleBtn = $("mv-sample");
  if (sampleBtn) sampleBtn.addEventListener("click", function () { loadText(SAMPLE_MBOX, "内置测试邮件.mbox"); });
  if (searchEl) {
    var timer = null;
    searchEl.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () { state.query = searchEl.value; renderList(); }, 180);
    });
  }
  if (sortEl) sortEl.addEventListener("change", function () { renderList(); });

  viewEl.innerHTML = "<div class=\"mv-empty\">点击左侧邮件查看正文</div>";
  renderStat();
}

/* ================= 14. 启动与导出 ================= */
if (hasDOM()) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    MAX_FILE_SIZE: MAX_FILE_SIZE,
    splitMbox: splitMbox,
    parseHeaders: parseHeaders, getHeader: getHeader, getHeaderFirst: getHeaderFirst,
    decodeEncodedWords: decodeEncodedWords,
    decodeQuotedPrintable: decodeQuotedPrintable, b64ToBytes: b64ToBytes,
    decodeBytes: decodeBytes, normCharset: normCharset,
    parseContentType: parseContentType, parseDisposition: parseDisposition,
    splitMultipart: splitMultipart, parseMime: parseMime,
    parseMessage: parseMessage, parseMbox: parseMbox,
    searchMessages: searchMessages,
    stripHtml: stripHtml, esc: esc, fmtSize: fmtSize, fmtDate: fmtDate, shortAddr: shortAddr,
    SAMPLE_MBOX: SAMPLE_MBOX
  };
}
})();
