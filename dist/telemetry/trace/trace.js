"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.flushAllTraces = exports.trace = exports.SpanStatus = void 0;
var _crypto = require("crypto");
var _report = require("./report");
const NUM_OF_MICROSEC_IN_SEC = BigInt('1000');
const getId = ()=>(0, _crypto).randomBytes(8).toString('hex')
;
var SpanStatus1;
exports.SpanStatus = SpanStatus1;
(function(SpanStatus) {
    SpanStatus[SpanStatus["Started"] = 0] = "Started";
    SpanStatus[SpanStatus["Stopped"] = 1] = "Stopped";
})(SpanStatus1 || (exports.SpanStatus = SpanStatus1 = {
}));
class Span {
    constructor(name2, parentId1, attrs2){
        this.name = name2;
        this.parentId = parentId1;
        this.duration = null;
        this.attrs = attrs2 ? {
            ...attrs2
        } : {
        };
        this.status = SpanStatus1.Started;
        this.id = getId();
        this._start = process.hrtime.bigint();
    }
    // Durations are reported as microseconds. This gives 1000x the precision
    // of something like Date.now(), which reports in milliseconds.
    // Additionally, ~285 years can be safely represented as microseconds as
    // a float64 in both JSON and JavaScript.
    stop() {
        const end = process.hrtime.bigint();
        const duration = (end - this._start) / NUM_OF_MICROSEC_IN_SEC;
        this.status = SpanStatus1.Stopped;
        if (duration > Number.MAX_SAFE_INTEGER) {
            throw new Error(`Duration is too long to express as float64: ${duration}`);
        }
        const timestamp = this._start / NUM_OF_MICROSEC_IN_SEC;
        _report.reporter.report(this.name, Number(duration), Number(timestamp), this.id, this.parentId, this.attrs);
    }
    traceChild(name1, attrs1) {
        return new Span(name1, this.id, attrs1);
    }
    setAttribute(key, value) {
        this.attrs[key] = String(value);
    }
    traceFn(fn) {
        try {
            return fn();
        } finally{
            this.stop();
        }
    }
    async traceAsyncFn(fn1) {
        try {
            return await fn1();
        } finally{
            this.stop();
        }
    }
}
exports.Span = Span;
const trace = (name, parentId, attrs)=>{
    return new Span(name, parentId, attrs);
};
exports.trace = trace;
const flushAllTraces = ()=>_report.reporter.flushAll()
;
exports.flushAllTraces = flushAllTraces;

//# sourceMappingURL=trace.js.map