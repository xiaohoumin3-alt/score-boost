#!/usr/bin/env node
/**
 * 知识点数据复制脚本
 * 从 startAssessment/data/ 复制到 extendedAssessment/data/
 */

const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.join(__dirname, '../cloudfunctions/startAssessment/data');
const TARGET_DIR = path.join(__dirname, '../cloudfunctions/extendedAssessment/data');

console.log(`复制知识点数据:`);
console.log(`  源: ${SOURCE_DIR}`);
console.log(`  目标: ${TARGET_DIR}`);

// 确保目标目录存在
if (!fs.existsSync(TARGET_DIR)) {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
}

// 读取源目录所有JSON文件
const files = fs.readdirSync(SOURCE_DIR);
const jsonFiles = files.filter(f => f.endsWith('.json'));

console.log(`找到 ${jsonFiles.length} 个JSON文件`);

// 复制每个文件
let copied = 0;
let failed = 0;

jsonFiles.forEach(file => {
  const srcPath = path.join(SOURCE_DIR, file);
  const dstPath = path.join(TARGET_DIR, file);

  try {
    const content = fs.readFileSync(srcPath, 'utf8');
    // 验证JSON格式
    JSON.parse(content);
    fs.writeFileSync(dstPath, content, 'utf8');
    copied++;
  } catch (err) {
    console.error(`  失败: ${file} - ${err.message}`);
    failed++;
  }
});

console.log(`\n复制完成:`);
console.log(`  成功: ${copied}`);
console.log(`  失败: ${failed}`);
console.log(`COPY_SUCCESS`);