/* NAT 类型检测器纯逻辑单元测试（零依赖）：node tests/nat_type_detector.test.js
 * 覆盖：srflx 候选解析（srflx/host/relay/IPv6/a= 前缀/非法行）、映射行为判定、
 * 端口保留推断、类型映射表、建议文案分支、失败原因文案、STUN URL 校验、
 * 耗时/星级格式化、源码零 fetch/XHR。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var nt = require("../static/js/nat_type_detector.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "nat_type_detector.js"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function contains(hay, needle, name) { ok(hay.indexOf(needle) !== -1, name + "（期望包含 " + JSON.stringify(needle) + "）"); }

/* ---------- 1. parseSrflxCandidate ---------- */
(function () {
    var srflx = "candidate:842163049 1 udp 1685987071 203.0.113.7 52112 typ srflx raddr 192.168.1.2 rport 52112 generation 0";
    var c = nt.parseSrflxCandidate(srflx);
    ok(!!c, "srflx 候选行解析成功");
    eq(c.ip, "203.0.113.7", "srflx 解析出映射 IP");
    eq(c.port, 52112, "srflx 解析出映射端口");
    eq(c.type, "srflx", "类型 srflx");
    eq(c.protocol, "udp", "协议小写 udp");
    eq(nt.parseSrflxCandidate("a=" + srflx).ip, "203.0.113.7", "带 a= 前缀也能解析");
    var host = "candidate:4 1 udp 2113937151 192.168.1.2 52234 typ host generation 0";
    var h = nt.parseSrflxCandidate(host);
    eq(h.type, "host", "host 候选类型");
    eq(h.ip, "192.168.1.2", "host 内网 IP");
    var relay = "candidate:6 1 udp 41819903 198.51.100.9 3479 typ relay raddr 203.0.113.7 rport 52112 generation 0";
    eq(nt.parseSrflxCandidate(relay).type, "relay", "relay 候选类型");
    var tcp = "candidate:2 1 TCP 2105458943 192.168.1.2 9 typ host tcptype active generation 0";
    eq(nt.parseSrflxCandidate(tcp).protocol, "tcp", "TCP 大写转小写");
    var v6 = "candidate:1 1 udp 2113937151 2001:db8::1 53211 typ srflx raddr ::1 rport 53211 generation 0";
    eq(nt.parseSrflxCandidate(v6).ip, "2001:db8::1", "IPv6 候选 IP 解析");
    ok(nt.parseSrflxCandidate("") === null, "空串 → null");
    ok(nt.parseSrflxCandidate("garbage line") === null, "非候选行 → null");
    ok(nt.parseSrflxCandidate("candidate:1 1 udp") === null, "字段不足 → null");
    ok(nt.parseSrflxCandidate("candidate:1 1 udp 123 1.2.3.4 0 typ srflx") === null, "非法端口 0 → null");
    ok(nt.parseSrflxCandidate("candidate:1 1 udp 123 1.2.3.4 99999 typ srflx") === null, "端口 >65535 → null");
})();

/* ---------- 2. normalizeStunUrl ---------- */
(function () {
    eq(nt.normalizeStunUrl("stun:stun.l.google.com:19302"), "stun:stun.l.google.com:19302", "标准 stun URL 通过");
    eq(nt.normalizeStunUrl("stun:stun.cloudflare.com:3478"), "stun:stun.cloudflare.com:3478", "cloudflare 自定义 STUN 通过");
    eq(nt.normalizeStunUrl("stun:example.com"), "stun:example.com:3478", "缺端口补默认 3478");
    eq(nt.normalizeStunUrl("STUN:Example.COM:3478"), "stun:Example.COM:3478", "scheme 大小写兼容");
    ok(nt.normalizeStunUrl("http://example.com") === null, "http scheme 拒绝");
    ok(nt.normalizeStunUrl("turn:example.com:3478") === null, "turn scheme 拒绝（STUN 检测器不用 TURN）");
    ok(nt.normalizeStunUrl("") === null, "空串拒绝");
    ok(nt.normalizeStunUrl("stun:") === null, "无 host 拒绝");
    ok(nt.normalizeStunUrl("stun:host:99999") === null, "非法端口拒绝");
})();

