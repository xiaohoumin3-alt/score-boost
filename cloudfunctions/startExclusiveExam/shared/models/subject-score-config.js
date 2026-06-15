/**
 * 科目分数配置
 * 中考满分：语数英150分，其他100分
 */

const SUBJECT_SCORE_CONFIG = {
  // === 主科（中考150分）===
  math: {
    name: '数学',
    examFullScore: 150,
    schoolFullScore: 100,
    examWeight: 1.5,
    questionTypes: {
      choice: { ratio: 0.25, score: 37.5 },
      fill: { ratio: 0.15, score: 22.5 },
      solve: { ratio: 0.6, score: 90 },
    },
  },
  chinese: {
    name: '语文',
    examFullScore: 150,
    schoolFullScore: 100,
    examWeight: 1.5,
    questionTypes: {
      choice: { ratio: 0.2, score: 30 },
      fill: { ratio: 0.1, score: 15 },
      reading: { ratio: 0.4, score: 60 },
      writing: { ratio: 0.3, score: 45 },
    },
  },
  english: {
    name: '英语',
    examFullScore: 150,
    schoolFullScore: 100,
    examWeight: 1.5,
    questionTypes: {
      choice: { ratio: 0.35, score: 52.5 },
      fill: { ratio: 0.15, score: 22.5 },
      reading: { ratio: 0.3, score: 45 },
      writing: { ratio: 0.2, score: 30 },
    },
  },
  
  // === 副科（中考100分）===
  physics: {
    name: '物理',
    examFullScore: 100,
    schoolFullScore: 100,
    examWeight: 1.0,
    questionTypes: {
      choice: { ratio: 0.3, score: 30 },
      fill: { ratio: 0.2, score: 20 },
      experiment: { ratio: 0.2, score: 20 },
      solve: { ratio: 0.3, score: 30 },
    },
  },
  chemistry: {
    name: '化学',
    examFullScore: 100,
    schoolFullScore: 100,
    examWeight: 1.0,
    questionTypes: {
      choice: { ratio: 0.3, score: 30 },
      fill: { ratio: 0.2, score: 20 },
      experiment: { ratio: 0.2, score: 20 },
      solve: { ratio: 0.3, score: 30 },
    },
  },
  biology: {
    name: '生物',
    examFullScore: 100,
    schoolFullScore: 100,
    examWeight: 1.0,
    questionTypes: {
      choice: { ratio: 0.4, score: 40 },
      fill: { ratio: 0.3, score: 30 },
      solve: { ratio: 0.3, score: 30 },
    },
  },
  geography: {
    name: '地理',
    examFullScore: 100,
    schoolFullScore: 100,
    examWeight: 1.0,
    questionTypes: {
      choice: { ratio: 0.4, score: 40 },
      fill: { ratio: 0.3, score: 30 },
      solve: { ratio: 0.3, score: 30 },
    },
  },
  history: {
    name: '历史',
    examFullScore: 100,
    schoolFullScore: 100,
    examWeight: 1.0,
    questionTypes: {
      choice: { ratio: 0.4, score: 40 },
      fill: { ratio: 0.3, score: 30 },
      solve: { ratio: 0.3, score: 30 },
    },
  },
  politics: {
    name: '政治',
    examFullScore: 100,
    schoolFullScore: 100,
    examWeight: 1.0,
    questionTypes: {
      choice: { ratio: 0.4, score: 40 },
      fill: { ratio: 0.3, score: 30 },
      solve: { ratio: 0.3, score: 30 },
    },
  },
};

module.exports = SUBJECT_SCORE_CONFIG;
