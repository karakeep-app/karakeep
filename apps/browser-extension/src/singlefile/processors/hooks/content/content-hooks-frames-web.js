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

(globalThis => {

	const LOAD_DEFERRED_IMAGES_START_EVENT = "single-file-load-deferred-images-start";
	const LOAD_DEFERRED_IMAGES_END_EVENT = "single-file-load-deferred-images-end";
	const LOAD_DEFERRED_IMAGES_KEEP_ZOOM_LEVEL_START_EVENT = "single-file-load-deferred-images-keep-zoom-level-start";
	const LOAD_DEFERRED_IMAGES_KEEP_ZOOM_LEVEL_END_EVENT = "single-file-load-deferred-images-keep-zoom-level-end";
	const LOAD_DEFERRED_IMAGES_RESET_ZOOM_LEVEL_EVENT = "single-file-load-deferred-images-keep-zoom-level-reset";
	const LOAD_DEFERRED_IMAGES_RESET_EVENT = "single-file-load-deferred-images-reset";
	const BLOCK_COOKIES_START_EVENT = "single-file-block-cookies-start";
	const BLOCK_COOKIES_END_EVENT = "single-file-block-cookies-end";
	const BLOCK_STORAGE_START_EVENT = "single-file-block-storage-start";
	const BLOCK_STORAGE_END_EVENT = "single-file-block-storage-end";
	const DISPATCH_SCROLL_START_EVENT = "single-file-dispatch-scroll-event-start";
	const DISPATCH_SCROLL_END_EVENT = "single-file-dispatch-scroll-event-end";
	const LAZY_LOAD_ATTRIBUTE = "single-file-lazy-load";
	const LOAD_IMAGE_EVENT = "single-file-load-image";
	const IMAGE_LOADED_EVENT = "single-file-image-loaded";
	const FETCH_SUPPORTED_REQUEST_EVENT = "single-file-request-fetch-supported";
	const FETCH_SUPPORTED_RESPONSE_EVENT = "single-file-response-fetch-supported";
	const FETCH_REQUEST_EVENT = "single-file-request-fetch";
	const FETCH_RESPONSE_EVENT = "single-file-response-fetch";
	const GET_ADOPTED_STYLESHEETS_REQUEST_EVENT = "single-file-request-get-adopted-stylesheets";
	const UNREGISTER_GET_ADOPTED_STYLESHEETS_REQUEST_EVENT = "single-file-unregister-request-get-adopted-stylesheets";
	const GET_ADOPTED_STYLESHEETS_RESPONSE_EVENT = "single-file-response-get-adopted-stylesheets";
	const NEW_FONT_FACE_EVENT = "single-file-new-font-face";
	const DELETE_FONT_EVENT = "single-file-delete-font";
	const CLEAR_FONTS_EVENT = "single-file-clear-fonts";
	const NEW_WORKLET_EVENT = "single-file-new-worklet";
	const BOOTSTRAP_EVENT = "single-file-bootstrap";
	const FONT_STYLE_PROPERTIES = {
		family: "font-family",
		ascentOverride: "ascent-override",
		descentOverride: "descent-override",
		display: "font-display",
		featureSettings: "font-feature-settings",
		lineGapOverride: "line-gap-override",
		stretch: "font-stretch",
		style: "font-style",
		unicodeRange: "unicode-range",
		variationSettings: "font-variation-settings",
		weight: "font-weight"
	};

	const fetch = globalThis.fetch.bind(globalThis);
	const CustomEvent = globalThis.CustomEvent;
	const document = globalThis.document;
	const screen = globalThis.screen;
	const Element = globalThis.Element;
	const UIEvent = globalThis.UIEvent;
	const Event = globalThis.Event;
	const FileReader = globalThis.FileReader;
	const Blob = globalThis.Blob;
	const JSON = globalThis.JSON;
	const MutationObserver = globalThis.MutationObserver;
	const URL = globalThis.URL;

	const observers = new Map();
	const observedElements = new Map();

	let dispatchScrollEvent;

	init();
	new MutationObserver(init).observe(document, { childList: true });

	function init() {
		document.addEventListener(LOAD_DEFERRED_IMAGES_START_EVENT, () => loadDeferredImagesStart());
		document.addEventListener(LOAD_DEFERRED_IMAGES_KEEP_ZOOM_LEVEL_START_EVENT, () => loadDeferredImagesStart(true));
		document.addEventListener(LOAD_DEFERRED_IMAGES_END_EVENT, () => loadDeferredImagesEnd());
		document.addEventListener(LOAD_DEFERRED_IMAGES_KEEP_ZOOM_LEVEL_END_EVENT, () => loadDeferredImagesEnd(true));
		document.addEventListener(LOAD_DEFERRED_IMAGES_RESET_EVENT, resetScreenSize);
		document.addEventListener(LOAD_DEFERRED_IMAGES_RESET_ZOOM_LEVEL_EVENT, () => {
			const transform = document.documentElement.style.getPropertyValue("-sf-transform");
			const transformPriority = document.documentElement.style.getPropertyPriority("-sf-transform");
			const transformOrigin = document.documentElement.style.getPropertyValue("-sf-transform-origin");
			const transformOriginPriority = document.documentElement.style.getPropertyPriority("-sf-transform-origin");
			const minHeight = document.documentElement.style.getPropertyValue("-sf-min-height");
			const minHeightPriority = document.documentElement.style.getPropertyPriority("-sf-min-height");
			document.documentElement.style.setProperty("transform", transform, transformPriority);
			document.documentElement.style.setProperty("transform-origin", transformOrigin, transformOriginPriority);
			document.documentElement.style.setProperty("min-height", minHeight, minHeightPriority);
			document.documentElement.style.removeProperty("-sf-transform");
			document.documentElement.style.removeProperty("-sf-transform-origin");
			document.documentElement.style.removeProperty("-sf-min-height");
			resetScreenSize();
		});
		document.addEventListener(DISPATCH_SCROLL_START_EVENT, () => { dispatchScrollEvent = true; });
		document.addEventListener(DISPATCH_SCROLL_END_EVENT, () => { dispatchScrollEvent = false; });
		document.addEventListener(BLOCK_COOKIES_START_EVENT, () => {
			try {
				document.__defineGetter__("cookie", () => { throw new Error("document.cookie temporary blocked by SingleFile"); });
				// eslint-disable-next-line no-unused-vars
			} catch (error) {
				// ignored
			}
		});
		document.addEventListener(BLOCK_COOKIES_END_EVENT, () => { delete document.cookie; });
		document.addEventListener(BLOCK_STORAGE_START_EVENT, () => {
			if (!globalThis._singleFile_localStorage) {
				globalThis._singleFile_localStorage = globalThis.localStorage;
				globalThis.__defineGetter__("localStorage", () => { throw new Error("localStorage temporary blocked by SingleFile"); });
			}
			if (!globalThis._singleFile_indexedDB) {
				globalThis._singleFile_indexedDB = globalThis.indexedDB;
				globalThis.__defineGetter__("indexedDB", () => { throw new Error("indexedDB temporary blocked by SingleFile"); });
			}
		});
		document.addEventListener(BLOCK_STORAGE_END_EVENT, () => {
			if (globalThis._singleFile_localStorage) {
				delete globalThis.localStorage;
				globalThis.localStorage = globalThis._singleFile_localStorage;
				delete globalThis._singleFile_localStorage;
			}
			if (!globalThis._singleFile_indexedDB) {
				delete globalThis.indexedDB;
				globalThis.indexedDB = globalThis._singleFile_indexedDB;
				delete globalThis._singleFile_indexedDB;
			}
		});
		document.addEventListener(FETCH_SUPPORTED_REQUEST_EVENT, () =>
			document.dispatchEvent(new CustomEvent(FETCH_SUPPORTED_RESPONSE_EVENT)));
		document.addEventListener(FETCH_REQUEST_EVENT, async event => {
			const { url, options } = JSON.parse(event.detail);
			let detail;
			try {
				const response = await fetch(url, options);
				detail = { url, response: await response.arrayBuffer(), headers: [...response.headers], status: response.status };
			} catch (error) {
				detail = { url, error: error && (error.message || error.toString()) };
			}
			document.dispatchEvent(new CustomEvent(FETCH_RESPONSE_EVENT, { detail }));
		});
		document.addEventListener(GET_ADOPTED_STYLESHEETS_REQUEST_EVENT, getAdoptedStylesheetsListener);
		document.addEventListener(BOOTSTRAP_EVENT, event => {
			try {
				if (globalThis.bootstrap && event.detail.data) {
					globalThis.bootstrap(event.detail.data);
				}
				// eslint-disable-next-line no-unused-vars
			} catch (error) {
				// ignored
			}
		});
	}

	function loadDeferredImagesStart(keepZoomLevel) {
		const scrollingElement = document.scrollingElement || document.documentElement;
		const clientHeight = scrollingElement.clientHeight;
		const clientWidth = scrollingElement.clientWidth;
		const scrollHeight = Math.max(scrollingElement.scrollHeight - clientHeight, clientHeight);
		const scrollWidth = Math.max(scrollingElement.scrollWidth - clientWidth, clientWidth);
		document.querySelectorAll("[loading=lazy]").forEach(element => {
			element.loading = "eager";
			element.setAttribute(LAZY_LOAD_ATTRIBUTE, "");
		});
		scrollingElement.__defineGetter__("clientHeight", () => scrollHeight);
		scrollingElement.__defineGetter__("clientWidth", () => scrollWidth);
		screen.__defineGetter__("height", () => scrollHeight);
		screen.__defineGetter__("width", () => scrollWidth);
		globalThis._singleFile_innerHeight = globalThis.innerHeight;
		globalThis._singleFile_innerWidth = globalThis.innerWidth;
		globalThis.__defineGetter__("innerHeight", () => scrollHeight);
		globalThis.__defineGetter__("innerWidth", () => scrollWidth);
		if (!keepZoomLevel) {
			if (!globalThis._singleFile_getBoundingClientRect) {
				globalThis._singleFile_getBoundingClientRect = Element.prototype.getBoundingClientRect;
				Element.prototype.getBoundingClientRect = function () {
					const boundingRect = globalThis._singleFile_getBoundingClientRect.call(this);
					if (this == scrollingElement) {
						boundingRect.__defineGetter__("height", () => scrollHeight);
						boundingRect.__defineGetter__("bottom", () => scrollHeight + boundingRect.top);
						boundingRect.__defineGetter__("width", () => scrollWidth);
						boundingRect.__defineGetter__("right", () => scrollWidth + boundingRect.left);
					}
					return boundingRect;
				};
			}
		}
		if (!globalThis._singleFileImage) {
			const Image = globalThis.Image;
			globalThis._singleFileImage = globalThis.Image;
			globalThis.__defineGetter__("Image", function () {
				return function () {
					const image = new Image(...arguments);
					const result = new Image(...arguments);
					result.__defineSetter__("src", value => {
						image.src = value;
						document.dispatchEvent(new CustomEvent(LOAD_IMAGE_EVENT, { detail: image.src }));
					});
					result.__defineGetter__("src", () => image.src);
					result.__defineSetter__("srcset", value => {
						document.dispatchEvent(new CustomEvent(LOAD_IMAGE_EVENT));
						image.srcset = value;
					});
					result.__defineGetter__("srcset", () => image.srcset);
					result.__defineGetter__("height", () => image.height);
					result.__defineGetter__("width", () => image.width);
					result.__defineGetter__("naturalHeight", () => image.naturalHeight);
					result.__defineGetter__("naturalWidth", () => image.naturalWidth);
					if (image.decode) {
						result.__defineGetter__("decode", () => () => image.decode());
					}
					image.onload = image.onloadend = image.onerror = event => {
						document.dispatchEvent(new CustomEvent(IMAGE_LOADED_EVENT, { detail: image.src }));
						result.dispatchEvent(new Event(event.type, event));
					};
					return result;
				};
			});
		}
		let zoomFactorX, zoomFactorY;
		if (keepZoomLevel) {
			zoomFactorX = clientHeight / scrollHeight;
			zoomFactorY = clientWidth / scrollWidth;
		} else {
			zoomFactorX = (clientHeight + globalThis.scrollY) / scrollHeight;
			zoomFactorY = (clientWidth + globalThis.scrollX) / scrollWidth;
		}
		const zoomFactor = Math.min(zoomFactorX, zoomFactorY);
		if (zoomFactor < 1) {
			const transform = document.documentElement.style.getPropertyValue("transform");
			const transformPriority = document.documentElement.style.getPropertyPriority("transform");
			const transformOrigin = document.documentElement.style.getPropertyValue("transform-origin");
			const transformOriginPriority = document.documentElement.style.getPropertyPriority("transform-origin");
			const minHeight = document.documentElement.style.getPropertyValue("min-height");
			const minHeightPriority = document.documentElement.style.getPropertyPriority("min-height");
			document.documentElement.style.setProperty("transform-origin", (zoomFactorX < 1 ? "50%" : "0") + " " + (zoomFactorY < 1 ? "50%" : "0") + " 0", "important");
			document.documentElement.style.setProperty("transform", "scale3d(" + zoomFactor + ", " + zoomFactor + ", 1)", "important");
			document.documentElement.style.setProperty("min-height", (100 / zoomFactor) + "vh", "important");
			dispatchResizeEvent();
			if (keepZoomLevel) {
				document.documentElement.style.setProperty("-sf-transform", transform, transformPriority);
				document.documentElement.style.setProperty("-sf-transform-origin", transformOrigin, transformOriginPriority);
				document.documentElement.style.setProperty("-sf-min-height", minHeight, minHeightPriority);
			} else {
				document.documentElement.style.setProperty("transform", transform, transformPriority);
				document.documentElement.style.setProperty("transform-origin", transformOrigin, transformOriginPriority);
				document.documentElement.style.setProperty("min-height", minHeight, minHeightPriority);
			}
		}
		if (!keepZoomLevel) {
			dispatchResizeEvent();
			const docBoundingRect = scrollingElement.getBoundingClientRect();
			if (globalThis.window == globalThis.window.top) {
				[...observers].forEach(([intersectionObserver, observer]) => {
					const getBoundingClientRectDefined = observer.options && observer.options.root && observer.options.root.getBoundingClientRect;
					const rootBoundingRect = getBoundingClientRectDefined && observer.options.root.getBoundingClientRect();
					const targetElements = observedElements.get(intersectionObserver);
					if (targetElements) {
						const params = targetElements.map(target => {
							const boundingClientRect = target.getBoundingClientRect();
							const isIntersecting = true;
							const intersectionRatio = 1;
							const rootBounds = getBoundingClientRectDefined ? rootBoundingRect : docBoundingRect;
							const time = 0;
							return { target, intersectionRatio, boundingClientRect, intersectionRect: boundingClientRect, isIntersecting, rootBounds, time };
						}).filter(params => params.boundingClientRect.width && params.boundingClientRect.height);
						if (params.length) {
							observer.callback.call(intersectionObserver, params, intersectionObserver);
						}
					}
				});
			}
		}
	}

	function loadDeferredImagesEnd(keepZoomLevel) {
		document.querySelectorAll("[" + LAZY_LOAD_ATTRIBUTE + "]").forEach(element => {
			element.loading = "lazy";
			element.removeAttribute(LAZY_LOAD_ATTRIBUTE);
		});
		if (!keepZoomLevel) {
			if (globalThis._singleFile_getBoundingClientRect) {
				Element.prototype.getBoundingClientRect = globalThis._singleFile_getBoundingClientRect;
				delete globalThis._singleFile_getBoundingClientRect;
			}
		}
		if (globalThis._singleFileImage) {
			delete globalThis.Image;
			globalThis.Image = globalThis._singleFileImage;
			delete globalThis._singleFileImage;
		}
		if (!keepZoomLevel) {
			dispatchResizeEvent();
		}
	}

	function resetScreenSize() {
		const scrollingElement = document.scrollingElement || document.documentElement;
		if (globalThis._singleFile_innerHeight != null) {
			delete globalThis.innerHeight;
			globalThis.innerHeight = globalThis._singleFile_innerHeight;
			delete globalThis._singleFile_innerHeight;
		}
		if (globalThis._singleFile_innerWidth != null) {
			delete globalThis.innerWidth;
			globalThis.innerWidth = globalThis._singleFile_innerWidth;
			delete globalThis._singleFile_innerWidth;
		}
		delete scrollingElement.clientHeight;
		delete scrollingElement.clientWidth;
		delete screen.height;
		delete screen.width;
	}

	if (globalThis.CSS && globalThis.CSS.paintWorklet && globalThis.CSS.paintWorklet.addModule) {
		const addModule = globalThis.CSS.paintWorklet.addModule;
		globalThis.CSS.paintWorklet.addModule = function (moduleURL, options) {
			const result = addModule.apply(globalThis.CSS.paintWorklet, arguments);
			moduleURL = new URL(moduleURL, document.baseURI).href;
			document.dispatchEvent(new CustomEvent(NEW_WORKLET_EVENT, { detail: { moduleURL, options } }));
			return result;
		};
	}

	if (globalThis.FontFace) {
		const FontFace = globalThis.FontFace;
		globalThis.FontFace = function () {
			getDetailObject(...arguments).then(detail => document.dispatchEvent(new CustomEvent(NEW_FONT_FACE_EVENT, { detail })));
			return new FontFace(...arguments);
		};
		globalThis.FontFace.prototype = FontFace.prototype;
		globalThis.FontFace.toString = function () { return "function FontFace() { [native code] }"; };
		const deleteFont = document.fonts.delete;
		document.fonts.delete = function (fontFace) {
			getDetailObject(fontFace.family).then(detail => document.dispatchEvent(new CustomEvent(DELETE_FONT_EVENT, { detail })));
			return deleteFont.call(document.fonts, fontFace);
		};
		document.fonts.delete.toString = function () { return "function delete() { [native code] }"; };
		const clearFonts = document.fonts.clear;
		document.fonts.clear = function () {
			document.dispatchEvent(new CustomEvent(CLEAR_FONTS_EVENT));
			return clearFonts.call(document.fonts);
		};
		document.fonts.clear.toString = function () { return "function clear() { [native code] }"; };
	}

	if (globalThis.IntersectionObserver) {
		const IntersectionObserver = globalThis.IntersectionObserver;
		globalThis.IntersectionObserver = function () {
			const intersectionObserver = new IntersectionObserver(...arguments);
			const observeIntersection = IntersectionObserver.prototype.observe || intersectionObserver.observe;
			const unobserveIntersection = IntersectionObserver.prototype.unobserve || intersectionObserver.unobserve;
			const callback = arguments[0];
			const options = arguments[1];
			if (observeIntersection) {
				intersectionObserver.observe = function (targetElement) {
					let targetElements = observedElements.get(intersectionObserver);
					if (!targetElements) {
						targetElements = [];
						observedElements.set(intersectionObserver, targetElements);
					}
					targetElements.push(targetElement);
					return observeIntersection.call(intersectionObserver, targetElement);
				};
			}
			if (unobserveIntersection) {
				intersectionObserver.unobserve = function (targetElement) {
					let targetElements = observedElements.get(intersectionObserver);
					if (targetElements) {
						targetElements = targetElements.filter(element => element != targetElement);
						if (targetElements.length) {
							observedElements.set(intersectionObserver, targetElements);
						} else {
							observedElements.delete(intersectionObserver);
							observers.delete(intersectionObserver);
						}
					}
					return unobserveIntersection.call(intersectionObserver, targetElement);
				};
			}
			observers.set(intersectionObserver, { callback, options });
			return intersectionObserver;
		};
		globalThis.IntersectionObserver.prototype = IntersectionObserver.prototype;
		globalThis.IntersectionObserver.toString = function () { return "function IntersectionObserver() { [native code] }"; };
	}

	function getAdoptedStylesheetsListener(event) {
		const shadowRoot = event.target.shadowRoot;
		event.stopPropagation();
		if (shadowRoot) {
			shadowRoot.addEventListener(GET_ADOPTED_STYLESHEETS_REQUEST_EVENT, getAdoptedStylesheetsListener, { capture: true });
			shadowRoot.addEventListener(UNREGISTER_GET_ADOPTED_STYLESHEETS_REQUEST_EVENT, () => shadowRoot.removeEventListener(GET_ADOPTED_STYLESHEETS_REQUEST_EVENT, getAdoptedStylesheetsListener), { once: true });
			const adoptedStyleSheets = Array.from(shadowRoot.adoptedStyleSheets).map(stylesheet => Array.from(stylesheet.cssRules).map(cssRule => cssRule.cssText).join("\n"));
			if (adoptedStyleSheets.length) {
				shadowRoot.dispatchEvent(new CustomEvent(GET_ADOPTED_STYLESHEETS_RESPONSE_EVENT, { detail: { adoptedStyleSheets } }));
			}
		}
	}

	async function getDetailObject(fontFamily, src, descriptors) {
		const detail = {};
		detail["font-family"] = fontFamily;
		detail.src = src;
		if (descriptors) {
			Object.keys(descriptors).forEach(descriptor => {
				if (FONT_STYLE_PROPERTIES[descriptor]) {
					detail[FONT_STYLE_PROPERTIES[descriptor]] = descriptors[descriptor];
				}
			});
		}
		return new Promise(resolve => {
			if (detail.src instanceof ArrayBuffer) {
				const reader = new FileReader();
				reader.readAsDataURL(new Blob([detail.src]));
				reader.addEventListener("load", () => {
					detail.src = "url(" + reader.result + ")";
					resolve(detail);
				});
			} else {
				resolve(detail);
			}
		});
	}

	function dispatchResizeEvent() {
		try {
			globalThis.dispatchEvent(new UIEvent("resize"));
			if (dispatchScrollEvent) {
				globalThis.dispatchEvent(new UIEvent("scroll"));
			}
			// eslint-disable-next-line no-unused-vars
		} catch (error) {
			// ignored
		}
	}

})(typeof globalThis == "object" ? globalThis : globalThis.window);