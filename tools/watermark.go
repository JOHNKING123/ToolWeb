package tools

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"os"

	"github.com/golang/freetype"
	"github.com/golang/freetype/truetype"
	"github.com/h2non/bimg"
)

// AddTextWatermark 在图片右下角添加文本水印
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
	// 读取主图像
	mainImage, err := bimg.Read(inputPath)
	if err != nil {
		return fmt.Errorf("读取主图像失败: %v", err)
	}

	// 确保主图像是 RGBA 格式
	img := bimg.NewImage(mainImage)
	mainImage, err = img.Convert(bimg.PNG)
	if err != nil {
		return fmt.Errorf("转换主图像格式失败: %v", err)
	}

	// 获取主图像尺寸
	mainImageSize, err := bimg.NewImage(mainImage).Size()
	if err != nil {
		return fmt.Errorf("获取主图像尺寸失败: %v", err)
	}

	if repeat {
		// 如果选择重复水印，使用 Watermark 选项
		watermarkOptions := bimg.Watermark{
			Text:        text,
			Font:        fontPath,
			Width:       200,
			DPI:         100,
			Margin:      150,
			Opacity:     float32(opacity),
			NoReplicate: false,
			Background:  bimg.Color{0, 0, 0},
		}

		// 应用水印
		outputImage, err := bimg.NewImage(mainImage).Watermark(watermarkOptions)
		if err != nil {
			return fmt.Errorf("添加水印失败: %v", err)
		}

		// 保存输出图像
		err = bimg.Write(outputPath, outputImage)
		if err != nil {
			return fmt.Errorf("保存图像失败: %v", err)
		}
	} else {
		// 生成水印图像
		watermarkImage, err := createTextWatermarkImage(text, fontPath, fontSize, fontColor)
		if err != nil {
			return fmt.Errorf("生成水印图像失败: %v", err)
		}

		// 获取水印图像尺寸
		watermarkImg := bimg.NewImage(watermarkImage)
		watermarkSize, err := watermarkImg.Size()
		if err != nil {
			return fmt.Errorf("获取水印图像尺寸失败: %v", err)
		}
		// 如果选择不重复水印，使用 WatermarkImage 选项
		// 计算右下角位置
		top := mainImageSize.Height - watermarkSize.Height - margin
		left := mainImageSize.Width - watermarkSize.Width - margin

		// 配置 WatermarkImage 参数
		watermarkOptions := bimg.WatermarkImage{
			Left:    left,
			Top:     top,
			Buf:     watermarkImage,
			Opacity: float32(opacity),
		}

		// 应用水印
		outputImage, err := bimg.NewImage(mainImage).WatermarkImage(watermarkOptions)
		if err != nil {
			return fmt.Errorf("添加水印失败: %v", err)
		}

		// 保存输出图像
		err = bimg.Write(outputPath, outputImage)
		if err != nil {
			return fmt.Errorf("保存图像失败: %v", err)
		}
	}

	return nil
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
