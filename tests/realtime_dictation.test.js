/* 浏览器实时听写（realtime_dictation）纯逻辑单元测试（零依赖）：
 * node tests/realtime_dictation.test.js
 * 覆盖：状态机三态转换、能力探测、错误码中文映射、fatal 判定、
 * 结果拼接、历史增删/序列化/上限、偏好序列化/语言合法性、
 * 时间格式化、Dictation 控制器（mock Recognition）生命周期、
 * 源码零 fetch/XHR、无"零上传"宣称、模板隐私文案。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var rd = require("../static/js/realtime_dictation.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "realtime_dictation.js"), "utf8");
var TPL = fs.readFileSync(path.join(__dirname, "..", "templates", "realtime_dictation.html"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }

/* ---------- 1. 状态机 ---------- */
(function () {
    var ST = rd.ST;
    eq(rd.nextState(ST.IDLE, "START", "hold"), ST.LISTENING, "idle+START→listening");
    eq(rd.nextState(ST.IDLE, "STOP", "hold"), ST.IDLE, "idle+STOP 保持 idle");
    eq(rd.nextState(ST.IDLE, "UNSUPPORTED_DETECTED", "hold"), ST.UNSUPPORTED, "idle+无 API→unsupported");
    eq(rd.nextState(ST.LISTENING, "STOP", "hold"), ST.IDLE, "listening+STOP→idle");
    eq(rd.nextState(ST.LISTENING, "RECOG_END", "hold"), ST.IDLE, "hold 模式 onend→idle（不自动重启）");
    eq(rd.nextState(ST.LISTENING, "RECOG_END", "toggle"), ST.LISTENING, "toggle 模式 onend→listening（自动续听）");
    eq(rd.nextState(ST.LISTENING, "ERROR_FATAL", "toggle"), ST.IDLE, "fatal 错误→idle");
    eq(rd.nextState(ST.LISTENING, "ERROR_RECOVERABLE", "hold"), ST.LISTENING, "可恢复错误保持 listening");
    eq(rd.nextState(ST.LISTENING, "START", "hold"), ST.LISTENING, "listening+START 保持");
    eq(rd.nextState(ST.UNSUPPORTED, "START", "hold"), ST.UNSUPPORTED, "unsupported+START 保持 unsupported");
    eq(rd.nextState("bogus", "START", "hold"), ST.IDLE, "非法状态回退 idle");
    eq(rd.stateLabel(ST.IDLE), "待机（点麦克风开始）", "idle 文案");
    ok(rd.stateLabel(ST.LISTENING).indexOf("听写") >= 0, "listening 文案含“听写”");
    ok(rd.stateLabel(ST.UNSUPPORTED).indexOf("不支持") >= 0, "unsupported 文案含“不支持”");
})();

/* ---------- 2. 能力探测 ---------- */
(function () {
    function C() {}
    eq(rd.detectSpeechCtor({ SpeechRecognition: C }), C, "标准 SpeechRecognition 优先");
    eq(rd.detectSpeechCtor({ webkitSpeechRecognition: C }), C, "webkit 前缀兜底");
    eq(rd.detectSpeechCtor({}), null, "Firefox 式无 API→null");
    eq(rd.detectSpeechCtor(null), null, "null→null");
    eq(rd.detectSpeechCtor(undefined), null, "undefined→null");
})();

/* ---------- 3. 错误码映射 ---------- */
(function () {
    var codes = ["no-speech", "network", "audio-capture", "not-allowed", "service-not-allowed", "language-not-supported", "aborted"];
    codes.forEach(function (c) {
        ok(rd.getErrorText(c).length > 5, c + " 有中文提示");
    });
    ok(rd.getErrorText("not-allowed").indexOf("权限") >= 0, "not-allowed 提示麦克风权限");
    ok(rd.getErrorText("network").indexOf("联网") >= 0 || rd.getErrorText("network").indexOf("网络") >= 0, "network 提示网络");
    ok(rd.getErrorText("no-speech").indexOf("没有检测到语音") >= 0, "no-speech 提示无语音");
    ok(rd.getErrorText("some-weird-code").indexOf("some-weird-code") >= 0, "未知错误码回显原码");
    /* 互不相同 */
    var seen = {};
    codes.forEach(function (c) { seen[rd.getErrorText(c)] = true; });
    eq(Object.keys(seen).length, codes.length, "各错误码提示文案互不相同");
    /* fatal 判定 */
    ok(rd.isFatalError("network"), "network 是 fatal");
    ok(rd.isFatalError("not-allowed"), "not-allowed 是 fatal");
    ok(rd.isFatalError("audio-capture"), "audio-capture 是 fatal");
    ok(!rd.isFatalError("no-speech"), "no-speech 可恢复");
    ok(!rd.isFatalError("aborted"), "aborted 可恢复");
})();

