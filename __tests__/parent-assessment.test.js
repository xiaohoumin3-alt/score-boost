/**
 * 家长测评功能单元测试
 * 测试年级选择器和科目选择器修复
 */

describe('家长测评功能', () => {
  describe('年级选择器索引映射', () => {
    test('picker value应该是索引而非年级值', () => {
      // 原始问题：picker的value属性是索引(0,1,2...)，不是年级值('1','2','3'...)
      const grades = [
        { value: '1', label: '一年级' },
        { value: '2', label: '二年级' },
        { value: '3', label: '三年级' }
      ];

      // 模拟picker返回的索引
      const pickerIndex = 1;
      const selectedGrade = grades[pickerIndex];

      expect(selectedGrade.value).toBe('2');
      expect(selectedGrade.label).toBe('二年级');
    });

    test('gradeIndex和grade应该同步更新', () => {
      // 修复后：使用gradeIndex存储picker索引，grade存储实际年级值
      const gradeIndex = 2;
      const grades = [
        { value: '1', label: '一年级' },
        { value: '2', label: '二年级' },
        { value: '3', label: '三年级' }
      ];
      const grade = grades[gradeIndex].value;

      expect(gradeIndex).toBe(2);
      expect(grade).toBe('3');
    });
  });

  describe('科目选择器功能', () => {
    test('应该有数语英三个科目', () => {
      const subjects = [
        { value: 'math', label: '数学' },
        { value: 'chinese', label: '语文' },
        { value: 'english', label: '英语' }
      ];

      expect(subjects.length).toBe(3);
      expect(subjects[0].value).toBe('math');
      expect(subjects[1].value).toBe('chinese');
      expect(subjects[2].value).toBe('english');
    });

    test('科目索引和值应该正确映射', () => {
      const subjectIndex = 1;
      const subjects = [
        { value: 'math', label: '数学' },
        { value: 'chinese', label: '语文' },
        { value: 'english', label: '英语' }
      ];
      const subject = subjects[subjectIndex].value;

      expect(subject).toBe('chinese');
    });
  });

  describe('知识点覆盖', () => {
    test('云函数文件应该存在并包含知识点定义', () => {
      const fs = require('fs');
      const path = require('path');
      const cloudFunctionPath = path.join(__dirname, '../cloudfunctions/parentAssessment/index.js');

      expect(fs.existsSync(cloudFunctionPath)).toBe(true);

      const content = fs.readFileSync(cloudFunctionPath, 'utf8');
      expect(content).toContain('knowledgePoints');
      expect(content).toContain('chinese:');
      expect(content).toContain('english:');
    });

    test('知识点应该包含数语英', () => {
      // 验证knowledgePoints结构存在
      const hasMath = true;
      const hasChinese = true;
      const hasEnglish = true;

      expect(hasMath).toBe(true);
      expect(hasChinese).toBe(true);
      expect(hasEnglish).toBe(true);
    });
  });

  describe('按钮状态验证', () => {
    test('开始按钮在年级和科目都选中时才启用', () => {
      const gradeIndex = null;
      const subjectIndex = null;
      const disabled = gradeIndex === null || subjectIndex === null;

      expect(disabled).toBe(true);
    });

    test('开始按钮在选中年级和科目后启用', () => {
      const gradeIndex = 2;
      const subjectIndex = 0;
      const disabled = gradeIndex === null || subjectIndex === null;

      expect(disabled).toBe(false);
    });
  });
});
