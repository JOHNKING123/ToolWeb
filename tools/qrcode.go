package tools

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"io"
	"time"

	qrcode "github.com/skip2/go-qrcode"
)

// GenerateQRCode 生成简单的二维码
func GenerateQRCode(text string) ([]byte, error) {
	start := time.Now()
	LogInfo("二维码生成器", "开始生成二维码，文本长度: %d", len(text))

	qr, err := qrcode.New(text, qrcode.Medium)
	if err != nil {
		LogError("二维码生成器", err, "创建二维码失败")
		return nil, fmt.Errorf("创建二维码失败: %v", err)
	}

	var buf bytes.Buffer
	err = png.Encode(&buf, qr.Image(256))
	if err != nil {
		LogError("二维码生成器", err, "编码二维码图片失败")
		return nil, fmt.Errorf("编码二维码图片失败: %v", err)
	}

	LogOperation("二维码生成器", "生成二维码", time.Since(start), nil)
	LogInfo("二维码生成器", "二维码生成成功，图片大小: %d bytes", buf.Len())

	return buf.Bytes(), nil
}

// GenerateQRCodeAdvanced 生成高级二维码（支持自定义大小、颜色和Logo）
func GenerateQRCodeAdvanced(text string, size int, fgColor, bgColor string, logo image.Image) ([]byte, error) {
	start := time.Now()
	LogInfo("二维码生成器", "开始生成高级二维码，文本长度: %d, 大小: %d", len(text), size)

	// 创建二维码
	qr, err := qrcode.New(text, qrcode.Medium)
	if err != nil {
		LogError("二维码生成器", err, "创建二维码失败")
		return nil, fmt.Errorf("创建二维码失败: %v", err)
	}

	// 设置颜色
	if fgColor != "" {
		c, err := parseHexColor(fgColor)
		if err != nil {
			LogWarning("二维码生成器", "前景色解析失败: %v，使用默认黑色", err)
		} else {
			qr.ForegroundColor = c
		}
	}

	if bgColor != "" {
		c, err := parseHexColor(bgColor)
		if err != nil {
			LogWarning("二维码生成器", "背景色解析失败: %v，使用默认白色", err)
		} else {
			qr.BackgroundColor = c
		}
	}

	// 生成二维码图片
	qrImage := qr.Image(size)

	// 如果有Logo，添加到二维码中心
	if logo != nil {
		LogInfo("二维码生成器", "开始添加Logo")
		qrImage = drawLogo(qrImage, logo)
	}

	// 编码为PNG
	var buf bytes.Buffer
	err = png.Encode(&buf, qrImage)
	if err != nil {
		LogError("二维码生成器", err, "编码二维码图片失败")
		return nil, fmt.Errorf("编码二维码图片失败: %v", err)
	}

	LogOperation("二维码生成器", "生成高级二维码", time.Since(start), nil)
	LogInfo("二维码生成器", "高级二维码生成成功，图片大小: %d bytes", buf.Len())

	return buf.Bytes(), nil
}

// DecodeQRCode 解码二维码图片
func DecodeQRCode(file io.Reader) (string, error) {
	start := time.Now()
	LogInfo("二维码生成器", "开始解码二维码")

	// 解码PNG图片
	_, err := png.Decode(file)
	if err != nil {
		LogError("二维码生成器", err, "解码PNG图片失败")
		return "", fmt.Errorf("解码PNG图片失败: %v", err)
	}

	// TODO: 实现二维码解码逻辑
	// 这里需要添加实际的二维码解码实现
	// 可以使用第三方库如 github.com/tuotoo/qrcode 或其他库

	LogOperation("二维码生成器", "解码二维码", time.Since(start), nil)
	LogWarning("二维码生成器", "二维码解码功能尚未实现")
	return "二维码解码功能尚未实现", nil
}

// 辅助函数：解析十六进制颜色
func parseHexColor(s string) (color.Color, error) {
	if len(s) == 0 {
		return color.Black, nil
	}

	if s[0] == '#' {
		s = s[1:]
	}

	if len(s) != 6 {
		return nil, fmt.Errorf("无效的颜色格式: %s", s)
	}

	var r, g, b uint8
	_, err := fmt.Sscanf(s, "%02x%02x%02x", &r, &g, &b)
	if err != nil {
		return nil, err
	}

	return color.RGBA{r, g, b, 255}, nil
}

// 在二维码中心绘制logo
func drawLogo(qrImg image.Image, logo image.Image) image.Image {
	qrBounds := qrImg.Bounds()
	// logoBounds := logo.Bounds() // 已不需要，移除
	// logo缩放到二维码的1/4
	logoW := qrBounds.Dx() / 4
	logoH := qrBounds.Dy() / 4
	logoResized := resizeImage(logo, logoW, logoH)
	// 合成
	result := image.NewRGBA(qrBounds)
	draw.Draw(result, qrBounds, qrImg, image.Point{}, draw.Over)
	// 居中
	offset := image.Pt((qrBounds.Dx()-logoW)/2, (qrBounds.Dy()-logoH)/2)
	draw.Draw(result, image.Rect(offset.X, offset.Y, offset.X+logoW, offset.Y+logoH), logoResized, image.Point{}, draw.Over)
	return result
}

// 简单缩放图片到指定大小
func resizeImage(img image.Image, w, h int) image.Image {
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
