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

import * as cssTree from "./../vendor/css-tree.js";
import * as fontPropertyParser from "./../vendor/css-font-property-parser.js";
import {
	normalizeFontFamily,
	flatten,
	getFontWeight,
	removeQuotes
} from "./../core/helper.js";

const helper = {
	normalizeFontFamily,
	flatten,
	getFontWeight,
	removeQuotes
};

const REGEXP_COMMA = /\s*,\s*/;
const REGEXP_DASH = /-/;
const REGEXP_QUESTION_MARK = /\?/g;
const REGEXP_STARTS_U_PLUS = /^U\+/i;
const VALID_FONT_STYLES = [/^normal$/, /^italic$/, /^oblique$/, /^oblique\s+/];

export {
	process
};

function process(doc, stylesheets, styles, options) {
	const stats = { rules: { processed: 0, discarded: 0 }, fonts: { processed: 0, discarded: 0 } };
	const fontsInfo = { declared: [], used: [] };
	const workStyleElement = doc.createElement("style");
	let docContent = "";
	doc.body.appendChild(workStyleElement);
	stylesheets.forEach(stylesheetInfo => {
		if (stylesheetInfo.stylesheet) {
			const cssRules = stylesheetInfo.stylesheet.children;
			if (cssRules) {
				stats.processed += cssRules.size;
				stats.discarded += cssRules.size;
				getFontsInfo(cssRules, fontsInfo, options);
				docContent = getRulesTextContent(doc, cssRules, workStyleElement, docContent);
			}
		}
	});
	styles.forEach(declarations => {
		const fontFamilyNames = getFontFamilyNames(declarations, options);
		if (fontFamilyNames.length) {
			fontsInfo.used.push(fontFamilyNames);
		}
		docContent = getDeclarationsTextContent(declarations.children, workStyleElement, docContent);
	});
	workStyleElement.remove();
	docContent += doc.body.innerText;
	if (globalThis.getComputedStyle && options.doc) {
		fontsInfo.used = fontsInfo.used.map(fontNames => fontNames.map(familyName => {
			const matchedVar = familyName.match(/^var\((--.*)\)$/);
			if (matchedVar && matchedVar[1]) {
				const computedFamilyName = globalThis.getComputedStyle(options.doc.body).getPropertyValue(matchedVar[1]);
				return (computedFamilyName && computedFamilyName.split(",").map(name => helper.normalizeFontFamily(name))) || familyName;
			}
			return familyName;
		}));
		fontsInfo.used = fontsInfo.used.map(fontNames => helper.flatten(fontNames));
	}
	const variableFound = fontsInfo.used.find(fontNames => fontNames.find(fontName => fontName.match(/^var\(--/)));
	let unusedFonts, filteredUsedFonts;
	if (variableFound) {
		unusedFonts = [];
	} else {
		filteredUsedFonts = new Map();
		fontsInfo.used.forEach(fontNames => fontNames.forEach(familyName => {
			if (fontsInfo.declared.find(fontInfo => fontInfo.fontFamily == familyName)) {
				const optionalData = options.usedFonts && options.usedFonts.filter(fontInfo => fontInfo[0] == familyName);
				if (optionalData && optionalData.length) {
					filteredUsedFonts.set(familyName, optionalData);
				}
			}
		}));
		unusedFonts = fontsInfo.declared.filter(fontInfo => !filteredUsedFonts.has(fontInfo.fontFamily));
	}
	const docChars = Array.from(new Set(docContent)).map(char => char.charCodeAt(0)).sort((value1, value2) => value1 - value2);
	stylesheets.forEach(stylesheetInfo => {
		if (stylesheetInfo.stylesheet) {
			const cssRules = stylesheetInfo.stylesheet.children;
			if (cssRules) {
				filterUnusedFonts(cssRules, fontsInfo.declared, unusedFonts, filteredUsedFonts, docChars);
				stats.rules.discarded -= cssRules.size;
			}
		}
	});
	return stats;
}

function getFontsInfo(cssRules, fontsInfo, options) {
	cssRules.forEach(ruleData => {
		if (ruleData.type == "Atrule" && (ruleData.name == "media" || ruleData.name == "supports" || ruleData.name == "layer" || ruleData.name == "container") && ruleData.block && ruleData.block.children) {
			getFontsInfo(ruleData.block.children, fontsInfo, options);
		} else if (ruleData.type == "Rule") {
			const fontFamilyNames = getFontFamilyNames(ruleData.block, options);
			if (fontFamilyNames.length) {
				fontsInfo.used.push(fontFamilyNames);
			}
		} else {
			if (ruleData.type == "Atrule" && ruleData.name == "font-face") {
				const fontFamily = helper.normalizeFontFamily(getDeclarationValue(ruleData.block.children, "font-family"));
				if (fontFamily) {
					const fontWeight = getDeclarationValue(ruleData.block.children, "font-weight") || "400";
					const fontStyle = getDeclarationValue(ruleData.block.children, "font-style") || "normal";
					const fontVariant = getDeclarationValue(ruleData.block.children, "font-variant") || "normal";
					fontWeight.split(",").forEach(weightValue =>
						fontsInfo.declared.push({ fontFamily, fontWeight: helper.getFontWeight(helper.removeQuotes(weightValue)), fontStyle, fontVariant }));
				}
			}
		}
	});
}

function filterUnusedFonts(cssRules, declaredFonts, unusedFonts, filteredUsedFonts, docChars) {
	const removedRules = [];
	for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
		const ruleData = cssRule.data;
		if (ruleData.type == "Atrule" && ruleData.name == "import" && ruleData.prelude && ruleData.prelude.children && ruleData.prelude.children.head.data.importedChildren) {
			filterUnusedFonts(ruleData.prelude.children.head.data.importedChildren, declaredFonts, unusedFonts, filteredUsedFonts, docChars);
		} else if (ruleData.type == "Atrule" && (ruleData.name == "media" || ruleData.name == "supports" || ruleData.name == "layer" || ruleData.name == "container") && ruleData.block && ruleData.block.children) {
			filterUnusedFonts(ruleData.block.children, declaredFonts, unusedFonts, filteredUsedFonts, docChars);
		} else if (ruleData.type == "Atrule" && ruleData.name == "font-face") {
			const fontFamily = helper.normalizeFontFamily(getDeclarationValue(ruleData.block.children, "font-family"));
			if (fontFamily) {
				const unicodeRange = getDeclarationValue(ruleData.block.children, "unicode-range");
				if (unusedFonts.find(fontInfo => fontInfo.fontFamily == fontFamily) || !testUnicodeRange(docChars, unicodeRange) || !testUsedFont(ruleData, fontFamily, declaredFonts, filteredUsedFonts)) {
					removedRules.push(cssRule);
				}
			}
			const removedDeclarations = [];
			for (let declaration = ruleData.block.children.head; declaration; declaration = declaration.next) {
				if (declaration.data.property == "font-display") {
					removedDeclarations.push(declaration);
				}
			}
			if (removedDeclarations.length) {
				removedDeclarations.forEach(removedDeclaration => ruleData.block.children.remove(removedDeclaration));
			}
		}
	}
	removedRules.forEach(cssRule => cssRules.remove(cssRule));
}

