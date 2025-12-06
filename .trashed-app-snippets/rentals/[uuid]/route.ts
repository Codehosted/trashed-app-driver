import { NextRequest, NextResponse } from "next/server";
import {
  rentals,
  customers,
  dumpsters,
  users,
  vendors,
} from "@/lib/db/schema";
import { getServerAuth, isAdmin, isVendor } from "@/lib/auth/utils";
import { captureRentalPayment, cancelRentalDirect } from "@/actions/rentals";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";

// GET a single rental by UUID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const { uuid: rentalId } = await params;
  try {
    const session = await getServerAuth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Query rental with joined data - accessing user through customer
    const rentalData = await db
      .select({
        rental: rentals,
        customer: customers,
        customerUser: users,
        dumpster: dumpsters,
      })
      .from(rentals)
      .leftJoin(customers, eq(rentals.customerId, customers.id))
      .leftJoin(users, eq(customers.userId, users.id))
      .innerJoin(dumpsters, eq(rentals.dumpsterId, dumpsters.id))
      .where(eq(rentals.uuid, rentalId))
      .limit(1);

    if (!rentalData || rentalData.length === 0) {
      return NextResponse.json({ error: "Rental not found" }, { status: 404 });
    }

    const rental = rentalData[0];

    // Authorization check
    const userIsAdmin = isAdmin(session);
    const userIsVendor = isVendor(session);
    const vendorOwnsDumpster =
      userIsVendor && session.user.vendor.id === rental.dumpster.vendorId;

    if (!userIsAdmin && !vendorOwnsDumpster) {
      return NextResponse.json(
        { error: "You don't have permission to view this rental" },
        { status: 403 }
      );
    }

    // Format response
    const formattedRental = {
      id: rental.rental.id,
      uuid: rental.rental.uuid,
      customerId: rental.customer?.id,
      customerName: rental.customerUser?.name || "Unknown Customer", // Corrected: use customerUser
      customerEmail: rental.customerUser?.email || "No email provided", // Corrected: use customerUser
      customerPhone: rental.customerUser?.phone || undefined,
      dumpsterUuid: rental.dumpster.uuid,
      dumpsterDescription: rental.dumpster.description,
      status: rental.rental.status,
      deliveryDate: rental.rental.deliveryDate,
      pickupDate: rental.rental.pickupDate,
      totalPrice: rental.rental.totalPrice,
      notes: rental.rental.notes,
      messageHistory: rental.rental.messageHistory || [],
    };

    return NextResponse.json(formattedRental);
  } catch (error) {
    console.error("Error fetching rental details:", error);
    return NextResponse.json(
      { error: "Failed to fetch rental details" },
      { status: 500 }
    );
  }
}

