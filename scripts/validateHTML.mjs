#! /usr/bin/env node
import HtmlValidator from "html-validator";
import { readFileSync } from "node:fs";

/**
 * @typedef {object} htmlValidatorError
 * @property {string} ruleId
 * @property {string} ruleUrl
 * @property {number} severity
 * @property {string} message
 * @property {number} offset
 * @property {number} line
 * @property {number} column
 * @property {number} size
 * @property {string} selector
 * @property {string|object} context
 * @property {string} context.tagName
 * @property {string} context.pattern
 * @property {} context.blacklist
 */

/**
 * @callback htmlValidatorErrorFilter
 * @param {htmlValidatorError} error
 * @returns {boolean} `true`, if the error should be ignored
 */

/**
 * @typedef {object} htmlValidatorResult
 * @property {boolean} isValid
 * @property {number} errorCount
 * @property {number} warningCount
 * @property {htmlValidatorError[]} errors
 * @property {} warnings
 */

/**
 * Names/ruleIDs of errors to ignore
 * @type {string}
 */
const ignoreErrorRuleIDs = ["heading-level"];
/**
 * Custom filters for ignoring errors.
 * @type {htmlValidatorErrorFilter[]}
 */
const customErrorFilters = [
	(error) =>
		(error.ruleId === "no-unknown-elements" || error.ruleId === "element-name") &&
		error.selector?.endsWith("> include"),
];

(async () => {
	/** @type {HtmlValidator.OptionsForHtmlFileAsValidationTargetAndObjectAsResult} */
	const options = {
		// url: "http://localhost:1234/",
		data: readFileSync("dist/index.html", "utf8"),
		format: "json",
		validator: "WHATWG",
		isLocal: true,
	};

	try {
		/** @type {htmlValidatorResult} */
		let result = await HtmlValidator(options);
		if (result.errors && result.errors.length > 0) {
			result.errors = result.errors.filter(
				(error) =>
					!ignoreErrorRuleIDs.includes(error.ruleId) && // no entry in ignoreErrorRuleIDs
					!customErrorFilters.some((callback) => callback(error)) // no customErrorFilter returns true
			);
			result.errorCount = result.errors.length;
			result.isValid = result.isValid || result.errorCount === 0;
		}
		console.log(JSON.stringify(result, undefined, 4));
		process.exitCode = result.isValid ? 0 : -1;
	} catch (error) {
		console.error(error);
	}
})();
