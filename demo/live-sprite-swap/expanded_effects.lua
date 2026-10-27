local Module = {}
local handlers = {}
local available = {}
local function sourceId(profile)
  if type(profile)=="string" and profile~="" then return profile end
  if type(profile)=="table" and profile.index~=nil then return tostring(profile.index) end
end
local function finite(value)
  return type(value)=="number" and value==value and value~=math.huge and value~=-math.huge
end
local function alive(entity)
  return entity and entity.Exists and entity:Exists() and (not entity.IsDead or not entity:IsDead())
end
local function unit(vector)
  if not vector or not finite(vector.X) or not finite(vector.Y) then return nil end
  local length=math.sqrt(vector.X*vector.X+vector.Y*vector.Y)
  if length<0.001 or not finite(length) then return nil end
  return vector.X/length,vector.Y/length
end

function Module.validate(action,trigger,catalog)
  if type(action)~="table" or type(action.type)~="string" then return false end
  local spec=catalog.actions[action.type]
  if not spec or not handlers[action.type] then return false end
  local compatible=false
  for _,name in ipairs(spec.triggers) do if name==trigger then compatible=true end end
  if not compatible then return false end
  for name in pairs(action) do if name~="type" and not spec.params[name] then return false end end
  for name,param in pairs(spec.params) do
    local value=action[name]
    if param.enum then
      local found=false
      for _,choice in ipairs(param.enum) do if choice==value then found=true end end
      if not found then return false end
    elseif not finite(value) or value<param.min or value>param.max or (param.integer and value%1~=0) then return false end
  end
  return true
end

function Module.weight(action,catalog)
  local spec=type(action)=="table" and catalog.actions[action.type]
  if not spec or not Module.validate(action,spec.triggers[1],catalog) then return nil end
  local weight=spec.base_weight
  for name,param in pairs(spec.params) do if param.weight then weight=weight+param.weight*action[name] end end
  return weight
end

function Module.summary(action,catalog)
  if not Module.weight(action,catalog) then return nil end
  local descriptions={
    extra_tears=function() return "fires "..action.count.." plain extra tears in a "..action.pattern.." ("..action.damage.." damage each)" end,
    execute_enemy=function() return "executes one ordinary vulnerable nonboss hit enemy at or below "..string.format("%g",action.hp_ratio*100).."% observed current/max HP, excluding mortal buffered damage" end,
    target_impulse=function() return (action.direction=="pull" and "pulls" or "pushes").." the hit enemy (strength "..action.strength..")" end,
    block_projectiles=function() return "blocks up to "..action.count.." nearby hostile projectiles within "..action.radius end,
    reflect_projectiles=function() return "returns up to "..action.count.." ordinary hostile projectiles within "..action.radius.." as plain owned tears ("..action.damage.." damage each, speed "..action.speed..")" end,
    dash=function() return "dashes in the movement direction at speed "..action.speed..", without invulnerability" end,
    coins_to_charge=function() return "spends "..action.cost.." coins for up to "..action.charge.." primary active charges" end,
    temporary_ally=function() return "summons one temporary charmed pooter for "..action.duration.." frames (owner cap 2)" end,
  }
  return descriptions[action.type]().." (cooldown "..action.cooldown.." frames after success)"
end

