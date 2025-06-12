package tools

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// ToolStats 工具统计管理器
type ToolStats struct {
	sync.RWMutex
	Stats        map[string]map[string]int // IP -> 工具名称 -> 访问次数
	ToolCounts   map[string]int            // 工具名称 -> 总访问次数
	LastSaveTime time.Time
}

var (
	toolStats *ToolStats
	statsOnce sync.Once
)

// initStatsDir 初始化统计目录
func initStatsDir() error {
	start := time.Now()
	LogInfo("工具统计", "开始初始化统计目录")

	statsDir := "data/stats"
	if err := os.MkdirAll(statsDir, 0755); err != nil {
		LogError("工具统计", err, "创建统计目录失败")
		return fmt.Errorf("创建统计目录失败: %v", err)
	}

	LogOperation("工具统计", "初始化统计目录", time.Since(start), nil)
	LogInfo("工具统计", "统计目录初始化成功: %s", statsDir)
	return nil
}

// GetToolStats 获取工具统计管理器单例
func GetToolStats() *ToolStats {
	statsOnce.Do(func() {
		// 初始化统计目录
		if err := initStatsDir(); err != nil {
			LogError("工具统计", err, "初始化统计目录失败")
		}

		toolStats = &ToolStats{
			Stats:      make(map[string]map[string]int),
			ToolCounts: make(map[string]int),
		}
		if err := toolStats.LoadStats(); err != nil {
			LogError("工具统计", err, "加载工具统计数据失败")
		}
	})
	return toolStats
}

// normalizeIP 标准化IP地址
func normalizeIP(ip string) string {
	// 处理 IPv6 localhost
	if ip == "::1" {
		return "127.0.0.1"
	}

	// 尝试解析IP地址
	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		// 如果解析失败，返回原始IP
		return ip
	}

	// 如果是IPv4映射的IPv6地址，转换为IPv4
	if v4 := parsedIP.To4(); v4 != nil {
		return v4.String()
	}

	// 其他情况返回标准化的IP字符串
	return parsedIP.String()
}

// RecordToolAccess 记录工具访问
func (ts *ToolStats) RecordToolAccess(ip string, toolName string) {
	start := time.Now()

	// 标准化IP地址
	normalizedIP := normalizeIP(ip)
	LogInfo("工具统计", "记录工具访问，原始IP: %s，标准化IP: %s，工具: %s", ip, normalizedIP, toolName)

	// 检查是否需要保存
	var needSave bool

	ts.Lock()
	// 初始化IP的访问记录
	if ts.Stats[normalizedIP] == nil {
		ts.Stats[normalizedIP] = make(map[string]int)
	}

	// 更新访问次数
	ts.Stats[normalizedIP][toolName]++
	ts.ToolCounts[toolName]++

	// 每100次访问保存一次，或者距离上次保存超过1小时
	if ts.ToolCounts[toolName]%100 == 0 || time.Since(ts.LastSaveTime) > time.Hour {
		needSave = true
	}
	ts.Unlock()

	// 在释放锁后再保存，避免死锁
	if needSave {
		if err := ts.SaveStats(); err != nil {
			LogError("工具统计", err, "保存工具统计数据失败")
		}
	}

	LogOperation("工具统计", "记录工具访问", time.Since(start), nil)
}

// GetPopularToolsForIP 获取指定IP最常用的工具
func (ts *ToolStats) GetPopularToolsForIP(ip string, limit int) []Tool {
	start := time.Now()

	// 标准化IP地址
	normalizedIP := normalizeIP(ip)
	LogInfo("工具统计", "获取IP常用工具，原始IP: %s，标准化IP: %s，限制数量: %d", ip, normalizedIP, limit)

	// 先复制数据，避免长时间持有锁
	ts.RLock()
	ipStats := ts.Stats[normalizedIP]
	if ipStats == nil {
		ts.RUnlock()
		LogInfo("工具统计", "IP %s 没有访问记录", normalizedIP)
		return nil
	}
	// 复制IP统计数据
	ipStatsCopy := make(map[string]int)
	for name, count := range ipStats {
		ipStatsCopy[name] = count
	}
	ts.RUnlock()

	// 转换为切片并排序
	type toolCount struct {
		name  string
		count int
	}
	counts := make([]toolCount, 0, len(ipStatsCopy))
	for name, count := range ipStatsCopy {
		counts = append(counts, toolCount{name, count})
	}
	sort.Slice(counts, func(i, j int) bool {
		return counts[i].count > counts[j].count
	})

	// 获取工具详情（此时已经释放了锁）
	var result []Tool
	for _, tc := range counts {
		if tool := findToolByName(tc.name); tool != nil {
			result = append(result, *tool)
			if len(result) >= limit {
				break
			}
		}
	}

	LogOperation("工具统计", "获取IP常用工具", time.Since(start), nil)
	LogInfo("工具统计", "找到 %d 个常用工具", len(result))

	return result
}

