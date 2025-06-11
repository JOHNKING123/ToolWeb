package main

import (
	"fmt"
	"image"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"

	"toolweb/middleware"
	"toolweb/tools"

	"github.com/gin-gonic/gin"
)

func main() {
	// 初始化访客统计
	tools.InitVisitorStats()

	router := gin.Default()

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

	// 页面路由
	router.GET("/", func(c *gin.Context) {
		categories := tools.GetCategories()
		popularTools := tools.GetPopularTools()
		newTools := tools.GetNewTools()

		// 获取访客统计信息
		stats := tools.GetVisitorStats().GetStats()

		c.HTML(http.StatusOK, "index", gin.H{
			"Categories":    categories,
			"PopularTools":  popularTools,
			"NewTools":      newTools,
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
		// 获取分类和工具数据
		categories := tools.GetCategories()
		popularTools := tools.GetPopularTools()
		newTools := tools.GetNewTools()

		// 获取访客统计信息
		stats := tools.GetVisitorStats().GetStats()

		c.HTML(http.StatusOK, "index", gin.H{
			"Categories":    categories,
			"PopularTools":  popularTools,
			"NewTools":      newTools,
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

		c.HTML(http.StatusOK, templateName, nil)
	})

	// 工具页面路由
	router.GET("/tools/url-codec", func(c *gin.Context) {
		c.HTML(http.StatusOK, "url_codec", nil)
	})

	// 工具页面路由
	router.GET("/tools/xml-parser", func(c *gin.Context) {
		c.HTML(http.StatusOK, "xml_formatter", nil)
	})

	// 二维码工具页面
	router.GET("/tools/qrcode", func(c *gin.Context) {
		c.HTML(http.StatusOK, "qrcode", nil)
	})

	// API 路由 - 修改为 /tools/api/
	api := router.Group("/tools/api")
	{
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
			c.JSON(http.StatusOK, result)
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

		// 二维码API
		api.POST("/qrcode/generate", func(c *gin.Context) {
			// 支持表单和json两种方式
			text := c.PostForm("text")
			if text == "" {
				var req struct {
					Text    string `json:"text"`
					Size    int    `json:"size"`
					FgColor string `json:"fgColor"`
					BgColor string `json:"bgColor"`
				}
				if err := c.BindJSON(&req); err == nil {
					text = req.Text
					if text == "" {
						c.String(http.StatusBadRequest, "内容不能为空")
						return
					}
					size := req.Size
					fgColor := req.FgColor
					bgColor := req.BgColor
					// logo 仅支持表单上传
					img, err := tools.GenerateQRCodeAdvanced(text, size, fgColor, bgColor, nil)
					if err != nil {
						c.String(http.StatusInternalServerError, err.Error())
						return
					}
					c.Header("Content-Type", "image/png")
					c.Writer.Write(img)
					return
				}
			}
			// 表单方式，支持logo上传
			size := 256
			if s := c.PostForm("size"); s != "" {
				fmt.Sscanf(s, "%d", &size)
			}
			fgColor := c.PostForm("fgColor")
			bgColor := c.PostForm("bgColor")
			var logo image.Image = nil
			file, _, err := c.Request.FormFile("logo")
			if err == nil && file != nil {
				defer file.Close()
				logo, _, _ = image.Decode(file)
			}
			img, err := tools.GenerateQRCodeAdvanced(text, size, fgColor, bgColor, logo)
			if err != nil {
				c.String(http.StatusInternalServerError, err.Error())
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
	}

	// 启动服务器
	log.Println("服务器启动在 http://localhost:8080")
	if err := router.Run(":8080"); err != nil {
		log.Fatal(err)
	}
}
