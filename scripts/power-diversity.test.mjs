import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDuplicateDiversity } from './power-diversity.mjs';

const evaluate = overrides => evaluateDuplicateDiversity({ quality: 0, requested: 100, accepted: 100, unique: 47, capacity: 50, ...overrides });

test('Q0/Q1 allow capacity-forced repeats but reject five excess duplicates', () => {
  for (const quality of [0, 1]) {
    const report = evaluate({ quality });
    assert.equal(report.mode, 'capacity-adjusted');
    assert.equal(report.unavoidableDuplicates, 50);
    assert.equal(report.excessDuplicates, 3);
    assert.equal(report.excessDuplicateRate, 0.03);
    assert.equal(report.uniqueFingerprintsRequired, 46);
    assert.equal(report.rawExactDuplicatesBelow5Percent, false);
    assert.equal(report.passed, true);
    assert.equal(evaluate({ quality, unique: 46 }).passed, true);
    assert.equal(evaluate({ quality, unique: 45 }).passed, false);
    assert.equal(evaluate({ quality, unique: 1 }).passed, false);
  }
});

test('Q2-Q4 retain the absolute strictly-below-five-percent gate', () => {
  for (const quality of [2, 3, 4]) {
    assert.equal(evaluate({ quality }).passed, false);
    const report = evaluate({ quality, unique: 96, capacity: 100 });
    assert.equal(report.mode, 'absolute');
    assert.equal(report.uniqueFingerprintsRequired, 96);
    assert.equal(report.unavoidableDuplicates, 0);
    assert.equal(report.passed, true);
    assert.equal(evaluate({ quality, unique: 95, capacity: 100 }).passed, false);
  }
});

test('capacity growth tightens the benchmark without a fixed fifty-power exemption', () => {
  assert.equal(evaluate({ capacity: 51 }).uniqueFingerprintsRequired, 47);
  assert.equal(evaluate({ capacity: 52 }).passed, false);
  assert.equal(evaluate({ unique: 96, capacity: 100 }).uniqueFingerprintsRequired, 96);
  assert.equal(evaluate({ unique: 95, capacity: 100 }).passed, false);
  assert.equal(evaluate({ unique: 96, capacity: 1000 }).passed, true);
});

test('small batches and failed generation cannot exploit rounding or empty output', () => {
  assert.equal(evaluate({ requested: 20, accepted: 20, unique: 10, capacity: 10 }).passed, true);
  assert.equal(evaluate({ requested: 20, accepted: 20, unique: 9, capacity: 10 }).passed, false);
  assert.equal(evaluate({ requested: 1, accepted: 1, unique: 1, capacity: 1 }).passed, true);
  assert.equal(evaluate({ accepted: 99 }).passed, false);
  assert.equal(evaluate({ accepted: 0, unique: 0, capacity: 0 }).passed, false);
  for (const overrides of [{ quality: 5 }, { requested: 0 }, { accepted: 101 }, { unique: 0 }, { capacity: 46 }, { capacity: NaN }, { unique: 47.5 }]) {
    assert.throws(() => evaluate(overrides), /Invalid duplicate benchmark/);
  }
});
