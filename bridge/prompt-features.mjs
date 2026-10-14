// The model chooses the region. This only makes the optional blocks match that
// choice, so a passive item cannot keep a familiar the schema happened to fill.
export function applyRegion(profile) {
  if (!profile || typeof profile !== "object") return profile;
  const wantsFamiliar = profile.region === "familiar" || profile.region === "familiar_aura";
  const wantsAura = profile.region === "aura" || profile.region === "familiar_aura";
  if (!wantsFamiliar) delete profile.familiar;
  if (!wantsAura) delete profile.aura;
  return profile;
}
