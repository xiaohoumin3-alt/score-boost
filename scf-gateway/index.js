/**
 * SCF HTTP网关 - 调用云开发云函数
 */
const CloudBase = require('@cloudbase/node-sdk');

// 初始化CloudBase（使用环境变量中的密钥）
const tcb = CloudBase.init({
  env: process.env.TCB_ENV || 'cloud1-7gg9y9tjb2b867b6',
  secretId: process.env.TCB_SECRET_ID || 'AKIDMMAH4WFKm0Ka0Tj51U_OEY9tjSxVfSSepvG0WQ9m4MiWzhsZUfw_iYWlRrttUFw-',
  secretKey: process.env.TCB_SECRET_KEY || 'TJlJMCggPfsNakUj9zVf4cCHWe6Hfmueqn29fYOu9Dk=',
  token: process.env.TCB_TOKEN || 'roxBGkA257KTUFeiLBwcn7t5xr33eaPa2e9478df7c4881b0c6a3688d1b44a211VDZOoEapSHCVkWmeqJHFQK1lrNxp5cy_6vcuiqGrq_8Mc3v7xc5MEimmYMYF6qDPk27z36Y4Q6XR0eCXL3jDEYGWrvVSFjY-aA7iY4-xl2jY-FT_vUtmxyjLdjd0K4xcrQkCpEs7hyus1V4ROGEHmvJmiG5kJqpvsDjwKjapSWquhJ04zxhWMIa-zYjJPuZCwM7DqeHvOpXUz2g2kFKW3UDP9NBZzZICclGsjh0wj8HYfMgOePC5d5nuIkwVSTuogB4HBJnSckRuND-hzoc0sNq5-_g9ryPMU6kWHz4ur9dAfBbCLUTbYAsi1P1KogLtCgepUW9GOE03Q2iicApEsQ9wdDm2YtAVZNvXyRIY2cdp2Lj3h5paArl7G3ea2M-2nofUIKwwzCPjqHO4bQKzsmARzV4J2sojIXn958yCLgA'
});

exports.main_handler = async (event, context) => {
  console.log('SCF Event:', JSON.stringify({ event, context }));

  try {
    // 解析请求
    let action, data;
    if (event.body) {
      const body = JSON.parse(event.body);
      action = body.action;
      data = body.data;
    } else if (event.action) {
      action = event.action;
      data = event.data;
    }

    if (!action) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: 'Missing action' })
      };
    }

    console.log('Calling adminProxy:', { action, data: { ...data, password: '***' } });

    // 调用adminProxy云函数
    const result = await tcb.callFunction({
      name: 'adminProxy',
      data: { action, data }
    });

    console.log('adminProxy result:', result.result);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(result.result || result)
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};
