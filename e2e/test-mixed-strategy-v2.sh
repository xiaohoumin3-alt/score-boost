#!/bin/bash
# 验证混合策略：2题AI + n-2题题库（修复版）

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

# 提取assessment_id或queue_id
assessment_id=$(echo "$result" | grep -o '"assessment_id":"[^"]*"' | grep -o ':[^"]*' | sed 's/://' | head -1 || echo "")
queue_id=$(echo "$result" | grep -o '"queue_id":"[^"]*"' | grep -o ':[^"]*' | sed 's/://' | head -1 || echo "")

# 如果没有assessment_id，说明触发了队列
if [ -z "$assessment_id" ]; then
  queue_id=$(echo "$result" | grep -o 'queue_id[^,}]*' | sed 's/queue_id":"//' | sed 's/"//' | head -1 || echo "")
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

# 使用云函数查询题目来源（更可靠）
echo "=== 题目来源分析（通过云函数查询） ==="
echo ""

# 调用云函数获取题目详情
query_result=$(tcb fn invoke getAssessmentQuestions -e $ENV_ID -d '{"assessment_id":"'$assessment_id'"}' 2>/dev/null)

# 如果云函数不存在，使用数据库查询
if echo "$query_result" | grep -q "Function does not exist"; then
  echo "⚠️ getAssessmentQuestions云函数不存在，使用数据库查询"

  # 获取question_ids
  question_ids_result=$(tcb db nosql execute -c "[{\"TableName\":\"assessments\",\"CommandType\":\"QUERY\",\"Command\":\"{\\\"find\\\":\\\"assessments\\\",\\\"filter\\\":{\\\"_id\\\":\\\"$assessment_id\\\"},\\\"projection\\\":{\\\"question_ids\\\":1}}\"}]" -e $ENV_ID 2>/dev/null)

  echo "question_ids原始数据:"
  echo "$question_ids_result" | head -30
  echo ""

  # 统计题目数量
  total_questions=$(echo "$question_ids_result" | grep -o '"_id"' | wc -l | tr -d ' ')
  echo "question_ids数量: $total_questions"

  # 从云函数日志获取统计
  echo ""
  echo "=== 从云函数日志获取统计 ==="
  queue_id=$(echo "$result" | grep -o 'queue_id[^,}]*' | sed 's/queue_id":"//' | sed 's/"//' | head -1 || echo "")

  if [ -n "$queue_id" ]; then
    echo "查看队列 $queue_id 的处理日志..."
    # 从日志中提取 MIXED DONE 行
    logs=$(tcb fn log questionGenerator -e $ENV_ID --limit 100 2>/dev/null | grep -o "MIXED DONE.*$queue_id" || echo "")

    if [ -n "$logs" ]; then
      echo "找到的日志:"
      echo "$logs"
      echo ""

      # 统计所有MIXED DONE行
      total_pool=0
      total_ai=0

      while IFS= read -r line; do
        # 提取 pool: 和 ai: 数值
        pool=$(echo "$line" | grep -o 'pool:[0-9]*' | grep -o '[0-9]*' || echo "0")
        ai=$(echo "$line" | grep -o 'ai:[0-9]*' | grep -o '[0-9]*' || echo "0")

        total_pool=$((total_pool + pool))
        total_ai=$((total_ai + ai))
      done <<< "$logs"

      echo "统计结果（来自云函数日志）:"
      echo "  题库题目: $total_pool"
      echo "  AI生成题目: $total_ai"
      echo "  总题目数: $((total_pool + total_ai))"
      echo ""

      if [ $total_ai -ge 2 ]; then
        echo "✅ 混合策略正确：至少2题AI生成"
      else
        echo "❌ 混合策略失败：AI生成题目不足2题（实际：$total_ai）"
        exit 1
      fi
    else
      echo "⚠️ 未找到相关日志"
    fi
  fi
else
  echo "云函数查询结果:"
  echo "$query_result" | head -50
fi

echo ""
echo "=== 测试完成 ==="
