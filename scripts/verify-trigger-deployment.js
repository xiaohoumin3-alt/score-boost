/**
 * 触发器部署验证脚本
 * 用于确认定时触发器是否在云端正确配置
 */

const fs = require('fs');
const path = require('path');

console.log('========================================');
console.log('触发器部署验证工具');
console.log('========================================\n');

// 1. 检查本地配置
console.log('【1】检查本地 config.json 配置...');
const configPath = path.join(__dirname, '../cloudfunctions/questionGenerator/config.json');

if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  if (config.triggers && config.triggers.length > 0) {
    console.log('✅ 本地触发器配置存在：');
    config.triggers.forEach(trigger => {
      console.log(`   - 名称: ${trigger.name}`);
      console.log(`   - 类型: ${trigger.type}`);
      console.log(`   - Cron: ${trigger.config}`);
    });

    // 计算 cron 表达式对应的触发间隔
    const cronExpr = config.triggers[0].config;
    const parts = cronExpr.split(' ');
    if (parts.length === 7) {
      const seconds = parts[0];
      if (seconds.startsWith('*/')) {
        const interval = parseInt(seconds.substring(2));
        console.log(`   - 预期触发间隔: ${interval} 秒`);
      }
    }
  } else {
    console.log('❌ 本地触发器配置缺失');
  }
} else {
  console.log('❌ config.json 文件不存在');
}

// 2. 关键诊断信息
console.log('\n【2】关键诊断信息\n');

console.log('如果任务一直在 pending 状态，可能的原因：');
console.log('');
console.log('A. 触发器未部署到云端');
console.log('   解决方案：');
console.log('   1. 打开微信开发者工具');
console.log('   2. 右键点击 cloudfunctions/questionGenerator');
console.log('   3. 选择 "上传并部署：云端安装依赖"');
console.log('   4. 等待部署完成');
console.log('');
console.log('B. 触发器已部署但状态为禁用');
console.log('   解决方案：');
console.log('   1. 打开云开发控制台：https://console.cloud.tencent.com/tcb');
console.log('   2. 选择你的环境');
console.log('   3. 点击 "云函数" → 找到 questionGenerator');
console.log('   4. 点击 "详情" → "定时触发器"');
console.log('   5. 检查触发器状态是否为 "启用"');
console.log('   6. 如果是 "禁用"，点击 "启用"');
console.log('');
console.log('C. 云函数执行但没有找到任务');
console.log('   解决方案：');
console.log('   1. 在云开发控制台查看云函数日志');
console.log('   2. 搜索 "[fetchPendingTasks] Pending tasks count:"');
console.log('   3. 如果显示 "Pending tasks count: 0"，说明数据库中没有 pending 任务');
console.log('');
console.log('【3】手动验证方法\n');

console.log('方法一：调用 manualTriggerQueue 云函数');
console.log('  在小程序中运行：');
console.log('  wx.cloud.callFunction({ name: "manualTriggerQueue" })');
console.log('');
console.log('方法二：查看云函数日志');
console.log('  1. 打开云开发控制台');
console.log('  2. 云函数 → questionGenerator → 日志');
console.log('  3. 查看是否有定期执行记录（每15秒一条）');
console.log('');

// 3. 创建腾讯云 CLI 验证命令
console.log('【4】腾讯云 CLI 验证命令（如果安装了 tcb）\n');
console.log('# 查看云函数详情（包括触发器）');
console.log('tcb fn detail questionGenerator');
console.log('');
console.log('# 列出所有云函数');
console.log('tcb functions list');
console.log('');

console.log('========================================');
console.log('验证完成');
console.log('========================================\n');

console.log('下一步操作建议：');
console.log('1. 使用微信开发者工具重新部署云函数（云端安装依赖）');
console.log('2. 在云开发控制台确认触发器状态为"启用"');
console.log('3. 查看云函数日志确认触发器在执行');
console.log('4. 调用 manualTriggerQueue 手动触发一次测试');
