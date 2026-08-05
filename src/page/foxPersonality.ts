/**
 * Structured personalities for the four roaming city foxes.
 *
 * Each fox in `city-at-night` is an Adinal, and its owner controls who the fox
 * is. The creative is a small JSON payload of **selections**, never prose:
 * every value below is chosen from a creator-authored list or clamped to a
 * creator-authored range, so an owner cannot put text of their own in front of
 * another player. That is what makes `adApproval: open` safe here — updates go
 * live instantly and there is nothing to review.
 *
 * The lists are also the kill switch. Removing a name from `FOX_NAMES`
 * retroactively neutralises it for every fox using it, everywhere, with no
 * transaction and no chain operation: the reader falls the field back to its
 * default. Permanence stops being a liability when the on-chain data is a
 * *reference* and the meaning is held off chain.
 *
 * Values are stored, never indices. An index would silently repoint the moment
 * a list is reordered, and fox #29 would wake up as a night watchman because
 * someone alphabetised `FOX_JOBS`.
 *
 * Nothing here composes a prompt. The consumer
 * (`transaction-server-prod/roaming-fox-npc-chat.ts`) turns these selections
 * into prompt text that we wrote, because player-authored text reaching a model
 * is a prompt-injection surface. This file only decides what may be chosen.
 */

/**
 * Slot number to fox, in mint order. **This is a contract**, not a label.
 *
 * The collection has no idea which of its slots is which animal; the serial is
 * the only link. Mint slot 1 first, then 2, 3, 4, and a consumer can map
 * `serial - 1` into this list. Mint them out of order and every fox in the city
 * gets someone else's personality — silently, because every payload is still
 * valid.
 *
 * The ids match the demo fox each one wears, so the sprite, the on-chain
 * record, and the chat endpoint all refer to the same animal.
 */
export const ROAMING_FOX_SLOTS = [
  'city-fox-12',
  'city-fox-29',
  'city-fox-31',
  'city-fox-67'
] as const

export type RoamingFoxId = (typeof ROAMING_FOX_SLOTS)[number]

/** The fox a slot drives, or null for a serial outside the four. */
export const roamingFoxForSlot = (serial: number): RoamingFoxId | null =>
  ROAMING_FOX_SLOTS[serial - 1] ?? null

export const FOX_NAMES = [
  'Bartholomew', 'Marguerite', 'Odell', 'Wren', 'Casimir', 'Tulla', 'Ambrose',
  'Ines', 'Rooster', 'Delphine', 'Marlow', 'Sable', 'Percival', 'Juno',
  'Grimsby', 'Fennimore', 'Opal', 'Thaddeus', 'Roux', 'Winnifred'
] as const

export const FOX_HOMES = [
  'born here', 'Riverbend', 'the harbour district', 'a farm two hours out',
  'the old quarter', 'somewhere colder', 'the coast', 'nobody asks',
  'uptown, once', 'the docks'
] as const

export const FOX_JOBS = [
  'night watchman', 'off-shift baker', 'ferry hand', 'sign painter',
  'locksmith', 'courier, retired', 'projectionist', 'fishmonger',
  'piano tuner', 'no job worth naming', 'street sweeper', 'radio engineer'
] as const

export const FOX_HOBBIES = [
  'counting puddles', 'cataloguing lit windows', 'greeting every cat',
  'walking the same route', 'collecting small talk', 'arguing about pavement',
  'listening for the last train', 'feeding the harbour gulls',
  'memorising shortcuts', 'keeping a weather diary'
] as const

export const FOX_TRAITS = [
  'gruff', 'warm', 'watchful', 'superstitious', 'loyal', 'scattered', 'dry',
  'curious', 'brisk', 'sentimental', 'blunt', 'delighted', 'wary', 'patient'
] as const

/** Three traits read distinctly in a 40-word reply; a fourth mostly costs bytes. */
export const FOX_TRAITS_MIN = 1
export const FOX_TRAITS_MAX = 3

export type FoxPersonalityRange = { min: number; max: number; step: number; decimals: number }

