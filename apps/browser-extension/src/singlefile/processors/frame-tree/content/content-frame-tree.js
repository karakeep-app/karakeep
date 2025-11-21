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

import * as lazy from "./../../lazy/content/content-lazy-loader.js";
import {
	ON_BEFORE_CAPTURE_EVENT_NAME,
	ON_AFTER_CAPTURE_EVENT_NAME,
	WIN_ID_ATTRIBUTE_NAME,
	WAIT_FOR_USERSCRIPT_PROPERTY_NAME,
	MESSAGE_PREFIX,
	preProcessDoc,
	serialize,
	postProcessDoc,
	getShadowRoot
} from "./../../../core/helper.js";

const helper = {
	ON_BEFORE_CAPTURE_EVENT_NAME,
	ON_AFTER_CAPTURE_EVENT_NAME,
	WIN_ID_ATTRIBUTE_NAME,
	WAIT_FOR_USERSCRIPT_PROPERTY_NAME,
	preProcessDoc,
	serialize,
	postProcessDoc,
	getShadowRoot
};

const FRAMES_CSS_SELECTOR = "iframe, frame, object[type=\"text/html\"][data]";
const ALL_ELEMENTS_CSS_SELECTOR = "*";
const INIT_REQUEST_MESSAGE = "singlefile.frameTree.initRequest";
const ACK_INIT_REQUEST_MESSAGE = "singlefile.frameTree.ackInitRequest";
const CLEANUP_REQUEST_MESSAGE = "singlefile.frameTree.cleanupRequest";
const INIT_RESPONSE_MESSAGE = "singlefile.frameTree.initResponse";
const TARGET_ORIGIN = "*";
const TIMEOUT_INIT_REQUEST_MESSAGE = 5000;
const TIMEOUT_INIT_RESPONSE_MESSAGE = 10000;
const TOP_WINDOW_ID = "0";
const WINDOW_ID_SEPARATOR = ".";
const TOP_WINDOW = globalThis.window == globalThis.top;

const browser = globalThis.browser;
const top = globalThis.top;
const MessageChannel = globalThis.MessageChannel;
const document = globalThis.document;
const JSON = globalThis.JSON;
const MutationObserver = globalThis.MutationObserver;
const DOMParser = globalThis.DOMParser;

let sessions = globalThis.sessions;
if (!sessions) {
	sessions = globalThis.sessions = new Map();
}
let windowId;
if (TOP_WINDOW) {
	windowId = TOP_WINDOW_ID;
	if (browser && browser.runtime && browser.runtime.onMessage && browser.runtime.onMessage.addListener) {
		browser.runtime.onMessage.addListener(message => {
			if (message.method == INIT_RESPONSE_MESSAGE) {
				initResponse(message);
				return Promise.resolve({});
			} else if (message.method == ACK_INIT_REQUEST_MESSAGE) {
				clearFrameTimeout("requestTimeouts", message.sessionId, message.windowId);
				createFrameResponseTimeout(message.sessionId, message.windowId);
				return Promise.resolve({});
			}
		});
	}
}
init();
new MutationObserver(init).observe(document, { childList: true });

export {
	getAsync,
	getSync,
	cleanup,
	initResponse,
	TIMEOUT_INIT_REQUEST_MESSAGE
};

function init() {
	globalThis.addEventListener("message", async event => {
		if (typeof event.data == "string" && event.data.startsWith(MESSAGE_PREFIX)) {
			event.preventDefault();
			event.stopPropagation();
			const message = JSON.parse(event.data.substring(MESSAGE_PREFIX.length));
			if (message.method == INIT_REQUEST_MESSAGE) {
				if (event.source) {
					sendMessage(event.source, { method: ACK_INIT_REQUEST_MESSAGE, windowId: message.windowId, sessionId: message.sessionId });
				}
				if (!TOP_WINDOW) {
					globalThis.stop();
					if (message.options.loadDeferredImages) {
						lazy.process(message.options);
					}
					await initRequestAsync(message);
				}
			} else if (message.method == ACK_INIT_REQUEST_MESSAGE) {
				clearFrameTimeout("requestTimeouts", message.sessionId, message.windowId);
				createFrameResponseTimeout(message.sessionId, message.windowId);
			} else if (message.method == CLEANUP_REQUEST_MESSAGE) {
				cleanupRequest(message);
			} else if (message.method == INIT_RESPONSE_MESSAGE && sessions.get(message.sessionId)) {
				const port = event.ports[0];
				port.onmessage = event => initResponse(event.data);
			}
		}
	}, true);
}

