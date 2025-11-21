/**
 * 버그 패턴 분석 및 Debugging History 생성
 * @param {number} bugFixCount - 버그 수정 커밋 수
 * @param {Object[]} allCommits - 모든 커밋 (시간순 정렬)
 * @returns {Promise<Object>} 버그 분석 결과
 */
export async function analyzeBugs(bugFixCount, allCommits) {
  console.log('\n=== 버그 분석 시작 ===');
  console.log('버그 수정 커밋:', bugFixCount, '개');

  if (bugFixCount === 0) {
    console.log('✅ 버그 없음 - 완벽한 구현!');
    return {
      bugs: [],
      totalFixAttempts: 0,
      averageFixTime: '0분'
    };
  }

  // 버그 패턴 추출
  const bugPatterns = [
    /Fix - (.+)/i,
    /Debug - (.+)/i,
    /Bugfix - (.+)/i,
    /수정: (.+)/i,
    /버그: (.+)/i
  ];

  const bugs = [];
  let currentBug = null;

  allCommits.forEach((commit, index) => {
    // 버그 수정 커밋인지 확인
    let bugDescription = null;
    for (const pattern of bugPatterns) {
      const match = commit.message.match(pattern);
      if (match) {
        bugDescription = match[1];
        break;
      }
    }

    if (bugDescription) {
      if (currentBug && currentBug.description === bugDescription) {
        // 동일한 버그에 대한 추가 수정 시도
        currentBug.fixAttempts.push({
          sha: commit.sha,
          message: commit.message,
          date: commit.date,
          files: commit.files
        });
      } else {
        // 새로운 버그 발견
        if (currentBug) {
          bugs.push(currentBug);
        }

        currentBug = {
          description: bugDescription,
          firstDetectedAt: commit.date,
          fixAttempts: [{
            sha: commit.sha,
            message: commit.message,
            date: commit.date,
            files: commit.files
          }],
          // 다음 정상 커밋까지의 시간 = 버그 해결 시간
          resolvedAt: null
        };
      }
    } else if (currentBug && !currentBug.resolvedAt) {
      // 버그 수정 후 정상 커밋 발견 = 해결됨
      currentBug.resolvedAt = commit.date;
    }
  });

  // 마지막 버그 추가
  if (currentBug) {
    if (!currentBug.resolvedAt) {
      // 마지막 커밋까지 해결되지 않았다면 마지막 커밋 시간을 해결 시간으로
      currentBug.resolvedAt = allCommits[allCommits.length - 1].date;
    }
    bugs.push(currentBug);
  }

  // 각 버그의 해결 시간 계산
  bugs.forEach(bug => {
    const fixTimeMinutes = Math.round(
      (bug.resolvedAt - bug.firstDetectedAt) / (1000 * 60)
    );
    bug.fixTimeMinutes = fixTimeMinutes;
    bug.fixTime = formatDuration(fixTimeMinutes);
  });

  // 통계 계산
  const totalFixAttempts = bugs.reduce(
    (sum, bug) => sum + bug.fixAttempts.length,
    0
  );

  const averageFixTimeMinutes = bugs.length > 0
    ? Math.round(
        bugs.reduce((sum, bug) => sum + bug.fixTimeMinutes, 0) / bugs.length
      )
    : 0;

  console.log('\n버그 분석 결과:');
  console.log('- 발견된 버그:', bugs.length, '개');
  console.log('- 총 수정 시도:', totalFixAttempts, '회');
  console.log('- 평균 수정 시간:', formatDuration(averageFixTimeMinutes));

  return {
    bugs,
    totalFixAttempts,
    averageFixTime: formatDuration(averageFixTimeMinutes)
  };
}

/**
 * 분을 "X시간 Y분" 형식으로 변환
 */
function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) {
    return `${mins}분`;
  } else if (mins === 0) {
    return `${hours}시간`;
  } else {
    return `${hours}시간 ${mins}분`;
  }
}
