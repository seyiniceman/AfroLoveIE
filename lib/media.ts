export function protectedPhoto<T extends { id: string }>(photo: T) {
  return { ...photo, url: `/api/media/${encodeURIComponent(photo.id)}` };
}

export function parseImageDataUrl(value: string) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;

  const mimeType = `image/${match[1]}`;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 2 * 1024 * 1024 || bytes.toString("base64") !== match[2]) return null;

  const isJpeg = mimeType === "image/jpeg" && bytes.length >= 3 &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = mimeType === "image/png" && bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = mimeType === "image/webp" && bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!isJpeg && !isPng && !isWebp) return null;

  return { mimeType, bytes };
}
