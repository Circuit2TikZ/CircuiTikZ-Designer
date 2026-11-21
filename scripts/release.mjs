#!/usr/bin/env node
// Computes the next version and the release notes from the conventional commit subjects
// (= PR titles, because PRs are squash merged) between the latest release tag and a ref.
//
//   node scripts/release.mjs [--ref origin/dev] [--release-as 1.0.0] [--notes-file notes.md] [--preview]
//
// Prints a JSON summary. If GITHUB_OUTPUT is set, also writes release/version/tag/bump to it.
//
// Version rules:
//   0.x:   breaking/feat -> minor, fix/perf -> patch
//   >=1.0: breaking -> major, feat -> minor, fix/perf -> patch
// Commits of other types (chore, ci, docs, refactor, test, ...) are not part of the notes and
// do not trigger a release. --release-as overrides the computed version (e.g. to go to 1.0.0).

import { execFileSync } from "node:child_process"
import { appendFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const SECTIONS = [
	["breaking", "⚠ Breaking changes"],
	["feat", "Features"],
	["fix", "Bug fixes"],
	["perf", "Performance"],
]

const SUBJECT = /^(\w+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/

export function parseCommit(subject, body = "") {
	const m = SUBJECT.exec(subject.trim())
	if (!m) return null
	let [, type, scope, bang, description] = m
	let pr
	const prMatch = /\s+\(#(\d+)\)$/.exec(description)
	if (prMatch) {
		pr = prMatch[1]
		description = description.slice(0, prMatch.index)
	}
	const breaking = Boolean(bang) || /^BREAKING[ -]CHANGE:/m.test(body)
	return { type: type.toLowerCase(), scope, description, pr, breaking }
}

export function parseVersion(v) {
	const m = SEMVER.exec(v)
	if (!m) throw new Error(`"${v}" is not a MAJOR.MINOR.PATCH version`)
	return m.slice(1).map(Number)
}

function isGreater(a, b) {
	for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
	return false
}

/** Returns "major" | "minor" | "patch" | null (nothing releasable). */
export function bumpLevel(baseVersion, commits) {
	const pre1 = parseVersion(baseVersion)[0] === 0
	if (commits.some((c) => c.breaking)) return pre1 ? "minor" : "major"
	if (commits.some((c) => c.type === "feat")) return "minor"
	if (commits.some((c) => c.type === "fix" || c.type === "perf")) return "patch"
	return null
}

export function applyBump(baseVersion, level) {
	const [major, minor, patch] = parseVersion(baseVersion)
	if (level === "major") return `${major + 1}.0.0`
	if (level === "minor") return `${major}.${minor + 1}.0`
	return `${major}.${minor}.${patch + 1}`
}

export function renderNotes(commits) {
	const lines = []
	for (const [key, title] of SECTIONS) {
		const items = commits.filter((c) => (key === "breaking" ? c.breaking : !c.breaking && c.type === key))
		if (!items.length) continue
		lines.push(`### ${title}`, "")
		for (const c of items) {
			// breaking entries only appear in their own section, so they carry their type
			const label = key === "breaking" ? `${c.type}${c.scope ? `(${c.scope})` : ""}` : c.scope
			lines.push(`- ${label ? `**${label}:** ` : ""}${c.description}${c.pr ? ` (#${c.pr})` : ""}`)
		}
		lines.push("")
	}
	return lines.join("\n")
}

function git(...args) {
	return execFileSync("git", args, { encoding: "utf8" })
}

/** Latest stable release tag (vX.Y.Z, no pre-release suffix) by version order. */
export function latestTag() {
	const tags = git("tag", "--list", "v*")
		.split("\n")
		.filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
		.sort((a, b) => {
			const [x, y] = [a.slice(1), b.slice(1)].map(parseVersion)
			return (
				isGreater(x, y) ? 1
				: isGreater(y, x) ? -1
				: 0
			)
		})
	return tags.at(-1)
}

function commitsSince(tag, ref) {
	// tag..ref instead of git describe: the tag sits on a merge commit on main that dev
	// doesn't contain, but that merge commit has dev's old tip as parent, so everything
	// already released is excluded without needing a back-merge.
	const raw = git("log", "--no-merges", "--format=%s%x1f%b%x1e", `${tag}..${ref}`)
	return raw
		.split("\x1e")
		.map((entry) => entry.replace(/^\n/, ""))
		.filter(Boolean)
		.map((entry) => {
			const [subject, body] = entry.split("\x1f")
			return parseCommit(subject, body)
		})
		.filter(Boolean)
}

function main() {
	const args = process.argv.slice(2)
	const opt = (name) => {
		const i = args.indexOf(name)
		return i === -1 ? undefined : args[i + 1]
	}
	const ref = opt("--ref") ?? "HEAD"
	const releaseAs = opt("--release-as") || undefined
	const notesFile = opt("--notes-file")
	const preview = args.includes("--preview")

	const tag = opt("--since") ?? latestTag()
	if (!tag) throw new Error("No release tag (vX.Y.Z) found. Fetch tags or pass --since.")
	const base = tag.replace(/^v/, "")
	const commits = commitsSince(tag, ref)
	const level = bumpLevel(base, commits)

	let version = level ? applyBump(base, level) : undefined
	let bump = level
	if (releaseAs) {
		if (!isGreater(parseVersion(releaseAs), parseVersion(base))) {
			throw new Error(`--release-as ${releaseAs} must be greater than the latest release ${base}`)
		}
		version = releaseAs
		bump = "override"
	}

	const release = Boolean(version)
	let notes = renderNotes(commits)
	if (release && process.env.GITHUB_REPOSITORY) {
		notes += `\n**Full changelog:** https://github.com/${process.env.GITHUB_REPOSITORY}/compare/${tag}...v${version}\n`
	}
	if (preview) {
		const head =
			release ?
				`**Next release: v${version}** (${bump}), changes since ${tag}:`
			:	`**No release yet.** Nothing since ${tag} is a \`feat\`, \`fix\`, \`perf\` or breaking change.`
		notes = `${head}\n\n${notes}`
	}
	if (notesFile) writeFileSync(notesFile, notes)

	const result = {
		release,
		version,
		tag: version ? `v${version}` : undefined,
		bump,
		since: tag,
		commits: commits.length,
	}
	console.log(JSON.stringify(result, null, 2))
	if (process.env.GITHUB_OUTPUT) {
		const lines = Object.entries(result)
			.filter(([, v]) => v !== undefined)
			.map(([k, v]) => `${k}=${v}`)
		appendFileSync(process.env.GITHUB_OUTPUT, lines.join("\n") + "\n")
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
