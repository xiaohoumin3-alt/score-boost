/**
 * 积分管理云函数
 * 功能：积分获取、消耗、邀请码管理
 * 修复：并发安全、邀请码唯一性
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 邀请码字符集（易识别，避免混淆）
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * 生成随机邀请码
 */
function generateInviteCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/**
 * 生成唯一邀请码（检查是否已存在）
 */
async function generateUniqueInviteCode() {
  let inviteCode = generateInviteCode();
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const exists = await db.collection('user_points')
      .where({ invite_code: inviteCode })
      .count();

    if (exists.total === 0) {
      return inviteCode;
    }

    inviteCode = generateInviteCode();
    attempts++;
  }

  // 如果10次都重复，使用时间戳后缀
  return generateInviteCode(4) + Date.now().toString(36).slice(-2).toUpperCase();
}

/**
 * 获取或创建用户积分记录
 */
async function getOrCreateUserPoints(openid) {
  try {
    const result = await db.collection('user_points')
      .where({ openid })
      .get();

    if (result.data.length > 0) {
      return result.data[0];
    }

    // 创建新用户积分记录（使用唯一邀请码）
    const inviteCode = await generateUniqueInviteCode();
    const newUser = {
      openid,
      points: 100, // 注册送100积分
      total_earned: 100,
      total_spent: 0,
      invite_code: inviteCode,
      invited_by: null,
      invite_count: 0,
      last_signin: null,
      signin_streak: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const addResult = await db.collection('user_points').add({ data: newUser });
    newUser._id = addResult._id;

    // 记录积分获取
    await db.collection('point_records').add({
      data: {
        user_id: newUser._id,
        openid,
        type: 'earn',
        amount: 100,
        source: 'register',
        description: '新用户注册奖励',
        created_at: new Date().toISOString()
      }
    });

    return newUser;
  } catch (e) {
    console.error('[getOrCreateUserPoints] Error:', e);
    throw e;
  }
}

/**
 * 获取用户积分
 */
async function getPoints(event) {
  const { openid } = event;

  try {
    const user = await getOrCreateUserPoints(openid);

    return {
      success: true,
      data: {
        points: user.points,
        total_earned: user.total_earned,
        total_spent: user.total_spent,
        invite_code: user.invite_code,
        invite_count: user.invite_count,
        signin_streak: user.signin_streak,
        last_signin: user.last_signin
      }
    };
  } catch (e) {
    console.error('[getPoints] Error:', e);
    return { success: false, error: '获取积分失败' };
  }
}

/**
 * 每日签到（并发安全）
 */
async function signin(event) {
  const { openid } = event;

  try {
    const user = await getOrCreateUserPoints(openid);
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // 检查今天是否已签到
    if (user.last_signin === today) {
      return { success: false, error: '今天已经签到过了' };
    }

    // 计算连续签到天数
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];
    let streak = user.last_signin === yesterday ? user.signin_streak + 1 : 1;

    // 签到积分：基础10分，连续7天额外+100
    let points = 10;
    if (streak >= 7) {
      points += 100;
      streak = 0; // 重置连续签到
    }

    // 原子更新用户积分（并发安全）
    // 使用 where + update 确保只更新 last_signin 不是今天的记录
    const updateResult = await db.collection('user_points')
      .where({
        openid,
        last_signin: _.neq(today) // 确保今天没签到过
      })
      .update({
        data: {
          points: _.inc(points),
          total_earned: _.inc(points),
          last_signin: today,
          signin_streak: streak,
          updated_at: now.toISOString()
        }
      });

    // 如果更新了0条记录，说明已经签到过（并发情况）
    if (updateResult.stats.updated === 0) {
      return { success: false, error: '今天已经签到过了' };
    }

    // 记录积分获取
    await db.collection('point_records').add({
      data: {
        user_id: user._id,
        openid,
        type: 'earn',
        amount: points,
        source: 'signin',
        description: streak === 0 ? '连续7天签到奖励' : '每日签到',
        created_at: now.toISOString()
      }
    });

    return {
      success: true,
      data: {
        points_earned: points,
        streak,
        message: streak === 0 ? '连续7天签到，额外获得100积分！' : '签到成功'
      }
    };
  } catch (e) {
    console.error('[signin] Error:', e);
    return { success: false, error: '签到失败' };
  }
}

