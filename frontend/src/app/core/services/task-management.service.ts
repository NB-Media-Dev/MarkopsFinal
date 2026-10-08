import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { io, Socket } from 'socket.io-client';
import {
  Task,
  TaskStatus,
  CreateTaskRequest,
  SubmitVersionRequest,
  DesignerDashboardMetrics,
  computeTaskProgressPercent,
} from '../models/task.model';
import { safeFetch, getBackendBaseUrl } from '../utils/api-url.utils';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class TaskManagementService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly authService = inject(AuthService);
  private socket: Socket | null = null;


  private readonly _tasks = signal<Task[]>([]);
  private readonly _selectedTask = signal<Task | null>(null);
  private readonly _designerMetrics = signal<DesignerDashboardMetrics | null>(null);
  private readonly _isLoading = signal<boolean>(false);
  private readonly _hasLoaded = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);


  private readonly _activeView = signal<'all' | 'my'>(this.getInitialView());

  readonly tasks = computed(() => this._tasks());
  readonly selectedTask = computed(() => this._selectedTask());
  readonly designerMetrics = computed(() => this._designerMetrics());
  readonly isLoading = computed(() => this._isLoading());
  readonly hasLoaded = computed(() => this._hasLoaded());
  readonly error = computed(() => this._error());
  readonly activeView = computed(() => this._activeView());

  constructor() {
    if (this.isBrowser) {
      try {
        localStorage.removeItem('markops_tasks_db_store');
      } catch {}
      this.initRealtimeSocket();
      this.initTaskData();
    }
  }

  private initRealtimeSocket(): void {
    try {
      const backendUrl = getBackendBaseUrl();
      this.socket = io(backendUrl, {
        transports: ['polling', 'websocket'],
        reconnectionAttempts: 5,
        timeout: 10000,
      });

      this.socket.on('task:assigned', (data?: any) => {
        if (data && data.id) this.updateTaskInSignal(data);
        this.loadTasks();
        this.loadDesignerMetrics();
      });
      this.socket.on('task:created', (data?: any) => {
        if (data && data.id) this.updateTaskInSignal(data);
        this.loadTasks();
        this.loadDesignerMetrics();
      });
      this.socket.on('task:updated', (data?: any) => {
        if (data && data.id) this.updateTaskInSignal(data);
        this.loadTasks();
        this.loadDesignerMetrics();
      });
      this.socket.on('task:deleted', (data?: any) => {
        if (data && data.taskId) {
          this._tasks.update((list) => list.filter((t) => String(t.id) !== String(data.taskId)));
        }
        this.loadTasks();
        this.loadDesignerMetrics();
      });
      this.socket.on('task:status_changed', (data?: any) => {
        if (data && data.id) this.updateTaskInSignal(data);
        this.loadTasks();
        this.loadDesignerMetrics();
      });
      this.socket.on('task:in_progress', (data?: any) => {
        if (data && data.id) this.updateTaskInSignal(data);
        this.loadTasks();
        this.loadDesignerMetrics();
      });
      this.socket.on('task:submitted', (data?: any) => {
        if (data && data.id) this.updateTaskInSignal(data);
        this.loadTasks();
        this.loadDesignerMetrics();
      });
      this.socket.on('task:approved', (data?: any) => {
        if (data && data.id) this.updateTaskInSignal(data);
        this.loadTasks();
        this.loadDesignerMetrics();
      });
      this.socket.on('task:redesign_required', (data?: any) => {
        if (data && data.id) this.updateTaskInSignal(data);
        this.loadTasks();
        this.loadDesignerMetrics();
      });
      this.socket.on('task:progress_updated', (data?: { taskId: string; progressPercent: number }) => {
        if (data && data.taskId) {
          const num = Number(data.progressPercent);
          this._tasks.update((list) =>
            list.map((t) => (String(t.id) === String(data.taskId) ? { ...t, progressPercent: num } : t))
          );
          if (String(this._selectedTask()?.id) === String(data.taskId)) {
            this._selectedTask.update((curr) => (curr ? { ...curr, progressPercent: num } : null));
          }
        }
      });
    } catch (e) {
      console.log('[TaskManagementService] Realtime socket notice:', e);
    }
  }

  private getInitialView(): 'all' | 'my' {
    if (typeof window === 'undefined') return 'all';
    const userRole = this.authService.currentUser()?.role;
    if (userRole === 'DESIGNER') return 'all';

    try {
      const stored = sessionStorage.getItem('markops_task_view') || localStorage.getItem('markops_task_view');
      if (stored === 'my' || stored === 'all') {
        return stored;
      }
    } catch {}
    return 'all';
  }

  private async initTaskData(): Promise<void> {
    const isAuth = await this.authService.ensureInitialized();
    if (isAuth) {
      const user = this.authService.currentUser();
      if (user?.role === 'DESIGNER') {
        this._activeView.set('all');
      }
      await Promise.all([this.loadTasks(), this.loadDesignerMetrics()]);
    }
  }

  private deduplicateTasks(tasks: Task[]): Task[] {
    const map = new Map<string, Task>();
    for (const t of tasks) {
      if (t && t.id) {
        map.set(String(t.id), {
          ...t,
          progressPercent: computeTaskProgressPercent(t.status, t.progressPercent),
        });
      }
    }
    return Array.from(map.values());
  }

 
  async switchView(view: 'all' | 'my'): Promise<void> {
    this._activeView.set(view);
    if (this.isBrowser) {
      try {
        sessionStorage.setItem('markops_task_view', view);
        localStorage.setItem('markops_task_view', view);
      } catch {}
    }
    await this.fetchTasksEndpoint(`/api/tasks?view=${view}`);
  }


  async getMyTasks(): Promise<void> {
    this._activeView.set('my');
    if (this.isBrowser) {
      try {
        sessionStorage.setItem('markops_task_view', 'my');
        localStorage.setItem('markops_task_view', 'my');
      } catch {}
    }
    await this.fetchTasksEndpoint('/api/tasks?view=my');
  }


  async getAllTasks(): Promise<void> {
    this._activeView.set('all');
    if (this.isBrowser) {
      try {
        sessionStorage.setItem('markops_task_view', 'all');
        localStorage.setItem('markops_task_view', 'all');
      } catch {}
    }
    await this.fetchTasksEndpoint('/api/tasks?view=all');
  }

  async loadTasks(view?: 'all' | 'my'): Promise<void> {
    if (view) {
      this._activeView.set(view);
    }
    const targetView = view || this._activeView() || 'all';
    await this.fetchTasksEndpoint(`/api/tasks?view=${targetView}`);
  }


  private async fetchTasksEndpoint(endpoint: string): Promise<void> {
    if (!this.isBrowser) return;


    const isAuth = await this.authService.ensureInitialized();
    if (!isAuth) {
      this._isLoading.set(false);
      return;
    }

    this._isLoading.set(true);
    this._error.set(null);

    try {
      const res = await safeFetch(endpoint);

      if (res.status === 401) {
        this._error.set('Authentication session expired. Please log in again.');
        this._isLoading.set(false);
        this.authService.handleUnauthorized();
        return;
      }

      if (res.status === 403) {
        this._error.set('Permission Denied: Access to tasks is restricted for this account.');
        this._isLoading.set(false);
        return;
      }

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const unique = this.deduplicateTasks(data);
          this._tasks.set(unique);
          this._error.set(null);
          this._hasLoaded.set(true);
          this._isLoading.set(false);
          return;
        }
      }

      const errData = await res.json().catch(() => ({}));
      this._error.set(errData.message || errData.error || `Failed to fetch tasks from server (HTTP ${res.status}).`);
    } catch (err: any) {
      console.error(`Error fetching tasks from ${endpoint}:`, err);
      this._error.set('Unable to connect to backend server. Please check network connection.');
    }
    this._isLoading.set(false);
  }


  async loadDesignerMetrics(): Promise<void> {
    if (!this.isBrowser) return;

    const isAuth = await this.authService.ensureInitialized();
    if (!isAuth) return;

    try {
      const res = await safeFetch('/api/designer/dashboard-metrics');
      if (res.ok) {
        const data = await res.json();
        this._designerMetrics.set(data);
      }
    } catch (err) {
      console.log('Error fetching designer metrics:', err);
    }
  }


  async selectTask(taskId: string): Promise<void> {
    const found = this._tasks().find((t) => String(t.id) === String(taskId));
    if (found) {
      this._selectedTask.set(found);
    }
    try {
      const res = await safeFetch(`/api/tasks/${taskId}`);
      if (res.ok) {
        const fullTask: Task = await res.json();
        this._selectedTask.set(fullTask);
        this.updateTaskInSignal(fullTask);
      }
    } catch (err) {
      console.log('Error fetching full task details:', err);
    }
  }

  closeTaskDetail(): void {
    this._selectedTask.set(null);
  }


  async startWork(taskId: string): Promise<boolean> {
    try {
      const res = await safeFetch(`/api/tasks/${taskId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const updatedTask: Task = await res.json();
        this.updateTaskInSignal(updatedTask);
        await this.loadDesignerMetrics();
        return true;
      }
  
      return await this.transitionStatus(taskId, 'IN_PROGRESS', 'Designer started working on this task.');
    } catch (err) {
      console.error('Error starting work on task:', err);
      return await this.transitionStatus(taskId, 'IN_PROGRESS', 'Designer started working on this task.');
    }
  }


  async submitDesign(taskId: string, req: SubmitVersionRequest): Promise<boolean> {
    try {
      const res = await safeFetch(`/api/tasks/${taskId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });

      if (res.ok) {
        const data = await res.json();
        const updatedTask = data.task || data;
        if (updatedTask && updatedTask.id) {
          this.updateTaskInSignal(updatedTask);
          await this.loadDesignerMetrics();
          return true;
        }
      }

      return await this.submitCreativeVersion(taskId, req);
    } catch (err) {
      console.error('Error submitting design:', err);
      return await this.submitCreativeVersion(taskId, req);
    }
  }

 
  async approveTask(taskId: string): Promise<boolean> {
    try {
      const res = await safeFetch(`/api/tasks/${taskId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const updatedTask: Task = await res.json();
        this.updateTaskInSignal(updatedTask);
        await this.loadDesignerMetrics();
        return true;
      }
      return await this.transitionStatus(taskId, 'APPROVED', 'Design creative reviewed and approved.');
    } catch (err) {
      console.error('Error approving task:', err);
      return await this.transitionStatus(taskId, 'APPROVED', 'Design creative reviewed and approved.');
    }
  }


  async requestRedesign(taskId: string, reason: string): Promise<boolean> {
    const trimmedReason = (reason || '').trim();
    if (!trimmedReason) return false;

    try {
      const res = await safeFetch(`/api/tasks/${taskId}/redesign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: trimmedReason }),
      });
      if (res.ok) {
        const updatedTask: Task = await res.json();
        this.updateTaskInSignal(updatedTask);
        await this.loadDesignerMetrics();
        return true;
      }
      return await this.transitionStatus(taskId, 'REDESIGN_REQUIRED', trimmedReason);
    } catch (err) {
      console.error('Error requesting redesign:', err);
      return await this.transitionStatus(taskId, 'REDESIGN_REQUIRED', trimmedReason);
    }
  }


  async startRedesign(taskId: string): Promise<boolean> {
    try {
      const res = await safeFetch(`/api/tasks/${taskId}/start-redesign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const updatedTask: Task = await res.json();
        this.updateTaskInSignal(updatedTask);
        await this.loadDesignerMetrics();
        return true;
      }
      return await this.transitionStatus(taskId, 'IN_PROGRESS', 'Designer started working on the requested redesign.');
    } catch (err) {
      console.error('Error starting redesign on task:', err);
      return await this.transitionStatus(taskId, 'IN_PROGRESS', 'Designer started working on the requested redesign.');
    }
  }

  
  async transitionStatus(taskId: string, newStatus: TaskStatus, remark?: string): Promise<boolean> {
    try {
      const res = await safeFetch(`/api/tasks/${taskId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, remark }),
      });

      if (res.ok) {
        const updatedTask: Task = await res.json();
        this.updateTaskInSignal(updatedTask);
        await this.loadDesignerMetrics();
        return true;
      }
    } catch (err: any) {
      console.error('Error transitioning task status:', err);
    }
    return false;
  }

 
  async submitCreativeVersion(taskId: string, req: SubmitVersionRequest): Promise<boolean> {
    try {
      const res = await safeFetch(`/api/tasks/${taskId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.task) {
          this.updateTaskInSignal(data.task);
          await this.loadDesignerMetrics();
          return true;
        }
      }
    } catch (err) {
      console.error('Error submitting creative version:', err);
    }
    return false;
  }

 
  async createTask(req: CreateTaskRequest): Promise<Task | null> {
    try {
      const res = await safeFetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });

      if (res.ok) {
        const newTask: Task = await res.json();
        if (newTask && !newTask.packageName && req.packageName) {
          newTask.packageName = req.packageName;
        }
        await this.loadTasks();
        await this.loadDesignerMetrics();
        return newTask;
      }
    } catch (err) {
      console.error('Error creating new task:', err);
    }
    return null;
  }

 
  async deleteTask(taskId: string): Promise<boolean> {
    try {
      const res = await safeFetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
      });

      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        const msg = data.message || 'You can only delete tasks created by you.';
        this._error.set(msg);
        return false;
      }

      if (res.ok) {
        await this.loadTasks();
        if (this._selectedTask()?.id === taskId) {
          this._selectedTask.set(null);
        }
        await this.loadDesignerMetrics();
        return true;
      }

      const errData = await res.json().catch(() => ({}));
      this._error.set(errData.message || errData.error || `Failed to delete task (HTTP ${res.status}).`);
    } catch (err) {
      console.error('Error deleting task via API:', err);
      this._error.set('Failed to delete task due to network error.');
    }
    return false;
  }

  
  async addComment(taskId: string, comment: string, userMeta?: { userId?: string; userName?: string; userRole?: string }): Promise<boolean> {
    try {
      const res = await safeFetch(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment,
          userId: userMeta?.userId,
          userName: userMeta?.userName,
          userRole: userMeta?.userRole,
        }),
      });

      if (res.ok) {
        await this.selectTask(taskId);
        await this.loadTasks();
        await this.loadDesignerMetrics();
        return true;
      }
    } catch (err) {
      console.error('Error adding comment to task:', err);
    }
    return false;
  }

  private updateTaskInSignal(updatedTask: Task): void {
    if (!updatedTask || !updatedTask.id) return;
    const normalized: Task = {
      ...updatedTask,
      progressPercent: computeTaskProgressPercent(updatedTask.status, updatedTask.progressPercent),
    };
    this._tasks.update((list) =>
      list.map((t) => (String(t.id) === String(normalized.id) ? { ...t, ...normalized } : t))
    );
    if (String(this._selectedTask()?.id) === String(normalized.id)) {
      this._selectedTask.update((curr) => (curr ? { ...curr, ...normalized } : normalized));
    }
  }
}
