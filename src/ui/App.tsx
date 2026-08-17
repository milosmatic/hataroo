import { Box, Text, useApp, useInput, useStdin } from "ink"
import { useEffect, useState } from "react"
import { scan, type Repo } from "../core/scan.js"

interface Props {
  root: string
}

export function App({ root }: Props) {
  const { exit } = useApp()
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    scan(root)
      .then((found) => {
        if (!cancelled) setRepos(found)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      cancelled = true
    }
  }, [root])

  const { isRawModeSupported } = useStdin()
  useInput(
    (input) => {
      if (input === "q") exit()
    },
    { isActive: isRawModeSupported === true },
  )

  if (error !== null) {
    return (
      <Box flexDirection="column">
        <Text color="red">scan failed: {error}</Text>
        <Text dimColor>q quit</Text>
      </Box>
    )
  }

  if (repos === null) {
    return <Text dimColor>scanning {root}…</Text>
  }

  return (
    <Box flexDirection="column">
      {repos.map((repo) => (
        <Text key={repo.path}>{repo.name}</Text>
      ))}
      <Box marginTop={1}>
        <Text dimColor>q quit</Text>
      </Box>
    </Box>
  )
}
