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
	getProcessorHelperClass,
	cssTree
} from "./processor-helper.js";

const DEBUG = false;

const Set = globalThis.Set;
const Map = globalThis.Map;
const JSON = globalThis.JSON;

let util;

export {
	getClass
};

function getClass(...args) {
	[util] = args;
	return SingleFileClass;
}

class SingleFileClass {
	constructor(options) {
		this.options = options;
		const ProcessorHelper = getProcessorHelperClass(options, util);
		this.processorHelper = new ProcessorHelper();
	}
	async run() {
		const waitForUserScript = globalThis[util.WAIT_FOR_USERSCRIPT_PROPERTY_NAME];
		if (this.options.userScriptEnabled && waitForUserScript) {
			await waitForUserScript(util.ON_BEFORE_CAPTURE_EVENT_NAME, this.options);
		}
		this.runner = new Runner(this.options, this.processorHelper, true);
		await this.runner.loadPage();
		await this.runner.initialize();
		if (this.options.userScriptEnabled && waitForUserScript) {
			await waitForUserScript(util.ON_AFTER_CAPTURE_EVENT_NAME, this.options);
		}
		await this.runner.run();
	}
	cancel() {
		this.cancelled = true;
		if (this.runner) {
			this.runner.cancel();
		}
	}
	getPageData() {
		return this.runner.getPageData();
	}
}

// -------------
// ProgressEvent
// -------------
const PAGE_LOADING = "page-loading";
const PAGE_LOADED = "page-loaded";
const RESOURCES_INITIALIZING = "resource-initializing";
const RESOURCES_INITIALIZED = "resources-initialized";
const RESOURCE_LOADED = "resource-loaded";
const PAGE_ENDED = "page-ended";
const STAGE_STARTED = "stage-started";
const STAGE_ENDED = "stage-ended";

class ProgressEvent {
	constructor(type, detail) {
		return { type, detail, PAGE_LOADING, PAGE_LOADED, RESOURCES_INITIALIZING, RESOURCES_INITIALIZED, RESOURCE_LOADED, PAGE_ENDED, STAGE_STARTED, STAGE_ENDED };
	}
}

// ------
// Runner
// ------
const RESOLVE_URLS_STAGE = 0;
const REPLACE_DATA_STAGE = 1;
const REPLACE_DOCS_STAGE = 2;
const POST_PROCESS_STAGE = 3;
const FINALIZE_STAGE = 4;
const STAGES = [{
	sequential: [
		{ action: "preProcessPage" },
		{ option: "loadDeferredImagesKeepZoomLevel", action: "resetZoomLevel" },
		{ action: "replaceStyleContents" },
		{ action: "replaceInvalidElements" },
		{ action: "resetCharsetMeta" },
		{ action: "resetReferrerMeta" },
		{ option: "saveFavicon", action: "saveFavicon" },
		{ action: "insertFonts" },
		{ action: "insertShadowRootContents" },
		{ action: "replaceCanvasElements" },
		{ action: "setInputValues" },
		{ option: "moveStylesInHead", action: "moveStylesInHead" },
		{ option: "blockScripts", action: "removeEmbedScripts" },
		{ option: "selected", action: "removeUnselectedElements" },
		{ option: "blockVideos", action: "insertVideoPosters" },
		{ option: "blockVideos", action: "insertVideoLinks" },
		{ option: "removeFrames", action: "removeFrames" },
		{ action: "removeDiscardedResources" },
		{ option: "removeHiddenElements", action: "removeHiddenElements" },
		{ action: "saveScrollPosition" },
		{ action: "resolveHrefs" },
		{ action: "resolveStyleAttributeURLs" }
	],
	parallel: [
		{ option: "blockVideos", action: "insertMissingVideoPosters" },
		{ action: "resolveStylesheetsURLs" },
		{ option: "!removeFrames", action: "resolveFrameURLs" }
	]
}, {
	sequential: [
		{ option: "removeUnusedStyles", action: "removeUnusedStyles" },
		{ option: "removeAlternativeMedias", action: "removeAlternativeMedias" },
		{ option: "removeUnusedFonts", action: "removeUnusedFonts" }
	],
	parallel: [
		{ action: "processStylesheets" },
		{ action: "processStyleAttributes" },
		{ action: "processPageResources" },
		{ action: "processScripts" },
		{ action: "processWorklets" }
	]
}, {
	sequential: [
		{ option: "removeAlternativeImages", action: "removeAlternativeImages" }
	],
	parallel: [
		{ option: "removeAlternativeFonts", action: "removeAlternativeFonts" },
		{ option: "!removeFrames", action: "processFrames" }
	]
}, {
	sequential: [
		{ action: "replaceStylesheets" },
		{ action: "replaceStyleAttributes" },
		{ action: "insertVariables" },
		{ option: "compressHTML", action: "compressHTML" },
		{ action: "cleanupPage" }
	],
	parallel: [
		{ option: "enableMaff", action: "insertMAFFMetaData" },
		{ action: "setDocInfo" }
	]
}, {
	sequential: [
		{ action: "loadOptionsFromPage" },
		{ option: "saveFilenameTemplateData", action: "saveFilenameTemplateData" },
	]
}];

class Runner {
	constructor(options, processorHelper, root) {
		const rootDocDefined = root && options.doc;
		this.root = root;
		this.options = options;
		this.options.url = this.options.url || (rootDocDefined && this.options.doc.documentURI);
		const matchResourceReferrer = this.options.url.match(/^.*\//);
		this.options.resourceReferrer = this.options.passReferrerOnError && matchResourceReferrer && matchResourceReferrer[0];
		this.options.baseURI = rootDocDefined && (testValidURL(this.options.doc.baseURI) ? this.options.doc.baseURI : this.options.url);
		this.options.rootDocument = root;
		this.options.updatedResources = this.options.updatedResources || {};
		this.options.fontTests = new Map();
		this.batchRequest = new BatchRequest();
		this.processor = new Processor(options, processorHelper, this.batchRequest);
		if (rootDocDefined) {
			const docData = util.preProcessDoc(this.options.doc, this.options.win, this.options);
			this.options.canvases = docData.canvases;
			this.options.fonts = docData.fonts;
			this.options.worklets = docData.worklets;
			this.options.stylesheets = docData.stylesheets;
			this.options.images = docData.images;
			this.options.posters = docData.posters;
			this.options.videos = docData.videos;
			this.options.usedFonts = docData.usedFonts;
			this.options.shadowRoots = docData.shadowRoots;
			this.options.referrer = docData.referrer;
			this.options.adoptedStyleSheets = docData.adoptedStyleSheets;
			this.markedElements = docData.markedElements;
			this.invalidElements = docData.invalidElements;
		}
		if (this.options.saveRawPage && !this.options.removeFrames) {
			this.options.frames = [];
		}
		this.options.content = this.options.content || (rootDocDefined ? util.serialize(this.options.doc) : null);
		this.onprogress = options.onprogress || (() => { });
	}

	async loadPage() {
		await this.onprogress(new ProgressEvent(PAGE_LOADING, { pageURL: this.options.url, frame: !this.root, options: this.options, }));
		await this.processor.loadPage(this.options.content);
		await this.onprogress(new ProgressEvent(PAGE_LOADED, { pageURL: this.options.url, frame: !this.root, options: this.options }));
	}

	async initialize() {
		await this.onprogress(new ProgressEvent(RESOURCES_INITIALIZING, { pageURL: this.options.url, options: this.options }));
		await this.executeStage(RESOLVE_URLS_STAGE);
		this.pendingPromises = this.executeStage(REPLACE_DATA_STAGE);
		if (this.root && this.options.doc) {
			util.postProcessDoc(this.options.doc, this.markedElements, this.invalidElements);
		}
	}

	cancel() {
		this.cancelled = true;
		this.batchRequest.cancel();
		if (this.root) {
			if (this.options.frames) {
				this.options.frames.forEach(cancelRunner);
			}
		}

		function cancelRunner(resourceData) {
			if (resourceData.runner) {
				resourceData.runner.cancel();
			}
		}
	}

	async run() {
		if (this.root) {
			this.processor.initialize(this.batchRequest);
			await this.onprogress(new ProgressEvent(RESOURCES_INITIALIZED, { pageURL: this.options.url, max: this.processor.maxResources, options: this.options }));
		}
		await this.batchRequest.run(async detail => {
			detail.pageURL = this.options.url;
			detail.options = this.options;
			await this.onprogress(new ProgressEvent(RESOURCE_LOADED, detail));
		}, this.options);
		await this.pendingPromises;
		this.options.doc = null;
		this.options.win = null;
		await this.executeStage(REPLACE_DOCS_STAGE);
		await this.executeStage(POST_PROCESS_STAGE);
		await this.executeStage(FINALIZE_STAGE);
		this.processor.finalize();
	}

	getDocument() {
		return this.processor.doc;
	}

	getStyleSheets() {
		return this.processor.stylesheets;
	}

	async getPageData() {
		if (this.root) {
			await this.onprogress(new ProgressEvent(PAGE_ENDED, { pageURL: this.options.url, options: this.options }));
		}
		return this.processor.getPageData();
	}

	async executeStage(step) {
		if (DEBUG) {
			log("**** STARTED STAGE", step, "****");
		}
		const frame = !this.root;
		await this.onprogress(new ProgressEvent(STAGE_STARTED, { pageURL: this.options.url, step, frame, options: this.options }));
		for (const task of STAGES[step].sequential) {
			let startTime;
			if (DEBUG) {
				startTime = Date.now();
				log("  -- STARTED task =", task.action);
			}
			if (!this.cancelled) {
				this.executeTask(task);
			}
			if (DEBUG) {
				log("  -- ENDED   task =", task.action, "delay =", Date.now() - startTime);
			}
		}
		let parallelTasksPromise;
		if (STAGES[step].parallel) {
			parallelTasksPromise = await Promise.all(STAGES[step].parallel.map(async task => {
				let startTime;
				if (DEBUG) {
					startTime = Date.now();
					log("  // STARTED task =", task.action);
				}
				if (!this.cancelled) {
					await this.executeTask(task);
				}
				if (DEBUG) {
					log("  // ENDED task =", task.action, "delay =", Date.now() - startTime);
				}
			}));
		} else {
			parallelTasksPromise = Promise.resolve();
		}
		await this.onprogress(new ProgressEvent(STAGE_ENDED, { pageURL: this.options.url, step, frame, options: this.options }));
		if (DEBUG) {
			log("**** ENDED   STAGE", step, "****");
		}
		return parallelTasksPromise;
	}

	executeTask(task) {
		if (!task.option || ((task.option.startsWith("!") && !this.options[task.option]) || this.options[task.option])) {
			return this.processor[task.action]();
		}
	}
}

// ------------
// BatchRequest
// ------------
class BatchRequest {
	constructor() {
		this.requests = new Map();
		this.duplicates = new Map();
	}

