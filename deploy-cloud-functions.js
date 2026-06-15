/**
 * 微信云函数自动化部署脚本
 * 使用 CloudBase CLI (tcb) 批量上传云函数
 *
 * 将 shared/ 模块同步到目标云函数目录（代码引用 ./shared/）
 */

const { execSync } = require('child_process');
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
  'startAssessment', 'practice', 'initDatabase',
  'generateAiQuestion', 'questionGenerator', 'getAssessment',
  'submitAnswer', 'scheduledTaskGenerator', 'startExclusiveExam',
  'uploadMaterial', 'initQuestionBank', 'studentMemory', 'recordKpRequest', 'migrateQuestionBank',
  'extendedAssessment',
];

/**
 * 将 shared/ 下的模块复制到目标云函数目录
 */
function copySharedModules(funcDir) {
  const sharedTarget = path.join(funcDir, 'shared');
  if (!fs.existsSync(sharedTarget)) {
    fs.mkdirSync(sharedTarget, { recursive: true });
  }
  copyDirRecursive(sharedDir, sharedTarget);
}

function copyDirRecursive(src, dst) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'coverage', 'tests', '__tests__'].includes(entry.name)) continue;
      if (!fs.existsSync(dstPath)) fs.mkdirSync(dstPath, { recursive: true });
      copyDirRecursive(srcPath, dstPath);
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.json')) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

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

  // 检查 CloudBase CLI 是否可用
  try {
    execSync('tcb --version', { stdio: 'ignore' });
  } catch (e) {
    console.error('错误: CloudBase CLI (tcb) 未安装');
    console.error('请运行: npm install -g @cloudbase/cli');
    process.exit(1);
  }

  console.log('开始部署云函数...\n');

  let successCount = 0;
  let failCount = 0;
  const failedFunctions = [];

  for (const funcName of funcList) {
    console.log(`[${funcList.indexOf(funcName) + 1}/${funcList.length}] 部署 ${funcName}...`);

    const funcPath = path.join(cfRoot, funcName);
    if (!fs.existsSync(funcPath)) {
      console.error(`  ✗ 目录不存在: ${funcPath}`);
      failCount++;
      failedFunctions.push(funcName);
      continue;
    }

    // Copy shared modules if needed
    const needsShared = FUNCTIONS_USING_SHARED.includes(funcName);
    if (needsShared) {
      copySharedModules(funcPath);
    }

    try {
      const output = execSync(
        `tcb fn deploy ${funcName} --dir ${funcPath}`,
        { encoding: 'utf-8', stdio: 'pipe' }
      );

      if (output.includes('部署成功') || output.includes('success')) {
        console.log(`  ✓ ${funcName} 部署成功`);
        successCount++;
      } else {
        console.log(`  ? ${funcName} 部署状态未知`);
        console.log(`    输出: ${output.slice(0, 100)}`);
      }
    } catch (e) {
      console.error(`  ✗ ${funcName} 部署失败: ${e.message.slice(0, 100)}`);
      failCount++;
      failedFunctions.push(funcName);
    } finally {
      // shared/ modules persist locally (code uses ./shared/)
    }
  }

  console.log('\n部署完成！');
  console.log(`成功: ${successCount}/${funcList.length}`);
  console.log(`失败: ${failCount}/${funcList.length}`);

  if (failCount > 0) {
    console.log('\n失败的云函数:');
    failedFunctions.forEach(f => console.log(`  - ${f}`));
  }
}

deployCloudFunctions();
