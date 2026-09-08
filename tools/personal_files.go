package tools

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	personalFilesRoot     = "data/personal_files"
	personalSharesFile    = "data/personal_file_shares.json"
	personalUploadLimit   = 100 << 20
	personalFileSizeLimit = 50 << 20
)

// PersonalFileItem is the JSON representation used by the file manager.
type PersonalFileItem struct {
	Name        string    `json:"name"`
	Path        string    `json:"path"`
	IsDir       bool      `json:"isDir"`
	Size        int64     `json:"size"`
	ModifiedAt  time.Time `json:"modifiedAt"`
	Previewable bool      `json:"previewable"`
}

type personalShare struct {
	Path      string    `json:"path"`
	CreatedAt time.Time `json:"createdAt"`
}

var personalShareStore = struct {
	sync.RWMutex
	once   sync.Once
	values map[string]personalShare
	err    error
}{values: make(map[string]personalShare)}

// HandlePersonalFilesPage renders the first tool in the personal tools area.
func HandlePersonalFilesPage(c *gin.Context) {
	if err := ensurePersonalFilesRoot(); err != nil {
		c.String(http.StatusInternalServerError, "初始化个人文件目录失败")
		return
	}
	c.HTML(http.StatusOK, "personal_files", gin.H{"Categories": GetCategories()})
}

// HandlePersonalFileList lists one directory and optionally filters its items.
func HandlePersonalFileList(c *gin.Context) {
	rel, full, err := resolvePersonalPath(c.Query("path"), true)
	if err != nil {
		personalFileError(c, http.StatusBadRequest, err)
		return
	}

	info, err := os.Stat(full)
	if err != nil || !info.IsDir() {
		personalFileError(c, http.StatusNotFound, fmt.Errorf("目录不存在"))
		return
	}

	entries, err := os.ReadDir(full)
	if err != nil {
		personalFileError(c, http.StatusInternalServerError, err)
		return
	}

	query := strings.ToLower(strings.TrimSpace(c.Query("q")))
	items := make([]PersonalFileItem, 0, len(entries))
	for _, entry := range entries {
		if entry.Type()&os.ModeSymlink != 0 || (query != "" && !strings.Contains(strings.ToLower(entry.Name()), query)) {
			continue
		}
		entryInfo, infoErr := entry.Info()
		if infoErr != nil {
			continue
		}
		itemPath := path.Join(rel, entry.Name())
		if rel == "" {
			itemPath = entry.Name()
		}
		items = append(items, PersonalFileItem{
			Name:        entry.Name(),
			Path:        itemPath,
			IsDir:       entryInfo.IsDir(),
			Size:        entryInfo.Size(),
			ModifiedAt:  entryInfo.ModTime(),
			Previewable: !entryInfo.IsDir() && isSafePreviewImage(entry.Name()),
		})
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].IsDir != items[j].IsDir {
			return items[i].IsDir
		}
		return strings.ToLower(items[i].Name) < strings.ToLower(items[j].Name)
	})

	c.JSON(http.StatusOK, gin.H{"success": true, "path": rel, "items": items})
}

// HandlePersonalFileUpload stores multiple uploaded files in the selected folder.
func HandlePersonalFileUpload(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, personalUploadLimit)
	if err := c.Request.ParseMultipartForm(16 << 20); err != nil {
		personalFileError(c, http.StatusRequestEntityTooLarge, fmt.Errorf("上传内容超过 100 MB 限制"))
		return
	}
	if c.Request.MultipartForm != nil {
		defer c.Request.MultipartForm.RemoveAll()
	}

	_, folder, err := resolvePersonalPath(c.PostForm("path"), true)
	if err != nil {
		personalFileError(c, http.StatusBadRequest, err)
		return
	}
	if info, statErr := os.Stat(folder); statErr != nil || !info.IsDir() {
		personalFileError(c, http.StatusNotFound, fmt.Errorf("目标目录不存在"))
		return
	}

	files := c.Request.MultipartForm.File["files"]
	if len(files) == 0 {
		personalFileError(c, http.StatusBadRequest, fmt.Errorf("请选择要上传的文件"))
		return
	}

	uploaded := make([]string, 0, len(files))
	for _, header := range files {
		if header.Size > personalFileSizeLimit {
			personalFileError(c, http.StatusRequestEntityTooLarge, fmt.Errorf("文件 %s 超过 50 MB 限制", header.Filename))
			return
		}
		name, nameErr := validatePersonalFileName(header.Filename)
		if nameErr != nil {
			personalFileError(c, http.StatusBadRequest, nameErr)
			return
		}
		destination, finalName, destErr := uniquePersonalDestination(folder, name)
		if destErr != nil {
			personalFileError(c, http.StatusInternalServerError, destErr)
			return
		}
		if saveErr := savePersonalUpload(header, destination); saveErr != nil {
			personalFileError(c, http.StatusInternalServerError, saveErr)
			return
		}
		uploaded = append(uploaded, finalName)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "uploaded": uploaded})
}

