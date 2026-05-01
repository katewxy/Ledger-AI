import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── 分类映射：训练数据 → Ledger AI ──────────────────────────
const CATEGORY_MAP = {
  "Sales":                  "Revenue",
  "Payroll/Wages Expense":  "Payroll",
  "Cost of Goods Sold":     "Other Expense",
  "Personal Expense":       "Other Expense",
  "Utilities Expense":      "Rent & Utilities",
  "Rent/Lease Expense":     "Rent & Utilities",
  "Other Income":           "Other Income",
};

// ─── 清洗函数（和 cleaner.ts 一致）──────────────────────────
function cleanDescription(raw) {
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

// ─── 规则表（和 merchants.ts 完全同步）──────────────────────
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
  { keywords: ["STRIPE", "SQUARE PAYOUT", "SQUARE INC", "CLIENT PAYMENT", "INVOICE PAYMENT", "WIRE TRANSFER IN", "ACH CREDIT", "VENMO*"], category_en: "Revenue" },
  { keywords: ["AMYS BAKERY", "SQ *AMYS"], category_en: "Revenue" },
  { keywords: ["ZELLE FROM"], category_en: "Revenue" },
  { keywords: ["ZELLE TO"], category_en: "Other Expense" },
  { keywords: ["ACH DEBIT MAIN ST PPTY", "ACH DEBIT BAKER EQUIP", "ACH DEBIT FLEET LEASE"], category_en: "Rent & Utilities" },
  { keywords: ["INTEREST PMT", "INTEREST PAYMENT"], category_en: "Other Income" },
];

function matchRule(description) {
  const cleaned = cleanDescription(description);
  for (const rule of MERCHANT_RULES) {
    for (const keyword of rule.keywords) {
      if (cleaned.includes(keyword)) return rule.category_en;
    }
  }
  return null;
}

// ─── 读取训练数据 ─────────────────────────────────────────────
const csvPath = process.argv[2];
const sampleSize = parseInt(process.argv[3] || "100");

if (!csvPath) {
  console.error("用法: node scripts/test-accuracy.mjs <csv路径> [LLM抽样数量]");
  process.exit(1);
}

const lines = fs.readFileSync(csvPath, "utf-8").replace(/\r/g, "").split("\n").filter(Boolean);
const header = lines[0].split(",");
const descIdx = header.indexOf("description");
const catIdx  = header.indexOf("category");

const rows = lines.slice(1).map(line => {
  const cols = line.split(",");
  return {
    description: cols[descIdx]?.trim(),
    truth: cols[catIdx]?.trim(),
  };
}).filter(r => r.description && r.truth && CATEGORY_MAP[r.truth]);

// ─── 规则层测试 ───────────────────────────────────────────────
let ruleTotal = 0, ruleCorrect = 0, ruleWrong = [];
const needsLLM = [];

for (const row of rows) {
  const predicted = matchRule(row.description);
  const expected  = CATEGORY_MAP[row.truth];
  if (predicted) {
    ruleTotal++;
    if (predicted === expected) ruleCorrect++;
    else ruleWrong.push({ description: row.description, expected, predicted });
  } else {
    needsLLM.push(row);
  }
}

// ─── LLM 抽样测试 ─────────────────────────────────────────────
const apiKey = process.env.ANTHROPIC_API_KEY;
let llmCorrect = 0, llmTotal = 0, llmWrong = [];

if (apiKey && needsLLM.length > 0) {
  const client = new Anthropic({ apiKey });
  const sample = needsLLM.sort(() => Math.random() - 0.5).slice(0, sampleSize);
  llmTotal = sample.length;

  console.log(`\n正在测试 LLM 准确率（抽样 ${llmTotal} 条）...`);

  const SYSTEM = `You are a bookkeeping assistant. Classify each transaction into one of: Revenue, IT Infrastructure, Travel & Entertainment, Rent & Utilities, Marketing, Office Supplies, Meals & Entertainment, Payroll, Taxes & Fees, Other Expense, Other Income. Return only a JSON array of objects with category_en and category_zh fields.`;
  const ZH_MAP = { "Revenue":"主营业务收入","IT Infrastructure":"IT基础设施","Travel & Entertainment":"差旅费","Rent & Utilities":"租赁及水电","Marketing":"营销推广","Office Supplies":"办公耗材","Meals & Entertainment":"餐饮招待","Payroll":"人工成本","Taxes & Fees":"税费","Other Expense":"其他支出","Other Income":"其他收入" };

  // 每10条一批
  for (let i = 0; i < sample.length; i += 10) {
    const batch = sample.slice(i, i + 10);
    const numbered = batch.map((r, j) => `${j+1}. ${r.description}`).join("\n");
    try {
      const msg = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: SYSTEM,
        messages: [{ role: "user", content: numbered }],
      });
      const raw = msg.content[0].text.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
      const parsed = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]")+1));
      batch.forEach((row, j) => {
        const predicted = parsed[j]?.category_en;
        const expected = CATEGORY_MAP[row.truth];
        if (predicted === expected) llmCorrect++;
        else llmWrong.push({ description: row.description, expected, predicted });
      });
    } catch(e) {
      console.warn(`批次 ${i} 失败:`, e.message);
    }
    process.stdout.write(`\r进度: ${Math.min(i+10, sample.length)}/${llmTotal}`);
  }
  console.log();
}

// ─── 输出报告 ─────────────────────────────────────────────────
const totalResolved = ruleTotal + llmTotal;
const totalCorrect = ruleCorrect + llmCorrect;
const overallAccuracy = totalResolved > 0 ? (totalCorrect / totalResolved * 100).toFixed(1) : "N/A";

console.log("\n========================================");
console.log("       Ledger AI 总体准确率报告");
console.log("========================================");
console.log(`总数据量:          ${rows.length} 条`);
console.log(`\n【规则层】`);
console.log(`  命中:            ${ruleTotal} 条 (${(ruleTotal/rows.length*100).toFixed(1)}%)`);
console.log(`  准确率:          ${ruleTotal > 0 ? (ruleCorrect/ruleTotal*100).toFixed(1) : "N/A"}%`);
console.log(`  错误:            ${ruleWrong.length} 条`);
if (llmTotal > 0) {
  console.log(`\n【LLM层（抽样${llmTotal}条）】`);
  console.log(`  准确率:          ${(llmCorrect/llmTotal*100).toFixed(1)}%`);
  console.log(`  错误:            ${llmWrong.length} 条`);
  console.log(`\n【加权总体准确率】  ${overallAccuracy}%`);
}
console.log(`未测试(剩余LLM):   ${needsLLM.length - llmTotal} 条`);

if (ruleWrong.length > 0) {
  console.log("\n--- 规则层错误样本（前5条）---");
  ruleWrong.slice(0,5).forEach(r => {
    console.log(`  "${r.description}"`);
    console.log(`    期望: ${r.expected}  |  实际: ${r.predicted}`);
  });
}
if (llmWrong.length > 0) {
  console.log("\n--- LLM错误样本（前5条）---");
  llmWrong.slice(0,5).forEach(r => {
    console.log(`  "${r.description}"`);
    console.log(`    期望: ${r.expected}  |  实际: ${r.predicted}`);
  });
}
console.log("========================================\n");

 