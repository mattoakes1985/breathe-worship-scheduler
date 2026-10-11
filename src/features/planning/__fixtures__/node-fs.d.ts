// Tests read files from disk (Vitest runs in Node). Declaring just these
// functions avoids pulling all of @types/node into the browser app's types.
declare module "node:fs" {
  export function readFileSync(path: URL | string): Uint8Array;
  export function readFileSync(path: URL | string, encoding: "utf8"): string;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { isDirectory(): boolean };
}
