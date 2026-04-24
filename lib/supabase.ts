import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
