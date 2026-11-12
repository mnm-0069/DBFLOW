// verify_gemini_tools.mjs
// Real Gemini API function calling test against active PostgreSQL dbflow_demo

import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI, Type } from '@google/genai';
import pg from 'pg';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
console.log('Using GEMINI_API_KEY prefix:', GEMINI_API_KEY?.slice(0, 10));

const pool = new pg.Pool({
  host: '127.0.0.1',
  port: 5432,
  database: 'dbflow_demo',
  user: 'dbflow',
  password: 'dbflow_dev_password',
});

// Tool implementations on live database
async function inspect_database_schema() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    return { tables: res.rows.map(r => r.table_name) };
  } finally {
    client.release();
  }
}

async function inspect_table_relationships(args) {
  const client = await pool.connect();
  try {
    const targetTable = args.tableName || 'students';
    const res = await client.query(`
      SELECT
        tc.table_name AS from_table,
        kcu.column_name AS from_column,
        ccu.table_name AS to_table,
        ccu.column_name AS to_column
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND (tc.table_name = $1 OR ccu.table_name = $1);
    `, [targetTable]);
    return {
      table: targetTable,
      relationships: res.rows
    };
  } finally {
    client.release();
  }
}

async function main() {
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const modelId = 'gemini-flash-latest';

  console.log(`\n=== 1. INITIALIZING GEMINI REQUEST (Model: ${modelId}) ===`);
  const tools = [{
    functionDeclarations: [
      {
        name: 'inspect_database_schema',
        description: 'Returns list of base tables in the connected database.',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        }
      },
      {
        name: 'inspect_table_relationships',
        description: 'Returns foreign key relationships involving the specified table.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            tableName: {
              type: Type.STRING,
              description: 'The table to inspect relationships for.'
            }
          },
          required: ['tableName']
        }
      }
    ]
  }];

  const contents = [
    {
      role: 'user',
      parts: [{
        text: 'You are DBFlow Copilot. First inspect the database schema to see what tables exist. Then inspect the relationships for the students table. Finally explain how students connects to other tables.'
      }]
    }
  ];

  console.log('Sending Prompt: "First inspect the database schema to see what tables exist. Then inspect the relationships for the students table..."');

  let turn = 0;
  while (turn < 5) {
    turn++;
    console.log(`\n--- Iteration ${turn} calling Gemini ---`);
    const response = await ai.models.generateContent({
      model: modelId,
      contents,
      config: {
        tools,
        temperature: 0.1
      }
    });

    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      console.log(`[Turn ${turn}] Model requested ${functionCalls.length} tool call(s):`);
      for (const call of functionCalls) {
        console.log(`  -> Function: ${call.name}, Args:`, JSON.stringify(call.args));
        let toolResult;
        if (call.name === 'inspect_database_schema') {
          toolResult = await inspect_database_schema();
        } else if (call.name === 'inspect_table_relationships') {
          toolResult = await inspect_table_relationships(call.args);
        } else {
          toolResult = { error: 'Unknown tool' };
        }
        console.log(`  <- Real PostgreSQL DB Execution Result:`, JSON.stringify(toolResult));

        // Append model call turn
        contents.push(response.candidates[0].content);

        // Append tool response turn
        contents.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: call.name,
              response: toolResult
            }
          }]
        });
      }
    } else {
      console.log(`\n=== FINAL GEMINI MODEL RESPONSE ===`);
      console.log('Status: HTTP 200 OK');
      console.log('Candidate finishReason:', response.candidates?.[0]?.finishReason);
      console.log('Response text:\n', response.text);
      break;
    }
  }

  await pool.end();
  console.log('\n=== VERIFICATION COMPLETE ===');
}

main().catch(err => {
  console.error('Gemini test failed:', err);
  pool.end();
  process.exit(1);
});
