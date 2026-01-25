import { Task } from "../../../shared/types";

export interface TaskListProps {
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
}

export function TaskList({ tasks, onTaskClick }: TaskListProps) {
  return <div>Task List</div>;
}
