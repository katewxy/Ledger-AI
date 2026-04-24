import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import postgres from "postgres";

export const maxDuration = 60;

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── DB connection ──────────────────────────────────────────────────────────

let _db: ReturnType<typeof postgres> | null = null;
function getDb() {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is not set. Add it to .env.local (Supabase → Settings → Database → Connection string → URI)."
      );
    }
    _db = postgres(process.env.DATABASE_URL, {
      ssl: "require",
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return _db;
}

// ── SQL safety guards ──────────────────────────────────────────────────────

function validateSql(sql: string): string {
  const norm = sql.trim().toLowerCase();
  if (!norm.startsWith("select")) throw new Error("Only SELECT queries are permitted");
  if (/\b(insert|update|delete|truncate|drop|alter|create|grant|revoke|pg_|information_schema)\b/.test(norm)) {
    throw new Error("Disallowed keyword in query");
  }
  // Remove trailing semicolons, add a result cap, then add one clean semicolon
  const capped = norm.includes("limit")
    ? sql.trimEnd().replace(/;+$/, "")
    : sql.trimEnd().replace(/;+$/, "") + " LIMIT 200";
  return capped + ";";
}

// Simplest possible fallback query — just scan all rows, let Claude interpret
function fallbackSql(question: string): string {
  const q = question.toLowerCase();
  // Pick a targeted fallback based on keywords so the results are still useful
  if (q.includes("income") || q.includes("revenue") || q.includes("收入")) {
    return "SELECT date, description, amount, category FROM transactions WHERE category IN ('Revenue','Other Income') ORDER BY amount DESC LIMIT 50;";
  }
  if (q.includes("month") || q.includes("月")) {
    return "SELECT DATE_TRUNC('month', date)::date AS month, SUM(CASE WHEN category IN ('Revenue','Other Income') THEN amount ELSE 0 END) AS income, SUM(CASE WHEN category NOT IN ('Revenue','Other Income') THEN amount ELSE 0 END) AS expenses FROM transactions GROUP BY 1 ORDER BY 1 DESC LIMIT 24;";
  }
  // Generic: top expenses
  return "SELECT category, SUM(amount) AS total FROM transactions WHERE category NOT IN ('Revenue','Other Income') GROUP BY category ORDER BY total DESC LIMIT 20;";
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
- For confirmation questions ("so my biggest expense is payroll, right?"), write a query that directly verifies the claim from the data — do NOT assume the previous answer was correct
- For "biggest" or "largest" questions with exclusions, always apply the exclusion in WHERE before ORDER BY + LIMIT 1
- Use DATE_TRUNC('month', date) for monthly grouping; EXTRACT(year FROM date) for yearly
- Last month: date >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month' AND date < DATE_TRUNC('month', NOW())
- This month: date >= DATE_TRUNC('month', NOW())
- Last quarter: date >= DATE_TRUNC('quarter', NOW()) - INTERVAL '3 months' AND date < DATE_TRUNC('quarter', NOW())

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

// ── JSON / SQL extraction ──────────────────────────────────────────────────

function extractSql(raw: string): { sql: string; explanation: string } {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(stripped.slice(firstBrace, lastBrace + 1)) as {
        sql: string;
        explanation: string;
      };
      if (parsed.sql?.trim()) {
        return { sql: parsed.sql.trim(), explanation: parsed.explanation ?? "" };
      }
    } catch { /* fall through to regex */ }
  }

  const match = stripped.match(/SELECT[\s\S]+/i);
  if (match) return { sql: match[0].trim(), explanation: "" };

  throw new Error(`No SQL found in response: ${raw.slice(0, 200)}`);
}

// ── Strip markdown formatting from answer text ─────────────────────────────

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")   // **bold**
    .replace(/\*(.+?)\*/g, "$1")        // *italic*
    .replace(/`(.+?)`/g, "$1")          // `code`
    .replace(/#{1,6}\s+/g, "")          // ## headings
    .trim();
}

