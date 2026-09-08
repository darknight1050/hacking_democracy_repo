import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function sameOrigin(request: Request) {
  const allowed = process.env.APP_ORIGIN ?? 'http://localhost:3000';
  if (request.headers.get('origin') !== new URL(allowed).origin)
    throw new HttpError(403, 'This request must come from the app.');
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
