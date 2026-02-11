package tools

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// HandleQuickSortTool 渲染快排演示页面
func HandleQuickSortTool(c *gin.Context) {
	c.HTML(http.StatusOK, "quicksort", gin.H{
		"Title": "快排算法演示",
	})
}
