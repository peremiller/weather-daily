// Vercel's zero-configuration Express entrypoint. Unlike src/index.js, this
// exports the app without opening a long-running listener or polling loop.
export { default } from './src/app.js';

export const maxDuration = 60;
