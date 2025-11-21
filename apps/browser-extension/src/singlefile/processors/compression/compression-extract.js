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

/* global zip, Blob, FileReader, URL */

export {
	extract
};

async function extract(content, { password, prompt = () => { }, shadowRootScriptURL, zipOptions = { useWebWorkers: false }, noBlobURL } = {}) {
	const KNOWN_MIMETYPES = {
		"gif": "image/gif",
		"jpg": "image/jpeg",
		"png": "image/png",
		"tif": "image/tiff",
		"tiff": "image/tiff",
		"bmp": "image/bmp",
		"ico": "image/vnd.microsoft.icon",
		"webp": "image/webp",
		"svg": "image/svg+xml",
		"avi": "video/x-msvideo",
		"ogv": "video/ogg",
		"mp4": "video/mp4",
		"mpeg": "video/mpeg",
		"ts": "video/mp2t",
		"webm": "video/webm",
		"3gp": "video/3gpp",
		"3g2": "video/3gpp",
		"mp3": "audio/mpeg",
		"oga": "audio/ogg",
		"mid": "audio/midi",
		"midi": "audio/midi",
		"opus": "audio/opus",
		"wav": "audio/wav",
		"weba": "audio/webm",
		"heif": "image/heif",
		"heic": "image/heic",
		"avif": "image/avif",
		"apng": "image/apng",
		"mov": "video/quicktime",
		"otf": "font/otf",
		"ttf": "font/ttf",
		"woff": "font/woff",
		"woff2": "font/woff2",
		"eot": "application/vnd.ms-fontobject",
		"pdf": "application/pdf"
	};
	const REGEXP_MATCH_STYLESHEET = /stylesheet_[0-9]+\.css/;
	const REGEXP_MATCH_SCRIPT = /scripts\/[0-9]+\.js/;
	const REGEXP_MATCH_ROOT_INDEX = /^([0-9_]+\/)?index\.html$/;
	const REGEXP_MATCH_INDEX = /index\.html$/;
	const REGEXP_MATCH_FRAMES = /frames\//;
	const REGEXP_MATCH_TOP_LEVEL_FRAME = /^frames\/\d+\/index.html/;
	const REGEXP_MATCH_MANIFEST = /manifest\.json$/;
	const CHARSET_UTF8 = ";charset=utf-8";
	const REGEXP_ESCAPE = /([{}()^$&.*?/+|[\\\\]|\]|-)/g;

	if (Array.isArray(content)) {
		content = new Blob([new Uint8Array(content)]);
	}
	zip.configure(zipOptions);
	const blobReader = new zip.BlobReader(content);
	const zipReader = new zip.ZipReader(blobReader);
	const entries = await zipReader.getEntries();
	const options = { password };
	let docContent, origDocContent, url, resources = [], indexPages = [], textResources = [];
	await Promise.all(entries.map(async entry => {
		const { filename } = entry;
		let dataWriter, content, textContent, mimeType;
		const resourceInfo = {};
		if (!options.password && entry.encrypted) {
			options.password = prompt("Please enter the password to view the page");
		}
		if (filename.match(REGEXP_MATCH_INDEX) || filename.match(REGEXP_MATCH_STYLESHEET) || filename.match(REGEXP_MATCH_SCRIPT)) {
			if (filename.match(REGEXP_MATCH_INDEX)) {
				indexPages.push(resourceInfo);
			} else {
				textResources.push(resourceInfo);
			}
			dataWriter = new zip.TextWriter();
			textContent = await entry.getData(dataWriter, options);
			if (filename.match(REGEXP_MATCH_INDEX)) {
				mimeType = "text/html" + CHARSET_UTF8;
			} else {
				if (filename.match(REGEXP_MATCH_STYLESHEET)) {
					mimeType = "text/css" + CHARSET_UTF8;
				} else if (filename.match(REGEXP_MATCH_SCRIPT)) {
					mimeType = "text/javascript" + CHARSET_UTF8;
				}
			}
		} else {
			resources.push(resourceInfo);
			const extension = filename.match(/\.([^.]+)/);
			if (extension && extension[1] && KNOWN_MIMETYPES[extension[1]]) {
				mimeType = KNOWN_MIMETYPES[extension[1]];
			} else {
				mimeType = "application/octet-stream";
			}
			if (filename.match(REGEXP_MATCH_FRAMES) || noBlobURL) {
				content = await entry.getData(new zip.Data64URIWriter(mimeType), options);
			} else {
				const blob = await entry.getData(new zip.BlobWriter(mimeType), options);
				content = URL.createObjectURL(blob);
			}
		}
		const name = entry.filename.match(/^([0-9_]+\/)?(.*)$/)[2];
		let prefixPath = "";
		const prefixPathMatch = filename.match(/(.*\/)[^/]+$/);
		if (prefixPathMatch && prefixPathMatch[1]) {
			prefixPath = prefixPathMatch[1];
		}
		Object.assign(resourceInfo, {
			prefixPath,
			filename: entry.filename,
			name,
			url: entry.comment,
			content,
			mimeType,
			textContent,
			parentResources: []
		});
	}));
	await zipReader.close();
	indexPages.sort(sortByFilenameLengthDec);
	textResources.sort(sortByFilenameLengthInc);
	resources = resources.sort(sortByFilenameLengthDec).concat(...textResources).concat(...indexPages);
	for (const resource of resources) {
		const { filename, prefixPath } = resource;
		let { textContent } = resource;
		if (textContent !== undefined) {
			if (filename.match(REGEXP_MATCH_ROOT_INDEX)) {
				origDocContent = textContent;
			}
			if (!filename.match(REGEXP_MATCH_SCRIPT)) {
				resources.forEach(innerResource => {
					const { filename, parentResources, content } = innerResource;
					if (filename.startsWith(prefixPath) && filename != resource.filename) {
						const relativeFilename = filename.substring(prefixPath.length);
						if (!relativeFilename.match(REGEXP_MATCH_MANIFEST)) {
							if (textContent.includes(relativeFilename)) {
								parentResources.push(resource.filename);
								if (innerResource.textContent === undefined) {
									textContent = replaceAll(textContent, relativeFilename, content);
								}
							}
						}
					}
				});
				resource.textContent = textContent;
			}
		}
	}
	for (const resource of resources) {
		let { textContent, prefixPath, filename } = resource;
		if (textContent !== undefined) {
			if (!filename.match(REGEXP_MATCH_SCRIPT)) {
				const resourceFilename = filename;
				for (const innerResource of resources) {
					const { filename } = innerResource;
					if (filename.startsWith(prefixPath) && filename != resourceFilename) {
						const relativeFilename = filename.substring(prefixPath.length);
						if (!relativeFilename.match(REGEXP_MATCH_MANIFEST)) {
							const position = textContent.indexOf(relativeFilename);
							if (position != -1) {
								innerResource.content = await getContent(innerResource);
								textContent = replaceAll(textContent, relativeFilename, innerResource.content);
							}
						}
					}
				}
				resource.textContent = textContent;
				resource.content = await getContent(resource);
			}
			if (filename.match(REGEXP_MATCH_INDEX)) {
				if (shadowRootScriptURL) {
					resource.textContent = textContent.replace(/<script data-template-shadow-root.*<\/script>/g, "<script data-template-shadow-root src=" + shadowRootScriptURL + "></" + "script>");
				}
			}
			if (filename.match(REGEXP_MATCH_ROOT_INDEX)) {
				docContent = textContent;
				url = resource.url;
			}
		}
	}
	return { docContent, origDocContent, resources, url };

	async function getContent(resource) {
		return resource.filename.match(REGEXP_MATCH_FRAMES) && !resource.filename.match(REGEXP_MATCH_TOP_LEVEL_FRAME) || noBlobURL ? await getDataURI(resource.textContent, resource.mimeType) : URL.createObjectURL(new Blob([resource.textContent], { type: resource.mimeType }));
	}

	async function getDataURI(textContent, mimeType) {
		const reader = new FileReader();
		reader.readAsDataURL(new Blob([textContent], { type: mimeType }));
		return new Promise((resolve, reject) => {
			reader.onload = () => resolve(reader.result.replace(CHARSET_UTF8, ""));
			reader.onerror = reject;
		});
	}

	function replaceAll(string, search, replacement) {
		if (typeof string.replaceAll == "function") {
			return string.replaceAll(search, replacement);
		} else {
			const searchRegExp = new RegExp(search.replace(REGEXP_ESCAPE, "\\$1"), "g");
			return string.replace(searchRegExp, replacement);
		}
	}

	function sortByFilenameLengthDec(resourceLeft, resourceRight) {
		const lengthDifference = resourceRight.filename.length - resourceLeft.filename.length;
		if (lengthDifference) {
			return lengthDifference;
		} else {
			return resourceRight.filename.localeCompare(resourceLeft.filename);
		}
	}

	function sortByFilenameLengthInc(resourceLeft, resourceRight) {
		const lengthDifference = resourceLeft.filename.length - resourceRight.filename.length;
		if (lengthDifference) {
			return lengthDifference;
		} else {
			return resourceLeft.filename.localeCompare(resourceRight.filename);
		}
	}
}