function testUsedFont(ruleData, familyName, declaredFonts, filteredUsedFonts) {
	let test;
	const optionalUsedFonts = filteredUsedFonts && filteredUsedFonts.get(familyName);
	if (optionalUsedFonts && optionalUsedFonts.length) {
		let fontStyle = getDeclarationValue(ruleData.block.children, "font-style") || "normal";
		if (VALID_FONT_STYLES.find(rule => fontStyle.trim().match(rule))) {
			const fontWeight = helper.getFontWeight(getDeclarationValue(ruleData.block.children, "font-weight") || "400");
			const declaredFontsWeights = declaredFonts
				.filter(fontInfo => fontInfo.fontFamily == familyName && fontInfo.fontStyle == fontStyle)
				.map(fontInfo => fontInfo.fontWeight.split(" "))
				.sort((weight1, weight2) => Number.parseInt(weight1[0], 10) - Number.parseInt(weight2[0], 10));
			let usedFontWeights = optionalUsedFonts
				.map(fontInfo => getUsedFontWeight(fontInfo, fontStyle, declaredFontsWeights))
				.filter(fontWeight => fontWeight);
			test = testFontweight(fontWeight, usedFontWeights);
			if (!test) {
				usedFontWeights = optionalUsedFonts
					.map(fontInfo => {
						fontInfo = Array.from(fontInfo);
						fontInfo[2] = "normal";
						return getUsedFontWeight(fontInfo, fontStyle, declaredFontsWeights);
					})
					.filter(fontWeight => fontWeight);
				test = testFontweight(fontWeight, usedFontWeights);
				if (!test) {
					usedFontWeights = optionalUsedFonts
						.map(fontInfo => {
							fontInfo = Array.from(fontInfo);
							fontInfo[2] = fontStyle = "normal";
							return getUsedFontWeight(fontInfo, fontStyle, declaredFontsWeights);
						})
						.filter(fontWeight => fontWeight);
					test = testFontweight(fontWeight, usedFontWeights);
				}
			}
		} else {
			test = true;
		}
	} else {
		test = true;
	}
	return test;
}

