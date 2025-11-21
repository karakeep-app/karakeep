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

import * as hooksFrames from "./../../hooks/content/content-hooks-frames.js";
import {
	LAZY_SRC_ATTRIBUTE_NAME,
	SINGLE_FILE_UI_ELEMENT_CLASS
} from "./../../../core/helper.js";
const helper = {
	LAZY_SRC_ATTRIBUTE_NAME,
	SINGLE_FILE_UI_ELEMENT_CLASS
};

const MAX_IDLE_TIMEOUT_CALLS = 10;
const ATTRIBUTES_MUTATION_TYPE = "attributes";

const browser = globalThis.browser;
const document = globalThis.document;
const MutationObserver = globalThis.MutationObserver;
const timeouts = new Map();

let idleTimeoutCalls;

if (browser && browser.runtime && browser.runtime.onMessage && browser.runtime.onMessage.addListener) {
	browser.runtime.onMessage.addListener(message => {
		if (message.method == "singlefile.lazyTimeout.onTimeout") {
			const timeoutData = timeouts.get(message.type);
			if (timeoutData) {
				timeouts.delete(message.type);
				try {
					timeoutData.callback();
					// eslint-disable-next-line no-unused-vars
				} catch (error) {
					clearRegularTimeout(message.type);
				}
			}
		}
	});
}

export {
	process,
	resetZoomLevel
};

async function process(options) {
	if (document.documentElement) {
		timeouts.clear();
		const bodyHeight = document.body ? Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) : document.documentElement.scrollHeight;
		const bodyWidth = document.body ? Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) : document.documentElement.scrollWidth;
		if (bodyHeight > globalThis.innerHeight || bodyWidth > globalThis.innerWidth) {
			const maxScrollY = Math.max(bodyHeight - (globalThis.innerHeight * 1.5), 0);
			const maxScrollX = Math.max(bodyWidth - (globalThis.innerWidth * 1.5), 0);
			if (globalThis.scrollY < maxScrollY || globalThis.scrollX < maxScrollX) {
				return triggerLazyLoading(options);
			}
		}
	}
}

function resetZoomLevel(options) {
	hooksFrames.loadDeferredImagesResetZoomLevel(options);
}

function triggerLazyLoading(options) {
	idleTimeoutCalls = 0;
	return new Promise(async resolve => { // eslint-disable-line  no-async-promise-executor
		let loadingImages;
		const pendingImages = new Set();
		const observer = new MutationObserver(async mutations => {
			mutations = mutations.filter(mutation => mutation.type == ATTRIBUTES_MUTATION_TYPE);
			if (mutations.length) {
				const updated = mutations.filter(mutation => {
					if (mutation.attributeName == "src") {
						mutation.target.setAttribute(helper.LAZY_SRC_ATTRIBUTE_NAME, mutation.target.src);
						mutation.target.addEventListener("load", onResourceLoad);
					}
					if (mutation.attributeName == "src" || mutation.attributeName == "srcset" ||
						(mutation.target.tagName && mutation.target.tagName.toUpperCase() == "SOURCE")) {
						return !mutation.target.classList || !mutation.target.classList.contains(helper.SINGLE_FILE_UI_ELEMENT_CLASS);
					}
				});
				if (updated.length) {
					loadingImages = true;
					await deferForceLazyLoadEnd(observer, options, cleanupAndResolve);
					if (!pendingImages.size) {
						await deferLazyLoadEnd(observer, options, cleanupAndResolve);
					}
				}
			}
		});
		await setIdleTimeout(options.loadDeferredImagesMaxIdleTime * 2);
		await deferForceLazyLoadEnd(observer, options, cleanupAndResolve);
		observer.observe(document, { subtree: true, childList: true, attributes: true });
		document.addEventListener(hooksFrames.LOAD_IMAGE_EVENT, onImageLoadEvent);
		document.addEventListener(hooksFrames.IMAGE_LOADED_EVENT, onImageLoadedEvent);
		hooksFrames.loadDeferredImagesStart(options);

		async function setIdleTimeout(delay) {
			await setAsyncTimeout("idleTimeout", async () => {
				if (!loadingImages) {
					clearAsyncTimeout("loadTimeout");
					clearAsyncTimeout("maxTimeout");
					lazyLoadEnd(observer, options, cleanupAndResolve);
				} else if (idleTimeoutCalls < MAX_IDLE_TIMEOUT_CALLS) {
					idleTimeoutCalls++;
					clearAsyncTimeout("idleTimeout");
					await setIdleTimeout(Math.max(500, delay / 2));
				}
			}, delay, options.loadDeferredImagesNativeTimeout);
		}

		function onResourceLoad(event) {
			const element = event.target;
			element.removeAttribute(helper.LAZY_SRC_ATTRIBUTE_NAME);
			element.removeEventListener("load", onResourceLoad);
		}

		async function onImageLoadEvent(event) {
			loadingImages = true;
			await deferForceLazyLoadEnd(observer, options, cleanupAndResolve);
			await deferLazyLoadEnd(observer, options, cleanupAndResolve);
			if (event.detail) {
				pendingImages.add(event.detail);
			}
		}

		async function onImageLoadedEvent(event) {
			await deferForceLazyLoadEnd(observer, options, cleanupAndResolve);
			await deferLazyLoadEnd(observer, options, cleanupAndResolve);
			pendingImages.delete(event.detail);
			if (!pendingImages.size) {
				await deferLazyLoadEnd(observer, options, cleanupAndResolve);
			}
		}

		function cleanupAndResolve(value) {
			observer.disconnect();
			document.removeEventListener(hooksFrames.LOAD_IMAGE_EVENT, onImageLoadEvent);
			document.removeEventListener(hooksFrames.IMAGE_LOADED_EVENT, onImageLoadedEvent);
			resolve(value);
		}
	});
}

