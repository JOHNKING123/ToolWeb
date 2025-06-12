package tools

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"strings"
	"time"
)

// XMLRequest 表示 XML 请求
type XMLRequest struct {
	XML    string `json:"xml"`
	Indent string `json:"indent"`
	Minify bool   `json:"minify"`
}

// XMLResponse 表示 XML 响应
type XMLResponse struct {
	Formatted string `json:"formatted"`
	Minified  string `json:"minified"`
}

// XMLMinifyResponse 表示 XML 压缩响应
type XMLMinifyResponse struct {
	Minified string `json:"minified"`
}

// ParseXML 格式化 XML 字符串
func ParseXML(req *XMLRequest) (*XMLResponse, error) {
	start := time.Now()
	defer func() {
		LogOperation("XML解析器", "格式化XML", time.Since(start), nil)
	}()

	LogInfo("XML解析器", "开始解析XML，输入长度: %d", len(req.XML))

	// 移除XML声明
	input := strings.TrimSpace(req.XML)
	hasDeclaration := false
	if strings.HasPrefix(input, "<?xml") {
		if idx := strings.Index(input, "?>"); idx != -1 {
			input = strings.TrimSpace(input[idx+2:])
			hasDeclaration = true
		}
	}

	// 解析XML
	decoder := xml.NewDecoder(strings.NewReader(input))
	var buf bytes.Buffer
	encoder := xml.NewEncoder(&buf)
	encoder.Indent("", strings.Repeat(" ", 4))

	for {
		token, err := decoder.Token()
		if err != nil {
			LogError("XML解析器", err, "XML解析失败")
			return nil, fmt.Errorf("XML解析失败: %v", err)
		}
		if token == nil {
			break
		}
		err = encoder.EncodeToken(token)
		if err != nil {
			LogError("XML解析器", err, "XML编码失败")
			return nil, fmt.Errorf("XML编码失败: %v", err)
		}
	}

	err := encoder.Flush()
	if err != nil {
		LogError("XML解析器", err, "XML刷新缓冲区失败")
		return nil, fmt.Errorf("XML刷新缓冲区失败: %v", err)
	}

	formatted := buf.String()
	if hasDeclaration {
		formatted = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" + formatted
	}

	LogInfo("XML解析器", "XML格式化成功，输出长度: %d", len(formatted))

	return &XMLResponse{
		Formatted: formatted,
	}, nil
}

// MinifyXML 压缩 XML 字符串
func MinifyXML(req *XMLRequest) (*XMLResponse, error) {
	start := time.Now()
	defer func() {
		LogOperation("XML解析器", "压缩XML", time.Since(start), nil)
	}()

	LogInfo("XML解析器", "开始压缩XML，输入长度: %d", len(req.XML))

	// 移除XML声明
	input := strings.TrimSpace(req.XML)
	hasDeclaration := false
	if strings.HasPrefix(input, "<?xml") {
		if idx := strings.Index(input, "?>"); idx != -1 {
			input = strings.TrimSpace(input[idx+2:])
			hasDeclaration = true
		}
	}

	// 解析XML
	decoder := xml.NewDecoder(strings.NewReader(input))
	var buf bytes.Buffer
	encoder := xml.NewEncoder(&buf)

	for {
		token, err := decoder.Token()
		if err != nil {
			LogError("XML解析器", err, "XML解析失败")
			return nil, fmt.Errorf("XML解析失败: %v", err)
		}
		if token == nil {
			break
		}
		err = encoder.EncodeToken(token)
		if err != nil {
			LogError("XML解析器", err, "XML编码失败")
			return nil, fmt.Errorf("XML编码失败: %v", err)
		}
	}

	err := encoder.Flush()
	if err != nil {
		LogError("XML解析器", err, "XML刷新缓冲区失败")
		return nil, fmt.Errorf("XML刷新缓冲区失败: %v", err)
	}

	minified := buf.String()
	if hasDeclaration {
		minified = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" + minified
	}

	LogInfo("XML解析器", "XML压缩成功，输出长度: %d", len(minified))

	return &XMLResponse{
		Minified: minified,
	}, nil
}

