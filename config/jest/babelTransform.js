'use strict';

const babelJest = require('babel-jest');
const createTransformer =
  babelJest.createTransformer ||
  babelJest?.default?.createTransformer ||
  babelJest.default ||
  babelJest;

module.exports = createTransformer({
  presets: [
    [require.resolve('babel-preset-solid'), { generate: 'dom' }],
    [
      require.resolve('@babel/preset-env'),
      {
        targets: { node: 'current' },
        modules: 'commonjs',
      },
    ],
    [require.resolve('@babel/preset-typescript'), { allExtensions: true, isTSX: true }],
  ],
  babelrc: false,
  configFile: false,
});
