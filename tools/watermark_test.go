package tools

import (
	"fmt"
	"testing"
)

func TestWatermark(t *testing.T) {
	// 配置参数
	inputPath := "/tmp/image.jpg"                  // 主图像路径
	outputPath := "/tmp/output_with_watermark.jpg" // 输出图像路径
	text := "© 2025 MyCompany"                     // 水印文本
	fontPath := "./static/ttf/DejaVuSans.ttf"      // 字体文件路径（需替换为实际路径）

	// 添加水印（不重复，右下角）
	err := AddTextWatermark(inputPath, outputPath, text, fontPath, 12, "#ffffff", 0.25, 10, false)
	if err != nil {
		fmt.Printf("错误: %v\n", err)
		return
	}

	fmt.Println("水印添加成功，输出文件：", outputPath)
}
