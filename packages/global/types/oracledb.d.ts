declare module 'oracledb' {
  export const OUT_FORMAT_OBJECT: number;

  export type ExecuteOptions = {
    autoCommit?: boolean;
    outFormat?: number;
  };

  export type ExecuteResult = {
    rows?: unknown[];
    rowsAffected?: number;
  };

  export type Connection = {
    execute(
      sql: string,
      binds?: unknown[] | Record<string, unknown>,
      options?: ExecuteOptions
    ): Promise<ExecuteResult>;
    close(options?: { drop?: boolean }): Promise<void>;
  };

  export type ConnectionAttributes = {
    user: string;
    password: string;
    connectString: string;
  };

  const oracledb: {
    OUT_FORMAT_OBJECT: typeof OUT_FORMAT_OBJECT;
    getConnection(config: ConnectionAttributes): Promise<Connection>;
  };

  export default oracledb;
}
