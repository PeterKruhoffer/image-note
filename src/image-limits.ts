export const MAX_IMAGES_PER_MESSAGE = 4;

// Base64 expands image bytes by roughly one third. Keeping the source payload
// below this budget leaves room in the Durable Object's 2 MB message row.
export const MAX_IMAGE_BYTES_PER_MESSAGE = 1_200_000;
export const MAX_IMAGE_DIMENSION = 2_400;
