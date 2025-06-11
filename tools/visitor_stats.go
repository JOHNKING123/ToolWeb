package tools

import (
	"encoding/json"
	"log"
	"os"
	"sync"
	"time"
)

// VisitorStats 访客统计数据结构
type VisitorStats struct {
	mu            sync.RWMutex
	TotalVisitors map[string]time.Time            `json:"total_visitors"` // IP -> 首次访问时间
	DailyVisitors map[string]map[string]time.Time `json:"daily_visitors"` // 日期 -> IP -> 访问时间
	dataFile      string
}

// NewVisitorStats 创建新的访客统计实例
func NewVisitorStats(dataFile string) *VisitorStats {
	vs := &VisitorStats{
		TotalVisitors: make(map[string]time.Time),
		DailyVisitors: make(map[string]map[string]time.Time),
		dataFile:      dataFile,
	}

	// 加载现有数据
	vs.loadData()

	return vs
}

// RecordVisitor 记录访客访问
func (vs *VisitorStats) RecordVisitor(ip string) {
	vs.mu.Lock()
	defer vs.mu.Unlock()

	now := time.Now()
	today := now.Format("2006-01-02")

	// 记录总访客（如果是新IP）
	if _, exists := vs.TotalVisitors[ip]; !exists {
		vs.TotalVisitors[ip] = now
	}

	// 记录今日访客
	if vs.DailyVisitors[today] == nil {
		vs.DailyVisitors[today] = make(map[string]time.Time)
	}
	vs.DailyVisitors[today][ip] = now

	// 清理旧的日期数据（只保留最近30天）
	vs.cleanOldData()

	// 保存数据
	vs.saveData()
}

// GetTotalVisitors 获取总访客数
func (vs *VisitorStats) GetTotalVisitors() int {
	vs.mu.RLock()
	defer vs.mu.RUnlock()

	return len(vs.TotalVisitors)
}

// GetTodayVisitors 获取今日访客数
func (vs *VisitorStats) GetTodayVisitors() int {
	vs.mu.RLock()
	defer vs.mu.RUnlock()

	today := time.Now().Format("2006-01-02")
	if dailyVisitors, exists := vs.DailyVisitors[today]; exists {
		return len(dailyVisitors)
	}
	return 0
}

// GetStats 获取统计信息
func (vs *VisitorStats) GetStats() map[string]interface{} {
	return map[string]interface{}{
		"total_visitors": vs.GetTotalVisitors(),
		"today_visitors": vs.GetTodayVisitors(),
	}
}

// loadData 从文件加载数据
func (vs *VisitorStats) loadData() {
	if _, err := os.Stat(vs.dataFile); os.IsNotExist(err) {
		// 文件不存在，创建默认数据
		return
	}

	data, err := os.ReadFile(vs.dataFile)
	if err != nil {
		log.Printf("读取访客统计文件失败: %v", err)
		return
	}

	var temp struct {
		TotalVisitors map[string]string            `json:"total_visitors"`
		DailyVisitors map[string]map[string]string `json:"daily_visitors"`
	}

	if err := json.Unmarshal(data, &temp); err != nil {
		log.Printf("解析访客统计文件失败: %v", err)
		return
	}

	// 转换时间格式
	vs.TotalVisitors = make(map[string]time.Time)
	for ip, timeStr := range temp.TotalVisitors {
		if t, err := time.Parse(time.RFC3339, timeStr); err == nil {
			vs.TotalVisitors[ip] = t
		}
	}

	vs.DailyVisitors = make(map[string]map[string]time.Time)
	for date, visitors := range temp.DailyVisitors {
		vs.DailyVisitors[date] = make(map[string]time.Time)
		for ip, timeStr := range visitors {
			if t, err := time.Parse(time.RFC3339, timeStr); err == nil {
				vs.DailyVisitors[date][ip] = t
			}
		}
	}
}

// saveData 保存数据到文件
func (vs *VisitorStats) saveData() {
	// 转换为可序列化的格式
	temp := struct {
		TotalVisitors map[string]string            `json:"total_visitors"`
		DailyVisitors map[string]map[string]string `json:"daily_visitors"`
	}{
		TotalVisitors: make(map[string]string),
		DailyVisitors: make(map[string]map[string]string),
	}

	for ip, t := range vs.TotalVisitors {
		temp.TotalVisitors[ip] = t.Format(time.RFC3339)
	}

	for date, visitors := range vs.DailyVisitors {
		temp.DailyVisitors[date] = make(map[string]string)
		for ip, t := range visitors {
			temp.DailyVisitors[date][ip] = t.Format(time.RFC3339)
		}
	}

	data, err := json.MarshalIndent(temp, "", "  ")
	if err != nil {
		log.Printf("序列化访客统计数据失败: %v", err)
		return
	}

	if err := os.WriteFile(vs.dataFile, data, 0644); err != nil {
		log.Printf("保存访客统计文件失败: %v", err)
	}
}

// cleanOldData 清理旧数据
func (vs *VisitorStats) cleanOldData() {
	cutoff := time.Now().AddDate(0, 0, -30) // 30天前

	for date := range vs.DailyVisitors {
		if dateTime, err := time.Parse("2006-01-02", date); err == nil {
			if dateTime.Before(cutoff) {
				delete(vs.DailyVisitors, date)
			}
		}
	}
}

// 全局访客统计实例
var visitorStats *VisitorStats

// InitVisitorStats 初始化访客统计
func InitVisitorStats() {
	visitorStats = NewVisitorStats("visitor_stats.json")
	log.Println("访客统计模块初始化完成")
}

// GetVisitorStats 获取访客统计实例
func GetVisitorStats() *VisitorStats {
	return visitorStats
}
