export type ReadRawTextProps<T> = {
  extension: string;
  buffer: T;
  encoding: string;
  ocrModel?: string;
};

export type ReadRawTextByBuffer = {
  buffer: Buffer;
  extension: string;
  encoding: string;
  teamId?: string;
  ocrModel?: string;
};

export type ImageType = {
  uuid: string;
  base64: string;
  mime: string;
};

export type ReadFileResponse = {
  rawText: string;
  formatText?: string;
  imageList?: ImageType[];
};
