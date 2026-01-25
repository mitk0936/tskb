import { ApiClient } from "./api.service";
import { User, LoginCredentials, RegisterData, AuthResponse } from "../../shared/types";

export class AuthApiService {
  constructor(private api: ApiClient) {}

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    throw new Error("Not implemented");
  }

  async register(data: RegisterData): Promise<AuthResponse> {
    throw new Error("Not implemented");
  }

  async logout(): Promise<void> {}

  async refreshToken(refreshToken: string): Promise<any> {
    throw new Error("Not implemented");
  }

  async getCurrentUser(): Promise<User> {
    throw new Error("Not implemented");
  }
}
