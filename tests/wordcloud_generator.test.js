/* 词云生成器（wordcloud_generator）纯逻辑单元测试（零依赖）：
 * node tests/wordcloud_generator.test.js
 * 覆盖：中英文分词、停用词过滤、单字统计、词频排序、字号映射边界、
 * 钳制、布局无重叠与可注种、空间不足计数、空输入与全停用词提示、
 * 注册（194→195 Path）与零网络请求静态检查、模板真限制文案与互链。
 */
"use strict";
var fs = require("fs");
var path = require("path");
var W = require("../static/js/wordcloud_generator.js");
var SRC = fs.readFileSync(path.join(__dirname, "..", "static", "js", "wordcloud_generator.js"), "utf8");
var TPL = fs.readFileSync(path.join(__dirname, "..", "templates", "wordcloud_generator.html"), "utf8");
var GO = fs.readFileSync(path.join(__dirname, "..", "tools", "categories.go"), "utf8");

var pass = 0, fail = 0;
function ok(cond, name) {
    if (cond) { pass++; }
    else { fail++; console.error("FAIL:", name); }
}
function eq(a, b, name) { ok(a === b, name + "（期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a) + "）"); }
function has(s, sub, name) { ok(s.indexOf(sub) !== -1, name); }
function notHas(s, sub, name) { ok(s.indexOf(sub) === -1, name); }
function find(list, word) {
    for (var i = 0; i < list.length; i++) if (list[i].word === word) return list[i];
    return null;
}
/* node 下测宽替身：宽 = 字数 × 字号 × 0.6，高 = 字号。 */
function stubMeasure(word, fontSize) {
    return { width: word.length * fontSize * 0.6, height: fontSize };
}
function noOverlap(placements, name) {
    for (var i = 0; i < placements.length; i++) {
        for (var j = i + 1; j < placements.length; j++) {
            var a = placements[i], b = placements[j];
            var overlap = (a.x - a.w / 2 < b.x + b.w / 2) && (a.x + a.w / 2 > b.x - b.w / 2) &&
                (a.y - a.h / 2 < b.y + b.h / 2) && (a.y + a.h / 2 > b.y - b.h / 2);
            if (overlap) { ok(false, name + "（" + a.word + " 与 " + b.word + " 重叠）"); return; }
        }
    }
    ok(true, name);
}

/* ---------- 1. 英文分词：小写归一＋停用词过滤 ---------- */
eq(W.tokenize("Hello HELLO hello").join(","), "hello,hello,hello", "分词：英文小写归一");
eq(W.tokenize("the and of to a in Development").join(","), "development", "分词：the／and／of／to／a／in 均被过滤");
ok(W.STOPWORDS.length >= 40, "停用词：内置不少于 40 词（实得 " + W.STOPWORDS.length + "）");
eq(W.tokenize("Hello, world! 123 ...").join(","), "hello,world,123", "分词：纯标点与空白不计入");
eq(W.tokenize("Version2 test3").join(","), "version2,test3", "分词：数字序列与英文混排按字母数字序列切分");

/* ---------- 2. 中文分词：空格词组 vs 无空格单字 ---------- */
eq(W.tokenize("开发 工具").join(","), "开发,工具", "分词：空格分隔词组按词组计");
eq(W.tokenize("开发开发").join(","), "开,发,开,发", "分词：无空格连续中文按单字计");
eq(W.tokenize("开发工具很棒").join(","), "开,发,工,具,很,棒", "分词：较长连续中文按单字计");
eq(W.tokenize("开发，工具").join(","), "开发,工具", "分词：标点分隔的中文词组按词组计");
eq(W.tokenize("你好").join(","), "你好", "分词：双字词组按词组计");

/* ---------- 3. 规格示例闭环 ---------- */
var sample = W.countFreq(W.SAMPLE);
eq(sample[0].word, "开发", "示例：词频表首位为开发");
eq(sample[0].count, 5, "示例：开发出现 5 次");
eq(find(sample, "工具").count, 4, "示例：工具出现 4 次");
eq(find(sample, "development").count, 3, "示例：development 出现 3 次");
eq(find(sample, "the"), null, "示例：the 被停用词过滤、不在表中");
eq(find(sample, "and"), null, "示例：and 被停用词过滤、不在表中");

/* ---------- 4. 词频排序：频次降序，同频按首次出现 ---------- */
var sorted = W.countFreq("d e d f e d");
eq(sorted[0].word, "d", "排序：最高频在首位");
eq(sorted[0].count, 3, "排序：最高频计数正确");
eq(sorted[1].word, "e", "排序：次高频第二");
eq(sorted[2].word, "f", "排序：最低频在末位");
var tied = W.countFreq("x y z");
eq(tied.map(function (e) { return e.word; }).join(","), "x,y,z", "排序：同频按首次出现顺序");

/* ---------- 5. 字号映射 ---------- */
eq(W.mapFontSize(10, 1, 10), 96, "字号：最高频映射 96px");
eq(W.mapFontSize(1, 1, 10), 16, "字号：最低频映射 16px");
ok(W.mapFontSize(10, 1, 10) > W.mapFontSize(1, 1, 10), "字号：高频字号大于低频");
eq(W.mapFontSize(5, 5, 5), 56, "字号：频次全相等取中值 56px");
eq(W.mapFontSize(3, 3, 3), 56, "字号：单值批次同样取中值");
var mid = W.mapFontSize(5, 1, 9);
ok(mid > 16 && mid < 96, "字号：中间频次落在 16–96px 之间（实得 " + mid + "）");

/* ---------- 6. 钳制与过滤 ---------- */
eq(W.clampInt(5, 10, 200).value, 10, "钳制：低于下限钳制到 10");
eq(W.clampInt(5, 10, 200).clamped, true, "钳制：低于下限标记 clamped");
eq(W.clampInt(500, 10, 200).value, 200, "钳制：高于上限钳制到 200");
eq(W.clampInt(50, 10, 200).value, 50, "钳制：范围内原值通过");
eq(W.clampInt(50, 10, 200).clamped, false, "钳制：范围内不标记 clamped");
eq(W.clampInt(0, 1, 10).value, 1, "钳制：最小词频下限为 1");
eq(W.clampInt(99, 1, 10).value, 10, "钳制：最小词频上限为 10");
var filtered = W.filterWords([{ word: "a", count: 5 }, { word: "b", count: 3 }, { word: "c", count: 1 }], 2, 2);
eq(filtered.length, 2, "过滤：最大词数截断生效");
eq(filtered[1].word, "b", "过滤：低于最小词频的词被排除");

/* ---------- 7. 布局：可注种、无重叠、空间不足计数 ---------- */
var items = W.filterWords(sample, 50, 1);
var layA = W.layoutWords(items, 800, 500, 42, stubMeasure);
var layB = W.layoutWords(items, 800, 500, 42, stubMeasure);
eq(layA.placements.length, layB.placements.length, "布局：同种子放置词数一致");
var samePos = layA.placements.every(function (p, i) {
    return p.x === layB.placements[i].x && p.y === layB.placements[i].y && p.word === layB.placements[i].word;
});
ok(samePos, "布局：同种子位置逐一一致");
noOverlap(layA.placements, "布局：同种子布局下任意两词矩形无重叠");
ok(layA.placements.length + layA.skipped === items.length, "布局：放置数＋跳过数＝词数");
var layC = W.layoutWords(items, 800, 500, 7, stubMeasure);
var anyDiff = layA.placements.some(function (p, i) {
    return !layC.placements[i] || p.x !== layC.placements[i].x || p.y !== layC.placements[i].y;
});
ok(anyDiff, "布局：不同种子布局可不同");
var many = [];
for (var m = 0; m < 30; m++) many.push({ word: "w" + m, count: 1 });
var tiny = W.layoutWords(many, 120, 80, 42, stubMeasure);
ok(tiny.skipped > 0, "布局：小画布下放不下的词有计数（实得跳过 " + tiny.skipped + " 个）");
ok(tiny.placements.length + tiny.skipped === many.length, "布局：小画布放置＋跳过＝总数");
var big = W.layoutWords(many, 2000, 1500, 42, stubMeasure);
eq(big.skipped, 0, "布局：大画布下全部放下、无跳过");
noOverlap(big.placements, "布局：大画布布局无重叠");
ok(layA.placements[0].fontSize >= layA.placements[layA.placements.length - 1].fontSize, "布局：高频词字号不小于低频词");

/* ---------- 8. 词频表格式与配色 ---------- */
eq(W.formatFreqTable([{ word: "开发", count: 5 }, { word: "工具", count: 4 }]), "开发：5\n工具：4", "词频表：每行「词：频次」");
eq(W.formatFreqTable([]), "", "词频表：空表为空串");
ok(Object.keys(W.PALETTES).length >= 3, "配色：至少 3 套配色");
ok(W.PALETTES.classic && W.PALETTES.blue && W.PALETTES.warm, "配色：经典多彩／单色蓝／暖色三套齐全");
eq(W.colorFor(0, "blue"), W.PALETTES.blue[0], "配色：按词间轮换取色");
eq(W.colorFor(W.PALETTES.blue.length, "blue"), W.PALETTES.blue[0], "配色：轮换到末尾后循环");

/* ---------- 9. 输入处理：空输入与有效词为 0 ---------- */
var empty = W.processInput("", {});
eq(empty.ok, false, "输入：空输入标记失败");
eq(empty.error, "请粘贴或输入文本", "输入：空输入中文提示「请粘贴或输入文本」");
var blank = W.processInput("   \n  ", {});
eq(blank.ok, false, "输入：纯空白标记失败");
var stops = W.processInput("the and of the and", {});
eq(stops.ok, false, "输入：全部为停用词标记失败");
eq(stops.error, "未找到有效词语，请检查输入或调低最小词频", "输入：全停用词中文提示");
var tooHigh = W.processInput("开发 开发", { maxWords: 50, minFreq: 5 });
eq(tooHigh.ok, false, "输入：最小词频高于所有频次时标记失败");
var good = W.processInput(W.SAMPLE, { maxWords: 50, minFreq: 2 });
eq(good.ok, true, "输入：规格示例处理成功");
eq(good.words[0].word, "开发", "输入：规格示例首位为开发");
eq(good.words[0].count, 5, "输入：规格示例首位计数 5");

/* ---------- 10. 注册（194→195 Path） ---------- */
has(GO, '"wordcloud_generator"', "注册：categories.go 含 ID wordcloud_generator");
has(GO, '"/tools/wordcloud-generator"', "注册：categories.go 含 Path /tools/wordcloud-generator");
has(GO, "词云生成器", "注册：categories.go 含名称 词云生成器");
has(GO, '"文本工具"', "注册：categories.go 含文本工具品类");
var pathMatches = GO.match(/"\/tools\/[^"]+"/g) || [];
var uniquePaths = {};
pathMatches.forEach(function (p) { uniquePaths[p] = true; });
eq(Object.keys(uniquePaths).length, 195, "注册：去重 Path 总数 194→195（实得 " + Object.keys(uniquePaths).length + "）");

/* ---------- 11. 零网络静态检查 ---------- */
notHas(SRC, "fetch(", "零网络：JS 无 fetch 调用");
notHas(SRC, "XMLHttpRequest", "零网络：JS 无 XHR");
notHas(TPL, "fetch(", "零网络：模板无 fetch 调用");
notHas(TPL, "XMLHttpRequest", "零网络：模板无 XHR");
var extScripts = (TPL.match(/<script[^>]+src="https?:\/\/[^"]+"/g) || []).length;
eq(extScripts, 0, "零外部脚本：模板无 https 外部 script");
notHas(SRC, "cdn", "零 CDN：JS 无 CDN 引用");

/* ---------- 12. 模板：真限制文案、互链与控件 ---------- */
has(TPL, "中文分词只做空格分词＋单字／常见词频统计、不承诺专业分词效果", "真限制：模板含中文分词真限制文案");
has(TPL, "布局为 Canvas 矩形／螺旋占位、不承诺任意形状遮罩", "真限制：模板含布局真限制文案");
has(TPL, "只做可视化、不做语义分析", "真限制：模板含只做可视化真限制文案");
has(TPL, "https://www.johnkingzcq123.xyz/tools/wordcloud-generator", "SEO：模板含 canonical 链接");
has(TPL, "/tools/text-tools", "互链：模板含文本工具集");
has(TPL, "wc-input", "模板：含原文本输入框");
has(TPL, "wc-canvas", "模板：含 Canvas 词云区");
has(TPL, "wc-table", "模板：含词频表");
has(TPL, "wc-download", "模板：含 PNG 下载按钮");
has(TPL, "wc-copy", "模板：含复制词频表按钮");
has(TPL, "wc-sample", "模板：含载入示例按钮");
has(TPL, "wc-clear", "模板：含清空按钮");
has(TPL, "wc-reshuffle", "模板：含重新布局按钮");
has(TPL, "wc-max", "模板：含最大词数控制项");
has(TPL, "wc-min", "模板：含最小词频控制项");
has(TPL, "wc-palette", "模板：含配色控制项");
has(TPL, "wc-size", "模板：含画布尺寸控制项");
has(SRC, "复制失败", "JS：复制失败有降级提示文案");
has(SRC, "因空间不足未显示", "JS：放不下的词有计数提示文案");
notHas(TPL, "text-fixed-width", "互链：不含未交付文本定宽换行器");
notHas(TPL, "bug-report", "互链：不含未交付 Bug 报告生成器");

console.log("wordcloud_generator: pass=" + pass + " fail=" + fail);
if (fail > 0) process.exit(1);