function testFontweight(fontWeight, usedFontWeights) {
	let test;
	for (const fontWeightValue of fontWeight.split(",")) {
		let { min: fontWeightMin, max: fontWeightMax } = parseFontWeight(fontWeightValue);
		if (!fontWeightMax) {
			fontWeightMax = 900;
		}
		test = test || usedFontWeights.find(usedFontWeight => {
			let { min: usedFontWeightMin, max: usedFontWeightMax } = parseFontWeight(usedFontWeight);
			if (!usedFontWeightMax) {
				usedFontWeightMax = usedFontWeightMin;
			}
			return usedFontWeightMin >= fontWeightMin && usedFontWeightMax <= fontWeightMax;
		});
	}
	return test;
}

function parseFontWeight(fontWeight) {
	const fontWeightValues = fontWeight.split(" ");
	const min = Number.parseInt(helper.getFontWeight(fontWeightValues[0]), 10);
	const max = fontWeightValues[1] && Number.parseInt(helper.getFontWeight(fontWeightValues[1]), 10);
	return {
		min, max
	};
}

function getDeclarationValue(declarations, propertyName) {
	let property;
	if (declarations) {
		property = declarations.filter(declaration => declaration.property == propertyName).tail;
	}
	if (property) {
		try {
			return helper.removeQuotes(cssTree.generate(property.data.value)).toLowerCase();
			// eslint-disable-next-line no-unused-vars
		} catch (error) {
			// ignored
		}
	}
}

function getFontFamilyNames(declarations, options) {
	let fontFamilyName = declarations.children.filter(node => node.property == "font-family").tail;
	let fontFamilyNames = [];
	if (fontFamilyName) {
		if (fontFamilyName.data.value.children) {
			parseFamilyNames(fontFamilyName.data.value, fontFamilyNames);
		} else {
			fontFamilyName = cssTree.generate(fontFamilyName.data.value);
			if (fontFamilyName) {
				fontFamilyNames.push(helper.normalizeFontFamily(fontFamilyName));
			}
		}
	}
	const font = declarations.children.filter(node => node.property == "font").tail;
	if (font && font.data && font.data.value) {
		try {
			let value = font.data.value;
			let fontFamilyName = cssTree.generate(value);
			const matchedVar = fontFamilyName.match(/^var\((--.*)\)$/);
			if (matchedVar && matchedVar[1]) {
				value = cssTree.parse(globalThis.getComputedStyle(options.doc.body).getPropertyValue(matchedVar[1]), { context: "value" });
			}
			const parsedFont = fontPropertyParser.parse(value);
			parsedFont.family.forEach(familyName => fontFamilyNames.push(helper.normalizeFontFamily(familyName)));
			// eslint-disable-next-line no-unused-vars
		} catch (error) {
			// ignored				
		}
	}
	return fontFamilyNames;
}

function parseFamilyNames(fontFamilyNameTokenData, fontFamilyNames) {
	let nextToken = fontFamilyNameTokenData.children.head;
	while (nextToken) {
		if (nextToken.data.type == "Identifier") {
			let familyName = nextToken.data.name;
			let nextIdentifierToken = nextToken.next;
			while (nextIdentifierToken && nextIdentifierToken.data.type != "Operator" && nextIdentifierToken.data.value != ",") {
				familyName += " " + nextIdentifierToken.data.name;
				nextIdentifierToken = nextIdentifierToken.next;
			}
			fontFamilyNames.push(helper.normalizeFontFamily(familyName));
			nextToken = nextToken.next;
		} else if (nextToken.data.type == "Function" && nextToken.data.name == "var" && nextToken.data.children) {
			const varName = nextToken.data.children.head.data.name;
			fontFamilyNames.push(helper.normalizeFontFamily("var(" + varName + ")"));
			let nextValueToken = nextToken.data.children.head.next;
			while (nextValueToken && nextValueToken.data.type == "Operator" && nextValueToken.data.value == ",") {
				nextValueToken = nextValueToken.next;
			}
			const fallbackToken = nextValueToken;
			if (fallbackToken) {
				if (fallbackToken.data.children) {
					parseFamilyNames(fallbackToken.data, fontFamilyNames);
				} else {
					fontFamilyNames.push(helper.normalizeFontFamily(fallbackToken.data.value));
				}
			}
			nextToken = nextToken.next;
		} else if (nextToken.data.type == "String") {
			fontFamilyNames.push(helper.normalizeFontFamily(nextToken.data.value));
			nextToken = nextToken.next;
		} else if (nextToken.data.type == "Number") {
			fontFamilyNames.push(helper.normalizeFontFamily(String(nextToken.data.value)));
			nextToken = nextToken.next;
		} else {
			nextToken = nextToken.next;
		}
	}
}