// GetMostPopularTools 获取全局最受欢迎的工具
func (ts *ToolStats) GetMostPopularTools(limit int) []Tool {
	start := time.Now()
	LogInfo("工具统计", "获取全局热门工具，限制数量: %d", limit)

	// 先复制数据，避免长时间持有锁
	ts.RLock()
	toolCounts := make(map[string]int)
	for name, count := range ts.ToolCounts {
		toolCounts[name] = count
	}
	ts.RUnlock()

	// 转换为切片并排序
	type toolCount struct {
		name  string
		count int
	}
	counts := make([]toolCount, 0, len(toolCounts))
	for name, count := range toolCounts {
		counts = append(counts, toolCount{name, count})
	}
	sort.Slice(counts, func(i, j int) bool {
		return counts[i].count > counts[j].count
	})

	// 获取工具详情（此时已经释放了锁）
	var result []Tool
	for _, tc := range counts {
		if tool := findToolByName(tc.name); tool != nil {
			result = append(result, *tool)
			if len(result) >= limit {
				break
			}
		}
	}

	LogOperation("工具统计", "获取全局热门工具", time.Since(start), nil)
	LogInfo("工具统计", "找到 %d 个热门工具", len(result))

	return result
}

// SaveStats 保存统计数据到文件
func (ts *ToolStats) SaveStats() error {
	start := time.Now()
	LogInfo("工具统计", "开始保存统计数据")

	// 确保目录存在
	statsDir := "data/stats"
	if err := os.MkdirAll(statsDir, 0755); err != nil {
		LogError("工具统计", err, "创建统计目录失败")
		return fmt.Errorf("创建统计目录失败: %v", err)
	}

	// 快速复制数据
	ts.RLock()
	// 深度复制Stats
	statsCopy := make(map[string]map[string]int)
	for ip, ipStats := range ts.Stats {
		statsCopy[ip] = make(map[string]int)
		for toolName, count := range ipStats {
			statsCopy[ip][toolName] = count
		}
	}
	// 复制ToolCounts
	toolCountsCopy := make(map[string]int)
	for toolName, count := range ts.ToolCounts {
		toolCountsCopy[toolName] = count
	}
	ts.RUnlock()

	// 保存数据
	data := struct {
		Stats      map[string]map[string]int `json:"ip_stats"`    // IP访问统计
		ToolCounts map[string]int            `json:"tool_counts"` // 工具总访问次数
		UpdateTime time.Time                 `json:"last_update"` // 最后更新时间
	}{
		Stats:      statsCopy,
		ToolCounts: toolCountsCopy,
		UpdateTime: time.Now(),
	}

	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		LogError("工具统计", err, "序列化统计数据失败")
		return fmt.Errorf("序列化统计数据失败: %v", err)
	}

	statsFile := filepath.Join(statsDir, "tool_stats.json")
	if err := os.WriteFile(statsFile, jsonData, 0644); err != nil {
		LogError("工具统计", err, "写入统计数据失败")
		return fmt.Errorf("写入统计数据失败: %v", err)
	}

	// 更新最后保存时间（需要锁保护）
	ts.Lock()
	ts.LastSaveTime = time.Now()
	ts.Unlock()

	LogOperation("工具统计", "保存统计数据", time.Since(start), nil)
	LogInfo("工具统计", "统计数据保存成功，文件大小: %d bytes", len(jsonData))

	return nil
}

// LoadStats 从文件加载统计数据
func (ts *ToolStats) LoadStats() error {
	start := time.Now()
	LogInfo("工具统计", "开始加载统计数据")

	statsFile := filepath.Join("data/stats", "tool_stats.json")
	data, err := os.ReadFile(statsFile)
	if err != nil {
		if os.IsNotExist(err) {
			LogInfo("工具统计", "统计数据文件不存在，将创建新文件")
			return nil // 文件不存在不算错误
		}
		LogError("工具统计", err, "读取统计数据失败")
		return fmt.Errorf("读取统计数据失败: %v", err)
	}

	ts.Lock()
	defer ts.Unlock()

	var statsData struct {
		Stats      map[string]map[string]int `json:"ip_stats"`
		ToolCounts map[string]int            `json:"tool_counts"`
		UpdateTime time.Time                 `json:"last_update"`
	}

	if err := json.Unmarshal(data, &statsData); err != nil {
		LogError("工具统计", err, "解析统计数据失败")
		return fmt.Errorf("解析统计数据失败: %v", err)
	}

	// 确保数据不为nil
	if statsData.Stats == nil {
		statsData.Stats = make(map[string]map[string]int)
	}
	if statsData.ToolCounts == nil {
		statsData.ToolCounts = make(map[string]int)
	}

	ts.Stats = statsData.Stats
	ts.ToolCounts = statsData.ToolCounts
	ts.LastSaveTime = statsData.UpdateTime

	LogOperation("工具统计", "加载统计数据", time.Since(start), nil)
	LogInfo("工具统计", "统计数据加载成功，IP数: %d, 工具数: %d", len(ts.Stats), len(ts.ToolCounts))

	return nil
}

// GetStats 获取统计信息概览
func (ts *ToolStats) GetStats() map[string]interface{} {
	ts.RLock()
	// 快速复制需要的数据
	totalIPs := len(ts.Stats)
	totalTools := len(ts.ToolCounts)
	totalAccesses := 0
	for _, count := range ts.ToolCounts {
		totalAccesses += count
	}
	lastUpdate := ts.LastSaveTime
	ts.RUnlock()

	return map[string]interface{}{
		"total_ips":      totalIPs,
		"total_tools":    totalTools,
		"total_accesses": totalAccesses,
		"last_update":    lastUpdate,
	}
}

// findToolByName 根据工具名称查找工具
func findToolByName(name string) *Tool {
	for _, category := range GetCategories() {
		for _, tool := range category.Tools {
			if tool.Name == name {
				return &tool
			}
		}
	}
	return nil
}
