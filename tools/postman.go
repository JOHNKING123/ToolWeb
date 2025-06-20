package tools

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

// HTTPRequest 表示一个 HTTP 请求
type HTTPRequest struct {
	Method      string            `json:"method"`
	URL         string            `json:"url"`
	Headers     map[string]string `json:"headers"`
	Body        string            `json:"body"`
	ContentType string            `json:"contentType"`
	Timeout     int               `json:"timeout"` // 秒
}

// HTTPResponse 表示一个 HTTP 响应
type HTTPResponse struct {
	StatusCode    int               `json:"statusCode"`
	StatusText    string            `json:"statusText"`
	Headers       map[string]string `json:"headers"`
	Body          string            `json:"body"`
	ContentType   string            `json:"contentType"`
	ContentLength int64             `json:"contentLength"`
	Time          int64             `json:"time"` // 响应时间（毫秒）
	Size          int64             `json:"size"` // 响应大小（字节）
}

// PostmanRequest 表示 Postman 请求
type PostmanRequest struct {
	Request  HTTPRequest  `json:"request"`
	Response HTTPResponse `json:"response,omitempty"`
	Error    string       `json:"error,omitempty"`
}

// EnvironmentVariable 表示环境变量
type EnvironmentVariable struct {
	Key   string `json:"key"`
	Value string `json:"value"`
	Type  string `json:"type"` // string, number, boolean
}

// Environment 表示环境配置
type Environment struct {
	ID        string                `json:"id"`
	Name      string                `json:"name"`
	Variables []EnvironmentVariable `json:"variables"`
	CreatedAt time.Time             `json:"createdAt"`
	UpdatedAt time.Time             `json:"updatedAt"`
}

// RequestHistory 表示请求历史
type RequestHistory struct {
	ID        string       `json:"id"`
	Name      string       `json:"name"`
	Request   HTTPRequest  `json:"request"`
	Response  HTTPResponse `json:"response"`
	Timestamp time.Time    `json:"timestamp"`
	Status    string       `json:"status"` // success, error
	Error     string       `json:"error,omitempty"`
}

// PostmanManager 管理 Postman 相关功能
type PostmanManager struct {
	environments map[string]*Environment
	userHistory  map[string][]RequestHistory // 按用户ID隔离历史记录
	mutex        sync.RWMutex
}

var (
	postmanManager *PostmanManager
	postmanOnce    sync.Once
)

// GetPostmanManager 获取 Postman 管理器实例
func GetPostmanManager() *PostmanManager {
	postmanOnce.Do(func() {
		postmanManager = &PostmanManager{
			environments: make(map[string]*Environment),
			userHistory:  make(map[string][]RequestHistory),
		}
		// 创建默认环境
		postmanManager.createDefaultEnvironment()
	})
	return postmanManager
}

// createDefaultEnvironment 创建默认环境
func (pm *PostmanManager) createDefaultEnvironment() {
	defaultEnv := &Environment{
		ID:        "default",
		Name:      "默认环境",
		Variables: []EnvironmentVariable{},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	pm.environments["default"] = defaultEnv
}

// SendRequest 发送 HTTP 请求
func (pm *PostmanManager) SendRequest(userID string, req HTTPRequest, envID string) (*PostmanRequest, error) {
	startTime := time.Now()

	// 处理环境变量
	processedReq, err := pm.processEnvironmentVariables(req, envID)
	if err != nil {
		return nil, fmt.Errorf("处理环境变量失败: %v", err)
	}

	// 验证 URL
	if processedReq.URL == "" {
		return nil, fmt.Errorf("URL 不能为空")
	}

	// 解析 URL
	parsedURL, err := url.Parse(processedReq.URL)
	if err != nil {
		return nil, fmt.Errorf("无效的 URL: %v", err)
	}

	// 设置超时
	timeout := 30 * time.Second
	if processedReq.Timeout > 0 {
		timeout = time.Duration(processedReq.Timeout) * time.Second
	}

	// 创建 HTTP 客户端
	client := &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: true, // 允许自签名证书
			},
		},
	}

	// 创建请求
	httpReq, err := http.NewRequest(processedReq.Method, processedReq.URL, nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %v", err)
	}

	// 设置请求头
	for key, value := range processedReq.Headers {
		httpReq.Header.Set(key, value)
	}

	// 设置请求体
	if processedReq.Body != "" {
		httpReq.Body = io.NopCloser(strings.NewReader(processedReq.Body))
		httpReq.ContentLength = int64(len(processedReq.Body))
	}

	// 发送请求
	resp, err := client.Do(httpReq)
	if err != nil {
		// 记录错误到历史
		pm.addToHistory(userID, RequestHistory{
			ID:        generateID(),
			Name:      fmt.Sprintf("%s %s", processedReq.Method, parsedURL.Host),
			Request:   processedReq,
			Timestamp: time.Now(),
			Status:    "error",
			Error:     err.Error(),
		})
		return nil, fmt.Errorf("发送请求失败: %v", err)
	}
	defer resp.Body.Close()

	// 读取响应体
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应体失败: %v", err)
	}

	// 计算响应时间
	responseTime := time.Since(startTime).Milliseconds()

	// 构建响应头
	headers := make(map[string]string)
	for key, values := range resp.Header {
		headers[key] = strings.Join(values, ", ")
	}

	// 构建响应
	httpResp := HTTPResponse{
		StatusCode:    resp.StatusCode,
		StatusText:    resp.Status,
		Headers:       headers,
		Body:          string(bodyBytes),
		ContentType:   resp.Header.Get("Content-Type"),
		ContentLength: resp.ContentLength,
		Time:          responseTime,
		Size:          int64(len(bodyBytes)),
	}

	// 记录到历史
	pm.addToHistory(userID, RequestHistory{
		ID:        generateID(),
		Name:      fmt.Sprintf("%s %s", processedReq.Method, parsedURL.Host),
		Request:   processedReq,
		Response:  httpResp,
		Timestamp: time.Now(),
		Status:    "success",
	})

	return &PostmanRequest{
		Request:  processedReq,
		Response: httpResp,
	}, nil
}

