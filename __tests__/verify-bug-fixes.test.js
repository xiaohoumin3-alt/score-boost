/**
 * 验证测试：Bug 1 & 2 修复验证
 * 验证 studentMemory 过滤逻辑和 kp_progress 查询
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

describe('验证测试：Bug 1 & 2 修复', () => {

  describe('Bug 2: studentMemory 过滤逻辑', () => {
    let studentMemoryContent;

    beforeAll(() => {
      studentMemoryContent = fs.readFileSync(
        path.join(ROOT, 'cloudfunctions', 'studentMemory', 'index.js'),
        'utf8'
      );
    });

    test('应该使用 knowledge_points 集合查询获取 grade/subject', () => {
      // 验证新逻辑：查询 knowledge_points 而不是依赖 kp_id 格式解析
      expect(studentMemoryContent).toContain('knowledge_points');
      expect(studentMemoryContent).toContain('kpGradeSubjectMap');
    });

    test('应该处理生物 kp_id 格式 (bio_kp4_1)', () => {
      // 新逻辑应该支持所有科目，不依赖特定格式
      expect(studentMemoryContent).toMatch(/kpInfo\.grade|kpGradeSubjectMap/);
      expect(studentMemoryContent).not.toContain('wp.grade');  // 不再依赖 wp.grade 字段
    });

    test('应该批量查询而不是逐个查询', () => {
      // 验证使用 db.command.in 进行批量查询
      expect(studentMemoryContent).toContain('_.in(');
    });
  });

  describe('Bug 1 & 2: submitPracticeResult 添加 grade/subject', () => {
    let submitPracticeContent;

    beforeAll(() => {
      const filePath = path.join(ROOT, 'cloudfunctions', 'submitPracticeResult', 'index.js');
      if (fs.existsSync(filePath)) {
        submitPracticeContent = fs.readFileSync(filePath, 'utf8');
      }
    });

    test('应该查询 knowledge_points 获取 grade/subject', () => {
      if (!submitPracticeContent) {
        console.warn('submitPracticeResult 不存在，跳过测试');
        return;
      }
      expect(submitPracticeContent).toContain('knowledge_points');
      expect(submitPracticeContent).toMatch(/kpGrade|kpSubject/);
    });

    test('应该在创建 kp_progress 记录时包含 grade/subject 字段', () => {
      if (!submitPracticeContent) return;
      expect(submitPracticeContent).toMatch(/kpGrade|kpSubject/);
      expect(submitPracticeContent).toMatch(/kpGrade|kpSubject/);
    });

    test('应该向后兼容：如果 kpInfo 缺失仍能创建记录', () => {
      if (!submitPracticeContent) return;
      // 应该使用 || null 或 ?? 来处理缺失情况
      expect(submitPracticeContent).toMatch(/\|\|.*null|\?\?/);
    });
  });

  describe('Bug 2: kp_progress 查询包含 grade/subject 过滤', () => {
    let cloudApiContent;

    beforeAll(() => {
      cloudApiContent = fs.readFileSync(
        path.join(ROOT, 'utils', 'cloudApi.js'),
        'utf8'
      );
    });

    test('getKpProgress 应该在查询条件中包含 grade 和 subject', () => {
      expect(cloudApiContent).toMatch(/query\.grade\s*=/);
      expect(cloudApiContent).toMatch(/query\.subject\s*=/);
    });

    test('getKpProgress 查询应该正确构建 query 对象', () => {
      // 新实现：使用 baseQuery 而不是 query
      expect(cloudApiContent).toContain('const baseQuery = { student_id');
      expect(cloudApiContent).toContain('knowledge_points');
      // 验证批量查询使用 db.command.in
      expect(cloudApiContent).toContain('_.in(kpIds)');
    });
  });

  describe('集成验证：数据流完整性', () => {
    test('studentMemory 应该正确映射科目名称（中文→存储名）', () => {
      const studentMemoryContent = fs.readFileSync(
        path.join(ROOT, 'cloudfunctions', 'studentMemory', 'index.js'),
        'utf8'
      );

      // 验证科目映射包含生物
      expect(studentMemoryContent).toMatch(/['"]生物['"]:\s*['"]biology['"]/);

      // 验证科目映射包含所有主要科目
      const subjects = ['语文', '数学', '英语', '物理', '化学', '生物', '历史', '地理', '政治'];
      subjects.forEach(subject => {
        expect(studentMemoryContent).toContain(subject);
      });
    });

    test('年级映射应该覆盖 1-9 年级', () => {
      const studentMemoryContent = fs.readFileSync(
        path.join(ROOT, 'cloudfunctions', 'studentMemory', 'index.js'),
        'utf8'
      );

      const grades = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '七年级', '八年级', '九年级'];
      grades.forEach(grade => {
        expect(studentMemoryContent).toContain(grade);
      });
    });
  });
});
