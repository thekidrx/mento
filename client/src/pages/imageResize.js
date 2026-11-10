import { scaledSize } from './photosLogic';

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const unreadable = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Couldn't read ${file.name}`));
    };
    image.onload = () => {
      URL.revokeObjectURL(url);
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error(`Couldn't read ${file.name}`));
      } else {
        resolve(image);
      }
    };
    image.onerror = unreadable;
    image.src = url;
  });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // "data:image/jpeg;base64,AAAA" → "AAAA"
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error("Couldn't prepare the photo"));
    reader.readAsDataURL(blob);
  });
}

// Shrinks an image file to a JPEG no larger than maxSide on its long edge and
// resolves to its base64 data. Drawing through a canvas applies the camera's
// rotation and drops all embedded metadata, including location.
export async function resizeToJpeg(file, maxSide, quality) {
  const image = await loadImage(file);
  const { width, height } = scaledSize(image.naturalWidth, image.naturalHeight, maxSide);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  // JPEG has no transparency; without this, clear areas would turn black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error(`Couldn't read ${file.name}`);
  return blobToBase64(blob);
}
