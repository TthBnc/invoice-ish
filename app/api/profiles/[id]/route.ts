import { deleteProfile, getProfileWithLedger, updateProfile } from "@/lib/profiles";
import { handleRouteError, jsonResponse, readJsonBody, requireAdmin, validationError } from "@/lib/http";
import { profileIdSchema, profileUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

async function routeProfileId(context: RouteContext) {
  const { id } = await context.params;
  return profileIdSchema.safeParse(id);
}

export async function GET(_request: Request, context: RouteContext) {
  const parsedId = await routeProfileId(context);
  if (!parsedId.success) {
    return validationError(parsedId.error);
  }

  try {
    const profile = await getProfileWithLedger(parsedId.data);
    return profile ? jsonResponse({ profile, transactions: profile.transactions }) : jsonResponse({ error: "Profile not found" }, 404);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const authenticationError = requireAdmin(request);
  if (authenticationError) {
    return authenticationError;
  }

  const parsedId = await routeProfileId(context);
  if (!parsedId.success) {
    return validationError(parsedId.error);
  }

  const parsedBody = profileUpdateSchema.safeParse(await readJsonBody(request));
  if (!parsedBody.success) {
    return validationError(parsedBody.error);
  }

  try {
    const profile = await updateProfile(parsedId.data, parsedBody.data);
    return profile ? jsonResponse({ profile }) : jsonResponse({ error: "Profile not found" }, 404);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const authenticationError = requireAdmin(request);
  if (authenticationError) {
    return authenticationError;
  }

  const parsedId = await routeProfileId(context);
  if (!parsedId.success) {
    return validationError(parsedId.error);
  }

  try {
    const deleted = await deleteProfile(parsedId.data);
    return deleted ? jsonResponse({ deleted: true }) : jsonResponse({ error: "Profile not found" }, 404);
  } catch (error) {
    return handleRouteError(error);
  }
}
