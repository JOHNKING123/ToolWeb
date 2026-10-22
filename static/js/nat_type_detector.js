/* NAT 类型检测器（nat_type_detector）：纯前端 WebRTC ICE 候选收集＋双公共 STUN 映射行为推断
 *
 * 功能：
 *  1) 一键「开始检测」：为每台 STUN 服务器建一条 RTCPeerConnection（iceServers 逐台
 *     拆开，这样 srflx 候选能归属到具体服务器），收集 server reflexive 候选。
 *  2) 按映射行为推断：两台 STUN 返回的映射地址/端口一致 → Endpoint-Independent
 *     Mapping（锥形 NAT）；不一致 → Address/Port-Dependent Mapping（对称 NAT 特征）。
 *  3) 输出：公网 IP、映射端口、映射行为、NAT 类型、打洞友好度星级＋联机建议、
 *     检测耗时、所用 STUN 服务器列表；12 秒无 srflx 兜底失败态＋排查指引。
 *  4) 硬限制如实交代：浏览器无法区分 Full Cone / Restricted / Port Restricted 的
 *     过滤行为；检测为启发式近似，非 RFC 5780 完整行为测试；公网 IP 会暴露给所选
 *     STUN 服务器（隐私提示）。
 * 纯函数全部经 module.exports 暴露，node tests/nat_type_detector.test.js 自测；
 * 浏览器内 init 挂 DOMContentLoaded；脚本内零 fetch/XHR（STUN 走 UDP 不走 XHR）。
 */
