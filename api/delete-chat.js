import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Session ID required' });
    }
    
    const sql = neon(process.env.DATABASE_URL);
    
    await sql`DELETE FROM chat_sessions WHERE id = ${parseInt(id)}`;
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete chat error:', error);
    res.status(500).json({ error: error.message });
  }
}
