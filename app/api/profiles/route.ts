import { createProfile, listProfiles } from "@/lib/profiles";
import { handleRouteError, jsonResponse, readJsonBody, requireAdmin, validationError } from "@/lib/http";
import { profileCreateSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    return jsonResponse({ profiles: await listProfiles() });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  const authenticationError = requireAdmin(request);
  if (authenticationError) {
    return authenticationError;
  }

  const parsed = profileCreateSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  try {
    return jsonResponse({ profile: await createProfile(parsed.data.name, parsed.data.currency) }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
