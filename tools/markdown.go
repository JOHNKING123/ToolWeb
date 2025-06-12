package tools

import (
	"regexp"
	"strings"

	"github.com/gomarkdown/markdown"
	"github.com/gomarkdown/markdown/html"
	"github.com/gomarkdown/markdown/parser"
)

// MarkdownRequest 表示 Markdown 预览请求
type MarkdownRequest struct {
	Markdown    string `json:"markdown"`
	Theme       string `json:"theme"`
	LineNumbers bool   `json:"lineNumbers"`
}

// MarkdownResponse 表示 Markdown 预览响应
type MarkdownResponse struct {
	Success bool   `json:"success"`
	HTML    string `json:"html"`
	Error   string `json:"error,omitempty"`
}

// preprocessMarkdown 预处理 Markdown 文本，修复常见的格式问题
func preprocessMarkdown(markdown string) string {
	lines := strings.Split(markdown, "\n")
	var result []string

	for i, line := range lines {
		result = append(result, line)

		if i < len(lines)-1 {
			currentLine := strings.TrimSpace(line)
			nextLine := strings.TrimSpace(lines[i+1])

			// 检查当前行是否是列表项（数字列表或无序列表）
			isCurrentList := regexp.MustCompile(`^\s*(\d+\.|\*|\+|\-)\s+`).MatchString(line)
			// 检查下一行是否是标题
			isNextHeading := regexp.MustCompile(`^\s*#{1,6}\s+`).MatchString(nextLine)

			// 如果当前行是列表项，下一行是标题，但中间没有空行，则插入空行
			if isCurrentList && isNextHeading && nextLine != "" {
				result = append(result, "")
			}

			// 也处理代码块、引用等结束后直接跟标题的情况
			isCurrentCode := strings.HasPrefix(currentLine, "```")
			isCurrentQuote := strings.HasPrefix(currentLine, ">")

			if (isCurrentCode || isCurrentQuote) && isNextHeading && nextLine != "" {
				result = append(result, "")
			}
		}
	}

	return strings.Join(result, "\n")
}

// RenderMarkdown 将 Markdown 转换为 HTML
func RenderMarkdown(req *MarkdownRequest) *MarkdownResponse {
	if req.Markdown == "" {
		return &MarkdownResponse{
			Success: true,
			HTML:    "",
		}
	}

	// 预处理 Markdown 文本
	processedMarkdown := preprocessMarkdown(req.Markdown)

	// 创建 Markdown 解析器
	extensions := parser.CommonExtensions | parser.AutoHeadingIDs
	p := parser.NewWithExtensions(extensions)

	// 解析 Markdown
	doc := p.Parse([]byte(processedMarkdown))

	// 创建 HTML 渲染器
	htmlFlags := html.CommonFlags | html.HrefTargetBlank
	opts := html.RendererOptions{
		Flags: htmlFlags,
		CSS:   getThemeCSS(req.Theme),
	}
	renderer := html.NewRenderer(opts)

	// 渲染 HTML
	rs := markdown.Render(doc, renderer)

	return &MarkdownResponse{
		Success: true,
		HTML:    string(rs),
	}
}

// getThemeCSS 根据主题名称返回对应的 CSS 类名
func getThemeCSS(theme string) string {
	switch theme {
	case "github":
		return "markdown-body github-theme"
	case "vue":
		return "markdown-body vue-theme"
	case "vuepress":
		return "markdown-body vuepress-theme"
	case "juejin":
		return "markdown-body juejin-theme"
	default:
		return "markdown-body"
	}
}

// ExportMarkdown 导出 Markdown 为完整的 HTML 文档 测试
func ExportMarkdown(req *MarkdownRequest) ([]byte, error) {
	if req.Markdown == "" {
		return nil, nil
	}

	// 预处理 Markdown 文本
	processedMarkdown := preprocessMarkdown(req.Markdown)

	// 创建 Markdown 解析器
	extensions := parser.CommonExtensions | parser.AutoHeadingIDs
	p := parser.NewWithExtensions(extensions)

	// 解析 Markdown
	doc := p.Parse([]byte(processedMarkdown))

	// 创建 HTML 渲染器，启用完整页面模式
	htmlFlags := html.CommonFlags | html.HrefTargetBlank | html.CompletePage
	opts := html.RendererOptions{
		Flags: htmlFlags,
		CSS:   getThemeCSS(req.Theme),
		Title: "Markdown Export",
	}

	renderer := html.NewRenderer(opts)

	// 渲染完整的 HTML 文档
	return markdown.Render(doc, renderer), nil
}
