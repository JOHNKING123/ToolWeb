/* 首页横向溢出（homepage_overflow）回归测试：
 * 缺陷：1919px 桌面首页 documentElement.scrollWidth=2082（+163px 横向滚动条）、
 * 390px 移动端整页 952px 宽，移动端首页基本不可用。
 * 根因（真浏览器逐元素定位）：Shell 命令解释器卡片描述 <p> 里一段约 110 字符、
 * 无空格的斜杠拼接清单（tools/categories.go:846，ls/cd/cp/…/git/docker），
 * 第 5 行行盒宽 888px、卡片 <p> 宽仅 325px；.tool-card 默认 min-width:auto＋
 * overflow:visible（static/css/style.css:183–189），888px 内容溢出卡片→
 * 「开发工具」分类 grid 1707→main 1723→文档 2082；390px 下同一 min-content
 * 把 1fr 单列撑到 936px。另有 4 张卡片描述同样溢出卡片（代码截图美化器 465、
 * CSS 单位换算器 382、robots.txt 校验与测试器 364、JSON Schema 验证器 360）。
 * 修复（只动 static/css/style.css 三处规则，文案一字不动）：
 *  ① .tool-card 加 min-width: 0——grid 子项不再以 min-content 撑大网格轨道
 *  ② .tool-card p 加 overflow-wrap: break-word——无空格长串在卡片内断行
 *  ③ .tool-icon 加 overflow: hidden——图标字体未加载时字面文本不撑宽卡片
 * 另注：巡检轮 BACKLOG 把第 5 张卡片简写为「robots.txt 校验器」，其注册名实为
 * 「robots.txt 校验与测试器」（tools/categories.go:2780），本测试按注册名断言。
 *
 * 运行：node tests/homepage_overflow.test.js
 * 两种模式（自动选择，启动时打印）：
 *  1) 真实页面模式：环境变量 OVERFLOW_1919_JSON／OVERFLOW_390_JSON 指向
 *     Playwright 实测 JSON（workflow workdir 的 overflow_verify.py 生成，
 *     本地构建跑 127.0.0.1:18099，含 viewportWidth／docScrollWidth／
 *     hasHScrollbar 与 5 张卡片的 scrollWidth／clientWidth），HOMEPAGE_HTML／
 *     SEARCH_JSON_HTML／SITEMAP_XML 指向本地服务抓回的真实页面时，跑全部
 *     数值锚点（双视口 scrollWidth 等于视口宽、无横向滚动条、5 张卡片双视口
 *     均不溢出；首页 19 分类、卡片 630＝热门 6＋分类 327＋新工具 297、title
 *     不变；搜索页 q=json 卡片 356＝结果 29＋分类 327、计数文案在；sitemap
 *     <loc> 329、Path 328 不变）。
 *  2) 静态断言模式（零依赖默认）：只读 static/css/style.css 与
 *     tools/categories.go，断言三条规则均已落盘、其余声明未动、Shell 描述
 *     文案一字未改、Path 总数 328。
 * 开发轮本地实测（2026-11-24，本地构建 127.0.0.1:18099，Playwright 1.65.2＋
 * chromium-1248）：1919×1080 scrollWidth=1919（改前 2082）、390×844
 * scrollWidth=390（改前 952），双视口均无横向滚动条；5 张卡片双视口
 * scrollWidth＝clientWidth（1919px 卡片 373／p 325；390px 卡片 358／p 310）；
 * 首页 200（891,294B）、19 分类、卡片 630；搜索页 q=json 200、卡片 356；
 * sitemap <loc> 329、Path 328；go build／go vet 通过。回退验证：临时撤下
 * 三行 CSS 后同一探针复现 1919px 2082／390px 952，确认测试能区分回归。
 * 环境说明：VM 代理下 Google Fonts／gtag／百度统计 3 个外站请求失败
 * （ERR_TUNNEL_CONNECTION_FAILED，改前即有），致 390px 下 .tool-icon 内
 * <i> 以字面图标名渲染、其 rect 超出视口，但 .tool-icon overflow:hidden
 * 已将其视觉裁剪、文档 scrollWidth 仍为 390；真实浏览器加载到图标字体后
 * <i> 仅约 32px 宽，无此现象。故 390px 断言以 docScrollWidth 为准，不以
 * 元素 rect 是否越界为准。
 */
