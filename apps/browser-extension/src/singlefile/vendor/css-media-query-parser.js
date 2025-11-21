/*
 * The MIT License (MIT)
 * 
 * Author: Gildas Lormeau
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// derived from https://github.com/dryoma/postcss-media-query-parser

/*
 * The MIT License (MIT)
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
*/

/**
 * Parses a media feature expression, e.g. `max-width: 10px`, `(color)`
 *
 * @param {string} string - the source expression string, can be inside parens
 * @param {Number} index - the index of `string` in the overall input
 *
 * @return {Array} an array of Nodes, the first element being a media feature,
 *    the second - its value (may be missing)
 */

function parseMediaFeature(string, index = 0) {
	const modesEntered = [{
		mode: "normal",
		character: null,
	}];
	const result = [];
	let lastModeIndex = 0, mediaFeature = "", colon = null, mediaFeatureValue = null, indexLocal = index;

	let stringNormalized = string;
	// Strip trailing parens (if any), and correct the starting index
	if (string[0] === "(" && string[string.length - 1] === ")") {
		stringNormalized = string.substring(1, string.length - 1);
		indexLocal++;
	}

	for (let i = 0; i < stringNormalized.length; i++) {
		const character = stringNormalized[i];

		// If entering/exiting a string
		if (character === "'" || character === "\"") {
			if (modesEntered[lastModeIndex].isCalculationEnabled === true) {
				modesEntered.push({
					mode: "string",
					isCalculationEnabled: false,
					character,
				});
				lastModeIndex++;
			} else if (modesEntered[lastModeIndex].mode === "string" &&
				modesEntered[lastModeIndex].character === character &&
				stringNormalized[i - 1] !== "\\"
			) {
				modesEntered.pop();
				lastModeIndex--;
			}
		}

		// If entering/exiting interpolation
		if (character === "{") {
			modesEntered.push({
				mode: "interpolation",
				isCalculationEnabled: true,
			});
			lastModeIndex++;
		} else if (character === "}") {
			modesEntered.pop();
			lastModeIndex--;
		}

		// If a : is met outside of a string, function call or interpolation, than
		// this : separates a media feature and a value
		if (modesEntered[lastModeIndex].mode === "normal" && character === ":") {
			const mediaFeatureValueStr = stringNormalized.substring(i + 1);
			mediaFeatureValue = {
				type: "value",
				before: /^(\s*)/.exec(mediaFeatureValueStr)[1],
				after: /(\s*)$/.exec(mediaFeatureValueStr)[1],
				value: mediaFeatureValueStr.trim(),
			};
			// +1 for the colon
			mediaFeatureValue.sourceIndex =
				mediaFeatureValue.before.length + i + 1 + indexLocal;
			colon = {
				type: "colon",
				sourceIndex: i + indexLocal,
				after: mediaFeatureValue.before,
				value: ":", // for consistency only
			};
			break;
		}

		mediaFeature += character;
	}

	// Forming a media feature node
	mediaFeature = {
		type: "media-feature",
		before: /^(\s*)/.exec(mediaFeature)[1],
		after: /(\s*)$/.exec(mediaFeature)[1],
		value: mediaFeature.trim(),
	};
	mediaFeature.sourceIndex = mediaFeature.before.length + indexLocal;
	result.push(mediaFeature);

	if (colon !== null) {
		colon.before = mediaFeature.after;
		result.push(colon);
	}

	if (mediaFeatureValue !== null) {
		result.push(mediaFeatureValue);
	}

	return result;
}

/**
 * Parses a media query, e.g. `screen and (color)`, `only tv`
 *
 * @param {string} string - the source media query string
 * @param {Number} index - the index of `string` in the overall input
 *
 * @return {Array} an array of Nodes and Containers
 */

