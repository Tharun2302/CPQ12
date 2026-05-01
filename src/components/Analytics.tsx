import React, { useEffect, useState } from 'react';
import { TrendingUp, Users, DollarSign, FileText, Star, MessageCircle, RefreshCw } from 'lucide-react';

interface ChatQuestion {
  question: string;
  count: number;
  lastAsked: string;
}

interface ChatLog {
  _id: string;
  question: string;
  timestamp: string;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const Analytics: React.FC = () => {
  const [chatQuestions, setChatQuestions] = useState<ChatQuestion[]>([]);
  const [totalChatQuestions, setTotalChatQuestions] = useState(0);
  const [chatLoading, setChatLoading] = useState(true);
  const [chatLogs, setChatLogs] = useState<ChatLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsLoading, setLogsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'top' | 'logs'>('top');

  const fetchChatAnalytics = async () => {
    setChatLoading(true);
    try {
      const res = await fetch(`${API_URL}/chat/analytics?limit=15`);
      const data = await res.json();
      if (data.success) {
        setChatQuestions(data.data.topQuestions);
        setTotalChatQuestions(data.data.totalQuestions);
      }
    } catch {
      // silently fail
    } finally {
      setChatLoading(false);
    }
  };

  const fetchChatLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await fetch(`${API_URL}/chat/logs?limit=100`);
      const data = await res.json();
      if (data.success) {
        setChatLogs(data.data.logs);
        setLogsTotal(data.data.total);
      }
    } catch {
      // silently fail
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchChatAnalytics();
    fetchChatLogs();
  }, []);

  // Mock data for demonstration
  const stats = [
    { label: 'Total Quotes Generated', value: '156', icon: FileText, change: '+12%', color: 'blue' },
    { label: 'Average Quote Value', value: '$45,250', icon: DollarSign, change: '+8%', color: 'green' },
    { label: 'Conversion Rate', value: '68%', icon: TrendingUp, change: '+5%', color: 'purple' },
    { label: 'Active Clients', value: '89', icon: Users, change: '+15%', color: 'orange' },
  ];

  const recentQuotes = [
    { id: 'Q-001234', client: 'Tech Corp', amount: '$52,000', status: 'Accepted', tier: 'Standard' },
    { id: 'Q-001235', client: 'Digital Solutions', amount: '$78,500', status: 'Pending', tier: 'Advanced' },
    { id: 'Q-001236', client: 'StartUp Inc', amount: '$28,000', status: 'Viewed', tier: 'Basic' },
    { id: 'Q-001237', client: 'Enterprise Ltd', amount: '$125,000', status: 'Accepted', tier: 'Advanced' },
    { id: 'Q-001238', client: 'Mid Corp', amount: '$41,200', status: 'Sent', tier: 'Standard' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Accepted': return 'text-green-700 bg-green-100';
      case 'Pending': return 'text-yellow-700 bg-yellow-100';
      case 'Viewed': return 'text-blue-700 bg-blue-100';
      case 'Sent': return 'text-gray-700 bg-gray-100';
      default: return 'text-gray-700 bg-gray-100';
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'Basic': return 'text-blue-700 bg-blue-100';
      case 'Standard': return 'text-purple-700 bg-purple-100';
      case 'Advanced': return 'text-orange-700 bg-orange-100';
      default: return 'text-gray-700 bg-gray-100';
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Analytics Dashboard</h2>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div key={index} className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-xl">
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                    stat.color === 'blue' ? 'bg-blue-100 text-blue-600' :
                    stat.color === 'green' ? 'bg-green-100 text-green-600' :
                    stat.color === 'purple' ? 'bg-purple-100 text-purple-600' :
                    'bg-orange-100 text-orange-600'
                  }`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className={`text-sm font-medium px-2 py-1 rounded ${
                    stat.change.startsWith('+') ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'
                  }`}>
                    {stat.change}
                  </span>
                </div>
                <div className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</div>
                <div className="text-sm text-gray-600">{stat.label}</div>
              </div>
            );
          })}
        </div>

        {/* Recent Quotes Table */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Quotes</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Quote ID</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Client</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Amount</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Tier</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentQuotes.map((quote, index) => (
                  <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-4 font-mono text-sm">{quote.id}</td>
                    <td className="py-4 px-4 font-medium">{quote.client}</td>
                    <td className="py-4 px-4 font-semibold text-green-600">{quote.amount}</td>
                    <td className="py-4 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTierColor(quote.tier)}`}>
                        {quote.tier}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(quote.status)}`}>
                        {quote.status}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Popular Plans */}
      <div className="bg-white rounded-xl shadow-lg p-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Popular Plans</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-5 h-5 text-yellow-500" />
              <span className="font-semibold">Standard Plan</span>
            </div>
            <div className="text-2xl font-bold text-blue-600 mb-1">45%</div>
            <div className="text-sm text-gray-600">of all quotes</div>
          </div>
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-5 h-5 text-blue-500" />
              <span className="font-semibold">Basic Plan</span>
            </div>
            <div className="text-2xl font-bold text-blue-600 mb-1">35%</div>
            <div className="text-sm text-gray-600">of all quotes</div>
          </div>
          <div className="p-4 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-5 h-5 text-purple-500" />
              <span className="font-semibold">Advanced Plan</span>
            </div>
            <div className="text-2xl font-bold text-blue-600 mb-1">20%</div>
            <div className="text-sm text-gray-600">of all quotes</div>
          </div>
        </div>
      </div>

      {/* CPQ Assistant — Question Logs */}
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">CPQ Assistant — User Questions</h3>
              <p className="text-sm text-gray-500">{totalChatQuestions} total questions asked</p>
            </div>
          </div>
          <button
            onClick={() => { fetchChatAnalytics(); fetchChatLogs(); }}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('top')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'top' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Most Asked
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'logs' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            All Logs ({logsTotal})
          </button>
        </div>

        {/* Most Asked Tab */}
        {activeTab === 'top' && (
          chatLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />Loading...
            </div>
          ) : chatQuestions.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No questions asked yet. Questions will appear here once users start chatting.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">#</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Question</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">Times Asked</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Last Asked</th>
                  </tr>
                </thead>
                <tbody>
                  {chatQuestions.map((q, index) => (
                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 text-sm text-gray-400 font-medium">{index + 1}</td>
                      <td className="py-3 px-4 text-sm text-gray-800">{q.question}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          q.count >= 5 ? 'bg-blue-100 text-blue-700' :
                          q.count >= 3 ? 'bg-purple-100 text-purple-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {q.count}×
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500">
                        {new Date(q.lastAsked).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* All Logs Tab */}
        {activeTab === 'logs' && (
          logsLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />Loading...
            </div>
          ) : chatLogs.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No logs yet. Questions will appear here once users start chatting.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">#</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Question</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Asked At</th>
                  </tr>
                </thead>
                <tbody>
                  {chatLogs.map((log, index) => (
                    <tr key={log._id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 text-sm text-gray-400">{index + 1}</td>
                      <td className="py-3 px-4 text-sm text-gray-800">{log.question}</td>
                      <td className="py-3 px-4 text-sm text-gray-500 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

      </div>
    </div>
  );
};

export default Analytics;
