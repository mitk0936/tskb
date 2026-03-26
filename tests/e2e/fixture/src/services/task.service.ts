import type { Task, CreateTaskInput, TaskStatus } from "../models/task.js";

export class TaskService {
  async create(input: CreateTaskInput, userId: string): Promise<Task> {
    throw new Error("Not implemented");
  }

  async findById(id: string): Promise<Task | null> {
    throw new Error("Not implemented");
  }

  async findByProject(projectId: string): Promise<Task[]> {
    throw new Error("Not implemented");
  }

  async updateStatus(taskId: string, status: TaskStatus, userId: string): Promise<Task> {
    throw new Error("Not implemented");
  }

  async assign(taskId: string, assigneeId: string): Promise<Task> {
    throw new Error("Not implemented");
  }

  async delete(taskId: string, userId: string): Promise<void> {
    throw new Error("Not implemented");
  }
}