function getAsync(options) {
	const sessionId = getNewSessionId();
	options = JSON.parse(JSON.stringify(options));
	return new Promise(resolve => {
		sessions.set(sessionId, {
			frames: [],
			requestTimeouts: {},
			responseTimeouts: {},
			resolve: frames => {
				frames.sessionId = sessionId;
				resolve(frames);
			}
		});
		initRequestAsync({ windowId, sessionId, options });
	});
}

function getSync(options) {
	const sessionId = getNewSessionId();
	options = JSON.parse(JSON.stringify(options));
	sessions.set(sessionId, {
		frames: [],
		requestTimeouts: {},
		responseTimeouts: {}
	});
	initRequestSync({ windowId, sessionId, options });
	const frames = sessions.get(sessionId).frames;
	frames.sessionId = sessionId;
	return frames;
}

function cleanup(sessionId) {
	sessions.delete(sessionId);
	cleanupRequest({ windowId, sessionId, options: { sessionId } });
}

function getNewSessionId() {
	return globalThis.crypto.getRandomValues(new Uint32Array(32)).join("");
}

function initRequestSync(message) {
	const sessionId = message.sessionId;
	const waitForUserScript = globalThis[helper.WAIT_FOR_USERSCRIPT_PROPERTY_NAME];
	delete globalThis._singleFile_cleaningUp;
	if (!TOP_WINDOW) {
		windowId = globalThis.frameId = message.windowId;
	}
	processFrames(document, message.options, windowId, sessionId);
	if (!TOP_WINDOW) {
		if (message.options.userScriptEnabled && waitForUserScript) {
			waitForUserScript(helper.ON_BEFORE_CAPTURE_EVENT_NAME, message.options);
		}
		sendInitResponse({ frames: [getFrameData(document, globalThis, windowId, message.options, message.scrolling)], sessionId, requestedFrameId: document.documentElement.dataset.requestedFrameId && windowId });
		if (message.options.userScriptEnabled && waitForUserScript) {
			waitForUserScript(helper.ON_AFTER_CAPTURE_EVENT_NAME, message.options);
		}
		delete document.documentElement.dataset.requestedFrameId;
	}
}

async function initRequestAsync(message) {
	const sessionId = message.sessionId;
	const waitForUserScript = globalThis[helper.WAIT_FOR_USERSCRIPT_PROPERTY_NAME];
	delete globalThis._singleFile_cleaningUp;
	if (!TOP_WINDOW) {
		windowId = globalThis.frameId = message.windowId;
	}
	processFrames(document, message.options, windowId, sessionId);
	if (!TOP_WINDOW) {
		if (message.options.userScriptEnabled && waitForUserScript) {
			await waitForUserScript(helper.ON_BEFORE_CAPTURE_EVENT_NAME, message.options);
		}
		sendInitResponse({ frames: [getFrameData(document, globalThis, windowId, message.options, message.scrolling)], sessionId, requestedFrameId: document.documentElement.dataset.requestedFrameId && windowId });
		if (message.options.userScriptEnabled && waitForUserScript) {
			await waitForUserScript(helper.ON_AFTER_CAPTURE_EVENT_NAME, message.options);
		}
		delete document.documentElement.dataset.requestedFrameId;
	}
}

function cleanupRequest(message) {
	if (!globalThis._singleFile_cleaningUp) {
		globalThis._singleFile_cleaningUp = true;
		const sessionId = message.sessionId;
		cleanupFrames(getFrames(document), message.windowId, sessionId);
	}
}

