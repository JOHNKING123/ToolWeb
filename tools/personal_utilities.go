package tools

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/skip2/go-qrcode"
)

const clipboardFile = "data/personal_clipboard.json"

var clipboardMu sync.Mutex

type clipboardEntry struct {
	ID      string    `json:"id"`
	Text    string    `json:"text"`
	Updated time.Time `json:"updated"`
}

// RegisterPersonalUtilities registers authenticated cross-device utilities.
func RegisterPersonalUtilities(group *gin.RouterGroup) {
	group.Use(func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		c.Header("Referrer-Policy", "same-origin")
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
			if origin := c.GetHeader("Origin"); origin != "" {
				parsed, err := url.Parse(origin)
				if err != nil || parsed.Host != c.Request.Host {
					c.AbortWithStatusJSON(403, gin.H{"error": "不允许跨站操作"})
					return
				}
			}
		}
		c.Next()
	})
	group.GET("/transfer", func(c *gin.Context) {
		c.HTML(200, "personal_transfer", gin.H{"Categories": GetCategories()})
	})
	group.GET("/transfer/list", func(c *gin.Context) {
		if err := ensurePersonalFilesRoot(); err != nil {
			c.JSON(500, gin.H{"error": "创建收发目录失败"})
			return
		}
		if err := os.Mkdir(filepath.Join(personalFilesRoot, "手机电脑互传"), 0700); err != nil && !os.IsExist(err) {
			c.JSON(500, gin.H{"error": "创建收发目录失败"})
			return
		}
		query := c.Request.URL.Query()
		query.Set("path", "手机电脑互传")
		c.Request.URL.RawQuery = query.Encode()
		HandlePersonalFileList(c)
	})
	group.GET("/transfer/addresses", func(c *gin.Context) {
		scheme := "http"
		if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
			scheme = "https"
		}
		host, port, err := net.SplitHostPort(c.Request.Host)
		if err != nil {
			host = c.Request.Host
		}
		addresses := []string{scheme + "://" + c.Request.Host + "/tools/personal/transfer"}
		ip := net.ParseIP(host)
		if host == "localhost" || (ip != nil && ip.IsLoopback()) {
			addresses = []string{}
			interfaces, _ := net.InterfaceAddrs()
			for _, addr := range interfaces {
				network, ok := addr.(*net.IPNet)
				if !ok || network.IP.To4() == nil || !network.IP.IsPrivate() {
					continue
				}
				target := network.IP.String()
				if port != "" {
					target = net.JoinHostPort(target, port)
				}
				addresses = append(addresses, scheme+"://"+target+"/tools/personal/transfer")
			}
		}
		c.JSON(200, gin.H{"addresses": addresses})
	})
	group.GET("/transfer/qr", func(c *gin.Context) {
		value := c.Query("url")
		parsed, err := url.Parse(value)
		if err != nil || len(value) > 2048 || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
			c.JSON(400, gin.H{"error": "请输入有效的访问地址"})
			return
		}
		png, err := qrcode.Encode(value, qrcode.Medium, 256)
		if err != nil {
			c.JSON(400, gin.H{"error": "二维码生成失败"})
			return
		}
		c.Data(200, "image/png", png)
	})
	group.GET("/clipboard", func(c *gin.Context) {
		c.HTML(200, "personal_clipboard", gin.H{"Categories": GetCategories()})
	})
	group.GET("/clipboard/api", clipboardAPI)
	group.POST("/clipboard/api", clipboardAPI)
	group.DELETE("/clipboard/api/:id", clipboardAPI)
}

func clipboardAPI(c *gin.Context) {
	clipboardMu.Lock()
	defer clipboardMu.Unlock()
	entries := []clipboardEntry{}
	data, err := os.ReadFile(clipboardFile)
	if err == nil {
		err = json.Unmarshal(data, &entries)
	}
	if err != nil && !os.IsNotExist(err) {
		c.JSON(500, gin.H{"error": "读取剪贴板失败"})
		return
	}
	if entries == nil {
		entries = []clipboardEntry{}
	}
	if c.Request.Method == http.MethodGet {
		c.JSON(200, gin.H{"items": entries})
		return
	}
	if c.Request.Method == http.MethodDelete {
		found := false
		for i, entry := range entries {
			if entry.ID == c.Param("id") {
				entries = append(entries[:i], entries[i+1:]...)
				found = true
				break
			}
		}
		if !found {
			c.JSON(404, gin.H{"error": "记录不存在"})
			return
		}
	} else {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 128<<10)
		var input struct {
			ID   string `json:"id"`
			Text string `json:"text"`
		}
		if err := c.ShouldBindJSON(&input); err != nil || strings.TrimSpace(input.Text) == "" || len(input.Text) > 32768 {
			c.JSON(400, gin.H{"error": "请输入文字，每条最多 32 KB"})
			return
		}
		if input.ID != "" {
			found := false
			for i := range entries {
				if entries[i].ID == input.ID {
					entries = append(entries[:i], entries[i+1:]...)
					found = true
					break
				}
			}
			if !found {
				c.JSON(404, gin.H{"error": "记录已删除，请刷新后重试"})
				return
			}
		} else {
			if len(entries) >= 200 {
				c.JSON(409, gin.H{"error": "已达到 200 条上限，请删除旧记录"})
				return
			}
			token := make([]byte, 16)
			if _, err := rand.Read(token); err != nil {
				c.JSON(500, gin.H{"error": "创建记录失败"})
				return
			}
			input.ID = hex.EncodeToString(token)
		}
		entries = append([]clipboardEntry{{ID: input.ID, Text: input.Text, Updated: time.Now()}}, entries...)
	}
	if err := writeClipboard(entries); err != nil {
		c.JSON(500, gin.H{"error": "保存失败，请重试"})
		return
	}
	c.JSON(200, gin.H{"success": true})
}

func writeClipboard(entries []clipboardEntry) error {
	if err := os.MkdirAll(filepath.Dir(clipboardFile), 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(clipboardFile), ".clipboard-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	defer file.Close()
	if err := json.NewEncoder(file).Encode(entries); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close clipboard: %w", err)
	}
	return os.Rename(file.Name(), clipboardFile)
}
