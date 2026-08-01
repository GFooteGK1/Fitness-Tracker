/**
 * Image compression utilities for OCR processing
 * Based on the working Google Apps Script implementation
 */

export interface ImageCompressionResult {
  compressedDataUrl: string;
  originalSizeMB: number;
  compressedSizeMB: number;
  compressionRatio: number;
  finalQuality: number;
}

const OUTPUT_MIME_TYPE = 'image/jpeg';
const HEIC_TYPES = new Set(['image/heic', 'image/heif']);

/**
 * Compress an image to under 4.5MB using canvas with dynamic quality adjustment
 * @param file - The image file to compress
 * @param maxSizeMB - Maximum size in MB (default: 4.5)
 * @param maxDimension - Maximum width/height in pixels (default: 1920)
 * @returns Promise with compression result
 */
export async function compressImage(
  file: File,
  maxSizeMB: number = 4.5,
  maxDimension: number = 1920
): Promise<ImageCompressionResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        try {
          const result = compressImageFromElement(img, OUTPUT_MIME_TYPE, maxSizeMB, maxDimension);
          const originalSizeMB = file.size / (1024 * 1024);
          
          resolve({
            ...result,
            originalSizeMB,
            compressionRatio: originalSizeMB / result.compressedSizeMB
          });
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => reject(new Error(
        HEIC_TYPES.has(file.type.toLowerCase())
          ? 'This device could not convert the HEIC photo. Retake it with the camera or choose a JPEG/PNG image.'
          : 'This image could not be opened. Choose a JPEG, PNG, or WebP image.'
      ));
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Compress an image element using canvas with dynamic quality adjustment
 * @param img - The image element
 * @param mimeType - The MIME type for output
 * @param maxSizeMB - Maximum size in MB
 * @param maxDimension - Maximum width/height in pixels
 * @returns Compression result
 */
function compressImageFromElement(
  img: HTMLImageElement,
  mimeType: string,
  maxSizeMB: number,
  maxDimension: number
): Omit<ImageCompressionResult, 'originalSizeMB' | 'compressionRatio'> {
  const canvas = document.createElement('canvas');
  let width = img.width;
  let height = img.height;
  
  // Resize to max dimension while maintaining aspect ratio
  if (width > height && width > maxDimension) {
    height = (height / width) * maxDimension;
    width = maxDimension;
  } else if (height > maxDimension) {
    width = (width / height) * maxDimension;
    height = maxDimension;
  }
  
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }
  
  // Draw the resized image
  ctx.drawImage(img, 0, 0, width, height);
  
  // Dynamic quality adjustment from 0.85 to 0.3
  let quality = 0.85;
  let compressed = canvas.toDataURL(mimeType || 'image/jpeg', quality);
  let estimatedSizeMB = estimateBase64SizeMB(compressed);
  
  // Iteratively reduce quality until under target size
  while (estimatedSizeMB > maxSizeMB && quality > 0.3) {
    quality -= 0.1;
    compressed = canvas.toDataURL(mimeType || 'image/jpeg', quality);
    estimatedSizeMB = estimateBase64SizeMB(compressed);
  }
  
  return {
    compressedDataUrl: compressed,
    compressedSizeMB: estimatedSizeMB,
    finalQuality: quality
  };
}

/**
 * Estimate the size of a base64 encoded image in MB
 * @param base64String - The base64 data URL
 * @returns Estimated size in MB
 */
function estimateBase64SizeMB(base64String: string): number {
  // Base64 encoding adds ~33% overhead, so actual size is ~75% of string length
  return (base64String.length * 0.75) / (1024 * 1024);
}

/**
 * Validate if a file is a supported image format
 * @param file - The file to validate
 * @returns True if supported format
 */
export function isSupportedImageFormat(file: File): boolean {
  const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
  return supportedTypes.includes(file.type.toLowerCase());
}

/** Normalizes a camera/gallery image to a bounded JPEG before upload. */
export async function prepareImageUpload(file: File, maxSizeMB = 4.5): Promise<File> {
  if (!isSupportedImageFormat(file)) {
    throw new Error('Unsupported image type. Choose a JPEG, PNG, WebP, or HEIC photo.');
  }

  const { compressedDataUrl } = await compressImage(file, maxSizeMB);
  const separator = compressedDataUrl.indexOf(',');
  if (separator < 0) throw new Error('Image conversion failed. Please choose another photo.');

  const binary = atob(compressedDataUrl.slice(separator + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([bytes], `${baseName}.jpg`, { type: OUTPUT_MIME_TYPE });
}

/**
 * Get file size in a human-readable format
 * @param bytes - Size in bytes
 * @returns Formatted size string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}