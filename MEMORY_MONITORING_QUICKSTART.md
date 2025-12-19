# Memory Monitoring Quick Start

## What Was Added

A comprehensive memory monitoring system has been integrated into your Constellation server to help track memory usage over time and detect potential memory leaks.

### New Files

1. **`server/src/utils/memory-monitor.ts`** - Core memory monitoring utility
2. **`server/memory-analysis.md`** - Comprehensive investigation guide
3. **`scripts/analyze-memory.sh`** - Quick analysis script

### Modified Files

1. **`server/src/index.ts`** - Starts memory monitoring on server startup
2. **`server/src/game/state-manager.ts`** - Added metrics tracking
3. **`server/src/network/websocket-server.ts`** - Added connection tracking

## Quick Start

### 1. Restart Your Server

The server is currently running. You need to restart it to activate memory monitoring:

```bash
# In the terminal where the server is running, press Ctrl+C to stop
# Then restart:
cd server
npm run dev
```

You should see:

```
=== Starting Memory Monitor ===
Memory snapshots will be taken every 10 seconds
Run memory analysis every 60 seconds

Server initialized successfully
Memory monitoring active - check logs for memory snapshots
```

### 2. Watch Memory Metrics in Console

Every 10 seconds, you'll see:

```
[Memory] Heap: 45.23/98.50 MB | RSS: 123.45 MB | External: 2.34 MB | Uptime: 120s | Clients: 2 | Systems: 5 | Galaxies: 1
```

Every 60 seconds, automatic analysis:

```
[Memory Analysis] ✅ HEALTHY: Heap growth is 5.2% over 60.0 minutes. Normal behavior.
```

### 3. Run the Analysis Script

After the server has been running for a few minutes:

```bash
./scripts/analyze-memory.sh
```

This shows:
- Latest memory metrics
- Memory growth analysis
- Connection activity
- Potential issues

### 4. Monitor Debug Logs

All memory snapshots are logged to:

```
/Users/ilyabelikin/Developer/constellation-v2/.cursor/debug.log
```

View in real-time:

```bash
tail -f /Users/ilyabelikin/Developer/constellation-v2/.cursor/debug.log | grep "Memory snapshot"
```

## What Gets Monitored

### Memory Metrics
- **Heap Used/Total** - JavaScript heap memory
- **RSS** - Total process memory
- **External** - C++ object memory
- **Array Buffers** - ArrayBuffer memory

### Application Metrics
- **Clients Count** - Active WebSocket connections
- **Active Players** - Authenticated players
- **Systems Count** - Star systems in memory
- **Galaxies Count** - Active galaxy states
- **Total Ships** - Ships across all systems

## Understanding the Output

### Console Output Explained

```
[Memory] Heap: 45.23/98.50 MB | RSS: 123.45 MB | External: 2.34 MB | Uptime: 120s | Clients: 2 | Systems: 5 | Galaxies: 1
         ^^^^^^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^^   ^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         Used / Total Heap      Total Process   C++ Objects         Seconds        Application State Metrics
```

### Growth Analysis Meanings

| Status | Growth | Meaning |
|--------|--------|---------|
| ✅ **HEALTHY** | < 10% | Normal memory behavior |
| ℹ️ **INFO** | 10-20% | Watch for continued growth |
| ⚠️ **WARNING** | 20-50% | Possible memory leak |
| ⚠️ **CRITICAL** | > 50% | Likely memory leak - investigate! |

## Common Scenarios

### Normal Growth Patterns

- Memory increases when players connect ✅
- Memory increases when new systems load ✅
- Memory spikes then stabilizes ✅
- Periodic small increases (garbage collection cycle) ✅

### Abnormal Patterns (Memory Leaks)

- Continuous growth with no new players ❌
- Memory doesn't stabilize during idle ❌
- Memory doesn't drop after disconnects ❌
- Heap grows but application metrics stay flat ❌

## Investigating a Suspected Leak

If you see warning signs:

### Step 1: Check the Pattern

```bash
# Run the analysis script
./scripts/analyze-memory.sh

# Look for:
# - Is memory growing steadily?
# - Are clients being cleaned up properly?
# - Are application metrics growing?
```

### Step 2: Review Debug Logs

```bash
# Check client lifecycle
grep "handleConnection\|handleDisconnect" /Users/ilyabelikin/Developer/constellation-v2/.cursor/debug.log | tail -20

# Check if clients are removed
grep "wasDeleted" /Users/ilyabelikin/Developer/constellation-v2/.cursor/debug.log | grep false

# Check game state metrics
grep "GameStateManager metrics" /Users/ilyabelikin/Developer/constellation-v2/.cursor/debug.log | tail -10
```

