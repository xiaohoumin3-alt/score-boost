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
├── cloudfunctions/            # 云函数
│   ├── shared/                # 共享模块
│   │   ├── llm-core/          # LLM客户端 (DeepSeek)
│   │   ├── question_bank.js   # 题库管理
│   │   └── queue-manager.js   # 队列管理
│   ├── questionGenerator/    # 题目生成引擎
│   ├── startAssessment/       # 评估启动
│   ├── generateAiQuestion/    # AI题目生成
│   ├── practice_v2/           # 练习提交
│   └── studentMemory/         # 学生记忆系统
├── docs/                      # 文档
└── e2e/                       # E2E测试
```

## 核心云函数

| 云函数 | 功能 | 超时 | 内存 |
|--------|------|------|------|
| questionGenerator | 后台队列处理（定时触发） | 600s | 512MB |
| generateAiQuestion | AI单题生成 | 60s | 512MB |
| startAssessment | 启动评估（创建队列任务） | 60s | 256MB |
| practice_v2 | 练习结果处理 | 60s | 256MB |
| studentMemory | 学生记忆系统 | - | - |

## LLM 配置

### DeepSeek API (国内可用)
- **Base URL**: `https://api.deepseek.com`
- **Model**: `deepseek-chat`
- **LLM超时**: 45秒（云函数超时60秒）
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
- `questions` - 题目库
- `question_queue` - 题目生成队列
- `student_memory` - 学生记忆
- `knowledge_points` - 知识点
- `pregen_queue` - 预生成队列
- `generation_tasks` - 生成任务

## 关键命令

### 本地开发
```bash
# 安装依赖
npm install

# 运行测试
npm test
npm run test:coverage

# 云函数部署
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
startAssessment (创建队列任务)
    ↓
questionGenerator (定时触发，处理队列)
    ├─ InitStateStep (初始化状态)
    ├─ GenerateStep (生成题目，调用generateAiQuestion)
    ├─ SaveQuestionsStep (保存题目)
    ├─ CreateAssessmentStep (创建评估)
    └─ CompleteStep (完成队列任务)
    ↓
小程序轮询 checkQueueStatus
    ↓
返回 assessment_id
```

## 当前已知问题
- **定时触发器**: 需要通过微信开发者工具右键"上传并部署：云端安装依赖"才能生效

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
