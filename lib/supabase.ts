import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase env vars not set");
    _client = createClient(url, key);
  }
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export type Database = {
  public: {
    Tables: {
      uploads: {
        Row: {
          id: string;
          filename: string;
          row_count: number;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          filename: string;
          row_count: number;
          status: string;
          created_at?: string;
        };
      };
      transactions: {
        Row: {
          id: string;
          upload_id: string | null;
          date: string;
          description: string;
          amount: number;
          currency: string;
          category: string | null;
          category_zh: string | null;
          confidence: number | null;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          upload_id?: string | null;
          date: string;
          description: string;
          amount: number;
          currency?: string;
          category?: string | null;
          category_zh?: string | null;
          confidence?: number | null;
          source?: string;
          created_at?: string;
        };
      };
    };
  };
};
