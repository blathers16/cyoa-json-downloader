export const getExtensionFromDataURL: Function = (dataUrl: string): string => {
  const mime = getDeclaredMimeType(dataUrl);
  return `.${mime!.split('/')[1]}`;
};

export const getDeclaredMimeType: Function = (dataUrl: string) => {
  if (!dataUrl.startsWith('data:')) {
    dataUrl = dataUrl.slice(1,-1)
  }
  const match = dataUrl.match(/^data:([a-z\/\-\+0-9\.]+);/);
  return match ? match[1] : null;
};

export const getActualMimeType: Function = (dataUrl: string) => {
  try {
    const bytes = decodeDataUrl(dataUrl);
    if (bytes.length < 12) {
      // Need at least 12 bytes to check all signatures
      return 'unknown';
    }

    const view = new DataView(bytes.buffer);

    // Check for JPEG (FF D8 FF)
    if (view.getUint16(0) === 0xffd8 && view.getUint8(2) === 0xff) {
      return 'image/jpeg';
    }
    // Check for PNG (89 50 4E 47)
    if (view.getUint32(0) === 0x89504e47) {
      return 'image/png';
    }
    // Check for GIF (47 49 46 38)
    if (view.getUint32(0) === 0x47494638) {
      return 'image/gif';
    }
    // Check for WebP (RIFF, WEBP)
    if (view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57454250) {
      return 'image/webp';
    }
    // Check for AVIF (ftypavif)
    if (isAvifMIME(bytes)) {
      return "image/avif";
    }

    return 'unknown';
  } catch (e) {
    console.error('Error processing data URL:', e);
    return 'error';
  }
};

// should detect and correct header on
// misidentified webp and gif images
export const fixMime: Function = (dataURL: string): string => {
  let qt;
  if (!dataURL.startsWith('data:')) {
    qt = dataURL.slice(0, 1);
    dataURL = dataURL.slice(1, -1);
  } else {
    qt = '';
  }

  const declaredMime = getDeclaredMimeType(dataURL);
  const actualMime = getActualMimeType(dataURL);
  console.log(actualMime)
  console.log(declaredMime)
  if (
    declaredMime &&
    declaredMime !== actualMime &&
    actualMime !== 'error' &&
    actualMime !== 'unknown'
  ) {
    return `${qt}${dataURL.replace(declaredMime, actualMime)}${qt}`;
  } else {
    return `${qt}${dataURL}${qt}`;
  }
};

function isAvifMIME(bytes: Uint8Array): boolean {
  if (bytes.length < 32) return false; // minimum for ftyp box safety

  const view = new DataView(bytes.buffer);

  // Check box type: bytes 4..7 must be "ftyp"
  const boxType =
    String.fromCharCode(
      view.getUint8(4),
      view.getUint8(5),
      view.getUint8(6),
      view.getUint8(7)
    );

  if (boxType !== "ftyp") return false;

  const decodeBrand = (offset: number) =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );

  const avifBrands = new Set(["avif", "avis", "avio", "mif1", "msf1"]);

  // major brand at bytes 8..11
  const majorBrand = decodeBrand(8);
  if (avifBrands.has(majorBrand)) return true;

  // minor version (bytes 12..15) — skip these
  // compatible brands start at byte 16
  for (let offset = 16; offset + 4 <= bytes.length; offset += 4) {
    const brand = decodeBrand(offset);
    if (avifBrands.has(brand)) return true;
  }

  return false;
}

export const isWebp: Function = (dataUrl: string): boolean => {
  // 1. Check if the URL starts with "data:".
  if (!dataUrl.startsWith('data:')) {
    return false;
  }

  // 2. Extract the Base64 encoded data part.
  const base64Data = dataUrl.split(';base64,')[1];
  if (!base64Data) {
    return false;
  }

  // 3. Decode the Base64 data into a binary buffer.
  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // 4. Check for the WebP file signature at the beginning of the binary data.
  // The signature is the ASCII characters "RIFF" followed by a 4-byte file size,
  // and then the ASCII characters "WEBP".
  const riff = String.fromCharCode(...bytes.subarray(0, 4));
  const webp = String.fromCharCode(...bytes.subarray(8, 12));

  return riff === 'RIFF' && webp === 'WEBP';
};

// detect base64 encoded ANIM chunk
// which controls animation
// should not occur in a non animated image
// some misbehaved applications might insert it anyways
// https://developers.google.com/speed/webp/docs/riff_container
export const isAnimatedWebp: Function = (s: string): boolean => {
  const base64Data = s.split(';base64,')[1];
  return base64Data.slice(40, 46) === 'QU5JTQ';
};

export const isGif: Function = (dataUrl: string): boolean => {
  if (!dataUrl.startsWith('data:')) {
    return false;
  }

  const base64Data = dataUrl.split(';base64,')[1];
  if (!base64Data) {
    return false;
  }

  // Decode the base64 data to a binary string
  const binaryString = atob(base64Data);

  // Extract the first 6 bytes for the GIF signature
  const signature = binaryString.substring(0, 6);

  // Check against GIF87a and GIF89a signatures
  return signature === 'GIF87a' || signature === 'GIF89a';
};

export const decodeDataUrl: Function = (dataUrl: string) => {
  if (!dataUrl.startsWith('data:')) {
    throw new Error('Invalid data URL.');
  }
  const parts = dataUrl.split(',');
  const encodedData = parts[1];

  const binaryString = atob(encodedData);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};
