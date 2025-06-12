package middleware

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"time"

	"toolweb/config"

	"github.com/gin-gonic/gin"
)

// SmartRateLimiter 智能限流器
type SmartRateLimiter struct {
	generalLimiter *RateLimiter // 通用限流器
	apiLimiter     *RateLimiter // API限流器
	strictLimiter  *RateLimiter // 严格限流器
	config         *config.RateLimitConfig
}

// NewSmartRateLimiter 创建智能限流器
func NewSmartRateLimiter(cfg *config.RateLimitConfig) *SmartRateLimiter {
	return &SmartRateLimiter{
		generalLimiter: NewRateLimiter(cfg.GeneralLimit, cfg.GeneralWindow),
		apiLimiter:     NewRateLimiter(cfg.APILimit, cfg.APIWindow),
		strictLimiter:  NewRateLimiter(cfg.StrictLimit, cfg.StrictWindow),
		config:         cfg,
	}
}

// isIPInWhitelist 检查IP是否在白名单中
func (srl *SmartRateLimiter) isIPInWhitelist(ip string) bool {
	for _, whiteIP := range srl.config.WhitelistIPs {
		// 处理CIDR格式
		if strings.Contains(whiteIP, "/") {
			_, cidr, err := net.ParseCIDR(whiteIP)
			if err != nil {
				continue
			}
			if cidr.Contains(net.ParseIP(ip)) {
				return true
			}
		} else {
			// 直接IP比较
			if ip == whiteIP {
				return true
			}
		}
	}
	return false
}

// getLimiterForPath 根据路径获取对应的限流器
func (srl *SmartRateLimiter) getLimiterForPath(path string) *RateLimiter {
	// 检查是否是严格限流路径
	for _, strictPath := range srl.config.StrictPaths {
		if strings.HasPrefix(path, strictPath) {
			return srl.strictLimiter
		}
	}

	// 检查是否是API路径
	if strings.HasPrefix(path, "/tools/api/") || strings.HasPrefix(path, "/api/") {
		return srl.apiLimiter
	}

	// 默认使用通用限流器
	return srl.generalLimiter
}

// SmartRateLimitMiddleware 智能限流中间件
func SmartRateLimitMiddleware(srl *SmartRateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 获取客户端IP
		ip := c.ClientIP()
		path := c.Request.URL.Path

		// 检查白名单
		if srl.isIPInWhitelist(ip) {
			c.Next()
			return
		}

		// 根据路径选择限流器
		limiter := srl.getLimiterForPath(path)

		// 检查是否允许访问
		if !limiter.IsAllowed(ip) {
			// 获取剩余时间
			limiter.mu.RLock()
			record := limiter.requests[ip]
			resetTime := record.ResetTime
			limiter.mu.RUnlock()

			remainingTime := time.Until(resetTime)

			// 设置响应头
			c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", limiter.limit))
			c.Header("X-RateLimit-Remaining", "0")
			c.Header("X-RateLimit-Reset", fmt.Sprintf("%d", resetTime.Unix()))
			c.Header("Retry-After", fmt.Sprintf("%d", int(remainingTime.Seconds())))

			// 记录被限流的访问
			log.Printf("[RATE_LIMIT] IP %s 被限流 - 路径: %s, 限制: %d次/%v",
				ip, path, limiter.limit, limiter.window)

			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "请求过于频繁",
				"message":     "您的请求过于频繁，请稍后再试",
				"retry_after": int(remainingTime.Seconds()),
				"path":        path,
			})
			c.Abort()
			return
		}

		// 设置响应头
		remaining := limiter.GetRemainingRequests(ip)
		c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", limiter.limit))
		c.Header("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))

		c.Next()
	}
}

// GetLimiterStats 获取限流器统计信息
func (srl *SmartRateLimiter) GetLimiterStats() map[string]interface{} {
	srl.generalLimiter.mu.RLock()
	generalCount := len(srl.generalLimiter.requests)
	srl.generalLimiter.mu.RUnlock()

	srl.apiLimiter.mu.RLock()
	apiCount := len(srl.apiLimiter.requests)
	srl.apiLimiter.mu.RUnlock()

	srl.strictLimiter.mu.RLock()
	strictCount := len(srl.strictLimiter.requests)
	srl.strictLimiter.mu.RUnlock()

	return map[string]interface{}{
		"general_active_ips": generalCount,
		"api_active_ips":     apiCount,
		"strict_active_ips":  strictCount,
		"config": map[string]interface{}{
			"general_limit": srl.config.GeneralLimit,
			"api_limit":     srl.config.APILimit,
			"strict_limit":  srl.config.StrictLimit,
			"whitelist_ips": srl.config.WhitelistIPs,
		},
	}
}
