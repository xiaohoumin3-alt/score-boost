/**
 * Timer Trigger Configuration Tests
 * 验证定时触发器配置
 */

const fs = require('fs');
const path = require('path');

describe('Timer Trigger Configuration', () => {
  const configPath = path.join(__dirname, '../config.json');

  test('config.json应存在', () => {
    expect(fs.existsSync(configPath)).toBe(true);
  });

  test('triggers配置应存在', () => {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(config.triggers).toBeDefined();
    expect(Array.isArray(config.triggers)).toBe(true);
  });

  test('应有timer类型的触发器', () => {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const timerTrigger = config.triggers.find(t => t.type === 'timer');
    expect(timerTrigger).toBeDefined();
    expect(timerTrigger.name).toBe('processQueueTimer');
  });

  test('定时触发器应配置为每15秒执行', () => {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const timerTrigger = config.triggers.find(t => t.type === 'timer');
    // 每15秒触发一次（*/15 * * * * * * 是crontab格式）
    // 微信云开发timer格式：秒 分 时 日 月 周
    expect(timerTrigger.config).toBe('*/15 * * * * * *');
  });

  test('触发器名称应唯一', () => {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const triggerNames = config.triggers.map(t => t.name);
    const uniqueNames = [...new Set(triggerNames)];
    expect(triggerNames.length).toBe(uniqueNames.length);
  });
});