package middleware

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RequestRecord 请求记录
type RequestRecord struct {
	Count     int       // 请求次数
	ResetTime time.Time // 重置时间
}

// RateLimiter IP限流器
type RateLimiter struct {
	mu       sync.RWMutex
	requests map[string]*RequestRecord // IP -> 请求记录
	limit    int                       // 限制次数
	window   time.Duration             // 时间窗口
	cleanup  time.Duration             // 清理间隔
}

// NewRateLimiter 创建新的限流器
func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		requests: make(map[string]*RequestRecord),
		limit:    limit,
		window:   window,
		cleanup:  window * 2, // 清理间隔为窗口时间的2倍
	}

	// 启动清理协程
	go rl.cleanupExpiredRecords()

	return rl
}

// IsAllowed 检查IP是否允许访问
func (rl *RateLimiter) IsAllowed(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()

	// 获取或创建请求记录
	record, exists := rl.requests[ip]
	if !exists {
		rl.requests[ip] = &RequestRecord{
			Count:     1,
			ResetTime: now.Add(rl.window),
		}
		return true
	}

	// 检查是否需要重置计数
	if now.After(record.ResetTime) {
		record.Count = 1
		record.ResetTime = now.Add(rl.window)
		return true
	}

	// 检查是否超过限制
	if record.Count >= rl.limit {
		return false
	}

	// 增加计数
	record.Count++
	return true
}

// GetRequestCount 获取IP的当前请求次数
func (rl *RateLimiter) GetRequestCount(ip string) int {
	rl.mu.RLock()
	defer rl.mu.RUnlock()

	if record, exists := rl.requests[ip]; exists {
		if time.Now().Before(record.ResetTime) {
			return record.Count
		}
	}
	return 0
}

// GetRemainingRequests 获取IP剩余请求次数
func (rl *RateLimiter) GetRemainingRequests(ip string) int {
	count := rl.GetRequestCount(ip)
	remaining := rl.limit - count
	if remaining < 0 {
		return 0
	}
	return remaining
}

// cleanupExpiredRecords 清理过期记录
func (rl *RateLimiter) cleanupExpiredRecords() {
	ticker := time.NewTicker(rl.cleanup)
	defer ticker.Stop()

	for range ticker.C {
		rl.mu.Lock()
		now := time.Now()

		for ip, record := range rl.requests {
			// 删除过期记录（超过重置时间1小时的记录）
			if now.Sub(record.ResetTime) > time.Hour {
				delete(rl.requests, ip)
			}
		}

		rl.mu.Unlock()
	}
}

// RateLimitMiddleware 限流中间件
func RateLimitMiddleware(rl *RateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 获取客户端IP
		ip := c.ClientIP()

		// 检查是否允许访问
		if !rl.IsAllowed(ip) {
			// 获取剩余时间
			rl.mu.RLock()
			record := rl.requests[ip]
			resetTime := record.ResetTime
			rl.mu.RUnlock()

			remainingTime := time.Until(resetTime)

			// 设置响应头
			c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", rl.limit))
			c.Header("X-RateLimit-Remaining", "0")
			c.Header("X-RateLimit-Reset", fmt.Sprintf("%d", resetTime.Unix()))
			c.Header("Retry-After", fmt.Sprintf("%d", int(remainingTime.Seconds())))

			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "请求过于频繁",
				"message":     "您的请求过于频繁，请稍后再试",
				"retry_after": int(remainingTime.Seconds()),
			})
			c.Abort()
			return
		}

		// 设置响应头
		remaining := rl.GetRemainingRequests(ip)
		c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", rl.limit))
		c.Header("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))

		c.Next()
	}
}
