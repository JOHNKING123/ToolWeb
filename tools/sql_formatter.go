package tools

import (
	"fmt"
	"strings"
	"time"
)

// SQLFormatterRequest 表示 SQL 格式化请求
type SQLFormatterRequest struct {
	Input string `json:"input"`
}

// SQLFormatterResponse 表示 SQL 格式化响应
type SQLFormatterResponse struct {
	Formatted string `json:"formatted"`
}

// SQLResult 表示SQL格式化结果
type SQLResult struct {
	Formatted string `json:"formatted"`
	Minified  string `json:"minified"`
}

// FormatSQL 格式化SQL语句
func FormatSQL(input string) (*SQLResult, error) {
	start := time.Now()
	LogInfo("SQL格式化器", "开始格式化SQL，输入长度: %d", len(input))

	if strings.TrimSpace(input) == "" {
		LogWarning("SQL格式化器", "输入SQL为空")
		return nil, fmt.Errorf("SQL语句不能为空")
	}

	// 移除多余的空白字符
	sql := strings.TrimSpace(input)

	// 分割SQL语句
	tokens := tokenizeSQL(sql)
	if len(tokens) == 0 {
		LogWarning("SQL格式化器", "SQL语句解析后为空")
		return nil, fmt.Errorf("无效的SQL语句")
	}

	// 格式化SQL
	formatted := formatSQLTokens(tokens)
	LogInfo("SQL格式化器", "SQL格式化成功，输出长度: %d", len(formatted))

	// 压缩SQL
	minified := strings.Join(tokens, " ")
	LogInfo("SQL格式化器", "SQL压缩成功，输出长度: %d", len(minified))

	duration := time.Since(start)
	LogOperation("SQL格式化器", "SQL处理完成", duration, nil)

	return &SQLResult{
		Formatted: formatted,
		Minified:  minified,
	}, nil
}

// MinifySQL 压缩SQL语句
func MinifySQL(input string) string {
	start := time.Now()
	LogInfo("SQL格式化器", "开始压缩SQL，输入长度: %d", len(input))

	// 移除多余的空白字符
	sql := strings.TrimSpace(input)
	if sql == "" {
		LogWarning("SQL格式化器", "输入SQL为空")
		return ""
	}

	// 分割SQL语句
	tokens := tokenizeSQL(sql)

	// 压缩SQL
	minified := strings.Join(tokens, " ")

	LogOperation("SQL格式化器", "SQL压缩完成", time.Since(start), nil)
	LogInfo("SQL格式化器", "SQL压缩成功，输出长度: %d", len(minified))

	return minified
}

// tokenizeSQL 将SQL语句分割成标记
func tokenizeSQL(sql string) []string {
	// 替换换行符为空格
	sql = strings.ReplaceAll(sql, "\n", " ")
	sql = strings.ReplaceAll(sql, "\r", " ")

	// 分割SQL
	tokens := strings.Fields(sql)

	// 处理关键字
	for i, token := range tokens {
		upperToken := strings.ToUpper(token)
		switch upperToken {
		case "SELECT", "FROM", "WHERE", "GROUP", "BY", "HAVING", "ORDER",
			"INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP",
			"JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "ON",
			"AND", "OR", "NOT", "IN", "BETWEEN", "LIKE":
			tokens[i] = upperToken
		}
	}

	return tokens
}

// formatSQLTokens 格式化SQL标记
func formatSQLTokens(tokens []string) string {
	var result strings.Builder
	indent := 0
	newLine := false

	for i, token := range tokens {
		upperToken := strings.ToUpper(token)

		// 处理缩进
		switch upperToken {
		case "SELECT", "FROM", "WHERE", "GROUP", "BY", "HAVING", "ORDER",
			"INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP":
			if i > 0 {
				result.WriteString("\n")
			}
			result.WriteString(strings.Repeat("    ", indent))
			newLine = false
		case "JOIN", "LEFT", "RIGHT", "INNER", "OUTER":
			result.WriteString("\n")
			result.WriteString(strings.Repeat("    ", indent))
			newLine = false
		case "AND", "OR":
			result.WriteString("\n")
			result.WriteString(strings.Repeat("    ", indent+1))
			newLine = false
		}

		// 写入标记
		if newLine {
			result.WriteString(" ")
		}
		result.WriteString(token)
		newLine = true

		// 特殊处理括号
		if token == "(" {
			indent++
		} else if token == ")" {
			indent--
			if indent < 0 {
				indent = 0
			}
		}
	}

	return result.String()
}
