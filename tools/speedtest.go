package tools

import (
	"crypto/rand"
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// 网速测试（speed_test）后端端点。
//
// 测的是「用户浏览器 → 本站服务器」这一段链路的速率与延迟，不依赖第三方
// CDN（跨境节点延迟不可控），测得的速度不代表访问其它网站的速度。
//
// 延迟测试的前端实现：对 download 端点发 HEAD 请求＋cache-bust 参数；
// HEAD 只回响应头（Content-Length），不产生下载流量。

// speedTestAllowedSizes 下载档位白名单（MB）
var speedTestAllowedSizes = map[int]bool{1: true, 10: true, 25: true}

// HandleSpeedTestDownload 网速测试下载端点
// GET /tools/api/speed-test/download?size_mb=N（N ∈ {1,10,25}，默认 1）
// 流式输出 N MiB 随机字节：无磁盘占用；响应头禁用一切缓存，
// 以便测到真实的链路速率而非命中缓存。
func HandleSpeedTestDownload(c *gin.Context) {
	sizeMB := 1
	if v := c.Query("size_mb"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			sizeMB = n
		}
	}
	if !speedTestAllowedSizes[sizeMB] {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "size_mb 仅支持 1、10、25"})
		return
	}
	total := int64(sizeMB) * 1024 * 1024
	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Length", strconv.FormatInt(total, 10))
	c.Header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
	c.Header("Pragma", "no-cache")
	c.Header("Expires", "0")
	c.Header("X-Content-Type-Options", "nosniff")
	// 延迟测试用 HEAD：只回头不写体，零流量、零 CPU
	if c.Request.Method == http.MethodHead {
		c.Status(http.StatusOK)
		return
	}
	c.Status(http.StatusOK)
	w := c.Writer
	buf := make([]byte, 64*1024)
	var sent int64
	for sent < total {
		n := len(buf)
		if rem := total - sent; rem < int64(n) {
			n = int(rem)
		}
		if _, err := rand.Read(buf[:n]); err != nil {
			return
		}
		if _, err := w.Write(buf[:n]); err != nil {
			return
		}
		sent += int64(n)
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}
}

// speedTestUploadMax 单次上传上限（防滥用），64MB
const speedTestUploadMax = 64 << 20

// HandleSpeedTestUpload 网速测试上传端点
// POST /tools/api/speed-test/upload
// 读弃请求 body，返回实际接收的字节数（前端据此计算上行速率）。
func HandleSpeedTestUpload(c *gin.Context) {
	n, err := io.Copy(io.Discard, io.LimitReader(c.Request.Body, speedTestUploadMax+1))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "msg": "读取上传数据失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "received": n})
}
