/*
 * Copyright 2010-2025 Gildas Lormeau
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
import { computeMaxSpecificity } from "./css-specificity.js";
import { parsePrelude } from "./css-scope-prelude-parser.js";
import { sanitizeSelector } from "./css-selector-sanitizer.js";

const DEBUG = false;

const CANONICAL_PSEUDO_ELEMENT_NAMES = new Set(["after", "before", "first-letter", "first-line", "placeholder", "selection", "part", "marker"]);
const DYNAMIC_STATE_PSEUDO_CLASSES = new Set(["hover", "focus", "active", "focus-within", "focus-visible", "target", "visited", "link", "target-current"]);
const CONDITIONAL_AT_RULE_NAMES = new Set(["media", "supports", "container"]);
const RULE_TYPE = "Rule";
const AT_RULE_TYPE = "Atrule";
const NESTING_SELECTOR_TYPE = "NestingSelector";
const PSEUDO_CLASS_SELECTOR_TYPE = "PseudoClassSelector";
const DECLARATION_TYPE = "Declaration";
const RAW_TYPE = "Raw";
const VALUE_TYPE = "Value";
const PSEUDO_ELEMENT_SELECTOR_TYPE = "PseudoElementSelector";
const LAYER_NAME = "layer";
const SCOPE_NAME = "scope";
const IMPORT_NAME = "import";
const FONT_FACE_NAME = "font-face";
const KEYFRAMES_NAME = "keyframes";
const COMBINATOR_NAME = "Combinator";
const STYLE_ATTRIBUTE_NAME = "style";
const SELECTOR_LIST_CONTEXT = "selectorList";
const STYLESHEET_CONTEXT = "stylesheet";
const SELECTOR_CONTEXT = "selector";
const DECLARATION_LIST_CONTEXT = "declarationList";
const PARSE_CSS_ERROR_MESSAGE = "Failed to parse CSS";
const QSA_ERROR_MESSAGE = "Failed to match selector";
const ROOT_PSEUDO_CLASS = ":root";
const PRELUDE_SEPARATOR = ",";
const NESTING_SELECTOR = "&";
const VENDOR_PREFIX = "-";
const CUSTOM_PROPERTY_PREFIX = "--";
const LAYER_NAME_SEPARATOR = ".";
const DECLARATION_KEY_SEPARATOR = ":";
const CONTEXT_KEY_SEPARATOR = "|";
const BLOCK_OPEN = "{";
const BLOCK_CLOSE = "}";
const EMPTY_STRING = "";
const CSS_IMPORTANCE_NOT_IMPORTANT = 0;
const CSS_IMPORTANCE_IMPORTANT = 1;
const INVALID_CSS_ESCAPE_TEST = /\\(?![0-9a-fA-F]{1,6}\s|[^0-9a-zA-Z])/;
const ANONYMOUS_LAYER_PLACEHOLDER = "\u0000";

export {
	process
};

function process(doc, stylesheets) {
	const docContext = {
		doc,
		stats: { processed: 0, discarded: 0 },
		matchedElements: new Set(),
		matchedSelectors: new Map(),
		matchingSelectors: new Map(),
		layerDeclarationCounter: 0,
		layerDeclarations: [],
		layerOrder: new Map(),
		selectorData: new Map(),
		selectorTexts: new Map(),
		preludeTexts: new Map(),
		scopeRoots: new Map(),
		scopeSpecificities: new Map(),
		rulesCounter: 0,
	};
	collectLayerOrder(stylesheets, docContext);
	buildEffectiveLayerOrder(docContext);
	minifyRules(stylesheets, docContext);
	computeCascade(docContext);
	removeEmptyRules(stylesheets, docContext);
	return docContext.stats;
}

function collectLayerOrder(stylesheets, docContext) {
	stylesheets.forEach((stylesheetInfo, key) => {
		if (!stylesheetInfo.scoped && stylesheetInfo.stylesheet && !key.urlNode) {
			if (hasChildNodes(stylesheetInfo.stylesheet)) {
				collectStylesheetLayerOrder(stylesheetInfo.stylesheet.children, { layerStack: [], conditionalStack: [] }, docContext);
			}
		}
	});
}

function buildEffectiveLayerOrder(docContext) {
	const layerNames = [];
	for (let indexDeclaration = 0; indexDeclaration < docContext.layerDeclarations.length; indexDeclaration++) {
		const declaration = docContext.layerDeclarations[indexDeclaration];
		layerNames.push(declaration.name);
	}
	for (let indexLayerName = 0; indexLayerName < layerNames.length; indexLayerName++) {
		const name = layerNames[indexLayerName];
		if (!docContext.layerOrder.has(name)) {
			docContext.layerOrder.set(name, docContext.layerOrder.size);
		}
	}
}

function minifyRules(stylesheets, docContext) {
	stylesheets.forEach((stylesheetInfo, key) => {
		if (!stylesheetInfo.scoped && stylesheetInfo.stylesheet && !key.urlNode) {
			if (hasChildNodes(stylesheetInfo.stylesheet)) {
				const topConditionalStack = stylesheetInfo.mediaText ? [{ name: "media", prelude: stylesheetInfo.mediaText }] : [];
				minifyStylesheetRules(stylesheetInfo.stylesheet.children, stylesheets, {
					ancestorsSelectors: [],
					layerStack: [],
					conditionalStack: topConditionalStack
				}, docContext);
			}
		}
	});
}

function computeCascade(docContext) {
	const winningDeclarations = new Set();
	docContext.matchedElements.forEach(element => computeCascadedStylesForElement(element, winningDeclarations, docContext));
	removeLosingDeclarations(winningDeclarations, docContext);
}

function removeEmptyRules(stylesheets, docContext) {
	stylesheets.forEach((stylesheetInfo, key) => {
		if (!stylesheetInfo.scoped && stylesheetInfo.stylesheet && !key.urlNode) {
			if (hasChildNodes(stylesheetInfo.stylesheet)) {
				removeStylesheetEmptyRules(stylesheetInfo.stylesheet.children, docContext);
			}
		}
	});
}

function collectStylesheetLayerOrder(cssRules, layerContext, docContext) {
	const { layerStack, conditionalStack } = layerContext;
	for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
		const ruleData = cssRule.data;
		if (ruleData.type === AT_RULE_TYPE && ruleData.name === LAYER_NAME) {
			collectStylesheetLayerRule(ruleData, layerStack, conditionalStack, docContext);
		} else if (ruleData.type === AT_RULE_TYPE && hasChildNodes(ruleData.block)) {
			const newConditionalStack = buildConditionalStack(conditionalStack, ruleData, docContext);
			collectStylesheetLayerOrder(ruleData.block.children, { layerStack, conditionalStack: newConditionalStack }, docContext);
		} else if (ruleData.type === RULE_TYPE && hasChildNodes(ruleData.block)) {
			collectStylesheetLayerOrder(ruleData.block.children, layerContext, docContext);
		}
	}
}

function collectStylesheetLayerRule(ruleData, layerStack, conditionalStack, docContext) {
	if (ruleData.block) {
		const layerName = getPreludeText(ruleData.prelude, docContext);
		registerLayerDeclaration(layerStack, layerName, conditionalStack, docContext);
		collectStylesheetLayerOrder(ruleData.block.children, { layerStack: [...layerStack, layerName], conditionalStack }, docContext);
	} else if (ruleData.prelude) {
		const layerNames = getPreludeText(ruleData.prelude, docContext).split(PRELUDE_SEPARATOR);
		layerNames.forEach(layerName => registerLayerDeclaration(layerStack, layerName, conditionalStack, docContext));
	}
}

function buildConditionalStack(conditionalStack, ruleData, docContext) {
	const isConditional = CONDITIONAL_AT_RULE_NAMES.has(ruleData.name);
	return isConditional
		? [...conditionalStack, { name: ruleData.name, prelude: getPreludeText(ruleData.prelude, docContext) }]
		: conditionalStack;
}

function registerLayerDeclaration(layerStack, layerName, conditionalStack, docContext) {
	const fullLayerName = getFullLayerName([...layerStack, layerName]);
	docContext.layerDeclarations.push({
		name: fullLayerName,
		order: docContext.layerDeclarationCounter++,
		conditionalStack: conditionalStack.slice()
	});
}

function minifyStylesheetRules(cssRules, stylesheets, processingContext, docContext) {
	const removedRules = new Set();
	for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
		docContext.stats.processed++;
		minifyRule(cssRule.data, cssRule, stylesheets, processingContext, removedRules, docContext);
	}
	removedRules.forEach(cssRule => cssRules.remove(cssRule));
}

function minifyRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext) {
	if (ruleData.type === AT_RULE_TYPE && ruleData.name === IMPORT_NAME && hasChildNodes(ruleData.prelude) && ruleData.prelude.children.head.data.importedChildren) {
		minifyImportRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext);
	} else if (ruleData.type === AT_RULE_TYPE && ruleData.name === LAYER_NAME && hasChildNodes(ruleData.block)) {
		minifyLayerRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext);
	} else if (ruleData.type === AT_RULE_TYPE && ruleData.name === SCOPE_NAME && hasChildNodes(ruleData.block)) {
		minifyScopeRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext);
	} else if (ruleData.type === AT_RULE_TYPE && ruleData.name !== FONT_FACE_NAME && ruleData.name !== KEYFRAMES_NAME && !ruleData.name.startsWith(VENDOR_PREFIX) && hasChildNodes(ruleData.block)) {
		minifyAtRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext);
	} else if (ruleData.type === RULE_TYPE && hasChildNodes(ruleData.prelude)) {
		minifyStylesheetRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext);
	}
}

function minifyImportRule(ruleData, _cssRule, stylesheets, processingContext, _removedRules, docContext) {
	const urlNode = ruleData.prelude.children.head.data;
	const topConditionalStack = urlNode.importedMediaText ? [{ name: "media", prelude: urlNode.importedMediaText }] : [];
	if (urlNode.importedLayerName !== undefined) {
		topConditionalStack.push({ name: "layer", prelude: urlNode.importedLayerName });
	}
	if (urlNode.importedSupportsCondition !== undefined) {
		topConditionalStack.push({ name: "supports", prelude: urlNode.importedSupportsCondition });
	}
	minifyStylesheetRules(urlNode.importedChildren, stylesheets, {
		...processingContext,
		conditionalStack: topConditionalStack
	}, docContext);
}

function minifyLayerRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext) {
	const layerName = getPreludeText(ruleData.prelude, docContext);
	const newProcessingContext = { ...processingContext, layerStack: [...processingContext.layerStack, layerName] };
	expandRawCssRules(ruleData);
	minifyStylesheetRules(ruleData.block.children, stylesheets, newProcessingContext, docContext);
	if (!hasChildNodes(ruleData.block)) {
		docContext.stats.discarded++;
		removedRules.add(cssRule);
	}
}

function minifyScopeRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext) {
	const parsedPrelude = parsePrelude(ruleData.prelude);
	const includeLists = parsedPrelude.include.map(item => item.text);
	const excludeLists = parsedPrelude.exclude.map(item => item.text);
	const newConditionalStack = buildConditionalStack(processingContext.conditionalStack, ruleData, docContext);
	const newProcessingContext = {
		...processingContext,
		conditionalStack: newConditionalStack,
		scopeIncludeLists: [...(processingContext.scopeIncludeLists || []), includeLists],
		scopeExclusionLists: [...(processingContext.scopeExclusionLists || []), excludeLists],
		scopeNestingLevel: (processingContext.scopeNestingLevel || 0) + 1
	};
	expandRawCssRules(ruleData);
	minifyStylesheetRules(ruleData.block.children, stylesheets, newProcessingContext, docContext);
	if (!hasChildNodes(ruleData.block)) {
		docContext.stats.discarded++;
		removedRules.add(cssRule);
	}
}

function minifyAtRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext) {
	const newConditionalStack = buildConditionalStack(processingContext.conditionalStack, ruleData, docContext);
	const newProcessingContext = { ...processingContext, conditionalStack: newConditionalStack };
	expandRawCssRules(ruleData);
	minifyStylesheetRules(ruleData.block.children, stylesheets, newProcessingContext, docContext);
	if (!hasChildNodes(ruleData.block)) {
		docContext.stats.discarded++;
		removedRules.add(cssRule);
	}
}

function minifyStylesheetRule(ruleData, cssRule, stylesheets, processingContext, removedRules, docContext) {
	ruleData.order = docContext.rulesCounter++;
	const removedSelectors = processSelectors(ruleData, processingContext, docContext);
	const wasDiscarded = removeUnmatchedSelectors(ruleData, removedSelectors, removedRules, cssRule, docContext);
	if (!wasDiscarded && hasChildNodes(ruleData.block)) {
		processNestedRules(ruleData, stylesheets, processingContext, docContext);
	}
}

function processSelectors(ruleData, processingContext, docContext) {
	const removedSelectors = [];
	const { ancestorsSelectors } = processingContext;
	for (let selector = ruleData.prelude.children.head, selectorIndex = 0; selector; selector = selector.next, selectorIndex++) {
		const {
			startsWithCombinator,
			hasPseudoElement,
			hasDynamicStatePseudoClass,
			scopeRelative
		} = analyzeSelector(selector.data);
		registerSelector(selector, ruleData, scopeRelative, processingContext, docContext);
		if (!hasPseudoElement && !hasDynamicStatePseudoClass &&
			(!startsWithCombinator || !ancestorsSelectors || !ancestorsSelectors.length)) {
			const matchedElements = matchElements(selector, ancestorsSelectors, docContext);
			if (matchedElements.length) {
				updateMatchingSelectors(matchedElements, selector, docContext);
			} else {
				removedSelectors.push(selector);
			}
		}
	}
	return removedSelectors;
}

function analyzeSelector(selector) {
	let hasPseudoElement = false;
	let hasDynamicStatePseudoClass = false;
	let hasNestingOrScope = false;
	let startsWithCombinator = false;
	cssTree.walk(selector, {
		enter(node) {
			if (node.type === PSEUDO_ELEMENT_SELECTOR_TYPE) {
				hasPseudoElement = true;
			} else if (node.type === PSEUDO_CLASS_SELECTOR_TYPE) {
				if (CANONICAL_PSEUDO_ELEMENT_NAMES.has(node.name)) {
					hasPseudoElement = true;
				} else if (DYNAMIC_STATE_PSEUDO_CLASSES.has(node.name)) {
					hasDynamicStatePseudoClass = true;
				} else if (node.name === SCOPE_NAME) {
					hasNestingOrScope = true;
				}
			} else if (node.type === NESTING_SELECTOR_TYPE) {
				hasNestingOrScope = true;
			}
		}
	});
	const firstChild = selector.children.head.data;
	startsWithCombinator = firstChild && firstChild.type === COMBINATOR_NAME;
	const scopeRelative = !startsWithCombinator && !hasNestingOrScope;
	return { hasPseudoElement, hasDynamicStatePseudoClass, startsWithCombinator, scopeRelative };
}

function updateMatchingSelectors(matchedElements, selector, docContext) {
	matchedElements.forEach(element => {
		docContext.matchedElements.add(element);
		let matchingSelectors = docContext.matchingSelectors.get(element);
		if (!matchingSelectors) {
			matchingSelectors = [];
			docContext.matchingSelectors.set(element, matchingSelectors);
			element.matchingSelectors = matchingSelectors;
		}
		matchingSelectors.push(selector);
	});
}

function processNestedRules(ruleData, stylesheets, processingContext, docContext) {
	expandRawCssRules(ruleData);
	const newProcessingContext = { ...processingContext, ancestorsSelectors: [...processingContext.ancestorsSelectors, ruleData.prelude] };
	minifyStylesheetRules(ruleData.block.children, stylesheets, newProcessingContext, docContext);
}

function registerSelector(selector, ruleData, scopeRelative, processingContext, docContext) {
	const {
		ancestorsSelectors,
		layerStack,
		conditionalStack,
		scopeIncludeLists,
		scopeExclusionLists,
		scopeNestingLevel
	} = processingContext;
	docContext.selectorData.set(selector, {
		specificity: computeMaxSpecificity(selector.data, ancestorsSelectors),
		rule: ruleData,
		layerStack,
		conditionalStack,
		scopeIncludeLists,
		scopeExclusionLists,
		scopeNestingLevel,
		scopeRelative
	});
}

function computeCascadedStylesForElement(element, winningDeclarations, docContext) {
	const cascadedStyles = new Map();
	const allDeclarations = collectDeclarationItemsForElement(element, docContext);
	const contextGroups = new Map();
	allDeclarations.forEach(declarationData => {
		const { selector } = declarationData;
		const conditionalStack = getConditionalStackForSelector(selector, docContext);
		const contextKey = createContextKey(conditionalStack);
		if (!contextGroups.has(contextKey)) {
			contextGroups.set(contextKey, []);
		}
		contextGroups.get(contextKey).push(declarationData);
	});
	contextGroups.forEach(declarations => {
		declarations.sort((declarationA, declarationB) => compareDeclarations(declarationA, declarationB, docContext));
		declarations.forEach(declarationData => {
			const { selector, declaration } = declarationData;
			const conditionalStack = getConditionalStackForSelector(selector, docContext);
			cascadedStyles.set(declaration.data.property + DECLARATION_KEY_SEPARATOR + createContextKey(conditionalStack), {
				selector,
				declaration
			});
		});
	});
	cascadedStyles.forEach(({ declaration }) => winningDeclarations.add(declaration));
}

function createContextKey(conditionalStack) {
	return conditionalStack.map(context => `${context.name}:${context.prelude}`).join(CONTEXT_KEY_SEPARATOR);
}

function collectDeclarationItemsForElement(element, docContext) {
	const matchingSelectors = docContext.matchingSelectors.get(element);
	const allDeclarations = [];
	matchingSelectors.forEach(selector => {
		const cssRule = docContext.selectorData.get(selector).rule;
		if (hasChildNodes(cssRule.block)) {
			const declarations = cssRule.block.children;
			for (let declaration = declarations.head; declaration; declaration = declaration.next) {
				const { type, value } = declaration.data;
				if (type === DECLARATION_TYPE && value) {
					const isRawValue = value.type === RAW_TYPE;
					const isSingleValue = value.type === VALUE_TYPE &&
						hasChildNodes(value) &&
						value.children.length == 1 &&
						value.children.head.data.name;
					const isVendorValue = isSingleValue && value.children.head.data.name.startsWith(VENDOR_PREFIX);
					const isInvalidValue = isSingleValue && INVALID_CSS_ESCAPE_TEST.test(value.children.head.data.name);
					if (!isRawValue && !isVendorValue && !isInvalidValue) {
						allDeclarations.push({
							declaration,
							selector,
							effectiveSpecificity: computeEffectiveSpecificity(
								docContext.selectorData.get(selector), element, docContext),
							isInline: false
						});
					}
				}
			}
		}
	});
	const inlineDeclarations = getInlineStyleDeclarations(element);
	for (const declaration of inlineDeclarations) {
		allDeclarations.push({
			declaration: declaration.declaration,
			effectiveSpecificity: declaration.effectiveSpecificity,
			isInline: true
		});
	}
	return allDeclarations;
}

function getConditionalStackForSelector(selector, docContext) {
	let conditionalStack = [];
	if (selector) {
		const selectorData = docContext.selectorData.get(selector);
		if (selectorData && selectorData.conditionalStack) {
			conditionalStack = selectorData.conditionalStack;
		}
	}
	return conditionalStack;
}

function matchElements(selector, ancestorsSelectors, docContext) {
	const selectorText = createSelectorText(selector, ancestorsSelectors, docContext);
	const selectorData = docContext.selectorData.get(selector);
	const hasScope = selectorData && ((selectorData.scopeIncludeLists && selectorData.scopeIncludeLists.length) || selectorData.scopeNestingLevel > 0);
	const cacheKey = createMatchCacheKey(hasScope, selectorData, selectorText);
	const cached = docContext.matchedSelectors.get(cacheKey);
	if (cached) {
		return cached;
	} else {
		if (hasScope) {
			return collectScopedMatches(cacheKey, selector, docContext);
		} else {
			const nodes = querySelectorAll(docContext.doc, selectorText, docContext.scopeRoots);
			docContext.matchedSelectors.set(cacheKey, nodes);
			return nodes;
		}
	}
}

function createSelectorText(selector, ancestorsSelectors, docContext) {
	let selectorText;
	if (ancestorsSelectors && ancestorsSelectors.length) {
		selectorText = combineSelectorWithAncestors(selector.data, ancestorsSelectors, docContext);
		const combinedAst = parseCss(selectorText, SELECTOR_LIST_CONTEXT);
		selectorText = sanitizeSelector({ data: combinedAst }, ancestorsSelectors, docContext);
	}
	if (!selectorText) {
		selectorText = sanitizeSelector(selector, ancestorsSelectors, docContext);
	}
	return selectorText;
}

function createMatchCacheKey(hasScope, selectorData, selectorText) {
	if (hasScope) {
		const include = selectorData.scopeIncludeLists || [];
		const exclude = selectorData.scopeExclusionLists || [];
		const relative = selectorData.scopeRelative ? 1 : 0;
		const nesting = selectorData.scopeNestingLevel || 0;
		return [
			selectorText,
			JSON.stringify(include),
			JSON.stringify(exclude), String(relative), String(nesting)
		].join(CONTEXT_KEY_SEPARATOR);
	} else {
		return selectorText;
	}
}

function collectScopedMatches(cacheKey, selector, docContext) {
	const selectorData = docContext.selectorData.get(selector);
	const includeLists = selectorData.scopeIncludeLists && selectorData.scopeIncludeLists.length ? selectorData.scopeIncludeLists[selectorData.scopeIncludeLists.length - 1] : [];
	const excludeLists = selectorData.scopeExclusionLists && selectorData.scopeExclusionLists.length ? selectorData.scopeExclusionLists[selectorData.scopeExclusionLists.length - 1] : [];
	const matchedSet = new Set();
	const includes = includeLists.length ? includeLists : [ROOT_PSEUDO_CLASS];
	for (const includeSelector of includes) {
		collectMatchesForInclude(includeSelector, selector, excludeLists, docContext, matchedSet);
	}
	const matchedElements = Array.from(matchedSet);
	docContext.matchedSelectors.set(cacheKey, matchedElements);
	return matchedElements;
}

function collectMatchesForInclude(includeSelector, selector, excludeLists, docContext, matchedSet) {
	const rootsForInclude = getScopeRoots(includeSelector, docContext);
	for (const rootForInclude of rootsForInclude) {
		const roots = querySelectorForRoot(rootForInclude, normalizeForRoot(selector), docContext.scopeRoots);
		if (roots.length) {
			if (excludeLists && excludeLists.length) {
				const filteredRoots = filterExcludedRoots(roots, excludeLists, docContext);
				filteredRoots.forEach(root => matchedSet.add(root));
			} else {
				roots.forEach(root => matchedSet.add(root));
			}
		}
	}
}

function querySelectorForRoot(root, selector, cache) {
	const nodes = querySelectorAll(root, selector, cache);
	if (root.matches && root.matches(selector)) {
		if (nodes.indexOf(root) === -1) {
			nodes.unshift(root);
		}
	}
	return nodes;
}

function normalizeForRoot(selector) {
	const selectorData = cssTree.clone(selector.data);
	cssTree.walk(selectorData, {
		visit: NESTING_SELECTOR_TYPE,
		enter(_node, item, list) {
			const scope = { type: PSEUDO_CLASS_SELECTOR_TYPE, name: SCOPE_NAME };
			list.insertData(scope, item);
			list.remove(item);
		}
	});
	for (let selectorChild = selectorData.children.head; selectorChild; selectorChild = selectorChild.next) {
		const childData = selectorChild.data;
		if (hasChildNodes(childData)) {
			const head = childData.children.head;
			const headData = head.data;
			if (headData && headData.type === COMBINATOR_NAME) {
				const scope = { type: PSEUDO_CLASS_SELECTOR_TYPE, name: SCOPE_NAME };
				childData.children.insertData(scope, head);
			}
		}
	}
	return cssTree.generate(selectorData);
}

function getScopeRoots(selector, docContext) {
	let roots = docContext.scopeRoots.get(selector);
	if (!roots) {
		roots = querySelectorAll(docContext.doc, selector, docContext.scopeRoots);
	}
	return roots;
}

function filterExcludedRoots(roots, excludeLists, docContext) {
	const excludeRoots = new Set();
	for (const excludeSelector of excludeLists) {
		const rootsForExclude = getScopeRoots(excludeSelector, docContext);
		rootsForExclude.forEach(root => excludeRoots.add(root));
	}
	return roots.filter(node => !Array.from(excludeRoots).some(excludedRoot => excludedRoot.contains(node)));
}

function compareDeclarations(declarationA, declarationB, docContext) {
	const importantA = declarationA.declaration.data.important ? CSS_IMPORTANCE_IMPORTANT : CSS_IMPORTANCE_NOT_IMPORTANT;
	const importantB = declarationB.declaration.data.important ? CSS_IMPORTANCE_IMPORTANT : CSS_IMPORTANCE_NOT_IMPORTANT;
	if (importantA !== importantB) {
		return importantA - importantB;
	}
	if (declarationA.isInline && !declarationB.isInline) return 1;
	if (!declarationA.isInline && declarationB.isInline) return -1;
	const selectorDataA = declarationA.selector ? docContext.selectorData.get(declarationA.selector) : null;
	const selectorDataB = declarationB.selector ? docContext.selectorData.get(declarationB.selector) : null;
	if (selectorDataA && selectorDataB) {
		const layerComparison = compareLayers(selectorDataA.layerStack, selectorDataB.layerStack, docContext);
		if (layerComparison !== 0) {
			return importantA ? -layerComparison : layerComparison;
		}
		const specificityA = declarationA.effectiveSpecificity;
		const specificityB = declarationB.effectiveSpecificity;
		if (specificityA.a !== specificityB.a) {
			return specificityA.a - specificityB.a;
		}
		if (specificityA.b !== specificityB.b) {
			return specificityA.b - specificityB.b;
		}
		if (specificityA.c !== specificityB.c) {
			return specificityA.c - specificityB.c;
		}
		if (selectorDataA.rule.order !== selectorDataB.rule.order) {
			return selectorDataA.rule.order - selectorDataB.rule.order;
		}
		return 0;
	} else {
		const specificityA = declarationA.effectiveSpecificity;
		const specificityB = declarationB.effectiveSpecificity;
		if (specificityA.a !== specificityB.a) {
			return specificityA.a - specificityB.a;
		}
		if (specificityA.b !== specificityB.b) {
			return specificityA.b - specificityB.b;
		}
		if (specificityA.c !== specificityB.c) {
			return specificityA.c - specificityB.c;
		}
		return 0;
	}
}

function compareLayers(layersA, layersB, docContext) {
	const isUnlayeredA = layersA.length === 0;
	const isUnlayeredB = layersB.length === 0;
	if (isUnlayeredA && isUnlayeredB) {
		return 0;
	}
	if (isUnlayeredA) {
		return 1;
	}
	if (isUnlayeredB) {
		return -1;
	}
	const fullLayerNameA = getFullLayerName(layersA);
	const fullLayerNameB = getFullLayerName(layersB);
	if (fullLayerNameA === fullLayerNameB) {
		return 0;
	}
	const minLength = Math.min(layersA.length, layersB.length);
	const effectiveMap = docContext.layerOrder;
	for (let indexLayer = 0; indexLayer < minLength; indexLayer++) {
		if (layersA[indexLayer] !== layersB[indexLayer]) {
			const partialLayerA = getFullLayerName(layersA.slice(0, indexLayer + 1));
			const partialLayerB = getFullLayerName(layersB.slice(0, indexLayer + 1));
			const orderA = effectiveMap.get(partialLayerA);
			const orderB = effectiveMap.get(partialLayerB);
			if (orderA !== undefined && orderB !== undefined) {
				return orderA - orderB;
			}
			if (orderA !== undefined) {
				return -1;
			}
			if (orderB !== undefined) {
				return 1;
			}
			return 0;
		}
	}
	return layersA.length - layersB.length;
}

function removeStylesheetEmptyRules(cssRules, docContext) {
	const removedRules = new Set();
	for (let cssRule = cssRules.head; cssRule; cssRule = cssRule.next) {
		const ruleData = cssRule.data;
		if (ruleData.type === RULE_TYPE) {
			if (hasChildNodes(ruleData.block)) {
				removeStylesheetEmptyRules(ruleData.block.children, docContext);
			} else {
				docContext.stats.discarded++;
				removedRules.add(cssRule);
			}
		} else if (ruleData.type === AT_RULE_TYPE && ruleData.block && ruleData.name !== FONT_FACE_NAME && ruleData.name !== KEYFRAMES_NAME) {
			removeStylesheetEmptyRules(ruleData.block.children, docContext);
			if (!hasChildNodes(ruleData.block)) {
				docContext.stats.discarded++;
				removedRules.add(cssRule);
			}
		}
	}
	removedRules.forEach(cssRule => cssRules.remove(cssRule));
}

function removeUnmatchedSelectors(ruleData, removedSelectors, removedRules, cssRule, docContext) {
	if (removedSelectors && removedSelectors.length) {
		removedSelectors.forEach(selector => ruleData.prelude.children.remove(selector));
	}
	if (!hasChildNodes(ruleData.prelude)) {
		docContext.stats.discarded++;
		removedRules.add(cssRule);
		return true;
	}
	return false;
}

function removeLosingDeclarations(winningDeclarations, docContext) {
	const allDeclarations = new Map();
	const protectedDeclarations = new Set();
	docContext.matchedElements.forEach(element => {
		const matchingSelectors = docContext.matchingSelectors.get(element);
		if (matchingSelectors) {
			matchingSelectors.forEach(selector => {
				const cssRule = docContext.selectorData.get(selector).rule;
				if (hasChildNodes(cssRule.block)) {
					const declarations = cssRule.block.children;
					for (let declaration = declarations.head; declaration; declaration = declaration.next) {
						if (declaration.data.type === DECLARATION_TYPE) {
							allDeclarations.set(declaration, declarations);
							const { property, value } = declaration.data;
							if (property && property.startsWith(CUSTOM_PROPERTY_PREFIX) || (value && value.type === RAW_TYPE)) {
								protectedDeclarations.add(declaration);
							}
						}
					}
				}
			});
		}
	});
	allDeclarations.forEach((list, node) => {
		if (!winningDeclarations.has(node) && !protectedDeclarations.has(node)) {
			list.remove(node);
		}
	});
}

function expandRawCssRules(ruleData) {
	const ruleChildren = [];
	if (hasChildNodes(ruleData.block)) {
		for (let cssRuleNode = ruleData.block.children.head; cssRuleNode; cssRuleNode = cssRuleNode.next) {
			if (cssRuleNode.data.type === RAW_TYPE) {
				if (cssRuleNode.data.value.indexOf(BLOCK_OPEN) !== -1 &&
					cssRuleNode.data.value.indexOf(BLOCK_OPEN) < cssRuleNode.data.value.indexOf(BLOCK_CLOSE)) {
					try {
						const stylesheet = parseCss(cssRuleNode.data.value, STYLESHEET_CONTEXT);
						for (let stylesheetChild = stylesheet.children.head; stylesheetChild; stylesheetChild = stylesheetChild.next) {
							ruleChildren.push(stylesheetChild);
						}
					} catch (error) {
						if (DEBUG) {
							// eslint-disable-next-line no-console
							console.warn(PARSE_CSS_ERROR_MESSAGE, cssRuleNode.data.value, error);
						}
					}
				} else {
					ruleChildren.push(cssRuleNode);
				}
			} else {
				ruleChildren.push(cssRuleNode);
			}
		}
	}
	ruleData.block.children.clear();
	ruleChildren.forEach(ruleChild => ruleData.block.children.appendData(ruleChild.data));
}

function combineSelectorWithAncestors(selector, ancestorsSelectors, docContext) {
	const selectorText = getSelectorText(selector, docContext);
	if (!ancestorsSelectors || !ancestorsSelectors.length) {
		return selectorText;
	} else {
		let contexts = [EMPTY_STRING];
		ancestorsSelectors.forEach(selectorList => {
			if (hasChildNodes(selectorList)) {
				const parentSelectors = selectorList.children.toArray();
				const nextContexts = [];
				contexts.forEach(context => parentSelectors.forEach(parentSelector => {
					const parentText = getSelectorText(parentSelector, docContext);
					const combined = context ? combineSelectors(context, parentText) : parentText;
					if (!nextContexts.includes(combined)) {
						nextContexts.push(combined);
					}
				}));
				if (nextContexts.length) {
					contexts = nextContexts;
				}
			}
		});
		const expandedSelectors = new Set();
		contexts.forEach(context => {
			const result = context ? combineSelectors(context, selectorText) : selectorText;
			expandedSelectors.add(result);
		});
		return Array.from(expandedSelectors).join(PRELUDE_SEPARATOR);
	}
}

function combineSelectors(parentSelectorText, childSelectorText) {
	const childSelector = parseCss(childSelectorText || NESTING_SELECTOR);
	const parentSelector = parentSelectorText ? parseCss(parentSelectorText) : null;
	let hasNesting = false;
	cssTree.walk(childSelector, {
		visit: NESTING_SELECTOR_TYPE,
		enter(_node, item, list) {
			hasNesting = true;
			if (!parentSelector) {
				list.remove(item);
				return;
			}
			const nodes = parentSelector.children.toArray().map(parent => cssTree.clone(parent));
			nodes.forEach(node => list.insertData(node, item));
			list.remove(item);
		}
	});
	if (hasNesting) {
		return cssTree.generate(childSelector);
	}
	if (!parentSelector) {
		return cssTree.generate(childSelector);
	}
	const combinedSelector = parseCss(`${parentSelectorText} ${childSelectorText}`);
	return cssTree.generate(combinedSelector);
}

function computeEffectiveSpecificity(selectorData, element, docContext) {
	const baseSpecificity = selectorData.specificity;
	let effectiveSpecificity = { a: baseSpecificity.a, b: baseSpecificity.b, c: baseSpecificity.c };
	const includeLists = selectorData && selectorData.scopeIncludeLists && selectorData.scopeIncludeLists.length ? selectorData.scopeIncludeLists[selectorData.scopeIncludeLists.length - 1] : [];
	if (includeLists && includeLists.length) {
		for (const includeSelector of includeLists) {
			const roots = getScopeRoots(includeSelector, docContext);
			if (roots.some(root => root.contains(element))) {
				const includeSpecificity = getIncludeSpecificity(includeSelector, docContext);
				effectiveSpecificity = {
					a: effectiveSpecificity.a + includeSpecificity.a,
					b: effectiveSpecificity.b + includeSpecificity.b,
					c: effectiveSpecificity.c + includeSpecificity.c
				};
			}
		}
	}
	return effectiveSpecificity;
}

function getIncludeSpecificity(includeSelector, docContext) {
	let specificity = docContext.scopeSpecificities.get(includeSelector);
	if (!specificity) {
		const selector = parseCss(includeSelector);
		specificity = computeMaxSpecificity(selector, []);
		docContext.scopeSpecificities.set(includeSelector, specificity);
	}
	return specificity;
}

function hasChildNodes(node) {
	return Boolean(node && node.children && node.children.head);
}

function getSelectorText(selector, docContext) {
	if (!docContext.selectorTexts.has(selector)) {
		docContext.selectorTexts.set(selector, cssTree.generate(selector));
	}
	return docContext.selectorTexts.get(selector);
}

function getPreludeText(prelude, docContext) {
	if (prelude) {
		if (!docContext.preludeTexts.has(prelude)) {
			docContext.preludeTexts.set(prelude, cssTree.generate(prelude));
		}
		return docContext.preludeTexts.get(prelude);
	} else {
		return EMPTY_STRING;
	}
}

function getFullLayerName(layers) {
	return layers.map(layerName => layerName === EMPTY_STRING ? ANONYMOUS_LAYER_PLACEHOLDER : layerName).join(LAYER_NAME_SEPARATOR);
}

function parseCss(text, context = SELECTOR_CONTEXT) {
	const options = { context };
	return cssTree.parse(text, options);
}

function querySelectorAll(root, selector, cache) {
	if (cache && cache !== root) {
		let rootCache = cache.get(root);
		if (!rootCache) {
			rootCache = new Map();
			cache.set(root, rootCache);
		}
		if (rootCache.has(selector)) {
			return rootCache.get(selector);
		} else {
			try {
				const nodes = Array.from(root.querySelectorAll(selector));
				rootCache.set(selector, nodes);
				return nodes;
			} catch {
				if (DEBUG) {
					// eslint-disable-next-line no-console
					console.warn(QSA_ERROR_MESSAGE, selector, root.tagName ? root.tagName : EMPTY_STRING);
				}
				rootCache.set(selector, []);
				return [];
			}
		}
	} else {
		try {
			return Array.from(root.querySelectorAll(selector));
		} catch {
			if (DEBUG) {
				// eslint-disable-next-line no-console
				console.warn(QSA_ERROR_MESSAGE, selector);
			}
			return [];
		}
	}
}

function getInlineStyleDeclarations(element) {
	const style = element.getAttribute(STYLE_ATTRIBUTE_NAME);
	if (style) {
		let declarationNodes;
		try {
			declarationNodes = cssTree.parse(style, { context: DECLARATION_LIST_CONTEXT });
		} catch {
			return [];
		}
		const declarations = [];
		for (let node = declarationNodes.children && declarationNodes.children.head; node; node = node.next) {
			if (node.data.type === DECLARATION_TYPE) {
				declarations.push({
					declaration: node,
					effectiveSpecificity: { a: 1, b: 0, c: 0 },
					isInline: true
				});
			}
		}
		return declarations;
	} else {
		return [];
	}
}