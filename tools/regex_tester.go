package tools

import (
	"regexp"
)

// RegexRequest represents the request structure for regex testing
type RegexRequest struct {
	Pattern string `json:"pattern"`
	Text    string `json:"text"`
}

// RegexMatch represents a single regex match
type RegexMatch struct {
	FullMatch  string   `json:"fullMatch"`
	Groups     []string `json:"groups"`
	StartIndex int      `json:"startIndex"`
	EndIndex   int      `json:"endIndex"`
}

// RegexResponse represents the response structure for regex testing
type RegexResponse struct {
	Matches []RegexMatch `json:"matches"`
}

// TestRegex tests a regular expression against input text
func TestRegex(pattern, text string) (*RegexResponse, error) {
	// Compile the regular expression
	re, err := regexp.Compile(pattern)
	if err != nil {
		return nil, err
	}

	// Find all matches
	matches := re.FindAllStringSubmatchIndex(text, -1)
	allMatches := make([]RegexMatch, 0)

	for _, match := range matches {
		if len(match) >= 2 {
			fullMatch := text[match[0]:match[1]]
			groups := make([]string, 0)
			
			// Extract groups if they exist
			for i := 2; i < len(match); i += 2 {
				if match[i] != -1 && match[i+1] != -1 {
					groups = append(groups, text[match[i]:match[i+1]])
				}
			}

			allMatches = append(allMatches, RegexMatch{
				FullMatch:  fullMatch,
				Groups:     groups,
				StartIndex: match[0],
				EndIndex:   match[1],
			})
		}
	}

	return &RegexResponse{
		Matches: allMatches,
	}, nil
} 