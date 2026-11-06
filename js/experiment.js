import { applyRunMode, CONFIG } from "./config.js";
import {
  FEEDBACK_LABEL,
  MODALITY_LABEL,
  assembleSession,
  buildAssignment,
  buildPairTrials,
  mappingRows,
  numberTrials,
  rngFromId,
  safeFilePart,
  sampleGaussian,
  scoreChoice,
  sideFromKey,
  summarize,
} from "./design.js";
import {
  escapeHtml,
  phaseLabel,
  ratingPrompt,
  renderBackupNotice,
  renderChoice,
  renderEnd,
  renderFixation,
  renderGallery,
  renderGate,
  renderOutcome,
  renderProse,
  renderQuizRetry,
  renderRating,
} from "./render.js";
import { createLibrary } from "./stimuli.js";

const params = new URLSearchParams(location.search);
const config = applyRunMode(CONFIG, params);
const library = createLibrary();
const app = document.querySelector("#app");
const session = {
  score: 0,
  current: null,
  outcome: null,
  quizOk: false,
  quizFails: 0,
  participantId: "",
};

const QUIZ = [
  {
    prompt: "选择左边的图片，应该按哪个键？",
    name: "left_key",
    options: ["J", "F", "空格"],
    required: true,
    correct: "F",
  },
  {
    prompt: "在「只显示所选项」的阶段，没选的那张图片会显示分数吗？",
    name: "partial",
    options: ["会显示", "不会显示", "只显示零分"],
    required: true,
    correct: "不会显示",
  },
  {
    prompt: "在「两个分数都显示」的阶段，没选中的分数会计入总分吗？",
    name: "both",
    options: ["会计入", "不会计入", "只计入一半"],
    required: true,
    correct: "不会计入",
  },
  {
    prompt: "同一张图片每次出现的分数会怎样？",
    name: "noise",
    options: ["每次都完全一样", "在它的固定价值附近波动", "完全随机，没有规律"],
    required: true,
    correct: "在它的固定价值附近波动",
  },
  {
    prompt: "最后的测验阶段会显示分数吗？",
    name: "test",
    options: ["会显示两个分数", "只显示所选分数", "不显示分数"],
    required: true,
    correct: "不显示分数",
  },
  {
    prompt: "你选择时的目标是什么？",
    name: "goal",
    options: ["选择看起来更愉快的图片", "选择价值最高的图片", "左右轮流按"],
    required: true,
    correct: "选择价值最高的图片",
  },
];

function requiredGlobals() {
  return [
    "initJsPsych",
    "jsPsychHtmlKeyboardResponse",
    "jsPsychHtmlButtonResponse",
    "jsPsychHtmlSliderResponse",
    "jsPsychSurveyMultiChoice",
    "jsPsychCallFunction",
  ].filter((name) => typeof window[name] === "undefined");
}

function backupKey(id) {
  return `affective-bandit-backup:${id}`;
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function stamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function showBanner() {
  if (!config.demo || document.querySelector(".demo-banner")) return;
  const banner = document.createElement("div");
  banner.className = "demo-banner";
  banner.textContent = config.quick
    ? "快速检查模式：试次极少，不能当作正式数据。"
    : "预览模式：试次已缩短，不能当作正式数据。正式实验请去掉地址中的 demo。";
  document.body.prepend(banner);
}

function infoScreen(html, tag, button = "继续") {
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus: html,
    choices: [button],
    data: { event: "instruction" },
    on_finish(data) {
      data.stimulus = tag;
    },
  };
}

function bindLiveRating() {
  const slider = document.querySelector("#jspsych-html-slider-response-response");
  const live = document.querySelector("#live-rating");
  const button = document.querySelector("#jspsych-html-slider-response-next");
  if (!slider) return;
  const sync = () => {
    if (live) live.textContent = String(slider.value);
  };
  slider.addEventListener("input", () => {
    sync();
    if (button) button.disabled = false;
  });
  sync();
}