	addURL(resourceURL, { asBinary, expectedType, groupDuplicates, baseURI, blockMixedContent, contentType } = {}) {
		return new Promise((resolve, reject) => {
			const requestKey = JSON.stringify([resourceURL, asBinary, expectedType, baseURI, blockMixedContent, contentType]);
			let resourceRequests = this.requests.get(requestKey);
			if (!resourceRequests) {
				resourceRequests = [];
				this.requests.set(requestKey, resourceRequests);
			}
			const callbacks = { resolve, reject };
			resourceRequests.push(callbacks);
			if (groupDuplicates) {
				let duplicateRequests = this.duplicates.get(requestKey);
				if (!duplicateRequests) {
					duplicateRequests = [];
					this.duplicates.set(requestKey, duplicateRequests);
				}
				duplicateRequests.push(callbacks);
			}
		});
	}

	getMaxResources() {
		return this.requests.size;
	}

	run(onloadListener, options) {
		const resourceURLs = [...this.requests.keys()];
		let indexResource = 0;
		return Promise.all(resourceURLs.map(async requestKey => {
			const [resourceURL, asBinary, expectedType, baseURI, blockMixedContent, contentType] = JSON.parse(requestKey);
			const resourceRequests = this.requests.get(requestKey);
			try {
				const currentIndexResource = indexResource;
				indexResource = indexResource + 1;
				const content = await util.getContent(resourceURL, {
					asBinary,
					inline: !options.compressContent,
					expectedType,
					contentType,
					maxResourceSize: options.maxResourceSize,
					maxResourceSizeEnabled: options.maxResourceSizeEnabled,
					frameId: options.windowId,
					resourceReferrer: options.resourceReferrer,
					baseURI,
					blockMixedContent,
					acceptHeaders: options.acceptHeaders,
					networkTimeout: options.networkTimeout
				});
				await onloadListener({ url: resourceURL });
				if (!this.cancelled) {
					const extension = util.getContentTypeExtension(content.contentType) || util.getFilenameExtension(resourceURL, options.filenameReplacedCharacters, options.filenameReplacementCharacter, options.filenameReplacementCharacters);
					resourceRequests.forEach(callbacks => {
						const duplicateCallbacks = this.duplicates.get(requestKey);
						const duplicate = duplicateCallbacks && duplicateCallbacks.length > 1 && duplicateCallbacks.includes(callbacks);
						callbacks.resolve({ content: content.data, indexResource: currentIndexResource, duplicate, contentType: content.contentType, extension });
					});
				}
			} catch (error) {
				indexResource = indexResource + 1;
				await onloadListener({ url: resourceURL });
				resourceRequests.forEach(resourceRequest => resourceRequest.reject(error));
			}
			this.requests.delete(requestKey);
		}));
	}

	cancel() {
		this.cancelled = true;
		const resourceURLs = [...this.requests.keys()];
		resourceURLs.forEach(requestKey => {
			const resourceRequests = this.requests.get(requestKey);
			resourceRequests.forEach(callbacks => callbacks.reject());
			this.requests.delete(requestKey);
		});
	}
}

// ---------
// Processor
// ---------
const SHADOWROOT_ATTRIBUTE_NAME = "shadowrootmode";
const SHADOWROOT_DELEGATES_FOCUS = "shadowrootdelegatesfocus";
const SHADOWROOT_CLONABLE = "shadowrootclonable";
const SHADOWROOT_SERIALIZABLE = "shadowrootserializable";
const SCRIPT_TEMPLATE_SHADOW_ROOT = "data-template-shadow-root";
const SCRIPT_OPTIONS = "data-single-file-options";
const UTF8_CHARSET = "utf-8";

class Processor {
	constructor(options, processorHelper, batchRequest) {
		this.options = options;
		this.processorHelper = processorHelper;
		this.stats = new Stats(options);
		this.baseURI = normalizeURL(options.baseURI || options.url);
		this.batchRequest = batchRequest;
		this.stylesheets = new Map();
		this.styles = new Map();
		this.resources = {
			cssVariables: new Map(),
			fonts: new Map(),
			worklets: new Map(),
			stylesheets: new Map(),
			scripts: new Map(),
			images: new Map(),
			frames: new Map()
		};
		this.fontTests = options.fontTests;
	}

	initialize() {
		this.options.saveDate = new Date();
		this.options.saveUrl = this.options.url;
		if (this.options.enableMaff) {
			this.maffMetaDataPromise = this.batchRequest.addURL(util.resolveURL("index.rdf", this.options.baseURI || this.options.url), { expectedType: "document" });
		}
		this.maxResources = this.batchRequest.getMaxResources();
		if (!this.options.removeFrames && this.options.frames) {
			this.options.frames.forEach(frameData => this.maxResources += frameData.maxResources || 0);
		}
		this.stats.set("processed", "resources", this.maxResources);
	}

	async loadPage(pageContent, charset) {
		let content;
		if (!pageContent || this.options.saveRawPage) {
			content = await util.getContent(this.baseURI, {
				inline: !this.options.compressContent,
				maxResourceSize: this.options.maxResourceSize,
				maxResourceSizeEnabled: this.options.maxResourceSizeEnabled,
				charset,
				frameId: this.options.windowId,
				resourceReferrer: this.options.resourceReferrer,
				expectedType: "document",
				acceptHeaders: this.options.acceptHeaders,
				networkTimeout: this.options.networkTimeout
			});
			pageContent = content.data || "";
		}
		this.doc = util.parseDocContent(pageContent, this.baseURI);
		util.fixInvalidNesting(this.doc);
		if (this.options.saveRawPage) {
			let charset;
			this.doc.querySelectorAll("meta[charset]").forEach(element => {
				if (!charset) {
					charset = element.getAttribute("charset").trim().toLowerCase();
				}
			});
			if (!charset) {
				this.doc.querySelectorAll("meta[http-equiv=\"content-type\"]").forEach(element => {
					const charsetDeclaration = element.content.split(";")[1];
					if (charsetDeclaration && !charset) {
						charset = charsetDeclaration.split("=")[1].trim().toLowerCase();
					}
				});
			}
			if (charset && content.charset && charset != content.charset.toLowerCase()) {
				return this.loadPage(pageContent, charset);
			}
		}
		this.workStyleElement = this.doc.createElement("style");
		this.doc.body.appendChild(this.workStyleElement);
		this.onEventAttributeNames = getOnEventAttributeNames(this.doc);
	}

	finalize() {
		if (this.workStyleElement.parentNode) {
			this.workStyleElement.remove();
		}
	}

