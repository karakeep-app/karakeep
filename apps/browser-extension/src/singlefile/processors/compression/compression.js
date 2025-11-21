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

/* global Node */

import {
	configure,
	BlobReader,
	TextReader,
	ZipWriter,
	Uint8ArrayWriter
} from "./../../vendor/zip/zip.js";
import {
	extract
} from "./compression-extract.js";
import {
	display
} from "./compression-display.js";

const { Blob, fetch, TextEncoder, DOMParser } = globalThis;

const NO_COMPRESSION_EXTENSIONS = [".jpg", ".jpeg", ".png", ".avi", ".apng", ".pdf", ".woff2", ".mp4", ".mp3", ".ogg", ".webp", ".webm", ".avi", ".mpeg", ".ts", ".ogv", ".heif", ".heic"];
const SCRIPT_PATH = "/lib/single-file-zip.min.js";
const EXTRA_DATA_TAGS = [
	["<noscript>", "</noscript>"],
	["<noframes>", "</noframes>"],
	["<noembed>", "</noembed>"],
	["<script type=sfz-data>", "</script>"],
	["<style type=sfz-data>", "</style>"],
	["<iframe>", "</iframe>"],
	["<xmp>", "</xmp>"],
	["<plaintext>", "</plaintext>"]
];
const EMBEDDED_DATA_TAGS = [
	["<!--", "-->"],
	...EXTRA_DATA_TAGS,
];
const EXTRA_DATA_REGEXPS = [
	[/<noscript/i, /<\/noscript>/i],
	[/<noframes/i, /<\/noframes>/i],
	[/<noembed/i, /<\/noembed>/i],
	[/<script/i, /<\/script>/i],
	[/<style/i, /<\/style>/i],
	[/<iframe/i, /<\/iframe>/i],
	[/<xmp/i, /<\/xmp>/i],
	[/<plaintext/i, /<\/plaintext>/i]
];
const EMBEDDED_DATA_REGEXPS = [
	[/<!--/i, /-->/i],
	...EXTRA_DATA_REGEXPS,
];
const CRC32_TABLE = new Uint32Array(256).map((_, indexTable) => {
	let crc = indexTable;
	for (let indexBits = 0; indexBits < 8; indexBits++) {
		crc = crc & 1 ? 0xEDB88320 ^ (crc >>> 1) : crc >>> 1;
	}
	return crc;
});
const PNG_IEND_LENGTH = 12;
const PNG_SIGNATURE_LENGTH = 8;
const PNG_IHDR_LENGTH = 25;

const browser = globalThis.browser;

export {
	process
};

