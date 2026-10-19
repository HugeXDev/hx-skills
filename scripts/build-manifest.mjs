import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const NAME_RE = /^[a-z0-9-]{1,64}$/
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/

const args = process.argv.slice(2)
let check = false
for (const arg of args) {
  if (arg === '--check') {
    check = true
    continue
  }
  console.error(`unknown argument: ${arg}`)
  console.error('usage: node scripts/build-manifest.mjs [--check]')
  process.exit(2)
}

const errors = []

function report(file, message) {
  errors.push(`${file}: ${message}`)
}

function readJson(rel) {
  const abs = join(root, rel)
  if (!existsSync(abs)) {
    report(rel, 'file not found')
    return null
  }
  try {
    return JSON.parse(readFileSync(abs, 'utf8'))
  } catch {
    report(rel, 'invalid JSON')
    return null
  }
}

function parseSemver(value) {
  const match = SEMVER_RE.exec(value)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareSemver(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return 0
}

function indentOf(line, file) {
  let i = 0
  while (i < line.length && line[i] === ' ') i++
  if (line[i] === '\t') throw new Error(`${file}: tabs are not allowed in frontmatter`)
  return i
}

function decodeDoubleQuoted(value, file) {
  let out = ''
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== '\\') {
      out += value[i]
      continue
    }
    const next = value[++i]
    if (next === undefined) throw new Error(`${file}: unterminated escape in frontmatter`)
    if (next === 'n') out += '\n'
    else if (next === 't') out += '\t'
    else out += next
  }
  return out
}

function decodeSingleQuoted(value) {
  return value.replace(/''/g, "'")
}

function parseScalar(raw, file) {
  const trimmed = raw.trim()
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    const quote = trimmed[0]
    if (trimmed.length < 2 || !trimmed.endsWith(quote)) {
      throw new Error(`${file}: unterminated string in frontmatter`)
    }
    const inner = trimmed.slice(1, -1)
    return quote === '"' ? decodeDoubleQuoted(inner, file) : decodeSingleQuoted(inner)
  }
  const comment = trimmed.search(/(^|\s)#/)
  if (comment === 0) return ''
  if (comment > 0) return trimmed.slice(0, comment).trim()
  return trimmed
}

function isBlockIndicator(value) {
  return value === '|' || value === '|-' || value === '|+' || value === '>' || value === '>-' || value === '>+'
}

function foldBlock(chunks, indicator) {
  const fold = indicator.startsWith('>')
  const chomp = indicator.endsWith('-') ? 'strip' : indicator.endsWith('+') ? 'keep' : 'clip'
  let text
  if (!fold) {
    text = chunks.join('\n')
  } else {
    const parts = []
    let buf = []
    const flush = () => {
      if (buf.length === 0) return
      parts.push(buf.join(' '))
      buf = []
    }
    for (const chunk of chunks) {
      if (chunk === '') {
        flush()
        parts.push('')
      } else {
        buf.push(chunk)
      }
    }
    flush()
    text = parts.join('\n')
  }
  if (chomp === 'strip') return text.replace(/\n+$/, '')
  if (chomp === 'keep') return text.endsWith('\n') || text === '' ? text : `${text}\n`
  if (chunks.length === 0) return ''
  return `${text.replace(/\n+$/, '')}\n`
}

function consumeBlock(lines, start, keyIndent, file) {
  const chunks = []
  let i = start
  let contentIndent = null
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      chunks.push('')
      i++
      continue
    }
    const indent = indentOf(line, file)
    if (indent <= keyIndent) break
    if (contentIndent === null) contentIndent = indent
    if (indent < contentIndent) {
      throw new Error(`${file}: invalid block scalar indentation`)
    }
    chunks.push(line.slice(contentIndent))
    i++
  }
  return { chunks, next: i }
}

