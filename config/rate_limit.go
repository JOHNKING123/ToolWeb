package config

import "time"

// RateLimitConfig 限流配置
type RateLimitConfig struct {
	// 通用限流配置
	GeneralLimit  int           // 普通用户每分钟请求限制
	GeneralWindow time.Duration // 普通用户限流时间窗口

	// API限流配置 - API接口更严格的限制
	APILimit  int           // API每分钟请求限制
	APIWindow time.Duration // API限流时间窗口

	// 严格限流配置 - 针对特定路径的严格限制
	StrictPaths  []string      // 需要严格限流的路径
	StrictLimit  int           // 严格限流每分钟请求限制
	StrictWindow time.Duration // 严格限流时间窗口

	// 白名单配置
	WhitelistIPs []string // IP白名单，不受限流限制
}

// GetDefaultRateLimitConfig 获取默认限流配置
func GetDefaultRateLimitConfig() *RateLimitConfig {
	return &RateLimitConfig{
		// 普通访问：每分钟100次请求
		GeneralLimit:  300,
		GeneralWindow: time.Minute,

		// API访问：每分钟30次请求
		APILimit:  150,
		APIWindow: time.Minute,

		// 严格限流路径
		StrictPaths: []string{
			"/tools/api/",      // API接口
			"/ebook/download/", // 下载接口
		},
		StrictLimit:  50, // 每分钟10次
		StrictWindow: time.Minute,

		// 白名单IP（本地和内网地址）
		WhitelistIPs: []string{
			"127.0.0.1",
			"::1",
			"10.0.0.0/8",
			"172.16.0.0/12",
			"192.168.0.0/16",
		},
	}
}

// GetTestRateLimitConfig 获取测试限流配置（用于快速测试限流效果）
func GetTestRateLimitConfig() *RateLimitConfig {
	return &RateLimitConfig{
		// 普通访问：每分钟50次请求（测试用）
		GeneralLimit:  50,
		GeneralWindow: time.Minute,

		// API访问：每分钟30次请求（测试用）
		APILimit:  30,
		APIWindow: time.Minute,

		// 严格限流路径
		StrictPaths: []string{
			"/tools/api/",      // API接口
			"/ebook/download/", // 下载接口
		},
		StrictLimit:  20, // 每分钟20次（测试用）
		StrictWindow: time.Minute,

		// 测试时不设置白名单
		WhitelistIPs: []string{},
	}
}

// 生产环境限流配置（更严格）
func GetProductionRateLimitConfig() *RateLimitConfig {
	return &RateLimitConfig{
		// 普通访问：每分钟60次请求
		GeneralLimit:  60,
		GeneralWindow: time.Minute,

		// API访问：每分钟20次请求
		APILimit:  20,
		APIWindow: time.Minute,

		// 严格限流路径
		StrictPaths: []string{
			"/tools/api/",
			"/ebook/download/",
			"/admin/",
		},
		StrictLimit:  5, // 每分钟5次
		StrictWindow: time.Minute,

		// 生产环境不设置白名单
		WhitelistIPs: []string{},
	}
}
