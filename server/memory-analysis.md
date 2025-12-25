# Memory Monitoring and Leak Detection Guide

This guide explains how to use the built-in memory monitoring system to track memory usage and detect potential memory leaks in the Constellation server.

## Overview

The server now includes comprehensive memory monitoring that:

- **Tracks memory usage** every 10 seconds (heap, RSS, external memory)
- **Analyzes growth trends** every 60 seconds to detect leaks
- **Logs application metrics** (clients, systems, galaxies, ships)
- **Sends debug logs** to the debug endpoint for analysis
- **Provides console output** for immediate visibility

## What Gets Monitored

### Memory Metrics
- **Heap Used**: JavaScript heap memory currently in use
- **Heap Total**: Total heap memory allocated by V8
- **RSS (Resident Set Size)**: Total memory allocated for the process
- **External**: Memory used by C++ objects bound to JavaScript
- **Array Buffers**: Memory used by ArrayBuffers and SharedArrayBuffers

### Application Metrics
- **Clients Count**: Active WebSocket connections
- **Active Players**: Authenticated players
- **Systems Count**: Star systems loaded in memory
- **Galaxies Count**: Active galaxy time states
- **Ships Count**: Total ships across all systems

## How to Use

### 1. Start the Server

The memory monitor starts automatically when you run the server:

```bash
cd server
npm run dev
```

You should see:

```
=== Starting Memory Monitor ===
Memory snapshots will be taken every 10 seconds
Run memory analysis every 60 seconds
```

### 2. Monitor Console Output

Every 10 seconds, you'll see memory snapshots in the console:

```
[Memory] Heap: 45.23/98.50 MB | RSS: 123.45 MB | External: 2.34 MB | Uptime: 120s | Clients: 2 | Systems: 5 | Galaxies: 1
```

Every 60 seconds, you'll see growth analysis:

```
[Memory Analysis] ✅ HEALTHY: Heap growth is 5.2% over 60.0 minutes. Normal behavior.
```

### 3. Check Debug Logs

All memory snapshots are also sent to the debug log file at:

```
/Users/ilyabelikin/Developer/constellation-v2/.cursor/debug.log
```

You can analyze these logs to see memory trends over time:

```bash
# View recent memory snapshots
tail -f /Users/ilyabelikin/Developer/constellation-v2/.cursor/debug.log | grep "Memory snapshot"

# Count snapshots
grep "Memory snapshot" /Users/ilyabelikin/Developer/constellation-v2/.cursor/debug.log | wc -l

# Extract memory data
grep "Memory snapshot" /Users/ilyabelikin/Developer/constellation-v2/.cursor/debug.log | jq '.data'
```

## Understanding Memory Growth

### Healthy Patterns

✅ **Normal behavior:**
- Memory increases when players connect or new systems load
- Memory stabilizes during steady gameplay
- Memory decreases after garbage collection
- Heap growth < 10% over 60 minutes during stable usage

### Warning Signs

⚠️ **Possible memory leak:**
- **10-20% growth** over 60 minutes: Monitor closely
- **20-50% growth** over 60 minutes: Likely leak, investigate
- **50%+ growth** over 60 minutes: Critical leak, requires immediate attention

### Leak Indicators

🚨 **Definite memory leak if:**
- Memory continuously grows without players joining
- Memory doesn't stabilize during idle periods
- Memory doesn't decrease after players disconnect
- Heap usage increases while application metrics stay flat

## Investigating Memory Leaks

### Step 1: Identify the Growth Pattern

Check the console output and debug logs:

```bash
# Show memory over time
grep "Memory snapshot" /Users/ilyabelikin/Developer/constellation-v2/.cursor/debug.log | jq -r '[.timestamp, .data.heapUsedMB, .data.clientsCount, .data.systemsCount] | @csv'
```

### Step 2: Correlate with Application Metrics

Look for patterns:
- Does memory grow when clients connect? (Expected)
- Does memory grow when systems load? (Expected)
- Does memory keep growing with stable client/system count? (Leak!)

### Step 3: Check Event Listeners

Common leak sources:
- Event listeners not removed on disconnect
- Timers not cleared
- Callbacks not nullified

Check instrumentation logs:

```bash
# Check client connections/disconnections
grep "handleConnection\|handleDisconnect" /Users/ilyabelikin/Developer/constellation-v2/.cursor/debug.log | jq '.data'

# Verify clients are removed
grep "handleDisconnect" /Users/ilyabelikin/Developer/constellation-v2/.cursor/debug.log | jq '.data.wasDeleted'
```

### Step 4: Monitor Maps and Arrays

