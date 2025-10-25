/// <reference lib="webworker" />
import { DoWorkUnit, runWorker } from 'observable-webworker';
import { Observable, from } from 'rxjs';

import { OrderedString } from '../models/ordered-string';

export class ImageDownloadWorker implements DoWorkUnit<OrderedString, OrderedString> {
  public workUnit(input: OrderedString): Observable<OrderedString> {
    return from(this.download(input));
  }
  isImageURL = (s: string) => 
    s.match (
      // '^(["\'`]images\/[A-Za-z0-9_\-]+\.(?:png|jpe?g|gif|bmp|webp|svg|avif)["\'`])$'
      /^(["'`]images\/[A-Za-z0-9_-]+\.(?:png|jpe?g|gif|bmp|webp|svg|avif)["'`]|["'`]https?:\/\/(?:www\.)?[^"'\s]+\.(?:png|jpe?g|gif|bmp|webp|svg)["'`])$/i
    ) && s[0] == s.slice(-1);
  isRelativeImageURL = (s: string) => 
    s.match (
      /^(["'`]images\/[A-Za-z0-9_-]+\.(?:png|jpe?g|gif|bmp|webp|svg|avif)["'`])$/i
    ) && s[0] == s.slice(-1);

  isAbsoluteImageURL = (s: string) => 
    s.match (
      /^(["'`]https?:\/\/(?:www\.)?[^"'\s]+\.(?:png|jpe?g|gif|bmp|webp|svg)["'`])$/i
    ) && s[0] == s.slice(-1);


    
  async download(st: OrderedString): Promise<OrderedString> {
   const { s, index, url } = st;
    // if this string is an image
    if (this.isImageURL(s)) {
      // fetch it as a blob
      let imageURL: string = '';
      if (this.isRelativeImageURL(s)){
        imageURL = `${url}${s.slice(1,-1)}`;
      } else if (this.isAbsoluteImageURL(s)) {
        imageURL = s.slice(1,-1);
      } else {
        return st;
      }
      let blob = await fetch(imageURL)
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
