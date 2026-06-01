/**
 * LaTeX 到 Unicode 数学符号转换工具
 * 运行: node convert-latex.js
 */

const fs = require('fs');
const path = require('path');

// LaTeX 到 Unicode 映射表
const latexToUnicode = {
  // 平方根
  '\\sqrt': '√',
  // 分数
  '\\frac': '⁄',
  // 不等号
  '\\leq': '≤',
  '\\geq': '≥',
  '\\lt': '<',
  '\\gt': '>',
  '\\neq': '≠',
  // 希腊字母
  '\\pi': 'π',
  '\\alpha': 'α',
  '\\beta': 'β',
  '\\gamma': 'γ',
  '\\delta': 'δ',
  '\\theta': 'θ',
  // 运算符
  '\\times': '×',
  '\\div': '÷',
  '\\pm': '±',
  '\\infty': '∞',
  // 其他符号
  '\\therefore': '∴',
  '\\because': '∵',
  '\\angle': '∠',
  '\\degree': '°',
  '\\circ': '°',
  '\\parallel': '∥',
  '\\perp': '⊥',
  '\\triangle': '△',
  // 平方/立方
  '^2': '²',
  '^3': '³',
  // 上标下标（简单处理）
  '\\^{2}': '²',
  '\\^{3}': '³',
};

/**
 * 转换单个题目中的 LaTeX 为 Unicode
 */
function convertLatexInQuestion(question) {
  if (!question) return question;

  const convertString = (str) => {
    if (!str || typeof str !== 'string') return str;

    let result = str;

    // 处理带 $ 的 LaTeX 表达式: $...$
    result = result.replace(/\$([^$]+)\$/g, (match, expr) => {
      return convertLatexExpression(expr);
    });

    // 处理 \\ 命令
    result = result.replace(/\\([a-zA-Z]+)|\\([{}[\]])/g, (match, cmd, special) => {
      if (special) {
        // 处理特殊字符
        if (special === '{') return '';
        if (special === '}') return '';
        if (special === '[') return '[';
        if (special === ']') return ']';
        return special;
      }
      if (latexToUnicode[cmd]) {
        return latexToUnicode[cmd];
      }
      return match; // 保持原样
    });

    // 处理平方根: \sqrt{...} 或 \\sqrt{...}
    result = result.replace(/(\\)?\\sqrt\{([^}]+)\}/g, (match, esc, content) => {
      return '√(' + content + ')';
    });

    // 处理立方根: \sqrt[3]{...}
    result = result.replace(/(\\)?\\sqrt\[3\]\{([^}]+)\}/g, (match, esc, content) => {
      return '³√(' + content + ')';
    });

    // 处理分数: \frac{a}{b}
    result = result.replace(/(\\)?\\frac\{([^}]+)\}\{([^}]+)\}/g, (match, esc, num, den) => {
      return num + '/' + den;
    });

    // 清理剩余的 $ 符号
    result = result.replace(/\$/g, '');

    return result;
  };

  // 转换题目内容
  if (question.content) {
    question.content = convertString(question.content);
  }

  // 转换选项
  if (question.options && Array.isArray(question.options)) {
    question.options = question.options.map(opt => convertString(opt));
  }

  return question;
}

/**
 * 转换 LaTeX 表达式（不包含 $）
 */
function convertLatexExpression(expr) {
  let result = expr;

  // 按顺序处理（更具体的模式先处理）
  // 分数（先处理，避免与花括号冲突）
  result = result.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1/$2');

  // 立方根
  result = result.replace(/\\sqrt\[3\]\{([^{}]+)\}/g, '³√($1)');

  // 平方根
  result = result.replace(/\\sqrt\{([^{}]+)\}/g, '√($1)');

  // 希腊字母和符号
  result = result.replace(/\\pi/g, 'π');
  result = result.replace(/\\leq/g, '≤');
  result = result.replace(/\\geq/g, '≥');
  result = result.replace(/\\neq/g, '≠');
  result = result.replace(/\\times/g, '×');
  result = result.replace(/\\div/g, '÷');
  result = result.replace(/\\pm/g, '±');
  result = result.replace(/\\infty/g, '∞');
  result = result.replace(/\\therefore/g, '∴');
  result = result.replace(/\\because/g, '∵');
  result = result.replace(/\\angle/g, '∠');
  result = result.replace(/\\degree/g, '°');
  result = result.replace(/\\circ/g, '°');
  result = result.replace(/\\parallel/g, '∥');
  result = result.replace(/\\perp/g, '⊥');
  result = result.replace(/\\triangle/g, '△');

  // 清理剩余的花括号（来自 LaTeX 参数）
  result = result.replace(/\{([^{}]+)\}/g, '($1)');

  return result;
}

/**
 * 转换整个题库文件
 */
function convertQuestionBank(inputPath, outputPath) {
  console.log('读取题库:', inputPath);
  const content = fs.readFileSync(inputPath, 'utf8');

  // 解析 JavaScript 文件，提取 QUESTION_BANK
  const questionBankMatch = content.match(/const QUESTION_BANK = \{([\s\S]*)\};/);
  if (!questionBankMatch) {
    console.error('无法找到 QUESTION_BANK');
    return;
  }

  console.log('开始转换...');
  let converted = 0;
  let total = 0;

  // 统计和转换
  const lines = content.split('\n');
  const result = lines.map(line => {
    // 检查是否包含 LaTeX
    if (line.includes('\\\\') || line.includes('\\sqrt') || line.includes('\\frac') || line.includes('$')) {
      total++;
      // 转换行中的字符串
      let newLine = line;
      newLine = newLine.replace(/"([^"]*\\[a-zA-Z]+[^"]*)"/g, (match, str) => {
        let convertedStr = str.replace(/\\\\/g, '\\');  // JSON 双反斜杠转单反斜杠
        convertedStr = convertLatexExpression(convertedStr);
        convertedStr = convertedStr.replace(/\$/g, '');  // 移除 $ 符号
        converted++;
        return JSON.stringify(convertedStr);
      });
      // 同时处理纯 $...$ 格式（不含反斜杠）
      newLine = newLine.replace(/\$([^$]+)\$/g, (match, expr) => {
        let convertedStr = convertLatexExpression(expr);
        return JSON.stringify(convertedStr);
      });
      return newLine;
    }
    return line;
  });

  console.log(`转换完成: ${converted} 处, 共 ${total} 行`);

  // 写入输出文件
  if (outputPath) {
    fs.writeFileSync(outputPath, result.join('\n'));
    console.log('已保存到:', outputPath);
  }

  return { converted, total };
}

// 如果直接运行此脚本
if (require.main === module) {
  const inputPath = '/Users/seanxx/score-boost-mini/cloudfunctions/startAssessment/question_bank.js';
  const outputPath = '/Users/seanxx/score-boost-mini/cloudfunctions/startAssessment/question_bank.js';

  const stats = convertQuestionBank(inputPath, outputPath);
  console.log('\n转换统计:', stats);
}

module.exports = { convertLatexInQuestion, convertQuestionBank };
