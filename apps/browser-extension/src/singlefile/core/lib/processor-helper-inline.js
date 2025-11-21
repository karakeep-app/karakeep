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
const Set = globalThis.Set;
const setTimeout = globalThis.setTimeout;
const clearTimeout = globalThis.clearTimeout;
const Image = globalThis.Image;

const ABOUT_BLANK_URI = "about:blank";
const UTF8_CHARSET = "utf-8";
const PREFIX_DATA_URI_IMAGE_SVG = "data:image/svg+xml";
const PREFIXES_FORBIDDEN_DATA_URI = ["data:text/"];
const SCRIPT_TAG_FOUND = /<script/gi;
const NOSCRIPT_TAG_FOUND = /<noscript/gi;
const CANVAS_TAG_FOUND = /<canvas/gi;
const SINGLE_FILE_VARIABLE_NAME_PREFIX = "--sf-img-";
const SINGLE_FILE_VARIABLE_MAX_SIZE = 512 * 1024;
const EMPTY_URL_SOURCE = /^url\(["']?data:[^,]*,?["']?\)/;
const LOCAL_SOURCE = "local(";
const FONT_MAX_LOAD_DELAY = 5000;
const DUPLICATE_STYLESHEET_ATTRIBUTE_NAME = "data-sf-duplicate-stylesheet-ref";

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
	testValidURL,
	toDataURI
} from "./processor-helper-common.js";

export {
	getProcessorHelperClass,
	cssTree
};

function getProcessorHelperClass(utilInstance) {
	util = utilInstance;
	const ProcessorHelperCommon = getProcessorHelperCommonClass(util, cssTree);

	return class ProcessorHelper extends ProcessorHelperCommon {
		async resolveStylesheets(element, stylesheetInfo, stylesheets, baseURI, options, workStyleElement) {
			if (element.tagName.toUpperCase() == "LINK" && element.charset) {
				options.charset = element.charset;
			}
			await this.resolveStylesheetElement(element, stylesheetInfo, stylesheets, baseURI, options, workStyleElement);
		}

		async resolveStylesheetElement(element, stylesheetInfo, stylesheets, baseURI, options, workStyleElement) {
			let stylesheet;
			stylesheets.set(element, stylesheetInfo);
			if (!options.inlineStylesheetsRefs.has(element)) {
				if (!options.blockStylesheets || (options.keepPrintStyleSheets && stylesheetInfo.mediaText == "print")) {
					if (element.tagName.toUpperCase() == "LINK") {
						stylesheet = await this.resolveLinkStylesheetURLs(element.href, baseURI, options, workStyleElement);
					} else {
						stylesheet = cssTree.parse(element.textContent, { context: "stylesheet", parseCustomProperty: true });
						const importFound = await this.resolveImportURLs(stylesheet, baseURI, options, workStyleElement);
						if (importFound) {
							stylesheet = cssTree.parse(cssTree.generate(stylesheet), { context: "stylesheet", parseCustomProperty: true });
						}
					}
				}
				if (stylesheet && stylesheet.children) {
					if (options.compressCSS) {
						this.removeSingleLineCssComments(stylesheet);
					}
					this.replacePseudoClassDefined(stylesheet);
					options.inlineStylesheets.forEach((content, index) => {
						if (content === element.textContent) {
							options.inlineStylesheets.set(index, this.generateStylesheetContent(stylesheet, options));
						}
					});
					stylesheetInfo.stylesheet = stylesheet;
				} else {
					stylesheets.delete(element);
				}
			}
		}

		replaceStylesheets(doc, stylesheets, options) {
			doc.querySelectorAll("style").forEach(styleElement => {
				const stylesheetInfo = stylesheets.get(styleElement);
				if (stylesheetInfo) {
					stylesheets.delete(styleElement);
					const stylesheetRefIndex = options.inlineStylesheetsRefs.get(styleElement);
					if (stylesheetRefIndex === undefined) {
						styleElement.textContent = this.generateStylesheetContent(stylesheetInfo.stylesheet, options);
					} else if (options.groupDuplicateStylesheets) {
						if (!doc.querySelector("style[" + DUPLICATE_STYLESHEET_ATTRIBUTE_NAME + "=\"" + stylesheetRefIndex + "\"]")) {
							const styleElement = doc.createElement("style");
							styleElement.textContent = options.inlineStylesheets.get(stylesheetRefIndex);
							styleElement.setAttribute("media", "not all");
							styleElement.setAttribute(DUPLICATE_STYLESHEET_ATTRIBUTE_NAME, stylesheetRefIndex);
							doc.head.appendChild(styleElement);
						}
						styleElement.textContent = "/* */";
						styleElement.setAttribute("onload", "this.textContent=document.querySelector('style[" + DUPLICATE_STYLESHEET_ATTRIBUTE_NAME + "=\"" + stylesheetRefIndex + "\"]').textContent;this.removeAttribute(\"onload\")");
					} else {
						styleElement.textContent = options.inlineStylesheets.get(stylesheetRefIndex);
					}
					if (stylesheetInfo.mediaText) {
						styleElement.media = stylesheetInfo.mediaText;
					}
				} else {
					styleElement.remove();
				}
			});
			if (options.groupDuplicateStylesheets && doc.querySelector("style[" + DUPLICATE_STYLESHEET_ATTRIBUTE_NAME + "]")) {
				const scriptElement = doc.createElement("script");
				scriptElement.textContent = "document.currentScript.remove();addEventListener(\"load\",()=>document.querySelectorAll(\"style[" + DUPLICATE_STYLESHEET_ATTRIBUTE_NAME + "]\").forEach(e=>e.remove()))";
				doc.body.appendChild(scriptElement);
			}
			doc.querySelectorAll("link[rel*=stylesheet]").forEach(linkElement => {
				const stylesheetInfo = stylesheets.get(linkElement);
				if (stylesheetInfo) {
					stylesheets.delete(linkElement);
					const styleElement = doc.createElement("style");
					if (stylesheetInfo.mediaText) {
						styleElement.media = stylesheetInfo.mediaText;
					}
					styleElement.textContent = this.generateStylesheetContent(stylesheetInfo.stylesheet, options);
					linkElement.parentElement.replaceChild(styleElement, linkElement);
				} else {
					linkElement.remove();
				}
			});
		}

		async resolveImportURLs(stylesheet, baseURI, options, workStylesheet, importedStyleSheets = new Set()) {
			let importFound;
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
						if (testValidURL(resourceURL) && !importedStyleSheets.has(resourceURL)) {
							options.inline = true;
							const content = await this.getStylesheetContent(resourceURL, options);
							resourceURL = content.resourceURL;
							content.data = getUpdatedResourceContent(resourceURL, options) || content.data;
							if (content.data && content.data.match(/^<!doctype /i)) {
								content.data = "";
							}
							const mediaQueryListNode = cssTree.find(node, node => node.type == "MediaQueryList");
							if (mediaQueryListNode) {
								content.data = this.wrapMediaQuery(content.data, cssTree.generate(mediaQueryListNode));
							}
							const layerListNode = cssTree.find(node, node => node.type == "LayerList");
							if (layerListNode) {
								const layerNames = [];
								layerListNode.children.forEach(child => {
									if (child.type == "Identifier") {
										layerNames.push(child.name);
									}
								});
								if (layerNames.length == 1) {
									content.data = this.wrapLayer(content.data, layerNames[0]);
								}
							}
							const supportsNode = cssTree.find(node, node => node.type == "Supports");
							if (supportsNode) {
								content.data = "@supports " + cssTree.generate(supportsNode) + " { " + content.data + " }";
							}
							const importedStylesheet = cssTree.parse(content.data, { context: "stylesheet", parseCustomProperty: true });
							const ancestorStyleSheets = new Set(importedStyleSheets);
							ancestorStyleSheets.add(resourceURL);
							await this.resolveImportURLs(importedStylesheet, resourceURL, options, workStylesheet, ancestorStyleSheets);
							for (let keyName of Object.keys(importedStylesheet)) {
								node[keyName] = importedStylesheet[keyName];
							}
							importFound = true;
						}
					}
				}
			}));
			return importFound;
		}

		async resolveLinkStylesheetURLs(resourceURL, baseURI, options, workStylesheet) {
			resourceURL = normalizeURL(resourceURL);
			if (resourceURL && resourceURL != baseURI && resourceURL != ABOUT_BLANK_URI) {
				const content = await util.getContent(resourceURL, {
					inline: true,
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
					return this.resolveLinkStylesheetURLs(resourceURL, baseURI, options, workStylesheet);
				}
				resourceURL = content.resourceURL;
				content.data = getUpdatedResourceContent(content.resourceURL, options) || content.data;
				if (content.data && content.data.match(/^<!doctype /i)) {
					content.data = "";
				}
				let stylesheet = cssTree.parse(content.data, { context: "stylesheet", parseCustomProperty: true });
				const importFound = await this.resolveImportURLs(stylesheet, resourceURL, options, workStylesheet);
				if (importFound) {
					stylesheet = cssTree.parse(cssTree.generate(stylesheet), { context: "stylesheet", parseCustomProperty: true });
				}
				return stylesheet;
			}
		}

		async processFrame(frameElement, pageData, options) {
			let sandbox = "allow-popups allow-top-navigation-by-user-activation";
			if (pageData.content.match(NOSCRIPT_TAG_FOUND) || pageData.content.match(CANVAS_TAG_FOUND) || pageData.content.match(SCRIPT_TAG_FOUND) || options.saveRawPage) {
				sandbox += " allow-scripts allow-modals allow-popups allow-downloads allow-pointer-lock allow-presentation";
			}
			frameElement.setAttribute("sandbox", sandbox);
			if (frameElement.tagName.toUpperCase() == "OBJECT") {
				frameElement.setAttribute("data", "data:text/html," + pageData.content);
			} else {
				if (frameElement.tagName.toUpperCase() == "FRAME") {
					frameElement.setAttribute("src", "data:text/html," + pageData.content.replace(/%/g, "%25").replace(/#/g, "%23"));
				} else {
					frameElement.setAttribute("srcdoc", pageData.content);
					frameElement.removeAttribute("src");
				}
			}
		}

		async processFont(resourceURL, urlNode, originalResourceURL, baseURI, options, resources, batchRequest) {
			let { content } = await batchRequest.addURL(resourceURL, {
				asBinary: true,
				expectedType: "font",
				baseURI,
				blockMixedContent: options.blockMixedContent
			});
			let resourceURLs = resources.fonts.get(urlNode);
			if (!resourceURLs) {
				resourceURLs = [];
				resources.fonts.set(urlNode, resourceURLs);
			}
			resourceURLs.push(resourceURL);
			if (!isDataURL(resourceURL) && options.saveOriginalURLs) {
				urlNode.value = "-sf-url-original(" + JSON.stringify(originalResourceURL) + ") " + content;
			} else {
				urlNode.value = content;
			}
		}

		async processStyle(ruleData, options, resources, batchRequest) {
			const urls = getUrlFunctions(ruleData);
			await Promise.all(urls.map(async urlNode => {
				const originalResourceURL = urlNode.value;
				if (!options.blockImages) {
					const resourceURL = normalizeURL(originalResourceURL);
					if (!testIgnoredPath(resourceURL) && testValidURL(resourceURL)) {
						let { content, indexResource, duplicate } = await batchRequest.addURL(resourceURL, { asBinary: true, expectedType: "image", groupDuplicates: options.groupDuplicateImages });
						if (!originalResourceURL.startsWith("#")) {
							const maxSizeDuplicateImages = options.maxSizeDuplicateImages || SINGLE_FILE_VARIABLE_MAX_SIZE;
							if (duplicate && options.groupDuplicateImages && util.getContentSize(content) < maxSizeDuplicateImages) {
								const varNode = cssTree.parse("var(" + SINGLE_FILE_VARIABLE_NAME_PREFIX + indexResource + ")", { context: "value" });
								for (let keyName of Object.keys(varNode.children.head.data)) {
									urlNode[keyName] = varNode.children.head.data[keyName];
								}
								resources.cssVariables.set(indexResource, { content, url: originalResourceURL });
							} else {
								if (!isDataURL(resourceURL) && options.saveOriginalURLs) {
									urlNode.value = "-sf-url-original(" + JSON.stringify(originalResourceURL) + ") " + content;
								} else {
									urlNode.value = content;
								}
							}
						}
					}
				} else {
					urlNode.value = util.EMPTY_RESOURCE;
				}
			}));
		}

		async processAttribute(resourceElements, attributeName, baseURI, options, expectedType, resources, removeElementIfMissing, batchRequest, styles, processDuplicates) {
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
									const groupDuplicates = options.groupDuplicateImages && resourceElement.tagName.toUpperCase() == "IMG" && attributeName == "src";
									let { content, indexResource, duplicate } = await batchRequest.addURL(
										resourceURL,
										{ asBinary: true, expectedType, contentType: declaredContentType, groupDuplicates });
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
													inline: true,
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
										let forbiddenPrefixFound = PREFIXES_FORBIDDEN_DATA_URI.filter(prefixDataURI => content.startsWith(prefixDataURI)).length;
										if (expectedType == "image") {
											if (forbiddenPrefixFound && Image) {
												forbiddenPrefixFound = await new Promise((resolve) => {
													const image = new Image();
													const timeoutId = setTimeout(() => resolve(true), 100);
													image.src = content;
													image.onload = () => cleanupAndResolve();
													image.onerror = () => cleanupAndResolve(true);

													function cleanupAndResolve(value) {
														clearTimeout(timeoutId);
														resolve(value);
													}
												});
											}
											if (!forbiddenPrefixFound) {
												const isSVG = content.startsWith(PREFIX_DATA_URI_IMAGE_SVG);
												const maxSizeDuplicateImages = options.maxSizeDuplicateImages || SINGLE_FILE_VARIABLE_MAX_SIZE;
												if (processDuplicates && duplicate && !isSVG && util.getContentSize(content) < maxSizeDuplicateImages) {
													if (this.replaceImageSource(resourceElement, SINGLE_FILE_VARIABLE_NAME_PREFIX + indexResource, options)) {
														resources.cssVariables.set(indexResource, { content, url: originURL });
														const declarationList = cssTree.parse(resourceElement.getAttribute("style"), { context: "declarationList", parseCustomProperty: true });
														styles.set(resourceElement, declarationList);
													} else {
														resourceElement.setAttribute(attributeName, content);
													}
												} else {
													resourceElement.setAttribute(attributeName, content);
												}
											}
										} else {
											resourceElement.setAttribute(attributeName, content);
										}
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
			const { content } = await batchRequest.addURL(resourceURL, { asBinary: true, expectedType: "image" });
			const forbiddenPrefixFound = PREFIXES_FORBIDDEN_DATA_URI.filter(prefixDataURI => content.startsWith(prefixDataURI)).length;
			if (forbiddenPrefixFound) {
				return "";
			}
			return content + (srcsetValue.w ? " " + srcsetValue.w + "w" :
				srcsetValue.h ? " " + srcsetValue.h + "h" :
					srcsetValue.d ? " " + srcsetValue.d + "x" : "");
		}

		testEmptyResource(resource) {
			return resource == util.EMPTY_RESOURCE;
		}

		generateStylesheetContent(stylesheet, options) {
			let stylesheetContent = cssTree.generate(stylesheet);
			if (options.compressCSS) {
				stylesheetContent = util.compressCSS(stylesheetContent);
			}
			if (options.saveOriginalURLs) {
				stylesheetContent = replaceOriginalURLs(stylesheetContent);
			}
			return stylesheetContent;
		}

		replaceImageSource(imgElement, variableName, options) {
			const attributeValue = imgElement.getAttribute(util.IMAGE_ATTRIBUTE_NAME);
			if (attributeValue) {
				const imageData = options.images[Number(imgElement.getAttribute(util.IMAGE_ATTRIBUTE_NAME))];
				if (imageData && imageData.replaceable) {
					imgElement.setAttribute("src", `${PREFIX_DATA_URI_IMAGE_SVG},<svg xmlns="http://www.w3.org/2000/svg" width="${imageData.size.pxWidth}" height="${imageData.size.pxHeight}"><rect fill-opacity="0"/></svg>`);
					const backgroundStyle = {};
					const backgroundSize = (imageData.objectFit == "content" || imageData.objectFit == "cover" || imageData.objectFit == "contain") && imageData.objectFit;
					if (backgroundSize) {
						backgroundStyle["background-size"] = imageData.objectFit;
					}
					if (imageData.objectPosition) {
						backgroundStyle["background-position"] = imageData.objectPosition;
					}
					if (imageData.backgroundColor) {
						backgroundStyle["background-color"] = imageData.backgroundColor;
					}
					this.setBackgroundImage(imgElement, "var(" + variableName + ")", backgroundStyle);
					imgElement.removeAttribute(util.IMAGE_ATTRIBUTE_NAME);
					return true;
				}
			}
		}

		wrapMediaQuery(stylesheetContent, mediaQuery) {
			if (mediaQuery) {
				return "@media " + mediaQuery + "{ " + stylesheetContent + " }";
			} else {
				return stylesheetContent;
			}
		}

		wrapLayer(stylesheetContent, layerName) {
			if (layerName) {
				return "@layer " + layerName + " { " + stylesheetContent + " }";
			} else {
				return stylesheetContent;
			}
		}

		getAdditionalPageData() {
			return {};
		}

		async processScript(element, resourceURL, options, charset, batchRequest) {
			let content = getUpdatedResourceContent(resourceURL, options);
			if (content) {
				content = await toDataURI(content, "text/javascript", charset);
			} else {
				const result = await batchRequest.addURL(resourceURL, {
					asBinary: true,
					inline: true,
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
				content = result.content;
			}
			element.setAttribute("src", content);
		}

		async processWorklet(scriptElement, resourceURL, workletOptions, options, charset, batchRequest) {
			let { content } = await batchRequest.addURL(resourceURL, {
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
			if (workletOptions) {
				scriptElement.textContent += `  CSS.paintWorklet.addModule("${content}", ${JSON.stringify(workletOptions)});\n`;
			} else {
				scriptElement.textContent += `  CSS.paintWorklet.addModule("${content}");\n`;
			}
		}

		setMetaCSP(metaElement) {
			metaElement.content = "default-src 'none'; font-src 'self' data:; img-src 'self' data:; style-src 'unsafe-inline'; media-src 'self' data:; script-src 'unsafe-inline' data:; object-src 'self' data:; frame-src 'self' data:;";
		}

		removeUnusedStylesheets(doc) {
			doc.querySelectorAll("link[rel*=stylesheet][rel*=alternate][title]").forEach(element => element.remove());
		}

		async processFontFaceRule(ruleData, fontInfo, fontDeclarations, fontTests, stats) {
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
				await Promise.all(fontInfo.map(async source => {
					if (fontTests.has(source.src)) {
						source.valid = fontTests.get(source.src);
					} else {
						if (FontFace && source.fontUrl) {
							const fontFace = new FontFace("test-font", source.src);
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
									const urlNodes = cssTree.findAll(srcDeclaration.data, node => node.type == "Url");
									const declarationFontURLs = Array.from(fontDeclarations).find(([node]) => urlNodes.includes(node) && node.value == source.fontUrl);
									if (declarationFontURLs && declarationFontURLs[1].length) {
										const fontURL = declarationFontURLs[1][0];
										if (fontURL) {
											const fontFace = new FontFace("test-font", "url(" + fontURL + ")");
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
									} else {
										source.valid = true;
									}
								}
							}
						} else {
							source.valid = true;
						}
						fontTests.set(source.src, source.valid);
					}
				}));
				const findSourceByFormat = (fontFormat, testValidity) => util.findLast(fontInfo, source => !source.src.match(EMPTY_URL_SOURCE) && source.format == fontFormat && (!testValidity || source.valid));
				const filterSources = fontSource => fontInfo.filter(source => source == fontSource || source.src.startsWith(LOCAL_SOURCE));
				stats.fonts.processed += fontInfo.length;
				stats.fonts.discarded += fontInfo.length;
				const woffFontFound =
					findSourceByFormat("woff2-variations", true) || findSourceByFormat("woff2", true) || findSourceByFormat("woff", true);
				if (woffFontFound) {
					fontInfo = filterSources(woffFontFound);
				} else {
					const ttfFontFound =
						findSourceByFormat("truetype-variations", true) || findSourceByFormat("truetype", true);
					if (ttfFontFound) {
						fontInfo = filterSources(ttfFontFound);
					} else {
						const otfFontFound =
							findSourceByFormat("opentype") || findSourceByFormat("embedded-opentype");
						if (otfFontFound) {
							fontInfo = filterSources(otfFontFound);
						} else {
							fontInfo = fontInfo.filter(source => !source.src.match(EMPTY_URL_SOURCE) && (source.valid) || source.src.startsWith(LOCAL_SOURCE));
						}
					}
				}
				stats.fonts.discarded -= fontInfo.length;
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