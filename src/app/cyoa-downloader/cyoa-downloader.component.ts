import { Component, OnInit } from '@angular/core';
import { fromWorkerPool } from 'observable-webworker';
import {
  NgbAccordionBody,
  NgbAccordionButton,
  NgbAccordionCollapse,
  NgbAccordionDirective,
  NgbAccordionHeader,
  NgbAccordionItem,
  NgbProgressbar,
  NgbTooltip,
} from '@ng-bootstrap/ng-bootstrap';
import {
  EMPTY,
  Observable,
  catchError,
  concatMap,
  filter,
  from,
  lastValueFrom,
  map,
  mergeAll,
  mergeMap,
  reduce,
  tap,
  toArray,
} from 'rxjs';

import { DownloadData } from '../models/download-data';
import { OrderedString } from '../models/ordered-string';
import { FormsModule } from '@angular/forms';
import { downloadZip } from 'client-zip';
import { CompressionString } from '../models/compression-string';
import { Project } from '../models/CYOA/project';

@Component({
  selector: 'app-cyoa-downloader',
  imports: [
    NgbAccordionDirective,
    NgbAccordionItem,
    NgbAccordionHeader,
    NgbAccordionButton,
    NgbAccordionCollapse,
    NgbAccordionBody,
    NgbProgressbar,
    NgbTooltip,
    FormsModule,
  ],
  templateUrl: './cyoa-downloader.component.html',
  styleUrl: './cyoa-downloader.component.scss',
})
export class CyoaDownloaderComponent implements OnInit {
  // quality setting
  // passed as cq setting to libavif
  quality: number = 27;
  // progressbar current
  progress: number = 0;
  // progressbar max
  progressMax: number = 100;
  // AVIFprogressbar current
  AVIFprogress: number = 0;
  // AVIFprogressbar max
  AVIFprogressMax: number = 100;

  // show progressbar
  inProgress: boolean = false;
  // display elapsed time
  elapsedTime: string = '';

  cyoaURLString: string = '';

  saveTitle: string = '';

  cyoaURL: URL | null = null;

  cyoaFiles: File[] = [];
  cyoaFileNames: string[] = [];

  doCompression: boolean = true;

  shouldSaveSeperateFiles: boolean = true;

  setSaveSeperateFiles(shouldSaveSeperateFiles: boolean): void{
    localStorage.setItem('saveSeperateFiles', shouldSaveSeperateFiles.toString())
  }

  setDoCompression(doCompression: boolean): void{
    console.log(doCompression);
    localStorage.setItem('compress', doCompression.toString())
  }

  ngOnInit(): void {
    // Load a simple string
    if (!localStorage.getItem('compress')) {
      localStorage.setItem('compress', 'true');
    }
    if (!localStorage.getItem('saveSeperateFiles')) {
      localStorage.setItem('saveSeperateFiles', 'true');
    }
    this.doCompression =
      localStorage.getItem('compress') == 'true' ? true : false;
    this.shouldSaveSeperateFiles =
      localStorage.getItem('saveSeperateFiles') == 'true' ? true : false;
  }