	async getPageData() {
		let commentText;
		util.postProcessDoc(this.doc);
		const url = util.parseURL(this.baseURI);
		if (this.options.insertSingleFileComment) {
			const firstComment = this.doc.documentElement.firstChild;
			let infobarURL = this.options.saveUrl, infobarSaveDate = this.options.saveDate;
			if (firstComment.nodeType == 8 && (firstComment.textContent.includes(util.COMMENT_HEADER_LEGACY) || firstComment.textContent.includes(util.COMMENT_HEADER))) {
				const info = this.doc.documentElement.firstChild.textContent.split("\n");
				try {
					const [, , url, saveDate] = info;
					infobarURL = url.split("url: ")[1].trim();
					infobarSaveDate = saveDate.split("saved date: ")[1];
					firstComment.remove();
					// eslint-disable-next-line no-unused-vars
				} catch (error) {
					// ignored
				}
			}
			const infobarContent = (this.options.infobarContent || "").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
			commentText = "\n " + (this.options.useLegacyCommentHeader ? util.COMMENT_HEADER_LEGACY : util.COMMENT_HEADER) +
				" \n url: " + infobarURL +
				(this.options.removeSavedDate ? " " : " \n saved date: " + infobarSaveDate) +
				(infobarContent ? " \n info: " + infobarContent : "") + "\n";
			const commentNode = this.doc.createComment(commentText);
			this.doc.documentElement.insertBefore(commentNode, this.doc.documentElement.firstChild);
		}
		const legacyInfobarElement = this.doc.querySelector("singlefile-infobar");
		if (legacyInfobarElement) {
			legacyInfobarElement.remove();
		}
		const infobarElement = this.doc.querySelector(util.INFOBAR_TAGNAME);
		if (infobarElement) {
			infobarElement.remove();
		}
		if (this.options.includeInfobar) {
			util.appendInfobar(this.doc, this.options);
		}
		if (this.doc.querySelector("template[" + SHADOWROOT_ATTRIBUTE_NAME + "]") || (this.options.shadowRoots && this.options.shadowRoots.length)) {
			if (this.options.blockScripts) {
				this.doc.querySelectorAll("script[" + SCRIPT_TEMPLATE_SHADOW_ROOT + "]").forEach(element => element.remove());
			}
			const scriptElement = this.doc.createElement("script");
			scriptElement.setAttribute(SCRIPT_TEMPLATE_SHADOW_ROOT, "");
			scriptElement.textContent = `(()=>{document.currentScript.remove();processNode(document);function processNode(node){node.querySelectorAll("template[${SHADOWROOT_ATTRIBUTE_NAME}]").forEach(element=>{let shadowRoot = element.parentElement.shadowRoot;if (!shadowRoot) {try {shadowRoot=element.parentElement.attachShadow({mode:element.getAttribute("${SHADOWROOT_ATTRIBUTE_NAME}"),delegatesFocus:element.getAttribute("${SHADOWROOT_DELEGATES_FOCUS}")!=null,clonable:element.getAttribute("${SHADOWROOT_CLONABLE}")!=null,serializable:element.getAttribute("${SHADOWROOT_SERIALIZABLE}")!=null});shadowRoot.innerHTML=element.innerHTML;element.remove()} catch (error) {} if (shadowRoot) {processNode(shadowRoot)}}})}})()`;
			this.doc.body.appendChild(scriptElement);
		}
		if (this.options.insertCanonicalLink && this.options.saveUrl.match(HTTP_URI_PREFIX)) {
			let canonicalLink = this.doc.querySelector("link[rel=canonical]");
			if (!canonicalLink) {
				canonicalLink = this.doc.createElement("link");
				canonicalLink.setAttribute("rel", "canonical");
				this.doc.head.appendChild(canonicalLink);
			}
			if (canonicalLink && !canonicalLink.href) {
				canonicalLink.href = this.options.saveUrl;
			}
		}
		if (this.options.insertMetaCSP) {
			const metaElement = this.doc.createElement("meta");
			metaElement.httpEquiv = "content-security-policy";
			this.processorHelper.setMetaCSP(metaElement);
			this.doc.head.appendChild(metaElement);
		}
		if (this.options.insertMetaNoIndex) {
			let metaElement = this.doc.querySelector("meta[name=robots][content*=noindex]");
			if (!metaElement) {
				metaElement = this.doc.createElement("meta");
				metaElement.setAttribute("name", "robots");
				metaElement.setAttribute("content", "noindex");
				this.doc.head.appendChild(metaElement);
			}
		}
		const styleElement = this.doc.createElement("style");
		if (this.doc.querySelector("img[src=\"data:,\"],source[src=\"data:,\"]")) {
			styleElement.textContent = "img[src=\"data:,\"],source[src=\"data:,\"]{display:none!important}";
			this.doc.head.appendChild(styleElement);
		}
		let size;
		if (this.options.displayStats) {
			size = util.getContentSize(this.doc.documentElement.outerHTML);
		}
		if (this.doc.querySelector(`[${util.NESTING_TRACK_ID_ATTRIBUTE_NAME}]`)) {
			const scriptElement = this.doc.createElement("script");
			scriptElement.textContent = `(${util.getFixInvalidNestingSource()})(document, "${util.NESTING_TRACK_ID_ATTRIBUTE_NAME}");`;
			this.doc.body.appendChild(scriptElement);
		}
		const content = util.serialize(this.doc, this.options.compressHTML);
		if (this.options.displayStats) {
			const contentSize = util.getContentSize(content);
			this.stats.set("processed", "HTML bytes", contentSize);
			this.stats.add("discarded", "HTML bytes", size - contentSize);
		}
		const filename = await util.formatFilename(content, this.doc, this.options);
		const mimeType = util.getMimeType(this.options);
		const matchTitle = this.baseURI.match(/([^/]*)\/?(\.html?.*)$/) || this.baseURI.match(/\/\/([^/]*)\/?$/);
		const additionalData = this.processorHelper.getAdditionalPageData(this.doc, content, this.resources);
		const pageData = Object.assign({
			stats: this.stats.data,
			title: this.options.title || (this.baseURI && matchTitle ? matchTitle[1] : url.hostname ? url.hostname : ""),
			filename,
			mimeType,
			content,
			comment: commentText,
		}, additionalData);
		if (this.options.addProof) {
			pageData.hash = await util.digest("SHA-256", content);
		}
		if (this.options.retrieveLinks) {
			pageData.links = Array.from(new Set(Array.from(this.doc.links).map(linkElement => linkElement.href)));
		}
		return pageData;
	}

	preProcessPage() {
		this.doc.body.querySelectorAll(":not(svg) title, meta, link[href][rel*=\"icon\"]").forEach(element => {
			if ((this.options.win && element instanceof this.options.win.HTMLElement) || element instanceof globalThis.HTMLElement) {
				this.doc.head.appendChild(element);
			}
		});
		if (this.options.images && !this.options.saveRawPage) {
			this.doc.querySelectorAll("img[" + util.IMAGE_ATTRIBUTE_NAME + "]").forEach(imgElement => {
				const attributeValue = imgElement.getAttribute(util.IMAGE_ATTRIBUTE_NAME);
				if (attributeValue) {
					const imageData = this.options.images[Number(attributeValue)];
					if (imageData) {
						if (this.options.removeHiddenElements && (
							(imageData.size && !imageData.size.pxWidth && !imageData.size.pxHeight) ||
							imgElement.getAttribute(util.HIDDEN_CONTENT_ATTRIBUTE_NAME) == "")
						) {
							imgElement.setAttribute("src", util.EMPTY_RESOURCE);
						} else {
							if (imageData.currentSrc) {
								imgElement.dataset.singleFileOriginURL = imgElement.getAttribute("src");
								imgElement.setAttribute("src", imageData.currentSrc);
							}
							if (this.options.loadDeferredImages) {
								if ((!imgElement.getAttribute("src") || imgElement.getAttribute("src") == util.EMPTY_RESOURCE) && imgElement.getAttribute("data-src")) {
									imageData.src = imgElement.dataset.src;
									imgElement.setAttribute("src", imgElement.dataset.src);
									imgElement.removeAttribute("data-src");
								}
							}
						}
					}
				}
			});
			if (this.options.loadDeferredImages) {
				this.doc.querySelectorAll("img[data-srcset]").forEach(imgElement => {
					if (!imgElement.getAttribute("srcset") && imgElement.getAttribute("data-srcset")) {
						imgElement.setAttribute("srcset", imgElement.dataset.srcset);
						imgElement.removeAttribute("data-srcset");
					}
				});
			}
		}
	}

	loadOptionsFromPage() {
		const optionsElement = this.doc.body.querySelector("script[type=\"application/json\"][" + SCRIPT_OPTIONS + "]");
		if (optionsElement) {
			const options = JSON.parse(optionsElement.textContent);
			Object.keys(options).forEach(option => this.options[option] = options[option]);
			this.options.saveDate = new Date(this.options.saveDate);
			this.options.visitDate = new Date(this.options.visitDate);
		}
	}

	saveFilenameTemplateData() {
		const optionsElement = this.doc.querySelector("script[" + SCRIPT_OPTIONS + "][type=\"application/json\"]");
		if (!optionsElement) {
			const optionsElement = this.doc.createElement("script");
			optionsElement.type = "application/json";
			optionsElement.setAttribute(SCRIPT_OPTIONS, "");
			optionsElement.textContent = JSON.stringify({
				saveUrl: this.options.url,
				saveDate: this.options.saveDate.getTime(),
				visitDate: this.options.visitDate.getTime(),
				filenameTemplate: this.options.filenameTemplate,
				filenameReplacedCharacters: this.options.filenameReplacedCharacters,
				filenameReplacementCharacter: this.options.filenameReplacementCharacter,
				filenameReplacementCharacters: this.options.filenameReplacementCharacters,
				filenameMaxLengthUnit: this.options.filenameMaxLengthUnit,
				filenameMaxLength: this.options.filenameMaxLength,
				replaceEmojisInFilename: this.options.replaceEmojisInFilename,
				compressContent: this.options.compressContent,
				selfExtractingArchive: this.options.selfExtractingArchive,
				extractDataFromPage: this.options.extractDataFromPage,
				referrer: this.options.referrer,
				title: this.options.title,
				info: this.options.info
			});
			if (this.doc.body.firstChild) {
				this.doc.body.insertBefore(optionsElement, this.doc.body.firstChild);
			} else {
				this.doc.body.appendChild(optionsElement);
			}
		}
	}

