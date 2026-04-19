# Claim Validation Portal

Enterprise AI-powered claim validation tool for partner marketing development fund (MDF) programs. Built with Next.js + Claude AI.

## Features

- **Structured Claim Submission** — Partner ID, Partner Name, Budget Allocation, Category, Request Number, Activity Type, Activity, dates, and approved funding.
- **Multi-Format Document Upload** — PDF, Images (PNG/JPG/GIF/WebP), DOCX, XLSX, CSV, TXT with drag-and-drop.
- **AI-Powered Analysis** — Claude Opus 4.7 analyzes uploaded documents against source guidelines and claim data.
- **Comprehensive Validation Report**
  - Decision (Approved / Rejected / Needs Review) with confidence score
  - Field-by-field validation (submitted vs extracted)
  - Document-by-document analysis with relevance scoring
  - Guideline compliance checklist
  - Severity-ranked issues with actionable recommendations
- **Source Guidelines** — Place reference documents in `reference_docs/` — they are automatically loaded and considered in every validation.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure the Anthropic API key
```bash
cp .env.local.example .env.local
```
Then edit `.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-api03-...
```
Get your key at **https://console.anthropic.com/**.

### 3. Run the dev server
```bash
npm run dev
```
Open http://localhost:3000.

## Production build
```bash
npm run build
npm start
```

## Project structure
```
claim-validation-tool/
├── src/
│   ├── pages/
│   │   ├── _app.tsx                # App wrapper
│   │   ├── index.tsx               # Main portal UI
│   │   └── api/
│   │       ├── validate.ts         # Claude-powered validation endpoint
│   │       └── source-docs.ts      # Source guidelines lister
│   ├── lib/
│   │   └── types.ts                # Shared TypeScript types
│   └── styles/
│       └── globals.css             # Tailwind + component styles
├── reference_docs/                 # Place source/guideline documents here
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.js
└── postcss.config.js
```

## API key — where to put it

Only **ONE** key is needed:

- **`ANTHROPIC_API_KEY`** — from https://console.anthropic.com/
- Put it in `.env.local` at the project root.
- `.env.local` is gitignored, so your key stays private.

## How validation works
1. User fills in the claim form and uploads supporting documents.
2. Client sends form data + base64-encoded documents to `/api/validate`.
3. Server loads source guidelines from `reference_docs/*.txt`.
4. Server sends everything to Claude Opus 4.7 as a multimodal message:
   - PDFs as native document blocks (Claude reads PDFs directly)
   - Images as image blocks (Claude vision)
   - DOCX parsed with `mammoth`, XLSX parsed with `xlsx`, text sent as text
5. Claude returns a structured JSON validation report.
6. UI renders the report across Overview / Fields / Documents / Guidelines / Issues tabs.

## Customising source guidelines
Drop any `.txt` file into `reference_docs/` — it is automatically included in every validation.
