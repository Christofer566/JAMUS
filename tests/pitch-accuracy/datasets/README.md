# Pitch Accuracy Test Datasets

## 폴더 구조

```
datasets/
├── case_01/
│   ├── testFrames.json    # 녹음 데이터 (exportTestFrames)
│   └── groundTruth.json   # 정답지 (exportGroundTruth)
├── case_02/
│   ├── testFrames.json
│   └── groundTruth.json
└── ...
```

## 데이터 수집 방법

1. Feedback 화면에서 녹음
2. 편집 모드에서 음표 수정 (정답 만들기)
3. 개발자 콘솔에서:
   ```js
   exportTestFrames()   // testFrames.json 다운로드
   exportGroundTruth()  // groundTruth.json 다운로드
   ```
4. 새 case_XX 폴더 생성 후 두 파일 복사

## 배치 테스트 실행

```bash
# 모든 케이스 테스트 (단일 실행)
npm run test:pitch:batch

# 모든 케이스 대상 자동 최적화
npm run test:pitch:batch:auto
```

## 주의사항

- 각 케이스는 독립적인 녹음 세션을 나타냄
- BPM이 다른 곡들도 섞어서 테스트 가능
- 케이스가 많을수록 범용적인 파라미터를 찾을 수 있음
