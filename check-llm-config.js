const cloud = require('wx-server-sdk');
cloud.init({ env: 'cloud1-7gg9y9tjb2b867b6' });

async function check() {
  const db = cloud.database();
  try {
    const res = await db.collection('llm_config').where({ is_active: true }).limit(1).get();
    console.log('llm_config 结果:', JSON.stringify(res.data, null, 2));
    if (res.data.length === 0) {
      console.log('⚠️  llm_config 集合为空或没有 is_active=true 的记录');
    } else {
      const config = res.data[0];
      console.log('✓ 找到配置:', config._id);
      console.log('  provider_id:', config.provider_id);
      console.log('  base_url:', config.base_url);
      console.log('  model:', config.model);
      console.log('  api_key:', config.api_key ? '已设置(' + config.api_key.substring(0, 10) + '...)' : '未设置');
    }
  } catch (e) {
    console.error('数据库查询失败:', e.message);
  }
}

check();