function initResponse(message) {
	message.frames.forEach(frameData => clearFrameTimeout("responseTimeouts", message.sessionId, frameData.windowId));
	const windowData = sessions.get(message.sessionId);
	if (windowData) {
		if (message.requestedFrameId) {
			windowData.requestedFrameId = message.requestedFrameId;
		}
		message.frames.forEach(messageFrameData => {
			let frameData = windowData.frames.find(frameData => messageFrameData.windowId == frameData.windowId);
			if (!frameData) {
				frameData = { windowId: messageFrameData.windowId };
				windowData.frames.push(frameData);
			}
			if (!frameData.processed) {
				frameData.content = messageFrameData.content;
				frameData.baseURI = messageFrameData.baseURI;
				frameData.title = messageFrameData.title;
				frameData.url = messageFrameData.url;
				frameData.canvases = messageFrameData.canvases;
				frameData.fonts = messageFrameData.fonts;
				frameData.worklets = messageFrameData.worklets;
				frameData.stylesheets = messageFrameData.stylesheets;
				frameData.images = messageFrameData.images;
				frameData.posters = messageFrameData.posters;
				frameData.videos = messageFrameData.videos;
				frameData.usedFonts = messageFrameData.usedFonts;
				frameData.shadowRoots = messageFrameData.shadowRoots;
				frameData.processed = messageFrameData.processed;
				frameData.scrollPosition = messageFrameData.scrollPosition;
				frameData.scrolling = messageFrameData.scrolling;
				frameData.adoptedStyleSheets = messageFrameData.adoptedStyleSheets;
			}
		});
		const remainingFrames = windowData.frames.filter(frameData => !frameData.processed).length;
		if (!remainingFrames) {
			windowData.frames = windowData.frames.sort((frame1, frame2) => frame2.windowId.split(WINDOW_ID_SEPARATOR).length - frame1.windowId.split(WINDOW_ID_SEPARATOR).length);
			if (windowData.resolve) {
				if (windowData.requestedFrameId) {
					windowData.frames.forEach(frameData => {
						if (frameData.windowId == windowData.requestedFrameId) {
							frameData.requestedFrame = true;
						}
					});
				}
				windowData.resolve(windowData.frames);
			}
		}
	}
}
function processFrames(doc, options, parentWindowId, sessionId) {
	const frameElements = getFrames(doc);
	processFramesAsync(doc, frameElements, options, parentWindowId, sessionId);
	if (frameElements.length) {
		processFramesSync(doc, frameElements, options, parentWindowId, sessionId);
	}
}

function processFramesAsync(doc, frameElements, options, parentWindowId, sessionId) {
	const frames = [];
	let requestTimeouts;
	if (sessions.get(sessionId)) {
		requestTimeouts = sessions.get(sessionId).requestTimeouts;
	} else {
		requestTimeouts = {};
		sessions.set(sessionId, { requestTimeouts });
	}
	frameElements.forEach((frameElement, frameIndex) => {
		const windowId = parentWindowId + WINDOW_ID_SEPARATOR + frameIndex;
		frameElement.setAttribute(helper.WIN_ID_ATTRIBUTE_NAME, windowId);
		frames.push({ windowId });
	});
	sendInitResponse({ frames, sessionId, requestedFrameId: doc.documentElement.dataset.requestedFrameId && parentWindowId });
	frameElements.forEach((frameElement, frameIndex) => {
		const windowId = parentWindowId + WINDOW_ID_SEPARATOR + frameIndex;
		try {
			sendMessage(frameElement.contentWindow, { method: INIT_REQUEST_MESSAGE, windowId, sessionId, options, scrolling: frameElement.scrolling });
			// eslint-disable-next-line no-unused-vars
		} catch (error) {
			// ignored
		}
		requestTimeouts[windowId] = globalThis.setTimeout(() => sendInitResponse({ frames: [{ windowId, processed: true }], sessionId }), TIMEOUT_INIT_REQUEST_MESSAGE);
	});
	delete doc.documentElement.dataset.requestedFrameId;
}

function processFramesSync(doc, frameElements, options, parentWindowId, sessionId) {
	const frames = [];
	frameElements.forEach((frameElement, frameIndex) => {
		const windowId = parentWindowId + WINDOW_ID_SEPARATOR + frameIndex;
		let frameDoc, frameWindow;
		try {
			frameDoc = frameElement.contentDocument;
			frameWindow = frameElement.contentWindow;
			frameWindow.stop();
			// eslint-disable-next-line no-unused-vars
		} catch (error) {
			// ignored
		}
		const srcdoc = frameElement.getAttribute("srcdoc");
		if (!frameDoc && srcdoc) {
			const doc = new DOMParser().parseFromString(srcdoc, "text/html");
			frameDoc = doc;
			frameWindow = globalThis;
		}
		if (frameDoc) {
			try {
				clearFrameTimeout("requestTimeouts", sessionId, windowId);
				processFrames(frameDoc, options, windowId, sessionId);
				frames.push(getFrameData(frameDoc, frameWindow, windowId, options, frameElement.scrolling));
				// eslint-disable-next-line no-unused-vars
			} catch (error) {
				frames.push({ windowId, processed: true });
			}
		}
	});
	sendInitResponse({ frames, sessionId, requestedFrameId: doc.documentElement.dataset.requestedFrameId && parentWindowId });
	delete doc.documentElement.dataset.requestedFrameId;
}