async function deferLazyLoadEnd(observer, options, resolve) {
	await setAsyncTimeout("loadTimeout", () => lazyLoadEnd(observer, options, resolve), options.loadDeferredImagesMaxIdleTime, options.loadDeferredImagesNativeTimeout);
}

async function deferForceLazyLoadEnd(observer, options, resolve) {
	await setAsyncTimeout("maxTimeout", async () => {
		await clearAsyncTimeout("loadTimeout");
		await lazyLoadEnd(observer, options, resolve);
	}, options.loadDeferredImagesMaxIdleTime * 10, options.loadDeferredImagesNativeTimeout);
}

async function lazyLoadEnd(observer, options, resolve) {
	await clearAsyncTimeout("idleTimeout");
	hooksFrames.loadDeferredImagesEnd(options);
	await setAsyncTimeout("endTimeout", async () => {
		await clearAsyncTimeout("maxTimeout");
		resolve();
	}, options.loadDeferredImagesMaxIdleTime / 2, options.loadDeferredImagesNativeTimeout);
	observer.disconnect();
}

async function setAsyncTimeout(type, callback, delay, forceNativeTimeout) {
	if (browser && browser.runtime && browser.runtime.sendMessage && !forceNativeTimeout) {
		if (!timeouts.get(type) || !timeouts.get(type).pending) {
			const timeoutData = { callback, pending: true };
			timeouts.set(type, timeoutData);
			try {
				await browser.runtime.sendMessage({ method: "singlefile.lazyTimeout.setTimeout", type, delay });
				// eslint-disable-next-line no-unused-vars
			} catch (error) {
				setRegularTimeout(type, callback, delay);
			}
			timeoutData.pending = false;
		}
	} else {
		setRegularTimeout(type, callback, delay);
	}
}

function setRegularTimeout(type, callback, delay) {
	const timeoutId = timeouts.get(type);
	if (timeoutId) {
		globalThis.clearTimeout(timeoutId);
	}
	timeouts.set(type, callback);
	globalThis.setTimeout(callback, delay);
}

async function clearAsyncTimeout(type) {
	if (browser && browser.runtime && browser.runtime.sendMessage) {
		try {
			await browser.runtime.sendMessage({ method: "singlefile.lazyTimeout.clearTimeout", type });
			// eslint-disable-next-line no-unused-vars
		} catch (error) {
			clearRegularTimeout(type);
		}
	} else {
		clearRegularTimeout(type);
	}
}

function clearRegularTimeout(type) {
	const previousTimeoutId = timeouts.get(type);
	timeouts.delete(type);
	if (previousTimeoutId) {
		globalThis.clearTimeout(previousTimeoutId);
	}
}