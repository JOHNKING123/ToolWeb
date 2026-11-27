/* 21 个工具页 390px 移动端横向溢出（mobile_overflow_390）回归测试：
 * 19 轮（6 页）＋20 轮（15 页），共 21 页。
 * 19 轮缺陷：390×844 下 documentElement.scrollWidth：markdown-preview 585、
 * json-parser 586、percentage-calc 541、colorblind-simulator 451、base64 430、
 * calendar 403，整页横向滚动、输入区被推出可视区。
 * 根因（真浏览器逐元素定位，本地构建 127.0.0.1:18099，Playwright 1.65.2＋
 * chromium-1248，改前实测与 11-26 巡检数值逐页一致）：
 *  ① markdown-preview／json-parser：@media (max-width:768px) 已把两列 grid
 *     折叠为单列（实测 computed grid-template-columns 为 569.156px／553.844px
 *     单轨），但 .markdown-panel／.json-panel 无 min-width:0，被内部不换行的
 *     flex 头部行（.markdown-header／.json-header，504–569px）撑宽，轨道被
 *     min-content 顶出视口——与首页 17 轮 .tool-card 同一类根因。注意 11-25
 *     开发轮曾称 json-parser「.json-container 两列 grid 未折叠」，本轮实测
 *     证伪：容器已单轨（553.844px）、panel 宽 554px，故修 panel 不修容器。
 *  ② percentage-calc：行内 style="grid-template-columns:1fr auto 1fr" 覆盖了
 *     @media (max-width:640px) 的单列折叠（.pc-field 宽 220px，右缘 541px）。
 *     删行内样式后又暴露第二溢出源：.pc-band-row 四列输入框（number 输入框
 *     min-content 约 220px）在 640px 媒体查询的 2 列下仍把轨道撑到 506px，
 *     故 band 行输入框另加 min-width:0。桌面端三列布局须与改前一致：字面删
 *     行内样式会让桌面端落到 :33 的 1fr 1fr，箭头与第二个输入框掉到第二行，
 *     违背「桌面端布局与改前一致」的验收标准；故两处 grid 改挂 .pc-grid-3
 *     类，三列只在 @media (min-width:641px) 里恢复，移动端仍走单列折叠。
 *  ③ colorblind-simulator：.cb-panel（grid 子项，min-width:auto）被对比度表
 *     的 min-content 撑到 419px；逐个隐藏子树定位：隐藏 .cb-scroll-x／
 *     .cb-table／#cb-contrast-out 任一即收敛到 390，其余子树均不影响。
 *     对比度表本就包在 .cb-scroll-x（overflow-x:auto）里，无需再包一层；
 *     修法为 .cb-panel 加 min-width:0（表在面板内横向滚动）＋.cb-chip 内
 *     code 断行。
 *  ④ base64：.example-btn 内 <small> 为无空格长串 base64（如
 *     aHR0cHM6Ly9leGFtcGxlLmNvbS9wYXRoP3BhcmFtPXZhbHVl），无断行规则，按钮
 *     被撑到 373px、右缘 430px；隐藏 .example-btn 或仅 <small> 即收敛。
 *  ⑤ calendar：仅超 13px，#nextMonth 按钮宽 169px、右缘 403px，头部 prev／
 *     标题／next 一行超宽；隐藏三件套任一即收敛。
 * 19 轮修复（只动 6 个模板的内联 <style>／行内样式与必要最小结构，文案与
 * data-text 一字不动；不动后端、其余模板、static/css/js）：
 *  ① markdown_preview.html：.markdown-panel 加 min-width:0；.markdown-header
 *     加 flex-wrap:wrap＋gap，h3 与 .markdown-header-buttons 加 min-width:0、
 *     按钮组加 flex-wrap:wrap。
 *  ② json_parser.html：.json-panel 加 min-width:0；.json-header 加
 *     flex-wrap:wrap＋gap，h3 加 min-width:0；两处按钮组行内样式加
 *     flex-wrap:wrap＋min-width:0（图标字体未加载时按钮字面文本更宽）。
 *  ③ percentage_calc.html：删 :74／:87 两处行内 grid-template-columns，改挂
 *     .pc-grid-3 类＋@media (min-width:641px) 恢复三列；.pc-band-row
 *     .pc-field／input 加 min-width:0（input 另加 width:100%）。
 *  ④ colorblind_simulator.html：.cb-panel 加 min-width:0；.cb-chip code 加
 *     overflow-wrap:anywhere；对比度表 wrapper 已是 .cb-scroll-x，不另包。
 *  ⑤ base64.html：.example-btn 加 min-width:0／max-width:100%／
 *     overflow-wrap:anywhere，内 <small> 加 overflow-wrap:anywhere。
 *  ⑥ calendar.html：<head> 内补 <style>，.calendar-header 加 flex-wrap:wrap
 *     ＋row-gap，#currentMonth 加 min-width:0。
 * 19 轮开发轮本地实测（2026-11-26，本地构建 127.0.0.1:18099，Playwright 1.65.2＋
 * chromium-1248）：390×844 下 6 页 scrollWidth 均 = 390（改前 585／586／541／
 * 451／430／403），无横向滚动条；1919×1080 下 6 页 scrollWidth 均 = 1919；
 * 桌面端几何与改前一致：percentage-calc 三列 351.6／22.4／351.6px，两组输入
 * 框各自同行（top 355／504），段位输入框 180px×4；markdown 两列 927.5px、
 * json 两列 536px；功能锚点：markdown 输入→预览渲染出 h1＋加粗、
 * json 6 按钮均存在可见＋/tools/api/json/format 200、百分比三组出数
 * （75%→0.75、2/3→66.67%、120→150＝＋25%／＋30、86/100＝B）、色盲对比度表
 * 5 行＋单色卡 4 张＋摘要 245 字、base64 编码 Hello, World!→
 * SGVsbG8sIFdvcmxkIQ== 且解码回填、示例按钮填充、日历 11 月→12 月→10 月
 * 翻页；首页＋9 个已无溢出抽查页 390px 仍为 390；sitemap <loc> 329、
 * Path 328；go build／go vet 通过。
 * 环境说明：VM 代理下 Google Fonts／cdnjs JSONEditor 等外站请求失败
 * （ERR_TUNNEL_CONNECTION_FAILED，改前即有），致图标字面文本渲染、json 页
 * 「JSONEditor is not defined」，均属 VM 环境 artifact；390px 断言以
 * docScrollWidth 为准。反向验证：HEAD 版旧模板跑同一测试 77 过／26 败，
 * 26 项失败恰为本轮新增修复断言（20 项静态）＋6 页 390px scrollWidth 实测值
 * （585／586／541／451／430／403），证明测试能抓住本缺陷、非自证。
 *
 * 20 轮（15 页，第二批；2026-11-27，体验打磨第 20 轮）：
 * 缺陷：390×844 下 scrollWidth：wedding-seating-chart 1219、url-codec 746、
 * bmr-tdee-calc 531、hmac-generator 528、running-pace-calc 526、
 * gzip-base64-decoder 511、triangle-solver 508、invoice-generator 484、
 * prompt-sanitizer 464、json-to-kotlin 455、er-diagram-generator 444、
 * img-target-kb 440、img-resize 434、svg-to-font 401、search-router 399。
 * 根因（真浏览器逐元素定位＋隐藏子树二分，本地构建 127.0.0.1:18099，
 * Playwright 1.65.2＋chromium-1248；改前实测与 11-27 巡检数值逐页一致）：
 *  ① wedding-seating-chart：.seat-work 两列 grid 的两个 grid 项
 *     min-width:auto，右列海报（#seat-poster 内在 1122.5px，经 JS fitPreview
 *     按预览窗缩放显示）经 #seat-preview（overflow:auto，滚动容器 min-content
 *     仍按内容计）→面板→grid 项逐层把 min-content 顶到 1187px，轨道被撑出
 *     视口（.seat-screen 左列同样被撑到 1187px）。左列单独测不溢出（隐藏
 *     #seat-preview 即收敛到 390），驱动只在右列。
 *  ② url-codec：.example-section 内 .example-btn 的 <small> 为无空格长串
 *     （URL 编码结果，如 %7B%27name%27%3A%20%27%E5%BC%A0%E4%B8%89%27…），
 *     按钮 min-content 被撑到 614px（同 19 轮 base64 族）。
 *  ③ bmr-tdee-calc：.bmr-grid 单列轨道被活动系数 select 的最长选项
 *     （min-content 475px）撑宽，全部 .bmr-field 跟着撑到 475px。
 *  ④ hmac-generator：.hmg-out 已有 overflow-x:auto 且 code 已断行、非溢出
 *     源；真源在第 4 张卡片（示例与重置）的 .hmg-note，内含 64 位十六进制
 *     自检摘要 b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7
 *     无断行，段落 scrollWidth 473px、卡片 492px。
 *  ⑤ running-pace-calc：Riegel 卡的 .rpc-cols 行内
 *     style="grid-template-columns:1fr 1fr;" 覆盖了 @media (max-width:720px)
 *     的单列折叠（同 19 轮 percentage-calc 族），两列字段 min-content 各
 *     220px 把页撑到 526px；其余三组字段所在 .rpc-cols 已正常折叠（278px）。
 *  ⑥ gzip-base64-decoder：.gbd-input 已有 word-break:break-all、非溢出源；
 *     真源在 .gbd-steps li 里的示例向量 <code>
 *     H4sIAAAAAAAAA/NIzcnJ11EIyc/PCU9NUuQCAInvfO4QAAAA（425px）。
 *  ⑦ triangle-solver：.ts-grid 在 640px 媒体查询下仍为两列，number 输入框
 *     min-content 各 220px，两列 220＋220＋gap 把页撑到 508px。
 *  ⑧ invoice-generator：.inv-work 两列 grid 在 1100px 下已折叠为单列，但
 *     两个 grid 项（#inv-form／发票纸面外层 div）min-width:auto：表单侧
 *     .inv-grid2 两列字段各 min-content 200px → 452px；纸面侧 .inv-parties
 *     与 11 列 .inv-table 的 min-content 同样约 452px；三者同宽，隐藏任一
 *     均不收敛。行项目表 .inv-items 初始 1 行时 411px 恰好塞进 412px 面板，
 *     但面板收窄到 288px 后表头 nowrap（9 列约 400px）必溢出，故一并包
 *     滚动容器。边缘情形：.inv-foot 用户长备注未包，不在本轮范围。
 *  ⑨ prompt-sanitizer：第 1 个 .ps-panel 内 .ps-note（识别规则段，含
 *     postgres/postgresql/mongodb(+srv)/… 长串）scrollWidth 411px、面板 431px。
 *  ⑩ json-to-kotlin：两处驱动——初始态 .jk-tip code 里
 *     import com.google.gson.annotations.SerializedName（384px，右缘 440px）；
 *     点「填充示例」后输出长行把 .jk-pane（grid 项）撑到 443px，页涨到
 *     499px；.jk-output 本身已有 overflow:auto、非溢出源。
 *  ⑪ er-diagram-generator：TABLE.ed-coltable（7 列）宽 392px，table 自身
 *     overflow-x 无效（同 19 轮 colorblind 教训），须包 wrapper；表在
 *     JS 生成的 .ed-table-block 内（#ed-tables 下共 3 块，首块超宽）。
 *  ⑫ img-target-kb：SELECT#ikb-format 最长选项
 *     「自动（JPG→JPEG / WebP→WebP / PNG→JPEG）」min-content 404px。
 *  ⑬ img-resize：两列 .form-row 行内 .form-group（flex:1）被 number 输入框
 *     min-content（约 170px）撑宽，两组 181＋181＋gap 右缘 434px。
 *  ⑭ svg-to-font：两处驱动——.s2f-tip code 里
 *     rect/circle/ellipse/line/polyline/polygon（349px，右缘 401px）；修后
 *     复测暴露第二源：.s2f-faq dd code 里 /tools/static/vendor/opentype.min.js
 *     （右缘 397px）；.s2f-css 本身已有 overflow:auto、非溢出源。
 *  ⑮ search-router：.sr-main 单列轨道 computed 379.375px，驱动在右面板
 *     .sr-os-steps code 里的 <link rel="search" … href="…xml"> 长串（339px）；
 *     仅 panel 加 min-width:0 不够（code 行内容仍会溢出面板），须双修。
 * 20 轮修复（只动 15 个模板的内联 <style>／行内样式与必要最小结构；不动
 * main.go／mount.go、其余模板、static/css/js、后端、功能文案；不动
 * wedding／invoice 的 @media print 规则；不改 Path 328、sitemap 329）：
 *  ① wedding：.seat-work>* 加 min-width:0（grid 项，生效处）＋.seat-panel
 *     加 min-width:0；#seat-preview 本就是 overflow:auto 滚动容器，不另包。
 *  ② url-codec：.example-section 加 min-width:0；.example-btn 加
 *     min-width:0／max-width:100%／overflow-wrap:anywhere，内 <small> 断行。
 *  ③ bmr：.bmr-field 加 min-width:0，内 number／select 加 min-width:0＋
 *     width:100%（flex 纵列下输入框本就拉伸，桌面端不变）。
 *  ④ hmac：.hmg-note 加 overflow-wrap:anywhere（.hmg-out 滚动容器未动）。
 *  ⑤ running：.rpc-field 加 min-width:0；直接子 input 加 min-width:0＋
 *     width:100%（子代选择器，.rpc-hms input 4.2rem 不受影响）；Riegel
 *     .rpc-cols 删行内两列样式、改挂 .rpc-cols-2 类＋@media (min-width:721px)
 *     恢复两列（同 19 轮 .pc-grid-3 手法，桌面端两列不变）。
 *  ⑥ gzip：.gbd-steps code 加 overflow-wrap:anywhere（.gbd-input 未动）。
 *  ⑦ triangle：.ts-field 加 min-width:0，内 number 加 min-width:0＋width:100%。
 *  ⑧ invoice：.inv-work>* 加 min-width:0；.inv-sheet／.inv-field 加
 *     min-width:0，内 input／select 加 min-width:0（本就有 width:100%）；
 *     .inv-parties／.inv-table／.inv-items 各包一层 .inv-scroll-x
 *     （overflow-x:auto），不改列宽、不压纸面内容宽；print 规则一字未动。
 *  ⑨ prompt：.ps-panel 加 min-width:0，h3 加 flex-wrap:wrap，.ps-note 加断行。
 *  ⑩ json-to-kotlin：.jk-pane 加 min-width:0（示例输出长行不再撑轨道）＋
 *     .jk-tip code 加断行；.jk-output 本就 overflow:auto，未动。
 *  ⑪ er-diagram：.ed-table-block 加 overflow-x:auto（表在 JS 生成的块内，
 *     纯 CSS 包容器，不动 JS／HTML 结构）。
 *  ⑫ img-target-kb：SELECT 加 min-width:0＋max-width:100%——与规格
 *     width:100% 的偏差及理由：width:100% 会把桌面端 select 顶到与 label
 *     分行独占一行（实测行内 label＋select 同行），违背桌面端布局不变；
 *     max-width:100% 同样收敛到 390，桌面端保持 404px（实测）。
 *  ⑬ img-resize：.form-group 加 min-width:0，行内输入框加 min-width:0，
 *     width:100% 只在 @media (max-width:640px) 里生效——与规格的偏差及
 *     理由：.form-group 是 block（static/css 规定，不可动），无条件
 *     width:100% 会把桌面端 #width／#height 输入框从 181px 拉宽到整组；
 *     媒体查询内生效则桌面端保持 181px（实测），移动端收敛。
 *  ⑭ svg-to-font：.s2f-tip code 与 .s2f-faq dd code 各加
 *     overflow-wrap:anywhere；.s2f-css 本就 overflow:auto，未动。
 *  ⑮ search-router：.sr-panel 加 min-width:0，h3 加 flex-wrap:wrap，
 *     .sr-os-steps code 加断行。
 * 20 轮开发轮本地实测（2026-11-27，本地构建 127.0.0.1:18099，Playwright
 * 1.65.2＋chromium-1248）：390×844 下 15 页 scrollWidth：14 页 = 390，
 * img-resize 396（VM 字体 artifact，见下）／svg-to-font 初测 397（第二源，
 * 补修后 390）；1919×1080 下 15 页均 = 1919；19 轮 6 页 390px 仍为 390；
 * 首页 390／1919 均无溢出；sitemap <loc> 329、Path 328；go build／go vet 通过。
 * 桌面端几何（1919px，改后实测）：wedding 海报内在宽仍为 1122.5px（JS
 * fitPreview 按预览窗缩放显示：scale 0.508，显示 570px；改前预览窗被 grid
 * 项撑到 1146px 才显示 1:1，页 scrollWidth 2014——显示 1:1 本身就是溢出
 * bug 的症状，缩放适配是 fitPreview 的设计意图；打印 A3 @page 不变）、
 * 预览窗 574px，页 2014→1919；invoice 表单 460px（轨道上限，未动）／纸面
 * 625px；bmr 活动系数 select 368px；triangle 输入框 242px；running Riegel
 * 两列 366.8／366.8px（.rpc-cols-2 恢复生效），时分秒输入框 67px（4.2rem
 * 未动）；img-target-kb select 404px（未动）；img-resize #width 181px
 * （未动）；er-diagram 表 996px；json-to-kotlin 两列 506／506px，示例输出
 * pre scrollWidth 504px（框内滚动，页不溢出）。
 * 功能锚点（390px 下交互后 scrollWidth 均 390）：wedding 示例 40 人→8 桌
 * ／海报 8 卡；url-codec 编码 Hello, World!→Hello%2C+World%21；bmr 示例
 * BMR 1649／TDEE 2556 kcal/天；hmac 密钥 secret＋消息 hello→64 位十六进制
 * 摘要 88aab3ede8d3adf9…（与 Python hmac 库逐字一致）；running 距离 10km＋
 * 时间 50:00→配速 5:00，分段表 10 行；gzip 示例解码→Hello, ToolWeb!、
 * 状态「解码成功」；triangle 示例 3-4-5→SSS 求解结果＋SVG 图；invoice
 * 增加行→2 行，18 位税号 914403001234567890 回填到发票纸面卖方栏；
 * prompt 填 sk- 密钥→检测出 1 条；json-to-kotlin 示例→data class＋
 * import com.google.gson…（点示例后页仍为 390，改前 499）；er-diagram
 * 预设→4 张表＋SVG 图；img-target-kb 4 个格式选项＋开始按钮；img-resize
 * 表单＋宽高输入框；svg-to-font 下载 TTF 按钮＋CSS 预览区；search-router
 * 填入示例→关键词 python asyncio 连接池，6 条搜索链接。
 * 环境说明：img-resize 396 为 VM 字体 artifact（H1 内 <i
 * class="material-icons">photo_size_select_large</i> 字面文本 23 字符，隐藏
 * .material-icons 后即收敛到 390；同巡检 8 页 artifact 同款），真实页面
 * 模式下该页以 MOBILE390_ICONS_HIDDEN_JSON 对照值断言，未设该文件时跳过
 * 该页的真实页面断言（静态断言仍覆盖其修复规则）。wedding 移动端预览窗内
 * 仍有横向滚动条：scaler 布局宽 1122.5px（transform 不改变布局宽），视觉
 * 282px，海报右缘超窗 8px 须滚入；属 fitPreview 缩放的既有特性（预览窗本
 * 就是 overflow:auto），测试轮手工目视复核。反向验证：HEAD 版旧模板跑
 * 同一测试（git stash templates/ 后静态模式）222 过／40 败，40 项失败恰
 * 为 20 轮新增静态断言（19 轮断言全过），证明测试能抓住本缺陷、非自证。
 *
 * 运行：node tests/mobile_overflow_390.test.js
 * 两种模式（自动选择，启动时打印）：
 *  1) 真实页面模式：环境变量 MOBILE390_JSON 指向 Playwright 实测 JSON
 *     （verify20.py 生成，数组项含 slug／viewport／scrollWidth），断言
 *     21 页 390px 与 1919px 下 scrollWidth 均等于视口宽（img-resize 例外，
 *     见上）；另设 MOBILE390_REGRESSION_JSON 指向含 regression390 数组的
 *     JSON（verify20.py 生成）时，断言首页＋19 轮 6 页＋3 个干净页 390px
 *     仍为 390；再设 MOBILE390_ICONS_HIDDEN_JSON 指向含 img-resize 图标
 *     隐藏对照值的 JSON 时，断言该页对照值亦为 390。
 *  2) 静态断言模式（零依赖默认）：只读 21 个模板与 tools/categories.go，
 *     断言每页修复规则均已落盘、其余声明未动、文案与 data-text 一字未改、
 *     Path 总数 328。
 */
