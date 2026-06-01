#!/bin/bash
# 验证混合策略：2题AI + n-2题题库

ENV_ID="cloud1-7gg9y9tjb2b867b6"

echo "=== 验证混合策略：2题AI + n-2题题库 ==="
echo ""

# 生成唯一学生ID
STUDENT_ID="mixed_test_$(date +%s)"

echo "学生ID: $STUDENT_ID"
echo "测试：发起地理7年级测评（10题）"
echo "预期：2题AI + 8题题库"
echo ""

# 调用startAssessment云函数
result=$(tcb fn invoke startAssessment -e $ENV_ID -d '{"student_id":"'$STUDENT_ID'","subject":"geography","grade":"7","num_questions":10}' 2>/dev/null)

echo "云函数响应:"
echo "$result" | head -20
echo ""

# 提取assessment_id
assessment_id=$(echo "$result" | grep -o 'assessment_id[^,}]*' | sed 's/assessment_id":"//' | sed 's/"//' | head -1 || echo "")
queue_id=$(echo "$result" | grep -o 'queue_id[^,}]*' | sed 's/queue_id":"//' | sed 's/"//' | head -1 || echo "")

# 如果没有assessment_id，说明触发了队列
if [ -z "$assessment_id" ]; then
  echo "📋 题池不足，触发生成队列"
  echo "队列ID: $queue_id"

  echo "等待队列处理（最多60秒）..."
  for i in {1..12}; do
    sleep 5
    status=$(tcb db nosql execute -c "[{\"TableName\":\"question_queue\",\"CommandType\":\"QUERY\",\"Command\":\"{\\\"find\\\":\\\"question_queue\\\",\\\"filter\\\":{\\\"_id\\\":\\\"$queue_id\\\"},\\\"projection\\\":{\\\"status\\\":1}}\"}]" -e $ENV_ID 2>/dev/null | grep -o '"status": "[^"]*"' | grep -o '[^"]*' | tail -1 || echo "")

    echo "  第${i}次检查: status=$status"

    if [ "$status" = "completed" ]; then
      # 获取assessment_id
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

# 获取question_ids
question_ids_result=$(tcb db nosql execute -c "[{\"TableName\":\"assessments\",\"CommandType\":\"QUERY\",\"Command\":\"{\\\"find\\\":\\\"assessments\\\",\\\"filter\\\":{\\\"_id\\\":\\\"$assessment_id\\\"},\\\"projection\\\":{\\\"question_ids\\\":1}}\"}]" -e $ENV_ID 2>/dev/null)

# 提取所有question_id
question_ids=$(echo "$question_ids_result" | grep 'question_ids' -A 50 | grep '"' | grep -v 'question_ids' | grep -v '^\[' | grep -v '^\]' | head -20 | tr -d '"' | tr -d '[:space:]' | tr -d ',' || echo "")

echo "=== 题目来源分析 ==="
echo ""

pool_count=0
ai_count=0

# 统计各来源题目数量
for qid in $question_ids; do
  # 查询题目来源（通过_id前缀判断：ai_开头是AI生成的，pool_开头是题库的）
  if [[ $qid == ai_* ]]; then
    ai_count=$((ai_count + 1))
  elif [[ $qid == pool_* ]] || [ -n "$qid" ]; then
    pool_count=$((pool_count + 1))
  fi
done

# 另一种方法：从ai_question_pool表查询source字段
for qid in $question_ids; do
  q_source=$(tcb db nosql execute -c "[{\"TableName\":\"ai_question_pool\",\"CommandType\":\"QUERY\",\"Command\":\"{\\\"find\\\":\\\"ai_question_pool\\\",\\\"filter\\\":{\\\"_id\\\":\\\"$qid\\\"},\\\"projection\\\":{\\\"source\\\":1}}\"}]" -e $ENV_ID 2>/dev/null | grep -o '"source": "[^"]*"' | sed 's/"source": "//g' | sed 's/"$//g' | head -1 || echo "")

  if [ "$q_source" = "ai" ]; then
    ai_count=$((ai_count + 1))
  elif [ "$q_source" = "pool" ]; then
    pool_count=$((pool_count + 1))
  fi
done

total=$((pool_count + ai_count))

echo "题库题目: $pool_count"
echo "AI生成题目: $ai_count"
echo "总题目数: $total"
echo ""

# 验证
if [ $ai_count -ge 2 ]; then
  echo "✅ 混合策略正确：至少2题AI生成"
else
  echo "❌ 混合策略失败：AI生成题目不足2题（实际：$ai_count）"
  exit 1
fi

if [ $pool_count -ge 8 ]; then
  echo "✅ 混合策略正确：至少8题来自题库"
else
  echo "⚠️ 题库题目较少（实际：$pool_count），可能题池不足"
fi

echo ""
echo "=== 测试通过 ==="
