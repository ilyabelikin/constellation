# Gate Connection Fix - December 20, 2024

## Issues Fixed

### Issue 1: Gates Showing as "Uncontrolled" After Connection
**Problem:** When using the debug connect feature to link two civilizations, the gates would show as "Uncontrolled" and "Unpowered" even though they were just connected by another civilization.

**Root Cause:** The `handleDebugConnectGate` function was marking gates as explored for both players but was NOT setting gate ownership. Without ownership records in the `gate_ownership` table, the `getTunnelOwnershipForSystem` query would return no owner information.

**Fix:** Added gate ownership assignment in `handleDebugConnectGate`:
```typescript
// Set gate ownership: each player owns their respective gate
// This ensures gates show as "Controlled" instead of "Uncontrolled"
this.db.setGateOwnership(gateId, player.id);
this.db.setGateOwnership(targetGate.id, targetPlayer.id);
```

### Issue 2: No Immediate Update to Receiving Civilization
**Problem:** When one civilization connected to another civilization's gate, the receiving player would not see any update unless they were in the exact same system. If they were viewing constellation or in a different system, they would not be notified.

**Root Cause:** The notification code only sent updates if the target player was in the connected system:
```typescript
if (targetClient && targetPlayer.currentSystemId === targetGate.systemId) {
  // Only sent update here
}
```

**Fix:** Restructured the notification logic to:
1. Always send a notification message to the target player if they're online
2. Send full system data update if they're in the connected system
3. Remove the conditional check that prevented notifications when players were elsewhere

```typescript
// Also notify the target player if they're online
// Send update regardless of where they are (system view or constellation view)
const targetClient = Array.from(this.clients.values()).find(
  (c) => c.playerId === targetPlayer.id
);
if (targetClient) {
  // Send notification message
  this.send(targetClient.ws, {
    type: "error",
    message: `${player.name}'s civilization has connected to your gate!`,
  });

  // If they're in the connected system, send full system update
  if (targetPlayer.currentSystemId === targetGate.systemId) {
    // ... send system data
  }
}
```

### Issue 3: Tunnel Not Powered After Connection
**Problem:** When gates were connected, the tunnel was created but not powered, showing as "Deactivated" instead of showing who's powering it.

**Root Cause:** The debug connect function created the tunnel but never called `setTunnelPower` to initialize it with a power source.

**Fix:** Added auto-power logic similar to `handleUseGate`, where the initiating player automatically powers the tunnel:
```typescript
// Auto-power tunnel when first connecting civilizations
// The initiating player powers the tunnel automatically
const tunnel = this.db.getTunnelById(tunnelId);
if (tunnel && !tunnel.poweredByPlayerId) {
  const OPEN_ENERGY_COST = GAME_COSTS.TUNNEL_POWER_ON.energy;
  if (player.energy >= OPEN_ENERGY_COST) {
    this.db.deductPlayerEnergy(player.id, OPEN_ENERGY_COST);
    this.db.setTunnelPower(tunnelId, player.id, OPEN_ENERGY_COST);
  }
}
```

### Issue 4: Receiving Civilization Cannot See Gate Destination
**Problem:** The receiving civilization saw "???" for the gate name and "Explored by another civilization" instead of the actual destination system name.

**Root Cause:** While gates were marked as explored in the database, the player's `exploredGateIds` array in the client was not updated, so the UI still treated them as unexplored.

**Fix:** Added player data updates after gate connection so both players receive updated `exploredGateIds`:
```typescript
// Get updated player data with new explored gates
const updatedPlayer = this.db.getPlayerById(player.id);
if (updatedPlayer) {
  this.send(client.ws, {
    type: "playerData",
    player: updatedPlayer,
  });
}
```

### Issue 5: Outline Not Updating to Show Gate Names
**Problem:** Even after receiving updated player data with new explored gates, the outline (system object list) continued to show "???" instead of the actual gate names.

**Root Cause:** The client received updated `exploredGateIds` and updated the scene, but didn't refresh the HUD outline which displays the gate names.

**Fix:** Added outline refresh when player data is updated with new explored gates:
```typescript
if (player.exploredGateIds) {
  this.scene.setExploredGates(player.exploredGateIds);
  
  // Refresh the outline to update gate names when new gates are explored
  // This is important when another civilization connects to our gates
  if (this.system) {
    this.hud.setSystem(this.system, true); // true = isRefresh, keeps selection
  }
}
```

## Files Modified

- `server/src/network/websocket-server.ts` - Lines 5688-5715 and 5724-5795
- `client/src/main.ts` - Lines 448-456 (player data handler)

## Testing

The fixes ensure that:
1. ✅ When gates are connected via debug mode, both gates immediately show proper ownership (each civilization owns their respective gate)
2. ✅ The receiving civilization gets notified immediately, regardless of their current location in the game
3. ✅ The tunnel is automatically powered by the initiating player, showing proper "Powered by X" status
4. ✅ Both civilizations can see the gate destination names and where the tunnel leads
5. ✅ The outline (system object list) updates to show actual gate names instead of "???"
6. ✅ Gate ownership information is properly stored and retrieved for display in the UI

## Technical Details

### Gate Ownership System
1. When a gate connection is established, ownership records are created in the `gate_ownership` table
2. The `getTunnelOwnershipForSystem` query joins this table with player data to provide ownership information
3. The client displays this information in the gate detail panel showing "This Gate" and "Other Gate" ownership
4. Without ownership records, gates default to showing as "Uncontrolled"

### Tunnel Power System
1. Tunnels are separate from gates - a tunnel connects two systems and can be powered by one civilization
2. When powered, the tunnel enables free travel and resource flow through it
3. The civilization powering the tunnel pays an ongoing energy cost
4. Without power, the tunnel shows as "Deactivated" and cannot be traversed
5. The first player to connect the tunnel automatically powers it (if they have enough energy)

### Explored Gates System
1. Each player has an `exploredGateIds` array tracking which gates they've discovered
2. When a gate is marked as explored in the database, the client must receive updated player data
3. The UI uses this array to determine whether to show "???" or the actual gate name
4. When civilizations connect, both gates are marked as explored for both players

