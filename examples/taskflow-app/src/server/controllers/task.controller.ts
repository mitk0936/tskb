import { TaskService } from "../services/task.service";

export class TaskController {
  constructor(private taskService: TaskService) {}

  async getTask(id: string) {}

  async getProjectTasks(projectId: string, pagination: any, filters: any) {}

  async getAssignedTasks(assigneeId: string, pagination: any) {}

  async createTask(data: any) {}

  async updateTask(id: string, data: any) {}

  async deleteTask(id: string) {}

  async updateStatus(id: string, status: string) {}

  async assignTask(id: string, assigneeId: string) {}

  async updatePriority(id: string, priority: string) {}
}
