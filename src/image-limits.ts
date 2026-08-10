// Base64 expands image bytes by roughly one third. This keeps analysis request
// bodies comfortably below the Worker request limit after encoding.
export const MAX_IMAGE_BYTES = 1_200_000;
export const MAX_IMAGE_DIMENSION = 2_400;
