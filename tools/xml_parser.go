package tools

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"strings"
)

// XMLRequest 表示 XML 请求
type XMLRequest struct {
	XML         string `json:"xml"`
	Indent      string `json:"indent"`
	LineNumbers bool   `json:"lineNumbers"`
	Validate    bool   `json:"validate"`
}

// XMLResponse 表示 XML 响应
type XMLResponse struct {
	Formatted string `json:"formatted"`
}

// XMLMinifyResponse 表示 XML 压缩响应
type XMLMinifyResponse struct {
	Minified string `json:"minified"`
}

// ParseXML 格式化 XML 字符串
func ParseXML(req *XMLRequest) (*XMLResponse, error) {
	// 解码 XML 以验证其有效性
	decoder := xml.NewDecoder(bytes.NewBufferString(req.XML))
	var doc interface{}
	if err := decoder.Decode(&doc); err != nil {
		return nil, fmt.Errorf("无效的 XML: %v", err)
	}

	// 创建格式化输出的缓冲区
	var buf bytes.Buffer
	encoder := xml.NewEncoder(&buf)

	// 根据选项设置缩进
	var indent string
	switch req.Indent {
	case "2":
		indent = strings.Repeat(" ", 2)
	case "4":
		indent = strings.Repeat(" ", 4)
	case "tab":
		indent = "\t"
	default:
		indent = strings.Repeat(" ", 4)
	}

	encoder.Indent("", indent)

	// 重新编码为格式化的 XML
	if err := encoder.Encode(doc); err != nil {
		return nil, fmt.Errorf("格式化 XML 失败: %v", err)
	}

	// 添加换行符
	formatted := buf.String()
	if !strings.HasSuffix(formatted, "\n") {
		formatted += "\n"
	}

	// 如果需要添加行号
	if req.LineNumbers {
		lines := strings.Split(formatted, "\n")
		var numberedLines []string
		for i, line := range lines {
			if line == "" {
				continue
			}
			numberedLines = append(numberedLines, fmt.Sprintf("%d: %s", i+1, line))
		}
		formatted = strings.Join(numberedLines, "\n") + "\n"
	}

	return &XMLResponse{
		Formatted: formatted,
	}, nil
}

// MinifyXML 压缩 XML 字符串
func MinifyXML(req *XMLRequest) (*XMLMinifyResponse, error) {
	// 解码 XML 以验证其有效性
	decoder := xml.NewDecoder(bytes.NewBufferString(req.XML))
	var doc interface{}
	if err := decoder.Decode(&doc); err != nil {
		return nil, fmt.Errorf("无效的 XML: %v", err)
	}

	// 创建压缩输出的缓冲区
	var buf bytes.Buffer
	encoder := xml.NewEncoder(&buf)

	// 重新编码为压缩的 XML（不带缩进）
	if err := encoder.Encode(doc); err != nil {
		return nil, fmt.Errorf("压缩 XML 失败: %v", err)
	}

	return &XMLMinifyResponse{
		Minified: buf.String(),
	}, nil
}
