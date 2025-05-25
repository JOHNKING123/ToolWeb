package tools

import (
	"github.com/sergi/go-diff/diffmatchpatch"
)

// TextDiffRequest 表示文本比较请求
type TextDiffRequest struct {
	Text1 string `json:"text1"`
	Text2 string `json:"text2"`
}

// DiffPart 表示差异部分
type DiffPart struct {
	Text string `json:"text"`
	Type string `json:"type"` // "equal", "insert", "delete"
}

// TextDiffResponse 表示文本比较响应
type TextDiffResponse struct {
	Diffs []DiffPart `json:"diffs"`
}

// CompareTexts 比较两段文本的差异
func CompareTexts(text1, text2 string) *TextDiffResponse {
	dmp := diffmatchpatch.New()
	diffs := dmp.DiffMain(text1, text2, false)
	
	var parts []DiffPart
	for _, diff := range diffs {
		var diffType string
		switch diff.Type {
		case diffmatchpatch.DiffEqual:
			diffType = "equal"
		case diffmatchpatch.DiffInsert:
			diffType = "insert"
		case diffmatchpatch.DiffDelete:
			diffType = "delete"
		}

		parts = append(parts, DiffPart{
			Text: diff.Text,
			Type: diffType,
		})
	}

	return &TextDiffResponse{
		Diffs: parts,
	}
} 