// processEnvironmentVariables 处理环境变量
func (pm *PostmanManager) processEnvironmentVariables(req HTTPRequest, envID string) (HTTPRequest, error) {
	pm.mutex.RLock()
	env, exists := pm.environments[envID]
	pm.mutex.RUnlock()

	if !exists {
		return req, nil
	}

	processed := req

	// 处理 URL 中的变量
	processed.URL = pm.replaceVariables(processed.URL, env.Variables)

	// 处理请求头中的变量
	for key, value := range processed.Headers {
		processed.Headers[key] = pm.replaceVariables(value, env.Variables)
	}

	// 处理请求体中的变量
	processed.Body = pm.replaceVariables(processed.Body, env.Variables)

	return processed, nil
}

// replaceVariables 替换字符串中的变量
func (pm *PostmanManager) replaceVariables(input string, variables []EnvironmentVariable) string {
	result := input
	for _, variable := range variables {
		placeholder := fmt.Sprintf("{{%s}}", variable.Key)
		result = strings.ReplaceAll(result, placeholder, variable.Value)
	}
	return result
}

// addToHistory 添加请求到历史记录
func (pm *PostmanManager) addToHistory(userID string, history RequestHistory) {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	// 确保用户历史记录存在
	if pm.userHistory[userID] == nil {
		pm.userHistory[userID] = make([]RequestHistory, 0)
	}

	// 限制历史记录数量（最多保留100条）
	if len(pm.userHistory[userID]) >= 100 {
		pm.userHistory[userID] = pm.userHistory[userID][1:]
	}
	pm.userHistory[userID] = append(pm.userHistory[userID], history)
}

// AddHistoryItem 添加历史记录项（供外部调用）
func (pm *PostmanManager) AddHistoryItem(userID string, history RequestHistory) {
	pm.addToHistory(userID, history)
}

// GetHistory 获取请求历史
func (pm *PostmanManager) GetHistory(userID string) []RequestHistory {
	pm.mutex.RLock()
	defer pm.mutex.RUnlock()

	// 返回副本，避免并发修改
	if pm.userHistory[userID] == nil {
		return make([]RequestHistory, 0)
	}

	history := make([]RequestHistory, len(pm.userHistory[userID]))
	copy(history, pm.userHistory[userID])
	return history
}

// ClearHistory 清空请求历史
func (pm *PostmanManager) ClearHistory(userID string) {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()
	pm.userHistory[userID] = make([]RequestHistory, 0)
}

// GetEnvironments 获取所有环境
func (pm *PostmanManager) GetEnvironments() []Environment {
	pm.mutex.RLock()
	defer pm.mutex.RUnlock()

	environments := make([]Environment, 0, len(pm.environments))
	for _, env := range pm.environments {
		environments = append(environments, *env)
	}
	return environments
}

// GetEnvironment 获取指定环境
func (pm *PostmanManager) GetEnvironment(id string) *Environment {
	pm.mutex.RLock()
	defer pm.mutex.RUnlock()
	return pm.environments[id]
}

