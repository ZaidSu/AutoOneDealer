// Makes a phone photo small enough to store: a 1600 px picture and a 360 px thumbnail, both JPEG.
async function draw(file: File, max: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("no image"))), "image/jpeg", quality));
}
export async function shrink(file: File): Promise<{ photo: Blob; thumb: Blob }> {
  return { photo: await draw(file, 1600, 0.82), thumb: await draw(file, 360, 0.72) };
}
