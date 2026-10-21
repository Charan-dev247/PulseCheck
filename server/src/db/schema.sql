
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE monitors (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'GET',
    interval_seconds INT NOT NULL DEFAULT 60,
    timeout_ms INT NOT NULL DEFAULT 5000,
    expected_status INT NOT NULL DEFAULT 200,
    failure_threshold INT NOT NULL DEFAULT 3,
    is_active BOOLEAN NOT NULL DEFAULT true,
    status TEXT NOT NULL DEFAULT 'unknown'
        CHECK (status IN ('up', 'down', 'unknown')),
    consecutive_failures INT NOT NULL DEFAULT 0,
    slug TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE check_results (
    id BIGSERIAL PRIMARY KEY,
    monitor_id INT NOT NULL
        REFERENCES monitors(id) ON DELETE CASCADE,
    success BOOLEAN NOT NULL,
    status_code INT,
    response_ms INT,
    error TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_results_monitor_time
ON check_results(monitor_id, checked_at DESC);

CREATE TABLE incidents (
    id SERIAL PRIMARY KEY,
    monitor_id INT NOT NULL
        REFERENCES monitors(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    reason TEXT
);
