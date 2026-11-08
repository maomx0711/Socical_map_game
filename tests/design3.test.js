import assert from "node:assert/strict";
import test from "node:test";
import { CONFIG } from "../js/config3.js";
import { meanLadders, mulberry32, sampleGaussian } from "../js/design.js";
import {
  assembleTrioSession,
  buildTrioAssignment,
  buildTrioTestTrials,
  buildTrioTrials,
  rngFromId,
  scoreTrio,
  slotFromKey,
  summarizeTrio,
} from "../js/design3.js";
import { createTrioLibrary } from "../js/stimuli3.js";

const library = createTrioLibrary();

function assignmentFor(id) {
  return buildTrioAssignment(id, library.stimuli, CONFIG, rngFromId(id));
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
        trio: stim.training_trio,
        cohort: stim.cohort_ids,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}

test("同一编号得到同一套三臂价值分配", () => {
  assert.equal(signature(assignmentFor("A12")), signature(assignmentFor("A12")));
  assert.notEqual(signature(assignmentFor("A12")), signature(assignmentFor("B12")));
});

test("每种反馈正好三个刺激，平均分互不重叠", () => {
  const assignment = assignmentFor("S01");
  assert.equal(assignment.stimuli.length, 12);
  const ladders = Object.values(meanLadders(CONFIG)).map((ladder) => [...ladder].sort((a, b) => a - b));
  for (const blockId of Object.keys(assignment.pools)) {
    const pool = assignment.pools[blockId];
    assert.equal(pool.trio.length, 3);
    const got = pool.stimuli.map((stim) => stim.mean).sort((a, b) => a - b);
    assert.ok(ladders.some((ladder) => ladder.every((mean, index) => mean === got[index])));
    const ids = pool.stimuli.map((stim) => stim.id).sort();
    for (const stim of pool.stimuli) {
      assert.equal(stim.training_trio, `${blockId}-1`);
      assert.deepEqual(stim.cohort_ids.split("|").sort(), ids.filter((id) => id !== stim.id));
    }
  }
  for (const modality of ["face", "word"]) {
    const means = assignment.stimuli.filter((stim) => stim.modality === modality).map((stim) => stim.mean);
    assert.equal(new Set(means).size, 6);
    assert.equal(assignment.stimuli.filter((stim) => stim.modality === modality && stim.feedback === "partial").length, 3);
    assert.equal(assignment.stimuli.filter((stim) => stim.modality === modality && stim.feedback === "complete").length, 3);
  }
});

test("学习位置平衡，迁移包含全部三张组合", () => {
  const assignment = assignmentFor("S01");
  const trio = assignment.pools["face-partial"].trio;
  const trials = buildTrioTrials(trio, 18, mulberry32(3));
  assert.equal(trials.length, 18);
  for (const stim of trio) {
    assert.equal(trials.filter((trial) => trial.left.id === stim.id).length, 6);
    assert.equal(trials.filter((trial) => trial.middle.id === stim.id).length, 6);
    assert.equal(trials.filter((trial) => trial.right.id === stim.id).length, 6);
  }
  assert.ok(trials.every((trial) => new Set([trial.left.id, trial.middle.id, trial.right.id]).size === 3));

  const faces = assignment.stimuli.filter((stim) => stim.modality === "face");
  const transfer = buildTrioTestTrials(faces, mulberry32(9));
  const keys = transfer.map((trial) => [trial.left.id, trial.middle.id, trial.right.id].sort().join("|"));
  assert.equal(keys.length, 20);
  assert.equal(new Set(keys).size, 20);
  const trained = transfer.filter(
    (trial) => trial.left.training_trio === trial.middle.training_trio && trial.middle.training_trio === trial.right.training_trio
  );
  assert.equal(trained.length, 2);
  assert.ok(transfer.every((trial) => new Set([trial.left.mean, trial.middle.mean, trial.right.mean]).size === 3));
});

test("正式三臂流程的试次数", () => {
  const assignment = assignmentFor("S01");
  const plan = assembleTrioSession(assignment, CONFIG, mulberry32(4));
  assert.equal(plan.rating.length, 24);
  assert.equal(plan.learning.length, 4);
  assert.equal(plan.learning.reduce((sum, block) => sum + block.trials.length, 0), 72);
  assert.equal(plan.transfer.reduce((sum, block) => sum + block.trials.length, 0), 40);
  assert.equal(plan.rating[0].stim.id, plan.rating[1].stim.id);
  assert.notEqual(plan.rating[0].dimension, plan.rating[1].dimension);
});

