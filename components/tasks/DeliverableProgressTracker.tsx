'use client';

import { useEffect, useState } from 'react';
import { Task, TaskService } from '@/lib/taskService';
import {
  DeliverableService,
  Deliverable,
  DeliverableTemplate,
  DeliverableTemplateStep,
} from '@/lib/deliverableService';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Circle,
  CheckCircle2,
  PlayCircle,
  PauseCircle,
  Clock,
  Timer,
} from 'lucide-react';

interface DeliverableProgressTrackerProps {
  parentTaskId: string;
}

const STATUS_ICON: Record<string, { icon: any; color: string }> = {
  to_do: { icon: Circle, color: 'text-gray-300' },
  in_progress: { icon: PlayCircle, color: 'text-blue-500' },
  paused: { icon: PauseCircle, color: 'text-amber-500' },
  ready_for_feedback: { icon: Clock, color: 'text-purple-500' },
  complete: { icon: CheckCircle2, color: 'text-green-500' },
};

export function DeliverableProgressTracker({ parentTaskId }: DeliverableProgressTrackerProps) {
  const [deliverable, setDeliverable] = useState<(Deliverable & { template: DeliverableTemplate; steps: DeliverableTemplateStep[] }) | null>(null);
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [parentTaskId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const del = await DeliverableService.getDeliverableByTaskId(parentTaskId);
      if (del) {
        setDeliverable(del);
        const tasks = await TaskService.getSubtasks(parentTaskId);
        setSubtasks(tasks.sort((a, b) => a.sort_order - b.sort_order));
      }
    } catch (err) {
      console.error('Error loading deliverable progress:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8 text-sm text-gray-400">Loading workflow...</div>;
  }

  if (!deliverable) {
    return <div className="text-sm text-gray-400 py-4">No workflow linked to this task.</div>;
  }

  const completedCount = subtasks.filter(t => t.status === 'complete').length;
  const totalCount = subtasks.length;

  const getInitials = (name: string | null) => {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-gray-700">
          {deliverable.template.name}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {deliverable.start_date && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {(() => {
                const start = new Date(deliverable.start_date + 'T00:00:00');
                const elapsed = Math.ceil((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
                return deliverable.actual_duration_days
                  ? `${deliverable.actual_duration_days}d (completed)`
                  : `${elapsed}d elapsed`;
              })()}
            </span>
          )}
          <span>{completedCount}/{totalCount} steps complete</span>
        </div>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div
          className="h-2 rounded-full transition-all"
          style={{
            width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%`,
            backgroundColor: deliverable.template.color || '#3e8692',
          }}
        />
      </div>

      {/* Pipeline */}
      <TooltipProvider>
        <div className="flex items-start gap-0 overflow-x-auto pb-2">
          {deliverable.steps.map((step, idx) => {
            const subtask = subtasks.find(t => t.task_name.startsWith(`${step.step_order}.`));
            const status = subtask?.status || 'to_do';
            const statusCfg = STATUS_ICON[status] || STATUS_ICON.to_do;
            const StatusIcon = statusCfg.icon;
            const isLast = idx === deliverable.steps.length - 1;

            return (
              <div key={step.id} className="flex items-start flex-shrink-0">
                <div className="flex flex-col items-center w-[100px]">
                  {/* Status icon */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={`w-9 h-9 rounded-full border-2 flex items-center justify-center ${
                        status === 'complete'
                          ? 'border-green-400 bg-green-50'
                          : status === 'in_progress'
                          ? 'border-blue-400 bg-blue-50'
                          : 'border-gray-200 bg-white'
                      }`}>
                        <StatusIcon className={`h-4 w-4 ${statusCfg.color}`} />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">{step.step_name}</p>
                      <p className="text-xs capitalize">{status.replace('_', ' ')}</p>
                      {subtask?.assigned_to_name && <p className="text-xs text-gray-400">{subtask.assigned_to_name}</p>}
                    </TooltipContent>
                  </Tooltip>

                  {/* Assignee avatar */}
                  <div className="mt-1.5">
                    {subtask?.assigned_to_name ? (
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[8px] bg-gray-100">
                          {getInitials(subtask.assigned_to_name)}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="h-5 w-5 rounded-full bg-gray-100" />
                    )}
                  </div>

                  {/* Step name */}
                  <div className="mt-1 text-[10px] text-center text-gray-600 leading-tight font-medium px-1">
                    {step.step_name}
                  </div>

                  {/* Due date */}
                  {subtask?.due_date && (
                    <div className="text-[9px] text-gray-400 mt-0.5">
                      {new Date(subtask.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  )}
                </div>

                {/* Connector line */}
                {!isLast && (
                  <div className="flex items-center h-9 px-0">
                    <div className={`w-4 h-0.5 mt-0 ${
                      status === 'complete' ? 'bg-green-400' : 'bg-gray-200'
                    }`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}
