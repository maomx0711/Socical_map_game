/**
 * 情绪评定 + 二臂老虎机。
 *
 * 1. 评定 8 张情绪面孔和 8 个情绪词的效价、唤醒度（1–9）。
 * 2. 面孔和词汇各自随机分成两组，分别进入部分反馈和完全反馈。
 *    每组 4 个刺激。两组使用错开的平均分（means 与 means+meanOffset），
 *    标准差都是 rewardSD。同一类材料里 8 个平均分互不相同。
 *    4 个刺激组成 2 个固定配对，学习阶段只重复这两个配对。
 *    每次奖励 ~ Normal(mean, sd)，四舍五入并限制在 0–100。
 *    部分反馈只显示所选分数；完全反馈两个分数都显示。只有所选分数计分。
 *    未显示的分数仍会写入数据，字段 reward_*_shown 标明被试是否看见。
 * 3. 测验无反馈。同一类材料的全部两两组合各出现一次，左右位置随机。
 *    其中包含学习过的配对，也包含没一起出现过的新配对。
 *
 * 价值分配由被试编号决定，同一编号每次打开都得到同一套平均分和配对。
 * 试次顺序和每次抽出的分数不由编号决定。
 * 改动下面随机数的消耗顺序时，把 config.designVersion 加一。
 */

export const BLOCK_IDS = ["face-partial", "face-complete", "word-partial", "word-complete"];

export const MODALITY_LABEL = {
  face: "情绪面孔",
  word: "情绪词",
  shape: "几何图形",
};

export const FEEDBACK_LABEL = {
  partial: "只显示所选项的分数",
  complete: "两个选项的分数都显示",
  none: "不显示分数",
};

export const DIMENSIONS = {
  valence: {
    key: "valence",
    title: "效价",
    question: "这张材料让你感到有多消极或积极？",
    low: "非常消极",
    high: "非常积极",
  },
  arousal: {
    key: "arousal",
    title: "唤醒度",
    question: "这张材料让你感到有多平静或激动？",
    low: "非常平静",
    high: "非常激动",
  },
};

export function hashString(str) {
  let hash = 2166136261;
  const text = String(str);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return function rng() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFromId(participantId) {
  return mulberry32(hashString(participantId));
}

export function shuffle(array, rng = Math.random) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function permutations(items) {
  if (items.length <= 1) return [items.slice()];
  const result = [];
  for (let i = 0; i < items.length; i += 1) {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const perm of permutations(rest)) result.push([items[i], ...perm]);
  }
  return result;
}

export function sampleGaussian(mean, sd, rng = Math.random, limits = { min: 0, max: 100 }) {
  if (!(sd > 0)) throw new Error("标准差必须大于 0。");
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  const raw = mean + z * sd;
  const rounded = Math.round(raw);
  const shown = Math.min(limits.max, Math.max(limits.min, rounded));
  return { raw, shown, clipped: shown !== rounded };
}

export function parseBlock(blockId) {
  const [modality, feedback] = String(blockId).split("-");
  if (!MODALITY_LABEL[modality] || !FEEDBACK_LABEL[feedback]) {
    throw new Error(`无法识别的实验块：${blockId}`);
  }
  return { modality, feedback, blockId };
}

