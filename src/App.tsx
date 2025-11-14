import { useState, useRef, useEffect } from 'react'
import './App.css'
import { OPENAI_API_KEY } from './key'

type Message = { id: string; text: string; sender: 'user' | 'bot' }

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const messagesRef = useRef<Message[]>(messages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const inFlightAbort = useRef<AbortController | null>(null)
  const [activeTab, setActiveTab] = useState<'chat' | 'class'>('chat')

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
    const apiMessages = conversation.map((m) => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.text,
    }))

    apiMessages.unshift({
      role: 'system',
      content: `
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
    `,
    })

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

    const nextConversation = [...messagesRef.current, userMsg]
    setMessages(nextConversation)
    messagesRef.current = nextConversation
    setInput('')

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

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') send()
  }

  // placeholder faqs
  type Section = 'background' | 'instructions' | 'emulator'
  const [classSection, setClassSection] = useState<Section>('background')

  type FAQ = { q: string; a: string; showMe?: boolean }
  const faqsBySection: Record<Section, FAQ[]> = {
    background: [
      {
        q: 'What is assembly language?',
        a: 'Assembly language is a low-level programming language that maps closely to machine code instructions for a CPU.',
      },
      {
        q: 'Why learn computer organization?',
        a: 'Understanding computer organization helps you reason about performance, debugging, and how high-level code maps to hardware behavior.',
      },
    ],
    instructions: [
      {
        q: 'How do I run a program in the emulator?',
        a: 'Open the editor, assemble the code, then use the Run controls in the emulator panel. Watch the Console for output and the Registers panel for changes.',
        showMe: true,
      },
      {
        q: 'How do I step through instructions?',
        a: 'Use Step / Next controls in the emulator. Each instruction will update registers and memory—observe the changes after each step.',
        showMe: true,
      },
      {
        q: 'How do I format assembly for the editor?',
        a: 'Use standard x86 mnemonics and comments. Keep labels on their own line and align operands for readability.',
      },
    ],
    emulator: [
      {
        q: 'What are some examples of x86 instructions?',
        a: 'Some instructions move data such as ADD, SUB (subtract), and MOV (move), and some tell the machine how to navigate like JMP (jump), CALL, and etc.',
        showMe: true,
      },
      {
        q: 'What does the Registers panel show?',
        a: 'Registers show current CPU register values (e.g., EAX, EBX) and flags—useful for tracking program state.',
      },
      {
        q: 'How is memory represented?',
        a: 'Memory is displayed as a linear address space; you can inspect addresses, watch variables, and see stack frames during execution.',
      },
    ],
  }

  return (
    <div>
      <div className="tabs" role="tablist" aria-label="Chat and Class tabs">
        <button
          className={`tab ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
          role="tab"
          aria-selected={activeTab === 'chat'}
        >
          Chat
        </button>
        <button
          className={`tab ${activeTab === 'class' ? 'active' : ''}`}
          onClick={() => setActiveTab('class')}
          role="tab"
          aria-selected={activeTab === 'class'}
        >
          Class
        </button>
      </div>

      {activeTab === 'chat' ? (
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
      ) : (
        <div className="chat-container">
          <h2 style={{ textAlign: 'left' }}>Class</h2>

          <nav className="class-nav" aria-label="Class sections">
            <button
              className={classSection === 'background' ? 'active' : ''}
              onClick={() => setClassSection('background')}
            >
              Background
            </button>
            <button
              className={classSection === 'instructions' ? 'active' : ''}
              onClick={() => setClassSection('instructions')}
            >
              Instructions
            </button>
            <button
              className={classSection === 'emulator' ? 'active' : ''}
              onClick={() => setClassSection('emulator')}
            >
              Emulator
            </button>
          </nav>

          <div className="messages class-section" role="region" aria-live="polite">
            {faqsBySection[classSection].map((f, i) => (
              <div key={i} className="faq-row" style={{ textAlign: 'left', padding: '0.5rem 0' }}>
                <div style={{ flex: 1 }}>
                  <strong>{f.q}</strong>
                  <div style={{ marginTop: 4 }}>{f.a}</div>
                </div>
                {f.showMe && (
                  <button
                    className="showme-button"
                    onClick={() => {
                      /* placeholder */
                    }}
                    aria-label={`Show me: ${f.q}`}
                  >
                    Show Me
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default App