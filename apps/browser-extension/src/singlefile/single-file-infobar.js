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

/* global window, document */

import { appendInfobar, refreshInfobarInfo, extractInfobarData } from "./core/infobar.js";

(globalThis => {

	const browser = globalThis.browser;
	const MutationObserver = globalThis.MutationObserver;
	init();

	function init() {
		if (globalThis.window == globalThis.top) {
			if (document.readyState == "loading") {
				document.addEventListener("DOMContentLoaded", displayIcon, false);
			} else {
				displayIcon();
			}
			document.addEventListener("single-file-display-infobar", displayIcon, false);
			new MutationObserver(init).observe(document, { childList: true });
		}
		if (globalThis.singlefile) {
			globalThis.singlefile.infobar = {
				displayIcon
			};
		}
	}

	async function displayIcon() {
		let options = { displayInfobar: true };
		const infoData = extractInfobarData(document);
		if (infoData && infoData.saveUrl) {
			if (browser && browser.runtime && browser.runtime.sendMessage) {
				try {
					options = await browser.runtime.sendMessage({ method: "tabs.getOptions", url: infoData.saveUrl });
					// eslint-disable-next-line no-unused-vars
				} catch (error) {
					// ignored
				}
			}
			if (options.displayInfobar) {
				infoData.openInfobar = options.openInfobar;
				infoData.infobarPositionAbsolute = options.infobarPositionAbsolute;
				infoData.infobarPositionTop = options.infobarPositionTop;
				infoData.infobarPositionRight = options.infobarPositionRight;
				infoData.infobarPositionBottom = options.infobarPositionBottom;
				infoData.infobarPositionLeft = options.infobarPositionLeft;
				appendInfobar(document, infoData, true);
				refreshInfobarInfo(document, infoData);
			}
		}
	}

})(typeof globalThis == "object" ? globalThis : window);