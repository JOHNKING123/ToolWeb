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

// JSONCompressResponse represents the response structure for JSON compression
type JSONCompressResponse struct {
	Compressed string `json:"compressed"`
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

// CompressJSON validates and compresses JSON input by removing all whitespace
func CompressJSON(input string) (*JSONCompressResponse, error) {
	// Parse JSON to validate it
	var parsed interface{}
	if err := json.Unmarshal([]byte(input), &parsed); err != nil {
		return nil, err
	}

	// Marshal JSON without indentation
	compressed, err := json.Marshal(parsed)
	if err != nil {
		return nil, err
	}

	return &JSONCompressResponse{
		Compressed: string(compressed),
	}, nil
}
