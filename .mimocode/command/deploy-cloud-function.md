---
description: Deploy a cloud function to WeChat CloudBase, verify login first, then test with tcb fn invoke
---

# Deploy Cloud Function

Deploy a single cloud function to the WeChat CloudBase environment, with automatic login check and post-deploy verification.

## Usage

```
/deploy-cloud-function <function_name> [--test] [--test-params '<json>']
```

## Parameters

- `$1` - Cloud function name (e.g., `practice_v2`, `startAssessment`, `generateAiQuestion`)
- `--test` - (Optional) After deploy, invoke the function to verify
- `--test-params` - (Optional) JSON params for the test invocation

## Procedure

### Step 1: Check login status

```bash
"/Applications/wechatwebdevtools.app/Contents/MacOS/cli" islogin --project /Users/seanxx/score-boost-mini 2>&1
```

If not logged in, alert the user to open WeChat DevTools and log in first. Do not proceed.

### Step 2: Deploy

```bash
WECHAT_CLI="/Applications/wechatwebdevtools.app/Contents/MacOS/cli"
PROJECT_PATH="/Users/seanxx/score-boost-mini"
ENV_ID="cloud1-7gg9y9tjb2b867b6"
FUNC_NAME="$1"

"$WECHAT_CLI" cloud functions deploy \
  --project "$PROJECT_PATH" \
  --env "$ENV_ID" \
  --names "$FUNC_NAME" \
  --remote-npm-install 2>&1
```

If the function has shared modules in `cloudfunctions/shared/`, zip them together:

```bash
FUNC_DIR="/Users/seanxx/score-boost-mini/cloudfunctions/$FUNC_NAME"
cd "$FUNC_DIR"
rm -f /tmp/"$FUNC_NAME".zip
zip -r /tmp/"$FUNC_NAME".zip . \
  --exclude "node_modules/*" \
  --exclude "__tests__/*" \
  --exclude "coverage/*" \
  --exclude "*.test.js" \
  --exclude "jest.config.js"
```

### Step 3: Verify deploy (if --test)

```bash
tcb fn invoke "$FUNC_NAME" --env-id cloud1-7gg9y9tjb2b867b6 --params '$TEST_PARAMS' 2>&1
```

Default test params if none provided:
- `generateAiQuestion`: `{"kp_name":"因式分解","difficulty":"medium"}`
- `practice_v2`: `{"knowledge_point_id":"kp2_3","kp_name":"勾股定理的应用","num_questions":3,"grade":"8"}`
- `startAssessment`: `{"subject":"math","grade":"8","semester":"up","mode":"quick","num_questions":3}`

### Step 4: Report result

Report: function name, deploy status, test result (if tested).
