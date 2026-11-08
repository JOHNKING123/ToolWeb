package tools

import (
	"encoding/xml"
	"fmt"
	"strings"
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

// GenerateSitemap 生成站点地图。
//
// base 为站点公开根地址（含挂载前缀，由调用方按当前请求派生）：
//   - 挂载部署（公网 /tool-web）：base 如 https://www.it-tool.eu.cc/tool-web，
//     工具页即 base/<slug>，此时 toolURLPrefix 传 ""；
//   - 直接访问（本地 / 本机直连）：base 如 http://127.0.0.1:8080，
//     工具页即 base/tools/<slug>，此时 toolURLPrefix 传 "/tools"。
//
// toolURLPrefix 为工具页相对 base 的路径前缀（"" 或 "/tools"），与 base
// 拼接后即为工具页的公开 URL；categories 里工具 Path 的 "/tools" 前缀
// 会先剥掉再拼接，避免挂载部署下出现 /tool-web/tools/<slug> 这种双前缀。
//
// 返回的 <loc> 总数恒为 330（首页＋工具索引＋328 个工具），调用方不得
// 再写死域名——旧的 https://www.johnkingzcq123.xyz 已与公网规范地址
// https://www.it-tool.eu.cc/tool-web 不符。
func GenerateSitemap(base, toolURLPrefix string) ([]byte, error) {
	now := time.Now().Format("2006-01-02")

	sitemap := SitemapURLSet{
		XMLNS: "http://www.sitemaps.org/schemas/sitemap/0.9",
		URLs: []SitemapURL{
			{
				Loc:        base,
				LastMod:    now,
				ChangeFreq: "daily",
				Priority:   "1.0",
			},
			{
				Loc:        base + toolURLPrefix + "/index",
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
			slug := strings.TrimPrefix(tool.Path, "/tools")
			sitemap.URLs = append(sitemap.URLs, SitemapURL{
				Loc:        base + toolURLPrefix + slug,
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

// GenerateRobotsTxt 生成robots.txt。
//
// base 与 GenerateSitemap 的 base 含义相同（含挂载前缀的站点公开根地址），
// Sitemap 行指向 base/sitemap.xml，与当前访问路径下的 sitemap 保持同一地址。
func GenerateRobotsTxt(base string) string {
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
`, base)
}
