import { validatePowerSnapshot } from '../content-contract/powers.mjs';
import { selectSkeleton, validateSkeleton } from './power-planner.mjs';

export function buildPowerDesignBrief(prompt, powerUsage, { quality, itemType = 'passive', source = 'Creator', seed, validateProfile } = {}) {
  const snapshot = validatePowerSnapshot(powerUsage);
  const skeleton = selectSkeleton({ quality, powerUsage: snapshot, request: { prompt, itemType, source }, seed, validateProfile });
  const brief = {
    archetype: skeleton.archetype, mechanic_ids: skeleton.mechanicIds,
    primary_power: skeleton.primaryPower, required_profile_fragment: skeleton.fragment,
    constrained_repeat_fallback: skeleton.constrainedRepeat===true,
    repeated_power_fingerprint: skeleton.repeatedPowerFingerprint===true,
    selection_prior: skeleton.selectionPrior ?? null,
  };
  return {
    skeleton,
    ideaBrief: JSON.stringify(brief),
    designPrompt: 'Player theme/request:\n' + prompt + '\n\nTrusted local catalog skeleton:\n' + JSON.stringify(brief)
      + '\nKeep these stable mechanics and the exact supporting stat/health choices. Name and theme the item; choose only compatible bounded parameters. Do not add, remove, rename, or declare unique semantic powers. The runtime, not model output, owns run counts and repetition control.',
  };
}

export function validatePowerDesign(profile, skeleton, validateProfile) {
  return validateSkeleton(profile, skeleton, { validateProfile });
}
