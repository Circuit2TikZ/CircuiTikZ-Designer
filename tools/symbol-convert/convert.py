"""
Generates src/data/symbols.svg from the components in nodes.jsonc. See README.md for the required tools.
"""

import os
import pathlib
import shutil

CONVERTER_DIR = pathlib.Path(__file__).resolve().parent
# the converter uses paths relative to its folder, this has to be set before the imports below read nodes.jsonc
os.chdir(CONVERTER_DIR)

from svg_functions import combine_SVGs_to_symbol, convert_DVI_to_SVGs
from tex_functions import compile_tex_files, create_tex_files_from_json


def main():
	# the steps skip files which already exist, so old ones would hide changes
	build_dir = CONVERTER_DIR / "build"
	if build_dir.exists():
		shutil.rmtree(build_dir)

	create_tex_files_from_json()
	compile_tex_files()
	convert_DVI_to_SVGs()
	combine_SVGs_to_symbol()


if __name__ == "__main__":
	main()
