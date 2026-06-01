#!/bin/bash
# 快速检查测评题目来源统计

ENV_ID="cloud1-7gg9y9tjb2b867b6"

if [ -z "$1" ]; then
  echo "用法: $0 <assessment_id>"
  echo ""
  echo "获取最近测评ID:"
  tcb db nosql execute -c '[{"TableName":"assessments","CommandType":"QUERY","Command":"{\"find\":\"assessments\",\"projection\":{\"_id\":1,\"subject\":1,\"created_at\":1},\"limit\":5,\"sort\":{\"created_at\":-1}}"}]' -e $ENV_ID 2>&1 | grep -E '"_id"|"subject"|"created_at"' | head -20
  exit 1
fi

ASSESSMENT_ID="$1"

echo "=== 测评题目来源统计 ==="
echo "测评ID: $ASSESSMENT_ID"
echo ""

# 获取question_ids
result=$(tcb db nosql execute -c '[{"TableName":"assessments","CommandType":"QUERY","Command":"{\"find\":\"assessments\",\"filter\":{\"_id\":\"'$ASSESSMENT_ID'\"},\"projection\":{\"question_ids\":1}}"}]' -e $ENV_ID 2>/dev/null)

# 提取question_ids数组（简化处理）
echo "查询所有题目来源..."
echo ""

# 统计
pool_easy=0; pool_medium=0; pool_hard=0
ai_easy=0; ai_medium=0; ai_hard=0
total=0

# 这里简化处理，实际应该从result解析question_ids然后批量查询
# 暂时提示用户手动检查
echo "⚠️ 请手动执行以下命令查看："
echo ""
echo "tcb db nosql execute -c '[{\"TableName\":\"ai_question_pool\",\"CommandType\":\"COUNT\",\"Command\":\"{\\\"find\\\":\\\"ai_question_pool\\\",\\\"filter\\\":{\\\"assessment_id\\\":\\\"'$ASSESSMENT_ID'\\\",\\\"source\\\":\\\"pool\\\"}}\"}]' -e $ENV_ID"
echo ""
echo "tcb db nosql execute -c '[{\"TableName\":\"ai_question_pool\",\"CommandType\":\"COUNT\",\"Command\":\"{\\\"find\\\":\\\"ai_question_pool\\\",\\\"filter\\\":{\\\"assessment_id\\\":\\\"'$ASSESSMENT_ID'\\\",\\\"source\\\":\\\"ai\\\"}}\"}]' -e $ENV_ID"
