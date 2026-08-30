# AI-Assisted Collaborative Worldbuilding Platform

This repository contains a minimal MySQL and Express backend for user registration and login, plus a small local login page. It does not include JWT, sessions, AI features, worldbuilding features, a knowledge graph, or collaboration features.

## Prerequisites

- Node.js and npm
- MySQL Server

On macOS with Homebrew, MySQL can be installed and started with:

```bash
brew install node
brew install mysql
brew services start mysql
```

If MySQL is already installed, start it using the method appropriate for your installation.

## 1. Configure environment variables

The repository includes `backend/.env` for local development and `backend/.env.example` as a safe template. Update `backend/.env` with your own MySQL credentials:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_root_password
DB_NAME=worldbuilding
DB_PORT=3306
PORT=3001
```

If the MySQL `root` user has no password in your local development setup, leave `DB_PASSWORD=` empty. The real `.env` file is ignored by Git.

## 2. Create the database and table

From the repository root, run:

```bash
mysql -u root -p < backend/database/schema.sql
```

Enter the MySQL root password when prompted. If the root account has no password, use this instead:

```bash
mysql -u root < backend/database/schema.sql
```

The script safely creates the `worldbuilding` database and `users` table only if they do not already exist.

## 3. Install dependencies and start the backend

```bash
cd backend
npm install
npm start
```

For automatic restarts during development, use:

```bash
npm run dev
```

The backend runs at `http://localhost:3001` by default.

## 4. Test the API

Health check:

```bash
curl http://localhost:3001/health
```

Register a user:

```bash
curl -X POST http://localhost:3001/register \
  -H "Content-Type: application/json" \
  -d '{"username":"Justin","email":"test@example.com","password":"123456"}'
```

Log in:

```bash
curl -X POST http://localhost:3001/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"123456"}'
```

List users (development/testing only):

```bash
curl http://localhost:3001/users
```

The `/users` and successful `/login` responses never include `password_hash`.

## 5. View the login page

Keep the backend running. Open a second terminal and run:

```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:3000` in your browser. The page sends login requests to the backend at `http://localhost:3001/login`.
