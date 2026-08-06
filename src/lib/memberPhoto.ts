/** Builds a `data:` URI from a stored TeamMember.photo/photoMimeType pair, or null if no photo was uploaded. */
export function memberPhotoDataUri(photo: Uint8Array | Buffer | null | undefined, mimeType: string | null | undefined): string | null {
  if (!photo || !mimeType) return null;
  return `data:${mimeType};base64,${Buffer.from(photo).toString("base64")}`;
}
