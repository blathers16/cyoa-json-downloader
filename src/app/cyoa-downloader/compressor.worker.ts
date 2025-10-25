/// <reference lib="webworker" />
import encode, { init as initAvifEncode } from '@jsquash/avif/encode';

import {
  ImageMagick,
  MagickFormat,
  initializeImageMagick,
} from '../../../node_modules/@imagemagick/magick-wasm';

import { DoWorkUnit, runWorker } from 'observable-webworker';
import { Observable, from } from 'rxjs';
import { encode as b64encode } from 'base64-arraybuffer';
import { CompressionString } from '../models/compression-string';

export class CompressorWorker
  implements DoWorkUnit<CompressionString, CompressionString>
{
  public workUnit(input: CompressionString): Observable<CompressionString> {
    return from(this.convert(input));
  }
  async init() {
    if (!this.initialized) {
      await initAvifEncode(undefined, {
        locateFile: (path: string, prefix: string) =>
          './assets/wasm/avif_enc.wasm',
      });
      this.initialized = true;
    }
  }
  async encode(image: ImageData, options: Object): Promise<ArrayBuffer> {
    await this.init();
    return encode(image, options);
  }
  async initalizeMagick(): Promise<void> {
    if (this.magickInitialized) {
      return;
    }
    await initializeImageMagick(
      new URL(`${location.origin}/assets/wasm/magick.wasm`, import.meta.url)
    );
    this.magickInitialized = true;
  }
  magickInitialized = false;
  initialized = false;
  ffInitialized = false;
  MIME = RegExp('image/([a-z]+)');
  isDataURL = (s: string) =>
    s.match(
      '^(["\'`]data:image/(?:j?pe?n?g|webp|gif);base64,[a-zA-Z0-9+/]+={0,2}["\'`])$'
    ) && s[0] == s.slice(-1);
  isDataURLIncludingAvif = (s: string) =>
    s.match(
      '^(["\'`]data:image/(?:j?pe?n?g|webp|gif|avif);base64,[a-zA-Z0-9+/]+={0,2}["\'`])$'
    ) && s[0] == s.slice(-1);
  async convert(st: CompressionString): Promise<CompressionString> {
    let { s, index, quality } = st;
    // if this string is a image dataURL,
    // try to id the file and fix the mime type
    // if needed
    if (this.isDataURLIncludingAvif(s)) {
      s = this.fixMime(s);
    }
    if (
      // if this string is an image
      this.isDataURL(s) &&
      // and isn't an animated webp
      (!this.isWebp(s.slice(1, -1)) || !this.isAnimatedWebp(s.slice(1, -1)))
    ) {
      try {
        // fetch it as a blob
        const blob = await (await fetch(s.slice(1, -1))).blob();

        // detect animated gifs; convert to animated webp
        // todo: update to use animated avif when
        // https://github.com/ImageMagick/ImageMagick/issues/6380
        // is fixed
        if (this.isGif(s) && (await this.isGifAnimated(s))) {
          const byteArray = new Uint8Array(await blob.arrayBuffer());
          // there probably aren't a lot of animated gifs
          // so lets only initialize imagemagik if needed
          await this.initalizeMagick();
          // use readCollection to read in all frames of the gif
          const imageBytes = ImageMagick.readCollection(byteArray, (image) => {
            const result = image.write(MagickFormat.WebP, (data) => {
              // we have to copy the image to a new object because
              // the memory will be freed by the
              // web assembly code when it leaves this
              // scope
              const data2 = this.copyUint8Array(data);
              return data2;
            });
            return result;
          });
          const base64 = this.Uint8ToBase64(imageBytes);
          let rs: string = `"data:image/webp;base64,${base64}"`;
          if (rs.length > s.length) {
            rs = s;
          }
          return { s: rs, index: index, quality };
        }

        // convert to imageData for avif encoder
        const image = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');
        ctx!.drawImage(image, 0, 0, image.width, image.height);
        const imageData = ctx!.getImageData(0, 0, image.width, image.height);

        const avifBuffer = await this.encode(imageData!, { cqLevel: quality });
        const base64 = b64encode(avifBuffer);
        let rs: string = `"data:image/avif;base64,${base64}"`;
        if (rs.length > s.length) {
          rs = s;
        }
        return { s: rs, index: index, quality };
      } catch (e) {
        return { s: s, index: index, quality };
      }
    } else {
      // if it isn't a image we return the string
      // as is
      return { s: s, index: index, quality };
    }
  }

  decodeDataUrl(dataUrl: string) {
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
  }

  // Function to extract the declared MIME type
  getDeclaredMimeType(dataUrl: string) {
    const match = dataUrl.match(/^data:([a-z\/]+);/);
    return match ? match[1] : null;
  }

  getActualMimeType(dataUrl: string) {
    try {
      const bytes = this.decodeDataUrl(dataUrl);
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
      if (
        view.getUint32(0) === 0x52494646 &&
        view.getUint32(8) === 0x57454250
      ) {
        return 'image/webp';
      }
      // Check for AVIF (ftypavif)
      if (
        view.getUint32(4) === 0x66747970 &&
        view.getUint32(8) === 0x61766966
      ) {
        return 'image/avif';
      }

      return 'unknown';
    } catch (e) {
      console.error('Error processing data URL:', e);
      return 'error';
    }
  }

  // should detect and correct header on
  // misidentified webp and gif images
  fixMime(dataURL: string): string {
    // console.log('startfix ', dataURL);

    const qt = dataURL.slice(0, 1);
    dataURL = dataURL.slice(1, -1);
    // console.log('midfix ', dataURL);

    const declaredMime = this.getDeclaredMimeType(dataURL);
    const actualMime = this.getActualMimeType(dataURL);

    if (
      declaredMime &&
      declaredMime !== actualMime &&
      actualMime !== 'error' &&
      actualMime !== 'unknown'
    ) {
      // console.log(`mime fixed, "${declaredMime}" new mime, "${actualMime}" dataurl, "${dataURL}`);
      return `${qt}${dataURL.replace(declaredMime, actualMime)}${qt}`;
    } else {
      return `${qt}${dataURL}${qt}`;
    }

    // if (declaredMime === actualMime) {
    //   return `Header is consistent: ${declaredMime}.`;
    // }

    // return `Wrong header: Declared as ${declaredMime}, but is actually ${actualMime}.`;

    //   // const qt = dataURL.slice(0, 1);
    //   dataURL = dataURL.slice(1, -1);

    //   if (this.isWebp(dataURL)) {
    //     const parts = dataURL.split(';base64,');
    //     return `${qt}${['data:image/webp', parts[1]].join(';base64,')}${qt}`;
    //   } else if (this.isGif(dataURL.slice(1, -1))) {
    //     const parts = dataURL.split(';base64,');
    //     return `${qt}${['data:image/gif', parts[1]].join(';base64,')}${qt}`;
    //   } else {

    //   }
  }

  // identifyMismatchedHeader(dataUrl) {
  //   const declaredMime = getDeclaredMimeType(dataUrl);
  //   const actualMime = getActualMimeType(dataUrl);

  //   if (declaredMime === actualMime) {
  //     return `Header is consistent: ${declaredMime}.`;
  //   }

  //   return `Wrong header: Declared as ${declaredMime}, but is actually ${actualMime}.`;
  // }

  isWebp(dataUrl: string): boolean {
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
  }

  // detect base64 encoded ANIM chunk
  // which controls animation
  // should not occur in a non animated image
  // some misbehaved applications might insert it anyways
  // https://developers.google.com/speed/webp/docs/riff_container
  isAnimatedWebp(s: string): boolean {
    const base64Data = s.split(';base64,')[1];
    // console.log(base64Data.slice(40, 47));
    return base64Data.slice(40, 46) === 'QU5JTQ';
  }

  // should detect and correct header on
  // misidentified webp and gif images
  // fixMime(dataURL: string): string {
  //   const qt = dataURL.slice(0, 1);
  //   dataURL = dataURL.slice(1, -1);

  //   if (this.isWebp(dataURL)) {
  //     const parts = dataURL.split(';base64,');
  //     return `${qt}${['data:image/webp', parts[1]].join(';base64,')}${qt}`;
  //   } else if (this.isGif(dataURL.slice(1, -1))) {
  //     const parts = dataURL.split(';base64,');
  //     return `${qt}${['data:image/gif', parts[1]].join(';base64,')}${qt}`;
  //   } else {
  //     return `${qt}${dataURL}${qt}`;
  //   }
  // }
  //   isAnimatedWebP(dataUrl: string) {
  //   // 1. Extract and decode Base64 data
  //   const base64Data = dataUrl.split(',')[1];
  //   const binaryData = atob(base64Data);

  //   // 2. Convert string to a byte array for easier inspection
  //   const bytes = new Uint8Array(binaryData.length);
  //   for (let i = 0; i < binaryData.length; i++) {
  //     bytes[i] = binaryData.charCodeAt(i);
  //   }

  //   // 3. Verify RIFF and WEBP identifiers
  //   const riff = String.fromCharCode(...bytes.slice(0, 4));
  //   const webp = String.fromCharCode(...bytes.slice(8, 12));
  //   if (riff !== 'RIFF' || webp !== 'WEBP') {
  //     return false; // Not a valid WebP file
  //   }

  //   // 4. Look for the 'VP8X' chunk, followed by 'ANIM' and 'ANMF'
  //   const vp8xOffset = 12; // Start searching after the main header
  //   const vp8x = String.fromCharCode(...bytes.slice(vp8xOffset, vp8xOffset + 4));
  //   if (vp8x === 'VP8X') {
  //     // Check the flags in the VP8X header. The animation flag is at a specific bit.
  //     // The spec can be complex, but a simpler check is often sufficient.
  //     const hasAnimation = (bytes[vp8xOffset + 4] & 2) !== 0;
  //     if (hasAnimation) {
  //       // Find the 'ANIM' chunk
  //       const animOffset = binaryData.indexOf('ANIM', vp8xOffset);
  //       if (animOffset !== -1) {
  //         // Look for at least one 'ANMF' chunk, which indicates frames
  //         const anmfOffset = binaryData.indexOf('ANMF', animOffset);
  //         return anmfOffset !== -1;
  //       }
  //     }
  //   }

  //   return false; // No animation markers found
  // }

  isGif(dataUrl: string): boolean {
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
  }

  // somebody posted this in a github issue

  copyUint8Array(sourceArray: Uint8Array) {
    // Create a new Uint8Array with the same length as the source array
    const copiedArray = new Uint8Array(sourceArray.length);

    // Iterate through the source array and copy its elements to the new array
    for (let i = 0; i < sourceArray.length; i++) {
      copiedArray[i] = sourceArray[i];
    }
    // Return the new Uint8Array
    return copiedArray;
  }

  // code below is courtesy of stack overflow

  Uint8ToBase64(u8Arr: Uint8Array): string {
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
  }

  HEADER_LEN: number = 6; // offset bytes for the header section
  LOGICAL_SCREEN_DESC_LEN: number = 7; // offset bytes for logical screen description section

  async isGifAnimated(s: string): Promise<Boolean> {
    const blob = await (await fetch(s.slice(1, -1))).blob();
    const buffer = await blob.arrayBuffer();
    // Start from last 4 bytes of the Logical Screen Descriptor
    const dv = new DataView(
      buffer,
      this.HEADER_LEN + this.LOGICAL_SCREEN_DESC_LEN - 3
    );
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
  }
}

runWorker(CompressorWorker);
