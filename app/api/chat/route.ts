import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Supabase client ────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars not set");
  return createClient(url, key);
}

// ── SQL safety guards ──────────────────────────────────────────────────────

function validateSql(sql: string): string {
  const norm = sql.trim().toLowerCase();
  if (!norm.startsWith("select")) throw new Error("Only SELECT queries are permitted");
  if (/\b(insert|update|delete|truncate|drop|alter|create|grant|revoke|pg_|information_schema)\b/.test(norm)) {
    throw new Error("Disallowed keyword in query");
  }
  // Strip trailing semicolons (the RPC function handles them internally)
  const stripped = sql.trimEnd().replace(/;+$/, "");
  return norm.includes("limit") ? stripped : stripped + " LIMIT 200";
}

function fallbackSql(question: string): string {
  const q = question.toLowerCase();
  if (q.includes("income") || q.includes("revenue") || q.includes("收入")) {
    return "SELECT date, description, amount, category FROM transactions WHERE category IN ('Revenue','Other Income') ORDER BY amount DESC LIMIT 50";
  }
  if (q.includes("month") || q.includes("月")) {
    return "SELECT DATE_TRUNC('month', date)::date AS month, SUM(CASE WHEN category IN ('Revenue','Other Income') THEN amount ELSE 0 END) AS income, SUM(CASE WHEN category NOT IN ('Revenue','Other Income') THEN amount ELSE 0 END) AS expenses FROM transactions GROUP BY 1 ORDER BY 1 DESC LIMIT 24";
  }
  return "SELECT category, SUM(amount) AS total FROM transactions WHERE category NOT IN ('Revenue','Other Income') GROUP BY category ORDER BY total DESC LIMIT 20";
}

// ── Prompts ────────────────────────────────────────────────────────────────

const SQL_SYSTEM = `You are a financial assistant for a small business. You have access to a \`transactions\` table in PostgreSQL with these columns:
  date (date), description (text), amount (numeric, ALWAYS stored as a positive number),
  category (text), category_zh (text), currency (text DEFAULT 'USD'),
  source (text), created_at (timestamptz).

Income categories: 'Revenue', 'Other Income'. All other categories are expenses.

QUERY RULES:
- Table name is exactly: transactions (never schema-qualify it)
- Always generate a SELECT statement that queries the ACTUAL data — never make assumptions
- For negation/exclusion questions ("not payroll", "excluding rent", "除了…"), use WHERE category != 'X' or WHERE category NOT IN ('X','Y')
- For comparison questions ("more than last month", "compared to Q3"), use two CTEs or subqueries comparing date ranges
- For confirmation questions ("so my biggest expense is payroll, right?"), write a query that directly verifies the claim from the data
- Use DATE_TRUNC('month', date) for monthly grouping; EXTRACT(year FROM date) for yearly
- Last month: date >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month' AND date < DATE_TRUNC('month', NOW())
- This month: date >= DATE_TRUNC('month', NOW())
- Last quarter: date >= DATE_TRUNC('quarter', NOW()) - INTERVAL '3 months' AND date < DATE_TRUNC('quarter', NOW())
- Do NOT include a trailing semicolon

OUTPUT: Return ONLY valid JSON with no markdown, no backticks, no commentary:
{"sql": "SELECT ...", "explanation": "one sentence describing what the query does"}`;

function answerSystem(language: string) {
  return language === "zh"
    ? `你是一位财务助手。根据下面的 SQL 查询结果，用简洁的中文回答用户的问题。
规则：
- 使用结果中的实际数字，不要猜测或假设
- 如果查询是为了确认某个说法，明确指出数据是否支持该说法
- 结果为空时，明确说明没有找到符合条件的数据
- 不要重复 SQL，直接给出答案
- 不要使用 Markdown 格式（**加粗**等）`
    : `You are a financial assistant. Answer the user's question using ONLY the data in the query results below.
Rules:
- Use actual numbers from the results — never guess or extrapolate
- For confirmation questions, explicitly state whether the data confirms or contradicts the claim
- If results are empty, say so clearly and explain what that means
- Do not repeat the SQL
- Do not use markdown formatting (no **bold**, no bullet asterisks)`;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractSql(raw: string): { sql: string; explanation: string } {
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(stripped.slice(firstBrace, lastBrace + 1)) as { sql: string; explanation: string };
      if (parsed.sql?.trim()) return { sql: parsed.sql.trim(), explanation: parsed.explanation ?? "" };
    } catch { /* fall through */ }
  }
  const match = stripped.match(/SELECT[\s\S]+/i);
  if (match) return { sql: match[0].trim(), explanation: "" };
  throw new Error(`No SQL found in response: ${raw.slice(0, 200)}`);
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .trim();
}

