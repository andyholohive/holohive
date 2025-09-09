import { createClient } from '@supabase/supabase-js';
import { List } from 'lucide-react';
import Image from 'next/image';

// Create a standalone Supabase client for public access
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabasePublic = createClient(supabaseUrl, supabaseAnonKey);

export default async function TestPage() {
  // Test database connection
  let dbStatus = 'Unknown';
  let listsCount = 0;
  let specificListStatus = 'Not tested';
  let createTestListStatus = 'Not attempted';
  let tableStructure = 'Unknown';
  let existingLists: any[] = [];
  const testListId = '0a95e4c8-c082-48b0-b43b-a0b10d7d181c';
  
  try {
    const { data, error } = await supabasePublic
      .from('lists')
      .select('id, name, created_at')
      .limit(10);
    
    if (error) {
      dbStatus = `Error: ${error.message}`;
    } else {
      dbStatus = 'Connected';
      listsCount = data?.length || 0;
      existingLists = data || [];
    }
  } catch (err) {
    dbStatus = `Exception: ${err}`;
  }

  // Test specific list
  try {
    const { data: specificList, error: specificError } = await supabasePublic
      .from('lists')
      .select('id, name, created_at')
      .eq('id', testListId)
      .single();
    
    if (specificError) {
      specificListStatus = `Error: ${specificError.message}`;
    } else if (specificList) {
      specificListStatus = `Found: ${specificList.name}`;
    } else {
      specificListStatus = 'Not found';
    }
  } catch (err) {
    specificListStatus = `Exception: ${err}`;
  }

  // Check table structure
  try {
    const { data: structureData, error: structureError } = await supabasePublic
      .from('lists')
      .select('*')
      .limit(1);
    
    if (structureError) {
      tableStructure = `Error: ${structureError.message}`;
    } else if (structureData && structureData.length > 0) {
      const columns = Object.keys(structureData[0]);
      tableStructure = `Columns: ${columns.join(', ')}`;
    } else {
      tableStructure = 'No data to inspect structure';
    }
  } catch (err) {
    tableStructure = `Exception: ${err}`;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Logo */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Image
                src="/images/logo.png"
                alt="KOL Campaign Manager Logo"
                width={40}
                height={40}
                className="rounded-lg"
              />
              <div>
                <h1 className="text-xl font-bold text-gray-900">KOL Campaign Manager</h1>
                <p className="text-sm text-gray-600">Database Test</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm border p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Database Connection Test</h2>
          
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <span className="font-semibold">Database Status:</span>
              <span className={`px-2 py-1 rounded text-sm ${
                dbStatus === 'Connected' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {dbStatus}
              </span>
            </div>
            
            <div className="flex items-center space-x-2">
              <span className="font-semibold">Lists Found:</span>
              <span className="px-2 py-1 rounded bg-blue-100 text-blue-800 text-sm">
                {listsCount}
              </span>
            </div>
            
            <div className="flex items-center space-x-2">
              <span className="font-semibold">Table Structure:</span>
              <span className="text-sm text-gray-600 font-mono">
                {tableStructure}
              </span>
            </div>
            
            <div className="flex items-center space-x-2">
              <span className="font-semibold">Specific List Test:</span>
              <span className={`px-2 py-1 rounded text-sm ${
                specificListStatus.includes('Found') ? 'bg-green-100 text-green-800' : 
                specificListStatus.includes('Error') ? 'bg-red-100 text-red-800' : 
                'bg-yellow-100 text-yellow-800'
              }`}>
                {specificListStatus}
              </span>
            </div>
            
            <div className="flex items-center space-x-2">
              <span className="font-semibold">Test List ID:</span>
              <span className="text-sm text-gray-600 font-mono">
                {testListId}
              </span>
            </div>
            
            <div className="flex items-center space-x-2">
              <span className="font-semibold">Supabase URL:</span>
              <span className="text-sm text-gray-600">
                {supabaseUrl ? 'Configured' : 'Missing'}
              </span>
            </div>
            
            <div className="flex items-center space-x-2">
              <span className="font-semibold">Supabase Key:</span>
              <span className="text-sm text-gray-600">
                {supabaseAnonKey ? 'Configured' : 'Missing'}
              </span>
            </div>
          </div>
          
          {/* Existing Lists */}
          {existingLists.length > 0 && (
            <div className="mt-8 p-4 bg-green-50 rounded-lg border border-green-200">
              <h3 className="font-semibold text-green-900 mb-3">Existing Lists (Click to Test):</h3>
              <div className="space-y-2">
                {existingLists.map((list) => (
                  <div key={list.id} className="flex items-center justify-between p-2 bg-white rounded border">
                    <div>
                      <span className="font-medium text-gray-900">{list.name}</span>
                      <span className="text-sm text-gray-500 ml-2">({list.id})</span>
                    </div>
                    <a 
                      href={`/public/lists/${list.id}`}
                      className="text-blue-600 hover:text-blue-800 underline text-sm"
                    >
                      Test Shared List
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="mt-8 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">How to Test Shared Lists:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
              <li>Go to your main app and create a list</li>
              <li>Copy the list ID (UUID format like: 123e4567-e89b-12d3-a456-426614174000)</li>
              <li>Visit: <code className="bg-gray-200 px-1 rounded">/public/lists/[your-list-id]</code></li>
            </ol>
            
            <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200">
              <h4 className="font-semibold text-blue-900 mb-1">Quick Test:</h4>
              <p className="text-sm text-blue-800">
                If the test list was created successfully, you can now visit:
              </p>
              <a 
                href={`/public/lists/${testListId}`}
                className="text-blue-600 hover:text-blue-800 underline text-sm"
              >
                /public/lists/{testListId}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
