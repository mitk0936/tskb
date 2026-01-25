import { Task, TaskStatus } from "../../../shared/types";

export interface TaskBoardProps {
  tasks: Task[];
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
}

export function TaskBoard({ tasks, onStatusChange }: TaskBoardProps) {
  return <div>Kanban Board</div>;
}
