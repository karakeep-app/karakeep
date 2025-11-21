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

const CANONICAL_PSEUDO_ELEMENT_NAMES = new Set(["after", "before", "first-letter", "first-line", "placeholder", "selection", "part", "marker"]);

export {
  parsePrelude
};

function parsePrelude(prelude) {
  if (!prelude) {
    return { include: [], exclude: [] };
  }

  // Normalize prelude to a string then split on a top-level `to` keyword.
  // Using generated string is pragmatic: `to` as an at-rule keyword is expected
  // to appear at top-level with surrounding whitespace. We split on whitespace+to+whitespace.
  const preludeText = cssTree.generate(prelude).trim();
  if (!preludeText) return { include: [], exclude: [] };

  // Split on top-level ' to ' (case-insensitive) — join remaining parts if multiple 'to' appear
  const parts = preludeText.split(/\s+to\s+/i);
  const includeText = parts[0].trim();
  const excludeText = parts.length > 1 ? parts.slice(1).join(" to ").trim() : "";

  function parseSelectorList(text) {
    if (!text) return [];
    // Strip balanced outer parentheses that css-tree may produce in generated preludes
    function stripOuterParens(s) {
      let str = s.trim();
      while (str.length >= 2 && str[0] === "(" && str[str.length - 1] === ")") {
        // ensure they are balanced pairs for the whole string
        let depth = 0;
        let balanced = true;
        for (let i = 0; i < str.length; i++) {
          if (str[i] === "(") depth++;
          else if (str[i] === ")") depth--;
          if (depth === 0 && i < str.length - 1) { balanced = false; break; }
        }
        if (!balanced) break;
        str = str.substring(1, str.length - 1).trim();
      }
      return str;
    }

    const cleaned = stripOuterParens(text);
    // css-tree expects a selectorList context
    const ast = cssTree.parse(cleaned, { context: "selectorList" });
    const selectors = [];
    if (ast && ast.children) {
      for (let node = ast.children.head; node; node = node.next) {
        const sel = node.data;
        selectors.push({ ast: sel, text: cssTree.generate(sel) });
      }
    }
    return selectors;
  }

  const include = parseSelectorList(includeText);
  const exclude = parseSelectorList(excludeText);

  // Validate: pseudo-elements are not allowed in scope start/end selectors
  function containsPseudoElement(selectorAst) {
    let found = false;
    cssTree.walk(selectorAst, {
      visit: "PseudoElementSelector",
      enter() { found = true; }
    });
    if (!found) {
      // also check for pseudo-class names that are treated as pseudo-elements by some authors
      cssTree.walk(selectorAst, {
        visit: "PseudoClassSelector",
        enter(node) {
          const name = (node.name || "").toLowerCase();
          // keep this conservative: disallow known pseudo-element names if used as pseudo-class
          if (CANONICAL_PSEUDO_ELEMENT_NAMES.has(name)) {
            found = true;
          }
        }
      });
    }
    return found;
  }

  for (const s of include) {
    if (containsPseudoElement(s.ast)) {
      throw new Error("Pseudo-elements are not allowed in @scope prelude (scope-start)");
    }
  }
  for (const s of exclude) {
    if (containsPseudoElement(s.ast)) {
      throw new Error("Pseudo-elements are not allowed in @scope prelude (scope-end)");
    }
  }

  return { include, exclude };
}
