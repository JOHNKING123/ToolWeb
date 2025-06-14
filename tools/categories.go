package tools

// Tool 表示单个工具的信息
type Tool struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Path        string `json:"path"`
	Icon        string `json:"icon"` // Material Icons 名称
	Popular     bool   `json:"popular"`
	New         bool   `json:"new"`
}

// Category 表示工具分类
type Category struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Icon        string `json:"icon"` // Material Icons 名称
	Tools       []Tool `json:"tools"`
}

// GetCategories 返回所有工具分类
func GetCategories() []Category {
	return []Category{
		{
			ID:          "format",
			Name:        "格式化工具",
			Description: "各类数据格式化和校验工具",
			Icon:        "code",
			Tools: []Tool{
				{
					ID:          "json",
					Name:        "JSON 解析器",
					Description: "格式化和验证 JSON 数据，支持语法高亮显示",
					Path:        "/tools/json-parser",
					Icon:        "data_object",
					Popular:     true,
				},
				{
					ID:          "xml",
					Name:        "XML 格式化",
					Description: "格式化和验证 XML 数据",
					Path:        "/tools/xml-parser",
					Icon:        "code_blocks",
					New:         true,
				},
				{
					ID:          "sql",
					Name:        "SQL 格式化",
					Description: "格式化 SQL 查询语句",
					Path:        "/tools/sql-formatter",
					Icon:        "database",
					New:         true,
				},
			},
		},
		{
			ID:          "encode",
			Name:        "编码转换",
			Description: "各种编码格式的转换工具",
			Icon:        "transform",
			Tools: []Tool{
				{
					ID:          "base64",
					Name:        "Base64 编码/解码",
					Description: "快速进行 Base64 编码和解码转换",
					Path:        "/tools/base64",
					Icon:        "swap_horiz",
					Popular:     true,
				},
				{
					ID:          "url",
					Name:        "URL 编码/解码",
					Description: "URL 编码和解码转换",
					Path:        "/tools/url-codec",
					Icon:        "link",
					New:         true,
				},
				{
					ID:          "qrcode",
					Name:        "二维码工具",
					Description: "生成和识别二维码",
					Path:        "/tools/qrcode",
					Icon:        "qr_code",
					New:         true,
				},
			},
		},
		{
			ID:          "dev",
			Name:        "开发工具",
			Description: "常用开发辅助工具",
			Icon:        "terminal",
			Tools: []Tool{
				{
					ID:          "regex",
					Name:        "正则表达式测试",
					Description: "测试和验证正则表达式，实时显示匹配结果",
					Path:        "/tools/regex-tester",
					Icon:        "regex",
					Popular:     true,
				},
				{
					ID:          "cron",
					Name:        "Cron 表达式解析",
					Description: "解析和验证 Cron 表达式，查看未来执行时间",
					Path:        "/tools/cron-parser",
					Icon:        "schedule",
					Popular:     true,
				},
				{
					ID:          "jwt",
					Name:        "JWT 解析器",
					Description: "解析和验证 JWT 令牌",
					Path:        "/tools/jwt-parser",
					Icon:        "key",
					New:         true,
				},
			},
		},
		{
			ID:          "text",
			Name:        "文本工具",
			Description: "文本处理相关工具",
			Icon:        "text_fields",
			Tools: []Tool{
				{
					ID:          "diff",
					Name:        "文本比较",
					Description: "对比两段文本的差异",
					Path:        "/tools/text-diff",
					Icon:        "compare",
					New:         true,
				},
				{
					ID:          "markdown",
					Name:        "Markdown 预览",
					Description: "实时预览 Markdown 文档",
					Path:        "/tools/markdown-preview",
					Icon:        "article",
					New:         true,
				},
			},
		},
		{
			ID:          "convert",
			Name:        "格式转换",
			Description: "各种格式之间的转换工具",
			Icon:        "swap_horiz",
			Tools: []Tool{
				{
					ID:          "json2yaml",
					Name:        "JSON/YAML 转换",
					Description: "在 JSON 和 YAML 格式之间转换",
					Path:        "/tools/json-yaml",
					Icon:        "compare_arrows",
					New:         true,
				},
			},
		},
	}
}

// GetPopularTools 返回热门工具列表
func GetPopularTools() []Tool {
	var popularTools []Tool
	for _, category := range GetCategories() {
		for _, tool := range category.Tools {
			if tool.Popular {
				popularTools = append(popularTools, tool)
			}
		}
	}
	return popularTools
}

// GetNewTools 返回新工具列表
func GetNewTools() []Tool {
	var newTools []Tool
	for _, category := range GetCategories() {
		for _, tool := range category.Tools {
			if tool.New {
				newTools = append(newTools, tool)
			}
		}
	}
	return newTools
}

// GetDefaultPopularTools 返回默认热门工具列表（JSON、正则、Cron、Base64）
func GetDefaultPopularTools() []Tool {
	defaultTools := []string{"JSON 解析器", "正则表达式测试", "Cron 表达式解析", "Base64 编码/解码"}
	var result []Tool

	for _, category := range GetCategories() {
		for _, tool := range category.Tools {
			for _, defaultTool := range defaultTools {
				if tool.Name == defaultTool {
					result = append(result, tool)
					break
				}
			}
		}
	}
	return result
}

// GetToolNameByPath 根据路径查找工具名称
func GetToolNameByPath(path string) string {
	for _, category := range GetCategories() {
		for _, tool := range category.Tools {
			if tool.Path == path {
				return tool.Name
			}
		}
	}
	return ""
}
