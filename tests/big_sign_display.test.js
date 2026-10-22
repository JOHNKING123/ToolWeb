/* 大字标牌展示器纯逻辑单元测试（零依赖）：node tests/big_sign_display.test.js
* 覆盖：
* 1. 分页符切分（splitPages/pageStats）
* 2. 字符计数与排版宽度（countChars/effWidthUnits）
* 3. 自适应字号（fitFontSize：短文巨字、长文缩小、上下限钳制）
* 4. 主题（themeColors/validTheme）
* 5. 镜像（mirrorTransform）
* 6. 分页导航边界（clampPage/nextPage/prevPage/pageLabel）
* 7. 快捷键映射（keyAction）
* 8. 默认状态与示例文案
* 9. HTML 转义（esc）
* 10. 零上传：脚本内无 fetch/XHR/WebSocket/EventSource
*/
"use strict";
var fs = require("fs");
var M = require("../static/js/big_sign_display.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function near(a, b, name) { ok(Math.abs(a - b) < 1e-9, name + "（期望 " + b + "，实得 " + a + "）"); }

/* ---------- 1. 分页符切分 ---------- */
var p1 = M.splitPages("第一屏\n---\n第二屏\n---\n第三屏");
eq(p1.length, 3, "--- 切出 3 屏");
eq(p1[0].text, "第一屏", "首屏文本");
eq(p1[2].i, 2, "屏序号连续");
eq(p1[1].chars, 3, "单屏字数");

var p2 = M.splitPages("只有一屏内容");
eq(p2.length, 1, "无分页符 = 1 屏");
eq(p2[0].text, "只有一屏内容", "单屏文本完整");

var p3 = M.splitPages("");
eq(p3.length, 0, "空输入 0 屏");

var p4 = M.splitPages("A\n---\n---\nB");
eq(p4.length, 2, "连续分页符不产生空屏");

var p5 = M.splitPages("---\nA\n---");
eq(p5.length, 1, "首尾分页符不产生空屏");

var p6 = M.splitPages("A\n  ---  \nB");
eq(p6.length, 2, "分页符两侧空白被容忍");

var p7 = M.splitPages("A\n\n\nB");
eq(p7.length, 1, "空行不是分页符，仍为 1 屏");

var p8 = M.splitPages("\n\nA\n\n");
eq(p8.length, 1, "屏首尾空行被去除");
eq(p8[0].text, "A", "去除后文本干净");

var p9 = M.splitPages("价格 ---- 元");
eq(p9.length, 1, "行内连字符不是分页符");

var st = M.pageStats("欢迎光临\n---\n今日特价全场八折");
eq(st.pages, 2, "统计屏数 2");
eq(st.chars, 12, "统计总字数 12");
eq(st.perPage.join(","), "4,8", "每屏字数 4/8");

var st0 = M.pageStats("");
eq(st0.pages, 0, "空文案 0 屏");
eq(st0.chars, 0, "空文案 0 字");

/* ---------- 2. 字符计数与排版宽度 ---------- */
eq(M.countChars("你好 世界\n"), 4, "中文去空白计数");
eq(M.countChars(""), 0, "空串 0 字");
eq(M.effWidthUnits("中文"), 2, "CJK 按 1em 计");
near(M.effWidthUnits("ab"), 1.1, "拉丁按 0.55em 计");
near(M.effWidthUnits("中a"), 1.55, "混合宽度累加");
eq(M.effWidthUnits("  \n "), 0, "空白不计宽度");
ok(M.effWidthUnits("欢迎光临") > M.effWidthUnits("hello"), "同等字数中文排版更宽");

/* ---------- 3. 自适应字号 ---------- */
var VW = 1920, VH = 1080;
var fsShort = M.fitFontSize(M.effWidthUnits("欢迎光临"), VW, VH);
ok(fsShort >= 400, "4 字短文全屏巨字（≥400px），实得 " + fsShort);
var fsLong = M.fitFontSize(M.effWidthUnits(new Array(101).join("字")), VW, VH);
ok(fsLong < fsShort, "长文（100字）字号自动缩小");
ok(fsLong >= M.MIN_FS, "长文字号不低于下限");
eq(M.fitFontSize(0, VW, VH), M.MIN_FS, "空屏返回最小字号");
eq(M.fitFontSize(4, 0, VH), M.MIN_FS, "零宽度返回最小字号");
eq(M.fitFontSize(4, VW, 0), M.MIN_FS, "零高度返回最小字号");
eq(M.fitFontSize(-3, VW, VH), M.MIN_FS, "负数返回最小字号");
var fsTiny = M.fitFontSize(M.effWidthUnits("好"), 320, 200);
ok(fsTiny <= 200 * 0.92 + 1, "单字字号受 92% 视口高封顶，实得 " + fsTiny);
var fsCap = M.fitFontSize(M.effWidthUnits("好"), 4000, 3000);
eq(fsCap, M.MAX_FS_ABS, "超大视口受 640px 绝对上限封顶");
ok(M.fitFontSize(M.effWidthUnits("ab"), VW, VH) >= fsShort, "同等单位下英文不小于中文估算");

/* ---------- 4. 主题 ---------- */
eq(M.themeColors("dark").bg, "#000000", "黑底白字背景");
eq(M.themeColors("dark").fg, "#ffffff", "黑底白字前景");
eq(M.themeColors("light").bg, "#ffffff", "白底黑字背景");
eq(M.themeColors("light").fg, "#000000", "白底黑字前景");
eq(M.themeColors("yellow").bg, "#ffe600", "黄底黑字背景");
eq(M.themeColors("yellow").fg, "#000000", "黄底黑字前景");
eq(M.themeColors("nope").bg, "#000000", "非法主题回退黑底白字");
eq(M.validTheme("light"), "light", "合法主题保留");
eq(M.validTheme("nope"), "dark", "非法主题回退 dark");
eq(Object.keys(M.THEMES).length, 3, "共 3 套主题");

/* ---------- 5. 镜像 ---------- */
eq(M.mirrorTransform(true), "scaleX(-1)", "镜像开启水平翻转");
eq(M.mirrorTransform(false), "none", "镜像关闭无变换");

/* ---------- 6. 分页导航 ---------- */
eq(M.clampPage(2, 5), 2, "范围内保持");
eq(M.clampPage(-1, 5), 0, "负数钳制 0");
eq(M.clampPage(9, 5), 4, "超上界钳制末页");
eq(M.clampPage(0, 0), 0, "0 屏时返回 0");
eq(M.nextPage(1, 5), 2, "下一页");
eq(M.nextPage(4, 5), 4, "末页下一页不动");
eq(M.prevPage(2, 5), 1, "上一页");
eq(M.prevPage(0, 5), 0, "首页上一页不动");
eq(M.nextPage(0, 0), 0, "0 屏下一页不动");
eq(M.pageLabel(0, 3), "第 1 / 3 页", "页码文案");
eq(M.pageLabel(2, 3), "第 3 / 3 页", "末页文案");
eq(M.pageLabel(0, 0), "暂无内容", "0 屏文案");

/* ---------- 7. 快捷键 ---------- */
eq(M.keyAction(" "), "next", "空格下一页");
eq(M.keyAction("ArrowRight"), "next", "右箭头下一页");
eq(M.keyAction("PageDown"), "next", "PageDown 下一页");
eq(M.keyAction("ArrowLeft"), "prev", "左箭头上一页");
eq(M.keyAction("PageUp"), "prev", "PageUp 上一页");
eq(M.keyAction("Home"), "first", "Home 回首页");
eq(M.keyAction("End"), "last", "End 到末页");
eq(M.keyAction("f"), "fullscreen", "f 全屏");
eq(M.keyAction("F"), "fullscreen", "F 全屏");
eq(M.keyAction("Escape"), "toedit", "Esc 返回编辑");
eq(M.keyAction("a"), null, "无关按键无动作");
eq(M.keyAction("Enter"), null, "回车无动作");

/* ---------- 8. 默认状态与示例 ---------- */
var ds = M.defaultState();
eq(ds.theme, "dark", "默认黑底白字主题");
eq(ds.mirror, false, "默认镜像关闭");
eq(ds.page, 0, "默认第 1 页");
eq(ds.mode, "edit", "默认编辑模式");
ok(M.SAMPLE_TEXT.indexOf("---") >= 0, "示例文案含分页符");
ok(M.splitPages(M.SAMPLE_TEXT).length >= 3, "示例文案 ≥3 屏");

/* ---------- 9. HTML 转义 ---------- */
eq(M.esc("<b>"), "&lt;b&gt;", "尖括号转义");
ok(M.esc('a"b').indexOf("&quot;") >= 0, "双引号转义");
ok(M.esc("it's").indexOf("&#39;") >= 0, "单引号转义");

/* ---------- 10. 零上传 ---------- */
var src = fs.readFileSync(__dirname + "/../static/js/big_sign_display.js", "utf8");
["fetch(", "XMLHttpRequest", "WebSocket", "EventSource", "navigator.sendBeacon"].forEach(function (kw) {
  ok(src.indexOf(kw) < 0, "脚本内无网络关键字：" + kw);
});

console.log("\n通过 " + pass + " / " + (pass + fail) + "，失败 " + fail);
process.exit(fail ? 1 : 0);
