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

/* global getComputedStyle, XPathResult, Node */

import {
	SINGLE_FILE_SIGNATURE,
} from "./constants.js";

const INFOBAR_TAGNAME = "single-file-infobar";
const INFOBAR_STYLES = `
.infobar,
.infobar .infobar-icon,
.infobar .infobar-link-icon {
  min-inline-size: 28px;
  min-block-size: 28px;
  box-sizing: border-box;
}

.infobar,
.infobar .infobar-close-icon,
.infobar .infobar-link-icon {
  opacity: 0.7;
  transition: opacity 250ms;
}

.infobar:hover,
.infobar .infobar-close-icon:hover,
.infobar .infobar-link-icon:hover {
  opacity: 1;
}

.infobar,
.infobar-content {
  display: flex;
}

.infobar {
  position: fixed;
  max-height: calc(100% - 32px);
  top: 16px;
  right: 16px;
  margin-inline-start: 16px;
  margin-block-end: 16px;
  color: #2d2d2d;
  background-color: #737373;
  border: 2px solid;
  border-color: #eee;
  border-radius: 16px;
  z-index: 2147483647;
  animation-name: flash;
  animation-duration: .5s;
  animation-timing-function: cubic-bezier(0.39, 0.58, 0.57, 1);
  animation-delay: 1s;
  animation-iteration-count: 2;
}

.infobar:valid, .infobar:not(:focus-within):not(.infobar-focus) .infobar-content {
  display: none;
}

.infobar:focus-within, .infobar.infobar-focus {
  background-color: #f9f9f9;
  border-color: #878787;
  border-radius: 8px;
  opacity: 1;
  transition-property: opacity, background-color, border-color, border-radius, color;
}

.infobar-content {
  border: 2px solid;
  border-color: #f9f9f9;
  border-radius: 6px;
  background-color: #f9f9f9;
  overflow: auto;
}

.infobar-content span {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 14px;
  line-height: 18px;
  word-break: break-word;
  white-space: pre-wrap;
  margin-inline: 4px;
  margin-block: 4px;
}

.infobar .infobar-icon,
.infobar .infobar-close-icon,
.infobar .infobar-link-icon {
  cursor: pointer;
  background-position: center;
  background-repeat: no-repeat;
}

.infobar .infobar-close-icon,
.infobar .infobar-link-icon {
  align-self: flex-start;
}

.infobar .infobar-icon {
  position: absolute;
  min-inline-size: 24px;
  min-block-size: 24px;
}

@keyframes flash {
  0%, 100% {
	background-color: #737373;
  }
  50% {
	background-color: #dd6a00;
  }
}

.infobar:focus-within .infobar-icon, .infobar.infobar-focus .infobar-icon {
  z-index: -1;
  background-image: none;
  margin: 4px;
}

.infobar .infobar-close-icon {
  min-inline-size: 22px;
  min-block-size: 22px;
}

.infobar .infobar-icon {
  background-color: transparent;
  background-size: 70%;
  background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABABAMAAABYR2ztAAABhmlDQ1BJQ0MgcHJvZmlsZQAAKJF9kj1Iw0AYht+mSkUrDnYQcchQnSyIijqWKhbBQmkrtOpgcukfNGlIUlwcBdeCgz+LVQcXZ10dXAVB8AfEydFJ0UVK/C4ptIjx4LiH9+59+e67A4RGhalm1wSgapaRisfEbG5VDLyiDwEAvZiVmKkn0osZeI6ve/j4ehfhWd7n/hz9St5kgE8kjjLdsIg3iGc2LZ3zPnGIlSSF+Jx43KACiR+5Lrv8xrnosMAzQ0YmNU8cIhaLHSx3MCsZKvE0cVhRNcoXsi4rnLc4q5Uaa9XJbxjMaytprtMcQRxLSCAJETJqKKMCCxFaNVJMpGg/5uEfdvxJcsnkKoORYwFVqJAcP/gb/O6tWZiadJOCMaD7xbY/RoHALtCs2/b3sW03TwD/M3Cltf3VBjD3SXq9rYWPgIFt4OK6rcl7wOUOMPSkS4bkSH6aQqEAvJ/RM+WAwVv6EGtu31r7OH0AMtSr5Rvg4BAYK1L2use9ezr79u+ZVv9+AFlNcp0UUpiqAAAACXBIWXMAAC4jAAAuIwF4pT92AAAAB3RJTUUH5AsHADIRLMaOHwAAABl0RVh0Q29tbWVudABDcmVhdGVkIHdpdGggR0lNUFeBDhcAAAAPUExURQAAAIqKioyNjY2OjvDw8L2y1DEAAAABdFJOUwBA5thmAAAAAWJLR0QB/wIt3gAAAGNJREFUSMdjYCAJsLi4OBCQx6/CBQwIGIDPCBcXAkYQUsACU+AwlBVQHg6Eg5pgZBGOboIJZugDFwRwoJECJCUOhJI1wZwzqmBUwagCuipgIqTABG9h7YIKaKGAURAFEF/6AQAO4HqSoDP8bgAAAABJRU5ErkJggg==);
}

.infobar .infobar-link-icon {
  right: 4px;
  background-size: 60%;
  background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABAAgMAAADXB5lNAAABhmlDQ1BJQ0MgcHJvZmlsZQAAKJF9kj1Iw0AYht+mSkUrDnYQcchQnSyIijqWKhbBQmkrtOpgcukfNGlIUlwcBdeCgz+LVQcXZ10dXAVB8AfEydFJ0UVK/C4ptIjx4LiH9+59+e67A4RGhalm1wSgapaRisfEbG5VDLyiDwEAvZiVmKkn0osZeI6ve/j4ehfhWd7n/hz9St5kgE8kjjLdsIg3iGc2LZ3zPnGIlSSF+Jx43KACiR+5Lrv8xrnosMAzQ0YmNU8cIhaLHSx3MCsZKvE0cVhRNcoXsi4rnLc4q5Uaa9XJbxjMaytprtMcQRxLSCAJETJqKKMCCxFaNVJMpGg/5uEfdvxJcsnkKoORYwFVqJAcP/gb/O6tWZiadJOCMaD7xbY/RoHALtCs2/b3sW03TwD/M3Cltf3VBjD3SXq9rYWPgIFt4OK6rcl7wOUOMPSkS4bkSH6aQqEAvJ/RM+WAwVv6EGtu31r7OH0AMtSr5Rvg4BAYK1L2use9ezr79u+ZVv9+AFlNcp0UUpiqAAAACXBIWXMAAC4jAAAuIwF4pT92AAAAB3RJTUUH5AsHAB8H+DhhoQAAABl0RVh0Q29tbWVudABDcmVhdGVkIHdpdGggR0lNUFeBDhcAAAAJUExURQAAAICHi4qKioTuJAkAAAABdFJOUwBA5thmAAAAAWJLR0QCZgt8ZAAAAJJJREFUOI3t070NRCEMA2CnYAOyDyPwpHj/Va7hJ3FzV7zy3ET5JIwoAF6Jk4wzAJAkzxAYG9YRTgB+24wBgKmfrGAKTcEfAY4KRlRoIeBTgKOCERVaCPgU4Khge2GqKOBTgKOCERVaAEC/4PNcnyoSWHpjqkhwKxbcig0Q6AorXYF/+A6eIYD1lVbwG/jdA6/kA2THRAURVubcAAAAAElFTkSuQmCC);
}

.infobar .infobar-close-icon {
  appearance: none;
  background-size: 80%;
  background-image: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABAAgMAAADXB5lNAAABhmlDQ1BJQ0MgcHJvZmlsZQAAKJF9kj1Iw0AYht+mSkUrDnYQcchQnSyIijqWKhbBQmkrtOpgcukfNGlIUlwcBdeCgz+LVQcXZ10dXAVB8AfEydFJ0UVK/C4ptIjx4LiH9+59+e67A4RGhalm1wSgapaRisfEbG5VDLyiDwEAvZiVmKkn0osZeI6ve/j4ehfhWd7n/hz9St5kgE8kjjLdsIg3iGc2LZ3zPnGIlSSF+Jx43KACiR+5Lrv8xrnosMAzQ0YmNU8cIhaLHSx3MCsZKvE0cVhRNcoXsi4rnLc4q5Uaa9XJbxjMaytprtMcQRxLSCAJETJqKKMCCxFaNVJMpGg/5uEfdvxJcsnkKoORYwFVqJAcP/gb/O6tWZiadJOCMaD7xbY/RoHALtCs2/b3sW03TwD/M3Cltf3VBjD3SXq9rYWPgIFt4OK6rcl7wOUOMPSkS4bkSH6aQqEAvJ/RM+WAwVv6EGtu31r7OH0AMtSr5Rvg4BAYK1L2use9ezr79u+ZVv9+AFlNcp0UUpiqAAAACXBIWXMAAC4jAAAuIwF4pT92AAAAB3RJTUUH5AsHAB8VC4EQ6QAAABl0RVh0Q29tbWVudABDcmVhdGVkIHdpdGggR0lNUFeBDhcAAAAJUExURQAAAICHi4qKioTuJAkAAAABdFJOUwBA5thmAAAAAWJLR0QCZgt8ZAAAAJtJREFUOI3NkrsBgCAMRLFwBPdxBArcfxXFkO8rbKWAAJfHJ9faf9vuYX/749T5NmShm3bEwbe2SxeuM4+2oxDL1cDoKtVUjRy+tH78Cv2CS+wIiQNC1AEhk4AQeUTMWUJMfUJMSEJMSEY8kIx4IONroaYAimNxsXp1PA7PxwfVL8QnowwoVC0lig07wDDVUjAdbAnjwtow/z/bDW7eI4M2KruJAAAAAElFTkSuQmCC);
}
`;

