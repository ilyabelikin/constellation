import { v4 as uuidv4 } from "uuid";

interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
}

interface MemoryMetrics {
  clientsCount: number;
  systemsCount: number;
  galaxiesCount: number;
  intervalsCount: number;
  customMetrics?: Record<string, number>;
}

export class MemoryMonitor {
  private snapshots: MemorySnapshot[] = [];
  private startTime: number = Date.now();
  private intervalId: NodeJS.Timeout | null = null;
  private logEndpoint: string;
  private sessionId: string = "memory-monitor";

  constructor(logEndpoint?: string) {
    this.logEndpoint = logEndpoint || "http://127.0.0.1:7242/ingest/ee94a6f1-42d6-44ad-8459-4ef2edbb6497";
  }

  /**
   * Start monitoring memory at specified interval
   */
  start(intervalMs: number = 5000): void {
    if (this.intervalId) {
      console.warn("Memory monitor already running");
      return;
    }

    console.log(`Starting memory monitor (interval: ${intervalMs}ms)`);
    this.takeSnapshot();
    
    this.intervalId = setInterval(() => {
      this.takeSnapshot();
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("Memory monitor stopped");
    }
  }

  /**
   * Take a memory snapshot and log it
   */
  takeSnapshot(metrics?: MemoryMetrics): MemorySnapshot {
    const memUsage = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      arrayBuffers: memUsage.arrayBuffers,
    };

    this.snapshots.push(snapshot);

    // Log the snapshot
    this.logSnapshot(snapshot, metrics);

    // Keep only last 1000 snapshots to avoid memory leak in the monitor itself
    if (this.snapshots.length > 1000) {
      this.snapshots.shift();
    }

    return snapshot;
  }

  /**
   * Log snapshot to debug endpoint
   */
  private logSnapshot(snapshot: MemorySnapshot, metrics?: MemoryMetrics): void {
    const data: any = {
      heapUsedMB: (snapshot.heapUsed / 1024 / 1024).toFixed(2),
      heapTotalMB: (snapshot.heapTotal / 1024 / 1024).toFixed(2),
      externalMB: (snapshot.external / 1024 / 1024).toFixed(2),
      rssMB: (snapshot.rss / 1024 / 1024).toFixed(2),
      arrayBuffersMB: (snapshot.arrayBuffers / 1024 / 1024).toFixed(2),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
    };

    if (metrics) {
      data.clientsCount = metrics.clientsCount;
      data.systemsCount = metrics.systemsCount;
      data.galaxiesCount = metrics.galaxiesCount;
      data.intervalsCount = metrics.intervalsCount;
      
      if (metrics.customMetrics) {
        Object.assign(data, metrics.customMetrics);
      }
    }

    // Also log to console for immediate visibility
    console.log(
      `[Memory] Heap: ${data.heapUsedMB}/${data.heapTotalMB} MB | ` +
      `RSS: ${data.rssMB} MB | ` +
      `External: ${data.externalMB} MB | ` +
      `Uptime: ${data.uptimeSeconds}s` +
      (metrics ? ` | Clients: ${metrics.clientsCount} | Systems: ${metrics.systemsCount} | Galaxies: ${metrics.galaxiesCount}` : "")
    );
  }

  /**
   * Analyze memory growth trends
   */
  analyzeGrowth(): {
    isLeaking: boolean;
    growthRate: number;
    recommendation: string;
  } {
    if (this.snapshots.length < 10) {
      return {
        isLeaking: false,
        growthRate: 0,
        recommendation: "Not enough data to analyze (need at least 10 snapshots)",
      };
    }

    // Compare first 5 and last 5 snapshots
    const firstBatch = this.snapshots.slice(0, 5);
    const lastBatch = this.snapshots.slice(-5);

    const avgFirst = firstBatch.reduce((sum, s) => sum + s.heapUsed, 0) / firstBatch.length;
    const avgLast = lastBatch.reduce((sum, s) => sum + s.heapUsed, 0) / lastBatch.length;

    const growthRate = ((avgLast - avgFirst) / avgFirst) * 100;
    const timeDiff = (lastBatch[0].timestamp - firstBatch[0].timestamp) / 1000 / 60; // minutes

    let isLeaking = false;
    let recommendation = "";

    if (growthRate > 50) {
      isLeaking = true;
      recommendation = `⚠️  CRITICAL: Heap grew by ${growthRate.toFixed(1)}% over ${timeDiff.toFixed(1)} minutes. Likely memory leak!`;
    } else if (growthRate > 20) {
      isLeaking = true;
      recommendation = `⚠️  WARNING: Heap grew by ${growthRate.toFixed(1)}% over ${timeDiff.toFixed(1)} minutes. Possible memory leak.`;
    } else if (growthRate > 10) {
      recommendation = `ℹ️  INFO: Heap grew by ${growthRate.toFixed(1)}% over ${timeDiff.toFixed(1)} minutes. Monitor continued growth.`;
    } else {
      recommendation = `✅ HEALTHY: Heap growth is ${growthRate.toFixed(1)}% over ${timeDiff.toFixed(1)} minutes. Normal behavior.`;
    }

    console.log(`[Memory Analysis] ${recommendation}`);
    return { isLeaking, growthRate, recommendation };
  }

  /**
   * Force garbage collection if available (node must be run with --expose-gc)
   */
  forceGC(): void {
    if (global.gc) {
      console.log("[Memory] Forcing garbage collection...");
      global.gc();
      console.log("[Memory] GC completed");
      
      // Take snapshot after GC
      setTimeout(() => {
        this.takeSnapshot();
      }, 100);
    } else {
      console.warn("[Memory] GC not available. Run node with --expose-gc flag.");
    }
  }

  /**
   * Get current memory statistics
   */
  getStats(): {
    current: MemorySnapshot;
    peak: MemorySnapshot;
    snapshotCount: number;
    uptimeSeconds: number;
  } {
    const current = this.snapshots[this.snapshots.length - 1] || this.takeSnapshot();
    const peak = this.snapshots.reduce(
      (max, s) => (s.heapUsed > max.heapUsed ? s : max),
      this.snapshots[0] || current
    );

    return {
      current,
      peak,
      snapshotCount: this.snapshots.length,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  /**
   * Export snapshots for analysis
   */
  exportSnapshots(): MemorySnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Clear all snapshots (useful for testing)
   */
  clearSnapshots(): void {
    this.snapshots = [];
    console.log("[Memory] Snapshots cleared");
  }
}

// Export singleton instance
export const memoryMonitor = new MemoryMonitor();



