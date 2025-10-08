# Gmail SMTP Setup Instructions

## Step 1: Generate Gmail App Password

1. Go to [Google Account Settings](https://myaccount.google.com/)
2. Click on **Security** in the left sidebar
3. Under "Signing in to Google", click **2-Step Verification** (enable it if not already)
4. Scroll down to **App passwords**
5. Click **App passwords**
6. Select **Mail** as the app
7. Select **Other** as the device and name it "Approval System"
8. Click **Generate**
9. Copy the 16-character password (it will look like: `abcd efgh ijkl mnop`)

## Step 2: Update Email Service

Open `src/utils/emailService.ts` and replace line 32:

```typescript
pass: 'your-app-password' // Replace with your actual 16-character app password
```

With your actual app password:

```typescript
pass: 'abcd efgh ijkl mnop' // Your actual app password without spaces
```

## Step 3: Test Email Sending

1. Start an approval workflow
2. Check the console for email logs
3. Check your Gmail inbox for the approval emails

## Troubleshooting

- **"Invalid login"**: Make sure you're using the App Password, not your regular Gmail password
- **"Less secure app access"**: Use App Passwords instead of enabling less secure apps
- **"Authentication failed"**: Double-check the App Password is correct and has no spaces

## Security Notes

- Never commit your App Password to version control
- Use environment variables in production
- Consider using a dedicated Gmail account for the system
