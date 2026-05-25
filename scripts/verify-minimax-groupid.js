/**
 * 用GroupId格式测试
 */

require('dotenv').config({ path: '.env.local' });

const apiKey = process.env.MINIMAX_API_KEY || process.env.DASHSCOPE_API_KEY;

// 解析GroupId和SecretKey
let groupId = '';
let secretKey = apiKey;

// 尝试 tp-xxx 格式
if (apiKey.startsWith('tp-')) {
  groupId = 'tp';  // 或者可能是 'tp-cu4julls'?
  secretKey = apiKey.substring(3);
  console.log('检测到 tp- 前缀');
  console.log('GroupId:', groupId);
  console.log('SecretKey:', secretKey.substring(0, 30) + '...');
}

async function testWithGroupId() {
  const url = 'https://api.minimaxi.com/v1/text/chatcompletion_v2';

  const payload = {
    model: 'MiniMax-M2.7',
    stream: false,
    tokens_to_generate: 100,
    temperature: 0.1,
    messages: [
      {
        sender_type: 'USER',
        sender_name: 'User',
        text: 'Hi, test'
      }
    ]
  };

  console.log('\n测试配置:');
  console.log('URL:', url);
  console.log('GroupId:', groupId || '(无)');
  console.log('SecretKey:', secretKey.substring(0, 20) + '...');

  // 尝试几种header组合
  const headerConfigs = [
    {
      name: 'GroupId header + Bearer SecretKey',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
        ...(groupId ? { 'GroupId': groupId } : {})
      }
    },
    {
      name: 'GroupId header + Bearer fullKey',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(groupId ? { 'GroupId': groupId } : {})
      }
    },
    {
      name: 'GroupId header + Authorization fullKey',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
        ...(groupId ? { 'GroupId': groupId } : {})
      }
    },
    {
      name: 'GroupId=xxx in URL + Bearer SecretKey',
      url: `${url}?GroupId=${groupId}`,
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
      }
    }
  ];

  for (const config of headerConfigs) {
    console.log(`\n尝试: ${config.name}`);

    try {
      const response = await fetch(config.url || url, {
        method: 'POST',
        headers: config.headers,
        body: JSON.stringify(payload)
      });

      const text = await response.text();
      console.log(`  状态: ${response.status}`);

      if (response.status === 200) {
        const data = JSON.parse(text);
        if (data.base_resp?.status_code === 0) {
          console.log('  ✅ 成功!');
          console.log('\n' + '='.repeat(60));
          console.log('完整响应:');
          console.log(JSON.stringify(data, null, 2));
          console.log('='.repeat(60));
          return config;
        }
      }

      console.log(`  ✗ ${text.substring(0, 100)}`);

    } catch (error) {
      console.log(`  ✗ ${error.message}`);
    }
  }

  console.log('\n❌ 所有配置都失败了');
  console.log('\n请确认:');
  console.log('1. 在MiniMax控制台查看正确的API Key格式');
  console.log('2. 确认GroupId是什么');
  console.log('3. 确认账户状态正常');
}

testWithGroupId();
