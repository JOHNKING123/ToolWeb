package tools

import (
	"encoding/xml"
	"fmt"
	"time"
)

// SitemapURL 站点地图URL结构
type SitemapURL struct {
	XMLName    xml.Name `xml:"url"`
	Loc        string   `xml:"loc"`
	LastMod    string   `xml:"lastmod"`
	ChangeFreq string   `xml:"changefreq"`
	Priority   string   `xml:"priority"`
}

// SitemapURLSet 站点地图URL集合
type SitemapURLSet struct {
	XMLName xml.Name     `xml:"urlset"`
	XMLNS   string       `xml:"xmlns,attr"`
	URLs    []SitemapURL `xml:"url"`
}

// GenerateSitemap 生成站点地图
func GenerateSitemap(domain string) ([]byte, error) {
	now := time.Now().Format("2006-01-02")

	sitemap := SitemapURLSet{
		XMLNS: "http://www.sitemaps.org/schemas/sitemap/0.9",
		URLs: []SitemapURL{
			{
				Loc:        domain,
				LastMod:    now,
				ChangeFreq: "daily",
				Priority:   "1.0",
			},
			{
				Loc:        domain + "/tools/index",
				LastMod:    now,
				ChangeFreq: "daily",
				Priority:   "0.9",
			},
		},
	}

	// 添加工具页面
	categories := GetCategories()
	for _, category := range categories {
		for _, tool := range category.Tools {
			sitemap.URLs = append(sitemap.URLs, SitemapURL{
				Loc:        domain + tool.Path,
				LastMod:    now,
				ChangeFreq: "weekly",
				Priority:   "0.8",
			})
		}
	}

	output, err := xml.MarshalIndent(sitemap, "", "  ")
	if err != nil {
		return nil, err
	}

	// 添加XML声明
	xmlData := []byte(xml.Header + string(output))
	return xmlData, nil
}

// GenerateRobotsTxt 生成robots.txt
func GenerateRobotsTxt(domain string) string {
	return fmt.Sprintf(`User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /ebook/

Sitemap: %s/sitemap.xml

# 常见搜索引擎优化
User-agent: Googlebot
Allow: /

User-agent: Baiduspider
Allow: /

User-agent: bingbot
Allow: /
`, domain)
}