function parseMediaQuery(string, index = 0) {
	const result = [];

	// How many times the parser entered parens/curly braces
	let localLevel = 0;
	// Has any keyword, media type, media feature expression or interpolation
	// ('element' hereafter) started
	let insideSomeValue = false, node;

	function resetNode() {
		return {
			before: "",
			after: "",
			value: "",
		};
	}

	node = resetNode();

	for (let i = 0; i < string.length; i++) {
		const character = string[i];
		// If not yet entered any element
		if (!insideSomeValue) {
			if (character.search(/\s/) !== -1) {
				// A whitespace
				// Don't form 'after' yet; will do it later
				node.before += character;
			} else {
				// Not a whitespace - entering an element
				// Expression start
				if (character === "(") {
					node.type = "media-feature-expression";
					localLevel++;
				}
				node.value = character;
				node.sourceIndex = index + i;
				insideSomeValue = true;
			}
		} else {
			// Already in the middle of some element
			node.value += character;

			// Here parens just increase localLevel and don't trigger a start of
			// a media feature expression (since they can't be nested)
			// Interpolation start
			if (character === "{" || character === "(") { localLevel++; }
			// Interpolation/function call/media feature expression end
			if (character === ")" || character === "}") { localLevel--; }
		}

		// If exited all parens/curlies and the next symbol
		if (insideSomeValue && localLevel === 0 &&
			(character === ")" || i === string.length - 1 ||
				string[i + 1].search(/\s/) !== -1)
		) {
			if (["not", "only", "and"].indexOf(node.value) !== -1) {
				node.type = "keyword";
			}
			// if it's an expression, parse its contents
			if (node.type === "media-feature-expression") {
				node.nodes = parseMediaFeature(node.value, node.sourceIndex);
			}
			result.push(Array.isArray(node.nodes) ?
				new Container(node) : new Node(node));
			node = resetNode();
			insideSomeValue = false;
		}
	}

	// Now process the result array - to specify undefined types of the nodes
	// and specify the `after` prop
	for (let i = 0; i < result.length; i++) {
		node = result[i];
		if (i > 0) { result[i - 1].after = node.before; }

		// Node types. Might not be set because contains interpolation/function
		// calls or fully consists of them
		if (node.type === undefined) {
			if (i > 0) {
				// only `and` can follow an expression
				if (result[i - 1].type === "media-feature-expression") {
					node.type = "keyword";
					continue;
				}
				// Anything after 'only|not' is a media type
				if (result[i - 1].value === "not" || result[i - 1].value === "only") {
					node.type = "media-type";
					continue;
				}
				// Anything after 'and' is an expression
				if (result[i - 1].value === "and") {
					node.type = "media-feature-expression";
					continue;
				}

				if (result[i - 1].type === "media-type") {
					// if it is the last element - it might be an expression
					// or 'and' depending on what is after it
					if (!result[i + 1]) {
						node.type = "media-feature-expression";
					} else {
						node.type = result[i + 1].type === "media-feature-expression" ?
							"keyword" : "media-feature-expression";
					}
				}
			}

			if (i === 0) {
				// `screen`, `fn( ... )`, `#{ ... }`. Not an expression, since then
				// its type would have been set by now
				if (!result[i + 1]) {
					node.type = "media-type";
					continue;
				}

				// `screen and` or `#{...} (max-width: 10px)`
				if (result[i + 1] &&
					(result[i + 1].type === "media-feature-expression" ||
						result[i + 1].type === "keyword")
				) {
					node.type = "media-type";
					continue;
				}
				if (result[i + 2]) {
					// `screen and (color) ...`
					if (result[i + 2].type === "media-feature-expression") {
						node.type = "media-type";
						result[i + 1].type = "keyword";
						continue;
					}
					// `only screen and ...`
					if (result[i + 2].type === "keyword") {
						node.type = "keyword";
						result[i + 1].type = "media-type";
						continue;
					}
				}
				if (result[i + 3]) {
					// `screen and (color) ...`
					if (result[i + 3].type === "media-feature-expression") {
						node.type = "keyword";
						result[i + 1].type = "media-type";
						result[i + 2].type = "keyword";
						continue;
					}
				}
			}
		}
	}
	return result;
}

/**
 * Parses a media query list. Takes a possible `url()` at the start into
 * account, and divides the list into media queries that are parsed separately
 *
 * @param {string} string - the source media query list string
 *
 * @return {Array} an array of Nodes/Containers
 */

