const fs = require('fs');
const path = require('path');

// 支持命令行参数传入项目路径
const projectDir = process.argv[2] || '/Users/seanxx/score-boost-mini';

console.log('=== 修复 generateAiQuestion ===');
console.log('项目路径:', projectDir);
console.log('');

// 验证项目路径
if (!fs.existsSync(projectDir)) {
  console.error('❌ 项目路径不存在:', projectDir);
  process.exit(1);
}

// 验证 shared 模块存在
const sharedModulePath = path.join(projectDir, 'cloudfunctions/shared/difficulty-guidance.js');
if (!fs.existsSync(sharedModulePath)) {
  console.error('❌ shared 模块不存在:', sharedModulePath);
  console.error('请先执行阶段 1 创建 shared 模块');
  process.exit(1);
}

// 1. 修改 index.js - 添加导入
const indexPath = path.join(projectDir, 'cloudfunctions/generateAiQuestion/index.js');

if (!fs.existsSync(indexPath)) {
  console.error('❌ 文件不存在:', indexPath);
  process.exit(1);
}

let indexContent = fs.readFileSync(indexPath, 'utf8');

// 在现有导入后添加（第 11 行是最后一个导入）
const importPattern = /const \{ loadConfig \} = require\('\.\.\/shared\/llm-core\/config'\);\n/;
if (!indexContent.includes("require('../shared/difficulty-guidance')")) {
  if (importPattern.test(indexContent)) {
    indexContent = indexContent.replace(
      importPattern,
      "$&const { getDifficultyGuidance } = require('../shared/difficulty-guidance');\n"
    );
    fs.writeFileSync(indexPath, indexContent);
    console.log('✓ 添加导入语句（在 loadConfig 导入后）');
  } else {
    console.log('⚠️ 未找到目标导入位置，请手动添加');
  }
} else {
  console.log('✓ 导入语句已存在');
}

// 2. 修改 index.js - 替换 difficultyGuidance 对象为函数调用
indexContent = fs.readFileSync(indexPath, 'utf8');

// 更精确的正则：匹配 const difficultyGuidance = { 到包含"示例题型：√16"的结束 }
const oldPattern = /const difficultyGuidance = \{[\s\S]*?示例题型：√16的值是？[^}]*?\n\s*\};\s*\n/;

if (oldPattern.test(indexContent)) {
  indexContent = indexContent.replace(oldPattern, 'const difficultyGuidance = getDifficultyGuidance(difficulty, null);\n');
  fs.writeFileSync(indexPath, indexContent);
  console.log('✓ 替换 difficultyGuidance 对象为函数调用');
} else {
  console.log('⚠️ 未找到 difficultyGuidance 对象，可能已被替换');
}

// 3. 修改 prompt-templates.js - 添加导出
const templatePath = path.join(projectDir, 'cloudfunctions/generateAiQuestion/prompt-templates.js');

if (!fs.existsSync(templatePath)) {
  console.error('❌ 文件不存在:', templatePath);
  process.exit(1);
}

let templateContent = fs.readFileSync(templatePath, 'utf8');

// 更宽松的正则：匹配 module.exports = { ... } 格式
const exportPattern = /module\.exports = \{[^}]*buildPersonalizedPrompt[^}]*STUDENT_PROFILE_SCHEMA[^}]*\};/;
if (!templateContent.includes('getDifficultyGuidance')) {
  if (exportPattern.test(templateContent)) {
    templateContent = templateContent.replace(
      exportPattern,
      'module.exports = {\n  buildPersonalizedPrompt,\n  STUDENT_PROFILE_SCHEMA,\n  getDifficultyGuidance\n};'
    );
    fs.writeFileSync(templatePath, templateContent);
    console.log('✓ 添加 getDifficultyGuidance 导出');
  } else {
    console.log('⚠️ module.exports 格式不匹配，请手动检查');
  }
} else {
  console.log('✓ getDifficultyGuidance 导出已存在');
}

console.log('');
console.log('generateAiQuestion 修改完成');