async function process(pageData, options, lastModDate = new Date()) {
	let script;
	if (options.zipScript) {
		script = options.zipScript;
	} else if (browser && browser.runtime && browser.runtime.getURL) {
		configure({ workerScripts: { deflate: ["/lib/single-file-z-worker.js"] } });
		script = await (await fetch(browser.runtime.getURL(SCRIPT_PATH))).text();
	}
	const zipDataWriter = new Uint8ArrayWriter();
	zipDataWriter.init();
	zipDataWriter.writable.size = 0;
	let extraDataOffset, extraData, embeddedImageDataOffset, endTag;
	if (options.embeddedImage) {
		options.embeddedImage = Array.from(options.embeddedImage);
		const embeddedImageData = options.embeddedImage.slice(PNG_SIGNATURE_LENGTH + PNG_IHDR_LENGTH, options.embeddedImage.length - PNG_IEND_LENGTH);
		await writeData(zipDataWriter.writable, options.embeddedImage.slice(0, PNG_SIGNATURE_LENGTH + PNG_IHDR_LENGTH));
		if (options.selfExtractingArchive) {
			const embeddedImageText = embeddedImageData.reduce((text, charCode) => text + String.fromCharCode(charCode), "");
			const tagIndex = EMBEDDED_DATA_REGEXPS.findIndex(tests => !embeddedImageText.match(tests[1]));
			let startTag;
			[startTag, endTag] = tagIndex == -1 ? ["", ""] : EMBEDDED_DATA_TAGS[tagIndex];
			const htmlArray = getStartHTMLArray(pageData, options, startTag);
			const hmtlData = new Uint8Array([...getLength(htmlArray.length + 4), ...[0x74, 0x45, 0x58, 0x74, 0x50, 0x4e, 0x47, 0], ...htmlArray]);
			await writeData(zipDataWriter.writable, hmtlData);
			await writeData(zipDataWriter.writable, getCRC32(hmtlData, 4));
		} else if (options.embeddedPdf) {
			const data = new Uint8Array([...getLength(options.embeddedPdf.length + 4), ...[0x74, 0x45, 0x58, 0x74, 0x50, 0x44, 0x46, 0], ...new Uint8Array(options.embeddedPdf)]);
			await writeData(zipDataWriter.writable, data);
			await writeData(zipDataWriter.writable, getCRC32(data, 4));
		}
		await writeData(zipDataWriter.writable, embeddedImageData);
		await writeData(zipDataWriter.writable, new Uint8Array(4));
		embeddedImageDataOffset = zipDataWriter.offset;
		await writeData(zipDataWriter.writable, new Uint8Array([0x74, 0x45, 0x58, 0x74, 0x5a, 0x49, 0x50, 0]));
		if (options.selfExtractingArchive) {
			await writeData(zipDataWriter.writable, new TextEncoder().encode(endTag));
		}
	}
	if (options.selfExtractingArchive) {
		extraDataOffset = await prependHTMLData(pageData, zipDataWriter, script, options);
	} else if (!options.embeddedImage && options.embeddedPdf) {
		await writeData(zipDataWriter.writable, new Uint8Array(options.embeddedPdf));
	}
	const zipWriter = new ZipWriter(zipDataWriter, { bufferedWrite: true, keepOrder: false, lastModDate });
	const startOffset = zipDataWriter.offset;
	pageData.url = options.url;
	pageData.archiveTime = (new Date()).toISOString();
	await addPageResources(zipWriter, pageData, { password: options.password }, options.createRootDirectory ? String(Date.now()) + "_" + (options.tabId || 0) + "/" : "", options.url);
	const data = await zipWriter.close(null, { preventClose: true });
	if (options.selfExtractingArchive) {
		const insertionsCRLF = [];
		const substitutionsLF = [];
		if (options.extractDataFromPage) {
			if (!options.extractDataFromPageTags) {
				let textContent = "";
				data.slice(startOffset).forEach(charCode => textContent += String.fromCharCode(charCode));
				const matchCommentTags = textContent.match(/<!--/i) || textContent.match(/-->/i);
				if (matchCommentTags) {
					return findExtraDataTags(textContent, pageData, options, lastModDate);
				}
			}
			for (let index = startOffset; index < data.length; index++) {
				if (data[index] == 13) {
					if (data[index + 1] == 10) {
						insertionsCRLF.push(index - startOffset);
					} else {
						substitutionsLF.push(index - startOffset);
					}
				}
			}
		}
		let pageContent = "";
		if (!options.preventAppendedData) {
			if (options.extractDataFromPageTags) {
				pageContent += options.extractDataFromPageTags[1];
			} else {
				pageContent += "-->";
			}
		}
		const endTags = options.preventAppendedData || options.embeddedImage ? "" : "</body></html>";
		if (options.extractDataFromPage) {
			const payload = new Uint32Array(insertionsCRLF.length + substitutionsLF.length + 2);
			payload.set(new Uint32Array([insertionsCRLF.length]), 0);
			payload.set(new Uint32Array(insertionsCRLF), 1);
			payload.set(new Uint32Array([substitutionsLF.length]), insertionsCRLF.length + 1);
			payload.set(new Uint32Array(substitutionsLF), insertionsCRLF.length + 2);
			extraData = "<sfz-extra-data>" + compress(payload.buffer) + "</sfz-extra-data>";
			if (options.preventAppendedData || extraData.length > 65535 - endTags.length - (options.embeddedImage ? PNG_IEND_LENGTH : 0)) {
				if (!options.extraDataSize) {
					options.extraDataSize = Math.floor(extraData.length * 1.001);
					return process(pageData, options, lastModDate);
				}
			} else {
				if (options.extraDataSize) {
					options.extraDataSize = undefined;
					return process(pageData, options, lastModDate);
				} else {
					pageContent += extraData;
				}
			}
		}
		pageContent += endTags;
		await writeData(zipDataWriter.writable, (new TextEncoder()).encode(pageContent));
	}
	await zipDataWriter.writable.close();
	const pageContent = await zipDataWriter.getData();
	if (options.extractDataFromPage && options.extraDataSize !== undefined) {
		if (options.extraDataSize >= extraData.length) {
			pageContent.set(Array.from(extraData).map(character => character.charCodeAt(0)), startOffset - extraDataOffset);
		} else {
			options.extraData = extraData;
			options.extraDataSize = Math.floor(extraData.length * 1.001);
			return process(pageData, options, lastModDate);
		}
	}
	if (options.embeddedImage) {
		pageContent.set(getLength(zipDataWriter.offset - embeddedImageDataOffset - 4), embeddedImageDataOffset - 4);
		return new Blob([
			pageContent,
			getCRC32(pageContent, embeddedImageDataOffset),
			new Uint8Array(options.embeddedImage.slice(options.embeddedImage.length - PNG_IEND_LENGTH))
		], { type: "application/octet-stream" });
	} else {
		return new Blob([pageContent], { type: "application/octet-stream" });
	}
}

