package tools

import (
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// URLMapping 存储URL映射关系
type URLMapping struct {
	LongURL  string    `json:"long_url"`
	CreateAt time.Time `json:"create_at"`
}

// ShortURLRequest 表示短链接生成请求
type ShortURLRequest struct {
	URL string `json:"url"`
}

// ShortURLResponse 表示短链接生成响应
type ShortURLResponse struct {
	ShortURL string `json:"short_url"`
	LongURL  string `json:"long_url"`
}

var (
	urlMappings = make(map[string]URLMapping)
	urlMutex    sync.RWMutex
	dataFile    = filepath.Join("data", "shorturl_mappings.json")
	saveTicker  *time.Ticker
)

// init 初始化函数
func init() {
	// 确保data目录存在
	if err := os.MkdirAll("data", 0755); err != nil {
		LogError("短链接生成器", err, "创建数据目录失败")
		return
	}

	// 加载已存在的映射数据
	if err := loadMappings(); err != nil {
		LogError("短链接生成器", err, "加载URL映射数据失败")
	}

	// 启动定期保存
	saveTicker = time.NewTicker(5 * time.Minute)
	go func() {
		for range saveTicker.C {
			if err := saveMappings(); err != nil {
				LogError("短链接生成器", err, "保存URL映射数据失败")
			}
		}
	}()
}

// loadMappings 从文件加载URL映射
func loadMappings() error {
	start := time.Now()
	LogInfo("短链接生成器", "开始加载URL映射数据")

	// 检查文件是否存在
	if _, err := os.Stat(dataFile); os.IsNotExist(err) {
		LogInfo("短链接生成器", "URL映射数据文件不存在，将创建新文件")
		return nil
	}

	// 读取文件
	data, err := os.ReadFile(dataFile)
	if err != nil {
		return fmt.Errorf("读取URL映射数据文件失败: %v", err)
	}

	// 解析JSON
	var mappings map[string]URLMapping
	if err := json.Unmarshal(data, &mappings); err != nil {
		return fmt.Errorf("解析URL映射数据失败: %v", err)
	}

	// 更新内存中的映射
	urlMutex.Lock()
	urlMappings = mappings
	urlMutex.Unlock()

	LogOperation("短链接生成器", "加载URL映射数据", time.Since(start), nil)
	LogInfo("短链接生成器", "成功加载 %d 个URL映射", len(mappings))
	return nil
}

// saveMappings 保存URL映射到文件
func saveMappings() error {
	start := time.Now()
	LogInfo("短链接生成器", "开始保存URL映射数据")

	// 获取当前映射的副本
	urlMutex.RLock()
	mappings := make(map[string]URLMapping, len(urlMappings))
	for k, v := range urlMappings {
		mappings[k] = v
	}
	urlMutex.RUnlock()

	// 转换为JSON
	data, err := json.MarshalIndent(mappings, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化URL映射数据失败: %v", err)
	}

	// 写入文件
	if err := os.WriteFile(dataFile, data, 0644); err != nil {
		return fmt.Errorf("写入URL映射数据文件失败: %v", err)
	}

	LogOperation("短链接生成器", "保存URL映射数据", time.Since(start), nil)
	LogInfo("短链接生成器", "成功保存 %d 个URL映射", len(mappings))
	return nil
}

// generateShortURL 生成短链接
func generateShortURL(longURL string) string {
	start := time.Now()
	LogInfo("短链接生成器", "开始生成短链接，URL长度: %d", len(longURL))

	// 使用MD5生成哈希
	hash := md5.Sum([]byte(longURL))
	// 取前6位作为短链接
	shortURL := hex.EncodeToString(hash[:])[:6]

	LogOperation("短链接生成器", "生成短链接", time.Since(start), nil)
	LogInfo("短链接生成器", "短链接生成完成: %s", shortURL)

	return shortURL
}

// CreateShortURL 创建短链接
func CreateShortURL(longURL string) (*ShortURLResponse, error) {
	start := time.Now()
	LogInfo("短链接生成器", "开始创建短链接，URL: %s", longURL)

	if longURL == "" {
		LogWarning("短链接生成器", "URL为空")
		return nil, fmt.Errorf("URL不能为空")
	}

	// 确保URL包含协议
	if !strings.HasPrefix(longURL, "http://") && !strings.HasPrefix(longURL, "https://") {
		longURL = "https://" + longURL
	}

	// 生成短链接
	shortURL := generateShortURL(longURL)

	// 存储映射关系
	urlMutex.Lock()
	urlMappings[shortURL] = URLMapping{
		LongURL:  longURL,
		CreateAt: time.Now(),
	}
	urlMutex.Unlock()

	// 立即保存到文件
	if err := saveMappings(); err != nil {
		LogError("短链接生成器", err, "保存URL映射失败")
	}

	LogOperation("短链接生成器", "创建短链接", time.Since(start), nil)
	LogInfo("短链接生成器", "短链接创建成功: %s -> %s", shortURL, longURL)

	return &ShortURLResponse{
		ShortURL: shortURL,
		LongURL:  longURL,
	}, nil
}

// ShortURLHandler 处理短链接生成请求
func ShortURLHandler(c *gin.Context) {
	if c.Request.Method == "GET" {
		// 显示短链接生成页面
		c.HTML(http.StatusOK, "shorturl", gin.H{
			"Title": "短链接生成器",
		})
		return
	}

	// 处理POST请求
	var req ShortURLRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		LogError("短链接生成器", err, "请求参数解析失败")
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "无效的请求参数",
		})
		return
	}

	result, err := CreateShortURL(req.URL)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	// 返回结果
	c.JSON(http.StatusOK, gin.H{
		"short_url": fmt.Sprintf("%s/tools/shorturl/%s", getBaseURL(c), result.ShortURL),
		"long_url":  result.LongURL,
	})
}

// RedirectHandler 处理短链接重定向
func RedirectHandler(c *gin.Context) {
	shortURL := c.Param("shorturl")
	if shortURL == "" {
		LogWarning("短链接生成器", "无效的短链接参数")
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "无效的短链接",
		})
		return
	}

	// 查找原始URL
	urlMutex.RLock()
	mapping, exists := urlMappings[shortURL]
	urlMutex.RUnlock()

	if !exists {
		LogWarning("短链接生成器", "短链接不存在: %s", shortURL)
		c.JSON(http.StatusNotFound, gin.H{
			"error": "短链接不存在",
		})
		return
	}

	LogInfo("短链接生成器", "重定向短链接: %s -> %s", shortURL, mapping.LongURL)
	// 重定向到原始URL
	c.Redirect(http.StatusMovedPermanently, mapping.LongURL)
}

// getBaseURL 获取基础URL
func getBaseURL(c *gin.Context) string {
	scheme := "http"
	if c.Request.TLS != nil {
		scheme = "https"
	}
	return fmt.Sprintf("%s://%s", scheme, c.Request.Host)
}
