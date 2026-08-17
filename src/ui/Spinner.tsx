import { Text } from 'ink'
import { useEffect, useState } from 'react'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const INTERVAL_MS = 80

export function Spinner() {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  return <Text color="cyan">{FRAMES[frame]}</Text>
}
