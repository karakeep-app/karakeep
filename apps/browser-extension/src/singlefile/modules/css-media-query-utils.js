import * as mediaQueryParser from "../vendor/css-media-query-parser.js";

function parseMediaListSafe(mediaText) {
    return mediaQueryParser.parseMediaList(mediaText);
}

function containsNotKeyword(node) {
    if (!node || !node.nodes) return false;
    for (const token of node.nodes) {
        if (token && token.type === "keyword" && token.value && token.value.toLowerCase() === "not") {
            return true;
        }
    }
    return false;
}

function isMediaTypeNegated(parentNode, index) {
    for (let j = index - 1; j >= 0; j--) {
        const prev = parentNode.nodes[j];
        if (!prev) continue;
        if (prev.type === "operator" && prev.value === ",") {
            break;
        }
        if (prev.type === "keyword" && prev.value && prev.value.toLowerCase() === "not") {
            return true;
        }
    }
    return false;
}

function extractMediaTypes(parentNode, mediaTypes = []) {
    for (let index = 0; index < parentNode.nodes.length; index++) {
        const node = parentNode.nodes[index];
        if (node.type == "media-query") {
            extractMediaTypes(node, mediaTypes);
            continue;
        }
        if (node.type == "media-type") {
            const negated = isMediaTypeNegated(parentNode, index);
            mediaTypes.push({ not: negated, value: node.value });
        }
    }
    return mediaTypes;
}

function isFeaturefulOrCompound(node) {
    if (!node || !node.nodes) return false;
    for (const token of node.nodes) {
        if (!token) continue;
        if (token.type === "media-feature-expression") return true;
        if (token.type === "keyword" && token.value && token.value.toLowerCase() === "and") return true;
    }
    if (containsNotKeyword(node)) return true;
    return false;
}

export {
    parseMediaListSafe,
    containsNotKeyword,
    isMediaTypeNegated,
    extractMediaTypes,
    isFeaturefulOrCompound
};
