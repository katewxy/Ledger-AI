
/**
 * MERCHANT_RULES
 * 关键词匹配表 — 覆盖美国最常见的企业交易
 * 匹配逻辑：只要交易描述包含 keywords 里任意一个词，就直接返回对应分类
 * 顺序很重要：越具体的规则放越前面
 */

export interface MerchantRule {
  keywords: string[];
  category_en: string;
  category_zh: string;
}

export const MERCHANT_RULES: MerchantRule[] = [

  // ─── 工资薪酬 ───────────────────────────────────────────
  {
    keywords: ["PAYROLL", "DIRECT DEPOSIT", "ADP", "GUSTO", "RIPPLING", "BAMBOOHR", "PAYCHEX", "QUICKBOOKS PAYROLL"],
    category_en: "Payroll",
    category_zh: "人工成本",
  },

  // ─── 税务 ───────────────────────────────────────────────
  {
    keywords: ["IRS", "INTERNAL REVENUE", "STATE TAX", "TAX PAYMENT", "FRANCHISE TAX", "SALES TAX", "EFTPS"],
    category_en: "Taxes & Fees",
    category_zh: "税费",
  },

  // ─── 云服务 & 基础设施 ───────────────────────────────────
  {
    keywords: ["AMAZON WEB SERVICES", "AWS"],
    category_en: "IT Infrastructure",
    category_zh: "IT基础设施",
  },
  {
    keywords: ["GOOGLE CLOUD", "GOOGLE ONE", "GCP"],
    category_en: "IT Infrastructure",
    category_zh: "IT基础设施",
  },
  {
    keywords: ["MICROSOFT AZURE", "AZURE"],
    category_en: "IT Infrastructure",
    category_zh: "IT基础设施",
  },
  {
    keywords: ["DIGITALOCEAN", "HEROKU", "VERCEL", "NETLIFY", "CLOUDFLARE", "FASTLY"],
    category_en: "IT Infrastructure",
    category_zh: "IT基础设施",
  },
  {
    keywords: ["TWILIO", "SENDGRID", "DATADOG", "PAGERDUTY", "SENTRY", "NEW RELIC"],
    category_en: "IT Infrastructure",
    category_zh: "IT基础设施",
  },

  // ─── 软件订阅 SaaS ───────────────────────────────────────
  {
    keywords: ["GITHUB", "GITLAB", "BITBUCKET", "JIRA", "ATLASSIAN", "CONFLUENCE"],
    category_en: "IT Infrastructure",
    category_zh: "IT基础设施",
  },
  {
    keywords: ["ZOOM", "WEBEX", "GOTO MEETING", "RING CENTRAL"],
    category_en: "IT Infrastructure",
    category_zh: "IT基础设施",
  },
  {
    keywords: ["SLACK", "MICROSOFT 365", "MICROSOFT TEAMS", "GOOGLE WORKSPACE", "GSUITE"],
    category_en: "IT Infrastructure",
    category_zh: "IT基础设施",
  },
  {
    keywords: ["NOTION", "AIRTABLE", "MONDAY.COM", "ASANA", "TRELLO", "CLICKUP", "LINEAR"],
    category_en: "IT Infrastructure",
    category_zh: "IT基础设施",
  },
  {
    keywords: ["FIGMA", "SKETCH", "ADOBE", "CANVA", "INVISION"],
    category_en: "IT Infrastructure",
    category_zh: "IT基础设施",
  },
  {
    keywords: ["DROPBOX", "BOX.COM", "DOCUSIGN", "HELLOSIGN"],
    category_en: "IT Infrastructure",
    category_zh: "IT基础设施",
  },
  {
    keywords: ["OPENAI", "ANTHROPIC", "HUGGING FACE", "REPLICATE"],
    category_en: "IT Infrastructure",
    category_zh: "IT基础设施",
  },

  // ─── 营销推广 ────────────────────────────────────────────
  {
    keywords: ["GOOGLE ADS", "GOOGLE ADWORDS"],
    category_en: "Marketing",
    category_zh: "营销推广",
  },
  {
    keywords: ["FACEBOOK ADS", "META ADS", "INSTAGRAM ADS"],
    category_en: "Marketing",
    category_zh: "营销推广",
  },
  {
    keywords: ["LINKEDIN ADS", "LINKEDIN MARKETING"],
    category_en: "Marketing",
    category_zh: "营销推广",
  },
  {
    keywords: ["TWITTER ADS", "X ADS", "TIKTOK ADS", "SNAPCHAT ADS", "PINTEREST ADS"],
    category_en: "Marketing",
    category_zh: "营销推广",
  },
  {
    keywords: ["MAILCHIMP", "KLAVIYO", "HUBSPOT", "MARKETO", "CONSTANT CONTACT", "ACTIVECAMPAIGN"],
    category_en: "Marketing",
    category_zh: "营销推广",
  },
  {
    keywords: ["SEMRUSH", "AHREFS", "MOZ", "SPROUT SOCIAL", "HOOTSUITE", "BUFFER"],
    category_en: "Marketing",
    category_zh: "营销推广",
  },

  // ─── 差旅 — 机票 ─────────────────────────────────────────
  {
    keywords: ["UNITED AIRLINES", "DELTA AIR", "AMERICAN AIRLINES", "SOUTHWEST AIRLINES",
               "JETBLUE", "ALASKA AIRLINES", "SPIRIT AIRLINES", "FRONTIER AIRLINES"],
    category_en: "Travel & Entertainment",
    category_zh: "差旅费",
  },
  {
    keywords: ["EXPEDIA", "KAYAK", "PRICELINE", "ORBITZ", "GOOGLE FLIGHTS", "SKYSCANNER"],
    category_en: "Travel & Entertainment",
    category_zh: "差旅费",
  },

  // ─── 差旅 — 住宿 ─────────────────────────────────────────
  {
    keywords: ["MARRIOTT", "HILTON", "HYATT", "IHG", "WYNDHAM", "BEST WESTERN",
               "FOUR SEASONS", "KIMPTON", "AIRBNB", "VRBO"],
    category_en: "Travel & Entertainment",
    category_zh: "差旅费",
  },

  // ─── 差旅 — 交通 ─────────────────────────────────────────
  {
    keywords: ["UBER", "LYFT"],
    category_en: "Travel & Entertainment",
    category_zh: "差旅费",
  },
  {
    keywords: ["ENTERPRISE RENT", "HERTZ", "AVIS", "BUDGET CAR", "NATIONAL CAR"],
    category_en: "Travel & Entertainment",
    category_zh: "差旅费",
  },

  // ─── 租金 & 水电 ─────────────────────────────────────────
  {
    keywords: ["WEWORK", "REGUS", "INDUSTRIOUS", "COWORKING"],
    category_en: "Rent & Utilities",
    category_zh: "租赁及水电",
  },
  {
    keywords: ["AT&T", "VERIZON", "T-MOBILE", "COMCAST", "XFINITY", "SPECTRUM"],
    category_en: "Rent & Utilities",
    category_zh: "租赁及水电",
  },
  {
    keywords: ["PG&E", "CON EDISON", "CONED", "DUKE ENERGY", "DOMINION ENERGY",
               "ELECTRIC BILL", "GAS BILL", "WATER BILL"],
    category_en: "Rent & Utilities",
    category_zh: "租赁及水电",
  },

  // ─── 办公用品 ─────────────────────────────────────────────
  {
    keywords: ["STAPLES", "OFFICE DEPOT", "OFFICEMAX", "AMAZON BUSINESS"],
    category_en: "Office Supplies",
    category_zh: "办公耗材",
  },
  {
    keywords: ["BEST BUY", "APPLE STORE", "APPLE.COM", "B&H PHOTO", "ADORAMA", "NEWEGG"],
    category_en: "Office Supplies",
    category_zh: "办公耗材",
  },
  {
    keywords: ["FEDEX", "UPS", "USPS", "DHL"],
    category_en: "Office Supplies",
    category_zh: "办公耗材",
  },

  // ─── 餐饮 ────────────────────────────────────────────────
  {
    keywords: ["DOORDASH", "UBER EATS", "GRUBHUB", "SEAMLESS", "INSTACART"],
    category_en: "Meals & Entertainment",
    category_zh: "餐饮招待",
  },
  {
    keywords: ["STARBUCKS", "DUNKIN", "PEETS COFFEE", "BLUE BOTTLE"],
    category_en: "Meals & Entertainment",
    category_zh: "餐饮招待",
  },
  {
    keywords: ["CHIPOTLE", "MCDONALDS", "SUBWAY", "CHICK-FIL-A", "PANERA",
               "SWEETGREEN", "SHAKE SHACK", "IN-N-OUT", "FIVE GUYS"],
    category_en: "Meals & Entertainment",
    category_zh: "餐饮招待",
  },
  {
    keywords: ["WHOLE FOODS", "TRADER JOES", "SAFEWAY", "KROGER", "COSTCO",
               "WALMART", "TARGET"],
    category_en: "Meals & Entertainment",
    category_zh: "餐饮招待",
  },

  // ─── 收入 ────────────────────────────────────────────────
  {
    keywords: ["CLIENT PAYMENT", "INVOICE PAYMENT", "STRIPE PAYOUT", "PAYPAL TRANSFER",
           "SQUARE PAYOUT", "SQUARE INC", "VENMO BUSINESS", "VENMO*",
           "ACH CREDIT", "WIRE TRANSFER IN"],
    category_en: "Revenue",
    category_zh: "主营业务收入",
  },
  // ─── Square 收款（餐厅/零售常见）────────────────────────────
  {
    keywords: ["AMYS BAKERY", "SQ *AMYS"],
    category_en: "Revenue",
    category_zh: "主营业务收入",
  },

  // ─── Zelle 转账 ──────────────────────────────────────────────
  {
    keywords: ["ZELLE FROM"],
    category_en: "Revenue",
    category_zh: "主营业务收入",
  },
  {
    keywords: ["ZELLE TO"],
    category_en: "Other Expense",
    category_zh: "其他支出",
  },

  // ─── ACH 租金/设备租赁 ────────────────────────────────────────
  {
    keywords: ["ACH DEBIT MAIN ST PPTY", "ACH DEBIT BAKER EQUIP", "ACH DEBIT FLEET LEASE"],
    category_en: "Rent & Utilities",
    category_zh: "租赁及水电",
  },

  // ─── 利息收入 ─────────────────────────────────────────────────
  {
    keywords: ["INTEREST PMT", "INTEREST PAYMENT"],
    category_en: "Other Income",
    category_zh: "其他收入",
  },
];