// scripts/seed-db.js
// Seeds the PostgreSQL database with the University Management System demonstration schema.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function seed() {
  const host = process.env.DBFLOW_POSTGRES_HOST || '127.0.0.1';
  const port = parseInt(process.env.DBFLOW_POSTGRES_PORT || '5433', 10);
  const user = process.env.DBFLOW_POSTGRES_USER || 'dbflow';
  const password = process.env.DBFLOW_POSTGRES_PASSWORD || 'dbflow_local_only';
  const database = process.env.DBFLOW_POSTGRES_DB || 'dbflow_demo';

  console.log(`Connecting to PostgreSQL at ${host}:${port}/${database} as ${user}...`);

  const client = new Client({ host, port, user, password, database });

  try {
    await client.connect();
    console.log('Connected successfully. Reading SQL seed script...');

    const sqlPath = path.join(__dirname, '..', 'db', 'postgres', 'init', '002_university_demo.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log(`Executing SQL script (${(sql.length / 1024).toFixed(1)} KB)...`);
    await client.query(sql);

    console.log('✅ University Management System seed data successfully inserted into dbflow_demo!');
    console.log('Tables created: departments, professors, students, courses, enrollments, attendance, assignments, submissions');
  } catch (err) {
    console.error('❌ Failed to seed database:', err.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

seed();
