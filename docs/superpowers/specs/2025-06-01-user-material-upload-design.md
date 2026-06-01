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
| 嵌入模型 | text-embedding-3-small (OpenAI) |
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

每个用户资料有独立的向量集合：
```
集合命名：user_material_{material_id}
存储结构：
{
  "chunk_id": "0",
  "text": "第一段文本...",
  "embedding": [0.1, 0.2, ...],
  "metadata": {
    "material_id": "xxx",
    "chunk_index": 0,
    "subject": "biology"
  }
}
```

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
1. 验证配额
2. 上传到COS
3. 解析文档（PDF/DOCX/TXT）
4. 智能分块
5. 向量化存储
6. LLM提取知识点
7. AI验证类型匹配
8. 分流存储

### 4.2 adminReviewMaterial

管理员审核教材资料，通过后更新公共知识点库。

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

| 云函数 | 超时 | 内存 |
|--------|------|------|
| uploadMaterial | 120s | 1GB |
| adminReviewMaterial | 30s | 256MB |
| startExclusiveExam | 60s | 512MB |

### 7.2 环境变量

```json
{
  "TENCENT_SECRET_ID": "xxx",
  "TENCENT_SECRET_KEY": "xxx",
  "VECTOR_REGION": "ap-shanghai",
  "EMBEDDING_API_KEY": "xxx",
  "EMBEDDING_MODEL": "text-embedding-3-small"
}
```

---

## 8. 测试策略

- **单元测试**：解析、分块、向量化、知识点提取
- **集成测试**：完整上传→审核→生成流程
- **E2E测试**：真实用户场景验证

---

## 9. 错误处理

- 文档解析失败 → 返回明确错误信息
- 向量库失败 → 降级到纯文本存储
- 配额不足 → 友好提示
- 类型不匹配 → AI警告但允许用户确认

---

## 10. 后续优化

- 支持图片OCR
- 支持更多文档格式
- 智能推荐相关资料
- 知识点图谱可视化
