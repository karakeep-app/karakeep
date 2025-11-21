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

import * as vendor from "./../vendor/index.js";
import * as modules from "./../modules/index.js";
import * as helper from "./helper.js";

const DEBUG = false;
const ONE_MB = 1024 * 1024;
const PREFIX_CONTENT_TYPE_TEXT = "text/";
const CONTENT_TYPE_EXTENSIONS = {
	"image/svg+xml": ".svg",
	"image/png": ".png",
	"image/gif": ".gif",
	"image/tiff": ".tiff",
	"image/bmp": ".bmp",
	"image/x-icon": ".ico",
	"image/heif": ".heif",
	"image/heic": ".heic",
	"image/avif": ".avif",
	"image/apng": ".apng",
	"image/jpeg": ".jpg",
	"image/webp": ".webp",
	"audio/mpeg": ".mp3",
	"audio/ogg": ".ogg",
	"audio/wav": ".wav",
	"audio/webm": ".webm",
	"video/3gpp": ".3gp",
	"video/3gpp2": ".3g2",
	"video/mpeg": ".mpeg",
	"video/quicktime": ".mov",
	"video/x-msvideo": ".avi",
	"video/webm": ".webm",
	"video/ogg": ".ogv",
	"video/mp4": ".mp4",
	"video/mp2t": ".ts",
	"font/otf": ".otf",
	"font/ttf": ".ttf",
	"font/woff": ".woff",
	"font/woff2": ".woff2",
	"application/vnd.ms-fontobject": ".eot",
	"font/collection": ".ttc"
};
const CONTENT_TYPE_OCTET_STREAM = "application/octet-stream";

const URL = globalThis.URL;
const DOMParser = globalThis.DOMParser;
const Blob = globalThis.Blob;
const FileReader = globalThis.FileReader;
const fetch = (url, options) => {
	options.cache = "force-cache";
	options.referrerPolicy = "strict-origin-when-cross-origin";
	return globalThis.fetch(url, options);
};
const TextDecoder = globalThis.TextDecoder;
const URLSearchParams = globalThis.URLSearchParams;

export {
	getInstance
};

