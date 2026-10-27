local context = {}

function context.damage(amount,flags)
  if flags~=nil then
    if math.type(flags)~="integer" or not DamageFlag or math.type(DamageFlag.DAMAGE_FAKE)~="integer" then return end
    if (flags & DamageFlag.DAMAGE_FAKE)~=0 then return end
  end
  if type(amount)=="number" and amount==amount and amount>=0 and amount<math.huge then return amount end
end

function context.weapon(entity)
  if not entity or not EntityType then return end
  local seen,kind={},nil
  for _=1,8 do
    if not entity or seen[entity] then break end
    seen[entity]=true
    if not kind then
      if EntityType.ENTITY_TEAR and entity.Type==EntityType.ENTITY_TEAR then kind="tear"
      elseif EntityType.ENTITY_BOMB and entity.Type==EntityType.ENTITY_BOMB then kind="bomb"
      elseif EntityType.ENTITY_LASER and entity.Type==EntityType.ENTITY_LASER then kind="laser"
      elseif EntityType.ENTITY_KNIFE and entity.Type==EntityType.ENTITY_KNIFE then kind="knife"
      else return end
    elseif kind=="tear" and EntityType.ENTITY_FAMILIAR and entity.Type==EntityType.ENTITY_FAMILIAR then
      return "familiar_shot"
    end
    entity=entity.SpawnerEntity or entity.Parent
  end
  return kind
end

function context.pickup(variant)
  if not PickupVariant or variant==nil then return end
  local names={
    coin="PICKUP_COIN",key="PICKUP_KEY",bomb="PICKUP_BOMB",heart="PICKUP_HEART",
    pill="PICKUP_PILL",card="PICKUP_TAROTCARD",battery="PICKUP_LIL_BATTERY",
    trinket="PICKUP_TRINKET",chest="PICKUP_CHEST",sack="PICKUP_GRAB_BAG",
  }
  for name,enum in pairs(names) do
    if PickupVariant[enum]~=nil and variant==PickupVariant[enum] then return name end
  end
end

return context