function clearFrameTimeout(type, sessionId, windowId) {
	const session = sessions.get(sessionId);
	if (session && session[type]) {
		const timeout = session[type][windowId];
		if (timeout) {
			globalThis.clearTimeout(timeout);
			delete session[type][windowId];
		}
	}
}

function createFrameResponseTimeout(sessionId, windowId) {
	const session = sessions.get(sessionId);
	if (session && session.responseTimeouts) {
		session.responseTimeouts[windowId] = globalThis.setTimeout(() => sendInitResponse({ frames: [{ windowId: windowId, processed: true }], sessionId: sessionId }), TIMEOUT_INIT_RESPONSE_MESSAGE);
	}
}

function cleanupFrames(frameElements, parentWindowId, sessionId) {
	frameElements.forEach((frameElement, frameIndex) => {
		const windowId = parentWindowId + WINDOW_ID_SEPARATOR + frameIndex;
		frameElement.removeAttribute(helper.WIN_ID_ATTRIBUTE_NAME);
		try {
			sendMessage(frameElement.contentWindow, { method: CLEANUP_REQUEST_MESSAGE, windowId, sessionId });
			// eslint-disable-next-line no-unused-vars
		} catch (error) {
			// ignored
		}
	});
	frameElements.forEach((frameElement, frameIndex) => {
		const windowId = parentWindowId + WINDOW_ID_SEPARATOR + frameIndex;
		let frameDoc;
		try {
			frameDoc = frameElement.contentDocument;
			// eslint-disable-next-line no-unused-vars
		} catch (error) {
			// ignored
		}
		if (frameDoc) {
			try {
				cleanupFrames(getFrames(frameDoc), windowId, sessionId);
				// eslint-disable-next-line no-unused-vars
			} catch (error) {
				// ignored
			}
		}
	});
}

function sendInitResponse(message) {
	message.method = INIT_RESPONSE_MESSAGE;
	try {
		top.singlefile.processors.frameTree.initResponse(message);
		// eslint-disable-next-line no-unused-vars
	} catch (error) {
		sendMessage(top, message, true);
	}
}

function sendMessage(targetWindow, message, useChannel) {
	if (targetWindow == top && browser && browser.runtime && browser.runtime.sendMessage) {
		browser.runtime.sendMessage(message);
	} else {
		if (useChannel) {
			const channel = new MessageChannel();
			targetWindow.postMessage(MESSAGE_PREFIX + JSON.stringify({ method: message.method, sessionId: message.sessionId }), TARGET_ORIGIN, [channel.port2]);
			channel.port1.postMessage(message);
		} else {
			targetWindow.postMessage(MESSAGE_PREFIX + JSON.stringify(message), TARGET_ORIGIN);
		}
	}
}

function getFrameData(document, globalThis, windowId, options, scrolling) {
	const docData = helper.preProcessDoc(document, globalThis, options);
	const content = helper.serialize(document);
	helper.postProcessDoc(document, docData.markedElements, docData.invalidElements);
	const baseURI = document.baseURI.split("#")[0];
	return {
		windowId,
		content,
		baseURI,
		url: document.documentURI,
		title: document.title,
		canvases: docData.canvases,
		fonts: docData.fonts,
		worklets: docData.worklets,
		stylesheets: docData.stylesheets,
		images: docData.images,
		posters: docData.posters,
		videos: docData.videos,
		usedFonts: docData.usedFonts,
		shadowRoots: docData.shadowRoots,
		scrollPosition: docData.scrollPosition,
		scrolling,
		adoptedStyleSheets: docData.adoptedStyleSheets,
		processed: true
	};
}

function getFrames(document) {
	let frames = Array.from(document.querySelectorAll(FRAMES_CSS_SELECTOR));
	document.querySelectorAll(ALL_ELEMENTS_CSS_SELECTOR).forEach(element => {
		const shadowRoot = helper.getShadowRoot(element);
		if (shadowRoot) {
			frames = frames.concat(...getFrames(shadowRoot));
		}
	});
	return frames;
}