"use strict";
var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf-8"); }
var md = read("templates/markdown_preview.html");
var json = read("templates/json_parser.html");
var pc = read("templates/percentage_calc.html");
var cb = read("templates/colorblind_simulator.html");
var b64 = read("templates/base64.html");
var cal = read("templates/calendar.html");
var categories = read("tools/categories.go");

var pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL:", name, extra !== undefined ? "(" + extra + ")" : ""); }
}
function eq(a, b, name) { ok(a === b, name, "期望 " + JSON.stringify(b) + "，实得 " + JSON.stringify(a)); }
function count(h, pat) { var m = h.match(new RegExp(pat, "g")); return m ? m.length : 0; }
/* 取出指定选择器的规则块（不含嵌套；colorblind 页为压缩单行，同样适用） */
function ruleBlock(src, selector) {
  var esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var m = src.match(new RegExp(esc + "\\s*\\{([^}]*)\\}"));
  return m ? m[1] : null;
}

/* ---------- markdown-preview ---------- */
var mdPanel = ruleBlock(md, ".markdown-panel");
var mdHeader = ruleBlock(md, ".markdown-header");
var mdHeaderBtns = ruleBlock(md, ".markdown-header-buttons");
ok(mdPanel !== null, "markdown：.markdown-panel 规则存在");
ok(mdHeader !== null, "markdown：.markdown-header 规则存在");
ok(mdHeaderBtns !== null, "markdown：.markdown-header-buttons 规则存在");
ok(mdPanel && /min-width\s*:\s*0/.test(mdPanel), "markdown：.markdown-panel 含 min-width: 0");
ok(mdHeader && /flex-wrap\s*:\s*wrap/.test(mdHeader), "markdown：.markdown-header 含 flex-wrap: wrap");
ok(mdHeaderBtns && /flex-wrap\s*:\s*wrap/.test(mdHeaderBtns), "markdown：按钮组含 flex-wrap: wrap");
ok(md.indexOf("grid-template-columns: 1fr 1fr") !== -1, "markdown：桌面端两列 grid 规则未动");
ok(md.indexOf("@media (max-width: 768px)") !== -1, "markdown：768px 折叠媒体查询未动");