	replaceStyleContents() {
		if (this.options.stylesheets) {
			this.doc.querySelectorAll("style").forEach((styleElement, styleIndex) => {
				const attributeValue = styleElement.getAttribute(util.STYLESHEET_ATTRIBUTE_NAME);
				if (attributeValue) {
					const stylesheetContent = this.options.stylesheets[Number(styleIndex)];
					if (stylesheetContent) {
						styleElement.textContent = stylesheetContent;
					}
				}
			});
		}
		if (this.options.adoptedStyleSheets && this.options.adoptedStyleSheets.length) {
			const styleElement = this.doc.createElement("style");
			styleElement.textContent = this.options.adoptedStyleSheets.join("\n");
			this.doc.body.appendChild(styleElement);
		}
	}

	removeUnselectedElements() {
		removeUnmarkedElements(this.doc.body);
		this.doc.body.removeAttribute(util.SELECTED_CONTENT_ATTRIBUTE_NAME);

		function removeUnmarkedElements(element) {
			let selectedElementFound = false;
			Array.from(element.childNodes).forEach(node => {
				if (node.nodeType == 1) {
					const isSelectedElement = node.getAttribute(util.SELECTED_CONTENT_ATTRIBUTE_NAME) == "";
					selectedElementFound = selectedElementFound || isSelectedElement;
					if (isSelectedElement) {
						node.removeAttribute(util.SELECTED_CONTENT_ATTRIBUTE_NAME);
						removeUnmarkedElements(node);
					} else if (selectedElementFound) {
						removeNode(node);
					} else {
						hideNode(node);
					}
				}
			});
		}

		function removeNode(node) {
			if ((node.nodeType != 1 || !node.querySelector("svg,style,link")) && canHideNode(node)) {
				node.remove();
			} else {
				hideNode(node);
			}
		}

		function hideNode(node) {
			if (canHideNode(node)) {
				node.style.setProperty("display", "none", "important");
				node.removeAttribute("src");
				node.removeAttribute("srcset");
				node.removeAttribute("srcdoc");
				Array.from(node.childNodes).forEach(removeNode);
			}
		}

		function canHideNode(node) {
			if (node.nodeType == 1) {
				const tagName = node.tagName && node.tagName.toUpperCase();
				return tagName != "SVG" && tagName != "STYLE" && tagName != "LINK";
			}
		}
	}

	insertVideoPosters() {
		if (this.options.posters) {
			this.doc.querySelectorAll("video, video > source").forEach(element => {
				let videoElement;
				if (element.tagName.toUpperCase() == "VIDEO") {
					videoElement = element;
				} else {
					videoElement = element.parentElement;
				}
				const attributeValue = element.getAttribute(util.POSTER_ATTRIBUTE_NAME);
				if (attributeValue) {
					const posterURL = this.options.posters[Number(attributeValue)];
					if (!videoElement.getAttribute("poster") && posterURL) {
						videoElement.setAttribute("poster", posterURL);
					}
				}
			});
		}
	}

	insertVideoLinks() {
		const LINK_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABAAgMAAADXB5lNAAABhmlDQ1BJQ0MgcHJvZmlsZQAAKJF9kj1Iw0AYht+mSkUrDnYQcchQnSyIijqWKhbBQmkrtOpgcukfNGlIUlwcBdeCgz+LVQcXZ10dXAVB8AfEydFJ0UVK/C4ptIjx4LiH9+59+e67A4RGhalm1wSgapaRisfEbG5VDLyiDwEAvZiVmKkn0osZeI6ve/j4ehfhWd7n/hz9St5kgE8kjjLdsIg3iGc2LZ3zPnGIlSSF+Jx43KACiR+5Lrv8xrnosMAzQ0YmNU8cIhaLHSx3MCsZKvE0cVhRNcoXsi4rnLc4q5Uaa9XJbxjMaytprtMcQRxLSCAJETJqKKMCCxFaNVJMpGg/5uEfdvxJcsnkKoORYwFVqJAcP/gb/O6tWZiadJOCMaD7xbY/RoHALtCs2/b3sW03TwD/M3Cltf3VBjD3SXq9rYWPgIFt4OK6rcl7wOUOMPSkS4bkSH6aQqEAvJ/RM+WAwVv6EGtu31r7OH0AMtSr5Rvg4BAYK1L2use9ezr79u+ZVv9+AFlNcp0UUpiqAAAACXBIWXMAAC4jAAAuIwF4pT92AAAAB3RJTUUH5AsHAB8H+DhhoQAAABl0RVh0Q29tbWVudABDcmVhdGVkIHdpdGggR0lNUFeBDhcAAAAJUExURQAAAICHi4qKioTuJAkAAAABdFJOUwBA5thmAAAAAWJLR0QCZgt8ZAAAAJJJREFUOI3t070NRCEMA2CnYAOyDyPwpHj/Va7hJ3FzV7zy3ET5JIwoAF6Jk4wzAJAkzxAYG9YRTgB+24wBgKmfrGAKTcEfAY4KRlRoIeBTgKOCERVaCPgU4Khge2GqKOBTgKOCERVaAEC/4PNcnyoSWHpjqkhwKxbcig0Q6AorXYF/+A6eIYD1lVbwG/jdA6/kA2THRAURVubcAAAAAElFTkSuQmCC";
		const ICON_SIZE = "16px";
		this.doc.querySelectorAll("video").forEach(videoElement => {
			const attributeValue = videoElement.getAttribute(util.VIDEO_ATTRIBUTE_NAME);
			if (attributeValue) {
				const videoData = this.options.videos[Number(attributeValue)];
				const src = (videoData && videoData.src) || videoElement.src;
				if (videoElement && src) {
					const linkElement = this.doc.createElement("a");
					const imgElement = this.doc.createElement("img");
					linkElement.href = src;
					linkElement.target = "_blank";
					linkElement.style.setProperty("z-index", 2147483647, "important");
					linkElement.style.setProperty("position", "absolute", "important");
					linkElement.style.setProperty("top", "8px", "important");
					linkElement.style.setProperty("left", "8px", "important");
					linkElement.style.setProperty("width", ICON_SIZE, "important");
					linkElement.style.setProperty("height", ICON_SIZE, "important");
					linkElement.style.setProperty("min-width", ICON_SIZE, "important");
					linkElement.style.setProperty("min-height", ICON_SIZE, "important");
					linkElement.style.setProperty("max-width", ICON_SIZE, "important");
					linkElement.style.setProperty("max-height", ICON_SIZE, "important");
					imgElement.src = LINK_ICON;
					imgElement.style.setProperty("width", ICON_SIZE, "important");
					imgElement.style.setProperty("height", ICON_SIZE, "important");
					imgElement.style.setProperty("min-width", ICON_SIZE, "important");
					imgElement.style.setProperty("min-height", ICON_SIZE, "important");
					imgElement.style.setProperty("max-width", ICON_SIZE, "important");
					imgElement.style.setProperty("max-height", ICON_SIZE, "important");
					linkElement.appendChild(imgElement);
					videoElement.insertAdjacentElement("afterend", linkElement);
					const positionInlineParent = videoElement.parentNode.style.getPropertyValue("position");
					if ((!videoData.positionParent && (!positionInlineParent || positionInlineParent != "static")) || videoData.positionParent == "static") {
						videoElement.parentNode.style.setProperty("position", "relative", "important");
					}
				}
			}
		});
	}

	removeFrames() {
		const frameElements = this.doc.querySelectorAll("iframe, frame, object[type=\"text/html\"][data]");
		this.stats.set("discarded", "frames", frameElements.length);
		this.stats.set("processed", "frames", frameElements.length);
		this.doc.querySelectorAll("iframe, frame, object[type=\"text/html\"][data]").forEach(element => element.remove());
	}

	removeEmbedScripts() {
		const JAVASCRIPT_URI_PREFIX = "javascript:";
		const DISABLED_SCRIPT = "javascript:void(0)";
		this.onEventAttributeNames.forEach(attributeName => this.doc.querySelectorAll("[" + attributeName + "]").forEach(element => element.removeAttribute(attributeName)));
		this.doc.querySelectorAll("[href]").forEach(element => {
			if (element.href && element.href.match && element.href.trim().startsWith(JAVASCRIPT_URI_PREFIX)) {
				element.setAttribute("href", DISABLED_SCRIPT);
			}
		});
		this.doc.querySelectorAll("[src]").forEach(element => {
			if (element.src && element.src.trim().startsWith(JAVASCRIPT_URI_PREFIX)) {
				element.setAttribute("src", DISABLED_SCRIPT);
			}
		});
		const scriptElements = this.doc.querySelectorAll("script:not([type=\"application/ld+json\"]):not([" + SCRIPT_TEMPLATE_SHADOW_ROOT + "]):not([" + SCRIPT_OPTIONS + "])");
		this.stats.set("discarded", "scripts", scriptElements.length);
		this.stats.set("processed", "scripts", scriptElements.length);
		scriptElements.forEach(element => element.remove());
	}

