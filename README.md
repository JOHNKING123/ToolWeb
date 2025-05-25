# 程序员工具箱

一个基于 Go 和 Gin 框架的在线工具集合，为程序员提供常用的开发工具。

## 功能特点

- JSON 解析器：格式化和验证 JSON 数据
- Base64 编码/解码：快速进行 Base64 编码和解码转换
- 正则表达式测试：实时测试和验证正则表达式

## 技术栈

- 后端：Go + Gin 框架
- 前端：原生 JavaScript + CSS
- 模板引擎：Go HTML Templates

## 项目结构

```
programmer-tools/
├── main.go                 # 主程序，配置 Gin 路由
├── static/                # 静态文件目录
│   ├── css/
│   │   └── style.css      # 全局样式
│   └── js/
│       └── script.js      # 前端交互逻辑
├── templates/             # HTML 模板目录
│   ├── index.html         # 首页
│   ├── json_parser.html   # JSON 解析器页面
│   ├── base64.html        # Base64 编码/解码页面
│   └── regex_tester.html  # 正则表达式测试页面
├── tools/                 # 工具逻辑
│   ├── json_parser.go     # JSON 解析逻辑
│   ├── base64.go          # Base64 编码/解码逻辑
│   └── regex_tester.go    # 正则表达式测试逻辑
└── go.mod                 # Go modules 文件
```

## 安装和运行

1. 确保已安装 Go 环境（推荐 Go 1.16 或更高版本）

2. 克隆项目：
   ```bash
   git clone <repository-url>
   cd programmer-tools
   ```

3. 安装依赖：
   ```bash
   go mod tidy
   ```

4. 运行项目：
   ```bash
   go run main.go
   ```

5. 访问 http://localhost:8080 即可使用工具

## 开发说明

- 所有工具逻辑都在 `tools/` 目录下
- 前端样式在 `static/css/style.css`
- 前端交互逻辑在 `static/js/script.js`
- HTML 模板在 `templates/` 目录下

## 贡献指南

1. Fork 项目
2. 创建特性分支：`git checkout -b feature/my-feature`
3. 提交更改：`git commit -am 'Add some feature'`
4. 推送分支：`git push origin feature/my-feature`
5. 提交 Pull Request

## 许可证

MIT License 