
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CATEGORY_MAP: Record<string, string> = {
  "Sales":                 "Revenue",
  "Payroll/Wages Expense": "Payroll",
  "Cost of Goods Sold":    "Other Expense",
  "Personal Expense":      "Other Expense",
  "Utilities Expense":     "Rent & Utilities",
  "Rent/Lease Expense":    "Rent & Utilities",
  "Other Income":          "Other Income",
};

function cleanDescription(raw: string): string {
  let s = raw.toUpperCase();
  const prefixes = ["SQ \\*","TST\\*","PP\\*","SP \\*","DDA\\*","ACH\\*","POS\\*","WEB\\*","APL\\*"];
  for (const p of prefixes) s = s.replace(new RegExp(`^${p}\\s*`), "");
  s = s.replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, "");
  s = s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "");
  s = s.replace(/#\d+/g, "");
  s = s.replace(/\b[A-Z]{2}\b$/g, "");
  s = s.replace(/\b\d{4,}\b/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

const MERCHANT_RULES = [
  { keywords: ["PAYROLL", "DIRECT DEPOSIT", "ADP", "GUSTO", "RIPPLING", "PAYCHEX"], category_en: "Payroll" },
  { keywords: ["IRS", "INTERNAL REVENUE", "STATE TAX", "TAX PAYMENT", "EFTPS"], category_en: "Taxes & Fees" },
  { keywords: ["AMAZON WEB SERVICES", "AWS"], category_en: "IT Infrastructure" },
  { keywords: ["GOOGLE CLOUD", "GCP"], category_en: "IT Infrastructure" },
  { keywords: ["GITHUB", "GITLAB", "ZOOM", "SLACK", "MICROSOFT 365", "NOTION", "FIGMA", "ADOBE"], category_en: "IT Infrastructure" },
  { keywords: ["GOOGLE ADS", "FACEBOOK ADS", "META ADS", "LINKEDIN ADS", "MAILCHIMP", "HUBSPOT"], category_en: "Marketing" },
  { keywords: ["UNITED AIRLINES", "DELTA AIR", "AMERICAN AIRLINES", "SOUTHWEST AIRLINES", "JETBLUE"], category_en: "Travel & Entertainment" },
  { keywords: ["MARRIOTT", "HILTON", "HYATT", "AIRBNB"], category_en: "Travel & Entertainment" },
  { keywords: ["UBER", "LYFT"], category_en: "Travel & Entertainment" },
  { keywords: ["WEWORK", "REGUS"], category_en: "Rent & Utilities" },
  { keywords: ["AT&T", "VERIZON", "T-MOBILE", "COMCAST", "PG&E", "CON EDISON"], category_en: "Rent & Utilities" },
  { keywords: ["STAPLES", "OFFICE DEPOT", "BEST BUY", "APPLE STORE"], category_en: "Office Supplies" },
  { keywords: ["FEDEX", "UPS", "USPS", "DHL"], category_en: "Office Supplies" },
  { keywords: ["DOORDASH", "UBER EATS", "GRUBHUB", "STARBUCKS", "CHIPOTLE", "MCDONALDS"], category_en: "Meals & Entertainment" },
  { keywords: ["CLIENT PAYMENT", "INVOICE PAYMENT", "STRIPE PAYOUT", "PAYPAL TRANSFER", "SQUARE PAYOUT", "SQUARE INC", "VENMO BUSINESS", "VENMO*", "ACH CREDIT", "WIRE TRANSFER IN"], category_en: "Revenue" },
  { keywords: ["AMYS BAKERY", "SQ *AMYS"], category_en: "Revenue" },
  { keywords: ["ZELLE FROM"], category_en: "Revenue" },
  { keywords: ["ZELLE TO"], category_en: "Other Expense" },
  { keywords: ["ACH DEBIT MAIN ST PPTY", "ACH DEBIT BAKER EQUIP", "ACH DEBIT FLEET LEASE"], category_en: "Rent & Utilities" },
  { keywords: ["INTEREST PMT", "INTEREST PAYMENT"], category_en: "Other Income" },
];

function matchRule(description: string): string | null {
  const cleaned = cleanDescription(description);
  for (const rule of MERCHANT_RULES) {
    for (const keyword of rule.keywords) {
      if (cleaned.includes(keyword)) return rule.category_en;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const sampleSize = parseInt(formData.get("sampleSize") as string || "50");

    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    const text = (await file.text()).replace(/\r/g, "");
    const lines = text.split("\n").filter(Boolean);
    const header = lines[0].split(",");
    const descIdx = header.indexOf("description");
    const catIdx = header.indexOf("category");

    if (descIdx === -1 || catIdx === -1) {
      return NextResponse.json({ error: "CSV must have 'description' and 'category' columns" }, { status: 400 });
    }

    const rows = lines.slice(1).map(line => {
      const cols = line.split(",");
      return { description: cols[descIdx]?.trim(), truth: cols[catIdx]?.trim() };
    }).filter(r => r.description && r.truth && CATEGORY_MAP[r.truth]);

    // ─── 规则层 ───────────────────────────────────────────────
    let ruleCorrect = 0;
    const ruleWrong: any[] = [];
    const needsLLM: any[] = [];

    for (const row of rows) {
      const predicted = matchRule(row.description);
      const expected = CATEGORY_MAP[row.truth];
      if (predicted) {
        if (predicted === expected) ruleCorrect++;
        else ruleWrong.push({ description: row.description, expected, predicted });
      } else {
        needsLLM.push(row);
      }
    }

    const ruleTotal = rows.length - needsLLM.length;

    // ─── LLM 抽样 ────────────────────────────────────────────
    let llmCorrect = 0, llmTotal = 0;
    const llmWrong: any[] = [];

    if (needsLLM.length > 0) {
      const sample = needsLLM.sort(() => Math.random() - 0.5).slice(0, sampleSize);
      llmTotal = sample.length;

      const SYSTEM = `You are a bookkeeping assistant. Classify each transaction into one of: Revenue, IT Infrastructure, Travel & Entertainment, Rent & Utilities, Marketing, Office Supplies, Meals & Entertainment, Payroll, Taxes & Fees, Other Expense, Other Income. Return only a JSON array of objects with category_en field.`;

      for (let i = 0; i < sample.length; i += 10) {
        const batch = sample.slice(i, i + 10);
        const numbered = batch.map((r, j) => `${j + 1}. ${r.description}`).join("\n");
        try {
          const msg = await client.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1024,
            system: SYSTEM,
            messages: [{ role: "user", content: numbered }],
          });
          const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
          const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
          const parsed = JSON.parse(stripped.slice(stripped.indexOf("["), stripped.lastIndexOf("]") + 1));
          batch.forEach((row, j) => {
            const predicted = parsed[j]?.category_en;
            const expected = CATEGORY_MAP[row.truth];
            if (predicted === expected) llmCorrect++;
            else llmWrong.push({ description: row.description, expected, predicted });
          });
        } catch { /* skip failed batch */ }
      }
    }

    // ─── 计算结果 ─────────────────────────────────────────────
    const totalTested = ruleTotal + llmTotal;
    const totalCorrect = ruleCorrect + llmCorrect;

    return NextResponse.json({
      totalRows: rows.length,
      ruleCoverage: (ruleTotal / rows.length * 100).toFixed(1),
      ruleAccuracy: ruleTotal > 0 ? (ruleCorrect / ruleTotal * 100).toFixed(1) : null,
      ruleErrors: ruleWrong.length,
      llmAccuracy: llmTotal > 0 ? (llmCorrect / llmTotal * 100).toFixed(1) : null,
      overallAccuracy: totalTested > 0 ? (totalCorrect / totalTested * 100).toFixed(1) : null,
      ruleWrongSamples: ruleWrong.slice(0, 10),
      llmWrongSamples: llmWrong.slice(0, 10),
    });

  } catch (err) {
    console.error("[test-accuracy]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}