	removeDiscardedResources() {
		this.doc.querySelectorAll("." + util.SINGLE_FILE_UI_ELEMENT_CLASS).forEach(element => element.remove());
		if (this.options.removeNoScriptTags === false) {
			const noscriptPlaceholders = new Map();
			this.doc.querySelectorAll("noscript").forEach(noscriptElement => {
				const placeholderElement = this.doc.createElement("div");
				placeholderElement.innerHTML = noscriptElement.dataset[util.NO_SCRIPT_PROPERTY_NAME];
				noscriptElement.replaceWith(placeholderElement);
				noscriptPlaceholders.set(placeholderElement, noscriptElement);
			});
			noscriptPlaceholders.forEach((noscriptElement, placeholderElement) => {
				noscriptElement.dataset[util.NO_SCRIPT_PROPERTY_NAME] = placeholderElement.innerHTML;
				placeholderElement.replaceWith(noscriptElement);
			});
		} else {
			this.doc.querySelectorAll("noscript").forEach(element => element.remove());
		}
		this.doc.querySelectorAll("meta[http-equiv=refresh], meta[disabled-http-equiv]").forEach(element => element.remove());
		this.doc.querySelectorAll("meta[http-equiv=\"content-security-policy\"]").forEach(element => element.remove());
		const objectElements = this.doc.querySelectorAll("applet, object[data]:not([type=\"image/svg+xml\"]):not([type=\"image/svg-xml\"]):not([type=\"text/html\"]):not([data*=\".svg\"]):not([data*=\".pdf\"]), embed[src]:not([src*=\".svg\"]):not([src*=\".pdf\"])");
		this.stats.set("discarded", "objects", objectElements.length);
		this.stats.set("processed", "objects", objectElements.length);
		objectElements.forEach(element => element.remove());
		const replacedAttributeValue = this.doc.querySelectorAll("link[rel~=preconnect], link[rel~=prerender], link[rel~=dns-prefetch], link[rel~=preload], link[rel~=manifest], link[rel~=prefetch], link[rel~=modulepreload]");
		replacedAttributeValue.forEach(element => {
			const relValue = element
				.getAttribute("rel")
				.replace(/(preconnect|prerender|dns-prefetch|preload|prefetch|manifest|modulepreload)/g, "")
				.trim();
			if (relValue.length) {
				element.setAttribute("rel", relValue);
			} else {
				element.remove();
			}
		});
		this.processorHelper.removeUnusedStylesheets(this.doc);
		this.doc.querySelectorAll("link[rel*=stylesheet]:not([href]),link[rel*=stylesheet][href=\"\"]").forEach(element => element.remove());
		if (this.options.removeHiddenElements) {
			this.doc.querySelectorAll("input[type=hidden]").forEach(element => element.remove());
		}
		if (!this.options.saveFavicon) {
			this.doc.querySelectorAll("link[rel*=\"icon\"]").forEach(element => element.remove());
		}
		this.doc.querySelectorAll("a[ping], area[ping]").forEach(element => element.removeAttribute("ping"));
		this.doc.querySelectorAll("a[attributionsrc], img[attributionsrc], script[attributionsrc]").forEach(element => element.removeAttribute("attributionsrc"));
		this.doc.querySelectorAll("link[rel=import][href]").forEach(element => element.remove());
		this.doc.querySelectorAll("link[rel=compression-dictionary]").forEach(element => element.remove());
	}

	replaceInvalidElements() {
		this.doc.querySelectorAll("template[" + util.INVALID_ELEMENT_ATTRIBUTE_NAME + "]").forEach(templateElement => {
			const placeHolderElement = this.doc.createElement("span");
			if (templateElement.content) {
				const originalElement = templateElement.content.firstChild;
				if (originalElement) {
					if (originalElement.hasAttributes()) {
						Array.from(originalElement.attributes).forEach(attribute => {
							try {
								placeHolderElement.setAttribute(attribute.name, attribute.value);
								// eslint-disable-next-line no-unused-vars
							} catch (error) {
								// ignored
							}
						});
					}
					originalElement.childNodes.forEach(childNode => placeHolderElement.appendChild(childNode.cloneNode(true)));
				}
				try {
					templateElement.replaceWith(placeHolderElement);
					// eslint-disable-next-line no-unused-vars
				} catch (error) {
					if (originalElement) {
						templateElement.replaceWith(originalElement);
					} else {
						templateElement.remove();
					}
				}
			}
		});
	}

	resetCharsetMeta() {
		let charset;
		this.doc.querySelectorAll("meta[charset], meta[http-equiv=\"content-type\"]").forEach(element => {
			const charsetDeclaration = element.content.split(";")[1];
			if (charsetDeclaration && !charset) {
				charset = charsetDeclaration.split("=")[1];
				if (charset) {
					this.charset = charset.trim().toLowerCase();
				}
			}
			element.remove();
		});
		const metaElement = this.doc.createElement("meta");
		metaElement.setAttribute("charset", UTF8_CHARSET);
		if (this.doc.head.firstChild) {
			this.doc.head.insertBefore(metaElement, this.doc.head.firstChild);
		} else {
			this.doc.head.appendChild(metaElement);
		}
	}

	resetReferrerMeta() {
		this.doc.querySelectorAll("meta[name=referrer]").forEach(element => element.remove());
		const metaElement = this.doc.createElement("meta");
		metaElement.setAttribute("name", "referrer");
		metaElement.setAttribute("content", "no-referrer");
		this.doc.head.appendChild(metaElement);
	}

	setInputValues() {
		if (!this.options.saveRawPage) {
			this.doc.querySelectorAll("input, textarea").forEach(input => {
				const value = input.getAttribute(util.INPUT_VALUE_ATTRIBUTE_NAME);
				if (value != null) {
					if (input.tagName.toUpperCase() == "TEXTAREA") {
						input.textContent = value;
					} else {
						input.setAttribute("value", value);
					}
				} else {
					input.removeAttribute("value");
				}
			});
			this.doc.querySelectorAll("input[type=radio], input[type=checkbox]").forEach(input => {
				const value = input.getAttribute(util.INPUT_CHECKED_ATTRIBUTE_NAME);
				if (value == "true") {
					input.setAttribute("checked", "");
				} else {
					input.removeAttribute("checked");
				}
			});
			this.doc.querySelectorAll("select").forEach(select => {
				select.querySelectorAll("option").forEach(option => {
					const selected = option.getAttribute(util.INPUT_VALUE_ATTRIBUTE_NAME) != null;
					if (selected) {
						option.setAttribute("selected", "");
					} else {
						option.removeAttribute("selected");
					}
				});
			});
		}
	}

	moveStylesInHead() {
		this.doc.querySelectorAll("style").forEach(stylesheet => {
			if (stylesheet.getAttribute(util.STYLE_ATTRIBUTE_NAME) == "") {
				this.doc.head.appendChild(stylesheet);
			}
		});
	}

	saveFavicon() {
		let faviconElement = this.doc.querySelector("link[href][rel=\"shortcut icon\"]");
		if (!faviconElement) {
			faviconElement = this.doc.querySelector("link[href][rel=\"icon\"]");
		}
		if (!faviconElement) {
			faviconElement = this.doc.createElement("link");
			faviconElement.setAttribute("type", "image/x-icon");
			faviconElement.setAttribute("rel", "shortcut icon");
			faviconElement.setAttribute("href", "/favicon.ico");
		}
		this.doc.head.appendChild(faviconElement);
	}

	saveScrollPosition() {
		if (this.options.scrollPosition && this.options.scrolling == "no" && (this.options.scrollPosition.x || this.options.scrollPosition.y)) {
			const scriptElement = this.doc.createElement("script");
			scriptElement.textContent = "document.currentScript.remove();addEventListener(\"load\",()=>scrollTo(" + this.options.scrollPosition.x + "," + this.options.scrollPosition.y + "))";
			this.doc.body.appendChild(scriptElement);
		}
	}

	replaceCanvasElements() {
		if (this.options.canvases) {
			this.doc.querySelectorAll("canvas").forEach(canvasElement => {
				const attributeValue = canvasElement.getAttribute(util.CANVAS_ATTRIBUTE_NAME);
				if (attributeValue) {
					const canvasData = this.options.canvases[Number(attributeValue)];
					if (canvasData) {
						const backgroundStyle = {};
						if (canvasData.backgroundColor) {
							backgroundStyle["background-color"] = canvasData.backgroundColor;
						}
						this.processorHelper.setBackgroundImage(canvasElement, "url(" + canvasData.dataURI + ")", backgroundStyle);
						this.stats.add("processed", "canvas", 1);
					}
				}
			});
		}
	}

