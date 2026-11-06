import assert from "node:assert/strict";
import test from "node:test";
import { CONFIG } from "../js/config.js";
import {
  assembleSession,
  buildAssignment,
  buildPairTrials,
  buildTestTrials,
  limitRating,
  meanLadders,
  mulberry32,
  rngFromId,
  sampleGaussian,
  scoreChoice,
  sideFromKey,
  summarize,
} from "../js/design.js";
import { createLibrary } from "../js/stimuli.js";

const library = createLibrary();

function assignmentFor(id) {
  return buildAssignment(id, library.stimuli, CONFIG, rngFromId(id));
}

function signature(assignment) {
  return JSON.stringify({
    blockOrder: assignment.blockOrder,
    ratingFacesFirst: assignment.ratingFacesFirst,
    valenceFirst: assignment.valenceFirst,
    stimuli: assignment.stimuli
      .map((stim) => ({
        id: stim.id,
        mean: stim.mean,
        feedback: stim.feedback,
        partner: stim.partner_id,
        pair: stim.training_pair,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}

test("同一编号得到同一套价值分配", () => {
  assert.equal(signature(assignmentFor("A12")), signature(assignmentFor("A12")));
  assert.notEqual(signature(assignmentFor("A12")), signature(assignmentFor("B12")));
});

test("每个刺激只进入一种反馈，平均分覆盖设定值", () => {
  const assignment = assignmentFor("S01");
  assert.equal(assignment.stimuli.length, 16);
  for (const blockId of Object.keys(assignment.pools)) {
    const pool = assignment.pools[blockId];
    const ladders = Object.values(meanLadders(CONFIG)).map((ladder) => [...ladder].sort((a, b) => a - b));
    const got = pool.stimuli.map((stim) => stim.mean).sort((a, b) => a - b);
    assert.ok(ladders.some((ladder) => ladder.every((mean, index) => mean === got[index])));
    assert.equal(pool.pairs.length, 2);
    for (const pair of pool.pairs) {
      assert.equal(pair[0].partner_id, pair[1].id);
      assert.equal(pair[1].partner_id, pair[0].id);
      assert.equal(pair[0].training_pair, pair[1].training_pair);
      assert.equal(pair[0].feedback, pair[1].feedback);
    }
  }
  const ids = assignment.stimuli.map((stim) => stim.id);
  assert.equal(new Set(ids).size, 16);
  for (const modality of ["face", "word"]) {
    const means = assignment.stimuli.filter((stim) => stim.modality === modality).map((stim) => stim.mean);
    assert.equal(new Set(means).size, 8);
  }
});

test("学习试次左右平衡，测验包含全部重组", () => {
  const assignment = assignmentFor("S01");
  const pool = assignment.pools["face-partial"];
  const reps = 16;
  const trials = buildPairTrials(pool.pairs, reps, mulberry32(3));
  assert.equal(trials.length, pool.pairs.length * reps);
  for (const pair of pool.pairs) {
    const appearances = trials.filter(
      (trial) =>
        (trial.left.id === pair[0].id && trial.right.id === pair[1].id) ||
        (trial.left.id === pair[1].id && trial.right.id === pair[0].id)
    );
    assert.equal(appearances.length, reps);
    assert.equal(appearances.filter((trial) => trial.left.id === pair[0].id).length, reps / 2);
  }

  const faces = assignment.stimuli.filter((stim) => stim.modality === "face");
  const testTrials = buildTestTrials(faces, mulberry32(9));
  const keys = testTrials.map((trial) => [trial.left.id, trial.right.id].sort().join("|"));
  assert.equal(new Set(keys).size, 28);
  assert.equal(testTrials.filter((trial) => trial.left.partner_id === trial.right.id).length, 4);
  assert.ok(testTrials.every((trial) => trial.left.mean !== trial.right.mean));
});

test("正式流程的试次数", () => {
  const assignment = assignmentFor("S01");
  const plan = assembleSession(assignment, CONFIG, mulberry32(4));
  assert.equal(plan.rating.length, 32);
  assert.equal(plan.learning.length, 4);
  assert.equal(plan.learning.reduce((sum, block) => sum + block.trials.length, 0), 128);
  assert.equal(plan.test.reduce((sum, block) => sum + block.trials.length, 0), 56);
  const firstDimension = plan.rating[0].dimension;
  const secondDimension = plan.rating[1].dimension;
  assert.equal(plan.rating[0].stim.id, plan.rating[1].stim.id);
  assert.notEqual(firstDimension, secondDimension);
});

test("快速模式只保留少量评定和试次", () => {
  const assignment = assignmentFor("S01");
  const plan = assembleSession(
    assignment,
    {
      ...CONFIG,
      learningRepsPerPair: 1,
      quickRatingPerModality: 1,
      quickLearningTrials: 1,
      quickTestTrials: 1,
      forceBlockOrder: ["face-partial", "word-complete"],
    },
    mulberry32(5)
  );
  assert.equal(plan.rating.length, 4);
  assert.deepEqual(
    plan.learning.map((block) => block.blockId),
    ["face-partial", "word-complete"]
  );
  assert.equal(plan.learning[0].trials.length, 1);
  assert.ok(plan.rating.some((trial) => trial.stim.modality === "face"));
  assert.ok(plan.rating.some((trial) => trial.stim.modality === "word"));
  assert.equal(limitRating(plan.rating, 1).length, 4);
});

test("高斯抽样落在范围内且围绕均值", () => {
  const rng = mulberry32(11);
  const samples = Array.from({ length: 4000 }, () => sampleGaussian(50, 10, rng));
  const mean = samples.reduce((sum, sample) => sum + sample.shown, 0) / samples.length;
  assert.ok(mean > 48 && mean < 52);
  assert.ok(samples.every((sample) => Number.isInteger(sample.shown) && sample.shown >= 0 && sample.shown <= 100));
  assert.ok(new Set(samples.map((sample) => sample.shown)).size > 5);
});

test("部分反馈保存未显示的分数，但不标记为已显示", () => {
  const left = {
    id: "a",
    mean: 80,
    emotion: "happy",
    label: "高兴",
    feedback: "partial",
    partner_id: "b",
    training_pair: "p",
  };
  const right = {
    id: "b",
    mean: 20,
    emotion: "sad",
    label: "悲伤",
    feedback: "partial",
    partner_id: "a",
    training_pair: "p",
  };
  const partial = scoreChoice(
    left,
    right,
    "left",
    { raw: 81.2, shown: 81, clipped: false },
    { raw: 19.2, shown: 19, clipped: false },
    "partial"
  );
  assert.equal(partial.reward_left_shown, 1);
  assert.equal(partial.reward_right_shown, 0);
  assert.equal(partial.reward_right, 19);
  assert.equal(partial.optimal, 1);
  assert.equal(partial.chosen_reward, 81);
  assert.equal(partial.pair_trained, 1);

  const complete = scoreChoice(
    left,
    right,
    "right",
    { raw: 70, shown: 70, clipped: false },
    { raw: 30, shown: 30, clipped: false },
    "complete"
  );
  assert.equal(complete.reward_left_shown, 1);
  assert.equal(complete.reward_right_shown, 1);
  assert.equal(complete.optimal, 0);

  const testTrial = scoreChoice(left, right, "left", null, null, "none");
  assert.equal(testTrial.reward_left, null);
  assert.equal(testTrial.reward_left_shown, 0);
  assert.equal(testTrial.chosen_reward, null);
  assert.equal(testTrial.optimal, 1);
  assert.equal(sideFromKey("F"), "left");
  assert.equal(sideFromKey("j"), "right");
});

test("汇总能分辨反馈是否按条件显示", () => {
  const summary = summarize([
    {
      event: "choice",
      phase: "learning",
      feedback: "partial",
      block_id: "face-partial",
      choice_side: "left",
      reward_left: 40,
      reward_right: 20,
      reward_left_shown: 1,
      reward_right_shown: 0,
      chosen_reward: 40,
      optimal: 1,
    },
    {
      event: "choice",
      phase: "test",
      feedback: "none",
      choice_side: "right",
      reward_left: null,
      reward_right: null,
      reward_left_shown: 0,
      reward_right_shown: 0,
      chosen_reward: null,
      optimal: 0,
      pair_trained: 0,
    },
    { event: "rating", phase: "rating" },
    { event: "rating", phase: "practice" },
  ]);
  assert.equal(summary.partial_flags_ok, true);
  assert.equal(summary.test_rewards_hidden, true);
  assert.equal(summary.n_rating, 1);
  assert.equal(summary.learning_points, 40);
  assert.equal(summary.blocks["face-partial"].points, 40);
});
