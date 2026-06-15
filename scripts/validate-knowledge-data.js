#!/usr/bin/env node
/**
 * 知识点数据验证脚本
 * 验证所有JSON文件格式正确性
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../cloudfunctions/extendedAssessment/data');

console.log(`验证知识点数据: ${DATA_DIR}`);

// 读取所有JSON文件
const files = fs.readdirSync(DATA_DIR);
const jsonFiles = files.filter(f => f.endsWith('.json'));

console.log(`找到 ${jsonFiles.length} 个JSON文件`);

let valid = 0;
let invalid = 0;
const errors = [];

jsonFiles.forEach(file => {
  const filePath = path.join(DATA_DIR, file);

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    // 验证基本结构
    if (data && typeof data === 'object') {
      valid++;
    } else {
      invalid++;
      errors.push(`${file}: 无效的JSON对象`);
    }
  } catch (err) {
    invalid++;
    errors.push(`${file}: ${err.message}`);
  }
});

console.log(`\n验证结果:`);
console.log(`  有效: ${valid}`);
console.log(`  无效: ${invalid}`);

if (errors.length > 0) {
  console.log(`\n错误详情:`);
  errors.forEach(err => console.log(`  - ${err}`));
}

console.log(`VALID_FILES: ${valid}`);