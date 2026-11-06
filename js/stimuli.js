/**
 * 情绪面孔是本程序自绘的图式面孔，不使用受版权保护的面孔库。
 * 八张脸只有表情不同，轮廓、发型和颜色保持一致。
 * 情绪词使用同样大小的卡片，作为和面孔对应的图片线索。
 *
 * 如果实验室要换成自己有使用许可的照片，只需替换对应项目的 html，
 * 并保持 id、modality、emotion、label 不变，例如：
 * html: '<img class="photo" alt="" src="stimuli/faces/happy.jpg">'
 */

const INK = "#2C241F";
const MOUTH = "#7A3034";

const FACE_DEFS = [
  { emotion: "happy", label: "高兴" },
  { emotion: "content", label: "满足" },
  { emotion: "neutral", label: "平静" },
  { emotion: "sad", label: "悲伤" },
  { emotion: "angry", label: "愤怒" },
  { emotion: "fear", label: "恐惧" },
  { emotion: "disgust", label: "厌恶" },
  { emotion: "surprise", label: "惊讶" },
];

const WORD_DEFS = FACE_DEFS.map((item) => ({ ...item }));

function eye(cx, cy, rx, ry) {
  const pupil = Math.max(4.2, rx * 0.4);
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#FFFCF8" stroke="${INK}" stroke-width="2.5"/>
    <circle cx="${cx}" cy="${cy + 0.6}" r="${pupil}" fill="${INK}"/>
    <circle cx="${cx + rx * 0.28}" cy="${cy - ry * 0.32}" r="1.8" fill="#ffffff"/>`;
}

function brow(d, width = 5) {
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${width}" stroke-linecap="round"/>`;
}

