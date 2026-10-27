local audit = { schemaVersion = 1, exporterVersion = "1.0.0" }

local function requiredText(value, label)
  assert(type(value) == "string" and value:match("%S"), label .. " is required (operator supplied)")
  return value
end

function audit.capture(provenance)
  assert(type(provenance) == "table", "explicit runtime provenance is required")
  local gameVersion = requiredText(provenance.gameVersion, "gameVersion")
  local runtimeVersion = requiredText(provenance.runtimeVersion, "runtimeVersion")
  local capturedAt = requiredText(provenance.capturedAt, "capturedAt (UTC ISO-8601)")
  local itemConfig = Isaac.GetItemConfig()
  local listSize = itemConfig:GetCollectibles().Size
  local vanillaLimit = CollectibleType.NUM_COLLECTIBLES
  assert(type(vanillaLimit) == "number" and vanillaLimit > 1, "missing vanilla enum boundary")
  assert(type(listSize) == "number" and listSize >= vanillaLimit, "ItemConfig list shorter than vanilla boundary")
  local rows = {}
  local absentIds = {}
  local qualities = { ["0"] = 0, ["1"] = 0, ["2"] = 0, ["3"] = 0, ["4"] = 0, other = 0 }
  for itemId = 1, vanillaLimit - 1 do
    local item = itemConfig:GetCollectible(itemId)
    if item then
      assert(item.ID == itemId, "ItemConfig returned mismatched ID " .. itemId)
      local qualityKey = tostring(item.Quality)
      if qualities[qualityKey] == nil then qualityKey = "other" end
      qualities[qualityKey] = qualities[qualityKey] + 1
      rows[#rows + 1] = {
        id = itemId, name = item.Name, description = item.Description,
        quality = item.Quality, type = item.Type, tags = item.Tags,
        hidden = item.Hidden, maxCharges = item.MaxCharges,
        chargeType = item.ChargeType, cacheFlags = item.CacheFlags,
        gfxFileName = item.GfxFileName
      }
    else
      absentIds[#absentIds + 1] = itemId
    end
  end
  assert(#rows > 0, "empty ItemConfig export")
  return {
    schemaVersion = audit.schemaVersion, exporterVersion = audit.exporterVersion,
    provenance = {
      kind = "runtime", source = "Isaac.GetItemConfig:GetCollectible",
      gameVersion = gameVersion, runtimeVersion = runtimeVersion,
      versionSource = "operator-supplied; verify against game log",
      capturedAt = capturedAt, repentogonPresent = REPENTOGON ~= nil,
      environmentNotes = provenance.environmentNotes or "not supplied; vanilla IDs may be modified by installed mods"
    },
    scope = {
      kind = "vanilla-enum-range", firstId = 1, lastId = vanillaLimit - 1,
      enumLimitExclusive = vanillaLimit, itemConfigListSize = listSize,
      absentIds = absentIds, excludes = "ID 0 and IDs >= NUM_COLLECTIBLES; no unlock/hidden/quality filtering"
    },
    counts = { total = #rows, quality = qualities }, collectibles = rows
  }
end

function audit.encode(provenance)
  local json = require("json")
  return json.encode(audit.capture(provenance))
end

function audit.write(provenance, exportMod)
  local encoded = audit.encode(provenance)
  assert(type(exportMod) == "table" and type(exportMod.SaveData) == "function", "dedicated audit mod is required")
  exportMod:SaveData(encoded)
  return encoded
end

return audit
