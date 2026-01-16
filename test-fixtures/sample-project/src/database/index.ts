export interface Database {
  users: {
    create: <T>(data: T) => Promise<T>;
    update: <T>(id: string, data: Partial<T>) => Promise<T>;
    delete: (id: string) => Promise<void>;
  };
}

export const db: Database = {
  users: {
    create: async (data) => data,
    update: async (id, data) => data as any,
    delete: async () => {},
  },
};

export async function query<T>(sql: string, params: unknown[]): Promise<T | null> {
  // Mock implementation
  return null;
}

export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  return fn();
}
