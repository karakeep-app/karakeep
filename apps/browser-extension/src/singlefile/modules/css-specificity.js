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

export {
    computeSpecificity,
    computeMaxSpecificity
};

function computeSpecificity(selector, specificity = { a: 0, b: 0, c: 0 }) {
    if (!selector || !selector.type) {
        return specificity;
    }
    switch (selector.type) {
        case "Selector":
            traverseChildren(selector.children, (child) => computeSpecificity(child, specificity));
            break;

        case "IdSelector":
            specificity.a++;
            break;

        case "ClassSelector":
            specificity.b++;
            break;

        case "AttributeSelector":
            specificity.b++;
            break;

        case "TypeSelector":
            if (selector.name !== "*") {
                specificity.c++;
            }
            break;

        case "PseudoElementSelector":
            specificity.c++;
            break;

        case "PseudoClassSelector": {
            const pseudoName = selector.name.toLowerCase();

            if (pseudoName === "where") {
                // :where() has zero specificity - do nothing
                break;
            }

            if (pseudoName === "is" || pseudoName === "not" || pseudoName === "has") {
                // :is(), :not(), :has() - use the max specificity from their selector list
                traverseChildren(selector.children, (child) => {
                    if (child.type === "SelectorList") {
                        addMaxSpecificity(specificity, getMaxSpecificityFromList(child));
                    }
                });
                break;
            }

            if (pseudoName === "nth-child" || pseudoName === "nth-last-child") {
                // :nth-child() and :nth-last-child() count as one pseudo-class
                specificity.b++;

                // Plus the max specificity from their selector list (if any)
                traverseChildren(selector.children, (child) => {
                    if (child.type === "Nth" && child.selector) {
                        addMaxSpecificity(specificity, getMaxSpecificityFromList(child.selector));
                    }
                });
                break;
            }

            // Regular pseudo-classes contribute to 'b'
            // Exception: :scope is treated as a type selector (contributes to 'c')
            if (pseudoName === "scope") {
                specificity.c++;
            } else {
                specificity.b++;
            }
            break;
        }

        case "Combinator":
        case "Raw":
            break;
    }

    return specificity;
}

function addMaxSpecificity(specificity, maxSpec) {
    specificity.a += maxSpec.a;
    specificity.b += maxSpec.b;
    specificity.c += maxSpec.c;
}

function traverseChildren(children, callback) {
    if (!children) return;

    let current = children.head;
    while (current) {
        callback(current.data);
        current = current.next;
    }
}

function getMaxSpecificityFromList(selectorList) {
    let maxSpec = { a: 0, b: 0, c: 0 };

    traverseChildren(selectorList.children, (selector) => {
        const spec = computeSpecificity(selector, { a: 0, b: 0, c: 0 });
        if (spec.a > maxSpec.a ||
            (spec.a === maxSpec.a && spec.b > maxSpec.b) ||
            (spec.a === maxSpec.a && spec.b === maxSpec.b && spec.c > maxSpec.c)) {
            maxSpec = spec;
        }
    });

    return maxSpec;
}

function computeMaxSpecificity(selector, ancestorsSelectors) {
    // If no ancestors provided, keep existing behavior
    if (!ancestorsSelectors || !ancestorsSelectors.length) {
        let maxSpecificity = { a: 0, b: 0, c: 0 };
        const stack = [];
        cssTree.walk(selector, {
            enter(node) {
                stack.push(node);
                if (node.type === "Selector") {
                    const insideWhere = stack.some(n => n.type === "PseudoClassSelector" && n.name === "where");
                    if (insideWhere) return;
                    const specificity = computeSpecificity(node);
                    if (specificity.a > maxSpecificity.a ||
                        (specificity.a === maxSpecificity.a && specificity.b > maxSpecificity.b) ||
                        (specificity.a === maxSpecificity.a && specificity.b === maxSpecificity.b && specificity.c > maxSpecificity.c)) {
                        maxSpecificity = specificity;
                    }
                }
            },
            leave() {
                stack.pop();
            }
        });
        return maxSpecificity;
    }

    // When ancestors are provided, compute specificity for every expanded selector
    // Build context strings for ancestors (similar to combineWithAncestors behavior)
    const childText = cssTree.generate(selector);
    let contexts = [""];
    ancestorsSelectors.forEach(selectorList => {
        if (!selectorList || !selectorList.children || !selectorList.children.size) return;
        const parentSelectors = selectorList.children.toArray();
        const nextContexts = [];
        contexts.forEach(context => parentSelectors.forEach(parentSelector => {
            const parentText = cssTree.generate(parentSelector);
            const combined = context ? context + " " + parentText : parentText;
            if (!nextContexts.includes(combined)) nextContexts.push(combined);
        }));
        if (nextContexts.length) contexts = nextContexts;
    });

    function combineStrings(context, child) {
        if (!context) return child;
        if (!child) return context;
        if (child.indexOf("&") !== -1) return child.split("&").join(context);
        return context + " " + child;
    }

    let maxSpecificity = { a: 0, b: 0, c: 0 };
    const seen = new Set();
    contexts.forEach(context => {
        const full = combineStrings(context, childText);
        if (seen.has(full)) return;
        seen.add(full);
        try {
            const parsed = cssTree.parse(full, { context: "selectorList" });
            // reuse original logic to compute max specificity over parsed AST
            const spec = computeMaxSpecificity(parsed);
            if (spec.a > maxSpecificity.a ||
                (spec.a === maxSpecificity.a && spec.b > maxSpecificity.b) ||
                (spec.a === maxSpecificity.a && spec.b === maxSpecificity.b && spec.c > maxSpecificity.c)) {
                maxSpecificity = spec;
            }
        } catch {
            // ignore parse errors and continue
        }
    });
    return maxSpecificity;
}
