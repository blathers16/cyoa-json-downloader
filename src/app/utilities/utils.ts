import { downloadZip } from 'client-zip';

const HEADER_LEN: number = 6; // offset bytes for the header section
const LOGICAL_SCREEN_DESC_LEN: number = 7; // offset bytes for logical screen description section

// formatter for file sizes
export const formatSize: Function = (n: string): string => {
  const bytes: number = parseInt(n);
  //if over a MegaByte (binary)
  if (bytes >= 1048576) {
    const mBytes: number = bytes / 1048576;
    return `${(Math.round(mBytes * 100) / 100).toLocaleString()} MiB`;
    // else if over a KiloByte (binary)
  } else if (bytes > 1024) {
    const kBytes: number = bytes / 1024;
    return `${Math.round(kBytes).toLocaleString()} KiB`;
  } else {
    return `${bytes.toLocaleString()} Bytes`;
  }
};

export const makeZipFile: Function = async (
  saveTitle: string,
  cyoaURL: URL,
  cyoaFiles: File[]
): Promise<File> => {
  const zipBlob = await downloadZip(cyoaFiles).blob();
  let savename: string = 'cyoa';
  const pathSegments = cyoaURL?.pathname
    .split('/')
    .filter((x: string) => x !== '');
  if (saveTitle !== '') {
    // save title manually entered or parsed from first Row
    savename = saveTitle;
  } else if (!!pathSegments && pathSegments.length > 0) {
    // save title from last path segment
    savename = pathSegments.at(-1)!;
  } else if (cyoaURL?.hostname?.split('.')[0]) {
    // save title from sub-domain
    savename = cyoaURL?.hostname?.split('.')[0];
  }

  const outfile = new File([zipBlob], `${savename}.zip`, {
    type: 'application/zip',
  });
  return outfile;
};

// somebody posted this in a github issue
export const copyUint8Array: Function = (sourceArray: Uint8Array) => {
  // Create a new Uint8Array with the same length as the source array
  const copiedArray = new Uint8Array(sourceArray.length);

  // Iterate through the source array and copy its elements to the new array
  for (let i = 0; i < sourceArray.length; i++) {
    copiedArray[i] = sourceArray[i];
  }
  // Return the new Uint8Array
  return copiedArray;
};

// code below is courtesy of stack overflow
export const Uint8ToBase64: Function = (u8Arr: Uint8Array): string => {
  var CHUNK_SIZE = 0x8000; //arbitrary number
  var index = 0;
  var length = u8Arr.length;
  var result = '';
  var slice;
  while (index < length) {
    slice = u8Arr.subarray(index, Math.min(index + CHUNK_SIZE, length));
    result += String.fromCharCode.apply(null, slice as unknown as number[]);
    index += CHUNK_SIZE;
  }
  return btoa(result);
};

export const isGifAnimated: Function = async (s: string): Promise<Boolean> => {
  const blob = await (await fetch(s.slice(1, -1))).blob();
  const buffer = await blob.arrayBuffer();
  // Start from last 4 bytes of the Logical Screen Descriptor
  const dv = new DataView(buffer, HEADER_LEN + LOGICAL_SCREEN_DESC_LEN - 3);
  const globalColorTable = dv.getUint8(0); // aka packet byte
  let globalColorTableSize = 0;
  let offset = 0;

  // check first bit, if 0, then we don't have a Global Color Table
  if (globalColorTable & 0x80) {
    // grab the last 3 bits, to calculate the global color table size -> RGB * 2^(N+1)
    // N is the value in the last 3 bits.
    globalColorTableSize = 3 * Math.pow(2, (globalColorTable & 0x7) + 1);
  }

  // move on to the Graphics Control Extension
  offset = 3 + globalColorTableSize;

  var extensionIntroducer = dv.getUint8(offset);
  var graphicsConrolLabel = dv.getUint8(offset + 1);
  var delayTime = 0;

  // Graphics Control Extension section is where GIF animation data is stored
  // First 2 bytes must be 0x21 and 0xF9
  if (extensionIntroducer & 0x21 && graphicsConrolLabel & 0xf9) {
    // skip to the 2 bytes with the delay time
    delayTime = dv.getUint16(offset + 4);
  }

  return Boolean(delayTime);
};
