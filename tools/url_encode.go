package tools

import (
	"fmt"
	"net/url"
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
	encoded := url.QueryEscape(input)
	return &URLEncodeResponse{
		Output: encoded,
	}
}

// DecodeURL 进行 URL 解码
func DecodeURL(input string) (*URLEncodeResponse, error) {
	decoded, err := url.QueryUnescape(input)
	if err != nil {
		return nil, fmt.Errorf("URL 解码错误: %v", err)
	}
	return &URLEncodeResponse{
		Output: decoded,
	}, nil
} 