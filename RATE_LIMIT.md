# IP限流功能说明

本项目已集成智能IP限流功能，防止恶意访问和滥用。

## 功能特点

### 🛡️ 多层级限流策略
- **普通访问**: 每个IP每分钟最多100次请求
- **API接口**: 每个IP每分钟最多30次请求  
- **下载接口**: 每个IP每分钟最多10次请求

### 🎯 智能路径识别
- 自动识别不同类型的请求路径
- 根据路径应用相应的限流策略
- 支持路径前缀匹配

### 📋 白名单支持
- 支持IP地址白名单
- 支持CIDR网段格式
- 本地和内网地址默认加入白名单

### 📊 实时统计监控
- 实时统计各类型活跃IP数量
- 提供详细的限流配置信息
- 支持API方式获取统计数据

## 限流配置

### 默认配置
```go
// 普通访问：每分钟100次请求
GeneralLimit: 100
GeneralWindow: time.Minute

// API访问：每分钟30次请求  
APILimit: 30
APIWindow: time.Minute

// 严格限流路径：每分钟10次请求
StrictPaths: ["/tools/api/", "/ebook/download/"]
StrictLimit: 10
StrictWindow: time.Minute

// 白名单IP（本地和内网地址）
WhitelistIPs: ["127.0.0.1", "::1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]
```

### 生产环境配置
生产环境使用更严格的限制：
- 普通访问：每分钟60次请求
- API访问：每分钟20次请求
- 严格路径：每分钟5次请求
- 无白名单

## HTTP响应头

限流中间件会在响应中添加以下头信息：

```
X-RateLimit-Limit: 100          # 限制次数
X-RateLimit-Remaining: 95       # 剩余次数  
X-RateLimit-Reset: 1640995200   # 重置时间戳
Retry-After: 45                 # 重试等待时间（秒）
```

## 被限流时的响应

当请求被限流时，服务器返回HTTP 429状态码：

```json
{
  "error": "请求过于频繁",
  "message": "您的请求过于频繁，请稍后再试", 
  "retry_after": 45,
  "path": "/tools/api/test"
}
```

## 监控接口

### 获取限流统计信息
```bash
curl http://localhost:8080/tools/rate-limit-stats
```

响应示例：
```json
{
  "success": true,
  "rate_limit": {
    "general_active_ips": 15,
    "api_active_ips": 8,
    "strict_active_ips": 3,
    "config": {
      "general_limit": 100,
      "api_limit": 30,
      "strict_limit": 10,
      "whitelist_ips": ["127.0.0.1", "::1"]
    }
  },
  "visitor_stats": {
    "total_visitors": 1250,
    "today_visitors": 180
  },
  "timestamp": 1640995200
}
```

## 测试限流功能

### 使用curl快速测试
```bash
# 测试普通路径限流
for i in {1..5}; do 
  curl -i http://localhost:8080/ 
  echo "---"
done

# 测试API路径限流  
for i in {1..5}; do
  curl -i http://localhost:8080/tools/api/stats
  echo "---" 
done
```

### 查看限流日志
限流事件会记录在日志中：
```
[RATE_LIMIT] IP 192.168.1.100 被限流 - 路径: /tools/api/test, 限制: 30次/1m0s
```

## 架构设计

### 滑动窗口算法
- 使用时间窗口进行限流计数
- 窗口到期自动重置计数器
- 内存高效的过期数据清理

### 并发安全
- 使用读写锁保护共享数据
- 支持高并发访问
- 无锁算法优化性能

### 内存管理
- 自动清理过期记录
- 防止内存泄漏
- 可配置的清理间隔

## 自定义配置

如需修改限流配置，编辑 `config/rate_limit.go` 文件：

```go
// 创建自定义配置
customConfig := &config.RateLimitConfig{
    GeneralLimit:  50,           // 更严格的普通限制
    GeneralWindow: time.Minute,
    APILimit:      10,           // 更严格的API限制
    APIWindow:     time.Minute,
    // ... 其他配置
}

// 应用自定义配置
smartRateLimiter := middleware.NewSmartRateLimiter(customConfig)
```

## 注意事项

1. **IP获取方式**: 使用 `c.ClientIP()` 获取真实IP，支持代理和负载均衡
2. **时区处理**: 时间窗口基于服务器本地时间
3. **内存使用**: 每个活跃IP会占用少量内存，定期自动清理
4. **日志记录**: 限流事件会记录到日志文件，便于监控和分析

## 故障排除

### 误触发限流
1. 检查IP是否应该加入白名单
2. 确认限流配置是否过于严格
3. 查看日志确认限流原因

### 性能影响
限流中间件设计为高性能，正常情况下对响应时间影响极小（< 1ms）。

### 内存占用
活跃IP数据会占用内存，可通过调整清理间隔优化：
- 清理间隔默认为窗口时间的2倍
- 过期记录超过1小时会被清理 