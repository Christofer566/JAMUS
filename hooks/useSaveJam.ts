'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';

interface UseSaveJamReturn {
  saveJamName: (jamId: string, name: string) => Promise<boolean>;
  isSaving: boolean;
  error: string | null;
}

export function useSaveJam(): UseSaveJamReturn {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveJamName = useCallback(async (jamId: string, name: string): Promise<boolean> => {
    setIsSaving(true);
    setError(null);

    try {
      const supabase = createClient();

      const { error: updateError } = await supabase
        .from('jams')
        .update({ name: name.trim() })
        .eq('id', jamId);

      if (updateError) {
        console.error('[useSaveJam] 저장 실패:', updateError);
        setError(updateError.message || 'JAM 이름 저장에 실패했습니다');
        return false;
      }

      console.log('[useSaveJam] 저장 성공:', { jamId, name });
      return true;
    } catch (err: any) {
      console.error('[useSaveJam] 오류:', err);
      setError(err.message || 'JAM 이름 저장 중 오류가 발생했습니다');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, []);

  return {
    saveJamName,
    isSaving,
    error,
  };
}

export default useSaveJam;