function makeRatingTrial(jsPsych, phase) {
  return {
    type: jsPsychHtmlSliderResponse,
    stimulus() {
      const stim = session.byId[jsPsych.evaluateTimelineVariable("stim_id")];
      const dimension = jsPsych.evaluateTimelineVariable("dimension");
      return renderRating({
        stim,
        dimension,
        phase,
        modality: stim.modality,
        trialN: jsPsych.evaluateTimelineVariable("trial_n"),
        trialTotal: jsPsych.evaluateTimelineVariable("trial_total"),
      });
    },
    prompt() {
      return ratingPrompt(jsPsych.evaluateTimelineVariable("dimension"));
    },
    labels: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    min: config.ratingMin,
    max: config.ratingMax,
    slider_start: 5,
    step: 1,
    slider_width: 560,
    require_movement: true,
    button_label: "确认",
    on_load: bindLiveRating,
    data: {
      event: "rating",
      stim_id: jsPsych.timelineVariable("stim_id"),
      dimension: jsPsych.timelineVariable("dimension"),
      trial_n: jsPsych.timelineVariable("trial_n"),
      trial_total: jsPsych.timelineVariable("trial_total"),
    },
    on_finish(data) {
      const stim = session.byId[data.stim_id];
      data.rating = data.response;
      data.emotion = stim.emotion;
      data.label = stim.label;
      data.modality = stim.modality;
      data.learning_feedback = stim.feedback ?? "";
      data.mean = stim.mean ?? "";
      data.stimulus = stim.id;
    },
  };
}

function ratingVariables(trials) {
  return trials.map((trial) => ({
    stim_id: trial.stim.id,
    dimension: trial.dimension,
    trial_n: trial.trialN,
    trial_total: trial.trialTotal,
  }));
}

function decisionVariables(trials) {
  return trials.map((trial) => ({
    left_id: trial.left.id,
    right_id: trial.right.id,
    trial_n: trial.trialN,
    trial_total: trial.trialTotal,
    pair_rep: trial.pairRep ?? "",
  }));
}

function makeDecisionTimeline(jsPsych, spec) {
  const choice = {
    type: jsPsychHtmlKeyboardResponse,
    choices: ["f", "j"],
    stimulus() {
      const left = session.byId[jsPsych.evaluateTimelineVariable("left_id")];
      const right = session.byId[jsPsych.evaluateTimelineVariable("right_id")];
      const view = {
        left,
        right,
        phaseLabel: phaseLabel(spec.phase, spec.modality),
        conditionLabel: FEEDBACK_LABEL[spec.feedback],
        trialN: jsPsych.evaluateTimelineVariable("trial_n"),
        trialTotal: jsPsych.evaluateTimelineVariable("trial_total"),
        showScore: spec.phase !== "test",
        score: session.score,
        ask: spec.phase === "test" ? "请选择你认为价值最高的一个" : "请选择价值最高的一个",
      };
      session.current = {
        left,
        right,
        phase: spec.phase,
        feedback: spec.feedback,
        modality: spec.modality,
        trialN: view.trialN,
        trialTotal: view.trialTotal,
        pairRep: jsPsych.evaluateTimelineVariable("pair_rep"),
      };
      return renderChoice(view);
    },
    data: {
      event: "choice",
      trial_n: jsPsych.timelineVariable("trial_n"),
      trial_total: jsPsych.timelineVariable("trial_total"),
      pair_rep: jsPsych.timelineVariable("pair_rep"),
    },
    on_finish(data) {
      const current = session.current;
      const side = sideFromKey(data.response);
      const limits = { min: config.rewardMin, max: config.rewardMax };
      const sampleLeft =
        spec.feedback === "none"
          ? null
          : sampleGaussian(current.left.mean, config.rewardSD, Math.random, limits);
      const sampleRight =
        spec.feedback === "none"
          ? null
          : sampleGaussian(current.right.mean, config.rewardSD, Math.random, limits);
      const scored = scoreChoice(current.left, current.right, side, sampleLeft, sampleRight, spec.feedback);
      if (scored.chosen_reward !== null) session.score += scored.chosen_reward;
      session.outcome = scored;
      Object.assign(data, scored, { pair_rep: current.pairRep ?? "", stimulus: `${current.left.id}|${current.right.id}` });
    },
  };

  const outcome = {
    type: jsPsychHtmlKeyboardResponse,
    choices: "NO_KEYS",
    trial_duration: spec.phase === "test" ? config.testAckMs : config.feedbackMs,
    stimulus() {
      const current = session.current;
      const outcomeData = session.outcome;
      return renderOutcome({
        left: current.left,
        right: current.right,
        phaseLabel: phaseLabel(current.phase, current.modality),
        conditionLabel: FEEDBACK_LABEL[current.feedback],
        trialN: current.trialN,
        trialTotal: current.trialTotal,
        showScore: current.phase !== "test",
        score: session.score,
        mode: current.feedback === "none" ? "ack" : current.feedback,
        choice: outcomeData.choice_side,
        rewardLeft: outcomeData.reward_left,
        rewardRight: outcomeData.reward_right,
        chosenReward: outcomeData.chosen_reward,
      });
    },
    data: {
      event: spec.phase === "test" ? "ack" : "feedback",
      trial_n: jsPsych.timelineVariable("trial_n"),
    },
    on_finish(data) {
      data.stimulus = data.event;
    },
  };

  const fixation = {
    type: jsPsychHtmlKeyboardResponse,
    stimulus: renderFixation(),
    choices: "NO_KEYS",
    trial_duration: config.fixationMs,
    data: {
      event: "fixation",
      trial_n: jsPsych.timelineVariable("trial_n"),
    },
    on_finish(data) {
      data.stimulus = "+";
    },
  };

  return {
    timeline: [fixation, choice, outcome],
    timeline_variables: decisionVariables(spec.trials),
    data: {
      phase: spec.phase,
      block_id: spec.blockId,
      modality: spec.modality,
      feedback: spec.feedback,
    },
  };
}

