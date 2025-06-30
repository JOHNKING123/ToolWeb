package tools

import (
	"bytes"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// HandleImgCompressTool 渲染图片压缩页面
func HandleImgCompressTool(c *gin.Context) {
	c.HTML(http.StatusOK, "img_compress", gin.H{
		"Title": "图片压缩",
	})
}

// HandleImgCompressAPI 处理图片压缩API
func HandleImgCompressAPI(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "图片文件获取失败"})
		return
	}
	qualityStr := c.PostForm("quality")
	quality := 80
	if qualityStr != "" {
		if q, err := strconv.Atoi(qualityStr); err == nil && q >= 1 && q <= 100 {
			quality = q
		}
	}
	targetFormat := c.PostForm("format")
	if targetFormat == "" {
		targetFormat = "jpg"
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
		err = jpeg.Encode(&buf, img, &jpeg.Options{Quality: quality})
		c.Header("Content-Type", "image/jpeg")
	case "png":
		// PNG无损压缩，Go标准库不支持有损压缩
		err = png.Encode(&buf, img)
		c.Header("Content-Type", "image/png")
	case "gif":
		err = gif.Encode(&buf, img, nil)
		c.Header("Content-Type", "image/gif")
	default:
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "暂不支持该目标格式"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "图片压缩失败: " + err.Error()})
		return
	}
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=compressed.%s", targetFormat))
	c.Data(http.StatusOK, c.GetHeader("Content-Type"), buf.Bytes())
}
