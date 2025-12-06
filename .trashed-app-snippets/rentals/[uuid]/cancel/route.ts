import { NextResponse } from "next/server";
import { cancelRental } from "@/actions/rentals";
import { getCurrentUser } from "@/actions/users";
import { db } from "@/lib/db/drizzle";
import { eq } from "drizzle-orm";
import { rentals, userRoles } from "@/lib/db/schema";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { uuid: rentalUuid } = await params;
    const body = await request.json();
    const { reason } = body;

    if (!rentalUuid) {
      return NextResponse.json(
        { success: false, error: "Missing rental ID" },
        { status: 400 }
      );
    }

    // Get the rental to determine who is cancelling
    const rental = await db.query.rentals.findFirst({
      where: eq(rentals.uuid, rentalUuid),
      with: {
        dumpster: {
          with: {
            vendor: {
              with: {
                owner: true,
              },
            },
          },
        },
        vendorCustomerRelationship: {
          with: {
            customerUser: true,
            vendorUser: true,
          },
        },
      },
    });

    if (!rental) {
      return NextResponse.json(
        { success: false, error: "Rental not found" },
        { status: 404 }
      );
    }

    // Determine if user is customer or vendor
    let cancelledBy: 'customer' | 'vendor' = 'customer';
    
    // Check if user is the customer
    if (rental.vendorCustomerRelationship?.customerUser?.id === user.id) {
      cancelledBy = 'customer';
    }
    // Check if user is the vendor
    else if (rental.dumpster.vendor.userId === user.id) {
      cancelledBy = 'vendor';
    }
    // Check if user has admin role
    else {
      const userRole = await db.query.userRoles.findFirst({
        where: eq(userRoles.userId, user.id),
      });
      
      if (userRole?.role === 'admin') {
        // Admin can cancel as either party, default to customer
        cancelledBy = 'customer';
      } else {
        return NextResponse.json(
          { success: false, error: "Unauthorized to cancel this rental" },
          { status: 403 }
        );
      }
    }

    // Cancel the rental with appropriate context
    const result = await cancelRental(rental, cancelledBy, reason);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error cancelling rental:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
