import type { Project, CreateProjectInput } from "../models/project.js";

export class ProjectService {
  async create(input: CreateProjectInput): Promise<Project> {
    throw new Error("Not implemented");
  }

  async findById(id: string): Promise<Project | null> {
    throw new Error("Not implemented");
  }

  async addMember(projectId: string, userId: string): Promise<Project> {
    throw new Error("Not implemented");
  }

  async removeMember(projectId: string, userId: string): Promise<Project> {
    throw new Error("Not implemented");
  }

  async listForUser(userId: string): Promise<Project[]> {
    throw new Error("Not implemented");
  }
}
