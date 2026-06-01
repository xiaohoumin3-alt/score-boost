/**
 * 知识点注入 - 硬编码数据，调试版本
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const collection = db.collection('knowledge_points');

  const data = [
    { kp_id: 'kp1_1', kp_name: '二次根式的概念', chapter: '第十六章 二次根式', knowledge_context: '二次根式定义：形如√a（a≥0）的式子。核心：双重非负性a≥0且√a≥0。常见考点：判断二次根式、求定义域。题型：选择题、填空题。', related_concepts: ['算术平方根', '平方根'], typical_mistakes: ['忘记被开方数必须非负', '混淆√a²与|a|'] },
    { kp_id: 'kp1_2', kp_name: '二次根式的性质', chapter: '第十六章 二次根式', knowledge_context: '性质：(√a)²=a；√a²=|a|；√(ab)=√a·√b。化简：√12=2√3；√18=3√2。注意：√a²=|a|≠a。', related_concepts: ['绝对值', '因式分解'], typical_mistakes: ['√a²=a错误', '乘除忘记条件'] },
    { kp_id: 'kp1_3', kp_name: '二次根式的运算', chapter: '第十六章 二次根式', knowledge_context: '运算：加法同类项合并√3+2√3=3√3；乘法√a·√b=√(ab)；除法√a÷√b=√(a/b)；分母有理化1/√3=√3/3。', related_concepts: ['分母有理化', '乘法公式'], typical_mistakes: ['不同类二次根式相加', '分母有理化符号错误'] },
    { kp_id: 'kp2_1', kp_name: '勾股定理', chapter: '第十七章 勾股定理', knowledge_context: '勾股定理：直角三角形a²+b²=c²。勾股数：3、4、5；5、12、13；6、8、10。', related_concepts: ['直角三角形', '平方根'], typical_mistakes: ['混淆直角边和斜边', '忘记平方'] },
    { kp_id: 'kp2_2', kp_name: '勾股定理的逆定理', chapter: '第十七章 勾股定理', knowledge_context: '逆定理：三边a²+b²=c²则直角三角形。步骤：1.找最大边；2.验证a²+b²=c²。', related_concepts: ['三角形三边关系'], typical_mistakes: ['不判断最大边就套公式'] },
    { kp_id: 'kp2_3', kp_name: '勾股定理的应用', chapter: '第十七章 勾股定理', knowledge_context: '应用：梯子问题h=√(L²-d²)；方向问题距离=√(x²+y²)；最短路径；判定矩形。解题：画图→识别直角三角形→代入公式→计算检验。', related_concepts: ['最短距离', '展开图'], typical_mistakes: ['画错直角位置', '计算忘记开方'] },
    { kp_id: 'kp3_1', kp_name: '平行四边形的性质', chapter: '第十八章 平行四边形', knowledge_context: '性质：对边平行且相等；对角相等；对角线互相平分；面积=底×高。', related_concepts: ['对角线', '高'], typical_mistakes: ['把对角线当成角平分线'] },
    { kp_id: 'kp3_2', kp_name: '平行四边形的判定', chapter: '第十八章 平行四边形', knowledge_context: '判定：1.两组对边分别平行；2.两组对边分别相等；3.一组对边平行且相等；4.对角线互相平分。', related_concepts: ['全等三角形', '中点'], typical_mistakes: ['只证一组对边平行就判定'] },
    { kp_id: 'kp3_3', kp_name: '特殊的平行四边形', chapter: '第十八章 平行四边形', knowledge_context: '矩形：四角直角、对角线相等。菱形：四边等、对角线垂直。正方形：四边等+四角直角+对角线等垂直。', related_concepts: ['矩形判定', '菱形判定'], typical_mistakes: ['混淆判定条件'] },
    { kp_id: 'kp4_1', kp_name: '函数的认识', chapter: '第十九章 一次函数', knowledge_context: '函数：变化过程中每一个x对应唯一y。表示：解析法、列表法、图像法。定义域：分式分母不为0、二次根式被开方数≥0。', related_concepts: ['变量', '自变量'], typical_mistakes: ['混淆自变量和函数值'] },
    { kp_id: 'kp4_2', kp_name: '一次函数的图像', chapter: '第十九章 一次函数', knowledge_context: '一次函数y=kx+b，图像是直线。k决定增减性；b是y轴截距。与坐标轴交点：y轴(0,b)，x轴(-b/k,0)。', related_concepts: ['斜率', '截距'], typical_mistakes: ['混淆k和b的作用'] },
    { kp_id: 'kp4_3', kp_name: '一次函数的应用', chapter: '第十九章 一次函数', knowledge_context: '应用：行程问题、销售问题、通信问题。待定系数法：设y=kx+b，用两个点建立方程组求解。', related_concepts: ['待定系数法', '方程组'], typical_mistakes: ['单位搞混', '搞错数量关系'] },
    { kp_id: 'kp5_1', kp_name: '数据的集中趋势', chapter: '第二十章 数据的分析', knowledge_context: '平均数=总和÷个数；中位数是中间那个（或中间两数平均）；众数是出现次数最多的。选择：受极端值影响选中位数；需要全部数据选平均数；关注最常见选众数。', related_concepts: ['平均数', '中位数', '众数'], typical_mistakes: ['计算中位数忘记排序'] },
    { kp_id: 'kp5_2', kp_name: '数据的波动程度', chapter: '第二十章 数据的分析', knowledge_context: '极差=最大值-最小值。方差=Σ(数据-平均数)²÷个数。标准差=√方差。方差越大波动越大。', related_concepts: ['极差', '方差', '标准差'], typical_mistakes: ['计算方差忘记平方', '混淆方差和标准差'] }
  ];

  let successCount = 0;
  for (const kpData of data) {
    try {
      const exist = await collection.where({ kp_id: kpData.kp_id }).get();
      if (exist.data && exist.data.length > 0) {
        await collection.doc(exist.data[0]._id).update({
          data: {
            knowledge_context: kpData.knowledge_context,
            related_concepts: kpData.related_concepts,
            typical_mistakes: kpData.typical_mistakes,
            chapter: kpData.chapter,
            kp_name: kpData.kp_name,
            updated_at: new Date().toISOString()
          }
        });
      } else {
        await collection.add({
          data: {
            ...kpData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        });
      }
      successCount++;
    } catch (e) {
      console.error('Error for ' + kpData.kp_id + ':', e.message);
    }
  }

  return { success: true, count: successCount, total: data.length };
};