/* ---------- json-parser（实测：容器已单轨，修 panel 不修容器） ---------- */
var jsonPanel = ruleBlock(json, ".json-panel");
var jsonHeader = ruleBlock(json, ".json-header");
ok(jsonPanel !== null, "json：.json-panel 规则存在");
ok(jsonHeader !== null, "json：.json-header 规则存在");
ok(jsonPanel && /min-width\s*:\s*0/.test(jsonPanel), "json：.json-panel 含 min-width: 0");
ok(jsonHeader && /flex-wrap\s*:\s*wrap/.test(jsonHeader), "json：.json-header 含 flex-wrap: wrap");
ok(json.indexOf("grid-template-columns: 1fr 1fr") !== -1, "json：.json-container 桌面端两列规则未动");
ok(json.indexOf("@media (max-width: 768px)") !== -1 && json.indexOf("grid-template-columns: 1fr;") !== -1,
  "json：768px 折叠媒体查询未动（容器单轨折叠生效，修 panel 不修容器）");
eq(count(json, "flex-wrap: wrap; min-width: 0;"), 2, "json：两处按钮组行内样式均加 flex-wrap: wrap＋min-width: 0");
["formatBtn", "minifyBtn", "demoBtn", "clearBtn", "toggleViewBtn", "copyBtn"].forEach(function (id) {
  ok(json.indexOf('id="' + id + '"') !== -1, "json：6 按钮之一仍在：" + id);
});
ok(json.indexOf("jsoneditor") !== -1, "json：JSONEditor CDN 引用与初始化未动");

