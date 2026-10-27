/* 滚动字幕生成器纯逻辑单元测试（零依赖）：node tests/scrolling_subtitle_generator.test.js
* 覆盖：
* 1. 归一化（水平归一 / 垂直按行保留 / 空输入）
* 2. HTML 转义
* 3. 四方向关键帧
* 4. 时长换算与悬停暂停
* 5. 颜色非法回落与参数钳制
* 6. 代码片段结构（两份内容无缝循环、无外部引用、无 JS）
* 7. 演示页（完整文档、含 snippet 全文）
* 8. 注册与零网络静态检查
*/
"use strict";
var fs = require("fs");
var M = require("../static/js/scrolling_subtitle_generator.js");

var pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(String(s).indexOf(sub) !== -1, name + "（应包含 " + JSON.stringify(sub) + "）"); }
function notHas(s, sub, name) { ok(String(s).indexOf(sub) === -1, name + "（不应包含 " + JSON.stringify(sub) + "）"); }

/* ---------- 1. 归一化 ---------- */
eq(M.normalizeText("  Hello   World \n 新年快乐  ", "left"), "Hello World 新年快乐", "水平归一向量");
eq(M.normalizeText("  Hello   World \n 新年快乐  ", "right"), "Hello World 新年快乐", "向右同为水平归一");
eq(M.normalizeText("  第一行  \n\n  第二行  \n", "up"), "第一行\n第二行", "垂直去空行保留换行");
eq(M.normalizeText("  第一行  \n\n  第二行  \n", "down"), "第一行\n第二行", "向下同为垂直按行保留");
eq(M.normalizeText("", "left"), "", "空输入返回空串");
eq(M.normalizeText("   \n  \n ", "up"), "", "全空白输入返回空串");
eq(M.normalizeText("a\t\tb", "left"), "a b", "制表符归一为单空格");
ok(M.isHorizontal("left") && M.isHorizontal("right"), "左右为水平方向");
ok(!M.isHorizontal("up") && !M.isHorizontal("down"), "上下为垂直方向");

/* ---------- 2. 转义 ---------- */
eq(M.escapeHtml('<b> & "test"'), "&lt;b&gt; &amp; &quot;test&quot;", "转义向量");
eq(M.escapeHtml("a'b"), "a&#39;b", "单引号转义");
var escSnippet = M.buildSnippet({ text: '<b> & "test"', direction: "left", speed: 100 }, 600);
has(escSnippet.full, "&lt;b&gt; &amp; &quot;test&quot;", "生成代码含转义实体");
notHas(escSnippet.full, "<b>", "生成代码无未转义 <b> 标签");

/* ---------- 3. 四方向关键帧 ---------- */
var kL = M.buildKeyframes("left");
eq(kL.name, "scroll-subtitle-marquee", "动画名统一");
eq(kL.from, "translateX(0)", "向左 from");
eq(kL.to, "translateX(-50%)", "向左 to");
var kR = M.buildKeyframes("right");
eq(kR.from, "translateX(-50%)", "向右 from 与向左互换");
eq(kR.to, "translateX(0)", "向右 to 与向左互换");
var kU = M.buildKeyframes("up");
eq(kU.from, "translateY(0)", "向上 from");
eq(kU.to, "translateY(-50%)", "向上 to");
var kD = M.buildKeyframes("down");
eq(kD.from, "translateY(-50%)", "向下 from 与向上互换");
eq(kD.to, "translateY(0)", "向下 to 与向上互换");

/* ---------- 4. 时长换算与悬停暂停 ---------- */
var s1 = M.buildSnippet({ text: "你好", direction: "left", speed: 100 }, 600);
eq(s1.durationSec, 6, "600px÷100px/s=6.0s");
eq(s1.duration, "6.0s", "时长格式化一位小数");
has(s1.css, "6.0s linear infinite", "CSS 含 linear infinite 与时长");
var s2 = M.buildSnippet({ text: "你好", direction: "left", speed: 200 }, 800);
eq(s2.durationSec, 4, "800px÷200px/s=4.0s");
var sPause = M.buildSnippet({ text: "你好", direction: "left", speed: 100, pauseOnHover: true }, 600);
has(sPause.css, "animation-play-state: paused", "悬停暂停开时含 paused");
var sNoPause = M.buildSnippet({ text: "你好", direction: "left", speed: 100, pauseOnHover: false }, 600);
notHas(sNoPause.css, "animation-play-state", "悬停暂停关时不含 play-state");

