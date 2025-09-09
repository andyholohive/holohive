'use client';

import React from 'react';
import { MessageTemplateManager } from '@/components/ai/MessageTemplateManager';
import { MessageTemplate } from '@/lib/messageTrainingService';

export default function TemplatesPage() {
  const handleTemplateSelected = (template: MessageTemplate) => {
    // Handle template selection - could copy to clipboard, open in editor, etc.
    console.log('Template selected:', template);
  };

  return (
    <div className="space-y-6">
      <MessageTemplateManager
        onTemplateSelected={handleTemplateSelected}
      />
    </div>
  );
}