function getInstance(utilOptions) {
	utilOptions = utilOptions || {};
	utilOptions.fetch = utilOptions.fetch || fetch;
	utilOptions.frameFetch = utilOptions.frameFetch || utilOptions.fetch || fetch;
	return {
		getDoctypeString,
		getFilenameExtension(resourceURL, replacedCharacters, replacementCharacter, replacementCharacters) {
			let matchExtension;
			try {
				matchExtension = new URL(resourceURL).pathname.match(/(\.[^\\/.]*)$/);
				// eslint-disable-next-line no-unused-vars
			} catch (error) {
				// ignored
			}
			return ((matchExtension && matchExtension[1] && this.getValidFilename(matchExtension[1], replacedCharacters, replacementCharacter, replacementCharacters)) || "").toLowerCase();
		},
		getContentTypeExtension(contentType) {
			return CONTENT_TYPE_EXTENSIONS[contentType] || "";
		},
		getContent,
		parseURL(resourceURL, baseURI) {
			if (baseURI === undefined) {
				return new URL(resourceURL);
			} else {
				return new URL(resourceURL, baseURI);
			}
		},
		resolveURL(resourceURL, baseURI) {
			return this.parseURL(resourceURL, baseURI).href;
		},
		getSearchParams(searchParams) {
			return Array.from(new URLSearchParams(searchParams));
		},
		getValidFilename(filename, replacedCharacters, replacementCharacter, replacementCharacters) {
			return helper.getValidFilename(filename, replacedCharacters, replacementCharacter, replacementCharacters);
		},
		parseDocContent(content, baseURI) {
			return helper.parseDocContent(content, baseURI);
		},
		parseXMLContent(content) {
			return (new DOMParser()).parseFromString(content, "text/xml");
		},
		parseSVGContent(content) {
			const doc = (new DOMParser()).parseFromString(content, "image/svg+xml");
			if (doc.querySelector("parsererror")) {
				return (new DOMParser()).parseFromString(content, "text/html");
			} else {
				return doc;
			}
		},
		fixInvalidNesting(doc, preventCleanup = true) {
			helper.fixInvalidNesting(doc, helper.NESTING_TRACK_ID_ATTRIBUTE_NAME, preventCleanup);
		},
		markInvalidNesting(doc) {
			helper.markInvalidNesting(doc, helper.NESTING_TRACK_ID_ATTRIBUTE_NAME);
		},
		getFixInvalidNestingSource() {
			return helper.fixInvalidNesting.toString().replace(/\s+/g, " ");
		},
		async digest(algo, text) {
			return helper.digest(algo, text);
		},
		getContentSize(content) {
			return helper.getContentSize(content);
		},
		formatFilename(content, doc, options) {
			return modules.templateFormatter.formatFilename(content, doc, options);
		},
		getMimeType(options) {
			return !options.compressContent || options.selfExtractingArchive ? "text/html" : "application/zip";
		},
		async evalTemplate(template, options, content, doc, context) {
			return modules.templateFormatter.evalTemplate(template, options, content, doc, context);
		},
		minifyHTML(doc, options) {
			return modules.htmlMinifier.process(doc, options);
		},
		minifyCSSRules(doc, stylesheets) {
			return modules.cssRulesMinifier.process(doc, stylesheets);
		},
		removeUnusedFonts(doc, stylesheets, styles, options) {
			return modules.fontsMinifier.process(doc, stylesheets, styles, options);
		},
		compressCSS(content, options) {
			return vendor.cssMinifier.processString(content, options);
		},
		minifyMedias(stylesheets, options) {
			return modules.mediasAltMinifier.process(stylesheets, options);
		},
		removeAlternativeImages(doc) {
			return modules.imagesAltMinifier.process(doc);
		},
		parseSrcset(srcset) {
			return vendor.srcsetParser.process(srcset);
		},
		preProcessDoc(doc, win, options) {
			return helper.preProcessDoc(doc, win, options);
		},
		postProcessDoc(doc, markedElements, invalidElements) {
			helper.postProcessDoc(doc, markedElements, invalidElements);
		},
		serialize(doc, compressHTML) {
			return modules.serializer.process(doc, compressHTML);
		},
		removeQuotes(string) {
			return helper.removeQuotes(string);
		},
		appendInfobar(doc, options) {
			return helper.appendInfobar(doc, options);
		},
		findLast(array, callback) {
			if (array.findLast && typeof array.findLast == "function") {
				return array.findLast(callback);
			} else {
				let index = array.length;
				while (index--) {
					if (callback(array[index], index, array)) {
						return array[index];
					}
				}
			}
		},
		ON_BEFORE_CAPTURE_EVENT_NAME: helper.ON_BEFORE_CAPTURE_EVENT_NAME,
		ON_AFTER_CAPTURE_EVENT_NAME: helper.ON_AFTER_CAPTURE_EVENT_NAME,
		WIN_ID_ATTRIBUTE_NAME: helper.WIN_ID_ATTRIBUTE_NAME,
		REMOVED_CONTENT_ATTRIBUTE_NAME: helper.REMOVED_CONTENT_ATTRIBUTE_NAME,
		HIDDEN_CONTENT_ATTRIBUTE_NAME: helper.HIDDEN_CONTENT_ATTRIBUTE_NAME,
		HIDDEN_FRAME_ATTRIBUTE_NAME: helper.HIDDEN_FRAME_ATTRIBUTE_NAME,
		IMAGE_ATTRIBUTE_NAME: helper.IMAGE_ATTRIBUTE_NAME,
		POSTER_ATTRIBUTE_NAME: helper.POSTER_ATTRIBUTE_NAME,
		VIDEO_ATTRIBUTE_NAME: helper.VIDEO_ATTRIBUTE_NAME,
		CANVAS_ATTRIBUTE_NAME: helper.CANVAS_ATTRIBUTE_NAME,
		STYLE_ATTRIBUTE_NAME: helper.STYLE_ATTRIBUTE_NAME,
		INPUT_VALUE_ATTRIBUTE_NAME: helper.INPUT_VALUE_ATTRIBUTE_NAME,
		INPUT_CHECKED_ATTRIBUTE_NAME: helper.INPUT_CHECKED_ATTRIBUTE_NAME,
		SHADOW_ROOT_ATTRIBUTE_NAME: helper.SHADOW_ROOT_ATTRIBUTE_NAME,
		PRESERVED_SPACE_ELEMENT_ATTRIBUTE_NAME: helper.PRESERVED_SPACE_ELEMENT_ATTRIBUTE_NAME,
		STYLESHEET_ATTRIBUTE_NAME: helper.STYLESHEET_ATTRIBUTE_NAME,
		SELECTED_CONTENT_ATTRIBUTE_NAME: helper.SELECTED_CONTENT_ATTRIBUTE_NAME,
		INVALID_ELEMENT_ATTRIBUTE_NAME: helper.INVALID_ELEMENT_ATTRIBUTE_NAME,
		COMMENT_HEADER: helper.COMMENT_HEADER,
		COMMENT_HEADER_LEGACY: helper.COMMENT_HEADER_LEGACY,
		SINGLE_FILE_UI_ELEMENT_CLASS: helper.SINGLE_FILE_UI_ELEMENT_CLASS,
		EMPTY_RESOURCE: helper.EMPTY_RESOURCE,
		INFOBAR_TAGNAME: helper.INFOBAR_TAGNAME,
		WAIT_FOR_USERSCRIPT_PROPERTY_NAME: helper.WAIT_FOR_USERSCRIPT_PROPERTY_NAME,
		NO_SCRIPT_PROPERTY_NAME: helper.NO_SCRIPT_PROPERTY_NAME,
		NESTING_TRACK_ID_ATTRIBUTE_NAME: helper.NESTING_TRACK_ID_ATTRIBUTE_NAME
	};

	async function getContent(resourceURL, options) {
		let response, startTime, networkTimeoutId, networkTimeoutPromise, resolveNetworkTimeoutPromise;
		const fetchResource = utilOptions.fetch;
		const fetchFrameResource = utilOptions.frameFetch;
		if (DEBUG) {
			startTime = Date.now();
			log("  // STARTED download url =", resourceURL, "asBinary =", options.asBinary);
		}
		if (options.blockMixedContent && /^https:/i.test(options.baseURI) && !/^https:/i.test(resourceURL)) {
			return getFetchResponse(resourceURL, options);
		}
		if (options.networkTimeout) {
			networkTimeoutPromise = new Promise((resolve, reject) => {
				resolveNetworkTimeoutPromise = resolve;
				networkTimeoutId = globalThis.setTimeout(() => reject(new Error("network timeout")), options.networkTimeout);
			});
		} else {
			networkTimeoutPromise = new Promise(resolve => {
				resolveNetworkTimeoutPromise = resolve;
			});
		}
		try {
			const accept = options.acceptHeaders ? options.acceptHeaders[options.expectedType] : "*/*";
			if (options.frameId) {
				try {
					response = await Promise.race([
						fetchFrameResource(resourceURL, { frameId: options.frameId, referrer: options.resourceReferrer, headers: { accept } }),
						networkTimeoutPromise
					]);
					// eslint-disable-next-line no-unused-vars
				} catch (error) {
					response = await Promise.race([
						fetchResource(resourceURL, { headers: { accept } }),
						networkTimeoutPromise
					]);
				}
			} else {
				response = await Promise.race([
					fetchResource(resourceURL, { referrer: options.resourceReferrer, headers: { accept } }),
					networkTimeoutPromise
				]);
			}
			// eslint-disable-next-line no-unused-vars
		} catch (error) {
			return getFetchResponse(resourceURL, options);
		} finally {
			resolveNetworkTimeoutPromise();
			if (options.networkTimeout) {
				globalThis.clearTimeout(networkTimeoutId);
			}
		}
		let buffer;
		try {
			buffer = await response.arrayBuffer();
			// eslint-disable-next-line no-unused-vars
		} catch (error) {
			return options.inline ? { data: options.asBinary ? helper.EMPTY_RESOURCE : "", resourceURL } : { resourceURL };
		}
		resourceURL = response.url || resourceURL;
		let contentType = "", charset;
		try {
			const mimeType = new vendor.MIMEType(response.headers.get("content-type"));
			contentType = mimeType.type + "/" + mimeType.subtype;
			charset = mimeType.parameters.get("charset");
			// eslint-disable-next-line no-unused-vars
		} catch (error) {
			// ignored
		}
		if (!contentType || (contentType == CONTENT_TYPE_OCTET_STREAM && options.asBinary)) {
			contentType = guessMIMEType(options.expectedType, buffer);
			if (!contentType) {
				contentType = options.contentType ? options.contentType : options.asBinary ? CONTENT_TYPE_OCTET_STREAM : "";
			}
		}
		if (!charset && options.charset) {
			charset = options.charset;
		}
		if (options.asBinary) {
			if (response.status >= 400) {
				return getFetchResponse(resourceURL, options);
			}
			try {
				if (DEBUG) {
					log("  // ENDED   download url =", resourceURL, "delay =", Date.now() - startTime);
				}
				if (options.maxResourceSizeEnabled && buffer.byteLength > options.maxResourceSize * ONE_MB) {
					return getFetchResponse(resourceURL, options);
				} else {
					return getFetchResponse(resourceURL, options, buffer, null, contentType);
				}
				// eslint-disable-next-line no-unused-vars
			} catch (error) {
				return getFetchResponse(resourceURL, options);
			}
		} else {
			if (response.status >= 400 || (options.validateTextContentType && contentType && !contentType.startsWith(PREFIX_CONTENT_TYPE_TEXT))) {
				return getFetchResponse(resourceURL, options);
			}
			if (!charset) {
				charset = "utf-8";
			}
			if (DEBUG) {
				log("  // ENDED   download url =", resourceURL, "delay =", Date.now() - startTime);
			}
			if (options.maxResourceSizeEnabled && buffer.byteLength > options.maxResourceSize * ONE_MB) {
				return getFetchResponse(resourceURL, options, null, charset);
			} else {
				try {
					return getFetchResponse(resourceURL, options, buffer, charset, contentType);
					// eslint-disable-next-line no-unused-vars
				} catch (error) {
					return getFetchResponse(resourceURL, options, null, charset);
				}
			}
		}
	}
}

