import { User, Team, TeamMember } from "../../shared/types";

export class UserService {
  async getById(id: string): Promise<User | null> {
    return null;
  }

  async getByEmail(email: string): Promise<User | null> {
    return null;
  }

  async create(userData: Omit<User, "id" | "createdAt" | "updatedAt">): Promise<User> {
    throw new Error("Not implemented");
  }

  async update(id: string, userData: Partial<User>): Promise<User | null> {
    return null;
  }

  async delete(id: string): Promise<boolean> {
    return false;
  }

  async getUserTeams(userId: string): Promise<Team[]> {
    return [];
  }
}
