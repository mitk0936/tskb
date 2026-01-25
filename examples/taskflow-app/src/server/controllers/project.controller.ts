import { ProjectService } from "../services/project.service";

export class ProjectController {
  constructor(private projectService: ProjectService) {}

  async getProject(id: string) {}

  async getTeamProjects(teamId: string) {}

  async createProject(data: any) {}

  async updateProject(id: string, data: any) {}

  async deleteProject(id: string) {}

  async updateStatus(id: string, status: string) {}

  async addMember(projectId: string, userId: string, role: string) {}

  async removeMember(projectId: string, userId: string) {}

  async getMembers(projectId: string) {}
}
