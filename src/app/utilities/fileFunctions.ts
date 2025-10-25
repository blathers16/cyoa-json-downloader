import {
  catchError,
  concatMap,
  EMPTY,
  filter,
  from,
  lastValueFrom,
  map,
  mergeMap,
  Observable,
  toArray,
} from 'rxjs';
import { CompressionString } from '../models/compression-string';
import { OrderedString } from '../models/ordered-string';
import { isDataURLIncludingAvif, isWEBFILEURL, WEBFILEURL } from './regex';
import { getDeclaredMimeType, getExtensionFromDataURL } from './dataURLs';

// saves the images in the project.json as seperate files
// in an images folder
// takes in a list of Ordered or Compression strings that are
// either data urls in the project.json or the other text
// in it
export const saveSeperateFiles: Function = async (
  fileStrings: Partial<CompressionString>[] & Partial<OrderedString>[],
  cyoaFiles: File[]
): Promise<Partial<CompressionString>[] & Partial<OrderedString>[]> => {
  return lastValueFrom(
    from(fileStrings).pipe(
      concatMap(
        async (os: Partial<CompressionString> & Partial<OrderedString>) => {
          // if the string is a dataURL
          if (isDataURLIncludingAvif(os.s!)) {
            // convert it into a file
            const newFile = await dataURLtoFile(
              os.s!,
              `images/${os.index}${getExtensionFromDataURL(os.s!)}`
            );
            // add it to the zip archive
            cyoaFiles.push(newFile);
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
};

export const dataURLtoFile: Function = async (
  dataurl: string,
  filename: string
): Promise<File> => {
  const mime = getDeclaredMimeType(dataurl);
  let blob = await fetch(dataurl.slice(1, -1)).then((r) => r.blob());
  return new File([blob], filename, { type: mime! });
};

export const fetchFile: Function = async (
  url: string,
  cyoaURL: URL,
  cyoaFiles: File[],
  cyoaFileNames: string[]
): Promise<null> => {
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
  if (cyoaFileNames.some((x: string) => x == url)) {
    // don't process it again
    return null;
  }
  cyoaFileNames.push(url);
  // these files are already processed, even though their
  // names are not in the name array
  if (url == 'project.json' || url == 'index.html') {
    return null;
  }
  let blob = await fetch(
    new URL(
      `${cyoaURL!.pathname !== '/' ? cyoaURL!.pathname : ''}${url}`,
      cyoaURL!
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
    parseFilesRecursive(file, cyoaURL, cyoaFiles, cyoaFileNames).subscribe({
      complete: resolve,
      error: reject,
    });
  });
  return null;
};

export const parseFilesRecursive: Function = (
  infile: File,
  cyoaURL: URL,
  cyoaFiles: File[],
  cyoaFileNames: string[]
): Observable<void> => {
  // Start with the current file
  cyoaFiles.push(infile);

  return from(infile.text()).pipe(
    // Extract all web file URLs
    map((text: string) => text.match(WEBFILEURL) ?? []),
    mergeMap((urls: string[]) => from(urls)),
    // Only keep valid URLs
    filter((url: string) => isWEBFILEURL(url) == true),
    // Fetch URL (fetchFile returns Promise<void>)
    mergeMap((url: string) =>
      from(fetchFile(url, cyoaURL, cyoaFiles, cyoaFileNames)).pipe(
        catchError(() => EMPTY),
        mergeMap(() => {
          return EMPTY; // nothing to do
        })
      )
    )
  );
};

  export const createFileFromString: Function = (fileString: string, type: string, name: string): File => {
    // convert string to blob
    const blob = new Blob([fileString], { type: type });
    // and create a file
    const file = new File([blob], name, {
      type,
    });
    return file;
  }
