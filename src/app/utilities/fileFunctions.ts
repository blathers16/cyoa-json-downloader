import { concatMap, from, lastValueFrom, toArray } from 'rxjs';
import { CompressionString } from '../models/compression-string';
import { OrderedString } from '../models/ordered-string';
import {
  isDataURLIncludingAvif,
  isJSONFileName,
  isWEBFILEURL,
  WEBFILEURLORJSONFILENAME,
} from './regex';
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

export const fetchFile = async (
  url: string,
  cyoaURL: URL,
  cyoaFiles: File[],
  cyoaFileNames: string[]
): Promise<void> => {
  // --- clean the URL ---
  if (url.startsWith('href=')) url = url.substring(5);
  else if (url.startsWith('src=')) url = url.substring(4);
  else if (url.startsWith("href: basePath + '")) url = url.substring(18);
  else if (url.startsWith("src: basePath + '")) url = url.substring(17);
  if (url.startsWith('"')) url = url.substring(1);
  if (url.startsWith('http')) return; // skip external URLs
  if (url.startsWith('.')) url = url.substring(1);

  // --- skip already-processed or base files ---
  if (cyoaFileNames.includes(url)) return;
  if (url === 'project.json' || url === 'index.html') return;
  cyoaFileNames.push(url);

  // --- fetch the file ---
  const response = await fetch(
    new URL(
      `${cyoaURL.pathname !== '/' ? cyoaURL.pathname : ''}${url}`,
      cyoaURL
    )
  );

  if (!response.ok) return;

  const blob = await response.blob();
  const file = new File([blob], url || 'index.html', { type: blob.type });

  // --- recursively parse the fetched file ---
  await parseFilesRecursive(file, cyoaURL, cyoaFiles, cyoaFileNames);
};

export const parseFilesRecursive = async (
  infile: File,
  cyoaURL: URL,
  cyoaFiles: File[],
  cyoaFileNames: string[]
): Promise<void> => {
  cyoaFiles.push(infile);
  const text = await infile.text();

  // --- find all URLs ---
  const urls = text.match(WEBFILEURLORJSONFILENAME) ?? [];

  for (const url of urls) {
    if (isJSONFileName(url.slice(1, -1))) {
      cyoaFileNames.push(url.slice(1, -1));
    }

    if (isWEBFILEURL(url)) {
      await fetchFile(url, cyoaURL, cyoaFiles, cyoaFileNames);
    }
  }
};

export const createFileFromString: Function = (
  fileString: string,
  type: string,
  name: string
): File => {
  // convert string to blob
  const blob = new Blob([fileString], { type: type });
  // and create a file
  const file = new File([blob], name, {
    type,
  });
  return file;
};