/* ---------- 4. 结果拼接 ---------- */
(function () {
    function item(t, fin) { return { isFinal: fin, 0: { transcript: t } }; }
    var m = rd.mergeResults([item("你好", false)]);
    eq(m.interimText, "你好", "interim 提取");
    eq(m.finalText, "", "无 final");
    m = rd.mergeResults([item("你好", false), item("世界", true)]);
    eq(m.interimText, "你好", "混合：interim 部分");
    eq(m.finalText, "世界", "混合：final 部分");
    m = rd.mergeResults([item("a", true), item("b", true)], 1);
    eq(m.finalText, "b", "resultIndex 偏移生效");
    m = rd.mergeResults([]);
    eq(m.finalText + m.interimText, "", "空结果");
    m = rd.mergeResults([{ isFinal: true }]);
    eq(m.finalText, "", "缺 transcript 容错");
})();

/* ---------- 5. 历史管理与持久化 ---------- */
(function () {
    var e1 = rd.makeEntry("第一句", 1000);
    ok(e1.text === "第一句" && typeof e1.id === "string" && e1.ts === 1000, "makeEntry 字段完整");
    var l0 = [];
    var l1 = rd.addEntry(l0, e1);
    eq(l1.length, 1, "addEntry 新增一条");
    eq(l0.length, 0, "addEntry 不 mutate 原数组");
    var l2 = rd.addEntry(l1, rd.makeEntry("   ", 2000));
    eq(l2.length, 1, "空白文本忽略");
    var l3 = rd.removeEntry(l1, e1.id);
    eq(l3.length, 0, "removeEntry 按 id 删除");
    eq(rd.removeEntry(l1, "nope").length, 1, "删不存在的 id 不变");
    eq(rd.clearHistory().length, 0, "clearHistory 清空");
    /* 序列化往返 */
    var l4 = rd.addEntry(rd.addEntry([], rd.makeEntry("甲", 1000)), rd.makeEntry("乙", 2000));
    var back = rd.parseHistory(rd.serializeHistory(l4));
    eq(back.length, 2, "序列化往返 2 条");
    eq(back[0].text, "甲", "往返文本保留");
    eq(back[1].ts, 2000, "往返时间戳保留");
    eq(rd.parseHistory("not-json").length, 0, "损坏 JSON→空");
    eq(rd.parseHistory('{"a":1}').length, 0, "非数组→空");
    eq(rd.parseHistory('[{"text":"","ts":1}]').length, 0, "空文本条目过滤");
    eq(rd.HISTORY_KEY, "rd:history", "历史存储键");
    /* 上限 */
    var big = [];
    for (var i = 0; i < 205; i++) big = rd.addEntry(big, rd.makeEntry("x" + i, i));
    eq(big.length, rd.HISTORY_LIMIT, "历史上限 " + rd.HISTORY_LIMIT + " 条");
    eq(big[big.length - 1].text, "x204", "上限保留最新");
    /* 全文拼接 */
    var ft = rd.buildFullText([{ id: "a", text: "你好", ts: new Date(2026, 9, 23, 19, 5, 6).getTime() }]);
    eq(ft, "19:05:06 你好", "buildFullText 格式 HH:mm:ss+文本");
    /* HTML 转义 */
    eq(rd.escapeHtml('<b>&"\'</b>'), "&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;", "escapeHtml 转义");
})();

