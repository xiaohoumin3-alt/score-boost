/**
 * RAG检索模块
 * 功能：从user_materials_vectors向量集合检索相关chunks
 *
 * 环境变量：
 * - VECTOR_COLLECTION_NAME: 向量集合名称（默认：user_materials_vectors）
 */

/**
 * 从user_materials_vectors检索相关chunks
 *
 * @param {Object} db - 数据库实例
 * @param {Object} _ - 数据库命令对象
 * @param {string} openid - 用户openid
 * @param {string[]} material_ids - 资料ID列表
 * @param {string} query - 查询文本（用于语义检索）
 * @param {number} topK - 返回数量（默认：50）
 * @returns {Promise<Array>} 相关文本块列表
 */
async function searchUserMaterialChunks(db, _, openid, material_ids, query = '', topK = 50) {
  try {
    // 向量集合名称（可配置环境变量覆盖）
    const collectionName = process.env.VECTOR_COLLECTION_NAME || 'user_materials_vectors';

    // 基础查询条件：使用metadata过滤
    const whereCondition = {
      openid: openid,
      material_id: _.in(material_ids)
    };

    // 如果有查询文本，可以在这里添加向量检索逻辑
    // 注意：当前微信云开发不支持原生向量检索，需要使用腾讯云Vector SDK
    // 这里先实现基础过滤，后续可升级为真正的语义检索

    const result = await db.collection(collectionName)
      .where(whereCondition)
      .limit(topK)
      .get();

    console.log(`[searchUserMaterialChunks] 检索完成，找到 ${result.data.length} 个chunks`);
    console.log(`[searchUserMaterialChunks] openid: ${openid}, materials: ${material_ids.join(',')}`);

    return result.data || [];
  } catch (error) {
    console.error('[searchUserMaterialChunks] 检索失败:', error);
    return [];
  }
}

/**
 * 将检索结果组装成LLM context
 *
 * @param {Array} chunks - 检索到的chunks
 * @param {Object} options - 格式化选项
 * @param {string} options.subject - 学科
 * @param {string} options.grade - 年级
 * @param {string} options.difficulty - 难度
 * @param {number} options.questionCount - 题目数量
 * @returns {string} 格式化的context字符串
 */
function buildRAGContext(chunks, options = {}) {
  const {
    subject = '',
    grade = '',
    difficulty = 'medium',
    questionCount = 10
  } = options;

  if (!chunks || chunks.length === 0) {
    return `【参考资料】暂无参考资料，请基于通用知识生成题目。`;
  }

  let context = `【参考资料】\n\n`;
  context += `以下是从用户上传资料中提取的相关内容，请基于这些资料生成${subject || ''}${grade || ''}题目。\n\n`;

  chunks.forEach((chunk, index) => {
    context += `【参考资料${index + 1}】\n`;

    // 添加元数据信息（如果有）
    if (chunk.metadata) {
      const metaInfo = Object.entries(chunk.metadata)
        .filter(([key]) => !['chunk_index', 'total_chunks'].includes(key))
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
      if (metaInfo) {
        context += `来源：${metaInfo}\n`;
      }
    }

    // 添加文本内容
    context += `${chunk.chunk_text || chunk.text || ''}\n\n`;
  });

  // 添加题目生成要求
  context += `【生成要求】\n`;
  context += `- 学科：${subject || '未指定'}\n`;
  context += `- 年级：${grade || '未指定'}\n`;
  context += `- 难度：${difficulty}\n`;
  context += `- 题目数量：${questionCount}道\n`;
  context += `- 请基于上述参考资料生成题目，确保题目内容与资料相关\n`;
  context += `- 如果资料内容不足以生成所需数量的题目，可以补充通用知识\n`;

  return context;
}

module.exports = {
  searchUserMaterialChunks,
  buildRAGContext
};
