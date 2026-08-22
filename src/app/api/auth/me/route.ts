import { requireAuth } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await requireAuth(request);
    return Response.json({ authenticated: true, user }, { status: 200 });
  } catch {
    return Response.json({ authenticated: false }, { status: 401 });
  }
}
