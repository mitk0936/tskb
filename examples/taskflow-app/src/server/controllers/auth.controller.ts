import { AuthService } from "../services/auth.service";
import { LoginCredentials, RegisterData } from "../../shared/types";

export class AuthController {
  constructor(private authService: AuthService) {}

  async login(credentials: LoginCredentials) {}

  async register(data: RegisterData) {}

  async logout() {}

  async refreshToken(refreshToken: string) {}

  async getCurrentUser() {}
}
