import { useCallback, useEffect, useRef, useState } from 'react'
import type { AdminReturnDetailDto } from '@sabz/types'
import {
  approveReturn,
  completeReturn,
  getReturn,
  receiveReturn,
  rejectReturn,
} from '../services/returns'

export function useReturnDetail(returnId: string) {
  const [detail, setDetail] = useState<AdminReturnDetailDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [mutating, setMutating] = useState(false)
  const requestSeq = useRef(0)

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await getReturn(returnId)
      if (seq === requestSeq.current) {
        setDetail(data)
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setError(error)
        setDetail(null)
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [returnId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const runTransition = useCallback(
    async (transition: () => Promise<AdminReturnDetailDto>): Promise<void> => {
      setMutating(true)
      try {
        const updated = await transition()
        setDetail(updated)
      } finally {
        setMutating(false)
      }
    },
    [],
  )

  const approve = useCallback(
    (): Promise<void> => runTransition(() => approveReturn(returnId)),
    [returnId, runTransition],
  )

  const reject = useCallback(
    (reason: string): Promise<void> =>
      runTransition(() => rejectReturn(returnId, reason)),
    [returnId, runTransition],
  )

  const receive = useCallback(
    (): Promise<void> => runTransition(() => receiveReturn(returnId)),
    [returnId, runTransition],
  )

  const complete = useCallback(
    (): Promise<void> => runTransition(() => completeReturn(returnId)),
    [returnId, runTransition],
  )

  return { detail, loading, error, refetch, approve, reject, receive, complete, mutating }
}
