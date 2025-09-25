# HubSpot Authentication Integration

## 🎯 Overview

This integration allows users coming from HubSpot to automatically bypass the sign-in process and access the CPQ application directly. Users accessing the application directly (not from HubSpot) will still need to sign in normally.

## 🔧 How It Works

### 1. **URL Parameter Detection**
The system detects HubSpot users through:
- URL parameters: `?hubspot=true`
- HubSpot-specific parameters: `hs_contact_id`, `hs_deal_id`, etc.
- Referrer detection: URLs containing "hubspot"

### 2. **Automatic Authentication**
When a HubSpot user is detected:
- ✅ **No sign-in required** - User is automatically authenticated
- ✅ **User data extracted** from URL parameters and HubSpot API
- ✅ **Redirected to dashboard** immediately
- ✅ **HubSpot data stored** for use in quotes

### 3. **Data Flow**
```
HubSpot Deal → Custom Action Button → Your App URL → Auto Auth → Dashboard
```

## 🚀 Setup Instructions

### Step 1: Configure HubSpot Custom Action

In your HubSpot deal, add a custom action button with this URL pattern:

```
https://yourdomain.com?hubspot=true&hs_contact_id={{contact.id}}&hs_deal_id={{deal.id}}&hs_company={{contact.company}}&hs_contact_name={{contact.firstname}} {{contact.lastname}}&hs_contact_email={{contact.email}}&hs_deal_amount={{deal.amount}}
```

### Step 2: Test the Integration

1. **Go to Debug Page**: Visit `/debug-env` in your app
2. **Use Test Helper**: Configure test parameters and generate test URLs
3. **Test URL**: Click "Test URL" to simulate HubSpot access
4. **Verify**: Check that you're automatically logged in

### Step 3: Backend Configuration

Ensure your `.env` file has:
```env
HUBSPOT_API_KEY=your_hubspot_api_key
VITE_BACKEND_URL=http://localhost:3001
```

## 📊 Supported URL Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `hubspot` | Indicates source is HubSpot | `hubspot=true` |
| `hs_contact_id` | HubSpot contact ID | `12345` |
| `hs_deal_id` | HubSpot deal ID | `67890` |
| `hs_company` | Company name | `Acme Corp` |
| `hs_contact_name` | Contact full name | `John Smith` |
| `hs_contact_email` | Contact email | `john@acme.com` |
| `hs_deal_amount` | Deal amount | `50000` |
| `hs_deal_stage` | Deal stage | `qualified` |

## 🔍 Detection Logic

The system detects HubSpot users through multiple methods:

```typescript
const isFromHubspot = urlParams.has('hubspot') || 
                     urlParams.has('hs_deal_id') || 
                     urlParams.has('hs_contact_id') ||
                     location.search.includes('hubspot') ||
                     document.referrer.includes('hubspot');
```

## 🎨 User Experience

### HubSpot Users:
1. **Click button in HubSpot** → Opens your app
2. **See loading screen** → "Connecting from HubSpot..."
3. **Auto-authenticated** → No sign-in required
4. **Redirected to dashboard** → Ready to create quotes

### Direct Users:
1. **Visit your domain** → Normal landing page
2. **Click "Sign In"** → Standard authentication
3. **Enter credentials** → Email/password or Microsoft
4. **Access dashboard** → Full functionality

## 🛠️ Technical Implementation

### Frontend Components:
- `HubSpotAuthHandler.tsx` - Main authentication logic
- `HubSpotTestHelper.tsx` - Testing and debugging tool
- Updated `App.tsx` - Integrated authentication flow

### Backend Endpoints:
- `GET /api/hubspot/contacts/:contactId` - Fetch contact details
- `GET /api/hubspot/deals/:dealId` - Fetch deal details

### Data Storage:
```typescript
// User object for HubSpot users
{
  id: "hubspot_12345",
  name: "John Smith",
  email: "john@acme.com",
  provider: "hubspot",
  hubspotData: {
    contactId: "12345",
    dealId: "67890",
    companyName: "Acme Corp",
    dealAmount: "50000",
    source: "hubspot"
  }
}
```

## 🧪 Testing

### Manual Testing:
1. Go to `/debug-env`
2. Use the HubSpot Test Helper
3. Generate test URLs with different parameters
4. Verify automatic authentication works

### Real HubSpot Testing:
1. Create a test deal in HubSpot
2. Add custom action button with your app URL
3. Click the button from HubSpot
4. Verify seamless authentication

## 🔒 Security Considerations

- **URL Parameters**: Sensitive data should be minimal in URLs
- **API Keys**: Store securely in environment variables
- **Validation**: Validate all incoming HubSpot data
- **Fallback**: Graceful fallback to normal auth if HubSpot fails

## 🚨 Troubleshooting

### Common Issues:

1. **"Not detecting HubSpot"**
   - Check URL parameters are correct
   - Verify `hubspot=true` is in URL
   - Check browser console for debug logs

2. **"API errors"**
   - Verify `HUBSPOT_API_KEY` is set
   - Check backend server is running
   - Review API rate limits

3. **"Authentication fails"**
   - Check URL parameter format
   - Verify required data is present
   - Review error messages in console

### Debug Steps:
1. Open browser console
2. Look for "🔍 HubSpot authentication detected" message
3. Check extracted data in console logs
4. Verify API calls are successful

## 📈 Benefits

- **Seamless UX**: No sign-in friction for HubSpot users
- **Data Pre-population**: Contact/deal data automatically available
- **Increased Conversion**: Easier path from HubSpot to quotes
- **Better Tracking**: Clear source attribution for analytics

## 🔄 Future Enhancements

- **Single Sign-On (SSO)**: Deeper HubSpot integration
- **Custom Fields**: Support for custom HubSpot properties
- **Analytics**: Track HubSpot conversion rates
- **Webhooks**: Real-time data synchronization
