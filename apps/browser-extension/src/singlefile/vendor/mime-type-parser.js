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

// derived from https://github.com/jsdom/whatwg-mimetype

/* 
 * Copyright © 2017–2018 Domenic Denicola <d@domenic.me>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:

 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.

 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

let utils, parser, serializer, MIMEType;

// lib/utils.js
{
	utils = {};
	utils.removeLeadingAndTrailingHTTPWhitespace = string => {
		return string.replace(/^[ \t\n\r]+/, "").replace(/[ \t\n\r]+$/, "");
	};

	utils.removeTrailingHTTPWhitespace = string => {
		return string.replace(/[ \t\n\r]+$/, "");
	};

	utils.isHTTPWhitespaceChar = char => {
		return char === " " || char === "\t" || char === "\n" || char === "\r";
	};

	utils.solelyContainsHTTPTokenCodePoints = string => {
		return /^[-!#$%&'*+.^_`|~A-Za-z0-9]*$/.test(string);
	};

	utils.soleyContainsHTTPQuotedStringTokenCodePoints = string => {
		return /^[\t\u0020-\u007E\u0080-\u00FF]*$/.test(string);
	};

	utils.asciiLowercase = string => {
		return string.replace(/[A-Z]/g, l => l.toLowerCase());
	};

	// This variant only implements it with the extract-value flag set.
	utils.collectAnHTTPQuotedString = (input, position) => {
		let value = "";

		position++;

		while (true) {
			while (position < input.length && input[position] !== "\"" && input[position] !== "\\") {
				value += input[position];
				++position;
			}

			if (position >= input.length) {
				break;
			}

			const quoteOrBackslash = input[position];
			++position;

			if (quoteOrBackslash === "\\") {
				if (position >= input.length) {
					value += "\\";
					break;
				}

				value += input[position];
				++position;
			} else {
				break;
			}
		}

		return [value, position];
	};
}

// lib/serializer.js
{
	const { solelyContainsHTTPTokenCodePoints } = utils;
	serializer = mimeType => {
		let serialization = `${mimeType.type}/${mimeType.subtype}`;

		if (mimeType.parameters.size === 0) {
			return serialization;
		}

		for (let [name, value] of mimeType.parameters) {
			serialization += ";";
			serialization += name;
			serialization += "=";

			if (!solelyContainsHTTPTokenCodePoints(value) || value.length === 0) {
				value = value.replace(/(["\\])/g, "\\$1");
				value = `"${value}"`;
			}

			serialization += value;
		}

		return serialization;
	};
}

// lib/parser.js
{
	const {
		removeLeadingAndTrailingHTTPWhitespace,
		removeTrailingHTTPWhitespace,
		isHTTPWhitespaceChar,
		solelyContainsHTTPTokenCodePoints,
		soleyContainsHTTPQuotedStringTokenCodePoints,
		asciiLowercase,
		collectAnHTTPQuotedString
	} = utils;

	parser = input => {
		input = removeLeadingAndTrailingHTTPWhitespace(input);

		let position = 0;
		let type = "";
		while (position < input.length && input[position] !== "/") {
			type += input[position];
			++position;
		}

		if (type.length === 0 || !solelyContainsHTTPTokenCodePoints(type)) {
			return null;
		}

		if (position >= input.length) {
			return null;
		}

		// Skips past "/"
		++position;

		let subtype = "";
		while (position < input.length && input[position] !== ";") {
			subtype += input[position];
			++position;
		}

		subtype = removeTrailingHTTPWhitespace(subtype);

		if (subtype.length === 0 || !solelyContainsHTTPTokenCodePoints(subtype)) {
			return null;
		}

		const mimeType = {
			type: asciiLowercase(type),
			subtype: asciiLowercase(subtype),
			parameters: new Map()
		};

		while (position < input.length) {
			// Skip past ";"
			++position;

			while (isHTTPWhitespaceChar(input[position])) {
				++position;
			}

			let parameterName = "";
			while (position < input.length && input[position] !== ";" && input[position] !== "=") {
				parameterName += input[position];
				++position;
			}
			parameterName = asciiLowercase(parameterName);

			if (position < input.length) {
				if (input[position] === ";") {
					continue;
				}

				// Skip past "="
				++position;
			}

			let parameterValue = null;
			if (input[position] === "\"") {
				[parameterValue, position] = collectAnHTTPQuotedString(input, position);

				while (position < input.length && input[position] !== ";") {
					++position;
				}
			} else {
				parameterValue = "";
				while (position < input.length && input[position] !== ";") {
					parameterValue += input[position];
					++position;
				}

				parameterValue = removeTrailingHTTPWhitespace(parameterValue);

				if (parameterValue === "") {
					continue;
				}
			}

			if (parameterName.length > 0 &&
				solelyContainsHTTPTokenCodePoints(parameterName) &&
				soleyContainsHTTPQuotedStringTokenCodePoints(parameterValue) &&
				!mimeType.parameters.has(parameterName)) {
				mimeType.parameters.set(parameterName, parameterValue);
			}
		}

		return mimeType;
	};
}

// lib/mime-type.js
{
	const parse = parser;
	const serialize = serializer;
	const {
		asciiLowercase,
		solelyContainsHTTPTokenCodePoints,
		soleyContainsHTTPQuotedStringTokenCodePoints
	} = utils;

	MIMEType = class MIMEType {
		constructor(string) {
			string = String(string);
			const result = parse(string);
			if (result === null) {
				throw new Error(`Could not parse MIME type string "${string}"`);
			}

			this._type = result.type;
			this._subtype = result.subtype;
			this._parameters = new MIMETypeParameters(result.parameters);
		}

		static parse(string) {
			try {
				return new this(string);
				// eslint-disable-next-line no-unused-vars
			} catch (error) {
				return null;
			}
		}

		get essence() {
			return `${this.type}/${this.subtype}`;
		}

		get type() {
			return this._type;
		}

		set type(value) {
			value = asciiLowercase(String(value));

			if (value.length === 0) {
				throw new Error("Invalid type: must be a non-empty string");
			}
			if (!solelyContainsHTTPTokenCodePoints(value)) {
				throw new Error(`Invalid type ${value}: must contain only HTTP token code points`);
			}

			this._type = value;
		}

		get subtype() {
			return this._subtype;
		}

		set subtype(value) {
			value = asciiLowercase(String(value));

			if (value.length === 0) {
				throw new Error("Invalid subtype: must be a non-empty string");
			}
			if (!solelyContainsHTTPTokenCodePoints(value)) {
				throw new Error(`Invalid subtype ${value}: must contain only HTTP token code points`);
			}

			this._subtype = value;
		}

		get parameters() {
			return this._parameters;
		}

		toString() {
			// The serialize function works on both "MIME type records" (i.e. the results of parse) and on this class, since
			// this class's interface is identical.
			return serialize(this);
		}

		isJavaScript({ allowParameters = false } = {}) {
			switch (this._type) {
				case "text": {
					switch (this._subtype) {
						case "ecmascript":
						case "javascript":
						case "javascript1.0":
						case "javascript1.1":
						case "javascript1.2":
						case "javascript1.3":
						case "javascript1.4":
						case "javascript1.5":
						case "jscript":
						case "livescript":
						case "x-ecmascript":
						case "x-javascript": {
							return allowParameters || this._parameters.size === 0;
						}
						default: {
							return false;
						}
					}
				}
				case "application": {
					switch (this._subtype) {
						case "ecmascript":
						case "javascript":
						case "x-ecmascript":
						case "x-javascript": {
							return allowParameters || this._parameters.size === 0;
						}
						default: {
							return false;
						}
					}
				}
				default: {
					return false;
				}
			}
		}
		isXML() {
			return (this._subtype === "xml" && (this._type === "text" || this._type === "application")) ||
				this._subtype.endsWith("+xml");
		}
		isHTML() {
			return this._subtype === "html" && this._type === "text";
		}
	};

	class MIMETypeParameters {
		constructor(map) {
			this._map = map;
		}

		get size() {
			return this._map.size;
		}

		get(name) {
			name = asciiLowercase(String(name));
			return this._map.get(name);
		}

		has(name) {
			name = asciiLowercase(String(name));
			return this._map.has(name);
		}

		set(name, value) {
			name = asciiLowercase(String(name));
			value = String(value);

			if (!solelyContainsHTTPTokenCodePoints(name)) {
				throw new Error(`Invalid MIME type parameter name "${name}": only HTTP token code points are valid.`);
			}
			if (!soleyContainsHTTPQuotedStringTokenCodePoints(value)) {
				throw new Error(`Invalid MIME type parameter value "${value}": only HTTP quoted-string token code points are valid.`);
			}

			return this._map.set(name, value);
		}

		clear() {
			this._map.clear();
		}

		delete(name) {
			name = asciiLowercase(String(name));
			return this._map.delete(name);
		}

		forEach(callbackFn, thisArg) {
			this._map.forEach(callbackFn, thisArg);
		}

		keys() {
			return this._map.keys();
		}

		values() {
			return this._map.values();
		}

		entries() {
			return this._map.entries();
		}

		[Symbol.iterator]() {
			return this._map[Symbol.iterator]();
		}
	}

}

export {
	MIMEType
};
