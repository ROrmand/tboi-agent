import test from 'node:test';
import assert from 'node:assert/strict';
import { expandedEffects, summarizeExpandedAction } from './expanded-effects.mjs';
import { buildPowerDesignBrief, validatePowerDesign } from './power-design.mjs';
import { explicitPowerKeys, compatibleSkeletons } from './power-planner.mjs';
import { validateProfile } from './generate.mjs';
import { POWER_CONTRACT_VERSION, POWER_KEYS, derivePowerKeys, powerSnapshot, buildPowerLedger, validatePowerSnapshot } from '../content-contract/powers.mjs';
import { selectionPriorMultiplier, REVIEWED_SELECTION_TAGS } from './selection-priors.mjs';
import { createLuaProfileValidator } from '../scripts/power-diversity.mjs';

test('execution is one semantic power across triggers/thresholds, never a stat relabel or reviewed frequency prior', async () => {
  assert.equal(POWER_CONTRACT_VERSION, 5);
  assert.equal(POWER_KEYS.length, 48);
  assert.equal(REVIEWED_SELECTION_TAGS['power.execution'], undefined);
  const snapshot=powerSnapshot(buildPowerLedger([]));
  assert.throws(()=>validatePowerSnapshot({...snapshot,version:3}),/version|contract|snapshot/i);
  const runtime=await createLuaProfileValidator();
  try {
    for (let quality=0;quality<=4;quality+=1) {
      assert.equal(selectionPriorMultiplier('power.execution',quality),1);
      for (const trigger of expandedEffects.actions.execute_enemy.triggers) {
        const system=trigger==='enemy_hit'?'on_hit':trigger;
        const proc={conditions:[],actions:[{type:'execute_enemy',hp_ratio:0.05,cooldown:90}]};
        const profile={region:'passive',systems:[system],affects_stats:false,metadata:{display_name:'Bounded Execution',description:'One weakened nonboss target.',quality,theme:'none',balance_note:''},visuals:{pedestal_prompt:'One small artifact'},rules:trigger==='enemy_hit'?[{trigger,...proc}]:[],...(trigger==='enemy_hit'?{}:{[trigger]:proc})};
        validateProfile(profile);await runtime.validate(profile);
        assert.deepEqual(derivePowerKeys(profile),['power.execution']);
        proc.actions[0].hp_ratio=0.1;
        assert.deepEqual(derivePowerKeys(profile),['power.execution']);
      }
    }
    assert.ok(summarizeExpandedAction(expandedEffects.actions.execute_enemy.example).includes('15% observed current/max HP'));
    assert.ok(compatibleSkeletons({quality:0,request:{itemType:'passive'}}).candidates.some(entry=>derivePowerKeys(entry.profile).includes('power.execution')));
  } finally {runtime.close();}
});

test('Creator execution wishes use real bounded skeletons; other sources cannot force a frequency or novelty override', () => {
  const snapshot=powerSnapshot(buildPowerLedger([]));
  for (const prompt of ['execute weakened enemies','execution','executes enemies','executing enemies']) {
    assert.deepEqual(explicitPowerKeys({prompt}),['power.execution']);
    const brief=buildPowerDesignBrief(prompt,snapshot,{quality:1,source:'Creator',seed:'execution',validateProfile});
    assert.deepEqual(derivePowerKeys(brief.skeleton.profile),['power.execution']);
    assert.equal(validatePowerDesign(brief.skeleton.profile,brief.skeleton,validateProfile),true);
  }
  for (const source of ['Generator','Singularity']) assert.deepEqual(explicitPowerKeys({source,prompt:'execute enemies'}),[]);
});