/* ---------- percentage-calc ---------- */
eq(count(pc, "grid-template-columns: 1fr auto 1fr"), 1, "percentage：三列规则仅剩 1 处（min-width:641px 媒体查询内，行内 style 已删净）");
eq(count(pc, 'style="grid-template-columns:1fr auto 1fr;"'), 0, "percentage：两处行内 grid-template-columns 已删除");
eq(count(pc, 'class="pc-grid pc-grid-3"'), 2, "percentage：两处 grid 改挂 .pc-grid-3 类");
ok(pc.indexOf("@media (min-width: 641px)") !== -1 && pc.indexOf(".pc-grid-3 { grid-template-columns: 1fr auto 1fr; }") !== -1,
  "percentage：桌面端三列只在 min-width:641px 里恢复（改前布局不变）");
ok(pc.indexOf("@media (max-width: 640px) { .pc-grid { grid-template-columns: 1fr; } }") !== -1,
  "percentage：640px 单列折叠媒体查询未动");
var bandField = ruleBlock(pc, ".pc-band-row .pc-field");
var bandInput = ruleBlock(pc, ".pc-band-row .pc-field input");
ok(bandField && /min-width\s*:\s*0/.test(bandField), "percentage：段位行 .pc-field 含 min-width: 0（第二溢出源）");
ok(bandInput && /min-width\s*:\s*0/.test(bandInput) && /width\s*:\s*100%/.test(bandInput),
  "percentage：段位行 input 含 min-width: 0＋width: 100%");
ok(pc.indexOf(".pc-grid { display: grid; grid-template-columns: 1fr 1fr;") !== -1,
  "percentage：.pc-grid 基础两列规则未动");

/* ---------- colorblind-simulator ---------- */
var cbPanel = ruleBlock(cb, ".cb-panel");
var cbChipCode = ruleBlock(cb, ".cb-chip code");
ok(cbPanel !== null, "colorblind：.cb-panel 规则存在");
ok(cbPanel && /min-width\s*:\s*0/.test(cbPanel), "colorblind：.cb-panel 含 min-width: 0");
ok(cbChipCode && /overflow-wrap\s*:\s*anywhere/.test(cbChipCode), "colorblind：.cb-chip code 含 overflow-wrap: anywhere");
ok(cb.indexOf('<div class="cb-scroll-x"><div id="cb-contrast-out"></div></div>') !== -1,
  "colorblind：对比度表本就包在 .cb-scroll-x 里（无需再包一层）");
ok(cb.indexOf(".cb-table{width:100%") !== -1 && cb.indexOf("white-space:nowrap") !== -1,
  "colorblind：.cb-table 规则与 th/td nowrap 未动");
ok(cb.indexOf("grid-template-columns:1fr") !== -1, "colorblind：.cb-work 单列 grid 未动");

/* ---------- base64 ---------- */
var exBtn = ruleBlock(b64, ".example-btn");
var exSmall = ruleBlock(b64, ".example-btn small");
ok(exBtn !== null, "base64：.example-btn 规则存在");
ok(exBtn && /min-width\s*:\s*0/.test(exBtn), "base64：.example-btn 含 min-width: 0");
ok(exBtn && /max-width\s*:\s*100%/.test(exBtn), "base64：.example-btn 含 max-width: 100%");
ok(exBtn && /overflow-wrap\s*:\s*anywhere/.test(exBtn), "base64：.example-btn 含 overflow-wrap: anywhere");
ok(exSmall && /overflow-wrap\s*:\s*anywhere/.test(exSmall), "base64：.example-btn small 含 overflow-wrap: anywhere");
ok(exBtn && exBtn.indexOf("transition: all 0.2s") !== -1, "base64：.example-btn 原有 transition 未动");
/* data-text 一字不动：8 个示例按钮的 data-text 逐字仍在 */
["Hello, World!", "https://example.com/path?param=value", "用户名:密码",
 "{'name': 'John', 'age': 30}", "SGVsbG8sIFdvcmxkIQ==",
 "aHR0cHM6Ly9leGFtcGxlLmNvbS9wYXRoP3BhcmFtPXZhbHVl",
 "55So5oi35ZCN5a2X77ya5a+G56CB",
 "eydubWFtZSc6ICdKb2huJywgJ2FnZSc6IDMwfQ=="].forEach(function (t) {
  ok(b64.indexOf('data-text="' + t + '"') !== -1, "base64：data-text 一字未改：" + t.slice(0, 24));
});
eq(count(b64, 'class="example-btn"'), 8, "base64：示例按钮仍为 8 个");

