// Vite `?raw` imports return the file's contents as a string. Declared narrowly here (the project has
// no vite-env.d.ts) so `import('./enable1.txt?raw')` is typed without pulling in all vite/client ambients.
declare module '*?raw' {
  const content: string
  export default content
}