function getUsedFontWeight(fontInfo, fontStyle, fontWeights) {
	let foundWeight;
	fontWeights = fontWeights.map(weights => weights.map(value => String(Number.parseInt(value, 10))));
	if (fontInfo[2] == fontStyle) {
		let fontWeight = Number(fontInfo[1]);
		if (fontWeights.length > 1) {
			if (fontWeight >= 400 && fontWeight <= 500) {
				foundWeight = fontWeights.find(weights => weights[0] >= fontWeight && weights[0] <= 500);
				if (!foundWeight) {
					foundWeight = findDescendingFontWeight(fontWeight, fontWeights);
				}
				if (!foundWeight) {
					foundWeight = findAscendingFontWeight(fontWeight, fontWeights);
				}
			}
			if (fontWeight < 400) {
				foundWeight = fontWeights.slice().reverse().find(weights => weights[weights.length - 1] <= fontWeight);
				if (!foundWeight) {
					foundWeight = findAscendingFontWeight(fontWeight, fontWeights);
				}
			}
			if (fontWeight > 500) {
				foundWeight = fontWeights.find(weights => weights[0] >= fontWeight);
				if (!foundWeight) {
					foundWeight = findDescendingFontWeight(fontWeight, fontWeights);
				}
			}
			if (!foundWeight) {
				foundWeight = fontWeights.find(weights => weights[0] <= fontWeight && weights[weights.length - 1] >= fontWeight);
			}
		} else {
			foundWeight = fontWeights[0];
		}
	}
	return foundWeight ? foundWeight.join(" ") : undefined;
}

function findDescendingFontWeight(fontWeight, fontWeights) {
	return fontWeights.slice().reverse().find(weights => weights[weights.length - 1] < fontWeight);
}

function findAscendingFontWeight(fontWeight, fontWeights) {
	return fontWeights.find(weights => weights[0] > fontWeight);
}

function getRulesTextContent(doc, cssRules, workStylesheet, content) {
	cssRules.forEach(ruleData => {
		if (ruleData.block && ruleData.block.children && ruleData.prelude && ruleData.prelude.children) {
			if (ruleData.type == "Atrule" && (ruleData.name == "media" || ruleData.name == "supports" || ruleData.name == "layer" || ruleData.name == "container")) {
				content = getRulesTextContent(doc, ruleData.block.children, workStylesheet, content);
			} else if (ruleData.type == "Rule") {
				content = getDeclarationsTextContent(ruleData.block.children, workStylesheet, content);
			}
		}
	});
	return content;
}

function getDeclarationsTextContent(declarations, workStylesheet, content) {
	const contentText = getDeclarationUnescapedValue(declarations, "content", workStylesheet);
	const quotesText = getDeclarationUnescapedValue(declarations, "quotes", workStylesheet);
	if (!content.includes(contentText)) {
		content += contentText;
	}
	if (!content.includes(quotesText)) {
		content += quotesText;
	}
	return content;
}

function getDeclarationUnescapedValue(declarations, property, workStylesheet) {
	const rawValue = getDeclarationValue(declarations, property) || "";
	if (rawValue) {
		workStylesheet.textContent = "tmp { content:\"" + rawValue + "\"}";
		if (workStylesheet.sheet && workStylesheet.sheet.cssRules) {
			return helper.removeQuotes(workStylesheet.sheet.cssRules[0].style.getPropertyValue("content"));
		} else {
			return rawValue;
		}
	}
	return "";
}

function testUnicodeRange(docCharCodes, unicodeRange) {
	if (unicodeRange) {
		const unicodeRanges = unicodeRange.split(REGEXP_COMMA);
		const result = unicodeRanges.filter(rangeValue => {
			const range = rangeValue.split(REGEXP_DASH);
			if (range.length == 2) {
				range[0] = transformRange(range[0]);
				range[1] = transformRange(range[1]);
			} else if (range.length == 1) {
				if (range[0].includes("?")) {
					const firstRange = range[0];
					const secondRange = firstRange;
					range[0] = transformRange(firstRange.replace(REGEXP_QUESTION_MARK, "0"));
					range[1] = transformRange(secondRange.replace(REGEXP_QUESTION_MARK, "F"));
				} else if (range[0]) {
					range[0] = range[1] = transformRange(range[0]);
				}
			}
			if (!range[0] || docCharCodes.find(charCode => charCode >= range[0] && charCode <= range[1])) {
				return true;
			}
		});
		return Boolean(!unicodeRanges.length || result.length);
	}
	return true;
}

function transformRange(range) {
	range = range.replace(REGEXP_STARTS_U_PLUS, "");
	return parseInt(range, 16);
}