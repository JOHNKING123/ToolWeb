package tools

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
)

// HandleSHA256Tool 处理SHA256工具页面
func HandleSHA256Tool(c *gin.Context) {
	c.HTML(http.StatusOK, "sha256", gin.H{
		"Title": "SHA256 摘要",
	})
}

// HandleSHA256API 处理SHA256摘要API
func HandleSHA256API(c *gin.Context) {
	if c.ContentType() == "application/octet-stream" {
		// 文件流模式
		data, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "文件读取失败"})
			return
		}
		hash := sha256.Sum256(data)
		sha256Str := hex.EncodeToString(hash[:])
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"sha256":  sha256Str,
		})
		return
	}
	// 兼容原有JSON模式
	var req struct {
		Input string `json:"input" form:"input"`
	}
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "参数错误"})
		return
	}
	hash := sha256.Sum256([]byte(req.Input))
	sha256Str := hex.EncodeToString(hash[:])
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"sha256":  sha256Str,
	})
}