function getCRC32(data, indexData = 0) {
	const crcArray = new Uint8Array(4);
	let crc = -1;
	for (; indexData < data.length; indexData++) {
		crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[indexData]) & 0xff];
	}
	crc ^= -1;
	setUint32(crcArray, crc);
	return crcArray;
}

function getLength(length) {
	const lengthArray = new Uint8Array(4);
	setUint32(lengthArray, length);
	return lengthArray;
}

function setUint32(data, value) {
	data[0] = value >> 24;
	data[1] = value >> 16;
	data[2] = value >> 8;
	data[3] = value;
}

async function prependHTMLData(pageData, zipDataWriter, script, options) {
	let pageContent = "";
	if (!options.embeddedImage) {
		await writeData(zipDataWriter.writable, getStartHTMLArray(pageData, options));
	}
	pageContent += "<div id=sfz-wait-message>Please wait...</div>";
	if (!options.extractDataFromPage) {
		pageContent += "<div id=sfz-error-message><strong>Error</strong>: Cannot open the page from the filesystem.";
		pageContent += "<ul style='line-height:20px;'>";
		pageContent += "<li style='margin-bottom:10px'><strong>Chrome</strong>: Install <a href='https://chrome.google.com/webstore/detail/singlefile/mpiodijhokgodhhofbcjdecpffjipkle'>SingleFile</a> and enable the option \"Allow access to file URLs\" in the details page of the extension (chrome://extensions/?id=mpiodijhokgodhhofbcjdecpffjipkle).</li>";
		pageContent += "<li style='margin-bottom:10px'><strong>Microsoft Edge</strong>: Install <a href='https://microsoftedge.microsoft.com/addons/detail/singlefile/efnbkdcfmcmnhlkaijjjmhjjgladedno'>SingleFile</a> and enable the option \"Allow access to file URLs\" in the details page of the extension (edge://extensions/?id=efnbkdcfmcmnhlkaijjjmhjjgladedno).</li>";
		pageContent += "<li><strong>Safari</strong>: Select \"Security > Disable Local File Restrictions\" in the \"Develop > Developer settings\" menu.</li></ul></div>";
	}
	if (options.insertTextBody) {
		const doc = (new DOMParser()).parseFromString(pageData.content, "text/html");
		doc.body.querySelectorAll("style, script, noscript").forEach(element => element.remove());
		let textBody = "";
		if (options.extractDataFromPage) {
			textBody += getPageTitle(pageData) + "\n\n";
		}
		textBody += doc.body.innerText;
		doc.body.querySelectorAll("single-file-note").forEach(node => {
			const template = node.querySelector("template");
			if (template) {
				const docTemplate = (new DOMParser()).parseFromString(template.innerHTML, "text/html");
				textBody += "\n" + docTemplate.body.querySelector("textarea").value;
			}
		});
		textBody = textBody.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n +/g, "\n").replace(/\n\n\n+/g, "\n\n").trim();
		pageContent += "\n<main hidden>\n" + textBody + "\n</main>\n";
	}
	const displayOptions = {
		insertEmbeddedImage: Boolean(options.embeddedImage),
		insertEmbeddedScreenshotImage: Boolean(options.embeddedScreenshotImage)
	};
	script = "<script>" +
		script +
		"document.currentScript.remove();" +
		"globalThis.addEventListener('load', () => {" +
		"globalThis.bootstrap=(()=>{let bootstrapStarted;return async content=>{if (bootstrapStarted) return bootstrapStarted; bootstrapStarted = (" +
		extract.toString().replace(/\n|\t/g, "") + ")(content,{prompt}).then(({docContent}) => " +
		display.toString().replace(/\n|\t/g, "") + "(document,docContent," + JSON.stringify(displayOptions) + "));return bootstrapStarted;}})();(" +
		getContent.toString().replace(/\n|\t/g, "") + ")().then(globalThis.bootstrap).then(() => document.dispatchEvent(new CustomEvent(\"single-file-display-infobar\"))).catch(()=>{});" +
		"});" +
		"</script>";
	pageContent += script;
	let extraData = "";
	if (options.extractDataFromPage && options.extraDataSize) {
		const extraTags = "<sfz-extra-data></sfz-extra-data>";
		extraData += extraTags + new Array(options.extraDataSize - extraTags.length).fill(" ").join("");
	}
	pageContent += extraData;
	const startTag = options.extractDataFromPageTags ? options.extractDataFromPageTags[0] : "<!--";
	pageContent += startTag;
	const extraDataOffset = startTag.length + extraData.length;
	await writeData(zipDataWriter.writable, (new TextEncoder()).encode(pageContent));
	return extraDataOffset;
}

