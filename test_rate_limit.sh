#!/bin/bash

echo "=== 测试API限流功能 ==="
echo "现在的配置: API路径每分钟最多3次请求"
echo

# 测试JSON格式化API
API_URL="http://localhost:8080/tools/api/json/format"

echo "连续发送5个请求到: $API_URL"
echo

for i in {1..5}; do
    echo "--- 请求 $i ---"
    response=$(curl -s -w "HTTP_STATUS:%{http_code}\nHEADERS:\nX-RateLimit-Limit: %{header_json}\n" \
        -H "Content-Type: application/json" \
        -d '{"json": "{\"test\": \"value\"}", "sortKeys": false, "indent": "  "}' \
        "$API_URL")
    
    echo "$response"
    echo
    
    # 短暂延迟
    sleep 0.5
done

echo "=== 测试完成 ==="
echo "如果限流生效，第4和第5个请求应该返回HTTP 429状态码" 