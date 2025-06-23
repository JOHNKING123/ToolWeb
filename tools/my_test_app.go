package tools

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gopkg.in/yaml.v3"
)

// TestApp 表示一个测试应用的信息
type TestApp struct {
	ID             string    `json:"id" yaml:"id"`
	Name           string    `json:"name" yaml:"name"`
	Description    string    `json:"description" yaml:"description"`
	Version        string    `json:"version" yaml:"version"`
	FilePath       string    `json:"file_path" yaml:"file_path"`
	DetailFilePath string    `json:"detail_file_path" yaml:"detail_file_path"` // Markdown详情文件路径
	Screenshots    []string  `json:"screenshots" yaml:"screenshots"`           // 展示图片集路径
	FileSize       int64     `json:"file_size" yaml:"file_size"`
	UpdateTime     time.Time `json:"update_time" yaml:"update_time"`
	Category       string    `json:"category" yaml:"category"`
	Platform       string    `json:"platform" yaml:"platform"` // android, ios, windows, mac, linux
	Icon           string    `json:"icon" yaml:"icon"`
	Tags           []string  `json:"tags" yaml:"tags"`
}

// TestAppConfig 配置文件结构
type TestAppConfig struct {
	Apps []TestApp `yaml:"apps"`
}

var testAppsConfig TestAppConfig

// InitTestApps 初始化测试应用配置
func InitTestApps() error {
	configPath := "config/test_apps.yaml"

	// 如果配置文件不存在，创建默认配置
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		if err := createDefaultTestAppConfig(configPath); err != nil {
			return fmt.Errorf("创建默认配置文件失败: %v", err)
		}
	}

	// 读取配置文件
	data, err := os.ReadFile(configPath)
	if err != nil {
		return fmt.Errorf("读取配置文件失败: %v", err)
	}

	if err := yaml.Unmarshal(data, &testAppsConfig); err != nil {
		return fmt.Errorf("解析配置文件失败: %v", err)
	}

	// 更新文件信息
	updateTestAppFileInfo()

	return nil
}

// createDefaultTestAppConfig 创建默认配置文件
func createDefaultTestAppConfig(configPath string) error {
	// 确保配置目录存在
	if err := os.MkdirAll(filepath.Dir(configPath), 0755); err != nil {
		return err
	}

	defaultConfig := TestAppConfig{
		Apps: []TestApp{
			{
				ID:             "demo-app-1",
				Name:           "示例应用 1",
				Description:    "这是一个示例应用，用于演示功能",
				Version:        "1.0.0",
				FilePath:       "data/apps/demo-app-1.apk",
				DetailFilePath: "data/apps/details/demo-app-1.md",
				Screenshots: []string{
					"data/apps/screenshots/demo-app-1/screen1.png",
					"data/apps/screenshots/demo-app-1/screen2.png",
					"data/apps/screenshots/demo-app-1/screen3.png",
				},
				Category: "工具类",
				Platform: "android",
				Icon:     "android",
				Tags:     []string{"工具", "示例"},
			},
			{
				ID:             "demo-app-2",
				Name:           "示例应用 2",
				Description:    "另一个示例应用，展示不同功能",
				Version:        "2.1.0",
				FilePath:       "data/apps/demo-app-2.apk",
				DetailFilePath: "",         // 没有详情文件
				Screenshots:    []string{}, // 没有展示图片
				Category:       "娱乐类",
				Platform:       "android",
				Icon:           "games",
				Tags:           []string{"娱乐", "游戏"},
			},
		},
	}

	data, err := yaml.Marshal(defaultConfig)
	if err != nil {
		return err
	}

	return os.WriteFile(configPath, data, 0644)
}

// updateTestAppFileInfo 更新应用文件信息
func updateTestAppFileInfo() {
	for i := range testAppsConfig.Apps {
		app := &testAppsConfig.Apps[i]

		// 检查文件是否存在
		if info, err := os.Stat(app.FilePath); err == nil {
			app.FileSize = info.Size()
			app.UpdateTime = info.ModTime()
		}
	}
}

// GetTestApps 获取所有测试应用
func GetTestApps() []TestApp {
	return testAppsConfig.Apps
}

// GetTestAppByID 根据ID获取测试应用
func GetTestAppByID(id string) *TestApp {
	for _, app := range testAppsConfig.Apps {
		if app.ID == id {
			return &app
		}
	}
	return nil
}

// GetTestAppsByCategory 根据分类获取测试应用
func GetTestAppsByCategory(category string) []TestApp {
	var apps []TestApp
	for _, app := range testAppsConfig.Apps {
		if app.Category == category {
			apps = append(apps, app)
		}
	}
	return apps
}

// GetTestAppsByPlatform 根据平台获取测试应用
func GetTestAppsByPlatform(platform string) []TestApp {
	var apps []TestApp
	for _, app := range testAppsConfig.Apps {
		if app.Platform == platform {
			apps = append(apps, app)
		}
	}
	return apps
}

