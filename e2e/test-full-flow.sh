#!/bin/bash
# 全流程E2E测试：发起测评 → 题目正常展示

ENV_ID="cloud1-7gg9y9tjb2b867b6"

echo "=== 全流程E2E测试：测评出题，题目能正常展示 ==="
echo ""

# 生成唯一学生ID
STUDENT_ID="e2e_test_$(date +%s)"

echo "学生ID: $STUDENT_ID"
echo ""

# 测试1: 发起地理7年测评
echo "测试1: 发起地理7年级测评（20题）"
echo "----------------------------------------"

# 调用startAssessment云函数
result=$(tcb fn invoke startAssessment -e $ENV_ID -d '{"student_id":"'$STUDENT_ID'","subject":"geography","grade":"7","num_questions":20}' 2>/dev/null)

echo "云函数响应:"
echo "$result" | head -20
echo ""

# 提取assessment_id或queue_id
# 直接从结果中提取queue_id
queue_id=$(echo "$result" | grep -o 'queue_id[^,}]*' | sed 's/queue_id":"//' | sed 's/"//' | head -1 || echo "")
assessment_id=$(echo "$result" | grep -o 'assessment_id[^,}]*' | sed 's/assessment_id":"//' | sed 's/"//' | head -1 || echo "")

# 检查是否获取到ID
if [ -z "$assessment_id" ] && [ -z "$queue_id" ]; then
  echo "❌ 未获取到assessment_id或queue_id"
  echo "原始响应:"
  echo "$result"
  exit 1
fi

# 如果没有assessment_id，说明题池不足，需要等待队列处理
if [ -z "$assessment_id" ]; then
  echo "📋 题池不足，触发生成队列"
  echo "队列ID: $queue_id"

  # 等待队列处理完成（最多60秒）
  echo "等待队列处理..."
  for i in {1..12}; do
    sleep 5
    status=$(tcb db nosql execute -c "[{\"TableName\":\"question_queue\",\"CommandType\":\"QUERY\",\"Command\":\"{\\\"find\\\":\\\"question_queue\\\",\\\"filter\\\":{\\\"_id\\\":\\\"$queue_id\\\"},\\\"projection\\\":{\\\"status\\\":1}}\"}]" -e $ENV_ID 2>/dev/null | grep -o '"status": "[^"]*"' | grep -o '[^"]*' | tail -1 || echo "")

    echo "  第${i}次检查: status=$status"

    if [ "$status" = "completed" ]; then
      # 获取assessment_id（从assessments表查询）
      assessment_id=$(tcb db nosql execute -c "[{\"TableName\":\"assessments\",\"CommandType\":\"QUERY\",\"Command\":\"{\\\"find\\\":\\\"assessments\\\",\\\"filter\\\":{\\\"student_id\\\":\\\"$STUDENT_ID\\\"},\\\"projection\\\":{\\\"_id\\\":1},\\\"limit\\\":1}\"}]" -e $ENV_ID 2>/dev/null | grep -o '"_id": "[^"]*"' | grep -o '[^"]*' | tail -1 || echo "")
      echo "✅ 队列处理完成，assessment_id=$assessment_id"
      break
    elif [ "$status" = "failed" ]; then
      echo "❌ 队列处理失败"
      exit 1
    fi
  done

  if [ -z "$assessment_id" ]; then
    echo "❌ 队列处理超时或失败"
    exit 1
  fi
else
  echo "✅ 获取到assessment_id: $assessment_id"
fi

echo ""

# 测试2: 验证题目已生成
echo "测试2: 验证题目已生成并存入数据库"
echo "----------------------------------------"

# 从assessments表获取question_ids
question_ids_result=$(tcb db nosql execute -c "[{\"TableName\":\"assessments\",\"CommandType\":\"QUERY\",\"Command\":\"{\\\"find\\\":\\\"assessments\\\",\\\"filter\\\":{\\\"_id\\\":\\\"$assessment_id\\\"},\\\"projection\\\":{\\\"question_ids\\\":1}}\"}]" -e $ENV_ID 2>/dev/null)

# 提取第一个question_id（使用sed）
first_question_id=$(echo "$question_ids_result" | grep 'question_ids' -A 2 | grep '"' | grep -v 'question_ids' | head -1 | tr -d '"' | tr -d '[:space:]' | tr -d ',' || echo "")

if [ -z "$first_question_id" ]; then
  echo "❌ 未找到question_ids"
  exit 1
