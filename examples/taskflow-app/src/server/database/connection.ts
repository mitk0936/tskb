export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export class Database {
  constructor(private config: DatabaseConfig) {}

  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {}

  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    return [];
  }

  async execute(sql: string, params?: any[]): Promise<void> {}

  async transaction<T>(callback: () => Promise<T>): Promise<T> {
    throw new Error("Not implemented");
  }
}
