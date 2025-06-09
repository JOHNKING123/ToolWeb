package tools

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"io"
	"strings"

	qrcode "github.com/skip2/go-qrcode"
	tuotooqrcode "github.com/tuotoo/qrcode"
)

// 生成二维码，支持自定义颜色、背景色、logo
func GenerateQRCodeAdvanced(text string, size int, fgColor, bgColor string, logo image.Image) ([]byte, error) {
	if text == "" {
		return nil, fmt.Errorf("内容不能为空")
	}
	if size <= 0 {
		size = 256
	}
	qr, err := qrcode.New(text, qrcode.Medium)
	if err != nil {
		return nil, err
	}
	// 设置颜色
	if fgColor != "" {
		qr.ForegroundColor = parseHexColor(fgColor)
	}
	if bgColor != "" {
		qr.BackgroundColor = parseHexColor(bgColor)
	}
	img := qr.Image(size)
	// 合成logo
	if logo != nil {
		img = drawLogo(img, logo)
	}
	buf := new(bytes.Buffer)
	if err := png.Encode(buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// 解析16进制颜色字符串为color.Color
func parseHexColor(s string) color.Color {
	s = strings.TrimPrefix(s, "#")
	var r, g, b uint8 = 0, 0, 0
	if len(s) == 6 {
		fmt.Sscanf(s, "%02x%02x%02x", &r, &g, &b)
	}
	return color.RGBA{r, g, b, 255}
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

// 识别二维码，返回内容
func DecodeQRCode(reader io.Reader) (string, error) {
	qrMatrix, err := tuotooqrcode.Decode(reader)
	if err != nil {
		return "", fmt.Errorf("二维码识别失败: %v", err)
	}
	return qrMatrix.Content, nil
}
