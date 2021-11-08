"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = exportPage;
var _url = _interopRequireDefault(require("url"));
var _path1 = require("path");
var _render = require("../server/render");
var _fs = require("fs");
var _amphtmlValidator = _interopRequireDefault(require("next/dist/compiled/amphtml-validator"));
var _zenObservable = _interopRequireDefault(require("next/dist/compiled/zen-observable"));
var _loadComponents = require("../server/load-components");
var _isDynamic = require("../shared/lib/router/utils/is-dynamic");
var _routeMatcher = require("../shared/lib/router/utils/route-matcher");
var _routeRegex = require("../shared/lib/router/utils/route-regex");
var _normalizePagePath = require("../server/normalize-page-path");
var _constants = require("../lib/constants");
require("../server/node-polyfill-fetch");
var _require = require("../server/require");
var _normalizeLocalePath = require("../shared/lib/i18n/normalize-locale-path");
var _trace = require("../telemetry/trace");
var _amp = require("../shared/lib/amp");
var _utils = require("../server/utils");
var _config = require("../server/config");
function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
const envConfig = require('../shared/lib/runtime-config');
global.__NEXT_DATA__ = {
    nextExport: true
};
async function exportPage({ parentSpanId , path , pathMap , distDir , outDir , pagesDataDir , renderOpts , buildExport , serverRuntimeConfig , subFolders , serverless , optimizeFonts , optimizeImages , optimizeCss , disableOptimizedLoading , httpAgentOptions  }) {
    (0, _config).setHttpAgentOptions(httpAgentOptions);
    const exportPageSpan = (0, _trace).trace('export-page-worker', parentSpanId);
    return exportPageSpan.traceAsyncFn(async ()=>{
        const start = Date.now();
        let results = {
            ampValidations: []
        };
        try {
            var ref;
            const { query: originalQuery = {
            }  } = pathMap;
            const { page  } = pathMap;
            const filePath = (0, _normalizePagePath).normalizePagePath(path);
            const isDynamic = (0, _isDynamic).isDynamicRoute(page);
            const ampPath = `${filePath}.amp`;
            let renderAmpPath = ampPath;
            let query = {
                ...originalQuery
            };
            let params;
            let updatedPath = query.__nextSsgPath || path;
            let locale = query.__nextLocale || renderOpts.locale;
            delete query.__nextLocale;
            delete query.__nextSsgPath;
            if (renderOpts.locale) {
                const localePathResult = (0, _normalizeLocalePath).normalizeLocalePath(path, renderOpts.locales);
                if (localePathResult.detectedLocale) {
                    updatedPath = localePathResult.pathname;
                    locale = localePathResult.detectedLocale;
                    if (locale === renderOpts.defaultLocale) {
                        renderAmpPath = `${(0, _normalizePagePath).normalizePagePath(updatedPath)}.amp`;
                    }
                }
            }
            // We need to show a warning if they try to provide query values
            // for an auto-exported page since they won't be available
            const hasOrigQueryValues = Object.keys(originalQuery).length > 0;
            const queryWithAutoExportWarn = ()=>{
                if (hasOrigQueryValues) {
                    throw new Error(`\nError: you provided query values for ${path} which is an auto-exported page. These can not be applied since the page can no longer be re-rendered on the server. To disable auto-export for this page add \`getInitialProps\`\n`);
                }
            };
            // Check if the page is a specified dynamic route
            const nonLocalizedPath = (0, _normalizeLocalePath).normalizeLocalePath(path, renderOpts.locales).pathname;
            if (isDynamic && page !== nonLocalizedPath) {
                params = (0, _routeMatcher).getRouteMatcher((0, _routeRegex).getRouteRegex(page))(updatedPath) || undefined;
                if (params) {
                    // we have to pass these separately for serverless
                    if (!serverless) {
                        query = {
                            ...query,
                            ...params
                        };
                    }
                } else {
                    throw new Error(`The provided export path '${updatedPath}' doesn't match the '${page}' page.\nRead more: https://nextjs.org/docs/messages/export-path-mismatch`);
                }
            }
            const headerMocks = {
                headers: {
                },
                getHeader: ()=>({
                    })
                ,
                setHeader: ()=>{
                },
                hasHeader: ()=>false
                ,
                removeHeader: ()=>{
                },
                getHeaderNames: ()=>[]
            };
            const req = {
                url: updatedPath,
                ...headerMocks
            };
            const res = {
                ...headerMocks
            };
            if (path === '/500' && page === '/_error') {
                res.statusCode = 500;
            }
            if (renderOpts.trailingSlash && !((ref = req.url) === null || ref === void 0 ? void 0 : ref.endsWith('/'))) {
                req.url += '/';
            }
            envConfig.setConfig({
                serverRuntimeConfig,
                publicRuntimeConfig: renderOpts.runtimeConfig
            });
            const getHtmlFilename = (_path)=>subFolders ? `${_path}${_path1.sep}index.html` : `${_path}.html`
            ;
            let htmlFilename = getHtmlFilename(filePath);
            const pageExt = (0, _path1).extname(page);
            const pathExt = (0, _path1).extname(path);
            // Make sure page isn't a folder with a dot in the name e.g. `v1.2`
            if (pageExt !== pathExt && pathExt !== '') {
                const isBuiltinPaths = [
                    '/500',
                    '/404'
                ].some((p)=>p === path || p === path + '.html'
                );
                // If the ssg path has .html extension, and it's not builtin paths, use it directly
                // Otherwise, use that as the filename instead
                const isHtmlExtPath = !serverless && !isBuiltinPaths && path.endsWith('.html');
                htmlFilename = isHtmlExtPath ? getHtmlFilename(path) : path;
            } else if (path === '/') {
                // If the path is the root, just use index.html
                htmlFilename = 'index.html';
            }
            const baseDir = (0, _path1).join(outDir, (0, _path1).dirname(htmlFilename));
            let htmlFilepath = (0, _path1).join(outDir, htmlFilename);
            await _fs.promises.mkdir(baseDir, {
                recursive: true
            });
            let renderResult;
            let curRenderOpts = {
            };
            let renderMethod = _render.renderToHTML;
            let inAmpMode = false, hybridAmp = false;
            const renderedDuringBuild = (getStaticProps)=>{
                return !buildExport && getStaticProps && !(0, _isDynamic).isDynamicRoute(path);
            };
            if (serverless) {
                const curUrl = _url.default.parse(req.url, true);
                req.url = _url.default.format({
                    ...curUrl,
                    query: {
                        ...curUrl.query,
                        ...query
                    }
                });
                const { Component: mod , getServerSideProps , pageConfig ,  } = await (0, _loadComponents).loadComponents(distDir, page, serverless);
                const ampState = {
                    ampFirst: (pageConfig === null || pageConfig === void 0 ? void 0 : pageConfig.amp) === true,
                    hasQuery: Boolean(query.amp),
                    hybrid: (pageConfig === null || pageConfig === void 0 ? void 0 : pageConfig.amp) === 'hybrid'
                };
                inAmpMode = (0, _amp).isInAmpMode(ampState);
                hybridAmp = ampState.hybrid;
                if (getServerSideProps) {
                    throw new Error(`Error for page ${page}: ${_constants.SERVER_PROPS_EXPORT_ERROR}`);
                }
                // if it was auto-exported the HTML is loaded here
                if (typeof mod === 'string') {
                    renderResult = _zenObservable.default.of(mod);
                    queryWithAutoExportWarn();
                } else {
                    // for non-dynamic SSG pages we should have already
                    // prerendered the file
                    if (renderedDuringBuild(mod.getStaticProps)) return {
                        ...results,
                        duration: Date.now() - start
                    };
                    if (mod.getStaticProps && !htmlFilepath.endsWith('.html')) {
                        // make sure it ends with .html if the name contains a dot
                        htmlFilename += '.html';
                        htmlFilepath += '.html';
                    }
                    renderMethod = mod.renderReqToHTML;
                    const result = await renderMethod(req, res, 'export', {
                        ampPath: renderAmpPath,
                        /// @ts-ignore
                        optimizeFonts,
                        /// @ts-ignore
                        optimizeImages,
                        /// @ts-ignore
                        optimizeCss,
                        disableOptimizedLoading,
                        distDir,
                        fontManifest: optimizeFonts ? (0, _require).requireFontManifest(distDir, serverless) : null,
                        locale: locale,
                        locales: renderOpts.locales
                    }, // @ts-ignore
                    params);
                    curRenderOpts = result.renderOpts || {
                    };
                    renderResult = result.html;
                }
                if (!renderResult && !curRenderOpts.isNotFound) {
                    throw new Error(`Failed to render serverless page`);
                }
            } else {
                var ref1, ref2;
                const components = await (0, _loadComponents).loadComponents(distDir, page, serverless);
                const ampState = {
                    ampFirst: ((ref1 = components.pageConfig) === null || ref1 === void 0 ? void 0 : ref1.amp) === true,
                    hasQuery: Boolean(query.amp),
                    hybrid: ((ref2 = components.pageConfig) === null || ref2 === void 0 ? void 0 : ref2.amp) === 'hybrid'
                };
                inAmpMode = (0, _amp).isInAmpMode(ampState);
                hybridAmp = ampState.hybrid;
                if (components.getServerSideProps) {
                    throw new Error(`Error for page ${page}: ${_constants.SERVER_PROPS_EXPORT_ERROR}`);
                }
                // for non-dynamic SSG pages we should have already
                // prerendered the file
                if (renderedDuringBuild(components.getStaticProps)) {
                    return {
                        ...results,
                        duration: Date.now() - start
                    };
                }
                // TODO: de-dupe the logic here between serverless and server mode
                if (components.getStaticProps && !htmlFilepath.endsWith('.html')) {
                    // make sure it ends with .html if the name contains a dot
                    htmlFilepath += '.html';
                    htmlFilename += '.html';
                }
                if (typeof components.Component === 'string') {
                    renderResult = _zenObservable.default.of(components.Component);
                    queryWithAutoExportWarn();
                } else {
                    /**
           * This sets environment variable to be used at the time of static export by head.tsx.
           * Using this from process.env allows targeting both serverless and SSR by calling
           * `process.env.__NEXT_OPTIMIZE_FONTS`.
           * TODO(prateekbh@): Remove this when experimental.optimizeFonts are being cleaned up.
           */ if (optimizeFonts) {
                        process.env.__NEXT_OPTIMIZE_FONTS = JSON.stringify(true);
                    }
                    if (optimizeImages) {
                        process.env.__NEXT_OPTIMIZE_IMAGES = JSON.stringify(true);
                    }
                    if (optimizeCss) {
                        process.env.__NEXT_OPTIMIZE_CSS = JSON.stringify(true);
                    }
                    curRenderOpts = {
                        ...components,
                        ...renderOpts,
                        ampPath: renderAmpPath,
                        params,
                        optimizeFonts,
                        optimizeImages,
                        optimizeCss,
                        disableOptimizedLoading,
                        fontManifest: optimizeFonts ? (0, _require).requireFontManifest(distDir, serverless) : null,
                        locale: locale
                    };
                    renderResult = await renderMethod(req, res, page, query, // @ts-ignore
                    curRenderOpts);
                }
            }
            results.ssgNotFound = curRenderOpts.isNotFound;
            const validateAmp = async (rawAmpHtml, ampPageName, validatorPath)=>{
                const validator = await _amphtmlValidator.default.getInstance(validatorPath);
                const result = validator.validateString(rawAmpHtml);
                const errors = result.errors.filter((e)=>e.severity === 'ERROR'
                );
                const warnings = result.errors.filter((e)=>e.severity !== 'ERROR'
                );
                if (warnings.length || errors.length) {
                    results.ampValidations.push({
                        page: ampPageName,
                        result: {
                            errors,
                            warnings
                        }
                    });
                }
            };
            const html = renderResult ? await (0, _utils).resultsToString([
                renderResult
            ]) : '';
            if (inAmpMode && !curRenderOpts.ampSkipValidation) {
                if (!results.ssgNotFound) {
                    await validateAmp(html, path, curRenderOpts.ampValidatorPath);
                }
            } else if (hybridAmp) {
                // we need to render the AMP version
                let ampHtmlFilename = `${ampPath}${_path1.sep}index.html`;
                if (!subFolders) {
                    ampHtmlFilename = `${ampPath}.html`;
                }
                const ampBaseDir = (0, _path1).join(outDir, (0, _path1).dirname(ampHtmlFilename));
                const ampHtmlFilepath = (0, _path1).join(outDir, ampHtmlFilename);
                try {
                    await _fs.promises.access(ampHtmlFilepath);
                } catch (_) {
                    // make sure it doesn't exist from manual mapping
                    let ampRenderResult;
                    if (serverless) {
                        req.url += (req.url.includes('?') ? '&' : '?') + 'amp=1';
                        // @ts-ignore
                        ampRenderResult = (await renderMethod(req, res, 'export', curRenderOpts, params)).html;
                    } else {
                        ampRenderResult = await renderMethod(req, res, page, // @ts-ignore
                        {
                            ...query,
                            amp: '1'
                        }, curRenderOpts);
                    }
                    const ampHtml = ampRenderResult ? await (0, _utils).resultsToString([
                        ampRenderResult
                    ]) : '';
                    if (!curRenderOpts.ampSkipValidation) {
                        await validateAmp(ampHtml, page + '?amp=1');
                    }
                    await _fs.promises.mkdir(ampBaseDir, {
                        recursive: true
                    });
                    await _fs.promises.writeFile(ampHtmlFilepath, ampHtml, 'utf8');
                }
            }
            if (curRenderOpts.pageData) {
                const dataFile = (0, _path1).join(pagesDataDir, htmlFilename.replace(/\.html$/, '.json'));
                await _fs.promises.mkdir((0, _path1).dirname(dataFile), {
                    recursive: true
                });
                await _fs.promises.writeFile(dataFile, JSON.stringify(curRenderOpts.pageData), 'utf8');
                if (hybridAmp) {
                    await _fs.promises.writeFile(dataFile.replace(/\.json$/, '.amp.json'), JSON.stringify(curRenderOpts.pageData), 'utf8');
                }
            }
            results.fromBuildExportRevalidate = curRenderOpts.revalidate;
            if (!results.ssgNotFound) {
                // don't attempt writing to disk if getStaticProps returned not found
                await _fs.promises.writeFile(htmlFilepath, html, 'utf8');
            }
        } catch (error) {
            console.error(`\nError occurred prerendering page "${path}". Read more: https://nextjs.org/docs/messages/prerender-error\n` + error.stack);
            results.error = true;
        }
        return {
            ...results,
            duration: Date.now() - start
        };
    });
}

//# sourceMappingURL=worker.js.map