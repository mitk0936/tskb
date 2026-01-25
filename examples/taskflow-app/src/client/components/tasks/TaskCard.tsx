import { Task } from "../../../shared/types";

export interface TaskCardProps {
  task: Task;
  onClick?: () => void;
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  return <div>Task Card</div>;
}
