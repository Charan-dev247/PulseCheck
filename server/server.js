
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Welcome to PulseCheck API",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "PulseCheck",
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`PulseCheck API running on port ${PORT}`);
});