/**
 * 增加积分（原子操作）
 */
async function earnPoints(event) {
  const { openid, amount, source, description, related_user_id } = event;

  if (!amount || amount <= 0) {
    return { success: false, error: '无效的积分数额' };
  }

  try {
    const user = await getOrCreateUserPoints(openid);

    // 原子更新用户积分
    await db.collection('user_points').doc(user._id).update({
      data: {
        points: _.inc(amount),
        total_earned: _.inc(amount),
        updated_at: new Date().toISOString()
      }
    });

    // 记录积分获取
    await db.collection('point_records').add({
      data: {
        user_id: user._id,
        openid,
        type: 'earn',
        amount,
        source: source || 'other',
        description: description || '积分获取',
        related_user_id,
        created_at: new Date().toISOString()
      }
    });

    return {
      success: true,
      data: {
        points_earned: amount,
        current_points: user.points + amount
      }
    };
  } catch (e) {
    console.error('[earnPoints] Error:', e);
    return { success: false, error: '积分增加失败' };
  }
}

/**
 * 消耗积分（并发安全）
 */
async function spendPoints(event) {
  const { openid, amount, source, description } = event;

  if (!amount || amount <= 0) {
    return { success: false, error: '无效的积分数额' };
  }

  try {
    const user = await getOrCreateUserPoints(openid);

    // 检查积分是否足够
    if (user.points < amount) {
      return {
        success: false,
        error: '积分不足',
        data: {
          current_points: user.points,
          required_points: amount,
          shortage: amount - user.points
        }
      };
    }

    // 原子扣除积分（并发安全）
    // 使用 where 条件确保积分足够才扣除
    const updateResult = await db.collection('user_points')
      .where({
        _id: user._id,
        points: _.gte(amount) // 确保积分足够
      })
      .update({
        data: {
          points: _.inc(-amount),
          total_spent: _.inc(amount),
          updated_at: new Date().toISOString()
        }
      });

    // 如果更新了0条记录，说明积分不足（并发情况）
    if (updateResult.stats.updated === 0) {
      // 重新查询积分
      const updatedUser = await db.collection('user_points').doc(user._id).get();
      return {
        success: false,
        error: '积分不足（可能被其他操作消耗）',
        data: {
          current_points: updatedUser.data.points,
          required_points: amount,
          shortage: amount - updatedUser.data.points
        }
      };
    }

    // 记录积分消耗
    await db.collection('point_records').add({
      data: {
        user_id: user._id,
        openid,
        type: 'spend',
        amount,
        source: source || 'other',
        description: description || '积分消耗',
        created_at: new Date().toISOString()
      }
    });

    return {
      success: true,
      data: {
        points_spent: amount,
        current_points: user.points - amount
      }
    };
  } catch (e) {
    console.error('[spendPoints] Error:', e);
    return { success: false, error: '积分消耗失败' };
  }
}

/**
 * 生成邀请码
 */
async function getInviteCode(event) {
  const { openid } = event;

  try {
    const user = await getOrCreateUserPoints(openid);

    return {
      success: true,
      data: {
        invite_code: user.invite_code
      }
    };
  } catch (e) {
    console.error('[getInviteCode] Error:', e);
    return { success: false, error: '获取邀请码失败' };
  }
}

/**
 * 使用邀请码（并发安全）
 */
