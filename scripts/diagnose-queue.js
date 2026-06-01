/**
 * 队列处理问题诊断脚本
 * 用于检查 questionGenerator 定时触发器和队列处理状态
 */

const fs = require('fs');
const path = require('path');

console.log('========================================');
console.log('队列处理问题诊断工具');
console.log('========================================\n');

// 1. 检查 config.json 配置
console.log('【1】检查定时触发器配置...');
const configPath = path.join(__dirname, '../cloudfunctions/questionGenerator/config.json');

if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  if (config.triggers && config.triggers.length > 0) {
    console.log('✅ 定时触发器配置存在');
    config.triggers.forEach(trigger => {
      console.log(`   - 名称: ${trigger.name}`);
      console.log(`   - 类型: ${trigger.type}`);
      console.log(`   - Cron: ${trigger.config}`);
    });
  } else {
    console.log('❌ 定时触发器配置缺失');
    console.log('   需要在 config.json 中添加 triggers 配置');
  }
} else {
  console.log('❌ config.json 文件不存在');
}

// 2. 检查云函数代码
console.log('\n【2】检查云函数代码...');
const indexPath = path.join(__dirname, '../cloudfunctions/questionGenerator/index.js');

if (fs.existsSync(indexPath)) {
  const code = fs.readFileSync(indexPath, 'utf8');

  // 检查关键函数
  if (code.includes('fetchPendingTasks')) {
    console.log('✅ fetchPendingTasks 函数存在');
  } else {
    console.log('❌ fetchPendingTasks 函数缺失');
  }

  if (code.includes('processTask')) {
    console.log('✅ processTask 函数存在');
  } else {
    console.log('❌ processTask 函数缺失');
  }

  // 检查目标队列ID
  if (code.includes('669eebf36a17092800eea1aa0a8c721b')) {
    console.log('✅ 目标队列ID配置存在');
  } else {
    console.log('⚠️  目标队列ID未配置');
  }
} else {
  console.log('❌ index.js 文件不存在');
}

// 3. 检查工作流引擎
console.log('\n【3】检查工作流引擎...');
const workflowDir = path.join(__dirname, '../cloudfunctions/questionGenerator/workflow');

if (fs.existsSync(workflowDir)) {
  console.log('✅ workflow 目录存在');

  const steps = ['InitStateStep', 'GenerateStep', 'SaveQuestionsStep', 'CreateAssessmentStep', 'CompleteStep'];
  steps.forEach(step => {
    const stepPath = path.join(workflowDir, `steps/${step}.js`);
    if (fs.existsSync(stepPath)) {
      console.log(`✅ ${step} 存在`);
    } else {
      console.log(`❌ ${step} 缺失`);
    }
  });
} else {
  console.log('❌ workflow 目录不存在');
}

// 4. 诊断建议
console.log('\n========================================');
console.log('诊断建议');
console.log('========================================\n');

console.log('【部署检查清单】');
console.log('1. 在微信开发者工具中右键 questionGenerator 云函数');
console.log('2. 选择"上传并部署：云端安装依赖"');
console.log('3. 部署完成后，在云开发控制台检查：');
console.log('   - 云函数是否存在');
console.log('   - 定时触发器是否已创建');
console.log('   - 触发器状态是否为"启用"\n');

console.log('【验证步骤】');
console.log('1. 在云开发控制台 → 云函数 → questionGenerator → 日志');
console.log('   查看是否有定期执行记录（每30秒一条）');
console.log('2. 在小程序中调用 checkQueueStatus 云函数检查队列状态');
console.log('3. 或调用 manualTriggerQueue 手动触发队列处理\n');

console.log('【常见问题】');
console.log('1. 定时触发器不生效：');
console.log('   - 确认 config.json 有 triggers 配置');
console.log('   - 确认使用"云端安装依赖"方式部署');
console.log('   - 确认触发器在控制台中显示为"启用"状态\n');

console.log('2. 队列任务不处理：');
console.log('   - 检查云函数日志中的错误信息');
console.log('   - 确认数据库权限配置正确');
console.log('   - 检查 question_queue 集合中是否有 status=pending 的记录\n');

console.log('3. 云函数超时：');
console.log('   - cloudbaserc.json 中 questionGenerator timeout: 300（5分钟）');
console.log('   - 如果生成题目时间过长，可能需要增加超时时间\n');

console.log('========================================');
console.log('诊断完成');
console.log('========================================\n');
