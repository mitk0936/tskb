export interface ApiResponse<T> {
  data: T;
  error?: ApiError;
  meta?: ResponseMetadata;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface ResponseMetadata {
  timestamp: string;
  requestId?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface FilterParams {
  status?: string[];
  priority?: string[];
  assigneeId?: string;
  projectId?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
}