/**
 * Numeric ranges. Bands are deliberately narrow where a value leaves this
 * repository:
 *
 * - `speed` multiplies foxlive's `FOX_SPEED = 3.2`. Slower than 0.7 reads as a
 *   broken walk cycle; faster than 1.3 outruns the 150 ms position broadcast
 *   and the client interpolates through corners.
 * - `size` multiplies the client's fixed `scale={1.15}` and is visual only.
 *   `FOX_COLLISION_SIZE = 1.6` is duplicated in foxlive and the client collision
 *   merge and is pinned by a test, so the footprint must not move with it.
 */
export const FOX_PERSONALITY_RANGES = {
  mood: { min: 0, max: 100, step: 5, decimals: 0 },
  agree: { min: 0, max: 100, step: 5, decimals: 0 },
  chatty: { min: 0, max: 100, step: 5, decimals: 0 },
  speed: { min: 0.7, max: 1.3, step: 0.05, decimals: 2 },
  size: { min: 0.9, max: 1.1, step: 0.02, decimals: 2 }
} as const satisfies Record<string, FoxPersonalityRange>

export type FoxNumericField = keyof typeof FOX_PERSONALITY_RANGES

export type FoxPersonality = {
  name: string
  home: string
  job: string
  hobby: string
  traits: string[]
  mood: number
  agree: number
  chatty: number
  speed: number
  size: number
}

/**
 * What an unreadable or partially invalid record falls back to. A fox is never
 * mute and never blank: an owner who writes something the lists no longer allow
 * gets the default for that field and keeps the rest of their selections.
 */
export const DEFAULT_FOX_PERSONALITY: FoxPersonality = {
  name: 'Wren',
  home: 'born here',
  job: 'no job worth naming',
  hobby: 'walking the same route',
  traits: ['watchful'],
  mood: 50,
  agree: 50,
  chatty: 50,
  speed: 1,
  size: 1
}

/** Fixed field order, so the same selections always serialise byte-identically. */
const FIELD_ORDER = ['name', 'home', 'job', 'hobby', 'traits', 'mood', 'agree', 'chatty', 'speed', 'size'] as const

const OPTIONS: Record<'name' | 'home' | 'job' | 'hobby', readonly string[]> = {
  name: FOX_NAMES,
  home: FOX_HOMES,
  job: FOX_JOBS,
  hobby: FOX_HOBBIES
}

const roundTo = (value: number, decimals: number): number =>
  Number(value.toFixed(decimals))

export const isFoxNumberOnStep = (value: number, range: FoxPersonalityRange): boolean => {
  if (!Number.isFinite(value)) return false
  if (value < range.min || value > range.max) return false
  const steps = (value - range.min) / range.step
  return Math.abs(steps - Math.round(steps)) < 1e-6
}

/** Snaps a slider value onto the range, used when a control emits a raw number. */
export const clampFoxNumber = (value: number, range: FoxPersonalityRange): number => {
  if (!Number.isFinite(value)) return range.min
  const bounded = Math.min(range.max, Math.max(range.min, value))
  const snapped = range.min + Math.round((bounded - range.min) / range.step) * range.step
  return roundTo(Math.min(range.max, Math.max(range.min, snapped)), range.decimals)
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readTraits = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null
  if (value.length < FOX_TRAITS_MIN || value.length > FOX_TRAITS_MAX) return null
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string') return null
    if (!(FOX_TRAITS as readonly string[]).includes(entry)) return null
    if (seen.has(entry)) return null
    seen.add(entry)
  }
  return [...value as string[]]
}

/**
 * Strict read. Returns `null` for anything a publisher should refuse: unknown
 * keys, values off the approved lists, numbers off the range or off the step.
 *
 * Unknown keys are rejected rather than dropped. A field nobody agreed to is
 * either drift between this file and a consumer, or an owner probing the
 * writer — both are worth failing loudly while the payload is still small
 * enough for the byte budget to matter.
 */
