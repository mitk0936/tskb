import { Task, PaginationParams, FilterParams } from "../../../shared/types";
import { Database } from "../connection";

export class TaskRepository {
  constructor(private db: Database) {}

  async findById(id: string): Promise<Task | null> {
    return null;
  }

  async findByProject(
    projectId: string,
    pagination?: PaginationParams,
    filters?: FilterParams
  ): Promise<{ tasks: Task[]; total: number }> {
    return { tasks: [], total: 0 };
  }

  async findByAssignee(
    assigneeId: string,
    pagination?: PaginationParams
  ): Promise<{ tasks: Task[]; total: number }> {
    return { tasks: [], total: 0 };
  }

  async create(task: Omit<Task, "id" | "createdAt" | "updatedAt">): Promise<Task> {
    throw new Error("Not implemented");
  }

  async update(id: string, task: Partial<Task>): Promise<Task | null> {
    return null;
  }

  async delete(id: string): Promise<boolean> {
    return false;
  }
}
