package tools

import (
	"crypto/md5"
	"encoding/hex"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
)

// HandleMD5Tool 处理MD5工具页面
func HandleMD5Tool(c *gin.Context) {
	c.HTML(http.StatusOK, "md5", gin.H{
		"Title": "MD5 加密/摘要",
	})
}

// HandleMD5API 处理MD5加密API
func HandleMD5API(c *gin.Context) {
	if c.ContentType() == "application/octet-stream" {
		// 文件流模式
		data, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "文件读取失败"})
			return
		}
		hash := md5.Sum(data)
		md5Str := hex.EncodeToString(hash[:])
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"md5":     md5Str,
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
	hash := md5.Sum([]byte(req.Input))
	md5Str := hex.EncodeToString(hash[:])
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"md5":     md5Str,
	})
}
