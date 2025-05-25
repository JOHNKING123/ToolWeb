package tools

import (
	"encoding/json"
)

// JSONParserRequest represents the request structure for JSON parsing
type JSONParserRequest struct {
	Input string `json:"input"`
}

// JSONParserResponse represents the response structure for JSON parsing
type JSONParserResponse struct {
	Formatted string `json:"formatted"`
}

// ParseJSON validates and formats JSON input
func ParseJSON(input string) (*JSONParserResponse, error) {
	// Parse JSON to validate it
	var parsed interface{}
	if err := json.Unmarshal([]byte(input), &parsed); err != nil {
		return nil, err
	}

	// Format JSON with indentation
	formatted, err := json.MarshalIndent(parsed, "", "    ")
	if err != nil {
		return nil, err
	}

	return &JSONParserResponse{
		Formatted: string(formatted),
	}, nil
} 