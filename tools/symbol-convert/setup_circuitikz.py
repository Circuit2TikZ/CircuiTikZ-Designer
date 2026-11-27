"""
Downloads the CircuiTikZ version of the converter into .circuitikz/. Other TeX documents are not affected.
"""

import io
import pathlib
import shutil
import sys
import tarfile
import tempfile
import urllib.request

from errors import ConverterError
from toolchain import (
	CIRCUITIKZ_CHECKSUM,
	CIRCUITIKZ_DIR,
	CIRCUITIKZ_VERSION,
	directory_checksum,
	is_circuitikz_installed,
)

URL = f"https://github.com/circuitikz/circuitikz/archive/refs/tags/v{CIRCUITIKZ_VERSION}.tar.gz"


def install():
	if is_circuitikz_installed():
		print(f"CircuiTikZ {CIRCUITIKZ_VERSION} is already installed in {CIRCUITIKZ_DIR}")
		return

	print(f"Downloading {URL}")
	try:
		with urllib.request.urlopen(URL, timeout=60) as response:
			archive = response.read()
	except OSError as error:
		raise ConverterError(f"Download failed: {error}") from error

	CIRCUITIKZ_DIR.parent.mkdir(exist_ok=True)
	with tempfile.TemporaryDirectory(dir=CIRCUITIKZ_DIR.parent) as temp:
		files = pathlib.Path(temp) / "tex"
		files.mkdir()
		with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
			for member in tar.getmembers():
				# only the regular files directly in <release>/tex/, written by their file name
				path = pathlib.PurePosixPath(member.name)
				if member.isfile() and len(path.parts) == 3 and path.parts[1] == "tex":
					(files / path.name).write_bytes(tar.extractfile(member).read())

		checksum = directory_checksum(files)
		if checksum != CIRCUITIKZ_CHECKSUM:
			raise ConverterError(
				f"The downloaded files don't match the expected checksum, nothing was installed.\n"
				f"expected: {CIRCUITIKZ_CHECKSUM}\nfound:    {checksum}"
			)

		if CIRCUITIKZ_DIR.exists():
			shutil.rmtree(CIRCUITIKZ_DIR)
		files.rename(CIRCUITIKZ_DIR)

	print(f"Installed CircuiTikZ {CIRCUITIKZ_VERSION} in {CIRCUITIKZ_DIR}")


if __name__ == "__main__":
	try:
		install()
	except ConverterError as error:
		sys.exit(f"Error: {error}")
