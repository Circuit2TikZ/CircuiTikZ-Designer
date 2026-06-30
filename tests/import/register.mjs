import { register } from "node:module"
// Load the TS-extension resolver hook. `import.meta.url` is already a file URL.
register("./ts-resolver.mjs", import.meta.url)