/* ---------- calendar ---------- */
ok(cal.indexOf(".calendar-header { flex-wrap: wrap;") !== -1,
  "calendar：模板内联 <style> 含 .calendar-header flex-wrap: wrap");
ok(cal.indexOf('.calendar-header #currentMonth { min-width: 0; }') !== -1,
  "calendar：#currentMonth 含 min-width: 0");
["prevMonth", "nextMonth", "currentMonth"].forEach(function (id) {
  ok(cal.indexOf('id="' + id + '"') !== -1, "calendar：头部三件套仍在：" + id);
});
ok(cal.indexOf('href="/tools/static/css/calendar.css"') !== -1, "calendar：calendar.css 引用未动（不动 static/css）");

/* ---------- 19 轮功能锚点静态存在性 ---------- */
["markdownInput", "previewBtn", "markdownPreview"].forEach(function (id) {
  ok(md.indexOf('id="' + id + '"') !== -1, "锚点：markdown 仍有 #" + id);
});
["pc-pct", "pc-dec", "pc-frac-a", "pc-frac-b", "pc-cr-old", "pc-cr-new",
 "pc-mk-score", "pc-mk-total", "pc-band-a", "pc-band-b", "pc-band-c", "pc-band-d"].forEach(function (id) {
  ok(pc.indexOf('id="' + id + '"') !== -1, "锚点：percentage 仍有 #" + id);
});
["cb-single-text", "cb-palette-text", "cb-contrast-out", "cb-contrast-summary"].forEach(function (id) {
  ok(cb.indexOf('id="' + id + '"') !== -1, "锚点：colorblind 仍有 #" + id);
});
["inputText", "outputText"].forEach(function (id) {
  ok(b64.indexOf('id="' + id + '"') !== -1, "锚点：base64 仍有 #" + id);
});

/* ================= 20 轮：第二批 15 页 ================= */
var seat = read("templates/wedding_seating_chart.html");
var uc = read("templates/url_codec.html");
var bmr = read("templates/bmr_tdee_calc.html");
var hmg = read("templates/hmac_generator.html");
var rpc = read("templates/running_pace_calc.html");
var gbd = read("templates/gzip_base64_decoder.html");
var ts = read("templates/triangle_solver.html");
var inv = read("templates/invoice_generator.html");
var ps = read("templates/prompt_sanitizer.html");
var jk = read("templates/json_to_kotlin.html");
var ed = read("templates/er_diagram_generator.html");
var ikb = read("templates/img_target_kb.html");
var rs = read("templates/img_resize.html");
var s2f = read("templates/svg_to_font.html");
var sr = read("templates/search_router.html");

/* ---------- wedding-seating-chart（grid 项 min-content 撑轨） ---------- */
var seatPanel = ruleBlock(seat, ".seat-panel");
ok(seatPanel !== null, "wedding：.seat-panel 规则存在");
ok(seatPanel && /min-width\s*:\s*0/.test(seatPanel), "wedding：.seat-panel 含 min-width: 0");
ok(seat.indexOf(".seat-work>*{min-width:0}") !== -1,
  "wedding：.seat-work>* 含 min-width: 0（grid 项，生效处；海报 min-content 不再撑轨道）");
ok(seat.indexOf("#seat-preview{background:#6b7280;border-radius:.6rem;overflow:auto;padding:12px}") !== -1,
  "wedding：#seat-preview 本就是 overflow:auto 滚动容器（未动，不另包）");
ok(seat.indexOf("grid-template-columns:minmax(400px,470px) 1fr") !== -1,
  "wedding：桌面端两列 grid 规则未动");
ok(seat.indexOf("@media (max-width:1100px){.seat-work{grid-template-columns:1fr}}") !== -1,
  "wedding：1100px 单列折叠媒体查询未动");
ok(seat.indexOf(".seat-screen{display:none!important}") !== -1,
  "wedding：@media print 规则未动（.seat-screen 打印隐藏仍在）");
ok(seat.indexOf("@page{size:A3 portrait;margin:0}") !== -1, "wedding：打印 @page 规则未动");
["seat-couple1", "seat-guests", "seat-tables", "seat-auto", "seat-print", "seat-size", "seat-poster"].forEach(function (id) {
  ok(seat.indexOf('id="' + id + '"') !== -1, "锚点：wedding 仍有 #" + id);
});

/* ---------- url-codec（示例按钮内长串，同 base64 族） ---------- */
var ucSec = ruleBlock(uc, ".example-section");
var ucBtn = ruleBlock(uc, ".example-btn");
var ucSmall = ruleBlock(uc, ".example-btn small");
ok(ucSec !== null, "url-codec：.example-section 规则存在");
ok(ucSec && /min-width\s*:\s*0/.test(ucSec), "url-codec：.example-section 含 min-width: 0");
ok(ucBtn !== null, "url-codec：.example-btn 规则存在");
ok(ucBtn && /min-width\s*:\s*0/.test(ucBtn), "url-codec：.example-btn 含 min-width: 0");
ok(ucBtn && /max-width\s*:\s*100%/.test(ucBtn), "url-codec：.example-btn 含 max-width: 100%");
ok(ucBtn && /overflow-wrap\s*:\s*anywhere/.test(ucBtn), "url-codec：.example-btn 含 overflow-wrap: anywhere");
ok(ucSmall && /overflow-wrap\s*:\s*anywhere/.test(ucSmall), "url-codec：.example-btn small 含 overflow-wrap: anywhere");
eq(count(uc, 'class="example-btn"'), 8, "url-codec：示例按钮仍为 8 个");
ok(uc.indexOf("grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))") !== -1,
  "url-codec：示例 grid 底数 minmax(280px,1fr) 未动");
ok(uc.indexOf("@media (max-width: 768px)") !== -1, "url-codec：768px 折叠媒体查询未动");
["urlInput", "urlOutput", "encodeBtn", "decodeBtn", "encodeExamples", "decodeExamples"].forEach(function (id) {
  ok(uc.indexOf('id="' + id + '"') !== -1, "锚点：url-codec 仍有 #" + id);
});

/* ---------- bmr-tdee-calc（select 最长选项撑轨道） ---------- */
var bmrField = ruleBlock(bmr, ".bmr-field");
var bmrInput = ruleBlock(bmr, '.bmr-field input[type="number"], .bmr-field select');
ok(bmrField !== null, "bmr：.bmr-field 规则存在");
ok(bmrField && /min-width\s*:\s*0/.test(bmrField), "bmr：.bmr-field 含 min-width: 0");
ok(bmrInput && /min-width\s*:\s*0/.test(bmrInput) && /width\s*:\s*100%/.test(bmrInput),
  "bmr：number／select 含 min-width: 0＋width: 100%");