// CreateEnvironment 创建新环境
func (pm *PostmanManager) CreateEnvironment(name string) *Environment {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	env := &Environment{
		ID:        generateID(),
		Name:      name,
		Variables: []EnvironmentVariable{},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	pm.environments[env.ID] = env
	return env
}

// UpdateEnvironment 更新环境
func (pm *PostmanManager) UpdateEnvironment(id string, name string, variables []EnvironmentVariable) error {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	env, exists := pm.environments[id]
	if !exists {
		return fmt.Errorf("环境不存在")
	}

	env.Name = name
	env.Variables = variables
	env.UpdatedAt = time.Now()
	return nil
}

// DeleteEnvironment 删除环境
func (pm *PostmanManager) DeleteEnvironment(id string) error {
	pm.mutex.Lock()
	defer pm.mutex.Unlock()

	if id == "default" {
		return fmt.Errorf("不能删除默认环境")
	}

	if _, exists := pm.environments[id]; !exists {
		return fmt.Errorf("环境不存在")
	}

	delete(pm.environments, id)
	return nil
}

// generateID 生成唯一ID
func generateID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

// FormatJSON 格式化 JSON
func FormatJSON(input string) (string, error) {
	var data interface{}
	if err := json.Unmarshal([]byte(input), &data); err != nil {
		return "", err
	}

	formatted, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return "", err
	}

	return string(formatted), nil
}

// IsJSON 检查字符串是否为有效的 JSON
func IsJSON(input string) bool {
	var data interface{}
	return json.Unmarshal([]byte(input), &data) == nil
}

// GetContentType 根据文件扩展名获取 Content-Type
func GetContentType(filename string) string {
	ext := strings.ToLower(filename)
	switch ext {
	case ".json":
		return "application/json"
	case ".xml":
		return "application/xml"
	case ".html":
		return "text/html"
	case ".css":
		return "text/css"
	case ".js":
		return "application/javascript"
	case ".txt":
		return "text/plain"
	case ".csv":
		return "text/csv"
	case ".pdf":
		return "application/pdf"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".svg":
		return "image/svg+xml"
	default:
		return "application/octet-stream"
	}
}

// CurlParser 解析 curl 命令
type CurlParser struct{}

