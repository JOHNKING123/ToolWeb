package tools

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"time"

	"github.com/boombuler/barcode"
	"github.com/boombuler/barcode/code128"
	"github.com/boombuler/barcode/code39"
	"github.com/boombuler/barcode/qr"
	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
)

// BarcodeRequest represents the request structure for barcode generation
type BarcodeRequest struct {
	Text     string `json:"text"`
	Type     string `json:"type"`
	Width    int    `json:"width"`
	Height   int    `json:"height"`
	ShowText bool   `json:"showText"`
}

// BarcodeResponse represents the response structure for barcode generation
type BarcodeResponse struct {
	Success bool   `json:"success"`
	Image   string `json:"image"`
	Error   string `json:"error,omitempty"`
}

// BarcodeType represents supported barcode types
type BarcodeType struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Example     string `json:"example"`
	MaxLength   int    `json:"maxLength"`
	MinLength   int    `json:"minLength"`
}

// GetBarcodeTypes returns all supported barcode types
func GetBarcodeTypes() []BarcodeType {
	return []BarcodeType{
		{
			ID:          "code128",
			Name:        "Code 128",
			Description: "通用条形码，支持ASCII字符",
			Example:     "123456789",
			MaxLength:   50,
			MinLength:   1,
		},
		{
			ID:          "code39",
			Name:        "Code 39",
			Description: "工业标准条形码，支持数字和大写字母",
			Example:     "ABC123",
			MaxLength:   50,
			MinLength:   1,
		},
		{
			ID:          "qr",
			Name:        "QR Code",
			Description: "二维码，支持文本、URL等",
			Example:     "https://example.com",
			MaxLength:   1000,
			MinLength:   1,
		},
	}
}

// GenerateBarcode generates a barcode based on the request
func GenerateBarcode(req *BarcodeRequest) *BarcodeResponse {
	start := time.Now()
	LogInfo("条形码生成器", "开始生成条形码，类型: %s，文本: %s", req.Type, req.Text)

	// 验证输入
	if req.Text == "" {
		LogWarning("条形码生成器", "条形码文本为空")
		return &BarcodeResponse{
			Success: false,
			Error:   "条形码文本不能为空",
		}
	}

	// 设置默认尺寸 - 增加默认尺寸以提高清晰度
	if req.Width <= 0 {
		req.Width = 600 // 增加默认宽度
	}
	if req.Height <= 0 {
		req.Height = 300 // 增加默认高度
	}

	// 确保最小尺寸以保证可读性
	if req.Width < 200 {
		req.Width = 200
	}
	if req.Height < 100 {
		req.Height = 100
	}

	// 生成条形码
	var barcodeImg barcode.Barcode
	var err error

	switch req.Type {
	case "code128":
		barcodeImg, err = generateCode128(req.Text)
	case "code39":
		barcodeImg, err = generateCode39(req.Text)
	case "qr":
		barcodeImg, err = generateQR(req.Text)
		// 二维码使用正方形尺寸，确保足够大
		if req.Width != req.Height {
			size := req.Width
			if req.Height > size {
				size = req.Height
			}
			// 确保二维码最小尺寸
			if size < 300 {
				size = 300
			}
			req.Width = size
			req.Height = size
		}
	default:
		LogError("条形码生成器", fmt.Errorf("不支持的条形码类型"), "条形码类型: %s", req.Type)
		return &BarcodeResponse{
			Success: false,
			Error:   "不支持的条形码类型: " + req.Type,
		}
	}

	if err != nil {
		LogError("条形码生成器", err, "条形码生成失败")
		return &BarcodeResponse{
			Success: false,
			Error:   "条形码生成失败: " + err.Error(),
		}
	}

	// 获取原始尺寸
	originalWidth := barcodeImg.Bounds().Dx()
	originalHeight := barcodeImg.Bounds().Dy()

	// 优化缩放算法 - 确保条形码清晰可读
	var newWidth, newHeight int

	if req.Type == "qr" {
		// 二维码直接使用目标尺寸，不进行比例缩放
		newWidth = req.Width
		newHeight = req.Height
	} else {
		// 条形码保持宽高比，但确保最小可读尺寸
		widthRatio := float64(req.Width) / float64(originalWidth)
		heightRatio := float64(req.Height) / float64(originalHeight)
		ratio := widthRatio
		if heightRatio < widthRatio {
			ratio = heightRatio
		}

		// 确保缩放比例不会太小，影响清晰度
		if ratio < 1.0 {
			// 如果缩小，确保最小缩放比例
			minRatio := 0.5
			if ratio < minRatio {
				ratio = minRatio
			}
		}

		newWidth = int(float64(originalWidth) * ratio)
		newHeight = int(float64(originalHeight) * ratio)

		// 确保最小尺寸
		if newWidth < 200 {
			newWidth = 200
		}
		if newHeight < 80 {
			newHeight = 80
		}
	}

	// 缩放条形码
	barcodeImg, err = barcode.Scale(barcodeImg, newWidth, newHeight)
	if err != nil {
		LogError("条形码生成器", err, "条形码缩放失败")
		return &BarcodeResponse{
			Success: false,
			Error:   "条形码缩放失败: " + err.Error(),
		}
	}

	// 如果需要显示文本，在条形码下方添加文本
	var finalImage image.Image
	if req.ShowText && req.Type != "qr" {
		finalImage, err = addTextToBarcode(barcodeImg, req.Text, newWidth, newHeight)
		if err != nil {
			LogError("条形码生成器", err, "添加文本失败")
			return &BarcodeResponse{
				Success: false,
				Error:   "添加文本失败: " + err.Error(),
			}
		}
	} else {
		finalImage = barcodeImg
	}

	// 转换为PNG格式
	var buf bytes.Buffer
	err = png.Encode(&buf, finalImage)
	if err != nil {
		LogError("条形码生成器", err, "PNG编码失败")
		return &BarcodeResponse{
			Success: false,
			Error:   "PNG编码失败: " + err.Error(),
		}
	}

	// 转换为Base64
	base64Str := base64.StdEncoding.EncodeToString(buf.Bytes())
	imageData := "data:image/png;base64," + base64Str

	LogOperation("条形码生成器", "条形码生成", time.Since(start), nil)
	LogInfo("条形码生成器", "条形码生成成功，类型: %s，尺寸: %dx%d", req.Type, newWidth, newHeight)

	return &BarcodeResponse{
		Success: true,
		Image:   imageData,
	}
}

