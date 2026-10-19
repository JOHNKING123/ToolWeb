## 今日任务（2026-10-19 15:40 · 产品经理决策轮 ✅）

**交付状态**：待前端开发轮交付。10-19 排期决策轮（15:00 第三十二轮研究之后）。robots.txt 生成器已交付闭环（13:40 PM 决策轮立项→开发交付 8faeeef；`grep tools/categories.go` 确认 ID `robots_txt_generator`、Path `/tools/robots-txt-generator` 已注册，全量 **103 Path**），候选池划出。本轮立项**今日唯一任务：代码压缩器（Code Minifier）**。

**选定：代码压缩器（/tools/code-minifier）** — 本轮唯一任务：
- **确定性优先**：纯前端自研压缩引擎，零外部请求、零依赖、无 CORS/跨域变量，一轮交付确定性 100%。这是 13:40 轮 PM 决策确立的"纯度"标准（robots.txt 胜出 YouTube 缩略图下载器即因后者下载链路有 CORS 不确定性）。
- **顺位与叙事**：27 轮新晋候选，Varkido 10-01 Dev 套装单列同套装唯一缺口——本轮交付后该套装形态在本站完备；与 regex_tester、json_parser、js_formatter、cron-parser 等「开发工具」家族互链，站点受众契合度最高。
- **痛点真实**：开发者需要无上传的 JS/CSS 压缩（去注释去空白+压缩率展示），现有在线方案多带广告或要求上传服务器；本地处理不出浏览器，符合本站"不出浏览器"口径。
- **午后节奏**：今日已连交付两轮（JSON Schema 验证器 11:42 中难度、robots.txt 13:40 小难度），本轮 15:40 午后轮次，小难度工具最合适一轮高质量交付。
- **去重实锤**：本轮实测 `grep tools/categories.go`（103 Path 全量）——`minif/代码压缩/minify/代码压缩器` 全零命中。

**规格**：
1. JS 压缩：自研轻量压缩引擎（零依赖，无第三方库）：去除单行 `//` 与多行 `/* */` 注释（字符串/正则字面量内不误删），去除冗余空白（保留必要的分隔空格，如 `return x` 中的空格）；两种模式——「强压缩」（尽量压成一行）、「轻压缩」（保留换行便于调试）。
2. CSS 压缩：去注释、去空白（保留 `div p` 选择器必要空格），压缩颜色值（`#ffffff`→`#fff`、`#ff0000`→`#f00`），省略零值单位（`0px`→`0`）。
3. 压缩率展示：原体积 / 压缩后体积 / 压缩率（百分比）/ 节省字节数，字节数人类可读（B/KB）。
4. 压缩前后对照：输入与结果并排（或标签页切换），输入即实时压缩；一键复制压缩结果；Blob 下载（文件名 `code.min.js` / `style.min.css`，按输入类型自动后缀）。
5. 中文错误处理：空输入/非法输入给出中文提示，不崩。
6. 纯前端、零 CDN 依赖、无后端调用、无外部请求；响应式，桌面端优先、移动端可用。
7. 注册：`tools/categories.go`「开发工具」品类新增工具 ID `code_minifier`、Name「代码压缩器」、Path `/tools/code-minifier`（New: true），中英文描述 + SEO keywords（代码压缩器、JS 压缩、CSS 压缩、代码体积优化、JavaScript 压缩、CSS minify、code minifier、javascript minify、css minifier、代码压缩率）。

**验收标准**：
- [ ] `/tools/code-minifier` 可开（200）
- [ ] JS 示例压缩：注释与冗余空白去除且语义不变（压缩前后等价性抽查：node 桩或浏览器 console 对比执行结果一致）
- [ ] CSS 示例压缩：`#ffffff`→`#fff`、`0px`→`0`、注释去除
- [ ] 压缩率数字准确（压缩率 = (原体积 − 压缩后体积) / 原体积 × 100%），原体积/后体积/压缩率三件齐全
- [ ] 空输入给出中文提示，不崩
- [ ] 复制按钮可用；下载文件名按类型为 `code.min.js` / `style.min.css`，内容与结果框一致
- [ ] DevTools Network 抽查无后端调用、无 CDN 依赖、无外部请求
- [ ] `categories.go` 注册完成（开发工具品类，New: true），首页/导航/sitemap 生效
- [ ] 移动端可操作（输入+压缩+复制/下载）
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/code_minifier.html`（新建：输入区+模式切换（JS/CSS 自动识别或手动切）+压缩率面板+对照视图+复制/下载，纯前端）、`static/js/code_minifier.js`（新建：JS/CSS 压缩引擎+压缩率统计+复制/下载逻辑，零依赖）、`tools/categories.go`（开发工具品类+工具注册）、`BACKLOG.md`（本小节）。

**未选**：
- YouTube 缩略图下载器（P1；27 轮新晋，研究轮顺位第一）：i.ytimg.com 直链预览无问题，但核心功能"点击下载"需 fetch→blob 下载，其 CORS 响应头尚未经测试轮抽查验证——13:40 轮 PM 决策已因同一原因将其让位给 robots.txt，无新验证前不承诺核心功能，保持留池，待测试轮做 i.ytimg.com CORS 抽查后再立项。
- 邮件签名生成器（P1；本轮新晋，MailSig 形态验证）：同样小难度纯前端，但富文本复制（ClipboardItem）跨浏览器行为需 QA 逐一踩坑；开发工具家族叙事不如代码压缩器完整，顺位顺延留池。
- 文件夹对比（P1；PM 07:41 明确留待上午轮从容交付，留待明晨大轮次）。
- Markdown 转 Word（P1；中难度，留待后续上午轮从容交付）。
- 音频合并器（P1；音频品类连续感知留 PM 定序，顺延）；浏览器屏幕录制器（P1，中难度，上午大轮次）；EPUB 电子书阅读器（P1，中难度，上午大轮次）；SQLite 数据库查看器（P1，中难度，上午大轮次）；OFD 阅读与转 PDF（P1，中-大，上午大轮次）；视频抽帧（P1，中难度，上午轮次）；SRT 字幕编辑器（P1，顺位顺延）；日期加减/日期差（P1 观察）；报价单/收据生成器（P1，用户方向下顺位不提前）；SVG 转 React JSX（P1 观察）；屏幕常亮工具（P1，留池）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；年假拼假优化器（新观察，用户方向下不扩展）；创意涂鸦画板（P2 新观察）；白噪音发生器（P2 观察）；番茄钟（P2 观察）；Kanban 看板（P2 观察）；倒计时器（P2 观察）；在线钢琴（P2 观察）；TTS 文本转语音朗读器（P2 观察）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察）；重复词查找器（P2 观察）；DNS 传播检查（P2 观察）；cURL 转请求代码（P2 观察）；域名生成器（观察，低优先）；浏览器实时听写（P1 观察）等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）成功（origin/muse/dev-20260929 与本地 HEAD 一致）；`git log` 确认开发交付 8faeeef（robots.txt 生成器）；`grep tools/categories.go` 全量 103 Path，`robots_txt_generator` ID 与 `/tools/robots-txt-generator` Path 已注册（营销工具品类，营销工具三件套完备）；新候选 ID `code_minifier`、Path `/tools/code-minifier` 与 103 Path 无重叠（`minif/代码压缩/minify/代码压缩器` 关键词核对全零命中）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---


> 维护人：产品调研员 · 每日更新（2026-10-19 15:00 第三十二轮研究）

> 维护人：产品经理 · 每日排期（2026-10-19 13:40 排期轮）
> 维护人：产品经理 · 每日排期（2026-10-19 15:40 排期轮）

## 今日任务（2026-10-19 15:00 · 产品调研员研究轮 ✅）

**交付状态**：10-19 通用调研第三十二轮（WPS 特别方向 10-09~10-15 已结束；用户方向修正 2026-10-18 持续有效：聚焦 ToolWeb 工具本身，不扩展泛财务/生活计算器）。robots.txt 生成器已交付闭环（13:40 PM 决策轮立项→开发交付 8faeeef；`grep tools/categories.go` 确认 ID `robots_txt_generator`、Path `/tools/robots-txt-generator` 已注册，全量 **103 Path**），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）；15:00 午后轮次，小难度候选优先。

**本轮四件事**（15:00 全网调研，通用方向）：
1. robots.txt 生成器交付确认：`git log` 确认开发交付 8faeeef（规则组编辑器+Sitemap/Crawl-delay+实时预览+四模板+复制/Blob 下载，纯前端零外部请求；SEO 三件套完备，营销工具品类）；`git fetch`（GIT_SSH_COMMAND 指定密钥）成功（origin/muse/dev-20260929 与本地 HEAD 一致）；`grep` 全量 103 Path（102+1），`robots_txt_generator` ID 与 `/tools/robots-txt-generator` Path 已注册；候选池划出，已实现清单追加（delta：+ robots.txt 生成器）。
2. 新晋候选：**邮件签名生成器（HTML Email Signature Generator）**。需求证据：① dev.to goodyuanbo 2026-09-09（20+ 隐私优先浏览器工具，单文件 anti-SaaS 路线）单列 **MailSig — generates clean HTML email signatures**，与 ToolWeb 纯前端口径同族；② 痛点真实：专业 HTML 邮件签名（姓名/职位/公司/电话/微信/头像/网站）在 Gmail/Outlook/QQ 邮箱跨客户端渲染靠 table 内联样式手写最稳，现有中文生成器多为注册墙/付费/排版丑陋；③ 纯前端小难度：表单输入（姓名/职位/公司/电话/邮箱/微信/网站/头像可选）→邮件客户端安全 HTML（table+内联样式）实时预览→一键复制富文本粘贴进 Gmail/Outlook→3~4 套模板（简洁/商务/极简/双语），零后端零依赖。去重：103 Path `mail_signature/邮件签名/MailSig` 全零命中（「mail」仅命中 text_masker 描述中「邮箱」一词，与本工具无关；「签名」仅命中 PDF 电子签名/RSA 签名）。SEO：邮件签名生成器、邮箱签名制作、HTML 邮件签名、email signature generator。求职/职场家族：与 resume_checker 简历检查器互链。建议 ID `mail_signature_generator`、Path `/tools/mail-signature-generator`。
3. 去重消化（不单立）：① dev.to md_shohan_102187760726951 2026-10-13（10 浏览器工具清单）——Time Zone Converter（仓库已有 timezone_converter 多城市时区对比）、Date Add/Subtract（P1 观察 日期加减/日期差已有）、Countdown Timer（P2 观察 倒计时器已有）、Image Annotator（仓库已有 image_annotator 图片标注：箭头/矩形/文字/马赛克/PNG 导出）、Speech to Text（P1 观察 浏览器实时听写已有）/Text to Speech（P2 观察 TTS 文本转语音朗读器已有）；② HN Show HN ChartFromText（粘贴 key-value 文本→饼/柱/折线→PNG 下载，纯前端）——仓库已有 chart_generator 在线图表生成器（CSV/TSV/Excel 粘贴→柱状/折线/饼/环形，自绘 SVG 零依赖→PNG 导出），输入形态差异不构成单独立项；③ HN Show HN 开源 PDF 涂抹工具（浏览器手动涂黑+AI 自动识别，AI 部分需后端付费）——手动涂黑部分仓库已有 pdf_annotate PDF 批注打码（涂抹打码/荧光笔高亮，合同证件发前处理），不单立；④ HN Show HN PTO holiday optimizer（年假+法定假日拼长假最优解）——纯前端单页技术可行（节假日数据表内嵌），但属泛生活计算器，用户方向修正（2026-10-18）下不扩展，归档观察；⑤ HN Site Spy（网页元素变化监控→RSS/推送）——需后端定时抓取+通知流水线，非单页纯前端口径，不立项；⑥ V2EX 本轮无新单页信号；⑦ 榜单类复述（1024toolkit 45 工具/dev.to 45 tiny tools：finance/engineering/health/dev，dev 类仓库已全覆盖，其余泛计算类不合用户方向）无新形态。
4. 候选池维护：robots.txt 生成器划出（已实现 +1，全量 103 Path）；新晋 邮件签名生成器 P1（MailSig 形态验证+103 Path 无重叠，职场/求职家族，小难度，午后轮次节奏调节位）；顺位更新——文件夹对比（P1，PM 07:41 明确留待上午轮从容交付，仍为上午大轮次第一候补）、Markdown 转 Word（P1，上午大轮次候补）、YouTube 缩略图下载器（P1 小难度，27 轮新晋，i.ytimg.com 四档分辨率直链，顺位顺延）、代码压缩器（P1 小难度，27 轮新晋，Varkido Dev 套装唯一缺口，开发工具家族互链，顺位顺延）；其余顺位不变——浏览器屏幕录制器/EPUB 电子书阅读器/SQLite 数据库查看器/OFD 阅读与转 PDF/视频抽帧（中-大难度，上午轮次候补）；音频合并器（音频品类连续感知留 PM 定序）；SRT 字幕编辑器/日期加减/报价单/屏幕常亮（P1 留池）；浏览器实时听写（P1 观察）；金额大写转换器（节奏调节位）；白噪音发生器/番茄钟/Kanban/倒计时/在线钢琴/TTS/MP3 标签/贴纸/重复词/DNS 传播/cURL 转代码/创意涂鸦画板（P2 观察）；年会大屏抽奖（时令预热）；域名生成器（观察，低优先）；年假拼假优化器（新观察：用户方向下不扩展）。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进；15:00 午后轮次，小难度优先）：

1. **YouTube 缩略图下载器（YouTube Thumbnail Downloader）** — P1（顺位递进到位：27 轮新晋→28 轮顺位第三→29 轮顺位第二→30/31 轮顺位第二/三→本轮第一；i.ytimg.com 四档分辨率（default/mqdefault/hqdefault/sddefault/maxresdefault）直链形态验证；纯前端小难度：粘贴视频 URL/ID→解析 11 位 videoId→四档预览→点击下载（a[download]，跨域 CORS 抽查由测试轮覆盖）；与 og_card_preview、serp_snippet_preview SEO/社交家族互链；103 Path 缩略图/thumbnail/youtube 零命中（「缩略图」仅命中 og_card_preview 描述，与本工具无关）；午后小难度节奏调节位）。
2. **代码压缩器（Code Minifier）** — P1（27 轮新晋，Varkido 10-01 Dev 套装单列同套装唯一缺口，开发工具家族互链：regex_tester/json_parser/js_formatter 等；纯前端小难度：自研轻量压缩引擎（JS/CSS 去注释去空白+安全压缩比展示+压缩率统计）零依赖，本地处理不出浏览器；103 Path minif/代码压缩 零命中；午后小难度节奏调节位）。
3. **邮件签名生成器（HTML Email Signature Generator）** — P1（本轮新晋：dev.to goodyuanbo 2026-09-09 MailSig 形态验证，单文件 anti-SaaS 路线与 ToolWeb 纯前端口径同族；痛点真实：跨客户端渲染安全的 table+内联样式 HTML 签名手写门槛高，中文单页无注册墙形态稀缺；纯前端小难度：表单→实时预览→复制富文本粘贴 Gmail/Outlook，3~4 套模板；103 Path mail_signature/邮件签名/MailSig 零命中；与 resume_checker 求职家族互链；SEO：邮件签名生成器、邮箱签名制作、HTML 邮件签名）。

文件夹对比（P1；上午大轮次第一候补，PM 07:41 留待上午轮从容交付）；Markdown 转 Word（P1；上午大轮次候补，DocForge 形态验证+markdown_to_excel 技术路线验证）；浏览器屏幕录制器（P1，中难度，上午大轮次候补）；EPUB 电子书阅读器（P1，中难度，上午大轮次）；SQLite 数据库查看器（P1，中难度，上午大轮次）；OFD 阅读与转 PDF（P1，中-大，上午大轮次）；视频抽帧（P1，中难度，上午轮次）；音频合并器（P1，26 轮新晋，音频品类连续感知留 PM 定序）；SRT 字幕编辑器（P1，顺位顺延）；日期加减/日期差（P1 观察）；报价单/收据生成器（P1，用户方向下顺位不提前）；SVG 转 React JSX（P1 观察）；屏幕常亮工具（P1，留池）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；年假拼假优化器（新观察，用户方向下不扩展）；创意涂鸦画板（P2 新观察）；白噪音发生器（P2 观察）；番茄钟（P2 观察）；Kanban 看板（P2 观察）；倒计时器（P2 观察）；在线钢琴（P2 观察）；TTS 文本转语音朗读器（P2 观察）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察）；重复词查找器（P2 观察）；DNS 传播检查（P2 观察）；cURL 转请求代码（P2 观察）；域名生成器（观察，低优先）；浏览器实时听写（P1 观察）等其余候选留池。

**通用候选表增量**（第三十二轮：robots.txt 生成器已实现划出；新晋 邮件签名生成器 P1；全量 103 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 邮件签名生成器（HTML Email Signature Generator） | 本轮新晋（dev.to goodyuanbo 2026-09-09「I Built 20+ Privacy-First Browser Tools」单列 MailSig — generates clean HTML email signatures，单文件 anti-SaaS 路线与 ToolWeb 纯前端口径同族；痛点：跨客户端（Gmail/Outlook/QQ 邮箱）渲染安全的 table+内联样式 HTML 签名手写门槛高，现有中文生成器多为注册墙/付费/排版丑；形态：表单（姓名/职位/公司/电话/邮箱/微信/网站/头像可选）→实时预览→一键复制富文本粘贴进 Gmail/Outlook，3~4 套模板（简洁/商务/极简/双语），纯前端零后端；与 resume_checker 求职家族互链；SEO：邮件签名生成器、邮箱签名制作、HTML 邮件签名；103 Path mail_signature/邮件签名/MailSig 全零命中 | 小 | P1（本轮新晋） |

**归档说明**：本轮为 10-19 通用调研第三十二轮——robots.txt 生成器交付闭环（8faeeef，`/tools/robots-txt-generator` 已注册，全量 103 Path，营销工具/SEO 三件套），候选池划出，已实现清单 delta 追加；新信号扫描（dev.to 10-19：md_shohan 10-13 10 工具清单、1024toolkit/45 tiny tools、goodyuanbo 20+ 单文件工具——MailSig 为本轮唯一新单页信号，其余信号均被仓库现有工具（timezone_converter/image_annotator/chart_generator/pdf_annotate）或观察候选（TTS/STT/日期加减/倒计时）去重消化；HN：ChartFromText（chart_generator 去重）、PDF redaction（pdf_annotate 去重）、PTO optimizer（用户方向下归档观察）、Site Spy（需后端不立项）；V2EX 无新单页信号）均已消化；新晋「邮件签名生成器」P1（MailSig 形态验证+103 Path 无重叠，求职家族，小难度，午后轮次节奏调节位）；顺位更新（文件夹对比/Markdown 转 Word 上午大轮次候补、YouTube 缩略图下载器/代码压缩器/邮件签名生成器午后小难度顺位递进）；WPS 候选表保持冻结归档；仓库 103 注册工具全量核对无重叠（Top3 建议 ID youtube_thumbnail_downloader / code_minifier / mail_signature_generator），核稿反馈（立候选前先 grep，中文名+ID 片段双核）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）成功，origin/muse/dev-20260929 与本地 HEAD 一致；`git log` 确认开发交付 8faeeef；`grep tools/categories.go` 全量 103 Path（102+1），`robots_txt_generator` ID 与 `/tools/robots-txt-generator` Path 已注册，Top3 建议 ID（youtube_thumbnail_downloader / code_minifier / mail_signature_generator）与 103 Path 无重叠（`mail_signature/邮件签名/minif/代码压缩/youtube/缩略图/thumbnail` 关键词核对——「mail」仅命中 text_masker 描述中「邮箱」一词，「缩略图」仅命中 og_card_preview 描述，均与本工具无关）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

**交付状态**：待前端开发轮交付。10-19 排期决策轮（13:36 第三十一轮研究之后）。JSON Schema 验证器已交付闭环（11:42 PM 决策轮立项→开发交付 e1a98b7；`grep tools/categories.go` 确认 ID `json_schema_validator`、Path `/tools/json-schema-validator` 已注册（43~46 行），全量 **102 Path**），候选池划出。本轮立项**今日唯一任务：robots.txt 生成器（Robots.txt Generator）**。

**选定：robots.txt 生成器（/tools/robots-txt-generator）** — 本轮唯一任务：
- **尊重 PM 定序**：PM 07:41 轮明确「文件夹对比留待后续上午轮从容交付」（File System Access API Chrome/Edge 限定 + Firefox 降级提示，QA 面重），13:36 研究轮已照此把文件夹对比列为上午大轮次候补，本轮理应不挤占。
- **午后节奏调节**：本轮为午后轮次，今日已连交付五轮（含 11:42 中难度的 JSON Schema 验证器），小难度工具最合适一轮高质量交付。
- **SEO 家族三连完备**：营销工具品类已有 serp_snippet_preview、og_card_preview 交付佐证，robots.txt 生成器补上「搜索引擎友好三件套」的最后一块，与两者互链，品类叙事闭环。
- **痛点真实**：站长手写 robots.txt 规则（User-agent/Allow/Disallow/Sitemap/Crawl-delay）易出错、缩进与指令大小写常踩坑，可视化拼装+实时预览是真实刚需。
- **纯前端最纯**：零外部请求、零后端调用，比 YouTube 缩略图下载器（需加载 i.ytimg.com 外链图片、跨域下载有 CORS 不确定性）更符合「不出浏览器」口径。
- **去重实锤**：本轮实测 `grep tools/categories.go`（102 Path 全量）——`robots/robots.txt/robots_txt` 全零命中。

**规格**：
1. 规则组编辑器：多个 User-agent 规则组可增删；每组含 User-agent 列表（默认 `*`）、Allow/Disallow 路径行（增删行，Disallow 默认 `/`）。
2. 全局项：Crawl-delay 数值输入（秒）、Sitemap URL 列表（增删行）。
3. 实时预览：左侧拼装、右侧实时生成 robots.txt 文本（纯前端字符串拼接，输入即更新）。
4. 常用模板一键加载：「允许全部抓取」「禁止全部抓取」「仅允许主流搜索引擎」「屏蔽后台/管理路径」。
5. 基础校验：User-agent 为空提示、路径必须以 `/` 开头、Sitemap 须为完整 URL，中文化的内联提示不阻断。
6. 一键复制 + 下载 robots.txt 文件（Blob 下载，文件名固定 `robots.txt`）。
7. 纯前端、零 CDN 依赖、无后端调用、无外部请求；响应式，桌面端优先、移动端可用。
8. 注册：`tools/categories.go`「营销工具」品类新增工具 ID `robots_txt_generator`、Name「robots.txt 生成器」、Path `/tools/robots-txt-generator`（New: true），中英文描述 + SEO keywords（robots.txt 生成器、robots.txt 生成、robots.txt 规则、爬虫协议生成、robots txt generator、robots.txt 文件下载、搜索引擎收录设置）。

**验收标准**：
- [ ] `/tools/robots-txt-generator` 可开（200）
- [ ] 多 User-agent 规则组 + Allow/Disallow/Sitemap/Crawl-delay 拼装输出文本格式正确（指令顺序：User-agent → Allow/Disallow → Crawl-delay → Sitemap）
- [ ] 四个模板一键加载输出符合预期
- [ ] 非法输入（空 User-agent、路径缺前导 `/`、Sitemap 非 URL）给出中文提示，不崩
- [ ] 复制按钮可用；下载文件名为 `robots.txt`，内容与预览一致
- [ ] DevTools Network 抽查无后端调用、无 CDN 依赖、无外部请求
- [ ] `categories.go` 注册完成（营销工具品类，New: true），首页/导航/sitemap 生效
- [ ] 移动端可操作（增删组/行+预览+复制/下载）
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/robots_txt_generator.html`（新建：规则组编辑器+Sitemap/Crawl-delay 区+实时预览+模板按钮+复制/下载，纯前端）、`static/js/robots_txt_generator.js`（新建：规则模型管理+文本拼接生成+模板+校验+复制/下载逻辑，零依赖）、`tools/categories.go`（营销工具品类+工具注册）、`BACKLOG.md`（本小节）。

**未选**：
- 文件夹对比（P1；28 轮新晋，BuildDiff 10-09 形态验证；PM 07:41 明确「留待后续上午轮从容交付」，留待明晨大轮次）。
- Markdown 转 Word（P1；31 轮新晋，DocForge 形态验证+markdown_to_excel 技术路线验证；中难度，留待后续上午轮从容交付）。
- YouTube 缩略图下载器（P1；27 轮新晋，i.ytimg.com 四档分辨率直链；跨域图片下载存在 CORS 不确定性，纯度低于本轮候选，顺位顺延留池）。
- 代码压缩器（P1；27 轮新晋，Varkido Dev 套装单列同套装唯一缺口；开发工具家族互链，顺位顺延留池）。
- 音频合并器（P1；26 轮新晋，与 audio_trimmer 同技术栈；音频品类连续感知留 PM 定序，顺延）；浏览器屏幕录制器（P1，中难度，上午大轮次）；EPUB 电子书阅读器（P1，中难度，上午大轮次）；SQLite 数据库查看器（P1，中难度，上午大轮次）；OFD 阅读与转 PDF（P1，中-大，上午大轮次）；视频抽帧（P1，中难度，上午轮次）；SRT 字幕编辑器（P1，顺位顺延）；日期加减/日期差（P1 观察）；报价单/收据生成器（P1，用户方向下顺位不提前）；SVG 转 React JSX（P1 观察）；屏幕常亮工具（P1，留池）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；创意涂鸦画板（P2 新观察）；白噪音发生器（P2 观察）；番茄钟（P2 观察）；Kanban 看板（P2 观察）；倒计时器（P2 观察）；在线钢琴（P2 观察）；TTS 文本转语音朗读器（P2 观察）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察）；重复词查找器（P2 观察）；DNS 传播检查（P2 观察）；cURL 转请求代码（P2 观察）；域名生成器（观察，低优先）等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）成功（VM 换机丢 known_hosts 已按 TOOLS.md 自动补录 github.com，重试即通，历史已知）；`git log` 确认开发交付 e1a98b7（JSON Schema 验证器）；`grep tools/categories.go` 全量 102 Path，`json_schema_validator` ID 与 `/tools/json-schema-validator` Path 已注册（43~46 行，划入已实现）；新候选 ID `robots_txt_generator`、Path `/tools/robots-txt-generator` 与 102 Path 无重叠（`robots/robots.txt/robots_txt` 零命中）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` 与 `toolweb`（构建产物，历史已知无关项，本轮未动）。

---

## 今日任务（2026-10-19 13:36 · 产品调研员研究轮 ✅）

**交付状态**：10-19 通用调研第三十一轮（WPS 特别方向 10-09~10-15 已结束；用户方向修正 2026-10-18 持续有效：聚焦 ToolWeb 工具本身，不扩展泛财务/生活计算器）。JSON Schema 验证器已交付闭环（11:42 PM 决策轮立项→开发交付 e1a98b7；`grep tools/categories.go` 确认 ID `json_schema_validator`、Path `/tools/json-schema-validator` 已注册（43~46 行），全量 **102 Path**），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）；13:36 午后轮次，中难度候选可排。

**本轮四件事**（13:36 全网调研，通用方向）：
1. JSON Schema 验证器交付确认：`git log` 确认开发交付 e1a98b7（自研 draft-07 核心子集校验引擎：type/properties/required/items/enum/pattern/format 全覆盖，错误定位到 JSON Path 与行列，输入即实时校验，纯前端零后端；templates/json_schema_validator.html（13KB）+ static/js/json_schema_validator.js（34KB）落盘确认）；`git fetch`（GIT_SSH_COMMAND 指定密钥）成功（origin/muse/dev-20260929 与本地 HEAD 一致）；`grep` 全量 102 Path（101+1），`json_schema_validator` ID 与 `/tools/json-schema-validator` Path 已注册；候选池划出，已实现清单追加（delta：+ JSON Schema 验证器）。
2. 新晋候选：**Markdown 转 Word（Markdown to Word .docx）**。需求证据三重：① dev.to jigsawlabs 2026-10-16 DocForge 发布帖（「What If We Gave the Browser a Small Brain?」）形态验证——「paste text (or Markdown), pick a template, and it assembles a finished Word document — cover page, styled headings, tables, even rendered diagrams — entirely inside your browser tab…nothing is transmitted」，即粘贴 Markdown/文本→选模板→浏览器内拼装成品 Word 文档，零上传；② 技术路线验证：仓库已有 markdown_to_excel（手写 XLSX writer + fflate ZIP 纯浏览器）交付先例，DOCX 同为 ZIP 包裹 XML（word/document.xml + [Content_Types].xml + _rels），可复用手写 ZIP + 模板化 XML 的路线，零 CDN 依赖符合铁律；③ 用户方向契合：文档导出类工具（简历检查器/报价单都在 PDF/文档家族），AI 写完稿→转 Word 排版导出为高频需求，中文单页形态稀缺。可行性：纯前端中难度——粘贴 Markdown→渲染解析→套样式模板（标题/表格/列表/代码块）→手写 OOXML 生成 .docx→下载；与 markdown_preview、markdown_to_excel、pdf-to-word 文档家族互链。去重：102 Path `markdown_to_word/markdown-to-word/转 Word` 全零命中（「转 Word」仅命中 pdf-to-word 名称，与本工具不同源格式）。SEO：Markdown 转 Word、Markdown 生成 Word 文档、md 转 docx。在「文档工具」品类叙事完备。建议 ID `markdown_to_word`、Path `/tools/markdown-to-word`。
3. 顺位更新：① **文件夹对比（Folder Diff）**——28 轮新晋（BuildDiff 10-09 形态验证），30 轮已升第二候补；PM 07:41 明确「留待后续上午轮从容交付」，本轮 13:36 午后轮次，中难度可排但从容度让位于小难度候选，尊重 PM 定序；② robots.txt 生成器/YouTube 缩略图下载器/代码压缩器（27 轮新晋，小难度，顺位顺延，午后轮次节奏调节位）。
4. 候选池维护：JSON Schema 验证器划出（已实现 +1，全量 102 Path）；新晋 Markdown 转 Word P1（文档家族）；其余候选顺位不变——文件夹对比（P1，上午大轮次候补）；robots.txt 生成器/YouTube 缩略图下载器/代码压缩器（P1 小难度顺位顺延）；音频合并器（音频品类连续感知留 PM 定序）；浏览器屏幕录制器/EPUB 阅读器/SQLite 查看器/OFD/视频抽帧（中-大难度，上午轮次候补）；SRT 字幕编辑器/日期加减/报价单/屏幕常亮等 P1 留池。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进；13:36 午后轮次，中难度可排）：

1. **文件夹对比（Folder Diff）** — P1（顺位递进到位：28 轮新晋→29 轮顺位第二→30 轮顺位第二→本轮第一；dev.to dev5942-b 2026-10-09 BuildDiff 发布帖形态验证，递归对比+新增/删除/修改/未变四态报告+本地隐私口径；桌面 Beyond Compare 付费方案的免费替代；纯前端中难度：File System Access API 双目录选择→Web Crypto SHA-256 流式哈希比对→差异树渲染+报告下载；Chrome/Edge，Firefox 降级提示；102 Path folder/文件夹对比/builddiff 零命中，与 text-diff 文本对比不重叠）。
2. **robots.txt 生成器（Robots.txt Generator）** — P1（27 轮新晋：Varkido 10-01 SEO 套装单列，同套装 SERP/OG 已交付家族佐证；SEO 工具旅程线与 serp_snippet_preview、og_card_preview 互链；纯前端小难度：可视化规则拼装（User-agent/Allow/Disallow/Sitemap/Crawl-delay）→实时预览→复制/下载；102 Path robots 零命中；午后小难度节奏调节位）。
3. **YouTube 缩略图下载器（YouTube Thumbnail Downloader）** — P1（27 轮新晋：i.ytimg.com 四档分辨率直链；纯前端小难度；与 og_card_preview、serp_snippet_preview SEO/社交家族互链；102 Path 缩略图/thumbnail 零命中——仅 og_card_preview 描述中出现「缩略图」一词，与本工具无关；顺位顺延递进到位）。

Markdown 转 Word（P1；本轮新晋，中难度，文档家族与 markdown_to_excel 互链，适合上午大轮次从容交付；本轮 13:36 午后轮次中难度亦可排，留 PM 定序）；代码压缩器（P1；27 轮新晋，Varkido Dev 套装单列同套装唯一缺口，开发工具家族互链，纯前端小难度，顺位顺延）；浏览器屏幕录制器（P1，中难度，上午大轮次候补）；SRT 字幕编辑器（P1，顺位顺延）；EPUB 电子书阅读器（P1，中难度，上午大轮次）；SQLite 数据库查看器（P1，中难度，上午大轮次）；OFD 阅读与转 PDF（P1，中-大，上午大轮次）；视频抽帧（P1，中难度，上午轮次）；音频合并器（P1，26 轮新晋，音频品类连续感知留 PM 定序）；日期加减/日期差（P1 观察）；报价单/收据生成器（P1，用户方向下顺位不提前）；SVG 转 React JSX（P1 观察）；屏幕常亮工具（P1，留池）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；白噪音发生器（P2 观察）；番茄钟（P2 观察）；Kanban 看板（P2 观察）；倒计时器（P2 观察）；在线钢琴（P2 观察）；TTS 文本转语音朗读器（P2 观察）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察）；重复词查找器（P2 观察）；DNS 传播检查（P2 观察）；cURL 转请求代码（P2 观察）；创意涂鸦画板（P2 观察，30 轮新晋）；域名生成器（观察，低优先）等其余候选留池。

**通用候选表增量**（第三十一轮：JSON Schema 验证器已实现划出；新晋 Markdown 转 Word P1；全量 102 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| Markdown 转 Word（Markdown to Word .docx） | 本轮新晋（dev.to jigsawlabs 2026-10-16 DocForge 发布帖形态验证——「paste text (or Markdown), pick a template, and it assembles a finished Word document — cover page, styled headings, tables, even rendered diagrams — entirely inside your browser tab…nothing is transmitted」，粘贴 Markdown/文本→选模板→浏览器内拼装成品 Word 文档，零上传；仓库已有 markdown_to_excel 手写 XLSX writer+fflate 纯浏览器交付先例，DOCX 同为 ZIP 包裹 XML（word/document.xml+[Content_Types].xml+_rels），可复用手写 ZIP+模板化 XML 路线，零 CDN 依赖；AI 写完稿→转 Word 排版导出为高频需求，中文单页形态稀缺；与 markdown_preview、markdown_to_excel、pdf-to-word 文档家族互链；102 Path markdown_to_word/markdown-to-word/转 Word 全零命中 | 中 | P1（本轮新晋） |

**归档说明**：本轮为 10-19 通用调研第三十一轮——JSON Schema 验证器交付闭环（e1a98b7，`/tools/json-schema-validator` 已注册（43~46 行），全量 102 Path，「格式化工具」品类），候选池划出，已实现清单 delta 追加；新信号扫描（dev.to 10-19：Tooltri「ChatGPT Text Cleaner」仓库已有 ai-text-cleaner 去重实锤、SubnetScope 仓库已有 subnet-calculator 去重实锤、website-launch-checklist 纯清单 App 形态差异化弱不单立、Hacktoberfest LLM Side Hustle 均需本地 LLM 推理不符合纯前端口径、DocForge Markdown→Word 为本轮唯一新单页信号；V2EX/Reddit/HN 均无新单页信号；榜单类复述（techtippr/toptoolai/toolsura/geekskai）均无新形态）均已消化；新晋「Markdown 转 Word」P1（DocForge 形态验证+markdown_to_excel 技术路线验证+102 Path 无重叠，文档家族，中难度，上午大轮次候补）；顺位更新三项（文件夹对比顺位递进第一候补+PM 07:41 留待上午轮从容交付、robots.txt/YouTube 缩略图午后小难度节奏调节位顺位顺延、代码压缩器顺位顺延）；WPS 候选表保持冻结归档；仓库 102 注册工具全量核对无重叠（Top3 建议 ID folder_diff / robots_txt_generator / youtube_thumbnail_downloader；新晋 markdown_to_word），核稿反馈（立候选前先 grep，中文名+ID 片段双核）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）成功，origin/muse/dev-20260929 与本地 HEAD 一致；`git log` 确认开发交付 e1a98b7；`grep tools/categories.go` 全量 102 Path（101+1），`json_schema_validator` ID 与 `/tools/json-schema-validator` Path 已注册（43~46 行，划入已实现），Top3 建议 ID（folder_diff / robots_txt_generator / youtube_thumbnail_downloader）与新晋 ID（markdown_to_word）与 102 Path 无重叠（`markdown_to_word/markdown-to-word/folder/robots/thumbnail/缩略图/minif/代码压缩` 关键词核对——「缩略图」仅命中 og_card_preview 描述，与本工具无关）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-19 11:42 排期轮）

## 今日任务（2026-10-19 11:42 · 产品经理排期决策 ✅）

**交付状态**：待前端开发轮交付。10-19 排期决策轮（11:37 第三十轮研究之后）。图片精确体积压缩器已交付闭环（09:47 PM 决策轮立项→开发交付 7f54c22；`grep tools/categories.go` 确认 ID `img_target_kb`、Path `/tools/img-target-kb` 已注册，全量 **101 Path**），候选池划出。本轮立项**今日唯一任务：JSON Schema 验证器（JSON Schema Validator）**。

**选定：JSON Schema 验证器（/tools/json-schema-validator）** — 本轮唯一任务：
- **顺位递进兑现**：22→29 轮连续八轮顺位第一候补；09:47 PM 排期轮明确「下一上午轮优先」；本轮即该上午轮，理应兑现。
- **证据三重化**：kkp DevTrove 10-13 + pyfiletoolkit 08-08 + Varkido 10-01 三重独立证据；开发者粘贴 JSON 需本地校验 schema 的痛点真实，现有在线方案多上传服务器或带广告，本地隐私口径为核心差异点。
- **家族互链**：与 json_parser/json_yaml/text_diff 开发者工具家族互链，「格式化工具」品类叙事完备。
- **节奏新鲜**：上午两轮为单位换算器、图片精确体积压缩器（通用+图片口径），本工具为开发者工具口径，与两者不重叠。
- **去重实锤**：本轮实测 `grep tools/categories.go`（101 Path 全量）——`json_schema/JSON Schema/folder/文件夹对比/robots` 全零命中（仅 og_card_preview 描述中出现"缩略图"一词，与本工具无关）；现存 JSON 家族（json_parser/json_yaml/csv_json）仅做解析/格式转换，无 schema 校验能力。

**规格**：
1. 双文本编辑区：JSON 实例输入 + Schema 输入（拖拽/粘贴均可），语法错误实时提示。
2. 校验引擎：自研 draft-07 核心子集（type/object/properties/required/array/items/enum/pattern/minLength/maxLength/minimum/maximum/format），零依赖、纯前端本地校验；错误输出 JSON Path（$.a.b[0]）+ 中文错误描述 + 实例行列定位。
3. 交互：输入即实时校验（防抖 300ms）；结果区通过/失败状态横幅 + 错误列表，点击错误条目跳转到实例对应行。
4. 样例一键加载：内置「用户档案」示例 schema + 合法/非法实例一键切换。
5. 纯前端、零 CDN 依赖、无后端调用、无外部请求；响应式，桌面端优先、移动端可用。
6. 注册：`tools/categories.go`「格式化工具」品类新增工具 Name「JSON Schema 验证器」、Path `/tools/json-schema-validator`（New: true），中英文描述 + SEO keywords（JSON Schema 验证、JSON schema 校验、JSON 校验器、json schema validator、schema 本地验证）。

**验收标准**：
- [ ] `/tools/json-schema-validator` 可开（200）
- [ ] 正确 schema + 合法实例 → 通过；非法实例 → 失败并列出全部错误，每条带 JSON Path + 中文描述
- [ ] draft-07 核心关键字覆盖：type/properties/required/items/enum/pattern/minLength/maxLength/minimum/maximum/format
- [ ] 实例或 schema 存在 JSON 语法错误 → 语法错误行列提示，不崩
- [ ] 点击错误条目 → 实例编辑器跳到对应行
- [ ] 样例一键加载可用（合法/非法实例切换）
- [ ] DevTools Network 抽查无后端调用、无 CDN 依赖
- [ ] `categories.go` 注册完成（格式化工具品类，New: true），首页/导航/sitemap 生效
- [ ] 移动端可操作（输入+切换+校验）
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/json_schema_validator.html`（新建：双编辑区+校验状态横幅+错误列表+样例加载，纯前端）、`static/js/json_schema_validator.js`（新建：自研 draft-07 核心子集校验引擎+错误行列定位+实时校验防抖，零依赖）、`tools/categories.go`（格式化工具品类+工具注册）、`BACKLOG.md`（本小节）。

**未选**：
- 文件夹对比（P1；28 轮新晋，BuildDiff 10-09 形态验证；纯前端中难度；PM 07:41 明确「留待后续上午轮从容交付」，留待后续上午轮）。
- robots.txt 生成器（P1；27 轮新晋，Varkido 10-01 SEO 套装单列、同套装 SERP/OG 已交付家族佐证；顺位顺延留池）。
- YouTube 缩略图下载器（P1；27 轮新晋，i.ytimg.com 四档分辨率直链；顺位顺延留池）。
- 代码压缩器（P1；27 轮新晋，Varkido Dev 套装单列同套装唯一缺口；与本轮同开发者工具家族，节奏调节留池）。
- 音频合并器（P1；26 轮新晋，与 audio_trimmer 同技术栈；音频品类连续感知留 PM 定序，顺延）；浏览器屏幕录制器（P1，中难度，上午大轮次）；EPUB 电子书阅读器（P1，中难度，上午大轮次）；SQLite 数据库查看器（P1，中难度，上午大轮次）；OFD 阅读与转 PDF（P1，中-大，上午大轮次）；视频抽帧（P1，中难度，上午轮次）；SRT 字幕编辑器（P1，顺位顺延）；日期加减/日期差（P1 观察）；报价单/收据生成器（P1，用户方向下顺位不提前）；SVG 转 React JSX（P1 观察）；屏幕常亮工具（P1，留池）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；白噪音发生器（P2 观察）；番茄钟（P2 观察）；Kanban 看板（P2 观察）；倒计时器（P2 观察）；在线钢琴（P2 观察）；TTS 文本转语音朗读器（P2 观察）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察）；重复词查找器（P2 观察）；DNS 传播检查（P2 观察）；cURL 转请求代码（P2 观察）；创意涂鸦画板（P2 新观察）；域名生成器（观察，低优先）等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）成功，本地 HEAD e4c4052（30 轮研究）；`git log` 确认开发交付 7f54c22（图片精确体积压缩器）；`grep tools/categories.go` 全量 101 Path，`img_target_kb` ID 与 `/tools/img-target-kb` Path 已注册（划入已实现）；新候选 Name「JSON Schema 验证器」、Path `/tools/json-schema-validator` 与 101 Path 无重叠（`json_schema/JSON Schema` 零命中；「缩略图」仅命中 og_card_preview 描述，与本工具无关）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` 与 `toolweb`（构建产物，历史已知无关项，本轮未动）。

---

## 今日任务（2026-10-19 11:37 · 产品调研员研究轮 ✅）

**交付状态**：10-19 通用调研第三十轮（WPS 特别方向 10-09~10-15 已结束；用户方向修正 2026-10-18 持续有效：聚焦 ToolWeb 工具本身，不扩展泛财务/生活计算器）。图片精确体积压缩器已交付闭环（09:47 PM 决策轮立项→开发交付 7f54c22；`grep tools/categories.go` 确认 ID `img_target_kb`、Path `/tools/img-target-kb` 已注册（407 行），全量 **101 Path**），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）；11:37 上午轮次，中难度候选可排。

**本轮四件事**（11:37 全网调研，通用方向）：
1. 图片精确体积压缩器交付确认：`git log` 确认开发交付 7f54c22（输入目标 KB 一次命中导出，二分质量迭代+尺寸降级兜底，偏差±5%，纯前端零后端；「图片处理」品类；templates/img_target_kb.html + static/js/img_target_kb.js 落盘确认）；`git fetch`（GIT_SSH_COMMAND 指定密钥）成功（换机丢 known_hosts 自动补录 github.com，重试即通，历史已知）；`grep` 全量 101 Path（100+1），ID/Path 已注册；候选池划出，已实现清单追加（delta：+ 图片精确体积压缩器）。
2. 新信号扫描（全网，无新单页可落地信号）：① dev.to lanxk 2026-10-16 md-to Markdown 表格转 Excel（AI 回答粘贴→多表自动分 sheet、手写 XLSX writer+fflate 纯浏览器）——仓库已有 markdown_to_excel（`/tools/markdown-to-excel`，已交付），不单立，去重实锤；② dev.to SuperToolKit 2026-10-16 100+ 工具集（音频/PDF/代码，WASM 本地处理口径）——通用复述，无新单页形态；③ dev.to 10-18/10-19 Hacktoberfest Week2 Side Hustle 提交四连发（QuoteForge/Walk the Block/Quotely/Resume Tailor）——均依赖本地 LLM（Ollama/Gemma）推理，不符合纯前端 local-first 口径，不单立；④ dev.to scraperwatch 10-18（需后端爬虫指标数据）、termstash（Claude Code CLI 插件）——非单页工具形态，不单立；⑤ V2EX 10-19 热门（paint-board 网页创意画板、蓝牙语音遥控 Vibe Coding、BeatBrowser MCP、AI API 中转、夜市模拟器）——画板属涂鸦娱乐重应用形态（在线钢琴 P2 观察先例），其余为 agent/桌面/硬件/游戏形态，无单页新信号；⑥ HN（Ask HN simple tools 系列均旧帖；Who is hiring 解析为爬虫/SaaS 口径）——无新单页信号；⑦ Site Tools Box（laing_lii 2026-10-18 20+ 工具集：JSON Formatter/DNS&Whois/HTTP Status/Bulk Domain RDAP/Password Generator）——JSON/DNS/密码仓库已覆盖，Bulk Domain RDAP 与 HTTP Status 前轮已判（转 VPS 未定/需后端代理）不单立。
3. 顺位更新（不引入新候选）：① **JSON Schema 验证器**——22→29 轮连续递进八轮第一候补（kkp DevTrove 10-13 + pyfiletoolkit 08-08 + Varkido 10-01 三重证据），纯前端中难度：ajv 本地 vendor 或自研 draft-07 核心子集+错误行列定位；11:37 上午轮次可排；② **文件夹对比**——28 轮新晋（BuildDiff 10-09 形态验证），PM 07:41 明确「留待后续上午轮从容交付」；③ robots.txt 生成器/YouTube 缩略图下载器/代码压缩器（27 轮新晋，小难度，顺位顺延，节奏调节位）。
4. 候选池维护：图片精确体积压缩器划出（已实现 +1，全量 101 Path）；其余候选顺位不变——JSON Schema 验证器（第一候补）、文件夹对比（上午大轮次候补）、robots.txt 生成器/YouTube 缩略图下载器/代码压缩器（27 轮新晋顺位顺延）；音频合并器（音频品类连续感知留 PM 定序）；浏览器屏幕录制器/EPUB 阅读器/SQLite 查看器/OFD/视频抽帧（中-大难度，上午轮次候补）；SRT 字幕编辑器/日期加减/报价单/屏幕常亮等 P1 留池。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进；11:37 上午轮次，中难度可排）：

1. **JSON Schema 验证器（JSON Schema Validator）** — P1（顺位第一候补：22→29 轮连续八轮递进；kkp DevTrove 10-13 + pyfiletoolkit 08-08 + Varkido 10-01 三重证据；纯前端中难度：ajv 本地 vendor 或自研 draft-07 核心子集 + 错误行列定位；11:37 上午大轮次可高质量交付；json 工具家族（json_parser/json_yaml/text_diff）互链；101 Path `json_schema`/`JSON Schema` 零命中）。
2. **文件夹对比（Folder Diff）** — P1（28 轮新晋：dev.to dev5942-b 2026-10-09 BuildDiff 发布帖形态验证，递归对比+新增/删除/修改/未变四态报告+本地隐私口径；桌面 Beyond Compare 付费方案的免费替代；纯前端中难度：File System Access API 双目录选择→Web Crypto SHA-256 流式哈希比对→差异树渲染+报告下载；Chrome/Edge，Firefox 降级提示；PM 07:41 明确「留待后续上午轮从容交付」；101 Path folder/文件夹对比/builddiff 零命中，与 text-diff 文本对比不重叠）。
3. **robots.txt 生成器（Robots.txt Generator）** — P1（27 轮新晋：Varkido 10-01 SEO 套装单列，同套装 SERP/OG 已交付家族佐证；SEO 工具旅程线与 serp_snippet_preview、og_card_preview 互链；纯前端小难度：可视化规则拼装（User-agent/Allow/Disallow/Sitemap/Crawl-delay）→实时预览→复制/下载；101 Path robots 零命中；小难度节奏调节位）。

YouTube 缩略图下载器（P1；27 轮新晋，i.ytimg.com 四档分辨率直链，纯前端小难度，顺位顺延）；代码压缩器（P1；27 轮新晋，Varkido Dev 套装单列同套装唯一缺口，开发工具家族互链，纯前端小难度）；浏览器屏幕录制器（P1，中难度，上午大轮次候补）；SRT 字幕编辑器（P1，顺位顺延）；EPUB 电子书阅读器（P1，中难度，上午大轮次）；SQLite 数据库查看器（P1，中难度，上午大轮次）；OFD 阅读与转 PDF（P1，中-大，上午大轮次）；视频抽帧（P1，中难度，上午轮次）；音频合并器（P1，26 轮新晋，音频品类连续三弹感知留 PM 定序）；日期加减/日期差（P1 观察）；报价单/收据生成器（P1，用户方向下顺位不提前）；SVG 转 React JSX（P1 观察）；屏幕常亮工具（P1，留池）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；白噪音发生器（P2 观察）；番茄钟（P2 观察）；Kanban 看板（P2 观察）；倒计时器（P2 观察）；在线钢琴（P2 观察）；TTS 文本转语音朗读器（P2 观察）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察）；重复词查找器（P2 观察）；DNS 传播检查（P2 观察）；cURL 转请求代码（P2 观察）；创意涂鸦画板（P2 新观察，V2EX 10-19 paint-board，GitHub LHRUN/paint-board 网页创意画板形态，重应用涂鸦娱乐口径）；域名生成器（观察，低优先）等其余候选留池。

**通用候选表增量**（第三十轮：图片精确体积压缩器已实现划出；本轮无新单页信号，未立新候选；新观察创意涂鸦画板 P2；全量 101 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 创意涂鸦画板（Paint Board） | 新观察（V2EX 10-19 热门：GitHub LHRUN/paint-board，完全开源免费的网页端创意画板，多种画笔/涂鸦图形/文字图片；涂鸦娱乐重应用形态（在线钢琴 P2 观察先例）；纯前端 Canvas 可实现但非工具刚需口径；101 Path whiteboard/画板/画笔零命中——仅两处 Icon:"draw" 图标占位） | 中 | P2（新观察） |

**归档说明**：本轮为 10-19 通用调研第三十轮——图片精确体积压缩器交付闭环（7f54c22，`/tools/img-target-kb` 已注册（407 行），全量 101 Path，「图片处理」品类），候选池划出，已实现清单 delta 追加；新信号扫描（dev.to md-to Markdown转Excel 仓库已有 markdown_to_excel 去重实锤、SuperToolKit 100+ 通用复述、Hacktoberfest Side Hustle 四连发均需本地 LLM 不单立、scraperwatch/termstash 非单页形态、V2EX 10-19 paint-board 涂鸦娱乐形态其余 agent/桌面/硬件形态、HN 旧帖、Site Tools Box 20+ 工具集前轮已判）均无新单页可落地信号；新观察「创意涂鸦画板」P2（重应用形态）；顺位更新三项（JSON Schema 验证器连续八轮第一候补+上午大轮次可排、文件夹对比留待上午轮从容交付、robots.txt/YouTube 缩略图/代码压缩器小难度节奏调节位）；WPS 候选表保持冻结归档；仓库 101 注册工具全量核对无重叠（Top3 建议 ID json_schema_validator / folder_diff / robots_txt_generator），核稿反馈（立候选前先 grep，中文名+ID 片段双核）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）成功；`git log` 确认开发交付 7f54c22；`grep tools/categories.go` 全量 101 Path（100+1），`img_target_kb` ID 与 `/tools/img-target-kb` Path 已注册（407 行，划入已实现），Top3 建议 ID（json_schema_validator / folder_diff / robots_txt_generator）与 101 Path 无重叠（`json_schema/JSON Schema/folder/文件夹对比/robots/缩略图/minif/代码压缩` 关键词核对）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` 与 `toolweb`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-19 09:47 排期轮）

## 今日任务（2026-10-19 09:47 · 产品经理排期决策 ✅）

**交付状态**：待前端开发轮交付。10-19 排期决策轮（09:36 第二十九轮研究之后）。单位换算器已交付闭环（07:41 PM 决策轮立项→开发交付 59e735f；`grep tools/categories.go` 确认 ID `unit_converter`、Path `/tools/unit-converter` 已注册，全量 **100 Path**），候选池划出。本轮立项**今日唯一任务：图片精确体积压缩器（Compress to Target KB）**。

**选定：图片精确体积压缩器（/tools/img-target-kb）** — 本轮唯一任务：
- **顺位递进兑现**：07:41 PM 排期轮明确「下轮图片节奏冷却后优先立项」；29 轮研究轮确认错峰完毕（favicon 03:39 交付后已隔 base-converter、unit-converter 两轮非图片品类）；连续三轮顺延，今轮理应立项。
- **痛点真实证据强**：证件照/考试报名/公众号/简历附件的「≤X KB」硬限制痛点真实；dev.to mdshamimali 2026-10-18 DodoDeck 发布帖 headline 功能 "exact KB image resizer" 佐证形态。
- **差异化实锤**：现存 `img-compress` 只有通用压缩（无目标体积模式），已实测去重；本工具以「输入目标 KB，一次命中导出」为核心差异点。
- **纯前端小难度**：目标 KB→二分质量迭代+尺寸降级兜底→一次命中导出，纯前端 Canvas 实现，零后端零依赖，一轮可高质量交付。
- **去重实锤**：`grep tools/categories.go`（100 Path 全量）——`img_target_kb/目标体积/精确体积` 全零命中；img 家族（compress/convert/resize/mosaic/retro/stitch/2base64/base64toimg）无目标体积能力。

**规格**：
1. 输入区：拖拽/点击上传图片（jpg/png/webp），显示原图预览 + 原始体积。
2. 目标体积输入：KB 数值输入（如 200），支持常用快捷值（100/200/300/500 KB）。
3. 一次命中：算法优先二分 JPEG/WebP 质量迭代；若最低质量仍超标，自动按比例降级尺寸重编；若目标过大超出原体积上限，给出提示不放大。
4. 结果区：导出图预览 + 实际体积（标注达成/±偏差）、一键下载按钮、再次微调质量滑杆（可选）。
5. 纯前端、零 CDN 依赖、无后端调用、无外部请求；响应式，桌面端优先、移动端可用。
6. 注册：`tools/categories.go`「图片处理」品类新增工具 ID `img_target_kb`、Path `/tools/img-target-kb`（New: true），中英文描述 + SEO keywords（图片压缩到指定大小、图片压缩到固定KB、证件照压缩、compress image to exact KB、图片体积压缩器）。

**验收标准**：
- [ ] `/tools/img-target-kb` 可开（200）
- [ ] 上传 jpg/png 各 1 张，设目标 200KB：导出体积 ≤ 目标且偏差在 5% 以内
- [ ] 目标低于可达下限（如 10KB 超小图）：给出友好提示，不崩不死循环
- [ ] 目标大于原图体积：提示「目标大于原体积」，不放大导出
- [ ] 下载按钮可用，导出文件可正常打开
- [ ] DevTools Network 抽查无后端调用、无 CDN 依赖
- [ ] `categories.go` 注册完成（图片处理品类，New: true），首页/导航/sitemap 生效
- [ ] 移动端可操作（上传+输入+下载）
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/img_target_kb.html`（新建：上传区+目标KB输入+结果预览+下载按钮，纯前端）、`static/js/img_target_kb.js`（新建：二分质量迭代+尺寸降级算法，Canvas 编码，零依赖）、`tools/categories.go`（图片处理品类+工具注册）、`BACKLOG.md`（本小节）。

**未选**：
- JSON Schema 验证器（P1；22→26 轮连续递进第一候补，kkp DevTrove 10-13 + pyfiletoolkit 08-08 + Varkido 10-01 三重证据；与 json_parser/json_yaml 开发者工具家族互链；但图片压缩器顺位更前（PM 07:41 明确承诺），顺位递进：下一上午轮优先）。
- 文件夹对比（P1；28 轮新晋，BuildDiff 10-09 形态验证；纯前端中难度：File System Access API 双目录选择（Chrome/Edge，Firefox 降级提示）→Web Crypto 流式哈希→差异树+报告下载；PM 07:41 明确「留待后续上午轮从容交付」，留待上午轮）。
- robots.txt 生成器（P1；27 轮新晋，Varkido 10-01 SEO 套装单列、同套装 SERP/OG 已交付家族佐证；顺位顺延留池）。
- YouTube 缩略图下载器（P1；27 轮新晋，i.ytimg.com 四档分辨率直链；顺位顺延留池）。
- 代码压缩器（P1；27 轮新晋，Varkido Dev 套装唯一缺口；顺位顺延留池）。
- 音频合并器（P1；26 轮新晋，与 audio_trimmer 同技术栈；音频品类连续感知留 PM 定序，顺延）；浏览器屏幕录制器（P1，中难度，上午大轮次）；EPUB 电子书阅读器（P1，中难度，上午大轮次）；SQLite 数据库查看器（P1，中难度，上午大轮次）；OFD 阅读与转 PDF（P1，中-大，上午大轮次）；视频抽帧（P1，中难度，上午轮次）；SRT 字幕编辑器（P1，顺位顺延）；日期加减/日期差（P1 观察）；报价单/收据生成器（P1，用户方向下顺位不提前）；SVG 转 React JSX（P1 观察）；屏幕常亮工具（P1，留池）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；白噪音发生器（P2 观察）；番茄钟（P2 观察）；Kanban 看板（P2 观察）；倒计时器（P2 观察）；在线钢琴（P2 观察）；TTS 文本转语音朗读器（P2 观察）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察）；重复词查找器（P2 观察）；DNS 传播检查（P2 观察）；cURL 转请求代码（P2 观察）；域名生成器（观察，低优先）等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）成功，本地 HEAD 71eaa6d（29 轮研究）；`git log` 确认开发交付 59e735f（单位换算器）；`grep tools/categories.go` 全量 100 Path，`unit_converter` ID 与 `/tools/unit-converter` Path 已注册（划入已实现）；新候选 ID `img_target_kb`、Path `/tools/img-target-kb` 与 100 Path 无重叠（`img_target_kb/目标体积/精确体积` 零命中，img 家族无目标体积能力）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` 与 `toolweb`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-19 09:36 第二十九轮研究）

## 今日任务（2026-10-19 09:36 · 产品调研员研究轮 ✅）

**交付状态**：10-19 通用调研第二十九轮（WPS 特别方向 10-09~10-15 已结束；用户方向修正 2026-10-18 持续有效：聚焦 ToolWeb 工具本身，不扩展泛财务/生活计算器）。单位换算器已交付闭环（07:41 PM 决策轮立项→开发交付 59e735f；`grep tools/categories.go` 确认 ID `unit_converter`、Path `/tools/unit-converter` 已注册（847/850 行），全量 **100 Path**），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）；09:36 上午轮次，中难度候选可排。

**本轮四件事**（09:36 全网调研，通用方向）：
1. 单位换算器交付确认：`git log` 确认开发交付 59e735f（长度/重量/温度/数据存储四分类 + KB=1000/KiB=1024 双口径开关 + 纯前端实时换算 + 一键复制，「生活工具」品类）；`git fetch`（GIT_SSH_COMMAND 指定密钥）成功（换机丢 known_hosts 自动补录 github.com，重试即通，历史已知）；`grep` 全量 100 Path（99+1），ID/Path 已注册；候选池划出，已实现清单追加（delta：+ 单位换算器）。
2. 新信号扫描（全网，无新单页可落地信号）：① V2EX 每日热点 2026-10-18（v2ex.top）：LayoutKeeper（多屏窗口布局记忆，macOS 桌面 App 形态）、「勿追踪」安卓开源应用（无障碍权限去分享链接追踪参数，移动端 App 形态）、Mac 锁屏 Codex/ChatGPT 离线排查（问题帖非工具）——均非单页纯前端口径，不单立；② HN：Ask HN「simple tools/products/web apps」系列均为 9 天–336 天前旧帖或征集帖（无新实现形态），无新单页信号；③ dev.to「I built」系列复扫：TheTextKit（adilbensied，30 文本工具：行去重/排序、大小写、邮箱/URL 提取、slug 生成）——行去重/排序/字数/大小写仓库 `text_tools` 已覆盖（templates 实核 opDedupe/opSort）、邮箱提取器 P2 在池、`ai_text_cleaner` 已交付、其余为 SIP/EMI/税计算器（用户方向下不扩展），不单立；④ 网址导航类 SEO 文章（Smallpdf/iLovePDF/Remove.bg/Pixlr/TinyPNG/ProcessOn 等）均为已知形态复述，无新单页信号；⑤ PH 本周多为 agent/数字宠物/App 形态，无单页新信号。
3. 顺位更新（不引入新候选）：① **图片精确体积压缩器**——PM 07:41 轮明确「下轮图片节奏冷却后优先立项」；本轮即该下轮（favicon 03:39 交付后已隔 base-converter、unit-converter 两轮非图片品类，错峰完毕）；② **JSON Schema 验证器**——22→26 轮连续递进第一候补（kkp DevTrove 10-13 + pyfiletoolkit 08-08 + Varkido 10-01 三重证据），纯前端中难度，09:36 上午大轮次可排；③ **文件夹对比**——28 轮新晋（BuildDiff 10-09 形态验证），PM 07:41 明确「留待后续上午轮从容交付」，上午轮候选。
4. 候选池维护：单位换算器划出（已实现 +1，全量 100 Path）；其余候选顺位不变——robots.txt 生成器/YouTube 缩略图下载器/代码压缩器（27 轮新晋，顺位顺延）；音频合并器（音频品类连续感知留 PM 定序）；浏览器屏幕录制器/EPUB 阅读器/SQLite 查看器/OFD/视频抽帧（中难度，上午轮次候补）；SRT 字幕编辑器/日期加减/报价单/屏幕常亮等 P1 留池。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进；09:36 上午轮次，中难度可排）：

1. **图片精确体积压缩器（Compress to Target KB）** — P1（PM 07:41 明确「下轮图片节奏冷却后优先立项」；连续三轮顺延兑现顺位；dev.to mdshamimali 2026-10-18 DodoDeck 发布帖 headline 功能 "exact KB image resizer" 佐证；证件照/考试报名/公众号/简历附件的「≤X KB」硬限制痛点真实；img-compress 无目标体积模式已实锤去重；纯前端小难度：目标 KB→二分质量+尺寸降级→一次命中导出；100 Path 无重叠）。
2. **JSON Schema 验证器（JSON Schema Validator）** — P1（顺位第一候补：22→26 轮连续递进；kkp DevTrove 10-13 + pyfiletoolkit 08-08 + Varkido 10-01 三重证据；纯前端中难度：ajv 本地 vendor 或自研 draft-07 核心子集 + 错误行列定位；09:36 上午大轮次可高质量交付；json 工具家族（json_parser/json_yaml/text_diff）互链；100 Path `json_schema`/`JSON Schema` 零命中）。
3. **文件夹对比（Folder Diff）** — P1（28 轮新晋：dev.to dev5942-b 2026-10-09 BuildDiff 发布帖形态验证，递归对比+新增/删除/修改/未变四态报告+本地隐私口径；桌面 Beyond Compare 付费方案的免费替代；纯前端中难度：File System Access API 双目录选择→Web Crypto SHA-256 流式哈希比对→差异树渲染+报告下载；Chrome/Edge，Firefox 降级提示；PM 07:41 明确「留待后续上午轮从容交付」；100 Path folder/文件夹对比/builddiff 零命中，与 text-diff 文本对比不重叠）。

robots.txt 生成器（P1；27 轮新晋，Varkido 10-01 SEO 套装单列，同套装 SERP/OG 已交付家族佐证；纯前端小难度；顺位顺延）；YouTube 缩略图下载器（P1；27 轮新晋，四档分辨率 i.ytimg.com 直链，纯前端小难度；顺位顺延）；代码压缩器（P1；27 轮新晋，Varkido Dev 套装单列同套装唯一缺口，纯前端小难度；顺位顺延）；浏览器屏幕录制器（P1，中难度，上午大轮次候补）；SRT 字幕编辑器（P1，顺位顺延）；EPUB 电子书阅读器（P1，中难度，上午大轮次）；SQLite 数据库查看器（P1，中难度，上午大轮次）；OFD 阅读与转 PDF（P1，中-大，上午大轮次）；视频抽帧（P1，中难度，上午轮次）；音频合并器（P1，26 轮新晋，音频品类连续两弹感知留 PM 定序）；日期加减/日期差（P1 观察）；报价单/收据生成器（P1，用户方向下顺位不提前）；SVG 转 React JSX（P1 观察）；屏幕常亮工具（P1，留池）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；白噪音发生器（P2 观察）；番茄钟（P2 观察）；Kanban 看板（P2 观察）；倒计时器（P2 观察）；在线钢琴（P2 观察）；TTS 文本转语音朗读器（P2 观察）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察）；重复词查找器（P2 观察）；DNS 传播检查（P2 观察）；cURL 转请求代码（P2 观察）；域名生成器（观察，低优先）等其余候选留池。

**通用候选表增量**（第二十九轮：单位换算器已实现划出；本轮无新单页信号，未立新候选；全量 100 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| （本轮无新增候选行） | 新信号扫描（V2EX 10-18 热点桌面/App 形态、HN 旧帖、dev.to「I built」TheTextKit 文本族已覆盖、网址导航 SEO 复述、PH agent/App 形态）均无新单页可落地信号；顺位更新：图片精确体积压缩器（PM 07:41 下轮优先）、JSON Schema 验证器（连续递进第一候补，上午轮可排）、文件夹对比（留待上午轮） | — | — |

**归档说明**：本轮为 10-19 通用调研第二十九轮——单位换算器交付闭环（59e735f，`/tools/unit-converter` 已注册（847/850 行），全量 100 Path，「生活工具」品类），候选池划出，已实现清单 delta 追加；新信号扫描（V2EX 10-18 热点桌面/App 形态、HN 旧帖/征集帖、dev.to TheTextKit 文本族已覆盖、网址导航 SEO 复述、PH 本周 agent/App 形态）均无新单页可落地信号；顺位更新三项（图片精确体积压缩器 PM 07:41 明确下轮优先+连续三轮顺延兑现、JSON Schema 验证器连续递进第一候补+上午大轮次可排、文件夹对比留待上午轮）；WPS 候选表保持冻结归档；仓库 100 注册工具全量核对无重叠（Top3 建议 ID img_target_kb / json_schema_validator / folder_diff），核稿反馈（立候选前先 grep，中文名+ID 片段双核）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）成功；`git log` 确认开发交付 59e735f；`grep tools/categories.go` 全量 100 Path（99+1），`unit_converter` ID 与 `/tools/unit-converter` Path 已注册（847/850 行，划入已实现），Top3 建议 ID（img_target_kb / json_schema_validator / folder_diff）与 100 Path 无重叠（`img_target_kb/目标体积/json_schema/JSON Schema/folder/文件夹对比/builddiff` 关键词核对）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` 与 `toolweb`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-19 07:41 排期轮）

## 今日任务（2026-10-19 07:41 · 产品经理排期决策 ✅）

**交付状态**：待前端开发轮交付。10-19 排期决策轮（07:36 第二十八轮研究之后）。进制转换器已交付闭环（05:45 PM 决策轮立项→开发交付 acb7159；`grep tools/categories.go` 确认 ID `base_converter`、Path `/tools/base-converter` 已注册，全量 **99 Path**），候选池划出。本轮立项**今日唯一任务：单位换算器（Unit Converter）**。

**选定：单位换算器（/tools/unit-converter）** — 本轮唯一任务：
- **证据最新最强**：28 轮研究刚刚证据三重化晋升 P1（dev.to blanzatools 10-11 Unit Converter 单列 + dev.to EverydayToolz 10-12 "File Size Converter: bytes, KB, MB, and GB in binary or decimal" 直接单列 + PH 10-12 file size converter 仓库缺口），三个独立来源、信号新鲜度全场最高。
- **受众最广**：开发/运维（KB=1000 vs KiB=1024 混淆）+ 设计师（长度/重量单位互转）+ 普通用户（温度/日常），SEO 关键词池深（单位换算、KB MB GB 换算、长度换算、重量换算）。
- **差异化**：文件大小二进制/十进制双口径开关（KiB=1024 ↔ KB=1000 一键切换自动重算），竞品形态多只做单一口径。
- **节奏新鲜**：近三轮为音频裁剪器/网站图标生成器/进制转换器，本工具为通用工具口径，与三者不重叠；上午轮本可排中难度的文件夹对比，但其 Chrome/Edge 限定 API + Firefox 降级提示的 QA 面更重，留待后续上午轮从容交付。
- **去重实锤**：本轮实测 `grep tools/categories.go`（99 Path 全量）——`unit_converter/单位换算/文件大小` 全零命中；现存 converter 家族（base64/base_converter、heic/img、timezone、json_yaml、pixel_art、color_orphan 未注册模板）均为格式/编码互转，无度量单位换算能力。

**规格**：
1. 四个分类标签：长度 / 重量 / 温度 / 数据存储；标签切换即时，无页面跳转。
2. 每类统一交互：数值输入框 + 源单位下拉 + 目标单位下拉，输入即实时换算；结果大字展示 + 一键复制按钮。
3. 数据存储类差异化：二进制（KiB=1024）/ 十进制（KB=1000）口径开关，切换自动重算；单位覆盖 bit、B、KB/KiB、MB/MiB、GB/GiB、TB/TiB。
4. 长度：mm、cm、m、km、μm、in、ft、yd、mi；重量：mg、g、kg、t、oz、lb、斤（市斤=500g）；温度：℃、℉、K（公式换算，注意负值与绝对零度校验）。
5. 纯前端、零 CDN 依赖、无后端调用、无外部请求；响应式，桌面端优先、移动端可用。
6. 注册：`tools/categories.go`「生活工具」品类新增工具 ID `unit_converter`、Path `/tools/unit-converter`（New: true），中英文描述 + SEO keywords（单位换算、单位换算器、文件大小换算、KB MB GB 换算、长度换算、重量换算、unit converter）。

**验收标准**：
- [ ] `/tools/unit-converter` 可开（200）
- [ ] 四分类换算正确：长度（mi↔km、in↔cm 抽查）、重量（lb↔kg、斤↔g 抽查）、温度（℃↔℉、K 边界抽查）、数据存储（GB↔MB、GiB↔MiB 抽查）
- [ ] 数据存储双口径开关生效：同一数值在 KB=1000 与 KiB=1024 口径下结果不同且正确
- [ ] 非法输入（空/非数字/温度低于绝对零度）有友好提示，不崩
- [ ] 各结果一键复制可用
- [ ] DevTools Network 抽查无后端调用、无 CDN 依赖
- [ ] `categories.go` 注册完成（生活工具品类，New: true），首页/导航/sitemap 生效
- [ ] 移动端可操作（输入+切换+复制）
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/unit_converter.html`（新建：四分类标签+输入/下拉/结果区+口径开关+复制按钮，纯前端）、`static/js/unit_converter.js`（新建：单位换算表、温度公式、口径切换逻辑、复制逻辑，零依赖）、`tools/categories.go`（生活工具品类+工具注册）、`BACKLOG.md`（本小节）。

**未选**：
- 图片精确体积压缩器（P1；26 轮新晋，DodoDeck 10-18 headline 功能佐证，≤X KB 硬限制痛点真实，img-compress 无目标体积模式实锤去重；连续三轮顺延——与今晨 03:39 刚交付的 favicon（图片上传处理）品类间隔过近，本轮错峰；**下轮图片节奏冷却后优先立项**）。
- 文件夹对比（P1；28 轮新晋，BuildDiff 10-09 形态验证；纯前端中难度：File System Access API 双目录选择（Chrome/Edge，Firefox 降级提示）→Web Crypto 流式哈希→差异树+报告下载；留待后续上午轮从容交付）。
- robots.txt 生成器（P1；27 轮新晋，Varkido 10-01 SEO 套装单列、同套装 SERP/OG 已交付家族佐证；顺位顺延留池）。
- YouTube 缩略图下载器（P1；27 轮新晋，i.ytimg.com 四档分辨率直链；顺位顺延留池）。
- 代码压缩器（P1；27 轮新晋，Varkido Dev 套装唯一缺口；顺位顺延留池）。
- 音频合并器（P1；26 轮新晋，与 audio_trimmer 同技术栈；音频品类连续感知留 PM 定序，顺延）；JSON Schema 验证器（P1，中难度，上午大轮次候补）；浏览器屏幕录制器（P1，中难度，上午大轮次）；EPUB 电子书阅读器（P1，中难度，上午大轮次）；SQLite 数据库查看器（P1，中难度，上午大轮次）；OFD 阅读与转 PDF（P1，中-大，上午大轮次）；视频抽帧（P1，中难度，上午轮次）；SRT 字幕编辑器（P1，顺位顺延）；日期加减/日期差（P1 观察）；报价单/收据生成器（P1，用户方向下顺位不提前）；SVG 转 React JSX（P1 观察）；屏幕常亮工具（P1，留池）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；白噪音发生器（P2 观察）；番茄钟（P2 观察）；Kanban 看板（P2 观察）；倒计时器（P2 观察）；在线钢琴（P2 观察）；TTS 文本转语音朗读器（P2 观察）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察）；重复词查找器（P2 新观察）；DNS 传播检查（P2 新观察，需出网）；cURL 转请求代码（P2 新观察）；域名生成器（观察，低优先）等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）成功，本地 HEAD 43f5540（28 轮研究）；`git log` 确认开发交付 acb7159（进制转换器）；`grep tools/categories.go` 全量 99 Path，`base_converter` ID 与 `/tools/base-converter` Path 已注册（划入已实现）；新候选 ID `unit_converter`、Path `/tools/unit-converter` 与 99 Path 无重叠（`unit_converter/单位换算/文件大小` 零命中）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` 与 `toolweb`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-19 07:36 第二十八轮研究）

## 今日任务（2026-10-19 07:36 · 产品调研员研究轮 ✅）

**交付状态**：10-19 通用调研第二十八轮（WPS 特别方向 10-09~10-15 已结束；用户方向修正 2026-10-18 持续有效：聚焦 ToolWeb 工具本身，不扩展泛财务/生活计算器）。进制转换器已交付闭环（05:45 PM 决策轮立项→开发交付 acb7159；`grep tools/categories.go` 确认 ID `base_converter`、Path `/tools/base-converter` 已注册（250/253 行），全量 **99 Path**），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）；07:36 上午轮次，中难度候选可排。

**本轮四件事**（07:36 全网调研，通用方向）：
1. 进制转换器交付确认：`git log` 确认开发交付 acb7159（2/8/10/16/32 互转+0x/0b/0o 前缀识别+BigInt 大整数精确换算+分组显示+一键复制，纯前端零后端）；`git fetch`（GIT_SSH_COMMAND 指定密钥）成功；`grep` 全量 99 Path（98+1），ID/Path 已注册；候选池划出，已实现清单追加（delta：+ 进制转换器）。
2. 新晋候选：**文件夹对比（Folder Diff）**。需求证据：dev.to dev5942-b 2026-10-09 BuildDiff 发布帖（"compare two folders recursively in your browser"：选两文件夹→递归比对→新增/删除/修改/未变四态报告→复制结果/下载纯文本报告，隐私口径 "folder comparison happens locally in your browser"，首版即称 Minimum Useful Version 试水）。痛点真实：发布前后构建 diff、备份文件夹对账、两次导出版本比对——桌面方案要装软件（Beyond Compare 付费）、在线方案此能力空白。差异化实锤：仓库 text-diff 仅做两段文本对比，文件夹递归树对比为全新能力（99 Path 中 folder/文件夹对比/builddiff/构建对比/directory 全零命中）。可行性：纯前端中难度——File System Access API `showDirectoryPicker` ×2（Chrome/Edge）→递归遍历条目→文件内容 Web Crypto SHA-256 哈希比对（大文件分片流式哈希防内存爆）→差异树渲染+筛选（仅差异/全部）→复制摘要/下载报告；零上传零依赖无后端；Firefox 无 API 需显式降级提示。可行性提示：上午大轮次优先。难度中。SEO：文件夹对比、目录对比、文件差异对比、folder diff。建议 ID `folder_diff`、Path `/tools/folder-diff`。P1。
3. 证据增强/晋升：**单位换算器**。26 轮已入表（P1 观察），本轮证据三重化晋升 P1（强）：① dev.to anupghi EverydayToolz 2026-10-12 "File Size Converter: bytes, KB, MB, and GB in binary or decimal" 直接单列（与 base converter 同榜单形态家族）；② dev.to blanzatools 2026-10-11 14 工具集单列 Unit Converter（长度/重量/温度/数据）；③ PH 10-12 Everyday Tools file size converter 仓库缺口（25/26 轮已记录）。痛点真实：开发运维日常数据大小换算（KB=1000 vs KiB=1024 混淆）、设计师长度单位互转。差异化：文件大小二进制/十进制双口径开关+常用单位一站式。可行性：纯前端小难度——长度/重量/温度/数据存储 SI·英制互转，文件大小 KB=1000/KiB=1024 可切换；零依赖无后端。去重：99 Path 中 单位换算/unit_converter/文件大小/文件体积全零命中。难度小。SEO：单位换算、单位换算器、文件大小换算、KB MB GB 换算。建议 ID `unit_converter`、Path `/tools/unit-converter`。P1（晋升）。
4. 新观察/证据记录：① **批量域名可用性检测**——dev.to laing_lii SiteToolsBox（2026-10-18 发布，23 小时前）20+ 工具集单列 "Bulk Domain Availability Check (via RDAP)"；25 轮已记录本信号；仓库 domain-check（RDAP+whois 直查）Muse VM 出网被拦截、转 VPS 决策未定，批量版共享同一出网依赖——本轮无变化，不单立。② **HTTP 重定向链追踪**——HN Ask HN "What simple tools" 提及 followww.co（展示 URL 跳转链+每步 cookie）+ SiteToolsBox 10-18 "HTTP Status Checker"：浏览器 fetch 无法穿透 CORS 拿到中间跳转链（redirect:'manual' 下响应 opaque），必须后端代理发请求，不符合纯前端 local-first 口径；不单立。③ **V2EX 10-18/19**：cc-session（远程 Claude 会话 agent 形态）、Windows 开源软件商店（桌面/包管理形态）、ChatGPT MCP 实时联网（插件/agent 形态）、SSD 寿命公式（内容帖非工具）、Livid 访谈——无单页新信号。④ **PH 本周**（10-12~10-18）：PdfWord 47 PDF 工具（25 轮已判：eSign 已交付/OCR 仓库已有/其余已覆盖）、OpenMuse/Harness agent（agent 形态）、数字宠物五连发（娱乐应用形态）、Retriever AI browser agent（agent 形态）、Life Story Compiler（App 形态）——无单页新信号。⑤ **HN/Reddit**：ToolHop/Toolbit Show HN（旧帖非新信号）、daily.dev 工具发现指南（meta 无工具信号）——无新单页信号。⑥ **冗余复核**：EverydayToolz Hash Generator（MD5/SHA-1/SHA-256/384/512）——仓库已有 md5/sha256，不单立（SHA-1/384/512 可作为 hash 家族后续扩展，暂不入候选）；BlanzaTools 10-11 百分比/Age/BMI 计算器——泛生活计算器口径，用户方向 10-18 下不扩展；qrgenrateronline 15 种 QR 类型——仓库已有 qrcode，类型扩展暂不单立。⑦ WPS 候选表保持冻结归档。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进；07:36 上午轮次，中难度可排）：

1. **单位换算器（Unit Converter）** — P1（本轮晋升：证据三重化（blanzatools 10-11 + EverydayToolz 10-12 文件大小转换器单列 + PH 10-12 file size converter 仓库缺口）；纯前端小难度：长度/重量/温度/数据存储 SI·英制互转 + 文件大小 binary/decimal 双口径开关差异化；99 Path 单位换算零命中）。
2. **文件夹对比（Folder Diff）** — P1（本轮新晋：BuildDiff 2026-10-09 形态验证，递归对比+四态报告+本地隐私口径；桌面 Beyond Compare 付费方案的免费替代；纯前端中难度：File System Access API 双目录选择→Web Crypto 流式哈希比对→差异树渲染+报告下载；Chrome/Edge，Firefox 降级提示；99 Path folder/文件夹对比零命中，与 text-diff 不重叠）。
3. **图片精确体积压缩器（Compress to Target KB）** — P1（26 轮新晋：DodoDeck 10-18 headline 功能 "exact KB image resizer" 佐证；证件照/考试报名/公众号「≤X KB」硬限制痛点真实；img-compress 无目标体积模式已实锤去重；纯前端小难度：目标 KB→二分质量+尺寸降级→一次命中导出；连续两轮顺延后本轮优先）。

robots.txt 生成器（P1；27 轮新晋，Varkido 10-01 SEO 套装单列，同套装 SERP/OG 已交付家族佐证；纯前端小难度）；YouTube 缩略图下载器（P1；27 轮新晋，四档分辨率 i.ytimg.com 直链，纯前端小难度）；代码压缩器（P1；27 轮新晋，Varkido Dev 套装单列同套装唯一缺口，纯前端小难度）；JSON Schema 验证器（P1，中难度，上午大轮次第一候补）；浏览器屏幕录制器（P1，中难度，上午大轮次）；SRT 字幕编辑器（P1，顺位顺延）；EPUB 电子书阅读器（P1，中难度，上午大轮次）；SQLite 数据库查看器（P1，中难度，上午大轮次）；OFD 阅读与转 PDF（P1，中-大，上午大轮次）；视频抽帧（P1，中难度，上午轮次）；音频合并器（P1，26 轮新晋，音频品类连续两弹感知留 PM 定序）；日期加减/日期差（P1 观察）；报价单/收据生成器（P1，用户方向下顺位不提前）；SVG 转 React JSX（P1 观察）；屏幕常亮工具（P1，留池）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；白噪音发生器（P2 观察）；番茄钟（P2 观察）；Kanban 看板（P2 观察）；倒计时器（P2 观察）；在线钢琴（P2 观察）；TTS 文本转语音朗读器（P2 观察）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察）；重复词查找器（P2 观察）；DNS 传播检查（P2 观察）；cURL 转请求代码（P2 观察）；域名生成器（观察，低优先）等其余候选留池。

**通用候选表增量**（第二十八轮：进制转换器已实现划出；新晋文件夹对比 P1；单位换算器证据三重化晋升 P1；全量 99 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 文件夹对比（Folder Diff） | 本轮新晋（dev.to dev5942-b 2026-10-09 BuildDiff 发布帖：浏览器内选两文件夹递归对比，新增/删除/修改/未变四态报告，复制结果/下载纯文本报告，"folder comparison happens locally in your browser"；痛点：发布构建 diff、备份文件夹对账，桌面方案付费/要装、在线此能力空白；纯前端中难度：File System Access API 双目录选择（Chrome/Edge，Firefox 降级提示）→Web Crypto SHA-256 流式哈希比对→差异树渲染+筛选→复制摘要/下载报告，零上传无后端；99 Path folder/文件夹对比/builddiff/构建对比/directory 全零命中；与 text-diff 文本对比能力不重叠） | 中 | P1（本轮新晋） |
| 单位换算器（Unit Converter） | 证据三重化晋升（26 轮已入表 P1 观察；本轮：dev.to EverydayToolz 2026-10-12 "File Size Converter: bytes, KB, MB, and GB in binary or decimal" 直接单列 + blanzatools 10-11 Unit Converter 复述 + PH 10-12 file size converter 仓库缺口；痛点：开发运维数据大小换算（KB=1000 vs KiB=1024 混淆）、设计师长度单位互转；差异化：文件大小二进制/十进制双口径开关+常用单位一站式；纯前端小难度：长度/重量/温度/数据存储 SI·英制互转；99 Path 单位换算/unit_converter/文件大小全零命中） | 小 | P1（晋升；证据三重化） |

**归档说明**：本轮为 10-19 通用调研第二十八轮——进制转换器交付闭环（acb7159，`/tools/base-converter` 已注册，全量 99 Path，开发工具品类），候选池划出，已实现清单 delta 追加；新晋「文件夹对比」P1（BuildDiff 10-09 形态验证，纯前端中难度：File System Access API+Web Crypto 流式哈希，99 Path 无重叠，Firefox 降级提示，适合上午大轮次）、「单位换算器」P1 晋升（证据三重化：blanzatools 10-11 + EverydayToolz 10-12 + PH 10-12，文件大小 binary/decimal 双口径差异化，纯前端小难度）；批量域名可用性检测（SiteToolsBox 10-18）维持 25 轮判定（domain-check 转 VPS 决策未定，不单立）；HTTP 重定向链追踪（followww.co/SiteToolsBox）需后端代理不符合纯前端口径不单立；V2EX 10-18/19（cc-session agent、Windows 商店桌面形态、MCP 联网、SSD 公式内容帖）、PH 本周（PdfWord 25 轮已判、agent/数字宠物/App 形态）、HN/Reddit（旧 Show HN/meta 指南）均无单页新信号；冗余复核（EverydayToolz Hash 仓库已覆盖、BlanzaTools 百分比/Age/BMI 计算器用户方向下不扩展、QR 15 类型仓库已有 qrcode）；WPS 候选表保持冻结归档；仓库 99 注册工具全量核对无重叠，核稿反馈（立候选前先 grep，中文名+ID 片段双核）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）成功；`git log` 确认开发交付 acb7159；`grep tools/categories.go` 全量 99 Path（98+1），`base_converter` ID 与 `/tools/base-converter` Path 已注册（250/253 行），新候选建议 ID（folder_diff / unit_converter）与 99 Path 无重叠；folder/文件夹对比/builddiff/构建对比/directory/单位换算/unit_converter/文件大小关键词在 categories.go 核对（postman 工具为注释占位不影响判定）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` 与 `toolweb`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-19 05:45 排期轮）

## 今日任务（2026-10-19 05:45 · 产品经理排期决策 ✅）

**交付状态**：待前端开发轮交付。10-19 排期决策轮（05:36 第二十七轮研究之后）。网站图标生成器已交付闭环（03:39 PM 决策轮立项→开发交付 3fb07e1；`grep tools/categories.go` 确认 ID `favicon_generator`、Path `/tools/favicon-generator` 已注册，全量 **98 Path**），候选池划出。本轮立项**今日唯一任务：进制转换器（Base Converter）**。

**选定：进制转换器（/tools/base-converter）** — 本轮唯一任务：
- **顺位递进（公平性）**：03:39 PM 排期轮明确「本轮顺延，下一轮节奏调节位优先」；27 轮研究轮 Top3 将其排在首位。连续两轮顺延让位后本轮理应立项。
- **凌晨轮只排小难度（既定规则）**：纯前端小难度（输入→BigInt 精确换算→多进制展示+复制），一轮可高质量交付；JSON Schema 验证器/EPUB 阅读器/浏览器屏幕录制器/SQLite 查看器等中难度留待上午大轮次。
- **证据已增强**：Product Hunt 2026-10-12 "Everyday Tools" 榜单单列 number base converter，为该榜单中仓库唯一缺口（同榜单 Base64/UUID/Markdown/子网计算器已覆盖）；dev.to 51 工具集形态族二重化。
- **旅程线完备**：与 timestamp/cron/uuid/base64/jwt 开发者工具家族互链，工具家族叙事成立。
- **去重实锤**：`grep tools/categories.go` 实核——`进制`/`base_converter` 零命中，全量 98 Path 无重叠；`templates/color_converter.html` 为 HEX/RGB/HSL 颜色互转孤儿模板（categories.go 未注册），与数字进制换算能力不重叠；`base` 前缀现存仅 base64 家族。
- **痛点真实**：开发/运维日常进制换算（掩码、颜色值、调试），现有在线方案多带广告。

**规格**：
1. 输入区：文本输入框 + 进制选择器（2/8/10/16/32），支持 0x/0b/0o 前缀自动识别与非法字符实时校验（红色提示）。
2. 结果区：一次展示全部五进制结果，卡片式列表，16 进制支持 0x 前缀开关；每结果一键复制按钮。
3. 增强：分组显示开关（每 4/8 位分组，便于读长串）；大整数用 BigInt 换算（无精度损失，超出 JS 安全整数仍精确）。
4. 纯前端、零 CDN 依赖、无后端调用、无外部请求；响应式，桌面端优先、移动端可用。
5. 注册：`tools/categories.go`「开发工具」品类新增工具 ID `base_converter`、Path `/tools/base-converter`（New: true），中英文描述 + SEO keywords（进制转换、进制换算、二进制转十进制、十进制转十六进制、base converter、进制计算器）。

**验收标准**：
- [ ] `/tools/base-converter` 可开（200）
- [ ] 2/8/10/16/32 任意进制互转正确；0x/0b/0o 前缀识别正确；非法输入有红色提示
- [ ] 大整数（超出 Number 安全整数，如 2^100）换算精确
- [ ] 分组显示开关生效；各结果一键复制可用
- [ ] DevTools Network 抽查无后端调用、无 CDN 依赖
- [ ] `categories.go` 注册完成（开发工具品类，New: true），首页/导航/sitemap 生效
- [ ] 移动端可操作（输入+切换+复制）
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/base_converter.html`（新建：输入区+进制选择+结果卡片+复制按钮，纯前端）、`static/js/base_converter.js`（新建：BigInt 换算引擎、输入校验、分组格式化、复制逻辑，零依赖）、`tools/categories.go`（开发工具品类+工具注册）、`BACKLOG.md`（本小节）。

**未选**：
- 图片精确体积压缩器（P1；26 轮新晋，DodoDeck 10-18 headline 功能佐证，≤X KB 硬限制痛点真实，img-compress 无目标体积模式实锤去重；03:39 与上上轮图片复古做旧错峰顺延后，本轮再顺延一次——连续图片品类节奏调节，下轮或再下轮优先）。
- robots.txt 生成器（P1；27 轮本轮新晋，Varkido 10-01 SEO 套装单列、同套装 SERP/OG 已交付家族佐证；顺位递进：刚入池，下一轮顺位优先）。
- YouTube 缩略图下载器（P1；27 轮本轮新晋，四档分辨率 i.ytimg.com 直链，纯前端小难度；顺位顺延留池）。
- 代码压缩器（P1；27 轮本轮新晋，Varkido Dev 套装单列同套装唯一缺口；与本轮进制转换器同开发者工具家族，节奏调节留池）。
- 音频合并器（P1；26 轮新晋，音频品类连续两弹感知留 PM 定序，本轮顺延）；JSON Schema 验证器（P1，第一候补；中难度，上午大轮次优先）；EPUB 电子书阅读器（P1，中难度，上午大轮次）；浏览器屏幕录制器（P1，中难度，上午大轮次）；SQLite 数据库查看器（P1，中难度，上午大轮次）；OFD 阅读与转 PDF（P1，中-大，上午大轮次）；视频抽帧（P1，中难度，上午轮次）；SRT 字幕编辑器（P1，顺位顺延）；单位换算器（P1 观察）；日期加减/日期差（P1 观察）；报价单/收据生成器（P1，用户方向下顺位不提前）；SVG 转 React JSX（P1 观察）；屏幕常亮工具（P1，留池）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；白噪音发生器（P2 观察）；番茄钟（P2 观察）；Kanban 看板（P2 观察）；倒计时器（P2 观察）；在线钢琴（P2 观察）；TTS 文本转语音朗读器（P2 观察）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察）；重复词查找器（P2 新观察）；DNS 传播检查（P2 新观察，需出网）；cURL 转请求代码（P2 新观察）；域名生成器（观察，低优先）等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）成功，本地 HEAD ab5e41a（27 轮研究）；`git log` 确认开发交付 3fb07e1（网站图标生成器）；`grep tools/categories.go` 全量 98 Path，`favicon_generator` ID 与 `/tools/favicon-generator` Path 已注册（划入已实现）；新候选 ID `base_converter`、Path `/tools/base-converter` 与 98 Path 无重叠（`进制`/`base_converter` 零命中；color_converter.html 仅孤儿模板未注册）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` 与 `toolweb`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-19 05:36 第二十七轮研究）

## 今日任务（2026-10-19 05:36 · 产品调研员研究轮 ✅）

**交付状态**：10-19 通用调研第二十七轮（WPS 特别方向 10-09~10-15 已结束；用户方向修正 2026-10-18 持续有效：聚焦 ToolWeb 工具本身，不扩展泛财务/生活计算器）。网站图标生成器已交付闭环（03:39 PM 决策轮立项→开发交付 3fb07e1：六尺寸生成+favicon.ico 手工编码+JSZip 打包+HTML 引用代码；`grep tools/categories.go` 确认 ID `favicon_generator`、Path `/tools/favicon-generator` 已注册，全量 **98 Path**），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）；凌晨轮沿用「只排小难度」规则。

**本轮五件事**（05:36 全网调研，通用方向）：
1. 图标生成器交付确认：`git log` 确认开发交付 3fb07e1；本地分支 muse/dev-20260929；`git fetch` 经 GIT_SSH_COMMAND 密钥拉取时提示 Host key verification failed（首次抓 github.com 已自动加 known_hosts，重试即通，不影响本轮核稿）；`grep` 全量 98 Path，ID/Path 已注册；候选池划出，已实现清单追加（delta：+ 网站图标生成器）。
2. 新晋候选：**robots.txt 生成器（Robots.txt Generator）**。需求证据：dev.to contact_varkido 2026-10-01《How I Built 170+ Free Online Tools》SEO 工具套装明列（Schema markup generator / Meta tag generator / SERP snippet preview / Open Graph generator / FAQ schema builder / **robots.txt generator**）——同套装 SERP snippet preview 与 OG 生成器仓库已覆盖并已交付，robots.txt 为该 SEO 家族中仓库唯一缺口，家族佐证成立。痛点真实：站长写 robots.txt 靠记语法或抄模板，Disallow/Allow/Sitemap/Crawl-delay 规则写错会导致收录事故。可行性：纯前端小难度——可视化规则拼装（User-agent+规则列表+站点地图）→实时预览→一键复制/下载 robots.txt；零依赖无后端。去重：98 Path 中 robots/robots.txt 全零命中；SEO 工具旅程线可与 serp_snippet_preview、og_card_preview 互链。难度小。SEO：robots.txt 生成、搜索引擎抓取规则。建议 ID `robots_txt_generator`、Path `/tools/robots-txt-generator`。P1。
3. 新晋候选：**YouTube 缩略图下载器（YouTube Thumbnail Downloader）**。需求证据：dev.to codeofrelevancy 2026-10-09《I Built 30+ Free Browser Tools That Never See Your Data》单列（与 SQLite DB Viewer、Token Counter、ChatGPT Text Cleaner 同文，本地处理口径）。痛点真实：做视频二创/公众号运营/汇报 PPT 经常需要拿视频封面图，现有方案要装插件或用带广告的下载站。可行性：纯前端小难度——粘贴视频链接/ID→正则解析 video ID→展示四档分辨率缩略图（maxresdefault/hqdefault/sddefault/mqdefault，i.ytimg.com 静态直链，`<img>` 预览无需 CORS）→点击原图查看/下载（a[download]/canvas 中转）；零依赖无后端。去重：98 Path 中 youtube/YouTube/缩略图全零命中（og_card_preview 的「缩略图」仅指社交卡片预览输入项，能力不重叠）。难度小。SEO：YouTube 缩略图下载、视频封面提取。建议 ID `youtube_thumbnail`、Path `/tools/youtube-thumbnail`。P1。
4. 新晋候选：**代码压缩器（HTML/CSS/JS Minifier）**。需求证据：同 Varkido 2026-10-01 170+ 工具 Dev 套装明列（HTML/CSS/JS minifier）——同套装 JSON formatter/regex tester/diff/Base64/JWT/URL 编解码/时间戳仓库均已覆盖，minifier 为该 Dev 家族中仓库唯一缺口。痛点真实：前端交付/邮件模板/埋点脚本上线前去注释压缩，现有在线方案多带广告或要注册。可行性：纯前端小难度——HTML 去注释+多余空白、CSS 去注释+压缩空白、JS 保守策略去注释+行尾空白（不做语义混淆，安全优先），压缩前后体积对比+一键复制；零依赖无后端。去重：98 Path 中 minif/代码压缩全零命中；与 base64/encode/开发工具家族互链。难度小。SEO：代码压缩、HTML 压缩、CSS 压缩、JS 压缩。建议 ID `code_minifier`、Path `/tools/code-minifier`。P1。
5. 新观察/证据记录：① **重复词查找器（Duplicate Word Finder）**——同 Tooltri 2026-10-09 文单列（与 Word Counter、Text Case Converter 同文）；写作校对场景（「然后然后」「这个这个」）；98 Path duplicate/重复词零命中；纯前端小难度；P2 观察（写作 niche）。② **DNS 传播检查（DNS Propagation Checker）**——dev.to invvodel 2026-10-01 SiteIndex 70+ 工具 Internet & Network 品类单列（propagation checker）；仓库 dns-lookup 仅做单记录查询，无多解析器对比；纯前端可做（多公共 DoH 端点 fetch 对比，dns.google/cloudflare-dns 支持 CORS），但依赖外部解析器可用性且属「出网调用」口径；P2 观察。③ **cURL 转请求代码（cURL Converter）**——VelnoxLabs 2026-09-27 51 工具集单列 cURL to Python Requests Converter；仓库 postman 工具仅注释占位未实现，curl 零命中；dev 高频需求；P2 观察（niche）。④ nathaniel_ady 2026-10-15 9 dev utilities（JSON 格式化/正则/Base64/JWT/cron/时间戳/Markdown 转 HTML/文本 diff/子网计算器）——除 JSON→CSV 提及外，9 项仓库已全覆盖（markdown/csvjson/text-diff 均有；csv-json 双向）；Markdown 转 HTML 属 markdown 工具已有能力，不单立。⑤ Noloii 图片工具族（bellal_hossain 2026-10-04：sharpen/blur/pixelate/noise reducer/brightness）——仓库已有 img_mosaic（框选马赛克/高斯模糊）与 image_annotator、img_retro_filter（噪点/调色），能力重叠，不单立。⑥ V2EX 10-18/19：文本加密解密工具（仓库 crypto/aes/des/rsa 已覆盖）、喝水提醒 app（生活应用形态不做）、BiliFlow B 站下载桌面工具（桌面形态不做）、关键词订阅推送（需后端不做）——无单页新信号。⑦ WPS 候选表保持冻结归档。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进；05:36 凌晨轮只排小难度）：

1. **进制转换器（Base Converter）** — P1（25 轮证据增强：PH 10-12 Everyday Tools 榜单单列，为该榜单仓库唯一缺口；dev.to 51 工具集形态族二重化；纯前端小难度：2/8/10/16/32 互转+分组显示+一键复制；开发者工具家族 timestamp/cron/uuid/base64/jwt 旅程线；98 Path 进制零命中）。
2. **图片精确体积压缩器（Compress to Target KB）** — P1（26 轮新晋：dev.to mdshamimali 2026-10-18 DodoDeck 发布帖 headline 功能 "exact KB image resizer" 佐证；证件照/考试报名/公众号「≤X KB」硬限制痛点真实；img-compress 无目标体积模式已实锤去重（templates grep 零命中）；纯前端小难度：目标 KB→二分质量+尺寸降级→一次命中导出；98 Path 无重叠）。
3. **robots.txt 生成器（Robots.txt Generator）** — P1（本轮新晋：Varkido 2026-10-01 SEO 套装单列，同套装 SERP/OG 已交付形成家族佐证；SEO 工具旅程线与 serp_snippet_preview、og_card_preview 互链；纯前端小难度：可视化规则拼装→实时预览→复制/下载；98 Path robots 零命中）。

YouTube 缩略图下载器（P1 本轮新晋，纯前端小难度，媒体/运营人群，四档分辨率 i.ytimg.com 直链）；代码压缩器（P1 本轮新晋，Varkido Dev 套装单列、该套装仓库唯一缺口，开发工具家族互链，纯前端小难度）；JSON Schema 验证器（P1，中难度，第一候补，上午大轮次）；浏览器屏幕录制器（P1，中难度，上午大轮次）；音频合并器（P1，26 轮新晋，音频品类旅程线；连续音频品类感知留 PM 定序）；SRT 字幕编辑器（P1，顺位顺延）；EPUB 电子书阅读器（P1，中难度，上午大轮次）；SQLite 数据库查看器（P1，中难度，上午大轮次）；OFD 阅读与转 PDF（P1，中-大，上午大轮次）；视频抽帧（P1，中难度，上午轮次）；单位换算器（P1 观察）；日期加减/日期差（P1 观察）；报价单/收据生成器（P1，用户方向下顺位不提前）；SVG 转 React JSX（P1 观察，开发者 niche）；屏幕常亮工具（P1，留池）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；白噪音发生器（P2 观察）；番茄钟（P2 观察）；Kanban 看板（P2 观察，应用形态重）；倒计时器（P2 观察，形态泛化）；在线钢琴（P2 观察，娱乐应用形态）；TTS 文本转语音朗读器（P2 观察，品类成熟差异化弱）；MP3 标签编辑器（P2 观察，音频品类互链位）；贴纸生成器（P2 观察，AI 抠图需后端）；重复词查找器（P2 新观察）；DNS 传播检查（P2 新观察，需出网）；cURL 转请求代码（P2 新观察）；域名生成器（观察，低优先，需出网）等其余候选留池。

**通用候选表增量**（第二十七轮：图标生成器已实现划出；新晋 robots.txt 生成器 P1、YouTube 缩略图下载器 P1、代码压缩器 P1；新观察重复词查找器/DNS 传播检查/cURL 转请求代码 P2；全量 98 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| robots.txt 生成器（Robots.txt Generator） | 本轮新晋（dev.to contact_varkido 2026-10-01 170+ 工具 SEO 套装单列；同套装 SERP snippet preview/OG 生成器仓库已交付，本工具为该 SEO 家族唯一缺口；痛点：站长手写抓取规则易错导致收录事故；纯前端小难度：可视化规则拼装（User-agent/Allow/Disallow/Sitemap/Crawl-delay）→实时预览→复制/下载；98 Path robots/robots.txt 全零命中；与 serp_snippet_preview、og_card_preview 互链） | 小 | P1（本轮新晋） |
| YouTube 缩略图下载器（YouTube Thumbnail Downloader） | 本轮新晋（dev.to codeofrelevancy 2026-10-09 30+ 工具单列；痛点：二创/公众号运营/汇报 PPT 取视频封面图，现有方案装插件或进广告下载站；纯前端小难度：解析视频链接/ID→四档分辨率缩略图（maxresdefault/hqdefault/sddefault/mqdefault，i.ytimg.com 静态直链，`<img>` 预览免 CORS）→查看原图/下载；98 Path youtube/YouTube/缩略图全零命中；og_card_preview 的「缩略图」仅为社交卡片输入项，能力不重叠） | 小 | P1（本轮新晋） |
| 代码压缩器（HTML/CSS/JS Minifier） | 本轮新晋（dev.to contact_varkido 2026-10-01 170+ 工具 Dev 套装单列；同套装 JSON/正则/diff/Base64/JWT/URL/时间戳仓库均已覆盖，minifier 为该 Dev 家族唯一缺口；痛点：前端交付/邮件模板/埋点脚本上线前去注释压缩，现有在线方案带广告或要注册；纯前端小难度：HTML 去注释+多余空白、CSS 去注释+空白、JS 保守去注释+行尾空白（不做语义混淆），压缩前后体积对比+一键复制；98 Path minif/代码压缩全零命中；开发工具家族互链） | 小 | P1（本轮新晋） |
| 重复词查找器（Duplicate Word Finder） | 新观察（同 Tooltri 2026-10-09 文单列，与 Word Counter、Text Case Converter 同文；写作校对「然后然后」「这个这个」场景；98 Path duplicate/重复词零命中；纯前端小难度） | 小 | P2 观察 |
| DNS 传播检查（DNS Propagation Checker） | 新观察（dev.to invvodel 2026-10-01 SiteIndex 70+ 工具 Internet & Network 品类单列；仓库 dns-lookup 仅单记录查询，无多解析器对比；纯前端可做多公共 DoH 端点 fetch 对比，但依赖外部解析器可用性且属出网调用口径；98 Path propagation 零命中） | 小 | P2 观察 |
| cURL 转请求代码（cURL Converter） | 新观察（VelnoxLabs 2026-09-27 51 工具集单列 cURL to Python Requests Converter；仓库 postman 仅注释占位未实现，curl 零命中；dev 高频需求；纯前端小难度：解析 cURL→生成 Python requests/Go/fetch 代码） | 小 | P2 观察 |

**归档说明**：本轮为 10-19 通用调研第二十七轮——网站图标生成器交付闭环（3fb07e1，`/tools/favicon-generator` 已注册，全量 98 Path，开发工具品类），候选池划出，已实现清单 delta 追加；新晋「robots.txt 生成器」P1（Varkido 10-01 SEO 套装单列，家族佐证：SERP/OG 已交付，同套装唯一缺口，纯前端小难度，98 Path 无重叠）、「YouTube 缩略图下载器」P1（Tooltri 10-09 单列，四档分辨率 i.ytimg.com 静态直链，纯前端小难度，98 Path 无重叠）、「代码压缩器」P1（Varkido 10-01 Dev 套装单列，同套装唯一缺口，纯前端小难度，98 Path 无重叠）；新观察「重复词查找器」「DNS 传播检查」「cURL 转请求代码」均为 P2；nathaniel_ady 9 dev utilities（10-15）除 JSON→CSV 外仓库全覆盖、Markdown 转 HTML 属 markdown 已有能力；Noloii 图片工具族（sharpen/blur/pixelate/noise reducer）与 img_mosaic/image_annotator/img_retro_filter 能力重叠；V2EX 10-18/19（文本加密/喝水提醒/B站下载桌面工具/关键词推送后端）无单页新信号；WPS 候选表保持冻结归档；仓库 98 注册工具全量核对无重叠，核稿反馈（立候选前先 grep，中文名+ID 片段双核）持续闭环。

**交付核对**：本地分支 muse/dev-20260929；`git log` 确认开发交付 3fb07e1；`grep tools/categories.go` 全量 98 Path（97+1），`favicon_generator` ID 与 `/tools/favicon-generator` Path 已注册（划入已实现），新候选建议 ID（robots_txt_generator / youtube_thumbnail / code_minifier / duplicate_word_finder / dns_propagation / curl_converter）与 98 Path 无重叠；robots/thumbnail/缩略图/youtube/minif/代码压缩/duplicate/重复词/propagation/curl 关键词在 categories.go 核对（markdown/csvjson/text-diff/serp_snippet_preview/og_card_preview/img_mosaic/image_annotator/img_retro_filter/crypto 系列已覆盖判定）；fetch 首轮 known_hosts 失败后自动补录 github.com 重试即通；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-19 03:39 排期轮）

## 今日任务（2026-10-19 03:39 · 产品经理排期决策 ✅）

**交付状态**：待前端开发轮交付。10-19 排期决策轮（03:36 第二十六轮研究之后）。在线音频裁剪器已交付闭环（01:39 PM 决策轮立项→开发交付 1e8057b + 评审修复 357f056；`grep tools/categories.go` 确认 ID `audio_trimmer`、Path `/tools/audio-trimmer` 已注册，全量 **97 Path**，「音频处理」新品类已开张），候选池划出。本轮立项**今日唯一任务：网站图标生成器（Favicon Generator）**。

**选定：网站图标生成器（/tools/favicon-generator）** — 本轮唯一任务：
- **凌晨轮只排小难度（既定规则）**：纯前端小难度（上传→canvas 多尺寸导出→预览→ZIP 打包+HTML 引用代码），一轮可高质量交付；JSON Schema 验证器/EPUB 阅读器/浏览器屏幕录制器等中难度留待上午大轮次（顺位递进留池）。
- **顺位递进（公平性）**：16 轮新晋→24/25 轮连续顺延，三次让位后本轮理应立项；26 轮 Top3 亦将其排在首位。
- **品类错峰**：上轮音频（新品类）→上上轮图片；favicon 归建站/开发者口径（「开发工具」品类，与 qrcode/css_gradient_generator 同族群），与相邻轮次不重叠；图片精确体积压缩器（图片口径，与 img-compress 同品类、感知太近）与音频合并器（音频品类连续两弹，26 轮已注连续感知留 PM 定序）本轮均顺延留池。
- **证据持续有效**：365Lab 10-08 竞品形态验证 + 10-08 40+ 工具榜单二重佐证图标生成器热度；本轮实测复核 97 Path `favicon/网站图标/图标生成/favicon_generator` 全零命中。
- **去重实锤**：`img-compress` 为通用压缩（无目标体积模式），与本工具多尺寸图标+ICO+打包+代码片段能力不重叠。

**规格**：
1. 上传/拖拽图片：PNG/JPG/WebP/SVG（SVG 经 canvas 光栅化），透明背景保留；工具页显著位置隐私声明：「图片只在你的浏览器里处理，不上传服务器」。
2. 多尺寸一键生成：16×16、32×32、48×48（favicon 标准）、180×180（apple-touch-icon）、192×192、512×512（PWA/manifest），canvas 高质量缩放（imageSmoothingQuality high）。
3. favicon.ico 本地手工编码：ICONDIR+ICONDIRENTRY 头 + PNG 数据打包，零依赖手写（仓库 WAV 手工编码先例）。
4. 实时预览：浏览器标签页模拟预览 + 深色/浅色背景对比预览；各尺寸缩略图一览。
5. 打包下载：ZIP 一键打包（favicon.ico + 各尺寸 PNG + site.webmanifest 片段），JSZip 本地 vendor（仓库 SheetJS/lamejs 本地 vendor 先例）。
6. HTML 引用代码一键复制：`<link rel="icon">` / apple-touch-icon / manifest 三段代码，含中文注释说明放哪。
7. 纯前端、零 CDN 依赖、无后端调用；响应式，桌面端优先、移动端可用。
8. 注册：`tools/categories.go`「开发工具」品类新增工具 ID `favicon_generator`、Path `/tools/favicon-generator`（New: true），中英文描述 + SEO keywords（网站图标生成器、favicon 生成、网站图标制作、favicon generator、apple touch icon）。

**验收标准**：
- [x] `/tools/favicon-generator` 可开（200）
- [ ] 上传 PNG/JPG/SVG 后各尺寸（16/32/48/180/192/512）正确生成，透明背景保留
- [ ] favicon.ico 下载成功，Windows/浏览器可识别
- [ ] ZIP 打包下载成功，内含 ico+各尺寸 PNG+manifest 片段
- [ ] HTML 引用代码一键复制可用，三段代码无误
- [ ] 隐私声明显著；DevTools Network 抽查无后端调用、无 CDN 依赖
- [x] `categories.go` 注册完成（开发工具品类，New: true），首页/导航/sitemap 生效
- [ ] 移动端可操作（上传+生成+下载）
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**开发交付（2026-10-19 前端开发轮 ✅）**：commit 待推送。本地 `go build` 通过；127.0.0.1:18999 实测 `/tools/favicon-generator` 200、JS/JSZip vendor 200、sitemap 与首页索引已含新 Path、页面无外部 URL 引用。ICO 手工编码逻辑经 node 抽取实测 19 项校验全过（ICONDIR 头 + 16/32/48 三 entry，偏移/长度/载荷完整、PNG 魔数正确）；JSZip v3.10.1 本地 vendor 打包→回读验证通过；`node --check` 语法通过。六尺寸 canvas 导出、SVG 注入宽高光栅化、contain 透明居中、标签页模拟/深浅对比预览、三段 HTML 代码复制均为前端实测逻辑，待测试轮浏览器实测复核。

**预计改动文件**：`templates/favicon_generator.html`（新建：上传拖拽区+尺寸预览栅格+标签页模拟预览+下载按钮+代码复制区，纯前端）、`static/js/favicon_generator.js`（新建：SVG 光栅化、多尺寸 canvas 导出、ICO 手工编码、ZIP 打包编排、代码片段生成，零依赖）、`static/js/vendor/jszip.min.js`（新增：ZIP 打包本地 vendor，仓库 SheetJS/lamejs 先例）、`tools/categories.go`（开发工具品类+工具注册）、`BACKLOG.md`（本小节）。

**未选**：
- 进制转换器（P1；PH 10-12 Everyday Tools 榜单单列、该榜单仓库唯一缺口；纯前端小难度；本轮顺延，下一轮节奏调节位优先）。
- 图片精确体积压缩器（P1；26 轮新晋，DodoDeck 10-18 headline 功能佐证，≤X KB 硬限制痛点真实，img-compress 无目标体积模式实锤去重；与 img-compress 同图片品类、与上上轮图片复古做旧感知太近，本轮错峰顺延）。
- 音频合并器（P1；26 轮新晋，与 audio_trimmer 同技术栈；音频品类连续两弹的感知问题留 PM 定序，本轮顺延，与 MP3 标签编辑器 P2 组音频三件套时再议）。
- JSON Schema 验证器（P1，第一候补；中难度，上午大轮次优先）；EPUB 电子书阅读器（P1 新观察，中难度，上午大轮次）；浏览器屏幕录制器（P1，中难度，上午大轮次）；SRT 字幕编辑器（P1，顺位顺延）；SQLite 数据库查看器（P1，中难度，上午大轮次）；OFD 阅读与转 PDF（P1，中-大，上午大轮次）；视频抽帧（P1，中难度，上午轮次）；单位换算器（P1 观察）；日期加减/日期差（P1 观察）；报价单/收据生成器（P1，用户方向下顺位不提前）；SVG 转 React JSX（P1 观察）；屏幕常亮工具（P1，留池）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；白噪音发生器（P2 观察）；番茄钟（P2 观察）；Kanban 看板（P2 观察）；倒计时器（P2 观察）；在线钢琴（P2 观察）；TTS 文本转语音朗读器（P2 观察）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察）；域名生成器（观察，低优先）等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）成功，本地 HEAD 6e8ef79；`git log` 确认开发交付 1e8057b + 评审修复 357f056 + 研究轮 6e8ef79；`grep tools/categories.go` 全量 97 Path，`audio_trimmer` ID 与 `/tools/audio-trimmer` Path 已注册（划入已实现）；新候选 ID `favicon_generator`、Path `/tools/favicon-generator` 与 97 Path 无重叠（`favicon/网站图标/图标生成` 零命中；`base` 命中均为 base64 家族工具，非进制转换）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-19 03:36 第二十六轮研究）

## 今日任务（2026-10-19 03:36 · 产品调研员研究轮 ✅）

**交付状态**：10-19 通用调研第二十六轮（WPS 特别方向已结束；用户方向修正持续有效：聚焦 ToolWeb 工具本身，不扩展泛财务/生活计算器）。在线音频裁剪器已交付闭环（01:39 PM 决策轮立项→开发交付 1e8057b + 评审修复 357f056；`grep tools/categories.go` 确认 ID `audio_trimmer`、Path `/tools/audio-trimmer` 已注册，全量 **97 Path**，「音频处理」新品类已开张），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）；凌晨轮沿用「晚间轮只排小难度」规则。

**本轮四件事**（03:36 全网调研，通用方向）：
1. 音频裁剪器交付确认：`git log` 确认开发交付 1e8057b（波形选区裁剪+试听，WAV/MP3 本地导出）+ 评审修复 357f056（框选起止点归一化、lamejs 报错文案）；`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 = 本地 HEAD 4e613d9 一致；`grep` 全量 97 Path（96+1），ID/Path 已注册；候选池划出，已实现清单追加（delta：+ 在线音频裁剪器）。
2. 新晋候选：**图片精确体积压缩器（Compress to Target KB）**。需求证据：dev.to mdshamimali 2026-10-18 DodoDeck 发布帖 headline 功能 "exact KB image resizer"（19 小时前热帖）。痛点真实：证件照/考试报名/公众号/简历附件的「≤X KB」硬限制，现有压缩工具靠手动调质量反复试运气。差异化实锤：仓库 `img-compress` 经查 templates/img_compress.html 无「目标体积/指定大小」模式（grep 零命中），本工具为目标驱动 UX（输入目标 KB → 二分质量+尺寸降级 → 一次命中导出），能力不重叠。可行性：纯前端小难度——canvas toBlob 二分 JPEG/WebP 质量（必要时等比降分辨率），本地循环至 ≤目标体积，实时体积进度条；零依赖无后端。去重：97 Path 中 target_kb/目标体积/精确压缩全零命中。难度小。SEO：图片压缩到指定大小、KB 压缩、证件照压缩。建议 ID `img_target_kb`、Path `/tools/img-target-kb`。P1。
3. 新晋候选：**音频合并器（Audio Merger）**。需求证据：dev.to supertoolkit 2026-10-16《I built 100+ free browser tools》主打 audio in browser（Web Audio API 本地音频编辑主题），与刚开张的「音频处理」品类同构。痛点真实：多段会议录音/语音备忘录拼接、播客片头片尾拼接，桌面方案要装软件、在线方案要上传。可行性：纯前端小难度——多文件上传→decodeAudioData→AudioBuffer 顺序拼接（采样率归一化）→WAV 手工编码/MP3(lamejs)本地导出，与 audio_trimmer 同技术栈（评审刚趟过 lamejs 路线），一轮可交付。去重：97 Path 中 merger/音频拼接零命中（PDF 合并/表格合并为文档类，不重叠）。难度小。SEO：音频合并、MP3 合并、录音拼接。建议 ID `audio_merger`、Path `/tools/audio-merger`。P1（注：音频品类刚交付裁剪器，连续音频品类感知考量留 PM 定序；可与 MP3 标签编辑器 P2 组音频三件套）。
4. 新观察/证据记录：① **单位换算器**——dev.to blanzatools 2026-10-11 14 工具集单列 Unit Converter（长度/重量/温度/数据），PH 10-12 Everyday Tools 榜单 file size converter 为仓库缺口侧证；97 Path 单位换算/unit_converter/文件大小全零命中；纯前端小难度（SI/英制/数据存储单位互转）；工具本身口径、非泛财务计算器，用户方向下可做；P1 观察。② **EPUB 电子书阅读器**——ToolSlash 2026-10-12 发布 catalogue 明列 "EPUB reader"（零遥测本地处理竞品）；纯前端中难度——手写 zip central directory 解析 + DecompressionStream('deflate-raw') 解包 + OPF manifest/spine 章节渲染，零第三方依赖；97 Path epub/电子书/阅读器零命中；建议上午大轮次；P1（中难度留待上午）。③ **V2EX Reloadwright**（2026-10-14，Edge 自动刷新+网页变化监控通知到手机）：变化监控需常驻后台/插件形态，单页无法持久轮询，不单立。④ **DodoDeck AI TTS**（10-18）：TTS 已在池 P2（品类成熟差异化弱），证据未改判。⑤ **365Lab 10-08 40+ 工具榜单**：图标生成器/贴纸生成器/白噪音/屏幕常亮/网名生成器——图标生成器在池 P1（本轮再佐证），其余或已覆盖或 P2 维持。⑥ V2EX 10-17/18（v2explore 聊天插件、ChatGPT MCP 代理、removeobjects.video 需 AI 后端）、HN（Rill Browser 浏览器形态、OpenMuse agent）——均非单页纯前端口径。⑦ WPS 候选表保持冻结归档。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进；凌晨轮只排小难度）：

1. **网站图标生成器（Favicon Generator）** — P1（顺位递进：16 轮新晋→24/25 轮顺延；365Lab 10-08 竞品 + 10-08 40+ 榜单再佐证图标生成器热度；纯前端小难度：上传→16/32/180/192/512 多尺寸→ZIP 打包+HTML 引用代码；97 Path favicon/网站图标/图标生成零命中）。
2. **进制转换器（Base Converter）** — P1（PH 2026-10-12 Everyday Tools 榜单单列，为该榜单仓库唯一缺口，25 轮证据已增强；纯前端小难度：2/8/10/16/32 互转+分组显示+一键复制；开发者工具家族旅程线；97 Path 进制零命中）。
3. **图片精确体积压缩器（Compress to Target KB）** — P1（本轮新晋：DodoDeck 2026-10-18 headline 功能佐证；「≤X KB」硬限制痛点真实；img-compress 无目标体积模式已实锤去重；纯前端小难度：目标 KB 输入→二分质量+尺寸降级→一次命中导出；97 Path 无重叠）。

音频合并器（P1 新晋，音频品类旅程线；与裁剪器同技术栈；连续音频品类感知留 PM 定序）；JSON Schema 验证器（P1，中难度，上午大轮次第一候补）；浏览器屏幕录制器（P1，中难度，上午大轮次）；SRT 字幕编辑器（P1，顺位顺延）；SQLite 数据库查看器（P1，中难度，上午大轮次）；OFD 阅读与转 PDF（P1，难度中-大，上午大轮次）；视频抽帧（P1，难度中，上午轮次）；EPUB 电子书阅读器（P1 新观察，中难度，上午大轮次）；单位换算器（P1 观察）；日期加减/日期差（P1 观察，计算器口径谨慎）；报价单/收据生成器（P1，票据组合，用户方向下顺位不提前）；SVG 转 React JSX（P1 观察，开发者 niche）；屏幕常亮工具（P1，留池）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；白噪音发生器（P2 观察）；番茄钟（P2 观察）；Kanban 看板（P2 观察，应用形态重）；倒计时器（P2 观察，形态泛化）；在线钢琴（P2 观察，娱乐应用形态）；TTS 文本转语音朗读器（P2 观察，品类成熟差异化弱）；MP3 标签编辑器（P2 观察，音频品类三件套位）；贴纸生成器（P2 观察，AI 抠图需后端）；域名生成器（观察，低优先，需出网）等其余候选留池。

**通用候选表增量**（第二十六轮：音频裁剪器已实现划出；新晋图片精确体积压缩器 P1、音频合并器 P1；新观察单位换算器/EPUB 阅读器；全量 97 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 图片精确体积压缩器（Compress to Target KB） | 本轮新晋（dev.to mdshamimali 2026-10-18 DodoDeck 发布帖 headline 功能 "exact KB image resizer"；痛点：证件照/考试报名/公众号「≤X KB」硬限制，现有压缩靠手动调质量反复试运气；差异化实锤：img-compress 无目标体积模式（templates grep 零命中），本工具目标驱动 UX：输入目标 KB→二分质量+尺寸降级→一次命中导出；纯前端小难度，canvas toBlob，零依赖无后端；97 Path target_kb/目标体积/精确压缩零命中） | 小 | P1（本轮新晋） |
| 音频合并器（Audio Merger） | 本轮新晋（dev.to supertoolkit 2026-10-16 100+ browser tools 主打 audio in browser / Web Audio API 本地音频编辑；痛点：多段会议录音/语音备忘录拼接、播客片头片尾拼接，桌面要装、在线要上传；纯前端小难度：多文件上传→decodeAudioData→AudioBuffer 顺序拼接（采样率归一化）→WAV 手工编码/MP3(lamejs)本地导出，与 audio_trimmer 同技术栈；97 Path merger/音频拼接零命中；音频品类第二弹，与 MP3 标签编辑器 P2 组三件套） | 小 | P1（本轮新晋；品类连续感知留 PM 定序） |
| 单位换算器（Unit Converter） | 新观察（dev.to blanzatools 2026-10-11 14 工具集单列 Unit Converter；PH 10-12 Everyday Tools file size converter 仓库缺口侧证；97 Path 单位换算/unit_converter/文件大小零命中；纯前端小难度：长度/重量/温度/数据存储 SI·英制互转；工具本身口径非泛财务计算器，用户方向下可做） | 小 | P1 观察 |
| EPUB 电子书阅读器（EPUB Reader） | 新观察（ToolSlash 2026-10-12 发布 catalogue 明列 "EPUB reader"，零遥测本地处理竞品；纯前端中难度：手写 zip central directory 解析 + DecompressionStream('deflate-raw') 解包 + OPF manifest/spine 章节渲染，零第三方依赖；97 Path epub/电子书/阅读器零命中） | 中 | P1（观察；中难度留待上午大轮次） |

**归档说明**：本轮为 10-19 通用调研第二十六轮——在线音频裁剪器交付闭环（1e8057b + 评审修复 357f056，`/tools/audio-trimmer` 已注册，全量 97 Path，「音频处理」新品类开张），候选池划出，已实现清单 delta 追加；新晋「图片精确体积压缩器」P1（DodoDeck 10-18 headline 功能佐证，≤X KB 硬限制痛点，img-compress 无目标体积模式实锤去重，纯前端小难度）、「音频合并器」P1（supertoolkit 10-16 audio in browser 主题，与裁剪器同技术栈，音频品类旅程线；连续音频品类感知留 PM 定序）；新观察「单位换算器」P1（blanzatools 10-11 + PH 榜单侧证）、「EPUB 电子书阅读器」P1 中难度（ToolSlash 10-12 catalogue，留待上午大轮次）；V2EX Reloadwright（需常驻后台/插件形态不单立）、removeobjects.video（AI 后端不单立）、Rill Browser/OpenMuse（agent/浏览器形态不单立）均无单页信号；TTS P2 维持；365Lab 榜单再佐证图标生成器热度；WPS 候选表保持冻结归档；仓库 97 注册工具全量核对无重叠，核稿反馈（立候选前先 grep，中文名+ID 片段双核）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 = 本地 HEAD 4e613d9 一致；`git log` 确认开发交付 1e8057b + 评审修复 357f056；`grep tools/categories.go` 全量 97 Path（96+1），`audio_trimmer` ID 与 `/tools/audio-trimmer` Path 已注册（划入已实现），新候选建议 ID（img_target_kb / audio_merger / unit_converter / epub_reader）与 97 Path 无重叠；target_kb/目标体积/merger/音频拼接/单位换算/epub/电子书关键词在 categories.go 核对；img-compress 无目标体积模式经 templates grep 实锤；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-19 01:39 排期轮）

## 今日任务（2026-10-19 01:39 · 产品经理排期决策 ✅）

**交付状态**：待前端开发轮交付。10-19 排期决策轮（01:00 第二十五轮研究之后）。图片复古做旧已交付闭环（23:00 PM 决策轮立项→开发交付 14f9016；`grep tools/categories.go` 确认 ID `img_retro_filter`、Path `/tools/img-retro-filter` 已注册，全量 **96 Path**），候选池划出。本轮立项**今日唯一任务：在线音频裁剪器（Audio Trimmer）**。

**选定：在线音频裁剪器（/tools/audio-trimmer）** — 本轮唯一任务：
- **凌晨轮只排小难度（既定规则）**：01:00 研究轮明确「01:00 凌晨轮沿用『晚间轮只排小难度』规则」；JSON Schema 验证器（中难度，21:00 轮已明确「晚间轮一天内高质量交付风险大，留待上午大轮次」）本轮不立项，顺位递进留池（第一候补，上午大轮次优先）。
- **本轮新晋 + 证据最硬**：25 轮新晋 P1，六家形态验证（notevibes MP3 Cutter / zalt.me / aivideogenerator.so / audio.pi7.org / ercc.cc 中文音频裁剪 / docfixer.online），全部 "100% in browser, Web Audio API, no upload, no watermark" 口径，与仓库 local-first 铁律同构。
- **开辟「音频处理」新品类**：`grep tools/categories.go` 核对——`audio/音频/mp3/MP3/wav/剪辑/trim/音频裁剪` 全零命中，仓库零音频工具；现有品类（图片处理/文档转换/开发工具/生活工具等）均无音频工具，差异化强。
- **用户方向一致**：聚焦 ToolWeb 工具本身，非泛财务/生活计算器；品类错峰（图片→时间→音频），用户侧感知不重复。
- **纯前端小难度、一轮可高质量交付**：Web Audio API decodeAudioData 解码→canvas 波形渲染→拖拽起止手柄+毫秒微调+选区试听→AudioBuffer 切片→WAV 手工编码导出，零依赖；MP3 导出用 lamejs 本地 vendor（仓库已有 SheetJS 本地 vendor 先例）。

**规格**：
1. 上传/拖拽音频：MP3/WAV/OGG/M4A 多格式（decodeAudioData 解码），FileReader 全本地处理；工具页显著位置隐私声明：「音频只在你的浏览器里处理，不上传服务器」。
2. 波形渲染：canvas 绘制波形概览（峰值抽取），缩放自适应；加载中状态友好提示。
3. 裁剪选区：拖拽起止手柄选定区间 + 开始/结束时间毫秒级微调输入（精确到毫秒），选区外区域灰化。
4. 选区试听：播放选中区间（循环预览可选），播放进度指示条同步。
5. 导出：AudioBuffer 切片→WAV 手工编码本地下载（零依赖）；MP3 导出用 lamejs 本地 vendor（比特率 64/128/192/320kbps 可选）。
6. 纯前端、零 CDN 依赖、无后端调用；响应式，桌面端优先、移动端可用。
7. 注册：`tools/categories.go` 新增「音频处理」品类（ID `audio`，Icon `audio_file`），新增工具 ID `audio_trimmer`、Path `/tools/audio-trimmer`（New: true），中英文描述 + SEO keywords（音频裁剪、音频剪辑、MP3裁剪、语音裁剪、audio trimmer）；与 MP3 标签编辑器（P2 在池）预留互链位。

**验收标准**：
- [ ] `/tools/audio-trimmer` 可开（200）
- [ ] 上传 MP3/WAV/OGG 后波形正确渲染；长音频（≥10 分钟）渲染无明显卡顿
- [ ] 拖拽起止手柄 + 毫秒微调选区正确；试听播放选中区间正常，进度指示同步
- [ ] WAV 本地导出成功，文件可播、时长与选区一致
- [ ] MP3 导出成功（如含 lamejs 路线），比特率可调、文件可播
- [ ] 隐私声明显著；DevTools Network 抽查无后端调用、无 CDN 依赖
- [ ] `categories.go` 注册完成（「音频处理」新品类，New: true），首页/导航/sitemap 生效
- [ ] 移动端可操作（上传+选区+试听+导出）
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/audio_trimmer.html`（新建：上传拖拽区+波形画布+起止手柄+时间微调+试听+导出按钮，纯前端）、`static/js/audio_trimmer.js`（新建：Web Audio 解码、波形渲染引擎、选区引擎、AudioBuffer 切片、WAV 手工编码，零依赖）、`static/js/vendor/lamejs.min.js`（可选：MP3 导出本地 vendor，仓库 SheetJS vendor 先例）、`tools/categories.go`（「音频处理」新品类+工具注册）、`BACKLOG.md`（本小节）。

**未选**：
- JSON Schema 验证器（P1，第一候补；kkp DevTrove 10-13 + pyfiletoolkit 08-08 + Varkido 10-01 三重证据；中难度——ajv 本地 vendor 或自研 draft-07 核心子集 + 错误行列定位，「难度中留待上午大轮次」规则顺位递进留池，下轮优先）。
- 网站图标生成器（P1，顺位顺延：16 轮新晋→24 轮顺延；365Lab 10-08 竞品形态验证；纯前端小难度：上传→16/32/180/192/512 多尺寸→ZIP 打包+HTML 引用代码；96 Path 无重叠）。
- 进制转换器（P1 观察：本轮证据增强，PH 10-12 Everyday Tools 榜单单列，为该榜单仓库唯一缺口；纯前端小难度）。
- 浏览器屏幕录制器（P1；中难度，适合上午大轮次）；SRT 字幕编辑器（P1，顺位顺延）；SQLite 数据库查看器（P1，中难度，留待上午大轮次）；OFD 阅读与转 PDF（P1，中-大，适合上午大轮次）；视频抽帧（P1，难度中，适合上午轮次）；日期加减/日期差（P1 观察，计算器口径谨慎）；报价单/收据生成器（P1，票据组合，用户方向下顺位不提前）；SVG 转 React JSX（P1 观察，开发者 niche）；屏幕常亮工具（P1，留池）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；白噪音发生器（P2 观察）；番茄钟（P2 观察）；Kanban 看板（P2 观察，应用形态重）；倒计时器（P2 观察，形态泛化）；在线钢琴（P2 观察，娱乐应用形态）；TTS 文本转语音朗读器（P2 观察，品类成熟差异化弱）；MP3 标签编辑器（P2 观察，音频品类互链位）；贴纸生成器（P2 观察，AI 抠图需后端）；域名生成器（观察，低优先，需出网）等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 = 本地 HEAD 4330fca 一致；`git log` 确认开发交付 14f9016 + 研究轮 4330fca；`grep tools/categories.go` 全量 96 Path（95+1），`img_retro_filter` ID 与 `/tools/img-retro-filter` Path 已注册（划入已实现），新候选 ID `audio_trimmer`、Path `/tools/audio-trimmer` 与 96 Path 无重叠（`audio/音频/mp3/MP3/wav/剪辑/trim` 全零命中；现有品类均无音频工具）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-19 01:00 第二十五轮研究）

## 今日任务（2026-10-19 01:00 · 产品调研员研究轮 ✅）

**交付状态**：10-19 通用调研第二十五轮（WPS 特别方向 10-09~10-15 已结束；用户方向修正 2026-10-18 持续有效：聚焦 ToolWeb 工具本身，不扩展泛财务/生活计算器）。图片复古做旧已交付闭环（23:00 PM 决策轮立项→开发交付 14f9016；`grep tools/categories.go` 确认 ID `img_retro_filter`、Path `/tools/img-retro-filter` 已注册，全量 **96 Path**），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮四件事**（01:00 全网调研，通用方向）：
1. 复古做旧交付确认：`git log` 确认开发交付 14f9016（柯达/富士胶片调色+CCD数码风+漏光暗角颗粒，纯前端本地导出）；`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 = 本地 HEAD 14f9016 一致；`grep tools/categories.go` 全量 96 Path（95+1），ID/Path 已注册；候选池划出，已实现清单追加（delta：+ 图片复古做旧；历史全量见下方各轮小节）。
2. 新晋候选：**在线音频裁剪器（Audio Trimmer）**。需求证据簇（六家形态验证，技术路线成熟）：① notevibes MP3 Cutter（Web Audio API 本地处理，"Your file never leaves your device"，可选 64/192/320kbps 导出）；② zalt.me Audio Trimmer（Web Audio API + lamejs 本地编解码，无上传无水印无时长限制）；③ aivideogenerator.so（浏览器内 FFmpeg 剪辑）；④ audio.pi7.org（WebAssembly 本地切割，"zero audio bytes leave the browser"，200MB 实测）；⑤ ercc.cc 音频裁剪（中文单页：波形视图+WAV 无损导出）；⑥ docfixer.online（毫秒级时间输入+裁剪区试听）。痛点真实：录音/语音备忘录去头尾静音、播客/采访取片段、会议录音截取——桌面软件要装（Audacity）、云端方案有隐私顾虑、免费版限时长加水印；「打开页面即剪、本地导出」与仓库 local-first 铁律同构。可行性：纯前端小难度——上传音频→decodeAudioData 解码→canvas 波形渲染→拖拽起止手柄（毫秒微调+试听预览）→AudioBuffer 切片→WAV 手工编码导出（零依赖）；MP3 导出需 lamejs 本地 vendor（仓库已有 SheetJS 本地 vendor 先例），可先做 WAV 路线。去重：96 Path 中 mp3/音频/audio/wav/剪辑/trim 全零命中（仓库零音频工具，开辟「音频处理」新品类；MP3 标签编辑器 P2 观察在池，可互链成音频组合）。难度小。SEO：音频剪辑、音频裁剪、MP3裁剪、语音裁剪、audio trimmer。建议 ID `audio_trimmer`、Path `/tools/audio-trimmer`。P1。
3. 证据增强：**进制转换器**。Product Hunt 2026-10-12 "Everyday Tools" 套装（regex tester / Base64 encoder / hash generator / UUID v4 generator / number base converter / IP subnet calculator / Markdown viewer / file size converter）单列 number base converter——其中 Base64/UUID/Markdown/IP 子网计算器仓库已覆盖，进制转换为该榜单中仓库唯一缺口；英文形态族（dev.to velnoxlabstools 51 工具集 / Everyday Tools PH）二重化。痛点真实：开发/运维日常进制换算（掩码/颜色值/调试），现有在线方案多带广告。纯前端小难度：2/8/10/16/32 进制互转+分组显示+一键复制；与 timestamp/cron/uuid/base64 开发者工具家族旅程线。去重：96 Path 进制零命中。难度小。P1（观察→证据增强）。
4. 无新单页信号侧：① V2EX 10-18/19：NASDrop（群晖 SPK + Docker，桌面/NAS 形态）、TokenMarket（AI API 中转小站，需后端）、ATBCmder（macOS 原生文件管理器 App）、rainbowsea 看榜小工具（tranco 每日拉取 + GitHub Action 流水线，需后端数据）、OpenI 免费算力社区（平台形态）——均非单页纯前端口径；② HN：Tiny Little Office（浏览器办公套件，16 轮已判单页承载过大）、WallHop（付费墙绕过，灰色地带不做）、Quake Rust 移植（游戏）、HN hiring thread 情报站（招聘分析）——无单页新信号；③ PdfWord 47 PDF 工具（2026-10-12 PH 上线）：eSign 已交付、OCR 仓库已有 ocr_image_text/ocr_batch、merge/split/compress/转 Word 仓库已覆盖，redact 为 PDF niche 增强暂不单立；④ laing_lii Site Tools Box（2026-10-18 dev.to 20+ 工具集）：DNS & Whois Lookup——仓库已有 dns-lookup/domain-check，不立；Bulk Domain Availability（RDAP 批量，domain-check 转 VPS 决策未定）；E-commerce & ROI 计算器——用户方向下不扩展；⑤ WPS 候选表保持冻结归档（本轮为通用方向）。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进；01:00 凌晨轮沿用「晚间轮只排小难度」规则）：

1. **在线音频裁剪器（Audio Trimmer）** — P1（本轮新晋：六家形态验证 + Web Audio API 纯前端路线成熟；仓库零音频工具，开辟「音频处理」新品类；纯前端小难度：波形渲染+拖拽裁剪+WAV 本地导出零依赖；96 Path 无重叠）。SEO：音频剪辑、音频裁剪、MP3裁剪。
2. **网站图标生成器（Favicon Generator）** — P1（顺位递进：16 轮新晋→24 轮顺位顺延；365Lab 10-08 竞品形态验证；纯前端小难度：上传→16/32/180/192/512 多尺寸生成→ZIP 打包+HTML 引用代码；96 Path favicon/网站图标/图标生成零命中；开发者/建站人群旅程线）。
3. **JSON Schema 验证器（JSON Schema Validator）** — P1（顺位第一候补，22→23→24 轮连续递进；kkp DevTrove 10-13 + pyfiletoolkit 08-08 + Varkido 10-01 三重证据；但纯前端中难度→留待上午大轮次高质量交付。若凌晨轮只排小难度，顺位递补日期加减/日期差工具（P1 观察：dev.to 10-13 榜单验证，纯前端小难度，时间效率口径））。

浏览器屏幕录制器（P1，中难度，上午大轮次）；SRT 字幕编辑器（P1，顺位顺延）；SQLite 数据库查看器（P1，中难度，上午大轮次）；OFD 阅读与转 PDF（P1，中-大，上午大轮次）；视频抽帧（P1，中难度，上午轮次）；进制转换器（P1 证据增强：PH 10-12 Everyday Tools 榜单单列，为该榜单仓库唯一缺口）；报价单/收据生成器（P1，票据组合，用户方向下顺位不提前）；SVG 转 React JSX（P1 观察，开发者 niche）；屏幕常亮工具（P1，留池）；金额大写转换器（节奏调节位）；年会大屏抽奖（时令预热）；日期加减/日期差（P1 观察，纯前端小难度，凌晨轮递补位）；白噪音发生器（P2 观察）；番茄钟（P2 观察）；Kanban 看板（P2 观察，应用形态重）；倒计时器（P2 观察，形态泛化）；在线钢琴（P2 观察，娱乐应用形态）；TTS 文本转语音朗读器（P2 观察，品类成熟差异化弱）；MP3 标签编辑器（P2 观察，音频品类互链位）；贴纸生成器（P2 观察，AI 抠图需后端）；域名生成器（观察，低优先，需出网）等其余候选留池。

**通用候选表增量**（第二十五轮：复古做旧已实现划出；新晋音频裁剪器 P1、进制转换器证据增强；全量 96 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 在线音频裁剪器（Audio Trimmer） | 本轮新晋（六家形态验证：notevibes MP3 Cutter / zalt.me / aivideogenerator.so / audio.pi7.org / ercc.cc 中文音频裁剪 / docfixer.online——全部 "100% in browser, Web Audio API, no upload, no watermark" 口径，与仓库 local-first 铁律同构；痛点：录音/语音备忘录去头尾静音、播客/采访取片段、会议录音截取，桌面软件要装、云端方案有隐私顾虑、免费版限时长加水印；纯前端小难度：decodeAudioData→canvas 波形→拖拽起止手柄+毫秒微调+试听→AudioBuffer 切片→WAV 手工编码导出零依赖；MP3 导出可选 lamejs 本地 vendor（仓库有 SheetJS vendor 先例）；96 Path mp3/音频/audio/wav/剪辑/trim 全零命中，仓库零音频工具，开辟「音频处理」新品类；MP3 标签编辑器 P2 在池可互链） | 小 | P1（本轮新晋） |
| 进制转换器 | 证据增强（Product Hunt 2026-10-12 "Everyday Tools" 榜单单列 number base converter；该榜单 Base64/UUID/Markdown/IP 子网计算器仓库已覆盖，进制转换为唯一缺口；dev.to velnoxlabstools 51 工具集形态族二重化；纯前端小难度：2/8/10/16/32 进制互转+分组显示+一键复制；96 Path 进制零命中；开发者工具家族 timestamp/cron/uuid/base64 旅程线） | 小 | P1（证据增强，观察） |

**归档说明**：本轮为 10-19 通用调研第二十五轮——图片复古做旧交付闭环（14f9016，`/tools/img-retro-filter` 已注册，全量 96 Path），候选池划出，已实现清单 delta 追加；新晋「在线音频裁剪器」P1（六家形态验证 + Web Audio API 路线成熟，仓库零音频工具开辟新品类，纯前端小难度 WAV 零依赖路线，96 Path 无重叠）；「进制转换器」证据增强（PH 10-12 Everyday Tools 榜单单列，为该榜单仓库唯一缺口）；V2EX 10-18/19（NASDrop NAS SPK+Docker、TokenMarket AI 中转、ATBCmder macOS App、rainbowsea 需后端流水线、OpenI 平台形态）、HN（Tiny Little Office 单页承载过大、WallHop 灰色地带、Quake 游戏）、PdfWord 47 工具（eSign 已交付/OCR 已有/其余已覆盖）、laing_lii 20+ 工具集（DNS & Whois 仓库已有、ROI 计算器方向下不扩展）均无新单页可落地信号；WPS 候选表保持冻结归档；仓库 96 注册工具全量核对无重叠，核稿反馈（立候选前先 grep，中文名+ID 片段双核）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 = 本地 HEAD 14f9016 一致；`git log` 确认开发交付 14f9016；`grep tools/categories.go` 全量 96 Path（95+1），`img_retro_filter` ID 与 `/tools/img-retro-filter` Path 已注册（划入已实现），新候选建议 ID（audio_trimmer）与 96 Path 无重叠；mp3/音频/audio/wav/剪辑/trim/进制/favicon/网站图标/图标生成关键词在 categories.go 核对（零音频工具；Base64/UUID/Markdown/子网计算器/DNS 已有）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-18 23:00 排期轮）

## 今日任务（2026-10-18 23:00 · 产品经理排期决策 ✅）

**交付状态**：待前端开发轮交付。10-18 排期决策轮（23:00 第二十四轮研究之后）。时区转换器已交付闭环（21:00 PM 决策轮立项→开发交付 c2e5f69 + 评审反馈修复 df583c7；`grep tools/categories.go` 确认 ID `timezone_converter`、Path `/tools/timezone-converter` 已注册，全量 **95 Path**），候选池划出。本轮立项**今日唯一任务：图片复古做旧（复古滤镜/胶片质感）**。

**选定：图片复古做旧（/tools/img-retro-filter）** — 本轮唯一任务：
- **晚间轮只排小难度（既定规则）**：JSON Schema 验证器（中难度，21:00 PM 决策已明确「晚间轮一天内高质量交付风险大，留待上午大轮次」）、屏幕录制器（中难度，研究轮明确「适合上午大轮次」）本轮均不立项，顺位递进留池（JSON Schema 仍为第一候补）。
- **日期加减/日期差不立项**：P1（观察，计算器口径）——用户 10-18 方向修正持续有效（聚焦 ToolWeb 工具本身，不扩展泛财务/生活计算器），且其「星期/ISO 周数/与今日差值」口径与既有 timestamp（时间戳转换）有潜在感知重叠，本轮不占位。
- **证据四重化**：365Lab 10-08 竞品 + Medium 榜单 + dev.to 形态族 + Medium Siloshan 2026-10-18（15 小时前）《7 Free Browser Tools Worth Bookmarking This October》单列 OldRoll（retro film or digicam look）。
- **图片品类错峰位已到**：19:00 十字绣（图片品类）→21:00 时区转换器（时间/效率品类）→本轮回图片品类，感知不重复（沿用「连续图片感知重复错峰」规则）。
- **痛点真实**：手机修图 App 要么收费解锁滤镜、要么导出加水印；「打开页面即修、本地导出不上传」无隐私顾虑，符合仓库 local-first 惯例。
- **去重通过**：95 Path 中 `复古/retro/film/胶片/ccd/做旧/滤镜` 全量唯一字面命中为 `pixel_art_converter` 描述中的「GameBoy/PICO-8 复古调色板」——该工具是像素量化风，与本工具的胶片颗粒/漏光/褪色/暗角能力无重叠（规格中明确差异化），ID `img_retro_filter`、Path `/tools/img-retro-filter` 无重叠。
- **纯前端小难度、一天可高质量交付**：canvas 滤镜矩阵 + 噪点/漏光叠加 → 胶片/CCD 质感 → 本地导出；零依赖、无后端、无 CDN。

**规格**：
1. 上传/拖拽图片：FileReader + canvas 全本地处理，不上传；支持多格式（JPEG/PNG/WebP）。
2. 预设滤镜组（≥6 种）：胶片暖黄（Kodak/Fuji 风格调色矩阵）、CCD 数码风（高对比+冷色偏）、褪色老照片、黑白胶片（颗粒强化）、漏光叠加、Vignette 暗角；每种预设有强度滑杆（0–100）可调。
3. 胶片颗粒噪点：可调粒度的随机噪点叠加（纯前端生成，不依赖图片纹理包）。
4. 实时预览：canvas 即时渲染；原图/效果对比（滑动对比条）。
5. 本地导出：PNG/JPEG 下载（JPEG 质量可选 0.8/0.92/1.0），导出不携带原图 EXIF 隐私（canvas 重绘即自然剥离）。
6. 纯前端、零第三方依赖、无后端调用；响应式，桌面端优先、移动端可用。
7. 注册：`tools/categories.go`「图片处理」品类新增 ID `img_retro_filter`、Path `/tools/img-retro-filter`（New: true），中英文描述 + SEO keywords（复古滤镜、胶片质感、CCD 风、老照片做旧、retro film filter），与 `pixel_art_converter`（图片转像素画）双向互链（图片品类互链，与 img_compress/cross_stitch_pattern 同属旅程线）。

**验收标准**：
- [ ] `/tools/img-retro-filter` 可开（200）
- [ ] 上传照片后 ≥6 种预设滤镜实时生效，强度滑杆 0–100 可调，预览无卡顿
- [ ] 原图/效果对比条拖动正常；胶片颗粒强度可调且可关闭
- [ ] PNG/JPEG 本地导出成功，文件可开；JPEG 三档质量导出体积递减
- [ ] DevTools Network 抽查无后端调用、无 CDN 依赖
- [ ] `categories.go` 注册完成（「图片处理」品类，New: true），首页/导航/sitemap 生效；与 pixel_art_converter 双向互链
- [ ] 移动端可操作（上传+预览+导出）
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/img_retro_filter.html`（新建：上传拖拽区+预设滤镜面板+强度滑杆+对比条+导出按钮，纯前端）、`static/js/img_retro_filter.js`（新建：滤镜矩阵库、噪点/漏光/暗角叠加引擎、canvas 实时渲染，零依赖）、`tools/categories.go`（「图片处理」品类注册+与 pixel_art_converter 互链）、`BACKLOG.md`（本小节）。

**未选**：
- JSON Schema 验证器（P1，第一候补；三重证据；中难度——ajv 本地 vendor 或自研 draft-07 核心子集 + 错误行列定位，参照「难度中留待上午大轮次」规则顺位递进留池，下轮优先）。
- 浏览器屏幕录制器（P1；waqar112 40+ 工具集 + MediaRecorder API 纯前端路线验证；中难度，适合上午大轮次；顺位递进留池）。
- 日期加减/日期差（P1 观察：计算器口径，用户方向下不扩展；与 timestamp 感知重叠风险；本轮不占位）。
- 网站图标生成器（P1，顺位顺延）；SVG 转 React JSX（P1 观察，开发者 niche）；屏幕常亮工具（P1，留池）；SRT 字幕编辑器（P1，顺位顺延）；SQLite 数据库查看器（P1，难度中，留待上午大轮次）；OFD 阅读与转 PDF（P1，难度中-大，适合上午大轮次）；报价单/收据生成器（P1，票据组合，用户方向下顺位不提前）；视频抽帧（P1，难度中，适合上午轮次）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；进制转换器（P1 观察）；白噪音发生器（P2 观察）；番茄钟（P2 观察）；Kanban 看板（P2 观察，应用形态重）；倒计时器（P2 观察，形态泛化）；在线钢琴（P2 观察，娱乐应用形态）；TTS 文本转语音朗读器（P2 观察，品类成熟差异化弱）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察，AI 抠图需后端）；域名生成器（观察，低优先，需出网）等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥，known_hosts 换机修复后重拉成功）确认 origin/muse/dev-20260929 = 本地 HEAD f68ca90 一致；`git log` 确认开发交付 c2e5f69 + 评审修复 df583c7 + 研究轮 f68ca90；`grep tools/categories.go` 全量 95 Path（94+1），`timezone_converter` ID 与 `/tools/timezone-converter` Path 已注册（划入已实现），新候选 ID `img_retro_filter`、Path `/tools/img-retro-filter` 与 95 Path 无重叠（`复古/retro/film/胶片/ccd/做旧/滤镜` 全量唯一字面命中为 pixel_art_converter 描述，能力无重叠）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-18 23:00 第二十四轮研究）

## 今日任务（2026-10-18 23:00 · 产品调研员研究轮 ✅）

**交付状态**：10-18 通用调研第二十四轮（WPS 特别方向已结束；用户方向修正持续有效：聚焦 ToolWeb 工具本身，不扩展泛财务/生活计算器）。时区转换器已交付闭环（21:00 PM 决策轮立项→开发交付 c2e5f69 + 评审反馈修复 df583c7；`grep tools/categories.go` 确认 ID `timezone_converter`、Path `/tools/timezone-converter` 已注册，全量 **95 Path**），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮五件事**（23:00 全网调研，通用方向）：
1. 时区转换器交付确认：`git log` 确认开发交付 c2e5f69（多城市并排对比+会议时间对齐+DST 自动处理）+ 评审反馈修复 df583c7（meetingNow 基准时区取当前时刻、tick 跨日刷新、分享链接空值清理、Node 测试入仓）；`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 = 本地 HEAD df583c7 一致；`grep tools/categories.go` 全量 95 Path（94+1），ID/Path 已注册；候选池划出，已实现清单追加（delta：+ 时区转换器；历史全量见下方各轮小节）。
2. 新晋候选：**浏览器屏幕录制器（Screen Recorder）**。需求证据：dev.to waqar112 2026-09-20《I Built 40+ Free Browser Tools》单列 "4K Screen Recorder with webcam overlay (using MediaRecorder API)"——技术路线验证（纯前端 MediaRecorder API 可成）；痛点真实：录屏工具要么装桌面软件，要么在线方案免费版限时长（Loom 免费版 5 分钟上限、付费 $50+/年），「打开页面即录、录完本地导出」有真实场景（录操作演示、Bug 复现、临时演示）。可行性：纯前端中难度——getDisplayMedia 捕获屏幕/窗口/标签页→MediaRecorder 编码（WebM/VP9）→暂停/继续→录完本地导出下载，摄像头画中画可选（同屏 getUserMedia 叠加 canvas 合成）；零依赖、无后端、无 CDN；HTTPS/localhost 环境 getDisplayMedia 直接可用（/tool-web 为 HTTPS，条件成立）。去重：95 Path 中 recorder/录屏/录制/屏幕录全零命中（无音频/视频录制类工具，开辟新方向）。难度中。SEO：在线录屏、屏幕录制、screen recorder。建议 ID `screen_recorder`、Path `/tools/screen-recorder`。P1（中难度，适合上午大轮次；但纯前端零依赖、测试自包含）。
3. 新晋候选：**日期加减/日期差工具（Date Add & Subtract）**。需求证据：dev.to md_shohan 2026-10-13（5 天前）《I Replaced My Productivity Apps with 10 Free Browser Tools》同文单列 Date Add / Subtract（含 ISO 周数、可复制 ISO 8601 时间戳）——与时区转换器出自同一榜单的品类族验证（该榜单单列时区转换器已兑现交付）；项目排期/考勤/合同起止日常需求。差异化：仓库 timestamp 仅做时间戳互转、在线日历仅为日历视图，均无「N 天后是几号」「两日期相差 X 天 Y 月」计算。纯前端小难度：日期输入+天数/月数/年数加减→结果日期+星期+ISO 周数+与今日差值→一键复制 ISO 8601。去重：95 Path 中 date_add/日期差/日期加减/日期计算全零命中。难度小。SEO：日期计算器、日期加减、天数计算。建议 ID `date_add_subtract`、Path `/tools/date-add-subtract`。P1（观察：带「计算器」字样，用户方向下只做时间/效率口径，不扩展泛生活计算器）。
4. 证据强化：**图片复古做旧**获最新佐证——Medium Siloshan 2026-10-18（15 小时前）《7 Free Browser Tools Worth Bookmarking This October》单列 OldRoll（retro film or digicam look），与既有 365Lab 10-08 竞品+Medium 榜单+dev.to 形态族形成四重验证；且时区（时间品类）已交付，图片品类感知重复错峰完毕（21 轮/23 轮两轮连续非图片品类），节奏位已到。
5. 无新单页信号侧：① 同 Medium Siloshan 榜单其余项——SyncWhen（无注册会议约时间：需多人协作/后端，非单页口径，不单立）；SortaSeat（婚礼座位表：应用形态重，不单立）；urPiano（浏览器弹钢琴：Web Audio 可实现但属娱乐应用形态，P2 观察）；llmspeed（本地 AI 模型跑速评估：AI niche，不单立）；Calcy（带单位科学计算器：方向下计算器类谨慎，观察不单立）。② dev.to yuvaraj_radhakrishnan 59 开发者工具集——PII Masker（仓库已有 `text_privacy_masker`，不单立）；JWT Inspector（仓库已有 `jwt`）；Universal Encoder/Decoder（仓库已有 Base64/URL/HTML 实体编解码三件套）；AI Token Counter（仓库已有 `ai_token_counter`）；RSA & ECC Key Generator（仓库已有 `rsa` 加解密，密钥生成功能同族）；System Prompt Builder / AI Text Humanizer / Prompt Cost Trimmer（AI niche，不单立）。③ blanzatools 14 工具其余项——Image Compressor（仓库已有 `img-compress`）、Countdown Timer（P2 观察）、JSON Formatter（仓库已有 `json_parser`）；④ V2EX 本轮仅算力社区帖，HN 无新单页信号；⑤ WPS 候选表保持冻结归档。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **图片复古做旧** — P1（证据四重化：365Lab 10-08 + Medium 榜单 + dev.to 形态族 + Siloshan 10-18（15 小时前）OldRoll retro film/digicam look；图片品类错峰位已到：时区已交付、JSON Schema 与屏幕录制均为非图片品类；纯前端小难度：canvas 滤镜矩阵+噪点/漏光叠加→胶片/CCD 质感→导出；图片品类互链；95 Path 无重叠）。SEO：复古滤镜、胶片质感、CCD 风。
2. **JSON Schema 验证器** — P1（顺位递进：20 轮新晋→21/22/23 轮连续递进第一候补；三重证据；纯前端中难度 ajv 本地 vendor+错误行列定位；建议上午大轮次单独占一轮高质量交付；json 工具家族互链；95 Path 无重叠）。
3. **浏览器屏幕录制器（Screen Recorder）** — P1（本轮新晋：waqar112 40+ 工具集 + MediaRecorder API 纯前端路线验证；Loom 免费版 5 分钟限时痛点真实；零依赖无后端；95 Path recorder/录屏/录制全零命中，开辟浏览器媒体录制新方向；/tool-web 为 HTTPS，getDisplayMedia 权限条件成立）。若晚间轮只排小难度，顺位递补日期加减工具（P1 观察：纯前端小难度，日期加减/日期差/ISO 周数，时间效率口径，95 Path 无重叠）。

屏幕常亮工具（P1，留池）；网站图标生成器（P1，顺位顺延）；SVG 转 React JSX（P1 观察，开发者 niche）；SRT 字幕编辑器（P1，顺位顺延）；OFD 阅读与转 PDF（P1，难度中-大，适合上午大轮次）；报价单/收据生成器（P1，票据组合，用户方向下顺位不提前）；视频抽帧（P1，难度中，适合上午轮次）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；进制转换器（P1 观察）；日期加减/日期差（P1 观察，计算器口径谨慎）；白噪音发生器（P2 观察）；番茄钟（P2 观察）；Kanban 看板（P2 观察，应用形态重）；倒计时器（P2 观察，形态泛化）；在线钢琴（P2 观察，娱乐应用形态，本轮新评估）；TTS 文本转语音朗读器（P2 观察，品类成熟差异化弱）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察，AI 抠图需后端）；域名生成器（观察，低优先，需出网）等其余候选留池。

**通用候选表增量**（第二十四轮：时区转换器已实现划出；新晋屏幕录制器 P1、日期加减 P1（观察）；图片复古做旧证据四重化；全量 95 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 浏览器屏幕录制器（Screen Recorder） | 本轮新晋（dev.to waqar112 2026-09-20《I Built 40+ Free Browser Tools》单列 "4K Screen Recorder with webcam overlay (using MediaRecorder API)"——纯前端技术路线验证；痛点：桌面软件要安装、在线方案免费版限时长（Loom 5 分钟上限、付费 $50+/年），「打开页面即录、录完本地导出」真实场景：操作演示/Bug 复现；纯前端中难度：getDisplayMedia 捕获屏幕/窗口/标签页→MediaRecorder 编码 WebM→暂停/继续→本地导出，摄像头画中画可选；零依赖无后端；/tool-web 为 HTTPS，权限条件成立；95 Path recorder/录屏/录制全零命中，开辟新方向） | 中 | P1（本轮新晋；适合上午大轮次） |
| 日期加减/日期差工具（Date Add & Subtract） | 本轮新晋（dev.to md_shohan 2026-10-13《I Replaced My Productivity Apps with 10 Free Browser Tools》单列 Date Add / Subtract（含 ISO 周数、可复制 ISO 8601）——与时区转换器同榜单品类族验证；项目排期/考勤/合同起止日常需求；差异化：timestamp 仅时间戳互转、在线日历仅日历视图；纯前端小难度：日期+N 天/月/年→结果+星期+ISO 周数+与今日差值→复制 ISO 8601；95 Path date_add/日期差/日期加减全零命中） | 小 | P1（观察：计算器口径，用户方向下仅时间/效率） |

**归档说明**：本轮为 10-18 通用调研第二十四轮——时区转换器交付闭环（c2e5f69 + 评审修复 df583c7，`/tools/timezone-converter` 已注册，全量 95 Path），候选池划出，已实现清单 delta 追加；新晋「浏览器屏幕录制器」P1（waqar112 40+ 工具集+MediaRecorder API 纯前端路线验证，Loom 免费限时痛点，开辟新方向，建议上午大轮次）、「日期加减/日期差」P1（观察：与时区转换器同榜单品类族验证，纯前端小难度，计算器口径谨慎）；图片复古做旧证据四重化（Siloshan 10-18（15 小时前）OldRoll retro film/digicam look），图片品类错峰位已到；PII 脱敏/图片标注/编码器/AI Token 计数器/JWT/RSA 均仓库已有不单立；会议约时间/座位表需后端或应用形态重不单立；V2EX/HN 本轮无新单页信号；WPS 候选表保持冻结归档；仓库 95 注册工具全量核对无重叠，核稿反馈（立候选前先 grep，中文名+ID 片段双核）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 = 本地 HEAD df583c7 一致；`git log` 确认开发交付 c2e5f69 + 评审修复 df583c7；`grep tools/categories.go` 全量 95 Path（94+1），`timezone_converter` ID 与 `/tools/timezone-converter` Path 已注册（划入已实现），新候选建议 ID（screen_recorder / date_add_subtract）与 95 Path 无重叠；recorder/录屏/录制/date_add/日期差/日期加减/piano/钢琴/会议投票关键词在 categories.go 核对（image_annotator/text_privacy_masker/Base64/URL 编码器已有，不单立）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-18 21:00 排期轮）

## 今日任务（2026-10-18 21:00 · 产品经理排期决策 ✅）

**交付状态**：待前端开发轮交付。10-18 排期决策轮（21:00 第二十三轮研究之后）。照片转十字绣图案生成器已交付闭环（19:00 PM 决策轮立项→开发交付 aa128a2 + 评审反馈修复 379277c；`grep tools/categories.go` 确认 ID `cross_stitch_pattern`、Path `/tools/cross-stitch-pattern` 已注册，全量 **94 Path**），候选池划出。本轮立项**今日唯一任务：时区转换器（Time Zone Converter）**。

**选定：时区转换器（/tools/timezone-converter）** — 本轮唯一任务：
- **顺位递进兑现**：第二十二轮新晋顺位第二→第二十三轮研究轮顺位第一，且 PM 19:00 明确「顺位递进留池，下轮优先」，本轮兑现。
- **节奏错峰**：21:00 十字绣是图片品类，本轮换时间/效率品类，用户侧感知不重复（19:00 十字绣立项时已做过连续图片品类的感知重复讨论，错峰规则一致）。
- **纯前端小难度、一天可高质量交付**：IANA 时区搜索多选→并排时间对比→`Intl.DateTimeFormat` 原生 DST→北京时间/UTC 换算→分享链接，零依赖、无后端、无 CDN 风险；JSON Schema 验证器（Top2）难度中（ajv 本地 vendor 或自研 draft-07 核心子集+错误行列定位），21:00 晚间轮一天内高质量交付风险大，参照 SQLite 留待上午大轮次规则顺位递进留池。
- **形态证据新鲜**：dev.to 2026-10-13（5 天前）《I Replaced My Productivity Apps with 10 Free Browser Tools》单列 Time Zone Converter（40 IANA 时区并排对比，DST 自动处理）——中文单页多为水印广告站。
- **互补非重叠、旅程线闭环**：仓库 `timestamp`（时间戳转换）仅支持本地时区/UTC 二选一，无多城市并排对比、无会议时间对齐视图；与 timestamp 双向互链（时间工具旅程线）。

**规格**：
1. 时区多选：IANA 时区搜索（支持中文城市名/常用城市别名，如「北京/上海→Asia/Shanghai」）+ 多选 + 收藏（localStorage 持久化）；默认预置北京/伦敦/纽约/东京/悉尼。
2. 并排对比视图：选中时区并排时间网格/时间条，显示当地时间、日期、UTC 偏移、与北京时间差；现在时刻一键回到当前。
3. 会议时间对齐：输入一个时间（含时区选择，默认北京时间），自动换算到各选中时区并标注当地是工作时间/深夜（9:00–18:00 高亮）。
4. DST 自动处理：`Intl.DateTimeFormat` 原生，夏令时切换前后边界日期换算正确；选中时区标注当前是否夏令时。
5. 分享链接：选中时区列表编码到 URL 参数，打开即恢复。
6. 纯前端、零第三方依赖、无后端调用；响应式，桌面端优先、移动端可用。
7. 注册：`tools/categories.go`「开发工具」品类新增 ID `timezone_converter`、Path `/tools/timezone-converter`（New: true），中英文描述 + SEO keywords（时区转换、世界时钟、北京时间换算、timezone converter），与 timestamp（时间戳转换）双向互链。

**验收标准**：
- [ ] `/tools/timezone-converter` 可开（200）
- [ ] 多选 3+ 时区并排对比正确；DST 边界（如美国夏令时切换前后）换算正确，夏令时标注正确
- [ ] 会议时间对齐：输入北京时间，换算各选中时区正确，工作时间高亮正确
- [ ] 搜索+收藏可用，刷新后保持；分享链接打开恢复选中时区
- [ ] DevTools Network 抽查无后端调用、无 CDN 依赖
- [ ] `categories.go` 注册完成（「开发工具」品类），首页/导航/sitemap 生效；与 timestamp 互链
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/timezone_converter.html`（新建：搜索多选面板+并排对比视图+会议时间换算，纯前端）、`static/js/timezone_converter.js`（新建：IANA 时区城市库、Intl 时间引擎、分享链接编解码，零依赖）、`tools/categories.go`（「开发工具」品类注册+与 timestamp 互链）、`BACKLOG.md`（本小节）。

**未选**：
- JSON Schema 验证器（P1，本轮新晋：kkp DevTrove 10-13 + pyfiletoolkit 08-08 + Varkido 170+ 10-01 三重证据推翻 21 轮「单条证据不单立」判断；难度中——ajv 本地 vendor 或自研 draft-07 核心子集 + 错误行列定位，21:00 晚间轮一天内高质量交付风险大，参照 SQLite「难度中留待上午大轮次」规则顺位递进留池，下轮优先）。
- 图片复古做旧（P1，顺位顺延；节奏考量：21:00 十字绣刚是图片品类，连续图片感知重复；研究轮明确「时区转换器与 JSON Schema 验证器两轮连续非图片品类之后，再回图片品类感知不重复」）。
- SQLite 数据库查看器（P1，难度中，留待上午大轮次）；OFD 阅读与转 PDF（P1，难度中-大，适合上午大轮次）；网站图标生成器（P1，顺位顺延）；SRT 字幕编辑器（P1，顺位顺延）；SVG 转 React JSX（P1 观察，开发者 niche）；屏幕常亮工具（P1，留池）；报价单/收据生成器（P1，票据组合，用户方向下顺位不提前）；视频抽帧（P1，难度中，适合上午轮次）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；进制转换器（P1 观察）；白噪音发生器（P2 观察）；番茄钟（P2 观察）；Kanban 看板（P2 观察）；倒计时器（P2 观察）；TTS 文本转语音朗读器（P2 观察）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察，AI 抠图需后端）；域名生成器（观察，低优先，需出网）等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 = 本地 HEAD 2eb137a 一致；`grep tools/categories.go` 全量 94 Path，`timezone`/`time-zone`/`时区转换`/`世界时钟` 全零命中（timestamp 仅为时间戳互转，品类不同，去重通过），ID `timezone_converter`、Path `/tools/timezone-converter` 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-18 21:00 第二十三轮研究）

## 今日任务（2026-10-18 21:00 · 产品调研员研究轮 ✅）

**交付状态**：10-18 通用调研第二十三轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研；用户方向修正 2026-10-18 持续有效：聚焦 ToolWeb 工具本身，不扩展泛财务/生活计算器）。照片转十字绣图案生成器已交付闭环（19:00 PM 决策轮立项→开发交付 aa128a2 + 评审反馈修复 379277c；`grep tools/categories.go` 确认 ID `cross_stitch_pattern`、Path `/tools/cross-stitch-pattern` 已注册，全量 **94 Path**），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮四件事**（21:00 全网调研，通用方向）：
1. 十字绣交付确认：`git log` 确认开发交付 aa128a2（DMC 色卡量化+符号图纸+线量估算，纯前端）+ 评审反馈修复 379277c（符号池扩至 65 唯一符号、双向互链补齐、删除冗余近白 DMC、视图 label 高亮同步、PNG 大尺寸动态缩小格距）；`git fetch`（复用 VM 换机 known_hosts 修复，TOOLS.md 既有记载；GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 = 379277c，本地 HEAD 3b02cdc（评审轮缺陷清单补记两条 P0：水印中文静默丢字、二维码识别假功能，ahead 1 本轮不触）；`grep tools/categories.go` 全量 94 Path（93+1）；候选池划出，已实现清单追加（delta：+ 照片转十字绣图案生成器；历史全量见下方各轮小节）。
2. 新晋候选：**JSON Schema 验证器（JSON Schema Validator）**。需求证据从单条变为三重：① dev.to kkp 2026-10-13 DevTrove 22 开发者工具集单列 JSON Schema validator（21 轮记为「开发者 niche 且证据单条，不单立」）；② dev.to pyfiletoolkit 2026-08-08《13 Free Browser Tools Every Developer Needs in 2026》单列 JSON Schema Validator（Validate data against JSON Schema specs）；③ dev.to Varkido 2026-10-01《How I Built 170+ Free Online Tools》170+ 工具集同覆盖——「证据单条」判断被推翻，正式立候选。痛点真实：前后端联调/配置校验时 JSON 结构合规性校验是持续刚需，现有在线方案多要注册或上传。可行性：纯前端中难度——Schema 编辑器 + JSON 实例输入 → 本地校验（ajv 本地 vendor，遵循仓库零 CDN 惯例；或自研 draft-07 核心子集）→ 错误定位行列标注 + 合规/违规一键复制；与 json_parser/json_yaml/text_diff 开发者工具家族双向互链。去重：94 Path 中 `json_schema`/`JSON Schema`/`Schema validator` 全零命中（仅有个别 Icon 字段字面 "schema"，工具无重叠）。难度中。SEO：JSON Schema 校验、JSON 结构验证。建议 ID `json_schema_validator`、Path `/tools/json-schema-validator`。
3. 新观察项（P2/不立，形态或品类受限）：① **番茄钟（Pomodoro Timer）**（dev.to mou1z 2026-09-29《5 Free Developer Tools — No Signup, No Tracking, No Ads》单列，自定义工作/休息间隔；纯前端小难度：工作/休息循环计时+浏览器通知+localStorage 统计；94 Path `pomodoro`/番茄零命中；生活/效率品类，用户方向下不优先，P2 观察，与白噪音发生器/屏幕常亮可组「专注工作」三件套联动）；② **Kanban 看板**（mou1z 同文单列，拖拽+localStorage 持久化；纯前端小难度；94 Path `kanban`/看板零命中；应用形态重于工具形态，P2 观察）；③ **倒计时器（Countdown Timer）**（dev.to blanzatools 2026-10-11 14 工具集单列；纯前端小难度；94 Path `countdown`/倒计时零命中；形态泛化无差异化，P2 观察）；④ **域名生成器**（dev.to etemora 2026-10-10 单列：关键词→多后缀组合生成；生成部分纯前端，但可用性核查依赖出网 RDAP——domain-check 转 VPS 执行决策未定，低优先不单立）。
4. 无新单页信号侧：① V2EX 10-18：NASDrop（群晖 SPK/桌面形态）、AI 视频去物 removeobjects.video（需 AI 后端）、remox.ai 图片擦除去背景（AI API 商业项目）——均非单页纯前端口径；② Reddit 本轮搜索均为营销工具榜单（RankCow/Subreddit Signals 等），无单页工具信号；③ 中文「最实用在线工具」榜单均为 AI 工具白嫖指南（需后端/AI/注册）；④ Medium malikanwaar 10-16 10 工具榜单：年龄/密码/单位换算/单词计数/二维码——仓库已全覆盖（22 轮已评估）；⑤ Medium etemora 8 天前三项形态：SERP Snippet Preview——仓库 `serp_snippet_preview` 已有，不立；Invoice Generator——即票据组合（报价单/收据生成器），用户方向下顺位不提前，维持；Domain name generator——见上（低优先不单立）；⑥ WPS 候选表保持冻结归档（本轮为通用方向）。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **时区转换器（Time Zone Converter）** — P1（PM 19:00 明确「顺位递进留池，下轮优先」；dev.to 10-13（5 天前）新鲜形态验证：40 IANA 时区并排对比 + DST 自动处理；timestamp 仅本地/UTC 二选一，多城市并排对比+会议时间对齐视图无重叠；纯前端小难度：城市多选（IANA 时区搜索+收藏）→并排时间条→`Intl.DateTimeFormat` 原生 DST→北京时间/UTC 换算→分享链接；94 Path 无重叠）。SEO：时区转换、世界时钟。
2. **JSON Schema 验证器（JSON Schema Validator）** — P1（本轮新晋：三重证据推翻 21 轮「单条证据不单立」判断——kkp DevTrove 10-13 + pyfiletoolkit 08-08 + Varkido 170+ 10-01；纯前端中难度：本地校验+错误行列定位；json 工具家族互链；94 Path 无重叠）。SEO：JSON Schema 校验、JSON 结构验证。
3. **图片复古做旧** — P1（顺位顺延；节奏考量：时区转换器与 JSON Schema 验证器是两轮连续非图片品类，本轮之后回图片品类感知不重复）。备选错峰位：SRT 字幕编辑器（P1 顺位顺延，媒体品类）。

图片复古做旧列第三（P1，顺位顺延）；网站图标生成器（P1，顺位顺延）；SVG 转 React JSX（P1 观察，开发者 niche）；SQLite 数据库查看器（P1，难度中，留待上午大轮次）；SRT 字幕编辑器（P1，顺位顺延）；OFD 阅读与转 PDF（P1，难度中-大，适合上午大轮次）；屏幕常亮工具（P1，留池）；报价单/收据生成器（P1，票据组合，用户方向下顺位不提前）；视频抽帧（P1，难度中，适合上午轮次；本轮 tonytoolbox local-first 文章的 FrameExtractor 浏览器原生解码抽帧形态再佐证）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；进制转换器（P1 观察）；白噪音发生器（P2 观察）；番茄钟（P2 观察，本轮新评估）；Kanban 看板（P2 观察，应用形态重）；倒计时器（P2 观察，形态泛化）；TTS 文本转语音朗读器（P2 观察，品类成熟差异化弱）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察，AI 抠图需后端）；域名生成器（观察，低优先，需出网）等其余候选留池。

**通用候选表增量**（第二十三轮：十字绣已实现划出；新晋 JSON Schema 验证器 P1、番茄钟/Kanban 看板/倒计时器 P2 观察；全量 94 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| JSON Schema 验证器（JSON Schema Validator） | 本轮新晋（证据三重化：dev.to kkp 2026-10-13 DevTrove 22 工具单列 JSON Schema validator + dev.to pyfiletoolkit 2026-08-08《13 Free Browser Tools Every Developer Needs in 2026》单列 + dev.to Varkido 2026-10-01 170+ 工具集同覆盖——推翻 21 轮「证据单条不单立」判断；痛点：前后端联调/配置校验时 JSON 结构合规性校验刚需，现有方案多要注册或上传；纯前端中难度：Schema 编辑器+JSON 实例→本地校验（ajv 本地 vendor 或自研 draft-07 核心子集，零 CDN）→错误行列定位；与 json_parser/json_yaml/text_diff 互链；94 Path 中 json_schema/JSON Schema/Schema validator 全零命中） | 中 | P1（本轮新晋） |
| 番茄钟（Pomodoro Timer） | 本轮新观察（dev.to mou1z 2026-09-29《5 Free Developer Tools — No Signup, No Tracking, No Ads》单列，自定义工作/休息间隔；纯前端小难度：工作/休息循环计时+浏览器通知+localStorage 统计；94 Path pomodoro/番茄零命中；生活/效率品类，用户方向下不优先；与白噪音发生器/屏幕常亮可组「专注工作」三件套联动） | 小 | P2 观察 |
| Kanban 看板 | 本轮新观察（dev.to mou1z 2026-09-29 同文单列，拖拽+localStorage 持久化；纯前端小难度；94 Path kanban/看板零命中；应用形态重于工具形态，不优先） | 小 | P2 观察 |
| 倒计时器（Countdown Timer） | 本轮新观察（dev.to blanzatools 2026-10-11 14 工具集单列；纯前端小难度；94 Path countdown/倒计时零命中；形态泛化无差异化，不优先） | 小 | P2 观察 |

**归档说明**：本轮为 10-18 通用调研第二十三轮——照片转十字绣图案生成器交付闭环（aa128a2 + 评审修复 379277c，`/tools/cross-stitch-pattern` 已注册，全量 94 Path），候选池划出，已实现清单 delta 追加；新晋「JSON Schema 验证器」P1（证据三重化：kkp DevTrove 10-13 + pyfiletoolkit 08-08 + Varkido 10-01，推翻 21 轮「单条证据不单立」判断；纯前端中难度：ajv 本地 vendor 或自研 draft-07 核心子集+错误行列定位；json 工具家族互链；94 Path 无重叠）；新观察番茄钟/Kanban 看板/倒计时器 P2（形态或品类受限）；域名生成器低优先不单立（可用性核查依赖出网 RDAP，domain-check 转 VPS 决策未定）；V2EX 10-18（NASDrop NAS 套件、removeobjects.video AI 视频去物、remox.ai AI 抠图）、Reddit（营销工具榜单）、中文榜单（AI 工具白嫖指南）本轮无新单页纯前端信号；Medium malikanwaar 10-16 榜单仓库全覆盖；etemora 三形态：SERP 预览仓库已有、Invoice=票据组合顺位不提前、域名生成器低优先；视频抽帧获 tonytoolbox local-first 文章 FrameExtractor 形态再佐证；WPS 候选表保持冻结归档；仓库 94 注册工具全量核对无重叠，核稿反馈（立候选前先 grep，中文名+ID 片段双核）持续闭环；本轮复用 VM 换机 known_hosts 修复（TOOLS.md 既有记载）。

**交付核对**：`git fetch`（ssh-keyscan 修复 known_hosts 后，GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 = 379277c 存在；本地 HEAD 3b02cdc 为评审轮缺陷清单补记 P0（ahead 1，本轮不触）；`git log` 确认开发交付 aa128a2 + 评审修复 379277c；`grep tools/categories.go` 全量 94 Path（93+1），`cross_stitch_pattern` ID 与 `/tools/cross-stitch-pattern` Path 已注册（划入已实现），新候选建议 ID（json_schema_validator）与 94 Path 无重叠；`json_schema`/`JSON Schema`/`Schema validator`/`pomodoro`/番茄/`kanban`/看板/`countdown`/倒计时关键词在 categories.go 全量零命中（Icon 字面 "schema" 为字段名非工具）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-18 19:00 排期轮）

## 今日任务（2026-10-18 19:00 · 产品经理排期决策 ✅）

**交付状态**：待前端开发轮交付。10-18 排期决策轮（19:00 第二十二轮研究之后）。CSS 渐变生成器已交付闭环（17:40 PM 决策轮立项→开发交付 06bb838 + 评审反馈修复 dabf470；`grep tools/categories.go` 确认 ID `css_gradient_generator`、Path `/tools/css-gradient-generator` 已注册，全量 **93 Path**），候选池划出。本轮立项**今日唯一任务：照片转十字绣图案生成器（Photo → Cross Stitch Pattern）**。

**选定：照片转十字绣图案生成器（/tools/cross-stitch-pattern）** — 本轮唯一任务：
- **顺位递进兑现**：第二十轮新晋顺位第三→第二十一轮顺位第二→第二十二轮顺位第一，且 PM 17:40 明确「顺位递进留池，下轮优先」，本轮兑现。
- **感知重复风险已解除**：13:30 隐写、15:38 像素画连续两轮图片品类→17:40 渐变已换开发者/设计品类，本轮回图片品类并非连续三轮（17:40 决策轮的担忧已消解）。
- **形态证据最硬**：Medium 10-18 今日榜单单列 StitchCraft（照片转十字绣，全浏览器运行、无需注册）+ dev.to 09-06 《How to Turn Any Photo Into a Cross Stitch Pattern》英文形态验证（DMC 配色+PDF 导出免费无上限）——双重验证；中文在线单页形态稀缺。
- **纯前端小难度、一天可高质量交付**：上传照片→网格缩小（针数/布数可调）→DMC 线色量化（内置约 450 色色卡表）→符号网格渲染（标 DMC 色号+线量估算）→导出 PNG/打印 PDF，零依赖、无后端、无 CDN 风险。
- **旅程线闭环**：与 img-compress/img-convert/img-mosaic/pixel-art-converter 等图片处理品类双向互链。

**规格**：
1. 输入：上传照片（PNG/JPG/WebP，拖拽+点击双通道）；工具页显著位置隐私声明：「图片只在你的浏览器里处理，不上传服务器」。
2. 网格参数：宽×高针数可调（滑块/数字输入），实时显示成品绣布边长换算（14CT/11CT/18CT 等常用布数）。
3. DMC 量化：内置 DMC 色卡表（约 450 色）最近邻颜色匹配；色数限制可选；每色分配符号标记（黑白打印可区分）。
4. 图案渲染：符号/色块网格图预览（symbol chart），标注 DMC 色号、每色针数、预估线量（股数×绣线长度估算）；色数过多时提示合并建议。
5. 导出：导出 PNG（符号图高清）；浏览器打印 PDF（沿仓库浏览器打印惯例）。
6. 纯前端、零第三方依赖、无后端调用；响应式，桌面端优先、移动端可用。
7. 注册：`tools/categories.go`「图片处理」品类新增 ID `cross_stitch_pattern`、Path `/tools/cross-stitch-pattern`（New: true），中英文描述 + SEO keywords（十字绣图案、照片转十字绣、十字绣图纸生成、cross stitch pattern），与 img-compress/img-convert/img-mosaic/pixel-art-converter 双向互链。

**验收标准**：
- [ ] `/tools/cross-stitch-pattern` 可开（200）
- [ ] 上传照片→调节针数→DMC 量化→符号网格渲染正确，色号标注准确；不同针数下换算边长正确
- [ ] 线量估算合理；导出 PNG 与预览一致；打印 PDF 可用
- [ ] 隐私声明显著；DevTools Network 抽查无后端调用、无 CDN 依赖
- [ ] `categories.go` 注册完成（「图片处理」品类），首页/导航/sitemap 生效；与图片品类互链
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/cross_stitch_pattern.html`（新建：上传+参数面板+符号图预览+导出，纯前端）、`static/js/cross_stitch_pattern.js`（新建：网格缩小/DMC 量化/符号渲染引擎，零依赖）、`tools/categories.go`（「图片处理」品类注册+图片品类互链）、`BACKLOG.md`（本小节）。

**未选（并纠正一项去重误判）**：
- 时区转换器（P1，本轮新晋：dev.to 10-13（5 天前）《I Replaced My Productivity Apps with 10 Free Browser Tools》单列 Time Zone Converter（40 IANA 时区并排对比、DST 自动处理）新鲜验证；timestamp 仅本地时区/UTC 二选一，93 Path 无 timezone/时区转换/世界时钟重叠；纯前端小难度 Intl 原生 DST；顺位递进留池，下轮优先）。
- **图片尺寸调整器（纠正：不单立）**——研究轮去重核查误判：`grep -iE 'timezone|时区转换|resizer'` 实际命中 Name「图片尺寸调整」，仓库已有 `img-resize`（ID `img-resize`、Path `/tools/img-resize`、「自定义缩放、裁剪图片，支持指定宽高」，「图片处理」品类）。研究轮 grep 关键词 "resizer" 漏掉了 "img-resize"，错误写成「93 Path 无 resizer/尺寸调整命中」。纠正后：候选与现有工具功能重叠（缩放/指定宽高/裁剪已全覆盖），不单立，留池移除。教训沉淀：立候选前 grep 关键词须含中文名变体与 ID 片段双核（"resizer" 需兼查 "resize"/"尺寸调整"）。
- SQLite 数据库查看器（P1，难度中：sql.js WASM 本地 vendor + 查询编辑器 + 大文件分页；留待上午大轮次单独占一轮高质量交付）。
- 图片复古做旧（P1，顺位顺延）；网站图标生成器（P1，顺位顺延）；SVG 转 React JSX（P1 观察，开发者 niche）；OFD 阅读与转 PDF（P1，难度中-大，适合上午大轮次）；SRT 字幕编辑器（P1，顺位顺延）；屏幕常亮工具（P1，留池）；报价单/收据生成器（P1，票据组合，用户方向下顺位不提前）；视频抽帧（P1，难度中，适合上午轮次）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；进制转换器（P1 观察）；白噪音发生器（P2 观察）；TTS 文本转语音朗读器（P2 观察，品类成熟差异化弱）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察，AI 抠图需后端）等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 与本地 HEAD bd96bc1 一致；`grep tools/categories.go` 全量 93 Path，`cross-stitch`/`十字绣`（除既有 img_stitch 图片拼接外）零命中（品类不同，去重通过），`timezone`/`时区转换`/`世界时钟` 零命中，ID `cross_stitch_pattern`、Path `/tools/cross-stitch-pattern` 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-18 19:00 第二十二轮研究）

## 今日任务（2026-10-18 19:00 · 产品调研员研究轮 ✅）

**交付状态**：10-18 通用调研第二十二轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研；用户方向修正 2026-10-18 持续有效：聚焦 ToolWeb 工具本身，不扩展泛财务/生活计算器）。CSS 渐变生成器已交付闭环（17:40 PM 决策轮立项→开发交付 06bb838 + 评审反馈修复 dabf470；`grep tools/categories.go` 确认 ID `css_gradient_generator`、Path `/tools/css-gradient-generator` 已注册，全量 **93 Path**），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮四件事**（19:00 全网调研，通用方向）：
1. CSS 渐变生成器交付确认：`git log` 确认开发交付 06bb838（可视化色标编辑、linear/radial/conic 三类型、随机配色+10 款预设、一键复制 CSS）+ 评审反馈修复 dabf470（棋盘格底纹被覆盖、拖拽卡死、样例按钮无响应、双击重复加色标）；`git fetch`（先 `ssh-keyscan -t ed25519 github.com >> /root/.ssh/known_hosts` 修复 VM 换机清空 known_hosts，TOOLS.md 既有记载；GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 与本地 HEAD dabf470 一致；`grep tools/categories.go` 全量 93 Path（92+1），`css_gradient_generator` ID 与 `/tools/css-gradient-generator` Path 已注册；候选池划出，已实现清单追加（delta：+ CSS 渐变生成器；历史全量见下方各轮小节）。
2. 新晋候选：**时区转换器（Time Zone Converter）**。需求证据：dev.to 2026-10-13（5 天前）《I Replaced My Productivity Apps with 10 Free Browser Tools (No Sign-Up, No Backend)》单列 Time Zone Converter（40 IANA 时区并排对比，DST 自动处理）——新鲜形态验证；跨境协作/远程会议为持续刚需，中文单页多为水印广告站。差异化：仓库 `timestamp` 工具仅支持本地时区/UTC 二选一，无多城市并排对比、无会议时间对齐视图。可行性：纯前端小难度——城市多选（IANA 时区搜索+收藏）→并排时间条/网格→`Intl.DateTimeFormat` 原生 DST 处理→北京时间/UTC 换算→分享链接（时区参数编码）；与 timestamp 等时间/开发者工具互链。去重：93 Path 无 timezone/时区转换命中（timestamp 仅为时间戳互转，品类不同）。难度小。SEO：时区转换、世界时钟、北京时间换算。建议 ID `timezone_converter`、Path `/tools/timezone-converter`。
3. 新晋候选：**图片尺寸调整器（Image Resizer）**。需求证据三重：① dev.to blanzatools 2026-10-11（7 天前）《14 Free Browser Tools I Built with Vanilla JS》单列 Image Resizer（exact pixel dimensions for social media and web）——榜单形态验证；② dev.to velnoxlabstools 2026-09-27（3 周前）51 工具集同单列——英文形态族；③ Medium toptoolai 2026-09-19 15 工具集单列 Image Resizer——榜单形态再证。痛点真实：社媒/证件照改尺寸刚需，手机修图 App 收费或加水印；img-compress 只有压缩无尺寸调整。可行性：纯前端小难度——上传图片→宽高输入（锁定比例开关）→社交/证件预设尺寸（微信头像/公众号封面/身份证/护照/小红书）→canvas 高质量缩放→导出 PNG/JPG/WebP；与 img-compress/image-steganography 等图片品类互链。去重：93 Path 无 resizer/尺寸调整命中。难度小。SEO：图片改尺寸、图片缩放、证件照尺寸。建议 ID `image_resizer`、Path `/tools/image-resizer`。
4. 无新单页信号侧：① TTS 文本转语音朗读器（dev.to md_shohan 同文 Speech to Text / Text to Speech + toolio/sozai/vocalize4u 形态族）——品类已高度成熟（中英文单页众多），差异化弱，列 P2 观察不单立；② DevTrove（dev.to kkp 10-13）22 开发者工具——仓库已有 `jwt`/`cron`，语义 diff 与 text_diff 重叠，其余 niche，不单立；③ V2EX 10-18：vaneform 流量榜单（需数据后端）、v2explore（浏览器插件形态）、NASDrop（群晖套件+桌面形态）——均非单页纯前端口径；④ HN 本轮：WallHop（付费墙绕过，灰色地带不做）、OpenClaw HN CLI（agent 方案）、Chrome 多标签复制（浏览器功能非单页形态）——无可落地新信号；⑤ Medium malikanwaar 10-16 10 工具 / toptoolai 09-19 15 工具：年龄/密码/单位换算/单词计数/二维码——仓库已全覆盖；其 PDF Merger / PDF to Word——仓库 `pdf_merge_split` / `pdf_to_word` 已覆盖；Resume Builder——与 `resume_checker` 同族（简历方向仓库已有，生成器差异化弱，不单立）；Background Remover——需 AI/后端，纯前端不成立；⑥ 知乎直答（AI 问答产品）、36kr 10 工具（Cleanup.pictures 需 AI、PDF24 为成熟品类、Rome2rio 需路由数据）——无单页可落地新信号；⑦ WPS 候选表保持冻结归档（本轮为通用方向）。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **照片转十字绣图案生成器** — P1（PM 17:40 明确「顺位递进留池，下轮优先」；Medium 10-18 今日榜单 + dev.to 09-06 英文形态双重验证；DMC 配色+PDF 导出免费无上限差异化；纯前端小难度；图片品类互链；93 Path 无重叠）。SEO：十字绣图案、照片转十字绣。
2. **时区转换器（Time Zone Converter）** — P1（本轮新晋：dev.to 10-13（5 天前）新鲜形态验证；timestamp 仅本地/UTC 二选一，多城市并排对比无重叠；纯前端小难度：Intl API 自动 DST；开发者/跨境办公双人群；时间与开发者工具互链；93 Path 无重叠）。SEO：时区转换、世界时钟。
3. **图片尺寸调整器（Image Resizer）** — P1（本轮新晋：blanzatools 10-11 + velnoxlabstools 09-27 + toptoolai 09-19 三重榜单验证；img-compress 无尺寸调整功能；纯前端小难度：canvas 缩放→社媒/证件预设→导出；图片品类互链；93 Path 无重叠）。SEO：图片改尺寸、证件照尺寸。

图片复古做旧列顺位第四（P1，顺位顺延；节奏考量：十字绣若立项将是连续第三轮图片品类，PM 17:40 已提示感知重复风险）；SQLite 数据库查看器（P1，难度中，留待上午大轮次）；SVG 转 React JSX（P1 观察，开发者 niche）；网站图标生成器（P1，顺位顺延）；SRT 字幕编辑器（P1，顺位顺延）；OFD 阅读与转 PDF（P1，难度中-大，适合上午大轮次）；屏幕常亮工具（P1，留池）；报价单/收据生成器（P1，票据组合，用户方向下顺位不提前）；视频抽帧（P1，难度中，适合上午轮次）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；进制转换器（P1 观察）；白噪音发生器（P2 观察）；TTS 文本转语音朗读器（P2 观察，本轮新评估：品类成熟差异化弱）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察，AI 抠图需后端）等其余候选留池。

**通用候选表增量**（第二十二轮：CSS 渐变生成器已实现划出；新晋时区转换器 P1、图片尺寸调整器 P1；全量 93 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 时区转换器（Time Zone Converter） | 本轮新晋（dev.to 2026-10-13（5 天前）《I Replaced My Productivity Apps with 10 Free Browser Tools (No Sign-Up, No Backend)》单列 Time Zone Converter（40 IANA 时区并排对比，DST 自动处理）——新鲜形态验证；跨境协作/远程会议持续刚需；仓库 timestamp 仅支持本地时区/UTC 二选一，多城市并排对比+会议时间对齐视图无重叠）；纯前端小难度：城市多选（IANA 时区搜索+收藏）→并排时间条/网格→Intl.DateTimeFormat 原生 DST→北京时间/UTC 换算→分享链接；93 Path 无 timezone 命中 | 小 | P1（本轮新晋） |
| 图片尺寸调整器（Image Resizer） | 本轮新晋（dev.to blanzatools 2026-10-11（7 天前）14 工具集单列 Image Resizer（exact pixel dimensions for social media and web）——榜单形态验证；dev.to velnoxlabstools 2026-09-27 51 工具集同单列——英文形态族；Medium toptoolai 2026-09-19 15 工具集单列——榜单形态再证；痛点：社媒/证件照改尺寸刚需，手机修图 App 收费或加水印；img-compress 只有压缩无尺寸调整）；纯前端小难度：上传→宽高输入（锁比例）→社交/证件预设尺寸→canvas 高质量缩放→导出 PNG/JPG/WebP；图片品类互链；93 Path 无 resizer 命中 | 小 | P1（本轮新晋） |

**归档说明**：本轮为 10-18 通用调研第二十二轮——CSS 渐变生成器交付闭环（06bb838 + 评审修复 dabf470，`/tools/css-gradient-generator` 已注册，全量 93 Path），候选池划出，已实现清单 delta 追加；新晋「时区转换器」P1（dev.to 10-13 五天前新鲜形态验证：40 IANA 时区并排对比 + DST 自动处理；timestamp 仅本地/UTC 二选一，多城市并排对比无重叠；纯前端小难度 Intl 原生 DST；93 Path 无重叠）、「图片尺寸调整器」P1（blanzatools 10-11 + velnoxlabstools 09-27 + toptoolai 09-19 三重榜单验证；img-compress 无尺寸调整功能；纯前端小难度；93 Path 无重叠）；TTS 朗读器（P2 观察，品类成熟差异化弱）、DevTrove 22 开发者工具（jwt/cron 已有、语义 diff 与 text_diff 重叠）不单立；V2EX 10-18（vaneform 需数据后端、v2explore 插件形态、NASDrop 桌面套件形态）、HN 本轮（WallHop 灰色地带、OpenClaw agent 方案、Chrome 多标签复制为浏览器功能）无可落地新信号；malikanwaar/toptoolai 榜单其余项仓库已覆盖（PDF Merger/PDF to Word 仓库已有；简历生成与 resume_checker 同族不单立；Background Remover 需 AI/后端不成立）；知乎直答/36kr（Cleanup.pictures 需 AI、Rome2rio 需路由数据）无单页新信号；WPS 候选表保持冻结归档；仓库 93 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环；本轮复用 VM 换机 known_hosts 修复（TOOLS.md 既有记载）。

**交付核对**：`git fetch`（ssh-keyscan 修复 known_hosts 后，GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在且与本地 HEAD dabf470 一致；`git log` 确认开发交付 06bb838 + 评审修复 dabf470；`grep tools/categories.go` 全量 93 Path（92+1），`css_gradient_generator` ID 与 `/tools/css-gradient-generator` Path 已注册（划入已实现），新候选建议 ID（timezone_converter / image_resizer）与 93 Path 无重叠；timezone/time-zone/resizer 关键词在 categories.go 全量零命中（timestamp 仅本地/UTC 二选一，img-compress 无尺寸调整功能）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-18 17:40 排期轮）

## 今日任务（2026-10-18 17:40 · 产品经理排期决策 ✅）

**交付状态**：待前端开发轮交付。10-18 排期决策轮（17:00 第二十一轮研究之后）。图片转像素画已交付闭环（15:38 PM 决策轮立项→开发交付 f6f693e + 评审反馈修复 153a309；`grep tools/categories.go` 确认 ID `pixel_art_converter`、Path `/tools/pixel-art-converter` 已注册，全量 **92 Path**），候选池划出。本轮立项**今日唯一任务：CSS 渐变生成器（CSS Gradient Generator）**。

**选定：CSS 渐变生成器（/tools/css-gradient-generator）** — 本轮唯一任务：
- **顺位递进兑现**：第十九轮新晋顺位第三→第二十轮顺位第二→第二十一轮顺位递进第一，研究轮连续三轮抬到首位，本轮兑现（与隐写工具 17→18→19→13:30 兑现、像素画 19→20→15:38 兑现同一规则）。
- **节奏错峰**：13:30 隐写、15:38 像素画连续两轮图片品类，本轮换开发者/设计工具品类，用户侧感知不重复；十字绣（Top2）是连续第三轮图片品类，感知重复风险大，顺位递进留池下轮优先。
- **纯前端小难度、一天可高质量交付**：可视化色标编辑→实时预览→一键复制 CSS（linear/radial/conic）→随机配色+预设库，零依赖、无后端、无 CDN 风险；SQLite 查看器（Top3）难度中（sql.js WASM 本地 vendor 约 1-2MB + 查询编辑器 + 大文件分页），研究轮自身建议留待上午大轮次单独占一轮，17:00 晚间轮次一天内高质量交付风险大。
- **互补非重叠、旅程线闭环**：仓库 `color`（颜色转换）只做颜色格式转换，无可视化渐变编辑器；与 color-converter、fancy-fonts、sql-formatter 等开发者/设计工具双向互链。
- **形态验证**：dev.to mou1z 2026-09-29（19 天前）《5 Free Developer Tools — No Signup, No Tracking, No Ads》单列 CSS Gradient Generator（可视化编辑器，支持 linear/radial/conic）。

**规格**：
1. 可视化渐变编辑：渐变条上色标增删（点击渐变条添加、右键/×删除）、拖拽色标调位置、点击色标改色（颜色选择器+HEX 输入）；色标透明度可选。
2. 渐变类型切换：linear（角度滑块 0–360°）/radial（形状 circle/ellipse、位置）/conic（起始角度）；实时大面积预览（含按钮、Hero 条样例预览）。
3. 输出：一键复制 CSS（`background: linear-gradient(...)`，可选含 -webkit- 前缀）；随机配色按钮（和谐配色预设）；常用预设渐变库（8–12 款，点击套用）。
4. 纯前端、零第三方依赖、无后端调用；响应式，桌面端优先、移动端可用。
5. 注册：`tools/categories.go`「开发工具」品类新增 ID `css_gradient_generator`、Path `/tools/css-gradient-generator`（New: true），中英文描述 + SEO keywords（CSS渐变、渐变生成器、gradient generator、css gradient），与 color-converter（ID `color`）、fancy-fonts 双向互链。

**验收标准**：
- [ ] `/tools/css-gradient-generator` 可开（200）
- [ ] 色标增删/拖拽/改色实时预览正确；linear/radial/conic 三种类型切换正确，角度/形状/位置参数生效
- [ ] 复制 CSS 输出可用（粘贴到页面生效）；随机配色可用；预设库点击套用正确
- [ ] DevTools Network 抽查无后端调用、无 CDN 依赖
- [ ] `categories.go` 注册完成（「开发工具」品类），首页/导航/sitemap 生效；与 color-converter 等互链
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/css_gradient_generator.html`（新建：编辑器+预览+代码输出区，纯前端）、`static/js/css_gradient_generator.js`（新建：渐变引擎+预设+随机配色，零依赖，沿像素画/隐写工具拆分惯例）、`tools/categories.go`（「开发工具」品类注册+开发者工具互链）、`BACKLOG.md`（本小节）。

**未选**：照片转十字绣图案生成器（P1，第二十一轮顺位第二：Medium 10-18 今日榜单 + dev.to 09-06 双重验证，DMC 配色+免费导出差异化，纯前端小难度；顺位递进留池，下轮优先）；SQLite 数据库查看器（P1，第二十一轮新晋顺位第三：sqlitelab.com 9 小时前活跃+"Stop uploading your DBs" 痛点原话+dev.to WASM 路线+add0n 形态族+HN 8 天前热度，五重验证；「文件不出浏览器」与仓库铁律同构；难度中，留待上午大轮次单独占一轮高质量交付）；图片复古做旧（P1，顺位顺延）；网站图标生成器（P1，顺位顺延）；OFD 阅读与转 PDF（P1，难度中-大，适合上午大轮次）；SRT 字幕编辑器（P1，顺位顺延）；屏幕常亮工具（P1，留池）；SVG 转 React JSX（P1 观察，开发者 niche，顺位不提前）；报价单/收据生成器（P1，票据组合，用户方向下顺位不提前）；视频抽帧（P1，难度中，适合上午轮次）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；进制转换器（P1 观察）；白噪音发生器（P2 观察）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察，AI 抠图需后端）等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 与本地 HEAD 9fe85c4 一致；`grep tools/categories.go` 全量 92 Path，`gradient`/`渐变`/`cross-stitch`/`十字绣`/`sqlite`/`jsx` 全零命中（去重通过），ID `css_gradient_generator`、Path `/tools/css-gradient-generator` 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-18 17:00 第二十一轮研究）

## 今日任务（2026-10-18 17:00 · 产品调研员研究轮 ✅）

**交付状态**：10-18 通用调研第二十一轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研；用户方向修正 2026-10-18 持续有效：聚焦 ToolWeb 工具本身，不扩展泛财务/生活计算器）。图片转像素画已交付闭环（15:38 PM 决策轮立项→开发交付 f6f693e + 评审反馈修复 153a309；`grep tools/categories.go` 确认 ID `pixel_art_converter`、Path `/tools/pixel-art-converter` 已注册，全量 **92 Path**），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮五件事**（17:00 全网调研，通用方向）：
1. 图片转像素画交付确认：`git log` 确认开发交付 f6f693e（图片转像素画）+ 评审反馈修复 153a309（导出放大倍数默认 2×、网格线阈值降为 k>=2）；`git fetch`（GIT_SSH_COMMAND 指定密钥，先 `ssh-keyscan -t ed25519 github.com >> /root/.ssh/known_hosts` 修复 VM 换机清空 known_hosts 的 Host key verification failed，见 TOOLS.md）确认 origin/muse/dev-20260929 与本地 HEAD 153a309 一致；`grep tools/categories.go` 全量 92 Path（91+1），`pixel_art_converter` ID 与 `/tools/pixel-art-converter` Path 已注册；候选池划出，已实现清单追加（delta：+ 图片转像素画；历史全量见下方各轮小节）。
2. 新晋候选：**SQLite 数据库查看器（浏览器内 .db 文件）**。需求证据五重：① sqlitelab.com（9 小时前抓取活跃）——"Open .db, .sqlite and .sqlite3 files, inspect tables, and run SQLite queries directly in your browser. No installation, account, or file upload. Your files stay on your device"——形态验证+隐私卖点原话；② dev.to sysmaya SQLite Javascript Editor（WASM sql.js 全程本地，上传即查、无服务器）——技术路线验证；③ dev.to hollygg "Stop uploading your DBs! View SQLite files 100% locally with WASM"——痛点原话（别再把数据库上传到云端）；④ add0n.com SQLite Viewer 扩展（Emscripten sql.js，no remote server，关标签页内存清零）——英文形态族；⑤ HN Eatmydata.ai（8 天前，Local-First Question-to-SQL，in-browser sqlite）——浏览器内 sqlite 热度再证。痛点真实：想看 db 文件要么装 DB Browser，要么把含敏感数据的库文件上传到在线工具；「文件不出浏览器」是决定性卖点，与仓库「数据不出浏览器」铁律同构；中文在线单页形态稀缺。开辟「数据库/开发者」新方向（与 sql-formatter 互链成开发者旅程线）。可行性：难度中——sql.js WASM 须本地 vendor（仓库无 CDN 依赖铁律，约 1-2MB 静态文件可接受）→上传 .db/.sqlite/.sqlite3→表结构浏览→SQL 查询编辑器→结果分页渲染→导出 CSV/下载 db。去重：92 Path 无 sqlite/db 命中（`sql` 工具为 SQL 格式化，品类不同；"stitch" 仅命中 img_stitch）。SEO：sqlite查看器、db文件怎么打开、sqlite在线查询。建议 ID `sqlite_viewer`、Path `/tools/sqlite-viewer`。适合上午大轮次单独占一轮高质量交付。
3. 新晋候选：**SVG 转 React JSX**。需求证据双重：① dev.to supertoolkit 2026-10-16（2 天前）《I built 100+ free browser tools》100+ 工具集单列 "SVG to React JSX"——榜单形态验证；② 前端高频手工活：从 Figma/图标库复制 SVG 粘贴到 React 组件需手改属性（stroke-width→strokeWidth、class→className、style 字符串→对象），svgr 为库/CLI 形态，在线中文单页稀缺。可行性：纯前端小难度——粘贴 SVG→正则/轻量解析转驼峰属性→style 转对象→输出可复制 JSX 函数组件；与 fancy-fonts、color-converter 等开发者工具互链。去重：92 Path 无 jsx 命中（"svg" 仅命中描述文字 2 处，无独立工具）。难度小。SEO：svg转jsx、svg转react组件。建议 ID `svg_to_jsx`、Path `/tools/svg-to-jsx`。P1（观察：开发者 niche，顺位不提前）。
4. 无新单页信号侧：① Token 计数器 / AI 文本清理器（Tooltri/supertoolkit 榜单）——仓库已有 `ai_token_counter` / `ai_text_cleaner`，不单立；② 重复词查找器（Tooltri）——文本小工具，差异化弱，P2 观察不单立；③ YouTube 缩略图下载器——URL 拼接 trivial，形态单薄，不单立；④ V2EX 10-18：出海情报站（信息平台）、Claude 封号教程站（资讯站）、Windows 开源软件商店（平台想法）、ChatGPT MCP 联网（agent 方案）、SSD 寿命公式（知识帖）——均非单页工具口径；⑤ HN 本轮多为 8 个月前旧帖（Embedding Explorer/Ava 语音助手/Infectio 恶意软件分析/DataKit 等），唯一新鲜 Eatmydata.ai 为 AI agent+远程 LLM 应用形态，不单立（但佐证浏览器内 sqlite 热度，见第 2 条）；⑥ WPS 候选表保持冻结归档（本轮为通用方向）。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **CSS 渐变生成器（CSS Gradient Generator）** — P1（顺位递进到位：第十九轮新晋→第二十轮顺位第二→本轮递进第一；dev.to mou1z 2026-09-29（19 天前）5 工具集单列形态验证；前端/设计师高频刚需，与 color-converter 互补；纯前端小难度：可视化色标编辑→实时预览→一键复制 CSS（linear/radial/conic）→随机配色；开发者工具互链；92 Path 无重叠）。SEO：CSS渐变、渐变生成器。
2. **照片转十字绣图案生成器** — P1（顺位递进：第二十轮新晋顺位第三→本轮递进第二；Medium 7 小时前今日榜单 + dev.to 09-06 英文形态双重验证；DMC 配色+PDF 导出免费无上限差异化；纯前端小难度：网格缩小→DMC 量化→符号网格渲染→导出；手工爱好+个性化礼物长尾需求；图片品类互链；92 Path 无重叠）。SEO：十字绣图案、照片转十字绣。
3. **SQLite 数据库查看器（浏览器内 .db 文件）** — P1（本轮新晋：sqlitelab.com 9 小时前活跃+dev.to sysmaya/hollygg WASM 路线+"Stop uploading your DBs" 痛点原话+add0n 形态族+HN 8 天前热度再证，五重英文形态验证；开发者真实痛点「免安装看 db 文件」；隐私叙事与仓库铁律同构（数据库文件含敏感数据，不上服务器是决定性卖点）；中文单页稀缺；开辟数据库新方向；与 sql-formatter 互链；92 Path 无重叠；难度中——sql.js WASM 本地 vendor + 查询编辑器 + 大文件分页，建议留待上午大轮次单独占一轮高质量交付；若本轮只做小难度，顺位递补图片复古做旧）。SEO：sqlite查看器、db文件怎么打开。

图片复古做旧列顺位第四（P1，第二十轮新晋，顺位顺延；365Lab 10-08 竞品+指南+Medium 榜单三重验证，纯前端小难度，批量场景差异化）；网站图标生成器（P1，顺位顺延）；OFD 阅读与转 PDF（P1，难度中-大，适合上午大轮次）；SRT 字幕编辑器（P1，顺位顺延）；屏幕常亮工具（P1，留池）；SVG 转 React JSX（P1 观察，本轮新晋，开发者 niche，顺位不提前）；报价单/收据生成器（P1，票据组合，顺位顺延，用户方向下不提前）；视频抽帧（P1，难度中，适合上午轮次）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；进制转换器（P1 观察）；白噪音发生器（P2 观察）；MP3 标签编辑器（P2 观察，开辟音频方向）；贴纸生成器（P2 观察，AI 抠图需后端）；重复词查找器（P2 观察，差异化弱）等其余候选留池。

**通用候选表增量**（第二十一轮：图片转像素画已实现划出；新晋 SQLite 数据库查看器 P1、SVG 转 React JSX P1（观察）；全量 92 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| SQLite 数据库查看器（浏览器内 .db 文件） | 本轮新晋（sqlitelab.com 9 小时前抓取活跃——"Open .db, .sqlite and .sqlite3 files... No installation, account, or file upload. Your files stay on your device"——形态验证+隐私卖点原话；dev.to sysmaya SQLite Javascript Editor（WASM sql.js 全程本地）——技术路线验证；dev.to hollygg "Stop uploading your DBs! View SQLite files 100% locally with WASM"——痛点原话；add0n.com SQLite Viewer 扩展（Emscripten sql.js，no remote server）——英文形态族；HN Eatmydata.ai 8 天前 in-browser sqlite——热度再证）；痛点：看 db 文件要么装软件要么上传敏感库文件，「文件不出浏览器」是决定性卖点，与仓库铁律同构；中文单页稀缺；开辟数据库/开发者新方向（与 sql-formatter 互链）；难度中：sql.js WASM 本地 vendor（无 CDN 铁律）→上传 .db→表浏览→SQL 查询编辑器→结果分页→导出 CSV；92 Path 无 sqlite/db 命中 | 中 | P1（本轮新晋；建议上午大轮次） |
| SVG 转 React JSX | 本轮新晋（dev.to supertoolkit 2026-10-16（2 天前）100+ 工具集单列 "SVG to React JSX"——榜单形态验证；前端高频手工活：Figma/图标库复制 SVG 到 React 需手改属性，svgr 为库形态，在线中文单页稀缺）；纯前端小难度：粘贴 SVG→属性转驼峰（stroke-width→strokeWidth、class→className）→style 字符串转对象→输出可复制 JSX 组件；与 fancy-fonts、color-converter 等开发者工具互链；92 Path 无 jsx 命中（"svg" 仅命中描述文字 2 处） | 小 | P1（观察：开发者 niche，顺位不提前） |

**归档说明**：本轮为 10-18 通用调研第二十一轮——图片转像素画交付闭环（f6f693e+153a309，`/tools/pixel-art-converter` 已注册，全量 92 Path），候选池划出，已实现清单 delta 追加；新晋「SQLite 数据库查看器」P1（五重英文形态验证：sqlitelab.com 9 小时前活跃 + dev.to sysmaya/hollygg WASM 路线 + "Stop uploading your DBs" 痛点原话 + add0n 形态族 + HN 8 天前热度再证；「文件不出浏览器」隐私卖点与仓库铁律同构；中文单页稀缺；开辟数据库新方向；难度中，建议上午大轮次）、「SVG 转 React JSX」P1（观察，dev.to 2 天前 100+ 工具榜单形态验证，纯前端小难度，开发者 niche）；ai_token_counter/ai_text_cleaner 已有（Token 计数器/AI 文本清理器不单立）、重复词查找器（P2 观察差异化弱）、YouTube 缩略图下载器（trivial 不单立）均不单立；V2EX 10-18 为平台/资讯站/agent/知识帖形态；HN 本轮多为 8 个月前旧帖；WPS 候选表保持冻结归档；仓库 92 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环；本轮修复 VM 换机清空 known_hosts 致 git fetch 失败（ssh-keyscan -t ed25519 github.com >> /root/.ssh/known_hosts，TOOLS.md 已有记载）。

**交付核对**：`git fetch`（先修复 known_hosts，GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在且与本地 HEAD 153a309 一致；`git log` 确认开发交付 f6f693e + 评审修复 153a309；`grep tools/categories.go` 全量 92 Path（91+1），`pixel_art_converter` ID 与 `/tools/pixel-art-converter` Path 已注册（划入已实现），新候选建议 ID（sqlite_viewer / svg_to_jsx）与 92 Path 无重叠；sqlite/db/jsx 关键词在 categories.go 全量零命中（"svg" 仅命中描述文字 2 处，"stitch" 仅命中 img_stitch ID/Path 行，"sql" 为 SQL 格式化工具，品类不同）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-18 15:30 第二十轮研究）

## 今日任务（2026-10-18 15:38 · 产品经理排期决策 ✅）

**交付状态**：待前端开发轮交付。10-18 排期决策轮（15:38 第二十轮研究之后）。图片隐写工具已交付闭环（13:30 PM 决策轮立项→开发交付 1689509 + 排期提交 081cebf/4abf44e；`grep tools/categories.go` 确认 ID `image_steganography`、Path `/tools/image-steganography` 已注册，「图片处理」品类，全量 91 Path），候选池划出。本轮立项**今日唯一任务：图片转像素画（Pixel Art 转换器）**。

**选定：图片转像素画（/tools/pixel-art-converter）** — 本轮唯一任务：
- **顺位递进兑现**：第十九轮新晋顺位第一→第二十轮研究轮顺位递进到位（连续两轮抬到首位），本轮兑现。
- **形态+技术路线双验证**：dev.to tonytoolbox 2026-09-30（18 天前）《Building browser-only tools that never upload your files》单列 PixelArt 为本地优先栈实战形态——「canvas downscale + palette quantisation turns photos into game-ready sprites」，纯浏览器本地处理；与仓库「图片不出浏览器」铁律同构。
- **中文单页稀缺**：像素风头像/复古游戏素材为持续小众刚需（社交头像像素化、独立游戏素材），中文在线单页形态稀缺。
- **纯前端小难度、一天可高质量交付**：canvas 缩小→调色板量化（GameBoy/PICO-8/16 色预设）→nearest-neighbor 放大→导出 PNG，零依赖、无后端、无 CDN 风险。
- **旅程线闭环**：与 img-compress/img-convert/img-mosaic/image-steganography 等图片处理品类双向互链。
- **节奏错峰说明**：连续两轮均为图片品类（隐写→像素画），但形态完全不同（隐写=信息隐藏/安全叙事；像素画=风格化创作/娱乐叙事），用户侧感知不重复；且顺位递进规则优先。

**规格**：
1. 输入：上传图片（PNG/JPG/JPEG/WebP，图片只在浏览器处理）；拖拽+点击双通道；大图自动下采样到工作分辨率。
2. 像素化控制：输出宽度（像素数）滑块（如 16–256px），实时预览；nearest-neighbor 放大还原到显示尺寸。
3. 调色板量化：预设调色板（GameBoy 4 色 / PICO-8 16 色 / 复古 16 色 / 全彩保持）+ 自定义色数滑块（最近邻颜色匹配）；实时对比原图 vs 像素化图（并排或滑块）。
4. 网格线叠加开关（可选，方便按格临摹/数格子）；背景透明度保持（PNG 透明通道可选保留）。
5. 导出：导出 PNG（像素级无损）；可选导出放大倍数（1×/2×/4×，nearest-neighbor）。
6. 工具页显著位置隐私声明：「图片只在你的浏览器里处理，不上传服务器」。
7. 纯前端、零第三方依赖、无后端调用；响应式，桌面端优先、移动端可用。
8. 注册：`tools/categories.go`「图片处理」品类新增 ID `pixel_art_converter`、Path `/tools/pixel-art-converter`（New: true），中英文描述 + SEO keywords（像素画、图片转像素风、像素头像、pixel art），与 img-compress/img-convert/img-mosaic/image-steganography 双向互链。

**验收标准**：
- [ ] `/tools/pixel-art-converter` 可开（200）
- [ ] 上传照片→调节像素宽度→调色板切换（GameBoy/PICO-8/复古/全彩）实时预览正确，放大边缘保持硬像素（nearest-neighbor，无模糊）
- [ ] 自定义色数量化生效；网格线开关生效；导出 PNG 与预览一致（放大倍数正确）
- [ ] 大图（>2MP）不卡顿（工作分辨率下采样生效）；移动端可用
- [ ] 隐私声明显著；DevTools Network 抽查无后端调用、无 CDN 依赖
- [ ] `categories.go` 注册完成（「图片处理」品类），首页/导航/sitemap 生效；与图片品类互链
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/pixel_art_converter.html`（新建：上传+参数面板+双预览+导出，纯前端）、`static/js/pixel_art_converter.js`（新建：canvas 缩小/量化/放大引擎，零依赖）、`tools/categories.go`（「图片处理」品类注册+图片品类互链）、`BACKLOG.md`（本小节）。

**未选**：CSS 渐变生成器（P1，第二十轮顺位第二：dev.to mou1z 2026-09-29 形态验证，与 color-converter 互补，开发者/设计刚需；顺位递进留池，下轮优先）；照片转十字绣图案生成器（P1，本轮新晋顺位第三：Medium 7 小时前今日榜单 + dev.to 09-06 英文形态验证，DMC 配色免费无上限差异化，纯前端小难度；顺位递进留池）；图片复古做旧（P1，本轮新晋顺位第四：365Lab 10-08 竞品+指南+Medium 7 小时前榜单三重验证，批量场景差异化；顺位顺延）；网站图标生成器（P1，顺位顺延）；OFD 阅读与转 PDF（P1，难度中-大，适合上午大轮次）；SRT 字幕编辑器（P1，顺位顺延）；屏幕常亮工具（P1，留池）；报价单/收据生成器（P1，票据组合，用户方向下顺位不提前）；视频抽帧（P1，难度中，适合上午轮次）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；进制转换器（P1 观察）；白噪音发生器（P2 观察）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察，AI 抠图需后端）等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 与本地 HEAD 4abf44ee5fd5d04a29a90204ff97c325bef64a0c 一致；`grep tools/categories.go` 全量 91 Path，`pixel-art`/`像素画`/`gradient`/`渐变`/`cross-stitch`/`十字绣` 全零命中（去重通过），ID `pixel_art_converter`、Path `/tools/pixel-art-converter` 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` 与 `toolweb`（均为构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-18 15:30 第二十轮研究）

## 今日任务（2026-10-18 15:30 · 产品调研员研究轮 ✅）

**交付状态**：10-18 通用调研第二十轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研；用户方向修正 2026-10-18 持续有效：聚焦 ToolWeb 工具本身，不扩展泛财务/生活计算器）。图片隐写工具已交付闭环（13:30 PM 决策轮立项→开发交付 1689509 + 排期提交 081cebf；`grep tools/categories.go` 确认 ID `image_steganography`、Path `/tools/image-steganography` 已注册，全量 **91 Path**），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮四件事**（15:30 全网调研，通用方向）：
1. 图片隐写工具交付确认：`git log` 确认开发交付 1689509（图片像素藏文字/提取）+ 排期提交 081cebf；`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 与本地 HEAD 081cebf9be5864765fdbe0a54a9edc2f42b8a3a8 一致；`grep tools/categories.go` 全量 91 Path（90+1），ID `image_steganography` 与 Path `/tools/image-steganography` 已注册；候选池划出，已实现清单追加（delta：+ 图片隐写工具；历史全量见下方第十九轮小节）。
2. 新晋候选：**照片转十字绣图案生成器（Photo → Cross Stitch Pattern）**。需求证据三重：① Medium siloshan 2026-10-18（7 小时前）《7 Free Browser Tools Worth Bookmarking This October》单列 StitchCraft（照片转十字绣图案，全浏览器运行，无需注册）——今日新上线榜单验证；② dev.to vshandev 2026-09-06（6 周前）《How to Turn Any Photo Into a Cross Stitch Pattern》——"with a web-based converter... the direct photo-to-chart conversion runs entirely in your browser"，推荐 StitchCraft（DMC 配色+PDF 导出免费无上限）——英文形态验证+技术路线验证；③ 十字绣为持续活跃的手工爱好（个性化礼物/家居装饰长尾需求），中文在线单页形态稀缺。可行性：纯前端小难度——上传照片→网格缩小（针数/布数可调）→DMC 线色量化（内置 DMC 约 450 色色卡表）→符号/色块网格图渲染（标 DMC 色号+线量估算）→导出 PNG/打印 PDF（沿仓库浏览器打印惯例）；与 img-compress/img-convert/img-mosaic 等图片品类互链。去重：91 Path 无 cross-stitch/十字绣命中（"stitch" 仅命中 img_stitch 图片拼接工具，品类不同）。难度小。SEO：十字绣图案、照片转十字绣、十字绣图纸生成。建议 ID `cross_stitch_pattern`、Path `/tools/cross-stitch-pattern`。
3. 新晋候选：**图片复古做旧（Vintage Photo Effects）**。需求证据三重：① 365Lab 2026-10-08（10 天前）竞品工具「图片复古做旧」+ 5 分钟指南《老照片复古做旧：滤镜、批量与本地处理》（泛黄/褪色、颗粒、暗角、划痕预设，可调强度/对比/色调、批量套用统一风格，全程本地处理不上传）——竞品形态验证+中文指南验证；② Medium siloshan 2026-10-18（7 小时前）同榜单单列 OldRoll（retro film/digicam look）——今日新上线榜单双重验证；③ kaze.ai 2026-10-18 老相机滤镜为反例（AI 路线需后端，纯前端滤镜路线更轻更快）。可行性：纯前端小难度——上传照片→预设（老照片泛黄/胶片/拍立得/暗角）→canvas 像素处理（褪色/颗粒噪声/暗角/划痕叠加）→强度/对比/色调微调→批量套用多图统一怀旧调性→导出 PNG/JPG；图片品类互链；批量场景是差异化卖点。去重：91 Path 无 vintage/复古/做旧/滤镜命中。难度小。SEO：复古照片、老照片做旧、怀旧滤镜。建议 ID `vintage_photo_effects`、Path `/tools/vintage-photo-effects`。
4. 无新单页信号侧：① Medium 同榜单的 SyncWhen（无注册会议时间投票）——投票跨人协作本质需后端同步，纯前端单页无法成立，不单立；② SortaSeat（婚礼/活动座位表）——拖拽排座纯前端可做，但婚礼策划 niche 且 10 月国庆婚礼旺季已过，列 P2 观察不单立；③ Calcy（带单位/范围计算器）——泛计算器形态，用户方向修正下不扩展，不单立；④ urPiano（浏览器钢琴）——音乐 niche；llmspeed（本地 AI 模型速度预估）——需 WebGPU+模型下载，单页过重；⑤ dev.to blanzatools 2026-10-11 14 工具——QR/密码/字数/JSON/Unit converter 等与仓库已有工具重叠，无新信号；⑥ V2EX 10-17/10-18：ProxyLane（桌面透明代理 exe）、vaneform（网站流量/SEO 数据，需数据后端）、codux（macOS 原生终端 App）、removeobjects.video（AI 视频去物，需 AI 后端）——均非单页纯前端口径；Windows 开源软件商店讨论（平台想法）、ChatGPT MCP 联网（agent 方案）——非工具口径；⑦ WPS 候选表保持冻结归档（本轮为通用方向）。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **图片转像素画（Pixel Art 转换器）** — P1（顺位递进到位：第十九轮新晋→13:30 决策轮立项隐写工具时它是 Top3 之二，本轮递进第一；dev.to tonytoolbox 2026-09-30（18 天前）本地优先栈单列 PixelArt 形态+技术路线双验证；像素风头像/复古游戏素材中文单页稀缺；纯前端小难度：canvas 缩小→调色板量化（GameBoy/PICO-8/16 色预设）→nearest-neighbor 放大→导出 PNG；图片品类互链；91 Path 无重叠）。SEO：像素画、图片转像素风。
2. **CSS 渐变生成器（CSS Gradient Generator）** — P1（第十九轮新晋顺位递进：dev.to mou1z 2026-09-29（19 天前）5 工具集单列形态验证；前端/设计师高频刚需，与 color-converter 互补；纯前端小难度：可视化色标编辑→实时预览→一键复制 CSS（linear/radial/conic）→随机配色；91 Path 无重叠）。SEO：CSS渐变、渐变生成器。
3. **照片转十字绣图案生成器** — P1（本轮新晋：Medium 7 小时前今日榜单 + dev.to 09-06 英文形态双重验证；DMC 配色+PDF 导出免费无上限是差异化；纯前端小难度：网格缩小→DMC 量化→符号网格渲染→导出；手工爱好+个性化礼物长尾需求；图片品类互链；91 Path 无重叠）。SEO：十字绣图案、照片转十字绣。

图片复古做旧列顺位第四（P1，本轮新晋：365Lab 10-08 竞品+指南+Medium 7 小时前榜单三重验证，纯前端小难度，批量场景差异化，顺位顺延）；网站图标生成器（P1，顺位顺延）；OFD 阅读与转 PDF（P1，难度中-大，适合上午大轮次）；SRT 字幕编辑器（P1，顺位顺延）；屏幕常亮工具（P1，留池）；报价单/收据生成器（P1，票据组合，顺位顺延）；视频抽帧（P1，难度中，适合上午轮次）；婚礼座位表（P2 观察，niche+婚礼旺季已过）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；进制转换器（P1 观察）；白噪音发生器（P2 观察）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察，AI 抠图需后端）等其余候选留池。

**通用候选表增量**（第二十轮：图片隐写工具已实现划出；新晋照片转十字绣图案生成器 P1、图片复古做旧 P1；全量 91 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 照片转十字绣图案生成器 | 本轮新晋（Medium siloshan 2026-10-18（7 小时前）《7 Free Browser Tools Worth Bookmarking This October》单列 StitchCraft（照片转十字绣，全浏览器运行、无需注册）——今日新上线榜单验证；dev.to vshandev 2026-09-06（6 周前）《How to Turn Any Photo Into a Cross Stitch Pattern》——"with a web-based converter... runs entirely in your browser"，StitchCraft DMC 配色+PDF 导出免费无上限——英文形态验证+技术路线验证；十字绣为持续活跃的手工爱好（个性化礼物/家居装饰长尾），中文在线单页稀缺）；纯前端小难度：上传照片→网格缩小（针数/布数可调）→DMC 线色量化（内置约 450 色色卡）→符号网格图渲染（DMC 色号+线量估算）→导出 PNG/打印 PDF；与 img-compress/img-convert/img-mosaic 等图片品类互链；91 Path 无 cross-stitch/十字绣命中（"stitch" 仅命中 img_stitch 图片拼接，品类不同） | 小 | P1（本轮新晋） |
| 图片复古做旧（Vintage Photo Effects） | 本轮新晋（365Lab 2026-10-08（10 天前）竞品工具「图片复古做旧」+ 5 分钟指南《老照片复古做旧：滤镜、批量与本地处理》（泛黄/褪色、颗粒、暗角、划痕预设，可调强度/对比/色调、批量套用统一风格、全程本地处理不上传）——竞品形态验证+中文指南验证；Medium siloshan 2026-10-18（7 小时前）同榜单单列 OldRoll（retro film/digicam look）——今日新上线榜单双重验证；kaze.ai 2026-10-18 老相机滤镜为反例（AI 路线需后端，纯前端更轻））；纯前端小难度：上传照片→预设（老照片泛黄/胶片/拍立得/暗角）→canvas 像素处理（褪色/颗粒噪声/暗角/划痕叠加）→强度/对比/色调微调→批量套用多图→导出 PNG/JPG（批量场景是差异化卖点）；图片品类互链；91 Path 无 vintage/复古/做旧/滤镜命中 | 小 | P1（本轮新晋） |

**归档说明**：本轮为 10-18 通用调研第二十轮——图片隐写工具交付闭环（1689509+081cebf，`/tools/image-steganography` 已注册，全量 91 Path），候选池划出，已实现清单 delta 追加；新晋「照片转十字绣图案生成器」P1（Medium 7 小时前今日榜单 + dev.to 09-06 英文形态验证，DMC 配色免费无上限差异化，纯前端小难度）、「图片复古做旧」P1（365Lab 10-08 竞品+指南 + Medium 7 小时前榜单三重验证，纯前端小难度，批量场景差异化）；SyncWhen 会议投票（需后端不成立）、婚礼座位表（P2 观察，niche+旺季已过）、Calcy（泛计算器方向下不扩展）、urPiano/llmspeed（niche/过重）、blanzatools 14 工具（重叠）均不单立；V2EX 10-17/10-18 为桌面端/需后端/平台想法形态；WPS 候选表保持冻结归档；仓库 91 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在且与本地 HEAD 081cebf9be5864765fdbe0a54a9edc2f42b8a3a8 一致；`git log` 确认开发交付 1689509 + 排期提交 081cebf；`grep tools/categories.go` 全量 91 Path（90+1），`image_steganography` ID 与 `/tools/image-steganography` Path 已注册（划入已实现），新候选建议 ID（cross_stitch_pattern / vintage_photo_effects）与 91 Path 无重叠；cross-stitch/十字绣/vintage/复古/做旧/滤镜关键词在 categories.go 全量零命中（"stitch" 仅命中 img_stitch 图片拼接）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` 与 `toolweb`（均为构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-18 13:30 排期轮）

## 今日任务（2026-10-18 13:30 · 产品经理排期决策 ✅）

**交付状态**：待前端开发轮交付。10-18 排期决策轮（13:30 第十九轮研究之后）。文本隐私脱敏工具已交付闭环（11:00 PM 决策轮立项→开发交付 d4439c7；`grep tools/categories.go` 确认 ID `text_privacy_masker`、Path `/tools/text-privacy-masker` 已注册，「文本工具」品类，全量 90 Path），候选池划出。本轮立项**今日唯一任务：图片隐写工具（图片藏文字/提取）**。

**选定：图片隐写工具（/tools/image-steganography）** — 本轮唯一任务：
- **顺位递进兑现**：第十七轮新晋顺位第三→第十八轮顺位第二→第十九轮顺位递进第一，研究轮连续三轮抬到首位，本轮兑现。
- **形态证据最硬**：365Lab 2026-10-08（10 天前）竞品工具「画中话」+ 6 分钟教程《图片隐写入门》（隐藏文字/文件/图种/幻影坦克四种玩法，「全程本地处理不上传」）——竞品形态验证+中文教程验证；stegtool/tembrica/imgcnv/toolshu/reducerimage/privacypixtools 英文形态族——成熟工具类目。
- **纯前端小难度、一天可高质量交付**：canvas 读像素 LSB 嵌入/提取 + 口令（XOR 扰动或 AES-GCM，沿 tembrica 形态）+ 容量实时显示，零依赖、无后端、无 CDN 风险。
- **隐私叙事与仓库「图片不出浏览器」铁律同构**：私密信息藏进图片，纯前端是产品优势本身而非技术妥协。
- **旅程线闭环**：与 img-compress/img-convert/img-mosaic 等图片品类双向互链，图片工具族再加一块拼图。
- **节奏错峰**：上一轮是文本正则型（文本隐私脱敏），本轮图片像素型（LSB 隐写），形态完全错峰。

**规格**：
1. 嵌入模式：上传载体图（PNG/JPG/JPEG，图片只在浏览器处理）；输入隐藏文本（支持中文，UTF-8 编码）；可选口令（有口令则加密/扰动密钥，无口令明文藏入）。
2. LSB 嵌入：每像素 RGB 通道最低有效位写入 bit 流，头部含魔数+版本+长度+校验+加密标志；大图自动提示容量。
3. 容量实时显示：根据载体图尺寸实时计算可藏字符数（(w×h×3 − headerBits)/8 ÷ 字符字节数），输入超长时禁用嵌入按钮并红字提示。
4. 提取模式：上传隐写图→输入口令（如有）→一键提取，校验失败时给出诚实提示（"非隐写图或口令错误"）；提取结果复制到剪贴板。
5. 导出：嵌入后导出 PNG（无损保位，下载）；对比滑块预览载体图 vs 隐写图（LSB 改动人眼不可见，滑块用于放大对比说明）。
6. 工具页显著位置隐私声明：「图片与隐藏文本只在你的浏览器里处理，不上传服务器」。
7. 纯前端、零第三方依赖、无后端调用；响应式，桌面端优先、移动端可用。
8. 注册：`tools/categories.go`「图片工具」品类（确认品类名后沿用）新增 ID `image_steganography`、Path `/tools/image-steganography`（New: true），中英文描述 + SEO keywords（图片隐写、图片藏文字、隐写工具、LSB 隐写），与 img-compress/img-convert/img-mosaic 双向互链。

**验收标准**：
- [ ] `/tools/image-steganography` 可开（200）
- [ ] 嵌入：长文本+中文可完整嵌入；导出的 PNG 重新上传提取结果一致（往返无损）；不同尺寸载体图（小/大）容量计算正确
- [ ] 口令模式：无口令提取有口令的图时校验失败并诚实报错；口令正确时提取成功；口令错误时提取失败并提示
- [ ] 容量实时显示准确，输入超长时禁用嵌入按钮并红字提示
- [ ] 提取失败路径（非隐写图/口令错误/损坏）均有明确提示，不崩不卡
- [ ] 隐私声明显著；DevTools Network 抽查无后端调用、无 CDN 依赖
- [ ] `categories.go` 注册完成（「图片工具」品类），首页/导航/sitemap 生效；与图片品类互链
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/image_steganography.html`（新建：嵌入/提取双模式+容量实时显示+对比滑块，纯前端）、`static/js/image_steganography.js`（新建：LSB 嵌入/提取引擎+口令加密+容量计算，零依赖）、`tools/categories.go`（「图片工具」品类注册+图片品类互链）、`BACKLOG.md`（本小节）。

**未选**：图片转像素画（P1，本轮新晋：dev.to tonytoolbox 2026-09-30 本地优先栈形态+技术路线双验证，纯前端小难度，图片品类互链，SEO 像素画/像素头像；顺位递进留池，下轮优先）；CSS 渐变生成器（P1，本轮新晋：dev.to mou1z 2026-09-29 5 工具集形态验证，与 color-converter 互补，开发者/设计刚需；顺位留池）；OFD 阅读与转 PDF（P1，难度中-大，留待上午大轮次单独占一轮）；网站图标生成器（P1，顺位顺延）；SRT 字幕编辑器（P1，顺位顺延）；屏幕常亮工具（P1，留池）；报价单/收据生成器（P1，票据组合，顺位顺延）；视频抽帧（P1，难度中，适合上午轮次）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；进制转换器（P1 观察）；白噪音发生器（P2 观察）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察，AI 抠图需后端）等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 与本地 HEAD d4439c7 一致；`grep tools/categories.go` 全量 90 Path，`steg`/`隐写`/`藏文字`/`steganography`/`pixel-art`/`像素画`/`gradient`/`渐变` 全零命中（去重通过），ID `image_steganography`、Path `/tools/image-steganography` 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` 与 `toolweb`（均为构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-18 13:00 第十九轮研究）

## 今日任务（2026-10-18 13:00 · 产品调研员研究轮 ✅）

**交付状态**：10-18 通用调研第十九轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研；用户方向修正 2026-10-18 持续有效：聚焦 ToolWeb 工具本身，不扩展泛财务/生活计算器）。文本隐私脱敏工具已交付闭环（11:00 PM 决策轮立项→开发交付 d4439c7；`grep tools/categories.go` 确认 ID `text_privacy_masker` 已注册，全量 **90 Path**），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮四件事**（13:00 全网调研，通用方向）：
1. 文本隐私脱敏工具交付确认：`git log` 确认开发交付 d4439c7（粘贴文本→正则识别手机号/身份证/银行卡/邮箱/IPv4/车牌→高亮逐条确认→一键遮盖→复制/下载，隐私横幅）；`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 与本地 HEAD d4439c7 一致；`grep tools/categories.go` 全量 90 Path（89+1），`text_privacy_masker` ID 已注册；候选池划出，已实现清单追加（delta：+ 文本隐私脱敏工具；历史全量见下方第十八轮小节）。
2. 新晋候选：**图片转像素画（Pixel Art 转换器）**。需求证据三重：① dev.to tonytoolbox 2026-09-30（18 天前）《Building browser-only tools that never upload your files（本地优先 web 栈）》单列 PixelArt 为实战形态——「canvas downscale + palette quantisation turns photos into game-ready sprites」，纯浏览器本地处理——形态验证+技术路线验证；② 像素风头像/复古游戏素材为持续小众刚需（社交头像像素化、独立游戏素材），在线单页形态以英文站为主，中文工具站稀缺；③ 与仓库「图片不出浏览器」铁律同构。可行性：纯前端小难度——上传图片→canvas 缩小→调色板量化（GameBoy 4 色 / PICO-8 / 16 色复古预设）→nearest-neighbor 放大→导出 PNG；与 img-compress/img-convert/img-mosaic 等图片品类互链。去重：90 Path 无 pixel-art/像素画命中（"pixel" 仅命中 serp_snippet_preview 描述文字）。难度小。SEO：像素画、图片转像素风、像素头像。建议 ID `pixel_art_converter`、Path `/tools/pixel-art-converter`。
3. 新晋候选：**CSS 渐变生成器（CSS Gradient Generator）**。需求证据双重：① dev.to mou1z 2026-09-29（19 天前）《5 Free Developer Tools — No Signup, No Tracking, No Ads》单列 CSS Gradient Generator（可视化编辑器，支持 linear/radial/conic）——形态验证；② 前端/设计师高频刚需（按钮背景、Hero 区、海报底），仓库 `color` 工具只做颜色格式转换，无渐变可视化编辑器，属互补非重叠。可行性：纯前端小难度——可视化色标编辑（增删/拖拽色标）→实时预览→一键复制 CSS 代码片段→随机配色；与 color-converter、fancy-fonts 等开发者/设计工具互链。去重：90 Path 无 gradient/渐变命中。难度小。SEO：CSS渐变、渐变生成器、gradient generator。建议 ID `css_gradient_generator`、Path `/tools/css-gradient-generator`。
4. 存量候选证据增强（不新立）：① **SRT 字幕编辑器**——Subtitle Edit v5.3.0 2026-10-14 更新（4 天前，gndown 阅读 1W+，SRT/ASS/VTT 数十种格式、字幕同步/合并/拆分/修复为核心功能）；猎人社区 2026-10-12（6 天前）「字幕大师」免费本地离线字幕工具（字幕生成/翻译全本地）；dev.to tonytoolbox SubToolbox（SRT/VTT/ASS 解析、resync、合并纯客户端）——「下载字幕时间轴对不上」为经典高频痛点，单页可落地形态=时间轴整体偏移（±秒）、逐行微调、合并/拆分、SRT↔VTT 转换；② **视频抽帧**——tonytoolbox FrameExtractor（浏览器原生解码 seek 抽帧）为纯前端可行性再验证；③ **报价单/收据生成器**——Medium toptoolai 2026-09-19 榜单单列 Invoice Generator（Create a clean, downloadable invoice）为英文形态佐证，但属票据/财务边缘类，在用户「不扩展泛财务计算器」方向下保持 P1 留池、顺位不提前。

无新单页信号侧：① TheTextKit（dev.to 2026-09-29，30 文本工具）含 Extract Emails/URLs、URL Slug Generator——文本提取形态与刚交付的 text_privacy_masker（正则识别实体）重叠，不单立；② dev.to mou1z 同文的番茄钟（Pomodoro Timer）/看板（Kanban Board）——通用效率 App 形态，差异化弱，不单立；③ Show HN 邮件 HTML 构建器（单文件拖拽生成邮件安全 HTML）——营销/开发者 niche，难度中，不单立；④ HN TTSLab（浏览器 WebGPU TTS/STT）——需 WebGPU+大模型下载，单页过重；Kromacut（3D 打印 lithophane）——3D 打印 niche；⑤ V2EX 10-17/10-18：Windows 开源软件商店讨论（平台想法）、ChatGPT MCP 联网（agent 方案）、听力流利度练习 HTML（语言学习 niche）——均非单页工具口径；⑥ WPS 候选表保持冻结归档（本轮为通用方向）。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **图片隐写工具（图片藏文字/提取）** — P1（顺位递进到位：第十七轮新晋顺位第三→第十八轮顺位第二→本轮顺位递进第一；365Lab 2026-10-08 竞品工具「画中画」+ 6 分钟教程形态验证；stegtool/tembrica/imgcnv/toolshu/reducerimage 英文形态族；隐私叙事与仓库「图片不出浏览器」铁律同构；纯前端小难度：上传载体图→LSB 嵌入（+可选口令）→导出 PNG→一键提取→容量实时显示；90 Path 无重叠）。SEO：图片隐写、图片藏文字。
2. **图片转像素画（Pixel Art 转换器）** — P1（本轮新晋：dev.to tonytoolbox 2026-09-30（18 天前）本地优先栈单列 PixelArt 形态+技术路线双验证；像素风头像/复古游戏素材中文单页稀缺；纯前端小难度：canvas 缩小→调色板量化（GameBoy/PICO-8/16 色预设）→nearest-neighbor 放大→导出 PNG；图片品类互链；90 Path 无重叠）。SEO：像素画、图片转像素风。
3. **CSS 渐变生成器（CSS Gradient Generator）** — P1（本轮新晋：dev.to mou1z 2026-09-29（19 天前）5 工具集单列形态验证；前端/设计师高频刚需，与 color-converter 互补；纯前端小难度：可视化色标编辑→实时预览→一键复制 CSS（linear/radial/conic）→随机配色；开发者工具互链；90 Path 无重叠）。SEO：CSS渐变、渐变生成器。

屏幕常亮工具列顺位第四（P1，顺位顺延）；OFD 阅读与转 PDF（P1，难度中-大，适合上午大轮次）；网站图标生成器（P1，顺位顺延）；SRT 字幕编辑器（P1，本轮证据增强：Subtitle Edit v5.3.0 4 天前更新+gndown 1W+阅读+字幕大师本地化+SubToolbox resync 形态，顺位顺延）；报价单/收据生成器（P1，票据组合，顺位顺延，用户方向下不提前）；视频抽帧（P1，难度中，本轮 FrameExtractor 可行性再验证，适合上午轮次）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；进制转换器（P1 观察）；白噪音发生器（P2 观察）；MP3 标签编辑器（P2 观察）；贴纸生成器（P2 观察，AI 抠图需后端）等其余候选留池。

**通用候选表增量**（第十九轮：文本隐私脱敏工具已实现划出；新晋图片转像素画 P1、CSS 渐变生成器 P1；全量 90 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 图片转像素画（Pixel Art 转换器） | 本轮新晋（dev.to tonytoolbox 2026-09-30（18 天前）《Building browser-only tools that never upload your files》单列 PixelArt 为本地优先栈实战形态——「canvas downscale + palette quantisation turns photos into game-ready sprites」，纯浏览器本地处理——形态验证+技术路线验证；像素风头像/复古游戏素材为持续小众刚需，中文在线单页形态稀缺；与仓库「图片不出浏览器」铁律同构）；纯前端小难度：上传图片→canvas 缩小→调色板量化（GameBoy 4 色/PICO-8/16 色复古预设）→nearest-neighbor 放大→导出 PNG；与 img-compress/img-convert/img-mosaic 等图片品类互链；90 Path 无 pixel-art/像素画命中 | 小 | P1（本轮新晋） |
| CSS 渐变生成器（CSS Gradient Generator） | 本轮新晋（dev.to mou1z 2026-09-29（19 天前）《5 Free Developer Tools — No Signup, No Tracking, No Ads》单列 CSS Gradient Generator（可视化编辑器，支持 linear/radial/conic）——形态验证；前端/设计师高频刚需（按钮背景/Hero 区/海报底），仓库 color 工具只做颜色格式转换、无渐变可视化编辑器，互补非重叠）；纯前端小难度：可视化色标编辑（增删/拖拽）→实时预览→一键复制 CSS 代码片段→随机配色；与 color-converter、fancy-fonts 等开发者/设计工具互链；90 Path 无 gradient/渐变命中 | 小 | P1（本轮新晋） |

**归档说明**：本轮为 10-18 通用调研第十九轮——文本隐私脱敏工具交付闭环（d4439c7，`/tools/text-privacy-masker` 已注册，全量 90 Path），候选池划出，已实现清单 delta 追加；新晋「图片转像素画」P1（dev.to 18 天前本地优先栈形态+路线双验证，纯前端小难度，图片品类互链）、「CSS 渐变生成器」P1（dev.to 19 天前 5 工具集形态验证，与 color-converter 互补，开发者/设计人群）；存量候选证据增强：SRT 字幕编辑器（Subtitle Edit v5.3.0 4 天前更新+猎人社区字幕大师 6 天前+SubToolbox resync，单页形态=时间轴偏移/逐行微调/合并拆分/格式转换）、视频抽帧（FrameExtractor 可行性再验证）、报价单生成器（英文榜单佐证但用户方向下不提前）；TheTextKit 文本提取（与 text_privacy_masker 重叠）、番茄钟/看板（通用 App 形态差异化弱）、邮件 HTML 构建器（niche 难度中）、HN TTSLab/Kromacut（过重/niche）、V2EX 本轮（平台想法/agent/语言学习 niche）均不单立；WPS 候选表保持冻结归档；仓库 90 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在且与本地 HEAD d4439c7 一致；`git log` 确认开发交付 d4439c7；`grep tools/categories.go` 全量 90 Path（89+1），`text_privacy_masker` ID 已注册（划入已实现），新候选建议 ID（pixel_art_converter / css_gradient_generator）与 90 Path 无重叠；pixel-art/像素画/gradient/渐变关键词在 categories.go 全量零命中（"pixel" 仅命中 serp_snippet_preview 描述文字）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` 与 `toolweb`（均为构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-18 11:00 排期轮）

## 今日任务（2026-10-18 11:00 · 产品经理排期决策 ✅）

**交付状态**：待前端开发轮交付。10-18 排期决策轮（11:00 第十八轮研究之后）。PDF 电子签名已交付闭环（10:00 PM 决策轮立项→开发交付 0dd6451；`grep tools/categories.go` 确认 ID `pdf_sign`、Path `/tools/pdf-sign` 已注册，「文档转换」品类，「PDF 办公」组合互链，全量 89 Path），候选池划出。本轮立项**今日唯一任务：文本隐私脱敏工具（粘贴文本→敏感信息自动识别遮盖）**。

**选定：文本隐私脱敏工具（/tools/text-privacy-masker）** — 本轮唯一任务：
- **顺位递进兑现**：10:00 PM 决策轮立项 pdf_sign 时明确「按顺位递进留待下轮」，本轮即是下轮，兑现承诺；第十六轮新晋→第十七轮顺位第二→本轮顺位递进到位。
- **纯前端小难度、一天可高质量交付**：正则识别+高亮逐条确认+遮盖替换，无外部依赖、无CDN风险，风险面极小。
- **隐私叙事与仓库「数据不出浏览器」铁律同构**：敏感信息遮盖天然不能上服务器，纯前端是产品优势本身而非技术妥协（形态族：dev.to Antigravity 2026-10-14 PII Masker）。
- **旅程线闭环**：与 text_diff（ID `diff`）互链成「文本旅程线」。
- **节奏错峰**：上一轮是 PDF 办公签署型（重交互+PDF坐标），本轮文本隐私型（轻量+正则），形态完全错峰。

**规格**：
1. 粘贴文本输入（多行文本框，支持大文本；响应式，桌面端优先、移动端可用）。
2. 内置识别规则（正则+校验，每类可单独开关）：中国大陆手机号（11位+号段校验）、身份证号（18位+校验码验证）、银行卡号（16–19位+Luhn校验）、邮箱、IPv4、车牌号（蓝牌/新能源）；误报高风险条目（如连续数字）要求通过校验码/Luhn 才命中。
3. 识别结果高亮标注（按类型不同颜色徽章），逐条确认/忽略（误报可一键忽略，忽略项不参与遮盖）。
4. 遮盖方式：① 全遮盖（`***`）；② 部分保留（按类型默认保留策略：身份证保留前6后4、手机号保留前3后4、银行卡保留后4，可调位数）；③ 自定义替换字符。
5. 一键「全部遮盖」，实时生成脱敏后文本；复制到剪贴板 / 下载 .txt；统计（命中N条、已遮盖M条）。
6. 工具页显著位置隐私声明：「文本只在你的浏览器里处理，不上传服务器」。
7. 纯前端、零第三方依赖、无后端调用。
8. 注册：`tools/categories.go`「文本工具」品类新增 ID `text_privacy_masker`、Path `/tools/text-privacy-masker`（New: true），中英文描述 + SEO keywords（文本脱敏、隐私信息遮盖、身份证脱敏、手机号遮盖、敏感信息打码），与 text_diff（ID `diff`）双向互链。

**验收标准**：
- [ ] `/tools/text-privacy-masker` 可开（200）
- [ ] 各类型识别准确：内置测试用例覆盖手机号/身份证/银行卡/邮箱/IPv4/车牌正例与误报反例（银行卡走 Luhn、身份证走校验码，纯数字串不误报）
- [ ] 高亮标注按类型着色正确；逐条确认/忽略可用，忽略项不参与遮盖
- [ ] 三种遮盖方式均可用；脱敏结果其余文本无误删、无偏移
- [ ] 复制到剪贴板与下载 .txt 可用；统计数字准确
- [ ] 隐私声明显著；DevTools Network 抽查无后端调用、无CDN依赖
- [ ] `categories.go` 注册完成（「文本工具」品类），首页/导航/sitemap 生效；与 text_diff 互链
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/text_privacy_masker.html`（新建：输入+高亮标注+遮盖控制+结果区，纯前端）、`static/js/text_privacy_masker.js`（新建：识别规则引擎+逐条确认+遮盖+复制/下载，零依赖）、`tools/categories.go`（「文本工具」品类注册+与 text_diff 双向互链）、`BACKLOG.md`（本小节）。

**开发交付记录（2026-10-18 11:xx 前端开发轮 ✅）**：新建 `templates/text_privacy_masker.html`（SEO meta+keywords+JSON-LD，页首显著「文本只在你的浏览器里处理，不上传服务器」隐私承诺横幅，类型开关/输入/高亮预览/逐条忽略/遮盖设置/结果区/「文本旅程线」互链；零 CDN 依赖，未引入 Google Fonts，导航图标做本地降级）、`static/js/text_privacy_masker.js`（纯前端引擎：手机号 11 位号段校验、身份证 18 位校验码+15 位日期校验、银行卡 15–19 位 Luhn、邮箱、IPv4 分段 0–255、车牌蓝牌/新能源/使领，冲突按身份证>银行卡>邮箱>车牌>IPv4>手机号优先级消解；按类型着色高亮+逐条忽略；全遮盖 ***/部分保留（身份证前6后4/手机号前3后4/银行卡后4/邮箱留域名/IPv4 留首段/车牌前2后1，位数可调）/自定义字符；原始坐标拼接无偏移；复制剪贴板+下载 .txt+统计；无 fetch/XHR）；node 38 项正反例单元测试全过（含 Luhn/校验码误报反例、邮箱内数字串冲突、忽略项不参与遮盖）。`tools/categories.go`「文本工具」品类注册 ID `text_privacy_masker`、Path `/tools/text-privacy-masker`（New: true，中英描述），与 text_diff 双向互链。本地构建通过；127.0.0.1:18099 实测页面 200、JS 200、sitemap/index/导航生效、text-diff 200 且互链生效；测试服务已清理。commit 待推送。

**未选**：OFD 阅读与转 PDF（P1，本轮新晋：365Lab 电子发票痛点原话+iLovePDF 免费版受限差异化+纯前端可行双先例，真实需求强，但纯前端中-大难度+嵌入字体/复杂版式风险，适合留待上午大轮次单独占一轮高质量交付，不适合与今日任务挤一轮）；图片隐写工具（P1，第十七轮新晋顺位第三，365Lab「画中画」+英文形态族验证，纯前端小难度，留池按顺位递进）；网站图标生成器（P1，顺位顺延）；SRT 字幕编辑器（P1，顺位顺延）；屏幕常亮工具（P1，留池）；报价单/收据生成器（P1，票据组合，顺位顺延）；视频抽帧（P1，难度中，适合上午轮次）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 与本地 HEAD 48b2fc2 一致；`grep tools/categories.go` 全量 89 Path，`text_privacy_masker`/`mask`/`pii`/`desensitize`/`steg`/`ofd` 全零命中（去重通过），ID `text_privacy_masker`、Path `/tools/text-privacy-masker` 无重叠；「文本工具」品类确认存在（text_diff 注册 ID `diff`）；本地当前分支 muse/dev-20260929；工作树仅 `toolWeb.bak-prev`/`toolweb` 构建产物未跟踪（历史已知无关项）。

---

> 维护人：产品调研员 · 每日更新（2026-10-18 11:00 第十八轮研究）

## 今日任务（2026-10-18 11:00 · 产品调研员研究轮 ✅）

**交付状态**：10-18 通用调研第十八轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研）。PDF 电子签名已交付闭环（10:00 PM 决策轮立项→开发交付 0dd6451；`grep tools/categories.go` 确认 ID `pdf_sign`、Path `/tools/pdf-sign` 已注册，「文档转换」品类，全量 89 Path），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮四件事**（11:00 全网调研，通用方向）：
1. PDF 电子签名交付确认：`git log` 确认开发交付 0dd6451（手写签名板/上传图片白底转透明/键入姓名手写体三制签，签名库 localStorage，pdf.js 逐页预览点击放置拖拽缩放，pdf-lib embedPng 按页嵌入导出，与 pdf_annotate/pdf_manage 双向互链成「PDF 办公」组合）；`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 与本地 HEAD b4ba6b3 一致；`grep tools/categories.go` 全量 89 Path，`pdf_sign` ID 与 `/tools/pdf-sign` Path 已注册；候选池划出，已实现清单追加（delta：+ PDF 电子签名；历史全量见下方第十七轮小节）。
2. 新晋候选：**OFD 阅读与转 PDF（电子发票 OFD 版式）**。需求证据四重：① 365Lab 2026-10-08（10 天前）《电子发票怎么打印、报销与 OFD 转 PDF：财务小白完整指南》——"Reimbursing e-invoices usually trips people up on three things: printing layout, unopenable OFD files, and manual data entry"，自带发票助手 OFD→PDF 本地转换+A4 拼版——竞品形态验证+痛点原话；② 博客园 2026-09（1 个月前）纯前端 OFD 阅读器 ofd.11m18.cn（GB/T 33190，WASM 内核全程本地、打开即验签+文本精确提取）——纯前端可行性证明；③ UPDF 官方指南：iLovePDF 每天 2 次免费转换、3MB 以内——竞品免费版受限，「免费无上限+文件不出浏览器」差异化成立（发票敏感文件不上服务器是决定性卖点）；④ appbrain：OFD to PDF Converter & Reader 安卓 App 2026-09 上架——移动端需求证明。需求背景：全电/数电发票 OFD 版式全国推行，「OFD文件怎么打开」为高频中文搜索。可行性：纯前端中-大难度——OFD 为 ZIP+XML 版式（GB/T 33190），路线为 JSZip 解包→XML 解析→canvas 逐页渲染→浏览器打印/A4+导出 PDF（沿 pdf_sign/pdf-to-image 惯例）；风险点为嵌入字体与复杂版式。去重：89 Path 无 ofd/发票/invoice 命中。SEO：OFD转PDF、OFD文件怎么打开、电子发票OFD、OFD阅读器。建议 ID `ofd_reader`、Path `/tools/ofd-reader`。与 doc-to-pdf/PDF 工具族互链成「文档转换」组合。
3. 无新单页信号侧：① dev.to 2026-10-14 Chess Blunder Heatmap（Stockfish WASM 零后端国际象棋失误热力图）——国际象棋小众，暂不单立；② dev.to 2026-10-09 BuildDiff（浏览器内递归对比两文件夹，File System Access API 目录选择）——开发者 niche，仓库已有 text_diff，不单立；③ HN ArkhamMirror ACH（CIA 竞争假设分析矩阵，localStorage 零后端）——情报分析 niche，不单立；④ HN Merge JPG/批量图片模糊——仓库 img-stitch/img-mosaic 已覆盖；⑤ V2EX 10-18：Yir.AI（AI 生图比价路由，需后端）、新词雷达（需付费 API+LLM 富化）、AI Code Review 讨论帖——均非单页纯前端口径；⑥ PH Weatherling（Mac 桌面 App）、Probe（原生 API 客户端）——桌面端形态；⑦ WPS 候选表保持冻结归档（本轮为通用方向）。
4. 去重确认：新候选建议 ID（ofd_reader）与 89 Path 无重叠；ofd/发票/invoice 关键词在 categories.go 全量零命中。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **文本隐私脱敏工具（粘贴文本→敏感信息自动识别遮盖）** — P1（顺位递进到位：第十六轮新晋、第十七轮顺位第二、10:00 PM 决策轮明确「按顺位递进留待下轮」；dev.to Antigravity 2026-10-14 PII Masker+getweeve/lddgo 形态族；隐私叙事与仓库「数据不出浏览器」铁律同构；纯前端小难度：粘贴→正则识别（手机号/身份证/银行卡/邮箱/IP/车牌）→高亮逐条确认→一键遮盖→复制/下载；与 text_diff 互链成文本旅程线；89 Path 无重叠）。SEO：文本脱敏、隐私信息遮盖。
2. **图片隐写工具（图片藏文字/提取）** — P1（第十七轮新晋顺位第三递进：365Lab 2026-10-08 竞品工具「画中画（图片隐写）」+ 6 分钟教程形态验证；stegtool/tembrica/imgcnv/toolshu 英文形态族；纯前端小难度：上传载体图→LSB 嵌入（+可选口令）→导出 PNG→一键提取→容量实时显示；89 Path 无重叠）。
3. **OFD 阅读与转 PDF（电子发票 OFD 版式）** — P1（本轮新晋：365Lab 2026-10-08 电子发票指南「unopenable OFD files」核心痛点原话；iLovePDF 免费版 2次/天+3MB 受限——「免费无上限+文件不出浏览器」差异化（发票不上服务器）；纯前端可行有双先例（ofd.11m18.cn WASM 内核、365Lab 发票助手本地转换）；难度中-大，适合上午轮次留足时间；与 PDF 工具族互链；89 Path 无重叠）。

网站图标生成器列顺位第四（P1，顺位顺延）；SRT 字幕编辑器（P1，顺位顺延，开辟字幕/视频新方向）；屏幕常亮工具（P1，留池）；报价单/收据生成器（P1，票据组合，顺位顺延）；视频抽帧（P1，难度中，适合上午轮次）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；进制转换器（P1 观察）；白噪音发生器（P2 观察，中文证据弱）；MP3 标签编辑器（P2 观察，开辟音频工具方向）；贴纸生成器（P2 观察，AI 抠图需后端）等其余候选留池。

**通用候选表增量**（第十八轮：PDF 电子签名已实现划出；新晋 OFD 阅读与转 PDF（电子发票 OFD 版式）P1；全量 89 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| OFD 阅读与转 PDF（电子发票 OFD 版式） | 本轮新晋（365Lab 2026-10-08（10 天前）《电子发票怎么打印、报销与 OFD 转 PDF》——"unopenable OFD files" 为三大报销痛点之一，自带发票助手 OFD→PDF 本地转换+A4 拼版——竞品形态验证；博客园 2026-09（1 个月前）纯前端 OFD 阅读器 ofd.11m18.cn（GB/T 33190，WASM 内核全程本地、验签+文本精确提取）——纯前端可行性证明；UPDF 指南：iLovePDF 每天 2 次免费、3MB 以内——竞品免费版受限，「免费无上限+文件不出浏览器」差异化（发票敏感文件不上服务器）；appbrain：OFD to PDF 安卓 App 2026-09 上架——移动端需求证明）；需求背景：全电/数电发票 OFD 版式全国推行，「OFD文件怎么打开」高频中文搜索；纯前端中-大难度：OFD 为 ZIP+XML 版式（GB/T 33190），路线 JSZip 解包→XML 解析→canvas 逐页渲染→浏览器打印/导出 PDF（沿 pdf_sign/pdf-to-image 惯例），风险点为嵌入字体与复杂版式；与 PDF 工具族互链成「文档转换」组合；89 Path 无 ofd/发票/invoice 命中 | 中-大 | P1（本轮新晋） |

**归档说明**：本轮为 10-18 通用调研第十八轮——PDF 电子签名交付闭环（0dd6451，`/tools/pdf-sign` 已注册，「文档转换」品类，「PDF 办公」组合互链，全量 89 Path），候选池划出，已实现清单 delta 追加；新晋候选「OFD 阅读与转 PDF」P1（365Lab 2026-10-08 电子发票指南痛点原话 + 博客园 2026-09 纯前端 WASM 内核可行性证明 + iLovePDF 免费版受限差异化 + 安卓 App 移动端需求证明，纯前端中-大难度，适合上午轮次）；dev.to 2026-10-14 国际象棋热力图（小众）、2026-10-09 BuildDiff（开发者 niche，已有 text_diff）、HN ArkhamMirror ACH（情报分析 niche）、HN 图片合并/模糊（仓库已覆盖）均不单立；V2EX 10-18 为 AI 后端/平台/讨论形态，PH 为桌面端形态；WPS 候选表保持冻结归档；仓库 89 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在且与本地 HEAD b4ba6b3 一致；`git log` 确认开发交付 0dd6451；`grep tools/categories.go` 全量 89 Path，`pdf_sign` ID 与 `/tools/pdf-sign` Path 已注册（划入已实现），新候选建议 ID（ofd_reader）与 Path（/tools/ofd-reader）均无重叠；ofd/发票/invoice 关键词在 categories.go 全量零命中；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` 与 `toolweb`（均为构建产物，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-18 10:00 决策轮）

## 今日任务（2026-10-18 10:00 · 产品经理排期决策 ✅）

**交付状态**：待前端开发轮交付。10-18 排期决策轮（10:00 第十七轮研究之后）。宠物体重追踪器已交付闭环（07:00 PM 决策轮立项→开发交付 3c9f8b7+评审修复 776a91d；`grep tools/categories.go` 确认 ID `pet_weight_tracker`、Path `/tools/pet-weight-tracker` 已注册，「宠物生活」新品类落地，全量 88 Path），候选池划出。本轮立项**今日唯一任务：PDF 电子签名（手写签名嵌入 PDF）**。

**选定：PDF 电子签名（/tools/pdf-sign）** — 本轮唯一任务：
- **07:00 PM 决策轮预定兑现**：明确预定「后续上午大轮次首选」，本轮 10:00 正是上午大轮次窗口；第十七轮研究推荐 Top3 之首、多轮顺位递进第一顺位。
- **栈全部验证、风险解除**：05:41 轮 defer 理由是「需新增 PDF.js+pdf-lib 大依赖」；实测仓库已有成熟惯例——`pdf-watermark.js` 的「pdf.js 3.11.174 预览 + pdf-lib 1.17.1 回写」CDN 懒加载组合正是签名所需的形态（签名=透明 PNG 印章按页嵌入），无需 vendor 入库，无新增依赖，中难度降为可控。
- **差异化明确**：PdfWord 2026-10-12 Product Hunt「47 Free PDF Tools, Zero Backend」上线单列 eSign；fabulouspic 2026 榜单 7 款在线签名工具免费版全部受限（3–5 文档/月）——「免费无上限+文件不出浏览器」差异化成立。
- **旅程线闭环**：仓库 PDF 工具族已 13 个（pdf_annotate/pdf_manage 等同「文档转换」品类），签名是 PDF 旅程线最后一块拼图，双向互链成「PDF 办公」组合。
- **节奏错峰**：今日已交付结算算法型（AA 制）、转换导出型（Markdown→Excel）、教育生成型（算术题）、HR 打印型（工资条）、数据追踪型（宠物追踪）；本轮是 PDF 办公签署型，形态完全错峰。

**规格**：
1. 上传 PDF：pdf-lib 本地加载（CDN 懒加载惯例，沿 pdf-merge-split.js），文件只以 ArrayBuffer 在浏览器处理，不出浏览器。
2. pdf.js 3.11.174 逐页预览（CDN 懒加载惯例，沿 pdf-to-image.js，含 worker）；页码跳转、缩放预览。
3. 签名制作三方式：① 手写签名板（canvas，鼠标/触屏，笔画平滑）；② 上传签名图片（PNG/JPG，白底一键转透明）；③ 键入姓名→手写体风格渲染；签名库存 localStorage，可存多枚、改名/删除。
4. 签署交互：在预览页点击放置签名→拖拽定位、等比缩放、删除；多页可放置多枚签名；签名位置以 PDF 坐标系换算（pdf.js viewport→PDF points）。
5. 导出：pdf-lib embedPng 将各签名按页/坐标嵌入，回写输出新 PDF 下载；原文件不修改；附「签署清单」预览（第几页、几个签名）。
6. 隐私声明：工具页显著位置声明「PDF 文件只在你的浏览器里处理，不上传服务器」。
7. 纯前端、数据不出浏览器；响应式，桌面端优先、移动端可用。
8. 注册：`tools/categories.go`「文档转换」品类新增 ID `pdf_sign`、Path `/tools/pdf-sign`（New: true），中英文描述 + SEO keywords（PDF签名、在线签署PDF、电子签名、PDF手写签名），与 pdf_annotate/pdf_manage 双向互链。

**验收标准**：
- [ ] `/tools/pdf-sign` 可开（200）
- [ ] 上传 PDF→pdf.js 预览逐页渲染正常（多页文档页码跳转正确）
- [ ] 三种签名制作方式均可用；签名库 localStorage 持久化（刷新不丢失）
- [ ] 预览页点击放置→拖拽→缩放→删除全流程可用；签名位置与导出 PDF 实际位置一致（无偏移/镜像）
- [ ] 导出 PDF 可用阅读器正常打开，签名清晰、位置正确；原文件未被修改
- [ ] CDN 加载失败时有诚实降级提示（沿 showLibError 惯例）
- [ ] 纯前端无后端调用（DevTools Network 抽查）
- [ ] `categories.go` 注册完成（「文档转换」品类），首页/导航/sitemap 生效；与 pdf_annotate/pdf_manage 互链
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/pdf_sign.html`（新建：上传+pdf.js 预览+签名板+签署交互+导出，纯前端）、`static/js/pdf_sign.js`（新建：pdf.js/pdf-lib CDN 懒加载+签名库+坐标换算+嵌入回写，沿仓库 PDF 工具惯例）、`tools/categories.go`（「文档转换」品类注册+PDF 旅程线互链）、`BACKLOG.md`（本小节）。

**未选**：文本隐私脱敏工具（P1，07:00 PM 决策轮「下轮优先」，按顺位递进留待下轮）；图片隐写工具（P1，本轮新晋顺位第三：365Lab 2026-10-08 竞品+英文形态族，纯前端小难度，留池）；网站图标生成器（P1，顺位顺延）；SRT 字幕编辑器（P1，顺位顺延）；屏幕常亮工具（P1，本轮新晋，顺位递进留池）；报价单/收据生成器（P1，票据组合，顺位顺延）；视频抽帧（P1，难度中，适合上午轮次）；进制转换器（P1 观察）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；白噪音发生器（P2 观察）；MP3 标签编辑器（P2 观察）等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在且与本地 HEAD 3d3da07 一致；`grep tools/categories.go` 全量 88 Path，`pdf_sign`/`esign`/`sign` 全零命中（去重通过），ID `pdf_sign`、Path `/tools/pdf-sign` 无重叠；「文档转换」品类确认存在（含 pdf_annotate/pdf_manage 等 13 个 PDF 工具）；pdf.js 3.11.174 与 pdf-lib 1.17.1 均为 CDN 懒加载惯例（pdf-watermark.js/pdf-to-image.js/pdf-merge-split.js 已验证），无需新增依赖；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-18 10:00 第十七轮研究）

## 今日任务（2026-10-18 10:00 · 产品调研员研究轮 ✅）

**交付状态**：10-18 通用调研第十七轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研）。宠物体重记录追踪器已交付闭环（07:00 PM 决策轮立项→开发交付 3c9f8b7+评审修复 776a91d；`grep tools/categories.go` 确认 ID `pet_weight_tracker`、Path `/tools/pet-weight-tracker` 已注册，「宠物生活」新品类落地）。**用户方向修正（2026-10-18）**：聚焦 ToolWeb 工具本身，不再扩展泛财务/生活计算器类——7 个工具（工资个税/二手房税费/房贷/双十一凑单/双11到手价/经济补偿金/工资条生成器）已从开发版下线（c4efe50，grep 零残留），当前全量 **88 Path**（07:00 轮 94 − 7 下线 + 1 新增）。候选池划出宠物体重追踪器。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮四件事**（10:00 全网调研，通用方向）：
1. 宠物体重追踪器交付确认：`git log` 确认开发交付 3c9f8b7+评审修复 776a91d；`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 与本地 HEAD 776a91d 一致；`grep tools/categories.go` 全量 88 Path，`pet_weight_tracker` ID 与 `/tools/pet-weight-tracker` Path 已注册；下线 7 工具 grep 零残留（payslip_generator/salary-tax/mortgage/double11/economic-compensation/invoice-tax 全零命中）；候选池划出，已实现清单追加（delta：+ 宠物体重记录追踪器；历史全量见下方第十六轮小节）。
2. 新晋候选：**图片隐写工具（图片藏文字/提取）**。需求证据三重：① 365Lab 2026-10-08（10 天前）竞品工具「画中话（图片隐写）」+ 6 分钟教程《图片隐写入门：把文字或文件藏进图片》（隐藏文字/隐藏文件/图种/幻影坦克四种玩法，「全程本地处理不上传」）——竞品形态验证；② 英文形态族：stegtool.com（批量 LSB 编码，20 图并行）、tembrica.com（LSB+AES-256-GCM 口令加密+容量仪表）、imgcnv.com、toolshu.com（中文字符支持）、reducerimage.com（AES-GCM+CRC32）、privacypixtools.com（LSB 原理科普）——成熟工具类目；③ 隐私叙事与仓库「图片不出浏览器」铁律同构。可行性：纯前端小难度——上传载体图（canvas 读像素）→输入隐藏文本（+可选口令）→LSB 最低有效位嵌入→导出 PNG（无损保位）→上传隐写图一键提取；附容量实时显示（载体尺寸→可藏字符数）。去重：88 Path 无 steg/隐写命中。难度小。SEO：图片隐写、图片藏文字、隐写工具。建议 ID `image_steganography`、Path `/tools/image-steganography`。
3. 新晋候选：**屏幕常亮工具（Wake Lock 防息屏）**。需求证据三重：① 365Lab 2026-10-08（10 天前）40+ 工具榜单单列「屏幕常亮」（生活实用组，与密码生成器/WiFi 二维码并列）——竞品形态验证；② 形态族：stayawake.page（Wake Lock+白噪音+计时器，FAQ 完整）、mcstumble.com/tools/keep-screen-awake（状态指示+计时+浏览器限制说明）、dev.to 2026-05《How to Keep Your Screen Awake》指南——场景：做饭看菜谱、演示、监控长任务；③ MDN WakeLock 基线 2025：Chrome/Edge/Safari 16.4+，需 HTTPS 安全上下文，Firefox 不支持需诚实降级提示。可行性：纯前端极小难度——一键申请 `navigator.wakeLock.request('screen')`→状态指示→visibilitychange 自动重获→计时显示→手动释放。去重：88 Path 无 wake/awake/常亮命中。难度小。SEO：屏幕常亮、防息屏、保持屏幕常亮。建议 ID `screen_wake_lock`、Path `/tools/screen-wake-lock`。
4. 无新单页信号侧：① 贴纸生成器（365Lab 2026-10-08 教程+工具「贴纸生成器」：AI 抠图→白边圆角阴影→512×512 透明 PNG；但 AI 抠图需后端，纯前端版只能做整图白边/圆角，形态弱，列 P2 观察不单立）；② Tooltri 30+ 工具（dev.to 2026-10-08）：SQLite 查看器（sql.js WASM，开发者 niche）、SVG 转 JSX（开发者 niche）、Token Counter/AI 文本清理（仓库已有 ai-token-counter/ai-text-cleaner 覆盖）——不单立；③ Hacker News 10-11/10-15 roundup：big-arrow（macOS CLI agent 标注工具）、OpenMuse/browser-use（agent 平台）、DNS leak test（旧工具）——均非单页纯前端口径；④ V2EX 10-17/10-18：AI 视频去物 removeobjects.video（需 AI 后端）、BiliFlow（B 站桌面下载）、Chrome 插件 key-to-magpie（插件形态）、听力流利度练习 HTML（语言学习 niche）——无单页新信号；⑤ WPS 候选表保持冻结归档（本轮为通用方向）。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **PDF 电子签名（手写签名嵌入 PDF）** — P1（多轮顺位递进第一顺位；07:00 PM 决策轮预定「后续上午大轮次首选」，本轮 10:00 正是上午大轮次窗口；PdfWord 2026-10-12 Product Hunt 47 工具零后端上线单列 eSign；fabulouspic 2026 榜单全部免费版受限——「免费无上限+文件不出浏览器」差异化；纯前端中难度：PDF.js 渲染+canvas 签名板+pdf-lib 嵌入；与 pdf_annotate/pdf_manage 互链成 PDF 旅程线；88 Path 无 sign 重叠）。SEO：PDF签名、在线签署PDF。
2. **文本隐私脱敏工具（粘贴文本→敏感信息自动识别遮盖）** — P1（07:00 PM 决策轮「下轮优先」；dev.to Antigravity 2026-10-14 PII Masker+getweeve/lddgo 形态族；隐私叙事与仓库「数据不出浏览器」铁律同构；纯前端小难度：粘贴→正则识别（手机号/身份证/银行卡/邮箱/IP/车牌）→高亮逐条确认→一键遮盖→复制/下载；与 text_diff 互链成文本旅程线；88 Path 无重叠）。SEO：文本脱敏、隐私信息遮盖。
3. **图片隐写工具（图片藏文字/提取）** — P1（本轮新晋顺位第三：365Lab 2026-10-08 竞品工具+6 分钟教程形态验证；stegtool/tembrica/imgcnv/toolshu/reducerimage 英文形态族；纯前端小难度：LSB 嵌入/提取+容量实时显示；图片品类互链；88 Path 无重叠）。SEO：图片隐写、图片藏文字。

网站图标生成器列顺位第四（P1，顺位顺延）；SRT 字幕编辑器（P1，顺位顺延）；屏幕常亮工具（P1，本轮新晋，顺位递进留池）；报价单/收据生成器（P1，票据组合，顺位顺延）；视频抽帧（P1，难度中，适合上午轮次）；进制转换器（P1 观察）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；白噪音发生器（P2 观察，中文证据弱）；MP3 标签编辑器（P2 观察，开辟音频工具方向）；贴纸生成器（P2 观察，AI 抠图需后端）等其余候选留池。

**通用候选表增量**（第十七轮：宠物体重追踪器已实现划出；用户方向修正 7 工具下线（94−7+1=88 Path）；新晋图片隐写工具 P1、屏幕常亮工具 P1；观察贴纸生成器 P2）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 图片隐写工具（图片藏文字/提取） | 本轮新晋（365Lab 2026-10-08（10 天前）竞品工具「画中话（图片隐写）」+ 6 分钟教程《图片隐写入门》（隐藏文字/文件/图种/幻影坦克四种玩法，全程本地处理）——竞品形态验证；英文形态族：stegtool.com（批量 LSB 编码）、tembrica.com（LSB+AES-256-GCM 口令加密）、imgcnv.com、toolshu.com、reducerimage.com、privacypixtools.com——成熟工具类目；隐私叙事与仓库「图片不出浏览器」铁律同构）；纯前端小难度：上传载体图→输入隐藏文本（+可选口令）→LSB 最低有效位嵌入→导出 PNG→上传隐写图一键提取→容量实时显示；88 Path 无 steg/隐写命中 | 小 | P1（本轮新晋） |
| 屏幕常亮工具（Wake Lock 防息屏） | 本轮新晋（365Lab 2026-10-08 40+ 工具榜单单列「屏幕常亮」——竞品形态验证；形态族：stayawake.page（Wake Lock+白噪音+计时）、mcstumble.com keep-screen-awake（状态+计时）、dev.to 2026-05 指南；场景：做饭看菜谱/演示/监控长任务；MDN WakeLock 基线 2025：Chrome/Edge/Safari 16.4+，需 HTTPS，Firefox 不支持需诚实降级）；纯前端极小难度：一键申请 wakeLock→状态指示→visibilitychange 自动重获→计时→手动释放；88 Path 无 wake/awake/常亮命中 | 小 | P1（本轮新晋） |

**归档说明**：本轮为 10-18 通用调研第十七轮——宠物体重追踪器交付闭环（3c9f8b7+评审修复 776a91d，`/tools/pet-weight-tracker` 已注册，「宠物生活」新品类落地）；用户方向修正（2026-10-18）：聚焦 ToolWeb 工具本身，7 个泛财务/生活计算器（工资个税/二手房税费/房贷/双十一凑单/双11到手价/经济补偿金/工资条生成器）已下线（c4efe50，grep 零残留），当前全量 88 Path；新晋「图片隐写工具」P1（365Lab 2026-10-08 竞品+教程+英文形态族，纯前端小难度）、「屏幕常亮工具」P1（365Lab 榜单+stayawake/mcstumble 形态族，Wake Lock 纯前端极小难度）；观察贴纸生成器 P2（AI 抠图需后端）；V2EX/HN/dev.to 本轮无单页可落地新信号（AI 后端/桌面端/插件/agent 平台形态）；WPS 候选表保持冻结归档；仓库 88 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在且与本地 HEAD 776a91d 一致；`git log` 确认开发交付 3c9f8b7+评审修复 776a91d；`grep tools/categories.go` 全量 88 Path，`pet_weight_tracker` ID 与 `/tools/pet-weight-tracker` Path 已注册（划入已实现），下线 7 工具 grep 零残留，新候选建议 ID（image_steganography / screen_wake_lock）与 88 Path 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-18 07:00 决策轮）

## 今日任务（2026-10-18 07:00 · 产品经理排期决策 ✅）

**交付状态**：待前端开发轮交付。10-18 排期决策轮（07:00 第十六轮研究之后）。工资条生成器已交付闭环（05:41 PM 决策轮立项→开发交付 fecca94；`grep tools/categories.go` 确认 ID `payslip_generator`、Path `/tools/payslip-generator` 已注册，「生活工具」品类，「HR 财务」组合互链，全量 94 Path），候选池划出。本轮立项**今日唯一任务：宠物体重记录追踪器（多宠物体重/健康数据本地追踪）**。

**选定：宠物体重记录追踪器（/tools/pet-weight-tracker）** — 本轮唯一任务：
- **顺位递进到位**：07:00 第十六轮研究顺位第一（调研轮推荐 Top3 之首）；PM 决策轮尊重研究顺位，本轮按顺位递进立项。
- **证据最新**：V2EX 2026-10-17（23 小时前）「极简猫咪体重记录工具 Purrfit」形态验证+真实养猫动机（为记录绝育前增重缓慢的猫咪自建，多猫管理、趋势图 3M/6M/全部、CSV 导入导出、中英双语）；petslately.app 纯浏览器宠物记录四工具「数据不出浏览器」共识；nibble 宠物减重计划（3 天前）印证体重管理高频；Google Play 宠物健康 App 矩阵为成熟需求方向；在线单页形态稀缺=差异化。
- **07:00 清晨轮形态最稳**：表单+canvas 趋势图+localStorage，无文件上传复杂逻辑（研究轮原话）；纯前端小难度，一轮可高质量交付。
- **节奏错峰成立**：今日已交付结算算法型（AA 制 23:00）、转换导出型（Markdown→Excel 01:39）、教育生成型（算术题 03:40）、HR 办公打印型（工资条 05:41）；本轮是宠物健康数据追踪型，形态完全错峰；开辟「宠物/生活」新方向（首个工具即品类种子）。
- **场景化**：体重记录多在手机上随手记，移动端优先。

**规格**：
1. 宠物档案管理：新增/编辑/删除宠物（名字、种类猫/狗/其他、头像 emoji、目标体重、出生日期可选），多宠物切换；数据存 localStorage，刷新不丢失。
2. 体重录入：日期+体重+单位（kg/lb 一键切换）；「抱着称减体重」模式（输入抱宠总重+抱宠者体重→自动差值计算宠物体重）；备注可选。
3. 趋势折线图：canvas 自绘折线图（沿仓库独立 JS 惯例，不新增依赖）；时间范围 3M/6M/全部切换；目标体重参考线。
4. 体重变化预警：按最近时间窗口计算变化率，短期掉体重超阈值（如周变化 ≥10% 或连续下降）给出「建议咨询兽医」提示（猫咪快速掉体重是就医信号）；文案为提示建议、不做医疗诊断。
5. CSV 导出/导入：每宠物体重记录 CSV 导出（宠物名,日期,体重kg,备注），支持导入恢复；附示例数据一键填入。
6. 隐私声明：工具页显著位置声明「数据只存本浏览器 localStorage，不出浏览器」。
7. 纯前端、数据不出浏览器；响应式，移动端优先、桌面端可用。
8. 注册：`tools/categories.go` 新品类「宠物生活」（New: true），新增 ID `pet_weight_tracker`、Path `/tools/pet-weight-tracker`（New: true），中英文描述 + SEO keywords（宠物体重记录、猫咪体重追踪、宠物健康记录）。

**验收标准**：
- [ ] `/tools/pet-weight-tracker` 可开（200）
- [ ] 增删改宠物档案、切换宠物生效；刷新页面数据不丢失（localStorage 持久化）
- [ ] 体重录入+单位（kg/lb）切换正确；「抱着称减体重」差值计算正确
- [ ] 趋势折线图随时间范围（3M/6M/全部）切换正确渲染；目标体重参考线可见
- [ ] 短期掉体重超阈值时预警提示出现；预警文案为提示建议、非医疗诊断
- [ ] CSV 导出可用 Excel/WPS 正常打开；导入能恢复数据；示例数据一键填入可用
- [ ] 纯前端无后端调用（DevTools Network 抽查）
- [ ] `categories.go` 注册完成（「宠物生活」新品类），首页/导航/sitemap 生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/pet_weight_tracker.html`（新建：宠物档案+体重录入+趋势图+预警+CSV，纯前端）、`static/js/pet_weight_tracker.js`（新建：localStorage 数据层+canvas 趋势图渲染引擎，沿仓库独立 JS 惯例）、`tools/categories.go`（新品类「宠物生活」注册）、`BACKLOG.md`（本小节）。

**开发交付记录（2026-10-18 07:xx 前端开发轮 ✅）**：新建 `templates/pet_weight_tracker.html`（宠物档案 chips+表单、体重录入、canvas 趋势图、预警横幅、记录表、CSV 管理、使用说明/FAQ，页首 localStorage 隐私承诺横幅）、`static/js/pet_weight_tracker.js`（localStorage 数据层、kg/lb 换算、抱着称差值计算、canvas 自绘折线图 3M/6M/全部+目标参考线、近3周≥10%/连续4次下降≥5%预警、CSV 导出 BOM/导入/示例数据，纯函数经 node 20 项单元测试全过）；`tools/categories.go` 新增「宠物生活」品类（ID pet_weight_tracker、Path /tools/pet-weight-tracker、New: true，中英描述+SEO keywords）。本地构建通过；127.0.0.1:18099 实测 /tools/pet-weight-tracker 200、JS 200、sitemap 命中、首页品类与路径生效；测试服务已清理。commit 待推送。

**未选**：文本隐私脱敏工具（P1，本轮新晋：dev.to Antigravity 2026-10-14 PII Masker+getweeve/lddgo 形态族，隐私叙事与「不出浏览器」铁律同构；按顺位递进留池，下轮优先）；网站图标生成器（P1，本轮新晋：365Lab 2026-10-08 竞品榜单+Byte-Kit 同形态，开发者建站刚需；顺位留池）；PDF 电子签名（P1，顺位第四：PdfWord 2026-10-12 PH eSign+fabulouspic 榜单全部免费版受限；难度中且需新增 PDF.js+pdf-lib 大依赖，留池作后续上午大轮次首选）；SRT 字幕编辑器（P1，顺位顺延，开辟字幕/视频新方向）；报价单/收据生成器（P1，票据组合，顺位顺延）；视频抽帧（P1，难度中，适合上午轮次）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；白噪音发生器（P2 观察，中文证据弱）；MP3 标签编辑器（P2 观察，开辟音频工具方向）等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在且与本地 HEAD 9c76d44 一致；`grep tools/categories.go` 全量 94 Path，无 pet/宠物/猫/体重/weight 命中（"pet" 仅命中 serp_snippet_preview 描述字母组合，非宠物工具），ID `pet_weight_tracker`、Path `/tools/pet-weight-tracker` 无重叠；新品类「宠物生活」无冲突；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-18 07:00 第十六轮研究）

## 今日任务（2026-10-18 07:00 · 产品调研员研究轮 ✅）

**交付状态**：10-18 通用调研第十六轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研）。工资条生成器已交付闭环（05:41 PM 决策轮立项→开发交付 fecca94；`grep tools/categories.go` 确认 ID `payslip_generator`、Path `/tools/payslip-generator` 已注册，全量 94 Path），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮四件事**（07:00 全网调研，通用方向）：
1. 工资条生成器交付确认：`git log` 确认开发交付 fecca94；`grep tools/categories.go` 确认已注册（全量 94 Path），与候选池无重叠项残留；候选池划出，已实现清单追加（delta：+ 工资条生成器；历史全量见下方第十五轮小节）。
2. 新晋候选：**宠物体重记录追踪器（多宠物体重/健康数据本地追踪）**。需求证据三重：① V2EX 2026-10-17（23 小时前）「极简猫咪体重记录工具 Purrfit」——Cloudflare Workers+KV，多猫咪管理、趋势图（3M/6M/全部）、CSV 导入导出、PWA、亮/暗色、中英双语，作者为记录绝育前增重缓慢的猫咪而自建——形态验证+真实动机；② petslately.app：纯浏览器宠物记录站（Weight Tracker / Vet Visit Summary / Symptom Timeline / Medication Schedule 四工具，「No account, entries stay in this browser」——「数据不出浏览器」共识与仓库铁律同构）；③ nibble.conylab.workers.dev（3 天前抓取）：宠物减重计划工具（体况评分→每日喂食克数→每周称重→减重速度守卫），印证「体重管理」为宠物主高频需求；④ Google Play PetnotePlus / Pet Care Tracker / Pet Journal 宠物健康 App 矩阵——宠物健康记录为成熟需求方向。在线形态稀缺（多为 App/需账号），浏览器单页本地版是差异化。可行性：纯前端小难度——多宠物档案（localStorage）→体重录入（日期+kg/lb，支持「抱着称减体重」）→趋势折线图（canvas，3M/6M/全部）→增重/减重速度预警（猫咪快速掉体重是就医信号）→CSV 导出/导入。去重：94 Path 无 pet/宠物/猫/体重/weight/健康/health 命中（此前 grep "pet" 命中仅 serp_snippet_preview 描述中的字母组合，非宠物工具）。难度小。SEO：宠物体重记录、猫咪体重追踪、宠物健康记录。建议 ID `pet_weight_tracker`、Path `/tools/pet-weight-tracker`。开辟「宠物/生活」新方向。
3. 新晋候选：**文本隐私脱敏工具（粘贴文本→敏感信息自动识别遮盖）**。需求证据三重：① dev.to Antigravity Tools 2026-10-14（4 天前，59 工具集）单列「PII Masker — strip emails, credit cards, SSNs, IPs from text」，「every operation runs inside your browser」——隐私叙事与仓库「数据不出浏览器」铁律同构；② getweeve.io/tools/anonymize：浏览器端文档匿名化（规则识别 email/phone/SSN/IBAN/postcode/dates/links，on-device 模型识别人名/组织，「Nothing you paste or upload leaves this page」，免费无账号）——形态族验证；③ lddgo.net 在线数据脱敏：「使用浏览器能力实现，您的数据不会被上传到云端」，支持 txt/csv/json/excel，哈希/遮盖/替换/洗牌脱敏——中文形态验证。中文场景：发截图/贴报错日志到 GitHub/社群前先脱敏手机号、身份证号、银行卡、车牌、IP。可行性：纯前端小难度——粘贴文本→正则自动识别（中国手机号/身份证/银行卡/邮箱/IPv4/车牌）→高亮预览逐条确认（防过杀/漏杀）→一键遮盖（✳ 部分保留）/替换假名→复制/下载；与 text_diff 互链成「文本处理」旅程线。去重：94 Path 无 mask/脱敏/pii/redac/隐私命中。难度小。SEO：文本脱敏、隐私信息遮盖、日志脱敏。建议 ID `text_privacy_masker`、Path `/tools/text-privacy-masker`。
4. 新晋候选：**网站图标生成器（一键生成 favicon 多尺寸+代码片段）**。需求证据双重：① 365Lab 2026-10-08（10 天前）「2026 免费在线工具推荐：40+ 实用工具」单列「图标生成器：网站图标」（与贴纸生成器并列图片工具组）——竞品工具站形态验证；② dev.to Byte-Kit（24 工具集，7 天前）内置 favicon generator 同形态。可行性：纯前端小难度——上传 logo（canvas 重采样）→一键生成 16/32/180/192/512 多尺寸 PNG + apple-touch-icon + Web App Manifest JSON + HTML <link> 代码片段一键复制→打包下载；开发者/站长建站高频刚需，仓库开发者工具品类可互链（JWT/JSON/正则工具同人群）。去重：94 Path 无 favicon/图标命中（"icon" 命中仅 calendar 的 Icon 字段名）。难度小。SEO：favicon 生成、网站图标制作、app icon 生成。建议 ID `favicon_generator`、Path `/tools/favicon-generator`。

无新单页信号侧：① V2EX 10-17/10-18：BiliFlow（B 站桌面下载+直播录制，桌面端）、闲置资源共享变现平台（平台想法，非单页）、AI 视频去物 removeobjects.video（需 AI 后端）、remox.ai 图片擦除/去背景（AI 后端；纯前端 inpainting 不可行，需求归档观察）、Yir.AI 生图生视频比价路由（平台）、财悟-记账也记物（iOS App）、随声提词（Mac/iOS 原生+本地语音识别）、Iterlay（AI 画布桌面端）——均非单页纯前端口径；② dev.to UniRecorder 40+ 工具（21 天前）：录屏/计算器类与仓库重叠或已有；③ Hacker News 10-15：Tiny Little Office（浏览器办公套件，单页承载过大）、Fleeting 假会议录音+日历邀请生成器（.ics 生成器单页可实现，但恶搞属性强、仓库已有 /tools/calendar，暂不单立）；④ 365Lab 榜单其余项（证件照/发票助手/拼图/背景图/配色网/词云/网名生成器/显卡测试）：仓库已覆盖或为已有工具增强项；⑤ info35/techtippr 榜单：水印/AI 音乐/生图 API——仓库水印已覆盖、AI 需后端；⑥ WPS 候选表保持冻结归档（本轮为通用方向）。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **宠物体重记录追踪器（多宠物体重/健康数据本地追踪）** — P1（本轮新晋顺位第一：V2EX 2026-10-17（23 小时前）Purrfit 形态验证+真实养猫动机；petslately 四工具「数据不出浏览器」共识；nibble 宠物减重计划（3 天前）印证体重管理高频；Google Play 宠物健康 App 矩阵成熟需求；在线单页形态稀缺=差异化；纯前端小难度：多宠物档案→体重录入→趋势图→增速预警→CSV 导入导出；94 Path 无重叠；开辟「宠物/生活」新方向；07:00 清晨轮形态稳：表单+图表+localStorage，无文件上传复杂逻辑）。SEO：宠物体重记录、猫咪体重追踪。
2. **文本隐私脱敏工具（粘贴文本→敏感信息自动识别遮盖）** — P1（本轮新晋：dev.to Antigravity 2026-10-14（4 天前）PII Masker 形态；getweeve 浏览器端匿名化形态族验证；lddgo.net 中文脱敏形态验证；隐私叙事与仓库「数据不出浏览器」铁律同构；纯前端小难度：粘贴→正则识别（手机号/身份证/银行卡/邮箱/IP/车牌）→高亮逐条确认→一键遮盖→复制/下载；与 text_diff 互链成文本旅程线；94 Path 无重叠）。SEO：文本脱敏、隐私信息遮盖。
3. **网站图标生成器（一键生成 favicon 多尺寸+代码片段）** — P1（本轮新晋：365Lab 2026-10-08（10 天前）竞品榜单单列「图标生成器」形态验证；Byte-Kit favicon generator 同形态；纯前端小难度：上传 logo→canvas 重采样→16/32/180/192/512 PNG+Manifest+<link>代码片段→打包下载；开发者/站长建站刚需，与仓库开发者工具同人群互链；94 Path 无重叠）。SEO：favicon 生成、网站图标制作。

PDF 电子签名列顺位第四（P1，顺位递进：PdfWord 2026-10-12 PH eSign + fabulouspic 榜单全部免费版受限，「免费无上限+文件不出浏览器」差异化；但难度中且需新增 PDF.js+pdf-lib 两个大依赖，留池作后续上午大轮次首选）；SRT 字幕编辑器（P1，顺位顺延：dev.to 2026-10-15 纯 JS 形态+四家在线字幕编辑器形态族验证+中文桌面版需求证明，开辟字幕/视频新方向；按顺位递进规则继续留池）；报价单/收据生成器（P1，票据组合，顺位顺延）；视频抽帧（P1，难度中，适合上午轮次）；进制转换器（P1 观察）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；白噪音发生器（P2 观察，中文证据弱）；MP3 标签编辑器（P2 观察，开辟音频工具方向）等其余候选留池。

**通用候选表增量**（第十六轮：工资条生成器已实现划出；新晋宠物体重记录追踪器 P1、文本隐私脱敏工具 P1、网站图标生成器 P1；全量 94 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 宠物体重记录追踪器（多宠物体重/健康数据本地追踪） | 本轮新晋（V2EX 2026-10-17（23 小时前）「极简猫咪体重记录工具 Purrfit」——Cloudflare Workers+KV，多猫管理、趋势图 3M/6M/全部、CSV 导入导出、PWA、亮/暗色、中英双语，作者为记录绝育前增重缓慢的猫咪而自建——形态验证+真实动机；petslately.app 纯浏览器宠物记录四工具（Weight Tracker / Vet Visit Summary / Symptom Timeline / Medication Schedule，「No account, entries stay in this browser」——「数据不出浏览器」共识）；nibble.conylab.workers.dev（3 天前）宠物减重计划（体况评分→每日喂食克数→每周称重→减重速度守卫），印证体重管理为宠物主高频需求；Google Play PetnotePlus / Pet Care Tracker / Pet Journal 宠物健康 App 矩阵——成熟需求方向）；在线单页形态稀缺（多为 App/需账号），浏览器本地版是差异化；纯前端小难度：多宠物档案（localStorage）→体重录入（日期+kg/lb，支持「抱着称减体重」）→趋势折线图（canvas，3M/6M/全部）→增重/减重速度预警（猫咪快速掉体重是就医信号）→CSV 导出/导入；94 Path 无 pet/宠物/猫/体重/weight/健康/health 命中（此前 "pet" 命中仅 serp_snippet_preview 描述字母组合）；开辟「宠物/生活」新方向 | 小 | P1（本轮新晋） |
| 文本隐私脱敏工具（粘贴文本→敏感信息自动识别遮盖） | 本轮新晋（dev.to Antigravity Tools 2026-10-14（4 天前，59 工具集）单列「PII Masker — strip emails, credit cards, SSNs, IPs from text」，「every operation runs inside your browser」——隐私叙事与仓库「数据不出浏览器」铁律同构；getweeve.io/tools/anonymize 浏览器端文档匿名化（规则识别 email/phone/SSN/IBAN/postcode/dates/links，on-device 模型识别人名/组织，「Nothing you paste or upload leaves this page」，免费无账号）——形态族验证；lddgo.net 在线数据脱敏：「使用浏览器能力实现，您的数据不会被上传到云端」，支持 txt/csv/json/excel，哈希/遮盖/替换/洗牌脱敏——中文形态验证）；中文场景：发截图/贴报错日志到 GitHub/社群前先脱敏手机号、身份证号、银行卡、车牌、IP；纯前端小难度：粘贴文本→正则自动识别（中国手机号/身份证/银行卡/邮箱/IPv4/车牌）→高亮预览逐条确认（防过杀/漏杀）→一键遮盖（✳ 部分保留）/替换假名→复制/下载；与 text_diff 互链成「文本处理」旅程线；94 Path 无 mask/脱敏/pii/redac/隐私命中 | 小 | P1（本轮新晋） |
| 网站图标生成器（一键生成 favicon 多尺寸+代码片段） | 本轮新晋（365Lab 2026-10-08（10 天前）「2026 免费在线工具推荐：40+ 实用工具」单列「图标生成器：网站图标」（与贴纸生成器并列图片工具组）——竞品工具站形态验证；dev.to Byte-Kit（24 工具集，7 天前）内置 favicon generator 同形态）；开发者/站长建站高频刚需（favicon.ico + apple-touch-icon + Manifest 每次都要手配）；纯前端小难度：上传 logo（canvas 重采样）→一键生成 16/32/180/192/512 多尺寸 PNG + apple-touch-icon + Web App Manifest JSON + HTML <link> 代码片段一键复制→打包下载；与仓库开发者工具（JWT/JSON/正则）同人群互链；94 Path 无 favicon/图标命中（"icon" 仅 calendar 的 Icon 字段名） | 小 | P1（本轮新晋） |

**归档说明**：本轮为 10-18 通用调研第十六轮——工资条生成器交付闭环（fecca94，`/tools/payslip-generator` 已注册，「生活工具」品类，「HR 财务」组合互链，全量 94 Path），候选池划出，已实现清单 delta 追加；新晋候选「宠物体重记录追踪器」P1（V2EX 2026-10-17 Purrfit 形态验证 + petslately/nibble 形态族 + App 矩阵需求证明，纯前端小难度，开辟「宠物/生活」新方向）、「文本隐私脱敏工具」P1（dev.to 2026-10-14 PII Masker + getweeve/lddgo 形态族，隐私叙事与「不出浏览器」铁律同构，纯前端小难度）、「网站图标生成器」P1（365Lab 2026-10-08 竞品榜单形态验证 + Byte-Kit 同形态，开发者建站刚需，纯前端小难度）；V2EX 10-17/10-18 热点均为桌面端/App/AI 后端/平台形态（BiliFlow、AI 视频去物、remox.ai 擦除、Yir.AI 比价、闲置平台、记账 App、提词 App）无单页可落地新信号；HN 10-15 Tiny Little Office 单页承载过大、Fleeting .ics 生成器恶搞属性强且仓库已有 calendar；365Lab 榜单其余项为仓库已覆盖或增强项；info35/techtippr 为水印/AI 方向（已覆盖/需后端）；WPS 候选表保持冻结归档；仓库 94 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在且与本地 HEAD fecca94 一致；`git log` 确认开发交付 fecca94；`grep tools/categories.go` 全量 94 Path，`payslip_generator` ID 与 `/tools/payslip-generator` Path 已注册（划入已实现），新候选建议 ID（pet_weight_tracker / text_privacy_masker / favicon_generator）与 Path 均无重叠；健康/体重/隐私/图标四类关键词在 categories.go 全量零命中；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-18 05:41 决策轮）

## 今日任务（2026-10-18 05:41 · 产品经理排期决策 ✅）

**交付状态**：待前端开发轮交付。10-18 排期决策轮（05:00 第十五轮研究之后）。算术题生成器已交付闭环（03:40 PM 决策轮立项→开发交付 cc325f6+评审修复 7ef58a5；`grep tools/categories.go` 确认 ID `math_worksheet_generator`、Path `/tools/math-worksheet-generator` 已注册，「学习工具」新品类落地，全量 93 Path），候选池划出。本轮立项**今日下一任务：工资条生成器（HR 工资表→每人工资条）**。

**选定：工资条生成器（/tools/payslip-generator）** — 本轮唯一任务：
- **多轮顺位递进到位**：第六轮新晋 P1，历经九轮顺位递进（第十四/十五轮研究均列 P1 第二）；前三轮（23:00/01:39/03:40）均因「深夜轮 Excel 上传+解析+打印布局交付质量风险偏高」defer，本轮为 05:41 清晨轮次、进入白天窗口，历史阻断因素解除。
- **时令强契合**：10-18 临近月底发薪，HR/财务做工资条正当时——多轮论证的「月底前高频场景」本轮兑现。
- **栈全部验证、难度小**：SheetJS 0.18.5（01:39 轮 Markdown→Excel 刚复用跑通）+ 打印路线（简历制作器/方格纸/算术题 `@media print` 已跑通），无新增依赖，一轮可高质量交付。
- **节奏错峰成立**：今日已交付结算算法型（AA 制 23:00）、转换导出型（Markdown→Excel 01:39）、教育生成型（算术题 03:40）；本轮是 HR 办公打印型，形态完全错峰。
- **旅程线闭环**：与工资个税计算器（`/tools/salary-tax-calculator`，同「生活工具」品类）双向互链成「HR 财务」组合（算税→发条），延续既定产品线策略；「工资数据不出浏览器」隐私叙事（工资高度敏感）。

**规格**：
1. 输入：上传工资表 Excel（`.xlsx`/`.xls`，SheetJS 本地解析，数据不出浏览器）；自动识别首行表头；用户可手动指定「姓名列」与工资项列范围；示例工资表一键填入（含姓名/基本工资/绩效/补贴/社保/个税/实发多列样例）。
2. 逐员工工资条卡片：公司名称栏+姓名+月份栏；工资项明细行（项目/金额，千分位格式化）；应发合计/实发合计高亮；员工签名栏。
3. 打印布局：A4 一页多条（默认 3 条、可调 2/3/4），条间裁剪虚线；`@media print` 隐藏操作区/导航，打印直接出干净工资条。
4. 导出：单表工资条一键导出 `.xlsx`（每员工一张工资条明细 sheet，SheetJS 写出；沿 markdown-to-excel 诚实降级经验：社区版不写样式、只做数据结构）。
5. 隐私声明：工具页显著位置声明「工资数据不出浏览器」。
6. 纯前端、数据不出浏览器；响应式，桌面端优先、移动端可用。
7. 注册：`tools/categories.go`「生活工具」品类新增 ID `payslip_generator`、Path `/tools/payslip-generator`（New: true），中英文描述 + SEO keywords（工资条生成器、在线工资条、工资条打印、工资条制作），与工资个税计算器双向互链。

**验收标准**：
- [ ] `/tools/payslip-generator` 可开（200）
- [ ] 上传示例工资表→表头识别正确；手动指定姓名列/工资项列生效；员工数=工资条卡片数
- [ ] 每张工资条：姓名/月份/明细行/应发实发合计/签名栏齐全，金额千分位格式正确
- [ ] A4 打印预览：每页条数设置生效、条间裁剪虚线可见、无操作按钮/导航栏残留
- [ ] 单表 `.xlsx` 导出可用 Excel/WPS 正常打开，每员工工资条明细完整
- [ ] 示例工资表一键填入可用；纯前端无后端调用（DevTools Network 抽查）
- [ ] `categories.go` 注册完成（「生活工具」品类），首页/导航/sitemap 生效；与工资个税计算器互链
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/payslip_generator.html`（新建：上传+列映射+工资条卡片预览+A4 打印样式，纯前端）、`static/js/payslip_generator.js`（新建：SheetJS 解析+工资条渲染引擎，沿仓库独立 JS 惯例）、`tools/categories.go`（「生活工具」品类注册+「HR 财务」组合互链）、`BACKLOG.md`（本小节）。

**未选**：PDF 电子签名（P1，调研轮顺位第一：PdfWord 2026-10-12 PH 上线单列 eSign+fabulouspic 2026 榜单全部免费版受限，差异化强；但难度中且需新增 PDF.js+pdf-lib 两个大依赖（`static/js/vendor` 经查未入库），2 小时流水线轮次承担质量风险偏高，留池作后续上午大轮次首选）；SRT 字幕编辑器（P1，本轮新晋：dev.to 2026-10-15 纯 JS 形态+四家在线字幕编辑器形态族验证+中文桌面版需求证明，开辟字幕/视频新方向；但顺位晚工资条生成器九轮，按顺位递进规则继续留池，下轮优先）；报价单/收据生成器（P1，票据组合，顺位顺延）；视频抽帧（P1，难度中，适合上午轮次）；进制转换器（P1 观察）；年会大屏抽奖（时令预热）；金额大写转换器（节奏调节位）；白噪音发生器（P2 观察，中文证据弱）等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 93 Path，无 payslip/工资条 Path 命中（`工资条`仅出现在 PDF 加密工具描述文字中，非工资条生成器工具；工资个税计算器为个税计算方向不同），ID `payslip_generator`、Path `/tools/payslip-generator` 无重叠（第六轮约定 ID/Path 沿用）；「生活工具」品类确认存在（含工资个税计算器）；SheetJS 0.18.5 已存在于 `static/js/vendor/xlsx-0.18.5.umd.js`，无需新增依赖；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-18 05:00 第十五轮研究）

## 今日任务（2026-10-18 05:00 · 产品调研员研究轮 ✅）

**交付状态**：10-18 通用调研第十五轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研）。算术题生成器已交付闭环（03:40 PM 决策轮立项→开发交付 cc325f6+评审修复 7ef58a5；`grep tools/categories.go` 确认 ID `math_worksheet_generator`、Path `/tools/math-worksheet-generator` 已注册，「学习工具」新品类落地，全量 93 Path），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮四件事**（05:00 全网调研，通用方向）：
1. 算术题生成器交付确认：`git log` 确认开发交付 cc325f6+评审修复 7ef58a5；`grep tools/categories.go` 确认已注册（全量 93 Path），与候选池无重叠项残留；候选池划出，已实现清单追加（delta：+ 算术题生成器；历史全量见下方第十四轮小节）。
2. 新晋候选：**SRT 字幕编辑器（字幕文本+时间轴本地编辑）**。需求证据三重：① dev.to rehmanarain521svg 2026-10-15（2 天前）浏览器工具集上线帖单列「SRT Editor — pure JavaScript」（同形态含图片压缩/尺寸调整/Image to PDF/PDF 合并）；② 在线字幕编辑器形态族验证：VexaScribe（CPS 阅读速度实时校验+双点时间漂移校正）、Subformer（SRT↔VTT 互转+时间轴拖拽）、ConvertICO（支持 9 种字幕格式互转+全局时间平移+查找替换）、subtitling.net（字幕质量评分 0-100）——全部「浏览器本地解析、免费、无注册」共识；③ 中文需求证据：6mf.net 2026-09-23（1 个月前）《字幕编辑软件 Subtitle Workshop v6.3.7 便携版》——中文用户仍在靠桌面版做「字幕翻译、校时、纠错与导出」，印证字幕校对/格式转换需求。可行性：纯前端小-中难度——上传 `.srt`/`.vtt`（FileReader 本地解析，数据不出浏览器）→条目表（文本/起止时间码可编辑）→增删/拆分/合并条目→全局时间平移（核心痛点：字幕与视频对不上，一键整体前移/后移 N 秒）→重叠时间码检测→导出 `.srt`/`.vtt`（附 SRT↔VTT 互转）→自动重编号；与视频抽帧候选互链成「视频工具」方向。去重：93 Path 无 subtitle/srt/vtt/字幕命中。SEO：字幕编辑器、SRT 编辑、字幕时间校准、SRT 转 VTT。建议 ID `subtitle_editor`、Path `/tools/subtitle-editor`。
3. 明确去重（不立）：shykov.dev 2026-10-17（1 天前）浏览器端 ATS 简历检查器（cv.shykov.dev）——仓库已有 `/tools/resume-checker`（简历预检工具，JD 关键词匹配+ATS 友好度检测），同方向已覆盖，不单立。
4. 无新单页信号侧：① V2EX 10-17/10-18：BiliFlow（B 站桌面下载，桌面端）、Iterlay（AI 画布，桌面+自带模型）、财悟-记账也记物（iOS App）、随声提词（Mac/iOS 原生语音提词，需本地语音识别）、AI 视频去物（需 AI 后端）、看榜小工具（tranco+GitHub Action 定时抓取，需后端流水线）——均非单页纯前端口径；② dev.to BlanzaTools 2026-10-11（14 工具）：年龄/BMI/百分比/倒计时等——与仓库 93 Path 工具族重叠或为现有计算器类增强项，不单立；③ Medium PH 本周榜（JSONexLab 7 B2B API）：IBAN/VAT/SWIFT/制裁筛查均为后端 API 产品；Retriever AI（浏览器 AI agent）非单页工具；④ Antops 2026-10-15 SEO Audit Checker：需服务端抓取目标页（CORS 限制），纯前端不可靠，单篇厂商新闻稿，进 P3 不单立；⑤ WPS 候选表保持冻结归档（本轮为通用方向）。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **PDF 电子签名（手写签名嵌入 PDF）** — P1（顺位第一：03:00 新晋，PdfWord 2026-10-12 Product Hunt 47 工具零后端上线单列 eSign；fabulouspic 2026 榜单全部免费版受限——「免费无上限+文件不出浏览器」差异化；纯前端中难度：PDF.js 渲染+canvas 签名板+pdf-lib 嵌入；与 pdf_annotate/pdf_manage 互链成 PDF 旅程线；93 Path 无 sign 重叠）。SEO：PDF签名、在线签署PDF。
2. **工资条生成器（HR 工资表→每人工资条）** — P1（多轮顺位递进：第六轮新晋，360doc 双证据；HR/财务月度刚需；纯前端小难度：上传工资表 Excel（SheetJS 在栈）→逐员工工资条卡片→浏览器打印/PDF 导出；与工资个税计算器互链成「HR 财务」组合）。SEO：工资条生成器。
3. **SRT 字幕编辑器（字幕文本+时间轴本地编辑）** — P1（本轮新晋：dev.to xmico 2026-10-15（2 天前）纯 JS 字幕编辑器形态；VexaScribe/Subformer/ConvertICO/subtitling.net 形态族验证（本地解析+免费+无注册共识）；6mf.net 2026-09-23 中文桌面版需求证明；纯前端小-中难度：上传→条目编辑→增删拆分合并→全局时间平移→SRT↔VTT 互转导出；93 Path 无重叠；开辟「字幕/视频工具」新方向）。SEO：字幕编辑器、SRT 转 VTT。

报价单/收据生成器列顺位第四（P1，「票据」组合，顺位顺延）；视频抽帧（P1，难度中，适合上午轮次）；进制转换器（P1 观察）；年会大屏抽奖（P1 时令预热）；白噪音发生器（P2 观察）；金额大写转换器（节奏调节位）；MP3 标签编辑器（P2 观察，开辟音频工具方向）等其余候选留池。

**通用候选表增量**（第十五轮：算术题生成器已实现划出；新晋 SRT 字幕编辑器 P1；去重 ATS 简历检查器（已有 resume_checker 覆盖）；全量 93 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| SRT 字幕编辑器（字幕文本+时间轴本地编辑） | 本轮新晋（dev.to rehmanarain521svg 2026-10-15（2 天前）浏览器工具集上线帖单列「SRT Editor — pure JavaScript」（图片压缩/尺寸调整/Image to PDF/PDF 合并同形态）；形态族验证：VexaScribe（CPS 阅读速度实时校验+双点时间漂移校正）、Subformer（SRT↔VTT 互转+时间轴拖拽）、ConvertICO（9 种字幕格式互转+全局时间平移+查找替换）、subtitling.net（字幕质量评分）——全部「浏览器本地解析、免费、无注册」共识；中文需求证据：6mf.net 2026-09-23（1 个月前）《Subtitle Workshop v6.3.7 便携版》——中文用户仍靠桌面版做「字幕翻译、校时、纠错与导出」）；核心痛点：字幕与视频对不上（全局时间平移）、格式互转麻烦；纯前端小-中难度：上传 .srt/.vtt（本地解析）→条目表可编辑（文本/起止时间码）→增删/拆分/合并→全局时间平移→重叠检测→导出 .srt/.vtt（附互转）→自动重编号；与视频抽帧互链成「视频工具」方向；93 Path 无 subtitle/srt/vtt/字幕命中 | 小-中 | P1（本轮新晋） |

**归档说明**：本轮为 10-18 通用调研第十五轮——算术题生成器交付闭环（cc325f6+评审修复 7ef58a5，`/tools/math-worksheet-generator` 已注册，「学习工具」新品类落地，全量 93 Path），候选池划出，已实现清单 delta 追加；新晋候选「SRT 字幕编辑器」P1（dev.to 2026-10-15 纯 JS 形态+四家在线字幕编辑器形态族验证+中文桌面版需求证明，纯前端小-中难度，开辟字幕/视频工具方向）；去重 shykov ATS 简历检查器（仓库已有 `/tools/resume-checker` 覆盖）；V2EX 10-17/10-18 均为桌面端/App/AI/后端形态，无单页可落地新信号；BlanzaTools 14 工具与仓库重叠或为增强项；JSONexLab B2B API 与 Antops SEO 审计均为后端产品形态；WPS 候选表保持冻结归档；仓库 93 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在且与本地 HEAD 7ef58a5 一致；`git log` 确认开发交付 cc325f6+评审修复 7ef58a5；`grep tools/categories.go` 全量 93 Path，`math_worksheet_generator` ID 与 `/tools/math-worksheet-generator` Path 已注册（划入已实现），新候选建议 ID（subtitle_editor）与 93 Path 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-18 03:40 决策轮）

## 今日任务（2026-10-18 03:40 · 产品经理排期决策 ✅）

**交付状态**：前端开发轮已交付（2026-10-18 03:52）：`templates/math_worksheet_generator.html`（新建）+ `static/js/math_worksheet_generator.js`（新建，纯前端出题引擎）+ `tools/categories.go`（新品类「学习工具」注册，ID `math_worksheet_generator`），待评审/测试轮。10-18 排期决策轮（03:00 第十四轮研究之后）。Markdown 表格→Excel 转换器已交付闭环（01:39 PM 决策轮立项→开发交付 6859282+评审修复 318895b，`/tools/markdown-to-excel` 已注册，全量 92 Path），候选池划出。本轮立项**今日唯一任务：算术题生成器（小学口算/竖式练习题一键打印）**。

**选定：算术题生成器（/tools/math-worksheet-generator）** — 本轮唯一任务：
- **03:40 深夜轮形态最稳**：纯前端小难度（参数表单→随机出题引擎→A4 练习纸预览→浏览器打印/PDF 导出+独立答案页），无文件上传、无外部依赖、无复杂算法，深夜轮可高质量交付。
- **证据双重最新**：① 365Lab 2026-10-08（10 天前）中文教程「小学口算练习怎么生成：题型、难度与打印」——「孩子计算要天天练，但家长手动出题费时」「全程本地生成，不上传、免费无水印」，自带算术题生成器形态验证（年级/题型/数值范围/进退位/括号/题量参数+答案页+A4 导出）；② xfdgg.com 2026-09 多篇可打印口算/竖式题库文靠百度网盘链接分享，获取链路长——「一键在线生成打印」直接替代。
- **开辟「学习工具」新方向**：仓库现有 92 Path 无 math/算术/口算/练习题命中，「学习工具」品类为全新品类；产品线从工具办公向教育学习延伸，锚定家长人群。
- **打印路线仓库已验证**：简历制作器/方格纸打印路线（@media print + 打印按钮）已跑通，复用成熟形态；与昨日交付（AA 制计算器、Markdown→Excel 转换器）形态均不同，无连击冲突。
- **节奏错峰成立**：今日已交付结算算法型（AA 制）、转换导出型（Markdown→Excel），本轮是教育生成型工具，形态完全错峰。

**规格**：
1. 参数表单：年级预设（20以内加减/100以内加减/表内乘除/混合四则/脱式计算/竖式计算）+ 数值范围滑杆 + 进位/借位开关 + 括号开关 + 题量选择（50/100/200）。
2. 随机出题引擎：按参数生成不重复题目（JS Fisher-Yates 洗牌防重复）；加减法：进位/借位开关控制是否出进位加/退位减；乘除：结果为整数（除法被除数=除数×商）；脱式：括号开关控制；竖式题：竖式排版渲染（竖式符号线+数位对齐）。
3. A4 练习纸预览：练习纸头（姓名/日期栏）+ 题号+题目两/三列排版 + 空白答题区；@media print 隐藏操作区，打印直接出 A4。
4. 独立答案页：同题号答案对照表（家长批改用），打印时可选「练习+答案」/「仅练习」/「仅答案」。
5. 辅助：一键重新出题（刷新换一批）/ 一键复制题目文本（发微信群）/ 示例参数一键填入。
6. 纯前端、数据不出浏览器；响应式，桌面端优先、移动端可用。
7. 注册：`tools/categories.go` 新品类「学习工具」（New: true），新增 ID `math_worksheet_generator`、Path `/tools/math-worksheet-generator`，中英文描述 + SEO keywords（口算练习题、算术题生成器、小学数学练习打印、竖式计算练习、口算天天练）。

**验收标准**：
- [ ] `/tools/math-worksheet-generator` 可开（200）
- [ ] 年级预设切换→题目难度/题型符合预期（如「20以内加减」无超范围题；进位开关关闭时无进位加）
- [ ] 除法题商为整数、脱式题括号开关生效、竖式题数位对齐渲染正确
- [ ] 题量 50/100/200 生效，题目不重复
- [ ] 浏览器打印预览为干净 A4 练习纸（无操作按钮/导航栏）；答案页题号与练习页一一对应
- [ ] 「仅答案」「练习+答案」打印模式生效；一键重新出题、复制题目文本可用
- [ ] 纯前端无后端调用（DevTools Network 抽查）
- [ ] `categories.go` 注册完成（「学习工具」新品类），首页/导航/sitemap 生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/math_worksheet_generator.html`（新建：参数表单+随机出题引擎+练习纸/答案页预览+A4 打印样式，纯前端）、`tools/categories.go`（新品类「学习工具」注册）、`BACKLOG.md`（本小节）。

**未选**：PDF 电子签名（P1，PdfWord 2026-10-12 PH 上线单列 eSign+fabulouspic 2026 榜单免费版全受限，差异化强；但难度中——PDF.js 渲染+canvas 签名板+pdf-lib 嵌入+多页拖拽定位，适合上午轮次留足时间，顺位递进留池）；工资条生成器（P1，HR/财务月度刚需、SheetJS 在栈；已多轮顺位递进，Excel 上传+解析+逐员工工资条卡片打印布局在 03:40 深夜轮交付质量风险偏高，留池作后续轮次首选）；视频抽帧（P1，难度中，适合上午轮次）；报价单/收据生成器（P1，票据组合，顺位顺延）；进制转换器（P1 观察）；年会大屏抽奖（时令预热）；白噪音发生器（P2 观察，中文证据弱）；金额大写转换器（节奏调节位）等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 92 Path，无 math/worksheet/算术/口算/练习题命中（`工资条`仅命中 PDF 加密工具描述文字，非工资条生成器；`sign`/`esign`/`签名`无 ID/Path 命中），ID `math_worksheet_generator`、Path `/tools/math-worksheet-generator` 无重叠；「学习工具」为新品类，无冲突；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-18 03:00 第十四轮研究）

## 今日任务（2026-10-18 03:00 · 产品调研员研究轮 ✅）

**交付状态**：10-18 通用调研第十四轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研）。Markdown 表格→Excel 转换器已交付闭环（01:39 PM 决策轮立项→02:00轮开发交付 6859282+评审修复 318895b；`grep tools/categories.go` 确认 ID `markdown_to_excel`、Path `/tools/markdown-to-excel` 已注册，全量 92 Path），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮四件事**（03:00 全网调研，通用方向）：
1. Markdown 表格→Excel 交付确认：`git log` 确认开发交付 6859282 + 评审修复 318895b；`grep tools/categories.go` 确认已注册（全量 92 Path），与候选池无重叠项残留；候选池划出，已实现清单追加（delta：+ Markdown 表格→Excel 转换器；历史全量见下方第十三轮小节）。
2. 新晋候选：**算术题生成器（小学口算/竖式练习题一键打印）**。需求证据双重：① 365Lab 2026-10-08（10 天前）教程「小学口算练习怎么生成：题型、难度与打印」——「孩子计算要天天练，但家长手动出题费时」「全程本地生成，不上传、免费无水印」，自带算术题生成器（年级/题型/数值范围/进退位/括号/题量参数+答案页+A4 导出）；② xfdgg.com 2026-09 多篇可打印口算/竖式题库文（「完整口算题库」「竖式100内加减计算打卡500题」靠百度网盘链接分享，获取链路长）。可行性：纯前端小难度——参数表单（年级预设：20以内加减/100以内/乘除/混合/脱式/竖式，数值范围、进退位开关、题量 50/100）→随机出题引擎→A4 练习纸预览→浏览器打印/PDF 导出+独立答案页（家长批改）；打印路线仓库已验证（简历制作器/方格纸打印路线）。去重：92 Path 无 math/算术/口算/练习题命中。难度小。SEO：口算练习题、算术题生成器、小学数学练习打印。建议 ID `math_worksheet_generator`、Path `/tools/math-worksheet-generator`。开辟「学习工具」新方向。
3. 新晋候选：**PDF 电子签名（手写签名嵌入 PDF）**。需求证据双重：① dev.to shahzaib11 2026-10-12（6 天前）Product Hunt 上线帖「We Just Launched on Product Hunt: 47 Free PDF Tools, Zero Backend」单列 eSign 为核心功能（merge/split/compress/convert/edit text/eSign/OCR/redact，pdf-lib+PDF.js 纯前端架构）；② fabulouspic 2026「The 7 Best Online Sign PDF Tools for 2026」：全部免费版受限（SignWell 3 文档/月、Xodo Sign 3/月、DocHub 3 次编辑+5 次签名/月、PandaDoc 5 文档/月）——「免费无上限+文件不出浏览器」差异化明确。可行性：纯前端中难度——上传 PDF→PDF.js 渲染页面→canvas 签名板（手写笔迹/键盘输入转手写体/上传签名图）→多页拖拽定位→pdf-lib 嵌入签名图片→下载已签署 PDF；与 pdf_annotate/pdf_manage 互链成 PDF 旅程线。去重：92 Path 有 pdf_annotate（批注）无 sign/esign/签名命中。难度中。SEO：PDF签名、在线签署PDF、电子签名PDF。建议 ID `pdf_esign`、Path `/tools/pdf-esign`。
4. 无新单页信号侧：① V2EX 10-16 每日热点：roamdial 网页电台（P2 观察维持，第三方 Radio Browser API 依赖）、BiliFlow（B 站桌面下载工具，桌面端）、财悟-记账也记物（iOS App）、ESP32 iPhone AI 控制（硬件）、Claude 封号/AI Coding 面试/买房/减肥讨论——均非单页纯前端口径；② dev.to kkp DevTrove 2026-10-13（22 开发者工具）：JSON/Base64/JWT/cron/timestamp/regex/UUID 等仓库全覆盖，JSON Schema validator/JSON semantic diff 开发者 niche 不单立；③ dev.to SuperToolKit 2026-10-16（100+ 工具，WASM+Web Worker）：音频/PDF/代码方向无新单页形态；④ dev.to sherazmajeed 2026-10-08（QR 生成器+30 工具）：qrcode 已在栈，WiFi/vCard 类型为现有工具增强项不单立；⑤ dev.to BuildDiff 2026-10-09（浏览器对比两文件夹）：开发者 niche 不单立；⑥ dev.to RedSamerai 2026-10-17（MT5 交易数据清洗）：量化 niche 单条证据不单立；⑦ 中文 OCR：白描/OLOCR 形态验证，但仓库已有 ocr_image_text/ocr_batch/image_to_excel，不立；⑧ 微信投票（sohu 2026 攻略）：需后端+防刷风控，不符合单页纯前端口径，不立；⑨ WPS 候选表保持冻结归档（本轮为通用方向）。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **算术题生成器（小学口算/竖式练习题一键打印）** — P1（本轮新晋顺位第一：365Lab 2026-10-08 新鲜中文教程+形态验证+xfdgg 2026-09 题库获取痛点；「孩子天天练、家长手动出题费时」高频刚需；纯前端小难度：参数→随机出题→A4 打印/PDF 导出+答案页；打印路线仓库已验证；92 Path 无重叠；开辟「学习工具」新方向；03:00 深夜轮形态极稳）。SEO：口算练习题、算术题生成器。
2. **PDF 电子签名（手写签名嵌入 PDF）** — P1（本轮新晋：PdfWord 2026-10-12 Product Hunt 47 工具零后端上线单列 eSign；fabulouspic 2026 榜单全部免费版受限——「免费无上限+本地处理」差异化；纯前端中难度：PDF.js 渲染+canvas 签名板+pdf-lib 嵌入；与 PDF 旅程线互链；92 Path 无 sign 重叠）。SEO：PDF签名、在线签署PDF。
3. **工资条生成器（HR 工资表→每人工资条）** — P1（顺位递进：第六轮新晋顺延，360doc 双证据，HR/财务月度刚需；纯前端小难度：上传工资表 Excel（SheetJS 在栈）→逐员工工资条卡片→浏览器打印/PDF 导出；Excel+打印形态深夜轮可交付）。SEO：工资条生成器。

报价单/收据生成器列顺位第四（P1，「票据」组合，顺位顺延）；视频抽帧（P1，难度中，适合上午轮次）；进制转换器（P1 观察）；年会大屏抽奖（P1 时令预热）；露营用电/乳胶漆用量（计算器类同轮互斥）；在线方格纸/金额大写转换器（节奏调节位）/接龙文本统计/极简简历制作器等其余候选留池；白噪音发生器列 P2 观察（本轮新晋观察，365Lab 2026-10-08 单列，中文证据弱）。

**通用候选表增量**（第十四轮：Markdown 表格→Excel 转换器已实现划出；新晋算术题生成器 P1、PDF 电子签名 P1、白噪音发生器 P2（观察）；全量 92 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 算术题生成器（小学口算/竖式练习题一键打印） | 本轮新晋（365Lab 2026-10-08（10 天前）教程「小学口算练习怎么生成：题型、难度与打印」——「孩子计算要天天练，但家长手动出题费时」「全程本地生成，不上传、免费无水印」，自带算术题生成器（年级/题型/数值范围/进退位/括号/题量参数+答案页+A4 导出）；xfdgg.com 2026-09 多篇可打印口算/竖式题库文（「完整口算题库」「竖式100内加减计算打卡500题」靠百度网盘链接分享，获取链路长）；打印路线仓库已验证（简历制作器/方格纸打印路线）；92 Path 无 math/算术/口算/练习题命中；开辟「学习工具」新方向） | 小 | P1（本轮新晋） |
| PDF 电子签名（手写签名嵌入 PDF） | 本轮新晋（dev.to shahzaib11 2026-10-12（6 天前）Product Hunt 上线帖「We Just Launched on Product Hunt: 47 Free PDF Tools, Zero Backend」单列 eSign 为核心功能（merge/split/compress/convert/edit text/eSign/OCR/redact，pdf-lib+PDF.js 纯前端架构）；fabulouspic 2026「The 7 Best Online Sign PDF Tools for 2026」：全部免费版受限（SignWell 3 文档/月、Xodo Sign 3/月、DocHub 3 次编辑+5 次签名/月、PandaDoc 5 文档/月）——「免费无上限+文件不出浏览器」差异化）；纯前端中难度：上传 PDF→PDF.js 渲染→canvas 签名板（手写/键盘转手写体/上传签名图）→拖拽定位→pdf-lib 嵌入签名图片→下载；与 pdf_annotate/pdf_manage 互链成 PDF 旅程线；92 Path 有 pdf_annotate 无 sign/esign 命中 | 中 | P1（本轮新晋） |
| 白噪音发生器（Web Audio 纯前端助眠/专注白噪音） | 本轮新晋观察（365Lab 2026-10-08 40+ 实用工具清单单列「专注/助眠白噪音」；Web Audio API 可纯前端合成白/粉/棕噪音+雨声/雷声/篝火声，无文件无网络，定时关闭；中文需求证据单条弱；92 Path 无 white.noise/白噪音命中） | 小 | P2（观察·中文证据弱） |

**归档说明**：本轮为 10-18 通用调研第十四轮——Markdown 表格→Excel 转换器交付闭环（6859282+评审修复 318895b，`/tools/markdown-to-excel` 已注册，全量 92 Path），候选池划出，已实现清单 delta 追加；新晋候选「算术题生成器」P1（365Lab 2026-10-08 中文教程+形态验证，xfdgg 2026-09 题库获取痛点，纯前端小难度，开辟「学习工具」新方向）、「PDF 电子签名」P1（PdfWord 2026-10-12 PH 上线单列 eSign，fabulouspic 2026 榜单全部免费版受限，纯前端中难度，PDF 旅程线互链）、「白噪音发生器」P2（观察）；dev.to DevTrove/SuperToolKit/QR 生成器集均无新单页形态（仓库已覆盖或为现有工具增强项）；V2EX 10-16 热点均为桌面端/App/硬件/讨论形态；中文 OCR 方向仓库已有不立；微信投票需后端不立；WPS 候选表保持冻结归档；仓库 92 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在且与本地 HEAD 318895b 一致；`git log` 确认开发交付 6859282+评审修复 318895b；`grep tools/categories.go` 全量 92 Path，`markdown_to_excel` ID 与 `/tools/markdown-to-excel` Path 已注册（划入已实现），新候选建议 ID（math_worksheet_generator / pdf_esign / white_noise_generator）与 92 Path 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-18 01:39 决策轮）

## 今日任务（2026-10-18 01:39 · 产品经理排期决策 ✅）

**交付状态**：待前端开发轮交付。10-18 排期决策轮（01:00 第十三轮研究之后）。AA 制费用分摊计算器已交付闭环（23:00 PM 决策轮立项→开发交付 6548945，`/tools/aa-bill-splitter` 已注册，全量 91 Path），候选池划出。本轮立项**今日唯一任务：Markdown 表格→Excel 转换器（AI 输出表格一键转 xlsx）**。

**选定：Markdown 表格→Excel 转换器（/tools/markdown-to-excel）** — 本轮唯一任务：
- **01:00 深夜轮形态最稳**：纯文本粘贴输入+表格预览渲染，无文件上传、无打印/PDF 复杂布局，01:00 轮次可高质量交付（调研轮 01:00 明确指出此为本轮最稳形态）。
- **证据双重最新**：dev.to lanxk 2026-10-16（2 天前）+ Medium 2026-10-17 cross-post（1 天前），AI 时代高频痛点——ChatGPT/DeepSeek/豆包/Kimi 生成的表格粘贴到 Excel/WPS 全部挤进 A 列带竖线。
- **节奏错峰成立**：昨日 23:00 交付 AA 制费用分摊计算器（结算算法型），本轮是转换/导出形态，与结算计算器、OG 卡片预览、SERP 预览、图片标注等渲染展示型工具形态均不同，无连击冲突。
- **旅程线闭环**：与 AI 文本清洁器（`/tools/ai-text-cleaner`）+ AI Token 计数器双向互链成「AI 写作→办公」组合（AI 输出→清洁→转 Excel 一条龙），延续既定产品线策略。
- **零新增依赖**：仓库已自带 SheetJS 0.18.5（`static/js/vendor/xlsx-0.18.5.umd.js`，图片转 Excel/表格合并/拆分已在用），直接复用；冻结表头/粗体/自动列宽纯前端可做。
- **去重确认**：91 Path 无 markdown/excel 表格转换命中；`/tools/image-to-excel` 为 OCR 图片转表格、`/tools/markdown-preview` 为反向预览，均不同方向。

**规格**：
1. 输入：大文本框粘贴整段 AI 回答；可选上传 `.md` 文本文件（FileReader 本地读，数据不出浏览器）。
2. 表格提取（容错）：表头行+分隔行（`---` / `:---:` / `:---` / `---:`）识别；跳过 ` ``` ` 代码块内表格；转义竖线 `\|` 不分割；行列数不一致自动补空；无分隔行的纯竖线行不误判。
3. 多表→多 sheet：以表格上方最近的 `#`/`##` 标题命名 sheet；无标题则用「表格1/2/3」；Excel 非法字符（`\/:*?"<>|`）替换+31 字符截断+重名加序号。
4. 单元格类型：`1,234.50` 存真实数值、`12.5%` 存 0.125+百分比格式；15 位+ 纯数字长 ID 存文本（防科学计数法）；前导零（如 `00123`）存文本；其余文本原样。
5. 预览：每表卡片化渲染（表头粗体、斑马纹），顶部统计「识别到 N 张表格、共 M 行 × K 列」；无表格时空态提示（给出可粘贴的示例格式）。
6. 导出：下载 `.xlsx`（SheetJS 复用，粗体表头+冻结首行+自动列宽）/ 单表一键复制 TSV（粘贴进 Excel/WPS 不挤列）/ 示例数据一键填入（含转义竖线、代码块假表格、千分位数字、长 ID 的 AI 回答样例）。
7. 纯前端、数据不出浏览器；响应式，桌面端优先、移动端可用。
8. 注册：`tools/categories.go`「文档转换」品类（Name `文档转换`）新增 ID `markdown_to_excel`、Path `/tools/markdown-to-excel`（New: true），中英文描述 + SEO keywords（Markdown 转 Excel、AI 表格转 Excel、md 转 xlsx、ChatGPT 表格导出 Excel、AI 表格粘贴到 Excel），与 AI 文本清洁器/AI Token 计数器双向互链。

**验收标准**：
- [ ] `/tools/markdown-to-excel` 可开（200）
- [ ] 粘贴示例 AI 回答（含 2 张以上表格、转义竖线、代码块内假表格）→识别表数正确，代码块内表格不被提取
- [ ] sheet 命名：上方标题命名正确、无标题用「表格1/2/3」、超长/非法字符处理正确
- [ ] 单元格类型正确：千分位数字为数值、百分比为数值+格式、15 位+ 长 ID 为文本、前导零为文本
- [ ] `.xlsx` 下载可用 WPS/Excel 正常打开；表头粗体+冻结首行+自动列宽生效
- [ ] 一键复制 TSV 粘贴进 Excel/WPS 不挤列；示例数据一键填入可用
- [ ] 纯前端无后端调用（DevTools Network 抽查）
- [ ] `categories.go` 注册完成（「文档转换」品类），首页/导航/sitemap 生效；与 AI 文本清洁器/AI Token 计数器互链
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/markdown_to_excel.html`（新建：文本输入+表格提取引擎+多表预览+导出，纯前端，复用 SheetJS 0.18.5）、`tools/categories.go`（「文档转换」品类注册+「AI 写作→办公」组合互链）、`BACKLOG.md`（本小节）。

**未选**：工资条生成器（P1，HR/财务月度刚需、SheetJS 在栈；但 Excel 上传+解析+打印布局在深夜 01:00 轮交付质量风险偏高，顺位递进留池）；报价单/收据生成器（P1，用户玻璃店实战场景强相关；A4 打印/PDF 形态稍大，顺位递进留池）；视频抽帧（P1，难度中，适合上午轮次留足时间，留池）；进制转换器（P1 观察，中文证据间接，留池）；露营用电/乳胶漆用量（计算器类与昨日 AA 制同轮互斥）；年会大屏抽奖（时令预热位）/金额大写转换器（节奏调节位）/接龙文本统计/极简简历制作器等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 91 Path，无 markdown_to_excel / markdown-to-excel 命中；「文档转换」品类（Name `文档转换`）确认存在（含 image-to-excel 同类工具）；SheetJS 0.18.5 已存在于 `static/js/vendor/xlsx-0.18.5.umd.js`，无需新增依赖；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-18 01:00 第十三轮研究）

## 今日任务（2026-10-18 01:00 · 产品调研员研究轮 ✅）

**交付状态**：10-18 通用调研第十三轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研）。AA 制费用分摊计算器已交付闭环（23:00 PM 决策轮立项→开发交付 6548945；`grep tools/categories.go` 确认 ID `aa_bill_splitter`、Path `/tools/aa-bill-splitter` 已注册，全量 91 Path），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮四件事**（01:00 全网调研，通用方向）：
1. AA 制费用分摊计算器交付确认：`git log` 确认开发交付 6548945（+ PM 排期提交 ac34fc7）；`grep tools/categories.go` 确认已注册（全量 91 Path），与候选池无重叠项残留；候选池划出，已实现清单追加（delta：+ AA 制费用分摊计算器；历史全量见下方第十二轮小节）。
2. 新晋候选：**Markdown 表格→Excel 转换器（AI 输出表格一键转 xlsx）**。需求证据三重：① dev.to lanxk 2026-10-16（1 天前）「I built a free tool that turns AI-generated Markdown tables into Excel」——"Tables from ChatGPT, Claude or Gemini are written in Markdown. Paste one into Excel and every row ends up in column A, pipes and all."；② Medium @Lanxk 2026-10-17（数小时前）cross-post「Turn AI-Generated Markdown Tables into Excel in One Click」同形态二次传播；③ thebricks.com 多篇 AI→Excel 教程（text/table/worksheet 三篇）均把"粘贴后全部挤进一列→再用分列抢救"写成标准步骤，反证该痛点为 AI 办公时代的经典高频问题。可行性：纯前端小难度——粘贴整段 AI 回答或上传 `.md`→自动提取全部 Markdown 表格（代码块内表格、转义竖线需容错）→多表→多 sheet（以上方标题命名）→`1,234.50`/`12.5%` 存真实数值、15 位+ 长 ID 存文本（防 Excel 科学计数法）→粗体冻结表头+自动列宽→下载 `.xlsx` / 一键复制粘贴进 Excel/WPS；SheetJS 在栈（工资条生成器候选同路线），或沿 md-to.com 路线手写轻量 xlsx writer（fflate 压缩 XML，零大依赖）。与已实现的 AI 文本清洁器（`/tools/ai-text-cleaner`）+ AI Token 计数器互链成「AI 写作→办公」组合。去重：91 Path 无 markdown/excel 表格转换命中（`/tools/image-to-excel` 为 OCR 图片转表格、`/tools/markdown-preview` 为反向预览，均不同方向）。难度小。SEO：Markdown 转 Excel、AI 表格转 Excel、md 转 xlsx。建议 ID `markdown_to_excel`、Path `/tools/markdown-to-excel`。
3. 无新单页信号侧：① Product Hunt Tooleek（2026-10-08）：PDF 合并/拆分/压缩、图片转换压缩（含 HEIC）、二维码生成——仓库全量覆盖；② dev.to SuperToolKit（2026-10-16，100+ 工具，WASM+Web Worker 本地处理）：音频/PDF/代码方向无新单页形态；③ Medium Toolenix（Oct 2026，113 工具）：同上无新形态；④ dev.to etemora（2026-10-11）：RDAP 域名生成器（与仓库 domain-check 同方向，已归档 P2 观察，不单立）、Invoice generator（报价单/收据生成器候选已立）、SERP 预览（已实现）——无新信号；⑤ V2EX 2026-10-17 当天：听力流利度练习软件（单 HTML 语言学习 niche）、ESP32 iPhone AI 控制（硬件）、Claude Opus 幻觉讨论、电商直播弹窗讨论——均非单页纯前端口径；⑥ 中文榜单（info35 2026-09-18）：在线加水印/抠图/AI 音乐——均为仓库已覆盖或非纯前端口径方向。
4. WPS 候选表保持冻结归档（本轮为通用方向）。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **Markdown 表格→Excel 转换器（AI 输出表格一键转 xlsx）** — P1（本轮新晋顺位第一：dev.to 2026-10-16（1 天前）+ Medium 2026-10-17 cross-post 双证据形态验证；AI 时代高频痛点——ChatGPT/DeepSeek/豆包/Kimi 生成的表格粘贴到 Excel/WPS 全部挤进 A 列带竖线；纯前端小难度：整段 AI 回答粘贴→自动提取表格→多表多 sheet（标题命名）→数字存真实数值、长 ID 存文本→.xlsx 下载/一键复制；SheetJS 在栈；与 AI 文本清洁器互链成「AI 写作→办公」组合；91 Path 无重叠；01:00 深夜轮形态极稳：纯文本输入+表格渲染，无文件上传复杂逻辑）。SEO：Markdown 转 Excel、AI 表格转 Excel。
2. **工资条生成器（HR 工资表→每人工资条）** — P1（顺位递进：第六轮新晋，360doc 双证据；HR/财务月度刚需；纯前端小难度：上传工资表 Excel（SheetJS 在栈）→逐员工工资条卡片→浏览器打印/PDF 导出；与工资个税计算器互链成「HR 财务」组合；Excel+打印形态与今日晚间已交付的 AA 制计算器错峰）。SEO：工资条生成器。
3. **报价单/收据生成器** — P1（顺位递进：第七轮新晋，Medium 15 工具单列 Invoice Generator；纯前端：客户/供方信息+项目明细行自动算金额→A4 预览→打印/PDF 导出；金额大写自动转换，与金额大写转换器互链成「票据」组合；用户本人玻璃店实战场景强相关）。SEO：报价单生成器、收据打印。

视频抽帧列顺位第四（P1，难度中，19:00 PM 决策轮明确「适合上午轮次留足时间」，深夜轮不推）；进制转换器（第十二轮新晋 P1 观察，中文证据间接，留池）；年会大屏抽奖（P1 时令预热）；露营用电/乳胶漆用量（计算器类同轮互斥）；在线方格纸/金额大写转换器（节奏调节位）/接龙文本统计/极简简历制作器/MP3 标签编辑器/图片转 SVG 等其余候选留池。

**通用候选表增量**（第十三轮：AA 制费用分摊计算器已实现划出；新晋 Markdown 表格→Excel 转换器 P1；全量 91 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| Markdown 表格→Excel 转换器（AI 输出表格一键转 xlsx） | 本轮新晋（dev.to lanxk 2026-10-16（1 天前）「I built a free tool that turns AI-generated Markdown tables into Excel」——"Tables from ChatGPT, Claude or Gemini are written in Markdown. Paste one into Excel and every row ends up in column A, pipes and all."；Medium @Lanxk 2026-10-17 cross-post「Turn AI-Generated Markdown Tables into Excel in One Click」；thebricks.com 多篇 AI→Excel 教程均把"粘贴后挤进一列→再用分列抢救"写成标准步骤，反证经典高频痛点）；AI 时代高频：ChatGPT/DeepSeek/豆包/Kimi 生成的表格粘贴到 Excel/WPS 全部挤进 A 列带竖线；纯前端小难度：粘贴整段 AI 回答或上传 .md→自动提取全部表格→多表→多 sheet（以上方标题命名）→`1,234.50`/`12.5%` 存真实数值、15 位+ 长 ID 存文本（防科学计数法）→粗体冻结表头+自动列宽→下载 .xlsx / 一键复制粘贴；SheetJS 在栈（工资条候选同路线），或沿 md-to.com 路线手写轻量 xlsx writer（fflate 压缩 XML）；与 AI 文本清洁器互链成「AI 写作→办公」组合；91 Path 无 markdown/excel 表格转换命中（/tools/image-to-excel 为 OCR 图片转表格、/tools/markdown-preview 为反向预览，均不同方向） | 小 | P1（本轮新晋） |

**归档说明**：本轮为 10-18 通用调研第十三轮——AA 制费用分摊计算器交付闭环（6548945，`/tools/aa-bill-splitter` 已注册，全量 91 Path），候选池划出，已实现清单 delta 追加；新晋候选「Markdown 表格→Excel 转换器」P1（dev.to 2026-10-16+Medium 2026-10-17 双证据，AI 表格→Excel 高频痛点，纯前端小难度，与 AI 文本清洁器互链成「AI 写作→办公」组合）；Tooleek（Product Hunt 2026-10-08）/ SuperToolKit（dev.to 2026-10-16）/ Toolenix（Medium Oct 2026）/ etemora（dev.to 2026-10-11）均无新单页形态（PDF/图片/二维码/RDAP/Invoice/SERP 皆为仓库已覆盖或已立候选）；V2EX 10-17 当天为硬件/语言学习/模型讨论形态，无单页可落地新信号；中文榜单加水印/抠图方向均为仓库已覆盖；WPS 候选表保持冻结归档；仓库 91 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`git log` 确认开发交付 6548945；`grep tools/categories.go` 全量 91 Path，`aa_bill_splitter` ID 与 `/tools/aa-bill-splitter` Path 已注册（划入已实现），新候选建议 ID（markdown_to_excel）与 91 Path 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-17 23:00 决策轮）

## 今日任务（2026-10-17 23:00 · 产品经理排期决策 ✅）

**交付状态**：待前端开发轮交付。10-17 排期决策轮（23:00 第十二轮研究之后）。OG 社交卡片预览已交付闭环（21:00 PM 决策轮立项→开发交付 3ad2c8a，`/tools/og-card-preview` 已注册，全量 90 Path），候选池划出。本轮立项**今日下一任务：AA 制费用分摊计算器（最少转账结算）**。

**选定：AA 制费用分摊计算器（/tools/aa-bill-splitter）** — 本轮唯一任务：
- **难度最小、23:38 晚间轮最稳**：纯前端数学计算，无文件上传、无打印/PDF、无外部依赖、数据不出浏览器；表单录入→结算算法→列表渲染，一轮可高质量交付。
- **证据三重最强**：Cashinator 网页可试用（equal/proportional/itemized 三种分摊→"minimal settlements (fewest transfers)" 纯数学无 AI）+ SplitPop（"works out the fewest payments to settle up"，"Six debts in. Two payments out."）+ App Store《簡易/分帳》計算機 2026 版更新 5.0 满分（聚餐一键分摊+服务费+多笔加总完全离线）。
- **节奏错峰已成立**：今日计算器仅白天的双11到手价/经济补偿金两轮，其后连出 5 个非计算器形态（GB/T 7714 学术表单、AI 文本清洁器、SERP 预览、图片标注、OG 预览）；23:00 调研轮已明确 AA 制顺位第一且指出「计算器节奏已错峰」。AA 制留池本就是作「后续节奏调节」位，现在启用即调节目的本身——18:00/19:00/21:00 三轮 PM 结论（避免计算器三连击）仍被尊重，本轮是错峰后的正常启用，非提前消耗。
- **形态差异化**：结算算法型工具（录入+算法+方案输出），与今日所有交付（渲染展示/画布交互/表单导出）形态都不同。
- **场景通用+移动端**：聚餐/旅游/团建/合租/宿舍多笔支出结算，手机端发群场景高频；差异化定为「移动端优先+一键复制发群文本」。

**规格**：
1. 人员管理：添加/删除参与人名单；一键填入示例数据（3~4 人多笔支出演示）。
2. 支出录入（多笔）：每笔=付款人（下拉）+ 金额 + 参与人（多选，默认全部）+ 分摊方式（均摊 equal / 按份 itemized 逐人份数）+ 备注；全局服务费/税费附加项（金额，按每人分摊额比例 proportional 分摊）。
3. 结算算法：每人净余额=已付−应付 → 贪心最少转账（债务人按欠款降序、债权人按应收降序配对，标准 minimal settlement），输出最少笔数转账方案。
4. 展示：一览（每人应收/应付净额，红绿区分）+ 最少转账方案列表（"A → B：¥XX"）+ 每笔支出明细回看/删除。
5. 辅助：一键复制结算方案文本（微信群可粘贴）；localStorage 持久化（防刷新丢失）；输入校验（金额>0、至少 2 人）。
6. 纯前端、数据不出浏览器；响应式，移动端优先、桌面端可用。
7. 注册：`tools/categories.go`「生活工具」品类（Name `生活工具`）新增 ID `aa_bill_splitter`、Path `/tools/aa-bill-splitter`（New: true），中英文描述 + SEO keywords（AA 制计算器、聚餐分摊、账单分摊、旅游 AA、合租记账）。

**验收标准**：
- [ ] `/tools/aa-bill-splitter` 可开（200）
- [ ] 添加人员→录入多笔支出（均摊/按份/服务费）→净余额计算正确
- [ ] 最少转账方案正确：标准用例验证（如 3 人 A 付 300 全员参与→B→A ¥100、C→A ¥100 共 2 笔；SplitPop 式"多债合并少付"用例笔数最小）
- [ ] 一键复制结算文本可用；示例数据一键填入可用；localStorage 刷新不丢数据
- [ ] 纯前端无后端调用（DevTools Network 抽查）
- [ ] `categories.go` 注册完成（「生活工具」品类），首页/导航/sitemap 生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/aa_bill_splitter.html`（新建：人员管理+支出录入+结算算法+方案展示+复制，纯前端）、`tools/categories.go`（「生活工具」品类注册）、`BACKLOG.md`（本小节）。

**未选**：工资条生成器（P1，HR/财务月度刚需、SheetJS 在栈；但 Excel 上传+解析+打印布局在 23:38 晚间轮交付质量风险偏高，顺位递进留池）；报价单/收据生成器（P1，用户玻璃店实战场景强相关、Medium 15 工具单列；A4 打印/PDF 形态稍大，顺位递进留池）；进制转换器（本轮新晋 P1 观察，中文证据间接，留池）；视频抽帧（P1，难度中，适合上午轮次）；露营用电/乳胶漆用量（计算器类本轮互斥）；年会大屏抽奖/金额大写转换器/MP3 标签编辑器等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 90 Path，无 aa/分摊/bill/settlement 命中（「工资条」仅命中 PDF 加密工具描述文字，非工资条生成器，无实质重叠），ID `aa_bill_splitter`、Path `/tools/aa-bill-splitter` 无重叠；「生活工具」品类（Name `生活工具`）确认存在；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-17 21:00 决策轮）

## 今日任务（2026-10-17 21:00 · 产品经理排期决策 ✅）

**交付状态**：待前端开发轮交付。10-17 排期决策轮（21:00 第十一轮研究之后）。图片标注工具已交付闭环（19:00 PM 决策轮立项→开发交付 7470877，`/tools/image-annotator` 已注册，全量 89 Path），候选池划出。本轮立项**今日下一任务：OG 社交卡片预览（Open Graph / Twitter Card / 微信分享卡片预览）**。

**选定：OG 社交卡片预览（/tools/og-card-preview）** — 本轮唯一任务：
- **难度极小可高质量交付**：纯前端静态渲染，无图片上传处理、无外部依赖、数据不出浏览器；四输入→多平台卡片并排渲染，晚间轮（21:00）形态最稳。
- **旅程线闭环**：与 18:00 轮刚交付的 SERP 搜索结果片段预览互链成「营销工具」品类组合（搜索结果预览+社交分享预览双链路），延续既定产品线策略。
- **节奏错峰最彻底**：今日已交付双11到手价计算器、经济补偿金计算器、GB/T 7714 学术表单、AI 文本清洁器、SERP 预览、图片标注工具；OG 预览为信息展示型表单+渲染工具，与今日所有交付形态都不同，避免计算器/交互型三连击。
- **尊重既有定序**：18:00/19:00 PM 决策轮已明确 AA 制费用分摊计算器「留池作后续节奏调节」（计算器类节奏冲突），本轮延续该决定，AA 制继续留池不提前消耗。
- **中文差异化明确**：微信内分享卡片（标题/描述/缩略图 5:4 版式）为海外 OG 工具空白，公众号运营/独立站长/自媒体调试分享卡片为刚需。
- **证据新鲜**：dev.to ConvertLinx 2026-10-07（10 天前）单列 OG Preview Checker 为开发者工具；中文痛点：公众号运营/独立站长分享链接前需确认卡片展示效果。

**规格**：
1. 四输入：页面标题、描述、URL、缩略图（URL 输入；可选本地上传转 base64 数据 URL，沿 img2base64 路线，数据不出浏览器）。
2. 多平台卡片并排实时渲染：Twitter Card（Summary / Summary Large Image）、Facebook 分享卡片、LinkedIn 分享卡片、微信聊天卡片（5:4 缩略图版式）；预览与输入联动、字符计数。
3. 规则提示：各平台标题/描述长度与字段规则（Twitter 大卡 2:1 建议尺寸、微信缩略图 5:4 建议 240×200、og:title/og:description/og:image 必填项对照）。
4. 辅助：生成 og:/twitter: meta 标签代码片段，一键复制。
5. 纯前端、数据不出浏览器；响应式布局，桌面端优先。
6. 注册：`tools/categories.go`「营销工具」品类（Name `营销工具`）新增 ID `og_card_preview`、Path `/tools/og-card-preview`（New: true），中英文描述 + SEO keywords（OG 预览、社交分享卡片预览、微信分享卡片、Twitter Card 预览），与 SERP 预览（`/tools/serp-snippet-preview`）双向互链。

**验收标准**：
- [ ] `/tools/og-card-preview` 可开（200）
- [ ] 标题/描述/URL/图片四输入→四个平台卡片实时并排渲染
- [ ] 微信卡片按 5:4 缩略图版式渲染；Twitter Summary Large Image 按 2:1 渲染
- [ ] 各平台尺寸与字段规则提示展示正确
- [ ] og:/twitter: meta 代码片段一键复制可用
- [ ] 纯前端无后端调用（DevTools Network 抽查）
- [ ] `categories.go` 注册完成（「营销工具」品类），首页/导航/sitemap 生效；与 SERP 预览互链
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/og_card_preview.html`（新建：四输入+四卡并排预览+规则提示+代码片段复制，纯前端）、`tools/categories.go`（「营销工具」品类注册+与 SERP 预览互链）、`BACKLOG.md`（本小节）。

**未选**：AA 制费用分摊计算器（P1，三重形态验证；18:00/19:00 PM 明确「留池作后续节奏调节」，继续留池）；工资条生成器（P1，HR/财务刚需、SheetJS 在栈；Excel+打印形态虽与今日错峰，但证据链与形态新鲜度不如本轮新晋的 OG 预览，顺位递进留池）；视频抽帧（P1，难度中、适合上午轮次留足时间，留池）；露营用电/乳胶漆用量/报价单收据/年会大屏抽奖/金额大写转换器/图片转 SVG 等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 89 Path，无 og/opengraph/社交卡片命中，ID `og_card_preview`、Path `/tools/og-card-preview` 无重叠；「营销工具」品类（Name `营销工具`）确认含 SERP 搜索结果片段预览；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-17 23:00 第十二轮研究）

## 今日任务（2026-10-17 23:00 · 产品调研员研究轮 ✅）

**交付状态**：10-17 通用调研第十二轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研）。OG 社交卡片预览已交付闭环（21:00 PM 决策轮立项→开发交付 3ad2c8a；`grep tools/categories.go` 确认 ID `og_card_preview`、Path `/tools/og-card-preview` 已注册，全量 90 Path），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮四件事**（23:00 全网调研，通用方向）：
1. OG 卡片预览交付确认：`git log` 确认开发交付 3ad2c8a；`grep tools/categories.go` 确认已注册（全量 90 Path），与候选池无重叠项残留；候选池划出，已实现清单追加（delta：+ OG 社交卡片预览；历史全量见下方第十一轮小节）。
2. 新晋观察候选：**进制转换器（Number Base Converter）**。需求证据三重：① dev.to everydaytoolz 2026-10-12（5 天前）「I built a free developer toolkit that runs in your browser (UUID, Base64, regex, hashes)」单列 Number Base Converter——"binary, decimal, octal, and hex, converted at once"；② calculators.im Binary, Hex & Base Converter：「Number base conversion is a daily skill for software engineers」，hex 为调试/颜色代码/MAC 地址标准表示；③ 学习考试场景：subnetlab 指出 CCNA 等认证考试常考进制转换、值得背熟转换表，腾讯云开发者社区/博客园有多篇中文二进制↔十六进制教程（中文学习需求）。可行性：纯前端极小——2/8/10/16 四进制并排实时互转+0x/0b/0o 前缀自动识别+二进制位权重可视化+逐位步骤讲解（教学差异化）；与子网计算器（/tools/subnet-calculator）互链成「开发者」组合。去重：90 Path 无 base/进制命中。难度小。SEO：进制转换、二进制转十六进制。建议 ID `number_base_converter`、Path `/tools/number-base-converter`。中文证据为间接（学习/考试场景），进 P1 观察。
3. 新晋观察候选：**MP3 标签/封面编辑器（ID3 tag editor）**。需求证据三重：① dev.to Uwarp 2026-10-15（2 天前）「Uwarp: 500+ Free Browser UI Tools」单列 MP3 Cover Adder——"embed album art and edit ID3 tags in the browser"；② banger.show MP3 ID3 标签编辑器隐私叙事——「直接在网页浏览器中处理 MP3 文件，资料始终不会离开您的计算机」，对标 TagMP3 等上传型工具（广告多、强制转码降质、单文件限制）；③ anymp4 2026 十款 MP3 标签编辑器名单形态验证：上传音频→改文本字段→选封面图→下载新文件。可行性：纯前端中难度——本地读取 MP3→解析 ID3v2 帧→编辑标题/艺人/专辑/流派→嵌入 JPEG 封面（APIC 帧）→Blob 下载，全本地不上传；开辟「音频工具」新方向。去重：90 Path 无 mp3/id3/音频命中。中文需求证据弱（车载 U 盘无封面为间接推断）、难度中，进 P2 观察。SEO：MP3 标签编辑、MP3 添加封面。建议 ID `mp3_tag_editor`、Path `/tools/mp3-tag-editor`。
4. 无新单页信号侧：① V2EX 2026-10-17 当天：BiliFlow（B 站桌面下载工具，桌面端）、财悟-记账也记物（iOS App）、听力流利度练习软件（单 HTML 语言学习 niche）、浏览器端 AI 视频去物（需 AI 后端）、tranco 看榜工具（GitHub Action+后端定时任务）——均非单页纯前端口径；② dev.to Antigravity 59 个 dev 工具（2026-10-13）：RSA/ECC Key Generator 与仓库 /tools/rsa 重叠、AI Token Counter 已在栈、PII Masker 与候选池「文本敏感信息打码」（P1 观察）同方向不单立、Markdown Viewer/UUID/File Size Converter 开发者 niche 证据单条不单立；③ WPS 候选表保持冻结归档（本轮为通用方向）。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **AA 制费用分摊计算器（最少转账结算）** — P1（顺位第一：21:00 PM 决策轮后已交付 OG 卡片预览（渲染展示型），计算器节奏已错峰；Cashinator/SplitPop/App Store 分帳 App 三重形态验证；纯前端小难度：人员名单+多笔支出录入→净余额→贪心最少转账方案→明细一键复制；90 Path 无重叠）。SEO：AA 制计算器、聚餐分摊。
2. **工资条生成器（HR 工资表→每人工资条）** — P1（顺位递进：第六轮新晋，360doc 双证据；HR/财务月度刚需；纯前端小难度：上传工资表 Excel（SheetJS 在栈）→逐员工工资条卡片→浏览器打印/PDF 导出；Excel+打印形态与今日已交付全部错峰）。SEO：工资条生成器。
3. **报价单/收据生成器** — P1（顺位递进：第七轮新晋，Medium 15 必备工具单列 Invoice Generator；纯前端：客户/供方信息+项目明细行自动算金额→A4 预览→打印/PDF 导出；金额大写自动转换，与金额大写转换器互链成「票据」组合；用户本人玻璃店实战场景）。SEO：报价单生成器、收据打印。

视频抽帧列顺位第四（P1，难度中，建议上午轮次，19:00 PM 决策轮结论）；露营用电计算器/乳胶漆用量计算器（计算器类同轮互斥）；年会大屏抽奖（P1 时令预热）；在线方格纸/金额大写转换器（节奏调节位）/接龙文本统计/极简简历制作器/进制转换器（本轮新晋 P1 观察）等其余候选留池。

**通用候选表增量**（第十二轮：OG 社交卡片预览已实现划出；新晋进制转换器 P1 观察、MP3 标签/封面编辑器 P2 观察；全量 90 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 进制转换器（Number Base Converter：2/8/10/16 进制互转+步骤讲解） | 本轮新晋（dev.to everydaytoolz 2026-10-12（5 天前）「free developer toolkit that runs in your browser」单列 Number Base Converter——"binary, decimal, octal, and hex, converted at once"；calculators.im：「Number base conversion is a daily skill for software engineers」；subnetlab：CCNA 等认证考试常考进制转换、值得背熟转换表；腾讯云开发者社区/博客园多篇中文二进制↔十六进制教程（中文学习需求））；纯前端极小：四进制并排实时互转+0x/0b/0o 前缀自动识别+二进制位权重可视化+逐位步骤讲解（教学差异化）；与子网计算器互链成「开发者」组合；90 Path 无 base/进制命中 | 小 | P1（观察） |
| MP3 标签/封面编辑器（ID3 标签+专辑封面嵌入） | 本轮新晋观察（dev.to Uwarp 2026-10-15（2 天前）「500+ Free Browser UI Tools」单列 MP3 Cover Adder——"embed album art and edit ID3 tags in the browser"；banger.show 浏览器本地 ID3 编辑隐私叙事——「资料始终不会离开您的计算机」，对标 TagMP3 等上传型工具（广告多/强制转码降质/单文件限制）；anymp4 2026 十款 MP3 标签编辑器名单形态验证：上传音频→改文本字段→选封面图→下载新文件）；纯前端中难度：本地读取 MP3→解析 ID3v2 帧→编辑标题/艺人/专辑/流派→嵌入 JPEG 封面（APIC 帧）→Blob 下载，全本地不上传；开辟「音频工具」新方向；90 Path 无 mp3/id3/音频命中；中文证据弱、难度中，进 P2 | 中 | P2（观察·中文证据弱） |

**归档说明**：本轮为 10-17 通用调研第十二轮——OG 社交卡片预览交付闭环（3ad2c8a，`/tools/og-card-preview` 已注册，全量 90 Path），候选池划出，已实现清单 delta 追加；新晋候选「进制转换器」P1（观察）（dev.to everydaytoolz 2026-10-12 新鲜形态，纯前端极小，与子网计算器互链成「开发者」组合）、「MP3 标签/封面编辑器」P2（观察）（dev.to Uwarp 2026-10-15 新鲜形态，开辟「音频工具」新方向，中文证据弱）；dev.to Antigravity 59 工具中 RSA/Token 计数器已在栈、PII Masker 与候选池「文本敏感信息打码」同方向不单立；V2EX 10-17 当天均为桌面端/App/AI/后端形态，无单页可落地新信号；WPS 候选表保持冻结归档；仓库 90 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git ls-remote`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在且与本地 HEAD 3ad2c8a 一致；`git log` 确认开发交付 3ad2c8a；`grep tools/categories.go` 全量 90 Path，`og_card_preview` ID 与 `/tools/og-card-preview` Path 已注册（划入已实现），新候选建议 ID（number_base_converter / mp3_tag_editor）与 90 Path 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-17 21:00 第十一轮研究）

## 今日任务（2026-10-17 21:00 · 产品调研员研究轮 ✅）

**交付状态**：10-17 通用调研第十一轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研）。图片标注工具已交付闭环（19:00 PM 决策轮立项→开发交付 7470877；`grep tools/categories.go` 确认 ID `image_annotator`、Path `/tools/image-annotator` 已注册，全量 89 Path），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮五件事**（21:00 全网调研，通用方向）：
1. 图片标注工具交付确认：`git log` 确认开发交付 7470877；`grep tools/categories.go` 确认已注册（全量 89 Path），与候选池无重叠项残留；候选池划出，已实现清单追加。
2. 新晋候选：**OG 社交卡片预览（Open Graph / Twitter Card / 微信分享卡片预览）**。需求证据三重：① dev.to ConvertLinx 2026-10-07「How I Built ConvertLinx: 20+ Free Online Tools That Run Entirely in Your Browser」单列 OG Preview Checker 为开发者工具（10 天前）；② 今日刚交付 SERP 搜索结果片段预览（29ccefb），OG 预览与其互链可成「营销工具」品类组合（搜索结果预览+社交分享预览双链路）；③ 中文差异化：微信内分享链接卡片（标题/描述/缩略图 5:4）与 Twitter Card（2:1 大图）/Facebook 版式不同，现有海外 OG 工具不做微信，公众号运营/独立站长/自媒体调试分享卡片为刚需。可行性：纯前端极小——标题/描述/URL/图片四输入→Twitter Card（Summary/Summary Large Image）/Facebook/LinkedIn/微信聊天卡片多版式并排渲染→各平台尺寸与字段规则提示；无外部依赖、数据不出浏览器。去重：89 Path 无 og/opengraph/社交卡片重叠。难度小。SEO：OG 预览、社交分享卡片预览、微信分享卡片、Twitter Card 预览。建议 ID `og_card_preview`、Path `/tools/og-card-preview`。
3. 新晋观察候选：**图片转 SVG（位图矢量化）** / **Favicon 生成器** / **Before-After 对比滑块**。① dev.to KeptTools 2026-10-15（2 天前）「I Got Tired of 'Free Tools' That Upload My Files」单列 Image → SVG（浏览器端位图转矢量）+ Change background（白/蓝/透明底证件照换底，portrait 模型首次下载）；图片转 SVG 可用 potrace.js（约 30KB）纯前端实现，Logo/图标矢量化场景，难度中，进 P1 观察；证件照换底维持 P2 观察（模型数十 MB+发丝级质量风险）；② ConvertLinx 同帖单列 Favicon Generator：上传图片→多尺寸 PNG+ICO 打包下载，canvas 纯前端可做（ICO 编码手写），但 realfavicongenerator 等成熟免费玩家多、中文需求证据弱，P2 观察；③ HN Show HN Before-After comparison videos（295 天前旧帖）：上传两张图→滑动/渐显对比，视频版需后端，图片滑块版纯前端可做（装修/修图/医美前后对比展示），中文证据弱，P2 观察。去重：89 Path 无 svg 矢量/favicon/before_after/前后对比命中。
4. 无新单页信号侧：① dev.to blanzatools 2026-10-11「14 Free Browser Tools I Built with Vanilla JS」14 项中仓库已覆盖 12 项（img-compress/resize、word-counter、case-converter、lorem-ipsum、age、bmi、percentage、unit-converter、password-generator、qrcode、color-picker、json-formatter、countdown），未覆盖仅 Signature Maker（中文证据弱）不单立；② dev.to kkp 2026-10-13 DevTrove 22 开发者工具：JSON Schema validator / JSON semantic diff / CSV↔JSON 为仓库未覆盖项，但均为开发者 niche 且证据单条，不单立；③ V2EX 2026-10-17 当天：BiliFlow（B 站桌面下载/直播录制，桌面端）、Iterlay（无限画布+需接 AI 模型服务）、key-to-magpie（Chrome 插件）、听力流利度练习软件（语言学习 niche 单文件）、opensourceadobe.com（Adobe 开源替代导航站）——均非单页纯前端口径；V2EX 10-16 roamdial 网页电台维持 P2 观察（第三方 Radio Browser API 依赖）。
5. WPS 候选表保持冻结归档（本轮为通用方向）。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **AA 制费用分摊计算器（最少转账结算）** — P1（顺位第一：18:00/19:00 PM 决策轮明确「留池作后续节奏调节」；Cashinator/SplitPop/App Store 分帳 App 三重形态验证；纯前端小难度：人员名单+多笔支出录入→净余额→贪心最少转账方案→明细一键复制；89 Path 无重叠；注：今日已交付双11到手价/经济补偿金两个计算器，若 PM 判断计算器节奏冲突则继续留池作节奏调节）。SEO：AA 制计算器、聚餐分摊、账单分摊。
2. **工资条生成器（HR 工资表→每人工资条）** — P1（顺位第四递进：第六轮新晋，360doc 财务 Python 实战+HR 20 函数双证据；HR/财务月度刚需；纯前端小难度：上传工资表 Excel（SheetJS 在栈）→逐员工工资条卡片→浏览器打印/PDF 导出；与工资个税计算器互链成「HR 财务」组合；Excel+打印形态与今日已交付全部错峰，适合 21:00 晚间轮）。SEO：工资条生成器、工资条打印。
3. **OG 社交卡片预览（Open Graph/Twitter/微信分享卡片预览）** — P1（本轮新晋：dev.to ConvertLinx 2026-10-07 形态验证；与今日刚交付的 SERP 搜索结果片段预览互链成「营销工具」品类组合；中文差异化：微信分享卡片版式为海外工具空白；纯前端极小：四输入→多平台卡片并排渲染→尺寸规则提示；难度小）。SEO：OG 预览、社交分享卡片预览、微信分享卡片。

视频抽帧列顺位第四（P1，难度中，19:00 PM 决策轮明确「适合上午轮次留足时间」，晚间轮不推）；露营用电计算器/乳胶漆用量计算器/报价单收据生成器/年会大屏抽奖顺位顺延；在线方格纸/金额大写转换器（节奏调节位）/接龙文本统计/极简简历制作器/图片转 SVG（本轮新晋观察）等其余候选留池。

**通用候选表**（2026-10-17 第十一轮；图片标注工具已实现划出；新晋 OG 社交卡片预览 P1、图片转 SVG P1（观察）、Favicon 生成器/Before-After 对比滑块 P2（观察）；全量 89 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| AA 制费用分摊计算器（最少转账结算） | 第九轮新晋（Cashinator 纯网页可试用：equal/proportional/itemized 三种分摊→"minimal settlements (fewest transfers)" 纯数学无 AI；SplitPop："works out the fewest payments to settle up"，"Six debts in. Two payments out."；App Store《簡易/分帳》計算機 2026 更新 5.0 满分：聚餐一键分摊+服务费+多笔加总完全离线；dev.to CapyToolkit 45+ 工具集单列 receipt splitter）；纯前端：人员名单+多笔支出录入（付款人/金额/参与人/均摊或按份/服务费分摊）→净余额→贪心最少转账结算方案→明细一键复制/分享；场景：聚餐/旅游/团建/合租/宿舍；89 Path 无 aa/分摊/账单/bill 命中 | 小 | P1（顺位第一） |
| 视频抽帧（视频转图片/封面提取） | 第四轮新晋（HN Show HN "Video Frame Extractor" 2026-10-07：浏览器上传视频、指定间隔自动抽帧下载，免安装；自媒体做视频封面/缩略图、从视频取某一帧做素材，手机截图精度差、PR/剪映等桌面软件太重）；纯前端 `<video>`+canvas 抽帧→PNG/JPEG 批量下载（间隔秒数/手动打点/缩略图预览勾选），零依赖、文件不出浏览器；开辟「视频工具」新方向；89 Path 无 video/视频/抽帧重叠 | 中 | P1（顺位递进） |
| OG 社交卡片预览（Open Graph/Twitter/微信分享卡片预览） | 本轮新晋（dev.to ConvertLinx 2026-10-07「How I Built ConvertLinx」单列 OG Preview Checker 为开发者工具；与今日刚交付的 SERP 搜索结果片段预览互链成「营销工具」品类组合；中文差异化：微信内分享链接卡片（标题/描述/缩略图 5:4）与 Twitter Card（2:1 大图）/Facebook 版式不同，海外 OG 工具不做微信，公众号运营/独立站长调试分享卡片刚需）；纯前端极小：标题/描述/URL/图片四输入→Twitter Card（Summary/Summary Large Image）/Facebook/LinkedIn/微信聊天卡片多版式并排渲染→各平台尺寸与字段规则提示；无外部依赖、数据不出浏览器；89 Path 无 og/opengraph/社交卡片重叠 | 小 | P1（本轮新晋） |
| 工资条生成器（HR 工资表→每人工资条） | 第六轮新晋（360doc 2025-12-10 财务 Python 实战：150 人公司工资条「打印-裁剪-装袋 3 小时→一键生成 2 分钟」，50 人传统流程 9 小时；360doc 2025-12-14 HR 20 函数：「工资条：VLOOKUP 批量生成，几百人的工资条分分钟搞定」列为发钱大事；Etsy 付费模板+YouTube Payroll 教程形态验证）；纯前端：上传工资表 Excel（SheetJS 在栈）→逐员工工资条卡片（表头项+金额+签名栏）→浏览器打印/PDF 导出（一页多条）+单表 xlsx 导出；「工资数据不出浏览器」隐私叙事；与工资个税计算器互链成「HR 财务」组合；89 Path 无工资条/payslip 重叠 | 小 | P1（顺位第四） |
| 露营用电计算器（户外电源选购） | 第八轮新晋（新浪新闻 2026-10-17「房车露营需要准备哪些物品」：短途 1~3 天「携带≥2 度电的户外电源」，选购要点「容量 1000Wh 以上、纯正弦波输出」，「买多大」为选购最大困惑；hjaiot 中文实战「户外储能电源一般容量多大」：列需求清单公式（笔记本 60W×4h=240Wh、车载冰箱 40W×12h=480Wh、照明 200Wh，相加+30% 冗余）；dev.to Camp Power Calc 形态验证）；纯前端：设备清单（预设功率+自定义）+使用时长→总 Wh→逆变损耗 10~20%→推荐容量档位（300~600/600~1000/1000~2000/2000Wh+）+太阳能板建议；时令：秋季露营季+国庆刚过；89 Path 无 camp/露营/户外电源命中 | 小 | P1（顺位顺延） |
| 乳胶漆用量计算器 | 第八轮新晋（svipapi.com 2026-09-17 中文实战「装修要买多少瓷砖和乳胶漆：用量公式」：涂刷面积=顶面+四面墙−门窗洞、两遍施工、每升一遍涂布约 12㎡、加 8% 损耗、按桶取整，「门窗洞漏扣/深色多刷一遍/只算墙忘了顶」三处常见算错；dev.to Room Paint Calculator 形态验证；cypaint 覆盖率数据 10~12㎡/L/遍）；纯前端：房间长宽高+门窗数量→涂刷面积→遍数/涂布率/损耗→升数+按桶（18L/5L）取整建议；89 Path 无 paint/油漆/乳胶命中 | 小 | P1（顺位顺延） |
| 报价单/收据生成器 | 第七轮新晋（Medium 2026-09-19「15 Free Online Tools Everyone Should Bookmark」：Invoice Generator 列为必备收藏；海外 zoho/signNow/Jotform 多为模板下载或付费 SaaS，「纯在线免注册、填表单→打印/PDF」有差异化空间；中文自由职业者/个体户/小商家开票收据刚需，用户本人玻璃店老板实战场景）；纯前端：客户/供方信息+项目明细行自动算金额→A4 预览→打印/PDF 导出（沿简历制作器打印路线）；金额大写自动转换，与金额大写转换器互链成「票据」组合；89 Path 无 quotation/invoice/报价单/收据命中 | 小 | P1（顺位顺延） |
| 年会大屏抽奖 | 第七轮新晋（质速导航 2026-10-04 收录 365Lab活动屏幕：年会团建大屏互动纯前端一个网页搞定，13 天前新鲜中文证据；海外 wheelofnames.io/spinthelist/funraise Raffle Wheel 形态验证；时令：距 12-1 月年会季 1.5~2 个月，现在上线吃预热搜索）；纯前端：名单粘贴导入→转盘/滚动抽奖动画（canvas）→多轮次+中奖者自动移出→中奖名单导出→全屏大屏模式；数据不出浏览器；89 Path 无 lottery/raffle/抽奖命中 | 中 | P1（时令预热） |
| 在线方格纸/稿纸生成器（打印模板） | 第四轮新晋（HN Show HN 2026-10-16 方格纸生成器：免登录、无水印、真实比例打印，纯前端；360doc 2025-12-10 打印字帖网站：米字格/田字格/九宫格/康奈尔笔记/点阵纸/作文稿纸，家长打印字帖、学生备稿纸刚需）；SVG/Canvas 渲染模板+参数（格子大小/线条颜色/纸张 A4·A5）+浏览器打印/PDF 导出；田字格/米字格/作文稿纸/拼音格中文差异化 vs Gridzzly/Paper Me；89 Path 无重叠 | 小 | P1 |
| 金额大写转换器 | 第六轮新晋（实名需求：阿拉伯数字转人民币大写，起诉状/和解协议/收据必备；新浪科技 WPS 人民币大小写教程：用户靠 WPS/Excel 单元格格式转换，在线免费替代错位；360doc「X 元大写怎么写」问答+GitHub fastquotes 金额转汉字库）；纯前端极小：输入→人民币大写+一键复制；与报价单/收据生成器互链成「票据」组合；89 Path 无大写/金额大写命中 | 小 | P1（节奏调节位） |
| 接龙文本统计（粘贴群接龙→解析汇总） | 第四轮新晋（sohu 2026-08-25「微信接龙怎么导出打卡记录」：班长「对着几百条群消息熬夜对账」；163 2026「微信接龙总漏统计？」：刷屏混在聊天记录里看不清、序号重复、事后逐条复制整理；sohu 2026-08-28 一起报数种草文：小程序导出 Excel 要开会员、广告多）；差异化「事后整理」vs 发起式小程序：粘贴混乱文本→规则引擎解析→去重/人数汇总→「谁没接龙」对比→CSV 导出；纯前端、数据不出浏览器；89 Path 无接龙重叠 | 中 | P1 |
| 极简简历制作器 | V2EX t/1210967 xukz.cn「Word 改简历调字间距打印格式崩溃」；CSDN IT 简历模板榜 Word 排版难痛点；360doc 2025-12-31 简历制作神器高频痛点；秋招季时令；结构化填写→A4 所见即所得预览→浏览器打印/PDF 导出，localStorage 免注册免上传，「简历不出浏览器」差异化叙事；89 Path 无 resume/简历重叠 | 中 | P1 |
| 课程表生成器 | 第三轮升级（CSDN 2026-01「数字化课程表」：Word/Excel 手工绘制耗时、调课改版易混乱、排版单调；360doc 2025-12-10 教师五大难题列排课为核心难题）；可行范围：个人/班级课程表拖拽填课+简易撞课提示+配色模板+打印/PDF 导出（不做全校智能排课算法）；纯前端；89 Path 无重叠 | 中 | P1 |
| 图片裁剪（比例预设+拖拽裁剪框） | pixoate 预设比例 1:1/16:9/4:5+拖拽框实时预览+手机触屏；splitanimage 本地免上传图片套件；YouTube TemplateMaker.in 考试/求职/政府表单照片高频；与 img-resize（指定宽高数值裁剪）差异化明确无重叠；图片旅程线缺环补齐；canvas 纯前端本地免上传 | 小 | P1（节奏调节位） |
| 工作日计算器（含法定节假日/调休） | V2EX PriTime「法定节假日/调休补班重复，国内用户刚需」；yize/chinese-workday 2011-2026 数据+浏览器 CDN；Excel NETWORKDAYS 手工维护节假日痛点；起止日期→工作日天数+单日「要上班吗」查询；与 /tools/calendar（仅展示）无重叠；难度中（年份数据表需年更） | 中 | P1 |
| 图片拼图（网格模板拼图） | 360doc 2026-01-30 四选一首位；Photo Collage Maker 形态：多张图合成一格、网格/异形模板、自定义布局、文字/贴纸；与 nine-grid（九宫格切图）方向相反无重叠；与 img-stitch（一维长图拼接）形态不同；canvas 纯前端本地免上传 | 小 | P1 |
| 屏幕录制（在线录屏） | 360doc 2026-01-30 宝藏站单列推荐；网易测评三大痛点：免费导出带水印、桌面软件要安装、公司电脑禁装软件只能用网页方案；100% 纯前端（getDisplayMedia+MediaRecorder→webm），免安装无水印文件不出本机；桌面端优先 | 中 | P1（通用顶位备选） |
| cURL 转代码 | 开发者刚需（HN 讨论 + curlconverter 开源库 27+ 语言）；赛道已有成熟免费玩家，垂直小众 | 小 | P1 |
| 浏览器实时听写（麦克风语音转文字） | 第三轮新晋观察（CSDN 会议测评：73% 职场人遇到转写痛点；360doc 2025-12-21 腾讯元宝不限时长免费掀桌子反证全民刚需；HN Show HN BetterWispr 2026-10-12 200 points：本地听写「无账号无云端」差异化；dev.to Whistle 轻量 STT 走红）；Web Speech API SpeechRecognition（Chrome/Edge 中文免费免 key）纯前端实时转写+复制/导出；「录音不出浏览器」对标需上传的 AI 方案；限制：Firefox/Safari 支持差须注明、质量不如 AI 大模型、无说话人分离/总结；赛道被免费 AI 统治，观察为主；89 Path 无重叠 | 小 | P1（观察） |
| 文本敏感信息打码 | 文本身份证/手机号/银行卡号脱敏；未找到强需求信号，运营场景刚需但证据弱 | 小 | P1（观察） |
| Excel 公式中文解释器 | 360doc「Excel 公式机器人」文本指令转公式是 AI 能力、不可做；反向「公式→中文分步解释」纯前端可做：词法拆解+函数中文说明库；证据单薄仅一条，待补强 | 中 | P1（观察） |
| 时区转换器（世界时钟/跨国会议时间换算） | 第十轮新晋观察（dev.to 2026-10-13：Time Zone Converter——"40 IANA time zones side by side, with DST handled"；timeanddate/worldtimebuddy/timebie 形态验证；纯前端极小：日期时间+来源/目标时区（Intl API 自动处理夏令时，跨日期+1 天提示）→并排世界时钟+会议时间一键复制分享；中文痛点证据弱（跨国会议/海淘/海外直播受众窄），观察为主；89 Path 无 timezone/时区重叠（timestamp 为 Unix 时间戳不同方向） | 小 | P1（观察） |
| 图片转 SVG（位图矢量化） | 本轮新晋观察（dev.to KeptTools 2026-10-15（2 天前）「I Got Tired of 'Free Tools' That Upload My Files」单列 Image → SVG 浏览器端位图转矢量；potrace.js（约 30KB）纯前端可实现，Logo/图标矢量化场景；输出质量不如 Illustrator，阈值/平滑参数调优决定效果；89 Path 无 svg 矢量命中 | 中 | P1（观察） |
| Markdown 表格修复 | 中文全角/emoji 对齐错乱修复；赛道拥挤（tablesgenerator、tableconvert、编辑器插件生态），纯本地免费可差异化 | 小 | P1（末位） |
| 网页电台（随机听全球电台） | 第八轮新晋观察（V2EX 2026-10-16 roamdial：170 回复/204 收藏，网页免安装随机切台、码率≥128/192/320 过滤、语言过滤、歌词跟唱、收藏跳网易云/QQ 音乐/Spotify；电台目录来自 Radio Browser 社区 API 周更+可用性探测）；依赖第三方公共 API，单页可实现但需网络 API、非离线纯本地口径，第三方可用性风险；89 Path 无 radio/电台命中 | 中 | P2（观察·第三方 API 依赖） |
| 自由职业时薪计算器 | 第八轮新晋观察（dev.to「Build in Public #1」2026-10-10：年目标收入/可计费小时→时薪，86,000/1150h=$74.78/h，9/9 测试；仅海外单条证据，中文时薪报价信号未找到） | 小 | P2（观察） |
| 域名可用性批量查询（RDAP 生成器方向） | 第十轮新晋观察（dev.to etemora 2026-10-10：关键词→创意域名+12+ 后缀 RDAP 可用性查询，含注册商/年限/到期信息）；ToolWeb domain-check 同方向（RDAP+whois 协议直查，曾因 Muse VM 出网被拦截未完全解决）；RDAP 依赖第三方网络可用性，国内访问稳定性待验证，不单立 | 中 | P2（观察·第三方网络依赖+同方向已有） |
| 证件照换底色 | CSDN+360doc 实测文再确认刚需（微信小程序爆款均靠 AI 服务器抠图）；发丝级抠图需 AI 分割模型（WASM 版数十 MB），不完全符合纯轻量前端口径，等轻量方案；KeptTools 2026-10-15 portrait 换底模型首次下载验证浏览器端可行但质量风险仍在 | 中 | P2（观察） |
| SQLite 在线查看器 | dev.to Tooltri 单次提及；sql.js WASM 纯前端可读 .db 文件；开发者小众 | 中 | P2（观察） |
| 手写模拟器 | 360doc 2026-02-14 萝卜工坊；作业/笔记/贺卡趣味场景；canvas+手写体字库纯前端可做 | 小 | P2（观察） |
| 在线文字转语音（Web Speech API） | 维持观察（赛道被 AI 拟真语音统治——Speechify 50 万+五星、AIVocal 600+音色；Web Speech API 系统语音音质参差、不可定制音色，免登录叙事不足以对冲质量差距；证据仍单薄） | 小 | P2（观察） |
| 隐私政策生成器 | 第三轮新晋观察（FreeTopTools 16 工具清单单列「Business」工具；APP/小程序上架商店强制要求隐私政策文本；表单填空→标准模板条款生成，纯前端；证据单条，赛道已有在线生成器玩家） | 小 | P2（观察） |
| 轻断食计时器 | 第四轮新晋观察（HN Show HN "Intermittent Fasting Calculator" 2026-10-07 新鲜：16:8/14:10/18:6/20:4/OMAD 断食窗口规划+24 小时彩色时间轴+文本/图片/PDF 导出；纯前端可做：方法选择+上餐/目标时间输入→时间轴渲染+本地提醒；国内受众小众、健康类与本站工具定位偏离，观察为主；89 Path 无 fast/断食重叠） | 小 | P2（观察） |
| Favicon 生成器 | 本轮新晋观察（dev.to ConvertLinx 2026-10-07 同帖单列 Favicon Generator：上传图片→多尺寸 PNG+ICO 打包下载；canvas 纯前端可做，ICO 编码手写；realfavicongenerator 等成熟免费玩家多，中文需求证据弱；89 Path 无 favicon 命中） | 小 | P2（观察） |
| Before-After 对比滑块（两张图滑动对比） | 本轮新晋观察（HN Show HN Before-After comparison videos：上传两张图→滑动/渐显对比展示；视频版需后端，图片滑块版纯前端 canvas 可做；装修/修图/医美前后对比展示场景；中文证据弱；89 Path 无 before_after/前后对比命中） | 小 | P2（观察） |

**已实现（图片标注工具本轮划出，全量 89 Path）**：思维导图 → 表格拆分 → 表格合并 → **HEIC 转 JPG（已开发、未可交付——12:30 真机实测失败、生产已回滚，见历史轮次「⚠️ 待修复」）** → 成绩统计分析 → 二手房税费计算器 → 房贷计算器 → PDF 可填写表单制作器（+触屏修复）→ 工资个税计算器（8a6e0cc：七项专项附加扣除+年终奖计税对比，与房贷/二手房税费三向互链成「财务」旅程线）→ 双十一凑单计算器（145e47e+3d02c3c：满减档位自定义+子集和 DP 最小溢出最优组合+「还差 XX 元」提示与候补单品建议，纯前端本地计算）→ 字体版权查询（abe5db0+fd8fc74：canvas 本地字体探测+198 条离线版权库+复制报告，`/tools/font-license-check`）→ **简历预检工具（开发交付：`templates/resume_checker.html`+745 行纯前端规则引擎（技术栈词典 200 词+动作动词库+JD 关键词匹配/ATS 检测/逻辑链检查/雷区清单四模块报告+一键复制），新建「求职工具」品类，`/tools/resume-checker`）** → **在线图表生成器（1c6a9e3+fc135d3：粘贴表格/CSV/Excel 复制行→分隔符自动识别+引号感知解析→柱状/折线/饼/环形四类型自绘 SVG 渲染→1x/2x/3x 高清 PNG 导出，`/tools/chart-generator`）** → **双11到手价计算器（优惠叠加模拟）（2dca60b：商品直降价→店铺券→品类券→跨店满减→会员折扣→红包→以旧换新折价→国补 15%（家电封顶 1500/数码 500/手机 6000 红线）逐层明细+规则提示+平台预设，`/tools/double11-final-price`）** → **GB/T 7714 参考文献格式生成器（acdfccd：[J][M][D][C][N][S][R][P][EB/OL][A] 十种文献类型表单+顺序编码制/著者-出版年制双制式切换+中文「等」/英文「et al」自动处理+多条目累积排序导出，`/tools/gbt7714-reference-generator`）** → **经济补偿金计算器（2eaeeec+2b0b434：入职/离职日期→工龄折算 N→经济补偿金 N/代通知金+1（第 40 条）/违法解除赔偿金 2N+三倍社平封顶/12 年封顶+法条标注+免责声明+一键复制，`/tools/severance-calculator`）** → **AI 文本清洁器（9a0111a+d6d3bb0：零宽/BOM/非断空格/软连字符/变体选择符/方向标记/标签字符扫描计数+可视化标记+一键清除+码点计数口径修复，`/tools/ai-text-cleaner`，与 AI Token 计数器互链成「AI 写作」组合）** → **SERP 搜索结果片段预览（29ccefb：三输入+Google 桌面/移动端结果卡实时渲染+标题 ~600px 像素截断预警标红+描述 155~160 长度条+百度规则对照+一键复制，新建「营销工具」品类，`/tools/serp-snippet-preview`）** → **图片标注工具（7470877：截图批注——箭头/图形/文字/荧光笔/马赛克，纯前端 canvas，与打水印/尺寸调整/九宫格互链成图片旅程线，`/tools/image-annotator`）**；以上均已从候选池划出，历史记录保留于下方各轮次小节。

**归档说明**：本轮为 10-17 通用调研第十一轮（WPS 特别方向 10-15 已结束）——图片标注工具交付闭环（7470877，`/tools/image-annotator` 已注册，全量 89 Path），候选池划出；新晋候选「OG 社交卡片预览」P1（dev.to ConvertLinx 2026-10-07 形态验证，与今日刚交付的 SERP 互链成「营销工具」组合，微信分享卡片中文差异化，难度小）、「图片转 SVG」P1（观察）（dev.to KeptTools 2026-10-15 新鲜形态，potrace 纯前端，难度中）、「Favicon 生成器」「Before-After 对比滑块」P2（观察）；dev.to blanzatools 14 项中 12 项仓库已覆盖、DevTrove 22 项未覆盖项均为开发者 niche，不单立；V2EX 10-17 当天均为桌面端/插件/AI/导航形态，无单页可落地新信号；WPS 候选表保持冻结归档；仓库 89 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`git log` 确认开发交付 7470877；`grep tools/categories.go` 全量 89 Path，`image_annotator` ID 与 `/tools/image-annotator` Path 已注册（划入已实现），新候选建议 ID（og_card_preview / image_to_svg / favicon_generator / before_after_slider）与 89 Path 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-17 19:00 决策轮）

## 今日任务（2026-10-17 19:00 · 产品经理排期决策 ✅）

**交付状态**：待前端开发轮交付。10-17 排期决策轮（19:00 第十轮研究之后）。SERP 搜索结果片段预览已交付闭环（18:00 PM 决策轮立项→开发交付 29ccefb，`/tools/serp-snippet-preview` 已注册，全量 88 Path），候选池划出。本轮立项**今日下一任务：图片标注工具（截图批注：箭头/图形/文字/马赛克）**。

**选定：图片标注工具（/tools/image-annotator）** — 本轮唯一任务：
- **难度小可高质量交付**：纯前端 canvas，上传→批注→PNG/JPEG 导出（沿 watermark 导出路线），数据不出浏览器，无外部依赖。
- **节奏错峰最彻底**：今日已交付双11到手价计算器、经济补偿金计算器（2 个计算器）+GB/T 7714 学术表单+AI 文本清洁器+SERP 预览；图片标注为 canvas 交互批注形态，与今日所有交付形态都不同，避免计算器三连击。
- **尊重既有定序**：18:00 PM 决策轮已明确 AA 制「留池作后续节奏调节」（计算器类节奏冲突），本轮延续该决定，AA 制继续留池作节奏调节位，不提前消耗。
- **旅程线闭环**：与「图片处理」品类内 watermark/img-resize/九宫格拼图互链，补齐「批注」缺环，形成完整图片工具链（既有「财务」/「HR 财务」/「AI 写作」组合的既定产品线策略）。
- **证据新鲜**：dev.to 2026-10-13（4 天前）「I Replaced My Productivity Apps with 10 Free Browser Tools」Image Annotator——"arrows, shapes, and text on screenshots, exported as PNG or JPEG"+Evernote 在线 image-annotation 工具形态验证；中文痛点：反馈 bug/教学演示/网店售后截图批注，公司电脑禁装软件时网页方案是唯一选择（与屏幕录制轮次同源痛点）。
- **视频抽帧留池**：难度中、一天交付质量风险高（18:00 PM 结论），适合上午轮次留足时间，不适合 19:00 晚间轮次；「视频工具」新方向值得更充裕的一轮。

**规格**：
1. 上传图片：点击/拖拽，JPG/PNG/WebP，canvas 按比例适配渲染。
2. 批注工具栏：箭头、直线、矩形、圆形/椭圆、文字（字号可调）、荧光笔、马赛克（像素化打码）；颜色预设（红/黄/蓝/绿/黑/白）+自定义色；线宽调节滑杆。
3. 历史栈：撤销（Ctrl+Z）/重做（Ctrl+Y）/清空画布。
4. 导出：PNG / JPEG（质量滑杆），沿 watermark 导出路线（canvas.toBlob→a[download]）。
5. 纯前端、数据不出浏览器；响应式布局，桌面端优先。
6. 注册：`tools/categories.go`「图片处理」品类（ID `image`）新增 ID `image_annotator`、Path `/tools/image-annotator`（New: true），中英文描述 + SEO keywords（截图批注、图片标注、截图画箭头、图片打码、马赛克），与 watermark/img-resize/九宫格拼图互链。

**验收标准**：
- [ ] `/tools/image-annotator` 可开（200）
- [ ] 上传截图（JPG/PNG/WebP）→ canvas 正常渲染
- [ ] 箭头/直线/矩形/圆形/文字/荧光笔/马赛克均可绘制；颜色、线宽可调
- [ ] 马赛克区域真正像素化、导出后不可逆
- [ ] 撤销/重做/清空可用（快捷键生效）
- [ ] PNG/JPEG 导出可用，JPEG 质量可调
- [ ] 纯前端无后端调用（DevTools Network 抽查）
- [ ] `categories.go` 注册完成（「图片处理」品类），首页/导航/sitemap 生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/image_annotator.html`（新建：工具栏+画布区+导出区，纯前端）、`tools/categories.go`（「图片处理」品类注册+互链）、`BACKLOG.md`（本小节）。

**未选**：AA 制费用分摊计算器（P1，Cashinator/SplitPop/App Store 三重形态验证；今日已交付两个计算器，18:00 PM 明确「留池作后续节奏调节」，继续留池）；视频抽帧（P1，HN Show HN 新鲜证据+开辟「视频工具」新方向；难度中、一天交付质量风险高，适合上午轮次，留池）；工资条生成器/露营用电计算器/乳胶漆用量计算器/报价单收据生成器/年会大屏抽奖/金额大写转换器等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 88 Path，无 image_annotator/image-annotator/截图批注命中，ID `image_annotator`、Path `/tools/image-annotator` 无重叠；「图片处理」品类（ID `image`）确认含 watermark/img-resize/九宫格拼图；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-17 19:00 第十轮研究）

## 今日任务（2026-10-17 19:00 · 产品调研员研究轮 ✅）

**交付状态**：10-17 通用调研第十轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研）。SERP 搜索结果片段预览已交付闭环（18:00 PM 决策轮立项→开发交付 29ccefb；`grep tools/categories.go` 确认 ID `serp_snippet_preview`、Path `/tools/serp-snippet-preview` 已注册，全量 88 Path），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮五件事**（19:00 全网调研，通用方向）：
1. SERP 预览交付确认：`git log` 确认开发交付 29ccefb；`grep tools/categories.go` 确认已注册（全量 88 Path），与候选池无重叠项残留；候选池划出，已实现清单追加。
2. 新晋候选：**图片标注工具（截图批注）**。需求证据三重：① dev.to 2026-10-13「I Replaced My Productivity Apps with 10 Free Browser Tools」4 天前新鲜证据：Image Annotator——"arrows, shapes, and text on screenshots, exported as PNG or JPEG"；② Evernote 在线 image-annotation 工具形态验证（上传截图→加箭头/形状→下载，免安装）；③ 中文场景：反馈 bug/教学演示/网店售后图片批注——微信/QQ 截图可画箭头但跨平台与网页场景缺位，公司电脑禁装软件时网页方案是唯一选择（与屏幕录制轮次同源痛点）；小齐科技谷涂鸦工具为纯画板向、缺箭头/形状/马赛克批注形态。可行性：纯前端 canvas——上传截图→箭头/矩形/圆形/直线/文字/马赛克/荧光笔→撤销→PNG/JPEG 导出（沿 watermark 导出路线），数据不出浏览器；与 watermark/img-resize/九宫格拼图互链成「图片」旅程线。去重：88 Path 仅 /tools/pdf-annotate（PDF 方向不同）无重叠。难度小。SEO：截图批注、图片标注、截图画箭头、图片打码。建议 ID `image_annotator`、Path `/tools/image-annotator`。
3. 新晋观察候选：**时区转换器（世界时钟）**。需求证据：dev.to 2026-10-13 同帖 4 天前：Time Zone Converter——"40 IANA time zones side by side, with DST handled"；timeanddate/worldtimebuddy/timebie 形态验证；纯前端极小：日期时间+来源/目标时区（Intl API 自动处理夏令时，跨日期+1 天提示）→并排世界时钟+会议时间一键复制分享。中文痛点证据弱（跨国会议/海淘/海外直播受众窄），进 P1 观察。去重：88 Path 无 timezone/时区重叠（timestamp 为 Unix 时间戳不同方向）。难度小。SEO：时区转换、世界时钟、北京时间换算。建议 ID `timezone_converter`、Path `/tools/timezone-converter`。
4. 去重确认（不单立）：① dev.to 3 天前「9 free dev utilities」同帖 9 项中 6 项仓库已覆盖：JWT 解码（/tools/jwt-parser）、子网计算器（/tools/subnet-calculator）、文本对比（/tools/text-diff）、Cron 表达式解析（/tools/cron-parser）、Unix 时间戳（/tools/timestamp）、Base64 工具；Cron builder 方向已被 cron-parser 覆盖，JSON 格式化/正则测试已在栈，不单立；② SVG 转 React JSX/重复词查找器/CPM 计算器——开发者小众 niche；YouTube 缩略图下载需后端拉取第三方，不符合单页纯前端口径；③ V2EX 2026-10-17 当天：Purrfit 猫咪体重记录（Cloudflare Workers+KV 后端形态）、BiliFlow B 站桌面工具（桌面端）、Iterlay 无限画布（需接 AI 模型服务）、key-to-magpie（Chrome 插件形态）、opensourceadobe.com（导航站）——均非单页纯前端口径。
5. WPS 候选表保持冻结归档（本轮为通用方向）。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **AA 制费用分摊计算器（最少转账结算）** — P1（顺位第一：18:00 PM 决策轮明确「留池作后续节奏调节」；Cashinator/SplitPop/App Store 分帳 App 三重形态验证，最少转账结算为核心差异化；纯前端：多笔支出录入→净余额→贪心最少转账方案→明细一键复制；今日交付 SERP 为渲染预览类，计算器类节奏错峰；88 Path 无重叠）。SEO：AA 制计算器、聚餐分摊、账单分摊。
2. **图片标注工具（截图批注：箭头/图形/文字/马赛克）** — P1（本轮新晋·顺位第二：dev.to 4 天前新鲜证据+Evernote 形态验证；反馈 bug/教学/售后截图批注高频，公司电脑禁装软件时网页方案唯一选择；纯前端 canvas 极小：上传截图→批注→PNG/JPEG 导出；与图片旅程线互链；难度小）。SEO：截图批注、图片标注、截图画箭头。
3. **视频抽帧（视频转图片/封面提取）** — P1（顺位递进：HN Show HN 新鲜证据；开辟「视频工具」新方向；纯前端 `<video>`+canvas 抽帧→PNG/JPEG 批量下载；难度中，建议排上午轮次留足时间）。SEO：视频抽帧、视频转图片、视频封面提取。

工资条生成器列顺位第四（P1，第六轮新晋顺延，HR/财务月度刚需，难度小）；露营用电计算器/乳胶漆用量计算器顺位顺延（P1，均为计算器类，与 AA 同轮只能选其一）；报价单/收据生成器顺位顺延（P1，「票据」组合）；年会大屏抽奖维持 P1 时令预热（第七轮新晋，难度中）；在线方格纸/金额大写转换器（节奏调节位）/接龙文本统计/极简简历制作器等其余候选留池；时区转换器列 P1 观察。

**通用候选表**（2026-10-17 第十轮；SERP 搜索结果片段预览已实现划出；新晋图片标注工具 P1、时区转换器 P1（观察）；全量 88 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| AA 制费用分摊计算器（最少转账结算） | 本轮新晋（Cashinator 纯网页可试用：equal/proportional/itemized 三种分摊→"minimal settlements (fewest transfers)" 纯数学无 AI；SplitPop："works out the fewest payments to settle up"，"Six debts in. Two payments out."；App Store《簡易/分帳》計算機 2026 更新 5.0 满分：聚餐一键分摊+服务费+多笔加总完全离线；dev.to CapyToolkit 27 天前 45+ 工具集单列 receipt splitter）；纯前端：人员名单+多笔支出录入（付款人/金额/参与人/均摊或按份/服务费分摊）→净余额→贪心最少转账结算方案→明细一键复制/分享；场景：聚餐/旅游/团建/合租/宿舍；88 Path 无 aa/分摊/账单/bill 命中 | 小 | P1（顺位第一） |
| 视频抽帧（视频转图片/封面提取） | 第四轮新晋（HN Show HN "Video Frame Extractor" 2026-10-07：浏览器上传视频、指定间隔自动抽帧下载，免安装；自媒体做视频封面/缩略图、从视频取某一帧做素材，手机截图精度差、PR/剪映等桌面软件太重）；纯前端 `<video>`+canvas 抽帧→PNG/JPEG 批量下载（间隔秒数/手动打点/缩略图预览勾选），零依赖、文件不出浏览器；开辟「视频工具」新方向；88 Path 无 video/视频/抽帧重叠 | 中 | P1（顺位递进） |
| 图片标注工具（截图批注：箭头/图形/文字/马赛克） | 本轮新晋（dev.to 2026-10-13「I Replaced My Productivity Apps with 10 Free Browser Tools」4 天前新鲜证据：Image Annotator——"arrows, shapes, and text on screenshots, exported as PNG or JPEG"；Evernote 在线 image-annotation 工具形态验证（上传截图→加箭头/形状→下载，免安装）；中文场景：反馈 bug/教学演示/网店售后图片批注——微信/QQ 截图可画箭头但跨平台与网页场景缺位，公司电脑禁装软件时只能用网页方案（与屏幕录制轮次同源痛点）；小齐科技谷涂鸦工具纯画板向、缺箭头/形状/马赛克批注形态）；纯前端 canvas：上传截图→箭头/矩形/圆形/直线/文字/马赛克/荧光笔→撤销→PNG/JPEG 导出（沿 watermark 导出路线），数据不出浏览器；与 watermark/img-resize/九宫格拼图互链成「图片」旅程线；88 Path 仅 /tools/pdf-annotate（PDF 方向不同）无重叠 | 小 | P1（本轮新晋·顺位第二） |
| 工资条生成器（HR 工资表→每人工资条） | 第六轮新晋（360doc 2025-12-10 财务 Python 实战：150 人公司工资条「打印-裁剪-装袋 3 小时→一键生成 2 分钟」，50 人传统流程 9 小时；360doc 2025-12-14 HR 20 函数：「工资条：VLOOKUP 批量生成，几百人的工资条分分钟搞定」列为发钱大事；Etsy 付费模板+YouTube Payroll 教程形态验证）；纯前端：上传工资表 Excel（SheetJS 在栈）→逐员工工资条卡片（表头项+金额+签名栏）→浏览器打印/PDF 导出（一页多条）+单表 xlsx 导出；「工资数据不出浏览器」隐私叙事；与工资个税计算器互链成「HR 财务」组合；88 Path 无工资条/payslip 重叠 | 小 | P1（顺位第四） |
| 露营用电计算器（户外电源选购） | 第八轮新晋（新浪新闻 2026-10-17「房车露营需要准备哪些物品」：短途 1~3 天「携带≥2 度电的户外电源」，选购要点「容量 1000Wh 以上、纯正弦波输出」，「买多大」为选购最大困惑；hjaiot 中文实战「户外储能电源一般容量多大」：列需求清单公式（笔记本 60W×4h=240Wh、车载冰箱 40W×12h=480Wh、照明 200Wh，相加+30% 冗余）；dev.to 71 天前 Camp Power Calc 形态验证）；纯前端：设备清单（预设功率+自定义）+使用时长→总 Wh→逆变损耗 10~20%→推荐容量档位（300~600/600~1000/1000~2000/2000Wh+）+太阳能板建议；时令：秋季露营季+国庆刚过；88 Path 无 camp/露营/户外电源命中 | 小 | P1（顺位顺延） |
| 乳胶漆用量计算器 | 第八轮新晋（svipapi.com 2026-09-17 中文实战「装修要买多少瓷砖和乳胶漆：用量公式」：涂刷面积=顶面+四面墙−门窗洞、两遍施工、每升一遍涂布约 12㎡、加 8% 损耗、按桶取整，「门窗洞漏扣/深色多刷一遍/只算墙忘了顶」三处常见算错；dev.to 71 天前 Room Paint Calculator 形态验证；cypaint 覆盖率数据 10~12㎡/L/遍）；纯前端：房间长宽高+门窗数量→涂刷面积→遍数/涂布率/损耗→升数+按桶（18L/5L）取整建议；88 Path 无 paint/油漆/乳胶命中 | 小 | P1（顺位顺延） |
| 报价单/收据生成器 | 第七轮新晋（Medium 2026-09-19「15 Free Online Tools Everyone Should Bookmark」：Invoice Generator 列为必备收藏；海外 zoho/signNow/Jotform 多为模板下载或付费 SaaS，「纯在线免注册、填表单→打印/PDF」有差异化空间；中文自由职业者/个体户/小商家开票收据刚需，用户本人玻璃店老板实战场景）；纯前端：客户/供方信息+项目明细行自动算金额→A4 预览→打印/PDF 导出（沿简历制作器打印路线）；金额大写自动转换，与金额大写转换器互链成「票据」组合；88 Path 无 quotation/invoice/报价单/收据命中 | 小 | P1（顺位顺延） |
| 年会大屏抽奖 | 第七轮新晋（质速导航 2026-10-04 收录 365Lab活动屏幕：年会团建大屏互动纯前端一个网页搞定，13 天前新鲜中文证据；海外 wheelofnames.io/spinthelist/funraise Raffle Wheel 形态验证；时令：距 12-1 月年会季 1.5~2 个月，现在上线吃预热搜索）；纯前端：名单粘贴导入→转盘/滚动抽奖动画（canvas）→多轮次+中奖者自动移出→中奖名单导出→全屏大屏模式；数据不出浏览器；88 Path 无 lottery/raffle/抽奖命中 | 中 | P1（时令预热） |
| 在线方格纸/稿纸生成器（打印模板） | 第四轮新晋（HN Show HN 2026-10-16 方格纸生成器：免登录、无水印、真实比例打印，纯前端；360doc 2025-12-10 打印字帖网站：米字格/田字格/九宫格/康奈尔笔记/点阵纸/作文稿纸，家长打印字帖、学生备稿纸刚需）；SVG/Canvas 渲染模板+参数（格子大小/线条颜色/纸张 A4·A5）+浏览器打印/PDF 导出；田字格/米字格/作文稿纸/拼音格中文差异化 vs Gridzzly/Paper Me；88 Path 无重叠 | 小 | P1 |
| 金额大写转换器 | 第六轮新晋（实名需求：阿拉伯数字转人民币大写，起诉状/和解协议/收据必备；新浪科技 WPS 人民币大小写教程：用户靠 WPS/Excel 单元格格式转换，在线免费替代错位；360doc「X 元大写怎么写」问答+GitHub fastquotes 金额转汉字库）；纯前端极小：输入→人民币大写+一键复制；与报价单/收据生成器互链成「票据」组合；88 Path 无大写/金额大写命中 | 小 | P1（节奏调节位） |
| 接龙文本统计（粘贴群接龙→解析汇总） | 第四轮新晋（sohu 2026-08-25「微信接龙怎么导出打卡记录」：班长「对着几百条群消息熬夜对账」；163 2026「微信接龙总漏统计？」：刷屏混在聊天记录里看不清、序号重复、事后逐条复制整理；sohu 2026-08-28 一起报数种草文：小程序导出 Excel 要开会员、广告多）；差异化「事后整理」vs 发起式小程序：粘贴混乱文本→规则引擎解析→去重/人数汇总→「谁没接龙」对比→CSV 导出；纯前端、数据不出浏览器；88 Path 无接龙重叠 | 中 | P1 |
| 极简简历制作器 | V2EX t/1210967 xukz.cn「Word 改简历调字间距打印格式崩溃」；CSDN IT 简历模板榜 Word 排版难痛点；360doc 2025-12-31 简历制作神器高频痛点；秋招季时令；结构化填写→A4 所见即所得预览→浏览器打印/PDF 导出，localStorage 免注册免上传，「简历不出浏览器」差异化叙事；88 Path 无 resume/简历重叠 | 中 | P1 |
| 课程表生成器 | 第三轮升级（CSDN 2026-01「数字化课程表」：Word/Excel 手工绘制耗时、调课改版易混乱、排版单调；360doc 2025-12-10 教师五大难题列排课为核心难题）；可行范围：个人/班级课程表拖拽填课+简易撞课提示+配色模板+打印/PDF 导出（不做全校智能排课算法）；纯前端；88 Path 无重叠 | 中 | P1 |
| 图片裁剪（比例预设+拖拽裁剪框） | pixoate 预设比例 1:1/16:9/4:5+拖拽框实时预览+手机触屏；splitanimage 本地免上传图片套件；YouTube TemplateMaker.in 考试/求职/政府表单照片高频；与 img-resize（指定宽高数值裁剪）差异化明确无重叠；图片旅程线缺环补齐；canvas 纯前端本地免上传 | 小 | P1（节奏调节位） |
| 工作日计算器（含法定节假日/调休） | V2EX PriTime「法定节假日/调休补班重复，国内用户刚需」；yize/chinese-workday 2011-2026 数据+浏览器 CDN；Excel NETWORKDAYS 手工维护节假日痛点；起止日期→工作日天数+单日「要上班吗」查询；与 /tools/calendar（仅展示）无重叠；难度中（年份数据表需年更） | 中 | P1 |
| 图片拼图（网格模板拼图） | 360doc 2026-01-30 四选一首位；Photo Collage Maker 形态：多张图合成一格、网格/异形模板、自定义布局、文字/贴纸；与 nine-grid（九宫格切图）方向相反无重叠；与 img-stitch（一维长图拼接）形态不同；canvas 纯前端本地免上传 | 小 | P1 |
| 屏幕录制（在线录屏） | 360doc 2026-01-30 宝藏站单列推荐；网易测评三大痛点：免费导出带水印、桌面软件要安装、公司电脑禁装软件只能用网页方案；100% 纯前端（getDisplayMedia+MediaRecorder→webm），免安装无水印文件不出本机；桌面端优先 | 中 | P1（通用顶位备选） |
| cURL 转代码 | 开发者刚需（HN 讨论 + curlconverter 开源库 27+ 语言）；赛道已有成熟免费玩家，垂直小众 | 小 | P1 |
| 浏览器实时听写（麦克风语音转文字） | 第三轮新晋观察（CSDN 会议测评：73% 职场人遇到转写痛点；360doc 2025-12-21 腾讯元宝不限时长免费掀桌子反证全民刚需；HN Show HN BetterWispr 2026-10-12 200 points：本地听写「无账号无云端」差异化；dev.to Whistle 轻量 STT 走红）；Web Speech API SpeechRecognition（Chrome/Edge 中文免费免 key）纯前端实时转写+复制/导出；「录音不出浏览器」对标需上传的 AI 方案；限制：Firefox/Safari 支持差须注明、质量不如 AI 大模型、无说话人分离/总结；赛道被免费 AI 统治，观察为主；88 Path 无重叠 | 小 | P1（观察） |
| 文本敏感信息打码 | 文本身份证/手机号/银行卡号脱敏；未找到强需求信号，运营场景刚需但证据弱 | 小 | P1（观察） |
| Excel 公式中文解释器 | 360doc「Excel 公式机器人」文本指令转公式是 AI 能力、不可做；反向「公式→中文分步解释」纯前端可做：词法拆解+函数中文说明库；证据单薄仅一条，待补强 | 中 | P1（观察） |
| 时区转换器（世界时钟/跨国会议时间换算） | 本轮新晋观察（dev.to 2026-10-13 同帖 4 天前：Time Zone Converter——"40 IANA time zones side by side, with DST handled"；timeanddate/worldtimebuddy/timebie 形态验证；纯前端极小：日期时间+来源/目标时区（Intl API 自动处理夏令时，跨日期+1 天提示）→并排世界时钟+会议时间一键复制分享；中文痛点证据弱（跨国会议/海淘/海外直播受众窄），观察为主；88 Path 无 timezone/时区重叠（timestamp 为 Unix 时间戳不同方向） | 小 | P1（观察） |
| Markdown 表格修复 | 中文全角/emoji 对齐错乱修复；赛道拥挤（tablesgenerator、tableconvert、编辑器插件生态），纯本地免费可差异化 | 小 | P1（末位） |
| 网页电台（随机听全球电台） | 第八轮新晋观察（V2EX 2026-10-16 roamdial：170 回复/204 收藏，网页免安装随机切台、码率≥128/192/320 过滤、语言过滤、歌词跟唱、收藏跳网易云/QQ 音乐/Spotify；电台目录来自 Radio Browser 社区 API 周更+可用性探测）；依赖第三方公共 API，单页可实现但需网络 API、非离线纯本地口径，第三方可用性风险；88 Path 无 radio/电台命中 | 中 | P2（观察·第三方 API 依赖） |
| 自由职业时薪计算器 | 第八轮新晋观察（dev.to「Build in Public #1」2026-10-10：年目标收入/可计费小时→时薪，86,000/1150h=$74.78/h，9/9 测试；仅海外单条证据，中文时薪报价信号未找到） | 小 | P2（观察） |
| 域名可用性批量查询（RDAP 生成器方向） | 本轮新晋观察（dev.to etemora 2026-10-10：关键词→创意域名+12+ 后缀 RDAP 可用性查询，含注册商/年限/到期信息）；ToolWeb domain-check 同方向（RDAP+whois 协议直查，曾因 Muse VM 出网被拦截未完全解决）；RDAP 依赖第三方网络可用性，国内访问稳定性待验证，不单立 | 中 | P2（观察·第三方网络依赖+同方向已有） |
| 证件照换底色 | CSDN+360doc 实测文再确认刚需（微信小程序爆款均靠 AI 服务器抠图）；发丝级抠图需 AI 分割模型（WASM 版数十 MB），不完全符合纯轻量前端口径，等轻量方案 | 中 | P2（观察） |
| SQLite 在线查看器 | dev.to Tooltri 单次提及；sql.js WASM 纯前端可读 .db 文件；开发者小众 | 中 | P2（观察） |
| 手写模拟器 | 360doc 2026-02-14 萝卜工坊；作业/笔记/贺卡趣味场景；canvas+手写体字库纯前端可做 | 小 | P2（观察） |
| 在线文字转语音（Web Speech API） | 维持观察（赛道被 AI 拟真语音统治——Speechify 50 万+五星、AIVocal 600+音色；Web Speech API 系统语音音质参差、不可定制音色，免登录叙事不足以对冲质量差距；证据仍单薄） | 小 | P2（观察） |
| 隐私政策生成器 | 第三轮新晋观察（FreeTopTools 16 工具清单单列「Business」工具；APP/小程序上架商店强制要求隐私政策文本；表单填空→标准模板条款生成，纯前端；证据单条，赛道已有在线生成器玩家） | 小 | P2（观察） |
| 轻断食计时器 | 第四轮新晋观察（HN Show HN "Intermittent Fasting Calculator" 2026-10-07 新鲜：16:8/14:10/18:6/20:4/OMAD 断食窗口规划+24 小时彩色时间轴+文本/图片/PDF 导出；纯前端可做：方法选择+上餐/目标时间输入→时间轴渲染+本地提醒；国内受众小众、健康类与本站工具定位偏离，观察为主；88 Path 无 fast/断食重叠） | 小 | P2（观察） |

**已实现（SERP 搜索结果片段预览本轮划出，全量 88 Path）**：思维导图 → 表格拆分 → 表格合并 → **HEIC 转 JPG（已开发、未可交付——12:30 真机实测失败、生产已回滚，见历史轮次「⚠️ 待修复」）** → 成绩统计分析 → 二手房税费计算器 → 房贷计算器 → PDF 可填写表单制作器（+触屏修复）→ 工资个税计算器（8a6e0cc：七项专项附加扣除+年终奖计税对比，与房贷/二手房税费三向互链成「财务」旅程线）→ 双十一凑单计算器（145e47e+3d02c3c：满减档位自定义+子集和 DP 最小溢出最优组合+「还差 XX 元」提示与候补单品建议，纯前端本地计算）→ 字体版权查询（abe5db0+fd8fc74：canvas 本地字体探测+198 条离线版权库+复制报告，`/tools/font-license-check`）→ **简历预检工具（开发交付：`templates/resume_checker.html`+745 行纯前端规则引擎（技术栈词典 200 词+动作动词库+JD 关键词匹配/ATS 检测/逻辑链检查/雷区清单四模块报告+一键复制），新建「求职工具」品类，`/tools/resume-checker`）** → **在线图表生成器（1c6a9e3+fc135d3：粘贴表格/CSV/Excel 复制行→分隔符自动识别+引号感知解析→柱状/折线/饼/环形四类型自绘 SVG 渲染→1x/2x/3x 高清 PNG 导出，`/tools/chart-generator`）** → **双11到手价计算器（优惠叠加模拟）（2dca60b：商品直降价→店铺券→品类券→跨店满减→会员折扣→红包→以旧换新折价→国补 15%（家电封顶 1500/数码 500/手机 6000 红线）逐层明细+规则提示+平台预设，`/tools/double11-final-price`）** → **GB/T 7714 参考文献格式生成器（acdfccd：[J][M][D][C][N][S][R][P][EB/OL][A] 十种文献类型表单+顺序编码制/著者-出版年制双制式切换+中文「等」/英文「et al」自动处理+多条目累积排序导出，`/tools/gbt7714-reference-generator`）** → **经济补偿金计算器（2eaeeec+2b0b434：入职/离职日期→工龄折算 N→经济补偿金 N/代通知金+1（第 40 条）/违法解除赔偿金 2N+三倍社平封顶/12 年封顶+法条标注+免责声明+一键复制，`/tools/severance-calculator`）** → **AI 文本清洁器（9a0111a+d6d3bb0：零宽/BOM/非断空格/软连字符/变体选择符/方向标记/标签字符扫描计数+可视化标记+一键清除+码点计数口径修复，`/tools/ai-text-cleaner`，与 AI Token 计数器互链成「AI 写作」组合）** → **SERP 搜索结果片段预览（29ccefb：三输入+Google 桌面/移动端结果卡实时渲染+标题 ~600px 像素截断预警标红+描述 155~160 长度条+百度规则对照+一键复制，新建「营销工具」品类，`/tools/serp-snippet-preview`）**；以上均已从候选池划出，历史记录保留于下方各轮次小节。

**归档说明**：本轮为 10-17 通用调研第十轮（WPS 特别方向 10-15 已结束）——SERP 搜索结果片段预览交付闭环（29ccefb，`/tools/serp-snippet-preview` 已注册，全量 88 Path），候选池划出；新晋候选「图片标注工具」P1（dev.to 4 天前新鲜证据：截图箭头/形状/文字批注+PNG/JPEG 导出，Evernote 形态验证，纯前端 canvas，难度小，与图片旅程线互链）、「时区转换器」P1（观察）（dev.to 4 天前同帖：40 IANA 时区并排+DST 自动处理，Intl API 纯前端，中文痛点证据弱）；dev.to「9 free dev utilities」同帖 9 项中 6 项仓库已覆盖（jwt-parser/subnet-calculator/text-diff/cron-parser/timestamp/Base64），不单立；V2EX 10-17 当天均为桌面端/插件/AI/导航形态，无单页可落地新信号；WPS 候选表保持冻结归档；仓库 88 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`git log` 确认开发交付 29ccefb；`grep tools/categories.go` 全量 88 Path，`serp_snippet_preview` ID 与 `/tools/serp-snippet-preview` Path 已注册（划入已实现），新候选建议 ID（image_annotator / timezone_converter）与 88 Path 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-17 18:00 决策轮）

## 今日任务（2026-10-17 18:00 · 产品经理排期决策 ✅）

**交付状态**：✅ 开发已交付（待测试轮+部署轮）。10-17 排期决策轮（17:40 第九轮研究之后）立项→前端开发交付：`templates/serp_snippet_preview.html`（三输入+Google 桌面/移动端结果卡实时渲染+标题 ~600px 像素截断预警标红+描述 155~160 长度条+百度规则对照+一键复制，纯前端）+ `tools/categories.go` 新建「营销工具」品类（ID `marketing`）注册 ID `serp_snippet_preview` / Path `/tools/serp-snippet-preview`（New: true），全量 88 Path；本地构建通过、自测（200/首页/sitemap/JS 逻辑 9 项）通过。AI 文本清洁器已交付闭环（15:45 PM 决策轮立项→开发交付 9a0111a+d6d3bb0，`/tools/ai-text-cleaner` 已注册，全量 87 Path），候选池划出。本轮立项**今日下一任务：SERP 搜索结果片段预览（SEO 标题/描述预览）**。

**选定：SERP 搜索结果片段预览（/tools/serp-snippet-preview）** — 本轮唯一任务：
- **顺位递进**：17:40 第九轮研究轮 Top1（P1 顺位第一），双重证据确认，不再拖延。
- **证据最新**：dev.to etemora 2026-10-10（7 天前）「Show DEV」单列 SERP snippet preview + dev.to Tooltri 11 天前「I Built 30+ Free Browser Tools」列为核心工具，候选池内新鲜度最高。
- **中文差异化明确**：海外工具只做 Google；本工具同时覆盖 Google 桌面/移动端 + 百度展示规则（标题约 30 汉字、描述约 78 汉字），中文自媒体/博主/独立站长刚需。
- **节奏错峰**：今日已交付两个计算器类（双11到手价、经济补偿金）+一个学术表单（GB/T 7714）+一个文本工具（AI 文本清洁器）；SERP 为渲染/预览形态，非计算器连击。
- **难度小可高质量交付**：纯前端三输入→双端结果卡渲染→像素宽度/字符数规则校验，无外部依赖、数据不出浏览器。
- **开辟新方向**：新建「营销工具」品类（前例：字体版权查询立「文字工具」、简历预检立「求职工具」），补齐 SEO/自媒体场景链路；用户本人有 hiking 博客，是天然种子用户。

**规格**：
1. 三输入：标题（text input）、URL（text input）、描述（textarea），实时渲染预览。
2. Google 桌面结果卡渲染（标题蓝链接/面包屑 URL/描述灰字，~600px 宽度布局）+ 移动端结果卡（窄宽度布局）。
3. 标题校验：像素宽度估算（canvas measureText，超出 ~600px 截断预警并标红截断点）+ 字符数显示（英文 ~60 字符建议）。
4. 描述校验：字符数长度条（155~160 字符阈值，超长预警）。
5. 百度规则对照：分别按百度口径给出标题（约 30 汉字）/描述（约 78 汉字）状态提示，与 Google 口径并列显示。
6. 一键复制标题/描述；响应式；纯前端、数据不出浏览器。
7. 注册：`tools/categories.go` 新建「营销工具」品类（ID `marketing`），新增 ID `serp_snippet_preview`、Path `/tools/serp-snippet-preview`（New: true），中英文描述 + SEO keywords（SERP 预览、搜索结果预览、SEO 标题描述检查、百度收录预览）。

**验收标准**：
- [ ] `/tools/serp-snippet-preview` 可开（200）
- [ ] 输入标题/URL/描述 → Google 桌面/移动端结果卡实时渲染正确
- [ ] 超长标题（>600px 像素宽度）→ 截断预警并标红截断点；正常标题无预警
- [ ] 描述超过 160 字符 → 长度条预警；155~160 阈值提示准确
- [ ] 百度口径提示正确（标题约 30 汉字/描述约 78 汉字）
- [ ] 一键复制标题/描述可用（clipboard API+降级方案）
- [ ] 纯前端无后端调用（DevTools Network 抽查）
- [ ] `categories.go` 注册完成（新「营销工具」品类），首页/导航/sitemap 生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/serp_snippet_preview.html`（三输入区+双端结果卡渲染+校验预警区）、`tools/categories.go`（新建「营销工具」品类+注册）、`BACKLOG.md`（本小节）。

**未选**：AA 制费用分摊计算器（P1，Cashinator/SplitPop/App Store 三重形态验证；计算器类，与今日两个计算器节奏冲突，留池作后续节奏调节）；视频抽帧（P1，HN Show HN 新鲜证据+开辟「视频工具」新方向；难度中，一天交付质量风险高，留池，「视频工具」新方向值得更充裕的一轮）；工资条生成器（P1，顺位第四；与今日节奏冲突且 Excel 上传解析面大，留池）；露营用电计算器/乳胶漆用量计算器（本轮新晋，顺位第五/第六；均为计算器类，按顺位留池）；报价单/收据生成器（P1，「票据」组合待金额大写转换器同批，留池）；年会大屏抽奖（P1 时令预热，难度中，留池）；金额大写转换器/在线方格纸/接龙文本统计/极简简历制作器/医学组合等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 87 Path，无 serp/seo/snippet/搜索预览/market/营销命中，ID `serp_snippet_preview`、Path `/tools/serp-snippet-preview` 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-17 17:40 第九轮研究）

## 今日任务（2026-10-17 17:40 · 产品调研员研究轮 ✅）

**交付状态**：10-17 通用调研第九轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研）。AI 文本清洁器已交付闭环（15:45 PM 决策轮立项→开发交付 9a0111a「新增 AI 文本清洁器（隐藏字符扫描清理，纯前端）」+修复 d6d3bb0「码点计数口径修复」；`grep tools/categories.go` 确认 ID `ai_text_cleaner`、Path `/tools/ai-text-cleaner` 已注册，全量 87 Path），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮五件事**（17:40 全网调研，通用方向）：
1. AI 文本清洁器交付确认：`git log` 确认开发交付 9a0111a + 修复 d6d3bb0；`grep tools/categories.go` 确认已注册（全量 87 Path），与候选池无重叠项残留；候选池划出，已实现清单追加。
2. 新晋候选：**SERP 搜索结果片段预览（SEO 标题/描述预览）**。需求证据三重：① dev.to etemora 2026-10-10（7 天前）「Show DEV: free browser tools」：SERP snippet preview——"See how a title and meta description may look in Google results on desktop and mobile before you publish"，免费免注册；② dev.to Tooltri 11 天前「I Built 30+ Free Browser Tools」：SERP preview tool 列为核心工具；③ 中文场景：博主/自媒体/独立站长发文前必看"标题会不会被截断、描述超没超长"，百度与 Google 展示规则不同（百度标题约 30 汉字、描述约 78 汉字），现有海外工具只做 Google，中文差异化空间明确。可行性：纯前端极小——标题/URL/描述三输入→Google 桌面/移动端结果卡实时渲染→标题像素宽度估算（~600px 截断预警）+描述字符数（155~160）长度条→百度展示规则对照提示；无算法复杂度、无外部依赖、数据不出浏览器。去重：87 Path 无 serp/seo/snippet/搜索预览命中（markdown-preview 为内容预览不同方向）。难度小。SEO：SERP 预览、搜索结果预览、SEO 标题描述检查、百度收录预览。建议 ID `serp_snippet_preview`、Path `/tools/serp-snippet-preview`。
3. 新晋候选：**AA 制费用分摊计算器（最少转账结算）**。需求证据四重：① Cashinator（纯网页可试用）：equal/proportional/itemized 三种分摊→"determines the minimal settlements (fewest transfers)"，纯数学无 AI；② SplitPop："works out the fewest payments to settle up"，"Six debts in. Two payments out."——最少转账次数是核心差异化卖点；③ App Store《簡易/分帳》計算機 2026 年更新、5.0 满分：聚餐结账一键分摊+服务费+多笔记录一次加总，完全离线；④ dev.to CapyToolkit 27 天前 45+ 工具集单列 receipt splitter。可行性：纯前端——人员名单+多笔支出录入（付款人/金额/参与人/均摊或按份/服务费分摊）→净余额计算→贪心最少转账结算方案→结算明细一键复制/分享；场景：聚餐、旅游、团建、合租、宿舍。去重：87 Path 无 aa/分摊/账单/bill 命中（call_split 为表格拆分图标名、sheet-split 为 Excel 拆分，方向不同）。难度小。SEO：AA 制计算器、聚餐分摊、账单分摊、旅游费用分摊。建议 ID `aa_bill_splitter`、Path `/tools/aa-bill-splitter`。
4. 无新单页信号侧：① V2EX 2026-10-17 当天 BiliFlow（B 站视频下载/收藏夹归档/直播录制）——桌面端形态，需后端解析+FFmpeg，非单页口径；② 域名生成器（etemora dev.to 同帖：关键词→创意域名+RDAP 查 12+ 后缀可用性）——ToolWeb domain-check 同方向，且 RDAP 依赖第三方网络可用性，不单立，P2 观察；③ 证件照赛道（蚕小豆证件照小程序：AI 抠图+600 余项规格+底色/换装+冲印，2026-09-29 实战文）——赛道被小程序+AI 统治，网页纯排版差异化弱，维持 P2「证件照换底色」观察，不单立；④ 哎呦不错网 10-11 自荐：局域网传文件（需 WebRTC 信令，NAT 穿透不可靠，低优先）、HEIC 转 PNG（ToolWeb heic-convert 已实现）；⑤ 小红书/AI 营销内容（豆包/TabbitAI 浏览器软文）无单页可落地信号。
5. WPS 候选表保持冻结归档（本轮为通用方向）。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **SERP 搜索结果片段预览（SEO 标题/描述预览）** — P1（本轮新晋·顺位第一：dev.to etemora 7 天前+Tooltri 11 天前双重证据；博主/自媒体/独立站长发文前刚需——用户本人就有 hiking 博客，是天然种子用户；纯前端极小：三输入→双端结果卡渲染→像素宽度/字符数规则校验，无外部依赖；百度+Google 双规则中文差异化；87 Path 无重叠）。SEO：SERP 预览、搜索结果预览、SEO 标题描述检查。
2. **AA 制费用分摊计算器（最少转账结算）** — P1（本轮新晋·顺位第二：Cashinator/SplitPop/App Store 分帳 App 三重形态验证；聚餐/旅游/团建/合租高频社交场景；纯前端：多笔支出录入→净余额→贪心最少转账方案→明细复制；与今日已交付的文本/表单工具形态错峰；87 Path 无重叠）。SEO：AA 制计算器、聚餐分摊、账单分摊。
3. **视频抽帧（视频转图片/封面提取）** — P1（顺位递进，第四轮新晋，上轮 Top2 顺延）：HN Show HN "Video Frame Extractor" 证据；自媒体封面截取/视频取帧做素材痛点（手机截图精度差、PR/剪映太重）；纯前端 `<video>`+canvas 抽帧→PNG/JPEG 批量下载；开辟「视频工具」新方向；87 Path 无重叠。难度中。SEO：视频抽帧、视频转图片、视频封面提取。

工资条生成器列顺位第四（P1，第六轮新晋顺延，HR/财务月度刚需，难度小）；露营用电计算器/乳胶漆用量计算器顺位顺延（P1，本轮新晋，难度小）；报价单/收据生成器顺位顺延（P1，「票据」组合）；年会大屏抽奖维持 P1 时令预热（第七轮新晋，11 月前上线吃搜索预热，难度中）；在线方格纸/稿纸生成器/金额大写转换器/接龙文本统计/极简简历制作器等其余候选留池。

**通用候选表**（2026-10-17 第九轮；AI 文本清洁器已实现划出；新晋 SERP 搜索结果片段预览/AA 制费用分摊计算器 P1；全量 87 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| SERP 搜索结果片段预览（SEO 标题/描述预览） | 本轮新晋（dev.to etemora 2026-10-10「Show DEV」：SERP snippet preview，"See how a title and meta description may look in Google results on desktop and mobile before you publish"，免费免注册；dev.to Tooltri 11 天前「I Built 30+ Free Browser Tools」列为核心工具；中文场景：博主/自媒体/独立站长发文前必看标题截断与描述超长，百度标题约 30 汉字/描述约 78 汉字与 Google 规则不同，海外工具只做 Google 有中文差异化空间）；纯前端极小：标题/URL/描述三输入→Google 桌面/移动端结果卡实时渲染→标题像素宽度估算（~600px 截断预警）+描述 155~160 字符长度条→百度展示规则对照提示；无外部依赖、数据不出浏览器；87 Path 无 serp/seo/snippet/搜索预览命中 | 小 | P1（本轮新晋·顺位第一） |
| AA 制费用分摊计算器（最少转账结算） | 本轮新晋（Cashinator 纯网页可试用：equal/proportional/itemized 三种分摊→"minimal settlements (fewest transfers)" 纯数学无 AI；SplitPop："works out the fewest payments to settle up"，"Six debts in. Two payments out."；App Store《簡易/分帳》計算機 2026 更新 5.0 满分：聚餐一键分摊+服务费+多笔加总完全离线；dev.to CapyToolkit 27 天前 45+ 工具集单列 receipt splitter）；纯前端：人员名单+多笔支出录入（付款人/金额/参与人/均摊或按份/服务费分摊）→净余额→贪心最少转账结算方案→明细一键复制/分享；场景：聚餐/旅游/团建/合租/宿舍；87 Path 无 aa/分摊/账单/bill 命中 | 小 | P1（本轮新晋·顺位第二） |
| 视频抽帧（视频转图片/封面提取） | 第四轮新晋（HN Show HN "Video Frame Extractor" 2026-10-07：浏览器上传视频、指定间隔自动抽帧下载，免安装；自媒体做视频封面/缩略图、从视频取某一帧做素材，手机截图精度差、PR/剪映等桌面软件太重）；纯前端 `<video>`+canvas 抽帧→PNG/JPEG 批量下载（间隔秒数/手动打点/缩略图预览勾选），零依赖、文件不出浏览器；开辟「视频工具」新方向；87 Path 无 video/视频/抽帧重叠 | 中 | P1（顺位递进） |
| 工资条生成器（HR 工资表→每人工资条） | 第六轮新晋（360doc 2025-12-10 财务 Python 实战：150 人公司工资条「打印-裁剪-装袋 3 小时→一键生成 2 分钟」，50 人传统流程 9 小时；360doc 2025-12-14 HR 20 函数：「工资条：VLOOKUP 批量生成，几百人的工资条分分钟搞定」列为发钱大事；Etsy 付费模板+YouTube Payroll 教程形态验证）；纯前端：上传工资表 Excel（SheetJS 在栈）→逐员工工资条卡片（表头项+金额+签名栏）→浏览器打印/PDF 导出（一页多条）+单表 xlsx 导出；「工资数据不出浏览器」隐私叙事；与工资个税计算器互链成「HR 财务」组合；87 Path 无工资条/payslip 重叠 | 小 | P1（顺位第四） |
| 露营用电计算器（户外电源选购） | 第八轮新晋（新浪新闻 2026-10-17「房车露营需要准备哪些物品」：短途 1~3 天「携带≥2 度电的户外电源」，选购要点「容量 1000Wh 以上、纯正弦波输出」，「买多大」为选购最大困惑；hjaiot 中文实战「户外储能电源一般容量多大」：列需求清单公式（笔记本 60W×4h=240Wh、车载冰箱 40W×12h=480Wh、照明 200Wh，相加+30% 冗余）；dev.to 71 天前 Camp Power Calc 形态验证）；纯前端：设备清单（预设功率+自定义）+使用时长→总 Wh→逆变损耗 10~20%→推荐容量档位（300~600/600~1000/1000~2000/2000Wh+）+太阳能板建议；时令：秋季露营季+国庆刚过；87 Path 无 camp/露营/户外电源命中 | 小 | P1（顺位顺延） |
| 乳胶漆用量计算器 | 第八轮新晋（svipapi.com 2026-09-17 中文实战「装修要买多少瓷砖和乳胶漆：用量公式」：涂刷面积=顶面+四面墙−门窗洞、两遍施工、每升一遍涂布约 12㎡、加 8% 损耗、按桶取整，「门窗洞漏扣/深色多刷一遍/只算墙忘了顶」三处常见算错；dev.to 71 天前 Room Paint Calculator 形态验证；cypaint 覆盖率数据 10~12㎡/L/遍）；纯前端：房间长宽高+门窗数量→涂刷面积→遍数/涂布率/损耗→升数+按桶（18L/5L）取整建议；87 Path 无 paint/油漆/乳胶命中 | 小 | P1（顺位顺延） |
| 报价单/收据生成器 | 第七轮新晋（Medium 2026-09-19「15 Free Online Tools Everyone Should Bookmark」：Invoice Generator 列为必备收藏；海外 zoho/signNow/Jotform 多为模板下载或付费 SaaS，「纯在线免注册、填表单→打印/PDF」有差异化空间；中文自由职业者/个体户/小商家开票收据刚需，用户本人玻璃店老板实战场景）；纯前端：客户/供方信息+项目明细行自动算金额→A4 预览→打印/PDF 导出（沿简历制作器打印路线）；金额大写自动转换，与金额大写转换器互链成「票据」组合；87 Path 无 quotation/invoice/报价单/收据命中 | 小 | P1（顺位顺延） |
| 年会大屏抽奖 | 第七轮新晋（质速导航 2026-10-04 收录 365Lab活动屏幕：年会团建大屏互动纯前端一个网页搞定，13 天前新鲜中文证据；海外 wheelofnames.io/spinthelist/funraise Raffle Wheel 形态验证；时令：距 12-1 月年会季 1.5~2 个月，现在上线吃预热搜索）；纯前端：名单粘贴导入→转盘/滚动抽奖动画（canvas）→多轮次+中奖者自动移出→中奖名单导出→全屏大屏模式；数据不出浏览器；87 Path 无 lottery/raffle/抽奖命中 | 中 | P1（时令预热） |
| 在线方格纸/稿纸生成器（打印模板） | 第四轮新晋（HN Show HN 2026-10-16 方格纸生成器：免登录、无水印、真实比例打印，纯前端；360doc 2025-12-10 打印字帖网站：米字格/田字格/九宫格/康奈尔笔记/点阵纸/作文稿纸，家长打印字帖、学生备稿纸刚需）；SVG/Canvas 渲染模板+参数（格子大小/线条颜色/纸张 A4·A5）+浏览器打印/PDF 导出；田字格/米字格/作文稿纸/拼音格中文差异化 vs Gridzzly/Paper Me；87 Path 无重叠 | 小 | P1 |
| 金额大写转换器 | 第六轮新晋（实名需求：阿拉伯数字转人民币大写，起诉状/和解协议/收据必备；新浪科技 WPS 人民币大小写教程：用户靠 WPS/Excel 单元格格式转换，在线免费替代错位；360doc「X 元大写怎么写」问答+GitHub fastquotes 金额转汉字库）；纯前端极小：输入→人民币大写+一键复制；与报价单/收据生成器互链成「票据」组合；87 Path 无大写/金额大写命中 | 小 | P1（节奏调节位） |
| 接龙文本统计（粘贴群接龙→解析汇总） | 第四轮新晋（sohu 2026-08-25「微信接龙怎么导出打卡记录」：班长「对着几百条群消息熬夜对账」；163 2026「微信接龙总漏统计？」：刷屏混在聊天记录里看不清、序号重复、事后逐条复制整理；sohu 2026-08-28 一起报数种草文：小程序导出 Excel 要开会员、广告多）；差异化「事后整理」vs 发起式小程序：粘贴混乱文本→规则引擎解析→去重/人数汇总→「谁没接龙」对比→CSV 导出；纯前端、数据不出浏览器；87 Path 无接龙重叠 | 中 | P1 |
| 极简简历制作器 | V2EX t/1210967 xukz.cn「Word 改简历调字间距打印格式崩溃」；CSDN IT 简历模板榜 Word 排版难痛点；360doc 2025-12-31 简历制作神器高频痛点；秋招季时令；结构化填写→A4 所见即所得预览→浏览器打印/PDF 导出，localStorage 免注册免上传，「简历不出浏览器」差异化叙事；87 Path 无 resume/简历重叠 | 中 | P1 |
| 课程表生成器 | 第三轮升级（CSDN 2026-01「数字化课程表」：Word/Excel 手工绘制耗时、调课改版易混乱、排版单调；360doc 2025-12-10 教师五大难题列排课为核心难题）；可行范围：个人/班级课程表拖拽填课+简易撞课提示+配色模板+打印/PDF 导出（不做全校智能排课算法）；纯前端；87 Path 无重叠 | 中 | P1 |
| 图片裁剪（比例预设+拖拽裁剪框） | pixoate 预设比例 1:1/16:9/4:5+拖拽框实时预览+手机触屏；splitanimage 本地免上传图片套件；YouTube TemplateMaker.in 考试/求职/政府表单照片高频；与 img-resize（指定宽高数值裁剪）差异化明确无重叠；图片旅程线缺环补齐；canvas 纯前端本地免上传 | 小 | P1（节奏调节位） |
| 工作日计算器（含法定节假日/调休） | V2EX PriTime「法定节假日/调休补班重复，国内用户刚需」；yize/chinese-workday 2011-2026 数据+浏览器 CDN；Excel NETWORKDAYS 手工维护节假日痛点；起止日期→工作日天数+单日「要上班吗」查询；与 /tools/calendar（仅展示）无重叠；难度中（年份数据表需年更） | 中 | P1 |
| 图片拼图（网格模板拼图） | 360doc 2026-01-30 四选一首位；Photo Collage Maker 形态：多张图合成一格、网格/异形模板、自定义布局、文字/贴纸；与 nine-grid（九宫格切图）方向相反无重叠；与 img-stitch（一维长图拼接）形态不同；canvas 纯前端本地免上传 | 小 | P1 |
| 屏幕录制（在线录屏） | 360doc 2026-01-30 宝藏站单列推荐；网易测评三大痛点：免费导出带水印、桌面软件要安装、公司电脑禁装软件只能用网页方案；100% 纯前端（getDisplayMedia+MediaRecorder→webm），免安装无水印文件不出本机；桌面端优先 | 中 | P1（通用顶位备选） |
| cURL 转代码 | 开发者刚需（HN 讨论 + curlconverter 开源库 27+ 语言）；赛道已有成熟免费玩家，垂直小众 | 小 | P1 |
| 浏览器实时听写（麦克风语音转文字） | 第三轮新晋观察（CSDN 会议测评：73% 职场人遇到转写痛点；360doc 2025-12-21 腾讯元宝不限时长免费掀桌子反证全民刚需；HN Show HN BetterWispr 2026-10-12 200 points：本地听写「无账号无云端」差异化；dev.to Whistle 轻量 STT 走红）；Web Speech API SpeechRecognition（Chrome/Edge 中文免费免 key）纯前端实时转写+复制/导出；「录音不出浏览器」对标需上传的 AI 方案；限制：Firefox/Safari 支持差须注明、质量不如 AI 大模型、无说话人分离/总结；赛道被免费 AI 统治，观察为主；87 Path 无重叠 | 小 | P1（观察） |
| 文本敏感信息打码 | 文本身份证/手机号/银行卡号脱敏；未找到强需求信号，运营场景刚需但证据弱 | 小 | P1（观察） |
| Excel 公式中文解释器 | 360doc「Excel 公式机器人」文本指令转公式是 AI 能力、不可做；反向「公式→中文分步解释」纯前端可做：词法拆解+函数中文说明库；证据单薄仅一条，待补强 | 中 | P1（观察） |
| Markdown 表格修复 | 中文全角/emoji 对齐错乱修复；赛道拥挤（tablesgenerator、tableconvert、编辑器插件生态），纯本地免费可差异化 | 小 | P1（末位） |
| 网页电台（随机听全球电台） | 第八轮新晋观察（V2EX 2026-10-16 roamdial：170 回复/204 收藏，网页免安装随机切台、码率≥128/192/320 过滤、语言过滤、歌词跟唱、收藏跳网易云/QQ 音乐/Spotify；电台目录来自 Radio Browser 社区 API 周更+可用性探测）；依赖第三方公共 API，单页可实现但需网络 API、非离线纯本地口径，第三方可用性风险；87 Path 无 radio/电台命中 | 中 | P2（观察·第三方 API 依赖） |
| 自由职业时薪计算器 | 第八轮新晋观察（dev.to「Build in Public #1」2026-10-10：年目标收入/可计费小时→时薪，86,000/1150h=$74.78/h，9/9 测试；仅海外单条证据，中文时薪报价信号未找到） | 小 | P2（观察） |
| 域名可用性批量查询（RDAP 生成器方向） | 本轮新晋观察（dev.to etemora 2026-10-10：关键词→创意域名+12+ 后缀 RDAP 可用性查询，含注册商/年限/到期信息）；ToolWeb domain-check 同方向（RDAP+whois 协议直查，曾因 Muse VM 出网被拦截未完全解决）；RDAP 依赖第三方网络可用性，国内访问稳定性待验证，不单立 | 中 | P2（观察·第三方网络依赖+同方向已有） |
| 证件照换底色 | CSDN+360doc 实测文再确认刚需（微信小程序爆款均靠 AI 服务器抠图）；发丝级抠图需 AI 分割模型（WASM 版数十 MB），不完全符合纯轻量前端口径，等轻量方案 | 中 | P2（观察） |
| SQLite 在线查看器 | dev.to Tooltri 单次提及；sql.js WASM 纯前端可读 .db 文件；开发者小众 | 中 | P2（观察） |
| 手写模拟器 | 360doc 2026-02-14 萝卜工坊；作业/笔记/贺卡趣味场景；canvas+手写体字库纯前端可做 | 小 | P2（观察） |
| 在线文字转语音（Web Speech API） | 维持观察（赛道被 AI 拟真语音统治——Speechify 50 万+五星、AIVocal 600+音色；Web Speech API 系统语音音质参差、不可定制音色，免登录叙事不足以对冲质量差距；证据仍单薄） | 小 | P2（观察） |
| 隐私政策生成器 | 第三轮新晋观察（FreeTopTools 16 工具清单单列「Business」工具；APP/小程序上架商店强制要求隐私政策文本；表单填空→标准模板条款生成，纯前端；证据单条，赛道已有在线生成器玩家） | 小 | P2（观察） |
| 轻断食计时器 | 第四轮新晋观察（HN Show HN "Intermittent Fasting Calculator" 2026-10-07 新鲜：16:8/14:10/18:6/20:4/OMAD 断食窗口规划+24 小时彩色时间轴+文本/图片/PDF 导出；纯前端可做：方法选择+上餐/目标时间输入→时间轴渲染+本地提醒；国内受众小众、健康类与本站工具定位偏离，观察为主；87 Path 无 fast/断食重叠） | 小 | P2（观察） |

**已实现（AI 文本清洁器本轮划出，全量 87 Path）**：思维导图 → 表格拆分 → 表格合并 → **HEIC 转 JPG（已开发、未可交付——12:30 真机实测失败、生产已回滚，见历史轮次「⚠️ 待修复」）** → 成绩统计分析 → 二手房税费计算器 → 房贷计算器 → PDF 可填写表单制作器（+触屏修复）→ 工资个税计算器（8a6e0cc：七项专项附加扣除+年终奖计税对比，与房贷/二手房税费三向互链成「财务」旅程线）→ 双十一凑单计算器（145e47e+3d02c3c：满减档位自定义+子集和 DP 最小溢出最优组合+「还差 XX 元」提示与候补单品建议，纯前端本地计算）→ 字体版权查询（abe5db0+fd8fc74：canvas 本地字体探测+198 条离线版权库+复制报告，`/tools/font-license-check`）→ **简历预检工具（开发交付：`templates/resume_checker.html`+745 行纯前端规则引擎（技术栈词典 200 词+动作动词库+JD 关键词匹配/ATS 检测/逻辑链检查/雷区清单四模块报告+一键复制），新建「求职工具」品类，`/tools/resume-checker`）** → **在线图表生成器（1c6a9e3+fc135d3：粘贴表格/CSV/Excel 复制行→分隔符自动识别+引号感知解析→柱状/折线/饼/环形四类型自绘 SVG 渲染→1x/2x/3x 高清 PNG 导出，`/tools/chart-generator`）** → **双11到手价计算器（优惠叠加模拟）（2dca60b：商品直降价→店铺券→品类券→跨店满减→会员折扣→红包→以旧换新折价→国补 15%（家电封顶 1500/数码 500/手机 6000 红线）逐层明细+规则提示+平台预设，`/tools/double11-final-price`）** → **GB/T 7714 参考文献格式生成器（acdfccd：[J][M][D][C][N][S][R][P][EB/OL][A] 十种文献类型表单+顺序编码制/著者-出版年制双制式切换+中文「等」/英文「et al」自动处理+多条目累积排序导出，`/tools/gbt7714-reference-generator`）** → **经济补偿金计算器（2eaeeec+2b0b434：入职/离职日期→工龄折算 N→经济补偿金 N/代通知金+1（第 40 条）/违法解除赔偿金 2N+三倍社平封顶/12 年封顶+法条标注+免责声明+一键复制，`/tools/severance-calculator`）** → **AI 文本清洁器（9a0111a+d6d3bb0：零宽/BOM/非断空格/软连字符/变体选择符/方向标记/标签字符扫描计数+可视化标记+一键清除+码点计数口径修复，`/tools/ai-text-cleaner`，与 AI Token 计数器互链成「AI 写作」组合）**；以上均已从候选池划出，历史记录保留于下方各轮次小节。

**归档说明**：本轮为 10-17 通用调研第九轮（WPS 特别方向 10-15 已结束）——AI 文本清洁器交付闭环（9a0111a+d6d3bb0，`/tools/ai-text-cleaner` 已注册，全量 87 Path），候选池划出；新晋候选「SERP 搜索结果片段预览」P1（dev.to etemora 2026-10-10 7 天前+Tooltri 11 天前双重证据，博主/自媒体发文前刚需，百度+Google 双规则中文差异化，难度小）、「AA 制费用分摊计算器」P1（Cashinator/SplitPop/App Store 分帳 App 三重形态验证，最少转账结算为核心差异化，难度小）；域名生成器（RDAP 方向）因同方向 domain-check 已有+第三方网络依赖进 P2 观察；V2EX 当天 BiliFlow 为桌面端形态、证件照赛道被小程序+AI 统治、局域网传文件需 WebRTC 信令，均不单立；WPS 候选表保持冻结归档；仓库 87 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`git log` 确认开发交付 9a0111a+d6d3bb0；`grep tools/categories.go` 全量 87 Path，`ai_text_cleaner` ID 与 `/tools/ai-text-cleaner` Path 已注册（划入已实现），新候选建议 ID（serp_snippet_preview / aa_bill_splitter）与 87 Path 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-17 15:45 决策轮）

## 今日任务（2026-10-17 15:45 · 产品经理排期决策 ✅）

**交付状态**：10-17 排期决策轮（15:30 第八轮研究之后）。经济补偿金计算器已交付闭环（2eaeeec+2b0b434，`/tools/severance-calculator` 已注册，全量 86 Path），候选池划出。本轮立项**今日唯一任务：AI 文本清洁器（隐藏字符清理）**。

**选定：AI 文本清洁器（隐藏字符清理）（/tools/ai-text-cleaner）** — 今日唯一任务：
- **顺位递进**：15:30 第八轮研究轮以 Top1（顺位第一）推荐，双重证据确认，不再拖延。
- **证据最新最密**：近 1 个月三个独立站点同方向落地（removeaitells.com 2026-09-28、textninja.shinobitools.com 2026-09-23、privacyzip.com 2026-10-04）+Chrome 插件 PlainTextify 同需求+dev.to Tooltri 将其列为核心工具，五重证据，候选池内新鲜度最高。
- **节奏错峰**：今日已交付两个计算器类（双11到手价、经济补偿金）+一个学术表单工具（GB/T 7714）；文本清洁器为纯文本处理形态，切换不单调，避免"计算器连击"。
- **难度极小可高质量交付**：纯前端扫描计数+可视化标记→一键清除→复制，无算法复杂度、无外部依赖；剩余轮次时间充裕，可作节奏调节位。
- **组合成型**：与 AI Token 计数器（「AI 工具」品类已注册）双向互链成「AI 写作」组合（写完→清杂质→算 token/费用），补齐 AI 写作场景链路。

**规格**：
1. 输入区：textarea 粘贴/输入文本；实时字数统计显示。
2. 扫描引擎（纯前端）：零宽字符 \u200B-\u200F、BOM \uFEFF、非断空格 \u00A0、软连字符 \u00AD、变体选择符 \uFE00-\uFE0F、方向标记（LRM/RLM/LRE/RLE/PDF）、标签字符 \uE0000-\uE0FFF；逐类计数展示。
3. 可视化标记：发现的不可见字符以高亮背景+符号标记（如零宽空格标 `␣`）显示在预览区，可逐个定位；无杂质时给出「未发现隐藏字符」友好提示。
4. 一键清除：清除全部不可见字符，输出干净文本；显示清除前后字符数对比（清除了 N 个隐藏字符）。
5. 一键复制干净文本；保留「再清一次/重新粘贴」便捷入口；响应式；纯前端、数据不出浏览器。
6. 诚实声明（沿 textninja 证据口径）：页面显著位置注明「仅清除不可见字符，不改写词句、不触碰统计水印」。
7. 注册：`tools/categories.go`「AI 工具」品类新增 ID `ai_text_cleaner`、Path `/tools/ai-text-cleaner`（New: true），中英文描述 + SEO keywords（AI 文本清理、去除隐藏字符、零宽字符清理、AI 文本去水印）；页面底部「相关工具」与 AI Token 计数器双向互链（「AI 写作」组合）。

**验收标准**：
- [ ] `/tools/ai-text-cleaner` 可开（200）
- [ ] 粘贴含零宽空格（​）/非断空格/软连字符的测试文本 → 扫描计数逐类正确（如零宽空格 ×3）
- [ ] 可视化标记正确高亮所有不可见字符位置
- [ ] 一键清除 → 输出文本不含任何不可见字符（逐码点校验），字符数对比正确
- [ ] 纯净文本粘贴 → 提示「未发现隐藏字符」，清除/复制不报错
- [ ] 一键复制功能可用（clipboard API+降级方案）
- [ ] 诚实声明文案存在（不改写词句、不碰统计水印）
- [ ] 纯前端无后端调用（DevTools Network 抽查）
- [ ] `categories.go` 注册完成（「AI 工具」品类），首页/导航/sitemap 生效；与 AI Token 计数器互链生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/ai_text_cleaner.html`（输入区+扫描结果可视化+清除/复制操作区）、`tools/categories.go`（「AI 工具」品类注册）、`BACKLOG.md`（本小节）。

**未选**：视频抽帧（P1，HN Show HN 新鲜证据+开辟「视频工具」新方向；难度中，一天交付质量风险高，13:40 已明确留池，「视频工具」新方向值得更充裕的一轮）；工资条生成器（P1，HR/财务月度刚需+SheetJS 在栈；今日已有两个计算器类交付，再做财务方向形态单调，且 Excel 上传解析面更大，留池作后续节奏调节）；露营用电计算器/乳胶漆用量计算器（本轮新晋，顺位第四/第五，按顺位留池；且均为计算器类，与今日节奏冲突）；报价单/收据生成器（P1，「票据」组合待金额大写转换器同批，留池）；年会大屏抽奖（P1 时令预热，距年会季 1.5 个月、预热不急于今日，难度中，留池）；金额大写转换器/在线方格纸/接龙文本统计/极简简历制作器/医学组合等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 86 Path，无 clean/清洁/隐藏字符命中，ID `ai_text_cleaner`、Path `/tools/ai-text-cleaner` 无重叠；`ai_token_counter` 已注册（「AI 工具」品类）可互链；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品调研员 · 每日更新（2026-10-17 15:30 第八轮研究）

## 今日任务（2026-10-17 15:30 · 产品调研员研究轮 ✅）

**交付状态**：10-17 通用调研第八轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研）。经济补偿金/赔偿金计算器已交付闭环（13:40 PM 决策轮立项→开发交付 2eaeeec「新增经济补偿金/赔偿金计算器（N/N+1/2N，纯前端）」+修复 2b0b434；`grep tools/categories.go` 确认 ID `severance_calculator`、Path `/tools/severance-calculator` 已注册，全量 86 Path），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮六件事**（15:30 全网调研，通用方向）：
1. 经济补偿金计算器交付确认：`git log` 确认开发交付 2eaeeec + 修复 2b0b434；`grep tools/categories.go` 确认已注册（全量 86 Path），与候选池无重叠项残留；候选池划出，已实现清单追加。
2. 新晋候选：**AI 文本清洁器（隐藏字符清理）**。需求证据五重：① removeaitells.com 2026-09-28 更新「Remove Hidden Characters From AI Text」：粘贴 ChatGPT/Claude/Gemini 文本→扫描零宽/非断空格→一键清除，免费、无注册、浏览器内运行；② textninja.shinobitools.com 2026-09-23「AI Text Remover」：字符级清理（零宽空格/连接符、Unicode 标签字符、方向标记、变体选择符、BOM、软连字符、异形空格），诚实声明"不改写词句、不碰 SynthID 统计水印"；③ privacyzip.com 2026-10-04「AI text cleaner and Scrubber」：九项独立清洗开关（隐藏字符/非断空格/破折号归一/引号拉直/省略号/行尾空格/markdown 符号/形近字符替换），独立产品形态验证；④ Chrome 插件 PlainTextify：AI 文本→纯文本清理同需求，插件形态侧证高频；⑤ dev.to Tooltri 9 天前「I Built 30+ Free Browser Tools」：ChatGPT Text Cleaner 列为核心工具，"removes hidden characters and formatting leftovers"。可行性：纯前端极小——粘贴文本→不可见字符扫描计数+可视化高亮标记→一键清除（零宽\u200B-\u200F\uFEFF、\u00A0、\u00AD 等）+复制；与 AI Token 计数器互链成「AI 写作」组合；可作节奏调节位。去重：86 Path 无 clean/清洁/隐藏字符命中（ai_token_counter 为计数方向不同）。难度小。SEO：AI 文本清理、去除隐藏字符、零宽字符清理、文本去水印。建议 ID `ai_text_cleaner`、Path `/tools/ai-text-cleaner`。
3. 新晋候选：**露营用电计算器（户外电源选购）**。需求证据三重：① 新浪新闻 2026-10-17 当天「房车露营需要准备哪些物品」：短途 1~3 天"携带≥2 度电的户外电源"，选购要点"容量 1000Wh 以上、纯正弦波输出"——"买多大"是选购最大困惑；② hjaiot 中文实战「户外储能电源一般容量多大」："列一张表：笔记本 60W×4h=240Wh、车载冰箱 40W×12h=480Wh、照明 200Wh，相加后再加 30% 冗余"——需求清单公式完整；③ dev.to「I shipped 8 small web tools」71 天前 Camp Power Calc 形态验证（输入设备→总功率→电池容量+太阳能板建议）。可行性：纯前端——设备清单（手机/灯/笔记本/车载冰箱/电煮锅/无人机等预设功率+自定义）+使用时长→总 Wh→逆变损耗 10~20%→推荐容量档位（300~600/600~1000/1000~2000/2000Wh+）+太阳能板建议；时令：秋季露营季+国庆刚过。去重：86 Path 无 camp/露营/户外电源命中。难度小。SEO：露营用电计算、户外电源选多大、户外电源容量。建议 ID `camp_power_calculator`、Path `/tools/camping-power-calculator`。
4. 新晋候选：**乳胶漆用量计算器**。需求证据三重：① svipapi.com 2026-09-17 中文实战「装修要买多少瓷砖和乳胶漆：用量公式」：涂刷面积=顶面+四面墙−门窗洞、两遍施工、每升一遍涂布约 12㎡、加 8% 损耗、按桶取整，并列"门窗洞漏扣/深色多刷一遍/只算墙忘了顶"三处常见算错——公式完整可直接转规则引擎；② dev.to 71 天前 Room Paint Calculator 形态验证（房间尺寸+门窗→升数+费用估算）；③ cypaint 覆盖率数据（乳胶漆 10~12㎡/L/遍、损耗 10~15%）+ Angi 2026-07 更新（1 加仑约 400 平方英尺/遍、两遍常规）。可行性：纯前端——房间长宽高+门窗数量→涂刷面积→遍数/涂布率/损耗→升数+按桶（18L/5L）取整建议。去重：86 Path 无 paint/油漆/乳胶命中。难度小。SEO：乳胶漆用量计算、油漆买多少、一桶漆刷多少平方。建议 ID `paint_calculator`、Path `/tools/paint-calculator`。
5. 无新单页信号侧：① V2EX 2026-10-16 roamdial 网页电台（170 回复/204 收藏：免安装随机切台、码率/语言过滤、歌词跟唱）——形态好但依赖 Radio Browser 公共免费 API（周更电台目录+可用性探测），第三方 API 可靠性风险，进 P2 观察，不在纯本地口径内单立；② dev.to「Build in Public #1」自由职业时薪计算器（年目标收入/可计费小时→时薪，86,000/1150h=$74.78/h）——证据仅海外单条，中文时薪报价信号未找到，进 P2 观察；③ 智汇资源库 9 月 PicLite 图轻「图片压缩至指定大小」——池内图片压缩工具已实现，归增强清单（第六轮已归入增强清单，本轮重申不单立项）；④ V2EX vaneform 流量榜单/API（需 similarweb/dataforseo 后端数据管线）、hn Show HN 10-15 榜单（Tiny Little Office 浏览器办公套件为全套形态非单页）——均不符合单页纯前端口径；⑤ 小众软件 10-12 Edge 插件三款（标签页整理/AI 提示词提取/工作区保存）——浏览器插件形态，非单页网页。
6. WPS 候选表保持冻结归档（本轮为通用方向）。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **AI 文本清洁器（隐藏字符清理）** — P1（本轮新晋·顺位第一：五重证据，近 1 个月内三个独立网站同方向落地+插件形态+开发者工具集列为核心工具；AI 时代高频刚需——从 ChatGPT/Claude/Gemini/DeepSeek 复制文本带零宽/非断空格杂质，粘贴到 CMS/微信/简历/代码处格式错乱；纯前端极小：扫描计数+可视化标记→一键清除→复制，难度极小可作节奏调节位；与 AI Token 计数器互链成「AI 写作」组合；86 Path 无重叠）。SEO：AI 文本清理、去除隐藏字符、零宽字符、文本去水印。
2. **视频抽帧（视频转图片/封面提取）** — P1（顺位递进，第四轮新晋）：HN Show HN "Video Frame Extractor" 证据；自媒体封面截取/视频取帧做素材痛点（手机截图精度差、PR/剪映太重）；纯前端 `<video>`+canvas 抽帧→PNG/JPEG 批量下载；开辟「视频工具」新方向；86 Path 无重叠。难度中。SEO：视频抽帧、视频转图片、视频封面提取。
3. **工资条生成器（HR 工资表→每人工资条）** — P1（顺位递进，第六轮新晋）：360doc 双重实战证据（150 人工资条 3 小时→2 分钟）+Etsy/YouTube 形态验证，HR/财务月度刚需；纯前端：上传工资表 Excel（SheetJS 在栈）→逐员工工资条卡片→打印/PDF+单表 xlsx 导出；「工资数据不出浏览器」隐私叙事；与工资个税计算器成「HR 财务」组合。难度小。

露营用电计算器列顺位第四（P1，本轮新晋：新浪新闻 2026-10-17 当天房车露营电源清单+hjaiot 中文实战公式文+dev.to Camp Power Calc 形态验证，秋季露营季时令，难度小）；乳胶漆用量计算器列顺位第五（P1，本轮新晋：svipapi 2026-09-17 中文用量公式实战文+dev.to Room Paint Calc 形态验证，装修高频，难度小）；报价单/收据生成器顺位第六（P1，第七轮新晋顺延，与金额大写转换器互链成「票据」组合）；年会大屏抽奖维持 P1 时令预热（第七轮新晋，11 月前上线吃搜索预热，难度中）；在线方格纸/稿纸生成器顺位顺延；金额大写转换器维持 P1 节奏调节位（票据组合）；在线方格纸/接龙文本统计/极简简历制作器/课程表/医学组合/屏幕录制等其余候选留池。

**通用候选表**（2026-10-17 第八轮；经济补偿金计算器已实现划出；新晋 AI 文本清洁器/露营用电计算器/乳胶漆用量计算器 P1、网页电台/自由职业时薪计算器 P2（观察）；全量 86 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| AI 文本清洁器（隐藏字符清理） | 本轮新晋（removeaitells.com 2026-09-28「Remove Hidden Characters From AI Text」：粘贴 ChatGPT/Claude/Gemini 文本→扫描零宽/非断空格→一键清除，免费无注册浏览器内运行；textninja.shinobitools.com 2026-09-23「AI Text Remover」：字符级清理+诚实声明不改写词句；privacyzip.com 2026-10-04 九项清洗开关独立产品形态；Chrome 插件 PlainTextify 同需求；dev.to Tooltri 9 天前把 ChatGPT Text Cleaner 列为核心工具）；纯前端极小：粘贴文本→不可见字符扫描计数+可视化标记→一键清除+复制；与 AI Token 计数器互链成「AI 写作」组合；86 Path 无重叠 | 小 | P1（本轮新晋·顺位第一） |
| 视频抽帧（视频转图片/封面提取） | 第四轮新晋（HN Show HN "Video Frame Extractor" 2026-10-07：浏览器上传视频、指定间隔自动抽帧下载，免安装；自媒体做视频封面/缩略图、从视频取某一帧做素材，手机截图精度差、PR/剪映等桌面软件太重）；纯前端 `<video>`+canvas 抽帧→PNG/JPEG 批量下载（间隔秒数/手动打点/缩略图预览勾选），零依赖、文件不出浏览器；开辟「视频工具」新方向；86 Path 无 video/视频/抽帧重叠 | 中 | P1（顺位递进） |
| 工资条生成器（HR 工资表→每人工资条） | 第六轮新晋（360doc 2025-12-10 财务 Python 实战：150 人公司工资条「打印-裁剪-装袋 3 小时→一键生成 2 分钟」，50 人传统流程 9 小时；360doc 2025-12-14 HR 20 函数：「工资条：VLOOKUP 批量生成，几百人的工资条分分钟搞定」列为发钱大事；Etsy 付费模板+YouTube Payroll 教程形态验证）；纯前端：上传工资表 Excel（SheetJS 在栈）→逐员工工资条卡片（表头项+金额+签名栏）→浏览器打印/PDF 导出（一页多条）+单表 xlsx 导出；「工资数据不出浏览器」隐私叙事；与工资个税计算器互链成「HR 财务」组合；86 Path 无工资条/payslip 重叠 | 小 | P1（顺位递进） |
| 露营用电计算器（户外电源选购） | 本轮新晋（新浪新闻 2026-10-17 当天「房车露营需要准备哪些物品」：短途 1~3 天「携带≥2 度电的户外电源」，选购要点「容量 1000Wh 以上、纯正弦波输出」，「买多大」为选购最大困惑；hjaiot 中文实战「户外储能电源一般容量多大」：列需求清单公式（笔记本 60W×4h=240Wh、车载冰箱 40W×12h=480Wh、照明 200Wh，相加+30% 冗余）；dev.to 71 天前 Camp Power Calc 形态验证）；纯前端：设备清单（预设功率+自定义）+使用时长→总 Wh→逆变损耗 10~20%→推荐容量档位（300~600/600~1000/1000~2000/2000Wh+）+太阳能板建议；时令：秋季露营季+国庆刚过；86 Path 无 camp/露营/户外电源命中 | 小 | P1（本轮新晋·顺位第四） |
| 乳胶漆用量计算器 | 本轮新晋（svipapi.com 2026-09-17 中文实战「装修要买多少瓷砖和乳胶漆：用量公式」：涂刷面积=顶面+四面墙−门窗洞、两遍施工、每升一遍涂布约 12㎡、加 8% 损耗、按桶取整，「门窗洞漏扣/深色多刷一遍/只算墙忘了顶」三处常见算错；dev.to 71 天前 Room Paint Calculator 形态验证；cypaint 覆盖率数据 10~12㎡/L/遍）；纯前端：房间长宽高+门窗数量→涂刷面积→遍数/涂布率/损耗→升数+按桶（18L/5L）取整建议；86 Path 无 paint/油漆/乳胶命中 | 小 | P1（本轮新晋·顺位第五） |
| 报价单/收据生成器 | 第七轮新晋（Medium 2026-09-19「15 Free Online Tools Everyone Should Bookmark」：Invoice Generator 列为必备收藏；海外 zoho/signNow/Jotform 多为模板下载或付费 SaaS，「纯在线免注册、填表单→打印」差异化；中文自由职业者/个体户/小商家开票收据刚需，用户本人玻璃店老板实战场景）；纯前端：客户/供方信息+项目明细行自动算金额→A4 预览→打印/PDF 导出（沿简历制作器打印路线）；金额大写自动转换，与金额大写转换器互链成「票据」组合；86 Path 无 quotation/invoice/报价单/收据命中 | 小 | P1（顺位第六） |
| 年会大屏抽奖 | 第七轮新晋（质速导航 2026-10-04 收录 365Lab活动屏幕：年会团建大屏互动纯前端一个网页搞定，13 天前新鲜中文证据；海外 wheelofnames.io/spinthelist/funraise Raffle Wheel 形态验证；时令：距 12-1 月年会季 1.5~2 个月，现在上线吃预热搜索）；纯前端：名单粘贴导入→转盘/滚动抽奖动画（canvas）→多轮次+中奖者自动移出→中奖名单导出→全屏大屏模式；数据不出浏览器；86 Path 无 lottery/raffle/抽奖命中 | 中 | P1（时令预热） |
| 在线方格纸/稿纸生成器（打印模板） | 第四轮新晋（HN Show HN 2026-10-16 方格纸生成器：免登录、无水印、真实比例打印，纯前端；360doc 2025-12-10 打印字帖网站：米字格/田字格/九宫格/康奈尔笔记/点阵纸/作文稿纸，家长打印字帖、学生备稿纸刚需）；SVG/Canvas 渲染模板+参数（格子大小/线条颜色/纸张 A4·A5）+浏览器打印/PDF 导出；田字格/米字格/作文稿纸/拼音格中文差异化 vs Gridzzly/Paper Me；86 Path 无重叠 | 小 | P1 |
| 金额大写转换器 | 第六轮新晋（实名需求：阿拉伯数字转人民币大写，起诉状/和解协议/收据必备；新浪科技 WPS 人民币大小写教程：用户靠 WPS/Excel 单元格格式转换，在线免费替代错位；360doc「X 元大写怎么写」问答+GitHub fastquotes 金额转汉字库）；纯前端极小：输入→人民币大写+一键复制；与报价单/收据生成器互链成「票据」组合；86 Path 无大写/金额大写命中 | 小 | P1（节奏调节位） |
| 接龙文本统计（粘贴群接龙→解析汇总） | 第四轮新晋（sohu 2026-08-25「微信接龙怎么导出打卡记录」：班长「对着几百条群消息熬夜对账」；163 2026「微信接龙总漏统计？」：刷屏混在聊天记录里看不清、序号重复、事后逐条复制整理；sohu 2026-08-28 一起报数种草文：小程序导出 Excel 要开会员、广告多）；差异化「事后整理」vs 发起式小程序：粘贴混乱文本→规则引擎解析→去重/人数汇总→「谁没接龙」对比→CSV 导出；纯前端、数据不出浏览器；86 Path 无接龙重叠 | 中 | P1 |
| 极简简历制作器 | V2EX t/1210967 xukz.cn「Word 改简历调字间距打印格式崩溃」；CSDN IT 简历模板榜 Word 排版难痛点；360doc 2025-12-31 简历制作神器高频痛点；秋招季时令；结构化填写→A4 所见即所得预览→浏览器打印/PDF 导出，localStorage 免注册免上传，「简历不出浏览器」差异化叙事；86 Path 无 resume/简历重叠 | 中 | P1 |
| 课程表生成器 | 第三轮升级（CSDN 2026-01「数字化课程表」：Word/Excel 手工绘制耗时、调课改版易混乱、排版单调；360doc 2025-12-10 教师五大难题列排课为核心难题）；可行范围：个人/班级课程表拖拽填课+简易撞课提示+配色模板+打印/PDF 导出（不做全校智能排课算法）；纯前端；86 Path 无重叠 | 中 | P1 |
| 图片裁剪（比例预设+拖拽裁剪框） | pixoate 预设比例 1:1/16:9/4:5+拖拽框实时预览+手机触屏；splitanimage 本地免上传图片套件；YouTube TemplateMaker.in 考试/求职/政府表单照片高频；与 img-resize（指定宽高数值裁剪）差异化明确无重叠；图片旅程线缺环补齐；canvas 纯前端本地免上传 | 小 | P1（节奏调节位） |
| 工作日计算器（含法定节假日/调休） | V2EX PriTime「法定节假日/调休补班重复，国内用户刚需」；yize/chinese-workday 2011-2026 数据+浏览器 CDN；Excel NETWORKDAYS 手工维护节假日痛点；起止日期→工作日天数+单日「要上班吗」查询；与 /tools/calendar（仅展示）无重叠；难度中（年份数据表需年更） | 中 | P1 |
| 图片拼图（网格模板拼图） | 360doc 2026-01-30 四选一首位；Photo Collage Maker 形态：多张图合成一格、网格/异形模板、自定义布局、文字/贴纸；与 nine-grid（九宫格切图）方向相反无重叠；与 img-stitch（一维长图拼接）形态不同；canvas 纯前端本地免上传 | 小 | P1 |
| 屏幕录制（在线录屏） | 360doc 2026-01-30 宝藏站单列推荐；网易测评三大痛点：免费导出带水印、桌面软件要安装、公司电脑禁装软件只能用网页方案；100% 纯前端（getDisplayMedia+MediaRecorder→webm），免安装无水印文件不出本机；桌面端优先 | 中 | P1（通用顶位备选） |
| cURL 转代码 | 开发者刚需（HN 讨论 + curlconverter 开源库 27+ 语言）；赛道已有成熟免费玩家，垂直小众 | 小 | P1 |
| 浏览器实时听写（麦克风语音转文字） | 第三轮新晋观察（CSDN 会议测评：73% 职场人遇到转写痛点；360doc 2025-12-21 腾讯元宝不限时长免费掀桌子反证全民刚需；HN Show HN BetterWispr 2026-10-12 200 points：本地听写「无账号无云端」差异化；dev.to Whistle 轻量 STT 走红）；Web Speech API SpeechRecognition（Chrome/Edge 中文免费免 key）纯前端实时转写+复制/导出；「录音不出浏览器」对标需上传的 AI 方案；限制：Firefox/Safari 支持差须注明、质量不如 AI 大模型、无说话人分离/总结；赛道被免费 AI 统治，观察为主；86 Path 无重叠 | 小 | P1（观察） |
| 文本敏感信息打码 | 文本身份证/手机号/银行卡号脱敏；未找到强需求信号，运营场景刚需但证据弱 | 小 | P1（观察） |
| Excel 公式中文解释器 | 360doc「Excel 公式机器人」文本指令转公式是 AI 能力、不可做；反向「公式→中文分步解释」纯前端可做：词法拆解+函数中文说明库；证据单薄仅一条，待补强 | 中 | P1（观察） |
| Markdown 表格修复 | 中文全角/emoji 对齐错乱修复；赛道拥挤（tablesgenerator、tableconvert、编辑器插件生态），纯本地免费可差异化 | 小 | P1（末位） |
| 网页电台（随机听全球电台） | 本轮新晋观察（V2EX 2026-10-16 roamdial：170 回复/204 收藏，网页免安装随机切台、码率≥128/192/320 过滤、语言过滤、歌词跟唱、收藏跳网易云/QQ 音乐/Spotify；电台目录来自 Radio Browser 社区 API 周更+可用性探测）；依赖第三方公共 API，单页可实现但需网络 API、非离线纯本地口径，第三方可用性风险；86 Path 无 radio/电台命中 | 中 | P2（观察·第三方 API 依赖） |
| 自由职业时薪计算器 | 本轮新晋观察（dev.to「Build in Public #1」2026-10-10：年目标收入/可计费小时→时薪，86,000/1150h=$74.78/h，9/9 测试；仅海外单条证据，中文时薪报价信号未找到） | 小 | P2（观察） |
| 证件照换底色 | CSDN+360doc 实测文再确认刚需（微信小程序爆款均靠 AI 服务器抠图）；发丝级抠图需 AI 分割模型（WASM 版数十 MB），不完全符合纯轻量前端口径，等轻量方案 | 中 | P2（观察） |
| SQLite 在线查看器 | dev.to Tooltri 单次提及；sql.js WASM 纯前端可读 .db 文件；开发者小众 | 中 | P2（观察） |
| 手写模拟器 | 360doc 2026-02-14 萝卜工坊；作业/笔记/贺卡趣味场景；canvas+手写体字库纯前端可做 | 小 | P2（观察） |
| 在线文字转语音（Web Speech API） | 维持观察（赛道被 AI 拟真语音统治——Speechify 50 万+五星、AIVocal 600+音色；Web Speech API 系统语音音质参差、不可定制音色，免登录叙事不足以对冲质量差距；证据仍单薄） | 小 | P2（观察） |
| 隐私政策生成器 | 第三轮新晋观察（FreeTopTools 16 工具清单单列「Business」工具；APP/小程序上架商店强制要求隐私政策文本；表单填空→标准模板条款生成，纯前端；证据单条，赛道已有在线生成器玩家） | 小 | P2（观察） |
| 轻断食计时器 | 第四轮新晋观察（HN Show HN "Intermittent Fasting Calculator" 2026-10-07 新鲜：16:8/14:10/18:6/20:4/OMAD 断食窗口规划+24 小时彩色时间轴+文本/图片/PDF 导出；纯前端可做：方法选择+上餐/目标时间输入→时间轴渲染+本地提醒；国内受众小众、健康类与本站工具定位偏离，观察为主；86 Path 无 fast/断食重叠） | 小 | P2（观察） |

**已实现（经济补偿金计算器本轮划出，全量 86 Path）**：思维导图 → 表格拆分 → 表格合并 → **HEIC 转 JPG（已开发、未可交付——12:30 真机实测失败、生产已回滚，见历史轮次「⚠️ 待修复」）** → 成绩统计分析 → 二手房税费计算器 → 房贷计算器 → PDF 可填写表单制作器（+触屏修复）→ 工资个税计算器（8a6e0cc：七项专项附加扣除+年终奖计税对比，与房贷/二手房税费三向互链成「财务」旅程线）→ 双十一凑单计算器（145e47e+3d02c3c：满减档位自定义+子集和 DP 最小溢出最优组合+「还差 XX 元」提示与候补单品建议，纯前端本地计算）→ 字体版权查询（abe5db0+fd8fc74：canvas 本地字体探测+198 条离线版权库+复制报告，`/tools/font-license-check`）→ **简历预检工具（开发交付：`templates/resume_checker.html`+745 行纯前端规则引擎（技术栈词典 200 词+动作动词库+JD 关键词匹配/ATS 检测/逻辑链检查/雷区清单四模块报告+一键复制），新建「求职工具」品类，`/tools/resume-checker`）** → **在线图表生成器（1c6a9e3+fc135d3：粘贴表格/CSV/Excel 复制行→分隔符自动识别+引号感知解析→柱状/折线/饼/环形四类型自绘 SVG 渲染→1x/2x/3x 高清 PNG 导出，`/tools/chart-generator`）** → **双11到手价计算器（优惠叠加模拟）（2dca60b：商品直降价→店铺券→品类券→跨店满减→会员折扣→红包→以旧换新折价→国补 15%（家电封顶 1500/数码 500/手机 6000 红线）逐层明细+规则提示+平台预设，`/tools/double11-final-price`）** → **GB/T 7714 参考文献格式生成器（acdfccd：[J][M][D][C][N][S][R][P][EB/OL][A] 十种文献类型表单+顺序编码制/著者-出版年制双制式切换+中文「等」/英文「et al」自动处理+多条目累积排序导出，`/tools/gbt7714-reference-generator`）** → **经济补偿金计算器（2eaeeec+2b0b434：入职/离职日期→工龄折算 N→经济补偿金 N/代通知金+1（第 40 条）/违法解除赔偿金 2N+三倍社平封顶/12 年封顶+法条标注+免责声明+一键复制，`/tools/severance-calculator`）**；以上均已从候选池划出，历史记录保留于下方各轮次小节。

**归档说明**：本轮为 10-17 通用调研第八轮（WPS 特别方向 10-15 已结束）——经济补偿金计算器交付闭环（2eaeeec+2b0b434，`/tools/severance-calculator` 已注册，全量 86 Path），候选池划出；新晋候选「AI 文本清洁器」P1（removeaitells/textninja/privacyzip 三独立站近 1 个月证据+PlainTextify 插件+dev.to Tooltri 列为核心工具，与 AI Token 计数器互链成「AI 写作」组合，难度极小）、「露营用电计算器」P1（新浪新闻 2026-10-17 当天房车露营电源清单+hjaiot 中文实战公式文+dev.to Camp Power Calc 形态验证，秋季露营季时令）、「乳胶漆用量计算器」P1（svipapi 2026-09-17 中文用量公式实战文+dev.to Room Paint Calc 形态验证，装修高频）；网页电台（V2EX roamdial）因依赖第三方 Radio Browser 公共 API 进 P2 观察；自由职业时薪计算器证据仅海外单条进 P2 观察；V2EX/HN/中文种草榜其余无单页可落地新信号（PicLite「按目标体积压缩」属图片压缩增强项不单立项——第六轮已归增强清单；流量榜单/API 工具需后端数据管线；Edge 插件三款为插件形态）；WPS 候选表保持冻结归档；仓库 86 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`git log` 确认开发交付 2eaeeec+2b0b434；`grep tools/categories.go` 全量 86 Path，`severance_calculator` ID 与 `/tools/severance-calculator` Path 已注册（划入已实现），新候选建议 ID（ai_text_cleaner / camp_power_calculator / paint_calculator）与 86 Path 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-17 13:40 决策轮）

## 今日任务（2026-10-17 13:40 · 产品经理排期决策 ✅）

**交付状态**：10-17 排期决策轮（13:00 第七轮研究之后）。GB/T 7714 参考文献格式生成器已交付闭环（acdfccd 开发交付；`grep tools/categories.go` 确认 Path `/tools/gbt7714-reference-generator` 已注册，全量 85 Path），候选池划出。本轮立项**今日唯一任务：经济补偿金/赔偿金计算器（N/N+1/2N）**。

**选定：经济补偿金/赔偿金计算器（N/N+1/2N）（/tools/severance-calculator）** — 今日唯一任务：
- **兑现 11:45 决策承诺，顺位递进**：11:45 PM 决策轮白纸黑字承诺「留待下轮首选，与工资个税计算器互链成劳动财务组合」；现在就是下轮，13:00 研究轮亦以 Top1 顺位推荐，双重确认，不再拖延。
- **需求证据四重有效**：① 本日律师用户实名需求（入职/离职日期+前 12 月平均工资→N/N+1/2N，含三倍封顶/12 年封顶）；② 360doc 2025-12-30 辞退补偿实战：工龄折算、"月工资"须含奖金津贴（约 30% 企业漏算成仲裁争议焦点）、三倍封顶+12 年封顶；③ 新浪新闻：N/N+1/2N 三档规则全，违法解除占企业败诉 42%、补偿金计算错误是最主要败诉原因；④ 360doc「被辞退了，赔偿怎么算？别只知道 N」——N/N+1/2N 为全网劳动法最高频词。
- **用户契合度高**：用户本人目标转行做律师、主攻劳动仲裁方向——该工具与其个人学习/执业方向直接相关，是天然的种子用户与第一验证者。
- **难度小、一天可高质量完成**：纯前端表单 +《劳动合同法》第 46/47/40/48/87 条确定性规则引擎（工龄折算→三档金额→封顶校验），无算法复杂度；参考工资个税计算器交付形态。
- **节奏错峰+组合成型**：13:00 已交付学术文档工具（GB/T 7714）；此时做计算器类形态切换不单调；与工资个税计算器互链成「劳动财务」组合（离职补偿算完→税后到手/涉税问题回流个税计算器），补齐"被辞退"场景完整链路。

**规格**：
1. 输入区：入职日期、离职/解除日期（date input，默认今天）；解除情形卡片单选：① 协商一致解除（单位提出）→经济补偿 N；② 裁员/客观情况变化→经济补偿 N；③ 单位违法解除→赔偿金 2N；④ 合同到期单位不续签→经济补偿 N；⑤ 员工主动辞职/过失性解除→无补偿（法条说明）；⑥ 医疗期满/不能胜任/客观情况重大变化（第 40 条）→N+1。
2. 前 12 个月平均工资输入（必填，醒目提示：须含奖金/津贴/加班费等全部应得工资，约 30% 企业漏算成仲裁争议焦点）；当地上年度职工月平均工资（选填，用于三倍封顶判定；留空则不做封顶校验并提示）。
3. 工龄折算引擎（《劳动合同法》第 47 条）：精确到日计算在职时长；6 个月以上不满 1 年→1 年，不满 6 个月→0.5 年；输出「N = X 个月工资」及折算过程说明。
4. 三档金额结果卡片：经济补偿金 N×月薪、代通知金 +1（仅第 40 条情形可用，其他情形置灰+「不适用」提示）、违法解除赔偿金 2N×月薪；三卡并列，「最可能适用」按所选情形高亮；2N 情形注明不再叠加代通知金。
5. 封顶规则引擎：月薪 > 社平×3 → 基数取社平×3、年限最高 12 年（2008 年后工龄封顶说明）；输出封顶前后对比金额。
6. 法条依据与免责：每项结果标注法条（第 46/47/40/48/87 条）；页面底部显著免责声明「计算结果仅供参考，不构成法律意见，具体以仲裁/法院认定为准」。
7. 「填入示例」一键带入：2023-03-01 入职、2026-10-17 离职、月均 12000、协商一致解除；结果一键复制（文本明细含三档+法条+免责）；响应式；纯前端、数据不出浏览器。
8. 注册：`tools/categories.go`「生活工具」品类新增 ID `severance_calculator`、Path `/tools/severance-calculator`（New: true），中英文描述 + SEO keywords（经济补偿金计算器、N+1赔偿、2N赔偿金、离职补偿怎么算）；页面底部「相关工具」与工资个税计算器双向互链（「劳动财务」组合）。

**验收标准**：
- [ ] `/tools/severance-calculator` 可开（200）
- [ ] 示例：2023-03-01→2026-10-17（3 年 7.5 个月→N=4），月均 12000，协商一致解除 → 经济补偿金 48000 元，折算说明正确
- [ ] 违法解除同例 → 赔偿金 96000 元（2N），并提示 2N 不再叠加代通知金
- [ ] 第 40 条情形 → 显示 N+1 = 60000 元，并注明代通知金适用条件；非 40 条情形代通知金卡置灰+「不适用」
- [ ] 员工主动辞职 → 无补偿 + 法条说明，不报错
- [ ] 封顶：月均 36000、社平 10620（三倍 31860）→ 基数取 31860；工龄 15 年 → 按 12 年封顶，输出封顶说明
- [ ] 月均工资含奖金提示文案存在；未填社平时封顶模块提示「未填写则不做封顶校验」
- [ ] 复制结果文本含三档金额+法条+免责声明
- [ ] 必填缺失（未填日期/工资）中文友好提示不报错；离职早于入职给出错误提示
- [ ] 纯前端无后端调用（DevTools Network 抽查）
- [ ] `categories.go` 注册完成（「生活工具」品类），首页/导航/sitemap 生效；与工资个税计算器互链生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/severance_calculator.html`（解除情形选择+输入表单+三档结果卡片+封顶说明）、`static/js/severance_calculator.js`（工龄折算+三档金额+封顶规则引擎；或沿既有习惯内联）、`tools/categories.go`（「生活工具」品类注册）、`BACKLOG.md`（本小节）。

**未选**：视频抽帧（P1，HN Show HN 新鲜证据+开辟「视频工具」新方向；难度中，一天交付质量风险高，留池待节奏空位）；工资条生成器（P1，HR/财务月度刚需+SheetJS 在栈；与个税计算器同属财务组合方向，本轮已定「劳动财务」组合、连击财务组合形态单调，留池作后续节奏调节）；报价单/收据生成器（P1，13:00 轮新晋，与金额大写转换器互链成「票据」组合，留池）；年会大屏抽奖（P1 时令预热，距年会季 1.5~2 个月、预热不急于今日，留池）；在线方格纸/金额大写转换器/接龙文本统计/极简简历制作器/医学组合等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在且为最新；`grep tools/categories.go` 全量 85 Path，无 补偿/赔偿/仲裁/severance 命中，ID `severance_calculator`、Path `/tools/severance-calculator` 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

> 维护人：产品调研员 · 每日更新（2026-10-17 13:00 第七轮研究）

## 今日任务（2026-10-17 13:00 · 产品调研员研究轮 ✅）

**交付状态**：10-17 通用调研第七轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研）。GB/T 7714 参考文献格式生成器已交付闭环（acdfccd 开发交付：[J][M][D][C][N][S][R][P][EB/OL][A] 十种文献类型表单+顺序编码制/著者-出版年制双制式+「等」/et al 自动处理+多条目累积导出；`grep tools/categories.go` 确认 Path `/tools/gbt7714-reference-generator` 已注册，全量 85 Path），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮五件事**（13:00 全网调研，通用方向）：
1. GB/T 7714 交付确认：11:45 PM 决策轮立项→开发交付（acdfccd）；`grep tools/categories.go` 确认 Path 已注册（全量 85 Path），与候选池无重叠项残留；已实现清单追加。
2. 新晋候选：**报价单/收据生成器**。需求证据三重：① Medium 2026-09-19「15 Free Online Tools Everyone Should Bookmark」：Invoice Generator 列为必备收藏（"Create a clean, downloadable invoice for clients in minutes"）；② 海外 zoho/signNow/Jotform 多为模板下载或付费 SaaS，「纯在线免注册、填表单→打印/PDF」有差异化空间；③ 中文场景：自由职业者/个体户/小商家开票收据刚需（用户本人就是玻璃店老板，本轮刚交付华侨城 8 项 12965 元报价单实战）。可行性：纯前端——客户/供方信息+项目明细行（名称/数量/单价自动算金额/备注）→A4 所见即所得预览→浏览器打印/PDF 导出（沿简历制作器打印路线）；金额大写自动转换，与池内金额大写转换器互链成「票据」组合；「数据不出浏览器」隐私叙事。去重：85 Path 无 quotation/invoice/报价单/收据命中。难度小。SEO：报价单生成器、收据打印、电子发票模板。建议 ID `quotation_generator`、Path `/tools/quotation-generator`。
3. 新晋时令候选：**年会大屏抽奖**。需求证据三重：① 质速导航 2026-10-04 收录 365Lab活动屏幕（年会团建大屏互动：倒计时+抽奖+计分，纯前端一个网页搞定），13 天前新鲜中文证据；② 海外 wheelofnames.io/spinthelist/funraise Raffle Wheel 形态验证（免注册、浏览器内运行、canvas 转盘动画、confetti 效果）；③ 时令：10-17 距 12-1 月年会季 1.5~2 个月，现在上线吃预热搜索（企业行政/HR 提前备年会）。可行性：纯前端——名单粘贴导入（工号+姓名）→转盘/滚动抽奖动画（canvas）→多轮次（特等奖/一二三等奖配置）→中奖者自动移出→中奖名单导出→全屏大屏模式；数据不出浏览器。去重：85 Path 无 lottery/raffle/抽奖命中。难度中。SEO：年会抽奖、在线抽奖、大屏抽奖、随机抽奖工具。建议 ID `lucky_draw`、Path `/tools/lucky-draw`。
4. 无新单页信号侧：① V2EX 近期：AI 变现讨论帖（无单页信号）、tranco 看榜工具（需数据管线+定时任务，非单页）、AI 工具导航（营销站）；v2ex.top 10-16 热点：ESP32 iPhone 遥控（硬件形态）、Claude/GPT 争论——无单页可落地项；② HN：Jevman（AI benchmark）、WallHop（付费墙绕过需后端）、bigarrow（macOS CLI）、ChatGPT Sites 分析——无单页可落地项；③ 中文种草榜：图片加水印（ToolWeb 已有 watermark）、AI 音乐/文案提取（需 AI/后端）、AI 导航（营销站）；④ Medium 榜单其余项：密码生成器/年龄计算器/字数统计 ToolWeb 均已实现。
5. WPS 候选表保持冻结归档（本轮为通用方向）。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **经济补偿金/赔偿金计算器（N/N+1/2N）** — P1（顺位递进首选：11:45 PM 决策轮明确承诺「留待下轮首选，与工资个税计算器互链成劳动财务组合」；第六轮新晋：律师用户反馈实名需求+360doc/新浪四重证据，"N+1" 劳动法全网最高频词；纯前端：解除情形选择→工龄折算 N→三档金额+三倍封顶/12 年封顶/代通知金提示+免责声明；难度小）。SEO：经济补偿金计算器、N+1赔偿、2N赔偿金。
2. **视频抽帧（视频转图片/封面提取）** — P1（顺位递进，第四轮新晋）：HN Show HN "Video Frame Extractor" 证据；自媒体封面截取/视频取帧做素材痛点（手机截图精度差、PR/剪映太重）；纯前端 `<video>`+canvas 抽帧→PNG/JPEG 批量下载；开辟「视频工具」新方向；85 Path 无重叠。难度中。SEO：视频抽帧、视频转图片、视频封面提取。
3. **工资条生成器（HR 工资表→每人工资条）** — P1（顺位递进，第六轮新晋顺位第四）：360doc 双重实战证据（150 人工资条 3 小时→2 分钟）+Etsy/YouTube 形态验证，HR/财务月度刚需；纯前端：上传工资表 Excel（SheetJS 在栈）→逐员工工资条卡片→打印/PDF+单表 xlsx 导出；「工资数据不出浏览器」隐私叙事；与工资个税计算器成「HR 财务」组合。难度小。

报价单/收据生成器列顺位第四（P1，本轮新晋，与金额大写转换器互链成「票据」组合，难度小）；年会大屏抽奖列 P1 时令预热（本轮新晋，11 月前上线吃搜索预热，难度中）；在线方格纸/稿纸生成器顺位第五（P1，第四轮新晋顺延）；接龙文本统计顺位顺延；极简简历制作器维持 P1（秋招季+求职组合）；图片裁剪/金额大写转换器维持节奏调节位；抛货体积重量/厨房单位换算维持 P1 观察。

**通用候选表**（2026-10-17 第七轮；GB/T 7714 已实现划出；新晋报价单/收据生成器 P1、年会大屏抽奖 P1（时令预热）；全量 85 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 经济补偿金/赔偿金计算器（N/N+1/2N） | 第六轮新晋（实名需求：入职/离职日期+前 12 月平均工资→N/N+1/2N，含三倍封顶/12 年封顶；360doc 2025-12-30 辞退补偿实战+新浪新闻：N/N+1/2N 三档规则，违法解除占企业败诉 42%、补偿金算错为最主要败诉原因；"被辞退了，赔偿怎么算？别只知道 N"）；纯前端：解除情形选择→工龄折算→三档金额+封顶规则提示+免责声明；与工资个税计算器互链成「劳动财务」组合；85 Path 无重叠 | 小 | P1（顺位递进首选） |
| 视频抽帧（视频转图片/封面提取） | 第四轮新晋（HN Show HN "Video Frame Extractor" 2026-10-07：浏览器上传视频、指定间隔自动抽帧下载，免安装；自媒体封面截取/取帧做素材，手机截图精度差、PR/剪映太重）；纯前端 `<video>`+canvas 抽帧→PNG/JPEG 批量下载，零依赖、文件不出浏览器；开辟「视频工具」新方向；85 Path 无重叠 | 中 | P1（顺位递进） |
| 工资条生成器（HR 工资表→每人工资条） | 第六轮新晋（360doc 2025-12-10 财务实战：150 人工资条「打印-裁剪-装袋 3 小时→一键生成 2 分钟」；360doc 2025-12-14 HR 20 函数：「工资条 VLOOKUP 批量生成」列为发钱大事；Etsy 付费模板+YouTube Payroll 教程形态验证）；纯前端：上传工资表 Excel（SheetJS 在栈）→逐员工工资条卡片→打印/PDF+单表 xlsx 导出；「工资数据不出浏览器」隐私叙事；与工资个税计算器成「HR 财务」组合；85 Path 无重叠 | 小 | P1（顺位第三） |
| 报价单/收据生成器 | 本轮新晋（Medium 2026-09-19「15 Free Online Tools Everyone Should Bookmark」：Invoice Generator 列为必备收藏；海外 zoho/signNow/Jotform 多为模板下载或付费 SaaS，「纯在线免注册、填表单→打印」差异化；中文自由职业者/个体户/小商家开票收据刚需，用户本人玻璃店老板实战场景）；纯前端：客户/供方信息+项目明细行自动算金额→A4 预览→打印/PDF 导出（沿简历制作器打印路线）；金额大写自动转换，与金额大写转换器互链成「票据」组合；85 Path 无 quotation/invoice/报价单/收据命中 | 小 | P1（本轮新晋·顺位第四） |
| 在线方格纸/稿纸生成器（打印模板） | 第四轮新晋（HN Show HN 2026-10-16 方格纸生成器：免登录、无水印、真实比例打印，纯前端；360doc 2025-12-10 打印字帖网站：米字格/田字格/九宫格/康奈尔笔记/点阵纸/作文稿纸，家长打印字帖、学生备稿纸刚需）；SVG/Canvas 渲染模板+参数（格子大小/线条颜色/纸张 A4·A5）+浏览器打印/PDF 导出；田字格/米字格/作文稿纸/拼音格中文差异化 vs Gridzzly/Paper Me；85 Path 无重叠 | 小 | P1（顺位第五） |
| 年会大屏抽奖 | 本轮新晋（质速导航 2026-10-04 收录 365Lab活动屏幕：年会团建大屏互动纯前端一个网页搞定，13 天前新鲜中文证据；海外 wheelofnames.io/spinthelist/funraise Raffle Wheel 形态验证；时令：距 12-1 月年会季 1.5~2 个月，现在上线吃预热搜索）；纯前端：名单粘贴导入→转盘/滚动抽奖动画（canvas）→多轮次+中奖者自动移出→中奖名单导出→全屏大屏模式；数据不出浏览器；85 Path 无 lottery/raffle/抽奖命中 | 中 | P1（时令预热） |
| 金额大写转换器 | 第六轮新晋（实名需求：阿拉伯数字转人民币大写，起诉状/和解协议/收据必备；新浪科技 WPS 人民币大小写教程：用户靠 WPS/Excel 单元格格式转换，在线免费替代错位；360doc「X 元大写怎么写」问答+GitHub fastquotes 金额转汉字库）；纯前端极小：输入→人民币大写+一键复制；与报价单/收据生成器互链成「票据」组合；85 Path 无重叠 | 小 | P1（节奏调节位） |
| 接龙文本统计（粘贴群接龙→解析汇总） | 第四轮新晋（sohu 2026-08-25「微信接龙怎么导出打卡记录」：班长「对着几百条群消息熬夜对账」；163 2026「微信接龙总漏统计？」：刷屏混在聊天记录里看不清、序号重复、事后逐条复制整理；sohu 2026-08-28 一起报数种草文：小程序导出 Excel 要开会员、广告多）；差异化「事后整理」vs 发起式小程序：粘贴混乱文本→规则引擎解析→去重/人数汇总→「谁没接龙」对比→CSV 导出；纯前端、数据不出浏览器；85 Path 无重叠 | 中 | P1 |
| 极简简历制作器 | V2EX t/1210967 xukz.cn「Word 改简历调字间距打印格式崩溃」；CSDN IT 简历模板榜 Word 排版难痛点；360doc 2025-12-31 简历制作神器高频痛点；秋招季时令；结构化填写→A4 所见即所得预览→浏览器打印/PDF 导出，localStorage 免注册免上传，「简历不出浏览器」差异化叙事；85 Path 无重叠 | 中 | P1 |
| 课程表生成器 | 第三轮升级（CSDN 2026-01「数字化课程表」：Word/Excel 手工绘制耗时、调课改版易混乱、排版单调；360doc 2025-12-10 教师五大难题列排课为核心难题）；可行范围：个人/班级课程表拖拽填课+简易撞课提示+配色模板+打印/PDF 导出（不做全校智能排课算法）；纯前端；85 Path 无重叠 | 中 | P1 |
| 图片裁剪（比例预设+拖拽裁剪框） | pixoate 预设比例 1:1/16:9/4:5+拖拽框实时预览+手机触屏；splitanimage 本地免上传图片套件；YouTube TemplateMaker.in 考试/求职/政府表单照片高频；与 img-resize（指定宽高数值裁剪）差异化明确无重叠；图片旅程线缺环补齐；canvas 纯前端本地免上传 | 小 | P1（节奏调节位） |
| 工作日计算器（含法定节假日/调休） | V2EX PriTime「法定节假日/调休补班重复，国内用户刚需」；yize/chinese-workday 2011-2026 数据+浏览器 CDN；Excel NETWORKDAYS 手工维护节假日痛点；起止日期→工作日天数+单日「要上班吗」查询；与 /tools/calendar（仅展示）无重叠；难度中（年份数据表需年更） | 中 | P1 |
| 图片拼图（网格模板拼图） | 360doc 2026-01-30 四选一首位；Photo Collage Maker 形态：多张图合成一格、网格/异形模板、自定义布局、文字/贴纸；与 nine-grid（九宫格切图）方向相反无重叠；与 img-stitch（一维长图拼接）形态不同；canvas 纯前端本地免上传 | 小 | P1 |
| 屏幕录制（在线录屏） | 360doc 2026-01-30 宝藏站单列推荐；网易测评三大痛点：免费导出带水印、桌面软件要安装、公司电脑禁装软件只能用网页方案；100% 纯前端（getDisplayMedia+MediaRecorder→webm），免安装无水印文件不出本机；桌面端优先 | 中 | P1（通用顶位备选） |
| cURL 转代码 | 开发者刚需（HN 讨论 + curlconverter 开源库 27+ 语言）；赛道已有成熟免费玩家，垂直小众 | 小 | P1 |
| 浏览器实时听写（麦克风语音转文字） | 第三轮新晋观察（CSDN 会议测评：73% 职场人遇到转写痛点；360doc 2025-12-21 腾讯元宝不限时长免费掀桌子反证全民刚需；HN Show HN BetterWispr 2026-10-12 200 points：本地听写「无账号无云端」差异化；dev.to Whistle 轻量 STT 走红）；Web Speech API SpeechRecognition（Chrome/Edge 中文免费免 key）纯前端实时转写+复制/导出；「录音不出浏览器」对标需上传的 AI 方案；限制：Firefox/Safari 支持差须注明、质量不如 AI 大模型、无说话人分离/总结；赛道被免费 AI 统治，观察为主；85 Path 无重叠 | 小 | P1（观察） |
| 文本敏感信息打码 | 文本身份证/手机号/银行卡号脱敏；未找到强需求信号，运营场景刚需但证据弱 | 小 | P1（观察） |
| Excel 公式中文解释器 | 360doc「Excel 公式机器人」文本指令转公式是 AI 能力、不可做；反向「公式→中文分步解释」纯前端可做：词法拆解+函数中文说明库；证据单薄仅一条，待补强 | 中 | P1（观察） |
| Markdown 表格修复 | 中文全角/emoji 对齐错乱修复；赛道拥挤（tablesgenerator、tableconvert、编辑器插件生态），纯本地免费可差异化 | 小 | P1（末位） |
| 证件照换底色 | CSDN+360doc 实测文再确认刚需（微信小程序爆款均靠 AI 服务器抠图）；发丝级抠图需 AI 分割模型（WASM 版数十 MB），不完全符合纯轻量前端口径，等轻量方案 | 中 | P2（观察） |
| SQLite 在线查看器 | dev.to Tooltri 单次提及；sql.js WASM 纯前端可读 .db 文件；开发者小众 | 中 | P2（观察） |
| 手写模拟器 | 360doc 2026-02-14 萝卜工坊；作业/笔记/贺卡趣味场景；canvas+手写体字库纯前端可做 | 小 | P2（观察） |
| 在线文字转语音（Web Speech API） | 维持观察（赛道被 AI 拟真语音统治——Speechify 50 万+五星、AIVocal 600+音色；Web Speech API 系统语音音质参差、不可定制音色，免登录叙事不足以对冲质量差距；证据仍单薄） | 小 | P2（观察） |
| 隐私政策生成器 | 第三轮新晋观察（FreeTopTools 16 工具清单单列「Business」工具；APP/小程序上架商店强制要求隐私政策文本；表单填空→标准模板条款生成，纯前端；证据单条，赛道已有在线生成器玩家） | 小 | P2（观察） |
| 轻断食计时器 | 第四轮新晋观察（HN Show HN "Intermittent Fasting Calculator" 2026-10-07 新鲜：16:8/14:10/18:6/20:4/OMAD 断食窗口规划+24 小时彩色时间轴+文本/图片/PDF 导出；纯前端可做：方法选择+上餐/目标时间输入→时间轴渲染+本地提醒；国内受众小众、健康类与本站工具定位偏离，观察为主；85 Path 无 fast/断食重叠） | 小 | P2（观察） |

**已实现（GB/T 7714 本轮划出，全量 85 Path）**：思维导图 → 表格拆分 → 表格合并 → **HEIC 转 JPG（已开发、未可交付——12:30 真机实测失败、生产已回滚，见历史轮次「⚠️ 待修复」）** → 成绩统计分析 → 二手房税费计算器 → 房贷计算器 → PDF 可填写表单制作器（+触屏修复）→ 工资个税计算器（8a6e0cc：七项专项附加扣除+年终奖计税对比，与房贷/二手房税费三向互链成「财务」旅程线）→ 双十一凑单计算器（145e47e+3d02c3c：满减档位自定义+子集和 DP 最小溢出最优组合+「还差 XX 元」提示与候补单品建议，纯前端本地计算）→ 字体版权查询（abe5db0+fd8fc74：canvas 本地字体探测+198 条离线版权库+复制报告，`/tools/font-license-check`）→ **简历预检工具（开发交付：`templates/resume_checker.html`+745 行纯前端规则引擎（技术栈词典 200 词+动作动词库+JD 关键词匹配/ATS 检测/逻辑链检查/雷区清单四模块报告+一键复制），新建「求职工具」品类，`/tools/resume-checker`）** → **在线图表生成器（1c6a9e3+fc135d3：粘贴表格/CSV/Excel 复制行→分隔符自动识别+引号感知解析→柱状/折线/饼/环形四类型自绘 SVG 渲染→1x/2x/3x 高清 PNG 导出，`/tools/chart-generator`）** → **双11到手价计算器（优惠叠加模拟）（2dca60b：商品直降价→店铺券→品类券→跨店满减→会员折扣→红包→以旧换新折价→国补 15%（家电封顶 1500/数码 500/手机 6000 红线）逐层明细+规则提示+平台预设，`/tools/double11-final-price`）** → **GB/T 7714 参考文献格式生成器（acdfccd：[J][M][D][C][N][S][R][P][EB/OL][A] 十种文献类型表单+顺序编码制/著者-出版年制双制式切换+中文「等」/英文「et al」自动处理+多条目累积排序导出，`/tools/gbt7714-reference-generator`）**；以上均已从候选池划出，历史记录保留于下方各轮次小节。

**归档说明**：本轮为 10-17 通用调研第七轮（WPS 特别方向 10-15 已结束）——GB/T 7714 参考文献格式生成器交付闭环（acdfccd，`/tools/gbt7714-reference-generator` 已注册，全量 85 Path），候选池划出；新晋候选「报价单/收据生成器」P1（Medium 2026-09-19「15 Free Online Tools」必备收藏+海外 SaaS 差异化+中文个体户/小商家刚需，与金额大写转换器互链成「票据」组合）、「年会大屏抽奖」P1（质速导航 2026-10-04 新鲜中文证据+wheelofnames 海外形态验证，时令预热：距年会季 1.5~2 个月）；V2EX/HN/中文种草榜均无单页可落地新信号（水印/AI 类/模板下载或已有或需后端）；WPS 候选表保持冻结归档；仓库 85 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 85 Path，新候选（quotation_generator / lucky_draw 建议 ID）无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-17 11:45 决策轮）

## 今日任务（2026-10-17 11:45 · 产品经理排期决策 ✅）

**交付状态**：10-17 排期决策轮（第六轮研究之后）。双11到手价计算器已交付闭环（2dca60b 开发交付：叠加顺序计算引擎+国补封顶/红线校验+示例一键填入；`grep tools/categories.go` 确认 Path `/tools/double11-final-price` 已注册，全量 84 Path），候选池划出。本轮立项**今日唯一任务：GB/T 7714 参考文献格式生成器**。

**选定：GB/T 7714 参考文献格式生成器（/tools/gbt7714-reference-generator）** — 今日唯一任务：
- **顺位递进首选，不再拖延**：第三轮新晋，第四/五轮研究员连续推荐顺位递进首选；今日上午 PM 决策轮为让位双11时令任务（双11到手价已交付闭环 2dca60b），现在轮到它，这是承诺给研究员的顺位递进。
- **节奏与形态错峰**：今日已交付一个计算器类工具（双11到手价）；N/N+1/2N 经济补偿金计算器也是计算器，连击会造成体验单调。N+1 留待下轮与工资个税计算器互链成「劳动财务」组合，价值更大。GB/T 7714 是文本/文档生成方向，纯前端表单，开辟「文档·学术」新方向。
- **需求证据三重有效**：① 360doc 2025-12-04「参考文献格式乱？AI一键搞定学术规范」：改 30 篇参考文献花一整天仍被指出标注混淆，90% 问题=手动效率低+规范杂；② CSDN GBT7714 教程文：引文格式不合规退修率高达 32%、手动校对单篇平均 15 分钟；③ 开源 CSL 生态（含高校定制样式）证明规范可机械化。重型玩家（EndNote/NoteExpress/Zotero）需安装学习，「免注册、不出浏览器」差异化明确。
- **难度小、一天可高质量完成**：GB/T 7714-2015 条目是确定性模板拼接（文献类型标识 + 字段顺序 + 标点），无算法复杂度，主要工作量是类型表单的字段配置与模板库，纯前端 JS 即可。
- **SEO 与长尾**：参考文献格式生成器、GB/T 7714、论文参考文献格式、论文退修格式——学生/科研/教师群体长尾稳定搜索，与站内简历预检（求职）、图表生成器（论文配图）可成「学术写作」松散组合。

**规格**：
1. 文献类型选择（复选卡片/下拉）：期刊文章 [J]、专著 [M]、学位论文 [D]、论文集析出 [C]、报纸文章 [N]、标准 [S]、报告 [R]、专利 [P]、电子文献 [EB/OL]、档案 [A]（至少覆盖 [J][M][D][C][N][S][R][P][EB/OL]）；切换类型时动态更换字段表单。
2. 字段表单（按类型必填/选填提示）：作者（多人逗号/分号分隔）、题名、期刊名/出版社、年、卷、期、页码范围、出版地、DOI/URL、访问日期（电子文献）；「填入示例」一键带入每类一条标准样例。
3. 制式切换：顺序编码制（[1][2] 编号+文末列表）与著者-出版年制（(王五, 2023) 文内引用对应文末按作者排序）两种输出；著者-出版年制中文文献按拼音排序、英文按字母。
4. 作者处理规则：≤3 人全列；>3 人取前 3 + 中文「等」/英文「et al」（中英文文献自动判定）；无作者条目按题名处理并提示。
5. 结果区：悬挂缩进排版预览（等宽/宋体字体）、全选复制、逐条复制、导出 .txt（UTF-8 BOM）、清空；多条目连续录入（「添加下一条」累积列表，可删除/上移下移）。
6. 合规细节：GB/T 7714-2015 标点半角规范（. , : ; [] ()）、页码「:页码」、卷期「年,卷(期):页码」期刊模板、DOI 前缀 https://doi.org/ 补全、电子文献标注 [EB/OL] + 引用日期；页面内附「格式说明」小字条（引用日期必填等）。
7. 注册：`tools/categories.go`「文本工具」品类新增 ID `gbt7714_reference_generator`、Path `/tools/gbt7714-reference-generator`（New: true），中英文描述 + SEO keywords（参考文献格式生成器、GB/T 7714、论文参考文献格式）；页面底部「相关工具」与图表生成器/简历预检互链（学术写作组合）。
8. 纯前端、数据不出浏览器、响应式、免注册。

**验收标准**：
- [ ] `/tools/gbt7714-reference-generator` 可开（200）
- [ ] 期刊 [J] 样例：输入「张三,李四,王五,赵六. 深度学习在图像识别中的应用[J]. 计算机学报,2023,46(5):1234-1245.」对应字段→输出 `[1] 张三, 李四, 王五, 等. 深度学习在图像识别中的应用[J]. 计算机学报, 2023, 46(5): 1234-1245.`（4 作者截断+「等」）
- [ ] 专著 [M] 样例：`[1] 谭浩强. C程序设计[M]. 4版. 北京: 清华大学出版社, 2010.` 模板正确
- [ ] 学位论文 [D] 样例：`[1] 张明. 基于深度学习的文本分类研究[D]. 北京: 清华大学, 2022.` 模板正确
- [ ] 英文文献 4+ 作者自动用 et al：`[1] Smith J, Johnson K, Lee M, et al. Deep learning methods[J]. Nature, 2023, 615(7950): 100-110.`
- [ ] 著者-出版年制切换：输出按作者排序、无编号，文内引用格式 `(张三, 2023)` 说明正确
- [ ] 电子文献 [EB/OL]：URL + `[2026-10-17]` 引用日期输出正确，DOI 自动补全 https://doi.org/
- [ ] 多条目累积：添加 3 条→排序/删除/上下移→全选复制→导出 .txt 文件内容与预览一致
- [ ] 边界：必填缺失给出中文友好提示不报错；作者>10 人不卡顿；空列表导出按钮置灰
- [ ] 纯前端无后端调用（DevTools Network 抽查）、无第三方文献库依赖
- [ ] `categories.go` 注册完成（「文本工具」品类），首页/导航/sitemap 生效；与图表生成器/简历预检互链生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/gbt7714_reference_generator.html`（类型选择+动态字段表单+预览+导出）、`static/js/gbt7714_reference_generator.js`（模板库+作者处理+双制式排序引擎）、`tools/categories.go`（「文本工具」品类注册）、`BACKLOG.md`（本小节）。

**未选**：经济补偿金/赔偿金计算器（P1，本轮新晋：律师用户反馈实名需求+360doc/新浪四重证据；留待下轮首选，与工资个税计算器互链成「劳动财务」组合；避开今日计算器连击）；视频抽帧（P1，`<video>`+canvas 抽帧开辟「视频工具」新方向，难度中，留池）；工资条生成器（P1，HR/财务月度刚需，留池）；在线方格纸/稿纸生成器（P1，留池）；金额大写转换器（P1，难度极小，节奏调节位，留池）；接龙文本统计/极简简历制作器/课程表/医学组合/屏幕录制等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在且为最新；`grep tools/categories.go` 全量 84 Path，无 `gbt7714`/`reference`/`参考文献`/`7714` 命中，ID `gbt7714_reference_generator`、Path `/tools/gbt7714-reference-generator` 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

> 维护人：产品调研员 · 每日更新（2026-10-17 11:36 第六轮研究）

## 今日任务（2026-10-17 11:36 · 产品调研员研究轮 ✅）

**交付状态**：10-17 通用调研第六轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研）。双11到手价计算器已交付闭环（2dca60b 开发交付：商品直降价→店铺券→品类券→跨店满减→会员折扣→红包→以旧换新折价→国补 15%（家电封顶 1500/数码 500/手机 6000 红线）逐层明细+规则提示；`grep tools/categories.go` 确认 Path `/tools/double11-final-price` 已注册，全量 84 Path），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮六件事**（11:36 全网调研，通用方向）：
1. 双11到手价计算器交付确认：09:40 PM 决策轮立项→开发交付（2dca60b：叠加顺序计算引擎+档位规则+国补封顶/红线校验+以旧换新缩基数提示+示例数据一键填入）；`grep tools/categories.go` 确认 Path 已注册（全量 84 Path），与候选池无重叠项残留；候选池划出，已实现清单追加。
2. 新晋候选：**经济补偿金/赔偿金计算器（N/N+1/2N）**。需求证据四重：① 本日律师用户实名需求——"输入入职/离职日期和前 12 个月平均工资，自动算 N、N+1、2N，含月工资三倍封顶与 12 年封顶规则"（2026-10-17 当天）；② 360doc 2025-12-30 辞退补偿实战解析：2 年 2 个月工龄折 3 个月工资、"月工资"须含奖金津贴（约 30% 企业漏算成仲裁争议焦点）、三倍封顶+12 年封顶规则；③ 新浪新闻辞退赔偿标准：N/N+1/2N 三档规则全+违法解除案件占企业败诉 42%、补偿金计算错误是最主要败诉原因；④ 360doc 2025-12-24 劳动法保命要点："被辞退了，赔偿怎么算？别只知道 N"，N/N+1/2N 为全网劳动法最高频词。可行性：纯前端表单——入职/离职日期+前 12 月平均工资+解除情形选择（协商一致/裁员/违法解除/合同到期不续签）→工龄折算 N→N/N+1/2N 三档金额+三倍封顶/12 年封顶/代通知金规则提示+免责声明；与工资个税计算器互链成"劳动财务"组合。去重：84 Path 无 补偿/赔偿/仲裁/N+1 命中。难度小。SEO：经济补偿金计算器、N+1赔偿、2N赔偿金、离职补偿怎么算。建议 ID `severance_calculator`、Path `/tools/severance-calculator`。
3. 新晋候选：**工资条生成器（HR 工资表→每人工资条）**。需求证据三重：① 360doc 2025-12-10 财务 Python 实战：150 人公司工资条"打印-裁剪-装袋 3 小时→一键生成 2 分钟"，传统 50 人工资条制作需 9 小时（核对 4h+公式 2h+拆分打印 3h）；② 360doc 2025-12-14 HR 20 个 Excel 函数："工资条：VLOOKUP 批量生成，几百人的工资条分分钟搞定"列为"发钱的大事"；③ Etsy 付费工资条模板 + YouTube Payroll Calculator & Payslip Generator 教程形态验证。可行性：纯前端——上传工资表 Excel（SheetJS 已在栈，沿 sheet_split 解析先例）→逐员工生成工资条卡片（表头项+金额+签名栏）→浏览器打印/PDF 导出（一页多条排版，沿简历制作器打印路线）+单表 xlsx 导出；"工资数据不出浏览器"隐私叙事（工资高度敏感）；与工资个税计算器互链成"HR 财务"组合（算税→发条）。去重：84 Path 无 工资条/payslip 命中（salary_tax_calculator 为个税计算方向不同）。难度小。SEO：工资条生成器、在线工资条、工资条打印。建议 ID `payslip_generator`、Path `/tools/payslip-generator`。
4. 新晋候选：**金额大写转换器**。需求证据三重：① 本日律师用户实名需求——"阿拉伯数字转人民币大写（起诉状/和解协议/收据必备）"（2026-10-17 当天）；② 新浪科技 WPS 人民币大小写教程：用户靠 WPS/Excel 单元格格式做转换，在线免费替代有错位空间；③ 360doc 多篇"X 元大写怎么写"问答（16 元/14 元/5000 元规范写法，"人民币壹拾陆元整"类搜索高频）+ GitHub fastquotes 金额转汉字库 + CSDN 发票金额中文转换实战。可行性：纯前端极小——输入框→人民币大写（壹贰叁肆伍陆柒捌玖+拾佰仟万亿+元角分整，零的取舍规则）+一键复制；可作节奏调节位。去重：84 Path 无 大写/金额大写命中（text_tools 无此功能）。难度小。SEO：金额大写转换、数字转人民币大写、大写金额怎么写。建议 ID `amount_to_chinese`、Path `/tools/amount-to-chinese`。
5. 新晋观察 + 不立项：① **抛货体积重量计算器**（本日快递员用户反馈）：长宽高÷6000→体积重量，与实重取大→计费重量；纯前端小；证据仅单职业一条，进 P1 观察；② **厨房单位换算**（本日厨师用户反馈）：克↔两↔斤↔盎司↔磅↔毫升↔杯↔汤匙互转+菜谱批量识别；纯前端小；证据单职业，进 P1 观察；③ **快递单号查询**（[快递员]）：需快递 100 类后端物流 API，不符合纯前端口径，不立项；④ **时效·期限推算器**（[律师]）：与池内工作日计算器（法定节假日/调休顺延）方向相近，暂不单独立项，并入工作日计算器二期观察；⑤ 既有工具增强项（二维码桌台码批量生成、图片压缩目标体积模式、条码 EAN-13/ITF-14+高度参数生效、文本数字序排序）：归增强清单供后续轮次分发，不在本轮新工具池立项。
6. 无新单页信号侧：① V2EX 近期（开源项目推荐站 Zendot、AI 工作台、LinkJuice 外链填表插件、Perp DEX）或需后端/AI、或插件/桌面形态，无纯前端单页可落地项；② 中文工具种草榜多为旧文回声（FotoJet 在线拼图→池内图片拼图已有覆盖回声；截图/OCR/压缩→桌面软件或 ToolWeb 已有）；③ HN 近期 Show HN（UI Copilot 浏览器插件、Index 浏览器 agent、CloudTabs 远程浏览器）均为插件/AI/服务端形态，无单页可落地项；④ 双11口令红包攻略文属 SEO 营销内容（各家口令每日变），不成立工具需求。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **GB/T 7714 参考文献格式生成器** — P1（顺位递进首选，第三轮新晋连续多轮推荐未被选，证据仍有效）：360doc 参考文献格式痛点文（改 30 篇花一整天仍被退修）+CSDN「退修率 32%、单篇校对 15 分钟」+开源 CSL 生态三重证据；表单输入→国标条目生成（双制式、[J][M][D] 类型标识、等/et al 自动处理）；重型玩家（EndNote/NoteExpress/Zotero）需安装学习，「免注册不出浏览器」差异化；84 Path 无重叠。难度小（可作节奏调节位）。SEO：参考文献格式生成器、GB/T 7714、论文参考文献格式。
2. **经济补偿金/赔偿金计算器（N/N+1/2N）** — P1（本轮新晋）：律师用户反馈实名需求 + 360doc/新浪四重证据；"N+1"为劳动法全网最高频词（违法解除占企业败诉 42%、补偿金算错为最主要败诉原因）；输入入职/离职日期+前 12 月平均工资+解除情形→N/N+1/2N 三档+三倍封顶/12 年封顶/代通知金规则提示；纯前端；与工资个税计算器互链成"劳动财务"组合。难度小。SEO：经济补偿金计算器、N+1赔偿、2N赔偿金。
3. **视频抽帧（视频转图片/封面提取）** — P1（顺位递进，第四轮新晋）：HN Show HN "Video Frame Extractor" 新鲜证据；自媒体封面截取/视频取帧做素材痛点（手机截图精度差、PR/剪映太重）；纯前端 `<video>`+canvas 抽帧→PNG/JPEG 批量下载；开辟「视频工具」新方向；84 Path 无重叠。难度中。SEO：视频抽帧、视频转图片、视频封面提取。

工资条生成器列顺位第四（P1，本轮新晋，HR/财务月度刚需，360doc 双重证据+Etsy/YouTube 形态验证，与工资个税计算器成"HR 财务"组合，难度小）；在线方格纸/稿纸生成器顺位第五（P1，第四轮新晋顺延，中文纸张模板差异化）；金额大写转换器列 P1 节奏调节位（本轮新晋，难度极小，财务/法律/收据刚需）；接龙文本统计顺位顺延；极简简历制作器维持 P1（秋招季+求职组合）；图片裁剪维持节奏调节位；抛货体积重量/厨房单位换算进 P1 观察。

**通用候选表**（2026-10-17 第六轮；双11到手价计算器已实现划出；新晋经济补偿金/赔偿金计算器/工资条生成器/金额大写转换器 P1、抛货体积重量计算器/厨房单位换算 P1（观察）；全量 84 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| GB/T 7714 参考文献格式生成器 | 第三轮新晋（360doc 2025-12-04「参考文献格式乱？AI一键搞定学术规范」：改 30 篇参考文献花一整天仍被指出标注混淆，90% 问题=手动效率低+规范杂；CSDN GBT7714 教程文：引文格式不合规退修率高达 32%、手动校对单篇平均 15 分钟；开源 CSL 生态含高校定制样式）；纯前端表单式生成：作者/篇名/期刊/年/卷期页码/DOI→GB/T 7714-2015 条目（[J][M][D][C][P][S] 类型标识、双制式切换、中文「等」/英文「et al」）；重型玩家（EndNote/NoteExpress/Zotero）需安装学习，「免注册不出浏览器」差异化；84 Path 无重叠 | 小 | P1（顺位递进首选） |
| 经济补偿金/赔偿金计算器（N/N+1/2N） | 本轮新晋（2026-10-17 实名需求：入职/离职日期+前 12 月平均工资→N/N+1/2N，含三倍封顶/12 年封顶；360doc 2025-12-30 辞退补偿实战：2 年 2 个月折 3 个月、奖金津贴须计入基数（约 30% 企业漏算成仲裁焦点）；新浪新闻：N/N+1/2N 三档规则+违法解除占企业败诉 42%、补偿金算错为最主要败诉原因；360doc 2025-12-24："被辞退了，赔偿怎么算？别只知道 N"）；纯前端：解除情形选择→工龄折算 N→三档金额+三倍封顶/12 年封顶/代通知金提示+免责声明；与工资个税计算器互链成「劳动财务」组合；84 Path 无重叠 | 小 | P1（本轮新晋） |
| 视频抽帧（视频转图片/封面提取） | 第四轮新晋（HN Show HN "Video Frame Extractor" 2026-10-07：浏览器上传视频、指定间隔自动抽帧下载，免安装；自媒体做视频封面/缩略图、从视频取某一帧做素材，手机截图精度差、PR/剪映等桌面软件太重）；纯前端 `<video>`+canvas 抽帧→PNG/JPEG 批量下载（间隔秒数/手动打点/缩略图预览勾选），零依赖、文件不出浏览器；开辟「视频工具」新方向；84 Path 无 video/视频/抽帧重叠 | 中 | P1（顺位递进） |
| 工资条生成器（HR 工资表→每人工资条） | 本轮新晋（360doc 2025-12-10 财务 Python 实战：150 人公司工资条「打印-裁剪-装袋 3 小时→一键生成 2 分钟」，50 人传统流程 9 小时；360doc 2025-12-14 HR 20 函数：「工资条：VLOOKUP 批量生成，几百人的工资条分分钟搞定」列为发钱大事；Etsy 付费模板+YouTube Payroll 教程形态验证）；纯前端：上传工资表 Excel（SheetJS 在栈）→逐员工工资条卡片（表头项+金额+签名栏）→浏览器打印/PDF 导出（一页多条）+单表 xlsx 导出；「工资数据不出浏览器」隐私叙事；与工资个税计算器互链成「HR 财务」组合；84 Path 无工资条/payslip 重叠 | 小 | P1（本轮新晋·顺位第四） |
| 在线方格纸/稿纸生成器（打印模板） | 第四轮新晋（HN Show HN 2026-10-16 方格纸生成器：免登录、无水印、真实比例打印，纯前端架构；360doc 2025-12-10「家长们快收藏！发现一个可以打印一切字帖的免费网站」：书法练习纸/米字格/田字格/九宫格/康奈尔笔记/点阵纸/横线纸/作文稿纸，家长打印字帖、学生备稿纸刚需）；SVG/Canvas 渲染模板+参数（格子大小/线条颜色/纸张 A4·A5）+浏览器打印/PDF 导出；田字格/米字格/作文稿纸/拼音格中文差异化 vs Gridzzly/Paper Me；84 Path 无 paper/稿纸/方格重叠 | 小 | P1（顺位第五） |
| 金额大写转换器 | 本轮新晋（2026-10-17 实名需求：阿拉伯数字转人民币大写，起诉状/和解协议/收据必备；新浪科技 WPS 人民币大小写教程：用户靠 WPS/Excel 单元格格式转换，在线免费替代错位；360doc 多篇「X 元大写怎么写」问答+GitHub fastquotes 金额转汉字库+CSDN 发票金额中文转换实战）；纯前端极小：输入→人民币大写（壹贰叁肆伍陆柒捌玖+拾佰仟万亿+元角分整）+一键复制；84 Path 无大写/金额大写命中 | 小 | P1（节奏调节位） |
| 接龙文本统计（粘贴群接龙→解析汇总） | 第四轮新晋（sohu 2026-08-25「微信接龙怎么导出打卡记录」：班长「对着几百条群消息熬夜对账」；163 2026「微信接龙总漏统计？」：群里"张三+2"刷屏混在聊天记录里看不清、序号重复、事后逐条复制整理；sohu 2026-08-28 一起报数种草文：小程序导出 Excel 要开会员、广告多）；差异化「事后整理」vs 一起报数/接龙管家等「发起接龙」小程序：粘贴混乱文本→规则引擎解析（序号/姓名/数量/备注模式识别）→去重/人数汇总→粘贴名单对比「谁没接龙」→CSV 导出；纯前端、数据不出浏览器；84 Path 无接龙重叠 | 中 | P1 |
| 极简简历制作器 | V2EX t/1210967 xukz.cn「Word 改简历调字间距打印格式崩溃」；CSDN IT 简历模板榜 Word 排版难痛点；360doc 2025-12-31 简历制作神器高频痛点；秋招季时令；结构化填写→A4 所见即所得预览→浏览器打印/PDF 导出，localStorage 免注册免上传，「简历不出浏览器」差异化叙事；84 Path 无 resume/简历重叠 | 中 | P1 |
| 课程表生成器 | 第三轮升级（CSDN 2026-01「数字化课程表」：Word/Excel 手工绘制耗时、调课改版易混乱、排版单调；360doc 2025-12-10 教师五大难题列排课为核心难题，重型排课 SaaS 学习曲线长成本高）；可行范围：个人/班级课程表拖拽填课+简易撞课提示+配色模板+打印/PDF 导出（不做全校智能排课算法）；纯前端；84 Path 无重叠 | 中 | P1 |
| 图片裁剪（比例预设+拖拽裁剪框） | pixoate 预设比例 1:1/16:9/4:5+拖拽框实时预览+手机触屏；splitanimage 本地免上传图片套件；YouTube TemplateMaker.in 考试/求职/政府表单照片高频；与 img-resize（指定宽高数值裁剪）差异化明确无重叠；图片旅程线缺环补齐；canvas 纯前端本地免上传 | 小 | P1（节奏调节位） |
| 工作日计算器（含法定节假日/调休） | V2EX PriTime「法定节假日/调休补班重复，国内用户刚需」；yize/chinese-workday 2011-2026 数据+浏览器 CDN；Excel NETWORKDAYS 手工维护节假日痛点；起止日期→工作日天数+单日「要上班吗」查询；与 /tools/calendar（仅展示）无重叠；难度中（年份数据表需年更） | 中 | P1 |
| 图片拼图（网格模板拼图） | 360doc 2026-01-30 四选一首位；Photo Collage Maker 形态：多张图合成一格、网格/异形模板、自定义布局、文字/贴纸；与 nine-grid（九宫格切图，一张图切多格）方向相反无重叠；与 img-stitch（一维长图拼接）形态不同；canvas 纯前端本地免上传 | 小 | P1 |
| 屏幕录制（在线录屏） | 360doc 2026-01-30 宝藏站单列推荐；网易测评三大痛点：免费导出带水印、桌面软件要安装、公司电脑禁装软件只能用网页方案；100% 纯前端（getDisplayMedia+MediaRecorder→webm），免安装无水印文件不出本机；桌面端优先 | 中 | P1（通用顶位备选） |
| cURL 转代码 | 开发者刚需（HN 讨论 + curlconverter 开源库 27+ 语言）；赛道已有成熟免费玩家，垂直小众 | 小 | P1 |
| 浏览器实时听写（麦克风语音转文字） | 第三轮新晋观察（CSDN 会议测评：73% 职场人遇到转写痛点；360doc 2025-12-21 腾讯元宝不限时长免费掀桌子反证全民刚需；HN Show HN BetterWispr 2026-10-12 200 points：本地听写「无账号无云端」是差异化方向；dev.to Whistle 轻量 STT 走红）；Web Speech API SpeechRecognition（Chrome/Edge 中文免费免 key）纯前端实时转写+复制/导出；「录音不出浏览器」对标需上传的 AI 方案；限制：Firefox/Safari 支持差须注明、质量不如 AI 大模型、无说话人分离/总结；赛道被免费 AI 统治，观察为主；84 Path 无重叠 | 小 | P1（观察） |
| 文本敏感信息打码 | 文本身份证/手机号/银行卡号脱敏；未找到强需求信号，运营场景刚需但证据弱 | 小 | P1（观察） |
| Excel 公式中文解释器 | 360doc「Excel 公式机器人」文本指令转公式是 AI 能力、不可做；反向「公式→中文分步解释」纯前端可做：词法拆解+函数中文说明库；证据单薄仅一条，待补强 | 中 | P1（观察） |
| Markdown 表格修复 | 中文全角/emoji 对齐错乱修复；赛道拥挤（tablesgenerator、tableconvert、编辑器插件生态），纯本地免费可差异化 | 小 | P1（末位） |
| 证件照换底色 | CSDN+360doc 实测文再确认刚需（微信小程序爆款均靠 AI 服务器抠图）；发丝级抠图需 AI 分割模型（WASM 版数十 MB），不完全符合纯轻量前端口径，等轻量方案 | 中 | P2（观察） |
| SQLite 在线查看器 | dev.to Tooltri 单次提及；sql.js WASM 纯前端可读 .db 文件；开发者小众 | 中 | P2（观察） |
| 手写模拟器 | 360doc 2026-02-14 萝卜工坊；作业/笔记/贺卡趣味场景；canvas+手写体字库纯前端可做 | 小 | P2（观察） |
| 在线文字转语音（Web Speech API） | 维持观察（赛道被 AI 拟真语音统治——Speechify 50 万+五星、AIVocal 600+音色；Web Speech API 系统语音音质参差、不可定制音色，免登录叙事不足以对冲质量差距；证据仍单薄） | 小 | P2（观察） |
| 隐私政策生成器 | 第三轮新晋观察（FreeTopTools 16 工具清单单列「Business」工具；APP/小程序上架商店强制要求隐私政策文本；表单填空→标准模板条款生成，纯前端；证据单条，赛道已有在线生成器玩家） | 小 | P2（观察） |
| 轻断食计时器 | 第四轮新晋观察（HN Show HN "Intermittent Fasting Calculator" 2026-10-07 新鲜：16:8/14:10/18:6/20:4/OMAD 断食窗口规划+24 小时彩色时间轴+文本/图片/PDF 导出；纯前端可做：方法选择+上餐/目标时间输入→时间轴渲染+本地提醒；国内受众小众、健康类与本站工具定位偏离，观察为主；84 Path 无 fast/断食重叠） | 小 | P2（观察） |

**已实现（双11到手价计算器本轮划出）**：思维导图 → 表格拆分 → 表格合并 → **HEIC 转 JPG（已开发、未可交付——12:30 真机实测失败、生产已回滚，见历史轮次「⚠️ 待修复」）** → 成绩统计分析 → 二手房税费计算器 → 房贷计算器 → PDF 可填写表单制作器（+触屏修复）→ 工资个税计算器（8a6e0cc：七项专项附加扣除+年终奖计税对比，与房贷/二手房税费三向互链成「财务」旅程线）→ 双十一凑单计算器（145e47e+3d02c3c：满减档位自定义+子集和 DP 最小溢出最优组合+「还差 XX 元」提示与候补单品建议，纯前端本地计算）→ 字体版权查询（abe5db0+fd8fc74：canvas 本地字体探测+198 条离线版权库+复制报告，`/tools/font-license-check`）→ **简历预检工具（开发交付：`templates/resume_checker.html`+745 行纯前端规则引擎（技术栈词典 200 词+动作动词库+JD 关键词匹配/ATS 检测/逻辑链检查/雷区清单四模块报告+一键复制），新建「求职工具」品类，`/tools/resume-checker`）** → **在线图表生成器（1c6a9e3+fc135d3：粘贴表格/CSV/Excel 复制行→分隔符自动识别+引号感知解析→柱状/折线/饼/环形四类型自绘 SVG 渲染→1x/2x/3x 高清 PNG 导出，`/tools/chart-generator`）** → **双11到手价计算器（优惠叠加模拟）（2dca60b：商品直降价→店铺券→品类券→跨店满减→会员折扣→红包→以旧换新折价→国补 15%（家电封顶 1500/数码 500/手机 6000 红线）逐层明细+规则提示+平台预设，`/tools/double11-final-price`）**；以上均已从候选池划出，历史记录保留于下方各轮次小节。

**归档说明**：本轮为 10-17 通用调研第六轮（WPS 特别方向 10-15 已结束）——双11到手价计算器交付闭环（2dca60b，`/tools/double11-final-price` 已注册，全量 84 Path），候选池划出；新晋候选「经济补偿金/赔偿金计算器（N/N+1/2N）」P1（本日律师用户反馈实名需求 + 360doc/新浪 web 四重证据，"N+1" 劳动法全网最高频词，与工资个税计算器成"劳动财务"组合）、「工资条生成器」P1（360doc 双重实战证据+Etsy/YouTube 形态验证，HR/财务月度刚需，与工资个税计算器成"HR 财务"组合）、「金额大写转换器」P1（律师用户反馈 + WPS 教程/360doc 问答 web 三重证据，难度极小作节奏调节位）；「抛货体积重量计算器」「厨房单位换算」进 P1 观察（证据均单职业一条）；快递单号查询不立项（需后端物流 API）、时效·期限推算器并入工作日计算器二期观察、既有工具增强项（二维码批量/图片压缩目标体积/条码增强）归增强清单；V2EX/HN/中文种草榜均无单页可落地新信号；WPS 候选表保持冻结归档；仓库 84 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 84 Path，新候选（severance_calculator / payslip_generator / amount_to_chinese 建议 ID）无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-17 09:40 决策轮）

## 今日任务（2026-10-17 09:40 · 产品经理排期决策 ✅）

**交付状态**：10-17 排期决策轮（第五轮研究之后）。在线图表生成器已交付闭环（1c6a9e3 开发交付 + fc135d3 评审 Bug 逐条修复，`grep tools/categories.go` 确认 `/tools/chart-generator` 已注册，全量 83 Path），候选池划出。本轮立项**今日唯一任务：双11到手价计算器（优惠叠加模拟）**。

**选定：双11到手价计算器（优惠叠加模拟）（/tools/double11-final-price）** — 今日唯一任务：
- **时令首选，不让位**：第五轮研究 Top1 推荐，本轮新晋 P1。今日 10-17，10-20 品类专场、10-31 高潮期、11-11 正日——下单决策窗口就在现在，本周上线才能吃到流量，晚一天少一周时令窗口，这是管线今天必须打的子弹。
- **需求证据三重（全为 1~6 天前新鲜）**：① 凤凰网大风号 2026-10-16 实战案例：冰箱 6599→会场直降 6099→店铺券 -300→平台券 -299→国补 15%≈-915→红包 -50→以旧换新 -400→实付约 4135，「有人多掏一千八，差别就在有没有把每一层叠对」；② 新浪攻略 2026-10-11 叠加顺序硬知识：商品直降→店铺券→品类券→跨店满减→会员折扣→红包→以旧换新→国补按剩余实付价×15%（家电封顶 1500/数码封顶 500/手机 ≤6000 红线），「只有算完最终付款金额，才知道哪家平台真正便宜」；③ 凤凰网 2026-10-15 反直觉规则：以旧换新折价缩国补基数（旧机折 500→国补 750→675），「不是叠得越多越好，要自己算清楚」。
- **组合叙事**：已交付 `/tools/double11-bundling-calculator`（凑单选品，子集和 DP 最小溢出）→本工具（单笔订单优惠叠加核算），双向互链成「双11省钱」组合；同属「生活工具」品类。
- **差异化**：纯前端表单按叠加顺序逐步计算，「数据不出浏览器」；平台预设（京东/淘宝）+规则参数可调（规则年年变）；页面内直接给反直觉规则提示（缩基数/6000 红线/分单下单）。
- **去重**：`grep tools/categories.go` 全量 83 Path，无到手价/final price 实质重叠（`double11_bundling_calculator` 为凑单选品方向，功能不同）；ID `double11_final_price_calculator`、Path `/tools/double11-final-price` 无重叠。

**规格**：
1. 输入区：商品活动价（直降后价）+ 各层优惠表单：店铺券金额、品类券金额、跨店满减档位选择、会员折扣选择（无/京东 PLUS 95 折/淘宝 88VIP）、超级红包金额、以旧换新折价、国补资格勾选+品类选择（家电/数码/手机/其他）；平台预设切换（京东/淘宝）自动带入默认档位；「填入示例数据」一键试用（冰箱 6599→4135 实战案例数据）。
2. 计算引擎（JS 纯前端，固定叠加顺序，不可改序）：商品直降价 → -店铺券 → -品类券 → -跨店满减（按档位阶梯，如满 300 减 50/满 600 减 100/满 2000 减 500；金额不足档位则不触发并提示）→ ×会员折扣 → -红包 → -以旧换新折价 → 国补 = 剩余实付价×15%（家电封顶 1500、数码封顶 500、手机按品类封顶+6000 元红线校验）；每层输出金额与剩价明细。
3. 结果区：预计到手价大数字 + 逐层明细清单（每层：层名/扣减额/剩价）+ 节省总额 + 规则提示区（以旧换新缩国补基数提醒/国补不同品类分单下单提示/手机 ≤6000 红线/退货丢国补名额等）。
4. 注册：`tools/categories.go`「生活工具」品类新增 ID `double11_final_price_calculator`、Path `/tools/double11-final-price`（New: true），中英文描述 + SEO keywords（双十一到手价、双11优惠叠加计算器、国补怎么算、到手价计算器）；与 `/tools/double11-bundling-calculator` 双向互链（页面底部「相关工具」+「双11省钱」组合说明）。
5. 纯前端、数据不出浏览器、响应式。

**验收标准**：
- [ ] `/tools/double11-final-price` 可开（200）
- [ ] 实战案例复算：输入 6599（直降 500→6099）、店铺券 300、平台券 299、红包 50、以旧换新 400、国补家电类 → 到手价 ≈ 4135（允许 ±5 舍入误差），明细每层金额对得上叠加顺序
- [ ] 跨店满减档位触发/不触发两种情况正确；会员折扣两种平台正确
- [ ] 国补封顶正确：家电 ≥1500 封顶、手机 ≤6000 红线校验（超 6000 提示不符合国补）
- [ ] 以旧换新缩基数提示出现（输入以旧换新>0 时显示「国补基数已缩小」提醒）
- [ ] 空输入/未勾国补/跨店未达档位等边界给出友好提示，不报错
- [ ] 示例数据一键填入可用
- [ ] 纯前端无后端调用（DevTools Network 抽查）、无第三方计算库
- [ ] `categories.go` 注册完成（「生活工具」品类），首页/导航/sitemap 生效；与凑单计算器双向互链生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/double11_final_price_calculator.html`、`static/js/double11_final_price_calculator.js`（叠加顺序计算引擎+档位规则）、`tools/categories.go`、`templates/double11_bundling_calculator.html`（追加回链）、`BACKLOG.md`（本小节）。

**未选**：GB/T 7714 参考文献格式生成器（P1，难度小，顺位递进留池作节奏调节位：表单生成国标条目，双制式/[J][M][D]/等-et al，证据稳但无时令压力）；视频抽帧（P1，第五轮顺位递进，`<video>`+canvas 纯前端抽帧，开辟「视频工具」新方向，难度中留池，候选下轮）；在线方格纸/稿纸生成器（P1，第四轮新晋，中文纸张模板差异化，留池）；接龙文本统计（P1，「事后整理」差异化，留池）；极简简历制作器（P1，与简历预检成「求职」组合，留后续）；课程表生成器/图片裁剪/医学组合/屏幕录制等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在且为最新；`grep tools/categories.go` 全量 83 Path，仅 `double11-bundling-calculator` 命中双11，功能方向不同不构成重叠，ID `double11_final_price_calculator`、Path `/tools/double11-final-price` 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

> 维护人：产品调研员 · 每日更新（2026-10-17 09:36 第五轮研究）

## 今日任务（2026-10-17 09:36 · 产品调研员研究轮 ✅）

**交付状态**：10-17 通用调研第五轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研）。在线图表生成器已交付闭环（1c6a9e3 开发交付：粘贴表格/CSV/Excel 复制行→分隔符自动识别+引号感知解析→柱状/折线/饼/环形四类型自绘 SVG 渲染→1x/2x/3x PNG 导出+SVG 源码复制；fc135d3 评审必改项修复；`grep tools/categories.go` 确认 Path `/tools/chart-generator` 已注册，全量 83 Path），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮五件事**（09:36 全网调研，通用方向）：
1. 在线图表生成器交付确认：PM 决策轮立项→开发交付（1c6a9e3：四步式布局——粘贴表格数据→图表配置→SVG 预览→导出；node harness 53 项验收自测全过；fc135d3 评审 Bug1/Bug2/Bug3 逐条修复）；`grep tools/categories.go` 确认 Path 已注册（全量 83 Path），与候选池无重叠项残留；候选池划出，已实现清单追加。
2. 新晋时令候选：**双11到手价计算器（优惠叠加模拟）**。需求证据三重（全为 1~6 天前新鲜）：① 凤凰网大风号 2026-10-16 实战案例：冰箱标价 6599 元→会场直降 6099→店铺券 -300→平台券 -299→国补 15%≈-915→红包 -50→以旧换新 -400→最终实付约 4135 元——"同样的机器，有人四千出头拿下，有人多掏一千八，差别就在有没有把每一层都叠对"；② 叠加顺序是硬知识（新浪攻略 2026-10-11）：商品直降→店铺券→品类专项券→跨店满减→会员折扣（PLUS 95 折/88VIP）→超级红包→以旧换新折价→国补按剩余实付价×15%（家电封顶 1500 元/数码封顶 500 元/手机 ≤6000 元红线）；"只有算完最终付款金额，才知道哪家平台真正便宜""真正要比的是最终付款金额"；③ 反直觉规则（凤凰网 2026-10-15）：以旧换新折价会缩小国补基数（旧机折 500 元→国补基数 5000→4500→国补 750→675），"不是叠得越多越好，要自己算清楚"；另附退货丢国补名额、不同品类须分单下单等规则提示。可行性：纯前端表单——输入商品活动价+各层优惠（店铺券/品类券金额/跨店满减档位/会员折扣选择/红包金额/以旧换新折价/国补资格+品类）→按叠加顺序逐步计算→每层明细+预计到手价+规则提示（国补分单/6000 红线/缩基数提醒）；平台预设（京东/淘宝）+规则参数可调（规则年年变）；纯前端、数据不出浏览器。差异化：已交付的凑单计算器解决"凑满减选品"（子集和 DP 最小溢出）；本工具解决"单笔订单优惠叠加模拟"，与凑单工具互链成「双11省钱」组合。去重：83 Path 无 到手价/final price 实质重叠（`double11_bundling_calculator` 为凑单选品，功能方向不同）；建议 ID `double11_final_price_calculator`、Path `/tools/double11-final-price`。难度小。时令紧迫：双11周期 10-12~11-13，10-20 品类专场、10-31 高潮期、11-10/11-11 正日——下单决策窗口就在现在，本周上线才能吃到流量。SEO：双十一到手价、双11优惠叠加计算器、国补怎么算、到手价计算。
3. 无新单页信号侧：① V2EX：todo 软件讨论帖（滴答清单/微软 Todo/滴答/Obsidian 日志之争，无单页信号）；PriTime 自荐帖（待办+课程表视图，课程表为已覆盖候选回声）；「AI 小说工具」帖（AI 能力）；② r/AskReddit 2026-09-02「免费网站」榜单：Sejda 可填写 PDF（ToolWeb 已有 pdf-form-maker）、remove.bg 抠图（AI 能力已评估 P2）、hrefhunter 死链检查（站长向非单页）——无新单页项；③ HN 近期 Show HN：RoamingEye 3D 卫星影像地球（WebGL+卫星数据，太重）、Petal 开源屏幕共享（非单页）、Agentic Web Check（开发者 CLI）、CircadianLab（WebGPU 专业照明模拟，垂直小众）——无单页可落地项；④ 360doc 工具种草：近期多为 02-03 月旧文回声（智能抠图→AI 能力；ChartCube 图表→已交付；萝卜工坊手写模拟器→P2 观察；简历下载站→模板下载站非单页工具）；⑤ 双11口令红包攻略文属 SEO 营销内容（各家口令每日变），不成立工具需求。
4. WPS 候选表保持冻结归档（本轮为通用方向）。
5. 全量 83 Path 核对：新候选（double11_final_price_calculator 建议 ID）无重叠。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **双11到手价计算器（优惠叠加模拟）** — P1（本轮新晋·时令首选）：凤凰网/新浪双11攻略（1~6 天前新鲜）三重证据——冰箱 6599→4135 实战案例（"有人多掏一千八，差别就在有没有把每一层叠对"）+叠加顺序硬知识（直降→店铺券→品类券→跨店满减→会员折扣→红包→以旧换新→国补按剩余实付价×15%）+"只有算完最终付款金额，才知道哪家平台真正便宜"；以旧换新缩国补基数等反直觉规则；与已交付凑单计算器互链成「双11省钱」组合；时令紧迫（10-20 品类专场/10-31 高潮期/11-11 正日，下单决策窗口就在现在）。难度小。SEO：双十一到手价、双11优惠叠加计算器、国补怎么算。
2. **GB/T 7714 参考文献格式生成器** — P1（顺位递进，第三轮新晋）：360doc 参考文献格式痛点文（改 30 篇花一整天仍被退修）+CSDN「退修率 32%、单篇校对 15 分钟」+开源 CSL 生态三重证据；表单输入→国标条目生成（双制式、[J][M][D] 类型标识、等/et al 自动处理）；重型玩家（EndNote/NoteExpress/Zotero）需安装学习，「免注册不出浏览器」差异化；83 Path 无重叠。难度小。SEO：参考文献格式生成器、GB/T 7714、论文参考文献格式。
3. **视频抽帧（视频转图片/封面提取）** — P1（顺位递进，第四轮新晋）：HN Show HN "Video Frame Extractor" 新鲜证据；自媒体封面截取/视频取帧做素材痛点（手机截图精度差、PR/剪映太重）；纯前端 `<video>`+canvas 抽帧→PNG/JPEG 批量下载；开辟「视频工具」新方向；83 Path 无重叠。难度中。SEO：视频抽帧、视频转图片、视频封面提取。

在线方格纸/稿纸生成器列顺位第四（P1，第四轮新晋，中文纸张模板差异化明确，难度小）；接龙文本统计列顺位第五（P1，第四轮新晋，「事后整理」差异化 vs 发起式小程序，难度中）；极简简历制作器维持 P1（秋招季+求职组合）；图片裁剪维持节奏调节位；轻断食计时器进 P2 观察。

**通用候选表**（2026-10-17 第五轮；在线图表生成器已实现划出；新晋双11到手价计算器 P1（时令首选）；全量 83 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 双11到手价计算器（优惠叠加模拟） | 本轮新晋（凤凰网大风号 2026-10-16：冰箱 6599→会场直降 6099→店铺券 -300→平台券 -299→国补 15%≈-915→红包 -50→以旧换新 -400→实付约 4135，"有人多掏一千八，差别就在有没有把每一层叠对"；新浪攻略 2026-10-11：叠加顺序商品直降→店铺券→品类券→跨店满减→会员折扣→红包→以旧换新→国补按剩余实付价×15%（家电封顶 1500/数码封顶 500/手机 ≤6000 红线），"只有算完最终付款金额，才知道哪家平台真正便宜"；凤凰网 2026-10-15：以旧换新折价缩国补基数，"不是叠得越多越好，要自己算清楚"）；纯前端表单按叠加顺序逐步计算+每层明细+规则提示（国补分单/6000 红线/缩基数），平台预设+规则参数可调；与凑单计算器互链成「双11省钱」组合（凑单选品→叠加核算）；时令紧迫：10-20 品类专场/10-31 高潮期/11-11 正日，本周上线才能吃到流量；83 Path 无重叠 | 小 | P1（本轮新晋·时令首选） |
| GB/T 7714 参考文献格式生成器 | 第三轮新晋（360doc 2025-12-04「参考文献格式乱？AI一键搞定学术规范」：改 30 篇参考文献花一整天仍被指出标注混淆，90% 问题=手动效率低+规范杂；CSDN GBT7714 教程文：引文格式不合规退修率高达 32%、手动校对单篇平均 15 分钟；开源 CSL 生态含高校定制样式）；纯前端表单式生成：作者/篇名/期刊/年/卷期页码/DOI→GB/T 7714-2015 条目（[J][M][D][C][P][S] 类型标识、双制式切换、中文「等」/英文「et al」）；重型玩家（EndNote/NoteExpress/Zotero）需安装学习，「免注册不出浏览器」差异化；83 Path 无重叠 | 小 | P1（顺位递进） |
| 视频抽帧（视频转图片/封面提取） | 第四轮新晋（HN Show HN "Video Frame Extractor" 2026-10-07：浏览器上传视频、指定间隔自动抽帧下载，免安装；自媒体做视频封面/缩略图、从视频取某一帧做素材，手机截图精度差、PR/剪映等桌面软件太重）；纯前端 `<video>`+canvas 抽帧→PNG/JPEG 批量下载（间隔秒数/手动打点/缩略图预览勾选），零依赖、文件不出浏览器；开辟「视频工具」新方向；83 Path 无 video/视频/抽帧重叠 | 中 | P1（顺位递进） |
| 在线方格纸/稿纸生成器（打印模板） | 第四轮新晋（HN Show HN 2026-10-16 方格纸生成器：免登录、无水印、真实比例打印，纯前端架构，20 小时前新鲜；360doc 2025-12-10「家长们快收藏！发现一个可以打印一切字帖的免费网站」：书法练习纸/米字格/田字格/九宫格/康奈尔笔记/点阵纸/横线纸/作文稿纸，家长打印字帖、学生备稿纸刚需）；SVG/Canvas 渲染模板+参数（格子大小/线条颜色/纸张 A4·A5）+浏览器打印/PDF 导出；田字格/米字格/作文稿纸/拼音格中文差异化 vs Gridzzly/Paper Me；83 Path 无 paper/稿纸/方格重叠 | 小 | P1（顺位第四） |
| 接龙文本统计（粘贴群接龙→解析汇总） | 第四轮新晋（sohu 2026-08-25「微信接龙怎么导出打卡记录」：班长「对着几百条群消息熬夜对账」；163 2026「微信接龙总漏统计？」：群里"张三+2"刷屏混在聊天记录里看不清、序号重复、事后逐条复制整理；sohu 2026-08-28 一起报数种草文：小程序导出 Excel 要开会员、广告多）；差异化「事后整理」vs 一起报数/接龙管家等「发起接龙」小程序：粘贴混乱文本→规则引擎解析（序号/姓名/数量/备注模式识别）→去重/人数汇总→粘贴名单对比「谁没接龙」→CSV 导出；纯前端、数据不出浏览器；83 Path 无接龙重叠 | 中 | P1（顺位第五） |
| 极简简历制作器 | V2EX t/1210967 xukz.cn「Word 改简历调字间距打印格式崩溃」；CSDN IT 简历模板榜 Word 排版难痛点；360doc 2025-12-31 简历制作神器高频痛点；秋招季时令；结构化填写→A4 所见即所得预览→浏览器打印/PDF 导出，localStorage 免注册免上传，「简历不出浏览器」差异化叙事；83 Path 无 resume/简历重叠 | 中 | P1 |
| 课程表生成器 | 第三轮升级（CSDN 2026-01「数字化课程表」：Word/Excel 手工绘制耗时、调课改版易混乱、排版单调；360doc 2025-12-10 教师五大难题列排课为核心难题，重型排课 SaaS 学习曲线长成本高）；可行范围：个人/班级课程表拖拽填课+简易撞课提示+配色模板+打印/PDF 导出（不做全校智能排课算法）；纯前端；83 Path 无重叠 | 中 | P1 |
| 图片裁剪（比例预设+拖拽裁剪框） | pixoate 预设比例 1:1/16:9/4:5+拖拽框实时预览+手机触屏；splitanimage 本地免上传图片套件；YouTube TemplateMaker.in 考试/求职/政府表单照片高频；与 img-resize（指定宽高数值裁剪）差异化明确无重叠；图片旅程线缺环补齐；canvas 纯前端本地免上传 | 小 | P1（节奏调节位） |
| 工作日计算器（含法定节假日/调休） | V2EX PriTime「法定节假日/调休补班重复，国内用户刚需」；yize/chinese-workday 2011-2026 数据+浏览器 CDN；Excel NETWORKDAYS 手工维护节假日痛点；起止日期→工作日天数+单日「要上班吗」查询；与 /tools/calendar（仅展示）无重叠；难度中（年份数据表需年更） | 中 | P1 |
| 图片拼图（网格模板拼图） | 360doc 2026-01-30 四选一首位；Photo Collage Maker 形态：多张图合成一格、网格/异形模板、自定义布局、文字/贴纸；与 nine-grid（九宫格切图，一张图切多格）方向相反无重叠；与 img-stitch（一维长图拼接）形态不同；canvas 纯前端本地免上传 | 小 | P1 |
| 屏幕录制（在线录屏） | 360doc 2026-01-30 宝藏站单列推荐；网易测评三大痛点：免费导出带水印、桌面软件要安装、公司电脑禁装软件只能用网页方案；100% 纯前端（getDisplayMedia+MediaRecorder→webm），免安装无水印文件不出本机；桌面端优先 | 中 | P1（通用顶位备选） |
| cURL 转代码 | 开发者刚需（HN 讨论 + curlconverter 开源库 27+ 语言）；赛道已有成熟免费玩家，垂直小众 | 小 | P1 |
| 浏览器实时听写（麦克风语音转文字） | 第三轮新晋观察（CSDN 会议测评：73% 职场人遇到转写痛点；360doc 2025-12-21 腾讯元宝不限时长免费掀桌子反证全民刚需；HN Show HN BetterWispr 2026-10-12 200 points：本地听写「无账号无云端」是差异化方向；dev.to Whistle 轻量 STT 走红）；Web Speech API SpeechRecognition（Chrome/Edge 中文免费免 key）纯前端实时转写+复制/导出；「录音不出浏览器」对标需上传的 AI 方案；限制：Firefox/Safari 支持差须注明、质量不如 AI 大模型、无说话人分离/总结；赛道被免费 AI 统治，观察为主；83 Path 无重叠 | 小 | P1（观察） |
| 文本敏感信息打码 | 文本身份证/手机号/银行卡号脱敏；未找到强需求信号，运营场景刚需但证据弱 | 小 | P1（观察） |
| Excel 公式中文解释器 | 360doc「Excel 公式机器人」文本指令转公式是 AI 能力、不可做；反向「公式→中文分步解释」纯前端可做：词法拆解+函数中文说明库；证据单薄仅一条，待补强 | 中 | P1（观察） |
| Markdown 表格修复 | 中文全角/emoji 对齐错乱修复；赛道拥挤（tablesgenerator、tableconvert、编辑器插件生态），纯本地免费可差异化 | 小 | P1（末位） |
| 证件照换底色 | CSDN+360doc 实测文再确认刚需（微信小程序爆款均靠 AI 服务器抠图）；发丝级抠图需 AI 分割模型（WASM 版数十 MB），不完全符合纯轻量前端口径，等轻量方案 | 中 | P2（观察） |
| SQLite 在线查看器 | dev.to Tooltri 单次提及；sql.js WASM 纯前端可读 .db 文件；开发者小众 | 中 | P2（观察） |
| 手写模拟器 | 360doc 2026-02-14 萝卜工坊；作业/笔记/贺卡趣味场景；canvas+手写体字库纯前端可做 | 小 | P2（观察） |
| 在线文字转语音（Web Speech API） | 维持观察（赛道被 AI 拟真语音统治——Speechify 50 万+五星、AIVocal 600+音色；Web Speech API 系统语音音质参差、不可定制音色，免登录叙事不足以对冲质量差距；证据仍单薄） | 小 | P2（观察） |
| 隐私政策生成器 | 第三轮新晋观察（FreeTopTools 16 工具清单单列「Business」工具；APP/小程序上架商店强制要求隐私政策文本；表单填空→标准模板条款生成，纯前端；证据单条，赛道已有在线生成器玩家） | 小 | P2（观察） |
| 轻断食计时器 | 第四轮新晋观察（HN Show HN "Intermittent Fasting Calculator" 2026-10-07 新鲜：16:8/14:10/18:6/20:4/OMAD 断食窗口规划+24 小时彩色时间轴+文本/图片/PDF 导出；纯前端可做：方法选择+上餐/目标时间输入→时间轴渲染+本地提醒；国内受众小众、健康类与本站工具定位偏离，观察为主；83 Path 无 fast/断食重叠） | 小 | P2（观察） |

**交付核对**：本地当前分支 muse/dev-20260929；`grep tools/categories.go` 全量 83 Path，新候选（double11_final_price_calculator 建议 ID）无重叠；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

> 维护人：产品经理 · 每日排期（2026-10-17 07:40 决策轮）

## 今日任务（2026-10-17 07:40 · 产品经理排期决策 ✅）

**交付状态**：10-17 排期决策轮（第四轮研究之后）。简历预检工具已交付闭环（开发交付 ✅，`templates/resume_checker.html`+745 行纯前端规则引擎+新建「求职工具」品类，全量 82 Path），候选池划出。按第四轮研究 Top3 顺位递进，本轮立项**唯一开发任务：在线图表生成器（数据粘贴→图表导出）**。

**选定：在线图表生成器（数据粘贴→图表导出）（/tools/chart-generator）** — 今日唯一任务：
- **顺位递进**：第四轮研究轮 Top3 顺位首选推荐，**连续多轮推荐未被选，证据仍有效**，本轮不再让位。
- **需求证据三重**：① 360doc 咖喱君「文字一键转图表」种草；② 支付宝 ChartCube 上传 Excel/CSV 生成图表、导出 PNG/PDF 的高频办公形态；③ CSDN 论文图表工具文（学术图表刚需）。场景横跨通用办公（汇报 PPT 配图）、自媒体（公众号数据配图）、学生（课程报告图表）。
- **组合叙事**：与成绩统计分析（`/tools/score-stats`，自绘柱状图）双向互链，建成「数据」旅程线（数据处理→图表展示）；同属「表格工具」品类，品类心智强化。
- **差异化叙事**：「数据不出浏览器」——粘贴表格/CSV→图表，纯前端自绘 SVG（零依赖、不引 ECharts 等重型库）、高清 PNG 导出；对标 ChartCube/在线图表站需上传数据或登录的路径，免注册免上传。
- **去重**：`grep tools/categories.go` 全量 82 Path，无 chart/图表生成器实质重叠（`score_stats` 自绘柱状图仅为成绩分布展示，不构成图表工具重叠；`fancy_fonts` 为花体字生成器方向不同）；ID `chart_generator`、Path `/tools/chart-generator` 无重叠。
- **技术就绪**：纯前端——CSV/TSV 粘贴解析（兼容 Excel 直接复制行、自动识别表头行）、图表类型切换（柱状图/折线图/饼图/环形图）、X 轴列与数值列映射选择、样式参数（标题/副标题、配色主题、网格线开关、数据标签开关）、自绘 SVG 渲染（坐标轴刻度自动计算、图例、响应式）、canvas 转绘高清 PNG 导出（2x/3x）、SVG 源码一键复制。已知限制：复杂多维数据透视不做，只做「一张表→一张图」的轻量路径，页面须注明。

**规格**：
1. 输入区：表格数据粘贴 textarea（CSV/TSV/Excel 复制行兼容）+ 「填入示例数据」一键试用 + 粘贴后数据预览表（可勾选「首行为表头」）；空输入/解析失败友好提示。
2. 图表配置区：图表类型切换（柱状图/折线图/饼图/环形图）；X 轴分类列与数值列下拉映射（多数值列可选分组对比）；标题/副标题输入；配色主题（3-4 套预设）；网格线/数据标签开关；饼图显示百分比开关。
3. 渲染区：自绘 SVG 图表（坐标轴、刻度、图例、数据标签），零第三方图表库；响应式宽度；深色模式适配（如站点有）。
4. 导出区：高清 PNG 导出（1x/2x/3x 可选）+ SVG 源码一键复制 + 「数据不出浏览器」隐私声明（显眼位置）。
5. 注册：`tools/categories.go`「表格工具」品类新增 ID `chart_generator`、Path `/tools/chart-generator`（New: true），中英文描述 + SEO keywords（在线图表生成、柱状图生成器、折线图生成器、饼图生成器、数据可视化、CSV 转图表）；与 `/tools/score-stats` 双向互链（页面底部「相关工具」）。

**验收标准**：
- [ ] `/tools/chart-generator` 可开（200）
- [ ] 粘贴 CSV/Excel 复制行正确解析并预览（构造 3 组数据：标准表头表/无表头表/含空值脏数据）
- [ ] 柱状图/折线图/饼图/环形图四种类型切换渲染正确（坐标轴刻度、图例、数据标签抽查）
- [ ] X 轴列/数值列映射切换生效；多数值列分组对比正确
- [ ] PNG 导出（2x）图片清晰可用；SVG 源码复制可用
- [ ] 空输入/解析失败不报错，给出友好提示
- [ ] 隐私声明显眼
- [ ] 纯前端无后端调用、无数据外发（DevTools Network 抽查；零第三方图表库）
- [ ] `categories.go` 注册完成（「表格工具」品类），首页列表/导航/SEO 配置生效；与成绩统计互链生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/chart_generator.html`、`static/js/chart_generator.js`（CSV 解析+自绘 SVG 渲染引擎+PNG 导出）、`tools/categories.go`、`BACKLOG.md`（本小节）。

**未选**：GB/T 7714 参考文献格式生成器（P1，难度小，留池作节奏调节位：表单式生成国标条目，双制式/[J][M][D] 标识/等-et al）；视频抽帧（P1，第四轮新晋，`<video>`+canvas 纯前端抽帧，开辟「视频工具」新方向，证据新鲜留池观察一轮）；在线方格纸/稿纸生成器（P1，本轮新晋，中文纸张模板差异化）；接龙文本统计（P1，本轮新晋，「事后整理」差异化）；极简简历制作器（P1，与简历预检成「求职」组合，留后续）；课程表生成器/图片裁剪/医学组合/屏幕录制等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 82 Path，无 chart/图表生成器实质命中，ID `chart_generator`、Path `/tools/chart-generator` 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

> 维护人：前端开发 · 每日迭代（2026-10-17 图表生成器开发交付 ✅）

## 开发交付（2026-10-17 · 在线图表生成器 ✅）

**交付状态**：本轮唯一任务「在线图表生成器（数据粘贴→图表导出）」开发完成，已提交推送到开发分支 `muse/dev-20260929`，待测试轮与部署 QA。

**实现内容**：
- `templates/chart_generator.html`：单页工具模板（SEO meta+canonical+JSON-LD），页首绿色「数据不出浏览器」隐私横幅 + 蓝色「一张表→一张图」轻量路径说明；四步式布局：①粘贴表格数据（textarea + 示例①季度销售/示例②渠道占比 + 清空 + 「首行为表头」自动识别可手动改）②图表配置（四类型 tab 切换、X 轴列下拉、数值列多选分组对比、标题/副标题、4 套配色主题、网格线/数据标签/饼图百分比开关）③图表预览 ④导出（1x/2x/3x 清晰度 + PNG 下载 + SVG 源码复制）；底部使用说明含与 `/tools/score-stats` 的「统计→图表」旅程线互链。
- `static/js/chart_generator.js`（纯前端零网络请求）：分隔符自动识别（逗号/制表/分号/竖线，Excel 直接复制行兼容）+ 引号感知 CSV 行解析（含 `""` 转义）+ 空行跳过计数 + 首行表头自动识别 + 数值列自动识别（>50% 数字）；自绘 SVG 渲染引擎——柱状图（分组并排、负值零线虚线）、折线图（多系列+数据点+缺口跳过）、饼图/环形图（百分比标签、>12 类自动前 11+「其他」合并、负值/全零友好报错）、nice numbers 刻度自动计算、图例自动换行、多行/长标签旋转；canvas 转绘高清 PNG 导出（白底、1x/2x/3x）+ clipboard 双通道 SVG 复制；数值支持小数/负数/千分位/「60%」写法。
- `tools/categories.go`：「表格工具」品类新增 ID `chart_generator`、Path `/tools/chart-generator`（New:true），中英文描述 + SEO keywords；首页/导航/sitemap 自动生效。
- `templates/score_stats.html`：使用说明追加回链（「统计→图表」旅程线），与本工具双向互链。
- 本文件（BACKLOG.md）：本小节交付记录。

**验收自测**（node harness，53 项全过）：
- [x] `/tools/chart-generator` 可开（200），JS 200，首页/sitemap 均收录
- [x] 三组数据解析：标准表头表（空行计数+表头自动识别）/无表头表（制表分隔）/脏数据（引号内逗号、空单元格、千分位）
- [x] 四种图表 SVG 产出：柱状 3 类×2 列=6 柱、折线负值零线、饼图 5 切片百分比、环形中心总计、13 类合并 12 片
- [x] 刻度自动计算（正/负/等值三种区间）、图例/数据标签/标题渲染
- [x] 负值饼图、全零饼图、空输入、未选数值列均友好报错
- [x] 隐私声明显眼（页首绿横幅 + 使用说明均含「数据不出浏览器」）
- [x] 纯前端零后端调用、零第三方图表库（JS 内零 fetch/XHR；页面仅加载站内 CSS/JS 与 Google Fonts 图标字体）
- [x] 与成绩统计双向互链生效（双方页面均可点到对方）
- [x] SVG 输出 XML 合法、柱体几何落在绘图区内；模板内 23 个 JS 引用 ID 全存在

**评审反馈修复（2026-10-17 第2轮，评审意见逐条修复 ✅）**：
- [x] Bug1：renderChart() 首行加 `showError('')`——列映射变更/类型 tab/标题/开关等直接走 renderChart() 的路径不再残留红色错误条
- [x] Bug2：先算 `vCols = state.valueCols.filter(c < colCount)` 再用 `if (!vCols.length)` 做报错分支，删掉重复声明——粘贴更少列新数据后旧索引不再渲染空坐标轴
- [x] Bug3：renderPie() 单分类（a1-a ≥ 2π-1e-4）画整圆——饼图用 `<circle r=R>`，环形图再叠白色 `<circle r=r0>`，中心文字层叠正常；多分类仍走 arc 切片
- [x] 可选打磨：refreshParsedKeepHeader() 同步刷新 #cg-header-auto 自动识别提示文案
- [x] node 单测 29 项全过（含单分类饼/环形图整圆、越界 vCols、源码断言、纯函数回归）

# ToolWeb 需求 Backlog

> 维护人：产品调研员 · 每日更新（2026-10-17 07:36 第四轮研究）

## 今日任务（2026-10-17 07:36 · 产品调研员研究轮 ✅）

**交付状态**：10-17 通用调研第四轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研）。简历预检工具本轮已交付闭环（开发交付：`templates/resume_checker.html`+745 行纯前端规则引擎 JS+新建「求职工具」品类；`grep tools/categories.go` 确认 Path `/tools/resume-checker` 已注册，全量 82 Path），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮六件事**（07:36 全网调研，通用方向）：
1. 简历预检工具交付确认：开发交付轮已闭环（简历/JD 双输入→四模块报告：JD 关键词匹配度/ATS 友好度检测/「做了什么→结果如何」逻辑链检查/雷区清单；一键复制诊断报告；「简历文本不出浏览器」隐私横幅）；`grep tools/categories.go` 确认 Path 已注册（全量 82 Path），与候选池无重叠项残留；候选池划出，已实现清单追加。
2. 新晋候选：**视频抽帧（视频转图片/封面提取）**。需求证据：HN Show HN "Video Frame Extractor"（2026-10-07，新鲜）：浏览器上传视频、指定时间间隔自动抽帧下载，免安装；痛点：自媒体做视频封面/缩略图、从视频取某一帧做素材，手机截图精度差、PR/剪映等桌面软件太重。可行性：纯前端 `<video>` + canvas 抽帧→PNG/JPEG 批量下载（指定间隔秒数/手动打点/全量缩略图预览勾选），零依赖、文件不出浏览器。差异化：对标剪映/PR「导出静帧」的重型路径，网页轻量即用。去重：82 Path 无 video/视频/抽帧命中。难度中。SEO：视频抽帧、视频转图片、视频封面提取。建议 ID `video_frame_extractor`、Path `/tools/video-frame-extractor`。
3. 新晋候选：**在线方格纸/稿纸生成器（打印模板）**。需求证据双重：① HN Show HN "A graph paper generator that renders vector PDFs in the browser"（2026-10-16，20 小时前新鲜）：免登录、无水印、真实比例打印，纯前端架构；② 360doc 2025-12-10「家长们快收藏！发现一个可以打印一切字帖的免费网站」（Paper Me 种草）：书法练习纸/米字格/田字格/九宫格/康奈尔笔记/点阵纸/横线纸/作文稿纸/乐谱纸——家长打印字帖、学生备稿纸刚需。可行性：纯前端 SVG/Canvas 渲染模板（方格纸/田字格/米字格/九宫格/横线纸/点阵纸/作文稿纸 400·600 格/康奈尔笔记/拼音格）+参数（格子大小/线条颜色/纸张 A4·A5）+浏览器打印/PDF 导出。差异化：Gridzzly/Paper Me 缺中文场景（田字格/米字格/作文稿纸），「中文纸张模板+免费无水印」错位。去重：82 Path 无 paper/稿纸/方格命中（mind_map 为思维导图，方向不同）。难度小。SEO：方格纸打印、作文稿纸、田字格打印、在线稿纸生成。建议 ID `printable_paper`、Path `/tools/printable-paper`。
4. 新晋候选：**接龙文本统计（粘贴群接龙→解析汇总）**。需求证据三重：① sohu 2026-08-25「微信接龙怎么导出打卡记录」：班长发完接龙「对着几百条群消息熬夜对账」；② 163 2026「微信接龙总漏统计？这招让数据秒变 Excel 表」：群里"张三+2""李四+1"刷屏混在聊天记录里看不清、序号重复、事后一条条复制整理；③ sohu 2026-08-28 一起报数种草文：换过好几个小程序，「导出 Excel 要开会员、弹窗广告比表单还多」。差异化：现有玩家（一起报数/接龙管家/问卷星）都是「发起接龙」小程序形态；本工具做「事后整理」——已经用群聊刷屏接完龙，粘贴混乱文本→规则引擎解析（序号/姓名/数量/备注模式识别）→去重/人数汇总→粘贴名单对比「谁没接龙」→CSV 导出。纯前端、数据不出浏览器。去重：82 Path 无 接龙/jielong 命中。难度中（解析规则需容错多种接龙格式）。SEO：接龙统计、微信接龙整理、接龙汇总导出。建议 ID `jie_long_parser`、Path `/tools/jielong-parser`。
5. 新晋观察：**轻断食计时器**。需求证据：HN Show HN "Intermittent Fasting Calculator"（2026-10-07 新鲜）：16:8/14:10/18:6/20:4/OMAD 断食窗口规划+24 小时彩色时间轴+文本/图片/PDF 导出。纯前端可做（方法选择+上餐/目标时间输入→时间轴渲染+本地提醒）。限制：国内受众小众、健康类与本站工具定位偏离，进 P2 观察。去重：82 Path 无 fast/断食命中。难度小。
6. 无新单页信号侧：① 中文工具榜多为已覆盖项回声（PDF 转 Word 微信小程序——需后端或 AI，非单页；降 AI 工具——AI 能力；在线文本处理器 rhihi.com——文本工具簇已有覆盖；重装驱动/截图软件——桌面端）；② V2EX 近期（PREX 交易研究 AI Agent、A 股盘后复盘桌面应用、AI 自动填表 Chrome 插件、600+ 工具站 fly63）或需后端/AI、或桌面端/插件形态，无纯前端单页可落地项；③ 360doc 研究生综述文（literfy.ai/Citely.ai）为 AI 能力+文献数据库后端，不可做。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **在线图表生成器（数据粘贴→图表导出）** — P1（顺位首选，连续多轮推荐未被选，证据仍有效）：360doc 咖喱君「文字一键转图表」+支付宝 ChartCube 上传 Excel/CSV 生成图表导出 PNG/PDF+CSDN 论文图表工具文；粘贴表格/CSV→柱状图/折线图/饼图→自绘 SVG 零依赖→PNG 导出；与成绩统计互链成「数据」旅程线；通用办公/自媒体/学生场景。难度中。SEO：在线图表生成、柱状图生成器、数据可视化。
2. **GB/T 7714 参考文献格式生成器** — P1（顺位递进，上轮新晋）：360doc 参考文献格式痛点文（改 30 篇花一整天仍被退修）+CSDN「退修率 32%、单篇校对 15 分钟」+开源 CSL 生态三重证据；表单输入→国标条目生成（双制式、[J][M][D] 类型标识、等/et al 自动处理）；重型玩家（EndNote/NoteExpress/Zotero）需安装学习，「免注册不出浏览器」差异化；82 Path 无重叠。难度小。SEO：参考文献格式生成器、GB/T 7714、论文参考文献格式。
3. **视频抽帧（视频转图片/封面提取）** — P1（本轮新晋）：HN Show HN "Video Frame Extractor" 新鲜证据；自媒体封面截取/视频取帧做素材痛点（手机截图精度差、PR/剪映太重）；纯前端 `<video>`+canvas 抽帧→PNG/JPEG 批量下载；开辟「视频工具」新方向；82 Path 无重叠。难度中。SEO：视频抽帧、视频转图片、视频封面提取。

在线方格纸/稿纸生成器列顺位第四（P1，本轮新晋，中文纸张模板差异化明确，难度小）；接龙文本统计列顺位第五（P1，本轮新晋，「事后整理」差异化 vs 发起式小程序，难度中）；极简简历制作器维持 P1（秋招季+求职组合）；图片裁剪维持节奏调节位；轻断食计时器进 P2 观察。

**通用候选表**（2026-10-17 第四轮；简历预检工具已实现划出；新晋视频抽帧/在线方格纸·稿纸生成器/接龙文本统计 P1、轻断食计时器 P2 观察；全量 82 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 在线图表生成器（数据粘贴→图表导出） | 360doc 咖喱君「文字一键转图表」、支付宝 ChartCube 上传 Excel/CSV 生成图表导出 PNG/PDF、CSDN 论文图表工具文；粘贴表格/CSV→柱状图/折线图/饼图→自绘 SVG 零依赖→PNG 导出；与成绩统计互链成「数据」旅程线；通用办公/自媒体/学生场景 | 中 | P1（顺位首选） |
| GB/T 7714 参考文献格式生成器 | 上轮新晋（360doc 2025-12-04「参考文献格式乱？AI一键搞定学术规范」：改 30 篇参考文献花一整天仍被指出标注混淆，90% 问题=手动效率低+规范杂；CSDN GBT7714 教程文：引文格式不合规退修率高达 32%、手动校对单篇平均 15 分钟；开源 CSL 生态含高校定制样式）；纯前端表单式生成：作者/篇名/期刊/年/卷期页码/DOI→GB/T 7714-2015 条目（[J][M][D][C][P][S] 类型标识、双制式切换、中文「等」/英文「et al」）；重型玩家（EndNote/NoteExpress/Zotero）需安装学习，「免注册不出浏览器」差异化；82 Path 无重叠 | 小 | P1（顺位递进） |
| 视频抽帧（视频转图片/封面提取） | 本轮新晋（HN Show HN "Video Frame Extractor" 2026-10-07：浏览器上传视频、指定间隔自动抽帧下载，免安装；自媒体做视频封面/缩略图、从视频取某一帧做素材，手机截图精度差、PR/剪映等桌面软件太重）；纯前端 `<video>`+canvas 抽帧→PNG/JPEG 批量下载（间隔秒数/手动打点/缩略图预览勾选），零依赖、文件不出浏览器；开辟「视频工具」新方向；82 Path 无 video/视频/抽帧重叠 | 中 | P1（本轮新晋） |
| 在线方格纸/稿纸生成器（打印模板） | 本轮新晋（HN Show HN 2026-10-16 方格纸生成器：免登录、无水印、真实比例打印，纯前端架构，20 小时前新鲜；360doc 2025-12-10「家长们快收藏！发现一个可以打印一切字帖的免费网站」：书法练习纸/米字格/田字格/九宫格/康奈尔笔记/点阵纸/横线纸/作文稿纸，家长打印字帖、学生备稿纸刚需）；SVG/Canvas 渲染模板+参数（格子大小/线条颜色/纸张 A4·A5）+浏览器打印/PDF 导出；田字格/米字格/作文稿纸/拼音格中文差异化 vs Gridzzly/Paper Me；82 Path 无 paper/稿纸/方格重叠 | 小 | P1（本轮新晋） |
| 接龙文本统计（粘贴群接龙→解析汇总） | 本轮新晋（sohu 2026-08-25「微信接龙怎么导出打卡记录」：班长「对着几百条群消息熬夜对账」；163 2026「微信接龙总漏统计？」：群里"张三+2"刷屏混在聊天记录里看不清、序号重复、事后逐条复制整理；sohu 2026-08-28 一起报数种草文：小程序导出 Excel 要开会员、广告多）；差异化「事后整理」vs 一起报数/接龙管家等「发起接龙」小程序：粘贴混乱文本→规则引擎解析（序号/姓名/数量/备注模式识别）→去重/人数汇总→粘贴名单对比「谁没接龙」→CSV 导出；纯前端、数据不出浏览器；82 Path 无接龙重叠 | 中 | P1（本轮新晋） |
| 极简简历制作器 | V2EX t/1210967 xukz.cn「Word 改简历调字间距打印格式崩溃」；CSDN IT 简历模板榜 Word 排版难痛点；360doc 2025-12-31 简历制作神器高频痛点；秋招季时令；结构化填写→A4 所见即所得预览→浏览器打印/PDF 导出，localStorage 免注册免上传，「简历不出浏览器」差异化叙事；82 Path 无 resume/简历重叠 | 中 | P1 |
| 课程表生成器 | 上轮升级（CSDN 2026-01「数字化课程表」：Word/Excel 手工绘制耗时、调课改版易混乱、排版单调；360doc 2025-12-10 教师五大难题列排课为核心难题，重型排课 SaaS 学习曲线长成本高）；可行范围：个人/班级课程表拖拽填课+简易撞课提示+配色模板+打印/PDF 导出（不做全校智能排课算法）；纯前端；82 Path 无重叠 | 中 | P1 |
| 图片裁剪（比例预设+拖拽裁剪框） | pixoate 预设比例 1:1/16:9/4:5+拖拽框实时预览+手机触屏；splitanimage 本地免上传图片套件；YouTube TemplateMaker.in 考试/求职/政府表单照片高频；与 img-resize（指定宽高数值裁剪）差异化明确无重叠；图片旅程线缺环补齐；canvas 纯前端本地免上传 | 小 | P1（节奏调节位） |
| 工作日计算器（含法定节假日/调休） | V2EX PriTime「法定节假日/调休补班重复，国内用户刚需」；yize/chinese-workday 2011-2026 数据+浏览器 CDN；Excel NETWORKDAYS 手工维护节假日痛点；起止日期→工作日天数+单日「要上班吗」查询；与 /tools/calendar（仅展示）无重叠；难度中（年份数据表需年更） | 中 | P1 |
| 图片拼图（网格模板拼图） | 360doc 2026-01-30 四选一首位；Photo Collage Maker 形态：多张图合成一格、网格/异形模板、自定义布局、文字/贴纸；与 nine-grid（九宫格切图，一张图切多格）方向相反无重叠；与 img-stitch（一维长图拼接）形态不同；canvas 纯前端本地免上传 | 小 | P1 |
| 屏幕录制（在线录屏） | 360doc 2026-01-30 宝藏站单列推荐；网易测评三大痛点：免费导出带水印、桌面软件要安装、公司电脑禁装软件只能用网页方案；100% 纯前端（getDisplayMedia+MediaRecorder→webm），免安装无水印文件不出本机；桌面端优先 | 中 | P1（通用顶位备选） |
| cURL 转代码 | 开发者刚需（HN 讨论 + curlconverter 开源库 27+ 语言）；赛道已有成熟免费玩家，垂直小众 | 小 | P1 |
| 浏览器实时听写（麦克风语音转文字） | 上轮新晋观察（CSDN 会议测评：73% 职场人遇到转写痛点；360doc 2025-12-21 腾讯元宝不限时长免费掀桌子反证全民刚需；HN Show HN BetterWispr 2026-10-12 200 points：本地听写「无账号无云端」是差异化方向；dev.to Whistle 轻量 STT 走红）；Web Speech API SpeechRecognition（Chrome/Edge 中文免费免 key）纯前端实时转写+复制/导出；「录音不出浏览器」对标需上传的 AI 方案；限制：Firefox/Safari 支持差须注明、质量不如 AI 大模型、无说话人分离/总结；赛道被免费 AI 统治，观察为主；82 Path 无重叠 | 小 | P1（观察） |
| 文本敏感信息打码 | 文本身份证/手机号/银行卡号脱敏；未找到强需求信号，运营场景刚需但证据弱 | 小 | P1（观察） |
| Excel 公式中文解释器 | 360doc「Excel 公式机器人」文本指令转公式是 AI 能力、不可做；反向「公式→中文分步解释」纯前端可做：词法拆解+函数中文说明库；证据单薄仅一条，待补强 | 中 | P1（观察） |
| Markdown 表格修复 | 中文全角/emoji 对齐错乱修复；赛道拥挤（tablesgenerator、tableconvert、编辑器插件生态），纯本地免费可差异化 | 小 | P1（末位） |
| 证件照换底色 | CSDN+360doc 实测文再确认刚需（微信小程序爆款均靠 AI 服务器抠图）；发丝级抠图需 AI 分割模型（WASM 版数十 MB），不完全符合纯轻量前端口径，等轻量方案 | 中 | P2（观察） |
| SQLite 在线查看器 | dev.to Tooltri 单次提及；sql.js WASM 纯前端可读 .db 文件；开发者小众 | 中 | P2（观察） |
| 手写模拟器 | 360doc 2026-02-14 萝卜工坊；作业/笔记/贺卡趣味场景；canvas+手写体字库纯前端可做 | 小 | P2（观察） |
| 在线文字转语音（Web Speech API） | 维持观察（赛道被 AI 拟真语音统治——Speechify 50 万+五星、AIVocal 600+音色；Web Speech API 系统语音音质参差、不可定制音色，免登录叙事不足以对冲质量差距；证据仍单薄） | 小 | P2（观察） |
| 隐私政策生成器 | 上轮新晋观察（FreeTopTools 16 工具清单单列「Business」工具；APP/小程序上架商店强制要求隐私政策文本；表单填空→标准模板条款生成，纯前端；证据单条，赛道已有在线生成器玩家） | 小 | P2（观察） |
| 轻断食计时器 | 本轮新晋观察（HN Show HN "Intermittent Fasting Calculator" 2026-10-07 新鲜：16:8/14:10/18:6/20:4/OMAD 断食窗口规划+24 小时彩色时间轴+文本/图片/PDF 导出；纯前端可做：方法选择+上餐/目标时间输入→时间轴渲染+本地提醒；国内受众小众、健康类与本站工具定位偏离，观察为主；82 Path 无 fast/断食重叠） | 小 | P2（观察） |

**已实现（简历预检工具第四轮划出、在线图表生成器第五轮划出）**：思维导图 → 表格拆分 → 表格合并 → **HEIC 转 JPG（已开发、未可交付——12:30 真机实测失败、生产已回滚，见历史轮次「⚠️ 待修复」）** → 成绩统计分析 → 二手房税费计算器 → 房贷计算器 → PDF 可填写表单制作器（+触屏修复）→ 工资个税计算器（8a6e0cc：七项专项附加扣除+年终奖计税对比，与房贷/二手房税费三向互链成「财务」旅程线）→ 双十一凑单计算器（145e47e+3d02c3c：满减档位自定义+子集和 DP 最小溢出最优组合+「还差 XX 元」提示与候补单品建议，纯前端本地计算）→ 字体版权查询（abe5db0+fd8fc74：canvas 本地字体探测+198 条离线版权库+复制报告，`/tools/font-license-check`）→ **简历预检工具（开发交付：`templates/resume_checker.html`+745 行纯前端规则引擎（技术栈词典 200 词+动作动词库+JD 关键词匹配/ATS 检测/逻辑链检查/雷区清单四模块报告+一键复制），新建「求职工具」品类，`/tools/resume-checker`）** → **在线图表生成器（1c6a9e3+fc135d3：粘贴表格/CSV/Excel 复制行→分隔符自动识别+引号感知解析→柱状/折线/饼/环形四类型自绘 SVG 渲染→1x/2x/3x 高清 PNG 导出，`/tools/chart-generator`）**；以上均已从候选池划出，历史记录保留于下方各轮次小节。

**归档说明**：本轮为 10-17 通用调研第四轮（WPS 特别方向 10-15 已结束）——简历预检工具交付闭环（开发交付轮），候选池划出，全量 82 Path；新晋三候选 P1：**视频抽帧**（HN Show HN "Video Frame Extractor" 新鲜证据，`<video>`+canvas 纯前端，开辟「视频工具」新方向）、**在线方格纸/稿纸生成器**（HN 方格纸生成器 20 小时前新鲜+360doc 家长打印字帖种草双重证据，田字格/米字格/作文稿纸中文差异化）、**接龙文本统计**（sohu/163 接龙对账痛点三重证据，「事后整理」差异化 vs 一起报数等发起式小程序）；**轻断食计时器**进 P2 观察（受众小众）；中文工具榜/V2EX/AI 综述赛道均无单页可落地新信号；WPS 候选表保持冻结归档；仓库 82 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 82 Path，新候选（video_frame_extractor/printable_paper/jie_long_parser 建议 ID）无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

> 维护人：前端开发 · 每日迭代（2026-10-17 开发交付 ✅）

## 开发交付（2026-10-17 · 简历预检工具 ✅）

**交付状态**：本轮唯一任务「简历预检工具（JD 关键词匹配/ATS 检测）」开发完成，已提交推送到开发分支 `muse/dev-20260929`，待测试轮与部署 QA。

**实现内容**：
- `templates/resume_checker.html`：单页工具模板（SEO meta+canonical+JSON-LD），页首隐私声明横幅「简历文本不出浏览器」+ 规则诊断局限说明；简历/JD 双 textarea 输入（字符计数、填入示例、清空）、一键分析、四模块报告区、一键复制诊断报告、评分口径 FAQ。
- `static/js/resume_checker.js`（745 行，纯前端零网络请求）：技术栈词典约 200 词（编程语言/前端/后端/数据库·中间件/移动/测试/运维·DevOps/产品·运营/AI·算法/通用软技能 10 方向）+ 中英动作动词库（强动词 50+/弱动词 10/英文 29）+ 易错词表 12 组；规则引擎四模块——①JD 关键词匹配度（词典命中+频次加权 0-100 评分、命中高亮、缺失清单按 JD 频次排序）；②ATS 友好度检测（emoji/装饰符号/表格残留/中英混排空格/标点混用/联系方式/分节标题/文本层提示 8 项，通过·警告·不通过·提示四态+修复建议）；③逻辑链检查（bullet 切分，逐条判定动作动词开头+数字量化+长度，弱动词「负责/参与」单独提示+改写建议）；④雷区清单（身份证号/详细住址/无关敏感信息/日期格式一致性/易错词/“精通”自评/文件命名/页数估算）。空输入与 10 万字符超长文本友好提示；复制报告为纯文本版。
- `tools/categories.go`：新建「求职工具」品类（ID `job`，图标 work），注册工具 ID `resume_checker`、Path `/tools/resume-checker`（New:true），中英文描述 + SEO keywords；首页/导航/sitemap 自动生效。
- 本文件（BACKLOG.md）：本小节交付记录。

**验收自测**（node harness，35 项全过）：
- [x] `/tools/resume-checker` 可开（200），JS 200，首页/导航/sitemap 均收录「求职工具」
- [x] 简历+JD 一键分析输出四模块报告；3 组正反用例：高匹配简历 100 分/缺失 0、后端简历投前端 JD 0 分/缺失 7 且按频次降序、空 JD 友好跳过
- [x] 技术栈词典六个方向（前端/后端/移动/测试/运维/产品运营）各抽 10 词全命中
- [x] 空输入/10 万字符超长文本不报错且友好提示（10 万字符扫描 187ms）
- [x] 一键复制报告可用（clipboard API + execCommand 双通道兜底）
- [x] 隐私声明显眼（页首绿横幅 + 复制报告落款均含「简历文本不出浏览器」）
- [x] 纯前端无后端调用、无数据外发（JS 内零 fetch/XHR；页面仅加载站内 CSS/JS 与 Google Fonts 图标字体）
- [x] `categories.go` 注册完成（新「求职工具」品类），首页列表/导航/SEO 配置生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过（待后续轮次）

> 维护人：产品经理 · 每日排期（2026-10-17 05:40 PM 决策轮）

## 今日任务（2026-10-17 05:40 · 产品经理排期决策 ✅）

**交付状态**：10-17 排期决策轮（本轮为第三轮决策）。字体版权查询已交付闭环（abe5db0+fd8fc74，全量 81 Path），按 10-17 第三轮研究 Top3 顺位递进，本轮立项**唯一开发任务：简历预检工具（JD 关键词匹配/ATS 检测）**。

**选定：简历预检工具（JD 关键词匹配/ATS 检测）（/tools/resume-checker）** — 今日唯一任务：
- **顺位递进**：10-17 第三轮研究轮 Top3 顺位首选推荐，不改既定定序。
- **需求证据**：V2EX t/1210967 棱镜简历真实踩坑（漏写关键技术栈、项目描述写成流水账）；JD 关键词匹配度/ATS 友好度检测/「做了什么→结果如何」逻辑链/简历雷区清单全部纯前端可实现。
- **时令窗口**：10 月中正值秋招投递高峰，需求热度随时间递减，宜早不宜迟（比常青型的图表生成器更吃时间窗口）。
- **组合叙事**：与待建的极简简历制作器成「求职」组合——本工具先行上线，新建「求职工具」品类占位，制作器上线后双向互链成旅程线。
- **差异化叙事**：「简历文本不出浏览器」——市面简历诊断多为上传式/AI 收费服务，纯前端本地规则引擎分析，免注册免上传。
- **去重**：`grep tools/categories.go` 全量 81 Path，无 简历/resume/ats/JD 实质重叠（`score_stats` 为字面误匹配）；ID `resume_checker`、Path `/tools/resume-checker` 无重叠。
- **技术就绪**：纯前端规则引擎——内置技术栈词典（编程语言/框架/工具/软技能，数百词）+ JD 关键词自动提取（词典命中+频次统计）+ 匹配度打分；ATS 启发式检查（文本层可判定项）；经历 bullet 句式分析（中英动作动词库+数字量化检测）；雷区清单规则表。

**规格**：
1. 输入区：简历文本粘贴 textarea + JD 文本粘贴 textarea（附示例一键填入，便于试用）；字符数统计；「一键分析」按钮。
2. 分析报告四大模块：
   a. **JD 关键词匹配度**：综合评分（0-100）+ 命中关键词高亮 + 缺失关键词清单（按 JD 出现频次排序，提示"建议补充进项目经历"）。
   b. **ATS 友好度检测**：文本层启发式检查清单（通过/警告/不通过三态）：特殊符号/emoji、表格转文本残留痕迹、中英文混排空格、联系方式格式（邮箱/电话）、PDF 文本可复制性提示；每项附一句话修复建议。
   c. **「做了什么→结果如何」逻辑链检查**：按行/项目符号切分经历 bullet，逐条判定——是否以动作动词开头（内置中英动作动词库）、是否含数字/量化结果（%/倍/金额/人数/排名）、长度是否合理（过长建议拆分、过短建议补充）；给出逐条改写提示。
   d. **简历雷区清单**：个人信息过度披露（身份证号/详细住址等）、日期格式一致性、高频易错词扫描、文件命名建议、页数估算。
3. 隐私声明（显眼位置）：「简历文本全部在浏览器本地分析，不出浏览器、不上传服务器、不做任何存储」。
4. 一键复制诊断报告（文本版，方便粘贴保存）。
5. 注册：新建「求职工具」品类（ID `job`），工具 ID `resume_checker`、Path `/tools/resume-checker`（New: true），中英文描述 + SEO keywords（简历检查、简历优化、ATS 检测、简历关键词匹配、简历诊断、resume ATS check）。

**验收标准**：
- [ ] `/tools/resume-checker` 可开（200）
- [ ] 简历+JD 一键分析输出四模块报告；匹配度评分与缺失关键词抽查合理（构造 3 组正反用例验证）
- [ ] 技术栈词典/动作动词库覆盖抽查（前后端/移动/测试/运维/产品/运营方向各抽 10 词命中）
- [ ] 空输入/超长文本（10 万字符）不报错，给出友好提示
- [ ] 一键复制诊断报告功能可用
- [ ] 隐私声明显眼
- [ ] 纯前端无后端调用、无数据外发（DevTools Network 抽查）
- [ ] `categories.go` 注册完成（新「求职工具」品类），首页列表/导航/SEO 配置生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/resume_checker.html`、`static/js/resume_checker.js`（含技术栈词典+动作动词库+规则引擎）、`tools/categories.go`、`BACKLOG.md`（本小节）。

**未选**：在线图表生成器（P1，连续多轮推荐未被选，证据仍有效，留下一顺位首选：粘贴表格/CSV→柱状图/折线图/饼图→自绘 SVG→PNG 导出，与成绩统计成「数据」旅程线）；GB/T 7714 参考文献格式生成器（P1，本轮新晋，难度小，留池作节奏调节位）；课程表生成器（P1，顺位第四）；图片裁剪（节奏调节位）；医学组合/屏幕录制等其余候选留池。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 81 Path，无 简历/resume/ats 实质命中，ID `resume_checker`、Path `/tools/resume-checker` 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

> 维护人：产品经理 · 每日排期（2026-10-17 04:30 PM 决策轮）

> 维护人：产品调研员 · 每日更新（2026-10-17 05:00 第三轮研究）

## 今日任务（2026-10-17 05:00 · 产品调研员研究轮 ✅）

**交付状态**：10-17 通用调研第三轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研）。字体版权查询本轮已交付闭环（abe5db0 开发交付：canvas measureText 本地字体探测+198 条离线版权库（免费商用 116/需付费授权 75/高风险 7）+复制报告；fd8fc74 评审必改项修复；`grep tools/categories.go` 确认 Path `/tools/font-license-check` 已注册，全量 81 Path），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮五件事**（05:00 全网调研，通用方向）：
1. 字体版权查询交付确认：PM 决策轮立项→开发交付（abe5db0：本地已装字体一键探测+手动批量输入+离线版权状态库+状态筛选/搜索/复制报告+准确性·隐私·技术限制三声明；fd8fc74 评审修复）；`grep tools/categories.go` 确认 Path 已注册（全量 81 Path），与候选池无重叠项残留；候选池划出。
2. 新晋候选：**GB/T 7714 参考文献格式生成器**。需求证据三重：① 360doc 2025-12-04「参考文献格式乱？AI一键搞定学术规范」：历史学本科生为改 30 篇参考文献格式对照模板逐行调整花一整天，仍被导师指出「期刊文章和学位论文的标注混了」；90% 参考文献问题本质是「手动处理效率低+学术规范杂」（GB/T 7714-2015 顺序编码制/著者-出版年制+各高校期刊细分要求）；② CSDN GBT7714-BibTeX-Style 教程文：「中文论文因引文格式不合规导致的退修率高达 32%」「手动校对单篇文献平均耗时 15 分钟」；③ 开源 CSL 生态（Chinese-STD-GB-T-7714-related-csl，含清华/北大/浙大等高校定制样式）证明需求长期存在。可行性：纯前端表单式生成——输入作者/篇名/期刊/年/卷期页码/DOI→按 GB/T 7714-2015 生成条目（文献类型标识[J][M][D][C][P][S]、顺序编码制/著者-出版年制切换、中文「等」/英文「et al」自动处理），批量+一键复制+导出 TXT；现有玩家（EndNote/NoteExpress/Zotero 重型需安装学习、paperred AI 收费）均有门槛，「免注册免安装、参考文献不出浏览器」差异化。去重：`grep tools/categories.go` 引用/参考文献/citation/文献无命中（81 Path）。难度小。SEO：参考文献格式生成器、GB/T 7714、论文参考文献格式。建议 ID `reference_formatter`、Path `/tools/reference-formatter`。
3. 新晋观察：**浏览器实时听写（麦克风语音转文字）**。需求证据：① CSDN 会议记录横向测评文：73% 职场人遇到转写痛点（专业术语识别错、方言访谈、多人发言、外勤调研）；② 360doc 2025-12-21：腾讯元宝「不限时长全免费」AI 录音笔掀桌子——反证音频转文字是全民级刚需（亦为 WPS 会员功能之一，归档 WPS 表有回响）；③ HN Show HN BetterWispr（2026-10-12，200 points）：免费开源本地听写，「本地模型、无账号、无云端」是差异化方向；④ dev.to 2026-10：Whistle 轻量 STT CLI（16.9MB）走红。可行性：Web Speech API SpeechRecognition（Chrome/Edge 中文免费免 key）纯前端实时转写+复制/导出 TXT；「录音不出浏览器」对标需上传的元宝/讯飞方案。已知限制：Firefox/Safari 支持差（页面须注明 Chrome/Edge）、识别质量不如 AI 大模型、无说话人分离/总结（AI 能力不做）。进 P1（观察）——赛道被免费 AI 统治（元宝不限时长免费），观察为主。去重：81 Path 无 听写/语音转文字重叠（仅 OCR 图片转文字）。
4. 无新单页信号侧：① 中文「最实用的在线工具」榜（360doc 2026-02 系列）多为已覆盖项回声（本地 OCR→ToolWeb 已有 ocr-image-text/ocr-batch；批量加水印→已有水印工具）或非单页项（跨平台音乐聚合下载涉版权、网盘资源索引站、播客排行榜、在线 PPT 协作）；② FreeTopTools 16 工具清单：Word Counter/Grammar/JSON/Password/QR/WebP 压缩等多为 ToolWeb 已有或 AI 能力；其中 Privacy Policy Generator（隐私政策模板生成）证据单条，进 P2 观察；③ HN 前线（10-09~10-12 roundup）：WallHop（付费墙绕过，法律风险不做）、Talorys（Cloudflare AI agent，非单页）、big-arrow（macOS CLI，非网页）无单页可落地项；④ V2EX/Reddit 榜单（Sejda 可填写 PDF→ToolWeb 已有 pdf-form-maker；remove.bg→AI 能力 P2；hrefhunter→站长向非单页）无新项。
5. WPS 候选表保持冻结归档（本轮为通用方向；音频转文字在 WPS 表中已有回响，现以浏览器实时听写进 P1 观察呼应）。

**推荐 Top3**（排期建议；尊重 PM 定序，顺位递进）：

1. **简历预检工具（JD 关键词匹配/ATS 检测）** — P1（顺位递进）：V2EX t/1210967 棱镜简历真实踩坑（漏写技术栈/项目描述流水账）；JD 关键词匹配度/ATS 友好度检测/「做了什么→结果如何」逻辑链/雷区清单全纯前端可实现；秋招季时令；与极简简历制作器成「求职」组合互链。难度中。SEO：简历检查、简历优化、ATS 检测。
2. **在线图表生成器（数据粘贴→图表导出）** — P1（顺位递进，连续多轮推荐未被选，证据仍有效）：360doc 咖喱君「文字一键转图表」+支付宝 ChartCube 上传 Excel/CSV 生成图表导出 PNG/PDF+CSDN 论文图表工具文；粘贴表格/CSV→柱状图/折线图/饼图→自绘 SVG 零依赖→PNG 导出；与成绩统计互链成「数据」旅程线；通用办公/自媒体/学生场景。难度中。SEO：在线图表生成、柱状图生成器、数据可视化。
3. **GB/T 7714 参考文献格式生成器** — P1（本轮新晋）：360doc 参考文献格式痛点文（改 30 篇花一整天仍被退修）+CSDN「退修率 32%、单篇校对 15 分钟」+开源 CSL 生态三重证据；表单输入→国标条目生成（双制式、[J][M][D] 类型标识、等/et al 自动处理）；重型玩家（EndNote/NoteExpress/Zotero）需安装学习，「免注册不出浏览器」差异化；81 Path 无重叠。难度小。SEO：参考文献格式生成器、GB/T 7714、论文参考文献格式。

课程表生成器列顺位第四（P1，上轮升级，可行范围已界定）；图片裁剪维持节奏调节位（难度小）；医学单位换算器+常用医学计算器为医疗组合备选；屏幕录制维持通用顶位备选；浏览器实时听写进 P1 观察。

**通用候选表**（2026-10-17 第三轮；字体版权查询已实现划出；新晋 GB/T 7714 参考文献格式生成器 P1、浏览器实时听写 P1（观察）、隐私政策生成器 P2（观察）；全量 81 Path）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 简历预检工具（JD 关键词匹配/ATS 检测） | V2EX t/1210967 棱镜简历：漏写技术栈/项目描述流水账真实踩坑；JD 关键词匹配度/ATS 友好度检测/「做了什么→结果如何」逻辑链/雷区清单全纯前端可实现；秋招季时令；与极简简历制作器成「求职」组合互链；81 Path 无重叠 | 中 | P1（顺位首选） |
| 在线图表生成器（数据粘贴→图表导出） | 360doc 咖喱君「文字一键转图表」、支付宝 ChartCube 上传 Excel/CSV 生成图表导出 PNG/PDF、CSDN 论文图表工具文；粘贴表格/CSV→柱状图/折线图/饼图→自绘 SVG 零依赖→PNG 导出；与成绩统计互链成「数据」旅程线；通用办公/自媒体/学生场景 | 中 | P1（顺位递进） |
| GB/T 7714 参考文献格式生成器 | 本轮新晋（360doc 2025-12-04「参考文献格式乱？AI一键搞定学术规范」：改 30 篇参考文献花一整天仍被指出标注混淆，90% 问题=手动效率低+规范杂；CSDN GBT7714 教程文：引文格式不合规退修率高达 32%、手动校对单篇平均 15 分钟；开源 CSL 生态含高校定制样式）；纯前端表单式生成：作者/篇名/期刊/年/卷期页码/DOI→GB/T 7714-2015 条目（[J][M][D][C][P][S] 类型标识、双制式切换、中文「等」/英文「et al」）；重型玩家（EndNote/NoteExpress/Zotero）需安装学习，「免注册不出浏览器」差异化；81 Path 无重叠 | 小 | P1（本轮新晋） |
| 极简简历制作器 | V2EX t/1210967 xukz.cn「Word 改简历调字间距打印格式崩溃」；CSDN IT 简历模板榜 Word 排版难痛点；360doc 2025-12-31 简历制作神器高频痛点；秋招季时令；结构化填写→A4 所见即所得预览→浏览器打印/PDF 导出，localStorage 免注册免上传，「简历不出浏览器」差异化叙事；81 Path 无 resume/简历重叠 | 中 | P1 |
| 课程表生成器 | 上轮升级（CSDN 2026-01「数字化课程表」：Word/Excel 手工绘制耗时、调课改版易混乱、排版单调；360doc 2025-12-10 教师五大难题列排课为核心难题，重型排课 SaaS 学习曲线长成本高）；可行范围：个人/班级课程表拖拽填课+简易撞课提示+配色模板+打印/PDF 导出（不做全校智能排课算法）；纯前端；81 Path 无重叠 | 中 | P1（顺位第四） |
| 图片裁剪（比例预设+拖拽裁剪框） | pixoate 预设比例 1:1/16:9/4:5+拖拽框实时预览+手机触屏；splitanimage 本地免上传图片套件；YouTube TemplateMaker.in 考试/求职/政府表单照片高频；与 img-resize（指定宽高数值裁剪）差异化明确无重叠；图片旅程线缺环补齐；canvas 纯前端本地免上传 | 小 | P1（节奏调节位） |
| 工作日计算器（含法定节假日/调休） | V2EX PriTime「法定节假日/调休补班重复，国内用户刚需」；yize/chinese-workday 2011-2026 数据+浏览器 CDN；Excel NETWORKDAYS 手工维护节假日痛点；起止日期→工作日天数+单日「要上班吗」查询；与 /tools/calendar（仅展示）无重叠；难度中（年份数据表需年更） | 中 | P1 |
| 图片拼图（网格模板拼图） | 360doc 2026-01-30 四选一首位；Photo Collage Maker 形态：多张图合成一格、网格/异形模板、自定义布局、文字/贴纸；与 nine-grid（九宫格切图，一张图切多格）方向相反无重叠；与 img-stitch（一维长图拼接）形态不同；canvas 纯前端本地免上传 | 小 | P1 |
| 屏幕录制（在线录屏） | 360doc 2026-01-30 宝藏站单列推荐；网易测评三大痛点：免费导出带水印、桌面软件要安装、公司电脑禁装软件只能用网页方案；100% 纯前端（getDisplayMedia+MediaRecorder→webm），免安装无水印文件不出本机；桌面端优先 | 中 | P1（通用顶位备选） |
| cURL 转代码 | 开发者刚需（HN 讨论 + curlconverter 开源库 27+ 语言）；赛道已有成熟免费玩家，垂直小众 | 小 | P1 |
| 浏览器实时听写（麦克风语音转文字） | 本轮新晋观察（CSDN 会议测评：73% 职场人遇到转写痛点；360doc 2025-12-21 腾讯元宝不限时长免费掀桌子反证全民刚需；HN Show HN BetterWispr 2026-10-12 200 points：本地听写「无账号无云端」是差异化方向；dev.to Whistle 轻量 STT 走红）；Web Speech API SpeechRecognition（Chrome/Edge 中文免费免 key）纯前端实时转写+复制/导出；「录音不出浏览器」对标需上传的 AI 方案；限制：Firefox/Safari 支持差须注明、质量不如 AI 大模型、无说话人分离/总结；赛道被免费 AI 统治，观察为主；81 Path 无重叠 | 小 | P1（观察） |
| 文本敏感信息打码 | 文本身份证/手机号/银行卡号脱敏；未找到强需求信号，运营场景刚需但证据弱 | 小 | P1（观察） |
| Excel 公式中文解释器 | 360doc「Excel 公式机器人」文本指令转公式是 AI 能力、不可做；反向「公式→中文分步解释」纯前端可做：词法拆解+函数中文说明库；证据单薄仅一条，待补强 | 中 | P1（观察） |
| Markdown 表格修复 | 中文全角/emoji 对齐错乱修复；赛道拥挤（tablesgenerator、tableconvert、编辑器插件生态），纯本地免费可差异化 | 小 | P1（末位） |
| 证件照换底色 | CSDN+360doc 实测文再确认刚需（微信小程序爆款均靠 AI 服务器抠图）；发丝级抠图需 AI 分割模型（WASM 版数十 MB），不完全符合纯轻量前端口径，等轻量方案 | 中 | P2（观察） |
| SQLite 在线查看器 | dev.to Tooltri 单次提及；sql.js WASM 纯前端可读 .db 文件；开发者小众 | 中 | P2（观察） |
| 手写模拟器 | 360doc 2026-02-14 萝卜工坊；作业/笔记/贺卡趣味场景；canvas+手写体字库纯前端可做 | 小 | P2（观察） |
| 在线文字转语音（Web Speech API） | 维持观察（赛道被 AI 拟真语音统治——Speechify 50 万+五星、AIVocal 600+音色；Web Speech API 系统语音音质参差、不可定制音色，免登录叙事不足以对冲质量差距；证据仍单薄） | 小 | P2（观察） |
| 隐私政策生成器 | 本轮新晋观察（FreeTopTools 16 工具清单单列「Business」工具；APP/小程序上架商店强制要求隐私政策文本；表单填空→标准模板条款生成，纯前端；证据单条，赛道已有在线生成器玩家） | 小 | P2（观察） |

**已实现（字体版权查询本轮划出）**：思维导图 → 表格拆分 → 表格合并 → **HEIC 转 JPG（已开发、未可交付——12:30 真机实测失败、生产已回滚，见历史轮次「⚠️ 待修复」）** → 成绩统计分析 → 二手房税费计算器 → 房贷计算器 → PDF 可填写表单制作器（+触屏修复）→ 工资个税计算器（8a6e0cc：七项专项附加扣除+年终奖计税对比，与房贷/二手房税费三向互链成「财务」旅程线）→ 双十一凑单计算器（145e47e+3d02c3c：满减档位自定义+子集和 DP 最小溢出最优组合+「还差 XX 元」提示与候补单品建议，纯前端本地计算）→ **字体版权查询（abe5db0+fd8fc74：canvas 本地字体探测+198 条离线版权库+复制报告，`/tools/font-license-check`）**；以上均已从候选池划出，历史记录保留于下方各轮次小节。

**归档说明**：本轮为 10-17 通用调研第三轮（WPS 特别方向 10-15 已结束）——字体版权查询交付闭环（abe5db0+fd8fc74），候选池划出，全量 81 Path；新晋「GB/T 7714 参考文献格式生成器」P1（360doc 参考文献格式痛点文+CSDN「退修率 32%、单篇校对 15 分钟」+开源 CSL 生态三重证据，纯前端表单式生成，与 EndNote/NoteExpress 等重型玩家错位）；「浏览器实时听写」进 P1 观察（HN BetterWispr 200 points 本地听写信号+CSDN 73% 转写痛点，但赛道被元宝等免费 AI 统治）；「隐私政策生成器」进 P2 观察（证据单条）；HN 前线（WallHop/big-arrow/Talorys）与中文工具榜均无单页可落地新信号；WPS 候选表保持冻结归档；仓库 81 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 81 Path，新候选（reference_formatter / speech_dictation 建议 ID）无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

## 今日任务（2026-10-17 04:30 · 产品经理排期决策 ✅）

**交付状态**：10-17 决策轮（本轮为第二轮决策）。双十一凑单计算器已交付闭环（145e47e+3d02c3c，全量 80 Path），按 10-17 第二轮研究 Top3 顺位递进，本轮立项**唯一开发任务：字体版权查询**。

**选定：字体版权查询（/tools/font-license-check）** — 今日唯一任务：
- **顺位递进**：10-17 第二轮研究轮 Top3 顺位首选推荐，不改既定定序。
- **需求证据三重**：① 360doc 2026-03-21「6 个良心网站」单列推荐 360 查字体——「一键检测电脑已安装字体是否可商用」，形态已验证；② CSDN PPT 素材版权风险文：字体侵权是 PPT/设计高频雷区（微软雅黑/方正/汉仪需付费授权；免费商用：思源黑体/宋体、阿里巴巴普惠体、站酷系列、OPPO Sans）；③ 360doc 2026-01-03「字体侵权诉讼频发」——设计圈持续多年痛点（「版权流氓式诉讼」）。
- **差异化叙事**：canvas 本地字体探测 + 离线版权状态库，**「字体列表不出浏览器」**——对标 360 查字体核心价值，纯前端无上传。
- **去重**：grep tools/categories.go 全量 80 Path，无 font/字体版权重叠（`fancy_fonts` 为花体字生成器，方向不同；PDF 表单中文内嵌字体与版权查询功能不重叠；水印工具描述中的「字体」为参数项非工具）；ID `font_license_check`、Path `/tools/font-license-check` 无重叠。
- **技术就绪**：canvas measureText 宽度比对探测本地已安装字体（对照基线字体 monospace/serif/sans-serif 宽度差异）；离线版权状态库约 200 常见字体：免费商用/需付费授权/高风险（含方正/汉仪等诉讼高发方），附安全替代推荐。已知限制：探测对相似度量字体可能误报漏报，页面须注明。
- **未选**：简历预检工具（P1，留下一顺位，秋招季时令，与极简简历制作器成「求职」组合）；在线图表生成器（P1 顺位第四，多轮推荐未被选，证据仍有效）；课程表生成器（本轮新升级 P1，可行范围已界定：轻量拖拽填课+模板打印）；图片裁剪（节奏调节位）等其余候选留池。

**规格**：
1. 输入区：① 一键检测本地已装字体（canvas measureText 宽度比对，列出探测到的已安装字体清单）；② 字体名手动输入检测（支持批量输入多行）。
2. 版权状态库（离线 JS 数据表，约 200 常见字体）：状态三档——免费商用（思源黑体/宋体、阿里巴巴普惠体、站酷系列、OPPO Sans 等）/ 需付费授权（微软雅黑、方正系列、汉仪系列等）/ 高风险（诉讼高发方）；每条附状态说明 + 安全替代推荐（免费可商用同风格字体）。
3. 结果区：字体名 → 状态徽章（绿/橙/红）→ 授权说明 → 替代字体；支持按状态筛选、搜索；批量检测结果一键复制报告。
4. 准确性声明（显眼位置）：「版权信息整理自公开资料，仅供参考，具体以各权利方官方授权政策为准；如有商用需求请咨询专业人士」。
5. 隐私声明（显眼位置）：「字体探测与查询全部在浏览器本地完成，字体列表不出浏览器，不上传任何服务器」。
6. 技术限制说明：canvas 探测原理简述，注明「对字形度量相近的字体可能误报漏报，仅供初步筛查」。
7. 注册：`tools/categories.go`「文字工具」品类（或现有合适品类）新增 ID `font_license_check`、Path `/tools/font-license-check`（New: true），中英文描述 + SEO keywords（字体版权查询、字体可商用吗、字体侵权查询、免费可商用字体）。

**验收标准**：
- [ ] `/tools/font-license-check` 可开（200）
- [ ] 本地已装字体一键探测可用（Chrome/Edge/Firefox 抽查，探测列表与系统已装字体对照抽验）
- [ ] 手动输入字体名（单/多行）检测结果正确（抽查 10 个字体：微软雅黑/方正黑体/汉仪/思源黑体/阿里普惠体/站酷/OPPO Sans/宋体/黑体/楷体 状态判定与版权库一致）
- [ ] 高风险字体附替代推荐，替代字体本身为免费商用状态
- [ ] 状态筛选/搜索/复制报告功能可用
- [ ] 准确性声明与隐私声明位置显眼
- [ ] 空值/非法输入不报错
- [ ] 纯前端无后端调用、无数据外发（DevTools Network 抽查）
- [ ] `categories.go` 注册完成，首页列表/导航/SEO 配置生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/font_license_check.html`、`static/js/font_license_check.js`（含离线版权状态库数据表）、`tools/categories.go`、`BACKLOG.md`（本小节）。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 80 Path，无 font/字体版权实质命中，ID `font_license_check`、Path `/tools/font-license-check` 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

**开发交付（2026-10-17 · 前端开发 ✅）**：
- 新增文件：`templates/font_license_check.html`（SEO/准确性声明/隐私声明/技术限制说明三横幅 + 一键检测/手动输入/复制报告/版权库浏览）、`static/js/font_license_check.js`（离线版权库 198 条：免费商用 116 / 需付费授权 75 / 高风险 7，canvas measureText 三基线宽度比对探测 + 别名/子串模糊匹配 + 状态筛选/搜索 + 复制报告）。
- 注册：`tools/categories.go` 新增「文字工具」品类（ID `font`），工具 ID `font_license_check`（Path `/tools/font-license-check`，New:true，中英文描述 + SEO keywords 字体版权查询/字体可商用吗/字体侵权查询/免费可商用字体）。
- 本地构建通过；本地 18090 实测页面与 JS 均为 200，首页/导航已收录；node harness 实测：验收 10 字体判定一致（微软雅黑→高风险、方正/汉仪→高风险通用、思源黑体/阿里普惠体/站酷快乐体/OPPO Sans→免费商用、宋体/黑体/楷体→需付费授权）、空值非法输入不抛错、报告含声明、HTML 转义正常、JS 无 fetch/XHR（纯前端无数据外发）。
- 待测试轮 + 部署 /tool-web 后 QA（跨浏览器一键探测抽查、DevTools Network 抽查）。

> 维护人：产品经理 · 每日排期（2026-10-17 PM 决策轮）

## 今日任务（2026-10-17 · 产品经理排期决策 ✅）

**交付状态**：10-17 排期决策轮。按 03:00 研究轮 Top3 顺位首选推荐递进，本轮立项**唯一开发任务：双十一凑单计算器**。

**选定：双十一凑单计算器（/tools/double11-bundling-calculator）** — 今日唯一任务：
- **顺位递进**：03:00 研究轮 Top3 顺位首选（时令首选），不改既定定序。
- **需求证据三重**：① 时令——双十一（11-11）距今 25 天，年度全民「满减奥数」痛点季；② 新浪财经/网易双十一攻略文一致把「凑单满减（每满 300 减 50）」列为核心省钱战术，「还差 XX 元可减」是购物车高频场景；③ 淘宝官方一键凑单不覆盖跨店/多档位/拼单场景，手动凑单仍需工具。纯前端本地计算零依赖。难度中。
- **SEO**：双十一凑单、满减计算器、凑单神器。
- **旅程线**：本工具为独立购物场景工具；页底可与「生活工具」簇其他购物相关工具互链（开发轮视实际定）。
- **去重**：`grep tools/categories.go` 全量 79 Path（凑单/满减/double11 无命中），ID `double11_bundling_calculator`、Path `/tools/double11-bundling-calculator` 无重叠。
- **未选**：字体版权查询（P1 本轮新晋，canvas 本地字体探测+离线版权库，版权库整理工作量较大，留作下一顺位）；简历预检工具（P1 本轮新晋，秋招季，与极简简历制作器成求职组合，留下一顺位）；在线图表生成器（顺位第四）；图片裁剪（节奏调节位）、医学单位换算器+常用医学计算器（医疗组合备选）等其余候选留池。

**规格**：
1. 输入区：商品清单（名称+价格，支持增删行、可粘贴多行「名称 价格」批量导入）；满减档位配置（支持多档，如满 300-50、满 500-80，档位可增删，数字输入框防呆）。
2. 算法：子集和/0-1 背包 DP，找满足某档位且「溢出金额最小」的商品组合；多档位时分别给出每档最优解并标出省钱最多的推荐档。
3. 结果区：推荐凑单商品清单（勾选态）、凑单总金额、达标档位、立减金额、实付价明细；若当前购物车总额未达任一档位，显示「还差 XX 元可享满 XXX 减 YYY」，并建议「加一件凑单」——给出候补单品建议（由用户另行输入单品价格后计算）。
4. 隐私声明：页面显眼位置「纯前端本地计算，数据不出浏览器，不上传任何服务器」。
5. 双十一提示：页面提示「满减规则以各平台/店铺实际页面为准，跨店满减与店铺券可能叠加规则不同」。
6. 注册：`tools/categories.go`「生活工具」品类新增 ID `double11_bundling_calculator`、Path `/tools/double11-bundling-calculator`（New: true），中英文描述 + SEO keywords（双十一凑单、满减计算器、凑单神器、满300减50凑单）。

**验收标准**：
- [ ] `/tools/double11-bundling-calculator` 可开（200）
- [ ] 输入商品+价格、档位后，最优凑单组合正确（与手工枚举交叉抽验 3 组数据，最小溢出验证）
- [ ] 多档位时各档最优解分别正确，推荐档（省钱最多）结论合理
- [ ] 未达档位时「还差 XX 元」提示正确，候补单品建议计算正确
- [ ] 空值/非法输入不报错，价格可含小数（保留两位）
- [ ] 隐私声明位置显眼
- [ ] 纯前端无后端调用、无数据外发（DevTools Network 抽查）
- [ ] `categories.go` 注册完成，首页列表/导航/SEO 配置生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/double11_bundling_calculator.html`、`static/js/double11_bundling_calculator.js`、`tools/categories.go`、`BACKLOG.md`（本小节）。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 79 Path，凑单/满减/double11 无命中，ID/Path 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

> 维护人：产品调研员 · 每日更新（2026-10-17 第二轮研究）

## 今日任务（2026-10-17 · 产品调研员研究轮 ✅）

**交付状态**：10-17 通用调研第二轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研）。双十一凑单计算器本轮已交付闭环（145e47e 开发交付 + 3d02c3c 评审修复；`grep tools/categories.go` 确认 Path `/tools/double11-bundling-calculator` 已注册，全量 80 Path），候选池划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮四件事**（通用方向，全网 6 轮搜索）：
1. 双十一凑单计算器交付确认：PM 决策轮立项→开发交付（145e47e：商品清单+价格批量导入、满减档位自定义、子集和 DP 最小溢出最优组合、「还差 XX 元」提示+候补单品建议；3d02c3c 评审必改项修复）；`grep tools/categories.go` 确认 Path 已注册（全量 80 Path），与候选池无重叠项残留；候选池划出。
2. 课程表生成器证据补强并升级（P1 观察→P1）。新证据双重：① CSDN 2026-01「数字化课程表」痛点文：Word/Excel 手工绘制耗时、调课后反复改版易版本混乱、排版单调缺专业感——三条痛点均可被「拖拽填课+美观模板+打印导出」单页工具解决；② 360doc 2025-12-10「教师五大核心工作难题」：排课列为核心难题之一（人工协调教室/教师/班级/时间多重因素、冲突反复调整），推荐的二一排课/水晶排课均为重型桌面端/SaaS（学习曲线长、成本高）——「轻量网页版课程表排版生成器」有错位空间。可行范围界定：不做全校智能排课算法（重型），做个人/班级课程表「拖拽填课+简易冲突提示（同教师同时间撞课）+配色模板+打印/PDF 导出」，纯前端；难度中。去重：`grep tools/categories.go` 无 课程表/timetable/course 命中（80 Path）。SEO：课程表制作、在线课程表、课程表模板打印。建议 ID `timetable_maker`、Path `/tools/timetable-maker`。
3. 在线文字转语音维持 P2 观察（不升级）。本轮补搜：赛道被 AI 拟真语音统治（Speechify 50 万+五星评价、AIVocal 600+音色、ttsopenai 等），Web Speech API 系统语音音质参差、不可定制音色，「免注册免登录无额度」叙事不足以对冲质量差距；证据仍单薄，不升级。
4. 无新单页信号侧：V2EX 近期（PREX 交易研究 AI Agent、A 股盘后复盘桌面应用、Zendot 开源推荐站、ShareLLM 模型聚合、PlainMote 文本分享）或需后端、或为 AI 能力、或桌面端，无纯前端单页可落地项；r/AskReddit 2026-09/07「免费网站改变生活」榜单（Sejda 可填写 PDF——ToolWeb 已有 pdf-form-maker；remove.bg 抠图——AI 能力已评估为 P2；hrefhunter 死链检查——站长向非单页）无新项；360doc 工具榜多为已覆盖项回声（简历制作→池内已有；找台词需台词数据库后端；智能抠图 AI 能力）。

**推荐 Top3**（排期建议；努力度为单页前端交付量级评估；尊重 PM 定序）：

1. **字体版权查询** — P1（顺位递进，03:00 轮新晋）：360doc 2026-03-21 推荐 360 查字体「检测电脑已装字体是否可商用」+ CSDN PPT 版权风险文（微软雅黑/方正/汉仪需付费授权 vs 思源/阿里普惠体/站酷/OPPO Sans 免费商用）+「版权流氓式诉讼频发」设计圈持续痛点三重证据；canvas 本地字体探测+离线版权状态库（约 200 字体：免费商用/需授权/高风险+安全替代），「字体列表不出浏览器」差异化叙事；与 fancy_fonts（花体字生成器）方向不同无重叠。难度中。SEO：字体版权查询、字体可商用吗、字体侵权查询。
2. **简历预检工具（JD 关键词匹配/ATS 检测）** — P1（顺位递进，03:00 轮新晋）：V2EX t/1210967 棱镜简历真实踩坑（漏写技术栈/项目描述流水账）；JD 关键词匹配度/ATS 友好度检测/「做了什么→结果如何」逻辑链检查/雷区清单全纯前端可实现；秋招季时令；与极简简历制作器成「求职」组合互链。难度中。SEO：简历检查、简历优化、ATS 检测。
3. **在线图表生成器（数据粘贴→图表导出）** — P1（顺位递进，连续三轮推荐未被选，证据仍有效）：360doc 咖喱君「文字一键转图表」+ 支付宝 ChartCube 上传 Excel/CSV 生成图表导出 PNG/PDF + CSDN 论文图表工具文；粘贴表格/CSV→柱状图/折线图/饼图→自绘 SVG 零依赖→PNG 导出；与成绩统计互链成「数据」旅程线；通用办公/自媒体/学生场景。难度中。SEO：在线图表生成、柱状图生成器、数据可视化。

图片裁剪维持节奏调节位（难度小，随时可打）；医学单位换算器+常用医学计算器为医疗组合备选；屏幕录制维持通用顶位备选；课程表生成器本轮升级为 P1（待 PM 定序）。

**通用候选表**（2026-10-17 第二轮；双十一凑单计算器已实现划出；课程表生成器证据补强升级 P1；在线文字转语音维持 P2 观察）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 字体版权查询 | 360doc 2026-03-21 推荐 360 查字体「检测电脑已装字体是否可商用」；CSDN PPT 版权文：微软雅黑/方正/汉仪需付费授权 vs 思源/阿里普惠体/站酷/OPPO Sans 免费商用；360doc 2026-01-03「字体侵权诉讼频发」设计圈持续痛点；canvas 本地字体探测+离线版权状态库（约 200 字体：免费商用/需授权/高风险+安全替代推荐），「字体列表不出浏览器」差异化；与 fancy_fonts（花体生成）方向不同 | 中 | P1（顺位首选） |
| 简历预检工具（JD 关键词匹配/ATS 检测） | V2EX t/1210967 棱镜简历：漏写技术栈/项目描述流水账真实踩坑；JD 关键词匹配度/ATS 友好度检测/「做了什么→结果如何」逻辑链/雷区清单全纯前端可实现；秋招季时令；与极简简历制作器成「求职」组合互链；80 Path 无重叠 | 中 | P1 |
| 在线图表生成器（数据粘贴→图表导出） | 360doc 咖喱君「文字一键转图表」、支付宝 ChartCube 上传 Excel/CSV 生成图表导出 PNG/PDF、CSDN 论文图表工具文；粘贴表格/CSV→柱状图/折线图/饼图→自绘 SVG 零依赖→PNG 导出；与成绩统计互链成「数据」旅程线；通用办公/自媒体/学生场景 | 中 | P1（顺位递进） |
| 极简简历制作器 | V2EX t/1210967 xukz.cn「Word 改简历调字间距打印格式崩溃」；CSDN IT 简历模板榜 Word 排版难痛点；360doc 2025-12-31 简历制作神器高频痛点；秋招季时令；结构化填写→A4 所见即所得预览→浏览器打印/PDF 导出，localStorage 免注册免上传，「简历不出浏览器」差异化叙事；80 Path 无 resume/简历重叠 | 中 | P1 |
| 图片裁剪（比例预设+拖拽裁剪框） | pixoate 预设比例 1:1/16:9/4:5+拖拽框实时预览+手机触屏；splitanimage 本地免上传图片套件；YouTube TemplateMaker.in 考试/求职/政府表单照片高频；与 img-resize（指定宽高数值裁剪）差异化明确无重叠；图片旅程线缺环补齐；canvas 纯前端本地免上传 | 小 | P1（节奏调节位） |
| 工作日计算器（含法定节假日/调休） | V2EX PriTime「法定节假日/调休补班重复，国内用户刚需」；yize/chinese-workday 2011-2026 数据+浏览器 CDN；Excel NETWORKDAYS 手工维护节假日痛点；起止日期→工作日天数+单日「要上班吗」查询；与 /tools/calendar（仅展示）无重叠；难度中（年份数据表需年更） | 中 | P1 |
| 图片拼图（网格模板拼图） | 360doc 2026-01-30 四选一首位；Photo Collage Maker 形态：多张图合成一格、网格/异形模板、自定义布局、文字/贴纸；与 nine-grid（九宫格切图，一张图切多格）方向相反无重叠；与 img-stitch（一维长图拼接）形态不同；canvas 纯前端本地免上传 | 小 | P1 |
| 屏幕录制（在线录屏） | 360doc 2026-01-30 宝藏站单列推荐；网易测评三大痛点：免费导出带水印、桌面软件要安装、公司电脑禁装软件只能用网页方案；100% 纯前端（getDisplayMedia+MediaRecorder→webm），免安装无水印文件不出本机；桌面端优先 | 中 | P1（通用顶位备选） |
| 课程表生成器 | 本轮升级（CSDN 2026-01「数字化课程表」：Word/Excel 手工绘制耗时、调课改版易混乱、排版单调；360doc 2025-12-10 教师五大难题列排课为核心难题，重型排课 SaaS 学习曲线长成本高）；可行范围：个人/班级课程表拖拽填课+简易撞课提示+配色模板+打印/PDF 导出（不做全校智能排课算法）；纯前端；80 Path 无重叠 | 中 | P1（本轮升级） |
| cURL 转代码 | 开发者刚需（HN 讨论 + curlconverter 开源库 27+ 语言）；赛道已有成熟免费玩家，垂直小众 | 小 | P1 |
| 文本敏感信息打码 | 文本身份证/手机号/银行卡号脱敏；未找到强需求信号，运营场景刚需但证据弱 | 小 | P1（观察） |
| Excel 公式中文解释器 | 360doc「Excel 公式机器人」文本指令转公式是 AI 能力、不可做；反向「公式→中文分步解释」纯前端可做：词法拆解+函数中文说明库；证据单薄仅一条，待补强 | 中 | P1（观察） |
| Markdown 表格修复 | 中文全角/emoji 对齐错乱修复；赛道拥挤（tablesgenerator、tableconvert、编辑器插件生态），纯本地免费可差异化 | 小 | P1（末位） |
| 证件照换底色 | CSDN+360doc 实测文再确认刚需（微信小程序爆款均靠 AI 服务器抠图）；发丝级抠图需 AI 分割模型（WASM 版数十 MB），不完全符合纯轻量前端口径，等轻量方案 | 中 | P2（观察） |
| SQLite 在线查看器 | dev.to Tooltri 单次提及；sql.js WASM 纯前端可读 .db 文件；开发者小众 | 中 | P2（观察） |
| 手写模拟器 | 360doc 2026-02-14 萝卜工坊；作业/笔记/贺卡趣味场景；canvas+手写体字库纯前端可做 | 小 | P2（观察） |
| 在线文字转语音（Web Speech API） | 本轮维持观察（补搜：赛道被 AI 拟真语音统治——Speechify 50 万+五星、AIVocal 600+音色；Web Speech API 系统语音音质参差、不可定制音色，免登录叙事不足以对冲质量差距；证据仍单薄） | 小 | P2（观察） |

**已实现（双十一凑单计算器本轮划出）**：思维导图 → 表格拆分 → 表格合并 → **HEIC 转 JPG（已开发、未可交付——12:30 真机实测失败、生产已回滚，见历史轮次「⚠️ 待修复」）** → 成绩统计分析 → 二手房税费计算器 → 房贷计算器 → PDF 可填写表单制作器（+触屏修复）→ 工资个税计算器（8a6e0cc：七项专项附加扣除+年终奖计税对比，与房贷/二手房税费三向互链成「财务」旅程线）→ **双十一凑单计算器（145e47e+3d02c3c：满减档位自定义+子集和 DP 最小溢出最优组合+「还差 XX 元」提示与候补单品建议，纯前端本地计算）**；以上均已从候选池划出，历史记录保留于下方各轮次小节。

**归档说明**：本轮为 10-17 通用调研第二轮（WPS 特别方向 10-15 已结束）——双十一凑单计算器交付闭环（145e47e+3d02c3c），候选池划出，全量 80 Path；「课程表生成器」证据补强升级 P1（CSDN 数字化课程表痛点文 + 360doc 教师五大难题排课项，可行范围界定为轻量拖拽填课+模板打印，区别于重型排课 SaaS）；「在线文字转语音」维持 P2 观察（赛道被 AI 拟真语音统治，Web Speech API 音质差距无法对冲）；V2EX 近期（PREX/A 股复盘/Zendot/ShareLLM/PlainMote）与 r/AskReddit 免费网站榜单均无单页可落地新信号；360doc 工具榜多为已覆盖项回声；WPS 候选表保持冻结归档；仓库 80 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 80 Path，新候选（timetable_maker 建议 ID）无重叠；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

> 维护人：产品调研员 · 每日更新（2026-10-17 03:00 第一轮研究）

## 今日任务（2026-10-17 03:00 · 产品调研员研究轮 ✅）

**交付状态**：10-17 通用调研第一轮（WPS 特别方向 10-09~10-15 已结束，区间外恢复通用调研）。10-16 第九轮研究推荐的工资个税计算器已交付闭环（8a6e0cc，Path `/tools/salary-tax-calculator` 已注册，全量 79 Path），本轮确认划出。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮五件事**（03:00 全网调研，通用方向）：
1. 工资个税计算器交付确认：8a6e0cc 开发交付（七项专项附加扣除+年终奖单独·合并计税对比+划算建议）；`grep tools/categories.go` 确认 Path `/tools/salary-tax-calculator` 已注册（全量 79 Path）；与房贷计算器/二手房税费计算器三向互链，「财务」旅程线闭环；候选池划出。
2. 新晋时令候选：**双十一凑单计算器**。需求证据三重：① 时令——双十一（11-11）距今 25 天，年度全民「满减奥数」痛点季，属周期性刚需；② 新浪财经/网易双十一攻略文一致把「凑单满减（每满 300 减 50）」列为核心省钱战术，「还差 XX 元可减」是购物车高频场景；③ 淘宝官方虽有一键凑单提示，但跨店凑、多档位满减、和朋友拼单等场景仍需手动算。形态：输入商品清单+价格→自定义满减档位（满 300-50 等）→最优凑单组合建议（子集和/背包选品，最小溢出）+实付价明细；纯前端本地计算零依赖。去重：`grep tools/categories.go` 79 Path 无 凑单/满减/购物 重叠。难度中。SEO：双十一凑单、满减计算器、凑单神器。
3. 新晋候选：**字体版权查询**。需求证据三重：① 360doc 2026-03-21「6 个良心网站」单列推荐 360 查字体——「一键检测电脑已安装字体是否可商用」；② CSDN PPT 素材版权风险文：字体侵权是 PPT/设计高频雷区（微软雅黑/方正/汉仪需付费授权；免费商用：思源黑体/宋体、阿里巴巴普惠体、站酷系列、OPPO Sans），文内引用 360 查字体为查询入口；③ 360doc 2026-01-03 开源字体库汇总：「方正字库版权流氓式诉讼频发」是设计圈持续多年痛点。可行性：纯前端可做——canvas 字体探测技术检测用户本地已安装字体（「字体列表不出浏览器」隐私叙事，对标 360 查字体核心价值）+ 内置离线版权状态库（约 200 常见字体：免费商用/需授权/高风险，附安全替代推荐）。去重：79 Path 无 font/字体版权重叠（`fancy_fonts` 为花体字生成器，方向不同）。难度中（版权库需人工整理校对）。SEO：字体版权查询、字体可商用吗、字体侵权查询。
4. 新晋候选：**简历预检工具（JD 关键词匹配/ATS 检测）**。需求证据：V2EX t/1210967「棱镜简历」（2026-05）：投简历漏写关键技术栈、项目描述写成流水账是真实踩坑；其工具形态（JD 关键词匹配度/ATS 友好度检测/项目描述「做了什么→结果如何」逻辑链检查/简历雷区清单）全部纯前端可实现（关键词统计、表格·图片·特殊符号等 ATS 规则检查、雷区 checklist）；秋招季时令；与池内「极简简历制作器」成「求职」组合（制作→预检），互链。去重：79 Path 无 预检/check 重叠。难度中。SEO：简历检查、简历优化、ATS 检测。
5. 无新单页信号侧 / 去重：① 360doc 2026-02-09「本地化隐私优先 OCR」——ToolWeb 已有 `/tools/ocr-image-text`、`/tools/ocr-batch`（本地识别不上传、不限次），需求已满足不立项（注：OCR 属 WPS 会员功能之一，归档的 WPS 候选表中已有回响，现以自有工具满足）；② 同文「网页长截图（Screenshot Guru）」需服务端渲染目标 URL，不符合纯前端口径，不立项；③ 同文「批量图片加水印」ToolWeb 已有水印工具；④ 同文「文字转语音（AI 配音）」：浏览器 Web Speech API 纯前端可做、中文语音随系统，但音质参差、不可定制音色，且证据仅单条，进 P2 观察；⑤ V2EX 侧：DevFloat（桌面端+手机互传需后端）、抛硬币（过于 trivial）、侧边书签工作台（浏览器插件非网页）、A 股复盘（需行情数据后端）、PMGap（AI 能力）均无单页可落地项。

**推荐 Top3**（排期建议；努力度为单页前端交付量级评估；尊重 PM 定序）：

1. **双十一凑单计算器** — P1（时令首选）：双十一距今 25 天，年度全民「满减奥数」痛点季；新浪财经/网易攻略一致确认凑单满减是核心省钱战术；商品清单+价格→自定义满减档位→最优凑单组合（最小溢出）+实付价明细；纯前端零依赖；79 Path 无重叠。难度中。SEO：双十一凑单、满减计算器、凑单神器。
2. **字体版权查询** — P1（本轮新晋）：360 查字体形态验证（2026-03-21 推荐）+ CSDN 字体侵权雷区文 +「诉讼频发」设计圈持续痛点三重证据；canvas 本地字体探测+离线版权库，「字体列表不出浏览器」差异化叙事；与 fancy_fonts 方向不同无重叠。难度中（版权库需人工整理）。SEO：字体版权查询、字体可商用吗、字体侵权查询。
3. **简历预检工具（JD 关键词匹配/ATS 检测）** — P1（本轮新晋）：V2EX t/1210967 棱镜简历真实踩坑证据；JD 关键词匹配/ATS 检测/逻辑链检查/雷区清单全纯前端可实现；秋招季时令；与极简简历制作器成「求职」组合互链。难度中。SEO：简历检查、简历优化、ATS 检测。

在线图表生成器留顺位第四（已连续三轮推荐未被选，证据仍有效，可作节奏调节）；图片裁剪维持节奏调节位（难度小）；医学单位换算器+常用医学计算器为医疗组合备选；屏幕录制维持通用顶位备选。

**通用候选表**（2026-10-17 03:00 第一轮；工资个税计算器已实现划出；新晋双十一凑单计算器/字体版权查询/简历预检工具；在线文字转语音进 P2 观察）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 双十一凑单计算器 | 时令（11-11 距今 25 天，年度全民「满减奥数」痛点季；新浪财经/网易双十一攻略一致列「凑单满减（每满 300 减 50）」为核心战术，「还差 XX 元可减」高频场景；淘宝官方一键凑单不覆盖跨店/多档位/拼单）；商品清单+价格→自定义满减档位→最优凑单组合建议（最小溢出）+实付价明细；纯前端本地计算；79 Path 无重叠 | 中 | P1（本轮新晋·时令首选） |
| 字体版权查询 | 本轮新晋（360doc 2026-03-21 推荐 360 查字体「检测电脑已装字体是否可商用」；CSDN PPT 版权文：微软雅黑/方正/汉仪需付费授权 vs 思源/阿里普惠体/站酷/OPPO Sans 免费商用；360doc 2026-01-03「字体侵权诉讼频发」设计圈持续痛点）；canvas 本地字体探测+离线版权状态库（约 200 字体：免费商用/需授权/高风险+安全替代推荐），「字体列表不出浏览器」差异化；与 fancy_fonts（花体生成）方向不同 | 中 | P1（本轮新晋） |
| 简历预检工具（JD 关键词匹配/ATS 检测） | 本轮新晋（V2EX t/1210967 棱镜简历：漏写技术栈/项目描述流水账真实踩坑；JD 关键词匹配度/ATS 友好度检测/「做了什么→结果如何」逻辑链/雷区清单全纯前端可实现；秋招季时令；与极简简历制作器成「求职」组合互链）；79 Path 无重叠 | 中 | P1（本轮新晋） |
| 在线图表生成器（数据粘贴→图表导出） | 360doc 咖喱君「文字一键转图表」、支付宝 ChartCube 上传 Excel/CSV 生成图表导出 PNG/PDF、CSDN 论文图表工具文；粘贴表格/CSV→柱状图/折线图/饼图→自绘 SVG 零依赖→PNG 导出；与成绩统计互链成「数据」旅程线；通用办公/自媒体/学生场景 | 中 | P1（顺位第四） |
| 极简简历制作器 | V2EX t/1210967 xukz.cn「Word 改简历调字间距打印格式崩溃」；CSDN IT 简历模板榜 Word 排版难痛点；360doc 2025-12-31 简历制作神器高频痛点；秋招季时令；结构化填写→A4 所见即所得预览→浏览器打印/PDF 导出，localStorage 免注册免上传，「简历不出浏览器」差异化叙事；79 Path 无 resume/简历重叠 | 中 | P1 |
| 图片裁剪（比例预设+拖拽裁剪框） | pixoate 预设比例 1:1/16:9/4:5+拖拽框实时预览+手机触屏；splitanimage 本地免上传图片套件；YouTube TemplateMaker.in 考试/求职/政府表单照片高频；与 img-resize（指定宽高数值裁剪）差异化明确无重叠；图片旅程线缺环补齐；canvas 纯前端本地免上传 | 小 | P1（节奏调节位） |
| 工作日计算器（含法定节假日/调休） | V2EX PriTime「法定节假日/调休补班重复，国内用户刚需」；yize/chinese-workday 2011-2026 数据+浏览器 CDN；Excel NETWORKDAYS 手工维护节假日痛点；起止日期→工作日天数+单日「要上班吗」查询；与 /tools/calendar（仅展示）无重叠；难度中（年份数据表需年更） | 中 | P1 |
| 图片拼图（网格模板拼图） | 360doc 2026-01-30 四选一首位；Photo Collage Maker 形态：多张图合成一格、网格/异形模板、自定义布局、文字/贴纸；与 nine-grid（九宫格切图，一张图切多格）方向相反无重叠；与 img-stitch（一维长图拼接）形态不同；canvas 纯前端本地免上传 | 小 | P1 |
| 屏幕录制（在线录屏） | 360doc 2026-01-30 宝藏站单列推荐；网易测评三大痛点：免费导出带水印、桌面软件要安装、公司电脑禁装软件只能用网页方案；100% 纯前端（getDisplayMedia+MediaRecorder→webm），免安装无水印文件不出本机；桌面端优先 | 中 | P1（通用顶位备选） |
| cURL 转代码 | 开发者刚需（HN 讨论 + curlconverter 开源库 27+ 语言）；赛道已有成熟免费玩家，垂直小众 | 小 | P1 |
| 文本敏感信息打码 | 文本身份证/手机号/银行卡号脱敏；未找到强需求信号，运营场景刚需但证据弱 | 小 | P1（观察） |
| Excel 公式中文解释器 | 360doc「Excel 公式机器人」文本指令转公式是 AI 能力、不可做；反向「公式→中文分步解释」纯前端可做：词法拆解+函数中文说明库；证据单薄仅一条，待补强 | 中 | P1（观察） |
| Markdown 表格修复 | 中文全角/emoji 对齐错乱修复；赛道拥挤（tablesgenerator、tableconvert、编辑器插件生态），纯本地免费可差异化 | 小 | P1（末位） |
| 证件照换底色 | CSDN+360doc 实测文再确认刚需（微信小程序爆款均靠 AI 服务器抠图）；发丝级抠图需 AI 分割模型（WASM 版数十 MB），不完全符合纯轻量前端口径，等轻量方案 | 中 | P2（观察） |
| SQLite 在线查看器 | dev.to Tooltri 单次提及；sql.js WASM 纯前端可读 .db 文件；开发者小众 | 中 | P2（观察） |
| 手写模拟器 | 360doc 2026-02-14 萝卜工坊；作业/笔记/贺卡趣味场景；canvas+手写体字库纯前端可做 | 小 | P2（观察） |
| 在线文字转语音（Web Speech API） | 本轮新晋观察（360doc 2026-03-21 AI 配音单条证据：视频自媒体配音需求；浏览器 speechSynthesis 纯前端免费可做，中文语音随系统；音质参差、不可定制音色，证据单薄） | 小 | P2（观察） |

**已实现（工资个税计算器本轮划出）**：思维导图 → 表格拆分 → 表格合并 → **HEIC 转 JPG（已开发、未可交付——12:30 真机实测失败、生产已回滚，见历史轮次「⚠️ 待修复」）** → 成绩统计分析 → 二手房税费计算器 → 房贷计算器 → PDF 可填写表单制作器（+触屏修复）→ **工资个税计算器（8a6e0cc：七项专项附加扣除+年终奖计税对比，与房贷/二手房税费三向互链成「财务」旅程线）**；以上均已从候选池划出，历史记录保留于下方各轮次小节。

**归档说明**：本轮为 10-17 通用调研第一轮（WPS 特别方向 10-15 已结束）——工资个税计算器交付闭环（8a6e0cc），候选池划出；新晋候选「双十一凑单计算器」（时令首选，11-11 距今 25 天，年度全民满减奥数痛点）、「字体版权查询」（360 查字体形态验证+字体侵权诉讼持续痛点，canvas 本地探测+离线版权库，纯前端可行）、「简历预检工具」（V2EX 棱镜简历证据，秋招季，与极简简历制作器成「求职」组合）；「在线文字转语音」进 P2 观察（证据单条、音质参差）；360doc 本地 OCR 推荐属 ToolWeb 已有工具（/tools/ocr-image-text、/tools/ocr-batch 本地免上传）覆盖，不立项；网页长截图需服务端渲染不符合纯前端口径，不立项；V2EX 侧（DevFloat/抛硬币/侧边书签工作台/A 股复盘/PMGap）无单页可落地新信号；WPS 候选表保持冻结归档；仓库 79 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 79 Path，新候选（double11_bundling / font_license_check / resume_checker 建议 ID）无重叠；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

> 维护人：产品调研员 · 每日更新（2026-10-16 19:00 第八轮研究）

> 维护人：产品经理 · 每日排期（2026-10-16 17:38 PM 决策轮·10-16 第七轮）

> 维护人：产品经理 · 每日排期（2026-10-16 19:00 PM 决策轮·10-16 第八轮）

## 今日任务（2026-10-16 21:00 · 产品经理排期决策 ✅）

**交付状态**：10-16 决策轮。今日已八连交付（思维导图→表格拆分→表格合并→HEIC（已回滚）→成绩统计分析→二手房税费计算器→房贷计算器→PDF 可填写表单制作器（+触屏修复）），按 19:00 排期决策轮定序与 21:00 研究轮 Top3 顺位首选推荐递进，本轮立项**唯一开发任务：工资个税计算器（含专项附加扣除）**。

**选定：工资个税计算器（含专项附加扣除）（/tools/salary-tax-calculator）** — 今日唯一任务：
- **顺位递进**：21:00 研究轮 Top3 顺位首选推荐（时令首选），不改既定定序。
- **需求证据三重**：① 时令刚需——新浪财经 2026 年度专项附加扣除 11-12 月全民确认季临近；② 旅程线闭环——今日房贷计算器+二手房税费计算器交付后，「财务」簇形成个税→房贷→税费旅程线，本工具为缺口补齐项；③ 形态验证——Chrome Web Store 税后工资插件形态（社保公积金基数/七项专项扣除/年终奖单独·合并计税对比）已验证需求成立。纯前端，难度中。
- **SEO**：个税计算器、税后工资、专项附加扣除。
- **旅程线互链**：/tools/second-hand-house-tax、/tools/mortgage-calculator 与新工具三向互链「财务」簇。
- **去重**：grep tools/categories.go 全量 78 Path，无 salary/个税/工资税实质命中（个人所得税字样仅见于 second_hand_house_tax 描述中的税种列举，功能不重叠）；Path `/tools/salary-tax-calculator` 无重叠。
- **未选**：在线图表生成器（P1，留下一顺位，难度中）；极简简历制作器（P1 本轮新晋，秋招季时令，留作下一顺位）；图片裁剪（P1 节奏调节位）、医学单位换算器+常用医学计算器（医疗组合备选）等其余候选留池。

**规格**：
1. 输入区：税前月薪、年终奖；社保/公积金个人缴纳金额（支持按基数×比例自动算或手动输入），分城市可配？首版简化为手动输入+常用基数提示；七项专项附加扣除（子女教育/继续教育/大病医疗/住房贷款利息/住房租金/赡养老人/3岁以下婴幼儿照护）逐项勾选填金额。
2. 计算：按现行综合所得累计预扣预缴逻辑算月度/年度个税；输出税后工资、月度应纳税额、年度总税额、有效税率；年终奖「单独计税 vs 并入综合所得」两种方案对比展示，自动给出划算建议。
3. 专项附加扣除确认季提示：页面提示「11-12 月为专项附加扣除信息确认季」，引导用户核对扣除项。
4. 免责声明：显眼位置「计算规则按 2019 年个税法及现行细则实现，仅供参考，不构成税务建议；具体以税务机关口径为准」。
5. 隐私声明：「纯前端本地计算，数据不出浏览器，不上传任何服务器」。
6. 旅程线互链：页底「房贷/税费也算算？」区链接 /tools/mortgage-calculator、/tools/second-hand-house-tax；mortgage_calculator.html、second_hand_house_tax.html 页底反向加「算算税后工资」链接。
7. 注册：`tools/categories.go`「财务计算」或现有财务品类新增 ID `salary_tax_calculator`、Path `/tools/salary-tax-calculator`，中英文描述 + SEO keywords（个税计算器、税后工资、专项附加扣除、年终奖计税、2026 个税）。

**验收标准**：
- [ ] `/tools/salary-tax-calculator` 可开（200）
- [ ] 输入税前工资/社保公积金/专项扣除后，税后工资与月度个税计算正确（与权威计算器交叉抽验 3 组数据）
- [ ] 年终奖单独计税 vs 并入综合所得两种方案对比正确，推荐结论合理
- [ ] 七项专项附加扣除均可录入生效，空值=0 不报错
- [ ] 确认季提示与免责声明位置显眼
- [ ] 纯前端无后端调用、无数据外发（DevTools Network 抽查）
- [ ] 与房贷计算器/二手房税费三向互链链接有效
- [ ] `categories.go` 注册完成，首页列表/导航/SEO 配置生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/salary_tax_calculator.html`、`static/js/salary_tax_calculator.js`、`tools/categories.go`、`templates/mortgage_calculator.html`、`templates/second_hand_house_tax.html`（互链编辑）、`BACKLOG.md`（本小节）。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 可拉取；grep 全量 78 Path 无 salary/个税/工资税实质命中，Path `/tools/salary-tax-calculator` 无重叠；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

## 今日任务（2026-10-16 19:00 · 产品经理排期决策 ✅）

**交付状态**：10-16 第八轮排期决策。今日已七连交付（思维导图→表格拆分→表格合并→HEIC（已回滚）→成绩统计分析→二手房税费计算器→房贷计算器），按 15:00/17:00/17:38 三轮锁定的定序与 19:00 研究轮 Top3 顺位首选推荐递进，本轮立项**唯一开发任务：PDF 可填写表单制作器**。

**选定：PDF 可填写表单制作器（/tools/pdf-form-maker）** — 今日唯一任务：
- **顺位递进**：15:00 研究轮新晋后连续三轮定为「顺位第二」；房贷计算器交付后自然递进为首选；19:00 研究轮 Top3 顺位首选推荐，不改定序。
- **需求证据三重**：① Reddit 2026-09-02 热帖高赞 Sejda 免费表单工具（「把普通 PDF 转成可填写表单免费搞定」）；② 付费墙明确——表单域制作是 Adobe Acrobat Pro / pdfFiller 订阅 / 福昕高级版的付费功能；③ ToolWeb PDF 簇 13 工具（合并拆分/转图片/水印/批注打码/加密/压缩/转 Word/PPT…）经 grep 确认无表单项（`format` 仅见于 xml/sql-formatter 品类，`填写/表单` 无实质命中）。
- **旅程线叙事**：与现有 PDF 批注（/tools/pdf-annotate）、PDF 加密开「合同表单」子旅程线（批注→填表→加密），双向互链。
- **技术就绪**：pdf-lib 1.17.1 已是现有栈（cdnjs CDN 懒加载，pdf-merge-split/pdf-manage 在用），原生支持 AcroForm 文本框/复选框/单选/下拉；pdf.js 逐页缩略图渲染有 pdf-manage 先例可直接复用。风险已标注：pdf-lib 标准字体无 CJK，中文表单域外观流须内嵌字体（Noto Sans SC 子集化），交开发轮专项验证。
- **未选**：在线图表生成器（P1，留下一顺位，难度中）；图片裁剪（P1 本轮证据已补强，难度小，留作节奏调节位或下一顺位）；医学单位换算器/图片拼图/屏幕录制等其余 P1 留在候选池。

**规格**：
1. 上传 PDF：本地 FileReader 读取，pdf.js 逐页渲染预览（沿 pdf-manage 先例）；加密 PDF 先提示需解密后处理；单文件过大（>50MB）提示性能警告。
2. 表单域放置：左侧工具栏选域类型（文本框单行/多行、复选框、单选按钮组、下拉列表），点击页面放置，拖拽移动、拖拽角点缩放；点击选中域可编辑属性（字段名、复选/单选默认状态、下拉选项列表、删除）。
3. 导出：pdf-lib 将表单域写为 AcroForm 标准结构，下载「可填写 PDF」（Acrobat/Reader/浏览器原生可填）。
4. 中文输入：文本框外观流内嵌 Noto Sans SC 子集化字体，开发轮必须真机验证中文填写显示正常；验证不通过降级提示「英文表单域」。
5. 隐私声明：页面显眼位置「基于 pdf-lib 的纯前端本地处理，文件只在你的浏览器里流转，不上传任何服务器」。
6. 旅程线互链：pdf_form_maker 页底加「批注完再填表？→ PDF 批注打码（/tools/pdf-annotate）」；pdf_annotate.html 页底加「批注完→制作可填写表单」反向链接。
7. 注册：`tools/categories.go`「PDF 工具」品类新增 ID `pdf_form_maker`、Path `/tools/pdf-form-maker`，中英文描述 + SEO keywords（PDF 可填写表单、PDF 添加表单域、PDF 表单制作、免费 PDF 表单工具、AcroForm）。

**验收标准**：
- [ ] `/tools/pdf-form-maker` 可开（200）；PDF 上传可渲染逐页预览
- [ ] 四种表单域（文本框单/多行、复选框、单选组、下拉）均可放置、移动、缩放、删除
- [ ] 字段名/默认状态/下拉选项编辑生效
- [ ] 导出 PDF 为标准可填写表单（Acrobat/浏览器可填写输入）
- [ ] 中文表单域输入显示正常（CJK 字体嵌入专项验证通过）
- [ ] 隐私声明位置显眼
- [ ] 与 /tools/pdf-annotate 双向互链链接有效
- [ ] `categories.go` 注册完成，首页列表/导航/SEO 配置生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/pdf_form_maker.html`、`static/js/pdf_form_maker.js`、`tools/categories.go`、`templates/pdf_annotate.html`（互链编辑）、`BACKLOG.md`（本小节）。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 77 Path（Path 层无 form/表单/填写实质命中，`form` 仅见于 xml-formatter/sql-formatter 品类；ID `pdf_form_maker` 无重叠；Path `/tools/pdf-form-maker` 无重叠）；本地当前分支 muse/dev-20260929；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

**开发交付（2026-10-16 20:05 · 前端开发 ✅）**：
- 新增文件：`templates/pdf_form_maker.html`（SEO/隐私横幅/工具栏/属性面板/旅程线互链）、`static/js/pdf_form_maker.js`（上传→pdf.js 逐页渲染→覆盖层放置/拖拽/缩放→属性编辑→pdf-lib AcroForm 导出）、`static/fonts/noto-sans-sc-subset.ttf`（Noto Sans SC 简体子集 OFL，7333 CJK）、`static/js/vendor/fontkit-1.1.1.umd.min.js`（@pdf-lib/fontkit 本地 vendor，供 pdf-lib 解析自定义字体）。
- 注册：`tools/categories.go`「文档转换」品类新增 ID `pdf_form_maker`（Path `/tools/pdf-form-maker`，New:true）；`templates/pdf_annotate.html` 配套使用区加反向链接。
- **中文表单域专项验证（真机级，通过 ✅）**：pdf-lib 1.17.1 + fontkit 在 Node 实测链路，AcroForm 五字段回读值全对；poppler 渲染抽查文本框「张三 测试」/多行/复选框✓/单选"女"/下拉「上海」全部正常显示。关键发现：pdf-lib 的 `subset:true` 运行时子集化对该字体会产生损坏字形（已用 fontTools 取证），故改用 `subset:false` 完整嵌入本站预子集化字体（导出 PDF 约 1.6MB）；字体加载失败时降级英文表单域并明确提示。
- 本地构建通过（`go build ./...`）、`node --check` 通过；本地 18097 实测 `/tools/pdf-form-maker`、JS、字体、fontkit UMD 均为 200，首页已收录，双向互链与隐私横幅生效。
- 验收标准对照：①可开200/逐页预览 ✅ ②四域放置移动缩放删除 ✅（编辑器实现）③属性编辑 ✅（编辑器实现）④标准可填写表单 ✅（AcroForm 回读+渲染验证）⑤中文显示 ✅（专项验证）⑥隐私显眼 ✅（页首横幅+说明）⑦双向互链 ✅（实测链接）⑧注册 ✅（首页收录）⑨待测试轮+部署 QA。

## 今日任务（2026-10-16 21:00 · 产品调研员研究轮 ✅）

**交付状态**：10-16 通用调研第九轮（WPS 特别方向 10-15 已结束）。PDF 可填写表单制作器今日已交付闭环（19:00 立项→开发交付 fb3735d，触屏 pointerdown 修复 0c5b969），今日八连交付完成（思维导图→表格拆分→表格合并→HEIC（已回滚）→成绩统计分析→二手房税费计算器→房贷计算器→PDF 表单）。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮四件事**（21:00 全网调研，通用方向）：
1. PDF 表单交付确认：19:00 决策轮立项→开发交付（fb3735d：pdf.js 逐页渲染预览+表单域放置/拖拽/缩放+pdf-lib AcroForm 标准导出+中文内嵌字体真机专项验证通过；0c5b969 触屏 pointerdown 修复）；`grep tools/categories.go` 确认 Path `/tools/pdf-form-maker` 已注册（全量 78 Path），与候选池无重叠项残留；候选池划出。
2. 新晋通用候选：**极简简历制作器（纯前端→打印/PDF 导出）**。需求证据三重：① V2EX t/1210967「xukz.cn 棱镜简历」（2026-05）：Word 改简历「每次调字间距打印格式都崩溃」痛点，无需注册、草稿浏览器本地缓存——本地免上传路线可行；② CSDN IT 岗位简历模板榜：Word 排版难、格式一改就乱，毕业生/实习生/转岗新人卡在简历第一步；③ 360doc 2025-12-31「私藏！解决你 5 个高频痛点的网站」：简历制作神器（模板陈旧/排版混乱/内容空洞三大通病）列为高频痛点。时令：10-16 正值秋招季，简历是校招最高频动作。形态：结构化填写（个人信息/教育/经历/技能）→A4 所见即所得预览→浏览器打印/PDF 导出，localStorage 草稿缓存免注册免上传，「简历不出浏览器」差异化叙事（隐私敏感数据本地处理）。去重：`grep tools/categories.go` 无 resume/简历命中（全量 78 Path）。难度中（A4 打印 CSS 分页、2-3 套极简模板）。SEO：在线简历制作、免费简历模板、简历制作器。
3. 用户反馈（2026-10-16：中小学教师/医生/房产中介，三人平均 3.9/5）候选提炼：① 新工具「常用医学计算器」（BMI/eGFR/肌酐清除率，[医生] P0 刚需，附公式来源+「仅供参考」声明，纯前端）进通用池 P1，与医学单位换算器可成「医疗」旅程线；② 「药物剂量换算」因涉及给药建议安全风险，降级 P2 观察（需强声明+安全范围提示，慎做）；③ 「房源海报一键生成」（[房产中介] 户型图/房源图+价格/面积/电话拼朋友圈海报，canvas 纯前端）进 P1 观察池（证据仅单职业一条）；④ 「二手房税费计算器」「成绩统计分析」「房贷计算器」反馈再次强化，均已交付，不重复立候选；⑤ P0 缺陷两条（水印中文静默丢失、二维码「识别」假功能）归缺陷清单，不在新工具池立项。
4. 无新单页信号侧：360doc 2026-02-28「这 10 个 AI 工具」全为 AI 助手类（豆包/WPS AI/讯飞听见/剪映 AI），无纯前端单页可落地项；HN duklee 10-09 roundup（Fleeting 模拟会议录音 600pts）为趣味项目，其 .ics 日历邀请生成器可单页实现但需求薄弱不立项；Guru99 工作流软件榜（Zoho/Miro）均为 SaaS 非单页工具；PDF 转 Word/Excel 测评文聚焦移动端小程序与会员功能（WPS 高级转换需会员），ToolWeb 已有 pdf-to-word，场景不重叠。

**推荐 Top3**（排期建议；努力度为单页前端交付量级评估；尊重既有定序）：

1. **工资个税计算器（含专项附加扣除）** — P1（时令首选）：新浪财经 2026 年度专项附加扣除 11-12 月全民确认季临近，时令刚需；今日房贷+二手房税费交付后「财务」簇闭环（个税→房贷→税费旅程线）；Chrome Web Store 税后工资插件形态验证（社保公积金基数/七项专项扣除/年终奖单独·合并计税对比）；纯前端。难度中。SEO：个税计算器、税后工资、专项附加扣除。
2. **在线图表生成器（数据粘贴→图表导出）** — P1（顺位递进，原 19:00 顺位首选）：360doc 咖喱君「文字一键转图表」+ 支付宝 ChartCube 双证据；自绘 SVG 零依赖先例已验证（成绩统计/思维导图）；与成绩统计互链成「数据」旅程线；通用办公/自媒体/学生全场景。难度中。SEO：在线图表生成、柱状图生成器、数据可视化。
3. **极简简历制作器** — P1（本轮新晋）：秋招季时令；V2EX xukz.cn Word 改简历崩溃痛点 + CSDN IT 简历模板榜 + 360doc 简历制作神器高频痛点三重证据；结构化填写→A4 预览→打印/PDF 导出，localStorage 免注册免上传，「简历不出浏览器」差异化叙事；赛道玩家（xukz.cn/全民简历）普遍走注册+会员路线，本地免费免登录可错位。难度中。SEO：在线简历制作、免费简历模板、简历制作器。

图片裁剪留节奏调节位/下一顺位（证据补强+去重确认完毕，难度小，随时可打）；医学单位换算器+常用医学计算器为医疗组合备选（[医生] P0 刚需）；屏幕录制维持通用顶位备选（难度中）；工作日计算器/图片拼图/cURL 转代码留 P1 池。

**通用候选表**（2026-10-16 21:00 第九轮；PDF 可填写表单制作器已实现划出；新晋极简简历制作器/常用医学计算器；药物剂量换算 P2 观察；房源海报 P1 观察）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 工资个税计算器（含专项附加扣除） | 时令（11-12 月专项附加扣除确认季临近，新浪财经）；今日房贷+税费交付后财务簇闭环；Chrome Web Store 税后工资插件形态验证（社保公积金基数/七项专项扣除/年终奖单独·合并计税对比）；纯前端 | 中 | P1（本轮推荐首选） |
| 在线图表生成器（数据粘贴→图表导出） | 360doc 咖喱君「文字一键转图表」、支付宝 ChartCube 上传 Excel/CSV 生成图表导出 PNG/PDF、CSDN 论文图表工具文；粘贴表格/CSV→柱状图/折线图/饼图→自绘 SVG 零依赖→PNG 导出；与成绩统计互链成「数据」旅程线；通用办公/自媒体/学生场景 | 中 | P1（顺位递进） |
| 极简简历制作器 | 本轮新晋（秋招季时令；V2EX t/1210967 xukz.cn「Word 改简历调字间距打印格式崩溃」；CSDN IT 简历模板榜 Word 排版难痛点；360doc 2025-12-31 简历制作神器高频痛点）；结构化填写→A4 所见即所得预览→浏览器打印/PDF 导出，localStorage 免注册免上传；全量 78 Path 无 resume/简历重叠 | 中 | P1（本轮新晋） |
| 常用医学计算器（BMI/eGFR/肌酐清除率） | 本轮新晋（P0 刚需：BMI、体表面积 DuBois、eGFR CKD-EPI 2021、肌酐清除率 Cockcroft-Gault，附公式来源+「仅供参考」声明；与医学单位换算器可成「医疗」旅程线；纯前端） | 小 | P1（本轮新晋） |
| 图片裁剪（比例预设+拖拽裁剪框） | 证据补强（pixoate 预设比例 1:1/16:9/4:5+拖拽框实时预览+手机触屏；splitanimage 本地免上传图片套件；YouTube TemplateMaker.in 考试/求职/政府表单照片高频）；与 img-resize（指定宽高数值裁剪）差异化明确无重叠；图片旅程线缺环补齐；canvas 纯前端本地免上传 | 小 | P1（节奏调节位） |
| 工作日计算器（含法定节假日/调休） | V2EX PriTime「法定节假日/调休补班重复，国内用户刚需」；yize/chinese-workday 2011-2026 数据+浏览器 CDN；Excel NETWORKDAYS 手工维护节假日痛点；起止日期→工作日天数+单日「要上班吗」查询；与 /tools/calendar（仅展示）无重叠；难度中（年份数据表需年更） | 中 | P1 |
| 图片拼图（网格模板拼图） | 360doc 2026-01-30 四选一首位；Photo Collage Maker 形态：多张图合成一格、网格/异形模板、自定义布局、文字/贴纸；与 nine-grid（九宫格切图，一张图切多格）方向相反无重叠；与 img-stitch（一维长图拼接）形态不同；canvas 纯前端本地免上传 | 小 | P1 |
| 屏幕录制（在线录屏） | 360doc 2026-01-30 宝藏站单列推荐；网易测评三大痛点：免费导出带水印、桌面软件要安装、公司电脑禁装软件只能用网页方案；100% 纯前端（getDisplayMedia+MediaRecorder→webm），免安装无水印文件不出本机；桌面端优先 | 中 | P1（通用顶位备选） |
| cURL 转代码 | 开发者刚需（HN 讨论 + curlconverter 开源库 27+ 语言）；赛道已有成熟免费玩家，垂直小众 | 小 | P1 |
| 房源海报一键生成 | 本轮新晋观察（户型图/房源图+价格/面积/电话拼朋友圈海报，含二维码；canvas 纯前端本地免上传；证据仅单职业一条） | 小 | P1（观察） |
| 文本敏感信息打码 | 文本身份证/手机号/银行卡号脱敏；未找到强需求信号，运营场景刚需但证据弱 | 小 | P1（观察） |
| Excel 公式中文解释器 | 360doc「Excel 公式机器人」文本指令转公式是 AI 能力、不可做；反向「公式→中文分步解释」纯前端可做：词法拆解+函数中文说明库；证据单薄仅一条，待补强 | 中 | P1（观察） |
| Markdown 表格修复 | 中文全角/emoji 对齐错乱修复；赛道拥挤（tablesgenerator、tableconvert、编辑器插件生态），纯本地免费可差异化 | 小 | P1（末位） |
| 药物剂量换算 | 本轮新晋观察（按体重 mg/kg→总量、儿科剂量辅助；涉及给药建议安全风险高，需页面强声明+安全范围提示，慎做） | 小 | P2（观察·安全风险） |
| 证件照换底色 | CSDN+360doc 实测文再确认刚需（微信小程序爆款多多职业照/奈斯证照助手/立得一寸照/抠图喵均靠 AI 服务器抠图）；发丝级抠图需 AI 分割模型（WASM 版数十 MB），不完全符合纯轻量前端口径，等轻量方案 | 中 | P2（观察） |
| SQLite 在线查看器 | dev.to Tooltri 单次提及；sql.js WASM 纯前端可读 .db 文件；开发者小众 | 中 | P2（观察） |
| 手写模拟器 | 360doc 2026-02-14 萝卜工坊；作业/笔记/贺卡趣味场景；canvas+手写体字库纯前端可做 | 小 | P2（观察） |

**已实现（本日八连交付；PDF 表单已划出）**：思维导图（01:00 立项）→ 表格拆分（03:00 立项）→ 表格合并（05:40 立项）→ **HEIC 转 JPG（已开发、未可交付——12:30 真机实测失败、生产已回滚，见末尾「⚠️ 待修复」）** → 成绩统计分析（13:41 立项、交付 0d6da6c）→ 二手房税费计算器（15:39 立项、交付 cf76a06）→ 房贷计算器（17:39 立项、交付 dc50769）→ **PDF 可填写表单制作器（19:00 立项、本轮确认交付 fb3735d+0c5b969）**；以上均已从候选池划出，历史记录保留于下方各轮次小节。

**归档说明**：本轮为 10-16 通用调研第九轮——PDF 可填写表单制作器今日已交付闭环（fb3735d+0c5b969），候选池划出，今日八连交付完成；新晋候选「极简简历制作器」（秋招季时令，V2EX xukz.cn + CSDN + 360doc 三重证据，纯前端打印/PDF 导出，78 Path 无简历重叠）与「常用医学计算器」（[医生] P0 刚需，与医学单位换算器成医疗旅程线）进通用池 P1；「药物剂量换算」因给药安全风险降级 P2 观察；「房源海报一键生成」进 P1 观察池（单职业证据）；用户反馈缺陷两条（水印中文静默丢失、二维码识别假功能）已归缺陷清单，不在本轮新工具池立项；360doc AI 工具榜/HN Fleeting/Guru99 SaaS 榜无单页可落地新信号；WPS 候选表保持冻结归档；仓库 78 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 78 Path，新候选（resume_builder / med_calculator 建议 ID）无重叠；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

## 今日任务（2026-10-16 19:00 · 产品调研员研究轮 ✅）

**交付状态**：10-16 通用调研第八轮（WPS 特别方向 10-15 已结束）。房贷计算器今日已交付闭环（dc50769 开发交付，17:39 PM 决策轮立项为今日第七轮唯一任务），今日七连交付完成（思维导图→表格拆分→表格合并→HEIC（已回滚）→成绩统计分析→二手房税费计算器→房贷计算器）。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮五件事**（19:00 全网调研，通用方向）：
1. 房贷计算器交付确认：17:00 研究轮新晋→开发交付（dc50769：等额本息/等额本金、还款明细表、总利息对比、一键复制、与二手房税费计算器双向互链）；`grep tools/categories.go` 确认 Path `/tools/mortgage-calculator` 已注册（全量 77 Path），与候选池无重叠项残留；候选池划出。
2. 图片裁剪证据补强（本轮新搜三重证据）：① pixoate.com「Crop Image Online」——免费、预设比例（1:1/16:9/4:5/3:2 等）、拖拽裁剪框实时预览、手机+桌面触屏支持，形态验证；② splitanimage.com——「全部在浏览器中完成，无需上传或注册」的本地图片套件，含图片裁切/方形/圆形/网格切图/旋转，验证「本地免上传」差异化叙事；③ YouTube TemplateMaker.in「10+ FREE Image Tools」——Photo Crop 高频场景为学生/求职者/考试报名/政府表单照片（exam form/government form），证件照尺寸预设有真实需求。
3. 去重核查（纠偏）：现有 `/tools/img-resize`（图片尺寸调整）描述为「自定义缩放、裁剪图片，支持指定宽高」——`grep templates/img_resize.html` 确认其裁剪为指定宽高数值型（无 cropper/拖拽/比例预设字样）。候选「图片裁剪」差异化明确为「比例预设（1:1/16:9/证件照尺寸）+ 拖拽裁剪框实时预览」，与 img-resize 无实质重叠，保留 P1。另核查 `/tools/nine-grid`（九宫格切图）为「一张图切成多格」方向，与候选「图片拼图」（多张图合成一格+模板/文字/贴纸）方向相反，无重叠，拼图候选保留并加注方向区分。
4. 新晋通用候选：**工作日计算器（含中国法定节假日/调休补班）**。需求证据三重：① V2EX 2026-10「PriTime 待办清单」帖——「支持法定节假日/法定工作日（含调休补班）重复，国内用户刚需」；② GitHub yize/chinese-workday——2011-2026 年完整工作日/节假日/调休数据，浏览器 CDN 可直接用（沿 JSZip/libheif 懒加载先例）；③ Excel NETWORKDAYS(.INTL) 教程生态——用户靠手工维护节假日数组算工作日，痛点明确。去重：现有 `/tools/calendar`（在线日历）仅展示日历/农历/节假日信息（`grep static/js/calendar.js` 无 工作日/调休/补班 逻辑），无重叠。形态：起止日期→工作日天数（调休补班计入工作日、法定假剔除）+ 单日查询「这天要上班吗」；难度中（内置年份节假日数据表，每年更新一次，或走 CDN 库）。SEO：工作日计算器、调休日历、法定节假日查询。
5. 无新单页信号侧：HN 10-15 frontpage roundup（duklee.net）——Tiny Little Office（643pts/181 评论）「文档即链接、无账号、无服务端存储」印证免登录免上传工具浪潮（ToolWeb 定位验证，非新工具）；WallHop（付费墙绕过，265pts）涉法律面不立项。V2EX 泛搜（DevFloat 桌面端、PriTime 需后端、AI 中转站广告）无可单页落地新痛点。

**推荐 Top3**（排期建议；努力度为单页前端交付量级评估；尊重既有定序）：

1. **PDF 可填写表单制作器** — P1（顺位递进，原顺位第二）：Reddit 2026-09-02 热帖高赞 Sejda 免费表单工具 + Acrobat Pro/pdfFiller/福昕高级版付费墙双证据；pdf-lib AcroForm + pdf.js 缩略图全在现有栈；开「合同表单」子旅程线；CJK 表单域字体须专项验证。难度中。SEO：PDF 可填写表单、PDF 添加表单域、PDF 表单制作。
2. **在线图表生成器（数据粘贴→图表导出）** — P1（17:00 新晋顺延）：360doc 咖喱君「文字一键转图表」+ 支付宝 ChartCube 双证据；自绘 SVG 零依赖先例已验证；与成绩统计互链成「数据」旅程线；通用办公/自媒体/学生全场景。难度中。SEO：在线图表生成、柱状图生成器、数据可视化。
3. **图片裁剪（比例预设+拖拽裁剪框）** — P1（本轮证据补强+去重确认）：pixoate 预设比例+实时预览、splitanimage 本地免上传套件、YouTube TemplateMaker.in 考试/求职/政府表单照片高频；与 img-resize（指定宽高数值裁剪）差异化明确无重叠；图片旅程线缺环补齐。难度小。SEO：在线图片裁剪、图片裁剪比例、证件照尺寸裁剪。

**通用候选表**（2026-10-16 19:00 第八轮；房贷计算器已实现划出；工作日计算器新晋；图片裁剪证据补强；图片拼图加注方向区分）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| PDF 可填写表单制作器 | Reddit 2026-09-02 热帖高赞 Sejda 免费表单工具；Acrobat Pro/pdfFiller/福昕高级版付费墙；ToolWeb PDF 簇 13 工具无表单项；pdf-lib AcroForm + pdf.js 缩略图全在现有栈；开「合同表单」子旅程线；CJK 表单域字体须专项验证 | 中 | P1（顺位首选） |
| 在线图表生成器（数据粘贴→图表导出） | 360doc 咖喱君「文字一键转图表」、支付宝 ChartCube 上传 Excel/CSV 生成图表导出 PNG/PDF、CSDN 论文图表工具文；粘贴表格/CSV→柱状图/折线图/饼图→自绘 SVG 零依赖→PNG 导出；与成绩统计互链成「数据」旅程线；通用办公/自媒体/学生场景 | 中 | P1 |
| 图片裁剪（比例预设+拖拽裁剪框） | 本轮证据补强（pixoate 预设比例 1:1/16:9/4:5+拖拽框实时预览+手机触屏；splitanimage 本地免上传图片套件；YouTube TemplateMaker.in 考试/求职/政府表单照片高频）；与 img-resize（指定宽高数值裁剪）差异化明确无重叠；图片旅程线缺环补齐；canvas 纯前端本地免上传 | 小 | P1（本轮补强） |
| 工资个税计算器（含专项附加扣除） | 新浪财经 2026 年度专项附加扣除确认季+3-6 月年度汇算；Chrome Web Store 税后工资插件形态验证：社保公积金基数/七项专项扣除/年终奖单独·合并计税对比；与房贷+税费成「财务」簇；纯前端 | 中 | P1 |
| 工作日计算器（含法定节假日/调休） | 本轮新晋（V2EX PriTime「法定节假日/调休补班重复，国内用户刚需」；yize/chinese-workday 2011-2026 数据+浏览器 CDN；Excel NETWORKDAYS 手工维护节假日痛点）；起止日期→工作日天数（调休补班计入、法定假剔除）+单日「要上班吗」查询；与 /tools/calendar（仅展示）无重叠；难度中（年份数据表需年更） | 中 | P1（本轮新晋） |
| 图片拼图（网格模板拼图） | 360doc 2026-01-30 四选一首位；Photo Collage Maker 形态：多张图合成一格、网格/异形模板、自定义布局、文字/贴纸；与 nine-grid（九宫格切图，一张图切多格）方向相反无重叠；与 img-stitch（一维长图拼接）形态不同；canvas 纯前端本地免上传 | 小 | P1 |
| 屏幕录制（在线录屏） | 360doc 2026-01-30 宝藏站单列推荐；网易测评三大痛点：免费导出带水印、桌面软件要安装、公司电脑禁装软件只能用网页方案；100% 纯前端（getDisplayMedia+MediaRecorder→webm），免安装无水印文件不出本机；桌面端优先 | 中 | P1（通用顶位备选） |
| cURL 转代码 | 开发者刚需（HN 讨论 + curlconverter 开源库 27+ 语言）；赛道已有成熟免费玩家，垂直小众 | 小 | P1 |
| 文本敏感信息打码 | 文本身份证/手机号/银行卡号脱敏；未找到强需求信号，运营场景刚需但证据弱 | 小 | P1（观察） |
| Excel 公式中文解释器 | 360doc「Excel 公式机器人」文本指令转公式是 AI 能力、不可做；反向「公式→中文分步解释」纯前端可做：词法拆解+函数中文说明库；证据单薄仅一条，待补强 | 中 | P1（观察） |
| Markdown 表格修复 | 中文全角/emoji 对齐错乱修复；赛道拥挤（tablesgenerator、tableconvert、编辑器插件生态），纯本地免费可差异化 | 小 | P1（末位） |
| 证件照换底色 | CSDN+360doc 实测文再确认刚需（微信小程序爆款多多职业照/奈斯证照助手/立得一寸照/抠图喵均靠 AI 服务器抠图）；发丝级抠图需 AI 分割模型（WASM 版数十 MB），不完全符合纯轻量前端口径，等轻量方案 | 中 | P2（观察） |
| SQLite 在线查看器 | dev.to Tooltri 单次提及；sql.js WASM 纯前端可读 .db 文件；开发者小众 | 中 | P2（观察） |
| 手写模拟器 | 360doc 2026-02-14 萝卜工坊；作业/笔记/贺卡趣味场景；canvas+手写体字库纯前端可做 | 小 | P2（观察） |

**已实现（本日七连交付；房贷计算器已划出）**：思维导图（01:00 立项）→ 表格拆分（03:00 立项）→ 表格合并（05:40 立项）→ **HEIC 转 JPG（已开发、未可交付——12:30 真机实测失败、生产已回滚，见末尾「⚠️ 待修复」）** → 成绩统计分析（13:41 立项、交付 0d6da6c）→ 二手房税费计算器（15:39 立项、交付 cf76a06）→ **房贷计算器（17:39 立项、本轮确认交付 dc50769）**；以上均已从候选池划出，历史记录保留于下方各轮次小节。

**归档说明**：本轮为 10-16 通用调研第八轮——房贷计算器今日已交付闭环（dc50769），候选池划出；新晋候选「工作日计算器（含法定节假日/调休）」进通用池 P1（V2EX 调休刚需 + chinese-workday 数据 + Excel 手工痛点三重证据，与 /tools/calendar 无重叠）；「图片裁剪」本轮证据补强并去重确认（与 img-resize 指定宽高数值裁剪差异化明确）；「图片拼图」加注与 nine-grid 切图方向区分；HN 10-15 roundup 仅作定位验证（Tiny Little Office 免登录免上传浪潮）、WallHop 涉法律面不立项；WPS 候选表保持冻结归档；仓库 77 注册工具全量核对无重叠（workday/工作日/调休命中仅为 /tools/calendar 描述、crop/裁剪命中仅为 img-resize 描述，均无实质工具重叠），核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 77 Path，新候选（workday_calculator 建议 ID）无重叠；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

## 今日任务（2026-10-16 17:38 · 产品经理排期决策 ✅）

**交付状态**：10-16 第七轮排期决策。今日已六连交付（思维导图→表格拆分→表格合并→HEIC（已回滚）→成绩统计分析→二手房税费计算器），按 17:00 研究轮推荐顺位（房贷计算器首选）与 15:39 决策轮既定定序（PDF 表单顺位第二不动）执行，无定序变更。本轮立项**唯一开发任务：房贷计算器（等额本息/等额本金）**。

**选定：房贷计算器（/tools/mortgage-calculator）** — 今日唯一任务：
- **顺位递进**：17:00 研究轮 Top3 首选推荐，定序自然递进。
- **旅程线叙事**：与今日交付的二手房税费计算器（/tools/second-hand-house-tax）天然形成「买房旅程线」（税费→房贷月供），双向互链。
- **需求证据三重**：YouTube 买房试算器教程（月付金/负债比/可承受房价反推）、香港 house730 按揭计算机（每月供款/首期/全期利息/转按比较）、hackmd 房贷计算器使用指南（买房预算场景）。
- **节奏适配**：今日第七开发轮，难度小、纯前端本地计算零依赖，适合节奏收尾；PDF 可填写表单制作器（含 CJK 表单域字体专项验证风险）留顺位第二不动，在线图表生成器留 P1 池。
- **技术就绪**：纯前端公式计算，单页工具模板（second_hand_house_tax.html + second_hand_house_tax.js）可直接复用。

**规格**：
1. 输入：贷款总额（万元）、贷款年限（1-30 年）、年利率（%，默认 3.45% 可改）、还款方式（等额本息/等额本金单选切换）。
2. 计算规则（页面注明「结果仅供参考，实际以银行合同为准」）：等额本息——月供 = 贷款总额×月利率×(1+月利率)^期数 / ((1+月利率)^期数-1)；等额本金——月供 = 贷款总额/期数 + 剩余本金×月利率（首月最高、逐月递减）。输出：首月/月均月供、总利息、还款总额、两种方式总利息对比差。
3. 还款明细表：逐期展开（期数/当期月供/本金/利息/剩余本金），支持两种方式切换对比；大数据期数下分页或滚动展示。
4. 输出：一键复制结果文本（含参数摘要+关键结果）。
5. 免责声明：页面显眼位置「所有计算在浏览器本地完成；结果仅供参考，实际月供以银行合同为准」。
6. 旅程线互链：mortgage-calculator 页底加「先看税费？→ 二手房税费计算器（/tools/second-hand-house-tax）」；second_hand_house_tax.html 页底加「算完税费算月供 → 房贷计算器」反向链接。
7. 注册：`tools/categories.go`「生活工具」品类新增 ID `mortgage_calculator`、Path `/tools/mortgage-calculator`，中英文描述 + SEO keywords（房贷计算器、等额本息、等额本金、月供计算、房贷月供）。

**验收标准**：
- [ ] `/tools/mortgage-calculator` 可开（200）；输入校验齐全（贷款总额/年限/利率为正数）
- [ ] 等额本息月供与总利息计算正确；等额本金首月月供与逐月递减正确；两种方式总利息对比差正确
- [ ] 还款明细表期数/本金/利息/剩余本金逐项正确，切换还款方式刷新正确
- [ ] 一键复制结果功能可用
- [ ] 免责声明与「以银行合同为准」提示位置显眼
- [ ] 与 /tools/second-hand-house-tax 双向互链链接有效
- [ ] `categories.go` 注册完成，首页列表/导航/SEO 配置生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/mortgage_calculator.html`、`static/js/mortgage_calculator.js`、`tools/categories.go`、`templates/second_hand_house_tax.html`（互链编辑）、`BACKLOG.md`（本小节）。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认分支 muse/dev-20260929 存在；`grep tools/categories.go` 全量核对（76 个已注册 Path；Path 层无 mortgage/房贷/按揭/loan/月供字样，`format` 仅见于 xml/sql-formatter 品类不冲突；ID `mortgage_calculator` 无重叠）；工作树仅一个已知无关未跟踪文件（`toolWeb.bak-prev`，构建产物），未动。

## 今日任务（2026-10-16 17:00 · 产品调研员研究轮 ✅）

**交付状态**：10-16 通用调研第七轮（WPS 特别方向 10-15 已结束）。二手房税费计算器今日已交付闭环（15:39 立项→开发交付 cf76a06），今日六连交付完成（思维导图→表格拆分→表格合并→HEIC→成绩统计分析→二手房税费计算器）。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮四件事**（17:00 全网调研，通用方向）：
1. 二手房税费计算器交付确认：15:39 立项→开发交付（cf76a06），`grep tools/categories.go` 确认 Path `/tools/second-hand-house-tax` 已注册（全量 76 Path），与候选池无重叠项残留；候选池划出。
2. 新晋候选：**房贷计算器（等额本息/等额本金）**。需求证据三重：① YouTube 买房试算器教程（月付金/负债比/可承受房价反推，纯前端表单即可实现）；② 香港 house730 按揭计算机（每月供款/首期/全期利息/可负担楼价/转按比较，工具站高频入口）；③ hackmd 房贷计算器使用指南（买房预算场景）。与今日交付的二手房税费计算器天然形成「买房旅程线」（税费→房贷月供），双向互链。纯前端本地计算零依赖，难度小。SEO：房贷计算器、等额本息、等额本金、月供计算。
3. 新晋候选：**在线图表生成器（数据粘贴→图表→导出 PNG）**。需求证据三重：① 360doc 2026-01-11「咖喱君：输入文字一键转图表」；② 360doc 2026-02-14「ChartCube（支付宝）：上传 Excel/CSV 生成柱状图/折线图/饼图/雷达图，导出 PNG/PDF」；③ CSDN 论文学术图表工具文（科研/学生做图痛点）。形态：粘贴表格或 CSV→柱状图/折线图/饼图→自绘 SVG 零依赖（沿成绩统计分析、思维导图自绘先例）→PNG 导出；与成绩统计分析互链成「数据」旅程线。差异化：成绩统计是教师专用场景，本工具覆盖通用办公/自媒体/学生。难度中。SEO：在线图表生成、柱状图生成器、数据可视化。
4. 新晋候选：**工资个税计算器（含专项附加扣除）**。需求证据三重：① 新浪财经：2026 年度个税专项附加扣除每年 12 月全民确认、次年 3-6 月年度汇算（周期性全民刚需）；② Chrome Web Store「税后工资计算器 2025-2026」插件（形态验证：城市社保公积金基数/七项专项附加扣除/年终奖单独·合并计税对比/年度汇总，纯本地运算）；③ 与房贷计算器+二手房税费计算器形成「财务」工具簇。纯前端：月薪→社保公积金（可自定义比例）→七项专项扣除→累计预扣税率表→税后工资+年终奖计税方式对比。难度中（含税率表与专项扣除逻辑）。SEO：个税计算器、税后工资、专项附加扣除。

**推荐 Top3**（排期建议；努力度为单页前端交付量级评估；尊重 15:00 轮既有定序）：

1. **房贷计算器（等额本息/等额本金）** — P1（本轮新晋首选）：与今日交付的二手房税费计算器天然「买房旅程线」递进（税费→月供），买房高频刚需，纯前端难度小，适合今日第七轮节奏。SEO：房贷计算器、等额本息、月供计算。
2. **PDF 可填写表单制作器** — P1（15:00 轮已定顺位第二，不动）：Reddit 2026-09-02 热帖高赞 Sejda 免费表单工具 + Acrobat Pro/pdfFiller/福昕高级版付费墙双证据；pdf-lib AcroForm 全栈可行；开「合同表单」子旅程线。难度中（CJK 字体专项验证风险）。
3. **在线图表生成器** — P1（本轮新晋）：咖喱君/ChartCube 双证据；自绘 SVG 零依赖先例已验证（成绩统计/思维导图）；与成绩统计互链成「数据」旅程线；通用办公/自媒体/学生全场景。难度中。工资个税计算器进 P1 池顺位靠前（财务簇）；医学单位换算器顺延；屏幕录制维持通用顶位备选（难度中）。

**通用候选表**（2026-10-16 17:00 第七轮；二手房税费计算器已实现划出；新晋房贷计算器/在线图表生成器/工资个税计算器；Excel 公式解释器进观察池）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 房贷计算器（等额本息/等额本金） | 本轮新晋（YouTube 买房试算器教程、house730 按揭计算机、hackmd 房贷指南；与二手房税费计算器成「买房旅程线」税费→月供；等额本息/等额本金切换、还款明细表、总利息对比；纯前端） | 小 | P1（本轮新晋首选） |
| PDF 可填写表单制作器 | Reddit 2026-09-02 热帖高赞 Sejda 免费表单工具；Acrobat Pro/pdfFiller/福昕高级版付费墙；ToolWeb PDF 簇 13 工具无表单项；pdf-lib AcroForm + pdf.js 缩略图全在现有栈；开「合同表单」子旅程线；CJK 表单域字体须专项验证 | 中 | P1（顺位第二） |
| 在线图表生成器（数据粘贴→图表导出） | 本轮新晋（360doc 咖喱君「文字一键转图表」、支付宝 ChartCube 上传 Excel/CSV 生成图表导出 PNG/PDF、CSDN 论文图表工具文；粘贴表格/CSV→柱状图/折线图/饼图→自绘 SVG 零依赖→PNG 导出；与成绩统计互链成「数据」旅程线；通用办公/自媒体/学生场景） | 中 | P1（本轮新晋） |
| 工资个税计算器（含专项附加扣除） | 本轮新晋（新浪财经 2026 年度专项附加扣除确认季+3-6 月年度汇算；Chrome Web Store 税后工资插件形态验证：社保公积金基数/七项专项扣除/年终奖单独·合并计税对比；与房贷+税费成「财务」簇；纯前端） | 中 | P1（本轮新晋） |
| 图片拼图（网格模板拼图） | 360doc 2026-01-30 四选一首位；Photo Collage Maker 形态：网格/异形模板、自定义布局、文字/贴纸/蒙版/水印；与 img-stitch（一维长图拼接）形态不同；canvas 纯前端本地免上传 | 小 | P1 |
| 屏幕录制（在线录屏） | 360doc 2026-01-30 宝藏站单列推荐；网易测评三大痛点：免费导出带水印、桌面软件要安装、公司电脑禁装软件只能用网页方案；100% 纯前端（getDisplayMedia+MediaRecorder→webm），免安装无水印文件不出本机；桌面端优先 | 中 | P1（通用顶位备选） |
| 图片裁剪 | 竞品众多但 ToolWeb 图片旅程线缺裁剪一环；本地免上传 + 常用比例预设（1:1/16:9/证件照）补齐 | 小 | P1 |
| cURL 转代码 | 开发者刚需（HN 讨论 + curlconverter 开源库 27+ 语言）；赛道已有成熟免费玩家，垂直小众 | 小 | P1 |
| 文本敏感信息打码 | 文本身份证/手机号/银行卡号脱敏；未找到强需求信号，运营场景刚需但证据弱 | 小 | P1（观察） |
| Excel 公式中文解释器 | 本轮新晋观察（360doc「Excel 公式机器人」文本指令转公式是 AI 能力、不可做；反向「公式→中文分步解释」纯前端可做：词法拆解+函数中文说明库；证据单薄仅一条，待补强） | 中 | P1（观察） |
| Markdown 表格修复 | 中文全角/emoji 对齐错乱修复；赛道拥挤（tablesgenerator、tableconvert、编辑器插件生态），纯本地免费可差异化 | 小 | P1（末位） |
| 证件照换底色 | CSDN+360doc 实测文再确认刚需（微信小程序爆款多多职业照/奈斯证照助手/立得一寸照/抠图喵均靠 AI 服务器抠图）；发丝级抠图需 AI 分割模型（WASM 版数十 MB），不完全符合纯轻量前端口径，等轻量方案 | 中 | P2（观察） |
| SQLite 在线查看器 | dev.to Tooltri 单次提及；sql.js WASM 纯前端可读 .db 文件；开发者小众 | 中 | P2（观察） |
| 手写模拟器 | 360doc 2026-02-14 萝卜工坊；作业/笔记/贺卡趣味场景；canvas+手写体字库纯前端可做 | 小 | P2（观察） |

**已实现（本日六连交付；二手房税费计算器已划出）**：思维导图（01:00 立项）→ 表格拆分（03:00 立项）→ 表格合并（05:40 立项）→ **HEIC 转 JPG（已开发、未可交付——12:30 真机实测失败、生产已回滚，见末尾「⚠️ 待修复」）** → 成绩统计分析（13:41 立项、交付 0d6da6c）→ **二手房税费计算器（15:39 立项、本轮确认交付 cf76a06）**；以上均已从候选池划出，历史记录保留于下方各轮次小节。

**归档说明**：本轮为 10-16 通用调研第七轮——二手房税费计算器今日已交付闭环（cf76a06），候选池划出；新晋候选「房贷计算器」「在线图表生成器」「工资个税计算器」进通用池 P1（买房旅程线/数据旅程线/财务簇三线并进叙事）；「Excel 公式中文解释器」进 P1 观察池（证据单薄待补强）；WPS 候选表保持冻结归档；仓库 76 注册工具全量核对无重叠（chart/可视化命中仅为 quicksort 描述与图标名、income tax/工资命中仅为二手房税费描述与 PDF 加密描述，无实质工具重叠），核稿反馈（立候选前先 grep）持续闭环。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 76 Path，新候选（mortgage_calculator / chart_generator / salary_tax_calculator 建议 ID）无重叠；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

---

> 维护人：产品经理 · 每日排期（2026-10-16 15:39 PM 决策轮·10-16 第六轮）

## 今日任务（2026-10-16 15:39 · 产品经理排期决策 ✅）

**交付状态**：10-16 第六轮排期决策。今日已五连交付（思维导图→表格拆分→表格合并→HEIC→成绩统计分析），按 15:00 研究轮推荐顺位与 13:41 决策轮锁定的定序递进：二手房税费计算器在 13:41 轮已明确「留作下一轮」，本轮即「下一轮」。本轮立项**唯一开发任务：二手房税费计算器**。

**选定：二手房税费计算器（/tools/second-hand-house-tax）** — 今日唯一任务：
- **顺位递进**：13:41 决策轮已明确「留作下一轮」；15:00 研究轮 Top3 首选推荐，顺位自然递进，不改定序。
- **需求证据**：——契税（首套/二套）、个税（满五唯一/满二）、增值税；输入成交价+房屋属性出税费明细；房产中介高频场景。
- **节奏适配**：今日第六开发轮，难度小、纯前端，适合节奏收尾；中难度的 PDF 表单制作器（含 CJK 字体专项验证风险）留在下一顺位，屏幕录制维持通用顶位备选，医学单位换算器顺位不动留候选池。
- **技术就绪**：纯前端本地计算零依赖，现有单页工具模板可直接复用。

**规格**：
1. 输入：成交价（万元）、建筑面积（㎡）、购房套数（首套/二套/三套及以上）、持有情况（满五唯一/满二非唯一/不满二）、城市选项（北上广深特殊规则标注，一期仅做规则提示）。
2. 计算规则（页面注明"税率以地方税务机关最新规定为准，仅供参考"）：契税——首套≤140㎡ 1%、>140㎡ 1.5%；二套≤140㎡ 1%、>140㎡ 2%；三套及以上 3%；个税——满五唯一免征，否则按成交价 1%（或差额 20%，一期取 1% 简化口径并注明）；增值税——满二免征，不满二按成交价 5.6% 估算（注明北上广深个人转让非普通住宅另行）。
3. 输出：契税/个税/增值税三项明细 + 税费总计 + 税负占比，一键复制结果文本。
4. 隐私/免责声明：页面显眼位置「所有计算在浏览器本地完成；结果仅供参考，实际税费以税务机关核定为准」。
5. 注册：`tools/categories.go`「生活工具」品类新增 ID `second_hand_house_tax`、Path `/tools/second-hand-house-tax`，中英文描述 + SEO keywords（二手房税费、契税计算、二手房契税计算器、个税计算、房产税费）。

**验收标准**：
- [ ] `/tools/second-hand-house-tax` 可开（200）；输入校验齐全（成交价/面积非负数字）
- [ ] 契税三档（首套/二套/三套及以上 × 140㎡分界）计算正确
- [ ] 个税满五唯一免征 / 非唯一 1% 正确；增值税满二免征 / 不满二 5.6% 正确
- [ ] 税费总计、税负占比、复制结果功能可用
- [ ] 免责声明与"以税务机关为准"提示位置显眼
- [ ] `categories.go` 注册完成，首页列表/导航/SEO 配置生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/second_hand_house_tax.html`、`static/js/second_hand_house_tax.js`、`tools/categories.go`、`BACKLOG.md`（本小节）。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认分支 muse/dev-20260929 存在；`grep tools/categories.go` 全量核对（75 个已注册 Path；Path 层无 tax/税/契税/house 字样，ID `second_hand_house_tax` 无重叠）；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。

> 维护人：产品调研员 · 每日更新（2026-10-16 15:00 第六轮研究）

## 今日任务（2026-10-16 15:00 · 产品调研员研究轮 ✅）

**交付状态**：10-16 通用调研第六轮（WPS 特别方向 10-15 已结束）。成绩统计分析今日已交付闭环（0d6da6c：逐行输入+CSV 本地解析、五档分布、自绘 SVG 柱状图、CSV 导出、与表格拆分双向互链；75 注册 Path 已含 /tools/score-stats），已从候选池划出。本轮做新信号挖掘、候选池维护，外加一项关键状态纠偏（HEIC 实际未闭环，见第 2 条）。

**本轮四件事**（15:00 全网调研，通用方向）：
1. 成绩统计分析交付确认：13:41 立项→开发交付（0d6da6c），`grep tools/categories.go` 确认 Path `/tools/score-stats` 已注册（全量 75 Path），与候选池无重叠项残留；候选池划出。
2. ⚠️ **HEIC 转 JPG 状态纠偏（重要）**：12:30 真机浏览器端到端实测失败——真实 Chromium 上传真实 HEIC →「解码组件加载失败（CDN 与本地兜底均不可用）：未知错误」，两次复现；/tool-web 已回滚到不含 heic-convert 的旧二进制（BACKLOG 末尾「⚠️ 待修复」小节仍开放，无修复提交）。**13:00 研究轮「HEIC 已实现划出（已实现）」的表述不准确**：HEIC 是**已开发、未可交付**（开发分支有代码，生产环境已回滚，真机浏览器转换链路必现失败）。请 PM 决策轮按回滚小节原建议，把「排查 heic-convert libheif 加载链（先真机浏览器开 console 拿真实报错）」列为优先事项，而非直接立项新工具。
3. HEIC 修复技术情报补充（本轮新搜，供修复轮参考）：① dev.to 2026-08 实战文「Client Side HEIC to PDF: Skipping libheif WASM for Canvas API + jsPDF」——**跳过 libheif WASM**，改走 Canvas 原生解码（Safari/iOS/macOS 原生支持 HEIC）+ jsPDF 封装，明确 trade-off（Chrome/Windows 用户无法用，页面 upfront 声明限制）；② 11:30 轮备选 heic-to（现代 ESM 封装、wasm base64 内联）仍可用；③ libheif 上游安全公告：CVE-2025-65586（DoS，已修于 1.21.0+）、GHSA-x8r2-mggj-j6wr（critical，建议 1.23.3+；Debian 已发 1.23.4-1~deb13u1）——当前 vendor 的 1.23.2 含已知漏洞，修复时一并评估升级 1.23.3+。
4. 新晋通用候选：**PDF 可填写表单制作器**。需求证据三重：① Reddit 2026-09-02「What is a FREE thing everyone should know/use?」热帖（The Poke 2026-09-02 汇总）高赞推荐 Sejda 免费可填写 PDF 工具——「把普通 PDF 转成可填写表单免费搞定」；② 付费墙明确：表单域制作是 Adobe Acrobat Pro / pdfFiller 订阅 / 福昕高级版 的付费功能（福昕官方《PDF 表单制作指南》即按付费版流程编写）；③ ToolWeb PDF 簇 13 工具（合并拆分/转图片/水印/批注打码/加密/压缩/转 Word/PPT…）经 grep 确认**无表单工具**（Path 层无 form/表单/填写字样；`format` 仅见于 xml/sql-formatter 品类，不冲突）。可行性：pdf-lib 1.17.1 已是现有栈（cdnjs CDN 懒加载，pdf-merge-split/pdf-manage 在用，原生支持 AcroForm 文本框/复选框/单选/下拉）；pdf.js 缩略图渲染有 pdf-manage 先例。形态：上传 PDF → 逐页渲染 → 点击放置表单域 → 导出标准可填写 PDF（Acrobat/Reader 可填）；与现有 PDF 批注/加密工具形成「合同表单」子旅程线。风险提示（交开发轮）：pdf-lib 标准字体无 CJK，中文表单域外观流需内嵌字体（如 Noto Sans SC 子集化），须专项验证；难度中。SEO：PDF 可填写表单、PDF 添加表单域、PDF 表单制作、免费 PDF 表单工具。

**交付核对**：`git fetch`（GIT_SSH_COMMAND 指定密钥）确认 origin/muse/dev-20260929 存在；`grep tools/categories.go` 全量 75 Path，新候选（pdf_form_maker 建议 ID）无重叠；工作树未跟踪文件为 `toolWeb.bak-prev` + `toolweb`（构建产物，历史已知无关项，本轮未动）。另：核对中发现 `git log --oneline` 把回滚记录 commit ade6909f0883b26d4f25c9aaa0a8d21253686d17 的缩写显示为 de6909（丢首字符 a），后续轮次引用该记录请用完整哈希。

**推荐 Top3**（排期建议；努力度为单页前端交付量级评估）：

1. **二手房税费计算器** — P1（PM 定序下一轮）：13:41 决策轮已明确「留作下一轮」；——契税（首套/二套）、个税（满五唯一/满二）、增值税；输入成交价+房屋属性出税费明细；纯前端。难度小。SEO：二手房税费、契税计算。
2. **PDF 可填写表单制作器** — P1（本轮新晋，顺位第二）：Reddit 热帖需求证据 + Acrobat/pdfFiller/福昕付费墙 + ToolWeb PDF 簇 13 工具无表单项的品类空白；pdf-lib AcroForm + pdf.js 缩略图全在现有栈；开「合同表单」子旅程线。难度中（含 CJK 字体验证风险）。SEO：PDF 可填写表单、PDF 添加表单域、PDF 表单制作。
3. **医学单位换算器** — P1（用户反馈顺延）：——血糖 mmol/L↔mg/dL、HbA1c %↔mmol/mol、肌酐 mg/dL↔μmol/L、血压 mmHg↔kPa；医生查房/看化验单高频；纯前端；附「仅供参考」声明。难度小。屏幕录制维持通用顶位备选（难度中）；图片拼图/图片裁剪/cURL 转代码留 P1 池。

**通用候选表**（2026-10-16 15:00 第六轮；成绩统计分析已实现划出；PDF 可填写表单制作器新晋；HEIC 移出候选池→待修复项）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| PDF 可填写表单制作器 | 本轮新晋（Reddit 2026-09-02 热帖高赞 Sejda 免费表单工具；Acrobat Pro/pdfFiller/福昕高级版付费墙；ToolWeb PDF 簇 13 工具无表单项）；pdf-lib AcroForm + pdf.js 缩略图全在现有栈；开「合同表单」子旅程线；CJK 表单域字体须专项验证 | 中 | P1（本轮新晋） |
| 图片拼图（网格模板拼图） | 360doc 2026-01-30 四选一首位；Photo Collage Maker 形态：网格/异形模板、自定义布局、文字/贴纸/蒙版/水印；与 img-stitch（一维长图拼接）形态不同；canvas 纯前端本地免上传 | 小 | P1 |
| 屏幕录制（在线录屏） | 360doc 2026-01-30 宝藏站单列推荐；网易测评三大痛点：免费导出带水印、桌面软件要安装、公司电脑禁装软件只能用网页方案；100% 纯前端（getDisplayMedia+MediaRecorder→webm），免安装无水印文件不出本机；桌面端优先 | 中 | P1（通用顶位备选） |
| 图片裁剪 | 竞品众多但 ToolWeb 图片旅程线缺裁剪一环；本地免上传 + 常用比例预设（1:1/16:9/证件照）补齐 | 小 | P1 |
| cURL 转代码 | 开发者刚需（HN 讨论 + curlconverter 开源库 27+ 语言）；赛道已有成熟免费玩家，垂直小众 | 小 | P1 |
| 文本敏感信息打码 | 文本身份证/手机号/银行卡号脱敏；未找到强需求信号，运营场景刚需但证据弱 | 小 | P1（观察） |
| Markdown 表格修复 | 中文全角/emoji 对齐错乱修复；赛道拥挤（tablesgenerator、tableconvert、编辑器插件生态），纯本地免费可差异化 | 小 | P1（末位） |
| 证件照换底色 | CSDN+360doc 实测文再确认刚需（微信小程序爆款多多职业照/奈斯证照助手/立得一寸照/抠图喵均靠 AI 服务器抠图）；发丝级抠图需 AI 分割模型（WASM 版数十 MB），不完全符合纯轻量前端口径，等轻量方案 | 中 | P2（观察） |
| SQLite 在线查看器 | dev.to Tooltri 单次提及；sql.js WASM 纯前端可读 .db 文件；开发者小众 | 中 | P2（观察） |
| 手写模拟器 | 360doc 2026-02-14 萝卜工坊；作业/笔记/贺卡趣味场景；canvas+手写体字库纯前端可做 | 小 | P2（观察） |

**已实现（本日五连交付；成绩统计分析已划出）**：思维导图（01:00 立项）→ 表格拆分（03:00 立项）→ 表格合并（05:40 立项）→ **HEIC 转 JPG（已开发、未可交付——12:30 真机实测失败、生产已回滚，见末尾「⚠️ 待修复」）** → **成绩统计分析（13:41 立项、本轮确认交付 0d6da6c）**；以上均已从候选池划出，历史记录保留于下方各轮次小节。

**归档说明**：本轮为 10-16 通用调研第六轮——成绩统计分析今日已交付闭环（0d6da6c），候选池划出；新晋候选「PDF 可填写表单制作器」进通用池 P1（Reddit 热帖 + 付费墙双证据，pdf-lib AcroForm 全栈可行，CJK 字体风险已标注）；**HEIC 状态纠偏**：13:00 轮「已实现划出」不准确——HEIC 真机转换链路必现失败、/tool-web 已回滚，候选池不再列为已实现项，统一归入末尾「⚠️ 待修复」；本轮补充修复情报（dev.to 跳过 libheif WASM 的 Canvas 原生解码路线、heic-to 备选、libheif 1.23.2 含 CVE-2025-65586/GHSA-x8r2-mggj-j6wr 建议升 1.23.3+）；WPS 候选表保持冻结归档；仓库 75 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

---

> 维护人：产品经理 · 每日排期（2026-10-16 13:41 PM 决策轮·10-16 第五轮）

## 今日任务（2026-10-16 13:41 · 产品经理排期决策 ✅）

**交付状态**：10-16 第五轮排期决策。今日已四连交付（思维导图→表格拆分→表格合并→HEIC 转 JPG，均闭环），按 12:15 决策轮锁定的定序与 13:00 研究轮推荐顺位递进，本轮立项**唯一开发任务：成绩统计分析**（节奏调节位，不改定序）。

**选定：成绩统计分析（/tools/score-stats）** — 今日唯一任务：
- **顺位递进**：12:15 决策轮已明确将其定为「下一顺位/节奏调节位」；13:00 研究轮 Top3 首选推荐。
- **旅程线叙事**：与今日交付的表格拆分（/tools/sheet-split）形成「拆分→统计」工具链旅程线，双向互链。
- **需求证据**：教师请求——平均分/及格率/优秀率/分数段分布（可输入分数列或 CSV），教师最高频场景。
- **技术就绪**：纯前端本地计算，难度小，适合今日第五轮节奏调节。
- **未选**：二手房税费计算器（节奏调节位备选，顺位不动，留作下一轮）；屏幕录制（通用顶位顺位不动，难度中，不适宜连打第五轮的节奏调节位）；医学单位换算器/图片拼图等其余 P1 留在候选池。

**规格**：
1. 分数输入两件套：① 文本框逐行输入分数列（粘贴即算）；② CSV 文件上传（本地 FileReader 解析，不上传服务器）；非数字/空行自动跳过并计数提示。
2. 统计输出：人数、平均分、最高/最低/中位数、及格率（≥及格线）、优秀率（≥优秀线）、各分数段人数+占比。
3. 参数可配：及格线（默认 60）、优秀线（默认 90）；分数段固定为 <60 / 60-69 / 70-79 / 80-89 / ≥90 五档（优秀线>90 时第五档以优秀线为界）。
4. 可视化：分数段分布柱状图（自绘 SVG/CSS，零依赖，沿思维导图自绘先例）。
5. 导出：统计结果表导出为 CSV 下载（文件名 score-stats-<时间戳>.csv）。
6. 旅程线互链：score_stats 页底加「需要先拆表？→ 表格拆分（/tools/sheet-split）」；sheet_split 页底加「拆好表→成绩统计」反向链接。
7. 注册：`tools/categories.go`「表格工具」品类新增 ID `score_stats`、Path `/tools/score-stats`，中英文描述 + SEO keywords（成绩分析、分数段统计、班级成绩分析、及格率计算、成绩统计）。

**验收标准**：
- [ ] `/tools/score-stats` 可开（200）；逐行输入与 CSV 上传均可解析
- [ ] 平均分/及格率/优秀率/五档分布计算正确（含非数字跳过计数）
- [ ] 及格线/优秀线可调，分布图随参数正确更新
- [ ] 统计结果 CSV 导出可下载且内容正确
- [ ] 与 /tools/sheet-split 双向互链链接有效
- [ ] `categories.go` 注册完成，首页列表/导航/SEO 配置生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/score_stats.html`、`static/js/score_stats.js`、`tools/categories.go`、`templates/sheet_split.html`（互链编辑）、`BACKLOG.md`（本小节）。

**交付核对**：`git fetch` 确认分支 muse/dev-20260929 存在；`grep tools/categories.go` Path 层无 score/grade/成绩/tax/税字样（ID `score_stats` 无重叠）；工作树仅一个已知无关未跟踪文件（`toolWeb.bak-prev`），未动。

> 维护人：产品调研员 · 每日更新（2026-10-16 13:00 第五轮研究）

## 今日任务（2026-10-16 13:00 · 产品调研员研究轮 ✅）

**交付状态**：10-16 通用调研第五轮。HEIC 转 JPG 今日已交付闭环（12:15 立项、12:40 前端交付，74 个注册 Path 已含 /tools/heic-convert），10-16 四连交付完成（思维导图→表格拆分→表格合并→HEIC）。本轮只做新信号挖掘与候选池维护，不动排期定序（定序权归 PM 决策轮）。

**本轮三件事**（13:00 全网调研，通用方向）：
1. HEIC 今日交付确认：12:15 决策轮立项 → 12:40 开发交付（libheif-js 1.23.2 CDN+vendor 兜底、JPG 质量滑杆/PNG、ZIP 打包、多文件状态列表、与 images-to-pdf 双向互链）；已从通用候选池划出（已实现）。
2. 新信号挖掘：无新晋强信号。V2EX 泛搜（PREX 交易研究 AI Agent、xukz.cn 极简简历工具、Zendot 开源推荐站、p2p 传输器 this2.link、内网穿透/frp 讨论）——均为 AI/需后端信令/桌面软件/非工具类讨论，无可单页落地的新痛点；阅后即焚/P2P 分享需信令服务器，低优先不立项。Reddit/The Poke 2026-07/09 「免费网站」帖（Photopea、remove.bg、Glimpse 视频总结、hrefhunter 死链检查）——Photopea/remove.bg 需后端或 AI 抠图模型，Glimpse 需 AI 视频理解，均非单页可落地；hrefhunter 死链检查需爬虫+后端，非单页形态。
3. 证件照换底色需求再确认（CSDN + 360doc 两篇实测文，微信小程序爆款清单多多职业照/奈斯证照助手/立得一寸照/抠图喵均靠 AI 服务器抠图）：维持 P2 观察——发丝级抠图依赖 AI 分割模型（浏览器 WASM 版数十 MB），ToolWeb「本地免上传免费」口径下轻量方案未成熟，不立候选。PDF 转 Word 全网热度高（网易测评、伪免费陷阱吐槽），但纯前端无法做 OCR/排版还原（质量不可接受），属后端依赖，低优先不立候选。

**交付核对**：`git fetch` 确认分支 muse/dev-20260929；`grep tools/categories.go` 全量核对（74 个已注册 Path，已含 /tools/heic-convert），用户反馈候选 Path 层无 score/grade/成绩/tax/税字样、无重叠；工作树仅一个已知无关未跟踪文件（`toolWeb.bak-prev`），本轮未动。

**推荐 Top3**（排期建议；HEIC 已交付，顺位递进；努力度为单页前端交付量级评估）：

1. **成绩统计分析** — P1（节奏调节位首选）：12:15 决策轮已明确「下一顺位/节奏调节位」；教师请求——平均分/及格率/优秀率/分数段分布（输入分数列或 CSV）；与今日交付的表格拆分形成「拆分→统计」工具链旅程线；纯前端本地计算，难度小。SEO：成绩分析、分数段统计、班级成绩分析。
2. **二手房税费计算器** — P1（用户反馈新晋，节奏调节位备选）：——契税（首套/二套）、个税（满五唯一/满二）、增值税；输入成交价+房屋属性出税费明细；纯前端，难度小。SEO：二手房税费、契税计算、个税计算器。
3. **屏幕录制（在线录屏）** — P1（通用顶位顺延）：360doc 2026-01-30 宝藏站单列推荐 + 网易测评三大痛点（免费导出带水印、桌面软件要安装、公司电脑禁装软件只能走网页方案）；100% 纯前端（getDisplayMedia+MediaRecorder→webm），免安装无水印文件不出本机；桌面端优先。难度中。SEO：在线录屏、免费录屏、网页录屏。

**通用候选表**（2026-10-16 13:00 第五轮；与 WPS 表独立维护；HEIC 转 JPG 已实现划出）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 图片拼图（网格模板拼图） | 360doc 2026-01-30 四选一首位；Photo Collage Maker 形态：网格/异形模板、自定义布局、文字/贴纸/蒙版/水印；与 img-stitch（一维长图拼接）形态不同；canvas 纯前端本地免上传 | 小 | P1 |
| 屏幕录制（在线录屏） | 360doc 2026-01-30 宝藏站单列推荐；网易测评三大痛点：免费导出带水印、桌面软件要安装、公司电脑禁装软件只能用网页方案；100% 纯前端（getDisplayMedia+MediaRecorder→webm），免安装无水印文件不出本机；桌面端优先 | 中 | P1（通用顶位顺延） |
| 图片裁剪 | 竞品众多但 ToolWeb 图片旅程线缺裁剪一环；本地免上传 + 常用比例预设（1:1/16:9/证件照）补齐 | 小 | P1 |
| cURL 转代码 | 开发者刚需（HN 讨论 + curlconverter 开源库 27+ 语言）；赛道已有成熟免费玩家，垂直小众 | 小 | P1 |
| 文本敏感信息打码 | 文本身份证/手机号/银行卡号脱敏；未找到强需求信号，运营场景刚需但证据弱 | 小 | P1（观察） |
| Markdown 表格修复 | 中文全角/emoji 对齐错乱修复；赛道拥挤（tablesgenerator、tableconvert、编辑器插件生态），纯本地免费可差异化 | 小 | P1（末位） |
| 证件照换底色 | CSDN+360doc 实测文再确认刚需（微信小程序爆款多多职业照/奈斯证照助手/立得一寸照/抠图喵均靠 AI 服务器抠图）；发丝级抠图需 AI 分割模型（WASM 版数十 MB），不完全符合纯轻量前端口径，等轻量方案 | 中 | P2（观察） |
| SQLite 在线查看器 | dev.to Tooltri 单次提及；sql.js WASM 纯前端可读 .db 文件；开发者小众 | 中 | P2（观察） |
| 手写模拟器 | 360doc 2026-02-14 萝卜工坊；作业/笔记/贺卡趣味场景；canvas+手写体字库纯前端可做 | 小 | P2（观察） |

**已实现（本日四连交付）**：思维导图（01:00 立项）→ 表格拆分（03:00 立项）→ 表格合并（05:40 立项）→ **HEIC 转 JPG（12:15 立项、12:40 交付）**；以上均已从候选池划出，历史记录保留于下方各轮次小节。

**归档说明**：本轮为 10-16 通用调研第五轮——HEIC 今日已交付闭环（74 注册工具已含），候选池 Top 顺位递进至用户反馈三项小难度项（成绩统计分析/二手房税费计算器/医学单位换算器）+ 图片拼图 + 屏幕录制（通用顶位）；证件照换底色维持 P2 观察（CSDN/360doc 爆款清单均为 AI 服务端抠图）；V2EX/Reddit 泛搜无新晋单页可落地信号（均为 AI/需后端/桌面形态），PDF 转 Word 属后端依赖不立候选；WPS 候选表保持冻结归档（WPS 特别方向 10-15 已结束）；仓库 74 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

---

> 维护人：产品经理 · 每日排期（2026-10-16 12:15 PM 决策轮·10-16 第四轮）

## 今日任务（2026-10-16 12:15 · 产品经理排期决策 ✅）

**交付状态**：10-16 第四轮排期决策。按 11:30 通用调研第四轮锁定的推荐顺位（HEIC 转 JPG 顺位首选、WASM 评估证据到齐）与 10-16 既定定序（表格合并 → HEIC（待 WASM 评估）→ 屏幕录制（顶位备选））执行：WASM 评估已实质通过，HEIC 自然递进，无定序变更。本轮立项**唯一开发任务：HEIC 转 JPG**。

**选定：HEIC 转 JPG（/tools/heic-convert）** — 今日唯一任务：
- **顺位递进**：表格合并今日已交付闭环（93e5349 + 7038b8a），按 05:00 起锁定的定序自然递进；11:30 研究轮明确标注 P1 顺位首选。
- **技术评估实质通过**：mochifile ADR（2026-10-04）实战复核确认 libheif-js 1.23.2（~469KB gzip、零 unsafe-eval、独立 .wasm）为维护中生产路线，heic2any 明确淘汰；装载按 JSZip 先例（CDN 懒加载 + vendor 兜底），不再是技术风险项。
- **需求证据三重**：① V2EX 2025-10 独立验证 + 2026-01/06 本地解码叙事；② 现有站 50MB 上限/每日配额/必须上传（隐私）三重痛点续存；③ 医生用户反馈「图片批量转 PDF 支持 HEIC 输入」再强化。
- **差异化**：纯前端本地解码、免上传、不限次；开「图片格式」子旅程线，与 images-to-pdf 互链「转格式→转 PDF」。
- **未选**：成绩统计分析（本轮新晋 P1、难度小，教师刚需，留下一顺位/节奏调节位，与表格拆分形成「拆分→统计」工具链，不提前透支）；屏幕录制（HEIC 评估通过，顶位备选条件未触发，顺位不动）；图片拼图/医学单位换算/二手房税费等其余 P1 留在候选池。

**规格**：
1. 文件入口：多文件上传 .heic/.heif（input multiple + 拖拽），本地 FileReader 读取 ArrayBuffer，不上传服务器；批量文件列表带缩略图预览与逐文件状态（待转换/转换中/完成/失败）。
2. 解码路线：libheif-js 1.23.2（LGPL-3.0；mochifile ADR 2026-10-04 生产路线；heic2any 已淘汰不用）；装载沿 JSZip 先例：jsdelivr CDN 懒加载 + `static/js/vendor/libheif.js`、`static/js/vendor/libheif.wasm` 本地兜底，CDN 失败自动切 vendor。
3. 转换输出：解码 → canvas → toBlob；输出格式 JPG（质量滑杆 1-100，默认 92）/ PNG（无损）二选一；旋转/镜像/alpha 按 libheif 解析结果保留；文件名沿用原名改后缀（如 IMG_0001.jpg）。
4. 下载：单文件直接下载；多文件打包 ZIP（沿用 sheet_split 的 JSZip 懒加载 + 失败降级逐个下载）；转换统计（成功/失败数、总耗时）展示。
5. 隐私声明：页面显眼位置声明「所有处理在浏览器本地完成，文件不上传任何服务器」。
6. 旅程线互链：heic-convert 页底加「还要转成 PDF？→ 图片批量转 PDF（/tools/images-to-pdf）」；images-to-pdf 页底加「HEIC 图片打不开？先转成 JPG →」反向链接（响应医生反馈）。
7. 注册：`tools/categories.go`「图片处理」品类新增 ID `heic_convert`、Path `/tools/heic-convert`，中英文描述 + SEO keywords（HEIC转JPG、苹果照片转JPG、HEIC在线转换、HEIC免费转换、HEIC本地转换）。

**验收标准**：
- [ ] `/tools/heic-convert` 可开（200）；多文件 .heic 上传解析成功
- [ ] 真实 HEIC 文件解码成功，转出 JPG/PNG 可正常打开且尺寸/方向正确
- [ ] 质量滑杆生效（低质量文件明显更小）；多文件 ZIP 打包下载可用；JSZip/libheif CDN 失败时降级链路不报错
- [ ] 与 /tools/images-to-pdf 双向互链链接有效
- [ ] `categories.go` 注册完成，首页列表/导航/SEO 配置生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/heic_convert.html`、`static/js/heic_convert.js`、`tools/categories.go`、`static/js/vendor/libheif.js` + `static/js/vendor/libheif.wasm`（CDN 兜底本地副本）、`templates/images_to_pdf.html`（互链编辑）、`BACKLOG.md`（本小节）。

**开发备注（前端开发 2026-10-16 12:40）**：已交付。新增 `templates/heic_convert.html`（隐私承诺横幅置顶、SEO keywords 含 5 个指定中文词+英文词、JSON-LD）、`static/js/heic_convert.js`（多文件上传/拖拽、逐文件状态+缩略图、libheif-js 1.23.2 jsdelivr CDN 懒加载→vendor 自动兜底、解码→canvas→toBlob、JPG 质量滑杆 1-100 默认 92 / PNG 无损、单文件直下 / 多文件 JSZip 打包 + JSZip 失败降级逐个下载、转换统计）；`static/js/vendor/` 落盘 libheif.js（91KB）+ libheif.wasm（1.4MB，实测 Content-Type: application/wasm）；Node 实测真 HEIC（strukturag/example.heic）解码成功 1280×854、像素数据有效；categories.go「图片处理」注册 heic_convert（New:true）；与 images-to-pdf 双向互链完成（互链文案+上传区提示+JS 跳过提示同步更新，images-to-pdf.js 缓存版本同步刷新）。本地构建通过；测试服务实测：/tools/heic-convert 200、vendor 两文件 200、/tool-web 挂载改写正常、首页已收录。

**交付核对**：`git fetch` 确认分支 muse/dev-20260929 存在；`grep tools/categories.go`（73 个已注册 Path；Path 层无 heic/heif/苹果照片字样，`img-convert` 为通用图片格式转换品类、形态不同不冲突；ID `heic_convert` 无重叠）；工作树干净，无未跟踪改动。

> 维护人：产品调研员 · 每日更新（2026-10-16 11:30 第四轮研究）

## 今日任务（2026-10-16 11:30 · 产品调研员研究轮 ✅）

**交付状态**：10-16 通用调研第四轮。表格合并今日已交付闭环（93e5349 新增 + 7038b8a mergeTables 三处数据丢失 bug 修复），10-16 排期定序递进。本轮只做新信号挖掘与候选池维护，不立项、不改排期定序（定序权归 PM 决策轮）。

**本轮四件事**（11:30 全网调研，通用方向）：
1. **HEIC 转 JPG 的 WASM 评估障碍实质清除**。mochifile ADR（2026-10-04，极新鲜）2026 年 10 月实战复核 WASM 解码路线：**libheif-js 1.23.2**（2026-09-05，LGPL-3.0，libheif + libde265 Emscripten 编译；独立 `libheif.wasm` 1.42MB / gzip 469KB；零 eval / new Function；iPhone 网格图像、旋转/镜像、alpha 均处理）被选为生产路线；**heic2any 明确淘汰**（2023 年起未维护、调用 new Function、gkzlabs SECURITY 实测无 unsafe-eval 时 CSP 直接拦截解码失败）；**heic-to**（现代 ESM 封装、wasm base64 内联、免单独资产托管，heal-to/csp 分支只需 wasm-unsafe-eval）为合格备选。ToolWeb 可按 JSZip 先例（CDN 懒加载 + vendor 兜底）装载 libheif.wasm，体积可控（gzip 约 0.5MB）、纯前端、无后端需求。开发轮只需小规模实测验证，不再视为技术风险项。
2. **用户反馈首轮 25 条已入池**（persona-feedback cron，教师/医生/房产中介三人平均分 3.9/5；本文件末尾 段落为该轮未提交遗留，本次并入提交）。其中 **4 条为纯前端新工具候选**（见本轮新晋 P1）；其余为既有工具增强项（随机决策器"不放回抽取"+课堂点名预设、文本工具集"纯字数"口径说明+"作文模式"进度条、思维导图 JSON 备份导出/导入）与 **P0 缺陷**（水印中文字符静默丢失无告警、二维码"识别"假功能返回 success:true）——供后续 PM/执行轮次分发。
3. **HEIC 需求侧再获强化**：医生反馈「图片批量转 PDF 支持 HEIC 输入（或一键跳转"先转格式"）」——HEIC 在办公/医疗照片场景渗透继续扩大，「本地解码免上传」差异化持续有效。
4. 通用痛点侧无其他新晋强信号：V2EX 泛搜（easy-tdx A 股开源桌面工具、阅后即焚 Secret 加密分享）均为桌面端/需后端形态，非单页可落地；360doc 推荐清单（2026-02/03）所列工具形态均为已知信号（图片拼图/在线录屏已入池、手写模拟器已 P2、魔术橡皮擦需 AI 后端）。

**交付核对**：`git fetch` 确认分支 muse/dev-20260929；`grep tools/categories.go` 全量核对（73 个已注册 Path），新候选（成绩统计/医学单位换算/二手房税费/课程表）Path 层无 score/grade/medical/医/tax/税/curriculum/课程表字样、无重叠；工作树本次除 BACKLOG.md 无其他改动。

**推荐 Top3**（排期建议；努力度为单页前端交付量级评估）：

1. **HEIC 转 JPG** — P1（顺位首选，WASM 评估证据到齐）：mochifile ADR 2026-10-04 实战复核——libheif-js 1.23.2（~469KB gzip、零 unsafe-eval、独立 .wasm）为维护中路线，装载方案可按 JSZip 先例；医生反馈「批量转 PDF 支持 HEIC 输入」再强化需求；V2EX 2025-10 独立验证 + 现有站 50MB 上限/每日配额/必须上传（隐私）三重痛点未动；「纯前端本地解码、免上传、不限次」差异化，开「图片格式」子旅程线。难度中。SEO：HEIC转JPG、苹果照片转JPG、HEIC在线转换。
2. **成绩统计分析** — P1（用户反馈新晋，教师刚需）：教师请求——平均分/及格率/优秀率/分数段分布（可输入分数列或 CSV）；与表格拆分形成「拆分→统计」工具链旅程线；纯前端小成本。难度小。SEO：成绩分析、分数段统计、班级成绩分析。
3. **屏幕录制（在线录屏）** — P1（通用顶位顺延）：360doc 2026-01-30 宝藏站单列推荐 + 网易测评三大痛点（免费导出带水印、桌面软件要安装、公司电脑禁装软件只能走网页方案）；100% 纯前端（getDisplayMedia+MediaRecorder→webm），免安装无水印文件不出本机；桌面端优先。难度中。SEO：在线录屏、免费录屏、网页录屏。

**通用候选表**（2026-10-16 11:30 第四轮；WPS 特别方向结束、权重恢复；与 WPS 表独立维护）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 成绩统计分析 | 本轮新晋（）：平均分/及格率/优秀率/分数段分布；教师最高频场景；与表格拆分形成「拆分→统计」工具链；纯前端本地计算 | 小 | P1（本轮新晋） |
| 医学单位换算器 | 本轮新晋（）：血糖 mmol/L↔mg/dL、HbA1c %↔mmol/mol、肌酐 mg/dL↔μmol/L、血压 mmHg↔kPa；医生查房/看化验单高频；纯前端；附「仅供参考」声明 | 小 | P1（本轮新晋） |
| 二手房税费计算器 | 本轮新晋（）：契税（首套/二套）、个税（满五唯一/满二）、增值税；输入成交价+房屋属性出税费明细；纯前端 | 小 | P1（本轮新晋） |
| 课程表生成器 | 本轮新晋（）：「教师最高频缺口」；课程表拖拽排课/打印；纯前端；场景具体但需求描述较粗，待下一轮补细节 | 中 | P1（新晋观察） |
| 图片拼图（网格模板拼图） | 05:00 新晋（360doc 2026-01-30 四选一首位）；Photo Collage Maker 形态：网格/异形模板、自定义布局、文字/贴纸/蒙版/水印；与 img-stitch（一维长图拼接）形态不同；canvas 纯前端本地免上传 | 小 | P1 |
| HEIC 转 JPG | mochifile ADR 2026-10-04 WASM 路线复核通过（libheif-js 1.23.2 / heic-to）；医生反馈再强化；现有站 50MB 上限/每日配额/必须上传（隐私）三重痛点；纯前端本地解码免上传不限次差异化 | 中 | P1（顺位首选） |
| 图片裁剪 | 竞品众多但 ToolWeb 图片旅程线缺裁剪一环；本地免上传 + 常用比例预设（1:1/16:9/证件照）补齐 | 小 | P1 |
| cURL 转代码 | 开发者刚需（HN 讨论 + curlconverter 开源库 27+ 语言）；赛道已有成熟免费玩家，垂直小众 | 小 | P1 |
| 文本敏感信息打码 | 文本身份证/手机号/银行卡号脱敏；未找到强需求信号，运营场景刚需但证据弱 | 小 | P1（观察） |
| Markdown 表格修复 | 中文全角/emoji 对齐错乱修复；赛道拥挤（tablesgenerator、tableconvert、编辑器插件生态），纯本地免费可差异化 | 小 | P1（末位） |
| 证件照换底色 | YouTube LiYing 开源 AI 证件照（2026-09，本地离线 BRIA 发丝抠图）+ CSDN 移乐 AI 文印证高频刚需；发丝抠图需 AI 分割模型（WASM 版数十 MB），不完全符合纯轻量前端口径，等轻量方案 | 中 | P2（观察） |
| SQLite 在线查看器 | dev.to Tooltri 单次提及；sql.js WASM 纯前端可读 .db 文件；开发者小众 | 中 | P2（观察） |
| 手写模拟器 | 360doc 2026-02-14 萝卜工坊；作业/笔记/贺卡趣味场景；canvas+手写体字库纯前端可做 | 小 | P2（观察） |

**归档说明**：本轮为 10-16 通用调研第四轮——表格合并今日已交付闭环（93e5349 + 7038b8a），候选池新增 4 条用户反馈新工具需求（成绩统计分析/医学单位换算器/二手房税费计算器/课程表生成器）与 HEIC WASM 路线评估结论（mochifile ADR 2026-10-04：libheif-js 1.23.2 可用，heic2any 淘汰）；用户反馈其余增强项与 P0 缺陷（水印中文丢失、二维码识别假功能）供后续轮次分发；WPS 候选表保持冻结归档；仓库 73 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

---

## 今日任务（2026-10-16 05:40 · 产品经理排期决策 ✅）

**交付状态**：10-16 第三轮排期决策。05:00 通用调研第三轮锁定的定序（表格合并 → HEIC 转 JPG（待 WASM 评估）→ 屏幕录制（顶位备选））不变。本轮立项**唯一开发任务：表格合并（多文件/多表合一）**。

**选定：表格合并（/tools/sheet-merge）** — 今日唯一任务：
- **顺位递进**：表格拆分今日已交付闭环（3ac0bea + 5afd748），顺位自然递进到表格合并（05:00 研究轮明确标注 P1 下一顺位、节奏调节位），不改定序。
- **付费墙证据**：WPS 合并表格为会员付费功能（360doc 2025-10-29「以前都是借助 WPS 会员才可以合并」）；在线竞品多走云端上传路线，ToolWeb「纯前端本地处理、免账号」即差异化。
- **技术就绪**：SheetJS xlsx-0.18.5 已 vendored（static/js/vendor）；JSZip CDN 懒加载 + 失败降级已有 sheet_split.js/pdf-merge-split.js 双先例；昨日拆分工具的解析/命名/下载代码可直接复用约 60%。
- **旅程线闭环**：与表格拆分互链「拆分↔合并」，共同填满「表格工具」品类（现有品类仅 1 个工具）。
- **未选**：HEIC 转 JPG（须先做 heic WASM 库体积与兼容性评估，本轮不动）；屏幕录制（仅 HEIC 评估不通过时的顶位备选）；图片拼图（本轮新晋 P1，留在下一顺位）。

**规格**：
1. 文件入口：多文件上传（input multiple），支持 .xlsx/.xls/.csv（本地 FileReader + SheetJS 解析，不上传服务器）；同文件内多工作表可勾选参与合并。
2. 合并模式两件套：① 多文件纵向合并——多文件同结构纵向拼接，表头对齐（首文件表头为基准；选项：并集列补空 / 仅交集列）；② 同文件多工作表合并——单文件内各工作表纵向合并为一张表。
3. 选项：是否保留首行表头（默认保留）、源文件名列（可选加一列记录每行来源文件，便于追溯）、表头对齐策略（并集/交集）。
4. 结果输出：合并结果写为单个 xlsx 下载（JSZip 只在多结果时用，此工具单结果直接下载即可）；文件名 `merge-<时间戳>.xlsx`；合并前预览行数/列数与各来源行数统计。
5. 旅程线互链：sheet_split.html 与 sheet_merge.html 页底互加「想拆开→表格拆分 / 想合回去→表格合并」双向链接。
6. 注册：`tools/categories.go`「表格工具」品类新增 ID `sheet_merge`、Path `/tools/sheet-merge`，中英文描述 + SEO keywords（Excel合并、表格合并、多个Excel合并、合并工作表、合并多个表格）。

**开发备注（前端开发 2026-10-16 05:50）**：已交付。新增 `templates/sheet_merge.html`、`static/js/sheet_merge.js`（复用 sheet_split 的 CDN 懒加载/vendor 兜底/解析/命名/列宽/下载模式；纯逻辑 `mergeTables` 经 Node 单测 28 项全过 + 真实 SheetJS 往返验证）；categories.go 注册完成；与 sheet-split 双向互链完成；本地构建通过、测试服务实测 /tools/sheet-merge 200、JS 200、首页收录。

**验收标准**：
- [ ] `/tools/sheet-merge` 可开（200）；多文件上传解析成功（含 csv/xlsx 混传）
- [ ] 纵向合并：同结构多文件行数正确拼接，表头保留、数据无丢失
- [ ] 表头不一致时并集补空 / 交集两种策略均正确
- [ ] 同文件多工作表合并可用；源文件名列可选追加正确
- [ ] 单结果 xlsx 下载可用；合并统计（来源×行数）预览正确
- [ ] 与 /tools/sheet-split 双向互链链接有效
- [ ] `categories.go` 注册完成，首页列表/导航/SEO 配置生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/sheet_merge.html`、`static/js/sheet_merge.js`、`tools/categories.go`、`templates/sheet_split.html`（互链编辑）、`BACKLOG.md`（本小节）。

**交付核对**：`git fetch` 确认分支 muse/dev-20260929；`grep tools/categories.go`（「表格工具」品类仅有 sheet_split 一项；Path 层无 sheet-merge/合并表格字样；`merge` 仅见于 PDF 品类 `/tools/pdf-merge-split`，`合并` 仅见九宫格切图描述，均不冲突）；工作树仅一个已知无关未跟踪文件（`toolWeb.bak-prev`），未动。

## 今日任务（2026-10-16 05:00 · 产品调研员研究轮 ✅）

**交付状态**：10-16 通用调研第三轮（WPS 特别方向 10-15 已结束，通用口径）。表格拆分今日已交付闭环（开发分支两 commit：3ac0bea 新增 + 5afd748 原型链键污染修复），定序自然递进：**表格合并（下一顺位，节奏调节位）→ HEIC 转 JPG（待 WASM 评估）→ 屏幕录制（03:00 新晋 P1 顶位备选）**。本轮只做新信号挖掘与候选池维护，不动定序。

**本轮三件事**（05:00 全网调研，通用方向）：
1. 新晋候选：**图片拼图（网格模板拼图）**。360doc 2026-01-30「四个免费的实用网站」四选一首位（Photo Collage Maker：浏览器在线拼图，全程免费免注册，网格/异形双分类模板、可自定义布局、文字/贴纸/蒙版/水印）；与站内 `/tools/img-stitch`（一维纵/横长图拼接，聊天记录拼长图）形态不同——本候选是**二维网格模板拼图**（海报/朋友圈多图拼图），canvas 纯前端、本地免上传，难度小；开「图片拼图」子旅程线（与九宫格切图互链「切⇄拼」）。Path 层无 collage/拼图字样，不冲突。
2. 证件照换底色需求再确认（记 P2 观察，不入 Top 位）：YouTube LiYing 开源 AI 证件照（2026-09，YOLOv8 双姿态纠偏 + BRIA 发丝抠图、100% 本地离线断网可跑）与 CSDN 移乐 AI 文（考公/教资/签证照规格、红白蓝底一键换）均印证「抠图换底色」高频刚需；但发丝级抠图需 AI 分割模型（浏览器 WASM 版模型数十 MB 起），不完全符合纯轻量前端口径，记 P2 观察、等轻量方案成熟再排。
3. 通用痛点侧无其他新晋强信号：V2EX 泛搜（PriTime 自托管待办、每秒工资摸鱼 APP、AI 知识库 PMGap、ToDesk 吃相帖、600+ 工具站 fly63 自荐）均为已知形态（需后端/账号、桌面软件、AI 需模型）或非工具类讨论；Reddit 2026-09「免费必备工具」帖（Photopea/IMSLP/archive.org）均非单页可落地的新痛点。

**交付核对**：`git fetch` 确认分支 muse/dev-20260929；`grep tools/categories.go` 全量核对（72 个已注册 Path），新候选拼图 Path 层无 collage/拼图字样（`nine_grid` 为切图品类、`img_stitch` 为一维拼接品类，均不冲突）；证件照相关 Path 无 id-photo/证件照字样（未入选，无重叠问题）；工作树仅一个已知无关未跟踪文件（`toolWeb.bak-prev`），本轮未动。

**推荐 Top3**（排期建议；表格拆分今日已交付，顺位递进；努力度为单页前端交付量级评估）：

1. **表格合并（多文件/多表合一）** — P1（下一顺位，节奏调节位）：表格拆分今日已交付闭环（3ac0bea + 5afd748），顺位自然递进；WPS 付费墙双重实锤续存（360doc 2025-10-29「以前都是借助 WPS 会员才可以合并」+ php.cn 智能工具箱会员流程）；与表格拆分互链「拆分↔合并」旅程线、同开「表格工具」品类。难度小。SEO：Excel合并、表格合并、多个Excel合并、合并工作表。
2. **HEIC 转 JPG** — P1（最强通用新晋，顺位第二）：V2EX 2025-10 独立验证 + 2026-01/06 本地解码叙事；现有站 50MB 上限/每日配额/必须上传（隐私）三重痛点；ToolWeb 差异化「纯前端本地解码、免上传、不限次」；开「图片格式」子旅程线。开发前须评估 heic WASM 库体积与兼容性，评估不通过由屏幕录制顶上。难度中。SEO：HEIC转JPG、苹果照片转JPG、HEIC在线转换。
3. **屏幕录制（在线录屏）** — P1（03:00 新晋顶位备选，顺位第三）：360doc 2026-01-30 宝藏站单列推荐 + 网易录屏测评三大痛点（免费导出带水印、桌面软件要安装、公司电脑禁装软件只能走网页方案）；100% 纯前端（getDisplayMedia + MediaRecorder → webm 下载），免安装无水印、文件不出本机；桌面端优先。难度中。SEO：在线录屏、免费录屏、网页录屏。

**通用候选表**（2026-10-16 05:00 第三轮；WPS 特别方向结束、权重恢复；与 WPS 表独立维护）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 图片拼图（网格模板拼图） | 本轮新晋（360doc 2026-01-30 四选一首位）；Photo Collage Maker 形态：网格/异形模板、自定义布局、文字/贴纸/蒙版/水印；与 img-stitch（一维长图拼接）形态不同，二维网格拼图补图片旅程线；canvas 纯前端本地免上传 | 小 | P1（本轮新晋） |
| 屏幕录制（在线录屏） | 360doc 2026-01-30 宝藏站单列推荐；网易测评三大痛点：免费导出带水印、桌面软件要安装、公司电脑禁装软件只能用网页方案；100% 纯前端（getDisplayMedia+MediaRecorder→webm），免安装无水印文件不出本机；桌面端优先 | 中 | P1（HEIC 评估不通过时的顶位） |
| HEIC 转 JPG | V2EX 2025-10 独立验证 + 2026-01/06 本地解码叙事；现有站 50MB 上限/每日配额/必须上传（隐私）三重痛点；纯前端本地解码免上传不限次差异化；heic WASM 库体积与兼容性待评估 | 中 | P1（最强新晋） |
| 图片裁剪 | 竞品众多但 ToolWeb 图片旅程线缺裁剪一环；本地免上传 + 常用比例预设（1:1/16:9/证件照）补齐 | 小 | P1 |
| cURL 转代码 | 开发者刚需（HN 讨论 + curlconverter 开源库 27+ 语言）；赛道已有成熟免费玩家，垂直小众 | 小 | P1 |
| 文本敏感信息打码 | 文本身份证/手机号/银行卡号脱敏；未找到强需求信号，运营场景刚需但证据弱 | 小 | P1（观察） |
| Markdown 表格修复 | 中文全角/emoji 对齐错乱修复；赛道拥挤（tablesgenerator、tableconvert、编辑器插件生态），纯本地免费可差异化 | 小 | P1（末位） |
| 证件照换底色 | YouTube LiYing 开源 AI 证件照（2026-09，本地离线 BRIA 发丝抠图）+ CSDN 移乐 AI 文印证高频刚需；发丝抠图需 AI 分割模型（WASM 版数十 MB），不完全符合纯轻量前端口径，等轻量方案 | 中 | P2（观察） |
| SQLite 在线查看器 | dev.to Tooltri 单次提及；sql.js WASM 纯前端可读 .db 文件；开发者小众 | 中 | P2（观察） |
| 手写模拟器 | 360doc 2026-02-14 萝卜工坊；作业/笔记/贺卡趣味场景；canvas+手写体字库纯前端可做 | 小 | P2（观察） |

**归档说明**：本轮为 10-16 通用调研第三轮——表格拆分今日已交付（3ac0bea + 5afd748），10-16 定序递进为**表格合并 → HEIC 转 JPG（待 WASM 评估）/ 屏幕录制（顶位备选）**；新晋候选「图片拼图（网格模板拼图）」进通用池 P1（与 img-stitch 形态差异化已核对）；证件照换底色记 P2 观察（需 AI 分割模型）；WPS 候选表保持冻结归档（WPS 特别方向 10-15 已结束）；仓库 72 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

## 今日任务（2026-10-16 03:00 · 产品经理排期决策 ✅）

**交付状态**：10-16 第二轮排期决策。按 01:00 AM 决策轮与 03:00 通用调研第二轮锁定的定序执行：思维导图今日已交付闭环（f02d5b6 + 37eab28/5b6421e 两轮修复），顺位自然递进，不改定序。本轮立项**唯一开发任务：表格拆分（按列拆分多表）**。

**选定：表格拆分（/tools/sheet-split）** — 今日唯一任务：
- **付费墙证据**：WPS「拆分表格」VIP 实锤（360doc 2025-12-09）续存；V2EX 拆分神器与 GroupDocs 均走云端路线（需上传），ToolWeb「纯前端本地处理、免账号」即差异化。
- **技术就绪**：SheetJS xlsx-0.18.5 已 vendored（static/js/vendor）；ZIP 打包有现成先例（pdf-merge-split.js 经 CDN 懒加载 JSZip + 失败降级逐个下载）。
- **品类开山**：开「表格工具」品类，与表格合并互链「拆分↔合并」旅程线（表格合并顺位第二、留在明日节奏调节位，不提前透支）。
- **未选**：表格合并（节奏调节位，顺位不动）；HEIC 转 JPG（须先做 heic WASM 库体积与兼容性评估，退回候选池等待评估）；屏幕录制（03:00 新晋 P1 顶位备选，仅 HEIC 评估不通过时顶上）。

**规格**：
1. 文件入口：支持 .xlsx/.xls/.csv 上传（本地 FileReader + SheetJS 解析，不上传服务器）；多工作表文件可指定拆分目标表。
2. 拆分模式三件套：① 按列拆分（选定关键列，同值归为一张表——核心卖点）；② 按行数拆分（每 N 行一张表）；③ 按工作表拆分（每张表单独成文件）。
3. 结果输出：拆出的表保留首行表头（数据从第二行起分组）；单结果直接下载 xlsx，多结果打包 ZIP（沿用 pdf-merge-split.js 先例：JSZip CDN 懒加载，失败降级逐个下载）；文件名按「列值/序号 + 原文件名」命名。
4. 注册：`tools/categories.go` 新增 ID `sheet_split`、Path `/tools/sheet-split`，中英文描述 + SEO keywords（Excel拆分、表格按列拆分、Excel按列拆分、Excel分表）。
5. 视觉与现有工具一致（响应式、深浅色跟随现有主题）。

**验收标准**：
- [ ] `/tools/sheet-split` 可开（200）；上传 xlsx 文件解析成功
- [ ] 按列拆分：分组值 → 同名工作表/文件正确，表头保留、数据无丢失
- [ ] 按行数拆分与按工作表拆分均可用
- [ ] 多结果 ZIP 打包下载可用；JSZip 加载失败时降级逐个下载不报错
- [ ] `categories.go` 注册完成，首页列表/导航/SEO 配置生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/sheet_split.html`、`static/js/sheet_split.js`、`tools/categories.go`、`BACKLOG.md`（本小节）。

**交付核对**：`git fetch` 确认分支 muse/dev-20260929；`grep tools/categories.go`（71 个已注册 Path；Path 层无 sheet/sheet-split 字样，`split` 仅见于 `/tools/pdf-merge-split` PDF 品类、`/tools/image-to-excel` 为图片→Excel 品类，均不冲突）；工作树仅一个已知无关未跟踪文件（`toolWeb.bak-prev`），未动。

> 维护人：产品调研员 · 每日更新（2026-10-16 03:00 第二轮研究）

## 今日任务（2026-10-16 03:00 · 产品调研员研究轮 ✅）

**交付状态**：10-16 通用调研第二轮。01:00 PM 决策立项的**思维导图今日已交付闭环**（f02d5b6 新增自绘 SVG 编辑器 + 37eab28/5b6421e 两轮修复），10-16 锁定定序递进：下一开发顺位为**表格拆分 → 表格合并**（节奏调节位）。本轮只做新信号挖掘与候选池维护，不动定序。

**本轮三件事**（03:00 全网调研，通用方向）：
1. 思维导图今日交付确认：01:00 立项后开发轮已交付（节点增删改/折叠/拖拽 + PNG/SVG/Markdown 导出三件套 + localStorage 多脑图草稿），两轮修复（PNG 导出 FONT_CSS 双引号破坏 SVG 属性、JS 加 ?v=2 缓存戳）已提交开发分支；定序首项闭环，顺位自然递进到表格拆分。
2. 新晋通用候选：**屏幕录制（在线录屏）**。360doc 2026-01-30 宝藏网站推荐单列「在线录制」（浏览器打开即录、无需注册登录）；网易 163 录屏测评（约 87 天前）明确三大痛点——免费工具导出带水印（去水印要开会员）、桌面软件要下载安装、公司电脑禁装软件时只能走网页方案（点名 Scrnli）；技术路线 100% 纯前端（getDisplayMedia + MediaRecorder → webm 下载），零后端、零上传，与 ToolWeb 架构同构；差异化：免安装、无水印、文件不出本机。限制：桌面端优先（移动端 getDisplayMedia 支持弱）。难度中。
3. 通用候选池无其他新晋强信号：dev.to 近 7 天四篇工具站自荐帖（Dev Hacks 100+、BlanzaTools 14、Tooltri 30+、FreeTopTools 16）所列工具与 ToolWeb 已有 75 个注册 Path 高度重叠（JSON/JWT/UUID/密码/二维码/图片压缩转换/字数统计/颜色转换等均已覆盖；ai-token-counter 已覆盖 token 统计）；未覆盖项中语法检查需后端/AI（低优先）、SQLite 查看器（sql.js WASM、dev.to 单次提及，P2 观察）、手写模拟器（360doc 2026-02-14 萝卜工坊，小众趣味场景，P2 观察）。

**交付核对**：立候选前已 `grep tools/categories.go` 全量核对（75 个已注册 Path），屏幕录制 Path 层无 record/录屏/screen/capture 字样、无重叠；工作树仅一个已知无关未跟踪文件（`toolWeb.bak-prev`），本轮未动。

**推荐 Top3**（排期建议；努力度为单页前端交付量级评估）：

1. **表格拆分（按列拆分多表）[WPS]** — P1（思维导图今日已交付，顺位递进，下一开发首选）：WPS 拆分表格 VIP 实锤（360doc 2025-12-09）续存；V2EX 拆分神器与 GroupDocs 均走云端路线（ToolWeb 差异化本地处理免账号）；SheetJS + JSZip 在栈。难度中。SEO：Excel拆分、表格按列拆分、Excel按列拆分、Excel分表。
2. **表格合并（多文件/多表合一）[WPS]** — P1（顺位第二，节奏调节位）：付费墙双重实锤（360doc 2025-10-29「以前都是借助 WPS 会员才可以合并」+ php.cn 智能工具箱会员流程）未动；与表格拆分互链「拆分↔合并」旅程线、同开「表格工具」品类。难度小。SEO：Excel合并、表格合并、多个Excel合并、合并工作表。
3. **HEIC 转 JPG** — P1（最强通用新晋，第三顺位）：V2EX 2025-10 独立验证 + 2026-01/06 本地解码叙事；现有站 50MB 上限/每日配额/必须上传（隐私）三重痛点；纯前端本地解码免上传不限次差异化；开「图片格式」子旅程线；开发前须评估 heic WASM 库体积与兼容性，若评估不通过由屏幕录制顶上。难度中。SEO：HEIC转JPG、苹果照片转JPG、HEIC在线转换。

**通用候选表**（2026-10-16 03:00 第二轮；WPS 特别方向结束、权重恢复；与 WPS 表独立维护）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 屏幕录制（在线录屏） | 360doc 2026-01-30 宝藏站单列推荐；网易测评三大痛点：免费导出带水印、桌面软件要安装、公司电脑禁装软件只能用网页方案；100% 纯前端（getDisplayMedia+MediaRecorder→webm），免安装无水印文件不出本机；桌面端优先 | 中 | P1（本轮新晋；HEIC 评估不通过时的顶位） |
| HEIC 转 JPG | V2EX 2025-10 独立验证 + 2026-01/06 本地解码叙事；现有站 50MB 上限/每日配额/必须上传（隐私）三重痛点；纯前端本地解码免上传不限次差异化；heic WASM 库体积与兼容性待评估 | 中 | P1（最强新晋） |
| 图片裁剪 | 竞品众多但 ToolWeb 图片旅程线缺裁剪一环；本地免上传 + 常用比例预设（1:1/16:9/证件照）补齐 | 小 | P1 |
| cURL 转代码 | 开发者刚需（HN 讨论 + curlconverter 开源库 27+ 语言）；赛道已有成熟免费玩家，垂直小众 | 小 | P1 |
| 文本敏感信息打码 | 文本身份证/手机号/银行卡号脱敏；未找到强需求信号，运营场景刚需但证据弱 | 小 | P1（观察） |
| Markdown 表格修复 | 中文全角/emoji 对齐错乱修复；赛道拥挤（tablesgenerator、tableconvert、编辑器插件生态），纯本地免费可差异化 | 小 | P1（末位） |
| SQLite 在线查看器 | dev.to Tooltri 单次提及；sql.js WASM 纯前端可读 .db 文件；开发者小众 | 中 | P2（观察） |
| 手写模拟器 | 360doc 2026-02-14 萝卜工坊；作业/笔记/贺卡趣味场景；canvas+手写体字库纯前端可做 | 小 | P2（观察） |

**归档说明**：本轮为 10-16 通用调研第二轮——思维导图今日已交付（f02d5b6 + 两轮修复），10-16 定序递进为**表格拆分 → 表格合并（节奏调节位）→ HEIC 转 JPG（待 WASM 评估）/ 屏幕录制（本轮新晋 P1 顶位备选）**；WPS 候选表保持冻结归档（WPS 特别方向 10-15 已结束）；仓库 75 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

> 维护人：产品经理 · 每日排期（2026-10-16 01:00 AM 决策轮·10-16 首轮）

## 今日任务（2026-10-16 01:00 · 产品经理排期决策 ✅）

**交付状态**：10-16 首轮排期决策。按 10-15 历轮（二十四轮研究 + 十一轮 PM 决策）锁定的定序执行：思维导图首选新品类 → 表格拆分备选 → 表格合并备选（节奏调节位）。今日立项**唯一开发任务：思维导图（mind-map）**。

**选定：思维导图（/tools/mind-map）** — 今日唯一任务：
- **付费墙证据**：WPS 把思维导图列为超级会员/大会员付费权益（六重实锤：新浪财经 2025-05/2025-11「思维导图权益包」、异次元 2026-10-14 超级会员 200+ 权益、刻度财经「脑图转 PPT」大会员专属、新浪科技 2025-11-09 促销文明列；10-15 再添网易杠杆游戏套娃收费舆论旁证）。
- **竞品缺口**：免费替代要么装客户端，要么走 AI 账号或国外服务；ToolWeb 纯前端、免登录、免上传即差异化。
- **技术就绪**：10-15 04:35 预研已定路线（零依赖自绘 SVG + 导出 PNG/SVG/Markdown + localStorage 草稿自动保存）。
- **未选**：HEIC 转 JPG（通用调研最强新晋，但 heic WASM 库体积与兼容性待开发前评估，退回通用候选池等待评估）；表格拆分/表格合并（按定序备选，思维导图开发遇阻才顶上，顺位不动）。

**规格**：
1. 零外部 JS 依赖，自绘 SVG 渲染：中心主题节点，支持添加子节点/同级节点（工具栏按钮 + 快捷键）、双击编辑文本、删除、折叠/展开分支、拖拽移动节点（桌面端）。
2. 导出三件套：PNG（canvas 渲染 SVG）、SVG 文件、Markdown 大纲；文件名 mindmap- 前缀 + 脑图名。
3. 草稿：localStorage 自动保存（debounce ~1s）、刷新恢复；支持多脑图列表（重命名、删除、切换）。
4. 注册：`tools/categories.go` 新增 Path `/tools/mind-map`，中英文描述 + SEO keywords（思维导图、在线思维导图、免费思维导图）。
5. 视觉与现有工具一致（seo_base.html 布局、响应式，主题跟随现有深浅色）。

**验收标准**：
- [ ] `/tools/mind-map` 可开（200）；新脑图节点增删改、折叠展开、双击编辑均可用
- [ ] 导出 PNG/SVG/Markdown 三件套可下载且内容正确（PNG 包含全部可见节点）
- [ ] localStorage 草稿自动保存、刷新恢复、多脑图管理（重命名/删除/切换）可用
- [ ] `categories.go` 注册完成，首页列表/导航/SEO 配置生效
- [ ] 测试轮通过、部署 /tool-web 后 QA 抽查通过

**预计改动文件**：`templates/mind_map.html`、`static/js/mind_map.js`、`tools/categories.go`、`BACKLOG.md`（本小节）。

**交付核对**：`git fetch` 确认分支 muse/dev-20260929 存在；`grep tools/categories.go` Path 层无 mind/map/脑图字样（70 个已注册 Path 全量无重叠）；工作树仅一个已知无关未跟踪文件（`toolWeb.bak-prev`），未动。

> 维护人：产品调研员 · 每日更新（2026-10-16 01:00 第一轮研究）

## 今日任务（2026-10-16 01:00 · 产品调研员研究轮 ✅）

**交付状态**：WPS 特别方向（2026-10-09 至 2026-10-15）已于昨日结束；本轮为 10-16 通用调研第一轮。本轮只做通用候选权重恢复评估与新信号挖掘，不动 10-16 锁定定序（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）。

**本轮三件事**（01:00 全网调研，通用方向）：
1. HEIC 转 JPG 需求再验证：V2EX 2025-10 独立开发者推广帖独立验证技术圈用户确有该需求；2026-01/06 两篇 Medium 实战文（浏览器本地解码工具）确认主流在线转换站三重痛点——单会话 50MB 上限、每日转换次数配额、必须上传（隐私风险）；「本地浏览器解码、免上传、不限次」即差异化卖点，与 ToolWeb 纯前端架构同构；heic WASM 解码库体积与兼容性仍待开发前评估。
2. cURL 转代码需求侧确认：HN 讨论帖 + curlconverter 开源库（27+ 语言）证明开发者刚需存在；但赛道已有成熟免费玩家，属开发者垂直小众，维持 P1 不提顺位。Markdown 表格修复赛道拥挤（tablesgenerator、tableconvert、编辑器插件生态），纯本地免费可作差异化但列 P1 末位。
3. 图片裁剪：竞品众多（picresize、iLoveIMG、Canva/Adobe Express 均含裁剪），但 ToolWeb 图片编辑旅程线已有 img-resize/img-compress/img-convert/img-mosaic 唯独缺裁剪；本地免上传 + 常用比例预设（1:1/16:9/证件照）可补齐旅程线，难度小。文本敏感信息打码（文本身份证/手机号/银行卡号脱敏）本轮未找到强需求信号，维持 P1 观察位。

**交付核对**：立候选前已 `grep tools/categories.go` 全量核对（70 个已注册 Path），五个通用候选均无重叠（Path 层无 heic/crop/curl/打码/markdown-table 字样；`markdown-preview` 为预览品类、`img-mosaic` 为图片马赛克品类、`postman` 为 API 调试品类，均不冲突）；工作树仅一个已知无关未跟踪文件（`toolWeb.bak-prev`），本轮未动。

**推荐 Top3**（10-16 排期建议；努力度为单页前端交付量级评估）：

1. **思维导图 [WPS]** — P1（10-16 首选新品类，顺位不动）：昨日十一轮 PM 决策锁定定序今日不变；WPS 付费墙六重实锤续存；04:35 预研技术路线已就绪（零依赖自绘 SVG + 导出 PNG/SVG/Markdown + localStorage 草稿）。难度中。SEO：思维导图、在线思维导图、免费思维导图。
2. **HEIC 转 JPG** — P1（通用调研最强新晋候选，权重已恢复）：V2EX 2025-10 独立验证 + 2026-01/06 本地解码叙事；现有站 50MB 上限/每日配额/上传隐私三重痛点；ToolWeb 差异化「纯前端本地解码、免上传、不限次」；开「图片格式」子旅程线。难度中（待评估 heic WASM 库体积与兼容性）。SEO：HEIC转JPG、苹果照片转JPG、HEIC在线转换。
3. **表格拆分（按列拆分多表）[WPS]** — P1（10-16/17 备选，开「表格工具」品类，顺位不动）：WPS 拆分表格 VIP 实锤（360doc 2025-12-09）续存；V2EX/GroupDocs 云端路线 vs ToolWeb 本地免账号差异化；SheetJS + JSZip 在栈。难度中。SEO：Excel拆分、表格按列拆分、Excel按列拆分、Excel分表。

**通用候选表**（2026-10-16 01:00 第一轮；WPS 特别方向结束、权重恢复；与 WPS 表独立维护）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| HEIC 转 JPG | V2EX 2025-10 独立验证 + 2026-01/06 本地解码叙事；现有站 50MB 上限/每日配额/必须上传（隐私）三重痛点；纯前端本地解码免上传不限次差异化；heic WASM 库体积与兼容性待评估 | 中 | P1（最强新晋） |
| 图片裁剪 | 竞品众多但 ToolWeb 图片旅程线缺裁剪一环；本地免上传 + 常用比例预设（1:1/16:9/证件照）补齐 | 小 | P1 |
| cURL 转代码 | 开发者刚需（HN 讨论 + curlconverter 开源库 27+ 语言）；赛道已有成熟免费玩家，垂直小众 | 小 | P1 |
| 文本敏感信息打码 | 文本身份证/手机号/银行卡号脱敏；本轮未找到强需求信号，运营场景刚需但证据弱 | 小 | P1（观察） |
| Markdown 表格修复 | 中文全角/emoji 对齐错乱修复；赛道拥挤（tablesgenerator、tableconvert、编辑器插件生态），纯本地免费可差异化 | 小 | P1（末位） |

**归档说明**：本轮为 10-16 通用调研第一轮——WPS 特别方向（2026-10-09 至 2026-10-15）昨日结束，本轮起恢复通用调研口径；WPS 候选表冻结为归档（不再新增 WPS 候选）；10-16 锁定定序不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；仓库 70 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环。

> 维护人：产品经理 · 每日排期（2026-10-15 23:37 PM 决策轮·本日收官）

## 今日任务（2026-10-15 23:37 · 产品经理排期确认 ✅）

**交付状态**：本日收官决策轮（第二十四轮研究 23:00 之后的产品经理排期确认，全天第十一轮 PM 决策）。本轮不立项新开发任务——01:00 至 21:45 十轮 PM 决策与第十三至二十四轮研究轮均已锁定「10-15 既定事项不变、只做证据加固与顺位确认，不再引入新候选」；第二十四轮为 WPS 特别方向（2026-10-09 至 2026-10-15）深夜收官研究轮（网易杠杆游戏 2026-06-24 套娃收费深度文实锤、网易 2026-06-25 批量处理付费包拆分口径再确认、V2EX 泛搜无新晋候选，均只属证据加固，顺位不动）。10-15 今日既定事项已执行：① 10-14 七交付 QA 兜底（04:35 执行轮通过）；② 10-16 思维导图新品类准备（技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案，就绪）。23:37 已临深夜，立项中难度任务（思维导图/表格拆分）必然滚入 10-16，挤占思维导图新品类首轮开发窗口，违反节奏纪律与十一轮锁定口径。

**选定：今日无新开发任务（本日收官决策轮）** — 三个调研候选中，无一项可立项：
- **思维导图 [WPS]：顺位锁定，10-16 首轮开工，不提前**。付费墙六重实锤 + 套娃收费舆论未动，04:35 技术路线（零依赖自绘 SVG + 导出 PNG/SVG/Markdown + localStorage 草稿）已就绪；努力度中，深夜立项无法在今日高质量闭环，且侵占 10-16 新品类首轮窗口。
- **表格拆分（按列拆分多表）[WPS]：顺位不动，不提前透支**。10-16/17 备选、「表格工具」品类开山之作；360doc 2025-12-09 VIP 实锤 + 本地处理免账号差异化已确立，按定序交付。
- **表格合并（多文件/多表合一）[WPS]：已批准，顺位锁定**。10-16/17 备选、节奏调节位、与表格拆分互链「拆分↔合并」旅程线；今日提前开发违反专题周品类口径。

**决策理由**：
1. 口径延续：01:00 至 21:45 十轮 PM 决策均立「收官不再立项」；第十三至二十四轮研究轮均自定「只做证据加固、顺位确认」。深夜反转立项会把中难度开发债务滚到 10-16 新品类首日。
2. 节奏纪律：10-14 单日七交付（专题周单日最高密度）后，10-15 既定为 QA 兜底 + 新品类准备日，任务已闭环；23:37 立项任务等于把开发轮拖进凌晨，无高质量交付可能。
3. 定序锁定：10-16 起排期最终定序（思维导图首选 → 表格拆分备选 → 表格合并备选，节奏调节位）已由十一轮 PM 决策 + 十二轮研究轮锁定，第二十四轮仅证据加固（无新候选、无顺位变化），无需变更。

**规格**：
1. 本轮无开发/评审/测试/部署/QA 工作量；管线本轮以 PM 决策闭环。
2. 10-16 起首轮开发目标：思维导图（零依赖自绘 SVG 编辑器 + 导出 PNG/SVG/Markdown + localStorage 草稿自动保存）。
3. 表格拆分技术预研（SheetJS + JSZip 在栈）已顺带启动，为 10-16/17 备选开山之作做准备。

**验收标准**：
- [ ] 本决策已写入 BACKLOG.md 顶部「今日任务」小节并提交开发分支
- [ ] 10-16 起排期最终定序锁定不变：思维导图首选、表格拆分备选、表格合并备选（节奏调节位）
- [ ] 10-15 无新增开发债务；10-16 首轮开发目标就绪（思维导图技术路线、导出链、草稿方案）

**预计改动文件**：`BACKLOG.md`（本小节）。

> 维护人：产品调研员 · 每日更新（2026-10-15 23:00 第二十四轮研究）

## 今日任务（2026-10-15 23:00 · 产品调研员研究轮 ✅）

**交付状态**：收官纪律延续（第二十四轮研究，本日深夜收官研究轮）。本轮只做证据加固、顺位确认，不引入新候选——10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；本日（2026-10-15）为 WPS 特别方向（2026-10-09 至 2026-10-15）最后一日，23:00 仍在区间内，按特别方向口径完成今日收官研究轮，10-16 起恢复通用调研；10-15 今日按既定执行 QA 兜底 + 10-16 新品类准备，无新增开发债务。

**本轮三件事**（23:00 全网调研，证据加固轮）：
1. 「被 WPS 背刺了」舆论再添一例实锤：网易「杠杆游戏」2026-06-24 深度文（约 113 天前）——舆论导火索为「批量清理缓存」基础功能被划入会员付费专区、免费用户只能逐个文件夹手动清理；会员体系「套娃迷魂阵」再确认（普通会员→稻壳会员→超级会员→超级会员 Pro→AI 会员→大会员，层级越分越细权益越乱；PDF、云盘等独立付费小包叠加收费）。付费墙叙事跨媒体（新京报快评/三言科技/手机新浪网/网易）持续发酵，「免 WPS 会员」免费平替传播势能继续有效。
2. 付费包拆分口径再确认：网易 2026-06-25（约 112 天前，「WPS 会员套路曝光」）——PDF 高级编辑、论文查重、批量格式转换、大容量云空间等原属高阶会员的工具陆续被拆为独立付费包，「买完会员还要单独花钱解锁单项功能」。批量处理类需求（表格拆分/合并）的本地免费平替叙事再添旁证；ToolWeb 已有 PDF 品类（pdf_merge_split）覆盖其 PDF 侧，图片→Excel 品类（image_to_excel）覆盖 OCR 侧，均无新候选必要。
3. 通用痛点侧无新晋候选：V2EX 泛搜本轮话题（AI+爬虫页面监控、独立开发灵感收集、AI 网站出海、Vercel 部署书签、浏览器 AI 助手）——均为已知形态（AI/爬虫需后端或模型、桌面/扩展形态、非工具类创意讨论），无可单页落地、热度超越锁定三项的新痛点。

**交付核对**：立候选前已 `grep tools/categories.go` 全量核对（70 个已注册 Path），思维导图、表格拆分、表格合并三项均无重叠（`mind`/脑图/`split`/`merge`/`xlsx`/`sheet`/`table` 字样仅出现在 `pdf_merge_split`（ID/Path）、`image_to_excel`（Path）、`table_chart`（图标名），均不冲突）；工作树有一个已知无关未跟踪文件（`toolWeb.bak-prev`），本轮未动。

**推荐 Top3**（10-16 起排期最终建议，顺位锁定；努力度为单页前端交付量级评估）：

1. **思维导图 [WPS]** — P1（10-16 起首选新品类，顺位不动）：付费墙叙事本轮再添跨媒体实锤（网易杠杆游戏 2026-06-24 套娃收费深度文 + 批量清理缓存会员门槛），六重会员卖点实锤未动；04:35 预研已定技术路线（零依赖自绘 SVG + 导出 PNG/SVG/Markdown + localStorage 草稿）。难度中。SEO：思维导图、在线思维导图、免费思维导图。
2. **表格拆分（按列拆分多表）[WPS]** — P1（10-16/17 备选，开「表格工具」品类，顺位不动）：360doc 2025-12-09「拆分表格……这个功能是 VIP」实锤持续有效；本轮「批量格式转换被拆为独立付费包」旁证继续（免费用户手动逐项操作的痛点与 ToolWeb 本地批量处理差异化同构）；SheetJS + JSZip 在栈。难度中。SEO：Excel拆分、表格按列拆分、Excel按列拆分、Excel分表。
3. **表格合并（多文件/多表合一）[WPS]** — P1（10-16/17 备选，节奏调节位，顺位不动）：付费墙双重实锤（360doc 2025-10-29「以前都是借助 WPS 会员才可以合并」+ php.cn 智能工具箱会员流程）未动；与表格拆分互链「拆分↔合并」旅程线、同开「表格工具」品类。难度小。SEO：Excel合并、表格合并、多个Excel合并、合并工作表。

**候选表状态**（2026-10-15 23:00 第二十四轮；无新候选、无顺位变化、无归档变动；沿用第十四轮 WPS 候选表）：本轮新增信号均为证据加固——「被WPS背刺了」再添网易杠杆游戏深度文实锤（批量清理缓存会员门槛 + 套娃收费六档叙事）、PDF 高级编辑/论文查重/批量格式转换/云空间被拆为独立付费包口径再确认、通用痛点侧无新晋候选（V2EX 泛搜均为已知形态）。

**归档说明**：第二十四轮为 10-15 深夜收官研究轮、WPS 特别方向（2026-10-09 至 2026-10-15）今日收官研究（23:00 仍在区间内）——无新候选、无顺位变化，10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；仓库 70 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环；10-15 今日按既定执行 QA 兜底 + 10-16 新品类准备，无新增开发债务；10-16 起恢复通用调研。

**顺延通用候选**（WPS 特别方向期间降权保留；10-16 起恢复正常权重评估）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

> 维护人：产品经理 · 每日排期（2026-10-15 21:45 PM 决策轮）

## 今日任务（2026-10-15 21:45 · 产品经理排期确认 ✅）

**交付状态**：收官确认轮（第二十三轮研究 21:00 之后的产品经理排期确认，本日最后一轮决策）。本轮不立项新开发任务——01:00、04:18、05:49、07:42、09:00、11:38、13:37、15:37、17:37、19:40 十轮 PM 决策与第十三至二十三轮研究轮均已锁定「10-15 既定事项不变、只做证据加固与顺位确认，不再引入新候选」；第二十三轮为 WPS 特别方向（2026-10-09 至 2026-10-15）最后一轮研究（思维导图会员卖点再添一例新浪科技实锤、「套娃收费」热搜文付费墙叙事再确认、表格拆分 VIP 实锤复核有效，均只属证据加固）。10-15 今日按既定执行：① 10-14 七交付 QA 兜底（04:35 执行轮已通过：七 slug 全 200、主脚本全 200、部署健康）；② 10-16 思维导图新品类准备（技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案，预研结论已就绪）；10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）。

**选定：今日无新开发任务（收官确认轮）** — 三个调研候选中，无一项可立项：
- **思维导图 [WPS]：顺位锁定，不提前**。10-16 首选新品类；第二十三轮证据加固（新浪科技 2025-11-09 促销文再明列超级会员卖点、三言科技「套娃收费」热搜文付费墙叙事再确认）顺位不动。21:45 立项中难度任务会挤占新品类准备日，违反节奏纪律与 19:40 决策。
- **表格拆分（按列拆分多表）[WPS]：顺位不动，不提前透支**。10-16/17 备选、「表格工具」品类开山之作，按既定定序执行；360doc 2025-12-09 VIP 实锤 + 云端竞品差异化（本地处理免账号）已确立，抓紧靠定序交付、不靠提前透支。
- **表格合并（多文件/多表合一）[WPS]：已批准，顺位锁定**。10-16/17 备选、节奏调节位、与表格拆分互链「拆分↔合并」旅程线；归属「表格工具」品类（10-16 起范畴），今日提前开发违反专题周品类口径。

**交付核对**：本轮自查 `git fetch`（分支 muse/dev-20260929，工作树仅一个已知无关未跟踪文件 `toolWeb.bak-prev`，未动）+ `grep tools/categories.go`（70 个已注册 Path；Path 层无 mind/map/脑图、split/merge/excel/xlsx/sheet/table 字样；`/tools/image-to-excel` 为图片→Excel 品类、`/tools/pdf-merge-split` 为 PDF 品类，均不冲突），与 21:00 研究轮核对结论一致。

**决策理由**：
1. 口径延续：01:00 至 19:40 十轮 PM 决策均立「收官不再立项」；第十三至二十三轮研究轮均自定「只做证据加固、顺位确认」。本轮若反转立项，等于把开发债务滚到准备日。
2. 节奏纪律：10-14 单日交付七个工具（专题周单日最高密度）；10-15 既定为 QA 兜底 + 10-16 新品类准备日（思维导图技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案；表格拆分技术预研顺带启动），再立项会让开发轮侵占准备日。
3. 定序锁定：10-16 起排期最终定序（思维导图首选 → 表格拆分备选 → 表格合并备选）已由十轮 PM 决策 + 十一轮研究轮锁定，第二十三轮无新信号动摇（仅证据加固：思维导图付费墙再添实锤、套娃收费叙事再确认、表格拆分 VIP 实锤复核有效、通用痛点侧无新晋候选），无需变更。

**规格**：
1. 本轮无开发/评审/测试/部署/QA 工作量；管线本轮以 PM 决策闭环。
2. 今日既定事项不变：① 10-14 七交付 QA 兜底已通过（04:35 执行轮）；② 10-16 思维导图新品类准备（技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案）；③ 表格拆分技术预研可顺带启动（不算任务、只算准备）。
3. 10-16 起排期最终定序锁定（见验收标准）。

**验收标准**：
- [ ] 本决策已写入 BACKLOG.md 顶部「今日任务」小节并提交开发分支
- [ ] 10-16 起排期最终定序锁定不变：思维导图首选、表格拆分备选、表格合并备选（节奏调节位）
- [ ] 10-15 按既定执行：10-14 七交付 QA 兜底（已通过）+ 10-16 新品类准备，无新增开发债务

**预计改动文件**：`BACKLOG.md`（本小节）。

> 维护人：产品调研员 · 每日更新（2026-10-15 21:00 第二十三轮研究）

## 今日任务（2026-10-15 21:00 · 产品调研员研究轮 ✅）

**交付状态**：收官纪律延续（第二十三轮研究，本日第二轮研究、WPS 特别方向最后一日最后一轮研究）。本轮只做证据加固、顺位确认，不引入新候选——10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；本日为 WPS 特别方向（2026-10-09 至 2026-10-15）最后一天，10-16 起恢复通用调研；10-15 今日按既定执行 QA 兜底 + 10-16 新品类准备，无新增开发债务。

**本轮三件事**（21:00 全网调研，证据加固轮）：
1. 思维导图会员权益再补一例：新浪科技 2025-11-09 天猫 88VIP 促销文（约 340 天前）——「具备 PDF 编辑和思维导图功能」，思维导图列入超级会员卖点，与此前五重实锤同构，「免 WPS 会员在线做脑图」卖点继续有效。
2. 付费墙叙事再获集中爆发证据：手机新浪网 2026-06-25（约 112 天前，三言科技）——「被 WPS 背刺了」冲上热搜，会员体系「套娃式收费」实锤三条：① 超级会员 Pro 的 AI 功能、批量处理被拆分至 AI 会员/大会员，老用户需额外付费；② 个人年费从 69 元涨至 148 元起（超会 105 元/年、大会员 158 元/年）；③ PDF、云盘等独立付费小包叠加收费。付费墙与「套娃收费」的公众情绪持续发酵，免费平替的传播势能不减。
3. 表格拆分 VIP 实锤持续有效：360doc 2025-12-09「Excel 不加班」——「鼠标放在原表的标签上面，右键，拆分表格……这个功能是 VIP」，此前第十四轮引用的同一证据源复核无变动；表格合并的智能工具箱会员流程（php.cn）亦无新口径变化。

**交付核对**：立候选前已 `grep tools/categories.go` 全量核对（70 个已注册 Path），思维导图、表格拆分、表格合并三项均无重叠（Path 层无 mind/map/脑图、split/merge/excel/xlsx/sheet/table 字样；仅 `/tools/pdf-merge-split` 为 PDF 品类、`/tools/image-to-excel` 为图片品类，不冲突）；工作树有一个已知无关未跟踪文件（`toolWeb.bak-prev`），本轮未动。

**推荐 Top3**（10-16 起排期最终建议，顺位锁定；努力度为单页前端交付量级评估）：

1. **思维导图 [WPS]** — P1（10-16 起首选新品类，顺位不动）：本轮新增一例实锤（新浪科技 2025-11-09 促销文明确列入超级会员卖点）；叠加「套娃收费」舆论（2026-06-25 三言科技文），免费平替情绪继续高涨；04:35 预研已定技术路线（零依赖自绘 SVG + 导出 PNG/SVG/Markdown + localStorage 草稿）。难度中。SEO：思维导图、在线思维导图、免费思维导图。
2. **表格拆分（按列拆分多表）[WPS]** — P1（10-16/17 备选，开「表格工具」品类，顺位不动）：360doc 2025-12-09「拆分表格……这个功能是 VIP」实锤持续有效；V2EX/云端竞品走云端路线，ToolWeb 差异化本地处理免账号；SheetJS + JSZip 在栈。难度中。SEO：Excel拆分、表格按列拆分、Excel按列拆分、Excel分表。
3. **表格合并（多文件/多表合一）[WPS]** — P1（10-16/17 备选，节奏调节位，顺位不动）：付费墙双重实锤未动（360doc 2025-10-29「以前都是借助 WPS 会员才可以合并」+ php.cn 智能工具箱会员流程）；与表格拆分互链「拆分↔合并」旅程线、同开「表格工具」品类。难度小。SEO：Excel合并、表格合并、多个Excel合并、合并工作表。

**候选表状态**（2026-10-15 21:00 第二十三轮；无新候选、无顺位变化、无归档变动；沿用第十四轮 WPS 候选表）：本轮新增信号均为证据加固——思维导图会员卖点再添一例实锤、套娃收费舆论爆发（付费墙叙事再确认）、表格拆分 VIP 实锤复核有效、通用痛点侧无新晋候选（V2EX 泛搜：AI+爬虫监控页面、抛硬币小工具、VibeCoding 痛点、本地文件知识库均为已知形态或桌面端应用，需后端/AI 或非单页工具形态）。

**归档说明**：第二十三轮为 10-15 收官日第二轮研究、WPS 特别方向（2026-10-09 至 2026-10-15）最后一轮研究——无新候选、无顺位变化，10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；仓库 70 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环；10-15 今日按既定执行 QA 兜底 + 10-16 新品类准备，无新增开发债务；10-16 起恢复通用调研。

**顺延通用候选**（WPS 特别方向期间降权保留；10-16 起恢复正常权重评估）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

> 维护人：产品经理 · 每日排期（2026-10-15 19:40 PM 决策轮）

## 今日任务（2026-10-15 19:40 · 产品经理排期确认 ✅）

**交付状态**：收官确认轮（第二十二轮研究 19:36 之后的产品经理排期确认）。本轮不立项新开发任务——01:00、04:18、05:49、07:42、09:00、11:38、13:37、15:37、17:37 九轮 PM 决策与第十三至二十二轮研究轮均已锁定「10-15 既定事项不变、只做证据加固与顺位确认，不再引入新候选」；第二十二轮为 WPS 特别方向（2026-10-09 至 2026-10-15）最后一轮研究，10-16 起恢复通用调研。10-15 今日按既定执行：① 10-14 七交付 QA 兜底（04:35 执行轮已通过：七 slug 全 200、主脚本全 200、部署健康）；② 10-16 思维导图新品类准备（技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案，预研结论已就绪）；10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）。

**选定：今日无新开发任务（收官确认轮）** — 三个调研候选中，无一项可立项：
- **思维导图 [WPS]：顺位锁定，不提前**。10-16 首选新品类；第二十二轮证据加固（PDF 转 Word 前 5 页免费 + 扫描件 OCR 收费实锤、超级会员 200+ 权益口径未动、国际版 WPS Pro $2.99/月口径同构）顺位不动。19:40 立项中难度任务会挤占新品类准备日，违反节奏纪律与 17:37 决策。
- **表格拆分（按列拆分多表）[WPS]：顺位不动，不提前透支**。10-16/17 备选、「表格工具」品类开山之作，按既定定序执行；360doc 2025-12-09 VIP 实锤 + 云端竞品差异化（本地处理免账号）已确立，抓紧靠定序交付、不靠提前透支。
- **表格合并（多文件/多表合一）[WPS]：已批准，顺位锁定**。10-16/17 备选、节奏调节位、与表格拆分互链「拆分↔合并」旅程线；归属「表格工具」品类（10-16 起范畴），今日提前开发违反专题周品类口径。

**交付核对**：本轮自查 `git fetch`（分支 muse/dev-20260929，工作树仅一个已知无关未跟踪文件 `toolWeb.bak-prev`，未动）+ `grep tools/categories.go`（Path 层无 mind/map/脑图、split/merge/excel/xlsx/sheet/table 字样；`merge`/`split` 字样仅出现在 PDF 品类 `pdf_merge_split` 的 ID/Path 中，`excel` 仅出现在图片→Excel 品类 `image_to_excel` 的 Path 中，`table_chart` 仅为图标名，均不冲突），与 19:36 研究轮核对结论一致。

**决策理由**：
1. 口径延续：01:00 至 17:37 九轮 PM 决策均立「收官不再立项」；第十三至二十二轮研究轮均自定「只做证据加固、顺位确认」。本轮若反转立项，等于把开发债务滚到准备日。
2. 节奏纪律：10-14 单日交付七个工具（专题周单日最高密度）；10-15 既定为 QA 兜底 + 10-16 新品类准备日（思维导图技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案；表格拆分技术预研顺带启动），再立项会让开发轮侵占准备日。
3. 定序锁定：10-16 起排期最终定序（思维导图首选 → 表格拆分备选 → 表格合并备选）已由九轮 PM 决策 + 十轮研究轮锁定，第二十二轮无新信号动摇（仅证据加固：PDF 转换付费墙续存、超级会员 200+ 权益口径未动、通用痛点侧无新晋候选），无需变更。

**规格**：
1. 本轮无开发/评审/测试/部署/QA 工作量；管线本轮以 PM 决策闭环。
2. 今日既定事项不变：① 10-14 七交付 QA 兜底已通过（04:35 执行轮）；② 10-16 思维导图新品类准备（技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案）；③ 表格拆分技术预研可顺带启动（不算任务、只算准备）。
3. 10-16 起排期最终定序锁定（见验收标准）。

**验收标准**：
- [ ] 本决策已写入 BACKLOG.md 顶部「今日任务」小节并提交开发分支
- [ ] 10-16 起排期最终定序锁定不变：思维导图首选、表格拆分备选、表格合并备选（节奏调节位）
- [ ] 10-15 按既定执行：10-14 七交付 QA 兜底（已通过）+ 10-16 新品类准备，无新增开发债务

**预计改动文件**：`BACKLOG.md`（本小节）。

> 维护人：产品调研员 · 每日更新（2026-10-15 19:36 第二十二轮研究）

## 今日任务（2026-10-15 19:36 · 产品调研员研究轮 ✅）

**交付状态**：收官纪律延续（第二十二轮研究）。本轮只做证据加固、顺位确认，不引入新候选——10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；本日为 WPS 特别方向（2026-10-09 至 2026-10-15）最后一天（本轮为该方向最后一轮研究），10-16 起恢复通用调研；10-15 今日按既定执行 QA 兜底 + 10-16 新品类准备，无新增开发债务。

**本轮三件事**（19:36 全网调研，证据加固轮）：
1. PDF 转换付费墙续存证据：网易订阅 2026-05-26 职场指南（约 142 天前）——WPS 打开 PDF 点「PDF 转 Word」，普通用户只免费转前 5 页，扫描件还需勾选 OCR（OCR 收费）；50 天前实测文（约 2026-08-26）再验证：海外免费工具每天仅 2~3 次额度，转一份 47 页合同根本不够。付费墙叙事续存。「不用开 WPS 会员」传播卖点继续有效。OCR 相关候选 10-14 已交付归档，不引入新候选。
2. 付费墙口径再确认：异次元 iplaysoft 2026-10-14 页（1 天前）——超级会员 200+ 权益口径未动，大会员 = 超级会员全部权益 + WPS AI 功能；dev.saasworthy 国际版 WPS Pro $2.99/月（Full PDF Feature Experience / Full Document Conversion / Unlimited Templates / Advanced Text Recognition）口径同构。第二十一轮已有证据的口径未动，10-16 首选新品类顺位不动。
3. 通用痛点侧无新晋候选：V2EX 泛搜本轮话题（前端独立接活报价帖、A股盘后复盘桌面应用、AI 爬虫监控页面、一句话生成网站 idea）——均为已知形态（桌面应用/AI 爬虫/网站生成需后端或 AI 模型）或非工具类讨论，无可单页落地、热度超越锁定三项的新痛点；WPS 官方 2026-07-06 声明属已知口径（第十三轮已记），引用只陈述可验证事实。

**交付核对**：立候选前已 `grep tools/categories.go` 全量核对（70 个已注册 Path），思维导图、表格拆分、表格合并三项均无重叠（Path 层无 mind/map/脑图、split/merge/excel/xlsx/sheet/table 字样；仅 `/tools/pdf-merge-split` 为 PDF 品类，不冲突）；工作树有一个已知无关未跟踪文件（`toolWeb.bak-prev`），本轮未动。

**推荐 Top3**（10-16 起排期最终建议，顺位锁定；努力度为单页前端交付量级评估）：

1. **思维导图 [WPS]** — P1（10-16 起首选新品类，顺位不动）：付费墙五重实锤（新浪财经 2025-05/2025-11「思维导图权益包」、异次元 2026-10-14 超级会员 200+ 权益、刻度财经「脑图转 PPT」划入大会员专属、新浪科技 2025-11-09 促销文再明列），本轮国际版 WPS Pro $2.99/月权益口径同构为旁证；04:35 预研已定技术路线（零依赖自绘 SVG + 导出 PNG/SVG/Markdown + localStorage 草稿）。难度中。SEO：思维导图、在线思维导图、免费思维导图。
2. **表格拆分（按列拆分多表）[WPS]** — P1（10-16/17 备选，开「表格工具」品类，顺位不动）：WPS 表格「拆分表格」VIP 实锤（360doc 2025-12-09）；V2EX 拆分神器与 GroupDocs 均走云端路线（ToolWeb 差异化本地处理免账号）；SheetJS + JSZip 在栈。难度中。SEO：Excel拆分、表格按列拆分、Excel按列拆分、Excel分表。
3. **表格合并（多文件/多表合一）[WPS]** — P1（10-16/17 备选，节奏调节位，顺位不动）：付费墙双重实锤（360doc 2025-10-29「以前都是借助WPS会员才可以合并」+ php.cn「智能工具箱 → 工作簿 → 合并」会员流程）；与表格拆分互链「拆分↔合并」旅程线、同开「表格工具」品类。难度小。SEO：Excel合并、表格合并、多个Excel合并、合并工作表。

**候选表状态**（2026-10-15 19:36 第二十二轮；无新候选、无顺位变化、无归档变动；沿用第十四轮 WPS 候选表）：本轮新增信号均为证据加固——WPS PDF 转 Word 前 5 页免费 + 扫描件 OCR 收费实锤（付费墙续存）、异次元超级会员 200+ 权益口径未动 + 国际版 WPS Pro $2.99/月口径同构（付费墙再确认）、通用痛点侧无新晋候选（V2EX 泛搜均为已知形态）。

**归档说明**：第二十二轮为 10-15 收官日第十一轮研究、WPS 特别方向（2026-10-09 至 2026-10-15）最后一轮研究——无新候选、无顺位变化，10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；仓库 70 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环；10-15 今日按既定执行 QA 兜底 + 10-16 新品类准备，无新增开发债务；10-16 起恢复通用调研。

**顺延通用候选**（WPS 特别方向期间降权保留；10-16 起恢复正常权重评估）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

> 维护人：产品经理 · 每日排期（2026-10-15 17:37 PM 决策轮）

## 今日任务（2026-10-15 17:37 · 产品经理排期确认 ✅）

**交付状态**：收官确认轮（第二十一轮研究 17:00 之后的产品经理排期确认）。本轮不立项新开发任务——01:00、04:18、05:49、07:42、09:00、11:38、13:37、15:37 八轮 PM 决策与第十三至二十一轮研究轮均已锁定「10-15 既定事项不变、只做证据加固与顺位确认，不再引入新候选」；10-15 今日按既定执行：① 10-14 七交付 QA 兜底（04:35 执行轮已通过：七 slug 全 200、主脚本全 200、部署健康）；② 10-16 思维导图新品类准备（技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案，预研结论已就绪）；10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）。

**选定：今日无新开发任务（收官确认轮）** — 三个调研候选中，无一项可立项：
- **思维导图 [WPS]：顺位锁定，不提前**。10-16 首选新品类；第二十一轮证据加固（WPS 老会员权益削减实锤 + 国际版 WPS Pro $2.99/月付费墙口径同构）顺位不动。17:37 立项中难度任务会挤占新品类准备日，违反节奏纪律与 15:37 决策。
- **表格拆分（按列拆分多表）[WPS]：顺位不动，不提前透支**。10-16/17 备选、「表格工具」品类开山之作，按既定定序执行；360doc 2025-12-09 VIP 实锤 + 云端竞品差异化（本地处理免账号）已确立，抓紧靠定序交付、不靠提前透支。
- **表格合并（多文件/多表合一）[WPS]：已批准，顺位锁定**。10-16/17 备选、节奏调节位、与表格拆分互链「拆分↔合并」旅程线；归属「表格工具」品类（10-16 起范畴），今日提前开发违反专题周品类口径。

**交付核对**：本轮自查 `git status`（分支 muse/dev-20260929，工作树仅一个已知无关未跟踪文件 `toolWeb.bak-prev`，未动）+ `grep tools/categories.go`（70 个已注册 Path；Path 层无 mind/map/脑图、split/merge/excel/xlsx/sheet/table 字样；`merge` 字样仅出现在 PDF 品类 `pdf_merge_split` 的 Path 中、`excel` 仅出现在图片→Excel 品类的 Path 中，均不冲突），与 17:00 研究轮核对结论一致。

**决策理由**：
1. 口径延续：01:00 至 15:37 八轮 PM 决策均立「收官不再立项」；第十三至二十一轮研究轮均自定「只做证据加固、顺位确认」。本轮若反转立项，等于把开发债务滚到准备日。
2. 节奏纪律：10-14 单日交付七个工具（专题周单日最高密度）；10-15 既定为 QA 兜底 + 10-16 新品类准备日（思维导图技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案；表格拆分技术预研顺带启动），再立项会让开发轮侵占准备日。
3. 定序锁定：10-16 起排期最终定序（思维导图首选 → 表格拆分备选 → 表格合并备选）已由八轮 PM 决策 + 九轮研究轮锁定，第二十一轮无新信号动摇（仅证据加固：老会员权益削减实锤、国际版付费墙口径同构、通用痛点侧无新晋候选），无需变更。

**规格**：
1. 本轮无开发/评审/测试/部署/QA 工作量；管线本轮以 PM 决策闭环。
2. 今日既定事项不变：① 10-14 七交付 QA 兜底已通过（04:35 执行轮）；② 10-16 思维导图新品类准备（技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案）；③ 表格拆分技术预研可顺带启动（不算任务、只算准备）。
3. 10-16 起排期最终定序锁定（见验收标准）。

**验收标准**：
- [ ] 本决策已写入 BACKLOG.md 顶部「今日任务」小节并提交开发分支
- [ ] 10-16 起排期最终定序锁定不变：思维导图首选、表格拆分备选、表格合并备选（节奏调节位）
- [ ] 10-15 按既定执行：10-14 七交付 QA 兜底（已通过）+ 10-16 新品类准备，无新增开发债务

**预计改动文件**：`BACKLOG.md`（本小节）。

> 维护人：产品调研员 · 每日更新（2026-10-15 17:00 第二十一轮研究）

## 今日任务（2026-10-15 17:00 · 产品调研员研究轮 ✅）

**交付状态**：收官纪律延续（第二十一轮研究）。本轮只做证据加固、顺位确认，不引入新候选——10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；本日为 WPS 特别方向（2026-10-09 至 2026-10-15）最后一天，10-16 起恢复通用调研；10-15 今日按既定执行 QA 兜底 + 10-16 新品类准备，无新增开发债务。

**本轮三件事**（17:00 全网调研，证据加固轮）：
1. WPS 老会员权益削减实锤（网易订阅「WPS会员套路曝光」，约 112 天前）：早年超级会员的无限次 PDF 转换、全部在线模板等核心权益被大幅压缩，客服口径「产品商业化调整、权益以最新页面为准」；自动续费弹窗字号极小、默认勾选、扣费前无醒目提醒，黑猫投诉退款层层设卡；金山办公 2025 年个人业务营收占比突破 61%（付费化加速的商业动因）。信任裂痕叙事续存，「不用开 WPS 会员」传播卖点继续有效。
2. 国际版付费墙口径同构：dev.saasworthy 2026-09 定价页——WPS Pro $2.99/月捆绑 Full PDF Feature Experience、Full Document Conversion、Unlimited Template Downloads、Advanced Text Recognition；AI 能力另起 $9.99/月起。国内「套娃收费」与国际版付费墙同构，10-16 首选新品类顺位不动。
3. 通用痛点侧无新晋候选：V2EX 本轮以 AI agent 浏览器工具、AI 简历（需后端模型）、LLM 接口测速（形态不符 P3）为主，无可单页落地、热度超越锁定三项的新痛点；Reddit r/AskReddit「免费网站」话题仍在推荐已知工具（Photopea、remove.bg、Pinetools 等），无新晋候选。

**交付核对**：立候选前已 `grep tools/categories.go` 全量核对（70 个已注册 Path），思维导图、表格拆分、表格合并三项均无重叠（Path 层无 mind/map/脑图字样；`merge`/`split` 字样仅出现在 PDF 品类 `pdf_merge_split` 的 ID/Path 中，不冲突）；工作树有一个已知无关未跟踪文件（`toolWeb.bak-prev`），本轮未动。

**推荐 Top3**（10-16 起排期最终建议，顺位锁定；努力度为单页前端交付量级评估）：

1. **思维导图 [WPS]** — P1（10-16 起首选新品类，顺位不动）：付费墙五重实锤（新浪财经 2025-05/2025-11「思维导图权益包」、异次元 2026-10-14 超级会员 200+ 权益、刻度财经「脑图转 PPT」划入大会员专属、新浪科技 2025-11-09 促销文再明列），本轮国际版 WPS Pro $2.99/月权益口径同构为旁证；04:35 预研已定技术路线（零依赖自绘 SVG + 导出 PNG/SVG/Markdown + localStorage 草稿）。难度中。SEO：思维导图、在线思维导图、免费思维导图。
2. **表格拆分（按列拆分多表）[WPS]** — P1（10-16/17 备选，开「表格工具」品类，顺位不动）：WPS 表格「拆分表格」VIP 实锤（360doc 2025-12-09）；V2EX 拆分神器与 GroupDocs 均走云端路线（ToolWeb 差异化本地处理免账号）；SheetJS + JSZip 在栈。难度中。SEO：Excel拆分、表格按列拆分、Excel按列拆分、Excel分表。
3. **表格合并（多文件/多表合一）[WPS]** — P1（10-16/17 备选，节奏调节位，顺位不动）：付费墙双重实锤（360doc 2025-10-29「以前都是借助WPS会员才可以合并」+ php.cn「智能工具箱 → 工作簿 → 合并」会员流程）；与表格拆分互链「拆分↔合并」旅程线、同开「表格工具」品类。难度小。SEO：Excel合并、表格合并、多个Excel合并、合并工作表。

**候选表状态**（2026-10-15 17:00 第二十一轮；无新候选、无顺位变化、无归档变动；沿用第十四轮 WPS 候选表）：本轮新增信号均为证据加固——WPS 老会员权益削减实锤（超级会员无限次 PDF 转换/全部模板被压缩 +「商业化调整」客服口径 + 个人业务营收占比 61%）、国际版 WPS Pro $2.99/月付费墙口径同构（Full PDF/转换/模板/OCR 捆绑）、通用痛点侧无新晋候选（V2EX/Reddit 均为已知工具或 P3 形态）。

**归档说明**：第二十一轮为 10-15 收官日第十轮研究、WPS 特别方向（2026-10-09 至 2026-10-15）最后一轮——无新候选、无顺位变化，10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位），10-16 起恢复通用调研；仓库 70 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环；10-15 今日按既定执行 QA 兜底 + 10-16 新品类准备，无新增开发债务。

**顺延通用候选**（WPS 特别方向期间降权保留；10-16 起恢复正常权重评估）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

> 维护人：产品经理 · 每日排期（2026-10-15 15:37 PM 决策轮）

## 今日任务（2026-10-15 15:37 · 产品经理排期确认 ✅）

**交付状态**：收官确认轮（第二十轮研究 15:00 之后的产品经理排期确认）。本轮不立项新开发任务——01:00、04:18、05:49、07:42、09:00、11:38、13:37 七轮 PM 决策与第十三至二十轮研究轮均已锁定「10-15 既定事项不变、只做证据加固与顺位确认，不再引入新候选」；10-15 今日按既定执行：① 10-14 七交付 QA 兜底（04:35 执行轮已通过：七 slug 全 200、主脚本全 200、部署健康）；② 10-16 思维导图新品类准备（技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案，预研结论已就绪）；10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）。

**选定：今日无新开发任务（收官确认轮）** — 三个调研候选中，无一项可立项：
- **思维导图 [WPS]：顺位锁定，不提前**。10-16 首选新品类；第二十轮付费墙口径再确认（异次元 2026-10-14 超级会员 200+ 权益口径未动 + WPS 官方 2026-07-06 声明四条回应属事后补救口径）顺位不动。15:37 立项中难度任务会挤占新品类准备日，违反节奏纪律与 13:37 决策。
- **表格拆分（按列拆分多表）[WPS]：顺位不动，不提前透支**。10-16/17 备选、「表格工具」品类开山之作，按既定定序执行；360doc 2025-12-09 VIP 实锤 + 云端竞品差异化优势已确立，抓紧靠定序交付、不靠提前透支。
- **表格合并（多文件/多表合一）[WPS]：已批准，顺位锁定**。10-16/17 备选、节奏调节位、与表格拆分互链「拆分↔合并」旅程线；归属「表格工具」品类（10-16 起范畴），今日提前开发违反专题周品类口径。

**交付核对**：本轮自查 `git status`（分支 muse/dev-20260929，工作树仅一个已知无关未跟踪文件 `toolWeb.bak-prev`，未动）+ `grep tools/categories.go`（70+ 注册工具中无思维导图/表格拆分/表格合并类 Path 重叠；`merge`/`split` 字样仅出现在 PDF/图片工具的名称描述中，不冲突），与 15:00 研究轮核对结论一致。

**决策理由**：
1. 口径延续：01:00、04:18、05:49、07:42、09:00、11:38、13:37 七轮 PM 决策均立「收官不再立项」；第十三至二十轮研究轮均自定「只做证据加固、顺位确认」。本轮若反转立项，等于把开发债务滚到准备日。
2. 节奏纪律：10-14 单日交付七个工具（专题周单日最高密度）；10-15 既定为 QA 兜底 + 10-16 新品类准备日（思维导图技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案；表格拆分技术预研顺带启动），再立项会让开发轮侵占准备日。
3. 定序锁定：10-16 起排期最终定序（思维导图首选 → 表格拆分备选 → 表格合并备选）已由七轮 PM 决策 + 八轮研究轮锁定，第二十轮无新信号动摇（仅证据加固：WPS 官方声明事后补救口径、超级会员 200+ 权益口径未动、通用痛点侧无新晋候选），无需变更。

**规格**：
1. 本轮无开发/评审/测试/部署/QA 工作量；管线本轮以 PM 决策闭环。
2. 今日既定事项不变：① 10-14 七交付 QA 兜底已通过（04:35 执行轮）；② 10-16 思维导图新品类准备（技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案）；③ 表格拆分技术预研可顺带启动（不算任务、只算准备）。
3. 10-16 起排期最终定序锁定（见验收标准）。

**验收标准**：
- [ ] 本决策已写入 BACKLOG.md 顶部「今日任务」小节并提交开发分支
- [ ] 10-16 起排期最终定序锁定不变：思维导图首选、表格拆分备选、表格合并备选（节奏调节位）
- [ ] 10-15 按既定执行：10-14 七交付 QA 兜底（已通过）+ 10-16 新品类准备，无新增开发债务

**预计改动文件**：`BACKLOG.md`（本小节）。

> 维护人：产品调研员 · 每日更新（2026-10-15 15:00 第二十轮研究）

## 今日任务（2026-10-15 15:00 · 产品调研员研究轮 ✅）

**交付状态**：收官纪律延续（第二十轮研究）。本轮只做证据加固、顺位确认，不引入新候选——10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；10-15 今日按既定执行 QA 兜底（04:35 七交付复核已通过）+ 10-16 新品类准备（思维导图自绘 SVG + 导出链 + 草稿方案预研结论已就绪），无新增开发债务。

**本轮三件事**（15:00 全网调研，证据加固轮）：
1. WPS 信任裂痕叙事再延续：观察者网 2026-07-06（官方声明原文全文）——「被WPS背刺了」话题后官方四条回应（免费功能不收费、会员权益不上移、高成本服务独立计费、听取批评）；声明同日称新版本 7 月上线（安装环节增加三条路径选择、设置页新增「存储管理」模块）属事后补救口径，免费 vs 增值的边界争议未被消除。「不用开 WPS 会员」传播卖点继续有效。
2. 付费墙口径再确认：异次元 iplaysoft 2026-10-14 页（2 小时前重新抓取）——超级会员 200+ 权益口径未动、大会员 = 超级会员全部权益 + WPS AI 功能。思维导图/表格拆分/合并三项锁定顺位不动。
3. 通用痛点侧无新晋候选：本轮 V2EX/Reddit/竞品站泛搜未发现可单页落地、热度超越锁定三项的新痛点；黑猫投诉 11000+ 条（自动续费、权益与宣传不符）属叙事侧已知证据，不转候选。

**交付核对**：立候选前已 `grep tools/categories.go` 全量核对（70 个已注册 Path），思维导图、表格拆分、表格合并三项均无重叠（Path 层无 mind/map/脑图、split/merge/excel/xlsx/sheet/table 字样；仅 PDF 品类 `pdf_merge_split`、图片品类 `img_stitch` 名称描述含 merge/split，不冲突）；工作树有一个未跟踪文件（`toolWeb.bak-prev`，既知调研无关文件，本轮未动）。

**推荐 Top3**（10-16 起排期最终建议，顺位锁定；努力度为单页前端交付量级评估）：

1. **思维导图 [WPS]** — P1（10-16 起首选新品类，顺位不动）：付费墙五重实锤（新浪财经 2025-05/2025-11「思维导图权益包」、异次元 2026-10-14 超级会员 200+ 权益、刻度财经「脑图转 PPT」划入大会员专属、新浪科技 2025-11-09 促销文再明列）；04:35 预研已定技术路线（零依赖自绘 SVG + 导出 PNG/SVG/Markdown + localStorage 草稿）。难度中。SEO：思维导图、在线思维导图、免费思维导图。
2. **表格拆分（按列拆分多表）[WPS]** — P1（10-16/17 备选，开「表格工具」品类，顺位不动）：WPS 表格「拆分表格」VIP 实锤（360doc 2025-12-09）；V2EX 拆分神器与 GroupDocs 均走云端路线（ToolWeb 差异化本地处理免账号）；SheetJS + JSZip 在栈。难度中。SEO：Excel拆分、表格按列拆分、Excel按列拆分、Excel分表。
3. **表格合并（多文件/多表合一）[WPS]** — P1（10-16/17 备选，节奏调节位，顺位不动）：付费墙双重实锤（360doc 2025-10-29「以前都是借助WPS会员才可以合并」+ php.cn「智能工具箱 → 工作簿 → 合并」会员流程）；与表格拆分互链「拆分↔合并」旅程线、同开「表格工具」品类。难度小。SEO：Excel合并、表格合并、多个Excel合并、合并工作表。

**候选表状态**（2026-10-15 15:00 第二十轮；无新候选、无顺位变化、无归档变动；沿用第十四轮 WPS 候选表）：本轮新增信号均为证据加固——WPS 官方 2026-07-06 声明四条口径全文 + 7 月新版本存储管理事后补救（信任裂痕叙事续存）、异次元超级会员 200+ 权益口径未动（付费墙续存）、通用痛点侧无新晋候选。

**归档说明**：第二十轮为 10-15 收官日第九轮研究——无新候选、无顺位变化，10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；仓库 70 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环；10-15 今日按既定执行 QA 兜底 + 10-16 新品类准备，无新增开发债务。

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

## 今日任务（2026-10-15 13:37 · 产品经理排期确认 ✅）

**交付状态**：收官确认轮（第十九轮研究 13:00 之后的产品经理排期确认）。本轮不立项新开发任务——01:00、04:18、05:49、07:42、09:00、11:38 六轮 PM 决策与第十三至十九轮研究轮均已锁定「10-15 既定事项不变、只做证据加固与顺位确认，不再引入新候选」；10-15 今日按既定执行：① 10-14 七交付 QA 兜底（04:35 执行轮已通过：七 slug 全 200、主脚本全 200、部署健康）；② 10-16 思维导图新品类准备（技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案，预研结论已就绪）；10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）。

**选定：今日无新开发任务（收官确认轮）** — 三个调研候选中，无一项可立项：
- **思维导图 [WPS]：顺位锁定，不提前**。10-16 首选新品类；第十九轮付费墙口径再确认（异次元 2026-10-14 超级会员 200+ 权益口径未动、「套娃式收费」叙事续存）顺位不动。13:37 立项中难度任务会挤占新品类准备日，违反节奏纪律与 11:38 决策。
- **表格拆分（按列拆分多表）[WPS]：顺位不动，不提前透支**。10-16/17 备选、「表格工具」品类开山之作，按既定定序执行；360doc 2025-12-27 按人员拆分教学文 + GitHub EXE 桌面应用（社区解法有下载门槛）差异化优势已确立，抓紧靠定序交付、不靠提前透支。
- **表格合并（多文件/多表合一）[WPS]：已批准，顺位锁定**。10-16/17 备选、节奏调节位、与表格拆分互链「拆分↔合并」旅程线；归属「表格工具」品类（10-16 起范畴），今日提前开发违反专题周品类口径。

**交付核对**：立候选前已 `grep tools/categories.go` 全量核对（70 个已注册 Path），思维导图、表格拆分、表格合并三项均无重叠（Path 层无 mind/map/脑图字样；`merge`/`split` 字样仅出现在 PDF/图片工具的名称描述中，不冲突）；工作树两个未跟踪文件（`toolWeb.bak-prev`、`toolweb`）为既知调研无关文件，本轮未动。

**决策理由**：
1. 口径延续：01:00、04:18、05:49、07:42、09:00、11:38 六轮 PM 决策均立「收官不再立项」；第十三至十九轮研究轮均自定「只做证据加固、顺位确认」。本轮若反转立项，等于把开发债务滚到准备日。
2. 节奏纪律：10-14 单日交付七个工具（专题周单日最高密度）；10-15 既定为 QA 兜底 + 10-16 新品类准备日，再立项会让开发轮侵占准备日。
3. 定序锁定：10-16 起排期最终定序（思维导图首选 → 表格拆分备选 → 表格合并备选）已由六轮 PM 决策 + 七轮研究轮锁定，第十九轮无新信号动摇（仅证据加固：超级会员 200+ 权益口径未动、「套娃收费」叙事续存、表格拆分需求侧实证），无需变更。

**规格**：
1. 本轮无开发/评审/测试/部署/QA 工作量；管线本轮以 PM 决策闭环。
2. 今日既定事项不变：① 10-14 七交付 QA 兜底已通过（04:35 执行轮）；② 10-16 思维导图新品类准备（技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案）；③ 表格拆分技术预研可顺带启动（不算任务、只算准备）。
3. 10-16 起排期最终定序锁定（见验收标准）。

**验收标准**：
- [ ] 本决策已写入 BACKLOG.md 顶部「今日任务」小节并提交开发分支
- [ ] 10-16 起排期最终定序锁定不变：思维导图首选、表格拆分备选、表格合并备选（节奏调节位）
- [ ] 10-15 按既定执行：10-14 七交付 QA 兜底（已通过）+ 10-16 新品类准备，无新增开发债务

**预计改动文件**：`BACKLOG.md`（本小节）。

## 今日任务（2026-10-15 13:00 · 产品调研员研究轮 ✅）

**交付状态**：收官纪律延续（第十九轮研究）。本轮只做证据加固、顺位确认，不引入新候选——10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；10-15 今日按既定执行 QA 兜底（04:35 七交付复核已通过）+ 10-16 新品类准备（思维导图自绘 SVG + 导出链 + 草稿方案预研结论已就绪），无新增开发债务。

**本轮三件事**（13:00 全网调研，证据加固轮）：
1. 思维导图付费墙再确认：异次元 iplaysoft 2026-10-14 更新页（1 天前，1 小时前重新抓取）——超级会员 200+ 权益口径未动，大会员 = 超级会员全部权益 + WPS AI 功能；新浪科技 2025-11-09 促销文「具备 PDF 编辑和思维导图功能」连续出现（付费墙五重实锤续存）；免费替代要么装客户端要么走 AI 账号/国外服务，10-16 首选新品类顺位不动。
2. 「套娃式收费」叙事续存：网易订阅「WPS，鸡同鸭讲」（画画，约 100 天前）——会员体系从普通会员一路套娃到稻壳/超级/超级Pro/AI会员/大会员，中途穿插 PDF/云盘/图片/模板独立小包；个人年费 69 元 → 148 元起 → 大会员 348 元/年原价；金山办公 2026-07-06 声明三句话（免费功能不收费、会员权益不上移、高成本服务按需购买）被指「用规则回答情绪」错位回应。口径合规注意：引用只陈述可验证事实。「不用开 WPS 会员」传播卖点继续有效。
3. 表格拆分需求侧实证 + 本地化差异化再确认：360doc 2025-12-27「Excel不加班」——按人员拆分表格（筛选 → 按分类导出）教学文，拆分是职场高频刚需（统计业绩、按人员拆分、创建超链接三联需求）；V2EX 拆分神器（上传+云端异步）为已知信号；GitHub huxinji/excel-split-merge-studio（2026-07-31 创建，Excel 拆分/合并/对账桌面应用，Python 打包 EXE 分发）属同类证据——社区解法是桌面端 EXE（有下载门槛），网页端「免下载、免账号、本地处理」空位继续存在。

**交付核对**：立候选前已 `grep tools/categories.go` 全量核对（70 个已注册 Path），思维导图、表格拆分、表格合并三项均无重叠（`merge`/`split` 字样仅出现在 PDF 品类 `pdf_merge_split`、`image-to-excel` 为图片→Excel 品类，均不冲突）。

**推荐 Top3**（10-16 起排期最终建议，顺位锁定；努力度为单页前端交付量级评估）：

1. **思维导图 [WPS]** — P1（10-16 起首选新品类，顺位不动）：付费墙五重实锤（新浪财经 2025-05/2025-11「思维导图权益包」、异次元 2026-10-14 超级会员 200+ 权益口径未动、刻度财经「脑图转 PPT」划入大会员专属、新浪科技 2025-11-09 促销文再明列）；04:35 预研已定技术路线（零依赖自绘 SVG + 导出 PNG/SVG/Markdown + localStorage 草稿）。难度中。SEO：思维导图、在线思维导图、免费思维导图。
2. **表格拆分（按列拆分多表）[WPS]** — P1（10-16/17 备选，开「表格工具」品类，顺位不动）：WPS 表格「拆分表格」VIP 实锤（360doc 2025-12-09）；V2EX 拆分神器与 GitHub EXE 桌面应用均走云端/桌面路线（ToolWeb 差异化本地处理免账号）；SheetJS + JSZip 在栈。难度中。SEO：Excel拆分、表格按列拆分、Excel按列拆分、Excel分表。
3. **表格合并（多文件/多表合一）[WPS]** — P1（10-16/17 备选，节奏调节位，顺位不动）：付费墙双重实锤（360doc 2025-10-29「以前都是借助WPS会员才可以合并」+ php.cn「智能工具箱 → 工作簿 → 合并」会员流程）；与表格拆分互链「拆分↔合并」旅程线、同开「表格工具」品类。难度小。SEO：Excel合并、表格合并、多个Excel合并、合并工作表。

**候选表状态**（2026-10-15 13:00 第十九轮；无新候选、无顺位变化、无归档变动；沿用第十四轮 WPS 候选表）：本轮新增信号均为证据加固——异次元 2026-10-14 超级会员 200+ 权益口径未动（付费墙续存）、网易订阅「套娃收费」叙事续存（年费涨价轨迹 + 声明错位回应）、360doc 2025-12-27 按人员拆分表格教学文（需求侧实证）+ GitHub EXE 桌面应用（社区解法有下载门槛，网页端空位续存）。

**归档说明**：第十九轮为 10-15 收官日第八轮研究——无新候选、无顺位变化，10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；仓库 70 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环；10-15 今日按既定执行 QA 兜底 + 10-16 新品类准备，无新增开发债务。

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

## 今日任务（2026-10-15 11:38 · 产品经理排期确认 ✅）

**交付状态**：收官确认轮（第十八轮研究 11:36 之后的产品经理排期确认）。本轮不立项新开发任务——01:00、04:18、05:49、07:42、09:00 五轮 PM 决策与第十三至十八轮研究轮均已锁定「10-15 既定事项不变、只做证据加固与顺位确认，不再引入新候选」；10-15 今日按既定执行：① 10-14 七交付 QA 兜底（04:35 执行轮已通过：七 slug 全 200、主脚本全 200、部署健康）；② 10-16 思维导图新品类准备（技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案，预研结论已就绪）；10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）。

**选定：今日无新开发任务（收官确认轮）** — 三个调研候选中，无一项可立项：
- **思维导图 [WPS]：顺位锁定，不提前**。10-16 首选新品类；第十八轮五重实锤（异次元 2026-10-14 超级会员 200+ 权益口径未动 + 新浪科技 2025-11-09 促销文再明列 + 三言科技「套娃式收费」叙事助攻）再确认顺位。11:38 立项中难度任务会挤占新品类准备日，违反节奏纪律与 09:00 决策。
- **表格拆分（按列拆分多表）[WPS]：顺位不动，不提前透支**。10-16/17 备选、「表格工具」品类开山之作，按既定定序执行；本地化差异化（浏览器本地处理、不上传、免账号）优势靠定序交付抓紧、不靠提前透支。
- **表格合并（多文件/多表合一）[WPS]：已批准，顺位锁定**。10-16/17 备选、节奏调节位、与表格拆分互链「拆分↔合并」旅程线；归属「表格工具」品类（10-16 起范畴），今日提前开发违反专题周品类口径。

**交付核对**：立候选前已 `grep tools/categories.go` 全量核对（70 个已注册 Path），思维导图、表格拆分、表格合并三项均无重叠（Path 层无 mind/map/脑图字样；仅 `image-to-excel` 为图片→Excel 品类、名称描述含 Excel，不冲突）。

**决策理由**：
1. 口径延续：01:00、04:18、05:49、07:42、09:00 五轮 PM 决策均立「收官不再立项」；第十三至十八轮研究轮均自定「只做证据加固、顺位确认」。本轮若反转立项，等于把开发债务滚到准备日。
2. 节奏纪律：10-14 单日交付七个工具（专题周单日最高密度）；10-15 既定为 QA 兜底 + 10-16 新品类准备日（思维导图技术路线复核、导出链预研、草稿方案；表格拆分顺带预研），再立项会让开发轮侵占准备日。
3. 定序锁定：10-16 起排期最终定序（思维导图首选 → 表格拆分备选 → 表格合并备选）已由五轮 PM 决策 + 六轮研究轮锁定，第十八轮无新信号动摇（仅证据加固：超级会员 200+ 权益口径未动、「套娃式收费」叙事），无需变更。

**规格**：
1. 本轮无开发/评审/测试/部署/QA 工作量；管线本轮以 PM 决策闭环。
2. 今日既定事项不变：① 10-14 七交付 QA 兜底已通过（04:35 执行轮）；② 10-16 思维导图新品类准备（技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案）；③ 表格拆分技术预研可顺带启动（不算任务、只算准备）。
3. 10-16 起排期最终定序锁定（见验收标准）。

**验收标准**：
- [ ] 本决策已写入 BACKLOG.md 顶部「今日任务」小节并提交开发分支
- [ ] 10-16 起排期最终定序锁定不变：思维导图首选、表格拆分备选、表格合并备选（节奏调节位）
- [ ] 10-15 按既定执行：10-14 七交付 QA 兜底（已通过）+ 10-16 新品类准备，无新增开发债务

**预计改动文件**：`BACKLOG.md`（本小节）。

## 今日任务（2026-10-15 11:36 · 产品调研员研究轮 ✅）

**交付状态**：收官纪律延续（第十八轮研究）。本轮只做证据加固、顺位确认，不引入新候选——10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；10-15 今日按既定执行 QA 兜底 + 10-16 新品类准备，无新增开发债务。

**本轮三件事**（11:36 全网调研，证据加固轮）：
1. 思维导图付费墙再确认：异次元 2026-10-14 更新页（1 天前，2 小时前重新抓取）确认超级会员 200+ 权益口径未动；新浪科技 2025-11-09 促销文「具备 PDF 编辑和思维导图功能」连续出现（付费墙五重实锤续存）；免费替代要么装客户端要么走 AI 账号/国外服务，10-16 首选新品类顺位不动。
2. 「套娃式收费」叙事再加固：三言科技（新浪科技 2026-06-25，1 小时前重新抓取）——批量一键清理缓存划入会员专属（WPS 官方客服口径）、会员层级普通会员→稻壳会员→超级会员→超级会员Pro→AI会员→大会员 + PDF/云盘/图片/模板独立付费套餐；超级会员连续包年 105 元/年、大会员 158 元/年（价差超 50 元）；金山办公 2026-07-06 官方声明「免费功能不收费、会员权益不上移、高成本服务按需购买」属已知口径（第十三轮已记），引用只陈述可验证事实。「不用开 WPS 会员」传播卖点继续有效。
3. 表格拆分/合并付费墙再确认 + 通用痛点侧无新晋候选：360doc 2025-12-09「WPS表格：右键 → 拆分表格 → 按内容拆分，这个功能是VIP」；php.cn「智能工具箱 → 工作簿 → 合并」会员流程；V2EX 泛搜索本轮未发现可单页落地、热度超越锁定三项的新痛点；OCR 侧 vocal.media 营销文称 WPS 内置 OCR（非付费墙实锤；OCR 相关候选 10-14 已交付归档，不引入新候选）。

**交付核对**：立候选前已 `grep tools/categories.go` 全量核对（70 个已注册 Path），思维导图、表格拆分、表格合并三项均无重叠（Path 层无 mind/map/脑图字样；split/merge/excel/xlsx/sheet/table 无 Path 命中；`merge`/`split` 字样仅出现在 PDF/图片工具的名称描述中，不冲突）。

**推荐 Top3**（10-16 起排期最终建议，顺位锁定；努力度为单页前端交付量级评估）：

1. **思维导图 [WPS]** — P1（10-16 起首选新品类，顺位不动）：付费墙五重实锤（新浪财经 2025-05/2025-11「思维导图权益包」、异次元 2026-10-14 超级会员 200+ 权益、刻度财经「脑图转 PPT」划入大会员专属、新浪科技 2025-11-09 促销文再明列）；04:35 预研已定技术路线（零依赖自绘 SVG + 导出 PNG/SVG/Markdown + localStorage 草稿）。难度中。SEO：思维导图、在线思维导图、免费思维导图。
2. **表格拆分（按列拆分多表）[WPS]** — P1（10-16/17 备选，开「表格工具」品类，顺位不动）：WPS 表格「拆分表格」VIP 实锤（360doc 2025-12-09）；V2EX 拆分神器与 GroupDocs 均走云端路线（ToolWeb 差异化本地处理免账号）；SheetJS + JSZip 在栈。难度中。SEO：Excel拆分、表格按列拆分、Excel按列拆分、Excel分表。
3. **表格合并（多文件/多表合一）[WPS]** — P1（10-16/17 备选，节奏调节位，顺位不动）：付费墙双重实锤（360doc 2025-10-29「以前都是借助WPS会员才可以合并」+ php.cn「智能工具箱 → 工作簿 → 合并」会员流程）；与表格拆分互链「拆分↔合并」旅程线、同开「表格工具」品类。难度小。SEO：Excel合并、表格合并、多个Excel合并、合并工作表。

**候选表状态**（2026-10-15 11:36 第十八轮；无新候选、无顺位变化、无归档变动；沿用第十四轮 WPS 候选表）：本轮新增信号均为证据加固——异次元 2026-10-14 超级会员 200+ 权益口径未动（付费墙续存）、三言科技「被WPS背刺了」+ 套娃收费口径（1 小时前重抓取）、WPS 官方声明已知口径、拆分 VIP/合并会员流程再确认。

**归档说明**：第十八轮为 10-15 收官日第七轮研究——无新候选、无顺位变化，10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；仓库 70 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环；10-15 今日按既定执行 QA 兜底 + 10-16 新品类准备，无新增开发债务。

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

## 今日任务（2026-10-15 09:00 · 产品经理排期确认 ✅）

**交付状态**：收官确认轮（第十八轮决策，第十七轮研究 09:36 之后的产品经理排期确认）。本轮不立项新开发任务——01:00、04:18、05:49、07:42 四轮 PM 决策与第十三至十七轮研究轮均已锁定「10-15 既定事项不变、只做证据加固与顺位确认，不再引入新候选」；10-15 今日按既定执行：① 10-14 七交付 QA 兜底（04:35 执行轮已通过：七 slug 全 200、主脚本全 200、部署健康）；② 10-16 思维导图新品类准备（技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案，预研结论已就绪）；10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）。

**选定：今日无新开发任务（收官确认轮）** — 三个调研候选中，无一项可立项：
- **思维导图 [WPS]：顺位锁定，不提前**。10-16 首选新品类；第十七轮五重实锤（新浪财经 2025-05/2025-11「思维导图权益包」、异次元 2026-10-14 超级会员 200+ 权益、刻度财经「脑图转 PPT」划入大会员专属、新浪科技 2025-11-09 促销文再明列）再确认顺位。09:00 立项中难度任务会把开发轮拖进 10-15 剩余时段，挤占新品类准备日，违反节奏纪律与 07:42 决策。
- **表格拆分（按列拆分多表）[WPS]：顺位不动，不提前透支**。10-16/17 备选、「表格工具」品类开山之作，按既定定序执行；V2EX 拆分神器云端路线差异化优势已确立，抓紧靠定序交付、不靠提前透支。
- **表格合并（多文件/多表合一）[WPS]：已批准，顺位锁定**。10-16/17 备选、节奏调节位、与表格拆分互链「拆分↔合并」旅程线；归属「表格工具」品类（10-16 起范畴），今日提前开发违反专题周品类口径。

**交付核对**：立候选前已 `grep tools/categories.go` 全量核对（70 个已注册 Path），思维导图、表格拆分、表格合并三项均无重叠（`merge` 字样仅出现在 PDF 品类 `pdf_merge_split`、`image-to-excel` 为图片→Excel 品类，均不冲突）。

**决策理由**：
1. 口径延续：01:00、04:18、05:49、07:42 四轮 PM 决策均立「收官不再立项」；第十三至十七轮研究轮均自定「只做证据加固、顺位确认」。本轮若反转立项，等于把开发债务滚到准备日。
2. 节奏纪律：10-14 单日交付七个工具（专题周单日最高密度）；10-15 既定为 QA 兜底 + 10-16 新品类准备日，再立项会让开发轮侵占准备日。
3. 定序锁定：10-16 起排期最终定序（思维导图首选 → 表格拆分备选 → 表格合并备选）已由四轮 PM 决策 + 五轮研究轮锁定，第十七轮无新信号动摇（仅证据加固：360doc 2026-01-01 无会员用户合并需求实证、网易订阅 AI 会员独立计费口径），无需变更。

**规格**：
1. 本轮无开发/评审/测试/部署/QA 工作量；管线本轮以 PM 决策闭环。
2. 今日既定事项不变：① 10-14 七交付 QA 兜底已通过（04:35 执行轮）；② 10-16 思维导图新品类准备（技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案）；③ 表格拆分技术预研可顺带启动（不算任务、只算准备）。
3. 10-16 起排期最终定序锁定（见验收标准）。

**验收标准**：
- [ ] 本决策已写入 BACKLOG.md 顶部「今日任务」小节并提交开发分支
- [ ] 10-16 起排期最终定序锁定不变：思维导图首选、表格拆分备选、表格合并备选（节奏调节位）
- [ ] 10-15 按既定执行：10-14 七交付 QA 兜底（已通过）+ 10-16 新品类准备，无新增开发债务

**预计改动文件**：`BACKLOG.md`（本小节）。

> 维护人：产品调研员 · 每日更新（2026-10-15 09:36 第十七轮研究）

## 今日任务（2026-10-15 09:36 · 产品调研员研究轮 ✅）

**交付状态**：收官纪律延续（第十七轮研究）。本轮只做证据加固、顺位确认，不引入新候选——10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；10-15 今日按既定执行 QA 兜底（04:35 七交付复核已通过）+ 10-16 新品类准备（思维导图自绘 SVG + 导出链 + 草稿方案预研结论已就绪），无新增开发债务。

**本轮三件事**（09:36 全网调研，证据加固轮）：
1. 表格合并痛点新增实证：360doc 2026-01-01 社区案例——「没有会员权限的他，急需一个高效且免费的工具来完成这项任务」，合并需求与无会员身份直接挂钩；社区现有解法是 Python 打包 EXE 分发（要下载要装、有门槛），网页端「免下载、免账号、本地处理」空位继续存在。表格合并难度小、节奏调节位顺位不动。
2. WPS 会员叙事侧再确认：网易订阅「WPS的转型阵痛不应由用户买单」（约 93 天前）——AI 写作/排版/数据分析等能力被划入 AI 会员（248 元/年）、大会员（348 元/年）独立计费，叠加 PDF/云盘独立小包散落产品各处；豆包付费版 Office 与腾讯元宝 AI 免费路线并存——AI 路线正在向「干活能力收费」分化，ToolWeb 纯前端单页「免费、免账号、本地处理、不上传」错位生存线继续有效，不动锁定三项。
3. 通用痛点侧无新晋候选：V2EX 拆分神器（t/1206250）与 GroupDocs 拆分器均为已知信号（上传/云端处理路线），本轮无可单页落地、热度超越锁定三项的新痛点；WPS 官方 2026-07-06「免费功能不收费、会员权益不上移」声明属已知口径（第十三轮已记），引用只陈述可验证事实。

**交付核对**：立候选前已 `grep tools/categories.go` 全量核对，思维导图、表格拆分、表格合并三项均无重叠（仓库无 mind-map 类工具、无 spreadsheet 拆分/合并工具；`pdf_merge_split` 为 PDF 品类、`img_stitch` 为图片品类，均不冲突）。

**推荐 Top3**（10-16 起排期最终建议，顺位锁定；努力度为单页前端交付量级评估）：

1. **思维导图 [WPS]** — P1（10-16 起首选新品类，顺位不动）：付费墙五重实锤（新浪财经 2025-05/2025-11「思维导图权益包」、异次元 2026-10-14 超级会员 200+ 权益、刻度财经「脑图转 PPT」划入大会员专属、新浪科技 2025-11-09 促销文再明列）；04:35 预研已定技术路线（零依赖自绘 SVG + 导出 PNG/SVG/Markdown + localStorage 草稿）。难度中。SEO：思维导图、在线思维导图、免费思维导图。
2. **表格拆分（按列拆分多表）[WPS]** — P1（10-16/17 备选，开「表格工具」品类，顺位不动）：WPS 表格「拆分表格」VIP 实锤（360doc 2025-12-09）；V2EX 拆分神器与 GroupDocs 均走云端路线（ToolWeb 差异化本地处理免账号）；SheetJS + JSZip 在栈。难度中。SEO：Excel拆分、表格按列拆分、Excel按列拆分、Excel分表。
3. **表格合并（多文件/多表合一）[WPS]** — P1（10-16/17 备选，节奏调节位，顺位不动）：付费墙双重实锤（360doc 2025-10-29「以前都是借助WPS会员才可以合并」+ php.cn「智能工具箱 → 工作簿 → 合并」会员流程）+ 本轮新增需求侧实证（360doc 2026-01-01「没有会员权限的他，急需高效免费工具」；社区 EXE 分发有下载门槛，网页端免下载有空位）；与表格拆分互链「拆分↔合并」旅程线、同开「表格工具」品类。难度小。SEO：Excel合并、表格合并、多个Excel合并、合并工作表。

**候选表状态**（2026-10-15 09:36 第十七轮；无新候选、无顺位变化、无归档变动；沿用第十四轮 WPS 候选表）：本轮新增信号均为证据加固——360doc 2026-01-01 社区无会员用户急需免费合并工具（痛点实证 + EXE 门槛对比）、网易订阅 AI 会员/大会员独立计费口径（AI 路线收费分化确认）、WPS 官方声明口径已知无新意。

**归档说明**：第十七轮为 10-15 收官日第六轮研究——无新候选、无顺位变化，10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；仓库工具注册表核对无重叠，核稿反馈（立候选前先 grep）持续闭环；10-15 今日按既定执行 QA 兜底 + 10-16 新品类准备，无新增开发债务。

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

## 今日任务（2026-10-15 07:42 · 产品经理排期确认 ✅）

**交付状态**：收官确认轮（第十六轮研究 07:00 之后的产品经理排期确认）。本轮不立项新开发任务——01:00、04:18、05:49 三轮 PM 决策与第十三/十四/十五/十六轮研究轮均已锁定「10-15 既定事项不变、只做证据加固与顺位确认，不再引入新候选」；10-15 今日按既定执行：① 10-14 七交付 QA 兜底（04:35 执行轮已通过：七 slug 全 200、主脚本全 200、部署健康）；② 10-16 思维导图新品类准备（技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案，预研结论已就绪）；10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）。

**选定：今日无新开发任务（收官确认轮）** — 三个调研候选中，无一项可立项：
- **思维导图 [WPS]：顺位锁定，不提前**。10-16 首选新品类；第十六轮五重实锤（新京报快评「被WPS背刺了」热搜叙事助攻）再确认顺位。07:42 立项中难度任务会挤占新品类准备日，违反节奏纪律。
- **表格拆分（按列拆分多表）[WPS]：顺位不动，不提前透支**。10-16/17 备选、「表格工具」品类开山之作，按既定定序执行；豆包付费版 Office / 腾讯元宝 AI 免费路线压力靠定序交付抓紧、不靠提前透支。
- **表格合并（多文件/多表合一）[WPS]：已批准，顺位锁定**。10-16/17 备选、接替长图拼接顺延位、节奏调节位；归属「表格工具」品类（10-16 起范畴），今日提前开发违反专题周品类口径。

**交付核对**：立候选前已 `grep tools/categories.go` 全量核对（70 个已注册 Path），思维导图、表格拆分、表格合并三项均无重叠（`merge`/`split` 字样仅出现在 PDF 品类 `pdf_merge_split` 与图片品类 `img_stitch` 的名称描述中，不冲突）。

**决策理由**：
1. 口径延续：01:00、04:18、05:49 三轮 PM 决策均立「收官不再立项」；第十三至十六轮研究轮均自定「只做证据加固、顺位确认」。本轮若反转立项，等于把开发债务滚到准备日。
2. 节奏纪律：10-14 单日交付七个工具（专题周单日最高密度）；10-15 既定为 QA 兜底 + 10-16 新品类准备日，再立项会让开发轮侵占准备日。
3. 定序锁定：10-16 起排期最终定序（思维导图首选 → 表格拆分备选 → 表格合并备选）已由多轮 PM 决策 + 四轮研究轮锁定，第十六轮无新信号动摇（仅证据加固），无需变更。

**规格**：
1. 本轮无开发/评审/测试/部署/QA 工作量；管线本轮以 PM 决策闭环。
2. 今日既定事项不变：① 10-14 七交付 QA 兜底已通过（04:35 执行轮）；② 10-16 思维导图新品类准备（技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案）；③ 表格拆分技术预研可顺带启动（不算任务、只算准备）。
3. 10-16 起排期最终定序锁定（见验收标准）。

**验收标准**：
- [ ] 本决策已写入 BACKLOG.md 顶部「今日任务」小节并提交开发分支
- [ ] 10-16 起排期最终定序锁定不变：思维导图首选、表格拆分备选、表格合并备选（节奏调节位）
- [ ] 10-15 按既定执行：10-14 七交付 QA 兜底（已通过）+ 10-16 新品类准备，无新增开发债务

**预计改动文件**：`BACKLOG.md`（本小节）。

## 今日任务（2026-10-15 07:00 · 产品调研员研究轮 ✅）

**交付状态**：收官纪律延续（第十六轮研究）。本轮只做证据加固、顺位确认，不引入新候选——10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；10-15 今日按既定执行 QA 兜底（04:35 七交付复核已通过）+ 10-16 新品类准备（思维导图自绘 SVG + 导出链 + 草稿方案预研结论已就绪），无新增开发债务。

**本轮三件事**（07:00 全网调研，证据加固轮）：
1. 「天下苦会员久矣」叙事侧再验证：新京报快评「清理缓存还要收费」——话题「被WPS背刺了」登上微博热搜，批量清理缓存被设为会员专属功能（WPS 官方客服口径）；金山办公 2026-07-06 官方声明「免费功能不收费、会员权益不上移」反驳「滥收费」说——争议双方都落在同一事实上：「基础 vs 增值」的边界就是会员墙。口径合规注意：引用时只陈述可验证事实。「不用开 WPS 会员」传播卖点继续有效。
2. AI 路线竞争格局再确认：象先志（网易订阅）「豆包收费版，正把WPS逼近死角」——豆包付费版内置能生成、能编辑、能导出的 Office（一句话生成+在线改+套模板+无水印导出），正面冲击 WPS 「海量模板、格式兼容」两大留存底牌；且豆包把办公干活能力划入付费三档（标准/加强/专业）——AI 路线正在向「干活能力收费」分化。对 ToolWeb 定位确认：真正的大竞品压力来自 AI 侧，纯前端单页工具的「免费、免账号、本地处理、不上传」是另一条错位生存线；不影响锁定三项顺位（免登录轻量拆分/合并/脑图的本地替代位依然有空位）。
3. 拆分↔合并旅程线再验证 + 本地化差异化延续：V2EX「免费 Excel 拆分神器」（data.lwwlkeji.com，按列拆分自动分组打包，上传+异步云端处理）；GroupDocs 在线 Excel 拆分（服务器端处理）；CSDN 2025-10-15 拆分合并合一文（满一年仍被引）。现有免费路线均要上传文件 → ToolWeb 浏览器本地处理差异化继续成立。

**交付核对**：立候选前已 `grep tools/categories.go` 全量核对（70 个已注册 Path），思维导图、表格拆分、表格合并三项均无重叠；另见工作区内有与调研无关的未跟踪文件（`toolWeb.bak-prev`、`toolweb`）及 `go.sum` 改动，非本轮操作，未动。

**推荐 Top3**（10-16 起排期最终建议，顺位锁定；努力度为单页前端交付量级评估）：

1. **思维导图 [WPS]** — P1（10-16 起首选新品类，顺位不动）：付费墙五重实锤（新浪财经 2025-05/2025-11「思维导图权益包」、异次元 2026-10-14 超级会员 200+ 权益、刻度财经「脑图转 PPT」划入大会员专属、新浪科技 2025-11-09 促销文再明列）；04:35 预研已定技术路线（零依赖自绘 SVG + 导出 PNG/SVG/Markdown + localStorage 草稿）。难度中。SEO：思维导图、在线思维导图、免费思维导图。
2. **表格拆分（按列拆分多表）[WPS]** — P1（10-16/17 备选，开「表格工具」品类，顺位不动）：WPS 表格「拆分表格」VIP 实锤（360doc 2025-12-09）；V2EX 拆分神器与 GroupDocs 均走云端路线（ToolWeb 差异化本地处理免账号）；腾讯元宝 AI 免费路线与豆包付费版办公能力并存 → 抓紧交付免登录轻量工具；SheetJS + JSZip 在栈。难度中。SEO：Excel拆分、表格按列拆分、Excel按列拆分、Excel分表。
3. **表格合并（多文件/多表合一）[WPS]** — P1（10-16/17 备选，节奏调节位，顺位不动）：付费墙双重实锤（360doc 2025-10-29「以前都是借助WPS会员才可以合并」+ php.cn「智能工具箱 → 工作簿 → 合并」会员流程）；与表格拆分互链「拆分↔合并」旅程线、同开「表格工具」品类。难度小。SEO：Excel合并、表格合并、多个Excel合并、合并工作表。

**候选表状态**（2026-10-15 07:00 第十六轮；无新候选、无顺位变化、无归档变动；沿用第十四轮 WPS 候选表）：本轮新增信号均为证据加固——「被WPS背刺了」热搜（新京报快评：批量清理缓存划入会员付费区）、豆包付费版内置 Office 逼近 WPS（AI 路线向「干活能力收费」分化）、V2EX/GroupDocs 云端拆分路线再确认本地化差异化。

**归档说明**：第十六轮为 10-15 收官日第五轮研究——无新候选、无顺位变化，10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；仓库 70 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环；10-15 今日按既定执行 QA 兜底 + 10-16 新品类准备，无新增开发债务。

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

## 今日任务（2026-10-15 05:49 · 产品经理决策 ✅）

**交付状态**：收官决策延续（第十六轮决策）。本轮不立项新开发任务——01:00、04:18 两轮 PM 排期确认轮与第十三/十四/十五轮研究轮均已定为「只做证据加固、顺位确认，不再引入新候选」；10-14 七交付 QA 兜底已通过（04:35 执行轮：七 slug 全 200、脚本全 200、部署状态健康，无异常）；10-16 思维导图新品类预研结论已就绪（零依赖自绘 SVG + 导出链 PNG/SVG/Markdown + localStorage 草稿方案）。本轮为 05:49 产品经理排期确认轮，确认两件事：① 10-15 今日既定事项不变：QA 兜底已完成 → 10-16 思维导图新品类准备（技术路线复核、导出链预研、草稿方案）；② 10-16 起排期最终定序锁定不变：思维导图首选新品类 → 表格拆分备选 → 表格合并备选（节奏调节位）。

**选定：今日无新开发任务（收官确认轮）** — 三个调研候选中，无一项可立项：
- **思维导图 [WPS]：顺位锁定，不提前**。10-16 首选新品类；第十五轮五重实锤（新增 360doc 2026-01-12「别再乱买 WPS 会员了」叙事助攻）再确认顺位。05:49 立项中难度任务会把开发轮拖进 10-15 剩余时段，挤占新品类准备日，违反节奏纪律。
- **表格拆分（按列拆分多表）[WPS]：顺位不动，不提前透支**。同为 10-16/17 备选、「表格工具」品类开山之作，按既定定序执行；腾讯元宝 AI 免费路线压力靠定序交付抓紧、不靠提前透支。
- **表格合并（多文件/多表合一）[WPS]：已批准，顺位锁定**。21:00 PM 决策已批准其为 10-16/17 备选、接替长图拼接顺延位、节奏调节位；归属「表格工具」品类（10-16 起范畴），今日提前开发违反专题周品类口径。

**决策理由**：
1. 口径延续：23:39、01:00、04:18 三轮 PM 决策均立「收官不再立项」；第十三、十四、十五轮研究轮均自定「只做证据加固、顺位确认」。本轮若反转立项，等于把开发债务滚到准备日。
2. 节奏纪律：10-14 单日交付七个工具，为专题周单日最高密度；10-15 既定为 QA 兜底 + 10-16 新品类准备日（思维导图技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案；表格拆分 SheetJS 版本确认等顺带预研），再立项会让开发轮侵占准备日。
3. 定序锁定：10-16 起排期最终定序（思维导图首选 → 表格拆分备选 → 表格合并备选）已由三轮 PM 决策 + 三轮研究轮锁定，第十五轮无新信号动摇（仅证据加固），无需变更。

**规格**：
1. 本轮无开发/评审/测试/部署/QA 工作量；管线本轮以 PM 决策闭环。
2. 今日既定事项不变：① 10-14 七交付 QA 兜底已通过（04:35 执行轮）；② 10-16 思维导图新品类准备（技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案）；③ 表格拆分技术预研可顺带启动（不算任务、只算准备）。
3. 10-16 起排期最终定序锁定（见验收标准）。

**验收标准**：
- [ ] 本决策已写入 BACKLOG.md 顶部「今日任务」小节并提交开发分支
- [ ] 10-16 起排期最终定序锁定不变：思维导图首选、表格拆分备选、表格合并备选（节奏调节位）
- [ ] 10-15 按既定执行：10-14 七交付 QA 兜底（已通过）+ 10-16 新品类准备，无新增开发债务

**预计改动文件**：`BACKLOG.md`（本小节）。

## 今日任务（2026-10-15 05:36 · 产品调研员研究轮 ✅）

**交付状态**：收官纪律延续（第十五轮研究）。本轮只做证据加固、顺位确认，不引入新候选——10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；10-15 今日按既定执行 QA 兜底（10-14 七交付）+ 10-16 新品类准备，无新增开发债务。

**本轮三件事**（05:36 全网调研，证据加固轮）：
1. 「天下苦会员久矣」叙事侧再验证：360doc 2026-01-12「别再乱买WPS会员了」——「WPS好多功能都需要办会员才可以使用……处处需要会员，就一个简单的模板都需要」；作者推荐免费、无需注册、无广告的在线 PDF 工具作替代。「不用开 WPS 会员」传播卖点继续有效，ToolWeb「免广告、免账号、本地处理、不上传」差异化位已被多轮证据印证；模板类属 P3 形态不符（已降权），无顺位变化。
2. 表格拆分/合并竞品路线再确认：V2EX「免费 Excel 拆分神器」（上传+云端异步处理）、GroupDocs 在线 Excel 拆分/合并（服务器端处理）——现有免费路线均要上传文件。ToolWeb 差异化「浏览器本地处理、不上传、免账号」继续成立，与 V2EX「wps 不但要登录还要会员，偶尔一用太麻烦」痛点同构。
3. 拆分↔合并旅程线再验证：CSDN 2025-10-15 拆分合并合一文（满一年仍被引）把「拆分多 Sheet」与「合并多表格式错乱、数据遗漏」放在同一痛点文——拆与合同场景高频共生，支持「拆分↔合并」互链旅程线设计；通用痛点侧无新晋候选。

**交付核对**：立候选前已 `grep tools/categories.go` 全量核对（70 个已注册 Path），思维导图、表格拆分、表格合并三项均无重叠（Path 层无 mind/map/split/merge/excel/xlsx/sheet/table；现有 excel/merge/split 字样仅出现在 PDF/图片工具的名称描述中）。

**推荐 Top3**（10-16 起排期最终建议，顺位锁定；努力度为单页前端交付量级评估）：

1. **思维导图 [WPS]** — P1（10-16 起首选新品类，顺位不动）：付费墙五重实锤（新浪财经 2025-05/2025-11「思维导图权益包」、异次元 2026-10-14 超级会员 200+ 权益、刻度财经「脑图转 PPT」划入大会员专属、新浪科技 2025-11-09 促销文再明列）；04:35 预研已定技术路线（零依赖自绘 SVG + 导出 PNG/SVG/Markdown + localStorage 草稿）。难度中。SEO：思维导图、在线思维导图、免费思维导图。
2. **表格拆分（按列拆分多表）[WPS]** — P1（10-16/17 备选，开「表格工具」品类，顺位不动）：WPS 表格「拆分表格」VIP 实锤（360doc 2025-12-09）；V2EX 拆分神器走云端异步（ToolWeb 差异化本地处理）；SheetJS + JSZip 在栈。难度中。SEO：Excel拆分、表格按列拆分、Excel按列拆分、Excel分表。
3. **表格合并（多文件/多表合一）[WPS]** — P1（10-16/17 备选，节奏调节位，顺位不动）：付费墙双重实锤（360doc 2025-10-29「以前都是借助WPS会员才可以合并」+ php.cn「智能工具箱 → 工作簿 → 合并」会员流程）；与表格拆分互链「拆分↔合并」旅程线、同开「表格工具」品类。难度小。SEO：Excel合并、表格合并、多个Excel合并、合并工作表。

**候选表状态**（2026-10-15 05:36 第十五轮；无新候选、无顺位变化、无归档变动；沿用第十四轮 WPS 候选表）：本轮新增信号均为证据加固——「天下苦会员久矣」（360doc 2026-01-12）、V2EX 拆分神器与 GroupDocs 云端处理路线再确认 ToolWeb 本地化差异化、CSDN 拆分合并合一文再验证拆分↔合并旅程线。

**归档说明**：第十五轮为 10-15 收官日第四轮研究——无新候选、无顺位变化，10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；仓库 70 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环；10-15 今日按既定执行 QA 兜底 + 10-16 新品类准备（04:35 预研结论已就绪），无新增开发债务。

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

## 今日任务（2026-10-15 04:18 · 产品经理决策 ✅）

**交付状态**：收官决策延续。本轮不立项新开发任务——01:00、03:00（第十三/十四轮研究轮）均已定为「只做证据加固、顺位确认，不再引入新候选」；本轮为 04:18 产品经理排期确认轮，确认两件事：① 10-15 今日既定事项不变：10-14 七交付 QA 兜底 + 10-16 思维导图新品类准备；② 10-16 起排期最终定序锁定不变：思维导图首选新品类 → 表格拆分备选（开「表格工具」品类）→ 表格合并备选（节奏调节位，互链「拆分↔合并」旅程线）。

**选定：今日无新开发任务（收官确认轮）** — 三个调研候选中，无一项可立项：
- **思维导图 [WPS]：顺位锁定，不提前**。10-16 首选新品类；第十四轮五重实锤（新增新浪科技 2025-11-09 促销文再明列超级会员含思维导图）再确认顺位。今日立项中难度任务会挤占 QA 兜底 + 新品类准备日，违反节奏纪律。
- **表格拆分（按列拆分多表）[WPS]：顺位不动，不提前透支**。同为 10-16/17 备选、「表格工具」品类开山之作，按既定定序执行；腾讯元宝 AI 免费路线压力靠定序交付抓紧、不靠提前透支。
- **表格合并（多文件/多表合一）[WPS]：已批准，顺位锁定**。21:00 PM 决策已批准其为 10-16/17 备选、接替长图拼接顺延位、节奏调节位；归属「表格工具」品类（10-16 起范畴），今日提前开发违反专题周品类口径。

**决策理由**：
1. 口径延续：19:00、21:00、23:39（10-14）、01:00（10-15）四轮 PM 决策均立「收官不再立项」；第十三、十四轮研究轮均自定「只做证据加固、顺位确认」。本轮若反转立项，等于把开发债务滚到准备日。
2. 节奏纪律：10-14 单日交付七个工具，为专题周单日最高密度；10-15 既定为 QA 兜底 + 10-16 新品类准备日（思维导图技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案；表格拆分 SheetJS 版本确认等顺带预研），再立项会让开发轮侵占准备日。
3. 定序锁定：10-16 起排期最终定序（思维导图首选 → 表格拆分备选 → 表格合并备选）已由四轮 PM 决策 + 两轮研究轮锁定，第十四轮无新信号动摇（仅付费墙第五重实锤，加固顺位），无需变更。

**规格**：
1. 本轮无开发/评审/测试/部署/QA 工作量；管线本轮以 PM 决策闭环。
2. 今日既定事项不变：① 10-14 七交付的 QA 兜底（部署后复核）；② 10-16 思维导图新品类准备（技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案）；③ 表格拆分技术预研可顺带启动（不算任务、只算准备）。
3. 10-16 起排期最终定序锁定（见验收标准）。

**验收标准**：
- [ ] 本决策已写入 BACKLOG.md 顶部「今日任务」小节并提交开发分支
- [ ] 10-16 起排期最终定序锁定不变：思维导图首选、表格拆分备选、表格合并备选（节奏调节位）
- [ ] 10-15 按既定执行：10-14 七交付 QA 兜底 + 10-16 新品类准备，无新增开发债务

**预计改动文件**：`BACKLOG.md`（本小节）。

## 前端开发（2026-10-15 04:35 · 收官确认轮执行记录 ✅）

**执行状态**：本轮无新开发任务、无代码改动；按既定执行两项：① 10-14 七交付 QA 兜底（部署后复核）；② 10-16 思维导图新品类技术预研；③ 表格拆分顺带预研。无新增开发债务。

**① 10-14 七交付 QA 兜底**（公网 https://www.it-tool.eu.cc/tool-web/，qa-all.sh 同口径）：
- 七 slug 全 200、页面 55–61KB、无 `/tools/` 残留链接：image-to-excel / pdf-to-word / docx-repair / pdf-to-ppt / pdf-to-word-batch / ocr-batch / pdf-merge-split
- 主脚本全 200 可加载：image-to-excel.js?v=5、pdf-to-word.js?v=1、docx-repair.js?v=3、pdf-to-ppt.js?v=1、pdf-to-word-batch.js?v=1、ocr-batch.js?v=1、pdf-merge-split.js?v=2、tools-dropdown.js
- 本地服务 127.0.0.1:18082 探活 200
- 结论：七交付部署状态健康，无异常，无需回滚/修复。

**② 10-16 思维导图新品类预研**：
- 技术路线复核：static/js/vendor 无脑图库（仅 docx-9.5.1 / pptxgenjs-3.12.0 / xlsx-0.18.5）。建议**零依赖自绘、SVG 主渲染**（节点即 DOM、可直接点击编辑）：与 ToolWeb 原生 JS + 免账号不上传路线一致，单日可交付；不建议引入第三方脑图库（体积与中文维护不确定性）。
- 导出链 PNG/SVG/Markdown：Markdown = 树→缩进列表纯逻辑函数（沿 ITX-PURE-BEGIN 惯例，Node 可单测）；SVG = XMLSerializer 序列化渲染根 + 内联样式后 Blob 下载；PNG = SVG→Blob URL→new Image→canvas.drawImage→toDataURL（exif-strip/img-stitch 已有 canvas 惯例）。
- localStorage 草稿方案：键名建议 `mindmap_draft_v1`（沿 calendar.js `calendar_schedules` 蛇形惯例）；setItem 包 try/catch 忽略配额异常（沿 random_decision.js 惯例）；数据结构 {id,text,children} 树 JSON，800ms 防抖自动保存 + 手动「清空草稿」；恢复时校验结构、坏数据丢弃。

**③ 表格拆分顺带预研**：
- SheetJS 版本确认：xlsx-0.18.5.umd.js 在 static/js/vendor/（image-to-excel 在用）；加载惯例 = CDN 优先（jsdelivr+unpkg）+ 本地 vendor 兜底（document.currentScript.src 推导，/tools 与 /tool-web 双挂载通用）——表格拆分/合并直接复用。
- JSZip 在栈：pdf-merge-split.js 经 cdnjs 3.10.1 懒加载（ensureLib 惯例，失败降级逐个下载）——表格拆分多文件打包沿用，无需新增 vendor。
- 注册：tools/categories.go 新增 Category「表格工具」（当前 11 个品类）；思维导图届时另开新品类。
- 拆分逻辑路线：XLSX.read(arraybuffer)→按列值分组→aoa_to_sheet→XLSX.write({type:'array'})→JSZip 打包；纯逻辑部分可 Node 单测。

**验收对账**：① 七交付部署健康；② 10-16 思维导图预研结论就绪（自绘 SVG + 导出链 + 草稿方案）；③ 10-16 起排期定序未动（思维导图首选 → 表格拆分备选 → 表格合并备选），无新增开发债务。

## 今日任务（2026-10-15 03:00 · 产品调研员研究轮 ✅）

**交付状态**：收官纪律延续。本轮只做证据加固、顺位确认，不引入新候选——10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；10-15 今日按既定执行 QA 兜底（10-14 七交付）+ 10-16 新品类准备，无新增开发债务。

**本轮三件事**（03:00 全网调研，证据加固轮）：
1. 思维导图付费墙第五重实锤：新浪科技 2025-11-09（约 339 天前）天猫 88VIP 促销文再明列超级会员「具备 PDF 编辑和思维导图功能」——思维导图作为会员卖点连续在新浪财经系促销口径出现（2025-05、2025-11、2026-01-15 脑图转 PPT 划入大会员专属），付费墙证据链继续加固；10-16 首选新品类顺位不动。
2. 「不用开 WPS 会员」叙事侧新鲜助攻：V2EX 近期帖 yasuo.app（浏览器本地压缩，视频/图片/PDF）自荐文里用户痛点直指 WPS——「wps 有这种工具，不但要登录还要会员，偶尔一用太麻烦」；对应工具（PDF 压缩、图片压缩等）ToolWeb 专题周内已交付并支持浏览器本地处理免账号，我方已先占此差异化位；V2EX 另一帖 ps.keepmot.com（纯前端免费拼图/长图拼接/裁剪、免登录高清无水印）印证「纯前端、免账号、不上传」路线在社区被认可，图片拼接类赛道已由 img_stitch 覆盖、不重复立项。
3. 通用痛点侧无新晋候选：V2EX 泛搜索本轮未发现可单页落地、热度超越锁定三项的新痛点；fly63 600+ 工具站「挂广告维持开销」印证免广告差异化叙事有效；口径合规提醒：引用 WPS 套娃收费、黑猫投诉 11000+ 条等第三方评论时只陈述可验证事实。

**交付核对**：立候选前已 `grep tools/categories.go` 全量核对（70 个已注册 Path），思维导图、表格拆分、表格合并三项均无重叠（仓库无 mind-map 类工具、无 spreadsheet 拆分/合并工具；`pdf_merge_split` 为 PDF 品类、`img_stitch` 为图片品类，均不冲突）。

**推荐 Top3**（10-16 起排期最终建议，顺位锁定；努力度为单页前端交付量级评估）：

1. **思维导图 [WPS]** — P1（10-16 起首选新品类，顺位不动）：付费墙五重实锤（新浪财经 2025-05/2025-11「思维导图权益包」、异次元 2026-10-14 超级会员 200+ 权益、刻度财经「脑图转 PPT」划入大会员专属、新浪科技 2025-11-09 促销文再明列超级会员含思维导图）；免费替代要么装客户端要么走 AI 账号/国外服务；纯前端树编辑 + 导出 PNG/SVG/Markdown、localStorage 存草稿免注册。难度中。SEO：思维导图、在线思维导图、免费思维导图。
2. **表格拆分（按列拆分多表）[WPS]** — P1（10-16/17 备选，开「表格工具」品类，顺位不动）：WPS 表格「拆分表格」VIP 实锤（360doc 2025-12-09）；V2EX「免费 Excel 拆分神器」独立验证「按部门/地区列拆分分发」需求（走云端异步，ToolWeb 差异化本地处理免账号）；腾讯元宝 AI 免费路线已出现 → 抓紧；SheetJS + JSZip 在栈。难度中。SEO：Excel拆分、表格按列拆分、Excel按列拆分、Excel分表。
3. **表格合并（多文件/多表合一）[WPS]** — P1（10-16/17 备选，接替长图拼接顺延位，节奏调节位；顺位不动）：付费墙双重实锤（360doc 2025-10-29「以前都是借助WPS会员才可以合并」+ php.cn「智能工具箱 → 工作簿 → 合并」专用会员流程）；CSDN 2025-10-15（满一年仍被引）独立验证合并痛点（格式错乱、数据遗漏）；现有免费方案多为桌面 exe，网页端本地处理有空位；与表格拆分互链形成「拆分↔合并」旅程线、同开「表格工具」品类。难度小。SEO：Excel合并、表格合并、多个Excel合并、合并工作表。

**WPS 候选表更新**（2026-10-15 03:00 第十四轮；无新候选、无顺位变化；思维导图新增第五重实锤；交付核对 70 Path 无重叠）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 思维导图 [WPS] | **新增实锤**：新浪科技 2025-11-09（天猫 88VIP 促销）再明列超级会员「具备 PDF 编辑和思维导图功能」；刻度财经 2026-01-15「脑图转 PPT」划入大会员专属、新浪财经 2025-05/2025-11「思维导图权益包」、异次元 2026-10-14 超级会员 200+ 权益——五重实锤；免费替代要么装客户端要么走 AI 账号/国外服务；纯前端树编辑 + 导出 PNG/SVG/Markdown 可行 | 中 | P1（10-16 起首选新品类，顺位不动） |
| 表格拆分（按列拆分多表）[WPS] | V2EX「免费 Excel 拆分神器」独立验证「按部门/地区列拆分分发」需求（走云端异步，ToolWeb 差异化本地处理免账号）；360doc 再确认 WPS 拆分表格是 VIP；腾讯元宝 AI 免费路线已出现 → 抓紧；SheetJS + JSZip 在栈 | 中 | P1（10-16/17 备选，顺位不动） |
| 表格合并（多文件/多表合一）[WPS] | 360doc 2025-10-29「以前都是借助WPS会员才可以合并」+ php.cn「智能工具箱 → 工作簿 → 合并」会员流程双重实锤；CSDN 2025-10-15（满一年仍被引）独立验证合并痛点；现有免费方案多为桌面 exe，网页端本地处理有空位；与表格拆分互链「拆分↔合并」旅程线 | 小 | P1（10-16/17 备选，顺位不动） |
| 流程图绘制 [WPS] | WPS/WPS 绘图增值功能；但赛道已有 draw.io、良功绘图等免费玩家，竞争激烈 + 交互复杂、单日难保质量 | 大 | P2 |
| PDF 转 Word/Excel（完整版式版）[WPS] | 会员核心卖点；但纯前端版式还原差，易砸口碑——文本提取版先行验证诚实范围策略 | 中 | P2（低优先，质量风险） |
| 批量处理（批量改名/压缩等剩余子集）[WPS] | 批量 PDF 转换已拆分为独立候选（批量 PDF 转 Word、批量图片转文字均已交付归档）；剩余子集（批量改名清单等）价值视拆分而定 | 中 | P2 |
| 简历生成器 [WPS] | 简历服务套餐为会员独立付费项（财信报告明列）；但属表单/模板类产品，暂不进排期 | 中 | P2（观察，暂缓） |
| 文档翻译 [WPS] | WPS 翻译属 AI/会员权益；需调用外部翻译 API 或大模型，非纯前端 | 中 | P3（需后端/AI，低优先） |
| 音频转文字（语音速记）[WPS] | 超级会员权益；浏览器 Web Speech 识别受限、离线模型体积大，非纯前端单页 | 大 | P3（低优先） |
| 简历/合同模板库 [WPS] | 稻壳/模板套餐收费；属内容库而非工具，与单页工具架构不符 | 中 | P3（形态不符，暂缓） |
| 论文查重 [WPS] | WPS 独立付费项（2026 年仍散落各处）；需论文比对库/后端，非纯前端单页 | 大 | P3（需后端，暂缓） |
| 电子签名/PDF 签名 [WPS] | 未确认为会员付费墙（国外价格站弱证据，国内官网列为常规功能），维持不列入 | 中 | 不列入 |
| ~~长图拼接 [WPS]~~（2026-10-14 19:00 候选作废） | 仓库已有 `img_stitch`（图片拼接 / 长图拼接）功能完全重叠；调研轮次未先核对仓库工具表，核稿反馈已记录 | 小 | ❌ 作废 |
| ~~批量图片转文字 [WPS]~~（2026-10-14 17:00 已交付） | WPS「图片工具箱：批量转文字和表格」会员权益；已实现 `/tools/ocr-batch`（Node 端到端 55 项全过），归档 | 中 | ✅ 归档 |
| ~~PDF 转 PPT（文本提取版）[WPS]~~（2026-10-14 提前交付） | 收官枪 13:30 既定、10-14 提前交付（commit 7393640）；矩阵闭环完成 | 中 | ✅ 归档 |
| ~~批量 PDF 转 Word（文本提取版）[WPS]~~（2026-10-14 15:00 已交付） | WPS 会员核心权益「批量 PDF 转换」→ 已实现 `/tools/pdf-to-word-batch`（Node 端到端 21 项全过），归档 | 中 | ✅ 归档 |

**归档说明**：第十四轮为 10-15 收官日第三轮研究（接续第十三轮）——无新候选、无顺位变化，10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；仓库 70 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环；10-15 今日按既定执行 QA 兜底 + 10-16 新品类准备，无新增开发债务。

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

## 今日任务（2026-10-15 01:00 · 产品经理决策 ✅）

**交付状态**：收官决策延续。本轮不立项新开发任务——10-15 按既定为 QA 兜底 + 10-16 新品类准备日（19:00/21:00/23:39 三轮 PM 决策均已锁定）；10-16 起排期最终定序锁定不变。

**选定：今日无新开发任务（收官确认轮）** — 三个调研候选中，无一项可立项：
- **思维导图 [WPS]：顺位锁定，不提前**。10-16 首选新品类；第十三轮四重实锤（新增刻度财经 2026-01-15「脑图转PPT」被划入大会员专属）再确认顺位。01:00 立项中难度任务会挤占 QA 兜底 + 新品类准备日，违反节奏纪律与 23:39 决策。
- **表格拆分（按列拆分多表）[WPS]：顺位不动，不提前透支**。同为 10-16/17 备选、「表格工具」品类开山之作，按既定定序执行；腾讯元宝 AI 免费路线压力靠定序交付抓紧、不靠提前透支。
- **表格合并（多文件/多表合一）[WPS]：已批准，顺位锁定**。21:00 PM 决策已批准其为 10-16/17 备选、接替长图拼接顺延位、节奏调节位；归属「表格工具」品类（10-16 起范畴），今日提前开发违反专题周品类口径。

**决策理由**：
1. 口径延续：19:00、21:00、23:39 三轮 PM 决策均立「收官不再立项」；第十三轮研究轮（01:00）自定「专题周区间内最后一轮，只做证据加固、顺位确认、不再引入新候选」。本轮若反转立项，等于把开发债务滚到准备日。
2. 节奏纪律：10-14 单日交付七个工具，为专题周单日最高密度；10-15 既定为 QA 兜底 + 新品类准备日（思维导图技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案；表格拆分 SheetJS 版本确认等顺带预研），再立项会让开发轮侵占准备日。
3. 定序锁定：10-16 起排期最终定序（思维导图首选 → 表格拆分备选 → 表格合并备选）已由三轮 PM 决策 + 两轮研究轮锁定，第十三轮无新信号动摇，无需变更。

**规格**：
1. 本轮无开发/评审/测试/部署/QA 工作量；管线本轮以 PM 决策闭环。
2. 今日既定事项不变：① 10-14 七交付的 QA 兜底（部署后复核）；② 10-16 思维导图新品类准备（技术路线复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案）；③ 表格拆分技术预研可顺带启动（不算任务、只算准备）。
3. 10-16 起排期最终定序锁定（见验收标准）。

**验收标准**：
- [ ] 本决策已写入 BACKLOG.md 顶部「今日任务」小节并提交开发分支
- [ ] 10-16 起排期最终定序锁定不变：思维导图首选、表格拆分备选、表格合并备选（节奏调节位）
- [ ] 10-15 按既定执行：10-14 七交付 QA 兜底 + 10-16 新品类准备，无新增开发债务

**预计改动文件**：`BACKLOG.md`（本小节）。

## 今日候选（2026-10-15 · 产品调研推荐，第十三轮 01:00）

> **本周特别方向（2026-10-09 至 10-15）第 7 天、区间最后一天**：今日（10-15）仍在区间内；10-15 按既定为 QA 兜底 + 10-16 新品类准备日（19:00/21:00/23:39 PM 决策已锁定）；10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选）。本轮为**第十三轮研究（专题周区间内最后一轮）——只做证据加固与顺位确认，不再引入新候选**，口径延续第十二轮。

**交付核对**：立候选前已 `grep tools/categories.go` 全量核对（74 个已注册 Path），思维导图、表格拆分、表格合并三项均无重叠（仓库无 mind-map 类工具、无 spreadsheet 拆分/合并工具；`pdf_merge_split` 为 PDF 品类、`img_stitch` 为图片品类，均不冲突）。

**今日新信号**（2026-10-15 01:00 全网调研）：
1. **思维导图付费墙第四重实锤**（腾讯新闻/山西晚报·刻度财经 2026-01-15「WPS会员叠会员套娃收费」）：超级会员核心权益「脑图转PPT」被悄悄划进大会员专属列表，老用户想继续使用需额外付费升级——思维导图导出能力本身成为会员分级筹码；新浪财经 2025-11-09/11 两篇促销文再明列「思维导图权益包」。付费墙证据链延续（新浪财经 2025-05/2025-11、财信研报、异次元 2026-10-14 200+ 权益、刻度财经脑图转PPT），10-16 首选新品类顺位再加固；10-16 思维导图导出链（PNG/SVG/Markdown）技术路线即正面刚此付费点。
2. **表格合并需求侧再验证**：CSDN 2025-10-15（满一年）「Excel合并拆分工具」仍在被引——「合并多个表格时格式错乱、数据遗漏问题频发」，门店销售日报合并、财务数据归档、跨部门数据汇总场景明确；现有免费方案仍以桌面 exe（夸克网盘下载）为主，网页端「本地处理、不上传、免账号」差异化空位延续。表格合并难度小、节奏调节位顺位不动。
3. **WPS 信任危机叙事延续**：「不用开 WPS 会员」传播卖点继续有效——网易杠杆游戏 2026-06-24「被WPS背刺了」登上微博热搜（套娃式收费、批量清理缓存划入会员付费区、免费用户逐项手动清理）；黑猫投诉 WPS 相关已突破 11000 条（约半数指向自动续费、权益与宣传不符、功能拆分收费）。口径合规注意：金山办公 2026-07-06 官方声明「免费功能不收费、会员权益不上移」，引用时只陈述可验证事实。
4. **通用痛点侧无新晋候选**：V2EX 泛搜索本轮未发现可单页落地、热度超越锁定三项的新痛点；fly63 600+ 工具站（免注册免费、挂广告维持开销）印证「免广告」差异化叙事仍有效，不构成竞品压力。

**推荐 Top3**（10-16 起排期最终建议，顺位锁定；努力度为单页前端交付量级评估）：

1. **思维导图 [WPS]** — P1（10-16 起首选新品类，顺位不动）：付费墙四重实锤（新浪财经 2025-05/2025-11「思维导图权益包」、财信研报、异次元 2026-10-14 超级会员 200+ 权益、刻度财经「脑图转PPT」划入大会员专属）；免费替代要么装客户端要么走 AI 账号/国外服务；纯前端树编辑 + 导出 PNG/SVG/Markdown、localStorage 存草稿免注册。难度中。SEO：思维导图、在线思维导图、免费思维导图。
2. **表格拆分（按列拆分多表）[WPS]** — P1（10-16/17 备选，开「表格工具」品类，顺位不动）：WPS 表格「拆分表格」VIP 实锤（360doc 2025-12-09）；V2EX「免费 Excel 拆分神器」独立验证「按部门/地区列拆分分发」需求（走云端异步，ToolWeb 差异化本地处理免账号）；腾讯元宝 AI 免费路线已出现 → 抓紧；SheetJS + JSZip 在栈。难度中。SEO：Excel拆分、表格按列拆分、Excel按列拆分、Excel分表。
3. **表格合并（多文件/多表合一）[WPS]** — P1（10-16/17 备选，接替长图拼接顺延位，节奏调节位；顺位不动）：付费墙双重实锤（360doc 2025-10-29「以前都是借助WPS会员才可以合并」+ php.cn「智能工具箱 → 工作簿 → 合并」专用会员流程）；CSDN 2025-10-15（满一年仍被引）独立验证合并痛点（格式错乱、数据遗漏）；现有免费方案多为桌面 exe，网页端本地处理有空位；与表格拆分互链形成「拆分↔合并」旅程线、同开「表格工具」品类。难度小。SEO：Excel合并、表格合并、多个Excel合并、合并工作表。

**WPS 候选表更新**（2026-10-15 01:00 第十三轮；无新候选、无顺位变化；思维导图新增第四重实锤）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 思维导图 [WPS] | **新增实锤**：刻度财经 2026-01-15「脑图转PPT」被划进大会员专属（超级会员→大会员额外付费升级）；新浪财经 2025-11 两篇促销文再明列「思维导图权益包」；异次元 2026-10-14 确认超级会员 200+ 权益；免费替代要么装客户端要么走 AI 账号/国外服务；纯前端树编辑 + 导出 PNG/SVG/Markdown 可行 | 中 | P1（10-16 起首选新品类，顺位不动） |
| 表格拆分（按列拆分多表）[WPS] | V2EX「免费 Excel 拆分神器」独立验证「按部门/地区列拆分分发」需求（走云端异步，ToolWeb 差异化本地处理免账号）；360doc 再确认 WPS 拆分表格是 VIP；腾讯元宝 AI 免费路线已出现 → 抓紧；SheetJS + JSZip 在栈 | 中 | P1（10-16/17 备选，顺位不动） |
| 表格合并（多文件/多表合一）[WPS] | **需求再验证**：CSDN 2025-10-15（满一年仍被引）独立验证合并痛点（格式错乱、数据遗漏）；360doc 2025-10-29「以前都是借助WPS会员才可以合并」+ php.cn「智能工具箱 → 工作簿 → 合并」会员专用流程；现有免费方案多为桌面 exe，网页端本地处理有空位；与表格拆分互链「拆分↔合并」旅程线 | 小 | P1（10-16/17 备选，顺位不动） |
| 流程图绘制 [WPS] | WPS/WPS 绘图增值功能；但赛道已有 draw.io、良功绘图等免费玩家，竞争激烈 + 交互复杂、单日难保质量 | 大 | P2 |
| PDF 转 Word/Excel（完整版式版）[WPS] | 会员核心卖点；但纯前端版式还原差，易砸口碑——文本提取版先行验证诚实范围策略 | 中 | P2（低优先，质量风险） |
| 批量处理（批量改名/压缩等剩余子集）[WPS] | 批量 PDF 转换已拆分为独立候选（批量 PDF 转 Word、批量图片转文字均已交付归档）；剩余子集（批量改名清单等）价值视拆分而定 | 中 | P2 |
| 简历生成器 [WPS] | 简历服务套餐为会员独立付费项（财信报告明列）；但属表单/模板类产品，暂不进排期 | 中 | P2（观察，暂缓） |
| 文档翻译 [WPS] | WPS 翻译属 AI/会员权益；需调用外部翻译 API 或大模型，非纯前端 | 中 | P3（需后端/AI，低优先） |
| 音频转文字（语音速记）[WPS] | 超级会员权益；浏览器 Web Speech 识别受限、离线模型体积大，非纯前端单页 | 大 | P3（低优先） |
| 简历/合同模板库 [WPS] | 稻壳/模板套餐收费；属内容库而非工具，与单页工具架构不符 | 中 | P3（形态不符，暂缓） |
| 论文查重 [WPS] | WPS 独立付费项（2026 年仍散落各处）；需论文比对库/后端，非纯前端单页 | 大 | P3（需后端，暂缓） |
| 电子签名/PDF 签名 [WPS] | 未确认为会员付费墙（国外价格站弱证据，国内官网列为常规功能），维持不列入 | 中 | 不列入 |
| ~~长图拼接 [WPS]~~（2026-10-14 19:00 候选作废） | 仓库已有 `img_stitch`（图片拼接 / 长图拼接）功能完全重叠；调研轮次未先核对仓库工具表，核稿反馈已记录 | 小 | ❌ 作废 |
| ~~批量图片转文字 [WPS]~~（2026-10-14 17:00 已交付） | WPS「图片工具箱：批量转文字和表格」会员权益；已实现 `/tools/ocr-batch`（Node 端到端 55 项全过），归档 | 中 | ✅ 归档 |
| ~~PDF 转 PPT（文本提取版）[WPS]~~（2026-10-14 提前交付） | 收官枪 13:30 既定、10-14 提前交付（commit 7393640）；矩阵闭环完成 | 中 | ✅ 归档 |
| ~~批量 PDF 转 Word（文本提取版）[WPS]~~（2026-10-14 15:00 已交付） | WPS 会员核心权益「批量 PDF 转换」→ 已实现 `/tools/pdf-to-word-batch`（Node 端到端 21 项全过），归档 | 中 | ✅ 归档 |

**归档说明**：第十三轮为 WPS 专题周区间内最后一轮研究——无新候选、无顺位变化，10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；仓库 74 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环；10-15 按既定执行 QA 兜底 + 10-16 新品类准备（思维导图技术路线复核、导出链预研），无新增开发债务。

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

## 今日任务（2026-10-14 23:39 · 产品经理决策 ✅）

**交付状态**：收官决策延续。本轮不立项新开发任务——第十二轮研究（23:00）已定为专题周最后研究轮次（只做证据加固、顺位不变、无新增候选）；本轮为 23:39 产品经理排期确认轮，确认三件事：① 10-14 当日收官状态无变更；② 10-15（明日）既定事项按 19:00 PM 决策执行不变：今日七交付 QA 兜底 + 10-16 思维导图新品类准备；③ 10-16 起排期最终定序锁定不变：思维导图首选新品类 → 表格拆分备选（开「表格工具」品类）→ 表格合并备选（接替长图拼接顺延位，节奏调节；与表格拆分互链「拆分↔合并」旅程线）。

**选定：本轮无新开发任务（收官确认轮）** — 三个调研候选中，无一项可立项：
- **思维导图 [WPS]：顺位锁定，不提前**。10-16 首选新品类；第十二轮三重实锤（新浪财经 2025-05/2025-11「思维导图权益包」、异次元 2026-10-14 超级会员 200+ 权益）再确认顺位。今日 23:39 立项会把中难度开发任务拖进 10-15，挤占 QA 兜底 + 新品类准备日，违反节奏纪律。
- **表格拆分（按列拆分多表）[WPS]：顺位不动，不提前透支**。10-16/17 备选、「表格工具」品类开山之作，按既定定序执行；AI 免费路线（腾讯元宝）压力已在排期内，抓紧靠定序交付、不靠提前透支。
- **表格合并（多文件/多表合一）[WPS]：已批准，顺位锁定**。21:00 PM 决策已批准其为 10-16/17 备选、接替长图拼接顺延位；第十二轮 php.cn「智能工具箱 → 工作簿 → 合并」会员流程再实锤。同样归属「表格工具」新品类（10-16 起范畴），今日提前开发违反专题周品类口径。

**决策理由**：
1. 口径延续：19:00、21:00 两轮 PM 决策均立「今日收官不再立项」；23:00 研究轮自定「专题周最后研究轮次，不再引入新候选」。本轮若反转立项，等于把开发债务滚到 10-15。
2. 节奏纪律：今日已交付七个工具（专题周单日最高密度）；10-15 既定为 QA 兜底日 + 10-16 新品类准备日（思维导图技术路线 mi/mind-map MIT 复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案；表格拆分 SheetJS 版本确认等顺带预研），23:39 立项中难度任务会让开发轮侵占准备日。
3. 定序锁定：10-16 起排期最终定序（思维导图首选 → 表格拆分备选 → 表格合并备选）已由 21:00 PM 决策 + 23:00 研究轮双重锁定，无新信号动摇，无需变更。

**规格**：
1. 本轮无开发/评审/测试/部署/QA 工作量；管线本轮以 PM 决策闭环。
2. 10-15（明日）既定事项不变：① 今日七交付 QA 兜底（部署后复核）；② 10-16 思维导图新品类准备；③ 表格拆分技术预研可顺带启动（不算任务、只算准备）。
3. 10-16 起排期最终定序锁定（见交付状态③）。

**验收标准**：
- [ ] 本决策已写入 BACKLOG.md 顶部「今日任务」小节并提交开发分支
- [ ] 10-16 起排期最终定序锁定不变：思维导图首选、表格拆分备选、表格合并备选（节奏调节位）
- [ ] 10-15 按既定执行：今日七交付 QA 兜底 + 10-16 新品类准备，无新增开发债务

**预计改动文件**：`BACKLOG.md`（本小节）。

## 今日候选（2026-10-14 · 产品调研推荐，第十二轮 23:00）

> **本周特别方向（2026-10-09 至 10-15）第 6 天收尾**：今日（10-14）仍在区间内；19:00 PM 已决策今日收官不再立项；21:00 决策已批准第十一轮补位结果；本轮为**专题周最后研究轮次**——只做证据加固与顺位确认，10-16 起排期最终定序锁定不变，不再引入新候选。

**交付核对**：立候选前已 `grep tools/categories.go` 全量核对（72 个已注册 Path），思维导图、表格拆分、表格合并三项均无重叠（仓库无 mind-map 类工具、无 spreadsheet 拆分/合并工具；`pdf_merge_split` 为 PDF 品类、`img_stitch` 为图片品类，均不冲突）。

**今日新信号**（2026-10-14 23:00 全网调研）：
1. **表格合并 WPS 付费路径再实锤**（php.cn「wps如何合并多个excel文件？」）：WPS 合并多个 Excel 走「智能工具箱 → 工作簿 → 合并 → 添加文件 → 开始合并」专用流程（工具箱为会员功能），与 360doc 2025-10-29「以前都是借助WPS会员才可以合并」相互印证，付费墙双重实锤；表格合并顺位不变。
2. **思维导图付费墙再确认**（异次元 2026-10-14 当日更新）：WPS 大会员（年度低价促销）文章再明列超级会员含 200+ 项会员权益；叠加新浪财经 2025-05/2025-11 两篇促销文章均明列「思维导图权益包」，三重实锤维持 10-16 首选新品类顺位。
3. **WPS 叙事借力**：异次元 2026-10-14 文章自曝「平常使用免费版的 WPS 广告实在是太多了」——去广告是会员核心卖点之一；ToolWeb「免广告、免账号、本地处理、不上传」叙事可继续借力「不用开 WPS 会员」传播卖点。同文列「文档修复工具」为会员功能——我站 10-14 已交付 docx-repair（文档修复），属前置对冲已落地。
4. **通用痛点侧无新晋候选**：V2EX 泛搜索（「希望有一个网站能」）本轮未发现可单页落地、热度超越锁定三项的新痛点；收官日不引入新候选，避免排期扰动。

**推荐 Top3**（10-16 起排期最终建议，顺位锁定；努力度为单页前端交付量级评估）：

1. **思维导图 [WPS]** — P1（10-16 起首选新品类，顺位不动）：付费墙三重实锤（新浪财经 2025-05/2025-11「思维导图权益包」、异次元 2026-10-14 超级会员 200+ 权益再确认）；免费替代要么装客户端要么走 AI 账号/国外服务；纯前端树编辑 + 导出 PNG/SVG/Markdown、localStorage 存草稿免注册。难度中。SEO：思维导图、在线思维导图、免费思维导图。
2. **表格拆分（按列拆分多表）[WPS]** — P1（10-16/17 备选，开「表格工具」品类，顺位不动）：WPS 表格「拆分表格」VIP 实锤（360doc 2025-12-09）；V2EX「免费 Excel 拆分神器」独立验证「按部门/地区列拆分分发」需求（走云端异步，ToolWeb 差异化本地处理免账号）；腾讯元宝 AI 免费路线已出现 → 抓紧；SheetJS + JSZip 在栈。难度中。SEO：Excel拆分、表格按列拆分、Excel按列拆分、Excel分表。
3. **表格合并（多文件/多表合一）[WPS]** — P1（10-16/17 备选，接替长图拼接顺延位，节奏调节位；顺位不动）：付费墙双重实锤（360doc 2025-10-29「以前都是借助WPS会员才可以合并」+ php.cn「智能工具箱 → 工作簿 → 合并」专用会员流程）；CSDN 2025-10-15 独立验证合并痛点（格式错乱、数据遗漏）；现有免费方案多为桌面 exe/AI 上传，网页端本地处理有空位；与表格拆分互链形成「拆分↔合并」旅程线、同开「表格工具」品类；SheetJS（在栈）多文件上传 → 纵向追加/多 sheet 并入一书 → 预览 → 导出 xlsx；难度比表格拆分更小，适合做两大中难度工具之间的节奏调节位。难度小。SEO：Excel合并、表格合并、多个Excel合并、合并工作表。

**WPS 候选表更新**（2026-10-14 23:00 第十二轮；无新候选、无顺位变化；表格合并新增付费路径实锤）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 思维导图 [WPS] | **证据加固**：新浪财经 2025-05/2025-11 均明列「思维导图权益包」；异次元 2026-10-14 再确认超级会员 200+ 权益；免费替代要么装客户端要么走 AI 账号/国外服务；纯前端树编辑 + 导出 PNG/SVG/Markdown 可行 | 中 | P1（10-16 起首选新品类，顺位不动） |
| 表格拆分（按列拆分多表）[WPS] | V2EX「免费 Excel 拆分神器」独立验证「按部门/地区列拆分分发」需求（走云端异步，ToolWeb 差异化本地处理免账号）；360doc 再确认 WPS 拆分表格是 VIP；腾讯元宝 AI 免费路线已出现 → 抓紧；SheetJS + JSZip 在栈 | 中 | P1（10-16/17 备选，顺位不动） |
| 表格合并（多文件/多表合一）[WPS] | **新增实锤**：php.cn 再确认 WPS 合并走「智能工具箱 → 工作簿 → 合并」会员专用流程；360doc 2025-10-29「以前都是借助WPS会员才可以合并」；CSDN 2025-10-15 独立验证合并痛点；与表格拆分互链「拆分↔合并」旅程线；SheetJS + JSZip 在栈 | 小 | P1（10-16/17 备选，顺位不动） |
| 流程图绘制 [WPS] | WPS/WPS 绘图增值功能；但赛道已有 draw.io、良功绘图等免费玩家，竞争激烈 + 交互复杂、单日难保质量 | 大 | P2 |
| PDF 转 Word/Excel（完整版式版）[WPS] | 会员核心卖点；但纯前端版式还原差，易砸口碑——文本提取版先行验证诚实范围策略 | 中 | P2（低优先，质量风险） |
| 批量处理（批量改名/压缩等剩余子集）[WPS] | 批量 PDF 转换已拆分为独立候选（批量 PDF 转 Word、批量图片转文字均已交付归档）；剩余子集（批量改名清单等）价值视拆分而定 | 中 | P2 |
| 简历生成器 [WPS] | 简历服务套餐为会员独立付费项（财信报告明列）；但属表单/模板类产品，暂不进排期 | 中 | P2（观察，暂缓） |
| 文档翻译 [WPS] | WPS 翻译属 AI/会员权益；需调用外部翻译 API 或大模型，非纯前端 | 中 | P3（需后端/AI，低优先） |
| 音频转文字（语音速记）[WPS] | 超级会员权益；浏览器 Web Speech 识别受限、离线模型体积大，非纯前端单页 | 大 | P3（低优先） |
| 简历/合同模板库 [WPS] | 稻壳/模板套餐收费；属内容库而非工具，与单页工具架构不符 | 中 | P3（形态不符，暂缓） |
| 论文查重 [WPS] | WPS 独立付费项（2026 年仍散落各处）；需论文比对库/后端，非纯前端单页 | 大 | P3（需后端，暂缓） |
| 电子签名/PDF 签名 [WPS] | 未确认为会员付费墙（国外价格站弱证据，国内官网列为常规功能），维持不列入 | 中 | 不列入 |
| ~~长图拼接 [WPS]~~（2026-10-14 19:00 候选作废） | 仓库已有 `img_stitch`（图片拼接 / 长图拼接）功能完全重叠；调研轮次未先核对仓库工具表，核稿反馈已记录 | 小 | ❌ 作废 |
| ~~批量图片转文字 [WPS]~~（2026-10-14 17:00 已交付） | WPS「图片工具箱：批量转文字和表格」会员权益；已实现 `/tools/ocr-batch`（Node 端到端 55 项全过），归档 | 中 | ✅ 归档 |
| ~~PDF 转 PPT（文本提取版）[WPS]~~（2026-10-14 提前交付） | 收官枪 13:30 既定、10-14 提前交付（commit 7393640）；矩阵闭环完成 | 中 | ✅ 归档 |
| ~~批量 PDF 转 Word（文本提取版）[WPS]~~（2026-10-14 15:00 已交付） | WPS 会员核心权益「批量 PDF 转换」→ 已实现 `/tools/pdf-to-word-batch`（Node 端到端 21 项全过），归档 | 中 | ✅ 归档 |

**归档说明**：第十二轮为专题周最后研究轮次——无新候选、无顺位变化，10-16 起排期最终定序锁定不变（思维导图首选新品类 → 表格拆分备选 → 表格合并备选，节奏调节位）；仓库 72 注册工具全量核对无重叠，核稿反馈（立候选前先 grep）持续闭环；专题周（10-09 至 10-14）六日交付十六工具（见第十轮归档说明）；10-15 收官日按 19:00 PM 决策执行 QA 兜底 + 10-16 新品类准备（思维导图技术路线复核），无新增开发债务。

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

---

## 今日任务（2026-10-14 21:00 · 产品经理决策 ✅）

**交付状态**：收官决策延续。本轮不立项新开发任务——今日（10-14）已在 19:00 决策收官；本轮唯一的正式决策事项是**批准第十一轮调研补位结果**：表格合并 [WPS] 正式纳入 10-16 起排期最终定序，接替长图拼接作废后的顺延位；10-16 起排期最终定序锁定不变。

**选定：今日不再新增开发任务（收官延续）** — 三个调研候选中，无一项可立项：
- **表格合并（多文件/多表合一）[WPS]：批准为 10-16/17 备选候选**。查仓确认无重叠（现有仅 CSV⇄JSON 互转、图片转 Excel，无 Excel/表格合并工具；`pdf_merge_split` 为 PDF 品类不冲突）；WPS 会员功能实锤（360doc 2025-10-29「以前都是借助WPS会员才可以合并」）；与表格拆分互链形成「拆分↔合并」旅程线、同开「表格工具」品类；SheetJS + JSZip 在栈；难度小，适合做两大中难度工具之间的节奏调节位。SEO：Excel合并、表格合并、多个Excel合并、合并工作表。
- **思维导图 [WPS]：顺位不动，不提前**。第十一轮再次加固其「10-16 起首选新品类」顺位；PM 口径「专题周内不切换品类」（10-09 至 10-15）延续至收官日。
- **表格拆分（按列拆分多表）[WPS]：顺位不动，不提前透支**。同为 10-16/17 备选、「表格工具」新品类开山之作，按既定定序执行。

**决策理由**：
1. 调研轮次完成核稿反馈：第十一轮立候选前已 `grep tools/categories.go` 全量核对，表格合并无重叠——19:00 决策提出的「长图拼接顺延位补位 + 不得与现有工具重叠」要求已落实，候选作废教训闭环。
2. 节奏纪律：今日已交付七个工具（压缩、转 Word、图片转 Excel、文档修复、转 PPT、批量转 Word、批量 OCR），为专题周单日最高密度；10-15 收官日按既定留作 QA 兜底 + 10-16 新品类（思维导图）准备，今日再加任务会把 QA 债务滚到收官日。
3. 口径延续：专题周内不切换品类（10-09 至 10-15）；表格合并归属「表格工具」品类，本就是 10-16 起的新品类范畴，今日提前开发同样违反品类口径。

**10-16 起排期最终定序（锁定，不变）**：思维导图首选新品类（10-16）→ 表格拆分备选（10-16/17，开「表格工具」品类）→ 表格合并备选（10-16/17，接替长图拼接顺延位，节奏调节；与表格拆分互链「拆分↔合并」旅程线）。

**规格**：
1. 本轮无开发/评审/测试/部署/QA 工作量；管线本轮以 PM 决策闭环。
2. 10-15（明日）既定事项不变：① 今日七交付的 QA 兜底（部署后复核）；② 10-16 思维导图新品类准备（技术路线 mi/mind-map MIT 复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案）；③ 表格拆分技术预研可顺带启动（SheetJS 在栈版本确认、分组导出策略预研），但不算任务、只算准备。
3. 10-16 起排期最终定序锁定（见上）；调研轮次第十一轮补位任务完成，后续调研按既定收官。

**验收标准**：
- [ ] 本决策已写入 BACKLOG.md 顶部「今日任务」小节并提交开发分支
- [ ] 10-16 起排期最终定序锁定：思维导图首选、表格拆分备选、表格合并备选（节奏调节位）
- [ ] 表格合并候选查仓无重叠确认（核稿反馈闭环）
- [ ] 10-15 按既定执行：今日七交付 QA 兜底 + 10-16 新品类准备，无新增开发债务

**预计改动文件**：`BACKLOG.md`（本小节）。

## 今日候选（2026-10-14 · 产品调研推荐，第十一轮 21:00）

> **本周特别方向（2026-10-09 至 10-15）第 6 天**：今日（10-14）仍在区间内；19:00 PM 已决策今日收官不再立项；本轮为**10-16 起排期最终定序的候选补位**——19:00 决策要求调研轮次补一个 10-16/17 备选（长图拼接顺延位空缺，且不得与现有工具重叠）。

**交付核对**：立候选前已 `grep tools/categories.go` 全量核对（72 个已注册 ID），新候选「表格合并」无重叠（现有仅 CSV⇄JSON 互转、图片转 Excel 等，无 Excel/表格合并工具）；PDF 合并/拆分（`pdf_merge_split`）为 PDF 品类，不冲突。

**今日新信号**（2026-10-14 21:00 全网调研）：
1. **表格合并是 WPS 会员功能实锤**（360doc「Excel不加班」2025-10-29）：「合并多个 CSV/Excel……以前都是借助WPS会员才可以合并」——付费墙实锤，为本轮唯一新增 [WPS] 候选。
2. **需求侧独立验证**：CSDN 2025-10-15「Excel合并拆分工具」——「合并多个表格时，格式错乱、数据遗漏问题频发」；门店销售日报合并、财务数据归档、跨部门数据汇总等高频场景；现有免费方案多为桌面 exe（夸克网盘下载）或 AI 上传路线（腾讯元宝需登录+上传文件），网页端「本地处理、不上传、免账号」有差异化空位。
3. **WPS 信任危机叙事延续**：网易约 92 天前「WPS的转型阵痛不应由用户买单」——黑猫投诉 WPS 相关已突破 11000 条（约半数指向自动续费、权益与宣传不符、功能拆分收费）；「不用开 WPS 会员」传播卖点继续有效。
4. **排除项诚实记录**：证件照换底色——本轮检索未确认其为 WPS 会员付费墙（异次元 2026-10-14 仅泛述 200+ 权益），不立项，避免弱证据候选。

**推荐 Top3**（10-16 起排期最终建议；努力度为单页前端交付量级评估）：

1. **思维导图 [WPS]** — P1（10-16 起首选新品类，顺位不动）：付费墙三重实锤（新浪财经 2025-05/2025-11「思维导图权益包」、异次元 2026-10-14 超级会员 200+ 权益）；免费替代要么装客户端要么走 AI 账号/国外服务；纯前端树编辑 + 导出 PNG/SVG/Markdown、localStorage 存草稿免注册。难度中。SEO：思维导图、在线思维导图、免费思维导图。
2. **表格拆分（按列拆分多表）[WPS]** — P1（10-16/17 备选，开「表格工具」品类，顺位不动）：WPS 表格「拆分表格」VIP 实锤（360doc 2025-12-09）；V2EX「免费 Excel 拆分神器」独立验证需求（走云端异步，ToolWeb 差异化本地处理免账号）；腾讯元宝 AI 免费路线已出现 → 抓紧；SheetJS + JSZip 在栈。难度中。SEO：Excel拆分、表格按列拆分、Excel按列拆分、Excel分表。
3. **表格合并（多文件/多表合一）[WPS]** — P1（**新候选**，10-16/17 备选，接替长图拼接顺延位）：WPS 会员功能实锤（360doc 2025-10-29「以前都是借助WPS会员才可以合并」）；CSDN 2025-10-15 独立验证「合并多个表格时格式错乱、数据遗漏」痛点；现有免费方案多为桌面 exe/网盘下载或 AI 上传路线，网页端本地处理有空位；与表格拆分互链形成「拆分↔合并」旅程线、同开「表格工具」品类；SheetJS（在栈）多文件上传 → 纵向追加/多 sheet 并入一书 → 预览 → 导出 xlsx；难度比表格拆分更小（无分组 UI），适合做两大中难度工具之间的节奏调节位。难度小。SEO：Excel合并、表格合并、多个Excel合并、合并工作表。

**WPS 候选表更新**（2026-10-14 21:00 第十一轮；新增表格合并 P1 接替长图拼接顺延位；其余顺位不动）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 思维导图 [WPS] | 新浪财经 2025-05/2025-11 均明列「思维导图权益包」；异次元 2026-10-14 确认超级会员 200+ 权益（118 元/年）；免费替代要么装客户端要么走 AI 账号/国外服务；纯前端树编辑 + 导出 PNG/SVG/Markdown 可行 | 中 | P1（10-16 起首选新品类） |
| 表格拆分（按列拆分多表）[WPS] | V2EX「免费 Excel 拆分神器」独立验证「按部门/地区列拆分分发」需求（走云端异步，ToolWeb 差异化本地处理免账号）；360doc 再确认 WPS 拆分表格是 VIP；腾讯元宝 AI 免费路线已出现 → 抓紧；SheetJS + JSZip 在栈 | 中 | P1（10-16/17 备选） |
| 表格合并（多文件/多表合一）[WPS] | **新候选**：WPS 会员功能实锤（360doc 2025-10-29「以前都是借助WPS会员才可以合并」）；CSDN 2025-10-15 独立验证合并痛点（格式错乱、数据遗漏）；现有免费方案多为桌面 exe/AI 上传，网页端本地处理有空位；与表格拆分互链「拆分↔合并」旅程线；SheetJS + JSZip 在栈 | 小 | P1（10-16/17 备选，接替长图拼接顺延位） |
| 流程图绘制 [WPS] | WPS/WPS 绘图增值功能；但赛道已有 draw.io、良功绘图等免费玩家，竞争激烈 + 交互复杂、单日难保质量 | 大 | P2 |
| PDF 转 Word/Excel（完整版式版）[WPS] | 会员核心卖点；但纯前端版式还原差，易砸口碑——文本提取版先行验证诚实范围策略 | 中 | P2（低优先，质量风险） |
| 批量处理（批量改名/压缩等剩余子集）[WPS] | 批量 PDF 转换已拆分为独立候选（批量 PDF 转 Word、批量图片转文字均已交付归档）；剩余子集（批量改名清单等）价值视拆分而定 | 中 | P2 |
| 简历生成器 [WPS] | 简历服务套餐为会员独立付费项（财信报告明列）；但属表单/模板类产品，暂不进排期 | 中 | P2（观察，暂缓） |
| 文档翻译 [WPS] | WPS 翻译属 AI/会员权益；需调用外部翻译 API 或大模型，非纯前端 | 中 | P3（需后端/AI，低优先） |
| 音频转文字（语音速记）[WPS] | 超级会员权益；浏览器 Web Speech 识别受限、离线模型体积大，非纯前端单页 | 大 | P3（低优先） |
| 简历/合同模板库 [WPS] | 稻壳/模板套餐收费；属内容库而非工具，与单页工具架构不符 | 中 | P3（形态不符，暂缓） |
| 论文查重 [WPS] | WPS 独立付费项（2026 年仍散落各处）；需论文比对库/后端，非纯前端单页 | 大 | P3（需后端，暂缓） |
| 电子签名/PDF 签名 [WPS] | 未确认为会员付费墙（国外价格站弱证据，国内官网列为常规功能），维持不列入 | 中 | 不列入 |
| ~~长图拼接 [WPS]~~（2026-10-14 19:00 候选作废） | 仓库已有 `img_stitch`（图片拼接 / 长图拼接）功能完全重叠；调研轮次未先核对仓库工具表，核稿反馈已记录 | 小 | ❌ 作废 |
| ~~批量图片转文字 [WPS]~~（2026-10-14 17:00 已交付） | WPS「图片工具箱：批量转文字和表格」会员权益；已实现 `/tools/ocr-batch`（Node 端到端 55 项全过），归档 | 中 | ✅ 归档 |
| ~~PDF 转 PPT（文本提取版）[WPS]~~（2026-10-14 提前交付） | 收官枪 13:30 既定、10-14 提前交付（commit 7393640）；矩阵闭环完成 | 中 | ✅ 归档 |
| ~~批量 PDF 转 Word（文本提取版）[WPS]~~（2026-10-14 15:00 已交付） | WPS 会员核心权益「批量 PDF 转换」→ 已实现 `/tools/pdf-to-word-batch`（Node 端到端 21 项全过），归档 | 中 | ✅ 归档 |

**归档说明**：专题周（10-09 至 10-14）六日交付十六工具（见第十轮归档说明）；10-15 收官日按 19:00 PM 决策执行 QA 兜底 + 10-16 新品类准备（思维导图技术路线复核），无新增开发债务；10-16 起排期最终定序：思维导图（首选新品类）→ 表格拆分（10-16/17 备选，开「表格工具」品类）→ 表格合并（10-16/17 备选，接替长图拼接顺延位，节奏调节）。

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

## 今日任务（2026-10-14 19:00 · 产品经理决策 ✅）

**交付状态**：收官决策。本轮不立项新开发任务——今日（10-14）开发轮到此收官；10-15 按既定执行 QA 兜底（今日七交付）+ 10-16 新品类（思维导图）准备；10-16 起排期最终定序不变。

**选定：今日不再新增开发任务（收官）** — 三个调研候选中，无一项可立项：
- **长图拼接 [WPS]：候选作废（已存在）**。仓库已有 `img_stitch`（「图片拼接 / 长图拼接」，Path `/tools/img-stitch`，`templates/img_stitch.html` + `static/js/img-stitch.js`），功能覆盖纵向拼长图/横向并排/拖拽排序/间距与背景色可调/PNG-JPG 导出、SEO 关键词含「长图拼接、截图拼长图、聊天记录拼图」，与候选需求完全重叠。调研轮次在立候选前未核对仓库现有工具表，给出核稿反馈。
- **思维导图 [WPS]：顺位不动，不提前**。第十轮调研已明确其为「10-16 起首选新品类」最终定序，非今日推荐；PM 口径「专题周内不切换品类」（10-09 至 10-15）延续，提前开新品类会打乱口径、挤占 10-15 QA 兜底与准备日。
- **表格拆分（按列拆分多表）[WPS]：顺位不动**。同为 10-16/17 备选、「表格工具」新品类开山之作，按既定定序执行，不提前透支。

**决策理由**：
1. 避免重复（铁律级）：长图拼接已是既有工具，再做一次是「列旧活」——交付即错误。查仓是 PM 立项前的第一步。
2. 节奏纪律：今日已交付七个工具（压缩、转 Word、图片转 Excel、文档修复、转 PPT、批量转 Word、批量 OCR），为专题周单日最高密度；10-15 收官日按既定留作 QA 兜底 + 10-16 新品类准备，今日再加任务会把 QA 债务滚到收官日。
3. 口径延续：专题周内不切换品类（10-09 至 10-15）；10-16 起新品类排期最终定序（思维导图首选、表格拆分备选、长图拼接节奏调节位→已作废，顺延位空出待调研轮次补位）。
4. 调研反馈已记录：请调研轮次今后立候选前先 `grep tools/categories.go` 核对现有工具，避免重复立项。

**规格**：
1. 本轮无开发/评审/测试/部署/QA 工作量；管线本轮以 PM 决策闭环。
2. 10-15（明日）既定事项：① 今日七交付的 QA 兜底（部署后复核）；② 10-16 思维导图新品类准备（技术路线 mi/mind-map MIT 复核、导出链 PNG/SVG/Markdown 预研、localStorage 草稿方案）；③ 长图拼接顺延位空缺——调研轮次补一个 10-16/17 备选候选（不得与现有工具重叠）。
3. 10-16 起排期最终定序（不变）：思维导图首选新品类 → 表格拆分备选（开「表格工具」品类）。

**验收标准**：
- [ ] 本决策已写入 BACKLOG.md 顶部「今日任务」小节并提交开发分支
- [ ] 10-16 起新品类排期定序不变：思维导图首选、表格拆分 10-16/17 备选
- [ ] 长图拼接候选作废并记录调研核稿反馈（立候选前先核对 `tools/categories.go`）
- [ ] 10-15 按既定执行：今日七交付 QA 兜底 + 10-16 新品类准备，无新增开发债务

**预计改动文件**：`BACKLOG.md`（本小节）。

## 今日候选（2026-10-14 · 产品调研推荐，第十轮 19:00）

> **本周特别方向（2026-10-09 至 10-15）第 6 天**：今日（10-14）仍在区间内；10-15 收官日已有交付物在手（PDF 转 PPT 13:30 既定、10-14 提前交付，commit 7393640），留作 QA 兜底与新品类准备日；本轮为**10-16 起新品类排期最终定序**。

**交付核对**：批量图片转文字 [WPS] 已按 17:00 PM 决策交付（`templates/ocr_batch.html` + `static/js/ocr-batch.js` 新建，`categories.go` 注册 `/tools/ocr-batch`，Node 端到端 55 项全过），自候选划掉并归入已实现；收官枪 PDF 转 PPT（文本提取版）[WPS] 已于 10-14 提前交付（commit 7393640）。交付总数订正：第九轮「十三工具」计数未含 15:00 后交付的批量版两件与收官枪提前交付，本轮订正为**十六工具**（合并/拆分计两件）。

**今日新信号**（2026-10-14 19:00 全网调研）：
1. **思维导图付费墙三重实锤加固**：新浪财经 2025-05（618）与 2025-11（双十一）促销文章均明列超级会员权益包「PDF 权益包、图片权益包、思维导图权益包、模板库权益包、素材库权益包」；异次元软件 2026-10-14 更新：WPS 超级会员（118 元/年）含 200 多项会员权益、大会员再叠加 AI。10-16 首选新品类顺位不动。
2. **免费思维导图竞品格局**：CSDN 流程图/思维导图评测中，draw.io（diagrams.net）免费开源、免注册、即开即用（国外服务，国内访问与汉化体验打折）；良功绘图网站自称免费无限制但属软文站；桌面端亿图脑图需装客户端。ToolWeb 差异化「网页即开、文件不离开浏览器、免账号、localStorage 存草稿」仍有空位。
3. **表格拆分需求独立验证 + AI 路线预警**：V2EX 约 181 天前帖（t/1206250）开发者自荐「免费 Excel 拆分神器」——「按部门、地区等列拆分分发，手动筛选复制易出错」，走云端上传异步接收；360doc 2025-12-09 教程再确认「WPS 表格右键拆分表格是 VIP」；同一教程给出第三条路「腾讯元宝：登录电脑版、上传表格、输入需求」——AI 免费路线已进入表格拆分场景，本地免费版须抓紧交付节奏。CSDN 2025-10-15 评测：「拆分单个 Excel 为多个文件」3 步完成、办公效率提升。
4. **长图拼接短板再确认**：CSDN 2026-01 截图软件评测点名「Snipaste 没有长截图」是明显短板；小旺AI截图以「补齐长截图拼接」为核心卖点；手机端 LongPic 类 App 免费但带广告/内购；网页端「上传多图 → 纵向拼接」工具竞品稀少。难度小，适合在思维导图/表格拆分两大中难度工具之间穿插做节奏调节。
5. **WPS 信任危机叙事延续**：网易「WPS 会员套路曝光」（约 111 天前）仍在被引：早年超级会员无限次 PDF 转换 → 如今免费额度大幅压缩；老会员权益被拆分（黑猫投诉）；「不用开 WPS 会员」传播卖点继续有效。
6. **流程图绘制维持 P2**：CSDN 评测显示流程图赛道已有 draw.io、良功绘图等免费玩家，竞争激烈 + 交互复杂（难度大、单日难保质量），不提级。

**推荐 Top3**（10-16 起排期最终建议；努力度为单页前端交付量级评估）：

1. **思维导图 [WPS]** — P1（10-16 起首选新品类，顺位不动）：新浪财经两篇促销明列「思维导图权益包」、异次元 2026-10-14 确认超级会员 200+ 权益，付费墙三重实锤；「一开会员就是几百块」痛点再确认；免费替代要么装客户端（亿图脑图）要么走 AI 账号（Neumap/yeschat 云端+账号）或国外服务（draw.io）；纯前端树编辑 + 导出 PNG/SVG/Markdown（mi/mind-map MIT 路线验证）、localStorage 存草稿免注册。难度中。SEO：思维导图、在线思维导图、免费思维导图。
2. **表格拆分（按列拆分多表）[WPS]** — P1（10-16/17 备选，开辟「表格工具」新品类）：WPS 表格「拆分表格」VIP 实锤（360doc 2025-12-09）；V2EX「免费 Excel 拆分神器」（约 181 天前）独立验证「按部门/地区列拆分分发」需求（走云端异步上传，ToolWeb 差异化浏览器本地处理免账号）；腾讯元宝 AI 免费路线已出现 → 交付节奏要抓紧；SheetJS + JSZip 均在栈，单页可承载（上传 xlsx → 选列 → 分组预览 → 多 sheet 一书导出 / 打包下载）。难度中。SEO：Excel拆分、表格按列拆分、Excel按列拆分、Excel分表。
3. **长图拼接 [WPS]** — P2（本轮提为 Top3 第三、节奏调节位）：WPS Premium 海外版明列 "long picture" 为专属付费功能；CSDN 评测再确认「Snipaste 没有长截图」是截图工具明显短板、小旺AI截图以补齐长截图拼接为卖点；手机端免费 App 带广告/内购、网页端竞品稀少；纯前端 canvas 纵向拼接，难度小，可在两大中难度工具之间穿插交付。SEO：长图拼接、图片拼接长图、截图拼接、在线长截图拼接。

**WPS 候选表更新**（2026-10-14 19:00 第十轮；批量图片转文字已交付归档；Top3 第三席位由长图拼接接替；其余顺位不动）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 思维导图 [WPS] | **新信号**：新浪财经 2025-05/2025-11 均明列「思维导图权益包」；异次元 2026-10-14 确认超级会员 200+ 权益（118 元/年）；免费替代要么装客户端要么走 AI 账号/国外服务；纯前端树编辑 + 导出 PNG/SVG/Markdown 可行 | 中 | P1（10-16 起首选新品类） |
| 表格拆分（按列拆分多表）[WPS] | **新信号**：V2EX「免费 Excel 拆分神器」（约 181 天前）独立验证「按部门/地区列拆分分发」需求（走云端异步，ToolWeb 差异化本地处理免账号）；360doc 再确认 WPS 拆分表格是 VIP；腾讯元宝 AI 免费路线已出现 → 抓紧；SheetJS + JSZip 在栈 | 中 | P1（10-16/17 备选） |
| 长图拼接 [WPS] | **本轮提级**：WPS Premium 海外版明列 "long picture" 付费专属；CSDN 评测再确认「Snipaste 没有长截图」短板；手机端免费 App 带广告/内购、网页端竞品稀少；纯前端 canvas 纵向拼接 | 小 | P2（Top3 第三，节奏调节位） |
| 流程图绘制 [WPS] | WPS/WPS 绘图增值功能；但赛道已有 draw.io、良功绘图等免费玩家，竞争激烈 + 交互复杂、单日难保质量 | 大 | P2 |
| PDF 转 Word/Excel（完整版式版）[WPS] | 会员核心卖点；但纯前端版式还原差，易砸口碑——文本提取版先行验证诚实范围策略 | 中 | P2（低优先，质量风险） |
| 批量处理（批量改名/压缩等剩余子集）[WPS] | 批量 PDF 转换已拆分为独立候选（批量 PDF 转 Word、批量图片转文字均已交付归档）；剩余子集（批量改名清单等）价值视拆分而定 | 中 | P2 |
| 简历生成器 [WPS] | 简历服务套餐为会员独立付费项（财信报告明列）；但属表单/模板类产品，暂不进排期 | 中 | P2（观察，暂缓） |
| 文档翻译 [WPS] | WPS 翻译属 AI/会员权益；需调用外部翻译 API 或大模型，非纯前端 | 中 | P3（需后端/AI，低优先） |
| 音频转文字（语音速记）[WPS] | 超级会员权益；浏览器 Web Speech 识别受限、离线模型体积大，非纯前端单页 | 大 | P3（低优先） |
| 简历/合同模板库 [WPS] | 稻壳/模板套餐收费；属内容库而非工具，与单页工具架构不符 | 中 | P3（形态不符，暂缓） |
| 论文查重 [WPS] | WPS 独立付费项（2026 年仍散落各处）；需论文比对库/后端，非纯前端单页 | 大 | P3（需后端，暂缓） |
| 电子签名/PDF 签名 [WPS] | 未确认为会员付费墙（国外价格站弱证据，国内官网列为常规功能），维持不列入 | 中 | 不列入 |
| ~~批量图片转文字 [WPS]~~（2026-10-14 17:00 已交付） | WPS「图片工具箱：批量转文字和表格」会员权益；已实现 `/tools/ocr-batch`（Node 端到端 55 项全过），归档 | 中 | ✅ 归档 |
| ~~PDF 转 PPT（文本提取版）[WPS]~~（2026-10-14 提前交付） | 收官枪 13:30 既定、10-14 提前交付（commit 7393640）；矩阵闭环完成 | 中 | ✅ 归档 |
| ~~批量 PDF 转 Word（文本提取版）[WPS]~~（2026-10-14 15:00 已交付） | WPS 会员核心权益「批量 PDF 转换」→ 已实现 `/tools/pdf-to-word-batch`（Node 端到端 21 项全过），归档 | 中 | ✅ 归档 |

**归档说明**：专题周（10-09 至 10-14）六日交付十六工具：10-09 PDF 合并 + PDF 拆分 + PDF 转图、10-10 加水印、10-11 OCR、10-12 图片转 PDF、10-13 批注打码 + 页面管理 + 加密/解密、10-14 PDF 压缩 + 转 Word（文本提取版）+ 扫描件/图片转 Excel + 文档修复 + PDF 转 PPT（文本提取版，收官枪提前交付）+ 批量 PDF 转 Word（文本提取版）+ 批量图片转文字（均已部署 /tool-web 并通过 QA，见已实现节）；10-15 收官日已有交付物在手（PDF 转 PPT），留作 QA 兜底与新品类准备日；10-16 起以思维导图开辟新品类（表格拆分备选同开「表格工具」品类，长图拼接做节奏调节位）。

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

## 今日候选（2026-10-14 · 产品调研推荐，第九轮 17:36）

> **本周特别方向（2026-10-09 至 10-15）第 6 天**：今日（10-14）仍在区间内；10-15 收官「PDF 转 PPT（文本提取版）[WPS]」待开发（PM 13:30 决策）；本轮为**10-16 起新品类排期定序**。

**交付核对**：批量 PDF 转 Word（文本提取版）[WPS] 已按 15:00 PM 决策交付（`templates/pdf_to_word_batch.html` + `static/js/pdf-to-word-batch.js` 新建，`categories.go` 注册 `/tools/pdf-to-word-batch`，Node 端到端 21 项全过），自候选划掉并归入已实现；专题周连续六日交付十三工具。

**今日新信号**（2026-10-14 17:36 全网调研）：
1. **表格拆分是 WPS VIP 功能**（360doc 2025-12-09 拆分表格教程）：「WPS 表格右键拆分表格，工作表按照内容拆分。这个功能是 VIP。」——付费墙实锤，为本轮唯一新增 P1 [WPS] 候选。纯前端 SheetJS（在栈，xlsx-0.18.5 vendor）可做：上传 .xlsx → 选表头列 → 按唯一值分组 → 多 sheet 一书 / 逐个导出 + JSZip 打包。V2EX 约 181 天前开发者自荐「免费 Excel 拆分神器」独立验证需求侧——「处理大表按部门/地区列拆分分发，手动筛选复制易出错」，但其走云端上传、异步接收结果；ToolWeb 差异化「浏览器本地处理、免账号」。
2. **长图拼接为 WPS Premium 海外版明列专属功能**（YouTube 官方推广视频描述：OCR feature, long picture … exclusive features of the Premium subscription）。需求侧：CSDN 截图软件评测点名「Snipaste 没有长截图」是明显短板、小旺AI截图以补齐长截图拼接为卖点；手机端 LongPic 免费（App 内广告/内购形态），网页端长截图拼接竞品稀少（splitanimage.com 是反向的「图片分割」九宫格）。纯前端 canvas 纵向拼接，难度小。列为 P2 新候选。
3. **WPS 官方 2026-07-06 回应「被WPS背刺了」**（观察者网/网易，约 100 天前）：金山办公声明「免费功能不收费、会员权益不上移、高成本服务独立计费」；回应「批量清理缓存划入会员付费区」争议称已启动优化——官方对冲叙事，但网易《WPS 会员套路曝光》仍在被引、信任危机未缓解。ToolWeb「不用开 WPS 会员」传播卖点继续有效；注意口径合规（不重复官方已声明澄清的指控）。
4. **电子签名维持不列入**：国外价格站 saasworthy 明列 WPS Pro "Full electronic signature feature"，但第二轮已定「WPS 电子签名（未确认为会员付费墙，不列入）」——国内官网/教程列为常规功能，证据等级不足，维持排除。
5. 小众软件 2026-10-12 帖：WPS 加载项「文档列表侧边栏」开发者自荐（免费 + 19.9 买断）——桌面客户端生态话题，非 web 工具需求，不列入。

**推荐 Top3**（10-16 起排期建议；努力度为单页前端交付量级评估）：

1. **思维导图 [WPS]** — P1（10-16 起首选新品类，顺位不动）：财信研报超级会员权益包明列「思维导图权益包」，付费墙实锤；「一开会员就是几百块」痛点再确认；免费替代要么装客户端（亿图脑图）要么走 AI 账号（Neumap/yeschat 走云端 + 账号）；纯前端树编辑 + 导出 PNG/SVG/Markdown（mi/mind-map MIT 路线验证）、localStorage 存草稿免注册。难度中。SEO：思维导图、在线思维导图、免费思维导图。
2. **表格拆分（按列拆分多表）[WPS]** — P1（新候选，10-16/17 备选）：WPS 表格「拆分表格」为 VIP 功能，付费墙实锤；V2EX「免费 Excel 拆分神器」验证「按部门/地区列拆分分发」需求（走云端异步，ToolWeb 差异化浏览器本地处理免账号）；SheetJS + JSZip 均在栈，单页可承载（上传 xlsx → 选列 → 分组预览 → 多 sheet 一书导出 / 打包下载）；开辟「表格工具」新品类，与思维导图同为 10-16 起新品类双核。难度中。SEO：Excel拆分、表格按列拆分、Excel按列拆分、Excel分表。
3. **批量图片转文字 [WPS]** — P2（10-16 起备选）：WPS「图片工具箱：批量转文字和表格」会员权益（川大 WPS365 明列）；单文件 OCR 已于 10-11 交付，批量为矩阵内最后一格；复用 tesseract.js（在栈）多图队列逐个识别 → 合并 txt / 逐文件导出 / JSZip 打包，承接 OCR「图片→文字」旅程线（「一张张转太累→批量扔进来」）。难度中。SEO：批量图片转文字、批量OCR、图片批量转文字。

**WPS 候选表更新**（2026-10-14 17:36 第九轮；批量 PDF 转 Word 已交付归档；新增表格拆分 P1、长图拼接 P2）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 思维导图 [WPS] | 财信研报超级会员权益包明列「思维导图权益包」付费墙实锤；「一开会员就是几百块」；免费替代要么装客户端要么走 AI 账号；纯前端树编辑 + 导出 PNG/SVG/Markdown 可行 | 中 | P1（10-16 起首选新品类） |
| 表格拆分（按列拆分多表）[WPS] | **新候选**：WPS 表格「拆分表格」为 VIP 功能实锤（360doc 2025-12-09）；V2EX「免费 Excel 拆分神器」验证「按部门/地区列拆分分发」需求（走云端异步，ToolWeb 差异化本地处理免账号）；SheetJS + JSZip 在栈，单页可承载；开辟「表格工具」新品类 | 中 | P1（10-16/17 备选） |
| ~~批量图片转文字 [WPS]~~（2026-10-14 晚间已交付） | WPS「图片工具箱：批量转文字和表格」会员权益；单文件 OCR 已交付，批量为矩阵内最后一格；已实现 `/tools/ocr-batch`（Node 端到端 55 项全过），归档 | 中 | ✅ 归档 |
| 长图拼接 [WPS] | **新候选**：WPS Premium 海外版明列 "long picture" 为专属付费功能；CSDN 评测点名截图工具缺长截图为短板；手机端有免费 App 但网页端竞品稀少；纯前端 canvas 纵向拼接 | 小 | P2 |
| 流程图绘制 [WPS] | WPS/WPS 绘图增值功能；纯前端画布可做，但交互复杂、单日难保质量 | 大 | P2 |
| PDF 转 Word/Excel（完整版式版）[WPS] | 会员核心卖点；但纯前端版式还原差，易砸口碑——文本提取版先行验证诚实范围策略 | 中 | P2（低优先，质量风险） |
| 批量处理（批量改名/压缩等剩余子集）[WPS] | 批量 PDF 转换已拆分为独立候选（批量 PDF 转 Word 已交付归档）；剩余子集（批量改名清单等）价值视拆分而定 | 中 | P2 |
| 简历生成器 [WPS] | 简历服务套餐为会员独立付费项（财信报告明列）；但属表单/模板类产品，暂不进排期 | 中 | P2（观察，暂缓） |
| 文档翻译 [WPS] | WPS 翻译属 AI/会员权益；需调用外部翻译 API 或大模型，非纯前端 | 中 | P3（需后端/AI，低优先） |
| 音频转文字（语音速记）[WPS] | 超级会员权益；浏览器 Web Speech 识别受限、离线模型体积大，非纯前端单页 | 大 | P3（低优先） |
| 简历/合同模板库 [WPS] | 稻壳/模板套餐收费；属内容库而非工具，与单页工具架构不符 | 中 | P3（形态不符，暂缓） |
| 论文查重 [WPS] | 新发现：WPS 独立付费项（2026 年仍散落）；需论文比对库/后端，非纯前端单页 | 大 | P3（需后端，暂缓） |
| 电子签名/PDF 签名 [WPS] | 未确认为会员付费墙（国外价格站弱证据，国内官网列为常规功能），维持不列入 | 中 | 不列入 |
| ~~PDF 转 PPT（文本提取版）[WPS]~~（10-15 既定，PM 13:30 决策待开发） | WPS 超级会员「PDF 转写编辑」矩阵内「转出」最后一格；Smallpdf 每天 2 次额度实锤、WPS 免费额度压缩；转 Word 文本版已验证诚实范围策略可复用 | 中 | ✅ 10-15 既定（待开发） |
| ~~批量 PDF 转 Word（文本提取版）[WPS]~~（2026-10-14 15:00 已交付） | WPS 会员核心权益「批量 PDF 转换」→ 已实现 `/tools/pdf-to-word-batch`（Node 端到端 21 项全过），归档 | 中 | ✅ 归档 |

**归档说明**：专题周（10-09 至 10-14）连续六日交付十三工具：10-09 PDF 合并/拆分 + PDF 转图、10-10 加水印、10-11 OCR、10-12 图片转 PDF、10-13 批注打码 + 页面管理 + 加密/解密、10-14 PDF 压缩 + 转 Word（文本提取版）+ 扫描件/图片转 Excel + 文档修复 + 批量 PDF 转 Word（均已部署 /tool-web 并通过 QA，见已实现节）；10-15 收官「PDF 转 PPT（文本提取版）[WPS]」待开发；10-16 起以思维导图开辟新品类（表格拆分备选同开「表格工具」品类）。

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

## 今日任务（2026-10-14 17:00 · 产品经理决策 ✅）

**交付状态**：已交付（2026-10-14 晚间前端开发轮：`templates/ocr_batch.html` + `static/js/ocr-batch.js` 新建，`categories.go` 注册 `/tools/ocr-batch`（`pdf_to_word_batch` 之后，Icon `copy_all` 已验证有效），`ocr_image_text.html`/`images_to_pdf.html` 互链；Node 端到端验证 55 项全过（队列逐个识别/超时可读报错队列继续/合并 txt BOM+文件名分隔/JSZip 打包/双 CDN 失败不白屏/>50MB 提示）；go build 通过，HTTP 冒烟：`/tools/ocr-batch` 200、sitemap 收录、首页「文档转换」分类批量 PDF 转 Word 旁「新」徽标入口）。本决策执行 2026-10-14 第九轮调研推荐 Top3 中唯一可在专题周内排期的候选；WPS 专题周「PDF 转写编辑矩阵 + 图片工具箱矩阵」全闭环，10-15 收官日（PDF 转 PPT 已在手）留作 QA 兜底与新品类准备日。

**选定：批量图片转文字 [WPS]** — 路由 `/tools/ocr-batch`（模板 `ocr_batch`），归「文档转换」分类。WPS「图片工具箱：批量转文字和表格」会员权益正面刚；单文件 OCR（10-11 交付）的旅程线延伸，「一张张转太累 → 批量扔进来」。

**决策理由**：
1. 付费墙实锤：WPS 会员权益明列「图片工具箱：批量转文字和表格」（川大 WPS365 会员权益）；单文件 OCR 已于 10-11 交付，批量为「图片→文字」旅程线矩阵内最后一格。
2. 技术复用链完整：tesseract.js v6 + tessdata_fast 语言包（jsdelivr CDN 懒加载 + IndexedDB 缓存）已在 `ocr-image-text.js` 验证；JSZip 双 CDN 懒加载链（cdnjs 3.10.1 → npmmirror）已在 docx-repair 验证；单 worker 队列逐个识别单页可承载，难度中，单日可高质量交付。
3. PM 口径延续「专题周内不切换品类」：思维导图（P1，10-16 起首选新品类）与表格拆分（P1，10-16/17 备选、开辟「表格工具」新品类）顺位不动，今日不提前开新品类；长图拼接（P2）难度小但证据链弱于批量 OCR，顺延 10-16 起备选。
4. 避免重复：今日已交付六个 PDF/文档方向工具（压缩、转 Word、图片转 Excel、文档修复、转 PPT、批量转 Word），批量 OCR 是 OCR 旅程线延伸，新题不重复；与单文件版互链形成「单张精校 → 批量快转」旅程线。
5. 收官节奏：本轮交付后，WPS 专题周「PDF 转写编辑矩阵 + 图片工具箱矩阵」全闭环；10-15 收官日（已有 PDF 转 PPT 在手）留作 QA 兜底与 10-16 新品类（思维导图）准备日。

**规格**：
1. 上传区（参照 `ocr_image_text` 上传区与文案口径）：点击选择 + 拖拽**多选**图片（`accept=image/*` + `multiple`）；单文件 >50MB 提示「文件较大，识别可能较慢」、不硬拦截；文件仅本地浏览器处理、不上传服务器，页面文案明示；文件列表展示缩略图、文件名、大小、状态（待处理/识别中/完成/失败）。
2. 批量识别（`static/js/ocr-batch.js`）：复用 `ocr-image-text.js` 的 tesseract 链——tesseract.js v6（jsdelivr CDN 懒加载，与单文件版同链，CDN 失败可读报错）+ tessdata_fast 语言包（chi_sim+eng，IndexedDB 缓存已验证）；单 worker 复用、队列**逐个**识别（识别完一张释放页面对象再处理下一张，防内存堆积）；单张超时/失败可读中文报错、队列继续。开发阶段评估是否把「引擎初始化 + ensureLib」抽成公共模块供单文件版与批量版共用；若单日风险高，允许先复制改写并注明 TODO 后续合并，避免逻辑分叉无人认领。
3. 结果与导出：① 合并 .txt 一键导出（`<批量OCR_YYYYMMDD_HHmm.txt>`，BOM，每段前标注原文件名分隔）；② 逐个单独复制/下载；③ JSZip（cdnjs 3.10.1 → npmmirror 双 CDN 懒加载，与 docx-repair 同链，失败可读报错）打包每张独立 .txt 下载。合并导出默认含全部成功项，失败项在汇总中列出。
4. 进度与异常：总体进度（`正在识别第 n / N 张`）+ 引擎状态（`正在加载识别引擎…`/`正在识别…`，复用单文件版状态文案）+ 单张进度条；全部失败时给出汇总提示不白屏。
5. 注册：`tools/categories.go`「文档转换」（doc）分类内、`pdf_to_word_batch` 之后新增工具 ID `ocr_batch`，Name「批量图片转文字」，Description「多张截图/照片一次转成文字，本地识别不上传、不限次免费」，Path `/tools/ocr-batch`，Icon `copy_all`（开发阶段验证 Material Icons 可用性，无则换 `filter_none`），New: true；通用路由自动映射，无需新增 Go 路由；sitemap 自动生成。
6. SEO：title「批量图片转文字 - 免费在线批量 OCR（不上传/不限次）」、description、keywords（批量图片转文字、批量OCR、图片批量转文字、截图批量转文字）；JSON-LD 与 canonical 沿用现有工具页写法；页面内与 OCR 单文件版（「单张精校」互链）、图片转 PDF 互链。
7. 移动端适配：缩略图列表纵向布局不错乱；按钮点击区够大；识别中给出「请勿锁屏/切换后台」提示（tesseract 在后台标签页可能被节流，页面如实说明）。
8. 底部使用说明区：注明与 WPS 对比卖点（WPS「图片工具箱：批量转文字和表格」为会员权益 vs 本地识别不上传、不限次免费、不用登录）；诚实说明适用边界（识别准确率取决于图片清晰度、手写体/复杂排版从简、低清图建议先用站内图片工具预处理）；给出「攒了一堆截图/课件照片一次转完」场景文案。

**验收标准**：
- [ ] `/tools/ocr-batch` 返回 200，首页「文档转换」分类可见入口（排在批量 PDF 转 Word 旁，「新」徽标）；sitemap 已收录
- [ ] 5 张典型图片（中文截图 2 张、手机拍课件 2 张、英文 1 张）批量识别：合并 .txt 内容完整、每段前有原文件名分隔、中文无乱码（Node 端到端验证识别流程；真机浏览器识别准确率待评审/QA）
- [ ] 合并 txt 下载可用，文件名 `批量OCR_YYYYMMDD_HHmm.txt`；逐个复制/下载可用；JSZip 打包下载可用
- [ ] 单张识别失败（损坏图片/纯色图无文字）：可读中文报错、队列继续、不中断后续图片
- [ ] 异常不崩：tesseract/语言包/JSZip CDN 懒加载失败可读报错、页面不白屏；>50MB 可读提示不硬拦截；全部失败汇总提示不白屏
- [ ] 诚实文案：页面使用说明区含「准确率取决于图片清晰度、手写体/复杂排版从简」
- [ ] 全程纯前端、无新增后端接口、无文件上传请求；`go build` 通过；SEO meta 完整；移动端布局不错乱；公网页面无 /tools/ 残留链接

**预计改动文件**：`templates/ocr_batch.html`（新建）、`static/js/ocr-batch.js`（新建）、`tools/categories.go`（文档转换分类注册工具）、`templates/ocr_image_text.html`（互链）、`BACKLOG.md`（本小节）。

## 今日任务（2026-10-14 15:00 · 产品经理决策 ✅）

**交付状态**：已交付（2026-10-14 15:00 前端开发轮：`templates/pdf_to_word_batch.html` + `static/js/pdf-to-word-batch.js` 新建，`categories.go` 注册 `/tools/pdf-to-word-batch`，`pdf_to_word.html`/`pdf_to_ppt.html` 互链；Node 端到端验证 21 项全过）。13:30 轮排期的收官枪「PDF 转 PPT（文本提取版）[WPS]」已于本日稍后由前端开发轮交付（commit `7393640`，`templates/pdf_to_ppt.html` + `static/js/pdf-to-ppt.js`，`categories.go` 已注册 `/tools/pdf-to-ppt`，docx-repair 无闭合残段兜底修复同轮带上）——BACKLOG 13:30 小节的「待开发」状态已过期，本轮一并订正；收官矩阵闭环完成，10-15 收官日已有交付物在手。本决策执行 2026-10-14 第八轮调研推荐 Top2（P1），为 13:30 决策落选说明中明确「顺延为收官备选/加分项」的批量版。

**选定：批量 PDF 转 Word（文本提取版）[WPS]** — 路由 `/tools/pdf-to-word-batch`（模板 `pdf_to_word_batch`），归「文档转换」分类。WPS 会员核心权益「批量 PDF 转换」正面刚，「攒了三四份讲义一次转完」场景。

**决策理由**：
1. 痛点三重实锤：黑猫投诉老会员「批量 PDF 转换」权益被无通知拆分；网易「被WPS背刺了」批量权益收费再实锤；连云港传媒网实测 Smallpdf 免费每天仅 2 次、WPS 免费额度大幅压缩；iLovePDF 批量多选 + 独立进度条 + 打包下载验证「手头攒了三四份讲义」场景明确。
2. 技术复用链完整：`pdf-to-word.js` 提取逻辑（pdf.js 3.11.174 逐页 getTextContent → 阅读顺序重排 → docx 9.5.1 UMD 生成 .docx）已验证；JSZip 在栈（docx-repair 已用 cdnjs 3.10.1 → npmmirror 双 CDN 懒加载）；多文件队列单页可承载，努力度中，单日可高质量交付。
3. 落选说明：思维导图（P1）——PM 口径「10-16 起首选新品类，专题周内不切换品类」延续，今日 10-14 不提前开新品类，顺位不动；批量图片转文字（P2）——单文件 OCR 已于 10-11 交付、批量为矩阵内最后一格，但优先级低于批量 PDF 转 Word，顺延。
4. 避免重复：今日已交付 PDF 压缩、PDF 转 Word、扫描件/图片转 Excel、文档修复、PDF 转 PPT 五个工具，批量版是新题；与单文件版互链形成「单个精转 → 批量快转」旅程线。

**规格**：
1. 上传区（参照 `pdf_to_word` 上传区与文案口径）：点击选择 + 拖拽**多选** PDF（`accept=.pdf` + `multiple`）；单文件 >50MB 提示「文件较大，处理可能较慢」、不硬拦截；文件仅本地浏览器处理、不上传服务器，页面文案明示；文件列表展示文件名、大小、页数、状态（待处理/处理中/完成/失败/扫描件跳过）。
2. 批量转换（`static/js/pdf-to-word-batch.js`）：复用 `pdf-to-word.js` 提取逻辑——pdf.js（3.11.174，cdnjs UMD + worker，与单文件版同版本同懒加载方式，CDN 失败可读报错）逐页 `getTextContent`；按阅读顺序重排（同一行 Y 容差合并、行内 X 排序）；docx 9.5.1 UMD（unpkg 主 + npmmirror 备 + 本地 vendor 兜底，与单文件版同链）按段落生成 .docx Blob。开发阶段评估是否抽取公共模块 `static/js/pdf-text-extract.js` 供单文件版与批量版共用（长期正确做法）；若单日风险高，允许先复制改写并注明 TODO 后续合并，避免逻辑分叉无人认领。
3. 打包下载：JSZip（cdnjs 3.10.1 → npmmirror 双 CDN 懒加载，与 docx-repair 同链，失败可读报错）把多个 .docx 打成 zip 下载，文件名 `批量PDF转Word_YYYYMMDD_HHmm.zip`；同时支持逐个单独下载（列表每行下载按钮）。
4. 扫描件检测：沿用单文件版口径（采样前 3 页、总字符 <30 → 判定扫描件），该文件标记「扫描件跳过」并引导站内 OCR（`/tools/ocr-image-text`），**不中断队列**、不导出空文档。
5. 进度与异常：总体进度（`正在处理第 n / N 个文件`）+ 单文件内页进度（`正在提取第 m / M 页`）；加密/损坏 PDF 单个文件可读中文报错、队列继续；全部失败时给出汇总提示不白屏。
6. 注册：`tools/categories.go`「文档转换」（doc）分类内、`image_to_excel` 之后新增工具 ID `pdf_to_word_batch`，Name「批量 PDF 转 Word」，Description「多个 PDF 一次转成可编辑 Word（文本提取版），本地处理不上传、不限次免费」，Path `/tools/pdf-to-word-batch`，Icon `library_books`（开发阶段验证 Material Icons 可用性，无则换 `file_copy`），New: true；通用路由自动映射，无需新增 Go 路由；sitemap 自动生成。
7. SEO：title「批量 PDF 转 Word - 免费在线批量转换（不上传/不限次）」、description、keywords（批量PDF转Word、PDF批量转Word、PDF批量转Word免费）；JSON-LD 与 canonical 沿用现有工具页写法；页面内与 PDF 转 Word（「单个精转」互链）、PDF 转 PPT、OCR（扫描件引导）互链。
8. 移动端适配：文件列表纵向布局不错乱；按钮点击区够大；文件名过长截断不撑破布局；大文件逐页释放、小屏进度不卡死。
9. 底部使用说明区：注明与 WPS 对比卖点（WPS 批量转换为会员核心权益、老会员权益被拆分 vs 本地处理不上传、不限次免费、不用登录）；诚实说明适用边界（文本版转换、复杂版式从简、扫描件请走站内 OCR）；给出「攒了三四份讲义/合同一次转完」场景文案。

**验收标准**：
- [ ] `/tools/pdf-to-word-batch` 返回 200，首页「文档转换」分类可见入口（排在图片转 Excel 旁，「新」徽标）；sitemap 已收录
- [ ] 3 个典型文本型 PDF（中文标题+正文+多栏页）批量转换：每个输出 .docx 内容完整、段落顺序正确、中文无乱码（Node 端到端验证提取逻辑；真机 Word/WPS 打开待评审/QA）
- [ ] 打包 zip 下载可用，文件名 `批量PDF转Word_YYYYMMDD_HHmm.zip`；逐个单独下载可用
- [ ] 扫描件 PDF：标记「扫描件跳过」并引导 OCR，不中断队列、不导出空文档
- [ ] 异常不崩：加密/损坏 PDF 单个文件可读中文报错、队列继续；JSZip/pdf.js/docx CDN 懒加载失败可读报错、页面不白屏；>50MB 可读提示不硬拦截
- [ ] 诚实文案：页面使用说明区含「文本版转换、复杂版式从简、扫描件请走 OCR」
- [ ] 全程纯前端、无新增后端接口、无文件上传请求；`go build` 通过；SEO meta 完整；移动端布局不错乱；公网页面无 /tools/ 残留链接

**预计改动文件**：`templates/pdf_to_word_batch.html`（新建）、`static/js/pdf-to-word-batch.js`（新建）、`tools/categories.go`（文档转换分类注册工具）、`templates/pdf_to_word.html`（互链）、`templates/pdf_to_ppt.html`（互链）、`BACKLOG.md`（本小节）。

---

## 今日候选（2026-10-14 · 产品调研推荐，第八轮 15:36）

> **本周特别方向（2026-10-09 至 10-15）第 6 天**：今日（10-14）仍在区间内。13:30 PM 已决策 10-15 专题周收官日为「PDF 转 PPT（文本提取版）[WPS]」（待开发，见上方 PM 决策节），本轮为**收官日后（10-16 起）排期定序**。10-16 起按既定转入新品类（思维导图首选），专题周内不切换品类的 PM 口径延续。

**交付核对**：专题周连续六日交付十三工具：10-09 PDF 合并/拆分 + PDF 转图、10-10 加水印、10-11 OCR、10-12 图片转 PDF、10-13 批注打码 + 页面管理 + 加密/解密、10-14 PDF 压缩 + 转 Word（文本提取版）+ 扫描件/图片转 Excel + 文档修复（均已部署 /tool-web 并通过 QA，见已实现节）；10-15 收官「PDF 转 PPT（文本提取版）[WPS]」待开发。

**今日新信号**（2026-10-14 15:36 全网调研）：
1. **WPS 会员体系全貌再对齐**（财信证券 2024-03 深度报告）：超级会员权益包明列 PDF 权益包、图片权益包、**思维导图权益包**、模板库权益包、素材库权益包；独立付费套餐矩阵：PDF 套餐、云盘套餐、模板库套餐、素材库套餐、图片套餐、文档校对套餐、批量套餐、简历服务套餐；大会员在超级会员之上叠加 AI 矩阵（AI 写文章/生成 PPT/文档阅读/翻译等，月度限次）。**思维导图付费墙实锤落地为研报明列**，10-16 首选顺位加固。
2. **批量付费墙再实锤**（网易约 112 天前「被WPS背刺了」）：「批量 PDF 转换、AI 文稿等权益被从老会员拆分」，批量清理缓存曾划入会员权益；2026 年会员精简为超级会员（连续包年 105 元/年）与大会员（158 元/年）两档后，仍有「PDF 专项套餐、图片处理套餐、论文查重」等独立付费小包散落各处。**批量 PDF 转 Word（P1）顺位稳固**。
3. **批量需求竞品验证**：连云港传媒网经网易约 90 天前实测——Smallpdf 免费用户每天仅 2 次转换额度，「一两页简单文件」之外不够用；WPS 免费额度同步压缩；iLovePDF 支持多选多份、独立进度条、打包下载——「手头攒了三四份讲义」场景明确。
4. **AI 挤压宏观信号升级**：网易约 112 天前——豆包收费版（连续包月 68 元起）内置 Office，「一句话生成文档/表格/PPT、无水印导出」，「既然都要付费，凭啥选 WPS」。纯前端「文件不离开浏览器、免账号」路线护城河可继续，但 AI 免费能力侵蚀长尾需求，工具交付节奏不宜放缓。
5. **新候选评估——批量图片转文字**：WPS 会员权益明列「图片工具箱：批量转文字和表格」（川大 WPS365 会员权益，第五轮已记录）；单文件 OCR 已于 10-11 交付，**批量为矩阵内最后一格**；复用 tesseract.js 在栈，多图队列逐个识别 → 合并 txt / 逐文件导出 / JSZip 打包下载，单页可承载。列为 P2 新候选。
6. **简历生成器评估（暂不立项）**：简历服务套餐为会员独立付费项（财信报告明列），但「填表生成简历」属表单/模板类产品，专题周内不切换品类的 PM 口径下不进排期；且简历/合同模板库已判 P3（内容库形态不符），生成器暂记 P2 观察、不列入今日 Top3。

**推荐 Top3**（10-16 起排期建议；努力度为单页前端交付量级评估）：

1. **思维导图 [WPS]** — P1（10-16 起首选新品类，顺位不动）：财信研报超级会员权益包明列「思维导图权益包」，付费墙实锤；「一开会员就是几百块」痛点再确认；免费替代要么装客户端（亿图脑图）要么走 AI 账号（Neumap/yeschat 走云端+账号）；纯前端树编辑 + 导出 PNG/SVG/Markdown（mi/mind-map MIT 路线验证）、localStorage 存草稿免注册。难度中。SEO：思维导图、在线思维导图、免费思维导图。
2. **批量 PDF 转 Word（文本提取版）[WPS]** — P1（10-16/17 备选）：WPS 会员核心权益「批量 PDF 转换」；黑猫投诉老会员批量权益被拆分；iLovePDF 批量多选打包下载验证需求；复用 pdf-to-word 提取逻辑 + JSZip（在栈）打包下载，多文件队列单页可承载；与单文件版互链。难度中。SEO：批量PDF转Word、PDF批量转Word。
3. **批量图片转文字 [WPS]** — P2（新候选，10-16 起备选）：WPS「图片工具箱：批量转文字和表格」会员权益交叉验证；单文件 OCR 已交付，批量为矩阵内最后一格；复用 tesseract.js（在栈）逐个识别 → 合并 txt / 逐文件导出 / JSZip 打包，承接 OCR「图片→文字」旅程线（「一张张转太累→批量扔进来」）。难度中。SEO：批量图片转文字、批量OCR、图片批量转文字。

**WPS 候选表更新**（2026-10-14 15:36 第八轮；PDF 转 PPT 归入 10-15 既定待开发，新增批量图片转文字 P2）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 思维导图 [WPS] | **新信号**：财信研报超级会员权益包明列「思维导图权益包」，付费墙实锤；「一开会员就是几百块」；免费替代要么装客户端要么走 AI 账号；纯前端树编辑 + 导出 PNG/SVG/Markdown 可行 | 中 | P1（10-16 起首选新品类） |
| 批量 PDF 转 Word（文本提取版）[WPS] | WPS 会员核心权益「批量 PDF 转换」；黑猫投诉老会员批量权益被拆分；网易「被WPS背刺了」再实锤批量权益收费；iLovePDF 批量多选打包下载验证需求；复用转 Word 提取逻辑 + JSZip 打包 | 中 | P1（10-16/17 备选） |
| 批量图片转文字 [WPS] | **新候选**：WPS「图片工具箱：批量转文字和表格」会员权益（川大 WPS365 明列）；单文件 OCR 已交付，批量为矩阵内最后一格；复用 tesseract.js 在栈，多图队列逐个识别 + 合并/打包导出 | 中 | P2（新候选） |
| 流程图绘制 [WPS] | WPS/WPS 绘图增值功能；纯前端画布可做，但交互复杂、单日难保质量 | 大 | P2 |
| PDF 转 Word/Excel（完整版式版）[WPS] | 会员核心卖点；但纯前端版式还原差，易砸口碑——文本提取版先行验证诚实范围策略 | 中 | P2（低优先，质量风险） |
| 批量处理（批量改名/压缩等剩余子集）[WPS] | 批量 PDF 转换已拆分为独立候选（批量 PDF 转 Word P1）；剩余子集（批量改名清单等）价值视拆分而定 | 中 | P2 |
| 简历生成器 [WPS] | 新评估：简历服务套餐为会员独立付费项（财信报告明列）；但属表单/模板类产品，专题周内不切换品类，不进今日排期 | 中 | P2（观察，暂缓） |
| 文档翻译 [WPS] | WPS 翻译属 AI/会员权益；需调用外部翻译 API 或大模型，非纯前端 | 中 | P3（需后端/AI，低优先） |
| 音频转文字（语音速记）[WPS] | 超级会员权益；浏览器 Web Speech 识别受限、离线模型体积大，非纯前端单页 | 大 | P3（低优先） |
| 简历/合同模板库 [WPS] | 稻壳/模板套餐收费；属内容库而非工具，与单页工具架构不符 | 中 | P3（形态不符，暂缓） |
| 论文查重 [WPS] | WPS 独立付费项（2026 年仍散落各处）；需论文比对库/后端，非纯前端单页 | 大 | P3（需后端，暂缓） |
| ~~PDF 转 PPT（文本提取版）[WPS]~~（10-15 既定，PM 13:30 决策待开发） | WPS 超级会员「PDF 转写编辑」矩阵内「转出」最后一格；Smallpdf 每天 2 次额度实锤、WPS 免费额度压缩；转 Word 文本版已验证诚实范围策略可复用 | 中 | ✅ 10-15 既定（待开发） |

**归档说明**：专题周（10-09 至 10-14）连续六日交付十三工具：10-09 PDF 合并/拆分 + PDF 转图、10-10 加水印、10-11 OCR、10-12 图片转 PDF、10-13 批注打码 + 页面管理 + 加密/解密、10-14 PDF 压缩 + PDF 转 Word（文本提取版）+ 扫描件/图片转 Excel + 文档修复（均已部署 /tool-web 并通过 QA，见已实现节）；10-15 收官「PDF 转 PPT（文本提取版）[WPS]」待开发；10-16 起以思维导图开辟新品类。

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

## 今日任务（2026-10-14 13:30 · 产品经理决策 ✅）

**交付状态**：待开发。10-14 11:40 轮「文档修复/损坏文档文字抢救 [WPS]」已交付（commit `abace1c`/`c5c1b6d`/`ca05846`，已部署 /tool-web 并 QA 通过），链条无断点。本决策执行 2026-10-14 第七轮调研推荐 Top1，为 10-15 专题周收官日排期。

**选定：PDF 转 PPT（文本提取版）[WPS]** — 路由 `/tools/pdf-to-ppt`（模板 `pdf_to_ppt`），归「文档转换」分类。WPS 超级会员「PDF 转写编辑」矩阵内「转出」最后一格（转 Word 文本版、图片转 Excel 已交付），专题周收官枪。

**决策理由**：
1. 执行第七轮研究推荐：13:00 第七轮调研把「PDF 转 PPT（文本提取版）」提级为 **P0（10-15 收官首选）**，近连续九轮「调研推荐 Top1 → 交付」链条无断点（加水印→OCR→图片转PDF→批注打码→页面管理→加密/解密→压缩→转 Word→图片转 Excel→文档修复）。
2. 痛点实锤：连云港传媒网经网易约 90 天前实测横评——Smallpdf 免费用户每天仅 2 次转换额度，「一两页简单文件」之外不够用；WPS 免费额度同步压缩（「早年超级会员无限次 PDF 转换，如今免费额度大幅压缩」）。
3. 诚实范围错位：同篇实测竞品翻车点（合同带公章图片页、页脚细线框 → 文字跑位或整页变大图无法编辑）正好是文本提取版的诚实说明边界——不承诺版式/图片还原，页面如实说明「文本版转换、复杂版式从简」，扫描件/图片页分流站内 OCR。
4. 技术可行且单日可高质量交付：复用转 Word 文本版已验证策略——pdf.js（3.11.174 在栈）逐页提取文本 → pptxgenjs（CDN 懒加载）生成 .pptx；纯前端单页、无新增后端接口。
5. 落选说明：批量 PDF 转 Word（文本提取版，P1 收官备选）——复用转 Word 提取逻辑 + JSZip 打包可行，但矩阵内「转出」最后一格（PDF 转 PPT）先行补齐矩阵闭环，批量版顺延为收官备选/加分项；思维导图（P1）——PM 口径「10-16 起首选新品类，专题周内不切换品类」，顺位不动。

**规格**：
1. 上传区（参照 `pdf_to_word` 上传区与文案口径）：点击选择 + 拖拽上传单个 PDF（>50MB 提示「文件较大，处理可能较慢」、不硬拦截）；文件仅本地浏览器处理、不上传服务器，页面文案明示；上传后展示文件名、文件大小、总页数；加密/损坏 PDF 加载失败给出可读中文报错、页面不白屏。
2. 文本提取（`static/js/pdf-to-ppt.js`）：复用 `pdf-to-word.js` 的提取逻辑——pdf.js（3.11.174，cdnjs UMD + worker，与 pdf-to-image 同版本同懒加载方式，CDN 失败可读报错）逐页 `getTextContent`；按阅读顺序重排——同一行按 Y 容差合并文本项、行内按 X 排序，空行保留段落分隔；多栏页面可能串行，页面如实说明。
3. 扫描件检测：采样前 3 页文本提取结果，若几乎无文本 → 明确提示「这是扫描件 PDF，文本提取版无法识别」，引导按钮跳转站内 OCR（`/tools/ocr-image-text`），不导出空文档。
4. 幻灯片生成（pptxgenjs，CDN 懒加载 UMD，如 jsdelivr；CDN 失败可读报错）：每 PDF 页 → 一张幻灯片；首文本行（或首段）作标题、其余文本作正文（保留段落分隔）；字号/行距按页面文本量自适应分档（从简，不逐像素还原版式）；开发阶段先跑「提取→生成→用 WPS/PowerPoint 打开」小样验证 pptxgenjs 导出可用。
5. 导出选项：正文字体（等线/宋体/微软雅黑，默认等线）+ 字号（大/中/小三档，默认中）；导出文件名 `<原名>.pptx`；全程进度显示（`正在提取第 n / N 页` + `正在生成幻灯片` 两阶段）；结果区展示「转换 X 页 / 生成 Y 张幻灯片」+ 重新导出（换字体字号再导）。
6. 注册：`tools/categories.go`「文档转换」（doc）分类内、`docx_repair` 之后新增工具 ID `pdf_to_ppt`，Name「PDF 转 PPT」，Description「PDF 转可编辑 PPT（文本提取版），本地处理不上传、不限次免费」，Path `/tools/pdf-to-ppt`，Icon `slideshow`（Material Icons 开发阶段验证可用性，无则换 `present_to_all`/`play_arrow`），New: true；通用路由 `/tools/:tool` 自动映射模板 `pdf_to_ppt`，无需新增 Go 路由；sitemap 自动生成。
7. SEO：title「PDF 转 PPT - 免费在线 PDF 转 PPT（不上传/不限次/可编辑）」、description、keywords（PDF转PPT、PDF转PPT免费、PDF转可编辑PPT、PDF转PPT不上传）；JSON-LD 与 canonical 沿用现有工具页写法；页面内与 PDF 转 Word（「转出后→Word 细改」）、OCR（扫描件引导）、图片转 Excel 互链。
8. 移动端适配：选项面板纵向布局不错乱；按钮点击区够大；文件名过长截断不撑破布局；大文件提取进度在小屏不卡死（逐页释放）。
9. 底部使用说明区：注明与 WPS 对比卖点（WPS 免费 PDF 转换额度大幅压缩、要登录要会员 vs 本地处理不上传、不限次免费、不用登录）；诚实说明适用边界（文本版转换、复杂版式/图片/公章页从简、图片无法还原为可编辑元素、扫描件请走站内 OCR）；给出「把讲义 PDF 转成可编辑课件」教师/培训场景文案。

**顺带修复（收官轮同开发轮交付）**：docx-repair 兜底路径增强（12:00 轮真实浏览器实测发现、已记入待办优化节）——`document.xml` 被截断到无任何 `</w:p>` 闭合标签时增加无闭合残段 `w:t` 粗提取（按文档顺序拼文本、`w:br/w:tab` 断行）；样例文件在 `~/workspace/tmp/docx-test/`。小项，收官轮顺手交付，不单独立项。

**加分项（今日第二步，进度顺利则带上）**：批量 PDF 转 Word（文本提取版）初步链路——多文件队列逐个转换 + JSZip 打包下载（P1 候选最小闭环）。

**验收标准**：
- [ ] `/tools/pdf-to-ppt` 返回 200，首页「文档转换」分类可见入口（排在文档修复旁，「新」徽标）；sitemap 已收录
- [ ] 典型文本型 PDF（3 页中文文档，含标题+正文段落+多栏页）：导出 .pptx 每页对应一张幻灯片、标题首行准确、正文段落顺序正确、中文无乱码（Node 端到端验证提取逻辑；真机 WPS/PowerPoint 打开待评审/QA）
- [ ] 扫描件 PDF：可读提示「这是扫描件 PDF，文本提取版无法识别」并引导 OCR，不导出空文档
- [ ] 导出文件名 `<原名>.pptx`；全程有进度显示（两阶段）；结果区展示「转换 X 页 / 生成 Y 张幻灯片」
- [ ] 异常不崩：加密/损坏 PDF 可读中文报错；pdf.js / pptxgenjs CDN 懒加载失败可读报错、页面不白屏；>50MB 可读提示不硬拦截
- [ ] 诚实文案：页面使用说明区含「文本版转换、复杂版式从简、图片/公章页无法还原可编辑、扫描件请走 OCR」
- [ ] 全程纯前端、无新增后端接口、无文件上传请求；`go build` 通过；SEO meta 完整；移动端布局不错乱；公网页面无 /tools/ 残留链接
- [ ] docx-repair 兜底增强顺手交付：极端截断样（corrupted.docx）能提取残段文字，不再报「没有提取到任何文字」

**预计改动文件**：`templates/pdf_to_ppt.html`（新建）、`static/js/pdf-to-ppt.js`（新建）、`tools/categories.go`（文档转换分类注册工具）、`templates/pdf_to_word.html`（互链）、`templates/ocr_image_text.html`（互链）、`static/js/docx-repair.js`（兜底增强顺带）、`BACKLOG.md`（本小节）。

---

## 今日候选（2026-10-14 · 产品调研推荐，第七轮 13:00）

> **本周特别方向（2026-10-09 至 10-15）第 6 天**：今日（10-14）仍在区间内；明日 10-15 为专题周收官日，日程现为空置、待 PM 决策。**交付核对**：文档修复/损坏文档文字抢救 [WPS] 已按 11:40 PM 决策交付（commit `abace1c`/`c5c1b6d`/`ca05846`，`templates/docx_repair.html` + `static/js/docx-repair.js`，`categories.go` 已注册 `/tools/docx-repair`，JSZip 解包文字抢救），自候选划掉并归入已实现；12:00 轮浏览器实测补充的兜底优化项已有两项修复提交（c5c1b6d 兜底换行丢失、ca05846 状态文字残留），完整兜底增强（无闭合残段 w:t 粗提取）待 PM 排期。专题周交付线更新为：10-09 合并/拆分 + 转图、10-10 加水印、10-11 OCR、10-12 图片转 PDF、10-13 批注打码 + 页面管理 + 加密/解密、10-14 压缩 + 转 Word + 图片转 Excel + 文档修复（连续六日十三工具）。

**今日新信号**（2026-10-14 13:00 全网调研）：
1. **PDF 转 PPT 免费额度痛点实锤**：连云港传媒网经网易约 90 天前实测横评——Smallpdf 免费用户每天仅 2 次转换额度，「一两页简单文件」之外不够用；WPS 免费额度同步压缩（网易：「早年超级会员无限次 PDF 转换，如今免费额度大幅压缩」）。ToolWeb 空白位延续「网页即用、文件不离开浏览器、不限次、免登录」。
2. **竞品翻车点 = 诚实范围边界**：同篇实测——合同带公章图片、页脚细线框时，在线工具「要么文字跑位，要么整页变成一张大图塞进幻灯片无法编辑」。纯前端文本提取版正好错位：不承诺版式/图片还原，页面如实说明「文本版转换、复杂版式从简」，扫描件/图片页分流站内 OCR——与转 Word 文本版已验证的策略同构。
3. **批量需求被竞品行为验证**：iLovePDF 的 PDF 转 PPT 支持按住 Ctrl 多选多份、独立进度条、打包下载，「手头攒了三四份讲义」场景明确；WPS 会员矩阵「批量 PDF 转换」为核心权益（黑猫投诉：老会员批量转换权益被拆分）。ToolWeb 已有单文件转 Word 文本版 → **批量 PDF 转 Word（文本提取版）** 为自然延伸：多文件队列 + 逐个转换 + JSZip 打包下载，单页可承载。
4. **涉密场景强化「不上传」护城河**：同篇实测指出设计/法务人群「涉密排版稿、盖章合同一旦上传到公开服务器心里悬」→ 本地路线更受青睐；ToolWeb「文件不离开浏览器、免账号」差异化继续有效。
5. **AI 路线新变量**：轻竹办公（qzoffice.com）「输入主题/上传文档→AI 生成 PPT」免费不限次（CSDN 软文）——AI 做的是「生成」，ToolWeb 纯前端做的是「提取」，错位不直接竞争；WPS 灵犀走 AI 会员，属 P3 路线不动。
6. **WPS 独立付费项新发现**：163 网易订阅约 92 天前梳理——2026 年会员精简为超级会员（105/年）与大会员（158/年）两档后，仍有「PDF 专项套餐、图片处理套餐、论文查重」等独立付费项目散落各处。**论文查重**为新发现的独立付费项，但需论文比对库/后端，非纯前端单页形态 → 记 P3 不列入排期。
7. 微博 CEO 王高飞 #被WPS背刺了# 冲热搜（约 112 天前）：会员套娃、权益缩水、C 盘缓存占用——「不用开 WPS 会员」传播卖点继续有效，信任危机叙事未缓解。

**推荐 Top3**（10-15 专题周收官日排期建议；努力度为单页前端交付量级评估）：

1. **PDF 转 PPT（文本提取版）[WPS]** — P0（10-15 收官首选）：WPS 超级会员「PDF 转写编辑」矩阵内「转出」最后一格（转 Word 文本版、图片转 Excel 已交付）；Smallpdf 每天 2 次额度实锤、WPS 免费额度压缩；复用转 Word 文本版已验证的诚实范围策略——pdf.js（在栈）逐页提取文本 → pptxgenjs（CDN 懒加载）生成 .pptx，版式从简、扫描件/图片页分流 OCR；竞品翻车点（公章图片页、细线框）正好是诚实说明边界。难度中。SEO：PDF转PPT、PDF转PPT免费、PDF转PPT不上传。
2. **批量 PDF 转 Word（文本提取版）[WPS]** — P1（新候选，收官备选）：WPS 会员核心权益「批量 PDF 转换」；iLovePDF 批量多选验证需求；复用 pdf-to-word 提取逻辑，多文件队列逐个转换 + JSZip（在栈）打包下载，单页可承载；与单文件版互链。难度中。SEO：批量PDF转Word、PDF批量转Word。
3. **思维导图 [WPS]** — P1（10-16 起首选新品类，顺位不动）：「一开会员就是几百块」痛点再确认；免费替代要么装客户端（亿图脑图）要么走 AI 账号；纯前端树编辑 + 导出 PNG/SVG/Markdown（mi/mind-map MIT 路线验证）、localStorage 存草稿免注册。难度中。SEO：思维导图、在线思维导图、免费思维导图。

**WPS 候选表更新**（2026-10-14 13:00 第七轮；文档修复已交付归档，PDF 转 PPT 提级为 P0 收官首选，新增批量 PDF 转 Word P1、论文查重 P3）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| PDF 转 PPT（文本提取版）[WPS] | 新信号：Smallpdf 每天仅 2 次额度实锤；WPS 免费额度压缩；转 Word 文本版已验证诚实范围策略可复用（pdf.js → pptxgenjs，版式从简、扫描件走 OCR）；「转出」矩阵最后一格 | 中 | P0（10-15 收官首选） |
| 批量 PDF 转 Word（文本提取版）[WPS] | 新候选：WPS 会员核心权益「批量 PDF 转换」；iLovePDF 批量多选验证需求；复用转 Word 提取逻辑 + JSZip 打包，多文件队列单页可承载 | 中 | P1（收官备选） |
| 思维导图 [WPS] | 「一开会员就是几百块」；免费替代要么装客户端要么走 AI 账号；纯前端树编辑 + 导出 PNG/SVG/Markdown 可行 | 中 | P1（10-16 起首选新品类） |
| 流程图绘制 [WPS] | WPS/WPS 绘图增值功能；纯前端画布可做，但交互复杂、单日难保质量 | 大 | P2 |
| PDF 转 Word/Excel（完整版式版）[WPS] | 会员核心卖点；但纯前端版式还原差，易砸口碑——文本提取版先行验证诚实范围策略 | 中 | P2（低优先，质量风险） |
| 批量处理（批量改名/压缩等剩余子集）[WPS] | 批量 PDF 转换已拆分为独立候选；剩余子集（批量改名清单等）价值视拆分而定 | 中 | P2 |
| 文档翻译 [WPS] | WPS 翻译属 AI/会员权益；需调用外部翻译 API 或大模型，非纯前端 | 中 | P3（需后端/AI，低优先） |
| 音频转文字（语音速记）[WPS] | 超级会员权益；浏览器 Web Speech 识别受限、离线模型体积大，非纯前端单页 | 大 | P3（低优先） |
| 简历/合同模板库 [WPS] | 稻壳/模板套餐收费；属内容库而非工具，与单页工具架构不符 | 中 | P3（形态不符，暂缓） |
| 论文查重 [WPS] | 新发现：WPS 独立付费项（2026 年仍散落）；需论文比对库/后端，非纯前端单页 | 大 | P3（需后端，暂缓） |
| ~~文档修复/损坏文档文字抢救 [WPS]~~（2026-10-14 已交付） | WPS 超级会员权益明列「文档修复」→ 已实现 `/tools/docx-repair`（commit abace1c/c5c1b6d/ca05846，JSZip 解包文字抢救），归档 | 中 | ✅ 归档 |

**归档说明**：专题周（10-09 至 10-14）连续六日交付十三工具：10-09 PDF 合并/拆分 + PDF 转图、10-10 加水印、10-11 OCR、10-12 图片转 PDF、10-13 批注打码 + 页面管理 + 加密/解密、10-14 PDF 压缩 + PDF 转 Word（文本提取版）+ 扫描件/图片转 Excel + 文档修复（均已部署 /tool-web 并通过 QA，见已实现节）；10-15 收官日程现空置、待 PM 决策；10-16 起以思维导图开辟新品类。

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

## 待办优化（2026-10-14 12:00 轮次浏览器实测补充）

- [优化] docx-repair 兜底路径增强：真实浏览器实测发现，`document.xml` 被截断到没有任何 `</w:p>` 闭合标签时，`drExtractParagraphsFallback()` 正则按 `</w:p>` 切段返回空数组 → 工具报「没有提取到任何文字」，但文件中仍有可恢复的 `w:t` 文字。候选方案：兜底增加对无闭合残段的 `w:t` 粗提取（按文档顺序拼文本、用 `w:br/w:tab` 断行）。同顺带修：失败时蓝色状态文字「正在加载解包组件…」未被清除（catch 分支漏调 `setStatus('')`）。样例文件留存在 `~/workspace/tmp/docx-test/`（corrupted.docx 为极端截断样，valid.docx 为完好样）。未回滚：失败路径文案诚实、无白屏、无数据风险，不属核心功能不可用。

## 今日任务（2026-10-14 11:40 · 产品经理决策 ✅）

**交付状态**：🛠️ 开发交付（2026-10-14 前端开发轮）。实现文件已提交开发分支，待评审→部署→QA。

**开发交付记录**：
- 新增 `templates/docx_repair.html`（SEO meta：title/文档修复关键词/canonical/JSON-LD；「新」徽标入口紧随 PDF 转 Word）
- 新增 `static/js/docx-repair.js`：JSZip（cdnjs 3.10.1 → npmmirror 双 CDN 懒加载）解包，`word/document.xml` 按 w:p 取段、w:t 取字、w:br 换行；DOM 解析失败时正则兜底粗提取；文本框嵌套 w:p 去重；页眉/页脚顺带提取并标注来源；导出 `<原名>_抢救.txt`（BOM）与复用 vendor docx-9.5.1 重建 `<原名>_修复版.docx`；两阶段进度（解包分析/生成文档）；结果区「抢救出 X 段 / Y 字」
- 诚实范围：zip 索引损坏 →「文件结构损坏严重，无法抢救」不白屏不导出空文件；.doc 老格式（OLE 魔数判定）→ 引导另存为 .docx；加密文档（EncryptionInfo 判定）→ 引导解密并互链 PDF 加密/解密；>50MB 提示不硬拦截；JSZip/docx CDN 失败可读报错
- `tools/categories.go` 注册 `docx_repair`（文档转换分类、healing 图标、New: true）；`pdf_to_word.html`、`ocr_image_text.html` 使用说明区互链
- 验证：`go build` 通过；本地 `/tools/docx-repair` 200、sitemap 收录、首页「文档转换」分类入口 + 「新」徽标；Node 端到端 26 项全过（中文段落/跨 run/换行/制表/实体/文本框/页眉提取、截断 XML 正则兜底、坏 zip 拒绝、vendor docx 重建往返读回无乱码）

本决策执行 2026-10-14 第六轮调研推荐 Top1。今日 09:38 轮收官枪「扫描件/图片转 Excel [WPS]」已交付部署并 QA 通过（commit 8173fa3/ab36fab），链条无断点。

**选定：文档修复/损坏文档文字抢救 [WPS]** — 路由 `/tools/docx-repair`（模板 `docx_repair`），归「文档转换」分类。WPS 专题周新 P0 候选、会员权益「文档修复」正面刚。

**决策理由**：
1. 执行第六轮研究推荐：11:36 第六轮调研把「文档修复」列为本轮唯一新增 P0 候选（WPS 超级会员权益明列「文档修复」，三言科技 2026-06-25 会员权益对比实锤，会员墙明确）；「Word 提示文件损坏时要么开会员要么重写」是未被覆盖的痛点，「文件损坏不用开会员」传播卖点强。
2. 技术可行且单日可高质量交付：docx 本质 zip 容器（Microsoft Q&A 口径：把 .docx 改成 .zip 就能打开看），JSZip 已在栈（cdnjs 3.10.1 CDN 懒加载先例：pdf-merge-split、exif-strip），纯前端单页、无新增后端接口；docx 9.5.1 UMD 已入 vendor（可复用生成可打开副本）。
3. 诚实范围策略延续：zip 索引完好 → 解包提取 document.xml 文字做轻量抢救；索引损坏/.doc 老格式/加密文档 → 如实提示无解或引导，不赌修坏 zip。
4. SEO 长尾明确：「文件损坏打不开」中文求助帖持续存在，关键词文档修复/docx损坏/word打不开/文件损坏修复。
5. 落选说明：思维导图（P1）——PM 口径「10-16 起首选新品类，专题周内不切换品类」，顺位不动；PDF 转 PPT（文本提取版，P2 保留）——诚实范围策略已在转 Word 文本版验证，但本轮唯一新增信号是文档修复 P0，应把最强牌先出，收官日前留足打磨时间。

**规格**：
1. 上传区（参照 `pdf_to_word` 上传区与文案口径）：点击选择 + 拖拽上传单个 .docx（>50MB 提示「文件较大，处理可能较慢」、不硬拦截）；文件仅本地浏览器以 ArrayBuffer 处理、不上传服务器，页面文案明示；上传后展示文件名、文件大小；非 docx/损坏到 zip 索引读不出来 → 可读中文报错、页面不白屏。
2. 抢救（`static/js/docx-repair.js`）：JSZip（cdnjs 3.10.1 CDN 懒加载，失败可读报错）解包；读取 `word/document.xml`，提取 `w:t` 文本、保留段落/换行（`w:p` 换段、`w:br` 换行）；页面展示抢救出的文字预览 + 字数统计；文本框/页眉页脚文字若存在尽量提取（从简，页面如实说明）。
3. 导出：① 纯文本 `.txt` 下载（`<原名>_抢救.txt`）；② 复用 vendor `docx-9.5.1.umd.js` 按段落重建可打开的 `.docx` 副本（`<原名>_修复版.docx`），zip 结构完整、document.xml 良构；导出前预览确认，进度两阶段（`正在解包分析` + `正在生成文档`）。
4. 诚实范围：zip 索引损坏 → 明确提示「文件结构损坏严重，无法抢救，建议用备份/历史版本」；.doc 老格式 → 提示「老格式 .doc 不支持，请先在 Word/WPS 另存为 .docx 后再试」；加密文档 → 提示并互链站内 PDF 加密/解密工具（如加密为 PDF）；非 zip 内容 → 可读中文报错。
5. 注册：`tools/categories.go`「文档转换」（doc）分类内、`pdf_to_word` 之后新增工具 ID `docx_repair`，Name「文档修复」，Description「损坏的 Word 文档文字抢救，本地解包不上传、免注册不限次」，Path `/tools/docx-repair`，Icon `healing`（开发阶段验证 Material Icons 可用性，无则换 `build`），New: true；通用路由 `/tools/:tool` 自动映射模板 `docx_repair`，无需新增 Go 路由；sitemap 自动生成。
6. SEO：title「文档修复 - 损坏的 Word 文档文字抢救（免费在线）」、description、keywords（文档修复、docx损坏、word打不开、文件损坏修复、word文档损坏怎么恢复）；JSON-LD 与 canonical 沿用现有工具页写法；页面内与 PDF 转 Word（「转出后→Word 细改」）、OCR（扫描件引导）互链。
7. 移动端适配：选项面板与文字预览纵向布局不错乱；长文本预览区可滚动不撑破；按钮点击区够大；文件名过长截断。
8. 底部使用说明区：注明与 WPS 对比卖点（WPS 文档修复为超级会员权益 vs 本地解包不上传、免注册不限次、不用登录）；诚实说明适用边界（轻量文字抢救非完整修复、版式/图片/复杂结构从简、zip 索引损坏无解）；给出「赶稿前夜文档打不开」职场场景文案。

**验收标准**：
- [ ] `/tools/docx-repair` 返回 200，首页「文档转换」分类可见入口（排在 PDF 转 Word 旁，「新」徽标）；sitemap 已收录
- [ ] 构造损坏 docx 小样（zip 索引完好但 Word 提示损坏打不开）：文字完整提取、段落顺序正确；.txt 与 .docx 副本均可打开、中文无乱码
- [ ] zip 索引损坏文件：可读提示「文件结构损坏严重，无法抢救」，页面不白屏、不导出空文件
- [ ] .doc 老格式 / 加密文档：给出对应的可读引导提示
- [ ] 异常不崩：JSZip CDN 懒加载失败可读报错；>50MB 可读提示不硬拦截；损坏图片/非 docx 上传可读中文报错
- [ ] 导出文件名 `<原名>_抢救.txt` / `<原名>_修复版.docx`；全程有进度显示；结果区展示「抢救出 X 段 / Y 字」
- [ ] 诚实文案：页面使用说明区含「轻量文字抢救、版式从简、zip 索引损坏无解」
- [ ] 全程纯前端、无新增后端接口、无文件上传请求；`go build` 通过；SEO meta 完整；移动端布局不错乱；公网页面无 /tools/ 残留链接

**预计改动文件**：`templates/docx_repair.html`（新建）、`static/js/docx-repair.js`（新建）、`tools/categories.go`（文档转换分类注册工具）、`templates/pdf_to_word.html`（互链）、`templates/ocr_image_text.html`（互链）、`BACKLOG.md`（本小节）。

## 今日任务（2026-10-14 09:38 · 产品经理决策 ✅）

**交付状态**：✅ 已交付（2026-10-14 收尾轮）。commit `8173fa3` 已推送开发分支 `muse/dev-20260929`；经 deploy.sh 部署到 /tool-web 开发版成功（DEPLOY_OK），qa.sh image-to-excel 全过（QA_PASS）。
- 评审轮（同日 09:47）：发现 `image-to-excel.js` 头注释承诺纯逻辑 Node 可测，但顶部 vendor 回退 IIFE 与底部 DOMContentLoaded 绑定在模块加载时直接访问 `document`，Node require 抛 ReferenceError；已加 `typeof document` 守卫修复（浏览器行为不变），commit `ab36fab` 推送开发分支，重新 deploy.sh 部署（DEPLOY_OK，qa.sh QA_PASS）。

**交付验证记录**：
- go build 通过；`/tools/image-to-excel` 本地 200，公网 `https://www.it-tool.eu.cc/tool-web/image-to-excel` 200；首页「文档转换」分类 PDF 转 Word 旁入口 + 「新」徽标；sitemap 已收录
- Node 端到端小样 19 项全过：5x6 中文表格（词级坐标模拟）→ groupWordsToGrid 5 行 6 列、24 单元格文本零串行 → vendor SheetJS 0.18.5 生成 .xlsx → 读回行列/文本完全一致；无表格散字判定 not-table（不导出空表，提示走 OCR）
- DOM 初始化冒烟测试通过；vendor 兜底路径在 /tool-web 前缀下正确推导且公网 200
- SheetJS 加载策略落定：CDN 懒加载（jsdelivr→unpkg）+ 本地 vendor 兜底同回退链末位，`ensureLib` 先查 `window.XLSX` 无双重加载；Icon `grid_on` 落定
- 公网页面无 /tools/ 残留链接；VPS /tools 与 /hiking/ 回归 200，未触碰生产
- 遗留说明：PC 端 Chrome 访问 www.it-tool.eu.cc 持续 ERR_CONNECTION_RESET（PC→VPS 网络路径问题，与部署无关；VM 侧 curl 200 正常）；真机 Excel/WPS 打开 .xlsx 待用户侧体验

**选定：扫描件/图片转 Excel [WPS] —— 收尾交付** — 路由 `/tools/image-to-excel`（模板 `image_to_excel`），「文档转换」分类。今日唯一任务，不另开新题。

**决策理由**：
1. 执行第五轮调研确认：05:40 决策定序零变动，近连续八轮「调研推荐 Top1 → 交付」链条无断点；今日再开新题等于把收官枪丢在半路。
2. 工作区现状已核实（2026-10-14 09:38）：`templates/image_to_excel.html`（13.6KB）、`static/js/image-to-excel.js`（23KB，tesseract 识别 + SheetJS 导出逻辑齐全，`node --check` 通过）、`static/js/vendor/xlsx-0.18.5.umd.js`（882KB）均为实质文件；`tools/categories.go` 已注册 `image_to_excel`（Icon 落为 `grid_on`，即 05:40 规格备注的"无 table_view 则换 grid_on"口径，收尾评审确认即可）；互链改动（`ocr_image_text.html`、`pdf_to_word.html`）已在工作区。只差验证→提交→评审→部署→QA。
3. 铁律一天一个任务：收尾交付（验证/提交/评审修复/部署/QA）本身就是一轮完整工作量，高质量闭环优先于开新坑。
4. 落选说明：思维导图（10-16 起首选新品类，专题周内不切换品类，顺位不动）；PDF 转 PPT 文本提取版（P2 新候选，收官日后再议）；其余 P2/P3 维持。

**规格（收尾交付）**：
1. 验证收尾（沿用 05:40 决策验收标准逐条过）：本地 `go build` 通过；`/tools/image-to-excel` 返回 200；首页「文档转换」分类入口紧随 PDF 转 Word（「新」徽标）；sitemap 收录；SEO meta（title/description/keywords/canonical/JSON-LD）完整；Node 端到端小样——典型表格截图（规则行列 5x6 中文表头）导出 .xlsx 行列结构正确、单元格文本完整无串行，无表格图片给出可读提示「未检测到明显表格结构，建议走站内 OCR」且不导出空表；异常路径（损坏图片 / tesseract.js 与 SheetJS CDN 懒加载失败 / >10MB 提示不硬拦截）可读中文报错、页面不白屏；全程纯前端、无新增后端接口、无文件上传请求；移动端布局（表格预览横向滚动不撑破、按钮点击区够大）不错乱。
2. 待确认项（收尾时定）：SheetJS 加载策略——05:40 规格为 CDN 懒加载 + 失败可读报错，工作区另有 `static/js/vendor/xlsx-0.18.5.umd.js` 本地副本，确认其用途（测试/回退）并避免双重加载；Icon `grid_on` 落定确认。
3. 提交：中文 commit message，推送开发分支 `muse/dev-20260929`；绝不碰 master、绝不 force-push（git 经 SSH 时 `GIT_SSH_COMMAND="ssh -i /home/hatch/.ssh/id_ed25519 -o StrictHostKeyChecking=no"`，动手前 `git fetch` 确认分支）；注意工作区无关文件 `toolWeb.bak-prev` 不要带入提交。
4. 评审修复 + 部署：按评审意见修复；经 `~/workspace/deploy/toolweb/deploy.sh` 部署到 /tool-web 开发版（公网 https://www.it-tool.eu.cc/tool-web/），健康检查通过；真实浏览器 QA 通过。
5. BACKLOG 状态更新：本小节「交付状态」改为已交付并记录 commit。

**验收标准**：
- [x] `go build` 通过；`/tools/image-to-excel` 200；首页「文档转换」分类入口可见（PDF 转 Word 旁，「新」徽标）；sitemap 已收录
- [x] 典型 5x6 中文表格截图：导出 .xlsx 行列结构正确、单元格文本完整无串行（Node + SheetJS 端到端验证；真机 Excel/WPS 打开待 QA）
- [x] 无表格图片：可读提示「未检测到明显表格结构，建议走站内 OCR」，不导出空表
- [x] 导出文件名 `<原名>.xlsx`；三阶段进度显示（识别中/分组生成中/导出 Excel）；结果区「识别 X 行 Y 列 / Z 个单元格」+ 一键重新导出
- [x] 异常不崩：损坏图片可读中文报错；tesseract.js/SheetJS CDN 失败可读报错不白屏；>10MB 可读提示不硬拦截
- [x] 诚实文案：使用说明区含「启发式行列分组、复杂合并单元格从简、图片质量影响识别率、纯文字请走 OCR」
- [x] 全程纯前端、无新增后端接口、无文件上传；SEO meta 完整；移动端不错乱；SheetJS 加载策略确认无双重加载
- [x] 已提交推送开发分支（中文 commit）；经 deploy.sh 部署 /tool-web 成功并通过 QA

**预计改动文件**：`templates/image_to_excel.html`（提交现货 + 评审修复）、`static/js/image-to-excel.js`（提交现货 + 评审修复）、`static/js/vendor/xlsx-0.18.5.umd.js`（提交现货）、`tools/categories.go`（提交现货）、`templates/ocr_image_text.html` + `templates/pdf_to_word.html`（互链，提交现货）、`BACKLOG.md`（本小节状态更新）。

## 今日候选（2026-10-14 · 产品调研推荐，第六轮 11:36）

> **本周特别方向（2026-10-09 至 10-15）第 6 天**：今日（10-14）在区间内，明日 10-15 为专题周收官日——但**收官枪「扫描件/图片转 Excel [WPS]」已于今日上午提前交付**（commit `8173fa3`/`ab36fab`，deploy.sh 部署 /tool-web 成功，qa.sh QA_PASS），10-15 日程现为空置、待 PM 决策。10-16 起转入新品类（思维导图首选），专题周内不切换品类的 PM 口径延续。

**今日新信号**（2026-10-14 11:36 全网调研）：
1. **「文档修复」是 WPS 超级会员明列权益**（三言科技 2026-06-25 会员权益对比：超级会员含 PDF 转写编辑、文档修复、图片处理；连续包年 105 元/年、大会员 158 元/年）：Word 提示「无法读取/文件损坏」时，用户要么开会员要么重写。Microsoft Q&A 证实 docx 本质是 zip 容器——zip 索引完好时可解包提取 document.xml 文字（把 .docx 改成 .zip 就能打开看）。ToolWeb 在栈（JSZip）可做**轻量损坏文档文字抢救**：zip 解包 → 提取正文 XML → 去标签输出文字/生成可打开副本；诚实限范围（zip 索引损坏则如实提示无解），属本轮唯一新增 [WPS] 候选。
2. WPS 信任危机叙事继续发酵：新浪科技 2026-06-25「套娃式收费」——超级会员拆分出 AI 会员/大会员，PDF/云盘/图片/模板拆分小包二次收费；自动续费弹窗字号极小、默认勾选；缓存塞满 C 盘、批量清理缓存曾划为会员权益——「不用开 WPS 会员」传播卖点继续有效，支撑文档修复/转出类候选。
3. PDF 转 Word 竞品实测（网易 2026-08）：真正分水岭是扫描件识别与中文表格还原；海外免费工具每天 2-3 次额度转不完一份正经合同；三更 PDF 国内免费不限次但走云端上传。ToolWeb「纯前端文本提取 + 诚实限范围 + 扫描件分流 OCR」定位正确，同策略可复用于 PDF 转 PPT（文本提取版）。
4. AI 挤压宏观信号：豆包收费版（连续包月 68 元起）内置 Office——一句话生成文档/表格/PPT、无水印导出，「既然都要付费，凭啥选 WPS」。纯前端「文件不离开浏览器、免账号」路线护城河可继续，但 AI 免费能力在侵蚀长尾需求，工具交付节奏不宜放缓。

**推荐 Top3**（10-15 收官日排期建议；努力度为单页前端交付量级评估）：

1. **文档修复/损坏文档文字抢救 [WPS]** — P0（10-15 收官日首选）：WPS 超级会员权益明列「文档修复」，会员墙实锤；docx zip 解包文字抢救纯前端单页可做（JSZip 在栈）；「文件损坏打不开」中文求助帖持续存在，SEO 长尾明确。难度中。SEO：文档修复、docx损坏、word打不开、文件损坏修复。
2. **思维导图 [WPS]** — P1（10-16 起首选新品类，顺位不动）：本轮新信号是豆包收费版内置 Office（AI 路线继续挤压 WPS 生态）；纯前端「网页即开、免安装、免登录、本地树编辑 + 导出 PNG/SVG/Markdown」空白依旧明确，顺位不动。难度中。SEO：思维导图、在线思维导图、免费思维导图。
3. **PDF 转 PPT（文本提取版）[WPS]** — P2 保留：竞品实测确认「免费额度转不完一份合同」是真实痛点；转 Word 文本版已验证诚实范围策略；pdf.js（在栈）逐页提取文本 → pptxgenjs（CDN 懒加载）生成 .pptx，版式从简、扫描件分流 OCR。难度中。SEO：PDF转PPT、PDF转PPT免费、PDF转可编辑PPT。

**WPS 候选表更新**（2026-10-14 11:36 第六轮；新增文档修复为 P0 候选；PDF 转 Word/压缩/图片转 Excel 等本轮已交付归档划掉）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 文档修复/损坏文档文字抢救 [WPS] | **新候选**：WPS 超级会员权益明列「文档修复」（2026-06-25 三言科技）；Word 提示文件损坏时要么开会员要么重写；docx zip 解包纯前端文字抢救可行（JSZip 在栈），诚实限范围策略延续 | 中 | P0（10-15 收官日首选） |
| 思维导图 [WPS] | 「一开会员就是几百块」痛点再确认；免费替代要么装客户端（亿图脑图）要么走 AI 账号；豆包收费版内置 Office 继续挤压，纯前端免登录本地树编辑空白明确 | 中 | P1（10-16 起首选新品类） |
| PDF 转 PPT（文本提取版）[WPS] | WPS 免费 PDF 转换额度大幅压缩；竞品实测分水岭在扫描件识别与中文表格还原、免费额度转不完一份合同；复用转 Word 文本版已验证的诚实范围策略 | 中 | P2 |
| 批量处理（批量转格式/改名/压缩）[WPS] | WPS 批量处理为会员卖点；纯前端可做批量改名清单生成等子集，价值视子功能而定 | 中 | P2 |
| 流程图绘制 [WPS] | WPS/WPS 绘图增值功能；纯前端画布可做，但交互复杂、单日难保质量 | 大 | P2 |
| PDF 转 Word/Excel（完整版式版）[WPS] | 会员核心卖点；但纯前端版式还原差，易砸口碑——文本提取版先行验证诚实范围策略 | 中 | P2（低优先，质量风险） |
| 文档翻译 [WPS] | WPS 翻译属 AI/会员权益；需调用外部翻译 API 或大模型，非纯前端 | 中 | P3（需后端/AI，低优先） |
| 音频转文字（语音速记）[WPS] | 超级会员权益；浏览器 Web Speech 识别受限、离线模型体积大，非纯前端单页 | 大 | P3（低优先） |
| 简历/合同模板库 [WPS] | 稻壳/模板套餐收费；属内容库而非工具，与单页工具架构不符 | 中 | P3（形态不符，暂缓） |

**归档说明**：专题周（10-09 至 10-14）连续六日交付十二工具：10-09 PDF 合并/拆分 + PDF 转图、10-10 加水印、10-11 OCR、10-12 图片批量转 PDF、10-13 批注打码 + 页面管理 + 加密/解密、10-14 PDF 压缩 + PDF 转 Word（文本提取版）+ 扫描件/图片转 Excel（均已部署 /tool-web 并通过 QA，见已实现节）；10-15 收官日程现空置（收官枪提前交付）、待 PM 决策；10-16 起以思维导图开辟新品类。

## 今日候选（2026-10-14 · 产品调研推荐，第五轮 09:36 收官确认）

> **本周特别方向（2026-10-09 至 10-15）第 6 天**：今日（10-14）在区间内，明日 10-15 为专题周收官日。产品经理已于今日 05:40 决策收官任务为「扫描件/图片转 Excel [WPS]」（见下方 PM 决策节），04:00 轮 develop 因 60 分钟超时中断、实现已基本完成待 08:14 轮接手收尾。本轮为第五次研究确认：**定序不变，PM 决策继续有效**；新增信号全部录入，供 develop 收尾与评审参考。10-16 起转入新品类（思维导图首选）。

**今日新信号**（2026-10-14 09:36 全网调研）：
1. 「图片转 Excel」竞争格局出现**新变量**：Windows 截图工具（Win+Shift+S →「扫描文字」→「复制为试算表」）约 28 天前在繁体区效率类账号走红，10 秒图片表格转剪贴板、系统级免费——这是轻闪（注册+每日 5 个）之外第二个「免费」路线。但其短板明确：仅输出 TSV 到剪贴板（无 .xlsx 导出、无预览校对）、仅 Windows、单图。ToolWeb 差异化口径收紧为「**浏览器即用跨平台、表格预览校对、一键导出 .xlsx、免注册不限次**」，并在页面如实说明启发式分组边界（诚实范围策略延续）。
2. AI 路线继续挤压但未破局：腾讯元宝（2025-10-29 360doc）图片转表格/CSV 转 Excel/多文件合并一句话搞定、yeschat.ai Image to Excel 免登录试用——均需 AI 账号或云端上传，「文件不离开浏览器、免账号」仍是纯前端路线的护城河。
3. 思维导图痛点再确认：360doc 2026-02-12「这6个免费站」点名「想用个专业点的思维导图软件，一开会员就是几百块」；亿图脑图 MindMaster+ 虽免费全功能但为**桌面客户端**（需安装），Neumap/yeschat 走 AI 生成（需 Google 账号/云端）。ToolWeb 切入点「**网页即开、免安装、免登录、纯本地树编辑+导出 PNG/SVG/Markdown**」空白明确，10-16 首选顺位不动。
4. WPS 会员信任危机叙事加码（网易 111 天前《WPS 会员套路曝光》仍在被引）：「早年超级会员无限次 PDF 转换，如今免费额度大幅压缩」「PDF/云盘/图片/模板拆分小包二次收费」——「不用开 WPS 会员」传播卖点继续有效，支撑 PDF 转出类候选。

**推荐 Top3**（10-15 收官日定序确认 + 10-16 展望；努力度为单页前端交付量级评估）：

1. **扫描件/图片转 Excel [WPS]** — P0（10-15 收官，PM 已决策 ✅，本轮调研确认定序不变）：WPS「图片工具箱：批量转文字和表格」会员权益交叉验证；新增信号未动摇排序——Windows 截图转试算表仅 TSV 剪贴板、AI 路线要账号/上传；ToolWeb 空白位「免注册、不限次、浏览器本地识别、预览校对、一键 .xlsx」。tesseract.js（在栈）词级坐标 + 启发式行列分组 → SheetJS 导出，复杂合并单元格从简、页面如实说明。难度中。SEO：图片转Excel、扫描件转Excel、表格识别、截图转Excel。
2. **思维导图 [WPS]** — P1（10-16 起首选新品类，专题周内不切换品类）：「一开会员就是几百块」痛点再确认；免费替代要么装客户端（亿图脑图）、要么走 AI 账号（Neumap/yeschat）；纯前端树编辑 + 导出 PNG/SVG/Markdown（mi/mind-map MIT 路线验证）、localStorage 存草稿免注册。难度中。SEO：思维导图、在线思维导图、免费思维导图。
3. **PDF 转 PPT（文本提取版）[WPS]** — P2 新候选：WPS「无限次 PDF 转换」免费额度大幅压缩（网易曝光文），PDF 转出为会员付费墙；PDF 转 Word 文本版已验证「纯前端文本提取 + 诚实限范围」策略（commit 5252fe2），同策略可复用——pdf.js（在栈）逐页提取文本 → pptxgenjs（CDN 懒加载）生成 .pptx，不承诺版式/图片还原，扫描件引导走站内 OCR。难度中。SEO：PDF转PPT、PDF转PPT免费、PDF转可编辑PPT。

**WPS 候选表更新**（2026-10-14 09:36 第五轮；定序不变，新增 PDF 转 PPT 文本版 P2，Windows 截图转试算表记入图片转 Excel 风险说明）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 扫描件/图片转 Excel [WPS] | WPS「图片工具箱：批量转文字和表格」会员权益；轻闪要注册+每日限 5 个、AI 路线要账号/上传；**新风险**：Windows 截图「复制为试算表」系统级免费但仅 TSV 剪贴板/无 xlsx/仅 Windows；ToolWeb 空白位「免注册不限次、预览校对、一键 xlsx、跨平台浏览器即用」 | 中 | P0（10-15 收官，PM 已决策） |
| 思维导图 [WPS] | 「一开会员就是几百块」痛点再确认；免费替代要么装客户端（亿图脑图）要么走 AI 账号（Neumap/yeschat）；纯前端树编辑 + 导出 PNG/SVG/Markdown 可行 | 中 | P1（10-16 起首选新品类） |
| PDF 转 PPT（文本提取版）[WPS] | 新候选：WPS 免费 PDF 转换额度大幅压缩；复用转 Word 文本版已验证的诚实范围策略（pdf.js 提取 → pptxgenjs 生成 .pptx，版式从简、扫描件走 OCR） | 中 | P2（新候选） |
| 批量处理（批量转格式/改名/压缩）[WPS] | WPS 批量处理为会员卖点；纯前端可做批量改名清单生成等子集，价值视子功能而定 | 中 | P2 |
| 流程图绘制 [WPS] | WPS/WPS 绘图增值功能；纯前端画布可做，但交互复杂、单日难保质量 | 大 | P2 |
| PDF 转 Word/Excel（完整版式版）[WPS] | 会员核心卖点；但纯前端版式还原差，易砸口碑——文本提取版先行验证诚实范围策略 | 中 | P2（低优先，质量风险） |
| 文档翻译 [WPS] | WPS 翻译属 AI/会员权益；需调用外部翻译 API 或大模型，非纯前端 | 中 | P3（需后端/AI，低优先） |
| 音频转文字（语音速记）[WPS] | 超级会员权益；浏览器 Web Speech 识别受限、离线模型体积大，非纯前端单页 | 大 | P3（低优先） |
| 简历/合同模板库 [WPS] | 稻壳/模板套餐收费；属内容库而非工具，与单页工具架构不符 | 中 | P3（形态不符，暂缓） |

**归档说明**：专题周（10-09 至 10-14）连续六日交付十二工具：10-09 PDF 合并/拆分 + PDF 转图、10-10 加水印、10-11 OCR、10-12 图片转 PDF、10-13 批注打码 + 页面管理 + 加密/解密、10-14 PDF 压缩 + PDF 转 Word（文本提取版，已部署上线 /tool-web 并通过 QA）；10-15 收官「扫描件/图片转 Excel [WPS]」（develop 04:00 轮超时中断，08:14 轮接手收尾），10-16 起以思维导图开辟新品类。

## 今日任务（2026-10-15 收官日 · 产品经理已决策 ✅）

**交付状态（2026-10-14 05:40 开发前决策）**：待开发。10-14 既定任务「PDF 转 Word（文本提取版）」已按今日 04:30 PM 决策交付（commit 5252fe2/2a0e67f，模板 `pdf_to_word`、`categories.go` 已注册 `/tools/pdf-to-word`），链条无断点。本决策执行 2026-10-14 第四轮调研推荐 Top1，为 10-15 专题周收官日定序。

**选定：扫描件/图片转 Excel [WPS]** — 路由 `/tools/image-to-excel`（模板 `image_to_excel`），归「文档转换」分类，WPS 专题周收官枪、OCR「图片→文字」旅程线向「图片→表格」延伸

> **调度员备注（2026-10-14 07:00，04:00 轮收尾）**：本任务 develop 阶段因子代理 60 分钟超时而中断，实现已基本完成但未提交——工作区现有 `templates/image_to_excel.html`（新建）、`static/js/image-to-excel.js`（新建，node --check 通过）、`static/js/vendor/xlsx-0.18.5.umd.js`（新建）、`tools/categories.go`（已注册 image_to_excel）、`templates/ocr_image_text.html` 与 `templates/pdf_to_word.html`（互链）。08:14 轮 develop 可直接接手验证收尾，无需重做。另：PDF 转 Word 已于本轮部署上线 /tool-web 并通过 QA（见 timeline）。

**决策理由**：
1. 执行第四轮研究推荐：10-14 四轮调研定序零变动，「扫描件/图片转 Excel」由 P1 提级为 **P0（10-15 收官首选）**，近连续八轮「调研推荐 Top1 → 交付」链条无断点（加水印→OCR→图片转PDF→批注打码→页面管理→加密/解密→压缩→转 Word）。
2. 决定性竞品信号：轻闪图片转 Excel（2026-01-09 上线，新浪科技）走「浏览器本地处理」路线验证心智，但免费要**注册、每天限 5 个文件、单文件 10MB、批量收费**；ToolWeb 切入点「**免注册、不限次、文件不离开浏览器**」仍是空白位。
3. WPS 会员矩阵对齐：三言科技 2026-06-25 超级会员权益明列「图片处理」、川大 WPS365 会员权益明列「图片工具箱：批量转文字和表格」——「图片转 Excel（表格）」是矩阵内尚未覆盖的最后一格（OCR、压缩、加密/解密、转 Word 已覆盖），交叉验证为会员功能。
4. 旅程闭环收益最高：承接 OCR「图片→文字」旅程线到「图片→表格」，与 OCR 双向互链（「纯文字→OCR / 表格→本页」）、与 PDF 转 Word 互链（「表格提取完→转 Word 排版」）；主管丢表格截图、财务报表扫描场景高频。
5. 诚实范围策略延续：转 Word 文本版已验证「纯前端文本提取 + 诚实限范围」策略（V2EX pdf-to-md.app 同路线独立验证）；转 Excel 延续该策略——启发式行列分组、复杂合并单元格从简、页面如实说明，不赌结构还原质量。
6. 落选说明：思维导图（P1）——10-16 起首选新品类，专题周内不切换品类，顺位不动。批量处理（P2 保留）——价值视子功能拆分而定，收官日不进排期。PDF 转 Word 完整版式版（P2，版式还原质量风险）——文本版先行验证策略，暂不拆。

**规格**：
1. 上传区（参照 `ocr_image_text` 上传区与文案口径）：点击选择 + 拖拽上传单个图片（JPG/PNG/WebP；>10MB 提示「文件较大，识别可能较慢」、不硬拦截）；文件仅本地浏览器处理、不上传服务器，页面文案明示；上传后展示文件名、文件大小、图片尺寸与缩略图预览；损坏图片加载失败给出可读中文报错、页面不白屏。
2. 识别（`static/js/image-to-excel.js`）：tesseract.js v6（jsdelivr CDN 懒加载，与 `ocr-image-text.js` 同款，语言包经 IndexedDB 缓存，CDN 失败可读报错）获取词级文本框坐标；启发式行列分组——按 Y 容差聚行、按 X 区间聚类推导列边界，生成二维网格；合并单元格/多表同页从简（按文本行输出），页面如实说明。
3. 预览确认：识别后展示表格预览（HTML 表格渲染网格 + 「识别 X 行 Y 列 / Z 个单元格」），用户确认后再导出。
4. 导出：SheetJS xlsx（CDN 懒加载 UMD，CDN 失败可读报错）生成 .xlsx；导出文件名 `<原名>.xlsx`；全程进度显示（`识别中` + `分组生成中` + `导出 Excel` 三阶段）；结果区展示「识别 X 行 Y 列 / Z 个单元格」+ 一键重新导出。
5. 注册：`tools/categories.go`「文档转换」（doc）分类内、`pdf_to_word` 之后新增工具 ID `image_to_excel`，Name「图片转 Excel」，Description「截图/扫描件表格转 Excel，本地识别不上传、免注册不限次」，Path `/tools/image-to-excel`，Icon `table_view`（Material Icons 已验证可用集合——开发阶段验证，无则换 `grid_on`），New: true；通用路由 `/tools/:tool` 自动映射模板 `image_to_excel`，无需新增 Go 路由；sitemap 自动生成。
6. SEO：title「图片转 Excel - 免费在线表格识别（不上传/不限次）」、description、keywords（图片转Excel、扫描件转Excel、表格识别、图片表格转Excel、截图转Excel）；JSON-LD 与 canonical 沿用现有工具页写法（域名 www.johnkingzcq123.xyz）；页面内与 OCR（「纯文字→OCR 图片文字识别」「表格→本页」双向互链）、PDF 转 Word（「表格提取完→转 Word 排版」）互链。
7. 移动端适配：选项面板与表格预览纵向布局不错乱；表格预览横向滚动不撑破布局；按钮点击区够大；文件名过长截断不撑破布局。
8. 底部使用说明区：注明与 WPS 对比卖点（WPS 图片工具箱转表格要会员 vs 本地识别不上传、免注册不限次、不用登录）；诚实说明适用边界（启发式行列分组、复杂合并单元格/多表同页从简、识别准确率受图片质量/倾斜/手写影响，纯文字图片请走站内 OCR）；给出「主管丢表格截图要可编辑版」职场场景文案。

**加分项（今日第二步，进度顺利则带上）**：导出前列宽手动微调；多图批量识别合并为多 Sheet（呼应 WPS「批量转文字和表格」权益）；CSV 导出备选。

**验收标准**：
- [ ] `/tools/image-to-excel` 返回 200，首页「文档转换」分类可见入口（排在 PDF 转 Word 旁）
- [ ] 典型表格截图（规则行列 5x6 中文表头）：导出 .xlsx（Node + SheetJS 端到端验证：行列结构正确、单元格文本完整无串行；真机 Excel/WPS 打开待评审/QA）
- [ ] 无表格图片：给出可读提示「未检测到明显表格结构，建议走站内 OCR」，不导出空表
- [ ] 导出文件名 `<原名>.xlsx`；全程有进度显示；结果区展示「识别 X 行 Y 列 / Z 个单元格」
- [ ] 异常不崩：损坏图片有可读中文报错；tesseract.js/SheetJS CDN 懒加载失败有可读报错、页面不白屏；>10MB 有可读提示不硬拦截
- [ ] 诚实文案：页面使用说明区含「启发式行列分组、复杂合并单元格从简、图片质量影响识别率、纯文字请走 OCR」
- [ ] 全程纯前端、无新增后端接口、无文件上传请求；`go build` 通过；SEO meta 完整；移动端布局不错乱

**预计改动文件**：`templates/image_to_excel.html`（新建）、`static/js/image-to-excel.js`（新建）、`tools/categories.go`（文档转换分类注册工具）、`templates/ocr_image_text.html`（互链「表格→转 Excel」）、`templates/pdf_to_word.html`（互链「表格提取完→转 Word 排版」）、`BACKLOG.md`（本小节）。

## 今日任务（2026-10-14 · 产品经理已决策 ✅）

**交付状态（2026-10-14 前端开发已交付）**：已实现并自测通过，待评审/QA。10-14 凌晨轮「PDF 压缩」已交付（commit e35387c），本轮为 10-15 专题周收官枪。

**交付记录（前端开发自测）**：
- docx UMD 小样验证通过：`docx@9.5.1/dist/index.umd.cjs`（unpkg 主 + jsdelivr 备，CDN 懒加载）经 Node 端到端验证——中文文本完整、字体 `w:eastAsia` 正确（如宋体/等线）、字号 half-point 正确（12pt→24）、页间 `<w:pageBreakBefore/>` 正确、zip 结构完整、document.xml 良构。真机 Word/WPS 打开验证留待评审/QA（本机无 Office）。
- 提取逻辑单测全过（Node + pdf.js 3.11.174 真实提取）：页码范围解析（含中文逗号/越界/写反/空段）、加密/损坏分类报错、阅读顺序重排（标题首行、空行保段落分隔、数字完整、表格行三列空格分隔）、扫描件 PDF 采样 0 字符 < 阈值 30 → 拦截不导出空文档、多栏页串行（页面已如实说明）。
- 本地服务实测：`/tools/pdf-to-word` 200、`pdf-to-word.js` 200、首页「文档转换」分类入口紧随 PDF 压缩之后（含「新」徽标）、导航下拉同序、sitemap 已收录、SEO（title/description/keywords/canonical/JSON-LD）完整、`go build` 通过、JS 语法检查通过。

**选定：PDF 转 Word（文本提取版）[WPS]** — 路由 `/tools/pdf-to-word`（模板 `pdf_to_word`），归「文档转换」分类，WPS 专题周收官枪、PDF 处理簇「转出」环

**决策理由**：
1. 执行三轮研究一致推荐：2026-10-14 凌晨轮、早间第二轮、04:20 第三轮三次定序均为 PDF 转 Word（文本提取版）P0 收官首选，排序零变动、新增信号全部支持；近连续七轮「调研推荐 Top1 → 交付」链条无断点（加水印→OCR→图片转PDF→批注打码→页面管理→加密/解密→压缩）。
2. 决定性路线验证：V2EX 约 19 天前开发者自荐 pdf-to-md.app——有文本层普通 PDF 浏览器本地转换、免费不上传（上限 50MB/500 页），开发者同时承认复杂表格/公式/多栏转换不准——「纯前端文本提取 + 诚实限范围」策略被独立开发者同路线验证；国内 47 页合同实测「WPS 免费额度转不完一份正经合同、海外免费工具每天 2 次不够、小程序一律要上传」——「网页即用、文件不离开浏览器、不限次、免登录免会员」的文本提取版仍是空白位。
3. 旅程闭环：PDF 处理簇现为八件套（合并/拆分、转图、加水印、批注打码、页面管理、加密/解密、压缩 + 图片转 PDF/OCR 双旅程线）；「转 Word」是 PDF 内容「转出」的最后一环，与压缩（「压缩完→转 Word 细改」）、OCR（扫描件引导「图片→文字→Word」）、页面管理（「整理完→转出编辑」）互链。
4. 落选说明：扫描件/图片转 Excel（P1）——tesseract.js + SheetJS 在栈可行，但表格结构还原弱有口碑风险，按 10-14 凌晨 PM 决策「诚实范围文案策略先经转 Word 文本版验证」，顺延为转 Word 之后的下一候选。思维导图（P1）——专题周内不切换品类，10-16 起首选新品类顺位不动。批量处理/流程图（P2 保留）；PDF 转 Word/Excel/PPT 完整版式版（P2，版式还原质量风险，先做文本版验证策略）。

**规格**：
1. 上传区（参照 `pdf_compress` 上传区与文案口径）：点击选择 + 拖拽上传单个 PDF（>50MB 提示「文件较大，处理可能较慢」、不硬拦截）；文件仅本地浏览器处理、不上传服务器，页面文案明示；上传后展示文件名、文件大小、总页数；加密/损坏 PDF 加载失败给出可读中文报错、页面不白屏。
2. 文本提取（`static/js/pdf-to-word.js`）：pdf.js（3.11.174，cdnjs UMD + worker，与 `pdf-to-image` 同版本同懒加载方式，CDN 失败可读报错）逐页 `getTextContent`；按阅读顺序重排——同一行按 Y 容差合并文本项、行内按 X 排序，空行保留段落分隔；多栏页面可能串行，页面如实说明。
3. 扫描件检测：采样前 3 页文本提取结果，若几乎无文本 → 明确提示「这是扫描件 PDF，文本提取版无法识别」，引导按钮跳转站内 OCR（`/tools/ocr-image-text`），不导出空文档。
4. 导出选项：正文字体（等线/宋体/微软雅黑，默认等线）+ 字号（五号/小四/四号，默认五号）+ 页码范围（全部/自定义范围如 `1-5,8`，复用页面管理的范围解析口径）；docx 库（UMD 构建，CDN 懒加载 + 失败可读报错；开发阶段先跑「提取→生成→用 Word/WPS 打开」小样验证 UMD 导出可用）按段落生成可编辑 .docx，表格内容按文本行输出（不承诺表格结构还原，页面如实说明）。
5. 导出：导出文件名 `<原名>.docx`；全程进度显示（`正在提取第 n / N 页` + `正在生成 Word` 两阶段）；结果区展示「提取 X 页 / Y 段」+ 重新导出（换字体字号再导）。
6. 注册：`tools/categories.go`「文档转换」（doc）分类内、`pdf_compress` 之后新增工具 ID `pdf_to_word`（与既有 `doc_to_pdf` 区分），Name「PDF 转 Word」，Description「PDF 转可编辑 Word 文档（文本提取版），本地处理不上传、不限次免费」，Path `/tools/pdf-to-word`，Icon `description`（Material Icons 已验证可用集合），New: true；通用路由 `/tools/:tool` 自动映射模板 `pdf_to_word`，无需新增 Go 路由；sitemap 自动生成。
7. SEO：title「PDF 转 Word - 免费在线 PDF 转 Word（不上传/不限次/可编辑）」、description、keywords（PDF转Word、PDF转Word免费、PDF转可编辑Word、PDF转Word不上传、PDF转Word文字版）；JSON-LD 与 canonical 沿用现有工具页写法（域名 www.johnkingzcq123.xyz）；页面内与 PDF 压缩（「压缩完→转 Word 细改」）、PDF 页面管理、OCR（扫描件引导）、图片转 PDF 互链。
8. 移动端适配：选项面板纵向布局不错乱；按钮点击区够大；文件名过长截断不撑破布局；大文件提取进度在小屏不卡死（逐页释放）。
9. 底部使用说明区：注明与 WPS 对比卖点（WPS 免费仅转前 5 页、要登录要会员 vs 本地处理不上传、不限次免费、不用登录）；诚实说明适用边界（文本版转换、复杂版式/表格/公式从简、多栏可能串行、扫描件请走站内 OCR）；给出「领导甩 PDF 改 Word」职场场景文案。

**加分项（今日第二步，进度顺利则带上）**：提取预览（转换前展示前 3 页提取文本小样，用户确认再导出）；保留图片占位标记（[图片] 占位行，提示用户手动补图）。

**验收标准**：
- [x] `/tools/pdf-to-word` 返回 200，首页「文档转换」分类可见入口（排在 PDF 压缩旁）
- [x] 典型文本 PDF（多页中文报告）：导出 .docx（Node 端到端验证：文字完整可编辑、段落顺序与阅读顺序一致、OOXML 结构/字体/分页合规；真机 Word/WPS 打开待评审/QA）
- [x] 扫描件 PDF：给出引导提示并跳转站内 OCR，不导出空文档
- [x] 导出文件名 `<原名>.docx`；全程有进度显示；结果区展示「提取 X 页 / Y 段」
- [x] 异常不崩：加密/损坏 PDF 有可读中文报错；pdf.js/docx CDN 懒加载失败有可读报错、页面不白屏；>50MB 有可读提示不硬拦截
- [x] 诚实文案：页面使用说明区含「文本版转换、复杂版式从简、表格按文本行输出、多栏可能串行、扫描件请走 OCR」
- [x] 全程纯前端、无新增后端接口、无文件上传请求；`go build` 通过；SEO meta 完整；移动端布局不错乱

**预计改动文件**：`templates/pdf_to_word.html`（新建）、`static/js/pdf-to-word.js`（新建）、`tools/categories.go`（文档转换分类注册工具）、`templates/pdf_compress.html`（互链「压缩完→转 Word 细改」）、`templates/ocr_image_text.html`（互链「识别后→转 Word 排版」）、`BACKLOG.md`（本小节）。

## 今日候选（2026-10-14 · 产品调研推荐，第四轮，为 10-15 收官日定序确认）

> **本周特别方向（2026-10-09 至 10-15）第 6 天**：今日（10-14）仍在区间内，明日 10-15 为专题周收官日。**交付核对**：PDF 转 Word（文本提取版）[WPS] 已按第三轮决策交付（commit 5252fe2 `前端开发(2026-10-14)：新增 PDF 转 Word 工具（文本提取版，纯前端本地处理）` + 2a0e67f 评审修复），自候选划掉并归入已实现。专题周交付线更新为：10-09 合并/拆分 + 转图、10-10 加水印、10-11 OCR、10-12 图片转 PDF、10-13 批注打码 + 页面管理 + 加密/解密、10-14 压缩 + 转 Word（连续六日十一工具）。本轮为收官日前第四次研究确认，重新定序。

**今日新信号**（2026-10-14 凌晨，全网调研）：
1. 「扫描件/图片转 Excel」差异化位被竞品行为确认：轻闪图片转 Excel（2026-01-09 上线，新浪科技）走「浏览器本地处理」路线但免费要**注册、每天限 5 个文件、单文件 10MB、批量收费**；ToolWeb 切入点即「**免注册、不限次**、纯前端（tesseract.js 在栈 + SheetJS 导出 xlsx），诚实标注表格结构还原弱」，继续承接 OCR「图片→文字」旅程线到「图片→表格」。
2. WPS 会员矩阵再对齐（三言科技 2026-06-25）：超级会员权益明列「PDF 转写编辑、文档修复、图片处理」（均已覆盖：转 Word/加密/压缩/加水印/OCR），大会员在超级会员之上加「1T 云空间 + AI 矩阵（AI 写文章/生成 PPT/文档阅读/翻译/会议纪要等，月度限次）」；**音频转文字（WPS 听记，大会员每月 3000 分钟）**与**文档翻译**均属 AI/后端能力，维持 P3（需后端/AI，低优先）；批量清理缓存会员化（软件维护功能，非单页工具形态，不列入）。
3. 思维导图（10-16 起新品类首选）信号稳定，无新增变化，顺位不动；批量处理/流程图维持 P2，无新增信号。

**推荐 Top3**（10-15 专题周收官日排期确认；努力度为单页前端交付量级评估）：

1. **扫描件/图片转 Excel [WPS]** — P1→P0 提级，10-15 收官首选：WPS 会员「图片工具箱：批量转文字和表格」会员权益交叉验证；竞品轻闪本地路线但免费要注册+每日限 5 个，ToolWeb 差异化「免注册、不限次、文件不离开浏览器」空白位明确；tesseract.js（在栈）文本框坐标 + 启发式行列分组 → SheetJS 导出 .xlsx，复杂合并单元格从简、页面如实说明；承接 OCR「图片→文字」旅程线，主管丢表格截图/财务报表扫描场景高频。难度中。SEO：图片转Excel、扫描件转Excel、表格识别、图片表格转Excel。
2. **思维导图 [WPS]** — P1（10-16 起首选新品类，专题周内不切换品类）：WPS 思维导图为增值功能；纯前端树编辑 + 导出 PNG/SVG/Markdown（mi/mind-map MIT 路线验证）；「一开会员就是几百块」付费痛点。难度中。SEO：思维导图、在线思维导图、免费思维导图。
3. **批量处理（批量转格式/改名/压缩）[WPS]** — P2 保留作为第三顺位备选：WPS 批量处理为会员卖点（PDF 批量转格式为超级会员核心权益）；纯前端可做批量改名清单生成等子集，价值视子功能拆分而定。难度中。SEO：批量改名、批量图片压缩、批量PDF转换。

落选说明：流程图绘制（P2 保留，难度大、单日难保质量）；PDF 转 Word/Excel/PPT 完整版式版（P2，版式还原质量风险，先做文本提取版验证诚实范围策略）；文档翻译/音频转文字（P3，需后端/AI）；简历/合同模板库（P3，形态不符）；~~PDF 转 Word（文本提取版）[WPS]~~（2026-10-14 已交付，commit 5252fe2/2a0e67f，归档）。

## 今日候选（2026-10-14 · 产品调研 04:20 第三轮，为 10-15 收官日排期确认）

> **本周特别方向（2026-10-09 至 10-15）第 6 天**：今日（10-14）仍在区间内，明日 10-15 为专题周收官日。本轮为收官日前最后一次研究确认，Top3 与第二轮一致（排序不变），新增信号全部支持现有定序。10-16 起转入新品类（思维导图首选）。

**今日新信号**（2026-10-14 04:20 全网调研，支持收官定序）：
1. 「PDF 转 Word」竞争格局再确认：2026-08 国内 47 页合同实测——「WPS 免费额度转不完一份正经合同、海外免费工具每天 2 次额度不够、微信小程序免费但一律要上传」（PDF转换管家/转换兔/转换师类小程序本质是服务端处理+广告变现）；桌面端三更PDF 宣称完全免费不限次（客户端安装形态，非网页即用）；各家分水岭都在「扫描件识别 + 中文表格还原」。**网页零安装、文件真不离开浏览器、不限次** 的文本提取版仍是空白位——小程序要上传、三更PDF 要装客户端、WPS 限页额度，与 ToolWeb「免安装网页即用」形成错位竞争。纯前端只能做文本提取、版式从简，诚实范围 MVP 策略继续。
2. 「扫描件转 Excel」差异化位确认：轻闪图片转Excel（2026-01-09 上线）走「浏览器本地处理」路线，但免费用户要注册、每天限 5 个文件（10MB）、批量收费；海外 compressexcel.com image-to-excel 免费（20MB 上限）本质服务端；AI 路线（豆包识图转表格）需账号+大模型。ToolWeb 切入点：**免注册、不限次、纯前端（tesseract.js+SheetJS），诚实标注表格结构还原弱**，继续承接 OCR「图片→文字」旅程线到「图片→表格」。
3. 思维导图信号稳定，无新增变化，维持 10-16 首选。

**推荐 Top3**（10-15 专题周收官日排期确认；第二轮定序不变）：

1. **PDF 转 Word（文本提取版）[WPS]** — P0 收官首选：WPS 吐槽最集中的会员功能（免费仅 5 页）；竞品错位——小程序一律上传、桌面端要装客户端、海外工具限次+卡网络；ToolWeb 差异化「网页即用、文件不离开浏览器、不限次、免登录免会员」；pdf.js（在栈）按阅读顺序提取文本 → `docx` 库（CDN 懒加载）生成可编辑 .docx，页面诚实说明「文本版转换、复杂版式从简」，扫描件引导走站内 OCR。难度中。
2. **扫描件/图片转 Excel [WPS]** — P1：WPS「图片工具箱：批量转文字和表格」会员权益；轻闪路线验证浏览器本地处理心智，但其免费要注册+每日限 5 个文件；tesseract.js 文本框坐标 + 启发式行列分组 → SheetJS 导出 .xlsx 在栈可做，复杂合并单元格从简、页面如实说明。难度中。
3. **思维导图 [WPS]** — P1（10-16 起首选新品类，专题周内不切换品类）：WPS 思维导图为增值功能；纯前端树编辑 + 导出 PNG/SVG/Markdown（mi/mind-map MIT 路线验证）；「一开会员就是几百块」付费痛点。难度中。

落选说明：批量处理/流程图（P2 保留）；PDF 转 Word/Excel/PPT 完整版式版（P2，版式还原质量风险）；文档翻译/音频转文字（P3，需后端/AI）；简历/合同模板库（P3，形态不符）；WPS 电子签名（未确认为会员付费墙，不列入）。

## 今日候选（2026-10-14 · 产品调研推荐，第二轮，为 10-15 排期）

> **本周特别方向（2026-10-09 至 10-15）第 6 天早间**：10-14 任务「PDF 压缩 [WPS]」已在凌晨轮交付（见交付核对）；本轮调研为专题周收官日（10-15）定序，候选全部来自 WPS 付费功能矩阵。10-15 之后（10-16 起）按既定转入新品类，思维导图为首选。

**交付核对**：PDF 压缩（智能压缩 + 扫描件压缩双模式）[WPS] 已上线（commit e35387c `前端开发(2026-10-14)：新增 PDF 压缩工具（智能压缩+扫描件压缩双模式，纯前端本地处理）`；模板 `pdf_compress`、`categories.go` 已注册 `/tools/pdf-compress`），自候选划掉并归入已实现。专题周交付线更新为：10-09 合并/拆分 + 转图、10-10 加水印、10-11 OCR、10-12 图片转 PDF、10-13 批注打码 + 页面管理 + 加密/解密、10-14 压缩（连续六日十工具）。

**今日新信号**（2026-10-14 早间，全网调研）：
1. 「PDF 转 Word」需求侧再加码、浏览器本地路线获独立验证：V2EX 约 19 天前开发者自荐 pdf-to-md.app——有文本层的普通 PDF 在浏览器本地转换、免费不上传（本地上限 50MB/500 页），开发者同时承认复杂表格/公式/多栏转换不准、OCR 走云端耗额度——「纯前端文本提取、诚实限范围」策略被独立开发者同路线验证；2026-09 国内 47 页合同 PDF 实测：WPS 转 Word 免费额度转不完一份正经合同、海外免费工具每天 2 次额度不够、微信小程序免费但一律要上传——「本地处理不上传、不限次、免会员」仍是空白位。
2. WPS 会员权益矩阵再对齐：澎湃 2 天前抓取的川大 WPS365 会员权益明列「图片工具箱：批量转文字和表格」——「扫描件/图片转 Excel（表格）」确认为会员功能，与 10-14 凌晨调研的 360doc 会员体系解析（OCR「扫描件转 Excel」）交叉验证；纯前端路线在栈（tesseract.js 已验证 + SheetJS/xlsx 导出），表格结构还原弱、须诚实限范围。
3. 思维导图（10-16 起新品类首选）信号稳定：360doc 免费站推荐帖点名思维导图软件「一开会员就是几百块」；开源 mi/mind-map（MIT）纯 Web 路线再确认（8 种结构模板、导出 PDF/XMind/Markdown）；V2EX 昨日 1NX 纯本地白板自荐（Excalidraw 系、支持脑图/流程图）说明「本地处理不上传」画图心智延续。
4. 其余 WPS 矩阵候选今日无新增信号：批量处理、流程图绘制维持 P2；文档翻译/音频转文字（需后端/AI）、简历/合同模板库（形态不符）维持 P3；WPS PDF 电子签名未确认为会员付费墙（官网与教程均列为常规功能），不列入候选。

**推荐 Top3**（10-15 专题周收官日排期；努力度为单页前端交付量级评估）：

1. **PDF 转 Word（文本提取版）[WPS]** — 10-15 收官首选：WPS 吐槽最集中的会员功能（免费仅 5 页）；独立开发者 pdf-to-md.app 以浏览器本地转换为卖点验证路线；免费替代一律上传或限次（UPDF 每天 2 次、456pdf.cn 每日额度、小程序要上传）；ToolWeb 差异化「本地不上传、不限次、免登录免会员」空白明确。实现：pdf.js（在栈）按阅读顺序提取文本 → `docx` 库（CDN 懒加载）生成可编辑 .docx；页面诚实说明「文本版转换、复杂版式从简」，扫描件引导走站内 OCR。难度中。SEO：PDF转Word、PDF转Word免费、PDF转可编辑Word、PDF转Word不上传。
2. **扫描件/图片转 Excel [WPS]** — P1：WPS「图片工具箱：批量转文字和表格」会员权益交叉验证；承接 OCR「图片→文字」旅程线到「图片→表格」；tesseract.js 文本框坐标 + 启发式行列分组 → SheetJS 导出 .xlsx 在栈可做，复杂合并单元格从简、页面如实说明。难度中。SEO：图片转Excel、扫描件转Excel、表格识别、图片表格转Excel。
3. **思维导图 [WPS]** — P1（10-16 起首选新品类，专题周内不切换品类）：WPS 思维导图为增值功能；纯前端树编辑 + 导出 PNG/SVG/Markdown（mi/mind-map MIT 路线验证）；课堂/会议记录中频；「一开会员就是几百块」付费痛点明确。难度中。SEO：思维导图、在线思维导图、免费思维导图。

落选说明：批量处理（P2 保留，子功能价值待拆）；流程图绘制（P2 保留，难度大、单日难保质量）；PDF 转 Word/Excel/PPT 完整版式版（版式还原要求高，暂不拆，先做文本提取版验证「诚实范围」策略）；文档翻译/音频转文字（P3，需后端/AI）；简历/合同模板库（P3，形态不符）；PDF 电子签名（未确认为会员付费墙，不列入）。

**WPS 候选表更新**（2026-10-14 早间；PDF 压缩已交付归档，PDF 转 Word 文本版提级为 10-15 收官首选，扫描件转 Excel 提级为 P1，思维导图维持 10-16 首选）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| PDF 转 Word（文本提取版）[WPS] | WPS 免费仅 5 页、吐槽最集中；V2EX pdf-to-md.app 独立验证浏览器本地转换路线；免费替代一律上传或限次（UPDF 每天 2 次/小程序要上传）；纯前端文本提取诚实范围 MVP | 中 | P0（10-15 收官首选） |
| 扫描件/图片转 Excel [WPS] | WPS「图片工具箱：批量转文字和表格」会员权益交叉验证；tesseract 在栈 + SheetJS 导出 xlsx 可行（表格结构还原弱、诚实限范围）；承接 OCR 旅程线 | 中 | P1 |
| 思维导图 [WPS] | WPS 思维导图为增值功能；纯前端树编辑 + 导出 PNG/SVG 可行（mi/mind-map MIT 验证）；「一开会员就是几百块」付费痛点；10-16 起首选新品类 | 中 | P1（专题周后首选） |
| 批量处理（批量转格式/改名/压缩）[WPS] | WPS 批量处理为会员卖点；纯前端可做批量改名清单生成等子集，价值视子功能而定 | 中 | P2 |
| 流程图绘制 [WPS] | WPS/WPS 绘图增值功能；纯前端画布可做，但交互复杂、单日难保质量 | 大 | P2 |
| PDF 转 Word/Excel/PPT（完整版式版）[WPS] | 会员核心卖点；但纯前端版式还原差，易砸口碑——先做文本提取版验证诚实范围策略 | 中 | P2（低优先，质量风险） |
| 文档翻译 [WPS] | WPS 翻译属 AI/会员权益；需调用外部翻译 API 或大模型，非纯前端 | 中 | P3（需后端/AI，低优先） |
| 音频转文字（语音速记）[WPS] | 超级会员权益；浏览器 Web Speech 识别受限、离线模型体积大，非纯前端单页 | 大 | P3（低优先） |
| 简历/合同模板库 [WPS] | 稻壳/模板套餐收费；属内容库而非工具，与单页工具架构不符 | 中 | P3（形态不符，暂缓） |
| ~~PDF 压缩（智能压缩 + 扫描件压缩）[WPS]~~（2026-10-14 凌晨轮已交付） | V2EX 用户点名 WPS 压缩「要登录还要会员」→ 已实现 `/tools/pdf-compress`（commit e35387c），归档 | 中 | ✅ 归档 |
| ~~PDF 加密/解密 [WPS]~~（2026-10-13 晚间已交付） | WPS 官方付费功能清单明列 Password Protection 为 premium → 已实现 `/tools/pdf-encrypt`（commit 2d7fba2/46a7863/25b66e1，自研 pdf-crypto.js），归档 | 中 | ✅ 归档 |
| ~~PDF 页面管理（旋转/删页/调序/提取单页）[WPS]~~（2026-10-13 已交付） | WPS 页面管理与拆分包收费 → 已实现 `/tools/pdf-manage`（commit 5359dfd），归档 | 中 | ✅ 归档 |
| ~~PDF 批注标记（涂抹打码+高亮+文字标注）[WPS]~~（2026-10-13 已交付） | WPS PDF 编辑属会员 → 已实现 `/tools/pdf-annotate`（commit 5164e11/d3b6cde），归档 | 中 | ✅ 归档 |
| ~~图片批量转 PDF（含多图合一）[WPS]~~（2026-10-12 已交付） | WPS 图片转 PDF 属会员 → 已实现 `/tools/images-to-pdf`（commit 5c389c6/cded433/311ca1d），归档 | 小 | ✅ 归档 |
| ~~OCR 图片文字识别 [WPS]~~（2026-10-11 已交付） | WPS 识别/转文字为会员功能 → 已实现 `/tools/ocr-image-text`（commit 480771b，小样实测三门槛过关），归档 | 中 | ✅ 归档 |
| ~~PDF 加水印 [WPS]~~（2026-10-10 已交付） | WPS PDF 加水印属会员编辑功能 → 已实现 `/tools/pdf-watermark`（commit f7d1903/a13db05/4e779f1），归档 | 小 | ✅ 归档 |

**归档说明**：专题周（10-09 至 10-14）连续六日交付十工具：10-09 PDF 合并/拆分 + PDF 转图、10-10 加水印、10-11 OCR、10-12 图片转 PDF、10-13 批注打码 + 页面管理 + 加密/解密、10-14 PDF 压缩；PDF 处理簇现为合并/拆分、转图、加水印、批注打码、页面管理、加密/解密、压缩七件套 +「图片→PDF」「图片→文字」双旅程线；专题周收官日（10-15）建议「PDF 转 Word（文本提取版）」收官，10-16 起以思维导图开辟新品类。

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

## 今日任务（2026-10-14 · 产品经理已决策 ✅）

**交付状态（2026-10-14 00:20 开发前决策）**：待开发。10-14 既定任务（页面管理）与 10-15 既定任务（加密/解密）均已提前交付（见下方交付核对），今日需新定序一题。本决策执行 2026-10-14 凌晨调研推荐 Top1（P0），以单日一个任务封顶。

**选定：PDF 压缩（智能压缩 + 扫描件压缩双模式）[WPS]** — 路由 `/tools/pdf-compress`（模板 `pdf_compress`），归「文档转换」分类，WPS 专题周收官前的新枪、PDF 处理簇「发送前瘦身」环

**决策理由**：
1. 执行凌晨调研推荐：2026-10-14 凌晨调研已将 PDF 压缩由 P1 提级为 **P0 今日首选**，决策执行调研推荐序（近连续六轮「调研推荐 Top1 → 次日交付」链条无断点：水印→OCR→图片转PDF→批注打码→页面管理→加密/解密）。
2. 决定性新信号解决了质量风险：此前 PDF 压缩被卡在 P2 备选的唯一原因是「文本 PDF 重绘丢可选文字」质量风险；V2EX 自荐 yasuo.app（开发者原话「WPS 有这种（压缩）工具，不但要登录还要会员，偶尔一用太麻烦」）的 PDF 双模式设计——智能压缩（优化图片和冗余数据，保留文字、链接和表单）+ 扫描件压缩（页面重绘为图片）——正是该风险的标准答案：文本型 PDF 走智能模式保文字可选，扫描件走重绘模式降分辨率。
3. 专题周内不切换品类：今日仍在 WPS 特别方向区间（10-09 至 10-15）内，专题周叙事要求候选继续选 WPS 会员功能「免费纯前端替代」；思维导图定为 10-16 起首选新品类，顺位不动。加密/解密（10-15 既定）与页面管理（10-14 既定）均已提前交付，无顺延债务。
4. 旅程闭环收益最高：PDF 处理簇已成八工具（合并/拆分、转图、加水印、批注打码、页面管理、加密/解密 + 图片转 PDF/OCR），「压缩」是「处理完→发出去」前最后一环，与页面管理互链（「整理完→压缩发小」）、与加密/解密互链（「加密完→压缩发出」）、与站内图片压缩（img-compress）互链（图片侧/PDF 侧对应能力）。
5. 落选说明：PDF 转 Word（文本提取版）（P1）——需求侧继续加码（「领导甩 PDF」场景、WPS 免费仅 5 页、UPDF 每天 2 次要上传），但「诚实范围」策略（文本提取、版式从简）今日尚需定稿、压缩候选有决定性路线验证信号压顶，顺延为 10-16 次选。思维导图（P1）——10-16 起首选新品类，专题周内不切换品类。扫描件转 Excel（P2 新候选）——需先看压缩页/转 Word 文本版的「诚实范围」文案策略验证效果，不进今日排期。

**规格**：
1. 上传区（参照 `pdf_encrypt`/`pdf_manage` 上传区与文案口径）：点击选择 + 拖拽上传单个 PDF（>50MB 提示「文件较大，处理可能较慢」、不硬拦截）；文件仅本地浏览器处理、不上传服务器，页面文案明示；上传后展示文件名、文件大小（原大小、压缩后大小、压缩率）、总页数；损坏/加密 PDF 加载失败给出可读中文报错、页面不白屏。
2. 双模式选择（用户可改，默认自动推荐）：
   - **智能压缩**（默认）：pdf-lib（1.17.1，cdnjs，与 `pdf-merge-split.js` 同款 CDN 懒加载 + 失败提示）解析重建——嵌入图片按 JPEG 质量档（高/中/低三档，默认中）重采样重嵌、冗余对象清理、元数据清理、未压缩内容流压缩；保留文字可选、链接、表单域、页面尺寸不变；导出前在页面展示「压缩比预估」。
   - **扫描件压缩**：pdf.js（3.11.174，cdnjs UMD + worker，与 `pdf-to-image` 同版本同懒加载方式，CDN 失败可读报错）逐页渲染为图片（分辨率三档：150/100/72 DPI，默认 100）→ 新建 PDF 重嵌图片页（按原页尺寸比例）；页面如实说明「重绘后文字不可选中，适用于纯扫描件」。
   - 自动推荐逻辑：页面采样前 3 页（pdf.js 渲染或文本层检测），若可提取文本 → 默认推荐智能压缩；若几乎无文本 → 默认推荐扫描件压缩；用户可手动切换，切换即时切换参数面板。
3. 参数面板：压缩强度档（高/中/低三档；智能模式=图片重采样质量档，扫描件模式=DPI 档）；「删除元数据」勾选（默认开，保留标题/作者/主题三项可编辑）；页码范围可选（全部/自定义范围，如 `1-5,8`，复用页面管理的范围解析口径）。
4. 导出：智能模式用 pdf-lib 重建保存、扫描件模式用 pdf-lib 新建嵌入 JPEG；文件名 `compressed_<原名>.pdf`；导出全程进度显示（智能模式按页、扫描件模式按渲染页 + 嵌入页两阶段）；结果区展示「原大小 → 新大小（−XX%）」对比 + 一键重新压缩（换档再压）。
5. 注册：`tools/categories.go`「文档转换」（doc）分类内、`pdf_encrypt` 之后新增工具 ID `pdf_compress`，Name「PDF 压缩」，Description「PDF 智能压缩/扫描件压缩减小体积，邮件门户附件发得出去，本地处理不上传、不限次」，Path `/tools/pdf-compress`，Icon `compress`（Material Icons 已验证可用集合——img-compress 已用同名 Icon），New: true；通用路由 `/tools/:tool` 自动映射模板 `pdf_compress`，无需新增 Go 路由；sitemap 自动生成。
6. SEO：title「PDF 压缩 - 减小 PDF 体积/在线压缩 PDF（免费/不上传/保留文字可选）」、description、keywords（PDF压缩、PDF减小体积、PDF太大发不出去、PDF压缩保留文字、扫描件PDF压缩）；JSON-LD 与 canonical 沿用现有工具页写法（域名 www.johnkingzcq123.xyz）；页面内与 PDF 页面管理（「整理完→压缩发小」）、PDF 加密/解密（「加密完→压缩发出」）、图片压缩（img-compress）、PDF 合并/拆分互链。
7. 移动端适配：双模式选择与参数面板纵向布局不错乱；按钮点击区够大；文件名过长截断不撑破布局；渲染进度在小屏不卡死（渲染页渲染完一页释放一页内存）。
8. 底部使用说明区：注明与 WPS 对比卖点（本地处理不上传、不限次免费、不用开 WPS 会员、不用登录）；如实说明两种模式适用边界（智能模式：文本 PDF 保文字可选，图片已压缩的 PDF 收益有限；扫描件模式：纯扫描件适用，重绘后文字不可选中、不保证 OCR 质量）；给出附件体积限制参照（Gmail 25MB / Outlook 20MB / 政务门户常低至 2MB）。

**加分项（今日第二步，进度顺利则带上）**：压缩前后并排预览（pdf.js 缩略图对比）；「压缩质量小样」预置测试 PDF（文本型 + 扫描件型各一）供用户自测。

**验收标准**：
- [ ] `/tools/pdf-compress` 返回 200，首页「文档转换」分类可见入口（排在 PDF 加密/解密旁）
- [ ] 智能模式：典型文本 PDF（含嵌入图片）压缩后体积显著减小（目标 ≥20%）、文字仍可选中复制、链接/页面尺寸/总页数不变；损坏/加密 PDF 有可读中文报错
- [ ] 扫描件模式：纯扫描件 PDF 压缩后体积显著减小（目标 ≥40%）、导出 PDF 可正常打开、每页内容与原图一致（无错位、缩放偏差肉眼不可见）
- [ ] 自动推荐：文本型 PDF 默认选中智能压缩、纯扫描件默认选中扫描件压缩，用户可手动切换
- [ ] 结果区展示「原大小 → 新大小（−XX%）」对比；导出文件名 `compressed_<原名>.pdf`；导出全程有进度显示
- [ ] 异常不崩：pdf-lib/pdf.js CDN 懒加载失败有可读报错、页面不白屏；>50MB 有可读提示不硬拦截；内存溢出（超大扫描件）有可读提示
- [ ] 诚实文案：页面使用说明区含两种模式适用边界如实说明（含重绘后文字不可选中、已压缩 PDF 收益有限）
- [ ] 全程纯前端、无新增后端接口、无文件上传请求；`go build` 通过；SEO meta 完整；移动端布局不错乱

**预计改动文件**：`templates/pdf_compress.html`（新建）、`static/js/pdf-compress.js`（新建）、`tools/categories.go`（文档转换分类注册工具）、`templates/pdf_manage.html`（互链「整理完→压缩发小」）、`templates/pdf_encrypt.html`（互链「加密完→压缩发出」）、`BACKLOG.md`（本小节）。

## 今日候选（2026-10-14 · 产品调研推荐）

> **本周特别方向（2026-10-09 至 10-15）第 6 天**：今日（10-14）仍在区间内，候选继续优先选 WPS 会员功能「免费纯前端替代」；专题周收官日为明日 10-15。10-15 既定任务「PDF 加密/解密」已于昨夜提前交付（见交付核对），本轮调研为今日开发轮定序，并为专题周后（10-16 起）新品类排位。

**交付核对**：PDF 加密/解密 [WPS] 已上线（commit 2d7fba2 `前端开发(2026-10-13)：新增 PDF 加密/解密工具（自研 PDF 标准加密，纯前端本地处理）` + 46a7863 第 2 轮评审修复 + 25b66e1 真实浏览器 QA 修复密码表单显示 bug；模板 `pdf_encrypt`、`categories.go` 已注册 `/tools/pdf-encrypt`），自候选划掉并归入已实现。专题周交付线更新为：10-09 合并/拆分 + 转图、10-10 加水印、10-11 OCR、10-12 图片转 PDF、10-13 批注打码 + 页面管理、10-13 晚间 加密/解密（连续六日八工具，专题周任务已全部提前完成）。

**今日新信号**（2026-10-14 凌晨，全网调研）：
1. **PDF 压缩获决定性路线验证**：V2EX 自荐帖 yasuo.app（约 26 天前被抓取，https://www.v2ex.com/t/1242456）开发者原话「WPS 有这种（压缩）工具，不但要登录还要会员，偶尔一用太麻烦」，遂做浏览器本地压缩（视频/图片/PDF）；PDF 侧提供「智能压缩（优化图片和冗余数据，保留文字、链接和表单）+ 扫描件压缩（页面重绘为图片）」双模式——我们担心的「文本 PDF 重绘丢可选文字」质量风险，直接被该双模式设计回答：文本型走智能模式保文字，扫描件走重绘模式。这是压缩候选近三日最强的单信号。
2. PDF 转 Word 需求侧继续加码：网易「职场新人必看：4 种 PDF 转 Word 的方法」（约 140 天前）场景原话「最怕领导甩过来一个 PDF 说'把这个改成 Word 给我'"；WPS 免费仅转前 5 页、UPDF 在线版每天免费 2 次且要上传、微信小程序每月 3 次限次数——「免会员、免上传、不限次」的文本提取版仍有空白位（纯前端只能做文本提取、版式从简，须诚实限范围）。
3. WPS 会员矩阵再对齐（360doc 2025-09 会员体系解析）：超级会员权益明列「PDF 专业处理：无限制转换、合并、拆分，支持 OCR 文字识别（含扫描件转 Excel）」——「扫描件转 Excel」是矩阵内尚未覆盖的格子（纯前端可行：tesseract 表格识别 + SheetJS 导出 xlsx，新增候选见下表）；「320 款 VIP 字体 + 商用模板库」属内容/字体资产，非单页工具形态；AI 会员「并行翻译/会议纪要」属 AI 权益，P3 不动。
4. WPS 会员墙争议叙事继续：网易《WPS 会员套路曝光》（黑猫投诉超万条：免费额度压缩、老会员权益无通知削减、自动续费隐蔽，约 110 天前）仍在被引用——「不用开 WPS 会员」传播卖点继续有效。

**推荐 Top3**（今日仍在 WPS 特别方向区间内，三候选均为 [WPS] 来源；努力度为单页前端交付量级评估）：

1. **PDF 压缩（智能压缩 + 扫描件压缩双模式）[WPS]** — P1→P0 提级，今日首选：决定性新信号——yasuo.app 开发者以「WPS 压缩要登录还要会员」为由做出浏览器本地压缩，其 PDF 双模式（智能压缩保文字/链接/表单、扫描件压缩重绘）正是我们「文本 PDF 重绘丢文字」质量风险的标准答案；多源趋势（dev.to 浏览器本地压缩教程、Medium Ghostscript-WASM 路线、visualpdf 活跃）+ 附件体积限制痛点明确（Gmail 25MB / Outlook 20MB / 政务门户常低至 2MB）。技术路线：pdf-lib 解析重建（图片重采样压缩 + 冗余对象清理 + 元数据清理）为智能模式；扫描件页走 pdf.js 渲染降分辨率重嵌为扫描件模式，页面如实说明两种模式适用边界（诚实文案）。与 PDF 处理簇互链（「加密完→压缩发出」「整理完→压缩发小」）、与站内图片压缩互链（图片侧/PDF 侧对应能力）。难度中。SEO：PDF压缩、PDF减小体积、PDF太大发不出去、PDF压缩不上传。
2. **PDF 转 Word（文本提取版）[WPS]** — P2→P1 提级：需求侧加码（职场新人「领导甩 PDF」场景、WPS 免费仅 5 页、UPDF 每天 2 次要上传、小程序每月限次）；纯前端诚实范围 MVP：pdf.js 按阅读顺序提取文本 → `docx` 库（CDN 懒加载）生成可编辑 .docx，不承诺版式/表格还原，页面如实说明「文本版转换，复杂版式从简」，扫描件引导走站内 OCR。难度中。SEO：PDF转Word、PDF转Word免费、PDF转可编辑Word。
3. **思维导图 [WPS]** — P2→P1：WPS 思维导图为超级会员增值功能；纯前端单页可行（树编辑 + 导出 PNG/SVG/Markdown，本地存草稿免注册），开源 mi/mind-map（MIT）验证纯 web 路线；课堂/会议记录中频场景；专题周内不切换品类，定为 10-16 起首选新品类候选。难度中。SEO：思维导图、在线思维导图、免费思维导图。

落选说明：流程图绘制（P2 保留，难度大、单日难保质量）；批量处理（P2 保留，价值视子功能而定，批量改名清单生成等子集可独立成题）；文档翻译/音频转文字（P3，需后端/AI）；简历/合同模板库（P3，内容库形态不符）；PDF 转 Excel/PPT 完整版式版（版式还原要求更高，暂不拆，先做 Word 文本版验证「诚实范围」策略）。

**WPS 候选表更新**（2026-10-14 凌晨；PDF 加密/解密已交付归档，PDF 压缩由 P1 备选提级为 P0 首选，PDF 转 Word 文本版与思维导图提级为 P1，新增扫描件转 Excel）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| PDF 压缩（智能压缩 + 扫描件压缩）[WPS] | yasuo.app（V2EX 自荐）以「WPS 压缩要登录还要会员」做出浏览器本地压缩，双模式（智能保文字/扫描件重绘）回答质量风险；邮箱/门户附件体积限制痛点明确 | 中 | P0（今日首选） |
| PDF 转 Word（文本提取版）[WPS] | WPS 免费仅转前 5 页、吐槽最集中（「领导甩 PDF」场景）；UPDF 每天 2 次要上传、小程序每月限次；纯前端诚实范围 MVP（文本提取、版式从简） | 中 | P1 |
| 思维导图 [WPS] | WPS 思维导图为超级会员增值功能；纯前端树编辑 + 导出 PNG/SVG 可行（开源 mi/mind-map 验证）；10-16 起首选新品类 | 中 | P1（专题周后首选） |
| 扫描件/图片转 Excel [WPS] | 今日新发现：WPS 会员权益明列 OCR「扫描件转 Excel」；纯前端可行（tesseract 表格识别 + SheetJS 导出 xlsx，表格结构还原弱、诚实限范围）；承接 OCR「图片→文字」旅程线 | 中 | P2（新候选） |
| 批量处理（批量转格式/改名/压缩）[WPS] | WPS 批量处理为会员卖点；纯前端可做批量改名清单生成等子集，价值视子功能而定 | 中 | P2 |
| 流程图绘制 [WPS] | WPS/WPS 绘图增值功能；纯前端画布可做，但交互复杂、单日难保质量 | 大 | P2 |
| PDF 转 Word/Excel/PPT（完整版式版）[WPS] | 会员核心卖点；但纯前端版式还原差，易砸口碑——先做文本提取版验证诚实范围策略 | 中 | P2（低优先，质量风险） |
| 文档翻译 [WPS] | WPS 翻译属 AI/会员权益；需调用外部翻译 API 或大模型，非纯前端 | 中 | P3（需后端/AI，低优先） |
| 音频转文字（语音速记）[WPS] | 超级会员权益；浏览器 Web Speech 识别受限、离线模型体积大，非纯前端单页 | 大 | P3（低优先） |
| 简历/合同模板库 [WPS] | 稻壳/模板套餐收费；属内容库而非工具，与单页工具架构不符 | 中 | P3（形态不符，暂缓） |
| ~~PDF 加密/解密 [WPS]~~（2026-10-13 晚间已交付） | WPS 官方付费功能清单明列 Password Protection 为 premium → 已实现 `/tools/pdf-encrypt`（commit 2d7fba2/46a7863/25b66e1，自研 pdf-crypto.js），归档 | 中 | ✅ 归档 |
| ~~PDF 页面管理（旋转/删页/调序/提取单页）[WPS]~~（2026-10-13 已交付） | WPS 页面管理与拆分包收费 → 已实现 `/tools/pdf-manage`（commit 5359dfd），归档 | 中 | ✅ 归档 |
| ~~PDF 批注标记（涂抹打码+高亮+文字标注）[WPS]~~（2026-10-13 已交付） | WPS PDF 编辑属会员 → 已实现 `/tools/pdf-annotate`（commit 5164e11/d3b6cde），归档 | 中 | ✅ 归档 |
| ~~图片批量转 PDF（含多图合一）[WPS]~~（2026-10-12 已交付） | WPS 图片转 PDF 属会员 → 已实现 `/tools/images-to-pdf`（commit 5c389c6/cded433/311ca1d），归档 | 小 | ✅ 归档 |
| ~~OCR 图片文字识别 [WPS]~~（2026-10-11 已交付） | WPS 识别/转文字为会员功能 → 已实现 `/tools/ocr-image-text`（commit 480771b，小样实测三门槛过关），归档 | 中 | ✅ 归档 |
| ~~PDF 加水印 [WPS]~~（2026-10-10 已交付） | WPS PDF 加水印属会员编辑功能 → 已实现 `/tools/pdf-watermark`（commit f7d1903/a13db05/4e779f1），归档 | 小 | ✅ 归档 |

**归档说明**：专题周（10-09 至 10-13）连续六日交付八工具：10-09 PDF 合并/拆分 + PDF 转图、10-10 加水印、10-11 OCR、10-12 图片转 PDF、10-13 批注打码 + 页面管理、10-13 晚间 加密/解密（原定 10-15，已提前）；PDF 处理簇现为合并/拆分、转图、加水印、批注打码、页面管理、加密/解密六件套 +「图片→PDF」「图片→文字」双旅程线；专题周收官日（10-15）在即，今日（10-14）建议「PDF 压缩」首选收官新枪，10-16 起开辟思维导图新品类。

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

## 今日任务（2026-10-15 · 产品经理已决策 ✅）

**交付状态（2026-10-13 晚间开发）**：已交付；第2轮（评审修复）完成——修复解密页 `renderDecFileInfo` 未定义变量 `enc` 阻断性 bug（改用 `decFile.encInfo`），损坏 PDF 降级分支改为可读中文报错并阻止导出，BACKLOG 补记自研 pdf-crypto.js 偏离说明。模板 `pdf_encrypt`、自研 `static/js/pdf-crypto.js` + `static/js/pdf-encrypt.js`、`categories.go` 已注册 `/tools/pdf-encrypt`；另给 `pdf_manage` 模板加了「整理完→加密发出」互链。

**选定：PDF 加密/解密 [WPS]** — 路由 `/tools/pdf-encrypt`（模板 `pdf_encrypt`），归「文档转换」分类，WPS 专题周收官枪（10-15）、PDF 处理簇「保护」收官环

**决策理由**：
1. 兑现既定次序：10-13 午后调研明文定序「10-14 页面管理 → 10-15 加密/解密」，晚间更新确认「10-15 定序加密/解密首选」；10-14 任务已提前交付（commit 5359dfd），链条无断点，本决策执行该定序。
2. 需求侧晚间三方加码：Medium 作者 lin wang 于 8-21/9-02 连发两篇《How to Encrypt PDF in the Browser for Free (No Upload, No Signup)》，与 9-17 验证页面管理的删页教程同作者同系列——「浏览器本地处理 PDF 不上传」心智被同一作者连续选题验证；WPS 官方付费功能清单明列 Password Protection 为 premium 订阅功能；竞品 iLovePDF/Smallpdf 的加密功能一律要上传文件——「本地加密不上传」差异化清晰。
3. 使用链收官：与页面管理形成「整理完→加密发出」使用链（页面管理页互链入口），与批注打码形成「处理→保护」叙事；HR/财务/法务/医疗加密场景（工资条、合同加密 PDF）低频但刚性。
4. 交付风险可控但加一道小样关口：pdf-lib 1.17.1 在栈（merge/split/watermark/manage 连续验证）；开发阶段先做「加密→解密 round-trip 小样」验证 pdf-lib 加密参数实际可用（加密导出后再用密码 load 解密成功），小样过关才整页开发——延续 OCR 小样/压缩小样门纪律，不赌库能力。
5. 落选说明：PDF 压缩（P1 备选）——多源验证「浏览器本地压缩」趋势、邮箱/门户附件体积限制痛点明确，但文本 PDF 重绘丢可选文字的质量风险未排除；专题周收官日不引入带质量风险项，压缩小样可并行先做、过关则 10-16 首启。思维导图（P2）——专题周后（10-16 起）首选新品类候选，收官日不切换品类，顺位不动。

**规格**：
1. 上传区（参照 `pdf_manage` 上传区与文案口径）：点击选择 + 拖拽上传单个 PDF（>50MB 提示「文件较大，处理可能较慢」、不硬拦截）；文件仅本地浏览器处理、不上传服务器，页面文案明示；上传后展示文件名、文件大小、总页数；损坏 PDF 加载失败给出可读中文报错、页面不白屏。
2. 双模式页签：「加密码保护」/「解除密码」二选一，单页承载。
   - 加密模式：输入打开密码（userPassword，必填，二次确认一致性校验）+ 所有者密码（ownerPassword，可选，默认与打开密码相同）+ 加密强度档（按 pdf-lib 实际支持档位提供，默认推荐档）；导出前先跑 round-trip 小样（开发阶段验证用，页面内不暴露）。
   - 解密模式：上传加密 PDF → 输入密码 → pdf.js（3.11.174，cdnjs UMD + worker，CDN 失败可读报错）或 pdf-lib load 带 password 打开；密码错误给出可读中文报错（「密码不正确」），不白屏。
3. 导出：pdf-lib（1.17.1，cdnjs，与 `pdf-merge-split.js` 同款 CDN 懒加载 + 失败提示）处理；加密导出文件名 `encrypted_<原名>.pdf`，解密导出 `decrypted_<原名>.pdf`；导出全程进度显示；加密后页面内提供「用刚设的密码验证打开」一次性自检（可选，加分项降级为必做小项更稳——列为加分项）。
4. 注册：`tools/categories.go`「文档转换」（doc）分类内、`pdf_manage` 之后新增工具 ID `pdf_encrypt`，Name「PDF 加密/解密」，Description「PDF 加密码保护/解除密码，合同工资条发前加密，本地处理不上传、不限次」，Path `/tools/pdf-encrypt`，Icon `lock`（Material Icons 已验证可用集合），New: true；通用路由 `/tools/:tool` 自动映射模板 `pdf_encrypt`，无需新增 Go 路由；sitemap 自动生成。
5. SEO：title「PDF 加密/解密 - 加密码保护/解除密码（免费/不上传）」、description、keywords（PDF加密、PDF加密码、PDF解密、PDF去密码、PDF解除密码、PDF密码保护）；JSON-LD 与 canonical 沿用现有工具页写法（域名 www.johnkingzcq123.xyz）；页面内与 PDF 页面管理（「整理完→加密发出」）、PDF 合并/拆分、PDF 批注打码互链。
6. 移动端适配：双模式页签与表单纵向布局不错乱；密码输入框支持显示/隐藏切换；按钮点击区够大；文件名过长截断不撑破布局。
7. 底部使用说明区注明与 WPS 对比卖点：本地处理不上传、不限次免费、不用开 WPS 会员；并如实说明浏览器端加密的适用边界（防转发/防随手打开，涉密文件仍建议走单位合规通道）——不夸大。

**加分项（今日第二步，进度顺利则带上）**：权限细粒度开关（禁止打印/禁止复制/禁止修改，按 pdf-lib permissions 支持情况）；密码强度实时提示；加密后页内「用刚设的密码验证打开」自检。

**验收标准**：
- [ ] `/tools/pdf-encrypt` 返回 200，首页「文档转换」分类可见入口（排在 PDF 页面管理旁）
- [ ] round-trip 小样先行：pdf-lib 1.17.1 加密导出 → 用密码 load 解密成功，小样过关才整页开发
- [ ] 加密：设置打开密码后导出 PDF，用 Adobe/浏览器打开必须输密码；密码正确可打开、内容完整；二次确认不一致有可读报错
- [ ] 解密：上传加密 PDF，密码正确导出无密码版本（可直接打开）；密码错误有可读中文报错、页面不白屏
- [ ] 异常不崩：损坏 PDF 有可读中文报错；pdf.js/pdf-lib CDN 懒加载失败有可读报错；>50MB 有可读提示不硬拦截
- [ ] 全程纯前端、无新增后端接口、无文件上传请求；`go build` 通过；SEO meta 完整；移动端布局不错乱；底部有加密适用边界如实说明

**预计改动文件**：`templates/pdf_encrypt.html`（新建）、`static/js/pdf-encrypt.js`（新建）、`static/js/pdf-crypto.js`（新建，自研 PDF 标准加密核心）、`tools/categories.go`（文档转换分类注册工具）、`templates/pdf_manage.html`（互链「整理完→加密发出」）、`BACKLOG.md`（本小节）。

**偏离记录（2026-10-13 代码评审后补记 · 开发阶段已处理）**：规格第 2/3 条要求「加密用 pdf-lib 1.17.1 加密参数」，实际实现为自研 `static/js/pdf-crypto.js`（V=2 RC4-128 / V=4 AES-128 AESV2，纯字节级重写、无第三方依赖）——原因是 pdf-lib 1.17.1 无加密写入 API。小样门已过：28 项 Node 验证全过 + pypdf 独立互操作验证（user/owner 密码均可解、错密码 WRONG_PASSWORD、明文报 NOT_ENCRYPTED）；10-15 验收时补测 Adobe/Chrome 打开验证。自研密码学实现存在审计风险，如实记录于此。
- 评审修复（2026-10-13 第2轮前端开发）：修复阻断性 bug（`pdf-encrypt.js` `renderDecFileInfo` 引用未定义变量 `enc`，改用 `decFile.encInfo`；导致解密模式选文件后密码表单不显示、导出按钮永久 disabled）；损坏 PDF 降级分支改为报错并阻止导出（不再允许「页数未知仍加密」）；以上改动复测通过。

## 今日任务（2026-10-14 · 产品经理已决策 ✅）

**交付状态（2026-10-13 晚间核对）**：已提前交付（commit 5359dfd `前端开发(2026-10-13)：新增 PDF 页面管理工具（旋转/删页/调序/提取单页，纯前端本地处理）`；模板 `pdf_manage`、`categories.go` 已注册 `/tools/pdf-manage`），自候选划掉并归入已实现，见下方晚间更新。

**选定：PDF 页面管理（旋转/删页/调序/提取单页）[WPS]** — 路由 `/tools/pdf-manage`（模板 `pdf_manage`），归「文档转换」分类，WPS 专题周第六枪（10-14）、「整理 PDF」旅程收官环

**决策理由**：
1. 兑现 10-13 午后排期明文：午后调研已把 10-14 定为「PDF 页面管理」既定首选、10-15 定为「PDF 加密/解密」候选，本决策执行该定序。
2. 需求侧当日三方信号加码：360doc 用户亲述「pdf 删除要会员」（2026-01-12 求替代帖原话）、轻档PDF 开发者 10-11 自荐（页面整理为核心卖点独立验证）、Medium 9-17《How to Delete Pages from PDF in the Browser for Free (No Upload, No Signup)》教程走红（删空白页/敏感页/扫描错页三大场景）——删页/整理页是付费墙后高频痛点，「浏览器本地删页不上传」心智与 ToolWeb 路线同频。
3. 与已上线工具形成闭环：「合并/拆分 + 转图 + 加水印 + 批注打码」四件套之后，「页面管理」是「整理 PDF」旅程的最后一环（合并/拆分/删页/调序/旋转全量覆盖）；与批注标记互链（「打码后整理页面」使用链），与合并/拆分互链（「拆分后整理单页」使用链）。
4. 单日交付风险低：pdf-lib 1.17.1、pdf.js 3.11.174（cdnjs UMD + worker）连续五日验证在栈；缩略图渲染路线（`pdf-to-image` 已验证）、CDN 懒加载、上传区交互（`pdf_watermark` 文案口径）全部同构——交互只有缩略图网格上的按钮与拖拽调序，无坐标映射级不确定项。
5. 落选说明：PDF 加密/解密（10-15 既定候选，顺位不动，银行/政务/HR 加密场景低频刚性）；PDF 压缩维持 P2 待评估（文本 PDF 重绘丢可选文字的质量风险未排除，仍无新增验证信号，不进排期）。

**规格**：
1. 上传区（参照 `pdf_watermark` 上传区与文案口径）：点击选择 + 拖拽上传单个 PDF（>50MB 提示「文件较大，处理可能较慢」、不硬拦截）；文件仅本地浏览器处理、不上传服务器，页面文案明示；上传后展示文件名、文件大小、总页数；加密/损坏 PDF 加载失败给出可读中文报错、页面不白屏。
2. 缩略图页网格：pdf.js（3.11.174，cdnjs UMD + worker，与 `pdf-to-image` 同版本同懒加载方式，CDN 失败可读报错）逐页渲染缩略图（约 160px 宽，dpr 适配）；每页卡片显示页码、选中勾选框、旋转按钮、删除按钮；网格支持拖拽调序（PC，HTML5 DnD）与上移/下移按钮（移动端）。
3. 页面操作：旋转（单页按钮每次顺时针 90°，累计旋转状态在卡片角标显示；预览即时旋转，无需重新渲染）；删除（删除后卡片消失，支持「撤销删除」一次性恢复上一页删除）；调序（拖拽/上移下移后页码重排）；全部操作即时反映在页面列表状态中，不动原文件。
4. 提取模式：勾选多页 → 「提取选中页导出」；亦可一键「导出全部保留页」。导出：pdf-lib（1.17.1，cdnjs，与 `pdf-merge-split.js` 同款 CDN 懒加载 + 失败提示）加载原 PDF，`copyPages` 按当前顺序与旋转状态复制保留页（旋转通过设置页面 `/Rotate` 实现，内容与页面尺寸无损），保存为 `pages_<原名>.pdf`；导出全程进度显示（`正在生成第 n / N 页` + 进度条）。
5. 注册：`tools/categories.go`「文档转换」（doc）分类内、`pdf_annotate` 之后新增工具 ID `pdf_manage`，Name「PDF 页面管理」，Description「PDF 旋转/删页/调序/提取单页，整理扫描件与报告，本地处理不上传、不限次」，Path `/tools/pdf-manage`，Icon `dashboard_customize`（沿用 Material Icons 已验证可用集合），New: true；通用路由 `/tools/:tool` 自动映射模板 `pdf_manage`，无需新增 Go 路由；sitemap 自动生成。
6. SEO：title「PDF 页面管理 - 旋转删页/调序/提取页面（免费/不上传/无水印）」、description、keywords（PDF旋转、PDF删页、PDF页面调序、提取PDF页面、PDF删空白页）；JSON-LD 与 canonical 沿用现有工具页写法（域名 www.johnkingzcq123.xyz）；页面内与 PDF 合并/拆分、PDF 批注打码、PDF 转图片互链。
7. 移动端适配：缩略图网格纵向布局不错乱；上移/下移/旋转/删除按钮点击区够大；拖拽仅作 PC 增强，移动端以按钮全量覆盖；文件名过长截断不撑破布局。
8. 底部使用说明区注明与 WPS 对比卖点：本地处理不上传、不限次免费、不用开 WPS 会员、导出无水印。

**加分项（今日第二步，进度顺利则带上）**：「提取选中页」支持在原页号基础上重命名输出、或一键「清空旋转」批量复位。

**验收标准**：
- [ ] `/tools/pdf-manage` 返回 200，首页「文档转换」分类可见入口（排在 PDF 批注打码旁）
- [ ] 上传 PDF 后文件名/大小/总页数展示正确；缩略图逐页渲染无白格；拖拽调序与上/下移均生效且页码正确重排
- [ ] 旋转：单页旋转按钮每次 +90°，缩略图与导出一致（导出 PDF 打开后页面方向与预览一致，无肉眼错位）
- [ ] 删除：删页后卡片消失、页码重排；撤销删除恢复；导出 PDF 页数 = 原页数 − 删除页数，内容/尺寸无损
- [ ] 提取：勾选多页导出后仅含选中页且顺序与网格一致；未勾选时「导出全部」按钮含全部保留页
- [ ] 异常不崩：加密/损坏 PDF 有可读中文报错；pdf.js/pdf-lib CDN 懒加载失败有可读报错、页面不白屏；>50MB 有可读提示不硬拦截
- [ ] 全程纯前端、无新增后端接口、无文件上传请求；`go build` 通过；SEO meta 完整；移动端布局不错乱

**预计改动文件**：`templates/pdf_manage.html`（新建）、`static/js/pdf-manage.js`（新建）、`tools/categories.go`（文档转换分类注册工具）、`BACKLOG.md`（本小节）。

**选定：PDF 批注标记（涂抹打码 + 高亮 MVP）[WPS]** — 路由 `/tools/pdf-annotate`（模板 `pdf_annotate`），归「文档转换」分类，WPS 专题周第五枪、「输出前处理」叙事收官环

**决策理由**：
1. 兑现 10-12 决策明文承诺：昨日今日任务小节明文「PDF 批注标记（连续多日 P0，Cachety 走红验证）顺延至明日或专题周末轮」——「明日」即今日 10-13，到期兑现、不再顺延（前几日 OCR、图片转 PDF 均是承诺到期即交付，排期纪律延续）。
2. 需求侧为三候选中最强、竞品共同押注：Smallpdf redact 明确「免费版限次、Pro 不限次」、PDFgear 以「100% 免费、无水印、文件不离开设备、免注册」打 annotate 卖点、Cachety（10-11 小众软件走红）验证「本地处理不上传」心智——「免费打码/批注」是竞品共同押注的卖点位，ToolWeb「纯前端不上传、不限次、无水印」正好卡位。
3. 专题周叙事收官：10-10 加水印、10-11 OCR、10-12 图片转 PDF 之后，「发出去之前处理一下」的最后一块拼图就是在 PDF 上涂掉敏感信息/圈重点加标注；与站内图片打码、EXIF 清除的「分享前处理」心智同频，与图片打码形成「图片侧 / PDF 侧」对应能力。
4. 单日交付风险已封顶：pdf.js（3.11.174 cdnjs UMD + worker）与 pdf-lib（1.17.1）均在栈（watermark/转图连续验证）；主要工作量是 canvas 覆盖层坐标映射与多页批注状态管理——通过作用域切割封顶：MVP 只做「涂抹打码 + 荧光笔高亮」两工具，文字标注列今日加分项（前端进度顺利则并入，否则顺延不影响交付）；打码采用视觉覆盖遮罩（真 redaction 需动内容流删文本、超单日量级，页面如实说明、不夸大），高亮为半透明叠加。
5. 落选说明：PDF 页面管理（P0，今日 Top2、轻档PDF 自荐新信号）列为明日首选（10-14）——与批注标记同属 PDF 处理簇、互链收益延续；PDF 加密/解密（P0 备选）顺延为 10-15 候选；PDF 压缩维持 P2 待评估（文本 PDF 重绘丢可选文字风险未排除）。

**规格**：
1. 上传区（参照 `pdf_watermark` 上传区与文案口径）：点击选择 + 拖拽上传单个 PDF（多页支持；>50MB 时提示「文件较大，处理可能较慢」、不硬性拦截）；文件仅在本地浏览器处理、不上传服务器，页面文案明示；上传后展示文件名、文件大小、总页数；加密/损坏 PDF 加载失败给出明确可读中文报错、页面不白屏。
2. 渲染与翻页：pdf.js（pdfjs-dist 3.11.174，cdnjs UMD + worker，与 `pdf-to-image` 同版本同懒加载方式，CDN 失败可读报错）逐页渲染到 canvas；工具栏提供上一页/下一页 + 页码跳转输入；当前页号/总页数展示；渲染 scale 固定记录，作为显示坐标→PDF 点坐标映射基准（计入 devicePixelRatio 与 CSS 缩放）。
3. 工具栏（两核心工具 + 管理）：「涂抹打码」——矩形框选（鼠标拖拽 + 触摸拖拽），松开即在覆盖层生成遮罩块，颜色可选（黑/白/灰，默认黑）；「荧光笔高亮」——拖拽画笔，半透明（约 40%）黄/绿/粉三色可选、线宽三档可调；两工具均支持「撤销上一步」与「清空当前页」；批注数据按页存储（页号 → 批注列表），翻页切换后批注保留、再切回仍在。
4. 核心回写（`static/js/pdf-annotate.js`）：显示坐标按记录的 scale/devicePixelRatio 映射回 PDF 点坐标；pdf-lib（1.17.1，cdnjs，与 `pdf-merge-split.js` 同款 CDN 懒加载 + 失败提示）加载原 PDF，逐页 `drawRectangle`：打码块按所选颜色不透明填充覆盖对应区域；高亮按画笔路径包络矩形绘制半透明色块；未批注页面原样复制；导出全程显示进度（`正在处理第 n / N 页` + 进度条）；导出文件名 `annotated_<原名>.pdf`。
5. 诚实文案（必须）：打码为视觉覆盖遮罩（防截屏转发/打印可见），页面使用说明区如实注明「打码以色块覆盖实现视觉遮挡，底层文字层未删除；对防复制合规有强要求的场景请打印后重新扫描」——不夸大、不承诺真 redaction。
6. 注册：`tools/categories.go`「文档转换」（doc）分类内、`images_to_pdf` 之后新增工具 ID `pdf_annotate`，Name「PDF 批注打码」，Description「PDF 涂抹打码/荧光笔高亮，合同证件发前处理，本地处理不上传、不限次」，Path `/tools/pdf-annotate`，Icon `border_color`，New: true；通用路由 `/tools/:tool` 自动映射模板 `pdf_annotate`，无需新增 Go 路由；sitemap 自动生成。
7. SEO：title「PDF 批注打码 - 合同证件涂抹/高亮标注（免费/不上传/无水印）」、description、keywords（PDF打码、PDF涂抹、PDF高亮、PDF标注、合同打码、证件打码）；JSON-LD 与 canonical 沿用现有工具页写法（域名 www.johnkingzcq123.xyz）；页面内与 PDF 加水印、图片打码（img_mosaic）、PDF 合并/拆分互链。
8. 移动端适配：工具栏纵向布局不错乱；触摸框选/画笔可用（touch-action 处理避免滚动干扰）；按钮点击区够大；canvas 自适应宽度，文件名过长截断不撑破布局。
9. 底部使用说明区注明与 WPS 对比卖点：本地处理不上传、不限次免费、不用开 WPS 会员、导出无水印。

**加分项（今日第二步，进度顺利则带上）**：文字标注（点击页面放置文本框、字号颜色可调；导出时以 canvas 渲染文字为 PNG stamp 嵌入，沿用 watermark 中文水印路线）。

**验收标准**：
- [ ] `/tools/pdf-annotate` 返回 200，首页「文档转换」分类可见入口（排在图片批量转 PDF 旁）
- [ ] 上传 PDF 后文件名/大小/总页数展示正确；多页可翻页/跳页，批注随页保留、切回仍在
- [ ] 涂抹打码：框选后覆盖层即时出现遮罩块，黑/白/灰三色可切换；荧光笔高亮：拖拽出半透明色带，黄/绿/粉三色与线宽三档可调；撤销上一步与清空当前页均生效
- [ ] 导出 PDF 可正常打开：每页遮罩块/高亮位置与导出前预览一致（无错位、缩放偏差肉眼不可见），未批注页面原内容无损
- [ ] 异常不崩：加密/损坏 PDF 有可读中文报错；pdf.js/pdf-lib CDN 懒加载失败有可读报错、页面不白屏；>50MB 有可读提示不硬拦截
- [ ] 诚实文案：页面使用说明区含「覆盖式打码、底层文字层未删除」如实说明
- [ ] 全程纯前端、无新增后端接口、无文件上传请求；`go build` 通过；SEO meta 完整；移动端布局不错乱、触摸画笔可用

**预计改动文件**：`templates/pdf_annotate.html`（新建）、`static/js/pdf-annotate.js`（新建）、`tools/categories.go`（文档转换分类注册工具）、`BACKLOG.md`（本小节）。

## 今日候选（2026-10-13 · 产品调研推荐）

> **本周特别方向（2026-10-09 至 10-15）持续（第 5 天）**：继续攻 WPS 会员付费功能「免费纯前端替代」。今日信号更新：① 「PDF 页面管理」需求被独立开发者再验证——小众软件论坛约 2 天前（2026-10-11）开发者自荐「轻档PDF」（pdfpackage.cn）：免费在线 PDF 工具，核心卖点正是页面整理（删除多余页面、提取指定页、替换某几页、缩略图预览确认），另含水印/页码、PDF 转图、图片转 PDF、PDF 导出 Word/Excel/TXT、中文 OCR，且「页面整理和 OCR 等操作在浏览器本地完成」——该开发者独立选出的功能矩阵与 ToolWeb 已上线/在研高度重合（图片转 PDF、OCR 均已交付），页面管理正是我们尚未覆盖的空白格；② V2EX 近期「yasuo.app」自荐帖用户原话点名：「WPS 有这种（压缩）工具，不但要登录还要会员，偶尔一用太麻烦」——「PDF 压缩」是今日新发现的 WPS 付费墙功能，纯前端 MVP 可做（pdf.js 渲染降分辨率→重嵌），但文本型 PDF 重绘会丢失可选文字，质量风险列 P2 待定；③ 批注/打码方向竞品格局：Smallpdf redact 明确「免费版限次、Pro 不限次」、PDFgear 以「100% 免费、无水印、文件不离开设备、免注册」打 annotate 卖点——「免费打码/批注」是竞品共同押注的卖点位，而我们的「纯前端不上传、不限次、无水印」正好卡位；④ 新浪 2026-09-16 文章《文件转格式为何从借会员转向求豆包》再确认传统痛点：WPS 会员制免费版限制页数/速度/画质/水印，用户紧急场景（论文转 PDF、扫描件提文字、视频压缩）只能「借会员」——「不用开 WPS 会员」叙事继续有效；⑤ 360doc 用户求替代帖点名「word 转 pdf、pdf 合并、pdf 删除、pdf 转 word 都要会员」——「pdf 删除」再验证页面管理痛点。
>
> **昨日交付核对**：图片批量转 PDF [WPS] 已上线（commit 5c389c6 `前端开发(2026-10-12)：新增图片批量转 PDF 工具（纯前端本地合成、无水印）` + 修复 cded433「PDFDocument.create() 缺 await 阻塞 bug」+ 311ca1d 静态资源版本参数；模板 `images_to_pdf`、`categories.go` 已注册 `/tools/images-to-pdf`），自候选划掉并归入已实现。PDF 处理簇现已成「合并/拆分 + 转图 + 加水印」三件套，另有「图片→PDF」「图片→文字」两条新旅程线。

**推荐 Top3**（均为 [WPS] 来源，优先高频、单页可实现、契合现有架构；努力度为单页前端交付量级评估）：

1. **PDF 批注标记（涂抹/高亮/文字标注）[WPS]** — 连续多日 P0，昨日 Top2 今日顺位：专题周「输出前处理」叙事收官环——10-10 加水印、10-11 OCR、10-12 图片转 PDF 之后，「发出去之前处理一下」的最后一块拼图就是在 PDF 上涂掉敏感信息/圈重点/加一句标注；与站内图片打码、EXIF 清除的「分享前处理」心智同频。需求侧今日再加码：Smallpdf redact「免费版限次、Pro 不限次」、PDFgear 以「免费无水印免注册」打 annotate 卖点——免费打码/批注是竞品共同押注位；Cachety（10-11 小众软件走红）继续验证「本地处理不上传」心智。实现：pdf.js 渲染→canvas 覆盖层框选打码/画笔高亮/文本标注→pdf-lib 回写导出（中难度，坐标映射与多页状态管理是主要工作量；单日建议聚焦「涂抹打码 + 高亮」MVP）。SEO：PDF打码、PDF涂抹、PDF标注、合同打码。
2. **PDF 页面管理（旋转/删页/调序/提取单页）[WPS]** — 昨日 Top3 今日顺位，今日最强新信号加持：轻档PDF 开发者自荐（2 天前）把页面整理（删页/提取指定页/替换某几页/缩略图预览）当核心卖点独立验证；360doc 用户点名「pdf 删除」要 WPS 会员；UPDF「如何在线删除 PDF 页面/删除空白页」SEO 怎么做系列证明搜索需求。与已上线合并/拆分同属「整理 PDF」旅程（合并拆分的自然延伸），pdf-lib 在栈、CDN 懒加载与上传区交互同构，单日交付风险低。实现：上传 PDF→缩略图页列表→旋转 90°/删除/拖拽调序→导出新 PDF（保留页面尺寸与内容），中难度。SEO：PDF旋转、PDF删页、PDF页面调序、提取PDF页面。
3. **PDF 加密/解密 [WPS]** — P1 提级为今日备选：WPS 加密文档属会员功能；银行/政务加密 PDF「打开输密码」与「加密码防扩散」是真实场景（虽低频但刚性强）；pdf-lib 支持加密、pdf.js 可处理用户密码解密，与页面管理同属 PDF 处理簇旅程。实现：上传 PDF→设置用户密码/权限密码→pdf-lib 加密导出；或输入密码打开加密 PDF→解密导出，中难度。落选说明：PDF 压缩为今日新发现候选，但纯前端文本 PDF 压缩（重绘）会丢失可选文字、质量风险未排除，列 P2 待评估 MVP 形态，不进 Top3。

**本周 WPS 候选表更新**（继承 2026-10-12 全表；昨日已交付图片批量转 PDF 划掉归档，PDF 加密/解密由 P1 提级为 P0 备选，新增 PDF 压缩）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| PDF 批注标记（涂抹/高亮/标注）[WPS] | WPS PDF 编辑属会员；发合同/证件前打码圈重点刚需，「输出前处理」叙事收官环；Smallpdf 限次收费、PDFgear 免费卖点、Cachety 走红三方验证 | 中 | P0（今日 Top1） |
| PDF 页面管理（旋转/删页/调序/提取单页）[WPS] | WPS 页面管理与拆分包收费；轻档PDF 开发者自荐独立验证页面整理需求；360doc 用户点名 pdf 删除要会员；合并/拆分旅程自然延伸，技术路线同构 | 中 | P0（今日 Top2） |
| PDF 加密/解密 [WPS] | WPS 加密文档属会员；银行/政务加密 PDF 打开与加密码场景真实刚性但低频 | 中 | P0（今日 Top3，备选） |
| PDF 压缩（减小体积）[WPS] | 今日新发现：V2EX 用户点名 WPS 压缩「要登录还要会员」；纯前端可做渲染降分辨率 MVP，但文本 PDF 重绘丢可选文字，质量风险待评估 | 中 | P2（新候选，待评估） |
| PDF 转 Word/Excel/PPT [WPS] | 会员核心卖点、吐槽最集中（免费仅转前 5 页）；但纯前端只能提取文本流、版式还原差，易砸口碑 | 中 | P2（低优先，质量风险） |
| 思维导图 [WPS] | WPS 思维导图为增值功能；纯前端可做（树编辑+导出 PNG/SVG），课堂/会议记录中频 | 中 | P2 |
| 流程图绘制 [WPS] | WPS/WPS 绘图增值功能；纯前端画布可做，但交互复杂、单日难保质量 | 大 | P2 |
| 批量处理（批量转格式/改名/压缩）[WPS] | WPS 批量处理为会员卖点；纯前端可做批量改名清单生成等子集，价值视子功能而定 | 中 | P2 |
| 文档翻译 [WPS] | WPS 翻译属 AI/会员权益；需调用外部翻译 API 或大模型，非纯前端 | 中 | P3（需后端/AI，低优先） |
| 音频转文字（语音速记）[WPS] | 超级会员权益；浏览器 Web Speech 识别受限、离线模型体积大，非纯前端单页 | 大 | P3（低优先） |
| 简历/合同模板库 [WPS] | 稻壳/模板套餐收费；属内容库而非工具，与单页工具架构不符 | 中 | P3（形态不符，暂缓） |
| ~~图片批量转 PDF（含多图合一）[WPS]~~（2026-10-12 已交付） | WPS 图片转 PDF 属会员 → 已实现 `/tools/images-to-pdf`（commit 5c389c6/cded433/311ca1d），归档 | 小 | ✅ 归档 |
| ~~OCR 图片文字识别 [WPS]~~（2026-10-11 已交付） | WPS 识别/转文字为会员功能 → 已实现 `/tools/ocr-image-text`（commit 480771b，小样实测三门槛过关），归档 | 中 | ✅ 归档 |
| ~~PDF 加水印 [WPS]~~（2026-10-10 已交付） | WPS PDF 加水印属会员编辑功能 → 已实现 `/tools/pdf-watermark`（commit f7d1903/a13db05/4e779f1），归档 | 小 | ✅ 归档 |

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

**归档说明**：PDF 合并/拆分（10-09）、PDF 转图片/长图（10-09）、PDF 加水印（10-10）、OCR 图片文字识别（10-11）、图片批量转 PDF（10-12）均已上线；PDF 处理簇三件套（合并/拆分、转图、加水印）+「图片→PDF」+「图片→文字」双旅程线成型；专题周剩余两日（10-14、10-15）建议按「批注标记 → 页面管理」次序收官。

### 午后更新（2026-10-13 16:00 · 产品调研，为 10-14/10-15 排期）

> **本周特别方向（2026-10-09 至 10-15）第 5 天收尾**：今日任务「PDF 批注标记 [WPS]」已交付上线（见下），专题周连续五日交付达成；本轮调研为剩余两日（10-14、10-15）定序。

**今日交付核对**：PDF 批注标记（涂抹打码+荧光笔高亮+文字标注）[WPS] 已上线（commit 5164e11 `前端开发(2026-10-13)：新增 PDF 批注打码工具（涂抹打码+荧光笔高亮+文字标注，纯前端本地处理）` + d3b6cde 第1轮评审反馈修复；模板 `pdf_annotate`、`categories.go` 已注册 `/tools/pdf-annotate`），自候选划掉并归入已实现。专题周交付线：10-09 合并/拆分 + PDF 转图、10-10 加水印、10-11 OCR、10-12 图片转 PDF、10-13 批注打码。

**今日新信号**（2026-10-13 午后，全网调研）：
1. 「PDF 删页」需求被用户亲述再验证：360doc 求替代帖（2026-01-12）原话点名「word 转为 pdf、pdf 合并、pdf 删除、pdf 转 word 都要 WPS 会员」「处处需要会员」——「pdf 删除」是用户亲历的会员墙痛点，与轻档PDF 开发者自荐（10-11，页面整理为核心卖点）、UPDF「删除 PDF 页面」SEO 系列同频；
2. Medium 2026-09-17 教程《How to Delete Pages from PDF in the Browser for Free (No Upload, No Signup)》专讲「浏览器内免费删页、不上传不注册」，列出删空白页/敏感页/扫描错页三大场景——「本地处理不上传」的删页心智继续走红，与 ToolWeb 路线同频；
3. WPS 7-6 回应「滥收费、背刺用户」声明（东方财富 2026-07-06 转载）称「免费基础功能绝不收费、会员权益绝不上移」——会员墙争议未消，「不用开 WPS 会员」叙事继续有效；
4. PDF 压缩：未获新增验证信号（仍只有 V2EX「yasuo.app」用户原话「WPS 有压缩工具，不但要登录还要会员」一例）；文本 PDF 重绘丢可选文字的质量风险未排除，维持 P2 待评估，不进排期。

**推荐 Top3**（延续 2026-10-13 决策既定次序：10-14「PDF 页面管理」首选、10-15「PDF 加密/解密」候选；努力度为单页前端交付量级评估）：

1. **PDF 页面管理（旋转/删页/调序/提取单页）[WPS]** — 10-14 既定首选，今日三方信号加码：360doc 用户亲述「pdf 删除要会员」+ 轻档PDF（10-11）独立开发者验证 + Medium 9-17 「不上传删页」教程走红；与已上线的批注标记同属 PDF 处理簇（互链：「批注打码后整理页面」使用链），与合并/拆分形成「整理 PDF」完整旅程（合并/拆分/删页/调序/旋转）；pdf-lib 在栈、缩略图渲染路线（`pdf-to-image` 已验证）、CDN 懒加载与上传区交互同构，单日交付风险低。实现：上传 PDF→缩略图页网格→旋转 90°/删除/拖拽调序→导出新 PDF（中难度）。SEO：PDF旋转、PDF删页、PDF页面调序、提取PDF页面。
2. **PDF 加密/解密 [WPS]** — 10-15 既定候选：WPS PDF 加密属会员功能；银行/政务/HR 加密 PDF「打开输密码」与「加密码防扩散」是低频但刚性场景（工资条/合同加密 PDF 是典型）；pdf-lib 支持加密、pdf.js 可输入用户密码解密，与页面管理同属 PDF 处理簇旅程。实现：上传 PDF→设打开密码/权限密码→pdf-lib 加密导出；或输入密码打开加密 PDF→解密导出（中难度）。若 10-14 页面管理单日风险超预期，顺位不动（加密/解密同属中难度独立页，不会因页面管理延误而需要替换）。
3. **PDF 压缩（减小体积）[WPS]** — P2 待评估保留候选：V2EX「yasuo.app」用户原话「WPS 压缩不但要登录还要会员」是唯一信号；纯前端 MVP（pdf.js 渲染降分辨率→重嵌）技术路线存在，但文本 PDF 重绘丢可选文字质量风险未排除，今日仍无新增验证信号，不建议进 10-14/10-15 排期。若产品经理要启用，需先做压缩质量小样（文本 PDF 文字可选中性留存测试）再定版。

**WPS 候选表更新**（2026-10-13 午后；PDF 批注标记已交付归档，PDF 页面管理升为 10-14 既定首选，PDF 加密/解密升为 10-15 既定候选）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| PDF 页面管理（旋转/删页/调序/提取单页）[WPS] | WPS 页面管理与拆分包收费；360doc 用户亲述 pdf 删除要会员；轻档PDF 开发者（10-11）独立验证页面整理；Medium 9-17「不上传删页」教程走红；合并/拆分旅程自然延伸，技术路线同构 | 中 | P0（10-14 既定首选） |
| PDF 加密/解密 [WPS] | WPS 加密文档属会员；银行/政务/HR 加密 PDF 打开与加密码场景低频刚性 | 中 | P0（10-15 既定候选） |
| PDF 压缩（减小体积）[WPS] | V2EX 用户点名 WPS 压缩「要登录还要会员」；今日无新增信号；文本 PDF 重绘丢文字质量风险未排除 | 中 | P2（待评估，不进排期） |
| PDF 转 Word/Excel/PPT [WPS] | 会员核心卖点、吐槽最集中（免费仅转前 5 页）；但纯前端只能提取文本流、版式还原差，易砸口碑 | 中 | P2（低优先，质量风险） |
| 思维导图 [WPS] | WPS 思维导图为增值功能；纯前端可做（树编辑+导出 PNG/SVG），课堂/会议记录中频 | 中 | P2 |
| 流程图绘制 [WPS] | WPS/WPS 绘图增值功能；纯前端画布可做，但交互复杂、单日难保质量 | 大 | P2 |
| 批量处理（批量转格式/改名/压缩）[WPS] | WPS 批量处理为会员卖点；纯前端可做批量改名清单生成等子集，价值视子功能而定 | 中 | P2 |
| 文档翻译 [WPS] | WPS 翻译属 AI/会员权益；需调用外部翻译 API 或大模型，非纯前端 | 中 | P3（需后端/AI，低优先） |
| 音频转文字（语音速记）[WPS] | 超级会员权益；浏览器 Web Speech 识别受限、离线模型体积大，非纯前端单页 | 大 | P3（低优先） |
| 简历/合同模板库 [WPS] | 稻壳/模板套餐收费；属内容库而非工具，与单页工具架构不符 | 中 | P3（形态不符，暂缓） |
| ~~PDF 批注标记（涂抹打码+高亮+文字标注）[WPS]~~（2026-10-13 已交付） | WPS PDF 编辑属会员；发合同/证件前打码圈重点刚需 → 已实现 `/tools/pdf-annotate`（commit 5164e11/d3b6cde），归档 | 中 | ✅ 归档 |
| ~~图片批量转 PDF（含多图合一）[WPS]~~（2026-10-12 已交付） | WPS 图片转 PDF 属会员 → 已实现 `/tools/images-to-pdf`（commit 5c389c6/cded433/311ca1d），归档 | 小 | ✅ 归档 |
| ~~OCR 图片文字识别 [WPS]~~（2026-10-11 已交付） | WPS 识别/转文字为会员功能 → 已实现 `/tools/ocr-image-text`（commit 480771b，小样实测三门槛过关），归档 | 中 | ✅ 归档 |
| ~~PDF 加水印 [WPS]~~（2026-10-10 已交付） | WPS PDF 加水印属会员编辑功能 → 已实现 `/tools/pdf-watermark`（commit f7d1903/a13db05/4e779f1），归档 | 小 | ✅ 归档 |

**归档说明**：专题周（10-09 至 10-13）连续五日交付：10-09 PDF 合并/拆分 + PDF 转图、10-10 加水印、10-11 OCR、10-12 图片转 PDF、10-13 批注打码；PDF 处理簇现为合并/拆分、转图、加水印、批注打码四件套 +「图片→PDF」「图片→文字」双旅程线；剩余两日（10-14、10-15）建议「页面管理 → 加密/解密」次序收官。

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

### 晚间更新（2026-10-13 20:00 · 产品调研，为 10-15 排期）

> **本周特别方向（2026-10-09 至 10-15）第 5 天晚间**：10-14 任务「PDF 页面管理 [WPS]」已提前交付（见下）；本轮调研为专题周最后一天（10-15）定序，候选全部来自 WPS 付费功能矩阵。

**交付核对**：PDF 页面管理（旋转/删页/调序/提取单页）[WPS] 已上线（commit 5359dfd `前端开发(2026-10-13)：新增 PDF 页面管理工具（旋转/删页/调序/提取单页，纯前端本地处理）`；模板 `pdf_manage`、`categories.go` 已注册 `/tools/pdf-manage`），自候选划掉并归入已实现。专题周交付线更新为：10-09 合并/拆分 + PDF 转图、10-10 加水印、10-11 OCR、10-12 图片转 PDF、10-13 批注打码 + 页面管理（连续五日六工具）。

**今日新信号**（2026-10-13 晚间，全网调研）：
1. 「浏览器本地加密、不上传」教程系列走红：Medium 作者 lin wang 于 2026-08-21、2026-09-02 连发两篇《How to Encrypt PDF (Files) in the Browser for Free (No Upload, No Signup)》——与 9-17 验证页面管理的《How to Delete Pages from PDF in the Browser for Free (No Upload, No Signup)》同作者同系列，「浏览器本地处理 PDF 不上传」心智被同一作者连续选题验证；教程列出财务/法务/HR/医疗四大加密场景，技术点为用户密码+所有者密码双密码、AES-128/256 可选——10-15 既定候选「PDF 加密/解密」信号加码；
2. WPS 官方付费功能清单对齐：bol7.com 的 WPS Office PDF Convert Tool（季度订阅）功能清单明列 "Password Protection" 为 premium 订阅功能，与「WPS 加密文档属会员」结论对齐；网易《WPS，鸡同鸭讲》（约 98 天前，2 天前被抓取）指出会员体系持续拆分（PDF 套餐/云盘套餐/大会员）——「不用开 WPS 会员」叙事继续有效；
3. PDF 压缩获多源新增验证（由「仅 V2EX 一例」升级）：dev.to（约 37 天前，9 天前被抓取）《Compress a PDF for Email Without Cloud Tools》讲浏览器本地压缩（OpenPDF Hub，WASM，无上传），点名邮箱附件限制（Gmail 25MB、Outlook 20MB、政务/高校门户常低至 2MB）是明确痛点；Medium 2026-04《How to Compress a PDF for Free — Up to 70% Smaller, No Upload, No Watermark》介绍 ihatepdf.cv 用 **Ghostscript 编译为 WebAssembly** 在浏览器内压缩、加载后可断网用；visualpdf.com 的 compress-pdf（7 小时前仍活跃抓取）同样「浏览器内处理、不上传、免费不限次、无水印」；Medium 2026-09-17《How to Compress a PDF Online for Free》（BytesPDF 浏览器本地压缩）与删页教程同日发布，疑似同一内容营销系列。→「浏览器本地压缩不上传」趋势明确，但纯前端质量风险（文本 PDF 重绘丢可选文字）仍未排除，可行路线为 Ghostscript-WASM（体积大）或嵌入图片提取重压缩（文本页几乎无收益），需小样验证后才能进排期；
4. 其余 WPS 矩阵候选今日无新增信号：PDF 转 Word/Excel/PPT（版式还原质量风险）、思维导图、流程图、批量处理、文档翻译（需后端/AI）、音频转文字、模板库均维持原优先级。

**推荐 Top3**（10-15 专题周收官日排期；努力度为单页前端交付量级评估）：

1. **PDF 加密/解密 [WPS]** — 10-15 首选（既定候选转正）：晚间三方加码——lin wang「不上传加密」教程系列与删页教程同作者同系列（心智验证延续）；WPS 官方付费功能清单明列 Password Protection 为 premium；竞品 iLovePDF/Smallpdf 的加密功能一律要上传文件。与页面管理同属 PDF 处理簇（「整理完→加密发出」使用链），与批注打码形成「处理→保护」叙事。实现：上传 PDF→设打开密码/所有者密码（AES-128/256 档可选）→pdf-lib 加密导出；或输入密码打开加密 PDF→pdf-lib（load 支持 password 参数）解密导出（中难度）。SEO：PDF加密、PDF加密码、PDF解密、PDF去密码、PDF解除密码。
2. **PDF 压缩（减小体积）[WPS]** — P1 备选（由 P2 提级）：多源新增验证（dev.to 浏览器本地压缩教程、Medium Ghostscript-WASM 路线、visualpdf 活跃页面）；邮箱/门户附件体积限制痛点明确（25MB/20MB/2MB 三档）。质量风险仍在：纯前端 pdf.js 渲染降分辨率重嵌会丢失文本可选性；启用前必须先做小样（文本 PDF 文字可选中性 + 扫描件压缩率两项测试），小样不过则回退为「扫描件/图片型 PDF 压缩」限定版或放弃。SEO：PDF压缩、PDF减小体积、PDF太大发不出去。
3. **思维导图 [WPS]** — P2，专题周后（10-16 起）首选候选：WPS 思维导图为增值功能；纯前端可做（树编辑+导出 PNG/SVG）；课堂/会议记录中频场景；PDF 簇收官后开辟新品类，避免专题周最后一天切换品类。难度中。SEO：思维导图、在线思维导图、免费思维导图。

**WPS 候选表更新**（2026-10-13 晚间；PDF 页面管理已交付归档，PDF 加密/解密升为 10-15 首选，PDF 压缩由 P2 提级为 P1 备选）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| PDF 加密/解密 [WPS] | WPS 官方付费功能清单明列 Password Protection 为 premium；lin wang「不上传加密」教程系列（8-21/9-02）与删页教程同作者同系列验证心智；HR/财务/法务/医疗加密场景刚性；与页面管理「整理完→加密发出」使用链 | 中 | P0（10-15 首选） |
| PDF 压缩（减小体积）[WPS] | P1 提级：dev.to/Medium/visualpdf 多源验证浏览器本地压缩趋势（Ghostscript-WASM 路线）；邮箱/门户附件体积限制痛点明确；文本 PDF 重绘丢文字质量风险未排除，需小样验证 | 中 | P1（备选，需小样） |
| 思维导图 [WPS] | WPS 思维导图为增值功能；纯前端可做（树编辑+导出 PNG/SVG），课堂/会议记录中频；专题周后首选新品类 | 中 | P2（专题周后候选） |
| PDF 转 Word/Excel/PPT [WPS] | 会员核心卖点、吐槽最集中（免费仅转前 5 页）；但纯前端只能提取文本流、版式还原差，易砸口碑 | 中 | P2（低优先，质量风险） |
| 流程图绘制 [WPS] | WPS/WPS 绘图增值功能；纯前端画布可做，但交互复杂、单日难保质量 | 大 | P2 |
| 批量处理（批量转格式/改名/压缩）[WPS] | WPS 批量处理为会员卖点；纯前端可做批量改名清单生成等子集，价值视子功能而定 | 中 | P2 |
| 文档翻译 [WPS] | WPS 翻译属 AI/会员权益；需调用外部翻译 API 或大模型，非纯前端 | 中 | P3（需后端/AI，低优先） |
| 音频转文字（语音速记）[WPS] | 超级会员权益；浏览器 Web Speech 识别受限、离线模型体积大，非纯前端单页 | 大 | P3（低优先） |
| 简历/合同模板库 [WPS] | 稻壳/模板套餐收费；属内容库而非工具，与单页工具架构不符 | 中 | P3（形态不符，暂缓） |
| ~~PDF 页面管理（旋转/删页/调序/提取单页）[WPS]~~（2026-10-13 已交付） | WPS 页面管理与拆分包收费 → 已实现 `/tools/pdf-manage`（commit 5359dfd），归档 | 中 | ✅ 归档 |
| ~~PDF 批注标记（涂抹打码+高亮+文字标注）[WPS]~~（2026-10-13 已交付） | WPS PDF 编辑属会员；发合同/证件前打码圈重点刚需 → 已实现 `/tools/pdf-annotate`（commit 5164e11/d3b6cde），归档 | 中 | ✅ 归档 |
| ~~图片批量转 PDF（含多图合一）[WPS]~~（2026-10-12 已交付） | WPS 图片转 PDF 属会员 → 已实现 `/tools/images-to-pdf`（commit 5c389c6/cded433/311ca1d），归档 | 小 | ✅ 归档 |
| ~~OCR 图片文字识别 [WPS]~~（2026-10-11 已交付） | WPS 识别/转文字为会员功能 → 已实现 `/tools/ocr-image-text`（commit 480771b，小样实测三门槛过关），归档 | 中 | ✅ 归档 |
| ~~PDF 加水印 [WPS]~~（2026-10-10 已交付） | WPS PDF 加水印属会员编辑功能 → 已实现 `/tools/pdf-watermark`（commit f7d1903/a13db05/4e779f1），归档 | 小 | ✅ 归档 |

**归档说明**：专题周（10-09 至 10-13）连续五日交付六工具：10-09 PDF 合并/拆分 + PDF 转图、10-10 加水印、10-11 OCR、10-12 图片转 PDF、10-13 批注打码 + 页面管理（页面管理原定 10-14，开发轮提前交付）；PDF 处理簇现为合并/拆分、转图、加水印、批注打码、页面管理五件套 +「图片→PDF」「图片→文字」双旅程线；专题周最后一天（10-15）建议「PDF 加密/解密」收官，PDF 压缩为风险对冲备选（需小样）。

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

## 今日任务（2026-10-12 · 产品经理已决策 ✅）

**选定：图片批量转 PDF（含多图合一）[WPS]** — 路由 `/tools/images-to-pdf`（模板 `images_to_pdf`），归「文档转换」分类，WPS 专题周第四枪

**决策理由**：
1. 调研 Top1、昨日遗留承诺兑现：2026-10-11 决策明文「图片批量转 PDF（小难度）今日降为【备选】——若 OCR 小样实测不过关当日即改做它」「OCR 小样过关即整页开发，备选本次不启用」；OCR 已交付（commit 480771b），备选今日顺位转正，排期纪律延续不断档。
2. 交付确定性最高、风险最低：技术路线与 pdf-lib 1.17.1 在栈、CDN 懒加载路线三日连续验证（pdf_watermark 实测跑通：离屏 canvas → pdf-lib 回写导出）；纯前端多图上传→排序→合成单 PDF，无新依赖、无坐标映射/多页状态管理，无需小样实测关口，单日高质量交付确定性最高——专题周最后两天需稳收官，不引入 PDF 批注标记的中交互重构风险。
3. 需求侧双信号验证、差异化清晰：WPS 图片转 PDF/多图合一属会员功能；作业/证件照/报销票据拍照合并提交是手机端极高频动作（青蓝PDF类小程序走红路径）；免费竞品处处设限（iLovePDF 限 JPG、迅捷 2MB、Smallpdf 下载慢）且一律上传，ToolWeb 可做「纯前端不上传、不限次、无水印」差异化；WPS 免费版输出 PDF 自带「WPS Office」标识水印的会员墙争议正发酵，「不用开 WPS 会员、导出无水印」即传播卖点。
4. 旅程线承接：PDF 处理簇四件套（合并/拆分、转图、加水印）+ 图片→文字线已成型，本工具打通「图片→PDF」新旅程线，与 PDF 加水印形成「合成 PDF→加水印」串联使用路径。
5. 落选说明：PDF 批注标记（连续多日 P0，Cachety 走红验证）顺延至明日或专题周末轮，原因：canvas 覆盖层坐标映射 + 多页状态管理是单页最大不确定项，不宜与明日「专题周总结/周报」叠加；PDF 页面管理（P0）顺延至批注之后，作为「整理 PDF」旅程收官。两项保留 P0 优先级不动。

**规格**：
1. 上传区（参照 `pdf_watermark` 上传区与文案口径）：点击选择 + 拖拽上传多张图片（PNG/JPG/WebP，HEIC 暂不支持并明确提示）；Ctrl+V 直接粘贴截图（高频场景）；文件仅在本地浏览器处理、不上传服务器，页面文案明示；每张显示缩略图、文件名、文件大小，可删除单张；总大小过大（>100MB）给出提示。
2. 排序：缩略图可拖拽调序（PC）+ 上/下移动按钮（移动端），顺序即 PDF 页序。
3. 页面设置：页面尺寸 A4 / 图片原尺寸 二选一；A4 模式下图片等比缩放居中、页边距可调；压缩档（原图/中等/高压缩）；输出文件名可改（默认 `images_<时间戳>.pdf`）。
4. 导出：pdf-lib（CDN 懒加载，失败可读报错）合成单页/多页 PDF，逐张 embed，一张图一页；导出过程进度显示（`正在生成…n/m`）；下载文件名不带水印、无水印标识。
5. 注册：`tools/categories.go`「文档转换」（doc）分类内、`ocr_image_text` 之后新增工具 ID `images_to_pdf`，Name「图片批量转 PDF」，Description 注明纯前端不上传、不限次、无水印，Path `/tools/images-to-pdf`，Icon `picture_as_pdf`，New: true；通用路由 `/tools/:tool` 自动映射模板 `images_to_pdf`，无需新增 Go 路由；sitemap 自动生成。
6. SEO：title「图片批量转 PDF - 多图合并成一个 PDF（免费/不上传/无水印）」、description、keywords（图片转PDF、多图转PDF、照片转PDF、JPG转PDF、免费图片转PDF）；JSON-LD 与 canonical 沿用现有工具页写法（域名 www.johnkingzcq123.xyz）；页面内与 PDF 加水印、PDF 转图片/长图、图片压缩互链。
7. 移动端适配：上传区、缩略图网格、排序操作纵向布局不错乱；按钮点击区够大，文件名过长截断不撑破布局。
8. 底部使用说明区注明与 WPS 对比卖点：本地处理不上传、不限次免费、导出无「WPS Office」标识水印、不用开 WPS 会员。

**验收标准**：
- [ ] `/tools/images-to-pdf` 返回 200，首页「文档转换」分类可见入口（排在 OCR 图片文字识别旁）
- [ ] 多图上传（点击/拖拽/Ctrl+V）后缩略图/文件名/大小展示正确；单张可删；拖拽调序与上/下移动均生效，页序与导出一致
- [ ] 导出 PDF：A4 模式图片等比居中无变形；原尺寸模式每页尺寸随图；无水印；多图合成单文件页数正确
- [ ] 压缩档三档均有可见体积差异；>100MB 提示可读；pdf-lib CDN 懒加载失败有可读报错、页面不白屏
- [ ] 全程纯前端、无新增后端接口、无文件上传请求；`go build` 通过；SEO meta 完整；移动端布局不错乱

**预计改动文件**：`templates/images_to_pdf.html`（新建）、`static/js/images-to-pdf.js`（新建）、`tools/categories.go`（文档转换分类注册工具）、`BACKLOG.md`（本小节）。

## 今日候选（2026-10-12 · 产品调研推荐）

> **本周特别方向（2026-10-09 至 10-15）持续（第 4 天）**：继续攻 WPS 会员付费功能「免费纯前端替代」。今日信号更新：① WPS 会员墙争议持续发酵——网易教程点名 WPS 免费版输出 PDF 自带「WPS Office」标识水印、水印去除与批量转换需开会员（水印捆绑会员的又一例）；网易《WPS会员套路曝光》（黑猫投诉超万条：免费额度压缩、老会员权益无通知削减、自动续费隐蔽）仍在被引用——「刚需基础功能上锁收费」叙事未变，「不用开 WPS 会员」仍是可打传播卖点；② 图片转 PDF 需求侧再验证：网易/安全卫士 2026-08 汇总帖把「多图上传导出无水印 PDF」列为核心卖点场景（青蓝PDF小程序走红路径）；但主流免费方案各有坑：iLovePDF 仅限 JPG、迅捷限 2MB、Smallpdf 要翻译且下载慢——且全部要上传文件，「纯前端不上传、不限次、无水印」差异点清晰；③ PDF 打码需求新验证：小众软件论坛昨日（2026-10-11）上线 Cachety（法国开发者自荐，AGPL-3.0 开源）——浏览器里给证件加水印/涂掉身份证号、文件全程不上传，甚至断网可用；上线即引讨论，侧面验证「本地处理不上传」的打码诉求正热——我们 10-10 上线的 PDF 加水印恰与该 niche 同频，下一环「PDF 批注标记（涂抹打码）」顺延成顺理成章的第三环。
>
> **昨日交付核对**：OCR 图片文字识别 [WPS] 已上线（commit 480771b `前端开发(2026-10-11)：新增 OCR 图片文字识别工具（小样实测已过关）`；模板 `ocr_image_text`、JS `ocr-image-text.js`、`categories.go` 已注册 `/tools/ocr-image-text`），自候选划掉并归入已实现。PDF 处理簇已成「合并/拆分 + 转图 + 加水印」三件套，OCR 开辟「图片→文字」新旅程线。

**推荐 Top3**（均为 [WPS] 来源，优先高频、单页可实现、契合现有架构；努力度为单页前端交付量级评估）：

1. **图片批量转 PDF [WPS]** — 昨日备选、今日顺位（OCR 交付后空位）：WPS 图片转 PDF/多图合一属会员功能；照片作业、证件照、报销票据拍照、快递单截图合并成一个 PDF 提交是手机端极高频动作（青蓝PDF类小程序走红正靠此类轻转换）；今日汇总帖再验证「多图导出无水印 PDF」为核心卖点场景，而竞品免费版处处设限（iLovePDF 限 JPG、迅捷 2MB 上限、Smallpdf 下载慢）且一律要上传。实现：纯前端 canvas/pdf-lib（pdf-lib 1.17.1 在栈、CDN 懒加载路线三日连续验证）多图上传→拖拽排序→页面尺寸（A4/原图）与边距/压缩档→合成单 PDF 下载，无后端无上传，难度小、一天交付确定性最高。SEO：图片转PDF、多图转PDF、照片转PDF。
2. **PDF 批注标记（涂抹/高亮/文字标注）[WPS]** — 连续多日 P0，专题周「分享前处理」叙事第三环：站内图片打码、EXIF 清除已上线，PDF 侧打码仍空白；昨日 Cachety 上线走红（浏览器内涂掉身份证号、文件不上传）独立验证需求侧——「发合同/证件前遮住金额/身份证号/住址、圈出重点加标注」是办公大众刚需，WPS PDF 编辑同属会员功能。实现：pdf.js 渲染→canvas 覆盖层框选打码/画笔高亮/文本标注→pdf-lib 回写导出，单页可做（中难度，坐标映射与多页状态管理是主要工作量，单日需聚焦单页/少页 MVP）。SEO：PDF打码、PDF涂抹、PDF标注、合同打码。
3. **PDF 页面管理（旋转/删页/调序/提取单页）[WPS]** — 自 P1 提级：WPS 页面管理与拆分包收费；扫描件页序错乱、删空白页是学生与办公人群真实高频动作；与已上线的合并/拆分同属「整理 PDF」旅程（合并拆分的自然延伸），pdf-lib 在栈、CDN 懒加载与上传区交互同构，单日交付风险低。实现：上传 PDF→缩略图页列表→旋转 90°/删除/拖拽调序→导出新 PDF（保留页面尺寸与内容），中难度。SEO：PDF旋转、PDF删页、PDF页面调序、提取PDF页面。

**本周 WPS 候选表更新**（继承 2026-10-11 全表；昨日已交付 OCR 划掉归档，PDF 页面管理由 P1 提级为 P0）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 图片批量转 PDF（含多图合一）[WPS] | WPS 图片转 PDF 属会员；作业/证件照/票据拍照合并提交高频，竞品免费版限格式/限体积且一律上传 | 小 | P0（今日 Top1） |
| PDF 批注标记（涂抹/高亮/标注）[WPS] | WPS PDF 编辑属会员；发合同/证件前打码圈重点刚需，承接「分享前处理」叙事；Cachety 走红独立验证 | 中 | P0（今日 Top2） |
| PDF 页面管理（旋转/删页/调序/提取单页）[WPS] | WPS 页面管理与拆分包收费；扫描件页序错乱、删空白页高频；合并/拆分旅程自然延伸，技术路线同构 | 中 | P0（今日 Top3） |
| PDF 加密/解密 [WPS] | WPS 加密文档属会员；银行/政务加密 PDF 打开与加密码场景真实但低频 | 中 | P1 |
| PDF 转 Word/Excel/PPT [WPS] | 会员核心卖点、吐槽最集中（免费仅转前 5 页）；但纯前端只能提取文本流、版式还原差，易砸口碑 | 中 | P2（低优先，质量风险） |
| 思维导图 [WPS] | WPS 思维导图为增值功能；纯前端可做（树编辑+导出 PNG/SVG），课堂/会议记录中频 | 中 | P2 |
| 流程图绘制 [WPS] | WPS/WPS 绘图增值功能；纯前端画布可做，但交互复杂、单日难保质量 | 大 | P2 |
| 批量处理（批量转格式/改名/压缩）[WPS] | WPS 批量处理为会员卖点；纯前端可做批量改名清单生成等子集，价值视子功能而定 | 中 | P2 |
| 文档翻译 [WPS] | WPS 翻译属 AI/会员权益；需调用外部翻译 API 或大模型，非纯前端 | 中 | P3（需后端/AI，低优先） |
| 音频转文字（语音速记）[WPS] | 超级会员权益；浏览器 Web Speech 识别受限、离线模型体积大，非纯前端单页 | 大 | P3（低优先） |
| 简历/合同模板库 [WPS] | 稻壳/模板套餐收费；属内容库而非工具，与单页工具架构不符 | 中 | P3（形态不符，暂缓） |
| ~~OCR 图片文字识别 [WPS]~~（2026-10-11 已交付） | WPS 识别/转文字为会员功能 → 已实现 `/tools/ocr-image-text`（commit 480771b，小样实测三门槛过关），归档 | 中 | ✅ 归档 |
| ~~PDF 加水印 [WPS]~~（2026-10-10 已交付） | WPS PDF 加水印属会员编辑功能 → 已实现 `/tools/pdf-watermark`（commit f7d1903/a13db05/4e779f1），归档 | 小 | ✅ 归档 |

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

**归档说明**：PDF 合并/拆分（10-09）、PDF 转图片/长图（10-09）、PDF 加水印（10-10）、OCR 图片文字识别（10-11）均已上线，PDF 处理簇四件套成型（合并/拆分、转图、加水印）+「图片→文字」新旅程线；专题周后段建议沿「输出前处理（图片转PDF/批注）→ 页面管理」次序推进。

## 今日任务（2026-10-11 · 产品经理已决策 ✅）

**选定：OCR 图片文字识别 [WPS]** — 路由 `/tools/ocr-image-text`（模板 `ocr_image_text`），归「文档转换」分类，WPS 专题周第三枪、承接「PDF 处理簇」三件套后的第一条新旅程线（图片→文字）

**决策理由**：
1. 兑现立约、不再顺延：10-09 决策明文「OCR 列明日首选（10-10），小样实测后再定版」、10-10 决策再明文「OCR 列明日首选（10-11），今日第一步即小样实测，实测过关再排整页开发、不再顺延」，产品调研今日已把 Top1 定版为「OCR 文字识别小样实测先行」。两次明文承诺到期，今日再让位即失信于既定排期纪律。
2. 需求侧三次加码、供给侧未知数今天必须见分晓：10-09 的「付费墙后认知度最高刚需」、10-10 的青蓝PDF/Umi-OCR 信号、今日（10-11）的 V2EX 爆肝工具帖 + CSDN Umi-OCR 拆解 + WPS 会员墙微博热搜后金山声明——「免费、本地、不上传、不限次」诉求连续三日被独立信号验证。但语言包首载体验与中文识别率两个未知数两日未消。今天上午先做 10 分钟小样实测（语言包体积/首载耗时/中英混排识别率），过关即整页开发，不再无限期顺延；实测不过则明确结论、今日改做备选，不把半成品排上线。
3. 与专题周叙事同频：WPS 专题周已交付 PDF 三件套（合并/拆分、转图、加水印），OCR 是「发出去之前处理一下」的另一条输入线（拍照通知/证件/截图→可复制文字→进 PDF/发群），与站内图片打码、EXIF 清除的「分享前处理」叙事同属「本地处理不上传」心智，SEO 词簇（OCR文字识别、图片转文字、扫描件转文字）同域聚合。
4. 落选说明：图片批量转 PDF（小难度）今日降为【备选】——若 OCR 小样实测不过关，当日即改做它（技术路线与图片拼接/pdf-lib 同构、无新依赖，一天内高质量交付确定性最高），不存在交付落空。PDF 批注标记（中难度、交互最重）顺延至专题周后续，按原表 P0 保留。

**小样实测结论（2026-10-11 上午，前端开发实测 ✅ 已过关）**：
- 路线：tesseract.js v6（UMD，jsdelivr CDN）+ 语言包 `chi_sim`/`eng` 取自 `tesseract-ocr/tessdata_fast`（jsdelivr GH 镜像，CORS `*`，生产用 `gzip:false` 直传 `.traineddata`）。
- 语言包体积（实测下载）：chi_sim 2,469,156 字节（≈2.36MB）✅ ≤~4MB；eng 4,113,088 字节（≈3.92MB）✅；tesseract.min.js v6 62,961 字节。注：默认源 `tessdata.projectnaptha.com/4.0.0` 的 chi_sim.traineddata.gz 高达 20,159,757 字节（≈20MB），**不满足** ≤~4MB 门槛，故生产采用 fast 版。
- 首载耗时：2.47MB 语言包经代理实测 1.3s 下完；jsdelivr 国内有节点，宽带下中英双包合计约 6.6MB 预计 2–6 秒，远低于 15s 门槛 ✅。语言包默认 IndexedDB 缓存，二次打开免下载。
- 识别率（tesseract.js v6 node 实测，chi_sim+eng fast 数据，3 张自制测试图，difflib 去空白相似度 + 目测）：中英混排手机截图 94.5%（置信度 83.0）✅、加噪点/旋转/模糊的手机拍通知照片 93.3%（置信度 90.0）✅、证件类扫描件 92.8%（置信度 88.0）✅，均 ≥85% 门槛；目测关键信息（电话、工号、日期主体）基本可读。
- **结论：三项门槛全部通过 → 按计划整页开发 OCR，不触发备选。**备选「图片批量转 PDF」本次不启用。
0. 小样实测（关口，今日上午先行，不超过半天）：tesseract.js（v6 UMD CDN，jsdelivr/cdnjs 任选）+ 中文语言包 `chi_sim`；记录语言包 gzip 体积、国内可访问 CDN 下首载耗时；用 3 张测试图（中英混排截图、手机拍通知照片、证件类扫描件各 1）测整图识别，目测字准率。门槛：gzip 包 ≤ ~4MB、首载 < 15s（普通宽带/4G）、中英混排可用（字准率 ≥85% 目测）。**任一不过 → 今日任务立即切换为备选「图片批量转 PDF [WPS]」，并把实测数据与结论写回本小节。**
1. 上传区（参照 `pdf_watermark` 上传区与文案口径）：点击选择 + 拖拽上传单张图片（PNG/JPG/WebP），支持 Ctrl+V 直接粘贴截图（截图提取文字高频场景）；文件仅在本地浏览器处理、不上传服务器，页面文案明示；上传后展示文件名、文件大小、图片缩略图/原图预览；单个文件 >10MB 时提示「图片较大，识别可能较慢」，不硬性拦截。
2. 识别范围：默认「整图识别」；支持在原图上鼠标框选区域（canvas 覆盖层选框、移动端触摸框选）→「识别选中区域」；选框可拖拽调整。
3. 语言选择：默认「中英文混排」（chi_sim+eng），可切换「仅英文」（eng，小包首载更快）；语言包经 CDN 懒加载，加载全程显示进度条（`正在加载识别引擎…n%`），语言包缓存到浏览器（IndexedDB/ServiceWorker 缓存二选一，视 tesseract.js 默认机制，二次打开免重复下载）；CDN 不可用时明确报错「识别库加载失败，请检查网络后重试」、页面不白屏。
4. 识别执行：点击「开始识别」→ 显示识别进度（`正在识别…n%`）+ 可取消；单页单日交付不做批量多图排队。
5. 结果区：可编辑文本框（保留换行，允许用户校对改字）+ 一键复制 + 导出 .txt（文件名 `ocr_<时间戳>.txt`）；展示平均置信度（tesseract confidence 均值，四舍五入 %）供参考；空结果（无文字）时明确提示「未识别到文字，请换更清晰的图片或框选文字区域重试」。
6. 注册：`tools/categories.go`「文档转换」（doc）分类内、`pdf_watermark` 之后新增工具 ID `ocr_image_text`，Name「OCR 图片文字识别」，Description 注明本地识别不上传、不限次，Path `/tools/ocr-image-text`，Icon `text_fields`，New: true；通用路由 `/tools/:tool` 自动映射模板 `ocr_image_text`，无需新增 Go 路由；sitemap 自动生成。
7. SEO：title「OCR 图片文字识别 - 图片转文字/扫描件提取文字（本地识别不上传）」、description、keywords（OCR文字识别、图片转文字、扫描件转文字、截图提取文字、免费OCR）；JSON-LD 与 canonical 沿用现有工具页写法（域名 www.johnkingzcq123.xyz）；页面内与 PDF 转图片/长图、图片压缩互链（沿用站内既有相关工具区，如有，否则使用说明区加文字链接）。
8. 移动端适配：上传区、语言切换、框选、结果区纵向布局不错乱，框选触摸可用，按钮点击区够大，文件名过长截断显示不撑破布局。
9. 底部使用说明区注明与 WPS 对比卖点：本地识别不上传、不限次免费、不用开 WPS 会员。

**验收标准**：
- [x] 小样实测数据已记录并达门槛（语言包 gzip 体积、首载耗时、中英混排字准率 ≥85%）✅ 已过关整页开发；备选未触发
- [ ] `/tools/ocr-image-text` 返回 200，首页「文档转换」分类可见入口（排在 PDF 加水印旁）
- [ ] 上传图片后文件名/大小/预览展示正确；Ctrl+V 粘贴截图可直接识别
- [ ] 整图识别与框选识别均可用：中英混排截图识别结果可读、换行基本保留，平均置信度展示
- [ ] 结果可编辑、一键复制可用、导出 .txt 内容与文本框一致；无文字图片有明确提示不静默
- [ ] 语言包加载与识别全程进度可见、可取消；tesseract CDN 懒加载失败有可读报错、页面不白屏
- [ ] 全程纯前端、无新增后端接口、无文件上传请求；`go build` 通过；SEO meta 完整；移动端布局不错乱

**预计改动文件**：`templates/ocr_image_text.html`（新建）、`static/js/ocr-image-text.js`（新建）、`tools/categories.go`（文档转换分类注册工具）、`BACKLOG.md`（本小节）。

**备选（小样不过关时今日改做）**：图片批量转 PDF [WPS] — 纯前端 canvas/pdf-lib，多图上传→拖拽排序→页面尺寸（A4/原图）与边距/压缩档→合成单 PDF 下载；路由 `/tools/images-to-pdf`（模板 `images_to_pdf`），归文档转换分类，SEO 词：图片转PDF、多图转PDF、照片转PDF；一天交付确定性最高。

## 今日候选（2026-10-11 · 产品调研推荐）

> **本周特别方向（2026-10-09 至 10-15）持续（第 3 天）**：继续攻 WPS 会员付费功能「免费纯前端替代」。今日信号更新：① WPS 会员墙争议持续发酵——2026-07「滥收费、背刺用户」话题登微博热搜（黑猫投诉超万条：套娃式收费、续费易退款难），金山办公 7-6 发声明回应「免费功能不收费、会员权益不上移」，侧面坐实用户对「不用开 WPS 会员」替代工具的真实需求（来源：东方财富/经济参考报、观察者网 2026-07）；② OCR 需求再验证：V2EX 2025-09 有用户「爆肝 1 天」发布免费 OCR 工具帖（评论区追问办公场景网页识别）；CSDN 2026-09 拆解 Umi-OCR（免费开源离线 OCR，截图/批量/PDF 识别、PaddleOCR+RapidOCR 双引擎、MIT 协议）仍是热门——「免费、本地、不上传」是 OCR 用户一致诉求，与 ToolWeb 纯前端路线同频；③ 图片转 PDF 需求侧持续：2026-08 网易/安全卫士汇总帖把「多图上传导出无水印 PDF」列为核心卖点场景（小程序青蓝PDF走红路径），WPS 自己也在 2025-07 推过免登录 JPG→PDF 网页工具——差异点不在「能不能转」，而在「不上传、不限次、无水印、无会员墙」。
>
> **昨日交付核对**：PDF 加水印 [WPS] 已上线（commit f7d1903 `前端开发(2026-10-10)：新增 PDF 加水印工具`；后续修复 a13db05 预览显示问题、4e779f1 静态资源版本参数，真实浏览器 QA 已过），模板 `pdf_watermark`、JS `pdf-watermark.js`、`categories.go` 已注册 `/tools/pdf-watermark`——自 2026-10-10 候选划掉并归入已实现。PDF 处理簇现已成「合并/拆分 + 转图 + 加水印」三件套。

**推荐 Top3**（均为 [WPS] 来源，承接昨日产品经理明文排期：OCR 昨日列「明日首选」且今日信号再加码；努力度为单页前端交付量级评估）：

1. **OCR 图片文字识别 [WPS]** — 承昨日既定：今日第一步即 **tesseract.js 小样实测**（中文语言包体积/首载耗时/中英混排识别率，10 分钟小样先行），实测过关再排整页开发、不再顺延。痛点：WPS 的 OCR/图片转文字挂在会员与图片套餐后面，是付费墙后认知度最高的刚需（拍通知/证件/截图转可复制文字、扫描件 PDF 摘字，学生与办公周级高频）；V2EX/Umi-OCR 信号证明用户要的正是「不用会员、不用上传、不限次」。实现路线：tesseract.js 纯前端（WASM+中文语言包 CDN 懒加载、加载进度提示）→上传/拖拽图片→整图或框选识别→可编辑文本框+一键复制+导出 .txt（难度中，小样实测后定版）。SEO：OCR文字识别、图片转文字、扫描件转文字、截图提取文字。
2. **图片批量转 PDF [WPS]** — 昨日备选、今日顺位：WPS 图片转 PDF/多图合一属会员功能；照片作业、证件照、报销票据拍照、快递单截图合并成一个 PDF 提交是手机端极高频动作（青蓝PDF类小程序走红正靠此类轻转换）。实现：纯前端 canvas/pdf-lib 多图上传→拖拽排序→页面尺寸（A4/原图/自定义）与边距/压缩档设置→合成单 PDF 下载，无后端无上传，难度小，与站内图片处理簇（拼接/压缩）及 PDF 簇双互链。SEO：图片转PDF、多图转PDF、照片转PDF。
3. **PDF 批注标记（涂抹/高亮/文字标注）[WPS]** — WPS PDF 编辑同属会员功能；发合同/证件前打码圈重点（遮住金额/身份证号/住址）与站内「分享前处理」叙事（图片打码、EXIF 清除）构成第三环。实现：pdf.js 渲染→canvas 覆盖层框选打码/画笔高亮/文本标注→pdf-lib 回写导出，单页可做（中难度，坐标映射与多页状态管理是主要工作量）。SEO：PDF打码、PDF涂抹、PDF标注、合同打码。

**本周 WPS 候选表更新**（继承 2026-10-10 全表；昨日交付项已归档划掉）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| OCR 图片文字识别 [WPS] | WPS 识别/转文字为会员功能；V2EX/Umi-OCR 信号再验证「免费本地不限次」诉求；拍照扫描件摘字周级刚需（承昨日首选，今日先小样实测） | 中 | P0（今日 Top1） |
| 图片批量转 PDF（含多图合一）[WPS] | WPS 图片转 PDF 属会员；作业/证件照/票据拍照合并提交高频，手机端轻转换场景 | 小 | P0（今日 Top2） |
| PDF 批注标记（涂抹/高亮/标注）[WPS] | WPS PDF 编辑属会员；发合同/证件前打码圈重点刚需，承接「分享前处理」叙事 | 中 | P0（今日 Top3） |
| PDF 页面管理（旋转/删页/调序/提取单页）[WPS] | WPS 页面管理与拆分包收费；扫描件页序错乱、删空白页高频 | 中 | P1 |
| PDF 加密/解密 [WPS] | WPS 加密文档属会员；银行/政务加密 PDF 打开与加密码场景真实但低频 | 中 | P1 |
| PDF 转 Word/Excel/PPT [WPS] | 会员核心卖点、吐槽最集中（免费仅转前 5 页）；但纯前端只能提取文本流、版式还原差，易砸口碑 | 中 | P2（低优先，质量风险） |
| 思维导图 [WPS] | WPS 思维导图为增值功能；纯前端可做（树编辑+导出 PNG/SVG），课堂/会议记录中频 | 中 | P2 |
| 流程图绘制 [WPS] | WPS/WPS 绘图增值功能；纯前端画布可做，但交互复杂、单日难保质量 | 大 | P2 |
| 批量处理（批量转格式/改名/压缩）[WPS] | WPS 批量处理为会员卖点；纯前端可做批量改名清单生成等子集，价值视子功能而定 | 中 | P2 |
| 文档翻译 [WPS] | WPS 翻译属 AI/会员权益；需调用外部翻译 API 或大模型，非纯前端 | 中 | P3（需后端/AI，低优先） |
| 音频转文字（语音速记）[WPS] | 超级会员权益；浏览器 Web Speech 识别受限、离线模型体积大，非纯前端单页 | 大 | P3（低优先） |
| 简历/合同模板库 [WPS] | 稻壳/模板套餐收费；属内容库而非工具，与单页工具架构不符 | 中 | P3（形态不符，暂缓） |
| ~~PDF 加水印 [WPS]~~（2026-10-10 已交付） | WPS PDF 加水印属会员编辑功能 → 已实现 `/tools/pdf-watermark`（commit f7d1903/a13db05/4e779f1），归档 | 小 | ✅ 归档 |

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

**归档说明**：PDF 合并/拆分（10-09）、PDF 转图片/长图（10-09）、PDF 加水印（10-10）均已上线，PDF 处理簇三件套成型；WPS 专题周剩余两日建议沿「转换/识别 → 输出前处理 → 页面管理」次序推进。

## 今日候选（2026-10-10 · 产品调研推荐）

> **本周特别方向（2026-10-09 至 10-15）持续**：集中攻 WPS 会员付费功能，评估「免费纯前端替代」可行性。今日信号更新：① 青蓝PDF等免费转换小程序持续被 2026 教程反复推荐「免费用软件、无套路神器」，且其 OCR/图片转 Word 能力被点名为差异卖点——验证「OCR + 文档转换免会员」是用户搜索与口碑的主战场；② Umi-OCR（免费离线 OCR，截图/批量图片/PDF 识别、本地不外传）为开源热门，侧面印证「本地识别、不上传」正是 OCR 用户的核心诉求，与 ToolWeb 纯前端路线同频；③ 2026-07 WPS「滥收费、背刺用户」话题登微博热搜后，金山办公发声明称「免费基础功能绝不收费、会员权益绝不上移、高成本服务独立计费」——侧面确认会员墙争议长期存在，「不用开 WPS 会员」仍是可打的传播卖点（来源：网易/观察者网、东方财富 2026-07-06 报道）。
>
> **昨日交付核对**：PDF 转图片/长图已上线（commit 042385f，`/tools/pdf-to-image`），自 2026-10-09 候选划掉并归入已实现；WPS 专题周 PDF 处理簇已成「合并/拆分 + 转图」双件，今日 Top3 顺延专题周既定次序（OCR 昨日列明日首选）。

**推荐 Top3**（均为 [WPS] 来源，优先高频、单页可实现、契合现有架构；努力度为单页前端交付量级评估）：

1. **OCR 图片文字识别 [WPS]** — 昨日产品经理明文列为「明日首选」，今日信号再加码：2026 免费转换教程把 OCR/图片转 Word 当作核心差异点反复推荐（青蓝PDF类工具靠它吸量），Umi-OCR 以「免费离线、图片不外传」成开源热门，证明用户要的正是「不用会员、不用上传、不限次」的识别。痛点：WPS 识别为会员功能，证件/通知/扫描件/截图摘字是学生与办公周级刚需。实现：tesseract.js 纯前端（WASM+中文语言包 CDN 懒加载），上传/拖拽图片→整图或框选识别→可编辑文本框+一键复制+导出 .txt；难度中，主要成本在语言包首载体验（需压缩语言包、显示加载进度、识别率小样先行），建议先做 10 分钟小样实测再定版。SEO：OCR文字识别、图片转文字、扫描件转文字、截图提取文字。
2. **PDF 加水印 [WPS]** — WPS PDF 加水印属会员编辑功能；「仅供 XX 使用」水印贴证件复印件、合同防扩散、资料版权声明是大众多场景刚需，现有站内仅有图片水印、PDF 侧空白。实现：pdf-lib 在栈（`pdf-merge-split`、`pdf-to-image` 已验证同栈路线），上传 PDF→水印文字/字号/透明度/旋转/平铺密度设置→实时预览→全页或指定页回写导出，单页可做（小难度，四件中最低风险，可与 OCR 并行排期）。SEO：PDF加水印、PDF水印、证件复印件水印。
3. **图片批量转 PDF [WPS]** — WPS 图片转 PDF/多图合一属会员功能；照片作业、证件照、报销票据拍照、快递单截图合并成一个 PDF 提交是高频动作，尤其手机端（微信小程序青蓝PDF的走红正靠此类轻转换）。实现：纯前端 canvas/pdf-lib 多图上传→拖拽排序→页面尺寸 A4/原图/自定义与边距设置→合成为单 PDF 下载，无后端无上传，难度小；与站内图片处理簇（拼接/压缩/EXIF）及 PDF 簇双互链。SEO：图片转PDF、多图转PDF、照片转PDF。

**本周 WPS 候选表更新**（继承 2026-10-09 全表；昨日已交付项已划掉归档，新增今日提级说明）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| OCR 图片文字识别 [WPS] | WPS 识别/转文字为会员功能；拍照、扫描件摘字是学生办公周级刚需，在线竞品限次且需上传（昨日列明日首选，今日新教程与 Umi-OCR 信号再验证） | 中 | P0（今日 Top1） |
| PDF 加水印 [WPS] | WPS PDF 加水印（防扩散/版权声明）属会员编辑功能；证件复印件加「仅供XX使用」水印大众高频 | 小 | P0（今日 Top2） |
| 图片批量转 PDF（含多图合一）[WPS] | WPS 图片转 PDF/多图合并 PDF 属会员；作业、证件照、报销票据拍照转 PDF 提交高频 | 小 | P0（今日 Top3） |
| PDF 批注标记（涂抹/高亮/标注）[WPS] | WPS PDF 编辑属会员；发合同/证件前打码圈重点是刚需，承接站内「分享前处理」叙事 | 中 | P1（昨日 Top3 顺延，专题周内排期） |
| PDF 页面管理（旋转/删页/调序/提取单页）[WPS] | WPS 页面管理与拆分包收费；扫描件页序错乱、删空白页高频 | 中 | P1 |
| PDF 加密/解密 [WPS] | WPS 加密文档属会员；银行/政务加密 PDF 打开与加密码场景真实但低频 | 中 | P1 |
| PDF 转 Word/Excel/PPT [WPS] | 会员核心卖点、吐槽最集中（免费仅转前 5 页）；但纯前端只能提取文本流、版式还原差，易砸口碑 | 中 | P2（低优先，质量风险） |
| 思维导图 [WPS] | WPS 思维导图为增值功能；纯前端可做（树编辑+导出 PNG/SVG），课堂/会议记录中频 | 中 | P2 |
| 流程图绘制 [WPS] | WPS/WPS 绘图增值功能；纯前端画布可做，但交互复杂、单日难保质量 | 大 | P2 |
| 批量处理（批量转格式/改名/压缩）[WPS] | WPS 批量处理为会员卖点；纯前端可做批量改名清单生成等子集，价值视子功能而定 | 中 | P2 |
| 文档翻译 [WPS] | WPS 翻译属 AI/会员权益；需调用外部翻译 API 或大模型，非纯前端 | 中 | P3（需后端/AI，低优先） |
| 音频转文字（语音速记）[WPS] | 超级会员权益；浏览器 Web Speech 识别受限、离线模型体积大，非纯前端单页 | 大 | P3（低优先） |
| 简历/合同模板库 [WPS] | 稻壳/模板套餐收费；属内容库而非工具，与单页工具架构不符 | 中 | P3（形态不符，暂缓） |

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

**归档说明**：昨日 Top1「PDF 转长图/逐页图片 [WPS]」已由前端交付（commit 042385f），本表不再列示；10-09 候选原文见下方当日小节。

## 今日任务（2026-10-10 · 产品经理已决策 ✅）

**选定：PDF 加水印 [WPS]** — 路由 `/tools/pdf-watermark`（模板 `pdf_watermark`），归「文档转换」分类，ToolWeb「PDF 处理」簇第三件

**决策理由**：
1. WPS 专题周第二枪继续打「单日质量风险已排除、复用现有栈」的一格：PDF 加水印三候选中难度最小（小）、且核心库 pdf-lib 1.17.1 已在栈（`pdf-merge-split`、`pdf-to-image` 两日连续验证同一 CDN 懒加载 + 失败降级路线），今日零新依赖引入、零选型未知数，是三者中唯一能把全部工时花在交互打磨而非技术验证上的选项。昨日转图上线后 PDF 簇已成「合并/拆分 + 转图」，今日补「加水印」即成三件套——同一批用户同一次打开 PDF 的连续动作（整理→转图→防扩散），站内互链与 SEO 词簇（PDF加水印、PDF水印、证件复印件水印）继续同域聚合。
2. 场景刚需且站内空白：WPS PDF 加水印属会员编辑功能，「仅供 XX 使用」贴证件复印件、合同防扩散、资料版权声明是大众多场景动作；站内现有仅图片水印（图片处理簇）、PDF 侧无任何标记能力，补的是能力缺口而非与现有工具重复。
3. OCR 仍不排一天交付——承重未知数未消：昨日决策已明文 OCR「先做语言包体积/加载耗时/中英混排识别率小样实测再定版」，今日调研信号（青蓝PDF、Umi-OCR）只再验证需求侧、不解决供给侧未知数；在小样实测完成前把 OCR 排成一天交付，就是把语言包首载体验与中文识别率两个未知数直接转嫁给用户，违背专题周首日立下的纪律。OCR 继续列明日首选，且明日任务的第一步即小样实测（实测过关再排整页开发，不再无限期顺延）。
4. 落选说明：图片批量转 PDF 同为小难度、需求真实（作业/证件照/票据拍照合并提交），但属「图片→PDF」跨簇新旅程，与今日 PDF 簇收官的聚合收益相比略逊，且其实现（多图排序 + 页面尺寸/边距）与图片拼接已有交互高度同构、不急于同周连做；列明日备选，与 OCR 小样实测结论一并再议。

**规格**：
1. 单 PDF 上传单页（参照 `pdf_merge_split` / `pdf_to_image` 的上传区与文案口径）：点击选择 + 拖拽上传单个 PDF，文件仅在本地浏览器处理、不上传服务器，页面文案明示；上传后展示文件名、文件大小、总页数；加密/损坏 PDF 加载失败时给出明确可读中文报错、页面不白屏；单个文件 >50MB 时提示「文件较大，处理可能较慢」，不硬性拦截。底部使用说明区注明与 WPS 对比卖点：本地处理不上传、不限页数不限次、不用开 WPS 会员。
2. 水印设置（设置变更实时刷新预览）：水印文字输入（默认「仅供参考」，支持中文，空文字时导出按钮禁用并提示）；字号滑杆（如 12~72，默认 36）；透明度滑杆（10%~90%，默认 30%）；旋转角度滑杆（-60°~60°，默认 -30°）；颜色选择（颜色输入 + 预设灰/红/蓝/黑）；排布二选一：「居中单个」/「全页平铺」（平铺时可调平铺密度：横向列数或间距滑杆）；作用页面：默认「全部页面」，可切换「自定义范围」输入如 `1-3,5,8-10`（1 起始、含端点，与合并/拆分、转图同一解析语义），非法格式/越界/空范围给出明确中文错误提示且不执行导出。
3. 实时预览：pdf.js（pdfjs-dist 3.11.174，cdnjs UMD + worker，与 `pdf-to-image` 同版本同懒加载方式）渲染作用范围内的第一页到 canvas，上层叠加按当前设置绘制的水印效果（canvas 2D 按相同字号/透明度/旋转/排布参数绘制，与导出共用同一套参数语义、所见即所得）；预览区提供上一页/下一页翻页查看任意页效果（至少支持预览作用范围内页面的翻页）；PDF 页数与当前预览页码展示。
4. 核心实现（`static/js/pdf-watermark.js`）：水印一律先经离屏 canvas 绘制为透明底 PNG（按页面显示尺寸与旋转/平铺参数排版，本地系统字体渲染——以此绕开 pdf-lib 标准字体不支持中文字符集的问题，中文水印不乱码、不缺字），再由 pdf-lib（1.17.1，cdnjs，与 `pdf-merge-split.js` 同款 CDN 懒加载 + 失败提示，CDN 不可用时明确报错「库加载失败，请检查网络后重试」、页面不白屏）逐页 `embedPng` 后按页面实际尺寸 `drawImage` 覆盖全页（平铺模式将整页平铺图作为一整张 stamp 覆盖，居中模式居中绘制单个 stamp 并旋转）；仅作用于所选页范围，未选页面原样保留；导出全程显示进度（`正在处理第 n / N 页` + 进度条），导出文件名 `watermarked_<原名>.pdf`；大文件逐页处理、处理完一页即释放该页中间引用，不一次性持有全部 stamp 位图。
5. 注册：`tools/categories.go`「文档转换」（doc）分类内、`pdf_to_image` 之后新增工具 ID `pdf_watermark`，Name「PDF 加水印」，Description 注明文字水印防扩散、本地处理不上传，Path `/tools/pdf-watermark`，Icon `branding_watermark`，New: true；通用路由 `/tools/:tool` 自动映射模板 `pdf_watermark`，无需新增 Go 路由；sitemap 自动生成。
6. SEO：title「PDF 加水印 - PDF 添加文字水印工具（本地处理不上传）」、description、keywords（PDF加水印、PDF水印、PDF添加水印、证件复印件水印、PDF防扩散水印）；JSON-LD 与 canonical 沿用现有工具页写法（域名 www.johnkingzcq123.xyz）；页面内与 PDF 合并/拆分、PDF 转图片/长图互链（沿用站内既有相关工具区，如有，否则使用说明区加文字链接）。
7. 移动端适配：上传区、设置项（滑杆/颜色/排布切换）、预览区、导出按钮纵向布局不错乱，滑杆与按钮点击区够大，预览 canvas 自适应宽度，文件名过长截断显示不撑破布局。

**验收标准**：
- [ ] `/tools/pdf-watermark` 返回 200，首页「文档转换」分类可见入口（排在 PDF 转图片/长图旁）
- [ ] 上传 PDF 后文件名/大小/总页数展示正确；预览区显示页面且水印效果与设置实时同步（改文字/字号/透明度/角度/颜色/排布任一项即时可见），可翻页预览其他页
- [ ] 导出 PDF 可正常打开：作用范围内每页均有水印（居中模式单个居中、平铺模式满页平铺，中文文字不乱码、不缺字，透明度与角度与设置一致），未选页面无水印、原内容无损
- [ ] 范围选择：`1-3,5` 类范围只给对应页加水印；非法格式/越界页码/空范围有明确提示且不执行；水印文字为空时不能导出且有提示
- [ ] 异常不崩：加密/损坏 PDF 有可读报错；pdf-lib/pdf.js CDN 懒加载失败有可读报错、页面不白屏；导出中途进度可见（第 n/N 页）
- [ ] 全程纯前端、无新增后端接口、无文件上传请求；`go build` 通过；SEO meta 完整；移动端布局不错乱

**预计改动文件**：`templates/pdf_watermark.html`（新建）、`static/js/pdf-watermark.js`（新建）、`tools/categories.go`（文档转换分类注册工具）、`BACKLOG.md`（本小节）。

**明日备选（顺延）**：OCR 图片文字识别 [WPS]（首选，第一步先做 tesseract.js 语言包体积/加载耗时/中英混排识别率小样实测，实测过关再排整页开发）、图片批量转 PDF [WPS]（小难度，可随时插队）、PDF 批注标记 [WPS]（专题周后续，交互最重待排）。

## 今日候选（2026-10-09 · 产品调研推荐）

> **本周特别方向（2026-10-09 至 10-15）**：集中攻 WPS 会员付费功能，评估「免费纯前端替代」可行性。信号基线：WPS 会员体系已分层为超级会员（148 元/年）、超级会员 Pro、大会员（348 元/年）并拆出 PDF/云盘/图片/模板等独立小包（来源：网易《WPS，鸡同鸭讲》、财信证券金山办公深度报告）；用户痛点集中在「基础刚需功能被上锁收费」——网易《WPS 会员套路曝光》与 360doc《别再乱买 WPS 会员了》均点名 PDF 转格式、模板等本属刚需的功能被会员化，老会员权益还被无通知削减。ToolWeb 的切入点：把 WPS 收费墙后的功能做成免费、纯前端、不上传的单页工具，「不用开 WPS 会员」即天然 SEO 与传播卖点。

**推荐 Top3**（均为 [WPS] 来源，优先高频、单页可实现、契合现有架构）：

1. **OCR 图片文字识别 [WPS]** — WPS 的 OCR/图片转文字挂在会员与图片套餐后面，是「付费墙后功能」里大众认知度最高的刚需：拍到的通知/证件/截图转成可复制文字、扫描件 PDF 摘字，学生与办公人群周级高频；竞品侧 UPDF 等在线工具普遍每天仅免费 2 次且要上传文件，正好衬托「本地不限次、不上传」的差异点。实现：纯前端 tesseract.js（WASM，CDN 懒加载、首次加载语言包有进度提示）→框选/整图识别→可编辑文本框 + 一键复制 + 导出 .txt，单页可做（中难度，主要成本在语言包体积与加载体验）。SEO：OCR文字识别、图片转文字、扫描件转文字、截图提取文字。
2. **PDF 转长图/逐页图片 [WPS]** — WPS「PDF 转图片」是会员转换矩阵的一格，用户真实场景极高频：合同/课件 PDF 转图发微信群、做小红书/公众号配图、PPT 素材截取，而现有同类在线工具要么限次要么要登录；我们昨日刚上线 PDF 合并/拆分（pdf-lib 在栈），顺势补「出图」一格即成 PDF 处理簇「合并/拆分/转图」三件套，站内互链天然。实现：pdf.js 纯前端渲染逐页→PNG/JPG（清晰度可选）→逐张下载或打包 ZIP，单页可做（中难度，需处理大文件分页渲染的内存与进度）。SEO：PDF转图片、PDF转长图、PDF转JPG、PDF页面转图片。
3. **PDF 批注标记（涂抹打码 + 高亮 + 文字标注）[WPS]** — WPS PDF 编辑同属会员功能，而用户最高频的其实不是改原文，而是「发出去之前处理一下」：遮住合同金额/身份证号/住址、圈出重点、加一句标注——与站内已上线的图片打码（遮内容）、EXIF 清除（清元数据）构成「分享前处理」叙事第三环，且天然导流互链。实现：pdf.js 渲染页面→canvas 覆盖层框选打码/画笔高亮/文本标注→pdf-lib 回写导出新 PDF，单页可做（中难度，坐标映射与多页状态管理是主要工作量）。SEO：PDF打码、PDF涂抹、PDF标注、合同打码。

**本周 WPS 候选全表**（格式：标题 | 痛点 | 难度 | 优先级；[WPS] 标来源）：

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| OCR 图片文字识别 [WPS] | WPS 识别/转文字为会员功能；拍照、扫描件摘字是学生办公周级刚需，在线竞品限次且需上传 | 中 | P0（今日 Top1） |
| PDF 转长图/逐页图片 [WPS] | WPS PDF 转图收费；合同课件转发微信、做配图素材高频，在线工具多限次 | 中 | P0（今日 Top2） |
| PDF 批注标记（涂抹/高亮/标注）[WPS] | WPS PDF 编辑属会员；发合同/证件前打码圈重点是刚需，承接站内「分享前处理」叙事 | 中 | P0（今日 Top3） |
| PDF 加水印 [WPS] | WPS PDF 加水印（防扩散/版权声明）属会员编辑功能；证件复印件加「仅供XX使用」水印大众高频 | 小 | P1 |
| PDF 页面管理（旋转/删页/调序/提取单页）[WPS] | WPS 页面管理与拆分包收费；扫描件页序错乱、删空白页高频 | 中 | P1 |
| PDF 加密/解密 [WPS] | WPS 加密文档属会员；银行/政务加密 PDF 打开与加密码场景真实但低频 | 中 | P1 |
| 图片批量转 PDF（含多图合一）[WPS] | WPS 图片转 PDF/多图合并 PDF 属会员；作业、证件照、报销票据拍照转 PDF 提交高频 | 小 | P1 |
| PDF 转 Word/Excel/PPT [WPS] | 会员核心卖点、吐槽最集中（免费仅转前 5 页）；但纯前端只能提取文本流、版式还原差，易砸口碑 | 中 | P2（低优先，质量风险） |
| 思维导图 [WPS] | WPS 思维导图为增值功能；纯前端可做（树编辑+导出 PNG/SVG），课堂/会议记录中频 | 中 | P2 |
| 流程图绘制 [WPS] | WPS/WPS 绘图增值功能；纯前端画布可做，但交互复杂、单日难保质量 | 大 | P2 |
| 文档翻译 [WPS] | WPS 翻译属 AI/会员权益；需调用外部翻译 API 或大模型，非纯前端 | 中 | P3（需后端/AI，低优先） |
| 音频转文字（语音速记）[WPS] | 超级会员权益；浏览器 Web Speech 识别受限、离线模型体积大，非纯前端单页 | 大 | P3（低优先） |
| 简历/合同模板库 [WPS] | 稻壳/模板套餐收费；属内容库而非工具，与单页工具架构不符 | 中 | P3（形态不符，暂缓） |
| 批量处理（批量转格式/改名/压缩）[WPS] | WPS 批量处理为会员卖点；纯前端可做批量改名清单生成等子集，价值视子功能而定 | 中 | P2 |

**顺延通用候选**（WPS 特别方向期间降权保留）：HEIC / Live Photo 转 JPG（P1，待评估 heic WASM 解码库体积与兼容性）、文本敏感信息打码（P1）、Markdown 表格修复（P1）、图片裁剪（P1）、cURL 转代码（P1）。

**昨日交付核对**：PDF 合并/拆分已上线（commit b721ae8，`/tools/pdf-merge-split`），自候选划掉并归入已实现。

## 今日任务（2026-10-09 · 产品经理已决策 ✅）

**选定：PDF 转长图/逐页图片 [WPS]** — 路由 `/tools/pdf-to-image`（模板 `pdf_to_image`），归「文档转换」分类，ToolWeb「PDF 处理」簇第二件

**决策理由**：
1. WPS 专题周首枪打最稳的一格，三候选里唯一「单日质量风险已排除、且能复用现有栈」：昨日 PDF 合并/拆分（pdf-lib，已在栈）上线后，文档转换分类已经跑通了「上传 PDF → 本地处理 → 下载」这条同样的用户旅程与文案口径，今日工具只需要在其上加一个 pdf.js 渲染环，交互面是三个候选中最小的（上传→选导出方式→下载，无编辑器、无多页交互状态）。相比之下 OCR 需引入 tesseract.js（语言包首载体积与中英识别率均为未知数，须先做选型实测才谈得上一天交付）、PDF 批注需处理 canvas 覆盖层坐标映射与多页标注状态，是三者里交互与状态管理最重、最容易一页做不完的一项。专题周第一日先立住「WPS 收费墙功能免费纯前端版」的最短可信路径，是对用户侧最负责的排法。
2. 与 PDF 合并/拆分天然组成「PDF 处理簇」，是对昨日投入的直接加乘：转图是 WPS 会员转换矩阵被吐槽最集中的一格（免费版页数/次数受限），真实场景极高频（合同、课件 PDF 转图发微信群、做公众号/小红书配图、PPT 素材截取），与合并/拆分覆盖的「整理文件」是同一批人、同一次打开 PDF 的连续动作；上线后文档转换分类从「DOC 转 PDF + 合并拆分」变为三件套，站内工具页间互链互通，SEO 词簇（PDF转图片、PDF转长图、PDF转JPG、PDF页面转图片）同域集中收录，胜过今日单开一条与现有工具毫无关系的 OCR 线。
3. 卖点文案已被验证、差异化清晰：竞品在线转图普遍要上传、限次或要登录，「纯前端渲染、文件不离开浏览器、不限页数不限次、不用开 WPS 会员」四句与昨日合并/拆分已打出去的「本地处理不上传」口径完全一致，用户心智零学习成本；逐页图打包 ZIP 的导出方式复用 exif-strip / pdf-merge-split 已验证的 JSZip CDN 懒加载 + 失败降级逐张下载策略，不发明新基建。
4. 落选说明：OCR 图片文字识别认知度不亚于转图，但 tesseract.js 的中文语言包首载体验和识别率是承重未知数——按 HEIC 解码库体积要先评估的同例纪律，先不排一天交付，列明日首选并要求先做「语言包体积/加载耗时/中英混排识别率」小样实测后再定版；PDF 批注标记交互面最重（渲染 + 覆盖层坐标 + 多页状态 + pdf-lib 回写四段串联），与长图工具同日二选一明显拼不过，列 WPS 专题周后续排期，待转图上线后若用户反馈出现打码需求再前置。

**规格**：
1. 单 PDF 上传单页（参照昨日 `pdf_merge_split` 的上传区与文案口径）：点击选择 + 拖拽上传单个 PDF，文件仅在本地浏览器处理、不上传服务器，页面文案明示；上传后展示文件名、文件大小、总页数；加密/损坏 PDF 加载失败时给出明确可读中文报错、页面不白屏；单个文件 >50MB 时提示「文件较大，渲染可能较慢」，不硬性拦截。底部使用说明区注明与 WPS 对比卖点：本地处理不上传、不限页数不限次、不用开 WPS 会员。
2. 导出方式二选一（两个大按钮单选切换、默认「逐页图片」）：「逐页图片」——每页渲染为一张 PNG 或 JPG 下载，多页时打包单个 ZIP，文件名 `pdfimg_<原名>_p<页码>.png/jpg`，ZIP 内按页码顺序命名；「拼成长图」——所选页面纵向无缝（页间可选 0/8px 白色间距，默认 0）拼成一张长图 PNG 或 JPG 下载，文件名 `pdflong_<原名>.png/jpg`。
3. 页码范围：默认「全部页面」，可切换「自定义范围」输入如 `1-3,5,8-10`（1 起始、含端点，与昨日拆分模式同一解析语义）；非法格式、越界页码、空范围给出明确中文错误提示且不执行导出；导出的页序严格按范围解析结果（长图按页码升序自上而下拼接）。
4. 清晰度三档单选（默认「高清 2x」）：「标准 1x」「高清 2x」「超清 3x」，以渲染倍率实现，界面旁注约合 72/144/216 DPI；格式单选 PNG / JPG 默认 PNG，JPG 背景填充白色（PDF 透明底不发黑）。
5. 核心实现（`static/js/pdf-to-image.js`）：pdf.js（pdfjs-dist 3.11.174，cdnjs UMD 构建 + worker 同源 CDN）经 CDN 懒加载（与 `pdf-merge-split.js` 既有 pdf-lib/JSZip 同款按需加载 + 失败提示，CDN 不可用时明确报错「库加载失败，请检查网络后重试」、页面不白屏）；`getDocument` 读取页数后逐页**顺序**渲染到 canvas（不并发，防止大文件内存爆掉），导出全程显示进度（`正在渲染第 n / N 页` + 进度条），每页转 Blob 入 ZIP 后立即释放该页 canvas 引用；ZIP 打包复用 JSZip CDN，失败时降级为逐页顺序下载并 toast 提示；长图模式先算总高，超过安全上限（总像素高 16000px 或预估 canvas 内存过大）时明确报错引导改用「逐页图片」，不静默截断、不产出坏图。
6. 注册：`tools/categories.go`「文档转换」（doc）分类内、`pdf_merge_split` 之后新增工具 ID `pdf_to_image`，Name「PDF 转图片/长图」，Description 注明逐页导出与长图拼接、本地处理不上传，Path `/tools/pdf-to-image`，Icon `image`，New: true；通用路由 `/tools/:tool` 自动映射模板 `pdf_to_image`，无需新增 Go 路由；sitemap 自动生成。
7. SEO：title「PDF 转图片/长图 - PDF 逐页导出 PNG/JPG 与长图拼接工具（本地处理不上传）」、description、keywords（PDF转图片、PDF转长图、PDF转JPG、PDF页面转图片、PDF转图在线免费）；JSON-LD 与 canonical 沿用现有工具页写法（域名 www.johnkingzcq123.xyz）；页面内与 PDF 合并/拆分页互链（沿用站内既有相关工具区，如有，否则使用说明区加一句文字链接）。
8. 移动端适配：上传区、范围输入、清晰度/格式选项、导出按钮纵向布局不错乱，按钮点击区够大，进度提示可见，文件名过长截断显示不撑破布局；长图在手机端导出走同一像素上限校验，不因设备差异静默失败。

**验收标准**：
- [ ] `/tools/pdf-to-image` 返回 200，首页「文档转换」分类可见入口（排在 PDF 合并/拆分旁），默认停在「逐页图片」模式
- [ ] 逐页导出：N 页 PDF 在任一清晰度下导出恰好 N 张 PNG（切 JPG 后导出 JPG 且白底正常），ZIP 内文件名含原名与页码、按页序排列，解压后逐张可正常打开；ZIP/CDN 失败时降级逐页下载并有提示
- [ ] 长图导出：多页 PDF 拼成一张纵向长图，页序自上而下与原 PDF 一致、页面不变形不重叠；触发像素上限时有明确中文报错并引导逐页模式，不产出损坏文件
- [ ] 范围选择：`1-3,5` 类范围只导出对应页（逐页与长图两模式均生效）；非法格式/越界页码/空范围有明确提示且不执行
- [ ] 异常不崩：加密/损坏 PDF 有可读报错；pdf.js CDN 懒加载失败有可读报错、页面不白屏；导出中途进度可见（第 n/N 页），大文件全程顺序渲染不并发爆内存
- [ ] 全程纯前端、无新增后端接口、无文件上传请求；`go build` 通过；SEO meta 完整；移动端布局不错乱

**预计改动文件**：`templates/pdf_to_image.html`（新建）、`static/js/pdf-to-image.js`（新建）、`tools/categories.go`（文档转换分类注册工具）、`BACKLOG.md`（本小节）。

**明日备选（顺延）**：OCR 图片文字识别 [WPS]（首选，先做 tesseract.js 语言包体积/加载耗时/中英识别率小样实测再定版）、PDF 批注标记 [WPS]（专题周后续，交互最重待转图上线后排）、PDF 加水印 [WPS]（小难度，可随时插队）。

## 今日候选（2026-10-08 · 产品调研推荐）

**推荐 Top3**（优先高频、单页可实现、契合现有架构）：

1. **PDF 合并/拆分** — 连续多日 P0、昨日决策已定为今日 P0 首选，今日再获强信号：DEV《How to Merge PDF Files Without Uploading Them Anywhere》（11 天前，pdf-lib 本地合并）、DEV OpenPDF Hub 合并文（22 小时内再抓取）、Medium 无上传合并文（9 小时内再抓取）、GitHub Zancta《PDF/image tools that run in the browser》Show HN 稿（merge/split/compress 全本地）、开源工具箱 DevSpork 将 PDF Merge/Split/Compress 列「Most popular tools」首位；中文 2026 PDF 拆分教程点名网申附件页数限制、合同提取页等刚需场景。ToolWeb 文档分类仅有 DOC 转 PDF，此为补齐文档刚需锚点、开辟 PDF 处理簇。实现：pdf-lib 纯前端（文件不上传），拖拽排序→合并导出 / 按页范围拆分，单页可做（中难度）。SEO：PDF合并、PDF拆分、PDF在线合并、PDF页面提取。
2. **HEIC / Live Photo 转 JPG** — 连续多日 P0 顺延，今日再验证：Medium《5 Free Browser Tools》（近 2 小时再抓取）仍将 LivePhotoKit 列首位（HEIC/Live Photo 浏览器内转 JPG/PNG/WebP/MP4）、中文 HEIC 教程与 heicx 转换站持续活跃；iPhone 默认 HEIC 在 Windows/Android/老系统打不开是跨设备高频痛点，与已上线 EXIF 同属「发图前处理」簇、可互链。实现：纯前端 HEIC 解码（WASM/heic 库）→ JPG/PNG/WebP 导出、批量转换，单页可做（中难度，需评估解码库体积）。SEO：HEIC转JPG、HEIC转换、iPhone照片转JPG、Live Photo转视频。
3. **文本敏感信息打码（分享前脱敏）** — 今日新信号：Hacker News/Reddit 本地优先工具 TinyLocal Tools（近 7 天抓取）以 PasteFix（粘贴文本清理）+ SafePaste（分享前遮蔽邮箱/手机号/API 密钥类敏感串）+ Markdown 表格修复切入「粘贴到别处之前」的日常瞬间；把日志、工单、报错、聊天记录发给同事/AI/论坛前先脱敏是开发者与办公人群高频隐私动作，承接昨日 EXIF 落地后的「隐私处理」叙事从图片扩展到文本。实现：纯前端正则识别邮箱/手机号/身份证/银行卡/密钥模式→一键遮蔽或替换占位符→前后对比与一键复制，单页可做（小难度）。SEO：文本脱敏、敏感信息打码、日志脱敏、隐私信息遮蔽。

**备选顺延**：Markdown 表格修复（P1，与脱敏同源新信号）、图片裁剪（P1，HN CropImages 新信号，与现有缩放的强制裁剪互补）、链接去追踪（低频薄价值，P1）、cURL 转代码（中难度 P1）、SERP/Meta 标签生成器（SEO 簇 P1）、人民币大写转换、单位换算器、WiFi 二维码生成器、键盘按键测试。

**昨日交付核对**：EXIF 信息查看/清除已上线（commit 9061653，`/tools/exif-strip`），自候选划掉并归入已实现。

## 今日任务（2026-10-08 · 产品经理已决策 ✅）

**选定：PDF 合并/拆分** — 路由 `/tools/pdf-merge-split`（模板 `pdf_merge_split`），归「文档转换」分类，ToolWeb「PDF 处理」簇首发工具

**决策理由**：
1. 兑现昨日立约 + 连续多日 P0 到期：该候选 10-06 由 P1 升 P0、10-07 决策已明文「列明日 P0 首选备选单独排期」，今日调研仍列 Top1 且信号再加强——DEV《How to Merge PDF Files Without Uploading Them Anywhere》（pdf-lib 本地合并）、DEV OpenPDF Hub、Medium 无上传合并文（9 小时内再抓取）、GitHub Zancta 浏览器 PDF 套件（Show HN 稿）、DevSpork 将 PDF Merge/Split/Compress 列「Most popular tools」首位、中文 2026 教程点名网申附件页数限制/合同提取页刚需场景。按图片拼接（10-06）、EXIF（10-07）连续两日的同例立约排它，不再顺延。
2. 补齐文档刚需锚点、开辟 PDF 处理簇：「文档转换」分类现仅 DOC 转 PDF 一个工具，站内无任何 PDF 处理能力；多 PDF 按序合并、按页码范围拆分/提取是学生（网申材料、报名附件）与办公（合同、发票整理）人群的高频刚需，竞品工具站人人有之、我们没有，是能力缺口而非差异化比拼。补齐后为后续 PDF 压缩/转图等同簇工具留出入口，SEO 长尾明确（PDF合并、PDF拆分、PDF在线合并、PDF页面提取）。
3. 难度「中」但路径已验证、一日可控：pdf-lib 纯前端本地处理（文件不上传）为 DEV/Medium 多篇教程验证过的成熟路线；仓库既有 CDN 懒加载先例（exif-strip.js 的 JSZip CDN + 失败降级、jsoneditor CDN），无需引入 npm 构建；昨日 QA 修复潮后今日回归新工具开发、节奏平衡。
4. 落选说明：HEIC / Live Photo 转 JPG 连续多日 P0 顺延，但仍需先评估 heic WASM 解码库体积与浏览器兼容性，一日仓促交付质量风险高，列明日 P1 首选备选（先做解码库选型验证再排）；文本敏感信息打码为今日新信号，按 AI Token 计数器/EXIF 的先例先观察一轮竞品与用户反馈，且其难度「小」可随时插队，列 P1 备选。

**规格**：
1. 双模式单页：顶部 Tab 切换「合并 PDF」/「拆分 PDF」两模式，共用上传区；文件仅在本地浏览器处理、不上传服务器，页面文案明示（呼应「无上传」竞品卖点）。
2. 合并模式：点击选择 + 拖拽上传多个 PDF（支持一次多选与追加添加），文件列表展示文件名、大小、页数（pdf-lib 读取后回填，未读出时显示「—」不阻塞操作）；列表支持拖拽排序（移动端提供上移/下移按钮兜底）、单张删除、清空全部；点击「合并并下载」按列表顺序合并全部页面导出单个 PDF，文件名 `merged_<时间戳>.pdf`；合并前展示总页数与预计文件列表顺序摘要。
3. 拆分模式：上传单个 PDF 后展示总页数；页码范围输入（如 `1-3,5,8-10`，1 起始、含端点），解析校验：非法格式/越界页码/空范围给出明确中文错误提示且不执行；两种导出粒度二选一：「合并为一个 PDF」（仅含所选页面、按输入顺序）与「每页一个 PDF」（所选每页各导出一个文件、多文件时打包 ZIP 下载，ZIP 失败降级逐个下载并提示，参照 exif-strip 既有降级策略）；文件名 `split_<原名>_<页码范围>.pdf` / 逐页 `split_<原名>_p<页码>.pdf`。
4. 核心实现（`static/js/pdf-merge-split.js`）：pdf-lib 经 CDN 懒加载（与 exif-strip.js 的 JSZip 同款按需加载 + 失败提示，CDN 不可用时明确报错「库加载失败，请检查网络后重试」、页面不白屏）；用 `PDFDocument.load` / `copyPages` / `save` 完成合并与页面提取，全程 ArrayBuffer 本地处理；加密/损坏 PDF 加载失败时对该文件单独报错并跳过（合并模式其余文件可继续），错误信息可读不静默；大文件（如单个 >50MB）给出处理可能较慢的提示，不硬性拦截。
5. 注册：`tools/categories.go`「文档转换」（doc）分类新增工具 ID `pdf_merge_split`，Name「PDF 合并/拆分」，Description 注明本地处理不上传，Path `/tools/pdf-merge-split`，Icon `picture_as_pdf`，New: true；通用路由 `/tools/:tool` 自动映射模板 `pdf_merge_split`，无需新增 Go 路由；sitemap 自动生成。
6. SEO：title「PDF 合并/拆分 - PDF 在线合并与页面提取工具（本地处理不上传）」、description、keywords（PDF合并、PDF拆分、PDF在线合并、PDF页面提取、PDF合并在线免费）；JSON-LD 与 canonical 沿用现有工具页写法（域名 www.johnkingzcq123.xyz）；页面内与 DOC 转 PDF 互链（沿用站内既有相关工具区，如有）。
7. 移动端适配：上传区、文件列表、范围输入纵向布局不错乱，排序上移/下移按钮与合并/拆分/下载按钮够大，文件名过长截断显示不撑破布局。

**验收标准**：
- [ ] `/tools/pdf-merge-split` 返回 200，首页「文档转换」分类可见入口，Tab 切换合并/拆分两模式正常
- [ ] 合并：2 个以上 PDF 上传后页数显示正确，拖拽排序（或上移/下移）后合并导出顺序与列表一致，导出 PDF 可正常打开、总页数 = 各文件页数之和
- [ ] 拆分：`1-3,5` 类范围正确解析并导出仅含所选页的单文件；「每页一个 PDF」导出逐页文件正确（多文件 ZIP 下载可用，或 CDN 失败时降级逐个下载有提示）
- [ ] 异常不崩溃：非法范围/越界页码有明确提示；损坏或加密 PDF 单独报错（合并模式可跳过继续）；pdf-lib CDN 加载失败时有可读报错、页面不白屏
- [ ] 全程纯前端、无新增后端接口、无文件上传请求；`go build` 通过；SEO meta 完整；移动端布局不错乱

**预计改动文件**：`templates/pdf_merge_split.html`（新建）、`static/js/pdf-merge-split.js`（新建）、`tools/categories.go`（文档转换分类注册工具）、`BACKLOG.md`（本小节）。

**明日备选（顺延）**：HEIC / Live Photo 转 JPG（P1 首选备选，先评估 heic 解码库体积与兼容性）、文本敏感信息打码（P1 备选，新信号观察一轮后可随时插队）。

## 今日候选（2026-10-07 · 产品调研推荐）

**推荐 Top3**（优先高频、单页可实现、契合现有架构）：

1. **EXIF 信息查看/清除** — 连续多日 P0、今日再获多源新信号：Imagera EXIF/GPS 清除长文（近 3 小时内再抓取、强调先看 GPS/机型/时间再一键清除）、Photo Metadata Viewer（EXIF/IPTC/GPS 查看+编辑+批量清除，全本地）、Scrub（11 天前更新，字节级剥离而非重编码）、StripLocal/PrivacyStrip 持续验证；手机照片自带 GPS/机型/时间，发朋友圈/二手平台/论坛前泄露住址行踪是大众隐私刚需；与图片打码（遮像素）、图片拼接同属图片处理簇，补齐「发图前隐私处理」缺口。实现：纯前端解析展示字段表（GPS/机型/时间高亮）→一键清除→导出干净图，单页可做（小难度）。SEO：EXIF清除、照片去除定位、图片元数据删除、照片隐私清理。
2. **PDF 合并/拆分** — 昨日 P0 今日再加强：DEV OpenPDF Hub《Merge PDFs Without Uploading》（约 31 天前，强调无上传合并/拆分）、DEV PDF Splitter/Merger 系列（pdf-lib + JSZip 纯前端方案成熟）、Medium 15 工具清单与中文 PDF 合并测评（报名材料/合同/发票整理高频）持续收录，学生工具箱 Toolbench 亦将 PDF merge/split 列为标配；ToolWeb 仅有 DOC 转 PDF、无 PDF 处理簇，此为补齐文档刚需锚点。实现：pdf-lib 纯前端（文件不上传），拖拽排序→合并导出 / 按页范围拆分，单页可做（中难度）。SEO：PDF合并、PDF拆分、PDF在线合并、PDF页面提取。
3. **HEIC / Live Photo 转 JPG** — 今日由 P1 首选升 Top3：Medium《5 Free Browser Tools》（2026-07-12，近 5 小时再抓取）将 LivePhotoKit 列首位（HEIC/Live Photo 浏览器内转 JPG/PNG/WebP/MP4）、DEV 多篇 HEIC 转 JPG/PDF 教程（Windows 打不开 iPhone 照片）、多家 HEIC 转换站持续活跃；iPhone 默认 HEIC 在 Windows/Android/老系统打不开是跨设备高频痛点，与 EXIF 同属「发图前处理」簇、可互链。实现：纯前端 HEIC 解码（WASM/heic 库）→ JPG/PNG/WebP 导出、批量转换，单页可做（中难度，需评估解码库体积）。SEO：HEIC转JPG、HEIC转换、iPhone照片转JPG、Live Photo转视频。

**备选顺延**：链接去追踪（低频薄价值，P1）、cURL 转代码（中难度 P1）、SERP/Meta 标签生成器（SEO 簇 P1）、人民币大写转换、单位换算器、WiFi 二维码生成器、键盘按键测试。

**昨日交付核对**：图片拼接/长图拼接已上线（commit f513cf3，`/tools/img-stitch`），自候选划掉并归入已实现。

## 今日任务（2026-10-07 · 产品经理已决策 ✅）

**选定：EXIF 信息查看/清除** — 路由 `/tools/exif-strip`（模板 `exif_strip`），归「图片处理」分类

**决策理由**：
1. 兑现昨日立约 + 连续三日 P0：该候选 10-05 首次进 Top3、10-06 列「明日 P1 首选备选」，昨日决策已明言今日三候选按「EXIF（小，隐私双件套收官）> PDF（中，簇开辟）」再议；今日调研再获 Imagera 长文、Photo Metadata Viewer、Scrub（字节级剥离）、StripLocal/PrivacyStrip 多源新信号，连续多日 P0 不再顺延。
2. 补齐「发图前隐私处理」双件套：现有图片打码（10-03）遮的是像素内容，EXIF 清除处理的是看不见的元数据（GPS 坐标、机型、拍摄时间、设备序列号）——手机照片发朋友圈/二手平台/论坛前泄露住址与行踪是大众隐私刚需，两者同属图片处理簇、互链成簇，补齐后「发图前处理」叙事闭环（打码遮内容 + EXIF 清元数据），与昨日图片拼接同簇接力不跨界。
3. 难度「小」、一天可高质量交付：纯前端字节级解析/剥离，无后端、无上传，确定性可测（解析已知 EXIF 的测试图、清除后复检字段为空）；PDF 合并/拆分（中，需引入 pdf-lib + 合并/拆分双模式 + 开辟全新文档簇）与 HEIC 转 JPG（中，需评估 WASM 解码库体积与 Live Photo 视频分离）一日内交付质量风险明显更高。
4. 落选说明：PDF 合并/拆分需求同为刚需，但属全新「PDF 处理」簇开辟（现文档分类仅 DOC 转 PDF 一个工具），列明日 P0 首选备选单独排期；HEIC / Live Photo 转 JPG 与 EXIF 同属发图前处理簇、可互链，列 P1 备选，先评估 heic 解码库体积与浏览器兼容再排。

**规格**：
1. 上传区：点击选择 + 拖拽上传，支持 JPG/JPEG/PNG/WebP，支持多选批量排队（文件列表带缩略图、文件名、大小）；图片仅在本地浏览器处理、不上传服务器，页面文案明示。
2. EXIF 查看（核心，纯前端 JS 解析）：选中任一文件后展示元数据字段表——重点字段高亮置顶：GPS 经纬度（十进制度数 + 原始 DMS，有值时整行标红/橙警示「可定位拍摄地点」）、相机品牌/型号（Make/Model）、拍摄时间（DateTimeOriginal）、软件（Software）、方向（Orientation）、设备序列号（如有）；同时展示基础信息：图片尺寸（宽×高）、文件大小、格式、是否含 EXIF/XMP/ICC 标记。无 EXIF 时明确提示「未检测到 EXIF 元数据」，不报错。
3. 解析实现要点（`static/js/exif-strip.js`）：JPEG 解析 APP1 Exif 段（TIFF 头、IFD0/ExifIFD/GPSIFD，大小端处理）；PNG 检测 eXIf/tEXt/iTXt/zTXt 等文本/元数据块并提示；WebP 检测 EXIF 元数据块。GPS 坐标由 DMS + 参考方向换算为十进制展示，隐私敏感字段（GPS/序列号/时间）在表格中用警示色标记。
4. 一键清除（字节级剥离优先、无损画质）：JPEG 按段剥离 APP1（EXIF/XMP）及含元数据的 APP 段、保留图像数据段原样拼接（不重编码、无画质损失）导出干净图；PNG 重组去掉 eXIf/tEXt/iTXt/zTXt 等元数据块；WebP 去掉 EXIF 元数据块。剥离失败或格式不支持时降级 canvas 重绘导出并明示「已重编码」。清除后自动对导出结果复检一遍字段，页面展示「清除前 N 项 → 清除后 0 项」与文件大小变化。
5. 导出：当前文件一键下载干净图，文件名 `<原名>_clean.<原扩展名>`（JPEG 保持 .jpg、PNG 保持 .png）；批量模式支持逐个下载，及「全部清除并打包下载」（JSZip，参照九宫格切图既有降级策略：CDN 失败时降级逐张下载并提示）。
6. 注册：`tools/categories.go`「图片处理」（image）分类新增工具 ID `exif_strip`，Name「EXIF 信息查看/清除」，Path `/tools/exif-strip`，Icon `privacy_tip`，New: true；通用路由 `/tools/:tool` 自动映射模板 `exif_strip`，无需新增 Go 路由。
7. SEO：title「EXIF 信息查看与清除 - 照片去除定位/GPS 元数据在线工具」、description、keywords（EXIF清除、照片去除定位、图片元数据删除、照片隐私清理、EXIF查看）；JSON-LD 与 canonical 沿用现有工具页写法（域名 www.johnkingzcq123.xyz）；sitemap 自动生成；与图片打码页互链（页面内「相关工具」提及打码/拼接或沿用站内既有相关工具区，如有）。
8. 移动端适配：上传区与字段表纵向布局、字段表可横向滚动不错乱、清除/下载按钮够大；多图排队时列表可删除单张、清空全部。

**验收标准**：
- [ ] `/tools/exif-strip` 返回 200，首页「图片处理」分类可见入口
- [ ] 含 EXIF 的 JPEG 测试图上传后字段表正确：GPS/机型/拍摄时间等字段与原图一致，GPS 等隐私字段有警示色高亮
- [ ] 一键清除后导出图可正常打开、画质无可见损失（字节级剥离、无重编码）；复检导出图 EXIF 字段为空，页面「清除前 N 项 → 清除后 0 项」展示正确
- [ ] PNG/WebP 含元数据时能检测并清除导出；无 EXIF 的图片有明确提示且不报错
- [ ] 批量多图排队、逐个查看/清除、逐个下载可用；打包下载可用或 CDN 失败时降级逐张有提示
- [ ] 纯前端，无新增后端接口；`go build` 通过；SEO meta 完整；移动端布局不错乱

**预计改动文件**：`templates/exif_strip.html`（新建）、`static/js/exif-strip.js`（新建）、`tools/categories.go`（图片处理分类注册工具）、`BACKLOG.md`（本小节）。

**明日备选（顺延）**：PDF 合并/拆分（P0 首选备选，PDF 处理簇开辟，需中难度单独排期）、HEIC / Live Photo 转 JPG（P1 备选，先评估解码库体积与兼容性）。

## 今日候选（2026-10-06 · 产品调研推荐）

**推荐 Top3**（优先高频、单页可实现、契合现有架构）：

1. **图片拼接 / 长图拼接** — 昨日 P0 顺延后升为今日首选：Stitch It、Media.io Photo Stitch、web-collage/snapstitch 等多源信号持续，今日再获 Image Toolbox 将 Image Stitching 列为核心图片能力佐证；聊天记录/订单/收据截图一张张发又长又散、商品图并排对比是大众高频麻烦；与九宫格切图（拆分）互补成图片「拼合」簇，与打码/压缩/水印同属图片处理分类、站内互链强。实现：canvas 纯前端，多图上传→拖拽排序→纵/横拼接+间距/背景色→导出长图，单页可做。SEO：长图拼接、图片拼接、截图拼长图、聊天记录拼图。
2. **EXIF 信息查看/清除** — 昨日 P0 信号今日再加强（五重新验证）：forjiang/image-metadata-cleaner（9 天前，批量清 EXIF/GPS/XMP/IPTC 并逐项日志展示）、capytools CapyStrip（以「remove exif data / photo metadata viewer / strip gps」为目标词新建浏览器端清除工具）、StripLocal 与 image-fingerprint-remover（扩展到 C2PA/AI 生成指纹清除）持续活跃，叠加中文 PixPix EXIF 工具长文（2026-09-19，强调 GPS/作者为隐私风险高亮项）——手机照片自带 GPS/机型/时间，发朋友圈/二手平台前泄露住址行踪是大众隐私刚需；与图片打码（遮像素）互补成「发图前隐私处理」双件套。实现：纯前端解析展示 EXIF 字段表（GPS/机型/时间高亮）→一键清除→canvas 重绘导出，单页可做。SEO：EXIF清除、照片去除定位、图片元数据删除、照片隐私清理。
3. **PDF 合并/拆分** — 今日由 P1 升 P0：ToolSura/Tooliest 将 PDF 合并/拆分列为开发者与大众工具标配、NoUploadTools 与 Medium《15 Free Online Tools》（2026-09-19）均把 PDF Merger 列入文档类头部，ToolWeb 现仅有 DOC 转 PDF、尚无 PDF 处理簇，此为补齐大众文档刚需的锚点；多 PDF 合并、按页码拆分/提取是学生与办公人群高频动作。实现：pdf-lib 纯前端（文件不上传），拖拽排序→合并导出 / 按页范围拆分，单页可做（中难度）。SEO：PDF合并、PDF拆分、PDF在线合并、PDF页面提取。

**备选顺延**：HEIC/Live Photo 转 JPG（LivePhotoKit 在 DEV 与 Medium 两处独立出现，iPhone 照片在 Windows/Android 打不开的高频痛点，可与 EXIF 同属发图前处理簇列 P1 首选）、链接去追踪（低频薄价值，继续 P1）、cURL 转代码（DevKit/ToolSura 验证，中难度 P1）、SERP/Meta 标签生成器（SEO 簇 P1）、人民币大写转换、单位换算器、WiFi 二维码生成器。

## 今日任务（2026-10-06 · 产品经理已决策 ✅）

**选定：图片拼接 / 长图拼接** — 路由 `/tools/img-stitch`（模板 `img_stitch`），归「图片处理」分类

**决策理由**：
1. 昨日立约到期兑现：该候选自 10-04 起连续三轮（10-04/10-05/10-06）稳居调研 Top3，10-05 产品经理已将其列「明日 P0 首选备选」，今日调研仍排第一（Image Toolbox 将 Image Stitching 列为核心图片能力再佐证）——需求真实性无悬念，按 JSON 转 TS 的同例立约排它，不再顺延。
2. 补图片「拼合」簇的另一半：现有图片处理已具九宫格切图（10-02，拆）、图片打码（10-03）、压缩/水印/格式转换/尺寸调整/Base64 互转，唯独缺「多图合一」；聊天记录/订单/收据截图拼长图与商品图并排对比是大众高频场景，补齐后图片处理簇「拆（九宫格）+ 拼（长图）」闭环，站内互链与 SEO 主题聚合更强。
3. 一天可高质量交付、零后端成本：canvas 纯前端多图合成，拖拽排序/间距/背景色为成熟交互，确定性可测；昨日刚上线 AI Token 计数器（开发向新簇），今日回归大众向图片工具做节奏平衡。
4. 落选说明：EXIF 信息查看/清除信号今日再加强（五重验证），但与图片打码同属「发图前隐私」场景、可并入图片簇下一站打包，列明日 P1 首选备选；PDF 合并/拆分今日升 P0 但属「中」难度（pdf-lib 引入 + 合并/拆分双模式 + 页码范围解析），且需开辟全新 PDF 处理簇，一日仓促交付质量风险高，列明日观察位——明日三候选按「EXIF（小，隐私双件套收官）> PDF（中，簇开辟）」再议。

**规格**：
1. 上传区：点击选择 + 拖拽上传多图（JPG/PNG/WebP），支持一次多选与追加添加；每张生成缩略图条（带序号），图片仅在本地处理不上传服务器，页面文案明示。
2. 排序与管理：缩略图支持拖拽排序（HTML5 drag 或指针事件实现，移动端可用），每张可删除、清空全部；排序后主画布实时重新拼接预览。
3. 拼接设置：方向切换（纵向拼接 / 横向拼接）；图片间距滑杆（0~100px）；背景色选择（颜色输入 + 常用预设白/黑/透明）；对齐方式（左/居中/右，仅尺寸不一时生效，纵向按宽对齐、横向按高对齐）。
4. 拼接核心（纯前端 canvas，`static/js/img-stitch.js`）：按统一基准尺寸缩放各图后拼接（纵向统一宽度、横向统一高度），输出总尺寸实时展示（宽×高 px）；超长图（如总高 > 16384px 或单边超限）给出降质/分段导出提示，避免 canvas 尺寸上限导致导出空白。
5. 导出：PNG / JPG 格式切换下载，文件名 `stitched_<时间戳>.png|.jpg`；JPG 时背景色填充生效（透明背景自动转白并提示）；导出保持拼接原分辨率，不因预览缩放降质。
6. 注册：`tools/categories.go` 图片处理（image）分类新增工具 ID `img_stitch`，Name「图片拼接 / 长图拼接」，Path `/tools/img-stitch`，Icon `view_column`，New: true；通用路由 `/tools/:tool` 自动映射模板 `img_stitch`，无需新增 Go 路由。
7. SEO：title「图片拼接工具 - 长图拼接/截图拼长图在线工具」、description、keywords（长图拼接、图片拼接、截图拼长图、聊天记录拼图、图片合并）；JSON-LD 与 canonical 沿用现有工具页写法；sitemap 自动生成。
8. 移动端适配：上传与设置区纵向布局、拖拽排序在触摸端可用（或提供上移/下移按钮兜底）、预览图自适应宽度不错乱、导出按钮够大。

**验收标准**：
- [ ] `/tools/img-stitch` 返回 200，首页「图片处理」分类可见入口
- [ ] 多图上传后纵向拼接预览正确：顺序与缩略图条一致、间距/背景色实时生效；切换横向拼接后按统一高度横排正确
- [ ] 拖拽排序（或上移/下移兜底）后预览与导出顺序同步更新；单张删除、清空全部可用
- [ ] PNG/JPG 导出可用，导出图尺寸与页面展示的总尺寸一致、无错位拉伸；透明背景导 JPG 自动转白有提示
- [ ] 超长拼接（多张长截图）有尺寸上限提示且不出现导出空白/崩溃；大图上传不卡死
- [ ] 纯前端，无新增后端接口；`go build` 通过；SEO meta 完整；移动端布局不错乱

**预计改动文件**：`templates/img_stitch.html`（新建）、`static/js/img-stitch.js`（新建）、`tools/categories.go`（图片处理分类注册工具）、`BACKLOG.md`（本小节）。

**明日备选（顺延）**：EXIF 信息查看/清除（P1 首选备选，发图前隐私双件套收官）、PDF 合并/拆分（P0 观察位，PDF 处理簇开辟，需中难度排期）。

## 今日候选（2026-10-05 · 产品调研推荐）

**推荐 Top3**（优先高频、单页可实现、契合现有架构）：

1. **AI Token 计数器** — 昨日 P0 首选备选观察期满、今日信号再加强（七重验证）：DEV《I Built a Token Counter That Works Offline — 19 Models, File Drop, Cost Estimator》（19 模型实时计价+上下文窗占用条+文件拖入计数）、pramilk/dev-microtools《LLM Token Counter & API Cost Estimator》（GPT-5/Claude/Gemini 精确分词+费用，2026-08-29 更新）、mattbusel/llm-cost（9 天前，12 模型比价+预算守卫）、chris-dyson/ai-token-calculator（15 模型实时成本）、vibingtalk TokenSave（6 天前，GPT-6/Claude 5.5/Gemini 3.1 计价+非英语 token 溢价分析+一键清洗），叠加昨日 ricodane/token-lens/tokl 等六重信号——调 LLM API 前估 prompt token 数、会不会超上下文窗、要花多少钱是 AI 时代开发者每日高频动作，中文工具站鲜有此工具可打差异化；ToolWeb 尚无 AI 工具分类，此为开辟新簇首发。实现策略：GPT 系用轻量 BPE 分词库精确计数、Claude/Gemini 等用字符比近似并明示「估算」标签（DEV 高赞文已验证 ±5% 近似足够预算场景），纯前端单页可做。SEO：token计数器、token计算器、ChatGPT token计算、LLM费用估算。
2. **图片拼接 / 长图拼接** — 昨日顺延后今日再获三重验证：Stitch It（APKMirror 2.3.0，聊天/收据/订单截图拼一张长图+打码一体）、Media.io Free Photo Stitch（16 小时前抓取，纵向截图拼接/商品并排/前后对比五场景）、GitHub ongxeno/web-collage（canvas 多图合并+拖拽排序+PNG 导出）+ prathameshmore07/snapstitch（19 天前，截图批量拖入→排序→导出），叠加昨日 Tailor/Adobe Express/CSDN 长图系列——聊天记录/截图/商品图一张张发又长又散是大众高频麻烦；昨日产品经理暂缓理由（连续两日图片工具、簇失衡）已随 JSON 转 TS 上线消解：今日排它与九宫格切图（拆）互补成图片「拼合」簇，与打码/压缩/水印同属图片处理分类、站内互链强。canvas 纯前端：多图上传→拖拽排序→纵/横拼接+间距/背景色→导出长图，单页可做。SEO：长图拼接、图片拼接、截图拼长图、聊天记录拼图。
3. **EXIF 信息查看/清除** — 今日新发现的强隐私信号：itsjustadarsh/scrub（9 天前，浏览器内字节级剥离 EXIF/GPS/XMP 而非重编码）、NakliTechie/StripLocal（拖入即清 GPS/设备序列号/拍摄时间）、toolio EXIF Metadata Remover（6 天前，无上传清 GPS/机型/时间戳）、burakoskay EXIF Metadata Remover Skill（4 天前）+ PhotoAITagger/Pixvisor 隐私清洗长文——手机照片自带 GPS 坐标、设备型号、拍摄时间，发朋友圈/论坛/二手平台前泄露住址与行踪是大众隐私刚需，普通用户与开发者通用；与图片打码（遮内容）互补成「发图前隐私处理」双件套（一个遮像素、一个清元数据），同属图片处理簇。纯前端：解析展示 EXIF 字段表（GPS/机型/时间）→一键清除→canvas 重绘导出干净图（明示重编码），单页可做。SEO：EXIF清除、照片去除定位、图片元数据删除、照片隐私清理。

**备选顺延**：链接去追踪（连续多轮验证但低频、单页价值薄，P1 首选备选）、PDF 合并/拆分（ToolOrbit/EasyTools/ClickJoy 多站标配，大众高频，pdf-lib 纯前端，中难度列 P1）、cURL 转代码（DevTools Hub/HN DevKit 验证，需解析引号/多行，中难度 P1）、SERP 搜索结果预览 / Meta 标签生成器（SEO 工具簇，devtoolbelt/ToolOrbit/codinganthem 三站标配，P1）、人民币大写转换、单位换算器、WiFi 二维码生成器。

## 今日任务（2026-10-05 · 产品经理已决策 ✅）

**选定：AI Token 计数器** — 路由 `/tools/ai-token-counter`（模板 `ai_token_counter`），新开「AI 工具」分类首发工具

**决策理由**：
1. 观察期满 + 七重信号再加强：该候选 10-04 已列「明日 P0 首选备选」观察分词精度方案；今日调研新增 DEV 离线 Token 计数器（19 模型 + 文件拖入 + 上下文窗占用条）、pramilk LLM Token Counter（2026-08-29，GPT-5/Claude/Gemini 分词与费用说明）、mattbusel llm-cost（9 天前，12 模型比价 + 预算守卫）、chris-dyson（15 模型实时成本）、vibingtalk TokenSave（6 天前，非英语 token 溢价分析）等信号，叠加昨日 ricodane/token-lens/tokl 六重验证——调 LLM API 前估 token 数、会不会超上下文窗、要花多少钱，是 AI 时代开发者每日高频动作，需求真实性无悬念。
2. 差异化开新簇：ToolWeb 现有 50+ 工具分属格式化/编码/开发/文本/格式转换/图片/文档/网络/加密/生活十类，尚无「AI 工具」分类；中文工具站鲜有 token 计数 + 费用估算一体工具，此为开辟 AI 工具簇的首发锚点，后续可接 Prompt 模板、模型比价等，一次投入换新流量入口，价值高于再补一张图片工具。
3. 昨日的精度顾虑已有成熟解法：pramilk 与 DEV 高赞文均验证同一路线——OpenAI 系可用轻量 BPE 词表精确计数，Claude/Gemini 等未公开 tokenizer 的模型用字符比近似并明示「估算」标签，预算/超窗预警场景 ±5% 足够；今日按此实现，不再顺延。
4. 落选说明：图片拼接/长图拼接需求同样真实，但图片处理簇近三日已连上九宫格切图（10-02）、图片打码（10-03），再排图片工具簇内边际收益递减，列明日 P0 首选备选；EXIF 查看/清除为今日新信号，先观察一轮竞品迭代，且其与图片打码同属「发图前隐私」场景、可与图片拼接打包成图片簇下一站，列 P1 首选备选。JSON 转 TS（10-04）刚上线，今日回归开发向工具节奏平衡（开发高频 + 大众可懂），不连续压图片方向。

**规格**：
1. 输入区：多行文本输入框（粘贴 prompt/文章/代码），实时统计字符数、单词数（英文按空格、中文按字计）、行数；支持 `.txt/.md/.json/.log` 文件拖入/点击读取（本地 FileReader 读取、明示不上传服务器）；内置「填充示例」（中英混排示例 prompt）、清空按钮。
2. 模型选择：下拉/分组选择 ≥12 个主流模型，至少覆盖 OpenAI（GPT-4o、GPT-4o mini、GPT-4.1、GPT-4 Turbo、o3）、Anthropic（Claude 3.7 Sonnet、Claude 3.5 Sonnet、Claude 3 Opus）、Google（Gemini 2.5 Pro、Gemini 2.0 Flash）、DeepSeek（DeepSeek-V3/R1）、通义千问（Qwen2.5）四大家族；每个模型展示上下文窗大小（如 128K/200K/1M）与输入/输出单价（$/1M tokens，静态价格表，页面标注「价格为公开标价快照、仅供估算」）。
3. Token 计数核心（纯前端 `static/js/ai-token-counter.js`）：OpenAI 系实现轻量 BPE 风格估算（按单词/标点/数字/中文字符分段计数，目标误差可接受范围并在页面明示方法）；Claude/Gemini/DeepSeek/Qwen 等用各家族字符比系数近似，结果旁明示「估算」标签与估算说明，不假装精确；输入变化实时重算（防抖）。
4. 上下文窗占用条：进度条展示已输入 token 占所选模型上下文窗的百分比，<80% 绿色、80~100% 橙色预警、>100% 红色超限提示，并给出「约可再输入 X token」文案。
5. 费用估算：按所选模型单价计算本次输入成本；可填「预计输出 token 数」（数字输入，默认 500）估算输出成本与总成本，USD 展示（可选附人民币按固定汇率换算并标注）；多模型比价小表（同输入在 3~4 个热门模型下的总价对比）为加分项，时间紧可降级为仅当前模型。
6. 辅助：中英文混排提示（中文字符 token 密度说明，如「中文约 1 字 ≈ 1 token 量级，以实际计数为准」）；一键复制统计摘要（模型/token 数/预估费用）；页面明示纯本地处理、文本不上传。
7. 注册：`tools/categories.go` 新增分类「AI 工具」（ID `ai`，Icon `smart_toy`），其下新增工具 ID `ai_token_counter`，Name「AI Token 计数器」，Path `/tools/ai-token-counter`，Icon `token`，New: true；通用路由 `/tools/:tool` 自动映射模板 `ai_token_counter`，无需新增 Go 路由。
8. SEO：title「AI Token 计数器 - LLM Token 计算与 API 费用估算在线工具」、description、keywords（token计数器,token计算器,ChatGPT token计算,LLM费用估算,Claude token,Gemini token）；JSON-LD 与 canonical 沿用现有工具页写法；sitemap 自动生成。
9. 移动端适配：输入区/结果区分上下布局，模型选择与按钮够大，占用条与比价表不错乱，长文本横向不溢出。

**验收标准**：
- [ ] `/tools/ai-token-counter` 返回 200，首页「AI 工具」分类可见入口（新分类仅此 1 个工具时也正常渲染）
- [ ] 填充示例一键载入后，≥12 个模型切换均实时给出 token 数、字符/单词统计；OpenAI 系结果与官方量级一致（抽查英文段落误差在可接受范围），非 OpenAI 模型明确标注「估算」
- [ ] 上下文窗占用条随模型/输入实时变化，80%/100% 两档预警变色与文案正确；超限时红色提示
- [ ] 费用估算：输入成本 + 可编辑预计输出 token 的总成本计算正确，价格快照标注可见
- [ ] 文件拖入（.txt/.md）读取填充成功；非法/超大文件有提示不崩溃；页面明确提示本地处理不上传
- [ ] 复制统计摘要可用且内容与展示一致；纯前端，无新增后端接口；`go build` 通过；SEO meta 完整；移动端布局不错乱

**预计改动文件**：`templates/ai_token_counter.html`（新建）、`static/js/ai-token-counter.js`（新建）、`tools/categories.go`（新增 AI 工具分类 + 注册工具）、`BACKLOG.md`（本小节）。

**明日备选（顺延）**：图片拼接/长图拼接（P0 首选备选，图片「拼合」簇下一站）、EXIF 信息查看/清除（P1 首选备选，隐私双件套）。

## 今日候选（2026-10-04 · 产品调研推荐，已决策归档）

**推荐 Top3**（优先高频、单页可实现、契合现有架构）：

1. **JSON 转 TypeScript / Go 结构体** — 10-03 已立约「不再无限顺延、明日无更强大众候选即排它」，今日无更强候选且需求再获三重验证：json.my 博客长文（3 天前抓取，讲嵌套接口拆分/可选字段/联合类型推断）、GitHub JSONCraft（JSON→TS/Go/Rust/Zod/Prisma 浏览器内全套转换）、codinganthem 工具箱将 JSON to TypeScript 列入 Converters；对接 API 手写类型定义繁琐易错；与 JSON 解析器/JSON-YAML 互转/CSV-JSON 成格式转换簇；纯前端递归推断，单页可做。SEO：JSON转TypeScript、JSON转Go结构体、JSON生成interface。
2. **AI Token 计数器** — 今日新发现的强信号品类：ricodane/ai-token-counter（多模型 token 计数+费用估算，44 天）、token-lens 与 Claude Token Counter 两个 Chrome 扩展（31 天）、VSCode Live LLM Token Counter、tokl（4 天前，13 个 LLM 分词计数）、HN DevKit「AI & ML: Token counter」、codinganthem「Token Counter & Estimator」——44 天内六重独立信号；调 LLM API 前估算 prompt 的 token 数与成本是 AI 时代开发者高频动作，中文工具站鲜有此工具、可打差异化；纯前端（GPT 系用轻量分词库精确计数、其余模型字符比近似并明示），单页可做。SEO：token计数器、token计算、ChatGPT token。
3. **图片拼接 / 长图拼接** — 今日新发现：Adobe Express 在线合并图片（7 天前抓取）、360doc 实用网站清单收录 Photo Collage Maker 在线拼图、CSDN uniapp「长图拼接」纯前端小程序系列（canvas 纵/横拼接）、App Store Tailor 拼截图（聊天记录拼长图）；聊天记录/截图/商品图一张张发又长又散是大众高频麻烦，与九宫格切图（拆）互补成图片「拼合」簇（另有打码/压缩/水印）；canvas 纯前端：多图上传→拖拽排序→纵/横拼接+间距→导出长图，单页可做。SEO：长图拼接、图片拼接、截图拼长图、在线拼图。

**备选顺延**：链接去追踪（URL 追踪参数清洗，连续多重验证但低频、单页价值薄，P1 首选备选）、键盘按键测试（P1 保留，场景最窄）、SERP 搜索结果预览 / Meta 标签生成器 / robots.txt 生成器（SEO 工具簇）、人民币大写转换、单位换算器、WiFi 二维码生成器。

## 今日任务（2026-10-04 · 产品经理已决策 ✅）

**选定：JSON 转 TypeScript / Go 结构体** — 路由 `/tools/json-to-types`（模板 `json_to_types`）

**决策理由**：
1. 兑现立约、需求三重再验证：该候选自 9-29 起连续六轮备选，10-03 产品经理决策已立约「不再无限顺延、明日无更强大众候选即排它」；今日核查结论是无更强候选——图片拼接虽属大众需求，但九宫格切图（10-02）、图片打码（10-03）已连续两日投入图片方向，再排图片拼接为连续第三日同簇，边际收益低且工具簇失衡；AI Token 计数器为今日新信号，势头虽猛，但精确分词依赖各模型 tokenizer（GPT 系可精确、Claude/Gemini 等只能字符比近似），一日内交付容易在「数不准」上翻车，先列明日 P0 首选备选观察一天。JSON 转 TS/Go 今日再获 json.my 博客长文（嵌套接口拆分/可选字段/联合类型）、GitHub JSONCraft（JSON→TS/Go/Rust/Zod/Prisma）、codinganthem 工具箱 Converters 三重验证，需求真实性无悬念，今日到期兑现。
2. 补「格式转换簇」的标配缺口：现有 JSON 解析器、JSON-YAML 互转、CSV-JSON 互转已成簇，唯独缺开发者对接 API 时最高频的「JSON → 类型定义」一环；transform.tools/it-tools 系站点人人有之、我们没有，是能力缺口而非差异化比拼——补齐后格式转换簇（解析/互转/类型生成）完整闭环，站内互链与 SEO 主题聚合更强。SEO 长尾明确：JSON转TypeScript、JSON转Go结构体、JSON生成interface。
3. 一天可高质量交付：纯前端递归推断零外部依赖、零后端成本，结果确定性可测（嵌套对象拆分命名、数组元素合并推断可选字段正是 json.my 长文的核心卖点，做出来即有口碑点）；与连续两日图片工具形成开发向/大众向节奏平衡。

**规格**：
1. 输入区：JSON 文本输入框（支持粘贴），内置「填充示例」一键载入含嵌套对象/对象数组/混合类型的示例 JSON；输入非法 JSON 时给出明确错误提示（指出 JSON.parse 报错信息），不崩溃、不清屏。
2. 类型推断核心（纯前端递归，`static/js/json-to-types.js`）：
   - 标量映射：string→TS `string`/Go `string`；整数→TS `number`/Go `int64`，带小数点或指数→Go `float64`；boolean→`boolean`/`bool`；null→TS 并入联合（如 `string | null`）、Go `interface{}`。
   - 对象：TS 生成嵌套 interface 并按路径 PascalCase 命名拆分（如根 `Root`、字段 `address`→`RootAddress`、`items[]` 元素→`RootItemsItem`，命名可预期、无重名冲突时复用同名）；Go 生成对应 struct，字段名 PascalCase + json tag（原 key），可选字段加 `,omitempty`。
   - 数组：合并全部元素推断形状——对象数组取字段并集，某字段在部分元素缺失→TS 可选 `?`、Go `omitempty`；元素标量类型不一致→TS 联合类型（如 `(string | number)[]`）、Go `[]interface{}`；空数组→TS `unknown[]`、Go `[]interface{}`；嵌套数组递归处理。
   - 根类型名可自定义（输入框，默认 `Root`），改名后输出实时刷新。
3. 输出区：TypeScript / Go 两个 Tab 切换展示生成结果（等宽字体、带行号或至少保留缩进原样呈现）；输入变化实时重新生成（防抖即可）；一键复制当前 Tab 结果（toast 提示）、下载为 `.ts`/`.go` 文件。
4. 辅助操作：格式化输入 JSON（美化缩进）、清空；页面文案明示本地处理、JSON 不上传服务器。
5. 注册：`tools/categories.go`「格式转换」（convert）分类新增工具 ID `json_to_types`，Path `/tools/json-to-types`，Icon `schema`，New: true。
6. SEO：title「JSON 转 TypeScript / Go 结构体 - JSON 生成 interface 在线工具」、description、keywords（JSON转TypeScript、JSON转Go结构体、JSON生成interface、json to typescript、json to go struct）；sitemap 自动生成。
7. 移动端适配：输入/输出上下布局、Tab 与按钮够大、长代码横向滚动不错乱。

**验收标准**：
- [ ] `/tools/json-to-types` 返回 200，首页「格式转换」分类可见入口
- [ ] 示例 JSON 一键载入并正确生成：嵌套对象拆分为独立命名的 interface/struct、对象数组缺失字段推断为可选（TS `?` / Go `omitempty`）、混合类型数组生成联合类型
- [ ] 根类型名自定义生效；TS/Go Tab 切换、实时重新生成正常
- [ ] 非法 JSON 给出明确错误提示且页面不崩溃；空数组/null/嵌套数组等边界不报错
- [ ] 复制当前 Tab 结果、下载 .ts/.go 文件可用，内容与展示一致
- [ ] 纯前端，无新增后端接口；`go build` 通过；SEO meta 完整；移动端布局不错乱

**预计改动文件**：`templates/json_to_types.html`（新建）、`static/js/json-to-types.js`（新建）、`tools/categories.go`（格式转换分类注册工具）、`BACKLOG.md`（本小节）。

**明日备选（顺延）**：AI Token 计数器（P0 首选备选，观察分词精度方案后再排）、图片拼接/长图拼接（图片簇下一站，等开发向节奏平衡后排）、链接去追踪（P1 首选备选）。

## 2026-10-03 决策归档（已完成 ✅）

**选定并已实现：图片打码/马赛克工具** — 路由 `/tools/img-mosaic`（模板 `img_mosaic`），commit 90fa8c8

**决策理由**：Varkido 热门图片工具 + norito 图片品类 + 中文「发图前处理」清单多重验证；发微信/朋友圈/工单截图前遮车牌、人脸、手机号、订单号是大众隐私刚需；canvas 纯前端框选打码（马赛克/高斯模糊），与水印/压缩/九宫格切图形成图片隐私工具簇。

**交付回顾**：上传预览、框选即时打码（马赛克/高斯模糊双效果+粒度调节）、多步撤销/清空、原图分辨率 PNG 导出、大图缩放坐标映射；纯前端无新增后端接口（以 commit 90fa8c8 为准，验收细节见 10-03 规格清单）。

## 今日任务（2026-10-03 · 产品经理已决策 ✅）

**选定：图片打码/马赛克工具** — 路由 `/tools/img-mosaic`（模板 `img_mosaic`）

**决策理由**：
1. 大众隐私刚需、多重验证：Varkido 170+ 工具站将图片区域打码列为热门图片工具、norito 92 工具站图片品类持续扩展、中文「发图前处理」清单反复出现——发微信/朋友圈/工单截图前遮车牌、人脸、手机号、订单号是高频日常动作，频率高于链接清洗（仅收到带参长链时），且普通用户与开发者通用。
2. 工具簇策略：与现有图片水印/压缩/格式转换/尺寸调整/Base64 互转及昨日上线的九宫格切图形成完整的「图片隐私+处理」工具簇，站内互链与 SEO 主题聚合更强。
3. JSON 转 TS/Go 连续五轮备选（9-29 起）：今日验证虽再加强（transform.tools + DEV 长文 + jsontoall + ToolsFam），但仍属 it-tools 系站点「标配无差异」功能，且现有 JSON 解析器/JSON-YAML 互转/CSV-JSON 已形成格式转换簇兜底；与近四日验证有效的大众流量策略（亲戚关系→随机决策→花体字→九宫格）错位，继续列明日首选备选，不再无限顺延——明日若无更强大众候选即排它。
4. 链接去追踪痛点真实但低频、单页价值较薄，列明日备选；键盘按键测试场景最窄，继续暂缓。
5. canvas 纯前端框选打码（马赛克/高斯模糊），图片不离开浏览器、无后端成本与隐私风险，本身就是卖点；一天可高质量交付。SEO：图片打码、截图打马赛克、照片遮脸、图片马赛克在线。

**规格**：
1. 上传区：点击选择 + 拖拽上传，支持 JPG/PNG/WebP；上传后即时在 canvas 画布预览（图片仅在本地处理，不上传服务器，页面文案明示）。
2. 打码操作：鼠标/触摸拖拽框选矩形区域即打码；两种效果可切换——马赛克（像素化，粒度滑杆 4~40 可调）、高斯模糊（模糊半径滑杆可调）；打码实时渲染、所见即所得。
3. 编辑管理：撤销上一步（至少支持多步撤销栈）、清空全部打码（恢复原图）、删除单个选区（点击已有选区高亮后删除，二选一实现即可，优先撤销+清空保底）。
4. 下载：导出 PNG 下载（保持原图尺寸分辨率导出，不因预览缩放降质）；文件名 `mosaic_<原名>.png`。
5. 大图处理：超大图片（如 ≥4000px 或 >10MB）在预览层按比例缩放显示、打码坐标按比例映射回原图导出，避免内存爆炸/卡死；给出「处理中」状态提示。
6. 注册：`tools/categories.go` 图片处理（image）分类新增工具 ID `img_mosaic`，Path `/tools/img-mosaic`，Icon `blur_on`，New: true。
7. SEO：title「图片打码工具 - 截图/照片马赛克模糊在线处理」、description、keywords（图片打码、截图打马赛克、照片遮脸、图片马赛克、隐私遮挡）；sitemap 自动生成。
8. 移动端适配：触摸框选可用（touch 事件与鼠标事件统一处理）、按钮够大、画布自适应宽度不错乱。

**验收标准**：
- [ ] `/tools/img-mosaic` 返回 200，首页「图片处理」分类可见入口
- [ ] 上传测试图后框选区域即时打码；马赛克/高斯模糊切换正常，粒度/半径滑杆生效
- [ ] 撤销多步、清空恢复原图均可用
- [ ] 导出 PNG 分辨率与原图一致，框选位置与预览无偏移（重点验缩放映射）
- [ ] 大图（≥4000px）上传不卡死/不崩溃；移动端触摸框选可用
- [ ] 纯前端，无新增后端接口；`go build` 通过；SEO meta 完整；移动端布局不错乱

**预计改动文件**：`templates/img_mosaic.html`（新建）、`static/js/img-mosaic.js`（新建）、`tools/categories.go`（注册工具）、`BACKLOG.md`（本小节）。

## 今日任务（2026-10-03 · 产品调研推荐，待产品经理决策）

**推荐 Top3**（优先高频、单页可实现、契合现有架构，产品经理三选一）：

1. **JSON 转 TypeScript / Go 结构体** — 连续四轮备选后今日再获强验证：transform.tools 将 JSON→TypeScript 列为核心转换、DEV《How to Convert JSON to TypeScript Interfaces Automatically》长文 + jsontoall 在线工具、ToolsFam Universal Data Converter 均主打 JSON→TS 类型生成；对接 API 时手写类型定义繁琐易错是开发者高频痛点；与现有 JSON 解析器、JSON-YAML 互转、CSV-JSON 形成格式转换工具簇；纯前端递归推断（嵌套接口拆分、数组元素合并、可选字段），单页可高质量交付。SEO：JSON转TypeScript、JSON转Go结构体、JSON生成接口。
2. **链接去追踪（URL 追踪参数清洗）** — 今日再获验证：slug.tools 将 query cleaner 与 UTM builder、URL parser、SERP preview 做成 URL 工具包，awesome-free-online-tools 收录；叠加昨日 B 站/小红书分享净化（fx-k/keke.su 在线版）、URLCheck 防跟踪长文；微信/小红书/B 站分享链接夹带 utm_*/fbclid/xsec_token/spm 等参数又长又泄露来源隐私，转发前清洗是大众+开发者通用动作；纯前端参数黑名单识别+一键清洗+清洗前后对比，单页可做。
3. **图片打码/马赛克工具** — 昨日已列 P1，今日竞品再验证：Varkido 170+ 工具站将图片区域打码列为热门图片工具，norito 92 工具站图片/GIF 品类持续扩展，cleanup.pictures/魔术橡皮擦类「发图前处理」需求在中文实用网站清单中反复出现；发微信/朋友圈/工单截图前遮车牌、人脸、手机号、订单号是大众隐私刚需；canvas 框选 + 马赛克/高斯模糊 + 撤销/下载，纯前端单页，与现有水印/压缩/九宫格切图形成图片隐私工具簇。SEO：图片打码、截图打马赛克、照片遮脸。

**备选顺延**：键盘按键测试（P1 保留，场景最窄）、SERP 搜索结果预览 / Meta 标签生成器 / robots.txt 生成器（SEO 工具簇，可打包一日）、人民币大写转换（中文财务长尾）、单位换算器（大众高频）、WiFi 二维码生成器（生活工具接力候选）。

## 今日候选（2026-10-03 · 产品调研推荐）

**推荐 Top3**（优先高频、单页可实现、契合现有架构）：

1. **JSON 转 TypeScript / Go 结构体** — transform.tools + DEV 长文 + jsontoall + ToolsFam 四重验证；对接 API 高频痛点；与 JSON 解析器/JSON-YAML 互转成工具簇；纯前端递归生成。
2. **链接去追踪（URL 追踪参数清洗）** — slug.tools query cleaner + B站/小红书净化工具 + URLCheck 验证；追踪参数又长又侵犯隐私；纯前端单页。
3. **图片打码/马赛克工具** — Varkido 热门图片工具 + norito 图片品类 + 中文发图前处理需求验证；canvas 框选打码纯前端；与水印/九宫格成图片隐私簇。

---

## 今日任务（2026-10-02 · 产品经理已决策 ✅）

**选定：图片九宫格切图（朋友圈/IG 九宫格）** — 路由 `/tools/nine-grid`（模板 `nine_grid`）

**决策理由**：
1. 需求多重验证：GitHub wumingluren/LongPicCutter（宫格/长图分割）、shirolin/x-puzzle-kit（社交创意拆分器 3x3 已上线）、Play 商店 Grid Maker、360doc 春节朋友圈九宫格出圈玩法教程——朋友圈/IG/小红书发九宫格是大众高频社交场景，非假设需求。
2. 接力策略：亲戚关系计算器→随机决策器→花体字生成器的「生活工具」大众流量策略第四步，连续性最强；同时与现有图片压缩/水印/Base64 图片互转形成图片工具簇。
3. JSON 转 TS/Go 连续四轮（9-29 起）被挤下：属「标配无差异」功能（it-tools 系站点人人都有），开发者向、与大众流量策略错位；且 JSON 解析器/JSON-YAML 互转工具簇已兜底，继续列明日备选。
4. 链接去追踪痛点真实但低频（仅在收到带追踪参数的长链接时），单页价值较薄，列明日备选；键盘按键测试场景最窄，继续暂缓。
5. canvas 纯前端分割（上传→预览→3x3 切分→逐张下载/打包），无后端成本，一天可高质量交付；中文 SEO 长尾词（九宫格切图、朋友圈九宫格）竞争小。

**规格**：
1. 上传区：点击选择 + 拖拽上传，支持 JPG/PNG/WebP；上传后前端即时预览原图（canvas 绘制，不上传服务器）。
2. 九宫格预览：自动按中心正方形裁剪，3×3 等分预览拼图效果；提供 3×3 / 2×2 / 1×3 / 3×1 档位切换（默认 3×3）。
3. 下载：每张单独下载（PNG，文件名 grid_1~9.png），逐张小图预览带下载按钮；一键打包下载（JSZip CDN 引入，CDN 失败时降级为逐张下载）。
4. 合成图：另提供「合并成一张九宫格预览图」下载（带白边缝隙，朋友圈直接发一条九宫格效果图）。
5. 注册：`tools/categories.go` 生活工具分类新增工具 ID `nine_grid`，Path `/tools/nine-grid`，Icon `grid_on`，New: true。
6. SEO：title「九宫格切图 - 朋友圈/IG 九宫格拼图在线切图」、description、keywords（九宫格切图、朋友圈九宫格、九宫格拼图）；sitemap 自动生成。
7. 移动端适配：上传按钮大、预览图纵向排列不错乱；大图片在前端按比例缩放后再分割，避免内存爆炸。

**验收标准**：
- [ ] `/tools/nine-grid` 返回 200，首页「生活工具」分类可见入口
- [ ] 上传测试图后 3×3 预览拼合无错位、缝隙均匀；2×2/1×3/3×1 档位切换正常
- [ ] 9 张切图逐张下载可用，文件名正确、内容对应格子
- [ ] 一键打包下载正常（或 CDN 失败时降级逐张下载提示明确）
- [ ] 合成九宫格预览图下载可用
- [ ] 大图（≥4000px）上传不卡死/不崩溃；纯前端，无新增后端接口；`go build` 通过；SEO meta 完整；移动端布局不错乱

**预计改动文件**：`templates/nine_grid.html`（新建）、`static/js/nine-grid.js`（新建）、`tools/categories.go`（注册工具）、`BACKLOG.md`（本小节）。

## 今日任务（2026-10-01 · 产品经理已决策 ✅）

**选定：花体字/特殊字体生成器** — 路由 `/tools/fancy-fonts`（模板 `fancy_fonts`）

**决策理由**：
1. 需求已被验证：GitHub surojet2026/fancy-fonts 趋势 + DEV 社区「7 tools that don't need signup」热帖双重验证，非假设需求。
2. 接力策略：前两日亲戚关系计算器、随机决策器打开「生活工具」大众流量入口的策略已见效，花体字生成器是同一流量策略的第三步——微信/抖音昵称、游戏 ID 的花体字/特殊符号是真实大众需求，中文 SEO 长尾词（花体字生成器、特殊符号昵称）竞争小。
3. JSON 转 TS/Go 连续三轮被挤下：属「标配无差异」功能（it-tools 系站点人人都有），做不出差异化时不应占用每日唯一的交付位；且与现有 JSON 解析器/JSON-YAML 互转已有工具簇兜底，明日再议。
4. 键盘按键测试场景最窄（仅换新键盘/按键失灵时），用户群仅程序员+游戏玩家，暂缓。
5. 纯前端 Unicode 字符映射，单页可高质量交付，开发成本小。

**规格**：
1. 输入框：用户输入任意文本（支持中英文；中文原样输出，英文/数字映射花体），实时生成。
2. 字体风格 ≥ 12 种：粗体/斜体/粗斜体（Unicode 数学字母符号块）、哥特体（Fraktur）、双线体、手写花体（Script）、气泡体（ⒶⒷⒸ）、方框体（🅰🅱）、全宽体（ＡＢＣ）、小型大写、翻转/镜像文字、装饰符号包裹等。
3. 特殊符号区：爱心、星星、箭头装饰模板（如 ꧁༺昵称༻꧂、ʚ昵称ɞ），面向微信/抖音昵称一键复制场景。
4. 每个风格卡片带「复制」按钮，一键复制到剪贴板；复制成功 toast 提示。
5. 纯前端实现：映射逻辑写在 `static/js/fancy-fonts.js`（字符映射表 + 生成函数），模板 `templates/fancy_fonts.html` 引用；无新增后端接口。
6. 注册：`tools/categories.go` 生活工具分类新增工具 ID `fancy_fonts`，Path `/tools/fancy-fonts`，Icon `text_fields`，New: true。
7. SEO：title「花体字生成器 - 特殊字体/特殊符号昵称在线生成」、description、keywords（花体字生成器、特殊符号、昵称符号）；sitemap 自动生成。
8. 移动端适配：输入框+风格列表纵向布局不错乱，大按钮复制。

**验收标准**：
- [ ] `/tools/fancy-fonts` 返回 200，首页「生活工具」分类可见入口
- [ ] 输入 `Hello World 123` 后 ≥12 种风格即时生成，中英文混排不乱码
- [ ] 特殊符号装饰模板正确包裹用户输入
- [ ] 每个风格「复制」按钮可用，复制结果与展示一致；toast 提示正常
- [ ] 常见昵称场景文本（含 emoji、微信昵称长度）测试通过
- [ ] 纯前端，无新增后端接口；`go build` 通过；SEO meta 完整；移动端布局不错乱

**预计改动文件**：`templates/fancy_fonts.html`（新建）、`static/js/fancy-fonts.js`（新建）、`tools/categories.go`（注册工具）、`BACKLOG.md`（本小节）。

## 今日任务（2026-10-02 · 产品调研推荐，待产品经理决策）

**推荐 Top3**（优先高频、单页可实现、契合现有架构，产品经理三选一）：

1. **图片九宫格切图（朋友圈/IG 九宫格）** — 今日调研新发现：wumingluren/LongPicCutter（GitHub 宫格/长图分割独立工具）、shirolin/x-puzzle-kit（社交创意拆分器 3x3 已上线）、Play 商店 Grid Maker、360doc 春节朋友圈九宫格出圈玩法教程，多重验证真实大众需求；接力亲戚关系计算器→随机决策器→花体字生成器的「生活工具」大众流量策略第四步；canvas 纯前端分割+逐张下载/打包，单页可高质量交付。SEO：九宫格切图、朋友圈九宫格、九宫格拼图。
2. **JSON 转 TypeScript / Go 结构体** — 连续三轮「次日备选」（9-29、9-30、10-01）；对接 API 时手写类型定义繁琐易错是开发者高频痛点；与现有 JSON 解析器、JSON-YAML 互转形成工具簇；纯前端递归生成，单页可高质量交付。
3. **链接去追踪（URL 追踪参数清洗）** — 今日调研新发现：fx-k/keke.su 博主专为 B 站/小红书分享链接开发了净化工具并上线在线版、0xzx URLCheck 防跟踪长文、CMO UTM 产生器 Chrome 扩展；分享链接夹带 utm_/fbclid/xsec_token 等追踪参数又长又侵犯隐私；纯前端参数识别+一键清洗，单页可做，开发者与普通用户通用。

## 今日候选（2026-10-02 · 产品调研推荐）

**推荐 Top3**（优先高频、单页可实现、契合现有架构）：

1. **图片九宫格切图** — 今日新发现：LongPicCutter + x-puzzle-kit + Grid Maker + 朋友圈玩法教程多重验证；大众高频社交场景；接力生活工具大众流量策略第四步；canvas 纯前端单页。
2. **JSON 转 TypeScript / Go 结构体** — 连续三轮「次日备选」；对接 API 高频痛点；与 JSON 解析器/JSON-YAML 互转成工具簇；纯前端递归生成。
3. **链接去追踪（URL 追踪参数清洗）** — 今日新发现：B站/小红书分享链接净化工具、URLCheck、UTM 产生器验证需求；追踪参数又长又侵犯隐私；纯前端单页。

---

## 2026-10-02 决策归档（已完成 ✅）

**选定并已实现：图片九宫格切图（朋友圈/IG 九宫格）** — 路由 `/tools/nine-grid`（模板 `nine_grid`），commit fb036b2

**决策理由**：LongPicCutter + x-puzzle-kit + Grid Maker + 朋友圈玩法教程多重验证大众高频社交场景；接力亲戚关系计算器→随机决策器→花体字生成器的「生活工具」大众流量策略第四步；canvas 纯前端分割，与图片压缩/水印/Base64 图片互转形成图片工具簇。

**交付回顾**：上传预览、3×3/2×2/1×3/3×1 档位、逐张下载 + JSZip 打包（失败降级逐张）、合成九宫格预览图下载、大图缩放防卡死；纯前端无新增后端接口（以 commit fb036b2 为准，验收细节见 10-02 规格清单）。

## 2026-09-30 决策归档（已完成 ✅）

**选定并已实现：随机决策器（今天吃什么 / 抛硬币 / Yes-No）** — 路由 `/tools/random-decision`（模板 `random_decision`），commit 52bb442

**决策理由**：V2EX 当日调研两次验证需求（wheelpage.com 抛硬币/转盘帖 t/1173579、t/1173593），是真实需求而非假设；「选择困难症」「今天吃什么」是大众高频痛点；接力前日「生活工具」分类打开大众流量的策略（该分类此前仅亲戚关系计算器 1 个工具）。JSON 转 TS/Go 属「标配无差异」功能、列为次日备选；键盘按键测试场景最窄、暂缓。

**规格**：
1. 三个模式 Tab：①随机抽取（今天吃什么）②抛硬币 ③Yes/No 快问。
2. 随机抽取：选项列表增删改（textarea 批量输入+芯片展示），预设清单（中餐/西餐/轻食/奶茶店），滚动高亮动画开奖，抽奖历史，localStorage 持久化，复制结果。
3. 抛硬币：CSS 3D 翻转动画，正/反计数统计。
4. Yes/No：输入问题+动画揭晓，可复制结论。
5. 注册：`tools/categories.go` 生活工具分类新增 ID `random_decision`，Path `/tools/random-decision`，Icon `casino`，New: true。
6. SEO：title「随机决策器 - 今天吃什么/抛硬币/YesNo 在线抽签」、description、keywords；sitemap 自动生成。
7. 移动端适配：大按钮、动画流畅不卡顿。

**验收标准**：
- [x] `/tools/random-decision` 返回 200，首页「生活工具」分类可见入口
- [x] 随机抽取：增删改选项、预设清单、滚动动画开奖、历史、localStorage 持久化、复制结果均可用
- [x] 抛硬币：翻转动画正常，正/反计数正确
- [x] Yes/No：输入问题后动画揭晓，复制结论可用
- [x] 纯前端，无新增后端接口；`go build` 通过；SEO meta 完整；移动端布局不错乱

> 候选格式：标题 | 痛点 | 难度(小/中/大) | 优先级
> 优先级：P0=今日推荐，P1=高价值备选，P2=可做可不做
> 去重规则：已实现的工具不再进入候选，见文末「已实现」清单。

## 2026-10-01 决策归档（已完成 ✅）

**选定并已实现：花体字/特殊字体生成器**（路由 `/tools/fancy-fonts`，模板 `fancy_fonts`），commit b27e4ae（评审反馈修复 f144802）

**决策理由**：GitHub fancy-fonts 趋势 + DEV「7 tools that don't need signup」热帖双重验证；接力亲戚关系计算器、随机决策器打开「生活工具」大众流量入口的策略第三步——微信/抖音昵称、游戏 ID 的花体字/特殊符号是真实大众需求，中文 SEO 长尾词竞争小；纯前端 Unicode 字符映射，单页高质量交付。

**交付回顾**：≥12 种字体风格实时生成、中文原样输出、中英混排不乱码；特殊符号装饰模板（꧁༺昵称༻꧂ 等）；每个风格一键复制+toast；纯前端无新增后端接口。

## P0 — 今日最值得做（2026-10-08）

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| PDF 合并/拆分 | 连续多日 P0、昨日定为今日首选，今日再验证：DEV 无上传合并文（11 天前/22 小时再抓取）、Medium 无上传合并文（9 小时再抓取）、Zancta 浏览器 PDF 工具套件、DevSpork 热门工具首位、中文网申附件页数限制场景；ToolWeb 仅有 DOC 转 PDF、无 PDF 处理簇；多 PDF 合并、按页拆分/提取是学生办公高频动作；pdf-lib 纯前端不上传，单页可做 | 中 | P0 |
| HEIC / Live Photo 转 JPG | 连续多日 P0 顺延，今日再验证：Medium《5 Free Browser Tools》LivePhotoKit 列首位（近 2 小时再抓取）、中文 HEIC 教程与转换站持续活跃；iPhone HEIC 在 Windows/Android 打不开、发给非苹果用户必转格式；与已上线 EXIF 同属发图前处理簇；纯前端 HEIC 解码→JPG/PNG/WebP 批量导出，单页可做（需评估解码库体积） | 中 | P0 |
| 文本敏感信息打码（分享前脱敏） | 今日新信号：HN/Reddit TinyLocal Tools 以 SafePaste（分享前遮蔽邮箱/手机号/API 密钥类敏感串）切入粘贴前处理；日志/工单/报错/聊天记录外发前泄露隐私是开发者与办公人群高频动作；承接 EXIF 后的隐私处理叙事（图片→文本）；纯前端正则识别→一键遮蔽/替换→前后对比，单页可做 | 小 | P0 |

## P1 — 高价值备选

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 键盘按键测试 | 昨日 P0 保留：新键盘验机、坏键定位；程序员/游戏玩家高频；keydown 纯前端 | 小 | P1 |
| SERP 搜索结果预览 | 今日新发现：Varkido 170+ 工具站 30+ SEO 工具之一；站长发文前预览 Google/Baidu 搜索结果卡片标题+描述效果；纯前端表单+模拟预览，单页可做 | 小 | P1 |
| Meta 标签生成器 | 今日新发现：Varkido SEO 工具簇验证需求；输入标题/描述/关键词→生成 HTML meta+Open Graph 标签；纯前端，单页可做 | 小 | P1 |
| robots.txt 生成器 | 今日新发现：Varkido SEO 工具簇验证需求；可视化配置爬虫规则→生成 robots.txt 下载；纯前端，单页可做 | 小 | P1 |
| 单位换算器 | 长度/重量/温度/数据存储等单位换算查表麻烦 | 小 | P1 |
| URL 参数解析器 | 长 URL 的 query 参数肉眼解析困难，调试接口常用 | 小 | P1 |
| 进制转换器 | 二/八/十/十六进制开发者日常换算 | 小 | P1 |
| 文本转语音朗读 | 长文章校对、听小说需要免提朗读（Web Speech API 纯前端） | 小 | P1 |
| HTTP 状态码速查 | 调试接口时快速查状态码含义，静态数据单页 | 小 | P1 |
| Git 命令速查/生成器 | 非常用 Git 操作记不住参数 | 小 | P1 |
| 取色器（图片取色） | 设计/前端需提取图片中的颜色值 | 小 | P1 |
| CSS 渐变/阴影生成器 | 手写 gradient / box-shadow 参数试错成本高 | 小 | P1 |
| 屏幕与浏览器信息检测 | 买显示器验机、报障时需快速查看分辨率/UA 等参数 | 小 | P1 |
| 屏幕坏点检测 | 买显示器验机必备：全屏纯色切换找坏点，单页纯前端 | 小 | P1 |
| 世界时钟/时区转换 | 跨时区会议换算时间容易出错 | 小 | P1 |
| 工作日计算器 | 算项目排期、调休时手动数工作日麻烦 | 小 | P1 |
| 人民币大写转换 | 财务报销单、合同需大写金额，手写易错；中文 SEO 长尾词 | 小 | P1 |
| 房贷计算器 | 买房前测算等额本息/本金月供压力 | 小 | P1 |
| 个税/工资计算器 | 发薪后想核对到手工资（注意：实现前须核对当年税率政策） | 小 | P1 |
| 随机抽奖/点名器 | 年会/课堂抽奖需要公平随机（年会季 12-1 月流量高峰，现在做正好） | 小 | P1 |
| 倒计时/番茄钟 | 考试/活动倒计时需要可视化展示 | 小 | P1 |
| WiFi 二维码生成器 | 分享 WiFi 密码逐字输入麻烦，扫码直连 | 小 | P1 |
| 手写模拟器 | 中文社交爆款（凹凸工坊/萝卜工坊）：贺卡/信件/手账装饰字需求旺；canvas+手写字体，单页可交付（定位文艺/贺卡场景） | 中 | P1 |
| 座位表生成器 | 婚礼/活动排桌分人繁琐；独立开发者 SEO 金矿案例已验证该细分需求 | 中 | P1 |
| 假数据/Mock 生成器 | 前后端联调缺测试数据（2026-10-03 竞品再验证：faker.tools 79 种合成数据生成器） | 中 | P1 |
| cURL 转代码 | 抓包得到的 cURL 转 Python/Go/JS 代码手写麻烦 | 中 | P1 |
| 链接去追踪（URL 追踪参数清洗） | 连续多轮验证（slug.tools query cleaner、URLCheck、B站/小红书净化工具）但频率低、单页价值薄，10-03 起列备选，今日 Top3 让位图片拼接后顺延 P1 首选；分享链接带 utm_/fbclid/xsec_token/spm 又长又泄露隐私；纯前端黑名单识别+一键清洗+前后对比，单页可做 | 小 | P1 |
| 富文本转 Markdown | Word/网页内容粘贴转 Markdown 写文档、发 GitHub 的痛点；Turndown 纯前端单页 | 小 | P1 |
| OpenGraph 社交卡片预览 | 发微信/微博/Twitter 前预览分享卡片标题图效果；纯前端表单+预览 | 小 | P1 |
| 代码截图美化（Carbon 风格） | 今日新发现：awesome-free-online-tools 将 Carbon/ray.so/codeshot.io 列为 Code images 头部品类；发技术帖/工单时贴纯文本代码难看、截图带 IDE 杂边；纯前端语法高亮主题+窗口壳+PNG/SVG 导出，单页可做（需引入 highlight 库，注意体积） | 中 | P1 |
| 发票/收据生成器 | 今日新发现：Medium《15 Free Online Tools Everyone Should Bookmark in 2026》与 FreeToolHub 190+ 计算器/文件工具均列 Invoice Generator 为文档类头部；自由职业/小商家手做发票排版麻烦；纯前端表单→A4 预览→打印/PDF，单页可做（仅模板生成、不涉税务开票） | 中 | P1 |
| JSON 可视化树图 | 今日新发现：JSON Crack（JSON/YAML/CSV 转交互节点图）被 awesome 列表列为 Data & Testing 头部；深层 JSON 靠折叠文本看结构费眼；纯前端递归树渲染+搜索定位，单页可做；与现有 JSON 解析器互补而非重复 | 中 | P1 |
| 汉字转拼音/注音 | 今日新发现：蛙蛙工具将中文转拼音注音列为招牌功能、CSDN 家长/老师汉字转拼音工具帖（8 天前抓取）验证教育场景——给孩子课文/生字注音靠手写标注太慢；纯前端拼音字典+声调标注（多音字取常用音并标示），单页可做 | 中 | P1 |
| Bcrypt 哈希生成/校验 | 今日新发现：codinganthem 将 Bcrypt Generator 列入 Top tools；开发注册登录功能时生成/校验密码哈希常用，现有 MD5/SHA/AES 工具不覆盖 bcrypt；bcryptjs 纯前端，单页可做 | 小 | P1 |
| Markdown 表格修复 | 今日新发现：HN/Reddit TinyLocal Tools 将 Markdown Table Fixer（修复/格式化 Markdown/CSV/TSV 表格）与文本清理、敏感打码并列；从网页/文档复制的表格粘到 Markdown 里错位破损是写文档高频麻烦；纯前端解析对齐+一键修复，单页可做；与现有 Markdown 预览互补 | 小 | P1 |
| 图片裁剪 | 今日新发现：HN Show HN CropImages（近 4 天抓取，主打浏览器内像素级裁剪、无上传极速完成）、NullUpload 图片工具套件（近 5 天抓取）印证本地图片处理需求；现有图片缩放仅有填宽高的强制裁剪，缺拖拽选框/比例预设（头像/证件/封面）的可视化裁剪；canvas 纯前端，单页可做 | 小 | P1 |

## P2 — 可做可不做

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| 摩斯电码编解码 | 趣味/应急通信场景 | 小 | P2 |
| 打字速度测试 | 想量化自己的打字水平 | 小 | P2 |
| 白噪音生成器 | 专注/助眠需要环境音 | 小 | P2 |
| 在线秒表 | 运动/实验计时 | 小 | P2 |
| 随机分组 | 团队活动、班级分组 | 小 | P2 |
| 抽奖大转盘 | 营销活动、聚会氛围 | 小 | P2 |
| 倒数日 | 纪念日/考试倒数提醒 | 小 | P2 |
| BMI/健康计算器 | 通用健康自测 | 小 | P2 |
| 年龄/生肖/星座计算 | 通用趣味查询 | 小 | P2 |
| 图片转 ASCII Art | 趣味玩法 | 小 | P2 |
| SVG 占位图生成器 | 开发时需要占位图 | 小 | P2 |
| User-Agent 解析 | 判断访客设备/浏览器 | 小 | P2 |
| 网站连通性检测 | 快速测网站能否访问（浏览器直连即可实现） | 小 | P2 |
| 轻量简历预览（Markdown 简历→A4 预览/打印） | Word 改简历调版式崩溃；V2EX 极简简历工具帖（xukz.cn）验证痛点；纯前端可做轻量版（重型 AI 润色版暂缓） | 中 | P2 |
| 证件照换底色 | 红/白/蓝底互换不想跑照相馆；纯前端色键抠图效果差，真做好需 AI 抠图（后端成本高），暂缓 | 大 | P2 |
| Whois 查询 | 查域名注册信息（需外部接口/后端代理） | 中 | P2 |
| 文本分享（pastebin） | 临时分享文本片段（需后端存储） | 中 | P2 |
| 邮箱提取器 | 从文本批量提取邮箱地址；正则纯前端单页 | 小 | P2 |
| GIF 压缩/裁剪 | 今日新发现：norito 92 工具站最近主推整套 GIF 工具（maker/帧级去重压缩/resizer/splitter/captioning）；表情包/录屏 GIF 太大发不出去；canvas + gif 解析纯前端可做轻量版（压缩质量控制难，先列 P2 观察） | 中 | P2 |
| 音频剪切（MP3 裁剪） | 今日新发现：awesome-no-signup-tools 收录 Audio Cutter Online（切/拼/淡入淡出、全本地）；截铃声/播客片段要装软件；Web Audio API 纯前端单页可做轻量版 | 中 | P2 |
| .gitignore 生成器 | 今日新发现：HN DevKit 将 .gitignore 列入 Generate 类；新建项目要按语言/IDE/系统拼忽略规则，手写易漏；静态模板勾选组合，纯前端单页 | 小 | P2 |
| WCAG 颜色对比度检查 | 今日新发现：codinganthem Color Contrast Checker、HN DevKit Test 类均收录；前端/设计选文字配色要验对比度是否达 WCAG 可读标准；纯前端计算对比度+达标评级，单页可做 | 小 | P2 |

## 已实现（不再进入候选）

~~JSON 解析器~~、~~XML 格式化~~、~~SQL 格式化~~、~~Base64 编解码~~、~~URL 编解码~~、
~~二维码生成+识别~~、~~条形码生成器~~、~~Base64 图片互转~~、~~图片压缩/转换/缩放~~、
~~图片水印~~、~~AES/DES/RSA 加解密~~、~~MD5/SHA1/SHA256~~、~~JWT 解析~~、
~~正则测试~~、~~文本对比~~、~~文本工具集~~、~~Markdown 预览~~、~~HTML 实体~~、
~~随机密码生成器~~、~~UUID 生成器~~、~~时间戳转换~~、~~Cron 解析器~~、
~~日历~~、~~颜色转换~~、~~chmod 计算器~~、~~子网计算器~~、~~IP 查询~~、
~~我的 IP~~、~~DNS 查询~~、~~SSL 检查~~、~~Ping~~、~~端口扫描~~、~~域名检查~~、
~~短链接~~、~~API 测试（Postman）~~、~~CSV-JSON 互转~~、~~JSON-YAML 互转~~、
~~个人剪贴板/文件/中转~~、~~电子书~~、~~3D 地形图~~、~~快速排序可视化~~、~~文档转 PDF~~、
~~亲戚关系计算器~~（2026-09-29 实现，commit 973eb88）、
~~随机决策器~~（2026-09-30 实现，commit 52bb442）、
~~花体字生成器~~（2026-10-01 实现，commit b27e4ae，修复 f144802）。
~~九宫格切图~~（2026-10-02 实现，commit fb036b2）、
~~图片打码/马赛克~~（2026-10-03 实现，commit 90fa8c8）、
~~JSON 转 TypeScript / Go 结构体~~（2026-10-04 实现，commit 53d07ef，路由 /tools/json-to-types）、
~~AI Token 计数器~~（2026-10-05 实现，commit d0bf771，路由 /tools/ai-token-counter，新开 AI 工具分类）、
~~图片拼接/长图拼接~~（2026-10-06 实现，commit f513cf3，路由 /tools/img-stitch）。
~~EXIF 信息查看/清除~~（2026-10-07 实现，commit 9061653，路由 /tools/exif-strip）。
~~PDF 合并/拆分~~（2026-10-09 实现，路由 /tools/pdf-merge-split；10-14 追加「按区间拆分」8cc183f）、
~~PDF 转图~~（2026-10-09 实现，路由 /tools/pdf-to-image）、
~~PDF 加水印~~（2026-10-10 实现，a13db05，路由 /tools/pdf-watermark）、
~~OCR 图片文字识别~~（2026-10-11 实现，480771b，路由 /tools/ocr-image-text）、
~~图片批量转 PDF~~（2026-10-12 实现，5c389c6，路由 /tools/images-to-pdf）、
~~PDF 批注打码~~（2026-10-13 实现，5164e11，路由 /tools/pdf-annotate）、
~~PDF 页面管理~~（2026-10-13 实现，5359dfd，路由 /tools/pdf-manage）、
~~PDF 加密/解密~~（2026-10-13 实现，2d7fba2，路由 /tools/pdf-encrypt）、
~~PDF 压缩~~（2026-10-14 实现，e35387c，路由 /tools/pdf-compress）、
~~PDF 转 Word（文本提取版）~~（2026-10-14 实现，5252fe2/2a0e67f，路由 /tools/pdf-to-word，已部署 /tool-web 并通过 QA）、
~~扫描件/图片转 Excel~~（2026-10-14 实现，8173fa3/ab36fab，路由 /tools/image-to-excel，已部署 /tool-web 并通过 QA）。

## 2026-09-29 决策归档（已完成 ✅）

**选定并已实现：亲戚关系计算器**（路由 `/tools/relationship-calculator`）

**决策理由**：三个 P0 候选中唯一需求已被市场验证（2026 年春节「亲戚称呼计算器」App 爆红，非假设需求）；中文亲戚称谓是 SEO 长尾搜索金矿，能带来站外自然流量；现有工具全为开发者向，这是打开大众流量入口的第一块砖；纯前端实现（移植 yugongwen/relationship 开源算法，MIT 协议，保留版权声明），无后端成本，一天可高质量交付。JSON 转 TS/Go 属"标配无差异"功能、列为次日备选；键盘按键测试价值最薄、暂缓。

**规格**：
1. 正向计算：输入关系链（如"爸爸的妈妈的弟弟"或点选输入），输出标准称谓（如"舅公"）；多结果并列展示（如"堂哥/表哥"）；展示南北/口语别名（如"姥爷/外公"）。
2. 反向查询：输入称谓（如"我叫他舅妈"），反推可能的关系链列表。
3. 快捷输入：父/母/兄/弟/姐/妹/夫/妻/子/女点选按钮，支持回退、清空、复制结果。
4. 算法：移植 yugongwen/relationship 关系链数据与匹配逻辑至 `static/js/relationship.js`（MIT，需保留版权声明）；覆盖三代以内常见关系。
5. 注册：`tools/categories.go` 新增分类"生活工具"（life），工具 ID `relationship`，Path `/tools/relationship-calculator`，Icon `family_restroom`，New: true（通用路由 `/tools/:tool` 自动映射模板，无需新增 Go 路由）。
6. SEO：title「亲戚关系计算器 - 亲戚称谓查询」、description、keywords（亲戚称呼计算器、亲戚关系查询、叫什么）；sitemap 自动生成，无需手动改。
7. 移动端适配：大按钮点选布局（春节/聚会手机使用场景）。

**验收标准**：
- [ ] `/tools/relationship-calculator` 返回 200，首页"生活工具"分类可见入口
- [ ] 正向：20 组三代以内常见关系链测试 100% 正确（爸爸的爸爸→爷爷、妈妈的姐妹→姨妈、爸爸的哥哥→伯父、妻子的弟弟→小舅子、老公的妈妈→婆婆等）
- [ ] 反向：输入"舅妈"能反推出多条可能关系链
- [ ] 点选输入、回退、清空、复制结果功能可用；移动端布局不错乱
- [ ] 纯前端，无新增后端接口；`go build` 通过；SEO meta 完整

**预计改动文件**：`templates/relationship_calculator.html`（新建）、`static/js/relationship.js`（新建）、`tools/categories.go`（新增分类+注册）、`BACKLOG.md`（本小节）。

## 调研来源

### 2026-10-08
- DEV《How to Merge PDF Files Without Uploading Them Anywhere》（11 天前，pdf-lib 本地合并、拖拽排序）、DEV OpenPDF Hub 合并文（22 小时内再抓取）、Medium 无上传 PDF 合并文（9 小时内再抓取）、GitHub Zancta Show HN 稿（浏览器内 merge/split/compress/EXIF/OCR 套件，pdf-lib/PDF.js 本地处理）、开源工具箱 DevSpork（PDF Merge/Split/Compress 列 Most popular tools 首位）、中文 2026 PDF 在线拆分教程（网申附件页数限制、合同提取页场景）→ PDF 合并/拆分连续多日 P0，今日 Top1
- Medium《5 Free Browser Tools I Built for Everyday Problems》（近 2 小时再抓取，LivePhotoKit 列首位：HEIC/Live Photo 转 JPG/PNG/WebP/MP4）、中文 HEIC 转 JPEG 教程与 heicx 转换站 → HEIC / Live Photo 转 JPG 今日再验证，稳居 Top2
- Hacker News/Reddit TinyLocal Tools 发布稿（近 7 天抓取：PasteFix 粘贴文本清理、SafePaste 分享前敏感信息遮蔽、Markdown Table Fixer 表格修复，全本地无上传）→ 文本敏感信息打码新候选升今日 Top3，Markdown 表格修复新增 P1
- Hacker News Show HN CropImages（近 4 天抓取：浏览器内像素级裁剪、无上传）、Show HN NullUpload（近 5 天抓取：本地图片压缩/转换/缩放/元数据清除套件）→ 图片裁剪新增 P1（与现有缩放强制裁剪互补），本地图片处理路线再印证
- DEV 本地优先开发者工具文（近 1 天抓取：强调用 DevTools Network 自查工具是否上传输入数据）→ 印证纯前端无上传路线与隐私文案卖点，现有候选池方向无误
- 复核 tools/categories.go（55 个已注册工具）与 templates 清单、git log：EXIF 信息查看/清除已上线（9061653）归档划掉；PDF 合并/拆分、HEIC 转换仍未实现

### 2026-10-07
- Imagera《Remove EXIF & GPS Location From a Photo》（近 3 小时再抓取：先展示 GPS/机型/时间再清除）、zbmbase/photo-metadata-viewer（EXIF/IPTC/GPS 查看+编辑+批量清除、全本地）、itsjustadarsh/scrub（11 天前：字节级剥离 EXIF/GPS/XMP/IPTC 而非重编码）、NakliTechie/StripLocal、PrivacyStrip（2026-02 发布）→ EXIF 查看/清除今日再验证，升今日 Top1
- DEV OpenPDF Hub《Merge PDFs Without Uploading Them Anywhere》（约 31 天前：无上传合并/拆分/压缩）、DEV PDF Splitter/PDF Merger 系列（pdf-lib + JSZip 纯前端、按页/范围拆分）、DEV 学生工具箱 Toolbench（38 工具含 PDF merge/split/image-to-PDF，pdf-lib 实现）、Medium《15 Free Online Tools》（PDF Merger 列文档类头部）、中文 PDF 合并测评（2026-04：报名材料/合同/发票整理场景）→ PDF 合并/拆分今日再验证，稳居 Top2
- Medium《5 Free Browser Tools I Built for Everyday Problems》（2026-07-12，近 5 小时再抓取：LivePhotoKit 列首位，HEIC/Live Photo 浏览器内转换）、DEV 多篇 HEIC→JPG/PDF 教程（Windows 打不开 iPhone 照片、WASM 解码全本地批量转换）、HEICtoJPEG/Vidmore/CloudConvert 等转换站持续活跃 → HEIC/Live Photo 转 JPG 由 P1 首选升今日 Top3
- awesome-no-signup-tools（18 天前更新：Audio Cutter/CharCount/FreeToolHub 190+ 工具等无注册纯前端清单）、DEV 无注册开发者工具合集（CSS 渐变/JSON/正则等与本站已有工具重合）→ 印证纯前端无上传路线，现有候选池方向无误，不新增重复候选
- 复核 tools/categories.go（54 个已注册工具）与 templates 清单、git log：图片拼接已上线（f513cf3）归档划掉；EXIF、PDF 合并/拆分、HEIC 转换仍未实现

### 2026-10-06
- forjiang/image-metadata-cleaner（9 天前：批量清 EXIF/GPS/XMP/IPTC/ICC、逐项日志、ZIP 打包、全本地）、unfoldingdimensions/capytools CapyStrip 实施计划（目标词 remove exif data / photo metadata viewer / strip gps、浏览器端清除）、NakliTechie/StripLocal 与 lhfer/image-fingerprint-remover（扩展到 C2PA/内容凭证与 AI 生成提示块清除）、中文 PixPix EXIF 长文（2026-09-19：GPS/作者为隐私风险高亮、本地不上传）→ EXIF 查看/清除五重再验证，稳居今日 Top2；AI 指纹清除作为差异化加分项记录，不扩大 v1 范围
- njp86/imagetoolbox（Image Stitching 与 Splitting/EXIF 编辑同列核心图片能力）、昨日 Stitch It/Media.io/web-collage/snapstitch 信号延续 → 图片拼接/长图拼接顺延后升今日 Top1，与九宫格拆分互补
- ToolSura《Best Free Developer Tools 2026》（11 天前更新：PDF 与 JSON/正则/JWT 同列日常标配）、Tooliest 浏览器工具综述（PDF 合并/拆分/保护为唯一无上传选项）、NoUploadTools（Merge PDFs 列入 PDF 工具组）、Medium《15 Free Online Tools》（2026-09-19：PDF Merger + Invoice Generator 列文档类头部）→ PDF 合并/拆分由 P1 升今日 Top3，补 ToolWeb 文档簇缺口
- DEV《8 free, no-signup web tools I built with AI in 2026》与 Medium《5 Free Browser Tools》（LivePhotoKit 两处独立出现：HEIC/Live Photo 转 JPG/PNG/WebP 或提取 MP4、全本地）→ HEIC/Live Photo 转 JPG 由 P2 升 P1 首选备选
- Hacker News Show HN DevKit（80 个浏览器端工具：Token counter 已由本站实现，.gitignore/CSP/Color Contrast 等 Generate/Test 类与本站 P1/P2 候选一致）、ToolVerve/UtlKit 纯前端工具站持续活跃 → 印证纯前端无上传路线，现有候选池（.gitignore 生成器、颜色对比度检查、SERP/Meta）方向无误，不新增重复候选
- 复核 tools/categories.go 已注册 50+ 工具与 templates 清单：AI Token 计数器已上线（d0bf771）归档划掉并从 P0 清除；图片拼接、EXIF、PDF 合并仍未实现

### 2026-10-05
- DEV《I Built a Token Counter That Works Offline — 19 Models, File Drop, Cost Estimator》（19 模型实时计价 GPT-4o/4.1/o3、Claude 3.7/3.5、Gemini 2.5/2.0、DeepSeek/Llama/Mistral/Qwen，上下文窗占用条+token 着色可视化+文件拖入，±5% 近似足够预算场景）、pramilk/dev-microtools《LLM Token Counter & API Cost Estimator》（2026-08-29 更新，GPT-5/Claude/Gemini 精确分词说明：OpenAI 公开 BPE 可精确、Claude/Gemini 未公开只能明示估算）、mattbusel/llm-cost（9 天前，12 模型比价+预算守卫，价格核对 2026-09-25）、chris-dyson/ai-token-calculator（15 模型实时成本）、vibingtalk TokenSave（6 天前，GPT-6/Claude Sonnet 5.5/Gemini 3.1 计价+非英语 token 溢价仪表+一键清洗）→ AI Token 计数器七重验证、观察期满升今日 Top1
- Stitch It 2.3.0（APKMirror：聊天/收据/订单截图拼一张长图+接缝裁剪+打码）、Media.io Free Photo Stitch（16 小时前抓取：纵向截图拼接/商品并排/前后对比/全景五场景）、GitHub ongxeno/web-collage（canvas 多图合并+拖拽排序+PNG 导出）、prathameshmore07/snapstitch（19 天前，截图批量拖入/粘贴→自动排序→导出 docx/pdf）→ 图片拼接/长图拼接再验证，昨日簇失衡暂缓理由已消解
- itsjustadarsh/scrub（9 天前，浏览器字节级剥离 EXIF/GPS/XMP/IPTC 而非重编码、像素无损）、NakliTechie/StripLocal（拖入清 GPS/时间/机型/序列号，canvas 重绘+EXIF 方向校正）、toolio EXIF Metadata Remover（6 天前，无上传清 GPS/机型/时间戳）、burakoskay EXIF Metadata Remover Skill（4 天前，11 语言）、PhotoAITagger/Pixvisor 隐私清洗（GPS 单独清、保留版权的选择性清洗）→ EXIF 查看/清除新候选升 P0
- DEV《I built 79 free developer tools with Astro》（2 天前：SERP Preview 像素宽计量、Extract Regex Matches 预设邮箱/URL、UULE Generator；作者自述 Search Console 显示 Google Search URL 生成器与 2FA 工具曝光最高，继续加码 search/dev 簇）、ToolOrbit 100+ 工具清单（8 天前：Meta Tag Generator、SERP Snippet Preview、Sitemap Generator、UTM Builder、PDF 合并/拆分标配）、DEV《I built 40 free developer tools》（3 天前：cURL→fetch/axios、JSON Schema validator、byte size、HTTP 状态码/MIME 参考）→ SERP/Meta/PDF/cURL 备选信号再确认，均列 P1
- GitHub 复核：JSON 转 TypeScript/Go 已上线（53d07ef，templates/json_to_types.html + tools/categories.go 注册 json_to_types）归档划掉并清除 P0 重复行；AI Token、图片拼接、EXIF、链接去追踪、键盘按键测试仍未实现

### 2026-10-04
- GitHub uditalias/json.my 博客《Generate TypeScript from JSON》（3 天前抓取：嵌套接口拆分、可选字段、联合类型推断）、Ghost-Sellz/JSONCraft（JSON→TypeScript/Go/Rust/Zod/Prisma 浏览器内转换）、rahulgo8u/codinganthem 工具箱（JSON to TypeScript 列入 Converters、Token Counter & Estimator 列入 AI 类、Bcrypt/Meta Tag 列入 Top tools）→ JSON 转 TS 再验证 + Token 计数器/Bcrypt 新信号
- Hacker News Show HN「DevKit – 80 browser-based developer tools, no signup, all client-side」（3 天前抓取：AI & ML 类 Token counter、Generate 类 .gitignore/CSP、Test 类 Color Contrast）与「UtlKit 170+ 工具」→ 纯前端路线再印证与新候选信号
- GitHub ricodane/ai-token-counter（44 天，多模型 token 计数+费用估算扩展）、cerokuo/token-lens、Chrome 商店 Claude Token Counter（31 天）、BedirT/LLM-Token-Counter-VSCode、openmachineware/tokl（4 天前，13 个 LLM 分词计数）→ AI Token 计数器六重独立信号
- Adobe Express 在线合并图片（7 天前抓取）、360doc 实用网站清单 Photo Collage Maker 在线拼图、CSDN uniapp 长图拼接小程序（canvas 纵/横拼接）、App Store Tailor 拼截图（聊天记录拼长图）→ 图片拼接/长图拼接大众需求验证
- 中文工具站复盘：即时工具 67tool（视频/音频/PDF/图片全品类）、蛙蛙工具（中文转拼音注音为招牌功能）、CSDN 汉字转拼音工具帖（家长/老师给孩子注音场景，8 天前抓取）→ 汉字转拼音新候选
- 链接去追踪复核：0xzx URLCheck 防跟踪长文与既有 slug.tools/B站小红书净化信号仍在，但「低频、单页价值薄」判断不变，顺延 P1 首选备选
- 复核现有 51 个已注册工具（tools/categories.go）与模板清单：图片打码/马赛克已上线（90fa8c8）归档划掉并清除 P0/P1 重复行；JSON 转 TS、链接去追踪、键盘按键测试仍未实现

### 2026-09-29
- V2EX「有没有让你发出 WC，还有这样的网站」帖（t/949936）、V2EX 求工具/效率工具讨论
- Hacker News tiny tools / Show HN 趋势
- 竞品工具站：it-tools 系（含 re-beichen/ittools 36 工具清单）、chicogong/html-tools
- 独立开发者 SEO 金矿案例：SeatingChartGenerator（座位表生成器）、Pixonara（提示词图库）
- 中文搜索热词：亲戚关系计算器（2026 春节爆红）、证件照换底色、个税计算器
- 开源算法参考：yugongwen/relationship（亲戚关系计算）

### 2026-10-01
- GitHub surojet2026/fancy-fonts（Unicode 花体字/特殊字体生成器趋势）、DEV 社区「We got tired of 'free' tools that make you sign up, so we built 7 that don't」（misc9.app：PDF 合并/拆分、HEIC 转换、证件照工具验证需求）
- DEV 社区「How I Built 170+ Free Online Tools」（Varkido：图片区域打码/马赛克、Open Graph 与 SEO 工具清单）
- nologin-tools/awesome-nologin-tools（textkit 邮箱提取器等无登录文本工具）
- GitHub muhammad-waqas1/rich-text-markdown-converter（富文本/Word 转 Markdown 痛点）
- v2ex.top 2026-09-29 日报扫描（local-figma、微信图片丢失等帖子；无直接可单页化的新工具信号）

### 2026-10-02
- GitHub wumingluren/LongPicCutter（长图片/宫格分割在线工具）、shirolin/x-puzzle-kit（社交创意拆分器 3x3 九宫格）、Play 商店 Grid Maker、360doc 春节朋友圈九宫格玩法教程 → 验证九宫格切图大众需求
- GitHub fx-k/keke.su（B 站/小红书分享链接净化工具，在线版 fwd.pp.ua/clean）、0xzx URLCheck 防跟踪文章、CMO UTM 產生器 Chrome 扩展 → 验证链接去追踪需求
- DEV「I built 70+ free web tools, no signup required」（SiteIndex：Website Score SEO 审计、PDF/图片/文本工具）、DEV「How I Built 170+ Free Online Tools」（Varkido：SERP 预览、Meta 标签生成器、robots.txt 生成器等 SEO 工具簇；图片打码、取色器已验证）→ 验证 SEO 工具簇需求
- GitHub zio-tibia/aghazain10 awesome-no-signup-tools（无注册工具精选清单：元数据清除、AVIF/HEIC 转 JPG、番茄钟、密码生成器等）
- Hacker News Show HN「Free online tools that run in the browser」（UtlKit 170+ 纯前端工具）→ 印证纯前端路线
- V2EX 2026-03/07 日报复盘（reducm/hugo-jasjojo）：出海远程工作者英文润色工具热帖（需 AI 后端，不适合单页）、Qwen Image 3 工具站 SEO 占位
- 确认现有文本工具集已含字数统计（不重复造轮子）

### 2026-10-03
- awesome-free-online-tools（abdessamadbettal）/ awesome-browser-tools（285 ToolsFam 索引）：transform.tools（JSON→TypeScript 核心转换）、slug.tools（query cleaner + UTM builder + URL parser + SERP preview 工具包）、Carbon/ray.so/codeshot.io（代码截图美化）、JSON Crack（JSON 可视化树图）、faker.tools（79 种 Mock 数据）→ 再验证 JSON 转 TS、链接去追踪，新增代码截图/JSON 树图候选信号
- DEV《How to Convert JSON to TypeScript Interfaces Automatically》+ jsontoall.tools/json-to-interface（嵌套接口自动拆分、client-side）→ JSON 转 TS 需求长文级验证
- GitHub shubhmisaki/norito-devtoolbox（92 工具、Show HN 文案）：PDF/图片/GIF 全套（帧级去重压缩、splitter、captioning）全本地处理 → 图片打码同簇与 GIF 工具信号
- Medium Topaitools《15 Free Online Tools Everyone Should Bookmark in 2026》（2026-09-19）：Invoice Generator、PDF Merger、Unit Converter、Word Counter、Loan EMI 等大众工具清单 → 发票生成器新增候选信号
- ToolSura《Best Free Developer Tools 2026》+ PlainToolbox 87 工具（YouTube 介绍）：JSON formatter / regex / JWT / diff / CSS box-shadow·gradient 生成器为高频入口 → 印证现有工具簇方向与 CSS 生成器 P1 保留
- aghazain10/awesome-no-signup-tools：Audio Cutter Online（全本地音频剪切）、CharCount → 音频剪切 P2 信号
- 复核现有 50 个已注册工具（tools/categories.go）与模板清单：九宫格切图已上线（fb036b2）归档划掉；JSON 转 TS、链接去追踪仍未实现，图片打码仍为候选

### 2026-09-30
- V2EX「做了一个抛硬币网站 - 用最简单的方式做决定」（t/1173579、t/1173593，两度发帖，wheelpage.com 转盘/抛硬币）
- V2EX「xukz.cn — 做了一年的极简在线简历工具，求 V 友拍砖」（t/1210967：Word 改简历调版式崩溃痛点）
- Hacker News Show HN「Free online tools that run in the browser」（UtlKit，170+ 全浏览器本地工具、无需注册；印证纯前端路线）
- 中文推荐清单：手写模拟器（凹凸工坊 autohanding.com / 萝卜工坊，文档→手写稿爆款）、智能图表、在线工具集 3171.CN


## ⚠️ 待修复（2026-10-16 12:30 浏览器端到端实测 · 已回滚）
**HEIC 转 JPG（/tools/heic-convert）转换链路在真实浏览器中必现失败**：真实 Chromium 上传真实 HEIC（strukturag/example.heic 718KB）→ 点「开始转换」→ 页面报错「解码组件加载失败（CDN 与本地兜底均不可用）：未知错误」，两次复现。页面加载/上传交互/首页入口均正常，脚本层 QA 10 项全 PASS，Node 端解码验证通过，公网 vendor 文件（libheif.js 91KB、libheif.wasm 1422377B、application/wasm）与分支提交逐字节一致 —— 故障点在浏览器内 libheif-js 1.23.2 emscripten 工厂实例化环节（CDN 与 vendor 同式失败，「未知错误」= 空 message 的字符串 throw，疑 wasm 初始化）。
**处置**：/tool-web 已回滚到上一版二进制（toolWeb.bak-prev，首页不再收录 heic-convert；注：模板走磁盘 LoadHTMLGlob，旧二进制重启仍会渲染工作区新模板，直接 URL 可达但功能损坏——重新部署前勿宣传该 URL）。下一轮产品经理请把「排查 heic-convert libheif 加载链（先在真机浏览器开 console 拿真实报错）」列为优先修复任务，而非新工具。

**[P0] 图片水印工具（/tools/watermark）中文静默丢字**（2026-10-18 代码实测确认）：`static/ttf/` 共 22 个字体文件，全部为 DejaVu 家族（DejaVuSans/Serif/Mono/Condensed，无任何中文字形）；`templates/watermark.html:122` 默认选中 `DejaVuSans.ttf`；`tools/watermark.go` 经 freetype 渲染，缺字形时静默跳过、无任何告警。用户打「张三 138xxxx」这类中文姓名电话水印时会直接丢字。
**修复方向**：引入一款开源中文字体（思源黑体子集化等）放入 `static/ttf/` 并设为默认，或在缺字形时给出明确告警。请产品经理排一轮缺陷修复。

**[P0] 二维码工具（/tools/qrcode）「识别」入口为假功能**（2026-10-18 代码实测确认）：工具描述写「生成和识别二维码」，但 `tools/qrcode.go:111-112` 解码接口直接返回 `"二维码解码功能尚未实现"` —— 前端走完上传流程 API 返回成功，内容却是空的，用户以为识别成功实则什么都没得到。
**修复方向**：接入真实解码（纯前端 jsQR / 纯 Go 解码库）或下线该入口，避免误导。请产品经理排一轮缺陷修复。
