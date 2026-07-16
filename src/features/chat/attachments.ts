import { MAX_IMAGE_DIMENSION } from "../../image-limits";

export const IMAGE_INPUT_ACCEPT = "image/png,image/jpeg,image/webp";

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

export function isSupportedImage(file: File) {
  return SUPPORTED_IMAGE_TYPES.has(file.type);
}

export interface Attachment {
  id: string;
  file: File;
  preview: string;
}

export function createAttachment(file: File): Attachment {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    preview: URL.createObjectURL(file)
  };
}

export interface PreparedImage {
  mediaType: string;
  url: string;
}

export function fileToDataUri(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The image could not be compressed."));
      },
      "image/webp",
      quality
    );
  });
}

export async function prepareImage(
  file: File,
  maxBytes: number
): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const initialScale = Math.min(
      1,
      MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height)
    );
    let width = Math.max(1, Math.round(bitmap.width * initialScale));
    let height = Math.max(1, Math.round(bitmap.height * initialScale));

    if (
      initialScale === 1 &&
      file.size <= maxBytes &&
      SUPPORTED_IMAGE_TYPES.has(file.type)
    ) {
      return { mediaType: file.type, url: await fileToDataUri(file) };
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable.");

    const qualities = [0.9, 0.78, 0.66, 0.54];
    for (let resize = 0; resize < 4; resize += 1) {
      canvas.width = width;
      canvas.height = height;
      context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of qualities) {
        const blob = await canvasToBlob(canvas, quality);
        if (blob.size <= maxBytes) {
          return { mediaType: blob.type, url: await fileToDataUri(blob) };
        }
      }

      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
    }

    throw new Error("The image is too large to attach.");
  } finally {
    bitmap.close();
  }
}