// PATCH - Update a rental
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const { uuid: rentalId } = await params;
  try {
    const body = await request.json();

    if (body.action === "capture_rental_payment") {
      const confirmResult = await captureRentalPayment(rentalId);
      if (confirmResult.success) {
        return NextResponse.json({
          success: true,
          message: confirmResult.message || "",
          rental: confirmResult.rental,
        });
      } else {
        if (confirmResult.error === "Rental not found.") {
          return NextResponse.json(
            { success: false, error: "Rental not found." },
            { status: 404 }
          );
        }
        return NextResponse.json(
          { success: false, error: confirmResult.error },
          { status: 400 }
        );
      }
    }

    if (body.action === "cancel") {
      const session = await getServerAuth();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Determine if this is a customer or vendor cancellation
      const userId = session.user.id;
      const vendorId = session.user.vendor?.id;

      const cancelResult = await cancelRentalDirect(rentalId, Number(userId), vendorId);
      
      if (cancelResult.success) {
        return NextResponse.json({
          success: true,
          message: cancelResult.message || "Rental cancelled successfully",
          rental: cancelResult.rental,
        });
      } else {
        return NextResponse.json(
          { success: false, error: cancelResult.error },
          { status: 400 }
        );
      }
    }

    if (body.action === "request_pickup") {
      const session = await getServerAuth();
      if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Get rental details for email notifications
      const rentalData = await db
        .select({
          rental: rentals,
          customer: customers,
          customerUser: users,
          dumpster: dumpsters,
          vendor: vendors,
        })
        .from(rentals)
        .leftJoin(customers, eq(rentals.customerId, customers.id))
        .leftJoin(users, eq(customers.userId, users.id))
        .innerJoin(dumpsters, eq(rentals.dumpsterId, dumpsters.id))
        .innerJoin(vendors, eq(dumpsters.vendorId, vendors.id))
        .where(eq(rentals.uuid, rentalId))
        .limit(1);

      // Get vendor user details separately
      const vendorUserData = await db
        .select()
        .from(users)
        .where(eq(users.id, rentalData[0].vendor.userId))
        .limit(1);

      if (!rentalData || rentalData.length === 0) {
        return NextResponse.json({ error: "Rental not found" }, { status: 404 });
      }

      const rental = rentalData[0];

      // Check if user is authorized to request pickup (customer or admin)
      const userIsAdmin = isAdmin(session);
      const userIsCustomer = rental.customerUser && rental.customerUser.id === Number(session.user.id);
      
      if (!userIsAdmin && !userIsCustomer) {
        return NextResponse.json({ error: "Unauthorized to request pickup" }, { status: 403 });
      }

      // Check if rental is in a state where pickup can be requested
      if (!["confirmed", "in_transit", "delivered"].includes(rental.rental.status)) {
        return NextResponse.json({ 
          error: "Pickup cannot be requested for this rental status" 
        }, { status: 400 });
      }

      try {
        // Import email service
        const { getEmailService } = await import("@/lib/email/service");
        const emailService = getEmailService();

        // Send email to vendor about early pickup request
        await emailService.sendEmail({
          to: vendorUserData[0]?.email || "support@trashed.app",
          subject: `Early Pickup Request - ${rental.rental.confirmationCode}`,
          html: `
            <h2>Early Pickup Request</h2>
            <p>A customer has requested early pickup for their rental.</p>
            
            <div style="background-color: #f8f9fa; padding: 16px; border-radius: 4px; margin: 16px 0;">
              <h3>Rental Details</h3>
              <p><strong>Confirmation Code:</strong> ${rental.rental.confirmationCode}</p>
              <p><strong>Customer:</strong> ${rental.customerUser?.name} (${rental.customerUser?.email})</p>
              <p><strong>Dumpster:</strong> ${rental.dumpster.description} (${rental.dumpster.size} yard)</p>
              <p><strong>Current Status:</strong> ${rental.rental.status}</p>
              <p><strong>Original Pickup Date:</strong> ${new Date(rental.rental.pickupDate).toLocaleDateString()}</p>
            </div>
            
            <p>Please contact the customer to schedule the early pickup.</p>
            <p>You can view the rental details in your vendor dashboard.</p>
          `,
          text: `
Early Pickup Request

A customer has requested early pickup for their rental.

Rental Details:
- Confirmation Code: ${rental.rental.confirmationCode}
- Customer: ${rental.customerUser?.name} (${rental.customerUser?.email})
- Dumpster: ${rental.dumpster.description} (${rental.dumpster.size} yard)
- Current Status: ${rental.rental.status}
- Original Pickup Date: ${new Date(rental.rental.pickupDate).toLocaleDateString()}

Please contact the customer to schedule the early pickup.
You can view the rental details in your vendor dashboard.
          `
        });

        // Send confirmation email to customer
        await emailService.sendEmail({
          to: rental.customerUser?.email || "",
          subject: `Early Pickup Request Submitted - ${rental.rental.confirmationCode}`,
          html: `
            <h2>Early Pickup Request Submitted</h2>
            <p>Your early pickup request has been submitted successfully.</p>
            
            <div style="background-color: #f8f9fa; padding: 16px; border-radius: 4px; margin: 16px 0;">
              <h3>Rental Details</h3>
              <p><strong>Confirmation Code:</strong> ${rental.rental.confirmationCode}</p>
              <p><strong>Dumpster:</strong> ${rental.dumpster.description} (${rental.dumpster.size} yard)</p>
              <p><strong>Original Pickup Date:</strong> ${new Date(rental.rental.pickupDate).toLocaleDateString()}</p>
            </div>
            
            <p>The vendor will contact you soon to schedule your early pickup.</p>
            <p>If you have any questions, please contact our support team.</p>
          `,
          text: `
Early Pickup Request Submitted

Your early pickup request has been submitted successfully.

Rental Details:
- Confirmation Code: ${rental.rental.confirmationCode}
- Dumpster: ${rental.dumpster.description} (${rental.dumpster.size} yard)
- Original Pickup Date: ${new Date(rental.rental.pickupDate).toLocaleDateString()}

The vendor will contact you soon to schedule your early pickup.
If you have any questions, please contact our support team.
          `
        });

        return NextResponse.json({
          success: true,
          message: "Early pickup request submitted successfully",
        });

      } catch (emailError) {
        console.error("Error sending pickup request emails:", emailError);
        // Still return success since the request was processed
        return NextResponse.json({
          success: true,
          message: "Early pickup request submitted (email notification failed)",
        });
      }
    }

    return NextResponse.json(
      { success: false, error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error updating rental:", error);
    return NextResponse.json(
      { error: "Failed to update rental" },
      { status: 400 }
    );
  }
}
