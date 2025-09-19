import React from 'react';
import { TrendingUp, Users, DollarSign, FileText, Star } from 'lucide-react';

const Analytics: React.FC = () => {
  // Mock data for demonstration
  const stats = [
    {
      label: 'Total Quotes Generated',
      value: '156',
      icon: FileText,
      change: '+12%',
      color: 'blue'
    },
    {
      label: 'Average Quote Value',
      value: '$45,250',
      icon: DollarSign,
      change: '+8%',
      color: 'green'
    },
    {
      label: 'Conversion Rate',
      value: '68%',
      icon: TrendingUp,
      change: '+5%',
      color: 'purple'
    },
    {
      label: 'Active Clients',
      value: '89',
      icon: Users,
      change: '+15%',
      color: 'orange'
    }
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
    </div>
  );
};

export default Analytics;