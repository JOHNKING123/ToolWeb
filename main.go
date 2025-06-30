package main

import (
	"bytes"
	"context"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"toolweb/config"
	"toolweb/middleware"
	"toolweb/tools"

	"github.com/gin-gonic/gin"
	"gopkg.in/yaml.v3"
)

var (
	// 全局logger实例
	errorLogger  *log.Logger
	accessLogger *log.Logger
)

// 初始化日志
func initLoggers() error {
	// 创建logs目录（如果不存在）
	if err := os.MkdirAll("logs", 0755); err != nil {
		return fmt.Errorf("创建日志目录失败: %v", err)
	}

	// 打开错误日志文件
	errorFile, err := os.OpenFile(filepath.Join("logs", "error.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		return fmt.Errorf("打开错误日志文件失败: %v", err)
	}

	// 打开访问日志文件
	accessFile, err := os.OpenFile(filepath.Join("logs", "access.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		return fmt.Errorf("打开访问日志文件失败: %v", err)
	}

	// 初始化loggers
	errorLogger = log.New(errorFile, "[ERROR] ", log.LstdFlags|log.Lshortfile)
	accessLogger = log.New(accessFile, "[ACCESS] ", log.LstdFlags)

	return nil
}

// 自定义恢复中间件
func customRecovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				// 获取堆栈信息
				stack := make([]byte, 4096)
				stack = stack[:runtime.Stack(stack, false)]

				// 记录错误和堆栈信息
				errorLogger.Printf("发生Panic: %v\n堆栈信息:\n%s", err, stack)

				// 返回500错误
				c.AbortWithStatus(http.StatusInternalServerError)
			}
		}()
		c.Next()
	}
}

// 工具访问记录中间件
func toolAccessMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 只对工具页面进行统计
		if strings.HasPrefix(c.Request.URL.Path, "/tools/") &&
			!strings.HasPrefix(c.Request.URL.Path, "/tools/api/") &&
			!strings.HasPrefix(c.Request.URL.Path, "/tools/static/") &&
			c.Request.URL.Path != "/tools/index" &&
			c.Request.URL.Path != "/tools/tool-stats" {

			// 根据路径查找对应的工具名称
			toolName := tools.GetToolNameByPath(c.Request.URL.Path)

			if toolName != "" {
				// 记录工具访问
				ip := c.ClientIP()
				toolStats := tools.GetToolStats()
				toolStats.RecordToolAccess(ip, toolName)
			}
		}

		c.Next()
	}
}

