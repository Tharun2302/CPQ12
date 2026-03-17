import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, X, Send, Loader2, RotateCcw } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { BACKEND_URL } from '../config/api';

interface ChatMessage {
  id: string;
  role: 'user' | 'bot';
  text: string;
  links?: { label: string; path: string }[];
  topics?: { label: string; query: string }[];
  timestamp: Date;
}

export default function InternalChatBot() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const initialMessage: ChatMessage = {
    id: 'welcome',
    role: 'bot',
    text: 'I can help with:',
    topics: [
      { label: 'Login', query: 'topic:login' },
      { label: 'E-signature', query: 'topic:esign' }
    ],
    timestamp: new Date(),
  };

  const [messages, setMessages] = useState<ChatMessage[]>(() => [initialMessage]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const token = localStorage.getItem('cpq_token');
      const res = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token && token !== 'hubspot_auth_token' ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();

      const replyText = data.reply ?? (data.error || "I couldn't process that. Try **help** for options.");
      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: 'bot',
        text: replyText,
        links: data.links,
        topics: data.topics,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (e) {
      const errMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        role: 'bot',
        text: 'Connection error. Make sure the backend is running and try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearAndStartOver = () => {
    setMessages([{ ...initialMessage, timestamp: new Date() }]);
    setInput('');
  };

  const onTopicSelect = (query: string) => {
    setTimeout(() => {
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        text: query,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setLoading(true);
      fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(localStorage.getItem('cpq_token') && localStorage.getItem('cpq_token') !== 'hubspot_auth_token' ? { Authorization: `Bearer ${localStorage.getItem('cpq_token')}` } : {}) },
        body: JSON.stringify({ message: query }),
      })
        .then((res) => res.json())
        .then((data) => {
          const replyText = data.reply ?? (data.error || "I couldn't process that.");
          setMessages((prev) => [
            ...prev,
            { id: `bot-${Date.now()}`, role: 'bot', text: replyText, links: data.links, topics: data.topics, timestamp: new Date() },
          ]);
        })
        .catch(() => {
          setMessages((prev) => [
            ...prev,
            { id: `bot-${Date.now()}`, role: 'bot', text: 'Connection error. Please try again.', timestamp: new Date() },
          ]);
        })
        .finally(() => setLoading(false));
    }, 0);
  };

  if (!isAuthenticated) return null;

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-[100] flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
        aria-label={open ? 'Close chat' : 'Open chat'}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-[99] flex h-[420px] w-[380px] flex-col rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-blue-600" />
              <span className="font-semibold text-gray-800">CPQ Assistant</span>
            </div>
            <button
              type="button"
              onClick={clearAndStartOver}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300"
              title="Clear chat and start over"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Start over
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  {msg.topics && msg.topics.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {msg.topics.map((t, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => onTopicSelect(t.query)}
                          className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {msg.links && msg.links.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {msg.links.map((link, i) => (
                        <Link
                          key={i}
                          to={link.path}
                          className="text-blue-600 underline hover:no-underline"
                          onClick={() => setOpen(false)}
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-gray-100 px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-gray-100 p-2">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about quotes, drafts, e-sign..."
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="rounded-lg bg-blue-600 px-3 py-2 text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