async function getFetchResponse(resourceURL, options, data, charset, contentType) {
	if (data) {
		if (options.asBinary) {
			if (options.inline) {
				const reader = new FileReader();
				reader.readAsDataURL(new Blob([data], { type: contentType + (options.charset ? ";charset=" + options.charset : "") }));
				data = await new Promise((resolve, reject) => {
					reader.addEventListener("load", () => resolve(reader.result), false);
					reader.addEventListener("error", reject, false);
				});
			} else {
				data = new Uint8Array(data);
			}
		} else {
			const firstBytes = new Uint8Array(data.slice(0, 4));
			if (firstBytes[0] == 132 && firstBytes[1] == 49 && firstBytes[2] == 149 && firstBytes[3] == 51) {
				charset = "gb18030";
			} else if (firstBytes[0] == 255 && firstBytes[1] == 254) {
				charset = "utf-16le";
			} else if (firstBytes[0] == 254 && firstBytes[1] == 255) {
				charset = "utf-16be";
			}
			try {
				data = new TextDecoder(charset).decode(data);
				// eslint-disable-next-line no-unused-vars
			} catch (error) {
				charset = "utf-8";
				data = new TextDecoder(charset).decode(data);
			}
			data = data.replace(/\ufeff/gi, "");
		}
	} else if (options.inline) {
		data = options.asBinary ? helper.EMPTY_RESOURCE : "";
	}
	return { data, resourceURL, charset, contentType };
}

