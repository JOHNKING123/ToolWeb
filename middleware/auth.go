package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// 用户会话信息
type UserSession struct {
	Username string
	IsAdmin  bool
}

// AuthRequired 验证用户是否已登录
func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 从 cookie 中获取 session
		session, err := c.Cookie("session")
		if err != nil || session == "" {
			// 未登录，重定向到登录页
			c.Redirect(http.StatusFound, "/ebook/login")
			c.Abort()
			return
		}

		// TODO: 这里可以添加更多的 session 验证逻辑
		// 例如：验证 session 是否有效、是否过期等

		// 设置用户信息到上下文
		c.Set("user", &UserSession{
			Username: "user", // 这里应该从 session 中获取实际用户名
			IsAdmin:  false,  // 这里应该从 session 中获取实际权限
		})

		c.Next()
	}
}

// AdminRequired 验证用户是否是管理员
func AdminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		user, exists := c.Get("user")
		if !exists {
			c.Redirect(http.StatusFound, "/ebook/login")
			c.Abort()
			return
		}

		userSession, ok := user.(*UserSession)
		if !ok || !userSession.IsAdmin {
			c.JSON(http.StatusForbidden, gin.H{
				"status":  "error",
				"message": "需要管理员权限",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}
