# 用户上传学习资料生成知识点和题目 - 功能设计文档

**创建日期**：2025-06-01
**状态**：待用户审核
**方案**：方案B - 完整RAG架构

---

## 1. 功能概述

让任何人上传学习资料（PDF/DOCX/TXT），系统自动提取知识点并生成题目：
- **教材/知识点资料** → 管理员审核 → 更新公共知识库（所有人可用）
- **零碎个人资料** → 个人学习库 → 专属测评/练习（仅本人使用）

### 核心价值
- 扩展题库覆盖范围
- 支持个性化学习
- 降低内容维护成本

---

## 2. 架构设计

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────┐
│                    小程序端                             │
│  - 上传PDF/DOCX/TXT                                      │
│  - 选择类型（教材资料 / 个人资料）                        │
│  - 发起专属测评/练习                                      │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              uploadMaterial 云函数                        │
│  - 文件上传到云存储（COS）                                │
│  - 文档解析（PDF/DOCX/TXT → 文本）                        │
│  - 智能分块（按章节/段落语义分块）                         │
│  - 向量化并存储到向量库                                   │
│  - LLM提取知识点                                          │
│  - 类型验证（AI验证用户选择是否正确）                      │
│  - 分流存储                                               │
└─────────────────────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│   教材资料路径            │  │   个人资料路径            │
│ - 存入 material_review   │  │ - 存入 user_materials    │
│ - 通知管理员             │  │ - 用户可直接使用          │
└──────────────────────────┘  └──────────────────────────┘
              │                         │
              ▼                         ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│   adminReviewMaterial    │  │   startExclusiveExam     │
│   管理员审核云函数         │  │   发起专属测评/练习       │
└──────────────────────────┘  └──────────────────────────┘
              │                         │
              ▼                         ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│   updateKnowledgePoints  │  │   questionGenerator      │
