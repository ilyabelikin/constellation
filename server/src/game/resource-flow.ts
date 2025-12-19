/**
 * Resource Flow System
 *
 * Calculates how resources flow from colonized systems to the player's capital
 * through tunnels and gates.
 *
 * TUNNEL CONTROL LOGIC:
 * - Each tunnel has 2 gates (one at each end)
 * - Gates can be controlled independently by any species
 * - Tunnels can be powered by one player at a time (separate from gate control)
 * - To TRAVEL: you need to control at least one gate
 * - To POWER the tunnel: use the tunnel overtake/power on action (costs energy)
 * - Resources are BLOCKED if:
 *   1. The tunnel is unpowered (no player providing power)
 *   2. The tunnel is powered by an aggressive hostile species with defenses
 */

import { DatabaseQueries } from "../database/queries.js";
import { StarGate } from "@constellation/shared";

export interface TunnelResourceFlow {
  tunnelId: string;
  energy: number;
  alloy: number;
  science: number;
  isBlockaded: boolean;
  blockadeSpeciesId?: string;
  gateAOwnerId?: string;
  gateBOwnerId?: string;
  poweredByPlayerId?: string | null;
  canTravel: boolean; // Can travel through if you control at least one gate
  hasTunnelPower: boolean; // Have tunnel power if you control both gates
}

export interface GateResourceFlow {
  gateId: string;
  tunnelId: string;
  energy: number;
  alloy: number;
  science: number;
  isBlockaded: boolean;
  blockadeOwnerId?: string;
  blockadeOwnerName?: string;
}

export interface PlayerResourceFlow {
  playerId: string;
  totalEnergy: number;
  totalAlloy: number;
  totalScience: number;
  blockedEnergy: number;
  blockedAlloy: number;
  blockedScience: number;
  gateFlows: Map<string, GateResourceFlow>;
  tunnelFlows: Map<string, TunnelResourceFlow>;
}

/**
 * Finds the shortest path from one system to another through gates
 * Returns array of gate IDs in the path, or null if no path exists
 */
export function findGatePath(
  db: DatabaseQueries,
  fromSystemId: string,
  toSystemId: string
): string[] | null {
  if (fromSystemId === toSystemId) {
    return []; // Already at destination
  }

  // BFS to find shortest path
  const queue: Array<{ systemId: string; path: string[] }> = [
    { systemId: fromSystemId, path: [] },
  ];
  const visited = new Set<string>([fromSystemId]);

  while (queue.length > 0) {
    const current = queue.shift()!;

    // Get all gates in current system
    const gates = db.getGatesBySystem(current.systemId);

    for (const gate of gates) {
      // Only use explored/owned gates (gates with owners)
      const owner = db.getGateOwner(gate.id);
      if (!owner) continue; // Skip unexplored gates

      const destinationSystemId = gate.destinationSystemId;
      if (!destinationSystemId) continue; // Skip unconnected gates

      // Check if we reached the destination
      if (destinationSystemId === toSystemId) {
        return [...current.path, gate.id];
      }

      // Continue BFS
      if (!visited.has(destinationSystemId)) {
        visited.add(destinationSystemId);
        queue.push({
          systemId: destinationSystemId,
          path: [...current.path, gate.id],
        });
      }
    }
  }

  return null; // No path found
}

/**
 * Calculates resource flow through gates and tunnels for a player
 *
 * NEW TUNNEL CONTROL LOGIC:
 * - Each tunnel has 2 gates (gate A and gate B)
 * - Players can control gates independently
 * - Tunnel power is managed separately from gate control
 * - To travel through a tunnel: control at least 1 gate
 * - To power a tunnel: use tunnel overtake/power on action (costs energy)
 * - Unpowered tunnels block resource flow
 * - Tunnels powered by hostile species with defenses also block resource flow
 */