export function meanLadders(config) {
  const base = config.means.slice();
  const offset = base.map((mean) => mean + config.meanOffset);
  if (new Set(base).size !== base.length || new Set([...base, ...offset]).size !== base.length + offset.length) {
    throw new Error("两套平均分必须各自不同，而且不能重叠。");
  }
  if (offset.some((mean) => mean < config.rewardMin || mean > config.rewardMax)) {
    throw new Error("平移后的平均分超出了可显示的分数范围。");
  }
  return { base, offset };
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

function attachPairs(stimuli, blockId, rng) {
  if (stimuli.length < 2 || stimuli.length % 2 !== 0) {
    throw new Error("每组刺激数量必须是不小于 2 的偶数，才能组成刺激对。");
  }
  const order = shuffle(stimuli, rng);
  const pairs = [];
  for (let i = 0; i < order.length; i += 2) {
    const left = order[i];
    const right = order[i + 1];
    const pairId = `${blockId}-${pairs.length + 1}`;
    left.training_pair = pairId;
    right.training_pair = pairId;
    left.partner_id = right.id;
    right.partner_id = left.id;
    pairs.push([left, right]);
  }
  return { stimuli, pairs };
}

export function buildAssignment(participantId, stimuli, config, rng = rngFromId(participantId)) {
  const faces = stimuli.filter((item) => item.modality === "face");
  const words = stimuli.filter((item) => item.modality === "word");
  if (faces.length !== words.length || faces.length < 2 || faces.length % 2 !== 0) {
    throw new Error("面孔和词汇的数量必须相同，且为不小于 2 的偶数。");
  }
  const half = faces.length / 2;
  const ladders = meanLadders(config);
  if (ladders.base.length !== half) {
    throw new Error(`means 需要 ${half} 个平均分，当前是 ${ladders.base.length} 个。`);
  }

  const splitModality = (items, modality) => {
    const ordered = shuffle(items, rng);
    const partialLadder = rng() < 0.5 ? "offset" : "base";
    const partialMeans = shuffle(partialLadder === "base" ? ladders.base : ladders.offset, rng);
    const completeMeans = shuffle(partialLadder === "base" ? ladders.offset : ladders.base, rng);
    const partial = ordered.slice(0, half).map((item, index) =>
      copyStim(item, { feedback: "partial", mean: partialMeans[index], mean_ladder: partialLadder })
    );
    const completeLadder = partialLadder === "base" ? "offset" : "base";
    const complete = ordered.slice(half).map((item, index) =>
      copyStim(item, { feedback: "complete", mean: completeMeans[index], mean_ladder: completeLadder })
    );
    return {
      partial: attachPairs(partial, `${modality}-partial`, rng),
      complete: attachPairs(complete, `${modality}-complete`, rng),
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
  const orders = permutations(BLOCK_IDS);
  const blockOrder = orders[Math.floor(rng() * orders.length)];

  return {
    participantId: String(participantId),
    seed: hashString(participantId),
    blockOrder,
    ratingFacesFirst: rng() < 0.5,
    valenceFirst: rng() < 0.5,
    pools,
    stimuli: BLOCK_IDS.flatMap((id) => pools[id].stimuli),
  };
}

export function buildPairTrials(pairs, reps, rng = Math.random) {
  if (!Number.isInteger(reps) || reps < 1) throw new Error("重复次数必须是正整数。");
  const trials = [];
  pairs.forEach((pair, pairIndex) => {
    for (let rep = 0; rep < reps; rep += 1) {
      const swap = rep % 2 === 1;
      trials.push({
        left: swap ? pair[1] : pair[0],
        right: swap ? pair[0] : pair[1],
        pairIndex,
        pairRep: rep + 1,
      });
    }
  });
  return shuffle(trials, rng);
}

export function buildTestTrials(stimuli, rng = Math.random) {
  const trials = [];
  for (let i = 0; i < stimuli.length; i += 1) {
    for (let j = i + 1; j < stimuli.length; j += 1) {
      const swap = rng() < 0.5;
      trials.push({
        left: swap ? stimuli[j] : stimuli[i],
        right: swap ? stimuli[i] : stimuli[j],
        pairIndex: null,
        pairRep: null,
      });
    }
  }
  return shuffle(trials, rng);
}

export function buildRatingSequence(assignment, rng = Math.random) {
  const faces = shuffle(
    assignment.stimuli.filter((item) => item.modality === "face"),
    rng
  );
  const words = shuffle(
    assignment.stimuli.filter((item) => item.modality === "word"),
    rng
  );
  const groups = assignment.ratingFacesFirst ? [faces, words] : [words, faces];
  const dimensions = assignment.valenceFirst ? ["valence", "arousal"] : ["arousal", "valence"];
  const sequence = [];
  for (const group of groups) {
    for (const stim of group) {
      for (const dimension of dimensions) sequence.push({ stim, dimension });
    }
  }
  return sequence;
}

export function limitRating(sequence, perModality) {
  const seen = { face: new Set(), word: new Set() };
  const keep = new Set();
  for (const item of sequence) {
    const bucket = seen[item.stim.modality];
    if (!bucket) continue;
    if (bucket.size < perModality || bucket.has(item.stim.id)) {
      bucket.add(item.stim.id);
      keep.add(item.stim.id);
    }
  }
  return sequence.filter((item) => keep.has(item.stim.id));
}

export function numberTrials(trials) {
  return trials.map((trial, index) => ({
    ...trial,
    trialN: index + 1,
    trialTotal: trials.length,
  }));
}

export function assembleSession(assignment, config, rng = Math.random) {
  let rating = buildRatingSequence(assignment, rng);
  if (config.quickRatingPerModality) {
    rating = limitRating(rating, config.quickRatingPerModality);
  }

  const order = config.forceBlockOrder ?? assignment.blockOrder;
  const learning = order.map((blockId) => {
    const pool = assignment.pools[blockId];
    if (!pool) throw new Error(`找不到实验块 ${blockId}。`);
    let trials = buildPairTrials(pool.pairs, config.learningRepsPerPair, rng);
    if (config.quickLearningTrials) trials = trials.slice(0, config.quickLearningTrials);
    return { ...parseBlock(blockId), trials: numberTrials(trials) };
  });

  const testModalities = assignment.ratingFacesFirst ? ["face", "word"] : ["word", "face"];
  const test = testModalities.map((modality) => {
    const stimuli = assignment.stimuli.filter((item) => item.modality === modality);
    let trials = buildTestTrials(stimuli, rng);
    if (config.quickTestTrials) trials = trials.slice(0, config.quickTestTrials);
    return { modality, trials: numberTrials(trials) };
  });

  return { rating: numberTrials(rating), learning, test };
}

export function sideFromKey(key) {
  const value = String(key ?? "").toLowerCase();
  if (value === "f") return "left";
  if (value === "j") return "right";
  return null;
}

export function scoreChoice(left, right, side, sampleLeft, sampleRight, feedback) {
  const chosen = side === "left" ? left : right;
  const unchosen = side === "left" ? right : left;
  const isTest = feedback === "none";
  const rewardLeft = isTest ? null : sampleLeft;
  const rewardRight = isTest ? null : sampleRight;
  const chosenReward =
    !side || isTest ? null : side === "left" ? rewardLeft.shown : rewardRight.shown;
  const showLeft = Boolean(!isTest && side && (feedback === "complete" || side === "left"));
  const showRight = Boolean(!isTest && side && (feedback === "complete" || side === "right"));
  let optimal = null;
  if (side && chosen.mean !== unchosen.mean) optimal = chosen.mean > unchosen.mean ? 1 : 0;

  return {
    choice_side: side,
    stim_left: left.id,
    stim_right: right.id,
    chosen_id: side ? chosen.id : null,
    unchosen_id: side ? unchosen.id : null,
    chosen_mean: side ? chosen.mean : null,
    unchosen_mean: side ? unchosen.mean : null,
    mean_left: left.mean,
    mean_right: right.mean,
    emotion_left: left.emotion,
    emotion_right: right.emotion,
    label_left: left.label,
    label_right: right.label,
    feedback_left: left.feedback ?? "",
    feedback_right: right.feedback ?? "",
    training_pair_left: left.training_pair ?? "",
    training_pair_right: right.training_pair ?? "",
    same_feedback: left.feedback && left.feedback === right.feedback ? 1 : 0,
    pair_trained: left.partner_id && left.partner_id === right.id ? 1 : 0,
    reward_left_raw: rewardLeft ? rewardLeft.raw : null,
    reward_right_raw: rewardRight ? rewardRight.raw : null,
    reward_left: rewardLeft ? rewardLeft.shown : null,
    reward_right: rewardRight ? rewardRight.shown : null,
    reward_left_clipped: rewardLeft ? (rewardLeft.clipped ? 1 : 0) : null,
    reward_right_clipped: rewardRight ? (rewardRight.clipped ? 1 : 0) : null,
    reward_left_shown: showLeft ? 1 : 0,
    reward_right_shown: showRight ? 1 : 0,
    chosen_reward: chosenReward,
    optimal,
  };
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
    partner_id: stim.partner_id,
    training_pair: stim.training_pair,
  }));
}

