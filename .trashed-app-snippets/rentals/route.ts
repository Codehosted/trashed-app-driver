import { NextRequest, NextResponse } from "next/server";
import { processSuccessfulPaymentIntent } from "@/actions/rentals";
import { createAndSendInvoice } from "@/actions/stripe";
import { slackService } from "@/service/slack";
import { isProcessPaymentIntentError } from "@/utils/rentals";
import { verifyAddress } from "@/actions/address";
import { z } from "zod";


// Validation schema for rental processing
const rentalSchema = z.object({
  location: z.string().min(1, "Location is required"),
  size: z.string().min(1, "Size is required"),
  type: z.string().min(1, "Type is required"),
  deliveryDate: z
    .string()
    .min(1, "Delivery date is required")
    .refine((date) => !isNaN(Date.parse(date)), "Invalid delivery date"),
  pickupDate: z
    .string()
    .optional()
    .refine(
      (date) => !date || !isNaN(Date.parse(date)),
      "Invalid pickup date"
    ),
  rentalDays: z
    .number()
    .int()
    .min(1, "Rental duration must be at least one day")
    .max(365, "Rental duration cannot exceed one year")
    .optional(),
  selectedRentalRateId: z.number().int().optional(),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(2, "State is required"),
  zip: z.string().min(5, "ZIP code must be at least 5 characters"),
  dumpsterUuid: z.string().uuid("Valid dumpster UUID is required"),
  customerPrice: z.number().optional(), // The price the customer should pay (with fees)
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();

    // Validate request body using Zod
    const validationResult = rentalSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: validationResult.error.format(),
        },
        { status: 400 }
      );
    }

    const {
      location,
      size,
      type,
      deliveryDate,
      pickupDate,
      rentalDays,
      selectedRentalRateId,
      name,
      email,
      phone,
      address,
      city,
      state,
      zip,
      dumpsterUuid,
      customerPrice,
    } = validationResult.data;

    const normalizedEmail = email.toLowerCase();

    // Construct the full address string and verify it
    const fullAddress = `${address}, ${city}, ${state} ${zip}`;
    const addressVerificationResult = await verifyAddress(fullAddress);

    // Process the rental
    const normalizedPhone = phone.replace(/\D/g, "");
    // convert to snake case
    const normalizedType = type
      .toLowerCase()
      .replace(/ /g, "_")
      .replace("-", "_");
    const rentalResult = await processSuccessfulPaymentIntent({
      location,
      size,
      type: normalizedType,
      deliveryDate,
      pickupDate,
      rentalDays,
      selectedRentalRateId,
      name,
      email: normalizedEmail,
      phone: normalizedPhone,
      addressVerificationResult,
      dumpsterUuid,
      customerPrice,
    });

    if (isProcessPaymentIntentError(rentalResult)) {
      return NextResponse.json(
        { success: false, error: rentalResult.error },
        { status: 400 }
      );
    }

    if (rentalResult.user && rentalResult.dumpster) {
      try {
        if (rentalResult.success) {
          // Create and send invoice
          const invoiceResult = await createAndSendInvoice({
            customerId: rentalResult.customer.stripeCustomerId,
            amount: rentalResult.orderDetails.totalPriceWithFees,
            description: `Dumpster Rental - ${rentalResult.orderDetails.dumpster.size}yd ${rentalResult.orderDetails.dumpster.type} - ${rentalResult.orderDetails.dumpster.vendorName}`,
            metadata: {
              dumpsterUuid: dumpsterUuid,
              customerEmail: normalizedEmail,
              customerName: name,
              deliveryDate: rentalResult.orderDetails.dates.delivery,
              pickupDate: rentalResult.orderDetails.dates.pickup,
            },
            daysUntilDue: 0,
          });

          if (invoiceResult.success) {
            // Send Slack notification about invoice being sent (non-blocking)
            try {
              await slackService.sendMessage(
                {
                  text: "📄 Invoice Sent!",
                  attachments: [
                    {
                      color: "good",
                      title: `Invoice for Rental`,
                      fields: [
                        {
                          title: "Stripe Invoice ID",
                          value: invoiceResult.invoice.id,
                          short: true,
                        },
                        {
                          title: "Customer",
                          value: `${name} (${normalizedEmail})`,
                          short: true,
                        },
                        {
                          title: "Dumpster",
                          value: `${rentalResult.orderDetails.dumpster.size}yd ${rentalResult.orderDetails.dumpster.type}`,
                          short: true,
                        },
                        {
                          title: "Vendor",
                          value: rentalResult.orderDetails.dumpster.vendorName,
                          short: true,
                        },
                        {
                          title: "Amount",
                          value: `$${rentalResult.orderDetails.totalPriceWithFees}`,
                          short: true,
                        },
                        {
                          title: "Delivery Date",
                          value: new Date(
                            rentalResult.orderDetails.dates.delivery
                          ).toLocaleDateString(),
                          short: true,
                        },
                        {
                          title: "Pickup Date",
                          value: new Date(
                            rentalResult.orderDetails.dates.pickup
                          ).toLocaleDateString(),
                          short: true,
                        },
                      ],
                      footer: "Trashed App Invoice System",
                      ts: Math.floor(Date.now() / 1000),
                    },
                  ],
                },
                "orders" // SlackService will determine the correct channel based on environment
              );
            } catch (slackError) {
              console.error("Failed to send Slack notification:", slackError);
              // Continue with the response - don't let Slack failures break the flow
            }

            return NextResponse.json({
              ...rentalResult,
              invoice: {
                id: invoiceResult.invoice.id,
                status: invoiceResult.invoice.status,
                url: invoiceResult.invoice.hosted_invoice_url,
              },
            });
          } else {
            // Rental was successful but invoice failed - still return success but note the invoice error
            console.error("Failed to create invoice:", invoiceResult.error);
            return NextResponse.json({
              ...rentalResult,
              warning:
                "Rental created successfully but invoice could not be sent",
              invoiceError: invoiceResult.error,
            });
          }
        } else {
          // Rental was successful but Stripe customer creation failed
          console.error("Failed to create Stripe customer");
          return NextResponse.json({
            ...rentalResult,
            warning:
              "Rental created successfully but invoice could not be sent due to Stripe customer error",
            invoiceError: "Failed to create Stripe customer",
          });
        }
      } catch (invoiceError) {
        console.error("Error processing invoice:", invoiceError);
        return NextResponse.json({
          ...rentalResult,
          warning: "Rental created successfully but invoice processing failed",
          invoiceError:
            invoiceError instanceof Error
              ? invoiceError.message
              : "Unknown invoice error",
        });
      }
    }

    // Return successful rental result (without invoice)
    return NextResponse.json(rentalResult);
  } catch (error) {
    console.error("Error processing rental request:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
