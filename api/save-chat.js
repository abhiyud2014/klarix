import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { title, messages, totalCost, totalTokens } = req.body;
    
    const sql = neon(process.env.DATABASE_URL);
    
    const sessions = await sql`
      INSERT INTO chat_sessions (title, total_cost, total_tokens_in, total_tokens_out)
      VALUES (${title}, ${totalCost}, ${totalTokens.in}, ${totalTokens.out})
      RETURNING id, created_at
    `;
    
    const sessionId = sessions[0].id;
    
    for (const msg of messages) {
      await sql`
        INSERT INTO chat_messages (session_id, role, type, content, sql_query, result_data)
        VALUES (
          ${sessionId},
          ${msg.role},
          ${msg.type || null},
          ${msg.content || null},
          ${msg.sql || null},
          ${msg.result ? JSON.stringify(msg.result) : null}
        )
      `;
    }
    
    res.json({ id: sessionId, created_at: sessions[0].created_at });
  } catch (error) {
    console.error('Save chat error:', error);
    res.status(500).json({ error: error.message });
  }
}