"use strict";
var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var css = fs.readFileSync(path.join(ROOT, "static/css/style.css"), "utf-8");
var categories = fs.readFileSync(path.join(ROOT, "tools/categories.go"), "utf-8");

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name, extra !== undefined ? "(" + extra + ")" : ""); }
}
function eq(a, b, name) { ok(a === b, name, "期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a)); }
function count(h, pat) { var m = h.match(new RegExp(pat, "g")); return m ? m.length : 0; }
/* 取出指定选择器的规则块（不含嵌套，style.css 三处均为平铺规则） */
function ruleBlock(selector) {
  var m = css.match(new RegExp(selector.replace(/\./g, "\\.") + "\\s*\\{([^}]*)\\}"));
  return m ? m[1] : null;
}

/* 已知溢出卡片（注册名，以 tools/categories.go 为准） */
var OVERFLOW_CARDS = ["Shell 命令解释器", "代码截图美化器", "CSS 单位换算器", "robots.txt 校验与测试器", "JSON Schema 验证器"];
var HOME_TITLE = "程序员工具箱 - 免费在线开发工具集合 | JSON格式化、Base64编码、正则测试";
var SHELL_LONG_RUN = "ls/cd/cp/mv/rm/mkdir/cat/grep/find/sed/awk/tar/curl/wget/ssh/scp/rsync/chmod/chown/ps/kill/systemctl/journalctl/git/docker";

/* ---------- 源码静态断言（两种模式共用） ---------- */
var toolCard = ruleBlock(".tool-card");
var toolCardP = ruleBlock(".tool-card p");
var toolIcon = ruleBlock(".tool-icon");
ok(toolCard !== null, ".tool-card 规则存在");
ok(toolCardP !== null, ".tool-card p 规则存在");
ok(toolIcon !== null, ".tool-icon 规则存在");
ok(toolCard && /min-width\s*:\s*0/.test(toolCard), ".tool-card 含 min-width: 0（grid 子项不以 min-content 撑轨道）");
ok(toolCardP && /overflow-wrap\s*:\s*break-word/.test(toolCardP), ".tool-card p 含 overflow-wrap: break-word（无空格长串卡片内断行）");
ok(toolIcon && /overflow\s*:\s*hidden/.test(toolIcon), ".tool-icon 含 overflow: hidden（图标字面文本不撑宽卡片）");
/* 其余声明未动：三处规则的原有声明逐项仍在 */
ok(toolCard && toolCard.indexOf("border-radius: 0.75rem") !== -1 && toolCard.indexOf("transition: transform 0.2s, box-shadow 0.2s") !== -1,
  ".tool-card 原有声明未动（圆角、hover 过渡）");
ok(toolIcon && toolIcon.indexOf("display: flex") !== -1 && toolIcon.indexOf("margin-bottom: 1rem") !== -1,
  ".tool-icon 原有声明未动（flex 布局、下边距）");
ok(toolCardP && toolCardP.indexOf("color: #6b7280") !== -1 && toolCardP.indexOf("margin-bottom: 1rem") !== -1,
  ".tool-card p 原有声明未动（颜色、下边距）");
/* min-width: 0 全文共 2 处：.tool-info（:529，既有）＋ .tool-card（:189，本轮新增） */
eq(count(css, "min-width\\s*:\\s*0"), 2, "min-width: 0 全文共 2 处（既有 .tool-info＋新增 .tool-card）");
eq(count(css, "overflow-wrap\\s*:\\s*break-word"), 1, "overflow-wrap: break-word 全文恰为 1 处（只加在 .tool-card p）");
/* 描述文案一字不动：溢出源长串仍在 categories.go:846 附近 */
ok(categories.indexOf(SHELL_LONG_RUN) !== -1, "Shell 描述长串一字未改（溢出由 CSS 断行解决，不改文案）");
eq(count(categories, '"/tools/[^"]+"'), 328, "Path 总数 328 不变");
OVERFLOW_CARDS.forEach(function (name) {
  ok(categories.indexOf('Name:        "' + name + '"') !== -1, "5 张溢出卡片之一注册在案：" + name);
});

/* ---------- 真实页面模式：环境变量指向实测 JSON／抓回的 HTML ---------- */
var env = {
  w1919: process.env.OVERFLOW_1919_JSON || "",
  w390: process.env.OVERFLOW_390_JSON || "",
  home: process.env.HOMEPAGE_HTML || "",
  searchJson: process.env.SEARCH_JSON_HTML || "",
  sitemap: process.env.SITEMAP_XML || ""
};
var liveKeys = Object.keys(env).filter(function (k) { return env[k] && fs.existsSync(env[k]); });
if (liveKeys.length > 0) {
  console.log("模式：真实页面（" + liveKeys.join("、") + "）");
  var viewports = { w1919: 1919, w390: 390 };
  ["w1919", "w390"].forEach(function (key) {
    if (!env[key]) return;
    var m = JSON.parse(fs.readFileSync(env[key], "utf-8"));
    var vw = viewports[key];
    eq(m.viewportWidth, vw, key + "：实测视口宽 " + vw);
    eq(m.docScrollWidth, vw, key + "：scrollWidth 等于视口宽（改前 1919px 为 2082、390px 为 952）");
    eq(m.hasHScrollbar, false, key + "：无横向滚动条");
    eq(m.status, 200, key + "：首页 200");
    ok(Array.isArray(m.cards) && m.cards.length === 5, key + "：5 张已知溢出卡片均已测量");
    m.cards.forEach(function (c) {
      eq(c.found, true, key + "：卡片已找到——" + c.name);
      eq(c.overflowsCard, false, key + "：卡片描述不溢出卡片——" + c.name + "（p scrollWidth " + c.pScrollWidth + "＝clientWidth " + c.pClientWidth + "）");
      ok(c.cardRectWidth <= vw, key + "：卡片宽 ≤ 视口宽——" + c.name + "（" + c.cardRectWidth + "px）");
    });
  });
  if (env.home) {
    var h = fs.readFileSync(env.home, "utf-8");
    var title = (h.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
    eq(title, HOME_TITLE, "首页：title 与改前逐字相同");
    eq(count(h, 'class="category"'), 19, "首页：19 个分类");
    eq(count(h, 'class="tool-card"'), 630, "首页：卡片总数 630（热门 6＋分类 327＋新工具 297）");
    var sectionCards = function (id) {
      var s = h.match(new RegExp('<section id="' + id + '"[\\s\\S]*?</section>'));
      return s ? count(s[0], 'class="tool-card"') : -1;
    };
    eq(sectionCards("popular"), 6, "首页：热门区 6 张卡");
    eq(sectionCards("all"), 327, "首页：分类区 327 张卡");
    eq(sectionCards("new-tools"), 297, "首页：「新工具」区 297 张卡");
  }
  if (env.searchJson) {
    var j = fs.readFileSync(env.searchJson, "utf-8");
    eq(count(j, 'class="tool-card"'), 356, "搜索页 q=json：卡片 356（结果 29＋分类 327）");
    ok(j.indexOf('为 "json" 找到 29 个结果') !== -1, '搜索页 q=json：计数文案「为 "json" 找到 29 个结果」');
    eq(count(j, 'class="category"'), 19, "搜索页 q=json：19 个分类");
  }
  if (env.sitemap) {
    var s = fs.readFileSync(env.sitemap, "utf-8");
    eq(count(s, "<loc>"), 329, "sitemap <loc> 329 不变");
  }
} else {
  console.log("模式：静态断言（未设 OVERFLOW_*_JSON／HOMEPAGE_HTML／SEARCH_JSON_HTML／SITEMAP_XML；设环境变量可跑真实页面锚点）");
}

console.log("homepage_overflow: pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
