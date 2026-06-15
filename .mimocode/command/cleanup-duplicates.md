---
description: Query and remove duplicate questions from the ai_question_pool collection in WeChat CloudBase
---

# Cleanup Duplicates

Find and remove duplicate questions from the `ai_question_pool` collection.

## Usage

```
/cleanup-duplicates [--subject <subject>] [--dry-run]
```

## Parameters

- `--subject` - (Optional) Filter by subject: `biology`, `geography`, `math`, `chinese`, `english`
- `--dry-run` - (Optional) Only show duplicates, don't delete

## Procedure

### Step 1: Query duplicates

```bash
ENV_ID="cloud1-7gg9y9tjb2b867b6"

# Count total questions
tcb db nosql execute --env-id "$ENV_ID" --command '[{"TableName":"ai_question_pool","CommandType":"COMMAND","Command":"{\"count\":\"ai_question_pool\"}"}]' 2>&1

# Find duplicates by question text
tcb db nosql execute --env-id "$ENV_ID" --command '[{"TableName":"ai_question_pool","CommandType":"QUERY","Command":"{\"find\":\"ai_question_pool\",\"query\":{},\"projection\":{\"question\":1,\"subject\":1,\"_id\":1}}"}]' 2>&1
```

### Step 2: Delete duplicates

For each duplicate found, delete all but the most recent:

```bash
# Delete a specific duplicate question
tcb db nosql execute --env-id "$ENV_ID" --command '[{"TableName":"ai_question_pool","CommandType":"DELETE","Command":"{\"delete\":\"ai_question_pool\",\"deletes\":[{\"q\":{\"_id\":\"<question_id>\"}}]}"}]' 2>&1
```

### Step 3: Verify cleanup

Re-run count to confirm reduction.

### Step 4: Report

Report: number of duplicates found, number deleted, remaining count per subject.