// ── Types ──────────────────────────────────────────────────────────────────

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Handler ────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { question, history, language } = await req.json() as {
      question: string;
      history: HistoryMessage[];
      language: string;
    };

    if (!question?.trim()) {
      return NextResponse.json({ error: "No question provided" }, { status: 400 });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
    }

    console.log(`[chat] Question: "${question}" lang=${language}`);

    // ── Turn 1: generate SQL ───────────────────────────────────────────────

    const contextMessages: Anthropic.MessageParam[] = [
      ...history.slice(-6).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: question },
    ];

    const sqlResponse = await claude.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: SQL_SYSTEM,
      messages: contextMessages,
    });

    const sqlRaw =
      sqlResponse.content[0].type === "text" ? sqlResponse.content[0].text.trim() : "";
    console.log(`[chat] SQL response: ${sqlRaw.slice(0, 400)}`);

    let sql: string;
    let explanation: string;
    try {
      ({ sql, explanation } = extractSql(sqlRaw));
    } catch (parseErr) {
      console.warn("[chat] SQL parse failed, using fallback:", parseErr);
      sql = fallbackSql(question);
      explanation = "fallback query";
    }

    console.log(`[chat] Generated SQL: ${sql}`);

    let validatedSql: string;
    try {
      validatedSql = validateSql(sql);
    } catch (validErr) {
      console.warn("[chat] SQL validation failed, using fallback:", validErr);
      validatedSql = fallbackSql(question);
      explanation = "fallback query (original failed validation)";
    }

    console.log(`[chat] Validated SQL: ${validatedSql}`);

    // ── Execute SQL — with automatic fallback on DB error ─────────────────

    const db = getDb();
    let resultRows: Record<string, unknown>[] = [];
    let usedFallback = false;

    try {
      const rows = await db.unsafe(validatedSql);
      resultRows = rows as unknown as Record<string, unknown>[];
      console.log(`[chat] Query returned ${resultRows.length} rows`);
    } catch (dbErr) {
      console.warn(`[chat] Primary query failed (${String(dbErr)}), trying fallback`);
      usedFallback = true;
      try {
        const fbSql = fallbackSql(question);
        const rows = await db.unsafe(fbSql);
        resultRows = rows as unknown as Record<string, unknown>[];
        validatedSql = fbSql;
        explanation = "fallback query — original query had a syntax error";
        console.log(`[chat] Fallback query returned ${resultRows.length} rows`);
      } catch (fbErr) {
        console.error("[chat] Fallback also failed:", fbErr);
        // Send the error forward so Claude can respond gracefully
        explanation += ` [Both queries failed: ${String(fbErr)}]`;
      }
    }

    // ── Turn 2: natural-language answer ───────────────────────────────────

    const answerPrompt = [
      `User question: ${question}`,
      `SQL executed: ${validatedSql}`,
      `Rows returned: ${resultRows.length}`,
      `Results: ${JSON.stringify(resultRows.slice(0, 50))}`,
      explanation ? `Query intent: ${explanation}` : "",
      usedFallback ? "Note: a simpler fallback query was used because the original query failed." : "",
    ]
      .filter(Boolean)
      .join("\n");

    const answerResponse = await claude.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: answerSystem(language),
      messages: [{ role: "user", content: answerPrompt }],
    });

    const rawAnswer =
      answerResponse.content[0].type === "text"
        ? answerResponse.content[0].text.trim()
        : "I was unable to generate an answer.";

    const answer = stripMarkdown(rawAnswer);

    console.log(`[chat] Answer: ${answer.slice(0, 200)}`);
    return NextResponse.json({ answer, sql: validatedSql.replace(/;$/, "") });

  } catch (err) {
    console.error("[chat] Unhandled error:", err);
    return NextResponse.json(
      { error: "Chat failed", detail: String(err) },
      { status: 500 }
    );
  }
}
