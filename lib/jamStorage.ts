import { createClient } from './supabase';

// ============================================
// Types
// ============================================
// Task 8: 음표 데이터 타입 (Feed에서 Tone.js 재생용)
export interface JamNoteData {
    pitch: string;
    beat: number;
    duration: string;
    measureIndex: number;
    slotIndex: number;
}

export interface JamRecord {
    id?: string;
    song_id: string;
    user_id: string;
    name: string; // Task 10: JAM 이름
    audio_url: string;
    start_measure: number;
    end_measure: number;
    start_time: number;
    end_time: number;
    // Task 7: 메타데이터 추가
    bpm?: number;
    duration?: number;  // 녹음 길이 (초)
    input_instrument?: string;
    output_instrument?: string;
    // Task 8: 공유 기능
    is_public?: boolean;
    shared_at?: string;
    created_at?: string;
    // Task 8: 음표 데이터 (Feed에서 Tone.js 재생용)
    note_data?: JamNoteData[];
}

export interface UploadJamParams {
    songId: string;
    name: string; // Task 10: JAM 이름
    audioBlob: Blob;
    startMeasure: number;
    endMeasure: number;
    startTime: number;
    endTime: number;
    // Task 7: 메타데이터
    bpm?: number;
    duration?: number;
    inputInstrument?: string;
    outputInstrument?: string;
    // Task 8: 음표 데이터 (Feed에서 Tone.js 재생용)
    noteData?: JamNoteData[];
    // 진행률 콜백
    onProgress?: (progress: number) => void;
}

export interface UploadJamResult {
    success: boolean;
    data?: JamRecord;
    error?: string;
}

// ============================================
// Upload JAM Recording
// ============================================
export async function uploadJamRecording(params: UploadJamParams): Promise<UploadJamResult> {
    const {
        songId, name, audioBlob, startMeasure, endMeasure, startTime, endTime,
        bpm, duration, inputInstrument, outputInstrument, noteData, onProgress
    } = params;

    try {
        const supabase = createClient();
        onProgress?.(5); // 시작

        // 1. 현재 유저 확인
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            return { success: false, error: '로그인이 필요합니다' };
        }
        onProgress?.(10); // 인증 완료

        // 1.5. songId가 UUID가 아니면 Supabase에서 실제 UUID 조회
        let resolvedSongId = songId;
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(songId);
        if (!isUUID) {
            console.log('🎵 [jamStorage] 문자열 songId 감지, UUID 조회:', songId);
            const { data: songData, error: songError } = await supabase
                .from('songs')
                .select('id')
                .or(`title.ilike.%${songId}%,id.eq.${songId}`)
                .limit(1)
                .single();

            if (songError || !songData) {
                console.warn('🎵 [jamStorage] 곡 UUID 조회 실패, 원본 ID 사용:', songId);
            } else {
                resolvedSongId = songData.id;
                console.log('🎵 [jamStorage] UUID 변환 완료:', songId, '→', resolvedSongId);
            }
        }

        // 2. Storage에 오디오 파일 업로드
        const fileName = `${user.id}/${songId}/${Date.now()}.wav`;
        onProgress?.(20); // 업로드 시작
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('jams')
            .upload(fileName, audioBlob, {
                contentType: 'audio/wav',
                upsert: false
            });

        if (uploadError) {
            console.error('Storage upload error:', uploadError);
            // Bucket not found 에러 처리
            if (uploadError.message?.includes('Bucket not found')) {
                return { success: false, error: 'Storage 버킷이 없습니다. Supabase에서 "jams" 버킷을 생성해주세요.' };
            }
            return { success: false, error: '오디오 파일 업로드에 실패했습니다' };
        }
        onProgress?.(60); // 업로드 완료

        // 3. Public URL 획득
        const { data: urlData } = supabase.storage
            .from('jams')
            .getPublicUrl(uploadData.path);

        if (!urlData?.publicUrl) {
            return { success: false, error: 'Public URL을 가져올 수 없습니다' };
        }
        onProgress?.(70); // URL 획득 완료

        // 4. Database에 레코드 저장
        // 데이터 검증 및 정수 변환
        const jamRecord: Omit<JamRecord, 'id' | 'created_at'> = {
            song_id: resolvedSongId,  // UUID로 변환된 songId 사용
            user_id: user.id,
            name: name, // Task 10: JAM 이름
            audio_url: urlData.publicUrl,
            start_measure: Math.floor(startMeasure), // INTEGER로 변환
            end_measure: Math.floor(endMeasure),     // INTEGER로 변환
            start_time: startTime,
            end_time: endTime,
            // Task 7: 메타데이터
            bpm: bpm ?? undefined,
            duration: duration ?? (endTime - startTime),
            input_instrument: inputInstrument ?? 'voice',
            output_instrument: outputInstrument ?? 'piano',
            // Task 8: 음표 데이터 (Feed에서 Tone.js 재생용)
            note_data: noteData ?? undefined
        };

        // 디버깅: INSERT할 데이터 출력
        console.log('🎵 [jamStorage] INSERT 데이터:', JSON.stringify(jamRecord, null, 2));
        onProgress?.(80); // DB 저장 시작

        const { data: insertData, error: insertError } = await supabase
            .from('jams')
            .insert(jamRecord)
            .select()
            .single();

        if (insertError) {
            // 상세한 에러 로깅
            console.error('Database insert error:', JSON.stringify(insertError, null, 2));
            console.error('Database insert error details:', {
                code: insertError.code,
                message: insertError.message,
                details: insertError.details,
                hint: insertError.hint
            });
            // Storage 업로드는 성공했지만 DB 저장 실패 - 정리
            await supabase.storage.from('jams').remove([uploadData.path]);
            return { success: false, error: `녹음 정보 저장에 실패했습니다: ${insertError.message || insertError.code || 'Unknown error'}` };
        }

        console.log('🎵 JAM 저장 성공:', insertData);
        onProgress?.(100); // 완료
        return { success: true, data: insertData };

    } catch (error) {
        console.error('uploadJamRecording error:', error);
        return { success: false, error: '저장 중 오류가 발생했습니다' };
    }
}

