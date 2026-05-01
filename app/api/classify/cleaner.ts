/**
 * cleanDescription
 * 把银行流水里的噪音去掉，留下商家名称核心部分
 * 例：
 *   "SQ *BLUE BOTTLE COF 04/15 CA #123" → "BLUE BOTTLE COF"
 *   "TST* NOBU RESTAURANT 1234"          → "NOBU RESTAURANT"
 *   "PP*JOHN SMITH"                      → "JOHN SMITH"
 */
export function cleanDescription(raw: string): string {
  let s = raw.toUpperCase();

  // 1. 去掉常见银行前缀
  const prefixes = [
    "SQ \\*",      // Square
    "TST\\*",      // Toast POS
    "PP\\*",       // PayPal
    "SP \\*",      // Shopify
    "DDA\\*",      // 直接扣款
    "ACH\\*",
    "POS\\*",
    "WEB\\*",
    "APL\\*",      // Apple Pay
    "ORIG CO NAME:", // ACH originator
  ];
  for (const p of prefixes) {
    s = s.replace(new RegExp(`^${p}\\s*`), "");
  }

  // 2. 去掉日期格式（04/15, 2025-04-15 等）
  s = s.replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, "");
  s = s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "");

  // 3. 去掉门店编号 (#123, #1234)
  s = s.replace(/#\d+/g, "");

  // 4. 去掉末尾州缩写（CA NY TX FL 等）
  s = s.replace(/\b[A-Z]{2}\b$/g, "");

  // 5. 去掉纯数字串（超过3位）
  s = s.replace(/\b\d{4,}\b/g, "");

  // 6. 去掉多余空格
  s = s.replace(/\s+/g, " ").trim();

  return s;
}