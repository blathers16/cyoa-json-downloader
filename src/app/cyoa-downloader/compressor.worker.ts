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
import { isDataURL, isDataURLIncludingAvif } from '../utilities/regex';
import { fixMime, isAnimatedWebp, isGif, isWebp } from '../utilities/dataURLs';
import { copyUint8Array, isGifAnimated, Uint8ToBase64 } from '../utilities/utils';

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
  async convert(st: CompressionString): Promise<CompressionString> {
    let { s, index, quality } = st;
    // if this string is a image dataURL,
    // try to id the file and fix the mime type
    // if needed
    if (isDataURLIncludingAvif(s)) {
      s = fixMime(s);
    }
    if (
      // if this string is an image
      isDataURL(s) &&
      // and isn't an animated webp
      (!isWebp(s.slice(1, -1)) || !isAnimatedWebp(s.slice(1, -1)))
    ) {
      try {
        // fetch it as a blob
        const blob = await (await fetch(s.slice(1, -1))).blob();

        // detect animated gifs; convert to animated webp
        // todo: update to use animated avif when
        // https://github.com/ImageMagick/ImageMagick/issues/6380
        // is fixed
        if (isGif(s) && (await isGifAnimated(s))) {
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
              const data2 = copyUint8Array(data);
              return data2;
            });
            return result;
          });
          const base64 = Uint8ToBase64(imageBytes);
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
}

runWorker(CompressorWorker);
