/**
 * 管理后台API中间层
 * 部署到云托管，接收前端请求并调用adminProxy云函数
 */
const express = require('express');
const tcb = require('@cloudbase/node-sdk');

const app = express();
app.use(express.json());

// 初始化CloudBase（服务端，无需认证）
const tcbApp = tcb.init({
  env: 'cloud1-7gg9y9tjb2b867b6',
  secretId: 'AKIDMMAH4WFKm0Ka0Tj51U_OEY9tjSxVfSSepvG0WQ9m4MiWzhsZUfw_iYWlRrttUFw-',
  secretKey: 'TJlJMCggPfsNakUj9zVf4cCHWe6Hfmueqn29fYOu9Dk=',
  token: 'roxBGkA257KTUFeiLBwcn7t5xr33eaPa2e9478df7c4881b0c6a3688d1b44a211VDZOoEapSHCVkWmeqJHFQK1lrNxp5cy_6vcuiqGrq_8Mc3v7xc5MEimmYMYF6qDPk27z36Y4Q6XR0eCXL3jDEYGWrvVSFjY-aA7iY4-xl2jY-FT_vUtmxyjLdjd0K4xcrQkCpEs7hyus1V4ROGEHmvJmiG5kJqpvsDjwKjapSWquhJ04zxhWMIa-zYjJPuZCwM7DqeHvOpXUz2g2kFKW3UDP9NBZzZICclGsjh0wj8HYfMgOePC5d5nuIkwVSTuogB4HBJnSckRuND-hzoc0sNq5-_g9ryPMU6kWHz4ur9dAfBbCLUTbYAsi1P1KogLtCgepUW9GOE03Q2iicApEsQ9wdDm2YtAVZNvXyRIY2cdp2Lj3h5paArl7G3ea2M-2nofUIKwwzCPjqHO4bQKzsmARzV4J2sojIXn958yCLgA'
});

// CORS支持
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API代理入口
app.post('/api/admin', async (req, res) => {
  try {
    const { action, data } = req.body;
    console.log('[API] 请求:', { action, data: { ...data, password: '***' } });

    // 通过服务端SDK调用adminProxy云函数
    const result = await tcbApp.callFunction({
      name: 'adminProxy',
      data: { action, data }
    });

    console.log('[API] 响应:', result.result);
    res.json(result.result);
  } catch (error) {
    console.error('[API] 错误:', error);
    res.status(500).json({
      success: false,
      error: error.message || '服务器错误'
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API服务运行在端口 ${PORT}`);
});
