import { User } from "../../../shared/types";
import { Database } from "../connection";

export class UserRepository {
  constructor(private db: Database) {}

  async findById(id: string): Promise<User | null> {
    return null;
  }

  async findByEmail(email: string): Promise<User | null> {
    return null;
  }

  async create(user: Omit<User, "id" | "createdAt" | "updatedAt">): Promise<User> {
    throw new Error("Not implemented");
  }

  async update(id: string, user: Partial<User>): Promise<User | null> {
    return null;
  }

  async delete(id: string): Promise<boolean> {
    return false;
  }
}
