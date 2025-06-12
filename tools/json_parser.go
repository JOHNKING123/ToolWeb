package tools

import (
	"bytes"
	"encoding/json"
	"fmt"
	"time"
)

// JSONParserRequest represents the request structure for JSON parsing
type JSONParserRequest struct {
	Input string `json:"input"`
}

// JSONParserResponse represents the response structure for JSON parsing
type JSONParserResponse struct {
	Formatted string `json:"formatted"`
}

// JSONCompressResponse represents the response structure for JSON compression
type JSONCompressResponse struct {
	Compressed string `json:"compressed"`
}

type JSONResult struct {
	Formatted  string `json:"formatted"`
	Compressed string `json:"compressed"`
}

// ParseJSON 格式化JSON字符串
func ParseJSON(input string) (*JSONResult, error) {
	start := time.Now()
	defer func() {
		LogOperation("JSON解析器", "格式化JSON", time.Since(start), nil)
	}()

	LogInfo("JSON解析器", "开始解析JSON，输入长度: %d", len(input))

	var prettyJSON bytes.Buffer
	err := json.Indent(&prettyJSON, []byte(input), "", "    ")
	if err != nil {
		LogError("JSON解析器", err, "JSON格式化失败")
		return nil, fmt.Errorf("JSON格式化失败: %v", err)
	}

	LogInfo("JSON解析器", "JSON格式化成功，输出长度: %d", prettyJSON.Len())

	return &JSONResult{
		Formatted: prettyJSON.String(),
	}, nil
}

// CompressJSON 压缩JSON字符串
func CompressJSON(input string) (*JSONResult, error) {
	start := time.Now()
	defer func() {
		LogOperation("JSON解析器", "压缩JSON", time.Since(start), nil)
	}()

	LogInfo("JSON解析器", "开始压缩JSON，输入长度: %d", len(input))

	var compressedJSON bytes.Buffer
	err := json.Compact(&compressedJSON, []byte(input))
	if err != nil {
		LogError("JSON解析器", err, "JSON压缩失败")
		return nil, fmt.Errorf("JSON压缩失败: %v", err)
	}

	LogInfo("JSON解析器", "JSON压缩成功，输出长度: %d", compressedJSON.Len())

	return &JSONResult{
		Compressed: compressedJSON.String(),
	}, nil
}
