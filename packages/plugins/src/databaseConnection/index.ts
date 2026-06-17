import { Client as PgClient } from 'pg'; // PostgreSQL 客户端
import mysql from 'mysql2/promise'; // MySQL 客户端
import oracledb from 'oracledb';
// @ts-ignore
import mssql from 'mssql'; // SQL Server 客户端

type Props = {
  databaseType: string;
  host: string;
  port: string;
  databaseName: string;
  user: string;
  password: string;
  sql: string;
};

type Response = Promise<{
  result: unknown;
}>;

type OracleExecuteResult = {
  rows?: unknown[];
  rowsAffected?: number;
};

const formatOracleExecuteResult = (res: OracleExecuteResult): unknown => {
  if (Array.isArray(res.rows)) {
    return res.rows;
  }

  return {
    rowsAffected: res.rowsAffected ?? 0
  };
};

const getOraclePort = (port: string): number => {
  const portNumber = parseInt(port, 10);

  return Number.isNaN(portNumber) ? 1521 : portNumber;
};

const main = async ({
  databaseType,
  host,
  port,
  databaseName,
  user,
  password,
  sql
}: Props): Response => {
  let result;

  try {
    if (databaseType === 'PostgreSQL') {
      const client = new PgClient({
        host,
        port: parseInt(port, 10),
        database: databaseName,
        user,
        password
      });

      await client.connect();
      const res = await client.query(sql);
      result = res.rows;
      await client.end();
    } else if (databaseType === 'MySQL') {
      const connection = await mysql.createConnection({
        host,
        port: parseInt(port, 10),
        database: databaseName,
        user,
        password
      });

      const [rows] = await connection.execute(sql);
      result = rows;
      await connection.end();
    } else if (databaseType === 'Microsoft SQL Server') {
      const pool = await mssql.connect({
        server: host,
        port: parseInt(port, 10),
        database: databaseName,
        user,
        password,
        options: {
          trustServerCertificate: true
        }
      });
      result = await pool.query(sql);
      await pool.close();
    } else if (databaseType === 'Oracle') {
      const connection = await oracledb.getConnection({
        user,
        password,
        connectString: `${host}:${getOraclePort(port)}/${databaseName}`
      });

      try {
        const res = await connection.execute(sql, [], {
          autoCommit: true,
          outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        result = formatOracleExecuteResult(res);
      } finally {
        await connection.close().catch(() => {});
      }
    } else {
      throw new Error(`Unsupported database type: ${databaseType}`);
    }
    return {
      result
    };
  } catch (error: unknown) {
    // 使用类型断言来处理错误
    if (error instanceof Error) {
      console.error('Database query error:', error.message);
      throw new Error(`Database query error: ${error.message}`);
    } else {
      console.error('Database query error:', error);
      throw new Error('Database query error: An unknown error occurred');
    }
  }
};

export default main;