function parseMediaList(string) {
	const result = [];
	let interimIndex = 0, levelLocal = 0;

	// Check for a `url(...)` part (if it is contents of an @import rule)
	const doesHaveUrl = /^(\s*)url\s*\(/.exec(string);
	if (doesHaveUrl !== null) {
		let i = doesHaveUrl[0].length;
		let parenthesesLv = 1;
		while (parenthesesLv > 0) {
			const character = string[i];
			if (character === "(") { parenthesesLv++; }
			if (character === ")") { parenthesesLv--; }
			i++;
		}
		result.unshift(new Node({
			type: "url",
			value: string.substring(0, i).trim(),
			sourceIndex: doesHaveUrl[1].length,
			before: doesHaveUrl[1],
			after: /^(\s*)/.exec(string.substring(i))[1],
		}));
		interimIndex = i;
	}

	// Start processing the media query list
	for (let i = interimIndex; i < string.length; i++) {
		const character = string[i];

		// Dividing the media query list into comma-separated media queries
		// Only count commas that are outside of any parens
		// (i.e., not part of function call params list, etc.)
		if (character === "(") { levelLocal++; }
		if (character === ")") { levelLocal--; }
		if (levelLocal === 0 && character === ",") {
			const mediaQueryString = string.substring(interimIndex, i);
			const spaceBefore = /^(\s*)/.exec(mediaQueryString)[1];
			result.push(new Container({
				type: "media-query",
				value: mediaQueryString.trim(),
				sourceIndex: interimIndex + spaceBefore.length,
				nodes: parseMediaQuery(mediaQueryString, interimIndex),
				before: spaceBefore,
				after: /(\s*)$/.exec(mediaQueryString)[1],
			}));
			interimIndex = i + 1;
		}
	}

	const mediaQueryString = string.substring(interimIndex);
	const spaceBefore = /^(\s*)/.exec(mediaQueryString)[1];
	result.push(new Container({
		type: "media-query",
		value: mediaQueryString.trim(),
		sourceIndex: interimIndex + spaceBefore.length,
		nodes: parseMediaQuery(mediaQueryString, interimIndex),
		before: spaceBefore,
		after: /(\s*)$/.exec(mediaQueryString)[1],
	}));

	return result;
}

function Container(opts) {
	this.constructor(opts);

	this.nodes = opts.nodes;

	if (this.after === undefined) {
		this.after = this.nodes.length > 0 ?
			this.nodes[this.nodes.length - 1].after : "";
	}

	if (this.before === undefined) {
		this.before = this.nodes.length > 0 ?
			this.nodes[0].before : "";
	}

	if (this.sourceIndex === undefined) {
		this.sourceIndex = this.before.length;
	}

	this.nodes.forEach(node => {
		node.parent = this;
	});
}

Container.prototype = Object.create(Node.prototype);
Container.constructor = Node;

/**
 * Iterate over descendant nodes of the node
 *
 * @param {RegExp|string} filter - Optional. Only nodes with node.type that
 *    satisfies the filter will be traversed over
 * @param {function} cb - callback to call on each node. Takes these params:
 *    node - the node being processed, i - it's index, nodes - the array
 *    of all nodes
 *    If false is returned, the iteration breaks
 *
 * @return (boolean) false, if the iteration was broken
 */
Container.prototype.walk = function walk(filter, cb) {
	const hasFilter = typeof filter === "string" || filter instanceof RegExp;
	const callback = hasFilter ? cb : filter;
	const filterReg = typeof filter === "string" ? new RegExp(filter) : filter;

	for (let i = 0; i < this.nodes.length; i++) {
		const node = this.nodes[i];
		const filtered = hasFilter ? filterReg.test(node.type) : true;
		if (filtered && callback && callback(node, i, this.nodes) === false) {
			return false;
		}
		if (node.nodes && node.walk(filter, cb) === false) { return false; }
	}
	return true;
};

/**
 * Iterate over immediate children of the node
 *
 * @param {function} cb - callback to call on each node. Takes these params:
 *    node - the node being processed, i - it's index, nodes - the array
 *    of all nodes
 *    If false is returned, the iteration breaks
 *
 * @return (boolean) false, if the iteration was broken
 */
Container.prototype.each = function each(cb = () => { }) {
	for (let i = 0; i < this.nodes.length; i++) {
		const node = this.nodes[i];
		if (cb(node, i, this.nodes) === false) { return false; }
	}
	return true;
};

/**
 * A very generic node. Pretty much any element of a media query
 */

function Node(opts) {
	this.after = opts.after;
	this.before = opts.before;
	this.type = opts.type;
	this.value = opts.value;
	this.sourceIndex = opts.sourceIndex;
}

export {
	parseMediaList
};