/* ---------- 3. parseStunServers ---------- */
(function () {
    var d = nt.parseStunServers("");
    eq(d.valid.length, 2, "空输入回退 2 台默认 STUN");
    contains(d.valid.join(" "), "stun.l.google.com", "默认含 google STUN");
    var p = nt.parseStunServers("stun:stun.cloudflare.com:3478");
    eq(p.valid.length, 1, "自定义 cloudflare STUN 单条通过");
    eq(p.valid[0], "stun:stun.cloudflare.com:3478", "自定义 STUN 原样保留");
    var m = nt.parseStunServers("stun:a.com:3478\nstun:b.com:3478, stun:a.com:3478\nhttp://x.com\n");
    eq(m.valid.length, 2, "多行多分隔符去重后 2 台");
    eq(m.invalid.length, 1, "非法 http 被收入 invalid");
    var fallback = nt.parseStunServers("全部非法输入!!!");
    eq(fallback.valid.length, 2, "全非法回退默认 STUN");
})();

/* ---------- 4. isSameEndpoint / derivePortBehavior ---------- */
(function () {
    ok(nt.isSameEndpoint({ ip: "1.1.1.1", port: 5000 }, { ip: "1.1.1.1", port: 5000 }), "同 IP 同端口 → 一致");
    ok(!nt.isSameEndpoint({ ip: "1.1.1.1", port: 5000 }, { ip: "1.1.1.1", port: 5001 }), "端口不同 → 不一致");
    ok(!nt.isSameEndpoint({ ip: "1.1.1.1", port: 5000 }, { ip: "2.2.2.2", port: 5000 }), "IP 不同 → 不一致");
    ok(!nt.isSameEndpoint(null, { ip: "1.1.1.1", port: 1 }), "null 输入 → false");
    var hosts = [nt.parseSrflxCandidate("candidate:4 1 udp 2113937151 192.168.1.2 52234 typ host generation 0")];
    eq(nt.derivePortBehavior(hosts, { ip: "203.0.113.7", port: 52234, protocol: "udp" }), "preserved", "本地端口＝映射端口 → 端口保留");
    eq(nt.derivePortBehavior(hosts, { ip: "203.0.113.7", port: 60000, protocol: "udp" }), "rewritten", "端口被改写");
    eq(nt.derivePortBehavior([], { ip: "203.0.113.7", port: 5000, protocol: "udp" }), "unknown", "无 host 候选 → 未知");
    eq(nt.derivePortBehavior(hosts, null), "unknown", "无 srflx → 未知");
})();

/* ---------- 5. classifyNat ---------- */
(function () {
    eq(nt.classifyNat([]).nat, nt.NAT_NONE, "无结果 → NAT_NONE");
    eq(nt.classifyNat([null, null]).nat, nt.NAT_NONE, "全 null → NAT_NONE");
    var one = [{ server: "s1", ip: "203.0.113.7", port: 52112, protocol: "udp" }];
    eq(nt.classifyNat([one[0], null]).nat, nt.NAT_UNDETERMINED, "仅一台响应 → 未确定");
    var cone = [{ server: "s1", ip: "203.0.113.7", port: 52112, protocol: "udp" },
                { server: "s2", ip: "203.0.113.7", port: 52112, protocol: "udp" }];
    var cc = nt.classifyNat(cone);
    eq(cc.nat, nt.NAT_CONE, "两台映射一致 → 锥形 NAT");
    eq(cc.mapping, "endpoint_independent", "映射行为 endpoint_independent");
    var sym = [{ server: "s1", ip: "203.0.113.7", port: 52112, protocol: "udp" },
               { server: "s2", ip: "203.0.113.7", port: 60000, protocol: "udp" }];
    var sc = nt.classifyNat(sym);
    eq(sc.nat, nt.NAT_SYMMETRIC, "端口不一致 → 对称 NAT");
    eq(sc.mapping, "dependent", "映射行为 dependent");
    var sym2 = [{ server: "s1", ip: "203.0.113.7", port: 52112, protocol: "udp" },
                { server: "s2", ip: "198.51.100.9", port: 52112, protocol: "udp" }];
    eq(nt.classifyNat(sym2).nat, nt.NAT_SYMMETRIC, "地址不一致 → 对称 NAT");
})();

