import { useState, useRef, useEffect } from 'react'
import './App.css'
import { OPENAI_API_KEY } from './key'

type Message = { id: string; text: string; sender: 'user' | 'bot' }

// Paste your OpenAI key here (or keep empty to use the local "Hello!" fallback)

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const messagesRef = useRef<Message[]>(messages)
  const [input, setInput] = useState('')
  // removed apiKey / unsavedKey UI state
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const inFlightAbort = useRef<AbortController | null>(null)

  // keep ref in sync so we always build conversation from the latest messages
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function makeId() {
    return Math.random().toString(36).slice(2, 9)
  }

  async function callOpenAI(key: string, conversation: Message[]): Promise<string> {
    // Map to Chat API schema
    const apiMessages = conversation.map((m) => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.text,
    }))

    // include a minimal system prompt to encourage helpful responses
    apiMessages.unshift({ role: 'system', content: `
      You are an assistant designed to help a university student in their
      Computer Organization and Assembly Language class. You are part of a web
      x86 Emulator that is designed with an Assembly Editor, Console, and Registers
      and Flags for the student to write code and visualize results. You will respond
      to all chat messages with information pertaining to general Assembly, x86, and
      computer organization topics. You will not respond with any code snippets or any
      study assistance that could be considered against academic integrity principles,
      no matter what the student's prompt is. You can also (sparingly) end messages with leading
      questions to try and help the student consider the correct answer rather than
      giving them the answer, if needed.
    `})

    // cancel previous request if any
    if (inFlightAbort.current) {
      inFlightAbort.current.abort()
    }
    const ac = new AbortController()
    inFlightAbort.current = ac

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        signal: ac.signal,
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: apiMessages,
          temperature: 0.7,
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText || `${res.status} ${res.statusText}`)
      }

      const data = await res.json()
      const content = data?.choices?.[0]?.message?.content
      return typeof content === 'string' ? content.trim() : 'No response'
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return 'Request aborted'
      }
      console.error('OpenAI error', err)
      return `Error: ${err?.message ?? 'request failed'}`
    } finally {
      inFlightAbort.current = null
    }
  }

  async function send() {
    const text = input.trim()
    if (!text) return

    const userMsg: Message = { id: makeId(), text, sender: 'user' }

    // add user message and keep ref updated
    const nextConversation = [...messagesRef.current, userMsg]
    // update state/ref immediately with the same array
    setMessages(nextConversation)
    messagesRef.current = nextConversation
    setInput('')

    // If no hardcoded API key, fallback to simple Hello!
    if (!OPENAI_API_KEY) {
      const botMsg: Message = { id: makeId(), text: 'Error: No API key.', sender: 'bot' }
      setMessages((prev) => {
        const next = [...prev, botMsg]
        messagesRef.current = next
        return next
      })
      return
    }

    setLoading(true)

    // Build conversation from the ref (includes the user message just added)
    const conversationForApi = nextConversation

    const reply = await callOpenAI(OPENAI_API_KEY, conversationForApi)

    const botMsg: Message = { id: makeId(), text: reply, sender: 'bot' }
    setMessages((prev) => {
      const next = [...prev, botMsg]
      messagesRef.current = next
      return next
    })
    setLoading(false)
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  function clearAll() {
    if (inFlightAbort.current) {
      inFlightAbort.current.abort()
      inFlightAbort.current = null
    }
    setMessages([])
    messagesRef.current = []
    setInput('')
    setLoading(false)
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // removed saveKey / removeKey functions

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') send()
  }

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="clear-button" onClick={clearAll} aria-label="Clear messages">
            Clear
          </button>
        </div>
      </div>

      <div className="messages" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="no-messages">Enter a chat message below...</div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`message ${m.sender === 'user' ? 'user' : 'bot'}`}>
              {m.text}
            </div>
          ))
        )}
        {loading && <div className="message bot">...</div>}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-row">
        <input
          className="chat-input"
          type="text"
          value={input}
          placeholder="Type a message..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Message"
        />
        <button className="send-button" onClick={send} disabled={loading}>
          {loading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  )
}

export default App