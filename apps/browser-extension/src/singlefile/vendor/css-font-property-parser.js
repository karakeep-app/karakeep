/*
 * The MIT License (MIT)
 * 
 * Author: Gildas Lormeau
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// derived from https://github.com/jedmao/parse-css-font/

/*
 * The MIT License (MIT)
 * 
 * Copyright (c) 2015 Jed Mao
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:

 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.

 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import * as cssTree from "./css-tree.js";
import { process as cssUnescape } from "./css-unescape.js";

const GLOBAL_KEYWORDS = new Set([
	"inherit",
	"initial",
	"unset"
]);

const SYSTEM_FONT_KEYWORDS = new Set([
	"caption",
	"icon",
	"menu",
	"message-box",
	"small-caption",
	"status-bar"
]);

const FONT_WEIGHT_KEYWORDS = new Set([
	"normal",
	"bold",
	"bolder",
	"lighter",
	"100",
	"200",
	"300",
	"400",
	"500",
	"600",
	"700",
	"800",
	"900"
]);

const FONT_STYLE_KEYWORDS = new Set([
	"normal",
	"italic",
	"oblique"
]);

const FONT_VARIANT_KEYWORDS = new Set([
	"normal",
	"small-caps"
]);

const FONT_STRETCH_KEYWORDS = new Set([
	"normal",
	"condensed",
	"semi-condensed",
	"extra-condensed",
	"ultra-condensed",
	"expanded",
	"semi-expanded",
	"extra-expanded",
	"ultra-expanded"
]);

const SIZE_TYPES = new Set([
	"Dimension",
	"Identifier",
	"Percentage",
	"Number",
	"Function",
	"UnaryExpression"
]);

const FONT_DESCRIPTOR_KEYS = new Set([
	"style",
	"variant",
	"weight",
	"stretch"
]);

const OPERATOR_TYPE = "Operator";
const IDENTIFIER_TYPE = "Identifier";
const NORMAL_KEYWORD = "normal";
const LINE_HEIGHT_SEPARATOR = "/";
const FAMILY_SEPARATOR = ",";

const errorPrefix = "[parse-css-font] ";

export {
	parse
};

function parse(value) {
	const stringValue = cssTree.generate(value);
	const stringValueLower = stringValue.toLowerCase();
	if (SYSTEM_FONT_KEYWORDS.has(stringValueLower)) {
		return { system: stringValue };
	}
	if (GLOBAL_KEYWORDS.has(stringValueLower)) {
		return { global: stringValue };
	}
	const tokens = value.children;
	const font = {
		lineHeight: NORMAL_KEYWORD,
		stretch: NORMAL_KEYWORD,
		style: NORMAL_KEYWORD,
		variant: NORMAL_KEYWORD,
		weight: NORMAL_KEYWORD,
	};
	const seen = { style: false, variant: false, weight: false, stretch: false };
	for (let tokenNode = tokens.head; tokenNode; tokenNode = tokenNode.next) {
		const tokenRaw = tokenNode.data.name || tokenNode.data.value || cssTree.generate(tokenNode.data);
		const token = tokenRaw.toLowerCase();
		if (token === NORMAL_KEYWORD) {
			FONT_DESCRIPTOR_KEYS.forEach((prop) => {
				if (!seen[prop]) {
					font[prop] = tokenRaw;
				}
			});
			continue;
		}
		if (FONT_WEIGHT_KEYWORDS.has(token)) {
			if (!seen.weight) {
				font.weight = tokenRaw;
				seen.weight = true;
			}
			continue;
		}
		if (FONT_STYLE_KEYWORDS.has(token)) {
			if (!seen.style) {
				font.style = tokenRaw;
				seen.style = true;
			}
			continue;
		}
		if (FONT_VARIANT_KEYWORDS.has(token)) {
			if (!seen.variant) {
				font.variant = tokenRaw;
				seen.variant = true;
			}
			continue;
		}
		if (FONT_STRETCH_KEYWORDS.has(token)) {
			if (!seen.stretch) {
				font.stretch = tokenRaw;
				seen.stretch = true;
			}
			continue;
		}
		if (SIZE_TYPES.has(tokenNode.data.type)) {
			font.size = cssTree.generate(tokenNode.data);
			tokenNode = tokenNode.next;
			if (tokenNode && tokenNode.data.type == OPERATOR_TYPE && tokenNode.data.value == LINE_HEIGHT_SEPARATOR && tokenNode.next) {
				font.lineHeight = cssTree.generate(tokenNode.next.data);
				tokenNode = tokenNode.next.next;
			}
			if (!tokenNode) {
				throw error("Missing required font-family.");
			}
			font.family = [];
			let familyName = "";
			while (tokenNode) {
				while (tokenNode && tokenNode.data.type == OPERATOR_TYPE && tokenNode.data.value == FAMILY_SEPARATOR) {
					tokenNode = tokenNode.next;
				}
				if (tokenNode) {
					if (tokenNode.data.type == IDENTIFIER_TYPE) {
						while (tokenNode && tokenNode.data.type == IDENTIFIER_TYPE) {
							familyName += " " + cssTree.generate(tokenNode.data);
							tokenNode = tokenNode.next;
						}
					} else {
						familyName = removeQuotes(cssTree.generate(tokenNode.data));
						tokenNode = tokenNode.next;
					}
				}
				familyName = familyName.trim();
				if (familyName) {
					font.family.push(familyName);
					familyName = "";
				}
			}
			return font;
		}
		throw error("Unknown or unsupported font token: " + tokenRaw);
	}

	throw error("Missing required font-size.");
}

function error(message) {
	return new Error(errorPrefix + message);
}

function removeQuotes(string) {
	if (!string) return string;
	if ((string[0] === "\"" && string[string.length - 1] === "\"") || (string[0] === "'" && string[string.length - 1] === "'")) {
		string = string.slice(1, -1);
	}
	return cssUnescape(string).trim();
}