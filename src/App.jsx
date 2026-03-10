import { useState, useRef, useEffect, createContext, useContext } from "react";

// ─── THEME ────────────────────────────────────────────────────────────────────
const ThemeCtx = createContext({});
const useTheme = () => useContext(ThemeCtx);

// ─── PERSISTENT STORAGE ──────────────────────────────────────────────────────
const STORAGE_KEY = 'klarix_chat_history';
const QA_STORAGE_KEY = 'klarix_qa_pairs';

// Simple semantic similarity using word overlap and Jaccard similarity
function calculateSimilarity(str1, str2) {
  const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const words1 = new Set(normalize(str1));
  const words2 = new Set(normalize(str2));
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

// Load chat history from database
async function loadChatHistory() {
  if (import.meta.env.VITE_USE_POSTGRES !== 'true') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch(e) {
      return [];
    }
  }
  
  try {
    const res = await fetch('/api/load-history');
    if (!res.ok) return [];
    return await res.json();
  } catch(e) {
    console.warn('Failed to load chat history:', e);
    return [];
  }
}

// Save chat history to database
async function saveChatHistory(title, messages, totalCost, totalTokens) {
  if (import.meta.env.VITE_USE_POSTGRES !== 'true') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const history = stored ? JSON.parse(stored) : [];
      history.unshift({ id: Date.now(), title, messages, totalCost, totalTokens, time: new Date().toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'}), date: new Date().toLocaleDateString('en-GB', {day:'numeric',month:'short'}) });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 50)));
    } catch(e) {}
    return;
  }
  
  try {
    await fetch('/api/save-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, messages, totalCost, totalTokens })
    });
  } catch(e) {
    console.warn('Failed to save chat:', e);
  }
}

// Load Q&A pairs from localStorage
function loadQAPairs() {
  try {
    const stored = localStorage.getItem(QA_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch(e) {
    console.warn('Failed to load Q&A pairs:', e);
    return [];
  }
}

// Save Q&A pairs to localStorage
function saveQAPairs(pairs) {
  try {
    localStorage.setItem(QA_STORAGE_KEY, JSON.stringify(pairs.slice(0, 200))); // Keep max 200 Q&As
  } catch(e) {
    console.warn('Failed to save Q&A pairs:', e);
  }
}

// Find similar questions in history
function findSimilarQuestion(question, threshold = 0.7) {
  const qaPairs = loadQAPairs();
  for (const qa of qaPairs) {
    const similarity = calculateSimilarity(question, qa.question);
    if (similarity >= threshold) {
      return { ...qa, similarity };
    }
  }
  return null;
}
// ─── PRICING ──────────────────────────────────────────────────────────────────
const MODELS = {
  "llama-3.3-70b-versatile": {name:"Llama 3.3 70B", priceIn:0.59, priceOut:0.79, maxTokens:8000},
  "openai/gpt-oss-120b": {name:"GPT OSS 120B", priceIn:0.59, priceOut:0.79, maxTokens:8000}
};
const calcCost = (i,o,model) => {
  const m = MODELS[model] || MODELS["llama-3.3-70b-versatile"];
  return (i/1e6)*m.priceIn + (o/1e6)*m.priceOut;
};

// ─── SCHEMA ONLY (sent to LLM — no data rows) ─────────────────────────────────
const SCHEMA = `
Database: KLARix Analytics (Brandscapes Worldwide)
Dialect: Standard SQL (AlaSQL)

TABLE products (
  product_id   VARCHAR  PRIMARY KEY,  -- e.g. "P001"
  name         VARCHAR,               -- e.g. "Sparkling Mango Burst"
  category     VARCHAR,               -- "Beverages" | "Dairy Alt" | "Nutrition" | "Energy"
  sub_category VARCHAR,
  price        DECIMAL,               -- selling price USD
  cost         DECIMAL,               -- COGS USD
  launch_year  INT
)

TABLE sales (
  sale_id    VARCHAR PRIMARY KEY,
  product_id VARCHAR,                 -- FK → products.product_id
  region     VARCHAR,                 -- "North" | "South" | "East" | "West"
  channel    VARCHAR,                 -- "Modern Trade" | "General Trade" | "E-Commerce"
  month      VARCHAR,                 -- "Jan"…"Dec"
  year       INT,
  units      INT,
  revenue    DECIMAL                  -- USD
)

TABLE customers (
  customer_id      VARCHAR PRIMARY KEY,
  name             VARCHAR,
  region           VARCHAR,
  tier             VARCHAR,           -- "Premium" | "Gold" | "Standard"
  annual_spend     DECIMAL,
  acquisition_year INT
)

TABLE market_share (
  brand      VARCHAR,
  category   VARCHAR,
  region     VARCHAR,
  quarter    VARCHAR,                 -- "Q1 2024" | "Q2 2024"
  share_pct  DECIMAL                  -- percentage 0–100
)

NOTES:
- Always use table aliases for joins
- Use SUM(), AVG(), COUNT(), MAX(), MIN() for aggregations
- For revenue ranking use ORDER BY revenue DESC
- Return max 20 rows unless user asks for all
- Prefer INNER JOIN over cross joins
- All string comparisons are case-sensitive
`.trim();

// ─── IN-BROWSER DATABASE (AlaSQL) ─────────────────────────────────────────────
// This simulates your real backend DB. In production: replace executeSQL()
// with a fetch() call to your API endpoint that runs queries on PostgreSQL/BigQuery.
const DB_ROWS = {
  products: [
    {product_id:"P001",name:"Sparkling Mango Burst",category:"Beverages",sub_category:"Sparkling",price:2.5,cost:0.9,launch_year:2021},
    {product_id:"P002",name:"Classic Cola Zero",category:"Beverages",sub_category:"Cola",price:1.8,cost:0.6,launch_year:2019},
    {product_id:"P003",name:"Oat Milk Latte",category:"Dairy Alt",sub_category:"RTD Coffee",price:3.5,cost:1.4,launch_year:2022},
    {product_id:"P004",name:"Green Tea Zen",category:"Beverages",sub_category:"Tea",price:2.2,cost:0.8,launch_year:2020},
    {product_id:"P005",name:"Tropical Punch",category:"Beverages",sub_category:"Juice",price:1.9,cost:0.7,launch_year:2018},
    {product_id:"P006",name:"Protein Shake Vanilla",category:"Nutrition",sub_category:"Protein",price:4.5,cost:1.8,launch_year:2021},
    {product_id:"P007",name:"Coconut Water Pure",category:"Beverages",sub_category:"Coconut",price:2.8,cost:1.0,launch_year:2020},
    {product_id:"P008",name:"Energy Blast Red",category:"Energy",sub_category:"Energy Drink",price:3.2,cost:1.1,launch_year:2022},
  ],
  sales: [
    {sale_id:"S001",product_id:"P001",region:"North",channel:"Modern Trade",month:"Jan",year:2024,units:12400,revenue:31000},
    {sale_id:"S002",product_id:"P002",region:"South",channel:"General Trade",month:"Jan",year:2024,units:18900,revenue:34020},
    {sale_id:"S003",product_id:"P003",region:"West",channel:"E-Commerce",month:"Jan",year:2024,units:5600,revenue:19600},
    {sale_id:"S004",product_id:"P001",region:"East",channel:"Modern Trade",month:"Feb",year:2024,units:14200,revenue:35500},
    {sale_id:"S005",product_id:"P004",region:"North",channel:"General Trade",month:"Feb",year:2024,units:9800,revenue:21560},
    {sale_id:"S006",product_id:"P005",region:"South",channel:"Modern Trade",month:"Feb",year:2024,units:22100,revenue:41990},
    {sale_id:"S007",product_id:"P006",region:"West",channel:"E-Commerce",month:"Mar",year:2024,units:3200,revenue:14400},
    {sale_id:"S008",product_id:"P007",region:"East",channel:"Modern Trade",month:"Mar",year:2024,units:8700,revenue:24360},
    {sale_id:"S009",product_id:"P008",region:"North",channel:"E-Commerce",month:"Mar",year:2024,units:6500,revenue:20800},
    {sale_id:"S010",product_id:"P002",region:"West",channel:"General Trade",month:"Apr",year:2024,units:21300,revenue:38340},
    {sale_id:"S011",product_id:"P003",region:"South",channel:"E-Commerce",month:"Apr",year:2024,units:7100,revenue:24850},
    {sale_id:"S012",product_id:"P001",region:"North",channel:"Modern Trade",month:"Apr",year:2024,units:16800,revenue:42000},
    {sale_id:"S013",product_id:"P005",region:"East",channel:"General Trade",month:"May",year:2024,units:19200,revenue:36480},
    {sale_id:"S014",product_id:"P006",region:"North",channel:"Modern Trade",month:"May",year:2024,units:4400,revenue:19800},
    {sale_id:"S015",product_id:"P008",region:"South",channel:"E-Commerce",month:"Jun",year:2024,units:8900,revenue:28480},
    {sale_id:"S016",product_id:"P004",region:"West",channel:"Modern Trade",month:"Jun",year:2024,units:11200,revenue:24640},
    {sale_id:"S017",product_id:"P007",region:"South",channel:"General Trade",month:"Jun",year:2024,units:13400,revenue:37520},
    {sale_id:"S018",product_id:"P002",region:"East",channel:"Modern Trade",month:"Jun",year:2024,units:17600,revenue:31680},
  ],
  customers: [
    {customer_id:"C001",name:"Metro Hypermart",region:"North",tier:"Premium",annual_spend:480000,acquisition_year:2018},
    {customer_id:"C002",name:"QuickShop Chain",region:"South",tier:"Standard",annual_spend:210000,acquisition_year:2020},
    {customer_id:"C003",name:"FreshMart Online",region:"West",tier:"Premium",annual_spend:390000,acquisition_year:2019},
    {customer_id:"C004",name:"Sunrise Grocers",region:"East",tier:"Standard",annual_spend:145000,acquisition_year:2021},
    {customer_id:"C005",name:"Urban Express",region:"North",tier:"Gold",annual_spend:310000,acquisition_year:2019},
    {customer_id:"C006",name:"ValueMart",region:"South",tier:"Standard",annual_spend:175000,acquisition_year:2022},
    {customer_id:"C007",name:"PremiumPick",region:"West",tier:"Gold",annual_spend:265000,acquisition_year:2020},
    {customer_id:"C008",name:"EasyBuy Stores",region:"East",tier:"Premium",annual_spend:420000,acquisition_year:2017},
    {customer_id:"C009",name:"Global Mart",region:"West",tier:"Gold",annual_spend:285000,acquisition_year:2023},
  ],
  market_share: [
    {brand:"KLARix Portfolio",category:"Beverages",region:"North",quarter:"Q1 2024",share_pct:18.4},
    {brand:"Competitor A",category:"Beverages",region:"North",quarter:"Q1 2024",share_pct:24.1},
    {brand:"Competitor B",category:"Beverages",region:"North",quarter:"Q1 2024",share_pct:15.7},
    {brand:"KLARix Portfolio",category:"Beverages",region:"South",quarter:"Q1 2024",share_pct:22.6},
    {brand:"Competitor A",category:"Beverages",region:"South",quarter:"Q1 2024",share_pct:19.3},
    {brand:"KLARix Portfolio",category:"Energy",region:"North",quarter:"Q1 2024",share_pct:11.2},
    {brand:"Competitor C",category:"Energy",region:"North",quarter:"Q1 2024",share_pct:38.5},
    {brand:"KLARix Portfolio",category:"Nutrition",region:"West",quarter:"Q1 2024",share_pct:9.8},
    {brand:"KLARix Portfolio",category:"Beverages",region:"North",quarter:"Q2 2024",share_pct:19.8},
    {brand:"Competitor A",category:"Beverages",region:"North",quarter:"Q2 2024",share_pct:22.9},
  ],
};

// Load AlaSQL and seed tables
let alaSQLReady = false;
async function initDB() {
  if (alaSQLReady) return;
  await new Promise((res,rej) => {
    if (window.alasql) { res(); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/alasql/4.1.6/alasql.min.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  const a = window.alasql;
  // Create & seed tables
  for (const [tbl, rows] of Object.entries(DB_ROWS)) {
    try { a(`DROP TABLE IF EXISTS ${tbl}`); } catch(e) {}
    a(`CREATE TABLE ${tbl}`);
    a(`INSERT INTO ${tbl} SELECT * FROM ?`, [rows]);
  }
  alaSQLReady = true;
}

async function executeSQL(sql) {
  // Use Neon PostgreSQL via API endpoint
  const USE_POSTGRES = import.meta.env.VITE_USE_POSTGRES === 'true';
  
  console.log('USE_POSTGRES:', USE_POSTGRES, 'VITE_USE_POSTGRES:', import.meta.env.VITE_USE_POSTGRES);
  
  if (USE_POSTGRES) {
    console.log('Using PostgreSQL API');
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ sql })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Query failed");
      console.log('PostgreSQL result:', data);
      return data;
    } catch(e) {
      console.error('PostgreSQL error:', e);
      throw Object.assign(new Error(e.message), { sql });
    }
  }
  
  console.log('Using AlaSQL fallback');
  // Fallback: AlaSQL (in-browser)
  let rows;
  try {
    rows = window.alasql(sql);
  } catch(e) {
    const raw = e == null ? "Unknown AlaSQL error" : (e.message || String(e) || "AlaSQL internal error");
    const msg = raw.split("\n")[0].slice(0, 200);
    throw Object.assign(new Error(msg), { sql });
  }
  if (!rows || !Array.isArray(rows)) {
    throw Object.assign(new Error("Query returned no results (AlaSQL returned non-array)"), { sql });
  }
  if (rows.length === 0) return { rows: [], headers: [] };
  const headers = Object.keys(rows[0]);
  return { rows: rows.map(r => headers.map(h => r[h] ?? null)), headers };
}

// ─── LLM RETRY: ask LLM to fix a failing SQL ─────────────────────────────────
async function fixSQL(question, badSQL, errorMsg, model) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${import.meta.env.VITE_GROQ_API_KEY}`},
    body: JSON.stringify({
      model, max_tokens:600,
      messages:[{role:"system",content:`You are a SQL expert. A query for AlaSQL failed. Rewrite it using ONLY simple patterns.

SCHEMA:
${SCHEMA}

ALASQL HARD LIMITS (any of these will crash it):
- NO window functions (OVER, PARTITION BY, LAG, LEAD, RANK, ROW_NUMBER etc)
- NO CTEs (WITH ... AS)
- NO subqueries in FROM clause — no nested SELECTs at all
- NO ORDER BY aliases — repeat the full expression
- NO HAVING aliases — repeat the full expression
- NO FULL OUTER JOIN
- NO CASE inside aggregates
- Subqueries in WHERE are unreliable — avoid them
- Complex multi-table self-joins often crash — keep joins simple

SIMPLIFICATION STRATEGY for complex questions:
- For growth/change questions: just show totals grouped by the dimensions, skip the YoY diff calculation
- For ranking: just ORDER BY SUM(col) DESC LIMIT 5
- If the question truly requires features AlaSQL can't support, return the closest approximation that WILL work

Return ONLY JSON: {"sql":"SELECT ...","intent":"what this simplified query does","followups":["Q1?","Q2?","Q3?"]}`},{role:"user", content:`Original question: "${question}"\n\nFailed SQL:\n${badSQL}\n\nError: ${errorMsg}\n\nPlease rewrite as a simpler query that AlaSQL can handle.`}],
    }),
  });
  const data = await res.json();
  const raw = (data.choices?.[0]?.message?.content || "{}").replace(/```json|```/g,"").trim();
  const parsed = JSON.parse(raw);
  return {
    sql: parsed.sql,
    intent: parsed.intent + " (simplified)",
    followups: Array.isArray(parsed.followups) ? parsed.followups : [],
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
  };
}

// ─── LLM: schema-only call → returns SQL ─────────────────────────────────────
async function askLLM(question, model, retryCount = 0) {
  // Client-side filter for obvious non-data inputs
  const lowerQ = question.toLowerCase().trim();
  const greetings = ['hi','hello','hey','good morning','good evening','good afternoon','greetings','howdy','sup','yo'];
  const social = ['how are you','whats up','what\'s up','thank you','thanks','bye','goodbye','see you'];
  const aboutBot = ['who are you','what can you do','help me','introduce yourself','what are you','your name'];
  
  const isNonData = greetings.some(g => lowerQ === g || lowerQ.startsWith(g + ' ') || lowerQ.endsWith(' ' + g)) ||
                    social.some(s => lowerQ.includes(s)) ||
                    aboutBot.some(a => lowerQ.includes(a));
  
  if (isNonData) {
    return {
      sql: null,
      intent: "Not a data question",
      answer: "Hello! I'm KLARix, your AI data analyst. I can help you analyze data from our database. Try asking about products, sales, customers, or market share.",
      insight: "",
      followups: ["What are the top 5 products by revenue?","Show me sales by region and channel","Which customers are Premium tier?"],
      inputTokens: 0,
      outputTokens: 0,
    };
  }
  
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${import.meta.env.VITE_GROQ_API_KEY}`},
      body: JSON.stringify({
        model, max_tokens:600,
        messages:[{role:"system",content:`CRITICAL INSTRUCTION: First, determine if the user's input is a DATA QUESTION or NON-DATA INPUT.

NON-DATA INPUTS (you MUST return sql:null):
- Greetings: hi, hello, hey, good morning, good evening, etc.
- Social: how are you, what's up, thank you, thanks, bye, goodbye
- About you: who are you, what can you do, help, introduce yourself
- Irrelevant: weather, sports, news, jokes, personal topics
- Anything NOT about: products, sales, customers, market_share tables

For NON-DATA inputs, return EXACTLY:
{"sql":null,"intent":"Not a data question","answer":"Hello! I'm KLARix, your AI data analyst. I can help you analyze data from our database. Try asking: 'What are the top products by revenue?' or 'Show me sales by region.'","insight":"","followups":["What are the top 5 products by revenue?","Show me sales by region and channel","Which customers are Premium tier?"]}

ONLY if the question is about products, sales, customers, or market_share data, then generate SQL.

SCHEMA:
${SCHEMA}

ALASQL STRICT LIMITATIONS — these will cause errors, NEVER use them:
- NO window functions: LAG, LEAD, ROW_NUMBER, RANK, DENSE_RANK, NTILE, FIRST_VALUE, LAST_VALUE, OVER, PARTITION BY
- NO CTEs: WITH ... AS (...)
- NO HAVING with aliases — repeat the full expression e.g. HAVING SUM(units) > 1000
- NO FULL OUTER JOIN
- NO CASE inside aggregate functions
- NO ORDER BY using SELECT aliases — ALWAYS repeat the full expression
  WRONG:  SELECT category, SUM(units) AS total_units ... ORDER BY total_units DESC
  CORRECT: SELECT category, SUM(units) AS total_units ... ORDER BY SUM(units) DESC
- When JOINing, only GROUP BY columns that appear in the SELECT list

For year-over-year comparisons: use a self-join, never window functions.
  SELECT a.channel, a.year, SUM(a.revenue) AS revenue, SUM(b.revenue) AS prev_year
  FROM sales a LEFT JOIN sales b ON a.channel = b.channel AND b.year = a.year - 1
  GROUP BY a.channel, a.year ORDER BY a.year, SUM(a.revenue) DESC

RULES:
- Return ONLY a JSON object, no markdown, no explanation
- Format: {"sql":"SELECT ...","intent":"one-sentence description","answer":"2-sentence direct answer referencing specific numbers from the result","insight":"1 actionable business recommendation based on the data","followups":["Q1?","Q2?","Q3?"]}
- followups: exactly 3 smart follow-up questions a business analyst would ask next
- Never use SELECT * — always name columns explicitly
- Use aliases (e.g. SUM(units) AS total_units) but NEVER reference them in ORDER BY or HAVING
- Limit to 20 rows max unless user asks for all
- answer: state the key finding with actual numbers (e.g. "Product X generated $108,500...")
- insight: give a business action (e.g. "Consider expanding...")
- If ambiguous, make the most useful interpretation`},{role:"user", content:question}],
      }),
    });
    const data = await res.json();
    const raw = (data.choices?.[0]?.message?.content || "{}").replace(/```json|```/g,"").trim();
    const parsed = JSON.parse(raw);
    return {
      sql: parsed.sql,
      intent: parsed.intent,
      answer: parsed.answer || "",
      insight: parsed.insight || "",
      followups: Array.isArray(parsed.followups) ? parsed.followups : [],
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    };
  } catch(e) {
    // Retry up to 2 times for JSON parsing errors or API failures
    if (retryCount < 2 && (e.message.includes('JSON') || e.message.includes('fetch'))) {
      console.warn(`LLM call failed (attempt ${retryCount + 1}), retrying:`, e.message);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      return askLLM(question, model, retryCount + 1);
    }
    throw e;
  }
}

