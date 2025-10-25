# Memory Management Best Practices

This document outlines the memory management strategies implemented in Constellation to prevent memory leaks and ensure optimal performance.

## Overview

Memory leaks in web applications, especially those using Three.js/WebGL, can cause:

- Increasing memory usage over time
- Performance degradation
- Browser crashes
- Poor user experience

This project implements comprehensive cleanup strategies to prevent these issues.

## Cleanup Implementation

### 1. Three.js Resources (SceneManager)

**Problem**: Three.js objects (geometries, materials, textures) are stored in GPU memory and must be explicitly disposed.

**Solution**: The `SceneManager.dispose()` method properly cleans up:

```typescript
// Dispose geometries
if (mesh.geometry) {
  mesh.geometry.dispose();
}

// Dispose materials and their textures
if (mesh.material) {
  if (material.map) material.map.dispose();
  material.dispose();
}

// Dispose renderer
renderer.dispose();
renderer.forceContextLoss();
```

**Usage**:

- Called when loading a new system (via `clearScene()`)
- Called when shutting down the application
- Automatically cleans up meshes, materials, geometries, textures, and lights

### 2. Event Listeners

**Problem**: Event listeners keep references to objects, preventing garbage collection.

**Solution**: Store references to handler functions and remove them on cleanup:

```typescript
// Store handler reference
this.mouseDownHandler = (e: MouseEvent) => this.onMouseDown(e);
this.renderer.domElement.addEventListener("mousedown", this.mouseDownHandler);

// Remove on cleanup
this.renderer.domElement.removeEventListener(
  "mousedown",
  this.mouseDownHandler
);
```

**Components with event listener cleanup**:

- `SceneManager`: Mouse, keyboard, window resize
- `HUDManager`: Button clicks
- `NetworkClient`: WebSocket events
- `ConstellationClient`: Keyboard shortcuts

### 3. WebSocket Connections (NetworkClient)

**Problem**: Open WebSocket connections consume resources and may reconnect unexpectedly.

**Solution**: The `NetworkClient.disconnect()` method:

- Removes all WebSocket event listeners
- Closes the connection cleanly
- Clears all callbacks
- Prevents reconnection attempts

```typescript
disconnect(): void {
  if (this.ws) {
    this.ws.onopen = null;
    this.ws.onclose = null;
    this.ws.close();
    this.ws = null;
  }
}
```

### 4. Animation Loops

**Problem**: `requestAnimationFrame` continues calling even when not needed, wasting CPU/GPU.

**Solution**: Track and cancel animation frames:

```typescript
// Store frame ID
this.animationFrameId = requestAnimationFrame(animate);

// Cancel on cleanup
if (this.animationFrameId !== null) {
  cancelAnimationFrame(this.animationFrameId);
}
```

### 5. Callback References

**Problem**: Callback functions can create circular references.

**Solution**: Clear all callbacks on disposal:

```typescript
dispose(): void {
  this.onObjectSelected = null;
  this.onPlayerData = null;
  // ... clear all callbacks
}
```

## Component Lifecycle

### Normal Operation

1. **Initialization**: Resources are allocated
2. **Usage**: Resources are used during gameplay
3. **Disposal**: Resources are cleaned up when no longer needed

### Scene Switching

When loading a new star system:

1. `clearScene()` is called automatically
2. All old meshes, materials, and geometries are disposed
3. New system is loaded with fresh resources
4. No memory accumulation over time

### Application Shutdown

When the application closes:

1. Call `ConstellationClient.dispose()`
2. All components dispose their resources
3. Event listeners are removed
4. Network connections are closed
5. Animation loops are stopped

## Best Practices for Future Development

### Adding New Three.js Objects

When creating new Three.js objects:

```typescript
// ✅ GOOD: Dispose in clearScene
const geometry = new THREE.SphereGeometry(radius);
const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const mesh = new THREE.Mesh(geometry, material);
this.scene.add(mesh);
this.objects.set(id, mesh); // Track for disposal

// In clearScene:
for (const mesh of this.objects.values()) {
  mesh.geometry.dispose();
  if (mesh.material instanceof THREE.Material) {
    mesh.material.dispose();
  }
  this.scene.remove(mesh);
}
```