/* ---------- 6. 偏好与语言 ---------- */
(function () {
    var p = rd.parsePrefs(rd.serializePrefs({ mode: "toggle", lang: "en-US" }));
    eq(p.mode, "toggle", "偏好往返 mode");
    eq(p.lang, "en-US", "偏好往返 lang");
    eq(rd.parsePrefs("xx").mode, "hold", "损坏偏好回退默认 mode");
    eq(rd.parsePrefs(null).lang, "zh-CN", "null 回退默认 lang");
    eq(rd.parsePrefs('{"mode":"evil","lang":"xx-YY"}').mode, "hold", "非法 mode 回退");
    eq(rd.parsePrefs('{"mode":"evil","lang":"xx-YY"}').lang, "zh-CN", "非法 lang 回退");
    eq(rd.PREFS_KEY, "rd:prefs", "偏好存储键");
    ok(rd.isValidLang("zh-CN"), "zh-CN 合法");
    ok(rd.isValidLang("yue-HK"), "yue-HK 合法");
    ok(rd.isValidLang("en-US"), "en-US 合法");
    ok(!rd.isValidLang("fr-FR"), "fr-FR 不在列表");
    eq(rd.defaultPrefs().mode, "hold", "默认模式 hold（按住说话）");
})();

/* ---------- 7. 时间格式化 ---------- */
(function () {
    eq(rd.formatTs(new Date(2026, 9, 23, 19, 5, 6).getTime()), "19:05:06", "formatTs 时分秒补零");
    eq(rd.formatTs(new Date(2026, 9, 23, 8, 0, 9).getTime()), "08:00:09", "formatTs 凌晨补零");
    var now = 1000000;
    eq(rd.relativeTime(now - 30000, now), "刚刚", "<60s → 刚刚");
    eq(rd.relativeTime(now - 5 * 60000, now), "5 分钟前", "5min → 5 分钟前");
    ok(/^\d{2}:\d{2}:\d{2}$/.test(rd.relativeTime(now - 3 * 3600000, now)), "3h → HH:mm:ss");
})();

/* ---------- 8. 重启决策 ---------- */
(function () {
    eq(rd.shouldRestartAfterEnd("toggle", false, false), true, "toggle+听写中+无 fatal→重启");
    eq(rd.shouldRestartAfterEnd("toggle", true, false), false, "用户主动停止→不重启");
    eq(rd.shouldRestartAfterEnd("toggle", false, true), false, "fatal→不重启");
    eq(rd.shouldRestartAfterEnd("hold", false, false), false, "hold 模式→不重启");
})();

