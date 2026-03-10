import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Session ID required' });
    }
    
    const sql = neon(process.env.DATABASE_URL);
    
    const sessions = await sql`
      SELECT id, title, total_cost, total_tokens_in, total_tokens_out, created_at
      FROM chat_sessions
      WHERE id = ${parseInt(id)}
    `;
    
    if (sessions.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const messages = await sql`
      SELECT result_data
      FROM chat_messages
      WHERE session_id = ${parseInt(id)}
      ORDER BY created_at ASC
    `;
    
    const session = sessions[0];
    
    res.json({
      id: session.id,
      title: session.title,
      totalCost: parseFloat(session.total_cost),
      totalTokens: { in: session.total_tokens_in, out: session.total_tokens_out },
      messages: messages.map(m => JSON.parse(m.result_data))
    });
  } catch (error) {
    console.error('Load chat error:', error);
    res.status(500).json({ error: error.message });
  }
}