	insertFonts() {
		if (this.options.fonts && this.options.fonts.length) {
			let firstStylesheet = this.doc.querySelector("style, link[rel=stylesheet]"), previousStyleElement;
			this.options.fonts.forEach(fontData => {
				if (fontData["font-family"] && fontData.src) {
					let stylesheetContent = "@font-face{";
					let stylesContent = "";
					Object.keys(fontData).forEach(fontStyle => {
						if (stylesContent) {
							stylesContent += ";";
						}
						stylesContent += fontStyle + ":" + fontData[fontStyle];
					});
					stylesheetContent += stylesContent + "}";
					const styleElement = this.doc.createElement("style");
					styleElement.textContent = stylesheetContent;
					if (previousStyleElement) {
						previousStyleElement.insertAdjacentElement("afterend", styleElement);
					} else if (firstStylesheet) {
						firstStylesheet.parentElement.insertBefore(styleElement, firstStylesheet);
					} else {
						this.doc.head.appendChild(styleElement);
					}
					previousStyleElement = styleElement;
				}
			});
		}
	}

	removeHiddenElements() {
		const hiddenElements = this.doc.querySelectorAll("[" + util.HIDDEN_CONTENT_ATTRIBUTE_NAME + "]");
		const removedElements = this.doc.querySelectorAll("[" + util.REMOVED_CONTENT_ATTRIBUTE_NAME + "]");
		this.stats.set("discarded", "hidden elements", removedElements.length);
		this.stats.set("processed", "hidden elements", removedElements.length);
		if (hiddenElements.length) {
			const className = "sf-hidden";
			const stylesheetContent = "." + className + "{display:none!important}";
			let foundStylesheet = false;
			this.doc.querySelectorAll("style").forEach(styleElement => {
				if (styleElement.textContent == stylesheetContent) {
					foundStylesheet = true;
				}
			});
			if (!foundStylesheet) {
				const styleElement = this.doc.createElement("style");
				styleElement.textContent = stylesheetContent;
				this.doc.head.appendChild(styleElement);
			}
			hiddenElements.forEach(element => {
				if (element.style.getPropertyValue("display") != "none") {
					if (element.style.getPropertyPriority("display") == "important") {
						element.style.setProperty("display", "none", "important");
					} else if (!element.classList.contains(className)) {
						element.classList.add(className);
					}
				}
			});
		}
		removedElements.forEach(element => element.remove());
	}

	resolveHrefs() {
		if (this.options.resolveLinks === undefined || this.options.resolveLinks) {
			this.doc.querySelectorAll("a[href], area[href]").forEach(element => {
				const href = element.getAttribute("href").trim();
				if (!testIgnoredPath(href)) {
					let resolvedURL;
					try {
						resolvedURL = util.resolveURL(href, this.options.baseURI || this.options.url);
						// eslint-disable-next-line no-unused-vars
					} catch (error) {
						// ignored
					}
					if (resolvedURL) {
						const url = normalizeURL(this.options.url);
						if (resolvedURL.startsWith(url + "#") && !resolvedURL.startsWith(url + "#!") && !this.options.resolveFragmentIdentifierURLs) {
							resolvedURL = resolvedURL.substring(url.length);
						}
						try {
							element.setAttribute("href", resolvedURL);
							// eslint-disable-next-line no-unused-vars
						} catch (error) {
							// ignored
						}
					}
				}
			});
		}
		this.doc.querySelectorAll("link[href]").forEach(element => {
			const href = element.getAttribute("href").trim();
			if (element.rel.includes("stylesheet") && this.options.saveOriginalURLs && !isDataURL(href)) {
				element.setAttribute("data-sf-original-href", href);
			}
			if (!testIgnoredPath(href)) {
				let resolvedURL;
				try {
					resolvedURL = util.resolveURL(href, this.options.baseURI || this.options.url);
					// eslint-disable-next-line no-unused-vars
				} catch (error) {
					// ignored
				}
				if (resolvedURL) {
					try {
						element.setAttribute("href", resolvedURL);
						// eslint-disable-next-line no-unused-vars
					} catch (error) {
						// ignored
					}
				}
			}
		});
	}

	async insertMissingVideoPosters() {
		await Promise.all(Array.from(this.doc.querySelectorAll("video[src], video > source[src]")).map(async element => {
			let videoElement;
			if (element.tagName.toUpperCase() == "VIDEO") {
				videoElement = element;
			} else {
				videoElement = element.parentElement;
			}
			if (!videoElement.poster) {
				const attributeValue = videoElement.getAttribute(util.VIDEO_ATTRIBUTE_NAME);
				if (attributeValue) {
					const videoData = this.options.videos[Number(attributeValue)];
					const src = videoData.src || videoElement.src;
					if (src) {
						const temporaryVideoElement = this.doc.createElement("video");
						temporaryVideoElement.src = src;
						temporaryVideoElement.style.setProperty("width", videoData.size.pxWidth + "px", "important");
						temporaryVideoElement.style.setProperty("height", videoData.size.pxHeight + "px", "important");
						temporaryVideoElement.style.setProperty("display", "none", "important");
						temporaryVideoElement.crossOrigin = "anonymous";
						const canvasElement = this.doc.createElement("canvas");
						const context = canvasElement.getContext("2d");
						this.options.doc.body.appendChild(temporaryVideoElement);
						return new Promise(resolve => {
							temporaryVideoElement.currentTime = videoData.currentTime;
							temporaryVideoElement.oncanplay = () => {
								canvasElement.width = videoData.size.pxWidth;
								canvasElement.height = videoData.size.pxHeight;
								context.drawImage(temporaryVideoElement, 0, 0, canvasElement.width, canvasElement.height);
								try {
									videoElement.poster = canvasElement.toDataURL("image/png", "");
									// eslint-disable-next-line no-unused-vars
								} catch (error) {
									// ignored
								}
								temporaryVideoElement.remove();
								resolve();
							};
							temporaryVideoElement.onerror = () => {
								temporaryVideoElement.remove();
								resolve();
							};
						});
					}
				}
			}
		}));
	}

	resolveStyleAttributeURLs() {
		this.doc.querySelectorAll("[style]").forEach(element => {
			if (this.options.blockStylesheets) {
				element.removeAttribute("style");
			} else {
				const styleContent = element.getAttribute("style");
				const declarationList = cssTree.parse(styleContent, { context: "declarationList", parseCustomProperty: true });
				this.processorHelper.resolveStylesheetURLs(declarationList, this.baseURI, this.workStyleElement);
				this.styles.set(element, declarationList);
			}
		});
	}

	async resolveStylesheetsURLs() {
		const scriptContents = [];
		this.options.inlineStylesheets = new Map();
		this.options.inlineStylesheetsRefs = new Map();
		this.doc.querySelectorAll("style").forEach(element => {
			if (element.textContent) {
				const indexContent = scriptContents.indexOf(element.textContent);
				if (indexContent == -1) {
					this.options.inlineStylesheets.set(scriptContents.length, element.textContent);
					scriptContents.push(element.textContent);
				} else {
					this.options.inlineStylesheetsRefs.set(element, indexContent);
				}
			}
		});
		await Promise.all(Array.from(this.doc.querySelectorAll("style, link[rel*=stylesheet]:not([disabled])")).map(async element => {
			const options = Object.assign({}, this.options, { charset: this.charset });
			let mediaText;
			if (element.media) {
				mediaText = element.media.toLowerCase();
			}
			const scoped = Boolean(element.closest("[" + SHADOWROOT_ATTRIBUTE_NAME + "]"));
			const stylesheetInfo = {
				mediaText,
				scoped
			};
			await this.processorHelper.resolveStylesheets(element, stylesheetInfo, this.stylesheets, this.baseURI, options, this.workStyleElement, this.resources);
		}));
		if (this.options.rootDocument) {
			const newResources = Object.keys(this.options.updatedResources)
				.filter(url => this.options.updatedResources[url].type == "stylesheet" && !this.options.updatedResources[url].retrieved)
				.map(url => this.options.updatedResources[url]);
			await Promise.all(newResources.map(async resource => {
				resource.retrieved = true;
				if (!this.options.blockStylesheets) {
					const stylesheetInfo = {};
					const element = this.doc.createElement("style");
					this.doc.body.appendChild(element);
					element.textContent = resource.content;
					await this.processorHelper.resolveStylesheetElement(element, stylesheetInfo, this.stylesheets, this.baseURI, this.options, this.workStyleElement, this.resources);
				}
			}));
		}
	}

