# Mutual Relationship System Implementation

## Overview

Replaced the one-directional stance system with a mutual relationship system where diplomatic relationships are bidirectional and require agreement (except for war declarations).

## Key Changes

### Relationship Types

- **Neutral** (default): Cold war - blocks resource flow through gates (default state)
- **Friendly**: Allows resource flow through gates. Requires mutual agreement via proposals (costs 50 science to propose)
- **At War**: Hot war - blocks resource flow and allows attacks. Can be declared unilaterally (costs 25 science to declare)

### Costs

- **Propose Friendly Relationship**: 50 Science (requires acceptance from other player)
- **Declare War**: 25 Science (no agreement needed)

### Database Schema Changes

#### New Tables

1. **player_relationships** (replaces player_stances)

   - Stores mutual relationships between players
   - Uses CHECK constraint to ensure player1_id < player2_id (prevents duplicates)
   - Fields: player1_id, player2_id, relationship, updated_at

2. **relationship_proposals**
   - Stores pending friendly relationship proposals
   - Fields: id, from_player_id, to_player_id, proposal_type, created_at
   - UNIQUE constraint on (from_player_id, to_player_id)

#### Migration

- Old player_stances table is dropped during migration
- Existing one-directional stances are converted to neutral relationships
- Migration runs automatically on server startup

### Protocol Changes

#### New Client Messages

- `proposeRelationship`: Propose a friendly relationship (costs 50 science)
- `respondToProposal`: Accept or reject a proposal
- `declareWar`: Declare war on another player (costs 25 science)
- `requestRelationshipStatus`: Get all relationships and proposals

#### New Server Messages

- `relationshipChanged`: Notifies when a relationship changes
- `relationshipProposalReceived`: Notifies of incoming proposal
- `relationshipProposalSent`: Confirms proposal was sent
- `proposalAccepted`: Notifies when your proposal is accepted
- `proposalRejected`: Notifies when your proposal is rejected
- `relationshipStatus`: Returns all relationships and proposals

### Server Logic

#### Proposal Flow

1. Player A proposes friendly relationship to Player B (costs 50 science)
2. If Player B has already proposed to Player A, relationship is instantly established
3. Otherwise, proposal is stored and Player B is notified
4. Player B can accept or reject the proposal
5. On acceptance, relationship is set to "friendly" for both players
6. On rejection, proposal is deleted

#### War Declaration

1. Player declares war (costs 25 science)
2. Any pending proposals between players are deleted
3. Relationship is immediately set to "at_war" for both players
4. Both players are notified

### UI Changes

#### Player Profile Modal

- Shows current relationship status with color coding:
  - Neutral (gray)
  - Friendly ✓ (green)
  - At War ⚔ (red)
- Displays incoming proposal notice with Accept/Reject buttons
- Displays outgoing proposal notice (waiting for response)
- Action buttons with colored icons only (improved readability):
  - "✓ Propose Friendly Relationship (50 Science)" - green checkmark, only when neutral and no pending proposals
  - "⚔ Declare War (25 Science)" - red sword icon, available unless already at war
  - Buttons have neutral backgrounds with only the symbols colored for better contrast

#### Notifications

- Toast notifications for relationship changes
- Notifications for proposal sent/received/accepted/rejected
- **Pending proposals are sent when player joins/reconnects** - players receive all pending proposals on authentication
- **Pending proposals are shown when opening diplomacy modal** - both incoming and outgoing proposals for that specific player are sent when requesting player stats

### Backward Compatibility

#### Legacy Methods

- `getPlayerStance()` method maintained in DatabaseQueries for backward compatibility
- Maps "at_war" to "aggressive" for old code that expects the old enum

### Resource Flow and Gate Interaction Changes

#### Resource Flow Blocking (Cold War Mechanics)

- **Neutral relationships block resource flow** - This is the default "cold war" state
- **Only friendly relationships allow resource flow** through gates
- **At war also blocks resource flow** (hot war)
- Resources are blocked when:
  - A tunnel is powered by a player who is not friendly with you
  - The tunnel has gate defenses present

#### Gate Travel and Combat

- Gates with defenses owned by non-friendly players block travel
- You can only attack gates owned by neutral or at-war players
- Cannot attack gates owned by friendly players (must declare war first)
- Gate colors in constellation view update based on relationship status

## Testing Recommendations

1. **Proposal Flow**

   - Test proposing friendly relationship
   - Test mutual proposals (both players propose to each other)
   - Test accepting proposals
   - Test rejecting proposals

2. **War Declaration**

   - Test declaring war
   - Verify pending proposals are deleted when war is declared
   - Test gate blockades during war

3. **Resource Flow Blocking (Cold War)**

   - Test that neutral relationships block resource flow by default
   - Test that friendly relationships allow resource flow
   - Test that at-war relationships block resource flow
   - Verify blockade messages display correctly

4. **Resource Costs**

   - Verify 50 science is deducted when proposing friendship
   - Verify 25 science is deducted when declaring war
   - Test insufficient science scenarios

5. **UI**

   - Verify player profile modal shows correct relationship status
   - Test proposal notifications
   - Test relationship change notifications
   - Verify action buttons show/hide correctly based on state
   - **Test opening diplomacy modal with pending proposals** - outgoing proposals should show "⏳ Awaiting response..." notice
   - **Test opening diplomacy modal when you have incoming proposal** - should show proposal with Accept/Reject buttons
   - **Test accepting/rejecting proposals** - proposal UI should disappear after responding

6. **Migration**

   - Test with existing database (old player_stances should be converted)
   - Verify new games start with neutral relationships

## Files Modified

### Server

- `server/src/database/schema.ts` - Added new tables and migration
- `server/src/database/queries.ts` - Added relationship and proposal methods
- `server/src/network/websocket-server.ts` - Added handlers for new messages, sends pending proposals on authentication
- `server/src/game/resource-flow.ts` - Updated to use new relationship system (cold war blocks resources)

### Shared

- `shared/src/protocol.ts` - Added new message types

### Client

- `client/index.html` - Updated player profile modal UI
- `client/src/ui/hud.ts` - Added relationship UI management
- `client/src/network/client.ts` - Added new network methods and callbacks
- `client/src/main.ts` - Wired up new handlers and notifications

## Notes

- Relationships are mutual and symmetric (stored once per pair)
- **Default neutral state = cold war** - blocks resource flow but no combat
- **Only friendly relationships allow resource flow** between players
- War can be declared unilaterally (doesn't require agreement)
- Friendly relationships require mutual agreement via proposals
- All existing stances are reset to neutral during migration
- Science costs are deducted immediately when proposing or declaring war
- This creates a natural progression: Neutral (cold war) → Friendly (cooperation) or → At War (hot war)
