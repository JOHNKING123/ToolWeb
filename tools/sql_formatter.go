package tools

import (
	"fmt"
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

// FormatSQL 格式化 SQL 查询语句
func FormatSQL(input string) (*SQLFormatterResponse, error) {
	if strings.TrimSpace(input) == "" {
		return nil, fmt.Errorf("SQL 语句不能为空")
	}

	

	// 定义 SQL 关键字
	keywords := []string{
		"select", "from", "where", "join", "left", "right", "inner", "outer",
		"group by", "having", "order by", "limit", "offset", "insert into",
		"values", "update", "set", "delete from", "create table", "alter table",
		"drop table", "and", "or", "like", "in", "between", "is null", "is not null",
	}

	// 格式化后的 SQL 片段
	formatted := input

	// 在关键字前添加换行和缩进
	for _, keyword := range keywords {
		// 创建正则表达式模式
		pattern := "(?i)\\s+" + keyword + "\\s+"
		replacement := "\n    " + strings.ToUpper(keyword) + " "
		
		// 替换关键字
		formatted = strings.ReplaceAll(formatted, pattern, replacement)
	}

	// 处理括号
	formatted = strings.ReplaceAll(formatted, "(", "\n    (")
	formatted = strings.ReplaceAll(formatted, ")", ")\n")

	// 删除多余的空行
	lines := strings.Split(formatted, "\n")
	var result []string
	for _, line := range lines {
		if strings.TrimSpace(line) != "" {
			result = append(result, line)
		}
	}

	// 添加适当的缩进
	formatted = strings.Join(result, "\n")

	return &SQLFormatterResponse{
		Formatted: formatted,
	}, nil
} 