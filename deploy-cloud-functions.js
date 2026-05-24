/**
 * 微信云函数自动化部署脚本
 * 使用 miniprogram-ci 批量上传云函数
 */

const miniprogramCi = require('miniprogram-ci');
const path = require('path');
const fs = require('fs');

// 项目配置
const projectPath = __dirname;
const projectConfig = require('./project.config.json');

// 云函数列表
const cloudFunctions = [
  'submitFeedback',
  'getMyFeedback',
  'markAsRead',
  'adminLogin',
  'getFeedbackList',
  'replyFeedback'
];

// 从环境变量或配置文件获取上传密钥
// 设置方式: export WECHAT_UPLOAD_KEY=/path/to/private.key
const uploadKey = process.env.WECHAT_UPLOAD_KEY;
const appid = process.env.WECHAT_APPID || projectConfig.appid;

if (!uploadKey) {
  console.error('错误: 请设置环境变量 WECHAT_UPLOAD_KEY');
  console.error('设置方式: export WECHAT_UPLOAD_KEY=/path/to/private.key');
  console.error('获取密钥: 微信小程序管理后台 -> 开发 -> 开发设置 -> 小程序代码上传 -> 生成密钥');
  process.exit(1);
}

async function deployCloudFunctions() {
  console.log('开始部署云函数...\n');

  try {
    // 创建项目实例
    const project = new miniprogramCi.Project({
      appid,
      type: 'miniProgram',
      projectPath,
      privateKeyPath: uploadKey,
      ignores: ['node_modules/**/*']
    });

    console.log(`云环境: ${projectConfig.envId}`);
    console.log(`部署区域: ${projectConfig.region}\n`);

    // 逐个部署云函数
    for (const funcName of cloudFunctions) {
      console.log(`\n[${cloudFunctions.indexOf(funcName) + 1}/${cloudFunctions.length}] 部署 ${funcName}...`);

      const funcPath = path.join(projectPath, projectConfig.cloudfunctionRoot, funcName);

      // 检查云函数目录是否存在
      if (!fs.existsSync(funcPath)) {
        console.error(`  ✗ 目录不存在: ${funcPath}`);
        continue;
      }

      try {
        // 上传云函数
        await miniprogramCi.cloud.uploadCloudFunction({
          project,
          env: projectConfig.envId,
          name: funcName,
          path: funcPath,
          // 不使用远程依赖，直接使用本地 node_modules
          remoteNpmInstall: false
        });

        console.log(`  ✓ ${funcName} 部署成功`);
      } catch (e) {
        console.error(`  ✗ ${funcName} 部署失败:`, e.message);
      }
    }

    console.log('\n========================================');
    console.log('云函数部署完成！');
    console.log('========================================\n');

    console.log('部署的云函数:');
    cloudFunctions.forEach(name => console.log(`  - ${name}`));

    console.log('\n后续步骤:');
    console.log('  1. 在云开发控制台创建数据库集合');
    console.log('     - feedback (参考 docs/database-feedback-setup.md)');
    console.log('     - admin (参考 docs/database-admin-setup.md)');
    console.log('  2. 在小程序开发者工具中测试功能');

  } catch (e) {
    console.error('部署失败:', e);
    process.exit(1);
  }
}

// 执行部署
deployCloudFunctions();