/* ---------- 9. Dictation 控制器（mock Recognition） ---------- */
function MockRecognition() {
    this.started = 0;
    this.stopped = 0;
    this.lang = "";
    this.interimResults = false;
    this.continuous = null;
    this.onresult = null; this.onerror = null; this.onend = null;
    MockRecognition.last = this;
}
MockRecognition.prototype.start = function () { this.started++; };
MockRecognition.prototype.stop = function () { this.stopped++; };
MockRecognition.last = null;
function fakeResults(items, idx) {
    return { resultIndex: idx || 0, results: items.map(function (x) { return { isFinal: x[1], 0: { transcript: x[0] } }; }) };
}
function makeDict(opts) {
    opts = opts || {};
    opts.createCtor = function () { return MockRecognition; };
    opts.nowFn = function () { return 424242; };
    var snaps = [];
    opts.onChange = function (s) { snaps.push(s); };
    var d = new rd.Dictation(opts);
    d._snaps = snaps;
    return d;
}
(function () {
    var d = makeDict({});
    eq(d.state, rd.ST.IDLE, "初始 idle");
    ok(d.start(), "start 成功");
    eq(d.state, rd.ST.LISTENING, "start→listening");
    eq(MockRecognition.last.lang, "zh-CN", "默认语言 zh-CN");
    eq(MockRecognition.last.interimResults, true, "interimResults=true");
    eq(MockRecognition.last.continuous, false, "continuous=false（手动启停）");
    /* interim 字幕 */
    MockRecognition.last.onresult(fakeResults([["你好世", false]]));
    eq(d.interim, "你好世", "interim 字幕更新");
    eq(d.history.length, 0, "interim 不入历史");
    /* final 入历史 */
    MockRecognition.last.onresult(fakeResults([["你好世界", true]]));
    eq(d.history.length, 1, "final 入历史");
    eq(d.history[0].text, "你好世界", "历史文本正确");
    eq(d.history[0].ts, 424242, "历史时间戳来自 nowFn");
    eq(d.interim, "", "final 后 interim 清空");
    /* 空 final 忽略 */
    MockRecognition.last.onresult(fakeResults([["   ", true]]));
    eq(d.history.length, 1, "空白 final 不入历史");
    /* stop */
    d.stop();
    eq(d.state, rd.ST.IDLE, "stop→idle");
    eq(MockRecognition.last.stopped, 1, "stop 调用 recognition.stop");
    /* fatal 错误 */
    d.start();
    MockRecognition.last.onerror({ error: "not-allowed" });
    eq(d.state, rd.ST.IDLE, "fatal 错误→idle");
    ok(d.lastError.indexOf("权限") >= 0, "fatal 错误提示中文");
    /* 可恢复错误 */
    d.start();
    MockRecognition.last.onerror({ error: "no-speech" });
    eq(d.state, rd.ST.LISTENING, "no-speech 可恢复，保持 listening");
    /* toggle 模式 onend 自动重启 */
    var d2 = makeDict({ mode: "toggle" });
    d2.start();
    var first = MockRecognition.last;
    first.onend();
    eq(d2.state, rd.ST.LISTENING, "toggle onend 后仍 listening");
    ok(MockRecognition.last !== first && MockRecognition.last.started === 1, "toggle onend 重建并重启识别器");
    /* hold 模式 onend 回 idle */
    var d3 = makeDict({ mode: "hold" });
    d3.start();
    MockRecognition.last.onend();
    eq(d3.state, rd.ST.IDLE, "hold onend→idle");
    /* 历史操作 */
    d2.pushEntry("hello", 100);
    eq(d2.history.length, 1, "pushEntry");
    d2.deleteEntry(d2.history[0].id);
    eq(d2.history.length, 0, "deleteEntry");
    d2.pushEntry("a", 1); d2.pushEntry("b", 2);
    d2.clear();
    eq(d2.history.length, 0, "clear");
    /* setMode/setLang */
    ok(d2.setMode("hold"), "setMode hold");
    eq(d2.mode, "hold", "mode 切换");
    ok(!d2.setMode("evil"), "非法 mode 拒绝");
    ok(d2.setLang("en-US"), "setLang en-US");
    eq(d2.lang, "en-US", "lang 切换");
    ok(!d2.setLang("fr-FR"), "非法 lang 拒绝");
    /* 不支持环境 */
    var d4 = new rd.Dictation({ createCtor: function () { return null; } });
    ok(!d4.start(), "无 API 时 start 返回 false");
    eq(d4.state, rd.ST.UNSUPPORTED, "无 API→unsupported");
    d4.start();
    eq(d4.state, rd.ST.UNSUPPORTED, "unsupported 下再次 start 保持");
})();

/* ---------- 10. 源码与模板约束 ---------- */
(function () {
    ok(!/\bfetch\s*\(/.test(SRC), "源码无 fetch 调用");
    ok(!/XMLHttpRequest/.test(SRC), "源码无 XMLHttpRequest");
    ok(SRC.indexOf("webkitSpeechRecognition") >= 0, "源码含 webkit 前缀探测");
    ok(SRC.indexOf("SpeechRecognition") >= 0, "源码含 SpeechRecognition");
    ok(SRC.indexOf("interimResults") >= 0, "源码设置 interimResults");
    ok(SRC.indexOf("localStorage") >= 0, "源码用 localStorage 持久化");
    ok(SRC.indexOf("零上传") < 0, "JS 源码无“零上传”宣称");
    ok(TPL.indexOf("零上传") < 0, "模板无“零上传”宣称");
    ok(TPL.indexOf("云端") >= 0, "模板含云端转写说明");
    ok(TPL.indexOf("桌面版 Chrome") >= 0 || TPL.indexOf("桌面版Chrome") >= 0, "模板提示换桌面版 Chrome");
    ok(TPL.indexOf("realtime_dictation.js") >= 0, "模板引用 JS 文件");
})();

console.log("断言通过 " + pass + "，失败 " + fail);
process.exit(fail ? 1 : 0);
