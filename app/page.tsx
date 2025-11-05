'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any[] | null>(null);

  const testSupabaseConnection = async () => {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const supabase = createClient();
      const { data: result, error: supabaseError } = await supabase
        .from('test_ping')
        .select('*');

      if (supabaseError) {
        throw supabaseError;
      }

      setData(result);
    } catch (err: any) {
      setError(err?.message || 'Failed to connect to Supabase');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold text-center mb-4">
          Welcome to Next.js 14
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Get started by editing <code className="font-mono font-bold">app/page.tsx</code>
        </p>

        {/* Supabase Test Section */}
        <div className="mt-8 p-6 border rounded-lg bg-white shadow-sm">
          <h2 className="text-2xl font-bold mb-4 text-center">
            Supabase Connection Test
          </h2>
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={testSupabaseConnection}
              disabled={loading}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Testing...' : 'Test Supabase Connection'}
            </button>

            {loading && (
              <div className="text-gray-500">Loading...</div>
            )}

            {error && (
              <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg max-w-md w-full">
                <p className="font-semibold">Error:</p>
                <p>{error}</p>
              </div>
            )}

            {data && (
              <div className="mt-4 w-full max-w-2xl">
                <h3 className="text-lg font-semibold mb-2 text-green-600">
                  Success! Retrieved {data.length} row(s)
                </h3>
                <div className="bg-gray-50 p-4 rounded-lg border overflow-x-auto">
                  <pre className="text-xs text-gray-800">
                    {JSON.stringify(data, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