/* ---------- 5. 颜色回落与钳制 ---------- */
var sBad = M.buildSnippet({ text: "你好", direction: "left", textColor: "red", bgColor: "#12" }, 600);
eq(sBad.textColor, "#ffffff", "非法文字色回落白字");
eq(sBad.bgColor, "#111111", "非法背景色回落黑底");
var sClamp = M.buildSnippet({ text: "你好", direction: "left", speed: 9999, fontSize: 1 }, 600);
eq(sClamp.speed, 500, "速度钳制上限 500");
eq(sClamp.fontSize, 16, "字号钳制下限 16");
var sDef = M.buildSnippet({ text: "你好", direction: "left" }, 600);
eq(sDef.speed, 100, "速度默认 100");
eq(sDef.fontSize, 48, "字号默认 48");
eq(sDef.bold, true, "粗体默认开");

/* ---------- 6. 片段结构 ---------- */
var sH = M.buildSnippet({ text: "欢迎光临", direction: "left", speed: 100 }, 600);
eq((sH.html.match(/<span>欢迎光临<\/span>/g) || []).length, 2, "水平两份相同内容");
has(sH.css, "overflow: hidden", "CSS 容器 overflow hidden");
has(sH.full, "<style>", "full 含 <style>");
notHas(sH.full, "<script", "片段无 JS");
notHas(sH.full, "http://", "片段无外部引用 http");
notHas(sH.full, "https://", "片段无外部引用 https");
var sV = M.buildSnippet({ text: "第一行\n第二行", direction: "up", speed: 100 }, 600);
eq((sV.html.match(/第一行<br>第二行/g) || []).length, 2, "垂直两份相同内容、换行转 <br>");
has(sV.css, "flex-direction: column", "垂直 track 纵向排列");

/* ---------- 7. 演示页 ---------- */
var demo = M.buildDemoPage(sH);
has(demo, "<!DOCTYPE html>", "演示页为完整 HTML 文档");
has(demo, sH.full, "演示页含 snippet 全文");
has(demo, "viewport", "演示页含 viewport");

/* ---------- 8. 注册与零网络静态检查 ---------- */
var cats = fs.readFileSync(__dirname + "/../tools/categories.go", "utf8");
has(cats, '"scrolling_subtitle_generator"', "categories.go 注册 ID");
has(cats, '"/tools/scrolling-subtitle-generator"', "categories.go 注册 Path");
var paths = cats.match(/"\/tools\/[^"]+"/g) || [];
var uniq = paths.filter(function (v, i, a) { return a.indexOf(v) === i; });
eq(uniq.length, 202, "注册总数 201→202 Path");
var js = fs.readFileSync(__dirname + "/../static/js/scrolling_subtitle_generator.js", "utf8");
notHas(js, "fetch(", "JS 无 fetch");
notHas(js, "XMLHttpRequest", "JS 无 XHR");
notHas(js, "WebSocket", "JS 无 WebSocket");
var tpl = fs.readFileSync(__dirname + "/../templates/scrolling_subtitle_generator.html", "utf8");
has(tpl, "/tools/teleprompter", "模板互链提词器");
has(tpl, "/tools/big-sign-display", "模板互链大字标牌");
has(tpl, "/tools/subtitle-editor", "模板互链 SRT 编辑器");
notHas(tpl, "fonts.googleapis.com", "模板零 CDN");
has(tpl, "不做视频字幕烧录", "模板含真限制：不烧录");
has(tpl, "不是提词器", "模板含真限制：不是提词器");
has(tpl, "速度以当前预览实测尺寸换算", "模板含真限制：实测尺寸换算");
notHas(tpl, "色盲模拟", "模板不含未交付工具硬凑互链");
notHas(tpl, "MP3 标签", "模板不含未交付工具硬凑互链");

/* ---------- 9. 垂直无缝循环：容器高度等于单份内容高度 ---------- */
var sVHeight = M.buildSnippet({ text: "第一行\n第二行", direction: "up", speed: 100 }, 600);
has(sVHeight.css, "height: 600px", "垂直 up snippet 含与 measuredPx 一致的容器高度");
var sVDown = M.buildSnippet({ text: "第一行\n第二行", direction: "down", speed: 100 }, 480);
has(sVDown.css, "height: 480px", "垂直 down snippet 含与 measuredPx 一致的容器高度");
var sVZero = M.buildSnippet({ text: "第一行\n第二行", direction: "up", speed: 100 }, 0);
notHas(sVZero.css, " height:", "垂直 measuredPx<=0 时不写容器高度（line-height 除外）");
notHas(sH.css, " height:", "水平 snippet 不含容器高度");
has(sH.css, "line-height: 1.4", "水平 snippet 行高不受影响");

console.log("通过 " + pass + " 项，失败 " + fail + " 项");
process.exit(fail ? 1 : 0);