### Step 3: Correlate Memory with Metrics

Export data for analysis:

```bash
# Export memory snapshots
grep "Memory snapshot" /Users/ilyabelikin/Developer/constellation-v2/.cursor/debug.log | jq -r '[.timestamp, .data.heapUsedMB, .data.clientsCount, .data.systemsCount, .data.galaxiesCount] | @csv' > memory-data.csv

# Open in Excel, Google Sheets, or Python for visualization
```

## Instrumentation Details

The system includes debug instrumentation at key points:

### Hypothesis IDs

- **H1** - Server initialization
- **H2** - Memory monitor startup  
- **H3** - GameStateManager lifecycle
- **H4** - WebSocket connections

### Log Locations

- `index.ts:main-entry` - Server startup
- `index.ts:memory-monitor-started` - Monitor initialization
- `state-manager.ts:constructor` - Game state created
- `state-manager.ts:getMetrics` - State metrics collection
- `websocket-server.ts:constructor` - WebSocket server created
- `websocket-server.ts:handleConnection` - Client connected
- `websocket-server.ts:handleDisconnect` - Client disconnected
- `memory-monitor.ts:logSnapshot` - Memory snapshot taken
- `memory-monitor.ts:analyzeGrowth` - Growth analysis

## Advanced: Heap Snapshots

For deep analysis, use Chrome DevTools:

```bash
# Start with inspector
node --inspect dist/index.js

# Then:
# 1. Open chrome://inspect in Chrome
# 2. Click "inspect" on your process
# 3. Go to Memory tab
# 4. Take snapshots before/after actions
# 5. Compare to find retained objects
```

## Testing Scenarios

### Test 1: Connect and Disconnect

1. Start the server
2. Connect a client
3. Note the memory increase
4. Disconnect the client
5. Wait 1-2 minutes
6. Check if memory returns to baseline

**Expected**: Memory should stabilize or decrease after disconnect.

### Test 2: Load Multiple Systems

1. Start the server
2. Load several star systems
3. Monitor memory growth
4. Let it idle for 5 minutes
5. Check if memory stabilizes

**Expected**: Memory increases with systems, then stabilizes.

### Test 3: Long Running

1. Start the server
2. Let it run for 1+ hours with minimal activity
3. Run `./scripts/analyze-memory.sh` periodically
4. Check growth rate

**Expected**: < 10% growth per hour during idle.

## Troubleshooting

### No Memory Snapshots

**Problem**: Server starts but no memory logs appear.

**Solution**:
1. Check the server compiled: `cd server && npm run build`
2. Verify the server is running: `ps aux | grep node`
3. Wait 10 seconds for first snapshot

### High Memory Usage

**Problem**: Memory is high but not growing.

**Solution**: This may be normal depending on:
- Number of connected clients
- Number of loaded systems
- Galaxy complexity

Check the "Expected Memory Usage" section in `server/memory-analysis.md`.

### Analysis Script Shows No Data

**Problem**: `./scripts/analyze-memory.sh` shows 0 snapshots.

**Solution**:
1. Verify server is running
2. Check debug log exists: `ls -lh /Users/ilyabelikin/Developer/constellation-v2/.cursor/debug.log`
3. Wait for a few snapshots to accumulate (at least 10 seconds)

## Next Steps

1. **Monitor for 24 hours**: Let the server run and check periodically
2. **Review the full guide**: Read `server/memory-analysis.md` for detailed investigation techniques
3. **Set up alerts**: Consider adding alerts for critical memory growth
4. **Profile if needed**: Use Chrome DevTools for deep heap analysis

## Need Help?

If you detect a memory leak:

1. Run `./scripts/analyze-memory.sh` and save the output
2. Collect the last 100 lines of the debug log:
   ```bash
   tail -100 /Users/ilyabelikin/Developer/constellation-v2/.cursor/debug.log > memory-issue.log
   ```
3. Note when the issue started and what actions trigger it
4. Check the documentation in `server/memory-analysis.md`

---

## Summary

✅ **What You Have Now:**
- Automatic memory monitoring every 10 seconds
- Growth analysis every 60 minutes
- Console output for immediate visibility
- Detailed debug logs for analysis
- Analysis script for quick checks
- Comprehensive investigation guide

✅ **What to Do:**
1. Restart the server to activate monitoring
2. Watch console output for memory metrics
3. Run `./scripts/analyze-memory.sh` periodically
4. Investigate any warnings or abnormal patterns

🎯 **Goal:** Maintain stable memory usage and detect leaks early!

