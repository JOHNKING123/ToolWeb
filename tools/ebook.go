package tools

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Book 表示一本电子书
type Book struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Author      string    `json:"author"`
	Category    string    `json:"category"`
	Description string    `json:"description"`
	FilePath    string    `json:"filePath"`
	FileType    string    `json:"fileType"`
	FileSize    int64     `json:"fileSize"`
	AddTime     time.Time `json:"addTime"`
	Downloads   int       `json:"downloads"`
}

// BookManager 电子书管理器
type BookManager struct {
	sync.RWMutex
	books         map[string]*Book
	categories    map[string]bool
	lastLoadTime  time.Time
	booksBasePath string
}

var (
	bookManager *BookManager
	once        sync.Once
)

// GetBookManager 获取电子书管理器单例
func GetBookManager() *BookManager {
	once.Do(func() {
		bookManager = &BookManager{
			books:         make(map[string]*Book),
			categories:    make(map[string]bool),
			booksBasePath: "/opt/ebook", // 默认路径
		}
		if err := bookManager.LoadBooks(); err != nil {
			LogError("电子书管理器", err, "初始化加载书籍失败")
		}
	})
	return bookManager
}

// generateBookID 根据相对路径生成书籍ID
func generateBookID(relPath string) string {
	hash := sha256.Sum256([]byte(relPath))
	return hex.EncodeToString(hash[:8]) // 使用前8个字节作为ID
}

// LoadBooks 加载所有电子书
func (bm *BookManager) LoadBooks() error {
	start := time.Now()
	LogInfo("电子书管理器", "开始加载电子书")

	// 确保目录存在
	if err := os.MkdirAll(bm.booksBasePath, 0755); err != nil {
		LogError("电子书管理器", err, "创建电子书目录失败")
		return fmt.Errorf("创建电子书目录失败: %v", err)
	}

	bm.Lock()
	defer bm.Unlock()

	// 清空现有数据
	bm.books = make(map[string]*Book)
	bm.categories = make(map[string]bool)

	// 遍历目录
	err := filepath.Walk(bm.booksBasePath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			LogError("电子书管理器", err, fmt.Sprintf("访问路径失败: %s", path))
			return err
		}

		if info.IsDir() {
			return nil
		}

		// 只处理支持的文件类型
		ext := strings.ToLower(filepath.Ext(path))
		if ext != ".pdf" && ext != ".epub" && ext != ".mobi" {
			return nil
		}

		relPath, err := filepath.Rel(bm.booksBasePath, path)
		if err != nil {
			LogError("电子书管理器", err, fmt.Sprintf("获取相对路径失败: %s", path))
			return err
		}

		// 解析目录结构
		parts := strings.Split(relPath, string(os.PathSeparator))
		if len(parts) < 2 {
			LogWarning("电子书管理器", "跳过不符合目录结构的文件: %s", relPath)
			return nil
		}

		category := parts[0]
		title := strings.TrimSuffix(parts[len(parts)-1], ext)

		book := &Book{
			ID:        fmt.Sprintf("%x", time.Now().UnixNano()),
			Title:     title,
			Category:  category,
			FilePath:  path,
			FileType:  ext,
			FileSize:  info.Size(),
			AddTime:   info.ModTime(),
			Downloads: 0,
		}

		bm.books[book.ID] = book
		bm.categories[category] = true

		LogDebug("电子书管理器", "添加书籍: [%s] %s", category, title)
		return nil
	})

	if err != nil {
		LogError("电子书管理器", err, "遍历电子书目录失败")
		return fmt.Errorf("遍历电子书目录失败: %v", err)
	}

	bm.lastLoadTime = time.Now()
	duration := time.Since(start)
	LogOperation("电子书管理器", "加载电子书完成", duration, nil)
	LogInfo("电子书管理器", "共加载 %d 本书籍, %d 个分类", len(bm.books), len(bm.categories))

	return nil
}

// GetAllCategories 获取所有分类
func (bm *BookManager) GetAllCategories() []string {
	bm.RLock()
	defer bm.RUnlock()

	categories := make([]string, 0, len(bm.categories))
	for category := range bm.categories {
		categories = append(categories, category)
	}
	return categories
}

