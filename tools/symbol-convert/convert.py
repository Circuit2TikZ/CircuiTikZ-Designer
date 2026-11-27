"""
Generates src/data/symbols.svg from the components in nodes.jsonc and paths.jsonc. See README.md for the required tools.
"""

import os
import pathlib
import shutil
import sys

from errors import ConverterError
from toolchain import check_tools
from validation import check_components

CONVERTER_DIR = pathlib.Path(__file__).resolve().parent


def preflight():
	"""
	Checks everything which can be checked before the conversion, so that all problems are shown at once.
	"""
	problems, warnings = check_tools()
	problems.extend(check_components())
	for warning in warnings:
		print(f"Warning: {warning}")
	if problems:
		raise ConverterError("The conversion can't start:\n" + "\n".join(f"  - {problem}" for problem in problems))


def convert():
	preflight()

	# the steps skip files which already exist, so old ones would hide changes
	build_dir = CONVERTER_DIR / "build"
	if build_dir.exists():
		shutil.rmtree(build_dir)

	# imported after the checks, because they read the component files when they are imported
	from svg_functions import combine_SVGs_to_symbol, convert_DVI_to_SVGs
	from tex_functions import compile_tex_files, create_tex_files_from_json

	create_tex_files_from_json()
	compile_tex_files()
	convert_DVI_to_SVGs()
	combine_SVGs_to_symbol()


def main():
	# the converter uses paths relative to its folder
	os.chdir(CONVERTER_DIR)
	try:
		convert()
	except ConverterError as error:
		sys.exit(f"\nError: {error}")


if __name__ == "__main__":
	main()
