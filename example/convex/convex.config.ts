import { defineApp } from "convex/server";
import telegram from "convex-telegram/convex.config.js";

const app = defineApp();
app.use(telegram);

export default app;
