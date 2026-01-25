import { Team, TeamMember } from "../../shared/types";

export class TeamService {
  async getById(id: string): Promise<Team | null> {
    return null;
  }

  async create(teamData: Omit<Team, "id" | "createdAt" | "updatedAt">): Promise<Team> {
    throw new Error("Not implemented");
  }

  async update(id: string, teamData: Partial<Team>): Promise<Team | null> {
    return null;
  }

  async delete(id: string): Promise<boolean> {
    return false;
  }

  async addMember(teamId: string, userId: string, role: TeamMember["role"]): Promise<TeamMember> {
    throw new Error("Not implemented");
  }

  async removeMember(teamId: string, userId: string): Promise<boolean> {
    return false;
  }

  async getMembers(teamId: string): Promise<TeamMember[]> {
    return [];
  }

  async updateMemberRole(
    teamId: string,
    userId: string,
    role: TeamMember["role"]
  ): Promise<TeamMember | null> {
    return null;
  }
}
