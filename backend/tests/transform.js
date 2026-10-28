// Compiles TypeScript for Jest with the TypeScript 5.4 alias, because ts-jest
// loads the project's TypeScript 7 in places and crashes on its missing API.
// Types are only stripped here: `npm run build` type-checks everything.
const crypto = require('crypto');
const ts = require('@typescript/typescript6');

const compilerOptions = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
  esModuleInterop: true,
  resolveJsonModule: true,
  sourceMap: true,
};

module.exports = {
  process(source, fileName) {
    const output = ts.transpileModule(source, { fileName, compilerOptions });
    return { code: output.outputText, map: output.sourceMapText };
  },
  getCacheKey(source, fileName) {
    return crypto.createHash('sha256').update(ts.version).update(fileName).update(source).digest('hex');
  },
};
