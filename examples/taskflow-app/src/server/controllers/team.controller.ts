import { TeamService } from "../services/team.service";

export class TeamController {
  constructor(private teamService: TeamService) {}

  async getTeam(id: string) {}

  async createTeam(data: any) {}

  async updateTeam(id: string, data: any) {}

  async deleteTeam(id: string) {}

  async addMember(teamId: string, userId: string, role: string) {}

  async removeMember(teamId: string, userId: string) {}

  async getMembers(teamId: string) {}
}
