/// <reference lib="webworker" />
import { DoWorkUnit, runWorker } from 'observable-webworker';
import { Observable, from } from 'rxjs';
import { encode as b64encode } from 'base64-arraybuffer';

import { OrderedString } from '../models/ordered-string';

export class ImageDownloadWorker implements DoWorkUnit<OrderedString, OrderedString> {
  public workUnit(input: OrderedString): Observable<OrderedString> {
    return from(this.download(input));
  }
  isImageURL = (s: string) => 
    s.match (
      '^(["\'`]images\/[A-Za-z0-9_\-]+\.(?:png|jpe?g|gif|bmp|webp|svg|avif)["\'`])$'
    ) && s[0] == s.slice(-1);
  async download(st: OrderedString): Promise<OrderedString> {
   const { s, index, url } = st;
    // if this string is an image
    if (this.isImageURL(s)) {
      // fetch it as a blob
      let blob = await fetch(`${url}/${s.slice(1,-1)}`)
      .then(r => r.blob());
      let dataUrl: any = await new Promise(resolve => {
          let reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
      });
      if (dataUrl) {
        return {s: `"${dataUrl}"`, index, url}
      } else {
        return st;
      }
    }
    else {
      return st;
    }
  }
}

runWorker(ImageDownloadWorker);
