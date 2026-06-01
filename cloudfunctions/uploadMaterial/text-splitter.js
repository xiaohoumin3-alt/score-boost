/**
 * 智能分块模块
 * 支持语义分块和固定分块，带降级策略
 */

/**
 * 默认配置
 */
const DEFAULT_CHUNK_SIZE = 500; // 字符数
const DEFAULT_CHUNK_OVERLAP = 50; // 重叠字符数
const MIN_CHUNK_SIZE = 100; // 最小分块大小
const MAX_CHUNK_SIZE = 2000; // 最大分块大小

/**
 * 语义边界标记模式
 */
const SEMANTIC_PATTERNS = [
  /^第[零一二三四五六七八九十百千0-9]+[章节篇]/m, // 中文章节
  /^[一二三四五六七八九十]+[、．.]\s*/m, // 中文序号
  /^\d+[、．.]\s*/m, // 数字序号
  /^[A-Z][a-z]+\s*\d+/m, // 英文章节如 Chapter 1
  /^#{1,3}\s+/m, // Markdown 标题
];

/**
 * 按段落分割文本
 * @param {string} text - 输入文本
 * @returns {string[]} 段落数组
 */
function splitByParagraphs(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  // 统一换行符
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 按双换行符分割段落
  const paragraphs = normalizedText
    .split(/\n\n+/)
    .map(p => p.replace(/\n+/g, ' ').trim())
    .filter(p => p.length > 0);

  return paragraphs;
}

/**
 * 按语义边界分割文本
 * @param {string} text - 输入文本
 * @returns {string[]} 语义块数组
 */
function splitBySemanticChunks(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const lines = text.split(/\n/);
  const chunks = [];
  let currentChunk = '';

  for (const line of lines) {
    // 检查是否是语义边界
    const isBoundary = SEMANTIC_PATTERNS.some(pattern => pattern.test(line));

    if (isBoundary && currentChunk.length > MIN_CHUNK_SIZE) {
      // 保存当前块，开始新块
      chunks.push(currentChunk.trim());
      currentChunk = line;
    } else if (isBoundary && currentChunk.length === 0) {
      // 第一行就是边界，直接开始新块
      currentChunk = line;
    } else if (isBoundary && currentChunk.length > 0) {
      // 当前块太小但有新边界，先保存当前块再开始新块
      chunks.push(currentChunk.trim());
      currentChunk = line;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + line;
    }
  }

  // 添加最后一块
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // 合并过小的块（除了最后一个）
  const mergedChunks = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (chunk.length >= MIN_CHUNK_SIZE || i === chunks.length - 1) {
      mergedChunks.push(chunk);
    } else if (mergedChunks.length > 0) {
      // 合并到前一个块
      mergedChunks[mergedChunks.length - 1] += '\n\n' + chunk;
    } else {
      // 第一个块太小，保留
      mergedChunks.push(chunk);
    }
  }

  return mergedChunks;
}

/**
 * 创建固定大小的文本块
 * @param {string} text - 输入文本
 * @param {number} chunkSize - 块大小（字符数）
 * @param {number} chunkOverlap - 块重叠（字符数）
 * @returns {string[]} 文本块数组
 */
function createFixedChunks(text, chunkSize = DEFAULT_CHUNK_SIZE, chunkOverlap = DEFAULT_CHUNK_OVERLAP) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks = [];
  let position = 0;
  const effectiveChunkSize = chunkSize - chunkOverlap;

  while (position < text.length) {
    const end = Math.min(position + chunkSize, text.length);
    const chunk = text.substring(position, end);
    chunks.push(chunk);

    // 移动到下一个块的位置（考虑重叠）
    position += effectiveChunkSize;
  }

  return chunks;
}

/**
 * 主分块函数
 * 按优先级尝试：语义分块 → 段落分块 → 固定分块
 * @param {string} text - 输入文本
 * @param {Object} options - 配置选项
 * @param {number} options.chunkSize - 目标块大小
 * @param {number} options.chunkOverlap - 块重叠大小
 * @param {Object} options.metadata - 元数据（会附加到每个块）
 * @param {string} options.strategy - 强制使用指定策略 ('semantic' | 'paragraph' | 'fixed')
 * @returns {string[]} 文本块数组
 */
function splitText(text, options = {}) {
  // 输入验证
  if (!text || typeof text !== 'string') {
    return [];
  }

  const trimmedText = text.trim();
  if (trimmedText.length === 0) {
    return [];
  }

  const {
    chunkSize = DEFAULT_CHUNK_SIZE,
    chunkOverlap = DEFAULT_CHUNK_OVERLAP,
    strategy
  } = options;

  // 根据策略选择分块方法
  if (strategy === 'fixed') {
    return createFixedChunks(trimmedText, chunkSize, chunkOverlap);
  }

  if (strategy === 'paragraph') {
    const paragraphs = splitByParagraphs(trimmedText);
    // 如果段落太大，使用固定分块
    if (paragraphs.every(p => p.length > chunkSize)) {
      return createFixedChunks(trimmedText, chunkSize, chunkOverlap);
    }
    return paragraphs;
  }

  if (strategy === 'semantic') {
    return splitBySemanticChunks(trimmedText);
  }

  // 自动策略：语义 → 段落 → 固定
  try {
    // 1. 尝试语义分块
    const semanticChunks = splitBySemanticChunks(trimmedText);

    // 检查语义分块是否有效
    const hasValidChunks = semanticChunks.some(chunk =>
      chunk.length >= MIN_CHUNK_SIZE && chunk.length <= MAX_CHUNK_SIZE
    );

    if (hasValidChunks && semanticChunks.length > 1) {
      return semanticChunks;
    }

    // 2. 尝试段落分块
    const paragraphs = splitByParagraphs(trimmedText);

    if (paragraphs.length > 1) {
      return paragraphs;
    }

    // 3. 降级到固定分块
    return createFixedChunks(trimmedText, chunkSize, chunkOverlap);
  } catch (error) {
    // 任何错误都降级到固定分块
    return createFixedChunks(trimmedText, chunkSize, chunkOverlap);
  }
}

module.exports = {
  DEFAULT_CHUNK_SIZE,
  DEFAULT_CHUNK_OVERLAP,
  MIN_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  splitByParagraphs,
  splitBySemanticChunks,
  createFixedChunks,
  splitText
};
