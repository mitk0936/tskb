import { useState, useEffect } from "react";
import { Task } from "../../shared/types";

export function useTasks(projectId?: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  return { tasks, isLoading, error };
}
