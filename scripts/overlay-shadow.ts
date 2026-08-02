import { spawn } from 'node:child_process'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const endpoint = (process.env.ADINALS_OVERLAY_URL ?? 'http://localhost:8080')
  .replace(/\/+$/, '')
const argument = (flag: string): string | undefined =>
  process.argv.find((value) => value.startsWith(`${flag}=`))?.slice(flag.length + 1)
const count = (flag: string, fallback: number): number => {
  const raw = argument(flag)
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) throw new Error(`${flag} must be a number`)
  return value
}

const rounds = Math.max(1, count('--rounds', 1))
const intervalMs = count('--interval', 900) * 1000
const repository = fileURLToPath(new URL('../', import.meta.url))
const reportDirectory = argument('--report-dir')
  ?? fileURLToPath(new URL('../reports/overlay-shadow/', import.meta.url))

type CommandResult = {
  command: string
  exitCode: number
  durationMs: number
  summary: unknown
  stdout: string
  stderr: string
}

const lastJsonLine = (output: string): unknown => {
  const lines = output.split('\n').map((line) => line.trim()).filter((line) =>
    line.startsWith('{') && line.endsWith('}'))
  const last = lines.at(-1)
  if (last === undefined) return null
  try {
    return JSON.parse(last)
  } catch {
    return null
  }
}

const run = (script: string): Promise<CommandResult> =>
  new Promise((resolve, reject) => {
    const started = Date.now()
    const child = spawn('npm', ['run', script], {
      cwd: repository,
      env: { ...process.env, ADINALS_OVERLAY_URL: endpoint }
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => resolve({
      command: script,
      exitCode: code ?? 1,
      durationMs: Date.now() - started,
      summary: lastJsonLine(stdout),
      stdout,
      stderr
    }))
  })

const healthy = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${endpoint}/health`)
    if (!response.ok) return false
    const body = await response.json() as { status?: unknown }
    return body.status === 'ok'
  } catch {
    return false
  }
}

// A shadow round is a divergence observation, not a deployment step: parity and
// confirmed reconciliation both run even when the first one fails, so a single
// report explains the whole namespace at one moment.
const round = async (index: number): Promise<Record<string, unknown>> => {
  const startedAt = new Date().toISOString()
  if (!await healthy()) {
    return {
      round: index,
      startedAt,
      endpoint,
      status: 'overlay-unavailable',
      passed: false
    }
  }
  const parity = await run('overlay:parity')
  const reconcile = await run('overlay:reconcile')
  const commands = [parity, reconcile]
  const passed = commands.every((result) => result.exitCode === 0)
  return {
    round: index,
    startedAt,
    endpoint,
    status: passed ? 'clean' : 'divergent',
    passed,
    parity: parity.summary,
    reconcile: reconcile.summary,
    durationMs: commands.reduce((total, result) => total + result.durationMs, 0),
    // Exact command output is retained only when something failed, so a clean
    // shadow period does not accumulate hundreds of identical transcripts.
    failures: commands.filter((result) => result.exitCode !== 0).map((result) => ({
      command: result.command,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr
    }))
  }
}

await mkdir(reportDirectory, { recursive: true })
const reports: Array<Record<string, unknown>> = []
for (let index = 1; index <= rounds; index += 1) {
  const report = await round(index)
  reports.push(report)
  const stamp = String(report.startedAt).replace(/[:.]/g, '-')
  await writeFile(
    `${reportDirectory}/${stamp}-round-${index}.json`,
    `${JSON.stringify(report, null, 2)}\n`
  )
  await appendFile(`${reportDirectory}/history.jsonl`, `${JSON.stringify({
    startedAt: report.startedAt,
    round: report.round,
    status: report.status,
    parity: report.parity,
    reconcile: report.reconcile
  })}\n`)
  console.log(JSON.stringify({
    round: index,
    status: report.status,
    parity: report.parity,
    reconcile: report.reconcile
  }))
  if (index < rounds && intervalMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

const cleanRounds = reports.filter((report) => report.passed).length
console.log(JSON.stringify({
  endpoint,
  reportDirectory,
  rounds,
  cleanRounds,
  divergentRounds: rounds - cleanRounds
}))
if (cleanRounds !== rounds) process.exitCode = 1
