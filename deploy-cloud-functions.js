/**
 * 微信云函数自动化部署脚本
 * 使用 miniprogram-ci 批量上传云函数
 *
 * 将 shared/ 模块同步到目标云函数目录（代码引用 ./shared/）
 */

const miniprogramCi = require('miniprogram-ci');
const path = require('path');
const fs = require('fs');

// 项目配置
const projectPath = __dirname;
const projectConfig = require('./project.config.json');

// 云函数根目录
const cfRoot = path.join(projectPath, projectConfig.cloudfunctionRoot || 'cloudfunctions');
const sharedDir = path.join(cfRoot, 'shared');

// 已废弃的云函数（不再部署）
const DEPRECATED_FUNCTIONS = [
  'fixData', 'fixEmptySubjects', 'fixMissingFields', 'fixPoolSubjects',
  'cleanGrade2Questions', 'cleanOldQuestions', 'cleanExpiredLocks', 'cleanInactiveRelations',
  'check-db-questions', 'cleanupDuplicates', 'cleanupOneDuplicate', 'deduplicatePool',
  'testDedup', 'testFallback', 'testPractice', 'testSubmit',
  'test_deploy', 'practice_deploy',
  'debugCheck', 'debugData',
  'diagnoseAssessment', 'diagnoseGrade', 'diagnosePracticePool', 'diagnoseQuestion',
  'questionPoolStats', 'statsQuestions',
  'practice_new', 'practice',
  '_admin',
];

// 要部署的云函数（null = 部署除 deprecated 外的所有）
const cloudFunctions = null; // auto-discover

// 需要复制 shared 模块的云函数（引用了 ../shared/ 的函数）
const FUNCTIONS_USING_SHARED = [
  'startAssessment', 'practice_v2', 'practice', 'initDatabase',
  'generateAiQuestion', 'questionGenerator', 'getAssessment',
  'submitAnswer', 'scheduledTaskGenerator', 'startExclusiveExam',
  'uploadMaterial', 'initQuestionBank', 'studentMemory', 'recordKpRequest', 'migrateQuestionBank',
];

/**
 * 将 shared/ 下的模块复制到目标云函数目录
 */
function copySharedModules(funcDir) {
  const sharedTarget = path.join(funcDir, 'shared');
  // Create shared dir in function
  if (!fs.existsSync(sharedTarget)) {
    fs.mkdirSync(sharedTarget, { recursive: true });
  }

  // Copy shared JS files (not subdirs like __tests__)
  const files = fs.readdirSync(sharedDir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const src = path.join(sharedDir, file);
    const dst = path.join(sharedTarget, file);
    fs.copyFileSync(src, dst);
  }

  // Copy llm-core directory
  const llmCoreSrc = path.join(sharedDir, 'llm-core');
  const llmCoreDst = path.join(sharedTarget, 'llm-core');
  if (fs.existsSync(llmCoreSrc)) {
    if (!fs.existsSync(llmCoreDst)) {
      fs.mkdirSync(llmCoreDst, { recursive: true });
    }
    copyDirRecursive(llmCoreSrc, llmCoreDst);
  }
}

function copyDirRecursive(src, dst) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'coverage' || entry.name === 'tests') continue;
      if (!fs.existsSync(dstPath)) fs.mkdirSync(dstPath, { recursive: true });
      copyDirRecursive(srcPath, dstPath);
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.json')) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}
// 从环境变量或配置文件获取上传密钥
const uploadKey = process.env.WECHAT_UPLOAD_KEY;
const appid = process.env.WECHAT_APPID || projectConfig.appid;

async function deployCloudFunctions() {
  const dryRun = process.argv.includes('--dry-run');

  // Auto-discover cloud functions
  let funcList;
  if (cloudFunctions) {
    funcList = cloudFunctions;
  } else {
    funcList = fs.readdirSync(cfRoot)
      .filter(name => {
        const p = path.join(cfRoot, name);
        const isDir = fs.statSync(p).isDirectory();
        const hasIndex = fs.existsSync(path.join(p, 'index.js'));
        const isDeprecated = DEPRECATED_FUNCTIONS.includes(name);
        return isDir && hasIndex && !isDeprecated;
      });
  }

  console.log(`发现 ${funcList.length} 个云函数待部署${dryRun ? ' (dry-run)' : ''}`);
  if (DEPRECATED_FUNCTIONS.length > 0) {
    console.log(`已跳过 ${DEPRECATED_FUNCTIONS.length} 个废弃函数: ${DEPRECATED_FUNCTIONS.join(', ')}`);
  }

  if (dryRun) {
    funcList.forEach(name => {
      console.log(`  - ${name}${FUNCTIONS_USING_SHARED.includes(name) ? ' (需要shared)' : ''}`);
    });
    return;
  }

  if (!uploadKey) {
    console.error('错误: 请设置环境变量 WECHAT_UPLOAD_KEY');
    process.exit(1);
  }

  console.log('开始部署云函数...\n');

  try {
    const project = new miniprogramCi.Project({
      appid,
      type: 'miniProgram',
      projectPath,
      privateKeyPath: uploadKey,
      ignores: ['node_modules/**/*']
    });

    for (const funcName of funcList) {
      console.log(`[${funcList.indexOf(funcName) + 1}/${funcList.length}] 部署 ${funcName}...`);

      const funcPath = path.join(cfRoot, funcName);
      if (!fs.existsSync(funcPath)) {
        console.error(`  ✗ 目录不存在: ${funcPath}`);
        continue;
      }

      // Copy shared modules if needed
      const needsShared = FUNCTIONS_USING_SHARED.includes(funcName);
      if (needsShared) {
        copySharedModules(funcPath);
      }

      try {
        await miniprogramCi.cloud.uploadCloudFunction({
          project,
          env: projectConfig.envId,
          name: funcName,
          path: funcPath,
          remoteNpmInstall: false
        });
        console.log(`  ✓ ${funcName} 部署成功`);
      } catch (e) {
        console.error(`  ✗ ${funcName} 部署失败:`, e.message);
      } finally {
        // shared/ modules persist locally (code uses ./shared/)
      }
    }

    console.log('\n部署完成！');

  } catch (e) {
    console.error('部署失败:', e);
    process.exit(1);
  }
}

deployCloudFunctions();
