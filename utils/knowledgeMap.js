/**
 * 知识点ID → 名称映射工具
 * 解决 kp_progress 中 kp_name 为空导致显示 kp_id 代码的问题
 */

const KP_MAP = {
  // ===== 数学 =====
  // 二次根式
  'kp1': '二次根式',
  'kp1_1': '二次根式的概念',
  'kp1_2': '二次根式的性质',
  'kp1_3': '二次根式的运算',
  // 勾股定理
  'kp2': '勾股定理',
  'kp2_1': '勾股定理',
  'kp2_2': '勾股定理的逆定理',
  'kp2_3': '勾股定理的应用',
  // 平行四边形
  'kp3': '平行四边形',
  'kp3_1': '平行四边形的性质',
  'kp3_2': '平行四边形的判定',
  'kp3_3': '特殊的平行四边形',
  // 一次函数
  'kp4': '一次函数',
  'kp4_1': '函数的认识',
  'kp4_2': '一次函数的图像',
  'kp4_3': '一次函数的应用',
  // 数据分析
  'kp5': '数据分析',
  'kp5_1': '数据的集中趋势',
  'kp5_2': '数据的波动程度',

  // ===== 生物 =====
  'bio_ch1': '动物的主要类群',
  'bio_kp1': '腔肠动物',
  'bio_kp2': '扁形动物',
  'bio_kp3': '线形动物',
  'bio_kp4': '环节动物',
  'bio_kp5': '软体动物',
  'bio_kp6': '节肢动物',
  'bio_kp7': '鱼类',
  'bio_kp8': '两栖类',
  'bio_kp9': '爬行类',
  'bio_kp10': '鸟类',
  'bio_kp11': '哺乳类',
  'bio_ch2': '动物的运动和行为',
  'bio_kp12': '动物的运动',
  'bio_kp13': '动物的行为',

  // ===== 地理 =====
  'geo_ch1': '中国的疆域与行政区划',
  'geo_kp1': '中国的地理位置',
  'geo_kp2': '中国的疆域',
  'geo_kp3': '中国的行政区划',
  'geo_kp4': '中国的人口与民族',
  'geo_ch2': '中国的自然环境',
  'geo_kp5': '中国的地形',
  'geo_kp6': '中国的主要山脉',
  'geo_kp7': '中国的气候',
  'geo_kp8': '中国的河流与湖泊',
};

/**
 * 将 kp_id 解析为可读名称
 * @param {string} kpId - 知识点ID，如 'kp1_1', 'bio_kp2'
 * @returns {string} 知识点名称，找不到时返回原ID
 */
function resolveKpName(kpId) {
  if (!kpId) return '';
  return KP_MAP[kpId] || kpId;
}

/**
 * 为对象列表批量解析 kp_name
 * @param {Array} list - 包含 kp_id 的对象数组
 * @param {string} idField - kp_id 字段名（默认 'kp_id'）
 * @param {string} nameField - kp_name 字段名（默认 'kp_name'）
 * @returns {Array} 新数组，保证每个对象都有正确的 kp_name
 */
function resolveKpNames(list, idField = 'kp_id', nameField = 'kp_name') {
  if (!Array.isArray(list)) return [];
  return list.map(item => {
    if (!item[nameField] && item[idField]) {
      return { ...item, [nameField]: resolveKpName(item[idField]) };
    }
    return item;
  });
}

module.exports = {
  KP_MAP,
  resolveKpName,
  resolveKpNames,
};
