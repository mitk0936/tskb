import { UserService } from "../services/user.service";

export class UserController {
  constructor(private userService: UserService) {}

  async getUser(id: string) {}

  async updateUser(id: string, data: any) {}

  async deleteUser(id: string) {}

  async getUserTeams(id: string) {}
}
