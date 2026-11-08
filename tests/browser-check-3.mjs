import puppeteer from "puppeteer-core";
import assert from "node:assert/strict";

const base = process.env.CHECK_URL || "http://127.0.0.1:8080";
const chrome = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const shots = process.env.SHOT_DIR || "/tmp/affective-shots-3";

const quizAnswers = ["F", "空格", "J", "不会显示", "不会计入", "在它的固定价值附近波动", "不显示分数", "选择价值最高的图片"];

function launch() {
  return puppeteer.launch({
    executablePath: chrome,
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
}

async function text(page) {
  return page.evaluate(() => document.body.innerText);
}

async function shoot(page, name) {
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}

const browser = await launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("favicon")) errors.push(message.text());
});

await page.setViewport({ width: 1280, height: 860 });
await page.goto(`${base}/three.html?gallery=1`, { waitUntil: "networkidle0" });
await shoot(page, "gallery");
const gallery = await text(page);
assert.match(gallery, /高兴/);
assert.match(gallery, /厌恶/);
assert.match(gallery, /星形/);
assert.equal(gallery.includes("满足"), false);
assert.equal(gallery.includes("平静"), false);

await page.goto(`${base}/three.html?simulate=1&id=SIM001`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#sim-summary", { timeout: 30000 });
const summary = await page.evaluate(() => window.__summary);
assert.equal(summary.n_rating, 24);
assert.equal(summary.n_practice, 12);
assert.equal(summary.n_learning, 72);
assert.equal(summary.n_transfer, 40);
assert.equal(summary.n_mapping, 1);
assert.equal(summary.partial_flags_ok, true);
assert.equal(summary.complete_flags_ok, true);
assert.equal(summary.transfer_rewards_hidden, true);
assert.equal(summary.quiz_passed, true);
assert.equal(summary.transfer_trained.n, 4);
assert.equal(summary.transfer_trained.n_answered, 4);
assert.equal(summary.transfer_novel.n, 36);
assert.equal(summary.transfer_novel.n_answered, 36);
assert.equal(errors.length, 0, errors.join("\n"));

const flow = await browser.newPage();
const flowErrors = [];
flow.on("pageerror", (error) => flowErrors.push(String(error)));
flow.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("favicon")) flowErrors.push(message.text());
});
await flow.setViewport({ width: 1280, height: 860 });
await flow.goto(`${base}/three.html?quick=1`, { waitUntil: "domcontentloaded" });
await flow.waitForSelector("#participant-id");
await shoot(flow, "gate");
await flow.type("#participant-id", "quick3");
await flow.click("button[type=submit]");

