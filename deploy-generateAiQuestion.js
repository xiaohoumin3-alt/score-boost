/**
 * generateAiQuestion 云函数自动化部署
 * 使用 miniprogram-ci
 */

const miniprogramCi = require('miniprogram-ci');
const path = require('path');

const projectPath = __dirname;
const projectConfig = require('./project.config.json');

const uploadKey = process.env.WECHAT_UPLOAD_KEY;
const appid = process.env.WECHAT_APPID || 'wx1bdd9ea6620c4ae1';

if (!uploadKey) {
  console.error('错误: 请设置环境变量 WECHAT_UPLOAD_KEY');
  console.error('设置方式: export WECHAT_UPLOAD_KEY=/path/to/private.key');
  console.error('或从微信小程序管理后台获取密钥');
  process.exit(1);
}

async function deploy() {
  try {
    const project = new miniprogramCi.Project({
      appid,
      type: 'miniProgram',
      projectPath,
      privateKeyPath: uploadKey,
      ignores: ['node_modules/**']
    });

    const funcName = 'generateAiQuestion';
    const funcPath = path.join(projectPath, 'cloudfunctions', funcName);

    console.log(`开始部署 ${funcName}...`);
    
    await miniprogramCi.cloud.uploadCloudFunction({
      project,
      env: projectConfig.envId,
      name: funcName,
      path: funcPath,
      remoteNpmInstall: true
    });

    console.log(`✓ ${funcName} 部署成功！`);
    console.log('\n验证: 在微信开发者工具云开发控制台检查函数状态');
  } catch (e) {
    console.error('部署失败:', e.message);
    process.exit(1);
  }
}

deploy();
