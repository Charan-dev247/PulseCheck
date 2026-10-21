# PulseCheck — Website Uptime Monitoring

**PulseCheck** is a full-stack website uptime monitoring application that periodically checks website availability, tracks response times, maintains historical check records, and notifies users when monitored websites experience outages or recover.

It provides a centralized dashboard to manage website monitors, review uptime statistics, visualize response-time trends, and investigate incidents.

**Live Demo:** https://pulse-check-drab.vercel.app/  
**GitHub Repository:** https://github.com/Charan-dev247/PulseCheck

## Features

- **Authentication:** JWT-based authentication with password hashing.
- **Monitor Management:** Create, view, update, pause, resume, and delete website monitors.
- **Configurable Monitoring:** Configure check intervals, request timeouts, expected HTTP status codes, and failure thresholds.
- **Background Job Processing:** Schedule recurring monitoring jobs using BullMQ and Redis.
- **Availability Checks:** Detect website failures and unexpected HTTP responses.
- **Response-Time Tracking:** Record response times and maintain historical check results.
- **Monitoring Dashboard:** View monitor statuses, monitoring statistics, and response-time visualizations.
- **Uptime Analytics:** Review check-based success rates over 24-hour, 7-day, and 30-day periods.
- **Incident Management:** Record outages and track their resolution.
- **Email Notifications:** Send outage and recovery notifications.
- **Monitor Details:** Inspect individual monitors, historical results, and incident information.
- **Automatic Refresh:** Keep monitoring information updated in the dashboard.

## Technology Stack

### Frontend
- React
- TypeScript
- Vite
- Recharts
- Axios

### Backend
- Node.js
- Express.js
- TypeScript
- JSON Web Tokens (JWT)
- bcrypt

### Database and Background Processing
- PostgreSQL
- Redis
- BullMQ

### Development and Infrastructure
- Docker Compose
- Git and GitHub
- Vercel — frontend deployment
- Render — backend API, PostgreSQL, and Redis hosting

## Architecture

PulseCheck uses a frontend–backend architecture with PostgreSQL for persistent storage and Redis with BullMQ for scheduled monitoring jobs.

1. **Frontend:** The React application communicates with the backend through REST APIs.
2. **API server:** Express handles authentication, monitor management, and analytics requests.
3. **Database:** PostgreSQL stores user accounts, monitor configurations, check results, and incident records.
4. **Job queue:** Redis and BullMQ manage recurring monitoring jobs.
5. **Monitoring worker:** The worker processes scheduled jobs, checks configured URLs, records results, updates monitor statuses, and handles outage and recovery notifications.

For the current deployment, the monitoring worker runs in the same Node.js process as the API, avoiding the need for a separate paid background-worker service.

### Architecture Flow

```text
React + Vite Frontend
        |
        | REST API requests
        v
Express + TypeScript API
        |
        +-----------> PostgreSQL
        |              |
        |              +-- Users
        |              +-- Monitors
        |              +-- Check Results
        |              +-- Incidents
        |
        +-----------> Redis + BullMQ
                           |
                           v
                    Monitoring Worker
                           |
                           v
                    Website HTTP Checks
                           |
                           v
                  Results and Status Updates
```

## Project Structure

```text
PulseCheck/
├── client/                  # React frontend
├── server/                  # Express backend and worker
│   └── src/
│       ├── db/               # Database connection and schema
│       ├── middleware/       # Authentication middleware
│       ├── routes/           # API routes
│       ├── worker/           # Background monitoring worker
│       ├── emailService.ts   # Email notifications
│       ├── queue.ts          # BullMQ configuration
│       └── index.ts          # API entry point
├── docker-compose.yml        # Local PostgreSQL and Redis
├── .gitignore
└── README.md
```

## Getting Started

### Prerequisites

Install the following:

- Node.js and npm
- Docker Desktop
- Git

### 1. Clone the repository

```bash
git clone https://github.com/Charan-dev247/PulseCheck.git
cd PulseCheck
```

### 2. Start PostgreSQL and Redis

From the project root, run:

```bash
docker compose up -d
```

Verify that the containers are running:

```bash
docker compose ps
```

The Docker Compose configuration provides PostgreSQL and Redis for local development.

### 3. Configure environment variables

Create the environment files required by the application:

**`server/.env`**

Configure the backend's required environment variables, including:

- `DATABASE_URL` — PostgreSQL connection string.
- `REDIS_URL` — Redis connection string.
- JWT authentication secret.
- Email configuration, if required by the notification service.

**`client/.env`**

Configure the frontend API base URL using the environment variable expected by the client. For the current Vite deployment, this is `VITE_API_URL`.

For local development, configure it to point to the local backend API, including the appropriate API path.

Use the variable names and formats expected by the source code. Never commit `.env` files, passwords, database URLs, email credentials, or authentication secrets to GitHub.

### 4. Install dependencies

Install backend dependencies:

```bash
cd server
npm install
```

Install frontend dependencies in a separate terminal:

```bash
cd client
npm install
```

### 5. Start the application

Start PostgreSQL and Redis first, and ensure the environment variables are configured.

In the backend terminal:

```bash
cd server
npm run dev
```

In another terminal, start the frontend using the development script defined in `client/package.json` (typically `npm run dev`):

```bash
cd client
npm run dev
```

The local development endpoints are:

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:4000 |
| Backend health check | http://localhost:4000/health |

The backend's health endpoint checks database connectivity.

The monitoring worker is started by the backend entry point, so a separate worker process is not required for this configuration.

## Monitoring and Analytics

PulseCheck periodically checks configured websites and stores the results in PostgreSQL.

For each completed check, the application can record information such as:

- Check success or failure
- HTTP status code
- Response time
- Error details
- Check timestamp

The dashboard and monitor details pages use these records to display monitoring status, response-time history, recent checks, uptime statistics, and incident history.

**Uptime calculation:** The reported uptime statistics represent the success rate of recorded checks over the selected reporting period. They are not a direct measurement of continuous elapsed-time availability.

## Deployment

The current production deployment uses:

- **Frontend:** Vercel
- **Backend API and monitoring worker:** Render Web Service
- **Database:** Render PostgreSQL
- **Job queue:** Render Redis / Key Value

Production environment variables are configured through the respective hosting dashboards rather than committed to the repository.

Visit the live application:

**https://pulse-check-drab.vercel.app/**

## Future Improvements

Potential enhancements include:

- Public status pages for monitored services
- Additional notification channels
- Advanced monitoring analytics and anomaly detection
- More comprehensive automated tests
- Improved security and operational observability
- Expanded reporting and export functionality

## License

No license has been specified yet.
