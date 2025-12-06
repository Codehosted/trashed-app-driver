import { NextRequest, NextResponse } from "next/server"
import { getRentalByUuid } from "@/actions/rentals"
import { verifyRecaptchaToken } from "@/lib/utils/recaptcha"

export async function POST(request: NextRequest) {
  try {
    const { confirmationCode, rentalUuid, recaptchaToken } = await request.json()

    if (!confirmationCode || !rentalUuid) {
      return NextResponse.json(
        { success: false, error: "Confirmation code and rental UUID are required" },
        { status: 400 }
      )
    }

    // Verify reCAPTCHA token
    if (recaptchaToken) {
      const recaptchaVerification = await verifyRecaptchaToken(
        recaptchaToken,
        "rental_confirmation",
        request
      )

      if (!recaptchaVerification.success) {
        return NextResponse.json(
          { success: false, error: "reCAPTCHA verification failed" },
          { status: 400 }
        )
      }
    }

    // Get rental data
    const rentalData = await getRentalByUuid(rentalUuid)
    
    if (!rentalData) {
      return NextResponse.json(
        { success: false, error: "Rental not found" },
        { status: 404 }
      )
    }

    // Verify confirmation code (using UUID as confirmation for now)
    // In a real app, you'd have a separate confirmation code field
    const isValidConfirmation = rentalData.uuid === confirmationCode || 
                               rentalData.confirmationCode === confirmationCode

    if (!isValidConfirmation) {
      return NextResponse.json(
        { success: false, error: "Invalid confirmation code" },
        { status: 401 }
      )
    }

    // Set access cookie on server side
    const token = btoa(`${rentalUuid}:${confirmationCode}:${Date.now()}`)
    const response = NextResponse.json({ 
      success: true, 
      message: "Access granted",
      rental: {
        uuid: rentalData.uuid,
        status: rentalData.status,
        deliveryDate: rentalData.deliveryDate,
        pickupDate: rentalData.pickupDate,
        totalPrice: rentalData.totalPrice
      }
    })

    // Set the cookie in the response headers
    response.cookies.set('rental-access-token', token, {
      maxAge: 60 * 30, // 30 minutes
      httpOnly: false, // Allow client-side access
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    })

    return response

  } catch (error) {
    console.error("Error verifying confirmation code:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
