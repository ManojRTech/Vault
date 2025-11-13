import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();  

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const query = (text, params) => pool.query(text, params);