ok(bmr.indexOf("@media (max-width: 640px) { .bmr-grid { grid-template-columns: 1fr; } }") !== -1,
  "bmr：640px 单列折叠媒体查询未动");
ok(bmr.indexOf("@media (max-width: 640px) { .bmr-plans { grid-template-columns: 1fr; } }") !== -1,
  "bmr：640px 方案单列折叠媒体查询未动");
["bmr-age", "bmr-height", "bmr-weight", "bmr-activity", "bmr-value", "bmr-tdee", "bmr-sample"].forEach(function (id) {
  ok(bmr.indexOf('id="' + id + '"') !== -1, "锚点：bmr 仍有 #" + id);
});

/* ---------- hmac-generator（真源是第 4 卡片的 .hmg-note 长串） ---------- */
var hmgNote = ruleBlock(hmg, ".hmg-note");
var hmgOutCode = ruleBlock(hmg, ".hmg-out code");
ok(hmgNote !== null, "hmac：.hmg-note 规则存在");
ok(hmgNote && /overflow-wrap\s*:\s*anywhere/.test(hmgNote),
  "hmac：.hmg-note 含 overflow-wrap: anywhere（64 位 hex 自检摘要断行）");
ok(hmg.indexOf(".hmg-out{border:1px solid #e5e7eb;border-radius:.6rem;background:#f8fafc;padding:.8rem 1rem;margin-bottom:.7rem;overflow-x:auto}") !== -1,
  "hmac：.hmg-out 滚动容器未动（本就不是溢出源）");
ok(hmgOutCode && /word-break\s*:\s*break-all/.test(hmgOutCode), "hmac：输出 code 的 word-break:break-all 未动");
ok(hmg.indexOf('id="hmg-ex-webhook"') !== -1 && hmg.indexOf("b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7") !== -1,
  "hmac：示例文案与自检摘要一字未改");
["hmg-key", "hmg-message", "hmg-algo", "hmg-hex", "hmg-base64", "hmg-recompute", "hmg-expected"].forEach(function (id) {
  ok(hmg.indexOf('id="' + id + '"') !== -1, "锚点：hmac 仍有 #" + id);
});

/* ---------- running-pace-calc（行内两列覆盖 720px 折叠，同 percentage-calc 族） ---------- */
var rpcField = ruleBlock(rpc, ".rpc-field");
var rpcChildInput = ruleBlock(rpc, '.rpc-field>input[type="number"], .rpc-field>input[type="text"]');
ok(rpcField !== null, "running：.rpc-field 规则存在");
ok(rpcField && /min-width\s*:\s*0/.test(rpcField), "running：.rpc-field 含 min-width: 0");
ok(rpcChildInput && /min-width\s*:\s*0/.test(rpcChildInput) && /width\s*:\s*100%/.test(rpcChildInput),
  "running：直接子 input 含 min-width: 0＋width: 100%（子代选择器）");
eq(count(rpc, 'style="grid-template-columns:1fr 1fr;"'), 0, "running：Riegel 行内两列样式已删除");
eq(count(rpc, 'class="rpc-cols rpc-cols-2"'), 1, "running：Riegel grid 改挂 .rpc-cols-2 类");
ok(rpc.indexOf("@media (min-width: 721px) { .rpc-cols-2 { grid-template-columns: 1fr 1fr; } }") !== -1,
  "running：桌面端两列只在 min-width:721px 里恢复（改前布局不变）");
ok(rpc.indexOf("@media (max-width: 720px) { .rpc-cols { grid-template-columns: 1fr; } }") !== -1,
  "running：720px 单列折叠媒体查询未动");
ok(rpc.indexOf(".rpc-hms input { width: 4.2rem; }") !== -1,
  "running：时分秒输入框 4.2rem 未动（子代选择器未误伤）");
["rpc-dist", "rpc-pace", "rpc-time-h", "rpc-time-m", "rpc-time-s", "rpc-rd1", "rpc-goal-btn", "rpc-splits"].forEach(function (id) {
  ok(rpc.indexOf('id="' + id + '"') !== -1, "锚点：running 仍有 #" + id);
});

/* ---------- gzip-base64-decoder（真源是步骤区示例 code） ---------- */
var gbdStepsCode = ruleBlock(gbd, ".gbd-steps code");
var gbdInput = ruleBlock(gbd, ".gbd-input");
ok(gbdStepsCode && /overflow-wrap\s*:\s*anywhere/.test(gbdStepsCode),
  "gzip：.gbd-steps code 含 overflow-wrap: anywhere（示例向量断行）");
ok(gbdInput && /word-break\s*:\s*break-all/.test(gbdInput), "gzip：.gbd-input 的 word-break:break-all 未动（本就不是溢出源）");
ok(gbd.indexOf("H4sIAAAAAAAAA/NIzcnJ11EIyc/PCU9NUuQCAInvfO4QAAAA") !== -1, "gzip：示例向量文案一字未改");
["gbd-input", "gbd-output", "gbd-decode", "gbd-sample", "gbd-error", "gbd-status"].forEach(function (id) {
  ok(gbd.indexOf('id="' + id + '"') !== -1, "锚点：gzip 仍有 #" + id);
});

/* ---------- triangle-solver（两列 grid＋number 输入框 min-content） ---------- */
var tsField = ruleBlock(ts, ".ts-field");
var tsInput = ruleBlock(ts, '.ts-field input[type="number"]');
ok(tsField !== null, "triangle：.ts-field 规则存在");
ok(tsField && /min-width\s*:\s*0/.test(tsField), "triangle：.ts-field 含 min-width: 0");
ok(tsInput && /min-width\s*:\s*0/.test(tsInput) && /width\s*:\s*100%/.test(tsInput),
  "triangle：number 输入框含 min-width: 0＋width: 100%");
ok(ts.indexOf("@media (max-width: 640px) { .ts-grid { grid-template-columns: repeat(2, 1fr); } }") !== -1,
  "triangle：640px 两列媒体查询未动");
["ts-a", "ts-b", "ts-c", "ts-result", "ts-sample", "ts-svg", "ts-table"].forEach(function (id) {
  ok(ts.indexOf('id="' + id + '"') !== -1, "锚点：triangle 仍有 #" + id);
});

/* ---------- invoice-generator（grid 项＋三处滚动容器包装） ---------- */
ok(inv.indexOf(".inv-work>*{min-width:0}") !== -1,
  "invoice：.inv-work>* 含 min-width: 0（表单／纸面两个 grid 项）");
var invSheet = ruleBlock(inv, ".inv-sheet");
var invField = ruleBlock(inv, ".inv-field");
var invFieldInput = ruleBlock(inv, ".inv-field input,.inv-field select");
ok(invSheet !== null, "invoice：.inv-sheet 规则存在");
ok(invSheet && /min-width\s*:\s*0/.test(invSheet), "invoice：.inv-sheet 含 min-width: 0");
ok(invField && /min-width\s*:\s*0/.test(invField), "invoice：.inv-field 含 min-width: 0");
ok(invFieldInput && /min-width\s*:\s*0/.test(invFieldInput), "invoice：表单 input／select 含 min-width: 0（本就有 width:100%）");
ok(inv.indexOf(".inv-scroll-x{overflow-x:auto}") !== -1, "invoice：.inv-scroll-x 滚动容器类存在");
eq(count(inv, 'class="inv-scroll-x"'), 3, "invoice：三处滚动容器包装（行项目表／买卖双方／发票表）");
ok(inv.indexOf(".inv-parties{display:grid;grid-template-columns:1fr 1fr;") !== -1,
  "invoice：买卖双方两列 grid 未动（只包容器，不改列宽）");
