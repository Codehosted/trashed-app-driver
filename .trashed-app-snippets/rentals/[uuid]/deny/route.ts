import { NextRequest, NextResponse } from "next/server";
import { denyRentalDirect } from "@/actions/rentals";
import { requireAuth } from "@/lib/auth/utils";
import { rentals } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { revalidateTag } from "next/cache";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const body = await request.json();
    const { token, reason, message } = body;
    const rentalUuid = (await params).uuid;

    if (!rentalUuid) {
      return NextResponse.json({ error: "Rental UUID is required" }, { status: 400 });
    }

    let rental = await db.query.rentals.findFirst({
      where: eq(rentals.uuid, rentalUuid),
      with: {
        dumpster: {
          with: {
            vendor: true,
          },
        },
      },
    });

    if (!rental) {
      return NextResponse.json({ error: "Rental not found" }, { status: 400 });
    }

    // Two modes:
    // - Email link: token provided; validate it
    // - Authenticated vendor action: no token; require vendor session and vendor ownership
    if (token) {
      if (rental.vendorConfirmationToken !== token) {
        return NextResponse.json(
          { error: "Invalid confirmation token" },
          { status: 400 }
        );
      }
      const directResult = await denyRentalDirect(rentalUuid, rental.dumpster.vendorId, reason, message);
      if (!directResult.success) {
        return NextResponse.json({ error: directResult.error || "Failed to deny rental" }, { status: 400 });
      }
      // Invalidate customer rentals cache so status updates appear immediately
      if (rental.customerId) {
        revalidateTag(`customer-rentals:${rental.customerId}`, "page");
      }
      return NextResponse.json({ success: true, message: "Rental denied successfully" });
    } else {
      // Authenticated vendor path
      const { session } = await requireAuth(request.url, { requireVendor: true });
      const vendorUserId = Number(session.user.id);
      if (rental.dumpster.vendor.userId !== vendorUserId) {
        return NextResponse.json({ error: "Unauthorized to deny this rental" }, { status: 403 });
      }
      // Perform denial using server action that accepts vendorId directly
      const directResult = await denyRentalDirect(rentalUuid, rental.dumpster.vendorId, reason, message);
      if (!directResult.success) {
        return NextResponse.json({ error: directResult.error || "Failed to deny rental" }, { status: 400 });
      }
      if (rental.customerId) {
        revalidateTag(`customer-rentals:${rental.customerId}`, "page");
      }
      return NextResponse.json({ success: true, message: "Rental denied successfully" });
    }

    // Type assertion for the rental with dumpster data
    const rentalWithDumpster = rental as typeof rental & {
      dumpster: {
        id: number;
        uuid: string;
        createdAt: Date;
        updatedAt: Date;
        vendorId: number;
        description: string;
        size: number;
        type: string;
        price: string;
        available: boolean;
        weightLimit: number;
        dimensions: { length: number; width: number; height: number };
        recommendedFor: string;
        acceptedMaterials: string[];
        prohibitedMaterials: string[];
        extraDayPrice: string;
        vendor: {
          id: number;
          uuid: string;
          businessName: string;
          primaryPhone: string;
        };
      };
    };

    // Unreachable: both branches return above
  } catch (error) {
    console.error("Error denying rental:", error);
    return NextResponse.json(
      { error: "Failed to deny rental" },
      { status: 500 }
    );
  }
}
