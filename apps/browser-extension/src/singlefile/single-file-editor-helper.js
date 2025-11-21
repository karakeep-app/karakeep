/*
 * Copyright 2010-2020 Gildas Lormeau
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

import * as serializer from "./modules/html-serializer.js";
import { formatFilename } from "./modules/template-formatter.js";
import * as infobar from "./core/infobar.js";
import { getInstance } from "./core/util.js";
import * as zip from "./vendor/zip/zip.js";
import { extract } from "./processors/compression/compression-extract.js";
import { display } from "./processors/compression/compression-display.js";

const util = getInstance();
const helper = {
	serialize(doc, compressHTML) {
		return serializer.process(doc, compressHTML);
	},
	getDoctypeString(doc) {
		return util.getDoctypeString(doc);
	},
	appendInfobar(doc, options, useShadowRoot) {
		return infobar.appendInfobar(doc, options, useShadowRoot);
	},
	extractInfobarData(doc) {
		return infobar.extractInfobarData(doc);
	},
	displayIcon(doc, useShadowRoot, options = {}) {
		return infobar.displayIcon(doc, useShadowRoot, options);
	},
	fixInvalidNesting(document, preventCleanup = false) {
		return util.fixInvalidNesting(document, preventCleanup);
	},
	markInvalidNesting(document) {
		return util.markInvalidNesting(document);
	},
	zip,
	extract,
	display,
	formatFilename,
	INFOBAR_TAGNAME: infobar.INFOBAR_TAGNAME,
	NESTING_TRACK_ID_ATTRIBUTE_NAME: util.NESTING_TRACK_ID_ATTRIBUTE_NAME
};

export {
	helper
};