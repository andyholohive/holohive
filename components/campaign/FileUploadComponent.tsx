'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, X, File, Image as ImageIcon, FileText, Video } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

interface FileUploadComponentProps {
  campaignId: string;
  onUploadSuccess: () => void;
}

interface UploadingFile {
  file: File;
  progress: number;
  error?: string;
}

export function FileUploadComponent({ campaignId, onUploadSuccess }: FileUploadComponentProps) {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return <ImageIcon className="h-8 w-8 text-blue-500" />;
    if (fileType.startsWith('video/')) return <Video className="h-8 w-8 text-purple-500" />;
    if (fileType.includes('pdf')) return <FileText className="h-8 w-8 text-red-500" />;
    return <File className="h-8 w-8 text-gray-500" />;
  };

  const uploadFile = async (file: File) => {
    try {
      // Add file to uploading state
      setUploadingFiles(prev => [...prev, { file, progress: 0 }]);

      // Create unique file name
      const fileExt = file.name.split('.').pop();
      const fileName = `${campaignId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('campaign-report-files')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Update progress
      setUploadingFiles(prev =>
        prev.map(f => f.file === file ? { ...f, progress: 50 } : f)
      );

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('campaign-report-files')
        .getPublicUrl(fileName);

      // Save file metadata to database
      const { error: dbError } = await supabase
        .from('campaign_report_files')
        .insert({
          campaign_id: campaignId,
          file_name: file.name,
          file_url: publicUrl,
          file_type: file.type,
          file_size: file.size,
          is_public: false,
          uploaded_by: (await supabase.auth.getUser()).data.user?.id || null,
          display_order: 0,
        });

      if (dbError) throw dbError;

      // Update progress to complete
      setUploadingFiles(prev =>
        prev.map(f => f.file === file ? { ...f, progress: 100 } : f)
      );

      // Remove from uploading after a delay
      setTimeout(() => {
        setUploadingFiles(prev => prev.filter(f => f.file !== file));
      }, 1000);

      toast({
        title: 'Success',
        description: `${file.name} uploaded successfully`,
      });

      onUploadSuccess();
    } catch (error: any) {
      console.error('Upload error:', error);
      setUploadingFiles(prev =>
        prev.map(f => f.file === file ? { ...f, error: error.message } : f)
      );

      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload file',
        variant: 'destructive',
      });
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      await uploadFile(files[i]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragIn = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragOut = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeUploadingFile = (file: File) => {
    setUploadingFiles(prev => prev.filter(f => f.file !== file));
  };

  return (
    <div className="space-y-4">
      <div
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-[#3e8692] bg-[#3e8692]/5'
            : 'border-gray-300 hover:border-[#3e8692] hover:bg-gray-50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
        {isDragActive ? (
          <p className="text-lg font-medium text-[#3e8692]">Drop files here...</p>
        ) : (
          <>
            <p className="text-lg font-medium text-gray-700 mb-2">
              Drag & drop files here, or click to browse
            </p>
            <p className="text-sm text-gray-500">
              Any file type supported
            </p>
          </>
        )}
      </div>

      {uploadingFiles.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold text-sm text-gray-700">Uploading...</h4>
          {uploadingFiles.map((uploadingFile, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg"
            >
              {getFileIcon(uploadingFile.file.type)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {uploadingFile.file.name}
                </p>
                <p className="text-xs text-gray-500">
                  {(uploadingFile.file.size / 1024 / 1024).toFixed(2)} MB
                </p>
                {uploadingFile.error ? (
                  <p className="text-xs text-red-600 mt-1">{uploadingFile.error}</p>
                ) : (
                  <div className="mt-2">
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full transition-all duration-300"
                        style={{
                          width: `${uploadingFile.progress}%`,
                          backgroundColor: '#3e8692',
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeUploadingFile(uploadingFile.file)}
                disabled={uploadingFile.progress === 100}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