// ─── SUGGESTIONS ─────────────────────────────────────────────────────────────
const SUGGESTIONS = [
  "Top 5 products by total revenue",
  "Revenue by region and channel",
  "Which customers are Premium tier?",
  "Compare our market share vs competitors",
  "Total units sold per category",
  "Profit margin by product",
];

// ─── PIPELINE STEPS ──────────────────────────────────────────────────────────
const STEPS = ["Question", "Schema → LLM", "SQL Generated", "DB Executes", "Result"];

// ─── SCRIPT LOADER ───────────────────────────────────────────────────────────
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement("script");
    s.src = src; s.onload = res;
    s.onerror = () => rej(new Error(`Failed to load: ${src}`));
    document.head.appendChild(s);
  });
}

// ─── CHART → PNG DATA URL ────────────────────────────────────────────────────
// Renders the same SVG logic as MiniChart onto an offscreen canvas → PNG base64
// Draw chart directly on Canvas 2D — no SVG, no Blob URLs, works in any sandboxed iframe
function chartToPNG(rows, headers, numCol, isTimeSeries, opts={}) {
  try {
    const nc = numCol ?? 1;
    const vals = rows.map(r => { const v = parseFloat(r[nc]); return isNaN(v) ? 0 : v; });
    const mx = Math.max(...vals, 1);
    const fmt = v => v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1000?`${(v/1000).toFixed(1)}k`:Number.isInteger(v)?String(v):v.toFixed(1);

    const S = 2; // retina scale
    const CW = opts.width  || 800;
    const CH = opts.height || 280;
    const PAD_L=64, PAD_B=38, PAD_T=28, PAD_R=20;
    const chartW = CW - PAD_L - PAD_R;
    const chartH = CH - PAD_B - PAD_T;

    // Pure color helpers (no alpha in hex — use rgba strings for transparency)
    const BG       = "#111827";
    const GRID     = "#1e2d42";
    const AXIS     = "#2d3f58";
    const BAR      = "#4f8ef7";
    const BAR_LITE = "rgba(79,142,247,0.18)";
    const LINE_CLR = "#4f8ef7";
    const AREA_CLR = "rgba(79,142,247,0.13)";
    const DOT_CLR  = "#10d9a0";
    const TXT      = "#6b7280";
    const LABEL    = "#94a3b8";
    const VAL_CLR  = "#93c5fd";
    const TITLE_C  = "#4b5563";

    const canvas = document.createElement('canvas');
    canvas.width  = CW * S;
    canvas.height = CH * S;
    const ctx = canvas.getContext('2d');
    ctx.scale(S, S);

    const toY = v => PAD_T + chartH - Math.max(1, (v / mx) * chartH);
    const toX = i => PAD_L + (chartW / rows.length) * (i + 0.5);
    const barW = Math.max(10, Math.floor((chartW / rows.length) * 0.58));

    // ── Background ──
    ctx.fillStyle = BG;
    ctx.beginPath();
    ctx.roundRect(0, 0, CW, CH, 8);
    ctx.fill();

    // ── Title ──
    ctx.fillStyle = TITLE_C;
    ctx.font = `bold ${S===2?9:10}px sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(`${String(headers[nc]).toUpperCase()} BY ${String(headers[0]).toUpperCase()}`, PAD_L, 17);

    // ── Y-axis gridlines + labels ──
    [0, 0.25, 0.5, 0.75, 1].forEach(pct => {
      const y = PAD_T + chartH * (1 - pct);
      const yv = mx * pct;
      ctx.beginPath();
      ctx.strokeStyle = pct === 0 ? AXIS : GRID;
      ctx.lineWidth = pct === 0 ? 1.5 : 0.7;
      ctx.moveTo(PAD_L, y); ctx.lineTo(CW - PAD_R, y);
      ctx.stroke();
      ctx.fillStyle = TXT;
      ctx.font = "9px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(fmt(yv), PAD_L - 5, y + 3.5);
    });

    if (isTimeSeries) {
      // ── Area fill ──
      ctx.beginPath();
      ctx.moveTo(toX(0), PAD_T + chartH);
      vals.forEach((v, i) => ctx.lineTo(toX(i), toY(v)));
      ctx.lineTo(toX(vals.length - 1), PAD_T + chartH);
      ctx.closePath();
      ctx.fillStyle = AREA_CLR;
      ctx.fill();

      // ── Line ──
      ctx.beginPath();
      ctx.strokeStyle = LINE_CLR;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      vals.forEach((v, i) => i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v)));
      ctx.stroke();

      // ── Dots + value labels ──
      vals.forEach((v, i) => {
        const cx = toX(i), cy = toY(v);
        // outer ring
        ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI*2);
        ctx.fillStyle = "rgba(16,217,160,0.2)"; ctx.fill();
        // dot
        ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI*2);
        ctx.fillStyle = DOT_CLR; ctx.fill();
        ctx.strokeStyle = BG; ctx.lineWidth = 1.5; ctx.stroke();
        // value
        ctx.fillStyle = VAL_CLR;
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(fmt(v), cx, cy - 10);
      });
    } else {
      // ── Bars ──
      vals.forEach((v, i) => {
        const cx = toX(i);
        const bh = Math.max(2, (v / mx) * chartH);
        const by = PAD_T + chartH - bh;
        const bx = cx - barW / 2;

        // ghost track (full height)
        ctx.fillStyle = BAR_LITE;
        ctx.beginPath();
        ctx.roundRect(bx, PAD_T, barW, chartH, 3);
        ctx.fill();

        // main bar
        ctx.fillStyle = BAR;
        ctx.globalAlpha = 0.88;
        ctx.beginPath();
        ctx.roundRect(bx, by, barW, bh, [3, 3, 0, 0]);
        ctx.fill();
        ctx.globalAlpha = 1;

        // top accent cap
        ctx.fillStyle = "#7ab3f8";
        ctx.beginPath();
        ctx.roundRect(bx, by, barW, 3, 2);
        ctx.fill();

        // value label above bar
        ctx.fillStyle = VAL_CLR;
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(fmt(v), cx, by - 5);
      });
    }

    // ── X-axis labels ──
    ctx.fillStyle = LABEL;
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    rows.forEach((r, i) => {
      const label = String(r[0]).slice(0, rows.length > 8 ? 7 : 12);
      ctx.fillText(label, toX(i), CH - 8);
    });

    return Promise.resolve(canvas.toDataURL('image/png'));
  } catch(e) {
    console.warn("chartToPNG failed:", e);
    return Promise.resolve(null);
  }
}

// Helper: detect numeric column index
function getNumColIdx(result) {
  if (!result?.headers?.length || !result?.rows?.length) return -1;
  const sample = result.rows.slice(0,5);
  for (let j=1; j<result.headers.length; j++) {
    if (sample.some(r => r[j]!=null && !isNaN(parseFloat(r[j])))) return j;
  }
  return -1;
}

// ─── PDF EXPORT ───────────────────────────────────────────────────────────────
async function exportPDF(pairs) {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:"landscape", unit:"pt", format:"a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const now = new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
  let pageNum = 1;

  const drawHeader = (qNum, question) => {
    // Navy header bar
    doc.setFillColor(13,17,23); doc.rect(0,0,W,56,"F");
    doc.setFillColor(79,142,247); doc.rect(0,54,W,3,"F");
    // Q badge
    doc.setFillColor(30,58,95); doc.roundedRect(20,12,32,32,4,4,"F");
    doc.setFillColor(79,142,247); doc.roundedRect(20,12,32,32,4,4,"S");
    doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(255,255,255);
    doc.text(`Q${qNum}`,36,33,{align:"center"});
    // Question text
    const qLines = doc.splitTextToSize(question, W-90);
    doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(232,240,254);
    doc.text(qLines[0], 62, 34);
    // Page info
    doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(61,84,112);
    doc.text(`KLARIX · BRANDSCAPES WORLDWIDE · ${now} · Page ${pageNum}`, W-20, 14, {align:"right"});
  };

  const drawFooter = (p) => {
    doc.setFillColor(10,14,21); doc.rect(0,H-22,W,22,"F");
    doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(61,84,112);
    if (p.cost!=null) {
      doc.text(`Schema ↑${p.inputTokens?.toLocaleString()} tokens · SQL ↓${p.outputTokens?.toLocaleString()} tokens · $${p.cost.toFixed(5)} · DATA NEVER SENT TO LLM`, 20, H-8);
    }
  };

  // Pre-render all charts first
  const chartPNGs = await Promise.all(pairs.map(async p => {
    const nc = getNumColIdx(p.result);
    if (nc < 0 || !p.result?.rows?.length) return null;
    const isTS = /month|year|quarter|date|period/i.test(p.result.headers[0]||'');
    return chartToPNG(p.result.rows.slice(0,10), p.result.headers, nc, isTS, {width:760, height:240, dark:true});
  }));

  // ── COVER PAGE ────────────────────────────────────────────────────────────
  // Full dark navy background
  doc.setFillColor(10,15,30); doc.rect(0,0,W,H,"F");

  // Decorative circles (top-right, partially clipped) — match PPTX
  doc.setFillColor(13,32,53);  doc.circle(W-60, 95, 145, "F");
  doc.setFillColor(11,26,44);  doc.circle(W-60, 95, 105, "F");
  doc.setFillColor(10,22,38);  doc.circle(W-60, 95,  68, "F");

  // Teal top accent bar
  doc.setFillColor(16,217,160); doc.rect(0,0,W,5,"F");

  // BRANDSCAPES WORLDWIDE label
  doc.setFont("helvetica","normal"); doc.setFontSize(9);
  doc.setTextColor(74,122,155);
  doc.setCharSpace(4);
  doc.text("BRANDSCAPES  WORLDWIDE", 38, 115);
  doc.setCharSpace(0);

  // Main title
  doc.setFont("helvetica","bold"); doc.setFontSize(46);
  doc.setTextColor(255,255,255);
  doc.text("KLARix Insights Report", 38, 168);

  // Teal subtitle: count + date
  doc.setFont("helvetica","normal"); doc.setFontSize(18);
  doc.setTextColor(16,217,160);
  doc.text(`${pairs.length} Selected Quer${pairs.length!==1?"ies":"y"}  ·  ${now}`, 38, 210);

  // Gray meta line
  doc.setFont("helvetica","normal"); doc.setFontSize(10);
  doc.setTextColor(74,104,128);
  doc.text(`Generated ${now}  ·  Model: claude-sonnet-4  ·  Powered by KLARix AI`, 38, 238);

  // Jiffy J badge (teal square)
  doc.setFillColor(16,217,160);
  doc.roundedRect(38, H-100, 44, 44, 3, 3, "F");
  doc.setFont("helvetica","bold"); doc.setFontSize(22);
  doc.setTextColor(255,255,255);
  doc.text("K", 60, H-70, {align:"center"});

  // "JIFFY · AI DATA ANALYST" beside badge
  doc.setFont("helvetica","normal"); doc.setFontSize(10);
  doc.setTextColor(58,96,112);
  doc.setCharSpace(3);
  doc.text("KLARIX  ·  AI DATA ANALYST", 92, H-72);
  doc.setCharSpace(0);

  // Dark footer strip
  doc.setFillColor(10,14,21); doc.rect(0,H-22,W,22,"F");
  doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(45,74,96);
  doc.setCharSpace(1.5);
  doc.text("KLARIX  ·  BRANDSCAPES WORLDWIDE  ·  AI-DRIVEN DATA INSIGHTS", W/2, H-8, {align:"center"});
  doc.setCharSpace(0);

  // ── Q&A PAGES ─────────────────────────────────────────────────────────────
  // One page per Q&A
  for (let idx=0; idx<pairs.length; idx++) {
    const p = pairs[idx];
    const chartPng = chartPNGs[idx];
    doc.addPage(); pageNum++;

    drawHeader(idx+1, p.question);

    const hasTable = p.result?.headers?.length > 0 && p.result?.rows?.length > 0;
    const hasChart = !!chartPng;

    // Layout constants — mirrors PPTX: left card (answer+insight+chart), right table
    const MARGIN = 18, TOP = 64, BOTTOM = H - 26;
    const GAP = 12;
    const leftW = (W - MARGIN*2 - GAP) * 0.565;
    const rightX = MARGIN + leftW + GAP;
    const rightW = W - rightX - MARGIN;

    // ── Left card background ──
    doc.setFillColor(244,247,251);
    doc.roundedRect(MARGIN, TOP, leftW, BOTTOM-TOP, 4, 4, "F");
    doc.setDrawColor(226,232,240); doc.setLineWidth(0.5);
    doc.roundedRect(MARGIN, TOP, leftW, BOTTOM-TOP, 4, 4, "S");

    let ly = TOP + 10;

    // ── Answer text ──
    const answerText = p.answer || p.intent || "";
    if (answerText) {
      doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(30,41,59);
      const aLines = doc.splitTextToSize(answerText, leftW-16);
      doc.text(aLines.slice(0,3), MARGIN+8, ly+9);
      ly += Math.min(aLines.length,3)*13 + 6;
    }

    // ── Insight box ──
    if (p.insight) {
      const insH = 38;
      doc.setFillColor(232,244,254);
      doc.roundedRect(MARGIN+6, ly, leftW-12, insH, 3, 3, "F");
      doc.setDrawColor(197,221,239); doc.setLineWidth(0.4);
      doc.roundedRect(MARGIN+6, ly, leftW-12, insH, 3, 3, "S");
      doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(16,217,160);
      doc.text("INSIGHT", MARGIN+12, ly+9);
      doc.setFont("helvetica","italic"); doc.setFontSize(8.5); doc.setTextColor(51,78,104);
      const insLines = doc.splitTextToSize(p.insight, leftW-22);
      doc.text(insLines.slice(0,2), MARGIN+12, ly+19);
      ly += insH + 6;
    }

    // ── Chart image ──
    if (hasChart) {
      const chartH = BOTTOM - ly - 4;
      if (chartH > 50) {
        doc.addImage(chartPng, "PNG", MARGIN+4, ly, leftW-8, chartH);
      }
    }

    // ── Right: Table ──
    if (hasTable) {
      const tbl = p.result;
      const maxRows = 14;
      const cols = tbl.headers.length;
      const colW = rightW / cols;
      const rowH = 13;
      let ry = TOP;

      // Header row
      doc.setFillColor(13,17,23);
      doc.rect(rightX, ry, rightW, 16, "F");
      doc.setFont("helvetica","bold"); doc.setFontSize(7.5); doc.setTextColor(16,217,160);
      tbl.headers.forEach((h,i) => {
        doc.text(String(h).toUpperCase().replace(/_/g,' ').slice(0,14), rightX+6+i*colW, ry+11);
      });
      ry += 16;

      // Data rows
      tbl.rows.slice(0,maxRows).forEach((row,ri) => {
        const even = ri%2===0;
        doc.setFillColor(even?255:248, even?255:250, even?255:252);
        doc.rect(rightX, ry, rightW, rowH, "F");
        doc.setDrawColor(226,232,240); doc.setLineWidth(0.3);
        doc.line(rightX, ry+rowH, rightX+rightW, ry+rowH);
        doc.setFont("helvetica","normal"); doc.setFontSize(8.5); doc.setTextColor(30,41,59);
        row.forEach((c,i) => {
          doc.text(String(c??"-").slice(0,18), rightX+6+i*colW, ry+9);
        });
        ry += rowH;
      });

      if (tbl.rows.length > maxRows) {
        doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(148,163,184);
        doc.text(`+ ${tbl.rows.length-maxRows} more rows`, rightX+rightW-6, ry+9, {align:"right"});
      }
    }

    drawFooter(p);
  }

  // Use blob + <a> click — same approach as pptxgenjs, works in sandboxed iframes
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `klarix-report-${Date.now()}.pdf`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 2000);
}

// ─── PPTX EXPORT ─────────────────────────────────────────────────────────────
async function exportPPTX(pairs) {
  await loadScript("https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js");
  const pptx = new window.PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.title = "KLARix Insights Report";
  const W = 13.3, H = 7.5;
  const now = new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});

  // ── COVER SLIDE ────────────────────────────────────────────────────────────
  const cover = pptx.addSlide();
  cover.background = { color: "0A0F1E" };

  // Teal top accent bar
  cover.addShape(pptx.shapes.RECTANGLE, { x:0, y:0, w:W, h:0.07, fill:{color:"10D9A0"}, line:{color:"10D9A0"} });

  // Decorative circles (right side, partially off-slide)
  cover.addShape(pptx.shapes.OVAL, { x:8.6, y:0.2, w:5.4, h:5.4, fill:{color:"0D2035"}, line:{color:"0F2840", pt:1} });
  cover.addShape(pptx.shapes.OVAL, { x:9.4, y:0.9, w:3.9, h:3.9, fill:{color:"0B1A2C"}, line:{color:"0D2235", pt:1} });

  // Brandscapes label
  cover.addText("BRANDSCAPES  WORLDWIDE", { x:0.5, y:1.7, w:7, h:0.35, fontSize:10, color:"4A7A9B", charSpacing:4, fontFace:"Calibri" });

  // Main title
  cover.addText("KLARix Insights Report", { x:0.5, y:2.15, w:8.5, h:1.1, fontSize:48, bold:true, color:"FFFFFF", fontFace:"Calibri" });

  // Subtitle
  cover.addText(`${pairs.length} Selected Quer${pairs.length!==1?"ies":"y"}  ·  ${now}`, { x:0.5, y:3.35, w:8, h:0.5, fontSize:18, color:"10D9A0", fontFace:"Calibri" });

  // Meta line
  cover.addText(`Generated ${now}  ·  Model: claude-sonnet-4  ·  Powered by KLARix AI`, { x:0.5, y:3.95, w:8, h:0.35, fontSize:11, color:"4A6880", fontFace:"Calibri" });

  // Jiffy J badge + text (bottom left)
  cover.addShape(pptx.shapes.RECTANGLE, { x:0.5, y:5.65, w:0.7, h:0.7, fill:{color:"10D9A0"}, line:{color:"10D9A0"} });
  cover.addText("K", { x:0.5, y:5.65, w:0.7, h:0.7, fontSize:24, bold:true, color:"FFFFFF", align:"center", valign:"middle", fontFace:"Calibri" });
  cover.addText("KLARIX  ·  AI DATA ANALYST", { x:1.35, y:5.8, w:4, h:0.4, fontSize:11, color:"3A6070", charSpacing:3, fontFace:"Calibri", valign:"middle" });

  // ── Q&A SLIDES ─────────────────────────────────────────────────────────────
  for (let idx = 0; idx < pairs.length; idx++) {
    const p = pairs[idx];
    const sl = pptx.addSlide();
    sl.background = { color: "FFFFFF" };

    // ── Layout constants (declare first, used everywhere) ──
    const CARD_X = 0.25, CARD_Y = 1.02;
    const LEFT_W = 7.5,  LEFT_H = 5.5;
    const TABLE_X = 8.05, TABLE_Y = 1.02;
    const TABLE_W = W - TABLE_X - 0.25;
    const FOOTER_Y = 6.62;

    try {
      // ── Header bar ──
      sl.addShape(pptx.shapes.RECTANGLE, { x:0, y:0, w:W, h:0.88, fill:{color:"0D1117"}, line:{color:"0D1117"} });
      sl.addShape(pptx.shapes.RECTANGLE, { x:0, y:0.85, w:W, h:0.06, fill:{color:"10D9A0"}, line:{color:"10D9A0"} });

      // Q badge
      sl.addShape(pptx.shapes.RECTANGLE, { x:0.25, y:0.14, w:0.62, h:0.62, fill:{color:"10D9A0"}, line:{color:"10D9A0"} });
      sl.addText(`Q${idx+1}`, { x:0.25, y:0.14, w:0.62, h:0.62, fontSize:20, bold:true, color:"FFFFFF", align:"center", valign:"middle", fontFace:"Calibri" });

      // Question
      sl.addText(p.question, { x:1.05, y:0.1, w:W-1.5, h:0.68, fontSize:15, bold:true, color:"FFFFFF", valign:"middle", fontFace:"Calibri", wrap:true });

      // Brand + date
      sl.addText(`BRANDSCAPES WORLDWIDE  ·  ${now}`, { x:W-4.5, y:0.06, w:4.2, h:0.25, fontSize:8, color:"3D5470", align:"right", fontFace:"Calibri" });

      // ── Left card background ──
      sl.addShape(pptx.shapes.RECTANGLE, { x:CARD_X, y:CARD_Y, w:LEFT_W, h:LEFT_H, fill:{color:"F4F7FB"}, line:{color:"E2E8F0", pt:1} });
    } catch(e) { console.warn("Header err slide",idx,e); }

    // ── Answer text ──
    const answerText = p.answer || p.intent || "";
    try {
      if (answerText) {
        sl.addText(answerText, {
          x: CARD_X+0.2, y: CARD_Y+0.15, w: LEFT_W-0.4, h: 0.7,
          fontSize:11, color:"1E293B", fontFace:"Calibri", wrap:true, valign:"top"
        });
      }
    } catch(e) { console.warn("Answer err",e); }

    // ── Insight box ──
    const insightText = p.insight || "";
    const INS_Y = CARD_Y + 0.95;
    try {
      if (insightText) {
        sl.addShape(pptx.shapes.RECTANGLE, { x:CARD_X+0.2, y:INS_Y, w:LEFT_W-0.4, h:0.82, fill:{color:"E8F4FE"}, line:{color:"C5DDEF", pt:1} });
        sl.addText("INSIGHT", { x:CARD_X+0.32, y:INS_Y+0.08, w:1.2, h:0.2, fontSize:7.5, bold:true, color:"10D9A0", charSpacing:2, fontFace:"Calibri" });
        sl.addText(insightText, { x:CARD_X+0.32, y:INS_Y+0.3, w:LEFT_W-0.64, h:0.46, fontSize:10, color:"334E68", fontFace:"Calibri", wrap:true, italic:true });
      }
    } catch(e) { console.warn("Insight err",e); }

    // ── Native bar chart ──
    try {
      const nc = getNumColIdx(p.result);
      if (nc >= 1 && p.result?.rows?.length > 0) {
        const chartRows = p.result.rows.slice(0, 10);
        const vals   = chartRows.map(r => { const v=parseFloat(r[nc]); return isNaN(v)?0:v; });
        const labels = chartRows.map(r => String(r[0]).slice(0, 16));
        const CHART_Y = insightText ? INS_Y + 0.9 : CARD_Y + 0.92;
        const CHART_H = (CARD_Y + LEFT_H) - CHART_Y - 0.1;
        const chartTitle = `${String(p.result.headers[nc]).replace(/_/g,' ')} by ${String(p.result.headers[0]).replace(/_/g,' ')}`;

        sl.addChart(pptx.charts.BAR, [
          { name: chartTitle, labels, values: vals }
        ], {
          x: CARD_X+0.1, y: CHART_Y, w: LEFT_W-0.2, h: Math.max(1.5, CHART_H),
          barDir:          "col",
          barGrouping:     "clustered",
          barGapWidthPct:  60,
          chartColors:     ["10D9A0","4F8EF7","059669","1D4ED8","F59E0B","EF4444","8B5CF6","F97316"],
          showLegend:      false,
          showTitle:       true,
          title:           chartTitle,
          titleFontSize:   11,
          titleColor:      "334E68",
          titleFontBold:   false,
          showValue:       true,
          dataLabelFontSize: 8,
          dataLabelColor:  "334E68",
          catAxisLabelColor:  "64748B",
          catAxisLabelFontSize: 9,
          catAxisLabelRotate: chartRows.length > 5 ? 315 : 0,
          valAxisLabelColor:  "94A3B8",
          valAxisLabelFontSize: 8,
          valAxisLineShow:    false,
          catGridLine:     { style:"none" },
          valGridLine:     { style:"solid", color:"E2E8F0", pt:0.5 },
          chartAreaFillColor:  "F4F7FB",
          plotAreaFillColor:   "F4F7FB",
          plotAreaBorderColor: "E2E8F0",
          plotAreaBorderPt:    0,
        });
      }
    } catch(e) { console.warn("Chart err slide",idx,e); }

    // ── Right: Data table ──
    try {
      if (p.result?.headers?.length > 0 && p.result?.rows?.length > 0) {
        const tbl = p.result;
        const maxRows = 12;
        const tableData = [
          tbl.headers.map(h => ({
            text: String(h).toUpperCase().replace(/_/g,' '),
            options: { bold:true, color:"10D9A0", fill:{color:"0D1117"}, fontSize:8, fontFace:"Calibri", valign:"middle", align:"left" }
          })),
          ...tbl.rows.slice(0, maxRows).map((row, ri) =>
            row.map(c => ({
              text: String(c ?? "-"),
              options: { color:"1E293B", fill:{color: ri%2===0?"FFFFFF":"F8FAFC"}, fontSize:9, fontFace:"Calibri", valign:"middle" }
            }))
          )
        ];
        sl.addTable(tableData, { x:TABLE_X, y:TABLE_Y, w:TABLE_W, rowH:0.38, border:{pt:0.5,color:"E2E8F0"}, autoPage:false });

        if (tbl.rows.length > maxRows) {
          sl.addText(`+ ${tbl.rows.length-maxRows} more rows`, {
            x:TABLE_X, y:TABLE_Y+LEFT_H-0.25, w:TABLE_W, h:0.22,
            fontSize:7.5, color:"94A3B8", align:"right", fontFace:"Calibri"
          });
        }
      }
    } catch(e) { console.warn("Table err slide",idx,e); }

    // ── Footer ──
    try {
      sl.addShape(pptx.shapes.RECTANGLE, { x:0, y:FOOTER_Y, w:W, h:H-FOOTER_Y, fill:{color:"0A0F1E"}, line:{color:"0A0F1E"} });
      sl.addText("KLARIX  ·  BRANDSCAPES WORLDWIDE  ·  AI-DRIVEN DATA INSIGHTS", {
        x:0.5, y:FOOTER_Y+0.07, w:W-2.5, h:0.28, fontSize:8, color:"2D4A60", charSpacing:1.5, fontFace:"Calibri"
      });
      sl.addText(`${idx+2} / ${pairs.length+1}`, {
        x:W-1.6, y:FOOTER_Y+0.07, w:1.3, h:0.28, fontSize:8.5, color:"3D5C70", align:"right", fontFace:"Calibri"
      });
    } catch(e) { console.warn("Footer err",e); }
  }

  await pptx.writeFile({ fileName: `klarix-insights-${Date.now()}.pptx` });
}


// ─── THEME ─────────────────────────────────────────────────────────────────
// DARK: deep navy base, strong whites, vivid blue/emerald accents
// LIGHT: pure white cards on warm slate, true-dark text, same accents
const mkT = d => d ? {
  bg:"#0d1117", bgSide:"#13191f", bgCard:"#1c2333",
  bgInput:"#161c28", bgHover:"#222d40", bgActive:"#1e3a5f",
  bgDeep:"#0a0e15", bgPill:"#0f1520",
  border:"#2a3548", borderSub:"#1c2638", borderAccent:"#4f8ef755",
  text:"#e8f0fe", textSub:"#b8cce8", textMuted:"#7a9abf",
  textFaint:"#3d5470", textCode:"#93c5fd",
  accent:"#4f8ef7", accentGlow:"#4f8ef730",
  accent2:"#10d9a0", accent2Glow:"#10d9a018",
  warn:"#fbbf24",
  userBg:"#1e3a5f", userText:"#ddeeff",
  aiBg:"#1c2333",
  scrollThumb:"#2a3548",
  sqlBg:"#090e18", sqlBorder:"#1e3050",
  tagBg:"#10d9a012", tagBorder:"#10d9a038",
  shadow:"0 4px 20px rgba(0,0,0,0.45)",
} : {
  bg:"#f1f5f9", bgSide:"#ffffff", bgCard:"#ffffff",
  bgInput:"#ffffff", bgHover:"#f8fafc", bgActive:"#eff6ff",
  bgDeep:"#f8fafc", bgPill:"#f1f5f9",
  border:"#e2e8f0", borderSub:"#f1f5f9", borderAccent:"#2563eb44",
  text:"#0f172a", textSub:"#1e293b", textMuted:"#475569",
  textFaint:"#94a3b8", textCode:"#1d4ed8",
  accent:"#2563eb", accentGlow:"#2563eb15",
  accent2:"#059669", accent2Glow:"#05966910",
  warn:"#d97706",
  userBg:"#1d4ed8", userText:"#ffffff",
  aiBg:"#ffffff",
  scrollThumb:"#cbd5e1",
  sqlBg:"#0f172a", sqlBorder:"#334155",
  tagBg:"#f0fdf4", tagBorder:"#6ee7b7",
  shadow:"0 2px 16px rgba(0,0,0,0.08)",
};

// ─── SIDE SECTION COMPONENT ──────────────────────────────────────────────────
function SideSection({ label, icon, collapsed, onToggle, T, children, last }) {
  return (
    <div style={{borderBottom: last ? "none" : `1px solid ${T.border}`, flexShrink:0}}>
      <button onClick={onToggle}
        style={{display:"flex",alignItems:"center",gap:7,width:"100%",padding:"10px 14px",background:"transparent",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
        <span style={{fontSize:11}}>{icon}</span>
        <span style={{fontSize:9,fontWeight:700,color:T.textFaint,letterSpacing:".13em",flex:1}}>{label}</span>
        <span style={{fontSize:10,color:T.textFaint,transition:"transform .2s",display:"inline-block",transform:collapsed?"rotate(-90deg)":"rotate(0deg)"}}>▾</span>
      </button>
      {!collapsed && (
        <div style={{padding:"0 10px 10px"}}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
const WELCOME_MSG = {role:"assistant",type:"welcome",content:"Hello! I'm **KLARix** — powered by **Text-to-SQL**. I only send your database *schema* to the AI, never the actual data rows. Fully scalable as your data grows."};

export default function App() {
  const [dark, setDark] = useState(true);
  const T = mkT(dark);
  const [messages, setMessages] = useState([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(null);
  const [totalCost, setTotalCost] = useState(0);
  const [totalTokens, setTotalTokens] = useState({in:0,out:0});
  const [dbReady, setDbReady] = useState(false);
  const USE_POSTGRES = import.meta.env.VITE_USE_POSTGRES === 'true';
  
  console.log('App USE_POSTGRES:', USE_POSTGRES, 'Raw value:', import.meta.env.VITE_USE_POSTGRES);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [exportLoading, setExportLoading] = useState(null);
  const [selectedModel, setSelectedModel] = useState("llama-3.3-70b-versatile");
  const [exportErr, setExportErr] = useState(null);
  const [activeTable, setActiveTable] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeHistoryId, setActiveHistoryId] = useState(null);
  
  // Load history on mount
  useEffect(() => {
    loadChatHistory().then(setHistory);
  }, []);  // which history item is loaded
  const [collapsed, setCollapsed] = useState({pipeline:false,db:false,tables:false,schema:true,cost:false,history:false});
  const [similarQuestion, setSimilarQuestion] = useState(null);
  const bottomRef = useRef(null);

  const toggleSection = key => setCollapsed(c=>({...c,[key]:!c[key]}));

  // Snapshot current conversation into history array; returns the snapshot entry or null
  const snapshotCurrent = (msgs, cost, tokens) => {
    const hasQA = msgs.some(m=>m.role==="user");
    if (!hasQA) return null;
    const firstQ = msgs.find(m=>m.role==="user")?.content || "Conversation";
    return {
      id: Date.now(),
      title: firstQ.length>50 ? firstQ.slice(0,50)+"…" : firstQ,
      messages: msgs,
      totalCost: cost,
      totalTokens: tokens,
      time: new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}),
      date: new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short"}),
    };
  };

  const startNewChat = async () => {
    const snap = snapshotCurrent(messages, totalCost, totalTokens);
    if (snap && import.meta.env.VITE_USE_POSTGRES === 'true') {
      await saveChatHistory(snap.title, snap.messages, snap.totalCost, snap.totalTokens);
      const newHistory = await loadChatHistory();
      setHistory(newHistory);
    }
    setMessages([WELCOME_MSG]);
    setInput(""); setSelectMode(false); setSelected(new Set());
    setTotalCost(0); setTotalTokens({in:0,out:0});
    setExportErr(null); setActiveStep(null); setActiveHistoryId(null);
  };

  const loadChat = async (conv) => {
    if (import.meta.env.VITE_USE_POSTGRES === 'true') {
      try {
        const res = await fetch(`/api/load-chat?id=${conv.id}`);
        const data = await res.json();
        setMessages(data.messages);
        setTotalCost(data.totalCost);
        setTotalTokens(data.totalTokens);
      } catch(e) {
        console.error('Load chat failed:', e);
      }
    } else {
      setMessages(conv.messages);
      setTotalCost(conv.totalCost);
      setTotalTokens(conv.totalTokens);
    }
    setActiveHistoryId(conv.id);
    setInput(""); setSelectMode(false); setSelected(new Set()); setExportErr(null); setActiveStep(null);
  };

  const deleteHistory = async (id, e) => {
    e.stopPropagation();
    if (import.meta.env.VITE_USE_POSTGRES === 'true') {
      try {
        await fetch(`/api/delete-chat?id=${id}`, { method: 'DELETE' });
        const newHistory = await loadChatHistory();
        setHistory(newHistory);
      } catch(e) {
        console.error('Delete failed:', e);
      }
    } else {
      setHistory(h => h.filter(c => c.id !== id));
    }
    if (activeHistoryId === id) setActiveHistoryId(null);
  };

  // Save history when it changes (localStorage only)
  useEffect(() => {
    if (import.meta.env.VITE_USE_POSTGRES !== 'true') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 50)));
      } catch(e) {}
    }
  }, [history]);

  useEffect(() => { 
    if (USE_POSTGRES) {
      setDbReady(true); // PostgreSQL always ready
    } else {
      initDB().then(()=>setDbReady(true)).catch(console.error);
    }
  },[USE_POSTGRES]);
  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[messages,loading]);
  useEffect(() => {
    const handler = e => sendMessage(e.detail);
    document.addEventListener("klarix-followup", handler);
    return () => document.removeEventListener("klarix-followup", handler);
  });

  const qaPairs = [];
  for (let i=0;i<messages.length;i++) {
    if (messages[i].role==="user"&&messages[i+1]?.role==="assistant")
      qaPairs.push({question:messages[i].content, ...messages[i+1], pairIdx:qaPairs.length});
  }

  const sendMessage = async (text, forceNew = false) => {
    const q = (text||input).trim();
    if (!q||loading||!dbReady) return;
    
    // Check for similar questions unless forced to generate new
    if (!forceNew) {
      const similar = findSimilarQuestion(q);
      if (similar) {
        setSimilarQuestion({...similar, newQuestion: q});
        return;
      }
    }
    
    setSimilarQuestion(null);
    setInput(""); setExportErr(null);
    setMessages(m=>[...m,{role:"user",content:q}]);
    setLoading(true);
    try {
      setActiveStep(1);
      const {sql, intent, answer, insight, followups, inputTokens, outputTokens} = await askLLM(q, selectedModel);
      let totalCost = calcCost(inputTokens,outputTokens,selectedModel);
      let totalIn = inputTokens, totalOut = outputTokens;
      setTotalTokens(t=>({in:t.in+inputTokens,out:t.out+outputTokens}));
      setTotalCost(c=>c+totalCost);
      setActiveStep(3);
      let result, finalSQL=sql, finalIntent=intent, finalAnswer=answer, finalInsight=insight, finalFollowups=followups;
      let retried=false;
      try {
        result = await executeSQL(sql);
      } catch(sqlErr) {
        try {
          setActiveStep(1);
          const fix = await fixSQL(q, sqlErr.sql||sql, sqlErr.message, selectedModel);
          const retryCost = calcCost(fix.inputTokens, fix.outputTokens, selectedModel);
          setTotalTokens(t=>({in:t.in+fix.inputTokens, out:t.out+fix.outputTokens}));
          setTotalCost(c=>c+retryCost);
          totalCost += retryCost;
          totalIn += fix.inputTokens; totalOut += fix.outputTokens;
          setActiveStep(3);
          result = await executeSQL(fix.sql);
          finalSQL = fix.sql; finalIntent = fix.intent; finalAnswer = fix.answer||''; finalInsight = fix.insight||''; finalFollowups = fix.followups;
          retried = true;
        } catch(retryErr) {
          setMessages(m=>[...m,{role:"assistant",type:"error",content:retryErr.message,sql:retryErr.sql||finalSQL}]);
          setLoading(false); setActiveStep(null); return;
        }
      }
      // Handle non-SQL responses (greetings, irrelevant questions)
      if (!finalSQL) {
        setMessages(m=>[...m,{role:"assistant",type:"chat",intent:finalIntent,answer:finalAnswer,followups:finalFollowups,cost:totalCost,inputTokens:totalIn,outputTokens:totalOut}]);
        setLoading(false); setActiveStep(null); return;
      }
      const newQA = {question:q,sql:finalSQL,intent:finalIntent,answer:finalAnswer,insight:finalInsight,result,cost:totalCost,inputTokens:totalIn,outputTokens:totalOut,followups:finalFollowups,retried,timestamp:Date.now()};
      setMessages(m=>[...m,{role:"assistant",type:"result",...newQA}]);
      
      // Save Q&A pair to persistent storage
      const qaPairs = loadQAPairs();
      qaPairs.unshift(newQA);
      saveQAPairs(qaPairs);
    } catch(e) {
      setMessages(m=>[...m,{role:"assistant",type:"error",content:e?.message||String(e),sql:null}]);
    }
    setLoading(false); setActiveStep(null);
  };

  const useSimilarResponse = () => {
    const q = similarQuestion.newQuestion;
    const responseData = {
      role: "assistant",
      type: "result",
      question: q,
      sql: similarQuestion.sql,
      intent: similarQuestion.intent,
      answer: similarQuestion.answer,
      insight: similarQuestion.insight,
      result: similarQuestion.result,
      cost: similarQuestion.cost,
      inputTokens: similarQuestion.inputTokens,
      outputTokens: similarQuestion.outputTokens,
      followups: similarQuestion.followups,
      retried: similarQuestion.retried,
      reused: true
    };
    setMessages(m=>[...m,{role:"user",content:q}, responseData]);
    setSimilarQuestion(null);
    setInput("");
  };

  const generateNewResponse = () => {
    const q = similarQuestion.newQuestion;
    setSimilarQuestion(null);
    sendMessage(q, true); // Force new generation
  };
  const canSend = input.trim() && !loading && dbReady;
  const tblColors = ["#4f8ef7","#10d9a0","#f59e0b","#f472b6"];

  return (
    <ThemeCtx.Provider value={{dark,T}}>
      <div style={{fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",background:T.bg,height:"100vh",display:"flex",color:T.text,overflow:"hidden",transition:"background .25s,color .25s"}}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap');
          @keyframes pulse{0%,80%,100%{opacity:.25;transform:scale(.75)}40%{opacity:1;transform:scale(1)}}
          @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes slideIn{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:translateX(0)}}
          .fup-btn{transition:all .18s!important}
          .fup-btn:hover{background:${T.accentGlow}!important;border-color:${T.accent}!important;color:${T.accent}!important;transform:translateX(4px)!important}
          .tbl-btn:hover{background:${T.bgHover}!important}
          .sugg-btn:hover{background:${T.accentGlow}!important;border-color:${T.borderAccent}!important;color:${T.accent}!important}
          .export-btn:hover{opacity:.85!important}
          .new-chat-btn:hover{opacity:.88!important;transform:translateY(-1px)!important}
          ::-webkit-scrollbar{width:5px;height:5px}
          ::-webkit-scrollbar-track{background:transparent}
          ::-webkit-scrollbar-thumb{background:${T.scrollThumb};border-radius:10px}
        `}</style>

        {/* ══════════════ SIDEBAR ══════════════ */}
        <aside style={{width:260,background:T.bgSide,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",flexShrink:0,overflowY:"auto",overflowX:"hidden",transition:"background .25s,border-color .25s"}}>

          {/* Logo + New Chat button */}
          <div style={{padding:"14px 14px 12px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <div style={{width:36,height:36,background:`linear-gradient(135deg,${T.accent},${T.accent2})`,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:15,color:"#fff",boxShadow:`0 0 14px ${T.accentGlow},0 2px 8px rgba(0,0,0,.3)`,flexShrink:0}}>K</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:T.text,letterSpacing:".08em"}}>KLARIX</div>
                <div style={{fontSize:9,color:T.textFaint,letterSpacing:".12em",marginTop:1}}>TEXT-TO-SQL ENGINE</div>
              </div>
            </div>
            {/* New Chat button */}
            <button onClick={startNewChat} className="new-chat-btn"
              style={{width:"100%",padding:"8px 0",background:`linear-gradient(135deg,${T.accent},${T.accent2})`,border:"none",borderRadius:9,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:7,letterSpacing:".04em",transition:"opacity .15s",boxShadow:`0 2px 12px ${T.accentGlow}`}}>
              <span style={{fontSize:16,lineHeight:1}}>＋</span> New Chat
            </button>
          </div>

          {/* ── Chat History ── */}
          <SideSection label="CHAT HISTORY" icon="🕑" collapsed={collapsed.history} onToggle={()=>toggleSection("history")} T={T}>
            {history.length===0 ? (
              <div style={{fontSize:10,color:T.textFaint,padding:"6px 4px 2px",fontStyle:"italic",textAlign:"center"}}>
                No saved chats yet.<br/>Click <strong style={{color:T.accent}}>New Chat</strong> to save one.
              </div>
            ) : history.map(conv => {
              const isActive = conv.id === activeHistoryId;
              return (
                <div key={conv.id} style={{position:"relative",marginBottom:3,display:"flex",alignItems:"stretch",gap:4}}>
                  <button className="tbl-btn" onClick={()=>loadChat(conv)}
                    style={{flex:1,display:"flex",flexDirection:"column",alignItems:"flex-start",gap:3,padding:"8px 10px",
                      background: isActive ? T.bgActive : T.bgDeep,
                      border:`1px solid ${isActive ? T.borderAccent : T.border}`,
                      borderRadius:8,cursor:"pointer",width:0,textAlign:"left",fontFamily:"inherit",transition:"all .15s",minWidth:0}}>
                    {isActive && (
                      <div style={{fontSize:7.5,fontWeight:700,color:T.accent,letterSpacing:".1em",marginBottom:1}}>● ACTIVE</div>
                    )}
                    <span style={{fontSize:10,fontWeight:600,color:isActive?T.text:T.textSub,lineHeight:1.35,
                      whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",width:"100%"}}>{conv.title}</span>
                    <div style={{display:"flex",alignItems:"center",gap:7}}>
                      <span style={{fontSize:8,color:T.textFaint}}>{conv.date} · {conv.time}</span>
                      <span style={{fontSize:8,color:T.accent2,fontWeight:600}}>${conv.totalCost.toFixed(4)}</span>
                    </div>
                  </button>
                  {/* Delete button */}
                  <button onClick={e=>deleteHistory(conv.id,e)}
                    style={{flexShrink:0,width:24,background:"transparent",border:`1px solid ${T.border}`,borderRadius:7,
                      cursor:"pointer",color:T.textFaint,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",
                      transition:"all .15s",padding:0}}
                    title="Remove from history"
                    onMouseEnter={e=>{e.currentTarget.style.background="#ef444420";e.currentTarget.style.color="#ef4444";e.currentTarget.style.borderColor="#ef444460";}}
                    onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.textFaint;e.currentTarget.style.borderColor=T.border;}}>
                    ✕
                  </button>
                </div>
              );
            })}
          </SideSection>

          {/* ── Query Pipeline ── */}
          <SideSection label="QUERY PIPELINE" icon="⚡" collapsed={collapsed.pipeline} onToggle={()=>toggleSection("pipeline")} T={T}>
            {STEPS.map((s,i)=>{
              const active = activeStep===i;
              return (
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 8px",borderRadius:8,marginBottom:2,background:active?T.bgActive:"transparent",transition:"background .2s",animation:active?"slideIn .2s ease":"none"}}>
                  <div style={{width:22,height:22,borderRadius:6,border:`2px solid ${active?T.accent:T.border}`,background:active?T.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:active?"#fff":T.textFaint,flexShrink:0,transition:"all .2s",boxShadow:active?`0 0 10px ${T.accentGlow}`:"none"}}>{i+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:active?600:400,color:active?T.text:T.textMuted}}>{s}</div>
                    {i===1&&<div style={{fontSize:8.5,color:active?T.accent2:T.textFaint}}>schema only · no data</div>}
                    {i===3&&<div style={{fontSize:8.5,color:active?T.accent2:T.textFaint}}>runs on your DB</div>}
                  </div>
                  {active&&<div style={{width:6,height:6,borderRadius:"50%",background:T.accent,animation:"pulse 1s infinite",flexShrink:0}}/>}
                </div>
              );
            })}
          </SideSection>

          {/* ── DB Status ── */}
          <SideSection label="DATABASE" icon="🗄" collapsed={collapsed.db} onToggle={()=>toggleSection("db")} T={T}>
            <div style={{padding:"10px 12px",background:T.bgDeep,borderRadius:10,border:`1px solid ${T.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:dbReady?T.accent2:T.warn,boxShadow:dbReady?`0 0 6px ${T.accent2}`:`0 0 6px ${T.warn}`,animation:dbReady?"none":"pulse 1.5s infinite"}}/>
                <span style={{fontSize:10,fontWeight:600,color:dbReady?T.accent2:T.warn}}>{dbReady?"Connected":"Loading…"}</span>
              </div>
              <div style={{fontSize:9,color:T.textFaint,lineHeight:1.6}}>{USE_POSTGRES?'Neon PostgreSQL · Production':'AlaSQL · 4 tables · 46 rows'}</div>
            </div>
          </SideSection>

          {/* ── Database Tables ── */}
          <SideSection label="DATABASE TABLES" icon="📋" collapsed={collapsed.tables} onToggle={()=>toggleSection("tables")} T={T}>
            {Object.entries(DB_ROWS).map(([tbl,rows],ti)=>{
              const isActive = activeTable===tbl;
              return (
                <button key={tbl} className="tbl-btn" onClick={()=>setActiveTable(isActive?null:tbl)}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"7px 8px",background:isActive?T.bgActive:"transparent",border:`1px solid ${isActive?T.borderAccent:"transparent"}`,borderRadius:8,cursor:"pointer",width:"100%",textAlign:"left",fontFamily:"inherit",marginBottom:2,transition:"all .15s"}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:tblColors[ti],boxShadow:`0 0 6px ${tblColors[ti]}66`,flexShrink:0}}/>
                  <span style={{fontSize:11,fontWeight:500,color:isActive?T.text:T.textMuted,flex:1}}>{tbl}</span>
                  <span style={{fontSize:9.5,color:isActive?T.accent:T.textFaint,background:T.bgDeep,padding:"1px 7px",borderRadius:10,border:`1px solid ${T.border}`,fontWeight:600}}>{rows.length}</span>
                </button>
              );
            })}
          </SideSection>

          {/* ── Schema ── */}
          <SideSection label="SCHEMA" icon="🗂" collapsed={collapsed.schema} onToggle={()=>toggleSection("schema")} T={T}>
            <div style={{background:T.sqlBg,border:`1px solid ${T.sqlBorder}`,borderRadius:8,padding:"10px 12px",maxHeight:180,overflowY:"auto",fontSize:9,color:"#64748b",lineHeight:1.7,whiteSpace:"pre-wrap",fontFamily:"'JetBrains Mono',monospace"}}>
              {SCHEMA}
            </div>
          </SideSection>

          {/* ── Session Cost ── */}
          <SideSection label="SESSION COST" icon="💰" collapsed={collapsed.cost} onToggle={()=>toggleSection("cost")} T={T} last>
            <div style={{background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px"}}>
              <div style={{fontSize:22,fontWeight:700,color:totalCost>0?T.accent:T.textFaint,fontVariantNumeric:"tabular-nums",fontFamily:"'JetBrains Mono',monospace",letterSpacing:".02em"}}>${totalCost.toFixed(5)}</div>
              <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:3}}>
                <div style={{fontSize:9,color:T.textFaint,display:"flex",justifyContent:"space-between"}}><span>Schema tokens in</span><span style={{color:T.textMuted}}>↑ {totalTokens.in.toLocaleString()}</span></div>
                <div style={{fontSize:9,color:T.textFaint,display:"flex",justifyContent:"space-between"}}><span>SQL tokens out</span><span style={{color:T.textMuted}}>↓ {totalTokens.out.toLocaleString()}</span></div>
              </div>
              <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${T.border}`,fontSize:9,color:T.accent2,display:"flex",alignItems:"center",gap:5}}>
                <span>✓</span><span>Data rows never sent to LLM</span>
              </div>
            </div>
          </SideSection>

        </aside>

        {/* ══════════════ MAIN ══════════════ */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>

          {/* Header */}
          <header style={{padding:"12px 24px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",background:T.bgSide,flexShrink:0,transition:"background .25s,border-color .25s"}}>
            <div style={{display:"flex",flexDirection:"column",gap:2}}>
              <div style={{fontSize:9,fontWeight:600,color:T.textFaint,letterSpacing:".16em"}}>BRANDSCAPES WORLDWIDE</div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:16,fontWeight:700,color:T.text}}>Insights Chat</span>
                <span style={{fontSize:10,fontWeight:600,padding:"2px 9px",background:T.accent2Glow||T.tagBg,border:`1px solid ${T.tagBorder}`,borderRadius:20,color:T.accent2,letterSpacing:".08em"}}>TEXT-TO-SQL</span>
              </div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <select value={selectedModel} onChange={e=>setSelectedModel(e.target.value)}
                style={{fontSize:10,fontWeight:600,padding:"6px 10px",background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,cursor:"pointer",fontFamily:"inherit"}}>
                {Object.entries(MODELS).map(([k,v])=>(<option key={k} value={k}>{v.name}</option>))}
              </select>
              {qaPairs.length>0&&(
                <button className="export-btn" onClick={()=>{setSelectMode(s=>!s);setSelected(new Set());setExportErr(null);}}
                  style={{fontSize:11,fontWeight:600,padding:"6px 14px",background:selectMode?T.accent:T.bgCard,border:`1px solid ${selectMode?T.accent:T.border}`,borderRadius:8,color:selectMode?"#fff":T.textMuted,cursor:"pointer",fontFamily:"inherit",transition:"all .2s",display:"flex",alignItems:"center",gap:6}}>
                  <span>{selectMode?"✕":"⬜"}</span>{selectMode?"Cancel":"Export"}
                </button>
              )}
              {selectMode&&selected.size>0&&(
                <div style={{display:"flex",gap:6}}>
                  <button disabled={!!exportLoading} className="export-btn" onClick={async()=>{
                    const ps=qaPairs.filter(p=>selected.has(p.pairIdx));
                    setExportLoading("pdf");setExportErr(null);
                    try{await exportPDF(ps);setSelectMode(false);setSelected(new Set());}
                    catch(e){setExportErr("PDF: "+e.message);}
                    finally{setExportLoading(null);}
                  }} style={{fontSize:11,fontWeight:700,padding:"6px 14px",background:"linear-gradient(135deg,#dc2626,#b91c1c)",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5,opacity:exportLoading&&exportLoading!=="pdf"?.5:1}}>
                    {exportLoading==="pdf"?"⏳ …":"↓ PDF"}
                  </button>
                  <button disabled={!!exportLoading} className="export-btn" onClick={async()=>{
                    const ps=qaPairs.filter(p=>selected.has(p.pairIdx));
                    setExportLoading("pptx");setExportErr(null);
                    try{await exportPPTX(ps);setSelectMode(false);setSelected(new Set());}
                    catch(e){setExportErr("PPTX: "+e.message);}
                    finally{setExportLoading(null);}
                  }} style={{fontSize:11,fontWeight:700,padding:"6px 14px",background:`linear-gradient(135deg,${T.accent},${T.accent2})`,border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5,opacity:exportLoading&&exportLoading!=="pptx"?.5:1}}>
                    {exportLoading==="pptx"?"⏳ …":"↓ PPTX"}
                  </button>
                </div>
              )}
              <button onClick={()=>setDark(d=>!d)}
                style={{width:38,height:38,borderRadius:10,background:T.bgCard,border:`1px solid ${T.border}`,cursor:"pointer",fontSize:17,transition:"all .25s",display:"flex",alignItems:"center",justifyContent:"center"}}>
                {dark?"☀️":"🌙"}
              </button>
            </div>
          </header>

          {/* Table preview strip */}
          {activeTable&&(
            <div style={{background:T.bgCard,borderBottom:`1px solid ${T.border}`,padding:"10px 24px",flexShrink:0,animation:"fadeUp .2s ease"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:tblColors[Object.keys(DB_ROWS).indexOf(activeTable)]}}/>
                  <span style={{fontSize:10,fontWeight:700,color:T.text,letterSpacing:".08em"}}>{activeTable.toUpperCase()}</span>
                  <span style={{fontSize:9,color:T.textFaint}}>— {DB_ROWS[activeTable].length} rows, {Object.keys(DB_ROWS[activeTable][0]).length} columns · showing first 5</span>
                </div>
                <button onClick={()=>setActiveTable(null)} style={{background:"transparent",border:"none",color:T.textFaint,cursor:"pointer",fontSize:16,lineHeight:1,padding:"0 4px"}}>✕</button>
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={{borderCollapse:"collapse",fontSize:11,whiteSpace:"nowrap",width:"100%"}}>
                  <thead>
                    <tr style={{background:T.bgDeep}}>
                      {Object.keys(DB_ROWS[activeTable][0]).map(k=>(
                        <th key={k} style={{padding:"5px 14px",color:T.accent,textAlign:"left",fontSize:9,fontWeight:700,letterSpacing:".1em",borderBottom:`1px solid ${T.border}`}}>{k.toUpperCase()}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DB_ROWS[activeTable].slice(0,5).map((row,i)=>(
                      <tr key={i} style={{borderBottom:`1px solid ${T.borderSub}`}}>
                        {Object.values(row).map((v,j)=>(
                          <td key={j} style={{padding:"5px 14px",color:T.textSub,fontSize:11}}>{String(v)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Select mode banner */}
          {selectMode&&(
            <div style={{background:dark?"#1e2a40":"#eff6ff",borderBottom:`1px solid ${T.border}`,padding:"8px 24px",display:"flex",alignItems:"center",gap:10,fontSize:11,flexShrink:0}}>
              <span style={{fontWeight:700,color:T.accent,letterSpacing:".08em"}}>SELECT MODE</span>
              <span style={{color:T.textMuted}}>Click Q&amp;A pairs or use checkboxes to include in export.</span>
              <button onClick={()=>selected.size===qaPairs.length?setSelected(new Set()):setSelected(new Set(qaPairs.map(p=>p.pairIdx)))}
                style={{fontSize:10,padding:"3px 10px",background:"transparent",border:`1px solid ${T.accent}`,borderRadius:6,color:T.accent,cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>
                {selected.size===qaPairs.length?"Deselect All":"Select All"}
              </button>
              {selected.size>0&&<span style={{marginLeft:"auto",fontWeight:600,color:T.accent}}>{selected.size} / {qaPairs.length} selected</span>}
            </div>
          )}
          {exportErr&&(
            <div style={{background:"#1c0a0a",borderBottom:"1px solid #7f1d1d",padding:"8px 24px",fontSize:11,color:"#fca5a5",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
              <span>⚠ {exportErr}</span>
              <button onClick={()=>setExportErr(null)} style={{background:"transparent",border:"none",color:"#fca5a5",cursor:"pointer",fontSize:16}}>✕</button>
            </div>
          )}

          {/* Similar question dialog */}
          {similarQuestion&&(
            <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}>
              <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,padding:"20px",maxWidth:500,margin:20,boxShadow:T.shadow}}>
                <h3 style={{margin:"0 0 12px",fontSize:14,fontWeight:700,color:T.text}}>Similar Question Found</h3>
                <p style={{margin:"0 0 8px",fontSize:12,color:T.textSub}}>Your question: <strong>"{similarQuestion.newQuestion}"</strong></p>
                <p style={{margin:"0 0 16px",fontSize:12,color:T.textSub}}>Similar previous question: <strong>"{similarQuestion.question}"</strong></p>
                <p style={{margin:"0 0 16px",fontSize:11,color:T.textMuted}}>Similarity: {Math.round(similarQuestion.similarity * 100)}% • Save ${similarQuestion.cost?.toFixed(5) || '0.00300'} by reusing</p>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  <button onClick={useSimilarResponse} style={{padding:"8px 16px",background:T.accent2,border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontSize:12,fontWeight:600}}>Use Previous Answer</button>
                  <button onClick={generateNewResponse} style={{padding:"8px 16px",background:T.accent,border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontSize:12,fontWeight:600}}>Generate New</button>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <div style={{flex:1,overflowY:"auto",padding:"24px",display:"flex",flexDirection:"column",gap:20}}>

            {/* Welcome card */}
            {messages[0]?.type==="welcome"&&(
              <div style={{display:"flex",gap:12,animation:"fadeUp .3s ease"}}>
                <KLARixAvatar T={T}/>
                <div style={{maxWidth:"78%"}}>
                  <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:"4px 16px 16px 16px",padding:"16px 18px",boxShadow:T.shadow}}>
                    <p style={{fontSize:13,color:T.textSub,lineHeight:1.75,margin:"0 0 14px"}}>
                      <Md text={messages[0].content} T={T}/>
                    </p>
                    {/* Pipeline diagram */}
                    <div style={{background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px"}}>
                      <div style={{fontSize:9,fontWeight:700,color:T.textFaint,letterSpacing:".14em",marginBottom:10}}>HOW IT WORKS · DATA NEVER LEAVES YOUR DB</div>
                      <div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap",rowGap:8}}>
                        {[["💬","Question"],["📋","Schema\nonly"],["🤖","LLM → SQL"],["🗄️","Your DB"],["📊","Results"]].map((x,i,arr)=>(
                          <div key={i} style={{display:"flex",alignItems:"center",gap:4}}>
                            <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",textAlign:"center",minWidth:60}}>
                              <div style={{fontSize:16,lineHeight:1}}>{x[0]}</div>
                              <div style={{fontSize:8,color:T.textFaint,marginTop:3,whiteSpace:"pre-line",lineHeight:1.3}}>{x[1]}</div>
                            </div>
                            {i<arr.length-1&&<span style={{color:T.textFaint,fontSize:14,fontWeight:300}}>›</span>}
                          </div>
                        ))}
                      </div>
                      <div style={{marginTop:10,fontSize:10,color:T.accent2,fontWeight:500}}>✓ LLM cost stays fixed regardless of how many rows are in your database</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Q&A pairs */}
            {qaPairs.map((p,pairIdx)=>{
              const isSel = selected.has(pairIdx);
              return (
                <div key={pairIdx} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                  {selectMode&&(
                    <button onClick={()=>setSelected(s=>{const n=new Set(s);n.has(pairIdx)?n.delete(pairIdx):n.add(pairIdx);return n;})}
                      style={{flexShrink:0,marginTop:6,width:24,height:24,borderRadius:7,border:`2px solid ${isSel?T.accent:T.border}`,background:isSel?T.accent:"transparent",cursor:"pointer",color:"#fff",fontSize:12,fontWeight:700,padding:0,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .18s"}}>
                      {isSel?"✓":""}
                    </button>
                  )}
                  <div onClick={selectMode?()=>setSelected(s=>{const n=new Set(s);n.has(pairIdx)?n.delete(pairIdx):n.add(pairIdx);return n;}):undefined}
                    style={{flex:1,cursor:selectMode?"pointer":"default",borderRadius:12,outline:isSel?`2px solid ${T.accent}`:"2px solid transparent",outlineOffset:3,transition:"outline .15s",display:"flex",flexDirection:"column",gap:14}}>

                    {/* User bubble — right aligned */}
                    <div style={{display:"flex",justifyContent:"flex-end",animation:"fadeUp .2s ease"}}>
                      <div style={{maxWidth:"68%",background:T.userBg,borderRadius:"16px 16px 4px 16px",padding:"11px 16px",fontSize:13,color:T.userText,lineHeight:1.65,boxShadow:T.shadow,fontWeight:400}}>
                        {p.question}
                      </div>
                    </div>

                    {/* AI response */}
                    {p.type==="result"&&<ResultCard p={p} T={T}/>}
                    {p.type==="chat"&&<ChatCard p={p} T={T}/>}
                    {p.type==="error"&&(
                      <div style={{display:"flex",gap:12}}>
                        <KLARixAvatar T={T}/>
                        <div style={{background:"#1c0a0a",border:"1px solid #7f1d1d",borderRadius:"4px 16px 16px 16px",padding:"12px 16px",fontSize:12,color:"#fca5a5",lineHeight:1.6,maxWidth:"88%"}}>
                          <div style={{fontWeight:700,marginBottom:6,color:"#f87171"}}>⚠ SQL Error</div>
                          <div style={{marginBottom:p.sql?8:0}}>{p.content}</div>
                          {p.sql&&<pre style={{margin:0,padding:"8px 10px",background:"#0a0505",border:"1px solid #991b1b",borderRadius:6,fontSize:10,color:"#fca5a5",overflowX:"auto",whiteSpace:"pre-wrap",fontFamily:"monospace"}}>{p.sql}</pre>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Loading state */}
            {loading&&(
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {messages[messages.length-1]?.role==="user"&&(
                  <div style={{display:"flex",justifyContent:"flex-end"}}>
                    <div style={{maxWidth:"68%",background:T.userBg,borderRadius:"16px 16px 4px 16px",padding:"11px 16px",fontSize:13,color:T.userText,lineHeight:1.65}}>
                      {messages[messages.length-1].content}
                    </div>
                  </div>
                )}
                <div style={{display:"flex",gap:12}}>
                  <KLARixAvatar T={T}/>
                  <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:"4px 16px 16px 16px",padding:"14px 18px",boxShadow:T.shadow}}>
                    <div style={{fontSize:10,fontWeight:600,color:T.accent2,marginBottom:8,letterSpacing:".1em"}}>
                      {activeStep===1?"SENDING SCHEMA TO LLM…":activeStep===3?"EXECUTING SQL ON DATABASE…":"PROCESSING…"}
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      {[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:T.accent,animation:"pulse 1.2s ease-in-out infinite",animationDelay:`${i*.18}s`}}/>)}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Suggestion chips */}
          {messages.length<=1&&(
            <div style={{padding:"0 24px 12px",display:"flex",flexWrap:"wrap",gap:8,flexShrink:0}}>
              <div style={{width:"100%",fontSize:9,fontWeight:600,color:T.textFaint,letterSpacing:".14em",marginBottom:2}}>SUGGESTED QUESTIONS</div>
              {SUGGESTIONS.map((s,i)=>(
                <button key={i} className="sugg-btn" onClick={()=>sendMessage(s)}
                  style={{fontSize:11,fontWeight:500,padding:"6px 14px",background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:20,color:T.textMuted,cursor:"pointer",transition:"all .15s",fontFamily:"inherit",lineHeight:1}}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input bar */}
          <div style={{padding:"12px 24px 18px",borderTop:`1px solid ${T.border}`,background:T.bgSide,flexShrink:0,transition:"background .25s"}}>
            {!dbReady&&(
              <div style={{textAlign:"center",fontSize:10,color:T.warn,fontWeight:600,marginBottom:8,letterSpacing:".08em"}}>⏳ INITIALISING DATABASE…</div>
            )}
            <div style={{display:"flex",gap:10,background:T.bgInput,border:`2px solid ${T.border}`,borderRadius:14,padding:"6px 6px 6px 18px",transition:"border-color .2s",boxShadow:T.shadow}}
              onFocusCapture={e=>e.currentTarget.style.borderColor=T.accent}
              onBlurCapture={e=>e.currentTarget.style.borderColor=T.border}>
              <textarea value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}}}
                placeholder={dbReady?"Ask anything — I'll write the SQL for you…":"Initialising database…"}
                disabled={!dbReady} rows={1}
                style={{flex:1,background:"transparent",border:"none",outline:"none",color:T.text,fontSize:13,resize:"none",padding:"10px 0",fontFamily:"inherit",lineHeight:1.55,minHeight:40}}/>
              <button onClick={()=>sendMessage()} disabled={!canSend}
                style={{width:44,height:44,borderRadius:10,background:canSend?`linear-gradient(135deg,${T.accent},${T.accent2})`:T.bgDeep,border:`1px solid ${canSend?T.accent:T.border}`,cursor:canSend?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s",flexShrink:0,alignSelf:"center",boxShadow:canSend?`0 0 14px ${T.accentGlow}`:"none"}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={canSend?"#fff":T.textFaint} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
            <div style={{fontSize:9,color:T.textFaint,marginTop:6,textAlign:"center",letterSpacing:".1em"}}>
              SCHEMA ONLY → LLM · DATA STAYS IN YOUR DB · ENTER TO SEND
            </div>
          </div>
        </div>
      </div>
    </ThemeCtx.Provider>
  );
}

// ─── JIFFY AVATAR ─────────────────────────────────────────────────────────────
function KLARixAvatar({T}) {
  return (
    <div style={{width:32,height:32,borderRadius:9,background:`linear-gradient(135deg,${T.accent},${T.accent2})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#fff",flexShrink:0,marginTop:4,boxShadow:`0 0 12px ${T.accentGlow}`}}>K</div>
  );
}

// ─── CHAT CARD (for non-SQL responses) ──────────────────────────────────────
function ChatCard({p, T}) {
  return (
    <div style={{display:"flex",gap:12,animation:"fadeUp .3s ease"}}>
      <KLARixAvatar T={T}/>
      <div style={{flex:1,display:"flex",flexDirection:"column",gap:10,minWidth:0}}>
        <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,padding:"14px 16px",boxShadow:T.shadow}}>
          <p style={{fontSize:13,color:T.textSub,lineHeight:1.75,margin:"0 0 10px"}}>{p.answer}</p>
        </div>
        {p.cost!=null&&(
          <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"4px 12px",background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:20,fontSize:9,fontWeight:500}}>
            <span style={{color:T.accent2}}>💬</span>
            <span style={{color:T.textMuted}}>{p.inputTokens?.toLocaleString()} tokens in</span>
            <span style={{color:T.border}}>·</span>
            <span style={{color:T.textMuted}}>{p.outputTokens?.toLocaleString()} tokens out</span>
            <span style={{color:T.border}}>·</span>
            <span style={{color:T.accent,fontWeight:700}}>${p.cost.toFixed(5)}</span>
          </div>
        )}
        {p.followups?.length>0&&(
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            <div style={{fontSize:9,fontWeight:700,color:T.textFaint,letterSpacing:".14em",marginBottom:2}}>SUGGESTED QUESTIONS</div>
            {p.followups.map((q,i)=>(
              <button key={i} className="fup-btn"
                onClick={()=>document.dispatchEvent(new CustomEvent("klarix-followup",{detail:q,bubbles:true}))}
                style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px",background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,cursor:"pointer",textAlign:"left",fontSize:12,color:T.textSub,fontFamily:"inherit",width:"100%",lineHeight:1.5}}>
                <span style={{fontSize:16,color:T.accent,fontWeight:300,flexShrink:0,lineHeight:1}}>›</span>
                <span style={{flex:1}}>{q}</span>
                <span style={{fontSize:10,color:T.textFaint,flexShrink:0}}>Ask →</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── RESULT CARD ─────────────────────────────────────────────────────────────
function ResultCard({p, T}) {
  const [showSQL, setShowSQL] = useState(true);
  const hasTable = p.result?.headers?.length>0;
  // Find first column that looks like a label, and first numeric column after it
  const numColIdx = hasTable ? (() => {
    const sample = p.result.rows.slice(0,5);
    for (let j=1; j<p.result.headers.length; j++) {
      if (sample.some(r => r[j]!=null && !isNaN(parseFloat(r[j])))) return j;
    }
    return -1;
  })() : -1;
  const hasChart = hasTable && numColIdx >= 1 && p.result.rows.length >= 1;
  // Detect time-series (month/year/quarter in label col)
  const isTimeSeries = hasChart && /month|year|quarter|date|period/i.test(p.result.headers[0]);

  return (
    <div style={{display:"flex",gap:12,animation:"fadeUp .3s ease"}}>
      <KLARixAvatar T={T}/>
      <div style={{flex:1,display:"flex",flexDirection:"column",gap:10,minWidth:0}}>

        {/* Answer + Insight */}
        {(p.answer||p.insight)&&(
          <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,padding:"14px 16px",boxShadow:T.shadow}}>
            {p.answer&&<p style={{fontSize:13,color:T.textSub,lineHeight:1.75,margin:"0 0 10px"}}>{p.answer}</p>}
            {p.insight&&(
              <div style={{background:T.accentGlow||T.accent+"12",border:`1px solid ${T.borderAccent||T.accent+"30"}`,borderRadius:8,padding:"10px 14px"}}>
                <div style={{fontSize:9,fontWeight:700,color:T.accent2,letterSpacing:".12em",marginBottom:5}}>INSIGHT</div>
                <div style={{fontSize:11,color:T.textMuted,fontStyle:"italic",lineHeight:1.65}}>{p.insight}</div>
              </div>
            )}
          </div>
        )}

        {/* SQL collapsible block */}
        <div style={{background:T.sqlBg,border:`1px solid ${T.sqlBorder}`,borderRadius:12,overflow:"hidden"}}>
          <button onClick={()=>setShowSQL(s=>!s)}
            style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 14px",background:"transparent",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
            <span style={{fontSize:9,fontWeight:700,padding:"2px 9px",background:"#10d9a018",border:"1px solid #10d9a040",borderRadius:6,color:"#10d9a0",letterSpacing:".12em",flexShrink:0}}>SQL</span>
            {p.retried&&<span style={{fontSize:9,fontWeight:700,padding:"2px 9px",background:"#f59e0b18",border:"1px solid #f59e0b40",borderRadius:6,color:"#f59e0b",letterSpacing:".1em",flexShrink:0}}>↺ SIMPLIFIED</span>}
            {p.intent&&<span style={{fontSize:11,color:"#64748b",fontStyle:"italic",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.intent}</span>}
            <span style={{fontSize:11,color:"#475569",flexShrink:0,marginLeft:"auto"}}>{showSQL?"▲ hide":"▼ show"}</span>
          </button>
          {showSQL&&(
            <pre style={{margin:0,padding:"10px 16px 14px",fontSize:11.5,color:"#93c5fd",lineHeight:1.75,overflowX:"auto",fontFamily:"'JetBrains Mono',monospace",whiteSpace:"pre-wrap",borderTop:"1px solid #1e3050"}}>
              {p.sql}
            </pre>
          )}
        </div>

        {/* Results table */}
        {hasTable&&<DataTable table={p.result} T={T}/>}

        {/* Chart */}
        {hasChart&&<MiniChart rows={p.result.rows.slice(0,10)} headers={p.result.headers} numCol={numColIdx} isTimeSeries={isTimeSeries} T={T}/>}

        {/* Cost pill */}
        {p.cost!=null&&(
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"4px 12px",background:T.bgDeep,border:`1px solid ${T.border}`,borderRadius:20,fontSize:9,fontWeight:500}}>
              <span style={{color:T.accent2}}>📋</span>
              <span style={{color:T.textMuted}}>{p.inputTokens?.toLocaleString()} schema in</span>
              <span style={{color:T.border}}>·</span>
              <span style={{color:T.textMuted}}>{p.outputTokens?.toLocaleString()} sql out</span>
              <span style={{color:T.border}}>·</span>
              <span style={{color:T.accent,fontWeight:700}}>${p.cost.toFixed(5)}</span>
              {p.reused&&<span style={{color:T.accent2,fontWeight:700}}>• REUSED</span>}
            </div>
            <span style={{fontSize:9,fontWeight:600,color:T.accent2,letterSpacing:".08em"}}>✓ DATA NEVER SENT TO LLM</span>
          </div>
        )}

        {/* Follow-up questions */}
        {p.followups?.length>0&&(
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            <div style={{fontSize:9,fontWeight:700,color:T.textFaint,letterSpacing:".14em",marginBottom:2}}>FOLLOW-UP QUESTIONS</div>
            {p.followups.map((q,i)=>(
              <button key={i} className="fup-btn"
                onClick={()=>document.dispatchEvent(new CustomEvent("klarix-followup",{detail:q,bubbles:true}))}
                style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px",background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,cursor:"pointer",textAlign:"left",fontSize:12,color:T.textSub,fontFamily:"inherit",width:"100%",lineHeight:1.5}}>
                <span style={{fontSize:16,color:T.accent,fontWeight:300,flexShrink:0,lineHeight:1}}>›</span>
                <span style={{flex:1}}>{q}</span>
                <span style={{fontSize:10,color:T.textFaint,flexShrink:0}}>Ask →</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DATA TABLE ───────────────────────────────────────────────────────────────
function DataTable({table, T}) {
  if (!table?.headers?.length||!table?.rows?.length) return (
    <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,padding:"16px",fontSize:12,color:T.textFaint,textAlign:"center"}}>Query returned 0 rows.</div>
  );
  return (
    <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden",boxShadow:T.shadow}}>
      <div style={{overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",width:"100%",fontSize:12}}>
          <thead>
            <tr style={{background:T.bgDeep}}>
              {table.headers.map((h,i)=>(
                <th key={i} style={{padding:"9px 16px",textAlign:"left",color:T.accent,fontWeight:700,fontSize:9,letterSpacing:".1em",whiteSpace:"nowrap",borderBottom:`1px solid ${T.border}`}}>{String(h).toUpperCase()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row,i)=>(
              <tr key={i} style={{borderBottom:`1px solid ${T.borderSub}`,background:i%2===0?"transparent":T.bgDeep+"80",transition:"background .1s"}}
                onMouseEnter={e=>e.currentTarget.style.background=T.bgHover}
                onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"transparent":T.bgDeep+"80"}>
                {row.map((cell,j)=>(
                  <td key={j} style={{padding:"8px 16px",color:T.textSub,whiteSpace:"nowrap",fontSize:12}}>{cell==null?"—":String(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{padding:"6px 16px",background:T.bgDeep,fontSize:9,fontWeight:600,color:T.textFaint,letterSpacing:".08em"}}>{table.rows.length} row{table.rows.length!==1?"s":""}</div>
    </div>
  );
}

// ─── MINI CHART ───────────────────────────────────────────────────────────────
function MiniChart({rows, headers, numCol, isTimeSeries, T}) {
  const [hov, setHov] = useState(null);
  const labelCol = 0;
  const nc = numCol ?? 1;
  const vals = rows.map(r => { const v = parseFloat(r[nc]); return isNaN(v) ? 0 : v; });
  const mx = Math.max(...vals, 1);
  const mn = Math.min(...vals.filter(v=>v>0), 0);
  const fmt = v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(1)}k` : Number.isInteger(v) ? String(v) : v.toFixed(1);

  // Contrasting bar colors — solid and visible in both themes
  const DARK_MODE = T.bg === "#0d1117";
  const barBase   = DARK_MODE ? "#4f8ef7" : "#2563eb";   // solid blue
  const barBg     = DARK_MODE ? "#4f8ef733" : "#2563eb22"; // 20% fill for unselected
  const barHover  = DARK_MODE ? "#10d9a0" : "#059669";    // emerald on hover
  const gridLine  = DARK_MODE ? "#2a354822" : "#e2e8f044";
  const labelClr  = T.textFaint;
  const W = 540, H = 120, PAD_L = 44, PAD_B = 28, PAD_T = 18, PAD_R = 12;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_B - PAD_T;

  // Y-axis gridlines + labels
  const gridCount = 4;
  const yTicks = Array.from({length: gridCount+1}, (_,i) => i/gridCount);

  const barW = Math.max(8, Math.floor((chartW / rows.length) * 0.65));
  const barGap = chartW / rows.length;

  const toY = v => PAD_T + chartH - Math.max(2, (v / mx) * chartH);
  const toX = i => PAD_L + barGap * i + barGap * 0.5;

  // Line chart points for time series
  const linePoints = vals.map((v,i) => `${toX(i)},${toY(v)}`).join(" ");
  const areaPoints = `${toX(0)},${PAD_T+chartH} ${linePoints} ${toX(vals.length-1)},${PAD_T+chartH}`;

  return (
    <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,padding:"14px 16px",boxShadow:T.shadow}}>
      {/* Title + tooltip */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:9,fontWeight:700,color:T.textFaint,letterSpacing:".12em"}}>
            {String(headers[nc]).toUpperCase()} BY {String(headers[labelCol]).toUpperCase()}
          </span>
          <span style={{fontSize:9,padding:"1px 7px",background:isTimeSeries?(DARK_MODE?"#10d9a015":"#f0fdf4"):(DARK_MODE?"#4f8ef715":"#eff6ff"),border:`1px solid ${isTimeSeries?(DARK_MODE?"#10d9a030":"#a7f3d0"):(DARK_MODE?"#4f8ef730":"#bfdbfe")}`,borderRadius:10,color:isTimeSeries?T.accent2:T.accent}}>
            {isTimeSeries ? "line" : "bar"}
          </span>
        </div>
        {hov!=null && (
          <div style={{background:T.bgDeep,border:`1px solid ${barBase}44`,borderRadius:8,padding:"4px 12px",fontSize:11}}>
            <span style={{color:T.textFaint,fontSize:9,marginRight:6}}>{String(rows[hov][labelCol])}</span>
            <span style={{fontWeight:700,color:barBase,fontSize:14}}>{fmt(vals[hov])}</span>
          </div>
        )}
      </div>

      {/* SVG Chart */}
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{overflow:"visible",display:"block"}}>
        {/* Grid lines + Y labels */}
        {yTicks.map((pct,i) => {
          const yVal = mx * pct;
          const y = PAD_T + chartH * (1 - pct);
          return (
            <g key={i}>
              <line x1={PAD_L} y1={y} x2={W-PAD_R} y2={y} stroke={i===0?T.border:gridLine} strokeWidth={i===0?1.5:1}/>
              <text x={PAD_L-6} y={y+3.5} textAnchor="end" fontSize={8} fill={labelClr} fontFamily="inherit">{fmt(yVal)}</text>
            </g>
          );
        })}

        {isTimeSeries ? (
          // ── LINE CHART ──
          <g>
            {/* Area fill */}
            <polygon points={areaPoints} fill={barBase} opacity={DARK_MODE?0.12:0.08}/>
            {/* Line */}
            <polyline points={linePoints} fill="none" stroke={barBase} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"/>
            {/* Points */}
            {vals.map((v,i) => {
              const cx=toX(i), cy=toY(v), isH=hov===i;
              return (
                <g key={i}>
                  <circle cx={cx} cy={cy} r={isH?7:4}
                    fill={isH?barHover:barBase} stroke={T.bgCard} strokeWidth={2}
                    style={{cursor:"pointer",transition:"r .15s"}}
                    onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}/>
                  {isH&&<circle cx={cx} cy={cy} r={12} fill={barHover} opacity={0.15}/>}
                </g>
              );
            })}
          </g>
        ) : (
          // ── BAR CHART ──
          <g>
            {vals.map((v,i) => {
              const cx=toX(i), bh=Math.max(2,(v/mx)*chartH), by=PAD_T+chartH-bh, isH=hov===i;
              const fill = isH ? barHover : barBase;
              return (
                <g key={i} style={{cursor:"pointer"}} onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}>
                  {/* Background bar (full height, subtle) */}
                  <rect x={cx-barW/2} y={PAD_T} width={barW} height={chartH} rx={3} fill={isH?barHover+"18":barBg}/>
                  {/* Value bar */}
                  <rect x={cx-barW/2} y={by} width={barW} height={bh} rx={3} fill={fill} opacity={isH?1:0.85}/>
                  {/* Top accent */}
                  <rect x={cx-barW/2} y={by} width={barW} height={3} rx={2} fill={fill}/>
                  {/* Value label above bar */}
                  {(isH || rows.length <= 6) && (
                    <text x={cx} y={by-5} textAnchor="middle" fontSize={8} fontWeight="700" fill={isH?fill:T.textMuted} fontFamily="inherit">{fmt(v)}</text>
                  )}
                </g>
              );
            })}
          </g>
        )}

        {/* X axis labels */}
        {rows.map((r,i) => {
          const cx = toX(i);
          const label = String(r[labelCol]).slice(0, rows.length > 7 ? 6 : 10);
          return (
            <text key={i} x={cx} y={H-6} textAnchor="middle" fontSize={8} fill={hov===i?T.textSub:labelClr} fontFamily="inherit"
              fontWeight={hov===i?"700":"400"}>
              {label}
            </text>
          );
        })}
      </svg>

      {/* Legend: all series if multiple numeric cols */}
      {headers.length > 2 && (
        <div style={{display:"flex",gap:12,marginTop:8,flexWrap:"wrap"}}>
          {[nc].map(j=>(
            <div key={j} style={{display:"flex",alignItems:"center",gap:5,fontSize:9,color:T.textMuted}}>
              <div style={{width:12,height:3,borderRadius:2,background:barBase}}/>
              {headers[j]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Md({text, T}) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((p,i)=>p.startsWith("**")?<strong key={i} style={{color:T.text,fontWeight:700}}>{p.slice(2,-2)}</strong>:<span key={i} style={{color:T.textSub}}>{p}</span>)}</>;
}
