/**
 * 三臂任务的参数。正式施测时只改这个文件里的 CONFIG。
 *
 * means：每一组 3 个刺激的平均分，必须互不相同。
 * meanOffset：另一组反馈使用平移后的平均分，两组不能重叠。
 * rewardSD：所有刺激共用的标准差。单次分数从正态分布抽样，四舍五入后限制在 0–100。
 * learningRepsPerTrio：学习阶段同一组三张图重复的次数，正式实验用 6 的倍数，左右中位置才能平衡。
 *
 * 地址栏 ?demo=1 会缩短试次，只用于检查流程，不能当正式数据。
 * ?quick=1 更短，只给自动化检查用。
 */
export const CONFIG = {
  designVersion: 1,
  rewardSD: 10,
  means: [20, 50, 80],
  meanOffset: 10,
  rewardMin: 0,
  rewardMax: 100,
  learningRepsPerTrio: 18,
  practiceReps: 6,
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
    next.learningRepsPerTrio = 6;
    next.practiceReps = 3;
    next.feedbackMs = 500;
    next.fixationMs = 150;
    next.testAckMs = 280;
    next.quickTestTrials = 4;
  }
  if (params.has("quick")) {
    next.quick = true;
    next.learningRepsPerTrio = 1;
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
