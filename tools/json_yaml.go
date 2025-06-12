package tools

import (
	"encoding/json"
	"fmt"
	"time"

	"gopkg.in/yaml.v3"
)

// JSONYAMLRequest 表示JSON/YAML转换请求
type JSONYAMLRequest struct {
	Input string `json:"input"`
	Type  string `json:"type"` // "json2yaml" 或 "yaml2json"
}

// JSONYAMLResponse 表示JSON/YAML转换响应
type JSONYAMLResponse struct {
	Output string `json:"output"`
}

// ConvertJSONYAML 在JSON和YAML之间转换
func ConvertJSONYAML(input, convType string) (*JSONYAMLResponse, error) {
	start := time.Now()
	LogInfo("JSON/YAML转换器", "开始转换，类型: %s，输入长度: %d", convType, len(input))

	if input == "" {
		LogWarning("JSON/YAML转换器", "输入为空")
		return nil, fmt.Errorf("输入不能为空")
	}

	var output string
	var err error

	switch convType {
	case "json2yaml":
		LogInfo("JSON/YAML转换器", "执行JSON到YAML转换")
		output, err = jsonToYAML(input)
	case "yaml2json":
		LogInfo("JSON/YAML转换器", "执行YAML到JSON转换")
		output, err = yamlToJSON(input)
	default:
		LogWarning("JSON/YAML转换器", "无效的转换类型: %s", convType)
		return nil, fmt.Errorf("无效的转换类型: %s", convType)
	}

	if err != nil {
		LogError("JSON/YAML转换器", err, "转换失败")
		return nil, fmt.Errorf("转换失败: %v", err)
	}

	LogOperation("JSON/YAML转换器", fmt.Sprintf("%s转换", convType), time.Since(start), nil)
	LogInfo("JSON/YAML转换器", "转换成功，输出长度: %d", len(output))

	return &JSONYAMLResponse{
		Output: output,
	}, nil
}

// jsonToYAML 将JSON转换为YAML
func jsonToYAML(input string) (string, error) {
	// 解析JSON
	var data interface{}
	if err := json.Unmarshal([]byte(input), &data); err != nil {
		return "", fmt.Errorf("JSON解析失败: %v", err)
	}

	// 转换为YAML
	yamlBytes, err := yaml.Marshal(data)
	if err != nil {
		return "", fmt.Errorf("YAML编码失败: %v", err)
	}

	return string(yamlBytes), nil
}

// yamlToJSON 将YAML转换为JSON
func yamlToJSON(input string) (string, error) {
	// 解析YAML
	var data interface{}
	if err := yaml.Unmarshal([]byte(input), &data); err != nil {
		return "", fmt.Errorf("YAML解析失败: %v", err)
	}

	// 转换为JSON
	jsonBytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return "", fmt.Errorf("JSON编码失败: %v", err)
	}

	return string(jsonBytes), nil
}