func main() {
	// 初始化日志
	if err := initLoggers(); err != nil {
		log.Fatalf("初始化日志失败: %v", err)
	}

	// 设置gin的日志输出
	gin.DefaultWriter = accessLogger.Writer()
	gin.DefaultErrorWriter = errorLogger.Writer()

	// 记录启动信息
	accessLogger.Printf("服务启动于 %s", time.Now().Format("2006-01-02 15:04:05"))

	// 初始化访客统计
	tools.InitVisitorStats()

	// 初始化测试应用配置
	if err := tools.InitTestApps(); err != nil {
		log.Printf("初始化测试应用配置失败: %v", err)
	}

	// 创建智能限流器 - 使用默认配置
	rateLimitConfig := config.GetDefaultRateLimitConfig()
	smartRateLimiter := middleware.NewSmartRateLimiter(rateLimitConfig)

	// 输出限流配置信息
	log.Printf("限流配置: 普通=%d次/分钟, API=%d次/分钟, 严格=%d次/分钟",
		rateLimitConfig.GeneralLimit, rateLimitConfig.APILimit, rateLimitConfig.StrictLimit)

	router := gin.Default()

	// 添加自定义恢复中间件
	router.Use(customRecovery())

	// 添加智能限流中间件
	router.Use(middleware.SmartRateLimitMiddleware(smartRateLimiter))

	// 自定义模板函数
	router.SetFuncMap(template.FuncMap{
		"add": func(a, b int) int {
			return a + b
		},
		"isLast": func(index int, slice interface{}) bool {
			switch s := slice.(type) {
			case []tools.Tool:
				return index == len(s)-1
			default:
				return true
			}
		},
		"formatFileSize": func(bytes int64) string {
			if bytes == 0 {
				return "0 B"
			}
			const unit = 1024
			if bytes < unit {
				return fmt.Sprintf("%d B", bytes)
			}
			div, exp := int64(unit), 0
			for n := bytes / unit; n >= unit; n /= unit {
				div *= unit
				exp++
			}
			return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
		},
	})

	// 加载HTML模板
	router.LoadHTMLGlob("templates/*")

	// 静态文件服务 - 修改为 /tools/static/
	router.Static("/tools/static", "./static")

	// 添加访客统计中间件（只对首页进行统计）
	router.Use(func(c *gin.Context) {
		// 只对首页路由进行统计
		if c.Request.URL.Path == "/" || c.Request.URL.Path == "/tools/index" {
			middleware.VisitorStats(tools.GetVisitorStats())(c)
		} else {
			c.Next()
		}
	})

	// 添加工具访问记录中间件
	router.Use(toolAccessMiddleware())

	// 测试应用下载页面路由
	router.GET("/tools/my-test-app", tools.HandleMyTestApp)
	router.GET("/tools/my-test-app/download/:id", tools.HandleTestAppDownload)
	router.GET("/tools/my-test-app/detail/:id", tools.HandleTestAppDetail)
	router.GET("/tools/my-test-app/screenshots/*filepath", tools.HandleTestAppScreenshots)

	// 页面路由
	router.GET("/", func(c *gin.Context) {
		categories := tools.GetCategories()

		// 获取基于统计的热门工具，如果没有统计数据则使用默认热门工具
		popularTools := tools.GetToolStats().GetMostPopularTools(6)
		if len(popularTools) == 0 {
			// 默认显示 JSON解析器、正则表达式测试、Cron表达式解析
			popularTools = tools.GetDefaultPopularTools()
		}

		// 获取访客统计信息
		stats := tools.GetVisitorStats().GetStats()

		c.HTML(http.StatusOK, "index", gin.H{
			"Categories":    categories,
			"PopularTools":  popularTools,
			"NewTools":      tools.GetNewTools(),
			"TotalVisitors": stats["total_visitors"],
			"TodayVisitors": stats["today_visitors"],
		})
	})
	// 电子书路由组
	ebookGroup := router.Group("/ebook")
	{
		// 登录相关路由 - 不需要权限验证
		ebookGroup.GET("/login", func(c *gin.Context) {
			c.HTML(http.StatusOK, "login", gin.H{})
		})

		ebookGroup.POST("/login", func(c *gin.Context) {
			username := c.PostForm("username")
			password := c.PostForm("password")

			// TODO: 这里应该添加实际的用户验证逻辑
			if username == "admin" && password == "admin123" {
				// 设置 session cookie
				c.SetCookie("session", "user-session-id", 3600, "/", "", false, true)
				c.Redirect(http.StatusFound, "/ebook/index")
				return
			}

			c.HTML(http.StatusOK, "login", gin.H{
				"error": "用户名或密码错误",
			})
		})

		ebookGroup.GET("/logout", func(c *gin.Context) {
			c.SetCookie("session", "", -1, "/", "", false, true)
			c.Redirect(http.StatusFound, "/ebook/login")
		})

		// 需要权限验证的路由
		auth := ebookGroup.Group("/", middleware.AuthRequired())
		{
			// 电子书首页
			auth.GET("index", func(c *gin.Context) {
				bm := tools.GetBookManager()
				categories := bm.GetAllCategories()
				recentBooks := bm.GetRecentBooks(8)

				c.HTML(http.StatusOK, "ebook_index", gin.H{
					"Categories":  categories,
					"RecentBooks": recentBooks,
				})
			})

			// 电子书搜索
			auth.GET("search", func(c *gin.Context) {
				keyword := c.Query("keyword")
				bm := tools.GetBookManager()
				results := bm.SearchBooks(keyword)
				categories := bm.GetAllCategories()

				c.HTML(http.StatusOK, "ebook_index", gin.H{
					"Categories":  categories,
					"RecentBooks": results,
					"SearchTerm":  keyword,
				})
			})

			// 电子书分类页
			auth.GET("category/:id", func(c *gin.Context) {
				category := c.Param("id")
				bm := tools.GetBookManager()
				books := bm.GetBooksByCategory(category)
				categories := bm.GetAllCategories()

				c.HTML(http.StatusOK, "ebook_index", gin.H{
					"Categories":      categories,
					"RecentBooks":     books,
					"CurrentCategory": category,
				})
			})

			// 电子书下载
			auth.GET("download/:id", func(c *gin.Context) {
				bookID := c.Param("id")
				bm := tools.GetBookManager()
				book := bm.GetBookByID(bookID)

				if book == nil {
					c.JSON(http.StatusNotFound, gin.H{
						"status":  "error",
						"message": "书籍不存在",
					})
					return
				}

				// 检查文件是否存在
				if _, err := os.Stat(book.FilePath); os.IsNotExist(err) {
					c.JSON(http.StatusNotFound, gin.H{
						"status":  "error",
						"message": "文件不存在",
					})
					return
				}

				// 设置下载文件名
				filename := url.QueryEscape(book.Title + book.FileType)
				c.Header("Content-Disposition", "attachment; filename*=UTF-8''"+filename)
				c.Header("Content-Description", "File Transfer")
				c.Header("Content-Type", "application/octet-stream")
				c.Header("Content-Transfer-Encoding", "binary")
				c.Header("Expires", "0")
				c.Header("Cache-Control", "must-revalidate")
				c.Header("Pragma", "public")

				c.File(book.FilePath)
			})

			// 刷新电子书列表 - 需要管理员权限
			auth.POST("refresh", middleware.AdminRequired(), func(c *gin.Context) {
				bm := tools.GetBookManager()
				err := bm.LoadBooks()
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{
						"status":  "error",
						"message": "刷新失败: " + err.Error(),
					})
					return
				}

				c.JSON(http.StatusOK, gin.H{
					"status":  "success",
					"message": "刷新成功",
				})
			})
		}
	}

	// 工具首页路由
	router.GET("/tools/index", func(c *gin.Context) {
		categories := tools.GetCategories()

		// 获取基于统计的热门工具，如果没有统计数据则使用默认热门工具
		popularTools := tools.GetToolStats().GetMostPopularTools(6)
		if len(popularTools) == 0 {
			// 默认显示 JSON解析器、正则表达式测试、Cron表达式解析、Base64
			popularTools = tools.GetDefaultPopularTools()
		}

		// 获取访客统计信息
		stats := tools.GetVisitorStats().GetStats()

		c.HTML(http.StatusOK, "index", gin.H{
			"Categories":    categories,
			"PopularTools":  popularTools,
			"NewTools":      tools.GetNewTools(),
			"TotalVisitors": stats["total_visitors"],
			"TodayVisitors": stats["today_visitors"],
		})
	})

	// SEO相关路由
	router.GET("/sitemap.xml", func(c *gin.Context) {
		domain := "https://www.johnkingzcq123.xyz" // 替换为你的实际域名
		sitemap, err := tools.GenerateSitemap(domain)
		if err != nil {
			c.String(http.StatusInternalServerError, "生成sitemap失败")
			return
		}
		c.Header("Content-Type", "application/xml")
		c.Data(http.StatusOK, "application/xml", sitemap)
	})

	router.GET("/robots.txt", func(c *gin.Context) {
		domain := "https://www.johnkingzcq123.xyz" // 替换为你的实际域名
		robots := tools.GenerateRobotsTxt(domain)
		c.Header("Content-Type", "text/plain")
		c.String(http.StatusOK, robots)
	})

	// 工具统计管理页面
	router.GET("/tools/tool-stats", func(c *gin.Context) {
		toolStats := tools.GetToolStats()
		stats := toolStats.GetStats()

		// 获取热门工具和访问次数
		popularTools := toolStats.GetMostPopularTools(10)

		c.HTML(http.StatusOK, "tool_stats", gin.H{
			"Stats":        stats,
			"PopularTools": popularTools,
			"ToolCounts":   toolStats.ToolCounts, // 直接使用，避免手动锁操作
		})
	})

	// 限流统计管理页面
	router.GET("/tools/rate-limit-stats", func(c *gin.Context) {
		// 获取限流统计信息
		limiterStats := smartRateLimiter.GetLimiterStats()

		// 获取访客统计信息
		visitorStats := tools.GetVisitorStats().GetStats()

		c.JSON(http.StatusOK, gin.H{
			"success":       true,
			"rate_limit":    limiterStats,
			"visitor_stats": visitorStats,
			"timestamp":     time.Now().Unix(),
		})
	})

	// 搜索功能路由
	router.GET("/search", func(c *gin.Context) {
		query := c.Query("q")
		if query == "" {
			c.Redirect(http.StatusFound, "/")
			return
		}

		// 搜索工具
		categories := tools.GetCategories()
		var results []tools.Tool

		for _, category := range categories {
			for _, tool := range category.Tools {
				if strings.Contains(strings.ToLower(tool.Name), strings.ToLower(query)) ||
					strings.Contains(strings.ToLower(tool.Description), strings.ToLower(query)) {
					results = append(results, tool)
				}
			}
		}

		// 获取访客统计信息
		stats := tools.GetVisitorStats().GetStats()

		c.HTML(http.StatusOK, "index", gin.H{
			"Categories":    categories,
			"PopularTools":  results,
			"NewTools":      []tools.Tool{},
			"SearchQuery":   query,
			"SearchResults": len(results),
			"TotalVisitors": stats["total_visitors"],
			"TodayVisitors": stats["today_visitors"],
		})
	})

	// 工具页面路由
	router.GET("/tools/:tool", func(c *gin.Context) {
		tool := c.Param("tool")
		// 将连字符转换为下划线
		templateName := strings.ReplaceAll(tool, "-", "_")

		// 检查模板是否存在
		if tmpl := router.HTMLRender.Instance(templateName, nil); tmpl == nil {
			c.String(http.StatusNotFound, "工具不存在")
			return
		}

		cats := tools.GetCategories()
		// fmt.Printf("[debug] tools.GetCategories() 返回 %d 个分类，内容示例: %+v\n", len(cats), cats)

		c.HTML(http.StatusOK, templateName, gin.H{
			"Categories": cats,
		})
	})

	// API 路由 - 修改为 /tools/api/
	api := router.Group("/tools/api")
	{
		// 获取工具统计数据
		api.GET("/stats", func(c *gin.Context) {
			toolStats := tools.GetToolStats()
			stats := toolStats.GetStats()
			popularTools := toolStats.GetMostPopularTools(10)

			c.JSON(http.StatusOK, gin.H{
				"success":      true,
				"stats":        stats,
				"popularTools": popularTools,
			})
		})
		// JSON 解析器
		api.POST("/json/format", func(c *gin.Context) {
			var req struct {
				JSON     string `json:"json"`
				SortKeys bool   `json:"sortKeys"`
				Indent   string `json:"indent"`
			}
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  "error",
					"message": "无效的请求数据: " + err.Error(),
				})
				return
			}

			if req.JSON == "" {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  "error",
					"message": "JSON 输入不能为空",
				})
				return
			}

			result, err := tools.ParseJSON(req.JSON)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "JSON 解析错误: " + err.Error(),
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"result":  result.Formatted,
			})
		})

		// JSON 解析器 - 压缩
		api.POST("/json/minify", func(c *gin.Context) {
			var req struct {
				JSON     string `json:"json"`
				SortKeys bool   `json:"sortKeys"`
			}
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "无效的请求数据: " + err.Error(),
				})
				return
			}

			if req.JSON == "" {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "JSON 输入不能为空",
				})
				return
			}

			result, err := tools.CompressJSON(req.JSON)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "JSON 压缩错误: " + err.Error(),
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"result":  result.Compressed,
			})
		})

		// XML 格式化
		api.POST("/xml/format", func(c *gin.Context) {
			var req tools.XMLRequest
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "无效的请求数据: " + err.Error(),
				})
				return
			}

			result, err := tools.ParseXML(&req)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   err.Error(),
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"result":  result.Formatted,
			})
		})

		// XML 压缩
		api.POST("/xml/minify", func(c *gin.Context) {
			var req tools.XMLRequest
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "无效的请求数据: " + err.Error(),
				})
				return
			}

			result, err := tools.MinifyXML(&req)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   err.Error(),
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"result":  result.Minified,
			})
		})

		// SQL 格式化
		api.POST("/sql/format", func(c *gin.Context) {
			var req struct {
				SQL       string `json:"sql"`
				Input     string `json:"input"`
				Uppercase bool   `json:"uppercase"`
				Dialect   string `json:"dialect"`
				Indent    string `json:"indent"`
			}
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "无效的请求数据",
				})
				return
			}

			// 兼容 sql 或 input 字段
			input := req.SQL
			if input == "" {
				input = req.Input
			}
			if strings.TrimSpace(input) == "" {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "SQL 语句不能为空",
				})
				return
			}

			// TODO: 可根据 req.Uppercase, req.Dialect, req.Indent 做进一步格式化
			result, err := tools.FormatSQL(input)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   err.Error(),
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"result":  result.Formatted,
			})
		})

		// SQL 压缩
		api.POST("/sql/minify", func(c *gin.Context) {
			var req struct {
				SQL   string `json:"sql"`
				Input string `json:"input"`
			}
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "无效的请求数据",
				})
				return
			}
			input := req.SQL
			if input == "" {
				input = req.Input
			}
			if strings.TrimSpace(input) == "" {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "SQL 语句不能为空",
				})
				return
			}
			result := tools.MinifySQL(input)
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"result":  result,
			})
		})

		// Base64 编码
		api.POST("/base64/encode", func(c *gin.Context) {
			var req tools.Base64Request
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  "error",
					"message": "无效的请求数据",
				})
				return
			}

			result := tools.EncodeBase64(req.Input)
			c.JSON(http.StatusOK, gin.H{
				"status": "success",
				"output": result.Output,
			})
		})

		// Base64 解码
		api.POST("/base64/decode", func(c *gin.Context) {
			var req tools.Base64Request
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  "error",
					"message": "无效的请求数据",
				})
				return
			}

			result, err := tools.DecodeBase64(req.Input)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  "error",
					"message": "Base64 解码错误: " + err.Error(),
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"status": "success",
				"output": result.Output,
			})
		})

		// URL 编码
		api.POST("/url-encode/encode", func(c *gin.Context) {
			var req tools.URLEncodeRequest
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  "error",
					"message": "无效的请求数据",
				})
				return
			}

			result := tools.EncodeURL(req.Input)
			c.JSON(http.StatusOK, gin.H{
				"status": "success",
				"output": result.Output,
			})
		})

		// URL 解码
		api.POST("/url-encode/decode", func(c *gin.Context) {
			var req tools.URLEncodeRequest
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  "error",
					"message": "无效的请求数据",
				})
				return
			}

			result, err := tools.DecodeURL(req.Input)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  "error",
					"message": err.Error(),
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"status": "success",
				"output": result.Output,
			})
		})

		// 正则表达式测试
		api.POST("/regex-tester", func(c *gin.Context) {
			var req tools.RegexRequest
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  "error",
					"message": "无效的请求数据",
				})
				return
			}

			result, err := tools.TestRegex(req.Pattern, req.Text)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  "error",
					"message": "正则表达式错误: " + err.Error(),
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"status":  "success",
				"matches": result.Matches,
			})
		})

		// Cron 表达式解析
		api.POST("/cron-parser", func(c *gin.Context) {
			var req tools.CronRequest
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  "error",
					"message": "无效的请求数据",
				})
				return
			}

			result := tools.ParseCron(req.Expression)
			c.JSON(http.StatusOK, result)
		})

		// JWT 解析
		api.POST("/jwt-parser", func(c *gin.Context) {
			var req tools.JWTParserRequest
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  "error",
					"message": "无效的请求数据",
				})
				return
			}

			result := tools.ParseJWT(req.Token)

			if result.IsValid {
				c.JSON(http.StatusOK, gin.H{
					"status":    "success",
					"header":    result.Header,
					"payload":   result.Payload,
					"signature": result.Signature,
				})
			} else {
				c.JSON(http.StatusBadRequest, gin.H{
					"status": "error",
					"error":  result.Error,
				})
			}
		})

		// 文本比较
		api.POST("/text-diff", func(c *gin.Context) {
			var req tools.TextDiffRequest
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  "error",
					"message": "无效的请求数据",
				})
				return
			}

			result := tools.CompareTexts(req.Text1, req.Text2)
			c.JSON(http.StatusOK, gin.H{
				"status": "success",
				"diffs":  result.Diffs,
			})
		})

		// Markdown 预览
		api.POST("/markdown/render", func(c *gin.Context) {
			var req tools.MarkdownRequest
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "无效的请求数据",
				})
				return
			}

			result := tools.RenderMarkdown(&req)
			c.JSON(http.StatusOK, result)
		})

		// Markdown 导出
		api.POST("/markdown/export", func(c *gin.Context) {
			var req tools.MarkdownRequest
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "无效的请求数据",
				})
				return
			}

			html, err := tools.ExportMarkdown(&req)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{
					"success": false,
					"error":   err.Error(),
				})
				return
			}

			c.Header("Content-Type", "text/html")
			c.Header("Content-Disposition", "attachment; filename=markdown-export.html")
			c.Data(http.StatusOK, "text/html", html)
		})

		// JSON/YAML 转换
		api.POST("/json-yaml", func(c *gin.Context) {
			var req tools.JSONYAMLRequest
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  "error",
					"message": "无效的请求数据",
				})
				return
			}

			result, err := tools.ConvertJSONYAML(req.Input, req.Type)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  "error",
					"message": err.Error(),
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"status": "success",
				"output": result.Output,
			})
		})

		// YAML 格式化
		api.POST("/yaml/format", func(c *gin.Context) {
			var req struct {
				Yaml      string `json:"yaml"`
				Indent    string `json:"indent"`
				SortKeys  bool   `json:"sortKeys"`
				FlowStyle bool   `json:"flowStyle"`
			}
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "无效的请求数据",
				})
				return
			}

			if req.Yaml == "" {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "YAML 内容不能为空",
				})
				return
			}

			// 设置默认缩进
			indent := 2
			if req.Indent != "" {
				if i, err := strconv.Atoi(req.Indent); err == nil {
					indent = i
				}
			}

			// 解析 YAML
			var data interface{}
			if err := yaml.Unmarshal([]byte(req.Yaml), &data); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   fmt.Sprintf("YAML 解析失败: %v", err),
				})
				return
			}

			// 如果启用了键排序，对 map 进行排序
			if req.SortKeys {
				data = sortMapKeys(data)
			}

			// 编码 YAML
			var buf bytes.Buffer
			encoder := yaml.NewEncoder(&buf)
			encoder.SetIndent(indent)

			if err := encoder.Encode(data); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{
					"success": false,
					"error":   fmt.Sprintf("YAML 编码失败: %v", err),
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"result":  buf.String(),
			})
		})

		// 二维码API
		api.POST("/qrcode", func(c *gin.Context) {
			var req struct {
				Text    string `json:"text"`
				Size    int    `json:"size"`
				FgColor string `json:"fgColor"`
				BgColor string `json:"bgColor"`
			}
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "无效的请求数据",
				})
				return
			}

			img, err := tools.GenerateQRCodeAdvanced(req.Text, req.Size, req.FgColor, req.BgColor, nil)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   err.Error(),
				})
				return
			}

			c.Header("Content-Type", "image/png")
			c.Writer.Write(img)
		})

		api.POST("/qrcode/decode", func(c *gin.Context) {
			file, _, err := c.Request.FormFile("file")
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "文件上传失败"})
				return
			}
			defer file.Close()
			content, err := tools.DecodeQRCode(file)
			if err != nil {
				c.JSON(http.StatusOK, gin.H{"success": false, "error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"success": true, "content": content})
		})

		// 条形码生成器API
		api.POST("/barcode", func(c *gin.Context) {
			var req tools.BarcodeRequest
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "无效的请求数据",
				})
				return
			}

			result := tools.GenerateBarcode(&req)
			if result.Success {
				c.JSON(http.StatusOK, gin.H{
					"success": true,
					"image":   result.Image,
				})
			} else {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   result.Error,
				})
			}
		})

		// 注册图片打水印 API
		api.POST("/watermark", func(c *gin.Context) {
			file, err := c.FormFile("file")
			if err != nil {
				c.String(400, "图片文件获取失败")
				return
			}
			src, err := file.Open()
			if err != nil {
				c.String(500, "文件打开失败")
				return
			}
			defer src.Close()

			tmpInput := filepath.Join(os.TempDir(), fmt.Sprintf("input_%d%s", time.Now().UnixNano(), filepath.Ext(file.Filename)))
			out, err := os.Create(tmpInput)
			if err != nil {
				c.String(500, "临时文件创建失败")
				return
			}
			io.Copy(out, src)
			out.Close()

			text := c.PostForm("text")
			font := c.PostForm("font")
			if font == "" {
				font = "DejaVuSans.ttf"
			}
			fontPath := filepath.Join("static", "ttf", font)

			// 获取字体大小
			fontSize, _ := strconv.ParseFloat(c.PostForm("fontSize"), 64)
			if fontSize == 0 {
				fontSize = 12
			}

			// 获取字体颜色
			fontColor := c.PostForm("fontColor")
			if fontColor == "" {
				fontColor = "#ffffff"
			}

			opacity, _ := strconv.ParseFloat(c.PostForm("opacity"), 32)
			if opacity == 0 {
				opacity = 0.25
			}
			margin, _ := strconv.Atoi(c.PostForm("margin"))
			if margin == 0 {
				margin = 10
			}

			// 获取水印重复选项
			repeat := c.PostForm("repeat") == "true"

			tmpOutput := filepath.Join(os.TempDir(), fmt.Sprintf("output_%d.jpg", time.Now().UnixNano()))
			defer os.Remove(tmpInput)
			defer os.Remove(tmpOutput)

			err = tools.AddTextWatermark(tmpInput, tmpOutput, text, fontPath, fontSize, fontColor, opacity, margin, repeat)
			if err != nil {
				c.String(500, "水印处理失败: "+err.Error())
				return
			}

			c.File(tmpOutput)
		})

		// 注册字体列表 API
		api.GET("/fonts", func(c *gin.Context) {
			fontDir := "static/ttf"
			files, err := os.ReadDir(fontDir)
			if err != nil {
				c.JSON(500, gin.H{"error": "字体目录读取失败"})
				return
			}
			var fonts []string
			for _, f := range files {
				if !f.IsDir() && (strings.HasSuffix(f.Name(), ".ttf") || strings.HasSuffix(f.Name(), ".otf")) {
					fonts = append(fonts, f.Name())
				}
			}
			c.JSON(200, fonts)
		})

		// Postman 相关 API
		// 保存请求历史
		api.POST("/postman/history", func(c *gin.Context) {
			var historyItem tools.RequestHistory
			if err := c.BindJSON(&historyItem); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "无效的请求数据: " + err.Error(),
				})
				return
			}

			// 使用 IP 地址作为用户ID（简单方案）
			userID := c.ClientIP()

			pm := tools.GetPostmanManager()
			pm.AddHistoryItem(userID, historyItem)

			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"message": "历史记录保存成功",
			})
		})

		// 获取环境列表
		api.GET("/postman/environments", func(c *gin.Context) {
			pm := tools.GetPostmanManager()
			environments := pm.GetEnvironments()

			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data":    environments,
			})
		})

		// 创建环境
		api.POST("/postman/environments", func(c *gin.Context) {
			var req struct {
				Name string `json:"name"`
			}
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "无效的请求数据: " + err.Error(),
				})
				return
			}

			pm := tools.GetPostmanManager()
			env := pm.CreateEnvironment(req.Name)

			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data":    env,
			})
		})

		// 更新环境
		api.PUT("/postman/environments/:id", func(c *gin.Context) {
			envID := c.Param("id")
			var req struct {
				Name      string                      `json:"name"`
				Variables []tools.EnvironmentVariable `json:"variables"`
			}
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "无效的请求数据: " + err.Error(),
				})
				return
			}

			pm := tools.GetPostmanManager()
			err := pm.UpdateEnvironment(envID, req.Name, req.Variables)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   err.Error(),
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"message": "环境更新成功",
			})
		})

		// 删除环境
		api.DELETE("/postman/environments/:id", func(c *gin.Context) {
			envID := c.Param("id")

			pm := tools.GetPostmanManager()
			err := pm.DeleteEnvironment(envID)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   err.Error(),
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"message": "环境删除成功",
			})
		})

		// 获取请求历史
		api.GET("/postman/history", func(c *gin.Context) {
			// 使用 IP 地址作为用户ID
			userID := c.ClientIP()

			pm := tools.GetPostmanManager()
			history := pm.GetHistory(userID)

			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data":    history,
			})
		})

		// 清空请求历史
		api.DELETE("/postman/history", func(c *gin.Context) {
			// 使用 IP 地址作为用户ID
			userID := c.ClientIP()

			pm := tools.GetPostmanManager()
			pm.ClearHistory(userID)

			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"message": "历史记录已清空",
			})
		})

		// 导入 curl 命令
		api.POST("/postman/import-curl", func(c *gin.Context) {
			var req struct {
				CurlCommand string `json:"curlCommand"`
			}
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "无效的请求数据: " + err.Error(),
				})
				return
			}

			// 解析 curl 命令
			parser := &tools.CurlParser{}
			httpRequest, err := parser.ParseCurl(req.CurlCommand)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "解析 curl 命令失败: " + err.Error(),
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"data":    httpRequest,
				"message": "curl 命令解析成功",
			})
		})

		// 验证 curl 命令
		api.POST("/postman/validate-curl", func(c *gin.Context) {
			var req struct {
				CurlCommand string `json:"curlCommand"`
			}
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "无效的请求数据: " + err.Error(),
				})
				return
			}

			// 验证 curl 命令
			parser := &tools.CurlParser{}
			err := parser.ValidateCurl(req.CurlCommand)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"success": false,
					"error":   "无效的 curl 命令: " + err.Error(),
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"message": "curl 命令格式正确",
			})
		})

		// 新增网络工具API
		api.GET("/domain-check", tools.HandleDomainCheckAPI)
		api.GET("/ip-lookup", tools.HandleIPLookupAPI)
		api.GET("/my-ip", tools.HandleMyIPAPI)
		api.GET("/port-scan", tools.HandlePortScanAPI)
		api.GET("/ping", tools.HandlePingAPI)
		api.GET("/dns-lookup", tools.HandleDNSLookupAPI)
		api.GET("/ssl-check", tools.HandleSSLCheckAPI)
	}

	// 测试应用API路由
	api.GET("/my-test-app", tools.HandleTestAppAPI)

	// 工具路由
	toolsGroup := router.Group("/tools")
	{
		docToPDFConverter := &tools.DocToPDFConverter{}
		toolsGroup.POST("/doc-to-pdf", docToPDFConverter.HandleDocToPDF)

		// 短链接生成器
		toolsGroup.POST("/shorturl", tools.ShortURLHandler)
		toolsGroup.GET("/shorturl/:shorturl", tools.RedirectHandler)
	}

	// 创建HTTP服务器
	srv := &http.Server{
		Addr:    ":8080",
		Handler: router,
	}

	// 创建一个通道来接收操作系统的信号
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	// 在一个新的goroutine中启动服务器
	go func() {
		accessLogger.Println("HTTP服务器启动在 http://localhost:8080")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errorLogger.Printf("HTTP服务器错误: %v", err)
			quit <- syscall.SIGTERM
		}
	}()

	// 等待中断信号
	<-quit
	accessLogger.Println("正在关闭服务器...")

	// 设置5秒的超时时间来优雅地关闭服务器
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		errorLogger.Printf("服务器强制关闭: %v", err)
	}

	accessLogger.Println("服务器已关闭")
}

// sortMapKeys 递归地对 map 的键进行排序
func sortMapKeys(data interface{}) interface{} {
	switch v := data.(type) {
	case map[interface{}]interface{}:
		// 创建有序的 map
		sortedMap := make(map[interface{}]interface{})
		keys := make([]string, 0, len(v))
		keyMap := make(map[string]interface{})

		// 收集所有键
		for k := range v {
			keyStr := fmt.Sprintf("%v", k)
			keys = append(keys, keyStr)
			keyMap[keyStr] = k
		}

		// 对键进行排序
		sort.Strings(keys)

		// 按排序后的顺序重新构建 map
		for _, keyStr := range keys {
			key := keyMap[keyStr]
			sortedMap[key] = sortMapKeys(v[key])
		}
		return sortedMap

	case []interface{}:
		// 递归处理数组中的每个元素
		for i := range v {
			v[i] = sortMapKeys(v[i])
		}
		return v

	default:
		return v
	}
}
