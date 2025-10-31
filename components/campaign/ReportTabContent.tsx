'use client';

import { CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { FileUploadComponent } from './FileUploadComponent';
import { Image as ImageIcon, Video, File, Download, Eye, EyeOff, Trash2, Copy, FileText, ExternalLink } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, Cell } from 'recharts';

interface ReportTabContentProps {
  campaignId: string;
  reportFiles: any[];
  loadingReportFiles: boolean;
  customMessage: string;
  shareReportPublicly: boolean;
  contents: any[];
  campaignKOLs: any[];
  onCustomMessageChange: (message: string) => void;
  onSaveCustomMessage: () => void;
  onToggleFilePublic: (fileId: string, isPublic: boolean) => void;
  onDeleteFile: (fileId: string, fileUrl: string) => void;
  onTogglePublicReport: (enabled: boolean) => void;
  onUploadSuccess: () => void;
}

export function ReportTabContent({
  campaignId,
  reportFiles,
  loadingReportFiles,
  customMessage,
  shareReportPublicly,
  contents,
  campaignKOLs,
  onCustomMessageChange,
  onSaveCustomMessage,
  onToggleFilePublic,
  onDeleteFile,
  onTogglePublicReport,
  onUploadSuccess,
}: ReportTabContentProps) {

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) return <ImageIcon className="h-8 w-8 text-blue-500" />;
    if (fileType.startsWith('video/')) return <Video className="h-8 w-8 text-purple-500" />;
    return <File className="h-8 w-8 text-gray-500" />;
  };

  // Calculate performance metrics
  const totalImpressions = contents.reduce((sum, content) => sum + (content.impressions || 0), 0);
  const totalLikes = contents.reduce((sum, content) => sum + (content.likes || 0), 0);
  const totalComments = contents.reduce((sum, content) => sum + (content.comments || 0), 0);
  const totalRetweets = contents.reduce((sum, content) => sum + (content.retweets || 0), 0);
  const totalBookmarks = contents.reduce((sum, content) => sum + (content.bookmarks || 0), 0);
  const totalEngagement = totalLikes + totalComments + totalRetweets + totalBookmarks;
  const engagementRate = totalImpressions > 0 ? ((totalEngagement / totalImpressions) * 100).toFixed(2) : '0.00';

  // Per-KOL performance
  const kolPerformance = campaignKOLs.map(kol => {
    const kolContents = contents.filter(c => c.campaign_kols_id === kol.id);
    const impressions = kolContents.reduce((sum, c) => sum + (c.impressions || 0), 0);
    const engagement = kolContents.reduce((sum, c) =>
      sum + (c.likes || 0) + (c.comments || 0) + (c.retweets || 0) + (c.bookmarks || 0), 0);

    return {
      name: kol.master_kol?.name || 'Unknown',
      impressions,
      engagement,
      contentCount: kolContents.length,
    };
  }).filter(kol => kol.contentCount > 0);

  // Timeline data (by activation date) - CUMULATIVE
  const timelineDataRaw = contents
    .filter(c => c.activation_date)
    .reduce((acc: any[], content) => {
      const date = new Date(content.activation_date).toLocaleDateString();
      const existing = acc.find(item => item.date === date);

      if (existing) {
        existing.impressions += content.impressions || 0;
        existing.engagement += (content.likes || 0) + (content.comments || 0) +
                               (content.retweets || 0) + (content.bookmarks || 0);
      } else {
        acc.push({
          date,
          impressions: content.impressions || 0,
          engagement: (content.likes || 0) + (content.comments || 0) +
                     (content.retweets || 0) + (content.bookmarks || 0),
        });
      }

      return acc;
    }, [])
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Make cumulative
  let cumulativeImpressions = 0;
  let cumulativeEngagement = 0;
  const timelineData = timelineDataRaw.map(item => {
    cumulativeImpressions += item.impressions;
    cumulativeEngagement += item.engagement;
    return {
      date: item.date,
      impressions: cumulativeImpressions,
      engagement: cumulativeEngagement,
    };
  });

  const copyShareLink = () => {
    const url = `${window.location.origin}/public/reports/${campaignId}`;
    navigator.clipboard.writeText(url);
  };

  return (
    <div className="w-full bg-white border border-gray-200 shadow-sm p-6">
      <CardHeader className="pb-6 border-b border-gray-100 flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gray-100 p-2 rounded-lg"><FileText className="h-6 w-6 text-gray-600" /></div>
          <h2 className="text-2xl font-bold text-gray-900">Campaign Report</h2>
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-8">
        {/* Public Sharing Controls */}
        <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Public Report Settings</h3>
              <p className="text-sm text-gray-500 mt-1">Control access to the public report view</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <Label htmlFor="public-report" className="text-sm font-medium text-gray-700">Enable Public Report</Label>
                <p className="text-sm text-gray-500 mt-1">Allow clients to view this report via shareable link</p>
              </div>
              <Switch
                id="public-report"
                checked={shareReportPublicly}
                onCheckedChange={onTogglePublicReport}
                className="data-[state=checked]:bg-[#3e8692]"
              />
            </div>

            {shareReportPublicly && (
              <div className="space-y-2">
                <Label>Share Link</Label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={`${window.location.origin}/public/reports/${campaignId}`}
                    readOnly
                    className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded text-sm font-mono"
                  />
                  <Button
                    variant="outline"
                    className="h-10"
                    onClick={copyShareLink}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10"
                    onClick={() => window.open(`${window.location.origin}/public/reports/${campaignId}`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Performance Summary */}
        <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Performance Summary</h3>
              <p className="text-sm text-gray-500 mt-1">Aggregated campaign performance metrics</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200">
              <p className="text-sm text-blue-600 font-medium">Total Impressions</p>
              <p className="text-3xl font-bold text-blue-900 mt-2">{totalImpressions.toLocaleString()}</p>
            </div>
            <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-xl border border-green-200">
              <p className="text-sm text-green-600 font-medium">Total Engagement</p>
              <p className="text-3xl font-bold text-green-900 mt-2">{totalEngagement.toLocaleString()}</p>
            </div>
            <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl border border-purple-200">
              <p className="text-sm text-purple-600 font-medium">Engagement Rate</p>
              <p className="text-3xl font-bold text-purple-900 mt-2">{Number(engagementRate).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}%</p>
            </div>
            <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl border border-orange-200">
              <p className="text-sm text-orange-600 font-medium">Content Count</p>
              <p className="text-3xl font-bold text-orange-900 mt-2">{contents.length.toLocaleString()}</p>
            </div>
          </div>

          {/* Timeline Chart */}
          {timelineData.length > 0 && (
            <div className="mt-8">
              <h4 className="text-lg font-bold text-gray-900 mb-4">Performance Over Time</h4>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timelineData} margin={{ top: 30, right: 40, left: 40, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      tickFormatter={(value) => value.toLocaleString()}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        fontSize: '14px'
                      }}
                      formatter={(value: number) => [value.toLocaleString()]}
                      labelFormatter={(label: string) => `Date: ${label}`}
                    />
                    <Legend
                      wrapperStyle={{ paddingTop: '20px' }}
                      iconType="circle"
                    />
                    <Line
                      type="monotone"
                      dataKey="impressions"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      name="Impressions"
                      dot={{ fill: '#3b82f6', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="engagement"
                      stroke="#10b981"
                      strokeWidth={3}
                      name="Engagement"
                      dot={{ fill: '#10b981', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* Per-KOL Performance */}
        {kolPerformance.length > 0 && (
          <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Per-KOL Performance</h3>
                <p className="text-sm text-gray-500 mt-1">Individual performance breakdown by KOL</p>
              </div>
            </div>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={kolPerformance} margin={{ top: 30, right: 40, left: 40, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#64748b', fontWeight: 500 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    tickFormatter={(value) => value.toLocaleString()}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                      fontSize: '14px'
                    }}
                    formatter={(value: number) => [value.toLocaleString()]}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: '20px' }}
                    iconType="rect"
                  />
                  <Bar
                    dataKey="impressions"
                    name="Impressions"
                    radius={[8, 8, 0, 0]}
                  >
                    {kolPerformance.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill="#3b82f6" />
                    ))}
                  </Bar>
                  <Bar
                    dataKey="engagement"
                    name="Engagement"
                    radius={[8, 8, 0, 0]}
                  >
                    {kolPerformance.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill="#10b981" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Custom Message */}
        <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Custom Message for Client</h3>
              <p className="text-sm text-gray-500 mt-1">Add a personalized message for the public report</p>
            </div>
          </div>
          <div className="space-y-4">
            <Textarea
              placeholder="Add a custom message that will be displayed in the public report..."
              value={customMessage}
              onChange={(e) => onCustomMessageChange(e.target.value)}
              rows={5}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#3e8692] focus:border-transparent"
            />
            <Button
              onClick={onSaveCustomMessage}
              style={{ backgroundColor: '#3e8692', color: 'white' }}
              className="hover:opacity-90"
            >
              Save Message
            </Button>
          </div>
        </div>

        {/* File Upload & Management */}
        <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Files & Media</h3>
              <p className="text-sm text-gray-500 mt-1">Upload and manage report files</p>
            </div>
          </div>
          <div className="space-y-6">
            <FileUploadComponent
              campaignId={campaignId}
              onUploadSuccess={onUploadSuccess}
            />

            {loadingReportFiles ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#3e8692]"></div>
                <p className="text-gray-500 mt-3">Loading files...</p>
              </div>
            ) : reportFiles.length > 0 ? (
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                  <File className="h-4 w-4" />
                  Uploaded Files ({reportFiles.length})
                </h4>
                {reportFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                  >
                    {getFileIcon(file.file_type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file.file_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {(file.file_size / 1024 / 1024).toFixed(2)} MB • {new Date(file.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onToggleFilePublic(file.id, !file.is_public)}
                        title={file.is_public ? 'Hide from public report' : 'Show in public report'}
                        className={file.is_public ? 'text-green-600 hover:text-green-700' : 'text-gray-400 hover:text-gray-500'}
                      >
                        {file.is_public ? (
                          <Eye className="h-4 w-4" />
                        ) : (
                          <EyeOff className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(file.file_url, '_blank')}
                        className="hover:text-[#3e8692]"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeleteFile(file.id, file.file_url)}
                        className="hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                <File className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                <p className="text-gray-500">No files uploaded yet</p>
                <p className="text-sm text-gray-400 mt-1">Upload files using the area above</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </div>
  );
}
