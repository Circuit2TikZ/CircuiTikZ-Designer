"""
Saves and compares the checksums of the last successful converter run, in checksums.txt.

The check (`npm run symbols:check`) is only informative. A mismatch means:
- symbols.svg: it is not the file which the recorded run wrote, e.g. it was edited by hand.
- any other file: it changed since the recorded run, so consider running `npm run symbols` again.
A match doesn't prove that the symbols are correct, and checksums.txt itself could be edited by hand.
Tools installed on the computer (TeX, dvisvgm, Node) are not part of the check.

This module must only use the standard library, CI runs it without installing anything.
"""

import hashlib
import json
import pathlib
import subprocess
import sys

from errors import ConverterError
from toolchain import CONVERTER_DIR, REPO_ROOT

CHECKSUMS_FILE = CONVERTER_DIR / "checksums.txt"
OUTPUT_NAME = "src/data/symbols.svg"
# svgo is pinned in package.json. Its version is saved, the file also changes for unrelated dependencies.
SVGO_NAME = "svgo"

# Files in the converter folder which don't change the output of a successful run. All other files are included,
# so a new file which is forgotten here only leads to an unnecessary run, not to a missed change.
IGNORED_FILES = {
	"README.md",
	"checksums.py",
	"checksums.txt",
	"common.schema.json",
	"errors.py",
	"nodes.schema.json",
	"paths.schema.json",
	"pyproject.toml",
	"setup_circuitikz.py",
}

HEADER = """\
# Written by every successful run of `npm run symbols`, don't edit. Commit it together with symbols.svg.
# Only informative, see `npm run symbols:check` and README.md.
"""


def _file_checksum(file: pathlib.Path) -> str:
	# line endings are normalized like Git does it, so the result is the same on all operating systems
	return hashlib.sha256(file.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def _converter_files() -> list[pathlib.Path]:
	# asks Git, so that ignored files (build/, .venv/, caches) are left out. New files count before they are committed.
	command = ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "."]
	try:
		result = subprocess.run(command, cwd=CONVERTER_DIR, capture_output=True, check=True)
	except (OSError, subprocess.CalledProcessError) as error:
		raise ConverterError(f"The files of the converter can't be listed with Git: {error}") from error
	names = {name for name in result.stdout.decode().split("\0") if name}
	# deleted files are still listed until the deletion is staged
	return [CONVERTER_DIR / name for name in names if name not in IGNORED_FILES and (CONVERTER_DIR / name).is_file()]


def input_checksums() -> dict[str, str]:
	"""
	Everything in the repository which the generated symbols depend on, by name.
	"""
	checksums = {file.relative_to(REPO_ROOT).as_posix(): _file_checksum(file) for file in _converter_files()}
	package = json.loads((REPO_ROOT / "package.json").read_text(encoding="utf-8"))
	checksums[SVGO_NAME] = package["devDependencies"]["svgo"]
	return checksums


def _output_checksum() -> str | None:
	output = REPO_ROOT / OUTPUT_NAME
	return _file_checksum(output) if output.is_file() else None


def save_checksums(inputs_at_start: dict[str, str]) -> bool:
	"""
	Call after symbols.svg was written. Nothing is saved if an input changed during the run, because it is unknown
	which version was used. Returns whether the checksums were saved.
	"""
	if input_checksums() != inputs_at_start:
		return False
	checksums = {**inputs_at_start, OUTPUT_NAME: _output_checksum()}
	lines = [f"{checksums[name]}  {name}\n" for name in sorted(checksums)]
	CHECKSUMS_FILE.write_text(HEADER + "".join(lines), encoding="utf-8", newline="\n")
	return True


def _read_checksums() -> dict[str, str]:
	if not CHECKSUMS_FILE.is_file():
		raise ConverterError(f"{CHECKSUMS_FILE.name} is missing, it is written by `npm run symbols`.")
	checksums = {}
	for line in CHECKSUMS_FILE.read_text(encoding="utf-8").splitlines():
		if not line or line.startswith("#"):
			continue
		value, separator, name = line.partition("  ")
		if not separator:
			raise ConverterError(f"{CHECKSUMS_FILE.name} contains an invalid line, e.g. a merge conflict: {line}")
		checksums[name] = value
	return checksums


def compare_checksums() -> tuple[bool, list[str]]:
	"""
	Returns whether symbols.svg differs from the recorded one, and the inputs which changed since the recorded run.
	"""
	recorded = _read_checksums()
	current = input_checksums()
	output_differs = recorded.pop(OUTPUT_NAME, None) != _output_checksum()

	changes = []
	for name in sorted(recorded.keys() | current.keys()):
		if name not in recorded:
			changes.append(f"added:   {name}")
		elif name not in current:
			changes.append(f"removed: {name}")
		elif recorded[name] != current[name]:
			changes.append(f"changed: {name}")
	return output_differs, changes


def check() -> bool:
	output_differs, changes = compare_checksums()
	if not output_differs and not changes:
		print(f"OK: {OUTPUT_NAME} and the converter files match the last recorded run of the converter.")
		return True

	if output_differs:
		print(
			f"{OUTPUT_NAME} is not the file which the last recorded converter run wrote.\n"
			f"It was edited by hand or merged, or {CHECKSUMS_FILE.name} of its run is missing.\n"
		)
	if changes:
		print("Changed since the last recorded run, consider running `npm run symbols`:")
		print("\n".join(f"  {change}" for change in changes) + "\n")
	print("This check is only informative, it doesn't block merging.")
	return False


def main():
	try:
		matches = check()
	except ConverterError as error:
		sys.exit(f"Error: {error}")
	sys.exit(0 if matches else 1)


if __name__ == "__main__":
	main()
