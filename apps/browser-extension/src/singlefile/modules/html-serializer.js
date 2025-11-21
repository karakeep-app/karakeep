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

const VOID_TAG_NAMES = ["AREA", "BASE", "BASEFONT", "BGSOUND", "BR", "COL", "COMMAND", "EMBED", "FRAME", "HR", "IMG", "INPUT", "KEYGEN", "LINK", "META", "PARAM", "SOURCE", "TRACK", "WBR"];

const Node_ELEMENT_NODE = 1;
const Node_TEXT_NODE = 3;
const Node_COMMENT_NODE = 8;

// see https://www.w3.org/TR/html5/syntax.html#optional-tags
const OMITTED_START_TAGS = [
	{ tagName: "HEAD", accept: element => !element.childNodes.length || element.childNodes[0].nodeType == Node_ELEMENT_NODE },
	{ tagName: "BODY", accept: element => !element.childNodes.length }
];
const OMITTED_END_TAGS = [
	{ tagName: "HTML", accept: next => !next || next.nodeType != Node_COMMENT_NODE },
	{ tagName: "HEAD", accept: next => !next || (next.nodeType != Node_COMMENT_NODE && (next.nodeType != Node_TEXT_NODE || !startsWithSpaceChar(next.textContent))) },
	{ tagName: "BODY", accept: next => !next || next.nodeType != Node_COMMENT_NODE },
	{ tagName: "LI", accept: (next, element) => (!next && element.parentElement && (getTagName(element.parentElement) == "UL" || getTagName(element.parentElement) == "OL")) || (next && ["LI"].includes(getTagName(next))) },
	{ tagName: "DT", accept: next => !next || ["DT", "DD"].includes(getTagName(next)) },
	{ tagName: "P", accept: next => next && ["ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DETAILS", "DIV", "DL", "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER", "FORM", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "TABLE", "UL"].includes(getTagName(next)) },
	{ tagName: "DD", accept: next => !next || ["DT", "DD"].includes(getTagName(next)) },
	{ tagName: "RT", accept: next => !next || ["RT", "RP"].includes(getTagName(next)) },
	{ tagName: "RP", accept: next => !next || ["RT", "RP"].includes(getTagName(next)) },
	{ tagName: "OPTGROUP", accept: next => !next || ["OPTGROUP"].includes(getTagName(next)) },
	{ tagName: "OPTION", accept: next => !next || ["OPTION", "OPTGROUP"].includes(getTagName(next)) },
	{ tagName: "COLGROUP", accept: next => !next || (next.nodeType != Node_COMMENT_NODE && (next.nodeType != Node_TEXT_NODE || !startsWithSpaceChar(next.textContent))) },
	{ tagName: "CAPTION", accept: next => !next || (next.nodeType != Node_COMMENT_NODE && (next.nodeType != Node_TEXT_NODE || !startsWithSpaceChar(next.textContent))) },
	{ tagName: "THEAD", accept: next => !next || ["TBODY", "TFOOT"].includes(getTagName(next)) },
	{ tagName: "TBODY", accept: next => !next || ["TBODY", "TFOOT"].includes(getTagName(next)) },
	{ tagName: "TFOOT", accept: next => !next },
	{ tagName: "TR", accept: next => !next || ["TR"].includes(getTagName(next)) },
	{ tagName: "TD", accept: next => !next || ["TD", "TH"].includes(getTagName(next)) },
	{ tagName: "TH", accept: next => !next || ["TD", "TH"].includes(getTagName(next)) }
];
const TEXT_NODE_TAGS = ["STYLE", "SCRIPT", "XMP", "IFRAME", "NOEMBED", "NOFRAMES", "PLAINTEXT", "NOSCRIPT"];

export {
	process
};

function process(doc, compressHTML) {
	const docType = doc.doctype;
	let docTypeString = "";
	if (docType) {
		docTypeString = "<!DOCTYPE " + docType.nodeName;
		if (docType.publicId) {
			docTypeString += " PUBLIC \"" + docType.publicId + "\"";
			if (docType.systemId)
				docTypeString += " \"" + docType.systemId + "\"";
		} else if (docType.systemId)
			docTypeString += " SYSTEM \"" + docType.systemId + "\"";
		if (docType.internalSubset)
			docTypeString += " [" + docType.internalSubset + "]";
		docTypeString += "> ";
	}
	return docTypeString + serialize(doc.documentElement, compressHTML);
}