interface HistoryMessage { role: "user" | "assistant"; content: string; }

// ── Handler ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { question, history, language } = await req.json() as {
      question: string;
      history: HistoryMessage[];
      language: string;
    };

    if (!question?.trim()) return NextResponse.json({ error: "No question provided" }, { status: 400 });
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });

    console.log(`[chat] Question: "${question}" lang=${language}`);

    // ── Turn 1: generate SQL ───────────────────────────────────────────────

    const contextMessages: Anthropic.MessageParam[] = [
      ...history.slice(-6).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user", content: question },
    ];

    const sqlResponse = await claude.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: SQL_SYSTEM,
      messages: contextMessages,
    });

    const sqlRaw = sqlResponse.content[0].type === "text" ? sqlResponse.content[0].text.trim() : "";

    let sql: string;
    let explanation: string;
    try {
      ({ sql, explanation } = extractSql(sqlRaw));
    } catch {
      sql = fallbackSql(question);
      explanation = "fallback query";
    }

    let validatedSql: string;
    try {
      validatedSql = validateSql(sql);
    } catch {
      validatedSql = fallbackSql(question);
      explanation = "fallback query (original failed validation)";
    }

    console.log(`[chat] Executing SQL: ${validatedSql}`);

    // ── Execute via Supabase RPC ───────────────────────────────────────────

    const supabase = getSupabase();
    let resultRows: Record<string, unknown>[] = [];
    let usedFallback = false;

    const { data, error: rpcError } = await supabase.rpc("execute_read_query", { query: validatedSql });

    if (rpcError) {
      console.warn(`[chat] Primary query failed: ${rpcError.message}, trying fallback`);
      usedFallback = true;
      const fbSql = fallbackSql(question);
      const { data: fbData, error: fbError } = await supabase.rpc("execute_read_query", { query: fbSql });
      if (fbError) {
        console.error("[chat] Fallback also failed:", fbError.message);
        explanation += ` [Both queries failed: ${fbError.message}]`;
      } else {
        resultRows = (fbData as Record<string, unknown>[]) ?? [];
        validatedSql = fbSql;
        explanation = "fallback query — original query had an error";
      }
    } else {
      resultRows = (data as Record<string, unknown>[]) ?? [];
    }

    console.log(`[chat] Query returned ${resultRows.length} rows`);

    // ── Turn 2: natural-language answer ───────────────────────────────────

    const answerPrompt = [
      `User question: ${question}`,
      `SQL executed: ${validatedSql}`,
      `Rows returned: ${resultRows.length}`,
      `Results: ${JSON.stringify(resultRows.slice(0, 50))}`,
      explanation ? `Query intent: ${explanation}` : "",
      usedFallback ? "Note: a simpler fallback query was used because the original query failed." : "",
    ].filter(Boolean).join("\n");

    const answerResponse = await claude.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: answerSystem(language),
      messages: [{ role: "user", content: answerPrompt }],
    });

    const rawAnswer = answerResponse.content[0].type === "text"
      ? answerResponse.content[0].text.trim()
      : "I was unable to generate an answer.";

    const answer = stripMarkdown(rawAnswer);
    return NextResponse.json({ answer, sql: validatedSql });

  } catch (err) {
    console.error("[chat] Unhandled error:", err);
    return NextResponse.json({ error: "Chat failed", detail: String(err) }, { status: 500 });
  }
}
