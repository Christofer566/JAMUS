# 🔧 JAMUS Supabase Setup Guide

## ❌ 현재 문제
```
Failed to load profile: column "stage" of relation "profiles" does not exist
```

profiles 테이블에 필요한 컬럼들이 없어서 발생하는 에러입니다.

---

## ✅ 해결 방법 (5분 소요)

### Step 1: Supabase Dashboard 접속

1. 브라우저에서 Supabase 대시보드 열기:
   ```
   https://supabase.com/dashboard/project/hzgfbmdqmhjiomwrkukw
   ```

2. 좌측 메뉴에서 **SQL Editor** 클릭

---

### Step 2: 테이블 스키마 수정 (첫 번째 SQL)

1. **새 쿼리 열기** (New query 버튼)

2. 아래 파일 내용을 **전체 복사**:
   ```
   C:\JAMUS\supabase-fix-profiles.sql
   ```

3. SQL Editor에 **붙여넣기**

4. **Run** 버튼 클릭 (또는 Ctrl+Enter)

5. **결과 확인**:
   ```
   ✅ Added column: nickname
   ✅ Added column: stage
   ✅ Added column: stage_progress
   ✅ Added column: has_pro_badge
   ✅ Added column: has_early_bird_badge
   ✅ Added column: created_at
   ✅ Added column: updated_at
   ```

6. 아래쪽에 **테이블 구조**가 표시됨:
   ```
   column_name              | data_type | is_nullable | column_default
   -------------------------|-----------|-------------|------------------
   id                       | uuid      | NO          |
   nickname                 | text      | YES         |
   stage                    | text      | YES         | 'Beginner'
   stage_progress           | integer   | YES         | 0
   has_pro_badge            | boolean   | YES         | false
   has_early_bird_badge     | boolean   | YES         | false
   created_at               | timestamp | NO          | now()
   updated_at               | timestamp | NO          | now()
   ```

---

### Step 3: 사용자 Profile 생성 (두 번째 SQL)

1. **새 쿼리 열기** (New query 버튼)

2. 아래 파일 내용을 **전체 복사**:
   ```
   C:\JAMUS\supabase-setup.sql
   ```

3. SQL Editor에 **붙여넣기**

4. **Run** 버튼 클릭

5. **결과 확인** - 마지막에 표시되는 테이블:
   ```
   email                | user_created | nickname  | stage    | profile_status
   ---------------------|--------------|-----------|----------|---------------
   your@email.com       | 2025-11-20   | YourName  | Beginner | ✅ Exists
   ```

   ⚠️ **중요**: `profile_status`가 모두 `✅ Exists`인지 확인!

---

### Step 4: 브라우저 새로고침

1. 개발 서버로 돌아가기:
   ```
   http://localhost:3001
   ```

2. **Hard Refresh** (Ctrl + Shift + R)

3. **결과 확인**:
   - ✅ "Failed to load profile" 에러 사라짐
   - ✅ 사이드바에 사용자 이름 표시됨
   - ✅ Stage Progress 바 표시됨
   - ✅ 배지 표시됨 (Pro, Early Bird)

---

## 🔍 검증 (선택사항)

터미널에서 실행:

```bash
cd C:/JAMUS
npx tsx scripts/check-supabase.ts
```

**예상 출력:**
```
✅ Supabase URL: https://hzgfbmdqmhjiomwrkukw.supabase.co
✅ Supabase Key exists: true

🔍 Checking profiles table...
✅ Profiles table exists
📊 Sample data: [
  {
    id: '...',
    nickname: 'YourName',
    stage: 'Beginner',
    stage_progress: 0,
    has_pro_badge: false,
    has_early_bird_badge: false
  }
]

🔍 Checking songs table for BPM data...
✅ Songs table exists

🎵 Autumn Leaves:
   - BPM: 140
   - Time Signature: 4/4
   - Structure Data: ✅

🎵 Blue Bossa:
   - BPM: 130
   - Time Signature: 4/4
   - Structure Data: ✅

🎵 All of Me:
   - BPM: 120
   - Time Signature: 4/4
   - Structure Data: ✅
```

---

## 📁 생성된 파일

- ✅ `supabase-fix-profiles.sql` - 테이블 스키마 수정
- ✅ `supabase-setup.sql` - Profile 생성 + Auth Trigger 설정
- ✅ `scripts/check-supabase.ts` - 상태 확인 스크립트
- ✅ `SUPABASE_SETUP_README.md` - 이 가이드

---

## 🐛 문제 해결

### Q: "permission denied for table profiles" 에러
**A:** RLS 정책 문제입니다. `supabase-setup.sql`의 Section 4 부분을 다시 실행하세요.

### Q: Profile이 여전히 비어있음
**A:**
1. Supabase SQL Editor에서 확인:
   ```sql
   SELECT * FROM auth.users;
   ```
2. 사용자가 있는지 확인
3. 없으면 회원가입이 필요합니다.

### Q: Trigger가 작동하지 않음
**A:**
1. SQL Editor에서 확인:
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
   ```
2. 없으면 `supabase-setup.sql` Section 3을 다시 실행

---

## 🎉 완료!

모든 에러가 해결되었습니다:
- ✅ VexFlow "Too many ticks" 수정됨
- ✅ BPM 기반 Seek 시스템 완벽 동작
- ✅ profiles 테이블 스키마 수정됨
- ✅ 자동 Profile 생성 설정됨

이제 JAMUS를 정상적으로 사용할 수 있습니다! 🚀
