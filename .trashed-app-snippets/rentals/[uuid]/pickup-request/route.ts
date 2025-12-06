import { NextResponse } from "next/server";
import { updateRentalStatus } from "@/actions/rentals";
import { getCurrentUser } from "@/actions/users";

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

    if (!rentalUuid) {
      return NextResponse.json(
        { success: false, error: "Missing rental ID" },
        { status: 400 }
      );
    }

    // Update the rental status to pickup_scheduled
    const result = await updateRentalStatus(rentalUuid, "pickup_scheduled");

    if (!result) {
      return NextResponse.json(
        { success: false, error: "Failed to schedule pickup" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error scheduling pickup:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
