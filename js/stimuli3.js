/**
 * 三臂任务使用 6 张图式面孔和 6 个对应情绪词。
 * 满足、平静留在二臂任务里，这里不重复使用，避免同一套 8 张材料无法被 3 整除。
 */

import { faceSVG, wordHTML } from "./stimuli.js";

const TRIO_DEFS = [
  { emotion: "happy", label: "高兴" },
  { emotion: "sad", label: "悲伤" },
  { emotion: "angry", label: "愤怒" },
  { emotion: "fear", label: "恐惧" },
  { emotion: "disgust", label: "厌恶" },
  { emotion: "surprise", label: "惊讶" },
];

function shapeSVG(kind, color) {
  const shapes = {
    circle: `<circle cx="110" cy="128" r="62" fill="${color}"/>`,
    diamond: `<polygon points="110,52 178,128 110,204 42,128" fill="${color}"/>`,
    triangle: `<polygon points="110,46 186,196 34,196" fill="${color}"/>`,
    square: `<rect x="50" y="68" width="120" height="120" rx="16" fill="${color}"/>`,
    hexagon: `<polygon points="110,52 166,84 166,156 110,188 54,156 54,84" fill="${color}"/>`,
    star: `<polygon points="110,46 124,96 176,96 134,126 150,176 110,146 70,176 86,126 44,96 96,96" fill="${color}"/>`,
  };
  return `<svg class="face" viewBox="0 0 220 250" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${shapes[kind]}</svg>`;
}

function makeShape(id, kind, label, mean, color) {
  return {
    id,
    modality: "shape",
    emotion: "practice",
    label,
    mean,
    html: shapeSVG(kind, color),
  };
}

function linkTrio(items, trioId, feedback) {
  const ids = items.map((item) => item.id);
  for (const item of items) {
    item.feedback = feedback;
    item.training_trio = trioId;
    item.cohort_ids = ids
      .filter((id) => id !== item.id)
      .sort()
      .join("|");
  }
  return items;
}

export function createTrioLibrary() {
  const stimuli = [
    ...TRIO_DEFS.map((item) => ({
      id: `face-${item.emotion}`,
      modality: "face",
      emotion: item.emotion,
      label: item.label,
      html: faceSVG(`face-${item.emotion}`, item.emotion),
    })),
    ...TRIO_DEFS.map((item) => ({
      id: `word-${item.emotion}`,
      modality: "word",
      emotion: item.emotion,
      label: item.label,
      html: wordHTML(item.label),
    })),
  ];

  return {
    stimuli,
    practice: {
      partial: linkTrio(
        [
          makeShape("practice-circle", "circle", "圆形", 78, "#0f766e"),
          makeShape("practice-diamond", "diamond", "菱形", 48, "#b45309"),
          makeShape("practice-triangle", "triangle", "三角形", 22, "#3730a3"),
        ],
        "practice-partial-1",
        "partial"
      ),
      complete: linkTrio(
        [
          makeShape("practice-square", "square", "方形", 86, "#be123c"),
          makeShape("practice-hexagon", "hexagon", "六边形", 56, "#0369a1"),
          makeShape("practice-star", "star", "星形", 34, "#a16207"),
        ],
        "practice-complete-1",
        "complete"
      ),
      example: {
        id: "rating-example",
        modality: "shape",
        emotion: "example",
        label: "示例",
        html: wordHTML("示例"),
      },
    },
  };
}
