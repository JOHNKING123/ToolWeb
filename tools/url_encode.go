package tools

import (
	"fmt"
	"net/url"
	"time"
)

// URLEncodeRequest 表示 URL 编码/解码请求
type URLEncodeRequest struct {
	Input string `json:"input"`
}

// URLEncodeResponse 表示 URL 编码/解码响应
type URLEncodeResponse struct {
	Output string `json:"output"`
}

// EncodeURL 进行 URL 编码
func EncodeURL(input string) *URLEncodeResponse {
	start := time.Now()
	LogInfo("URL编码器", "开始URL编码，输入长度: %d", len(input))

	if input == "" {
		LogWarning("URL编码器", "输入为空")
		return &URLEncodeResponse{Output: ""}
	}

	encoded := url.QueryEscape(input)

	LogOperation("URL编码器", "URL编码", time.Since(start), nil)
	LogInfo("URL编码器", "URL编码成功，输出长度: %d", len(encoded))

	return &URLEncodeResponse{
		Output: encoded,
	}
}

// DecodeURL 进行 URL 解码
func DecodeURL(input string) (*URLEncodeResponse, error) {
	start := time.Now()
	LogInfo("URL编码器", "开始URL解码，输入长度: %d", len(input))

	if input == "" {
		LogWarning("URL编码器", "输入为空")
		return &URLEncodeResponse{Output: ""}, nil
	}

	decoded, err := url.QueryUnescape(input)
	if err != nil {
		LogError("URL编码器", err, "URL解码失败")
		return nil, fmt.Errorf("URL解码失败: %v", err)
	}

	LogOperation("URL编码器", "URL解码", time.Since(start), nil)
	LogInfo("URL编码器", "URL解码成功，输出长度: %d", len(decoded))

	return &URLEncodeResponse{
		Output: decoded,
	}, nil
}
