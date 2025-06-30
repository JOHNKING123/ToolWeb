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
	Category    string `json:"category"`
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
					Popular:     false,
					Category:    "格式化工具",
				},
				{
					ID:          "xml",
					Name:        "XML 格式化",
					Description: "格式化和验证 XML 数据",
					Path:        "/tools/xml-formatter",
					Icon:        "code_blocks",
					New:         false,
					Category:    "格式化工具",
				},
				{
					ID:          "sql",
					Name:        "SQL 格式化",
					Description: "格式化 SQL 查询语句",
					Path:        "/tools/sql-formatter",
					Icon:        "database",
					New:         false,
					Category:    "格式化工具",
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
					Category:    "编码转换",
				},
				{
					ID:          "url",
					Name:        "URL 编码/解码",
					Description: "URL 编码和解码转换",
					Path:        "/tools/url-codec",
					Icon:        "link",
					New:         false,
					Category:    "编码转换",
				},
				{
					ID:          "qrcode",
					Name:        "二维码工具",
					Description: "生成和识别二维码",
					Path:        "/tools/qrcode",
					Icon:        "qr_code",
					New:         false,
					Category:    "编码转换",
				},
				{
					ID:          "barcode",
					Name:        "条形码生成器",
					Description: "生成各种类型的条形码和二维码，支持自定义尺寸",
					Path:        "/tools/barcode-generator",
					Icon:        "qr_code_scanner",
					New:         true,
					Category:    "编码转换",
				},
				{
					ID:          "shorturl",
					Name:        "短链接生成器",
					Description: "将长URL转换为短链接，方便分享和使用",
					Path:        "/tools/shorturl",
					Icon:        "link_off",
					New:         true,
					Category:    "编码转换",
				},
			},
		},
		{
			ID:          "dev",
			Name:        "开发工具",
			Description: "常用开发辅助工具",
			Icon:        "terminal",
			Tools: []Tool{
				// 暂时屏蔽了
				// {
				// 	ID:          "postman",
				// 	Name:        "在线 Postman",
				// 	Description: "功能完整的在线 Postman 工具，支持 HTTP 请求发送、环境变量管理、请求历史等功能",
				// 	Path:        "/tools/postman",
				// 	Icon:        "api",
				// 	Popular:     true,
				// 	New:         true,
				// 	Category:    "开发工具",
				// },
				{
					ID:          "regex",
					Name:        "正则表达式测试",
					Description: "测试和验证正则表达式，实时显示匹配结果",
					Path:        "/tools/regex-tester",
					Icon:        "regex",
					Popular:     true,
					Category:    "开发工具",
				},
				{
					ID:          "cron",
					Name:        "Cron 表达式解析",
					Description: "解析和验证 Cron 表达式，查看未来执行时间",
					Path:        "/tools/cron-parser",
					Icon:        "schedule",
					Popular:     true,
					Category:    "开发工具",
				},
				{
					ID:          "jwt",
					Name:        "JWT 解析器",
					Description: "解析和验证 JWT 令牌",
					Path:        "/tools/jwt-parser",
					Icon:        "key",
					New:         false,
					Category:    "开发工具",
				},
				{
					ID:          "calendar",
					Name:        "在线日历",
					Description: "查看日历、农历和节假日信息",
					Path:        "/tools/calendar",
					Icon:        "calendar_today",
					New:         true,
					Category:    "开发工具",
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
					New:         false,
					Category:    "文本工具",
				},
				{
					ID:          "markdown",
					Name:        "Markdown 预览",
					Description: "实时预览 Markdown 文档",
					Path:        "/tools/markdown-preview",
					Icon:        "article",
					New:         false,
					Category:    "文本工具",
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
					Path:        "/tools/json-yaml-converter",
					Icon:        "compare_arrows",
					New:         false,
					Category:    "格式转换",
				},
			},
		},
		{
			ID:          "image",
			Name:        "图片处理",
			Description: "图片相关处理工具",
			Icon:        "image",
			Tools: []Tool{
				{
					ID:          "watermark",
					Name:        "图片打水印",
					Description: "为图片添加自定义文字水印，支持字体、透明度等参数",
					Path:        "/tools/watermark",
					Icon:        "watermark",
					Popular:     true,
					New:         true,
					Category:    "图片处理",
				},
			},
		},
		{
			ID:          "doc",
			Name:        "文档转换",
			Description: "各种文档格式之间的转换工具",
			Icon:        "file_copy",
			Tools: []Tool{
				{
					ID:          "doc2pdf",
					Name:        "DOC 转 PDF",
					Description: "将 DOC/DOCX 文件转换为 PDF 格式",
					Path:        "/tools/doc-to-pdf",
					Icon:        "picture_as_pdf",
					New:         true,
					Category:    "文档转换",
				},
			},
		},
		{
			ID:          "nettools",
			Name:        "网络工具",
			Description: "常用网络查询工具",
			Icon:        "public",
			Tools: []Tool{
				{
					ID:          "domain-check",
					Name:        "域名查询",
					Description: "查询域名是否注册及Whois信息",
					Path:        "/tools/domain-check",
					Icon:        "language",
				},
				{
					ID:          "ip-lookup",
					Name:        "IP查询",
					Description: "查询任意IP归属地信息",
					Path:        "/tools/ip-lookup",
					Icon:        "location_on",
				},
				{
					ID:          "my-ip",
					Name:        "我的IP",
					Description: "显示你的公网IP及归属地",
					Path:        "/tools/my-ip",
					Icon:        "person_pin_circle",
				},
				{
					ID:          "port-scan",
					Name:        "端口扫描",
					Description: "检测主机端口开放状态",
					Path:        "/tools/port-scan",
					Icon:        "settings_ethernet",
				},
				{
					ID:          "ping",
					Name:        "Ping测试",
					Description: "网络连通性与延迟测试",
					Path:        "/tools/ping",
					Icon:        "network_ping",
				},
				{
					ID:          "dns-lookup",
					Name:        "DNS解析查询",
					Description: "查询域名DNS记录信息",
					Path:        "/tools/dns-lookup",
					Icon:        "dns",
				},
				{
					ID:          "ssl-check",
					Name:        "SSL证书检测",
					Description: "检测网站SSL证书有效期等信息",
					Path:        "/tools/ssl-check",
					Icon:        "verified_user",
				},
			},
		},
		{
			ID:          "crypto",
			Name:        "加密解密",
			Description: "常用加密、解密、哈希、摘要等工具",
			Icon:        "lock",
			Tools: []Tool{
				{
					ID:          "md5",
					Name:        "MD5 加密/摘要",
					Description: "计算字符串的MD5值，常用于摘要校验",
					Path:        "/tools/md5",
					Icon:        "fingerprint",
					Category:    "加密解密",
				},
				{
					ID:          "sha1",
					Name:        "SHA1 摘要",
					Description: "计算字符串的SHA1值，常用于数据完整性校验",
					Path:        "/tools/sha1",
					Icon:        "fingerprint",
					Category:    "加密解密",
				},
				{
					ID:          "sha256",
					Name:        "SHA256 摘要",
					Description: "计算字符串的SHA256值，常用于更高安全需求的摘要校验",
					Path:        "/tools/sha256",
					Icon:        "fingerprint",
					Category:    "加密解密",
				},
				{
					ID:          "aes",
					Name:        "AES 加解密",
					Description: "对称加密算法AES的加密与解密工具",
					Path:        "/tools/aes",
					Icon:        "vpn_key",
					Category:    "加密解密",
				},
				{
					ID:          "des",
					Name:        "DES 加解密",
					Description: "对称加密算法DES的加密与解密工具",
					Path:        "/tools/des",
					Icon:        "vpn_key",
					Category:    "加密解密",
				},
				{
					ID:          "rsa",
					Name:        "RSA 加解密",
					Description: "非对称加密算法RSA的加密、解密、签名与验签工具",
					Path:        "/tools/rsa",
					Icon:        "vpn_key",
					Category:    "加密解密",
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
