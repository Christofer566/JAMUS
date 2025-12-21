/**
 * 공유 AudioContext 싱글톤
 *
 * 앱 전체에서 하나의 AudioContext만 사용하여:
 * - 모든 오디오 소스가 동일한 currentTime 기준 사용
 * - 녹음 트리밍 계산의 정확도 향상
 * - 리소스 효율성 개선
 */

// Safari 호환 AudioContext 타입
declare global {
    interface Window {
        webkitAudioContext: typeof AudioContext;
    }
}

// 싱글톤 인스턴스
let sharedAudioContext: AudioContext | null = null;
let sharedGainNode: GainNode | null = null;

/**
 * AudioContext 싱글톤 획득
 * 처음 호출 시 생성, 이후 동일 인스턴스 반환
 */
export function getSharedAudioContext(): AudioContext {
    if (!sharedAudioContext) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        sharedAudioContext = new AudioContextClass();

        // 마스터 GainNode 생성
        sharedGainNode = sharedAudioContext.createGain();
        sharedGainNode.connect(sharedAudioContext.destination);

        console.log('[SharedAudioContext] 생성됨, sampleRate:', sharedAudioContext.sampleRate);
    }
    return sharedAudioContext;
}

/**
 * 마스터 GainNode 획득 (볼륨 조절용)
 */
export function getSharedGainNode(): GainNode {
    getSharedAudioContext(); // AudioContext 먼저 생성
    return sharedGainNode!;
}

/**
 * AudioContext 상태 resume (사용자 인터랙션 후 필요)
 * 브라우저 정책상 사용자 제스처 없이는 오디오 재생 불가
 */
export async function resumeAudioContext(): Promise<void> {
    const ctx = getSharedAudioContext();
    if (ctx.state === 'suspended') {
        console.log('[SharedAudioContext] resuming...');
        await ctx.resume();
        console.log('[SharedAudioContext] resumed, state:', ctx.state);
    }
}

/**
 * AudioContext 상태 확인
 */
export function getAudioContextState(): AudioContextState {
    if (!sharedAudioContext) return 'suspended';
    return sharedAudioContext.state;
}

/**
 * 현재 AudioContext 시간 획득
 * 모든 오디오 타이밍의 기준
 */
export function getAudioContextCurrentTime(): number {
    if (!sharedAudioContext) return 0;
    return sharedAudioContext.currentTime;
}

/**
 * AudioContext 닫기 (앱 종료 시)
 * 일반적으로 호출할 필요 없음 - 브라우저가 자동 정리
 */
export async function closeAudioContext(): Promise<void> {
    if (sharedAudioContext) {
        console.log('[SharedAudioContext] closing...');
        await sharedAudioContext.close();
        sharedAudioContext = null;
        sharedGainNode = null;
    }
}

/**
 * AudioContext 상태 변경 리스너 등록
 */
export function onAudioContextStateChange(callback: (state: AudioContextState) => void): () => void {
    const ctx = getSharedAudioContext();
    const handler = () => callback(ctx.state);
    ctx.addEventListener('statechange', handler);
    return () => ctx.removeEventListener('statechange', handler);
}
