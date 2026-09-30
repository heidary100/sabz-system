import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AddTrackingEventInput,
  AdminOrderDetailDto,
  AdminOrderTransition,
  UpdateShipmentInput,
} from '@sabz/types'
import { addTrackingEvent, getOrder, transitionOrder, updateShipment } from '../services/orders'

export function useOrderDetail(orderId: string) {
  const [order, setOrder] = useState<AdminOrderDetailDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [transitioning, setTransitioning] = useState(false)
  const [mutating, setMutating] = useState(false)
  const requestSeq = useRef(0)

  const refetch = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await getOrder(orderId)
      if (seq === requestSeq.current) {
        setOrder(data)
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setError(error)
        setOrder(null)
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [orderId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const transition = useCallback(
    async (next: AdminOrderTransition): Promise<void> => {
      setTransitioning(true)
      try {
        const updated = await transitionOrder(orderId, next)
        setOrder(updated)
      } finally {
        setTransitioning(false)
      }
    },
    [orderId],
  )

  const saveShipment = useCallback(
    async (input: UpdateShipmentInput): Promise<void> => {
      setMutating(true)
      try {
        const updated = await updateShipment(orderId, input)
        setOrder(updated)
      } finally {
        setMutating(false)
      }
    },
    [orderId],
  )

  const appendTrackingEvent = useCallback(
    async (input: AddTrackingEventInput): Promise<void> => {
      setMutating(true)
      try {
        const updated = await addTrackingEvent(orderId, input)
        setOrder(updated)
      } finally {
        setMutating(false)
      }
    },
    [orderId],
  )

  return { order, loading, error, refetch, transition, transitioning, saveShipment, appendTrackingEvent, mutating }
}
