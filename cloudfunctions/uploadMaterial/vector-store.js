/**
 * 向量存储模块 - Phase 3: 统一向量集合
 * 使用 user_materials_vectors 集合
 * 通过 metadata 过滤: openid, material_id, material_type
 */

/**
 * 向量集合名称
 */
const VECTOR_COLLECTION = 'user_materials_vectors';

/**
 * Metadata 过滤字段
 */
const FILTER_FIELDS = ['openid', 'material_id', 'material_type'];

/**
 * 保存向量到统一集合
 * @param {Object} vectorData - 向量数据
 * @param {string} vectorData.material_id - 材料ID
 * @param {string} vectorData.openid - 用户openid
 * @param {string} vectorData.material_type - 材料类型 (personal/textbook)
 * @param {Array<Object>} vectorData.chunks - 文本分块数组
 * @param {string} chunks[].id - 分块ID
 * @param {string} chunks[].text - 分块文本
 * @param {number[]} chunks[].embedding - 向量嵌入
 * @param {Object} chunks[].metadata - 元数据
 * @param {Object} vectorDb - 向量数据库实例
 * @returns {Promise<Object>} { success: boolean, inserted_count?: number, error?: string }
 */
async function saveVectors(vectorData, vectorDb) {
  try {
    const { material_id, openid, material_type, chunks } = vectorData;

    // 验证必填字段
    if (!material_id || !openid || !material_type) {
      return {
        success: false,
        error: '必填字段缺失: material_id, openid, material_type'
      };
    }

    // 验证chunks
    if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
      return {
        success: false,
        error: 'chunks不能为空且必须是数组'
      };
    }

    // 构建向量记录
    const vectors = chunks.map(chunk => ({
      id: chunk.id,
      material_id,
      openid,
      material_type,
      text: chunk.text,
      vector: chunk.embedding,
      metadata: {
        ...chunk.metadata,
        material_id,
        openid,
        material_type,
        chunk_index: chunk.metadata?.chunk_index || 0
      }
    }));

    const result = await vectorDb.insert({
      collection_name: VECTOR_COLLECTION,
      vectors
    });

    return {
      success: true,
      inserted_count: result.inserted || vectors.length
    };

  } catch (error) {
    console.error('saveVectors error:', error);
    return {
      success: false,
      error: error.message || '保存向量失败'
    };
  }
}

/**
 * 构建过滤条件
 * @param {Object} params - 查询参数
 * @returns {Object} 过滤条件对象
 */
function buildFilter(params) {
  const filter = {};

  if (params.openid) {
    filter.openid = params.openid;
  }

  if (params.material_id) {
    filter.material_id = params.material_id;
  }

  if (params.material_type) {
    filter.material_type = params.material_type;
  }

  return filter;
}

/**
 * 向量相似度搜索
 * @param {Object} params - 搜索参数
 * @param {string} [params.openid] - 用户openid过滤
 * @param {string} [params.material_id] - 材料ID过滤
 * @param {string} [params.material_type] - 材料类型过滤
 * @param {number[]} params.query_embedding - 查询向量
 * @param {number} [params.limit] - 返回数量限制，默认10
 * @param {Object} vectorDb - 向量数据库实例
 * @returns {Promise<Object>} { success: boolean, results?: Array, error?: string }
 */
async function searchVectors(params, vectorDb) {
  try {
    const { query_embedding, limit = 10 } = params;

    // 验证查询向量
    if (!query_embedding || !Array.isArray(query_embedding)) {
      return {
        success: false,
        error: 'query_embedding必须是数组'
      };
    }

    // 构建过滤条件
    const filter = buildFilter(params);

    // 执行搜索
    const result = await vectorDb.search({
      collection_name: VECTOR_COLLECTION,
      filter,
      vector: query_embedding,
      limit
    });

    return {
      success: true,
      results: result.results || []
    };

  } catch (error) {
    console.error('searchVectors error:', error);
    return {
      success: false,
      error: error.message || '向量搜索失败'
    };
  }
}

/**
 * 删除向量
 * @param {Object} params - 删除参数
 * @param {string} [params.material_id] - 材料ID
 * @param {string} [params.openid] - 用户openid
 * @param {Object} vectorDb - 向量数据库实例
 * @returns {Promise<Object>} { success: boolean, deleted_count?: number, error?: string }
 */
async function deleteVectors(params, vectorDb) {
  try {
    // 至少需要一个过滤条件
    if (!params.material_id && !params.openid) {
      return {
        success: false,
        error: '必须提供 material_id 或 openid 作为删除条件'
      };
    }

    // 构建过滤条件
    const filter = buildFilter(params);

    // 执行删除
    const result = await vectorDb.delete({
      collection_name: VECTOR_COLLECTION,
      filter
    });

    return {
      success: true,
      deleted_count: result.deleted || 0
    };

  } catch (error) {
    console.error('deleteVectors error:', error);
    return {
      success: false,
      error: error.message || '删除向量失败'
    };
  }
}

module.exports = {
  VECTOR_COLLECTION,
  FILTER_FIELDS,
  saveVectors,
  searchVectors,
  deleteVectors,
  buildFilter
};
