package tools

import (
	"fmt"
	"regexp"
	"strings"
)

// SQLFormatterRequest 表示 SQL 格式化请求
type SQLFormatterRequest struct {
	Input string `json:"input"`
}

// SQLFormatterResponse 表示 SQL 格式化响应
type SQLFormatterResponse struct {
	Formatted string `json:"formatted"`
}

// FormatSQL 格式化 SQL 查询语句（临时方案，简单分行和大写关键字）
func FormatSQL(input string) (*SQLFormatterResponse, error) {
	if strings.TrimSpace(input) == "" {
		return nil, fmt.Errorf("SQL 语句不能为空")
	}

	// 关键字列表
	keywords := []string{
		"SELECT", "FROM", "WHERE", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER",
		"GROUP BY", "HAVING", "ORDER BY", "LIMIT", "OFFSET", "INSERT INTO",
		"VALUES", "UPDATE", "SET", "DELETE FROM", "CREATE TABLE", "ALTER TABLE",
		"DROP TABLE", "AND", "OR", "LIKE", "IN", "BETWEEN", "IS NULL", "IS NOT NULL",
	}

	formatted := input

	// 先处理多词关键字
	for _, kw := range keywords {
		if strings.Contains(kw, " ") {
			re := regexp.MustCompile(`(?i)\b` + strings.ReplaceAll(kw, " ", `\\s+`) + `\b`)
			formatted = re.ReplaceAllStringFunc(formatted, func(m string) string {
				return "\n" + kw
			})
		}
	}
	// 再处理单词关键字
	for _, kw := range keywords {
		if !strings.Contains(kw, " ") {
			re := regexp.MustCompile(`(?i)\b` + kw + `\b`)
			formatted = re.ReplaceAllStringFunc(formatted, func(m string) string {
				return "\n" + kw
			})
		}
	}

	// 去除多余空行
	lines := strings.Split(formatted, "\n")
	var result []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	formatted = strings.Join(result, "\n    ")

	return &SQLFormatterResponse{
		Formatted: formatted,
	}, nil
}

// MinifySQL 压缩 SQL 语句，去除多余空白和换行
func MinifySQL(input string) string {
	// 替换所有换行和制表符为空格
	minified := strings.ReplaceAll(input, "\n", " ")
	minified = strings.ReplaceAll(minified, "\r", " ")
	minified = strings.ReplaceAll(minified, "\t", " ")
	// 多个空格合并为一个
	re := regexp.MustCompile(`\s+`)
	minified = re.ReplaceAllString(minified, " ")
	return strings.TrimSpace(minified)
}