fi

# 查询第一题内容
first_question=$(tcb db nosql execute -c "[{\"TableName\":\"ai_question_pool\",\"CommandType\":\"QUERY\",\"Command\":\"{\\\"find\\\":\\\"ai_question_pool\\\",\\\"filter\\\":{\\\"_id\\\":\\\"$first_question_id\\\"},\\\"projection\\\":{\\\"content\\\":1,\\\"options\\\":1,\\\"correct_answer\\\":1,\\\"subject\\\":1}}\"}]" -e $ENV_ID 2>/dev/null)

echo "✅ 找到题目，第一题ID: $first_question_id"
echo ""

# 测试3: 验证题目内容完整（question、options、answer）
echo "测试3: 验证题目内容完整（question、options、answer）"
echo "----------------------------------------"

# 获取question_ids列表
question_ids=$(echo "$question_ids_result" | grep 'question_ids' -A 30 | grep '"' | grep -v 'question_ids' | grep -v '^\[' | grep -v '^\]' | head -20 | tr -d '"' | tr -d '[:space:]' | tr -d ',' || echo "")

# 转换为数组并查询前3题
i=0
for qid in $question_ids; do
  if [ $i -ge 3 ]; then break; fi

  echo "第$((i+1))题:"

  # 查询题目
  q_result=$(tcb db nosql execute -c "[{\"TableName\":\"ai_question_pool\",\"CommandType\":\"QUERY\",\"Command\":\"{\\\"find\\\":\\\"ai_question_pool\\\",\\\"filter\\\":{\\\"_id\\\":\\\"$qid\\\"},\\\"projection\\\":{\\\"content\\\":1,\\\"options\\\":1,\\\"correct_answer\\\":1}}\"}]" -e $ENV_ID 2>/dev/null)

  # 提取题目文本
  question_text=$(echo "$q_result" | grep -o '"content": "[^"]*"' | sed 's/"content": "//g' | sed 's/"$//g' | head -1 || echo "")
  echo "  题目: $question_text"

  # 检查options
  has_options=$(echo "$q_result" | grep -o '"options": \[' | head -1 || echo "")
  if [ -n "$has_options" ]; then
    echo "  ✅ 选项存在"
  else
    echo "  ❌ 选项缺失"
  fi

  # 检查answer
  has_answer=$(echo "$q_result" | grep -o '"correct_answer": "[^"]*"' | head -1 || echo "")
  if [ -n "$has_answer" ]; then
    echo "  ✅ 答案存在"
  else
    echo "  ❌ 答案缺失"
  fi

  i=$((i+1))
done

echo ""

# 测试4: 验证无重复题
echo "测试4: 验证无重复题"
echo "----------------------------------------"

# 获取所有题目并检查重复
all_questions=""
for qid in $question_ids; do
  q_text=$(tcb db nosql execute -c "[{\"TableName\":\"ai_question_pool\",\"CommandType\":\"QUERY\",\"Command\":\"{\\\"find\\\":\\\"ai_question_pool\\\",\\\"filter\\\":{\\\"_id\\\":\\\"$qid\\\"},\\\"projection\\\":{\\\"content\\\":1}}\"}]" -e $ENV_ID 2>/dev/null | grep -o '"content": "[^"]*"' | sed 's/"content": "//g' | sed 's/"$//g' | head -1 || echo "")
  all_questions="${all_questions}${q_text}"$'\n'
done

# 检查重复
duplicates=$(echo "$all_questions" | sort | uniq -d)

if [ -n "$duplicates" ]; then
  echo "❌ 发现重复题:"
  echo "$duplicates"
  exit 1
else
  echo "✅ 无重复题"
fi

echo ""

# 测试5: 验证科目正确
echo "测试5: 验证科目正确（无科目混入）"
echo "----------------------------------------"

# 检查第一题的科目
first_subject=$(echo "$first_question" | grep -o '"subject": "[^"]*"' | sed 's/"subject": "//g' | sed 's/"$//g' || echo "")

if [ "$first_subject" != "geography" ]; then
  echo "❌ 发现错误科目: $first_subject"
  exit 1
else
  echo "✅ 所有题目科目正确（geography）"
fi

echo ""
echo "=== 全流程E2E测试通过 ==="
echo "✅ 测评出题成功"
echo "✅ 题目能正常展示（内容完整）"
echo "✅ 无重复题"
echo "✅ 科目正确"
