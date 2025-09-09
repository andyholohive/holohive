'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AIService } from '@/lib/aiService';

export default function TestAIPage() {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (log: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${log}`]);
  };

  const testAI = async () => {
    if (!message.trim()) return;

    setLoading(true);
    setResponse('');
    setLogs([]);

    try {
      addLog('Starting AI test...');
      
      // Test 1: Check environment variables
      addLog('Checking environment variables...');
      const envCheck = {
        OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
        NEXT_PUBLIC_OPENAI_API_KEY: !!process.env.NEXT_PUBLIC_OPENAI_API_KEY,
        NODE_ENV: process.env.NODE_ENV
      };
      addLog(`Environment check: ${JSON.stringify(envCheck)}`);

      // Test 2: Test API route
      addLog('Testing API route...');
      const testMessages = [
        { role: 'user', content: message }
      ];
      
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: testMessages
        }),
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const aiResponse = await response.json();
      addLog(`API response received: ${aiResponse.content.substring(0, 100)}...`);
      addLog(`Tokens used: ${JSON.stringify(aiResponse.tokens)}`);
      addLog(`Cost: $${aiResponse.cost.toFixed(6)}`);

      // Test 3: Test AIService
      addLog('Testing AIService...');
      const aiserviceResponse = await AIService.getAIResponse(testMessages);
      addLog(`AIService response received: ${aiserviceResponse.substring(0, 100)}...`);

      setResponse(aiserviceResponse);
      addLog('Test completed successfully!');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLog(`Error: ${errorMessage}`);
      setResponse(`Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const testEnvironment = () => {
    addLog('Testing environment variables...');
    const envCheck = {
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      NEXT_PUBLIC_OPENAI_API_KEY: !!process.env.NEXT_PUBLIC_OPENAI_API_KEY,
      NODE_ENV: process.env.NODE_ENV
    };
    addLog(`Environment check: ${JSON.stringify(envCheck)}`);
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">AI Assistant Test Page</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Test Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Test Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Test Message:</label>
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Enter a test message..."
                className="mb-4"
              />
            </div>
            
            <div className="space-y-2">
              <Button 
                onClick={testAI} 
                disabled={loading || !message.trim()}
                className="w-full"
              >
                {loading ? 'Testing...' : 'Test AI Response'}
              </Button>
              
              <Button 
                onClick={testEnvironment} 
                variant="outline"
                className="w-full"
              >
                Test Environment Variables
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Response */}
        <Card>
          <CardHeader>
            <CardTitle>AI Response</CardTitle>
          </CardHeader>
          <CardContent>
            {response ? (
              <div className="bg-gray-50 p-4 rounded-lg">
                <pre className="whitespace-pre-wrap text-sm">{response}</pre>
              </div>
            ) : (
              <p className="text-gray-500">No response yet. Send a test message to see the AI response.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Logs */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Debug Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-black text-green-400 p-4 rounded-lg h-64 overflow-y-auto font-mono text-sm">
            {logs.length > 0 ? (
              logs.map((log, index) => (
                <div key={index}>{log}</div>
              ))
            ) : (
              <div>No logs yet. Run a test to see debug information.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