export { displayIcon, appendInfobar, refreshInfobarInfo, extractInfobarData, INFOBAR_TAGNAME };

function appendInfobar(doc, options, useShadowRoot) {
	if (!doc.querySelector(INFOBAR_TAGNAME)) {
		let infoData;
		if (options.infobarContent) {
			infoData = options.infobarContent.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
		} else if (options.saveDate) {
			infoData = options.saveDate;
		}
		infoData = infoData || "No info";
		const parentElement = doc.body.tagName == "BODY" ? doc.body : doc.documentElement;
		const infobarElement = createElement(doc, INFOBAR_TAGNAME, parentElement);
		let infobarContainer;
		if (useShadowRoot) {
			infobarContainer = infobarElement.attachShadow({ mode: "open" });
		} else {
			const shadowRootTemplate = doc.createElement("template");
			shadowRootTemplate.setAttribute("shadowrootmode", "open");
			infobarElement.appendChild(shadowRootTemplate);
			infobarContainer = shadowRootTemplate;
		}
		const shadowRootContent = doc.createElement("div");
		const styleElement = doc.createElement("style");
		styleElement.textContent = INFOBAR_STYLES;
		if (options.infobarPositionAbsolute) {
			styleElement.textContent += ".infobar { position: absolute; }";
			const parentElementStyle = getComputedStyle(parentElement);
			if (parentElementStyle.position == "static") {
				parentElement.style.setProperty("position", "relative", "important");
			}
		}
		if (options.infobarPositionTop) {
			styleElement.textContent += `.infobar { top: ${options.infobarPositionTop}; bottom: auto; }`;
		} else if (options.infobarPositionBottom) {
			styleElement.textContent += `.infobar { bottom: ${options.infobarPositionBottom}; top: auto; }`;
		}
		if (options.infobarPositionRight) {
			styleElement.textContent += `.infobar { right: ${options.infobarPositionRight}; left: auto; }`;
		} else if (options.infobarPositionLeft) {
			styleElement.textContent += `.infobar { left: ${options.infobarPositionLeft}; right: auto; }`;
		}
		styleElement.textContent = styleElement.textContent
			.replace(/ {2}/g, "")
			.replace(/\n/g, "")
			.replace(/: /g, ":")
			.replace(/, /g, ",");
		shadowRootContent.appendChild(styleElement);
		const infobarContent = doc.createElement("form");
		infobarContent.classList.add("infobar");
		if (options.openInfobar) {
			infobarContent.classList.add("infobar-focus");
		}
		shadowRootContent.appendChild(infobarContent);
		const iconElement = doc.createElement("span");
		iconElement.tabIndex = -1;
		iconElement.classList.add("infobar-icon");
		infobarContent.appendChild(iconElement);
		const contentElement = doc.createElement("span");
		contentElement.tabIndex = -1;
		contentElement.classList.add("infobar-content");
		const closeButtonElement = doc.createElement("input");
		closeButtonElement.type = "checkbox";
		closeButtonElement.required = true;
		closeButtonElement.classList.add("infobar-close-icon");
		closeButtonElement.title = "Close";
		contentElement.appendChild(closeButtonElement);
		const textElement = doc.createElement("span");
		textElement.textContent = infoData;
		contentElement.appendChild(textElement);
		const linkElement = doc.createElement("a");
		linkElement.classList.add("infobar-link-icon");
		linkElement.target = "_blank";
		linkElement.rel = "noopener noreferrer";
		linkElement.title = "Open source URL: " + options.saveUrl;
		linkElement.href = options.saveUrl;
		contentElement.appendChild(linkElement);
		infobarContent.appendChild(contentElement);
		if (useShadowRoot) {
			infobarContainer.appendChild(shadowRootContent);
		} else {
			const scriptElement = doc.createElement("script");
			let scriptContent = refreshInfobarInfo.toString() + ";";
			scriptContent += extractInfobarData.toString() + ";";
			scriptContent += "(" + initInfobar.toString() + ")(document, " + JSON.stringify(SINGLE_FILE_SIGNATURE) + ");";
			scriptElement.textContent = scriptContent;
			shadowRootContent.appendChild(scriptElement);
			infobarContainer.innerHTML = shadowRootContent.outerHTML;
		}
	}
}