function getStartHTMLArray(pageData, options, startTag = "") {
	let html = "";
	if (options.includeBOM && !options.extractDataFromPage && !options.embeddedImage) {
		html += "\ufeff";
	}
	html += options.embeddedImage ? "" : pageData.doctype;
	html += "<html data-sfz>";
	html += pageData.comment && !options.embeddedImage ? "<!--" + pageData.comment + "-->" : "";
	const charset = options.extractDataFromPage ? "windows-1252" : "utf-8";
	html += "<meta charset=" + charset + ">";
	const htmlHeadData = getHTMLHeadData(pageData, options);
	let htmlArray;
	if (options.embeddedPdf) {
		const embeddedPdfText = options.embeddedPdf.reduce((text, charCode) => text + String.fromCharCode(charCode), "");
		const pdfTagIndex = EMBEDDED_DATA_REGEXPS.findIndex(tests => !embeddedPdfText.match(tests[1]));
		const [pdfStartTag, pdfEndTag] = pdfTagIndex == -1 ? ["", ""] : EMBEDDED_DATA_TAGS[pdfTagIndex];
		const htmlArray1 = new TextEncoder().encode(html + pdfStartTag);
		const htmlArray2 = new TextEncoder().encode(pdfEndTag + htmlHeadData + startTag);
		htmlArray = new Uint8Array(htmlArray1.length + htmlArray2.length + options.embeddedPdf.length);
		htmlArray.set(htmlArray1);
		htmlArray.set(options.embeddedPdf, htmlArray1.length);
		htmlArray.set(htmlArray2, htmlArray1.length + options.embeddedPdf.length);
	} else {
		htmlArray = new TextEncoder().encode(html + htmlHeadData + startTag);
	}
	return htmlArray;
}

