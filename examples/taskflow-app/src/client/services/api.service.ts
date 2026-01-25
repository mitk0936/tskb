import { ApiResponse, ApiError } from "../../shared/types";

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  async get<T>(path: string): Promise<ApiResponse<T>> {
    throw new Error("Not implemented");
  }

  async post<T>(path: string, data: any): Promise<ApiResponse<T>> {
    throw new Error("Not implemented");
  }

  async put<T>(path: string, data: any): Promise<ApiResponse<T>> {
    throw new Error("Not implemented");
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    throw new Error("Not implemented");
  }

  async patch<T>(path: string, data: any): Promise<ApiResponse<T>> {
    throw new Error("Not implemented");
  }
}
