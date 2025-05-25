package tools

import (
	"encoding/json"
	"fmt"
	"gopkg.in/yaml.v3"
)

// JSONYAMLRequest 表示 JSON/YAML 转换请求
type JSONYAMLRequest struct {
	Input string `json:"input"`
	Type  string `json:"type"` // "json2yaml" 或 "yaml2json"
}

// JSONYAMLResponse 表示 JSON/YAML 转换响应
type JSONYAMLResponse struct {
	Output string `json:"output"`
}

// ConvertJSONYAML 在 JSON 和 YAML 格式之间转换
func ConvertJSONYAML(input, convertType string) (*JSONYAMLResponse, error) {
	var output string

	switch convertType {
	case "json2yaml":
		// 解析 JSON
		var jsonData interface{}
		if err := json.Unmarshal([]byte(input), &jsonData); err != nil {
			return nil, fmt.Errorf("无效的 JSON: %v", err)
		}

		// 转换为 YAML
		yamlData, err := yaml.Marshal(jsonData)
		if err != nil {
			return nil, fmt.Errorf("转换为 YAML 失败: %v", err)
		}
		output = string(yamlData)

	case "yaml2json":
		// 解析 YAML
		var yamlData interface{}
		if err := yaml.Unmarshal([]byte(input), &yamlData); err != nil {
			return nil, fmt.Errorf("无效的 YAML: %v", err)
		}

		// 转换为 JSON
		jsonData, err := json.MarshalIndent(yamlData, "", "    ")
		if err != nil {
			return nil, fmt.Errorf("转换为 JSON 失败: %v", err)
		}
		output = string(jsonData)

	default:
		return nil, fmt.Errorf("无效的转换类型: %s", convertType)
	}

	return &JSONYAMLResponse{
		Output: output,
	}, nil
} 