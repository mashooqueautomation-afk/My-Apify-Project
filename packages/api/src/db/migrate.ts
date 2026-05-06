/**
 * WebMiner Database Migration System
 * Runs versioned SQL migration files in order
 * Usage: npx ts-node src/db/migrate.ts [up|down|status]
 */

import 'dotenv/config';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// ─── Bootstrap migrations table ───────────────────────────────────────────────
async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          SERIAL PRIMARY KEY,
      version     VARCHAR(20)  NOT NULL UNIQUE,
      name        VARCHAR(255) NOT NULL,
      checksum    VARCHAR(64)  NOT NULL,
      applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      duration_ms INTEGER
    )
  `);
}

// ─── Get all migration files ──────────────────────────────────────────────────
interface MigrationFile {
  version: string;
  name: string;
  filename: string;
  filepath: string;
  checksum: string;
  sql: string;
}

function loadMigrationFiles(): MigrationFile[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
    return [];
  }

  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !f.endsWith('.down.sql') && /^\d{4}_/.test(f))
    .sort()
    .map(filename => {
      const filepath = path.join(MIGRATIONS_DIR, filename);
      const sql      = fs.readFileSync(filepath, 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex').slice(0, 16);
      const [version, ...nameParts] = filename.replace('.sql', '').split('_');
      return { version, name: nameParts.join('_'), filename, filepath, checksum, sql };
    });
}

// ─── Get applied migrations ───────────────────────────────────────────────────
async function getAppliedMigrations(): Promise<Map<string, string>> {
  const result = await pool.query('SELECT version, checksum FROM schema_migrations ORDER BY version');
  return new Map(result.rows.map(r => [r.version, r.checksum]));
}

// ─── Run pending migrations ───────────────────────────────────────────────────
async function migrateUp(): Promise<void> {
  await ensureMigrationsTable();

  const files   = loadMigrationFiles();
  const applied = await getAppliedMigrations();
  const pending = files.filter(f => !applied.has(f.version));

  if (pending.length === 0) {
    console.log('✅ Database is up to date. No pending migrations.');
    return;
  }

  console.log(`\n📦 Found ${pending.length} pending migration(s):`);

  for (const migration of pending) {
    console.log(`\n⏳ Applying: ${migration.version}_${migration.name}`);
    const start = Date.now();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query(
        `INSERT INTO schema_migrations (version, name, checksum, duration_ms)
         VALUES ($1, $2, $3, $4)`,
        [migration.version, migration.name, migration.checksum, Date.now() - start]
      );
      await client.query('COMMIT');
      console.log(`✅ Applied ${migration.version}_${migration.name} in ${Date.now() - start}ms`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`❌ Migration failed: ${migration.version}_${migration.name}`);
      console.error(err);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log(`\n🎉 Applied ${pending.length} migration(s) successfully`);
}

// ─── Rollback last migration ──────────────────────────────────────────────────
async function migrateDown(): Promise<void> {
  await ensureMigrationsTable();

  const result = await pool.query(
    'SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT 1'
  );

  if (!result.rows.length) {
    console.log('No migrations to rollback');
    return;
  }

  const last = result.rows[0];

  // Look for matching .down.sql file
  const downFile = path.join(MIGRATIONS_DIR, `${last.version}_${last.name}.down.sql`);
  if (!fs.existsSync(downFile)) {
    console.error(`❌ No rollback file found: ${downFile}`);
    console.error('Create a .down.sql file for this migration to enable rollback');
    process.exit(1);
  }

  const sql    = fs.readFileSync(downFile, 'utf8');
  const client = await pool.connect();

  try {
    console.log(`Rolling back: ${last.version}_${last.name}`);
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('DELETE FROM schema_migrations WHERE version = $1', [last.version]);
    await client.query('COMMIT');
    console.log(`✅ Rolled back: ${last.version}_${last.name}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Rollback failed:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

// ─── Show migration status ────────────────────────────────────────────────────
async function migrateStatus(): Promise<void> {
  await ensureMigrationsTable();

  const files   = loadMigrationFiles();
  const applied = await getAppliedMigrations();

  console.log('\n📊 Migration Status\n');
  console.log('Version   Name                              Status      Applied');
  console.log('─'.repeat(70));

  for (const f of files) {
    const isApplied  = applied.has(f.version);
    const statusIcon = isApplied ? '✅' : '⏳';
    const status     = isApplied ? 'APPLIED   ' : 'PENDING   ';
    console.log(`${f.version}  ${f.name.padEnd(35)} ${statusIcon} ${status}`);
  }

  const pendingCount = files.filter(f => !applied.has(f.version)).length;
  console.log(`\nTotal: ${files.length} migrations, ${applied.size} applied, ${pendingCount} pending\n`);
}

// ─── Create new migration file ────────────────────────────────────────────────
function createMigration(name: string): void {
  const version    = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const filename   = `${version}_${name.replace(/\s+/g, '_').toLowerCase()}.sql`;
  const filepath   = path.join(MIGRATIONS_DIR, filename);
  const downpath   = path.join(MIGRATIONS_DIR, filename.replace('.sql', '.down.sql'));

  if (!fs.existsSync(MIGRATIONS_DIR)) fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });

  fs.writeFileSync(filepath, `-- Migration: ${name}\n-- Version: ${version}\n\n-- Add your SQL here\n`);
  fs.writeFileSync(downpath, `-- Rollback: ${name}\n\n-- Add rollback SQL here\n`);

  console.log(`✅ Created migration: ${filename}`);
  console.log(`✅ Created rollback:  ${filename.replace('.sql', '.down.sql')}`);
}

// ─── CLI entry point ──────────────────────────────────────────────────────────
const command = process.argv[2] || 'up';
const arg     = process.argv[3];

async function main() {
  switch (command) {
    case 'up':
      await migrateUp();
      break;
    case 'down':
      await migrateDown();
      break;
    case 'status':
      await migrateStatus();
      break;
    case 'create':
      if (!arg) { console.error('Usage: migrate create <migration-name>'); process.exit(1); }
      createMigration(arg);
      break;
    default:
      console.error(`Unknown command: ${command}. Use: up | down | status | create <name>`);
      process.exit(1);
  }
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => pool.end());
