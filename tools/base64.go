package tools

import (
	"encoding/base64"
	"fmt"
	"time"
)

// Base64Request represents the request structure for Base64 operations
type Base64Request struct {
	Input string `json:"input"`
}

// Base64Response represents the response structure for Base64 operations
type Base64Response struct {
	Output string `json:"output"`
}

// EncodeBase64 encodes a string to Base64
func EncodeBase64(input string) *Base64Response {
	start := time.Now()
	LogInfo("Base64工具", "开始Base64编码，输入长度: %d", len(input))

	if input == "" {
		LogWarning("Base64工具", "输入为空")
		return &Base64Response{Output: ""}
	}

	encoded := base64.StdEncoding.EncodeToString([]byte(input))

	LogOperation("Base64工具", "Base64编码", time.Since(start), nil)
	LogInfo("Base64工具", "Base64编码成功，输出长度: %d", len(encoded))

	return &Base64Response{
		Output: encoded,
	}
}

// DecodeBase64 decodes a Base64 string
func DecodeBase64(input string) (*Base64Response, error) {
	start := time.Now()
	LogInfo("Base64工具", "开始Base64解码，输入长度: %d", len(input))

	if input == "" {
		LogWarning("Base64工具", "输入为空")
		return &Base64Response{Output: ""}, nil
	}

	decoded, err := base64.StdEncoding.DecodeString(input)
	if err != nil {
		LogError("Base64工具", err, "Base64解码失败")
		return nil, fmt.Errorf("Base64解码失败: %v", err)
	}

	LogOperation("Base64工具", "Base64解码", time.Since(start), nil)
	LogInfo("Base64工具", "Base64解码成功，输出长度: %d", len(decoded))

	return &Base64Response{
		Output: string(decoded),
	}, nil
}
