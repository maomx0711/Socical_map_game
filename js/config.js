/**
 * 实验参数。正式施测时只改这个文件里的 CONFIG。
 *
 * means：每一组 4 个刺激的平均分，必须和组大小一致且互不相同。
 * rewardSD：所有刺激共用的标准差。单次分数从正态分布抽样，四舍五入后限制在 0–100。
 * learningRepsPerPair：学习阶段每一对重复的次数。每组 4 个刺激会组成 2 对。
 *
 * 地址栏 ?demo=1 会缩短试次，只用于检查流程，不能当正式数据。
 * ?quick=1 更短，只给自动化检查用。
 */
export const CONFIG = {
  designVersion: 2,
  rewardSD: 10,
  // 同一类材料用两套错开的平均分，部分反馈和完全反馈各拿一套。
  // 8 个平均分互不相同，测验里任意两张图都有更高的一边。
  means: [20, 40, 60, 80],
  meanOffset: 10,
  rewardMin: 0,
  rewardMax: 100,
  learningRepsPerPair: 16,
  practiceReps: 4,
  feedbackMs: 1700,
  fixationMs: 450,
  testAckMs: 700,
  ratingMin: 1,
  ratingMax: 9,
  quickRatingPerModality: 0,
  quickLearningTrials: 0,
  quickTestTrials: 0,
  forceBlockOrder: null,
  demo: false,
  quick: false,
};

export function applyRunMode(config, params) {
  const next = {
    ...config,
    means: config.means.slice(),
    forceBlockOrder: config.forceBlockOrder ? config.forceBlockOrder.slice() : null,
  };
  if (params.has("demo") || params.has("quick")) {
    next.demo = true;
    next.learningRepsPerPair = 2;
    next.practiceReps = 2;
    next.feedbackMs = 500;
    next.fixationMs = 150;
    next.testAckMs = 280;
    next.quickTestTrials = 4;
  }
  if (params.has("quick")) {
    next.quick = true;
    next.learningRepsPerPair = 1;
    next.practiceReps = 1;
    next.feedbackMs = 700;
    next.fixationMs = 120;
    next.testAckMs = 500;
    next.quickRatingPerModality = 1;
    next.quickLearningTrials = 1;
    next.quickTestTrials = 1;
    next.forceBlockOrder = ["face-partial", "word-complete"];
  }
  return next;
}