function getHTMLHeadData(pageData, options) {
	let pageContent = "";
	const title = options.extractDataFromPage ? "" : getPageTitle(pageData);
	pageContent += "<title>" + title + "</title>";
	if (options.insertCanonicalLink) {
		pageContent += "<link rel=canonical href=\"" + options.url + "\">";
	}
	if (options.insertMetaNoIndex) {
		pageContent += "<meta name=robots content=noindex>";
	}
	if (pageData.viewport) {
		pageContent += "<meta name=viewport content=" + JSON.stringify(pageData.viewport) + ">";
	}
	if (options.insertMetaCSP) {
		const cspContent = "default-src 'none';connect-src 'self' data: blob:;font-src 'self' data: blob:;img-src 'self' data: blob:;style-src 'self' 'unsafe-inline' data: blob:;frame-src 'self' data: blob:;media-src 'self' data: blob:;script-src 'self' 'unsafe-inline' data: blob:;object-src 'self' data: blob:";
		pageContent += `<meta http-equiv=content-security-policy content=${JSON.stringify(cspContent)}>`;
	}
	pageContent += "<style>@keyframes display-wait-message{0%{opacity:0}100%{opacity:1}};body{color:transparent};div{color:initial}</style>";
	pageContent += "<body hidden>";
	return pageContent;
}

function getPageTitle(pageData) {
	return pageData.title.replace(/</g, "&lt;").replace(/>/g, "&gt;") || "";
}

function findExtraDataTags(textContent, pageData, options, lastModDate, indexExtractDataFromPageTags = 0) {
	const regExpsTag = EXTRA_DATA_REGEXPS[indexExtractDataFromPageTags];
	const matchTag = textContent.match(regExpsTag[0]) || textContent.match(regExpsTag[1]);
	if (matchTag) {
		if (indexExtractDataFromPageTags < EXTRA_DATA_TAGS.length - 1) {
			return findExtraDataTags(textContent, pageData, options, lastModDate, indexExtractDataFromPageTags + 1);
		} else {
			options.extractDataFromPage = false;
			return process(pageData, options, lastModDate);
		}
	} else {
		options.extractDataFromPageTags = EXTRA_DATA_TAGS[indexExtractDataFromPageTags];
		return process(pageData, options, lastModDate);
	}
}

async function writeData(writable, array) {
	const streamWriter = writable.getWriter();
	await streamWriter.ready;
	writable.size += array.length;
	await streamWriter.write(array);
	streamWriter.releaseLock();
}

async function addPageResources(zipWriter, pageData, options, prefixName, url) {
	const resources = {};
	for (const resourceType of Object.keys(pageData.resources)) {
		for (const data of pageData.resources[resourceType]) {
			data.password = options.password;
			if (data.url && !data.url.startsWith("data:")) {
				resources[data.name] = data.url;
			}
		}
	}
	const jsonContent = JSON.stringify({
		originalUrl: pageData.url,
		title: pageData.title,
		archiveTime: pageData.archiveTime,
		indexFilename: "index.html",
		resources
	}, null, 2);
	await Promise.all([
		Promise.all([
			addFile(zipWriter, prefixName, { name: "index.html", extension: ".html", content: pageData.content, url, password: options.password }),
			addFile(zipWriter, prefixName, { name: "manifest.json", extension: ".json", content: jsonContent, password: options.password })
		]),
		Promise.all(Object.keys(pageData.resources).map(async resourceType =>
			Promise.all(pageData.resources[resourceType].map(data => {
				if (resourceType == "frames") {
					return addPageResources(zipWriter, data, options, prefixName + data.name, data.url);
				} else {
					return addFile(zipWriter, prefixName, data, true);
				}
			}))
		))
	]);
}

async function addFile(zipWriter, prefixName, data) {
	const dataReader = typeof data.content == "string" ? new TextReader(data.content) : new BlobReader(new Blob([new Uint8Array(data.content)]));
	const options = { comment: data.url && data.url.startsWith("data:") ? "data:" : data.url, password: data.password, bufferedWrite: true };
	if (NO_COMPRESSION_EXTENSIONS.includes(data.extension)) {
		options.level = 0;
	}
	await zipWriter.add(prefixName + data.name, dataReader, options);
}

