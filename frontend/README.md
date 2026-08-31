# Worldbuilding frontend

This is a small local login page for the worldbuilding backend.

The page sends login details to:

```text
POST http://localhost:3001/login
```

## Start locally

Start the backend first in one terminal:

```bash
cd backend
npm install
npm start
```

Then start the frontend in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` in a browser.