// ============================================
// Get User's JAMs for a Song
// ============================================
export async function getUserJams(songId: string): Promise<JamRecord[]> {
    try {
        const supabase = createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from('jams')
            .select('*')
            .eq('song_id', songId)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('getUserJams error:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('getUserJams error:', error);
        return [];
    }
}

// ============================================
// Delete JAM Recording
// ============================================
export async function deleteJamRecording(jamId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = createClient();

        // 1. JAM 레코드 조회 (storage path 추출용)
        const { data: jam, error: fetchError } = await supabase
            .from('jams')
            .select('*')
            .eq('id', jamId)
            .single();

        if (fetchError || !jam) {
            return { success: false, error: '녹음을 찾을 수 없습니다' };
        }

        // 2. Storage에서 파일 삭제
        const audioPath = extractStoragePath(jam.audio_url);
        if (audioPath) {
            await supabase.storage.from('jams').remove([audioPath]);
        }

        // 3. Database에서 레코드 삭제
        const { error: deleteError } = await supabase
            .from('jams')
            .delete()
            .eq('id', jamId);

        if (deleteError) {
            console.error('Delete error:', deleteError);
            return { success: false, error: '삭제에 실패했습니다' };
        }

        return { success: true };
    } catch (error) {
        console.error('deleteJamRecording error:', error);
        return { success: false, error: '삭제 중 오류가 발생했습니다' };
    }
}

// ============================================
// Helper: Extract storage path from public URL
// ============================================
function extractStoragePath(publicUrl: string): string | null {
    try {
        // Supabase public URL 형식: https://<project>.supabase.co/storage/v1/object/public/jams/<path>
        const match = publicUrl.match(/\/storage\/v1\/object\/public\/jams\/(.+)$/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

// ============================================
// Task 8: Share JAM to Feed
// ============================================
export async function shareJam(jamId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return { success: false, error: '로그인이 필요합니다' };
        }

        console.log('🎵 [shareJam] 시도:', { jamId, userId: user.id });

        // JAM 소유권 확인 및 공유 상태 업데이트
        const { data, error, count } = await supabase
            .from('jams')
            .update({
                is_public: true,
                shared_at: new Date().toISOString()
            })
            .eq('id', jamId)
            .eq('user_id', user.id)  // 본인 JAM만 공유 가능
            .select();

        console.log('🎵 [shareJam] 결과:', { data, error, count });

        if (error) {
            console.error('Share JAM error:', JSON.stringify(error, null, 2));
            return { success: false, error: `공유에 실패했습니다: ${error.message || error.code}` };
        }

        if (!data || data.length === 0) {
            console.error('Share JAM: 업데이트된 데이터 없음 - JAM ID 또는 소유권 확인 필요');
            return { success: false, error: 'JAM을 찾을 수 없거나 권한이 없습니다' };
        }

        console.log('🎵 JAM 공유 성공:', data[0]);
        return { success: true };

    } catch (error) {
        console.error('shareJam error:', error);
        return { success: false, error: '공유 중 오류가 발생했습니다' };
    }
}

// ============================================
// Task 8: Get Public JAMs for Feed
// ============================================
export interface PublicJamRecord extends JamRecord {
    // 유저 프로필 정보 (join)
    profiles?: {
        display_name: string | null;
        avatar_url: string | null;
    };
}

export async function getPublicJams(songId?: string, limit: number = 20): Promise<PublicJamRecord[]> {
    try {
        const supabase = createClient();

        let query = supabase
            .from('jams')
            .select(`
                *,
                profiles:user_id (
                    display_name,
                    avatar_url
                )
            `)
            .eq('is_public', true)
            .order('shared_at', { ascending: false })
            .limit(limit);

        if (songId) {
            query = query.eq('song_id', songId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('getPublicJams error:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('getPublicJams error:', error);
        return [];
    }
}

// ============================================
// Task 8: Get Latest User JAM (for sharing)
// ============================================
export async function getLatestUserJam(songId: string): Promise<JamRecord | null> {
    try {
        const supabase = createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from('jams')
            .select('*')
            .eq('song_id', songId)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            console.error('getLatestUserJam error:', error);
            return null;
        }

        return data;
    } catch (error) {
        console.error('getLatestUserJam error:', error);
        return null;
    }
}

export default {
    uploadJamRecording,
    getUserJams,
    deleteJamRecording,
    shareJam,
    getPublicJams,
    getLatestUserJam
};
