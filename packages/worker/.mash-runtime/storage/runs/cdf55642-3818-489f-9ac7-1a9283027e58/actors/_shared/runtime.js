function tryRequire(paths) {
  for (const candidate of paths) {
    try {
      return require(candidate);
    } catch (_err) {
      continue;
    }
  }
  throw new Error(`Unable to load WebMiner actor runtime from any known path: ${paths.join(', ')}`);
}

const runtime = tryRequire([
  process.env.WEBMINER_ACTOR_SDK_PATH,
  '/app/actor-sdk/index',
  './actor-sdk/index',
  '../../actor-sdk/src/index',
].filter(Boolean));

module.exports = runtime;
