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

import {
	normalizeFontFamily,
	getFontWeight
} from "./../helper.js";

const DATA_URI_PREFIX = "data:";
const ABOUT_BLANK_URI = "about:blank";
const REGEXP_URL_HASH = /(#.+?)$/;
const BLOB_URI_PREFIX = "blob:";
const HTTP_URI_PREFIX = /^https?:\/\//;
const FILE_URI_PREFIX = /^file:\/\//;
const EMPTY_URL = /^https?:\/\/+\s*$/;
const NOT_EMPTY_URL = /^(https?:\/\/|file:\/\/|blob:).+/;
const PREFIX_DATA_URI_IMAGE_SVG = "data:image/svg+xml";
const UTF8_CHARSET = "utf-8";
const REGEXP_URL_FUNCTION = /(url|local|-sf-url-original)\(.*?\)\s*(,|$)/g;
const REGEXP_URL_SIMPLE_QUOTES_FN = /url\s*\(\s*'(.*?)'\s*\)/i;
const REGEXP_URL_DOUBLE_QUOTES_FN = /url\s*\(\s*"(.*?)"\s*\)/i;
const REGEXP_URL_NO_QUOTES_FN = /url\s*\(\s*(.*?)\s*\)/i;
const REGEXP_SIMPLE_QUOTES_STRING = /^'(.*?)'$/;
const REGEXP_DOUBLE_QUOTES_STRING = /^"(.*?)"$/;
const REGEXP_URL_FUNCTION_WOFF = /^url\(\s*["']?data:font\/(woff2?)/;
const REGEXP_URL_FUNCTION_WOFF_ALT = /^url\(\s*["']?data:application\/x-font-(woff)/;
const REGEXP_FONT_FORMAT = /\.([^.?#]+)((\?|#).*?)?$/;
const REGEXP_FONT_FORMAT_VALUE = /format\((.*?)\)\s*,?$/;
const REGEXP_FONT_SRC = /(.*?)\s*,?$/;
const MEDIA_ALL = "all";
const FONT_STRETCHES = {
	"ultra-condensed": "50%",
	"extra-condensed": "62.5%",
	"condensed": "75%",
	"semi-condensed": "87.5%",
	"normal": "100%",
	"semi-expanded": "112.5%",
	"expanded": "125%",
	"extra-expanded": "150%",
	"ultra-expanded": "200%"
};
const Blob = globalThis.Blob;
const FileReader = globalThis.FileReader;

let util, cssTree;

export {
	getProcessorHelperCommonClass,
	getUpdatedResourceContent,
	normalizeURL,
	matchCharsetEquals,
	getCharset,
	getUrlFunctions,
	getImportFunctions,
	isDataURL,
	replaceOriginalURLs,
	testIgnoredPath,
	testValidPath,
	testValidURL,
	toDataURI
};

function getProcessorHelperCommonClass(utilInstance, cssTreeInstance) {
	util = utilInstance;
	cssTree = cssTreeInstance;
	return ProcessorHelperCommon;
}

class ProcessorHelperCommon {
	async processPageResources(doc, baseURI, options, resources, styles, batchRequest) {
		const processAttributeArgs = [
			["link[href][rel*=\"icon\"]", "href", true],
			["object[type=\"image/svg+xml\"], object[type=\"image/svg-xml\"], object[data*=\".svg\"]", "data"],
			["img[src], input[src][type=image]", "src", false, true],
			["embed[src*=\".svg\"]", "src"],
			["video[poster]", "poster"],
			["*[background]", "background"],
			["image", "xlink:href"],
			["image", "href"]
		];
		if (options.blockImages) {
			doc.querySelectorAll("svg").forEach(element => element.remove());
		}
		let resourcePromises = processAttributeArgs.map(([selector, attributeName, removeElementIfMissing, processDuplicates]) =>
			this.processAttribute(doc.querySelectorAll(selector), attributeName, baseURI, options, "image", resources, removeElementIfMissing, batchRequest, styles, processDuplicates)
		);
		resourcePromises = resourcePromises.concat([
			this.processXLinks(doc.querySelectorAll("use"), doc, baseURI, options, batchRequest),
			this.processSrcset(doc.querySelectorAll("img[srcset], source[srcset]"), baseURI, options, resources, batchRequest)
		]);
		resourcePromises.push(this.processAttribute(doc.querySelectorAll("object[data*=\".pdf\"]"), "data", baseURI, options, null, resources, false, batchRequest, styles));
		resourcePromises.push(this.processAttribute(doc.querySelectorAll("embed[src*=\".pdf\"]"), "src", baseURI, options, null, resources, false, batchRequest, styles));
		resourcePromises.push(this.processAttribute(doc.querySelectorAll("audio[src], audio > source[src]"), "src", baseURI, options, "audio", resources, false, batchRequest, styles));
		resourcePromises.push(this.processAttribute(doc.querySelectorAll("video[src], video > source[src]"), "src", baseURI, options, "video", resources, false, batchRequest, styles));
		resourcePromises.push(this.processAttribute(doc.querySelectorAll("audio track[src], video track[src]"), "src", baseURI, options, null, resources, false, batchRequest, styles));
		resourcePromises.push(this.processAttribute(doc.querySelectorAll("model[src]"), "src", baseURI, options, null, resources, false, batchRequest, styles));
		await Promise.all(resourcePromises);
		if (options.saveFavicon) {
			this.processShortcutIcons(doc);
		}
	}

	async processXLinks(resourceElements, doc, baseURI, options, batchRequest) {
		let attributeName = "xlink:href";
		await Promise.all(Array.from(resourceElements).map(async resourceElement => {
			let originalResourceURL = resourceElement.getAttribute(attributeName);
			if (originalResourceURL == null) {
				attributeName = "href";
				originalResourceURL = resourceElement.getAttribute(attributeName);
			}
			if (options.saveOriginalURLs && !isDataURL(originalResourceURL)) {
				resourceElement.setAttribute("data-sf-original-href", originalResourceURL);
			}
			let resourceURL = normalizeURL(originalResourceURL);
			if (!options.blockImages) {
				if (testValidPath(resourceURL) && !testIgnoredPath(resourceURL)) {
					resourceElement.setAttribute(attributeName, util.EMPTY_RESOURCE);
					try {
						resourceURL = util.resolveURL(resourceURL, baseURI);
						// eslint-disable-next-line no-unused-vars
					} catch (error) {
						// ignored
					}
					if (testValidURL(resourceURL)) {
						const hashMatch = originalResourceURL.match(REGEXP_URL_HASH);
						if (originalResourceURL.startsWith(baseURI + "#")) {
							resourceElement.setAttribute(attributeName, hashMatch[0]);
						} else {
							const response = await batchRequest.addURL(resourceURL, { expectedType: "image" });
							const svgDoc = util.parseSVGContent(response.content);
							if (hashMatch && hashMatch[0]) {
								let symbolElement;
								try {
									symbolElement = svgDoc.querySelector(hashMatch[0]);
									// eslint-disable-next-line no-unused-vars
								} catch (error) {
									// ignored
								}
								if (symbolElement) {
									resourceElement.setAttribute(attributeName, hashMatch[0]);
									resourceElement.parentElement.insertBefore(symbolElement, resourceElement.parentElement.firstChild);
								}
							} else {
								resourceElement.setAttribute(attributeName, PREFIX_DATA_URI_IMAGE_SVG + "," + response.content);
							}
						}
					}
				} else if (resourceURL == options.url) {
					resourceElement.setAttribute(attributeName, originalResourceURL.substring(resourceURL.length));
				}
			} else {
				resourceElement.setAttribute(attributeName, util.EMPTY_RESOURCE);
			}
		}));
	}

	async processStylesheet(cssRules, baseURI, options, resources, batchRequest) {
		const promises = [];
		const removedRules = [];
		const processorHelper = this;
		for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
			const ruleData = cssRule.data;
			if (ruleData.type == "Atrule" && ruleData.name == "charset") {
				removedRules.push(cssRule);
			} else if (ruleData.block && ruleData.block.children) {
				if (ruleData.type == "Rule") {
					promises.push(processorHelper.processStyle(ruleData, options, resources, batchRequest));
				} else if (ruleData.type == "Atrule" && (ruleData.name == "media" || ruleData.name == "supports" || ruleData.name == "layer" || ruleData.name == "container")) {
					promises.push(processorHelper.processStylesheet(ruleData.block.children, baseURI, options, resources, batchRequest));
				} else if (ruleData.type == "Atrule" && ruleData.name == "font-face") {
					promises.push(processFontFaceRule(ruleData));
				}
			}
		}
		removedRules.forEach(cssRule => cssRules.remove(cssRule));
		await Promise.all(promises);

		async function processFontFaceRule(ruleData) {
			const urls = getUrlFunctions(ruleData);
			await Promise.all(urls.map(async urlNode => {
				const originalResourceURL = urlNode.value;
				if (!options.blockFonts) {
					const resourceURL = normalizeURL(originalResourceURL);
					if (!testIgnoredPath(resourceURL) && testValidURL(resourceURL)) {
						await processorHelper.processFont(resourceURL, urlNode, originalResourceURL, baseURI, options, resources, batchRequest);
					}
				} else {
					urlNode.value = util.EMPTY_RESOURCE;
				}
			}));
		}
	}

	async processSrcset(resourceElements, baseURI, options, resources, batchRequest) {
		await Promise.all(Array.from(resourceElements).map(async resourceElement => {
			const originSrcset = resourceElement.getAttribute("srcset");
			const srcset = util.parseSrcset(originSrcset);
			if (options.saveOriginalURLs && !isDataURL(originSrcset)) {
				resourceElement.setAttribute("data-sf-original-srcset", originSrcset);
			}
			if (!options.blockImages && !options.blockAlternativeImages) {
				const srcsetValues = await Promise.all(srcset.map(async srcsetValue => {
					let resourceURL = normalizeURL(srcsetValue.url);
					if (!testIgnoredPath(resourceURL)) {
						if (testValidPath(resourceURL)) {
							try {
								resourceURL = util.resolveURL(resourceURL, baseURI);
								// eslint-disable-next-line no-unused-vars
							} catch (error) {
								// ignored
							}
							if (testValidURL(resourceURL)) {
								return this.processImageSrcset(resourceURL, srcsetValue, resources, batchRequest);
							} else {
								return "";
							}
						} else {
							return "";
						}
					} else {
						return resourceURL + (srcsetValue.w ? " " + srcsetValue.w + "w" : srcsetValue.d ? " " + srcsetValue.d + "x" : "");
					}
				}));
				resourceElement.setAttribute("srcset", srcsetValues.join(", "));
			} else {
				resourceElement.setAttribute("srcset", "");
			}
		}));
	}

	setBackgroundImage(element, url, style) {
		element.style.setProperty("background-blend-mode", "normal", "important");
		element.style.setProperty("background-clip", "content-box", "important");
		element.style.setProperty("background-position", style && style["background-position"] ? style["background-position"] : "center", "important");
		element.style.setProperty("background-color", style && style["background-color"] ? style["background-color"] : "transparent", "important");
		element.style.setProperty("background-image", url, "important");
		element.style.setProperty("background-size", style && style["background-size"] ? style["background-size"] : "100% 100%", "important");
		element.style.setProperty("background-origin", "content-box", "important");
		element.style.setProperty("background-repeat", "no-repeat", "important");
	}

	async getStylesheetContent(resourceURL, options) {
		const content = await util.getContent(resourceURL, {
			inline: !options.compressContent,
			maxResourceSize: options.maxResourceSize,
			maxResourceSizeEnabled: options.maxResourceSizeEnabled,
			validateTextContentType: true,
			frameId: options.frameId,
			charset: options.charset,
			resourceReferrer: options.resourceReferrer,
			baseURI: options.baseURI,
			blockMixedContent: options.blockMixedContent,
			expectedType: "stylesheet",
			acceptHeaders: options.acceptHeaders,
			networkTimeout: options.networkTimeout
		});
		if (!(matchCharsetEquals(content.data, content.charset) || matchCharsetEquals(content.data, options.charset))) {
			options = Object.assign({}, options, { charset: getCharset(content.data) });
			return util.getContent(resourceURL, {
				inline: !options.compressContent,
				maxResourceSize: options.maxResourceSize,
				maxResourceSizeEnabled: options.maxResourceSizeEnabled,
				validateTextContentType: true,
				frameId: options.frameId,
				charset: options.charset,
				resourceReferrer: options.resourceReferrer,
				baseURI: options.baseURI,
				blockMixedContent: options.blockMixedContent,
				expectedType: "stylesheet",
				acceptHeaders: options.acceptHeaders,
				networkTimeout: options.networkTimeout
			});
		} else {
			return content;
		}
	}

	processShortcutIcons(doc) {
		let shortcutIcon = findShortcutIcon(Array.from(doc.querySelectorAll("link[href][rel=\"shortcut icon\"]")));
		if (!shortcutIcon) {
			shortcutIcon = findShortcutIcon(Array.from(doc.querySelectorAll("link[href][rel=\"icon\"]")));
		}
		if (!shortcutIcon) {
			shortcutIcon = findShortcutIcon(Array.from(doc.querySelectorAll("link[href][rel*=\"icon\"]")));
			if (shortcutIcon) {
				shortcutIcon.rel = "shortcut icon";
			}
		}
		if (shortcutIcon) {
			doc.querySelectorAll("link[href][rel*=\"icon\"]").forEach(linkElement => {
				if (linkElement != shortcutIcon) {
					linkElement.remove();
				}
			});
		}
	}

	removeSingleLineCssComments(stylesheet) {
		if (stylesheet.children) {
			const removedRules = [];
			for (let cssRule = stylesheet.children.head; cssRule; cssRule = cssRule.next) {
				const ruleData = cssRule.data;
				if (ruleData.type == "Raw" && ruleData.value && ruleData.value.trim().startsWith("//")) {
					removedRules.push(cssRule);
				}
			}
			removedRules.forEach(cssRule => stylesheet.children.remove(cssRule));
		}
	}

	replacePseudoClassDefined(stylesheet) {
		cssTree.walk(stylesheet, {
			enter: function(node, item, list) {
				if (node.type == "PseudoClassSelector" && node.name == "defined") {
					if (item.prev == null || item.prev.data.type == "Combinator" || item.prev.data.type == "WhiteSpace") {
						list.replace(item, cssTree.parse("*", { context: "selector" }).children.head);
					} else {
						list.remove(item);
					}
				}
			}
		});
	}

	resolveStylesheetURLs(stylesheet, baseURI, workStylesheet) {
		const urls = getUrlFunctions(stylesheet);
		urls.map(urlNode => {
			const originalResourceURL = urlNode.value;
			let resourceURL = normalizeURL(originalResourceURL);
			if (!testIgnoredPath(resourceURL)) {
				workStylesheet.textContent = "tmp { content:\"" + resourceURL + "\"}";
				if (workStylesheet.sheet && workStylesheet.sheet.cssRules) {
					resourceURL = util.removeQuotes(workStylesheet.sheet.cssRules[0].style.getPropertyValue("content"));
				}
				if (!testIgnoredPath(resourceURL)) {
					if (!resourceURL || testValidPath(resourceURL)) {
						let resolvedURL;
						if (!originalResourceURL.startsWith("#")) {
							try {
								resolvedURL = util.resolveURL(resourceURL, baseURI);
								// eslint-disable-next-line no-unused-vars
							} catch (error) {
								// ignored
							}
						}
						if (testValidURL(resolvedURL)) {
							urlNode.value = resolvedURL;
						}
					} else {
						urlNode.value = util.EMPTY_RESOURCE;
					}
				}
			}
		});
	}

	async removeAlternativeFonts(doc, stylesheets, fonts, fontTests) {
		const fontsDetails = {
			fonts: new Map(),
			medias: new Map(),
			supports: new Map(),
			layers: new Map()
		};
		const stats = { rules: { processed: 0, discarded: 0 }, fonts: { processed: 0, discarded: 0 } };
		let sheetIndex = 0;
		stylesheets.forEach(stylesheetInfo => {
			if (stylesheetInfo.stylesheet) {
				const cssRules = stylesheetInfo.stylesheet.children;
				if (cssRules) {
					stats.rules.processed += cssRules.size;
					stats.rules.discarded += cssRules.size;
					if (stylesheetInfo.mediaText && stylesheetInfo.mediaText != MEDIA_ALL) {
						const mediaFontsDetails = this.createFontsDetailsInfo();
						fontsDetails.medias.set("media-" + sheetIndex + "-" + stylesheetInfo.mediaText, mediaFontsDetails);
						this.getFontsDetails(doc, cssRules, sheetIndex, mediaFontsDetails);
					} else {
						this.getFontsDetails(doc, cssRules, sheetIndex, fontsDetails);
					}
				}
			}
			sheetIndex++;
		});
		processFontDetails(fontsDetails);
		await Promise.all([...stylesheets].map(async ([, stylesheetInfo], sheetIndex) => {
			if (stylesheetInfo.stylesheet) {
				const cssRules = stylesheetInfo.stylesheet.children;
				const media = stylesheetInfo.mediaText;
				if (cssRules) {
					if (media && media != MEDIA_ALL) {
						await this.processFontFaceRules(cssRules, sheetIndex, fontsDetails.medias.get("media-" + sheetIndex + "-" + media), fonts, fontTests, stats);
					} else {
						await this.processFontFaceRules(cssRules, sheetIndex, fontsDetails, fonts, fontTests, stats);
					}
					stats.rules.discarded -= cssRules.size;
				}
			}
		}));
		return stats;
	}

	async processFontFaceRules(cssRules, sheetIndex, fontsDetails, fonts, fontTests, stats) {
		const removedRules = [];
		let mediaIndex = 0, supportsIndex = 0, layerIndex = 0;
		for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
			const ruleData = cssRule.data;
			if (ruleData.type == "Atrule" && ruleData.name == "media" && ruleData.block && ruleData.block.children && ruleData.prelude) {
				const mediaText = cssTree.generate(ruleData.prelude);
				await this.processFontFaceRules(ruleData.block.children, sheetIndex, fontsDetails.medias.get("media-" + sheetIndex + "-" + mediaIndex + "-" + mediaText), fonts, fontTests, stats);
				mediaIndex++;
			} else if (ruleData.type == "Atrule" && ruleData.name == "supports" && ruleData.block && ruleData.block.children && ruleData.prelude) {
				const supportsText = cssTree.generate(ruleData.prelude);
				await this.processFontFaceRules(ruleData.block.children, sheetIndex, fontsDetails.supports.get("supports-" + sheetIndex + "-" + supportsIndex + "-" + supportsText), fonts, fontTests, stats);
				supportsIndex++;
			} else if (ruleData.type == "Atrule" && ruleData.name == "layer" && ruleData.block && ruleData.block.children && ruleData.prelude) {
				const layerText = cssTree.generate(ruleData.prelude);
				await this.processFontFaceRules(ruleData.block.children, sheetIndex, fontsDetails.layers.get("layer-" + sheetIndex + "-" + layerIndex + "-" + layerText), fonts, fontTests, stats);
				layerIndex++;
			} else if (ruleData.type == "Atrule" && ruleData.name == "font-face") {
				const key = this.getFontKey(ruleData);
				const fontInfo = fontsDetails.fonts.get(key);
				if (fontInfo) {
					await this.processFontFaceRule(ruleData, fontInfo, fonts, fontTests, stats);
				} else {
					removedRules.push(cssRule);
				}
			}
		}
		removedRules.forEach(cssRule => cssRules.remove(cssRule));
	}

	getFontsDetails(doc, cssRules, sheetIndex, mediaFontsDetails) {
		let mediaIndex = 0, supportsIndex = 0, layerIndex = 0;
		cssRules.forEach(ruleData => {
			if (ruleData.type == "Atrule" && ruleData.name == "media" && ruleData.block && ruleData.block.children && ruleData.prelude) {
				const mediaText = cssTree.generate(ruleData.prelude);
				const fontsDetails = this.createFontsDetailsInfo();
				mediaFontsDetails.medias.set("media-" + sheetIndex + "-" + mediaIndex + "-" + mediaText, fontsDetails);
				mediaIndex++;
				this.getFontsDetails(doc, ruleData.block.children, sheetIndex, fontsDetails);
			} else if (ruleData.type == "Atrule" && ruleData.name == "supports" && ruleData.block && ruleData.block.children && ruleData.prelude) {
				const supportsText = cssTree.generate(ruleData.prelude);
				const fontsDetails = this.createFontsDetailsInfo();
				mediaFontsDetails.supports.set("supports-" + sheetIndex + "-" + supportsIndex + "-" + supportsText, fontsDetails);
				supportsIndex++;
				this.getFontsDetails(doc, ruleData.block.children, sheetIndex, fontsDetails);
			} else if (ruleData.type == "Atrule" && ruleData.name == "layer" && ruleData.block && ruleData.block.children && ruleData.prelude) {
				const layerText = cssTree.generate(ruleData.prelude);
				const fontsDetails = this.createFontsDetailsInfo();
				mediaFontsDetails.layers.set("layer-" + sheetIndex + "-" + layerIndex + "-" + layerText, fontsDetails);
				layerIndex++;
				this.getFontsDetails(doc, ruleData.block.children, sheetIndex, fontsDetails);
			} else if (ruleData.type == "Atrule" && ruleData.name == "font-face" && ruleData.block && ruleData.block.children) {
				const fontKey = this.getFontKey(ruleData);
				let fontInfo = mediaFontsDetails.fonts.get(fontKey);
				if (!fontInfo) {
					fontInfo = [];
					mediaFontsDetails.fonts.set(fontKey, fontInfo);
				}
				const src = this.getPropertyValue(ruleData, "src");
				if (src) {
					const fontSources = src.match(REGEXP_URL_FUNCTION);
					if (fontSources) {
						fontSources.forEach(source => {
							if (fontInfo.includes(source)) {
								fontInfo.splice(fontInfo.indexOf(source), 1);
							}
							fontInfo.unshift(source);
						});
					}
				}
			}
		});
	}

	createFontsDetailsInfo() {
		return {
			fonts: new Map(),
			medias: new Map(),
			supports: new Map(),
			layers: new Map()
		};
	}

	getFontKey(ruleData) {
		return JSON.stringify([
			normalizeFontFamily(this.getPropertyValue(ruleData, "font-family")),
			getFontWeight(this.getPropertyValue(ruleData, "font-weight") || "400"),
			this.getPropertyValue(ruleData, "font-style") || "normal",
			this.getPropertyValue(ruleData, "unicode-range"),
			getFontStretch(this.getPropertyValue(ruleData, "font-stretch")),
			this.getPropertyValue(ruleData, "font-variant") || "normal",
			this.getPropertyValue(ruleData, "font-feature-settings"),
			this.getPropertyValue(ruleData, "font-variation-settings")
		]);
	}

	getPropertyValue(ruleData, propertyName) {
		let property;
		if (ruleData.block.children) {
			property = ruleData.block.children.filter(node => {
				try {
					return node.property == propertyName && !cssTree.generate(node.value).match(/\\9$/);
					// eslint-disable-next-line no-unused-vars
				} catch (error) {
					return node.property == propertyName;
				}
			}).tail;
		}
		if (property) {
			try {
				return cssTree.generate(property.data.value);
				// eslint-disable-next-line no-unused-vars
			} catch (error) {
				// ignored
			}
		}
	}
}

function processFontDetails(fontsDetails, fontResources) {
	fontsDetails.fonts.forEach((fontInfo, fontKey) => {
		fontsDetails.fonts.set(fontKey, fontInfo.map(fontSource => {
			const fontFormatMatch = fontSource.match(REGEXP_FONT_FORMAT_VALUE);
			let fontFormat;
			const fontUrl = getURL(fontSource);
			if (fontFormatMatch && fontFormatMatch[1]) {
				fontFormat = fontFormatMatch[1].replace(REGEXP_SIMPLE_QUOTES_STRING, "$1").replace(REGEXP_DOUBLE_QUOTES_STRING, "$1").toLowerCase();
			}
			if (!fontFormat) {
				const fontFormatMatch = fontSource.match(REGEXP_URL_FUNCTION_WOFF);
				if (fontFormatMatch && fontFormatMatch[1]) {
					fontFormat = fontFormatMatch[1];
				} else {
					const fontFormatMatch = fontSource.match(REGEXP_URL_FUNCTION_WOFF_ALT);
					if (fontFormatMatch && fontFormatMatch[1]) {
						fontFormat = fontFormatMatch[1];
					}
				}
			}
			if (!fontFormat && fontUrl) {
				const fontFormatMatch = fontUrl.match(REGEXP_FONT_FORMAT);
				if (fontFormatMatch && fontFormatMatch[1]) {
					fontFormat = fontFormatMatch[1];
				}
			}
			if (fontResources) {
				const fontResource = Array.from(fontResources.values()).find(info => info.name == fontUrl);
				return { src: fontSource.match(REGEXP_FONT_SRC)[1], fontUrl, format: fontFormat, contentType: fontResource && fontResource.contentType };
			} else {
				return { src: fontSource.match(REGEXP_FONT_SRC)[1], fontUrl, format: fontFormat };
			}
		}));
	});
	if (fontResources) {
		fontsDetails.medias.forEach(mediaFontsDetails => processFontDetails(mediaFontsDetails, fontResources));
		fontsDetails.supports.forEach(supportsFontsDetails => processFontDetails(supportsFontsDetails, fontResources));
		fontsDetails.layers.forEach(layerFontsDetails => processFontDetails(layerFontsDetails, fontResources));
	} else {
		fontsDetails.medias.forEach(mediaFontsDetails => processFontDetails(mediaFontsDetails));
		fontsDetails.supports.forEach(supportsFontsDetails => processFontDetails(supportsFontsDetails));
		fontsDetails.layers.forEach(layerFontsDetails => processFontDetails(layerFontsDetails));
	}
}

function getUpdatedResourceContent(resourceURL, options) {
	if (options.rootDocument && options.updatedResources[resourceURL]) {
		options.updatedResources[resourceURL].retrieved = true;
		return options.updatedResources[resourceURL].content;
	}
}

function normalizeURL(url) {
	if (!url || url.startsWith(DATA_URI_PREFIX)) {
		return url;
	} else {
		return url.split("#")[0];
	}
}

function matchCharsetEquals(stylesheetContent = "", charset = UTF8_CHARSET) {
	const stylesheetCharset = getCharset(stylesheetContent);
	if (stylesheetCharset) {
		return stylesheetCharset == charset.toLowerCase();
	} else {
		return true;
	}
}

function getCharset(stylesheetContent = "") {
	const match = stylesheetContent.match(/^@charset\s+"([^"]*)";/i);
	if (match && match[1]) {
		return match[1].toLowerCase().trim();
	}
}

function getUrlFunctions(declarationList) {
	return cssTree.findAll(declarationList, node => node.type == "Url");
}

function getImportFunctions(declarationList) {
	return cssTree.findAll(declarationList, node => node.type == "Atrule" && node.name == "import");
}

function findShortcutIcon(shortcutIcons) {
	shortcutIcons = shortcutIcons.filter(linkElement => linkElement.href != util.EMPTY_RESOURCE);
	shortcutIcons.sort((linkElement1, linkElement2) => (parseInt(linkElement2.sizes, 10) || 16) - (parseInt(linkElement1.sizes, 10) || 16));
	return shortcutIcons[0];
}

function isDataURL(url) {
	return url && (url.startsWith(DATA_URI_PREFIX) || url.startsWith(BLOB_URI_PREFIX));
}

function replaceOriginalURLs(stylesheetContent) {
	return stylesheetContent.replace(/url\(-sf-url-original\\\(\\"(.*?)\\"\\\)\\ /g, "/* original URL: $1 */url(");
}

function testIgnoredPath(resourceURL) {
	return resourceURL && (resourceURL.startsWith(DATA_URI_PREFIX) || resourceURL == ABOUT_BLANK_URI);
}

function testValidPath(resourceURL) {
	return resourceURL && !resourceURL.match(EMPTY_URL);
}

function testValidURL(resourceURL) {
	return testValidPath(resourceURL) && (resourceURL.match(HTTP_URI_PREFIX) || resourceURL.match(FILE_URI_PREFIX) || resourceURL.startsWith(BLOB_URI_PREFIX)) && resourceURL.match(NOT_EMPTY_URL);
}

function getURL(urlFunction) {
	urlFunction = urlFunction.replace(/url\(-sf-url-original\\\(\\"(.*?)\\"\\\)\\ /g, "");
	const urlMatch = urlFunction.match(REGEXP_URL_SIMPLE_QUOTES_FN) ||
		urlFunction.match(REGEXP_URL_DOUBLE_QUOTES_FN) ||
		urlFunction.match(REGEXP_URL_NO_QUOTES_FN);
	return urlMatch && urlMatch[1];
}

function getFontStretch(stretch) {
	return FONT_STRETCHES[stretch] || stretch;
}

function toDataURI(content, contentType, charset) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = () => reject(new Error(reader.error));
		reader.readAsDataURL(new Blob([content], { type: (contentType || "") + (charset ? ";charset=" + charset : "") }));
	});
}