import type { NextResponse } from "next/server";

import { createLedgerEntry, getProfileWithLedger } from "@/lib/profiles";
import {
  ledgerEntryInputSchema,
  profileIdSchema,
  type LedgerType,
} from "@/lib/validation";
import {
  handleRouteError,
  jsonResponse,
  readJsonBody,
  requireAdmin,
  validationError,
} from "@/lib/http";

export async function handleLedgerGet(profileId: string): Promise<NextResponse> {
  const parsedId = profileIdSchema.safeParse(profileId);
  if (!parsedId.success) {
    return validationError(parsedId.error);
  }

  try {
    const profile = await getProfileWithLedger(parsedId.data);
    return profile
      ? jsonResponse({ profile, transactions: profile.transactions })
      : jsonResponse({ error: "Profile not found" }, 404);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function handleLedgerPost(
  request: Request,
  profileId: string,
  forcedType?: LedgerType,
): Promise<NextResponse> {
  const authenticationError = requireAdmin(request);
  if (authenticationError) {
    return authenticationError;
  }

  const parsedId = profileIdSchema.safeParse(profileId);
  if (!parsedId.success) {
    return validationError(parsedId.error);
  }

  const body = await readJsonBody(request);
  const bodyWithForcedType =
    forcedType && typeof body === "object" && body !== null
      ? { ...(body as Record<string, unknown>), type: forcedType }
      : body;
  const parsedInput = ledgerEntryInputSchema.safeParse(bodyWithForcedType);

  if (!parsedInput.success) {
    return validationError(parsedInput.error);
  }

  try {
    const result = await createLedgerEntry(parsedId.data, parsedInput.data);
    return result
      ? jsonResponse(result, 201)
      : jsonResponse({ error: "Profile not found" }, 404);
  } catch (error) {
    return handleRouteError(error);
  }
}

