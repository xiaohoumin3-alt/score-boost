#!/bin/bash
# 重复题问题验证测试（使用tcb CLI）

ENV_ID="cloud1-7gg9y9tjb2b867b6"

echo "=== 重复题问题验证测试 ==="
echo ""

# 测试1: geography题池无重复
echo "测试1: geography题池无重复"
echo "----------------------------------------"

result=$(tcb db nosql execute -c '[{"TableName":"ai_question_pool","CommandType":"QUERY","Command":"{\"find\":\"ai_question_pool\",\"filter\":{\"subject\":\"geography\",\"question\":{\"$exists\":true}},\"projection\":{\"question\":1},\"limit\":200}"}]' -e $ENV_ID 2>/dev/null)

# 提取所有题目并统计重复
questions=$(echo "$result" | grep -o '"question": "[^"]*"' | sed 's/"question": "//g' | sed 's/"$//g' | sort)

if [ -z "$questions" ]; then
  echo "⚠️ geography题池为空或题目无question字段"
else
  # 统计重复
  duplicates=$(echo "$questions" | uniq -d)
  total=$(echo "$questions" | wc -l | tr -d ' ')
  unique=$(echo "$questions" | uniq | wc -l | tr -d ' ')

  echo "总题数: $total, 唯一: $unique"

  if [ -n "$duplicates" ]; then
    echo "❌ 发现重复题:"
    echo "$duplicates" | while read -r q; do
      count=$(echo "$questions" | grep -F "$q" | wc -l | tr -d ' ')
      echo "  - \"$q\" (出现${count}次)"
    done
  else
    echo "✅ geography题池验证通过：${unique}题，无重复"
  fi
fi

echo ""

# 测试2: biology题池中math关键词检查
echo "测试2: biology题池无math关键词混入"
echo "----------------------------------------"

math_keywords=("方程" "不等式" "函数" "几何" "代数" "分数" "小数" "计算")
wrong_count=0

for keyword in "${math_keywords[@]}"; do
  result=$(tcb db nosql execute -c "[{\"TableName\":\"ai_question_pool\",\"CommandType\":\"COUNT\",\"Command\":\"{\\\"find\\\":\\\"ai_question_pool\\\",\\\"filter\\\":{\\\"subject\\\":\\\"biology\\\",\\\"question\\\":{\\\"\\\\$regex\\\":\\\"$keyword\\\"}}}\"}]" -e $ENV_ID 2>/dev/null)

  count=$(echo "$result" | grep -o '"total": [0-9]*' | grep -o '[0-9]*' | head -1 || echo "0")

  if [ -n "$count" ] && [ "$count" -gt 0 ]; then
    echo "❌ 发现关键词\"$keyword\": ${count}题"
    wrong_count=$((wrong_count + count))
  fi
done

if [ $wrong_count -eq 0 ]; then
  echo "✅ biology题池验证通过：无math关键词混入"
else
  echo "❌ biology题池发现${wrong_count}题math关键词"
fi

echo ""

# 测试3: geography关键词混入biology检查
echo "测试3: biology题池无geography关键词混入"
echo "----------------------------------------"

geo_keywords=("中国的人口" "经纬度" "气候" "地形" "省份" "地理位置" "半球")
wrong_count=0

for keyword in "${geo_keywords[@]}"; do
  result=$(tcb db nosql execute -c "[{\"TableName\":\"ai_question_pool\",\"CommandType\":\"COUNT\",\"Command\":\"{\\\"find\\\":\\\"ai_question_pool\\\",\\\"filter\\\":{\\\"subject\\\":\\\"biology\\\",\\\"question\\\":{\\\"\\\\$regex\\\":\\\"$keyword\\\"}}}\"}]" -e $ENV_ID 2>/dev/null)

  count=$(echo "$result" | grep -o '"total": [0-9]*' | grep -o '[0-9]*' | head -1 || echo "0")

  if [ -n "$count" ] && [ "$count" -gt 0 ]; then
    echo "❌ 发现关键词\"$keyword\": ${count}题"
    wrong_count=$((wrong_count + count))
  fi
done

if [ $wrong_count -eq 0 ]; then
  echo "✅ biology题池验证通过：无geography关键词混入"
else
  echo "❌ biology题池发现${wrong_count}题geography关键词"
fi

echo ""

# 测试4: 各科目题池总数
echo "测试4: 各科目题池总数"
echo "----------------------------------------"

for subject in math biology geography chemistry physics history; do
  result=$(tcb db nosql execute -c "[{\"TableName\":\"ai_question_pool\",\"CommandType\":\"QUERY\",\"Command\":\"{\\\"find\\\":\\\"ai_question_pool\\\",\\\"filter\\\":{\\\"subject\\\":\\\"$subject\\\"},\\\"projection\\\":{\\\"_id\\\":1},\\\"limit\\\":1000}\"}]" -e $ENV_ID 2>/dev/null)

  # 统计_id出现的次数
  count=$(echo "$result" | grep -c '"_id"' || echo "0")
  echo "  $subject: ${count}"
done

echo ""
echo "=== 测试完成 ==="
