/**
 * 学科配置加载器
 * 从 YAML 文件加载场景、数值、问法配置
 */
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

class SubjectLoader {
  constructor() {
    this.configs = new Map();
    this.configDir = path.join(__dirname, 'subjects');
  }

  /**
   * 加载指定学科和知识点的配置
   * @param {string} subject - 学科代码 (math, physics, etc.)
   * @param {string} knowledgePoint - 知识点ID (kp2_3, etc.)
   * @returns {Object|null} 配置对象或null，配置包含 scenarios, pythagorean_triples, question_patterns
   */
  loadConfig(subject, knowledgePoint) {
    const key = `${subject}_${knowledgePoint}`;
    if (this.configs.has(key)) {
      return this.configs.get(key);
    }

    const filename = `${subject}_${knowledgePoint}.yaml`;
    const filepath = path.join(this.configDir, filename);

    try {
      const content = fs.readFileSync(filepath, 'utf8');
      const config = yaml.load(content);

      // Schema validation
      if (!config) {
        throw new Error(`Config is empty: ${filename}`);
      }
      if (!config.scenarios || !Array.isArray(config.scenarios)) {
        throw new Error(`Missing or invalid 'scenarios' array in ${filename}`);
      }
      if (!config.pythagorean_triples || !Array.isArray(config.pythagorean_triples)) {
        throw new Error(`Missing or invalid 'pythagorean_triples' array in ${filename}`);
      }
      if (!config.question_patterns || !Array.isArray(config.question_patterns)) {
        throw new Error(`Missing or invalid 'question_patterns' array in ${filename}`);
      }

      this.configs.set(key, config);
      return config;
    } catch (e) {
      if (e.code === 'ENOENT') {
        console.log(`Config file not found: ${filename}`);
        return null;
      }
      if (e.name === 'YAMLException') {
        console.error(`YAML parsing error in ${filename}:`, e.message);
        return null;
      }
      console.error(`Failed to load config: ${filename}`, e.message);
      return null;
    }
  }

  /**
   * 从数组中随机选择一个元素
   * @param {Array} array - 数组
   * @returns {*} 随机元素
   */
  _randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  /**
   * 获取随机场景
   * @param {Object} config - 配置对象
   * @returns {Object} 场景对象，包含 id, name, templates
   */
  getRandomScenario(config) {
    return this._randomChoice(config.scenarios);
  }

  /**
   * 获取随机勾股数
   * @param {Object} config - 配置对象
   * @returns {Array<number>} 勾股数 [a, b, c]
   */
  getRandomTriple(config) {
    return this._randomChoice(config.pythagorean_triples);
  }

  /**
   * 获取随机问法模式
   * @param {Object} config - 配置对象
   * @returns {Object} 问法模式对象，包含 type, templates
   */
  getRandomQuestionPattern(config) {
    return this._randomChoice(config.question_patterns);
  }

  /**
   * 从列表中随机选择一个元素
   * @param {Array} array - 数组
   * @returns {*} 随机元素
   */
  getRandomFromList(array) {
    return this._randomChoice(array);
  }

  /**
   * 排除已使用的项目
   * @param {Array} items - 项目列表
   * @param {string|null} keyField - 用于比较的字段名，null表示直接比较值
   * @param {Array} usedItems - 已使用的项目列表
   * @returns {Array} 过滤后的列表
   */
  excludeUsed(items, keyField, usedItems) {
    if (!usedItems || usedItems.length === 0) {
      return items;
    }
    return items.filter(item => {
      const value = keyField ? item[keyField] : item;
      return !usedItems.some(used => {
        if (Array.isArray(value) && Array.isArray(used)) {
          return value.length === used.length && value.every((v, i) => v === used[i]);
        }
        return used === value;
      });
    });
  }

  /**
   * 获取可用场景（排除已使用）
   * @param {Object} config - 配置对象
   * @param {Array<string>} usedIds - 已使用的场景ID列表
   * @returns {Array<Object>} 可用场景列表
   */
  getAvailableScenarios(config, usedIds = []) {
    return this.excludeUsed(config.scenarios, 'id', usedIds);
  }

  /**
   * 获取可用勾股数（排除已使用）
   * @param {Object} config - 配置对象
   * @param {Array<Array<number>>} usedTriples - 已使用的勾股数列表
   * @returns {Array<Array<number>>} 可用勾股数列表
   */
  getAvailableTriples(config, usedTriples = []) {
    return this.excludeUsed(config.pythagorean_triples, null, usedTriples);
  }
}

module.exports = SubjectLoader;
