package tools

import (
	"bytes"
	"encoding/xml"
	"fmt"
)

// XMLParserRequest 表示 XML 解析请求
type XMLParserRequest struct {
	Input string `json:"input"`
}

// XMLParserResponse 表示 XML 解析响应
type XMLParserResponse struct {
	Formatted string `json:"formatted"`
}

// ParseXML 格式化 XML 字符串
func ParseXML(input string) (*XMLParserResponse, error) {
	// 解码 XML 以验证其有效性
	decoder := xml.NewDecoder(bytes.NewBufferString(input))
	var doc interface{}
	if err := decoder.Decode(&doc); err != nil {
		return nil, fmt.Errorf("无效的 XML: %v", err)
	}

	// 创建格式化输出的缓冲区
	var buf bytes.Buffer
	encoder := xml.NewEncoder(&buf)
	encoder.Indent("", "    ")
	
	// 重新编码为格式化的 XML
	if err := encoder.Encode(doc); err != nil {
		return nil, fmt.Errorf("格式化 XML 失败: %v", err)
	}

	return &XMLParserResponse{
		Formatted: buf.String(),
	}, nil
} 