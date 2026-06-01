/**
 * AI 类型验证模块
 * 验证用户选择的学科/年级与文档内容是否匹配
 * 可通过环境变量 AI_TYPE_VERIFY_ENABLED 关闭
 */

const { generateCompletion } = require('./llm-client');

const VERIFY_ENABLED = process.env.AI_TYPE_VERIFY_ENABLED !== 'false';

/**
 * 验证资料类型匹配
 * @param {string} parsedText - 文档提取的文本
 * @param {string} subject - 用户选择的学科
 * @param {string} grade - 用户选择的年级
 * @returns {Promise<Object>} { match: boolean, confidence: number, message: string }
 */
async function validateTypeMatch(parsedText, subject, grade) {
  // 验证可配置关闭
  if (!VERIFY_ENABLED) {
    return { match: true, confidence: 1, message: '类型验证已关闭' };
  }

  if (!parsedText || parsedText.trim().length === 0) {
    return { match: true, confidence: 0.5, message: '无文本内容，跳过验证' };
  }

  const textPreview = parsedText.substring(0, 2000);

  const prompt = `请判断以下学习资料的内容是否与指定学科和年级匹配。

指定学科：${subject || '未知'}
指定年级：${grade || '未知'}

资料内容（前2000字）：
${textPreview}

请仅返回以下JSON格式：
{"match": true/false, "confidence": 0.0-1.0, "reason": "判断理由"}`;

  try {
    const result = await generateCompletion(prompt, { temperature: 0.1 });
    const jsonMatch = result.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        match: Boolean(parsed.match),
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
        message: parsed.reason || (parsed.match ? '内容与学科年级匹配' : '内容可能与学科年级不匹配')
      };
    }

    // 无法解析时默认通过（不阻塞用户）
    return { match: true, confidence: 0.5, message: '无法确定匹配度，默认通过' };
  } catch (error) {
    console.warn('AI类型验证失败，默认通过:', error.message);
    return { match: true, confidence: 0, message: `验证失败: ${error.message}` };
  }
}

module.exports = {
  validateTypeMatch,
  VERIFY_ENABLED
};
