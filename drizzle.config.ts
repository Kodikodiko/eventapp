import { defineConfig } from 'drizzle-kit';

// Nur für `npm run db:generate` (SQL-Migrationen aus schema.ts erzeugen) und `npm run db:studio`.
// Migrationen werden NICHT mit drizzle-kit eingespielt, sondern beim App-Start (src/server/db/migrate.ts).
export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_PATH || 'data/eventflow.db',
  },
});
