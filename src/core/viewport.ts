interface ViewportInput {
  previousStart: number
  cursor: number
  rowCount: number
  height: number
}

/** First visible row index: shifts the previous window just far enough to keep the cursor inside. */
export function viewportStart({ previousStart, cursor, rowCount, height }: ViewportInput): number {
  const maxStart = Math.max(0, rowCount - height)
  let start = Math.min(previousStart, maxStart)
  if (cursor < start) start = cursor
  if (cursor >= start + height) start = cursor - height + 1
  return start
}