// HandlePersonalFolderCreate creates a folder below the selected directory.
func HandlePersonalFolderCreate(c *gin.Context) {
	var request struct {
		Path string `json:"path"`
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		personalFileError(c, http.StatusBadRequest, fmt.Errorf("无效的请求数据"))
		return
	}
	_, folder, err := resolvePersonalPath(request.Path, true)
	if err != nil {
		personalFileError(c, http.StatusBadRequest, err)
		return
	}
	name, err := validatePersonalFileName(request.Name)
	if err != nil {
		personalFileError(c, http.StatusBadRequest, err)
		return
	}
	if err := os.Mkdir(filepath.Join(folder, name), 0755); err != nil {
		if os.IsExist(err) {
			personalFileError(c, http.StatusConflict, fmt.Errorf("同名文件或文件夹已存在"))
			return
		}
		personalFileError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// HandlePersonalFileRename renames a file or directory without moving it.
func HandlePersonalFileRename(c *gin.Context) {
	var request struct {
		Path string `json:"path"`
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		personalFileError(c, http.StatusBadRequest, fmt.Errorf("无效的请求数据"))
		return
	}
	rel, source, err := resolvePersonalPath(request.Path, true)
	if err != nil || rel == "" {
		personalFileError(c, http.StatusBadRequest, fmt.Errorf("无效的文件路径"))
		return
	}
	name, err := validatePersonalFileName(request.Name)
	if err != nil {
		personalFileError(c, http.StatusBadRequest, err)
		return
	}
	destination := filepath.Join(filepath.Dir(source), name)
	if _, err := os.Stat(destination); err == nil {
		personalFileError(c, http.StatusConflict, fmt.Errorf("同名文件或文件夹已存在"))
		return
	}
	if err := os.Rename(source, destination); err != nil {
		personalFileError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// HandlePersonalFileDelete deletes a selected file or directory tree.
func HandlePersonalFileDelete(c *gin.Context) {
	var request struct {
		Path string `json:"path"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		personalFileError(c, http.StatusBadRequest, fmt.Errorf("无效的请求数据"))
		return
	}
	rel, full, err := resolvePersonalPath(request.Path, true)
	if err != nil || rel == "" {
		personalFileError(c, http.StatusBadRequest, fmt.Errorf("不能删除根目录"))
		return
	}
	if err := os.RemoveAll(full); err != nil {
		personalFileError(c, http.StatusInternalServerError, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// HandlePersonalFileShare creates a public random-token link for one file.
func HandlePersonalFileShare(c *gin.Context) {
	var request struct {
		Path string `json:"path"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		personalFileError(c, http.StatusBadRequest, fmt.Errorf("无效的请求数据"))
		return
	}
	rel, full, err := resolvePersonalPath(request.Path, true)
	if err != nil {
		personalFileError(c, http.StatusBadRequest, err)
		return
	}
	info, err := os.Stat(full)
	if err != nil || info.IsDir() {
		personalFileError(c, http.StatusBadRequest, fmt.Errorf("只能分享文件"))
		return
	}
	if err := loadPersonalShares(); err != nil {
		personalFileError(c, http.StatusInternalServerError, err)
		return
	}
	tokenBytes := make([]byte, 18)
	if _, err := rand.Read(tokenBytes); err != nil {
		personalFileError(c, http.StatusInternalServerError, err)
		return
	}
	token := hex.EncodeToString(tokenBytes)
	personalShareStore.Lock()
	personalShareStore.values[token] = personalShare{Path: rel, CreatedAt: time.Now()}
	err = savePersonalSharesLocked()
	personalShareStore.Unlock()
	if err != nil {
		personalFileError(c, http.StatusInternalServerError, err)
		return
	}

	scheme := "http"
	if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	shareURL := fmt.Sprintf("%s://%s/share/personal-files/%s", scheme, c.Request.Host, token)
	c.JSON(http.StatusOK, gin.H{"success": true, "url": shareURL})
}

// HandlePersonalFileContent previews or downloads an authenticated file.
func HandlePersonalFileContent(c *gin.Context) {
	_, full, err := resolvePersonalPath(c.Query("path"), true)
	if err != nil {
		personalFileError(c, http.StatusBadRequest, err)
		return
	}
	servePersonalFile(c, full, c.Query("download") == "1")
}

// HandlePersonalFileSharedContent serves a file selected by an unguessable share token.
func HandlePersonalFileSharedContent(c *gin.Context) {
	if err := loadPersonalShares(); err != nil {
		c.String(http.StatusInternalServerError, "分享数据加载失败")
		return
	}
	personalShareStore.RLock()
	share, exists := personalShareStore.values[c.Param("token")]
	personalShareStore.RUnlock()
	if !exists {
		c.String(http.StatusNotFound, "分享链接不存在或已失效")
		return
	}
	_, full, err := resolvePersonalPath(share.Path, true)
	if err != nil {
		c.String(http.StatusNotFound, "分享文件不存在")
		return
	}
	servePersonalFile(c, full, c.Query("download") == "1")
}

func ensurePersonalFilesRoot() error {
	return os.MkdirAll(personalFilesRoot, 0755)
}

func resolvePersonalPath(input string, mustExist bool) (string, string, error) {
	if err := ensurePersonalFilesRoot(); err != nil {
		return "", "", err
	}
	input = strings.TrimSpace(strings.ReplaceAll(input, "\\", "/"))
	if strings.ContainsRune(input, 0) {
		return "", "", fmt.Errorf("无效的文件路径")
	}
	clean := strings.TrimPrefix(path.Clean("/"+input), "/")
	if clean == "." {
		clean = ""
	}
	rootAbs, err := filepath.Abs(personalFilesRoot)
	if err != nil {
		return "", "", err
	}
	full := filepath.Join(rootAbs, filepath.FromSlash(clean))
	if err := ensurePersonalPathInsideRoot(rootAbs, full); err != nil {
		return "", "", err
	}
	if mustExist {
		resolved, err := filepath.EvalSymlinks(full)
		if err != nil {
			return "", "", err
		}
		if err := ensurePersonalPathInsideRoot(rootAbs, resolved); err != nil {
			return "", "", err
		}
		full = resolved
	}
	return clean, full, nil
}

func ensurePersonalPathInsideRoot(root, target string) error {
	rel, err := filepath.Rel(root, target)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return fmt.Errorf("文件路径超出个人目录")
	}
	return nil
}

func validatePersonalFileName(input string) (string, error) {
	name := strings.TrimSpace(input)
	if name == "" || name == "." || name == ".." || filepath.Base(name) != name || strings.ContainsAny(name, "/\\\x00") {
		return "", fmt.Errorf("文件名无效")
	}
	return name, nil
}

func uniquePersonalDestination(folder, name string) (string, string, error) {
	ext := filepath.Ext(name)
	base := strings.TrimSuffix(name, ext)
	for index := 0; index < 10000; index++ {
		candidate := name
		if index > 0 {
			candidate = fmt.Sprintf("%s (%d)%s", base, index, ext)
		}
		destination := filepath.Join(folder, candidate)
		_, err := os.Stat(destination)
		if os.IsNotExist(err) {
			return destination, candidate, nil
		}
		if err != nil {
			return "", "", err
		}
	}
	return "", "", fmt.Errorf("无法生成可用文件名")
}

func savePersonalUpload(header *multipart.FileHeader, destination string) error {
	source, err := header.Open()
	if err != nil {
		return err
	}
	defer source.Close()

	target, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	saved := false
	defer func() {
		target.Close()
		if !saved {
			os.Remove(destination)
		}
	}()

	written, err := io.Copy(target, io.LimitReader(source, personalFileSizeLimit+1))
	if err != nil {
		return err
	}
	if written > personalFileSizeLimit {
		return fmt.Errorf("文件 %s 超过 50 MB 限制", header.Filename)
	}
	if err := target.Close(); err != nil {
		return err
	}
	saved = true
	return nil
}

func isSafePreviewImage(name string) bool {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp":
		return true
	default:
		return false
	}
}

func servePersonalFile(c *gin.Context, full string, forceDownload bool) {
	file, err := os.Open(full)
	if err != nil {
		c.String(http.StatusNotFound, "文件不存在")
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || info.IsDir() {
		c.String(http.StatusBadRequest, "请选择一个文件")
		return
	}

	contentType := mime.TypeByExtension(strings.ToLower(filepath.Ext(info.Name())))
	if contentType == "" {
		buffer := make([]byte, 512)
		read, _ := file.Read(buffer)
		contentType = http.DetectContentType(buffer[:read])
		_, _ = file.Seek(0, io.SeekStart)
	}
	disposition := "attachment"
	if !forceDownload && isSafePreviewImage(info.Name()) {
		disposition = "inline"
	}
	c.Header("Content-Type", contentType)
	c.Header("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": info.Name()}))
	c.Header("X-Content-Type-Options", "nosniff")
	http.ServeContent(c.Writer, c.Request, info.Name(), info.ModTime(), file)
}

func loadPersonalShares() error {
	personalShareStore.once.Do(func() {
		data, err := os.ReadFile(personalSharesFile)
		if os.IsNotExist(err) {
			return
		}
		if err != nil {
			personalShareStore.err = err
			return
		}
		personalShareStore.Lock()
		defer personalShareStore.Unlock()
		personalShareStore.err = json.Unmarshal(data, &personalShareStore.values)
	})
	return personalShareStore.err
}

func savePersonalSharesLocked() error {
	if err := os.MkdirAll(filepath.Dir(personalSharesFile), 0755); err != nil {
		return err
	}
	temp, err := os.CreateTemp(filepath.Dir(personalSharesFile), ".personal-shares-*.tmp")
	if err != nil {
		return err
	}
	tempName := temp.Name()
	defer os.Remove(tempName)
	if err := temp.Chmod(0600); err != nil {
		temp.Close()
		return err
	}
	encoder := json.NewEncoder(temp)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(personalShareStore.values); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	return os.Rename(tempName, personalSharesFile)
}

func personalFileError(c *gin.Context, status int, err error) {
	c.JSON(status, gin.H{"success": false, "error": err.Error()})
}
