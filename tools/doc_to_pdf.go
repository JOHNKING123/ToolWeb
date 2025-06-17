package tools

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

// DocToPDFConverter 处理 DOC 转 PDF 的转换
type DocToPDFConverter struct{}

// NewDocToPDFConverter 创建新的 DOC 转 PDF 转换器
func NewDocToPDFConverter() *DocToPDFConverter {
	return &DocToPDFConverter{}
}

// ConvertDocToPDF 将 DOC 转换为 PDF
func (c *DocToPDFConverter) ConvertDocToPDF(docPath string) (string, error) {
	// 创建临时目录
	tempDir, err := os.MkdirTemp("", "doc-to-pdf-*")
	if err != nil {
		return "", fmt.Errorf("创建临时目录失败: %v", err)
	}

	// 获取原始文件名（不含扩展名）
	originalName := filepath.Base(docPath)
	originalNameWithoutExt := strings.TrimSuffix(originalName, filepath.Ext(originalName))

	// 使用 LibreOffice 进行转换
	cmd := exec.Command("soffice",
		"--headless",
		"--convert-to", "pdf",
		"--outdir", tempDir,
		docPath)

	if err := cmd.Run(); err != nil {
		os.RemoveAll(tempDir)
		return "", fmt.Errorf("转换失败: %v", err)
	}

	// 查找生成的 PDF 文件
	files, err := os.ReadDir(tempDir)
	if err != nil {
		os.RemoveAll(tempDir)
		return "", fmt.Errorf("读取输出目录失败: %v", err)
	}

	// 查找第一个 PDF 文件
	var outputPath string
	for _, file := range files {
		if !file.IsDir() && strings.HasSuffix(strings.ToLower(file.Name()), ".pdf") {
			outputPath = filepath.Join(tempDir, file.Name())
			break
		}
	}

	if outputPath == "" {
		os.RemoveAll(tempDir)
		return "", fmt.Errorf("转换后的文件未找到")
	}

	// 创建新的文件名（使用原始文件名）
	newOutputPath := filepath.Join(tempDir, originalNameWithoutExt+".pdf")

	// 如果新文件名与当前文件名不同，则重命名文件
	if outputPath != newOutputPath {
		if err := os.Rename(outputPath, newOutputPath); err != nil {
			os.RemoveAll(tempDir)
			return "", fmt.Errorf("重命名输出文件失败: %v", err)
		}
		outputPath = newOutputPath
	}

	return outputPath, nil
}

// HandleDocToPDF 处理 DOC 转 PDF 的请求
func (c *DocToPDFConverter) HandleDocToPDF(ctx *gin.Context) {
	// 获取上传的文件
	file, err := ctx.FormFile("file")
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "请选择要转换的 DOC 文件"})
		return
	}

	// 检查文件类型
	if !isDocFile(file.Filename) {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "请上传 DOC 或 DOCX 文件"})
		return
	}

	// 创建临时文件
	tempFile, err := os.CreateTemp("", "doc_*")
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "创建临时文件失败"})
		return
	}
	defer os.Remove(tempFile.Name())
	defer tempFile.Close()

	// 保存上传的文件
	src, err := file.Open()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "打开上传文件失败"})
		return
	}
	defer src.Close()

	_, err = io.Copy(tempFile, src)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "保存上传文件失败"})
		return
	}

	// 转换文件
	outputPath, err := c.ConvertDocToPDF(tempFile.Name())
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("转换失败: %v", err)})
		return
	}

	// 确保在函数返回时删除临时目录
	defer func() {
		if dir := filepath.Dir(outputPath); dir != "" {
			os.RemoveAll(dir)
		}
	}()

	// 获取原始文件名（不含扩展名）
	originalName := filepath.Base(file.Filename)
	originalNameWithoutExt := strings.TrimSuffix(originalName, filepath.Ext(originalName))

	// 对文件名进行 URL 编码
	encodedFilename := url.QueryEscape(originalNameWithoutExt + ".pdf")
	if encodedFilename == "" {
		encodedFilename = "converted.pdf"
	}

	// 设置响应头
	ctx.Header("Content-Description", "File Transfer")
	ctx.Header("Content-Transfer-Encoding", "binary")
	ctx.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s; filename*=UTF-8''%s", encodedFilename, encodedFilename))
	ctx.Header("Content-Type", "application/pdf")

	// 发送文件
	ctx.File(outputPath)
}

// 检查文件是否为 DOC/DOCX
func isDocFile(filename string) bool {
	ext := filepath.Ext(filename)
	return ext == ".doc" || ext == ".docx"
}