/* ---------- 6. 类型映射 / 建议文案 ---------- */
(function () {
    eq(nt.natTypeCn(nt.NAT_CONE), "锥形 NAT（Cone NAT）", "锥形 NAT 中文名");
    eq(nt.natTypeCn(nt.NAT_SYMMETRIC), "对称型 NAT（Symmetric NAT）", "对称 NAT 中文名");
    var aCone = nt.natAdvice(nt.NAT_CONE);
    eq(aCone.stars, 5, "锥形 NAT 5 星");
    contains(aCone.advice, "UDP 打洞", "锥形 NAT 建议含打洞");
    contains(aCone.limitation, "Full Cone", "锥形 NAT 含过滤行为不可区分说明");
    contains(aCone.limitation, "Port Restricted", "锥形 NAT 含 Port Restricted 不可区分说明");
    var aSym = nt.natAdvice(nt.NAT_SYMMETRIC);
    eq(aSym.stars, 2, "对称 NAT 2 星");
    contains(aSym.advice, "TURN", "对称 NAT 建议含 TURN 中继");
    var aUnd = nt.natAdvice(nt.NAT_UNDETERMINED);
    eq(aUnd.stars, 3, "未确定 3 星");
    eq(nt.natAdvice(nt.NAT_NONE).stars, 0, "失败态 0 星");
})();

/* ---------- 7. buildResult / failureInfo ---------- */
(function () {
    var cone = [{ server: "s1", ip: "203.0.113.7", port: 52112, protocol: "udp" },
                { server: "s2", ip: "203.0.113.7", port: 52112, protocol: "udp" }];
    var cls = nt.classifyNat(cone);
    var r = nt.buildResult(cls, cone, ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"], 2300);
    eq(r.publicIp, "203.0.113.7", "结果含公网 IP");
    eq(r.mappedPort, 52112, "结果含映射端口");
    eq(r.nat, nt.NAT_CONE, "结果 NAT 类型");
    eq(r.natCn, "锥形 NAT（Cone NAT）", "结果 NAT 中文名");
    eq(r.starsText, "★★★★★", "5 星渲染");
    eq(r.elapsed, "2.3 秒", "检测耗时格式化");
    eq(r.responded, 2, "响应台数 2");
    var f = nt.failureInfo("no_srflx");
    contains(f.title, "srflx", "超时失败标题含 srflx");
    contains(f.guide, "UDP", "超时失败指引含 UDP 排查");
    contains(nt.failureInfo("webrtc_unsupported").guide, "Chrome", "WebRTC 不支持指引含换浏览器");
    contains(nt.failureInfo("host_only").reason, "host", "host_only 原因说明");
    contains(nt.failureInfo("single_stun").guide, "STUN", "single_stun 指引");
    ok(!!nt.failureInfo("未知代码").title, "未知失败码回退默认文案");
})();

/* ---------- 8. 格式化 ---------- */
(function () {
    eq(nt.fmtDuration(1500), "1.5 秒", "1.5 秒");
    eq(nt.fmtDuration(12345), "12 秒", "12 秒取整");
    eq(nt.starsText(2), "★★☆☆☆", "2 星渲染");
    eq(nt.starsText(0), "☆☆☆☆☆", "0 星渲染");
    eq(nt.starsText(5).length, 5, "星级总长 5");
})();

/* ---------- 9. 源码零 fetch/XHR ---------- */
(function () {
    ok(SRC.indexOf("fetch(") === -1, "源码零 fetch(");
    ok(SRC.indexOf("XMLHttpRequest") === -1, "源码零 XMLHttpRequest");
    ok(SRC.indexOf("WebSocket") === -1, "源码零 WebSocket");
    ok(SRC.indexOf("sendBeacon") === -1, "源码零 sendBeacon");
    ok(SRC.indexOf("EventSource") === -1, "源码零 EventSource");
    ok(SRC.indexOf("jQuery") === -1 && SRC.indexOf("$.ajax") === -1, "源码零 jQuery ajax");
    eq(nt.TIMEOUT_MS, 12000, "超时常量 12 秒");
    eq(nt.DEFAULT_STUN.length, 2, "默认 2 台公共 STUN");
})();

console.log("\n断言：通过 " + pass + " / 失败 " + fail + "（共 " + (pass + fail) + "）");
process.exit(fail ? 1 : 0);