ok(inv.indexOf(".inv-table{width:100%;border-collapse:collapse;") !== -1, "invoice：发票表规则未动（只包容器）");
ok(inv.indexOf("@media (max-width:1100px){.inv-work{grid-template-columns:1fr}}") !== -1,
  "invoice：1100px 单列折叠媒体查询未动");
ok(inv.indexOf("#inv-sheet{position:absolute;left:0;top:0;width:100%;") !== -1,
  "invoice：@media print 规则未动（纸面 absolute＋width:100% 仍在）");
ok(inv.indexOf("@page{size:A4;margin:12mm}") !== -1, "invoice：打印 @page 规则未动");
["inv-seller-tax", "inv-buyer-tax", "inv-rows", "inv-add-row", "inv-print", "inv-pv-total", "inv-pv-total-cn", "inv-sheet"].forEach(function (id) {
  ok(inv.indexOf('id="' + id + '"') !== -1, "锚点：invoice 仍有 #" + id);
});

/* ---------- prompt-sanitizer（识别规则段长串） ---------- */
var psPanel = ruleBlock(ps, ".ps-panel");
var psH3 = ruleBlock(ps, ".ps-panel h3");
var psNote = ruleBlock(ps, ".ps-note");
ok(psPanel !== null, "prompt：.ps-panel 规则存在");
ok(psPanel && /min-width\s*:\s*0/.test(psPanel), "prompt：.ps-panel 含 min-width: 0");
ok(psH3 && /flex-wrap\s*:\s*wrap/.test(psH3), "prompt：.ps-panel h3 含 flex-wrap: wrap");
ok(psNote && /overflow-wrap\s*:\s*anywhere/.test(psNote), "prompt：.ps-note 含 overflow-wrap: anywhere（识别规则段断行）");
ok(ps.indexOf("word-break:break-all") !== -1, "prompt：.ps-val 的 word-break:break-all 未动");
["ps-input", "ps-detect", "ps-list", "ps-copy", "ps-answer", "ps-count"].forEach(function (id) {
  ok(ps.indexOf('id="' + id + '"') !== -1, "锚点：prompt 仍有 #" + id);
});

/* ---------- json-to-kotlin（提示区 code＋示例输出撑 pane） ---------- */
ok(jk.indexOf(".jk-pane{min-width:0}") !== -1,
  "jk：.jk-pane 含 min-width: 0（示例输出长行不再撑轨道，改前点示例后 499）");
var jkTipCode = ruleBlock(jk, ".jk-tip code");
ok(jkTipCode && /overflow-wrap\s*:\s*anywhere/.test(jkTipCode),
  "jk：.jk-tip code 含 overflow-wrap: anywhere（import 长行断行）");
ok(jk.indexOf("overflow:auto;white-space:pre") !== -1,
  "jk：.jk-output 本就 overflow:auto（未动，不另包）");
ok(jk.indexOf("@media (max-width:768px){") !== -1 && jk.indexOf(".jk-layout{grid-template-columns:1fr}") !== -1,
  "jk：768px 单列折叠媒体查询未动");
ok(jk.indexOf('import com.google.gson.annotations.SerializedName') !== -1, "jk：提示文案 import 行一字未改");
["jk-input", "jk-output", "jk-sample", "jk-copy", "jk-download", "jk-format"].forEach(function (id) {
  ok(jk.indexOf('id="' + id + '"') !== -1, "锚点：jk 仍有 #" + id);
});

/* ---------- er-diagram-generator（表格包滚动容器） ---------- */
var edBlock = ruleBlock(ed, ".ed-table-block");
ok(edBlock !== null, "er-diagram：.ed-table-block 规则存在");
ok(edBlock && /overflow-x\s*:\s*auto/.test(edBlock),
  "er-diagram：.ed-table-block 含 overflow-x: auto（表在 JS 生成的块内，纯 CSS 包容器）");
ok(ed.indexOf(".ed-coltable{width:100%;border-collapse:collapse;") !== -1,
  "er-diagram：表格规则未动（只包容器，不改表）");
ok(ed.indexOf("white-space:pre;overflow:auto;") !== -1, "er-diagram：mermaid 代码区 overflow:auto 未动");
["ed-input", "ed-parse-btn", "ed-preview", "ed-tables", "ed-mermaid-code", "ed-presets"].forEach(function (id) {
  ok(ed.indexOf('id="' + id + '"') !== -1, "锚点：er-diagram 仍有 #" + id);
});

/* ---------- img-target-kb（select 最长选项；max-width 偏差见文件头） ---------- */
var ikbSel = ruleBlock(ikb, ".ikb-select");
ok(ikbSel !== null, "img-target-kb：.ikb-select 规则存在");
ok(ikbSel && /min-width\s*:\s*0/.test(ikbSel), "img-target-kb：SELECT 含 min-width: 0");
ok(ikbSel && /max-width\s*:\s*100%/.test(ikbSel),
  "img-target-kb：SELECT 含 max-width: 100%（不用 width:100%，桌面端保持 404px 不变）");
ok(ikb.indexOf("自动（JPG→JPEG / WebP→WebP / PNG→JPEG）") !== -1, "img-target-kb：最长选项文案一字未改");
ok(ikb.indexOf("@media (max-width: 640px)") !== -1 && ikb.indexOf(".ikb-wrap .container { padding: 1rem; }") !== -1,
  "img-target-kb：640px 容器收窄媒体查询未动");
["ikb-format", "ikb-target", "ikb-run", "ikb-clear", "ikb-result"].forEach(function (id) {
  ok(ikb.indexOf('id="' + id + '"') !== -1, "锚点：img-target-kb 仍有 #" + id);
});

/* ---------- img-resize（flex 行＋number 输入框；width 只在 640px 以下生效） ---------- */
ok(rs.indexOf(".form-group { min-width: 0; }") !== -1, "img-resize：.form-group 含 min-width: 0");
ok(rs.indexOf(".form-row .form-group input { min-width: 0; }") !== -1, "img-resize：行内输入框含 min-width: 0");
ok(rs.indexOf(".form-row .form-group input { width: 100%; box-sizing: border-box; }") !== -1,
  "img-resize：行内输入框 width:100% 只在 640px 媒体查询内（桌面端 #width 保持 181px）");
eq(count(rs, 'style="flex:1;"'), 3, "img-resize：三处行内 flex:1 结构未动");
ok(rs.indexOf("photo_size_select_large") !== -1, "img-resize：标题图标字面文本未动（396 属 VM 字体 artifact）");
["resizeForm", "file", "width", "height", "dpi"].forEach(function (id) {
  ok(rs.indexOf('id="' + id + '"') !== -1, "锚点：img-resize 仍有 #" + id);
});

