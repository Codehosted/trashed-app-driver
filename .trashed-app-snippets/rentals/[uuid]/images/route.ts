import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { rentals as rentalTable, rentalImages, type RentalImage } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getServerAuth } from '@/lib/auth/utils';
import { imageSourceEnum } from '@/lib/db/schema';
import { v4 as uuidv4 } from 'uuid';
import { put, del } from '@vercel/blob';
import { verifyVendorRentalPermission } from '@/actions/vendor-rentals';

// GET handler to retrieve all images for a rental
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const { uuid: rentalUuid } = await params;
    
    // Get rental to verify it exists
    const rental = await db.query.rentals.findFirst({
      where: eq(rentalTable.uuid, rentalUuid),
      columns: {
        id: true
      }
    });
    
    if (!rental) {
      return NextResponse.json(
        { error: 'Rental not found' },
        { status: 404 }
      );
    }
    
    // Get all images for the rental
    const images = await db.query.rentalImages.findMany({
      where: eq(rentalImages.rentalId, rental.id)
    });
    
    return NextResponse.json(images);
  } catch (error) {
    console.error('Error fetching rental images:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST handler to upload new images
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const { uuid: rentalUuid } = await params;
    
    // Verify user is authenticated
    const session = await getServerAuth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Verify vendor has permission to upload images for this rental
    const permissionCheck = await verifyVendorRentalPermission(
      rentalUuid,
      Number(session.user.id)
    );
    
    if (!permissionCheck.success) {
      return NextResponse.json(
        { error: permissionCheck.error || 'Unauthorized vendor access' },
        { status: 403 }
      );
    }
    
    // Get rental to verify it exists and get vendor info
    const dbRental = await db.query.rentals.findFirst({
      where: eq(rentalTable.uuid, rentalUuid),
      columns: {
        id: true,
        uuid: true
      },
      with: {
        dumpster: {
          with: {
            vendor: {
              columns: {
                uuid: true
              }
            }
          }
        }
      }
    });
    
    if (!dbRental) {
      return NextResponse.json(
        { error: 'Rental not found' },
        { status: 404 }
      );
    }
    
    const vendorUuid = dbRental.dumpster?.vendor?.uuid;
    
    if (!vendorUuid) {
      return NextResponse.json(
        { error: 'Vendor not found for rental' },
        { status: 400 }
      );
    }
    
    // Check if request is multipart form data
    const formData = await req.formData();
    const files = formData.getAll('images') as File[];
    const category = formData.get('category') as string | null;
    const description = formData.get('description') as string | null;
    
    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No images provided' },
        { status: 400 }
      );
    }
    
    // Get environment and vendor UUID for blob path
    const environment = process.env.VERCEL_ENV || 'development';
    
    // Process and save each file to Vercel Blob
    const savedImages = [];
    
    for (const file of files) {
      // Generate a unique filename
      const fileExt = file.name.split('.').pop();
      const uniqueId = uuidv4();
      const fileName = `${rentalUuid}-${uniqueId}.${fileExt}`;
      
      // Construct blob path: environment/vendorUuid/rentals/filename
      const blobPath = `${environment}/${vendorUuid}/rentals/${fileName}`;
      
      // Convert file to buffer and upload to Vercel Blob
      const buffer = Buffer.from(await file.arrayBuffer());
      const blob = await put(blobPath, buffer, {
        access: 'public',
        contentType: file.type,
      });
      
      // Create database record with blob URL
      const newImage = {
        uuid: uniqueId,
        rentalId: dbRental.id,
        path: blob.url, // Store the blob URL
        source: imageSourceEnum.enumValues[3], // 'user_uploaded'
        category: category || null,
        description: description || null,
      };
      
      const [savedImage] = await db.insert(rentalImages).values(newImage).returning();
      savedImages.push(savedImage);
    }
    
    return NextResponse.json({
      message: `${savedImages.length} images uploaded successfully`,
      images: savedImages
    });
  } catch (error) {
    console.error('Error uploading rental images:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE handler to delete an image
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const { uuid: rentalUuid } = await params;
    const { searchParams } = new URL(req.url);
    const imageUuid = searchParams.get('imageUuid');
    
    if (!imageUuid) {
      return NextResponse.json(
        { error: 'Image UUID is required' },
        { status: 400 }
      );
    }
    
    // Verify user is authenticated
    const session = await getServerAuth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Verify vendor has permission to delete images for this rental
    const permissionCheck = await verifyVendorRentalPermission(
      rentalUuid,
      Number(session.user.id)
    );
    
    if (!permissionCheck.success) {
      return NextResponse.json(
        { error: permissionCheck.error || 'Unauthorized vendor access' },
        { status: 403 }
      );
    }
    
    // Get the image to delete (need the blob URL)
    const imageToDelete = await db.query.rentalImages.findFirst({
      where: eq(rentalImages.uuid, imageUuid)
    });
    
    if (!imageToDelete) {
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      );
    }
    
    // Verify the image belongs to the rental
    const rental = await db.query.rentals.findFirst({
      where: eq(rentalTable.uuid, rentalUuid),
      columns: {
        id: true
      }
    });
    
    if (!rental || imageToDelete.rentalId !== rental.id) {
      return NextResponse.json(
        { error: 'Image does not belong to this rental' },
        { status: 403 }
      );
    }
    
    // Delete from Vercel Blob Storage
    try {
      await del(imageToDelete.path);
    } catch (error) {
      console.error('Error deleting from Vercel Blob:', error);
      // Continue with database deletion even if blob deletion fails
    }
    
    // Delete the image from database
    const deletedImage = await db.delete(rentalImages)
      .where(eq(rentalImages.uuid, imageUuid))
      .returning();
    
    if (deletedImage.length === 0) {
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      message: 'Image deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting rental image:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH handler to update image metadata
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  try {
    const { uuid: rentalUuid } = await params;
    const json = await req.json();
    const { imageUuid, category, description } = json;
    
    if (!imageUuid) {
      return NextResponse.json(
        { error: 'Image UUID is required' },
        { status: 400 }
      );
    }
    
    // Verify user is authenticated
    const session = await getServerAuth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Verify vendor has permission to update images for this rental
    const permissionCheck = await verifyVendorRentalPermission(
      rentalUuid,
      Number(session.user.id)
    );
    
    if (!permissionCheck.success) {
      return NextResponse.json(
        { error: permissionCheck.error || 'Unauthorized vendor access' },
        { status: 403 }
      );
    }
    
    // Build update object
    const updateData: Partial<RentalImage> = {};
    if (category !== undefined) {
      updateData.category = category;
    }
    if (description !== undefined) {
      updateData.description = description;
    }
    
    // Update the image
    const updatedImage = await db.update(rentalImages)
      .set(updateData)
      .where(eq(rentalImages.uuid, imageUuid))
      .returning();
    
    if (updatedImage.length === 0) {
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      message: 'Image updated successfully',
      image: updatedImage[0]
    });
  } catch (error) {
    console.error('Error updating rental image:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