// HandleMyTestApp 处理测试应用页面
func HandleMyTestApp(c *gin.Context) {
	apps := GetTestApps()

	// 按分类分组
	appCategories := make(map[string][]TestApp)
	for _, app := range apps {
		appCategories[app.Category] = append(appCategories[app.Category], app)
	}

	// 获取工具分类，供导航使用
	toolCategories := GetCategories()

	c.HTML(http.StatusOK, "my_test_app", gin.H{
		"Title":         "我的测试应用",
		"Apps":          apps,
		"AppCategories": appCategories,  // 应用分类
		"Categories":    toolCategories, // 工具分类，供nav使用
		"TotalApps":     len(apps),
		"CurrentURL":    c.Request.URL.String(),
	})
}

// HandleTestAppDownload 处理应用下载
func HandleTestAppDownload(c *gin.Context) {
	appID := c.Param("id")
	app := GetTestAppByID(appID)

	if app == nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "应用不存在",
		})
		return
	}

	// 检查文件是否存在
	if _, err := os.Stat(app.FilePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "文件不存在",
		})
		return
	}

	// 设置下载头
	filename := filepath.Base(app.FilePath)
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	c.Header("Content-Type", "application/octet-stream")

	// 发送文件
	c.File(app.FilePath)
}

// HandleTestAppAPI 处理API请求
func HandleTestAppAPI(c *gin.Context) {
	action := c.Query("action")

	switch action {
	case "list":
		apps := GetTestApps()
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    apps,
		})
	case "categories":
		apps := GetTestApps()
		categories := make(map[string]int)
		for _, app := range apps {
			categories[app.Category]++
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    categories,
		})
	case "platforms":
		apps := GetTestApps()
		platforms := make(map[string]int)
		for _, app := range apps {
			platforms[app.Platform]++
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data":    platforms,
		})
	case "detail":
		appID := c.Query("id")
		if appID == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "缺少应用ID",
			})
			return
		}

		app := GetTestAppByID(appID)
		if app == nil {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"message": "应用不存在",
			})
			return
		}

		// 检查是否有详情文件
		if app.DetailFilePath == "" {
			c.JSON(http.StatusOK, gin.H{
				"success":   false,
				"message":   "该应用暂无详细信息",
				"hasDetail": false,
			})
			return
		}

		// 检查详情文件是否存在
		if _, err := os.Stat(app.DetailFilePath); os.IsNotExist(err) {
			c.JSON(http.StatusOK, gin.H{
				"success":   false,
				"message":   "详情文件不存在",
				"hasDetail": false,
			})
			return
		}

		// 读取Markdown文件内容
		content, err := os.ReadFile(app.DetailFilePath)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"message": "读取详情文件失败: " + err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success":   true,
			"hasDetail": true,
			"data": gin.H{
				"app":     app,
				"content": string(content),
			},
		})
	default:
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "无效的操作",
		})
	}
}

// GetTestAppStats 获取测试应用统计信息
func GetTestAppStats() map[string]interface{} {
	apps := GetTestApps()

	stats := make(map[string]interface{})
	stats["total_apps"] = len(apps)

	// 按分类统计
	categories := make(map[string]int)
	platforms := make(map[string]int)

	for _, app := range apps {
		categories[app.Category]++
		platforms[app.Platform]++
	}

	stats["categories"] = categories
	stats["platforms"] = platforms

	return stats
}

// HandleTestAppDetail 处理应用详情页面
func HandleTestAppDetail(c *gin.Context) {
	appID := c.Param("id")
	app := GetTestAppByID(appID)

	if app == nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "应用不存在",
		})
		return
	}

	// 检查是否有详情文件
	if app.DetailFilePath == "" {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "该应用暂无详细信息",
		})
		return
	}

	// 检查详情文件是否存在
	if _, err := os.Stat(app.DetailFilePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "详情文件不存在",
		})
		return
	}

	// 读取Markdown文件内容
	content, err := os.ReadFile(app.DetailFilePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "读取详情文件失败: " + err.Error(),
		})
		return
	}

	// 获取工具分类，供导航使用
	toolCategories := GetCategories()

	c.HTML(http.StatusOK, "app_detail", gin.H{
		"Title":           app.Name + " - 应用详情",
		"App":             app,
		"Categories":      toolCategories,
		"MarkdownContent": string(content),
	})
}

// HandleTestAppScreenshots 处理应用截图服务
func HandleTestAppScreenshots(c *gin.Context) {
	filePath := c.Param("filepath")
	if filePath == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "文件路径不能为空",
		})
		return
	}

	// 构建完整的文件路径
	fullPath := filepath.Join("data/apps/screenshots", filePath)

	// 安全检查：确保路径在允许的目录内
	if !strings.HasPrefix(fullPath, "data/apps/screenshots") {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": "访问被拒绝",
		})
		return
	}

	// 检查文件是否存在
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "图片文件不存在",
		})
		return
	}

	// 设置缓存头
	c.Header("Cache-Control", "public, max-age=31536000") // 缓存1年
	c.Header("Expires", time.Now().AddDate(1, 0, 0).Format(http.TimeFormat))

	// 发送文件
	c.File(fullPath)
}
