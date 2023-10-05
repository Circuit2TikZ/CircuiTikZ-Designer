/**
 * Fixer for urls within an inline svg.
 *
 * If the text "url([filename]#[anyID])" is found, the filename is added as a dependency and replaced by the dist
 * filename.
 *
 * @file
 * @module inlineSVG
 */

import { Transformer } from "@parcel/plugin";

export default new Transformer({
	async transform({ asset }) {
		let code = await asset.getCode();
		/**
		 * Each entry in the array is a html code segment which is either any non svg code or a svg picture (from "<svg"
		 * to "</svg>").
		 *
		 * @type {string[]}
		 */
		const splitCode = code
			.split(/(?=<svg)/)
			.map((a) => a.split(/(?<=<\/svg>)/))
			.flat(1);

		asset.setCode(
			splitCode
				.map((/** @type {string} */ fragment) => {
					// Not a svg segment? --> no need to process
					if (!(fragment.startsWith("<svg") && fragment.endsWith("</svg>"))) return fragment;

					fragment.matchAll(/url\((?<filename>[\w \/\-.]+)#[\w\-.]+\)/g);
					fragment.substring(2).match(/(?<=url\()[\w \/\-.]+(?=#)/);

					/** @type {RegExp} */
					const URL_FILENAME_REGEX = /(?<=url\()[\w \/\-.]+(?=#)/;

					let processed = "";
					for (let match; (match = fragment.match(URL_FILENAME_REGEX)); ) {
						// Content before filename; "[...]url("
						processed += fragment.substring(0, match.index);

						const resolved = asset.addDependency({
							specifier: match[0], // oriFileName
							specifierType: "url",
							// needsStableName: true,
							isOptional: false,
						});

						processed += resolved; // <-- the resolved filename

						// shorten fragment --> used for next match ; starts with "#[id])[...]"
						fragment = fragment.substring(match.index + match[0].length);
					}
					processed += fragment; // add rest; no "url(...)" in here
					return processed;
				})
				.join("")
		);

		return [asset];
	},
});