function resetScoreOnFinish(screen) {
  const original = screen.on_finish;
  screen.on_finish = (data) => {
    session.score = 0;
    original(data);
  };
  return screen;
}

function blockIntro(block) {
  const material = block.modality === "face" ? "两张情绪面孔" : "两个情绪词";
  const feedbackLine =
    block.feedback === "partial"
      ? "这一部分只显示你选中的那张图的分数，另一张不显示。"
      : "这一部分两张图的分数都会显示。";
  return infoScreen(
    renderProse({
    kicker: `学习 ${block.index} / ${block.total}`,
    title: `${block.modality === "face" ? "情绪面孔" : "情绪词"}`,
    paragraphs: [
      feedbackLine,
      `屏幕上每次出现${material}。本部分共 ${block.trials.length} 次，由固定的两对图片反复出现。`,
        "只有你选中的分数会计入这部分得分。按 <kbd>F</kbd> 选左边，按 <kbd>J</kbd> 选右边。",
        "每张图的价值是固定的，单次分数会在这个价值附近波动。请选择价值最高的一张。价值和表情或词义没有固定关系，请根据看到的分数学习。",
      ],
    }),
    `intro-${block.blockId}`,
    "开始这一部分"
  );
}

function restScreen(block) {
  return {
    type: jsPsychHtmlButtonResponse,
    stimulus() {
      return renderProse({
        kicker: "这部分结束",
        title: block.modality === "face" ? "情绪面孔" : "情绪词",
        paragraphs: [`本部分得分：<strong>${session.score}</strong>`, "可以稍作休息，准备好后继续。"],
      });
    },
    choices: ["继续"],
    data: { event: "instruction" },
    on_finish(data) {
      data.stimulus = `rest-${block.blockId}`;
      data.block_score = session.score;
    },
  };
}

