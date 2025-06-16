package tools

import (
	"fmt"
	"testing"

	"github.com/h2non/bimg"
)

// addWatermarkToImage 在图像右下角添加文本水印
func addWatermarkToImage(inputPath, outputPath, text, fontPath string) error {
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

	// 计算右下角位置（留 20 像素边距）
	margin := 10
	top := mainImageSize.Height - watermarkSize.Height - margin
	left := mainImageSize.Width - watermarkSize.Width - margin

	// 配置 WatermarkImage 参数
	watermarkOptions := bimg.WatermarkImage{
		Left:    left,
		Top:     top,
		Buf:     watermarkImage,
		Opacity: 0.25, // 水印透明度
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

func TestWartermark(t *testing.T) {
	// 配置参数
	inputPath := "/tmp/image.jpg"                  // 主图像路径
	outputPath := "/tmp/output_with_watermark.jpg" // 输出图像路径
	text := "© 2025 MyCompany"                     // 水印文本
	fontPath := "./static/ttf/DejaVuSans.ttf"      // 字体文件路径（需替换为实际路径）

	// 添加水印
	err := addWatermarkToImage(inputPath, outputPath, text, fontPath)
	if err != nil {
		fmt.Printf("错误: %v\n", err)
		return
	}

	fmt.Println("水印添加成功，输出文件：", outputPath)
}
