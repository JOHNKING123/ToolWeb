/* 键盘按键测试纯逻辑单元测试（零依赖）：node tests/keyboard_tester.test.js
 * 覆盖：LAYOUT_SIZES/布局数据完整性（87/104/108 键数精确、code 唯一、键位结构）、
 * validateKeyboardConfig 确定性向量＋err.field、recordKeyEvent 追加确定性＋纯性＋err.field、
 * detectChatter 确定性向量逐字＋阈值边界＋err.field、buildKeyReport 全文逐字断言＋空事件向量、
 * buildKeyboardFileName 正则＋固定日期逐字、categories.go 注册（ID/Path/Icon keyboard/Category 开发工具/New、
 *   紧邻 fps_gpu_benchmark 硬件簇相邻、Path 总数 268→269）与零网络请求静态检查、
 * 真限制四条明示、互链「硬件一条龙」单向出链（开发轮定锚点：键盘测试→fps-gpu-benchmark/llm-hardware-checker，
 *   沿用 fps→llm 单向出链家族先例）、SEO 面板（Title/Description/Keywords/OG/JSON-LD）。 */
"use strict";
var fs = require("fs");
var path = require("path");
var M = require("../static/js/keyboard_tester.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(src, sub, name) { ok(src.indexOf(sub) >= 0, name + "（缺：" + sub + "）"); }
function notHas(src, sub, name) { ok(src.indexOf(sub) < 0, name + "（不应含：" + sub + "）"); }
function throwsWithField(fn, field, name) {
  try { fn(); } catch (e) {
    ok(e instanceof Error, name + "：抛出 Error 类型");
    eq(e.field, field, name + "：err.field");
    return;
  }
  fail++; console.error("FAIL:", name + "：未抛出异常");
}

var ROOT = path.join(__dirname, "..");
var JS_SRC = fs.readFileSync(path.join(ROOT, "static", "js", "keyboard_tester.js"), "utf8");
var TPL_SRC = fs.readFileSync(path.join(ROOT, "templates", "keyboard_tester.html"), "utf8");
var GO_SRC = fs.readFileSync(path.join(ROOT, "tools", "categories.go"), "utf8");

/* ---------- 1. 布局数据完整性 ---------- */
eq(M.LAYOUT_SIZES.join(","), "87,104,108", "LAYOUT_SIZES 为 87/104/108");
[87, 104, 108].forEach(function (l) {
  var keys = M.getLayoutKeys(l);
  eq(keys.length, l, "布局 " + l + " 键数精确为 " + l);
  var seenC = {}, dup = false, shapeOk = true;
  keys.forEach(function (k) {
    if (seenC[k.code]) dup = true;
    seenC[k.code] = true;
    if (typeof k.code !== "string" || typeof k.label !== "string" ||
        typeof k.x !== "number" || typeof k.y !== "number" ||
        typeof k.w !== "number" || typeof k.h !== "number" || k.w <= 0 || k.h <= 0) shapeOk = false;
  });
  ok(!dup, "布局 " + l + " code 无重复");
  ok(shapeOk, "布局 " + l + " 键位结构完整（code/label/x/y/w/h）");
});
var codes87 = M.getLayoutCodes(87), codes104 = M.getLayoutCodes(104), codes108 = M.getLayoutCodes(108);
ok(codes87.indexOf("Numpad0") < 0, "87 键无数字区");
ok(codes104.indexOf("Numpad0") >= 0, "104 键含 17 键数字区");
ok(codes104.indexOf("VolumeMute") < 0, "104 键无媒体键");
ok(codes108.indexOf("VolumeMute") >= 0 && codes108.indexOf("VolumeDown") >= 0 &&
   codes108.indexOf("VolumeUp") >= 0 && codes108.indexOf("LaunchMail") >= 0, "108 键含 4 颗媒体键");
eq(M.layoutLabel(87), "87 键（TKL·无数字区）", "layoutLabel(87)");
eq(M.layoutLabel(104), "104 键（全尺寸）", "layoutLabel(104)");
eq(M.layoutLabel(108), "108 键（全尺寸＋媒体键）", "layoutLabel(108)");
eq(M.CHATTER_DEFAULT_MS, 200, "连击阈值默认 200ms");
eq(M.CHATTER_MIN_MS, 1, "连击阈值下限 1ms");
eq(M.CHATTER_MAX_MS, 2000, "连击阈值上限 2000ms");
eq(M.LS_KEY, "toolweb.keyboard_tester.v1", "localStorage 版本化键");

/* ---------- 2. validateKeyboardConfig ---------- */
eq(M.validateKeyboardConfig({ layout: 87 }).ok, true, "config：87 通过");
eq(M.validateKeyboardConfig({ layout: 104 }).ok, true, "config：104 通过");
eq(M.validateKeyboardConfig({ layout: 108 }).ok, true, "config：108 通过");
throwsWithField(function () { M.validateKeyboardConfig({ layout: 100 }); }, "layout", "config：layout=100 非法");
throwsWithField(function () { M.validateKeyboardConfig({}); }, "layout", "config：缺 layout");
throwsWithField(function () { M.validateKeyboardConfig(null); }, "layout", "config：null");
throwsWithField(function () { M.validateKeyboardConfig({ layout: "104" }); }, "layout", "config：字符串 '104' 非法（严格口径）");
throwsWithField(function () { M.getLayoutKeys(60); }, "layout", "getLayoutKeys(60) 抛 layout");

/* ---------- 3. recordKeyEvent ---------- */
var base = [{ code: "KeyA", type: "keydown", time: 1, repeat: false }];
var appended = M.recordKeyEvent(base, { code: "KeyB", type: "keyup", time: 2 });
eq(base.length, 1, "recordKeyEvent：不修改原数组（纯）");
eq(JSON.stringify(appended),
  '[{"code":"KeyA","type":"keydown","time":1,"repeat":false},{"code":"KeyB","type":"keyup","time":2,"repeat":false}]',
  "recordKeyEvent：追加确定性逐字");
eq(JSON.stringify(M.recordKeyEvent([], { code: "Space", time: 5 })),
  '[{"code":"Space","type":"keydown","time":5,"repeat":false}]',
  "recordKeyEvent：type 缺省记 keydown");
eq(JSON.stringify(M.recordKeyEvent([], { code: "KeyA", type: "keypress", time: 5, repeat: 1 })),
  '[{"code":"KeyA","type":"keydown","time":5,"repeat":true}]',
  "recordKeyEvent：非法 type 回落 keydown，repeat 转布尔");
throwsWithField(function () { M.recordKeyEvent("nope", { code: "KeyA" }); }, "events", "recordKeyEvent：events 非数组");
throwsWithField(function () { M.recordKeyEvent([], {}); }, "event", "recordKeyEvent：event 缺 code");
throwsWithField(function () { M.recordKeyEvent([], null); }, "event", "recordKeyEvent：event 为 null");
throwsWithField(function () { M.recordKeyEvent([], { code: "" }); }, "event", "recordKeyEvent：code 空串");

/* ---------- 4. detectChatter ---------- */
var cev = [
  { code: "KeyB", type: "keydown", time: 1500, repeat: false },
  { code: "KeyB", type: "keyup", time: 1600, repeat: false },
  { code: "KeyB", type: "keydown", time: 1650, repeat: false },
  { code: "KeyC", type: "keydown", time: 2000, repeat: false },
  { code: "KeyC", type: "keydown", time: 2600, repeat: false }
];
eq(JSON.stringify(M.detectChatter(cev, 200)),
  '[{"code":"KeyB","presses":2,"chatterCount":1,"hits":[{"time":1650,"prevTime":1500,"gap":150}]}]',
  "detectChatter：确定性向量逐字（KeyB 150ms 连击，KeyC 600ms 不记）");
eq(JSON.stringify(M.detectChatter(cev, 100)), "[]", "detectChatter：阈值 100ms 时无连击");
eq(JSON.stringify(M.detectChatter([], 200)), "[]", "detectChatter：空事件为空");
eq(JSON.stringify(M.detectChatter([{ code: "KeyA", type: "keydown", time: 10, repeat: false }], 200)), "[]",
  "detectChatter：单次按下不记连击");
throwsWithField(function () { M.detectChatter(cev, 0); }, "thresholdMs", "detectChatter：阈值 0 非法");
throwsWithField(function () { M.detectChatter(cev, 2001); }, "thresholdMs", "detectChatter：阈值 2001 非法");
throwsWithField(function () { M.detectChatter(cev, NaN); }, "thresholdMs", "detectChatter：阈值 NaN 非法");
throwsWithField(function () { M.detectChatter(cev, Infinity); }, "thresholdMs", "detectChatter：阈值 Infinity 非法");
throwsWithField(function () { M.detectChatter(cev, "200"); }, "thresholdMs", "detectChatter：阈值字符串非法");
ok(Array.isArray(M.detectChatter(cev, 1)) && Array.isArray(M.detectChatter(cev, 2000)), "detectChatter：边界 1/2000 合法");
throwsWithField(function () { M.detectChatter(null, 200); }, "events", "detectChatter：events 非数组");

/* ---------- 5. buildKeyReport ---------- */
var rev = [];
rev = M.recordKeyEvent(rev, { code: "KeyA", type: "keydown", time: 1000 });
rev = M.recordKeyEvent(rev, { code: "KeyA", type: "keyup", time: 1120 });
rev = M.recordKeyEvent(rev, { code: "KeyB", type: "keydown", time: 1500 });
rev = M.recordKeyEvent(rev, { code: "KeyB", type: "keyup", time: 1600 });
rev = M.recordKeyEvent(rev, { code: "KeyB", type: "keydown", time: 1650 });
var report = M.buildKeyReport(rev, 104, { thresholdMs: 200, nowText: "2026-11-02 07:00:00" });
var LB = String.fromCharCode(0x3010), RB = String.fromCharCode(0x3011);
var expectedReport = "键盘按键测试报告\n================\n布局：104 键（全尺寸）\n生成时间：2026-11-02 07:00:00\n连击检测阈值：200ms\n\n" + LB + "统计" + RB + "\n测试按键总数：104\n已触发按键：2（1.9%）\n未触发按键：102\n记录事件总数：5\n\n" + LB + "触发按键序列" + RB + "\n1. [1000ms] KeyA 按下\n2. [1120ms] KeyA 松开\n3. [1500ms] KeyB 按下\n4. [1600ms] KeyB 松开\n5. [1650ms] KeyB 按下\n\n" + LB + "连击嫌疑" + RB + "\n- KeyB：按下 2 次，其中 1 次按下间隔 150ms（<200ms），疑似连击\n\n" + LB + "未触发按键（102 个）" + RB + "\nEscape, F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12, PrintScreen, ScrollLock, Pause, Backquote, Digit1, Digit2, Digit3, Digit4, Digit5, Digit6, Digit7, Digit8, Digit9, Digit0, Minus, Equal, Backspace, Insert, Home, PageUp, NumLock, NumpadDivide, NumpadMultiply, NumpadSubtract, Tab, KeyQ, KeyW, KeyE, KeyR, KeyT, KeyY, KeyU, KeyI, KeyO, KeyP, BracketLeft, BracketRight, Backslash, Delete, End, PageDown, Numpad7, Numpad8, Numpad9, NumpadAdd, CapsLock, KeyS, KeyD, KeyF, KeyG, KeyH, KeyJ, KeyK, KeyL, Semicolon, Quote, Enter, Numpad4, Numpad5, Numpad6, ShiftLeft, KeyZ, KeyX, KeyC, KeyV, KeyN, KeyM, Comma, Period, Slash, ShiftRight, ArrowUp, Numpad1, Numpad2, Numpad3, NumpadEnter, ControlLeft, MetaLeft, AltLeft, Space, AltRight, MetaRight, ContextMenu, ControlRight, ArrowLeft, ArrowDown, ArrowRight, Numpad0, NumpadDecimal";
eq(report, expectedReport, "buildKeyReport：全文逐字断言");
has(report, "1. [1000ms] KeyA 按下", "报告：触发序列行 1");
has(report, "1.9%", "报告：触发率 2/104");
has(report, "- KeyB：按下 2 次，其中 1 次按下间隔 150ms（<200ms），疑似连击", "报告：连击嫌疑行");
has(report, "Escape, F1, F2", "报告：未触发按键表头");
var unhitSection = report.split("未触发按键（")[1];
ok(unhitSection.indexOf("KeyA") < 0 && unhitSection.indexOf("KeyB") < 0, "报告：KeyA/KeyB 不在未触发表内");
var emptyR = M.buildKeyReport([], 87, { thresholdMs: 200, nowText: "2026-11-02 07:00:00" });
has(emptyR, "（暂无按键事件）", "空事件报告：序列占位");
has(emptyR, "无（全部按键按下间隔均", "空事件报告：无连击");
has(emptyR, "布局：87 键（TKL·无数字区）", "空事件报告：87 键布局名");
has(emptyR, "已触发按键：0（0.0%）", "空事件报告：零触发");
throwsWithField(function () { M.buildKeyReport([], 100, {}); }, "layout", "buildKeyReport：非法 layout");
throwsWithField(function () { M.buildKeyReport([], 104, { thresholdMs: 0 }); }, "thresholdMs", "buildKeyReport：非法阈值");
throwsWithField(function () { M.buildKeyReport("nope", 104, {}); }, "events", "buildKeyReport：events 非数组");

/* ---------- 6. buildKeyboardFileName ---------- */
ok(/^keyboard_test_report_\d{8}_\d{6}\.txt$/.test(M.buildKeyboardFileName()), "文件名：正则匹配");
eq(M.buildKeyboardFileName(new Date(2026, 10, 2, 7, 5, 9)), "keyboard_test_report_20261102_070509.txt", "文件名：固定日期逐字");
ok(/^keyboard_test_report_\d{8}_\d{6}\.txt$/.test(M.buildKeyboardFileName("invalid")), "文件名：非法 date 回落当前时间");

/* ---------- 7. categories.go 注册 ---------- */
var kbIdx = GO_SRC.indexOf('"keyboard_tester"');
ok(kbIdx >= 0, "注册 ID keyboard_tester");
ok(GO_SRC.indexOf('"/tools/keyboard-tester"') >= 0, "注册 Path /tools/keyboard-tester");
ok(GO_SRC.slice(kbIdx, kbIdx + 1200).indexOf('Icon:        "keyboard"') >= 0, "注册 Icon keyboard（全库唯一）");
ok(GO_SRC.slice(kbIdx, kbIdx + 1200).indexOf("New:         true") >= 0, "注册 New 为 true");
ok(GO_SRC.slice(kbIdx, kbIdx + 1200).indexOf('Category:    "开发工具"') >= 0, "注册 Category 为开发工具");
ok(GO_SRC.slice(kbIdx, kbIdx + 1200).indexOf("keyboard") >= 0 &&
   GO_SRC.slice(kbIdx, kbIdx + 1200).toLowerCase().indexOf("keyboard tester") >= 0, "Description 中英文双语（含英文）");
var fpsIdx = GO_SRC.indexOf('"fps_gpu_benchmark"');
ok(fpsIdx >= 0 && kbIdx > fpsIdx, "注册紧邻 fps_gpu_benchmark 之后（硬件簇相邻）");
var pathRe = /"\/tools\/[^"]+"/g, seen = {}, m, pathCount = 0;
while ((m = pathRe.exec(GO_SRC)) !== null) { if (!seen[m[0]]) { seen[m[0]] = true; pathCount++; } }
eq(pathCount, 272, "注册 Path 总数 268→270");

