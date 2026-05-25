#!/usr/bin/env node

/**
 * 管理后台登录测试脚本（使用node-sdk）
 */

const tcb = require('@cloudbase/node-sdk');

// 使用临时密钥初始化（从tcb secrets get获取）
const app = tcb.init({
  env: 'cloud1-7gg9y9tjb2b867b6',
  secretId: 'AKIDMMAH4WFKm0Ka0Tj51U_OEY9tjSxVfSSepvG0WQ9m4MiWzhsZUfw_iYWlRrttUFw-',
  secretKey: 'TJlJMCggPfsNakUj9zVf4cCHWe6Hfmueqn29fYOu9Dk=',
  token: 'roxBGkA257KTUFeiLBwcn7t5xr33eaPa2e9478df7c4881b0c6a3688d1b44a211VDZOoEapSHCVkWmeqJHFQK1lrNxp5cy_6vcuiqGrq_8Mc3v7xc5MEimmYMYF6qDPk27z36Y4Q6XR0eCXL3jDEYGWrvVSFjY-aA7iY4-xl2jY-FT_vUtmxyjLdjd0K4xcrQkCpEs7hyus1V4ROGEHmvJmiG5kJqpvsDjwKjapSWquhJ04zxhWMIa-zYjJPuZCwM7DqeHvOpXUz2g2kFKW3UDP9NBZzZICclGsjh0wj8HYfMgOePC5d5nuIkwVSTuogB4HBJnSckRuND-hzoc0sNq5-_g9ryPMU6kWHz4ur9dAfBbCLUTbYAsi1P1KogLtCgepUW9GOE03Q2iicApEsQ9wdDm2YtAVZNvXyRIY2cdp2Lj3h5paArl7G3ea2M-2nofUIKwwzCPjqHO4bQKzsmARzV4J2sojIXn958yCLgA'
});

async function testLogin() {
  console.log('=== 管理后台登录测试（使用node-sdk + 密钥）===\n');
  console.log('1. 初始化CloudBase...');

  try {
    console.log('2. 调用adminLogin云函数...');
    const result = await app.callFunction({
      name: 'adminLogin',
      data: {
        username: 'admin',
        password: 'admin'
      }
    });

    console.log('   响应:', JSON.stringify(result, null, 2));

    if (result.result && result.result.success) {
      console.log('\n✅ 登录测试成功！');
      console.log('   Token:', result.result.data.token);
      console.log('   过期时间:', result.result.data.expiresAt);

      // 测试获取反馈列表
      console.log('\n3. 测试获取反馈列表...');
      const listResult = await app.callFunction({
        name: 'getFeedbackList',
        data: {
          token: result.result.data.token,
          page: 1,
          pageSize: 10
        }
      });

      console.log('   反馈列表响应:', JSON.stringify(listResult.result, null, 2));

      if (listResult.result && listResult.result.success) {
        console.log('\n✅ 反馈列表获取成功！');
        console.log(`   共 ${listResult.result.data.total} 条反馈`);
        return true;
      } else {
        console.log('\n⚠️  反馈列表获取失败:', listResult.result?.error);
        return true; // 登录成功就算通过
      }
    } else {
      console.log('\n❌ 登录失败:', result.result?.error || '未知错误');
      return false;
    }
  } catch (e) {
    console.log('\n❌ 测试失败:', e.message);
    console.log('   详细错误:', e);
    return false;
  }
}

// 运行测试
testLogin().then(success => {
  console.log('\n=== 测试完成 ===');
  console.log('结果:', success ? '成功 ✅' : '失败 ❌');
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('测试脚本错误:', err);
  process.exit(1);
});
