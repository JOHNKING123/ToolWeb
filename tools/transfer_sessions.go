package tools

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type transferSession struct {
	Folder  string
	Expires time.Time
}

// Keep temporary routes inside the deployed /tools reverse-proxy prefix.
const transferGuestPrefix = "/tools/transfer/temporary"

var transferSessions = struct {
	sync.Mutex
	Values map[string]transferSession
}{Values: make(map[string]transferSession)}

// RegisterTransferSessions issues narrow, expiring grants without admin cookies.
func RegisterTransferSessions(router *gin.Engine, owner *gin.RouterGroup) {
	owner.POST("/transfer/sessions", func(c *gin.Context) {
		transferSessions.Lock()
		defer transferSessions.Unlock()
		for token, session := range transferSessions.Values {
			if !time.Now().Before(session.Expires) {
				delete(transferSessions.Values, token)
			}
		}
		if len(transferSessions.Values) >= 100 {
			c.JSON(429, gin.H{"error": "临时连接数量过多，请结束旧连接"})
			return
		}
		random := make([]byte, 32)
		if _, err := rand.Read(random); err != nil {
			c.JSON(500, gin.H{"error": "创建连接失败"})
			return
		}
		token := hex.EncodeToString(random)
		folder := "手机电脑互传/会话-" + time.Now().Format("20060102-150405") + "-" + token[:8]
		if err := ensurePersonalFilesRoot(); err != nil {
			c.JSON(500, gin.H{"error": "创建目录失败"})
			return
		}
		// Resolve the parent before creating a session folder.
		parent := filepath.Join(personalFilesRoot, "手机电脑互传")
		if err := os.Mkdir(parent, 0700); err != nil && !os.IsExist(err) {
			c.JSON(500, gin.H{"error": "创建目录失败"})
			return
		}
		_, parent, err := resolvePersonalPath("手机电脑互传", true)
		if err != nil {
			c.JSON(500, gin.H{"error": "收发目录不可用"})
			return
		}
		if err := os.Mkdir(filepath.Join(parent, filepath.Base(folder)), 0700); err != nil {
			c.JSON(500, gin.H{"error": "创建目录失败"})
			return
		}
		session := transferSession{Folder: folder, Expires: time.Now().Add(30 * time.Minute)}
		transferSessions.Values[token] = session
		c.JSON(200, gin.H{"token": token, "expires": session.Expires, "path": transferGuestPrefix + "/" + token})
	})
	owner.DELETE("/transfer/sessions/:token", func(c *gin.Context) {
		transferSessions.Lock()
		delete(transferSessions.Values, c.Param("token"))
		transferSessions.Unlock()
		c.JSON(200, gin.H{"success": true})
	})
	guest := router.Group(transferGuestPrefix+"/:token", func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		c.Header("Referrer-Policy", "no-referrer")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'")
		if origin := c.GetHeader("Origin"); origin != "" {
			parsed, err := url.Parse(origin)
			if err != nil || parsed.Host != c.Request.Host {
				c.AbortWithStatusJSON(403, gin.H{"error": "不允许跨站操作"})
				return
			}
		}
		transferSessions.Lock()
		session, ok := transferSessions.Values[c.Param("token")]
		transferSessions.Unlock()
		if !ok || !time.Now().Before(session.Expires) {
			if c.Request.URL.Path == transferGuestPrefix+"/"+c.Param("token") {
				c.String(410, "连接已过期或已结束，请让电脑端重新生成二维码。")
			} else {
				c.JSON(410, gin.H{"error": "连接已过期或已结束，请重新扫码"})
			}
			c.Abort()
			return
		}
		current := personalFilesRoot
		for _, part := range strings.Split(session.Folder, "/") {
			current = filepath.Join(current, part)
			info, err := os.Lstat(current)
			if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
				c.AbortWithStatusJSON(410, gin.H{"error": "本次收发目录已不可用，请重新生成二维码"})
				return
			}
		}
		c.Set("transferSession", session)
		c.Next()
	})
	guest.GET("", func(c *gin.Context) { c.HTML(200, "transfer_guest", nil) })
	guest.GET("/list", func(c *gin.Context) {
		session := c.MustGet("transferSession").(transferSession)
		query := c.Request.URL.Query()
		query.Set("path", session.Folder)
		c.Request.URL.RawQuery = query.Encode()
		HandlePersonalFileList(c)
	})
	guest.POST("/upload", func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, personalUploadLimit)
		err := c.Request.ParseMultipartForm(16 << 20)
		if c.Request.MultipartForm != nil {
			defer c.Request.MultipartForm.RemoveAll()
		}
		if err != nil {
			c.JSON(413, gin.H{"error": "上传失败，每批最多 100 MB"})
			return
		}
		session := c.MustGet("transferSession").(transferSession)
		// Ignore all client-supplied destinations.
		c.Request.PostForm = url.Values{"path": {session.Folder}}
		c.Request.MultipartForm.Value = map[string][]string{"path": {session.Folder}}
		HandlePersonalFileUpload(c)
	})
	guest.GET("/content", func(c *gin.Context) {
		full, err := transferFile(c)
		if err != nil {
			c.JSON(404, gin.H{"error": "文件不存在"})
			return
		}
		servePersonalFile(c, full, true)
	})
	guest.DELETE("/file", func(c *gin.Context) {
		full, err := transferFile(c)
		if err != nil {
			c.JSON(404, gin.H{"error": "文件不存在"})
			return
		}
		if err := os.Remove(full); err != nil {
			c.JSON(500, gin.H{"error": "删除失败"})
			return
		}
		c.JSON(200, gin.H{"success": true})
	})
}

func transferFile(c *gin.Context) (string, error) {
	name, err := validatePersonalFileName(c.Query("name"))
	if err != nil {
		return "", err
	}
	session := c.MustGet("transferSession").(transferSession)
	// Reject symlinks rather than following them into other personal folders.
	current, err := filepath.Abs(personalFilesRoot)
	if err != nil {
		return "", err
	}
	for _, part := range strings.Split(session.Folder+"/"+name, "/") {
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if err != nil {
			return "", err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("symlink denied")
		}
	}
	info, err := os.Stat(current)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("not a file")
	}
	return current, nil
}
