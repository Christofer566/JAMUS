import { Octokit } from '@octokit/rest';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

const OWNER = process.env.GITHUB_OWNER || 'Christofer566';
const REPO = process.env.GITHUB_REPO || 'JAMUS';

/**
 * Task 번호에 해당하는 모든 커밋 분석
 * @param {number} taskNumber - Task 번호
 * @returns {Promise<Object>} 커밋 분석 결과
 */
export async function analyzeGitHubCommits(taskNumber) {
  console.log(`\n=== Task ${taskNumber} GitHub 커밋 분석 시작 ===`);
  console.log(`[Step 1/6] GitHub API 초기화 완료`);
  console.log(`  - Owner: ${OWNER}`);
  console.log(`  - Repo: ${REPO}`);

  try {
    // 최근 100개 커밋 조회 (충분히 많은 양)
    console.log(`[Step 2/6] 최근 커밋 조회 중...`);
    const startTime = Date.now();

    const { data: commits } = await octokit.repos.listCommits({
      owner: OWNER,
      repo: REPO,
      per_page: 100
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Step 2/6] ✓ 총 ${commits.length}개 커밋 조회 완료 (${elapsed}초)`);

    // Task 번호가 포함된 커밋만 필터링
    console.log(`[Step 3/6] Task ${taskNumber} 커밋 필터링 중...`);
    const taskPattern = new RegExp(`Task ${taskNumber}(\\.\\d+)*:`, 'i');
    const taskCommits = commits.filter(commit =>
      taskPattern.test(commit.commit.message)
    );

    console.log(`[Step 3/6] ✓ Task ${taskNumber} 관련 커밋: ${taskCommits.length}개`);

    if (taskCommits.length === 0) {
      console.error(`[ERROR] Task ${taskNumber}에 대한 커밋을 찾을 수 없습니다`);
      throw new Error(`Task ${taskNumber}에 대한 커밋을 찾을 수 없습니다`);
    }

    // 각 커밋의 상세 정보 조회
    console.log(`[Step 4/6] ${taskCommits.length}개 커밋의 상세 정보 조회 중...`);
    const detailStartTime = Date.now();

    const detailedCommits = await Promise.all(
      taskCommits.map(async (commit, index) => {
        try {
          console.log(`  - [${index + 1}/${taskCommits.length}] ${commit.sha.substring(0, 7)} 조회 중...`);

          const { data: detail } = await octokit.repos.getCommit({
            owner: OWNER,
            repo: REPO,
            ref: commit.sha
          });

          console.log(`  - [${index + 1}/${taskCommits.length}] ✓ ${commit.sha.substring(0, 7)} 완료`);

          return {
            sha: commit.sha.substring(0, 7),
            message: commit.commit.message,
            author: commit.commit.author.name,
            date: new Date(commit.commit.author.date),
            stats: detail.stats,
            files: detail.files.map(f => ({
              filename: f.filename,
              status: f.status,
              additions: f.additions,
              deletions: f.deletions
            }))
          };
        } catch (error) {
          console.error(`  - [${index + 1}/${taskCommits.length}] ✗ ${commit.sha.substring(0, 7)} 실패:`, error.message);
          throw new Error(`커밋 ${commit.sha.substring(0, 7)} 상세 정보 조회 실패: ${error.message}`);
        }
      })
    );

    const detailElapsed = ((Date.now() - detailStartTime) / 1000).toFixed(2);
    console.log(`[Step 4/6] ✓ 상세 정보 조회 완료 (${detailElapsed}초)`);

    // 커밋을 시간순으로 정렬 (오래된 것부터)
    console.log(`[Step 5/6] 커밋 분류 및 통계 계산 중...`);
    detailedCommits.sort((a, b) => a.date - b.date);

    // 구현 커밋 vs 버그 수정 커밋 분류
    const bugPatterns = [
      /Fix -/i,
      /Debug -/i,
      /Bugfix -/i,
      /수정:/i,
      /버그:/i
    ];

    const implementationCommits = [];
    const bugFixCommits = [];

    detailedCommits.forEach(commit => {
      const isBugFix = bugPatterns.some(pattern =>
        pattern.test(commit.message)
      );

      if (isBugFix) {
        bugFixCommits.push(commit);
      } else {
        implementationCommits.push(commit);
      }
    });

    console.log(`  - 구현 커밋: ${implementationCommits.length}개`);
    console.log(`  - 버그 수정: ${bugFixCommits.length}개`);

    // 커밋 간 시간 간격 계산 (분 단위)
    const commitGaps = [];
    for (let i = 1; i < detailedCommits.length; i++) {
      const gap = (detailedCommits[i].date - detailedCommits[i - 1].date) / (1000 * 60);
      commitGaps.push({
        gap: Math.round(gap),
        isLongGap: gap >= 5 // 5분 이상 간격 = 사람의 리뷰/수정 시간
      });
    }

    // 통계 집계
    const totalStats = detailedCommits.reduce(
      (acc, commit) => ({
        additions: acc.additions + (commit.stats?.additions || 0),
        deletions: acc.deletions + (commit.stats?.deletions || 0),
        filesChanged: acc.filesChanged + (commit.files?.length || 0)
      }),
      { additions: 0, deletions: 0, filesChanged: 0 }
    );

    console.log(`[Step 5/6] ✓ 통계 계산 완료`);
    console.log(`  - 파일 변경: ${totalStats.filesChanged}개`);
    console.log(`  - 추가: ${totalStats.additions}줄 / 삭제: ${totalStats.deletions}줄`);

    console.log(`[Step 6/6] 분석 결과 반환 중...`);
    const result = {
      commits: detailedCommits,
      implementationCommits,
      bugFixCommits,
      totalCommits: detailedCommits.length,
      firstCommitTime: detailedCommits[0].date,
      lastCommitTime: detailedCommits[detailedCommits.length - 1].date,
      commitGaps,
      ...totalStats
    };

    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Step 6/6] ✓ GitHub 커밋 분석 완료! (총 ${totalElapsed}초)`);
    console.log(`\n=== 분석 요약 ===`);
    console.log(`  총 커밋: ${detailedCommits.length}개`);
    console.log(`  구현: ${implementationCommits.length}개 / 버그수정: ${bugFixCommits.length}개`);
    console.log(`  파일 변경: ${totalStats.filesChanged}개`);
    console.log(`  코드 변경: +${totalStats.additions} -${totalStats.deletions}`);

    return result;

  } catch (error) {
    console.error('\n❌ === GitHub API 오류 발생 ===');
    console.error(`  오류 타입: ${error.name}`);
    console.error(`  오류 메시지: ${error.message}`);
    if (error.status) {
      console.error(`  HTTP Status: ${error.status}`);
    }
    if (error.response) {
      console.error(`  API 응답:`, JSON.stringify(error.response.data, null, 2));
    }
    console.error(`  Stack Trace:`, error.stack);
    throw new Error(`커밋 분석 실패: ${error.message}`);
  }
}
