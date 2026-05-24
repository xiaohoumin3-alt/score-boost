/**
 * 验证MiniMax API连接 - 原生API格式
 */

require('dotenv').config({ path: '.env.local' });

const apiKey = process.env.DASHSCOPE_API_KEY || process.env.MINIMAX_API_KEY;

if (!apiKey) {
  console.error('✗ MINIMAX_API_KEY 未配置');
  process.exit(1);
}

console.log('API Key:', apiKey.substring(0, 20) + '...');

// MiniMax原生API
async function testMiniMaxNative() {
  const url = 'https://api.minimax.chat/v1/text/chatcompletion_v2';

  // 解析API Key获取GroupId (格式: groupId:secretKey)
  let groupId = '';
  let secretKey = apiKey;

  if (apiKey.includes(':')) {
    [groupId, secretKey] = apiKey.split(':');
    console.log('GroupId:', groupId);
  } else {
    // 如果没有冒号，尝试从Key中提取
    console.log('⚠️  API Key可能缺少GroupId');
    console.log('正确格式应该是: groupId:secretKey');
  }

  const payload = {
    model: 'abab6.5s-chat',
    tokens_to_generate: 512,
    temperature: 0.7,
    top_p: 0.95,
    messages: [
      {
        sender_type: 'USER',
        sender_name: 'User',
        text: '请生成一道关于二次根式的简单选择题，返回JSON格式，包含question、options（4个选项）、correct_answer（0-3）、explanation字段。'
      }
    ]
  };

  console.log('\n发送请求到 MiniMax 原生API...');
  console.log('URL:', url);
  console.log('模型:', payload.model);

  const startTime = Date.now();

  try {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${secretKey}`
    };

    // 如果有GroupId，添加到header
    if (groupId) {
      headers['GroupId'] = groupId;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const elapsed = Date.now() - startTime;
    console.log('响应时间:', elapsed, 'ms');

    if (!response.ok) {
      const errorText = await response.text();
      console.error('✗ HTTP错误:', response.status, response.statusText);
      console.error('详情:', errorText);

      // 尝试解析错误信息
      try {
        const errorJson = JSON.parse(errorText);
        console.error('错误详情:', JSON.stringify(errorJson, null, 2));
      } catch (e) {}

      process.exit(1);
    }

    const data = await response.json();

    if (data.base_resp?.status_code !== 0) {
      console.error('✗ API错误:', data.base_resp?.status_msg || 'Unknown error');
      console.error('完整响应:', JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log('\n✅ API调用成功!');

    const content = data.choices?.[0]?.messages?.[0]?.text;

    if (!content) {
      console.error('✗ 响应中没有生成内容');
      console.error('完整响应:', JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log('\n生成的内容:');
    console.log('---');
    console.log(content.substring(0, 600) + (content.length > 600 ? '...' : ''));
    console.log('---');

    console.log('\n✅ 验证通过！MiniMax API配置正确');

  } catch (error) {
    console.error('\n✗ 请求失败:', error.message);
    if (error.cause) {
      console.error('原因:', error.cause);
    }
    process.exit(1);
  }
}

testMiniMaxNative();