  MIME = RegExp('image/([a-z]+)');
  // regex for finding data image dataURLs
  // currently setup to find jpeg, jpg, png, webp, and gif
  DATAURL =
    /(["'`]data:image\/(?:j?pe?n?g|webp|gif);base64,[a-zA-Z0-9+/]+={0,2}["'`])/gi;
  DATAURLINCLUDINGAVIF =
    /(["'`]data:image\/(?:j?pe?n?g|webp|gif|avif);base64,[a-zA-Z0-9+/]+={0,2}["'`])/gi;
  IMAGEURL =
    /(["'`]images\/[A-Za-z0-9_-]+\.(?:png|jpe?g|gif|bmp|webp|svg|avif)["'`]|["'`]https?:\/\/(?:www\.)?[A-Za-z0-9-._~:/?#\[\]@!$&'()*+,;%=]+\.(?:png|jpe?g|gif|bmp|webp|svg)["'`])/gi;
  WEBFILEURL =
    /((?:href=|src=|href: basePath \+ '|src: basePath \+ ')\"?\.?[A-Za-z0-9-._~:/?#\[\]@!$&'()*+,;%=]+\.(?:ttf|eot|woff2?|css|js|html))/gi;

  // formatter for file sizes
  formatSize(n: string): string {
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
  }

  // match imageURLs for progressbar
  isImageURL = (s: string) =>
    s.match(
      // '^(["\'`]images\/[A-Za-z0-9_\-]+\.(?:png|jpe?g|gif|bmp|webp|svg|avif)["\'`])$'
      /^(["'`]images\/[A-Za-z0-9_-]+\.(?:png|jpe?g|gif|bmp|webp|svg|avif)["'`]|["'`]https?:\/\/(?:www\.)?[A-Za-z0-9-._~:/?#\[\]@!$&'()*+,;%=]+\.(?:png|jpe?g|gif|bmp|webp|svg)["'`])$/i
    ) && s[0] == s.slice(-1);
  // match dataURLs for progressbar
  isDataURL = (s: string) =>
    s.match(
      /^(["'`]data:image\/(?:j?pe?n?g|webp|gif);base64,[a-zA-Z0-9+/]+={0,2}["'`])$/i
    ) && s[0] == s.slice(-1);
  // match css, js, html, and font file URLs
  isWEBFILEURL = (s: string) =>
    s.match(
      /^((?:href=|src=|href: basePath \+ '|src: basePath \+ ')\"?\.?[A-Za-z0-9-._~:/?#\[\]@!$&'()*+,;%=]+\.(?:ttf|eot|woff2?|css|js|html))$/i
    ) && true;

  // match dataURLs for progressbar
  isDataURLIncludingAvif = (s: string) =>
    s.match(
      '^(["\'`]data:image/(?:j?pe?n?g|webp|gif|avif);base64,[a-zA-Z0-9+/]+={0,2}["\'`])$'
    ) && s[0] == s.slice(-1);

  // dispatcher for web workers using observable-webworker
  // https://github.com/cloudnc/observable-webworker
  convertText(s: any[]): Observable<CompressionString[]> {
    return fromWorkerPool<CompressionString, CompressionString[]>(
      () =>
        new Worker(new URL('./compressor.worker', import.meta.url), {
          type: 'module',
        }),
      s
    );
  }

  // dispatcher for web workers using observable-webworker
  // https://github.com/cloudnc/observable-webworker
  fetchImage(s: OrderedString[]): Observable<OrderedString[]> {
    return fromWorkerPool<OrderedString, OrderedString[]>(
      () =>
        new Worker(new URL('./imagedownload.worker', import.meta.url), {
          type: 'module',
        }),
      s,
      { workerCount: 2 }
    );
  }

  stripLeadingZeros(s: string): string {
    return parseInt(s).toString();
  }

  setQuality(s: string): void {
    const n = Number(s);
    this.quality = n;
  }

  // reset the URL and save name
  resetURL() {
    this.cyoaURLString = '';
    this.saveTitle = '';
  }

  mergeExternalImages(file: File): any {
    // turn our file into a string
    return from(file.text()).pipe(
      // show progressbar
      tap((x: string) => (this.inProgress = true)),
      // split the string into an array of strings
      // that are the dataURLs and the stuff before and after them
      map((x: string): string[] => x.split(this.IMAGEURL)),
      // store length of array for progressbar
      // only include imageURLs
      tap((x: string[]) => {
        this.progressMax =
          x.filter((x) => this.isImageURL(x)).length > 0
            ? x.filter((x) => this.isImageURL(x)).length
            : 100;
      }),
      // annotate our strings with their index in the array so we
      // can put them back together in the right order later
      map((x: string[]) =>
        x.map((st: string, i: number): OrderedString => {
          return { s: st, index: i, url: this.cyoaURL?.toString()! };
        })
      ),
      // send the strings off to the dispatch function
      // data urls will be converted, and others will be returned
      // as-is
      map(
        (x: OrderedString[]): Observable<OrderedString[]> => this.fetchImage(x)
      ),
      mergeAll()
    );
  }

  async fetchFile(url: string): Promise<null> {
    if (url.startsWith('href=')) {
      url = url.substring(5);
    } else if (url.startsWith('src=')) {
      url = url.substring(4);
      // custom for ICC2
    } else if (url.startsWith("href: basePath + '")) {
      url = url.substring(18);
      // custom for ICC2
    } else if (url.startsWith("src: basePath + '")) {
      url = url.substring(17);
    }
    if (url.startsWith('"')) {
      url = url.substring(1);
    }
    // don't pull stuff from CDNs
    if (url.startsWith('http')) {
      return null;
    }
    // remove ., it breaks URLs
    if (url.startsWith('.')) {
      url = url.substring(1);
    }

    // if the file is already in the zip archive
    if (this.cyoaFileNames.some((x: string) => x == url)) {
      // don't process it again
      return null;
    }
    this.cyoaFileNames.push(url);
    // these files are already processed, even though their
    // names are not in the name array
    if (url == 'project.json' || url == 'index.html') {
      return null;
    }
    let blob = await fetch(
      new URL(
        `${this.cyoaURL!.pathname !== '/' ? this.cyoaURL!.pathname : ''}${url}`,
        this.cyoaURL!
      )
    ).then(async (r) => {
      if (r.ok) {
        return await r.blob();
      } else {
        return null;
      }
    });

    if (blob === null) {
      return null;
    }

    const file = new File([blob], url ? url : 'index.html', {
      type: blob.type,
    });
    // recurse here
    await new Promise<void>((resolve, reject) => {
      this.parseFilesRecursive(file).subscribe({
        complete: resolve,
        error: reject,
      });
    });
    return null;
  }

  parseFilesRecursive(infile: File): Observable<void> {
    // Start with the current file
    this.cyoaFiles.push(infile);

    return from(infile.text()).pipe(
      // Extract all web file URLs
      map((text: string) => text.match(this.WEBFILEURL) ?? []),
      mergeMap((urls: string[]) => from(urls)),
      // Only keep valid URLs
      filter((url: string) => this.isWEBFILEURL(url) == true),
      // Fetch URL (fetchFile returns Promise<void>)
      mergeMap((url: string) =>
        from(this.fetchFile(url)).pipe(
          catchError(() => EMPTY),
          mergeMap(() => {
            return EMPTY; // nothing to do
          })
        )
      )
    );
  }

  // main function to setup conversion
  // takes a File object as input
  // todo: figure out typing for return type
  convert(file: File): any {
    // turn our file into a string
    return from(file.text()).pipe(
      // split the string into an array of strings
      // that are the dataURLs and the stuff before and after them
      map((x: string): string[] => x.split(this.DATAURLINCLUDINGAVIF)),
      // store length of array for progressbar
      // only include dataURLs
      // slight inaccuracies due to the fact that
      // we need to count AVIFs going in
      // because we won't be able to tell
      // if ones coming out have been converted
      // by us or were already in AVIF format
      tap(
        (x: string[]) =>
          (this.AVIFprogressMax =
            x.filter((x) => this.isDataURLIncludingAvif(x)).length > 0
              ? x.filter((x) => this.isDataURLIncludingAvif(x)).length
              : 100)
      ),
      // annotate our strings with their index in the array so we
      // can put them back together in the right order later
      map((x) =>
        x.map((st: string, i: number): CompressionString => {
          return { s: st, index: i, quality: this.quality };
        })
      ),
      // send the strings off to the dispatch function
      // data urls will be converted, and others will be returned
      // as-is
      map(
        (x: CompressionString[]): Observable<CompressionString[]> =>
          this.convertText(x)
      ),
      mergeAll()
    );
  }

  // sort function for OrderedString or CompressionString
  sortResults(
    a: Partial<OrderedString> | Partial<CompressionString>,
    b: Partial<OrderedString> | Partial<CompressionString>
  ): number {
    if (a.index! < b.index!) {
      return -1;
    } else if (a.index! > b.index!) {
      return 1;
    } else {
      return 0;
    }
  }

  // Function to extract the declared MIME type
  getDeclaredMimeType(dataUrl: string) {
    const match = dataUrl.slice(1, -1).match(/^data:([a-z\/]+);/);
    return match ? match[1] : null;
  }

  createFileFromString(fileString: string, type: string, name: string): File {
    // convert string to blob
    const blob = new Blob([fileString], { type: type });
    // and create a file
    const file = new File([blob], name, {
      type,
    });
    return file;
  }

  async dataURLtoFile(dataurl: string, filename: string): Promise<File> {
    const mime = this.getDeclaredMimeType(dataurl);
    let blob = await fetch(dataurl.slice(1, -1)).then((r) => r.blob());
    return new File([blob], filename, { type: mime! });
  }

  async makeZipFile(): Promise<File> {
    const zipBlob = await downloadZip(this.cyoaFiles).blob();
    let savename: string = 'cyoa';
    const pathSegments = this.cyoaURL?.pathname
      .split('/')
      .filter((x: string) => x !== '');
    if (this.saveTitle !== '') {
      // save title manually entered or parsed from first Row
      savename = this.saveTitle;
    } else if (!!pathSegments && pathSegments.length > 0) {
      // save title from last path segment
      savename = pathSegments.at(-1)!;
    } else if (this.cyoaURL?.hostname?.split('.')[0]) {
      // save title from sub-domain
      savename = this.cyoaURL?.hostname?.split('.')[0];
    }

    const outfile = new File([zipBlob], `${savename}.zip`, {
      type: 'application/zip',
    });
    return outfile;
  }

  getExtensionFromDataURL(dataUrl: string): string {
    const mime = this.getDeclaredMimeType(dataUrl);
    return `.${mime!.split('/')[1]}`;
  }

  // saves the images in the project.json as seperate files
  // in an images folder
  // takes in a list of Ordered or Compression strings that are
  // either data urls in the project.json or the other text
  // in it
  async saveSeperateFiles(
    fileStrings: Partial<CompressionString>[] & Partial<OrderedString>[]
  ): Promise<Partial<CompressionString>[] & Partial<OrderedString>[]> {
    return lastValueFrom(
      from(fileStrings).pipe(
        concatMap(
          async (os: Partial<CompressionString> & Partial<OrderedString>) => {
            // if the string is a dataURL
            if (this.isDataURLIncludingAvif(os.s!)) {
              // convert it into a file
              const newFile = await this.dataURLtoFile(
                os.s!,
                `images/${os.index}${this.getExtensionFromDataURL(os.s!)}`
              );
              // add it to the zip archive
              this.cyoaFiles.push(newFile);
              // replace the data url with the path
              // to the file in the zip archive
              os.s = `"${newFile.name}"`;
              return os;
            } else {
              // otherwise return as-is
              return os;
            }
          }
        ),
        toArray()
      )
    );
  }

  async displayFile(
    jsonFile: File | null,
    jsonOutFile: File | null,
    compressedJsonFile: File | null,
    startTime: number
  ): Promise<void> {
    if (compressedJsonFile) {
      this.cyoaFiles.push(compressedJsonFile);
    } else if (jsonOutFile) {
      this.cyoaFiles.push(jsonOutFile);
    }
    // make zip file
    const outfile = await this.makeZipFile();
    // hide progressbar
    this.inProgress = false;
    // mark completion time
    const endTime: number = performance.now();

    // runtime in milliseconds with decimal
    const elapsedMS: number = endTime - startTime;

    this.elapsedTime = new Date(elapsedMS).toISOString().slice(11, -3);

    // and push to DOM
    this.result = {
      href: URL.createObjectURL(outfile),
      download: outfile.name,
      innerText: outfile.name,
      jsonInFileSize: jsonFile
        ? this.formatSize(jsonFile.size.toString())
        : 'N/A',
      jsonOutFileSize: jsonOutFile
        ? this.formatSize(jsonOutFile.size.toString())
        : 'N/A',
      jsonCompressedSize: compressedJsonFile
        ? this.formatSize(compressedJsonFile.size.toString())
        : 'N/A',
      cyoaTotalSize: this.formatSize(outfile.size.toString()),
    };
  }

  result: DownloadData | null = null;

  async process(): Promise<void> {
    this.cyoaURL = null;
    // try to create the URL
    try {
      // append a trailing slash
      this.cyoaURL = new URL(
        this.cyoaURLString.endsWith('/')
          ? this.cyoaURLString
          : `${this.cyoaURLString}/`
      );
    } catch (e) {
      // abort if unable to create a valid URL
      return;
    }

    // reset arrays
    this.cyoaFiles = [];
    this.cyoaFileNames = [];

    // reset progress bars
    this.progress = 0;
    this.AVIFprogress = 0;

    // start timer
    const startTime: number = performance.now();

    // download the project.json if it exists
    let jsonBlob = await fetch(new URL('project.json', this.cyoaURL)).then(
      async (r) => {
        if (r.ok) {
          return await r.blob();
        } else {
          return null;
        }
      }
    );

    // download the project.json if it exists
    let project: Project = await fetch(
      new URL('project.json', this.cyoaURL)
    ).then(async (r) => {
      if (r.ok) {
        return await r.json();
      } else {
        return null;
      }
    });

    let jsonFile: File | null = null;
    if (jsonBlob) {
      this.saveTitle = project.rows[0].title;
      jsonFile = new File([jsonBlob], 'project.json', {
        type: 'application/json',
      });
      this.cyoaFileNames.push('project.json');
    }

    // download the index.html file, webserver should redirect from /
    let indexBlob = await fetch(this.cyoaURL).then(async (r) => await r.blob());

    const indexFile = new File([indexBlob], 'index.html', {
      type: 'text/html',
    });

    if (!indexFile) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.parseFilesRecursive(indexFile).subscribe({
        complete: resolve,
        error: reject,
      });
    });

    // revoke any references to previously compressed
    // CYOAs to free memory
    if (this.result?.href) {
      URL.revokeObjectURL(this.result.href);
    }

    this.result = null;

    if (jsonFile) {
      this.inProgress = true;
      await this.mergeExternalImages(jsonFile)
        .pipe(
          // update progressbar
          // also update progress for dataURLs that were already in the CYOA
          tap((x: OrderedString) =>
            this.isDataURLIncludingAvif(x.s) ? this.progress++ : null
          ),
          // collect all the results together into one array
          reduce(
            (acc: OrderedString[], value: OrderedString): OrderedString[] => [
              ...acc,
              value,
            ],
            [] as OrderedString[]
          ),
          tap((x) => {
            this.progress = this.progressMax;
          })
        )
        .subscribe(async (fetchedFiles: OrderedString[]) => {
          if (!this.doCompression && this.shouldSaveSeperateFiles) {
            fetchedFiles = (await this.saveSeperateFiles(
              fetchedFiles
            )) as OrderedString[];
          }
          // these arrive in whatever order they convert in, so we need to sort them
          fetchedFiles.sort(this.sortResults);
          // remove the annotation used for sorting
          const withoutIndices: string[] = fetchedFiles.map(
            (x: OrderedString) => x.s
          );
          // join to a single string
          const fileString: string = withoutIndices.join('');
          // convert to a blob
          const blob = new Blob([fileString], { type: jsonFile.type });
          // and create a file
          const JsonOutFile = new File([blob], jsonFile.name, {
            type: jsonFile.type,
          });
          if (this.doCompression) {
            await this.convert(JsonOutFile)
              .pipe(
                // update progressbar
                // also update progress for AVIFs that were already in the CYOA
                tap((x: CompressionString) =>
                  this.isDataURLIncludingAvif(x.s) ? this.AVIFprogress++ : null
                ),
                // collect all the results together into one array
                reduce(
                  (
                    acc: CompressionString[],
                    value: CompressionString
                  ): CompressionString[] => [...acc, value],
                  [] as CompressionString[]
                )
              )
              .subscribe(async (convertedFiles: CompressionString[]) => {
                if (this.shouldSaveSeperateFiles) {
                  convertedFiles = (await this.saveSeperateFiles(
                    convertedFiles
                  )) as CompressionString[];
                }
                // these arrive in whatever order they convert in, so we need to sort them
                convertedFiles.sort(this.sortResults);
                // remove the annotation used for sorting
                const withoutIndices: string[] = convertedFiles.map(
                  (x: CompressionString) => x.s
                );
                // join to a single string
                const fileString: string = withoutIndices.join('');
                // create file from string
                const CompressedJsonFile = this.createFileFromString(
                  fileString,
                  JsonOutFile.type,
                  'project.json'
                );

                await this.displayFile(
                  jsonFile,
                  JsonOutFile,
                  CompressedJsonFile,
                  startTime
                );
              });
          } else {
            // compression not selected
            await this.displayFile(jsonFile, JsonOutFile, null, startTime);
          }
        });
    } else {
      // no project.json found
      await this.displayFile(jsonFile, null, null, startTime);
    }
  }
}
