/**
 * 情绪评定 + 三臂老虎机。
 *
 * 1. 评定 6 张情绪面孔和 6 个情绪词的效价、唤醒度（1–9）。
 * 2. 面孔和词汇各自随机分成两组，分别进入部分反馈和完全反馈。
 *    每组 3 个刺激，组成一个固定的三臂组合。两组使用错开的平均分，
 *    标准差都是 rewardSD。同一类材料里 6 个平均分互不相同。
 *    学习阶段只重复这个组合，6 种位置排列轮流出现。
 *    每次奖励 ~ Normal(mean, sd)，四舍五入并限制在 0–100。
 *    部分反馈只显示所选分数；完全反馈三个分数都显示。只有所选分数计分。
 *    未显示的分数仍写入数据，reward_*_shown 标明被试是否看见。
 * 3. 迁移阶段无反馈。同一类材料的全部三张组合各出现一次，位置随机。
 *    其中包含学习过的组合，也包含跨反馈条件的新组合。
 *    请选择价值最高的一张。
 *
 * 价值分配由被试编号决定，同一编号每次打开都得到同一套平均分和组合。
 * 试次顺序和每次抽出的分数不由编号决定。
 * 改动下面随机数的消耗顺序时，把 config.designVersion 加一。
 */

import {
  BLOCK_IDS,
  MODALITY_LABEL,
  buildRatingSequence,
  hashString,
  limitRating,
  meanLadders,
  mulberry32,
  numberTrials,
  parseBlock,
  permutations,
  rngFromId,
  shuffle,
} from "./design.js";

export {
  MODALITY_LABEL,
  buildRatingSequence,
  hashString,
  mulberry32,
  numberTrials,
  rngFromId,
  shuffle,
};

export const TRIO_BLOCK_IDS = BLOCK_IDS;

export const TRIO_FEEDBACK_LABEL = {
  partial: "只显示所选项的分数",
  complete: "三个选项的分数都显示",
  none: "不显示分数",
};

const SLOTS = ["left", "middle", "right"];

export function slotFromKey(key) {
  const value = String(key ?? "").toLowerCase();
  if (value === "f") return "left";
  if (value === " " || value === "space" || value === "spacebar") return "middle";
  if (value === "j") return "right";
  return null;
}

export function combinations(items, k) {
  if (k === 0) return [[]];
  const result = [];
  for (let i = 0; i <= items.length - k; i += 1) {
    const head = items[i];
    for (const tail of combinations(items.slice(i + 1), k - 1)) {
      result.push([head, ...tail]);
    }
  }
  return result;
}

function copyStim(item, extra) {
  return {
    id: item.id,
    modality: item.modality,
    emotion: item.emotion,
    label: item.label,
    html: item.html,
    ...extra,
  };
}

function attachTrio(stimuli, blockId) {
  if (stimuli.length !== 3) throw new Error("每个反馈条件需要 3 个刺激。");
  const trioId = `${blockId}-1`;
  const ids = stimuli.map((stim) => stim.id);
  for (const stim of stimuli) {
    stim.training_trio = trioId;
    stim.cohort_ids = ids
      .filter((id) => id !== stim.id)
      .sort()
      .join("|");
  }
  return { stimuli, trio: stimuli };
}

export function buildTrioAssignment(participantId, stimuli, config, rng = rngFromId(participantId)) {
  const faces = stimuli.filter((item) => item.modality === "face");
  const words = stimuli.filter((item) => item.modality === "word");
  if (faces.length !== 6 || words.length !== 6) {
    throw new Error("三臂任务需要 6 张面孔和 6 个情绪词。");
  }
  const ladders = meanLadders(config);
  if (ladders.base.length !== 3) {
    throw new Error(`means 需要 3 个平均分，当前是 ${ladders.base.length} 个。`);
  }

  const splitModality = (items, modality) => {
    const ordered = shuffle(items, rng);
    const partialLadder = rng() < 0.5 ? "offset" : "base";
    const partialMeans = shuffle(partialLadder === "base" ? ladders.base : ladders.offset, rng);
    const completeLadder = partialLadder === "base" ? "offset" : "base";
    const completeMeans = shuffle(partialLadder === "base" ? ladders.offset : ladders.base, rng);
    const partial = ordered.slice(0, 3).map((item, index) =>
      copyStim(item, { feedback: "partial", mean: partialMeans[index], mean_ladder: partialLadder })
    );
    const complete = ordered.slice(3).map((item, index) =>
      copyStim(item, { feedback: "complete", mean: completeMeans[index], mean_ladder: completeLadder })
    );
    return {
      partial: attachTrio(partial, `${modality}-partial`),
      complete: attachTrio(complete, `${modality}-complete`),
    };
  };

  const facePools = splitModality(faces, "face");
  const wordPools = splitModality(words, "word");
  const pools = {
    "face-partial": facePools.partial,
    "face-complete": facePools.complete,
    "word-partial": wordPools.partial,
    "word-complete": wordPools.complete,
  };
  const orders = permutations(TRIO_BLOCK_IDS);
  const blockOrder = orders[Math.floor(rng() * orders.length)];

  return {
    participantId: String(participantId),
    seed: hashString(participantId),
    blockOrder,
    ratingFacesFirst: rng() < 0.5,
    valenceFirst: rng() < 0.5,
    pools,
    stimuli: TRIO_BLOCK_IDS.flatMap((id) => pools[id].stimuli),
  };
}

