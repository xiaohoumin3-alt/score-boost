const app = getApp();
const api = require('../../utils/cloudApi.js');

Page({
  data: {
    materials: [],
    selectedMaterials: [],
    numQuestions: 20,
    difficulty: 'mixed',
    difficulties: [
      { value: 'easy', label: '简单' },
      { value: 'medium', label: '中等' },
      { value: 'hard', label: '困难' },
      { value: 'mixed', label: '混合' }
    ],
    loading: true,
    creating: false,
    error: ''
  },

  onLoad() {
    this.loadMaterials();
  },

  async loadMaterials() {
    try {
      const res = await api.callFunction('getUserMaterials', {});
      if (res.success) {
        this.setData({ materials: res.materials || [], loading: false });
      } else {
        this.setData({ error: res.error || '加载失败', loading: false });
      }
    } catch (err) {
      this.setData({ error: err.message, loading: false });
    }
  },

  onToggleMaterial(e) {
    const id = e.currentTarget.dataset.id;
    const selected = [...this.data.selectedMaterials];
    const idx = selected.indexOf(id);
    if (idx > -1) {
      selected.splice(idx, 1);
    } else {
      selected.push(id);
    }
    this.setData({ selectedMaterials: selected });
  },

  onNumChange(e) {
    this.setData({ numQuestions: parseInt(e.detail.value, 10) });
  },

  onDifficultyChange(e) {
    this.setData({ difficulty: this.data.difficulties[e.detail.value].value });
  },

  async onStartExam() {
    const { selectedMaterials, numQuestions, difficulty } = this.data;

    if (selectedMaterials.length === 0) {
      this.setData({ error: '请选择至少一份资料' });
      return;
    }

    this.setData({ creating: true, error: '' });

    try {
      const res = await api.callFunction('startExclusiveExam', {
        material_ids: selectedMaterials,
        num_questions: numQuestions,
        difficulty
      });

      if (res.success) {
        wx.navigateTo({
          url: `/pages/assessment/assessment?exam_id=${res.exam_id}&type=exclusive`
        });
      } else {
        this.setData({ error: res.error || '创建失败' });
      }
    } catch (err) {
      this.setData({ error: err.message || '创建失败，请重试' });
    } finally {
      this.setData({ creating: false });
    }
  }
});
