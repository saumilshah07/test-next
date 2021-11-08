"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.debugLog = exports.setGlobal = exports.traceGlobals = exports.TARGET = void 0;
var TARGET1;
exports.TARGET = TARGET1;
(function(TARGET) {
    TARGET["CONSOLE"] = "CONSOLE";
    TARGET["ZIPKIN"] = "ZIPKIN";
    TARGET["JAEGER"] = "JAEGER";
    TARGET["TELEMETRY"] = "TELEMETRY";
})(TARGET1 || (exports.TARGET = TARGET1 = {
}));
const traceGlobals = new Map();
exports.traceGlobals = traceGlobals;
const setGlobal = (key, val)=>{
    traceGlobals.set(key, val);
};
exports.setGlobal = setGlobal;
const debugLog = !!process.env.TRACE_DEBUG ? console.info : function noop() {
};
exports.debugLog = debugLog;

//# sourceMappingURL=shared.js.map