import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveWsSpecUrl } from './clientEnv';

export type StatusVariant = 'connecting' | 'connected' | 'warning' | 'error'

export type SpecSocketStatus = { message: string; variant: StatusVariant }

export type StreamCallbacks = {
  onChunk: (text: string) => void
  /** Called when the first message includes a `chunk` field (SidebarSocket blur reveal). */
  onFirstStreamChunk?: () => void
}

function describeClose(ev: CloseEvent): string {
  const code = ev.code
  const reason = ev.reason?.trim() ? ev.reason : 'no reason'
  if (code === 1006) {
    return (
      'Connection failed (code 1006). Often: tunnel down, wrong URL, or mixed content — ' +
      'use https:// in Script Properties BACKEND_BASE_URL so the socket uses wss://.'
    )
  }
  return `WebSocket closed (code ${code} · ${reason}).`
}

/**
 * Mirrors appscript SidebarSocket.html: streaming chunks, pending promises, status line.
 */
export function useSpecSocket(wsUrl: string) {
  const [status, setStatus] = useState<SpecSocketStatus>({
    message: 'Connecting...',
    variant: 'connecting',
  })

  const socketRef = useRef<WebSocket | null>(null)
  const pendingRef = useRef<Array<{ resolve: (v: string) => void; reject: (e: Error) => void }>>([])
  const hadConnectedRef = useRef(false)
  const streamCallbacksRef = useRef<StreamCallbacks | null>(null)
  const seenFirstChunkRef = useRef(false)

  useEffect(() => {
    const url = (wsUrl || '').trim() || resolveWsSpecUrl()
    if (!url) {
      setStatus({
        message: 'Missing WebSocket URL (check BACKEND_BASE_URL / deploy).',
        variant: 'error',
      })
      return
    }

    hadConnectedRef.current = false
    setStatus({ message: 'Connecting...', variant: 'connecting' })

    const socket = new WebSocket(url)
    socketRef.current = socket

    socket.onmessage = (event) => {
      let chunk = ''
      let isComplete = false
      let hadChunkField = false
      try {
        const parsed = JSON.parse(event.data as string) as Record<string, unknown>
        
        if (parsed && typeof parsed === 'object') {
          if ('chunk' in parsed) {
            hadChunkField = true
            chunk = String(parsed.chunk ?? '')
          } else if ('text' in parsed) {
            chunk = String(parsed.text ?? '')
          } else if ('response' in parsed) {
            chunk = String(parsed.response ?? '')
          } else if ('error' in parsed) {
            const failed = pendingRef.current.shift()
            failed?.reject(new Error(`${parsed.error}`))
            return;
          }
          isComplete = parsed.complete === true
        }
      } catch (err) {
        const failed = pendingRef.current.shift()
        if (failed) {
          failed.reject(err instanceof Error ? err : new Error(String(err)))
        }
        return
      }

      const pending = pendingRef.current[0]
      const cb = streamCallbacksRef.current
      if (hadChunkField && !seenFirstChunkRef.current) {
        seenFirstChunkRef.current = true
        cb?.onFirstStreamChunk?.()
      }
      if (pending && chunk.trim() !== '') {
        if (cb) cb.onChunk(chunk)
        if (isComplete) {
          pendingRef.current.shift()
          pending.resolve(chunk)
        }
      }
    }

    socket.onopen = () => {
      hadConnectedRef.current = true
      setStatus({ message: 'Connected', variant: 'connected' })
    }

    socket.onerror = () => {
      while (pendingRef.current.length > 0) {
        const p = pendingRef.current.shift()
        if (p) p.reject(new Error('WebSocket connection error'))
      }
    }

    socket.onclose = (ev) => {
      while (pendingRef.current.length > 0) {
        const p = pendingRef.current.shift()
        if (p) p.reject(new Error('WebSocket connection closed'))
      }
      if (hadConnectedRef.current) {
        setStatus({ message: 'Disconnected', variant: 'warning' })
      } else {
        setStatus({ message: describeClose(ev), variant: 'error' })
      }
    }

    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [wsUrl])

  const sendGenerateSpecOverSocket = useCallback(
    (
      type: 'techspec' | 'testcase',
      ticket: string,
      userId: string,
      sessionId: string,
      stream: StreamCallbacks
    ): Promise<string> => {
      return new Promise((resolve, reject) => {
        const socket = socketRef.current
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          reject(new Error('WebSocket is not connected'))
          return
        }
        streamCallbacksRef.current = stream
        seenFirstChunkRef.current = false
        pendingRef.current.push({ resolve, reject })
        socket.send(JSON.stringify({ type, ticket, user_id: userId, session_id: sessionId }))
      })
    },
    []
  )

  const setStatusMessage = useCallback((message: string, variant: StatusVariant) => {
    setStatus({ message, variant })
  }, [])

  return {
    status,
    setStatusMessage,
    sendGenerateSpecOverSocket,
  }
}
