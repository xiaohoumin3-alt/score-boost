/**
 * RAG 上下文构建器
 * Phase 7: 为专属测评提供用户资料上下文
 */

/**
 * 构建用户资料的 RAG 上下文
 * @param {Object} db - 数据库实例
 * @param {Object} _ - 数据库命令对象
 * @param {string} openid - 用户 openid
 * @param {Array<string>} chunkIds - chunk ID 列表
 * @param {number} limit - 最大 chunks 数量
 * @returns {Promise<Object>} RAG 上下文对象
 */
async function buildUserMaterialContext(db, _, openid, chunkIds, limit = 50) {
  try {
    if (!chunkIds || chunkIds.length === 0) {
      return {
        hasContext: false,
        chunks: [],
        summary: ''
      };
    }

    // 从 user_materials_vectors 获取 chunks
    const result = await db.collection('user_materials_vectors')
      .where({
        _id: _.in(chunkIds)
      })
      .limit(limit)
      .get();

    const chunks = result.data || [];

    if (chunks.length === 0) {
      return {
        hasContext: false,
        chunks: [],
        summary: ''
      };
    }

    // 构建上下文摘要
    const summary = chunks
      .map((c, i) => `[资料${i + 1}] ${c.content}`)
      .join('\n\n');

    return {
      hasContext: true,
      chunks: chunks.map(c => ({
        id: c._id,
        content: c.content,
        metadata: c.metadata || {},
        material_id: c.material_id
      })),
      summary,
      chunkCount: chunks.length
    };
  } catch (error) {
    console.error('[buildUserMaterialContext] Error:', error);
    return {
      hasContext: false,
      chunks: [],
      summary: '',
      error: error.message
    };
  }
}

/**
 * 检查任务是否为专属测评模式
 * @param {Object} task - 队列任务
 * @returns {boolean} 是否为专属测评
 */
function isExclusiveMode(task) {
  return !!(task && task.mode === 'exclusive');
}

/**
 * 获取任务的 RAG chunks ID 列表
 * @param {Object} task - 队列任务
 * @returns {Array<string>} chunk ID 列表
 */
function getRagChunkIds(task) {
  if (!task || !task.rag_chunks || !Array.isArray(task.rag_chunks)) {
    return [];
  }
  return task.rag_chunks;
}

module.exports = {
  buildUserMaterialContext,
  isExclusiveMode,
  getRagChunkIds
};
