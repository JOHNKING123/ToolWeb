package tools

import (
	"bytes"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// HandleImgConvertTool 渲染图片格式转换页面
func HandleImgConvertTool(c *gin.Context) {
	c.HTML(http.StatusOK, "img_convert", gin.H{
		"Title": "图片格式转换",
	})
}

// HandleImgConvertAPI 处理图片格式转换API
func HandleImgConvertAPI(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "图片文件获取失败"})
		return
	}
	targetFormat := c.PostForm("format")
	if targetFormat == "" {
		targetFormat = "png"
	}
	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "文件打开失败"})
		return
	}
	defer src.Close()
	img, _, err := image.Decode(src)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "图片解码失败: " + err.Error()})
		return
	}
	var buf bytes.Buffer
	switch strings.ToLower(targetFormat) {
	case "jpg", "jpeg":
		err = jpeg.Encode(&buf, img, &jpeg.Options{Quality: 92})
		c.Header("Content-Type", "image/jpeg")
	case "png":
		err = png.Encode(&buf, img)
		c.Header("Content-Type", "image/png")
	case "gif":
		err = gif.Encode(&buf, img, nil)
		c.Header("Content-Type", "image/gif")
	case "bmp":
		err = encodeBMP(&buf, img)
		c.Header("Content-Type", "image/bmp")
	case "webp":
		err = fmt.Errorf("暂未安装webp库，无法支持webp格式。如需支持请安装github.com/chai2010/webp")
		c.Header("Content-Type", "application/octet-stream")
	default:
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "暂不支持该目标格式"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "图片编码失败: " + err.Error()})
		return
	}
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=converted.%s", targetFormat))
	c.Data(http.StatusOK, c.GetHeader("Content-Type"), buf.Bytes())
}

// encodeBMP 简单BMP编码（可选第三方库完善）
func encodeBMP(w *bytes.Buffer, img image.Image) error {
	return fmt.Errorf("暂不支持BMP编码")
}
