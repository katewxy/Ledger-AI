# Ledger AI

AI-powered bookkeeping for small businesses. Supports both US and China markets with English/Chinese UI and USD/CNY currency display.

## Tech Stack

- **Frontend**: Next.js 15 (App Router) + Tailwind CSS
- **Database**: Supabase (Postgres)
- **AI**: Anthropic Claude API (`claude-sonnet-4-20250514`)
- **File parsing**: papaparse (CSV) + xlsx (Excel)
- **Deploy target**: Vercel

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your keys:

```bash
cp .env.example .env.local
```

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project → Settings → API |

### 3. Run the Supabase schema

In the [Supabase SQL editor](https://supabase.com/dashboard), run the contents of `supabase-schema.sql`:

```sql
-- Creates: uploads, transactions tables + indexes
```

The schema adds a `category_zh` column not in the original spec — this stores the Chinese category name returned by the AI classifier.

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Add the same environment variables in the Vercel project dashboard under **Settings → Environment Variables**.

## Features

### Upload (`/upload`)
- Drag-and-drop CSV / XLSX / XLS bank exports
- Auto-detects columns for date, amount, description
- Supports US banks: Chase, Bank of America, Wells Fargo
- Supports China banks: 招商银行, 工商银行, 支付宝
- Preview first 10 parsed rows before classifying
- Per-file currency selector (USD / CNY)
- Sends to Claude API in batches of 20 for classification
- Second tab: receipt photo upload via Claude Vision

### Dashboard (`/`)
- Monthly summary: Total Income, Total Expenses, Net Profit, Pending Review
- Full transaction table with category badges, confidence %, and manual override dropdown
- Rows with confidence < 75% highlighted in amber with warning icon
- AI Insights panel showing highest month-over-month spend category

### Transactions (`/transactions`)
- Full paginated transaction list with category filter dropdown

### Internationalization
- Toggle EN / 中文 in the sidebar — persisted to `localStorage`
- All UI strings in both languages
- AI classifier returns both `category_en` and `category_zh`

### Currency
- Toggle USD / CNY in the top bar — persisted to `localStorage`
- Display only (no conversion) — `$` or `¥` symbol changes accordingly
- Currency context is passed to the AI classifier for market-appropriate classification

## Bank Format Support

| Bank | Format |
|---|---|
| Chase | `Transaction Date, Description, Amount` |
| Bank of America | `Date, Description, Amount` |
| Wells Fargo | No header row: `date, amount, _, _, description` |
| 招商银行 / 工商银行 | `交易时间, 交易分类, 交易对方, 金额` |
| 支付宝 | `交易时间, 交易分类, 交易对方, 金额` |