test("部分反馈只标出被选中的一只臂，迁移不写分数", () => {
  const options = {
    left: { id: "a", mean: 80, emotion: "happy", label: "高兴", feedback: "partial", training_trio: "t" },
    middle: { id: "b", mean: 50, emotion: "sad", label: "悲伤", feedback: "partial", training_trio: "t" },
    right: { id: "c", mean: 20, emotion: "angry", label: "愤怒", feedback: "partial", training_trio: "t" },
  };
  const samples = {
    left: { raw: 81.2, shown: 81, clipped: false },
    middle: { raw: 49.4, shown: 49, clipped: false },
    right: { raw: 19.2, shown: 19, clipped: false },
  };
  const partial = scoreTrio(options, "middle", samples, "partial");
  assert.equal(partial.reward_left_shown, 0);
  assert.equal(partial.reward_middle_shown, 1);
  assert.equal(partial.reward_right_shown, 0);
  assert.equal(partial.reward_left, 81);
  assert.equal(partial.reward_right, 19);
  assert.equal(partial.chosen_reward, 49);
  assert.equal(partial.optimal, 0);
  assert.equal(partial.best_slot, "left");
  assert.equal(partial.trio_trained, 1);
  assert.equal(partial.choice_slot, "middle");

  const complete = scoreTrio(
    {
      ...options,
      left: { ...options.left, feedback: "complete" },
      middle: { ...options.middle, feedback: "complete" },
      right: { ...options.right, feedback: "complete" },
    },
    "left",
    samples,
    "complete"
  );
  assert.equal(complete.reward_left_shown, 1);
  assert.equal(complete.reward_middle_shown, 1);
  assert.equal(complete.reward_right_shown, 1);
  assert.equal(complete.optimal, 1);
  assert.equal(complete.chosen_reward, 81);

  const transfer = scoreTrio(options, "left", { left: null, middle: null, right: null }, "none");
  assert.equal(transfer.reward_left, null);
  assert.equal(transfer.reward_middle_shown, 0);
  assert.equal(transfer.reward_right_shown, 0);
  assert.equal(transfer.chosen_reward, null);
  assert.equal(transfer.optimal, 1);
  assert.equal(slotFromKey("F"), "left");
  assert.equal(slotFromKey(" "), "middle");
  assert.equal(slotFromKey("j"), "right");
});

test("汇总能分辨三臂反馈和迁移是否隐藏分数", () => {
  const summary = summarizeTrio([
    {
      event: "choice",
      phase: "learning",
      feedback: "partial",
      block_id: "face-partial",
      choice_slot: "left",
      reward_left: 40,
      reward_middle: 20,
      reward_right: 10,
      reward_left_shown: 1,
      reward_middle_shown: 0,
      reward_right_shown: 0,
      chosen_reward: 40,
      optimal: 1,
    },
    {
      event: "choice",
      phase: "learning",
      feedback: "complete",
      block_id: "word-complete",
      choice_slot: "right",
      reward_left: 30,
      reward_middle: 70,
      reward_right: 90,
      reward_left_shown: 1,
      reward_middle_shown: 1,
      reward_right_shown: 1,
      chosen_reward: 90,
      optimal: 1,
    },
    {
      event: "choice",
      phase: "transfer",
      feedback: "none",
      choice_slot: "middle",
      reward_left: null,
      reward_middle: null,
      reward_right: null,
      reward_left_shown: 0,
      reward_middle_shown: 0,
      reward_right_shown: 0,
      chosen_reward: null,
      optimal: 0,
      trio_trained: 0,
    },
    { event: "rating", phase: "rating" },
    { event: "rating", phase: "practice" },
  ]);
  assert.equal(summary.partial_flags_ok, true);
  assert.equal(summary.complete_flags_ok, true);
  assert.equal(summary.transfer_rewards_hidden, true);
  assert.equal(summary.n_rating, 1);
  assert.equal(summary.n_transfer, 1);
  assert.equal(summary.learning_points, 130);
  assert.equal(summary.blocks["face-partial"].points, 40);
  assert.equal(summary.transfer_novel.n, 1);
});

test("高斯抽样仍限制在 0 到 100", () => {
  const rng = mulberry32(11);
  const samples = Array.from({ length: 200 }, () => sampleGaussian(90, 10, rng));
  assert.ok(samples.every((sample) => sample.shown >= 0 && sample.shown <= 100));
});
