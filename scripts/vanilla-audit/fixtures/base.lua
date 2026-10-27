-- Synthetic descriptions, NOT a redistributable copy of installed EID data.
--[=[ local collectibles = {{"999", "Comment decoy", "ignored"}} ]=]
local languageCode = "en_us"
EID.descriptions[languageCode].collectibles = {
  {"1", "Fixture stat", "↑ {{Tears}} +0.5 Tears"},
  {"2", "Fixture reusable", "Tears orbit the nearest enemy"},
  [3] = {"3", "Fixture system", "Taking damage spawns a wisp for 3 seconds#If at low health, rerolls all items in the current room"},
  [4] = {"4", "Fixture exclusion", "Opens a custom crafting menu"},
  [5] = {"5", "Fixture unknown", "{{UnfamiliarToken}} Warps the wobble#Homing tears"},
  [8] = {"8", "Fixture repeated", "Homing tears#Homing tears"},
  [9] = {"9", "Fixture empty", ""},
  [10] = {"10", "Fixture EID-only", "Not a runtime collectible"},
}
error("This source is data only and must NEVER execute")
