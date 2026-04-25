-- Run this in the Supabase SQL editor before starting the app

CREATE TABLE uploads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  filename text,
  row_count int,
  status text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_id uuid REFERENCES uploads(id),
  date date,
  description text,
  amount numeric,
  currency text DEFAULT 'USD',
  category text,
  category_zh text,
  confidence numeric,
  source text DEFAULT 'csv',
  created_at timestamptz DEFAULT now()
);

-- Index for fast monthly queries
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_category ON transactions(category);
CREATE INDEX idx_transactions_upload_id ON transactions(upload_id);

-- Enable Row Level Security (recommended for production)
-- ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Required for AI chat: safe read-only SQL execution via RPC
-- SECURITY DEFINER means this runs with the function owner's privileges (bypasses RLS)
CREATE OR REPLACE FUNCTION execute_read_query(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  normalized text;
BEGIN
  normalized := lower(trim(query));

  -- Guard: only allow SELECT statements
  IF normalized NOT LIKE 'select%' THEN
    RAISE EXCEPTION 'Only SELECT queries are permitted';
  END IF;

  -- Guard: block any mutation keywords even embedded in subqueries
  IF normalized ~ '\m(insert|update|delete|truncate|drop|alter|create|grant|revoke)\M' THEN
    RAISE EXCEPTION 'Mutation keywords are not permitted';
  END IF;

  EXECUTE 'SELECT coalesce(json_agg(t), ''[]''::json) FROM (' || query || ') t'
  INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION execute_read_query(text) TO anon, authenticated;
