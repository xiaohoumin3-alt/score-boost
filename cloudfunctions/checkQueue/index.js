exports.main = async (event, context) => {
  const cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  const db = cloud.database();
  
  try {
    const result = await db.collection('question_queue')
      .orderBy('created_at', 'desc')
      .limit(10)
      .get();
    
    console.log('=== 队列任务检查 ===');
    console.log('总数:', result.data?.length || 0);
    
    for (const task of result.data || []) {
      console.log('---');
      console.log('_id:', task._id);
      console.log('status:', task.status);
      console.log('subject:', task.subject);
      console.log('created_at:', task.created_at);
    }
    
    return { success: true, count: result.data?.length || 0, tasks: result.data };
  } catch (e) {
    console.error('Error:', e);
    return { success: false, error: e.message, code: e.errMsg };
  }
};
