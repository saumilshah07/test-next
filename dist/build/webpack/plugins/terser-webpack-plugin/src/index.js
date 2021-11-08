"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
var path = _interopRequireWildcard(require("path"));
var _webpack = require("next/dist/compiled/webpack/webpack");
var _pLimit = _interopRequireDefault(require("p-limit"));
var _jestWorker = require("jest-worker");
var _crypto = _interopRequireDefault(require("crypto"));
var _cacache = _interopRequireDefault(require("next/dist/compiled/cacache"));
var _profilingPlugin = require("../../profiling-plugin");
function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function _interopRequireWildcard(obj) {
    if (obj && obj.__esModule) {
        return obj;
    } else {
        var newObj = {
        };
        if (obj != null) {
            for(var key in obj){
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {
                    };
                    if (desc.get || desc.set) {
                        Object.defineProperty(newObj, key, desc);
                    } else {
                        newObj[key] = obj[key];
                    }
                }
            }
        }
        newObj.default = obj;
        return newObj;
    }
}
function getEcmaVersion(environment) {
    // ES 6th
    if (environment.arrowFunction || environment.const || environment.destructuring || environment.forOf || environment.module) {
        return 2015;
    }
    // ES 11th
    if (environment.bigIntLiteral || environment.dynamicImport) {
        return 2020;
    }
    return 5;
}
function buildError(error, file) {
    if (error.line) {
        return new Error(`${file} from Terser\n${error.message} [${file}:${error.line},${error.col}]${error.stack ? `\n${error.stack.split('\n').slice(1).join('\n')}` : ''}`);
    }
    if (error.stack) {
        return new Error(`${file} from Terser\n${error.message}\n${error.stack}`);
    }
    return new Error(`${file} from Terser\n${error.message}`);
}
class Webpack4Cache {
    constructor(cacheDir, { SourceMapSource , RawSource  }){
        this.cacheDir = cacheDir;
        this.sources = {
            SourceMapSource,
            RawSource
        };
    }
    getLazyHashedEtag(obj) {
        let str;
        if (obj.source) {
            str = obj.source();
        }
        const hash = _crypto.default.createHash('md4');
        hash.update(str ? str : obj);
        return hash.digest('base64');
    }
    async getPromise(identifier, etag) {
        let cachedResult;
        try {
            cachedResult = await _cacache.default.get(this.cacheDir, etag);
        } catch (ignoreError) {
            // eslint-disable-next-line no-undefined
            return undefined;
        }
        cachedResult = JSON.parse(cachedResult.data);
        const { code , name , map , input , inputSourceMap  } = cachedResult;
        let source;
        if (map) {
            source = new this.sources.SourceMapSource(code, name, map, input, inputSourceMap, true);
        } else {
            source = new this.sources.RawSource(code);
        }
        return {
            source
        };
    }
    async storePromise(identifier1, etag1, data) {
        await _cacache.default.put(this.cacheDir, etag1, JSON.stringify(data));
    }
}
class TerserPlugin {
    constructor(options1 = {
    }){
        const { cacheDir , terserOptions ={
        } , parallel , swcMinify  } = options1;
        this.options = {
            swcMinify,
            cacheDir,
            parallel,
            terserOptions
        };
    }
    async optimize(compiler, compilation1, assets1, optimizeOptions, cache1, { SourceMapSource: SourceMapSource1 , RawSource: RawSource1  }) {
        const compilerSpan = _profilingPlugin.spans.get(compiler);
        const terserSpan = compilerSpan.traceChild('terser-webpack-plugin-optimize');
        terserSpan.setAttribute('webpackVersion', _webpack.isWebpack5 ? 5 : 4);
        terserSpan.setAttribute('compilationName', compilation1.name);
        return terserSpan.traceAsyncFn(async ()=>{
            let numberOfAssetsForMinify = 0;
            const assetsList = _webpack.isWebpack5 ? Object.keys(assets1) : [
                ...Array.from(compilation1.additionalChunkAssets || []),
                ...Array.from(assets1).reduce((acc, chunk)=>{
                    return acc.concat(Array.from(chunk.files || []));
                }, []), 
            ];
            const assetsForMinify = await Promise.all(assetsList.filter((name)=>{
                if (!_webpack.ModuleFilenameHelpers.matchObject.bind(// eslint-disable-next-line no-undefined
                undefined, {
                    test: /\.[cm]?js(\?.*)?$/i
                })(name)) {
                    return false;
                }
                const res = compilation1.getAsset(name);
                if (!res) {
                    console.log(name);
                    return false;
                }
                const { info  } = res;
                // Skip double minimize assets from child compilation
                if (info.minimized) {
                    return false;
                }
                return true;
            }).map(async (name)=>{
                const { info , source  } = compilation1.getAsset(name);
                const eTag = cache1.getLazyHashedEtag(source);
                const output = await cache1.getPromise(name, eTag);
                if (!output) {
                    numberOfAssetsForMinify += 1;
                }
                return {
                    name,
                    info,
                    inputSource: source,
                    output,
                    eTag
                };
            }));
            const numberOfWorkers = Math.min(numberOfAssetsForMinify, optimizeOptions.availableNumberOfCores);
            let initializedWorker;
            // eslint-disable-next-line consistent-return
            const getWorker = ()=>{
                if (this.options.swcMinify) {
                    return {
                        minify: async (options)=>{
                            const result = await require('../../../../swc').transform(options.input, {
                                minify: true,
                                jsc: {
                                    minify: {
                                        compress: true,
                                        mangle: true
                                    }
                                }
                            });
                            return result;
                        }
                    };
                }
                if (initializedWorker) {
                    return initializedWorker;
                }
                initializedWorker = new _jestWorker.Worker(path.join(__dirname, './minify.js'), {
                    numWorkers: numberOfWorkers,
                    enableWorkerThreads: true
                });
                initializedWorker.getStdout().pipe(process.stdout);
                initializedWorker.getStderr().pipe(process.stderr);
                return initializedWorker;
            };
            const limit = (0, _pLimit).default(// When using the SWC minifier the limit will be handled by Node.js
            this.options.swcMinify ? Infinity : numberOfAssetsForMinify > 0 ? numberOfWorkers : Infinity);
            const scheduledTasks = [];
            for (const asset of assetsForMinify){
                scheduledTasks.push(limit(async ()=>{
                    const { name , inputSource , info , eTag  } = asset;
                    let { output  } = asset;
                    const minifySpan = terserSpan.traceChild('minify-js');
                    minifySpan.setAttribute('name', name);
                    minifySpan.setAttribute('cache', typeof output === 'undefined' ? 'MISS' : 'HIT');
                    return minifySpan.traceAsyncFn(async ()=>{
                        if (!output) {
                            const { source: sourceFromInputSource , map: inputSourceMap  } = inputSource.sourceAndMap();
                            const input = Buffer.isBuffer(sourceFromInputSource) ? sourceFromInputSource.toString() : sourceFromInputSource;
                            const options = {
                                name,
                                input,
                                inputSourceMap,
                                terserOptions: {
                                    ...this.options.terserOptions
                                }
                            };
                            if (typeof options.terserOptions.module === 'undefined') {
                                if (typeof info.javascriptModule !== 'undefined') {
                                    options.terserOptions.module = info.javascriptModule;
                                } else if (/\.mjs(\?.*)?$/i.test(name)) {
                                    options.terserOptions.module = true;
                                } else if (/\.cjs(\?.*)?$/i.test(name)) {
                                    options.terserOptions.module = false;
                                }
                            }
                            try {
                                output = await getWorker().minify(options);
                            } catch (error) {
                                compilation1.errors.push(buildError(error, name));
                                return;
                            }
                            if (output.map) {
                                output.source = new SourceMapSource1(output.code, name, output.map, input, /** @type {SourceMapRawSourceMap} */ (inputSourceMap), true);
                            } else {
                                output.source = new RawSource1(output.code);
                            }
                            if (_webpack.isWebpack5) {
                                await cache1.storePromise(name, eTag, {
                                    source: output.source
                                });
                            } else {
                                await cache1.storePromise(name, eTag, {
                                    code: output.code,
                                    map: output.map,
                                    name,
                                    input,
                                    inputSourceMap
                                });
                            }
                        }
                        /** @type {AssetInfo} */ const newInfo = {
                            minimized: true
                        };
                        const { source  } = output;
                        compilation1.updateAsset(name, source, newInfo);
                    });
                }));
            }
            await Promise.all(scheduledTasks);
            if (initializedWorker) {
                await initializedWorker.end();
            }
        });
    }
    /**
   * @param {Compiler} compiler
   * @returns {void}
   */ apply(compiler1) {
        var ref;
        const { SourceMapSource , RawSource  } = (compiler1 === null || compiler1 === void 0 ? void 0 : (ref = compiler1.webpack) === null || ref === void 0 ? void 0 : ref.sources) || _webpack.sources;
        const { output  } = compiler1.options;
        if (typeof this.options.terserOptions.ecma === 'undefined') {
            this.options.terserOptions.ecma = getEcmaVersion(output.environment || {
            });
        }
        const pluginName = this.constructor.name;
        const availableNumberOfCores = this.options.parallel;
        compiler1.hooks.compilation.tap(pluginName, (compilation)=>{
            // Don't run minifier against mini-css-extract-plugin
            if (compilation.name !== 'client' && compilation.name !== 'server') {
                return;
            }
            const cache = _webpack.isWebpack5 ? compilation.getCache('TerserWebpackPlugin') : new Webpack4Cache(this.options.cacheDir, {
                SourceMapSource,
                RawSource
            });
            const handleHashForChunk = (hash, chunk)=>{
                // increment 'c' to invalidate cache
                hash.update('c');
            };
            if (_webpack.isWebpack5) {
                const JSModulesHooks = _webpack.webpack.javascript.JavascriptModulesPlugin.getCompilationHooks(compilation);
                JSModulesHooks.chunkHash.tap(pluginName, (chunk, hash)=>{
                    if (!chunk.hasRuntime()) return;
                    return handleHashForChunk(hash, chunk);
                });
                compilation.hooks.processAssets.tapPromise({
                    name: pluginName,
                    stage: _webpack.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE
                }, (assets)=>this.optimize(compiler1, compilation, assets, {
                        availableNumberOfCores
                    }, cache, {
                        SourceMapSource,
                        RawSource
                    })
                );
                compilation.hooks.statsPrinter.tap(pluginName, (stats)=>{
                    stats.hooks.print.for('asset.info.minimized').tap('terser-webpack-plugin', (minimized, { green , formatFlag  })=>// eslint-disable-next-line no-undefined
                        minimized ? green(formatFlag('minimized')) : undefined
                    );
                });
            } else {
                compilation.mainTemplate.hooks.hashForChunk.tap(pluginName, handleHashForChunk);
                compilation.chunkTemplate.hooks.hashForChunk.tap(pluginName, handleHashForChunk);
                compilation.hooks.optimizeChunkAssets.tapPromise(pluginName, async (assets)=>{
                    return await this.optimize(compiler1, compilation, assets, {
                        availableNumberOfCores
                    }, cache, {
                        SourceMapSource,
                        RawSource
                    });
                });
            }
        });
    }
}
exports.TerserPlugin = TerserPlugin;

//# sourceMappingURL=index.js.map