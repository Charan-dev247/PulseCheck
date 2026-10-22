
import "dotenv/config";
import app from "./app";
import "./worker";

const PORT = Number(process.env.PORT) || 4000;

app.listen(PORT, () => {
  console.log(`PulseCheck API running on port ${PORT}`);
});