function Module.new(deps,catalog)
  for _,name in ipairs({"frame","owns","vector","spawn","entityRef","isEnemy","isHostileProjectile","projectiles","chargeLimit","withGuard"}) do
    assert(type(deps[name])=="function","Missing expanded effect dependency: "..name)
  end
  assert(type(deps.enums)=="table" and catalog and catalog.version==1,"Expanded effect catalog/enums required")
  for _,name in ipairs({"tear","blueTear","pooter","primarySlot"}) do
    assert(finite(deps.enums[name]) and deps.enums[name]%1==0 and deps.enums[name]>=0,"Missing expanded effect enum: "..name)
  end
  for name in pairs(catalog.actions) do assert(handlers[name],"Unknown expanded handler: "..name) end
  for name in pairs(handlers) do assert(catalog.actions[name],"Missing expanded metadata: "..name) end
  local runtime={deps=deps,catalog=catalog,depth=0,actors={},cooldowns={}}

  function runtime:suppressed(entity,inspectGuarded)
    if self.depth>0 and not inspectGuarded then return true end
    local visited={}
    local function secondary(candidate,depth)
      if not candidate then return false end
      if depth>8 or visited[candidate] then return true end
      visited[candidate]=true
      local data=candidate.GetData and candidate:GetData()
      if data and data.expandedSecondary then return true end
      local found=secondary(candidate.SpawnerEntity,depth+1) or secondary(candidate.Parent,depth+1)
      visited[candidate]=nil
      return found
    end
    return secondary(entity,0)
  end

  function runtime:guard(callback)
    self.depth=self.depth+1
    local ok,result=pcall(self.deps.withGuard,callback)
    self.depth=self.depth-1
    if not ok then return false end
    return result==true
  end

  function runtime:removeEntity(entity)
    for index=#self.actors,1,-1 do
      if self.actors[index].entity==entity then table.remove(self.actors,index) end
    end
  end

  function runtime:cleanup(source,owner)
    if source~=nil then source=sourceId(source); if not source then return false end end
    local removed={}
    for index=#self.actors,1,-1 do
      local actor=self.actors[index]
      if (source==nil or actor.source==source) and (owner==nil or actor.owner==owner) then
        table.remove(self.actors,index)
        removed[#removed+1]=actor.entity
      end
    end
    for _,entity in ipairs(removed) do if alive(entity) then entity:Remove() end end
    for token,entry in pairs(self.cooldowns) do
      if (source==nil or entry.source==source) and (owner==nil or entry.owner==owner) then self.cooldowns[token]=nil end
    end
    return true
  end

  function runtime:clearActors()
    local removed=self.actors
    self.actors={}
    for _,actor in ipairs(removed) do if alive(actor.entity) then actor.entity:Remove() end end
  end

  function runtime:tick()
    local expired={}
    for _,entry in pairs(self.cooldowns) do
      if not alive(entry.owner) or not self.deps.owns(entry.source,entry.owner) then expired[#expired+1]=entry end
    end
    for _,entry in ipairs(expired) do self:cleanup(entry.source,entry.owner) end
    for token,entry in pairs(self.cooldowns) do if self.deps.frame()>=entry.untilFrame then self.cooldowns[token]=nil end end
    local removed={}
    for index=#self.actors,1,-1 do
      local actor=self.actors[index]
      if not alive(actor.entity) or not alive(actor.owner) or not self.deps.owns(actor.source,actor.owner) or self.deps.frame()>=actor.expires then
        table.remove(self.actors,index)
        removed[#removed+1]=actor.entity
      end
    end
    for _,entity in ipairs(removed) do if alive(entity) then entity:Remove() end end
  end

  function runtime:capacity(kind,owner)
    local total,owned=0,0
    for _,actor in ipairs(self.actors) do
      if actor.kind==kind and alive(actor.entity) and alive(actor.owner) and self.deps.owns(actor.source,actor.owner) and self.deps.frame()<actor.expires then
        total=total+1; if actor.owner==owner then owned=owned+1 end
      end
    end
    return total<(kind=="ally" and 16 or 64) and owned<(kind=="ally" and 2 or 12)
  end

  function runtime:track(entity,source,owner,kind,duration)
    entity:GetData().expandedSecondary={source=source,owner=owner.InitSeed}
    self.actors[#self.actors+1]={entity=entity,source=source,owner=owner,kind=kind,expires=self.deps.frame()+duration}
  end

  function runtime:snapshot()
    local saved={}
    for _,entry in pairs(self.cooldowns) do
      local remaining=entry.untilFrame-self.deps.frame()
      if remaining>0 and alive(entry.owner) and self.deps.owns(entry.source,entry.owner) then
        saved[#saved+1]={source=entry.source,owner=entry.owner.InitSeed,key=entry.key,remaining=remaining}
      end
    end
    table.sort(saved,function(left,right)
      if left.source~=right.source then return left.source<right.source end
      if left.owner~=right.owner then return left.owner<right.owner end
      return left.key<right.key
    end)
    return saved
  end

  function runtime:restore(saved,resolveOwner)
    if type(saved)~="table" or type(resolveOwner)~="function" or #self.actors>0 then return false end
    local pending,count={},0
    for index,entry in pairs(saved) do
      count=count+1
      if not finite(index) or index%1~=0 or index<1 or index>#saved or count>4096 or type(entry)~="table" then return false end
      for name in pairs(entry) do if name~="source" and name~="owner" and name~="key" and name~="remaining" then return false end end
      if not sourceId(entry.source) or type(entry.source)~="string" or type(entry.key)~="string" or entry.key=="" or not finite(entry.owner) or entry.owner%1~=0 or not finite(entry.remaining) or entry.remaining%1~=0 or entry.remaining<1 or entry.remaining>1800 then return false end
      local owner=resolveOwner(entry.owner)
      if not alive(owner) or owner.InitSeed~=entry.owner or not self.deps.owns(entry.source,owner) then return false end
      local token=#entry.source..":"..entry.source..":"..tostring(owner.InitSeed)..":"..entry.key
      if pending[token] then return false end
      pending[token]={source=entry.source,owner=owner,key=entry.key,untilFrame=self.deps.frame()+entry.remaining}
    end
    if count~=#saved then return false end
    self.cooldowns=pending
    return true
  end

  function runtime.canRun(profile,player,action,key,event)
    local source=sourceId(profile)
    if not source or type(key)~="string" or key=="" or not event or event.owner~=player then return false end
    if not alive(player) or not runtime.deps.owns(source,player) or runtime:suppressed(event.source) then return false end
    if not Module.validate(action,event.trigger,runtime.catalog) then return false end
    local token=#source..":"..source..":"..tostring(player.InitSeed)..":"..key
    local entry=runtime.cooldowns[token]
    if entry and runtime.deps.frame()<entry.untilFrame then return false end
    local count=0
    for _,stored in pairs(runtime.cooldowns) do if runtime.deps.frame()<stored.untilFrame then count=count+1 end end
    if count>=4096 then return false end
    local ok,result=pcall(available[action.type],runtime,player,action,event)
    return ok and result==true
  end

  function runtime:run(profile,player,action,key,event)
    if not self.canRun(profile,player,action,key,event) then return false end
    local source=sourceId(profile)
    local token=#source..":"..source..":"..tostring(player.InitSeed)..":"..key
    self:tick()
    local existing={}
    for _,actor in ipairs(self.actors) do existing[actor.entity]=true end
    local success=self:guard(function() return handlers[action.type](self,source,player,action,event) end)
    if not success then
      local removed={}
      for index=#self.actors,1,-1 do
        local actor=self.actors[index]
        if not existing[actor.entity] then table.remove(self.actors,index); removed[#removed+1]=actor.entity end
      end
      for _,entity in ipairs(removed) do if alive(entity) then entity:Remove() end end
    end
    if success then self.cooldowns[token]={source=source,owner=player,key=key,untilFrame=self.deps.frame()+action.cooldown} end
    return success
  end
  return runtime
end

available.extra_tears=function(runtime,_,action,event)
  return runtime:capacity("tear",event.owner) and (action.pattern=="ring" or unit(event.velocity)~=nil)
end
local function executionTarget(runtime,action,event)
  local target=event.target
  if not target then return nil end
  for _,name in ipairs({"Exists","IsDead","IsEnemy","IsActiveEnemy","IsVulnerableEnemy","IsBoss","HasMortalDamage","ToNPC","GetData","HasEntityFlags","KillWithSource"}) do
    if type(target[name])~="function" then return nil end
  end
  if target:Exists()~=true or target:IsDead()~=false or target:IsEnemy()~=true or target:IsActiveEnemy(false)~=true or
    target:IsVulnerableEnemy()~=true or target:IsBoss()~=false or target:HasMortalDamage()~=false or not target:ToNPC() then return nil end
  if type(target:GetData())~="table" or target.Parent~=nil or target.Child~=nil or runtime:suppressed(target,true) or runtime.deps.isEnemy(target)~=true then return nil end
  local enums=runtime.deps.enums
  if not finite(enums.friendly) or enums.friendly<=0 or enums.friendly%1~=0 or not finite(enums.charm) or enums.charm<=0 or enums.charm%1~=0 or
    target:HasEntityFlags(enums.friendly)~=false or target:HasEntityFlags(enums.charm)~=false then return nil end
  local current,maximum=target.HitPoints,target.MaxHitPoints
  if not finite(current) or not finite(maximum) or maximum<=0 or current<=0 or current>maximum or current/maximum>action.hp_ratio then return nil end
  return target
end
local function executionSource(runtime,player)
  local source=runtime.deps.entityRef(player)
  if source and source.Entity==player then return source end
end
available.execute_enemy=function(runtime,player,action,event)
  return executionSource(runtime,player)~=nil and executionTarget(runtime,action,event)~=nil
end
handlers.execute_enemy=function(runtime,_,player,action,event)
  local target=executionTarget(runtime,action,event)
  if not target then return false end
  local source=executionSource(runtime,player)
  if not source then return false end
  if executionTarget(runtime,action,event)~=target then return false end
  pcall(target.KillWithSource,target,source)
  local observed,dead=pcall(target.IsDead,target)
  return observed and dead==true
end
available.target_impulse=function(runtime,player,_,event)
  local target=event.target
  return alive(target) and runtime.deps.isEnemy(target) and not (target.IsBoss and target:IsBoss()) and
    unit(runtime.deps.vector(target.Position.X-player.Position.X,target.Position.Y-player.Position.Y))~=nil
end
available.block_projectiles=function(runtime,player,action)
  for _,projectile in ipairs(runtime.deps.projectiles()) do
    if alive(projectile) and runtime.deps.isHostileProjectile(projectile) and projectile.Position then
      local horizontal=projectile.Position.X-player.Position.X
      local vertical=projectile.Position.Y-player.Position.Y
      if horizontal*horizontal+vertical*vertical<=action.radius*action.radius then return true end
    end
  end
  return false
end
local function reflectedVelocity(runtime,player,action,projectile)
  if not alive(projectile) or not runtime.deps.isHostileProjectile(projectile) or runtime:suppressed(projectile,true) then return nil end
  if projectile.Variant~=0 or projectile.SubType~=0 or projectile.ProjectileFlags~=0 or type(projectile.Remove)~="function" then return nil end
  local position=projectile.Position
  if not position or not finite(position.X) or not finite(position.Y) or not player.Position or not finite(player.Position.X) or not finite(player.Position.Y) then return nil end
  local horizontal,vertical=position.X-player.Position.X,position.Y-player.Position.Y
  if horizontal*horizontal+vertical*vertical>action.radius*action.radius then return nil end
  horizontal,vertical=unit(projectile.Velocity)
  if not horizontal then return nil end
  return runtime.deps.vector(-horizontal*action.speed,-vertical*action.speed)
end
available.reflect_projectiles=function(runtime,player,action)
  if not runtime:capacity("tear",player) then return false end
  for _,projectile in ipairs(runtime.deps.projectiles()) do
    if reflectedVelocity(runtime,player,action,projectile) then return true end
  end
  return false
end
available.dash=function(_,_,_,event) return unit(event.velocity)~=nil end
available.coins_to_charge=function(runtime,player,action)
  local slot=runtime.deps.enums.primarySlot
  local item=player:GetActiveItem(slot)
  local limit=runtime.deps.chargeLimit(item)
  local current=player:GetActiveCharge(slot)
  local coins=player:GetNumCoins()
  return item~=0 and finite(limit) and limit%1==0 and limit>=1 and limit<=12 and finite(current) and current%1==0 and current>=0 and current<limit and finite(coins) and coins>=action.cost
end
available.temporary_ally=function(runtime,player) return runtime:capacity("ally",player) end

handlers.extra_tears=function(runtime,source,player,action,event)
  local horizontal,vertical=unit(event.velocity)
  if action.pattern=="cone" and not horizontal then return false end
  local base=horizontal and math.atan(vertical,horizontal) or 0
  local spawned=0
  for index=1,action.count do
    if not runtime:capacity("tear",player) then break end
    local offset=action.pattern=="ring" and (index-1)*math.pi*2/action.count or (action.count==1 and 0 or ((index-1)/(action.count-1)-0.5)*action.spread*math.pi/180)
    local velocity=runtime.deps.vector(math.cos(base+offset)*action.speed,math.sin(base+offset)*action.speed)
    local entity=runtime.deps.spawn(runtime.deps.enums.tear,runtime.deps.enums.blueTear,0,player.Position,velocity,player)
    local tear=entity and entity.ToTear and entity:ToTear()
    if tear then
      runtime:track(tear,source,player,"tear",90)
      tear.CollisionDamage=action.damage
      tear.TearFlags=0
      spawned=spawned+1
    elseif entity then entity:Remove() end
  end
  return spawned>0
end

handlers.target_impulse=function(runtime,_,player,action,event)
  local target=event.target
  if not alive(target) or not runtime.deps.isEnemy(target) or (target.IsBoss and target:IsBoss()) then return false end
  local horizontal,vertical=unit(runtime.deps.vector(target.Position.X-player.Position.X,target.Position.Y-player.Position.Y))
  if not horizontal then return false end
  local sign=action.direction=="pull" and -1 or 1
  target.Velocity=runtime.deps.vector(horizontal*action.strength*sign,vertical*action.strength*sign)
  return true
end

handlers.block_projectiles=function(runtime,_,player,action)
  local blocked=0
  for _,projectile in ipairs(runtime.deps.projectiles()) do
    if alive(projectile) and runtime.deps.isHostileProjectile(projectile) and projectile.Position then
      local horizontal=projectile.Position.X-player.Position.X
      local vertical=projectile.Position.Y-player.Position.Y
      if horizontal*horizontal+vertical*vertical<=action.radius*action.radius then
        projectile:Remove()
        blocked=blocked+1
        if blocked>=action.count then break end
      end
    end
  end
  return blocked>0
end

handlers.reflect_projectiles=function(runtime,source,player,action)
  local reflected,attempted=0,0
  for _,projectile in ipairs(runtime.deps.projectiles()) do
    if attempted>=action.count or not runtime:capacity("tear",player) then break end
    local queried,velocity=pcall(reflectedVelocity,runtime,player,action,projectile)
    if queried and velocity then
      attempted=attempted+1
      local entity,tear
      local prepared=pcall(function()
        entity=runtime.deps.spawn(runtime.deps.enums.tear,runtime.deps.enums.blueTear,0,projectile.Position,velocity,player)
        tear=entity and entity.ToTear and entity:ToTear()
        if not alive(tear) or not tear.GetData or not runtime.deps.owns(source,player) then error("Reflection tear unavailable") end
        runtime:track(tear,source,player,"tear",90)
        tear.CollisionDamage=action.damage
        tear.TearFlags=0
      end)
      if prepared then pcall(projectile.Remove,projectile) end
      if prepared and not alive(projectile) then
        reflected=reflected+1
      else
        if tear then runtime:removeEntity(tear) end
        if alive(entity) then pcall(entity.Remove,entity) end
      end
    end
  end
  return reflected>0
end

handlers.dash=function(runtime,_,player,action,event)
  local horizontal,vertical=unit(event.velocity)
  if not horizontal then return false end
  player.Velocity=runtime.deps.vector(horizontal*action.speed,vertical*action.speed)
  return true
end

handlers.coins_to_charge=function(runtime,_,player,action)
  local slot=runtime.deps.enums.primarySlot
  local item=player:GetActiveItem(slot)
  local limit=runtime.deps.chargeLimit(item)
  local current=player:GetActiveCharge(slot)
  local coins=player:GetNumCoins()
  if item==0 or not finite(limit) or limit%1~=0 or limit<1 or limit>12 or not finite(current) or current%1~=0 or current<0 or current>=limit or not finite(coins) or coins<action.cost then return false end
  local desired=math.min(limit,current+action.charge)
  local ok=pcall(function()
    player:AddCoins(-action.cost)
    if player:GetNumCoins()~=coins-action.cost then error("Coin debit failed") end
    player:SetActiveCharge(desired,slot)
    if player:GetActiveCharge(slot)~=desired then error("Charge grant failed") end
  end)
  if not ok then
    pcall(player.SetActiveCharge,player,current,slot)
    pcall(function() player:AddCoins(coins-player:GetNumCoins()) end)
    return false
  end
  return true
end

handlers.temporary_ally=function(runtime,source,player,action)
  if not runtime:capacity("ally",player) then return false end
  local entity=runtime.deps.spawn(runtime.deps.enums.pooter,0,0,player.Position,runtime.deps.vector(0,0),player)
  if not entity then return false end
  runtime:track(entity,source,player,"ally",action.duration)
  local ok=pcall(entity.AddCharmed,entity,runtime.deps.entityRef(player),action.duration+1)
  if not ok then entity:Remove(); runtime:removeEntity(entity); return false end
  return true
end

return Module
