import { Project } from "../../../shared/types";
import { Database } from "../connection";

export class ProjectRepository {
  constructor(private db: Database) {}

  async findById(id: string): Promise<Project | null> {
    return null;
  }

  async findByTeam(teamId: string): Promise<Project[]> {
    return [];
  }

  async create(project: Omit<Project, "id" | "createdAt" | "updatedAt">): Promise<Project> {
    throw new Error("Not implemented");
  }

  async update(id: string, project: Partial<Project>): Promise<Project | null> {
    return null;
  }

  async delete(id: string): Promise<boolean> {
    return false;
  }
}
