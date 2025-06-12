package tools

import (
	"fmt"
	"regexp"
	"time"
)

// RegexRequest represents the request structure for regex testing
type RegexRequest struct {
	Pattern string `json:"pattern"`
	Text    string `json:"text"`
}

// RegexMatch represents a single regex match
type RegexMatch struct {
	FullMatch  string   `json:"fullMatch"`
	Groups     []string `json:"groups"`
	StartIndex int      `json:"startIndex"`
	EndIndex   int      `json:"endIndex"`
}

// RegexResponse represents the response structure for regex testing
type RegexResponse struct {
	Matches []string `json:"matches"`
}

// TestRegex tests a regular expression against input text
func TestRegex(pattern, text string) (*RegexResponse, error) {
	start := time.Now()
	LogInfo("正则测试器", "开始正则表达式测试，模式: %s，文本长度: %d", pattern, len(text))

	if pattern == "" {
		LogWarning("正则测试器", "正则表达式模式为空")
		return nil, fmt.Errorf("正则表达式不能为空")
	}

	// Compile the regular expression
	re, err := regexp.Compile(pattern)
	if err != nil {
		LogError("正则测试器", err, "正则表达式编译失败")
		return nil, fmt.Errorf("正则表达式无效: %v", err)
	}

	// Find all matches
	matches := re.FindAllString(text, -1)
	if matches == nil {
		matches = []string{} // 确保返回空数组而不是nil
	}

	LogOperation("正则测试器", "正则表达式测试", time.Since(start), nil)
	LogInfo("正则测试器", "正则表达式测试完成，找到 %d 个匹配", len(matches))

	// 如果匹配数量很多，记录一个警告
	if len(matches) > 100 {
		LogWarning("正则测试器", "匹配结果数量过多: %d", len(matches))
	}

	return &RegexResponse{
		Matches: matches,
	}, nil
}

// ValidateRegex 验证正则表达式的有效性
func ValidateRegex(pattern string) error {
	start := time.Now()
	LogInfo("正则测试器", "开始验证正则表达式: %s", pattern)

	if pattern == "" {
		LogWarning("正则测试器", "正则表达式为空")
		return fmt.Errorf("正则表达式不能为空")
	}

	_, err := regexp.Compile(pattern)
	if err != nil {
		LogError("正则测试器", err, "正则表达式验证失败")
		return fmt.Errorf("无效的正则表达式: %v", err)
	}

	LogOperation("正则测试器", "正则表达式验证", time.Since(start), nil)
	LogInfo("正则测试器", "正则表达式验证成功")

	return nil
}
