/// <reference lib="webworker" />
import { DoWorkUnit, runWorker } from 'observable-webworker';
import { Observable, from } from 'rxjs';

import { OrderedString } from '../models/ordered-string';
import {
  isAbsoluteImageURL,
  isImageURL,
  isRelativeImageURL,
} from '../utilities/regex';

export class ImageDownloadWorker
  implements DoWorkUnit<OrderedString, OrderedString>
{
  public workUnit(input: OrderedString): Observable<OrderedString> {
    return from(this.download(input));
  }

  async download(st: OrderedString): Promise<OrderedString> {
    const { s, index, url } = st;
    // if this string is an image
    if (isImageURL(s)) {
      // fetch it as a blob
      let imageURL: string = '';
      if (isRelativeImageURL(s)) {
        imageURL = `${url}${s.slice(1, -1)}`;
      } else if (isAbsoluteImageURL(s)) {
        imageURL = s.slice(1, -1);
      } else {
        return st;
      }
      let blob = await fetch(imageURL).then((r) => r.blob());
      let dataUrl: any = await new Promise((resolve) => {
        let reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
      if (dataUrl) {
        return { s: `"${dataUrl}"`, index, url };
      } else {
        return st;
      }
    } else {
      return st;
    }
  }
}

runWorker(ImageDownloadWorker);
