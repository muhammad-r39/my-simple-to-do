# Simple Todo + Note

A clean, lightweight Chrome extension for managing tasks and notes. Built with Manifest V3, no frameworks, and no external libraries.

## Highlights

- Popup with two tabs: Todo and Note
- Smart urgency-based auto sorting
- Optional manual drag ordering for active tasks
- Time-aware status and color coding
- Optional floating widget (draggable, collapsible)
- Local-only storage with `chrome.storage.local`

## Todo Features

- Add/edit tasks with separate date and time inputs
- Target date or time is required
  - Time only = today
  - Date only = end of day
- Status logic:
  - Upcoming: start time is in the future
  - Active: within start and deadline
  - Overdue: deadline passed
- Color rules:
  - Upcoming = blue
  - Overdue = red
  - Active = green/yellow/orange based on progress
- Drag and drop for active tasks only
- Completed tasks are hidden by default
- Completed tasks auto-delete after 7 days

## Notes Features

- Fast text-only notes
- Add, edit, delete
- No sorting or completion logic

## Floating Widget

- Toggle from the popup footer
- Draggable and collapsible
- Notes/Todo switch inside the widget
- Shows only active/overdue todos (no upcoming or completed)
- Notes view shows all notes

## Privacy

This extension:
- Does not collect or transmit any data
- Does not track usage
- Stores all data locally on your device only

## Permissions

- `storage` — required to save todos, notes, and settings

## Install (Unpacked)

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the folder: `my-simple-to-do`

## Folder Structure

```
my-simple-to-do/
  manifest.json
  popup.html
  popup.css
  popup.js
  contentScript.js
  icons/
    icon16.png
    icon48.png
    icon128.png
```

## Notes for Contributors

- No external dependencies
- Time-based logic is evaluated on render (no polling)
- Keep UI and logic separated where possible

## License

Private project. All rights reserved unless otherwise stated.
