import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

// GET: 케이스 개수 조회
export async function GET() {
    try {
        const datasetsPath = path.join(process.cwd(), 'tests/pitch-accuracy/datasets');

        if (!fs.existsSync(datasetsPath)) {
            return NextResponse.json({
                caseCount: 0,
                cases: [],
                message: 'datasets 폴더가 없습니다'
            });
        }

        const entries = fs.readdirSync(datasetsPath, { withFileTypes: true });
        const cases = entries
            .filter(entry => entry.isDirectory() && entry.name.startsWith('case_'))
            .map(entry => {
                const casePath = path.join(datasetsPath, entry.name);
                const hasTestFrames = fs.existsSync(path.join(casePath, 'testFrames.json'));
                const hasGroundTruth = fs.existsSync(path.join(casePath, 'groundTruth.json'));
                return {
                    name: entry.name,
                    complete: hasTestFrames && hasGroundTruth,
                    hasTestFrames,
                    hasGroundTruth
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));

        const completeCases = cases.filter(c => c.complete).length;

        return NextResponse.json({
            caseCount: cases.length,
            completeCases,
            cases,
            message: `${completeCases}개의 완전한 케이스가 있습니다`
        });
    } catch (error) {
        console.error('케이스 조회 실패:', error);
        return NextResponse.json({
            caseCount: 0,
            cases: [],
            error: '케이스 조회 중 오류 발생'
        }, { status: 500 });
    }
}

// PUT: 케이스 저장 (testFrames + groundTruth)
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { testFrames, groundTruth } = body;

        if (!testFrames || !groundTruth) {
            return NextResponse.json({
                success: false,
                error: 'testFrames와 groundTruth가 필요합니다'
            }, { status: 400 });
        }

        const datasetsPath = path.join(process.cwd(), 'tests/pitch-accuracy/datasets');

        // datasets 폴더 없으면 생성
        if (!fs.existsSync(datasetsPath)) {
            fs.mkdirSync(datasetsPath, { recursive: true });
        }

        // 다음 케이스 번호 찾기
        const entries = fs.readdirSync(datasetsPath, { withFileTypes: true });
        const caseNumbers = entries
            .filter(entry => entry.isDirectory() && entry.name.startsWith('case_'))
            .map(entry => {
                const match = entry.name.match(/case_(\d+)/);
                return match ? parseInt(match[1], 10) : 0;
            });

        const nextNumber = caseNumbers.length > 0 ? Math.max(...caseNumbers) + 1 : 1;
        const caseName = `case_${String(nextNumber).padStart(2, '0')}`;
        const casePath = path.join(datasetsPath, caseName);

        // 케이스 폴더 생성
        fs.mkdirSync(casePath, { recursive: true });

        // 파일 저장
        fs.writeFileSync(
            path.join(casePath, 'testFrames.json'),
            JSON.stringify(testFrames, null, 2)
        );
        fs.writeFileSync(
            path.join(casePath, 'groundTruth.json'),
            JSON.stringify(groundTruth, null, 2)
        );

        console.log(`[Pitch Test] 케이스 저장: ${caseName}`);

        return NextResponse.json({
            success: true,
            caseName,
            path: casePath,
            message: `${caseName} 저장 완료`
        });
    } catch (error: any) {
        console.error('케이스 저장 실패:', error);
        return NextResponse.json({
            success: false,
            error: error.message || '케이스 저장 중 오류 발생'
        }, { status: 500 });
    }
}

// POST: 최적화 실행
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { mode = 'single' } = body; // 'single' or 'auto'

        const command = mode === 'auto'
            ? 'npm run test:pitch:batch:auto'
            : 'npm run test:pitch:batch';

        console.log(`[Pitch Test] 실행: ${command}`);

        // 타임아웃 5분 설정 (자동 최적화는 오래 걸릴 수 있음)
        const { stdout, stderr } = await execAsync(command, {
            cwd: process.cwd(),
            timeout: 300000, // 5분
            maxBuffer: 10 * 1024 * 1024 // 10MB
        });

        // 결과 파싱 (마지막 결과 추출)
        const lines = stdout.split('\n');
        const resultLines = lines.filter(line =>
            line.includes('정확도') ||
            line.includes('Accuracy') ||
            line.includes('Best') ||
            line.includes('최종')
        );

        return NextResponse.json({
            success: true,
            mode,
            output: stdout,
            summary: resultLines.join('\n'),
            stderr: stderr || undefined
        });
    } catch (error: any) {
        console.error('최적화 실행 실패:', error);

        // 타임아웃인 경우
        if (error.killed) {
            return NextResponse.json({
                success: false,
                error: '최적화 시간이 초과되었습니다 (5분)',
                suggestion: '터미널에서 직접 실행해주세요: npm run test:pitch:batch:auto'
            }, { status: 408 });
        }

        return NextResponse.json({
            success: false,
            error: error.message || '최적화 실행 중 오류 발생',
            stderr: error.stderr
        }, { status: 500 });
    }
}
