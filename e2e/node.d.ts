declare module 'node:fs' {
  export const promises: {
    mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
    copyFile(src: string, dest: string): Promise<void>;
  };
  export function readFileSync(path: string, encoding: string): string;
  const fs: {
    promises: {
      mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
      copyFile(src: string, dest: string): Promise<void>;
    };
    readFileSync(path: string, encoding: string): string;
  };
  export default fs;
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
  const path: {
    resolve(...paths: string[]): string;
    join(...paths: string[]): string;
  };
  export default path;
}
