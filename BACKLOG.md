# ToolWeb 需求 Backlog

> 维护人：产品调研员 · 每日更新（2026-10-08）

## 今日候选（2026-10-08 · 产品调研推荐）

**推荐 Top3**（优先高频、单页可实现、契合现有架构）：

1. **PDF 合并/拆分** — 连续多日 P0、昨日决策已定为今日 P0 首选，今日再获强信号：DEV《How to Merge PDF Files Without Uploading Them Anywhere》（11 天前，pdf-lib 本地合并）、DEV OpenPDF Hub 合并文（22 小时内再抓取）、Medium 无上传合并文（9 小时内再抓取）、GitHub Zancta《PDF/image tools that run in the browser》Show HN 稿（merge/split/compress 全本地）、开源工具箱 DevSpork 将 PDF Merge/Split/Compress 列「Most popular tools」首位；中文 2026 PDF 拆分教程点名网申附件页数限制、合同提取页等刚需场景。ToolWeb 文档分类仅有 DOC 转 PDF，此为补齐文档刚需锚点、开辟 PDF 处理簇。实现：pdf-lib 纯前端（文件不上传），拖拽排序→合并导出 / 按页范围拆分，单页可做（中难度）。SEO：PDF合并、PDF拆分、PDF在线合并、PDF页面提取。
2. **HEIC / Live Photo 转 JPG** — 连续多日 P0 顺延，今日再验证：Medium《5 Free Browser Tools》（近 2 小时再抓取）仍将 LivePhotoKit 列首位（HEIC/Live Photo 浏览器内转 JPG/PNG/WebP/MP4）、中文 HEIC 教程与 heicx 转换站持续活跃；iPhone 默认 HEIC 在 Windows/Android/老系统打不开是跨设备高频痛点，与已上线 EXIF 同属「发图前处理」簇、可互链。实现：纯前端 HEIC 解码（WASM/heic 库）→ JPG/PNG/WebP 导出、批量转换，单页可做（中难度，需评估解码库体积）。SEO：HEIC转JPG、HEIC转换、iPhone照片转JPG、Live Photo转视频。
3. **文本敏感信息打码（分享前脱敏）** — 今日新信号：Hacker News/Reddit 本地优先工具 TinyLocal Tools（近 7 天抓取）以 PasteFix（粘贴文本清理）+ SafePaste（分享前遮蔽邮箱/手机号/API 密钥类敏感串）+ Markdown 表格修复切入「粘贴到别处之前」的日常瞬间；把日志、工单、报错、聊天记录发给同事/AI/论坛前先脱敏是开发者与办公人群高频隐私动作，承接昨日 EXIF 落地后的「隐私处理」叙事从图片扩展到文本。实现：纯前端正则识别邮箱/手机号/身份证/银行卡/密钥模式→一键遮蔽或替换占位符→前后对比与一键复制，单页可做（小难度）。SEO：文本脱敏、敏感信息打码、日志脱敏、隐私信息遮蔽。

**备选顺延**：Markdown 表格修复（P1，与脱敏同源新信号）、图片裁剪（P1，HN CropImages 新信号，与现有缩放的强制裁剪互补）、链接去追踪（低频薄价值，P1）、cURL 转代码（中难度 P1）、SERP/Meta 标签生成器（SEO 簇 P1）、人民币大写转换、单位换算器、WiFi 二维码生成器、键盘按键测试。

**昨日交付核对**：EXIF 信息查看/清除已上线（commit 9061653，`/tools/exif-strip`），自候选划掉并归入已实现。

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
