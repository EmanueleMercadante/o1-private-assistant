const { Pool } = require('pg');

// Se stai su Vercel, per evitare di ricreare la pool a ogni invocation:
if (!global._pgPool) {
  global._pgPool = new Pool({
    connectionString: process.env.DATABASE_URL, 
    // Se ti serve SSL in Postgres, puoi aggiungere:
    // ssl: {
    //   rejectUnauthorized: false
    // }
  });
}

const pool = global._pgPool;  // Riferimento unificato

module.exports = pool;