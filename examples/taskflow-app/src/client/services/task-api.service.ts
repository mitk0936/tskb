import { ApiClient } from "./api.service";
import { Task, PaginatedResponse, FilterParams, PaginationParams } from "../../shared/types";

export class TaskApiService {
  constructor(private api: ApiClient) {}

  async getTask(id: string): Promise<Task> {
    throw new Error("Not implemented");
  }

  async getProjectTasks(
    projectId: string,
    pagination?: PaginationParams,
    filters?: FilterParams
  ): Promise<PaginatedResponse<Task>> {
    throw new Error("Not implemented");
  }

  async createTask(data: any): Promise<Task> {
    throw new Error("Not implemented");
  }

  async updateTask(id: string, data: any): Promise<Task> {
    throw new Error("Not implemented");
  }

  async deleteTask(id: string): Promise<void> {}

  async updateStatus(id: string, status: string): Promise<Task> {
    throw new Error("Not implemented");
  }

  async assignTask(id: string, assigneeId: string): Promise<Task> {
    throw new Error("Not implemented");
  }
}
