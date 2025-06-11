#!/bin/bash

LOG_FILE="/opt/ToolWeb/web.log"
MONITOR_LOG="/opt/ToolWeb/monitor.log"

# Function to log system resources
log_system_resources() {
    echo "=== System Resources ===" >> "$MONITOR_LOG"
    echo "Memory Usage:" >> "$MONITOR_LOG"
    free -h >> "$MONITOR_LOG"
    echo "CPU Usage:" >> "$MONITOR_LOG"
    top -bn1 | head -n 5 >> "$MONITOR_LOG"
    echo "Disk Usage:" >> "$MONITOR_LOG"
    df -h >> "$MONITOR_LOG"
}

# Function to check if process was killed
check_process_status() {
    local pid=$1
    if [ -f "/proc/$pid/status" ]; then
        local exit_signal=$(grep -i 'signal' "/proc/$pid/status" 2>/dev/null)
        if [ ! -z "$exit_signal" ]; then
            echo "$(date): Process $pid was terminated by signal: $exit_signal" >> "$MONITOR_LOG"
        fi
    fi
}

# Get previous PID if exists
if [ -f "toolweb.pid" ]; then
    OLD_PID=$(cat toolweb.pid)
    if [ ! -z "$OLD_PID" ]; then
        check_process_status "$OLD_PID"
    fi
fi

# Check if toolWeb is running
if ! pgrep -f "toolWeb" > /dev/null
then
    echo "$(date): toolWeb is not running. Starting it now..." >> "$LOG_FILE"
    # Log system resources before starting
    log_system_resources
    
    # Start the program
    /opt/ToolWeb/toolWeb >> "$LOG_FILE" 2>&1 &
    NEW_PID=$!
    
    # Save PID to file
    echo $NEW_PID > /opt/ToolWeb/toolweb.pid
    
    echo "$(date): toolWeb started with PID: $NEW_PID" >> "$LOG_FILE"
    echo "$(date): Process started. Monitoring system resources..." >> "$MONITOR_LOG"
    
    # Log system resources after starting
    sleep 2
    log_system_resources
else
    CURRENT_PID=$(pgrep -f "toolWeb")
    echo "$(date): toolWeb is running with PID: $CURRENT_PID" >> "$LOG_FILE"
    
    # Update PID file
    echo $CURRENT_PID > /opt/ToolWeb/toolweb.pid
    
    # Log current resource usage
    log_system_resources
fi

# Check for any OOM (Out of Memory) kills in system log
if [ -f "/var/log/syslog" ]; then
    echo "=== Checking for OOM kills ===" >> "$MONITOR_LOG"
    grep -i "out of memory" /var/log/syslog | tail -n 5 >> "$MONITOR_LOG"
fi

# Add dmesg output for additional system messages
echo "=== Recent System Messages ===" >> "$MONITOR_LOG"
dmesg | tail -n 20 >> "$MONITOR_LOG" 