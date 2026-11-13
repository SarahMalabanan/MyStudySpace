const pool = require("./lib/db");

async function testConnection() {
  try {
    const [rows] = await pool.query(
      "SELECT DATABASE() AS database_name"
    );

    console.log("Connected to:", rows[0].database_name);
  } catch (error) {
    console.error("Connection failed:", error.code);
  } finally {
    await pool.end();
  }
}

testConnection();