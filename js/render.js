import { DIMENSIONS, MODALITY_LABEL } from "./design.js";

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}

function hud(view) {
  return `<div class="hud">
    <span>${escapeHtml(view.phaseLabel)}</span>
    <span>${escapeHtml(view.conditionLabel)}</span>
    <span>第 ${view.trialN} / ${view.trialTotal} 次</span>
    ${view.showScore ? `<span class="hud-score">得分 ${view.score}</span>` : "<span></span>"}
  </div>`;
}

function optionColumn({ stim, footer, dim = false, chosen = false, tag = "" }) {
  return `<div class="option${chosen ? " is-chosen" : ""}${dim ? " is-dim" : ""}">
    <div class="card">${stim.html}</div>
    <div class="tag${tag ? "" : " tag-empty"}">${tag ? escapeHtml(tag) : ""}</div>
    ${footer}
  </div>`;
}

export function renderProse({ kicker = "", title, paragraphs = [], items = [] }) {
  return `<div class="prose">
    ${kicker ? `<p class="kicker">${escapeHtml(kicker)}</p>` : ""}
    <h1>${escapeHtml(title)}</h1>
    ${paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("")}
    ${items.length ? `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>` : ""}
  </div>`;
}

export function renderFixation() {
  return `<div class="fix" aria-hidden="true"></div>`;
}

export function renderRating(view) {
  const spec = DIMENSIONS[view.dimension];
  const phase = view.phase === "practice" ? "评定练习" : "情绪评定";
  return `<div class="task rate">
    <div class="hud">
      <span>${phase} · ${escapeHtml(MODALITY_LABEL[view.modality] || "")}</span>
      <span>${escapeHtml(spec.title)}</span>
      <span>第 ${view.trialN} / ${view.trialTotal} 次</span>
    </div>
    <div class="card rate-single">${view.stim.html}</div>
    <h2>${escapeHtml(spec.title)}</h2>
    <p class="ask">${escapeHtml(spec.question)}</p>
  </div>`;
}

export function ratingPrompt(dimension) {
  const spec = DIMENSIONS[dimension];
  return `<p class="scale-caption"><span>1 ${escapeHtml(spec.low)}</span><span>当前评分 <strong id="live-rating">5</strong></span><span>9 ${escapeHtml(spec.high)}</span></p>`;
}

export function renderChoice(view) {
  const hint = (key, side) => `<div class="keyhint"><kbd>${key}</kbd> ${side}</div>`;
  return `<div class="task">
    ${hud(view)}
    <div class="stage">
      ${optionColumn({ stim: view.left, footer: hint("F", "左边") })}
      ${optionColumn({ stim: view.right, footer: hint("J", "右边") })}
    </div>
    <p class="ask">${escapeHtml(view.ask)}</p>
  </div>`;
}

export function renderOutcome(view) {
  const show = (side) => {
    if (view.mode === "ack" || !view.choice) return false;
    if (view.mode === "partial") return view.choice === side;
    return true;
  };
  const footer = (shown, reward, chosen) =>
    shown
      ? `<div class="value"><span class="points${chosen ? "" : " points-other"}">${reward}</span><span class="unit">分</span></div>`
      : `<div class="value value-empty"></div>`;
  const tagFor = (side) => {
    if (view.choice !== side) return view.mode === "complete" && view.choice ? "未选择" : "";
    return view.mode === "ack" ? "已选择" : "你的选择";
  };
  let earned = "没有记录到按键";
  if (view.mode === "ack") earned = "本阶段没有分数反馈";
  else if (view.chosenReward !== null && view.chosenReward !== undefined) earned = `计入得分 ${view.chosenReward}`;

  return `<div class="task">
    ${hud(view)}
    <div class="stage">
      ${optionColumn({
        stim: view.left,
        chosen: view.choice === "left",
        dim: view.mode === "partial" && view.choice === "right",
        tag: tagFor("left"),
        footer: footer(show("left"), view.rewardLeft, view.choice === "left"),
      })}
      ${optionColumn({
        stim: view.right,
        chosen: view.choice === "right",
        dim: view.mode === "partial" && view.choice === "left",
        tag: tagFor("right"),
        footer: footer(show("right"), view.rewardRight, view.choice === "right"),
      })}
    </div>
    <p class="ask earned">${escapeHtml(earned)}</p>
  </div>`;
}

