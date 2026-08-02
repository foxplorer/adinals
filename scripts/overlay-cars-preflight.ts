import { readFile, readdir, stat } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// `cars build` packages only deployment-info.json, the root package files, and
// the backend directory. Nothing in this repository's root `src` reaches the
// deployed container, so the backend boundary must be proven before a release
// is ever attempted. This command is deliberately offline: it never contacts a
// CARS Cloud, creates a project, or uploads an artifact.

const repository = fileURLToPath(new URL('../', import.meta.url))
const backendSource = path.join(repository, 'backend/src')
const errors: string[] = []
const warnings: string[] = []

const exists = async (target: string): Promise<boolean> => {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

type CarsConfig = {
  name?: string
  network?: string
  provider?: string
  projectID?: string
  CARSCloudURL?: string
  deploy?: string[]
}

const deployment = JSON.parse(await readFile(
  path.join(repository, 'deployment-info.json'),
  'utf8'
)) as {
  schema?: string
  topicManagers?: Record<string, string>
  lookupServices?: Record<string, { serviceFactory: string; hydrateWith?: string }>
  configs?: CarsConfig[]
}

if (deployment.schema !== 'bsv-app') errors.push('deployment-info.json schema must be bsv-app')

const configs = deployment.configs ?? []
const larsConfigs = configs.filter((config) => config.provider === 'LARS')
const carsConfigs = configs.filter((config) => config.provider === 'CARS')
if (larsConfigs.length !== 1) errors.push('exactly one LARS configuration is required')
if (carsConfigs.length !== 1) errors.push('exactly one CARS shadow configuration is required')

const cars = carsConfigs[0]
const lars = larsConfigs[0]
if (cars) {
  if (!cars.name) errors.push('the CARS configuration needs a name for `cars build <name>`')
  if (cars.network !== lars?.network) {
    errors.push(`CARS network ${cars.network} must match LARS network ${lars?.network}`)
  }
  if (cars.network !== 'mainnet') errors.push('the Adinals shadow node runs on mainnet')
  if (!cars.CARSCloudURL?.startsWith('https://')) {
    errors.push('CARSCloudURL must be an explicit HTTPS cloud endpoint')
  }
  const deploy = cars.deploy ?? []
  if (deploy.length !== 1 || deploy[0] !== 'backend') {
    errors.push('the shadow deployment releases the backend only')
  }
  if (deployment.topicManagers === undefined || deployment.lookupServices === undefined) {
    errors.push('the CARS artifact needs both topic managers and lookup services')
  }
}

const registered = [
  ...Object.values(deployment.topicManagers ?? {}),
  ...Object.values(deployment.lookupServices ?? {}).map((service) => service.serviceFactory)
]
for (const reference of registered) {
  if (!reference.startsWith('./backend/')) {
    errors.push(`${reference} is outside the packaged backend directory`)
  }
  if (!await exists(path.join(repository, reference))) {
    errors.push(`${reference} does not exist`)
  }
}

const sourceFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const found = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(target)
    return entry.name.endsWith('.ts') ? [target] : []
  }))
  return found.flat()
}

const files = await sourceFiles(backendSource)
const runtimeFiles = files.filter((file) => !file.endsWith('.test.ts'))
const backendPackage = JSON.parse(await readFile(
  path.join(repository, 'backend/package.json'),
  'utf8'
)) as { dependencies?: Record<string, string> }
const declared = new Set(Object.keys(backendPackage.dependencies ?? {}))
const builtin = new Set(builtinModules)
const specifiers = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g

for (const file of runtimeFiles) {
  const contents = await readFile(file, 'utf8')
  const relative = path.relative(repository, file)
  for (const match of contents.matchAll(specifiers)) {
    const specifier = match[1] as string
    if (specifier.startsWith('.')) {
      const resolved = path.resolve(path.dirname(file), specifier)
      if (!resolved.startsWith(backendSource)) {
        errors.push(`${relative} imports ${specifier} from outside backend/src`)
      }
      continue
    }
    if (path.isAbsolute(specifier)) {
      errors.push(`${relative} imports the absolute path ${specifier}`)
      continue
    }
    const bare = specifier.startsWith('@')
      ? specifier.split('/').slice(0, 2).join('/')
      : specifier.split('/')[0] as string
    if (bare.startsWith('node:') || builtin.has(bare)) continue
    if (!declared.has(bare)) {
      errors.push(`${relative} imports ${bare}, which backend/package.json does not declare`)
    }
  }
}

// `cars build` reinstalls backend dependencies and then copies the backend
// directory verbatim, so `backend/node_modules` is packaged by design. Compiled
// test output is not reinstalled and would ship as stale dead weight.
if (await exists(path.join(repository, 'backend/dist-test'))) {
  warnings.push('backend/dist-test exists and would be packaged; remove it before `cars build`')
}

// The CARS CLI writes a stub deployment-info.json into whatever directory it
// runs from. A second one inside backend/ would ship with the release and
// describe no services at all.
if (await exists(path.join(repository, 'backend/deployment-info.json'))) {
  errors.push('backend/deployment-info.json is a stray CARS stub; delete it before `cars build`')
}

const projectConfigured = Boolean(cars?.projectID)
if (!projectConfigured) {
  warnings.push('no CARS projectID is set, so every release command fails closed until an operator runs `cars config edit`')
}

console.log(JSON.stringify({
  configuration: cars?.name ?? null,
  network: cars?.network ?? null,
  cloud: cars?.CARSCloudURL ?? null,
  deploy: cars?.deploy ?? [],
  projectConfigured,
  registeredServices: registered.length,
  backendRuntimeFiles: runtimeFiles.length,
  backendTestFiles: files.length - runtimeFiles.length,
  backendBoundaryClean: errors.length === 0,
  warnings,
  errors
}, null, 2))

if (errors.length > 0) process.exitCode = 1
