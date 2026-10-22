// Wall-clock segments for one generation. The bridge closes the open segment
// when the generator reports the next @stage line, then again when the job ends.
export function createGenerationTimer(startedAt = Date.now(), initialStage = "startup") {
  let current = { name: initialStage, at: startedAt };
  const stages = [];
  let snapshot = null;

  return {
    mark(name, at = Date.now()) {
      if (snapshot || !name) return;
      stages.push({ name: current.name, ms: Math.max(0, at - current.at) });
      current = { name, at };
    },
    finish(at = Date.now()) {
      if (!snapshot) {
        stages.push({ name: current.name, ms: Math.max(0, at - current.at) });
        const totals_ms = {};
        for (const stage of stages) totals_ms[stage.name] = (totals_ms[stage.name] || 0) + stage.ms;
        snapshot = {
          duration_ms: Math.max(0, at - startedAt),
          stages: stages.map((stage) => ({ ...stage })),
          totals_ms,
        };
      }
      return snapshot;
    },
  };
}

export function noteGeneratorLine(timer, line) {
  const stage = String(line).trimEnd().match(/^@stage ([a-z][a-z0-9_]{0,39})$/);
  if (!stage) return null;
  timer.mark(stage[1]);
  return stage[1];
}
