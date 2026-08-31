const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log(`Connected to MySQL database "${process.env.DB_NAME}".`);
    connection.release();
  } catch (error) {
    console.error('Unable to connect to MySQL. Check your .env settings and make sure MySQL is running.');
    console.error(error.message);
  }
}

testConnection();

module.exports = pool;
