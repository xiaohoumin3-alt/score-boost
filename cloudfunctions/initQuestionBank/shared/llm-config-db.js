/**
 * LLM 数据库配置模块
 */

/**
 * 获取当前激活的 Provider 配置
 * @param {Object} db - 数据库实例
 * @returns {Promise<Object>} 配置对象
 */
async function getConfig(db) {
  try {
    const res = await db.collection('llm_config')
      .where({ is_active: true })
      .limit(1)
      .get();

    if (res.data && res.data.length > 0) {
      const config = res.data[0];

      if (!config.api_key || !config.base_url || !config.model) {
        throw new Error('Invalid config: missing required fields');
      }

      console.log('[LLM Config DB] Using provider:', config._id);

      return {
        apiKey: config.api_key,
        baseUrl: config.base_url,
        model: config.model,
        providerId: config._id
      };
    }

    throw new Error('No active provider found');
  } catch (e) {
    console.log('[LLM Config DB] Read failed:', e.message);
    throw e;
  }
}

module.exports = { getConfig };