function mouthPath(d, fill = "none") {
  return `<path d="${d}" fill="${fill}" stroke="${MOUTH}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function features(emotion) {
  switch (emotion) {
    case "happy":
      return {
        blush: 0.85,
        brows: [brow("M64 114 Q80 100 98 112"), brow("M122 112 Q140 100 156 114")],
        eyes: eye(80, 138, 14, 8.5) + eye(140, 138, 14, 8.5),
        mouth: mouthPath("M64 174 Q110 222 156 174"),
      };
    case "content":
      return {
        blush: 0.45,
        brows: [brow("M66 116 Q82 110 98 116", 4.2), brow("M122 116 Q138 110 154 116", 4.2)],
        eyes: eye(80, 138, 12, 12) + eye(140, 138, 12, 12),
        mouth: mouthPath("M84 176 Q110 196 136 176"),
      };
    case "neutral":
      return {
        brows: [brow("M64 118 H98", 4.4), brow("M122 118 H156", 4.4)],
        eyes: eye(80, 138, 12, 12) + eye(140, 138, 12, 12),
        mouth: mouthPath("M90 182 H130"),
      };
    case "sad":
      return {
        brows: [brow("M62 128 Q80 104 100 118"), brow("M120 118 Q140 104 158 128")],
        eyes: eye(80, 142, 12, 13) + eye(140, 142, 12, 13),
        mouth: mouthPath("M72 198 Q110 166 148 198"),
      };
    case "angry":
      return {
        brows: [brow("M58 104 L102 128", 6.5), brow("M162 104 L118 128", 6.5)],
        eyes: eye(80, 142, 13, 7) + eye(140, 142, 13, 7),
        mouth: mouthPath("M76 178 Q110 194 144 178"),
      };
    case "fear":
      return {
        brows: [brow("M58 112 Q76 90 104 114"), brow("M116 114 Q144 90 162 112")],
        eyes: eye(80, 136, 14, 16) + eye(140, 136, 14, 16),
        mouth: mouthPath("M98 172 Q110 196 122 172 Q110 178 98 172", "#6E2C32"),
      };
    case "disgust":
      return {
        brows: [brow("M60 130 L100 116", 5.5), brow("M118 108 L162 122", 5.5)],
        eyes: eye(80, 140, 12, 7.5) + eye(140, 138, 12, 7.5),
        extra: `<path d="M98 152 L110 166 L122 150" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
          <path d="M102 158 H118" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`,
        mouth: mouthPath("M74 176 Q102 164 116 182 Q134 202 156 166"),
      };
    case "surprise":
      return {
        brows: [brow("M56 104 Q78 74 100 104"), brow("M120 104 Q142 74 164 104")],
        eyes: eye(80, 134, 16, 17) + eye(140, 134, 16, 17),
        mouth: `<ellipse cx="110" cy="190" rx="16" ry="20" fill="#6E2C32" stroke="${MOUTH}" stroke-width="3"/>
          <ellipse cx="110" cy="196" rx="8" ry="8" fill="#4A2024"/>`,
      };
    default:
      throw new Error(`未知表情：${emotion}`);
  }
}

export function faceSVG(id, emotion) {
  const face = features(emotion);
  const blush = face.blush
    ? `<ellipse cx="66" cy="168" rx="14" ry="8" fill="#E7A090" opacity="${face.blush}"/>
       <ellipse cx="154" cy="168" rx="14" ry="8" fill="#E7A090" opacity="${face.blush}"/>`
    : "";
  return `<svg class="face" viewBox="0 0 220 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="情绪面孔">
    <defs>
      <radialGradient id="${id}-skin" cx="42%" cy="36%" r="72%">
        <stop offset="0%" stop-color="#FBE0C8"/>
        <stop offset="72%" stop-color="#F0C29E"/>
        <stop offset="100%" stop-color="#E2AE84"/>
      </radialGradient>
    </defs>
    <ellipse cx="36" cy="154" rx="14" ry="18" fill="#F0C29E" stroke="${INK}" stroke-width="3"/>
    <ellipse cx="184" cy="154" rx="14" ry="18" fill="#F0C29E" stroke="${INK}" stroke-width="3"/>
    <ellipse cx="110" cy="150" rx="74" ry="86" fill="url(#${id}-skin)" stroke="${INK}" stroke-width="3"/>
    <path d="M52 118 C50 68 70 36 110 34 C152 36 172 68 170 118 C158 90 136 76 110 74 C84 76 64 90 52 118 Z" fill="${INK}"/>
    <path d="M110 148 Q120 166 110 170" fill="none" stroke="#C48A6A" stroke-width="3.2" stroke-linecap="round"/>
    ${face.brows.join("")}
    ${face.eyes}
    ${blush}
    ${face.extra || ""}
    ${face.mouth}
  </svg>`;
}

export function wordHTML(text) {
  return `<div class="word">${text}</div>`;
}

function shapeSVG(kind, color) {
  const shapes = {
    circle: `<circle cx="110" cy="128" r="62" fill="${color}"/>`,
    diamond: `<polygon points="110,52 178,128 110,204 42,128" fill="${color}"/>`,
    triangle: `<polygon points="110,46 186,196 34,196" fill="${color}"/>`,
    square: `<rect x="50" y="68" width="120" height="120" rx="16" fill="${color}"/>`,
  };
  return `<svg class="face" viewBox="0 0 220 250" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${shapes[kind]}</svg>`;
}

function linkPair(a, b, pairId, feedback) {
  a.feedback = feedback;
  b.feedback = feedback;
  a.training_pair = pairId;
  b.training_pair = pairId;
  a.partner_id = b.id;
  b.partner_id = a.id;
  return [a, b];
}

export function createLibrary() {
  const stimuli = [
    ...FACE_DEFS.map((item) => ({
      id: `face-${item.emotion}`,
      modality: "face",
      emotion: item.emotion,
      label: item.label,
      html: faceSVG(`face-${item.emotion}`, item.emotion),
    })),
    ...WORD_DEFS.map((item) => ({
      id: `word-${item.emotion}`,
      modality: "word",
      emotion: item.emotion,
      label: item.label,
      html: wordHTML(item.label),
    })),
  ];

  const circle = {
    id: "practice-circle",
    modality: "shape",
    emotion: "practice",
    label: "圆形",
    mean: 72,
    html: shapeSVG("circle", "#0f766e"),
  };
  const diamond = {
    id: "practice-diamond",
    modality: "shape",
    emotion: "practice",
    label: "菱形",
    mean: 28,
    html: shapeSVG("diamond", "#b45309"),
  };
  const triangle = {
    id: "practice-triangle",
    modality: "shape",
    emotion: "practice",
    label: "三角形",
    mean: 64,
    html: shapeSVG("triangle", "#3730a3"),
  };
  const square = {
    id: "practice-square",
    modality: "shape",
    emotion: "practice",
    label: "方形",
    mean: 36,
    html: shapeSVG("square", "#be123c"),
  };

  return {
    stimuli,
    practice: {
      partial: [linkPair(circle, diamond, "practice-partial-1", "partial")],
      complete: [linkPair(triangle, square, "practice-complete-1", "complete")],
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
