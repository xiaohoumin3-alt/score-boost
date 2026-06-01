const app = getApp();
const api = require('../../utils/cloudApi.js');

Page({
  data: {
    fileType: '',
    fileName: '',
    fileSize: 0,
    materialType: 'personal',
    subject: '',
    grade: '',
    subjects: [
      { value: 'chinese', label: '语文' },
      { value: 'math', label: '数学' },
      { value: 'english', label: '英语' },
      { value: 'physics', label: '物理' },
      { value: 'chemistry', label: '化学' },
      { value: 'biology', label: '生物' },
      { value: 'history', label: '历史' },
      { value: 'geography', label: '地理' },
      { value: 'politics', label: '政治' }
    ],
    grades: [
      { value: '七年级上', label: '七年级上' },
      { value: '七年级下', label: '七年级下' },
      { value: '八年级上', label: '八年级上' },
      { value: '八年级下', label: '八年级下' },
      { value: '九年级上', label: '九年级上' },
      { value: '九年级下', label: '九年级下' },
      { value: '高一', label: '高一' },
      { value: '高二', label: '高二' },
      { value: '高三', label: '高三' }
    ],
    uploading: false,
    uploadProgress: 0,
    result: null,
    error: ''
  },

  onLoad() {},

  onChooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf', 'docx', 'txt'],
      success: (res) => {
        const file = res.tempFiles[0];
        const ext = file.name.split('.').pop().toLowerCase();

        if (!['pdf', 'docx', 'txt'].includes(ext)) {
          this.setData({ error: '仅支持 PDF、DOCX、TXT 格式' });
          return;
        }

        this.setData({
          fileName: file.name,
          fileSize: file.size,
          fileType: ext,
          filePath: file.path,
          error: ''
        });
      }
    });
  },

  onMaterialTypeChange(e) {
    this.setData({ materialType: e.detail.value });
  },

  onSubjectChange(e) {
    this.setData({ subject: this.data.subjects[e.detail.value].value });
  },

  onGradeChange(e) {
    this.setData({ grade: this.data.grades[e.detail.value].value });
  },

  async onUpload() {
    const { fileName, filePath, fileType, materialType, subject, grade } = this.data;

    if (!fileName) {
      this.setData({ error: '请选择文件' });
      return;
    }
    if (!subject) {
      this.setData({ error: '请选择学科' });
      return;
    }
    if (!grade) {
      this.setData({ error: '请选择年级' });
      return;
    }

    this.setData({ uploading: true, uploadProgress: 0, error: '', result: null });

    try {
      // 上传文件到云存储
      this.setData({ uploadProgress: 20 });
      const cloudPath = `materials/${Date.now()}_${fileName}`;
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath
      });

      this.setData({ uploadProgress: 50 });

      // 调用 uploadMaterial 云函数
      const res = await api.callFunction('uploadMaterial', {
        file_url: uploadRes.fileID,
        file_name: fileName,
        file_type: fileType,
        material_type: materialType,
        subject,
        grade
      });

      this.setData({ uploadProgress: 100 });

      if (res.success) {
        this.setData({
          result: {
            success: true,
            message: materialType === 'personal' ? '资料上传成功！可在专属测评中使用' : '资料已提交审核，管理员审核后将更新到公共知识库',
            material_id: res.material_id,
            kp_count: res.knowledge_points_count || 0
          }
        });
      } else {
        this.setData({ error: res.error || '上传失败' });
      }
    } catch (err) {
      console.error('上传失败:', err);
      this.setData({ error: err.message || '上传失败，请重试' });
    } finally {
      this.setData({ uploading: false });
    }
  },

  onMaterialTypeChange(e) {
    this.setData({ materialType: e.detail.value });
  },

  goToExclusiveExam() {
    wx.navigateTo({ url: '/pages/exclusive-exam-start/exclusive-exam-start' });
  }
});
