// Tests read the .xlsx fixture from disk (Vitest runs in Node). Declaring just
// the one function avoids pulling all of @types/node into the browser app's types.
declare module "node:fs" {
  export function readFileSync(path: URL | string): Uint8Array;
}
