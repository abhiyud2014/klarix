-- Chat History Tables

CREATE TABLE IF NOT EXISTS chat_sessions (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200),
  total_cost DECIMAL(10,5),
  total_tokens_in INT,
  total_tokens_out INT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  session_id INT REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20),
  type VARCHAR(20),
  content TEXT,
  sql_query TEXT,
  result_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_chat_sessions_created ON chat_sessions(created_at DESC);
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);
