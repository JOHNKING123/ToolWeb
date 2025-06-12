package tools

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

var (
	toolLogger *log.Logger
	logOnce    sync.Once
)

// initToolLogger 初始化工具日志记录器
func initToolLogger() {
	logOnce.Do(func() {
		// 确保logs目录存在
		logDir := "logs"
		if err := os.MkdirAll(logDir, 0755); err != nil {
			log.Printf("创建日志目录失败: %v", err)
			return
		}

		// 创建工具日志文件
		logFile := filepath.Join(logDir, "tools.log")
		file, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
		if err != nil {
			log.Printf("打开工具日志文件失败: %v", err)
			return
		}

		toolLogger = log.New(file, "[TOOL] ", log.LstdFlags|log.Lshortfile)
	})
}

// LogInfo 记录信息日志
func LogInfo(tool, format string, args ...interface{}) {
	initToolLogger()
	if toolLogger != nil {
		msg := fmt.Sprintf(format, args...)
		toolLogger.Printf("[%s][INFO] %s", tool, msg)
	}
}

// LogError 记录错误日志
func LogError(tool string, err error, additionalInfo ...string) {
	initToolLogger()
	if toolLogger != nil {
		info := ""
		if len(additionalInfo) > 0 {
			info = " | " + additionalInfo[0]
		}
		toolLogger.Printf("[%s][ERROR] %v%s", tool, err, info)
	}
}

// LogOperation 记录操作日志
func LogOperation(tool, operation string, duration time.Duration, err error) {
	initToolLogger()
	if toolLogger != nil {
		status := "成功"
		if err != nil {
			status = fmt.Sprintf("失败: %v", err)
		}
		toolLogger.Printf("[%s][OPERATION] %s | 耗时: %v | 状态: %s",
			tool, operation, duration, status)
	}
}

// LogWarning 记录警告日志
func LogWarning(tool, format string, args ...interface{}) {
	initToolLogger()
	if toolLogger != nil {
		msg := fmt.Sprintf(format, args...)
		toolLogger.Printf("[%s][WARNING] %s", tool, msg)
	}
}

// LogDebug 记录调试日志
func LogDebug(tool, format string, args ...interface{}) {
	initToolLogger()
	if toolLogger != nil {
		msg := fmt.Sprintf(format, args...)
		toolLogger.Printf("[%s][DEBUG] %s", tool, msg)
	}
}
