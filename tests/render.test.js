import assert from "node:assert/strict";
import test from "node:test";
import { faceSVG, wordHTML } from "../js/stimuli.js";
import { renderChoice, renderEnd, renderOutcome, renderTrioChoice, renderTrioOutcome } from "../js/render.js";

const left = { id: "left", html: wordHTML("甲") };
const right = { id: "right", html: wordHTML("乙") };

const view = {
  left,
  right,
  phaseLabel: "价值学习 · 情绪词",
  conditionLabel: "只显示所选项的分数",
  trialN: 1,
  trialTotal: 32,
  showScore: true,
  score: 10,
};

test("选择界面不出现分数", () => {
  const html = renderChoice({ ...view, ask: "请选择价值最高的一个" });
  assert.equal(html.includes('class="points"'), false);
  assert.match(html, /<kbd>F<\/kbd>/);
  assert.match(html, /<kbd>J<\/kbd>/);
  assert.match(html, /甲/);
  assert.match(html, /乙/);
});

test("部分反馈只写出被选中的分数", () => {
  const html = renderOutcome({
    ...view,
    mode: "partial",
    choice: "left",
    rewardLeft: 13,
    rewardRight: 87,
    chosenReward: 13,
  });
  assert.match(html, /class="points">13</);
  assert.equal(html.includes('class="points">87<'), false);
  assert.match(html, /计入得分 13/);
  assert.equal(html.includes("计入得分 87"), false);
  assert.match(html, /你的选择/);
  assert.match(html, /甲/);
  assert.match(html, /乙/);
});

test("完全反馈写出两个分数，测验不写分数", () => {
  const complete = renderOutcome({
    ...view,
    mode: "complete",
    choice: "right",
    rewardLeft: 13,
    rewardRight: 87,
    chosenReward: 87,
  });
  assert.match(complete, /class="points points-other">13</);
  assert.match(complete, /class="points">87</);
  assert.match(complete, /未选择/);
  assert.match(complete, /计入得分 87/);

  const ack = renderOutcome({
    ...view,
    showScore: false,
    mode: "ack",
    choice: "left",
    rewardLeft: null,
    rewardRight: null,
    chosenReward: null,
  });
  assert.equal(ack.includes('class="points"'), false);
  assert.match(ack, /已选择/);
  assert.match(ack, /本阶段没有分数反馈/);
});

test("零分仍会显示", () => {
  const html = renderOutcome({
    ...view,
    mode: "partial",
    choice: "right",
    rewardLeft: 80,
    rewardRight: 0,
    chosenReward: 0,
  });
  assert.match(html, /class="points">0</);
  assert.equal(html.includes('class="points">80<'), false);
  assert.match(html, /计入得分 0/);
});

test("结束页不会把编号当成标记插入", () => {
  const html = renderEnd({
    participantId: "<img src=x>",
    points: 10,
    blockLines: ["face-partial：10 分"],
    demo: false,
  });
  assert.equal(html.includes("<img src=x>"), false);
  assert.match(html, /&lt;img src=x&gt;/);
});

test("三臂选择界面有三个按键且不出现分数", () => {
  const html = renderTrioChoice({
    ...view,
    middle: { id: "middle", html: wordHTML("丙") },
    ask: "请选择价值最高的一个",
  });
  assert.equal(html.includes('class="points"'), false);
  assert.match(html, /<kbd>F<\/kbd>/);
  assert.match(html, /<kbd>空格<\/kbd>/);
  assert.match(html, /<kbd>J<\/kbd>/);
  assert.match(html, /左边/);
  assert.match(html, /中间/);
  assert.match(html, /右边/);
  assert.match(html, /甲/);
  assert.match(html, /乙/);
  assert.match(html, /丙/);
});

test("三臂部分反馈只显示所选分数，完全反馈显示三个分数", () => {
  const trio = {
    ...view,
    middle: { id: "middle", html: wordHTML("丙") },
  };
  const partial = renderTrioOutcome({
    ...trio,
    mode: "partial",
    choice: "middle",
    rewardLeft: 80,
    rewardMiddle: 0,
    rewardRight: 20,
    chosenReward: 0,
  });
  assert.match(partial, /class="points">0</);
  assert.equal(partial.includes('class="points">80<'), false);
  assert.equal(partial.includes('class="points">20<'), false);
  assert.match(partial, /计入得分 0/);
  assert.match(partial, /你的选择/);

  const complete = renderTrioOutcome({
    ...trio,
    mode: "complete",
    choice: "left",
    rewardLeft: 80,
    rewardMiddle: 40,
    rewardRight: 20,
    chosenReward: 80,
  });
  assert.match(complete, /class="points">80</);
  assert.match(complete, /class="points points-other">40</);
  assert.match(complete, /class="points points-other">20</);
  assert.equal((complete.match(/未选择/g) || []).length, 2);

  const ack = renderTrioOutcome({
    ...trio,
    showScore: false,
    mode: "ack",
    choice: "right",
    rewardLeft: null,
    rewardMiddle: null,
    rewardRight: null,
    chosenReward: null,
  });
  assert.equal(ack.includes('class="points"'), false);
  assert.match(ack, /已选择/);
  assert.match(ack, /本阶段没有分数反馈/);
});

test("八个表情都能画出面孔", () => {
  for (const emotion of ["happy", "content", "neutral", "sad", "angry", "fear", "disgust", "surprise"]) {
    const svg = faceSVG(`face-${emotion}`, emotion);
    assert.match(svg, /<svg/);
    assert.match(svg, new RegExp(`face-${emotion}-skin`));
  }
});
