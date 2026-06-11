/**
 * 家长测评页面
 * 功能：让家长先做题，再让孩子做题，最后对比结果
 */

const app = getApp();
const api = require('../../utils/cloudApi.js');

// 科目-年级兼容性矩阵
const SUBJECT_GRADE_MATRIX = {
  'math': { min: 1, max: 9, label: '数学' },
  'chinese': { min: 1, max: 9, label: '语文' },
  'english': { min: 1, max: 6, label: '英语' },
};

Page({
  data: {
    // 页面状态：start -> parent_quiz -> parent_result -> child_quiz -> child_result -> comparison
    status: 'start',

    // 年级选择 - 默认一年级（可更改）
    grade: '1',
    gradeIndex: 0,
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
    // 动态可用年级
    availableGrades: [],

    // 科目选择 - 默认选中数学
    subject: 'math',
    subjectIndex: 0,
    subjects: [
      { value: 'math', label: '数学' },
      { value: 'chinese', label: '语文' },
      { value: 'english', label: '英语' }
    ],
    // 动态可用科目
    availableSubjects: [],

    // 题目相关
    questions: [],
    currentQuestionIndex: 0,
    currentQuestion: null,
    selectedAnswer: '',
    selectedAnswerLetter: '',
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

  onReady() {
    console.log('[parentAssessment] onReady, current state:', {
      grade: this.data.grade,
      gradeIndex: this.data.gradeIndex,
      grades: this.data.grades,
      gradeLabel: this.data.grades?.[this.data.gradeIndex]?.label,
      subject: this.data.subject,
      subjectIndex: this.data.subjectIndex,
      subjects: this.data.subjects,
      subjectLabel: this.data.subjects?.[this.data.subjectIndex]?.label
    });
  },

  onLoad(options) {
    console.log('[parentAssessment] onLoad, options:', options);

    // 初始化可用选项（全部可用）
    this.setData({
      availableGrades: this.data.grades,
      availableSubjects: this.data.subjects
    });

    // 如果有预设年级
    if (options.grade) {
      const gradeIndex = this.data.grades.findIndex(g => g.value === options.grade);
      if (gradeIndex !== -1) {
        this.setData({ grade: options.grade, gradeIndex });
        this.updateAvailableSubjectsByGrade(options.grade);
        console.log('[parentAssessment] 预设年级:', options.grade, '索引:', gradeIndex);
      }
    } else {
      // 默认年级1，更新可用科目
      this.updateAvailableSubjectsByGrade('1');
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

  // 点击年级选择器（调试用）
  onGradePickerTap() {
    console.log('[onGradePickerTap] 年级选择器被点击, current gradeIndex:', this.data.gradeIndex);
  },

  // 点击科目选择器（调试用）
  onSubjectPickerTap() {
    console.log('[onSubjectPickerTap] 科目选择器被点击, current subjectIndex:', this.data.subjectIndex);
  },

  // 选择年级
  onGradeChange(e) {
    console.log('[onGradeChange] raw e.detail.value:', e.detail.value, 'type:', typeof e.detail.value);
    const index = parseInt(e.detail.value);
    const selectedGrade = this.data.availableGrades[index];
    console.log('[onGradeChange] index:', index, 'grade:', selectedGrade);
    this.setData({
      gradeIndex: index,
      grade: selectedGrade.value
    });
    // 根据年级更新可用科目
    this.updateAvailableSubjectsByGrade(selectedGrade.value);
    console.log('[onGradeChange] after setData, gradeIndex:', this.data.gradeIndex, 'grade:', this.data.grade);
  },

  onSubjectChange(e) {
    console.log('[onSubjectChange] raw e.detail.value:', e.detail.value, 'type:', typeof e.detail.value);
    const index = parseInt(e.detail.value);
    const selectedSubject = this.data.availableSubjects[index];
    console.log('[onSubjectChange] index:', index, 'subject:', selectedSubject);
    this.setData({
      subjectIndex: index,
      subject: selectedSubject.value
    });
    // 根据科目更新可用年级
    this.updateAvailableGradesBySubject(selectedSubject.value);
    console.log('[onSubjectChange] after setData, subjectIndex:', this.data.subjectIndex, 'subject:', this.data.subject);
  },

  /**
   * 根据年级更新可用科目
   */
  updateAvailableSubjectsByGrade(gradeValue) {
    const gradeNum = parseInt(gradeValue, 10);
    const available = this.data.subjects.filter(item => {
      const range = SUBJECT_GRADE_MATRIX[item.value];
      return range && gradeNum >= range.min && gradeNum <= range.max;
    });

    // 检查当前选中的科目是否仍然可用
    const currentSubject = this.data.subject;
    if (currentSubject) {
      const range = SUBJECT_GRADE_MATRIX[currentSubject];
      if (!range || gradeNum < range.min || gradeNum > range.max) {
        // 当前科目不可用，切换到第一个可用科目
        const newSubject = available[0]?.value || 'math';
        const newSubjectIndex = this.data.subjects.findIndex(s => s.value === newSubject);
        this.setData({ subject: newSubject, subjectIndex: newSubjectIndex });
      } else {
        // 更新科目索引以匹配当前科目在新列表中的位置
        const newSubjectIndex = available.findIndex(s => s.value === currentSubject);
        this.setData({ subjectIndex: newSubjectIndex >= 0 ? newSubjectIndex : 0 });
      }
    }

    this.setData({ availableSubjects: available });
    console.log('[updateAvailableSubjectsByGrade] grade:', gradeValue, 'available:', available.map(s => s.label));
  },

  /**
   * 根据科目更新可用年级
   */
  updateAvailableGradesBySubject(subjectValue) {
    const range = SUBJECT_GRADE_MATRIX[subjectValue];
    if (!range) {
      this.setData({ availableGrades: this.data.grades });
      return;
    }

    const available = this.data.grades.filter(grade => {
      const gradeNum = parseInt(grade.value, 10);
      return gradeNum >= range.min && gradeNum <= range.max;
    });

    // 检查当前选中的年级是否仍然可用
    const currentGrade = this.data.grade;
    if (currentGrade) {
      const gradeNum = parseInt(currentGrade, 10);
      if (gradeNum < range.min || gradeNum > range.max) {
        // 当前年级不可用，切换到第一个可用年级
        const newGrade = available[0]?.value || '1';
        const newGradeIndex = this.data.grades.findIndex(g => g.value === newGrade);
        this.setData({ grade: newGrade, gradeIndex: newGradeIndex });
      } else {
        // 更新年级索引以匹配当前年级在新列表中的位置
        const newGradeIndex = available.findIndex(g => g.value === currentGrade);
        this.setData({ gradeIndex: newGradeIndex >= 0 ? newGradeIndex : 0 });
      }
    }

    this.setData({ availableGrades: available });
    console.log('[updateAvailableGradesBySubject] subject:', subjectValue, 'available:', available.map(g => g.label));
  },

  // 开始测评
  startAssessment() {
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

    (async () => {
      try {
        // 步骤1：创建队列任务
        const startRes = await wx.cloud.callFunction({
          name: 'parentAssessment',
          data: {
            action: 'start',
            grade: grade,
            subject: subject
          }
        });

        console.log('[startAssessment] 创建队列结果:', startRes.result);

        if (!startRes.result.success) {
          this.setData({
            loading: false,
            error: startRes.result.error || '启动测评失败'
          });
          return;
        }

        const { task_id, assessment_id } = startRes.result.data;

        // 步骤2：轮询获取题目状态
        await this.pollForQuestions(task_id, assessment_id);
      } catch (e) {
        console.error('[startAssessment] Error:', e);
        this.setData({
          loading: false,
          error: '网络错误，请稍后重试'
        });
      }
    })();
  },

  // 轮询获取题目
  pollForQuestions(taskId, assessmentId) {
    const maxAttempts = 30; // 最多轮询30次（60秒）
    const pollInterval = 2000; // 每2秒轮询一次
    let attempts = 0;

    return new Promise((resolve, reject) => {
      const poll = async () => {
        attempts++;

        try {
          const res = await wx.cloud.callFunction({
            name: 'checkQueueStatus',
            data: { queue_id: taskId }
          });

          console.log(`[pollForQuestions] 第${attempts}次轮询:`, res.result);

          if (res.result.success && res.result.data) {
            const { status, questions } = res.result.data;

            if (status === 'completed' && questions && questions.length > 0) {
              // 完成，获取到题目
              console.log('[pollForQuestions] 题目生成成功，数量:', questions.length);
              this.setData({
                status: 'parent_quiz',
                assessmentId: assessmentId,
                questions: questions,
                currentQuestionIndex: 0,
                currentQuestion: questions[0],
                selectedAnswer: '',
                selectedAnswerLetter: '',
                answers: [],
                startTime: Date.now(),
                loading: false
              });
              resolve();
              return;
            } else if (status === 'failed') {
              // 失败
              this.setData({
                loading: false,
                error: res.result.data.error || '题目生成失败，请重试'
              });
              reject(new Error('Queue task failed'));
              return;
            } else if (attempts >= maxAttempts) {
              // 超时
              this.setData({
                loading: false,
                error: '题目生成超时，请重试'
              });
              reject(new Error('Poll timeout'));
              return;
            } else {
              // 继续轮询
              setTimeout(poll, pollInterval);
            }
          } else {
            this.setData({
              loading: false,
              error: '检查状态失败'
            });
            reject(new Error('Check status failed'));
          }
        } catch (e) {
          console.error('[pollForQuestions] 轮询错误:', e);
          this.setData({
            loading: false,
            error: '网络错误，请稍后重试'
          });
          reject(e);
        }
      };

      // 开始轮询
      poll();
    });
  },

  // 选择答案
  onSelectAnswer(e) {
    const index = e.currentTarget.dataset.answer;
    // 将索引转换为字母（A=0, B=1, C=2, D=3）
    const letter = ['A', 'B', 'C', 'D'][index];
    this.setData({ selectedAnswer: index });  // 高亮用索引
    this.setData({ selectedAnswerLetter: letter });  // 提交用字母
  },

  // 下一题
  nextQuestion() {
    const {
      currentQuestionIndex,
      questions,
      selectedAnswer,
      selectedAnswerLetter,
      answers,
      status
    } = this.data;

    if (!selectedAnswer && selectedAnswer !== 0) {
      wx.showToast({ title: '请选择答案', icon: 'none' });
      return;
    }

    // 保存答案（使用字母）
    const newAnswers = [...answers, selectedAnswerLetter];
    const nextIndex = currentQuestionIndex + 1;

    if (nextIndex < questions.length) {
      // 还有题目
      this.setData({
        answers: newAnswers,
        currentQuestionIndex: nextIndex,
        currentQuestion: questions[nextIndex],
        selectedAnswer: '',
        selectedAnswerLetter: ''
      });
    } else {
      // 完成测评
      const duration = Math.round((Date.now() - this.data.startTime) / 1000);

      this.setData({
        answers: newAnswers,
        duration: duration,
        loading: true
      });

      (async () => {
        if (status === 'parent_quiz') {
          // 提交家长答案
          await this.submitParentAnswers(newAnswers, duration);
        } else if (status === 'child_quiz') {
          // 提交孩子答案
          await this.submitChildAnswers(newAnswers, duration);
        }
      })();
    }
  },

  // 提交家长答案
  submitParentAnswers(answers, duration) {
    console.log('[submitParentAnswers] 提交的答案:', answers);
    console.log('[submitParentAnswers] 答案类型:', answers.map(a => typeof a));

    (async () => {
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

        console.log('[submitParentAnswers] 云函数返回:', res.result);

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
    })();
  },

  // 开始孩子测评
  startChildAssessment() {
    const { parentResult } = this.data;

    // 先进入准备状态，不开始计时
    this.setData({
      status: 'child_prepare',
      questions: parentResult.questions,
      loading: false
    });
  },

  // 孩子开始答题（从准备页面点击）
  startChildQuiz() {
    // 现在开始计时
    this.setData({
      status: 'child_quiz',
      currentQuestionIndex: 0,
      currentQuestion: this.data.questions[0],
      selectedAnswer: '',
      answers: [],
      startTime: Date.now()
    });
  },

  // 提交孩子答案
  submitChildAnswers(answers, duration) {
    (async () => {
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
    })();
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
    return new Promise(async (resolve, reject) => {
      // 先获取小程序码
      let qrcodeTempPath = null;
      try {
        const { grade, assessmentId } = this.data;
        const scene = `grade=${grade}&from=posterp&aid=${assessmentId}`;

        console.log('[generateBattlePoster] 获取小程序码...');
        const qrRes = await wx.cloud.callFunction({
          name: 'getShareCode',
          data: {
            path: 'pages/parent-assessment/parent-assessment',
            scene: scene,
            width: 280
          }
        });

        console.log('[generateBattlePoster] 云函数返回:', qrRes);

        if (qrRes.result && qrRes.result.success) {
          const base64 = qrRes.result.data.base64;
          console.log('[generateBattlePoster] 收到Base64数据，长度:', base64 ? base64.length : 0);

          // 将 Base64 转换为临时文件
          const fs = wx.getFileSystemManager();
          const tempFilePath = `${wx.env.USER_DATA_PATH}/qrcode_${Date.now()}.png`;

          // Base64 数据需要去掉 data:image/png;base64, 前缀（如果有）
          const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
          const buffer = wx.base64ToArrayBuffer(base64Data);

          fs.writeFileSync(tempFilePath, buffer, 'binary');
          qrcodeTempPath = tempFilePath;
          console.log('[generateBattlePoster] 小程序码已保存到:', qrcodeTempPath);
        } else {
          console.error('[generateBattlePoster] 云函数返回失败:', qrRes);
        }
      } catch (e) {
        console.error('[generateBattlePoster] 获取小程序码失败:', e);
      }
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

          // 绘制小程序码（如果获取成功）或占位符
          const qrSize = 160;
          const qrX = width / 2 - qrSize / 2;
          const qrY = 660;

          if (qrcodeTempPath) {
            // 绘制真实小程序码
            const qrImage = canvas.createImage();
            qrImage.onload = () => {
              console.log('[generateBattlePoster] 小程序码图片加载成功');
              // 绘制小程序码
              ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

              // 绘制边框
              ctx.strokeStyle = 'rgba(255,255,255,0.3)';
              ctx.lineWidth = 2;
              this.roundRect(ctx, qrX, qrY, qrSize, qrSize, 12);
              ctx.stroke();

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
            };
            qrImage.onerror = (err) => {
              console.error('[generateBattlePoster] 小程序码加载失败:', err);
              // 降级到占位符
              this.drawQRCodePlaceholder(ctx, width, height, qrX, qrY, qrSize, canvas, resolve, reject);
            };
            qrImage.src = qrcodeTempPath;
          } else {
            // 没有小程序码，使用占位符
            this.drawQRCodePlaceholder(ctx, width, height, qrX, qrY, qrSize, canvas, resolve, reject);
          }
        });
    });
  },

  // 绘制小程序码占位符并导出图片
  drawQRCodePlaceholder(ctx, width, height, qrX, qrY, qrSize, canvas, resolve, reject) {
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, qrX, qrY, qrSize, qrSize, 12);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('小程序码', width / 2, qrY + qrSize / 2 + 8);

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

  // 生成海报并预览（第一步）
  generateAndPreviewPoster() {
    if (this.data.postingOA) return;

    this.setData({ postingOA: true });

    (async () => {
      try {
        console.log('[generateAndPreviewPoster] 开始生成战报海报');
        const posterPath = await this.generateBattlePoster();
        console.log('[generateAndPreviewPoster] 海报生成成功:', posterPath);
        this.setData({
          posterImagePath: posterPath,
          showPosterPreview: true,
          postingOA: false
        });
      } catch (e) {
        console.error('[generateAndPreviewPoster] 生成失败:', e);
        this.setData({ postingOA: false });
        wx.showToast({ title: '生成战报失败', icon: 'none' });
      }
    })();
  },

  // 发到公众号（第二步，必须在用户点击事件中同步调用）
  shareToOfficialAccount() {
    const { posterImagePath, comparisonResult, grade, assessmentId, hasOAPosted } = this.data;

    if (hasOAPosted) {
      wx.showToast({ title: '已发帖成功', icon: 'success' });
      return;
    }

    if (!posterImagePath) {
      wx.showToast({ title: '海报未生成', icon: 'none' });
      return;
    }

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

    console.log('[shareToOfficialAccount] 调用 wx.shareToOfficialAccount, title:', title);

    // 此函数必须在用户点击事件的同步调用栈中调用
    wx.shareToOfficialAccount({
      title: title,
      content: content,
      tags: ['亲子擂台赛', '家长测评', '数学'],
      images: [posterImagePath],
      path: `/pages/parent-assessment/parent-assessment?grade=${grade}&from=oa_post&assessment_id=${assessmentId}`,
      success: (res) => {
        console.log('[shareToOfficialAccount] 发帖成功:', res);
        this.setData({ hasOAPosted: true });
        wx.showToast({ title: '发帖成功！', icon: 'success' });
      },
      fail: (err) => {
        console.error('[shareToOfficialAccount] 发帖失败:', err);

        if (err.errMsg && err.errMsg.indexOf('not support') > -1) {
          wx.showToast({ title: '当前版本不支持一键发帖，可保存海报分享', icon: 'none', duration: 3000 });
        } else if (err.errMsg && err.errMsg.indexOf('TAP gesture') > -1) {
          wx.showToast({ title: '请点击按钮触发发帖', icon: 'none', duration: 3000 });
        } else {
          wx.showToast({ title: '发帖失败: ' + (err.errMsg || '未知错误'), icon: 'none', duration: 3000 });
        }
      }
    });
  },

  // 一键发帖到公众号（已废弃，使用两步式流程）
  postToOfficialAccount() {
    wx.showToast({ title: '请先生成海报，再点击"发到公众号"', icon: 'none', duration: 2000 });
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
      grade: '1',
      gradeIndex: 0,
      subject: 'math',
      subjectIndex: 0,
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
