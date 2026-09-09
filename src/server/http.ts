import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { HttpError } from './errors';
export function sameOrigin(request: Request) {
  const allowed = process.env.APP_ORIGIN ?? 'http://localhost:3000';
  if (request.headers.get('origin') !== new URL(allowed).origin)
    throw new HttpError(403, 'This request must come from the app.');
}
// Bound JSON bodies before parsing, even when Content-Length is absent.
export async function readJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Missing request body.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) {
      await reader.cancel();
      throw new HttpError(413, 'Request is too large.');
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function handler(work: () => Promise<Response>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof HttpError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? 'Invalid input.' },
        { status: 400 },
      );
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    console.error(error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

export { HttpError } from './errors';
