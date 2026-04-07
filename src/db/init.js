const fs = require("fs");
const path = require("path");
const pool = require("./pool");

const SQL_FILE = path.join(__dirname, "..", "..", "notify.sql");

function extractCreateTables(sqlText) {
  const regex = /CREATE TABLE\s+`([^`]*)`\s*\(([^;]+?)\)\s*([^;]*);/gims;
  const tables = {};
  let m;
  while ((m = regex.exec(sqlText)) !== null) {
    const name = m[1];
    const body = m[2];
    const suffix = m[3] || "";
    tables[name] = { raw: m[0], body, suffix };
  }
  return tables;
}

function mysqlCreateStatement(raw) {
  // convert CREATE TABLE ... to CREATE TABLE IF NOT EXISTS ...
  return raw.replace(/CREATE TABLE/i, "CREATE TABLE IF NOT EXISTS");
}

function sqliteCreateStatement(name, raw) {
  // Build a SQLite-friendly CREATE statement by parsing the column list
  let s = raw;
  s = s.replace(/AUTO_INCREMENT/gi, "");
  s = s.replace(/AUTO_INCREMENT=\d+/gi, "");
  s = s.replace(/ENGINE=\w+[^;]*/gi, "");
  s = s.replace(/DEFAULT CHARSET=[^;]*/gi, "");
  s = s.replace(/CHARACTER SET\s+\w+(\s+COLLATE\s+\w+)?/gi, "");
  s = s.replace(/COLLATE\s+\w+/gi, "");
  s = s.replace(/`/g, "");

  // extract the table name and the parenthesized body
  const match = s.match(
    /CREATE TABLE\s+([^\(]+)\s*\((([\s\S]*))\)\s*([^;]*);?/i,
  );
  if (!match) return s;
  const tableName = match[1].trim();
  let body = match[2];

  // split by commas but keep parentheses content intact (simple split, robust enough for typical DDL)
  // split by commas but ignore commas inside parentheses or single quotes
  const parts = [];
  let cur = "";
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    const prev = i > 0 ? body[i - 1] : null;
    if (ch === "'" && prev !== "\\") {
      inQuote = !inQuote;
      cur += ch;
      continue;
    }
    if (!inQuote) {
      if (ch === "(") {
        depth++;
        cur += ch;
        continue;
      }
      if (ch === ")") {
        depth = Math.max(0, depth - 1);
        cur += ch;
        continue;
      }
      if (ch === "," && depth === 0) {
        if (cur.trim()) parts.push(cur.trim());
        cur = "";
        continue;
      }
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());

  // filter out MySQL-specific index/constraint lines and convert types
  const keep = [];
  for (let line of parts) {
    const orig = line;
    line = line.replace(/\benum\s*\([^\)]*\)/gi, "TEXT");
    line = line.replace(/\bjson\b/gi, "TEXT");

    // skip index/constraint lines
    if (/^(UNIQUE\s+KEY|UNIQUE|KEY|INDEX|FULLTEXT|CONSTRAINT)\b/i.test(line))
      continue;

    keep.push(line);
  }

  // remove any trailing commas or empty entries and rejoin
  let cleanedBody = keep.join(",\n  ");
  cleanedBody = cleanedBody.replace(/,\s*\)/g, ")");

  const stmt = `CREATE TABLE IF NOT EXISTS ${tableName} (\n  ${cleanedBody}\n)`;
  return stmt;
}

async function initDb() {
  if (!fs.existsSync(SQL_FILE)) {
    console.error("notify.sql not found at", SQL_FILE);
    process.exit(1);
  }

  const sqlText = fs.readFileSync(SQL_FILE, "utf8");
  const tables = extractCreateTables(sqlText);

  // desired creation order to satisfy FK dependencies
  const order = [
    "notifications",
    "notification_targets",
    "notification_queue",
    "delivery_logs",
  ];

  const dbType = process.env.DB_TYPE || "mysql";

  const conn = await pool.getConnection();
  try {
    for (const name of order) {
      const t = tables[name];
      if (!t) {
        console.warn("No CREATE statement found for table:", name);
        continue;
      }

      let stmt = t.raw;
      if (dbType === "mysql") {
        stmt = mysqlCreateStatement(stmt);
      } else if (dbType === "sqlite") {
        stmt = sqliteCreateStatement(name, stmt);
      }

      console.log(`Creating table if not exists: ${name}`);
      try {
        await conn.query(stmt);
        console.log(`OK: ${name}`);
      } catch (err) {
        console.error(`Failed to create ${name}:`, err.message);
      }
    }
  } finally {
    try {
      conn.release();
    } catch (e) {}
  }
}

if (require.main === module) {
  initDb()
    .then(() => {
      console.log("DB initialization complete");
      process.exit(0);
    })
    .catch((err) => {
      console.error("DB initialization failed:", err);
      process.exit(1);
    });
}

module.exports = { initDb };
