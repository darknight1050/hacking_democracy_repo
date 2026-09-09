/** Domain failures; HTTP adapters decide how to send these to clients. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