function nextContent(lines, start, file) {
  for (let i = start; i < lines.length; i++) {
    if (lines[i].trim() === '' || lines[i].trimStart().startsWith('#')) continue
    return { index: i, indent: indentOf(lines[i], file), text: lines[i].trim() }
  }
  return null
}

function parseYamlMap(yaml, file) {
  const lines = yaml.split(/\r?\n/)
  const root = {}
  const stack = [{ indent: -1, value: root }]
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      i++
      continue
    }
    const indent = indentOf(line, file)
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop()
    const parent = stack[stack.length - 1].value
    if (parent === null || typeof parent !== 'object' || Array.isArray(parent)) {
      throw new Error(`${file}: invalid frontmatter nesting`)
    }
    const body = line.slice(indent)
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(body)
    if (!match) throw new Error(`${file}: invalid frontmatter line: ${line.trim()}`)
    const key = match[1]
    if (Object.hasOwn(parent, key)) throw new Error(`${file}: duplicate frontmatter key "${key}"`)
    const raw = parseScalar(match[2], file)
    if (isBlockIndicator(raw)) {
      const block = consumeBlock(lines, i + 1, indent, file)
      parent[key] = foldBlock(block.chunks, raw)
      i = block.next
      continue
    }
    if (raw === '') {
      const upcoming = nextContent(lines, i + 1, file)
      if (upcoming && upcoming.indent > indent && /^[A-Za-z0-9_-]+:\s*/.test(upcoming.text)) {
        const child = {}
        parent[key] = child
        stack.push({ indent, value: child })
        i++
        continue
      }
    }
    parent[key] = raw
    i++
  }
  return root
}

function parseFrontmatter(text, file) {
  const source = text.replace(/^\uFEFF/, '')
  const nl = source.indexOf('\n')
  const first = (nl === -1 ? source : source.slice(0, nl)).replace(/\r$/, '')
  if (first !== '---') throw new Error(`${file}: missing frontmatter`)
  const rest = source.slice(nl + 1)
  const end = rest.search(/^---[ \t]*\r?$/m)
  if (end < 0) throw new Error(`${file}: unterminated frontmatter`)
  return parseYamlMap(rest.slice(0, end), file)
}

function listSkillFiles(skillDir, dirName) {
  const files = []
  const walk = (abs, relBase) => {
    const entries = readdirSync(abs, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )
    for (const entry of entries) {
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name
      const reported = `skills/${dirName}/${rel}`
      if (entry.isSymbolicLink()) {
        report(reported, 'symlink is not allowed')
        continue
      }
      if (entry.isDirectory()) {
        const allowedDir = rel === 'references' || rel.startsWith('references/')
        if (!allowedDir) report(reported, 'directory is outside references/**')
        walk(join(abs, entry.name), rel)
        continue
      }
      if (!entry.isFile()) {
        report(reported, 'not a regular file')
        continue
      }
      const allowedFile = rel === 'SKILL.md' || rel.startsWith('references/')
      if (!allowedFile) report(reported, 'file is outside SKILL.md and references/**')
      else files.push(rel)
    }
  }
  walk(skillDir, '')
  return files
}

function requireString(value, file, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    report(file, `missing ${label}`)
    return null
  }
  return value
}

function requireSemver(value, file, label) {
  if (value === undefined || value === '') {
    report(file, `missing ${label}`)
    return null
  }
  if (typeof value !== 'string' || !parseSemver(value)) {
    report(file, `${label} ${JSON.stringify(value)} is not major.minor.patch`)
    return null
  }
  return value
}

const pkg = readJson('package.json')
const plugin = readJson('.claude-plugin/plugin.json')
if (pkg) {
  if (pkg.name !== 'hx-skills') report('package.json', 'name must be "hx-skills"')
  requireSemver(pkg.version, 'package.json', 'version')
}
if (pkg && plugin && typeof pkg.version === 'string' && plugin.version !== pkg.version) {
  report(
    '.claude-plugin/plugin.json',
    `version ${JSON.stringify(plugin.version)} does not match package.json version ${JSON.stringify(pkg.version)}`,
  )
}

