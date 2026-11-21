/* 首页页脚链接（homepage_footer）回归测试：
 * 缺陷：页脚「意见反馈」「联系我们」为 href="#" 死链（templates/index.html:309-310），
 * 点击无任何反应。
 * 修复：「意见反馈」改为 GitHub Issues 外链（新窗口打开），「联系我们」整行删除
 * （不贴私人 QQ 邮箱、不改 mailto、不留空链）。
 *
 * 运行：node tests/homepage_footer.test.js
 * 零依赖：只做 templates/index.html 源码静态断言。
 */
"use strict";
var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var indexHtml = fs.readFileSync(path.join(ROOT, "templates/index.html"), "utf-8");

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name, extra !== undefined ? "(" + extra + ")" : ""); }
}
function count(sub) { return indexHtml.split(sub).length - 1; }

/* ---------- 本轮锚点 ---------- */
// 首页不再有任何 href="#" 裸死链（改前恰 2 处，均在页脚）
ok(count('href="#"') === 0, "templates/index.html 无 href=\"#\" 死链", "实得 " + count('href="#"') + " 处");
// 「意见反馈」指向 GitHub Issues，且新窗口打开
ok(indexHtml.indexOf('href="https://github.com/JOHNKING123/ToolWeb/issues"') !== -1,
  "「意见反馈」href 为 GitHub Issues 地址");
ok(indexHtml.indexOf('<a href="https://github.com/JOHNKING123/ToolWeb/issues" target="_blank" rel="noopener noreferrer"') !== -1,
  "「意见反馈」含 target=\"_blank\" 与 rel=\"noopener noreferrer\"");
ok(indexHtml.indexOf('<a href="https://github.com/JOHNKING123/ToolWeb/issues" target="_blank" rel="noopener noreferrer" style="color:#666;text-decoration:none;">意见反馈</a>') !== -1,
  "「意见反馈」保留原行内 style");
// 「联系我们」文案已消失
ok(count("联系我们") === 0, "页脚「联系我们」文案已删除", "实得 " + count("联系我们") + " 处");

/* ---------- 反向守卫：页脚其余结构不动 ---------- */
ok(indexHtml.indexOf('<a href="/sitemap.xml" style="color:#666;text-decoration:none;">网站地图</a>') !== -1,
  "页脚「网站地图」链未动");
ok(indexHtml.indexOf('<a href="/robots.txt" style="color:#666;text-decoration:none;">Robots</a>') !== -1,
  "页脚「Robots」链未动");
ok(indexHtml.indexOf('<footer class="footer">') !== -1, "页脚 footer 结构未动");
ok(indexHtml.indexOf("&copy; 2025 程序员工具箱") !== -1, "页脚版权文案未动");
// 全站其余 8 处 href="#"（JS 驱动的下载／动态链接）不在本轮范围，不在此断言。

console.log("homepage_footer: pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
