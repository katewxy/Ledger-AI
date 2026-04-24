import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { ClassifyResult } from "@/types";

// Allow up to 60s per request (one batch of 50)
export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a bookkeeping assistant for small businesses. You will receive a numbered list of transaction descriptions and must classify each one into exactly one category from this list: Revenue, IT Infrastructure, Travel & Entertainment, Rent & Utilities, Marketing, Office Supplies, Meals & Entertainment, Payroll, Taxes & Fees, Other Expense, Other Income.

Always return a JSON array with one object per transaction, in the same order as the input. Each object must have: category_en (string), category_zh (string), confidence (number between 0 and 1).

Use these Chinese mappings: Revenue/主营业务收入, IT Infrastructure/IT基础设施, Travel & Entertainment/差旅费, Rent & Utilities/租赁及水电, Marketing/营销推广, Office Supplies/办公耗材, Meals & Entertainment/餐饮招待, Payroll/人工成本, Taxes & Fees/税费, Other Expense/其他支出, Other Income/其他收入.

Return only the raw JSON array. No markdown, no explanation, no other text.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { descriptions: string[]; currency: string };
    const { descriptions, currency } = body;

    console.log(`[classify] POST received: ${descriptions?.length} descriptions, currency: ${currency}`);

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("[classify] ANTHROPIC_API_KEY is not set");
      return NextResponse.json({ error: "Server misconfiguration: missing API key" }, { status: 500 });
    }

    if (!Array.isArray(descriptions) || descriptions.length === 0) {
      return NextResponse.json({ error: "No descriptions provided" }, { status: 400 });
    }

    // API now handles exactly one batch of up to 50 — client is responsible for batching
    const batch = descriptions.slice(0, 50);
    const numbered = batch.map((d, i) => `${i + 1}. ${d}`).join("\n");
    const userPrompt = `Currency context: ${currency}\n\nTransactions to classify:\n${numbered}`;

    const batchStart = Date.now();
    console.log(`[classify] Sending ${batch.length} descriptions to Claude at ${new Date().toISOString()}`);

    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    console.log(`[classify] stop_reason: ${msg.stop_reason} — Claude took ${Date.now() - batchStart}ms`);

    if (!msg.content || msg.content.length === 0) {
      throw new Error("Claude returned empty content");
    }

    const block = msg.content[0];
    if (block.type !== "text") {
      throw new Error(`Unexpected content block type: ${block.type}`);
    }

    const raw = block.text.trim();
    console.log(`[classify] Raw response (first 300 chars): ${raw.slice(0, 300)}`);

    const FALLBACK: ClassifyResult = { category_en: "Other Expense", category_zh: "其他支出", confidence: 0.5 };

    // 1. Strip markdown code fences (``` or ```json)
    const stripped = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    // 2. Extract content between the FIRST '[' and the LAST ']' to avoid
    //    trailing prose or extra characters causing "Unexpected non-whitespace"
    const firstBracket = stripped.indexOf("[");
    const lastBracket = stripped.lastIndexOf("]");

    if (firstBracket !== -1 && lastBracket > firstBracket) {
      const arraySlice = stripped.slice(firstBracket, lastBracket + 1);

      let parsed: unknown[];
      try {
        parsed = JSON.parse(arraySlice) as unknown[];
      } catch (parseErr) {
        console.error("[classify] JSON.parse failed on array slice:", parseErr);
        console.error("[classify] Slice was:", arraySlice.slice(0, 500));
        // Return all fallbacks rather than a 500 — caller gets usable data
        const results = batch.map(() => FALLBACK);
        return NextResponse.json({ results });
      }

      // Validate each element individually; replace any bad ones with the fallback
      const results: ClassifyResult[] = parsed.map((item, i) => {
        if (
          item &&
          typeof item === "object" &&
          "category_en" in item &&
          typeof (item as Record<string, unknown>).category_en === "string" &&
          "confidence" in item &&
          typeof (item as Record<string, unknown>).confidence === "number"
        ) {
          return item as ClassifyResult;
        }
        console.warn(`[classify] Item ${i} malformed, using fallback:`, item);
        return FALLBACK;
      });

      // Pad with fallbacks if Claude returned fewer items than expected
      while (results.length < batch.length) {
        console.warn(`[classify] Missing result at index ${results.length}, padding with fallback`);
        results.push(FALLBACK);
      }

      console.log(`[classify] Parsed ${results.length} results — total request time ${Date.now() - batchStart}ms`);
      return NextResponse.json({ results });
    }

    // 3. Last resort: single object wrapped in array
    const firstBrace = stripped.indexOf("{");
    const lastBrace = stripped.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        const obj = JSON.parse(stripped.slice(firstBrace, lastBrace + 1)) as ClassifyResult;
        console.warn("[classify] Claude returned single object — wrapping in array");
        const results = batch.map((_, i) => (i === 0 ? obj : FALLBACK));
        return NextResponse.json({ results });
      } catch { /* fall through */ }
    }

    console.error("[classify] Could not extract any JSON — returning all fallbacks. Raw:", raw.slice(0, 500));
    return NextResponse.json({ results: batch.map(() => FALLBACK) });

  } catch (err) {
    console.error("[classify] Unhandled error:", err);
    return NextResponse.json(
      { error: "Classification failed", detail: String(err) },
      { status: 500 }
    );
  }
}