// generateCode128 generates a Code 128 barcode
func generateCode128(text string) (barcode.Barcode, error) {
	return code128.Encode(text)
}

// generateCode39 generates a Code 39 barcode
func generateCode39(text string) (barcode.Barcode, error) {
	return code39.Encode(text, true, true)
}

// generateQR generates a QR code
func generateQR(text string) (barcode.Barcode, error) {
	// 使用高纠错级别 (H) 和自动编码模式，提高二维码的容错性和清晰度
	return qr.Encode(text, qr.H, qr.Auto)
}

// ValidateBarcodeText validates the text for a specific barcode type
func ValidateBarcodeText(barcodeType, text string) error {
	types := GetBarcodeTypes()
	for _, t := range types {
		if t.ID == barcodeType {
			if len(text) < t.MinLength {
				return fmt.Errorf("%s 最少需要 %d 个字符", t.Name, t.MinLength)
			}
			if len(text) > t.MaxLength {
				return fmt.Errorf("%s 最多支持 %d 个字符", t.Name, t.MaxLength)
			}
			return nil
		}
	}
	return fmt.Errorf("不支持的条形码类型: %s", barcodeType)
}

// addTextToBarcode adds text to the barcode image
func addTextToBarcode(barcodeImg barcode.Barcode, text string, width, height int) (image.Image, error) {
	// 计算文本区域的高度
	textHeight := 30
	totalHeight := height + textHeight

	// 创建新的图像，包含条形码和文本区域
	img := image.NewRGBA(image.Rect(0, 0, width, totalHeight))

	// 设置白色背景
	draw.Draw(img, img.Bounds(), &image.Uniform{color.White}, image.Point{}, draw.Src)

	// 将条形码绘制到图像的上半部分
	barcodeBounds := image.Rect(0, 0, width, height)
	draw.Draw(img, barcodeBounds, barcodeImg, barcodeImg.Bounds().Min, draw.Src)

	// 在条形码下方添加文本
	addText(img, text, width, height, textHeight)

	return img, nil
}

// addText adds text to the image
func addText(img *image.RGBA, text string, width, height, textHeight int) {
	// 使用基本字体
	f := basicfont.Face7x13

	// 计算文本位置（居中）
	textWidth := len(text) * f.Width
	x := (width - textWidth) / 2
	y := height + (textHeight+f.Height)/2

	// 绘制文本
	point := fixed.Point26_6{X: fixed.Int26_6(x * 64), Y: fixed.Int26_6(y * 64)}
	d := &font.Drawer{
		Dst:  img,
		Src:  image.NewUniform(color.Black),
		Face: f,
		Dot:  point,
	}
	d.DrawString(text)
}
