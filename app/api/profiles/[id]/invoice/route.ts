import { attachInvoiceToProfile } from "@/lib/profiles";
import { handleRouteError, jsonResponse, readJsonBody, validationError } from "@/lib/http";
import { invoiceAttachmentSchema, profileIdSchema } from "@/lib/validation";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const parsedId = profileIdSchema.safeParse(id);
  if (!parsedId.success) {
    return validationError(parsedId.error);
  }

  const parsedBody = invoiceAttachmentSchema.safeParse(await readJsonBody(request));
  if (!parsedBody.success) {
    return validationError(parsedBody.error);
  }

  try {
    const result = await attachInvoiceToProfile(
      parsedId.data,
      parsedBody.data.amountCents,
      parsedBody.data.invoiceNumber,
    );
    return result
      ? jsonResponse(result, result.newlyAttached ? 201 : 200)
      : jsonResponse({ error: "Profile not found" }, 404);
  } catch (error) {
    return handleRouteError(error);
  }
}
