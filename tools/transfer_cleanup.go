package tools

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sync"
	"time"
)

const transferCleanupFile = "data/transfer_cleanup.json"

var transferCleanupOnce sync.Once
var transferCleanupLoadErr error
var transferFolderPattern = regexp.MustCompile(`^会话-[0-9]{8}-[0-9]{6}-[0-9a-f]{8}$`)

// Persist exact owned folders so a restart can clean up abandoned grants.
func startTransferCleanup() {
	transferCleanupOnce.Do(func() {
		transferSessions.Lock()
		data, err := os.ReadFile(transferCleanupFile)
		if err == nil {
			var previous map[string]transferSession
			err = json.Unmarshal(data, &previous)
			if err == nil {
				for token, session := range previous {
					session.Expires = time.Time{}
					transferSessions.Values[token] = session
				}
			}
		}
		if err != nil && !os.IsNotExist(err) {
			transferCleanupLoadErr = err
			log.Printf("读取互传清理记录失败: %v", err)
		}
		if transferCleanupLoadErr == nil {
			cleanupExpiredTransfersLocked()
		}
		transferSessions.Unlock()
		go func() {
			ticker := time.NewTicker(5 * time.Second)
			defer ticker.Stop()
			for range ticker.C {
				transferSessions.Lock()
				if transferCleanupLoadErr == nil {
					cleanupExpiredTransfersLocked()
				}
				transferSessions.Unlock()
			}
		}()
	})
}

// Call only while holding the store write lock.
func cleanupExpiredTransfersLocked() {
	changed := false
	for token, session := range transferSessions.Values {
		if time.Now().Before(session.Expires) {
			continue
		}
		if err := removeTransferFolder(session.Folder); err != nil {
			log.Printf("清理互传会话文件失败: %v", err)
			continue
		}
		delete(transferSessions.Values, token)
		changed = true
	}
	if changed {
		if err := saveTransferCleanupLocked(); err != nil {
			log.Printf("保存互传清理记录失败: %v", err)
		}
	}
}

func removeTransferFolder(folder string) error {
	if filepath.ToSlash(filepath.Dir(folder)) != "手机电脑互传" || !transferFolderPattern.MatchString(filepath.Base(folder)) {
		return fmt.Errorf("invalid session folder")
	}
	root, err := filepath.Abs(personalFilesRoot)
	if err != nil {
		return err
	}
	// Never traverse a symlink in a parent directory during recursive removal.
	for _, parent := range []string{root, filepath.Join(root, "手机电脑互传")} {
		info, err := os.Lstat(parent)
		if os.IsNotExist(err) {
			return nil
		}
		if err != nil {
			return err
		}
		if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("invalid session parent")
		}
	}
	// RemoveAll removes a final symlink itself, not its target.
	return os.RemoveAll(filepath.Join(root, folder))
}

func saveTransferCleanupLocked() error {
	if err := os.MkdirAll(filepath.Dir(transferCleanupFile), 0700); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(transferCleanupFile), ".transfer-cleanup-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	defer file.Close()
	if err := json.NewEncoder(file).Encode(transferSessions.Values); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), transferCleanupFile)
}
