package tools

import (
	"fmt"
	"strings"
	"time"

	"github.com/robfig/cron/v3"
)

// CronRequest represents the request structure for cron expression parsing
type CronRequest struct {
	Expression string `json:"expression"`
}

// CronNextTime represents a future execution time
type CronNextTime struct {
	Time     time.Time `json:"time"`
	Readable string    `json:"readable"`
}

// CronResponse represents the response structure for cron expression parsing
type CronResponse struct {
	Description string        `json:"description"`
	NextRuns    []CronNextTime `json:"nextRuns"`
	IsValid     bool          `json:"isValid"`
	Error       string        `json:"error,omitempty"`
}

// ParseCron validates and explains a cron expression
func ParseCron(expression string) *CronResponse {
	response := &CronResponse{
		NextRuns: make([]CronNextTime, 0),
	}

	// 尝试解析 cron 表达式
	parser := cron.NewParser(cron.Second | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
	schedule, err := parser.Parse(expression)
	
	if err != nil {
		response.IsValid = false
		response.Error = fmt.Sprintf("无效的 cron 表达式: %v", err)
		return response
	}

	response.IsValid = true
	
	// 生成描述
	parts := []string{
		"秒", "分", "时", "日", "月", "星期",
	}
	fields := strings.Fields(expression)
	if len(fields) != 6 {
		response.Description = "表达式格式应为: 秒 分 时 日 月 星期"
	} else {
		desc := make([]string, 0)
		for i, field := range fields {
			desc = append(desc, fmt.Sprintf("%s: %s", parts[i], field))
		}
		response.Description = strings.Join(desc, "\n")
	}

	// 计算接下来的 5 次执行时间
	now := time.Now()
	next := now
	for i := 0; i < 5; i++ {
		next = schedule.Next(next)
		response.NextRuns = append(response.NextRuns, CronNextTime{
			Time:     next,
			Readable: next.Format("2006-01-02 15:04:05"),
		})
	}

	return response
} 