package main

import (
	"log"
	"net/http"
	"strings"

	"toolweb/tools"

	"github.com/gin-gonic/gin"
)

func main() {
	router := gin.Default()

	// 加载HTML模板
	router.LoadHTMLGlob("templates/*")

	// 静态文件服务 - 修改为 /tools/static/
	router.Static("/tools/static", "./static")

	// 页面路由 - 保持根路径不变
	router.GET("/", func(c *gin.Context) {
		// 获取分类和工具数据
		categories := tools.GetCategories()
		popularTools := tools.GetPopularTools()
		newTools := tools.GetNewTools()

		c.HTML(http.StatusOK, "index", gin.H{
			"Categories":   categories,
			"PopularTools": popularTools,
			"NewTools":     newTools,
		})
	})

	// 工具首页路由
	router.GET("/tools/index", func(c *gin.Context) {
		// 获取分类和工具数据
		categories := tools.GetCategories()
		popularTools := tools.GetPopularTools()
		newTools := tools.GetNewTools()

		c.HTML(http.StatusOK, "index", gin.H{
			"Categories":   categories,
			"PopularTools": popularTools,
			"NewTools":     newTools,
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

	// API 路由 - 修改为 /tools/api/
	api := router.Group("/tools/api")
	{
		// JSON 解析器
		api.POST("/json-parser", func(c *gin.Context) {
			var req tools.JSONParserRequest
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  "error",
					"message": "无效的请求数据",
				})
				return
			}

			result, err := tools.ParseJSON(req.Input)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  "error",
					"message": "JSON 解析错误: " + err.Error(),
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"status":    "success",
				"formatted": result.Formatted,
			})
		})

		// XML 格式化
		api.POST("/xml-parser", func(c *gin.Context) {
			var req tools.XMLParserRequest
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  "error",
					"message": "无效的请求数据",
				})
				return
			}

			result, err := tools.ParseXML(req.Input)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  "error",
					"message": err.Error(),
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"status":    "success",
				"formatted": result.Formatted,
			})
		})

		// SQL 格式化
		api.POST("/sql-formatter", func(c *gin.Context) {
			var req tools.SQLFormatterRequest
			if err := c.BindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  "error",
					"message": "无效的请求数据",
				})
				return
			}

			result, err := tools.FormatSQL(req.Input)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{
					"status":  "error",
					"message": err.Error(),
				})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"status":    "success",
				"formatted": result.Formatted,
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
	}

	// 启动服务器
	log.Println("服务器启动在 http://localhost:8080")
	if err := router.Run(":8080"); err != nil {
		log.Fatal(err)
	}
}
