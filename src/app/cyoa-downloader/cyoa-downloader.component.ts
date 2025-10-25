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
  Observable,
  from,
  map,
  mergeAll,
  reduce,
  tap,
} from 'rxjs';

import { DownloadData } from '../models/download-data';
import { OrderedString } from '../models/ordered-string';
import { FormsModule } from '@angular/forms';
import { CompressionString } from '../models/compression-string';
import { Project } from '../models/CYOA/project';

import {
  isDataURLIncludingAvif,
  isImageURL,
  DATAURLINCLUDINGAVIF,
  IMAGEURL,
} from '../utilities/regex';

import { formatSize, makeZipFile } from '../utilities/utils';
import {
  createFileFromString,
  parseFilesRecursive,
  saveSeperateFiles,
} from '../utilities/fileFunctions';

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
  quality: number = 25;
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

  setSaveSeperateFiles(shouldSaveSeperateFiles: boolean): void {
    localStorage.setItem(
      'saveSeperateFiles',
      shouldSaveSeperateFiles.toString()
    );
  }

  setDoCompression(doCompression: boolean): void {
    localStorage.setItem('compress', doCompression.toString());
  }

  ngOnInit(): void {
    // Load a simple string
    if (!localStorage.getItem('compress')) {
      localStorage.setItem('compress', 'true');
    }
    if (!localStorage.getItem('quality')) {
      localStorage.setItem('quality', '25');
    }
    if (!localStorage.getItem('saveSeperateFiles')) {
      localStorage.setItem('saveSeperateFiles', 'true');
    }
    this.quality = parseInt(localStorage.getItem('quality') ?? '25')
    this.doCompression =
      localStorage.getItem('compress') == 'true' ? true : false;
    this.shouldSaveSeperateFiles =
      localStorage.getItem('saveSeperateFiles') == 'true' ? true : false;
  }

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
    localStorage.setItem('quality', s)
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
      map((x: string): string[] => x.split(IMAGEURL)),
      map((x: string[]) => x.map((y) => y.split(DATAURLINCLUDINGAVIF)).flat()),
      // store length of array for progressbar
      // only include imageURLs
      tap((x: string[]) => {
        this.progressMax =
          x.filter((x) => isImageURL(x)).length > 0
            ? x.filter((x) => isImageURL(x)).length
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

  // main function to setup conversion
  // takes a File object as input
  // todo: figure out typing for return type
  convert(file: File): any {
    // turn our file into a string
    return from(file.text()).pipe(
      // split the string into an array of strings
      // that are the dataURLs and the stuff before and after them
      map((x: string): string[] => x.split(DATAURLINCLUDINGAVIF)),
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
            x.filter((x) => isDataURLIncludingAvif(x)).length > 0
              ? x.filter((x) => isDataURLIncludingAvif(x)).length
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
    const outfile = await makeZipFile(
      this.saveTitle,
      this.cyoaURL,
      this.cyoaFiles
    );
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
      jsonInFileSize: jsonFile ? formatSize(jsonFile.size.toString()) : 'N/A',
      jsonOutFileSize: jsonOutFile
        ? formatSize(jsonOutFile.size.toString())
        : 'N/A',
      jsonCompressedSize: compressedJsonFile
        ? formatSize(compressedJsonFile.size.toString())
        : 'N/A',
      cyoaTotalSize: formatSize(outfile.size.toString()),
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
      parseFilesRecursive(
        indexFile,
        this.cyoaURL,
        this.cyoaFiles,
        this.cyoaFileNames
      ).subscribe({
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
            isDataURLIncludingAvif(x.s) ? this.progress++ : null
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
            console.log('seperating files');
            fetchedFiles = (await saveSeperateFiles(
              fetchedFiles,
              this.cyoaFiles
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
            console.log('compressing');
            await this.convert(JsonOutFile)
              .pipe(
                // update progressbar
                // also update progress for AVIFs that were already in the CYOA
                tap((x: CompressionString) =>
                  isDataURLIncludingAvif(x.s) ? this.AVIFprogress++ : null
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
                  convertedFiles = (await saveSeperateFiles(
                    convertedFiles,
                    this.cyoaFiles
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
                const CompressedJsonFile = createFileFromString(
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
