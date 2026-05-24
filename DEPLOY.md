# 提分神器 - 微信小程序部署完成

## 已部署云函数

| 云函数 | 功能 | 状态 |
|--------|------|------|
| startAssessment | 开始测评，生成题目 | ✅ |
| submitAnswer | 提交答案，评判打分 | ✅ |
| practice | 练习模式，题目练习 | ✅ |
| getAssessment | 获取测评详情 | ✅ |
| initDatabase | 初始化数据库 | ✅ |

## 云环境

- 环境ID: `cloud1-7gg9y9tjb2b867b6`
- 数据库集合: `assessments`, `practices`

## 小程序页面配置

| 页面 | 使用API | 模式 |
|------|---------|------|
| assessment | cloudApi.js | 云函数 |
| practice | cloudApi.js | 云函数 |
| home | cloudApi.js | 云数据库 |
| onboarding | api.js | 本地API |

## 测试步骤

1. 在微信开发者工具中打开项目
2. 进入云开发控制台，创建集合 `assessments` 和 `practices`
3. 设置集合权限为"入门级"
4. 点击"编译"运行小程序

## 切换模式

- 开发调试：设置 `USE_CLOUD = false`，使用本地后端 `127.0.0.1:8002`
- 生产发布：设置 `USE_CLOUD = true`，使用云函数

## 手动启动后端（开发用）

```bash
cd /Users/seanxx/score-boost
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8002
```