function extractInfobarData(doc, signature = SINGLE_FILE_SIGNATURE) {
	const result = doc.evaluate("//comment()", doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
	let singleFileComment = result && result.singleNodeValue;
	if (singleFileComment && singleFileComment.nodeType == Node.COMMENT_NODE && singleFileComment.textContent.includes(signature)) {
		const info = singleFileComment.textContent.split("\n");
		const [, , urlData, ...optionalData] = info;
		const urlMatch = urlData.match(/^ url: (.*) ?$/);
		const saveUrl = urlMatch && urlMatch[1];
		if (saveUrl) {
			let infobarContent, saveDate;
			if (optionalData.length) {
				saveDate = optionalData[0].split("saved date: ")[1];
				if (saveDate) {
					optionalData.shift();
				}
				if (optionalData.length > 1) {
					let content = optionalData[0].split("info: ")[1].trim();
					for (let indexLine = 1; indexLine < optionalData.length - 1; indexLine++) {
						content += "\n" + optionalData[indexLine].trim();
					}
					infobarContent = content.trim();
				}
			}
			return { saveUrl, infobarContent, saveDate };
		}
	}
}

function refreshInfobarInfo(doc, { saveUrl, infobarContent, saveDate }) {
	if (saveUrl) {
		const infobarElement = doc.querySelector("single-file-infobar");
		const shadowRootFragment = infobarElement.shadowRoot;
		const infobarContentElement = shadowRootFragment.querySelector(".infobar-content span");
		infobarContentElement.textContent = infobarContent || saveDate;
		const linkElement = shadowRootFragment.querySelector(".infobar-content .infobar-link-icon");
		linkElement.href = saveUrl;
		linkElement.title = "Open source URL: " + saveUrl;
	}
}

function displayIcon(doc, useShadowRoot, options = {}) {
	const infoData = extractInfobarData(doc);
	if (infoData.saveUrl) {
		infoData.openInfobar = options.openInfobar;
		infoData.infobarPositionAbsolute = options.infobarPositionAbsolute;
		infoData.infobarPositionTop = options.infobarPositionTop;
		infoData.infobarPositionRight = options.infobarPositionRight;
		infoData.infobarPositionBottom = options.infobarPositionBottom;
		infoData.infobarPositionLeft = options.infobarPositionLeft;
		appendInfobar(doc, infoData, useShadowRoot);
		refreshInfobarInfo(doc, infoData);
	}
}

function initInfobar(doc, signature) {
	const infoData = extractInfobarData(doc, signature);
	if (infoData && infoData.saveUrl) {
		refreshInfobarInfo(doc, infoData);
	}
}

function createElement(doc, tagName, parentElement) {
	const element = doc.createElement(tagName);
	parentElement.appendChild(element);
	Array.from(getComputedStyle(element)).forEach(property => element.style.setProperty(property, "initial", "important"));
	return element;
}