	async resolveFrameURLs() {
		const processorHelper = this.processorHelper;
		const frameElements = Array.from(this.doc.querySelectorAll("iframe, frame, object[type=\"text/html\"][data]"));
		await Promise.all(frameElements.map(async frameElement => {
			const src = frameElement.getAttribute("src");
			let url;
			if (frameElement.tagName.toUpperCase() == "OBJECT") {
				frameElement.setAttribute("data", "data:text/html,");
			} else {
				frameElement.removeAttribute("src");
				frameElement.removeAttribute("srcdoc");
			}
			Array.from(frameElement.childNodes).forEach(node => node.remove());
			if (src && !testIgnoredPath(src)) {
				try {
					url = util.resolveURL(src, this.baseURI);
					// eslint-disable-next-line no-unused-vars
				} catch (error) {
					// ignored
				}
				if (this.options.saveOriginalURLs && src && !isDataURL(src)) {
					frameElement.setAttribute("data-sf-original-src", url);
				}

			}
			if (this.options.saveRawPage && url && testValidURL(url)) {
				const frameData = {
					adoptedStyleSheets: [],
					baseURI: url,
					canvases: [],
					fonts: [],
					images: [],
					posters: [],
					scrollPosition: { x: 0, y: 0 },
					shadowRoots: [],
					stylesheets: [],
					url,
					usedFonts: [],
					videos: [],
					worklets: []
				};
				this.options.frames.push(frameData);
				frameData.windowId = (this.options.windowId || "0") + "." + this.options.frames.length;
				frameElement.setAttribute(util.WIN_ID_ATTRIBUTE_NAME, frameData.windowId);
				await initializeProcessor(frameData, frameElement, null, this.batchRequest, Object.assign({}, this.options));
			} else {
				const frameWindowId = frameElement.getAttribute(util.WIN_ID_ATTRIBUTE_NAME);
				if (this.options.frames && frameWindowId) {
					const frameData = this.options.frames.find(frame => frame.windowId == frameWindowId);
					if (frameData && frameData.content) {
						await initializeProcessor(frameData, frameElement, frameWindowId, this.batchRequest, Object.assign({}, this.options));
					}
				}
			}
		}));

		async function initializeProcessor(frameData, frameElement, frameWindowId, batchRequest, options) {
			options.insertSingleFileComment = false;
			options.insertCanonicalLink = false;
			options.insertMetaNoIndex = false;
			options.saveFavicon = false;
			options.includeInfobar = false;
			options.saveFilenameTemplateData = false;
			options.selected = false;
			options.embeddedImage = null;
			options.embeddedPdf = null;
			options.url = frameData.baseURI;
			options.windowId = frameWindowId;
			options.content = frameData.content;
			options.canvases = frameData.canvases;
			options.fonts = frameData.fonts;
			options.worklets = frameData.worklets;
			options.stylesheets = frameData.stylesheets;
			options.images = frameData.images;
			options.posters = frameData.posters;
			options.videos = frameData.videos;
			options.usedFonts = frameData.usedFonts;
			options.shadowRoots = frameData.shadowRoots;
			options.scrollPosition = frameData.scrollPosition;
			options.scrolling = frameData.scrolling;
			options.adoptedStyleSheets = frameData.adoptedStyleSheets;
			frameData.runner = new Runner(options, processorHelper);
			frameData.frameElement = frameElement;
			await frameData.runner.loadPage();
			await frameData.runner.initialize();
			frameData.maxResources = batchRequest.getMaxResources();
		}
	}

	insertShadowRootContents() {
		const doc = this.doc;
		const options = this.options;
		if (options.shadowRoots && options.shadowRoots.length) {
			processElement(this.doc);
		}

		function processElement(element) {
			const shadowRootElements = Array.from(element.querySelectorAll("[" + util.SHADOW_ROOT_ATTRIBUTE_NAME + "]"));
			shadowRootElements.forEach(element => {
				const attributeValue = element.getAttribute(util.SHADOW_ROOT_ATTRIBUTE_NAME);
				if (attributeValue) {
					const shadowRootData = options.shadowRoots[Number(attributeValue)];
					if (shadowRootData) {
						const templateElement = doc.createElement("template");
						templateElement.setAttribute(SHADOWROOT_ATTRIBUTE_NAME, shadowRootData.mode);
						if (shadowRootData.delegatesFocus) {
							templateElement.setAttribute(SHADOWROOT_DELEGATES_FOCUS, shadowRootData.delegatesFocus);
						}
						if (shadowRootData.clonable) {
							templateElement.setAttribute(SHADOWROOT_CLONABLE, shadowRootData.clonable);
						}
						if (shadowRootData.serializable) {
							templateElement.setAttribute(SHADOWROOT_SERIALIZABLE, shadowRootData.serializable);
						}
						if (shadowRootData.adoptedStyleSheets && shadowRootData.adoptedStyleSheets.length) {
							shadowRootData.adoptedStyleSheets.forEach(stylesheetContent => {
								const styleElement = doc.createElement("style");
								styleElement.textContent = stylesheetContent;
								templateElement.appendChild(styleElement);
							});
						}
						const shadowDoc = util.parseDocContent(shadowRootData.content);
						if (shadowDoc.head) {
							const metaCharset = shadowDoc.head.querySelector("meta[charset]");
							if (metaCharset) {
								metaCharset.remove();
							}
							shadowDoc.head.childNodes.forEach(node => templateElement.appendChild(shadowDoc.importNode(node, true)));
						}
						if (shadowDoc.body) {
							shadowDoc.body.childNodes.forEach(node => templateElement.appendChild(shadowDoc.importNode(node, true)));
						}
						processElement(templateElement);
						if (element.firstChild) {
							element.insertBefore(templateElement, element.firstChild);
						} else {
							element.appendChild(templateElement);
						}
					}
				}
			});
		}
	}

	removeUnusedStyles() {
		const stats = util.minifyCSSRules(this.doc, this.stylesheets);
		this.stats.set("processed", "CSS rules", stats.processed);
		this.stats.set("discarded", "CSS rules", stats.discarded);
	}

	removeUnusedFonts() {
		util.removeUnusedFonts(this.doc, this.stylesheets, this.styles, this.options);
	}

	removeAlternativeMedias() {
		const stats = util.minifyMedias(this.stylesheets, { keepPrintStyleSheets: this.options.keepPrintStyleSheets });
		this.stats.set("processed", "medias", stats.processed);
		this.stats.set("discarded", "medias", stats.discarded);
	}

	async processStylesheets() {
		await Promise.all([...this.stylesheets].map(async ([, stylesheetInfo]) => {
			if (stylesheetInfo.stylesheet) {
				await this.processorHelper.processStylesheet(stylesheetInfo.stylesheet.children, this.baseURI, this.options, this.resources, this.batchRequest);
			}
		}));
	}

	async processStyleAttributes() {
		return Promise.all([...this.styles].map(([, stylesheet]) =>
			this.processorHelper.processStyle(stylesheet, this.options, this.resources, this.batchRequest)
		));
	}

	async processPageResources() {
		await this.processorHelper.processPageResources(this.doc, this.baseURI, this.options, this.resources, this.styles, this.batchRequest);
	}

	async processScripts() {
		await Promise.all(Array.from(this.doc.querySelectorAll("script[src]")).map(async element => {
			let resourceURL;
			let scriptSrc;
			scriptSrc = element.getAttribute("src");
			if (this.options.saveOriginalURLs && !isDataURL(scriptSrc)) {
				element.setAttribute("data-sf-original-src", scriptSrc);
			}
			element.removeAttribute("integrity");
			if (!this.options.blockScripts) {
				element.textContent = "";
				try {
					resourceURL = util.resolveURL(scriptSrc, this.baseURI);
					// eslint-disable-next-line no-unused-vars
				} catch (error) {
					// ignored
				}
				if (testValidURL(resourceURL)) {
					element.removeAttribute("src");
					await this.processorHelper.processScript(element, resourceURL, this.options, this.charset, this.batchRequest, this.resources);
					if (element.getAttribute("async") == "async" || element.getAttribute(util.ASYNC_SCRIPT_ATTRIBUTE_NAME) == "") {
						element.setAttribute("async", "");
					}
				}
			} else {
				element.removeAttribute("src");
			}
			this.stats.add("processed", "scripts", 1);
		}));
	}

	async processWorklets() {
		if (this.options.worklets.length) {
			const scriptElement = this.doc.createElement("script");
			scriptElement.textContent = "if (CSS && CSS.paintWorklet && CSS.paintWorklet.addModule) {\n";
			await Promise.all(this.options.worklets.map(async ({ moduleURL, options }) => {
				await this.processorHelper.processWorklet(scriptElement, moduleURL, options, this.options, this.charset, this.batchRequest, this.resources);
			}));
			scriptElement.textContent += "}";
			this.doc.head.appendChild(scriptElement);
		}
	}

	removeAlternativeImages() {
		util.removeAlternativeImages(this.doc);
	}

	async removeAlternativeFonts() {
		await this.processorHelper.removeAlternativeFonts(this.doc, this.stylesheets, this.resources.fonts, this.options.fontTests);
	}

