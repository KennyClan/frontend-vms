# Vista VMS — Frontend

React 18 + Vite + TailwindCSS

## Setup

```bash
cp .env.example .env
# Edit VITE_API_BASE_URL if your backend isn't on localhost:8000

npm install
npm run dev
```

Open: http://localhost:5173

## Notes

- The app requires the backend to be reachable — there is no offline/local
  fallback for staff login or data writes, so failures show a clear error
  instead of silently pretending to succeed.
- The main UI component lives in `src/components/VistaVMS.jsx`.
- `src/services/api.js` contains all Axios calls to the FastAPI backend.
