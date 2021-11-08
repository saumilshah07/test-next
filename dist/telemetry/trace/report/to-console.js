"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = void 0;
const idToName = new Map();
const reportToConsole = (spanName, duration, _timestamp, id, parentId, attrs)=>{
    idToName.set(id, spanName);
    const parentStr = parentId && idToName.has(parentId) ? `, parent: ${idToName.get(parentId)}` : '';
    const attrsStr = attrs ? `, ${Object.entries(attrs).map(([key, val])=>`${key}: ${val}`
    ).join(', ')}` : '';
    console.log(`[trace] ${spanName} took ${duration} μs${parentStr}${attrsStr}`);
};
var _default = {
    flushAll: ()=>{
    },
    report: reportToConsole
};
exports.default = _default;

//# sourceMappingURL=to-console.js.map