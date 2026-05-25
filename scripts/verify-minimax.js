/**
 * 验证MiniMax API连接
 * OpenAI兼容API
 */

require('dotenv').config({ path: '.env.local' });

// 重命名为MINIMAX_API_KEY更清晰
const apiKey = process.env.DASHSCOPE_API_KEY || process.env.MINIMAX_API_KEY;

if (!apiKey) {
  console.error('✗ MINIMAX_API_KEY 未配置');
  process.exit(1);
}

console.log('API Key:', apiKey.substring(0, 20) + '...');

// MiniMax OpenAI兼容API
async function testMiniMax() {
  const url = 'https://api.minimax.chat/v1/chat/completions';
  const model = 'abab6.5s-chat'; // 或其他可用模型

  const payload = {
    model,
    messages: [
      {
        role: 'system',
        content: '你是一个数学题目生成助手。请只返回JSON格式的题目。'
      },
      {
        role: 'user',
        content: `请生成一道关于"二次根式的概念"的简单选择题。

要求：
1. 返回纯JSON格式
2. 包含字段：question(题目), options(4个选项数组), correct_answer(正确答案索引0-3), explanation(解析)

示例格式：
{
  "question": "题目内容",
  "options": ["A", "B", "C", "D"],
  "correct_answer": 0,
  "explanation": "解析内容"
}

请生成题目：`
      }
    ],
    temperature: 0.7,
    max_tokens: 500
  };

  console.log('\n发送请求到 MiniMax API...');
  console.log('URL:', url);
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

    if (data.error) {
      console.error('✗ API错误:', data.error.message || data.error);
      console.error('完整错误:', JSON.stringify(data.error, null, 2));
      process.exit(1);
    }

    console.log('\n✅ API调用成功!');

    // 提取生成的内容
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('✗ 响应中没有生成内容');
      console.error('完整响应:', JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log('\n生成的题目预览:');
    console.log('---');
    console.log(content.substring(0, 500) + (content.length > 500 ? '...' : ''));
    console.log('---');

    // Token使用
    if (data.usage) {
      console.log('\nToken使用:');
      console.log('  - Prompt tokens:', data.usage.prompt_tokens);
      console.log('  - Completion tokens:', data.usage.completion_tokens);
      console.log('  - Total tokens:', data.usage.total_tokens);
    }

    // 尝试解析JSON
    try {
      const jsonMatch = content.match(/\{[\s\S]*?\n?\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[0];
        const questionData = JSON.parse(jsonStr);
        console.log('\n✅ 成功解析题目JSON!');
        console.log('题目:', questionData.question?.substring(0, 60) + '...');
        console.log('选项数:', questionData.options?.length || 0);
        console.log('正确答案:', questionData.correct_answer);
      } else {
        console.log('\n⚠️  未找到JSON格式（可能需要调整prompt）');
      }
    } catch (e) {
      console.log('\n⚠️  JSON解析失败:', e.message);
    }

    console.log('\n✅ 验证通过！MiniMax API配置正确');

  } catch (error) {
    console.error('\n✗ 请求失败:', error.message);
    if (error.cause) {
      console.error('原因:', error.cause);
    }
    process.exit(1);
  }
}

testMiniMax();
