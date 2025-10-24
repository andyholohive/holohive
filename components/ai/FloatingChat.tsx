'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, MessageSquare, X, Plus, ChevronDown, ArrowLeft, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { ChatService, ChatSessionWithMessages, AgentChatMessage } from '@/lib/chatService';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { AIService, CampaignSuggestion, ListSuggestion } from '@/lib/aiService';
import AISuggestionCard from './AISuggestionCard';
import { MessageTrainingService, MessageContext } from '@/lib/messageTrainingService';
import { MessageTemplateManager } from './MessageTemplateManager';
import { AdvancedAIService, PredictiveInsight } from '@/lib/advancedAIService';
import { AdvancedInsightsCard } from './AdvancedInsightsCard';
import { AgentStatusIndicator, AgentStatus } from './AgentStatusIndicator';
import { AgentActionCard } from './AgentActionCard';

export default function FloatingChat() {
  const { userProfile } = useAuth();
  const pathname = usePathname();

  // Hide chat entirely on auth page, public pages, or when user is not logged in
  if (!userProfile || pathname?.startsWith('/auth') || pathname?.startsWith('/public')) {
    return null;
  }
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionWithMessages[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSessionWithMessages | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState<{ type: 'campaign' | 'list'; suggestion: CampaignSuggestion | ListSuggestion } | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [messageContext, setMessageContext] = useState<MessageContext>({});
  const [showAdvancedInsights, setShowAdvancedInsights] = useState(false);
  const [advancedInsights, setAdvancedInsights] = useState<PredictiveInsight[]>([]);
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showSessionSelector, setShowSessionSelector] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);

  // Agent-specific state
  const [agentStatus, setAgentStatus] = useState<AgentStatus>(null);
  const [currentToolStep, setCurrentToolStep] = useState<string>('');
  const [lastAgentMessage, setLastAgentMessage] = useState<AgentChatMessage | null>(null);
  const [reversibleActions, setReversibleActions] = useState<any[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [feedbackStates, setFeedbackStates] = useState<Record<string, { sent: boolean; rating?: number }>>({});

  useEffect(() => {
    if (isOpen && !currentSession) {
      initializeChat();
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [currentSession?.messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const initializeChat = async () => {
    try {
      setLoading(true);
      
      // Update existing sessions with "New Chat" title
      await ChatService.updateExistingNewChatSessions();
      
      const sessionsData = await ChatService.getChatSessions();
      
      if (sessionsData.length > 0) {
        setSessions(sessionsData.map(s => ({ ...s, messages: [] })));
        // Don't automatically select the first session - show session list instead
      } else {
        // Create a new session if none exist
        const newSession = await ChatService.createChatSession();
        const sessionWithMessages = await ChatService.getChatSession(newSession.id);
        setCurrentSession(sessionWithMessages);
        setSessions([{ ...newSession, messages: [] }]);
      }
    } catch (error) {
      console.error('Error initializing chat:', error);
      toast({
        title: 'Error',
        description: 'Failed to initialize chat.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const createNewSession = async () => {
    try {
      const newSession = await ChatService.createChatSession();
      const sessionWithMessages = await ChatService.getChatSession(newSession.id);
      setCurrentSession(sessionWithMessages);
      setSessions(prev => [{ ...newSession, messages: [] }, ...prev]);
      setShowSessionSelector(false);
    } catch (error) {
      console.error('Error creating new session:', error);
      toast({
        title: 'Error',
        description: 'Failed to create new chat session.',
        variant: 'destructive',
      });
    }
  };

  const switchSession = async (sessionId: string) => {
    try {
      const sessionWithMessages = await ChatService.getChatSession(sessionId);
      if (sessionWithMessages) {
        setCurrentSession(sessionWithMessages);
        setShowSessionSelector(false);
      }
    } catch (error) {
      console.error("Error switching session:", error);
      toast({
        title: "Error",
        description: "Failed to switch chat session.",
        variant: "destructive",
      });
    }
  };

  const goBackToSessionList = () => {
    setCurrentSession(null);
  };

  const handleDeleteSession = async () => {
    if (!sessionToDelete) return;
    
    try {
      await ChatService.deleteChatSession(sessionToDelete);
      
      // Remove from sessions list
      setSessions(prev => prev.filter(s => s.id !== sessionToDelete));
      
      // If the deleted session was the current session, go back to session list
      if (currentSession?.id === sessionToDelete) {
        setCurrentSession(null);
      }
      
      toast({
        title: "Success",
        description: "Chat session deleted successfully.",
      });
    } catch (error) {
      console.error('Error deleting session:', error);
      toast({
        title: "Error",
        description: "Failed to delete chat session.",
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setSessionToDelete(null);
    }
  };

  const openDeleteDialog = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent session selection
    setSessionToDelete(sessionId);
    setDeleteDialogOpen(true);
  };

  const sendMessage = async () => {
    if (!message.trim() || !currentSession) return;

    try {
      setSending(true);
      setIsTyping(true);
      setAgentStatus('thinking');
      const userMessage = message.trim();
      setMessage('');

      // Optimistically add user message to UI immediately
      const optimisticUserMessage = {
        id: `temp-${Date.now()}`,
        session_id: currentSession.id,
        role: 'user' as const,
        content: userMessage,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: null,
      };

      setCurrentSession({
        ...currentSession,
        messages: [...currentSession.messages, optimisticUserMessage],
      });

      // Use agent-powered response via API route
      const response = await fetch('/api/chat/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // IMPORTANT: Include cookies for auth
        body: JSON.stringify({
          sessionId: currentSession.id,
          message: userMessage,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Agent API Error:', errorData);
        throw new Error(errorData.details || 'Failed to get agent response');
      }

      const data = await response.json();

      // Store agent message for displaying action card
      setLastAgentMessage({
        id: data.message_id,
        session_id: currentSession.id,
        role: 'assistant',
        content: data.response,
        agent_actions: data.agent_actions,
        agent_status: data.agent_status,
        execution_time_ms: data.execution_time_ms,
        is_agent_response: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: { tools_used: data.tools_used },
      } as AgentChatMessage);

      // Fetch reversible actions
      const actionsResponse = await fetch(
        `/api/chat/agent?sessionId=${currentSession.id}&action=get_reversible`,
        { credentials: 'include' } // Include cookies
      );
      if (actionsResponse.ok) {
        const { actions } = await actionsResponse.json();
        setReversibleActions(actions || []);
      }

      // Get updated session to show new messages
      const updatedSession = await ChatService.getChatSession(currentSession.id);
      if (!updatedSession) {
        throw new Error('Failed to get updated session');
      }
      setCurrentSession(updatedSession);

      setAgentStatus('completed');

      // Clear status after a moment
      setTimeout(() => {
        setAgentStatus(null);
        setCurrentToolStep('');
      }, 2000);

      // Check if user wants to create campaign or list (legacy)
      const shouldGenerate = shouldGenerateSuggestion(userMessage);
      if (shouldGenerate) {
        const suggestion = await generateSuggestion(userMessage);
        if (suggestion) {
          setAiSuggestion(suggestion);
        }
      }

      // Check if user wants to see templates
      if (userMessage.toLowerCase().includes('template') || userMessage.toLowerCase().includes('message')) {
        setShowTemplates(true);
      }

      // Check if user wants advanced insights
      if (userMessage.toLowerCase().includes('insight') || userMessage.toLowerCase().includes('analyze') || userMessage.toLowerCase().includes('predict')) {
        try {
          const insights = await AdvancedAIService.generatePredictiveInsights(userProfile?.id || '');
          setAdvancedInsights(insights);
          setShowAdvancedInsights(true);
        } catch (error) {
          console.error('Error generating insights:', error);
        }
      }
      
      // Get final updated session
      const finalSession = await ChatService.getChatSession(currentSession.id);
      setCurrentSession(finalSession);

      setMessage('');
      resetTextareaHeight();
    } catch (error) {
      console.error('Error sending message:', error);
      setAgentStatus('error');
      toast({
        title: 'Error',
        description: 'Failed to send message.',
        variant: 'destructive',
      });
      setTimeout(() => setAgentStatus(null), 3000);
    } finally {
      setSending(false);
      setIsTyping(false);
    }
  };

  const handleUndo = async (actionId: string) => {
    try {
      const response = await fetch(`/api/chat/agent?actionId=${actionId}`, {
        method: 'DELETE',
        credentials: 'include', // Include cookies for auth
      });

      if (!response.ok) {
        throw new Error('Failed to undo action');
      }

      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Success',
          description: 'Action undone successfully',
        });

        // Refresh reversible actions
        if (currentSession) {
          const actionsResponse = await fetch(
            `/api/chat/agent?sessionId=${currentSession.id}&action=get_reversible`,
            { credentials: 'include' }
          );
          if (actionsResponse.ok) {
            const { actions } = await actionsResponse.json();
            setReversibleActions(actions || []);
          }

          // Refresh session
          const updatedSession = await ChatService.getChatSession(currentSession.id);
          if (updatedSession) {
            setCurrentSession(updatedSession);
          }
        }
      }
    } catch (error) {
      console.error('Error undoing action:', error);
      toast({
        title: 'Error',
        description: 'Failed to undo action',
        variant: 'destructive',
      });
    }
  };

  const shouldGenerateSuggestion = (userMessage: string): boolean => {
    const lowerMessage = userMessage.toLowerCase();
    return (
      (lowerMessage.includes('create campaign') || lowerMessage.includes('new campaign')) ||
      (lowerMessage.includes('create list') || lowerMessage.includes('new list') || lowerMessage.includes('kol list'))
    );
  };

  const generateSuggestion = async (userMessage: string) => {
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerMessage.includes('campaign')) {
      const suggestion = await AIService.generateCampaignSuggestion(userMessage);
      return { type: 'campaign' as const, suggestion };
    }
    
    if (lowerMessage.includes('list')) {
      const suggestion = await AIService.generateListSuggestion(userMessage);
      return { type: 'list' as const, suggestion };
    }
    
    return null;
  };

  const handleApplySuggestion = (suggestion: CampaignSuggestion | ListSuggestion) => {
    // TODO: Navigate to campaign/list creation with pre-filled data
    toast({
      title: 'Suggestion Applied',
      description: 'Redirecting to creation form...',
    });
    setAiSuggestion(null);
  };

  const handleDismissSuggestion = () => {
    setAiSuggestion(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    // Shift+Enter will create a new line (default textarea behavior)
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);

    // Auto-resize textarea based on content
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const resetTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleMessageFeedback = async (messageExampleId: string, action: 'sent' | 'rating', value?: number) => {
    try {
      const response = await fetch('/api/chat/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_example_id: messageExampleId,
          feedback_type: action,
          helpful_score: value,
        }),
      });

      if (response.ok) {
        // Update local state
        setFeedbackStates(prev => ({
          ...prev,
          [messageExampleId]: {
            sent: action === 'sent' ? true : (prev[messageExampleId]?.sent || false),
            rating: action === 'rating' ? value : prev[messageExampleId]?.rating,
          }
        }));
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };

  const toggleChat = () => {
    setIsOpen(true);
    setIsMinimized(false);
  };

  const closeChat = () => {
    setShowSessionSelector(false);
    setIsOpen(false);
    setIsMinimized(false);
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={toggleChat}
          size="lg"
          className="w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 p-3"
          style={{ backgroundColor: '#3e8692' }}
        >
          <MessageSquare className="w-6 h-6 text-white" />
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50">
        <Card className="w-96 shadow-xl transition-all duration-300 rounded-2xl overflow-hidden chat-container">
        <CardHeader className="pb-3 bg-white border-b border-gray-200 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 flex-1">
              <Image src="/images/logo.png" alt="Logo" width={24} height={24} />
              <div>
                <h3 className="font-semibold text-sm text-gray-900">Holo GPT</h3>
                <p className="text-xs text-gray-600">Powered by GPT-4o</p>
              </div>
            </div>
            <div className="flex items-center space-x-1 relative">
              {!currentSession ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={closeChat}
                  className="h-7 w-7 p-0 text-gray-500 hover:bg-gray-100"
                >
                  <X className="h-3 w-3" />
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={goBackToSessionList}
                    className="h-7 w-7 p-0 text-gray-500 hover:bg-gray-100 mr-1"
                  >
                    <ArrowLeft className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={closeChat}
                    className="h-7 w-7 p-0 text-gray-500 hover:bg-gray-100"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          <div className="flex flex-col chat-content">
            {!currentSession ? (
              /* Session List View */
              <div className="p-4">
                <div className="mb-4">
                  {loading ? (
                    <div className="w-full h-10 bg-gray-200 rounded-xl animate-pulse"></div>
                  ) : (
                    <Button
                      onClick={createNewSession}
                      className="w-full bg-gradient-to-r from-[#3e8692] to-[#2d5a63] text-white hover:opacity-90 transition-all duration-200 rounded-xl"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      New Chat
                    </Button>
                  )}
                </div>
                
                <div className="space-y-2">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      onClick={() => switchSession(session.id)}
                      className="p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-sm text-gray-900 truncate">
                            {session.title || `Chat ${session.id.slice(0, 8)}`}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {new Date(session.updated_at || "").toLocaleDateString()}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => openDeleteDialog(session.id, e)}
                          className="h-6 w-6 p-0 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                
                {loading && sessions.length === 0 && (
                  <div className="space-y-2">
                    {[1, 2, 3].map((index) => (
                      <div key={index} className="p-3 border border-gray-200 rounded-lg animate-pulse">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                          </div>
                          <div className="w-4 h-4 bg-gray-200 rounded"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {sessions.length === 0 && !loading && (
                  <div className="text-center py-8">
                    <div className="rounded-full p-3 w-12 h-12 mx-auto mb-3 flex items-center justify-center shadow-md" style={{ backgroundColor: '#f6feff' }}>
                      <Image src="/images/logo.png" alt="Logo" width={24} height={24} className="rounded-full" />
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">No Chats Yet</h3>
                    <p className="text-xs text-gray-600 max-w-[200px] mx-auto">
                      Start your first conversation with the AI assistant
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* Chat Messages View */
              <>
                <ScrollArea className="flex-1 p-4 chat-scrollbar">
                  <div className="space-y-4">
                    {loading && (
                      <div className="text-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#3e8692] mx-auto"></div>
                        <p className="text-xs text-gray-500 mt-2">Loading...</p>
                      </div>
                    )}
                    
                    {!loading && currentSession?.messages.length === 0 && (
                      <div className="text-center py-6">
                        <div className="rounded-full p-3 w-12 h-12 mx-auto mb-3 flex items-center justify-center shadow-md" style={{ backgroundColor: '#f6feff' }}>
                          <Image src="/images/logo.png" alt="Logo" width={24} height={24} className="rounded-full" />
                        </div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-1">Holo GPT</h3>
                        <p className="text-xs text-gray-600 max-w-[240px] mx-auto mb-4">
                          Hello! I'm here to help you with campaigns, KOLs, and more. How can I assist you today?
                        </p>

                        {/* Example prompts */}
                        <div className="mt-4 space-y-2 max-w-[260px] mx-auto">
                          <p className="text-xs font-semibold text-gray-700 mb-2">Try asking me:</p>
                          <button
                            onClick={() => setMessage('Find KOLs interested in gaming and crypto')}
                            className="w-full text-left px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors"
                          >
                            <p className="text-xs text-gray-700">💎 Find KOLs interested in gaming and crypto</p>
                          </button>
                          <button
                            onClick={() => setMessage('Generate an initial outreach for Jdot')}
                            className="w-full text-left px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors"
                          >
                            <p className="text-xs text-gray-700">✉️ Generate an initial outreach for Jdot</p>
                          </button>
                          <button
                            onClick={() => setMessage('Give me insights on my campaign')}
                            className="w-full text-left px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors"
                          >
                            <p className="text-xs text-gray-700">💡 Give me insights on my campaign</p>
                          </button>
                          <button
                            onClick={() => setMessage('Create a new KOL list for Web3 gaming')}
                            className="w-full text-left px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors"
                          >
                            <p className="text-xs text-gray-700">📋 Create a new KOL list for Web3 gaming</p>
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {currentSession?.messages.map((msg) => {
                      // Check if this is a generated client message
                      const metadata = msg.metadata && typeof msg.metadata === 'object' && !Array.isArray(msg.metadata) ? msg.metadata : null;
                      const agentActions = metadata && 'agent_actions' in metadata ? metadata.agent_actions : null;
                      const isGeneratedMessage = msg.role === 'assistant' &&
                        Array.isArray(agentActions) && agentActions.some((action: any) =>
                          action.tool_name === 'generate_client_message' && action.result?.success
                        );

                      // Extract the actual message content if it's a generated message
                      let displayContent = msg.content;
                      let generatedMessageContent = '';

                      if (isGeneratedMessage && Array.isArray(agentActions)) {
                        const action = agentActions.find((a: any) =>
                          a && typeof a === 'object' && a.tool_name === 'generate_client_message'
                        ) as any;
                        if (action && typeof action === 'object' && 'result' in action && action.result?.data?.message) {
                          generatedMessageContent = action.result.data.message;
                        }
                      }

                      return (
                        <div
                          key={msg.id}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} chat-message w-full`}
                        >
                          <div
                            className={`${isGeneratedMessage ? 'w-full' : 'max-w-[280px]'} px-4 py-3 rounded-2xl text-sm message-bubble ${
                              msg.role === 'user'
                                ? 'bg-gradient-to-r from-[#3e8692] to-[#2d5a63] text-white shadow-md'
                                : 'bg-gray-50 text-gray-900 border border-gray-200 shadow-sm'
                            }`}
                          >
                            <div className="flex items-start space-x-2">
                              {msg.role === 'assistant' && (
                                <div className="rounded-full p-1 w-6 h-6 flex-shrink-0 mt-0.5 shadow-sm" style={{ backgroundColor: '#f6feff' }}>
                                  <Image src="/images/logo.png" alt="Logo" width={16} height={16} className="rounded-full" />
                                </div>
                              )}
                              <div className="flex-1">
                                <p className={`text-sm leading-relaxed ${msg.role === 'user' ? 'text-white' : 'text-gray-900'}`}>
                                  {displayContent}
                                </p>

                                {/* Show generated message in a special box with copy button */}
                                {isGeneratedMessage && generatedMessageContent && (() => {
                                  const action = Array.isArray(agentActions) ? agentActions.find((a: any) =>
                                    a && typeof a === 'object' && a.tool_name === 'generate_client_message'
                                  ) as any : null;
                                  const messageExampleId = (action && typeof action === 'object' && 'result' in action) ? action?.result?.data?.message_example_id : null;
                                  const feedback = feedbackStates[messageExampleId] || { sent: false };

                                  return (
                                    <div className="mt-3 p-3 bg-white border border-gray-300 rounded-lg relative">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-semibold text-[#3e8692]">📋 Client Message (Telegram)</span>
                                        <button
                                          onClick={() => {
                                            navigator.clipboard.writeText(generatedMessageContent);
                                            // Show a toast or temporary indicator
                                            const btn = document.activeElement as HTMLElement;
                                            const originalText = btn.innerText;
                                            btn.innerText = '✓ Copied!';
                                            setTimeout(() => {
                                              btn.innerText = originalText;
                                            }, 2000);
                                          }}
                                          className="text-xs px-2 py-1 bg-[#3e8692] text-white rounded hover:bg-[#2d5a63] transition-colors flex items-center gap-1"
                                        >
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                            <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                                            <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                                          </svg>
                                          Copy
                                        </button>
                                      </div>
                                      <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans overflow-x-auto mb-3">
                                        {generatedMessageContent}
                                      </pre>

                                      {/* Feedback Section */}
                                      {messageExampleId && (
                                        <div className="border-t border-gray-200 pt-3 mt-3 space-y-2">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs text-gray-600 whitespace-nowrap">Rate:</span>
                                            <div className="flex gap-1">
                                              {[1, 2, 3, 4, 5].map((star) => (
                                                <button
                                                  key={star}
                                                  onClick={() => handleMessageFeedback(messageExampleId, 'rating', star)}
                                                  className={`text-sm transition-colors ${
                                                    feedback.rating && star <= feedback.rating
                                                      ? 'text-yellow-500'
                                                      : 'text-gray-300 hover:text-yellow-400'
                                                  }`}
                                                >
                                                  ★
                                                </button>
                                              ))}
                                            </div>
                                            <button
                                              onClick={() => handleMessageFeedback(messageExampleId, 'sent')}
                                              disabled={feedback.sent}
                                              className={`text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 ml-auto ${
                                                feedback.sent
                                                  ? 'bg-green-100 text-green-700 cursor-not-allowed'
                                                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                                              }`}
                                            >
                                              {feedback.sent ? (
                                                <>
                                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                  </svg>
                                                  Sent
                                                </>
                                              ) : (
                                                <>
                                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                                                  </svg>
                                                  Sent
                                                </>
                                              )}
                                            </button>
                                          </div>
                                          {feedback.sent && (
                                            <p className="text-xs text-green-600">
                                              ✓ Will be used to improve future messages!
                                            </p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}

                                <p className={`text-xs mt-2 ${msg.role === 'user' ? 'text-blue-100' : 'text-gray-500'}`}>
                                  {formatTime(msg.created_at || '')}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Typing Indicator */}
                    {isTyping && (
                      <div className="flex justify-start typing-indicator">
                        <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 shadow-sm max-w-[220px] message-bubble">
                          <div className="flex items-center space-x-2">
                            <div className="rounded-full p-1 w-6 h-6 shadow-sm" style={{ backgroundColor: '#f6feff' }}>
                              <Image src="/images/logo.png" alt="Logo" width={16} height={16} className="rounded-full" />
                            </div>
                            <div className="flex space-x-1">
                              <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></div>
                              <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></div>
                              <div className="w-2 h-2 bg-gray-400 rounded-full typing-dot"></div>
                            </div>
                            <span className="text-xs text-gray-500 ml-2">AI is typing...</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Agent Status Indicator */}
                    {agentStatus && (
                      <div className="flex justify-center">
                        <AgentStatusIndicator
                          status={agentStatus}
                          currentStep={currentToolStep}
                        />
                      </div>
                    )}

                    {/* Agent Action Card */}
                    {lastAgentMessage && lastAgentMessage.agent_actions && lastAgentMessage.agent_actions.length > 0 && (
                      <div className="mt-2">
                        <AgentActionCard
                          actions={lastAgentMessage.agent_actions}
                          sessionId={currentSession?.id || ''}
                          onUndo={handleUndo}
                          reversibleActions={reversibleActions}
                        />
                      </div>
                    )}

                    <div ref={messagesEndRef} />

                     {/* AI Suggestion Card */}
                     {aiSuggestion && (
                       <div className="mt-4">
                         <AISuggestionCard
                           type={aiSuggestion.type}
                           suggestion={aiSuggestion.suggestion}
                           onApply={handleApplySuggestion}
                           onDismiss={handleDismissSuggestion}
                         />
                       </div>
                     )}

                     {/* Message Templates */}
                     {showTemplates && (
                       <div className="mt-4">
                         <div className="bg-white border rounded-lg p-4 max-h-96 overflow-y-auto">
                           <div className="flex items-center justify-between mb-4">
                             <h3 className="text-sm font-semibold text-gray-900">Message Templates</h3>
                             <Button
                               variant="ghost"
                               size="sm"
                               onClick={() => setShowTemplates(false)}
                               className="h-6 w-6 p-0"
                             >
                               <X className="h-3 w-3" />
                             </Button>
                           </div>
                           <MessageTemplateManager
                             context={messageContext}
                             onTemplateSelected={(template) => {
                               setMessage(template.content);
                               setShowTemplates(false);
                               MessageTrainingService.incrementUsageCount(template.id);
                             }}
                           />
                         </div>
                       </div>
                     )}

                     {/* Advanced Insights */}
                     {showAdvancedInsights && (
                       <div className="mt-4">
                         <div className="bg-white border rounded-lg p-4 max-h-96 overflow-y-auto">
                           <div className="flex items-center justify-between mb-4">
                             <h3 className="text-sm font-semibold text-gray-900">AI Insights</h3>
                             <Button
                               variant="ghost"
                               size="sm"
                               onClick={() => setShowAdvancedInsights(false)}
                               className="h-6 w-6 p-0"
                             >
                               <X className="h-3 w-3" />
                             </Button>
                           </div>
                           <AdvancedInsightsCard
                             insights={advancedInsights}
                             onApplyInsight={(insight) => {
                               console.log('Applying insight:', insight);
                               setShowAdvancedInsights(false);
                             }}
                             onDismiss={() => setShowAdvancedInsights(false)}
                           />
                         </div>
                       </div>
                     )}
                   </div>
                 </ScrollArea>

                {/* Input */}
                <div className="border-t p-4">
                  <div className="flex space-x-3 items-end">
                    <Textarea
                      ref={textareaRef}
                      placeholder="Type a message... (Shift+Enter for new line)"
                      value={message}
                      onChange={handleMessageChange}
                      onKeyDown={handleKeyPress}
                      disabled={sending}
                      className="flex-1 text-sm min-h-[60px] max-h-[120px] resize-none auth-input overflow-y-auto"
                      rows={1}
                    />
                    <Button
                      onClick={sendMessage}
                      disabled={!message.trim() || sending}
                      size="sm"
                      className="h-10 w-10 p-0 rounded-xl hover:opacity-90 transition-all duration-200 flex-shrink-0"
                      style={{ backgroundColor: '#3e8692', color: 'white' }}
                    >
                      {sending ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Chat Session</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this chat session? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteSession}
              className="hover:opacity-90"
              style={{ backgroundColor: "#dc2626", color: "white" }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
} 