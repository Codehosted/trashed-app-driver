import { NextResponse } from "next/server";
import { completeRental } from "@/actions/rentals";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const { uuid: rentalUuid } = await params;

    if (!rentalUuid) {
      return NextResponse.json(
        { success: false, error: "Missing rental ID" },
        { status: 400 }
      );
    }

    const result = await completeRental(rentalUuid);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 } // Or 401, 404 etc. based on error
      );
    }

    return NextResponse.json({ success: true, rental: result.rental });
  } catch (error) {
    console.error("Error completing rental:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
