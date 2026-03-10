# PostgreSQL Setup Guide (Neon)

## 1. Create Neon Database

1. Go to https://neon.tech
2. Sign up (free tier available)
3. Create a new project: "klarix-db"
4. Copy the connection string (starts with `postgresql://`)

## 2. Initialize Database

Run the SQL script in Neon SQL Editor:
```bash
# Copy contents of database/init.sql and paste in Neon SQL Editor
```

Or use psql:
```bash
psql "YOUR_CONNECTION_STRING" -f database/init.sql
```

## 3. Configure Vercel

Add environment variable in Vercel dashboard:
- Key: `DATABASE_URL`
- Value: Your Neon connection string
- Key: `VITE_USE_POSTGRES`
- Value: `true`

## 4. Local Development

Create `.env.local`:
```
DATABASE_URL=postgresql://user:pass@host/db
VITE_USE_POSTGRES=true
```

## 5. Deploy

```bash
git add -A
git commit -m "Add PostgreSQL support with Neon"
git push
```

Vercel will auto-deploy.

## Toggle Between AlaSQL and PostgreSQL

- **AlaSQL (in-browser)**: Remove `VITE_USE_POSTGRES` env var
- **PostgreSQL**: Set `VITE_USE_POSTGRES=true`
