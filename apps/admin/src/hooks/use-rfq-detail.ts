import { useCallback, useEffect, useRef, useState } from 'react'
import type { QuoteRfqInput, RfqDto } from '@sabz/types'
import { getRfq, quoteRfq, rejectRfq } from '../services/rfq'

export function useRfqDetail(rfqId: string) {
  const [rfq, setRfq] = useState<RfqDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [mutating, setMutating] = useState(false)
  const requestSeq = useRef(0)

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await getRfq(rfqId)
      if (seq === requestSeq.current) {
        setRfq(data)
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setError(error)
        setRfq(null)
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [rfqId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const quote = useCallback(
    async (input: QuoteRfqInput): Promise<void> => {
      setMutating(true)
      try {
        const updated = await quoteRfq(rfqId, input)
        setRfq(updated)
      } finally {
        setMutating(false)
      }
    },
    [rfqId],
  )

  const reject = useCallback(async (): Promise<void> => {
    setMutating(true)
    try {
      const updated = await rejectRfq(rfqId)
      setRfq(updated)
    } finally {
      setMutating(false)
    }
  }, [rfqId])

  return { rfq, loading, error, refetch, quote, reject, mutating }
}