The instrumentation tracks all major data structures:

```bash
# Check GameStateManager metrics
grep "GameStateManager metrics" /Users/ilyabelikin/Developer/constellation-v2/.cursor/debug.log | jq '.data'

# Look for growing maps
grep "systemsCount\|shipsMapSize\|galaxiesCount" /Users/ilyabelikin/Developer/constellation-v2/.cursor/debug.log
```

## Common Memory Leak Sources

### 1. WebSocket Connections

**Problem**: Clients not removed from the `clients` Map on disconnect

**Check**:
```bash
grep "handleDisconnect" /Users/ilyabelikin/Developer/constellation-v2/.cursor/debug.log | jq '.data.wasDeleted'
```

If `wasDeleted` is false, the client wasn't in the map (potential double-disconnect or leak).

### 2. Game State Maps

**Problem**: Systems or ships not cleaned up when galaxies are deleted

**Check**:
```bash
# Compare counts before and after galaxy cleanup
grep "GameStateManager metrics" /Users/ilyabelikin/Developer/constellation-v2/.cursor/debug.log | tail -20
```

### 3. Event Listeners

**Problem**: Event listeners attached but never removed

**Solution**: Ensure all `addEventListener` calls have corresponding `removeEventListener` in cleanup.

### 4. Timers and Intervals

**Problem**: `setInterval` or `setTimeout` not cleared

**Check**: The server has 3 main intervals. If you see more, investigate.

## Forcing Garbage Collection

To test if memory is reclaimable, you can force garbage collection:

1. Stop the server
2. Restart with the `--expose-gc` flag:

```bash
node --expose-gc dist/index.js
```

3. In another terminal, trigger GC via Node.js REPL or by adding a test endpoint

## Memory Profiling with Chrome DevTools

For deep analysis:

1. Start server with inspector:

```bash
node --inspect dist/index.js
```

2. Open Chrome and go to `chrome://inspect`
3. Click "inspect" on your Node.js process
4. Go to "Memory" tab
5. Take heap snapshots before/after actions
6. Compare snapshots to find retained objects

## Interpreting Hypotheses

The instrumentation includes hypothesis IDs to track different aspects:

- **H1**: Server initialization and startup
- **H2**: Memory monitor startup and configuration
- **H3**: GameStateManager metrics and lifecycle
- **H4**: WebSocket client connection/disconnection

## Expected Memory Usage

### Baseline (No Players)
- Heap: 30-50 MB
- RSS: 80-120 MB

### With 1 Player, 1 Galaxy, 5 Systems
- Heap: 50-80 MB
- RSS: 120-180 MB

### With 5 Players, Multiple Galaxies
- Heap: 100-200 MB
- RSS: 200-350 MB

**Note**: These are estimates. Your actual usage may vary based on galaxy size and complexity.

## Automated Analysis

The memory monitor automatically analyzes growth every 60 seconds. Watch for these messages:

```
✅ HEALTHY: Heap growth is X% over Y minutes. Normal behavior.
ℹ️  INFO: Heap grew by X% over Y minutes. Monitor continued growth.
⚠️  WARNING: Heap grew by X% over Y minutes. Possible memory leak.
⚠️  CRITICAL: Heap grew by X% over Y minutes. Likely memory leak!
```

## Next Steps

If you detect a memory leak:

1. **Document the pattern**: When does it occur? What triggers it?
2. **Check the hypotheses**: Review logs for the relevant hypothesis IDs
3. **Isolate the component**: Use the metrics to identify which subsystem is growing
4. **Review the code**: Look for missing cleanup in that component
5. **Add more instrumentation**: Add targeted logs to the suspected code
6. **Test the fix**: Monitor memory after applying fixes

## Example Analysis Session

```bash
# 1. Check overall memory trend
grep "Memory snapshot" debug.log | jq -r '[.timestamp, .data.heapUsedMB] | @csv' > memory.csv

# 2. Plot in your favorite tool (Excel, Python matplotlib, etc.)

# 3. Check if client count correlates with memory
grep "Memory snapshot" debug.log | jq -r '[.data.clientsCount, .data.heapUsedMB] | @csv'

# 4. Look for cleanup issues
grep "handleDisconnect" debug.log | jq '.data'

# 5. Check gameState growth
grep "GameStateManager metrics" debug.log | jq '.data'
```

## Resources

- [Node.js Memory Management](https://nodejs.org/en/docs/guides/simple-profiling)
- [Chrome DevTools Memory Profiler](https://developer.chrome.com/docs/devtools/memory-problems/)
- [V8 Garbage Collection](https://v8.dev/blog/trash-talk)



