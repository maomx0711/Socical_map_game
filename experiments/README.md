# 社会等级学习实验范式 (jsPsych)

基于 jsPsych 8 复现的两套经典社会等级学习行为范式，单文件 HTML，通过 CDN 加载，可在线运行。

## 实验列表

| 文件 | 来源 | 范式 |
|------|------|------|
| `kumaran2012_hierarchy_learning.html` | Kumaran et al. (2012), *Neuron* | 一维等级学习 + 传递推理 |
| `park2021_multidimensional_hierarchy.html` | Park, Miller & Boorman (2021), *Nature Neuroscience* | 4×4 二维等级 + 伙伴选择 |
| `post_learning_choice_evaluation.html` | 在上述学习逻辑上延伸的测验 | 学习后同时呈现配对：选择或固定选项评价 |

## 运行方式

1. **直接打开**：用浏览器打开 `index.html` 或各实验 HTML 文件（需联网以加载 jsPsych CDN）。
2. **本地服务器**（推荐）：
   ```bash
   cd experiments
   python3 -m http.server 8080
   ```
   访问 http://localhost:8080

## 模式参数

- 默认：**演示模式**（较短试次，便于快速体验）
- 完整版：在 URL 后加 `?mode=full`
  - Kumaran：15 blocks（与原论文一致）
  - Park：每对重复 4 次 + 完整测试集
  - 学习后选择/评价：学习重复 3 次，选择 24 试次，评价 16 试次

## 数据导出

实验结束时自动下载 JSON 数据文件，包含试次级反应时、正确率、信心评分等字段。

## 范式要点

### Kumaran (2012) — Learn Phase
- 7 级社会（员工权力）与非社会（星系矿物）等级并行学习
- 训练：相邻等级对 + 正误反馈
- 测试：非相邻对 + 信心评分（1–3），传递推理指数 = 正确 × 信心
- 回忆测试：按等级排序所有项目

### Park (2021) — Behavioral Training
- 16 人 4×4 网格（能力 × 人气）
- 学习 block：相差 1 级的成对比较，75% 可靠反馈
- 测试 block：相差 ≥1 级，无反馈
- 伙伴选择：基于增长潜力 (GP) 的二维推断

### 社会学习后的选择与固定选项评价
- 六人、两个维度：亲和力与社会地位。学习阶段只比较相邻等级并给予反馈
- 选择：同时呈现来自不同配对的三人，选出最具亲和力者或社会地位最高者
- 评价：同时呈现两个不相交的配对；选项在所有试次中固定为 1–5
- 两种测验的先后顺序随机，结束时下载 JSON
