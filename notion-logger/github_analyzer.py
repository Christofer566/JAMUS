"""
GitHub Repository Analyzer
GitHub API를 사용하여 커밋 정보를 분석하고 일별 개발 활동을 정리합니다.
"""

import os
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import requests
from dotenv import load_dotenv

# 환경 변수 로드
load_dotenv()

class GitHubAnalyzer:
    """GitHub 레포지토리 분석 클래스"""
    
    def __init__(self, owner: str, repo: str, token: Optional[str] = None):
        """
        Args:
            owner: GitHub 사용자명 또는 조직명
            repo: 레포지토리 이름
            token: GitHub Personal Access Token (없으면 환경변수에서 가져옴)
        """
        self.owner = owner
        self.repo = repo
        self.token = token or os.getenv('GITHUB_TOKEN')
        self.base_url = "https://api.github.com"
        
        if not self.token:
            raise ValueError("GitHub token이 필요합니다. 환경변수 GITHUB_TOKEN을 설정하거나 token 파라미터를 전달하세요.")
        
        self.headers = {
            "Authorization": f"token {self.token}",
            "Accept": "application/vnd.github.v3+json"
        }
    
    def get_commits(self, since: Optional[datetime] = None, until: Optional[datetime] = None) -> List[Dict]:
        """
        특정 기간의 커밋 목록을 가져옵니다.
        
        Args:
            since: 시작 날짜 (기본값: 어제)
            until: 종료 날짜 (기본값: 오늘)
            
        Returns:
            커밋 정보 리스트
        """
        # 기본값 설정
        if since is None:
            since = datetime.now() - timedelta(days=1)
        if until is None:
            until = datetime.now()
        
        # API 요청
        url = f"{self.base_url}/repos/{self.owner}/{self.repo}/commits"
        params = {
            "since": since.isoformat(),
            "until": until.isoformat()
        }
        
        response = requests.get(url, headers=self.headers, params=params)
        response.raise_for_status()
        
        commits = response.json()
        return commits
    
    def get_commit_details(self, sha: str) -> Dict:
        """
        특정 커밋의 상세 정보를 가져옵니다.
        
        Args:
            sha: 커밋 SHA
            
        Returns:
            커밋 상세 정보
        """
        url = f"{self.base_url}/repos/{self.owner}/{self.repo}/commits/{sha}"
        response = requests.get(url, headers=self.headers)
        response.raise_for_status()
        
        return response.json()
    
    def analyze_daily_activity(self, date: Optional[datetime] = None) -> Dict:
        """
        특정 날짜의 개발 활동을 분석합니다.
        
        Args:
            date: 분석할 날짜 (기본값: 오늘)
            
        Returns:
            일별 활동 요약
        """
        if date is None:
            date = datetime.now()
        
        # 해당 날짜의 시작과 끝
        start_of_day = date.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = date.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        # 커밋 가져오기
        commits = self.get_commits(since=start_of_day, until=end_of_day)
        
        if not commits:
            return {
                "date": date.strftime("%Y-%m-%d"),
                "commit_count": 0,
                "commits": [],
                "files_changed": 0,
                "additions": 0,
                "deletions": 0
            }
        
        # 상세 정보 수집
        total_additions = 0
        total_deletions = 0
        files_changed = set()
        commit_details = []
        
        for commit in commits:
            detail = self.get_commit_details(commit['sha'])
            
            commit_info = {
                "sha": commit['sha'][:7],  # 짧은 SHA
                "message": commit['commit']['message'],
                "author": commit['commit']['author']['name'],
                "date": commit['commit']['author']['date'],
                "url": commit['html_url']
            }
            
            # 통계 정보
            stats = detail.get('stats', {})
            commit_info['additions'] = stats.get('additions', 0)
            commit_info['deletions'] = stats.get('deletions', 0)
            commit_info['total_changes'] = stats.get('total', 0)
            
            total_additions += commit_info['additions']
            total_deletions += commit_info['deletions']
            
            # 변경된 파일 목록
            if 'files' in detail:
                commit_info['files'] = []
                for file in detail['files']:
                    files_changed.add(file['filename'])
                    commit_info['files'].append({
                        "filename": file['filename'],
                        "status": file['status'],  # added, modified, removed
                        "additions": file.get('additions', 0),
                        "deletions": file.get('deletions', 0)
                    })
            
            commit_details.append(commit_info)
        
        return {
            "date": date.strftime("%Y-%m-%d"),
            "commit_count": len(commits),
            "commits": commit_details,
            "files_changed": len(files_changed),
            "additions": total_additions,
            "deletions": total_deletions,
            "total_changes": total_additions + total_deletions
        }
    
    def format_for_notion(self, activity: Dict) -> str:
        """
        분석 결과를 Notion에 기록할 수 있는 마크다운 형식으로 변환합니다.
        
        Args:
            activity: analyze_daily_activity의 결과
            
        Returns:
            마크다운 형식의 문자열
        """
        if activity['commit_count'] == 0:
            return f"## {activity['date']} 개발 활동\n\n커밋 없음"
        
        md = f"## {activity['date']} 개발 활동\n\n"
        md += f"### 📊 요약\n"
        md += f"- 총 커밋: {activity['commit_count']}개\n"
        md += f"- 변경된 파일: {activity['files_changed']}개\n"
        md += f"- 추가된 줄: +{activity['additions']}\n"
        md += f"- 삭제된 줄: -{activity['deletions']}\n\n"
        
        md += f"### 📝 커밋 내역\n\n"
        for commit in activity['commits']:
            md += f"**{commit['sha']}** - {commit['message']}\n"
            md += f"- 작성자: {commit['author']}\n"
            md += f"- 변경: +{commit['additions']} -{commit['deletions']}\n"
            
            if commit.get('files'):
                md += f"- 변경된 파일:\n"
                for file in commit['files']:
                    status_emoji = {"added": "✨", "modified": "✏️", "removed": "🗑️"}.get(file['status'], "📄")
                    md += f"  - {status_emoji} {file['filename']}\n"
            
            md += f"- [커밋 보기]({commit['url']})\n\n"
        
        return md


def main():
    """테스트 실행"""
    # JAMUS 레포지토리 분석
    analyzer = GitHubAnalyzer(owner="sung-min-hwang", repo="JAMUS")
    
    # 오늘의 활동 분석
    print("오늘의 개발 활동 분석 중...\n")
    today_activity = analyzer.analyze_daily_activity()
    
    # 결과 출력
    print(analyzer.format_for_notion(today_activity))
    
    # 어제의 활동 분석
    yesterday = datetime.now() - timedelta(days=1)
    print("\n" + "="*50 + "\n")
    print("어제의 개발 활동 분석 중...\n")
    yesterday_activity = analyzer.analyze_daily_activity(date=yesterday)
    print(analyzer.format_for_notion(yesterday_activity))


if __name__ == "__main__":
    main()
