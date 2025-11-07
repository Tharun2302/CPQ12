# How to Check Why CloudFuze Emails Are Bouncing

## Step 1: Check SendGrid Email Activity

1. Go to: https://app.sendgrid.com/email_activity
2. Search for recipient: `abhilasha.kandakatla@cloudfuze.com`
3. Or search by Message ID: `p9J70OoRRpWy7HmxrKOdsA`

## Step 2: Check the Status

Look for the email status and click on it for details:

### If Status is "Bounced":
- Click on the email to see bounce reason
- Common bounce reasons for corporate emails:
  - **"550 5.7.1 Sender not authorized"** → SPF/DKIM not configured
  - **"550 5.7.1 Blocked by spam filter"** → Email content flagged as spam
  - **"550 5.1.1 User unknown"** → Email address doesn't exist
  - **"554 Message rejected"** → CloudFuze server blocking SendGrid

### If Status is "Delivered":
- Email WAS delivered successfully
- Ask recipient to check:
  - Spam/Junk folder
  - Quarantine folder
  - Email rules/filters
  - Blocked senders

### If Status is "Dropped":
- SendGrid dropped it before sending
- Reasons:
  - Previous bounces from this address
  - Email in suppression list
  - Invalid email format

### If Status is "Deferred":
- CloudFuze server is temporarily rejecting
- SendGrid will retry automatically
- Usually delivers within a few hours

## Step 3: Get Bounce Details

In SendGrid Activity:
1. Click on the email entry
2. Look for "Event Details"
3. Copy the exact error message
4. This will tell you WHY CloudFuze is rejecting it

## Common Error Messages and Solutions

### Error: "550 5.7.1 Service unavailable; Client host blocked"
**Solution:** CloudFuze is blocking SendGrid IPs
- Contact CloudFuze IT team
- Ask them to whitelist SendGrid IP ranges
- SendGrid IPs: https://docs.sendgrid.com/ui/account-and-settings/ip-access-management

### Error: "550 5.7.1 Message rejected due to SPF validation failure"
**Solution:** Need to authenticate sender domain
- Set up SPF/DKIM for cloudfuze.com in SendGrid
- Or use a different sender domain

### Error: "Message filtered as spam"
**Solution:** Email content flagged as spam
- Reduce use of spammy words ("Click here", "Approve now")
- Add more text content
- Use plain text instead of only HTML

### Error: "Recipient's mailbox is full"
**Solution:** User's mailbox is full
- Ask user to clean up mailbox
- Retry sending

## Step 4: Action Based on Bounce Reason

Take screenshot of the bounce reason and share with:
1. CloudFuze IT team (if server is blocking)
2. SendGrid support (if issue with SendGrid)
3. Development team (if need to change email content)

