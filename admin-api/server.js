/**
 * 使用CLI调用云函数的简单HTTP服务
 */
const express = require('express');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/admin', async (req, res) => {
  try {
    const { action, data } = req.body;

    // 使用tcb CLI调用云函数
    const dataStr = JSON.stringify({ action, data });
    const command = `tcb fn invoke adminProxy --data '${dataStr.replace(/'/g, "'\\''")}'`;

    const { stdout, stderr } = await execAsync(command);
    const output = stdout || stderr;

    // 解析CLI输出
    const match = output.match(/返回结果：({.*})/);
    if (match) {
      const result = JSON.parse(match[1]);
      res.json(result);
    } else {
      throw new Error('无法解析云函数响应');
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