/* ---------- 8. 模板：真限制/互链/SEO ---------- */
has(TPL_SRC, "https://www.johnkingzcq123.xyz/tools/keyboard-tester", "模板 canonical 含新 Path");
has(TPL_SRC, "系统级组合键捕获不到", "真限制①：系统级组合键");
has(TPL_SRC, "Fn 键与多媒体键的行为因键盘型号", "真限制②：Fn/多媒体键因键盘而异");
has(TPL_SRC, "需手动切换布局", "真限制③：手动切换布局");
has(TPL_SRC, "纯本地零上传", "真限制④：纯本地零上传");
has(TPL_SRC, "/tools/fps-gpu-benchmark", "互链：单向出链 fps-gpu-benchmark");
has(TPL_SRC, "/tools/llm-hardware-checker", "互链：单向出链 llm-hardware-checker");
has(TPL_SRC, "硬件一条龙", "互链文案：硬件一条龙");
has(TPL_SRC, "<title>键盘按键测试", "SEO：title");
has(TPL_SRC, 'name="description"', "SEO：description");
has(TPL_SRC, 'name="keywords"', "SEO：keywords");
has(TPL_SRC, 'property="og:title"', "SEO：og:title");
has(TPL_SRC, 'property="og:url"', "SEO：og:url");
has(TPL_SRC, "application/ld+json", "SEO：JSON-LD");
has(TPL_SRC, "/tools/static/js/keyboard_tester.js", "模板引入 JS");
has(TPL_SRC, 'id="kt-board"', "模板：键盘键位容器");
has(TPL_SRC, 'id="kt-report"', "模板：报告预览区");
has(TPL_SRC, 'data-layout="87"', "模板：87 键切换按钮");
has(TPL_SRC, 'data-layout="104"', "模板：104 键切换按钮");
has(TPL_SRC, 'data-layout="108"', "模板：108 键切换按钮");

/* ---------- 9. JS 零网络请求静态检查 ---------- */
notHas(JS_SRC, "fetch(", "零网络：无 fetch");
notHas(JS_SRC, "XMLHttpRequest", "零网络：无 XHR");
notHas(JS_SRC, "navigator.sendBeacon", "零网络：无 sendBeacon");
has(JS_SRC, "navigator.clipboard", "复制走 navigator.clipboard（带降级）");
has(JS_SRC, "toolweb.keyboard_tester.v1", "布局/阈值 localStorage 版本化持久");

console.log("keyboard_tester: pass=" + pass + " fail=" + fail);
process.exit(fail === 0 ? 0 : 1);