// formatXMLString 格式化XML字符串
func formatXMLString(xmlStr, indent string) string {
	// 移除多余的空白字符
	xmlStr = strings.TrimSpace(xmlStr)

	var result strings.Builder
	var level int
	var i int

	for i < len(xmlStr) {
		if xmlStr[i] == '<' {
			// 找到标签的结束位置
			tagEnd := strings.Index(xmlStr[i:], ">")
			if tagEnd == -1 {
				break
			}
			tagEnd += i

			tag := xmlStr[i : tagEnd+1]

			// 判断标签类型
			if strings.HasPrefix(tag, "</") {
				// 结束标签：减少级别，添加缩进
				level--
				result.WriteString(strings.Repeat(indent, level))
				result.WriteString(tag)
				result.WriteString("\n")
			} else if strings.HasSuffix(tag, "/>") || strings.Contains(tag, "<?") || strings.Contains(tag, "<!") {
				// 自闭合标签、XML声明、注释
				result.WriteString(strings.Repeat(indent, level))
				result.WriteString(tag)
				result.WriteString("\n")
			} else {
				// 开始标签
				result.WriteString(strings.Repeat(indent, level))
				result.WriteString(tag)

				// 检查是否是单行标签（标签后紧跟文本内容然后是结束标签）
				nextPos := tagEnd + 1

				// 跳过空白字符
				for nextPos < len(xmlStr) && (xmlStr[nextPos] == ' ' || xmlStr[nextPos] == '\t' || xmlStr[nextPos] == '\n' || xmlStr[nextPos] == '\r') {
					nextPos++
				}

				// 检查是否紧跟文本内容
				if nextPos < len(xmlStr) && xmlStr[nextPos] != '<' {
					// 找到文本内容的结束位置（下一个<）
					textEnd := strings.Index(xmlStr[nextPos:], "<")
					if textEnd != -1 {
						textEnd += nextPos
						text := strings.TrimSpace(xmlStr[nextPos:textEnd])

						// 检查紧跟的是否是对应的结束标签
						closeTagEnd := strings.Index(xmlStr[textEnd:], ">")
						if closeTagEnd != -1 {
							closeTagEnd += textEnd
							closeTag := xmlStr[textEnd : closeTagEnd+1]

							// 提取开始标签的名称
							tagName := tag[1 : len(tag)-1] // 移除 < 和 >
							if spaceIndex := strings.Index(tagName, " "); spaceIndex != -1 {
								tagName = tagName[:spaceIndex] // 移除属性
							}

							expectedCloseTag := "</" + tagName + ">"

							if closeTag == expectedCloseTag {
								// 这是一个单行标签
								result.WriteString(text)
								result.WriteString(closeTag)
								result.WriteString("\n")
								i = closeTagEnd + 1
								continue
							}
						}
					}
				}

				// 这是一个多行标签
				level++
				result.WriteString("\n")
			}

			i = tagEnd + 1
		} else {
			// 跳过空白字符
			for i < len(xmlStr) && (xmlStr[i] == ' ' || xmlStr[i] == '\t' || xmlStr[i] == '\n' || xmlStr[i] == '\r') {
				i++
			}
		}
	}

	return strings.TrimSpace(result.String())
}

// minifyXMLString 压缩XML字符串
func minifyXMLString(xmlStr string) string {
	// 移除标签间的空白字符
	var result strings.Builder
	var inTag bool
	var hasContent bool

	for i, char := range xmlStr {
		switch char {
		case '<':
			inTag = true
			hasContent = false
			result.WriteRune(char)
		case '>':
			inTag = false
			result.WriteRune(char)
		case ' ', '\t', '\n', '\r':
			if inTag {
				// 标签内的空格，如果前一个字符不是空格就保留
				if i > 0 && xmlStr[i-1] != ' ' && xmlStr[i-1] != '\t' &&
					xmlStr[i-1] != '\n' && xmlStr[i-1] != '\r' {
					result.WriteRune(' ')
				}
			} else if hasContent {
				// 标签外有内容时保留一个空格
				result.WriteRune(' ')
				hasContent = false
			}
		default:
			result.WriteRune(char)
			if !inTag {
				hasContent = true
			}
		}
	}

	return strings.TrimSpace(result.String())
}
