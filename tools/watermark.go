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
// opacity: 水印透明度 (0.0~1.0)
// margin: 边距（像素）
func AddTextWatermark(inputPath, outputPath, text, fontPath string, opacity float64, margin int) error {
	// 读取主图像
	mainImage, err := bimg.Read(inputPath)
	if err != nil {
		return fmt.Errorf("读取主图像失败: %v", err)
	}

	// 获取主图像尺寸
	mainImageSize, err := bimg.NewImage(mainImage).Size()
	if err != nil {
		return fmt.Errorf("获取主图像尺寸失败: %v", err)
	}

	// 生成水印图像
	watermarkImage, err := createTextWatermarkImage(text, fontPath)
	if err != nil {
		return fmt.Errorf("生成水印图像失败: %v", err)
	}

	// 获取水印图像尺寸
	watermarkImg := bimg.NewImage(watermarkImage)
	watermarkSize, err := watermarkImg.Size()
	if err != nil {
		return fmt.Errorf("获取水印图像尺寸失败: %v", err)
	}

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

	return nil
}

// createTextWatermarkImage 生成包含文本的透明背景水印图像
func createTextWatermarkImage(text string, fontPath string) ([]byte, error) {
	width, height := 200, 50 // 可根据需要调整
	img := image.NewRGBA(image.Rect(0, 0, width, height))

	fontData, err := os.ReadFile(fontPath)
	if err != nil {
		return nil, fmt.Errorf("读取字体文件失败: %v", err)
	}
	f, err := truetype.Parse(fontData)
	if err != nil {
		return nil, fmt.Errorf("解析字体失败: %v", err)
	}

	c := freetype.NewContext()
	c.SetDPI(72)
	c.SetFont(f)
	c.SetFontSize(12)
	c.SetClip(img.Bounds())
	c.SetDst(img)
	c.SetSrc(image.NewUniform(color.White))

	pt := freetype.Pt(10, 30)
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
