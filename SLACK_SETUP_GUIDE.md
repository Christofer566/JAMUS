# Phase 2: Slack 앱 설정 가이드

## 📋 Step 1: Slack 앱 권한 추가

1. **Slack API 페이지 접속**
   - https://api.slack.com/apps
   - 기존 JAMUS Bot 선택 (또는 새로 생성)

2. **OAuth & Permissions 메뉴**
   - 왼쪽 메뉴에서 "OAuth & Permissions" 클릭
   
3. **Bot Token Scopes 추가**
   다음 권한들을 추가하세요:
   - `reactions:read` - 이모지 반응 읽기
   - `channels:history` - 채널 메시지 읽기
   - `chat:write` - 메시지 전송
   
4. **Reinstall App**
   - 권한 추가 후 "Reinstall to Workspace" 버튼 클릭
   - 승인

5. **Bot Token 복사**
   - "Bot User OAuth Token" 복사 (xoxb-로 시작)
   - 이것이 `SLACK_BOT_TOKEN`입니다

---

## 📋 Step 2: Event Subscriptions 설정

1. **Event Subscriptions 메뉴**
   - 왼쪽 메뉴에서 "Event Subscriptions" 클릭
   - "Enable Events" ON으로 변경

2. **Request URL 설정**
   ```
   https://jamus.vercel.app/api/slack/events
   ```
   - 입력 후 "Verified ✓" 확인될 때까지 대기
   - ⚠️ 이 단계 전에 코드를 먼저 배포해야 합니다!

3. **Subscribe to bot events**
   - "Subscribe to bot events" 섹션에서
   - "Add Bot User Event" 클릭
   - `reaction_added` 이벤트 추가

4. **Save Changes**
   - 하단의 "Save Changes" 버튼 클릭

---

## 📋 Step 3: Signing Secret 복사

1. **Basic Information 메뉴**
   - 왼쪽 메뉴에서 "Basic Information" 클릭

2. **App Credentials 섹션**
   - "Signing Secret" 찾기
   - "Show" 버튼 클릭 후 복사
   - 이것이 `SLACK_SIGNING_SECRET`입니다

---

## 📋 Step 4: 환경 변수 설정

### Local (.env.local)
```bash
# 기존
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx...

# 추가
SLACK_BOT_TOKEN=xoxb-xxx...
SLACK_SIGNING_SECRET=xxx...
```

### Vercel Dashboard
1. https://vercel.com/dashboard
2. JAMUS 프로젝트 선택
3. Settings → Environment Variables
4. 다음 변수 추가:
   - `SLACK_BOT_TOKEN` = (복사한 Bot Token)
   - `SLACK_SIGNING_SECRET` = (복사한 Signing Secret)
5. Production, Preview, Development 모두 체크
6. Save

---

## 📋 Step 5: 채널에 봇 초대

1. Slack 채널 열기 (#jamus-dev 또는 알림 받을 채널)
2. `/invite @JAMUS Bot` 입력
3. 봇이 채널에 추가됨

---

## ✅ 완료 확인

모든 설정이 완료되면:
1. 코드 배포
2. 테스트 커밋 & 배포
3. Slack 알림 확인
4. 👍 이모지 클릭
5. "문서화를 시작합니다..." 메시지 확인

---

## 🐛 문제 해결

### "Verified" 표시가 안 나타남
- Vercel에 코드가 배포되었는지 확인
- `/api/slack/events` URL이 200을 반환하는지 확인
- SLACK_SIGNING_SECRET이 올바른지 확인

### 이모지 반응해도 아무 일도 안 일어남
- Slack 채널에 봇이 초대되었는지 확인
- Event Subscriptions에 `reaction_added` 추가했는지 확인
- Vercel Function 로그 확인 (Vercel Dashboard → Functions)

### "Unauthorized" 오류
- SLACK_SIGNING_SECRET이 Vercel에 설정되었는지 확인
- Bot Token이 올바른지 확인