export function buildTrioTrials(trio, reps, rng = Math.random) {
  if (!trio || trio.length !== 3) throw new Error("三臂学习每次需要 3 个刺激。");
  if (!Number.isInteger(reps) || reps < 1) throw new Error("重复次数必须是正整数。");
  const orders = permutations(trio);
  const trials = [];
  for (let rep = 0; rep < reps; rep += 1) {
    const order = orders[rep % orders.length];
    trials.push({
      left: order[0],
      middle: order[1],
      right: order[2],
      trioRep: rep + 1,
    });
  }
  return shuffle(trials, rng);
}

export function buildTrioTestTrials(stimuli, rng = Math.random) {
  if (stimuli.length < 3) throw new Error("迁移阶段至少需要 3 个刺激。");
  const trials = combinations(stimuli, 3).map((trio) => {
    const order = shuffle(trio, rng);
    return {
      left: order[0],
      middle: order[1],
      right: order[2],
      trioRep: null,
    };
  });
  return shuffle(trials, rng);
}

export function assembleTrioSession(assignment, config, rng = Math.random) {
  let rating = buildRatingSequence(assignment, rng);
  if (config.quickRatingPerModality) {
    rating = limitRating(rating, config.quickRatingPerModality);
  }

  const order = config.forceBlockOrder ?? assignment.blockOrder;
  const learning = order.map((blockId) => {
    const pool = assignment.pools[blockId];
    if (!pool) throw new Error(`找不到实验块 ${blockId}。`);
    let trials = buildTrioTrials(pool.trio, config.learningRepsPerTrio, rng);
    if (config.quickLearningTrials) trials = trials.slice(0, config.quickLearningTrials);
    return { ...parseBlock(blockId), trials: numberTrials(trials) };
  });

  const transferModalities = assignment.ratingFacesFirst ? ["face", "word"] : ["word", "face"];
  const transfer = transferModalities.map((modality) => {
    const stimuli = assignment.stimuli.filter((item) => item.modality === modality);
    let trials = buildTrioTestTrials(stimuli, rng);
    if (config.quickTestTrials) trials = trials.slice(0, config.quickTestTrials);
    return { modality, trials: numberTrials(trials) };
  });

  return { rating: numberTrials(rating), learning, transfer };
}