/* ---------- svg-to-font（两处 code 长串；.s2f-css 本就滚动） ---------- */
var s2fTipCode = ruleBlock(s2f, ".s2f-tip code");
var s2fFaqCode = ruleBlock(s2f, ".s2f-faq dd code");
ok(s2fTipCode && /overflow-wrap\s*:\s*anywhere/.test(s2fTipCode),
  "svg-to-font：.s2f-tip code 含 overflow-wrap: anywhere（形状列表长串断行）");
ok(s2fFaqCode && /overflow-wrap\s*:\s*anywhere/.test(s2fFaqCode),
  "svg-to-font：.s2f-faq dd code 含 overflow-wrap: anywhere（第二源：opentype.min.js 路径）");
ok(s2f.indexOf(".s2f-css{box-sizing:border-box;width:100%;min-height:220px;max-height:420px;overflow:auto;white-space:pre;") !== -1,
  "svg-to-font：.s2f-css 本就 overflow:auto（未动，不另包）");
ok(s2f.indexOf("rect/circle/ellipse/line/polyline/polygon") !== -1, "svg-to-font：形状列表文案一字未改");
["s2f-dl-ttf", "s2f-dl-otf", "s2f-copy-css", "s2f-css"].forEach(function (id) {
  ok(s2f.indexOf('id="' + id + '"') !== -1, "锚点：svg-to-font 仍有 #" + id);
});

/* ---------- search-router（OpenSearch 步骤区 code 长串） ---------- */
var srPanel = ruleBlock(sr, ".sr-panel");
var srH3 = ruleBlock(sr, ".sr-panel h3");
var srOsCode = ruleBlock(sr, ".sr-os-steps code");
ok(srPanel !== null, "search-router：.sr-panel 规则存在");
ok(srPanel && /min-width\s*:\s*0/.test(srPanel), "search-router：.sr-panel 含 min-width: 0");
ok(srH3 && /flex-wrap\s*:\s*wrap/.test(srH3), "search-router：.sr-panel h3 含 flex-wrap: wrap");
ok(srOsCode && /overflow-wrap\s*:\s*anywhere/.test(srOsCode),
  "search-router：.sr-os-steps code 含 overflow-wrap: anywhere（<link …> 长串断行）");
ok(sr.indexOf("@media (max-width: 900px) {") !== -1 && sr.indexOf(".sr-main { grid-template-columns: 1fr; }") !== -1,
  "search-router：900px 单列折叠媒体查询未动");
ok(sr.indexOf("https://www.it-tool.eu.cc/tools/search-router?q=%s") !== -1, "search-router：OpenSearch 网址文案一字未改");
["sr-keyword", "sr-range", "sr-go", "sr-results", "sr-os-xml", "sr-sample"].forEach(function (id) {
  ok(sr.indexOf('id="' + id + '"') !== -1, "锚点：search-router 仍有 #" + id);
});

/* ---------- 全局守卫 ---------- */
eq(count(categories, '"/tools/[^"]+"'), 328, "Path 总数 328 不变");

/* ---------- 真实页面模式 ---------- */
var BEFORE = {"markdown-preview": 585, "json-parser": 586, "percentage-calc": 541,
  "colorblind-simulator": 451, "base64": 430, "calendar": 403,
  "wedding-seating-chart": 1219, "url-codec": 746, "bmr-tdee-calc": 531,
  "hmac-generator": 528, "running-pace-calc": 526, "gzip-base64-decoder": 511,
  "triangle-solver": 508, "invoice-generator": 484, "prompt-sanitizer": 464,
  "json-to-kotlin": 455, "er-diagram-generator": 444, "img-target-kb": 440,
  "img-resize": 434, "svg-to-font": 401, "search-router": 399};
var liveFile = process.env.MOBILE390_JSON || "";
var regFile = process.env.MOBILE390_REGRESSION_JSON || "";
var iconsFile = process.env.MOBILE390_ICONS_HIDDEN_JSON || "";
if (liveFile && fs.existsSync(liveFile)) {
  console.log("模式：真实页面（MOBILE390_JSON）");
  var rows = JSON.parse(fs.readFileSync(liveFile, "utf-8"));
  var slugs = ["markdown-preview", "json-parser", "percentage-calc", "colorblind-simulator", "base64", "calendar",
    "wedding-seating-chart", "url-codec", "bmr-tdee-calc", "hmac-generator", "running-pace-calc",
    "gzip-base64-decoder", "triangle-solver", "invoice-generator", "prompt-sanitizer", "json-to-kotlin",
    "er-diagram-generator", "img-target-kb", "img-resize", "svg-to-font", "search-router"];
  slugs.forEach(function (slug) {
    var r390 = rows.filter(function (r) { return r.slug === slug && r.viewport === 390; })[0];
    var r1919 = rows.filter(function (r) { return r.slug === slug && r.viewport === 1919; })[0];
    ok(r390, "真实页面：390px 实测含 " + slug);
    ok(r1919, "真实页面：1919px 实测含 " + slug);
    if (slug === "img-resize") {
      /* VM 字体 artifact：H1 图标字面文本 photo_size_select_large 在字体未加载时
         把页撑到 396，隐藏 .material-icons 后即 390；此处只断言实测值确为
         artifact 值 396（非回归到 434），严格 390 断言走图标隐藏对照文件。 */
      if (r390) eq(r390.scrollWidth, 396, "真实页面：390px img-resize 实测 396（VM 字体 artifact，改前 434；隐藏图标后 390）");
    } else if (r390) {
      eq(r390.scrollWidth, 390, "真实页面：390px " + slug + " scrollWidth = 390（改前 " + BEFORE[slug] + "）");
    }
    if (r1919) eq(r1919.scrollWidth, 1919, "真实页面：1919px " + slug + " scrollWidth = 1919（桌面端无溢出）");
  });
  /* wedding 桌面端补充：页 scrollWidth 2014→1919（grid 项溢出修掉），海报内在
     1122.5px 不变（JS fitPreview 缩放显示），不在本 JSON 里断言几何，见文件头。 */
} else {
  console.log("模式：静态断言（未设 MOBILE390_JSON；设环境变量可跑真实页面锚点）");
}
if (iconsFile && fs.existsSync(iconsFile)) {
  var iconsHidden = JSON.parse(fs.readFileSync(iconsFile, "utf-8"));
  eq(iconsHidden["img-resize"], 390, "图标隐藏对照：390px img-resize scrollWidth = 390（VM 字体 artifact 排除）");
} else if (liveFile && fs.existsSync(liveFile)) {
  console.log("提示：未设 MOBILE390_ICONS_HIDDEN_JSON，img-resize 的 390 严格断言跳过（仅 artifact 值 396 断言）");
}
if (regFile && fs.existsSync(regFile)) {
  var reg = JSON.parse(fs.readFileSync(regFile, "utf-8")).regression390;
  ok(Array.isArray(reg) && reg.length === 10, "回归：实测含首页＋19 轮 6 页＋3 个干净页（共 10 项）");
  (reg || []).forEach(function (r) {
    eq(r.scrollWidth, 390, "回归：390px " + r.slug + " 仍无溢出");
  });
}

console.log("mobile_overflow_390: pass=" + pass + " fail=" + fail);
process.exit(fail ? 1 : 0);
