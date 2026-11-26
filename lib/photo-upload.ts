const photoTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const maxOriginalBytes = 30 * 1024 * 1024;
const targetBytes = 900 * 1024;

export async function preparePhoto(file: File) {
  if (!photoTypes.has(file.type) && (file.type || !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name))) {
    throw new Error("Choose a JPEG, PNG, WebP, or supported HEIC photo.");
  }
  if (file.size > maxOriginalBytes) throw new Error("Choose a photo under 30 MB, or export a smaller copy from your phone.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      throw new Error("This browser couldn’t open the photo. For HEIC images, export a JPEG copy and try again.");
    }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context || !image.naturalWidth || !image.naturalHeight) throw new Error("This photo couldn’t be resized.");
    const longest = Math.max(image.naturalWidth, image.naturalHeight);
    for (const [size, quality] of [[1600, .85], [1200, .8], [900, .76], [700, .7]]) {
      const ratio = Math.min(1, size / longest);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob || blob.type !== "image/jpeg" || blob.size > targetBytes) continue;
      const encoded = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the resized photo."));
        reader.onerror = () => reject(new Error("Could not read the resized photo."));
        reader.readAsDataURL(blob);
      });
      return { url: encoded, size: blob.size };
    }
    throw new Error("This photo couldn’t be resized enough. Try a smaller JPEG.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