async function useInviteCode(event) {
  const { openid, invite_code } = event;

  if (!invite_code) {
    return { success: false, error: '请输入邀请码' };
  }

  try {
    const invitee = await getOrCreateUserPoints(openid);

    // 检查是否已经使用过邀请码
    if (invitee.invited_by) {
      return { success: false, error: '您已经使用过邀请码' };
    }

    // 查找邀请人
    const inviterResult = await db.collection('user_points')
      .where({ invite_code: invite_code.toUpperCase() })
      .get();

    if (inviterResult.data.length === 0) {
      return { success: false, error: '邀请码无效' };
    }

    const inviter = inviterResult.data[0];

    // 不能邀请自己
    if (inviter.openid === openid) {
      return { success: false, error: '不能使用自己的邀请码' };
    }

    // 原子更新被邀请人（并发安全）
    // 使用 where 条件确保还没使用过邀请码
    const updateInviteeResult = await db.collection('user_points')
      .where({
        _id: invitee._id,
        invited_by: null // 确保还没使用过邀请码
      })
      .update({
        data: {
          invited_by: inviter._id,
          points: _.inc(30),
          total_earned: _.inc(30),
          updated_at: new Date().toISOString()
        }
      });

    // 如果更新了0条记录，说明已经使用过邀请码（并发情况）
    if (updateInviteeResult.stats.updated === 0) {
      return { success: false, error: '您已经使用过邀请码' };
    }

    // 原子更新邀请人
    await db.collection('user_points').doc(inviter._id).update({
      data: {
        invite_count: _.inc(1),
        points: _.inc(50),
        total_earned: _.inc(50),
        updated_at: new Date().toISOString()
      }
    });

    // 记录邀请
    await db.collection('invite_records').add({
      data: {
        inviter_id: inviter._id,
        invitee_id: invitee._id,
        inviter_openid: inviter.openid,
        invitee_openid: openid,
        invite_code: invite_code.toUpperCase(),
        inviter_points: 50,
        invitee_points: 30,
        created_at: new Date().toISOString()
      }
    });

    // 记录积分获取
    await db.collection('point_records').add({
      data: {
        user_id: invitee._id,
        openid,
        type: 'earn',
        amount: 30,
        source: 'invite',
        description: '使用邀请码奖励',
        related_user_id: inviter._id,
        created_at: new Date().toISOString()
      }
    });

    await db.collection('point_records').add({
      data: {
        user_id: inviter._id,
        openid: inviter.openid,
        type: 'earn',
        amount: 50,
        source: 'invite',
        description: '邀请好友奖励',
        related_user_id: invitee._id,
        created_at: new Date().toISOString()
      }
    });

    return {
      success: true,
      data: {
        points_earned: 30,
        message: '邀请码使用成功，获得30积分'
      }
    };
  } catch (e) {
    console.error('[useInviteCode] Error:', e);
    return { success: false, error: '邀请码使用失败' };
  }
}

/**
 * 获取积分记录
 */
async function getPointRecords(event) {
  const { openid, page = 1, limit = 20 } = event;

  try {
    const result = await db.collection('point_records')
      .where({ openid })
      .orderBy('created_at', 'desc')
      .skip((page - 1) * limit)
      .limit(limit)
      .get();

    return {
      success: true,
      data: {
        records: result.data,
        page,
        limit
      }
    };
  } catch (e) {
    console.error('[getPointRecords] Error:', e);
    return { success: false, error: '获取积分记录失败' };
  }
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const action = event.action || 'getPoints';

  console.log(`[pointsManager] action=${action}, openid=${openid}`);

  try {
    switch (action) {
      case 'getPoints':
        return await getPoints({ ...event, openid });
      case 'signin':
        return await signin({ ...event, openid });
      case 'earnPoints':
        return await earnPoints({ ...event, openid });
      case 'spendPoints':
        return await spendPoints({ ...event, openid });
      case 'generateInviteCode':
      case 'getInviteCode':
        return await getInviteCode({ ...event, openid });
      case 'useInviteCode':
        return await useInviteCode({ ...event, openid });
      case 'getPointRecords':
        return await getPointRecords({ ...event, openid });
      default:
        return { success: false, error: `未知操作: ${action}` };
    }
  } catch (e) {
    console.error('[pointsManager] Error:', e);
    return { success: false, error: e.message || '服务器错误' };
  }
};
