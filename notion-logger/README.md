# JAMUS Notion Logger

JAMUS 프로젝트의 GitHub 커밋을 자동으로 분석하여 Notion에 기록하는 도구입니다.

## 🚀 설치 방법

1. 필요한 패키지 설치:
```bash
pip install -r requirements.txt
```

2. 환경 변수 설정:
   - `.env.example`을 복사하여 `.env` 파일을 만듭니다
   - GitHub Personal Access Token을 입력합니다

```bash
cp .env.example .env
# 그 다음 .env 파일을 편집하여 토큰을 입력하세요
```

## 🔧 사용 방법

### GitHub 커밋 분석 테스트

```bash
python github_analyzer.py
```

오늘과 어제의 커밋 활동을 분석하여 출력합니다.

## 📝 설정 파일

### .env 파일 형식

```
GITHUB_TOKEN=ghp_your_actual_token_here
```

⚠️ **주의**: `.env` 파일은 절대 GitHub에 올리면 안 됩니다! `.gitignore`에 포함되어 있습니다.

## 🔑 GitHub Token 발급

1. GitHub Settings > Developer settings > Personal access tokens > Fine-grained tokens
2. "Generate new token" 클릭
3. 설정:
   - Token name: JAMUS Notion Logger
   - Repository access: Only select repositories → JAMUS 선택
   - Permissions:
     - Contents: Read and write
     - Metadata: Read-only
4. 생성된 토큰을 `.env` 파일에 입력

## 📂 프로젝트 구조

```
notion-logger/
├── github_analyzer.py    # GitHub 커밋 분석 메인 코드
├── requirements.txt      # Python 패키지 목록
├── .env.example         # 환경 변수 템플릿
├── .gitignore          # Git 제외 파일 목록
└── README.md           # 이 파일
```

## 🔄 다음 단계

- [ ] Notion API 연동
- [ ] 자동 일지 작성 기능
- [ ] 스케줄러 추가 (매일 자동 실행)
