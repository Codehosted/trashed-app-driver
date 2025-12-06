import { NextRequest, NextResponse } from "next/server";
import { confirmRentalAndCapturePayment } from "@/actions/vendor-rentals";
import { getDumpsterWithVendorDetails } from "@/actions/dumpsters";
import { rentals, customers, users, UserWithRoles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { getEmailService } from "@/lib/email/service";
import { slackService } from "@/service/slack";
import { type MinimalUser } from "@/lib/events";
import { userRoles } from "@/lib/db/schema";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const body = await request.json();
    const { token } = body;
    const rentalUuid = (await params).uuid;

    if (!rentalUuid || !token) {
      return NextResponse.json(
        {
          error: "Missing required fields: rentalUuid, token",
        },
        { status: 400 }
      );
    }

    let rental = await db.query.rentals.findFirst({
      where: eq(rentals.uuid, rentalUuid),
      with: {
        dumpster: {
          with: {
            vendor: {
              with: {
                owner: {
                  columns: {
                    id: true,
                    uuid: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!rental) {
      return NextResponse.json({ error: "Rental not found" }, { status: 400 });
    }

    // Verify vendor confirmation token
    if (rental.vendorConfirmationToken !== token) {
      return NextResponse.json(
        { error: "Invalid confirmation token" },
        { status: 400 }
      );
    }

    // Check if rental is already confirmed or in a final state
    if (rental.status === "confirmed") {
      return NextResponse.json(
        { error: "Rental has already been confirmed" },
        { status: 400 }
      );
    }

    if (rental.status === "denied") {
      return NextResponse.json(
        { error: "Rental has already been denied" },
        { status: 400 }
      );
    }

    if (rental.status === "cancelled") {
      return NextResponse.json(
        { error: "Rental has been cancelled" },
        { status: 400 }
      );
    }

    if (rental.status === "completed") {
      return NextResponse.json(
        { error: "Rental has already been completed" },
        { status: 400 }
      );
    }

    // Only allow confirmation from pending status
    if (rental.status !== "pending") {
      return NextResponse.json(
        { error: `Cannot confirm rental with status: ${rental.status}` },
        { status: 400 }
      );
    }

    // Additional check: verify rental hasn't already been confirmed (double-check with confirmed field)
    if (rental.confirmed === true || rental.confirmedAt) {
      return NextResponse.json(
        { error: "Rental has already been confirmed" },
        { status: 400 }
      );
    }

    // Type assertion for the rental with dumpster relation
    const rentalWithRelations = rental as typeof rental & {
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
          operatingHoursOpen: string;
          operatingHoursClose: string;
          owner: {
            id: number;
            uuid: string;
            name: string;
            email: string;
          };
        };
      };
    };

    if (!rentalWithRelations.dumpster?.vendor?.owner) {
      return NextResponse.json(
        { error: "Vendor owner information not found" },
        { status: 400 }
      );
    }
    const confirmResult = await confirmRentalAndCapturePayment({
      rental: rentalWithRelations,
      vendorId: rentalWithRelations.dumpster.vendor.id,
      paymentIntentId: rentalWithRelations.paymentIntentId,
    });

    if (confirmResult.success) {
      // Get properly typed dumpster data for events
      const dumpsterWithVendor = await getDumpsterWithVendorDetails(
        rentalWithRelations.dumpster.uuid
      );

      const customer = await db.query.customers.findFirst({
        where: eq(customers.id, confirmResult.rental.customerId),
      });

      if (!customer) {
        return NextResponse.json(
          { error: "Customer not found for rental" },
          { status: 404 }
        );
      }

      const user = await db.query.users.findFirst({
        where: eq(users.id, customer.userId),
      });

      if (!user) {
        return NextResponse.json(
          { error: "User not found for customer" },
          { status: 404 }
        );
      }

      const roles = await db.query.userRoles.findMany({
        where: eq(userRoles.userId, user.id),
      });

      const customerUser: MinimalUser = {
        id: user.id,
        uuid: user.uuid,
        name: user.name,
        email: user.email,
        phone: user.phone,
        roles: roles.map((role) => ({ role: role.role })),
      };

      // Synchronous notifications
      await getEmailService().sendRentalstatusUpdatedCustomerEmail({
        rental: confirmResult.rental,
        dumpster: dumpsterWithVendor,
        user: customerUser,
        status: "confirmed",
      });

      await getEmailService().sendRentalstatusUpdatedVendorEmail({
        rental: confirmResult.rental,
        dumpster: dumpsterWithVendor,
        user: customerUser,
        status: "confirmed",
        vendorEmail: dumpsterWithVendor.vendor.owner.email,
      });

      await slackService.sendRentalStatusUpdatedNotification({
        rental: confirmResult.rental,
        dumpster: dumpsterWithVendor,
        user: customerUser,
        previousStatus: "pending",
        newStatus: "confirmed",
        channel: "orders",
      });

      return NextResponse.json({
        success: true,
        message: "Rental confirmed successfully",
      });
    } else {
      return NextResponse.json(
        { error: "Failed to confirm rental" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error confirming rental:", error);
    return NextResponse.json(
      { error: "Failed to confirm rental" },
      { status: 500 }
    );
  }
}