```typescript
// ❌ BAD: Never disposed
const geometry = new THREE.SphereGeometry(radius);
const mesh = new THREE.Mesh(geometry);
this.scene.add(mesh);
// No disposal = memory leak!
```

### Adding Event Listeners

```typescript
// ✅ GOOD: Store reference for removal
private clickHandler = () => { /* ... */ };
button.addEventListener("click", this.clickHandler);

// In dispose:
button.removeEventListener("click", this.clickHandler);
```

```typescript
// ❌ BAD: Anonymous function can't be removed
button.addEventListener("click", () => {
  /* ... */
});
// Can't remove = memory leak!
```

### Adding Network Callbacks

```typescript
// ✅ GOOD: Clear in dispose
this.network.onStateUpdate = (state) => {
  /* ... */
};

// In dispose:
this.network.onStateUpdate = null;
```

### Creating Timers/Intervals

```typescript
// ✅ GOOD: Clear on cleanup
const intervalId = setInterval(() => {
  /* ... */
}, 1000);

// In dispose:
clearInterval(intervalId);
```

```typescript
// ❌ BAD: Never cleared
setInterval(() => {
  /* ... */
}, 1000);
// Continues running = CPU waste + memory leak!
```

## Testing for Memory Leaks

### Browser DevTools

1. Open Chrome DevTools
2. Go to Memory tab
3. Take a heap snapshot
4. Perform actions (load system, reset galaxy, etc.)
5. Take another snapshot
6. Compare snapshots - memory should stabilize

### Performance Monitoring

```javascript
// Add to console
setInterval(() => {
  console.log("Memory:", performance.memory.usedJSHeapSize / 1048576, "MB");
}, 5000);
```

Memory usage should:

- ✅ Stabilize after initial load
- ✅ Return to baseline after resetting galaxy
- ❌ Continuously increase over time

## Current Status

### ✅ Implemented Cleanup

- [x] Three.js geometries, materials, textures
- [x] Three.js lights and scene objects
- [x] WebGL context and renderer
- [x] Mouse event listeners (scene)
- [x] Keyboard event listeners (main)
- [x] Window resize listeners
- [x] HUD button listeners
- [x] WebSocket connections
- [x] Network callbacks
- [x] Animation frames (requestAnimationFrame)
- [x] Object references

### Component Disposal Methods

All major components have `dispose()` methods:

- `SceneManager.dispose()`
- `HUDManager.dispose()`
- `NetworkClient.disconnect()`
- `ConstellationClient.dispose()`

### Automatic Cleanup

- Scene clearing when loading new systems
- Connection cleanup on page unload (via browser)
- Proper disposal of replaced objects

## Future Considerations

### Hot Module Replacement (HMR)

During development with Vite HMR, disposal methods should be called:

```typescript
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    client.dispose();
  });
}
```

### Multiple Scenes/Windows

If implementing multiple views or windows:

- Each scene needs its own SceneManager instance
- Each must be disposed when closed
- Share resources where possible (textures, geometries)

### Resource Pooling

For frequently created/destroyed objects:

- Consider object pooling
- Reuse geometries and materials
- Only dispose when truly done

## Summary

This project follows industry best practices for memory management in WebGL applications:

1. **Explicit disposal** of GPU resources
2. **Event listener cleanup** to prevent reference leaks
3. **Connection management** for network resources
4. **Animation control** to prevent waste
5. **Clear lifecycle** with disposal methods

By following these patterns, Constellation should maintain stable memory usage even during extended play sessions.

## References

- [Three.js Manual: How to dispose of objects](https://threejs.org/docs/#manual/en/introduction/How-to-dispose-of-objects)
- [MDN: Memory Management](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Memory_Management)
- [Chrome DevTools: Memory Profiling](https://developer.chrome.com/docs/devtools/memory-problems/)
