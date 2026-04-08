const mysql = require("mysql2/promise");
const BetterSqlite3 = require("better-sqlite3");
const { Pool } = require("pg");
const config = require("../config");

console.log("Initializing Drizzle adapter (wrapper)");

let mysqlPool = null;
let pgPool = null;
let sqliteDb = null;

module.exports = {
  async getConnection() {
    const dbType = process.env.DB_TYPE || "mysql";

    if (dbType === "mysql") {
      if (!mysqlPool) {
        mysqlPool = mysql.createPool({
          ...config.mysql,
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0,
        });
      }

      const conn = await mysqlPool.getConnection();

      return {
        beginTransaction: () => conn.beginTransaction(),
        commit: () => conn.commit(),
        rollback: () => conn.rollback(),
        release: () => conn.release(),
        query: async (sql, params = []) => {
          const [rows] = await conn.query(sql, params);
          return [rows];
        },
      };
    } else if (dbType === "supabase") {
      if (!pgPool) {
        pgPool = new Pool({
          connectionString: process.env.SUPABASE_DB_URL,
          ssl: {
            rejectUnauthorized: false,
          },
        });
      }

      const client = await pgPool.connect();

      return {
        beginTransaction: () => client.query("BEGIN"),
        commit: () => client.query("COMMIT"),
        rollback: () => client.query("ROLLBACK"),
        release: () => client.release(),
        query: async (sql, params = []) => {
          const res = await client.query(sql, params);
          return [res.rows];
        },
      };
    } else if (dbType === "sqlite") {
      if (!sqliteDb) {
        sqliteDb = new BetterSqlite3(process.env.SQLITE_FILE || "./data.db");
      }

      return {
        beginTransaction: () => sqliteDb.prepare("BEGIN").run(),
        commit: () => sqliteDb.prepare("COMMIT").run(),
        rollback: () => sqliteDb.prepare("ROLLBACK").run(),
        release: () => {},
        query: (sql, params = []) => {
          const stmt = sqliteDb.prepare(sql);
          if (sql.trim().toUpperCase().startsWith("SELECT")) {
            return [stmt.all(params)];
          } else {
            const result = stmt.run(params);
            return [{ insertId: result.lastInsertRowid }];
          }
        },
      };
    } else {
      throw new Error("Unsupported DB_TYPE for drizzle adapter: " + dbType);
    }
  },
};
