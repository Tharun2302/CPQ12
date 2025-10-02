# Microsoft Authentication Setup Guide

## Prerequisites

1. **Azure App Registration**: You need to create an Azure App Registration in the Azure Portal
2. **Client ID**: Get the Application (client) ID from your Azure App Registration

## Setup Steps

### 1. Create Azure App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to "Azure Active Directory" > "App registrations"
3. Click "New registration"
4. Fill in the details:
   - **Name**: CloudFuze CPQ Quote
   - **Supported account types**: Accounts in any organizational directory and personal Microsoft accounts
   - **Redirect URI**: `http://localhost:5173` (for development)
5. Click "Register"
6. Copy the **Application (client) ID**

### 2. Configure Redirect URIs

1. In your App Registration, go to "Authentication"
2. Add these redirect URIs:
   - `http://localhost:5173` (development)
   - `https://yourdomain.com` (production)
3. Under "Implicit grant and hybrid flows", enable:
   - Access tokens
   - ID tokens

### 3. Set Environment Variables

Create a `.env` file in your project root:

```env
# Microsoft Authentication Configuration
REACT_APP_MSAL_CLIENT_ID=your-microsoft-client-id-here

# Database Configuration (if needed)
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=root
DB_NAME=cpq_database1
DB_PORT=3306
```

### 4. Update Configuration

The Microsoft authentication is already configured in `src/config/msalConfig.ts`. You just need to:

1. Replace `your-client-id-here` with your actual Client ID
2. Update the `redirectUri` if needed

## Features Implemented

✅ **Dual Authentication Options**:
- Email/Password sign-in and sign-up
- Microsoft authentication for both sign-in and sign-up

✅ **UI Components**:
- Microsoft logo/icon on authentication buttons
- Clean divider between authentication methods
- Consistent styling with existing forms

✅ **User Management**:
- Users can sign in with either method
- User data includes authentication provider
- Seamless integration with existing user system

## Testing

1. Start your development server: `npm run dev`
2. Navigate to `/signin` or `/signup`
3. Try both authentication methods:
   - Email/password (existing demo accounts work)
   - Microsoft authentication (requires Azure setup)

## Troubleshooting

- **Microsoft login not working**: Check your Client ID and redirect URI configuration
- **Popup blocked**: Ensure popups are allowed for localhost
- **CORS errors**: Verify your redirect URI matches exactly

## Production Deployment

For production, make sure to:
1. Update redirect URIs in Azure App Registration
2. Use HTTPS redirect URIs
3. Update environment variables with production values
