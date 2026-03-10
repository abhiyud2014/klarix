import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sql: query } = req.body;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Invalid SQL query' });
    }

    const sql = neon(process.env.DATABASE_URL);
    const result = await sql(query);
    
    if (!result || result.length === 0) {
      return res.json({ rows: [], headers: [] });
    }

    const headers = Object.keys(result[0]);
    const rows = result.map(row => headers.map(h => row[h] ?? null));
    
    res.json({ rows, headers });
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ error: error.message });
  }
}
