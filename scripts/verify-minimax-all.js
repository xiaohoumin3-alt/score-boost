/**
 * 验证MiniMax API - 尝试多种格式
 */

require('dotenv').config({ path: '.env.local' });

const apiKey = process.env.MINIMAX_API_KEY || process.env.DASHSCOPE_API_KEY;

if (!apiKey) {
  console.error('✗ API Key 未配置');
  process.exit(1);
}

console.log('API Key:', apiKey.substring(0, 30) + '...');
console.log('Key长度:', apiKey.length);

// 尝试多种API格式
const apiFormats = [
  {
    name: 'OpenAI兼容 (api.minimax.chat)',
    url: 'https://api.minimax.chat/v1/chat/completions',
    headers: (key) => ({
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    }),
    body: (key) => ({
      model: 'abab6.5s-chat',
      messages: [
        { role: 'system', content: '你是JSON助手' },
        { role: 'user', content: '返回{"test":"success"}' }
      ],
      temperature: 0.1
    }),
    extractContent: (data) => data.choices?.[0]?.message?.content
  },
  {
    name: '原生API (api.minimax.chat)',
    url: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
    headers: (key) => ({
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    }),
    body: (key) => ({
      model: 'abab6.5s-chat',
      tokens_to_generate: 100,
      temperature: 0.1,
      messages: [
        { sender_type: 'USER', sender_name: 'User', text: '返回{"test":"success"}' }
      ]
    }),
    extractContent: (data) => data.choices?.[0]?.messages?.[0]?.text
  },
  {
    name: '原生API + GroupId header',
    url: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
    headers: (key) => {
      const parts = key.split(':');
      return {
        'Authorization': `Bearer ${parts.length > 1 ? parts[1] : key}`,
        'Content-Type': 'application/json',
        ...(parts.length > 1 ? { 'GroupId': parts[0] } : {})
      };
    },
    body: (key) => ({
      model: 'abab6.5s-chat',
      tokens_to_generate: 100,
      temperature: 0.1,
      messages: [
        { sender_type: 'USER', sender_name: 'User', text: '返回{"test":"success"}' }
      ]
    }),
    extractContent: (data) => data.choices?.[0]?.messages?.[0]?.text
  }
];

async function testFormat(format) {
  console.log(`\n尝试: ${format.name}`);
  console.log(`URL: ${format.url}`);

  const startTime = Date.now();

  try {
    const response = await fetch(format.url, {
      method: 'POST',
      headers: format.headers(apiKey),
      body: JSON.stringify(format.body(apiKey))
    });

    const elapsed = Date.now() - startTime;
    console.log(`响应时间: ${elapsed}ms`);
    console.log(`状态码: ${response.status}`);

    const text = await response.text();

    if (!response.ok) {
      console.log(`✗ 失败: ${text.substring(0, 200)}`);
      return false;
    }

    const data = JSON.parse(text);

    if (data.error) {
      console.log(`✗ API错误: ${JSON.stringify(data.error)}`);
      return false;
    }

    if (data.base_resp?.status_code !== 0) {
      console.log(`✗ MiniMax错误: ${data.base_resp.status_msg}`);
      return false;
    }

    const content = format.extractContent(data);
    if (content) {
      console.log(`✅ 成功! 内容: ${content.substring(0, 100)}...`);
      return { success: true, format: format.name, content, data };
    } else {
      console.log(`? 响应OK但无内容`);
      console.log(JSON.stringify(data, null, 2).substring(0, 300));
      return false;
    }

  } catch (error) {
    console.log(`✗ 异常: ${error.message}`);
    return false;
  }
}

async function main() {
  for (const format of apiFormats) {
    const result = await testFormat(format);
    if (result && result.success) {
      console.log('\n✅✅✅ 找到可用格式!');
      console.log('格式:', result.format);
      console.log('\n完整响应示例:');
      console.log(JSON.stringify(result.data, null, 2).substring(0, 500));
      return result;
    }
  }

  console.log('\n❌ 所有格式都失败了');
  console.log('\n请检查:');
  console.log('1. API Key是否正确');
  console.log('2. 是否需要GroupId:SecretKey格式');
  console.log('3. 账户是否有余额');
  process.exit(1);
}

main();
