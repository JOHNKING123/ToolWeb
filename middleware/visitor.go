package middleware

import (
	"log"
	"net"
	"strings"

	"github.com/gin-gonic/gin"
)

// VisitorStatsRecorder 访客统计记录器类型
type VisitorStatsRecorder interface {
	RecordVisitor(ip string)
}

// VisitorStats 访客统计中间件
func VisitorStats(recorder VisitorStatsRecorder) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 获取真实IP地址
		ip := getRealIP(c)

		// 记录访客
		if recorder != nil {
			recorder.RecordVisitor(ip)
		}

		// 继续处理请求
		c.Next()
	}
}

// getRealIP 获取真实的客户端IP地址
func getRealIP(c *gin.Context) string {
	// 尝试从各种头部获取真实IP
	ip := c.GetHeader("X-Forwarded-For")
	if ip != "" {
		// X-Forwarded-For 可能包含多个IP，取第一个
		ips := strings.Split(ip, ",")
		if len(ips) > 0 {
			ip = strings.TrimSpace(ips[0])
		}
	}

	if ip == "" {
		ip = c.GetHeader("X-Real-IP")
	}

	if ip == "" {
		ip = c.GetHeader("X-Forwarded")
	}

	if ip == "" {
		ip = c.GetHeader("Forwarded-For")
	}

	if ip == "" {
		ip = c.GetHeader("Forwarded")
	}

	// 如果都没有，使用RemoteAddr
	if ip == "" {
		ip = c.ClientIP()
	}

	// 验证IP地址格式
	if net.ParseIP(ip) == nil {
		// 如果解析失败，使用RemoteAddr作为后备
		ip = c.ClientIP()
		log.Printf("无法解析IP地址，使用后备IP: %s", ip)
	}

	return ip
}
