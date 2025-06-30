package tools

import (
	"encoding/base64"
	"fmt"
	"io/ioutil"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

// HandleImg2Base64Tool 渲染图片转Base64页面
func HandleImg2Base64Tool(c *gin.Context) {
	c.HTML(http.StatusOK, "img2base64", gin.H{
		"Title": "图片转Base64",
	})
}

// HandleImg2Base64API 处理图片转Base64 API
func HandleImg2Base64API(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "图片文件获取失败"})
		return
	}
	mode := c.PostForm("mode") // base64/dataurl
	if mode == "" {
		mode = "dataurl"
	}
	f, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "文件打开失败"})
		return
	}
	defer f.Close()
	data, err := ioutil.ReadAll(f)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "读取文件失败"})
		return
	}
	b64 := base64.StdEncoding.EncodeToString(data)
	var result string
	if mode == "dataurl" {
		mimeType := detectImageMimeType(file)
		result = fmt.Sprintf("data:%s;base64,%s", mimeType, b64)
	} else {
		result = b64
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"result":  result,
	})
}

// detectImageMimeType 根据文件扩展名推断MIME类型
func detectImageMimeType(file *multipart.FileHeader) string {
	ext := strings.ToLower(filepath.Ext(file.Filename))
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".bmp":
		return "image/bmp"
	default:
		return "application/octet-stream"
	}
}
