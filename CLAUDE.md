# 提分神器小程序

## 概述
微信小程序AI题目生成系统，为学生提供个性化题目生成、自适应难度调整、学习路径推荐等功能。基于微信云开发（CloudBase）和 DeepSeek LLM API。

## 技术栈
- **平台**: 微信小程序云开发
- **云环境**: `cloud1-7gg9y9tjb2b867b6` (ap-shanghai)
- **LLM API**: DeepSeek (deepseek-chat)
- **测试**: Jest
- **Node版本**: 云函数 Node.js 16.13/18.15

## 项目结构
```
score-boost-mini/
├── app.js / app.json          # 小程序入口
├── miniprogram/               # 小程序前端
│   ├── pages/                 # 页面组件
│   ├── utils/                 # 工具函数
│   └── __tests__/             # 前端测试
├── cloudfunctions/            # 云函数 (68个)
│   ├── shared/                # 共享模块
│   │   ├── llm-core/          # LLM客户端 (DeepSeek)
│   │   ├── question_bank.js   # 题库管理
│   │   └── queue-manager.js   # 队列管理
│   ├── questionGenerator/    # 题目生成引擎
│   ├── startAssessment/       # 评估启动
│   │   └── data/              # 知识点数据 (1-9年级全科)
│   ├── generateAiQuestion/    # AI题目生成
│   ├── practice_v2/           # 练习提交
│   └── studentMemory/         # 学生记忆系统
├── docs/                      # 文档
├── data/                      # 知识点数据副本
└── e2e/                       # E2E测试
```

## 核心云函数

| 云函数 | 功能 | 超时 | 内存 | 触发器 |
|--------|------|------|------|--------|
| questionGenerator | 后台队列处理 | 90s | 512MB | 定时(每分钟) |
| generateAiQuestion | AI单题生成 | 60s | 512MB | - |
| startAssessment | 启动评估 | 60s | 256MB | - |
| practice_v2 | 练习结果处理 | 60s | 256MB | - |
| studentMemory | 学生记忆系统 | - | - | - |
| getAssessment | 获取评估详情 | 60s | 256MB | - |
| submitAnswer | 提交答案 | 60s | 256MB | - |

## LLM 配置

### DeepSeek API
- **Base URL**: `https://api.deepseek.com`
- **Model**: `deepseek-chat`
- **LLM超时**: 45秒
- **重试**: 2次

### 环境变量
在 `cloudbaserc.json` 中配置：
```json
{
  "envVariables": {
    "LLM_API_KEY": "sk-...",
    "LLM_BASE_URL": "https://api.deepseek.com",
    "LLM_MODEL": "deepseek-chat",
    "LLM_TIMEOUT_MS": "45000",
    "LLM_MAX_RETRIES": "2",
    "LLM_RETRY_DELAY_MS": "1000"
  }
}
```

## 数据库集合
- `assessments` - 评估记录
- `ai_question_pool` - AI题目池
- `question_queue` - 题目生成队列
- `student_memory` - 学生记忆
- `knowledge_points` - 知识点
- `pregen_queue` - 预生成队列
- `generation_tasks` - 生成任务
- `user_feedback` - 用户反馈

## 知识点覆盖

### 支持科目
- 数学 (1-9年级)
- 语文 (1-9年级)
- 英语 (1-6年级)
- 物理 (8-9年级)
- 化学 (9年级)
- 生物 (7-9年级)
- 地理 (7-9年级)
- 历史 (7-9年级)
- 政治 (7-9年级)

### 知识点组织
知识点按年级和学期组织，存储在 `cloudfunctions/startAssessment/data/` 目录：
- `math-grade{1-9}-{up|down}.json` - 数学各年级上下学期
- `chinese-grade{1-9}-{up|down}.json` - 语文各年级上下学期
- 等等...

## 关键命令

### 本地开发
```bash
# 安装依赖
npm install

# 运行测试
npm test
npm run test:coverage

# 部署所有云函数
node deploy-cloud-functions.js
```

### 云函数单独部署
```bash
# 使用 CloudBase CLI
tcb fn deploy <functionName> --dir cloudfunctions/<functionName>

# 使用微信开发者工具CLI
/Applications/wechatwebdevtools.app/Contents/MacOS/cli \
  cloud functions deploy \
  --env cloud1-7gg9y9tjb2b867b6 \
  --paths cloudfunctions/<functionName>
```

### 定时触发器
```bash
# 查看触发器
tcb fn detail questionGenerator | grep -A 10 "触发器"

# 创建触发器（cron: 0 */1 * * * * * = 每分钟）
tcb fn trigger create questionGenerator \
  --cron "0 */1 * * * * *" \
  --trigger-name processQueueTimer
```

## AI题目生成流程
```
小程序前端 (选择年级/科目)
    ↓
startAssessment (创建队列任务，传递grade/subject)
    ↓
question_queue (存储任务参数)
    ↓
questionGenerator (定时触发，处理队列)
    ├─ 根据grade选择对应年级知识点
    ├─ GenerateStep (生成题目，调用generateAiQuestion)
    ├─ SaveQuestionsStep (保存题目到ai_question_pool)
    ├─ CreateAssessmentStep (创建评估记录)
    └─ CompleteStep (完成队列任务)
    ↓
小程序轮询 checkQueueStatus
    ↓
返回 assessment_id + 题目列表
```

## 最近修复 (2025-06)
**问题**: 2年级测评出现高难度题目（二次根式、勾股定理等8-9年级内容）

**根因**: `questionGenerator` 使用硬编码的8年级知识点，未根据grade参数动态选择

**修复**:
- 将知识点结构改为嵌套（按年级组织）
- `questionGenerator` 根据grade动态选择对应年级知识点
- `startAssessment` 传递grade参数到队列任务
- 添加1-9年级全科知识点数据

**验证**: 2年级测评现在显示正确的低年级知识点：
- 100以内加减法、乘法口诀、除法初步
- 长度单位、认识角

## 部署检查清单
- [ ] CloudBase CLI版本最新 (`tcb --version`)
- [ ] 已登录 (`tcb login`)
- [ ] 环境ID正确 (`cloud1-7gg9y9tjb2b867b6`)
- [ ] 云函数目录存在
- [ ] `cloudbaserc.json`配置正确（DeepSeek LLM 环境变量）
- [ ] 部署后验证函数详情 (`tcb fn detail`)
- [ ] 触发器已创建（如需定时任务）

## 相关文档
- [AI原生架构实施](docs/AI_NATIVE_IMPLEMENTATION.md)
- [数据库设置指南](docs/database-setup-guide.md)
- [部署指南](docs/deploy-guide.md)
