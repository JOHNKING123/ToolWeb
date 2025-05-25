package tools

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// JWTParserRequest 表示 JWT 解析请求
type JWTParserRequest struct {
	Token string `json:"token"`
}

// JWTParserResponse 表示 JWT 解析响应
type JWTParserResponse struct {
	Header    map[string]interface{} `json:"header"`
	Payload   map[string]interface{} `json:"payload"`
	Signature string                 `json:"signature"`
	IsValid   bool                   `json:"isValid"`
	Error     string                 `json:"error,omitempty"`
}

// ParseJWT 解析 JWT 令牌
func ParseJWT(token string) *JWTParserResponse {
	response := &JWTParserResponse{
		Header:  make(map[string]interface{}),
		Payload: make(map[string]interface{}),
	}

	// 分割 JWT 令牌
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		response.IsValid = false
		response.Error = "无效的 JWT 格式：令牌必须包含三个部分"
		return response
	}

	// 解码头部
	headerJSON, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		response.IsValid = false
		response.Error = fmt.Sprintf("解码头部失败: %v", err)
		return response
	}

	if err := json.Unmarshal(headerJSON, &response.Header); err != nil {
		response.IsValid = false
		response.Error = fmt.Sprintf("解析头部 JSON 失败: %v", err)
		return response
	}

	// 解码载荷
	payloadJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		response.IsValid = false
		response.Error = fmt.Sprintf("解码载荷失败: %v", err)
		return response
	}

	if err := json.Unmarshal(payloadJSON, &response.Payload); err != nil {
		response.IsValid = false
		response.Error = fmt.Sprintf("解析载荷 JSON 失败: %v", err)
		return response
	}

	// 保存签名
	response.Signature = parts[2]
	response.IsValid = true

	// 处理标准声明
	if exp, ok := response.Payload["exp"].(float64); ok {
		response.Payload["exp_readable"] = formatUnixTime(int64(exp))
	}
	if iat, ok := response.Payload["iat"].(float64); ok {
		response.Payload["iat_readable"] = formatUnixTime(int64(iat))
	}
	if nbf, ok := response.Payload["nbf"].(float64); ok {
		response.Payload["nbf_readable"] = formatUnixTime(int64(nbf))
	}

	return response
}

// formatUnixTime 将 Unix 时间戳格式化为可读字符串
func formatUnixTime(timestamp int64) string {
	if timestamp == 0 {
		return ""
	}
	return time.Unix(timestamp, 0).Format("2006-01-02 15:04:05")
} 