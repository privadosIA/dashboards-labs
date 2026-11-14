/** A picture the page holds as a data URL, and the file a form or a request needs; and the way back. */

const EXTENSION: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const head = comma < 0 ? '' : dataUrl.slice(5, comma); // after "data:"
  const type = head.split(';')[0] || 'application/octet-stream';
  const binary = head.includes(';base64') ? atob(dataUrl.slice(comma + 1)) : decodeURIComponent(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** A file name the server takes for a picture: the name it has when that ends in a picture extension, else one made from the type. */
export function pictureFileName(name: string, type: string): string {
  if (/\.(png|jpe?g|webp)$/i.test(name)) return name;
  return `${name.replace(/\.[^.]*$/, '') || 'image'}.${EXTENSION[type] ?? 'png'}`;
}
