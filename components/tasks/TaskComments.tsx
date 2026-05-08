'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { TaskService, TaskComment } from '@/lib/taskService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Send, Reply, Trash2, Edit, CornerDownRight, MessageSquare } from 'lucide-react';

interface TaskCommentsProps {
  taskId: string;
  onCommentCountChange?: (count: number) => void;
}

export function TaskComments({ taskId, onCommentCountChange }: TaskCommentsProps) {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadComments();
  }, [taskId]);

  const loadComments = async () => {
    try {
      const data = await TaskService.getComments(taskId);
      setComments(data);
      const totalCount = data.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0);
      onCommentCountChange?.(totalCount);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async (parentId?: string) => {
    const content = parentId ? replyContent.trim() : newComment.trim();
    if (!content || !user?.id || !userProfile) return;

    setSubmitting(true);
    try {
      await TaskService.addComment(
        taskId,
        user.id,
        userProfile.name || userProfile.email || 'Unknown',
        content,
        parentId
      );
      if (parentId) {
        setReplyContent('');
        setReplyingTo(null);
      } else {
        setNewComment('');
      }
      await loadComments();
    } catch {
      toast({ title: 'Error', description: 'Failed to add comment.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditComment = async (commentId: string) => {
    if (!editContent.trim()) return;
    setSubmitting(true);
    try {
      await TaskService.updateComment(commentId, editContent.trim());
      setEditingCommentId(null);
      setEditContent('');
      await loadComments();
    } catch {
      toast({ title: 'Error', description: 'Failed to update comment.', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await TaskService.deleteComment(commentId);
      await loadComments();
    } catch {
      toast({ title: 'Error', description: 'Failed to delete comment.', variant: 'destructive' });
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const renderComment = (comment: TaskComment, isReply = false) => {
    const isEditing = editingCommentId === comment.id;
    const isOwner = user?.id === comment.user_id;
    const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'super_admin';
    const initials = (comment.user_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    return (
      <div key={comment.id} className={`${isReply ? 'ml-8' : ''}`}>
        <div className="flex gap-2.5 group">
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-brand to-[#2d6470] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mt-0.5">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">{comment.user_name || 'Unknown'}</span>
              <span className="text-xs text-gray-400">{timeAgo(comment.created_at)}</span>
              {comment.updated_at !== comment.created_at && (
                <span className="text-xs text-gray-400 italic">(edited)</span>
              )}
            </div>
            {isEditing ? (
              <div className="mt-1 space-y-2">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="focus-brand text-sm min-h-[60px]"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleEditComment(comment.id)} disabled={submitting} className="h-7 text-xs" style={{ backgroundColor: '#3e8692', color: 'white' }}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingCommentId(null); setEditContent(''); }} className="h-7 text-xs">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{comment.content}</p>
            )}
            {!isEditing && (
              <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!isReply && (
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-gray-500" onClick={() => { setReplyingTo(comment.id); setReplyContent(''); }}>
                    <Reply className="h-3 w-3 mr-1" /> Reply
                  </Button>
                )}
                {isOwner && (
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-gray-500" onClick={() => { setEditingCommentId(comment.id); setEditContent(comment.content); }}>
                    <Edit className="h-3 w-3 mr-1" /> Edit
                  </Button>
                )}
                {(isOwner || isAdmin) && (
                  <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-red-500 hover:text-red-700" onClick={() => handleDeleteComment(comment.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Reply input */}
        {replyingTo === comment.id && (
          <div className="ml-8 mt-2 flex gap-2">
            <CornerDownRight className="h-4 w-4 text-gray-300 mt-2 flex-shrink-0" />
            <div className="flex-1">
              <Textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Write a reply..."
                className="focus-brand text-sm min-h-[50px]"
                autoFocus
              />
              <div className="flex gap-2 mt-1.5">
                <Button size="sm" onClick={() => handleAddComment(comment.id)} disabled={!replyContent.trim() || submitting} className="h-7 text-xs" style={{ backgroundColor: '#3e8692', color: 'white' }}>
                  <Send className="h-3 w-3 mr-1" /> Reply
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setReplyingTo(null); setReplyContent(''); }} className="h-7 text-xs">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2 space-y-2">
            {comment.replies.map(reply => renderComment(reply, true))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="text-sm text-gray-400 py-4 text-center">Loading comments...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-gray-500" />
        <h4 className="text-sm font-semibold text-gray-700">Comments</h4>
        {comments.length > 0 && (
          <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
            {comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0)}
          </span>
        )}
      </div>

      {/* Comment list */}
      {comments.length > 0 ? (
        <div className="space-y-3">
          {comments.map(c => renderComment(c))}
        </div>
      ) : (
        <p className="text-xs text-gray-400 text-center py-2">No comments yet</p>
      )}

      {/* New comment input */}
      <div className="border-t border-gray-100 pt-3">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          className="focus-brand text-sm min-h-[60px]"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddComment();
          }}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-400">Cmd+Enter to send</span>
          <Button
            size="sm"
            onClick={() => handleAddComment()}
            disabled={!newComment.trim() || submitting}
            className="h-7 text-xs"
            style={{ backgroundColor: '#3e8692', color: 'white' }}
          >
            <Send className="h-3 w-3 mr-1" /> Comment
          </Button>
        </div>
      </div>
    </div>
  );
}
