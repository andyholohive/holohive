'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { TaskService, TaskAttachment } from '@/lib/taskService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Upload,
  X,
  File,
  Image as ImageIcon,
  FileText,
  Download,
  Trash2,
  Paperclip,
} from 'lucide-react';

interface TaskAttachmentsProps {
  taskId: string;
  onAttachmentCountChange?: (count: number) => void;
}

interface UploadingFile {
  file: File;
  progress: number;
  error?: string;
}

export function TaskAttachments({ taskId, onAttachmentCountChange }: TaskAttachmentsProps) {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAttachments();
  }, [taskId]);

  const loadAttachments = async () => {
    try {
      const data = await TaskService.getAttachments(taskId);
      setAttachments(data);
      onAttachmentCountChange?.(data.length);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const getFileIcon = (mimeType: string | null) => {
    if (!mimeType) return <File className="h-5 w-5 text-gray-400" />;
    if (mimeType.startsWith('image/')) return <ImageIcon className="h-5 w-5 text-blue-500" />;
    if (mimeType.includes('pdf')) return <FileText className="h-5 w-5 text-red-500" />;
    return <File className="h-5 w-5 text-gray-400" />;
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const uploadFile = async (file: File) => {
    if (!user?.id || !userProfile) return;

    setUploadingFiles(prev => [...prev, { file, progress: 0 }]);

    try {
      setUploadingFiles(prev =>
        prev.map(f => f.file === file ? { ...f, progress: 50 } : f)
      );

      await TaskService.uploadAttachment(
        taskId,
        file,
        user.id,
        userProfile.name || userProfile.email || 'Unknown'
      );

      setUploadingFiles(prev =>
        prev.map(f => f.file === file ? { ...f, progress: 100 } : f)
      );

      setTimeout(() => {
        setUploadingFiles(prev => prev.filter(f => f.file !== file));
      }, 800);

      await loadAttachments();
    } catch (err: any) {
      setUploadingFiles(prev =>
        prev.map(f => f.file === file ? { ...f, error: err.message || 'Upload failed' } : f)
      );
      toast({ title: 'Upload failed', description: err.message || 'Failed to upload file', variant: 'destructive' });
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      await uploadFile(files[i]);
    }
  };

  const handleDelete = async (attachmentId: string) => {
    try {
      await TaskService.deleteAttachment(attachmentId);
      await loadAttachments();
    } catch {
      toast({ title: 'Error', description: 'Failed to delete attachment.', variant: 'destructive' });
    }
  };

  const isOwnerOrAdmin = (uploadedBy: string | null) => {
    if (!user?.id) return false;
    if (uploadedBy === user.id) return true;
    return userProfile?.role === 'admin' || userProfile?.role === 'super_admin';
  };

  if (loading) {
    return <div className="text-sm text-gray-400 py-4 text-center">Loading attachments...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Paperclip className="h-4 w-4 text-gray-500" />
        <h4 className="text-sm font-semibold text-gray-700">Attachments</h4>
        {attachments.length > 0 && (
          <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{attachments.length}</span>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(true); }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(false); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        className={`border border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-[#3e8692] bg-[#3e8692]/5'
            : 'border-gray-200 hover:border-[#3e8692] hover:bg-gray-50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        <Upload className="h-6 w-6 mx-auto mb-1.5 text-gray-400" />
        <p className="text-xs text-gray-500">
          {isDragActive ? 'Drop files here...' : 'Drag & drop or click to upload (10MB max)'}
        </p>
      </div>

      {/* Uploading files */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-1.5">
          {uploadingFiles.map((uf, i) => (
            <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded text-xs">
              {getFileIcon(uf.file.type)}
              <span className="flex-1 truncate">{uf.file.name}</span>
              {uf.error ? (
                <span className="text-red-500">{uf.error}</span>
              ) : (
                <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full transition-all" style={{ width: `${uf.progress}%`, backgroundColor: '#3e8692' }} />
                </div>
              )}
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setUploadingFiles(prev => prev.filter(f => f.file !== uf.file))}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* File list */}
      {attachments.length > 0 && (
        <div className="space-y-1">
          {attachments.map((att) => (
            <div key={att.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded group hover:bg-gray-100 transition-colors">
              {getFileIcon(att.mime_type)}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">{att.file_name}</p>
                <p className="text-[10px] text-gray-400">
                  {formatFileSize(att.file_size)}
                  {att.uploaded_by_name && ` · ${att.uploaded_by_name}`}
                </p>
              </div>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <a href={att.file_url} target="_blank" rel="noopener noreferrer" download>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <Download className="h-3 w-3 text-gray-500" />
                  </Button>
                </a>
                {isOwnerOrAdmin(att.uploaded_by) && (
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-red-50" onClick={() => handleDelete(att.id)}>
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
