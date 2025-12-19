import { nanoid } from 'nanoid';

/**
 * Generate a short random slug using nanoid
 * Default length is 8 characters (62^8 = 218 trillion possibilities)
 */
export function generateSlug(length: number = 8): string {
  return nanoid(length);
}

/**
 * Convert a name to a URL-friendly slug
 * E.g., "My Cool Form!" -> "my-cool-form"
 */
export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .substring(0, 50); // Limit length
}

/**
 * Generate a slug from name with a random suffix to ensure uniqueness
 * E.g., "My Form" -> "my-form-x7k2m"
 */
export function generateUniqueSlug(name?: string, suffixLength: number = 5): string {
  if (name) {
    const baseSlug = nameToSlug(name);
    const suffix = nanoid(suffixLength);
    return `${baseSlug}-${suffix}`;
  }
  return generateSlug(8);
}

/**
 * Validate a slug format (alphanumeric with hyphens)
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}
