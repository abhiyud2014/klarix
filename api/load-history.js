import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    
    const sessions = await sql`
      SELECT id, title, total_cost, total_tokens_in, total_tokens_out, created_at
      FROM chat_sessions
      ORDER BY created_at DESC
      LIMIT 20
    `;
    
    const history = sessions.map(s => ({
      id: s.id,
      title: s.title,
      totalCost: parseFloat(s.total_cost),
      totalTokens: { in: s.total_tokens_in, out: s.total_tokens_out },
      time: new Date(s.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      date: new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    }));
    
    res.json(history);
  } catch (error) {
    console.error('Load history error:', error);
    res.status(500).json({ error: error.message });
  }
}