async function getContent() {
	const BASE64_TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	const { Blob, XMLHttpRequest, document, stop } = globalThis;
	const characterMap = new Map([
		[65533, 0], [8364, 128], [8218, 130], [402, 131], [8222, 132], [8230, 133], [8224, 134], [8225, 135], [710, 136], [8240, 137],
		[352, 138], [8249, 139], [338, 140], [381, 142], [8216, 145], [8217, 146], [8220, 147], [8221, 148], [8226, 149], [8211, 150],
		[8212, 151], [732, 152], [8482, 153], [353, 154], [8250, 155], [339, 156], [382, 158], [376, 159]
	]);
	const xhr = new XMLHttpRequest();
	document.body.querySelectorAll("meta, style").forEach(element => document.head.appendChild(element));
	xhr.responseType = "blob";
	xhr.open("GET", "");
	return new Promise((resolve, reject) => {
		xhr.onerror = () => {
			extractPageData().then(resolve).catch(() => {
				displayMessage("sfz-error-message", 2);
				reject();
			});
		};
		xhr.send();
		xhr.onload = () => {
			stop();
			displayMessage("sfz-wait-message", 2);
			resolve(xhr.response);
		};
	});

	function displayMessage(elementId, delay = 0) {
		const element = document.getElementById(elementId);
		if (element) {
			Array.from(document.body.childNodes).forEach(node => {
				if (node.id != elementId) {
					node.remove();
				}
			});
			document.body.hidden = false;
			element.style = "opacity: 0; animation: 0s linear " + delay + "s display-wait-message 1 normal forwards";
		}
	}

	async function extractPageData() {
		const zipDataElement = document.querySelector("sfz-extra-data");
		if (zipDataElement) {
			let dataNode = zipDataElement.nextSibling;
			if (dataNode) {
				if (dataNode.nodeType == Node.TEXT_NODE && dataNode.nextSibling) {
					dataNode = dataNode.nextSibling;
				} else {
					dataNode = zipDataElement.previousSibling;
				}
			} else {
				dataNode = zipDataElement.previousSibling;
			}
			const zipData = [];
			let { textContent } = dataNode;
			displayMessage("sfz-wait-message", 2);
			for (let index = 0; index < textContent.length; index++) {
				const charCode = textContent.charCodeAt(index);
				zipData.push(charCode > 255 ? characterMap.get(charCode) : charCode);
			}
			const payload = new Uint32Array(decompress(zipDataElement.textContent).buffer);
			const insertionsCRLFLength = payload[0];
			const insertionsCRLF = payload.slice(1, 1 + insertionsCRLFLength);
			const substitutionsLFLength = payload[1 + insertionsCRLFLength];
			const substitutionsLF = payload.slice(2 + insertionsCRLFLength, 2 + insertionsCRLFLength + substitutionsLFLength);
			insertionsCRLF.forEach(index => zipData.splice(index, 1, 13, 10));
			substitutionsLF.forEach(index => zipData[index] = 13);
			return new Blob([new Uint8Array(zipData)], { type: "application/octet-stream" });
		}
		throw new Error("Extra zip data data not found");
	}

	function decompress(src) {
		src = base64Decode(src);
		let out = new Uint8Array(1024);
		let outLen = 0;
		for (let i = 0; i < src.length;) {
			const ctrl = src[i++];
			if ((ctrl & 0x80) === 0) {
				const L = ctrl;
				ensure(outLen + L);
				for (let j = 0; j < L && i < src.length; j++) {
					out[outLen++] = src[i++];
				}
			} else {
				const L = (ctrl & 0x7f) + 3;
				const off = (src[i++] << 8) | src[i++];
				const start = outLen - off;
				ensure(outLen + L);
				for (let k = 0; k < L; k++) {
					out[outLen++] = out[start + k];
				}
			}
		}
		return new Uint8Array(out.buffer.slice(0, outLen));

		function ensure(n) {
			if (out.length < n) {
				let nl = out.length * 2;
				while (nl < n) {
					nl *= 2;
				}
				const nbuf = new Uint8Array(nl);
				nbuf.set(out.subarray(0, outLen));
				out = nbuf;
			}
		};
	}

	function base64Decode(b64) {
		b64 = String(b64).replace(/[^A-Za-z0-9+/=]/g, "");
		const len = b64.length;
		const out = [];
		for (let i = 0; i < len; i += 4) {
			const a = BASE64_TABLE.indexOf(b64[i]);
			const b = BASE64_TABLE.indexOf(b64[i + 1]);
			const c = BASE64_TABLE.indexOf(b64[i + 2]);
			const d = BASE64_TABLE.indexOf(b64[i + 3]);
			const n = (a << 18) | (b << 12) | ((c & 63) << 6) | (d & 63);
			out.push((n >> 16) & 0xff);
			if (b64[i + 2] !== "=") {
				out.push((n >> 8) & 0xff);
			}
			if (b64[i + 3] !== "=") {
				out.push(n & 0xff);
			}
		}
		return new Uint8Array(out);
	}
}

