/**
 * 测试MiniMax各种认证方式
 */

require('dotenv').config({ path: '.env.local' });

const apiKey = process.env.MINIMAX_API_KEY || process.env.DASHSCOPE_API_KEY;

if (!apiKey) {
  console.error('✗ API Key 未配置');
  process.exit(1);
}

console.log('API Key:', apiKey.substring(0, 30) + '...');
console.log('Key长度:', apiKey.length);

// 各种认证方式
const authMethods = [
  {
    name: 'Bearer token',
    getHeaders: (key) => ({
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    })
  },
  {
    name: 'Bearer token with prefix removed',
    getHeaders: (key) => {
      const cleanKey = key.replace(/^sk-/, '').replace(/^tp-/, '');
      return {
        'Authorization': `Bearer ${cleanKey}`,
        'Content-Type': 'application/json'
      };
    }
  },
  {
    name: 'Direct token (no Bearer)',
    getHeaders: (key) => ({
      'Authorization': key,
      'Content-Type': 'application/json'
    })
  },
  {
    name: 'X-API-Key header',
    getHeaders: (key) => ({
      'X-API-Key': key,
      'Content-Type': 'application/json'
    })
  },
  {
    name: 'api-key header',
    getHeaders: (key) => ({
      'api-key': key,
      'Content-Type': 'application/json'
    })
  }
];

const endpoints = [
  'https://api.minimax.chat/v1/text/chatcompletion_v2',
  'https://api.minimaxi.com/v1/text/chatcompletion_v2',
  'https://aipii.baby123.cn/v1/text/chatcompletion_v2'
];

const payload = {
  model: 'abab6.5s-chat',
  tokens_to_generate: 50,
  temperature: 0.1,
  messages: [
    { sender_type: 'USER', sender_name: 'User', text: 'Hi' }
  ]
};

async function testCombination(endpoint, authMethod) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: authMethod.getHeaders(apiKey),
      body: JSON.stringify(payload)
    });

    const text = await response.text();

    if (response.status === 200) {
      const data = JSON.parse(text);
      if (data.base_resp?.status_code === 0) {
        return { success: true, endpoint, authMethod, data };
      }
    }

    if (response.status !== 401 && response.status !== 403) {
      // 非401错误可能有其他信息
      console.log(`  ${response.status}: ${text.substring(0, 100)}`);
    }

    return null;

  } catch (error) {
    return null;
  }
}

async function main() {
  console.log('\n测试各种端点和认证方式...\n');

  for (const endpoint of endpoints) {
    console.log(`端点: ${endpoint}`);

    for (const authMethod of authMethods) {
      process.stdout.write(`  ├─ ${authMethod.name}... `);

      const result = await testCombination(endpoint, authMethod);

      if (result) {
        console.log('✅ 成功!');
        console.log('\n✅✅✅ 找到可用配置!');
        console.log('端点:', result.endpoint);
        console.log('认证:', result.authMethod.name);
        console.log('\n响应:', JSON.stringify(result.data, null, 2).substring(0, 300));
        return result;
      } else {
        console.log('✗');
      }
    }
  }

  console.log('\n❌ 所有组合都失败了');

  console.log('\n请提供以下信息:');
  console.log('1. 正确的API端点URL');
  console.log('2. API Key格式是否需要 "GroupId:SecretKey"');
  console.log('3. 控制台截图或文档链接');

}

main();
