/**
 * 知识点提取模块
 * 使用 DeepSeek LLM 从文本块提取知识点
 * 重试3次，失败降级到按固定字符分块
 */

const { generateJSON } = require('./llm-client');

const FIXED_CHUNK_SIZE = 500; // 降级时固定分块大小

/**
 * 从文本块提取知识点（带重试+降级）
 * @param {string[]} chunks - 文本块数组
 * @param {Object} options - 配置选项
 * @param {string} [options.subject] - 学科
 * @param {string} [options.grade] - 年级
 * @param {number} [options.maxRetries] - 最大重试次数，默认3
 * @returns {Promise<Object[]>} 知识点数组
 */
async function extractKnowledgePoints(chunks, options = {}) {
  const { subject = '', grade = '', maxRetries = 3 } = options;

  if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
    return [];
  }

  // 合并chunks为一段文本（限制长度）
  const combinedText = chunks.join('\n\n').substring(0, 4000);

  const prompt = `请从以下学习资料中提取知识点。每个知识点包含title和description。

学科：${subject || '未知'}
年级：${grade || '未知'}

学习资料内容：
${combinedText}

请返回JSON数组格式：
[
  {"title": "知识点名称", "description": "知识点描述", "chunk_indices": [0, 1]},
  ...
]

要求：
1. 提取3-10个核心知识点
2. description简洁明了，100字以内
3. chunk_indices标记该知识点关联的文本块索引`;

  // 重试逻辑
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await generateJSON(prompt, { temperature: 0.3 });

      if (Array.isArray(result) && result.length > 0) {
        return result.map((kp, index) => ({
          title: kp.title || `知识点${index + 1}`,
          description: kp.description || '',
          chunk_indices: kp.chunk_indices || [index]
        }));
      }

      throw new Error('LLM 返回空结果');
    } catch (error) {
      lastError = error;
      console.warn(`知识点提取第${attempt + 1}次失败:`, error.message);

      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  // 降级策略：按固定字符分块作为知识点
  console.warn('知识点提取失败，降级到固定分块策略');
  return fallbackChunkExtraction(combinedText);
}

/**
 * 降级方案：按固定字符分块提取知识点
 * @param {string} text - 原始文本
 * @returns {Object[]} 知识点数组
 */
function fallbackChunkExtraction(text) {
  const points = [];

  for (let i = 0; i < text.length; i += FIXED_CHUNK_SIZE) {
    const chunk = text.substring(i, i + FIXED_CHUNK_SIZE).trim();
    if (chunk.length > 0) {
      points.push({
        title: `知识点片段 ${points.length + 1}`,
        description: chunk.substring(0, 100),
        chunk_indices: [Math.floor(i / FIXED_CHUNK_SIZE)]
      });
    }
  }

  return points.length > 0 ? points : [{
    title: '未命名知识点',
    description: text.substring(0, 100),
    chunk_indices: [0]
  }];
}

module.exports = {
  extractKnowledgePoints,
  fallbackChunkExtraction,
  FIXED_CHUNK_SIZE
};
