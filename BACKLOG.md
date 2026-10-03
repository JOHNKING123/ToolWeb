# ToolWeb 需求 Backlog

> 维护人：产品调研员 · 每日更新（2026-10-03）

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

## P0 — 今日最值得做（2026-10-03）

| 标题 | 痛点 | 难度 | 优先级 |
|---|---|---|---|
| JSON 转 TypeScript / Go 结构体 | 今日再验证：transform.tools 核心转换、DEV JSON→TS interface 长文 + jsontoall 在线工具、ToolsFam Universal Data Converter 主打 JSON→TS；连续四轮备选（9-29 起）；对接 API 手写类型定义繁琐易错；与 JSON 解析器/JSON-YAML 互转/CSV-JSON 成工具簇；纯前端递归推断嵌套接口/数组合并，单页可做 | 小 | P0 |
| 链接去追踪（URL 追踪参数清洗） | 今日再验证：slug.tools 将 query cleaner 与 UTM builder/URL parser/SERP preview 打成 URL 工具包（awesome-free-online-tools 收录）；昨日 B 站/小红书净化工具 + URLCheck 已验证；分享链接带 utm_/fbclid/xsec_token/spm 又长又泄露隐私；纯前端黑名单识别+一键清洗+前后对比，单页可做；开发者+普通用户通用 | 小 | P0 |
| 图片打码/马赛克工具 | Varkido 170+ 工具站热门图片工具、norito 92 工具站图片品类、中文「发图前处理/去水印擦除」清单反复验证；发截图/照片前遮车牌、人脸、手机号、订单号是隐私刚需；canvas 框选+马赛克/模糊+下载，纯前端单页；与水印/压缩/九宫格成图片隐私工具簇 | 小 | P0 |

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
| EXIF 信息查看/清除 | 发照片前怕泄露拍摄地点、设备等隐私信息 | 小 | P1 |
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
| 图片打码/马赛克工具 | 发微信/朋友圈前遮车牌、人脸等隐私信息；canvas 区域选择+马赛克/模糊，纯前端单页（Varkido 热门图片工具验证需求） | 小 | P1 |
| 富文本转 Markdown | Word/网页内容粘贴转 Markdown 写文档、发 GitHub 的痛点；Turndown 纯前端单页 | 小 | P1 |
| PDF 合并/拆分 | 多个 PDF 合并、按页码提取（pdf-lib 纯前端，misc9.app 热帖验证需求） | 中 | P1 |
| OpenGraph 社交卡片预览 | 发微信/微博/Twitter 前预览分享卡片标题图效果；纯前端表单+预览 | 小 | P1 |
| 代码截图美化（Carbon 风格） | 今日新发现：awesome-free-online-tools 将 Carbon/ray.so/codeshot.io 列为 Code images 头部品类；发技术帖/工单时贴纯文本代码难看、截图带 IDE 杂边；纯前端语法高亮主题+窗口壳+PNG/SVG 导出，单页可做（需引入 highlight 库，注意体积） | 中 | P1 |
| 发票/收据生成器 | 今日新发现：Medium《15 Free Online Tools Everyone Should Bookmark in 2026》与 FreeToolHub 190+ 计算器/文件工具均列 Invoice Generator 为文档类头部；自由职业/小商家手做发票排版麻烦；纯前端表单→A4 预览→打印/PDF，单页可做（仅模板生成、不涉税务开票） | 中 | P1 |
| JSON 可视化树图 | 今日新发现：JSON Crack（JSON/YAML/CSV 转交互节点图）被 awesome 列表列为 Data & Testing 头部；深层 JSON 靠折叠文本看结构费眼；纯前端递归树渲染+搜索定位，单页可做；与现有 JSON 解析器互补而非重复 | 中 | P1 |

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
| HEIC 转 JPG | iPhone 照片 HEIC 格式转通用 JPG（可并入图片转换工具簇） | 小 | P2 |
| GIF 压缩/裁剪 | 今日新发现：norito 92 工具站最近主推整套 GIF 工具（maker/帧级去重压缩/resizer/splitter/captioning）；表情包/录屏 GIF 太大发不出去；canvas + gif 解析纯前端可做轻量版（压缩质量控制难，先列 P2 观察） | 中 | P2 |
| 音频剪切（MP3 裁剪） | 今日新发现：awesome-no-signup-tools 收录 Audio Cutter Online（切/拼/淡入淡出、全本地）；截铃声/播客片段要装软件；Web Audio API 纯前端单页可做轻量版 | 中 | P2 |

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
~~九宫格切图~~（2026-10-02 实现，commit fb036b2）。

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
