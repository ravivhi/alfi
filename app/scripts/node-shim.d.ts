// Minimal typings for the Node modules the scripts use (no @types/node in this project).
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(path: string, data: string): void;
}
declare module 'node:url' {
  export function fileURLToPath(url: URL | string): string;
}