// GetBooksByCategory 获取指定分类的书籍
func (bm *BookManager) GetBooksByCategory(category string) []*Book {
	start := time.Now()
	LogInfo("电子书管理器", "获取分类 [%s] 的书籍", category)

	bm.RLock()
	defer bm.RUnlock()

	var books []*Book
	for _, book := range bm.books {
		if book.Category == category {
			books = append(books, book)
		}
	}

	LogOperation("电子书管理器", fmt.Sprintf("获取分类 [%s] 的书籍", category), time.Since(start), nil)
	LogInfo("电子书管理器", "分类 [%s] 共有 %d 本书籍", category, len(books))

	return books
}

// GetRecentBooks 获取最近添加的书籍
func (bm *BookManager) GetRecentBooks(limit int) []*Book {
	start := time.Now()
	LogInfo("电子书管理器", "获取最近添加的书籍，限制数量: %d", limit)

	bm.RLock()
	defer bm.RUnlock()

	books := make([]*Book, 0, len(bm.books))
	for _, book := range bm.books {
		books = append(books, book)
	}

	// 按添加时间排序
	sort.Slice(books, func(i, j int) bool {
		return books[i].AddTime.After(books[j].AddTime)
	})

	if len(books) > limit {
		books = books[:limit]
	}

	LogOperation("电子书管理器", "获取最近添加的书籍", time.Since(start), nil)
	return books
}

// GetBookByID 根据ID获取书籍
func (bm *BookManager) GetBookByID(id string) *Book {
	start := time.Now()
	LogInfo("电子书管理器", "查找书籍，ID: %s", id)

	bm.RLock()
	defer bm.RUnlock()

	book := bm.books[id]

	if book == nil {
		LogWarning("电子书管理器", "未找到书籍，ID: %s", id)
	} else {
		LogInfo("电子书管理器", "找到书籍: [%s] %s", book.Category, book.Title)
	}

	LogOperation("电子书管理器", fmt.Sprintf("查找书籍 ID: %s", id), time.Since(start), nil)
	return book
}

// SearchBooks 搜索书籍
func (bm *BookManager) SearchBooks(keyword string) []*Book {
	start := time.Now()
	LogInfo("电子书管理器", "搜索书籍，关键词: %s", keyword)

	bm.RLock()
	defer bm.RUnlock()

	keyword = strings.ToLower(keyword)
	var results []*Book

	for _, book := range bm.books {
		if strings.Contains(strings.ToLower(book.Title), keyword) ||
			strings.Contains(strings.ToLower(book.Category), keyword) {
			results = append(results, book)
		}
	}

	LogOperation("电子书管理器", fmt.Sprintf("搜索书籍，关键词: %s", keyword), time.Since(start), nil)
	LogInfo("电子书管理器", "搜索结果: %d 本书籍", len(results))

	return results
}

// isEbookFile 检查文件扩展名是否是电子书
func isEbookFile(ext string) bool {
	ebookExts := map[string]bool{
		".pdf":  true,
		".epub": true,
		".mobi": true,
		".txt":  true,
		".doc":  true,
		".docx": true,
	}
	return ebookExts[ext]
}

// FormatFileSize 格式化文件大小
func FormatFileSize(size int64) string {
	const unit = 1024
	if size < unit {
		return fmt.Sprintf("%d B", size)
	}
	div, exp := int64(unit), 0
	for n := size / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(size)/float64(div), "KMGTPE"[exp])
}

// GetSize 返回格式化的文件大小
func (b *Book) GetSize() string {
	return FormatFileSize(b.FileSize)
}

// GetFormat 返回文件格式
func (b *Book) GetFormat() string {
	return strings.TrimPrefix(b.FileType, ".")
}

// GetCoverURL 返回封面图片URL
func (b *Book) GetCoverURL() string {
	// TODO: 实现真实的封面图片
	return "https://picsum.photos/200/280"
}

// GetAuthor 返回作者，如果没有则返回"未知作者"
func (b *Book) GetAuthor() string {
	if b.Author == "" {
		return "未知作者"
	}
	return b.Author
}

// GetDownloads 返回下载次数
func (b *Book) GetDownloads() string {
	if b.Downloads > 1000 {
		return fmt.Sprintf("%.1fk", float64(b.Downloads)/1000)
	}
	return fmt.Sprintf("%d", b.Downloads)
}
