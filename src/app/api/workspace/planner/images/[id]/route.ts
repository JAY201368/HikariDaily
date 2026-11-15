import { handleImage } from '@/server/workspace/planner/routes';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export const GET = async (request: Request, context: Context) => handleImage(request, (await context.params).id);
export const PUT = GET;