// ParseCurl 解析 curl 命令并返回 HTTPRequest
func (cp *CurlParser) ParseCurl(curlCommand string) (*HTTPRequest, error) {
	// 清理和标准化 curl 命令
	curl := strings.TrimSpace(curlCommand)

	// 检查是否是 curl 命令
	if !strings.HasPrefix(curl, "curl") {
		return nil, fmt.Errorf("不是有效的 curl 命令")
	}

	// 移除开头的 "curl"
	curl = strings.TrimSpace(strings.TrimPrefix(curl, "curl"))

	// 创建请求对象
	req := &HTTPRequest{
		Method:      "GET", // 默认方法
		URL:         "",
		Headers:     make(map[string]string),
		Body:        "",
		ContentType: "",
		Timeout:     30, // 默认30秒
	}

	// 解析参数
	args := cp.parseCurlArgs(curl)

	// 处理参数
	for i := 0; i < len(args); i++ {
		arg := args[i]

		switch {
		case arg == "-X" || arg == "--request":
			if i+1 < len(args) {
				req.Method = strings.ToUpper(args[i+1])
				i++
			}
		case arg == "-H" || arg == "--header":
			if i+1 < len(args) {
				header := args[i+1]
				// 移除引号
				header = strings.Trim(header, `"'`)
				if strings.Contains(header, ":") {
					parts := strings.SplitN(header, ":", 2)
					key := strings.TrimSpace(parts[0])
					value := strings.TrimSpace(parts[1])
					req.Headers[key] = value
					// 检查 Content-Type
					if strings.ToLower(key) == "content-type" {
						req.ContentType = value
					}
				}
				i++
			}
		case arg == "-d" || arg == "--data" || arg == "--data-raw":
			if i+1 < len(args) {
				data := args[i+1]
				// 移除引号
				data = strings.Trim(data, `"'`)
				// 处理转义字符
				data = strings.ReplaceAll(data, `\"`, `"`)
				data = strings.ReplaceAll(data, `\'`, `'`)
				req.Body = data
				if req.Method == "GET" {
					req.Method = "POST" // 有数据时默认改为 POST
				}
				// 如果没有设置 Content-Type，默认设置为 application/json
				if req.ContentType == "" {
					req.ContentType = "application/json"
					req.Headers["Content-Type"] = "application/json"
				}
				i++
			}
		case arg == "--data-binary":
			if i+1 < len(args) {
				data := args[i+1]
				data = strings.Trim(data, `"'`)
				data = strings.ReplaceAll(data, `\"`, `"`)
				data = strings.ReplaceAll(data, `\'`, `'`)
				req.Body = data
				if req.Method == "GET" {
					req.Method = "POST"
				}
				i++
			}
		case arg == "--data-urlencode":
			if i+1 < len(args) {
				data := args[i+1]
				data = strings.Trim(data, `"'`)
				req.Body = data
				if req.Method == "GET" {
					req.Method = "POST"
				}
				req.ContentType = "application/x-www-form-urlencoded"
				req.Headers["Content-Type"] = "application/x-www-form-urlencoded"
				i++
			}
		case arg == "-F" || arg == "--form":
			if i+1 < len(args) {
				data := args[i+1]
				data = strings.Trim(data, `"'`)
				req.Body = data
				if req.Method == "GET" {
					req.Method = "POST"
				}
				req.ContentType = "multipart/form-data"
				req.Headers["Content-Type"] = "multipart/form-data"
				i++
			}
		case arg == "-u" || arg == "--user":
			if i+1 < len(args) {
				// 处理基本认证
				auth := args[i+1]
				auth = strings.Trim(auth, `"'`)
				req.Headers["Authorization"] = "Basic " + auth
				i++
			}
		case arg == "--connect-timeout":
			if i+1 < len(args) {
				if timeout, err := strconv.Atoi(args[i+1]); err == nil {
					req.Timeout = timeout
				}
				i++
			}
		case arg == "-k" || arg == "--insecure":
			continue
		case arg == "-L" || arg == "--location":
			continue
		case arg == "-v" || arg == "--verbose":
			continue
		case arg == "-s" || arg == "--silent":
			continue
		case strings.HasPrefix(arg, "-") || strings.HasPrefix(arg, "--"):
			continue
		default:
			if req.URL == "" && !strings.HasPrefix(arg, "-") {
				// 移除引号
				req.URL = strings.Trim(arg, `"'`)
			}
		}
	}

	// 验证 URL
	if req.URL == "" {
		return nil, fmt.Errorf("未找到有效的 URL")
	}

	// 处理 URL 中的查询参数
	if req.Method == "GET" && req.Body != "" {
		if !strings.Contains(req.URL, "?") {
			req.URL += "?" + req.Body
		} else {
			req.URL += "&" + req.Body
		}
		req.Body = ""
	}

	return req, nil
}

// parseCurlArgs 解析 curl 命令参数，支持引号、转义、嵌套
func (cp *CurlParser) parseCurlArgs(curl string) []string {
	var args []string
	var current []rune
	var inQuotes bool
	var quoteChar rune
	var escapeNext bool

	runes := []rune(curl)
	for i := 0; i < len(runes); i++ {
		ch := runes[i]

		// 处理转义字符
		if escapeNext {
			if ch != '\n' { // 忽略转义的换行符
				current = append(current, ch)
			}
			escapeNext = false
			continue
		}

		// 检查转义字符
		if ch == '\\' {
			if i+1 < len(runes) && runes[i+1] == '\n' {
				// 忽略续行符
				i++
				continue
			}
			escapeNext = true
			continue
		}

		// 处理引号
		if ch == '"' || ch == '\'' {
			if !inQuotes {
				// 开始引号
				inQuotes = true
				quoteChar = ch
			} else if ch == quoteChar {
				// 结束引号
				inQuotes = false
			} else {
				// 在其他类型的引号内，当作普通字符
				current = append(current, ch)
			}
			continue
		}

		// 处理空格
		if (ch == ' ' || ch == '\t' || ch == '\n') && !inQuotes {
			if len(current) > 0 {
				args = append(args, string(current))
				current = []rune{}
			}
			continue
		}

		// 添加普通字符
		current = append(current, ch)
	}

	// 添加最后一个参数
	if len(current) > 0 {
		args = append(args, string(current))
	}

	return args
}

// ValidateCurl 验证 curl 命令是否有效
func (cp *CurlParser) ValidateCurl(curlCommand string) error {
	curl := strings.TrimSpace(curlCommand)

	if !strings.HasPrefix(curl, "curl") {
		return fmt.Errorf("不是有效的 curl 命令")
	}

	// 尝试解析
	_, err := cp.ParseCurl(curlCommand)
	return err
}