function buildTimeline(jsPsych, assignment, plan) {
  const dimensions = assignment.valenceFirst ? ["valence", "arousal"] : ["arousal", "valence"];
  const practiceRating = numberTrials(
    dimensions.map((dimension) => ({ stim: library.practice.example, dimension }))
  );
  const practicePartial = numberTrials(buildPairTrials(library.practice.partial, config.practiceReps));
  const practiceComplete = numberTrials(buildPairTrials(library.practice.complete, config.practiceReps));

  const welcome = infoScreen(
    renderProse({
      kicker: "欢迎",
      title: "情绪与价值学习",
      paragraphs: [
        `你的编号是 <strong>${escapeHtml(assignment.participantId)}</strong>。整个实验大约 25 分钟，请独立完成，不要刷新或关闭页面。`,
      ],
      items: [
        "第一部分评定情绪面孔和情绪词。",
        "第二部分在二选一中学习每张图的价值。",
        "第三部分不再出现分数，请选择价值最高的一个。",
      ],
    }),
    "welcome",
    "继续"
  );

  const fullscreen = {
    type: jsPsychHtmlButtonResponse,
    stimulus: renderProse({
      kicker: "开始前",
      title: "尽量保持全屏",
      paragraphs: ["全屏可以减少周围内容的干扰。如果浏览器不允许，也可以在窗口中继续。"],
    }),
    choices: ["全屏并继续", "在窗口中继续"],
    data: { event: "instruction" },
    on_finish(data) {
      data.stimulus = "fullscreen";
      data.fullscreen_requested = data.response === 0 ? 1 : 0;
      if (data.response === 0) {
        try {
          document.documentElement.requestFullscreen?.().catch(() => {});
        } catch {
          // 浏览器拒绝全屏时继续在窗口中进行。
        }
      }
    },
  };

  const ratingIntro = infoScreen(
    renderProse({
      kicker: "第一部分",
      title: "情绪评定",
      paragraphs: [
        "你会逐张看到情绪面孔和情绪词。每张材料评定两次，没有对错，按第一感觉作答。",
        "滑块从中间开始。请拨动或点一下滑块后再按确认；如果感受正好是 5，点一下滑块即可。",
      ],
      items: [
        "<strong>效价</strong>：从 1（非常消极）到 9（非常积极）。",
        "<strong>唤醒度</strong>：从 1（非常平静）到 9（非常激动）。",
      ],
    }),
    "rating-intro"
  );

  const ratingPracticeIntro = infoScreen(
    renderProse({
      kicker: "练习",
      title: "先评定一次示例",
      paragraphs: ["下面这张卡片不进入正式数据。熟悉滑块后就开始正式评定。"],
    }),
    "rating-practice-intro",
    "开始练习"
  );

  const ratingStart = infoScreen(
    renderProse({
      kicker: "正式评定",
      title: assignment.ratingFacesFirst ? "先看情绪面孔" : "先看情绪词",
      paragraphs: [`共 ${plan.rating.length} 次评定。面孔和词汇会分成两段，每张材料连续做两个评分。`],
    }),
    "rating-start"
  );

  const learningIntro = infoScreen(
    renderProse({
      kicker: "第二部分",
      title: "学习每张图的价值",
      paragraphs: [
        "每次屏幕左右各出现一张图。每张图都有一个固定的价值，也就是它的平均分。你看到的单次分数会在这个价值附近上下波动，所有图片的波动幅度相同。",
        "有的部分只显示你选中的分数，有的部分两个分数都显示。无论哪一种，只有选中的分数计入得分。",
      ],
      items: [
        "按 <kbd>F</kbd> 选择左边，按 <kbd>J</kbd> 选择右边。看清两张图后再按，松手后再做下一次。",
        "目标是选择价值最高的那一张。价值是预先设定的，和表情好不好、词语积极不积极没有固定关系。",
        "先用几何图形练习按键和两种反馈，练习分数不计入成绩。",
      ],
    }),
    "learning-intro"
  );

  const practicePartialIntro = infoScreen(
    renderProse({
      kicker: "练习",
      title: "只显示所选项的分数",
      paragraphs: ["下面是两个几何图形。选出一个之后，只会出现它的分数。请从分数里判断哪一个价值最高。"],
    }),
    "practice-partial-intro",
    "开始练习"
  );

  const practiceCompleteIntro = infoScreen(
    renderProse({
      kicker: "练习",
      title: "两个分数都显示",
      paragraphs: ["换成另外两个图形。选出之后，两张图的分数都会出现，但只有你选中的分数计入练习得分。"],
    }),
    "practice-complete-intro",
    "继续练习"
  );

  const quiz = {
    type: jsPsychSurveyMultiChoice,
    preamble: "<div class=\"prose\"><p class=\"kicker\">确认规则</p><h1>全部答对后进入正式学习</h1></div>",
    questions: QUIZ.map(({ prompt, name, options, required }) => ({ prompt, name, options, required })),
    button_label: "提交",
    randomize_question_order: false,
    simulation_options: {
      data: {
        response: Object.fromEntries(QUIZ.map((question) => [question.name, question.correct])),
        rt: 400,
      },
    },
    data: { event: "quiz" },
    on_finish(data) {
      const wrong = QUIZ.filter((question) => data.response?.[question.name] !== question.correct);
      session.quizOk = wrong.length === 0;
      if (!session.quizOk) session.quizFails += 1;
      data.quiz_passed = session.quizOk ? 1 : 0;
      data.quiz_fails = session.quizFails;
      data.stimulus = "quiz";
    },
  };

  const quizRetry = {
    conditional_function() {
      return !session.quizOk;
    },
    timeline: [
      {
        type: jsPsychHtmlButtonResponse,
        stimulus() {
          return renderQuizRetry({ reveal: session.quizFails >= 2 });
        },
        choices: ["再答一次"],
        data: { event: "instruction" },
        on_finish(data) {
          data.stimulus = "quiz-retry";
        },
      },
    ],
  };

  const quizLoop = {
    timeline: [quiz, quizRetry],
    loop_function() {
      if (session.quizOk) return false;
      if (session.quizFails >= 8) return false;
      return true;
    },
  };

  const testIntro = infoScreen(
    renderProse({
      kicker: "第三部分",
      title: "没有反馈的测验",
      paragraphs: [
        "接下来不再显示任何分数，得分也不会变化。",
        "同一类图片会被重新随机配对，其中有些组合是你在学习阶段没有一起见过的。",
        "请选择你认为价值最高的那一张，尽量又快又准。按 <kbd>F</kbd> 或 <kbd>J</kbd>。",
      ],
    }),
    "test-intro",
    "进入测验"
  );

  const timeline = [
    welcome,
    fullscreen,
    ratingIntro,
    ratingPracticeIntro,
    {
      timeline: [makeRatingTrial(jsPsych, "practice")],
      timeline_variables: ratingVariables(practiceRating),
      data: { phase: "practice" },
    },
    ratingStart,
    {
      timeline: [makeRatingTrial(jsPsych, "rating")],
      timeline_variables: ratingVariables(plan.rating),
      data: { phase: "rating" },
    },
    learningIntro,
    resetScoreOnFinish(practicePartialIntro),
    makeDecisionTimeline(jsPsych, {
      phase: "practice",
      blockId: "practice-partial",
      modality: "shape",
      feedback: "partial",
      trials: practicePartial,
    }),
    resetScoreOnFinish(practiceCompleteIntro),
    makeDecisionTimeline(jsPsych, {
      phase: "practice",
      blockId: "practice-complete",
      modality: "shape",
      feedback: "complete",
      trials: practiceComplete,
    }),
    quizLoop,
    {
      type: jsPsychCallFunction,
      func() {
        session.score = 0;
        return mappingRows(assignment.stimuli);
      },
      data: { event: "mapping" },
      on_finish(data) {
        data.mapping_json = JSON.stringify(data.value);
        delete data.value;
        data.stimulus = "mapping";
      },
    },
  ];

  plan.learning.forEach((block, index) => {
    const intro = resetScoreOnFinish(
      blockIntro({ ...block, index: index + 1, total: plan.learning.length })
    );
    timeline.push(intro);
    timeline.push(
      makeDecisionTimeline(jsPsych, {
        phase: "learning",
        blockId: block.blockId,
        modality: block.modality,
        feedback: block.feedback,
        trials: block.trials,
      })
    );
    timeline.push(restScreen(block));
  });

  timeline.push(testIntro);
  plan.test.forEach((block, index) => {
    if (index > 0) {
      timeline.push(
        infoScreen(
          renderProse({
            kicker: "测验",
            title: block.modality === "face" ? "接下来是情绪面孔" : "接下来是情绪词",
            paragraphs: ["配对已重新打乱。请选择价值最高的一个，没有分数反馈。"],
          }),
          `test-switch-${block.modality}`
        )
      );
    }
    timeline.push(
      makeDecisionTimeline(jsPsych, {
        phase: "test",
        blockId: `test-${block.modality}`,
        modality: block.modality,
        feedback: "none",
        trials: block.trials,
      })
    );
  });

  return timeline;
}

