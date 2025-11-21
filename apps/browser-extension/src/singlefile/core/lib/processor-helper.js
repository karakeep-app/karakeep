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

import * as cssTree from "./../../vendor/css-tree.js";

const JSON = globalThis.JSON;
const FontFace = globalThis.FontFace;

const ABOUT_BLANK_URI = "about:blank";
const UTF8_CHARSET = "utf-8";
const SCRIPT_TAG_FOUND = /<script/gi;
const NOSCRIPT_TAG_FOUND = /<noscript/gi;
const CANVAS_TAG_FOUND = /<canvas/gi;
const EMPTY_URL_SOURCE = /^url\(["']?data:[^,]*,?["']?\)/;
const LOCAL_SOURCE = "local(";
const FONT_MAX_LOAD_DELAY = 5000;

let util;

import {
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
	testValidURL
} from "./processor-helper-common.js";

export {
	getProcessorHelperClass,
	cssTree
};

function getProcessorHelperClass(utilInstance) {
	util = utilInstance;
	const ProcessorHelperCommon = getProcessorHelperCommonClass(util, cssTree);

	return class ProcessorHelper extends ProcessorHelperCommon {
		async resolveStylesheets(element, stylesheetInfo, stylesheets, baseURI, options, workStyleElement, resources) {
			if (element.tagName.toUpperCase() == "LINK") {
				element.removeAttribute("integrity");
				if (element.charset) {
					options.charset = element.charset;
				}
				stylesheetInfo.url = element.href;
			}
			await this.resolveStylesheetElement(element, stylesheetInfo, stylesheets, baseURI, options, workStyleElement, resources);
		}

		async resolveStylesheetElement(element, stylesheetInfo, stylesheets, baseURI, options, workStyleElement, resources) {
			if (!options.blockStylesheets || (options.keepPrintStyleSheets && stylesheetInfo.mediaText == "print")) {
				stylesheets.set({ element }, stylesheetInfo);
				if (!options.inlineStylesheetsRefs.has(element)) {
					if (element.tagName.toUpperCase() == "LINK") {
						await this.resolveLinkStylesheetURLs(stylesheetInfo, element, element.href, baseURI, options, workStyleElement, resources, stylesheets);
					} else {
						stylesheetInfo.stylesheet = cssTree.parse(element.textContent, { context: "stylesheet", parseCustomProperty: true });
						await this.resolveImportURLs(stylesheetInfo, baseURI, options, workStyleElement, resources, stylesheets);
					}
				}
			} else {
				if (element.tagName.toUpperCase() == "LINK") {
					element.href = util.EMPTY_RESOURCE;
				} else {
					element.textContent = "";
				}
			}
		}

		replaceStylesheets(doc, stylesheets, options, resources) {
			const entries = Array.from(stylesheets).reverse();
			const linkElements = new Map();
			Array.from(new Set(options.inlineStylesheetsRefs.values())).forEach(stylesheetRefIndex => {
				const linkElement = doc.createElement("link");
				linkElement.setAttribute("rel", "stylesheet");
				linkElement.setAttribute("type", "text/css");
				const name = "stylesheet_" + resources.stylesheets.size + ".css";
				linkElement.setAttribute("href", name);
				let content = options.inlineStylesheets.get(stylesheetRefIndex);
				const stylesheet = cssTree.parse(content, { context: "stylesheet", parseCustomProperty: true });
				this.replacePseudoClassDefined(stylesheet);
				content = this.generateStylesheetContent(stylesheet, options);
				resources.stylesheets.set(resources.stylesheets.size, { name, content });
				linkElements.set(stylesheetRefIndex, linkElement);
			});
			for (const [key, stylesheetInfo] of entries) {
				if (key.urlNode) {
					const name = "stylesheet_" + resources.stylesheets.size + ".css";
					if (!isDataURL(stylesheetInfo.url) && options.saveOriginalURLs) {
						key.urlNode.value = "-sf-url-original(" + JSON.stringify(stylesheetInfo.url) + ") " + name;
					} else {
						key.urlNode.value = name;
					}
					resources.stylesheets.set(resources.stylesheets.size, { name, stylesheet: stylesheetInfo.stylesheet, url: stylesheetInfo.url });
				} else if (key.element.tagName.toUpperCase() == "LINK") {
					const linkElement = key.element;
					const name = "stylesheet_" + resources.stylesheets.size + ".css";
					linkElement.setAttribute("href", name);
					resources.stylesheets.set(resources.stylesheets.size, { name, stylesheet: stylesheetInfo.stylesheet, url: stylesheetInfo.url });
				} else {
					const styleElement = key.element;
					const stylesheetRefIndex = options.inlineStylesheetsRefs.get(styleElement);
					if (stylesheetRefIndex === undefined) {
						styleElement.textContent = this.generateStylesheetContent(stylesheetInfo.stylesheet, options);
					} else {
						const linkElement = linkElements.get(stylesheetRefIndex).cloneNode(true);
						if (stylesheetInfo.mediaText) {
							linkElement.media = stylesheetInfo.mediaText;
						}
						styleElement.replaceWith(linkElement);
						key.element = linkElement;
					}
				}
			}
			for (const [, stylesheetResource] of resources.stylesheets) {
				if (stylesheetResource.stylesheet) {
					stylesheetResource.content = this.generateStylesheetContent(stylesheetResource.stylesheet, options);
					stylesheetResource.stylesheet = null;
				}
			}
		}

		async resolveImportURLs(stylesheetInfo, baseURI, options, workStylesheet, resources, stylesheets) {
			const stylesheet = stylesheetInfo.stylesheet;
			const scoped = stylesheetInfo.scoped;
			this.resolveStylesheetURLs(stylesheet, baseURI, workStylesheet);
			const imports = getImportFunctions(stylesheet);
			await Promise.all(imports.map(async node => {
				const urlNode = cssTree.find(node, node => node.type == "Url") || cssTree.find(node, node => node.type == "String");
				if (urlNode) {
					let resourceURL = normalizeURL(urlNode.value);
					if (!testIgnoredPath(resourceURL) && testValidPath(resourceURL)) {
						urlNode.value = util.EMPTY_RESOURCE;
						try {
							resourceURL = util.resolveURL(resourceURL, baseURI);
							// eslint-disable-next-line no-unused-vars
						} catch (error) {
							// ignored
						}
						if (testValidURL(resourceURL)) {
							const mediaQueryListNode = cssTree.find(node, node => node.type == "MediaQueryList");
							let mediaText, layerName, supportsCondition;
							if (mediaQueryListNode) {
								mediaText = cssTree.generate(mediaQueryListNode);
							}
							const layerNode = cssTree.find(node, node => node.type == "Layer");
							if (layerNode) {
								layerName = layerNode.name;
							}
							const supportsNode = cssTree.find(node, node => node.type == "Supports");
							if (supportsNode) {
								supportsCondition = cssTree.generate(supportsNode);
							}
							const existingStylesheet = Array.from(stylesheets).find(([, stylesheetInfo]) => stylesheetInfo.resourceURL == resourceURL);
							let stylesheet;
							if (existingStylesheet) {
								stylesheet = existingStylesheet[1].stylesheet;
								stylesheets.set({ urlNode }, {
									url: resourceURL,
									stylesheet,
									scoped
								});
							} else {
								const stylesheetInfo = {
									scoped,
									mediaText,
									layerName,
									supportsCondition
								};
								const content = await this.getStylesheetContent(resourceURL, options);
								stylesheetInfo.url = resourceURL = content.resourceURL;
								content.data = getUpdatedResourceContent(resourceURL, options) || content.data;
								stylesheetInfo.stylesheet = cssTree.parse(content.data, { context: "stylesheet", parseCustomProperty: true });
								stylesheet = stylesheetInfo.stylesheet;
								await this.resolveImportURLs(stylesheetInfo, resourceURL, options, workStylesheet, resources, stylesheets);
								stylesheets.set({ urlNode }, stylesheetInfo);
							}
							urlNode.importedChildren = stylesheet.children;
							urlNode.importedMediaText = mediaText;
							urlNode.importedLayerName = layerName;
							urlNode.importedSupportsCondition = supportsCondition;
						}
					}
				}
			}));
		}

		async resolveLinkStylesheetURLs(stylesheetInfo, element, resourceURL, baseURI, options, workStylesheet, resources, stylesheets) {
			resourceURL = normalizeURL(resourceURL);
			if (resourceURL && resourceURL != baseURI && resourceURL != ABOUT_BLANK_URI) {
				const existingStylesheet = Array.from(stylesheets).find(([, otherStylesheetInfo]) => otherStylesheetInfo.resourceURL == resourceURL);
				if (existingStylesheet) {
					stylesheets.set({ element }, {
						url: resourceURL,
						stylesheet: existingStylesheet[1].stylesheet,
						mediaText: stylesheetInfo.mediaText
					});
				} else {
					const content = await util.getContent(resourceURL, {
						maxResourceSize: options.maxResourceSize,
						maxResourceSizeEnabled: options.maxResourceSizeEnabled,
						charset: options.charset,
						frameId: options.frameId,
						resourceReferrer: options.resourceReferrer,
						validateTextContentType: true,
						baseURI: baseURI,
						blockMixedContent: options.blockMixedContent,
						expectedType: "stylesheet",
						acceptHeaders: options.acceptHeaders,
						networkTimeout: options.networkTimeout
					});
					if (!(matchCharsetEquals(content.data, content.charset) || matchCharsetEquals(content.data, options.charset))) {
						options = Object.assign({}, options, { charset: getCharset(content.data) });
						await this.resolveLinkStylesheetURLs(stylesheetInfo, element, resourceURL, baseURI, options, workStylesheet, resources, stylesheets);
					} else {
						resourceURL = content.resourceURL;
						content.data = getUpdatedResourceContent(content.resourceURL, options) || content.data;
						stylesheetInfo.stylesheet = cssTree.parse(content.data, { context: "stylesheet", parseCustomProperty: true });
						await this.resolveImportURLs(stylesheetInfo, resourceURL, options, workStylesheet, resources, stylesheets);
					}
				}
			}
		}

		async processFrame(frameElement, pageData, options, resources, frameWindowId, frameData) {
			const name = "frames/" + resources.frames.size + "/";
			let sandbox = "allow-popups allow-top-navigation-by-user-activation allow-scripts";
			if (pageData.content.match(NOSCRIPT_TAG_FOUND) || pageData.content.match(CANVAS_TAG_FOUND) || pageData.content.match(SCRIPT_TAG_FOUND) || options.saveRawPage) {
				sandbox += " allow-modals allow-popups allow-downloads allow-pointer-lock allow-presentation";
			}
			frameElement.setAttribute("sandbox", sandbox);
			if (frameElement.tagName.toUpperCase() == "OBJECT") {
				frameElement.setAttribute("data", name + "index.html");
			} else {
				frameElement.setAttribute("src", name + "index.html");
			}
			resources.frames.set(frameWindowId, { name, content: pageData.content, resources: pageData.resources, url: frameData.url });
		}

		async processFont(resourceURL, urlNode, originalResourceURL, baseURI, options, resources, batchRequest) {
			let { content, extension, indexResource, contentType } = await batchRequest.addURL(resourceURL, {
				asBinary: true,
				expectedType: "font",
				baseURI,
				blockMixedContent: options.blockMixedContent
			});
			const name = "fonts/" + indexResource + extension;
			if (!isDataURL(resourceURL) && options.saveOriginalURLs) {
				urlNode.value = "-sf-url-original(" + JSON.stringify(originalResourceURL) + ") " + name;
			} else {
				urlNode.value = name;
			}
			resources.fonts.set(indexResource, { name, content, extension, contentType, url: resourceURL });
		}

		async processStyle(ruleData, options, resources, batchRequest) {
			const urls = getUrlFunctions(ruleData);
			await Promise.all(urls.map(async urlNode => {
				const originalResourceURL = urlNode.value;
				if (!options.blockImages) {
					const resourceURL = normalizeURL(originalResourceURL);
					if (!testIgnoredPath(resourceURL) && testValidURL(resourceURL)) {
						let { content, indexResource, contentType, extension } = await batchRequest.addURL(resourceURL,
							{ asBinary: true, expectedType: "image" });
						const name = "images/" + indexResource + extension;
						if (!isDataURL(resourceURL) && options.saveOriginalURLs) {
							urlNode.value = "-sf-url-original(" + JSON.stringify(originalResourceURL) + ") " + name;
						} else {
							urlNode.value = name;
						}
						resources.images.set(indexResource, { name, content, extension, contentType, url: resourceURL });
					}
				} else {
					urlNode.value = util.EMPTY_RESOURCE;
				}
			}));
		}

		async processAttribute(resourceElements, attributeName, baseURI, options, expectedType, resources, removeElementIfMissing, batchRequest) {
			await Promise.all(Array.from(resourceElements).map(async resourceElement => {
				let resourceURL = resourceElement.getAttribute(attributeName);
				if (resourceURL != null) {
					resourceURL = normalizeURL(resourceURL);
					let originURL = resourceElement.dataset.singleFileOriginURL;
					if (options.saveOriginalURLs && !isDataURL(resourceURL)) {
						resourceElement.setAttribute("data-sf-original-" + attributeName, resourceURL);
					}
					delete resourceElement.dataset.singleFileOriginURL;
					if (!expectedType || !options["block" + expectedType.charAt(0).toUpperCase() + expectedType.substring(1) + "s"]) {
						if (!testIgnoredPath(resourceURL)) {
							setAttributeEmpty(resourceElement, attributeName, expectedType);
							if (testValidPath(resourceURL)) {
								try {
									resourceURL = util.resolveURL(resourceURL, baseURI);
									// eslint-disable-next-line no-unused-vars
								} catch (error) {
									// ignored
								}
								if (testValidURL(resourceURL)) {
									const declaredContentType = ["OBJECT", "EMBED"].includes(resourceElement.tagName.toUpperCase()) ? resourceElement.getAttribute("type") : "";
									let { content, indexResource, extension, contentType } = await batchRequest.addURL(resourceURL,
										{ asBinary: true, expectedType, contentType: declaredContentType });
									if (originURL) {
										if (this.testEmptyResource(content)) {
											try {
												originURL = util.resolveURL(originURL, baseURI);
												// eslint-disable-next-line no-unused-vars
											} catch (error) {
												// ignored
											}
											try {
												resourceURL = originURL;
												content = (await util.getContent(resourceURL, {
													asBinary: true,
													expectedType,
													contentType: declaredContentType,
													maxResourceSize: options.maxResourceSize,
													maxResourceSizeEnabled: options.maxResourceSizeEnabled,
													frameId: options.windowId,
													resourceReferrer: options.resourceReferrer,
													acceptHeaders: options.acceptHeaders,
													networkTimeout: options.networkTimeout
												})).data;
												// eslint-disable-next-line no-unused-vars
											} catch (error) {
												// ignored
											}
										}
									}
									if (removeElementIfMissing && this.testEmptyResource(content)) {
										resourceElement.remove();
									} else if (!this.testEmptyResource(content)) {
										const name = "images/" + indexResource + extension;
										resourceElement.setAttribute(attributeName, name);
										resources.images.set(indexResource, { name, content, extension, contentType, url: resourceURL });
									}
								}
							}
						}
					} else {
						setAttributeEmpty(resourceElement, attributeName, expectedType);
					}
				}
			}));

			function setAttributeEmpty(resourceElement, attributeName, expectedType) {
				if (expectedType == "video" || expectedType == "audio") {
					resourceElement.removeAttribute(attributeName);
				} else {
					resourceElement.setAttribute(attributeName, util.EMPTY_RESOURCE);
				}
			}
		}

		async processImageSrcset(resourceURL, srcsetValue, resources, batchRequest) {
			const { content, indexResource, extension, contentType } = await batchRequest.addURL(resourceURL, { asBinary: true, expectedType: "image" });
			const name = "images/" + indexResource + extension;
			resources.images.set(indexResource, { name, content, extension, contentType, url: resourceURL });
			return name + (srcsetValue.w ? " " + srcsetValue.w + "w" :
				srcsetValue.h ? " " + srcsetValue.h + "h" :
					srcsetValue.d ? " " + srcsetValue.d + "x" : "");
		}

		testEmptyResource(resource) {
			return !resource;
		}

		generateStylesheetContent(stylesheet, options) {
			if (options.compressCSS) {
				this.removeSingleLineCssComments(stylesheet);
			}
			this.replacePseudoClassDefined(stylesheet);
			let stylesheetContent = cssTree.generate(stylesheet);
			if (options.compressCSS) {
				stylesheetContent = util.compressCSS(stylesheetContent);
			}
			if (options.saveOriginalURLs) {
				stylesheetContent = replaceOriginalURLs(stylesheetContent);
			}
			return stylesheetContent;
		}

		getAdditionalPageData(doc, content, pageResources) {
			const resources = {};
			let textContent = content;
			pageResources.stylesheets.forEach(resource => textContent += resource.content);
			Object.keys(pageResources).forEach(resourceType => {
				const unusedResources = Array.from(pageResources[resourceType]).filter(([, value]) => !textContent.includes(value.name));
				unusedResources.forEach(([indexResource]) => pageResources[resourceType].delete(indexResource));
				resources[resourceType] = Array.from(pageResources[resourceType].values());
			});
			const viewportElement = doc.head.querySelector("meta[name=viewport]");
			const viewport = viewportElement ? viewportElement.content : null;
			const doctype = util.getDoctypeString(doc);
			return {
				doctype,
				resources,
				viewport
			};
		}

		async processScript(element, resourceURL, options, charset, batchRequest, resources) {
			let { content, indexResource, extension, contentType } = await batchRequest.addURL(resourceURL, {
				asBinary: true,
				charset: charset != UTF8_CHARSET && charset,
				maxResourceSize: options.maxResourceSize,
				maxResourceSizeEnabled: options.maxResourceSizeEnabled,
				frameId: options.windowId,
				resourceReferrer: options.resourceReferrer,
				baseURI: options.baseURI,
				blockMixedContent: options.blockMixedContent,
				expectedType: "script",
				acceptHeaders: options.acceptHeaders,
				networkTimeout: options.networkTimeout
			});
			content = getUpdatedResourceContent(resourceURL, options) || content;
			const name = "scripts/" + indexResource + extension;
			element.setAttribute("src", name);
			resources.scripts.set(indexResource, { name, content, extension, contentType, url: resourceURL });
		}

		async processWorklet(scriptElement, resourceURL, workletOptions, options, charset, batchRequest, resources) {
			let { content, indexResource, extension, contentType } = await batchRequest.addURL(resourceURL, {
				asBinary: true,
				charset: charset != UTF8_CHARSET && charset,
				maxResourceSize: options.maxResourceSize,
				maxResourceSizeEnabled: options.maxResourceSizeEnabled,
				frameId: options.windowId,
				resourceReferrer: options.resourceReferrer,
				baseURI: options.baseURI,
				blockMixedContent: options.blockMixedContent,
				expectedType: "script",
				acceptHeaders: options.acceptHeaders,
				networkTimeout: options.networkTimeout
			});
			const name = "scripts/" + indexResource + extension;
			if (workletOptions) {
				scriptElement.textContent += `  CSS.paintWorklet.addModule("${name}", ${JSON.stringify(workletOptions)});\n`;
			} else {
				scriptElement.textContent += `  CSS.paintWorklet.addModule("${name}");\n`;
			}
			resources.worklets.set(indexResource, { name, workletOptions, content, extension, contentType, url: resourceURL });
		}

		setMetaCSP(metaElement) {
			metaElement.content = "default-src 'none'; connect-src 'self' data: blob:; font-src 'self' data: blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' data: blob:; frame-src 'self' data: blob:; media-src 'self' data: blob:; script-src 'self' 'unsafe-inline' data: blob:; object-src 'self' data: blob:;";
		}

		removeUnusedStylesheets() {
		}

		async processFontFaceRule(ruleData, fontInfo, fontResources, fontTests, stats) {
			await Promise.all(fontInfo.map(async source => {
				if (fontTests.has(source.src)) {
					source.valid = fontTests.get(source.src);
				} else {
					if (FontFace && source.fontUrl) {
						const resourceEntry = [...fontResources].find(([, resource]) => source.fontUrl && resource.name == source.fontUrl);
						if (resourceEntry) {
							const resource = resourceEntry[1];
							const fontFace = new FontFace("test-font", new Uint8Array(resource.content).buffer);
							try {
								let timeout;
								await Promise.race([
									fontFace.load().then(() => fontFace.loaded).then(() => { source.valid = true; globalThis.clearTimeout(timeout); }),
									new Promise(resolve => timeout = globalThis.setTimeout(() => { source.valid = true; resolve(); }, FONT_MAX_LOAD_DELAY))
								]);
							} catch (error) {
								if (error.name == "NetworkError") {
									source.valid = true;
								} else {
									const fontFace = new FontFace("test-font", "url(" + resource.url + ")");
									try {
										let timeout;
										await Promise.race([
											fontFace.load().then(() => fontFace.loaded).then(() => { source.valid = true; globalThis.clearTimeout(timeout); }),
											new Promise(resolve => timeout = globalThis.setTimeout(() => { source.valid = true; resolve(); }, FONT_MAX_LOAD_DELAY))
										]);
										// eslint-disable-next-line no-unused-vars
									} catch (error) {
										// ignored
									}
								}
							}
						} else {
							source.valid = true;
						}
					} else {
						source.valid = true;
					}
					fontTests.set(source.src, source.valid);
				}
			}));
			const findSourceByFormat = (fontFormat, testValidity) => util.findLast(fontInfo, source => !source.src.match(EMPTY_URL_SOURCE) && source.format == fontFormat && (!testValidity || source.valid));
			const findSourceByContentType = (contentType, testValidity) => util.findLast(fontInfo, source => !source.src.match(EMPTY_URL_SOURCE) && source.contentType == contentType && (!testValidity || source.valid));
			const filterSources = fontSource => fontInfo.filter(source => source == fontSource || source.src.startsWith(LOCAL_SOURCE));
			stats.fonts.processed += fontInfo.length;
			stats.fonts.discarded += fontInfo.length;
			const woffFontFound =
				findSourceByFormat("woff2-variations", true) || findSourceByFormat("woff2", true) || findSourceByFormat("woff", true) ||
				findSourceByContentType("font/woff2", true) || findSourceByContentType("font/woff", true) || findSourceByContentType("application/font-woff", true) || findSourceByContentType("application/x-font-woff", true);
			if (woffFontFound) {
				fontInfo = filterSources(woffFontFound);
			} else {
				const ttfFontFound =
					findSourceByFormat("truetype-variations", true) || findSourceByFormat("truetype", true) ||
					findSourceByContentType("font/ttf", true) || findSourceByContentType("application/x-font-ttf", true) || findSourceByContentType("application/x-font-ttf", true) || findSourceByContentType("application/x-font-truetype", true);
				if (ttfFontFound) {
					fontInfo = filterSources(ttfFontFound);
				} else {
					const otfFontFound =
						findSourceByFormat("opentype") || findSourceByFormat("embedded-opentype") ||
						findSourceByContentType("font/otf") || findSourceByContentType("application/x-font-opentype") || findSourceByContentType("application/font-sfnt");
					if (otfFontFound) {
						fontInfo = filterSources(otfFontFound);
					} else {
						fontInfo = fontInfo.filter(source => !source.src.match(EMPTY_URL_SOURCE) && (source.valid) || source.src.startsWith(LOCAL_SOURCE));
					}
				}
			}
			stats.fonts.discarded -= fontInfo.length;
			const removedNodes = [];
			for (let node = ruleData.block.children.head; node; node = node.next) {
				if (node.data.property == "src") {
					removedNodes.push(node);
				}
			}
			removedNodes.pop();
			removedNodes.forEach(node => ruleData.block.children.remove(node));
			const srcDeclaration = ruleData.block.children.filter(node => node.property == "src").tail;
			if (srcDeclaration) {
				fontInfo.reverse();
				try {
					srcDeclaration.data.value = cssTree.parse(fontInfo.map(fontSource => fontSource.src).join(","), { context: "value", parseCustomProperty: true });
					// eslint-disable-next-line no-unused-vars
				} catch (error) {
					// ignored
				}
			}
		}
	};
}