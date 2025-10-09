'use client';

import React from 'react';
import { Loader2, Brain, Cog, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AgentStatus = 'thinking' | 'executing' | 'completed' | 'error' | null;

interface AgentStatusIndicatorProps {
  status: AgentStatus;
  currentStep?: string;
  className?: string;
}

export function AgentStatusIndicator({ status, currentStep, className }: AgentStatusIndicatorProps) {
  if (!status) return null;

  const statusConfig = {
    thinking: {
      icon: Brain,
      label: 'Agent is thinking',
      color: 'text-purple-500',
      bgColor: 'bg-purple-50 dark:bg-purple-950',
      borderColor: 'border-purple-200 dark:border-purple-800',
      animation: 'animate-pulse',
    },
    executing: {
      icon: Cog,
      label: currentStep || 'Executing tools',
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-950',
      borderColor: 'border-blue-200 dark:border-blue-800',
      animation: 'animate-spin',
    },
    completed: {
      icon: CheckCircle2,
      label: 'Done!',
      color: 'text-green-500',
      bgColor: 'bg-green-50 dark:bg-green-950',
      borderColor: 'border-green-200 dark:border-green-800',
      animation: '',
    },
    error: {
      icon: XCircle,
      label: 'Error occurred',
      color: 'text-red-500',
      bgColor: 'bg-red-50 dark:bg-red-950',
      borderColor: 'border-red-200 dark:border-red-800',
      animation: '',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg border',
        config.bgColor,
        config.borderColor,
        className
      )}
    >
      <Icon className={cn('w-4 h-4', config.color, config.animation)} />
      <span className={cn('text-sm font-medium', config.color)}>
        {config.label}
      </span>
      {status === 'executing' && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
    </div>
  );
}
