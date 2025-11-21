/*
 * Copyright 2010-2022 Gildas Lormeau
 * contact : gildas.lormeau <at> gmail.com
 * 
 * This file is part of SingleFile.
 *
 *   The code in this file is free software: you can redistribute it and/or 
 *   modify it under the terms of the GNU Affero General Public License 
 *   (GNU AGPL) as published by the Free Software Foundation, either version 3
 *   of the License, or (at your option) any later version.
 * 
 *   The code in this file is distributed in the hope that it will be useful, 
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of 
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero 
 *   General Public License for more details.
 *
 *   As additional permission under GNU AGPL version 3 section 7, you may 
 *   distribute UNMODIFIED VERSIONS OF THIS file without the copy of the GNU 
 *   AGPL normally required by section 4, provided you include this license 
 *   notice and a URL through which recipients can access the Corresponding 
 *   Source.
 */

// Derived from the work of Kirill Maltsev - https://github.com/posthtml/htmlnano

// Source: https://github.com/kangax/html-minifier/issues/63
const booleanAttributes = [
	"allowfullscreen",
	"async",
	"autofocus",
	"autoplay",
	"checked",
	"compact",
	"controls",
	"declare",
	"default",
	"defaultchecked",
	"defaultmuted",
	"defaultselected",
	"defer",
	"disabled",
	"enabled",
	"formnovalidate",
	"hidden",
	"indeterminate",
	"inert",
	"ismap",
	"itemscope",
	"loop",
	"multiple",
	"muted",
	"nohref",
	"noresize",
	"noshade",
	"novalidate",
	"nowrap",
	"open",
	"pauseonexit",
	"readonly",
	"required",
	"reversed",
	"scoped",
	"seamless",
	"selected",
	"sortable",
	"truespeed",
	"typemustmatch",
	"visible"
];

const noWhitespaceCollapseElements = ["SCRIPT", "STYLE", "PRE", "TEXTAREA"];

// Source: https://www.w3.org/TR/html4/sgml/dtd.html#events (Generic Attributes)
const safeToRemoveAttrs = [
	"id",
	"class",
	"style",
	"lang",
	"dir",
	"onclick",
	"ondblclick",
	"onmousedown",
	"onmouseup",
	"onmouseover",
	"onmousemove",
	"onmouseout",
	"onkeypress",
	"onkeydown",
	"onkeyup"
];

const redundantAttributes = {
	"FORM": {
		"method": "get"
	},
	"SCRIPT": {
		"language": "javascript",
		"type": "text/javascript",
		// Remove attribute if the function returns false
		"charset": node => {
			// The charset attribute only really makes sense on “external” SCRIPT elements:
			// http://perfectionkills.com/optimizing-html/#8_script_charset
			return !node.getAttribute("src");
		}
	},
	"STYLE": {
		"media": "all",
		"type": "text/css"
	},
	"LINK": {
		"media": "all"
	}
};

const REGEXP_WHITESPACE = /[ \t\f\r]+/g;
const REGEXP_NEWLINE = /[\n]+/g;
const REGEXP_ENDS_WHITESPACE = /^\s+$/;
const NodeFilter_SHOW_ALL = 4294967295;
const Node_ELEMENT_NODE = 1;
const Node_TEXT_NODE = 3;
const Node_COMMENT_NODE = 8;

const modules = [
	collapseBooleanAttributes,
	mergeTextNodes,
	collapseWhitespace,
	removeComments,
	removeEmptyAttributes,
	removeRedundantAttributes,
	compressJSONLD
];

export {
	process
};

function process(doc, options) {
	removeEmptyInlineElements(doc);
	const nodesWalker = doc.createTreeWalker(doc.documentElement, NodeFilter_SHOW_ALL, null, false);
	let node = nodesWalker.nextNode();
	while (node) {
		const deletedNode = modules.find(module => module(node, options));
		const previousNode = node;
		node = nodesWalker.nextNode();
		if (deletedNode) {
			previousNode.remove();
		}
	}
}

function collapseBooleanAttributes(node) {
	if (node.nodeType == Node_ELEMENT_NODE) {
		Array.from(node.attributes).forEach(attribute => {
			if (booleanAttributes.includes(attribute.name)) {
				node.setAttribute(attribute.name, "");
			}
		});
	}
}

function mergeTextNodes(node) {
	if (node.nodeType == Node_TEXT_NODE) {
		if (node.previousSibling && node.previousSibling.nodeType == Node_TEXT_NODE) {
			node.textContent = node.previousSibling.textContent + node.textContent;
			node.previousSibling.remove();
		}
	}
}

function collapseWhitespace(node, options) {
	if (node.nodeType == Node_TEXT_NODE) {
		let element = node.parentElement;
		const spacePreserved = element.getAttribute(options.PRESERVED_SPACE_ELEMENT_ATTRIBUTE_NAME) == "";
		if (!spacePreserved) {
			const textContent = node.textContent;
			let noWhitespace = noWhitespaceCollapse(element);
			while (noWhitespace) {
				element = element.parentElement;
				noWhitespace = element && noWhitespaceCollapse(element);
			}
			if ((!element || noWhitespace) && textContent.length > 1) {
				node.textContent = textContent.replace(REGEXP_WHITESPACE, getWhiteSpace(node)).replace(REGEXP_NEWLINE, "\n");
			}
		}
	}
}

function getWhiteSpace(node) {
	return node.parentElement && getTagName(node.parentElement) == "HEAD" ? "\n" : " ";
}

function noWhitespaceCollapse(element) {
	return element && !noWhitespaceCollapseElements.includes(getTagName(element));
}

function removeComments(node) {
	if (node.nodeType == Node_COMMENT_NODE && getTagName(node.parentElement) != "HTML") {
		return !node.textContent.toLowerCase().trim().startsWith("[if");
	}
}

function removeEmptyAttributes(node) {
	if (node.nodeType == Node_ELEMENT_NODE) {
		Array.from(node.attributes).forEach(attribute => {
			if (safeToRemoveAttrs.includes(attribute.name.toLowerCase())) {
				const attributeValue = node.getAttribute(attribute.name);
				if (attributeValue == "" || (attributeValue || "").match(REGEXP_ENDS_WHITESPACE)) {
					node.removeAttribute(attribute.name);
				}
			}
		});
	}
}

function removeRedundantAttributes(node) {
	if (node.nodeType == Node_ELEMENT_NODE) {
		const tagRedundantAttributes = redundantAttributes[getTagName(node)];
		if (tagRedundantAttributes) {
			Object.keys(tagRedundantAttributes).forEach(redundantAttributeName => {
				const tagRedundantAttributeValue = tagRedundantAttributes[redundantAttributeName];
				if (typeof tagRedundantAttributeValue == "function" ? tagRedundantAttributeValue(node) : node.getAttribute(redundantAttributeName) == tagRedundantAttributeValue) {
					node.removeAttribute(redundantAttributeName);
				}
			});
		}
	}
}

function compressJSONLD(node) {
	if (node.nodeType == Node_ELEMENT_NODE && getTagName(node) == "SCRIPT" && node.type == "application/ld+json" && node.textContent.trim()) {
		try {
			node.textContent = JSON.stringify(JSON.parse(node.textContent));
			// eslint-disable-next-line no-unused-vars
		} catch (error) {
			// ignored
		}
	}
}

function removeEmptyInlineElements(doc) {
	doc.querySelectorAll("style, script:not([src])").forEach(element => {
		if (!element.textContent.trim()) {
			element.remove();
		}
	});
}

function getTagName(element) {
	return element.tagName && element.tagName.toUpperCase();
}