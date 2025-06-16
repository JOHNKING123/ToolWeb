#!/bin/bash

# 设置应用名称和路径
APP_NAME="toolWeb"
APP_PATH="/opt/ToolWeb"  # 请替换为实际的 ToolWeb 路径
LOG_FILE="$APP_PATH/restart.log"

# 记录日志的函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# 检查进程是否存在
check_process() {
    pgrep -f "$APP_NAME" > /dev/null
    return $?
}

# 停止服务
stop_service() {
    log "正在停止 $APP_NAME 服务..."
    if check_process; then
        pkill -f "$APP_NAME"
        sleep 2
        if check_process; then
            log "服务未能正常停止，尝试强制终止..."
            pkill -9 -f "$APP_NAME"
        fi
    else
        log "服务未在运行"
    fi
}

# 启动服务
start_service() {
    log "正在启动 $APP_NAME 服务..."
    cd "$APP_PATH"
    nohup ./toolWeb > "$APP_PATH/app.log" 2>&1 &
    sleep 2
    if check_process; then
        log "服务启动成功"
    else
        log "服务启动失败，请检查日志文件"
        exit 1
    fi
}

# 主函数
main() {
    log "开始重启 $APP_NAME 服务..."
    
    # 停止服务
    stop_service
    
    # 启动服务
    start_service
    
    log "重启完成"
}

# 执行主函数
main 