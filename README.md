# KLARix Chat - AI Data Analyst

A full-featured Text-to-SQL application powered by Claude AI that converts natural language questions into SQL queries and visualizes results.

## 🚀 Live Demo

**Try it now:** [https://klarix.vercel.app/](https://klarix.vercel.app/)

Deploy your own instance:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/abhiyud2014/klarix)

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/abhiyud2014/klarix)

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
- Groq API key

## Setup

1. Clone the repository:
```bash
git clone https://github.com/abhiyud2014/klarix.git
cd klarix
```

2. Install dependencies:
```bash
npm install
```

3. Configure API key:
   - Copy `.env.example` to `.env`
   - Add your Groq API key:
```
VITE_GROQ_API_KEY=your_actual_groq_api_key_here
```

Get your API key from: https://console.groq.com/

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

## Deployment

### Vercel
1. Fork this repository
2. Connect your GitHub account to Vercel
3. Import the project
4. Add environment variable: `VITE_GROQ_API_KEY`
5. Deploy

### Netlify
1. Fork this repository
2. Connect your GitHub account to Netlify
3. Import the project
4. Add environment variable: `VITE_GROQ_API_KEY`
5. Deploy

## Tech Stack

- React 18
- Vite
- Groq API (Llama 3.3 70B)
- AlaSQL (in-browser SQL)
- jsPDF & pptxgenjs (export functionality)

## License

MIT
