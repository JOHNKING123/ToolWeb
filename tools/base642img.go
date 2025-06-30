package tools

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
)

// HandleBase642ImgTool 渲染Base64转图片页面
func HandleBase642ImgTool(c *gin.Context) {
	c.HTML(http.StatusOK, "base642img", gin.H{
		"Title": "Base64转图片",
	})
}

// HandleBase642ImgAPI 处理Base64转图片API
func HandleBase642ImgAPI(c *gin.Context) {
	b64 := c.PostForm("b64")
	if b64 == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "请输入Base64字符串"})
		return
	}
	b64 = strings.TrimSpace(b64)
	mimeType := "image/png"
	filename := "output.png"
	// 兼容data:image头
	re := regexp.MustCompile(`^data:(image/\w+);base64,`)
	if re.MatchString(b64) {
		matches := re.FindStringSubmatch(b64)
		if len(matches) > 1 {
			mimeType = matches[1]
			b64 = b64[len(matches[0]):]
			// 推断扩展名
			ext := "png"
			if strings.Contains(mimeType, "jpeg") {
				ext = "jpg"
			}
			if strings.Contains(mimeType, "gif") {
				ext = "gif"
			}
			if strings.Contains(mimeType, "webp") {
				ext = "webp"
			}
			if strings.Contains(mimeType, "bmp") {
				ext = "bmp"
			}
			filename = "output." + ext
		}
	}
	data, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "Base64解码失败: " + err.Error()})
		return
	}
	c.Header("Content-Type", mimeType)
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	c.Data(http.StatusOK, mimeType, data)
}
