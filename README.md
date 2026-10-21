# PulseCheck

PulseCheck is a full-stack website monitoring application that periodically checks website availability, tracks response times, records check history, and notifies users when a monitored website experiences an outage or recovers.

The application provides a dashboard for managing monitors, reviewing monitoring statistics, and investigating incidents.

## Features

- User authentication with JWT and password hashing
- Create, view, update, pause, resume, and delete website monitors
- Configurable check intervals and request timeouts
- Background monitoring jobs using BullMQ and Redis
- Website availability and response-time tracking
- Dashboard with monitoring statistics and charts
- Historical response-time charts and recent check results
- Uptime statistics for 24-hour, 7-day, and 30-day periods
- Incident tracking with outage and recovery notifications through email
- Monitor-specific details and automatic data refresh

## Technology Stack

**Frontend**
- React
- TypeScript
- Vite
- Recharts
- Axios

**Backend**
- Node.js
- Express
- TypeScript
- JWT authentication
- bcrypt

**Database and Background Processing**
- PostgreSQL
- Redis
- BullMQ

**Development and Infrastructure**
- Docker Compose
- Git and GitHub

## Architecture

PulseCheck separates the frontend, API server, database, and background monitoring worker.

1. The React frontend communicates with the backend through REST APIs.
2. The Express server handles authentication, monitor management, and analytics requests.
3. PostgreSQL stores user accounts, monitor configurations, check results, and incident records.
4. Redis and BullMQ manage scheduled monitoring jobs.
5. A background worker checks configured URLs, records results, updates monitor status, and handles outage and recovery notifications.

## Project Structure

```text
PulseCheck/
├── client/                 # React frontend
├── server/                 # Express backend and worker
│   └── src/
│       ├── db/              # Database connection and schema
│       ├── middleware/      # Authentication middleware
│       ├── routes/          # API routes
│       ├── worker/          # Background monitoring worker
│       ├── emailService.ts  # Email notifications
│       ├── queue.ts         # BullMQ configuration
│       └── index.ts         # Backend entry point
├── docker-compose.yml       # PostgreSQL and Redis services
├── .gitignore
└── README.md
```

## Prerequisites

Install the following before running the application:

- Node.js and npm
- Docker Desktop
- Git

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/PulseCheck.git
cd PulseCheck
```

Replace `YOUR_USERNAME` with your GitHub username.

### 2. Start PostgreSQL and Redis

From the project root, run:

```bash
docker compose up -d
```

Check the container status:

```bash
docker compose ps
```

The provided Docker Compose configuration starts PostgreSQL and Redis for local development.

### 3. Configure environment variables

Create the required environment files for the frontend and backend using the variables expected by each application.

- `client/.env` — frontend configuration, including the API base URL.
- `server/.env` — backend configuration, including database connectivity, authentication secrets, and email settings where required.

Use local development values for local execution. Configure production secrets separately when deploying.

Never commit `.env` files, passwords, API keys, SMTP credentials, or JWT secrets to GitHub.

### 4. Install dependencies

Open a terminal in the frontend directory:

```bash
cd client
npm install
```

Open another terminal in the backend directory:

```bash
cd server
npm install
```

### 5. Run the application

Start the backend and frontend using the development scripts defined in their respective `package.json` files.

Start the background monitoring worker using the worker script configured by the backend project.

The local development endpoints are:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000`

Ensure PostgreSQL and Redis are running and the environment variables are configured before starting the application.

## Monitoring and Analytics

PulseCheck records the results of website checks and presents them through the dashboard and monitor details pages.

The application includes response-time history, recent check results, incident history, and success-rate statistics for different reporting periods.

Uptime statistics are calculated from recorded check results. They represent the success rate of recorded checks and are not a measurement of continuous elapsed-time availability.

## Future Improvements

Potential extensions include:

- Public status pages
- More notification channels
- Advanced monitoring analytics
- Containerized application deployment
- Cloud hosting and production monitoring

## License

No license has been specified yet.