│   更新公共知识点          │  │   生成专属题目            │
└──────────────────────────┘  └──────────────────────────┘
```

### 2.2 技术栈

| 层级 | 技术选型 |
|------|---------|
| 文档解析 | pdf-parse, mammoth (DOCX) |
| 文本分块 | @langchain/textsplitters |
| 向量库 | 腾讯云Vector |
| 嵌入模型 | 文心一言（ERNIE-Embedding-v1）/ 降级：通义千问 |
| LLM | DeepSeek (deepseek-chat) |
| 云存储 | 腾讯云COS |

---

## 3. 数据库设计

### 3.1 user_materials（用户学习资料表）

```json
{
  "_id": "auto",
  "openid": "用户openid",
  "material_type": "personal",
  "file_name": "我的生物笔记.pdf",
  "file_type": "pdf",
  "file_url": "云存储URL",
  "file_size": 1024000,
  "subject": "biology",
  "grade": "八年级上",
  "parsed_text": "提取的纯文本（截断）",
  "chunks_count": 15,
  "knowledge_points": [
    {
      "title": "光合作用",
      "description": "植物利用光能合成有机物的过程",
      "chunk_indices": [0, 1, 2]
    }
  ],
  "vector_collection": "user_material_xxx",
  "created_at": "ISO时间戳",
  "updated_at": "ISO时间戳",
  "usage_count": 0
}
```

### 3.2 material_review（教材资料审核表）

```json
{
  "_id": "auto",
  "material_id": "关联material",
  "openid": "上传者openid",
  "file_name": "人教版八年级生物上册.pdf",
  "subject": "biology",
  "grade": "八年级上",
  "extracted_kp_count": 25,
  "knowledge_points": [...],
  "status": "pending",
  "reviewer_id": "管理员openid",
  "review_notes": "审核意见",
  "ai_type_match": true,
  "created_at": "ISO时间戳",
  "reviewed_at": "ISO时间戳"
}
```

### 3.3 user_exams（专属测评记录表）

```json
{
  "_id": "auto",
  "openid": "用户openid",
  "exam_type": "exclusive",
  "material_ids": ["id1", "id2"],
  "num_questions": 20,
  "subject": "biology",
  "difficulty": "mixed",
  "status": "in_progress",
  "question_ids": ["q1", "q2", ...],
  "score": null,
  "created_at": "ISO时间戳",
  "completed_at": "ISO时间戳"
}
```

### 3.4 向量库设计

**统一向量集合设计**（修复：简化架构，降低运维成本）

```
集合命名：user_materials_vectors（统一集合）
存储结构：
{
  "chunk_id": "material_xxx_chunk_0",
  "text": "第一段文本...",
  "embedding": [0.1, 0.2, ...],
  "metadata": {
    "material_id": "xxx",
    "chunk_index": 0,
    "subject": "biology",
    "openid": "user_openid",
    "material_type": "personal"  // personal / textbook
  }
}
```

**查询策略**：通过 `metadata.material_id` 和 `metadata.openid` 过滤实现逻辑隔离。

---

## 4. 核心云函数

### 4.1 uploadMaterial

**输入**：
```javascript
{
  "file": "Base64编码文件或云存储URL",
  "file_name": "生物笔记.pdf",
  "material_type": "personal",
  "subject": "biology",
  "grade": "八年级上"
}
```

**流程**：
1. **配额验证**（严格模式）：在流程开始时验证配额，配额不足直接拒绝
2. 上传到COS
3. 解析文档（PDF/DOCX/TXT）
4. 智能分块
5. 向量化存储到统一集合 `user_materials_vectors`
6. LLM提取知识点（带重试机制，最多3次）
7. AI验证类型匹配（可配置关闭）
8. 分流存储

**错误处理与降级**：
- 文档解析失败 → 返回明确错误信息
- 向量库失败 → 降级到纯文本存储，后续使用全文搜索fallback
- 知识点提取失败 → 重试3次，仍失败则降级到按固定字符分块作为知识点
- 配额不足 → 友好提示升级VIP
- 类型不匹配 → AI警告但允许用户确认

### 4.2 adminReviewMaterial

管理员审核教材资料，通过后更新公共知识点库。

**审核流程**：
1. 查询待审核资料列表（material_review, status=pending）
2. 查看资料内容和AI提取的知识点
3. 编辑/补充/删除知识点
4. 批准或拒绝
5. 批准后调用 `updateKnowledgePoints`（带事务保证）

**事务性保证**：
- updateKnowledgePoints 使用数据库事务
- 更新失败时回滚 material_review 状态
- 幂等性设计：重复审核同一资料不重复创建知识点

### 4.3 startExclusiveExam

发起基于用户资料的专属测评/练习。

---

## 5. 配额规则

| 用户类型 | 个人资料/月 | 教材资料/月 | 单文件大小 |
|---------|------------|-------------|-----------|
| 普通用户 | 5个 | 2个 | 10MB |
| VIP用户 | 20个 | 10个 | 20MB |

---

## 6. 专属测评流程

1. 用户发起专属测评
2. 系统验证配额
3. RAG检索相关chunks
4. 调用questionGenerator生成题目
5. 创建user_exams记录
6. 用户答题（复用现有UI）
7. 提交答案（测评计分，练习显示解析）

---

## 7. 部署配置

### 7.1 云函数配置

| 云函数 | 超时 | 内存 | 说明 |
|--------|------|------|------|
| uploadMaterial | 180s | 1GB | 文档解析+向量化+LLM调用，延长超时确保稳定性 |
| adminReviewMaterial | 30s | 256MB | 仅审核操作，无需复杂计算 |
| startExclusiveExam | 90s | 512MB | RAG检索+题目生成，延长超时应对网络波动 |

### 7.2 环境变量

```json
{
  "TENCENT_SECRET_ID": "xxx",
  "TENCENT_SECRET_KEY": "xxx",
  "TENCENT_COS_BUCKET": "xxx",
  "TENCENT_COS_REGION": "ap-shanghai",
  "VECTOR_REGION": "ap-shanghai",
  "VECTOR_COLLECTION_NAME": "user_materials_vectors",
  "EMBEDDING_API_KEY": "xxx",
  "EMBEDDING_MODEL": "ERNIE-Embedding-v1",
  "EMBEDDING_PROVIDER": "wenxin",  // wenxin / qianwen
  "EMBEDDING_FALLBACK_PROVIDER": "qianwen",
  "LLM_API_KEY": "xxx",
  "LLM_BASE_URL": "https://api.deepseek.com",
  "LLM_MODEL": "deepseek-chat"
}
```

**嵌入API降级策略**：
- 主提供商：文心一言（ERNIE-Embedding-v1）
- 降级提供商：通义千问（当文心API失败时自动切换）

---

## 8. 测试策略

- **单元测试**：解析、分块、向量化、知识点提取
- **集成测试**：完整上传→审核→生成流程
- **E2E测试**：真实用户场景验证

---

## 9. 错误处理

- 文档解析失败 → 返回明确错误信息
- 向量库失败 → 降级到纯文本存储，后续使用全文搜索fallback
- 配额不足 → 友好提示
- 类型不匹配 → AI警告但允许用户确认
- 知识点提取失败 → 重试3次，仍失败则降级到按固定字符分块作为知识点

---

## 10. 管理员审核界面

### 9.1 审核列表页面

**路由**：`pages/admin/material-review`

**功能**：
- 展示待审核资料列表（material_review, status=pending）
- 每条记录显示：文件名、学科、年级、上传者、上传时间、提取知识点数量
- 支持按学科/年级/状态筛选

### 9.2 审核详情页面

**路由**：`pages/admin/material-review-detail?id={material_id}`

**功能**：
- 展示资料原文（parsed_text截断预览）
- 展示AI提取的知识点列表（可编辑/删除）
- 添加新知识点
- 批准/拒绝按钮
- 拒绝时必填审核意见

### 9.3 知识点编辑

**知识点字段**：
- title：知识点名称
- description：知识点描述
- chunk_indices：关联文本块索引

### 9.4 审核操作

**批准**：
1. 调用 `adminReviewMaterial` 云函数
2. 更新 material_review 状态为 approved
3. 调用 `updateKnowledgePoints` 更新公共知识点库
4. 成功后跳转回列表页

**拒绝**：
1. 调用 `adminReviewMaterial` 云函数
2. 更新 material_review 状态为 rejected
3. 记录审核意见
4. 通知上传者（可选）

---

## 11. 题目生成复用设计

### 11.1 复用现有 questionGenerator

专属测评/练习的题目生成**复用现有 `questionGenerator` 云函数**，确保代码一致性：

**流程**：
1. `startExclusiveExam` 创建专属测评记录
2. RAG检索相关chunks（从 user_materials_vectors）
3. 将检索结果作为 `context` 传给 `questionGenerator`
4. `questionGenerator` 调用 `generateAiQuestion` 生成题目
5. 题目保存到 `questions` 集合
6. 专属测评记录关联题目ID

### 11.2 与现有系统的集成

| 现有模块 | 复用方式 | 变更 |
|---------|---------|------|
| questionGenerator | 复用 | 支持user_materials_vectors作为context源 |
| generateAiQuestion | 复用 | 无需变更 |
| questions集合 | 复用 | 添加source字段标记来源（pool/ai/user_material） |
| assessments集合 | 复用 | 新增exam_type字段（normal/exclusive） |

### 11.3 RAG检索逻辑

```javascript
// 伪代码
async function searchUserMaterial(openid, material_ids, query) {
  // 从统一集合检索，通过metadata过滤
  const results = await vectorDB.search({
    collection: 'user_materials_vectors',
    vector: queryEmbedding,
    filter: {
      openid: openid,
      material_id: { $in: material_ids }
    },
    topK: 5
  });
  return results;
}
```

---

## 12. 后续优化