function showEnd(jsPsych) {
  const rows = jsPsych.data.get().values();
  const summary = summarize(rows);
  const blockLines = Object.entries(summary.blocks).map(([blockId, block]) => {
    const [modality, feedback] = blockId.split("-");
    const name = `${MODALITY_LABEL[modality] || blockId} · ${FEEDBACK_LABEL[feedback] || feedback}`;
    return `${name}：${block.points} 分`;
  });
  const root = jsPsych.getDisplayElement();
  root.innerHTML = renderEnd({
    participantId: session.participantId,
    points: summary.learning_points,
    blockLines,
    demo: config.demo,
  });
  const filename = `affective-bandit_${safeFilePart(session.participantId)}_${stamp()}`;
  document.querySelector("#save-csv").addEventListener("click", () => {
    jsPsych.data.get().localSave("csv", `${filename}.csv`);
  });
  document.querySelector("#save-json").addEventListener("click", () => {
    jsPsych.data.get().localSave("json", `${filename}.json`);
  });
  try {
    localStorage.setItem(backupKey(session.participantId), jsPsych.data.get().json());
  } catch {
    // 浏览器拒绝写入时，被试仍可手动下载。
  }
}

function start(participantId) {
  session.participantId = participantId;
  const assignment = buildAssignment(participantId, library.stimuli, config, rngFromId(participantId));
  const plan = assembleSession(assignment, config);
  session.byId = Object.fromEntries(
    [...assignment.stimuli, ...library.practice.partial.flat(), ...library.practice.complete.flat(), library.practice.example].map(
      (stim) => [stim.id, stim]
    )
  );

  app.innerHTML = `<div id="experiment"></div>`;
  showBanner();
  let finished = false;
  const simulating = params.has("simulate");
  const jsPsych = initJsPsych({
    display_element: "experiment",
    show_progress_bar: true,
    auto_update_progress_bar: true,
    message_progress_bar: "实验进度",
    on_close(event) {
      if (!finished) {
        event.preventDefault();
        event.returnValue = "";
      }
    },
    on_data_update() {
      if (finished || simulating) return;
      try {
        localStorage.setItem(backupKey(participantId), jsPsych.data.get().json());
      } catch {
        // 备份失败不影响任务。
      }
    },
    on_finish() {
      finished = true;
      if (!simulating) showEnd(jsPsych);
    },
  });

  jsPsych.data.addProperties({
    participant_id: participantId,
    design_version: config.designVersion,
    reward_sd: config.rewardSD,
    means: config.means.join("|"),
    mean_offset: config.meanOffset,
    block_order: assignment.blockOrder.join("|"),
    run_block_order: (config.forceBlockOrder ?? assignment.blockOrder).join("|"),
    rating_faces_first: assignment.ratingFacesFirst ? 1 : 0,
    valence_first: assignment.valenceFirst ? 1 : 0,
    learning_reps: config.learningRepsPerPair,
    demo: config.demo ? 1 : 0,
    quick: config.quick ? 1 : 0,
  });

  const timeline = buildTimeline(jsPsych, assignment, plan);
  if (simulating) {
    jsPsych.simulate(timeline, "data-only").then(() => {
      const rows = jsPsych.data.get().values();
      const summary = summarize(rows);
      summary.quiz_passed = rows.some((row) => row.event === "quiz" && row.quiz_passed === 1);
      summary.n_mapping = rows.filter((row) => row.event === "mapping").length;
      summary.block_order = assignment.blockOrder;
      window.__summary = summary;
      document.body.innerHTML = `<pre id="sim-summary">${escapeHtml(JSON.stringify(summary, null, 2))}</pre>`;
    });
    return;
  }
  jsPsych.run(timeline);
}

