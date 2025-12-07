import { createClient } from './supabase';

// ============================================
// Types
// ============================================
export interface JamRecord {
    id?: string;
    song_id: string;
    user_id: string;
    audio_url: string;
    start_measure: number;
    end_measure: number;
    start_time: number;
    end_time: number;
    created_at?: string;
}

export interface UploadJamParams {
    songId: string;
    audioBlob: Blob;
    startMeasure: number;
    endMeasure: number;
    startTime: number;
    endTime: number;
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
    const { songId, audioBlob, startMeasure, endMeasure, startTime, endTime } = params;

    try {
        const supabase = createClient();

        // 1. 현재 유저 확인
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            return { success: false, error: '로그인이 필요합니다' };
        }

        // 2. Storage에 오디오 파일 업로드
        const fileName = `${user.id}/${songId}/${Date.now()}.wav`;
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

        // 3. Public URL 획득
        const { data: urlData } = supabase.storage
            .from('jams')
            .getPublicUrl(uploadData.path);

        if (!urlData?.publicUrl) {
            return { success: false, error: 'Public URL을 가져올 수 없습니다' };
        }

        // 4. Database에 레코드 저장
        // 데이터 검증 및 정수 변환
        const jamRecord: Omit<JamRecord, 'id' | 'created_at'> = {
            song_id: songId,
            user_id: user.id,
            audio_url: urlData.publicUrl,
            start_measure: Math.floor(startMeasure), // INTEGER로 변환
            end_measure: Math.floor(endMeasure),     // INTEGER로 변환
            start_time: startTime,
            end_time: endTime
        };

        // 디버깅: INSERT할 데이터 출력
        console.log('🎵 [jamStorage] INSERT 데이터:', JSON.stringify(jamRecord, null, 2));

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

export default {
    uploadJamRecording,
    getUserJams,
    deleteJamRecording
};