function guessMIMEType(expectedType, buffer) {
	if (expectedType == "image") {
		if (compareBytes([255, 255, 255, 255], [0, 0, 1, 0])) {
			return "image/x-icon";
		}
		if (compareBytes([255, 255, 255, 255], [0, 0, 2, 0])) {
			return "image/x-icon";
		}
		if (compareBytes([255, 255], [78, 77])) {
			return "image/bmp";
		}
		if (compareBytes([255, 255, 255, 255, 255, 255], [71, 73, 70, 56, 57, 97])) {
			return "image/gif";
		}
		if (compareBytes([255, 255, 255, 255, 255, 255], [71, 73, 70, 56, 59, 97])) {
			return "image/gif";
		}
		if (compareBytes([255, 255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255, 255, 255], [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80, 86, 80])) {
			return "image/webp";
		}
		if (compareBytes([255, 255, 255, 255, 255, 255, 255, 255], [137, 80, 78, 71, 13, 10, 26, 10])) {
			return "image/png";
		}
		if (compareBytes([255, 255, 255], [255, 216, 255])) {
			return "image/jpeg";
		}
	}
	if (expectedType == "font") {
		if (compareBytes([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255],
			[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 76, 80])) {
			return "application/vnd.ms-fontobject";
		}
		if (compareBytes([255, 255, 255, 255], [0, 1, 0, 0])) {
			return "font/ttf";
		}
		if (compareBytes([255, 255, 255, 255], [79, 84, 84, 79])) {
			return "font/otf";
		}
		if (compareBytes([255, 255, 255, 255], [116, 116, 99, 102])) {
			return "font/collection";
		}
		if (compareBytes([255, 255, 255, 255], [119, 79, 70, 70])) {
			return "font/woff";
		}
		if (compareBytes([255, 255, 255, 255], [119, 79, 70, 50])) {
			return "font/woff2";
		}
	}
	if (expectedType == "video") {
		if (compareBytes([0, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255], [0, 0, 0, 0, 102, 116, 121, 112, 105, 115, 111, 109])) {
			return "video/mp4";
		}
		if (compareBytes([255, 255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255], [82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69])) {
			return "video/x-msvideo";
		}
		if (compareBytes([255, 255, 255, 255], [0, 0, 1, 179]) || compareBytes([255, 255, 255, 255], [0, 0, 1, 186])) {
			return "video/mpeg";
		}
		if (compareBytes([255, 255, 255, 255], [79, 103, 103, 83])) {
			return "video/ogg";
		}
		if (compareBytes([255], [71])) {
			return "video/mp2t";
		}
		if (compareBytes([255, 255, 255, 255], [26, 69, 223, 163])) {
			return "video/webm";
		}
		if (compareBytes([0, 0, 0, 0, 255, 255, 255, 255, 255, 255], [0, 0, 0, 0, 102, 116, 121, 112, 51, 103])) {
			return "video/3gpp";
		}
	}
	if (expectedType == "audio") {
		if (compareBytes([255, 255], [255, 249]) || compareBytes([255, 255], [255, 254])) {
			return "audio/aac";
		}
		if (compareBytes([255, 255, 255, 255], [77, 84, 104, 100])) {
			return "audio/midi";
		}
		if (compareBytes([255, 255, 255, 255], [0, 0, 1, 179]) || compareBytes([255, 255, 255, 255], [0, 0, 1, 186])) {
			return "audio/mpeg";
		}
		if (compareBytes([255, 255], [255, 251]) || compareBytes([255, 255], [255, 243]) || compareBytes([255, 255], [255, 242]) || compareBytes([255, 255, 255], [73, 68, 51])) {
			return "audio/mpeg";
		}
		if (compareBytes([255, 255, 255, 255], [79, 103, 103, 83])) {
			return "audio/ogg";
		}
		if (compareBytes([255, 255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255], [82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69])) {
			return "audio/wav";
		}
		if (compareBytes([255, 255, 255, 255], [26, 69, 223, 163])) {
			return "audio/webm";
		}
		if (compareBytes([0, 0, 0, 0, 255, 255, 255, 255, 255, 255], [0, 0, 0, 0, 102, 116, 121, 112, 51, 103])) {
			return "audio/3gpp";
		}
	}

	function compareBytes(mask, pattern) {
		let patternMatch = true, index = 0;
		if (buffer.byteLength >= pattern.length) {
			const value = new Uint8Array(buffer, 0, mask.length);
			for (index = 0; index < mask.length && patternMatch; index++) {
				patternMatch = patternMatch && ((value[index] & mask[index]) == pattern[index]);
			}
			return patternMatch;
		}
	}
}

function getDoctypeString(doc) {
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
	return docTypeString;
}

function log(...args) {
	console.log("S-File <browser>", ...args); // eslint-disable-line no-console
}