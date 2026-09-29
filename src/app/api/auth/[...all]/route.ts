import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '@/server/auth';
import { requestDb } from '@/server/db';

// Handler erst beim Aufruf erzeugen, damit der Build keine Datenbank öffnet.
export async function GET(request: Request) {
  await requestDb();
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request) {
  await requestDb();
  return toNextJsHandler(getAuth()).POST(request);
}