const skillsDir = join(root, 'skills')
const parsed = []
if (!existsSync(skillsDir)) {
  report('skills', 'directory not found')
} else {
  const entries = readdirSync(skillsDir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )
  const dirs = []
  for (const entry of entries) {
    const reported = `skills/${entry.name}`
    if (entry.isSymbolicLink()) {
      report(reported, 'symlink is not allowed')
      continue
    }
    if (!entry.isDirectory()) {
      report(reported, 'file is outside skills/<name>/')
      continue
    }
    if (!NAME_RE.test(entry.name)) report(reported, 'directory name must match ^[a-z0-9-]{1,64}$')
    dirs.push(entry.name)
  }
  if (dirs.length === 0) report('skills', 'no skill directories found')
  for (const dirName of dirs) {
    const skillDir = join(skillsDir, dirName)
    const skillFile = `skills/${dirName}/SKILL.md`
    const files = listSkillFiles(skillDir, dirName)
    if (!files.includes('SKILL.md')) {
      report(skillFile, 'file not found')
      continue
    }
    let data
    try {
      data = parseFrontmatter(readFileSync(join(skillDir, 'SKILL.md'), 'utf8'), skillFile)
    } catch (error) {
      report(skillFile, error instanceof Error ? error.message.replace(`${skillFile}: `, '') : 'invalid frontmatter')
      continue
    }
    const name = requireString(data.name, skillFile, 'name')
    if (typeof data.name === 'string' && data.name !== '' && !NAME_RE.test(data.name)) {
      report(skillFile, `name ${JSON.stringify(data.name)} must match ^[a-z0-9-]{1,64}$`)
    }
    if (typeof data.name === 'string' && data.name !== dirName) {
      report(skillFile, `name ${JSON.stringify(data.name)} does not match directory ${JSON.stringify(dirName)}`)
    }
    const description = requireString(data.description, skillFile, 'description')
    const hx = data.metadata && typeof data.metadata === 'object' ? data.metadata.hx : undefined
    if (!hx || typeof hx !== 'object' || Array.isArray(hx)) {
      report(skillFile, 'missing metadata.hx')
      continue
    }
    const version = requireSemver(hx.version, skillFile, 'metadata.hx.version')
    const minServerVersion = requireSemver(hx.minServerVersion, skillFile, 'metadata.hx.minServerVersion')
    if (!name || !description || !version || !minServerVersion) continue
    parsed.push({
      name: dirName,
      description,
      version,
      minServerVersion,
      files,
      skillDir,
    })
  }
}

if (errors.length > 0) {
  for (const error of errors.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) console.error(error)
  process.exit(1)
}

let highest = null
let minServerVersion = null
for (const skill of parsed) {
  const parts = parseSemver(skill.minServerVersion)
  if (!highest || compareSemver(parts, highest) > 0) {
    highest = parts
    minServerVersion = skill.minServerVersion
  }
}

const skills = parsed
  .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  .map((skill) => ({
    name: skill.name,
    description: skill.description,
    version: skill.version,
    files: skill.files
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      .map((rel) => {
        const bytes = readFileSync(join(skill.skillDir, rel))
        return {
          path: rel,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          bytes: bytes.length,
        }
      }),
  }))

const manifest = {
  name: pkg.name,
  version: pkg.version,
  contract: String(highest[0]),
  minServerVersion,
  skills,
}
const text = `${JSON.stringify(manifest, null, 2)}\n`
const outPath = join(root, 'manifest.json')
const current = existsSync(outPath) && readFileSync(outPath).equals(Buffer.from(text))

if (check) {
  if (!current) {
    console.error('manifest.json: out of date; run node scripts/build-manifest.mjs')
    process.exit(1)
  }
  console.log('manifest.json is up to date')
} else if (current) {
  console.log('manifest.json unchanged')
} else {
  writeFileSync(outPath, text)
  console.log('wrote manifest.json')
}
