/**
 * 直接用正确的Key测试
 */

const apiKey = 'sk-cp-wckNQgNpPA6ZCK0o4dpRYLBlQZlmI90H_B6SYJXJho60UI2kg6V_UtzX6e1rn5M-6-H6ykw5_dViXSDrBj3ofTVmipW5VsoTRcCD9LahfIEfAqhk8grSqhQ';

console.log('API Key:', apiKey.substring(0, 30) + '...');
console.log('Key长度:', apiKey.length);
console.log('Base URL: https://api.minimaxi.com/v1');
console.log('Model: MiniMax-M2.7');

async function testMiniMax() {
  const url = 'https://api.minimaxi.com/v1/text/chatcompletion_v2';

  const payload = {
    model: 'MiniMax-M2.7',
    stream: false,
    tokens_to_generate: 300,
    temperature: 0.7,
    top_p: 0.95,
    mask_sensitive_info: false,
    messages: [
      {
        role: 'user',
        content: `请生成一道关于"二次根式的概念"的简单选择题。

要求：
1. 只返回纯JSON格式，不要其他文字
2. 格式：{"question":"题目内容","options":["选项A","选项B","选项C","选项D"],"correct_answer":0,"explanation":"解析内容"}

请生成：`
      }
    ]
  };

  console.log('\n发送请求...');

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
    console.log(`响应时间: ${elapsed}ms`);
    console.log(`状态码: ${response.status}`);

    if (!response.ok) {
      const text = await response.text();
      console.error('✗ HTTP错误:', response.statusText);
      console.error('详情:', text);
      process.exit(1);
    }

    const data = await response.json();

    if (data.base_resp?.status_code !== 0) {
      console.error('✗ API错误:', data.base_resp?.status_msg);
      console.error('完整响应:', JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log('\n✅ API调用成功!');

    // MiniMax返回OpenAI兼容格式
    const content = data.choices?.[0]?.message?.content ||
                    data.choices?.[0]?.messages?.[0]?.text;

    if (!content) {
      console.error('✗ 响应中没有内容');
      console.log('完整响应:', JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log('\n生成的内容:');
    console.log('='.repeat(60));
    console.log(content);
    console.log('='.repeat(60));

    // Token使用
    if (data.usage) {
      console.log('\nToken使用:');
      console.log('  - Total:', data.usage.total_tokens);
    }

    // 尝试解析JSON
    try {
      const jsonMatch = content.match(/\{[\s\S]*?\n?\}/);
      if (jsonMatch) {
        const questionData = JSON.parse(jsonMatch[0]);
        console.log('\n✅ 成功解析题目JSON!');
        console.log('题目:', questionData.question);
        console.log('选项:', questionData.options);
        console.log('答案:', questionData.correct_answer);
      }
    } catch (e) {
      console.log('\n⚠️  JSON解析:', e.message);
    }

    console.log('\n✅✅✅ MiniMax API验证通过！');

    return { success: true, data };

  } catch (error) {
    console.error('\n✗ 请求失败:', error.message);
    process.exit(1);
  }
}

testMiniMax();
