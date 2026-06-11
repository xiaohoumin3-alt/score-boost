const fs = require('fs');
const path = require('path');

// 支持命令行参数传入项目路径
const projectDir = process.argv[2] || '/Users/seanxx/score-boost-mini';

console.log('=== 修复 parentAssessment ===');
console.log('项目路径:', projectDir);
console.log('');

// 验证项目路径
if (!fs.existsSync(projectDir)) {
  console.error('❌ 项目路径不存在:', projectDir);
  process.exit(1);
}

const indexPath = path.join(projectDir, 'cloudfunctions/parentAssessment/index.js');

if (!fs.existsSync(indexPath)) {
  console.error('❌ 文件不存在:', indexPath);
  process.exit(1);
}

let content = fs.readFileSync(indexPath, 'utf8');

// 1. 添加 shuffle 函数
const shuffleFunction = `

/**
 * Fisher-Yates 洗牌算法
 * @param {Array} array - 要洗牌的数组
 * @returns {Array} 洗牌后的数组
 */
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
`;

if (!content.includes('function shuffle(array)')) {
  // 在 knowledgePoints 对象结束后、fetchQuestionsFromPool 函数前添加
  // 使用更宽松的正则：匹配 }; 后跟 /** 从题库中获取题目
  const insertPattern = /(};\s*\n)(\s*\/\*\* 从题库中获取题目)/;
  if (insertPattern.test(content)) {
    content = content.replace(
      insertPattern,
      '$1' + shuffleFunction + '$2'
    );
    fs.writeFileSync(indexPath, content);
    console.log('✓ 添加 shuffle 函数');
  } else {
    console.log('⚠️ 未找到合适的插入位置，请手动添加');
  }
} else {
  console.log('✓ shuffle 函数已存在');
}

// 2. 修改知识点洗牌逻辑
content = fs.readFileSync(indexPath, 'utf8');

// 修正后的正则：包含 => ({ 部分
const oldQuestions = /const questions = kpList\.slice\(0, count\)\.map\(\(kpName, idx\) => \(\{/;
const newQuestions = 'const shuffledKpList = shuffle([...kpList]);\n  const questions = shuffledKpList.slice(0, count).map((kpName, idx) => ({$2';

if (oldQuestions.test(content) && !content.includes('shuffledKpList')) {
  content = content.replace(oldQuestions, newQuestions);
  fs.writeFileSync(indexPath, content);
  console.log('✓ 添加知识点洗牌逻辑');
} else if (content.includes('shuffledKpList')) {
  console.log('✓ 洗牌逻辑已存在');
} else {
  console.log('⚠️ 未找到目标代码，请手动检查');
  console.log('   目标格式：const questions = kpList.slice(0, count).map((kpName, idx) => ({');
}

console.log('');
console.log('parentAssessment 修改完成');
