# Typing Tool

Standalone typing practice and speed-test project developed by Leo (Senior Developer).

## Architecture

- `frontend/` — React + TypeScript UI
- `api/` — Express HTTP API used by the frontend
- `backend/` — reusable typing engine, scoring, text generation and data logic

## Planned features

- 15s / 30s / 60s typing tests
- Live WPM and accuracy
- Mistake highlighting
- Easy / Medium / Hard modes
- Restart / new test
- Personal best and recent results
- Keyboard-first responsive dark UI
- Free-only deployment

## Local development

```bash
npm install
npm run dev
```

Frontend defaults to `http://localhost:5173` and API to `http://localhost:4000`.