const seen = {
  ratingFace: false,
  ratingWord: false,
  choice: false,
  partial: false,
  complete: false,
  transfer: false,
  end: false,
};
const started = Date.now();
let guard = 0;
while (!seen.end) {
  if (Date.now() - started > 90000) throw new Error(`流程超时，已看到 ${JSON.stringify(seen)}\n${await text(flow)}`);
  guard += 1;
  if (guard > 400) throw new Error("步骤过多");
  const state = await flow.evaluate(() => {
    const read = (selector) => document.querySelector(selector)?.innerText || "";
    return {
      end: Boolean(document.querySelector("#save-csv")),
      slider: Boolean(document.querySelector("#jspsych-html-slider-response-response")),
      quiz: Boolean(document.querySelector(".jspsych-survey-multi-choice-question")),
      choice: Boolean(document.querySelector(".keyhint")),
      options: document.querySelectorAll(".stage-3 .option").length,
      points: document.querySelectorAll(".points").length,
      ack: document.body.innerText.includes("本阶段没有分数反馈"),
      hud: read(".hud"),
      buttons: [...document.querySelectorAll(".jspsych-btn")].map((button) => button.textContent.trim()).filter(Boolean),
    };
  });

  if (state.end) {
    seen.end = true;
    await shoot(flow, "end");
    break;
  }
  if (state.slider) {
    if (!seen.ratingFace && state.hud.includes("面孔")) {
      seen.ratingFace = true;
      await shoot(flow, "rating-face");
    }
    if (!seen.ratingWord && state.hud.includes("词")) {
      seen.ratingWord = true;
      await shoot(flow, "rating-word");
    }
    await flow.$eval("#jspsych-html-slider-response-response", (el) => {
      el.value = "7";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flow.click("#jspsych-html-slider-response-next");
    continue;
  }
  if (state.quiz) {
    await flow.evaluate((answers) => {
      const questions = [...document.querySelectorAll(".jspsych-survey-multi-choice-question")];
      if (questions.length !== answers.length) throw new Error(`题目数量是 ${questions.length}`);
      questions.forEach((question, index) => {
        const label = [...question.querySelectorAll("label")].find((el) => el.textContent.trim() === answers[index]);
        if (!label) throw new Error(`找不到选项：${answers[index]}`);
        label.click();
      });
    }, quizAnswers);
    await flow.click("#jspsych-survey-multi-choice-next");
    continue;
  }
  if (state.points === 1 && state.hud.includes("价值学习") && !seen.partial) {
    seen.partial = true;
    await shoot(flow, "feedback-partial");
  }
  if (state.points === 3 && state.hud.includes("价值学习") && !seen.complete) {
    seen.complete = true;
    await shoot(flow, "feedback-complete");
  }
  if (state.ack && state.hud.includes("迁移") && !seen.transfer) {
    seen.transfer = true;
    await shoot(flow, "transfer-ack");
  }
  if (state.choice) {
    if (!seen.choice && state.hud.includes("价值学习")) {
      seen.choice = true;
      const prompt = await text(flow);
      assert.match(prompt, /请选择价值最高的一个/);
      assert.equal(state.options, 3);
      await shoot(flow, "choice");
    }
    await flow.keyboard.press("f");
    await flow.waitForFunction(() => !document.querySelector(".keyhint"), { timeout: 3000 }).catch(() => {});
    continue;
  }
  if (state.buttons.length) {
    const preferred = state.buttons.find((label) => label.includes("窗口")) || state.buttons[0];
    await flow.evaluate((label) => {
      const button = [...document.querySelectorAll(".jspsych-btn")].find((el) => el.textContent.trim() === label);
      button?.click();
    }, preferred);
    await new Promise((resolve) => setTimeout(resolve, 40));
    continue;
  }
  await new Promise((resolve) => setTimeout(resolve, 30));
}

assert.equal(seen.choice, true);
assert.equal(seen.ratingFace, true);
assert.equal(seen.ratingWord, true);
assert.equal(seen.partial, true);
assert.equal(seen.complete, true);
assert.equal(seen.transfer, true);
assert.equal(seen.end, true);
const ending = await text(flow);
assert.match(ending, /谢谢你的参与/);
assert.match(ending, /迁移阶段没有分数/);
assert.match(ending, /预览模式/);
assert.equal(flowErrors.length, 0, flowErrors.join("\n"));

const narrow = await browser.newPage();
await narrow.setViewport({ width: 390, height: 844 });
await narrow.goto(`${base}/three.html?quick=1`, { waitUntil: "domcontentloaded" });
await narrow.waitForSelector("#participant-id");
await narrow.type("#participant-id", "mobile3");
await narrow.click("button[type=submit]");
const narrowStarted = Date.now();
let narrowChoice = false;
while (!narrowChoice) {
  if (Date.now() - narrowStarted > 30000) throw new Error("窄屏没有走到选择");
  const ready = await narrow.evaluate(() => ({
    choice: Boolean(document.querySelector(".stage-3 .keyhint")),
    options: document.querySelectorAll(".stage-3 .option").length,
    slider: Boolean(document.querySelector("#jspsych-html-slider-response-response")),
    buttons: [...document.querySelectorAll(".jspsych-btn")].map((button) => button.textContent.trim()).filter(Boolean),
  }));
  if (ready.choice && ready.options === 3) {
    narrowChoice = true;
    await narrow.screenshot({ path: `${shots}/choice-mobile.png` });
    break;
  }
  if (ready.slider) {
    await narrow.$eval("#jspsych-html-slider-response-response", (el) => {
      el.value = "6";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await narrow.click("#jspsych-html-slider-response-next");
    continue;
  }
  if (ready.buttons.length) {
    const preferred = ready.buttons.find((label) => label.includes("窗口")) || ready.buttons[0];
    await narrow.evaluate((label) => {
      const button = [...document.querySelectorAll(".jspsych-btn")].find((el) => el.textContent.trim() === label);
      button?.click();
    }, preferred);
  }
  await new Promise((resolve) => setTimeout(resolve, 40));
}

await browser.close();
console.log(JSON.stringify({ summary, seen, shots }, null, 2));
