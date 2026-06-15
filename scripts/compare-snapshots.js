#!/usr/bin/env node

/**
 * 快照对比脚本
 * 用于检测API返回格式的变化
 *
 * 用法：
 *   node scripts/compare-snapshots.js
 *   node scripts/compare-snapshots.js --update    # 更新基准快照
 *   node scripts/compare-snapshots.js --verbose  # 详细输出
 */

const fs = require('fs');
const path = require('path');

const SNAPSHOTS_DIR = path.join(__dirname, '../docs/snapshots');
const BASELINE_DIR = path.join(__dirname, '../docs/snapshots/baseline');

// 快照文件列表
const SNAPSHOT_FILES = [
  'generateAi-response.json',
  'generateSingleQuestion-response.json',
  'generateAiQuestion-response.json',
  'error-responses.json'
];

/**
 * 深度比较两个对象
 */
function deepCompare(obj1, obj2, path = '') {
  const differences = [];

  // 类型检查
  if (typeof obj1 !== typeof obj2) {
    differences.push({
      path,
      type: 'type_mismatch',
      value1: typeof obj1,
      value2: typeof obj2
    });
    return differences;
  }

  // null/undefined检查
  if (obj1 === null || obj1 === undefined) {
    if (obj1 !== obj2) {
      differences.push({
        path,
        type: 'value_mismatch',
        value1: obj1,
        value2: obj2
      });
    }
    return differences;
  }

  // 数组比较
  if (Array.isArray(obj1)) {
    if (!Array.isArray(obj2)) {
      differences.push({
        path,
        type: 'type_mismatch',
        value1: 'array',
        value2: typeof obj2
      });
      return differences;
    }

    if (obj1.length !== obj2.length) {
      differences.push({
        path,
        type: 'length_mismatch',
        value1: obj1.length,
        value2: obj2.length
      });
    }

    obj1.forEach((item, index) => {
      const itemDiffs = deepCompare(item, obj2[index], `${path}[${index}]`);
      differences.push(...itemDiffs);
    });

    return differences;
  }

  // 对象比较
  if (typeof obj1 === 'object') {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    // 检查新增字段
    keys2.forEach(key => {
      if (!keys1.includes(key)) {
        differences.push({
          path: `${path}.${key}`,
          type: 'new_field',
          value: obj2[key]
        });
      }
    });

    // 检查删除字段
    keys1.forEach(key => {
      if (!keys2.includes(key)) {
        differences.push({
          path: `${path}.${key}`,
          type: 'removed_field',
          value: obj1[key]
        });
      }
    });

    // 递归比较共同字段
    keys1.forEach(key => {
      if (keys2.includes(key)) {
        const itemDiffs = deepCompare(obj1[key], obj2[key], `${path}.${key}`);
        differences.push(...itemDiffs);
      }
    });

    return differences;
  }

  // 基本类型比较
  if (obj1 !== obj2) {
    differences.push({
      path,
      type: 'value_mismatch',
      value1: obj1,
      value2: obj2
    });
  }

  return differences;
}

/**
 * 格式化差异报告
 */
function formatDifferences(differences, verbose = false) {
  if (differences.length === 0) {
    return '✅ 无变化';
  }

  const summary = {
    type_mismatch: 0,
    value_mismatch: 0,
    new_field: 0,
    removed_field: 0,
    length_mismatch: 0
  };

  differences.forEach(diff => {
    summary[diff.type] = (summary[diff.type] || 0) + 1;
  });

  let output = `\n📊 差异统计：\n`;
  output += `  - 类型不匹配: ${summary.type_mismatch}\n`;
  output += `  - 值不匹配: ${summary.value_mismatch}\n`;
  output += `  - 新增字段: ${summary.new_field}\n`;
  output += `  - 删除字段: ${summary.removed_field}\n`;
  output += `  - 长度不匹配: ${summary.length_mismatch}\n`;

  if (verbose) {
    output += `\n🔍 详细差异：\n`;
    differences.forEach((diff, index) => {
      output += `  ${index + 1}. ${diff.path}\n`;
      output += `     类型: ${diff.type}\n`;
      if (diff.type === 'new_field') {
        output += `     新值: ${JSON.stringify(diff.value)}\n`;
      } else if (diff.type === 'removed_field') {
        output += `     旧值: ${JSON.stringify(diff.value)}\n`;
      } else {
        output += `     旧值: ${JSON.stringify(diff.value1)}\n`;
        output += `     新值: ${JSON.stringify(diff.value2)}\n`;
      }
      output += `\n`;
    });
  }

  return output;
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);
  const shouldUpdate = args.includes('--update');
  const isVerbose = args.includes('--verbose');

  console.log('🔍 快照对比工具');
  console.log('==================\n');

  // 创建基准目录（如需要）
  if (!fs.existsSync(BASELINE_DIR) && shouldUpdate) {
    fs.mkdirSync(BASELINE_DIR, { recursive: true });
    console.log('✅ 创建基准目录:', BASELINE_DIR);
  }

  let hasChanges = false;
  const results = [];

  SNAPSHOT_FILES.forEach(file => {
    const currentPath = path.join(SNAPSHOTS_DIR, file);
    const baselinePath = path.join(BASELINE_DIR, file);

    console.log(`📄 检查: ${file}`);

    // 读取当前快照
    if (!fs.existsSync(currentPath)) {
      console.log(`  ⚠️  当前快照不存在: ${currentPath}`);
      return;
    }

    const current = JSON.parse(fs.readFileSync(currentPath, 'utf8'));

    // 如果不存在基准快照，创建它
    if (!fs.existsSync(baselinePath)) {
      if (shouldUpdate) {
        fs.writeFileSync(baselinePath, JSON.stringify(current, null, 2));
        console.log(`  ✅ 创建基准快照: ${baselinePath}`);
      } else {
        console.log(`  ⚠️  基准快照不存在: ${baselinePath}`);
      }
      return;
    }

    // 读取基准快照并比较
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const differences = deepCompare(current, baseline);

    if (differences.length === 0) {
      console.log(`  ✅ 无变化`);
    } else {
      hasChanges = true;
      console.log(`  ⚠️  检测到 ${differences.length} 处变化`);
      console.log(formatDifferences(differences, isVerbose));

      // 更新基准快照
      if (shouldUpdate) {
        fs.writeFileSync(baselinePath, JSON.stringify(current, null, 2));
        console.log(`  ✅ 已更新基准快照`);
      }

      results.push({
        file,
        changes: differences.length,
        details: differences
      });
    }

    console.log();
  });

  // 总结
  console.log('==================');
  if (hasChanges) {
    console.log('⚠️  检测到快照变化');
    console.log(`📊 受影响文件: ${results.length}个`);

    if (!shouldUpdate) {
      console.log('\n💡 提示：运行 --update 更新基准快照');
      console.log('   或者检查这些变化是否符合预期');
    }
  } else {
    console.log('✅ 所有快照一致');
  }

  // 返回退出码
  process.exit(hasChanges && !shouldUpdate ? 1 : 0);
}

// 运行主函数
if (require.main === module) {
  main();
}

module.exports = { deepCompare, formatDifferences };
