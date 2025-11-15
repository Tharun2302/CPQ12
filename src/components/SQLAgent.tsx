import React, { useState, useRef, useEffect } from 'react';
import { BACKEND_URL } from '../config/api';
import { MessageCircle, Send, Database, Loader2, CheckCircle, XCircle, Code, Info } from 'lucide-react';

interface QueryResult {
  success: boolean;
  query?: string;
  sql?: string;
  description?: string;
  method?: string;
  results?: any[];
  rowCount?: number;
  error?: string;
}

interface Message {
  id: string;
  type: 'user' | 'assistant' | 'error';
  content: string;
  sql?: string;
  results?: any[];
  rowCount?: number;
  timestamp: Date;
}

const SQLAgent: React.FC = () => {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [schemaInfo, setSchemaInfo] = useState<any>(null);
  const [showSchema, setShowSchema] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Example queries
  const exampleQueries = [
    'How many deals done?',
    'Show me all client names',
    'List all templates',
    'What is the approval status?',
    'How many pending approvals?',
    'Show client serials'
  ];

  // Load schema info on mount
  useEffect(() => {
    loadSchemaInfo();
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadSchemaInfo = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/sql-agent/schema`);
      const data = await response.json();
      if (data.success) {
        setSchemaInfo(data);
      }
    } catch (error) {
      console.error('Failed to load schema info:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!query.trim() || isLoading) return;

    const userQuery = query.trim();
    setQuery('');
    
    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: userQuery,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/api/sql-agent/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: userQuery }),
      });

      const result: QueryResult = await response.json();

      if (result.success) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: result.description || 'Query executed successfully',
          sql: result.sql,
          results: result.results,
          rowCount: result.rowCount,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'error',
          content: result.error || 'Failed to process query',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    } catch (error: any) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'error',
        content: error.message || 'Failed to connect to server',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleExampleClick = (exampleQuery: string) => {
    setQuery(exampleQuery);
    inputRef.current?.focus();
  };

  const formatResults = (results: any[]) => {
    if (!results || results.length === 0) {
      return <div className="text-gray-500 italic">No results found</div>;
    }

    // Get all unique keys from results
    const keys = Object.keys(results[0] || {});
    
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {keys.map((key) => (
                <th
                  key={key}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                >
                  {key.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {results.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                {keys.map((key) => (
                  <td
                    key={key}
                    className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100"
                  >
                    {typeof row[key] === 'object' 
                      ? JSON.stringify(row[key]) 
                      : String(row[key] || '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <Database className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                SQL Agent
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Ask questions about your data in natural language
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowSchema(!showSchema)}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-2"
          >
            <Info className="w-4 h-4" />
            <span>Schema Info</span>
          </button>
        </div>
      </div>

      {/* Schema Info Panel */}
      {showSchema && schemaInfo && (
        <div className="border-b border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800 max-h-64 overflow-y-auto">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Available Query Patterns:</h3>
          <div className="flex flex-wrap gap-2">
            {schemaInfo.availableQueries?.map((q: any, idx: number) => (
              <span
                key={idx}
                className="px-3 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full"
              >
                {q.pattern}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <MessageCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Start asking questions
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Try asking about deals, clients, templates, or approval status
            </p>
            
            {/* Example Queries */}
            <div className="max-w-2xl mx-auto">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Example queries:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {exampleQueries.map((example, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleExampleClick(example)}
                    className="px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-3xl rounded-lg p-4 ${
                message.type === 'user'
                  ? 'bg-blue-600 text-white'
                  : message.type === 'error'
                  ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
              }`}
            >
              <div className="flex items-start space-x-2">
                {message.type === 'assistant' && (
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                )}
                {message.type === 'error' && (
                  <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="font-medium mb-1">{message.content}</p>
                  
                  {message.sql && (
                    <div className="mt-2 p-2 bg-gray-800 dark:bg-gray-900 rounded text-xs font-mono text-green-400 overflow-x-auto">
                      <div className="flex items-center space-x-2 mb-1">
                        <Code className="w-3 h-3" />
                        <span className="text-gray-400">SQL Query:</span>
                      </div>
                      <code>{message.sql}</code>
                    </div>
                  )}

                  {message.results && message.results.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        {message.rowCount} {message.rowCount === 1 ? 'result' : 'results'}
                      </div>
                      <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
                        {formatResults(message.results)}
                      </div>
                    </div>
                  )}

                  {message.results && message.results.length === 0 && (
                    <div className="mt-2 text-sm text-gray-500 dark:text-gray-400 italic">
                      No results found
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                <span className="text-gray-700 dark:text-gray-300">Processing query...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800">
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask a question about your data..."
            className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!query.trim() || isLoading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Send className="w-5 h-5" />
                <span>Send</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SQLAgent;

