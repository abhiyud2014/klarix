# KLARix Chat - AI Data Analyst

A full-featured Text-to-SQL application powered by Claude AI that converts natural language questions into SQL queries and visualizes results.

## Features

- 🤖 Natural language to SQL conversion using Claude Sonnet 4
- 📊 Interactive data visualization (bar charts, line charts)
- 📋 Multiple database tables support
- 💾 Chat history management
- 📄 Export to PDF and PPTX
- 🌓 Dark/Light theme toggle
- 💰 Token usage and cost tracking

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Anthropic API key

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure API key:
   - Copy `.env.example` to `.env`
   - Add your Anthropic API key:
```
VITE_ANTHROPIC_API_KEY=your_actual_api_key_here
```

Get your API key from: https://console.anthropic.com/

## Run the Application

Development mode:
```bash
npm run dev
```

The app will open at `http://localhost:5173`

Build for production:
```bash
npm run build
```

Preview production build:
```bash
npm run preview
```

## Usage

1. Type your question in natural language (e.g., "Top 5 products by revenue")
2. The AI generates SQL and executes it on the in-browser database
3. View results as tables and charts
4. Export selected Q&A pairs to PDF or PPTX

## Database

Currently uses AlaSQL (in-browser SQL engine) with sample data. To connect to a real database:

1. Replace the `executeSQL()` function in `src/App.jsx`
2. Point it to your backend API endpoint
3. Update the SCHEMA constant with your actual database schema

## Tech Stack

- React 18
- Vite
- Claude Sonnet 4 (Anthropic API)
- AlaSQL (in-browser SQL)
- jsPDF & pptxgenjs (export functionality)

## License

MIT