export function renderQuizRetry({ reveal }) {
  const rules = [
    "左边按 F，右边按 J。",
    "「只显示所选项」时，没选的图片不会出现分数。",
    "「两个分数都显示」时，没选中的分数也不计入总分。",
    "同一张图片的分数会在它的固定价值附近波动，不是每次都一样，也不是完全没有规律。",
    "最后的测验不显示分数。",
    "目标是选择价值最高的图片。价值和表情、词义没有固定关系。",
  ];
  return renderProse({
    kicker: "请再确认规则",
    title: reveal ? "规则如下" : "有的回答和实验规则不一致",
    paragraphs: reveal
      ? ["请按下面的规则再答一次。"]
      : ["请回想刚才的说明和练习，再答一次。"],
    items: reveal ? rules : [],
  });
}

export function renderEnd({
  participantId,
  points,
  blockLines,
  demo,
  holdoutLabel = "测验阶段",
  analysisNote = "请不要关闭页面。下载数据后交给主试。分析时保留 event 为 choice、rating 或 mapping 的行；练习试次的 phase 是 practice。",
}) {
  return `<div class="prose end-panel">
    <p class="kicker">实验结束</p>
    <h1>谢谢你的参与</h1>
    ${demo ? "<p class=\"warn\">这是预览模式，请不要把这次数据当作正式结果。</p>" : ""}
    <p>学习阶段获得的总分是 <strong>${points}</strong>。${escapeHtml(holdoutLabel)}没有分数。</p>
    ${blockLines.length ? `<ul>${blockLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : ""}
    <p>${escapeHtml(analysisNote)}</p>
    <p class="file-note">编号 ${escapeHtml(participantId)}</p>
    <div class="end-actions">
      <button type="button" class="jspsych-btn" id="save-csv">下载 CSV</button>
      <button type="button" class="jspsych-btn end-secondary" id="save-json">下载 JSON</button>
    </div>
  </div>`;
}

export function renderGallery(library) {
  const group = (title, items) => `<section>
    <h2>${escapeHtml(title)}</h2>
    <div class="gallery">
      ${items
        .map(
          (item) => `<figure>
            <div class="card">${item.html}</div>
            <figcaption>${escapeHtml(item.label)}</figcaption>
          </figure>`
        )
        .join("")}
    </div>
  </section>`;
  return `<div class="gallery-page">
    <p class="kicker">材料检查</p>
    <h1>这些名称不会出现在正式实验里</h1>
    <p>面孔只有表情不同。词汇和面孔使用同样大小的卡片。</p>
    ${group("情绪面孔", library.stimuli.filter((item) => item.modality === "face"))}
    ${group("情绪词", library.stimuli.filter((item) => item.modality === "word"))}
    ${group(
      "练习图形",
      library.practice.partial.flat().concat(library.practice.complete.flat())
    )}
  </div>`;
}

export function renderGate({
  prefill,
  narrow,
  demo,
  title = "情绪与价值学习",
  lead = "先评定情绪面孔和情绪词，再通过二选一学习每张图的价值。大约需要 25 分钟，请使用电脑完成，中途不要刷新。",
  alt = null,
}) {
  return `<form class="gate" id="gate-form">
    <div class="gate-card">
      <p class="kicker">行为实验</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(lead)}</p>
      ${demo ? `<p class="warn">当前是预览模式，试次已缩短。</p>` : ""}
      ${narrow ? `<p class="warn">当前窗口偏窄，请先最大化窗口。</p>` : ""}
      <label for="participant-id">被试编号</label>
      <input id="participant-id" name="participant-id" type="text" autocomplete="off" required value="${escapeHtml(prefill)}" placeholder="例如 001">
      <button class="jspsych-btn" type="submit">开始</button>
      ${alt ? `<p class="file-note"><a href="${escapeHtml(alt.href)}">${escapeHtml(alt.text)}</a></p>` : ""}
      <div id="backup-panel" hidden></div>
    </div>
  </form>`;
}

export function renderBackupNotice() {
  return `<div class="backup-notice">
    <p>这个编号在本机有一份尚未确认导出的备份。开始新实验后，新数据会覆盖它。</p>
    <button type="button" class="jspsych-btn end-secondary" id="download-backup">先下载备份</button>
    <button type="button" class="jspsych-btn" id="start-anyway">仍然开始</button>
  </div>`;
}

export function renderTrioChoice(view) {
  const hint = (key, side) => `<div class="keyhint"><kbd>${key}</kbd> ${side}</div>`;
  return `<div class="task task-wide">
    ${hud(view)}
    <div class="stage stage-3">
      ${optionColumn({ stim: view.left, footer: hint("F", "左边") })}
      ${optionColumn({ stim: view.middle, footer: hint("空格", "中间") })}
      ${optionColumn({ stim: view.right, footer: hint("J", "右边") })}
    </div>
    <p class="ask">${escapeHtml(view.ask)}</p>
  </div>`;
}

export function renderTrioOutcome(view) {
  const show = (side) => {
    if (view.mode === "ack" || !view.choice) return false;
    if (view.mode === "partial") return view.choice === side;
    return true;
  };
  const footer = (shown, reward, chosen) =>
    shown
      ? `<div class="value"><span class="points${chosen ? "" : " points-other"}">${reward}</span><span class="unit">分</span></div>`
      : `<div class="value value-empty"></div>`;
  const tagFor = (side) => {
    if (view.choice !== side) return view.mode === "complete" && view.choice ? "未选择" : "";
    return view.mode === "ack" ? "已选择" : "你的选择";
  };
  const dimFor = (side) => view.mode === "partial" && view.choice && view.choice !== side;
  let earned = "没有记录到按键";
  if (view.mode === "ack") earned = "本阶段没有分数反馈";
  else if (view.chosenReward !== null && view.chosenReward !== undefined) earned = `计入得分 ${view.chosenReward}`;
  const column = (side, stim, reward) =>
    optionColumn({
      stim,
      chosen: view.choice === side,
      dim: dimFor(side),
      tag: tagFor(side),
      footer: footer(show(side), reward, view.choice === side),
    });

  return `<div class="task task-wide">
    ${hud(view)}
    <div class="stage stage-3">
      ${column("left", view.left, view.rewardLeft)}
      ${column("middle", view.middle, view.rewardMiddle)}
      ${column("right", view.right, view.rewardRight)}
    </div>
    <p class="ask earned">${escapeHtml(earned)}</p>
  </div>`;
}

export function renderTrioQuizRetry({ reveal }) {
  const rules = [
    "左边按 F，中间按空格，右边按 J。",
    "「只显示所选项」时，没选的两张图片不会出现分数。",
    "「三个分数都显示」时，没选中的分数也不计入总分。",
    "同一张图片的分数会在它的固定价值附近波动，不是每次都一样，也不是完全没有规律。",
    "迁移阶段不显示分数。",
    "目标是选择价值最高的图片。价值和表情、词义没有固定关系。",
  ];
  return renderProse({
    kicker: "请再确认规则",
    title: reveal ? "规则如下" : "有的回答和实验规则不一致",
    paragraphs: reveal ? ["请按下面的规则再答一次。"] : ["请回想刚才的说明和练习，再答一次。"],
    items: reveal ? rules : [],
  });
}

export function phaseLabel(phase, modality) {
  const name = MODALITY_LABEL[modality] || "";
  if (phase === "practice") return `练习 · ${name}`;
  if (phase === "learning") return `价值学习 · ${name}`;
  if (phase === "test") return `测验 · ${name}`;
  if (phase === "transfer") return `迁移 · ${name}`;
  return name;
}