(function () {
"use strict";

/* ---------- 1. 常量 ---------- */
var LS_STUN = "tw_nat_type_detector_stun_v1";
var TIMEOUT_MS = 12000;             /* 12 秒无 srflx 兜底失败 */
var DEFAULT_STUN = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302"
];
var NAT_CONE = "cone";              /* 锥形 NAT（Cone NAT） */
var NAT_SYMMETRIC = "symmetric";    /* 对称型 NAT（Symmetric NAT） */
var NAT_UNDETERMINED = "undetermined";
var NAT_NONE = "none";              /* 无 srflx：UDP 被拦截 / WebRTC 被禁用 */

/* ---------- 2. 基础工具 ---------- */
function hasDOM() {
  return typeof document !== "undefined" && typeof window !== "undefined";
}
function trimStr(s) {
  return String(s == null ? "" : s).replace(/^\s+|\s+$/g, "");
}
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function fmtDuration(ms) {
  var s = ms / 1000;
  if (s < 10) return s.toFixed(1) + " 秒";
  return Math.round(s) + " 秒";
}
function starsText(n) {
  var out = "";
  for (var i = 1; i <= 5; i++) out += (i <= n ? "★" : "☆");
  return out;
}

/* ---------- 3. 候选解析 ----------
 * parseSrflxCandidate：解析一条 ICE 候选 SDP 行（可带/不带 "a=" 前缀）。
 * 返回 {foundation, component, protocol, ip, port, type}；非法行返回 null。
 * 典型行：candidate:842163049 1 udp 1685987071 203.0.113.7 52112 typ srflx raddr 192.168.1.2 rport 52112
 */
function parseSrflxCandidate(line) {
  if (!line) return null;
  var s = trimStr(line);
  if (s.slice(0, 2) === "a=") s = s.slice(2);
  if (s.slice(0, 10) !== "candidate:") return null;
  var parts = s.split(/\s+/);
  if (parts.length < 8) return null;
  var typIdx = parts.indexOf("typ");
  if (typIdx < 0 || typIdx + 1 >= parts.length) return null;
  var port = parseInt(parts[5], 10);
  if (!isFinite(port) || port <= 0 || port > 65535) return null;
  return {
    foundation: parts[0].slice(10),
    component: parts[1],
    protocol: String(parts[2]).toLowerCase(),
    ip: parts[4],
    port: port,
    type: String(parts[typIdx + 1]).toLowerCase()
  };
}

/* ---------- 4. STUN 服务器配置 ---------- */
/* normalizeStunUrl：校验并规范化单条 STUN URL。
 * 接受 "stun:host:port" / "stun:host"（缺端口补默认 3478）/ "stuns:..."；
 * 其余返回 null。*/
function normalizeStunUrl(s) {
  s = trimStr(s);
  if (!s) return null;
  var m = /^(stuns?):([^\/:@\s]+)(?::(\d{1,5}))?$/i.exec(s);
  if (!m) return null;
  var scheme = m[1].toLowerCase(), host = m[2], port = m[3];
  if (!/^[A-Za-z0-9.\-]+$/.test(host)) return null;
  var p = port ? parseInt(port, 10) : 3478;
  if (!isFinite(p) || p <= 0 || p > 65535) return null;
  return scheme + ":" + host + ":" + p;
}
/* parseStunServers：从用户多行/逗号/空格分隔输入里解析 STUN URL 列表，
 * 返回 {valid: [...], invalid: [...]}；空输入回退默认。*/
function parseStunServers(input) {
  var raw = trimStr(input);
  if (!raw) return { valid: DEFAULT_STUN.slice(), invalid: [] };
  var tokens = raw.split(/[\s,;，；]+/);
  var valid = [], invalid = [], seen = {};
  for (var i = 0; i < tokens.length; i++) {
    var t = trimStr(tokens[i]);
    if (!t) continue;
    var n = normalizeStunUrl(t);
    if (n && !seen[n]) { valid.push(n); seen[n] = true; }
    else if (!n) { invalid.push(t); }
  }
  if (!valid.length) return { valid: DEFAULT_STUN.slice(), invalid: invalid };
  return { valid: valid, invalid: invalid };
}

/* ---------- 5. 判定逻辑（纯函数） ---------- */
/* isSameEndpoint：两个映射端点是否完全一致（地址＋端口）。 */
function isSameEndpoint(a, b) {
  if (!a || !b) return false;
  return String(a.ip) === String(b.ip) && Number(a.port) === Number(b.port);
}
/* derivePortBehavior：对比 host 候选（本地端口）与 srflx 映射端口，
 * 推断是否端口保留。hostCandidates 为 parseSrflxCandidate 产出的数组。 */
function derivePortBehavior(hostCandidates, srflx) {
  if (!srflx || !srflx.port) return "unknown";
  for (var i = 0; i < (hostCandidates || []).length; i++) {
    var h = hostCandidates[i];
    if (!h || h.type !== "host") continue;
    if (String(h.protocol).toLowerCase() !== String(srflx.protocol).toLowerCase()) continue;
    if (Number(h.port) === Number(srflx.port)) return "preserved";  /* 本地端口＝映射端口 */
    return "rewritten";                                            /* 端口被改写 */
  }
  return "unknown";
}
/* classifyNat：按双 STUN 映射行为推断 NAT 类型。
 * serverSrflx：每台 STUN 的采集结果 [{server, ip, port, protocol} | null]。
 * 返回 {nat, mapping, mappingCn, note}。 */
function classifyNat(serverSrflx) {
  var ok = [];
  for (var i = 0; i < (serverSrflx || []).length; i++) {
    if (serverSrflx[i] && serverSrflx[i].ip && serverSrflx[i].port) ok.push(serverSrflx[i]);
  }
  if (ok.length === 0) {
    return { nat: NAT_NONE, mapping: "none", mappingCn: "未获得映射地址", note: "no_srflx" };
  }
  if (ok.length === 1) {
    return {
      nat: NAT_UNDETERMINED, mapping: "single", mappingCn: "仅一台 STUN 响应，无法对比映射行为",
      note: "single_stun", first: ok[0]
    };
  }
  var a = ok[0], b = ok[1];
  if (isSameEndpoint(a, b)) {
    return {
      nat: NAT_CONE, mapping: "endpoint_independent", mappingCn: "Endpoint-Independent（端点无关映射）",
      note: "mapping_match", first: a
    };
  }
  return {
    nat: NAT_SYMMETRIC, mapping: "dependent", mappingCn: "Address/Port-Dependent（地址或端口相关映射）",
    note: "mapping_mismatch", first: a, second: b
  };
}
/* natAdvice：类型 → 打洞友好度星级＋联机建议。 */
function natAdvice(nat) {
  switch (nat) {
    case NAT_CONE:
      return {
        stars: 5,
        advice: "P2P 直连通常可行，建议优先尝试 UDP 打洞。",
        limitation: "注意：浏览器只能看到映射行为，无法区分 Full Cone / Restricted / Port Restricted 三种过滤行为——远端被动接收时的可达性可能不同，实际联机以实测为准。"
      };
    case NAT_SYMMETRIC:
      return {
        stars: 2,
        advice: "对称型 NAT：P2P 打洞成功率低，建议使用 TURN 中继服务器转发，或换到锥形 NAT 网络再试。",
        limitation: ""
      };
    case NAT_UNDETERMINED:
      return {
        stars: 3,
        advice: "检测结果不完整：建议换用两台以上 STUN 服务器重试，或换网络再测。",
        limitation: ""
      };
    default: /* NAT_NONE */
      return {
        stars: 0,
        advice: "未能完成检测：先排查下方失败原因，再换网络重试。",
        limitation: ""
      };
  }
}
/* NAT 类型中文名（用于结果渲染与测试）。 */
function natTypeCn(nat) {
  if (nat === NAT_CONE) return "锥形 NAT（Cone NAT）";
  if (nat === NAT_SYMMETRIC) return "对称型 NAT（Symmetric NAT）";
  if (nat === NAT_UNDETERMINED) return "类型未确定";
  return "检测失败";
}
/* buildResult：把分类结果组装成完整结果对象。 */
function buildResult(classify, serverSrflx, servers, elapsedMs) {
  var ad = natAdvice(classify.nat);
  return {
    nat: classify.nat,
    natCn: natTypeCn(classify.nat),
    mapping: classify.mapping,
    mappingCn: classify.mappingCn,
    publicIp: classify.first ? classify.first.ip : "",
    mappedPort: classify.first ? classify.first.port : 0,
    stars: ad.stars,
    starsText: starsText(ad.stars),
    advice: ad.advice,
    limitation: ad.limitation,
    elapsed: fmtDuration(elapsedMs),
    servers: servers,
    responded: (serverSrflx || []).filter(function (r) { return r && r.ip; }).length
  };
}

/* ---------- 6. 失败原因文案 ---------- */
var FAILURE_GUIDE = {
  no_srflx: {
    title: "12 秒内未收到服务器反射候选（srflx）",
    reason: "两台 STUN 服务器均未返回映射地址，可能原因：① UDP 出向被拦截（公司/校园网防火墙常见）；② 浏览器禁用了 WebRTC；③ STUN 服务器暂时不可达。",
    guide: "① 换手机热点再测一次；② 检查浏览器设置中 WebRTC 未被禁用（如扩展拦截）；③ 公司网络可咨询 IT 是否放行 UDP 3478/19302 端口。"
  },
  webrtc_unsupported: {
    title: "当前浏览器不支持 WebRTC",
    reason: "RTCPeerConnection 接口不可用（过旧浏览器或隐私模式限制）。",
    guide: "换用最新版 Chrome / Edge / Firefox / Safari 后重试。"
  },
  host_only: {
    title: "只收集到本地候选，未获得公网映射",
    reason: "ICE 收集完成了，但所有候选都是 host（内网地址），STUN 服务器没有返回 srflx——典型为 UDP 被拦截。",
    guide: "① 换网络（手机热点）再测；② 公司/校园防火墙可能拦截了 UDP STUN 请求；③ 尝试自定义其他 STUN 服务器（如 stun:stun.cloudflare.com:3478）。"
  },
  single_stun: {
    title: "仅一台 STUN 服务器响应",
    reason: "只有部分 STUN 服务器返回了映射地址，无法完成映射行为对比，判定不可靠。",
    guide: "换网络重试，或在自定义 STUN 里多填一台（如 stun:stun.cloudflare.com:3478）后再测。"
  }
};
function failureInfo(code) {
  return FAILURE_GUIDE[code] || FAILURE_GUIDE.no_srflx;
}

/* ---------- 7. 浏览器端检测（DOM 环境） ---------- */
function setStatus(id, text) {
  if (!hasDOM()) return;
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}
function showProgress(step) {
  /* step: 0 就绪，1 连接中，2 收集候选，3 分析中 */
  if (!hasDOM()) return;
  var labels = ["就绪", "连接中…", "收集候选中…", "分析中…"];
  var dots = document.querySelectorAll("#nt-steps .nt-step");
  for (var i = 0; i < dots.length; i++) {
    dots[i].classList.toggle("active", i <= step);
  }
  setStatus("nt-status", labels[step] || "");
}
/* 单台 STUN 的候选收集：返回 Promise<[{ip,port,protocol} srflx | host[]]>。
 * 为每台 STUN 单独建 RTCPeerConnection，srflx 才能归属到具体服务器。 */
function gatherForServer(stunUrl, deadlineMs) {
  return new Promise(function (resolve) {
    var pc;
    try {
      pc = new RTCPeerConnection({ iceServers: [{ urls: stunUrl }] });
    } catch (e) {
      resolve({ server: stunUrl, srflx: null, hosts: [], error: String(e && e.message || e) });
      return;
    }
    var srflx = null, hosts = [], done = false;
    function finish() {
      if (done) return;
      done = true;
      try { pc.close(); } catch (e) {}
      resolve({ server: stunUrl, srflx: srflx, hosts: hosts, error: null });
    }
    var timer = setTimeout(finish, deadlineMs);
    pc.onicecandidate = function (ev) {
      if (done) return;
      if (!ev || !ev.candidate) { clearTimeout(timer); finish(); return; } /* gathering 完成 */
      var c = parseSrflxCandidate(ev.candidate.candidate);
      if (!c) return;
      if (c.type === "srflx") {
        if (!srflx) srflx = { ip: c.ip, port: c.port, protocol: c.protocol };
        /* 已拿到 srflx：不再等待此 PC 的更多候选，直接结束 */
        clearTimeout(timer); finish();
      } else if (c.type === "host") {
        hosts.push(c);
      }
    };
    pc.onicegatheringstatechange = function () {
      if (!done && pc.iceGatheringState === "complete") { clearTimeout(timer); finish(); }
    };
    try {
      pc.createDataChannel("nt-probe");
      pc.createOffer().then(function (offer) { return pc.setLocalDescription(offer); })
        .catch(function () { clearTimeout(timer); finish(); });
    } catch (e) {
      clearTimeout(timer); finish();
    }
  });
}
function runDetection(stunUrls, onDone) {
  var t0 = Date.now();
  var promises = stunUrls.map(function (u) { return gatherForServer(u, TIMEOUT_MS); });
  showProgress(2);
  Promise.all(promises).then(function (results) {
    showProgress(3);
    var elapsed = Date.now() - t0;
    var serverSrflx = results.map(function (r) {
      return r.srflx ? { server: r.server, ip: r.srflx.ip, port: r.srflx.port, protocol: r.srflx.protocol } : null;
    });
    var cls = classifyNat(serverSrflx);
    var anyHost = results.some(function (r) { return r.hosts && r.hosts.length; });
    var code = null;
    if (cls.nat === NAT_NONE) code = anyHost ? "host_only" : "no_srflx";
    if (cls.nat === NAT_UNDETERMINED) code = "single_stun";
    onDone({ classify: cls, serverSrflx: serverSrflx, results: results, servers: stunUrls, elapsed: elapsed, failCode: code });
  });
}
function renderResult(data) {
  var box = document.getElementById("nt-result");
  if (!box) return;
  if (data.failCode) {
    var f = failureInfo(data.failCode);
    box.innerHTML =
      '<div class="nt-fail"><i class="material-icons">error_outline</i><div>' +
      "<b>" + esc(f.title) + "</b><p>" + esc(f.reason) + "</p>" +
      "<p class=\"nt-guide\"><b>排查指引：</b>" + esc(f.guide) + "</p></div></div>";
    showProgress(0);
    setStatus("nt-status", "检测失败");
    return;
  }
  var r = buildResult(data.classify, data.serverSrflx, data.servers, data.elapsed);
  var pb = derivePortBehavior(concatHosts(data.results), data.classify.first);
  var pbCn = pb === "preserved" ? "端口保留（本地端口＝映射端口）"
    : pb === "rewritten" ? "端口被改写（映射端口≠本地端口）" : "未知";
  var srvList = r.servers.map(function (s) { return "<code>" + esc(s) + "</code>"; }).join("、");
  var html =
    '<div class="nt-cards">' +
    '<div class="nt-card"><span class="nt-label">公网 IP</span><span class="nt-value nt-mono">' + esc(r.publicIp) + "</span></div>" +
    '<div class="nt-card"><span class="nt-label">映射端口</span><span class="nt-value nt-mono">' + esc(String(r.mappedPort)) + "</span></div>" +
    '<div class="nt-card"><span class="nt-label">映射行为</span><span class="nt-value">' + esc(r.mappingCn) + "</span></div>" +
    '<div class="nt-card"><span class="nt-label">端口行为</span><span class="nt-value">' + esc(pbCn) + "</span></div>" +
    "</div>" +
    '<div class="nt-verdict nt-' + esc(r.nat) + '"><i class="material-icons">hub</i><div>' +
    '<div class="nt-verdict-type">' + esc(r.natCn) + '</div>' +
    '<div class="nt-stars" title="打洞友好度">' + esc(r.starsText) + " 打洞友好度</div>" +
    "<p>" + esc(r.advice) + "</p>" +
    (r.limitation ? '<p class="nt-limit">' + esc(r.limitation) + "</p>" : "") +
    "</div></div>" +
    '<div class="nt-meta">检测耗时 ' + esc(r.elapsed) + " · " + esc(String(r.responded)) + "/" + esc(String(r.servers.length)) +
    " 台 STUN 响应 · 所用服务器：" + srvList + "</div>";
  box.innerHTML = html;
  showProgress(0);
  setStatus("nt-status", "检测完成");
}
function concatHosts(results) {
  var out = [];
  (results || []).forEach(function (r) { if (r && r.hosts) out = out.concat(r.hosts); });
  return out;
}
function init() {
  if (!hasDOM()) return;
  var startBtn = document.getElementById("nt-start");
  var stunInput = document.getElementById("nt-stun-input");
  var hint = document.getElementById("nt-stun-hint");
  /* 恢复上次自定义 STUN */
  try {
    var saved = localStorage.getItem(LS_STUN);
    if (saved && stunInput) stunInput.value = saved;
  } catch (e) {}
  if (typeof RTCPeerConnection === "undefined") {
    var f = failureInfo("webrtc_unsupported");
    var box = document.getElementById("nt-result");
    if (startBtn) startBtn.disabled = true;
    if (box) box.innerHTML = '<div class="nt-fail"><i class="material-icons">error_outline</i><div><b>' +
      esc(f.title) + "</b><p>" + esc(f.guide) + "</p></div></div>";
    return;
  }
  if (startBtn) startBtn.addEventListener("click", function () {
    var parsed = parseStunServers(stunInput ? stunInput.value : "");
    if (hint) {
      hint.textContent = parsed.invalid.length
        ? "已忽略 " + parsed.invalid.length + " 条非法输入：" + parsed.invalid.join("、")
        : "将使用 " + parsed.valid.length + " 台 STUN 服务器检测。";
    }
    try { localStorage.setItem(LS_STUN, stunInput ? stunInput.value : ""); } catch (e) {}
    startBtn.disabled = true;
    setStatus("nt-status", "连接中…");
    showProgress(1);
    runDetection(parsed.valid.slice(0, 4), function (data) {
      renderResult(data);
      startBtn.disabled = false;
    });
  });
}
if (hasDOM() && typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
}

/* ---------- 8. 导出（供 node 测试） ---------- */
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULT_STUN: DEFAULT_STUN,
    TIMEOUT_MS: TIMEOUT_MS,
    NAT_CONE: NAT_CONE, NAT_SYMMETRIC: NAT_SYMMETRIC,
    NAT_UNDETERMINED: NAT_UNDETERMINED, NAT_NONE: NAT_NONE,
    fmtDuration: fmtDuration, starsText: starsText, esc: esc,
    parseSrflxCandidate: parseSrflxCandidate,
    normalizeStunUrl: normalizeStunUrl, parseStunServers: parseStunServers,
    isSameEndpoint: isSameEndpoint, derivePortBehavior: derivePortBehavior,
    classifyNat: classifyNat, natAdvice: natAdvice, natTypeCn: natTypeCn,
    buildResult: buildResult, failureInfo: failureInfo
  };
}
})();
