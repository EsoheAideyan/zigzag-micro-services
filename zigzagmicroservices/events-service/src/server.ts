import "./models/associations";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import eventRouter from "./routes/event.route";
import { getAllEvents } from "./controllers/Event";
import sequelize from "./config/database";
import { connectRabbitMQ } from "./rabbitmq/rabbitmq";

//Load DotENV
dotenv.config();
const PORT = process.env.PORT || 3000;


//Express
const app = express();
// Middleware
app.use(cors());
//The express.json middleware is important for parsing incoming
// JSON payloads and making that data available in the req.body
app.use(express.json());

// Explicit route for short path (gateway may proxy as GET /getAllEvents)
//app.get("/getAllEvents", getAllEvents);

app.use("/api/v1/events", eventRouter);



//Rabbit MQ for message queue
//connectRabbitMQ()

// Start Server
sequelize
  .sync()
  .then(() => {
    console.log("✅ Database synced");
    app.listen(PORT, () => {
      console.log(`🚀 Event Service running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to connect to database:", err);
  });