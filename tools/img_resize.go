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

// HandleImgResizeTool 渲染图片尺寸调整页面
func HandleImgResizeTool(c *gin.Context) {
	c.HTML(http.StatusOK, "img_resize", gin.H{
		"Title": "图片尺寸调整",
	})
}

// HandleImgResizeAPI 处理图片尺寸调整API
func HandleImgResizeAPI(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "图片文件获取失败"})
		return
	}
	widthStr := c.PostForm("width")
	heightStr := c.PostForm("height")
	mode := c.PostForm("mode") // scale/crop
	if mode == "" {
		mode = "scale"
	}
	width, _ := strconv.Atoi(widthStr)
	height, _ := strconv.Atoi(heightStr)
	if width <= 0 && height <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "请至少指定宽度或高度"})
		return
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
	// 计算目标尺寸
	ow, oh := img.Bounds().Dx(), img.Bounds().Dy()
	if width <= 0 {
		width = int(float64(ow) * float64(height) / float64(oh))
	}
	if height <= 0 {
		height = int(float64(oh) * float64(width) / float64(ow))
	}
	var dst image.Image
	if mode == "crop" {
		// 强制裁剪到指定宽高（简单缩放实现）
		dst = resizeImageSimple(img, width, height)
	} else {
		// 等比缩放到最大边
		ratioW := float64(width) / float64(ow)
		ratioH := float64(height) / float64(oh)
		ratio := ratioW
		if ratioH < ratioW {
			ratio = ratioH
		}
		newW := int(float64(ow) * ratio)
		newH := int(float64(oh) * ratio)
		dst = resizeImageSimple(img, newW, newH)
	}
	var buf bytes.Buffer
	switch strings.ToLower(targetFormat) {
	case "jpg", "jpeg":
		err = jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 92})
		c.Header("Content-Type", "image/jpeg")
	case "png":
		err = png.Encode(&buf, dst)
		c.Header("Content-Type", "image/png")
	case "gif":
		err = gif.Encode(&buf, dst, nil)
		c.Header("Content-Type", "image/gif")
	default:
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "暂不支持该目标格式"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": "图片尺寸调整失败: " + err.Error()})
		return
	}
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=resized.%s", targetFormat))
	c.Data(http.StatusOK, c.GetHeader("Content-Type"), buf.Bytes())
}

// 简单缩放图片到指定大小
func resizeImageSimple(img image.Image, w, h int) image.Image {
	result := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			srcX := x * img.Bounds().Dx() / w
			srcY := y * img.Bounds().Dy() / h
			result.Set(x, y, img.At(srcX, srcY))
		}
	}
	return result
}
