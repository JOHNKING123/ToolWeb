# 工具访问统计功能

## 功能概述

本系统已集成工具访问统计功能，可以自动记录用户对各个工具的访问情况，并提供统计分析页面。

## 主要特性

### 🔄 自动记录
- **智能中间件**：自动拦截所有工具页面访问
- **IP标准化**：统一处理IPv4/IPv6地址格式
- **实时统计**：访问即记录，无需手动操作

### 📊 统计数据
- **访问用户数**：统计不同IP地址的访问量
- **工具使用数**：记录被使用过的工具种类
- **总访问次数**：累计所有工具的访问次数
- **热门工具排行**：按访问量排序的工具列表

### 💾 数据持久化
- **自动保存**：每100次访问或1小时自动保存
- **JSON格式**：数据存储在 `data/stats/tool_stats.json`
- **增量更新**：只保存变化的数据，提高性能

## 访问路径

### 统计页面
- **管理页面**：`/admin/tool-stats`
- **API接口**：`/tools/api/stats`

### 首页快捷入口
- 导航栏右侧的 📊 图标可直接访问统计页面

## 记录范围

### 包含的路径
- `/tools/json-parser` - JSON解析器
- `/tools/base64` - Base64编码
- `/tools/regex-tester` - 正则表达式测试
- `/tools/url-codec` - URL编码解码
- `/tools/xml-parser` - XML格式化
- `/tools/qrcode` - 二维码工具
- 所有其他 `/tools/:tool` 格式的工具页面

### 排除的路径
- `/tools/index` - 工具首页
- `/tools/api/*` - API接口
- `/tools/static/*` - 静态资源

## 技术实现

### 中间件机制
```go
func toolAccessMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        // 只对工具页面进行统计
        if strings.HasPrefix(c.Request.URL.Path, "/tools/") && 
           !strings.HasPrefix(c.Request.URL.Path, "/tools/api/") &&
           !strings.HasPrefix(c.Request.URL.Path, "/tools/static/") &&
           c.Request.URL.Path != "/tools/index" {
            
            // 提取工具名称并记录访问
            toolName := extractToolName(c.Request.URL.Path)
            if toolName != "" {
                ip := c.ClientIP()
                tools.GetToolStats().RecordToolAccess(ip, toolName)
            }
        }
        c.Next()
    }
}
```

### 数据结构
```go
type ToolStats struct {
    Stats        map[string]map[string]int // IP -> 工具名称 -> 访问次数
    ToolCounts   map[string]int            // 工具名称 -> 总访问次数
    LastSaveTime time.Time                 // 最后保存时间
}
```

## 使用示例

### 查看统计数据
1. 访问 `http://localhost:8080/admin/tool-stats`
2. 查看实时统计信息
3. 点击"刷新数据"按钮获取最新数据

### API调用
```bash
curl http://localhost:8080/tools/api/stats
```

返回格式：
```json
{
  "success": true,
  "stats": {
    "total_ips": 15,
    "total_tools": 6,
    "total_accesses": 234,
    "last_update": "2024-01-15T10:30:00Z"
  },
  "popularTools": [
    {
      "id": "json-parser",
      "name": "JSON 解析器",
      "description": "格式化和验证 JSON 数据",
      "icon": "data_object"
    }
  ]
}
```

## 数据文件位置

- **统计数据**：`data/stats/tool_stats.json`
- **日志文件**：`logs/access.log`、`logs/error.log`

## 性能优化

### 内存管理
- 使用读写锁保证并发安全
- 定期保存避免数据丢失
- IP地址标准化减少重复记录

### 存储优化
- JSON格式便于查看和备份
- 增量保存减少IO操作
- 自动清理过期数据（可配置）

## 扩展功能

### 可添加的功能
- 按时间段统计（日/周/月）
- 地理位置分析（基于IP）
- 用户行为路径分析
- 工具使用时长统计
- 导出统计报表

### 配置选项
- 统计数据保存频率
- 历史数据保留时间
- IP地址脱敏处理
- 统计页面访问权限

## 注意事项

1. **隐私保护**：IP地址仅用于统计，不记录个人信息
2. **性能影响**：中间件开销极小，不影响页面响应速度
3. **数据安全**：统计数据存储在本地，不上传到外部服务
4. **访问权限**：统计页面建议添加访问控制

## 故障排除

### 常见问题
1. **统计数据不更新**：检查 `data/stats` 目录权限
2. **页面访问404**：确认模板文件 `templates/tool_stats.html` 存在
3. **API返回错误**：查看 `logs/error.log` 获取详细信息

### 调试方法
```bash
# 查看统计数据文件
cat data/stats/tool_stats.json | jq .

# 查看访问日志
tail -f logs/access.log

# 测试API接口
curl -v http://localhost:8080/tools/api/stats
``` 