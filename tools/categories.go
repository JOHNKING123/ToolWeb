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
					ID:          "aa_bill_splitter",
					Name:        "AA制费用分摊计算器",
					Description: "AA制费用分摊在线计算：聚餐分摊/旅游AA/合租记账，多笔支出录入，支持均摊与按份分摊、全局服务费按比例分摊，自动算每人净余额并给出最少转账笔数的结算方案，红绿净额一览+一键复制结算文本发群，纯前端本地计算不上传 · AA bill splitter with minimal-settlement transfers",
					Path:        "/tools/aa-bill-splitter",
					Icon:        "group",
					New:         true,
					Category:    "生活工具",
				},
			},
		},
		{
			ID:          "sheet",
			Name:        "表格工具",
			Description: "Excel/CSV 表格处理工具",
			Icon:        "table_view",
			Tools: []Tool{
				{
					ID:          "sheet_split",
					Name:        "表格拆分",
					Description: "Excel 表格按列/按行数/按工作表拆分：关键列同值归为一张表，保留表头，多结果一键打包 ZIP，纯前端本地处理不上传 · Split Excel by column value, row count or worksheet",
					Path:        "/tools/sheet-split",
					Icon:        "call_split",
					New:         true,
					Category:    "表格工具",
				},
				{
					ID:          "sheet_merge",
					Name:        "表格合并",
					Description: "多个 Excel/CSV 文件纵向合并为一张表：表头自动对齐（并集补空/交集保留），同文件多工作表合并，可选追加来源列，纯前端本地处理不上传 · Merge multiple Excel/CSV files or worksheets into one table",
					Path:        "/tools/sheet-merge",
					Icon:        "merge_type",
					New:         true,
					Category:    "表格工具",
				},
				{
					ID:          "score_stats",
					Name:        "成绩统计分析",
					Description: "班级成绩统计分析：逐行粘贴分数或上传 CSV，本地计算人数/平均分/及格率/优秀率/五档分数段分布，自绘柱状图，结果导出 CSV，纯前端不上传 · Score statistics: average, pass/excellent rate and score distribution",
					Path:        "/tools/score-stats",
					Icon:        "bar_chart",
					New:         true,
					Category:    "表格工具",
				},
				{
					ID:          "chart_generator",
					Name:        "在线图表生成器",
					Description: "粘贴 CSV/TSV/Excel 表格数据一键生成图表：柱状图/折线图/饼图/环形图切换，X 轴与多数值列映射，标题配色主题可调，自绘 SVG 零依赖，高清 PNG 导出，纯前端数据不出浏览器 · Paste table data to generate charts: bar/line/pie/donut, 100% client-side",
					Path:        "/tools/chart-generator",
					Icon:        "insert_chart",
					New:         true,
					Category:    "表格工具",
				},
			},
		},
		{
			ID:          "marketing",
			Name:        "营销工具",
			Description: "SEO 优化与内容营销辅助工具",
			Icon:        "campaign",
			Tools: []Tool{
				{
					ID:          "serp_snippet_preview",
					Name:        "SERP 搜索结果片段预览",
					Description: "输入标题/URL/描述，实时渲染 Google 桌面+移动端结果卡；标题 ~600px 像素宽度截断预警并标红截断点；描述 155~160 字符长度条；百度展示规则（标题约 30 汉字/描述约 78 汉字）对照提示；一键复制标题/描述，纯前端本地渲染不出浏览器 · SERP snippet preview: Google desktop/mobile result cards, title pixel-width & description length check, Baidu display rules, 100% client-side",
					Path:        "/tools/serp-snippet-preview",
					Icon:        "preview",
					New:         true,
					Category:    "营销工具",
				},
				{
					ID:          "og_card_preview",
					Name:        "OG 社交卡片预览",
					Description: "输入页面标题/描述/URL/缩略图，实时渲染 Twitter Card（Summary / Summary Large Image）、Facebook、LinkedIn、微信聊天卡片四版式；标题描述字符计数与各平台长度规则提示；一键复制 og:/twitter: meta 标签代码，纯前端本地渲染不出浏览器 · Social card preview: Twitter Card, Facebook, LinkedIn, WeChat share card preview, meta tags generator, 100% client-side",
					Path:        "/tools/og-card-preview",
					Icon:        "share",
					New:         true,
					Category:    "营销工具",
				},
			},
		},
		{
			ID:          "job",
			Name:        "求职工具",
			Description: "简历诊断与求职辅助工具",
			Icon:        "work",
			Tools: []Tool{
				{
					ID:          "resume_checker",
					Name:        "简历预检工具",
					Description: "粘贴简历+JD文本一键诊断：JD关键词匹配度评分、ATS友好度检测、经历逻辑链检查、简历雷区清单，纯前端本地分析不出浏览器 · Resume checker: JD keyword match & ATS check, 100% client-side",
					Path:        "/tools/resume-checker",
					Icon:        "fact_check",
					New:         true,
					Category:    "求职工具",
				},
			},
		},
		{
			ID:          "study",
			Name:        "学习工具",
			Description: "小学数学练习与学习辅助工具",
			Icon:        "school",
			Tools: []Tool{
				{
					ID:          "math_worksheet_generator",
					Name:        "算术题生成器",
					Description: "小学口算/竖式练习题一键生成打印：年级预设+进退位/括号开关，A4 练习纸+独立答案页，浏览器直接打印，纯前端本地出题不出浏览器 · Math worksheet generator: printable arithmetic practice sheets with answer key, 100% client-side",
					Path:        "/tools/math-worksheet-generator",
					Icon:        "calculate",
					New:         true,
					Category:    "学习工具",
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
