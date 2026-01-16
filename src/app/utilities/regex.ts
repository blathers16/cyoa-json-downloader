// match imageURLs for progressbar
export const isImageURL = (s: string) =>
  s.match(
    // '^(["\'`]images\/[A-Za-z0-9_\-]+\.(?:png|jpe?g|gif|bmp|webp|svg|avif)["\'`])$'
    /^(["'`]images\/[A-Za-z0-9_-]+\.(?:png|jpe?g|gif|bmp|webp|svg|avif)["'`]|["'`]https?:\/\/(?:www\.)?[A-Za-z0-9-._~:/?#\[\]@!$&'()*+,;%=]+\.(?:png|jpe?g|gif|bmp|webp|svg)["'`])$/i
  ) && s[0] == s.slice(-1);
export const isRelativeImageURL = (s: string) =>
  s.match(
    /^(["'`]images\/[A-Za-z0-9_-]+\.(?:png|jpe?g|gif|bmp|webp|svg|avif)["'`])$/i
  ) && s[0] == s.slice(-1);

export const isAbsoluteImageURL = (s: string) =>
  s.match(
    /^(["'`]https?:\/\/(?:www\.)?[^"'\s]+\.(?:png|jpe?g|gif|bmp|webp|svg)["'`])$/i
  ) && s[0] == s.slice(-1);

// match any dataURL (including non images)
export const isANYDATAURL = (s: string) => 
  s.match(
    /^(["'`]data:(?:(?:application|audio|chemical|font|image|message|model|text|video|x-conference)\/[a-z0-9\.\-\+]+|gcode);base64,[a-zA-Z0-9+/]+={0,2}["'`])$/i
  ) && s[0] == s.slice(-1);

// match image dataURLs (without AVIF)
export const isDataURL = (s: string) =>
  s.match(
    /^(["'`]data:image\/(?:j?pe?n?g|webp|gif);base64,[a-zA-Z0-9+/]+={0,2}["'`])$/i
  ) && s[0] == s.slice(-1);
// match css, js, html, and font file URLs
export const isWEBFILEURL = (s: string) =>
  s.match(
    /^((?:href=|src=|href: basePath \+ '|src: basePath \+ ')\"?\.?[A-Za-z0-9-._~:/?#\[\]@!$&'()*+,;%=]+\.(?:ttf|eot|woff2?|css|js|html))$/i
  ) && true;
// match image dataURLs (with AVIF)
export const isDataURLIncludingAvif = (s: string) =>
  s.match(
    '^(["\'`]data:image/(?:j?pe?n?g|webp|gif|avif);base64,[a-zA-Z0-9+/]+={0,2}["\'`])$'
  ) && s[0] == s.slice(-1);
export const isJSONFileName = (s: string) =>
  s.match("^((?:[a-zA-Z0-9-._~]|[!$&'()*+,;=:@]|%[0-9a-fA-F]{2})+.json)$") &&
  true;
// dataURL mime header
export const MIME = RegExp('image/([a-z]+)');
// regex for finding data image dataURLs
// currently setup to find jpeg, jpg, png, webp, and gif
export const ANYDATAURL = 
  /(["'`]data:(?:(?:application|audio|chemical|font|image|message|model|text|video|x-conference)\/[a-z0-9\.\-\+]+|gcode);base64,[a-zA-Z0-9+/]+={0,2}["'`])/gi;
export const DATAURL =
  /(["'`]data:image\/(?:j?pe?n?g|webp|gif);base64,[a-zA-Z0-9+/]+={0,2}["'`])/gi;
export const DATAURLINCLUDINGAVIF =
  /(["'`]data:image\/(?:j?pe?n?g|webp|gif|avif);base64,[a-zA-Z0-9+/]+={0,2}["'`])/gi;
export const IMAGEURL =
  /(["'`]images\/[A-Za-z0-9_-]+\.(?:png|jpe?g|gif|bmp|webp|svg|avif)["'`]|["'`]https?:\/\/(?:www\.)?[A-Za-z0-9-._~:/?#\[\]@!$&'()*+,;%=]+\.(?:png|jpe?g|gif|bmp|webp|svg)["'`])/gi;
export const WEBFILEURL =
  /((?:href=|src=|href: basePath \+ '|src: basePath \+ ')\"?\.?[A-Za-z0-9-._~:/?#\[\]@!$&'()*+,;%=]+\.(?:ttf|eot|woff2?|css|js|html))/gi;
export const JSONFILENAME =
  /(["'`](?:[a-zA-Z0-9\-._~]|[!$&'()*+,;=:@]|%[0-9a-fA-F]{2})+\.json["'`])/gi;
export const WEBFILEURLORJSONFILENAME =
  /((?:href=|src=|href: basePath \+ '|src: basePath \+ ')\"?\.?[A-Za-z0-9-._~:/?#\[\]@!$&'()*+,;%=]+\.(?:ttf|eot|woff2?|css|js|html))|(["'`](?:[a-zA-Z0-9\-._~]|[!$&'()*+,;=:@]|%[0-9a-fA-F]{2})+\.json["'`])/gi;