export function summarize(rows) {
  const choices = rows.filter((row) => row.event === "choice");
  const learning = choices.filter((row) => row.phase === "learning");
  const test = choices.filter((row) => row.phase === "test");
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

  const partialOk = learning
    .filter((row) => row.feedback === "partial")
    .every((row) => shownFlagsOk(row, "partial"));
  const completeOk = learning
    .filter((row) => row.feedback === "complete")
    .every((row) => shownFlagsOk(row, "complete"));
  const testHidden = test.every(
    (row) =>
      (row.reward_left === null || row.reward_left === "") &&
      (row.reward_right === null || row.reward_right === "") &&
      row.reward_left_shown === 0 &&
      row.reward_right_shown === 0
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
    n_test: test.length,
    learning_points: learning.reduce((sum, row) => sum + (Number(row.chosen_reward) || 0), 0),
    partial_flags_ok: partialOk,
    complete_flags_ok: completeOk,
    test_rewards_hidden: testHidden,
    test_trained: accuracy(test.filter((row) => row.pair_trained === 1)),
    test_novel: accuracy(test.filter((row) => row.pair_trained === 0)),
    blocks,
  };
}

function shownFlagsOk(row, feedback) {
  const sampled =
    Number.isFinite(Number(row.reward_left)) && Number.isFinite(Number(row.reward_right));
  if (!sampled || (row.choice_side !== "left" && row.choice_side !== "right")) return false;
  if (feedback === "complete") return row.reward_left_shown === 1 && row.reward_right_shown === 1;
  if (row.choice_side === "left") return row.reward_left_shown === 1 && row.reward_right_shown === 0;
  return row.reward_right_shown === 1 && row.reward_left_shown === 0;
}

export function safeFilePart(value) {
  const cleaned = String(value)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return cleaned || "participant";
}
