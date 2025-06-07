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

// Book 结构体表示一本电子书
type Book struct {
	ID          string    `json:"id"`          // 使用文件路径的hash作为ID
	Title       string    `json:"title"`       // 书名（文件名）
	Category    string    `json:"category"`    // 分类（目录名）
	FilePath    string    `json:"filePath"`    // 文件路径
	FileSize    int64     `json:"fileSize"`    // 文件大小
	FileType    string    `json:"fileType"`    // 文件类型
	UpdateTime  time.Time `json:"updateTime"`  // 更新时间
	Description string    `json:"description"` // 描述
	Author      string    `json:"author"`      // 作者
	Downloads   int       `json:"downloads"`   // 下载次数
}

// BookManager 管理电子书的结构体
type BookManager struct {
	Books      map[string]*Book   // 所有书籍，key是书籍ID
	Categories map[string][]*Book // 按分类组织的书籍
	mutex      sync.RWMutex       // 读写锁
	RootPath   string             // 电子书根目录
}

var (
	bookManager *BookManager
	once        sync.Once
)

// GetBookManager 获取BookManager单例
func GetBookManager() *BookManager {
	once.Do(func() {
		bookManager = &BookManager{
			Books:      make(map[string]*Book),
			Categories: make(map[string][]*Book),
			// RootPath:   "F:\\学习资料\\电子书\\Kindle_Chinese_books_Public\\Kindle_Chinese_books_Public",
			RootPath: "/opt/ebook",
		}
		// 初始化时加载所有电子书
		bookManager.LoadBooks()
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
	bm.mutex.Lock()
	defer bm.mutex.Unlock()

	// 清空现有数据
	bm.Books = make(map[string]*Book)
	bm.Categories = make(map[string][]*Book)

	// 遍历目录
	err := filepath.Walk(bm.RootPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// 跳过目录
		if info.IsDir() {
			return nil
		}

		// 检查是否是电子书文件
		ext := strings.ToLower(filepath.Ext(path))
		if !isEbookFile(ext) {
			return nil
		}

		// 获取相对路径作为ID
		relPath, err := filepath.Rel(bm.RootPath, path)
		if err != nil {
			return err
		}

		// 获取分类（父目录名）
		category := filepath.Base(filepath.Dir(path))
		if category == filepath.Base(bm.RootPath) {
			category = "未分类"
		}

		// 创建书籍对象
		book := &Book{
			ID:         generateBookID(relPath), // 使用哈希后的ID
			Title:      strings.TrimSuffix(info.Name(), ext),
			Category:   category,
			FilePath:   path,
			FileSize:   info.Size(),
			FileType:   ext,
			UpdateTime: info.ModTime(),
		}

		// 添加到映射
		bm.Books[book.ID] = book
		bm.Categories[category] = append(bm.Categories[category], book)

		return nil
	})

	return err
}

// GetBookByID 根据ID获取书籍
func (bm *BookManager) GetBookByID(id string) *Book {
	bm.mutex.RLock()
	defer bm.mutex.RUnlock()
	return bm.Books[id]
}

// GetBooksByCategory 获取指定分类的书籍
func (bm *BookManager) GetBooksByCategory(category string) []*Book {
	bm.mutex.RLock()
	defer bm.mutex.RUnlock()
	return bm.Categories[category]
}

// GetAllCategories 获取所有分类
func (bm *BookManager) GetAllCategories() []string {
	bm.mutex.RLock()
	defer bm.mutex.RUnlock()

	categories := make([]string, 0, len(bm.Categories))
	for category := range bm.Categories {
		categories = append(categories, category)
	}
	return categories
}

// SearchBooks 搜索书籍
func (bm *BookManager) SearchBooks(keyword string) []*Book {
	bm.mutex.RLock()
	defer bm.mutex.RUnlock()

	keyword = strings.ToLower(keyword)
	results := make([]*Book, 0)

	for _, book := range bm.Books {
		if strings.Contains(strings.ToLower(book.Title), keyword) ||
			strings.Contains(strings.ToLower(book.Category), keyword) {
			results = append(results, book)
		}
	}

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

// GetRecentBooks 获取最近更新的书籍
func (bm *BookManager) GetRecentBooks(limit int) []*Book {
	bm.mutex.RLock()
	defer bm.mutex.RUnlock()

	// 将所有书籍放入切片
	books := make([]*Book, 0, len(bm.Books))
	for _, book := range bm.Books {
		books = append(books, book)
	}

	// 按更新时间排序
	sort.Slice(books, func(i, j int) bool {
		return books[i].UpdateTime.After(books[j].UpdateTime)
	})

	// 返回指定数量的书籍
	if len(books) > limit {
		books = books[:limit]
	}
	return books
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
