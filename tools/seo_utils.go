package tools

import (
	"encoding/json"
	"os"
	"strings"
)

// SEOConfig SEO配置结构
type SEOConfig struct {
	Site  SiteConfig            `json:"site"`
	Pages map[string]PageConfig `json:"pages"`
}

// SiteConfig 网站配置
type SiteConfig struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Domain      string `json:"domain"`
	Author      string `json:"author"`
	Language    string `json:"language"`
}

// PageConfig 页面配置
type PageConfig struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Keywords    string `json:"keywords"`
}

// LoadSEOConfig 加载SEO配置
func LoadSEOConfig() (*SEOConfig, error) {
	data, err := os.ReadFile("seo_config.json")
	if err != nil {
		return nil, err
	}

	var config SEOConfig
	err = json.Unmarshal(data, &config)
	if err != nil {
		return nil, err
	}

	return &config, nil
}

// GetPageSEO 获取页面SEO信息
func GetPageSEO(pageName string) *PageConfig {
	config, err := LoadSEOConfig()
	if err != nil {
		// 返回默认配置
		return &PageConfig{
			Title:       "程序员工具箱",
			Description: "免费在线开发工具集合",
			Keywords:    "程序员工具,在线工具,开发工具",
		}
	}

	if pageConfig, exists := config.Pages[pageName]; exists {
		return &pageConfig
	}

	// 返回默认配置
	return &PageConfig{
		Title:       config.Site.Name,
		Description: config.Site.Description,
		Keywords:    "程序员工具,在线工具,开发工具",
	}
}

// GenerateStructuredData 生成结构化数据
func GenerateStructuredData(toolName, toolDesc, toolURL string) string {
	data := map[string]interface{}{
		"@context":            "https://schema.org",
		"@type":               "SoftwareApplication",
		"name":                toolName,
		"description":         toolDesc,
		"url":                 toolURL,
		"applicationCategory": "DeveloperApplication",
		"operatingSystem":     "Web Browser",
		"offers": map[string]interface{}{
			"@type":         "Offer",
			"price":         "0",
			"priceCurrency": "CNY",
		},
	}

	jsonData, _ := json.MarshalIndent(data, "", "  ")
	return string(jsonData)
}

// OptimizeHTML HTML优化（移除多余空格、换行等）
func OptimizeHTML(html string) string {
	// 移除多余的空白字符
	html = strings.ReplaceAll(html, "\n\n", "\n")
	html = strings.ReplaceAll(html, "\t", "")

	// 压缩空格（保留单个空格）
	lines := strings.Split(html, "\n")
	var optimized []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			optimized = append(optimized, trimmed)
		}
	}

	return strings.Join(optimized, "\n")
}

// GenerateKeywords 根据工具信息生成关键词
func GenerateKeywords(toolName, toolDesc string) string {
	keywords := []string{
		toolName,
		toolName + "工具",
		"在线" + toolName,
		"免费" + toolName,
		"程序员工具",
		"开发工具",
		"在线工具",
	}

	// 从描述中提取关键词
	if strings.Contains(toolDesc, "格式化") {
		keywords = append(keywords, toolName+"格式化")
	}
	if strings.Contains(toolDesc, "解析") {
		keywords = append(keywords, toolName+"解析")
	}
	if strings.Contains(toolDesc, "转换") {
		keywords = append(keywords, toolName+"转换")
	}

	return strings.Join(keywords, ",")
}
