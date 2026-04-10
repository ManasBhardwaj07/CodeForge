export function errorResponse(message: string, code: string, status: number): Response {
  return Response.json(
    {
      error: message,
      code,
    },
    { status },
  );
}
