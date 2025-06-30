package tools

import (
	"crypto/sha1"
	"encoding/hex"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
)

// HandleSHA1Tool 处理SHA1工具页面
func HandleSHA1Tool(c *gin.Context) {
	c.HTML(http.StatusOK, "sha1", gin.H{
		"Title": "SHA1 摘要",
	})
}

// HandleSHA1API 处理SHA1摘要API
func HandleSHA1API(c *gin.Context) {
	if c.ContentType() == "application/octet-stream" {
		// 文件流模式
		data, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "文件读取失败"})
			return
		}
		hash := sha1.Sum(data)
		sha1Str := hex.EncodeToString(hash[:])
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"sha1":    sha1Str,
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
	hash := sha1.Sum([]byte(req.Input))
	sha1Str := hex.EncodeToString(hash[:])
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"sha1":    sha1Str,
	})
}