export function calculatePlayerResourceFlow(
  db: DatabaseQueries,
  playerId: string
): PlayerResourceFlow {
  const player = db.getPlayerById(playerId);
  if (!player) {
    throw new Error(`Player ${playerId} not found`);
  }

  const homeSystemId = player.homeSystemId;
  const playerSpeciesId = player.speciesId;
  const gateFlows = new Map<string, GateResourceFlow>();
  const tunnelFlows = new Map<string, TunnelResourceFlow>();

  // Track total production from remote systems (outside home system)
  let totalRemoteEnergy = 0;
  let totalRemoteAlloy = 0;
  let totalRemoteScience = 0;

  // Get all production sources in distant systems
  // 1. Colonies
  const colonies = db.getColoniesByPlayerId(playerId);
  for (const colony of colonies) {
    // Use colony's systemId directly (no need to look up planet)
    if (colony.systemId === homeSystemId) {
      continue; // Skip home system
    }

    // Find path from colony system to home system
    const path = findGatePath(db, colony.systemId, homeSystemId);
    if (!path || path.length === 0) {
      continue; // No path to capital - resources are isolated
    }

    // Use actual colony production rates
    const energyProduction = 0; // Colonies don't produce energy
    const alloyProduction = colony.alloyPerDay > 0 ? colony.alloyPerDay : 0; // Only count positive production
    const scienceProduction =
      colony.sciencePerDay > 0 ? colony.sciencePerDay : 0; // Only count positive production

    totalRemoteEnergy += energyProduction;
    totalRemoteAlloy += alloyProduction;
    totalRemoteScience += scienceProduction;

    // Add to each tunnel in the path (converted from gate IDs to tunnel IDs)
    for (const gateId of path) {
      const gate = db.getGateById(gateId);
      if (!gate || !gate.tunnelId) continue; // Skip gates without tunnels (placeholder destinations)

      const tunnelId = gate.tunnelId;
      let tunnelFlow = tunnelFlows.get(tunnelId);
      if (!tunnelFlow) {
        const tunnel = db.getTunnelById(tunnelId);
        const gatesInTunnel = db.getGatesByTunnel(tunnelId);

        // Determine which gate is A and which is B
        const gateA = gatesInTunnel.find(
          (g: StarGate) => g.systemId === tunnel?.systemAId
        );
        const gateB = gatesInTunnel.find(
          (g: StarGate) => g.systemId === tunnel?.systemBId
        );

        const gateAOwner = gateA ? db.getGateOwner(gateA.id) : null;
        const gateBOwner = gateB ? db.getGateOwner(gateB.id) : null;

        // Check if player controls at least one gate (can travel)
        const canTravel = gateAOwner === playerId || gateBOwner === playerId;

        // Check if player controls both gates (has tunnel power)
        const hasTunnelPower =
          gateAOwner === playerId && gateBOwner === playerId;

        tunnelFlow = {
          tunnelId,
          energy: 0,
          alloy: 0,
          science: 0,
          isBlockaded: false,
          gateAOwnerId: gateAOwner || undefined,
          gateBOwnerId: gateBOwner || undefined,
          poweredByPlayerId: tunnel?.poweredByPlayerId || null,
          canTravel,
          hasTunnelPower,
        };
        tunnelFlows.set(tunnelId, tunnelFlow);
      }

      tunnelFlow.energy += energyProduction;
      tunnelFlow.alloy += alloyProduction;
      tunnelFlow.science += scienceProduction;

      // Also track by gate for backward compatibility
      let flow = gateFlows.get(gateId);
      if (!flow) {
        flow = {
          gateId,
          tunnelId: gate.tunnelId || "", // Default to empty string for type safety
          energy: 0,
          alloy: 0,
          science: 0,
          isBlockaded: false,
        };
        gateFlows.set(gateId, flow);
      }

      flow.energy += energyProduction;
      flow.alloy += alloyProduction;
      flow.science += scienceProduction;
    }
  }

  // 2. Mining operations in distant systems
  const miningOps = db.getMiningOperationsByPlayer(playerId);
  for (const op of miningOps) {
    if (op.systemId === homeSystemId) {
      continue; // Skip home system
    }

    const path = findGatePath(db, op.systemId, homeSystemId);
    if (!path || path.length === 0) {
      continue;
    }

    const alloyProduction = op.alloyPerDay > 0 ? op.alloyPerDay : 0;
    totalRemoteAlloy += alloyProduction;

    for (const gateId of path) {
      const gate = db.getGateById(gateId);
      if (!gate || !gate.tunnelId) continue; // Skip gates without tunnels

      const tunnelId = gate.tunnelId;
      let tunnelFlow = tunnelFlows.get(tunnelId);
      if (!tunnelFlow) {
        const tunnel = db.getTunnelById(tunnelId);
        const gatesInTunnel = db.getGatesByTunnel(tunnelId);

        const gateA = gatesInTunnel.find(
          (g: StarGate) => g.systemId === tunnel?.systemAId
        );
        const gateB = gatesInTunnel.find(
          (g: StarGate) => g.systemId === tunnel?.systemBId
        );

        const gateAOwner = gateA ? db.getGateOwner(gateA.id) : null;
        const gateBOwner = gateB ? db.getGateOwner(gateB.id) : null;

        const canTravel = gateAOwner === playerId || gateBOwner === playerId;
        const hasTunnelPower =
          gateAOwner === playerId && gateBOwner === playerId;

        tunnelFlow = {
          tunnelId,
          energy: 0,
          alloy: 0,
          science: 0,
          isBlockaded: false,
          gateAOwnerId: gateAOwner || undefined,
          gateBOwnerId: gateBOwner || undefined,
          poweredByPlayerId: tunnel?.poweredByPlayerId || null,
          canTravel,
          hasTunnelPower,
        };
        tunnelFlows.set(tunnelId, tunnelFlow);
      }

      tunnelFlow.alloy += alloyProduction;

      let flow = gateFlows.get(gateId);
      if (!flow) {
        flow = {
          gateId,
          tunnelId: gate.tunnelId,
          energy: 0,
          alloy: 0,
          science: 0,
          isBlockaded: false,
        };
        gateFlows.set(gateId, flow);
      }

      flow.alloy += alloyProduction;
    }
  }

  // 2.5. Helium-3 operations in distant systems
  const helium3Ops = db.getHelium3OperationsByPlayer(playerId);
  for (const op of helium3Ops) {
    if (op.systemId === homeSystemId) {
      continue; // Skip home system
    }

    const path = findGatePath(db, op.systemId, homeSystemId);
    if (!path || path.length === 0) {
      continue;
    }

    const energyProduction = op.energyPerDay > 0 ? op.energyPerDay : 0;
    totalRemoteEnergy += energyProduction;

    for (const gateId of path) {
      const gate = db.getGateById(gateId);
      if (!gate || !gate.tunnelId) continue; // Skip gates without tunnels

      const tunnelId = gate.tunnelId;
      let tunnelFlow = tunnelFlows.get(tunnelId);
      if (!tunnelFlow) {
        const tunnel = db.getTunnelById(tunnelId);
        const gatesInTunnel = db.getGatesByTunnel(tunnelId);

        const gateA = gatesInTunnel.find(
          (g: StarGate) => g.systemId === tunnel?.systemAId
        );
        const gateB = gatesInTunnel.find(
          (g: StarGate) => g.systemId === tunnel?.systemBId
        );

        const gateAOwner = gateA ? db.getGateOwner(gateA.id) : null;
        const gateBOwner = gateB ? db.getGateOwner(gateB.id) : null;

        const canTravel = gateAOwner === playerId || gateBOwner === playerId;
        const hasTunnelPower =
          gateAOwner === playerId && gateBOwner === playerId;

        tunnelFlow = {
          tunnelId,
          energy: 0,
          alloy: 0,
          science: 0,
          isBlockaded: false,
          gateAOwnerId: gateAOwner || undefined,
          gateBOwnerId: gateBOwner || undefined,
          poweredByPlayerId: tunnel?.poweredByPlayerId || null,
          canTravel,
          hasTunnelPower,
        };
        tunnelFlows.set(tunnelId, tunnelFlow);
      }

      tunnelFlow.energy += energyProduction;

      let flow = gateFlows.get(gateId);
      if (!flow) {
        flow = {
          gateId,
          tunnelId: gate.tunnelId,
          energy: 0,
          alloy: 0,
          science: 0,
          isBlockaded: false,
        };
        gateFlows.set(gateId, flow);
      }

      flow.energy += energyProduction;
    }
  }

  // 3. Megastructures (Dyson swarms) in distant systems
  const megastructures = db.getMegastructuresByPlayer(playerId);
  for (const mega of megastructures) {
    if (mega.systemId === homeSystemId) {
      continue;
    }

    const path = findGatePath(db, mega.systemId, homeSystemId);
    if (!path || path.length === 0) {
      continue;
    }

    const energyProduction = mega.resourcePerDay || 0;
    totalRemoteEnergy += energyProduction;

    for (const gateId of path) {
      const gate = db.getGateById(gateId);
      if (!gate || !gate.tunnelId) continue; // Skip gates without tunnels

      const tunnelId = gate.tunnelId;
      let tunnelFlow = tunnelFlows.get(tunnelId);
      if (!tunnelFlow) {
        const tunnel = db.getTunnelById(tunnelId);
        const gatesInTunnel = db.getGatesByTunnel(tunnelId);

        const gateA = gatesInTunnel.find(
          (g: StarGate) => g.systemId === tunnel?.systemAId
        );
        const gateB = gatesInTunnel.find(
          (g: StarGate) => g.systemId === tunnel?.systemBId
        );

        const gateAOwner = gateA ? db.getGateOwner(gateA.id) : null;
        const gateBOwner = gateB ? db.getGateOwner(gateB.id) : null;

        const canTravel = gateAOwner === playerId || gateBOwner === playerId;
        const hasTunnelPower =
          gateAOwner === playerId && gateBOwner === playerId;

        tunnelFlow = {
          tunnelId,
          energy: 0,
          alloy: 0,
          science: 0,
          isBlockaded: false,
          gateAOwnerId: gateAOwner || undefined,
          gateBOwnerId: gateBOwner || undefined,
          poweredByPlayerId: tunnel?.poweredByPlayerId || null,
          canTravel,
          hasTunnelPower,
        };
        tunnelFlows.set(tunnelId, tunnelFlow);
      }

      tunnelFlow.energy += energyProduction;

      let flow = gateFlows.get(gateId);
      if (!flow) {
        flow = {
          gateId,
          tunnelId: gate.tunnelId,
          energy: 0,
          alloy: 0,
          science: 0,
          isBlockaded: false,
        };
        gateFlows.set(gateId, flow);
      }

      flow.energy += energyProduction;
    }
  }

  // Check each tunnel for blockades
  // A tunnel is blockaded if:
  // 1. It's unpowered (no power supply)
  // 2. It's powered by a hostile species (not the player's species) AND has defenses
  for (const [tunnelId, tunnelFlow] of tunnelFlows.entries()) {
    const tunnel = db.getTunnelById(tunnelId);
    if (!tunnel) continue;

    // If tunnel is unpowered, it's automatically blockaded
    if (!tunnel.poweredByPlayerId) {
      tunnelFlow.isBlockaded = true;
      tunnelFlow.blockadeSpeciesId = undefined; // No specific species blockading
      continue;
    }

    // If tunnel is powered by a hostile player, it's a blockade
    const tunnelOwner = tunnel.poweredByPlayerId;
    if (tunnelOwner && tunnelOwner !== playerId) {
      const stance = db.getPlayerStance(playerId, tunnelOwner);
      if (stance === "aggressive") {
        // Check if any gate in the tunnel has defenses
        const gatesInTunnel = db.getGatesByTunnel(tunnelId);
        const hasDefenses = gatesInTunnel.some((gate: StarGate) => {
          const defenses = db.getGateDefenses(gate.id);
          return defenses.length > 0;
        });

        if (hasDefenses) {
          tunnelFlow.isBlockaded = true;
          // Get blockader's species for display
          const blockader = db.getPlayerById(tunnelOwner);
          tunnelFlow.blockadeSpeciesId = blockader?.speciesId || undefined;
        }
      }
    }

    // Mark associated gates as blockaded
    for (const [gateId, flow] of gateFlows.entries()) {
      if (flow.tunnelId === tunnelId) {
        flow.isBlockaded = tunnelFlow.isBlockaded;
        if (tunnelFlow.isBlockaded) {
          // If tunnel is unpowered, set a clear message
          if (!tunnel.poweredByPlayerId) {
            flow.blockadeOwnerName = "Unpowered Tunnel";
          } else {
            // Tunnel is powered by a hostile player
            const gateAOwner = tunnelFlow.gateAOwnerId;
            const gateBOwner = tunnelFlow.gateBOwnerId;
            const blockadeOwner =
              gateAOwner === gateBOwner ? gateAOwner : undefined;
            if (blockadeOwner) {
              const ownerInfo = db.getGateOwnerWithName(gateId);
              if (ownerInfo) {
                flow.blockadeOwnerId = ownerInfo.ownerId;
                flow.blockadeOwnerName = ownerInfo.ownerName;
              }
            } else {
              // Hostile player with defenses is blockading
              const blockader = db.getPlayerById(tunnel.poweredByPlayerId);
              if (blockader) {
                const ownerInfo = db.getGateOwnerWithName(gateId);
                if (ownerInfo && ownerInfo.ownerId === tunnel.poweredByPlayerId) {
                  flow.blockadeOwnerName = ownerInfo.ownerName;
                } else {
                  flow.blockadeOwnerName = "Hostile Player";
                }
              }
            }
          }
        }
      }
    }
  }

  // Calculate blocked amounts
  let blockedEnergy = 0;
  let blockedAlloy = 0;
  let blockedScience = 0;

  // Check which resources are actually blocked
  // A resource is blocked if ANY tunnel in its path is blockaded
  // Recalculate blocked resources based on tunnel blockades
  for (const colony of colonies) {
    if (colony.systemId === homeSystemId) continue;

    const path = findGatePath(db, colony.systemId, homeSystemId);
    if (!path) continue;

    // Check if any tunnel in path is blockaded
    let isBlocked = false;
    for (const gateId of path) {
      const gate = db.getGateById(gateId);
      if (!gate || !gate.tunnelId) continue;

      const tunnelFlow = tunnelFlows.get(gate.tunnelId);
      if (tunnelFlow && tunnelFlow.isBlockaded) {
        isBlocked = true;
        break;
      }
    }

    if (isBlocked) {
      blockedAlloy += colony.alloyPerDay > 0 ? colony.alloyPerDay : 0;
      blockedScience += colony.sciencePerDay > 0 ? colony.sciencePerDay : 0;
    }
  }

  for (const op of miningOps) {
    if (op.systemId === homeSystemId) continue;

    const path = findGatePath(db, op.systemId, homeSystemId);
    if (!path) continue;

    let isBlocked = false;
    for (const gateId of path) {
      const gate = db.getGateById(gateId);
      if (!gate || !gate.tunnelId) continue; // Skip gates without tunnels

      const tunnelFlow = tunnelFlows.get(gate.tunnelId);
      if (tunnelFlow && tunnelFlow.isBlockaded) {
        isBlocked = true;
        break;
      }
    }

    if (isBlocked) {
      blockedAlloy += op.alloyPerDay > 0 ? op.alloyPerDay : 0;
    }
  }

  for (const op of helium3Ops) {
    if (op.systemId === homeSystemId) continue;

    const path = findGatePath(db, op.systemId, homeSystemId);
    if (!path) continue;

    let isBlocked = false;
    for (const gateId of path) {
      const gate = db.getGateById(gateId);
      if (!gate || !gate.tunnelId) continue; // Skip gates without tunnels

      const tunnelFlow = tunnelFlows.get(gate.tunnelId);
      if (tunnelFlow && tunnelFlow.isBlockaded) {
        isBlocked = true;
        break;
      }
    }

    if (isBlocked) {
      blockedEnergy += op.energyPerDay > 0 ? op.energyPerDay : 0;
    }
  }

  for (const mega of megastructures) {
    if (mega.systemId === homeSystemId) continue;

    const path = findGatePath(db, mega.systemId, homeSystemId);
    if (!path) continue;

    let isBlocked = false;
    for (const gateId of path) {
      const gate = db.getGateById(gateId);
      if (!gate || !gate.tunnelId) continue; // Skip gates without tunnels

      const tunnelFlow = tunnelFlows.get(gate.tunnelId);
      if (tunnelFlow && tunnelFlow.isBlockaded) {
        isBlocked = true;
        break;
      }
    }

    if (isBlocked) {
      blockedEnergy += mega.resourcePerDay || 0;
    }
  }

  return {
    playerId,
    totalEnergy: totalRemoteEnergy,
    totalAlloy: totalRemoteAlloy,
    totalScience: totalRemoteScience,
    blockedEnergy,
    blockedAlloy,
    blockedScience,
    gateFlows,
    tunnelFlows,
  };
}

/**
 * Gets the actual resource income for a player, accounting for blockades
 */
export function getEffectiveResourceIncome(
  db: DatabaseQueries,
  playerId: string
): { energy: number; alloy: number; science: number } {
  const flow = calculatePlayerResourceFlow(db, playerId);

  return {
    energy: flow.totalEnergy - flow.blockedEnergy,
    alloy: flow.totalAlloy - flow.blockedAlloy,
    science: flow.totalScience - flow.blockedScience,
  };
}
