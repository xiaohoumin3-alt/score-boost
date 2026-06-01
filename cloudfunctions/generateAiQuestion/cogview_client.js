/**
 * 图片生成客户端
 * 使用 MiniMax Image Generation API 生成数学题目配套图片
 */

const https = require('https');

const IMAGE_CONFIG = {
  apiKey: process.env.MINIMAX_API_KEY,
  baseUrl: 'api.minimax.chat',
  model: 'image-01'
};

class ImageClient {
  constructor(apiKey) {
    this.apiKey = apiKey || IMAGE_CONFIG.apiKey;
    this.baseUrl = IMAGE_CONFIG.baseUrl;
    this.model = IMAGE_CONFIG.model;
    this.timeout = 60000;
  }

  /**
   * 生成数学题目配套图片
   * @param {Object} params
   * @param {string} params.question - 题目内容
   * @param {string} params.kpName - 知识点名称
   * @param {string} params.difficulty - 难度
   * @param {string} params.subject - 科目
   * @returns {Promise<{imageUrl: string, prompt: string}>}
   */
  async generateImage(params) {
    const { question, kpName, difficulty, subject = 'math' } = params;

    if (!this.apiKey) {
      console.log('[ImageClient] API key missing!');
      return null;
    }

    const prompt = this._buildPrompt(question, kpName, difficulty, subject);
    console.log('[ImageClient] Generating image, prompt:', prompt.substring(0, 80) + '...');

    try {
      const imageData = await this._callApi(prompt);
      if (imageData && imageData.data && imageData.data.image_urls) {
        return {
          imageUrl: imageData.data.image_urls[0],
          prompt: prompt
        };
      }
      return null;
    } catch (error) {
      console.error('[ImageClient] Generation failed:', error.message);
      return null;
    }
  }

  /**
   * 构建图片生成prompt
   */
  _buildPrompt(question, kpName, difficulty, subject) {
    const subjectText = { math: '数学', biology: '生物', geography: '地理' }[subject] || '数学';

    // 知识点对应的图形类型
    const graphicTypes = {
      '勾股定理': '直角三角形示意图，标注直角边和斜边长度',
      '二次根式': '数轴示意图，标注实数位置',
      '一次函数': '平面直角坐标系中的一次函数直线',
      '平行四边形': '平行四边形几何图形',
      '数据的分析': '统计图表（柱状图或折线图）'
    };

    let graphicType = '几何示意图';
    for (const [key, value] of Object.entries(graphicTypes)) {
      if (kpName.includes(key)) {
        graphicType = value;
        break;
      }
    }

    // 简短prompt适合API
    return `Math geometry illustration: ${graphicType}. Clean educational style, white background. No text labels except basic measurements.`;
  }

  /**
   * 调用 MiniMax Image API
   */
  _callApi(prompt) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        model: this.model,
        prompt: prompt
      });

      const options = {
        hostname: this.baseUrl,
        port: 443,
        path: '/v1/image_generation',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: this.timeout
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            const result = JSON.parse(body);
            if (result.base_resp?.status_code !== 0) {
              reject(new Error(result.base_resp?.status_msg || 'API error'));
            } else {
              resolve(result);
            }
          } catch (e) {
            reject(new Error(`Parse error: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(data);
      req.end();
    });
  }
}

module.exports = { ImageClient };
