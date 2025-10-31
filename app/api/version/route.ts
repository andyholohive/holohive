import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Use build time as version
  const version = process.env.BUILD_TIME || Date.now().toString();

  return NextResponse.json({ version }, {
    headers: {
      'Cache-Control': 'no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    }
  });
}
