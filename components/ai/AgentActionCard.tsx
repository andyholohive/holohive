'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  PlusCircle,
  List,
  Users,
  Mail,
  BarChart3,
  DollarSign,
  RefreshCw,
  Database,
  Undo2,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentAction {
  tool_name: string;
  parameters: any;
  result: {
    success: boolean;
    data?: any;
    error?: string;
    message?: string;
  };
  execution_time_ms: number;
}

interface AgentActionCardProps {
  actions: AgentAction[];
  sessionId: string;
  onUndo?: (actionId: string) => void;
  reversibleActions?: Array<{
    id: string;
    tool_name: string;
    entity_type: string;
    entity_id: string;
  }>;
}

const toolIcons: Record<string, any> = {
  search_kols: Search,
  create_campaign: PlusCircle,
  create_kol_list: List,
  add_kols_to_campaign: Users,
  generate_client_message: Mail,
  analyze_campaign_performance: BarChart3,
  get_budget_recommendations: DollarSign,
  update_campaign_status: RefreshCw,
  get_user_context: Database,
};

const toolLabels: Record<string, string> = {
  search_kols: 'Search KOLs',
  create_campaign: 'Create Campaign',
  create_kol_list: 'Create KOL List',
  add_kols_to_campaign: 'Add KOLs to Campaign',
  generate_client_message: 'Generate Message',
  analyze_campaign_performance: 'Analyze Performance',
  get_budget_recommendations: 'Budget Recommendations',
  update_campaign_status: 'Update Campaign Status',
  get_user_context: 'Get User Context',
};

const toolColors: Record<string, string> = {
  search_kols: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  create_campaign: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  create_kol_list: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  add_kols_to_campaign: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  generate_client_message: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
  analyze_campaign_performance: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
  get_budget_recommendations: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  update_campaign_status: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  get_user_context: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

function ActionItem({ action, index, reversibleActions, onUndo }: {
  action: AgentAction;
  index: number;
  reversibleActions?: any[];
  onUndo?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = toolIcons[action.tool_name] || Database;
  const label = toolLabels[action.tool_name] || action.tool_name;
  const colorClass = toolColors[action.tool_name] || toolColors.get_user_context;

  // Find reversible action for this tool execution
  const reversibleAction = reversibleActions?.find(
    ra => ra.tool_name === action.tool_name
  );

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2 flex-1">
          <div className={cn('p-1.5 rounded', colorClass)}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">
                Step {index + 1}: {label}
              </span>
              {action.result.success ? (
                <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              )}
            </div>
            {action.result.message && (
              <p className="text-xs text-muted-foreground mt-1">
                {action.result.message}
              </p>
            )}
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                {action.execution_time_ms}ms
              </div>
              {reversibleAction && onUndo && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => onUndo(reversibleAction.id)}
                >
                  <Undo2 className="w-3 h-3 mr-1" />
                  Undo
                </Button>
              )}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </Button>
      </div>

      {expanded && (
        <div className="pl-8 space-y-2 text-xs">
          {Object.keys(action.parameters).length > 0 && (
            <div>
              <div className="font-medium text-muted-foreground mb-1">Parameters:</div>
              <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                {JSON.stringify(action.parameters, null, 2)}
              </pre>
            </div>
          )}
          {action.result.data && (
            <div>
              <div className="font-medium text-muted-foreground mb-1">Result:</div>
              <pre className="bg-muted p-2 rounded text-xs overflow-x-auto max-h-40 overflow-y-auto">
                {JSON.stringify(action.result.data, null, 2)}
              </pre>
            </div>
          )}
          {action.result.error && (
            <div>
              <div className="font-medium text-red-600 dark:text-red-400 mb-1">Error:</div>
              <div className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 p-2 rounded text-xs">
                {action.result.error}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AgentActionCard({
  actions,
  sessionId,
  onUndo,
  reversibleActions,
}: AgentActionCardProps) {
  if (!actions || actions.length === 0) return null;

  const successCount = actions.filter(a => a.result.success).length;
  const totalTime = actions.reduce((sum, a) => sum + a.execution_time_ms, 0);

  return (
    <Card className="p-4 space-y-3 bg-gradient-to-br from-blue-50/50 to-purple-50/50 dark:from-blue-950/20 dark:to-purple-950/20 border-blue-200 dark:border-blue-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-white dark:bg-gray-950">
            {actions.length} {actions.length === 1 ? 'Action' : 'Actions'} Executed
          </Badge>
          <span className="text-xs text-muted-foreground">
            {successCount}/{actions.length} successful
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          {totalTime}ms total
        </div>
      </div>

      <div className="space-y-2">
        {actions.map((action, index) => (
          <ActionItem
            key={index}
            action={action}
            index={index}
            reversibleActions={reversibleActions}
            onUndo={onUndo}
          />
        ))}
      </div>
    </Card>
  );
}