function serialize(node, compressHTML, isSVG) {
	if (node.nodeType == Node_TEXT_NODE) {
		return serializeTextNode(node);
	} else if (node.nodeType == Node_COMMENT_NODE) {
		return serializeCommentNode(node);
	} else if (node.nodeType == Node_ELEMENT_NODE) {
		return serializeElement(node, compressHTML, isSVG);
	}
}

function serializeTextNode(textNode) {
	const parentNode = textNode.parentNode;
	let parentTagName;
	if (parentNode && parentNode.nodeType == Node_ELEMENT_NODE) {
		parentTagName = getTagName(parentNode);
	}
	if (!parentTagName || TEXT_NODE_TAGS.includes(parentTagName)) {
		if ((parentTagName == "SCRIPT" && (!parentNode.type || parentNode.type == "text/javascript")) || parentTagName == "STYLE") {
			return textNode.textContent.replace(/<\//gi, "<\\/").replace(/\/>/gi, "\\/>");
		}
		return textNode.textContent;
	} else {
		return textNode.textContent.replace(/&/g, "&amp;").replace(/\u00a0/g, "&nbsp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
	}
}

function serializeCommentNode(commentNode) {
	return "<!--" + commentNode.textContent + "-->";
}

function serializeElement(element, compressHTML, isSVG) {
	const tagName = getTagName(element);
	const omittedStartTag = compressHTML && OMITTED_START_TAGS.find(omittedStartTag => tagName == getTagName(omittedStartTag) && omittedStartTag.accept(element));
	let content = "";
	if (!omittedStartTag || element.attributes.length) {
		content = "<" + tagName.toLowerCase();
		Array.from(element.attributes).forEach(attribute => content += serializeAttribute(attribute, element, compressHTML));
		content += ">";
	}
	if (tagName == "TEMPLATE" && !element.childNodes.length) {
		content += element.innerHTML;
	} else {
		Array.from(element.childNodes).forEach(childNode => content += serialize(childNode, compressHTML, isSVG || tagName == "svg"));
	}
	const omittedEndTag = compressHTML && OMITTED_END_TAGS.find(omittedEndTag => tagName == getTagName(omittedEndTag) && omittedEndTag.accept(element.nextSibling, element));
	if (isSVG || (!omittedEndTag && !VOID_TAG_NAMES.includes(tagName))) {
		content += "</" + tagName.toLowerCase() + ">";
	}
	return content;
}

function serializeAttribute(attribute, element, compressHTML) {
	const name = attribute.name;
	let content = "";
	if (!name.match(/["'>/=]/)) {
		let value = attribute.value;
		if (compressHTML && name == "class") {
			value = Array.from(element.classList).map(className => className.trim()).join(" ");
		}
		let simpleQuotesValue;
		value = value.replace(/&/g, "&amp;").replace(/\u00a0/g, "&nbsp;");
		if (value.includes("\"")) {
			if (value.includes("'") || !compressHTML) {
				value = value.replace(/"/g, "&quot;");
			} else {
				simpleQuotesValue = true;
			}
		}
		const invalidUnquotedValue = !compressHTML || value.match(/[ \t\n\f\r'"`=<>]/);
		content += " ";
		const namespaceURI = attribute.namespaceURI;
		const localName = attribute.localName || name;
		if (!namespaceURI) {
			content += name;
		} else if (namespaceURI == "http://www.w3.org/XML/1998/namespace") {
			content += "xml:" + localName;
		} else if (namespaceURI == "http://www.w3.org/2000/xmlns/") {
			if (localName === "xmlns") {
				content += "xmlns";
			} else {
				content += "xmlns:" + localName;
			}
		} else if (namespaceURI == "http://www.w3.org/1999/xlink") {
			content += "xlink:" + localName;
		} else if (attribute.prefix) {
			content += attribute.prefix + ":" + localName;
		} else {
			content += name;
		}
		if (value != "") {
			content += "=";
			if (invalidUnquotedValue) {
				content += simpleQuotesValue ? "'" : "\"";
			}
			content += value;
			if (invalidUnquotedValue) {
				content += simpleQuotesValue ? "'" : "\"";
			}
		}
	}
	return content;
}

function startsWithSpaceChar(textContent) {
	return Boolean(textContent.match(/^[ \t\n\f\r]/));
}

function getTagName(element) {
	return element.tagName && element.tagName.toUpperCase();
}