export const parseFoxPersonality = (text: string): FoxPersonality | null => {
  let decoded: unknown
  try {
    decoded = JSON.parse(text)
  } catch {
    return null
  }
  if (!isPlainObject(decoded)) return null

  for (const key of Object.keys(decoded)) {
    if (!(FIELD_ORDER as readonly string[]).includes(key)) return null
  }

  const selection: Partial<FoxPersonality> = {}
  for (const key of ['name', 'home', 'job', 'hobby'] as const) {
    const value = decoded[key]
    if (typeof value !== 'string' || !OPTIONS[key].includes(value)) return null
    selection[key] = value
  }

  const traits = readTraits(decoded.traits)
  if (!traits) return null
  selection.traits = traits

  for (const key of Object.keys(FOX_PERSONALITY_RANGES) as FoxNumericField[]) {
    const value = decoded[key]
    if (typeof value !== 'number' || !isFoxNumberOnStep(value, FOX_PERSONALITY_RANGES[key])) return null
    selection[key] = roundTo(value, FOX_PERSONALITY_RANGES[key].decimals)
  }

  return selection as FoxPersonality
}

/**
 * Lenient read, for display and for seeding the editor. Every field falls back
 * independently, so one stale value does not discard nine good ones.
 */
export const readFoxPersonality = (text: string): FoxPersonality => {
  const exact = parseFoxPersonality(text)
  if (exact) return exact

  const result: FoxPersonality = { ...DEFAULT_FOX_PERSONALITY, traits: [...DEFAULT_FOX_PERSONALITY.traits] }
  let decoded: unknown
  try {
    decoded = JSON.parse(text)
  } catch {
    return result
  }
  if (!isPlainObject(decoded)) return result

  for (const key of ['name', 'home', 'job', 'hobby'] as const) {
    const value = decoded[key]
    if (typeof value === 'string' && OPTIONS[key].includes(value)) result[key] = value
  }

  if (Array.isArray(decoded.traits)) {
    const kept: string[] = []
    for (const entry of decoded.traits) {
      if (typeof entry !== 'string') continue
      if (!(FOX_TRAITS as readonly string[]).includes(entry)) continue
      if (kept.includes(entry)) continue
      if (kept.length >= FOX_TRAITS_MAX) break
      kept.push(entry)
    }
    if (kept.length >= FOX_TRAITS_MIN) result.traits = kept
  }

  for (const key of Object.keys(FOX_PERSONALITY_RANGES) as FoxNumericField[]) {
    const value = decoded[key]
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = clampFoxNumber(value, FOX_PERSONALITY_RANGES[key])
    }
  }

  return result
}

/** Canonical form: fixed key order, no whitespace, numbers at range precision. */
export const serializeFoxPersonality = (selection: FoxPersonality): string =>
  JSON.stringify({
    name: selection.name,
    home: selection.home,
    job: selection.job,
    hobby: selection.hobby,
    traits: selection.traits,
    mood: selection.mood,
    agree: selection.agree,
    chatty: selection.chatty,
    speed: roundTo(selection.speed, FOX_PERSONALITY_RANGES.speed.decimals),
    size: roundTo(selection.size, FOX_PERSONALITY_RANGES.size.decimals)
  })

export const isValidFoxPersonality = (text: string): boolean =>
  parseFoxPersonality(text) !== null

/**
 * Idempotent canonicalisation. Invalid text is returned trimmed rather than
 * repaired, so the caller's validity check still fails and the button stays
 * disabled instead of quietly writing something the owner did not choose.
 */
export const normalizeFoxPersonality = (text: string): string => {
  const parsed = parseFoxPersonality(text)
  return parsed ? serializeFoxPersonality(parsed) : text.trim()
}

/** One-line description for the ad list, where the full payload is noise. */
export const foxPersonalitySummary = (selection: FoxPersonality): string =>
  `${selection.name} · ${selection.job} · ${selection.traits.join(', ')}`

/**
 * Longest payload the lists can produce. The collection's `adMaxChars` is
 * permanent, so it has to clear this on the day the collection is created — a
 * cap chosen for today's lists is a cap on every list edit afterwards.
 */
export const maxFoxPersonalityLength = (): number => {
  const longest = (list: readonly string[]): string =>
    list.reduce((best, entry) => (entry.length > best.length ? entry : best), '')
  const traits = [...FOX_TRAITS]
    .sort((left, right) => right.length - left.length)
    .slice(0, FOX_TRAITS_MAX)
  return [...serializeFoxPersonality({
    name: longest(FOX_NAMES),
    home: longest(FOX_HOMES),
    job: longest(FOX_JOBS),
    hobby: longest(FOX_HOBBIES),
    traits,
    mood: 100,
    agree: 100,
    chatty: 100,
    speed: 1.25,
    size: 0.98
  })].length
}
