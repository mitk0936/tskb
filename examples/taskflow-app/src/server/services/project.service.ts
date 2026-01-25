import { Project, ProjectMember, ProjectStatus } from "../../shared/types";

export class ProjectService {
  async getById(id: string): Promise<Project | null> {
    return null;
  }

  async getByTeam(teamId: string): Promise<Project[]> {
    return [];
  }

  async create(projectData: Omit<Project, "id" | "createdAt" | "updatedAt">): Promise<Project> {
    throw new Error("Not implemented");
  }

  async update(id: string, projectData: Partial<Project>): Promise<Project | null> {
    return null;
  }

  async delete(id: string): Promise<boolean> {
    return false;
  }

  async updateStatus(id: string, status: ProjectStatus): Promise<Project | null> {
    return null;
  }

  async addMember(
    projectId: string,
    userId: string,
    role: ProjectMember["role"]
  ): Promise<ProjectMember> {
    throw new Error("Not implemented");
  }

  async removeMember(projectId: string, userId: string): Promise<boolean> {
    return false;
  }

  async getMembers(projectId: string): Promise<ProjectMember[]> {
    return [];
  }
}
