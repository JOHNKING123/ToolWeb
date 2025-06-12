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
	start := time.Now()
	LogInfo("JWT解析器", "开始解析JWT令牌，令牌长度: %d", len(token))

	response := &JWTParserResponse{
		Header:    make(map[string]interface{}),
		Payload:   make(map[string]interface{}),
		Signature: "",
		IsValid:   false,
	}

	if token == "" {
		LogWarning("JWT解析器", "输入令牌为空")
		response.Error = "令牌不能为空"
		return response
	}

	// 分割 JWT 令牌
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		LogWarning("JWT解析器", "令牌格式无效，部分数量: %d", len(parts))
		response.Error = "无效的JWT格式"
		return response
	}

	// 解码头部
	header, err := decodeJWTPart(parts[0])
	if err != nil {
		LogError("JWT解析器", err, "解码头部失败")
		response.Error = fmt.Sprintf("解码头部失败: %v", err)
		return response
	}
	response.Header = header

	// 解码载荷
	payload, err := decodeJWTPart(parts[1])
	if err != nil {
		LogError("JWT解析器", err, "解码载荷失败")
		response.Error = fmt.Sprintf("解码载荷失败: %v", err)
		return response
	}
	response.Payload = payload

	// 设置签名
	response.Signature = parts[2]
	response.IsValid = true

	LogOperation("JWT解析器", "JWT令牌解析", time.Since(start), nil)
	LogInfo("JWT解析器", "JWT令牌解析成功")

	// 检查令牌是否过期
	if exp, ok := payload["exp"].(float64); ok {
		expTime := time.Unix(int64(exp), 0)
		if time.Now().After(expTime) {
			LogWarning("JWT解析器", "令牌已过期，过期时间: %v", expTime)
		}
	}

	return response
}

// decodeJWTPart 解码 JWT 的一个部分（头部或载荷）
func decodeJWTPart(part string) (map[string]interface{}, error) {
	// 添加填充
	if l := len(part) % 4; l > 0 {
		part += strings.Repeat("=", 4-l)
	}

	// 解码 Base64
	decoded, err := base64.URLEncoding.DecodeString(part)
	if err != nil {
		return nil, fmt.Errorf("base64解码失败: %v", err)
	}

	// 解析 JSON
	var result map[string]interface{}
	if err := json.Unmarshal(decoded, &result); err != nil {
		return nil, fmt.Errorf("JSON解析失败: %v", err)
	}

	return result, nil
}

// formatUnixTime 将 Unix 时间戳格式化为可读字符串
func formatUnixTime(timestamp int64) string {
	if timestamp == 0 {
		return ""
	}
	return time.Unix(timestamp, 0).Format("2006-01-02 15:04:05")
}
