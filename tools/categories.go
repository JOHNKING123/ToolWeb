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
				{
					ID:          "htmlentities",
					Name:        "HTML 实体编解码",
					Description: "HTML 转义/反转义、Unicode \\u 转义",
					Path:        "/tools/html-entities",
					Icon:        "code",
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
				{
					ID:          "quicksort",
					Name:        "快排演示",
					Description: "可视化演示快速排序算法过程",
					Path:        "/tools/quicksort",
					Icon:        "sort",
					New:         true,
					Category:    "开发工具",
				},
				{
					ID:          "timestamp",
					Name:        "时间戳转换",
					Description: "Unix 时间戳与日期时间互转，支持秒/毫秒、本地时区与 UTC",
					Path:        "/tools/timestamp",
					Icon:        "access_time",
					New:         true,
					Category:    "开发工具",
				},
				{
					ID:          "uuid",
					Name:        "UUID 生成器",
					Description: "批量生成 UUID，支持 v1/v4、大小写与连字符选项",
					Path:        "/tools/uuid-generator",
					Icon:        "tag",
					New:         true,
					Category:    "开发工具",
				},
				{
					ID:          "color",
					Name:        "颜色转换",
					Description: "HEX/RGB/HSL 互转，实时预览，WCAG 对比度检查",
					Path:        "/tools/color-converter",
					Icon:        "palette",
					New:         true,
					Category:    "开发工具",
				},
				{
					ID:          "chmod",
					Name:        "Chmod 权限计算器",
					Description: "勾选换算 Linux 文件权限数字表示与符号表示",
					Path:        "/tools/chmod-calculator",
					Icon:        "security",
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
				{
					ID:          "texttools",
					Name:        "文本工具集",
					Description: "字数统计、行去重、排序、大小写转换、全半角、盘古空格",
					Path:        "/tools/text-tools",
					Icon:        "notes",
					New:         true,
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
				{
					ID:          "csvjson",
					Name:        "CSV ⇄ JSON 互转",
					Description: "表格数据与 JSON 数组互转，支持自定义分隔符",
					Path:        "/tools/csv-json",
					Icon:        "table_chart",
					New:         true,
					Category:    "格式转换",
				},
				{
					ID:          "json_to_types",
					Name:        "JSON 转 TypeScript / Go 结构体",
					Description: "粘贴 JSON 自动生成 TS interface 与 Go struct，嵌套拆分、可选字段与联合类型推断",
					Path:        "/tools/json-to-types",
					Icon:        "schema",
					New:         true,
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
				{
					ID:          "img-convert",
					Name:        "图片格式转换",
					Description: "支持PNG、JPG、WebP、BMP、GIF等格式互转",
					Path:        "/tools/img-convert",
					Icon:        "compare_arrows",
					Category:    "图片处理",
				},
				{
					ID:          "img-compress",
					Name:        "图片压缩",
					Description: "无损/有损压缩图片，减小体积，支持多种格式",
					Path:        "/tools/img-compress",
					Icon:        "compress",
					Category:    "图片处理",
				},
				{
					ID:          "img-resize",
					Name:        "图片尺寸调整",
					Description: "自定义缩放、裁剪图片，支持指定宽高",
					Path:        "/tools/img-resize",
					Icon:        "photo_size_select_large",
					Category:    "图片处理",
				},
				{
					ID:          "img2base64",
					Name:        "图片转Base64",
					Description: "将图片文件转换为Base64字符串，支持多格式",
					Path:        "/tools/img2base64",
					Icon:        "code",
					Category:    "图片处理",
				},
				{
					ID:          "img_mosaic",
					Name:        "图片打码",
					Description: "框选区域马赛克/高斯模糊打码，遮车牌人脸手机号，本地处理不上传",
					Path:        "/tools/img-mosaic",
					Icon:        "blur_on",
					New:         true,
					Category:    "图片处理",
				},
				{
					ID:          "img_stitch",
					Name:        "图片拼接 / 长图拼接",
					Description: "多张图片纵向/横向拼接成长图，聊天记录截图拼长图，拖拽排序、间距背景可调，本地处理不上传",
					Path:        "/tools/img-stitch",
					Icon:        "view_column",
					New:         true,
					Category:    "图片处理",
				},
				{
					ID:          "exif_strip",
					Name:        "EXIF 信息查看/清除",
					Description: "查看照片 EXIF 元数据（GPS 定位/机型/拍摄时间），一键字节级无损清除，本地处理不上传",
					Path:        "/tools/exif-strip",
					Icon:        "privacy_tip",
					New:         true,
					Category:    "图片处理",
				},
				{
					ID:          "base64toimg",
					Name:        "Base64转图片",
					Description: "将Base64字符串还原为图片并预览/下载",
					Path:        "/tools/base64toimg",
					Icon:        "image_search",
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
				{
					ID:          "pdf_merge_split",
					Name:        "PDF 合并/拆分",
					Description: "多个 PDF 按序合并，或按页码范围拆分提取页面，本地处理不上传",
					Path:        "/tools/pdf-merge-split",
					Icon:        "picture_as_pdf",
					New:         true,
					Category:    "文档转换",
				},
				{
					ID:          "pdf_to_image",
					Name:        "PDF 转图片/长图",
					Description: "PDF 逐页导出 PNG/JPG 图片，或多页拼接成长图，本地处理不上传",
					Path:        "/tools/pdf-to-image",
					Icon:        "image",
					New:         true,
					Category:    "文档转换",
				},
				{
					ID:          "pdf_watermark",
					Name:        "PDF 加水印",
					Description: "给 PDF 添加自定义文字水印（中文/平铺/透明度可调），防扩散防盗用，本地处理不上传",
					Path:        "/tools/pdf-watermark",
					Icon:        "branding_watermark",
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
				{
					ID:          "subnet",
					Name:        "IP 子网计算器",
					Description: "CIDR 网段换算：网络地址、广播地址、可用 IP 范围",
					Path:        "/tools/subnet-calculator",
					Icon:        "router",
					New:         true,
					Category:    "网络工具",
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
				{
					ID:          "password",
					Name:        "随机密码生成器",
					Description: "生成高强度随机密码，可自定义长度、字符集，显示密码强度",
					Path:        "/tools/password-generator",
					Icon:        "password",
					New:         true,
					Category:    "加密解密",
				},
			},
		},
		{
			ID:          "ai",
			Name:        "AI 工具",
			Description: "大模型与 AI 应用相关工具",
			Icon:        "smart_toy",
			Tools: []Tool{
				{
					ID:          "ai_token_counter",
					Name:        "AI Token 计数器",
					Description: "计算 GPT/Claude/Gemini 等模型 token 数、上下文窗占用与 API 费用估算",
					Path:        "/tools/ai-token-counter",
					Icon:        "token",
					New:         true,
					Category:    "AI 工具",
				},
			},
		},
		{
			ID:          "life",
			Name:        "生活工具",
			Description: "日常生活实用小工具",
			Icon:        "home",
			Tools: []Tool{
				{
					ID:          "relationship",
					Name:        "亲戚关系计算器",
					Description: "输入关系链查标准称谓，支持反向查询与南北口语别名",
					Path:        "/tools/relationship-calculator",
					Icon:        "family_restroom",
					New:         true,
					Category:    "生活工具",
				},
				{
					ID:          "random_decision",
					Name:        "随机决策器",
					Description: "选择困难症救星：今天吃什么随机抽、抛硬币3D翻转、Yes-No快问，在线抽签秒做决定",
					Path:        "/tools/random-decision",
					Icon:        "casino",
					New:         true,
					Category:    "生活工具",
				},
				{
					ID:          "fancy_fonts",
					Name:        "花体字生成器",
					Description: "特殊字体在线生成：粗体/斜体/哥特/手写花体/气泡/方框等18种风格，昵称符号装饰一键复制",
					Path:        "/tools/fancy-fonts",
					Icon:        "text_fields",
					New:         true,
					Category:    "生活工具",
				},
				{
					ID:          "nine_grid",
					Name:        "九宫格切图",
					Description: "朋友圈/IG 九宫格拼图在线切图：3×3/2×2/1×3/3×1 档位切分，逐张下载或一键打包",
					Path:        "/tools/nine-grid",
					Icon:        "grid_on",
					New:         true,
					Category:    "生活工具",
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
