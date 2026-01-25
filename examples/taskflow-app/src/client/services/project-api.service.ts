import { ApiClient } from "./api.service";
import { Project } from "../../shared/types";

export class ProjectApiService {
  constructor(private api: ApiClient) {}

  async getProject(id: string): Promise<Project> {
    throw new Error("Not implemented");
  }

  async getTeamProjects(teamId: string): Promise<Project[]> {
    throw new Error("Not implemented");
  }

  async createProject(data: any): Promise<Project> {
    throw new Error("Not implemented");
  }

  async updateProject(id: string, data: any): Promise<Project> {
    throw new Error("Not implemented");
  }

  async deleteProject(id: string): Promise<void> {}
}