export function scoreTrio(options, slot, samples, feedback) {
  const isTransfer = feedback === "none";
  const chosen = slot ? options[slot] : null;
  const means = SLOTS.map((side) => options[side].mean);
  const bestMean = Math.max(...means);
  const uniqueBest = means.filter((mean) => mean === bestMean).length === 1;
  const bestSlot = SLOTS.find((side) => options[side].mean === bestMean);
  const optimal = slot && uniqueBest ? (slot === bestSlot ? 1 : 0) : null;

  const rewards = {};
  const shown = {};
  for (const side of SLOTS) {
    rewards[side] = isTransfer ? null : samples[side];
    shown[side] = !isTransfer && slot && (feedback === "complete" || slot === side) ? 1 : 0;
  }
  const chosenReward = !slot || isTransfer ? null : rewards[slot].shown;
  const trios = SLOTS.map((side) => options[side].training_trio || "");
  const feedbacks = SLOTS.map((side) => options[side].feedback || "");
  const unchosen = SLOTS.filter((side) => side !== slot);

  const row = {
    choice_slot: slot,
    n_arms: 3,
    stim_left: options.left.id,
    stim_middle: options.middle.id,
    stim_right: options.right.id,
    chosen_id: chosen ? chosen.id : null,
    unchosen_ids: slot ? unchosen.map((side) => options[side].id).join("|") : "",
    chosen_mean: chosen ? chosen.mean : null,
    chosen_feedback: chosen ? chosen.feedback ?? "" : "",
    best_slot: uniqueBest ? bestSlot : "",
    best_id: uniqueBest ? options[bestSlot].id : "",
    mean_left: options.left.mean,
    mean_middle: options.middle.mean,
    mean_right: options.right.mean,
    emotion_left: options.left.emotion,
    emotion_middle: options.middle.emotion,
    emotion_right: options.right.emotion,
    label_left: options.left.label,
    label_middle: options.middle.label,
    label_right: options.right.label,
    feedback_left: options.left.feedback ?? "",
    feedback_middle: options.middle.feedback ?? "",
    feedback_right: options.right.feedback ?? "",
    training_trio_left: options.left.training_trio ?? "",
    training_trio_middle: options.middle.training_trio ?? "",
    training_trio_right: options.right.training_trio ?? "",
    same_feedback: feedbacks[0] && feedbacks.every((item) => item === feedbacks[0]) ? 1 : 0,
    trio_trained: trios[0] && trios.every((item) => item === trios[0]) ? 1 : 0,
    chosen_reward: chosenReward,
    optimal,
  };

  for (const side of SLOTS) {
    const sample = rewards[side];
    row[`reward_${side}_raw`] = sample ? sample.raw : null;
    row[`reward_${side}`] = sample ? sample.shown : null;
    row[`reward_${side}_clipped`] = sample ? (sample.clipped ? 1 : 0) : null;
    row[`reward_${side}_shown`] = shown[side];
  }
  return row;
}

export function mappingRows(stimuli) {
  return stimuli.map((stim) => ({
    stim_id: stim.id,
    modality: stim.modality,
    emotion: stim.emotion,
    label: stim.label,
    feedback: stim.feedback,
    mean: stim.mean,
    mean_ladder: stim.mean_ladder,
    training_trio: stim.training_trio,
    cohort_ids: stim.cohort_ids,
  }));
}

export function summarizeTrio(rows) {
  const choices = rows.filter((row) => row.event === "choice");
  const learning = choices.filter((row) => row.phase === "learning");
  const transfer = choices.filter((row) => row.phase === "transfer");
  const practice = choices.filter((row) => row.phase === "practice");
  const rating = rows.filter((row) => row.event === "rating" && row.phase === "rating");

  const accuracy = (list) => {
    const answered = list.filter((row) => row.optimal === 0 || row.optimal === 1);
    const optimal = answered.reduce((sum, row) => sum + row.optimal, 0);
    return {
      n: list.length,
      n_answered: answered.length,
      n_optimal: optimal,
      rate: answered.length ? optimal / answered.length : null,
    };
  };

  const flagsOk = (row, feedback) => {
    const sampled = SLOTS.every((side) => Number.isFinite(Number(row[`reward_${side}`])));
    if (!sampled || !SLOTS.includes(row.choice_slot)) return false;
    if (feedback === "complete") return SLOTS.every((side) => row[`reward_${side}_shown`] === 1);
    return SLOTS.every((side) => row[`reward_${side}_shown`] === (side === row.choice_slot ? 1 : 0));
  };

  const partialOk = learning.filter((row) => row.feedback === "partial").every((row) => flagsOk(row, "partial"));
  const completeOk = learning.filter((row) => row.feedback === "complete").every((row) => flagsOk(row, "complete"));
  const transferHidden = transfer.every((row) =>
    SLOTS.every(
      (side) =>
        (row[`reward_${side}`] === null || row[`reward_${side}`] === "") && row[`reward_${side}_shown`] === 0
    )
  );

  const blocks = {};
  for (const row of learning) {
    const key = row.block_id || "unknown";
    if (!blocks[key]) blocks[key] = { points: 0, rows: [] };
    blocks[key].rows.push(row);
    blocks[key].points += Number(row.chosen_reward) || 0;
  }
  for (const key of Object.keys(blocks)) {
    blocks[key] = { points: blocks[key].points, ...accuracy(blocks[key].rows) };
  }

  return {
    n_rating: rating.length,
    n_practice: practice.length,
    n_learning: learning.length,
    n_transfer: transfer.length,
    learning_points: learning.reduce((sum, row) => sum + (Number(row.chosen_reward) || 0), 0),
    partial_flags_ok: partialOk,
    complete_flags_ok: completeOk,
    transfer_rewards_hidden: transferHidden,
    transfer_trained: accuracy(transfer.filter((row) => row.trio_trained === 1)),
    transfer_novel: accuracy(transfer.filter((row) => row.trio_trained === 0)),
    blocks,
  };
}
