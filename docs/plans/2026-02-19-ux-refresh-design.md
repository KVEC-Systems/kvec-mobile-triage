# UX Refresh Design: Clean Clinical Theme

**Date:** 2026-02-19
**Goal:** Transform the app from dark hacker aesthetic to clean clinical light theme that inspires trust.

## Color System

| Role | Old | New |
|------|-----|-----|
| Background | #0f172a | #F8FAFC |
| Cards | #1e293b | #FFFFFF |
| Primary | #6366f1 | #2563EB |
| Success | #059669 | #059669 |
| Triage | #d97706 | #D97706 |
| Danger | #ef4444 | #EF4444 |
| Text primary | #f1f5f9 | #1E293B |
| Text secondary | #94a3b8 | #64748B |
| Borders | #334155 | #E2E8F0 |
| Header bg | #1e293b | #FFFFFF |
| Input bg | #1e293b | #F1F5F9 |
| StatusBar | light | dark |

## Files to Change

1. `app.json` — userInterfaceStyle: "light"
2. `app/_layout.tsx` — StatusBar style dark
3. `app/index.tsx` — all styles
4. `app/chat.tsx` — all styles
5. `app/history.tsx` — all styles
6. `app/settings.tsx` — all styles
7. `app/download.tsx` — all styles
8. `components/HamburgerMenu.tsx` — all styles

## Design Tokens

```
bg-primary:    #F8FAFC
bg-card:       #FFFFFF
bg-input:      #F1F5F9
border:        #E2E8F0
text-primary:  #1E293B
text-secondary:#64748B
text-muted:    #94A3B8
blue-600:      #2563EB
blue-50:       #EFF6FF
emerald-600:   #059669
emerald-50:    #ECFDF5
amber-600:     #D97706
amber-50:      #FFFBEB
red-500:       #EF4444
```
