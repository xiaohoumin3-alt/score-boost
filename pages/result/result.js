const app = getApp();
const api = require('../../utils/cloudApi.js');
const { resolveKpNames } = require('../../utils/knowledgeMap.js');

Page({
  data: {
    score: 0,
    total: 0,
    accuracy: 0,
    mode: 'assessment',
    isPerfect: false,
    assessmentId: '',
    retestEligible: false,
    targetDifficulty: '',
    showRetestCheck: false,
    retestReason: '',
    perfectShown: false,
    nextReviewAt: null,
    nextReviewText: '',
    showReviewTip: false,
    // 全分数段难度引导
    difficultyGuidance: null,
    guidanceButtonText: '',
    guidanceSubText: '',
    // 分数预估
    estimatedScore: null,
    examScore: null,
    scoreLevel: null,
    scoreConfidence: null,
    scoreMargin: null,
    isPrimarySchool: null, // 学段标识
    // 两阶段测评精度字段
    currentSE: null,
    currentSEText: '',
    accuracyBarWidth: '0%',
    theta: null,
    needsExtendedAssessment: false,
    accuracyLevel: null,
    // 用户选择的年级和科目
    userGrade: '',
    userSubject: ''
  },

  onLoad(query) {
    const mode = query.mode || 'assessment';

    if (mode === 'practice') {
      const correct = parseInt(query.correct) || 0;
      const total = parseInt(query.total) || 0;
      const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
      const isPerfect = correct === total && total > 0;

      // 解析知识点统计
      let kpStats = [];
      if (query.kpStats) {
        try {
          kpStats = JSON.parse(decodeURIComponent(query.kpStats));
          kpStats = resolveKpNames(kpStats);
        } catch (e) {
          // ignore parse error
        }
      }

      this.setData({ score: correct, total, accuracy, mode: 'practice', isPerfect, kpStats });

      // M6: 获取复习时间
      this.loadNextReviewTime();
    } else {
      const assessmentId = query.assessmentId || '';
      const score = parseInt(query.score) || 0;
      const total = parseInt(query.total) || 5;
      const isPerfect = score === total;
      const userGrade = query.grade ? decodeURIComponent(query.grade) : (app.globalData.grade || '八年级');
      const userSubject = query.subject ? decodeURIComponent(query.subject) : (app.globalData.subject || '数学');

      this.setData({
        score,
        total,
        accuracy: parseInt(query.accuracy) || 0,
        mode: 'assessment',
        isPerfect,
        assessmentId,
        userGrade,
        userSubject
      });

      // 计算难度引导策略（全分数段）
      const guidance = this.getDifficultyGuidance(score);
      this.setData({
        difficultyGuidance: guidance,
        guidanceButtonText: guidance.buttonText,
        guidanceSubText: guidance.subText
      });

      // 分数预估（传递已解码的科目名）
      this.estimateScore(score, total, userSubject, userGrade, assessmentId);

      // 精度检查（两阶段测评）
      const parsedSE = parseFloat(query.se);
      const se = Number.isFinite(parsedSE) ? Math.max(0, parsedSE) : 0.5;
      const theta = parseFloat(query.theta) || 0;
      const TARGET_SE = 0.3;  // 目标标准误差
      const needsExtendedAssessment = se > TARGET_SE && total <= 10;  // 5题测评且精度不足
      const accuracyPercent = Math.max(0, Math.min(100, (1 - se) * 100));

      this.setData({
        currentSE: se,
        currentSEText: se.toFixed(2),
        accuracyBarWidth: `${accuracyPercent.toFixed(1)}%`,
        theta: theta,
        needsExtendedAssessment: needsExtendedAssessment,
        accuracyLevel: this.getAccuracyLevel(se)
      });

      // 检查复测资格（有assessmentId即可，包括满分）
      if (assessmentId) {
        this.checkRetestEligibility();
      }
    }

    if (this.data.isPerfect) {
      this.checkAndUnlockPerfectAchievement();
      this.triggerConfetti();
    }
    api.track('result_view', { mode: this.data.mode, score: this.data.score, total: this.data.total, accuracy: this.data.accuracy });
  },

  /**
   * 根据分数计算难度引导策略
   * @param {number} score - 测评分数
   * @returns {object} 引导策略对象
   */
  getDifficultyGuidance(score) {
    const accuracy = this.data.accuracy || 0;

    // 防御：处理异常值
    if (isNaN(accuracy) || accuracy < 0) {
      return {
        action: 'reset',
        targetDifficulty: 'easy',
        buttonText: '重新开始测评',
        subText: '数据异常，请重新测评',
        reason: '数据异常'
      };
    }

    // 全错：特别提示
    if (accuracy === 0) {
      return {
        action: 'reset',
        targetDifficulty: 'easy',
        buttonText: '重新开始基础测评',
        subText: '建议从基础开始，系统会帮你逐步提升',
        reason: '需要重新建立基础'
      };
    }

    if (accuracy >= 90) {
      return {
        action: 'upgrade',
        targetDifficulty: 'hard',
        buttonText: '挑战Hard难度测评',
        subText: '为你提升挑战，突破极限',
        reason: '当前难度对你已偏低'
      };
    }
    if (accuracy >= 60) {
      return {
        action: 'maintain',
        targetDifficulty: 'medium',
        buttonText: '继续当前难度练习',
        subText: '继续保持，巩固提升',
        reason: '当前难度适合你'
      };
    }
    return {
      action: 'downgrade',
      targetDifficulty: 'easy',
      buttonText: '尝试Easy难度',
      subText: '为你降低难度，打好基础',
      reason: '当前难度对你偏高'
    };
  },

  /**
   * 分数预估
   * 优先使用 scoreCalibration 云函数（基于真实题目 IRT 参数）
   * 降级使用本地 ScoreEstimator（基于正确率推算）
   */
  async estimateScore(correct, total, subject, grade, assessmentId) {
    // 方案1: 有 assessmentId 时调用云端 scoreCalibration（精确）
    if (assessmentId) {
      try {
        const res = await api.callCloudFunction('scoreCalibration', { assessment_id: assessmentId });
        if (res && res.success && res.data) {
          const d = res.data;
          this.setData({
            estimatedScore: d.estimatedScore,
            examScore: d.examScore,
            scoreLevel: { level: d.level, text: d.levelText, color: this._levelColor(d.level), emoji: this._levelEmoji(d.level) },
            scoreConfidence: d.confidence,
            scoreMargin: d.margin,
            isPrimarySchool: d.isPrimarySchool,
          });
          console.log('[result] Cloud score estimation:', d);
          return;
        }
      } catch (e) {
        console.warn('[result] Cloud scoreCalibration failed, falling back to local:', e);
      }
    }

    // 方案2: 降级到本地估算（基于正确率）
    try {
      const ScoreEstimator = require('../../cloudfunctions/shared/models/score-estimator.js');
      const estimator = new ScoreEstimator(subject || 'math');

      const responses = [];
      for (let i = 0; i < total; i++) {
        responses.push({
          item_id: `q${i}`,
          correct: i < correct ? 1 : 0,
          question_type: 'choice',
        });
      }

      const difficultyAvg = correct / total;
      const result = estimator.estimateFromResponses(responses, grade || '8');

      this.setData({
        estimatedScore: result.estimatedScore,
        examScore: result.examScore,
        scoreLevel: { level: result.level, text: result.text, color: result.color, emoji: result.emoji },
        scoreConfidence: result.confidence,
        scoreMargin: result.margin,
        isPrimarySchool: result.isPrimarySchool,
      });
      console.log('[result] Local score estimation:', result);
    } catch (e) {
      console.error('[result] Score estimation error:', e);
    }
  },

  _levelColor(level) {
    const map = { A: '#00D9A5', B: '#4CAF50', C: '#FFA94D', D: '#FF6B6B', E: '#FF4444' };
    return map[level] || '#999';
  },

  _levelEmoji(level) {
    const map = { A: '🏆', B: '👍', C: '✅', D: '📝', E: '💪' };
    return map[level] || '';
  },

  async loadNextReviewTime() {
    try {
      const res = await api.getKpProgress();
      if (res && res.length > 0) {
        // 找到最近的复习时间
        const upcomingReviews = res
          .filter(kp => kp.next_review_at)
          .map(kp => ({ kp, time: new Date(kp.next_review_at).getTime() }))
          .filter(item => item.time > Date.now())
          .sort((a, b) => a.time - b.time);

        if (upcomingReviews.length > 0) {
          const nextTime = upcomingReviews[0].time;
          const now = Date.now();
          const diffMs = nextTime - now;
          const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

          let reviewText = '';
          if (diffDays > 0) {
            reviewText = `${diffDays}天后复习`;
          } else if (diffHours > 0) {
            reviewText = `${diffHours}小时后复习`;
          } else {
            reviewText = '即将复习';
          }

          this.setData({
            nextReviewAt: upcomingReviews[0].time,
            nextReviewText: reviewText,
            showReviewTip: true
          });
        }
      }
    } catch (e) {
      // 静默失败，不影响主流程
    }
  },

  checkAndUnlockPerfectAchievement() {
    const correctCount = this.data.score;
    const totalCount = this.data.total;

    // 满分且至少5题
    const isPerfect = correctCount === totalCount && totalCount >= 5;

    if (isPerfect) {
      const achievements = wx.getStorageSync('achievements') || {};
      const achievementId = 'perfect_practice';

      if (!achievements[achievementId] && !this.data.perfectShown) {
        achievements[achievementId] = {
          unlockedAt: new Date().toISOString(),
          count: 1
        };
        wx.setStorageSync('achievements', achievements);
        this.setData({ perfectShown: true });

        setTimeout(() => {
          wx.showModal({
            title: '🎉 满分表现！',
            content: '太棒了！继续保持！\n⭐ 满分成就已解锁',
            showCancel: false,
            confirmText: '继续'
          });
        }, 1000);
      }
    }
  },

  triggerConfetti() {
    wx.showToast({
      title: '完美表现！',
      icon: 'success',
      duration: 2000
    });
  },

  async checkRetestEligibility() {
    wx.showLoading({ title: '检查中...' });

    try {
      const data = await api.checkRetestEligibility(this.data.assessmentId, this.data.score);
      wx.hideLoading();

      this.setData({
        retestEligible: data.eligible,
        targetDifficulty: data.targetDifficulty || data.target_difficulty || 'easy',
        showRetestCheck: true,
        retestReason: data.reason || ''
      });
    } catch (e) {
      wx.hideLoading();
      console.error('[checkRetestEligibility] error:', e);

      // 降级策略：使用前端计算的引导策略
      const fallbackGuidance = this.getDifficultyGuidance(this.data.score);
      this.setData({
        retestEligible: true,  // 默认允许复测
        targetDifficulty: fallbackGuidance.targetDifficulty,
        showRetestCheck: true,
        retestReason: fallbackGuidance.reason,
        // 设置降级引导（如果还没有的话）
        difficultyGuidance: this.data.difficultyGuidance || fallbackGuidance,
        guidanceButtonText: this.data.guidanceButtonText || fallbackGuidance.buttonText,
        guidanceSubText: this.data.guidanceSubText || fallbackGuidance.subText
      });
    }
  },

  goToPractice() {
    // 埋点：练习点击
    api.track('result_action', {
      action: 'practice_click',
      context: {
        accuracy: this.data.accuracy,
        score: this.data.score,
        total: this.data.total,
        mode: this.data.mode
      }
    });

    wx.switchTab({ url: '/pages/practice/practice' });
  },

  goToRetest() {
    // 优先使用全分数段引导策略中的目标难度
    const guidance = this.data.difficultyGuidance;
    const targetDifficulty = guidance?.targetDifficulty || this.data.targetDifficulty;

    // 验证必要字段
    if (!targetDifficulty) {
      wx.showToast({ title: '引导策略缺失，请重试', icon: 'none' });
      console.error('[goToRetest] 缺少targetDifficulty, guidance:', guidance);
      return;
    }

    // 日志：记录数据流
    console.log('[goToRetest] guidance:', guidance);
    console.log('[goToRetest] targetDifficulty:', targetDifficulty);

    // 传递复测所需参数：原测评ID、分数、目标难度
    const params = [`retest=true`];
    if (this.data.assessmentId) {
      params.push(`assessmentId=${this.data.assessmentId}`);
    }
    if (this.data.score > 0) {
      params.push(`previousScore=${this.data.score}`);
    }
    params.push(`targetDifficulty=${targetDifficulty}`);

    wx.navigateTo({ url: '/pages/assessment/assessment?' + params.join('&') });
  },

  continuePractice() {
    wx.switchTab({ url: '/pages/practice/practice' });
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/home' });
  },

  /**
   * 根据标准误差计算精度等级
   */
  getAccuracyLevel(se) {
    if (se <= 0.2) return { level: '高精度', color: 'green', description: '精度已达到优秀水平' };
    if (se <= 0.3) return { level: '良好', color: 'blue', description: '精度达到目标水平' };
    if (se <= 0.5) return { level: '中等', color: 'orange', description: '建议继续答题提升精度' };
    return { level: '低精度', color: 'red', description: '精度不足，强烈建议继续答题' };
  },

  /**
   * 跳转到深度测评页面
   */
  goToExtendedAssessment() {
    // 埋点：深度测评点击
    api.track('result_action', {
      action: 'extended_assessment_click',
      context: {
        se: this.data.currentSE,
        theta: this.data.theta,
        accuracy: this.data.accuracy,
        score: this.data.score,
        total: this.data.total
      }
    });

    // 使用用户实际选择的年级和科目
    const grade = this.data.userGrade || app.globalData.grade || '3';
    const subject = this.data.userSubject || app.globalData.subject || '数学';

    // 将年级转换为数字（支持数字字符串和中文两种格式）
    const gradeMap = {
      // 数字字符串格式
      '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
      // 中文格式
      '一年级': 1, '二年级': 2, '三年级': 3, '四年级': 4, '五年级': 5, '六年级': 6,
      '七年级': 7, '八年级': 8, '九年级': 9
    };
    const numericGrade = gradeMap[grade] || parseInt(grade) || 3;

    // 将科目转换为英文（支持中文和英文两种格式）
    const subjectMap = {
      '语文': 'chinese', '数学': 'math', '英语': 'english',
      '物理': 'physics', '化学': 'chemistry', '生物': 'biology',
      '历史': 'history', '地理': 'geography', '政治': 'politics',
      // 英文直接映射
      'chinese': 'chinese', 'math': 'math', 'english': 'english',
      'physics': 'physics', 'chemistry': 'chemistry', 'biology': 'biology',
      'history': 'history', 'geography': 'geography', 'politics': 'politics'
    };
    const normalizedSubject = subjectMap[subject] || 'math';

    console.log('[goToExtendedAssessment] 用户选择:', { grade, subject });
    console.log('[goToExtendedAssessment] 映射后:', { numericGrade, normalizedSubject });

    wx.navigateTo({
      url: `/pages/assessment-depth/assessment-depth?grade=${numericGrade}&subject=${normalizedSubject}`
    });
  }
});
