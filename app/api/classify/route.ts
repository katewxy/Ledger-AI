
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { ClassifyResult } from "@/types";
import { cleanDescription } from "./cleaner";
import { MERCHANT_RULES } from "./merchants";
import { getCached, setCached } from "./cache";

export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a bookkeeping assistant for small businesses. You will receive a numbered list of transaction descriptions and must classify each one into exactly one category from this list: Revenue, IT Infrastructure, Travel & Entertainment, Rent & Utilities, Marketing, Office Supplies, Meals & Entertainment, Payroll, Taxes & Fees, Other Expense, Other Income.

Always return a JSON array with one object per transaction, in the same order as the input. Each object must have: category_en (string), category_zh (string), confidence (number between 0 and 1).

Use these Chinese mappings: Revenue/主营业务收入, IT Infrastructure/IT基础设施, Travel & Entertainment/差旅费, Rent & Utilities/租赁及水电, Marketing/营销推广, Office Supplies/办公耗材, Meals & Entertainment/餐饮招待, Payroll/人工成本, Taxes & Fees/税费, Other Expense/其他支出, Other Income/其他收入.

Return only the raw JSON array. No markdown, no explanation, no other text.`;

// ─── Rule-based 前置分类 ──────────────────────────────────────────
function matchRule(description: string): ClassifyResult | null {
  const cleaned = cleanDescription(description);
  for (const rule of MERCHANT_RULES) {
    for (const keyword of rule.keywords) {
      if (cleaned.includes(keyword)) {
        return {
          category_en: rule.category_en,
          category_zh: rule.category_zh,
          confidence: 1.0,
        };
      }
    }
  }
  return null;
}

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

    const batch = descriptions.slice(0, 50);
    const results: (ClassifyResult | null)[] = batch.map(() => null);
    const needsLLM: { index: number; description: string }[] = [];

    // ─── Step 1: 查缓存 ──────────────────────────────────────
    const cacheChecks = await Promise.all(
      batch.map((desc) => getCached(desc))
    );

    for (let i = 0; i < batch.length; i++) {
      if (cacheChecks[i]) {
        results[i] = cacheChecks[i];
        continue;
      }

      // ─── Step 2: 跑规则层 ──────────────────────────────────
      const ruleResult = matchRule(batch[i]);
      if (ruleResult) {
        results[i] = ruleResult;
        console.log(`[classify] Rule matched [${i}]: "${batch[i]}" → ${ruleResult.category_en}`);
        await setCached(batch[i], ruleResult, "rule");
      } else {
        needsLLM.push({ index: i, description: batch[i] });
      }
    }

    console.log(`[classify] Cache+Rule: ${batch.length - needsLLM.length} resolved, ${needsLLM.length} sent to LLM`);

    // ─── Step 3: 剩下的送给 LLM ──────────────────────────────
    const FALLBACK: ClassifyResult = { category_en: "Other Expense", category_zh: "其他支出", confidence: 0.5 };

    if (needsLLM.length > 0) {
      const numbered = needsLLM.map((item, i) => `${i + 1}. ${item.description}`).join("\n");
      const userPrompt = `Currency context: ${currency}\n\nTransactions to classify:\n${numbered}`;

      const batchStart = Date.now();
      console.log(`[classify] Sending ${needsLLM.length} descriptions to Claude`);

      const msg = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userPrompt }],
      });

      console.log(`[classify] Claude took ${Date.now() - batchStart}ms`);

      const block = msg.content[0];
      if (!block || block.type !== "text") throw new Error("Claude returned empty/unexpected content");

      const raw = block.text.trim();
      const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const firstBracket = stripped.indexOf("[");
      const lastBracket = stripped.lastIndexOf("]");

      if (firstBracket !== -1 && lastBracket > firstBracket) {
        let parsed: unknown[];
        try {
          parsed = JSON.parse(stripped.slice(firstBracket, lastBracket + 1)) as unknown[];
        } catch {
          parsed = [];
        }

        for (let i = 0; i < needsLLM.length; i++) {
          const item = needsLLM[i];
          const llmResult = parsed[i];

          if (
            llmResult &&
            typeof llmResult === "object" &&
            "category_en" in llmResult &&
            typeof (llmResult as Record<string, unknown>).category_en === "string"
          ) {
            const classified = llmResult as ClassifyResult;
            results[item.index] = classified;
            await setCached(item.description, classified, "llm");
          } else {
            results[item.index] = FALLBACK;
          }
        }
      } else {
        needsLLM.forEach((item) => { results[item.index] = FALLBACK; });
      }
    }

    // ─── Step 4: 统一返回 ─────────────────────────────────────
    const finalResults = results.map((r) => r ?? FALLBACK);
    console.log(`[classify] Done — ${finalResults.length} results returned`);

    return NextResponse.json({ results: finalResults });

  } catch (err) {
    console.error("[classify] Unhandled error:", err);
    return NextResponse.json(
      { error: "Classification failed", detail: String(err) },
      { status: 500 }
    );
  }
}