const BASE64_TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Encode(bytes) {
	let out = "";
	const len = bytes.length;
	let i = 0;
	for (; i + 2 < len; i += 3) {
		const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
		out += BASE64_TABLE[(n >> 18) & 63] + BASE64_TABLE[(n >> 12) & 63] + BASE64_TABLE[(n >> 6) & 63] + BASE64_TABLE[n & 63];
	}
	const rem = len - i;
	if (rem === 1) {
		const n = bytes[i] << 16;
		out += BASE64_TABLE[(n >> 18) & 63] + BASE64_TABLE[(n >> 12) & 63] + "==";
	} else if (rem === 2) {
		const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
		out += BASE64_TABLE[(n >> 18) & 63] + BASE64_TABLE[(n >> 12) & 63] + BASE64_TABLE[(n >> 6) & 63] + "=";
	}
	return out;
}

function compress(input) {
	const src = new Uint8Array(input);
	const N = src.length;
	const out = [];
	const litBuf = [];
	const MAX_OFFSET = 0xffff;
	const MAX_MATCH = 130;
	const MAX_CANDIDATES = 64;
	const map = new Map();
	let i = 0;
	while (i < N) {
		let bestLen = 0, bestOff = 0;
		if (i + 2 < N) {
			const key = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
			const cand = map.get(key) || [];
			for (let c = cand.length - 1; c >= 0; c--) {
				const j = cand[c];
				const off = i - j;
				if (off <= 0 || off > MAX_OFFSET) {
					continue;
				}
				let k = 0;
				while (k < MAX_MATCH && i + k < N && src[j + k] === src[i + k]) {
					k++;
				}
				if (k > bestLen && k >= 3) {
					bestLen = k; bestOff = off;
					if (bestLen === MAX_MATCH) {
						break;
					}
				}
			}
		}

		if (bestLen >= 3) {
			if (litBuf.length) {
				flushLiterals();
			}
			let remain = bestLen;
			let produced = 0;
			while (remain > 0) {
				const take = Math.min(remain, MAX_MATCH);
				out.push(0x80 | ((take - 3) & 0x7f));
				out.push((bestOff >> 8) & 0xff);
				out.push(bestOff & 0xff);
				remain -= take;
				produced += take;
			}
			const start = i;
			for (let p = start; p < start + produced; p++) {
				addPos(p);
			}
			i += produced;
		} else {
			litBuf.push(src[i]);
			addPos(i);
			i++;
			if (litBuf.length === 127) {
				flushLiterals();
			}
		}
	}
	if (litBuf.length) {
		flushLiterals();
	}
	const u8 = new Uint8Array(out);
	return base64Encode(u8);

	function flushLiterals() {
		while (litBuf.length) {
			const take = Math.min(127, litBuf.length);
			out.push(take);
			for (let t = 0; t < take; t++) {
				out.push(litBuf.shift());
			}
		}
	}

	function addPos(pos) {
		if (pos + 2 < N) {
			const key = (src[pos] << 16) | (src[pos + 1] << 8) | src[pos + 2];
			const arr = map.get(key) || [];
			arr.push(pos);
			if (arr.length > MAX_CANDIDATES) {
				arr.shift();
			}
			map.set(key, arr);
		}
	}
}