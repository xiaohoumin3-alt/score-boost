/**
 * 家长测评页面
 * 功能：让家长先做题，再让孩子做题，最后对比结果
 */

const app = getApp();
const api = require('../../utils/cloudApi.js');

Page({
  data: {
    // 页面状态：start -> parent_quiz -> parent_result -> child_quiz -> child_result -> comparison
    status: 'start',

    // 年级选择
    grade: '',
    gradeIndex: null, // picker索引 (0-8)
    grades: [
      { value: '1', label: '一年级' },
      { value: '2', label: '二年级' },
      { value: '3', label: '三年级' },
      { value: '4', label: '四年级' },
      { value: '5', label: '五年级' },
      { value: '6', label: '六年级' },
      { value: '7', label: '初一' },
      { value: '8', label: '初二' },
      { value: '9', label: '初三' }
    ],

    // 科目选择
    subject: 'math',
    subjectIndex: 0, // 默认数学
    subjects: [
      { value: 'math', label: '数学' },
      { value: 'chinese', label: '语文' },
      { value: 'english', label: '英语' }
    ],

    // 题目相关
    questions: [],
    currentQuestionIndex: 0,
    currentQuestion: null,
    selectedAnswer: '',
    answers: [],

    // 计时
    startTime: 0,
    duration: 0,

    // 结果
    assessmentId: '',
    parentResult: null,
    childResult: null,
    comparisonResult: null,

    // 加载状态
    loading: false,
    error: '',
    invite_code: '',

    // 公众号发帖相关
    postingOA: false,
    hasOAPosted: false,
    posterImagePath: '',
    showPosterPreview: false,
    canUsePublish: false  // official-account-publish 版本兼容
  },

  onLoad(options) {
    console.log('[parentAssessment] onLoad, options:', options);

    // 如果有预设年级
    if (options.grade) {
      this.setData({ grade: options.grade });
    }

    // Load invite code for share tracking
    try {
      wx.cloud.callFunction({
        name: 'pointsManager',
        data: { action: 'getPoints' },
        success: (res) => {
          if (res.result && res.result.success && res.result.data) {
            this.setData({ invite_code: res.result.data.invite_code || '' });
          }
        }
      });
    } catch (e) { /* non-critical */ }

    // 版本检测：official-account-publish 需要基础库 3.9.3+
    try {
      const sdkVersion = wx.getAppBaseInfo().SDKVersion;
      const canUsePublish = this.compareVersion(sdkVersion, '3.9.3') >= 0;
      this.setData({ canUsePublish });
      console.log('[parentAssessment] SDK:', sdkVersion, 'canUsePublish:', canUsePublish);
    } catch (e) {
      this.setData({ canUsePublish: false });
    }
  },

  // 版本号比较工具
  compareVersion(v1, v2) {
    const a = v1.split('.').map(Number);
    const b = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const na = a[i] || 0;
      const nb = b[i] || 0;
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  },

  // 选择年级
  onGradeChange(e) {
    const index = parseInt(e.detail.value);
    const selectedGrade = this.data.grades[index];
    console.log('[onGradeChange] index:', index, 'grade:', selectedGrade.value);
    this.setData({
      gradeIndex: index,
      grade: selectedGrade.value
    });
  },

  onSubjectChange(e) {
    const index = parseInt(e.detail.value);
    const selectedSubject = this.data.subjects[index];
    console.log('[onSubjectChange] index:', index, 'subject:', selectedSubject.value);
    this.setData({
      subjectIndex: index,
      subject: selectedSubject.value
    });
  },

  // 开始测评
  async startAssessment() {
    const { grade, subject } = this.data;

    if (!grade) {
      wx.showToast({ title: '请选择年级', icon: 'none' });
      api.track('parent_assessment_start', { grade, subject });
      return;
    }

    if (!subject) {
      wx.showToast({ title: '请选择科目', icon: 'none' });
      api.track('parent_assessment_start', { grade, subject });
      return;
    }

    this.setData({ loading: true, error: '' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'parentAssessment',
        data: {
          action: 'start',
          grade: grade,
          subject: subject
        }
      });

      console.log('[startAssessment] result:', res.result);

      if (res.result.success) {
        const { assessment_id, questions } = res.result.data;

        this.setData({
          status: 'parent_quiz',
          assessmentId: assessment_id,
          questions: questions,
          currentQuestionIndex: 0,
          currentQuestion: questions[0],
          selectedAnswer: '',
          answers: [],
          startTime: Date.now(),
          loading: false
        });
      } else {
        this.setData({
          loading: false,
          error: res.result.error || '启动测评失败'
        });
      }
    } catch (e) {
      console.error('[startAssessment] Error:', e);
      this.setData({
        loading: false,
        error: '网络错误，请稍后重试'
      });
    }
  },

  // 选择答案
  onSelectAnswer(e) {
    const answer = e.currentTarget.dataset.answer;
    this.setData({ selectedAnswer: answer });
  },

  // 下一题
  async nextQuestion() {
    const {
      currentQuestionIndex,
      questions,
      selectedAnswer,
      answers,
      status
    } = this.data;

    if (!selectedAnswer) {
      wx.showToast({ title: '请选择答案', icon: 'none' });
      return;
    }

    // 保存答案
    const newAnswers = [...answers, selectedAnswer];
    const nextIndex = currentQuestionIndex + 1;

    if (nextIndex < questions.length) {
      // 还有题目
      this.setData({
        answers: newAnswers,
        currentQuestionIndex: nextIndex,
        currentQuestion: questions[nextIndex],
        selectedAnswer: ''
      });
    } else {
      // 完成测评
      const duration = Math.round((Date.now() - this.data.startTime) / 1000);

      this.setData({
        answers: newAnswers,
        duration: duration,
        loading: true
      });

      if (status === 'parent_quiz') {
        // 提交家长答案
        await this.submitParentAnswers(newAnswers, duration);
      } else if (status === 'child_quiz') {
        // 提交孩子答案
        await this.submitChildAnswers(newAnswers, duration);
      }
    }
  },

  // 提交家长答案
  async submitParentAnswers(answers, duration) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'parentAssessment',
        data: {
          action: 'submitParent',
          assessment_id: this.data.assessmentId,
          answers: answers,
          duration: duration
        }
      });

      console.log('[submitParentAnswers] result:', res.result);

      if (res.result.success) {
        const { parent_score, questions, role } = res.result.data;

        this.setData({
          status: 'parent_result',
          parentResult: res.result.data,
          loading: false
        });
      } else {
        this.setData({
          loading: false,
          error: res.result.error || '提交失败'
        });
      }
    } catch (e) {
      console.error('[submitParentAnswers] Error:', e);
      this.setData({
        loading: false,
        error: '网络错误，请稍后重试'
      });
    }
  },

  // 开始孩子测评
  startChildAssessment() {
    const { parentResult } = this.data;

    this.setData({
      status: 'child_quiz',
      questions: parentResult.questions,
      currentQuestionIndex: 0,
      currentQuestion: parentResult.questions[0],
      selectedAnswer: '',
      answers: [],
      startTime: Date.now(),
      loading: false
    });
  },

  // 提交孩子答案
  async submitChildAnswers(answers, duration) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'parentAssessment',
        data: {
          action: 'submitChild',
          assessment_id: this.data.assessmentId,
          answers: answers,
          duration: duration
        }
      });

      console.log('[submitChildAnswers] result:', res.result);

      if (res.result.success) {
        this.setData({
          status: 'comparison',
          comparisonResult: res.result.data,
          loading: false
        });
      } else {
        this.setData({
          loading: false,
          error: res.result.error || '提交失败'
        });
      }
    } catch (e) {
      console.error('[submitChildAnswers] Error:', e);
      this.setData({
        loading: false,
        error: '网络错误，请稍后重试'
      });
    }
  },

  // 分享结果
  onShareAppMessage() {
    const { comparisonResult, grade, invite_code } = this.data;

    const basePath = invite_code
      ? `/pages/parent-assessment/parent-assessment?invited_by=${invite_code}`
      : '/pages/parent-assessment/parent-assessment';

    api.track('parent_assessment_share', { grade, has_invite_code: !!invite_code });

    if (!comparisonResult) {
      return {
        title: '家长测评：你真的了解你孩子的学习水平吗？',
        path: basePath
      };
    }

    const { parent, child, message } = comparisonResult;

    return {
      title: `我做了${grade}年级数学题，得分${parent.score}分！${message}`,
      path: invite_code ? `${basePath}&grade=${grade}` : `/pages/parent-assessment/parent-assessment?grade=${grade}`
    };
  },
  // ========== 公众号一键发帖 ==========

  // 生成战报海报到Canvas，返回临时图片路径
  generateBattlePoster() {
    return new Promise((resolve, reject) => {
      const query = this.createSelectorQuery();
      query.select('#battleReportCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res[0] || !res[0].node) {
            reject(new Error('Canvas节点未找到'));
            return;
          }

          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          const dpr = wx.getWindowInfo().pixelRatio;
          const width = 750;
          const height = 1000;
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          ctx.scale(dpr, dpr);

          const { comparisonResult, grade } = this.data;
          if (!comparisonResult) {
            reject(new Error('没有对比结果'));
            return;
          }

          const { parent, child } = comparisonResult;
          const grades = ['', '一', '二', '三', '四', '五', '六', '初一', '初二', '初三'];
          const gradeLabel = grades[parseInt(grade)] || grade;

          // 背景
          ctx.fillStyle = '#0f0f23';
          ctx.fillRect(0, 0, width, height);

          // 顶部装饰条
          const gradient = ctx.createLinearGradient(0, 0, width, 0);
          gradient.addColorStop(0, '#667eea');
          gradient.addColorStop(1, '#764ba2');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, width, 8);

          // 标题
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 42px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('亲子擂台赛战报', width / 2, 80);

          // 副标题
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.font = '28px sans-serif';
          ctx.fillText(gradeLabel + '年级数学', width / 2, 120);

          // VS分隔区域
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(50, 160, width - 100, 320);
          this.roundRect(ctx, 50, 160, width - 100, 320, 20);
          ctx.fill();

          // 家长分数
          ctx.fillStyle = '#667eea';
          ctx.font = 'bold 100px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(parent.score + '', width * 0.25, 310);
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.font = '28px sans-serif';
          ctx.fillText('家长', width * 0.25, 210);
          ctx.font = '24px sans-serif';
          ctx.fillText('答对 ' + parent.correct_count + '/' + parent.total_questions, width * 0.25, 400);
          ctx.fillText('用时 ' + parent.duration + '秒', width * 0.25, 435);

          // VS圆
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(width / 2, 290, 40, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#764ba2';
          ctx.font = 'bold 32px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('VS', width / 2, 290);
          ctx.textBaseline = 'alphabetic';

          // 孩子分数
          ctx.fillStyle = '#00D9A5';
          ctx.font = 'bold 100px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(child.score + '', width * 0.75, 310);
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.font = '28px sans-serif';
          ctx.fillText('孩子', width * 0.75, 210);
          ctx.font = '24px sans-serif';
          ctx.fillText('答对 ' + child.correct_count + '/' + child.total_questions, width * 0.75, 400);
          ctx.fillText('用时 ' + child.duration + '秒', width * 0.75, 435);

          // 结论
          const winner = comparisonResult.comparison.winner;
          let conclusion = '不相上下！';
          let conclusionColor = '#FFD700';
          if (winner === 'child') {
            conclusion = '孩子赢了！后生可畏！';
            conclusionColor = '#00D9A5';
          } else if (winner === 'parent') {
            conclusion = '家长险胜！孩子加油！';
            conclusionColor = '#667eea';
          }
          ctx.fillStyle = conclusionColor;
          ctx.font = 'bold 36px sans-serif';
          ctx.fillText(conclusion, width / 2, 540);

          // 分割线
          ctx.strokeStyle = 'rgba(255,255,255,0.1)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(100, 580);
          ctx.lineTo(width - 100, 580);
          ctx.stroke();

          // 底部文案
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.font = '24px sans-serif';
          ctx.fillText('你也来试试？扫码参加亲子擂台赛', width / 2, 630);

          // 小程序码占位（用文字代替，因为无法在小程序内生成真实码）
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.lineWidth = 2;
          this.roundRect(ctx, width / 2 - 80, 660, 160, 160, 12);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.font = '22px sans-serif';
          ctx.fillText('小程序码', width / 2, 750);

          // 底部品牌
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.font = '20px sans-serif';
          ctx.fillText('日日守护 · 亲子擂台赛', width / 2, 920);

          // 底部装饰条
          const gradient2 = ctx.createLinearGradient(0, 0, width, 0);
          gradient2.addColorStop(0, '#667eea');
          gradient2.addColorStop(1, '#764ba2');
          ctx.fillStyle = gradient2;
          ctx.fillRect(0, height - 8, width, 8);

          // 导出图片
          wx.canvasToTempFilePath({
            canvas: canvas,
            success: (exportRes) => {
              resolve(exportRes.tempFilePath);
            },
            fail: (err) => {
              reject(err);
            }
          });
        });
    });
  },

  // 辅助：圆角矩形
  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },

  // 一键发帖到公众号
  async postToOfficialAccount() {
    if (this.data.postingOA) return;

    this.setData({ postingOA: true });

    try {
      // Step 1: 生成战报海报
      console.log('[postToOA] 开始生成战报海报');
      const posterPath = await this.generateBattlePoster();
      console.log('[postToOA] 海报生成成功:', posterPath);
      this.setData({ posterImagePath: posterPath });

      // Step 2: 调用 wx.shareToOfficialAccount
      const { comparisonResult, grade, assessmentId } = this.data;
      const winner = comparisonResult.comparison.winner;
      let title = '亲子擂台赛战报';
      if (winner === 'child') {
        title = '孩子赢了！亲子擂台赛结果出炉';
      } else if (winner === 'parent') {
        title = '家长险胜！亲子擂台赛结果';
      }

      const content = `家长${comparisonResult.parent.score}分 vs 孩子${comparisonResult.child.score}分\n` +
        `家长答对${comparisonResult.parent.correct_count}/${comparisonResult.parent.total_questions}，` +
        `孩子答对${comparisonResult.child.correct_count}/${comparisonResult.child.total_questions}`;

      console.log('[postToOA] 调用 wx.shareToOfficialAccount, title:', title);

      wx.shareToOfficialAccount({
        title: title,
        content: content,
        tags: ['亲子擂台赛', '家长测评', '数学'],
        images: [posterPath],
        path: `/pages/parent-assessment/parent-assessment?grade=${grade}&from=oa_post&assessment_id=${assessmentId}`,
        success: (res) => {
          console.log('[postToOA] 发帖成功:', res);
          this.setData({
            postingOA: false,
            hasOAPosted: true
          });
          wx.showToast({ title: '发帖成功！', icon: 'success' });
        },
        fail: (err) => {
          console.error('[postToOA] 发帖失败:', err);
          this.setData({ postingOA: false });

          // 降级：如果shareToOfficialAccount不可用，展示海报让用户手动分享
          if (err.errMsg && err.errMsg.indexOf('not support') > -1) {
            console.log('[postToOA] 降级到海报预览模式');
            this.setData({ showPosterPreview: true });
            wx.showToast({ title: '当前版本不支持一键发帖，已生成海报可保存分享', icon: 'none', duration: 3000 });
          } else {
            wx.showToast({ title: '发帖失败: ' + (err.errMsg || '未知错误'), icon: 'none', duration: 3000 });
          }
        }
      });
    } catch (e) {
      console.error('[postToOA] 整体失败:', e);
      this.setData({ postingOA: false });
      wx.showToast({ title: '生成战报失败', icon: 'none' });
    }
  },

  // 保存海报到相册
  savePoster() {
    const { posterImagePath } = this.data;
    if (!posterImagePath) return;

    wx.saveImageToPhotosAlbum({
      filePath: posterImagePath,
      success: () => {
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      },
      fail: (err) => {
        if (err.errMsg.indexOf('auth deny') > -1 || err.errMsg.indexOf('authorize') > -1) {
          wx.showModal({
            title: '需要授权',
            content: '请允许访问相册以保存海报',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.openSetting();
              }
            }
          });
        }
      }
    });
  },

  // 关闭海报预览
  closePosterPreview() {
    this.setData({ showPosterPreview: false });
  },

  // ========== official-account-publish 组件事件 ==========

  // 贴图列表为空（冷启动，引导用户发表第一条）
  onPublishListEmpty() {
    console.log('[tie-zi] 贴图列表为空，冷启动阶段');
  },

  // 用户从组件发表贴图成功
  onPublishSuccess(e) {
    console.log('[tie-zi] 发表成功:', e.detail);
    const postUrl = e.detail && e.detail.postUrl;
    if (postUrl) {
      console.log('[tie-zi] 贴图链接:', postUrl);
    }
    wx.showToast({ title: '战报发表成功！', icon: 'success' });
  },

  // 用户发表失败
  onPublishFail(e) {
    console.error('[tie-zi] 发表失败:', e.detail);
  },

  // 列表拉取失败
  onPublishError(e) {
    console.error('[tie-zi] 组件错误:', e.detail);
  },

  // 重新测评
  restart() {
    this.setData({
      status: 'start',
      grade: '',
      questions: [],
      currentQuestionIndex: 0,
      currentQuestion: null,
      selectedAnswer: '',
      answers: [],
      startTime: 0,
      duration: 0,
      assessmentId: '',
      parentResult: null,
      childResult: null,
      comparisonResult: null,
      loading: false,
      error: '',
      postingOA: false,
      hasOAPosted: false,
      posterImagePath: '',
      showPosterPreview: false
    });
  },

  // 返回首页
  goHome() {
    wx.navigateBack();
  }
});
