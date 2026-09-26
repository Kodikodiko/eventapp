import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '@/server/auth';

// Handler erst beim Aufruf erzeugen, damit der Build keine Datenbank öffnet.
export function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}

export function POST(request: Request) {
  return toNextJsHandler(getAuth()).POST(request);
}
