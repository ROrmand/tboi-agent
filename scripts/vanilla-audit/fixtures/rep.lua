-- Synthetic override using the installed Repentance table shape.
local repCollectibles = {
  [1] = {"1", "Fixture stat override", "↑ {{Tears}} " .. "+0.7 Tears"},
}
EID:updateDescriptionsViaTable(repCollectibles, EID.descriptions["en_us"].collectibles)
