package tools

import (
	"fmt"
	"strings"
	"time"
	"unicode"

	"github.com/robfig/cron/v3"
)

// CronRequest represents the request structure for cron parsing
type CronRequest struct {
	Expression string `json:"expression"`
}

// CronNextRun represents a future run time
type CronNextRun struct {
	Time     time.Time `json:"time"`
	Readable string    `json:"readable"`
}

// CronResponse represents the response structure for cron parsing
type CronResponse struct {
	IsValid     bool          `json:"isValid"`
	Error       string        `json:"error,omitempty"`
	Description string        `json:"description,omitempty"`
	NextRuns    []CronNextRun `json:"nextRuns,omitempty"`
}

// 检查是否包含中文字符或标点
func containsChineseChar(str string) (bool, string) {
	for _, r := range str {
		if unicode.Is(unicode.Han, r) {
			return true, string(r)
		}
		switch r {
		case '？', '，', '、', '／', '－', '＊':
			return true, string(r)
		}
	}
	return false, ""
}

// ParseCron validates and describes a cron expression
func ParseCron(expression string) *CronResponse {
	// 检查是否包含中文字符或标点
	if hasChinese, char := containsChineseChar(expression); hasChinese {
		return &CronResponse{
			IsValid: false,
			Error:   fmt.Sprintf("表达式包含中文字符或标点('%s')，请使用英文字符，例如：用 ? 代替 ？", char),
		}
	}

	parser := cron.NewParser(cron.Second | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
	schedule, err := parser.Parse(expression)

	if err != nil {
		errorMsg := err.Error()
		// 美化错误信息
		switch {
		case strings.Contains(errorMsg, "invalid syntax"):
			errorMsg = "表达式格式错误，请检查是否使用了正确的字符"
		case strings.Contains(errorMsg, "failed to parse"):
			errorMsg = "表达式格式错误，请检查每个字段的值是否在允许范围内"
		case strings.Contains(errorMsg, "end of range"):
			errorMsg = "区间范围格式错误，请检查起始值和结束值"
		}
		return &CronResponse{
			IsValid: false,
			Error:   errorMsg,
		}
	}

	// 生成未来10次运行时间
	var nextRuns []CronNextRun
	next := time.Now()
	for i := 0; i < 10; i++ {
		next = schedule.Next(next)
		nextRuns = append(nextRuns, CronNextRun{
			Time:     next,
			Readable: next.Format("2006-01-02 15:04:05"),
		})
	}

	// 生成表达式描述
	fields := strings.Fields(expression)
	description := fmt.Sprintf("秒: %s\n分: %s\n时: %s\n日: %s\n月: %s\n周: %s",
		describeCronField(fields[0], "秒"),
		describeCronField(fields[1], "分"),
		describeCronField(fields[2], "时"),
		describeCronField(fields[3], "日"),
		describeCronField(fields[4], "月"),
		describeCronField(fields[5], "周"))

	return &CronResponse{
		IsValid:     true,
		Description: description,
		NextRuns:    nextRuns,
	}
}

// describeCronField 生成字段的中文描述
func describeCronField(field, unit string) string {
	switch field {
	case "*":
		return "每" + unit
	case "?":
		return "不指定"
	default:
		if strings.Contains(field, "/") {
			parts := strings.Split(field, "/")
			return fmt.Sprintf("每%s%s", parts[1], unit)
		}
		if strings.Contains(field, "-") {
			parts := strings.Split(field, "-")
			return fmt.Sprintf("%s%s到%s%s", parts[0], unit, parts[1], unit)
		}
		if strings.Contains(field, ",") {
			parts := strings.Split(field, ",")
			return fmt.Sprintf("第%s%s", strings.Join(parts, ","), unit)
		}
		return fmt.Sprintf("第%s%s", field, unit)
	}
}
