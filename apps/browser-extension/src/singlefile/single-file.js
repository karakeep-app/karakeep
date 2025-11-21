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

import * as processors from "./processors/index.js";
import * as vendor from "./vendor/index.js";
import * as modules from "./modules/index.js";
import * as core from "./core/index.js";
import * as helper from "./core/helper.js";
import * as util from "./core/util.js";

let SingleFile;

export {
	init,
	getPageData,
	processors,
	vendor,
	modules,
	helper,
	SingleFile
};

function init(initOptions) {
	if (typeof SingleFile == "undefined") {
		SingleFile = core.getClass(util.getInstance(initOptions));
	}
}

async function getPageData(options = {}, initOptions, doc, win) {
	if (doc === undefined) {
		doc = globalThis.document;
	}
	if (win === undefined) {
		win = globalThis;
	}
	const frames = processors.frameTree;
	let framesSessionId;
	init(initOptions);
	if (doc && win) {
		helper.initDoc(doc);
		const preInitializationPromises = [];
		if (!options.saveRawPage) {
			let lazyLoadPromise;
			if (options.loadDeferredImages) {
				lazyLoadPromise = processors.lazy.process(options);
				if (options.loadDeferredImagesBeforeFrames) {
					await lazyLoadPromise;
				}
			}
			if (!options.removeFrames && frames && globalThis.frames) {
				let frameTreePromise;
				if (options.loadDeferredImages) {
					frameTreePromise = new Promise(resolve => globalThis.setTimeout(() => resolve(frames.getAsync(options)), options.loadDeferredImagesBeforeFrames || !options.loadDeferredImages ? 0 : options.loadDeferredImagesMaxIdleTime));
				} else {
					frameTreePromise = frames.getAsync(options);
				}
				if (options.loadDeferredImagesBeforeFrames) {
					options.frames = await frameTreePromise;
				} else {
					preInitializationPromises.push(frameTreePromise);
				}
			}
			if (options.loadDeferredImages && !options.loadDeferredImagesBeforeFrames) {
				preInitializationPromises.push(lazyLoadPromise);
			}
		}
		if (!options.loadDeferredImagesBeforeFrames) {
			[options.frames] = await Promise.all(preInitializationPromises);
		}
		framesSessionId = options.frames && options.frames.sessionId;
	}
	options.doc = doc;
	options.win = win;
	options.insertCanonicalLink = true;

	const externalOnProgress = options.onprogress;
	options.onprogress = async event => {
		if (event.type === event.RESOURCES_INITIALIZED && doc && win && options.loadDeferredImages) {
			processors.lazy.resetZoomLevel(options);
		}

		if (externalOnProgress) {
			await externalOnProgress(event);
		}
	};

	const processor = new SingleFile(options);
	await processor.run();
	if (framesSessionId) {
		frames.cleanup(framesSessionId);
	}
	const pageData = await processor.getPageData();
	if (options.compressContent) {
		const blob = await processors.compression.process(pageData, {
			insertTextBody: options.insertTextBody,
			url: options.url,
			createRootDirectory: options.createRootDirectory,
			selfExtractingArchive: options.selfExtractingArchive,
			extractDataFromPage: options.extractDataFromPage,
			preventAppendedData: options.preventAppendedData,
			insertCanonicalLink: options.insertCanonicalLink,
			insertMetaNoIndex: options.insertMetaNoIndex,
			insertMetaCSP: options.insertMetaCSP,
			password: options.password,
			zipScript: options.zipScript,
			embeddedImage: options.embeddedImage,
			embeddedPdf: options.embeddedPdf
		});
		delete pageData.resources;
		const reader = new globalThis.FileReader();
		reader.readAsArrayBuffer(blob);
		const arrayBuffer = await new Promise((resolve, reject) => {
			reader.addEventListener("load", () => resolve(reader.result), false);
			reader.addEventListener("error", event => reject(event.detail.error), false);
		});
		pageData.content = Array.from(new Uint8Array(arrayBuffer));
	}
	return pageData;
}