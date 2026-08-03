/**
 * Bounds a read so a slow source degrades instead of hanging.
 *
 * The overlay and the public reader are both remote services on the render
 * path, and neither is allowed to hold a view open indefinitely: availability
 * is an operational detail while the records themselves are permanent.
 */
export async function withReadTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
