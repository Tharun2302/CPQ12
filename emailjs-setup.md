# EmailJS Setup Instructions

## Step 1: Create EmailJS Account

1. Go to [EmailJS.com](https://www.emailjs.com/)
2. Sign up for a free account
3. Verify your email address

## Step 2: Add Email Service

1. In EmailJS dashboard, go to **Email Services**
2. Click **Add New Service**
3. Choose **Gmail** (or your preferred email provider)
4. Connect your Gmail account
5. Note down your **Service ID** (starts with `service_`)

## Step 3: Create Email Template

1. Go to **Email Templates**
2. Click **Create New Template**
3. Use this template content:

### Template Subject:
```
{{subject}}
```

### Template Content:
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{subject}}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #3B82F6, #1E40AF); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1>🔔 Approval Required</h1>
            <p>{{from_name}}</p>
        </div>
        
        <div style="background: white; padding: 30px; border: 1px solid #E5E7EB;">
            <h2>Hello,</h2>
            
            <p>A new document requires your approval:</p>
            
            <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3>📄 Document Details</h3>
                <p><strong>Subject:</strong> {{subject}}</p>
                <p><strong>Message:</strong></p>
                <div style="white-space: pre-line;">{{message}}</div>
            </div>
            
            <p>Please review and take appropriate action.</p>
        </div>
        
        <div style="background: #F9FAFB; padding: 20px; text-align: center; border-radius: 0 0 10px 10px;">
            <p>This is an automated message from your approval system.</p>
            <p>If you have any questions, please contact your system administrator.</p>
        </div>
    </div>
</body>
</html>
```

4. Note down your **Template ID** (starts with `template_`)

## Step 4: Get Public Key

1. Go to **Account** → **General**
2. Find your **Public Key** (starts with `user_`)
3. Copy this key

## Step 5: Update Email Service

Open `src/utils/emailService.ts` and replace the placeholder values:

```typescript
this.serviceId = 'service_your_service_id'; // Replace with your actual Service ID
this.templateId = 'template_your_template_id'; // Replace with your actual Template ID
this.publicKey = 'your_public_key'; // Replace with your actual Public Key
```

## Step 6: Test Email Sending

1. Start an approval workflow
2. Check the console for EmailJS success messages
3. Check your Gmail inbox for the approval emails

## Troubleshooting

- **"EmailJS not configured"**: Make sure you've replaced all placeholder values
- **"Invalid template"**: Check your template ID is correct
- **"Service not found"**: Verify your service ID is correct
- **"Authentication failed"**: Check your public key is correct

## Free Tier Limits

- 200 emails per month
- 2 email services
- 2 email templates
- Perfect for development and testing

## Security Notes

- Never commit your EmailJS credentials to version control
- Use environment variables in production
- Consider upgrading to paid plan for production use
