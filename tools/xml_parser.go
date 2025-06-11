package tools

import (
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
	// 验证 XML 格式
	if req.Validate {
		decoder := xml.NewDecoder(strings.NewReader(req.XML))
		for {
			_, err := decoder.Token()
			if err != nil {
				if err.Error() == "EOF" {
					break
				}
				return nil, fmt.Errorf("无效的 XML: %v", err)
			}
		}
	}

	// 根据选项设置缩进
	var indent string
	switch req.Indent {
	case "2":
		indent = "  "
	case "4":
		indent = "    "
	case "tab":
		indent = "\t"
	default:
		indent = "    "
	}

	// 使用更好的格式化逻辑
	formatted := formatXMLString(req.XML, indent)

	// 如果需要添加行号
	if req.LineNumbers {
		lines := strings.Split(formatted, "\n")
		var numberedLines []string
		for i, line := range lines {
			if strings.TrimSpace(line) != "" {
				numberedLines = append(numberedLines, fmt.Sprintf("%3d: %s", i+1, line))
			}
		}
		formatted = strings.Join(numberedLines, "\n")
	}

	return &XMLResponse{
		Formatted: formatted,
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

// MinifyXML 压缩 XML 字符串
func MinifyXML(req *XMLRequest) (*XMLMinifyResponse, error) {
	// 验证 XML 格式
	if req.Validate {
		decoder := xml.NewDecoder(strings.NewReader(req.XML))
		for {
			_, err := decoder.Token()
			if err != nil {
				if err.Error() == "EOF" {
					break
				}
				return nil, fmt.Errorf("无效的 XML: %v", err)
			}
		}
	}

	// 使用更简单的压缩方法
	minified := minifyXMLString(req.XML)

	return &XMLMinifyResponse{
		Minified: minified,
	}, nil
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
