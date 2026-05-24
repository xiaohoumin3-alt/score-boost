/**
 * 验证DashScope API连接
 * 实际调用API确认配置正确
 */

require('dotenv').config({ path: '.env.local' });

const apiKey = process.env.DASHSCOPE_API_KEY;

if (!apiKey) {
  console.error('✗ DASHSCOPE_API_KEY 未配置');
  process.exit(1);
}

console.log('API Key:', apiKey.substring(0, 20) + '...');

// 实际调用DashScope API
async function testDashScope() {
  const url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
  const model = 'qwen-max';

  const payload = {
    model,
    input: {
      messages: [
        {
          role: 'system',
          content: '你是一个数学题目生成助手。'
        },
        {
          role: 'user',
          content: '请生成一道关于二次根式的简单选择题，以JSON格式返回，包含question、options（4个选项）、correct_answer（0-3）、explanation字段。'
        }
      ]
    },
    parameters: {
      result_format: 'text',
      temperature: 0.7,
      max_tokens: 500
    }
  };

  console.log('\n发送请求到 DashScope...');
  console.log('模型:', model);

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const elapsed = Date.now() - startTime;
    console.log('响应时间:', elapsed, 'ms');

    if (!response.ok) {
      const errorText = await response.text();
      console.error('✗ HTTP错误:', response.status, response.statusText);
      console.error('详情:', errorText);
      process.exit(1);
    }

    const data = await response.json();

    if (data.code !== 'Success') {
      console.error('✗ API错误:', data.code, data.message);
      if (data.request_id) {
        console.error('Request ID:', data.request_id);
      }
      process.exit(1);
    }

    console.log('\n✅ API调用成功!');
    console.log('Request ID:', data.request_id || data.usage?.request_id);
    console.log('Token使用:', data.usage?.total_tokens || 'N/A');

    // 尝试解析生成的题目
    let content = data.output?.text || data.output?.choices?.[0]?.message?.content || '';

    if (!content) {
      console.error('✗ 响应中没有生成内容');
      console.error('完整响应:', JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log('\n生成的题目预览:');
    console.log('---');
    console.log(content.substring(0, 300) + (content.length > 300 ? '...' : ''));
    console.log('---');

    // 尝试解析JSON
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const questionData = JSON.parse(jsonMatch[0]);
        console.log('\n✅ 成功解析题目JSON!');
        console.log('题目:', questionData.question?.substring(0, 50) + '...');
        console.log('选项数:', questionData.options?.length || 0);
      }
    } catch (e) {
      console.log('\n⚠️  无法解析JSON（可能需要调整prompt）');
    }

    console.log('\n✅ 验证通过！DashScope API配置正确');

  } catch (error) {
    console.error('\n✗ 请求失败:', error.message);
    if (error.cause) {
      console.error('原因:', error.cause);
    }
    process.exit(1);
  }
}

testDashScope();