function showGate() {
  showBanner();
  const prefill = params.get("id") || "";
  app.innerHTML = renderGate({
    prefill,
    narrow: window.innerWidth < 900,
    demo: config.demo,
  });
  const form = document.querySelector("#gate-form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const id = document.querySelector("#participant-id").value.trim();
    if (!id) return;
    let previous = null;
    try {
      previous = localStorage.getItem(backupKey(id));
    } catch {
      previous = null;
    }
    if (!previous) {
      start(id);
      return;
    }
    const panel = document.querySelector("#backup-panel");
    panel.hidden = false;
    panel.innerHTML = renderBackupNotice();
    document.querySelector("#download-backup").addEventListener("click", () => {
      downloadText(
        `affective-bandit_${safeFilePart(id)}_backup.json`,
        previous,
        "application/json"
      );
    });
    document.querySelector("#start-anyway").addEventListener("click", () => start(id));
  });
}

function boot() {
  const missing = requiredGlobals();
  if (missing.length) {
    app.innerHTML = `<div class="missing"><h1>程序没有载入完整</h1><p>缺少 ${escapeHtml(missing.join("、"))}。请确认 vendor 目录和 index.html 在同一层，并用浏览器重新打开。</p></div>`;
    return;
  }
  if (params.has("gallery")) {
    app.innerHTML = renderGallery(library);
    return;
  }
  if (params.has("simulate")) {
    start(params.get("id") || "SIM001");
    return;
  }
  showGate();
}

boot();
