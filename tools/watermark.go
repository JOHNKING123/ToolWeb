package tools

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"strings"

	"github.com/golang/freetype"
	"github.com/golang/freetype/truetype"
)

// AddTextWatermark 在图片添加文本水印
// inputPath: 输入图片路径
// outputPath: 输出图片路径
// text: 水印文本
// fontPath: 字体文件路径
// fontSize: 字体大小
// fontColor: 字体颜色（十六进制格式，如 "#ffffff"）
// opacity: 水印透明度 (0.0~1.0)
// margin: 边距（像素）
// repeat: 是否重复水印
func AddTextWatermark(inputPath, outputPath, text, fontPath string, fontSize float64, fontColor string, opacity float64, margin int, repeat bool) error {
	// 读取并解码主图像
	mainImg, format, err := decodeImageFile(inputPath)
	if err != nil {
		return fmt.Errorf("读取主图像失败: %v", err)
	}

	// 将主图像转换为 RGBA 格式以便绘制
	bounds := mainImg.Bounds()
	rgbaImg := image.NewRGBA(bounds)
	draw.Draw(rgbaImg, bounds, mainImg, bounds.Min, draw.Src)

	// 生成水印图像
	watermarkImg, err := createTextWatermarkImage(text, fontPath, fontSize, fontColor)
	if err != nil {
		return fmt.Errorf("生成水印图像失败: %v", err)
	}

	// 解码水印图像
	wmImg, err := png.Decode(bytes.NewReader(watermarkImg))
	if err != nil {
		return fmt.Errorf("解码水印图像失败: %v", err)
	}

	// 应用透明度
	wmRGBA := applyOpacity(wmImg, opacity)

	if repeat {
		// 重复水印：在整个图像上平铺水印
		drawRepeatedWatermark(rgbaImg, wmRGBA, margin)
	} else {
		// 单个水印：放在右下角
		wmBounds := wmRGBA.Bounds()
		offsetX := bounds.Max.X - wmBounds.Dx() - margin
		offsetY := bounds.Max.Y - wmBounds.Dy() - margin
		drawPoint := image.Pt(offsetX, offsetY)
		draw.Draw(rgbaImg, image.Rectangle{Min: drawPoint, Max: drawPoint.Add(wmBounds.Size())}, wmRGBA, wmBounds.Min, draw.Over)
	}

	// 保存输出图像
	err = encodeImageFile(outputPath, rgbaImg, format)
	if err != nil {
		return fmt.Errorf("保存图像失败: %v", err)
	}

	return nil
}

// decodeImageFile 读取并解码图片文件
func decodeImageFile(path string) (image.Image, string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, "", err
	}
	defer f.Close()

	img, format, err := image.Decode(f)
	if err != nil {
		return nil, "", err
	}
	return img, format, nil
}

// encodeImageFile 将图像编码并写入文件
func encodeImageFile(path string, img image.Image, format string) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	ext := strings.ToLower(filepath.Ext(path))
	switch {
	case ext == ".png":
		return png.Encode(f, img)
	case ext == ".jpg" || ext == ".jpeg" || format == "jpeg":
		return jpeg.Encode(f, img, &jpeg.Options{Quality: 90})
	default:
		// 默认使用 JPEG 格式
		return jpeg.Encode(f, img, &jpeg.Options{Quality: 90})
	}
}

// applyOpacity 对图像应用透明度
func applyOpacity(img image.Image, opacity float64) *image.RGBA {
	bounds := img.Bounds()
	result := image.NewRGBA(bounds)

	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b, a := img.At(x, y).RGBA()
			newA := uint8(math.Min(float64(a>>8)*opacity, 255))
			result.Set(x, y, color.RGBA{
				R: uint8(r >> 8),
				G: uint8(g >> 8),
				B: uint8(b >> 8),
				A: newA,
			})
		}
	}
	return result
}

// drawRepeatedWatermark 在整个图像上平铺水印
func drawRepeatedWatermark(dst *image.RGBA, watermark *image.RGBA, spacing int) {
	dstBounds := dst.Bounds()
	wmBounds := watermark.Bounds()
	wmW := wmBounds.Dx()
	wmH := wmBounds.Dy()

	// 在整个图像上按间距平铺
	for y := spacing; y < dstBounds.Max.Y; y += wmH + spacing {
		for x := spacing; x < dstBounds.Max.X; x += wmW + spacing {
			drawPoint := image.Pt(x, y)
			drawRect := image.Rectangle{Min: drawPoint, Max: drawPoint.Add(wmBounds.Size())}
			draw.Draw(dst, drawRect, watermark, wmBounds.Min, draw.Over)
		}
	}
}

// createTextWatermarkImage 生成包含文本的透明背景水印图像
func createTextWatermarkImage(text string, fontPath string, fontSize float64, fontColor string) ([]byte, error) {
	// 根据字体大小动态计算水印图片尺寸
	width := int(float64(len(text)) * fontSize * 0.6) // 根据文本长度和字体大小计算宽度
	height := int(fontSize * 2)                       // 根据字体大小计算高度
	img := image.NewRGBA(image.Rect(0, 0, width, height))

	// 设置透明背景
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{0, 0, 0, 0})
		}
	}

	fontData, err := os.ReadFile(fontPath)
	if err != nil {
		return nil, fmt.Errorf("读取字体文件失败: %v", err)
	}
	f, err := truetype.Parse(fontData)
	if err != nil {
		return nil, fmt.Errorf("解析字体失败: %v", err)
	}

	// 解析颜色
	var r, g, b uint8
	_, err = fmt.Sscanf(fontColor, "#%02x%02x%02x", &r, &g, &b)
	if err != nil {
		return nil, fmt.Errorf("解析颜色失败: %v", err)
	}

	c := freetype.NewContext()
	c.SetDPI(72)
	c.SetFont(f)
	c.SetFontSize(fontSize)
	c.SetClip(img.Bounds())
	c.SetDst(img)
	c.SetSrc(image.NewUniform(color.RGBA{r, g, b, 255}))

	// 计算文本位置，使其垂直居中
	pt := freetype.Pt(5, int(fontSize*1.2))
	_, err = c.DrawString(text, pt)
	if err != nil {
		return nil, fmt.Errorf("绘制文本失败: %v", err)
	}

	buf := new(bytes.Buffer)
	err = png.Encode(buf, img)
	if err != nil {
		return nil, fmt.Errorf("编码 PNG 失败: %v", err)
	}

	return buf.Bytes(), nil
}
