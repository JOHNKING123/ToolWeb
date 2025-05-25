package tools

import (
	"encoding/base64"
)

// Base64Request represents the request structure for Base64 operations
type Base64Request struct {
	Input string `json:"input"`
}

// Base64Response represents the response structure for Base64 operations
type Base64Response struct {
	Output string `json:"output"`
}

// EncodeBase64 encodes a string to Base64
func EncodeBase64(input string) *Base64Response {
	encoded := base64.StdEncoding.EncodeToString([]byte(input))
	return &Base64Response{
		Output: encoded,
	}
}

// DecodeBase64 decodes a Base64 string
func DecodeBase64(input string) (*Base64Response, error) {
	decoded, err := base64.StdEncoding.DecodeString(input)
	if err != nil {
		return nil, err
	}
	return &Base64Response{
		Output: string(decoded),
	}, nil
} 