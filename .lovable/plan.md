
# All-in-One Business Outreach CRM - Comprehensive Upgrade Plan

## Overview

Transform your current Lead Finder into a complete outreach management system with multi-stage communication tracking, customizable templates, enhanced search capabilities, and streamlined workflow management.

---

## Your Outreach Workflow (Now Built-In)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. INITIAL TEXT          2. VOICE NOTE + VIDEO       3. FOLLOW-UP          │
│  "Are you taking on       Send pitch +                "Did you get my       │
│   work?"                  website example              voice note?"          │
│        │                        │                           │               │
│        ▼                        ▼                           ▼               │
│   Wait for reply ──────► If reply ──────────────► Wait for reply            │
│        │                                                    │               │
│        │ No reply after 3 days                              │               │
│        ▼                                                    ▼               │
│   Auto-remove from pipeline ◄──────────────────── Remove if no reply       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Features to Implement

### 1. Enhanced Status System (Matches Your Workflow)

**New lead statuses to add:**
- `sent_initial_text` - First text sent, awaiting reply
- `replied` - Business has responded (ready for voice note)
- `sent_voice_note` - Pitch sent with video example
- `awaiting_decision` - Waiting for yes/no after pitch

**Updated next actions:**
- `send_initial_text` - First contact
- `send_voice_note` - After they reply
- `send_follow_up` - Day after voice note
- `check_3_day_removal` - Auto-removal check

### 2. Templates System (Text Messages + Voice Note Scripts)

**New database tables:**
- `templates` - Stores customizable message/script templates

**Template types:**
- **Text Templates**: Initial text, follow-up text, various scenarios
- **Voice Note Scripts**: No website pitch, poor website pitch, website coming soon pitch

**Features:**
- Quick-copy buttons for each template
- Editable inline from the app
- Multiple templates per category

### 3. Search Capability Enhancement

**Current limitation:** Capped at ~60 results (Google API pagination limit of 3 pages x 20 results)

**The reality:** This is a Google Places API constraint. To get more leads, the solution is:
- **Multiple smaller radius searches** - Search the same area with overlapping smaller radii
- **Grid-based searching** - Split a large area into a grid of smaller search zones
- Add a "Deep Search" mode that automatically performs multiple overlapping searches

### 4. Unified Dashboard & Navigation

**New sidebar navigation:**
- Dashboard (overview stats, today's actions)
- Find Leads (current search page)
- Outreach CRM (pipeline management)
- Templates (text messages + voice scripts)

**Dashboard metrics:**
- Leads to contact today
- Awaiting replies
- Follow-ups due
- 3-day removal candidates

### 5. Quick Actions from CRM Table

**One-click actions:**
- "Copy initial text" - Copies template to clipboard
- "Copy follow-up" - Copies follow-up template
- "Mark text sent" - Updates status automatically
- "Mark voice note sent"
- Phone number click → Opens dialer/messaging app

---

## Technical Implementation Plan

### Phase 1: Database Schema Updates

**Add new enum values:**
```sql
-- Extend lead_status enum
ALTER TYPE lead_status ADD VALUE 'sent_initial_text';
ALTER TYPE lead_status ADD VALUE 'replied';
ALTER TYPE lead_status ADD VALUE 'sent_voice_note';
ALTER TYPE lead_status ADD VALUE 'awaiting_decision';

-- Extend next_action_type enum  
ALTER TYPE next_action_type ADD VALUE 'send_initial_text';
ALTER TYPE next_action_type ADD VALUE 'send_voice_note';
ALTER TYPE next_action_type ADD VALUE 'send_follow_up';
ALTER TYPE next_action_type ADD VALUE 'check_3_day_removal';
```

**Create templates table:**
```sql
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  template_type TEXT NOT NULL, -- 'text' or 'voice_script'
  category TEXT NOT NULL, -- 'initial', 'follow_up', 'no_website', 'poor_website', etc.
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Phase 2: UI Components

**New components to create:**
- `src/pages/Dashboard.tsx` - Overview with today's actions
- `src/pages/Templates.tsx` - Template management page
- `src/components/TemplateEditor.tsx` - Create/edit templates
- `src/components/QuickActions.tsx` - One-click workflow buttons
- `src/components/DashboardStats.tsx` - Metrics cards
- `src/components/AppSidebar.tsx` - Navigation sidebar

**Update existing components:**
- `OutreachTable.tsx` - Add quick action buttons
- `OutreachLeadDialog.tsx` - Show workflow stage, template buttons
- `types/outreach.ts` - Add new status/action types

### Phase 3: Enhanced Search (Deep Search Mode)

**Modify `search-leads` edge function:**
- Add `deepSearch` parameter
- Implement grid-based multi-point searching
- Deduplicate results across overlapping searches
- Return combined results (potentially 200+ leads)

**UI updates:**
- Add "Deep Search" toggle in SearchForm
- Show progress indicator for multi-point searches
- Display total search coverage area

### Phase 4: Workflow Automation Helpers

**Auto-suggestions:**
- When status changes to `replied` → Suggest "Send voice note"
- When `sent_voice_note` → Set next action to "Follow up" for tomorrow
- When 3+ days since last action with no reply → Highlight for removal

**Default templates:**
```
Initial Text: "Hi, are you taking on work?"
Follow-up Text: "Did you get my voice note?"
Voice Script (No Website): "Hi, I noticed you don't have a website..."
Voice Script (Poor Website): "Hi, I was looking at your current website..."
Voice Script (Coming Soon): "Hi, I saw your website says coming soon..."
```

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `src/pages/Dashboard.tsx` | Main dashboard with stats and today's actions |
| `src/pages/Templates.tsx` | Template management interface |
| `src/components/AppSidebar.tsx` | App-wide navigation |
| `src/components/TemplateEditor.tsx` | Create/edit template forms |
| `src/components/QuickActions.tsx` | One-click workflow buttons |
| `src/components/DashboardStats.tsx` | Metric cards |
| `src/hooks/useTemplates.ts` | Template CRUD operations |

### Modified Files
| File | Changes |
|------|---------|
| `src/App.tsx` | Add sidebar layout, new routes |
| `src/types/outreach.ts` | Add new status/action types |
| `src/components/OutreachTable.tsx` | Add quick action buttons |
| `src/components/OutreachLeadDialog.tsx` | Show templates, workflow stage |
| `supabase/functions/search-leads/index.ts` | Add deep search capability |

### Database Migrations
| Migration | Purpose |
|-----------|---------|
| Extend enums | Add new status and action values |
| Create `templates` table | Store user templates |

---

## Additional Suggested Features

1. **Bulk status updates** - Select multiple leads, update status at once
2. **Daily digest view** - "Today's tasks" filtered list
3. **Time tracking** - When was last contact made
4. **Notes with timestamps** - Communication log per lead
5. **Import from CSV** - Bulk add leads from external sources
6. **Keyboard shortcuts** - Quick navigation and actions
7. **Mobile-optimized view** - Easy to use on phone while calling
8. **Export communication history** - Full audit trail per lead

---

## Search Limitation Explanation

The current 60-result cap is due to **Google Places API limitations**, not the app itself:
- Google returns max 20 results per request
- Only provides 3 pages of results (via `next_page_token`)
- 20 x 3 = 60 maximum results per search location

**Deep Search solution:**
- Divide search area into a grid
- Run searches at multiple center points
- Merge and deduplicate results
- Can return 200+ unique leads for a large area

This is a common pattern used by professional lead generation tools to work around API limitations.