	async processFrames() {
		if (this.options.frames) {
			const frameElements = Array.from(this.doc.querySelectorAll("iframe, frame, object[type=\"text/html\"][data]"));
			await Promise.all(frameElements.map(async frameElement => {
				const frameWindowId = frameElement.getAttribute(util.WIN_ID_ATTRIBUTE_NAME);
				if (frameWindowId) {
					const frameData = this.options.frames.find(frame => frame.windowId == frameWindowId);
					if (frameData) {
						this.options.frames = this.options.frames.filter(frame => frame.windowId != frameWindowId);
						if (frameData.runner && frameElement.getAttribute(util.HIDDEN_FRAME_ATTRIBUTE_NAME) != "") {
							this.stats.add("processed", "frames", 1);
							await frameData.runner.run();
							const pageData = await frameData.runner.getPageData();
							frameElement.removeAttribute(util.WIN_ID_ATTRIBUTE_NAME);
							this.processorHelper.processFrame(frameElement, pageData, this.options, this.resources, frameWindowId, frameData);
							this.stats.addAll(pageData);
						} else {
							frameElement.removeAttribute(util.WIN_ID_ATTRIBUTE_NAME);
							this.stats.add("discarded", "frames", 1);
						}
					}
				}
			}));
		}
	}

	replaceStylesheets() {
		this.processorHelper.replaceStylesheets(this.doc, this.stylesheets, this.options, this.resources);
		delete this.options.inlineStylesheetsRefs;
		delete this.options.inlineStylesheets;
	}

	replaceStyleAttributes() {
		this.doc.querySelectorAll("[style]").forEach(element => {
			const declarationList = this.styles.get(element);
			if (declarationList) {
				this.styles.delete(element);
				element.setAttribute("style", this.processorHelper.generateStylesheetContent(declarationList, this.options));
			} else {
				element.setAttribute("style", "");
			}
		});
	}

	insertVariables() {
		const { cssVariables } = this.resources;
		if (cssVariables.size) {
			const styleElement = this.doc.createElement("style");
			const firstStyleElement = this.doc.head.querySelector("style");
			if (firstStyleElement) {
				this.doc.head.insertBefore(styleElement, firstStyleElement);
			} else {
				this.doc.head.appendChild(styleElement);
			}
			let stylesheetContent = "";
			cssVariables.forEach(({ content, url }, indexResource) => {
				cssVariables.delete(indexResource);
				if (stylesheetContent) {
					stylesheetContent += ";";
				}
				stylesheetContent += `${SINGLE_FILE_VARIABLE_NAME_PREFIX + indexResource}: `;
				if (this.options.saveOriginalURLs) {
					stylesheetContent += `/* original URL: ${url} */ `;
				}
				stylesheetContent += `url("${content}")`;
			});
			styleElement.textContent = ":root{" + stylesheetContent + "}";
		}
	}

	compressHTML() {
		let size;
		if (this.options.displayStats) {
			size = util.getContentSize(this.doc.documentElement.outerHTML);
		}
		util.minifyHTML(this.doc, { PRESERVED_SPACE_ELEMENT_ATTRIBUTE_NAME: util.PRESERVED_SPACE_ELEMENT_ATTRIBUTE_NAME });
		if (this.options.displayStats) {
			this.stats.add("discarded", "HTML bytes", size - util.getContentSize(this.doc.documentElement.outerHTML));
		}
	}

	cleanupPage() {
		this.doc.querySelectorAll("base").forEach(element => element.remove());
		const metaCharset = this.doc.head.querySelector("meta[charset]");
		if (metaCharset) {
			this.doc.head.insertBefore(metaCharset, this.doc.head.firstChild);
			if (this.doc.head.querySelectorAll("*").length == 1 && this.doc.body.childNodes.length == 0) {
				this.doc.head.querySelector("meta[charset]").remove();
			}
		}
	}

	resetZoomLevel() {
		const transform = this.doc.documentElement.style.getPropertyValue("-sf-transform");
		const transformPriority = this.doc.documentElement.style.getPropertyPriority("-sf-transform");
		const transformOrigin = this.doc.documentElement.style.getPropertyValue("-sf-transform-origin");
		const transformOriginPriority = this.doc.documentElement.style.getPropertyPriority("-sf-transform-origin");
		const minHeight = this.doc.documentElement.style.getPropertyValue("-sf-min-height");
		const minHeightPriority = this.doc.documentElement.style.getPropertyPriority("-sf-min-height");
		this.doc.documentElement.style.setProperty("transform", transform, transformPriority);
		this.doc.documentElement.style.setProperty("transform-origin", transformOrigin, transformOriginPriority);
		this.doc.documentElement.style.setProperty("min-height", minHeight, minHeightPriority);
		this.doc.documentElement.style.removeProperty("-sf-transform");
		this.doc.documentElement.style.removeProperty("-sf-transform-origin");
		this.doc.documentElement.style.removeProperty("-sf-min-height");
	}

	async insertMAFFMetaData() {
		const maffMetaData = await this.maffMetaDataPromise;
		if (maffMetaData && maffMetaData.content) {
			const NAMESPACE_RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
			const maffDoc = util.parseXMLContent(maffMetaData.content);
			const originalURLElement = maffDoc.querySelector("RDF > Description > originalurl");
			const archiveTimeElement = maffDoc.querySelector("RDF > Description > archivetime");
			if (originalURLElement) {
				this.options.saveUrl = originalURLElement.getAttributeNS(NAMESPACE_RDF, "resource");
			}
			if (archiveTimeElement) {
				const value = archiveTimeElement.getAttributeNS(NAMESPACE_RDF, "resource");
				if (value) {
					const date = new Date(value);
					if (!isNaN(date.getTime())) {
						this.options.saveDate = new Date(value);
					}
				}
			}
		}
	}

	async setDocInfo() {
		const titleElement = this.doc.querySelector("title");
		const descriptionElement = this.doc.querySelector("meta[name=description]");
		const authorElement = this.doc.querySelector("meta[name=author]");
		const creatorElement = this.doc.querySelector("meta[name=creator]");
		const publisherElement = this.doc.querySelector("meta[name=publisher]");
		const headingElement = this.doc.querySelector("h1");
		this.options.title = titleElement ? titleElement.textContent.trim() : "";
		this.options.info = {
			description: descriptionElement && descriptionElement.content ? descriptionElement.content.trim() : "",
			lang: this.doc.documentElement.lang,
			author: authorElement && authorElement.content ? authorElement.content.trim() : "",
			creator: creatorElement && creatorElement.content ? creatorElement.content.trim() : "",
			publisher: publisherElement && publisherElement.content ? publisherElement.content.trim() : "",
			heading: headingElement && headingElement.textContent ? headingElement.textContent.trim() : ""
		};
		this.options.infobarContent = await util.evalTemplate(this.options.infobarTemplate, this.options, null, this.doc, { dontReplaceSlash: true });
	}
}

// ----
// Util
// ----
const DATA_URI_PREFIX = "data:";
const ABOUT_BLANK_URI = "about:blank";
const BLOB_URI_PREFIX = "blob:";
const HTTP_URI_PREFIX = /^https?:\/\//;
const FILE_URI_PREFIX = /^file:\/\//;
const EMPTY_URL = /^https?:\/\/+\s*$/;
const NOT_EMPTY_URL = /^(https?:\/\/|file:\/\/|blob:).+/;
const SINGLE_FILE_VARIABLE_NAME_PREFIX = "--sf-img-";

function normalizeURL(url) {
	if (!url || url.startsWith(DATA_URI_PREFIX)) {
		return url;
	} else {
		return url.split("#")[0];
	}
}

function getOnEventAttributeNames(doc) {
	const element = doc.body || doc.createElement("div");
	const attributeNames = [];
	for (const propertyName in element) {
		if (propertyName.startsWith("on")) {
			attributeNames.push(propertyName);
		}
	}
	return attributeNames;
}

function isDataURL(url) {
	return url && (url.startsWith(DATA_URI_PREFIX) || url.startsWith(BLOB_URI_PREFIX));
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

function log(...args) {
	console.log("S-File <core>   ", ...args); // eslint-disable-line no-console
}

// -----
// Stats
// -----
const STATS_DEFAULT_VALUES = {
	discarded: {
		"HTML bytes": 0,
		"hidden elements": 0,
		scripts: 0,
		objects: 0,
		"audio sources": 0,
		"video sources": 0,
		frames: 0,
		"CSS rules": 0,
		canvas: 0,
		stylesheets: 0,
		resources: 0,
		medias: 0
	},
	processed: {
		"HTML bytes": 0,
		"hidden elements": 0,
		scripts: 0,
		objects: 0,
		"audio sources": 0,
		"video sources": 0,
		frames: 0,
		"CSS rules": 0,
		canvas: 0,
		stylesheets: 0,
		resources: 0,
		medias: 0
	}
};

class Stats {
	constructor(options) {
		this.options = options;
		if (options.displayStats) {
			this.data = JSON.parse(JSON.stringify(STATS_DEFAULT_VALUES));
		}
	}
	set(type, subType, value) {
		if (this.options.displayStats) {
			this.data[type][subType] = value;
		}
	}
	add(type, subType, value) {
		if (this.options.displayStats) {
			this.data[type][subType] += value;
		}
	}
	addAll(pageData) {
		if (this.options.displayStats) {
			Object.keys(this.data.discarded).forEach(key => this.add("discarded", key, pageData.stats.discarded[key] || 0));
			Object.keys(this.data.processed).forEach(key => this.add("processed", key, pageData.stats.processed[key] || 0));
		}
	}
}