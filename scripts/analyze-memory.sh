#!/bin/bash

# Memory Analysis Script for Constellation Server
# This script analyzes the debug logs to show memory trends and potential leaks

DEBUG_LOG="/Users/ilyabelikin/Developer/constellation-v2/.cursor/debug.log"

echo "=========================================="
echo "  Constellation Memory Analysis"
echo "=========================================="
echo ""

# Check if debug log exists
if [ ! -f "$DEBUG_LOG" ]; then
    echo "❌ Debug log not found at: $DEBUG_LOG"
    echo "   Make sure the server is running and has been active for some time."
    exit 1
fi

# Count total memory snapshots
SNAPSHOT_COUNT=$(grep -c "Memory snapshot" "$DEBUG_LOG" 2>/dev/null || echo "0")
echo "📊 Total Memory Snapshots: $SNAPSHOT_COUNT"

if [ "$SNAPSHOT_COUNT" -eq 0 ]; then
    echo "   No memory snapshots found. The server may not have started yet."
    echo "   Please wait for the server to take some snapshots (every 10 seconds)."
    exit 0
fi

echo ""
echo "📈 Latest Memory Metrics:"
echo "----------------------------------------"

# Get the last 5 snapshots
grep "Memory snapshot" "$DEBUG_LOG" | tail -5 | while read -r line; do
    # Extract timestamp and data
    TIMESTAMP=$(echo "$line" | grep -o '"timestamp":[0-9]*' | cut -d':' -f2)
    HEAP_USED=$(echo "$line" | grep -o '"heapUsedMB":"[^"]*"' | cut -d'"' -f4)
    HEAP_TOTAL=$(echo "$line" | grep -o '"heapTotalMB":"[^"]*"' | cut -d'"' -f4)
    RSS=$(echo "$line" | grep -o '"rssMB":"[^"]*"' | cut -d'"' -f4)
    CLIENTS=$(echo "$line" | grep -o '"clientsCount":[0-9]*' | cut -d':' -f2)
    SYSTEMS=$(echo "$line" | grep -o '"systemsCount":[0-9]*' | cut -d':' -f2)
    UPTIME=$(echo "$line" | grep -o '"uptimeSeconds":[0-9]*' | cut -d':' -f2)
    
    if [ -n "$TIMESTAMP" ]; then
        DATE=$(date -r $((TIMESTAMP / 1000)) "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "N/A")
        echo "  [$DATE]"
        echo "    Heap: ${HEAP_USED:-N/A} / ${HEAP_TOTAL:-N/A} MB"
        echo "    RSS: ${RSS:-N/A} MB"
        echo "    Clients: ${CLIENTS:-N/A} | Systems: ${SYSTEMS:-N/A} | Uptime: ${UPTIME:-N/A}s"
        echo ""
    fi
done

echo "📊 Memory Growth Analysis:"
echo "----------------------------------------"

# Get first and last snapshot
FIRST_SNAPSHOT=$(grep "Memory snapshot" "$DEBUG_LOG" | head -1)
LAST_SNAPSHOT=$(grep "Memory snapshot" "$DEBUG_LOG" | tail -1)

FIRST_HEAP=$(echo "$FIRST_SNAPSHOT" | grep -o '"heapUsedMB":"[^"]*"' | cut -d'"' -f4)
LAST_HEAP=$(echo "$LAST_SNAPSHOT" | grep -o '"heapUsedMB":"[^"]*"' | cut -d'"' -f4)
FIRST_TIME=$(echo "$FIRST_SNAPSHOT" | grep -o '"timestamp":[0-9]*' | cut -d':' -f2)
LAST_TIME=$(echo "$LAST_SNAPSHOT" | grep -o '"timestamp":[0-9]*' | cut -d':' -f2)

if [ -n "$FIRST_HEAP" ] && [ -n "$LAST_HEAP" ] && [ -n "$FIRST_TIME" ] && [ -n "$LAST_TIME" ]; then
    DURATION_SECONDS=$(((LAST_TIME - FIRST_TIME) / 1000))
    DURATION_MINUTES=$((DURATION_SECONDS / 60))
    
    echo "  First snapshot: ${FIRST_HEAP} MB"
    echo "  Last snapshot:  ${LAST_HEAP} MB"
    echo "  Duration:       ${DURATION_MINUTES} minutes (${DURATION_SECONDS} seconds)"
    
    # Calculate growth (using bc if available, otherwise approximation)
    if command -v bc &> /dev/null; then
        GROWTH=$(echo "scale=2; (($LAST_HEAP - $FIRST_HEAP) / $FIRST_HEAP) * 100" | bc)
        echo "  Growth:         ${GROWTH}%"
        
        # Evaluate growth
        GROWTH_INT=$(echo "$GROWTH" | cut -d'.' -f1)
        if [ "$GROWTH_INT" -gt 50 ]; then
            echo "  Status:         ⚠️  CRITICAL - Likely memory leak!"
        elif [ "$GROWTH_INT" -gt 20 ]; then
            echo "  Status:         ⚠️  WARNING - Possible memory leak"
        elif [ "$GROWTH_INT" -gt 10 ]; then
            echo "  Status:         ℹ️  INFO - Monitor continued growth"
        else
            echo "  Status:         ✅ HEALTHY - Normal behavior"
        fi
    else
        echo "  (Install 'bc' for growth percentage calculation)"
    fi
fi

echo ""
echo "🔍 Recent Analysis Results:"
echo "----------------------------------------"
grep "Memory growth analysis" "$DEBUG_LOG" | tail -3 | while read -r line; do
    AVG_FIRST=$(echo "$line" | grep -o '"avgFirstMB":"[^"]*"' | cut -d'"' -f4)
    AVG_LAST=$(echo "$line" | grep -o '"avgLastMB":"[^"]*"' | cut -d'"' -f4)
    GROWTH=$(echo "$line" | grep -o '"growthPercent":"[^"]*"' | cut -d'"' -f4)
    TIME_MIN=$(echo "$line" | grep -o '"timeMinutes":"[^"]*"' | cut -d'"' -f4)
    
    if [ -n "$AVG_FIRST" ] && [ -n "$AVG_LAST" ]; then
        echo "  Analysis: ${AVG_FIRST} MB → ${AVG_LAST} MB (${GROWTH}% over ${TIME_MIN} min)"
    fi
done

echo ""
echo "🔌 Connection Activity:"
echo "----------------------------------------"
CONNECTIONS=$(grep -c "New client connected" "$DEBUG_LOG" 2>/dev/null || echo "0")
DISCONNECTIONS=$(grep -c "Client disconnected" "$DEBUG_LOG" 2>/dev/null || echo "0")
echo "  Total Connections:    $CONNECTIONS"
echo "  Total Disconnections: $DISCONNECTIONS"
echo "  Current Clients:      $((CONNECTIONS - DISCONNECTIONS))"

# Check for disconnection issues
FAILED_DELETES=$(grep "handleDisconnect" "$DEBUG_LOG" | grep -c '"wasDeleted":false' 2>/dev/null || echo "0")
if [ "$FAILED_DELETES" -gt 0 ]; then
    echo "  ⚠️  Warning: $FAILED_DELETES failed client deletions detected!"
fi

echo ""
echo "📝 Tips:"
echo "----------------------------------------"
echo "  1. Run this script periodically to track trends"
echo "  2. Check '$DEBUG_LOG' for detailed data"
echo "  3. See server/memory-analysis.md for investigation guide"
echo "  4. Use 'tail -f $DEBUG_LOG | grep Memory' for live monitoring"
echo ""

