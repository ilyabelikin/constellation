-- Test script to simulate a zero-population colony
-- This will help verify the zero-population colony fix works correctly

-- Step 1: Find an existing colony to test with
SELECT 
    id, 
    planet_name, 
    population, 
    player_id 
FROM colonies 
WHERE population > 0 
LIMIT 1;

-- Step 2: (After noting the colony info above) Set a colony to 0 population
-- REPLACE 'colony_id_here' with the actual colony ID from step 1
-- UPDATE colonies SET population = 0 WHERE id = 'colony_id_here';

-- Step 3: Check player resources before the fix runs
-- REPLACE 'player_id_here' with the actual player ID from step 1
-- SELECT energy, alloy, science FROM players WHERE id = 'player_id_here';

-- Step 4: Wait for the next daily tick (or restart the server to trigger it faster)
-- The server will:
-- 1. Detect the 0-population colony
-- 2. Delete it from the database
-- 3. Refund 3 energy ONLY to the player (alloy and science are lost)
-- 4. Send notifications to connected clients

-- Step 5: Verify the colony was removed
-- SELECT * FROM colonies WHERE id = 'colony_id_here';
-- (Should return no rows)

-- Step 6: Verify the player received the energy refund
-- SELECT energy, alloy, science FROM players WHERE id = 'player_id_here';
-- (Should be +3 energy from step 3, alloy and science should be UNCHANGED)

-- Expected behavior in-game:
-- 1. Player receives notification: "⚠️ Colony Abandoned: [Planet Name] - Energy refunded, but alloy and science are lost"
-- 2. Planet detail view shows "Establish Colony" button again
-- 3. Player resources updated to show +3 energy (alloy and science remain the same)

