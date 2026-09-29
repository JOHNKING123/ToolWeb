# ToolWeb 开发分支测试报告

分支：`muse/dev-20260929`
测试日期：2026-09-29
测试环境：Linux x86_64，Go 1.24.3，Node v24.20.0，本地 `http://localhost:8080`

## 1. 构建测试

- `go build -mod=vendor -o toolweb .`：通过，无警告
- 服务启动正常，模板全部解析通过（`LoadHTMLGlob` 在启动时解析，任一模板语法错误会导致启动失败）

## 2. 页面可用性测试

- 全站 46 个工具页面（37 个原有 + 9 个新增）逐个 curl 检测：**46/46 返回 200**
- 首页 `/`：200，新增的 9 个工具均出现在首页分类与"新工具"区
- `/sitemap.xml`、`/robots.txt`：200；9 个新工具 URL 均已收录进 sitemap

## 3. 核心 API 回归测试

- `POST /tools/api/md5 {"input":"test"}` → `{"success":true,"md5":"098f6bcd4621d373cade4e832627b4f6"}` ✓
- `POST /tools/api/json/format` → 格式化结果正确 ✓
- `GET /tools/api/stats` → 统计接口正常 ✓

## 4. 新工具 JS 单元测试（Node 沙箱抽取模板内联脚本执行）

第一批（3 个工具，17 项断言）：时间戳秒/毫秒判定、UTC/本地格式化、UUID v4/v1 格式与唯一性（250 个样本）、密码字符集/熵值/强度分级 —— **全过**

第二批（6 个工具，44 项断言）：HEX/RGB/HSL 互转与逆变换、黑白对比度 21:1、chmod 755/644 双向换算与非法输入拒绝、IP/掩码/CIDR 换算（含非连续掩码拒绝）、文本统计/去重/排序/全半角/盘古空格/删空行、CSV 标准解析（含引号转义）与 CSV→JSON 完整转换、HTML 转义/反转义/Unicode 编解码往返 —— **全过**

## 5. SEO 与静态资源检查

- 修复前：`og-image.png`（社交分享图）404；`favicon-16x16.png`、`favicon-32x32.png`、`apple-touch-icon.png`（两套路径）404
- 修复后：已生成补齐，全站模板引用的静态资源 404 扫描 **0 缺失**
- 新增的 9 个工具页均带完整 SEO 头：title/description/keywords/canonical/og 标签/JSON-LD SoftwareApplication 结构化数据

## 6. 已知限制

- 无真实浏览器环境，未做真机渲染与控制台报错检查；JS 逻辑以 Node 沙箱单元测试覆盖
- 工具页引用 Google Fonts（Material Icons）CDN，离线环境下图标字体加载失败但不影响功能
- 性能/移动端：现有 CSS 已有响应式断点；新增页面沿用同一套样式体系，未做专项真机走查

## 结论

构建通过，46 个页面可用，核心 API 正常，9 个新工具逻辑测试全过，SEO 基础项补齐。可以合入评审。
