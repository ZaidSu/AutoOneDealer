# Auto One Email System

Starter UI for the Auto One Motors email management system.

## Current features
- Dealer login screen
- Dashboard
- Inbox with sample customer emails
- Search and status filtering
- AI reply mock generator
- Analytics screen
- Settings / automation screen

## Folder structure

```text
auto-one-email-system/
├── index.html
├── style.css
├── script.js
├── dashboard/
│   ├── dashboard.html
│   ├── dashboard.css
│   └── dashboard.js
├── inbox/
│   ├── inbox.html
│   ├── inbox.css
│   └── inbox.js
├── analytics/
│   ├── analytics.html
│   ├── analytics.css
│   └── analytics.js
└── settings/
    ├── settings.html
    ├── settings.css
    └── settings.js
```

## Important
This first version uses sample email data only. Gmail OAuth/API is not connected yet.

Next development step:
1. Create Google Cloud OAuth credentials.
2. Add a secure backend endpoint.
3. Fetch Gmail messages.
4. Replace the mock `emails` array in `inbox/inbox.js` with API data.
